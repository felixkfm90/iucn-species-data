import { benchmarkScratchRoot, assertScratchPath } from "./scratch-paths.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { benchmarkRows } from "./taxonomy-master-benchmark.mjs";
import { coverMasterInputSelection, masterFileFingerprint } from "../species-explorer/taxonomy-master-inputs.mjs";
import { prepareMasterJob } from "../species-explorer/taxonomy-master-job.mjs";
import { startMasterJobProcess } from "../species-explorer/taxonomy-master-process.mjs";
import { taxonomyMasterDatabasePath } from "../species-explorer/taxonomy-master-storage.mjs";
import { publishTaxonomyPair, rollbackTaxonomyPair } from "../species-explorer/taxonomy-publication.mjs";
import { prepareTaxonomyPublicationInWorker } from "../species-explorer/taxonomy-publication-process.mjs";
import { readTaxonomyPublication } from "../species-explorer/taxonomy-publication-storage.mjs";
import { openTaxonomyMasterStore } from "../species-explorer/taxonomy-master-store.mjs";
import { openLightroomSearchStore } from "../species-explorer/lightroom-search-store.mjs";
import { buildLightroomSearchPackage } from "../species-explorer/lightroom-search-package.mjs";
import { lightroomSearchDatabasePath } from "../species-explorer/lightroom-search-storage.mjs";

const script = fileURLToPath(import.meta.url);
const scratch = benchmarkScratchRoot;
function ownedRun(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), scratch);
  assertScratchPath(resolved, { inspectTree: true });
  assert.match(path.basename(resolved), /^taxonomy-operation-[a-zA-Z0-9]+$/u);
  return resolved;
}

function packageRows(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    return Object.fromEntries(["provider_release", "taxon", "taxon_status", "taxon_provider", "project_link", "hierarchy", "search_term"]
      .map((table) => {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name)
          .filter((name) => name !== "search_term_id").join(", ");
        return [table, db.prepare(`SELECT ${columns} FROM ${table} ORDER BY ${columns}`).all()];
      }));
  } finally { db.close(); }
}

