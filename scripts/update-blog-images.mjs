/**
 * Points 6 blog posts at newly generated, topic-specific images instead of
 * the service photo they were originally sharing with 1-2 other posts.
 *
 * savePost() re-validates the whole post from postInputSchema, so this
 * loads each post's current fields first and only overrides the image —
 * passing just {featuredImageUrl} would blank out title/content/tags/SEO.
 *
 * Run against the local dev database (backend must already be running):
 *   node scripts/with-local-db.js scripts/update-blog-images.mjs
 */
import { connectDb, disconnectDb } from "../src/config/db.js";
import { Post } from "../src/models/blog.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { savePost } from "../src/blog/posts.js";

const SITE = "https://snuggsandhuggsseniorservices.com";
const img = (file) => `${SITE}/images/${file}`;

const UPDATES = [
  {
    slug: "stages-of-dementia-what-changes-at-home",
    image: img("senior-dementia-caregiver-hand-holding.jpg"),
    alt: "A caregiver gently holding the hand of a thoughtful senior woman at home",
  },
  {
    slug: "supporting-loved-one-with-dementia-during-holidays",
    image: img("senior-and-daughter-holiday-mantel.jpg"),
    alt: "A senior woman and her adult daughter sharing a warm moment by a softly lit holiday mantel",
  },
  {
    slug: "talking-to-a-parent-who-refuses-help",
    image: img("daughter-talking-with-resistant-parent.jpg"),
    alt: "An adult daughter gently talking with her senior mother in a living room",
  },
  {
    slug: "what-affects-the-cost-of-in-home-senior-care",
    image: img("family-reviewing-care-plan-calendar.jpg"),
    alt: "An adult daughter and a care coordinator reviewing a care plan and calendar together at a kitchen table",
  },
  {
    slug: "signs-of-caregiver-burnout",
    image: img("tired-family-caregiver-resting-with-tea.jpg"),
    alt: "A tired family caregiver resting on the couch with a cup of tea",
  },
  {
    slug: "in-home-care-vs-assisted-living",
    image: img("cozy-living-room-senior-reading-by-window.jpg"),
    alt: "A senior woman reading by a sunlit window in a cozy, familiar living room",
  },
];

async function run() {
  await connectDb();

  // Attribution only — savePost requires a user for updatedBy/permissions.
  const admin = await AdminUser.findOne({ email: "content@snuggsandhuggsseniorservices.com" });
  if (!admin) throw new Error("Seed admin not found — run scripts/seed-blog-posts.mjs first.");
  const user = { id: String(admin._id), role: admin.role, email: admin.email, name: admin.name };

  for (const u of UPDATES) {
    const post = await Post.findById((await Post.findOne({ slug: u.slug }).select("_id"))?._id).select(
      "+contentText"
    );
    if (!post) {
      console.warn(`Skipped (not found): ${u.slug}`);
      continue;
    }

    const input = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      featuredImageUrl: u.image,
      featuredImageAlt: u.alt,
      category: post.category ? String(post.category) : "",
      author: post.author ? String(post.author) : "",
      tags: [], // resolved fresh below from the post's current tag ids
      publishedAt: post.publishedAt?.toISOString(),
      modifiedAt: post.modifiedAt?.toISOString(),
      featured: post.featured,
      seoTitle: post.seo?.title || "",
      seoDescription: post.seo?.description || "",
      focusKeyword: post.seo?.focusKeyword || "",
      secondaryKeywords: post.seo?.secondaryKeywords || [],
      canonicalUrl: post.seo?.canonicalUrl || "",
      ogTitle: post.seo?.ogTitle || "",
      ogDescription: post.seo?.ogDescription || "",
      ogImage: "", // let it re-resolve to the new featured image
      twitterCard: post.seo?.twitterCard || "summary_large_image",
      twitterTitle: post.seo?.twitterTitle || "",
      twitterDescription: post.seo?.twitterDescription || "",
      robotsIndex: post.seo?.robotsIndex !== false,
      robotsFollow: post.seo?.robotsFollow !== false,
      schemaType: post.seo?.schemaType || "BlogPosting",
    };

    // Tags are stored as ObjectIds; resolveTags() in savePost expects names,
    // so look the current tag names up rather than losing them.
    if (post.tags?.length) {
      const { Tag } = await import("../src/models/blog.js");
      const tagDocs = await Tag.find({ _id: { $in: post.tags } }).select("name");
      input.tags = tagDocs.map((t) => t.name);
    }

    await savePost({ id: String(post._id), input, intent: "publish", user });
    console.log(`Updated image: ${post.title}`);
  }

  console.log("\nDone.");
  await disconnectDb();
}

run().catch((err) => {
  console.error("Update failed:", err);
  process.exitCode = 1;
});
