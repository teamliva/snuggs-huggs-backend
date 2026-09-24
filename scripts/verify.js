/**
 * End-to-end smoke test against a real HTTP server backed by an in-memory
 * MongoDB. Requires no external database and writes nothing to a real one.
 *
 *   npm run verify
 */
import { MongoMemoryServer } from "mongodb-memory-server";

// The env module validates and exits on missing config, so these have to be
// set before anything imports it.
const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri("snuggs-huggs-test");
process.env.JWT_SECRET = "test-secret-that-is-definitely-long-enough-000000";
process.env.NODE_ENV = "test";
process.env.PORT = "4555";
process.env.CORS_ORIGINS = "http://localhost:3000";
// Uploads go to a throwaway directory, never the real one.
process.env.UPLOAD_DIR = (await import("node:path")).join((await import("node:os")).tmpdir(), `sh-verify-uploads-${process.pid}`);

const { connectDb, disconnectDb } = await import("../src/config/db.js");
const { createApp } = await import("../src/app.js");
const { AdminUser } = await import("../src/models/AdminUser.js");

await connectDb();
const server = createApp().listen(4555);
const BASE = "http://localhost:4555";

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const json = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

try {
  console.log("\nPublic API");

  let r = await fetch(`${BASE}/health`);
  check("GET /health returns ok", r.status === 200 && (await json(r)).ok === true);

  r = await fetch(`${BASE}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Karen Miller",
      phone: "(206) 555-0142",
      email: "karen@example.com",
      message: "Looking for help for my mother, three mornings a week.",
      carePlan: "Premium Care",
    }),
  });
  const created = await json(r);
  check("POST /api/leads accepts a valid enquiry", r.status === 201 && created.ok === true);

  r = await fetch(`${BASE}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "X", phone: "" }),
  });
  const invalid = await json(r);
  check(
    "POST /api/leads rejects invalid input with field errors",
    r.status === 400 && Boolean(invalid.details),
    `got ${r.status}`
  );

  r = await fetch(`${BASE}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Spam Bot",
      phone: "5550000000",
      company: "filled-by-bot",
    }),
  });
  check("POST /api/leads silently drops honeypot submissions", r.status === 201);

  console.log("\nAuth");

  r = await fetch(`${BASE}/api/admin/leads`);
  check("admin endpoints reject anonymous access", r.status === 401, `got ${r.status}`);

  await AdminUser.create({
    email: "owner@example.com",
    name: "Owner",
    role: "admin",
    passwordHash: await AdminUser.hashPassword("correct-horse-battery"),
  });

  r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.com", password: "wrong-password" }),
  });
  check("login rejects a wrong password", r.status === 401);

  r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.com", password: "correct-horse-battery" }),
  });
  const setCookie = r.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  check("login succeeds and sets a session cookie", r.status === 200 && cookie.includes("sh_admin"));
  check(
    "session cookie is HttpOnly",
    /httponly/i.test(setCookie),
    "cookie readable by page JS"
  );

  const auth = { cookie };

  console.log("\nAdmin API");

  r = await fetch(`${BASE}/api/admin/leads`, { headers: auth });
  const list = await json(r);
  check(
    "lists leads, excluding the honeypot submission",
    r.status === 200 && list.total === 1,
    `total=${list.total}`
  );

  const leadId = list.items?.[0]?._id;
  r = await fetch(`${BASE}/api/admin/leads/${leadId}`, {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ status: "contacted", notes: "Called back Tuesday." }),
  });
  const patched = await json(r);
  check("updates lead status and notes", r.status === 200 && patched.lead.status === "contacted");

  console.log("\nContent");

  r = await fetch(`${BASE}/api/admin/testimonials`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      quote: "They treated my mother with real warmth and patience.",
      name: "Karen M.",
      relation: "Daughter of a client",
      rating: 5,
      published: false,
      consentOnFile: true,
    }),
  });
  const t = await json(r);
  check("creates a testimonial as an unpublished draft", r.status === 201);

  r = await fetch(`${BASE}/api/testimonials`);
  let pub = await json(r);
  check(
    "unpublished testimonials are hidden from the public endpoint",
    pub.items.length === 0,
    `saw ${pub.items.length}`
  );

  await fetch(`${BASE}/api/admin/testimonials/${t.item._id}`, {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ published: true }),
  });

  r = await fetch(`${BASE}/api/testimonials`);
  pub = await json(r);
  check("published testimonials appear on the public endpoint", pub.items.length === 1);
  check(
    "public payload omits internal fields",
    pub.items[0] && !("consentOnFile" in pub.items[0]),
    "consentOnFile leaked"
  );

  console.log("\nAdmin UI");

  r = await fetch(`${BASE}/admin`, { redirect: "manual" });
  check(
    "unauthenticated /admin redirects to login",
    r.status === 302 && (r.headers.get("location") || "").startsWith("/admin/login"),
    `got ${r.status}`
  );

  r = await fetch(`${BASE}/admin/login`);
  const html = await r.text();
  check("login page renders", r.status === 200 && html.includes("Admin sign in"));

  r = await fetch(`${BASE}/admin`, { headers: auth });
  const dash = await r.text();
  check("dashboard renders for an authenticated admin", r.status === 200 && dash.includes("Enquiries"));

  r = await fetch(`${BASE}/admin/testimonials`, { headers: auth });
  check("testimonials page renders", r.status === 200);

  r = await fetch(`${BASE}/admin/credentials`, { headers: auth });
  check("credentials page renders", r.status === 200);

  /* ================================================================ *
   * Blog
   * ================================================================ */

  const { Category, Author } = await import("../src/models/blog.js");
  const cat = await Category.create({ name: "Dementia care", slug: "dementia-care", description: "Guides on memory care." });
  const author = await Author.create({ name: "Test Author", slug: "test-author", jobTitle: "Care coordinator" });

  const jsonReq = (method, path, body, headers = auth) =>
    fetch(`${BASE}${path}`, { method, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });

  const longBody = (n) =>
    Array.from({ length: n }, (_, i) =>
      `Families often notice small changes first, and that is normal. Paragraph ${i} explains dementia care at home in plain words so readers can follow along.`
    ).join("\n\n");

  const article = `Dementia care at home helps a loved one stay safe and settled. This guide covers routines and support.

## Building a calm routine for dementia care at home
${longBody(6)}

<script>alert("xss")</script>

### Small steps that help
${longBody(4)}

## When to ask for help
Read our [care options](/#care) or book a [free consultation](/#consultation).`;

  console.log("\nBlog — publishing workflow");

  r = await jsonReq("POST", "/api/admin/blog/posts", {
    title: "Dementia Care at Home: A Practical Guide for Families",
    content: article,
    excerpt: "Practical steps for supporting a parent living with dementia at home.",
    category: String(cat._id),
    author: String(author._id),
    tags: "dementia, routines",
    focusKeyword: "dementia care at home",
    featuredImageUrl: "/uploads/test.jpg",
    featuredImageAlt: "A caregiver and an older woman looking at a photo album",
  });
  let body = await json(r);
  const postId = body.post?.id;
  const firstSlug = body.post?.slug;
  check("creates a draft post", r.status === 201 && Boolean(postId), `got ${r.status} ${JSON.stringify(body)}`);
  check("derives a clean slug from the title", firstSlug === "dementia-care-home-practical-guide-families", firstSlug);

  r = await fetch(`${BASE}/api/blog/posts`);
  body = await json(r);
  check("drafts are hidden from the public API", body.total === 0, `total=${body.total}`);

  r = await fetch(`${BASE}/api/blog/posts/${firstSlug}`);
  check("draft article URL returns 404", r.status === 404, `got ${r.status}`);

  r = await jsonReq("PATCH", `/api/admin/blog/posts/${postId}`, {
    title: "Dementia Care at Home: A Practical Guide for Families",
    slug: firstSlug, content: article, category: String(cat._id), author: String(author._id),
    focusKeyword: "dementia care at home", intent: "publish",
    featuredImageUrl: "/uploads/test.jpg", featuredImageAlt: "A caregiver and an older woman looking at a photo album",
  });
  body = await json(r);
  check("publishes the post", r.status === 200 && body.post?.status === "published", JSON.stringify(body));

  r = await fetch(`${BASE}/api/blog/posts`);
  body = await json(r);
  check("published post appears in the public list", body.total === 1 && body.items[0].category?.slug === "dementia-care");

  r = await fetch(`${BASE}/api/blog/posts/${firstSlug}`);
  body = await json(r);
  const articleHtml = body.post?.contentHtml || "";
  check("article renders with heading ids for the TOC", /<h2 id="building-a-calm-routine/.test(articleHtml) && body.post.toc.length >= 2);
  check("script tags are stripped from article HTML", !/<script/i.test(articleHtml));
  check("article has no H1 in the body", !/<h1/i.test(articleHtml));
  check("SEO is resolved server-side", body.post.seo?.canonical?.endsWith(`/blog/${firstSlug}`) && body.post.seo.title.length <= 60, JSON.stringify(body.post?.seo));
  check("reading time and author are included", body.post.readingMinutes >= 1 && body.post.author?.name === "Test Author");

  console.log("\nBlog — slugs & redirects");

  r = await jsonReq("PATCH", `/api/admin/blog/posts/${postId}`, {
    title: "Dementia Care at Home: A Practical Guide for Families", slug: "dementia-care-at-home",
    content: article, category: String(cat._id), author: String(author._id), intent: "save",
  });
  check("changing a live post's slug succeeds", r.status === 200);
  r = await fetch(`${BASE}/api/blog/posts/${firstSlug}`);
  body = await json(r);
  check("old slug returns a redirect to the new slug", body.redirect === "dementia-care-at-home", JSON.stringify(body));

  r = await jsonReq("POST", "/api/admin/blog/posts", { title: "Another post", slug: firstSlug, content: "Short." });
  check("an old slug can't be reused by another post", r.status === 409, `got ${r.status}`);

  console.log("\nBlog — scheduling, sitemap, preview");

  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  r = await jsonReq("POST", "/api/admin/blog/posts", {
    title: "Scheduled article about memory care", content: longBody(3), publishedAt: future, intent: "publish",
  });
  body = await json(r);
  const scheduledId = body.post?.id;
  check("a future publish date is stored as scheduled", r.status === 201);
  r = await fetch(`${BASE}/api/blog/posts`);
  check("scheduled posts stay hidden until their time", (await json(r)).total === 1);

  await jsonReq("POST", "/api/admin/blog/posts", {
    title: "Private noindex article", content: longBody(2), robotsIndex: false, intent: "publish",
  });
  r = await fetch(`${BASE}/api/blog/sitemap`);
  body = await json(r);
  const slugs = body.posts.map((p) => p.slug);
  check("sitemap lists indexable posts only", slugs.includes("dementia-care-at-home") && !slugs.includes("private-noindex-article"), slugs.join(","));
  check("sitemap lists categories with posts", body.categories.some((c) => c.slug === "dementia-care"));

  r = await fetch(`${BASE}/api/blog/preview/${scheduledId}?token=forged`);
  check("preview rejects a forged token", r.status === 401);
  r = await jsonReq("POST", `/api/admin/blog/posts/${scheduledId}/preview-link`, {});
  const previewLink = (await json(r)).url || "";
  const token = new URL(previewLink).searchParams.get("token");
  r = await fetch(`${BASE}/api/blog/preview/${scheduledId}?token=${encodeURIComponent(token)}`);
  check("signed preview link shows the unpublished post", r.status === 200 && (await json(r)).post?.title?.startsWith("Scheduled"));
  check("preview responses are noindex", r.headers.get("x-robots-tag")?.includes("noindex"));

  console.log("\nBlog — SEO tooling");

  r = await jsonReq("POST", "/api/admin/blog/analyze", { title: "Dementia Care at Home", content: article, focusKeyword: "dementia care at home", id: postId });
  body = await json(r);
  check("analyzer returns a score and a health label", typeof body.score === "number" && ["Excellent", "Needs improvement", "Issues detected"].includes(body.label), JSON.stringify({ s: body.score, l: body.label }));
  check("analyzer checks structure, readability and links", ["subheadings", "readability", "internal-links"].every((id) => body.checks.some((c) => c.id === id)));

  const stuffed = Array.from({ length: 40 }, () => "dementia care at home dementia care at home is dementia care at home.").join(" ");
  r = await jsonReq("POST", "/api/admin/blog/analyze", { title: "Dementia care at home", content: stuffed, focusKeyword: "dementia care at home" });
  body = await json(r);
  check("analyzer flags keyword stuffing as an error", body.checks.some((c) => c.id === "kw-density" && c.status === "bad"));

  r = await jsonReq("POST", "/api/admin/blog/auto-seo", { title: "Helping a Parent with Memory Loss Stay Safe at Home", content: article });
  body = await json(r);
  check("auto-SEO suggests title, description and slug", body.title && body.description && /^[a-z0-9-]+$/.test(body.slug), JSON.stringify(body));

  r = await jsonReq("POST", "/api/admin/blog/link-suggestions", { title: "Memory loss", content: "Supporting a parent with dementia and memory loss at home." });
  body = await json(r);
  check("link suggestions include a conversion page", body.items?.some((s) => s.url === "/#consultation"));
  check("link suggestions include the relevant service page", body.items?.some((s) => s.url === "/services/dementia-care"));

  console.log("\nBlog — uploads");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const upload = (buf, name, type) => {
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type }), name);
    fd.append("alt", "test image");
    return fetch(`${BASE}/api/admin/blog/media`, { method: "POST", headers: auth, body: fd });
  };
  r = await upload(png, "pixel.png", "image/png");
  body = await json(r);
  check("accepts a real PNG and names it from its alt text", r.status === 201 && /^\/uploads\/\d{4}\/\d{2}\/test-image-[0-9a-f]{8}\.png$/.test(body.item?.url || ""), body.item?.url);
  r = await fetch(`${BASE}${body.item.url}`);
  check("serves uploads with nosniff", r.status === 200 && r.headers.get("x-content-type-options") === "nosniff");
  const noAlt = new FormData();
  noAlt.append("file", new Blob([png], { type: "image/png" }), "../../Sunset Walk <script>.png");
  r = await fetch(`${BASE}/api/admin/blog/media`, { method: "POST", headers: auth, body: noAlt });
  body = await json(r);
  check("without alt text, names it from the sanitised original name", r.status === 201 && /^\/uploads\/\d{4}\/\d{2}\/sunset-walk-script-[0-9a-f]{8}\.png$/.test(body.item?.url || ""), body.item?.url);
  r = await upload(Buffer.from("<?php echo 'hi'; ?>"), "shell.png", "image/png");
  check("rejects a non-image disguised as .png", r.status === 400);
  r = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), "x.svg", "image/svg+xml");
  check("rejects SVG uploads", r.status === 400);

  console.log("\nBlog — permissions & request safety");

  await AdminUser.create({ email: "author@example.com", name: "Author", role: "author", passwordHash: await AdminUser.hashPassword("author-password-123") });
  r = await jsonReq("POST", "/api/auth/login", { email: "author@example.com", password: "author-password-123" }, {});
  const authorAuth = { cookie: (r.headers.get("set-cookie") || "").split(";")[0] };

  r = await jsonReq("POST", "/api/admin/blog/posts", { title: "Author draft post", content: "Draft text.", intent: "publish" }, authorAuth);
  check("authors cannot publish", r.status === 403, `got ${r.status}`);
  r = await jsonReq("POST", "/api/admin/blog/posts", { title: "Author draft post", content: "Draft text.", intent: "draft" }, authorAuth);
  check("authors can save drafts", r.status === 201);
  r = await jsonReq("PATCH", `/api/admin/blog/posts/${postId}`, { title: "Hijacked", content: "x" }, authorAuth);
  check("authors cannot edit other people's posts", r.status === 403, `got ${r.status}`);
  r = await fetch(`${BASE}/api/admin/leads`, { headers: authorAuth });
  check("non-admins cannot read enquiries", r.status === 403, `got ${r.status}`);

  r = await fetch(`${BASE}/api/admin/blog/analyze`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ title: "x" }),
  });
  check("rejects cross-site writes", r.status === 403, `got ${r.status}`);

  const big = longBody(700); // ~100kb, well past the global 64kb limit
  r = await jsonReq("POST", "/api/admin/blog/posts", { title: "A very long article", content: big });
  check("long articles (>64kb) save", r.status === 201, `got ${r.status} bytes=${big.length}`);

  r = await jsonReq("POST", `/api/admin/blog/posts/${postId}/duplicate`, {});
  body = await json(r);
  check("duplicates a post as a new draft", r.status === 201 && body.post.slug.includes("copy"));

  console.log("\nBlog — admin pages");
  for (const path of ["/admin/blog", "/admin/blog/new", `/admin/blog/${postId}/edit`, "/admin/blog/categories", "/admin/blog/tags", "/admin/blog/authors", "/admin/blog/media", "/admin/users"]) {
    r = await fetch(`${BASE}${path}`, { headers: auth });
    check(`${path} renders`, r.status === 200, `got ${r.status}`);
  }
  r = await fetch(`${BASE}/admin/users`, { headers: authorAuth });
  check("authors cannot open user management", r.status === 403, `got ${r.status}`);

  r = await jsonReq("PATCH", `/api/admin/blog/posts/${postId}`, {
    title: "Dementia Care at Home: A Practical Guide for Families", slug: "dementia-care-at-home", content: article, intent: "unpublish",
  });
  r = await fetch(`${BASE}/api/blog/posts/dementia-care-at-home`);
  check("unpublished posts return 404", r.status === 404, `got ${r.status}`);
} catch (err) {
  fail++;
  console.error("\nUnexpected error:", err);
} finally {
  server.close();
  await disconnectDb();
  await mongo.stop();

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
