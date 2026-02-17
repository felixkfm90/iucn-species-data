(async function () {
  function sanitizeAssetName(input) {
    return String(input ?? "")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae")
      .replace(/Ö/g, "Oe")
      .replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .replace(/æ/g, "ae")
      .replace(/Æ/g, "Ae")
      .replace(/œ/g, "oe")
      .replace(/Œ/g, "Oe")
      .replace(/ø/g, "o")
      .replace(/Ø/g, "O")
      .replace(/å/g, "a")
      .replace(/Å/g, "A")
      .replace(/ð/g, "d")
      .replace(/Ð/g, "D")
      .replace(/þ/g, "th")
      .replace(/Þ/g, "Th")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .replace(/&/g, " and ")
      .replace(/@/g, " at ")
      .replace(/\+/g, " plus ")
      .replace(/[’‘‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[–—−]/g, "-")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\/\\:*?"<>|]/g, "_")
      .replace(/[\x00-\x1F\x7F]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/_+/g, "_")
      .trim()
      .replace(/^[.\s_-]+|[.\s_-]+$/g, "") || "unknown";
  }

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
      if (!res.ok) {
        throw new Error(`JSON konnte nicht geladen werden (HTTP ${res.status})`);
      }
      const json = await res.json();

      const found = json.find((s) => s.URLSlug === slug);

      if (!found) {
        outputEl.innerHTML = `<p>Keine Art gefunden.</p>`;
        return;
      }

      const germanName = found["Deutscher Name"];
      const mapAssetName = sanitizeAssetName(germanName);
      const imgUrl = `https://raw.githubusercontent.com/felixkfm90/iucn-species-data/main/Verbreitungskarten/${encodeURIComponent(
        mapAssetName
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
