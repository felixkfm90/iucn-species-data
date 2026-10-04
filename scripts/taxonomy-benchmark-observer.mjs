import { benchmarkScratchRoot, assertScratchPath } from "./scratch-paths.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread } from "node:worker_threads";
import { createProcessMeter } from "./taxonomy-benchmark-metrics.mjs";
import { observeBenchmarkCache } from "./taxonomy-benchmark-cache.mjs";
import { taxonomyBuildCacheUsage } from "../species-explorer/taxonomy-build-cache.mjs";

// Injected exclusively by the isolated benchmark; never imported by the app.
// Worker threads inherit --import but share the PID. Observe/write only once.
if (isMainThread) observe();
function observe() {
  const scratch = benchmarkScratchRoot;
  const root = path.resolve(process.env.FN_TAXONOMY_BENCHMARK_ROOT || "");
  assert.equal(path.dirname(root), scratch);
  assertScratchPath(root, { inspectTree: true });
  assert.match(path.basename(root), /^pipeline-benchmark-[a-zA-Z0-9]+$/u);
  assert.ok(fs.statSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink());
  const key = process.env.FN_TAXONOMY_BENCHMARK_KEY;
  assert.match(key || "", /^[a-f0-9-]{36}$/u);
  const directory = path.join(root, "metrics");
  fs.mkdirSync(directory, { recursive: true });
  assert.ok(!fs.lstatSync(directory).isSymbolicLink());
  const cache = observeBenchmarkCache(Number(process.env.FN_TAXONOMY_BENCHMARK_CACHE || 0));
  const meter = createProcessMeter(), originalSend = process.send;
  if (originalSend) process.send = function (message, ...args) {
    if (message?.type === "progress") meter.mark(String(message.event?.phase || "unknown"));
    return originalSend.call(this, message, ...args);
  };
  process.once("exit", (code) => {
    fs.writeFileSync(path.join(directory, `${key}.json`), JSON.stringify({ pid: process.pid, code,
      cache: cache.stats, buildCache: taxonomyBuildCacheUsage(), ...meter.finish() }), { flag: "wx" });
  });
}
