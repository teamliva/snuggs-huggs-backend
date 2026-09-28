import "dotenv/config";
import { z } from "zod";

/**
 * Environment is validated once, at boot. A missing JWT secret or database
 * URI should stop the process immediately with a clear message — not
 * surface later as an auth bug or a silent connection failure.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required (see .env.example)"),

  // Signs admin session cookies. Must be long and random — anyone who has
  // it can mint a valid admin session.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  SESSION_HOURS: z.coerce.number().int().positive().default(12),

  // Browser origins allowed to call the public API. Comma-separated.
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),

  // Email notification on a new lead. Entirely optional — if SMTP_HOST is
  // unset the app logs the lead instead of failing. Losing the notification
  // must never lose the lead itself.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  MAIL_TO: z.string().optional(),

  // ── Blog ───────────────────────────────────────────────────────────
  // Canonical public origin of the website. Used to build canonical URLs,
  // absolute og:image URLs, and to tell internal links from external ones.
  PUBLIC_SITE_URL: z
    .string()
    .url()
    .default("https://snuggsandhuggsseniorservices.com")
    .transform((v) => v.replace(/\/+$/, "")),

  // Where the Next.js frontend runs. Used for preview links and for the
  // on-publish cache refresh. Unset = no instant refresh (pages still
  // update on their normal revalidation timer).
  FRONTEND_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((v) => v.replace(/\/+$/, "")),

  // Shared secret for POST {FRONTEND_URL}/api/revalidate. Must match the
  // frontend's REVALIDATE_SECRET. Optional.
  REVALIDATE_SECRET: z.string().min(16).optional(),

  // Where uploaded images are stored on disk when BLOB_READ_WRITE_TOKEN
  // (below) isn't set — local dev only, since Vercel's filesystem doesn't
  // persist across invocations.
  UPLOAD_DIR: z.string().default("uploads"),
  UPLOAD_MAX_MB: z.coerce.number().positive().max(25).default(5),

  // Vercel Blob store token. Set automatically when Blob storage is
  // enabled on the Vercel project; unset in local dev, where uploads fall
  // back to local disk instead.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // Optional AI-assisted SEO suggestions. Without a key the editor uses
  // the built-in heuristics, so nothing depends on this. The key is read
  // server-side only and never sent to the browser.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5"),
});

// Vercel's dashboard sends a variable you left blank as "" rather than
// omitting it, which isn't the same thing to zod: .optional()/.default()
// only kick in for undefined, so an empty string still fails .positive(),
// .enum(...), .url() etc. This bit PORT, then SMTP_PORT and SMTP_SECURE —
// rather than special-casing each field as it comes up, treat every blank
// value as unset before validating.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v])
);

const parsed = schema.safeParse(rawEnv);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  console.error("Copy backend/.env.example to backend/.env and fill it in.\n");
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const blobEnabled = Boolean(env.BLOB_READ_WRITE_TOKEN);
export const mailEnabled = Boolean(env.SMTP_HOST && env.MAIL_TO);
export const aiEnabled = Boolean(env.ANTHROPIC_API_KEY);
