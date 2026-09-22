import express, { Router } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { env } from "../config/env.js";
import { Media, Post, displayStatus } from "../models/blog.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";
import { requireAdmin, requirePermission, sameOriginWrites } from "../middleware/auth.js";
import { canEditPost } from "../auth/permissions.js";
import { renderMarkdown, extractLinks } from "../blog/markdown.js";
import { analyzePost } from "../blog/analyze.js";
import { suggestSeo } from "../blog/ai.js";
import { suggestInternalLinks } from "../blog/links.js";
import { deletePost, duplicatePost, metadataOfOtherPosts, savePost } from "../blog/posts.js";
import { deleteMedia, handleUpload, storeImage } from "../blog/media.js";

/**
 * Authenticated JSON API for the blog editor (live SEO analysis, AI/heuristic
 * suggestions, link suggestions, uploads) and for scripted content management.
 * Mounted at /api/admin/blog.
 */
export const blogAdminApi = Router();

// Articles are far larger than the 64kb global body limit.
blogAdminApi.use(express.json({ limit: "1mb" }));
blogAdminApi.use(sameOriginWrites, requireAdmin);

/** Turns editor form fields into the shape the analyzer understands. */
function draftFromBody(b) {
  const r = renderMarkdown(String(b.content || "").slice(0, 200_000));
  const list = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((s) => s.trim()).filter(Boolean);
  return {
    id: b.id,
    title: String(b.title || ""),
    slug: String(b.slug || ""),
    excerpt: String(b.excerpt || ""),
    content: String(b.content || ""),
    contentHtml: r.html,
    contentText: r.text,
    featuredImage: { url: b.featuredImageUrl || "", alt: b.featuredImageAlt || "" },
    author: b.author || null,
    category: b.category || null,
    seo: {
      title: b.seoTitle || "",
      description: b.seoDescription || "",
      focusKeyword: String(b.focusKeyword || "").toLowerCase(),
      secondaryKeywords: list(b.secondaryKeywords),
      canonicalUrl: b.canonicalUrl || "",
      ogImage: b.ogImage || "",
      robotsIndex: b.robotsIndex !== false && b.robotsIndex !== "false",
      robotsFollow: b.robotsFollow !== false && b.robotsFollow !== "false",
      schemaType: b.schemaType || "BlogPosting",
    },
  };
}

/* ---------------- Editor tooling ---------------- */

blogAdminApi.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    const draft = draftFromBody(req.body);
    const others = await metadataOfOtherPosts(mongoose.isValidObjectId(draft.id) ? draft.id : undefined);
    res.json(analyzePost(draft, { others }));
  })
);

blogAdminApi.post(
  "/auto-seo",
  asyncHandler(async (req, res) => {
    const draft = draftFromBody(req.body);
    if (!draft.title.trim() && !draft.content.trim()) {
      throw new HttpError(400, "Write a title or some content first");
    }
    res.json(await suggestSeo(draft));
  })
);

blogAdminApi.post(
  "/link-suggestions",
  asyncHandler(async (req, res) => {
    const draft = draftFromBody(req.body);
    const { internal } = extractLinks(draft.contentHtml);
    res.json({
      items: await suggestInternalLinks({
        title: draft.title,
        contentHtml: draft.contentHtml,
        excludeId: draft.id,
        existingLinks: internal,
      }),
    });
  })
);

/* ---------------- Media ---------------- */

blogAdminApi.get(
  "/media",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const items = await Media.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ items });
  })
);

blogAdminApi.post(
  "/media",
  requirePermission("media.upload"),
  asyncHandler(async (req, res) => {
    await handleUpload(req, res);
    const media = await storeImage(req.file, { alt: req.body?.alt, userId: req.admin.id });
    res.status(201).json({ item: media });
  })
);

blogAdminApi.patch(
  "/media/:id",
  requirePermission("media.upload"),
  asyncHandler(async (req, res) => {
    const alt = String(req.body?.alt || "").trim().slice(0, 250);
    const item = await Media.findByIdAndUpdate(req.params.id, { alt }, { new: true }).lean();
    if (!item) throw new HttpError(404, "Image not found");
    res.json({ item });
  })
);

blogAdminApi.delete(
  "/media/:id",
  requirePermission("media.delete"),
  asyncHandler(async (req, res) => {
    await deleteMedia(req.params.id);
    res.json({ ok: true });
  })
);

/* ---------------- Posts ---------------- */

blogAdminApi.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const perPage = Math.min(Number(req.query.limit) || 25, 100);
    const filter = {};
    if (req.admin.role === "author") filter.createdBy = req.admin.id;
    const items = await Post.find(filter)
      .select("title slug status publishedAt updatedAt featured")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();
    res.json({ items: items.map((p) => ({ ...p, displayStatus: displayStatus(p) })) });
  })
);

blogAdminApi.get(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, "Post not found");
    const post = await Post.findById(req.params.id).lean();
    if (!post) throw new HttpError(404, "Post not found");
    if (!canEditPost(req.admin, post) && req.admin.role === "author") throw new HttpError(403, "Not your post");
    res.json({ post });
  })
);

blogAdminApi.post(
  "/posts",
  requirePermission("posts.create"),
  asyncHandler(async (req, res) => {
    const post = await savePost({ input: req.body, intent: req.body.intent, user: req.admin });
    res.status(201).json({ post: { id: post._id, slug: post.slug, status: displayStatus(post) } });
  })
);

blogAdminApi.patch(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const post = await savePost({ id: req.params.id, input: req.body, intent: req.body.intent, user: req.admin });
    res.json({ post: { id: post._id, slug: post.slug, status: displayStatus(post) } });
  })
);

blogAdminApi.delete(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    await deletePost(req.params.id, req.admin);
    res.json({ ok: true });
  })
);

blogAdminApi.post(
  "/posts/:id/duplicate",
  asyncHandler(async (req, res) => {
    const copy = await duplicatePost(req.params.id, req.admin);
    res.status(201).json({ post: { id: copy._id, slug: copy.slug } });
  })
);

/** Short-lived signed link to preview a draft on the real frontend. */
export function previewUrl(postId) {
  const token = jwt.sign({ pid: String(postId), aud: "preview" }, env.JWT_SECRET, { expiresIn: "30m" });
  return `${env.FRONTEND_URL}/blog/preview/${postId}?token=${encodeURIComponent(token)}`;
}

blogAdminApi.post(
  "/posts/:id/preview-link",
  asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id).select("createdBy status").lean();
    if (!post) throw new HttpError(404, "Post not found");
    if (!canEditPost(req.admin, post) && req.admin.role === "author") throw new HttpError(403, "Not your post");
    res.json({ url: previewUrl(post._id) });
  })
);
