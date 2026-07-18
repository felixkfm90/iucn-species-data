import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  buildExplorerModel,
  buildExplorerRevision,
} from "./explorer-model.mjs";
import {
  createEditableFixture,
  createTestWebp,
} from "./server-test-fixtures.mjs";

test("Explorer-Modell bildet den aktuellen Projektstand ab", async () => {
  const [model, inputList, generatedList] = await Promise.all([
    buildExplorerModel(),
    readFile(new URL("../species_list.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../speciesData.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const key = (entry, genusKey, speciesKey) =>
    `${entry[genusKey] ?? ""} ${entry[speciesKey] ?? ""}`.trim().toLocaleLowerCase("de");
  const inputKeys = new Set(inputList.map((entry) => key(entry, "genus", "species")));
  const generatedKeys = new Set(generatedList.map((entry) => key(entry, "Genus", "Species")));
  const expectedInputOnly = [...inputKeys].filter((entry) => !generatedKeys.has(entry)).length;
  const expectedGeneratedOnly = [...generatedKeys].filter((entry) => !inputKeys.has(entry)).length;
  const expectedSpeciesCount = new Set([...inputKeys, ...generatedKeys]).size;
  const expectedPortraitCount = model.species.filter((entry) => entry.assets.portrait.exists).length;
  const expectedMissingPortraitCount = expectedSpeciesCount - expectedPortraitCount;
  const expectedNcSoundCount = model.species.filter((entry) => entry.isNcSound).length;
  const expectedManualMapCount = model.species.filter((entry) => entry.isManualMap).length;

  assert.equal(model.summary.speciesCount, expectedSpeciesCount);
  assert.equal(model.summary.inputCount, inputList.length);
  assert.equal(model.summary.generatedCount, generatedList.length);
  assert.equal(model.summary.missingCoreAssets, model.validation.assets.issueSpeciesCount);
  assert.equal(model.summary.missingPortraitCount, expectedMissingPortraitCount);
  assert.equal(model.validation.assets.available.portraits, expectedPortraitCount);
  assert.equal(
    model.validation.assets.completeSpeciesCount + model.validation.assets.issueSpeciesCount,
    expectedSpeciesCount,
  );
  assert.ok(model.validation.assets.issueSpeciesCount >= expectedMissingPortraitCount);
  assert.equal(model.summary.ncSoundCount, expectedNcSoundCount);
  assert.equal(model.summary.manualMapCount, expectedManualMapCount);
  assert.equal(model.summary.readOnly, false);
  assert.equal(model.summary.editingEnabled, true);
  assert.equal(model.summary.editableFile, "species_list.json");
  assert.equal(model.validation.data.inputCount, inputList.length);
  assert.equal(model.validation.data.generatedCount, generatedList.length);
  assert.equal(model.validation.data.inputOnlyCount, expectedInputOnly);
  assert.equal(model.validation.data.generatedOnlyCount, expectedGeneratedOnly);
  assert.equal(model.validation.report.checks.length, 9);
  assert.equal(model.validation.report.consistent, model.validation.report.issueCount === 0);
  assert.equal(model.species.filter((entry) => entry.isNcSound).length, expectedNcSoundCount);
  assert.equal(model.species.filter((entry) => entry.isManualMap).length, expectedManualMapCount);
  assert.equal(model.species.filter((entry) => entry.assets.map.manuallyAdded).length, expectedManualMapCount);
  assert.equal(model.species.filter((entry) => entry.assets.sound.manuallyAdded).length, 0);
  assert.ok(model.species.every((entry) => (
    [
      entry.taxonomy.kingdom,
      entry.taxonomy.phylum,
      entry.taxonomy.subphylum,
      entry.taxonomy.className,
      entry.taxonomy.order,
      entry.taxonomy.family,
    ].every((value) => value === "Unbekannt" || !/^[A-ZÄÖÜ\s-]+$/.test(value))
  )));
  assert.equal(
    model.species.filter((entry) => entry.assetIssues.includes("Artporträt fehlt")).length,
    expectedMissingPortraitCount,
  );
  assert.equal(
    model.validation.data.issueSpeciesCount,
    model.species.filter((entry) => entry.dataIssues.length > 0).length,
  );
  assert.equal(
    model.validation.assets.issueSpeciesCount,
    model.species.filter((entry) => entry.assetIssues.length > 0).length,
  );
});

test("Bekannt fehlender Sound ist Pflegehinweis statt Assetproblem", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const assetDir = join(repoRoot, "species-assets", "Amsel");
  await Promise.all([
    rm(join(assetDir, "sound.mp3"), { force: true }),
    rm(join(assetDir, "credits.json"), { force: true }),
    rm(join(assetDir, "spectrogram.webp"), { force: true }),
  ]);
  const report = JSON.parse(await readFile(join(repoRoot, "fehlende_elemente_report.json"), "utf8"));
  report.counts.missingSoundMp3 = 1;
  report.counts.missingSpeciesAssets = 1;
  report.missing.soundMp3 = ["Amsel"];
  report.missing.speciesAssets = [{
    german: "Amsel",
    safeName: "Amsel",
    missing: ["sound.mp3", "credits.json", "spectrogram.webp"],
  }];
  await writeFile(join(repoRoot, "fehlende_elemente_report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const model = await buildExplorerModel(repoRoot);
  const species = model.species[0];
  assert.equal(species.soundMissingKnown, true);
  assert.equal(species.soundCareHint, true);
  assert.match(species.careHints.join(" "), /keine verwendbare Quelle/);
  assert.doesNotMatch(species.assetIssues.join(" "), /Sound fehlt|Credits fehlen|Spektrogramm fehlt/);
  assert.equal(model.validation.special.soundCareCount, 1);
  assert.equal(model.validation.special.missingSoundKnownCount, 1);
  assert.equal(
    model.validation.report.checks.find((entry) => entry.key === "soundMp3").ok,
    true,
  );
});

test("Explorer-Revision reagiert auf Änderungen an Art-Assets", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));

  const before = await buildExplorerRevision(repoRoot);
  await writeFile(
    join(repoRoot, "species-assets", "Amsel", "portrait.webp"),
    createTestWebp(17),
  );
  const after = await buildExplorerRevision(repoRoot);

  assert.notEqual(after, before);
});
