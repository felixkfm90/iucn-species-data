import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createTaxonomyMasterSchema } from "./taxonomy-master-schema.mjs";
import { createMasterTaxon, registerProviderRelease, addProviderTaxonAssertion, addProviderNameAssertion,
  addMasterFieldAssertion, addProviderSliceMembership, setMasterTaxonStatus } from "./taxonomy-master-model.mjs";
import { createMasterReuseReader } from "./taxonomy-master-reuse-reader.mjs";
import { masterFileFingerprint } from "./taxonomy-master-inputs.mjs";

const scratch = path.resolve("Testlauf"), timestamp = "2026-09-24T12:00:00.000Z";
async function fixture(t, count = 5) {
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, "reuse-reader-test-")), filename = path.join(root, "source.sqlite");
  let database;
  t.after(async () => {
    database?.close();
    assert.equal(path.dirname(path.resolve(root)), scratch);
    assert.match(path.basename(root), /^reuse-reader-test-[a-zA-Z0-9]+$/u);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  });
  database = new DatabaseSync(filename);
  createTaxonomyMasterSchema(database);
  database.exec("BEGIN IMMEDIATE");
  const providers = ["catalogue-of-life", "inaturalist"], ids = [];
  for (const provider of providers) registerProviderRelease(database, { releaseId: provider, provider,
    providerVersion: "TEST", releaseState: "active", dataScope: "full", importedAt: timestamp });
  for (let index = 0; index < count; index++) {
    const id = `taxon-${index}`, scientificName = `Testus species${index}`; ids.push(id);
    createMasterTaxon(database, { masterTaxonId: id, scientificName, rank: "species", kingdom: "Animalia",
      referenceState: "exact-col", createdAt: timestamp });
    setMasterTaxonStatus(database, { masterTaxonId: id, statusName: "col-confirmed", updatedAt: timestamp });
    setMasterTaxonStatus(database, { masterTaxonId: id, statusName: "externally-confirmed", updatedAt: timestamp });
    for (const provider of providers) {
      const sourceId = addProviderTaxonAssertion(database, { releaseId: provider, providerRecordId: `${provider}-${index}`,
        masterTaxonId: id, scientificName, rank: "species", kingdom: "Animalia", matchState: "exact",
        importedAt: timestamp, hierarchy: { family: "Testidae" } });
      for (const name of ["Zweiter Name", "Erster Name"]) addProviderNameAssertion(database, { providerTaxonAssertionId: sourceId,
        name: `${name} ${index}`, language: "de", nameKind: "vernacular", preferred: name === "Zweiter Name" });
      for (const relevanceReason of ["missing-name", "project-species"]) addProviderSliceMembership(database, {
        providerTaxonAssertionId: sourceId, relevanceReason, observedAt: timestamp });
      for (const [fieldName, fieldValue] of [["scientificName", scientificName], ["germanName", `Art ${index}`]]) {
        addMasterFieldAssertion(database, { masterTaxonId: id, fieldName, fieldValue,
          language: fieldName === "germanName" ? "de" : "", originKind: "source", providerTaxonAssertionId: sourceId,
          releaseId: provider, selected: provider === "catalogue-of-life", reviewState: "accepted", createdAt: timestamp });
      }
    }
  }
  database.exec("COMMIT"); database.close();
  database = new DatabaseSync(filename, { readOnly: true });
  return { database, ids, filename };
}

