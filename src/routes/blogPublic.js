import { Router } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { env } from "../config/env.js";
import { Category, Post, Tag, visibleFilter } from "../models/blog.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";
import { resolveSeo } from "../blog/seo.js";

/**
 * Public, read-only blog API consumed by the Next.js frontend.
 *
 * Everything here is filtered through visibleFilter(): drafts, archived
 * posts and scheduled posts whose time hasn't come are indistinguishable
 * from posts that don't exist. Internal fields (createdBy, contentText,
 * editor notes) are never selected.
 */
export const blogPublic = Router();

const CARD_FIELDS =
  "title slug excerpt featuredImage category tags author publishedAt modifiedAt readingMinutes featured";

const populateCard = (q) =>
  q
    .populate("category", "name slug")
    .populate("tags", "name slug")
    .populate("author", "name slug avatarUrl jobTitle");

const toCard = (p) => ({
  id: String(p._id),
  title: p.title,
  slug: p.slug,
  excerpt: p.excerpt,
  featuredImage: p.featuredImage?.url ? p.featuredImage : null,
  category: p.category ? { name: p.category.name, slug: p.category.slug } : null,
  tags: (p.tags || []).map((t) => ({ name: t.name, slug: t.slug })),
  author: p.author
    ? { name: p.author.name, slug: p.author.slug, avatarUrl: p.author.avatarUrl, jobTitle: p.author.jobTitle }
    : null,
  publishedAt: p.publishedAt,
  modifiedAt: p.modifiedAt || null,
  readingMinutes: p.readingMinutes,
  featured: Boolean(p.featured),
});

blogPublic.use((_req, res, next) => {
  // Short shared caching; the frontend also caches and is told to refresh
  // on publish, so this only smooths bursts.
  res.set("Cache-Control", "public, max-age=30, s-maxage=60");
  next();
});

/* ---------------- Listing ---------------- */

blogPublic.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const perPage = Math.min(Math.max(Number(req.query.limit) || 12, 1), 48);
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 500);
    const q = String(req.query.q || "").trim().slice(0, 100);

    const filter = visibleFilter();
    let category = null;
    let tag = null;

    if (req.query.category) {
      category = await Category.findOne({ slug: String(req.query.category) }).select("name slug description").lean();
      if (!category) throw new HttpError(404, "Category not found");
      filter.category = category._id;
    }
    if (req.query.tag) {
      tag = await Tag.findOne({ slug: String(req.query.tag) }).select("name slug").lean();
      if (!tag) throw new HttpError(404, "Tag not found");
      filter.tags = tag._id;
    }
    if (req.query.featured === "1") filter.featured = true;
    if (q) filter.$text = { $search: q };

    const projection = q ? { score: { $meta: "textScore" } } : {};
    const sort = q ? { score: { $meta: "textScore" }, publishedAt: -1 } : { publishedAt: -1, _id: -1 };

    const [items, total] = await Promise.all([
      populateCard(
        Post.find(filter, projection).select(CARD_FIELDS).sort(sort).skip((page - 1) * perPage).limit(perPage)
      ).lean(),
      Post.countDocuments(filter),
    ]);

    res.json({
      items: items.map(toCard),
      total,
      page,
      perPage,
      pages: Math.max(1, Math.ceil(total / perPage)),
      category: category && { name: category.name, slug: category.slug, description: category.description },
      tag: tag && { name: tag.name, slug: tag.slug },
      q,
    });
  })
);

/* ---------------- Article ---------------- */

async function articlePayload(post) {
  const related = await relatedPosts(post);
  const visible = visibleFilter();
  const [prev, next] = post.status === "published"
    ? await Promise.all([
        Post.findOne({ ...visible, publishedAt: { $lt: post.publishedAt } }).sort({ publishedAt: -1 }).select("title slug").lean(),
        Post.findOne({ ...visible, publishedAt: { $gt: post.publishedAt, $lte: new Date() } }).sort({ publishedAt: 1 }).select("title slug").lean(),
      ])
    : [null, null];

  const a = post.author;
  return {
    post: {
      ...toCard(post),
      contentHtml: post.contentHtml,
      toc: (post.toc || []).map(({ id, text, level }) => ({ id, text, level })),
      wordCount: post.wordCount,
      author: a
        ? { name: a.name, slug: a.slug, jobTitle: a.jobTitle, bio: a.bio, avatarUrl: a.avatarUrl, url: a.url, sameAs: a.sameAs || [] }
        : null,
      category: post.category ? { name: post.category.name, slug: post.category.slug } : null,
      seo: resolveSeo(post),
      status: post.status,
    },
    related: related.map(toCard),
    prev: prev && { title: prev.title, slug: prev.slug },
    next: next && { title: next.title, slug: next.slug },
  };
}

