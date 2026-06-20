import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildExplorerModel, createExplorerServer } from "./server.mjs";
import { buildPipelinePlan } from "../scripts/pipeline-selection.mjs";
import { buildCleanupPlan, runCleanup } from "../scripts/species-cleanup.mjs";
await import("./public/filter.js");

async function createEditableFixture() {
  const root = await mkdtemp(join(tmpdir(), "species-explorer-edit-"));
  const assetDir = join(root, "species-assets", "Amsel");
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(assetDir, { recursive: true });

  const inputList = [{
    german: "Amsel",
    genus: "Turdus",
    species: "merula",
    size: "ca. 23,5-29 cm",
    weight: "ca. 80-110 g",
    life_expectancy: "ca. 3 Jahre",
  }];
  const generatedList = [{
    URLSlug: "turdusmerula",
    "Wissenschaftlicher Name": "Turdus merula",
    "Deutscher Name": "Amsel",
    Gewicht: "ca. 80-110 g",
    Größe: "ca. 23,5-29 cm",
    Lebenserwartung: "ca. 3 Jahre",
    "Assessment ID": 1,
    Status: "LC",
    Trend: "Stabil",
    Kategorie: "Nicht gefährdet",
    Populationgröße: "Unbekannt",
    Generationsdauer: "4 Jahre",
    Kingdom: "ANIMALIA",
    Phylum: "CHORDATA",
    Class: "AVES",
    Order: "PASSERIFORMES",
    Family: "TURDIDAE",
    Genus: "Turdus",
    Species: "merula",
    "Letztes IUCN Update": "2024",
    "Daten abgerufen": "2026-06-19",
  }];
  const report = {
    generatedAt: "2026-06-19T00:00:00.000Z",
    counts: {
      totalSpecies: 1,
      missingSoundMp3: 0,
      missingSoundCredits: 0,
      missingMap: 0,
      missingAssessmentId: 0,
      missingStatus: 0,
      missingCategory: 0,
      missingTrend: 0,
      missingSpeciesAssets: 0,
      ncSoundLicensesAll: 0,
    },
    missing: {
      soundMp3: [],
      soundCredits: [],
      maps: [],
      speciesAssets: [],
      assessmentId: [],
      status: [],
      category: [],
      trend: [],
    },
    ncSoundLicensesAll: [],
  };

  await Promise.all([
    writeFile(join(root, "species_list.json"), `${JSON.stringify(inputList, null, 2)}\n`),
    writeFile(join(root, "speciesData.json"), `${JSON.stringify(generatedList, null, 2)}\n`),
    writeFile(join(root, "fehlende_elemente_report.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(join(root, "docs", "manual-map-overrides.md"), "# Keine manuellen Karten\n"),
    writeFile(join(assetDir, "map.jpg"), Buffer.alloc(256)),
    writeFile(join(assetDir, "sound.mp3"), Buffer.alloc(2048)),
    writeFile(join(assetDir, "spectrogram.webp"), Buffer.alloc(256)),
    writeFile(join(assetDir, "credits.json"), JSON.stringify({
      source: "Test",
      license: "https://creativecommons.org/licenses/by/4.0/",
    })),
  ]);

  return root;
}

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

  assert.equal(model.summary.speciesCount, expectedSpeciesCount);
  assert.equal(model.summary.inputCount, inputList.length);
  assert.equal(model.summary.generatedCount, generatedList.length);
  assert.equal(model.summary.missingCoreAssets, model.validation.assets.issueSpeciesCount);
  assert.equal(model.summary.ncSoundCount, 3);
  assert.equal(model.summary.manualMapCount, 7);
  assert.equal(model.summary.readOnly, false);
  assert.equal(model.summary.editingEnabled, true);
  assert.equal(model.summary.editableFile, "species_list.json");
  assert.equal(model.validation.data.inputCount, inputList.length);
  assert.equal(model.validation.data.generatedCount, generatedList.length);
  assert.equal(model.validation.data.inputOnlyCount, expectedInputOnly);
  assert.equal(model.validation.data.generatedOnlyCount, expectedGeneratedOnly);
  assert.equal(
    model.validation.assets.completeSpeciesCount + model.validation.assets.issueSpeciesCount,
    expectedSpeciesCount,
  );
  assert.equal(model.validation.report.checks.length, 9);
  assert.equal(model.validation.report.consistent, model.validation.report.issueCount === 0);
  assert.equal(model.species.filter((entry) => entry.isNcSound).length, 3);
  assert.equal(model.species.filter((entry) => entry.isManualMap).length, 7);
  assert.equal(model.species.filter((entry) => entry.assets.map.manuallyAdded).length, 7);
  assert.equal(model.species.filter((entry) => entry.assets.sound.manuallyAdded).length, 0);
  assert.equal(
    model.validation.data.issueSpeciesCount,
    model.species.filter((entry) => entry.dataIssues.length > 0).length,
  );
  assert.equal(
    model.validation.assets.issueSpeciesCount,
    model.species.filter((entry) => entry.assetIssues.length > 0).length,
  );
});

