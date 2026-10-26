// Map loader 1.0.11: compact map preview with a native opener in every viewport.
(async function () {
  const ASSET_BASE = "https://felixkfm90.github.io/iucn-species-data";
  let closeActiveMap = null;

  function init() {
    const wrapper = document.getElementById("map-wrapper");
    const outputEl = document.getElementById("map-output");
    if (!wrapper || !outputEl) return;
    loadMap(outputEl);
  }

  function sourceHtml() {
    return `
      <div style="font-size:0.85em; color:#666; margin-top:8px;">
        Quelle: <a href="https://www.iucnredlist.org" target="_blank" rel="noopener">IUCN Red List</a>
      </div>
    `;
  }

  async function headExists(url) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  async function firstExistingUrl(urls) {
    for (const url of urls.filter(Boolean)) {
      if (await headExists(url)) return url;
    }

    return "";
  }

  function getMapCandidates(found) {
    if (window.SpeciesCore && typeof window.SpeciesCore.getSpeciesAssetPaths === "function") {
      const paths = window.SpeciesCore.getSpeciesAssetPaths(found);
      return [paths.map];
    }

    const germanName = found["Deutscher Name"];
    const mapAssetName = window.SpeciesCore.sanitizeAssetName(germanName);
    const encodedName = encodeURIComponent(mapAssetName);
    return [`${ASSET_BASE}/species-assets/${encodedName}/map.jpg`];
  }

  async function loadMap(outputEl) {
    outputEl.innerHTML = `<p style="font-style:italic;">Lade Verbreitungskarte...</p>${sourceHtml()}`;

    try {
      const found = await window.SpeciesCore.getSpeciesData();
      if (!found) {
        outputEl.innerHTML = `<p>Keine Art gefunden.</p>${sourceHtml()}`;
        return;
      }

      const germanName = found["Deutscher Name"];
      const imgUrl = await firstExistingUrl(getMapCandidates(found));

      if (!imgUrl) {
        outputEl.innerHTML = `<p style="font-style:italic;">Verbreitungskarte aktuell nicht verfuegbar.</p>${sourceHtml()}`;
        return;
      }

      outputEl.innerHTML = `
        <img
          src="${imgUrl}"
          alt="Verbreitungskarte - ${germanName}"
          style="width:100%; height:auto; display:block; cursor:default;"
          class="species-map-img"
          loading="lazy"
        >
        ${sourceHtml()}
      `;

      const img = outputEl.querySelector("img");

      if (img) {
        img.style.cursor = "zoom-in";
        const opener = document.createElement("button");
        opener.type = "button";
        opener.className = "species-map-opener";
        opener.setAttribute("aria-label", `Verbreitungskarte vergrößern: ${germanName}`);
        Object.assign(opener.style, { display: "block", width: "100%", padding: 0, border: 0, background: "transparent", cursor: "zoom-in" });
        img.replaceWith(opener);
        opener.appendChild(img);
        const action = document.createElement("span");
        action.className = "species-map-action";
        action.textContent = "Karte vergrößern";
        opener.appendChild(action);
        opener.addEventListener("click", () => openFullscreen(imgUrl, img.alt, opener));
      }
    } catch (_) {
      outputEl.innerHTML = `<p style="font-style:italic;">Verbreitungskarte aktuell nicht verfuegbar.</p>${sourceHtml()}`;
    }
  }

  function restoreMapFocus(opener) {
    if (!opener?.isConnected) return;
    opener.focus({ preventScroll: true });
    if (!opener.isConnected || document.activeElement !== opener) return;
    window.scrollBy({ top: 0, left: 0, behavior: "instant" });
    window.requestAnimationFrame(() => {
      if (!opener.isConnected || document.activeElement !== opener) return;
      const rect = opener.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0 && window.innerWidth > 0 && window.innerHeight > 0)) return;
      const style = window.getComputedStyle(opener);
      const width = style.outlineStyle === "none" ? 0 : Number.parseFloat(style.outlineWidth) || 0;
      const offset = width > 0 ? Number.parseFloat(style.outlineOffset) || 0 : 0;
      const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
      const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top - offset - width / 2));
      const header = document.elementFromPoint(x, y)?.closest("header, [role='banner']");
      if (!header || header.contains(opener)) return;
      const position = window.getComputedStyle(header).position;
      if (position !== "fixed" && position !== "sticky") return;
      const cover = header.getBoundingClientRect();
      if (!(cover.top <= y && cover.bottom > y && cover.bottom < window.innerHeight)) return;
      const delta = rect.top - offset - width - cover.bottom - 2;
      if (delta < 0) window.scrollBy({ top: delta, left: 0, behavior: "instant" });
    });
  }

  function openFullscreen(src, altText, opener) {
    closeActiveMap?.();
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Vergrößerte Verbreitungskarte");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.85)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 99999,
      cursor: "zoom-out",
    });

    const img = new Image();
    img.src = src;
    img.alt = altText || "Vergrößerte Verbreitungskarte";
    Object.assign(img.style, {
      maxWidth: "95vw",
      maxHeight: "calc(95vh - 48px)",
      borderRadius: "6px",
      boxShadow: "0 0 20px rgba(0,0,0,0.5)",
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Kartenansicht schließen");
    Object.assign(closeButton.style, {
      position: "absolute", top: "8px", right: "8px", width: "44px", height: "44px",
      border: "2px solid white", borderRadius: "4px", background: "#222", color: "white",
      fontSize: "30px", lineHeight: "1", cursor: "pointer",
    });
    const previousOverflow = document.body.style.overflow;
    const background = [...document.body.children].map((node) => ({ node, inert: node.inert }));
    for (const { node } of background) node.inert = true;
    const close = () => {
      if (closeActiveMap !== close) return;
      closeActiveMap = null;
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("focusin", focusin, true);
      overlay.remove();
      for (const { node, inert } of background) node.inert = inert;
      document.body.style.overflow = previousOverflow;
      restoreMapFocus(opener);
    };
    const keydown = (event) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") close();
      else closeButton.focus();
    };
    const focusin = (event) => {
      if (!overlay.contains(event.target)) closeButton.focus();
    };
    closeActiveMap = close;
    closeButton.addEventListener("click", close);
    overlay.appendChild(img);
    overlay.appendChild(closeButton);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target === img) close();
    });
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("focusin", focusin, true);
    closeButton.focus();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("mercury:load", () => { closeActiveMap?.(); init(); });
})();
