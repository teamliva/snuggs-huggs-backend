import jwt from "jsonwebtoken";
import { env, isProd } from "../config/env.js";
import { AdminUser } from "../models/AdminUser.js";
import { can } from "../auth/permissions.js";

export const SESSION_COOKIE = "sh_admin";

export function issueSession(res, admin) {
  const token = jwt.sign({ sub: admin._id.toString(), aud: "admin" }, env.JWT_SECRET, {
    expiresIn: `${env.SESSION_HOURS}h`,
  });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // not readable by page JS, so XSS can't lift the session
    sameSite: "lax", // blocks the cookie on cross-site POSTs (CSRF defence)
    secure: isProd, // HTTPS-only in production
    maxAge: env.SESSION_HOURS * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

function readToken(req) {
  if (req.cookies?.[SESSION_COOKIE]) return req.cookies[SESSION_COOKIE];
  // Bearer token support, so the API is usable from a separate admin
  // client later without relying on cookies.
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/**
 * Attaches req.admin ({ id, email, name, role }) when a valid session
 * exists; never rejects.
 *
 * The token only carries the account id. Role and existence are read from
 * the database on every request, so demoting or deleting an account takes
 * effect immediately rather than when a 12-hour token expires.
 */
export async function loadAdmin(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    // Tokens minted for other purposes (e.g. post previews) share the
    // secret, so the audience check stops one being used as a session.
    if (payload.aud && payload.aud !== "admin") return next();
    const user = await AdminUser.findById(payload.sub).select("email name role").lean();
    if (user) {
      req.admin = {
        id: String(user._id),
        sub: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role || "admin",
      };
    }
  } catch {
    // Expired or tampered — treated as signed out.
  }
  next();
}

/** Rejects API requests that have no valid session. */
export function requireAdmin(req, res, next) {
  if (req.admin) return next();
  res.status(401).json({ error: "Authentication required" });
}

/** Same, but redirects browsers to the login page instead of returning JSON. */
export function requireAdminPage(req, res, next) {
  if (req.admin) return next();
  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}

/** JSON guard for a permission from auth/permissions.js. */
export const requirePermission = (action) => (req, res, next) => {
  if (!req.admin) return res.status(401).json({ error: "Authentication required" });
  if (can(req.admin, action)) return next();
  res.status(403).json({ error: "You don't have permission to do that" });
};

/** Page guard for a permission; renders a plain 403 for browsers. */
export const requirePermissionPage = (action) => (req, res, next) => {
  if (!req.admin) return requireAdminPage(req, res, next);
  if (can(req.admin, action)) return next();
  res.status(403).render("forbidden", { title: "Not allowed", active: "", admin: req.admin });
};

/**
 * Defence in depth against CSRF on state-changing admin requests. SameSite
 * =Lax already keeps the session cookie off cross-site POSTs; this also
 * rejects any mutating request whose Origin header names a foreign site.
 */
export function sameOriginWrites(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next(); // same-origin form posts from older browsers, curl
  const host = req.get("host");
  let ok = false;
  try {
    ok = new URL(origin).host === host || env.CORS_ORIGINS.includes(origin);
  } catch {
    ok = false;
  }
  if (ok) return next();
  res.status(403).json({ error: "Cross-site request rejected" });
}