/** Up to 3 posts sharing tags or category, topped up with the latest. */
async function relatedPosts(post) {
  const tagIds = (post.tags || []).map((t) => t._id || t);
  const or = [];
  if (tagIds.length) or.push({ tags: { $in: tagIds } });
  if (post.category) or.push({ category: post.category._id || post.category });

  const base = { ...visibleFilter(), _id: { $ne: post._id } };
  const candidates = or.length
    ? await populateCard(Post.find({ ...base, $or: or }).select(CARD_FIELDS).sort({ publishedAt: -1 }).limit(20)).lean()
    : [];

  const catId = String(post.category?._id || post.category || "");
  const tagSet = new Set(tagIds.map(String));
  const scored = candidates
    .map((c) => ({
      c,
      s: (c.tags || []).filter((t) => tagSet.has(String(t._id))).length * 2 + (String(c.category?._id) === catId ? 1 : 0),
    }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.c)
    .slice(0, 3);

  if (scored.length < 3) {
    const have = [post._id, ...scored.map((p) => p._id)];
    const fill = await populateCard(
      Post.find({ ...visibleFilter(), _id: { $nin: have } }).select(CARD_FIELDS).sort({ publishedAt: -1 }).limit(3 - scored.length)
    ).lean();
    scored.push(...fill);
  }
  return scored;
}

const populateArticle = (q) =>
  q
    .populate("category", "name slug")
    .populate("tags", "name slug")
    .populate("author", "name slug jobTitle bio avatarUrl url sameAs");

blogPublic.get(
  "/posts/:slug",
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug).toLowerCase().slice(0, 120);
    const post = await populateArticle(Post.findOne({ ...visibleFilter(), slug })).lean();

    if (!post) {
      // An old URL of a live post: tell the frontend to 301.
      const moved = await Post.findOne({ ...visibleFilter(), previousSlugs: slug }).select("slug").lean();
      if (moved) return res.json({ redirect: moved.slug });
      throw new HttpError(404, "Post not found");
    }
    res.json(await articlePayload(post));
  })
);

/* ---------------- Preview (drafts, signed link) ---------------- */

blogPublic.get(
  "/preview/:id",
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Robots-Tag", "noindex, nofollow");
    let payload;
    try {
      payload = jwt.verify(String(req.query.token || ""), env.JWT_SECRET, { audience: "preview" });
    } catch {
      throw new HttpError(401, "This preview link is invalid or has expired");
    }
    if (payload.pid !== req.params.id || !mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(401, "This preview link is invalid");
    }
    const post = await populateArticle(Post.findById(req.params.id)).lean();
    if (!post) throw new HttpError(404, "Post not found");
    res.json(await articlePayload(post));
  })
);

/* ---------------- Taxonomy ---------------- */

blogPublic.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const [cats, counts] = await Promise.all([
      Category.find().sort({ sortOrder: 1, name: 1 }).select("name slug description").lean(),
      Post.aggregate([{ $match: visibleFilter() }, { $group: { _id: "$category", n: { $sum: 1 } } }]),
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({
      items: cats.map((c) => ({
        name: c.name,
        slug: c.slug,
        description: c.description,
        count: byId.get(String(c._id)) || 0,
      })),
    });
  })
);

/* ---------------- Sitemap feed ---------------- */

blogPublic.get(
  "/sitemap",
  asyncHandler(async (_req, res) => {
    const posts = await Post.find({
      ...visibleFilter(),
      "seo.robotsIndex": { $ne: false },
      // A post canonicalised elsewhere isn't the canonical URL, so it
      // doesn't belong in the sitemap.
      $or: [{ "seo.canonicalUrl": "" }, { "seo.canonicalUrl": { $exists: false } }],
    })
      .select("slug publishedAt modifiedAt updatedAt featuredImage")
      .sort({ publishedAt: -1 })
      .limit(50_000)
      .lean();

    const counts = await Post.aggregate([
      { $match: visibleFilter() },
      { $group: { _id: "$category", last: { $max: "$publishedAt" } } },
    ]);
    const cats = await Category.find({ _id: { $in: counts.map((c) => c._id).filter(Boolean) } }).select("slug").lean();
    const lastByCat = new Map(counts.map((c) => [String(c._id), c.last]));

    res.json({
      posts: posts.map((p) => ({
        slug: p.slug,
        lastModified: p.modifiedAt || p.publishedAt,
        image: p.featuredImage?.url || null,
      })),
      categories: cats.map((c) => ({ slug: c.slug, lastModified: lastByCat.get(String(c._id)) })),
      latest: posts[0]?.modifiedAt || posts[0]?.publishedAt || null,
    });
  })
);
