import express, { Router } from "express";
import mongoose from "mongoose";

import { aiEnabled, env } from "../config/env.js";
import { AdminUser } from "../models/AdminUser.js";
import { Author, Category, Media, Post, Tag, displayStatus } from "../models/blog.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";
import { requireAdminPage, requirePermissionPage, sameOriginWrites } from "../middleware/auth.js";
import { ROLES, can, canDeletePost, canEditPost } from "../auth/permissions.js";
import { deletePost, duplicatePost, savePost } from "../blog/posts.js";
import { deleteMedia } from "../blog/media.js";
import { slugify } from "../blog/text.js";
import { revalidateFrontend } from "../blog/revalidate.js";
import { previewUrl } from "./blogAdminApi.js";

/**
 * Server-rendered blog admin: posts, editor, categories, tags, authors,
 * media library — plus user/role management. Mounted at /admin.
 */
export const blogAdmin = Router();

blogAdmin.use(express.urlencoded({ extended: false, limit: "1mb" }));
blogAdmin.use(sameOriginWrites);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flashFrom = (q) => (q.saved ? "Saved." : q.deleted ? "Deleted." : q.msg ? String(q.msg).slice(0, 200) : null);
const base = (req, extra = {}) => ({ admin: req.admin, can: (a) => can(req.admin, a), ...extra });

/* ================================================================== *
 * Posts
 * ================================================================== */

const STATUS_FILTERS = ["draft", "published", "scheduled", "archived"];

blogAdmin.get(
  "/blog",
  requireAdminPage,
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const perPage = 25;
    const status = STATUS_FILTERS.includes(req.query.status) ? req.query.status : "";
    const q = String(req.query.q || "").trim().slice(0, 80);
    const now = new Date();

    const filter = {};
    if (req.admin.role === "author") filter.createdBy = req.admin.id;
    if (status === "scheduled") Object.assign(filter, { status: "published", publishedAt: { $gt: now } });
    else if (status === "published") Object.assign(filter, { status: "published", publishedAt: { $lte: now } });
    else if (status) filter.status = status;
    if (q) filter.title = { $regex: escapeRegex(q), $options: "i" };

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .select("title slug status publishedAt updatedAt featured category author seo.focusKeyword wordCount createdBy")
        .populate("category", "name")
        .populate("author", "name")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .lean(),
      Post.countDocuments(filter),
    ]);

    res.render("blog/posts", base(req, {
      title: "Blog posts",
      active: "blog",
      posts: posts.map((p) => ({ ...p, display: displayStatus(p, now), editable: canEditPost(req.admin, p) })),
      total, page, pages: Math.max(1, Math.ceil(total / perPage)),
      status, q, statuses: STATUS_FILTERS,
      flash: flashFrom(req.query),
    }));
  })
);

/** Flat values for the editor form, from a saved post or a failed submission. */
function formValues(post = {}) {
  const seo = post.seo || {};
  const d = (x) => (x ? new Date(x).toISOString().slice(0, 16) : "");
  return {
    title: post.title || "",
    slug: post.slug || "",
    excerpt: post.excerpt || "",
    content: post.content || "",
    featuredImageUrl: post.featuredImage?.url || "",
    featuredImageAlt: post.featuredImage?.alt || "",
    category: String(post.category?._id || post.category || ""),
    author: String(post.author?._id || post.author || ""),
    tags: (post.tags || []).map((t) => t.name || t).join(", "),
    publishedAt: d(post.publishedAt),
    modifiedAt: d(post.modifiedAt),
    featured: Boolean(post.featured),
    seoTitle: seo.title || "",
    seoDescription: seo.description || "",
    focusKeyword: seo.focusKeyword || "",
    secondaryKeywords: (seo.secondaryKeywords || []).join(", "),
    canonicalUrl: seo.canonicalUrl || "",
    ogTitle: seo.ogTitle || "",
    ogDescription: seo.ogDescription || "",
    ogImage: seo.ogImage || "",
    twitterCard: seo.twitterCard || "summary_large_image",
    twitterTitle: seo.twitterTitle || "",
    twitterDescription: seo.twitterDescription || "",
    robotsIndex: seo.robotsIndex !== false,
    robotsFollow: seo.robotsFollow !== false,
    schemaType: seo.schemaType || "BlogPosting",
  };
}