function without(row, ...keys) { return Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key))); }
function assertDirect(database, id, actual) {
  assert.deepEqual(actual.taxon, database.prepare(`SELECT master_taxon_id,canonical_scientific_name,rank,kingdom,
    lifecycle_state,reference_state FROM master_taxon WHERE master_taxon_id=?`).get(id));
  const sources = database.prepare(`SELECT a.master_taxon_id,a.assertion_id,a.provider_record_id,a.parent_provider_record_id,
    a.accepted_provider_record_id,a.scientific_name,a.rank,a.taxonomic_status,a.kingdom,a.match_state,
    a.hierarchy_json,r.provider,r.release_state FROM provider_taxon_assertion a JOIN provider_release r USING(release_id)
    WHERE a.master_taxon_id=? ORDER BY a.assertion_id`).all(id);
  assert.deepEqual(actual.sources, sources);
  assert.deepEqual(actual.fields, database.prepare(`SELECT master_taxon_id,provider_taxon_assertion_id,origin_kind,field_name,field_value,
    language,confidence,review_state,selected FROM master_field_assertion WHERE master_taxon_id=? ORDER BY assertion_id`).all(id));
  assert.deepEqual(actual.statuses, database.prepare("SELECT master_taxon_id,status_name,status_detail FROM master_taxon_status WHERE master_taxon_id=?").all(id));
  for (const { assertion_id: sourceId } of sources) {
    assert.deepEqual(actual.names.get(sourceId).map((row) => without(row, "master_taxon_id", "provider_taxon_assertion_id")),
      database.prepare("SELECT name,language,name_kind,preferred,verified FROM provider_name_assertion WHERE provider_taxon_assertion_id=? ORDER BY assertion_id")
        .all(sourceId).map((row) => ({ ...row })));
    assert.deepEqual(actual.memberships.get(sourceId).map((row) => without(row, "master_taxon_id", "provider_taxon_assertion_id")),
      database.prepare("SELECT relevance_reason FROM provider_slice_membership WHERE provider_taxon_assertion_id=?").all(sourceId).map((row) => ({ ...row })));
  }
}

test("Lesegruppen erhalten Quellenzuordnung, Namen-/Feldreihenfolge, Bindewerte und schreibgeschützte Quelle", async (t) => {
  const f = await fixture(t), before = await masterFileFingerprint(f.filename);
  const reader = createMasterReuseReader(f.database, [f.ids[2], f.ids[0], f.ids[4], f.ids[1], f.ids[3]], { batchSize: 2 });
  for (const id of [...f.ids, ...f.ids.toReversed()]) assertDirect(f.database, id, reader.read(id));
  assert.equal(await masterFileFingerprint(f.filename), before);
  reader.close(); reader.close();
  assert.throws(() => reader.read(f.ids[0]), /geschlossen/u);
  assert.equal(f.database.prepare("SELECT count(*) n FROM master_taxon").get().n, f.ids.length);
});

test("Höchstens eine 128er-Gruppe bleibt vorgehalten; Wiederaufnahme kann direkt in einer späteren Gruppe beginnen", async (t) => {
  const f = await fixture(t, 130);
  let queries = 0;
  const observed = { prepare(sql) { const statement = f.database.prepare(sql);
    return { all(...args) { queries++; return statement.all(...args); } }; } };
  const reader = createMasterReuseReader(observed, [...f.ids, f.ids[0]]);
  assertDirect(f.database, f.ids[129], reader.read(f.ids[129])); assert.equal(queries, 6);
  reader.read(f.ids[128]); assert.equal(queries, 6);
  assertDirect(f.database, f.ids[0], reader.read(f.ids[0])); assert.equal(queries, 12);
  reader.read(f.ids[127]); assert.equal(queries, 12);
  reader.read(f.ids[129]); assert.equal(queries, 18);
  assert.throws(() => reader.read("unknown"), /Unbekannte/u);
  assert.equal(queries, 18);
  reader.close();
});

test("Fehler in einer Gruppenabfrage veröffentlicht keine Teilgruppe; erneuter Versuch liest vollständig", async (t) => {
  const f = await fixture(t);
  let fail = true, queries = 0;
  const observed = { prepare(sql) { const statement = f.database.prepare(sql);
    return { all(...args) { queries++;
      if (fail && sql.includes("JOIN provider_name_assertion")) { fail = false; throw new Error("Lesefehler"); }
      return statement.all(...args);
    } }; } };
  const reader = createMasterReuseReader(observed, f.ids, { batchSize: 2 });
  assert.throws(() => reader.read(f.ids[0]), /Lesefehler/u);
  assert.equal(queries, 4);
  assertDirect(f.database, f.ids[0], reader.read(f.ids[0])); assert.equal(queries, 10);
  assertDirect(f.database, f.ids[1], reader.read(f.ids[1])); assert.equal(queries, 10);
  reader.close();
});

test("Ungültige Lesegrenzen und Identitäten bereiten keine Datenbankabfrage vor", () => {
  const database = { prepare() { assert.fail("Kein SQL bei ungültiger Grenze."); } };
  for (const batchSize of [0, 129, 1.5, "2"]) assert.throws(() => createMasterReuseReader(database, ["id"], { batchSize }), /Lesegruppe/u);
  for (const ids of [[null], [1], [""]]) assert.throws(() => createMasterReuseReader(database, ids), /Leseidentität/u);
});
