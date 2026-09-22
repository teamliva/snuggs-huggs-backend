import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { imageSize } from "image-size";

import { env } from "../config/env.js";
import { Media } from "../models/blog.js";
import { HttpError } from "../middleware/errors.js";

/**
 * Image uploads.
 *
 * Trust nothing the client says about a file. The browser-supplied MIME
 * type and filename are ignored; the type is decided by the file's actual
 * leading bytes, the stored name is random, and only raster formats are
 * accepted. SVG is deliberately excluded: it can carry script and would be
 * served from the same origin as the admin.
 */

export const UPLOAD_ROOT = path.resolve(env.UPLOAD_DIR);

const SIGNATURES = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/gif", ext: "gif", test: (b) => b.subarray(0, 6).toString("ascii").startsWith("GIF8") },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "image/avif", ext: "avif", test: (b) => b.subarray(4, 12).toString("ascii").startsWith("ftypavi") },
];

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024, files: 1, fields: 5 },
}).single("file");

/** Wraps multer so its errors become clean 400s instead of 500s. */
export function handleUpload(req, res) {
  return new Promise((resolve, reject) =>
    uploadMiddleware(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === "LIMIT_FILE_SIZE") {
        return reject(new HttpError(400, `Image is larger than ${env.UPLOAD_MAX_MB} MB`));
      }
      reject(new HttpError(400, err.message || "Upload failed"));
    })
  );
}

/**
 * @param {Express.Multer.File} file
 * @param {{ alt?: string, userId?: string }} meta
 */
export async function storeImage(file, { alt = "", userId } = {}) {
  if (!file?.buffer?.length) throw new HttpError(400, "No image received");

  const kind = SIGNATURES.find((s) => s.test(file.buffer));
  if (!kind) throw new HttpError(400, "Unsupported file. Upload a JPEG, PNG, WebP, AVIF or GIF image.");

  let dims = {};
  try {
    dims = imageSize(file.buffer);
  } catch {
    throw new HttpError(400, "That file isn't a readable image");
  }
  if (dims.width > 12000 || dims.height > 12000) {
    throw new HttpError(400, "Image dimensions are too large");
  }

  const now = new Date();
  const sub = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  const filename = `${crypto.randomBytes(12).toString("hex")}.${kind.ext}`;
  const dir = path.join(UPLOAD_ROOT, sub);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), file.buffer, { flag: "wx" });

  return Media.create({
    url: `/uploads/${sub.replace(/\\/g, "/")}/${filename}`,
    filename,
    originalName: String(file.originalname || "").slice(0, 200),
    mime: kind.mime,
    size: file.size,
    width: dims.width,
    height: dims.height,
    alt: String(alt).slice(0, 250),
    uploadedBy: userId,
  });
}

export async function deleteMedia(id) {
  const m = await Media.findById(id);
  if (!m) throw new HttpError(404, "Image not found");
  const rel = m.url.replace(/^\/uploads\//, "");
  const file = path.resolve(UPLOAD_ROOT, rel);
  // Guard against a crafted url escaping the upload directory.
  if (!file.startsWith(UPLOAD_ROOT + path.sep)) throw new HttpError(400, "Invalid media path");
  await fs.rm(file, { force: true });
  await m.deleteOne();
}