// Only generated fixtures are accepted. No path argument, provider download,
// Git action, Lightroom process or photo catalog is part of this check.
export async function runOperationalCheck({ count = 2000, onProgress = () => {} } = {}) {
  assert.ok(Number.isInteger(count) && count >= 1200 && count <= 20000, "1200 bis 20000 Testarten erforderlich.");
  assertScratchPath(scratch, { allowRoot: true });
  await fs.mkdir(scratch, { recursive: true });
  const root = ownedRun(await fs.mkdtemp(path.join(scratch, "taxonomy-operation-")));
  const taxonomyRoot = path.join(root, "taxonomy"), searchRoot = path.join(root, "lightroom");
  const options = { taxonomyRoot, searchRoot, confirmed: true, prepare: prepareTaxonomyPublicationInWorker };
  const measurements = {}, readers = [];
  const measure = async (label, action) => {
    onProgress(label);
    const start = performance.now();
    const result = await action();
    measurements[label] = performance.now() - start;
    return result;
  };
  const scientificName = benchmarkRows(count).at(-1).scientificName;
  const corrections = [{ scientificName, germanName: "Eigene Namenswahl" }];
  const jobFor = async (version, scenario) => {
    const rows = benchmarkRows(count, scenario);
    const colRelease = { providerVersion: `OPERATIONS-${version}`, importedAt: `2026-09-0${version}T12:00:00.000Z`, recordCount: count };
    const inputs = coverMasterInputSelection({ colRelease, colRecords: rows, targetNames: [], providerSlices: [] });
    return prepareMasterJob({ taxonomyRoot, colRelease, colRecords: inputs.records(),
      buildInputCoverage: inputs.coverage, corrections, now: () => new Date(colRelease.importedAt) });
  };
  const openReaders = async () => {
    const master = await openTaxonomyMasterStore({ taxonomyRoot }); readers.push(master);
    const search = await openLightroomSearchStore({ searchRoot }); readers.push(search);
    assert.equal(master.manifest.candidateId, search.manifest.masterVersion);
    assert.equal(master.search({ query: "Eigene Namenswahl" }).results[0].germanName, "Eigene Namenswahl");
    assert.equal(search.search("Eigene Namenswahl")[0].germanName, "Eigene Namenswahl");
    return { master, search };
  };
  try {
    const initialJob = await measure("prepareInitial", () => jobFor(1, "unchanged"));
    const first = await measure("buildInitial", () => startMasterJobProcess({ taxonomyRoot, id: initialJob.id }));
    await measure("publishInitial", () => publishTaxonomyPair({ ...options, corrections }));
    const old = await openReaders();
    const oldMasterPath = taxonomyMasterDatabasePath(taxonomyRoot);
    const oldPackagePath = lightroomSearchDatabasePath(searchRoot);
    const before = await Promise.all([masterFileFingerprint(oldMasterPath), masterFileFingerprint(oldPackagePath)]);

    const job = await measure("prepareUpdate", () => jobFor(2, "sparse"));
    let child, killed = false;
    await measure("interruptedBuild", () => assert.rejects(startMasterJobProcess({ taxonomyRoot, id: job.id,
      spawnProcess(...args) { child = spawn(...args); return child; },
      onProgress(event) {
        if (event.written >= 500 && !killed) { killed = true; child.kill("SIGKILL"); }
      },
    }), { code: "MASTER_WORKER_EXIT" }));
    assert.ok(killed);
    const partial = new DatabaseSync(path.join(job.directory, "candidate", "taxonomy-master.sqlite"), { readOnly: true });
    let checkpoint;
    try {
      checkpoint = JSON.parse(partial.prepare("SELECT value FROM master_schema_info WHERE key='buildCheckpoint'").get().value);
      assert.ok(checkpoint.written >= 500 && checkpoint.written <= count);
      assert.equal(partial.prepare("SELECT COUNT(*) AS n FROM master_taxon").get().n, checkpoint.written);
    } finally { partial.close(); }
    assert.equal(readTaxonomyPublication(taxonomyRoot).active.masterVersion, first.candidateId);
    const resumed = await measure("resumeBuild", () => startMasterJobProcess({ taxonomyRoot, id: job.id, resume: true }));
    assert.equal(resumed.summary.taxa, count);
    assert.ok(resumed.buildInputs.reuse.reusedTaxa > 0);
    assert.deepEqual(await Promise.all([masterFileFingerprint(oldMasterPath), masterFileFingerprint(oldPackagePath)]), before);

    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 10);
    try { await measure("publishUpdate", () => publishTaxonomyPair({ ...options, corrections })); }
    finally { clearInterval(timer); }
    assert.ok(ticks > 1, "Parent remains responsive during pair preparation");
    const current = await openReaders();
    assert.equal(current.master.manifest.candidateId, resumed.candidateId);
    assert.equal(current.search.manifest.build.mode, "incremental");
    assert.equal(current.search.search("Geänderte Art 0")[0].germanName, "Geänderte Art 0");
    assert.equal(old.master.manifest.candidateId, first.candidateId);
    assert.equal(old.search.search("Beispiel Art 0")[0].germanName, "Beispiel Art 0");
    const fullRoot = path.join(root, "full-package");
    await measure("fullPackageComparison", () => buildLightroomSearchPackage({ taxonomyRoot, searchRoot: fullRoot, incremental: false }));
    assert.deepEqual(packageRows(lightroomSearchDatabasePath(searchRoot)), packageRows(lightroomSearchDatabasePath(fullRoot, "staging")));

    await measure("rollback", () => rollbackTaxonomyPair({ ...options, corrections }));
    const restored = await openReaders();
    assert.equal(restored.master.manifest.candidateId, first.candidateId);
    assert.equal(restored.search.search("Beispiel Art 0")[0].germanName, "Beispiel Art 0");
    // The reader left open on version 2 remains usable after rollback too.
    assert.equal(current.search.search("Geänderte Art 0")[0].germanName, "Geänderte Art 0");
    assert.deepEqual(await Promise.all([masterFileFingerprint(oldMasterPath), masterFileFingerprint(oldPackagePath)]), before);
    return { count, node: process.version, platform: process.platform, checkpoint: checkpoint.written,
      reusedTaxa: resumed.buildInputs.reuse.reusedTaxa, packageMode: current.search.manifest.build.mode,
      packageEquality: true, oldReadersPreserved: true, namePreferencePreserved: true, rollbackVerified: true,
      parentTicksDuringPublication: ticks, measurementsMs: measurements };
  } finally {
    for (const reader of readers.reverse()) reader.close();
    await fs.rm(ownedRun(root), { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  try {
    const result = await runOperationalCheck({ count: Number(process.argv[2] || 2000),
      onProgress: (label) => process.stderr.write(`Betriebsprüfung: ${label}\n`) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
