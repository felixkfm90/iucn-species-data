(async function () {
  const container = document.getElementById("species-info");
  if (!container) return;

  try {
    const data = await window.SpeciesCore.getSpeciesData();

    function renderSplit(label, value) {
      if (!value) return "";
      if (value.includes("Männchen") && value.includes("Weibchen")) {
        const m = value.match(/Männchen([^W]+)/)?.[1]?.trim() || "";
        const w = value.match(/Weibchen(.+)/)?.[1]?.trim() || "";
        return `
          <div style="display:grid; grid-template-columns:80px auto; row-gap:4px;">
            <span>${label}:</span><span>Männchen: ${m}</span>
            <span></span><span>Weibchen: ${w}</span>
          </div>`;
      }
      return `<p>${label}: ${value}</p>`;
    }

    container.innerHTML = `
      <div class="frame-box left-frame">
        Name: ${found["Deutscher Name"]} – ${found["Wissenschaftlicher Name"]}</p>
        <p>${renderSplit("Größe", found.Größe)}</p>
        <p>${renderSplit("Gewicht", found.Gewicht)}</p>
        <p>Lebenserwartung: ${found["Lebenserwartung"]}</p>
        <p>Populationgröße: ${found["Populationgröße"]}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<p>${e.message}</p>`;
  }
})();
