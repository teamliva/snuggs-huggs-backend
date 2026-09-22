/* Blog editor: Markdown editing, live SEO analysis, suggestions, uploads. */
(function () {
  "use strict";

  const form = document.getElementById("post-form");
  if (!form) return;

  const $ = (id) => document.getElementById(id);
  const postId = form.dataset.postId || "";
  const siteUrl = form.dataset.siteUrl || "";
  const publishedOnce = form.dataset.publishedOnce === "1";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function api(path, body, opts = {}) {
    const res = await fetch(`/api/admin/blog${path}`, {
      method: "POST",
      headers: opts.raw ? undefined : { "content-type": "application/json" },
      body: opts.raw ? body : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  /* ------------------------------------------------------------ *
   * Markdown editor
   * ------------------------------------------------------------ */

  let dirty = false;
  let submitting = false;

  const btn = (name, text, title, action) => ({ name, text, title, action, className: `tb-${name}` });

  const mde = new window.EasyMDE({
    element: $("content"),
    forceSync: true,
    spellChecker: false, // the bundled checker downloads dictionaries from a CDN
    nativeSpellcheck: true,
    autoDownloadFontAwesome: false,
    status: ["lines", "words"],
    minHeight: "460px",
    placeholder: "Start writing… Use ## for sections and ### for sub-sections.",
    renderingConfig: { singleLineBreaks: false },
    toolbar: [
      btn("h2", "H2", "Section heading (H2)", window.EasyMDE.toggleHeading2),
      btn("h3", "H3", "Sub-heading (H3)", window.EasyMDE.toggleHeading3),
      "|",
      btn("bold", "B", "Bold", window.EasyMDE.toggleBold),
      btn("italic", "I", "Italic", window.EasyMDE.toggleItalic),
      btn("quote", "❝", "Quote", window.EasyMDE.toggleBlockquote),
      "|",
      btn("ul", "• List", "Bulleted list", window.EasyMDE.toggleUnorderedList),
      btn("ol", "1. List", "Numbered list", window.EasyMDE.toggleOrderedList),
      btn("table", "Table", "Insert table", window.EasyMDE.drawTable),
      btn("hr", "—", "Divider", window.EasyMDE.drawHorizontalRule),
      "|",
      btn("link", "Link", "Insert link", window.EasyMDE.drawLink),
      btn("image", "Image ⬆", "Upload and insert an image", () => pickInlineImage()),
      "|",
      btn("preview", "Preview", "Toggle preview", window.EasyMDE.togglePreview),
      btn("side", "Side-by-side", "Side-by-side preview", window.EasyMDE.toggleSideBySide),
      btn("fullscreen", "Full screen", "Full screen", window.EasyMDE.toggleFullScreen),
      btn("guide", "?", "Markdown guide", () => window.open("https://www.markdownguide.org/basic-syntax/", "_blank", "noopener")),
    ],
  });
  // EasyMDE's own preview is sanitised by the server on save; this only
  // affects what the author sees while typing.
  mde.codemirror.on("change", () => { dirty = true; scheduleAnalyze(); });

  /* ------------------------------------------------------------ *
   * Unsaved-changes guard & confirmations
   * ------------------------------------------------------------ */

  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("submit", (e) => {
    const confirmMsg = e.submitter?.dataset.confirm;
    if (confirmMsg && !window.confirm(confirmMsg)) { e.preventDefault(); return; }
    submitting = true;
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty && !submitting) { e.preventDefault(); e.returnValue = ""; }
  });
  document.querySelectorAll("form[data-confirm]").forEach((f) =>
    f.addEventListener("submit", (e) => {
      if (!window.confirm(f.dataset.confirm)) e.preventDefault(); else submitting = true;
    })
  );

  /* ------------------------------------------------------------ *
   * Slug
   * ------------------------------------------------------------ */

  const STOP = new Set("a an and are as at be but by for from how in into is it its of on or that the this to was what when where which who why will with your you".split(" "));
  function slugify(s) {
    let w = String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/&/g, " and ").replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
    if (w.length > 4) { const k = w.filter((x) => !STOP.has(x)); if (k.length >= 2) w = k; }
    let out = "";
    for (const x of w) { const n = out ? `${out}-${x}` : x; if (n.length > 60) break; out = n; }
    return out;
  }

  const slug = $("slug");
  let slugTouched = Boolean(slug.value);
  slug.addEventListener("input", () => {
    slugTouched = true;
    slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-");
    $("slug-note").hidden = !publishedOnce;
  });
  $("title").addEventListener("input", () => {
    if (!slugTouched && !publishedOnce) slug.value = slugify($("title").value);
  });
  $("slug-regen").addEventListener("click", () => {
    slug.value = slugify($("title").value);
    slugTouched = true;
    $("slug-note").hidden = !publishedOnce;
    scheduleAnalyze();
  });

  /* ------------------------------------------------------------ *
   * Publish button label: Publish / Schedule / Update
   * ------------------------------------------------------------ */

  const publishBtn = $("publish-btn");
  const publishedAt = $("publishedAt");
  function syncPublishLabel() {
    if (!publishBtn || !publishedAt) return;
    const future = publishedAt.value && new Date(publishedAt.value) > new Date();
    if (future) publishBtn.textContent = "Schedule";
    else publishBtn.textContent = publishBtn.dataset.base || publishBtn.textContent;
  }
  if (publishBtn) publishBtn.dataset.base = publishBtn.textContent.trim();
  publishedAt?.addEventListener("change", syncPublishLabel);
  syncPublishLabel();

  /* ------------------------------------------------------------ *
   * Character counters
   * ------------------------------------------------------------ */

  let resolved = null; // effective SEO values from the last analysis

  function updateCounters() {
    document.querySelectorAll("[data-count-for]").forEach((el) => {
      const input = $(el.dataset.countFor);
      let len = input.value.trim().length;
      let auto = false;
      if (!len && el.hasAttribute("data-auto") && resolved) {
        const v = el.dataset.countFor === "seoTitle" ? resolved.title : resolved.description;
        len = (v || "").length;
        auto = true;
      }
      const min = Number(el.dataset.min), max = Number(el.dataset.max);
      el.textContent = len ? `${len}/${max}${auto ? " auto" : ""}` : "";
      el.className = `counter ${!len ? "" : len > max ? "bad" : len < min ? "warn" : "ok"}`;
    });
  }
  form.addEventListener("input", updateCounters);

  /* ------------------------------------------------------------ *
   * Live SEO analysis
   * ------------------------------------------------------------ */

  function collect() {
    const f = new FormData(form);
    const val = (k) => (f.get(k) ?? "").toString();
    return {
      id: postId,
      title: val("title"),
      slug: val("slug"),
      excerpt: val("excerpt"),
      content: mde.value(),
      featuredImageUrl: val("featuredImageUrl"),
      featuredImageAlt: val("featuredImageAlt"),
      category: val("category"),
      author: val("author"),
      seoTitle: val("seoTitle"),
      seoDescription: val("seoDescription"),
      focusKeyword: val("focusKeyword"),
      secondaryKeywords: val("secondaryKeywords"),
      canonicalUrl: val("canonicalUrl"),
      ogImage: val("ogImage"),
      robotsIndex: $("robotsIndex").checked,
      robotsFollow: $("robotsFollow").checked,
      schemaType: val("schemaType"),
    };
  }

  let timer = null;
  let seq = 0;
  let showAll = false;
  let lastResult = null;

  function scheduleAnalyze() {
    clearTimeout(timer);
    timer = setTimeout(analyze, 700);
  }

  async function analyze() {
    const mine = ++seq;
    try {
      const r = await api("/analyze", collect());
      if (mine !== seq) return; // a newer request superseded this one
      lastResult = r;
      resolved = r.resolved;
      render(r);
      updateCounters();
    } catch (e) {
      $("seo-label").textContent = "Analysis unavailable";
      $("seo-counts").textContent = e.message;
    }
  }

  function render(r) {
    const box = $("seo-score");
    box.className = `seo-score lvl-${r.level}`;
    box.querySelector(".seo-dial").style.setProperty("--p", r.score);
    $("seo-num").textContent = r.score;
    $("seo-label").textContent = r.label;
    $("seo-counts").textContent = `${r.counts.bad} issue${r.counts.bad === 1 ? "" : "s"} · ${r.counts.warn} suggestion${r.counts.warn === 1 ? "" : "s"} · ${r.stats.wordCount} words`;

    const path = `/blog/${collect().slug || "your-post"}`;
    $("serp-url").textContent = (r.resolved.canonical || siteUrl + path).replace(/^https?:\/\//, "").replace(/\//g, " › ");
    $("serp-title").textContent = r.resolved.title || "Untitled";
    $("serp-desc").textContent = r.resolved.description || "Add an excerpt or meta description.";

    const list = r.checks.filter((c) => showAll || c.status !== "good");
    $("seo-checks").innerHTML = list.length
      ? list.map((c) => `<li class="${c.status}"><span><span class="grp">${esc(c.group)}:</span>${esc(c.message)}</span></li>`).join("")
      : `<li class="good"><span>Everything checks out.</span></li>`;
    $("seo-show-all").textContent = showAll ? "Hide passed checks" : `Show passed checks (${r.counts.good})`;
  }

  $("seo-show-all").addEventListener("click", () => {
    showAll = !showAll;
    if (lastResult) render(lastResult);
  });
  form.addEventListener("input", scheduleAnalyze);
  form.addEventListener("change", scheduleAnalyze);

  /* ------------------------------------------------------------ *
   * Suggest SEO (AI when configured, heuristics otherwise)
   * ------------------------------------------------------------ */

  $("auto-seo").addEventListener("click", async () => {
    const b = $("auto-seo");
    const note = $("auto-seo-note");
    b.disabled = true;
    const label = b.textContent;
    b.textContent = "Thinking…";
    try {
      const s = await api("/auto-seo", collect());
      const fill = (id, value) => {
        const el = $(id);
        if (!value || !el) return false;
        // Never overwrite what an editor typed without asking.
        if (el.value.trim() && el.value.trim() !== value &&
            !window.confirm(`Replace the current ${el.labels?.[0]?.firstChild?.textContent?.trim() || id}?\n\nCurrent: ${el.value}\nSuggested: ${value}`)) return false;
        el.value = value;
        return true;
      };
      const changed = [
        fill("seoTitle", s.title),
        fill("seoDescription", s.description),
        fill("focusKeyword", s.focusKeyword),
        fill("secondaryKeywords", (s.secondaryKeywords || []).join(", ")),
        !$("excerpt").value.trim() && fill("excerpt", s.excerpt),
        !publishedOnce && !slugTouched && fill("slug", s.slug),
      ].filter(Boolean).length;
      note.hidden = false;
      note.textContent = `${s.source === "ai" ? "AI" : "Built-in"} suggestions applied to ${changed} field${changed === 1 ? "" : "s"}. Review them — you can edit anything.${s.note ? " " + s.note : ""}`;
      dirty = true;
      updateCounters();
      analyze();
    } catch (e) {
      note.hidden = false;
      note.textContent = e.message;
    } finally {
      b.disabled = false;
      b.textContent = label;
    }
  });

  /* ------------------------------------------------------------ *
   * Internal link suggestions
   * ------------------------------------------------------------ */

  $("find-links").addEventListener("click", async () => {
    const ul = $("link-suggestions");
    ul.innerHTML = `<li class="muted">Searching…</li>`;
    try {
      const { items } = await api("/link-suggestions", collect());
      if (!items.length) { ul.innerHTML = `<li class="muted">No suggestions yet — write a little more first.</li>`; return; }
      ul.innerHTML = items.map((s, i) =>
        `<li><div class="kind">${esc(s.type === "post" ? "Article" : s.type === "conversion" ? "Next step" : "Service page")}</div>
          <strong>${esc(s.title)}</strong><div class="why">${esc(s.reason)}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-link="${i}">Insert link</button></li>`).join("");
      ul.querySelectorAll("[data-link]").forEach((b) =>
        b.addEventListener("click", () => {
          const s = items[Number(b.dataset.link)];
          const cm = mde.codemirror;
          const selected = cm.getSelection();
          // Descriptive anchor text: the selected words, else the page title.
          cm.replaceSelection(`[${selected || s.title}](${s.url})`);
          cm.focus();
          b.textContent = "Inserted ✓";
          b.disabled = true;
        })
      );
    } catch (e) {
      ul.innerHTML = `<li class="muted">${esc(e.message)}</li>`;
    }
  });

  /* ------------------------------------------------------------ *
   * Images
   * ------------------------------------------------------------ */

  async function upload(file, alt) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("alt", alt || "");
    const { item } = await api("/media", fd, { raw: true });
    return item;
  }

  function setFeatured(url, alt) {
    $("featuredImageUrl").value = url || "";
    if (alt !== undefined && !$("featuredImageAlt").value.trim()) $("featuredImageAlt").value = alt;
    $("fi-preview").innerHTML = url ? `<img src="${esc(url)}" alt="" />` : "No image";
    dirty = true;
    scheduleAnalyze();
  }

  $("fi-upload")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $("fi-preview").textContent = "Uploading…";
    try {
      const alt = $("featuredImageAlt").value.trim();
      const item = await upload(file, alt);
      setFeatured(item.url, item.alt);
    } catch (err) {
      $("fi-preview").textContent = err.message;
    }
    e.target.value = "";
  });
  $("fi-clear").addEventListener("click", () => { setFeatured(""); $("featuredImageAlt").value = ""; });
  document.querySelectorAll("[data-pick-url]").forEach((b) =>
    b.addEventListener("click", () => setFeatured(b.dataset.pickUrl, b.dataset.pickAlt))
  );

  function pickInlineImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/avif,image/gif";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const alt = window.prompt("Describe this image for screen-reader users (alt text):", "") || "";
      try {
        const item = await upload(file, alt);
        mde.codemirror.replaceSelection(`\n![${alt.replace(/[[\]]/g, "")}](${item.url})\n`);
      } catch (err) {
        window.alert(err.message);
      }
    });
    input.click();
  }

  /* ------------------------------------------------------------ */

  updateCounters();
  analyze();
})();
