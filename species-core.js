window.SpeciesCore = (function () {
  const DATA_URL = "https://felixkfm90.github.io/iucn-species-data/speciesData.json";
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

  return { getCurrentSlug, getSpeciesList, getSpeciesData };
})();
