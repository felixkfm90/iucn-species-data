import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  canonicalBuildInput, taxonomyRecordFingerprint, createTaxonomyBuildInputs,
  resumeTaxonomyBuildInputs, openTaxonomyBuildInputs, compareTaxonomyBuildInputs,
} from "./taxonomy-build-inputs.mjs";

const HASH = "a".repeat(64);
const source = (expectedCount, extra = {}) => ({ provider: "col", version: "1", scopeKey: "all-species",
  checksum: HASH, expectedCount, ...extra });
const contract = (sources, extra = {}) => ({ masterSchema: 4, normalizerVersion: "1", baseMasterVersion: "master-1",
  rulesRevision: HASH, identitiesRevision: HASH, correctionsRevision: HASH, projectsRevision: HASH, sources, ...extra });
const record = (id, extra = {}) => ({ providerRecordId: id, scientificName: "Ciconia ciconia", rank: "species",
  hierarchy: { family: "Ciconiidae" }, names: [{ language: "de", name: "Weißstorch" }], ...extra });

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "fn-build-inputs-"));
  const handles = new Set();
  let counter = 0;
  t.after(async () => {
    for (const handle of handles) handle.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return {
    filename: () => path.join(dir, `${++counter}.sqlite`),
    track: (handle) => { handles.add(handle); return handle; },
    close: (handle) => { handle.close(); handles.delete(handle); },
    async snapshot(rows, manifest = source(rows.length), overrides = {}) {
      const filename = path.join(dir, `${++counter}.sqlite`);
      const writer = await createTaxonomyBuildInputs({ filename, contract: contract([manifest], overrides) });
      try {
        writer.addSource(manifest);
        for (let i = 0; i < rows.length; i += 1000) writer.append(manifest.provider, i, rows.slice(i, i + 1000));
        writer.completeSource(manifest.provider);
        writer.seal();
      } finally { writer.close(); }
      return filename;
    },
  };
}

test("Aufbaueingänge: kanonisches JSON erhält Werte, Feld- und Listenunterschiede", () => {
  assert.equal(canonicalBuildInput({ b: 2, a: 1 }), canonicalBuildInput({ a: 1, b: 2 }));
  assert.notEqual(canonicalBuildInput([1, 2]), canonicalBuildInput([2, 1]));
  for (const value of [undefined, NaN, Infinity, new Date(), { x: undefined }, Array(1)]) {
    assert.throws(() => canonicalBuildInput(value), /JSON/);
  }
  assert.notEqual(canonicalBuildInput({ x: null }), canonicalBuildInput({}));
});

test("Datensatzfingerabdruck ignoriert nur bekannte Beobachtungsmetadaten", () => {
  const original = taxonomyRecordFingerprint(record("1"));
  for (const versionChangeState of ["new", "unchanged", "changed", "restored"]) {
    assert.equal(taxonomyRecordFingerprint(record("1", { retrievedAt: "tomorrow", payloadSha256: "new-hash", versionChangeState })), original);
  }
  for (const change of [
    { versionChangeState: "removed" }, { removed: false }, { scientificName: "Ciconia nigra" },
    { hierarchy: { family: "Other" } }, { providerRecordId: "2" }, { environment: ["freshwater"] },
    { names: [{ language: "de", name: "Hausstorch" }] }, { newUnknownField: true },
  ]) assert.notEqual(taxonomyRecordFingerprint(record("1", change)), original);
  assert.throws(() => taxonomyRecordFingerprint(record("1", { versionChangeState: "unknown" })), /Unbekannter/);
  assert.throws(() => taxonomyRecordFingerprint(record("")), /Datensatz-ID/);
});

test("Checkpointanlage überschreibt keine Datei und verlangt vorab einen Quellenvertrag", async (t) => {
  const f = await fixture(t), filename = f.filename();
  await assert.rejects(createTaxonomyBuildInputs({ filename, contract: contract([]) }), /Quellenplan/);
  await assert.rejects(fs.stat(filename), { code: "ENOENT" });
  const writer = f.track(await createTaxonomyBuildInputs({ filename, contract: contract([source(1)]) }));
  await assert.rejects(createTaxonomyBuildInputs({ filename, contract: contract([source(1)]) }), { code: "EEXIST" });
  assert.throws(() => writer.addSource(source(1, { version: "2" })), /Aufbauvertrag/);
  assert.throws(() => writer.addSource(source(1, { expectedCount: -1 })), /Zeilenzahl/);
});

test("Unvollständige Quellen und fehlende geplante Anbieter erlauben keinen Vergleich", async (t) => {
  const f = await fixture(t), filename = f.filename();
  const writer = f.track(await createTaxonomyBuildInputs({ filename,
    contract: contract([source(1), source(0, { provider: "inat" })]) }));
  writer.addSource(source(1));
  assert.throws(() => writer.completeSource("col"), /nicht vollständig/);
  assert.throws(() => writer.seal(), /vollständig/);
  assert.throws(() => openTaxonomyBuildInputs(filename), /Unvollständiger/);
  writer.append("col", 0, [record("1")]);
  writer.completeSource("col");
  assert.throws(() => writer.seal(), /vollständig/);
  writer.addSource(source(0, { provider: "inat" }));
  writer.completeSource("inat");
  const fingerprint = writer.seal();
  assert.equal(f.track(openTaxonomyBuildInputs(filename)).fingerprint, fingerprint);
  assert.throws(() => writer.append("col", 0, [record("1")]), /versiegelt/);
});

test("Blockschreiben ist atomar; identische Wiederholung ist erlaubt, veränderte nicht", async (t) => {
  const f = await fixture(t), filename = f.filename();
  const writer = f.track(await createTaxonomyBuildInputs({ filename, contract: contract([source(3)]) }));
  writer.addSource(source(3));
  assert.throws(() => writer.append("col", 1, [record("1")]), /Quellenfortschritt/);
  assert.equal(writer.append("col", 0, [record("1")]), 1);
  assert.throws(() => writer.append("col", 1, [record("2"), record("1")]), /UNIQUE/);
  assert.throws(() => writer.append("col", 0, [record("1", { rank: "genus" })]), /verändert/);
  assert.equal(writer.append("col", 0, [record("1"), record("2"), record("3")]), 3);
  assert.equal(writer.append("col", 0, [record("1")]), 3);
  writer.completeSource("col");
  writer.seal();
  assert.equal(Array.from(f.track(openTaxonomyBuildInputs(filename)).records()).length, 3);
});

test("Wiederaufnahme bindet Quellenrevision und sämtliche Regeln; fehlende Datei bleibt fehlend", async (t) => {
  const f = await fixture(t), filename = f.filename(), buildContract = contract([source(2)]);
  const writer = f.track(await createTaxonomyBuildInputs({ filename, contract: buildContract }));
  writer.addSource(source(2));
  writer.append("col", 0, [record("1")]);
  f.close(writer);
  for (const changed of [contract([source(2, { version: "2" })]), { ...buildContract, rulesRevision: "b".repeat(64) },
    { ...buildContract, baseMasterVersion: "master-2" }]) {
    await assert.rejects(resumeTaxonomyBuildInputs({ filename, contract: changed }), /Aufbauvertrag/);
  }
  const resumed = f.track(await resumeTaxonomyBuildInputs({ filename, contract: buildContract }));
  assert.equal(resumed.append("col", 0, [record("1"), record("2")]), 2);
  resumed.completeSource("col");
  resumed.seal();
  f.close(resumed);
  await assert.rejects(resumeTaxonomyBuildInputs({ filename, contract: buildContract }), /versiegelt/);
  const absent = f.filename();
  await assert.rejects(resumeTaxonomyBuildInputs({ filename: absent, contract: buildContract }), { code: "ENOENT" });
  await assert.rejects(fs.stat(absent), { code: "ENOENT" });
});

test("Wiederaufnahme erkennt manipulierte Zeilen, Quellen und verwaiste Datensätze", async (t) => {
  const f = await fixture(t);
  for (const sql of ["UPDATE build_record SET semantic_hash='" + "b".repeat(64) + "'",
    "UPDATE build_record SET ordinal=4", "UPDATE build_source SET version='2'",
    "INSERT INTO build_record VALUES('ghost','1',0,'" + HASH + "')"]) {
    const filename = f.filename(), buildContract = contract([source(2)]);
    const writer = f.track(await createTaxonomyBuildInputs({ filename, contract: buildContract }));
    writer.addSource(source(2));
    writer.append("col", 0, [record("1")]);
    f.close(writer);
    const db = new DatabaseSync(filename);
    try { db.exec("PRAGMA foreign_keys=OFF"); db.exec(sql); } finally { db.close(); }
    await assert.rejects(resumeTaxonomyBuildInputs({ filename, contract: buildContract }), /Checkpoint|checkpoint|Aufbauvertrag|Verwaister/);
  }
});

test("Versiegelter Eingang erkennt nachträgliche Inhaltsänderung", async (t) => {
  const f = await fixture(t), filename = await f.snapshot([record("1")]);
  const db = new DatabaseSync(filename);
  try { db.exec("UPDATE build_record SET semantic_hash='" + "b".repeat(64) + "'"); } finally { db.close(); }
  assert.throws(() => openTaxonomyBuildInputs(filename), /Prüfsumme/);
});

test("Neues Release und neue Abrufzeiten verursachen keine fachlichen Änderungen", async (t) => {
  const f = await fixture(t);
  const before = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1")])));
  const after = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1", { retrievedAt: "new", payloadSha256: "new" })],
    source(1, { version: "2", checksum: "b".repeat(64) }), { baseMasterVersion: "master-2" })));
  const result = compareTaxonomyBuildInputs(before, after, () => assert.fail("Keine fachliche Änderung erwartet"));
  assert.deepEqual(result.counts, { added: 0, changed: 0, removed: 0, unchanged: 1 });
  assert.deepEqual(result.provenanceChanges, ["col"]);
  assert.notEqual(result.beforeFingerprint, result.afterFingerprint);
});

