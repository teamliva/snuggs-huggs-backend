import { env } from "../config/env.js";
import { firstParagraph } from "./markdown.js";
import { STOP_WORDS, slugify, truncateSmart, words } from "./text.js";

/**
 * SEO resolution and automatic defaults.
 *
 * resolveSeo() is the single place that decides what a post's effective
 * SEO title, description, canonical URL, social tags and robots directives
 * are. The public API, the editor's live preview and the analyzer all call
 * it, so what an editor sees scored is exactly what gets published.
 */

export const BRAND_SUFFIX = " | Snuggs & Huggs";
export const TITLE_MAX = 60;
export const DESC_MIN = 120;
export const DESC_MAX = 160;

export const absoluteUrl = (path = "") =>
  /^https?:\/\//i.test(path)
    ? path
    : `${env.PUBLIC_SITE_URL}/${String(path).replace(/^\/+/, "")}`;

export const postPath = (slug) => `/blog/${slug}`;

/** Default <title>: the headline, with the brand appended when it fits. */
export function autoSeoTitle(title = "") {
  const t = String(title).trim();
  if (!t) return "";
  if ((t + BRAND_SUFFIX).length <= TITLE_MAX) return t + BRAND_SUFFIX;
  return t.length <= TITLE_MAX ? t : truncateSmart(t, TITLE_MAX);
}

/** Default meta description: excerpt, else the opening paragraph. */
export function autoDescription(post) {
  const source = post.excerpt?.trim() || firstParagraph(post.contentHtml) || "";
  return truncateSmart(source, 158);
}

export function autoExcerpt(post) {
  return truncateSmart(firstParagraph(post.contentHtml) || "", 220);
}

/**
 * Candidate keyphrases by frequency. Title terms are weighted heavily and
 * two-word phrases are preferred — "memory care" is a searchable topic,
 * "memory" on its own rarely is.
 */
export function suggestKeywords(post, limit = 8) {
  const titleWords = words(post.title || "");
  const bodyWords = words(post.contentText || "");
  const counts = new Map();
  const bump = (k, n) => counts.set(k, (counts.get(k) || 0) + n);

  const scan = (list, weight) => {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.length > 2 && !STOP_WORDS.has(a) && !/^\d+$/.test(a)) bump(a, weight);
      const b = list[i + 1];
      if (b && !STOP_WORDS.has(a) && !STOP_WORDS.has(b) && a.length > 2 && b.length > 2) {
        bump(`${a} ${b}`, weight * 1.6);
      }
    }
  };
  scan(bodyWords, 1);
  scan(titleWords, 5);

  return [...counts.entries()]
    .filter(([k, n]) => n >= 2 || k.includes(" "))
    .sort((x, y) => y[1] - x[1])
    .map(([k]) => k)
    // Drop single words already covered by a stronger phrase.
    .filter((k, i, all) => k.includes(" ") || !all.slice(0, i).some((p) => p.split(" ").includes(k)))
    .slice(0, limit);
}

/** Heuristic SEO defaults for fields the editor left blank. */
export function autoSeo(post) {
  const keywords = suggestKeywords(post);
  const focus =
    keywords.find((k) => k.includes(" ") && (post.title || "").toLowerCase().includes(k)) ||
    keywords[0] ||
    "";
  return {
    title: autoSeoTitle(post.title),
    description: autoDescription(post),
    slug: slugify(post.title, { maxLength: 60, dropStopWords: true }),
    excerpt: autoExcerpt(post),
    focusKeyword: focus,
    secondaryKeywords: keywords.filter((k) => k !== focus).slice(0, 5),
    source: "heuristic",
  };
}

/**
 * Effective, fully-populated SEO for a post. Explicit editor values always
 * win; anything blank falls back to a derived default.
 */
export function resolveSeo(post) {
  const seo = post.seo || {};
  const title = seo.title || autoSeoTitle(post.title);
  const description = seo.description || autoDescription(post);
  const canonical = seo.canonicalUrl || absoluteUrl(postPath(post.slug));
  const image = seo.ogImage || post.featuredImage?.url || "";

  return {
    title,
    description,
    canonical,
    focusKeyword: seo.focusKeyword || "",
    secondaryKeywords: seo.secondaryKeywords || [],
    robots: {
      index: seo.robotsIndex !== false,
      follow: seo.robotsFollow !== false,
    },
    schemaType: seo.schemaType || "BlogPosting",
    openGraph: {
      title: seo.ogTitle || title,
      description: seo.ogDescription || description,
      image: image ? absoluteUrl(image) : "",
      imageAlt: post.featuredImage?.alt || post.title,
    },
    twitter: {
      card: seo.twitterCard || "summary_large_image",
      title: seo.twitterTitle || seo.ogTitle || title,
      description: seo.twitterDescription || seo.ogDescription || description,
    },
  };
}
