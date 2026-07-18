(async function () {
  const container = document.getElementById("species-info");
  if (!container) return;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function isUnknownValue(value) {
    const text = String(value ?? "").trim();
    if (!text) return true;

    const normalized = text.toLowerCase();
    return normalized === "n/a" || normalized === "na" || normalized === "n.a." || normalized === "u" || normalized === "unknown";
  }

  function displayValue(value) {
    const text = String(value ?? "").trim();
    return isUnknownValue(text) ? "Unbekannt" : text;
  }

  try {
    const data = await window.SpeciesCore.getSpeciesData();
    const lifeExpectancy = data["Lebenserwartung"];
    const generationDuration = data["Generationsdauer"];

    function renderInfoRow(label, value) {
      const text = String(value || "").trim();
      const safeLabel = escapeHtml(label);
      if (isUnknownValue(text)) return "";
      if (text.includes("Männchen") && text.includes("Weibchen")) {
        const m = text.match(/Männchen\s*:?\s*(.*?)\s*Weibchen/i)?.[1]?.trim() || "";
        const w = text.match(/Weibchen\s*:?\s*(.+)$/i)?.[1]?.trim() || "";
        if (!m || !w) {
          return `
            <div class="species-info-row">
              <span class="species-info-label">${safeLabel}:</span>
              <span class="species-info-values">${escapeHtml(text)}</span>
            </div>`;
        }
        return `
          <div class="species-info-row species-info-row--split">
            <span class="species-info-label">${safeLabel}:</span>
            <span class="species-info-values">
              <span>Männchen: ${escapeHtml(m)}</span>
              <span>Weibchen: ${escapeHtml(w)}</span>
            </span>
          </div>`;
      }
      return `
        <div class="species-info-row">
          <span class="species-info-label">${safeLabel}:</span>
          <span class="species-info-values">${escapeHtml(text)}</span>
        </div>`;
    }

    container.innerHTML = `
      <div class="frame-box left-frame">
        <p class="species-info-name">Name: ${escapeHtml(data["Deutscher Name"])} – ${escapeHtml(data["Wissenschaftlicher Name"])}</p>
        ${renderInfoRow("Größe", data.Größe)}
        ${renderInfoRow("Gewicht", data.Gewicht)}
        ${renderInfoRow("Lebenserwartung", lifeExpectancy)}
        ${renderInfoRow("Generationsdauer", displayValue(generationDuration))}
        ${renderInfoRow("Populationsgröße", displayValue(data["Populationgröße"]))}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<p>${escapeHtml(e.message)}</p>`;
  }
})();
