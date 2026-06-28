import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildExplorerModel,
  createExplorerServer,
  formatSpectrogramPipelineLog,
  inspectJpeg,
  inspectMp3,
  inspectPng,
  inspectWebp,
  isExplorerAlreadyReachable,
  synchronizeManualMapDocumentation,
} from "./server.mjs";
import { buildPipelinePlan } from "../scripts/pipeline-selection.mjs";
import { buildCleanupPlan, runCleanup } from "../scripts/species-cleanup.mjs";
import {
  PORTRAIT_STANDARD,
  buildPortraitPrompt,
  portraitPromptSha256,
} from "../scripts/portrait-generator.mjs";
import {
  getExplorerPipelineStatus,
  isPipelineBlockingShutdown,
  startManagedExplorerServer,
  stopManagedExplorerServer,
} from "./desktop/server-lifecycle.mjs";
await import("./public/filter.js");

function createTestJpeg(width = 3, height = 2) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x0e,
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function createTestMp3(seed = 1) {
  return Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0xff, 0xfb, 0x90, 0x64]),
    Buffer.alloc(512, seed),
  ]);
}

function createTestWebp(seed = 1) {
  return Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x08, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP", "ascii"),
    Buffer.alloc(8, seed),
  ]);
}

function createTestPng(width = 1120, height = 1400) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 2;
  return buffer;
}

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
  const expectedPortraitCount = model.species.filter((entry) => entry.assets.portrait.exists).length;
  const expectedMissingPortraitCount = expectedSpeciesCount - expectedPortraitCount;

  assert.equal(model.summary.speciesCount, expectedSpeciesCount);
  assert.equal(model.summary.inputCount, inputList.length);
  assert.equal(model.summary.generatedCount, generatedList.length);
  assert.equal(model.summary.missingCoreAssets, model.validation.assets.issueSpeciesCount);
  assert.equal(model.summary.missingPortraitCount, expectedMissingPortraitCount);
  assert.equal(model.validation.assets.available.portraits, expectedPortraitCount);
  assert.equal(model.validation.assets.completeSpeciesCount, expectedPortraitCount);
  assert.equal(model.validation.assets.issueSpeciesCount, expectedMissingPortraitCount);
  assert.equal(model.summary.ncSoundCount, 3);
  assert.equal(model.summary.manualMapCount, 4);
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
  assert.equal(model.species.filter((entry) => entry.isManualMap).length, 4);
  assert.equal(model.species.filter((entry) => entry.assets.map.manuallyAdded).length, 4);
  assert.equal(model.species.filter((entry) => entry.assets.sound.manuallyAdded).length, 0);
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

