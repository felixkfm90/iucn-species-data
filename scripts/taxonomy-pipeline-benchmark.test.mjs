import assert from "node:assert/strict";
import { test } from "node:test";
import { runPipelineBenchmark } from "./taxonomy-pipeline-benchmark.mjs";
import { prepareTaxonomyPublicationInWorker } from "../species-explorer/taxonomy-publication-process.mjs";
import { pipelineFixture } from "./taxonomy-benchmark-fixture.mjs";
import { createProcessMeter } from "./taxonomy-benchmark-metrics.mjs";
import { observeBenchmarkCache } from "./taxonomy-benchmark-cache.mjs";
import { DatabaseSync } from "node:sqlite";

test("Gesamtlauf-Messung validiert Grenzen und Paketmodus vor Dateierstellung/Prozessstart", async () => {
  for (const options of [{ count: 0 }, { count: 20001 }, { scenario: "unknown" }, { repeats: 0 }, { repeats: 4 },
    { fixture: "unknown" }, { profile: "false" }, { windowsIo: "true" }, { windowsIo: true },
    { cacheKiB: 8192 }, { cacheKiB: -1, profile: true }, { cacheKiB: "8192", profile: true }]) {
    await assert.rejects(runPipelineBenchmark(options));
  }
  for (const incremental of ["false", null, 0]) {
    await assert.rejects(prepareTaxonomyPublicationInWorker({ incremental,
      spawnProcess() { assert.fail("Ungültiger Modus darf keinen Prozess starten."); } }), /Aufbaumodus/u);
  }
});

test("Testpuffer bleibt verbindungslokal, erhält Transaktionen und Constraints und stellt Methoden wieder her", () => {
  const originalPrepare = DatabaseSync.prototype.prepare, originalExec = DatabaseSync.prototype.exec;
  assert.throws(() => observeBenchmarkCache(-1));
  assert.throws(() => observeBenchmarkCache("8192"));
  observeBenchmarkCache().restore();
  assert.equal(DatabaseSync.prototype.prepare, originalPrepare);
  const observer = observeBenchmarkCache(8192), first = new DatabaseSync(":memory:"), second = new DatabaseSync(":memory:");
  try {
    first.exec("CREATE TABLE test(id INTEGER PRIMARY KEY,value TEXT NOT NULL); BEGIN; INSERT INTO test VALUES(1,'a'); ROLLBACK;");
    assert.equal(first.prepare("SELECT count(*) n FROM test").get().n, 0);
    assert.throws(() => first.prepare("INSERT INTO test VALUES(1,NULL)").run());
    assert.equal(first.prepare("PRAGMA cache_size").get().cache_size, -8192);
    assert.equal(second.prepare("PRAGMA cache_size").get().cache_size, -8192);
    assert.equal(observer.stats.connections, 2);
  } finally { first.close(); second.close(); observer.restore(); }
  assert.equal(DatabaseSync.prototype.prepare, originalPrepare);
  assert.equal(DatabaseSync.prototype.exec, originalExec);
  const fresh = new DatabaseSync(":memory:");
  try { assert.notEqual(fresh.prepare("PRAGMA cache_size").get().cache_size, -8192); } finally { fresh.close(); }
});

test("Ausdrückliches Testpuffer-Experiment erhält Master, Paket, Namenswahl und offene Leser", async () => {
  const result = await runPipelineBenchmark({ count: 30, repeats: 1, fixture: "multi", profile: true, cacheKiB: 8192 });
  assert.equal(result.semanticEquality, true);
  assert.equal(result.namePreferencePreserved, true);
  assert.equal(result.oldReadersPreserved, true);
  for (const sample of result.samples) for (const worker of sample.resources.workers) {
    assert.equal(worker.process.cache.requestedKiB, 8192);
    assert.ok(worker.process.cache.connections > 0);
  }
});

test("Mehranbieterbestand enthält überlappende Quellen, mehrere Namen und heutige Releasezeiten", () => {
  const before = pipelineFixture(30, "unchanged", 1, "multi"), after = pipelineFixture(30, "sparse", 2, "multi");
  assert.deepEqual(before.providerSlices.map((slice) => slice.records.length), [30, 15]);
  for (const [index, slice] of after.providerSlices.entries()) {
    assert.notEqual(slice.manifest.providerVersion, before.providerSlices[index].manifest.providerVersion);
    assert.equal(slice.records[0].names[0].name, after.rows[0].germanNames[0].name);
    assert.equal(slice.records[0].names.length, 3);
    assert.deepEqual(slice.records[0].relevanceReasons, ["missing-name", "searched-taxon"]);
    assert.notEqual(slice.records[0].retrievedAt, before.providerSlices[index].records[0].retrievedAt);
  }
  assert.deepEqual(pipelineFixture(10, "sparse", 2).providerSlices, []);
  assert.throws(() => pipelineFixture(10, "sparse", 3), /Testgeneration/u);
  assert.throws(() => pipelineFixture(10, "sparse", 1, "invalid"), /Messbestand/u);
});

