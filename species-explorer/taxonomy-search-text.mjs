const KINGDOM_LABELS = Object.freeze({
  Animalia: "Tiere",
  Archaea: "Archaeen",
  Bacteria: "Bakterien",
  Chromista: "Chromisten",
  Fungi: "Pilze",
  Plantae: "Pflanzen",
  Protozoa: "Protozoen",
  Viruses: "Viren",
});

function collapseSearchPunctuation(value) {
  return value
    .replace(/[’'`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTaxonomySearchTerm(value) {
  return collapseSearchPunctuation(
    String(value ?? "").normalize("NFKC").toLocaleLowerCase("de"),
  );
}

export function foldTaxonomySearchTerm(value) {
  return collapseSearchPunctuation(
    String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss")
      .toLocaleLowerCase("de"),
  );
}

export function germanTaxonomySearchKey(value) {
  return collapseSearchPunctuation(
    String(value ?? "")
      .normalize("NFKC")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae")
      .replace(/Ö/g, "Oe")
      .replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .toLocaleLowerCase("de"),
  );
}

export function taxonomySearchVariants(value) {
  const variants = [
    normalizeTaxonomySearchTerm(value),
    foldTaxonomySearchTerm(value),
    germanTaxonomySearchKey(value),
  ];
  return [...new Set(variants.filter(Boolean))];
}

export function germanKingdomLabel(scientificName) {
  const value = String(scientificName ?? "").trim();
  return KINGDOM_LABELS[value] ?? value;
}

export function createAnimaliaManualSearchUrl(scientificName) {
  const query = `site:animalia.bio/de "${String(scientificName ?? "").trim()}"`;
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  return url.toString();
}
