import { benchmarkScratchRoot, assertScratchPath } from "./scratch-paths.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { childProcessEnvironment } from "../species-explorer/child-process-environment.mjs";
import { buildTaxonomyMasterCandidate } from "../species-explorer/taxonomy-master-candidate.mjs";
import { coverMasterInputSelection, masterFileFingerprint } from "../species-explorer/taxonomy-master-inputs.mjs";
import { canonicalBuildInput } from "../species-explorer/taxonomy-build-inputs.mjs";
import { activateTaxonomyMasterCandidate } from "../species-explorer/taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterCandidateDirectory } from "../species-explorer/taxonomy-master-storage.mjs";

const script = fileURLToPath(import.meta.url);
const scratch = benchmarkScratchRoot;
const scenarios = ["unchanged", "sparse", "dense", "structure"];
const letters = (n) => { let value = ""; do { value = String.fromCharCode(97 + n % 26) + value; n = Math.floor(n / 26); } while (n); return value; };

export function benchmarkRows(count, scenario = "unchanged") {
  assert.ok(Number.isInteger(count) && count >= 10 && count <= 20000, "10 bis 20000 Testarten erforderlich.");
  assert.ok(scenarios.includes(scenario), "Unbekanntes Testszenario.");
  return Array.from({ length: count }, (_, index) => {
    const genus = `Testgenus${letters(Math.floor(index / 10))}`, scientificName = `${genus} species${letters(index % 10)}`;
    const changed = scenario === "dense" || (scenario === "sparse" && index % 1000 === 0);
    return { providerRecordId: `fixture-${index}`, scientificName, rank: "species", kingdom: "Animalia",
      hierarchy: { kingdom: "Animalia", phylum: "Chordata", class: "Aves", order: "Testorder", family: "Testfamily",
        genus, species: scientificName, ...(scenario === "structure" && index === 0 ? { family: "Changedfamily" } : {}) },
      germanNames: [{ name: `${changed ? "Geänderte" : "Beispiel"} Art ${index}` }],
      englishNames: [{ name: `Example species ${index}` }] };
  });
}

// Compare complete tables, resolving artificial IDs through their actual links.
// Runs after timing/memory measurement. No production database is opened here.
export function semanticDigests(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const sources = new Map(db.prepare("SELECT * FROM provider_taxon_assertion").all().map((row) => [row.assertion_id,
      canonicalBuildInput([row.release_id, row.provider_record_id, row.master_taxon_id])]));
    const fields = new Map(db.prepare("SELECT * FROM master_field_assertion").all().map((row) => [row.assertion_id,
      canonicalBuildInput([row.master_taxon_id, row.field_name, row.field_value, row.language, row.release_id,
        sources.get(row.provider_taxon_assertion_id) || null])]));
    const result = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      assert.match(name, /^[a-z_]+$/u);
      const rows = [];
      for (const row of db.prepare(`SELECT * FROM ${name}`).iterate()) {
        const value = { ...row };
        for (const column of ["assertion_id", "alias_id", "search_term_id"]) delete value[column];
        for (const [columns, mapping] of [[["provider_taxon_assertion_id", "source_assertion_id"], sources],
          [["current_assertion_id", "candidate_assertion_id"], fields]]) {
          for (const column of columns) if (value[column] != null) {
            assert.ok(mapping.has(value[column]), `Fehlender Beleg: ${name}.${column}`);
            value[column] = mapping.get(value[column]);
          }
        }
        rows.push(canonicalBuildInput(value));
      }
      const hash = crypto.createHash("sha256");
      for (const row of rows.sort()) hash.update(`${row.length}:${row}`);
      result[name] = { rows: rows.length, sha256: hash.digest("hex") };
    }
    return result;
  } finally { db.close(); }
}

function ownedRun(root) {
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), scratch);
  assertScratchPath(resolved, { inspectTree: true });
  assert.match(path.basename(resolved), /^master-benchmark-[a-zA-Z0-9]+$/u);
  return resolved;
}