test("Lokaler Server liefert API, Assets und nur definierte Schreibzugriffe", async (context) => {
  const expectedModel = await buildExplorerModel();
  const app = await createExplorerServer({ port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const summaryResponse = await fetch(`${baseUrl}/api/summary`);
  assert.equal(summaryResponse.status, 200);
  assert.equal((await summaryResponse.json()).speciesCount, expectedModel.summary.speciesCount);

  const speciesResponse = await fetch(`${baseUrl}/api/species`);
  assert.equal(speciesResponse.status, 200);
  assert.equal((await speciesResponse.json()).length, expectedModel.species.length);

  const validationResponse = await fetch(`${baseUrl}/api/validation`);
  assert.equal(validationResponse.status, 200);
  const validation = await validationResponse.json();
  assert.equal(validation.assets.issueSpeciesCount, expectedModel.validation.assets.issueSpeciesCount);
  assert.equal(validation.report.consistent, expectedModel.validation.report.consistent);

  const assetResponse = await fetch(`${baseUrl}/assets/Amsel/map.jpg`);
  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get("content-type"), "image/jpeg");
  assert.equal(assetResponse.headers.get("accept-ranges"), "bytes");

  const rangedSoundResponse = await fetch(`${baseUrl}/assets/Amsel/sound.mp3`, {
    headers: { Range: "bytes=100-199" },
  });
  assert.equal(rangedSoundResponse.status, 206);
  assert.equal(rangedSoundResponse.headers.get("content-length"), "100");
  assert.match(rangedSoundResponse.headers.get("content-range"), /^bytes 100-199\/\d+$/);
  assert.equal((await rangedSoundResponse.arrayBuffer()).byteLength, 100);

  const invalidRangeResponse = await fetch(`${baseUrl}/assets/Amsel/sound.mp3`, {
    headers: { Range: "bytes=999999999-" },
  });
  assert.equal(invalidRangeResponse.status, 416);
  assert.match(invalidRangeResponse.headers.get("content-range"), /^bytes \*\/\d+$/);

  const writeResponse = await fetch(`${baseUrl}/api/species`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(writeResponse.status, 405);
  assert.match(await writeResponse.text(), /definierte/);
});

test("Bearbeiten braucht Vorschau, validiert und legt vor dem Speichern ein Backup an", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const backupDir = join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  for (let index = 0; index < 22; index += 1) {
    const seconds = String(index).padStart(2, "0");
    await writeFile(
      join(backupDir, `species_list-20260618T1200${seconds}Z-Test-${String(index).padStart(8, "0")}.json`),
      "{}\n",
    );
  }
  await writeFile(join(backupDir, "not-a-managed-backup.txt"), "behalten\n");
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;
  const speciesListPath = join(repoRoot, "species_list.json");
  const beforeText = await readFile(speciesListPath, "utf8");

  const invalidPreview = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { size: "", weight: "ca. 81-111 g", lifeExpectancy: "ca. 4 Jahre" },
    }),
  });
  assert.equal(invalidPreview.status, 400);
  assert.match((await invalidPreview.json()).details.join(" "), /Größe/);

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: {
        size: "ca. 24-30 cm",
        weight: "ca. 81-111 g",
        lifeExpectancy: "ca. 4 Jahre",
      },
    }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.changes.length, 3);
  assert.ok(preview.token);
  assert.equal(await readFile(speciesListPath, "utf8"), beforeText);

  const invalidSave = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "ungueltig" }),
  });
  assert.equal(invalidSave.status, 409);

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, true);
  assert.match(saved.backup, /^species-explorer\/backups\/species_list-/);
  assert.equal(saved.backupRetention.kept, 20);
  assert.equal(saved.backupRetention.removed, 3);
  assert.equal(saved.backupCleanupWarning, "");

  const afterList = JSON.parse(await readFile(speciesListPath, "utf8"));
  assert.equal(afterList[0].size, "ca. 24-30 cm");
  assert.equal(afterList[0].weight, "ca. 81-111 g");
  assert.equal(afterList[0].life_expectancy, "ca. 4 Jahre");
  assert.equal(
    await readFile(join(repoRoot, ...saved.backup.split("/")), "utf8"),
    beforeText,
  );
  const backupEntries = await readdir(backupDir);
  assert.equal(
    backupEntries.filter((name) => /^species_list-.*\.json$/.test(name)).length,
    20,
  );
  assert.ok(backupEntries.includes("not-a-managed-backup.txt"));

  const reusedSave = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(reusedSave.status, 409);

  const validation = await (await fetch(`${baseUrl}/api/validation`)).json();
  assert.equal(validation.status, "issues");
  assert.equal(validation.data.mismatchSpeciesCount, 1);
});

