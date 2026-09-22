import { extractImages, extractLinks, firstParagraph } from "./markdown.js";
import { DESC_MAX, DESC_MIN, TITLE_MAX, resolveSeo } from "./seo.js";
import { countPhrase, countWords, fleschReadingEase, htmlToText, includesPhrase, sentences } from "./text.js";

/**
 * SEO & content-quality analysis for the editor's SEO panel.
 *
 * Philosophy: this rewards writing that serves the reader — clear
 * structure, plain language, useful links, accurate metadata. Keyword checks
 * look for *natural* presence in the places that matter (title, intro, a
 * subheading) and actively penalise stuffing. Nothing here nudges an editor
 * to repeat a phrase for its own sake.
 *
 * @typedef {"good" | "warn" | "bad"} CheckStatus
 * @typedef {{ id: string, group: string, status: CheckStatus, message: string, weight: number }} Check
 */

const LABELS = [
  [80, "Excellent", "excellent"],
  [55, "Needs improvement", "needs-improvement"],
  [0, "Issues detected", "issues"],
];

/**
 * @param {object} post   Unsaved or saved post, with contentHtml/contentText rendered.
 * @param {object} ctx
 * @param {{ id?: string, seoTitle: string, description: string }[]} [ctx.others]  Other posts, for duplicate checks.
 */
