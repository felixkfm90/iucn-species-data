const CATEGORY_LABELS = Object.freeze({
  LC: "Nicht gefährdet",
  NT: "Potentiell gefährdet",
  VU: "Gefährdet",
  EN: "Stark gefährdet",
  CR: "Vom Aussterben bedroht",
  EW: "In freier Wildbahn ausgestorben",
  EX: "Ausgestorben",
  DD: "Keine ausreichende Datenlage",
});

const TREND_LABELS = Object.freeze({
  Increasing: "Zunehmend",
  Stable: "Stabil",
  Decreasing: "Abnehmend",
  Unknown: "Unbekannt",
});

export function createIucnDataAdapter({
  fetch,
  token,
  sleep,
  logError = () => {},
  emptyEntry,
  formatTaxonomyName,
  baseUrl = "https://api.iucnredlist.org/api/v4",
  now = () => new Date(),
  logger = console,
} = {}) {
  if (typeof fetch !== "function") throw new TypeError("IUCN-Datenadapter benötigt fetch.");
  if (typeof sleep !== "function") throw new TypeError("IUCN-Datenadapter benötigt sleep.");
  if (typeof emptyEntry !== "function") throw new TypeError("IUCN-Datenadapter benötigt emptyEntry.");
  if (typeof formatTaxonomyName !== "function") {
    throw new TypeError("IUCN-Datenadapter benötigt formatTaxonomyName.");
  }

  const headers = () => ({ Authorization: `Bearer ${token ?? ""}`, Accept: "application/json" });

  async function iucnGET(pathname) {
    const url = `${baseUrl}${pathname}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(url, { headers: headers() });
      if (response.ok) return response.json();
      if (response.status === 429) {
        logger.warn(`⏳ IUCN 429 (Rate Limit). Warte 60 Sekunden… (${url})`);
        await sleep(60_000);
        continue;
      }
      const body = await response.text().catch(() => "");
      logger.error(`❌ IUCN HTTP ${response.status} bei ${url}${body ? ` | ${body.slice(0, 200)}` : ""}`);
      return null;
    }
    logger.error(`❌ IUCN: mehrfach 429 erhalten, Abbruch: ${url}`);
    return null;
  }

  async function getAssessmentData(assessmentId) {
    try {
      const response = await fetch(`${baseUrl}/assessment/${assessmentId}`, { headers: headers() });
      if (!response.ok) return { trend: "n/a", category: "n/a", population: "n/a", generation: "n/a" };
      const data = await response.json();
      const assessment = data.population_trend ? data : data.result?.[0];
      if (!assessment) return { trend: "n/a", category: "n/a", population: "n/a", generation: "n/a" };
      const trendCode = assessment.population_trend?.description?.en || "Unknown";
      const categoryCode = assessment.red_list_category?.code || "DD";
      return {
        trend: TREND_LABELS[trendCode] || "Unbekannt",
        category: CATEGORY_LABELS[categoryCode] || "Keine ausreichende Datenlage",
        population: assessment.supplementary_info?.population_size || "n/a",
        generation: assessment.supplementary_info?.generational_length || "n/a",
      };
    } catch (error) {
      logError(`Fehler bei Assessment ${assessmentId}: ${error.message}`);
      return { trend: "n/a", category: "n/a", population: "n/a", generation: "n/a" };
    }
  }

  async function fetchSpeciesData(genus, species, german, size, weight, lifeExpectancy) {
    const scientific = `${genus} ${species}`;
    const URLSlug = `${genus}${species}`.toLowerCase();
    try {
      logger.log(`→ Suche Taxon für ${german} (${scientific})`);
      const taxonData = await iucnGET(
        `/taxa/scientific_name?genus_name=${encodeURIComponent(genus)}&species_name=${encodeURIComponent(species)}`,
      );
      if (!taxonData?.taxon) {
        logger.error(`❌ Kein Treffer für ${scientific}`);
        logError(`Kein Treffer: ${scientific}`);
        return emptyEntry(scientific, german, { size, weight, lifeExpectancy });
      }
      const taxon = taxonData.taxon;
      const resolvedName = taxon.scientific_name;
      const globalAssessment = taxonData.assessments?.find((assessment) =>
        assessment.scopes?.some((scope) => scope.description?.en === "Global"));
      if (!globalAssessment) {
        logger.error(`❌ Keine globale Assessment-ID für ${resolvedName}`);
        logError(`Keine globale Assessment-ID: ${resolvedName}`);
        return emptyEntry(resolvedName, german, { size, weight, lifeExpectancy });
      }
      const assessmentId = globalAssessment.assessment_id;
      const assessmentInfo = await getAssessmentData(assessmentId);
      let population = assessmentInfo.population;
      if (typeof population === "string") {
        population = population.replace(/\d+/g, (number) => Number(number).toLocaleString("de-DE"));
      }
      const generation = assessmentInfo.generation === "n/a"
        ? "n/a"
        : `${String(assessmentInfo.generation).replace(".", ",")} Jahre`;
      return {
        URLSlug,
        "Wissenschaftlicher Name": resolvedName,
        "Deutscher Name": german,
        Gewicht: weight,
        Größe: size,
        Lebenserwartung: lifeExpectancy || "n/a",
        "Assessment ID": assessmentId,
        Status: globalAssessment.red_list_category_code || "n/a",
        Trend: assessmentInfo.trend,
        Kategorie: assessmentInfo.category,
        Populationgröße: population,
        Generationsdauer: generation,
        Kingdom: formatTaxonomyName(taxon.kingdom_name),
        Phylum: formatTaxonomyName(taxon.phylum_name),
        Class: formatTaxonomyName(taxon.class_name),
        Order: formatTaxonomyName(taxon.order_name),
        Family: formatTaxonomyName(taxon.family_name),
        Genus: taxon.genus_name || "n/a",
        Species: taxon.species_name || "n/a",
        "Letztes IUCN Update": globalAssessment.year_published || "n/a",
        "Daten abgerufen": now().toISOString().slice(0, 10),
      };
    } catch (error) {
      logger.error(`❌ Fehler bei ${scientific}: ${error}`);
      logError(`Fehler bei ${scientific}: ${error.message}`);
      return emptyEntry(scientific, german, { size, weight, lifeExpectancy });
    }
  }

  return Object.freeze({ iucnGET, getAssessmentData, fetchSpeciesData });
}
