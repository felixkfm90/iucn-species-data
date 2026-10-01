import crypto from "node:crypto";
import fs from "node:fs/promises";

// Bind fingerprints to the actual loaded export rules, not to a manually maintained version.
export async function lightroomExportRevision() {
  const hash = crypto.createHash("sha256");
  for (const name of ["lightroom-search-inputs.mjs", "lightroom-search-projection.mjs", "lightroom-search-package.mjs",
    "lightroom-search-delta.mjs", "lightroom-search-schema.mjs", "lightroom-search-validation.mjs"]) {
    hash.update(name).update((await fs.readFile(new URL(name, import.meta.url), "utf8")).replace(/\r\n/g, "\n"));
  }
  return hash.digest("hex");
}
const loadedRevision = lightroomExportRevision();
export async function verifiedLightroomExportRevision() {
  const revision = await loadedRevision;
  if (revision !== await lightroomExportRevision()) throw new Error("Die geladenen Exportregeln wurden geändert. Bitte den Aufbau neu starten.");
  return revision;
}

// This private, checksummed package table is an optimization hint, not a new
// consumer schema. Old packages without it are rebuilt fully once.
export function recordLightroomExportInputs(database, sourcePath, { signal } = {}) {
  database.prepare("ATTACH DATABASE ? AS master").run(sourcePath);
  database.function("export_input_hash", { deterministic: true, varargs: true }, (...values) => {
    signal?.throwIfAborted();
    return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
  });
  try {
    database.exec(`
      CREATE TABLE export_input (master_taxon_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL) WITHOUT ROWID;
      INSERT INTO export_input
      SELECT t.master_taxon_id, export_input_hash(
        t.canonical_scientific_name, t.rank, t.kingdom, t.lifecycle_state, t.reference_state,
        (SELECT json_group_array(json_array(field_name, field_value, language, provider)) FROM (
          SELECT f.field_name, f.field_value, f.language, r.provider
          FROM master.master_field_assertion f JOIN master.provider_release r USING(release_id)
          WHERE f.master_taxon_id=t.master_taxon_id AND f.selected=1 ORDER BY f.assertion_id)),
        (SELECT json_group_array(json_array(provider, provider_record_id, scientific_name, rank, match_state, hierarchy_json)) FROM (
          SELECT r.provider, s.provider_record_id, s.scientific_name, s.rank, s.match_state, s.hierarchy_json
          FROM master.provider_taxon_assertion s JOIN master.provider_release r USING(release_id)
          WHERE s.master_taxon_id=t.master_taxon_id AND r.release_state='active'
            AND s.version_change_state!='removed' ORDER BY s.assertion_id)),
        (SELECT json_group_array(json_array(status_name, status_detail)) FROM (
          SELECT status_name, status_detail FROM master.master_taxon_status
          WHERE master_taxon_id=t.master_taxon_id ORDER BY status_name)),
        EXISTS (SELECT 1 FROM master.master_conflict c WHERE c.master_taxon_id=t.master_taxon_id
          AND c.conflict_state='open' AND c.conflict_type IN ('changed-value','source-removed','ambiguous-match')),
        (SELECT json_group_array(json_array(project_taxon_key, project_slug, scientific_name_at_link, link_state)) FROM (
          SELECT project_taxon_key, project_slug, scientific_name_at_link, link_state FROM master.project_taxon_link
          WHERE master_taxon_id=t.master_taxon_id ORDER BY project_taxon_key)),
        (SELECT json_group_array(json_array(term, normalized_term, folded_term, german_key, term_kind, language, source_provider, weight)) FROM (
          SELECT term, normalized_term, folded_term, german_key, term_kind, language, source_provider, weight
          FROM master.master_search_term WHERE master_taxon_id=t.master_taxon_id
          ORDER BY term, normalized_term, folded_term, german_key, term_kind, language, source_provider, weight))
      ) FROM master.master_taxon t WHERE t.lifecycle_state!='deprecated';
    `);
  } finally { database.exec("DETACH DATABASE master"); }
}

