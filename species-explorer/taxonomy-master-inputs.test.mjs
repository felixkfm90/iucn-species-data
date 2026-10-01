import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { coverMasterInputSelection, MASTER_INPUT_FILE, readBoundMasterBuildInputs, masterFileFingerprint } from "./taxonomy-master-inputs.mjs";
import { buildTaxonomyMasterCandidate, readTaxonomyMasterManifest } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate, rollbackTaxonomyMaster } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterCandidateDirectory, taxonomyMasterActiveDirectory, taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { planMasterDependencies } from "./taxonomy-master-dependencies.mjs";
import { canonicalBuildInput } from "./taxonomy-build-inputs.mjs";
import { benchmarkRows } from "../scripts/taxonomy-master-benchmark.mjs";

const time = (day) => new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`);
const record = (extra = {}) => ({ providerRecordId: "stork", scientificName: "Ciconia ciconia", kingdom: "Animalia",
  rank: "species", hierarchy: { kingdom: "Animalia", genus: "Ciconia", species: "Ciconia ciconia", family: "Ciconiidae" },
  germanNames: [{ name: "Weißstorch" }], ...extra });
const release = (day) => ({ providerVersion: `COL-${day}`, importedAt: time(day).toISOString(), recordCount: 4000000 });
async function rootFor(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fn-master-inputs-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function build(root, day, extra = {}) {
  const { rows = [record()], targetNames = ["Ciconia ciconia"], providerSlices = [], ...options } = extra;
  const inputs = coverMasterInputSelection({ colRelease: release(day), colRecords: rows, targetNames, providerSlices });
  return buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release(day), colRecords: inputs.records(),
    buildInputCoverage: inputs.coverage, providerSlices, now: () => time(day), ...options });
}

test("Eingangsanbindung zählt ausgewählte CoL-Zeilen, nicht die Größe der Gesamtquelle", async (t) => {
  const root = await rootFor(t), manifest = await build(root, 1);
  assert.equal(manifest.buildInputs.available, true);
  assert.equal(manifest.buildInputs.recordCount, 1);
  assert.equal(manifest.buildInputs.buildMode, "full");
  assert.deepEqual(manifest.buildInputs.comparison.reasons, ["no-input-baseline"]);
  const bound = await readBoundMasterBuildInputs(taxonomyMasterCandidateDirectory(root), manifest);
  assert.equal(bound.available, true);
  try {
    assert.equal(bound.inputs.contract.candidateId, manifest.candidateId);
    assert.equal(bound.inputs.contract.upstreamReleases[0].recordCount, 4000000);
    assert.equal(bound.inputs.contract.sources[0].expectedCount, 1);
  } finally { bound.inputs.close(); }
  await assert.rejects(fs.stat(taxonomyMasterActiveDirectory(root)), { code: "ENOENT" });
});

test("Identische Inhalte in neuem Release bleiben unverändert; Baseline folgt Aktivierung und Rollback", async (t) => {
  const root = await rootFor(t), first = await build(root, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => time(1) });
  const second = await build(root, 2);
  assert.equal(second.buildInputs.buildMode, "incremental");
  assert.equal(second.buildInputs.reuse.reusedTaxa, 1);
  assert.deepEqual(second.buildInputs.comparison.counts, { added: 0, changed: 0, removed: 0, unchanged: 1 });
  assert.deepEqual(second.buildInputs.comparison.provenanceChanges, ["catalogue-of-life"]);
  assert.equal(second.buildInputs.comparison.dependencyPlan.mode, "dependency-plan");
  assert.equal(second.buildInputs.comparison.dependencyPlan.rebuildTaxa, 0);
  assert.equal(second.buildInputs.comparison.dependencyPlan.unchangedCandidates, 1);
  assert.equal(second.buildInputs.comparison.dependencyPlan.reuseAuthorized, false);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => time(2) });
  await rollbackTaxonomyMaster(root, { confirmed: true, now: () => time(3) });
  const manifest = await readTaxonomyMasterManifest(root, "active");
  assert.equal(manifest.candidateId, first.candidateId);
  const bound = await readBoundMasterBuildInputs(taxonomyMasterActiveDirectory(root), manifest);
  assert.equal(bound.available, true);
  bound.inputs.close();
});

test("Fingerabdrücke entstehen nach der vorhandenen Duplikatzusammenführung", async (t) => {
  const root = await rootFor(t);
  const first = await build(root, 1, { rows: [record(), record({ englishNames: [{ name: "White stork" }] })] });
  assert.equal(first.buildInputs.recordCount, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const second = await build(root, 2, { rows: [record({ englishNames: [{ name: "White stork" }] })] });
  assert.equal(second.buildInputs.comparison.counts.unchanged, 1);
  assert.equal(second.buildInputs.comparison.changesEmitted, 0);
});

test("Geänderte Hierarchie wird erkannt; veränderte Zielauswahl gibt keine Löschung frei", async (t) => {
  const root = await rootFor(t);
  await build(root, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const changed = await build(root, 2, { rows: [record({ hierarchy: { kingdom: "Animalia", genus: "Ciconia" } })] });
  assert.equal(changed.buildInputs.comparison.counts.changed, 1);
  const scope = await build(root, 3, { targetNames: ["Ciconia ciconia", "Ciconia nigra"] });
  assert.equal(scope.buildInputs.comparison.mode, "blocked");
  assert.equal(scope.buildInputs.comparison.changesEmitted, 0);
});

test("Abgebrochene oder fehlerhafte Iteratoren bekommen keinen Vollständigkeitsbeleg", async () => {
  const early = coverMasterInputSelection({ colRelease: release(1), colRecords: [record(), record()], targetNames: [], providerSlices: [] });
  for await (const item of early.records()) { assert.ok(item); break; }
  assert.equal(early.coverage[0].complete, false);
  const failed = coverMasterInputSelection({ colRelease: release(1), targetNames: [], providerSlices: [],
    colRecords: (async function* () { yield record(); throw new Error("Lesefehler"); })() });
  await assert.rejects(async () => { for await (const item of failed.records()) assert.ok(item); }, /Lesefehler/);
  assert.equal(failed.coverage[0].complete, false);
});

test("Fehler beim Sichern erhält vorhandenen Kandidaten und aktiven Master", async (t) => {
  const root = await rootFor(t);
  await build(root, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await build(root, 2);
  const before = await masterFileFingerprint(taxonomyMasterDatabasePath(root, "active"));
  const staging = await fs.readFile(path.join(taxonomyMasterCandidateDirectory(root), "manifest.json"), "utf8");
  await assert.rejects(build(root, 3, { onProgress(event) {
    if (event.phase === "Aufbaueingänge sichern") throw new Error("simulierter Schreibabbruch");
  } }), /Schreibabbruch/);
  assert.equal(await masterFileFingerprint(taxonomyMasterDatabasePath(root, "active")), before);
  assert.equal(await fs.readFile(path.join(taxonomyMasterCandidateDirectory(root), "manifest.json"), "utf8"), staging);
  assert.deepEqual((await fs.readdir(path.join(root, "master"))).filter((name) => name.startsWith(".staging-")), []);
});

test("Fremde oder nachträglich veränderte Eingangs-/Masterdatei ist keine Wiederverwendungsbasis", async (t) => {
  const root = await rootFor(t), manifest = await build(root, 1), directory = taxonomyMasterCandidateDirectory(root);
  assert.equal((await readBoundMasterBuildInputs(directory, { ...manifest, candidateId: "wrong" })).available, false);
  assert.equal((await readBoundMasterBuildInputs(directory, { ...manifest,
    buildInputs: { ...manifest.buildInputs, file: "../foreign.sqlite" } })).reason, "invalid-input-file");
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"));
  try { db.exec("UPDATE master_taxon SET canonical_scientific_name='Ciconia nigra'"); } finally { db.close(); }
  assert.equal((await readBoundMasterBuildInputs(directory, manifest)).reason, "input-master-binding-mismatch");
  await fs.rm(path.join(directory, MASTER_INPUT_FILE));
  assert.equal((await readBoundMasterBuildInputs(directory, manifest)).reason, "input-baseline-unreadable");
});

test("Ältere direkte Aufrufer bleiben beim Vollaufbau ohne unbewiesene Baseline", async (t) => {
  const root = await rootFor(t);
  const manifest = await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release(1), colRecords: [record()], now: () => time(1) });
  assert.equal(manifest.buildInputs.available, false);
  assert.equal(manifest.buildInputs.reason, "unverified-input-coverage");
  assert.equal(manifest.buildInputs.buildMode, "full");
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const next = await build(root, 2);
  assert.deepEqual(next.buildInputs.comparison.reasons, ["no-input-baseline"]);
});

test("Anbieterbasis zählt den gefilterten Eingang statt der Rohgröße des geprüften Ausschnitts", async (t) => {
  const root = await rootFor(t);
  const manifest = await build(root, 1, { providerSlices: [{ manifest: { provider: "inaturalist", providerVersion: "inat-1",
    retrievedAt: time(1).toISOString(), recordCount: 9000 }, records: [{ providerRecordId: "inat-stork",
    scientificName: "Ciconia ciconia", rank: "species", kingdom: "Animalia" }] }] });
  assert.equal(manifest.buildInputs.sourceCount, 2);
  assert.equal(manifest.buildInputs.recordCount, 2);
  const bound = await readBoundMasterBuildInputs(taxonomyMasterCandidateDirectory(root), manifest);
  assert.equal(bound.available, true);
  try { assert.equal(bound.inputs.sources.find((source) => source.provider === "inaturalist").expected_count, 1); }
  finally { bound.inputs.close(); }
});

test("Expliziter unvollständiger Quellenbeleg verwirft den Neubau statt eine Baseline zu behaupten", async (t) => {
  const root = await rootFor(t);
  const old = await build(root, 1);
  await assert.rejects(build(root, 2, { buildInputCoverage: [{ provider: "catalogue-of-life", version: "COL-2",
    complete: false, rawCount: 1, scopeKey: "incomplete" }] }), /Unvollständiger/);
  assert.equal((await readTaxonomyMasterManifest(root, "staging")).candidateId, old.candidateId);
});

const dependencyRecord = (id, name, extra = {}) => record({ providerRecordId: id, scientificName: name,
  hierarchy: { kingdom: "Animalia", genus: name.split(" ")[0], species: name }, ...extra });
async function dependencyPair(t, beforeRows, afterRows, extra = {}) {
  const root = await rootFor(t);
  const targetNames = [...new Set([...beforeRows, ...afterRows].map((row) => row.scientificName))];
  await build(root, 1, { rows: beforeRows, targetNames, ...extra });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const manifest = await build(root, 2, { rows: afterRows, targetNames, ...extra });
  return { root, manifest, plan: manifest.buildInputs.comparison.dependencyPlan };
}

test("Abhängigkeiten: CoL-Gattungsableitung erfasst weitere Arten, unabhängige Gattung bleibt übrig", async (t) => {
  const rows = [dependencyRecord("white", "Ciconia ciconia"), dependencyRecord("black", "Ciconia nigra"),
    dependencyRecord("raven", "Corvus corax")];
  const { plan } = await dependencyPair(t, rows, [{ ...rows[0], germanNames: [{ name: "Hausstorch" }] }, ...rows.slice(1)]);
  assert.equal(plan.mode, "dependency-plan");
  assert.equal(plan.rebuildTaxa, 2);
  assert.equal(plan.unchangedCandidates, 1);
  assert.equal(plan.reuseAuthorized, false);
});

test("Abhängigkeiten: transitive Eltern-/Akzeptiert-Verknüpfungen und Zyklen enden kontrolliert", async (t) => {
  const rows = [dependencyRecord("a", "Ciconia ciconia", { parentProviderRecordId: "c" }),
    dependencyRecord("b", "Corvus corax", { acceptedProviderRecordId: "a" }),
    dependencyRecord("c", "Ursus arctos", { parentProviderRecordId: "b" }), dependencyRecord("d", "Panthera pardus")];
  const { plan } = await dependencyPair(t, rows, [{ ...rows[0], germanNames: [{ name: "Hausstorch" }] }, ...rows.slice(1)]);
  assert.equal(plan.rebuildTaxa, 3);
  assert.equal(plan.unchangedCandidates, 1);
});

test("Abhängigkeiten: entfernte Elternverknüpfung bleibt im alten Graphen wirksam", async (t) => {
  const parent = dependencyRecord("a", "Ciconia ciconia"), child = dependencyRecord("b", "Corvus corax", { parentProviderRecordId: "a" });
  const { plan } = await dependencyPair(t, [parent, child], [{ ...parent, germanNames: [{ name: "Hausstorch" }] },
    { ...child, parentProviderRecordId: "" }]);
  assert.equal(plan.rebuildTaxa, 2);
  assert.equal(plan.unchangedCandidates, 0);
});

test("Abhängigkeiten: gemeinsame wissenschaftliche Namensvariante verbindet Prüfbedarf, nicht Identitäten", async (t) => {
  const rows = [dependencyRecord("a", "Ciconia ciconia", { scientificNames: [{ scientificName: "Corvus corax" }] }),
    dependencyRecord("b", "Corvus corax"), dependencyRecord("c", "Ursus arctos")];
  const { plan, manifest } = await dependencyPair(t, rows, [{ ...rows[0], germanNames: [{ name: "Hausstorch" }] }, ...rows.slice(1)]);
  assert.equal(plan.rebuildTaxa, 2);
  assert.equal(plan.unchangedCandidates, 1);
  assert.equal(manifest.summary.taxa, 3);
});

test("Abhängigkeiten: eigene Projektfelder werden selbst bei unveränderten Quellen neu geprüft", async (t) => {
  const rows = [dependencyRecord("a", "Ciconia ciconia"), dependencyRecord("b", "Corvus corax")];
  const { plan } = await dependencyPair(t, rows, rows, { projectTaxa: [{ projectTaxonKey: "stork",
    scientificName: "Ciconia ciconia", kingdom: "Animalia", germanName: "Weißstorch" }] });
  assert.equal(plan.statefulTaxa, 1);
  assert.equal(plan.rebuildTaxa, 1);
  assert.equal(plan.unchangedCandidates, 1);
});

test("Abhängigkeiten: verschwundene Art markiert alte Gattungsverbraucher ohne Löschfreigabe", async (t) => {
  const rows = [dependencyRecord("white", "Ciconia ciconia"), dependencyRecord("black", "Ciconia nigra"),
    dependencyRecord("raven", "Corvus corax")];
  const { plan } = await dependencyPair(t, rows, rows.slice(1));
  assert.equal(plan.previousOnlyTaxa, 1);
  assert.equal(plan.rebuildTaxa, 1);
  assert.equal(plan.unchangedCandidates, 1);
  assert.equal(plan.reuseAuthorized, false);
});

test("Abhängigkeiten: Änderungen ohne belegbaren Verbraucher erzwingen vollständige Neuberechnung", async (t) => {
  const rows = [dependencyRecord("a", "Ciconia ciconia")];
  const { root, manifest } = await dependencyPair(t, rows, rows);
  const before = await readBoundMasterBuildInputs(taxonomyMasterActiveDirectory(root), await readTaxonomyMasterManifest(root, "active"));
  const after = await readBoundMasterBuildInputs(taxonomyMasterCandidateDirectory(root), manifest);
  try {
    const original = Array.from(after.inputs.records());
    const withUnmapped = { ...after.inputs, records: () => [...original,
      { provider: "catalogue-of-life", record_id: "zz-unmapped", semantic_hash: "a".repeat(64) }].values() };
    const plan = await planMasterDependencies({ filename: path.join(root, "unmapped-plan.sqlite"),
      previousPath: taxonomyMasterDatabasePath(root, "active"), currentPath: taxonomyMasterDatabasePath(root, "staging"),
      beforeInputs: before.inputs, afterInputs: withUnmapped });
    assert.equal(plan.mode, "full-build-required");
    assert.equal(plan.unmappedChanges, 1);
    assert.equal(plan.unchangedCandidates, 0);
    assert.equal(plan.rebuildTaxa, 1);
  } finally { before.inputs.close(); after.inputs.close(); }
});

function semanticMaster(root) {
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
  try {
    const sources = new Map(db.prepare("SELECT * FROM provider_taxon_assertion").all().map((row) => [row.assertion_id,
      canonicalBuildInput([row.release_id, row.provider_record_id, row.master_taxon_id])]));
    const fields = new Map(db.prepare("SELECT * FROM master_field_assertion").all().map((row) => [row.assertion_id,
      canonicalBuildInput([row.master_taxon_id, row.field_name, row.field_value, row.language, row.release_id,
        sources.get(row.provider_taxon_assertion_id) || null])]));
    const result = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      assert.match(name, /^[a-z_]+$/);
      result[name] = db.prepare(`SELECT * FROM ${name}`).all().map((row) => {
        const value = { ...row };
        for (const column of ["assertion_id", "alias_id", "search_term_id"]) delete value[column];
        for (const column of ["provider_taxon_assertion_id", "source_assertion_id"]) {
          if (value[column] != null) value[column] = sources.get(value[column]);
        }
        for (const column of ["current_assertion_id", "candidate_assertion_id"]) {
          if (value[column] != null) value[column] = fields.get(value[column]);
        }
        return canonicalBuildInput(value);
      }).sort();
    }
    return result;
  } finally { db.close(); }
}

test("Wiederverwendung entspricht Vollaufbau einschließlich aktueller Provenienz und Suchindex", async (t) => {
  const root = await rootFor(t);
  const rows = [dependencyRecord("a", "Ciconia ciconia"), dependencyRecord("b", "Ciconia nigra"), dependencyRecord("c", "Corvus corax")];
  const targetNames = rows.map((row) => row.scientificName);
  await build(root, 1, { rows, targetNames });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  for (const day of [2, 3]) {
    const currentRows = rows.map((row, index) => ({ ...row, payloadSha256: `payload-${day}-${index}`,
      ...(index === 0 ? { germanNames: [{ name: `Storchenname ${day}` }] } : {}) }));
    const incremental = await build(root, day, { rows: currentRows, targetNames });
    assert.equal(incremental.buildInputs.buildMode, "incremental");
    assert.equal(incremental.buildInputs.reuse.reusedTaxa, 1);
    assert.equal(incremental.buildInputs.reuse.recomputedGroups, 2);
    const snapshot = semanticMaster(root);
    const full = await build(root, day, { rows: currentRows, targetNames, reuseUnchanged: false });
    assert.equal(full.buildInputs.buildMode, "full");
    assert.equal(full.buildInputs.reuse.reason, "explicit-full-build");
    assert.deepEqual(semanticMaster(root), snapshot);
    // Continue from an actually reused result, not only from the oracle build.
    await build(root, day, { rows: currentRows, targetNames });
    await activateTaxonomyMasterCandidate(root, { confirmed: true });
  }
});

test("Strukturänderung bleibt Vollaufbau und geänderte Quellenreihenfolge wird nicht kopiert", async (t) => {
  const root = await rootFor(t), first = record(), second = record({ providerRecordId: "stork-second" });
  await build(root, 1, { rows: [first, second] });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const reordered = await build(root, 2, { rows: [second, first] });
  assert.equal(reordered.buildInputs.reuse.reusedTaxa, 0);
  const snapshot = semanticMaster(root);
  await build(root, 2, { rows: [second, first], reuseUnchanged: false });
  assert.deepEqual(semanticMaster(root), snapshot);
  const hierarchy = await build(root, 3, { rows: [{ ...first, hierarchy: { kingdom: "Animalia", family: "Other" } }, second] });
  assert.equal(hierarchy.buildInputs.buildMode, "full");
  assert.equal(hierarchy.buildInputs.reuse.reason, "dependency-structure-changed");
});

test("Mehrere Quellen werden neu verknüpft; eigene Projektfelder bleiben im normalen Schreibweg", async (t) => {
  const root = await rootFor(t), rows = [dependencyRecord("a", "Ciconia ciconia"), dependencyRecord("b", "Corvus corax")];
  const targetNames = rows.map((row) => row.scientificName);
  const projectTaxa = [{ projectTaxonKey: "stork", scientificName: "Ciconia ciconia", kingdom: "Animalia", germanName: "Mein Storch" }];
  const providerSlices = (day) => [{ manifest: { provider: "inaturalist", providerVersion: `inat-${day}`, retrievedAt: time(day).toISOString() },
    records: [{ providerRecordId: "inat-raven", scientificName: "Corvus corax", rank: "species", kingdom: "Animalia",
      names: [{ name: "Common raven", language: "en", nameKind: "vernacular", preferred: true, verified: true }],
      retrievedAt: time(day).toISOString(), payloadSha256: `new-payload-${day}` }] }];
  await build(root, 1, { rows, targetNames, projectTaxa, providerSlices: providerSlices(1) });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const incremental = await build(root, 2, { rows, targetNames, projectTaxa, providerSlices: providerSlices(2) });
  assert.equal(incremental.buildInputs.reuse.reusedTaxa, 1);
  assert.equal(incremental.buildInputs.reuse.recomputedGroups, 1);
  const snapshot = semanticMaster(root);
  await build(root, 2, { rows, targetNames, projectTaxa, providerSlices: providerSlices(2), reuseUnchanged: false });
  assert.deepEqual(semanticMaster(root), snapshot);
});

test("Abbruch während Wiederverwendungsprüfung und Kopieren schützt aktiven Master und vorhandenen Kandidaten", async (t) => {
  const root = await rootFor(t), rows = benchmarkRows(1000), targetNames = rows.map((row) => row.scientificName);
  await build(root, 1, { rows, targetNames });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await build(root, 2, { rows, targetNames });
  const activeHash = await masterFileFingerprint(taxonomyMasterDatabasePath(root, "active"));
  const candidateHash = await masterFileFingerprint(taxonomyMasterDatabasePath(root, "staging"));
  const oldManifest = await fs.readFile(path.join(taxonomyMasterCandidateDirectory(root), "manifest.json"), "utf8");
  for (const phase of ["Wiederverwendung prüfen", "Abhängigkeiten prüfen", "Masterdatenbank schreiben"]) {
    let reached = false;
    await assert.rejects(build(root, 3, { rows, targetNames, onProgress(event) {
      if (event.phase === phase && (phase !== "Masterdatenbank schreiben" || event.current === 500)) {
        reached = true;
        throw new Error("Testabbruch Wiederverwendung");
      }
    } }), /Testabbruch Wiederverwendung/);
    assert.equal(reached, true);
    assert.equal(await masterFileFingerprint(taxonomyMasterDatabasePath(root, "active")), activeHash);
    assert.equal(await masterFileFingerprint(taxonomyMasterDatabasePath(root, "staging")), candidateHash);
    assert.equal(await fs.readFile(path.join(taxonomyMasterCandidateDirectory(root), "manifest.json"), "utf8"), oldManifest);
    assert.deepEqual((await fs.readdir(path.join(root, "master"))).filter((name) => name.startsWith(".staging-")), []);
  }
  const retry = await build(root, 3, { rows, targetNames });
  assert.equal(retry.buildInputs.reuse.reusedTaxa, 1000);
});

test("Vollständig geänderte Eingänge überspringen nutzlose Wiederverwendungsplanung", async (t) => {
  const root = await rootFor(t), rows = benchmarkRows(20), targetNames = rows.map((row) => row.scientificName);
  await build(root, 1, { rows, targetNames });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const changed = benchmarkRows(20, "dense");
  const manifest = await build(root, 2, { rows: changed, targetNames });
  assert.equal(manifest.buildInputs.reuse.reason, "all-records-changed");
  assert.equal(manifest.buildInputs.reuse.reusedTaxa, 0);
  await assert.rejects(fs.stat(path.join(taxonomyMasterCandidateDirectory(root), "build-reuse-plan.sqlite")), { code: "ENOENT" });
  const snapshot = semanticMaster(root);
  await build(root, 2, { rows: changed, targetNames, reuseUnchanged: false });
  assert.deepEqual(semanticMaster(root), snapshot);
});
