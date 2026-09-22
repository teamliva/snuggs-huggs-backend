import { Router } from "express";
import rateLimit from "express-rate-limit";

import { Lead } from "../models/Lead.js";
import { Testimonial } from "../models/Testimonial.js";
import { Credential } from "../models/Credential.js";
import { AdminUser } from "../models/AdminUser.js";

import { asyncHandler, HttpError } from "../middleware/errors.js";
import { issueSession, clearSession, requireAdmin, requirePermission } from "../middleware/auth.js";
import { sendLeadNotification } from "../services/mailer.js";
import {
  parseOrThrow,
  leadCreateSchema,
  leadUpdateSchema,
  loginSchema,
  testimonialSchema,
  credentialSchema,
} from "../validation.js";

export const api = Router();

/* ------------------------------------------------------------------ *
 * Public
 * ------------------------------------------------------------------ */

// Generous enough that a family filling the form twice is fine, tight
// enough that a script can't flood the inbox.
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please call us instead." },
});

api.post(
  "/leads",
  leadLimiter,
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(leadCreateSchema, req.body);

    // Honeypot filled => bot. Respond 201 so the bot sees success and
    // doesn't retry with a different strategy; nothing is stored.
    if (data.company) {
      return res.status(201).json({ ok: true });
    }
    delete data.company;

    const lead = await Lead.create({
      ...data,
      meta: {
        ip: req.ip,
        userAgent: req.get("user-agent")?.slice(0, 400),
        source: "website",
      },
    });

    // Deliberately awaited but non-fatal: see mailer.js.
    const mail = await sendLeadNotification(lead);

    res.status(201).json({
      ok: true,
      id: lead._id,
      notified: mail.sent,
    });
  })
);

// Published content for the website to render. No auth, no internal fields.
api.get(
  "/testimonials",
  asyncHandler(async (_req, res) => {
    const items = await Testimonial.find({ published: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .select("quote name relation rating")
      .lean();
    res.json({ items });
  })
);

api.get(
  "/credentials",
  asyncHandler(async (_req, res) => {
    const items = await Credential.find({ published: true })
      .sort({ sortOrder: 1 })
      .select("icon label detail")
      .lean();
    res.json({ items });
  })
);

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again shortly." },
});

api.post(
  "/auth/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parseOrThrow(loginSchema, req.body);

    // passwordHash is select:false, so ask for it explicitly.
    const admin = await AdminUser.findOne({ email }).select("+passwordHash");

    // Same message and timing shape whether the account is missing or the
    // password is wrong — otherwise the response tells an attacker which
    // email addresses exist.
    const ok = admin ? await admin.verifyPassword(password) : false;
    if (!ok) throw new HttpError(401, "Email or password is incorrect");

    admin.lastLoginAt = new Date();
    await admin.save();

    issueSession(res, admin);
    res.json({ ok: true, admin: { email: admin.email, name: admin.name } });
  })
);

api.post("/auth/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

api.get("/auth/me", requireAdmin, (req, res) => {
  res.json({ admin: { email: req.admin.email, name: req.admin.name } });
});

/* ------------------------------------------------------------------ *
 * Admin — everything below requires a session
 * ------------------------------------------------------------------ */

api.use(requireAdmin);

api.get(
  "/admin/leads",
  requirePermission("leads.manage"),
  asyncHandler(async (req, res) => {
    const { status, page = "1", limit = "25" } = req.query;
    const filter = status ? { status } : {};
    const perPage = Math.min(Number(limit) || 25, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * perPage;

    const [items, total] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      Lead.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page) || 1, perPage });
  })
);

api.get(
  "/admin/leads/:id",
  requirePermission("leads.manage"),
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id).lean();
    if (!lead) throw new HttpError(404, "Lead not found");
    res.json({ lead });
  })
);

api.patch(
  "/admin/leads/:id",
  requirePermission("leads.manage"),
  asyncHandler(async (req, res) => {
    const update = parseOrThrow(leadUpdateSchema, req.body);
    const lead = await Lead.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!lead) throw new HttpError(404, "Lead not found");
    res.json({ lead });
  })
);

api.delete(
  "/admin/leads/:id",
  requirePermission("leads.manage"),
  asyncHandler(async (req, res) => {
    const deleted = await Lead.findByIdAndDelete(req.params.id);
    if (!deleted) throw new HttpError(404, "Lead not found");
    res.json({ ok: true });
  })
);

/** Generates matching CRUD routes for the two content collections. */
function contentRoutes(path, Model, schema) {
  api.get(
    `/admin/${path}`,
    requirePermission("content.manage"),
    asyncHandler(async (_req, res) => {
      const items = await Model.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
      res.json({ items });
    })
  );

  api.post(
    `/admin/${path}`,
    requirePermission("content.manage"),
    asyncHandler(async (req, res) => {
      const doc = await Model.create(parseOrThrow(schema, req.body));
      res.status(201).json({ item: doc });
    })
  );

  api.patch(
    `/admin/${path}/:id`,
    requirePermission("content.manage"),
    asyncHandler(async (req, res) => {
      const data = parseOrThrow(schema.partial(), req.body);
      const item = await Model.findByIdAndUpdate(req.params.id, data, {
        new: true,
        runValidators: true,
      }).lean();
      if (!item) throw new HttpError(404, "Not found");
      res.json({ item });
    })
  );

  api.delete(
    `/admin/${path}/:id`,
    requirePermission("content.manage"),
    asyncHandler(async (req, res) => {
      const deleted = await Model.findByIdAndDelete(req.params.id);
      if (!deleted) throw new HttpError(404, "Not found");
      res.json({ ok: true });
    })
  );
}

contentRoutes("testimonials", Testimonial, testimonialSchema);
contentRoutes("credentials", Credential, credentialSchema);
