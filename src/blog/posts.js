import mongoose from "mongoose";
import { z } from "zod";

import { Author, Category, Post, Tag, visibleFilter } from "../models/blog.js";
import { HttpError } from "../middleware/errors.js";
import { can, canDeletePost, canEditPost } from "../auth/permissions.js";
import { renderMarkdown } from "./markdown.js";
import { slugify } from "./text.js";
import { revalidateFrontend } from "./revalidate.js";

/**
 * Post write path. Every create/update/publish goes through savePost() so
 * validation, permissions, slug history, rendering and cache refresh can't
 * be bypassed by one route that forgot a step.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v) || /^\/uploads\/[\w./-]+$/.test(v), {
    message: "Must be a full http(s) URL or an uploaded image",
  })
  .default("");

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) =>
    (Array.isArray(v) ? v : String(v || "").split(","))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
  );

const bool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

const robotsFlag = z.preprocess(
  (v) => (Array.isArray(v) ? v[v.length - 1] : v),
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined ? true : v === true || v === "true" || v === "on"))
);

const objectIdOrEmpty = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && mongoose.isValidObjectId(v) ? v : undefined));

export const postInputSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(100)
    .refine((v) => !v || SLUG_RE.test(v), "Slug may only contain lowercase letters, numbers and hyphens")
    .optional()
    .default(""),
  excerpt: z.string().trim().max(400).optional().default(""),
  content: z.string().max(200_000, "Article is too long").optional().default(""),

  featuredImageUrl: optionalUrl,
  featuredImageAlt: z.string().trim().max(250).optional().default(""),

  category: objectIdOrEmpty,
  author: objectIdOrEmpty,
  tags: csv,

  publishedAt: optionalDate,
  modifiedAt: optionalDate,
  featured: bool,

  seoTitle: z.string().trim().max(120).optional().default(""),
  seoDescription: z.string().trim().max(320).optional().default(""),
  focusKeyword: z.string().trim().toLowerCase().max(80).optional().default(""),
  secondaryKeywords: csv,
  canonicalUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Canonical URL must be a full http(s) URL")
    .optional()
    .default(""),
  ogTitle: z.string().trim().max(120).optional().default(""),
  ogDescription: z.string().trim().max(320).optional().default(""),
  ogImage: optionalUrl,
  twitterCard: z.enum(["summary_large_image", "summary"]).optional().default("summary_large_image"),
  twitterTitle: z.string().trim().max(120).optional().default(""),
  twitterDescription: z.string().trim().max(320).optional().default(""),
  // Robots default ON, so the form sends a hidden "false" followed by the
  // checkbox's "true" when ticked. The body parser turns that pair into an
  // array; the last value is the one that reflects the checkbox.
  robotsIndex: robotsFlag,
  robotsFollow: robotsFlag,
  schemaType: z.enum(["BlogPosting", "Article", "NewsArticle"]).optional().default("BlogPosting"),
});

/** Parses form/JSON input into a validated object, throwing 400 with field detail. */
export function parsePostInput(body) {
  const r = postInputSchema.safeParse(body);
  if (r.success) return r.data;
  const details = {};
  for (const i of r.error.issues) details[i.path.join(".") || "_"] ??= i.message;
  throw new HttpError(400, "Please fix the highlighted fields", details);
}

/** Resolves tag names to ids, creating new tags when the user may. */
async function resolveTags(names, user) {
  const ids = [];
  for (const name of names) {
    const slug = slugify(name, { maxLength: 60 });
    let tag = await Tag.findOne({ slug });
    if (!tag && can(user, "taxonomy.manage")) {
      tag = await Tag.create({ name: name.slice(0, 60), slug });
    }
    if (tag) ids.push(tag._id);
  }
  return [...new Set(ids.map(String))];
}

/** Ensures `slug` is free — not another post's slug nor a redirect it owns. */
async function assertSlugAvailable(slug, postId) {
  const clash = await Post.findOne({
    _id: { $ne: postId },
    $or: [{ slug }, { previousSlugs: slug }],
  })
    .select("title slug")
    .lean();
  if (clash) {
    const reason = clash.slug === slug ? "is already used by" : "redirects to";
    throw new HttpError(409, `That URL slug ${reason} “${clash.title}”`, {
      slug: `Slug ${reason} another post`,
    });
  }
}

/**
 * @param {object}  args
 * @param {string}  [args.id]        Existing post id; omitted to create.
 * @param {object}  args.input       Raw request body.
 * @param {"save"|"draft"|"publish"|"unpublish"} [args.intent]
 * @param {import("../auth/permissions.js").SessionUser} args.user
 */
