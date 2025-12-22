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
        <p>Name: ${data["Deutscher Name"]} – ${data["Wissenschaftlicher Name"]}</p>
        ${renderSplit("Größe", data.Größe)}
        ${renderSplit("Gewicht", data.Gewicht)}
        <p>Lebenserwartung: ${data["Lebenserwartung"]}</p>
        <p>Populationgröße: ${data["Populationgröße"]}</p>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<p>${e.message}</p>`;
  }
})();
