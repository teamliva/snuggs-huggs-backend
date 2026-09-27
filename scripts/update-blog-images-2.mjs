/**
 * Second image-dedup pass: the remaining 5 posts that shared an image with
 * exactly one other post. See update-blog-images.mjs for the first pass and
 * the reasoning (savePost() re-validates the whole post, so each post's
 * current fields are loaded and only the image is overridden).
 *
 * Run against the local dev database (backend must already be running):
 *   node scripts/with-local-db.js scripts/update-blog-images-2.mjs
 */
import { connectDb, disconnectDb } from "../src/config/db.js";
import { Post, Tag } from "../src/models/blog.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { savePost } from "../src/blog/posts.js";

const SITE = "https://snuggsandhuggsseniorservices.com";
const img = (file) => `${SITE}/images/${file}`;

const UPDATES = [
  {
    slug: "fall-prevention-checklist-for-seniors-at-home",
    image: img("caregiver-helping-senior-out-of-bathtub.jpg"),
    alt: "A caregiver steadying a senior woman's arm as she carefully steps out of a bathtub with a grab bar nearby",
  },
  {
    slug: "nutrition-tips-for-seniors-living-at-home",
    image: img("senior-and-caregiver-preparing-healthy-meal.jpg"),
    alt: "A senior man and a caregiver preparing a colorful, healthy meal together at a kitchen counter",
  },
  {
    slug: "in-home-care-after-a-hospital-stay",
    image: img("caregiver-helping-senior-walk-with-walker.jpg"),
    alt: "A caregiver helping a senior woman walk with a walker through a bright hallway at home",
  },
  {
    slug: "how-to-choose-a-home-care-agency-in-seattle",
    image: img("daughter-researching-care-options-at-laptop.jpg"),
    alt: "An adult daughter on the phone while reviewing care options on her laptop at home",
  },
  {
    slug: "safe-exercise-ideas-for-seniors-with-limited-mobility",
    image: img("senior-seated-stretching-with-caregiver.jpg"),
    alt: "A senior woman doing a gentle seated stretch in her living room with a caregiver beside her",
  },
];

async function run() {
  await connectDb();

  const admin = await AdminUser.findOne({ email: "content@snuggsandhuggsseniorservices.com" });
  if (!admin) throw new Error("Seed admin not found — run scripts/seed-blog-posts.mjs first.");
  const user = { id: String(admin._id), role: admin.role, email: admin.email, name: admin.name };

  for (const u of UPDATES) {
    const post = await Post.findOne({ slug: u.slug }).select("+contentText");
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
      tags: post.tags?.length ? (await Tag.find({ _id: { $in: post.tags } }).select("name")).map((t) => t.name) : [],
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
      ogImage: "",
      twitterCard: post.seo?.twitterCard || "summary_large_image",
      twitterTitle: post.seo?.twitterTitle || "",
      twitterDescription: post.seo?.twitterDescription || "",
      robotsIndex: post.seo?.robotsIndex !== false,
      robotsFollow: post.seo?.robotsFollow !== false,
      schemaType: post.seo?.schemaType || "BlogPosting",
    };

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
