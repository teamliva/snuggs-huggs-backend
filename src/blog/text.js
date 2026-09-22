/**
 * Small text utilities shared by the Markdown pipeline, the SEO analyzer
 * and the auto-SEO generator.
 */

export const STOP_WORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before " +
    "being below between both but by can could did do does doing down during each few for " +
    "from further had has have having he her here hers herself him himself his how i if in " +
    "into is it its itself just me more most my myself no nor not now of off on once only or " +
    "other our ours ourselves out over own same she should so some such than that the their " +
    "theirs them themselves then there these they this those through to too under until up " +
    "very was we were what when where which while who whom why will with you your yours " +
    "yourself yourselves also may might must can't don't it's you're we're they're get got " +
    "one two new make many much well way even like use used using"
  ).split(/\s+/)
);

/** URL-safe slug: lowercase ASCII, hyphen-separated, no leading/trailing hyphens. */
export function slugify(input, { maxLength = 70, dropStopWords = false } = {}) {
  let words = String(input || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  if (dropStopWords && words.length > 4) {
    const kept = words.filter((w) => !STOP_WORDS.has(w));
    if (kept.length >= 2) words = kept;
  }

  let out = "";
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > maxLength) break;
    out = next;
  }
  return out || "post";
}

/** Strips HTML tags and collapses whitespace. */
export function htmlToText(html = "") {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|h[1-6]|li|blockquote|tr|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function words(text = "") {
  return String(text).toLowerCase().match(/[a-z0-9]+(?:['’][a-z]+)?/g) || [];
}

export function countWords(text = "") {
  return words(text).length;
}

/**
 * Cuts text to at most `max` characters on a word boundary, preferring to
 * end on a full sentence when one fits in the last 40% of the budget.
 */
export function truncateSmart(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
  if (sentenceEnd > max * 0.6) return slice.slice(0, sentenceEnd + 1);
  const wordEnd = slice.lastIndexOf(" ");
  return `${slice.slice(0, wordEnd > 0 ? wordEnd : max).replace(/[,;:\-–—]+$/, "")}…`;
}

/** Rough English syllable count, good enough for a readability score. */
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Splits prose into sentences, ignoring very short fragments. */
export function sentences(text = "") {
  return String(text)
    .replace(/\n+/g, ". ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) >= 3);
}

/**
 * Flesch Reading Ease. 60–70 is plain English; family-facing care content
 * should aim for 60+.
 */
export function fleschReadingEase(text = "") {
  const sents = sentences(text);
  const ws = words(text);
  if (!sents.length || ws.length < 30) return null;
  const syl = ws.reduce((sum, w) => sum + syllables(w), 0);
  const score = 206.835 - 1.015 * (ws.length / sents.length) - 84.6 * (syl / ws.length);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Case-insensitive whole-phrase occurrence count. */
export function countPhrase(text = "", phrase = "") {
  const p = String(phrase).trim().toLowerCase();
  if (!p) return 0;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return (String(text).toLowerCase().match(new RegExp(`\\b${escaped}\\b`, "g")) || []).length;
}

export function includesPhrase(text, phrase) {
  return countPhrase(text, phrase) > 0;
}
