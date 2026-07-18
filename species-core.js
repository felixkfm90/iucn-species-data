window.SpeciesCore = (function () {
  const ASSET_BASE = "https://felixkfm90.github.io/iucn-species-data";
  const DATA_URL = `${ASSET_BASE}/speciesData.json`;
  const PREVIEW_FALLBACK_SLUG = "turdusmerula";

  let speciesListPromise = null;

  function getCurrentSlug() {
    if (
      window.location.hostname.includes("preview.squarespace.com") ||
      window.location.pathname === "srcdoc"
    ) {
      return PREVIEW_FALLBACK_SLUG;
    }

    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.pop() || "";
  }

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

  function getSpeciesAssetPaths(dataOrName) {
    const name = typeof dataOrName === "string"
      ? dataOrName
      : dataOrName?.["Deutscher Name"] || dataOrName?.["Wissenschaftlicher Name"] || "";
    const safeName = sanitizeAssetName(name);
    const encodedName = encodeURIComponent(safeName);

    return {
      safeName,
      encodedName,
      assetDir: `${ASSET_BASE}/species-assets/${encodedName}`,
      map: `${ASSET_BASE}/species-assets/${encodedName}/map.jpg`,
      sound: `${ASSET_BASE}/species-assets/${encodedName}/sound.mp3`,
      credits: `${ASSET_BASE}/species-assets/${encodedName}/credits.json`,
      spectrogram: `${ASSET_BASE}/species-assets/${encodedName}/spectrogram.webp`,
      portrait: `${ASSET_BASE}/species-assets/${encodedName}/portrait.webp`,
    };
  }

  async function getSpeciesList() {
    if (!speciesListPromise) {
      speciesListPromise = fetch(DATA_URL)
        .then((res) => {
          if (!res.ok) throw new Error("JSON konnte nicht geladen werden");
          return res.json();
        })
        .then((json) => {
          if (!Array.isArray(json)) throw new Error("Ungültiges JSON-Format");
          return json;
        })
        .catch((err) => {
          speciesListPromise = null;
          throw err;
        });
    }

    return speciesListPromise;
  }

  async function getSpeciesData(slug = getCurrentSlug()) {
    if (!slug) throw new Error("Ungültiger URL-Slug");

    const json = await getSpeciesList();
    const found = json.find((i) => i.URLSlug === slug);
    if (!found) throw new Error("Art nicht gefunden");

    return found;
  }

  return { getCurrentSlug, sanitizeAssetName, getSpeciesAssetPaths, getSpeciesList, getSpeciesData };
})();