test("Spektrogramm-Prozessausgabe wird für die App lesbar zusammengefasst", () => {
  const output = formatSpectrogramPipelineLog(JSON.stringify({
    results: [
      {
        safeName: "Amsel",
        status: "skip",
        inputBytes: 2048,
        outputBytes: 512,
      },
      {
        safeName: "Grüner Leguan",
        status: "missing-mp3",
      },
      {
        safeName: "Bachstelze",
        status: "generated",
        inputBytes: 4096,
        outputBytes: 700,
      },
    ],
    hashRegistry: { updated: 2, changed: true },
  }));
  assert.match(output, /Amsel\n  Sound: vorhanden\n  Spektrogramm: vorhanden/);
  assert.match(output, /Grüner Leguan\n  Sound: fehlt\n  Spektrogramm: übersprungen/);
  assert.match(output, /Bachstelze\n  Sound: vorhanden\n  Spektrogramm: wurde erstellt/);
  assert.match(output, /Zusammenfassung: 1 erstellt, 1 vorhanden, 1 ohne Sound, 0 Fehler/);
  assert.doesNotMatch(output, /"safeName"/);
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

test("Server erkennt bereits laufenden Explorer auf belegtem Port", async (context) => {
  const app = await createExplorerServer({ port: 0 });
  const address = await app.listen();
  context.after(() => app.close());

  assert.equal(await isExplorerAlreadyReachable(app.host, address.port), true);

  const duplicate = await createExplorerServer({ port: address.port });
  await assert.rejects(() => duplicate.listen(), { code: "EADDRINUSE" });
});

test("Desktop-Lifecycle startet und stoppt den Explorer-Server verwaltet", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const managed = await startManagedExplorerServer({
    repoRoot,
    preferredPort: 0,
    healthTimeoutMs: 5000,
  });
  context.after(() => stopManagedExplorerServer(managed));

  assert.match(managed.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(managed.health.summary.speciesCount, 1);
  const status = await getExplorerPipelineStatus(managed.baseUrl);
  assert.equal(status.status, "idle");
  assert.equal(isPipelineBlockingShutdown(status), false);
  assert.equal(isPipelineBlockingShutdown({ status: "running" }), true);
  assert.equal(isPipelineBlockingShutdown({ status: "awaiting-review" }), true);

  await stopManagedExplorerServer(managed);
  managed.server = null;
});

test("Explorer erkennt externe Dateiänderungen ohne manuellen Reload", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const initialRevision = await (await fetch(`${baseUrl}/api/revision`)).json();
  assert.ok(initialRevision.revision);
  assert.equal((await (await fetch(`${baseUrl}/api/summary`)).json()).speciesCount, 1);

  const speciesListPath = join(repoRoot, "species_list.json");
  const speciesList = JSON.parse(await readFile(speciesListPath, "utf8"));
  speciesList.push({
    german: "Testvogel",
    genus: "Testus",
    species: "avis",
    size: "ca. 20 cm",
    weight: "ca. 50 g",
    life_expectancy: "ca. 5 Jahre",
  });
  await writeFile(speciesListPath, `${JSON.stringify(speciesList, null, 2)}\n`, "utf8");

  const changedRevision = await (await fetch(`${baseUrl}/api/revision`)).json();
  assert.equal(changedRevision.changed, true);
  assert.notEqual(changedRevision.revision, initialRevision.revision);
  const summary = await (await fetch(`${baseUrl}/api/summary`)).json();
  assert.equal(summary.speciesCount, 2);
  assert.equal(summary.inputCount, 2);
  assert.equal(summary.generatedCount, 1);
  const species = await (await fetch(`${baseUrl}/api/species`)).json();
  assert.ok(species.some((entry) => entry.id === "testusavis"));
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

  const portraitPromptResponse = await fetch(`${baseUrl}/api/species/new/portrait-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: validValues,
      additionalInstructions: "vollständiger Schwanz sichtbar",
    }),
  });
  assert.equal(portraitPromptResponse.status, 200);
  const portraitPrompt = await portraitPromptResponse.json();
  assert.equal(portraitPrompt.derived.scientificName, "Testus avis");
  assert.equal(portraitPrompt.fileName, "Testvogel.png");
  assert.match(portraitPrompt.prompt, /German common name: Testvogel/);
  assert.match(portraitPrompt.prompt, /Scientific name: Testus avis/);
  assert.match(portraitPrompt.prompt, /vollständiger Schwanz sichtbar/);
  assert.match(portraitPrompt.prompt, /Do not create a collage/);

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
  assert.equal(newSpecies.assetIssues.length, 5);
  assert.ok(newSpecies.assetIssues.includes("Artporträt fehlt"));
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

  await writeFile(
    join(repoRoot, "species-assets-overrides.json"),
    `${JSON.stringify({
      version: 1,
      assets: { Amsel: { map: { manual: true } } },
    }, null, 2)}\n`,
  );
  const manualMapPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "manual-maps",
  });
  assert.equal(manualMapPlan.targetCount, 1);
  assert.equal(manualMapPlan.targets[0].safeName, "Amsel");

  await writeFile(
    join(repoRoot, "species-assets", "Amsel", "credits.json"),
    JSON.stringify({ license: "https://creativecommons.org/licenses/by-nc/4.0/" }),
  );
  const ncSoundPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "nc-sounds",
  });
  assert.equal(ncSoundPlan.targetCount, 1);
  assert.equal(ncSoundPlan.targets[0].safeName, "Amsel");

  await rm(join(repoRoot, "species-assets", "Amsel", "sound.mp3"), { force: true });
  const missingSoundPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "nc-sounds",
  });
  assert.equal(missingSoundPlan.targetCount, 1);
  assert.equal(missingSoundPlan.targets[0].safeName, "Amsel");
  assert.match(missingSoundPlan.targets[0].reasons.join(" "), /Sound fehlt/);
});

test("Automatisch übernommene Karten verlassen die manuelle Pflege", async (context) => {
  const markdown = [
    "# Manual Map Overrides",
    "",
    "Stand: 2026-06-17",
    "",
    "Aktuell sind 2 Karten als manuell gepflegt dokumentiert.",
    "",
    "| Art | SafeName | Datei |",
    "|---|---|---|",
    "| Amsel | Amsel | `species-assets/Amsel/map.jpg` |",
    "| Drossel | Drossel | `species-assets/Drossel/map.jpg` |",
    "",
  ].join("\n");
  const registry = {
    version: 1,
    assets: {
      Amsel: { map: { manual: false } },
      Drossel: { map: { manual: true } },
    },
  };
  const synchronized = synchronizeManualMapDocumentation(markdown, registry, "2026-06-20");
  assert.doesNotMatch(synchronized, /species-assets\/Amsel\/map\.jpg/);
  assert.match(synchronized, /species-assets\/Drossel\/map\.jpg/);
  assert.match(synchronized, /Stand: 2026-06-20/);
  assert.match(synchronized, /Aktuell sind 1 Karte als manuell gepflegt dokumentiert\./);

  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(repoRoot, "docs", "manual-map-overrides.md"), [
      "# Manual Map Overrides",
      "",
      "| Art | SafeName | Datei |",
      "|---|---|---|",
      "| Amsel | Amsel | `species-assets/Amsel/map.jpg` |",
      "",
    ].join("\n")),
    writeFile(
      join(repoRoot, "species-assets-overrides.json"),
      `${JSON.stringify({ version: 1, assets: { Amsel: { map: { manual: false } } } }, null, 2)}\n`,
    ),
  ]);
  const model = await buildExplorerModel(repoRoot);
  assert.equal(model.summary.manualMapCount, 0);
  assert.equal(model.species[0].isManualMap, false);
  assert.equal(model.species[0].assets.map.manuallyAdded, false);
});

test("Kartenimport prüft JPEG, erstellt Vorschau, Backup und manuellen Schutz", async (context) => {
  const jpeg = createTestJpeg(640, 480);
  assert.deepEqual(inspectJpeg(jpeg), { width: 640, height: 480 });
  assert.throws(() => inspectJpeg(Buffer.from("kein jpeg")), /JPEG/);

  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const app = await createExplorerServer({
    repoRoot,
    port: 0,
    publishAssetChanges: false,
  });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const invalidResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalName: "karte.png",
      imageBase64: Buffer.from("kein bild").toString("base64"),
      reason: "Testkarte",
      source: "keine-url",
    }),
  });
  assert.equal(invalidResponse.status, 400);

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalName: "amsel-neu.jpg",
      imageBase64: jpeg.toString("base64"),
      reason: "Manuell geprüfte Testkarte",
      source: "https://example.com/amsel-map",
    }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.ok(preview.token);
  assert.deepEqual(preview.newMap.dimensions, { width: 640, height: 480 });
  assert.equal(preview.newMap.bytes, jpeg.length);
  assert.equal(preview.currentMap.exists, true);

  const previewFile = await fetch(`${baseUrl}${preview.newMap.url}`);
  assert.equal(previewFile.status, 200);
  assert.equal(previewFile.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await previewFile.arrayBuffer()), jpeg);

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.saved, true);
  assert.equal(saved.gitPublished, false);
  assert.equal(saved.gitSkipped, true);
  assert.match(saved.backup, /^species-explorer\/asset-backups\/Amsel\/map\/map-/);
  assert.deepEqual(await readFile(join(repoRoot, "species-assets", "Amsel", "map.jpg")), jpeg);
  assert.equal(existsSync(join(repoRoot, ...saved.backup.split("/"))), true);

  const registry = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registry.assets.Amsel.map.manual, true);
  assert.equal(registry.assets.Amsel.map.protectFromPipeline, true);
  assert.equal(registry.assets.Amsel.map.source, "https://example.com/amsel-map");
  assert.equal(registry.assets.Amsel.map.reason, "Manuell geprüfte Testkarte");
  assert.match(registry.assets.Amsel.map.sha256, /^[0-9a-f]{64}$/);
  const documentation = await readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8");
  assert.match(documentation, /species-assets\/Amsel\/map\.jpg/);
  assert.match(documentation, /https:\/\/example\.com\/amsel-map/);

  const reusedResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(reusedResponse.status, 409);

  for (const width of [641, 642, 643]) {
    const replacement = createTestJpeg(width, 480);
    const nextPreviewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: `amsel-${width}.jpg`,
        imageBase64: replacement.toString("base64"),
        reason: `Testkarte ${width}`,
        source: `https://example.com/amsel-map-${width}`,
      }),
    });
    assert.equal(nextPreviewResponse.status, 200);
    const nextPreview = await nextPreviewResponse.json();
    const nextSaveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: nextPreview.token }),
    });
    assert.equal(nextSaveResponse.status, 200);
  }
  const backupFiles = await readdir(join(repoRoot, "species-explorer", "asset-backups", "Amsel", "map"));
  assert.equal(backupFiles.length, 3);
  assert.deepEqual(
    await readFile(join(repoRoot, "species-assets", "Amsel", "map.jpg")),
    createTestJpeg(643, 480),
  );
});

