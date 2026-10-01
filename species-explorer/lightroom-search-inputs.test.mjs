import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { benchmarkRows } from "../scripts/taxonomy-master-benchmark.mjs";
import { packageSemanticDigests } from "../scripts/lightroom-package-benchmark.mjs";
import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { buildLightroomSearchPackage, verifyLightroomSearchPackage } from "./lightroom-search-package.mjs";
import { activateLightroomSearchPackage, lightroomSearchDatabasePath, sha256File } from "./lightroom-search-storage.mjs";

const now = () => new Date("2026-09-21T10:00:00Z");
async function fixture(t) {
  const scratch = fileURLToPath(new URL("../Testlauf/", import.meta.url));
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, "lightroom-input-"));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(scratch));
    assert.match(path.basename(root), /^lightroom-input-[a-zA-Z0-9]+$/u);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  });
  const taxonomyRoot = path.join(root, "taxonomy"), searchRoot = path.join(root, "package");
  await buildTaxonomyMasterCandidate({ taxonomyRoot, now, colRecords: benchmarkRows(20, "unchanged"),
    colRelease: { providerVersion: "export-test", importedAt: now().toISOString(), recordCount: 20 } });
  const options = { taxonomyRoot, searchRoot, sourceSlot: "staging", now };
  await buildLightroomSearchPackage(options);
  await activateLightroomSearchPackage(searchRoot, { verify: verifyLightroomSearchPackage });
  const source = taxonomyMasterDatabasePath(taxonomyRoot, "staging"), base = lightroomSearchDatabasePath(searchRoot);
  const database = new DatabaseSync(source);
  const id = database.prepare("SELECT master_taxon_id id FROM master_taxon ORDER BY master_taxon_id LIMIT 1").get().id;
  database.close();
  return { root, options, source, base, id };
}
function change(f, sql) {
  const database = new DatabaseSync(f.source);
  try { database.exec(sql.replaceAll("TARGET", `'${f.id}'`)); } finally { database.close(); }
}
async function compare(f, { projected = 1, affected = projected, mode = "incremental", onProgress } = {}) {
  const before = await sha256File(f.base), sourceBefore = await sha256File(f.source);
  const manifest = await buildLightroomSearchPackage({ ...f.options, onProgress });
  assert.equal(manifest.build.mode, mode);
  if (mode === "incremental") {
    assert.equal(manifest.build.scope.projectedTaxa, projected);
    assert.equal(manifest.build.scope.affectedTaxa, affected);
    assert.equal(manifest.build.projection, "changed-taxa");
  }
  const fullRoot = path.join(f.root, "full");
  await buildLightroomSearchPackage({ ...f.options, searchRoot: fullRoot, incremental: false });
  assert.deepEqual(packageSemanticDigests(lightroomSearchDatabasePath(f.options.searchRoot, "staging")),
    packageSemanticDigests(lightroomSearchDatabasePath(fullRoot, "staging")));
  assert.equal(await sha256File(f.base), before);
  assert.equal(await sha256File(f.source), sourceBefore);
  return manifest;
}

for (const [name, sql] of [
  ["ausgewählter deutscher Name", "UPDATE master_field_assertion SET field_value='Neuer Name' WHERE master_taxon_id=TARGET AND field_name='german-name' AND selected=1"],
  ["fehlender ausgewählter Name", "UPDATE master_field_assertion SET selected=0 WHERE master_taxon_id=TARGET AND field_name='german-name'"],
  ["ausgewählte Hierarchie", "UPDATE master_field_assertion SET field_value='Neu' WHERE master_taxon_id=TARGET AND field_name='family' AND selected=1"],
  ["Anbieterhierarchie", "UPDATE provider_taxon_assertion SET hierarchy_json='{}' WHERE master_taxon_id=TARGET"],
  ["entfernte Quelle", "UPDATE provider_taxon_assertion SET version_change_state='removed' WHERE master_taxon_id=TARGET"],
  ["Quellenzuordnung", "UPDATE provider_taxon_assertion SET match_state='stale' WHERE master_taxon_id=TARGET"],
  ["Statusinhalt", "UPDATE master_taxon_status SET status_detail='Neue Details' WHERE master_taxon_id=TARGET"],
  ["Konfliktfilter", `INSERT INTO master_taxon_status VALUES (TARGET,'conflicting','Test','today');
    INSERT INTO master_conflict (conflict_id,master_taxon_id,conflict_type,conflict_state,detected_at)
    VALUES ('c',TARGET,'changed-value','open','today')`],
  ["Projektlink", "INSERT INTO project_taxon_link VALUES ('project',TARGET,'slug','Testus species','linked','today','today')"],
  ["Lebenszyklus", "UPDATE master_taxon SET reference_state='reference-gap' WHERE master_taxon_id=TARGET"],
  ["gleicher Begriff mit zusätzlichem Quellenbeleg", `INSERT INTO master_search_term (master_taxon_id,term,normalized_term,folded_term,german_key,term_kind,language,source_provider,weight)
    SELECT master_taxon_id,term,normalized_term,folded_term,german_key,term_kind,language,'worms',weight
    FROM master_search_term WHERE master_taxon_id=TARGET LIMIT 1`],
]) {
  test(`Gezielter Export entspricht Vollaufbau: ${name}`, async (t) => {
    const f = await fixture(t);
    change(f, sql);
    await compare(f);
  });
}

