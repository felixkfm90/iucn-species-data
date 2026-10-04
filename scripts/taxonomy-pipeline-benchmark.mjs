import { benchmarkScratchRoot, assertScratchPath } from "./scratch-paths.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { benchmarkRows, semanticDigests } from "./taxonomy-master-benchmark.mjs";
import { packageSemanticDigests } from "./lightroom-package-benchmark.mjs";
import { childProcessEnvironment } from "../species-explorer/child-process-environment.mjs";
import { coverMasterInputSelection, masterFileFingerprint } from "../species-explorer/taxonomy-master-inputs.mjs";
import { prepareMasterJob } from "../species-explorer/taxonomy-master-job.mjs";
import { startMasterJobProcess } from "../species-explorer/taxonomy-master-process.mjs";
import { taxonomyMasterDatabasePath } from "../species-explorer/taxonomy-master-storage.mjs";
import { lightroomSearchDatabasePath } from "../species-explorer/lightroom-search-storage.mjs";
import { publishTaxonomyPair } from "../species-explorer/taxonomy-publication.mjs";
import { prepareTaxonomyPublicationInWorker } from "../species-explorer/taxonomy-publication-process.mjs";
import { readTaxonomyPublication } from "../species-explorer/taxonomy-publication-storage.mjs";
import { openTaxonomyMasterStore } from "../species-explorer/taxonomy-master-store.mjs";
import { openLightroomSearchStore } from "../species-explorer/lightroom-search-store.mjs";
import { pipelineFixture } from "./taxonomy-benchmark-fixture.mjs";
import { createProcessMeter } from "./taxonomy-benchmark-metrics.mjs";
import { observeBenchmarkWorkers } from "./taxonomy-benchmark-process.mjs";

const script = fileURLToPath(import.meta.url), scratch = benchmarkScratchRoot;
function ownedRun(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), scratch);
  assertScratchPath(resolved, { inspectTree: true });
  assert.match(path.basename(resolved), /^pipeline-benchmark-[a-zA-Z0-9]+$/u);
  return resolved;
}
async function fingerprints(directory) {
  const result = {};
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), "Keine Verknüpfungen in Testdaten erlaubt.");
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, digest] of Object.entries(await fingerprints(filename))) result[path.join(entry.name, name)] = digest;
    } else result[entry.name] = await masterFileFingerprint(filename);
  }
  return result;
}

// Only operation-specific bookkeeping is excluded, after checking its binding.
// Every other schema/info row and all semantic tables remain in the comparison.
export function pipelineDigests(masterPath, packageCopy, manifest, packageManifest, expectedHash) {
  const master = semanticDigests(masterPath), search = packageSemanticDigests(packageCopy);
  const db = new DatabaseSync(masterPath, { readOnly: true });
  try {
    const info = db.prepare("SELECT key,value FROM master_schema_info ORDER BY key").all();
    const cursor = JSON.parse(info.find((row) => row.key === "buildCheckpoint").value);
    assert.match(cursor.contract, /^[a-f0-9]{64}$/u);
    assert.equal(cursor.written, manifest.summary.taxa);
    assert.equal(cursor.reused, manifest.buildInputs.reuse.reusedTaxa);
    assert.equal(cursor.manifest.buildJobRevision, manifest.buildJobRevision);
    assert.equal(cursor.manifest.candidateId, manifest.candidateId);
    master.master_schema_info = info.filter((row) => row.key !== "buildCheckpoint");
  } finally { db.close(); }
  const pkg = new DatabaseSync(packageCopy, { readOnly: true });
  try {
    const info = pkg.prepare("SELECT key,value FROM package_info ORDER BY key").all();
    const values = Object.fromEntries(info.map((row) => [row.key, row.value]));
    assert.equal(values.packageId, packageManifest.packageId);
    assert.equal(values.sourceChecksum, `sha256:${expectedHash}`);
    assert.equal(packageManifest.sourceChecksum, values.sourceChecksum);
    assert.equal(values.masterVersion, manifest.candidateId);
    search.package_info = info.filter((row) => !["packageId", "sourceChecksum"].includes(row.key));
  } finally { pkg.close(); }
  return { master, search };
}

