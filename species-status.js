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
            <img src="https://raw.githubusercontent.com/felixkfm90/iucn-species-data/main/graphics/catagory/Alternativ/${statusIcon}" height="80">
            <p>${d.Kategorie}${statusKnown ? "" : " (Fallback-Icon)"}</p>
          </div>
          <div class="info-box">
            <p>Trend</p>
            <img src="https://raw.githubusercontent.com/felixkfm90/iucn-species-data/main/graphics/trend/${trendIcon}" height="80">
            <p>${d.Trend}${trendKnown ? "" : " (Fallback-Icon)"}</p>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<p>${e.message}</p>`;
  }
})();