test("Schutzlistenänderung oder fehlender Altvertrag verlangt einen Vollaufbau statt ungeprüfter Wiederverwendung", async (t) => {
  const f = await fixture(t);
  const before = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1")])));
  const after = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1")], source(1), { protectedMasterIdsRevision: HASH })));
  assert.deepEqual(compareTaxonomyBuildInputs(before, after),
    { mode: "full-build-required", reasons: ["protectedMasterIdsRevision"], changesEmitted: 0 });
  const changed = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1")], source(1), { protectedMasterIdsRevision: "b".repeat(64) })));
  assert.equal(compareTaxonomyBuildInputs(after, changed).mode, "full-build-required");
  const invalid = f.filename();
  await assert.rejects(createTaxonomyBuildInputs({ filename: invalid,
    contract: contract([source(1)], { protectedMasterIdsRevision: "not-a-hash" }) }), /Schutzlistenrevision/);
  await assert.rejects(fs.stat(invalid), { code: "ENOENT" });
});

test("Vollständige vergleichbare Quellen liefern genau Hinzufügen, Ändern und Entfernen", async (t) => {
  const f = await fixture(t);
  const before = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1"), record("2"), record("3")])));
  const after = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1"), record("2", { rank: "genus" }), record("4")])));
  const events = [], result = compareTaxonomyBuildInputs(before, after, (event) => events.push(event));
  assert.equal(result.mode, "input-delta");
  assert.deepEqual(result.counts, { added: 1, changed: 1, removed: 1, unchanged: 1 });
  assert.deepEqual(events, [{ kind: "changed", provider: "col", recordId: "2" },
    { kind: "removed", provider: "col", recordId: "3" }, { kind: "added", provider: "col", recordId: "4" }]);
});

