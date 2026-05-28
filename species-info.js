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

  try {
    const data = await window.SpeciesCore.getSpeciesData();
    const lifeExpectancy = data["Lebenserwartung"];
    const generationDuration = data["Generationsdauer"];

    function renderInfoRow(label, value) {
      const text = String(value || "").trim();
      const safeLabel = escapeHtml(label);
      if (!text || text.toLowerCase() === "n/a") return "";
      if (text.includes("Männchen") && text.includes("Weibchen")) {
        const m = text.match(/Männchen\s*:?\s*(.*?)\s*Weibchen/i)?.[1]?.trim() || "";
        const w = text.match(/Weibchen\s*:?\s*(.+)$/i)?.[1]?.trim() || "";
        if (!m || !w) return `<p>${safeLabel}: ${escapeHtml(text)}</p>`;
        return `
          <div style="display:grid; grid-template-columns:120px auto; row-gap:4px;">
            <span>${safeLabel}:</span><span>Männchen: ${escapeHtml(m)}</span>
            <span></span><span>Weibchen: ${escapeHtml(w)}</span>
          </div>`;
      }
      return `<p>${safeLabel}: ${escapeHtml(text)}</p>`;
    }

    container.innerHTML = `
      <div class="frame-box left-frame">
        <p>Name: ${escapeHtml(data["Deutscher Name"])} – ${escapeHtml(data["Wissenschaftlicher Name"])}</p>
        ${renderInfoRow("Größe", data.Größe)}
        ${renderInfoRow("Gewicht", data.Gewicht)}
        ${renderInfoRow("Lebenserwartung", lifeExpectancy)}
        <p>Generationsdauer: ${escapeHtml(generationDuration)}</p>
        <p>Populationgröße: ${escapeHtml(data["Populationgröße"])}</p>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<p>${escapeHtml(e.message)}</p>`;
  }
})();
