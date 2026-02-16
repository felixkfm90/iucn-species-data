// search.js (auto basePath von aktueller Seite)
(function () {
  // Nur starten, wenn ein Container existiert
  const host = document.getElementById("species-search");
  if (!host) return;

  // Base-Pfad = aktuelle Seite (ohne trailing slash)
  let base = location.pathname.replace(/\/+$/, "");
  if (!base) return;

  // Failsafe: wenn das wie eine Detailseite aussieht (noch ein Segment), dann abbrechen
  // Wir stoppen ab 3 Segmenten: /wildlife/heimische-tierwelt/slug
  const parts = base.split("/").filter(Boolean);
  if (parts.length >= 3) return;

  const placeholder = "Suche …";
  const limit = 30;

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function norm(s){ return (s||"").toLowerCase().trim(); }

  function ensureUI() {
    host.innerHTML = `
      <div style="margin: 12px 0;">
        <input id="ss-input" type="search" placeholder="${placeholder}"
          style="width:100%; padding:10px 12px; border:1px solid #ccc; border-radius:10px; box-sizing:border-box;">
        <div id="ss-meta" style="font-size:0.9em; margin-top:6px; color:#666;"></div>
        <div id="ss-results" style="margin-top:10px; display:none;">
          <ul id="ss-list"
            style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;"></ul>
        </div>
      </div>
    `;
  }

  function getItemContainer(a) {
    return a.closest("article, .summary-item, .list-item, .grid-item, section, .sqs-block") || a.parentElement;
  }

  function getTitleFromItem(item) {
    if (!item) return "";
    const t = item.querySelector(".summary-title, .summary-title-link, .list-item-title, .title, h1, h2, h3");
    return (t ? t.textContent : "").trim();
  }

  function collectEntries() {
    // ✅ nur im Hauptinhalt scannen (nicht Header/Footer/Nav)
    const scope = document.querySelector("main") || document.body;

    // Links, die unter base/slug liegen
    const links = Array.from(scope.querySelectorAll('a[href*="' + base + '/"]'));
    const map = new Map();

    const slugRe = new RegExp(esc(base) + "\\/[^\\/?#]+", "i");

    for (const a of links) {
      const hrefRaw = a.getAttribute("href") || "";
      const hrefAbs = hrefRaw.startsWith("http") ? hrefRaw : (location.origin + hrefRaw);

      if (!slugRe.test(hrefRaw)) continue;

      // Übersichtsseite selbst ausschließen
      const cleaned = hrefRaw.split("#")[0].replace(/\/+$/, "");
      if (cleaned.toLowerCase() === base.toLowerCase()) continue;

      if (map.has(hrefAbs)) continue;

      const item = getItemContainer(a);
      const title = getTitleFromItem(item);
      const fallback = hrefRaw.split("/").filter(Boolean).pop() || "Unbenannt";

      map.set(hrefAbs, { title: title || fallback, href: hrefAbs });
    }

    return Array.from(map.values())
      .filter(e => e.title && e.title.length > 1)
      .sort((a,b) => a.title.localeCompare(b.title, "de"));
  }

  function initSearch() {
    const input = host.querySelector("#ss-input");
    const meta = host.querySelector("#ss-meta");
    const resultsWrap = host.querySelector("#ss-results");
    const resultsList = host.querySelector("#ss-list");
    if (!input || !meta || !resultsWrap || !resultsList) return;

    let entries = [];

    function buildIndex() { entries = collectEntries(); }

    function render(matches) {
      resultsList.innerHTML = "";
      if (!matches.length) { resultsWrap.style.display = "none"; return; }
      resultsWrap.style.display = "";

      for (const m of matches.slice(0, limit)) {
        const li = document.createElement("li");
        li.innerHTML = `
          <a href="${m.href}"
             style="display:block; padding:10px 12px; border:1px solid #ddd; border-radius:10px; text-decoration:none;">
            ${m.title}
          </a>`;
        resultsList.appendChild(li);
      }
    }

    function apply(q) {
      const query = norm(q);
      if (!query) { meta.textContent = ""; resultsWrap.style.display = "none"; return; }
      const matches = entries.filter(e => norm(e.title).includes(query));
      meta.textContent = `${matches.length} Treffer`;
      render(matches);
    }

    // ✅ Debounce beim Tippen
    let t = null;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => apply(input.value), 120);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { input.value = ""; apply(""); }
      if (e.key === "Enter") {
        const q = norm(input.value);
        const first = entries.find(e => norm(e.title).includes(q));
        if (first) location.href = first.href;
      }
    });

    buildIndex();
    setTimeout(buildIndex, 800);
    setTimeout(buildIndex, 1800);

    const obs = new MutationObserver(() => {
      // ✅ nur rebuilden wenn wirklich gar nichts da ist
      if (entries.length < 1) {
        buildIndex();
        if (input.value) apply(input.value);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // ✅ Observer nach kurzer Zeit abschalten (Squarespace ist dann i.d.R. fertig)
    setTimeout(() => obs.disconnect(), 5000);
  }

  ensureUI();
  initSearch();
})();
