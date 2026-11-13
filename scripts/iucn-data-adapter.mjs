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
  resolveTaxonomy = async () => null,
} = {}) {
  if (typeof fetch !== "function") throw new TypeError("IUCN-Datenadapter benötigt fetch.");
  if (typeof sleep !== "function") throw new TypeError("IUCN-Datenadapter benötigt sleep.");
  if (typeof emptyEntry !== "function") throw new TypeError("IUCN-Datenadapter benötigt emptyEntry.");
  if (typeof formatTaxonomyName !== "function") {
    throw new TypeError("IUCN-Datenadapter benötigt formatTaxonomyName.");
  }

  const headers = () => ({ Authorization: `Bearer ${token ?? ""}`, Accept: "application/json" });

  async function readIucn(pathname) {
    const url = `${baseUrl}${pathname}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(url, { headers: headers() });
      if (response.ok) return { data: await response.json(), notFound: false };
      if (response.status === 404) return { data: null, notFound: true };
      if (response.status === 429) {
        logger.warn(`⏳ IUCN 429 (Rate Limit). Warte 60 Sekunden… (${url})`);
        await sleep(60_000);
        continue;
      }
      const body = await response.text().catch(() => "");
      logger.error(`❌ IUCN HTTP ${response.status} bei ${url}${body ? ` | ${body.slice(0, 200)}` : ""}`);
      return { data: null, notFound: false };
    }
    logger.error(`❌ IUCN: mehrfach 429 erhalten, Abbruch: ${url}`);
    return { data: null, notFound: false };
  }

  async function iucnGET(pathname) { return (await readIucn(pathname)).data; }

  async function queryName(name) {
    const [genus, species] = name.split(" ");
    const response = await readIucn(`/taxa/scientific_name?genus_name=${encodeURIComponent(genus)}&species_name=${encodeURIComponent(species)}`);
    return { ...response, notFound: response.notFound || response.data?.taxon === null };
  }

  function taxonId(taxon) {
    for (const key of ["sis_id", "sis_taxon_id", "taxon_id", "taxonid", "taxonId", "id"]) {
      if (/^[1-9][0-9]*$/.test(String(taxon[key] ?? ""))) return String(taxon[key]);
    }
    return "";
  }

  async function resolveIucnTaxon(scientific, reference) {
    const direct = await queryName(scientific);
    if (!direct.notFound) return direct.data?.taxon ? { data: direct.data, queriedName: scientific, matchedBy: "scientific-name" } : null;
    const names = [...new Set(reference?.synonyms || [])].filter(name => name !== scientific);
    const matches = new Map();
    for (const name of names) {
      const response = await queryName(name);
      if (response.notFound) continue;
      if (!response.data?.taxon) throw new Error("Der IUCN-Synonymabgleich ist unvollständig. Bitte später erneut prüfen.");
      const resolved = response.data.taxon;
      if (![scientific, reference.scientificName, ...names].includes(resolved.scientific_name)) {
        throw new Error("IUCN liefert ein Taxon außerhalb der bekannten Masternamen. Bitte die Zuordnung prüfen.");
      }
      const identity = taxonId(resolved) || resolved.scientific_name;
      matches.set(identity, { data: response.data, queriedName: name, matchedBy: "master-synonym" });
    }
    if (matches.size > 1) throw new Error("Bekannte Synonyme liefern mehrere IUCN-Taxa. Bitte die Zuordnung prüfen.");
    return matches.values().next().value || null;
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

  async function fetchSpeciesData(genus, species, german, english, size, weight, lifeExpectancy, input = {}) {
    const scientific = `${genus} ${species}`;
    const URLSlug = `${genus}${species}`.toLowerCase();
    let reference = null;
    const masterFields = () => Object.fromEntries(["Kingdom", "Phylum", "Subphylum", "Class", "Order", "Family"]
      .filter(rank => reference?.hierarchy?.[rank.toLowerCase()])
      .map(rank => [rank, formatTaxonomyName(reference.hierarchy[rank.toLowerCase()])]));
    const unavailable = () => ({ ...emptyEntry(scientific, german, english, { size, weight, lifeExpectancy }),
      ...masterFields(), Genus: genus, Species: species });
    try {
      logger.log(`→ Suche Taxon für ${german} (${scientific})`);
      reference = await resolveTaxonomy({ ...input, genus, species });
      const match = await resolveIucnTaxon(scientific, reference);
      const taxonData = match?.data;
      if (!taxonData?.taxon) {
        logger.error(`❌ Kein Treffer für ${scientific}`);
        logError(`Kein Treffer: ${scientific}`);
        return unavailable();
      }
      const taxon = taxonData.taxon;
      const resolvedName = taxon.scientific_name;
      const globalAssessment = taxonData.assessments?.find((assessment) =>
        assessment.scopes?.some((scope) => scope.description?.en === "Global"));
      if (!globalAssessment) {
        logger.error(`❌ Keine globale Assessment-ID für ${resolvedName}`);
        logError(`Keine globale Assessment-ID: ${resolvedName}`);
        return unavailable();
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
        "Wissenschaftlicher Name": scientific,
        "Deutscher Name": german,
        "Englischer Name": english,
        Gewicht: weight,
        Größe: size,
        Lebenserwartung: lifeExpectancy || "n/a",
        "Assessment ID": assessmentId,
        Status: globalAssessment.red_list_category_code || "n/a",
        Trend: assessmentInfo.trend,
        Kategorie: assessmentInfo.category,
        Populationgröße: population,
        Generationsdauer: generation,
        ...Object.fromEntries(["Kingdom", "Phylum", "Subphylum", "Class", "Order", "Family"].map(rank => [rank,
          formatTaxonomyName(taxon[`${rank.toLowerCase()}_name`])])),
        ...masterFields(),
        Genus: genus,
        Species: species,
        ...(taxonId(taxon) ? { "Taxon ID": taxonId(taxon) } : {}),
        "IUCN-Zuordnung": { scientificName: resolvedName, queriedName: match.queriedName,
          matchedBy: match.matchedBy, taxonId: taxonId(taxon) || null,
          ...(reference ? { masterTaxonId: reference.masterTaxonId, masterVersion: reference.masterVersion } : {}) },
        "Letztes IUCN Update": globalAssessment.year_published || "n/a",
        "Daten abgerufen": now().toISOString().slice(0, 10),
      };
    } catch (error) {
      logger.error(`❌ Fehler bei ${scientific}: ${error}`);
      logError(`Fehler bei ${scientific}: ${error.message}`);
      return unavailable();
    }
  }

  return Object.freeze({ iucnGET, getAssessmentData, fetchSpeciesData });
}
