import { isProd } from "../config/env.js";

/** Thrown deliberately by route handlers for expected failures. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Wraps an async handler so a rejected promise reaches Express's error
 * pipeline. Express 4 does not forward async rejections on its own — without
 * this, a failed await hangs the request until it times out.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res) {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.status(404).send("Not found");
}

// eslint-disable-next-line no-unused-vars -- Express identifies the error
// handler by its four-argument signature; `next` must stay.
export function errorHandler(err, req, res, next) {
  const status = err.status || (err.name === "ValidationError" ? 400 : 500);

  if (status >= 500) {
    console.error("Unhandled error:", err);
  }

  // Mongoose duplicate key — surfaces as a readable conflict rather than a
  // 500 with a driver error code.
  if (err.code === 11000) {
    return res.status(409).json({ error: "That record already exists" });
  }

  const body = {
    error: status >= 500 && isProd ? "Something went wrong" : err.message,
  };
  if (err.details) body.details = err.details;
  // Stack traces are useful locally and a disclosure risk in production.
  if (!isProd && status >= 500) body.stack = err.stack;

  res.status(status).json(body);
}