test("Soundimport ändert keine Produktdatei, wenn die Spektrogramm-Erzeugung fehlschlägt", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const assetDirectory = join(repoRoot, "species-assets", "Amsel");
  const before = {
    sound: await readFile(join(assetDirectory, "sound.mp3")),
    credits: await readFile(join(assetDirectory, "credits.json")),
    spectrogram: await readFile(join(assetDirectory, "spectrogram.webp")),
  };
  const app = await createExplorerServer({
    repoRoot,
    port: 0,
    publishAssetChanges: false,
    spectrogramRenderer: async () => {
      throw new Error("Test-FFmpeg nicht verfügbar");
    },
  });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;
  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalName: "amsel-neu.mp3",
      audioBase64: createTestMp3(4).toString("base64"),
      reason: "Manuell geprüfter Testsound",
      credits: {
        recordist: "Testaufnahme",
        source: "Testarchiv",
        url: "https://example.com/amsel-sound",
        license: "https://creativecommons.org/licenses/by/4.0/",
      },
    }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 500);
  assert.match((await saveResponse.json()).error, /Sound wurde nicht gespeichert/);
  assert.deepEqual(await readFile(join(assetDirectory, "sound.mp3")), before.sound);
  assert.deepEqual(await readFile(join(assetDirectory, "credits.json")), before.credits);
  assert.deepEqual(await readFile(join(assetDirectory, "spectrogram.webp")), before.spectrogram);
  assert.equal(existsSync(join(repoRoot, "species-assets-overrides.json")), false);
});