async function renderEditor(req, res, { post = null, values, errors = null, status = 200 }) {
  const [categories, authors, tags, media] = await Promise.all([
    Category.find().sort({ sortOrder: 1, name: 1 }).select("name").lean(),
    Author.find().sort({ name: 1 }).select("name").lean(),
    Tag.find().sort({ name: 1 }).select("name").limit(500).lean(),
    Media.find().sort({ createdAt: -1 }).limit(60).select("url alt width height").lean(),
  ]);
  res.status(status).render("blog/editor", base(req, {
    title: post ? `Edit: ${post.title}` : "New post",
    active: "blog",
    post: post && { ...post, id: String(post._id), display: displayStatus(post) },
    v: values,
    errors,
    categories, authors, tagNames: tags.map((t) => t.name), media,
    aiEnabled,
    siteUrl: env.PUBLIC_SITE_URL,
    frontendUrl: env.FRONTEND_URL,
    canPublish: can(req.admin, "posts.publish"),
    canDelete: post ? canDeletePost(req.admin, post) : false,
    flash: flashFrom(req.query),
  }));
}

blogAdmin.get(
  "/blog/new",
  requirePermissionPage("posts.create"),
  asyncHandler(async (req, res) => {
    // Default the byline to the author profile linked to this account, if any.
    const mine = await Author.findOne({ user: req.admin.id }).select("_id").lean();
    await renderEditor(req, res, { values: formValues({ author: mine?._id }) });
  })
);

async function handleSave(req, res, id) {
  const intent = ["save", "draft", "publish", "unpublish"].includes(req.body.intent) ? req.body.intent : "save";
  try {
    const post = await savePost({ id, input: req.body, intent, user: req.admin });
    const msg = intent === "publish"
      ? (post.publishedAt > new Date() ? "Scheduled." : "Published.")
      : intent === "unpublish" ? "Unpublished — now a draft." : "Saved.";
    res.redirect(`/admin/blog/${post._id}/edit?msg=${encodeURIComponent(msg)}`);
  } catch (err) {
    if (!(err instanceof HttpError) || err.status >= 500) throw err;
    if (err.status === 403 || err.status === 404) {
      return res.status(err.status).render("forbidden", base(req, { title: "Not allowed", active: "blog", message: err.message }));
    }
    const post = id ? await Post.findById(id).lean() : null;
    await renderEditor(req, res, {
      post,
      values: { ...formValues(post || {}), ...req.body, featured: req.body.featured === "on", robotsIndex: req.body.robotsIndex !== "false", robotsFollow: req.body.robotsFollow !== "false" },
      errors: { message: err.message, fields: err.details || {} },
      status: err.status,
    });
  }
}

blogAdmin.post("/blog/new", requirePermissionPage("posts.create"), asyncHandler((req, res) => handleSave(req, res)));

blogAdmin.get(
  "/blog/:id/edit",
  requireAdminPage,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send("Post not found");
    const post = await Post.findById(req.params.id).populate("tags", "name").lean();
    if (!post) return res.status(404).send("Post not found");
    if (!canEditPost(req.admin, post)) {
      return res.status(403).render("forbidden", base(req, { title: "Not allowed", active: "blog", message: "You can only edit your own unpublished posts." }));
    }
    await renderEditor(req, res, { post, values: formValues(post) });
  })
);

blogAdmin.post("/blog/:id", requireAdminPage, asyncHandler((req, res) => handleSave(req, res, req.params.id)));

