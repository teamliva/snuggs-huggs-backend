import mongoose from "mongoose";
import { Post, visibleFilter } from "../models/blog.js";
import { SITE_PAGES } from "./sitePages.js";
import { suggestKeywords } from "./seo.js";
import { htmlToText, includesPhrase } from "./text.js";

/**
 * Internal-link suggestions for the article being written.
 *
 * Ranks (1) published posts on the same topic via the full-text index, and
 * (2) the website's own service and conversion sections by topic overlap.
 * Conversion links are always offered, because every care article should
 * give the reader an obvious next step.
 */
export async function suggestInternalLinks({ title = "", contentHtml = "", excludeId, existingLinks = [] }) {
  const contentText = htmlToText(contentHtml);
  const keywords = suggestKeywords({ title, contentText }, 10);
  const haystack = `${title} ${contentText}`.toLowerCase();
  const already = new Set(existingLinks);

  /** @type {{ title: string, url: string, type: string, reason: string, score: number }[]} */
  const out = [];

  if (keywords.length) {
    const filter = { ...visibleFilter(), $text: { $search: keywords.join(" ") } };
    if (excludeId && mongoose.isValidObjectId(excludeId)) filter._id = { $ne: excludeId };
    const posts = await Post.find(filter, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" } })
      .limit(6)
      .select("title slug excerpt")
      .lean();
    for (const p of posts) {
      const url = `/blog/${p.slug}`;
      if (already.has(url)) continue;
      const shared = keywords.filter((k) => includesPhrase(`${p.title} ${p.excerpt}`, k)).slice(0, 3);
      out.push({
        title: p.title,
        url,
        type: "post",
        reason: shared.length ? `Related topic: ${shared.join(", ")}` : "Related article",
        score: 10 + p.score,
      });
    }
  }

  for (const page of SITE_PAGES) {
    if (already.has(page.url)) continue;
    const hits = page.terms.filter((t) => haystack.includes(t));
    if (!hits.length && page.type !== "conversion") continue;
    out.push({
      title: page.title,
      url: page.url,
      type: page.type,
      reason: hits.length
        ? `Mentions ${hits.slice(0, 3).join(", ")}`
        : "Give readers a clear next step",
      score: hits.length * 3 + (page.type === "conversion" ? 4 : 0),
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}
