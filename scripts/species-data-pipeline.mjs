/** Shared data rules for the local CLI and an explicitly bound single-species run.
 * No files, environment, network or process lifecycle are owned by this module. */
export function formatPipelineTaxonomyName(value) {
  const text = String(value ?? "").trim();
  if (!text || text.toLocaleLowerCase("de") === "n/a") return text || "n/a";
  return text.toLocaleLowerCase("de").replace(/(^|[\s-])([\p{L}])/gu,
    (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("de")}`);
}

export function normalizePipelineTaxonomyFields(entry) {
  if (!entry || typeof entry !== "object") return entry;
  return { ...entry, ...Object.fromEntries(["Kingdom", "Phylum", "Subphylum", "Class", "Order", "Family"]
    .map(key => [key, formatPipelineTaxonomyName(entry[key])])) };
}

export function createEmptyPipelineSpeciesData(scientific, german = scientific, english = "Unbekannt", manual = {},
  { now = () => new Date() } = {}) {
  return {
    URLSlug: scientific.toLowerCase().replace(/\s+/g, ""),
    "Wissenschaftlicher Name": scientific, "Deutscher Name": german, "Englischer Name": english,
    Gewicht: manual.weight || "n/a", Größe: manual.size || "n/a", Lebenserwartung: manual.lifeExpectancy || "n/a",
    "Assessment ID": "n/a", Status: "n/a", Trend: "n/a", Kategorie: "n/a", Populationgröße: "n/a", Generationsdauer: "n/a",
    Kingdom: "n/a", Phylum: "n/a", Subphylum: "n/a", Class: "n/a", Order: "n/a", Family: "n/a",
    Genus: scientific.trim().split(/\s+/)[0], Species: scientific.trim().split(/\s+/)[1],
    "Letztes IUCN Update": "n/a", "Daten abgerufen": now().toISOString().slice(0, 10),
  };
}

export function hasUsablePipelineSpeciesData(entry) {
  return Boolean(entry && ["Wissenschaftlicher Name", "Assessment ID", "Status", "Kategorie", "Trend"]
    .every(key => entry[key] && entry[key] !== "n/a"));
}

export function preservePipelineSpeciesData(existing, inputSpecies) {
  return normalizePipelineTaxonomyFields({
    ...existing,
    "Englischer Name": inputSpecies.english || existing["Englischer Name"],
    Gewicht: inputSpecies.weight || existing.Gewicht,
    Größe: inputSpecies.size || existing.Größe,
    Lebenserwartung: inputSpecies.life_expectancy || existing.Lebenserwartung || "n/a",
  });
}

export function createSpeciesDataPipeline({ fetchSpeciesData, logError = () => {}, logger = console } = {}) {
  if (typeof fetchSpeciesData !== "function") throw new TypeError("Der Artendatenlauf benötigt fetchSpeciesData.");

  async function prepareSpeciesData(input, { existingData, assetOnly = false } = {}) {
    const fetched = !(assetOnly && existingData);
    let data = fetched
      ? await fetchSpeciesData(input.genus, input.species, input.german, input.english, input.size, input.weight, input.life_expectancy, input)
      : preservePipelineSpeciesData(existingData, input);
    let usedExistingData = !fetched;
    if (!hasUsablePipelineSpeciesData(data) && hasUsablePipelineSpeciesData(existingData)) {
      logger.warn(`⚠ Verwende vorhandene Daten für ${input.german}, neuer Abruf war unvollständig.`);
      logError(`Fallback auf vorhandene Daten: ${input.german} (${input.genus} ${input.species})`);
      data = preservePipelineSpeciesData(existingData, input);
      usedExistingData = true;
    }
    return { data, fetched, usedExistingData };
  }
  return Object.freeze({ prepareSpeciesData });
}
