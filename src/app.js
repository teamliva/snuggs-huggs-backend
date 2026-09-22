import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

import { env, isProd } from "./config/env.js";
import { loadAdmin } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { can } from "./auth/permissions.js";
import { api } from "./routes/api.js";
import { admin } from "./routes/admin.js";
import { blogPublic } from "./routes/blogPublic.js";
import { blogAdminApi } from "./routes/blogAdminApi.js";
import { blogAdmin } from "./routes/blogAdmin.js";
import { UPLOAD_ROOT } from "./blog/media.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const EASYMDE_DIST = path.dirname(require.resolve("easymde/dist/easymde.min.js"));

export function createApp() {
  const app = express();

  // Behind a reverse proxy (Vercel, Render, Nginx) req.ip would otherwise
  // be the proxy's address, which would rate-limit every visitor as one.
  if (isProd) app.set("trust proxy", 1);

  app.set("view engine", "ejs");
  app.set("views", path.join(dirname, "views"));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // The admin pages use a small amount of inline CSS/JS and no
          // external origins at all — the Markdown editor is served from
          // this origin too, so nothing loads from a CDN.
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      // Uploaded images are fetched by the frontend's image optimizer
      // (server-side) and shown in the admin (same origin), so same-origin
      // is enough and stops other sites hotlinking them from the browser.
      crossOriginResourcePolicy: { policy: "same-origin" },
    })
  );

  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin and non-browser callers (curl, server-side fetch)
        // send no Origin header.
        if (!origin) return cb(null, true);
        cb(null, env.CORS_ORIGINS.includes(origin));
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(loadAdmin);

  // Lets every view ask "can this user do X?" to show or hide controls.
  // Cosmetic only — each route enforces the same check server-side.
  app.use((req, res, next) => {
    res.locals.can = (action) => can(req.admin, action);
    next();
  });

  app.get("/health", (_req, res) =>
    res.json({ ok: true, env: env.NODE_ENV, uptime: Math.round(process.uptime()) })
  );

  /* ---------- Static ---------- */

  app.use(
    "/uploads",
    express.static(UPLOAD_ROOT, {
      maxAge: "365d",
      immutable: true, // filenames are random and never reused
      index: false,
      dotfiles: "deny",
      setHeaders: (res) => {
        res.set("X-Content-Type-Options", "nosniff");
        res.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'none'");
      },
    })
  );
  app.use("/admin/assets", express.static(path.join(dirname, "public", "admin"), { maxAge: "1h" }));
  app.use("/admin/vendor/easymde", express.static(EASYMDE_DIST, { maxAge: "7d" }));

  /* ---------- Blog (own body parsers, sized for long articles) ---------- */

  // Mounted before the global 64kb parsers below: a body parser that runs
  // first consumes the stream, so a long article would hit a 413 before
  // these routers' 1mb parsers ever saw it.
  app.use("/api/blog", blogPublic);
  app.use("/api/admin/blog", blogAdminApi);
  app.use("/admin", blogAdmin);

  /* ---------- Everything else ---------- */

  // Bounded so a large body can't be used to exhaust memory.
  app.use(express.json({ limit: "64kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  app.use("/api", api);
  app.use("/admin", admin);
  app.get("/", (_req, res) => res.redirect("/admin"));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