test("Leere vollständige Quelle meldet Quellenverluste; weggefallener Anbieter oder Umfang sperrt", async (t) => {
  const f = await fixture(t), before = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1")])));
  const empty = f.track(openTaxonomyBuildInputs(await f.snapshot([])));
  assert.equal(compareTaxonomyBuildInputs(before, empty).counts.removed, 1);
  for (const manifest of [source(0, { provider: "inat" }), source(0, { scopeKey: "birds" })]) {
    const after = f.track(openTaxonomyBuildInputs(await f.snapshot([], manifest)));
    const result = compareTaxonomyBuildInputs(before, after, () => assert.fail("Kein Löschauftrag"));
    assert.equal(result.mode, "blocked");
    assert.equal(result.changesEmitted, 0);
  }
});

test("Regel-, Identitäts- und manuelle Änderungen verlangen zunächst den Vollaufbau", async (t) => {
  const f = await fixture(t), before = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1")])));
  for (const [key, value] of Object.entries({ masterSchema: 5, normalizerVersion: "2", rulesRevision: "b".repeat(64),
    identitiesRevision: "b".repeat(64), correctionsRevision: "b".repeat(64), projectsRevision: "b".repeat(64) })) {
    const after = f.track(openTaxonomyBuildInputs(await f.snapshot([record("2")], source(1), { [key]: value })));
    assert.deepEqual(compareTaxonomyBuildInputs(before, after, () => assert.fail("Keine unsicheren Deltas")),
      { mode: "full-build-required", reasons: [key], changesEmitted: 0 });
  }
});

