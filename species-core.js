window.SpeciesCore = (function () {
  async function getSpeciesData() {
    let slug;
    if (
      window.location.hostname.includes("preview.squarespace.com") ||
      window.location.pathname === "srcdoc"
    ) {
      slug = "turdusmerula";
    } else {
      const parts = window.location.pathname.split("/").filter(Boolean);
      slug = parts.pop();
    }

    const res = await fetch(
      "https://felixkfm90.github.io/iucn-species-data/speciesData.json"
    );
    if (!res.ok) throw new Error("JSON konnte nicht geladen werden");

    const json = await res.json();
    const found = json.find((i) => i.URLSlug === slug);
    if (!found) throw new Error("Art nicht gefunden");

    return found;
  }

  return { getSpeciesData };
})();
