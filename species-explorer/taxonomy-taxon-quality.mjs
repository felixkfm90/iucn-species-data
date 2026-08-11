import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

const CORE_HIERARCHY_FIELDS = Object.freeze([
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "species",
]);

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function canonicalSpeciesName(value) {
  const scientificName = cleanText(value);
  if (!scientificName || /[×(),\d]/u.test(scientificName)) return null;
  const words = scientificName.split(" ");
  if (words.length !== 2) return null;
  if (!/^\p{Lu}[\p{L}-]+$/u.test(words[0])) return null;
  if (!/^\p{Ll}[\p{L}-]+$/u.test(words[1])) return null;
  return scientificName;
}

export function isMasterSpeciesCandidate(value = {}) {
  const rank = cleanText(value.rank || "species").toLocaleLowerCase("en");
  return rank === "species" && Boolean(canonicalSpeciesName(value.scientificName));
}

function selectedFields(database, masterTaxonId) {
  return new Map(database.prepare(`
    SELECT field_name, language, field_value
    FROM master_field_assertion
    WHERE master_taxon_id = ? AND selected = 1
  `).all(masterTaxonId).map((row) => [
    `${row.field_name}|${row.language || ""}`,
    cleanText(row.field_value),
  ]));
}

function externalProviderCount(database, masterTaxonId) {
  return Number(database.prepare(`
    SELECT COUNT(DISTINCT release.provider) AS count
    FROM provider_taxon_assertion source
    JOIN provider_release release ON release.release_id = source.release_id
    WHERE source.master_taxon_id = ?
      AND source.version_change_state != 'removed'
      AND release.provider IN ('inaturalist', 'gbif', 'worms', 'wikidata', 'animalia')
  `).get(masterTaxonId)?.count || 0);
}

export function analyzeProjectTaxonomyMasterDatabase(database) {
  const projectLinks = database.prepare(`
    SELECT project.*, taxon.canonical_scientific_name, taxon.reference_state,
      taxon.kingdom
    FROM project_taxon_link project
    JOIN master_taxon taxon ON taxon.master_taxon_id = project.master_taxon_id
    ORDER BY project.project_slug
  `).all();
  const errors = [];
  const reviewItems = [];
  for (const project of projectLinks) {
    if (project.link_state !== "linked") {
      errors.push({
        code: "project-link",
        scientificName: project.canonical_scientific_name,
        message: `Projektart ${project.project_slug} ist nicht eindeutig verknüpft.`,
      });
    }
    const fields = selectedFields(database, project.master_taxon_id);
    const missingFields = [
      ...(!fields.get("german-name|de") ? ["deutscher Name"] : []),
      ...(!fields.get("english-name|en") ? ["englischer Name"] : []),
      ...CORE_HIERARCHY_FIELDS
        .filter((field) => field !== "kingdom" && !fields.get(`${field}|`))
        .map((field) => `Taxonomiestufe ${field}`),
      ...(!cleanText(project.kingdom) ? ["Reich"] : []),
    ];
    const providerCount = externalProviderCount(database, project.master_taxon_id);
    if (missingFields.length || (project.reference_state === "reference-gap" && providerCount < 2)) {
      reviewItems.push({
        masterTaxonId: project.master_taxon_id,
        projectSlug: project.project_slug,
        scientificName: project.canonical_scientific_name,
        referenceState: project.reference_state,
        externalProviderCount: providerCount,
        missingFields,
        normalizedName: normalizeTaxonomySearchTerm(project.canonical_scientific_name),
      });
    }
  }
  return {
    projectTaxonCount: projectLinks.length,
    errors,
    reviewItems,
    valid: errors.length === 0,
  };
}

export function analyzeTaxonomyMasterDatabase(database) {
  const taxa = database.prepare(`
    SELECT * FROM master_taxon
    WHERE lifecycle_state = 'active'
    ORDER BY canonical_name_normalized, master_taxon_id
  `).all();
  const duplicateKeys = database.prepare(`
    SELECT canonical_name_normalized, rank, COALESCE(kingdom, '') AS kingdom,
      COUNT(*) AS count
    FROM master_taxon
    WHERE lifecycle_state = 'active'
    GROUP BY canonical_name_normalized, rank, COALESCE(kingdom, '')
    HAVING COUNT(*) > 1
  `).all();
  const projectLinks = database.prepare(`
    SELECT project.*, taxon.canonical_scientific_name, taxon.reference_state,
      taxon.kingdom
    FROM project_taxon_link project
    JOIN master_taxon taxon ON taxon.master_taxon_id = project.master_taxon_id
    ORDER BY project.project_slug
  `).all();
  const errors = [];
  const reviewItems = [];
  for (const taxon of taxa) {
    if (!canonicalSpeciesName(taxon.canonical_scientific_name) || taxon.rank !== "species") {
      errors.push({
        code: "invalid-species",
        masterTaxonId: taxon.master_taxon_id,
        scientificName: taxon.canonical_scientific_name,
        message: "Der aktive Mastereintrag ist keine kanonische Art mit zweiteiligem Namen.",
      });
    }
  }
  for (const duplicate of duplicateKeys) {
    errors.push({
      code: "duplicate-taxon",
      scientificName: duplicate.canonical_name_normalized,
      message: `${duplicate.count} aktive Mastereinträge besitzen dieselbe Artidentität.`,
    });
  }
  for (const project of projectLinks) {
    if (project.link_state !== "linked") {
      errors.push({
        code: "project-link",
        scientificName: project.canonical_scientific_name,
        message: `Projektart ${project.project_slug} ist nicht eindeutig verknüpft.`,
      });
    }
    const fields = selectedFields(database, project.master_taxon_id);
    const missingFields = [
      ...(!fields.get("german-name|de") ? ["deutscher Name"] : []),
      ...(!fields.get("english-name|en") ? ["englischer Name"] : []),
      ...CORE_HIERARCHY_FIELDS
        .filter((field) => field !== "kingdom" && !fields.get(`${field}|`))
        .map((field) => `Taxonomiestufe ${field}`),
      ...(!cleanText(project.kingdom) ? ["Reich"] : []),
    ];
    const providerCount = externalProviderCount(database, project.master_taxon_id);
    if (missingFields.length || (project.reference_state === "reference-gap" && providerCount < 2)) {
      reviewItems.push({
        masterTaxonId: project.master_taxon_id,
        projectSlug: project.project_slug,
        scientificName: project.canonical_scientific_name,
        referenceState: project.reference_state,
        externalProviderCount: providerCount,
        missingFields,
        normalizedName: normalizeTaxonomySearchTerm(project.canonical_scientific_name),
      });
    }
  }
  return {
    activeTaxonCount: taxa.length,
    projectTaxonCount: projectLinks.length,
    errors,
    reviewItems,
    valid: errors.length === 0,
  };
}

export function assertTaxonomyMasterContent(database) {
  const report = analyzeTaxonomyMasterDatabase(database);
  if (!report.valid) {
    const preview = report.errors.slice(0, 5).map((entry) => entry.message).join(" ");
    throw new Error(
      `Semantische Masterdatenbank-Prüfung fehlgeschlagen: ${report.errors.length} Problem(e). ${preview}`,
    );
  }
  return report;
}

export const taxonomyMasterCoreHierarchyFields = CORE_HIERARCHY_FIELDS;
