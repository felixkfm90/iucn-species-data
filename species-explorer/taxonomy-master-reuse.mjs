import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { canonicalBuildInput, compareTaxonomyBuildInputs, openTaxonomyBuildInputs } from "./taxonomy-build-inputs.mjs";
import { readBoundMasterBuildInputs, MASTER_INPUT_FILE } from "./taxonomy-master-inputs.mjs";
import { planMasterDependencies } from "./taxonomy-master-dependencies.mjs";
import { normalizeTaxonomySearchTerm as normalized } from "./taxonomy-search-text.mjs";
import { createMasterTaxon, addProviderTaxonAssertion, addProviderNameAssertion, addProviderSliceMembership,
  addMasterFieldAssertion, setMasterTaxonStatus } from "./taxonomy-master-model.mjs";

const REUSE_PLAN = "build-reuse-plan.sqlite";
const sourceKey = (provider, id) => canonicalBuildInput([provider, id]);
const namesKey = (names) => canonicalBuildInput([...new Set(names.map(normalized))].sort());
const shape = (row) => canonicalBuildInput({ name: normalized(row.scientificName), rank: normalized(row.rank),
  kingdom: normalized(row.kingdom || ""), parent: row.parent || "", accepted: row.accepted || "", hierarchy: row.hierarchy });