test("Neue Version und Zeiten benötigen keinen fachlichen Export, behalten aber aktuelle Provenienz", async (t) => {
  const f = await fixture(t);
  change(f, `UPDATE provider_release SET provider_version='new', imported_at='today';
    UPDATE provider_taxon_assertion SET retrieved_at='today';
    UPDATE master_taxon SET updated_at='today'; UPDATE master_taxon_status SET updated_at='today';
    UPDATE master_search_term SET search_term_id=search_term_id+10000;`);
  const result = await compare(f, { projected: 0 });
  assert.equal(result.build.changes.search_term.written, 0);
  assert.equal(result.build.changes.taxon.written, 0, "only the separate provenance refresh changes timestamps");
  assert.equal(result.build.provenanceChanges.taxon, 20);
  assert.equal(result.build.provenanceChanges.taxon_provider, 20);
});

test("Teilprojektion enthält wirklich nur betroffene Arten; alte Such-IDs bleiben erhalten", async (t) => {
  const f = await fixture(t);
  const old = new DatabaseSync(f.base, { readOnly: true });
  const before = old.prepare("SELECT * FROM search_term WHERE master_taxon_id != ? ORDER BY search_term_id").all(f.id);
  old.close();
  change(f, "UPDATE master_field_assertion SET field_value='Andere Familie' WHERE master_taxon_id=TARGET AND field_name='family' AND selected=1");
  let observed = false;
  await compare(f, { onProgress(event) {
    if (event.phase !== "index") return;
    const folder = readdirSync(f.options.searchRoot).find((name) => name.startsWith(".build-"));
    const projection = new DatabaseSync(path.join(f.options.searchRoot, folder, "projection.sqlite"), { readOnly: true });
    try {
      assert.equal(projection.prepare("SELECT count(*) n FROM taxon").get().n, 1);
      assert.equal(projection.prepare("SELECT count(*) n FROM export_input").get().n, 20);
      observed = true;
    } finally { projection.close(); }
  } });
  assert.equal(observed, true);
  const result = new DatabaseSync(lightroomSearchDatabasePath(f.options.searchRoot, "staging"), { readOnly: true });
  try { assert.deepEqual(result.prepare("SELECT * FROM search_term WHERE master_taxon_id != ? ORDER BY search_term_id").all(f.id), before); }
  finally { result.close(); }
});

test("Entfernung, neue Art, Wiederholung und leeres Ergebnis bleiben über mehrere Paketgenerationen gleich", async (t) => {
  const f = await fixture(t);
  change(f, "UPDATE master_taxon SET lifecycle_state='deprecated' WHERE master_taxon_id=TARGET");
  await compare(f, { projected: 0, affected: 1 });
  await activateLightroomSearchPackage(f.options.searchRoot, { verify: verifyLightroomSearchPackage });
  change(f, `INSERT INTO master_taxon (master_taxon_id,canonical_scientific_name,canonical_name_normalized,rank,
    kingdom,lifecycle_state,reference_state,created_at,updated_at)
    VALUES ('new','Novus species','novus species','species','Animalia','active','reference-gap','today','today')`);
  await compare(f);
  await activateLightroomSearchPackage(f.options.searchRoot, { verify: verifyLightroomSearchPackage });
  await compare(f, { projected: 0 });
  change(f, "UPDATE master_taxon SET lifecycle_state='deprecated'");
  await compare(f, { projected: 0, affected: 20 });
});

