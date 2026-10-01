import assert from "node:assert/strict";
import { test } from "node:test";
import { runPackageBenchmark } from "./lightroom-package-benchmark.mjs";

test("Paketmessung begrenzt Größe, Szenario und Wiederholungen vor Dateierstellung", async () => {
  for (const options of [{ count: 0 }, { count: 20001 }, { scenario: "unknown" }, { repeats: 0 }, { repeats: 4 }]) {
    await assert.rejects(runPackageBenchmark(options));
  }
});

for (const scenario of ["unchanged", "sparse", "dense", "structure"]) {
  test(`Getrennte Paketmessprozesse: ${scenario}, Ergebnis, FTS und geschützte Eingänge`, async () => {
    const result = await runPackageBenchmark({ count: 20, scenario, repeats: 1 });
    assert.equal(result.semanticEquality, true);
    assert.equal(result.searchesEqual, true);
    assert.equal(result.sourceAndBaseUnchanged, true);
    assert.deepEqual(result.samples.map((row) => row.build.mode), ["incremental", "full"]);
    const writes = result.samples[0].build.changes.search_term.written;
    assert.equal(result.samples[0].build.projection, "changed-taxa");
    assert.equal(result.samples[0].build.scope.projectedTaxa,
      scenario === "unchanged" ? 0 : scenario === "dense" ? 20 : 1);
    // A changed name contributes selected-field and provider-name search entries;
    // the hierarchy scenario changes one additional hierarchy term.
    assert.equal(writes, scenario === "unchanged" ? 0 : scenario === "dense" ? 40 : scenario === "sparse" ? 2 : 1);
    for (const sample of result.samples) {
      assert.ok(sample.elapsedMs > 0);
      assert.ok(sample.processPeakMiB > 0);
      assert.ok(sample.observedWorkBytes >= sample.databaseBytes);
    }
  });
}

test("Breit geänderter Bestand verwendet den Vollaufbau statt teurer Einzelindexpflege", async () => {
  const result = await runPackageBenchmark({ count: 1000, scenario: "dense", repeats: 1 });
  assert.equal(result.samples[0].build.mode, "full");
  assert.equal(result.samples[0].build.reason, "many-changed-taxa");
  assert.equal(result.samples[0].build.scope.projectedTaxa, 1000);
  assert.equal(result.semanticEquality, true);
});
