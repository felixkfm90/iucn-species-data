(async function () {
  const container = document.getElementById("species-status");
  if (!container) return;

  const statusIcons = {
    LC: "LC.png", NT: "NT.png", VU: "VU.png",
    EN: "EN.png", CR: "CR.png", EW: "EW.png", EX: "EX.png"
  };

  const trendIcons = {
    Zunehmend: "zunehmend.png",
    Stabil: "stabil.png",
    Abnehmend: "abnehmend.png"
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
    const trendIcon = trendIcons[d.Trend] || "stabil.png";
    const statusKnown = Boolean(statusIcons[d.Status]);
    const trendKnown = Boolean(trendIcons[d.Trend]);

    container.innerHTML = `
      <div class="frame-box status-trend-frame">
        <div class="status-trend-wrapper">
          <div class="info-box">
            <p>Status</p>
            <img src="https://raw.githubusercontent.com/felixkfm90/iucn-species-data/main/graphics/catagory/Alternativ/${statusIcon}" height="80" alt="IUCN Status Icon">
            <p>${d.Kategorie}${statusKnown ? "" : " (Fallback-Icon)"}</p>
          </div>

          <div class="info-box">
            <p>Trend</p>
            <img src="https://raw.githubusercontent.com/felixkfm90/iucn-species-data/main/graphics/trend/${trendIcon}" height="80" alt="Populationstrend Icon">
            <p>${d.Trend}${trendKnown ? "" : " (Fallback-Icon)"}</p>
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