test("Streamingvergleich folgt SQLite-UTF-8-Reihenfolge, nicht JavaScript-UTF-16", async (t) => {
  const f = await fixture(t), ids = ["a", "\uE000", "😀"];
  const before = f.track(openTaxonomyBuildInputs(await f.snapshot(ids.map((id) => record(id)))));
  const after = f.track(openTaxonomyBuildInputs(await f.snapshot(ids.toReversed().map((id) => record(id, id === "😀" ? { rank: "genus" } : {})))));
  const events = [], result = compareTaxonomyBuildInputs(before, after, (event) => events.push(event));
  assert.deepEqual(result.counts, { added: 0, changed: 1, removed: 0, unchanged: 2 });
  assert.deepEqual(events, [{ kind: "changed", provider: "col", recordId: "😀" }]);
});

test("Callbackfehler beendet Iteratoren und lässt einen erneuten Vergleich zu", async (t) => {
  const f = await fixture(t), before = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1")])));
  const after = f.track(openTaxonomyBuildInputs(await f.snapshot([record("2")])));
  assert.throws(() => compareTaxonomyBuildInputs(before, after, () => { throw new Error("Pause"); }), /Pause/);
  assert.equal(compareTaxonomyBuildInputs(before, after).changesEmitted, 2);
});

test("Gleichheitsweg für stabile Schlüssel bewahrt UTF-8-Reihenfolge bei Anbieter- und ID-Wechseln", async (t) => {
  const f = await fixture(t), providers = ["a", "\uE000", "😀"], ids = ["1", "\uE000", "😀"];
  const sources = providers.map((provider) => source(3, { provider }));
  async function snapshot(after) {
    const filename = f.filename(), writer = await createTaxonomyBuildInputs({ filename, contract: contract(sources) });
    try {
      for (const manifest of sources) {
        writer.addSource(manifest);
        writer.append(manifest.provider, 0, ids.map((id) => record(after && id === "1" ? "2" : id,
          after && id === "😀" ? { rank: "genus" } : {})));
        writer.completeSource(manifest.provider);
      }
      writer.seal();
    } finally { writer.close(); }
    return f.track(openTaxonomyBuildInputs(filename));
  }
  const before = await snapshot(false), after = await snapshot(true), events = [];
  const result = compareTaxonomyBuildInputs(before, after, (event) => events.push(event));
  assert.deepEqual(result.counts, { added: 3, removed: 3, changed: 3, unchanged: 3 });
  assert.deepEqual(events, providers.flatMap((provider) => [
    { kind: "removed", provider, recordId: "1" }, { kind: "added", provider, recordId: "2" },
    { kind: "changed", provider, recordId: "😀" },
  ]));
});

test("Blockgrenze und lückenhafte Eingaben verändern den gespeicherten Fortschritt nicht", async (t) => {
  const f = await fixture(t), filename = f.filename();
  const writer = f.track(await createTaxonomyBuildInputs({ filename, contract: contract([source(1001)]) }));
  writer.addSource(source(1001));
  const rows = Array.from({ length: 1001 }, (_, index) => record(String(index)));
  assert.throws(() => writer.append("col", 0, rows), /1.000/);
  assert.throws(() => writer.append("col", 0, Array(1)), /Datensatz-ID/);
  assert.equal(writer.append("col", 0, rows.slice(0, 1000)), 1000);
  assert.equal(writer.append("col", 1000, rows.slice(1000)), 1001);
  writer.completeSource("col");
  writer.seal();
  assert.equal(Array.from(f.track(openTaxonomyBuildInputs(filename)).records()).length, 1001);
});

test("Neuer vollständiger Anbieter ergänzt seinen Namensraum ohne alte Datensätze zu entfernen", async (t) => {
  const f = await fixture(t), before = f.track(openTaxonomyBuildInputs(await f.snapshot([record("1")])));
  const filename = f.filename(), sources = [source(1), source(1, { provider: "inat" })];
  const writer = f.track(await createTaxonomyBuildInputs({ filename, contract: contract(sources) }));
  for (const manifest of sources) {
    writer.addSource(manifest);
    writer.append(manifest.provider, 0, [record("1")]);
    writer.completeSource(manifest.provider);
  }
  writer.seal();
  const after = f.track(openTaxonomyBuildInputs(filename)), events = [];
  const result = compareTaxonomyBuildInputs(before, after, (event) => events.push(event));
  assert.deepEqual(result.counts, { added: 1, changed: 0, removed: 0, unchanged: 1 });
  assert.deepEqual(events, [{ kind: "added", provider: "inat", recordId: "1" }]);
});
