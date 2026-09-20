import assert from "node:assert/strict";
import { test } from "node:test";
import { benchmarkRows, runBenchmark } from "./taxonomy-master-benchmark.mjs";

test("Mastermessung begrenzt Testgrößen und erzeugt unterschiedliche Änderungsszenarien", async () => {
  assert.throws(() => benchmarkRows(0));
  assert.throws(() => benchmarkRows(20001));
  assert.throws(() => benchmarkRows(10, "unknown"));
  await assert.rejects(runBenchmark({ count: 10, repeats: 0 }));
  const base = benchmarkRows(20), sparse = benchmarkRows(20, "sparse"), dense = benchmarkRows(20, "dense");
  assert.equal(new Set(base.map((row) => row.scientificName)).size, 20);
  assert.equal(sparse.filter((row, index) => row.germanNames[0].name !== base[index].germanNames[0].name).length, 1);
  assert.equal(dense.filter((row, index) => row.germanNames[0].name !== base[index].germanNames[0].name).length, 20);
  assert.notDeepEqual(benchmarkRows(20, "structure")[0].hierarchy, base[0].hierarchy);
});

test("Isolierte Mastermessung vergleicht getrennte Prozesse und vollständige Ergebnisbelege", async () => {
  const result = await runBenchmark({ count: 20, scenario: "sparse", repeats: 1 });
  assert.equal(result.semanticEquality, true);
  assert.equal(result.samples.length, 2);
  assert.equal(result.samples[0].reuse.reusedTaxa, 10);
  assert.equal(result.samples[1].reuse.reusedTaxa, 0);
  for (const sample of result.samples) {
    assert.ok(sample.elapsedMs > 0);
    assert.ok(sample.processPeakMiB > 0);
    assert.ok(sample.files["taxonomy-master.sqlite"] > 0);
  }
});
