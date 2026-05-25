(async function () {
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

  async function loadMap(outputEl) {
    // ✅ Loading State
    outputEl.innerHTML = `<p style="font-style:italic;">Lade Verbreitungskarte…</p>${sourceHtml()}`;

    try {
      const found = await window.SpeciesCore.getSpeciesData();
      if (!found) {
        outputEl.innerHTML = `<p>Keine Art gefunden.</p>${sourceHtml()}`;
        return;
      }

      const germanName = found["Deutscher Name"];
      const mapAssetName = window.SpeciesCore.sanitizeAssetName(germanName);

      // ✅ GitHub Pages statt raw
      const imgUrl = `https://felixkfm90.github.io/iucn-species-data/Verbreitungskarten/${encodeURIComponent(mapAssetName)}.jpg`;

      // ✅ HEAD statt GET (schneller)
      const check = await fetch(imgUrl, { method: "HEAD" });
      if (!check.ok) {
        outputEl.innerHTML = `<p style="font-style:italic;">Verbreitungskarte aktuell nicht verfügbar.</p>${sourceHtml()}`;
        return;
      }

      outputEl.innerHTML = `
        <img
          src="${imgUrl}"
          alt="Verbreitungskarte – ${germanName}"
          style="width:100%; height:auto; display:block; cursor:default;"
          class="species-map-img"
          loading="lazy"
        >
        ${sourceHtml()}
      `;

      const img = outputEl.querySelector("img");
      const isMobile = window.matchMedia("(max-width: 768px)").matches;

      if (isMobile && img) {
        img.style.cursor = "zoom-in";
        img.addEventListener("click", () => openFullscreen(imgUrl));
      }
    } catch (_) {
      outputEl.innerHTML = `<p style="font-style:italic;">Verbreitungskarte aktuell nicht verfügbar.</p>${sourceHtml()}`;
    }
  }

  function openFullscreen(src) {
    const overlay = document.createElement("div");
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
    Object.assign(img.style, {
      maxWidth: "95vw",
      maxHeight: "95vh",
      borderRadius: "6px",
      boxShadow: "0 0 20px rgba(0,0,0,0.5)",
    });

    overlay.appendChild(img);
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("mercury:load", init); // wichtig für Squarespace
})();
