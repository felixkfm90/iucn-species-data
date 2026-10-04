import { benchmarkScratchRoot, assertScratchPath } from "./scratch-paths.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { benchmarkRows } from "./taxonomy-master-benchmark.mjs";
import { childProcessEnvironment } from "../species-explorer/child-process-environment.mjs";
import { canonicalBuildInput } from "../species-explorer/taxonomy-build-inputs.mjs";
import { buildTaxonomyMasterCandidate } from "../species-explorer/taxonomy-master-candidate.mjs";
import { coverMasterInputSelection, masterFileFingerprint } from "../species-explorer/taxonomy-master-inputs.mjs";
import { taxonomyMasterDatabasePath } from "../species-explorer/taxonomy-master-storage.mjs";
import { buildLightroomSearchPackage, verifyLightroomSearchPackage } from "../species-explorer/lightroom-search-package.mjs";
import { activateLightroomSearchPackage, lightroomSearchDatabasePath } from "../species-explorer/lightroom-search-storage.mjs";
import { openLightroomSearchStore } from "../species-explorer/lightroom-search-store.mjs";

const script = fileURLToPath(import.meta.url), scratch = benchmarkScratchRoot;
const measuredTime = new Date("2026-09-03T12:00:00.000Z");
function ownedRun(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), scratch);
  assertScratchPath(resolved, { inspectTree: true });
  assert.match(path.basename(resolved), /^package-benchmark-[a-zA-Z0-9]+$/u);
  return resolved;
}
function directoryBytes(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory()
      ? directoryBytes(path.join(directory, entry.name)) : statSync(path.join(directory, entry.name)).size), 0);
  } catch (error) { if (error.code === "ENOENT") return 0; throw error; }
}

export function packageSemanticDigests(filename) {
  const database = new DatabaseSync(filename);
  try {
    // Validate the actual FTS index against its external content, not just row counts.
    database.exec("INSERT INTO search_fts(search_fts, rank) VALUES('integrity-check', 1)");
    const result = {};
    for (const table of ["package_info", "provider_release", "taxon", "taxon_status", "taxon_provider", "project_link", "hierarchy", "search_term", "export_input"]) {
      const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name)
        .filter((name) => name !== "search_term_id").join(", ");
      const filter = table === "package_info" ? "WHERE key != 'packageId'" : "";
      const rows = database.prepare(`SELECT ${columns} FROM ${table} ${filter}`).all().map((row) => canonicalBuildInput({ ...row })).sort();
      const hash = crypto.createHash("sha256");
      for (const row of rows) hash.update(`${row.length}:${row}`);
      result[table] = { rows: rows.length, sha256: hash.digest("hex") };
    }
    return result;
  } finally { database.close(); }
}

async function seed(root, count, scenario) {
  const taxonomyRoot = path.join(root, "taxonomy"), searchRoot = path.join(root, "base");
  for (const version of [1, 2]) {
    const now = new Date(`2026-09-0${version}T12:00:00.000Z`);
    const rows = benchmarkRows(count, version === 1 ? "unchanged" : scenario);
    const colRelease = { providerVersion: `PACKAGE-BENCH-${version}`, importedAt: now.toISOString(), recordCount: count };
    const inputs = coverMasterInputSelection({ colRelease, colRecords: rows, targetNames: [], providerSlices: [] });
    await buildTaxonomyMasterCandidate({ taxonomyRoot, colRelease, colRecords: inputs.records(),
      buildInputCoverage: inputs.coverage, now: () => now });
    if (version === 1) {
      await buildLightroomSearchPackage({ taxonomyRoot, sourceSlot: "staging", searchRoot, incremental: false, now: () => now });
      await activateLightroomSearchPackage(searchRoot, { verify: verifyLightroomSearchPackage });
    }
  }
  return { prepared: true };
}