test("Soundimport ersetzt MP3 und Credits gemeinsam und erzeugt ein hashverknüpftes Spektrogramm", async (context) => {
  const mp3 = createTestMp3(7);
  const webp = createTestWebp(9);
  assert.deepEqual(inspectMp3(mp3), { signature: "ID3 + MPEG frame", frameOffset: 10 });
  assert.deepEqual(inspectWebp(webp), { signature: "RIFF/WEBP" });
  assert.throws(() => inspectWebp(Buffer.from("kein webp")), /WebP/);
  assert.throws(
    () => inspectMp3(Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])),
    /keinen Audiostream/,
  );
  assert.throws(() => inspectMp3(Buffer.from("kein mp3")), /MPEG-Audioframe/);

  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const app = await createExplorerServer({
    repoRoot,
    port: 0,
    publishAssetChanges: false,
    spectrogramRenderer: async ({ outputPath }) => {
      await writeFile(outputPath, webp);
      return { outputBytes: webp.length };
    },
  });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const invalidResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalName: "sound.wav",
      audioBase64: Buffer.from("kein sound").toString("base64"),
      reason: "Test",
      credits: {},
    }),
  });
  assert.equal(invalidResponse.status, 400);

  const credits = {
    recordist: "Testaufnahme",
    source: "Testarchiv",
    url: "https://example.com/amsel-sound",
    license: "https://creativecommons.org/licenses/by-nc/4.0/",
    country: "Deutschland",
    location: "Testort",
    quality: "A",
    notes: "Manuell geprüfter Testsound",
  };
  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalName: "amsel-neu.mp3",
      audioBase64: mp3.toString("base64"),
      reason: "Manuell geprüfter Testsound",
      credits,
    }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.ok(preview.token);
  assert.equal(preview.newSound.bytes, mp3.length);
  assert.equal(preview.newSound.isNc, true);
  assert.equal(preview.newSound.credits.scientific_name, "Turdus merula");
  assert.equal(preview.newSound.credits.german_name, "Amsel");

  const previewFile = await fetch(`${baseUrl}${preview.newSound.url}`);
  assert.equal(previewFile.status, 200);
  assert.equal(previewFile.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(Buffer.from(await previewFile.arrayBuffer()), mp3);

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.saved, true);
  assert.equal(saved.gitPublished, false);
  assert.equal(saved.gitSkipped, true);
  assert.equal(saved.spectrogramGenerated, true);
  assert.equal(saved.spectrogramBytes, webp.length);
  assert.equal(saved.spectrogramStale, false);
  assert.equal(saved.isNc, true);
  assert.match(saved.backup, /^species-explorer\/asset-backups\/Amsel\/sound\/sound-/);
  assert.deepEqual(await readFile(join(repoRoot, "species-assets", "Amsel", "sound.mp3")), mp3);
  assert.deepEqual(
    await readFile(join(repoRoot, "species-assets", "Amsel", "spectrogram.webp")),
    webp,
  );

  const storedCredits = JSON.parse(
    await readFile(join(repoRoot, "species-assets", "Amsel", "credits.json"), "utf8"),
  );
  assert.equal(storedCredits.recordist, "Testaufnahme");
  assert.equal(storedCredits.scientific_name, "Turdus merula");
  assert.equal(storedCredits.german_name, "Amsel");
  assert.equal(storedCredits.license, credits.license);

  const registry = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registry.spectrogramGenerator.version, 1);
  assert.equal(registry.spectrogramGenerator.width, 1000);
  assert.equal(registry.assets.Amsel.sound.manual, true);
  assert.equal(registry.assets.Amsel.sound.protectFromPipeline, true);
  assert.equal(registry.assets.Amsel.sound.isNc, true);
  assert.match(registry.assets.Amsel.sound.sha256, /^[0-9a-f]{64}$/);
  assert.equal(registry.assets.Amsel.spectrogram.stale, false);
  assert.equal(registry.assets.Amsel.spectrogram.soundSha256, registry.assets.Amsel.sound.sha256);
  assert.match(registry.assets.Amsel.spectrogram.spectrogramSha256, /^[0-9a-f]{64}$/);
  assert.equal(registry.assets.Amsel.spectrogram.spectrogramSha256, saved.spectrogramSha256);

  const backupDirectory = join(repoRoot, ...saved.backup.split("/"));
  assert.equal(existsSync(join(backupDirectory, "sound.mp3")), true);
  assert.equal(existsSync(join(backupDirectory, "credits.json")), true);
  assert.equal(existsSync(join(backupDirectory, "spectrogram.webp")), true);

  const model = await buildExplorerModel(repoRoot);
  assert.equal(model.species[0].assets.sound.manuallyAdded, true);
  assert.equal(model.species[0].assets.spectrogram.stale, false);
  assert.equal(model.species[0].assets.spectrogram.hashTracked, true);
  assert.equal(model.species[0].assets.spectrogram.hashVerified, true);
  assert.doesNotMatch(model.species[0].assetIssues.join(" "), /Spektrogramm/);

  await writeFile(join(repoRoot, "species-assets", "Amsel", "sound.mp3"), createTestMp3(8));
  const staleModel = await buildExplorerModel(repoRoot);
  assert.equal(staleModel.species[0].assets.spectrogram.stale, true);
  assert.equal(staleModel.species[0].assets.spectrogram.hashVerified, false);
  assert.match(staleModel.species[0].assetIssues.join(" "), /Spektrogramm veraltet/);

  const reusedResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(reusedResponse.status, 409);
});

