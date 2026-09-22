import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { env } from "../config/env.js";
import { countWords, htmlToText, slugify } from "./text.js";

/**
 * Markdown -> safe, semantic HTML. Runs once at save time; public pages
 * serve the stored result and never parse or sanitize on a request.
 *
 * Guarantees about the output:
 *  - No <h1>. The article title is the page's only h1, so a "# Heading"
 *    in the body is demoted to h2. h5/h6 are folded into h4 to keep the
 *    outline shallow and readable.
 *  - Every h2-h4 carries a stable, unique id, used by the table of contents.
 *  - Only an allowlist of tags/attributes survives. No scripts, styles,
 *    event handlers, iframes or javascript: URLs, whatever the author typed.
 *  - External links open safely (rel="noopener noreferrer"); images lazy-load.
 */

marked.setOptions({ gfm: true, breaks: false });

function isExternal(href = "") {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).host !== new URL(env.PUBLIC_SITE_URL).host;
  } catch {
    return true;
  }
}

const SANITIZE = {
  allowedTags: [
    "h2", "h3", "h4", "p", "br", "hr", "strong", "em", "del", "s", "code", "pre",
    "blockquote", "ul", "ol", "li", "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
    code: ["class"],
    ol: ["start"],
    th: ["align"],
    td: ["align"],
  },
  allowedClasses: { code: [/^language-[a-z0-9+#-]+$/] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  transformTags: {
    h1: "h2",
    h5: "h4",
    h6: "h4",
    a: (tagName, attribs) => {
      const out = { href: attribs.href || "" };
      if (attribs.title) out.title = attribs.title;
      if (isExternal(out.href)) {
        out.rel = "noopener noreferrer";
        out.target = "_blank";
      }
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: "lazy", decoding: "async", alt: attribs.alt ?? "" },
    }),
  },
};

/**
 * @param {string} markdown
 * @returns {{ html: string, text: string, toc: {id:string,text:string,level:number}[], wordCount: number, readingMinutes: number }}
 */
export function renderMarkdown(markdown = "") {
  const raw = marked.parse(String(markdown || ""));
  const safe = sanitizeHtml(raw, SANITIZE);

  const toc = [];
  const used = new Map();
  const html = safe.replace(/<h([2-4])>([\s\S]*?)<\/h\1>/g, (_m, level, inner) => {
    const text = htmlToText(inner);
    let id = slugify(text, { maxLength: 60 }) || "section";
    const n = used.get(id) || 0;
    used.set(id, n + 1);
    if (n) id = `${id}-${n + 1}`;
    toc.push({ id, text, level: Number(level) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });

  const text = htmlToText(html);
  const wordCount = countWords(text);
  // ~225 wpm is a common adult reading speed for web prose.
  const readingMinutes = Math.max(1, Math.round(wordCount / 225));

  return { html, text, toc, wordCount, readingMinutes };
}

/** First real paragraph of the article, as plain text. */
export function firstParagraph(html = "") {
  const m = String(html).match(/<p>([\s\S]*?)<\/p>/);
  return m ? htmlToText(m[1]) : "";
}

/** Links found in rendered HTML, split into internal and external. */
export function extractLinks(html = "") {
  const internal = [];
  const external = [];
  for (const m of String(html).matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    const href = m[1];
    if (/^(mailto|tel):/i.test(href)) continue;
    (isExternal(href) ? external : internal).push(href);
  }
  return { internal, external };
}

/** Images in rendered HTML with their alt text. */
export function extractImages(html = "") {
  return [...String(html).matchAll(/<img\s[^>]*>/g)].map((m) => {
    const tag = m[0];
    const src = (tag.match(/src="([^"]*)"/) || [])[1] || "";
    const alt = (tag.match(/alt="([^"]*)"/) || [])[1] ?? "";
    return { src, alt };
  });
}
