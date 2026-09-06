import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-taxonomy-database.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
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
    "apply-corrections",
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
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ referenceNeedsMasterRebuild: true }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      candidateMatchesReference: false,
      referenceNeedsMasterRebuild: true,
    }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      candidateMatchesReference: true,
      referenceNeedsMasterRebuild: true,
    }),
    "activate",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      correctionsPending: true,
      referenceNeedsMasterRebuild: true,
    }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      lightroomPackageNeedsRebuild: true,
      referenceNeedsMasterRebuild: true,
    }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      candidateMatchesReference: false,
    }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      referenceComparisonError: true,
    }),
    "reference-error",
  );
  assert.match(
    source,
    /decision === "rebuild-master"[\s\S]*?refreshProviders: false/,
    "Ein bereits aktivierter Referenzstand muss ohne erneuten Quellen-Download in den Master übernommen werden",
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

test("Datenbankdetails unterscheiden Suchtreffer und bevorzugten deutschen Namen", () => {
  const result = database.taxonomyDatabaseDetailPresentation(
    () => ({
      germanName: "Weißstorch",
      preferredGermanName: "Weissstorch",
      germanNameChoices: ["Weißstorch", "Weissstorch", "Hausstorch"],
      displayName: "Weißstorch",
      usesEnglishFallback: false,
      nameToApply: "Weißstorch",
    }),
    {},
    {},
  );
  assert.equal(result.germanName, "Weissstorch");
  assert.equal(result.displayName, "Weissstorch");
  assert.equal(result.germanNameChoices[0], "Weissstorch");
  assert.deepEqual([...result.germanNameChoices], ["Weissstorch", "Weißstorch", "Hausstorch"]);
});

test("Leeres oder einzeichenlanges Suchfeld startet keinen Suchlauf", () => {
  assert.equal(database.shouldScheduleTaxonomyDatabaseSearch(""), false);
  assert.equal(database.shouldScheduleTaxonomyDatabaseSearch(" W "), false);
  assert.equal(database.shouldScheduleTaxonomyDatabaseSearch("We"), true);
});

test("Datenbankaktion benennt Suche und Namenskorrektur eindeutig", () => {
  assert.match(indexSource, /In Datenbank suchen und Namen korrigieren/);
  assert.doesNotMatch(indexSource, /Datenbank ansehen und korrigieren/);
});

test("Aktuell bevorzugter Name ist ohne erneute Änderung nicht speicherbar", () => {
  assert.match(source, /data-name-preference-save disabled/);
  assert.match(source, /event\.target\.value\) === cleanText\(view\.preferredGermanName\)/);
  assert.match(source, /data-name-preference-previous \$\{view\.previousGermanName \? "" : "disabled"\}/);
});

test("Korrekturaktualisierung schließt den Dialog vor dem sichtbaren Datenbanklauf", () => {
  assert.match(source, /dialogController\.close\("update-database"\)/);
  assert.match(source, /setTimeout\(\(\) => void updateDatabase\(\), 0\)/);
});