test("Artporträt-Prompt und manueller Bildimport funktionieren ohne kostenpflichtige API", async (context) => {
  const prompt = buildPortraitPrompt({
    germanName: "Amsel",
    scientificName: "Turdus merula",
    additionalInstructions: "Adultes Männchen mit gelbem Schnabel.",
  });
  assert.match(prompt, /Turdus merula/);
  assert.match(prompt, /Traditional natural-history plate/);
  assert.match(prompt, /Adultes Männchen mit gelbem Schnabel/);
  assert.match(prompt, /HARD OUTPUT CONSTRAINTS — ONE IMAGE ONLY/);
  assert.match(prompt, /Do not create a collage, image grid, contact sheet/);
  assert.match(prompt, /After creating this one image, stop/);
  assert.match(portraitPromptSha256(prompt), /^[0-9a-f]{64}$/);
  assert.equal(PORTRAIT_STANDARD.promptVersion, "1.1.0");
  assert.equal(PORTRAIT_STANDARD.size, "1280x1600");
  assert.equal(PORTRAIT_STANDARD.outputFormat, "webp");
  const uploadedPng = createTestPng();
  assert.deepEqual(inspectPng(uploadedPng), { width: 1120, height: 1400 });

  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const renderedWebp = createTestWebp(12);
  let renderCalls = 0;
  const app = await createExplorerServer({
    repoRoot,
    port: 0,
    publishAssetChanges: false,
    portraitRenderer: async ({ outputPath }) => {
      renderCalls += 1;
      await writeFile(outputPath, renderedWebp);
      return { outputBytes: renderedWebp.length, width: 1280, height: 1600 };
    },
  });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const promptResponse = await fetch(
    `${baseUrl}/api/species/turdusmerula/assets/portrait/prompt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        additionalInstructions: "Adultes Männchen mit gelbem Schnabel.",
      }),
    },
  );
  assert.equal(promptResponse.status, 200);
  const promptResult = await promptResponse.json();
  assert.equal(promptResult.fileName, "Amsel.png");
  assert.match(promptResult.prompt, /Adultes Männchen/);

  const missingResponse = await fetch(`${baseUrl}/api/portraits/missing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(missingResponse.status, 405);
  const invalidRatioResponse = await fetch(
    `${baseUrl}/api/species/turdusmerula/assets/portrait/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: "Amsel.png",
        imageBase64: createTestPng(1200, 1200).toString("base64"),
        additionalInstructions: "",
      }),
    },
  );
  assert.equal(invalidRatioResponse.status, 400);

  const previewResponse = await fetch(
    `${baseUrl}/api/species/turdusmerula/assets/portrait/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: "Amsel.png",
        imageBase64: uploadedPng.toString("base64"),
        additionalInstructions: "Adultes Männchen mit gelbem Schnabel.",
      }),
    },
  );
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(renderCalls, 1);
  assert.ok(preview.token);
  assert.equal(preview.currentPortrait.exists, false);
  assert.equal(preview.newPortrait.size, "1280x1600");
  assert.equal(preview.newPortrait.originalName, "Amsel.png");
  assert.deepEqual(preview.newPortrait.originalDimensions, { width: 1120, height: 1400 });
  assert.match(preview.newPortrait.prompt, /Adultes Männchen/);

  const previewFile = await fetch(`${baseUrl}${preview.newPortrait.url}`);
  assert.equal(previewFile.status, 200);
  assert.equal(previewFile.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await previewFile.arrayBuffer()), renderedWebp);

  const saveResponse = await fetch(
    `${baseUrl}/api/species/turdusmerula/assets/portrait/save`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: preview.token }),
    },
  );
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.saved, true);
  assert.equal(saved.gitPublished, false);
  assert.equal(saved.gitSkipped, true);
  assert.equal(saved.backup, "");
  assert.deepEqual(
    await readFile(join(repoRoot, "species-assets", "Amsel", "portrait.webp")),
    renderedWebp,
  );

  const metadata = JSON.parse(
    await readFile(join(repoRoot, "species-assets", "Amsel", "portrait.json"), "utf8"),
  );
  assert.equal(metadata.german_name, "Amsel");
  assert.equal(metadata.scientific_name, "Turdus merula");
  assert.equal(metadata.source, "ChatGPT");
  assert.match(metadata.generation_method, /manuell/i);
  assert.equal(metadata.prompt_version, "1.1.0");
  assert.equal(metadata.original_file_name, "Amsel.png");
  assert.equal(metadata.original_width, 1120);
  assert.equal(metadata.product_width, 1280);
  assert.equal(metadata.additional_instructions, "Adultes Männchen mit gelbem Schnabel.");
  assert.match(metadata.prompt_sha256, /^[0-9a-f]{64}$/);
  assert.match(metadata.sha256, /^[0-9a-f]{64}$/);

  const registry = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registry.assets.Amsel.portrait.managedBy, "species-explorer");
  assert.equal(registry.assets.Amsel.portrait.source, "ChatGPT");
  assert.match(registry.assets.Amsel.portrait.sha256, /^[0-9a-f]{64}$/);
  assert.match(registry.assets.Amsel.portrait.metadataSha256, /^[0-9a-f]{64}$/);

  const model = await buildExplorerModel(repoRoot);
  assert.equal(model.species[0].assets.portrait.exists, true);
  assert.equal(model.species[0].assets.portrait.metadataExists, true);
  assert.equal(model.species[0].assets.portrait.hashTracked, true);
  assert.equal(model.species[0].assets.portrait.hashVerified, true);
  assert.equal(model.species[0].missingPortrait, false);
  assert.doesNotMatch(model.species[0].assetIssues.join(" "), /Artporträt/);

  const reusedResponse = await fetch(
    `${baseUrl}/api/species/turdusmerula/assets/portrait/save`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: preview.token }),
    },
  );
  assert.equal(reusedResponse.status, 409);
});

test("Löschen kann Assets sofort entfernen; Bereinigung löscht verwaiste Daten und Assets dauerhaft", async (context) => {
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
  assert.match(preview.effects.join(" "), /Ohne Zusatzoption bleiben generierte Daten und Assets/);

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
  assert.equal(plan.mode, "cleanup");
  assert.equal(plan.hasWork, true);
  const cleaned = runCleanup(repoRoot);
  assert.equal(cleaned.cleaned, true);
  assert.equal(existsSync(assetDir), false);
  assert.equal(JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8")).length, 0);
  assert.equal(
    JSON.parse(await readFile(join(repoRoot, "fehlende_elemente_report.json"), "utf8")).counts.totalSpecies,
    0,
  );

  const directRoot = await createEditableFixture();
  context.after(() => rm(directRoot, { recursive: true, force: true }));
  const directApp = await createExplorerServer({ repoRoot: directRoot, port: 0 });
  const directAddress = await directApp.listen();
  context.after(() => directApp.close());
  const directBaseUrl = `http://${directApp.host}:${directAddress.port}`;
  const directAssetDir = join(directRoot, "species-assets", "Amsel");
  const directPreviewResponse = await fetch(
    `${directBaseUrl}/api/species/turdusmerula/delete/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(directPreviewResponse.status, 200);
  const directPreview = await directPreviewResponse.json();
  assert.equal(directPreview.assetDirectoryExists, true);
  const directSaveResponse = await fetch(
    `${directBaseUrl}/api/species/turdusmerula/delete/save`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: directPreview.token, deleteAssets: true }),
    },
  );
  assert.equal(directSaveResponse.status, 200);
  const directSaved = await directSaveResponse.json();
  assert.equal(directSaved.pipelineRequired, false);
  assert.equal(directSaved.permanentCleanup.assetDirectoryDeleted, true);
  assert.equal(existsSync(directAssetDir), false);
  assert.equal(JSON.parse(await readFile(join(directRoot, "speciesData.json"), "utf8")).length, 0);
  assert.equal(
    JSON.parse(await readFile(join(directRoot, "fehlende_elemente_report.json"), "utf8")).counts.totalSpecies,
    0,
  );
  const recreateResponse = await fetch(`${directBaseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: {
        german: "Amsel",
        scientificName: "Turdus merula",
        size: "ca. 23,5-29 cm",
        weight: "ca. 80-110 g",
        lifeExpectancy: "ca. 3 Jahre",
      },
    }),
  });
  assert.equal(recreateResponse.status, 200);
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
  assert.equal(filterSpecies(model.species, { flag: "manual-map" }).length, 4);
  assert.equal(
    filterSpecies(model.species, { flag: "missing-portrait" }).length,
    model.summary.missingPortraitCount,
  );
  assert.equal(
    filterSpecies(model.species, { flag: "data-issues" }).length,
    model.validation.data.issueSpeciesCount,
  );
  assert.equal(
    filterSpecies(model.species, { flag: "asset-issues" }).length,
    model.validation.assets.issueSpeciesCount,
  );
  assert.equal(
    filterSpecies(model.species, { flag: "sound-care" }).length,
    model.summary.soundCareCount,
  );
  assert.equal(
    filterSpecies(model.species, { flag: "issues" }).length,
    model.species.filter((entry) => entry.inconsistencies.length > 0).length,
  );
  assert.ok(filterSpecies(model.species, { status: "LC" }).length > 0);

  const dataIssue = structuredClone(model.species[0]);
  dataIssue.dataIssues = ["Testabweichung"];
  dataIssue.assetIssues = [];
  dataIssue.inconsistencies = ["Testabweichung"];
  const assetIssue = structuredClone(model.species[1]);
  assetIssue.assetIssues = ["Testasset fehlt"];
  assetIssue.inconsistencies = ["Testasset fehlt"];
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "data-issues" }).length, 1);
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "asset-issues" }).length, 1);
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "issues" }).length, 2);
});

