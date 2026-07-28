import fs from "node:fs/promises";
import path from "node:path";

import {
  atomicWriteJson,
  loadNodeSqlite,
  taxonomyDatabasePath,
  taxonomyReleaseDirectory,
  taxonomyReleaseManifestPath,
} from "./taxonomy-storage.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

function scientificName(entry) {
  return `${entry?.genus ?? ""} ${entry?.species ?? ""}`.trim();
}

async function readMappings(mappingsPath) {
  try {
    const value = JSON.parse(await fs.readFile(mappingsPath, "utf8"));
    return value?.schemaVersion === 1 && value.mappings && typeof value.mappings === "object"
      ? value.mappings
      : {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error(`Taxonomie-Zuordnungen sind nicht lesbar: ${error.message}`, {
      cause: error,
    });
  }
}

function candidatePayload(row) {
  return {
    taxonId: row.taxon_id,
    sourceId: row.source_id,
    scientificName: row.scientific_name,
    rank: row.rank,
    status: row.status,
    kingdom: row.kingdom,
  };
}

function classifySpecies({
  entry,
  accepted,
  synonyms,
  mappedTarget,
  descendants = [],
}) {
  const currentScientificName = scientificName(entry);
  const base = {
    germanName: String(entry?.german ?? "").trim(),
    scientificName: currentScientificName,
  };
  if (mappedTarget) {
    return {
      ...base,
      classification: "mapped",
      severity: "ok",
      message: "Vorhandene bestätigte Referenzzuordnung ist weiterhin gültig.",
      candidate: candidatePayload(mappedTarget),
    };
  }
  if (accepted.length === 1) {
    return {
      ...base,
      classification: "exact-accepted",
      severity: "ok",
      message: "Wissenschaftlicher Name ist im neuen Release eindeutig akzeptiert.",
      candidate: candidatePayload(accepted[0]),
    };
  }
  if (accepted.length > 1) {
    return {
      ...base,
      classification: "ambiguous",
      severity: "error",
      message: "Der wissenschaftliche Name ist im neuen Release mehrdeutig.",
      candidates: accepted.map(candidatePayload),
    };
  }
  const uniqueTargets = new Map(synonyms.map((row) => [row.source_id, row]));
  if (uniqueTargets.size === 1) {
    const [candidate] = uniqueTargets.values();
    return {
      ...base,
      classification: "accepted-name-change",
      severity: "warning",
      message: "Der bisherige Name ist ein Synonym; eine eindeutige Umbenennung kann später geprüft werden.",
      candidate: candidatePayload(candidate),
      automaticChange: false,
    };
  }
  if (uniqueTargets.size > 1) {
    return {
      ...base,
      classification: "ambiguous",
      severity: "error",
      message: "Der bisherige Name verweist im neuen Release auf mehrere mögliche akzeptierte Taxa.",
      candidates: [...uniqueTargets.values()].map(candidatePayload),
    };
  }
  if (descendants.length > 0) {
    return {
      ...base,
      classification: "reference-gap",
      severity: "warning",
      message:
        "Die Art fehlt im CoL-Release als eigener Datensatz; zugehörige Unterarten sind vorhanden. "
        + "Der Projektname bleibt unverändert.",
      relatedTaxa: descendants.map(candidatePayload),
      automaticChange: false,
    };
  }
  return {
    ...base,
    classification: "missing",
    severity: "error",
    message: "Der wissenschaftliche Name wurde im neuen Release nicht eindeutig gefunden.",
    candidates: [],
  };
}

export async function compareProjectSpeciesWithTaxonomyRelease({
  taxonomyRoot,
  releaseId,
  speciesListPath,
  mappingsPath,
  now = () => new Date(),
} = {}) {
  if (!taxonomyRoot || !releaseId || !speciesListPath) {
    throw new Error("Taxonomiepfad, Release und Artenliste sind für den Konfliktabgleich erforderlich.");
  }
  const [speciesText, mappings, { DatabaseSync }] = await Promise.all([
    fs.readFile(path.resolve(speciesListPath), "utf8"),
    readMappings(mappingsPath),
    loadNodeSqlite(),
  ]);
  const species = JSON.parse(speciesText);
  if (!Array.isArray(species)) throw new Error("species_list.json muss ein Array sein.");
  const database = new DatabaseSync(
    taxonomyDatabasePath(taxonomyRoot, releaseId),
    { readOnly: true },
  );
  database.exec("PRAGMA query_only = ON;");
  const acceptedStatement = database.prepare(`
    SELECT
      id AS taxon_id, source_id, scientific_name, rank, status, kingdom
    FROM taxon
    WHERE scientific_name = ? COLLATE NOCASE
      AND status IN ('accepted', 'provisionally accepted')
      AND (kingdom = 'Animalia' OR kingdom IS NULL OR kingdom = '')
    ORDER BY CASE WHEN kingdom = 'Animalia' THEN 0 ELSE 1 END, source_id
  `);
  const synonymStatement = database.prepare(`
    SELECT
      accepted.id AS taxon_id, accepted.source_id, accepted.scientific_name,
      accepted.rank, accepted.status, accepted.kingdom
    FROM search_term term
    JOIN taxon accepted ON accepted.id = term.taxon_id
    WHERE term.kingdom = 'Animalia'
      AND term.term_type = 'scientific_synonym'
      AND term.normalized = ?
      AND (accepted.kingdom = 'Animalia' OR accepted.kingdom IS NULL OR accepted.kingdom = '')
    ORDER BY accepted.source_id
  `);
  const mappedStatement = database.prepare(`
    SELECT
      id AS taxon_id, source_id, scientific_name, rank, status, kingdom
    FROM taxon
    WHERE source_id = ?
      AND status IN ('accepted', 'provisionally accepted')
      AND (kingdom = 'Animalia' OR kingdom IS NULL OR kingdom = '')
    LIMIT 1
  `);
  const descendantStatement = database.prepare(`
    SELECT
      id AS taxon_id, source_id, scientific_name, rank, status, kingdom
    FROM taxon
    WHERE scientific_name >= ? COLLATE NOCASE
      AND scientific_name < ? COLLATE NOCASE
      AND rank IN ('subspecies', 'variety', 'form')
      AND status IN ('accepted', 'provisionally accepted')
      AND (kingdom = 'Animalia' OR kingdom IS NULL OR kingdom = '')
    ORDER BY scientific_name, source_id
    LIMIT 5
  `);
  try {
    const results = species.map((entry) => {
      const currentName = scientificName(entry);
      const mapping = mappings[normalizeTaxonomySearchTerm(currentName)] ?? null;
      const mappedTarget = mapping?.sourceId
        ? mappedStatement.get(String(mapping.sourceId))
        : null;
      const accepted = mappedTarget ? [] : acceptedStatement.all(currentName);
      const synonyms = mappedTarget || accepted.length
        ? []
        : synonymStatement.all(normalizeTaxonomySearchTerm(currentName));
      const descendantPrefix = `${currentName} `;
      return classifySpecies({
        entry,
        accepted,
        synonyms,
        mappedTarget,
        descendants: mappedTarget || accepted.length || synonyms.length
          ? []
          : descendantStatement.all(
            descendantPrefix,
            `${descendantPrefix}\uffff`,
          ),
      });
    });
    const summary = {
      total: results.length,
      exact: results.filter((entry) => (
        entry.classification === "exact-accepted" || entry.classification === "mapped"
      )).length,
      suggestions: results.filter(
        (entry) => entry.classification === "accepted-name-change",
      ).length,
      referenceGaps: results.filter(
        (entry) => entry.classification === "reference-gap",
      ).length,
      ambiguous: results.filter((entry) => entry.classification === "ambiguous").length,
      missing: results.filter((entry) => entry.classification === "missing").length,
      blocking: 0,
    };
    const report = {
      schemaVersion: 1,
      releaseId,
      checkedAt: now().toISOString(),
      policy: {
        existingSpeciesChangedAutomatically: false,
        uniqueSynonymsAreSuggestionsOnly: true,
        ambiguousMatchesAreNeverSelectedAutomatically: true,
        speciesLevelReferenceGapsRecognized: true,
        activationBlockedByProjectConflicts: false,
      },
      summary,
      results,
    };
    const reportPath = path.join(
      path.dirname(taxonomyDatabasePath(taxonomyRoot, releaseId)),
      "project-conflicts.json",
    );
    await atomicWriteJson(reportPath, report);
    const manifestPath = taxonomyReleaseManifestPath(taxonomyRoot, releaseId);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.validation = {
      ...manifest.validation,
      projectSpeciesCompared: true,
      projectSpeciesChangedAutomatically: false,
    };
    manifest.projectConflicts = summary;
    await atomicWriteJson(manifestPath, manifest);
    return { ...report, reportPath };
  } finally {
    database.close();
  }
}

export async function readProjectTaxonomyConflictReport({
  taxonomyRoot,
  releaseId,
} = {}) {
  if (!taxonomyRoot || !releaseId) return null;
  const reportPath = path.join(
    taxonomyReleaseDirectory(taxonomyRoot, releaseId),
    "project-conflicts.json",
  );
  try {
    const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
    if (
      report?.schemaVersion !== 1
      || report?.releaseId !== releaseId
      || !report.summary
      || !Array.isArray(report.results)
    ) {
      return null;
    }
    return report;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export const taxonomyProjectConflictInternals = Object.freeze({
  scientificName,
  classifySpecies,
});