test("Neue Arten werden validiert, kollisionsfrei vorgeschaut und sicher angehängt", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await mkdir(join(repoRoot, "species-assets", "Kollisionsart"), { recursive: true });
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;
  const speciesListPath = join(repoRoot, "species_list.json");
  const beforeText = await readFile(speciesListPath, "utf8");
  const validValues = {
    german: "Testvogel",
    scientificName: "Testus Avis",
    size: "ca. 20 cm",
    weight: "ca. 50 g",
    lifeExpectancy: "ca. 5 Jahre",
  };

  const invalidScientificNameResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { ...validValues, scientificName: "Testus" },
    }),
  });
  assert.equal(invalidScientificNameResponse.status, 400);
  const invalidScientificName = await invalidScientificNameResponse.json();
  assert.match(invalidScientificName.details.join(" "), /genau aus Gattung und Art-Epitheton/);

  const duplicateScientificResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { ...validValues, scientificName: "Turdus Merula" },
    }),
  });
  assert.equal(duplicateScientificResponse.status, 409);
  assert.match(
    (await duplicateScientificResponse.json()).details.join(" "),
    /Wissenschaftlicher Name ist bereits vorhanden/,
  );

  const duplicateGermanResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { ...validValues, german: "Amsel" },
    }),
  });
  assert.equal(duplicateGermanResponse.status, 409);
  assert.match(
    (await duplicateGermanResponse.json()).details.join(" "),
    /Deutscher Name ist bereits vorhanden/,
  );

  const assetCollisionResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { ...validValues, german: "Kollisionsart" },
    }),
  });
  assert.equal(assetCollisionResponse.status, 409);
  assert.match(
    (await assetCollisionResponse.json()).details.join(" "),
    /Assetordner ist bereits vorhanden/,
  );

  const previewResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: validValues }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.ok(preview.token);
  assert.deepEqual(preview.entry, {
    german: "Testvogel",
    genus: "Testus",
    species: "avis",
    size: "ca. 20 cm",
    weight: "ca. 50 g",
    life_expectancy: "ca. 5 Jahre",
  });
  assert.equal(preview.derived.scientificName, "Testus avis");
  assert.equal(preview.derived.slug, "testusavis");
  assert.equal(preview.derived.safeName, "Testvogel");
  assert.equal(preview.derived.assetDirectory, "species-assets/Testvogel");
  assert.equal(await readFile(speciesListPath, "utf8"), beforeText);

  await writeFile(speciesListPath, `${beforeText}\n`, "utf8");
  const staleSaveResponse = await fetch(`${baseUrl}/api/species/new/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(staleSaveResponse.status, 409);
  assert.match((await staleSaveResponse.json()).error, /seit der Vorschau geändert/);
  await writeFile(speciesListPath, beforeText, "utf8");

  const invalidSaveResponse = await fetch(`${baseUrl}/api/species/new/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "ungueltig" }),
  });
  assert.equal(invalidSaveResponse.status, 409);

  const finalPreviewResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: validValues }),
  });
  assert.equal(finalPreviewResponse.status, 200);
  const finalPreview = await finalPreviewResponse.json();

  const saveResponse = await fetch(`${baseUrl}/api/species/new/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: finalPreview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, true);
  assert.equal(saved.species.id, "testusavis");
  assert.equal(saved.species.germanName, "Testvogel");
  assert.match(saved.backup, /^species-explorer\/backups\/species_list-/);
  assert.equal(saved.backupRetention.kept, 1);
  assert.equal(saved.backupRetention.removed, 0);

  const afterList = JSON.parse(await readFile(speciesListPath, "utf8"));
  assert.equal(afterList.length, 2);
  assert.deepEqual(afterList[1], preview.entry);
  assert.equal(
    await readFile(join(repoRoot, ...saved.backup.split("/")), "utf8"),
    beforeText,
  );

  const species = await (await fetch(`${baseUrl}/api/species`)).json();
  const newSpecies = species.find((entry) => entry.id === "testusavis");
  assert.ok(newSpecies);
  assert.deepEqual(newSpecies.dataIssues, ["Kein Eintrag in speciesData.json"]);
  assert.equal(newSpecies.assetIssues.length, 4);
  const validation = await (await fetch(`${baseUrl}/api/validation`)).json();
  assert.equal(validation.data.inputOnlyCount, 1);

  const pipelinePreviewResponse = await fetch(`${baseUrl}/api/pipeline/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "missing" }),
  });
  assert.equal(pipelinePreviewResponse.status, 200);
  const pipelinePreview = await pipelinePreviewResponse.json();
  assert.equal(pipelinePreview.targetCount, 1);
  assert.equal(pipelinePreview.targets[0].slug, "testusavis");
  assert.match(pipelinePreview.targets[0].reasons.join(" "), /speciesData\.json/);
  assert.ok(pipelinePreview.token);

  const reusedSaveResponse = await fetch(`${baseUrl}/api/species/new/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: finalPreview.token }),
  });
  assert.equal(reusedSaveResponse.status, 409);
});

test("Pipeline-Auswahl trennt fehlende Arten vom vollständigen Lauf", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const speciesList = JSON.parse(await readFile(join(repoRoot, "species_list.json"), "utf8"));
  const speciesData = JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8"));
  const sanitize = (value) => value;

  const completePlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "missing",
  });
  assert.equal(completePlan.targetCount, 0);
  assert.equal(completePlan.hasWork, false);

  speciesList.push({
    german: "Testvogel",
    genus: "Testus",
    species: "avis",
    size: "ca. 20 cm",
    weight: "ca. 50 g",
    life_expectancy: "ca. 5 Jahre",
  });
  const missingPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "missing",
  });
  assert.equal(missingPlan.targetCount, 1);
  assert.equal(missingPlan.targets[0].slug, "testusavis");

  const allPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "all",
  });
  assert.equal(allPlan.targetCount, 2);
  assert.ok(allPlan.targets.every((entry) => entry.reasons[0] === "vollständiger Lauf"));
});

test("Löschen entfernt nur den Listeneintrag; Bereinigung löscht verwaiste Daten und Assets dauerhaft", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;
  const assetDir = join(repoRoot, "species-assets", "Amsel");

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/delete/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.ok(preview.token);
  assert.equal(preview.species.germanName, "Amsel");
  assert.match(preview.effects.join(" "), /Assetordner bleibt bestehen/);

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/delete/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, true);
  assert.equal(JSON.parse(await readFile(join(repoRoot, "species_list.json"), "utf8")).length, 0);
  assert.equal(existsSync(assetDir), true);
  assert.equal(JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8")).length, 1);

  const cleanupPreviewResponse = await fetch(`${baseUrl}/api/pipeline/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "cleanup" }),
  });
  assert.equal(cleanupPreviewResponse.status, 200);
  const cleanupPreview = await cleanupPreviewResponse.json();
  assert.equal(cleanupPreview.obsoleteData.length, 1);
  assert.equal(cleanupPreview.obsoleteAssetDirectories.length, 1);
  assert.equal(cleanupPreview.obsoleteAssetDirectories[0].safeName, "Amsel");

  const plan = buildCleanupPlan(repoRoot);
  assert.equal(plan.hasWork, true);
  const cleaned = runCleanup(repoRoot);
  assert.equal(cleaned.cleaned, true);
  assert.equal(existsSync(assetDir), false);
  assert.equal(JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8")).length, 0);
  assert.equal(
    JSON.parse(await readFile(join(repoRoot, "fehlende_elemente_report.json"), "utf8")).counts.totalSpecies,
    0,
  );
});