async function editBase(f, sql, editManifest = () => {}) {
  if (sql) {
    const db = new DatabaseSync(f.base);
    try { db.exec(sql); } finally { db.close(); }
  }
  const file = path.join(path.dirname(f.base), "manifest.json");
  const manifest = JSON.parse(await fs.readFile(file, "utf8"));
  manifest.checksum = `sha256:${await sha256File(f.base)}`;
  editManifest(manifest);
  await fs.writeFile(file, JSON.stringify(manifest));
}
for (const [name, sql, edit] of [
  ["Altbestand ohne Vergleichswerte", "DROP TABLE export_input", (m) => { delete m.exportContract; }],
  ["andere Exportregeln", "", (m) => { m.exportContract = "other"; }],
  ["unvollständiger Vergleichsbestand", "DELETE FROM export_input WHERE master_taxon_id=(SELECT master_taxon_id FROM export_input LIMIT 1)"],
  ["falsche Quellenbindung", "UPDATE package_info SET value='wrong' WHERE key='sourceChecksum'"],
]) {
  test(`Unsichere Delta-Grundlage wird vollständig aufgebaut: ${name}`, async (t) => {
    const f = await fixture(t);
    await editBase(f, sql, edit);
    const result = await compare(f, { mode: "full" });
    assert.equal(result.build.reason, "no-bound-export-inputs");
  });
}

test("Parallelprüfung erkennt Fremdschlüsselfehler trotz korrekter Dateiprüfsumme und erzwingt Vollaufbau", async (t) => {
  const f = await fixture(t);
  await editBase(f, "PRAGMA foreign_keys=OFF; INSERT INTO hierarchy VALUES ('missing',1,'family','Broken','manual')",
    (m) => { m.hierarchyCount += 1; });
  await compare(f, { mode: "full" });
});

for (const phase of ["copy", "index", "validate"]) {
  test(`Abbruch bei ${phase} erhält Basis und vorhandenes Staging; erneuter Versuch gelingt`, async (t) => {
    const f = await fixture(t);
    await buildLightroomSearchPackage(f.options);
    const staging = lightroomSearchDatabasePath(f.options.searchRoot, "staging");
    const before = await sha256File(staging), base = await sha256File(f.base);
    const controller = new AbortController();
    await assert.rejects(buildLightroomSearchPackage({ ...f.options, signal: controller.signal,
      onProgress(event) { if (event.phase === phase) controller.abort(); } }), /abort/i);
    assert.equal(await sha256File(staging), before);
    assert.equal(await sha256File(f.base), base);
    assert.equal(readdirSync(f.options.searchRoot).some((name) => name.startsWith(".build-")), false);
    await compare(f, { projected: 0 });
  });
}

test("Quellenänderung während des Exports ersetzt kein Staging und bleibt erneut verarbeitbar", async (t) => {
  const f = await fixture(t);
  await buildLightroomSearchPackage(f.options);
  const staging = lightroomSearchDatabasePath(f.options.searchRoot, "staging");
  const before = await sha256File(staging), base = await sha256File(f.base);
  await assert.rejects(buildLightroomSearchPackage({ ...f.options, onProgress(event) {
    if (event.phase === "index") change(f, "UPDATE master_field_assertion SET field_value='Parallel geändert' WHERE master_taxon_id=TARGET AND field_name='german-name' AND selected=1");
  } }), /Master wurde während/);
  assert.equal(await sha256File(staging), before);
  assert.equal(await sha256File(f.base), base);
  await compare(f);
});

test("Fehler im Fortschrittskanal beendet auch die parallele Prüfung und erlaubt erneuten Aufbau", async (t) => {
  const f = await fixture(t);
  const base = await sha256File(f.base);
  await assert.rejects(buildLightroomSearchPackage({ ...f.options, onProgress(event) {
    if (event.phase === "index") throw new Error("Fortschrittskanal ausgefallen");
  } }), /Fortschrittskanal ausgefallen/);
  assert.equal(await sha256File(f.base), base);
  assert.equal(readdirSync(f.options.searchRoot).some((name) => name.startsWith(".build-")), false);
  await compare(f, { projected: 0 });
});
