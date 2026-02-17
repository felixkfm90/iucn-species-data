(async function () {
  const container = document.getElementById("species-info");
  if (!container) return;

  try {
    const data = await window.SpeciesCore.getSpeciesData();

    function renderInfoRow(label, value) {
      if (!value) return "";
      if (value.includes("Männchen") && value.includes("Weibchen")) {
        const m = value.match(/Männchen\s*:?\s*(.*?)\s*Weibchen/i)?.[1]?.trim() || "";
        const w = value.match(/Weibchen\s*:?\s*(.+)$/i)?.[1]?.trim() || "";
        if (!m || !w) return `<p>${label}: ${value}</p>`;
        return `
          <div style="display:grid; grid-template-columns:120px auto; row-gap:4px;">
            <span>${label}:</span><span>Männchen: ${m}</span>
            <span></span><span>Weibchen: ${w}</span>
          </div>`;
      }
      return `<p>${label}: ${value}</p>`;
    }

    container.innerHTML = `
      <div class="frame-box left-frame">
        <p>Name: ${data["Deutscher Name"]} – ${data["Wissenschaftlicher Name"]}</p>
        ${renderInfoRow("Größe", data.Größe)}
        ${renderInfoRow("Gewicht", data.Gewicht)}
        <p>Lebenserwartung: ${data["Lebenserwartung"]}</p>
        <p>Populationgröße: ${data["Populationgröße"]}</p>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<p>${e.message}</p>`;
  }
})();
