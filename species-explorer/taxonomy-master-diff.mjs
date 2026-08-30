import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

function normalized(value) {
  return normalizeTaxonomySearchTerm(value);
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function initialDiff(database) {
  return {
    newTaxa: database.prepare(`
      SELECT canonical_scientific_name FROM master_taxon
    `).all().map((row) => row.canonical_scientific_name),
    closedReferenceGaps: [],
    changedScientificNames: [],
    changedNames: [],
    newSynonyms: database.prepare(`
      SELECT master_taxon_id, normalized_name, alias_type FROM master_taxon_alias
    `).all().map((row) => (
      `${row.master_taxon_id}|${row.normalized_name}|${row.alias_type}`
    )),
    staleTaxa: database.prepare(`
      SELECT canonical_scientific_name
      FROM master_taxon
      WHERE lifecycle_state = 'stale'
    `).all().map((row) => row.canonical_scientific_name),
    removedTaxa: [],
  };
}

export async function diffTaxonomyMasterDatabases({
  previousPath,
  currentDatabase,
  DatabaseSync,
  onProgress = () => {},
} = {}) {
  let previousDatabase;
  try {
    previousDatabase = new DatabaseSync(previousPath, { readOnly: true });
  } catch {
    return initialDiff(currentDatabase);
  }
  try {
    const diff = {
      newTaxa: [],
      closedReferenceGaps: [],
      changedScientificNames: [],
      changedNames: [],
      newSynonyms: [],
      staleTaxa: [],
      removedTaxa: [],
    };
    const currentTaxonCount = Number(currentDatabase.prepare(
      "SELECT COUNT(*) AS count FROM master_taxon",
    ).get().count);
    const previousTaxonCount = Number(previousDatabase.prepare(
      "SELECT COUNT(*) AS count FROM master_taxon",
    ).get().count);
    const currentNameCount = Number(currentDatabase.prepare(`
      SELECT COUNT(*) AS count
      FROM master_field_assertion
      WHERE selected = 1 AND field_name IN ('german-name', 'english-name')
    `).get().count);
    const currentAliasCount = Number(currentDatabase.prepare(
      "SELECT COUNT(*) AS count FROM master_taxon_alias",
    ).get().count);
    const total = currentTaxonCount + previousTaxonCount + currentNameCount + currentAliasCount;
    let processed = 0;
    const advance = async () => {
      processed += 1;
      if (processed % 5000 !== 0) return;
      onProgress({
        phase: "Änderungsvergleich",
        message: "Bisheriger Stand und Kandidat werden speicherschonend verglichen.",
        current: processed,
        total,
        percent: 97 + Math.min(2, Math.round((processed / Math.max(1, total)) * 2)),
      });
      await yieldToEventLoop();
    };
    const previousTaxon = previousDatabase.prepare(`
      SELECT canonical_scientific_name, reference_state
      FROM master_taxon
      WHERE master_taxon_id = ?
    `);
    for (const row of currentDatabase.prepare(`
      SELECT master_taxon_id, canonical_scientific_name, reference_state, lifecycle_state
      FROM master_taxon
    `).iterate()) {
      const old = previousTaxon.get(row.master_taxon_id);
      if (!old) diff.newTaxa.push(row.canonical_scientific_name);
      else {
        if (old.reference_state === "reference-gap" && row.reference_state === "exact-col") {
          diff.closedReferenceGaps.push(row.canonical_scientific_name);
        }
        if (normalized(old.canonical_scientific_name) !== normalized(row.canonical_scientific_name)) {
          diff.changedScientificNames.push({
            masterTaxonId: row.master_taxon_id,
            previous: old.canonical_scientific_name,
            candidate: row.canonical_scientific_name,
          });
        }
      }
      if (row.lifecycle_state === "stale") {
        diff.staleTaxa.push(row.canonical_scientific_name);
      }
      await advance();
    }
    const currentTaxon = currentDatabase.prepare(`
      SELECT 1 AS present FROM master_taxon WHERE master_taxon_id = ?
    `);
    for (const row of previousDatabase.prepare(`
      SELECT master_taxon_id, canonical_scientific_name FROM master_taxon
    `).iterate()) {
      if (!currentTaxon.get(row.master_taxon_id)) {
        diff.removedTaxa.push(row.canonical_scientific_name);
      }
      await advance();
    }
    const previousField = previousDatabase.prepare(`
      SELECT field_value
      FROM master_field_assertion
      WHERE selected = 1 AND master_taxon_id = ? AND field_name = ? AND language = ?
    `);
    for (const row of currentDatabase.prepare(`
      SELECT master_taxon_id, field_name, language, field_value
      FROM master_field_assertion
      WHERE selected = 1 AND field_name IN ('german-name', 'english-name')
    `).iterate()) {
      const old = previousField.get(row.master_taxon_id, row.field_name, row.language);
      if (old && normalized(old.field_value) !== normalized(row.field_value)) {
        diff.changedNames.push({
          masterTaxonId: row.master_taxon_id,
          fieldName: row.field_name,
          previous: old.field_value,
          candidate: row.field_value,
        });
      }
      await advance();
    }
    const previousAlias = previousDatabase.prepare(`
      SELECT 1 AS present
      FROM master_taxon_alias
      WHERE master_taxon_id = ? AND normalized_name = ? AND alias_type = ?
    `);
    for (const row of currentDatabase.prepare(`
      SELECT master_taxon_id, normalized_name, alias_type FROM master_taxon_alias
    `).iterate()) {
      if (!previousAlias.get(row.master_taxon_id, row.normalized_name, row.alias_type)) {
        diff.newSynonyms.push(
          `${row.master_taxon_id}|${row.normalized_name}|${row.alias_type}`,
        );
      }
      await advance();
    }
    onProgress({
      phase: "Änderungsvergleich",
      message: "Der Änderungsvergleich ist abgeschlossen.",
      current: total,
      total,
      percent: 99,
    });
    return diff;
  } finally {
    previousDatabase.close();
  }
}