blogAdmin.post(
  "/blog/:id/duplicate",
  requirePermissionPage("posts.create"),
  asyncHandler(async (req, res) => {
    const copy = await duplicatePost(req.params.id, req.admin);
    res.redirect(`/admin/blog/${copy._id}/edit?msg=${encodeURIComponent("Duplicated — this is the copy, saved as a draft.")}`);
  })
);

blogAdmin.post(
  "/blog/:id/delete",
  requireAdminPage,
  asyncHandler(async (req, res) => {
    await deletePost(req.params.id, req.admin);
    res.redirect("/admin/blog?deleted=1");
  })
);

blogAdmin.get(
  "/blog/:id/preview",
  requireAdminPage,
  asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id).select("createdBy status").lean();
    if (!post) return res.status(404).send("Post not found");
    if (!canEditPost(req.admin, post) && req.admin.role === "author") return res.status(403).send("Not your post");
    res.redirect(previewUrl(post._id));
  })
);

/* ================================================================== *
 * Taxonomy: categories, tags, authors
 * ================================================================== */

const taxonomyGuard = requirePermissionPage("taxonomy.manage");

blogAdmin.get(
  "/blog/categories",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    const [items, counts] = await Promise.all([
      Category.find().sort({ sortOrder: 1, name: 1 }).lean(),
      Post.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }]),
    ]);
    const n = new Map(counts.map((c) => [String(c._id), c.n]));
    res.render("blog/categories", base(req, {
      title: "Categories", active: "blog",
      items: items.map((c) => ({ ...c, count: n.get(String(c._id)) || 0 })),
      error: req.query.error || null, flash: flashFrom(req.query),
    }));
  })
);

blogAdmin.post(
  "/blog/categories",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim().slice(0, 80);
    if (name.length < 2) return res.redirect("/admin/blog/categories?error=Name+is+required");
    const slug = slugify(req.body.slug || name, { maxLength: 60 });
    const description = String(req.body.description || "").trim().slice(0, 400);
    const sortOrder = Number(req.body.sortOrder) || 0;
    const id = req.body.id;
    if (await Category.exists({ slug, ...(id ? { _id: { $ne: id } } : {}) })) {
      return res.redirect(`/admin/blog/categories?error=${encodeURIComponent(`Slug “${slug}” is already used`)}`);
    }
    if (id && mongoose.isValidObjectId(id)) await Category.findByIdAndUpdate(id, { name, slug, description, sortOrder });
    else await Category.create({ name, slug, description, sortOrder });
    revalidateFrontend(["blog"]);
    res.redirect("/admin/blog/categories?saved=1");
  })
);

blogAdmin.post(
  "/blog/categories/:id/delete",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    const used = await Post.countDocuments({ category: req.params.id });
    if (used) {
      return res.redirect(`/admin/blog/categories?error=${encodeURIComponent(`${used} post(s) use this category — move them to another category first`)}`);
    }
    await Category.findByIdAndDelete(req.params.id);
    revalidateFrontend(["blog"]);
    res.redirect("/admin/blog/categories?deleted=1");
  })
);

blogAdmin.get(
  "/blog/tags",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    const [items, counts] = await Promise.all([
      Tag.find().sort({ name: 1 }).lean(),
      Post.aggregate([{ $unwind: "$tags" }, { $group: { _id: "$tags", n: { $sum: 1 } } }]),
    ]);
    const n = new Map(counts.map((c) => [String(c._id), c.n]));
    res.render("blog/tags", base(req, {
      title: "Tags", active: "blog",
      items: items.map((t) => ({ ...t, count: n.get(String(t._id)) || 0 })),
      error: req.query.error || null, flash: flashFrom(req.query),
    }));
  })
);