export async function savePost({ id, input, intent = "save", user }) {
  const data = parsePostInput(input);

  let post;
  if (id) {
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Post not found");
    post = await Post.findById(id).select("+contentText");
    if (!post) throw new HttpError(404, "Post not found");
    if (!canEditPost(user, post)) throw new HttpError(403, "You can't edit this post");
  } else {
    if (!can(user, "posts.create")) throw new HttpError(403, "You can't create posts");
    post = new Post({ createdBy: user.id });
  }

  if ((intent === "publish" || intent === "unpublish") && !can(user, "posts.publish")) {
    throw new HttpError(403, "Only editors and admins can publish or unpublish");
  }

  const wasVisible = post.status === "published" && post.publishedAt && post.publishedAt <= new Date();
  const oldSlug = post.slug;
  const contentChanged = post.content !== data.content || post.title !== data.title;

  // --- Slug: explicit, else derived from the title on first save ---
  const slug = data.slug || oldSlug || slugify(data.title, { maxLength: 60, dropStopWords: true });
  if (slug !== oldSlug) await assertSlugAvailable(slug, post._id);

  // A slug that was ever public becomes a permanent redirect when it changes.
  if (oldSlug && slug !== oldSlug && (wasVisible || post.previousSlugs.length)) {
    post.previousSlugs = [...new Set([...post.previousSlugs.filter((s) => s !== slug), oldSlug])];
  } else {
    post.previousSlugs = post.previousSlugs.filter((s) => s !== slug);
  }
  post.slug = slug;

  // --- Content ---
  const rendered = renderMarkdown(data.content);
  post.title = data.title;
  post.excerpt = data.excerpt;
  post.content = data.content;
  post.contentHtml = rendered.html;
  post.contentText = rendered.text;
  post.toc = rendered.toc;
  post.wordCount = rendered.wordCount;
  post.readingMinutes = rendered.readingMinutes;

  post.featuredImage = {
    url: data.featuredImageUrl,
    alt: data.featuredImageAlt,
    width: post.featuredImage?.url === data.featuredImageUrl ? post.featuredImage.width : undefined,
    height: post.featuredImage?.url === data.featuredImageUrl ? post.featuredImage.height : undefined,
  };

  // --- Relations (validated to exist, not just well-formed ids) ---
  post.category = data.category && (await Category.exists({ _id: data.category })) ? data.category : undefined;
  post.author = data.author && (await Author.exists({ _id: data.author })) ? data.author : undefined;
  post.tags = await resolveTags(data.tags, user);

  if (can(user, "posts.publish")) post.featured = data.featured;

  post.seo = {
    title: data.seoTitle,
    description: data.seoDescription,
    focusKeyword: data.focusKeyword,
    secondaryKeywords: data.secondaryKeywords.map((k) => k.toLowerCase()),
    canonicalUrl: data.canonicalUrl,
    ogTitle: data.ogTitle,
    ogDescription: data.ogDescription,
    ogImage: data.ogImage,
    twitterCard: data.twitterCard,
    twitterTitle: data.twitterTitle,
    twitterDescription: data.twitterDescription,
    robotsIndex: data.robotsIndex,
    robotsFollow: data.robotsFollow,
    schemaType: data.schemaType,
  };

  // --- Status & dates ---
  if (intent === "publish") {
    post.status = "published";
    // A future date schedules the post; no date publishes it now.
    post.publishedAt = data.publishedAt || post.publishedAt || new Date();
  } else if (intent === "unpublish" || intent === "draft") {
    if (post.status === "published" && !can(user, "posts.publish")) {
      throw new HttpError(403, "Only editors and admins can unpublish");
    }
    post.status = "draft";
    if (data.publishedAt) post.publishedAt = data.publishedAt;
  } else if (data.publishedAt && can(user, "posts.publish")) {
    post.publishedAt = data.publishedAt;
  }

  if (data.modifiedAt) {
    post.modifiedAt = data.modifiedAt;
  } else if (post.status === "published" && wasVisible && contentChanged) {
    post.modifiedAt = new Date();
  }

  post.updatedBy = user.id;
  await post.save();

  const nowVisible = post.status === "published" && post.publishedAt <= new Date();
  if (wasVisible || nowVisible) {
    revalidateFrontend(["blog", `post:${post.slug}`, ...(oldSlug ? [`post:${oldSlug}`] : [])]);
  }

  return post;
}

export async function duplicatePost(id, user) {
  const src = await Post.findById(id).lean();
  if (!src) throw new HttpError(404, "Post not found");
  if (!can(user, "posts.create")) throw new HttpError(403, "You can't create posts");

  let slug = `${src.slug}-copy`.slice(0, 95);
  for (let n = 2; await Post.exists({ $or: [{ slug }, { previousSlugs: slug }] }); n++) {
    slug = `${src.slug}-copy-${n}`.slice(0, 100);
  }

  const { _id, createdAt, updatedAt, previousSlugs, publishedAt, modifiedAt, ...rest } = src;
  return Post.create({
    ...rest,
    title: `${src.title} (copy)`.slice(0, 160),
    slug,
    status: "draft",
    featured: false,
    // A copy must never inherit the original's canonical, or both pages
    // would tell Google the other is the real one.
    seo: { ...src.seo, canonicalUrl: "" },
    createdBy: user.id,
    updatedBy: user.id,
  });
}

export async function deletePost(id, user) {
  const post = await Post.findById(id);
  if (!post) throw new HttpError(404, "Post not found");
  if (!canDeletePost(user, post)) throw new HttpError(403, "You can't delete this post");
  const wasVisible = post.status === "published" && post.publishedAt <= new Date();
  await post.deleteOne();
  if (wasVisible) revalidateFrontend(["blog", `post:${post.slug}`]);
}

/** Other posts' effective metadata, for the analyzer's duplicate check. */
export async function metadataOfOtherPosts(excludeId) {
  const { autoSeoTitle, autoDescription } = await import("./seo.js");
  const others = await Post.find(excludeId ? { _id: { $ne: excludeId } } : {})
    .select("title excerpt contentHtml seo")
    .limit(2000)
    .lean();
  return others.map((o) => ({
    id: String(o._id),
    title: o.title,
    seoTitle: o.seo?.title || autoSeoTitle(o.title),
    description: o.seo?.description || autoDescription(o),
  }));
}

export { visibleFilter };