test("Prozessmessung trennt Phasen und speichert nur Beobachtungen ohne zeitabhängige Erfolgsschwelle", async () => {
  const meter = createProcessMeter();
  meter.mark("first"); meter.mark("first");
  await new Promise((resolve) => setImmediate(resolve));
  meter.mark("second");
  const result = meter.finish();
  assert.deepEqual(Object.keys(result.phases), ["start", "first", "second"]);
  assert.ok(result.wallMs >= 0 && result.userMs >= 0 && result.systemMs >= 0);
  assert.ok(result.processPeakRssMiB > 0 && result.sampledPeakMiB.heapUsed > 0);
  assert.ok(result.reportedGc.count >= 0 && result.reportedGc.durationMs >= 0);
  assert.throws(() => meter.finish(), /abgeschlossen/u);
});

for (const scenario of ["unchanged", "sparse", "dense", "structure"]) {
  test(`Mehranbieterprozess bleibt vollständig gleich: ${scenario}`, async () => {
    const result = await runPipelineBenchmark({ count: 30, fixture: "multi", scenario, repeats: 1, profile: scenario === "sparse" });
    assert.equal(result.semanticEquality, true);
    for (const sample of result.samples) {
      assert.equal(sample.sourceTaxa, 75);
      if (result.profile) {
        assert.deepEqual(sample.resources.workers.map((worker) => worker.role), ["master", "publication"]);
        assert.notEqual(sample.resources.workers[0].pid, sample.resources.workers[1].pid);
        for (const worker of sample.resources.workers) {
          assert.equal(worker.process.pid, worker.pid);
          assert.equal(worker.process.code, 0);
          assert.ok(worker.process.buildCache.peakConnections > 0 && worker.process.buildCache.peakConnections <= 8);
          assert.equal(worker.process.buildCache.activeConnections, 0);
          assert.equal(worker.process.cache.requestedKiB, 0); // Application rule, no experimental buffer injection.
          assert.ok(worker.process.userMs >= 0 && worker.process.systemMs >= 0 && worker.process.wallMs > 0);
          assert.ok(worker.process.processPeakRssMiB > 0);
          assert.equal(worker.io.available, false); // No policy override in the CI gate.
          assert.ok(["not-enabled", "unsupported-platform"].includes(worker.io.reason));
        }
      } else assert.equal(sample.resources, undefined);
    }
  });
}

for (const scenario of ["unchanged", "sparse", "dense", "structure"]) {
  test(`Echter integrierter Hilfsprozessvergleich: ${scenario}, Namenswahl und offene Leser`, async () => {
    const result = await runPipelineBenchmark({ count: 30, scenario, repeats: 1 });
    for (const key of ["semanticEquality", "searchesEqual", "oldReadersPreserved", "namePreferencePreserved", "baselineUnchanged"]) {
      assert.equal(result[key], true);
    }
    assert.deepEqual(result.samples.map((row) => row.packageBuild.mode), ["incremental", "full"]);
    assert.equal(result.samples[1].reusedTaxa, 0);
    for (const row of result.samples) {
      const summed = Object.values(row.stagesMs).reduce((a, b) => a + b, 0);
      assert.ok(row.totalMs >= summed);
      assert.ok(row.stagesMs.prepare > 0 && row.stagesMs.master > 0 && row.stagesMs.publish > 0);
      assert.ok(row.databaseBytes.master > 0 && row.databaseBytes.search > 0);
    }
  });
}

test("Messpaare wechseln die Reihenfolge und beginnen beim identischen freigegebenen Ausgangspaar", async () => {
  const result = await runPipelineBenchmark({ count: 10, repeats: 2 });
  assert.deepEqual(result.samples.map((row) => [row.trial, row.mode]), [[1, "reuse"], [1, "full"], [2, "full"], [2, "reuse"]]);
  assert.equal(result.semanticEquality, true);
  assert.equal(result.baselineUnchanged, true);
});

test("Breite Änderungen fallen auch im vollständigen Hilfsprozessablauf auf Paket-Vollaufbau zurück", async () => {
  const result = await runPipelineBenchmark({ count: 1000, scenario: "dense", repeats: 1 });
  assert.deepEqual(result.samples.map((row) => row.packageBuild.mode), ["full", "full"]);
  assert.equal(result.samples[0].packageBuild.reason, "many-changed-taxa");
  assert.equal(result.samples[0].reusedTaxa, 0);
  assert.equal(result.semanticEquality, true);
});
