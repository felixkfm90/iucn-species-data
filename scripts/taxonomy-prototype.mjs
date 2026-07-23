import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  importTaxonomyPrototype,
  rollbackTaxonomyRelease,
} from "../species-explorer/taxonomy-import.mjs";
import { openTaxonomyStore } from "../species-explorer/taxonomy-store.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FIXTURE = path.join(
  PROJECT_ROOT,
  "scripts",
  "fixtures",
  "taxonomy",
  "col-xr-2026-07-17",
);
const DEFAULT_TARGET = path.join(PROJECT_ROOT, "Testlauf", "taxonomy-prototype");
const BENCHMARK_QUERIES = Object.freeze([
  { query: "A", kingdom: "Animalia" },
  { query: "Stie", kingdom: "Animalia" },
  { query: "Card", kingdom: "Animalia" },
  { query: "merula", kingdom: "Animalia" },
  { query: "Parus caeruleus", kingdom: "Animalia" },
  { query: "Aotus", kingdom: "all" },
  { query: "Asterias", kingdom: "Animalia" },
]);

function parseArguments(argumentsList) {
  const options = {
    fixtureDirectory: DEFAULT_FIXTURE,
    taxonomyRoot: DEFAULT_TARGET,
    reset: false,
    rollback: false,
    json: false,
  };
  for (const argument of argumentsList) {
    if (argument === "--reset") options.reset = true;
    else if (argument === "--rollback") options.rollback = true;
    else if (argument === "--json") options.json = true;
    else if (argument.startsWith("--fixture=")) {
      options.fixtureDirectory = path.resolve(argument.slice("--fixture=".length));
    } else if (argument.startsWith("--taxonomy-root=")) {
      options.taxonomyRoot = path.resolve(argument.slice("--taxonomy-root=".length));
    } else {
      throw new Error(`Unbekannter Parameter: ${argument}`);
    }
  }
  return options;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(3));
}

function assertSafeResetTarget(target) {
  const relative = path.relative(path.join(PROJECT_ROOT, "Testlauf"), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      "--reset darf nur ein Unterverzeichnis des lokalen Testlauf-Ordners entfernen.",
    );
  }
}

async function measureStore(taxonomyRoot) {
  const openStartedAt = performance.now();
  const store = await openTaxonomyStore({ taxonomyRoot });
  const coldOpenMs = performance.now() - openStartedAt;
  if (store.available === false) {
    throw new Error("Der importierte Taxonomie-Prototyp ist nicht aktiv.");
  }
  try {
    const durations = [];
    const samples = [];
    for (let repetition = 0; repetition < 30; repetition += 1) {
      for (const search of BENCHMARK_QUERIES) {
        const startedAt = performance.now();
        const result = store.search(search);
        durations.push(performance.now() - startedAt);
        if (repetition === 0) {
          samples.push({
            ...search,
            resultCount: result.results.length,
            ambiguous: result.ambiguous,
            firstResult: result.results[0]?.acceptedScientificName ?? null,
          });
        }
      }
    }
    return {
      status: store.status(),
      kingdoms: store.kingdoms(),
      benchmark: {
        coldOpenMs: Number(coldOpenMs.toFixed(3)),
        searches: durations.length,
        warmMedianMs: percentile(durations, 0.5),
        warmP95Ms: percentile(durations, 0.95),
        warmMaximumMs: percentile(durations, 1),
      },
      samples,
    };
  } finally {
    store.close();
  }
}

export async function runTaxonomyPrototype(options = {}) {
  const selected = {
    fixtureDirectory: path.resolve(options.fixtureDirectory ?? DEFAULT_FIXTURE),
    taxonomyRoot: path.resolve(options.taxonomyRoot ?? DEFAULT_TARGET),
    reset: options.reset === true,
    rollback: options.rollback === true,
  };
  if (selected.reset) {
    assertSafeResetTarget(selected.taxonomyRoot);
    await fs.rm(selected.taxonomyRoot, { recursive: true, force: true });
  }
  if (selected.rollback) {
    const pointer = await rollbackTaxonomyRelease(selected.taxonomyRoot);
    return {
      mode: "rollback",
      taxonomyRoot: selected.taxonomyRoot,
      pointer,
      ...(await measureStore(selected.taxonomyRoot)),
    };
  }
  const progress = [];
  const imported = await importTaxonomyPrototype({
    fixtureDirectory: selected.fixtureDirectory,
    taxonomyRoot: selected.taxonomyRoot,
    onProgress(entry) {
      progress.push(entry);
    },
  });
  return {
    mode: "import",
    fixtureDirectory: selected.fixtureDirectory,
    taxonomyRoot: selected.taxonomyRoot,
    releaseId: imported.releaseId,
    import: {
      durationMs: imported.manifest.importDurationMs,
      sourceBytes: imported.manifest.sourceBytes,
      databaseBytes: imported.manifest.databaseBytes,
      peakRssEstimateBytes: imported.manifest.peakRssEstimateBytes,
      rssIncreaseEstimateBytes: imported.manifest.rssIncreaseEstimateBytes,
      validation: imported.manifest.validation,
      counts: imported.manifest.counts,
    },
    progress,
    ...(await measureStore(selected.taxonomyRoot)),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await runTaxonomyPrototype(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  console.log(`Taxonomie-Prototyp: ${result.releaseId ?? result.pointer.activeRelease}`);
  console.log(`Ziel: ${result.taxonomyRoot}`);
  console.log(`SQLite: ${result.status.measurements.databaseBytes} Bytes`);
  console.log(`Suchindex: ${result.status.measurements.searchIndexBytes} Bytes`);
  console.log(`Kaltstart: ${result.benchmark.coldOpenMs} ms`);
  console.log(`Warme Suche p95: ${result.benchmark.warmP95Ms} ms`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