async function sample(root, mode, count, scenario, fixture, profile, windowsIo, cacheKiB) {
  const seed = mode === "seed", reuse = mode === "reuse";
  const base = path.join(root, "sample"), taxonomyRoot = path.join(base, "taxonomy"), searchRoot = path.join(base, "lightroom");
  const version = seed ? 1 : 2, date = new Date(`2026-09-0${version}T12:00:00.000Z`);
  const { rows, providerSlices, colRelease } = pipelineFixture(count, seed ? "unchanged" : scenario, version, fixture);
  const inputs = coverMasterInputSelection({ colRelease, colRecords: rows, targetNames: [], providerSlices });
  const corrections = [{ scientificName: rows.at(-1).scientificName, germanName: "Eigene Namenswahl" }];
  await fs.mkdir(base, { recursive: true });
  const guard = path.join(base, "inputs.json"), guardText = JSON.stringify({ colRelease, corrections, providerSlices });
  await fs.writeFile(guard, guardText);
  const readInputs = () => fs.readFile(guard, "utf8");
  const oldFiles = seed ? [] : [taxonomyMasterDatabasePath(taxonomyRoot), lightroomSearchDatabasePath(searchRoot)]
    .flatMap((filename) => [filename, path.join(path.dirname(filename), "manifest.json")]);
  const before = await Promise.all(oldFiles.map(masterFileFingerprint));
  const readers = [];
  if (!seed) {
    readers.push(await openTaxonomyMasterStore({ taxonomyRoot }), await openLightroomSearchStore({ searchRoot }));
  }
  const stagesMs = {}, phasesMs = {}, workerPids = new Set();
  const observer = observeBenchmarkWorkers(root, profile, { windowsIo, cacheKiB });
  const spawnWorker = (...args) => { const child = observer.spawn(...args); workerPids.add(child.pid); return child; };
  let parentMeter, resources;
  let phase, phaseAt, job, manifest, published, totalMs;
  const progress = (stage) => (event) => {
    const next = `${stage}:${event.phase}`, time = performance.now();
    if (next !== phase) {
      if (phase) phasesMs[phase] = (phasesMs[phase] || 0) + time - phaseAt;
      phase = next; phaseAt = time;
    }
  };
  const measure = async (stage, action) => {
    const start = performance.now();
    progress(stage)({ phase: "start" });
    const result = await action();
    stagesMs[stage] = performance.now() - start;
    return result;
  };
  try {
    // Includes durable input spool, checkpoints, child startup/exit, all normal
    // validations, pair copy and atomic switch. Fixture/oracle work is outside.
    parentMeter = profile ? createProcessMeter() : null;
    const start = performance.now();
    job = await measure("prepare", () => prepareMasterJob({ taxonomyRoot, colRelease, colRecords: inputs.records(),
      buildInputCoverage: inputs.coverage, providerSlices, corrections, guardFiles: [guard], reuseUnchanged: reuse, now: () => date }));
    manifest = await measure("master", () => startMasterJobProcess({ taxonomyRoot, id: job.id,
      spawnProcess: spawnWorker, onProgress: progress("master") }));
    published = await measure("publish", () => publishTaxonomyPair({ taxonomyRoot, searchRoot, confirmed: true,
      corrections, now: () => date, readInputs,
      validateInputs: async () => assert.equal(await readInputs(), guardText), onProgress: progress("publish"),
      prepare: (options) => prepareTaxonomyPublicationInWorker({ ...options, incremental: reuse,
        projectRevision: "pipeline-benchmark", spawnProcess: spawnWorker }),
    }));
    totalMs = performance.now() - start;
    phasesMs[phase] = (phasesMs[phase] || 0) + performance.now() - phaseAt;
    if (parentMeter) { resources = { controller: parentMeter.finish() }; parentMeter = null; }
    if (profile) {
      resources.workers = await observer.collect();
      for (const worker of resources.workers) {
        assert.equal(worker.process.cache.requestedKiB, cacheKiB);
        if (cacheKiB) assert.ok(worker.process.cache.connections > 0);
      }
    }

    assert.equal(workerPids.size, 2, "Master und Paarvorbereitung müssen in getrennten Hilfsprozessen laufen.");
    assert.ok(!workerPids.has(process.pid));
    assert.equal(manifest.summary.taxa, count);
    const expectedSources = count + providerSlices.reduce((sum, slice) => sum + slice.records.length, 0);
    assert.equal(manifest.validation.sourceTaxa, expectedSources);
    assert.equal(manifest.validation.sliceMemberships, count + providerSlices.reduce((sum, slice) => sum + 2 * slice.records.length, 0));
    const recipe = JSON.parse(await fs.readFile(path.join(job.directory, "recipe.json"), "utf8"));
    assert.match(recipe.revision, /^[a-f0-9]{64}$/u);
    assert.equal(manifest.buildJobRevision, recipe.revision);
    const broad = scenario === "dense" && count >= 1000;
    assert.equal(published.active.build.mode, reuse && !broad ? "incremental" : "full");
    if (!reuse) {
      assert.equal(manifest.buildInputs.reuse.reusedTaxa, 0);
      assert.equal(published.active.build.reason, "requested");
    } else if (broad) assert.equal(published.active.build.reason, "many-changed-taxa");
    if (reuse) {
      // Explicit corrections conservatively rebuild their genus group too.
      const affected = new Set([Math.floor((count - 1) / 10)]);
      if (scenario === "sparse") for (let index = 0; index < count; index += 1000) affected.add(Math.floor(index / 10));
      const expected = ["structure", "dense"].includes(scenario) ? 0
        : rows.filter((_, index) => !affected.has(Math.floor(index / 10))).length;
      assert.equal(manifest.buildInputs.reuse.reusedTaxa, expected);
    }
    const masterPath = taxonomyMasterDatabasePath(taxonomyRoot), packagePath = lightroomSearchDatabasePath(searchRoot);
    const masterHash = await masterFileFingerprint(masterPath), packageHash = await masterFileFingerprint(packagePath);
    const pointer = readTaxonomyPublication(taxonomyRoot);
    assert.equal(pointer.active.masterVersion, manifest.candidateId);
    assert.equal(pointer.active.packageId, published.active.packageId);
    assert.equal(pointer.active.masterChecksum, `sha256:${masterHash}`);
    assert.equal(pointer.active.packageChecksum, `sha256:${packageHash}`);
    const master = await openTaxonomyMasterStore({ taxonomyRoot }); readers.push(master);
    const search = await openLightroomSearchStore({ searchRoot }); readers.push(search);
    assert.equal(master.manifest.candidateId, search.manifest.masterVersion);
    assert.equal(master.search({ query: "Eigene Namenswahl" }).results[0].germanName, "Eigene Namenswahl");
    assert.equal(search.search("Eigene Namenswahl")[0].germanName, "Eigene Namenswahl");
    if (!seed) {
      assert.equal(readers[0].manifest.candidateId, pointer.previous.masterVersion);
      assert.equal(readers[1].search("Beispiel Art 0")[0].germanName, "Beispiel Art 0");
    }
    const searches = {};
    for (const query of ["Beispiel Art 0", "Geänderte Art 0", "Example species 1", "Testgenusa speciesa", "Changedfamily", "Eigene Namenswahl"]) {
      searches[query] = search.search(query).map((row) => [row.masterTaxonId, row.germanName, row.acceptedScientificName]).sort();
    }
    // The FTS integrity command needs a writable connection; run it ONLY on an
    // oracle copy, never on either published package or its predecessor.
    const packageCopy = path.join(base, "oracle.sqlite");
    await fs.copyFile(packagePath, packageCopy);
    const digests = pipelineDigests(masterPath, packageCopy, manifest, published.active, masterHash);
    assert.deepEqual(await Promise.all(oldFiles.map(masterFileFingerprint)), before);
    assert.equal(await masterFileFingerprint(masterPath), masterHash);
    assert.equal(await masterFileFingerprint(packagePath), packageHash);
    await fs.rm(assertScratchPath(packageCopy));
    return { totalMs, stagesMs, phasesMs, sourceTaxa: expectedSources, ...(profile ? { resources } : {}), reusedTaxa: manifest.buildInputs.reuse.reusedTaxa,
      packageBuild: published.active.build, databaseBytes: { master: (await fs.stat(masterPath)).size, search: (await fs.stat(packagePath)).size },
      digests, searches };
  } finally { parentMeter?.finish(); await observer.close(); for (const reader of readers.reverse()) reader.close(); }
}