async function sample(root, incremental, count, scenario) {
  const searchRoot = path.join(root, "sample"), baseSearchRoot = path.join(root, "base"), taxonomyRoot = path.join(root, "taxonomy");
  const phasesMs = {}, started = performance.now();
  let lastTime = started, phase = "prepare", peakRss = process.memoryUsage().rss, observedWorkBytes = 0;
  const observe = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss); };
  const timer = setInterval(observe, 25);
  let manifest;
  try {
    manifest = await buildLightroomSearchPackage({ taxonomyRoot, sourceSlot: "staging", searchRoot, baseSearchRoot,
      incremental, projectRevision: "package-benchmark", now: () => measuredTime, onProgress(event) {
        observe();
        if (event.phase !== phase) {
          const current = performance.now();
          phasesMs[phase] = (phasesMs[phase] || 0) + current - lastTime;
          phase = event.phase; lastTime = current;
        }
        observedWorkBytes = Math.max(observedWorkBytes, directoryBytes(searchRoot));
      } });
  } finally { clearInterval(timer); observe(); }
  const elapsedMs = performance.now() - started;
  phasesMs[phase] = (phasesMs[phase] || 0) + performance.now() - lastTime;
  const processPeakMiB = process.resourceUsage().maxRSS / 1024;
  const broadChange = scenario === "dense" && count >= 1000;
  assert.equal(manifest.build.mode, incremental && !broadChange ? "incremental" : "full");
  if (incremental && broadChange) assert.equal(manifest.build.reason, "many-changed-taxa");
  // Everything below runs after the timing/RSS boundary, identically for both paths.
  const verified = await verifyLightroomSearchPackage({ searchRoot, slot: "staging" });
  const digests = packageSemanticDigests(verified.databasePath);
  const store = await openLightroomSearchStore({ searchRoot, slot: "staging" });
  const searches = {};
  try {
    for (const query of ["Beispiel Art 0", "Geänderte Art 0", "Example species 1", "Testgenusa speciesa", "Changedfamily"]) {
      searches[query] = store.search(query).map((row) => ({ id: row.masterTaxonId, name: row.germanName,
        scientificName: row.acceptedScientificName })).sort((a, b) => canonicalBuildInput(a).localeCompare(canonicalBuildInput(b)));
    }
  } finally { store.close(); }
  return { elapsedMs, processPeakMiB, sampledPeakRssMiB: peakRss / 1048576, observedWorkBytes,
    databaseBytes: manifest.databaseBytes, phasesMs, build: manifest.build, digests, searches };
}

async function subprocess(root, mode, count, scenario) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", script, "--worker", root, mode, String(count), scenario],
      { env: childProcessEnvironment(process.execPath), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { error = (error + data).slice(-12000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Paketmessprozess fehlgeschlagen (${code}): ${error}`));
      try { resolve(JSON.parse(output)); } catch (cause) { reject(cause); }
    });
  });
}

export async function runPackageBenchmark({ count = 1000, scenario = "sparse", repeats = 2 } = {}) {
  benchmarkRows(count, scenario);
  assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 3, "Ein bis drei Messpaare erforderlich.");
  assertScratchPath(scratch, { allowRoot: true });
  await fs.mkdir(scratch, { recursive: true });
  const root = ownedRun(await fs.mkdtemp(path.join(scratch, "package-benchmark-")));
  try {
    await subprocess(root, "seed", count, scenario);
    const protectedFiles = [taxonomyMasterDatabasePath(path.join(root, "taxonomy"), "staging"),
      lightroomSearchDatabasePath(path.join(root, "base")),
    ].flatMap((filename) => [filename, path.join(path.dirname(filename), "manifest.json")]);
    const before = await Promise.all(protectedFiles.map(masterFileFingerprint)), samples = [];
    let expected;
    for (let trial = 1; trial <= repeats; trial += 1) {
      for (const mode of trial % 2 ? ["delta", "full"] : ["full", "delta"]) {
        const target = path.join(root, "sample");
        assert.equal(path.dirname(target), ownedRun(root));
        await fs.rm(assertScratchPath(target, { inspectTree: true }), { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
        process.stderr.write(`Paketmessung: ${count} Arten, ${scenario}, Paar ${trial}, ${mode}\n`);
        const result = await subprocess(root, mode, count, scenario);
        const { digests, searches, ...metrics } = result;
        if (expected) assert.deepEqual({ digests, searches }, expected, "Paketinhalt oder Suche weicht zwischen den Aufbauwegen ab.");
        expected = { digests, searches };
        assert.equal(digests.taxon.rows, count);
        assert.deepEqual(await Promise.all(protectedFiles.map(masterFileFingerprint)), before, "Master oder Basispaket verändert.");
        samples.push({ trial, mode, ...metrics });
      }
    }
    return { count, scenario, repeats, node: process.version, platform: process.platform, semanticEquality: true,
      searchesEqual: true, sourceAndBaseUnchanged: true, samples };
  } finally { await fs.rm(ownedRun(root), { recursive: true, force: true, maxRetries: 5, retryDelay: 80 }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    let result;
    if (mode === "--worker") {
      ownedRun(args[0]);
      assert.ok(["seed", "delta", "full"].includes(args[1]));
      result = args[1] === "seed" ? await seed(args[0], Number(args[2]), args[3]) : await sample(args[0], args[1] === "delta", Number(args[2]), args[3]);
    } else result = await runPackageBenchmark({ count: Number(mode || 1000), scenario: args[0] || "sparse", repeats: Number(args[1] || 2) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