async function worker(root, slot, count, scenario, reuse) {
  ownedRun(root);
  assert.ok(["seed", "sample"].includes(slot));
  const taxonomyRoot = path.join(root, slot), seed = slot === "seed";
  const now = new Date(seed ? "2026-09-01T12:00:00.000Z" : "2026-09-02T12:00:00.000Z");
  const rows = benchmarkRows(count, seed ? "unchanged" : scenario);
  const colRelease = { providerVersion: seed ? "BENCH-1" : "BENCH-2", importedAt: now.toISOString(), recordCount: count };
  const inputs = coverMasterInputSelection({ colRelease, colRecords: rows, targetNames: [], providerSlices: [] });
  const phases = {}, started = performance.now();
  let lastTime = started, lastPhase = "Vorbereitung", peakRss = process.memoryUsage().rss;
  const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss); };
  const interval = setInterval(sample, 25);
  let manifest;
  try {
    manifest = await buildTaxonomyMasterCandidate({ taxonomyRoot, colRelease, colRecords: inputs.records(),
      buildInputCoverage: inputs.coverage, reuseUnchanged: reuse, now: () => now, onProgress(event) {
        sample();
        if (event.phase !== lastPhase) {
          const time = performance.now(); phases[lastPhase] = (phases[lastPhase] || 0) + time - lastTime;
          lastPhase = event.phase; lastTime = time;
        }
      } });
  } finally { clearInterval(interval); sample(); }
  const elapsedMs = performance.now() - started;
  assert.equal(manifest.summary.taxa, count, "Testarten wurden unerwartet verworfen oder zusammengeführt.");
  if (!seed) {
    const changedGenera = Math.ceil(count / 1000);
    const affected = (changedGenera - 1) * 10 + Math.min(10, count - (changedGenera - 1) * 1000);
    const expectedReuse = !reuse || ["dense", "structure"].includes(scenario) ? 0
      : scenario === "unchanged" ? count : count - affected;
    assert.equal(manifest.buildInputs.reuse.reusedTaxa, expectedReuse, "Messung verwendet nicht den erwarteten Aufbauweg.");
  }
  phases[lastPhase] = (phases[lastPhase] || 0) + performance.now() - lastTime;
  // resourceUsage records process high-water RSS even across synchronous SQLite work.
  const processPeakKiB = process.resourceUsage().maxRSS;
  const files = {};
  for (const name of await fs.readdir(taxonomyMasterCandidateDirectory(taxonomyRoot))) {
    const info = await fs.stat(path.join(taxonomyMasterCandidateDirectory(taxonomyRoot), name));
    if (info.isFile()) files[name] = info.size;
  }
  const digests = semanticDigests(taxonomyMasterDatabasePath(taxonomyRoot, "staging"));
  if (seed) await activateTaxonomyMasterCandidate(taxonomyRoot, { confirmed: true, now: () => now });
  return { elapsedMs, sampledPeakRssMiB: peakRss / 1048576, processPeakMiB: processPeakKiB / 1024,
    phasesMs: phases, files, reuse: manifest.buildInputs.reuse,
    dependencyGraphReuse: manifest.buildInputs.comparison?.dependencyPlan?.graphReuse || null, digests };
}

async function subprocess(root, slot, count, scenario, reuse) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", script, "--worker", root, slot, String(count), scenario, String(reuse)],
      { env: childProcessEnvironment(process.execPath), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { error = (error + data).slice(-12000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Messprozess fehlgeschlagen (${code}): ${error}`));
      try { resolve(JSON.parse(output)); } catch (cause) { reject(cause); }
    });
  });
}

export async function runBenchmark({ count = 1000, scenario = "sparse", repeats = 2 } = {}) {
  benchmarkRows(count, scenario); // Validate before creating files or starting processes.
  assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 3);
  assertScratchPath(scratch, { allowRoot: true });
  await fs.mkdir(scratch, { recursive: true });
  const root = ownedRun(await fs.mkdtemp(path.join(scratch, "master-benchmark-")));
  try {
    const seed = await subprocess(root, "seed", count, scenario, false);
    const active = taxonomyMasterDatabasePath(path.join(root, "seed"), "active");
    const activeHash = await masterFileFingerprint(active), samples = [];
    for (let trial = 0; trial < repeats; trial += 1) {
      let expected;
      // Alternate order to limit systematic warm-cache advantage.
      for (const reuse of (trial % 2 ? [false, true] : [true, false])) {
        const sampleRoot = path.join(root, "sample");
        assert.equal(path.dirname(sampleRoot), ownedRun(root));
        await fs.rm(assertScratchPath(sampleRoot, { inspectTree: true }), { recursive: true, force: true });
        await fs.cp(path.join(root, "seed"), sampleRoot, { recursive: true });
        process.stderr.write(`Messung: ${count} Arten, ${scenario}, Paar ${trial + 1}, ${reuse ? "Wiederverwendung" : "Vollaufbau"}\n`);
        const result = await subprocess(root, "sample", count, scenario, reuse);
        if (expected) assert.deepEqual(result.digests, expected, "Wiederverwendung weicht vom Vollaufbau ab.");
        expected = result.digests;
        const { digests, ...metrics } = result;
        samples.push({ trial: trial + 1, mode: reuse ? "reuse" : "full", ...metrics });
        assert.equal(await masterFileFingerprint(active), activeHash, "Test-Ausgangsmaster wurde verändert.");
      }
    }
    return { count, scenario, repeats, node: process.version, platform: process.platform,
      semanticEquality: true, seedMs: seed.elapsedMs, samples };
  } finally { await fs.rm(ownedRun(root), { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    const result = mode === "--worker"
      ? await worker(args[0], args[1], Number(args[2]), args[3], args[4] === "true")
      : await runBenchmark({ count: Number(mode || 1000), scenario: args[0] || "sparse", repeats: Number(args[1] || 2) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
