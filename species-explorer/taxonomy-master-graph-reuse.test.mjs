import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { masterDependencyStructureEqual, reuseMasterDependencyPlan, MASTER_REUSE_PLAN } from "./taxonomy-master-graph-reuse.mjs";
import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { coverMasterInputSelection, masterFileFingerprint } from "./taxonomy-master-inputs.mjs";
import { activateTaxonomyMasterCandidate } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { canonicalBuildInput } from "./taxonomy-build-inputs.mjs";
import { benchmarkRows, semanticDigests } from "../scripts/taxonomy-master-benchmark.mjs";

async function fixture(t) {
  const scratch = path.resolve("Testlauf");
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, "master-graph-reuse-"));
  t.after(async () => {
    assert.equal(path.dirname(root), scratch);
    assert.match(path.basename(root), /^master-graph-reuse-[a-zA-Z0-9]+$/u);
    await fs.rm(root, { recursive: true, force: true });
  });
  const rows = benchmarkRows(30);
  const build = (day, options = {}) => {
    const { rows: records = rows, ...extra } = options;
    const now = new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`);
    const colRelease = { providerVersion: `GRAPH-${day}`, importedAt: now.toISOString(), recordCount: records.length };
    const inputs = coverMasterInputSelection({ colRelease, colRecords: records, targetNames: [], providerSlices: [] });
    return buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease, colRecords: inputs.records(),
      buildInputCoverage: inputs.coverage, now: () => now, ...extra });
  };
  await build(1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  return { root, build, rows, active: taxonomyMasterDatabasePath(root), staging: taxonomyMasterDatabasePath(root, "staging") };
}

function graphRows(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    return Object.fromEntries(["taxon", "consumer", "producer", "taxon_work", "key_work", "plan_info"].map((name) =>
      [name, db.prepare(`SELECT * FROM ${name}`).all().map((row) => canonicalBuildInput({ ...row })).sort()]));
  } finally { db.close(); }
}

test("Geprüfter Vorabplan entspricht dem vollständigen Abschlussplan einschließlich aller Kanten und Arbeitsmengen", async (t) => {
  const f = await fixture(t), rows = benchmarkRows(30, "sparse"), hash = await masterFileFingerprint(f.active);
  const result = await f.build(2, { rows });
  assert.equal(result.buildInputs.comparison.dependencyPlan.graphReuse, "verified-prewrite-plan");
  const graph = path.join(path.dirname(f.staging), "build-dependencies.sqlite");
  const expected = graphRows(graph), master = semanticDigests(f.staging);
  const full = await f.build(2, { rows, reuseUnchanged: false });
  assert.equal(full.buildInputs.comparison.dependencyPlan.graphReuse, undefined);
  assert.deepEqual(graphRows(graph), expected);
  assert.deepEqual(semanticDigests(f.staging), master);
  assert.equal(await masterFileFingerprint(f.active), hash);
});

test("Strukturvergleich erkennt alle Arten von Kanten und zustandsabhängigen Markierungen in beiden Richtungen", async (t) => {
  const f = await fixture(t), current = path.join(f.root, "Vergleich # geprüft.sqlite");
  const changes = [
    "UPDATE master_taxon SET canonical_scientific_name='Different species'",
    "UPDATE master_taxon SET rank='genus'",
    "UPDATE master_taxon SET lifecycle_state='stale'",
    "UPDATE master_taxon SET reference_state='external-only'",
    "UPDATE provider_taxon_assertion SET parent_provider_record_id='changed-parent'",
    "UPDATE provider_taxon_assertion SET accepted_provider_record_id='changed-accepted'",
    "UPDATE provider_taxon_assertion SET provider_record_id=provider_record_id || '-changed'",
    "UPDATE provider_taxon_assertion SET master_taxon_id=NULL,match_state='unlinked'",
    "UPDATE provider_taxon_assertion SET scientific_name='Different source'",
    "UPDATE provider_taxon_assertion SET rank='genus'",
    "UPDATE provider_taxon_assertion SET hierarchy_json='{}'",
    "UPDATE provider_taxon_assertion SET match_state='stale'",
    "UPDATE provider_taxon_assertion SET version_change_state='removed'",
    "UPDATE provider_release SET provider='gbif' WHERE provider='catalogue-of-life'",
    "UPDATE provider_release SET release_state='archived' WHERE provider='catalogue-of-life'",
    "UPDATE provider_name_assertion SET name='New synonym' WHERE name_kind='scientific'",
    "DELETE FROM provider_name_assertion WHERE name_kind='scientific'",
    "INSERT INTO master_taxon_alias(master_taxon_id,name,normalized_name,alias_type) SELECT master_taxon_id,'Alias species','alias species','synonym' FROM master_taxon LIMIT 1",
    "INSERT INTO master_decision(decision_id,master_taxon_id,decision_type,decided_at) SELECT 'decision',master_taxon_id,'keep-current','2026-09-23' FROM master_taxon LIMIT 1",
    "INSERT INTO master_taxon_status(master_taxon_id,status_name,status_detail,updated_at) SELECT master_taxon_id,'manually-protected','own decision provenance','2026-09-23' FROM master_taxon LIMIT 1",
    "INSERT INTO master_conflict(conflict_id,master_taxon_id,conflict_type,detected_at) SELECT 'conflict',master_taxon_id,'changed-value','2026-09-23' FROM master_taxon LIMIT 1",
    "INSERT INTO project_taxon_link(project_taxon_key,master_taxon_id,project_slug,scientific_name_at_link,link_state,linked_at,updated_at) SELECT 'project',master_taxon_id,'slug',canonical_scientific_name,'linked','2026-09-23','2026-09-23' FROM master_taxon LIMIT 1",
    "UPDATE master_field_assertion SET origin_kind='manual',provider_taxon_assertion_id=NULL",
  ];
  for (const sql of changes) {
    await fs.copyFile(f.active, current);
    const db = new DatabaseSync(current);
    try { db.exec(sql); } finally { db.close(); }
    assert.equal(await masterDependencyStructureEqual(f.active, current), false, sql);
    assert.equal(await masterDependencyStructureEqual(current, f.active), false, sql);
  }
  await fs.copyFile(f.active, current);
  const db = new DatabaseSync(current);
  try {
    db.exec("UPDATE provider_release SET provider_version=provider_version || '-new',imported_at='2026-09-24'; UPDATE master_field_assertion SET updated_at='2026-09-24'; UPDATE provider_name_assertion SET name='New common name' WHERE name_kind='vernacular'");
  } finally { db.close(); }
  assert.equal(await masterDependencyStructureEqual(f.active, current), true);
});

test("Abbruch der neuen Strukturprüfung erhält aktive Daten und Kandidaten; Wiederholung gelingt", async (t) => {
  const f = await fixture(t);
  await f.build(2);
  const active = await masterFileFingerprint(f.active), staging = await masterFileFingerprint(f.staging);
  await assert.rejects(f.build(3, { onProgress(event) {
    if (event.phase === "Abhängigkeiten vergleichen") throw new Error("Plan-Testabbruch");
  } }), /Plan-Testabbruch/u);
  assert.equal(await masterFileFingerprint(f.active), active);
  assert.equal(await masterFileFingerprint(f.staging), staging);
  const retry = await f.build(3);
  assert.equal(retry.buildInputs.comparison.dependencyPlan.graphReuse, "verified-prewrite-plan");
});

test("Mehrere Generationen verwenden den heutigen Plan; breite und strukturelle Änderungen bleiben im Vollplan", async (t) => {
  const f = await fixture(t);
  const second = await f.build(2, { rows: benchmarkRows(30, "sparse") });
  assert.equal(second.buildInputs.comparison.dependencyPlan.graphReuse, "verified-prewrite-plan");
  await activateTaxonomyMasterCandidate(f.root, { confirmed: true });
  const rows = f.rows.map((row, i) => ({ ...row, ...(i === 20 ? { germanNames: [{ name: "Neuer Name" }] } : {}) }));
  const third = await f.build(3, { rows });
  assert.equal(third.buildInputs.comparison.dependencyPlan.graphReuse, "verified-prewrite-plan");
  const expected = graphRows(path.join(path.dirname(f.staging), "build-dependencies.sqlite"));
  await f.build(3, { rows, reuseUnchanged: false });
  assert.deepEqual(graphRows(path.join(path.dirname(f.staging), "build-dependencies.sqlite")), expected);
  for (const scenario of ["dense", "structure"]) {
    const changedRows = scenario === "dense" ? f.rows.map((row, i) => ({ ...row, germanNames: [{ name: `Alle neu ${i}` }] }))
      : benchmarkRows(30, scenario);
    const result = await f.build(4, { rows: changedRows });
    assert.equal(result.buildInputs.comparison.dependencyPlan.graphReuse, undefined);
    const master = semanticDigests(f.staging);
    await f.build(4, { rows: changedRows, reuseUnchanged: false });
    assert.deepEqual(semanticDigests(f.staging), master);
  }
});

test("Planbindung verhindert fremde, veränderte oder fehlende Grundlagen; Kopie wird erneut geprüft", async (t) => {
  const f = await fixture(t), result = await f.build(2), directory = path.dirname(f.staging);
  const source = path.join(directory, MASTER_REUSE_PLAN), filename = path.join(directory, "checked-plan.sqlite");
  const db = new DatabaseSync(source, { readOnly: true });
  let plan;
  try { plan = JSON.parse(db.prepare("SELECT document_json FROM plan_info").get().document_json); } finally { db.close(); }
  const descriptor = { file: MASTER_REUSE_PLAN, sha256: await masterFileFingerprint(source),
    previousSha256: await masterFileFingerprint(f.active), beforeFingerprint: plan.beforeFingerprint, afterFingerprint: plan.afterFingerprint };
  const options = { descriptor, filename, previousPath: f.active, currentPath: f.staging, previousSha256: descriptor.previousSha256,
    beforeInputs: { fingerprint: plan.beforeFingerprint }, afterInputs: { fingerprint: plan.afterFingerprint }, fingerprint: masterFileFingerprint };
  for (const changed of [{ file: "../elsewhere" }, { sha256: "0".repeat(64) }, { previousSha256: "changed" },
    { beforeFingerprint: "changed" }, { afterFingerprint: "changed" }]) {
    assert.equal(await reuseMasterDependencyPlan({ ...options, descriptor: { ...descriptor, ...changed } }), null);
  }
  assert.equal(await reuseMasterDependencyPlan({ ...options, descriptor: undefined }), null);
  await fs.mkdir(path.join(directory, "missing-plan"));
  assert.equal(await reuseMasterDependencyPlan({ ...options, filename: path.join(directory, "missing-plan", "target.sqlite") }), null);
  await assert.rejects(reuseMasterDependencyPlan({ ...options, fingerprint: (file) =>
    file === filename ? Promise.resolve("changed-copy") : masterFileFingerprint(file) }), /während der Übernahme verändert/u);
  const copied = await masterFileFingerprint(filename);
  await assert.rejects(reuseMasterDependencyPlan(options), { code: "EEXIST" });
  assert.equal(await masterFileFingerprint(filename), copied);
  assert.equal(result.buildInputs.comparison.dependencyPlan.graphReuse, "verified-prewrite-plan");
  for (const document of ["null", '{"mode":"unknown"}', "invalid-json"]) {
    const changed = new DatabaseSync(source);
    try { changed.prepare("UPDATE plan_info SET document_json=?").run(document); } finally { changed.close(); }
    assert.equal(await reuseMasterDependencyPlan({ ...options,
      descriptor: { ...descriptor, sha256: await masterFileFingerprint(source) } }), null);
  }
});
