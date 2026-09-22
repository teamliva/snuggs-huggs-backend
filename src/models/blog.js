import mongoose from "mongoose";

/**
 * Blog data model.
 *
 * Posts reference taxonomy and authors by id rather than embedding them, so
 * renaming a category or updating an author bio is one write, not a sweep
 * across every post. SEO fields are an embedded sub-document: they belong
 * to exactly one post and are always read with it.
 *
 * Every SEO field is optional and stores only what an editor explicitly
 * overrode. Effective values (e.g. the meta description when none was
 * typed) are derived at read time by blog/seoResolve.js, so they follow the
 * article as it changes instead of freezing at whatever the auto-generator
 * produced on first save.
 *
 * @typedef {"draft" | "published" | "archived"} PostStatus
 */

const { Schema, model, Types } = mongoose;

const slugField = {
  type: String,
  required: true,
  trim: true,
  lowercase: true,
  maxlength: 100,
  match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
};

/* ------------------------------------------------------------------ */

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { ...slugField, unique: true },
    description: { type: String, trim: true, maxlength: 400, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const tagSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { ...slugField, unique: true },
  },
  { timestamps: true }
);

/**
 * Public author profile — separate from the login account so a byline can
 * exist for someone who never signs in (a guest nurse, the founder).
 */
const authorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { ...slugField, unique: true },
    jobTitle: { type: String, trim: true, maxlength: 120, default: "" },
    bio: { type: String, trim: true, maxlength: 1200, default: "" },
    avatarUrl: { type: String, trim: true, maxlength: 500, default: "" },
    // Author's own site / profile, used as the schema.org Person url.
    url: { type: String, trim: true, maxlength: 500, default: "" },
    sameAs: { type: [String], default: [] },
    user: { type: Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true }
);

const mediaSchema = new Schema(
  {
    url: { type: String, required: true }, // /uploads/yyyy/mm/<random>.<ext>
    filename: { type: String, required: true },
    originalName: { type: String, maxlength: 200, default: "" },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    width: Number,
    height: Number,
    alt: { type: String, trim: true, maxlength: 250, default: "" },
    uploadedBy: { type: Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true }
);
mediaSchema.index({ createdAt: -1 });

/* ------------------------------------------------------------------ */

const seoSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 120, default: "" },
    description: { type: String, trim: true, maxlength: 320, default: "" },
    focusKeyword: { type: String, trim: true, maxlength: 80, default: "" },
    secondaryKeywords: { type: [String], default: [] },
    canonicalUrl: { type: String, trim: true, maxlength: 500, default: "" },

    ogTitle: { type: String, trim: true, maxlength: 120, default: "" },
    ogDescription: { type: String, trim: true, maxlength: 320, default: "" },
    ogImage: { type: String, trim: true, maxlength: 500, default: "" },

    twitterCard: {
      type: String,
      enum: ["summary_large_image", "summary"],
      default: "summary_large_image",
    },
    twitterTitle: { type: String, trim: true, maxlength: 120, default: "" },
    twitterDescription: { type: String, trim: true, maxlength: 320, default: "" },

    robotsIndex: { type: Boolean, default: true },
    robotsFollow: { type: Boolean, default: true },

    schemaType: {
      type: String,
      enum: ["BlogPosting", "Article", "NewsArticle"],
      default: "BlogPosting",
    },
  },
  { _id: false }
);

const tocEntry = new Schema(
  { id: String, text: String, level: Number },
  { _id: false }
);

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { ...slugField, unique: true },

    // Old slugs of this post that were public at some point. Requests for
    // them 301 to the current slug, so changing a URL never breaks inbound
    // links or loses ranking.
    previousSlugs: { type: [String], default: [], index: true },

    excerpt: { type: String, trim: true, maxlength: 400, default: "" },

    // Source of truth is Markdown. The sanitized HTML, plain text, TOC and
    // stats are derived from it on every save (blog/markdown.js) so public
    // reads never render or sanitize anything.
    content: { type: String, default: "", maxlength: 200_000 },
    contentHtml: { type: String, default: "" },
    contentText: { type: String, default: "", select: false },
    toc: { type: [tocEntry], default: [] },
    wordCount: { type: Number, default: 0 },
    readingMinutes: { type: Number, default: 1 },

    featuredImage: {
      url: { type: String, trim: true, maxlength: 500, default: "" },
      alt: { type: String, trim: true, maxlength: 250, default: "" },
      width: Number,
      height: Number,
    },

    author: { type: Types.ObjectId, ref: "Author" },
    category: { type: Types.ObjectId, ref: "Category" },
    tags: [{ type: Types.ObjectId, ref: "Tag" }],

    /** @type {PostStatus} */
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    // A published post with a future publishedAt is "scheduled": stored as
    // published, hidden by every public query until the time arrives.
    publishedAt: { type: Date },
    // Shown to readers as "Updated on"; bumped automatically when a live
    // post's content changes unless an editor sets it by hand.
    modifiedAt: { type: Date },

    featured: { type: Boolean, default: false },

    seo: { type: seoSchema, default: () => ({}) },

    createdBy: { type: Types.ObjectId, ref: "AdminUser" },
    updatedBy: { type: Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true }
);

// Public listing: newest visible first, optionally filtered.
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ category: 1, status: 1, publishedAt: -1 });
postSchema.index({ tags: 1, status: 1, publishedAt: -1 });
postSchema.index({ featured: 1, status: 1, publishedAt: -1 });
// Admin list sorts by last edit.
postSchema.index({ updatedAt: -1 });
// Full-text search, weighted toward the title.
postSchema.index(
  { title: "text", excerpt: "text", contentText: "text", "seo.focusKeyword": "text" },
  {
    name: "post_text",
    weights: { title: 10, "seo.focusKeyword": 6, excerpt: 4, contentText: 1 },
  }
);

/** The single definition of "visible to the public", reused everywhere. */
export function visibleFilter(now = new Date()) {
  return { status: "published", publishedAt: { $lte: now } };
}

/** Derived display status for the admin UI. */
export function displayStatus(post, now = new Date()) {
  if (post.status === "published" && post.publishedAt && post.publishedAt > now) {
    return "scheduled";
  }
  return post.status;
}

export const Category = model("Category", categorySchema);
export const Tag = model("Tag", tagSchema);
export const Author = model("Author", authorSchema);
export const Media = model("Media", mediaSchema);
export const Post = model("Post", postSchema);