export function analyzePost(post, { others = [] } = {}) {
  /** @type {Check[]} */
  const checks = [];
  const add = (id, group, status, message, weight = 1) =>
    checks.push({ id, group, status, message, weight });

  const seo = resolveSeo(post);
  const kw = (seo.focusKeyword || "").trim().toLowerCase();
  const text = post.contentText || htmlToText(post.contentHtml || "");
  const wordCount = countWords(text);
  const intro = firstParagraph(post.contentHtml || "");
  const headings = [...String(post.contentHtml || "").matchAll(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/g)].map(
    (m) => ({ level: Number(m[1]), text: htmlToText(m[2]) })
  );
  const { internal, external } = extractLinks(post.contentHtml);
  const images = extractImages(post.contentHtml);

  /* ---------------- Metadata ---------------- */

  const tLen = seo.title.length;
  if (!post.title?.trim()) add("title", "Metadata", "bad", "Add a title for the article.", 2);
  else if (tLen > TITLE_MAX)
    add("seo-title-length", "Metadata", "warn", `SEO title is ${tLen} characters; Google usually cuts off around ${TITLE_MAX}. Shorten it so the key words stay visible.`, 1.5);
  else if (tLen < 30)
    add("seo-title-length", "Metadata", "warn", `SEO title is only ${tLen} characters. A more descriptive title (30–60) tends to earn more clicks.`, 1.5);
  else add("seo-title-length", "Metadata", "good", `SEO title length is good (${tLen} characters).`, 1.5);

  const dLen = seo.description.length;
  const descTyped = Boolean(post.seo?.description);
  if (!dLen)
    add("meta-description", "Metadata", "bad", "No meta description — write one, or add an introduction it can be generated from.", 1.5);
  else if (dLen < DESC_MIN)
    add("meta-description", "Metadata", "warn", `Meta description is ${dLen} characters. Aim for ${DESC_MIN}–${DESC_MAX} so it fills the search snippet.`, 1.5);
  else if (dLen > DESC_MAX)
    add("meta-description", "Metadata", "warn", `Meta description is ${dLen} characters and will be truncated after ~${DESC_MAX}.`, 1.5);
  else
    add("meta-description", "Metadata", "good", `Meta description length is good (${dLen} characters)${descTyped ? "" : ", generated from your introduction"}.`, 1.5);

  if (!descTyped && dLen)
    add("meta-description-custom", "Metadata", "warn", "The meta description is auto-generated. A hand-written one that answers the searcher's question usually performs better.", 0.5);

  const slug = post.slug || "";
  if (!slug) add("slug", "Metadata", "bad", "Set a URL slug.");
  else if (slug.length > 60)
    add("slug", "Metadata", "warn", `The URL slug is long (${slug.length} characters). Short, descriptive slugs are easier to share and read.`);
  else if (slug.split("-").length > 8)
    add("slug", "Metadata", "warn", "The URL slug has many words. Keep only the ones that describe the topic.");
  else add("slug", "Metadata", "good", "URL slug is short and readable.");

  const dupTitle = others.find((o) => o.seoTitle && o.seoTitle.toLowerCase() === seo.title.toLowerCase());
  const dupDesc = others.find(
    (o) => o.description && o.description.toLowerCase() === seo.description.toLowerCase()
  );
  if (dupTitle || dupDesc) {
    add(
      "duplicates",
      "Metadata",
      "bad",
      `${dupTitle ? `SEO title duplicates “${dupTitle.title}”. ` : ""}${dupDesc ? `Meta description duplicates “${dupDesc.title}”.` : ""} Each page needs unique metadata so search engines can tell them apart.`.trim(),
      1.5
    );
  } else {
    add("duplicates", "Metadata", "good", "SEO title and meta description are unique across the blog.", 1.5);
  }

  /* ---------------- Focus keyword ---------------- */

  if (!kw) {
    add("keyword", "Keyword", "warn", "Set a focus keyword — the main question or topic a reader would search for. It unlocks the keyword checks.", 1.5);
  } else {
    const inTitle = includesPhrase(seo.title, kw) || includesPhrase(post.title, kw);
    add("kw-title", "Keyword", inTitle ? "good" : "warn",
      inTitle ? "Focus keyword appears in the title." : "The focus keyword isn't in the title. Include it if it reads naturally.", 1.5);

    const inDesc = includesPhrase(seo.description, kw);
    add("kw-description", "Keyword", inDesc ? "good" : "warn",
      inDesc ? "Focus keyword appears in the meta description." : "Mention the focus keyword in the meta description — Google bolds matching terms in results.");

    const slugHit = kw.split(/\s+/).every((w) => slug.includes(w));
    add("kw-slug", "Keyword", slugHit ? "good" : "warn",
      slugHit ? "URL slug reflects the focus keyword." : "Consider including the focus keyword's words in the URL slug.", 0.75);

    const inIntro = includesPhrase(intro, kw);
    add("kw-intro", "Keyword", inIntro ? "good" : "warn",
      inIntro ? "Focus keyword appears in the introduction." : "Address the focus topic in your opening paragraph so readers know they're in the right place.");

    const inSub = headings.some((h) => includesPhrase(h.text, kw));
    add("kw-subheading", "Keyword", inSub ? "good" : "warn",
      inSub ? "Focus keyword (or topic) appears in a subheading." : "Use the focus topic in at least one subheading where it fits naturally.", 0.75);

    if (wordCount >= 100) {
      const occurrences = countPhrase(text, kw);
      const density = (occurrences * kw.split(/\s+/).length * 100) / wordCount;
      if (density > 3)
        add("kw-density", "Keyword", "bad", `The focus keyword makes up ${density.toFixed(1)}% of the text. That reads as keyword stuffing — use synonyms and natural variations instead.`, 1.5);
      else if (occurrences === 0)
        add("kw-density", "Keyword", "warn", "The focus keyword doesn't appear in the body text.", 1);
      else
        add("kw-density", "Keyword", "good", `Focus keyword is used naturally (${occurrences}×, ${density.toFixed(1)}%).`, 1);
    }

    const secondary = seo.secondaryKeywords.filter(Boolean);
    if (secondary.length) {
      const covered = secondary.filter((s) => includesPhrase(text, s));
      add("kw-secondary", "Keyword", covered.length === secondary.length ? "good" : "warn",
        covered.length === secondary.length
          ? "All secondary keywords are covered in the text."
          : `Not yet covered: ${secondary.filter((s) => !covered.includes(s)).join(", ")}.`, 0.5);
    }
  }

  /* ---------------- Content ---------------- */

  if (wordCount < 300)
    add("length", "Content", "bad", `The article has ${wordCount} words. Under 300 rarely answers a question fully — aim for 600+ for a helpful guide.`, 1.5);
  else if (wordCount < 600)
    add("length", "Content", "warn", `${wordCount} words. Fine for a short update; in-depth guides usually run 800–2,000.`, 1.5);
  else add("length", "Content", "good", `${wordCount.toLocaleString("en-US")} words — enough depth to be genuinely useful.`, 1.5);

  if (!post.excerpt?.trim())
    add("excerpt", "Content", "warn", "Add a short excerpt — it's shown on blog cards and used for sharing.", 0.5);
  else add("excerpt", "Content", "good", "Excerpt is set.", 0.5);

  /* ---------------- Structure ---------------- */

  if (/<h1[\s>]/.test(post.contentHtml || ""))
    add("h1", "Structure", "bad", "The body contains an H1. The article title is the page's H1 — use H2 for sections.");
  else add("h1", "Structure", "good", "Exactly one H1 (the article title).");

  const h2s = headings.filter((h) => h.level === 2).length;
  if (wordCount >= 300 && h2s === 0)
    add("subheadings", "Structure", "bad", "No H2 subheadings. Break the article into sections so readers can scan it.", 1.25);
  else if (wordCount >= 600 && h2s < 2)
    add("subheadings", "Structure", "warn", "Only one H2. Longer articles are easier to scan with a subheading every 250–350 words.", 1.25);
  else if (h2s) add("subheadings", "Structure", "good", `${h2s} H2 section${h2s === 1 ? "" : "s"} — good scannable structure.`, 1.25);

  let skipped = false;
  let prev = 1;
  for (const h of headings) {
    if (h.level > prev + 1) skipped = true;
    prev = h.level;
  }
  if (skipped) add("heading-order", "Structure", "warn", "A heading level is skipped (e.g. H2 straight to H4). Keep the outline in order for screen readers.", 0.75);
  else if (headings.length) add("heading-order", "Structure", "good", "Heading levels are in logical order.", 0.75);

  /* ---------------- Readability ---------------- */

  const flesch = fleschReadingEase(text);
  if (flesch === null) {
    // Too short to score meaningfully; the length check already flags it.
  } else if (flesch >= 60)
    add("readability", "Readability", "good", `Reading ease ${flesch}/100 — plain, easy-to-follow language.`, 1.25);
  else if (flesch >= 45)
    add("readability", "Readability", "warn", `Reading ease ${flesch}/100 — somewhat difficult. Families researching care often read under stress; shorter sentences and everyday words help.`, 1.25);
  else
    add("readability", "Readability", "bad", `Reading ease ${flesch}/100 — hard to read. Shorten sentences and replace jargon with plain words.`, 1.25);

  const sents = sentences(text);
  if (sents.length >= 5) {
    const long = sents.filter((s) => countWords(s) > 25).length;
    const pct = Math.round((long / sents.length) * 100);
    add("sentence-length", "Readability", pct > 25 ? "warn" : "good",
      pct > 25 ? `${pct}% of sentences are over 25 words. Aim for under 25%.` : "Sentence length is comfortable.", 0.75);
  }

  const paras = [...String(post.contentHtml || "").matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => countWords(htmlToText(m[1])));
  const longParas = paras.filter((n) => n > 150).length;
  if (longParas)
    add("paragraphs", "Readability", "warn", `${longParas} paragraph${longParas === 1 ? " is" : "s are"} over 150 words. Split long paragraphs — they're hard to read on a phone.`, 0.5);

  /* ---------------- Links ---------------- */

  if (!internal.length)
    add("internal-links", "Links", "warn", "No internal links. Link to a related article or service so readers (and search engines) can find more — use the suggestions below.", 1);
  else add("internal-links", "Links", "good", `${internal.length} internal link${internal.length === 1 ? "" : "s"}.`, 1);

  if (!internal.some((h) => /#consultation|tel:|\/contact/.test(h)))
    add("conversion-link", "Links", "warn", "No link to the free consultation. Give readers a clear next step.", 0.5);

  if (!external.length && wordCount >= 600)
    add("external-links", "Links", "warn", "No external links. Citing a trustworthy source (e.g. a health authority) supports the article's credibility.", 0.5);
  else if (external.length) add("external-links", "Links", "good", `${external.length} external source link${external.length === 1 ? "" : "s"}.`, 0.5);

  /* ---------------- Images ---------------- */

  if (!post.featuredImage?.url)
    add("featured-image", "Images", "warn", "No featured image. Posts with an image get far more clicks when shared, and it's required for rich article results.", 1);
  else if (!post.featuredImage.alt?.trim())
    add("featured-image", "Images", "bad", "The featured image has no alt text. Describe what it shows for screen-reader users.", 1);
  else add("featured-image", "Images", "good", "Featured image has alt text.", 1);

  const missingAlt = images.filter((i) => !i.alt.trim()).length;
  if (images.length)
    add("image-alt", "Images", missingAlt ? "bad" : "good",
      missingAlt ? `${missingAlt} image${missingAlt === 1 ? "" : "s"} in the article ${missingAlt === 1 ? "has" : "have"} no alt text.` : "All article images have alt text.", 1);

  /* ---------------- Schema & indexing ---------------- */

  const schemaGaps = [];
  if (!post.author) schemaGaps.push("an author");
  if (!post.featuredImage?.url) schemaGaps.push("an image");
  if (!post.category) schemaGaps.push("a category");
  add("schema", "Schema", schemaGaps.length ? "warn" : "good",
    schemaGaps.length
      ? `Article structured data is generated, but it's missing ${schemaGaps.join(", ")}. Complete it for rich results.`
      : `${seo.schemaType} structured data is complete (headline, author, image, dates, publisher).`, 1);

  if (!seo.robots.index)
    add("robots", "Schema", "warn", "This post is set to noindex — it won't appear in search results.", 0.5);

  /* ---------------- Score ---------------- */

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + c.weight * (c.status === "good" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  let score = total ? Math.round((earned / total) * 100) : 0;
  // Any hard error caps the label below "Excellent" — a great score shouldn't hide a real problem.
  const hasBad = checks.some((c) => c.status === "bad");
  if (hasBad) score = Math.min(score, 79);

  const [, label, level] = LABELS.find(([min]) => score >= min);
  const order = { bad: 0, warn: 1, good: 2 };
  checks.sort((a, b) => order[a.status] - order[b.status]);

  return {
    score,
    label,
    level,
    counts: {
      bad: checks.filter((c) => c.status === "bad").length,
      warn: checks.filter((c) => c.status === "warn").length,
      good: checks.filter((c) => c.status === "good").length,
    },
    stats: { wordCount, readingEase: flesch, internalLinks: internal.length, externalLinks: external.length, images: images.length },
    resolved: seo,
    checks: checks.map(({ weight, ...c }) => c),
  };
}