test("Explorer-Oberflaeche zeigt Medien kompakt und kennzeichnet Datenquellen", async () => {
  const [
    appSource,
    cssSource,
    htmlSource,
    serverSource,
    updateSource,
    desktopLauncherSource,
    shortcutInstallerSource,
    packageSource,
    assetOverrides,
  ] = await Promise.all([
    readFile(new URL("./public/app.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app.css", import.meta.url), "utf8"),
    readFile(new URL("./public/index.html", import.meta.url), "utf8"),
    readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../update.mjs", import.meta.url), "utf8"),
    readFile(new URL("./desktop/start-explorer.vbs", import.meta.url), "utf8"),
    readFile(new URL("./desktop/install-shortcut.ps1", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
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
  assert.match(appSource, /Portraits fehlen/);
  assert.match(appSource, /Artporträts: \$\{missingPortraitCount\} von/);
  assert.match(appSource, /Karte, Sound, Credits, Spektrogramm und Artporträt vorhanden/);
  assert.match(appSource, /updateValidation/);
  assert.match(appSource, /fetch\("\/api\/validation"\)/);
  assert.match(appSource, /class="edit-dialog"/);
  assert.match(appSource, /\/preview/);
  assert.match(appSource, /\/save/);
  assert.match(appSource, /Diff-Vorschau/);
  assert.match(appSource, /function backupRetentionText\(result\)/);
  assert.match(appSource, /if \(!retention\) return ""/);
  assert.match(appSource, /function setupNewSpeciesCreator\(\)/);
  assert.match(appSource, /function setupSafeBackdropClose\(dialog, close\)/);
  assert.match(
    appSource,
    /startedOnBackdrop = event\.target === dialog;[\s\S]*startedOnBackdrop && event\.target === dialog/,
  );
  assert.doesNotMatch(
    appSource,
    /dialog\.addEventListener\("click",\s*\(event\)\s*=>\s*\{\s*if \(event\.target === dialog\)/,
  );
  assert.match(appSource, /\/api\/species\/new\/preview/);
  assert.match(appSource, /\/api\/species\/new\/save/);
  assert.match(appSource, /\/api\/species\/new\/portrait-prompt/);
  assert.match(appSource, /previewNewSpeciesPortrait\(savedSpeciesId\)/);
  assert.match(appSource, /Artportrait für die neu angelegte Art speichern/);
  assert.doesNotMatch(appSource, /Artporträt übernehmen und danach Commit und Push ausführen/);
  assert.match(appSource, /function setupPipelineControl\(\)/);
  assert.match(appSource, /function setupEditingMode\(\)/);
  assert.match(appSource, /\/api\/pipeline\/preview/);
  assert.match(appSource, /\/api\/pipeline\/start/);
  assert.match(appSource, /\/api\/pipeline\/status/);
  assert.match(appSource, /\/api\/pipeline\/assets\/review/);
  assert.match(appSource, /Manuelle Karten erneut suchen/);
  assert.match(appSource, /NC- und fehlende Sounds erneut suchen/);
  assert.doesNotMatch(appSource, /Fehlende Artporträts ergänzen/);
  assert.doesNotMatch(appSource, /strikten Ein-Bild-Regel/);
  assert.doesNotMatch(appSource, /mit „Weiter“ folgt jeweils die nächste/);
  assert.doesNotMatch(appSource, /\/api\/portraits\/missing/);
  assert.match(appSource, /soundCareHint/);
  assert.match(appSource, /Sound fehlt oder wird manuell gepflegt/);
  assert.match(htmlSource, /id="pipeline-run-notice"/);
  assert.match(htmlSource, /pipeline-dialog-close-button/);
  assert.match(appSource, /Pipeline-Lauf läuft gerade/);
  assert.match(appSource, /Pipeline-Lauf abgeschlossen/);
  assert.match(appSource, /Das Fenster kann geschlossen werden; der Lauf läuft im Hintergrund weiter/);
  assert.match(appSource, /footerCloseButton\.textContent = active \? "Fenster schließen" : "Abbrechen"/);
  assert.match(appSource, /renderPersistentPipelineStatus\(status\)/);
  assert.match(cssSource, /\.pipeline-run-notice\.completed/);
  assert.match(cssSource, /\.pipeline-dialog-status\.running/);
  assert.match(appSource, /Bisherige manuelle Karte behalten/);
  assert.match(appSource, /Bisherigen NC-Sound behalten/);
  assert.match(appSource, /Neuen Sound nicht übernehmen/);
  assert.match(appSource, /status\.status === "completed" && status\.gitPublished\) state\.notice = ""/);
  assert.match(appSource, /function setupAssetReview\(\)/);
  assert.match(appSource, /class="asset-review-map-trigger"/);
  assert.match(appSource, /openMapLightbox/);
  assert.match(
    appSource,
    /const stopAssetReviewAudio = \(\) => \{[\s\S]*audio\.pause\(\);[\s\S]*audio\.currentTime = 0;/,
  );
  assert.match(
    appSource,
    /dialog\.addEventListener\("close", \(\) => \{[\s\S]*stopAssetReviewAudio\(\);/,
  );
  assert.match(appSource, /Datenbank aktuell/);
  assert.match(appSource, /function monitorProjectRevision\(\)/);
  assert.match(appSource, /fetch\("\/api\/revision"\)/);
  assert.match(appSource, /setTimeout\(monitorProjectRevision,\s*5000\)/);
  assert.match(serverSource, /url\.pathname === "\/api\/revision"/);
  assert.match(serverSource, /async function refreshModel/);
  assert.match(desktopLauncherSource, /WScript\.Shell/);
  assert.match(desktopLauncherSource, /electron\.cmd/);
  assert.match(desktopLauncherSource, /shell\.Run command,\s*0,\s*False/);
  assert.match(shortcutInstallerSource, /CreateShortcut/);
  assert.match(shortcutInstallerSource, /wscript\.exe/);
  assert.match(packageSource, /species:desktop:shortcut/);
  assert.match(serverSource, /function createNewSpeciesPortraitPrompt\(payload\)/);
  assert.match(serverSource, /Git-Commit/);
  assert.match(serverSource, /\["push"\]/);
  assert.match(serverSource, /\/api\/pipeline\/assets\/review/);
  assert.match(serverSource, /pipeline-asset-backups/);
  assert.match(serverSource, /assetCompositeHash/);
  assert.match(serverSource, /reviewMode:\s*plan\.mode/);
  assert.match(serverSource, /copyFileSync\(resolvedBackupPath, targetPath\)/);
  assert.match(serverSource, /synchronizeStoredManualMapDocumentation/);
  assert.match(serverSource, /typeof mapOverride\?\.manual === "boolean"/);
  assert.match(serverSource, /async function previewMapAsset\(id, payload\)/);
  assert.match(serverSource, /async function saveMapAsset\(id, payload\)/);
  assert.match(serverSource, /async function publishMapAssetChanges\(species\)/);
  assert.match(serverSource, /async function previewSoundAsset\(id, payload\)/);
  assert.match(serverSource, /async function saveSoundAsset\(id, payload\)/);
  assert.match(serverSource, /async function publishSoundAssetChanges\(species\)/);
  assert.match(serverSource, /ASSET_BACKUP_RETENTION_COUNT = 3/);
  assert.match(serverSource, /ASSET_BACKUP_GLOBAL_BYTES = 500 \* 1024 \* 1024/);
  assert.match(serverSource, /"docs\/manual-map-overrides\.md"/);
  assert.match(updateSource, /isManualAsset\(safeName, "map"\)/);
  assert.match(updateSource, /isManualAsset\(safeGerman, "sound"\)/);
  assert.match(updateSource, /\{ force: true, allowManual: true, recordAssessment: false \}/);
  assert.match(updateSource, /args\.mode === "manual-maps"/);
  assert.match(updateSource, /args\.mode === "nc-sounds"/);
  assert.equal(assetOverrides.assets.Blaukehlchen.map.manual, true);
  assert.match(appSource, /function setupSpeciesDelete\(species\)/);
  assert.match(appSource, /\/delete\/preview/);
  assert.match(appSource, /\/delete\/save/);
  assert.match(appSource, /class="delete-assets-now"/);
  assert.match(appSource, /deleteAssets/);
  assert.match(appSource, /Taxonomie und Name sind gesperrt\./);
  assert.doesNotMatch(appSource, /Taxonomie und Name sind in Phase 7\.4 gesperrt\./);
  assert.match(appSource, /class="map-edit-section"/);
  assert.match(appSource, /class="map-preview-button"/);
  assert.match(appSource, /class="map-save-button"/);
  assert.match(appSource, /Karte wird gesichert, ersetzt, committed und gepusht/);
  assert.match(cssSource, /\.map-compare-grid/);
  assert.match(appSource, /class="sound-edit-section"/);
  assert.match(appSource, /class="sound-preview-button"/);
  assert.match(appSource, /class="sound-save-button"/);
  assert.match(appSource, /Spektrogramm wird erzeugt; danach werden Sound, Credits und Spektrogramm/);
  assert.match(appSource, /Das neue Spektrogramm wurde automatisch erzeugt/);
  assert.match(appSource, /Soundhash geprüft/);
  assert.match(cssSource, /\.sound-compare-grid/);
  assert.match(appSource, /class="portrait-prompt-button"/);
  assert.match(appSource, /class="portrait-copy-button"/);
  assert.match(appSource, /class="portrait-file-input"/);
  assert.match(appSource, /class="portrait-preview-button"/);
  assert.match(appSource, /\/assets\/portrait\/prompt/);
  assert.match(appSource, /\/assets\/portrait\/preview/);
  assert.doesNotMatch(appSource, /\/assets\/portrait\/generate/);
  assert.match(cssSource, /\.portrait-compare-frame\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5/s);
  assert.match(
    cssSource,
    /\.portrait-compare-frame img\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*100%[^}]*object-fit:\s*contain/s,
  );
  assert.match(cssSource, /\.portrait-compare-frame img\[hidden\]\s*\{[^}]*display:\s*none !important/s);
  assert.match(cssSource, /grid-template-areas:\s*"file reason"\s*"source reason"/);
  assert.match(
    cssSource,
    /grid-template-areas:\s*"file reason"\s*"recordist reason"\s*"url source"\s*"country license"\s*"quality location"\s*"notes notes"/,
  );
  assert.match(cssSource, /\.asset-file-field input\[type="file"\]/);
  assert.match(cssSource, /\.asset-reason-field textarea/);
  assert.match(
    appSource,
    /<div class="section-actions detail-actions edit-only"[\s\S]*edit-species-open[\s\S]*delete-species-open/,
  );
  assert.doesNotMatch(
    appSource,
    /<h3 class="section-title">Manuelle Daten<\/h3>[\s\S]{0,400}edit-species-open/,
  );
  assert.match(
    appSource,
    /newSpeciesSaved = true;[\s\S]*await loadData\(\{ reload: true \}\);[\s\S]*previewNewSpeciesPortrait\(savedSpeciesId\)/,
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
  assert.match(htmlSource, /class="new-species-portrait"/);
  assert.match(htmlSource, /new-species-portrait-file-input/);
  assert.match(htmlSource, /Portrait-Prompt erstellen/);
  assert.match(
    htmlSource,
    /data-pipeline-mode="all"[\s\S]*data-pipeline-mode="missing"[\s\S]*data-pipeline-mode="manual-maps"/,
  );
  assert.match(htmlSource, /data-pipeline-mode="missing"/);
  assert.match(htmlSource, /data-pipeline-mode="all"/);
  assert.match(htmlSource, /data-pipeline-mode="manual-maps"/);
  assert.match(htmlSource, /data-pipeline-mode="nc-sounds"/);
  assert.doesNotMatch(htmlSource, /data-pipeline-mode="portraits"/);
  assert.match(htmlSource, /data-pipeline-mode="cleanup"/);
  assert.match(htmlSource, /id="pipeline-dialog"/);
  assert.match(htmlSource, /id="edit-mode-toggle"/);
  assert.match(htmlSource, /id="pipeline-menu-button"/);
  assert.match(htmlSource, /Datenbank aktualisieren/);
  assert.match(htmlSource, /id="pipeline-mode-choice"/);
  assert.match(htmlSource, /Neue\/Unvollständige Arten aktualisieren/);
  assert.match(htmlSource, /id="asset-review-dialog"/);
  assert.match(htmlSource, /id="asset-review-list"/);
  assert.match(htmlSource, /id="asset-review-map-lightbox"/);
  assert.match(htmlSource, /id="asset-review-map-lightbox-image"/);
  assert.doesNotMatch(htmlSource, /class="pipeline-control"/);
  assert.match(htmlSource, /class="validation-dashboard"/);
  assert.doesNotMatch(htmlSource, /Phase 7\.3/);
  assert.match(htmlSource, />Validierung und Status</);
  assert.match(htmlSource, /value="data-issues"/);
  assert.match(htmlSource, /value="asset-issues"/);
  assert.match(
    htmlSource,
    /value="issues">Alle Probleme<\/option>\s*<option value="asset-issues">Assetproblem<\/option>\s*<option value="data-issues">Datenabweichung<\/option>\s*<option value="missing-portrait">Fehlendes Artporträt<\/option>\s*<option value="manual-map">Manuelle Karte<\/option>\s*<option value="nc">NC-Sound<\/option>\s*<option value="sound-care">Sound fehlt\/manuell gepflegt<\/option>/s,
  );
  assert.match(cssSource, /\.validation-grid\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /\.species-list\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.doesNotMatch(cssSource, /\.species-list\s*\{[^}]*max-height:/s);
  assert.match(
    cssSource,
    /\.species-panel\s*\{[^}]*align-self:\s*start[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s,
  );
  assert.match(cssSource, /\.species-item\s*\{[^}]*height:\s*61px/s);
  assert.doesNotMatch(appSource, /\["Kartenpflege"/);
  assert.doesNotMatch(appSource, /\["Daten abgerufen", species\.iucn\.fetchedAt\]/);
  assert.match(cssSource, /\.detail-media-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(
    cssSource,
    /\.detail-media-layout\s*\{[^}]*grid-auto-rows:\s*calc\(var\(--detail-media-frame-height\)\s*\+\s*41px\)/s,
  );
  assert.match(cssSource, /\.detail-side-stack\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s*auto/s);
  assert.match(
    cssSource,
    /\.species-image-panel\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    cssSource,
    /\.species-portrait-image\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*100%[^}]*object-fit:\s*contain/s,
  );
  assert.match(appSource, /function syncSpeciesPanelHeight\(\)/);
  assert.match(appSource, /lastDetailBlock\.getBoundingClientRect\(\)\.bottom/);
  assert.match(appSource, /elements\.speciesPanel\.style\.height = `\$\{targetHeight\}px`/);
  assert.match(appSource, /window\.addEventListener\("resize", syncSpeciesPanelHeight\)/);
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
  assert.match(cssSource, /\.asset-review-map-trigger\s*\{[^}]*cursor:\s*zoom-in/s);
  assert.match(cssSource, /\.detail-actions\s*\{/);
  assert.match(cssSource, /\.delete-assets-option\s*\{/);
  assert.match(serverSource, /mode:\s*preview\.mode/);
  assert.match(cssSource, /button\.danger/);
  assert.match(appSource, /window\.scrollTo\(scrollPosition\)/);
  assert.doesNotMatch(appSource, /renderSpeciesList\(\);\s*renderDetail\(species\)/);
});