async function subprocess(root, mode, count, scenario, fixture, profile, windowsIo, cacheKiB) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", script, "--worker", root, mode, String(count), scenario, fixture, String(profile), String(windowsIo), String(cacheKiB)],
      { env: childProcessEnvironment(process.execPath), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { error = (error + data).slice(-16000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Gesamtlauf-Messprozess fehlgeschlagen (${code}): ${error}`));
      try { resolve(JSON.parse(output)); } catch (cause) { reject(cause); }
    });
  });
}

export async function runPipelineBenchmark({ count = 1000, scenario = "sparse", repeats = 2, fixture = "single", profile = false, windowsIo = false, cacheKiB = 0 } = {}) {
  benchmarkRows(count, scenario);
  assert.ok(["single", "multi"].includes(fixture), "Unbekannter Messbestand.");
  assert.equal(typeof profile, "boolean", "Ungültiger Profilmodus.");
  assert.equal(typeof windowsIo, "boolean", "Ungültiger Windows-Messmodus.");
  assert.ok(!windowsIo || profile, "Windows-Messung benötigt den ausdrücklichen Profilmodus.");
  assert.ok([0, 8192].includes(cacheKiB) && (!cacheKiB || profile), "Unzulässige Testpuffergröße oder fehlender Profilmodus.");
  assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 3, "Ein bis drei Messpaare erforderlich.");
  assertScratchPath(scratch, { allowRoot: true });
  await fs.mkdir(scratch, { recursive: true });
  const root = ownedRun(await fs.mkdtemp(path.join(scratch, "pipeline-benchmark-")));
  try {
    await subprocess(root, "seed", count, scenario, fixture, profile, windowsIo, cacheKiB);
    const target = path.join(root, "sample"), snapshot = path.join(root, "snapshot");
    assert.equal(path.dirname(target), ownedRun(root));
    await fs.rename(target, snapshot);
    const baseline = await fingerprints(snapshot), samples = [];
    let expected;
    for (let trial = 1; trial <= repeats; trial += 1) {
      for (const mode of trial % 2 ? ["reuse", "full"] : ["full", "reuse"]) {
        // Restore to the SAME absolute path: common pointers/job bindings contain
        // absolute roots. Copying to a different path would test the legacy path.
        assert.equal(path.dirname(target), ownedRun(root));
        await fs.rm(assertScratchPath(target, { inspectTree: true }), { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
        await fs.cp(snapshot, target, { recursive: true });
        process.stderr.write(`Gesamtlauf: ${count} Arten, ${scenario}, Paar ${trial}, ${mode}\n`);
        const { digests, searches, ...metrics } = await subprocess(root, mode, count, scenario, fixture, profile, windowsIo, cacheKiB);
        if (expected) assert.deepEqual({ digests, searches }, expected, "Master, Paket oder Suche weicht vom Vollaufbau ab.");
        expected = { digests, searches };
        assert.deepEqual(await fingerprints(snapshot), baseline, "Ausgangspaar wurde verändert.");
        samples.push({ trial, mode, ...metrics });
        process.stderr.write(`Messwert: ${JSON.stringify({ trial, mode, totalMs: metrics.totalMs, stagesMs: metrics.stagesMs })}\n`);
      }
    }
    return { count, scenario, repeats, fixture, profile, windowsIo, cacheKiB, node: process.version, platform: process.platform, semanticEquality: true,
      searchesEqual: true, oldReadersPreserved: true, namePreferencePreserved: true, baselineUnchanged: true, samples };
  } finally { await fs.rm(ownedRun(root), { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    let result;
    if (mode === "--worker") {
      ownedRun(args[0]);
      assert.ok(["seed", "reuse", "full"].includes(args[1]));
      assert.ok(["true", "false"].includes(args[5]) && ["true", "false"].includes(args[6]));
      assert.ok(["0", "8192"].includes(args[7]));
      result = await sample(args[0], args[1], Number(args[2]), args[3], args[4], args[5] === "true", args[6] === "true", Number(args[7]));
    } else {
      const flags = args.slice(3);
      assert.ok(flags.length <= 3 && new Set(flags).size === flags.length && flags.every((flag) => ["--profile", "--windows-io", "--cache-8mib"].includes(flag)), "Unbekannte Messoption.");
      result = await runPipelineBenchmark({ count: Number(mode || 1000), scenario: args[0] || "sparse",
        repeats: Number(args[1] || 2), fixture: args[2] || "single", profile: flags.includes("--profile"),
        windowsIo: flags.includes("--windows-io"), cacheKiB: flags.includes("--cache-8mib") ? 8192 : 0 });
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