blogAdmin.post(
  "/blog/tags",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim().slice(0, 60);
    if (name.length < 2) return res.redirect("/admin/blog/tags?error=Name+is+required");
    const slug = slugify(req.body.slug || name, { maxLength: 60 });
    const id = req.body.id;
    if (await Tag.exists({ slug, ...(id ? { _id: { $ne: id } } : {}) })) {
      return res.redirect(`/admin/blog/tags?error=${encodeURIComponent(`Slug “${slug}” is already used`)}`);
    }
    if (id && mongoose.isValidObjectId(id)) await Tag.findByIdAndUpdate(id, { name, slug });
    else await Tag.create({ name, slug });
    revalidateFrontend(["blog"]);
    res.redirect("/admin/blog/tags?saved=1");
  })
);

blogAdmin.post(
  "/blog/tags/:id/delete",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    await Post.updateMany({ tags: req.params.id }, { $pull: { tags: req.params.id } });
    await Tag.findByIdAndDelete(req.params.id);
    revalidateFrontend(["blog"]);
    res.redirect("/admin/blog/tags?deleted=1");
  })
);

blogAdmin.get(
  "/blog/authors",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    const [items, users, counts] = await Promise.all([
      Author.find().sort({ name: 1 }).lean(),
      AdminUser.find().select("email name").sort({ email: 1 }).lean(),
      Post.aggregate([{ $group: { _id: "$author", n: { $sum: 1 } } }]),
    ]);
    const n = new Map(counts.map((c) => [String(c._id), c.n]));
    const editing = req.query.edit ? items.find((a) => String(a._id) === req.query.edit) : null;
    res.render("blog/authors", base(req, {
      title: "Authors", active: "blog",
      items: items.map((a) => ({ ...a, count: n.get(String(a._id)) || 0 })),
      users, editing,
      error: req.query.error || null, flash: flashFrom(req.query),
    }));
  })
);

blogAdmin.post(
  "/blog/authors",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    const b = req.body;
    const name = String(b.name || "").trim().slice(0, 120);
    if (name.length < 2) return res.redirect("/admin/blog/authors?error=Name+is+required");
    const url = String(b.url || "").trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) return res.redirect("/admin/blog/authors?error=Website+must+be+a+full+http(s)+URL");
    const avatarUrl = String(b.avatarUrl || "").trim();
    if (avatarUrl && !/^(https?:\/\/\S+|\/uploads\/[\w./-]+)$/i.test(avatarUrl)) {
      return res.redirect("/admin/blog/authors?error=Photo+must+be+an+uploaded+image+or+full+URL");
    }
    const doc = {
      name,
      slug: slugify(b.slug || name, { maxLength: 60 }),
      jobTitle: String(b.jobTitle || "").trim().slice(0, 120),
      bio: String(b.bio || "").trim().slice(0, 1200),
      avatarUrl,
      url,
      sameAs: String(b.sameAs || "").split(/\s*[\n,]\s*/).filter((s) => /^https?:\/\/\S+$/i.test(s)).slice(0, 8),
      user: mongoose.isValidObjectId(b.user) ? b.user : undefined,
    };
    const id = b.id;
    if (await Author.exists({ slug: doc.slug, ...(id ? { _id: { $ne: id } } : {}) })) {
      return res.redirect(`/admin/blog/authors?error=${encodeURIComponent(`Slug “${doc.slug}” is already used`)}`);
    }
    if (id && mongoose.isValidObjectId(id)) await Author.findByIdAndUpdate(id, doc);
    else await Author.create(doc);
    revalidateFrontend(["blog"]);
    res.redirect("/admin/blog/authors?saved=1");
  })
);

blogAdmin.post(
  "/blog/authors/:id/delete",
  taxonomyGuard,
  asyncHandler(async (req, res) => {
    const used = await Post.countDocuments({ author: req.params.id });
    if (used) {
      return res.redirect(`/admin/blog/authors?error=${encodeURIComponent(`${used} post(s) are bylined to this author — reassign them first`)}`);
    }
    await Author.findByIdAndDelete(req.params.id);
    res.redirect("/admin/blog/authors?deleted=1");
  })
);

