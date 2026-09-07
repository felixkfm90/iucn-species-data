import { compareMasterFieldCandidates } from "./taxonomy-master-rules.mjs";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";

// Read only this taxon's indexed assertions. Old manual/project values are never a provider fallback.
export function resolveProviderGermanName(database, masterTaxonId) {
  const candidates = database.prepare(`
    SELECT field.field_value, field.confidence, release.provider, release.provider_version
    FROM master_field_assertion field
    JOIN provider_release release ON release.release_id = field.release_id
    JOIN provider_taxon_assertion source ON source.assertion_id = field.provider_taxon_assertion_id
    WHERE field.master_taxon_id = ? AND field.field_name = 'german-name' AND field.language = 'de'
      AND field.origin_kind = 'source' AND release.provider NOT IN ('manual', 'project')
      AND release.release_state = 'active' AND field.review_state != 'rejected'
      AND source.release_id = field.release_id AND source.master_taxon_id = field.master_taxon_id
      AND source.version_change_state != 'removed'
      AND source.match_state IN ('exact', 'reference-gap', 'synonym')
    ORDER BY field.assertion_id
  `).all(masterTaxonId).filter((row) => row.field_value.trim()).map((row) => ({
    fieldValue: row.field_value, confidence: row.confidence, provider: row.provider,
    providerVersion: row.provider_version, fieldName: "german-name",
  }));
  if (!candidates.length) throw new Error("Für diese Art ist kein belegter deutscher Anbietername im aktiven Master verfügbar. Die Namenswahl bleibt erhalten.");
  // Older master files do not persist the environment used for WoRMS priority.
  // Accept only a winner that is identical under both documented priority rules.
  const winner = (environment) => candidates.map((entry) => ({ ...entry, environment })).sort(compareMasterFieldCandidates)[0];
  const standard = winner("terrestrial");
  const marine = winner("marine");
  if (standard.fieldValue !== marine.fieldValue || standard.provider !== marine.provider) {
    throw new Error("Der Anbieterstandard ist mit den gespeicherten Herkunftsdaten nicht eindeutig bestimmbar. Die Namenswahl bleibt erhalten.");
  }
  return { germanName: standard.fieldValue, provider: standard.provider, providerVersion: standard.providerVersion };
}

export async function readProviderGermanName({ taxonomyRoot, masterTaxonId }) {
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "active"), { readOnly: true });
  try { return resolveProviderGermanName(database, masterTaxonId); }
  finally { database.close(); }
}