test("Suche und Filter finden Namen, Slugs und Projektkennzeichnungen", async () => {
  const model = await buildExplorerModel();
  const { filterSpecies } = globalThis.SpeciesExplorerFilters;

  assert.deepEqual(
    filterSpecies(model.species, { query: "Amsel" }).map((entry) => entry.germanName),
    ["Amsel"],
  );
  assert.deepEqual(
    filterSpecies(model.species, { query: "Turdus merula" }).map((entry) => entry.germanName),
    ["Amsel"],
  );
  assert.deepEqual(
    filterSpecies(model.species, { query: "turdusmerula" }).map((entry) => entry.germanName),
    ["Amsel"],
  );
  assert.equal(filterSpecies(model.species, { flag: "nc" }).length, 3);
  assert.equal(filterSpecies(model.species, { flag: "manual-map" }).length, 7);
  assert.equal(
    filterSpecies(model.species, { flag: "data-issues" }).length,
    model.validation.data.issueSpeciesCount,
  );
  assert.equal(
    filterSpecies(model.species, { flag: "asset-issues" }).length,
    model.validation.assets.issueSpeciesCount,
  );
  assert.equal(
    filterSpecies(model.species, { flag: "issues" }).length,
    model.species.filter((entry) => entry.inconsistencies.length > 0).length,
  );
  assert.ok(filterSpecies(model.species, { status: "LC" }).length > 0);

  const dataIssue = structuredClone(model.species[0]);
  dataIssue.dataIssues = ["Testabweichung"];
  dataIssue.inconsistencies = ["Testabweichung"];
  const assetIssue = structuredClone(model.species[1]);
  assetIssue.assetIssues = ["Testasset fehlt"];
  assetIssue.inconsistencies = ["Testasset fehlt"];
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "data-issues" }).length, 1);
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "asset-issues" }).length, 1);
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "issues" }).length, 2);
});

