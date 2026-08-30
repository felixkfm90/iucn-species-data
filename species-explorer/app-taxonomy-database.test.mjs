import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-taxonomy-database.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-taxonomy-database.js" }).runInContext(context);
const database = context.SpeciesExplorerTaxonomyDatabase;

test("Taxonomiedatenbank berücksichtigt Quellen, eigene Korrekturen und Suchpaketstand", () => {
  assert.equal(database.taxonomyDatabaseUpdateDecision(), "current");
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ hasWork: false }),
    "current",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ hasWork: true }),
    "refresh-and-build",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ hasCandidate: true, hasWork: false }),
    "activate",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ lightroomPackageNeedsRebuild: true }),
    "sync-lightroom",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ correctionsPending: true }),
    "build-corrections",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      correctionsPending: true,
      candidateIncludesCorrections: false,
    }),
    "build-corrections",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      correctionsPending: true,
      candidateIncludesCorrections: true,
    }),
    "activate",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      lightroomPackageNeedsRebuild: true,
    }),
    "activate",
  );
});

test("Lightroom-Korrekturanfrage verlangt identische Master-ID und wissenschaftlichen Namen", () => {
  const results = [
    { taxonId: "mtx_richtig", scientificName: "Macroglossum stellatarum" },
    { taxonId: "mtx_anders", scientificName: "Macroglossum stellatarum" },
  ];
  assert.deepEqual(database.lightroomCorrectionResult({
    masterTaxonId: "mtx_richtig",
    acceptedScientificName: "Macroglossum stellatarum",
  }, results), results[0]);
  assert.equal(database.lightroomCorrectionResult({
    masterTaxonId: "mtx_falsch",
    acceptedScientificName: "Macroglossum stellatarum",
  }, results), null);
  assert.equal(database.lightroomCorrectionResult({
    masterTaxonId: "mtx_richtig",
    acceptedScientificName: "Macroglossum andere",
  }, results), null);
});

test("Korrekturaktualisierung schließt den Dialog vor dem sichtbaren Datenbanklauf", () => {
  assert.match(source, /dialogController\.close\("update-database"\)/);
  assert.match(source, /setTimeout\(\(\) => void updateDatabase\(\), 0\)/);
});