// First production reuse boundary: no new/removed records and no graph-shape
// changes. Then the old graph is also the current graph. Changed values still
// invalidate their full consumer closure; uncertain/stateful taxa are rebuilt.
export async function prepareMasterReuse({ directory, previousDirectory, previousManifest, buildInputs,
  recordLocations, onProgress, enabled = true }) {
  const disabled = (reason) => ({ available: false, reason, close() {} });
  if (!enabled) return disabled("explicit-full-build");
  if (!buildInputs.available) return disabled("no-current-input-baseline");
  const before = await readBoundMasterBuildInputs(previousDirectory, previousManifest);
  if (!before.available) return disabled(before.reason);
  let after, old, graph, retained = false;
  try {
    after = openTaxonomyBuildInputs(path.join(directory, MASTER_INPUT_FILE));
    const delta = compareTaxonomyBuildInputs(before.inputs, after);
    if (delta.mode !== "input-delta") return disabled(delta.reasons.join(","));
    if (delta.counts.added || delta.counts.removed) return disabled("record-membership-changed");
    // Every input changed: every source-backed group needs recomputation, while
    // source-free/manual groups are never eligible. No graph can yield reuse.
    if (delta.counts.changed > 0 && delta.counts.unchanged === 0) return disabled("all-records-changed");
    const oldPath = path.join(previousDirectory, "taxonomy-master.sqlite");
    old = new DatabaseSync(oldPath, { readOnly: true });
    const source = old.prepare(`SELECT a.* FROM provider_taxon_assertion a JOIN provider_release r USING(release_id)
      WHERE r.release_state='active' AND r.provider=? AND a.provider_record_id=?`);
    const scientificNames = old.prepare(`SELECT name FROM provider_name_assertion
      WHERE provider_taxon_assertion_id=? AND name_kind IN ('scientific','synonym')`);
    let checked = 0;
    for (const { group, index } of recordLocations.values()) {
      const record = group.records[index], previous = source.get(record.provider, record.providerRecordId);
      if (!previous || previous.master_taxon_id !== group.previousTaxon?.master_taxon_id
          || group.identityFresh || group.identityContinuation) return disabled("source-owner-changed");
      if (shape({ scientificName: previous.scientific_name, rank: previous.rank, kingdom: previous.kingdom,
        parent: previous.parent_provider_record_id, accepted: previous.accepted_provider_record_id,
        hierarchy: JSON.parse(previous.hierarchy_json) }) !== shape({ ...record,
        parent: record.parentProviderRecordId, accepted: record.acceptedProviderRecordId, hierarchy: record.hierarchy || {} })) {
        return disabled("dependency-structure-changed");
      }
      const names = [record.scientificName, ...(record.names || []).filter((name) => ["scientific", "synonym"].includes(name.nameKind)).map((name) => name.name)];
      if (namesKey(names) !== namesKey(scientificNames.all(previous.assertion_id).map((name) => name.name))) return disabled("scientific-links-changed");
      checked += 1;
      if (checked % 1000 === 0) {
        onProgress?.({ phase: "Wiederverwendung prüfen", message: "Quellen und Abhängigkeitsstruktur werden vor dem Schreiben geprüft.", current: checked,
          total: recordLocations.size, percent: 70 });
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    const filename = path.join(directory, REUSE_PLAN);
    const plan = await planMasterDependencies({ filename, previousPath: oldPath, currentPath: oldPath,
      beforeInputs: before.inputs, afterInputs: after, onProgress, progressPercent: 70 });
    if (plan.mode !== "dependency-plan") return disabled(plan.reasons.join(","));
    graph = new DatabaseSync(filename, { readOnly: true });
    const eligible = graph.prepare(`SELECT 1 FROM taxon t LEFT JOIN taxon_work w USING(id)
      WHERE t.id=? AND t.stateful=0 AND w.id IS NULL`);
    const copy = createCopier(old);
    let closed = false;
    retained = true;
    return { available: true, reason: "stable-dependency-graph", reusedTaxa: 0,
      copyIfEligible(database, { group, masterTaxonId, releases, timestamp }) {
        if (!eligible.get(masterTaxonId) || group.projects.length || group.corrections.length
            || group.identityFresh || group.identityContinuation || group.previousTaxon?.master_taxon_id !== masterTaxonId) return false;
        if (!copy(database, group, masterTaxonId, releases, timestamp)) return false;
        this.reusedTaxa += 1;
        return true;
      },
      close() { if (!closed) { closed = true; graph.close(); old.close(); } },
    };
  } finally {
    before.inputs.close(); after?.close();
    if (!retained) { graph?.close(); old?.close(); }
  }
}

function createCopier(old) {
  // The model helpers still validate every copied field. Reuse their fixed SQL
  // statements within this candidate instead of compiling them for every row.
  const writers = new WeakMap();
  const cachedWriter = (database) => {
    if (!writers.has(database)) {
      const statements = new Map();
      writers.set(database, { prepare(sql) {
        if (!statements.has(sql)) statements.set(sql, database.prepare(sql));
        return statements.get(sql);
      } });
    }
    return writers.get(database);
  };
  const taxon = old.prepare("SELECT * FROM master_taxon WHERE master_taxon_id=?");
  const sources = old.prepare(`SELECT a.*,r.provider,r.release_state FROM provider_taxon_assertion a
    JOIN provider_release r USING(release_id) WHERE a.master_taxon_id=? ORDER BY a.assertion_id`);
  const fields = old.prepare("SELECT * FROM master_field_assertion WHERE master_taxon_id=? ORDER BY assertion_id");
  const names = old.prepare("SELECT * FROM provider_name_assertion WHERE provider_taxon_assertion_id=? ORDER BY assertion_id");
  const memberships = old.prepare("SELECT * FROM provider_slice_membership WHERE provider_taxon_assertion_id=?");
  const statuses = old.prepare("SELECT * FROM master_taxon_status WHERE master_taxon_id=?");
  return (database, group, id, releases, timestamp) => {
    database = cachedWriter(database);
    const previous = taxon.get(id), records = new Map(group.records.map((row) => [sourceKey(row.provider, row.providerRecordId), row]));
    const rows = sources.all(id);
    if (rows.length !== records.size || rows.some((row) => row.release_state !== "active"
        || !records.has(sourceKey(row.provider, row.provider_record_id)))) throw new Error("Quellenmenge der wiederverwendeten Art ist nicht eindeutig.");
    // Equal-valued assertions can tie. The full builder then retains input
    // order as provenance tie-breaker, so a reordered group must be recomputed.
    if (rows.some((row, index) => sourceKey(row.provider, row.provider_record_id)
      !== sourceKey(group.records[index].provider, group.records[index].providerRecordId))) return false;
    createMasterTaxon(database, { masterTaxonId: id, scientificName: previous.canonical_scientific_name,
      rank: previous.rank, kingdom: previous.kingdom, lifecycleState: previous.lifecycle_state,
      referenceState: previous.reference_state, createdAt: timestamp });
    const mapping = new Map();
    for (const row of rows) {
      const record = records.get(sourceKey(row.provider, row.provider_record_id)), release = releases.get(row.provider);
      if (!release) throw new Error("Aktuelles Quellenrelease zur Wiederverwendung fehlt.");
      const sourceId = addProviderTaxonAssertion(database, { releaseId: release.releaseId, providerRecordId: row.provider_record_id,
        masterTaxonId: id, parentProviderRecordId: row.parent_provider_record_id, acceptedProviderRecordId: row.accepted_provider_record_id,
        scientificName: row.scientific_name, rank: row.rank, taxonomicStatus: row.taxonomic_status, kingdom: row.kingdom,
        matchState: row.match_state, hierarchy: JSON.parse(row.hierarchy_json), payloadSha256: record.payloadSha256 || null,
        importedAt: release.importedAt, retrievedAt: record.retrievedAt || release.importedAt,
        versionChangeState: record.versionChangeState || "unchanged" });
      mapping.set(row.assertion_id, { sourceId, releaseId: release.releaseId });
      for (const name of names.all(row.assertion_id)) addProviderNameAssertion(database, { providerTaxonAssertionId: sourceId,
        name: name.name, language: name.language, nameKind: name.name_kind, preferred: Boolean(name.preferred), verified: Boolean(name.verified) });
      for (const membership of memberships.all(row.assertion_id)) addProviderSliceMembership(database, {
        providerTaxonAssertionId: sourceId, relevanceReason: membership.relevance_reason,
        observedAt: record.retrievedAt || release.importedAt });
    }
    for (const field of fields.all(id)) {
      const target = mapping.get(field.provider_taxon_assertion_id);
      if (field.origin_kind !== "source" || !target) throw new Error("Nicht wiederverwendbares Feld mit eigenem oder altem Beleg.");
      addMasterFieldAssertion(database, { masterTaxonId: id, fieldName: field.field_name, fieldValue: field.field_value,
        language: field.language, originKind: field.origin_kind, providerTaxonAssertionId: target.sourceId,
        releaseId: target.releaseId, confidence: field.confidence, reviewState: field.review_state,
        selected: Boolean(field.selected), createdAt: timestamp });
    }
    for (const status of statuses.all(id)) setMasterTaxonStatus(database, { masterTaxonId: id, statusName: status.status_name,
      statusDetail: status.status_detail, updatedAt: timestamp });
    return true;
  };
}
