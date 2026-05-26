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

  function norm(s){ return (s||"").toLowerCase().trim(); }

  function cleanPath(pathname) {
    return pathname.replace(/\/+$/, "");
  }

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
    const scope = document.querySelector("main") || document.querySelector('[role="main"]') || document.body;

    // Links, die unter base/slug liegen
    const links = Array.from(scope.querySelectorAll("a[href]"));
    const map = new Map();
    const baseLower = base.toLowerCase();

    for (const a of links) {
      const hrefRaw = a.getAttribute("href") || "";
      let url;

      try {
        url = new URL(hrefRaw, location.href);
      } catch (e) {
        continue;
      }

      if (url.origin !== location.origin) continue;

      const path = cleanPath(url.pathname);
      const pathLower = path.toLowerCase();
      if (!pathLower.startsWith(baseLower + "/")) continue;

      // Übersichtsseite selbst ausschließen
      if (pathLower === baseLower) continue;

      const rest = path.slice(base.length + 1).split("/").filter(Boolean);
      if (rest.length !== 1) continue;

      if (map.has(pathLower)) continue;

      const item = getItemContainer(a);
      const title = getTitleFromItem(item);
      const linkText = (a.textContent || "").trim();
      const fallback = rest[0] || "Unbenannt";

      url.hash = "";
      map.set(pathLower, { title: title || linkText || fallback, href: url.href });
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
    let entriesSignature = "";
    let rebuildTimer = null;

    function buildEntriesSignature(nextEntries) {
      return nextEntries.map(e => `${e.href}\u0001${e.title}`).join("\u0002");
    }

    function buildIndex() {
      const nextEntries = collectEntries();
      const nextSignature = buildEntriesSignature(nextEntries);
      if (nextSignature === entriesSignature) return false;

      entries = nextEntries;
      entriesSignature = nextSignature;
      return true;
    }

    function render(matches) {
      resultsList.innerHTML = "";
      if (!matches.length) { resultsWrap.style.display = "none"; return; }
      resultsWrap.style.display = "";

      for (const m of matches.slice(0, limit)) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = m.href;
        a.style.cssText = "display:block; padding:10px 12px; border:1px solid #ddd; border-radius:10px; text-decoration:none;";
        a.textContent = m.title;
        li.appendChild(a);
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
        if (!q) return;
        const first = entries.find(e => norm(e.title).includes(q));
        if (first) location.href = first.href;
      }
    });

    function rebuildAndApply() {
      const changed = buildIndex();
      if (changed && input.value) apply(input.value);
    }

    buildIndex();
    setTimeout(rebuildAndApply, 800);
    setTimeout(rebuildAndApply, 1800);
    setTimeout(rebuildAndApply, 3200);

    const observeScope = document.querySelector("main") || document.querySelector('[role="main"]') || document.body;
    const obs = new MutationObserver((mutations) => {
      if (mutations.every(m => host.contains(m.target))) return;

      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuildAndApply, 180);
    });
    obs.observe(observeScope, { childList: true, subtree: true });

    // ✅ Observer nach kurzer Zeit abschalten (Squarespace ist dann i.d.R. fertig)
    setTimeout(() => {
      clearTimeout(rebuildTimer);
      rebuildAndApply();
      obs.disconnect();
    }, 8000);
  }

  ensureUI();
  initSearch();
})();
