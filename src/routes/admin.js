import { Router } from "express";
import rateLimit from "express-rate-limit";

import { Lead } from "../models/Lead.js";
import { Testimonial } from "../models/Testimonial.js";
import { Credential } from "../models/Credential.js";
import { AdminUser } from "../models/AdminUser.js";

import { asyncHandler } from "../middleware/errors.js";
import { issueSession, clearSession, requireAdminPage, requirePermissionPage, sameOriginWrites } from "../middleware/auth.js";
import { can } from "../auth/permissions.js";
import { loginSchema, testimonialSchema, credentialSchema } from "../validation.js";

export const admin = Router();

const STATUSES = ["new", "contacted", "consultation_booked", "closed", "spam"];

/* ---------------------------------------------------------------- *
 * Login
 * ---------------------------------------------------------------- */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render("login", {
      title: "Sign in",
      error: "Too many attempts. Please wait a few minutes.",
      email: "",
      next: req.query.next || "/admin",
    }),
});

admin.get("/login", (req, res) => {
  if (req.admin) return res.redirect("/admin");
  res.render("login", {
    title: "Sign in",
    error: null,
    email: "",
    next: req.query.next || "/admin",
  });
});

admin.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const target = req.body.next || "/admin";
    const parsed = loginSchema.safeParse(req.body);

    const fail = (msg) =>
      res.status(401).render("login", {
        title: "Sign in",
        error: msg,
        email: req.body.email || "",
        next: target,
      });

    if (!parsed.success) return fail("Enter a valid email and password");

    const user = await AdminUser.findOne({ email: parsed.data.email }).select("+passwordHash");
    const ok = user ? await user.verifyPassword(parsed.data.password) : false;
    if (!ok) return fail("Email or password is incorrect");

    user.lastLoginAt = new Date();
    await user.save();
    issueSession(res, user);

    // Only allow same-site relative redirects — an absolute URL here would
    // be an open redirect straight after a successful login.
    res.redirect(target.startsWith("/") && !target.startsWith("//") ? target : "/admin");
  })
);

admin.post("/logout", (_req, res) => {
  clearSession(res);
  res.redirect("/admin/login");
});

/* ---------------------------------------------------------------- *
 * Everything below requires a session
 * ---------------------------------------------------------------- */

admin.use(requireAdminPage, sameOriginWrites);

// Enquiries hold clients' personal details, so only admins see them.
// Other roles land on the blog instead of a 403.
const leadsGuard = requirePermissionPage("leads.manage");
const contentGuard = requirePermissionPage("content.manage");

admin.get(
  "/",
  (req, res, next) => (can(req.admin, "leads.manage") ? next() : res.redirect("/admin/blog")),
  asyncHandler(async (req, res) => {
    const status = STATUSES.includes(req.query.status) ? req.query.status : null;
    const filter = status ? { status } : {};

    const [leads, counts] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
      Lead.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);

    const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    const total = counts.reduce((sum, c) => sum + c.n, 0);

    res.render("leads", {
      title: "Enquiries",
      active: "leads",
      leads,
      byStatus,
      total,
      status,
      statuses: STATUSES,
      admin: req.admin,
      flash: req.query.saved ? "Saved." : null,
    });
  })
);

admin.get(
  "/leads/:id",
  leadsGuard,
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id).lean();
    if (!lead) return res.status(404).send("Lead not found");
    res.render("lead", {
      title: lead.name,
      active: "leads",
      lead,
      statuses: STATUSES,
      admin: req.admin,
    });
  })
);

admin.post(
  "/leads/:id",
  leadsGuard,
  asyncHandler(async (req, res) => {
    const update = {};
    if (STATUSES.includes(req.body.status)) update.status = req.body.status;
    if (typeof req.body.notes === "string") update.notes = req.body.notes.slice(0, 4000);
    await Lead.findByIdAndUpdate(req.params.id, update);
    res.redirect(`/admin/leads/${req.params.id}`);
  })
);

admin.post(
  "/leads/:id/delete",
  leadsGuard,
  asyncHandler(async (req, res) => {
    await Lead.findByIdAndDelete(req.params.id);
    res.redirect("/admin?saved=1");
  })
);

/* ---------------------------------------------------------------- *
 * Content: testimonials and credentials share one shape
 * ---------------------------------------------------------------- */

function contentPages({ path, Model, schema, view, title }) {
  admin.get(
    `/${path}`,
    contentGuard,
    asyncHandler(async (req, res) => {
      const items = await Model.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
      res.render(view, {
        title,
        active: path,
        items,
        admin: req.admin,
        error: req.query.error || null,
        flash: req.query.saved ? "Saved." : null,
      });
    })
  );

  admin.post(
    `/${path}`,
    contentGuard,
    asyncHandler(async (req, res) => {
      // Unchecked HTML checkboxes submit nothing at all, so absence has to
      // be read as false rather than left undefined.
      const body = {
        ...req.body,
        published: req.body.published === "on",
        consentOnFile: req.body.consentOnFile === "on",
      };
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || "Invalid input";
        return res.redirect(`/admin/${path}?error=${encodeURIComponent(msg)}`);
      }
      await Model.create(parsed.data);
      res.redirect(`/admin/${path}?saved=1`);
    })
  );

  admin.post(
    `/${path}/:id/toggle`,
    contentGuard,
    asyncHandler(async (req, res) => {
      const item = await Model.findById(req.params.id);
      if (item) {
        item.published = !item.published;
        await item.save();
      }
      res.redirect(`/admin/${path}?saved=1`);
    })
  );

  admin.post(
    `/${path}/:id/delete`,
    contentGuard,
    asyncHandler(async (req, res) => {
      await Model.findByIdAndDelete(req.params.id);
      res.redirect(`/admin/${path}?saved=1`);
    })
  );
}

contentPages({
  path: "testimonials",
  Model: Testimonial,
  schema: testimonialSchema,
  view: "testimonials",
  title: "Testimonials",
});

contentPages({
  path: "credentials",
  Model: Credential,
  schema: credentialSchema,
  view: "credentials",
  title: "Credentials",
});
