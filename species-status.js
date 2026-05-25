(async function () {
  const container = document.getElementById("species-status");
  if (!container) return;

  const ASSET_BASE = "https://felixkfm90.github.io/iucn-species-data";

  const statusIcons = {
    LC: "LC.png", NT: "NT.png", VU: "VU.png",
    EN: "EN.png", CR: "CR.png", EW: "EW.png", EX: "EX.png"
  };

  const trendIcons = {
    Zunehmend: "zunehmend.png",
    Stabil: "stabil.png",
    Abnehmend: "abnehmend.png",
    Unbekannt: "nodata.png"
  };

  function iucnSourceHtml() {
    return `
      <div style="font-size:0.85em; color:#666; margin-top:8px; text-align:center;">
        Quelle: <a href="https://www.iucnredlist.org" target="_blank" rel="noopener">IUCN Red List</a>
      </div>
    `;
  }

  try {
    const d = await window.SpeciesCore.getSpeciesData();

    const statusIcon = statusIcons[d.Status] || "LC.png";
    const statusKnown = Boolean(statusIcons[d.Status]);

    // ✅ Trend robust normalisieren
    const rawTrend = String(d.Trend || "").trim();
    const trendLabel =
      rawTrend === "" || rawTrend.toLowerCase() === "n/a" || rawTrend === "Unbekannt"
        ? "Unbekannt"
        : rawTrend;

    // ✅ Icon: wenn unbekannt → nodata.png
    const trendIcon = trendIcons[trendLabel] || "nodata.png";

    // ✅ "Unbekannt" soll NICHT als Fallback gelten
    const trendKnown = trendLabel === "Unbekannt" ? true : Boolean(trendIcons[trendLabel]);

    container.innerHTML = `
      <div class="frame-box status-trend-frame">
        <div class="status-trend-wrapper">
          <div class="info-box">
            <p>Status</p>
            <img src="${ASSET_BASE}/graphics/catagory/Alternativ/${statusIcon}" height="80" alt="IUCN Status Icon">
            <p>${d.Kategorie}${statusKnown ? "" : " (Fallback-Icon)"}</p>
          </div>

          <div class="info-box">
            <p>Trend</p>
            <img src="${ASSET_BASE}/graphics/trend/${trendIcon}" height="80" alt="Populationstrend Icon">
            <p>${trendLabel}${trendKnown ? "" : " (Fallback-Icon)"}</p>
          </div>
        </div>

        ${iucnSourceHtml()}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `
      <div class="frame-box">
        <i>Status aktuell nicht verfügbar.</i>
        ${iucnSourceHtml()}
      </div>
    `;
  }
})();