/* ================================================================== *
 * Media library
 * ================================================================== */

blogAdmin.get(
  "/blog/media",
  requirePermissionPage("media.upload"),
  asyncHandler(async (req, res) => {
    const items = await Media.find().sort({ createdAt: -1 }).limit(200).lean();
    res.render("blog/media", base(req, {
      title: "Media library", active: "blog", items,
      maxMb: env.UPLOAD_MAX_MB,
      error: req.query.error || null, flash: flashFrom(req.query),
    }));
  })
);

blogAdmin.post(
  "/blog/media/:id",
  requirePermissionPage("media.upload"),
  asyncHandler(async (req, res) => {
    await Media.findByIdAndUpdate(req.params.id, { alt: String(req.body.alt || "").trim().slice(0, 250) });
    res.redirect("/admin/blog/media?saved=1");
  })
);

blogAdmin.post(
  "/blog/media/:id/delete",
  requirePermissionPage("media.delete"),
  asyncHandler(async (req, res) => {
    const m = await Media.findById(req.params.id).lean();
    if (m) {
      const inUse = await Post.countDocuments({
        $or: [{ "featuredImage.url": m.url }, { "seo.ogImage": m.url }, { content: { $regex: escapeRegex(m.url) } }],
      });
      if (inUse) {
        return res.redirect(`/admin/blog/media?error=${encodeURIComponent(`Used by ${inUse} post(s) — remove it from them first`)}`);
      }
      await deleteMedia(req.params.id);
    }
    res.redirect("/admin/blog/media?deleted=1");
  })
);

/* ================================================================== *
 * Users & roles (admin only)
 * ================================================================== */

const usersGuard = requirePermissionPage("users.manage");

blogAdmin.get(
  "/users",
  usersGuard,
  asyncHandler(async (req, res) => {
    const users = await AdminUser.find().sort({ createdAt: 1 }).lean();
    res.render("users", base(req, {
      title: "Users", active: "users", users, roles: ROLES,
      error: req.query.error || null, flash: flashFrom(req.query),
    }));
  })
);

blogAdmin.post(
  "/users",
  usersGuard,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim().slice(0, 120);
    const role = ROLES.includes(req.body.role) ? req.body.role : "author";
    const password = String(req.body.password || "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.redirect("/admin/users?error=Enter+a+valid+email");
    if (password.length < 12) return res.redirect("/admin/users?error=Password+must+be+at+least+12+characters");
    if (await AdminUser.exists({ email })) return res.redirect("/admin/users?error=That+email+already+has+an+account");
    await AdminUser.create({ email, name, role, passwordHash: await AdminUser.hashPassword(password) });
    res.redirect("/admin/users?saved=1");
  })
);

blogAdmin.post(
  "/users/:id/role",
  usersGuard,
  asyncHandler(async (req, res) => {
    const role = ROLES.includes(req.body.role) ? req.body.role : null;
    if (!role) return res.redirect("/admin/users?error=Unknown+role");
    if (req.params.id === req.admin.id && role !== "admin") {
      return res.redirect("/admin/users?error=You+can't+remove+your+own+admin+access");
    }
    await AdminUser.findByIdAndUpdate(req.params.id, { role });
    res.redirect("/admin/users?saved=1");
  })
);

blogAdmin.post(
  "/users/:id/delete",
  usersGuard,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.admin.id) return res.redirect("/admin/users?error=You+can't+delete+your+own+account");
    const admins = await AdminUser.countDocuments({ role: "admin" });
    const target = await AdminUser.findById(req.params.id).select("role").lean();
    if (target?.role === "admin" && admins <= 1) return res.redirect("/admin/users?error=Can't+delete+the+last+admin");
    await AdminUser.findByIdAndDelete(req.params.id);
    res.redirect("/admin/users?deleted=1");
  })
);
