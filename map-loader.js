(async function () {
  function getSlug() {
    if (
      window.location.hostname.includes("preview.squarespace.com") ||
      window.location.pathname === "srcdoc"
    ) {
      return "turdusmerula";
    }
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.pop();
  }

  function init() {
    const wrapper = document.getElementById("map-wrapper");
    const outputEl = document.getElementById("map-output");

    if (!wrapper || !outputEl) return;

    loadMap(outputEl);
  }

  async function loadMap(outputEl) {
    try {
      const slug = getSlug();

      const res = await fetch(
        "https://felixkfm90.github.io/iucn-species-data/speciesData.json"
      );
      const json = await res.json();

      const found = json.find((s) => s.URLSlug === slug);

      if (!found) {
        outputEl.innerHTML = `<p>Keine Art gefunden.</p>`;
        return;
      }

      const germanName = found["Deutscher Name"];
      const imgUrl = `https://raw.githubusercontent.com/felixkfm90/iucn-species-data/main/Verbreitungskarten/${encodeURIComponent(
        germanName
      )}.jpg`;

      const check = await fetch(imgUrl);
      if (!check.ok) {
        outputEl.innerHTML =
          `<p style="font-style:italic;">Keine Verbreitungskarte vorhanden!</p>`;
        return;
      }

      outputEl.innerHTML = `
        <img
          src="${imgUrl}"
          alt="Verbreitungskarte – ${germanName}"
          style="width:100%; height:auto; display:block; cursor:default;"
          class="species-map-img"
        >
      `;

      const img = outputEl.querySelector("img");
      const isMobile = window.matchMedia("(max-width: 768px)").matches;

      if (isMobile) {
        img.style.cursor = "zoom-in";
        img.addEventListener("click", () => openFullscreen(imgUrl));
      }
    } catch (err) {
      outputEl.innerHTML = `<p>Fehler: ${err.message}</p>`;
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