export function hasBoundLightroomExportInputs(database, manifest, revision) {
  if (manifest.exportContract !== revision || !/^sha256:[a-f0-9]{64}$/u.test(manifest.sourceChecksum || "")) return false;
  try {
    const info = database.prepare("SELECT value FROM package_info WHERE key=?");
    if (info.get("exportContract")?.value !== revision || info.get("sourceChecksum")?.value !== manifest.sourceChecksum) return false;
    const count = database.prepare("SELECT count(*) n FROM export_input").get().n;
    if (count !== manifest.taxonCount) return false;
    return !database.prepare(`SELECT 1 FROM taxon t LEFT JOIN export_input i USING(master_taxon_id)
      WHERE i.master_taxon_id IS NULL OR length(i.fingerprint)!=64 OR i.fingerprint GLOB '*[^a-f0-9]*' LIMIT 1`).get();
  } catch { return false; }
}

export function planLightroomExport(database, previousPath) {
  database.prepare("ATTACH DATABASE ? AS previous").run(previousPath);
  try {
    database.exec(`
      CREATE TABLE delta_scope (master_taxon_id TEXT PRIMARY KEY) WITHOUT ROWID;
      INSERT INTO delta_scope
      SELECT fresh.master_taxon_id FROM export_input fresh LEFT JOIN previous.export_input old USING(master_taxon_id)
      WHERE old.fingerprint IS NOT fresh.fingerprint
      UNION
      SELECT old.master_taxon_id FROM previous.export_input old LEFT JOIN export_input fresh USING(master_taxon_id)
      WHERE fresh.master_taxon_id IS NULL;
    `);
    return { affectedTaxa: database.prepare("SELECT count(*) n FROM delta_scope").get().n,
      projectedTaxa: database.prepare("SELECT count(*) n FROM export_input JOIN delta_scope USING(master_taxon_id)").get().n,
      totalTaxa: database.prepare("SELECT count(*) n FROM export_input").get().n };
  } finally { database.exec("DETACH DATABASE previous"); }
}

// Observation timestamps / provider release versions deliberately do not make
// every taxon a semantic export. Refresh them from the current master instead.
export function refreshLightroomExportProvenance(database, sourcePath, incomingPath, { signal } = {}) {
  database.prepare("ATTACH DATABASE ? AS master").run(sourcePath);
  database.prepare("ATTACH DATABASE ? AS incoming").run(incomingPath);
  let transaction = false;
  const changes = {};
  try {
    signal?.throwIfAborted();
    database.exec("BEGIN IMMEDIATE");
    transaction = true;
    const updates = {
      taxon: `UPDATE taxon SET updated_at=m.updated_at FROM master.master_taxon m
        WHERE m.master_taxon_id=taxon.master_taxon_id AND taxon.updated_at IS NOT m.updated_at`,
      taxon_status: `UPDATE taxon_status SET updated_at=m.updated_at FROM master.master_taxon_status m
        WHERE m.master_taxon_id=taxon_status.master_taxon_id AND m.status_name=taxon_status.status_name
          AND taxon_status.updated_at IS NOT m.updated_at`,
      taxon_provider: `UPDATE taxon_provider SET provider_version=r.provider_version, retrieved_at=s.retrieved_at
        FROM master.provider_taxon_assertion s JOIN master.provider_release r USING(release_id)
        WHERE r.release_state='active' AND s.version_change_state!='removed'
          AND s.master_taxon_id=taxon_provider.master_taxon_id AND r.provider=taxon_provider.provider
          AND s.provider_record_id=taxon_provider.provider_record_id
          AND (taxon_provider.provider_version IS NOT r.provider_version OR taxon_provider.retrieved_at IS NOT s.retrieved_at)`,
    };
    for (const [table, sql] of Object.entries(updates)) {
      signal?.throwIfAborted();
      changes[table] = Number(database.prepare(sql).run().changes);
    }
    database.exec(`
      DELETE FROM export_input WHERE master_taxon_id NOT IN (SELECT master_taxon_id FROM incoming.export_input);
      INSERT INTO export_input SELECT * FROM incoming.export_input WHERE true
        ON CONFLICT (master_taxon_id) DO UPDATE SET fingerprint=excluded.fingerprint
        WHERE fingerprint IS NOT excluded.fingerprint;
      COMMIT;
    `);
    transaction = false;
    return changes;
  } catch (error) {
    if (transaction) database.exec("ROLLBACK");
    throw error;
  } finally { database.exec("DETACH DATABASE incoming; DETACH DATABASE master"); }
}
