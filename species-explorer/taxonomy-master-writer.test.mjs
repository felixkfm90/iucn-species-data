import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createMasterWriter } from "./taxonomy-master-writer.mjs";
import { createTaxonomyMasterSchema } from "./taxonomy-master-schema.mjs";
import { registerProviderRelease, createMasterTaxon, addProviderTaxonAssertion,
  addProviderNameAssertion, addMasterFieldAssertion } from "./taxonomy-master-model.mjs";

function fixture(t) {
  const db = new DatabaseSync(":memory:"), compiled = new Map();
  t.after(() => db.close());
  const writer = createMasterWriter({
    prepare(sql) { compiled.set(sql, (compiled.get(sql) || 0) + 1); return db.prepare(sql); },
    exec(sql) { return db.exec(sql); },
  });
  return { db, writer, compiled };
}

test("Schreibhelfer bereitet identische Befehle einmal vor, nicht ihre Parameter oder Ergebnisse", (t) => {
  const { db, writer, compiled } = fixture(t);
  writer.exec("CREATE TABLE item(id INTEGER PRIMARY KEY,value TEXT NOT NULL UNIQUE)");
  const insert = "INSERT INTO item(value) VALUES(?)", read = "SELECT value FROM item WHERE id=?";
  for (let i = 0; i < 100; i += 1) {
    assert.equal(writer.prepare(insert).run(`Wert ${i}`).lastInsertRowid, i + 1);
    assert.equal(writer.prepare(read).get(i + 1).value, `Wert ${i}`);
  }
  assert.equal(compiled.get(insert), 1);
  assert.equal(compiled.get(read), 1);
  db.prepare("UPDATE item SET value=? WHERE id=1").run("Extern geändert");
  assert.equal(writer.prepare(read).get(1).value, "Extern geändert");
});

test("Befehlsspeicher ist verbindungslokal und auf 64 Einträge begrenzt; Fehler werden nicht gespeichert", (t) => {
  const a = fixture(t), b = fixture(t), sql = "SELECT ? AS value";
  assert.notEqual(a.writer.prepare(sql), b.writer.prepare(sql));
  const first = a.writer.prepare(sql);
  for (let i = 0; i < 63; i += 1) a.writer.prepare(`SELECT ${i}`);
  assert.throws(() => a.writer.prepare("SELECT value FROM absent"), /no such table/u);
  assert.equal(a.writer.prepare(sql), first);
  a.writer.exec("CREATE TABLE absent(value TEXT)");
  assert.equal(a.writer.prepare("SELECT value FROM absent").get(), undefined);
  assert.notEqual(a.writer.prepare(sql), first);
  assert.equal(a.compiled.get(sql), 2);
  assert.equal(b.compiled.get(sql), 1);
});

test("Rollback und Constraintfehler bleiben wirksam; derselbe Befehl kann danach erneut schreiben", (t) => {
  const { writer } = fixture(t);
  writer.exec("CREATE TABLE item(id INTEGER PRIMARY KEY,value TEXT NOT NULL UNIQUE)");
  const insert = "INSERT INTO item(value) VALUES(?)";
  writer.exec("BEGIN IMMEDIATE");
  writer.prepare(insert).run("Verworfen");
  writer.exec("ROLLBACK");
  assert.equal(writer.prepare("SELECT COUNT(*) AS n FROM item").get().n, 0);
  writer.exec("BEGIN IMMEDIATE");
  writer.prepare(insert).run("Erhalten");
  assert.throws(() => writer.prepare(insert).run("Erhalten"), /UNIQUE/u);
  assert.throws(() => writer.prepare(insert).run(null), /NOT NULL/u);
  writer.prepare(insert).run("Danach");
  writer.exec("COMMIT");
  assert.deepEqual(writer.prepare("SELECT value FROM item ORDER BY id").all().map((row) => row.value), ["Erhalten", "Danach"]);
});

test("Geschlossene Verbindung wird nicht wiederverwendet oder durch eine fremde neue Verbindung ersetzt", () => {
  const db = new DatabaseSync(":memory:"), writer = createMasterWriter(db), sql = "SELECT 1";
  writer.prepare(sql).get();
  db.close();
  assert.throws(() => writer.prepare(sql).get());
  assert.throws(() => writer.prepare("SELECT 2"));
  const next = new DatabaseSync(":memory:");
  try { assert.equal(createMasterWriter(next).prepare(sql).get()["1"], 1); } finally { next.close(); }
});

test("Unveränderte Modellprüfungen liefern mit und ohne Befehlsspeicher dieselben Felder, Fehler und Namen", (t) => {
  const { db: cached, writer } = fixture(t), { db: direct } = fixture(t);
  function exercise(db, target) {
    createTaxonomyMasterSchema(db);
    const now = "2026-09-24T10:00:00.000Z";
    registerProviderRelease(target, { releaseId: "col", provider: "catalogue-of-life", providerVersion: "1",
      dataScope: "full", importedAt: now });
    createMasterTaxon(target, { masterTaxonId: "taxon", scientificName: "Ciconia ciconia", rank: "species",
      referenceState: "exact-col", createdAt: now });
    const source = addProviderTaxonAssertion(target, { releaseId: "col", providerRecordId: "stork", masterTaxonId: "taxon",
      scientificName: "Ciconia ciconia", rank: "species", importedAt: now });
    const name = { providerTaxonAssertionId: source, name: "Weißstorch", language: "DE", nameKind: "vernacular" };
    const firstId = addProviderNameAssertion(target, name);
    assert.equal(addProviderNameAssertion(target, { ...name, preferred: true, verified: true }), firstId);
    const field = { masterTaxonId: "taxon", fieldName: "german-name", fieldValue: "  Weißstorch  ",
      language: "DE", originKind: "source", providerTaxonAssertionId: source, releaseId: "col",
      confidence: 0.8, reviewState: "accepted", selected: true, createdAt: now };
    addMasterFieldAssertion(target, field);
    const errors = [];
    for (const change of [{ confidence: -1 }, { fieldValue: " " }, { releaseId: "" }, { originKind: "unknown" },
      { providerTaxonAssertionId: null }, { originKind: "manual" }, { reviewState: "unknown" }, { createdAt: "invalid" },
      { masterTaxonId: "missing" }, { releaseId: "missing" }, { reviewState: "pending" }, {}]) {
      assert.throws(() => addMasterFieldAssertion(target, { ...field, ...change }), (error) => { errors.push(error.message); return true; });
    }
    addMasterFieldAssertion(target, { ...field, fieldName: "english-name", fieldValue: "White Stork", language: "en" });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM master_field_assertion").get().n, 2);
    return { errors, tables: Object.fromEntries(["master_taxon", "provider_release", "provider_taxon_assertion",
      "provider_name_assertion", "master_field_assertion"].map((name) => [name, db.prepare(`SELECT * FROM ${name}`).all()])) };
  }
  assert.deepEqual(exercise(cached, writer), exercise(direct, direct));
});
