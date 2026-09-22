import Anthropic from "@anthropic-ai/sdk";
import { aiEnabled, env } from "../config/env.js";
import { autoSeo } from "./seo.js";
import { slugify } from "./text.js";

/**
 * Optional AI-assisted SEO suggestions via the Claude API.
 *
 * Entirely server-side: the key comes from ANTHROPIC_API_KEY in the
 * backend environment and is never sent to the browser. Without a key, or
 * on any failure, callers get the built-in heuristic suggestions — the
 * editor never breaks because an external service is down.
 */

let client = null;
const getClient = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["seoTitle", "metaDescription", "focusKeyword", "secondaryKeywords", "slug"],
  properties: {
    seoTitle: { type: "string" },
    metaDescription: { type: "string" },
    focusKeyword: { type: "string" },
    secondaryKeywords: { type: "array", items: { type: "string" } },
    slug: { type: "string" },
  },
};

const SYSTEM = `You write search metadata for articles on the website of Snuggs & Huggs Senior Services, a non-medical in-home senior care agency serving Greater Seattle, WA. Readers are usually adult children researching care for an ageing parent.

Write metadata that accurately describes the article a reader will land on:
- seoTitle: at most 60 characters, specific, no clickbait, no ALL CAPS. May end with " | Snuggs & Huggs" only if it still fits.
- metaDescription: 140-158 characters, a plain-language summary that tells the searcher what they'll learn. No claims the article doesn't make.
- focusKeyword: the one phrase a person would most plausibly search to find this article, 2-4 words, lowercase.
- secondaryKeywords: 3-5 related phrases actually covered in the article, lowercase.
- slug: lowercase words joined by hyphens, 3-6 words, no stop words unless needed for meaning.

Never invent statistics, credentials, prices, or medical claims. Never keyword-stuff.`;

/**
 * @param {{ title: string, content: string, contentText?: string, contentHtml?: string, excerpt?: string }} post
 * @returns {Promise<{ title: string, description: string, focusKeyword: string, secondaryKeywords: string[], slug: string, excerpt: string, source: "ai" | "heuristic", note?: string }>}
 */
export async function suggestSeo(post) {
  const fallback = autoSeo(post);
  if (!aiEnabled) return fallback;

  // The article is the input the whole task depends on, so it is sent in
  // full rather than truncated (content is capped at 200k chars by the model).
  const article = `<title>${post.title || ""}</title>\n<article>\n${post.content || ""}\n</article>`;

  try {
    const response = await getClient().beta.messages.create({
      model: env.AI_MODEL,
      max_tokens: 16000,
      // Short, well-specified extraction: low effort is the right trade.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      // Server-side fallbacks: if the primary model declines, the API
      // retries on a suitable fallback model within the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: article }],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { ...fallback, note: `AI suggestion unavailable (${response.stop_reason}); used built-in suggestions.` };
    }

    const text = response.content.find((b) => b.type === "text")?.text || "";
    const parsed = JSON.parse(text);

    return {
      title: String(parsed.seoTitle || "").slice(0, 70) || fallback.title,
      description: String(parsed.metaDescription || "").slice(0, 170) || fallback.description,
      focusKeyword: String(parsed.focusKeyword || "").toLowerCase().slice(0, 80) || fallback.focusKeyword,
      secondaryKeywords: (parsed.secondaryKeywords || []).map((k) => String(k).toLowerCase().slice(0, 80)).slice(0, 6),
      // Normalise through our own slugify so the result always passes validation.
      slug: slugify(parsed.slug || "", { maxLength: 60 }) || fallback.slug,
      excerpt: fallback.excerpt,
      source: "ai",
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("AI SEO: ANTHROPIC_API_KEY was rejected");
    } else if (err instanceof Anthropic.RateLimitError) {
      console.warn("AI SEO: rate limited");
    } else if (err instanceof Anthropic.APIError) {
      console.error(`AI SEO: API error ${err.status}: ${err.message}`);
    } else {
      console.error("AI SEO:", err.message);
    }
    return { ...fallback, note: "AI suggestion failed; used built-in suggestions." };
  }
}