test("Explorer-Oberflaeche zeigt Medien kompakt und kennzeichnet Datenquellen", async () => {
  const [appSource, cssSource, htmlSource, serverSource, updateSource, assetOverrides] = await Promise.all([
    readFile(new URL("./public/app.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app.css", import.meta.url), "utf8"),
    readFile(new URL("./public/index.html", import.meta.url), "utf8"),
    readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../update.mjs", import.meta.url), "utf8"),
    readFile(new URL("../species-assets-overrides.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.match(appSource, /class="map-image"/);
  assert.match(cssSource, /\.map-image\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(appSource, /map-zoom-trigger/);
  assert.match(appSource, /map-lightbox/);
  assert.match(appSource, /species-image-placeholder/);
  assert.match(cssSource, /\.detail-media-layout\s*\{[^}]*grid-template-columns/s);
  assert.match(appSource, /class="explorer-audio"/);
  assert.match(appSource, /class="audio-visual"/);
  assert.match(appSource, /audio-progress-marker/);
  assert.match(appSource, /requestAnimationFrame/);
  assert.match(
    appSource,
    /const seekFromPointer = async \(event\) => \{[\s\S]*audio\.currentTime = progress \* audio\.duration;[\s\S]*await audio\.play\(\)/,
  );
  assert.match(appSource, /Gefährdet/);
  assert.match(appSource, /IUCN-Daten abgerufen/);
  assert.match(appSource, /class="audio-credits"/);
  assert.match(appSource, /assetStatusText\(species\.assets\.map\)/);
  assert.match(appSource, /updateValidation/);
  assert.match(appSource, /fetch\("\/api\/validation"\)/);
  assert.match(appSource, /class="edit-dialog"/);
  assert.match(appSource, /\/preview/);
  assert.match(appSource, /\/save/);
  assert.match(appSource, /Diff-Vorschau/);
  assert.match(appSource, /function backupRetentionText\(result\)/);
  assert.match(appSource, /if \(!retention\) return ""/);
  assert.match(appSource, /function setupNewSpeciesCreator\(\)/);
  assert.match(appSource, /\/api\/species\/new\/preview/);
  assert.match(appSource, /\/api\/species\/new\/save/);
  assert.match(appSource, /function setupPipelineControl\(\)/);
  assert.match(appSource, /function setupEditingMode\(\)/);
  assert.match(appSource, /\/api\/pipeline\/preview/);
  assert.match(appSource, /\/api\/pipeline\/start/);
  assert.match(appSource, /\/api\/pipeline\/status/);
  assert.match(appSource, /\/api\/pipeline\/assets\/review/);
  assert.match(appSource, /function setupAssetReview\(\)/);
  assert.match(appSource, /Datenbank aktuell/);
  assert.match(serverSource, /Git-Commit/);
  assert.match(serverSource, /\["push"\]/);
  assert.match(serverSource, /\/api\/pipeline\/assets\/review/);
  assert.match(updateSource, /isManualAsset\(safeName, "map"\)/);
  assert.match(updateSource, /isManualAsset\(safeGerman, "sound"\)/);
  assert.equal(assetOverrides.assets.Blaukehlchen.map.manual, true);
  assert.match(appSource, /function setupSpeciesDelete\(species\)/);
  assert.match(appSource, /\/delete\/preview/);
  assert.match(appSource, /\/delete\/save/);
  assert.match(
    appSource,
    /form\.reset\(\);\s*resetPreview\(\);\s*setBusy\(false\);\s*close\(\);\s*await loadData\(\)/,
  );
  assert.match(appSource, /await state\.openPipelinePreview\?\.\("missing"\)/);
  assert.match(htmlSource, /Lesemodus\s*<\/button>/);
  assert.match(htmlSource, /id="new-species-button"/);
  assert.match(htmlSource, /id="new-species-dialog"/);
  assert.match(htmlSource, /name="german"/);
  assert.match(htmlSource, /name="scientificName"/);
  assert.match(htmlSource, /placeholder="Turdus Merula"/);
  assert.match(htmlSource, /placeholder="Amsel"/);
  assert.match(htmlSource, /placeholder="ca\. 23,5-29 cm"/);
  assert.match(htmlSource, /placeholder="ca\. 80-110 g"/);
  assert.match(htmlSource, /placeholder="ca\. 3 Jahre"/);
  assert.doesNotMatch(htmlSource, /name="genus"/);
  assert.doesNotMatch(htmlSource, /name="species"/);
  assert.match(htmlSource, /class="new-species-json"/);
  assert.match(htmlSource, /data-pipeline-mode="missing"/);
  assert.match(htmlSource, /data-pipeline-mode="all"/);
  assert.match(htmlSource, /data-pipeline-mode="cleanup"/);
  assert.match(htmlSource, /id="pipeline-dialog"/);
  assert.match(htmlSource, /id="edit-mode-toggle"/);
  assert.match(htmlSource, /id="pipeline-menu-button"/);
  assert.match(htmlSource, /Datenbank aktualisieren/);
  assert.match(htmlSource, /id="pipeline-mode-choice"/);
  assert.match(htmlSource, /Neue\/Unvollständige Arten aktualisieren/);
  assert.match(htmlSource, /id="asset-review-dialog"/);
  assert.match(htmlSource, /id="asset-review-list"/);
  assert.doesNotMatch(htmlSource, /class="pipeline-control"/);
  assert.match(htmlSource, /class="validation-dashboard"/);
  assert.match(htmlSource, /value="data-issues"/);
  assert.match(htmlSource, /value="asset-issues"/);
  assert.match(
    htmlSource,
    /value="issues">Alle Probleme<\/option>\s*<option value="asset-issues">Assetproblem<\/option>\s*<option value="data-issues">Datenabweichung<\/option>\s*<option value="manual-map">Manuelle Karte<\/option>\s*<option value="nc">NC-Sound<\/option>/s,
  );
  assert.match(cssSource, /\.validation-grid\s*\{[^}]*grid-template-columns/s);
  assert.doesNotMatch(appSource, /\["Kartenpflege"/);
  assert.doesNotMatch(appSource, /\["Daten abgerufen", species\.iucn\.fetchedAt\]/);
  assert.match(cssSource, /\.detail-media-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(cssSource, /\.detail-side-stack\s*\{[^}]*grid-template-rows:\s*minmax\(280px,\s*2fr\)\s*auto/s);
  assert.match(cssSource, /\.audio-visual\s*\{[^}]*height:\s*clamp\(64px,\s*4\.5vw,\s*84px\)/s);
  assert.match(cssSource, /\.new-species-fields\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /\.new-species-json\s*\{[^}]*white-space:\s*pre-wrap/s);
  assert.match(cssSource, /body:not\(\.edit-mode\) \.edit-only\s*\{[^}]*display:\s*none/s);
  assert.match(cssSource, /\.pipeline-mode-choice\s*\{[^}]*display:\s*grid/s);
  assert.match(cssSource, /\.header-action\s*\{[^}]*border:/s);
  assert.match(cssSource, /\.mode-toggle\s*\{[^}]*width:\s*148px/s);
  assert.match(cssSource, /\.database-status\.outdated\s*\{[^}]*background:\s*#a32929/s);
  assert.match(cssSource, /\.database-status\.current\s*\{[^}]*background:\s*#1f6b4f/s);
  assert.match(cssSource, /\.asset-review-item\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /button\.danger/);
  assert.match(appSource, /window\.scrollTo\(scrollPosition\)/);
  assert.doesNotMatch(appSource, /renderSpeciesList\(\);\s*renderDetail\(species\)/);
});
