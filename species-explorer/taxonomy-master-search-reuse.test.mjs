import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createMasterSearchReuseMarker, copyMasterSearchTerms } from "./taxonomy-master-search-reuse.mjs";
import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { coverMasterInputSelection, masterFileFingerprint } from "./taxonomy-master-inputs.mjs";
import { activateTaxonomyMasterCandidate } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { openTaxonomyMasterStore } from "./taxonomy-master-store.mjs";
import { benchmarkRows, semanticDigests } from "../scripts/taxonomy-master-benchmark.mjs";

const scratch = tmpdir();
async function fixture(t, count = 30) {
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, "master-search-reuse-"));
  t.after(async () => {
    assert.equal(path.dirname(root), scratch);
    assert.match(path.basename(root), /^master-search-reuse-[a-zA-Z0-9]+$/u);
    await fs.rm(root, { recursive: true, force: true });
  });
  const rows = benchmarkRows(count);
  async function build(day, extra = {}) {
    const { rows: current = rows, ...options } = extra;
    const now = new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`);
    const colRelease = { providerVersion: `SEARCH-${day}`, importedAt: now.toISOString(), recordCount: current.length };
    const inputs = coverMasterInputSelection({ colRelease, colRecords: current, targetNames: [], providerSlices: [] });
    return buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease, colRecords: inputs.records(),
      buildInputCoverage: inputs.coverage, now: () => now, ...options });
  }
  await build(1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  return { root, rows, build, active: taxonomyMasterDatabasePath(root, "active"),
    staging: taxonomyMasterDatabasePath(root, "staging") };
}

test("Suchübernahme ist nur lesend an die Quelle gebunden und kontrolliert vollständige Marker", async (t) => {
  const f = await fixture(t, 10), hash = await masterFileFingerprint(f.active);
  const source = path.join(f.root, "Quelle # geprüft.sqlite");
  await fs.copyFile(f.active, source);
  const target = path.join(f.root, "target.sqlite");
  await fs.copyFile(f.active, target);
  const db = new DatabaseSync(target);
  try {
    db.exec("PRAGMA foreign_keys=ON; DELETE FROM master_search_term; BEGIN IMMEDIATE");
    const mark = createMasterSearchReuseMarker(db);
    const id = db.prepare("SELECT master_taxon_id FROM master_taxon LIMIT 1").get().master_taxon_id;
    mark(id);
    assert.throws(() => copyMasterSearchTerms(db, source, 0), /Aufbaucheckpoint/u);
    assert.ok(copyMasterSearchTerms(db, source, 1).reusedTerms > 0);
    assert.throws(() => db.exec("DELETE FROM reuse_search_source.master_search_term"), /readonly/u);
    db.exec("ROLLBACK");
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='master_build_reused_search'").get(), undefined);
  } finally { db.close(); }
  assert.equal(await masterFileFingerprint(source), hash);
  assert.equal(await masterFileFingerprint(f.active), hash);
});

test("Nur betroffene Arten werden neu indexiert; alle Suchfelder und reale Suchergebnisse bleiben gleich", async (t) => {
  const f = await fixture(t), rows = f.rows.map((row, index) => ({ ...row,
    ...(index === 0 ? { germanNames: [{ name: "Geänderte Örtchen-Art" }] } : {}) }));
  const hash = await masterFileFingerprint(f.active);
  const result = await f.build(2, { rows });
  assert.equal(result.buildInputs.reuse.reusedTaxa, 20);
  assert.equal(result.buildInputs.reuse.search.reusedTaxa, 20);
  assert.ok(result.buildInputs.reuse.search.reusedTerms > 20);
  const actual = semanticDigests(f.staging);
  assert.equal(actual.master_build_reused_search, undefined);
  const queries = ["Geänderte", "Ortchen", "Beispiel Art 29", "Example species", f.rows[20].scientificName, "fixture-20"];
  async function search() {
    const store = await openTaxonomyMasterStore({ taxonomyRoot: f.root, slot: "staging" });
    try { return queries.map((query) => store.search({ query })); }
    finally { store.close(); }
  }
  const found = await search();
  for (let index = 0; index < queries.length; index += 1) {
    assert.ok(found[index].results.length > 0, `Suchprobe ohne Treffer: ${queries[index]}`);
  }
  const full = await f.build(2, { rows, reuseUnchanged: false });
  assert.equal(full.buildInputs.reuse.search.reusedTaxa, 0);
  assert.equal(result.buildInputs.reuse.search.rebuiltSources * 3, full.buildInputs.reuse.search.rebuiltSources);
  assert.deepEqual(semanticDigests(f.staging), actual);
  assert.deepEqual(await search(), found);
  assert.equal(await masterFileFingerprint(f.active), hash);
});

test("Abbruch nach Suchübernahme erhält aktiven Master und Kandidaten; Wiederholung übernimmt genau einmal", async (t) => {
  const f = await fixture(t);
  await f.build(2);
  const active = await masterFileFingerprint(f.active), staging = await masterFileFingerprint(f.staging);
  await assert.rejects(f.build(3, { onProgress(event) {
    if (event.phase === "Suchindex") throw new Error("Suchindex-Testabbruch");
  } }), /Suchindex-Testabbruch/u);
  assert.equal(await masterFileFingerprint(f.active), active);
  assert.equal(await masterFileFingerprint(f.staging), staging);
  assert.deepEqual((await fs.readdir(path.join(f.root, "master"))).filter((name) => name.startsWith(".staging-")), []);
  const retried = await f.build(3);
  assert.equal(retried.buildInputs.reuse.search.reusedTaxa, 30);
  assert.equal(retried.buildInputs.reuse.search.rebuiltSources, 0);
  const actual = semanticDigests(f.staging);
  await f.build(3, { reuseUnchanged: false });
  assert.deepEqual(semanticDigests(f.staging), actual);
});

test("Breite und strukturelle Änderungen bleiben Vollaufbau; keine alte Suchübernahme im Rückfall", async (t) => {
  const f = await fixture(t);
  for (const scenario of ["dense", "structure"]) {
    const rows = benchmarkRows(30, scenario);
    const result = await f.build(2, { rows });
    assert.equal(result.buildInputs.reuse.search.reusedTaxa, 0);
    assert.equal(result.buildInputs.reuse.search.reusedTerms, 0);
    const actual = semanticDigests(f.staging);
    await f.build(2, { rows, reuseUnchanged: false });
    assert.deepEqual(semanticDigests(f.staging), actual);
  }
});

test("Unvollständige Suchbasis wird nicht als erfolgreiche Übernahme ausgegeben", async (t) => {
  const f = await fixture(t, 10), source = path.join(f.root, "missing-search.sqlite");
  await fs.copyFile(f.active, source);
  const bad = new DatabaseSync(source);
  try { bad.exec("DELETE FROM master_search_term"); } finally { bad.close(); }
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE master_taxon(master_taxon_id TEXT PRIMARY KEY); INSERT INTO master_taxon VALUES('test')");
    createMasterSearchReuseMarker(db)("test");
    assert.throws(() => copyMasterSearchTerms(db, source, 1), /keine gesicherten Suchbegriffe/u);
  } finally { db.close(); }
});

test("Zwischenzeitlich veränderter Altmaster verhindert die Veröffentlichung der Suchübernahme", async (t) => {
  const f = await fixture(t);
  await f.build(2);
  const staging = await masterFileFingerprint(f.staging), backup = path.join(f.root, "source-backup.sqlite");
  await fs.copyFile(f.active, backup);
  let changed = false;
  await assert.rejects(f.build(3, { onProgress(event) {
    if (event.phase !== "Suchindex" || changed) return;
    changed = true;
    const source = new DatabaseSync(f.active);
    try { source.exec("UPDATE master_search_term SET term='Fremde Suchbasis' WHERE search_term_id=1"); }
    finally { source.close(); }
  } }), /Ausgangsmaster.*verändert/u);
  assert.equal(changed, true);
  assert.equal(await masterFileFingerprint(f.staging), staging);
  await fs.copyFile(backup, f.active);
  const retry = await f.build(3);
  assert.equal(retry.buildInputs.reuse.search.reusedTaxa, 30);
});
