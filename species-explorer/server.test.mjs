import assert from "node:assert/strict";
import fs, { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
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
import { buildCleanupPlan, runCleanup, runSpeciesCleanup } from "../scripts/species-cleanup.mjs";
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
  const frameLength = 417;
  const frame = Buffer.alloc(frameLength, seed);
  Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame, 0);
  return Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    frame,
    frame,
    frame,
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
    writeFile(join(assetDir, "sound.mp3"), createTestMp3(1)),
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

  const statusIconResponse = await fetch(`${baseUrl}/graphics/catagory/EN.png`);
  assert.equal(statusIconResponse.status, 200);
  assert.equal(statusIconResponse.headers.get("content-type"), "image/png");
  assert.ok((await statusIconResponse.arrayBuffer()).byteLength > 0);

  const invalidGraphicResponse = await fetch(`${baseUrl}/graphics/../species_list.json`);
  assert.equal(invalidGraphicResponse.status, 404);

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

test("Backup-Pfad ist lokal einstellbar und bleibt aus Git heraus", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const app = await createExplorerServer({
    repoRoot,
    port: 0,
    nasBackupRoot: "W:\\Default Backup",
  });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const initialSettings = await (await fetch(`${baseUrl}/api/settings`)).json();
  assert.equal(initialSettings.backupRoot, "W:\\Default Backup");
  assert.equal(initialSettings.hasCustomBackupRoot, false);
  assert.equal(initialSettings.settingsFile, "species-explorer/local-settings.json");

  const invalidResponse = await fetch(`${baseUrl}/api/settings/backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backupRoot: "relative\\backup" }),
  });
  assert.equal(invalidResponse.status, 400);

  const changedResponse = await fetch(`${baseUrl}/api/settings/backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backupRoot: "D:\\IUCN Backup" }),
  });
  assert.equal(changedResponse.status, 200);
  const changedSettings = await changedResponse.json();
  assert.equal(changedSettings.backupRoot, "D:\\IUCN Backup");
  assert.equal(changedSettings.hasCustomBackupRoot, true);

  const status = await (await fetch(`${baseUrl}/api/backup/status`)).json();
  assert.equal(status.backupRoot, "D:\\IUCN Backup");
  const settingsFile = JSON.parse(await readFile(join(repoRoot, "species-explorer", "local-settings.json"), "utf8"));
  assert.equal(settingsFile.nasBackupRoot, "D:\\IUCN Backup");

  const resetResponse = await fetch(`${baseUrl}/api/settings/backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reset: true }),
  });
  assert.equal(resetResponse.status, 200);
  const resetSettings = await resetResponse.json();
  assert.equal(resetSettings.backupRoot, "W:\\Default Backup");
  assert.equal(resetSettings.hasCustomBackupRoot, false);
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

test("Deutscher Artname kann inklusive SafeName, Assetordner und Pflegeeinträgen umbenannt werden", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const assetDir = join(repoRoot, "species-assets", "Amsel");
  await Promise.all([
    writeFile(join(repoRoot, "lastSavedAssessmentId.json"), `${JSON.stringify({ Amsel: 264548442 }, null, 2)}\n`),
    writeFile(
      join(repoRoot, "species-assets-overrides.json"),
      `${JSON.stringify({
        version: 1,
        assets: {
          Amsel: {
            map: {
              manual: true,
              germanName: "Amsel",
              reason: "Testkarte",
              source: "https://example.test/map.jpg",
            },
            sound: {
              manual: false,
              rejectedSources: [{ key: "xeno-canto:123", source: "xeno-canto" }],
            },
          },
        },
      }, null, 2)}\n`,
    ),
    writeFile(
      join(repoRoot, "docs", "manual-map-overrides.md"),
      [
        "# Manuell gepflegte Karten",
        "",
        "Stand: 2026-06-19",
        "",
        "Aktuell sind 1 Karte als manuell gepflegt dokumentiert.",
        "",
        "| Art | SafeName | Datei | Grund | Quelle | Stand | Status |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| Amsel | Amsel | `species-assets/Amsel/map.jpg` | Testkarte | [Quelle](https://example.test/map.jpg) | 2026-06-19 | erledigt/geprueft |",
        "",
        "## Pflege-Regeln",
        "",
      ].join("\n"),
    ),
    writeFile(join(assetDir, "portrait.webp"), Buffer.alloc(256)),
    writeFile(join(assetDir, "portrait.json"), `${JSON.stringify({ german_name: "Amsel" }, null, 2)}\n`),
    writeFile(join(assetDir, "credits.json"), `${JSON.stringify({
      scientific_name: "Turdus merula",
      german_name: "Amsel",
      source: "Test",
      license: "https://creativecommons.org/licenses/by/4.0/",
    }, null, 2)}\n`),
  ]);
  const report = JSON.parse(await readFile(join(repoRoot, "fehlende_elemente_report.json"), "utf8"));
  report.counts.ncSoundLicensesAll = 1;
  report.ncSoundLicensesAll = ["Amsel"];
  await writeFile(join(repoRoot, "fehlende_elemente_report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: {
        germanName: "Schwarzdrossel",
        size: "ca. 23,5-29 cm",
        weight: "ca. 80-110 g",
        lifeExpectancy: "ca. 3 Jahre",
      },
    }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.changes.length, 1);
  assert.equal(preview.changes[0].field, "Deutscher Name");
  assert.equal(preview.changes[0].after, "Schwarzdrossel");

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, false);
  assert.equal(saved.oldSafeName, "Amsel");
  assert.equal(saved.newSafeName, "Schwarzdrossel");
  assert.equal(saved.safeNameChanged, true);

  assert.equal(existsSync(join(repoRoot, "species-assets", "Amsel")), false);
  assert.equal(existsSync(join(repoRoot, "species-assets", "Schwarzdrossel")), true);
  assert.equal(JSON.parse(await readFile(join(repoRoot, "species_list.json"), "utf8"))[0].german, "Schwarzdrossel");
  assert.equal(JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8"))[0]["Deutscher Name"], "Schwarzdrossel");
  assert.equal(JSON.parse(await readFile(join(repoRoot, "lastSavedAssessmentId.json"), "utf8")).Schwarzdrossel, 264548442);
  const registry = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registry.assets.Amsel, undefined);
  assert.equal(registry.assets.Schwarzdrossel.map.germanName, "Schwarzdrossel");
  assert.equal(registry.assets.Schwarzdrossel.sound.rejectedSources[0].key, "xeno-canto:123");
  assert.equal(
    JSON.parse(await readFile(join(repoRoot, "species-assets", "Schwarzdrossel", "credits.json"), "utf8")).german_name,
    "Schwarzdrossel",
  );
  assert.equal(
    JSON.parse(await readFile(join(repoRoot, "species-assets", "Schwarzdrossel", "portrait.json"), "utf8")).german_name,
    "Schwarzdrossel",
  );
  const nextReport = JSON.parse(await readFile(join(repoRoot, "fehlende_elemente_report.json"), "utf8"));
  assert.deepEqual(nextReport.ncSoundLicensesAll, ["Schwarzdrossel"]);
  const manualDoc = await readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8");
  assert.match(manualDoc, /Schwarzdrossel/);
  assert.match(manualDoc, /species-assets\/Schwarzdrossel\/map\.jpg/);

  const model = await buildExplorerModel(repoRoot);
  assert.equal(model.species[0].germanName, "Schwarzdrossel");
  assert.equal(model.species[0].safeName, "Schwarzdrossel");
  assert.equal(model.species[0].assets.map.exists, true);
});

test("Wissenschaftlicher Artname bleibt gesperrt und kann bewusst mit URL-Slug geändert werden", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const assetDir = join(repoRoot, "species-assets", "Amsel");
  await Promise.all([
    writeFile(join(assetDir, "portrait.json"), `${JSON.stringify({
      german_name: "Amsel",
      scientific_name: "Turdus merula",
    }, null, 2)}\n`),
    writeFile(join(assetDir, "credits.json"), `${JSON.stringify({
      german_name: "Amsel",
      scientific_name: "Turdus merula",
      source: "Test",
      license: "https://creativecommons.org/licenses/by/4.0/",
    }, null, 2)}\n`),
  ]);
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;
  const payload = {
    germanName: "Amsel",
    scientificName: "Turdus iliacus",
    size: "ca. 23,5-29 cm",
    weight: "ca. 80-110 g",
    lifeExpectancy: "ca. 3 Jahre",
  };

  const lockedPreviewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: payload }),
  });
  assert.equal(lockedPreviewResponse.status, 409);
  assert.match((await lockedPreviewResponse.json()).details.join(" "), /URL-Slug/);

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: { ...payload, scientificNameUnlocked: true } }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.deepEqual(
    preview.changes.map((entry) => entry.field),
    ["Wissenschaftlicher Name", "URL-Slug"],
  );
  assert.match(preview.warnings.join(" "), /Website/);

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, false);
  assert.equal(saved.slugChanged, true);
  assert.equal(saved.oldSlug, "turdusmerula");
  assert.equal(saved.newSlug, "turdusiliacus");
  assert.equal(saved.species.id, "turdusiliacus");
  assert.equal(existsSync(assetDir), true);

  const inputList = JSON.parse(await readFile(join(repoRoot, "species_list.json"), "utf8"));
  assert.equal(inputList[0].genus, "Turdus");
  assert.equal(inputList[0].species, "iliacus");
  const generated = JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8"))[0];
  assert.equal(generated["Wissenschaftlicher Name"], "Turdus iliacus");
  assert.equal(generated.Genus, "Turdus");
  assert.equal(generated.Species, "iliacus");
  assert.equal(generated.URLSlug, "turdusiliacus");
  assert.equal(
    JSON.parse(await readFile(join(assetDir, "credits.json"), "utf8")).scientific_name,
    "Turdus iliacus",
  );
  assert.equal(
    JSON.parse(await readFile(join(assetDir, "portrait.json"), "utf8")).scientific_name,
    "Turdus iliacus",
  );
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

  const changedInputPlan = buildPipelinePlan({
    speciesList: speciesList.map((entry, index) => (index === 0
      ? { ...entry, size: `${entry.size} geändert` }
      : entry)),
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "missing",
  });
  assert.equal(changedInputPlan.targetCount, 1);
  assert.match(changedInputPlan.targets[0].reasons.join(" "), /geänderte Eingabefelder: Größe/);
  const transferPlan = buildPipelinePlan({
    speciesList: speciesList.map((entry, index) => (index === 0
      ? { ...entry, size: `${entry.size} geändert` }
      : entry)),
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "transfer",
  });
  assert.equal(transferPlan.targetCount, 1);
  assert.match(transferPlan.targets[0].reasons.join(" "), /geänderte Eingabefelder: Größe/);

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
    join(repoRoot, "species-assets-overrides.json"),
    `${JSON.stringify({ version: 1, assets: {} }, null, 2)}\n`,
  );
  const targetedCompleteMapPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "manual-maps",
    targetSlugs: ["turdusmerula"],
  });
  assert.equal(targetedCompleteMapPlan.targetCount, 1);
  assert.equal(targetedCompleteMapPlan.targets[0].safeName, "Amsel");
  assert.match(targetedCompleteMapPlan.targets[0].reasons.join(" "), /gezielte Kartensuche/);

  await rm(join(repoRoot, "species-assets", "Amsel", "map.jpg"), { force: true });
  const untargetedMissingMapPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "manual-maps",
  });
  assert.equal(untargetedMissingMapPlan.targetCount, 1);
  assert.equal(untargetedMissingMapPlan.targets[0].safeName, "Amsel");
  assert.match(untargetedMissingMapPlan.targets[0].reasons.join(" "), /Karte fehlt/);
  const targetedMissingMapPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "manual-maps",
    targetSlugs: ["turdusmerula"],
  });
  assert.equal(targetedMissingMapPlan.targetCount, 1);
  assert.equal(targetedMissingMapPlan.targets[0].safeName, "Amsel");
  assert.match(targetedMissingMapPlan.targets[0].reasons.join(" "), /Karte fehlt/);

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
  const transferIgnoresMissingAssetsPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "transfer",
  });
  assert.equal(transferIgnoresMissingAssetsPlan.targetCount, 0);
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
    rebuildReportAfterAssetSave: false,
    mapImageRenderer: async ({ outputPath }) => {
      await writeFile(outputPath, createTestJpeg(320, 210));
      return { outputBytes: createTestJpeg(320, 210).length, ffmpegPath: "test-ffmpeg" };
    },
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

  const pngPreviewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalName: "amsel-neu.png",
      imageBase64: createTestPng(640, 480).toString("base64"),
      reason: "Manuell geprüfte PNG-Testkarte",
      source: "",
    }),
  });
  assert.equal(pngPreviewResponse.status, 200);
  const pngPreview = await pngPreviewResponse.json();
  assert.deepEqual(pngPreview.newMap.dimensions, { width: 320, height: 210 });
  assert.equal(pngPreview.source, "");

  const linkedJpeg = createTestJpeg(800, 500);
  const sourceServer = createHttpServer((request, response) => {
    response.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": String(linkedJpeg.length),
    });
    response.end(linkedJpeg);
  });
  await new Promise((resolve, reject) => {
    sourceServer.once("error", reject);
    sourceServer.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => sourceServer.close());
  const sourceAddress = sourceServer.address();
  const sourceUrl = `http://127.0.0.1:${sourceAddress.port}/iucn-map.jpg?Authorization=test`;
  const linkPreviewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalName: "",
      imageBase64: "",
      reason: "Manuell geprüfter Kartenlink",
      source: sourceUrl,
    }),
  });
  assert.equal(linkPreviewResponse.status, 200);
  const linkPreview = await linkPreviewResponse.json();
  assert.deepEqual(linkPreview.newMap.dimensions, { width: 800, height: 500 });
  assert.equal(linkPreview.newMap.bytes, linkedJpeg.length);
  assert.equal(linkPreview.source, sourceUrl);

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
  assert.equal(saved.backup, "species-explorer/asset-backups/Amsel/map");
  assert.deepEqual(await readFile(join(repoRoot, "species-assets", "Amsel", "map.jpg")), jpeg);
  assert.equal(existsSync(join(repoRoot, ...saved.backup.split("/"))), true);
  assert.equal(existsSync(join(repoRoot, ...saved.backup.split("/"), "map.jpg")), true);
  assert.equal(existsSync(join(repoRoot, ...saved.backup.split("/"), "backup.json")), true);

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
  assert.deepEqual(backupFiles.sort(), ["backup.json", "map.jpg"]);
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
    rebuildReportAfterAssetSave: false,
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
  const mp3Inspection = inspectMp3(mp3);
  assert.equal(mp3Inspection.signature, "ID3 + MPEG frames");
  assert.equal(mp3Inspection.frameOffset, 10);
  assert.equal(mp3Inspection.verifiedFrames, 3);
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
    rebuildReportAfterAssetSave: false,
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
  assert.equal(saved.backup, "species-explorer/asset-backups/Amsel/sound");
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
    rebuildReportAfterAssetSave: false,
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

test("Einzelne Assets können gezielt gelöscht und für spätere Übertragung vorgemerkt werden", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const assetDirectory = join(repoRoot, "species-assets", "Amsel");
  await Promise.all([
    writeFile(join(assetDirectory, "portrait.webp"), createTestWebp(13)),
    writeFile(join(assetDirectory, "portrait.json"), `${JSON.stringify({
      german_name: "Amsel",
      scientific_name: "Turdus merula",
      source: "ChatGPT",
      prompt_version: "1.1.0",
    }, null, 2)}\n`),
    writeFile(join(repoRoot, "docs", "manual-map-overrides.md"), [
      "# Manual Map Overrides",
      "",
      "| Art | SafeName | Datei | Grund | Quelle | Aktualisiert | Status |",
      "|---|---|---|---|---|---|---|",
      "| Amsel | Amsel | `species-assets/Amsel/map.jpg` | Test | [Quelle](https://example.com/map) | 2026-07-04 | erledigt |",
      "",
    ].join("\n")),
    writeFile(join(repoRoot, "species-assets-overrides.json"), `${JSON.stringify({
      version: 1,
      assets: {
        Amsel: {
          map: {
            manual: true,
            protectFromPipeline: true,
            source: "https://example.com/map",
            reason: "Testkarte",
            sha256: "0".repeat(64),
          },
          sound: {
            manual: true,
            protectFromPipeline: true,
            isNc: true,
            rejectedSources: [{
              key: "xeno-canto:123",
              source: "xeno-canto.org",
              url: "https://xeno-canto.org/123",
              recordist: "Test",
              license: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
              rejectedAt: "2026-07-04T00:00:00.000Z",
            }],
          },
          spectrogram: {
            stale: false,
            soundSha256: "1".repeat(64),
            spectrogramSha256: "2".repeat(64),
          },
          portrait: {
            managedBy: "species-explorer",
            source: "ChatGPT",
            sha256: "3".repeat(64),
            metadataSha256: "4".repeat(64),
          },
        },
      },
    }, null, 2)}\n`),
  ]);

  const app = await createExplorerServer({
    repoRoot,
    port: 0,
    publishAssetChanges: false,
    rebuildReportAfterAssetSave: false,
  });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const deleteMapResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(deleteMapResponse.status, 200);
  const deletedMap = await deleteMapResponse.json();
  assert.equal(deletedMap.deleted, true);
  assert.equal(deletedMap.assetType, "map");
  assert.equal(deletedMap.pendingTransfer, true);
  assert.equal(existsSync(join(assetDirectory, "map.jpg")), false);
  assert.equal(deletedMap.backup, "species-explorer/asset-backups/Amsel/map");
  assert.equal(existsSync(join(repoRoot, ...deletedMap.backup.split("/"))), true);
  assert.equal(existsSync(join(repoRoot, ...deletedMap.backup.split("/"), "map.jpg")), true);
  assert.equal(existsSync(join(repoRoot, ...deletedMap.backup.split("/"), "backup.json")), true);
  const registryAfterMap = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registryAfterMap.assets.Amsel.map, undefined);
  const documentationAfterMap = await readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8");
  assert.doesNotMatch(documentationAfterMap, /species-assets\/Amsel\/map\.jpg/);

  const restoreMapResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(restoreMapResponse.status, 200);
  const restoredMap = await restoreMapResponse.json();
  assert.equal(restoredMap.restored, true);
  assert.equal(restoredMap.assetType, "map");
  assert.equal(restoredMap.pendingTransfer, true);
  assert.equal(existsSync(join(assetDirectory, "map.jpg")), true);
  const registryAfterMapRestore = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registryAfterMapRestore.assets.Amsel.map.manual, true);
  assert.equal(registryAfterMapRestore.assets.Amsel.map.source, "https://example.com/map");
  const documentationAfterMapRestore = await readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8");
  assert.match(documentationAfterMapRestore, /species-assets\/Amsel\/map\.jpg/);

  const secondDeleteMapResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/map/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(secondDeleteMapResponse.status, 200);

  const deleteSoundResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(deleteSoundResponse.status, 200);
  const deletedSound = await deleteSoundResponse.json();
  assert.equal(deletedSound.deleted, true);
  assert.equal(deletedSound.assetType, "sound");
  assert.equal(deletedSound.pendingTransfer, true);
  assert.equal(existsSync(join(assetDirectory, "sound.mp3")), false);
  assert.equal(existsSync(join(assetDirectory, "credits.json")), false);
  assert.equal(existsSync(join(assetDirectory, "spectrogram.webp")), false);
  assert.equal(deletedSound.backup, "species-explorer/asset-backups/Amsel/sound");
  const soundBackupDirectory = join(repoRoot, ...deletedSound.backup.split("/"));
  assert.equal(existsSync(join(soundBackupDirectory, "sound.mp3")), true);
  assert.equal(existsSync(join(soundBackupDirectory, "credits.json")), true);
  assert.equal(existsSync(join(soundBackupDirectory, "spectrogram.webp")), true);
  assert.equal(existsSync(join(soundBackupDirectory, "backup.json")), true);
  const registryAfterSound = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registryAfterSound.assets.Amsel.spectrogram, undefined);
  assert.equal(registryAfterSound.assets.Amsel.sound.manual, false);
  assert.equal(registryAfterSound.assets.Amsel.sound.protectFromPipeline, false);
  assert.equal(registryAfterSound.assets.Amsel.sound.rejectedSources.length, 1);
  assert.equal(registryAfterSound.assets.Amsel.sound.rejectedSources[0].key, "xeno-canto:123");

  await writeFile(
    join(soundBackupDirectory, "sound.mp3"),
    Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WAVE", "ascii"), Buffer.alloc(32)]),
  );
  const invalidSoundRestoreResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(invalidSoundRestoreResponse.status, 409);
  const invalidSoundRestore = await invalidSoundRestoreResponse.json();
  assert.match(invalidSoundRestore.error, /kein gültiges MP3/);
  assert.equal(existsSync(join(assetDirectory, "sound.mp3")), false);

  await writeFile(join(soundBackupDirectory, "sound.mp3"), createTestMp3(9));
  const restoreSoundResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(restoreSoundResponse.status, 200);
  const restoredSound = await restoreSoundResponse.json();
  assert.equal(restoredSound.restored, true);
  assert.equal(restoredSound.assetType, "sound");
  assert.equal(existsSync(join(assetDirectory, "sound.mp3")), true);
  inspectMp3(await readFile(join(assetDirectory, "sound.mp3")));

  const secondDeleteSoundResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/sound/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(secondDeleteSoundResponse.status, 200);

  const deletePortraitResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/portrait/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(deletePortraitResponse.status, 200);
  const deletedPortrait = await deletePortraitResponse.json();
  assert.equal(deletedPortrait.deleted, true);
  assert.equal(deletedPortrait.assetType, "portrait");
  assert.equal(deletedPortrait.pendingTransfer, true);
  assert.equal(existsSync(join(assetDirectory, "portrait.webp")), false);
  assert.equal(existsSync(join(assetDirectory, "portrait.json")), false);
  assert.equal(deletedPortrait.backup, "species-explorer/asset-backups/Amsel/portrait");
  const portraitBackupDirectory = join(repoRoot, ...deletedPortrait.backup.split("/"));
  assert.equal(existsSync(join(portraitBackupDirectory, "portrait.webp")), true);
  assert.equal(existsSync(join(portraitBackupDirectory, "portrait.json")), true);
  assert.equal(existsSync(join(portraitBackupDirectory, "backup.json")), true);
  const registryAfterPortrait = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registryAfterPortrait.assets.Amsel.portrait, undefined);

  const model = await buildExplorerModel(repoRoot);
  const amsel = model.species.find((entry) => entry.id === "turdusmerula");
  assert.ok(amsel.assetIssues.includes("Karte fehlt"));
  assert.ok(amsel.assetIssues.includes("Sound fehlt"));
  assert.ok(amsel.assetIssues.includes("Credits fehlen"));
  assert.ok(amsel.assetIssues.includes("Spektrogramm fehlt"));
  assert.ok(amsel.assetIssues.includes("Artporträt fehlt"));
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
  await writeFile(
    join(directRoot, "species-assets-overrides.json"),
    `${JSON.stringify({
      version: 1,
      assets: {
        Amsel: {
          map: { manual: true, reason: "Testkarte" },
          sound: {
            manual: false,
            rejectedSources: [{ key: "xeno-canto:123", source: "xeno-canto", rejectedAt: "2026-06-28T00:00:00Z" }],
          },
        },
      },
    }, null, 2)}\n`,
  );
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
  assert.equal(directSaved.permanentCleanup.overrideDeleted, true);
  assert.equal(existsSync(directAssetDir), false);
  assert.deepEqual(
    JSON.parse(await readFile(join(directRoot, "species-assets-overrides.json"), "utf8")).assets,
    {},
  );
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

  const generatedOnlyRoot = await createEditableFixture();
  context.after(() => rm(generatedOnlyRoot, { recursive: true, force: true }));
  await writeFile(join(generatedOnlyRoot, "species_list.json"), "[]\n", "utf8");
  const generatedOnlyApp = await createExplorerServer({ repoRoot: generatedOnlyRoot, port: 0 });
  const generatedOnlyAddress = await generatedOnlyApp.listen();
  context.after(() => generatedOnlyApp.close());
  const generatedOnlyBaseUrl = `http://${generatedOnlyApp.host}:${generatedOnlyAddress.port}`;
  const generatedOnlyAssetDir = join(generatedOnlyRoot, "species-assets", "Amsel");
  const generatedOnlyPreviewResponse = await fetch(
    `${generatedOnlyBaseUrl}/api/species/turdusmerula/delete/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(generatedOnlyPreviewResponse.status, 200);
  const generatedOnlyPreview = await generatedOnlyPreviewResponse.json();
  assert.equal(generatedOnlyPreview.requiresAssetDeletion, true);
  assert.match(generatedOnlyPreview.effects.join(" "), /bereits aus der Eingabeliste entfernt/);
  const generatedOnlySaveResponse = await fetch(
    `${generatedOnlyBaseUrl}/api/species/turdusmerula/delete/save`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: generatedOnlyPreview.token, deleteAssets: true }),
    },
  );
  assert.equal(generatedOnlySaveResponse.status, 200);
  const generatedOnlySaved = await generatedOnlySaveResponse.json();
  assert.equal(generatedOnlySaved.inputEntryRemoved, false);
  assert.equal(generatedOnlySaved.backup, "");
  assert.equal(generatedOnlySaved.permanentCleanup.generatedDataDeleted, true);
  assert.equal(generatedOnlySaved.permanentCleanup.assetDirectoryDeleted, true);
  assert.equal(existsSync(generatedOnlyAssetDir), false);
  assert.equal(JSON.parse(await readFile(join(generatedOnlyRoot, "speciesData.json"), "utf8")).length, 0);
});

test("Artbereinigung stellt Assets nach Windows-Dateisperre wieder her", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  const assetDir = join(repoRoot, "species-assets", "Amsel");
  await writeFile(join(repoRoot, "species_list.json"), "[]\n", "utf8");

  const originalRmSync = fs.rmSync;
  const originalRenameSync = fs.renameSync;
  let simulatedLockCount = 0;
  fs.renameSync = function patchedRenameSync(sourcePath, targetPath) {
    const normalized = String(sourcePath).replace(/\\/g, "/");
    if (normalized.endsWith("/species-assets/Amsel")) {
      const error = new Error("simulierter Rename-Fehler");
      error.code = "EPERM";
      throw error;
    }
    return originalRenameSync.call(fs, sourcePath, targetPath);
  };
  fs.rmSync = function patchedRmSync(targetPath, options) {
    const normalized = String(targetPath).replace(/\\/g, "/");
    if (normalized.endsWith("/species-assets/Amsel")) {
      simulatedLockCount += 1;
      if (simulatedLockCount === 1) {
        for (const entry of fs.readdirSync(targetPath)) {
          originalRmSync.call(fs, join(targetPath, entry), { recursive: true, force: true });
        }
      }
      const error = new Error("simulierte Windows-Dateisperre");
      error.code = "EPERM";
      throw error;
    }
    return originalRmSync.call(fs, targetPath, options);
  };

  try {
    assert.throws(
      () => runSpeciesCleanup(repoRoot, { slug: "turdusmerula", safeName: "Amsel" }),
      /Windows noch gesperrt|simulierte Windows-Dateisperre/,
    );
  } finally {
    fs.rmSync = originalRmSync;
    fs.renameSync = originalRenameSync;
  }

  assert.equal(simulatedLockCount > 1, true);
  assert.equal(existsSync(assetDir), true);
  assert.equal(existsSync(join(assetDir, "map.jpg")), true);
  assert.equal(existsSync(join(assetDir, "sound.mp3")), true);
  assert.equal(existsSync(join(assetDir, "credits.json")), true);
  assert.equal(existsSync(join(assetDir, "spectrogram.webp")), true);
  assert.equal(JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8")).length, 1);
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
  assert.equal(filterSpecies(model.species, { flag: "nc" }).length, model.summary.ncSoundCount);
  assert.equal(filterSpecies(model.species, { flag: "manual-map" }).length, model.summary.manualMapCount);
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
    desktopMainSource,
    serverLifecycleSource,
    restoreStartSource,
    nasBackupSource,
    cleanupSource,
    packageSource,
    gitignoreSource,
    assetOverrides,
  ] = await Promise.all([
    readFile(new URL("./public/app.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app.css", import.meta.url), "utf8"),
    readFile(new URL("./public/index.html", import.meta.url), "utf8"),
    readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../update.mjs", import.meta.url), "utf8"),
    readFile(new URL("./desktop/start-explorer.vbs", import.meta.url), "utf8"),
    readFile(new URL("./desktop/install-shortcut.ps1", import.meta.url), "utf8"),
    readFile(new URL("./desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("./desktop/server-lifecycle.mjs", import.meta.url), "utf8"),
    readFile(new URL("../restore-start.cmd", import.meta.url), "utf8"),
    readFile(new URL("../scripts/nas-backup.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/species-cleanup.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../species-assets-overrides.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.match(appSource, /class="map-image"/);
  assert.match(htmlSource, /class="header-logo"/);
  assert.match(htmlSource, /fn-wildlife-travel-logo-glow\.jpg/);
  assert.doesNotMatch(htmlSource, /IUCN Species Data/);
  assert.match(cssSource, /\.map-image\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(appSource, /map-zoom-trigger/);
  assert.match(appSource, /map-lightbox/);
  assert.match(appSource, /function resetScrollableToTop\(element\)/);
  assert.match(appSource, /resetScrollableToTop\(elements\.detailPanel\)/);
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
  assert.match(appSource, /function formatSexSpecificDataValue\(value\)/);
  assert.match(appSource, /class="sex-specific-value"/);
  assert.match(appSource, /class="iucn-heading-status"/);
  assert.match(appSource, /class="iucn-heading-trend"/);
  assert.match(appSource, /class="iucn-data-icon/);
  assert.match(appSource, /function createIndicatorIcon\(url, title, className = ""\)/);
  assert.match(appSource, /species-list-indicator/);
  assert.match(appSource, /\/graphics\/catagory\/\$\{encodeURIComponent\(code\)\}\.png/);
  assert.match(appSource, /\/graphics\/trend\/\$\{encodeURIComponent\(fileName\)\}/);
  assert.match(appSource, /class="audio-credits" open/);
  assert.match(appSource, /Keine Karte vorhanden/);
  assert.doesNotMatch(appSource, /Keine bisherige Karte vorhanden/);
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
  assert.match(appSource, /\/api\/species\/new\/portrait-preview/);
  assert.match(htmlSource, /name="sizeUnit"/);
  assert.match(htmlSource, /name="weightUnit"/);
  assert.match(htmlSource, /name="lifeExpectancyUnit"/);
  assert.match(htmlSource, /placeholder="23,5-29"/);
  assert.match(htmlSource, /placeholder="80-110"/);
  assert.match(htmlSource, /placeholder="3"/);
  assert.doesNotMatch(htmlSource, /placeholder="ca\. 23,5-29 cm"/);
  assert.match(appSource, /const formatMeasureValue = /);
  assert.match(appSource, /const singularAgeUnit = /);
  assert.match(appSource, /state\.renderPersistentPipelineStatus\?\.\(status\)/);
  assert.doesNotMatch(
    appSource,
    /async function pollInlinePipelineStatus\(\)[\s\S]*?[^.]renderPersistentPipelineStatus\(status\)/,
  );
  assert.match(appSource, /let maxStepReached = 1/);
  assert.match(appSource, /indicator\.addEventListener\("click"/);
  assert.match(appSource, /newSpeciesPipelineActive\) return;[\s\S]*form\.reset\(\);[\s\S]*resetAll\(\);/);
  assert.match(cssSource, /\.new-species-value-unit/);
  assert.match(cssSource, /\.new-species-steps li\.reachable/);
  assert.match(appSource, /Artportrait wird lokal übernommen/);
  assert.match(appSource, /publish:\s*false/);
  assert.match(appSource, /Artportrait wird für diese neue Art übersprungen/);
  assert.doesNotMatch(
    appSource,
    /portraitSkipButton\.addEventListener\("click", \(\) => \{[\s\S]*?saveAndStartPipeline\(\);[\s\S]*?\}\);/,
  );
  assert.doesNotMatch(appSource, /Artporträt übernehmen und danach Commit und Push ausführen/);
  assert.match(appSource, /function setupPipelineControl\(\)/);
  assert.match(appSource, /function setupEditingMode\(\)/);
  assert.match(appSource, /\/api\/pipeline\/preview/);
  assert.match(appSource, /\/api\/pipeline\/start/);
  assert.match(appSource, /\/api\/pipeline\/status/);
  assert.match(appSource, /\/api\/pipeline\/assets\/review/);
  assert.match(appSource, /autoStart/);
  assert.match(appSource, /startCurrentPipelinePreview/);
  assert.match(htmlSource, /Manuelle und fehlende Karten erneut suchen/);
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
  assert.match(appSource, /Bisherige \$\{asset\.previousManual \? "manuelle" : "automatische"\} Karte behalten/);
  assert.match(appSource, /Gefundenen Sound übernehmen \(\$\{soundKind\}\)/);
  assert.match(appSource, /Sound nicht übernehmen/);
  assert.match(appSource, /status\.status === "completed" && status\.gitPublished\) state\.notice = ""/);
  assert.match(appSource, /function setupAssetReview\(\)/);
  assert.match(appSource, /class="asset-review-map-trigger"/);
  assert.match(appSource, /class="asset-review-map-compare"/);
  assert.match(appSource, /Bisherige Karte/);
  assert.match(appSource, /Gefundene Karte/);
  assert.match(appSource, /mapLightboxImage\.onload = \(\) => resetScrollableToTop\(mapLightbox\)/);
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
  assert.match(appSource, /Datenbank-Aktionen/);
  assert.match(appSource, /Bearbeitungsmodus 🔓/);
  assert.match(appSource, /Lesemodus 🔒/);
  assert.match(appSource, /function monitorProjectRevision\(\)/);
  assert.match(appSource, /fetch\("\/api\/revision"\)/);
  assert.match(appSource, /setTimeout\(monitorProjectRevision,\s*5000\)/);
  assert.match(appSource, /pendingRevisionReload/);
  assert.match(appSource, /function hasOpenDialog\(\)/);
  assert.match(serverSource, /url\.pathname === "\/api\/revision"/);
  assert.match(serverSource, /async function refreshModel/);
  assert.match(serverSource, /publishAfterAssetOnlyNoAssets/);
  assert.match(serverSource, /Weitere Soundquelle suchen/);
  assert.match(serverSource, /Abgelehnter Sound wurde gesperrt/);
  assert.match(desktopLauncherSource, /WScript\.Shell/);
  assert.match(desktopLauncherSource, /electron\.cmd/);
  assert.match(desktopLauncherSource, /shell\.Run command,\s*0,\s*False/);
  assert.match(shortcutInstallerSource, /CreateShortcut/);
  assert.match(shortcutInstallerSource, /wscript\.exe/);
  assert.match(restoreStartSource, /Node\.js 18 oder neuer/);
  assert.match(restoreStartSource, /npm\.cmd install/);
  assert.match(restoreStartSource, /species:desktop:shortcut/);
  assert.match(restoreStartSource, /start-explorer\.vbs/);
  assert.match(nasBackupSource, /W:\\Website Datenbank Backup/);
  assert.match(nasBackupSource, /IUCN_Datenbank_\$\{timestamp\}_\$\{gitShort\}\.zip/);
  assert.match(nasBackupSource, /backup-manifest\.json/);
  assert.match(nasBackupSource, /MaxBackups = 10/);
  assert.match(nasBackupSource, /DryRun/);
  assert.match(nasBackupSource, /Progress/);
  assert.match(nasBackupSource, /BACKUP_PROGRESS/);
  assert.match(nasBackupSource, /yyyy-MM-dd_HHmmss/);
  assert.match(nasBackupSource, /species-explorer\/pipeline-asset-backups/);
  assert.match(packageSource, /backup:nas:dry-run/);
  assert.match(gitignoreSource, /species-explorer\/local-settings\.json/);
  assert.match(htmlSource, /data-backup-action="nas"/);
  assert.match(htmlSource, /NAS-Backup erstellen/);
  assert.match(htmlSource, /data-settings-action="backup-path"/);
  assert.match(htmlSource, /id="settings-dialog"/);
  assert.match(htmlSource, /Backup-Pfad einstellen/);
  assert.match(appSource, /function setupBackupSettings\(\)/);
  assert.match(appSource, /\/api\/settings/);
  assert.match(appSource, /\/api\/settings\/backup/);
  assert.match(appSource, /\/api\/backup\/preview/);
  assert.match(appSource, /\/api\/backup\/start/);
  assert.match(appSource, /\/api\/backup\/status/);
  assert.match(appSource, /Backup trotzdem erstellen/);
  assert.match(appSource, /backupStatusPresentation/);
  assert.match(cssSource, /\.database-status\.backup/);
  assert.match(serverSource, /async function previewNasBackup/);
  assert.match(serverSource, /local-settings\.json/);
  assert.match(serverSource, /async function saveBackupSettings/);
  assert.match(serverSource, /url\.pathname === "\/api\/settings"/);
  assert.match(serverSource, /url\.pathname === "\/api\/settings\/backup"/);
  assert.match(serverSource, /function startNasBackup/);
  assert.match(serverSource, /executeNasBackupRun/);
  assert.match(serverSource, /url\.pathname === "\/api\/backup\/status"/);
  assert.match(desktopMainSource, /getExplorerBackupStatus/);
  assert.match(serverLifecycleSource, /isBackupBlockingShutdown/);
  assert.match(packageSource, /species:desktop:shortcut/);
  assert.match(serverSource, /function createNewSpeciesPortraitPrompt\(payload\)/);
  assert.match(serverSource, /async function previewNewSpeciesPortrait\(payload\)/);
  assert.match(serverSource, /Git-Commit/);
  assert.match(serverSource, /\["push"\]/);
  assert.match(serverSource, /\/api\/pipeline\/assets\/review/);
  assert.match(serverSource, /\/api\/pipeline\/assets\/backup-file/);
  assert.match(serverSource, /pipeline-asset-backups/);
  assert.match(serverSource, /sendPipelineBackupFile/);
  assert.match(serverSource, /"map\.jpg",\s*"sound\.mp3",\s*"spectrogram\.webp"/);
  assert.match(serverSource, /soundRejectionKeyFromCredits/);
  assert.match(serverSource, /rejectedSoundSourceFromCredits/);
  assert.match(serverSource, /Karte abgelehnt und entfernt/);
  assert.match(serverSource, /sound\.rejectedSources|rejectedSources/);
  assert.match(serverSource, /preservedSoundRejections/);
  assert.match(serverSource, /rejectedSources: preservedSoundRejections/);
  assert.match(appSource, /async function refreshOpenSoundEditor/);
  assert.match(appSource, /await notifySilentPipelineContext\(status\)/);
  assert.match(appSource, /function versionedAssetUrl/);
  assert.match(appSource, /species\.assets\.spectrogram\?\.soundSha256/);
  assert.match(appSource, /assetReviewAwaitingRetry/);
  assert.match(appSource, /Gefundener Sound wurde abgelehnt und gemerkt\. Nächster Sound wird gesucht/);
  assert.match(appSource, /state\.finishAssetReviewWaiting/);
  assert.match(appSource, /form\.dataset\.closeOnly === "true"/);
  assert.match(cleanupSource, /cleanup-trash/);
  assert.match(serverSource, /assetCompositeHash/);
  assert.match(serverSource, /wasAssetSavedInCurrentPipelineLog/);
  assert.match(serverSource, /refreshedByPipeline/);
  assert.match(serverSource, /reviewMode:\s*plan\.mode/);
  assert.match(serverSource, /copyFileSync\(resolvedBackupPath, targetPath\)/);
  assert.match(serverSource, /synchronizeStoredManualMapDocumentation/);
  assert.match(serverSource, /typeof mapOverride\?\.manual === "boolean"/);
  assert.match(serverSource, /async function previewMapAsset\(id, payload\)/);
  assert.match(serverSource, /async function saveMapAsset\(id, payload\)/);
  assert.match(serverSource, /publishAssetChanges = false/);
  assert.match(serverSource, /rebuildReportAfterAssetSave = true/);
  assert.match(serverSource, /async function readPendingProjectChanges\(\)/);
  assert.match(serverSource, /const match = line\.match/);
  assert.match(serverSource, /path: \(match\?\.\[2\]/);
  assert.match(serverSource, /url\.pathname === "\/api\/pending-changes"/);
  assert.match(serverSource, /Transfer pending Explorer changes/);
  assert.match(serverSource, /async function publishMapAssetChanges\(species\)/);
  assert.match(serverSource, /async function previewSoundAsset\(id, payload\)/);
  assert.match(serverSource, /async function saveSoundAsset\(id, payload\)/);
  assert.match(serverSource, /async function rejectCurrentSoundAsset\(id\)/);
  assert.match(serverSource, /Reject sound source for/);
  assert.match(serverSource, /async function publishSoundAssetChanges\(species,/);
  assert.match(serverSource, /ASSET_BACKUP_RETENTION_COUNT = 1/);
  assert.match(serverSource, /ASSET_BACKUP_GLOBAL_BYTES = 500 \* 1024 \* 1024/);
  assert.match(serverSource, /async function writeManagedAssetBackup/);
  assert.match(serverSource, /async function restoreSpeciesAsset\(id, assetType\)/);
  assert.match(serverSource, /restoreSpeciesAsset\(id, "map"\)/);
  assert.match(serverSource, /"docs\/manual-map-overrides\.md"/);
  assert.match(updateSource, /isManualAsset\(safeName, "map"\)/);
  assert.match(updateSource, /isManualAsset\(safeGerman, "sound"\)/);
  assert.match(updateSource, /\{ force: true, allowManual: true, recordAssessment: false \}/);
  assert.match(updateSource, /function iucnMapHeaders\(url\)/);
  assert.match(updateSource, /headers\.Authorization = `Bearer \$\{TOKEN\}`/);
  assert.match(updateSource, /async function fetchJpegWithPowerShell\(url\)/);
  assert.match(updateSource, /IUCN_MAP_POWERSHELL_RETRY_ATTEMPTS = 3/);
  assert.match(updateSource, /Neuer Versuch folgt/);
  assert.match(updateSource, /IUCN_MAP_URL/);
  assert.match(updateSource, /Invoke-WebRequest -UseBasicParsing/);
  assert.match(updateSource, /function extractCachedIucnMapUrls\(text, cacheFile = ""\)/);
  assert.match(updateSource, /cached-individual-maps/);
  assert.match(updateSource, /\$\{BASE\}\/assessments\/\$\{assessmentId\}\/distribution_map\/jpg/);
  assert.match(updateSource, /fetchValidJpeg\(directUrl, \{ cacheFile \}\)/);
  assert.match(updateSource, /args\.mode === "manual-maps"/);
  assert.match(updateSource, /args\.mode === "nc-sounds"/);
  assert.match(updateSource, /rejectedSoundKeys/);
  assert.match(updateSource, /isRejectedSoundCandidate/);
  assert.match(updateSource, /rejectionKey/);
  assert.match(updateSource, /forceAlternativeSearch[\s\S]*fallbackStages[\s\S]*Weitere Soundalternative gefunden/);
  assert.match(updateSource, /--species=/);
  assert.equal(assetOverrides.assets.Blaukehlchen.map.manual, true);
  assert.match(appSource, /function setupSpeciesDelete\(species\)/);
  assert.match(appSource, /\/delete\/preview/);
  assert.match(appSource, /\/delete\/save/);
  assert.match(appSource, /class="delete-assets-now"/);
  assert.match(appSource, /deleteAssets/);
  assert.match(appSource, /function releaseDetailMedia\(\)/);
  assert.match(appSource, /releaseDetailMedia\(\)/);
  assert.match(serverSource, /requiresAssetDeletion:\s*!species\.inInput/);
  assert.match(serverSource, /Art ist bereits aus der Eingabeliste entfernt/);
  assert.match(appSource, /Taxonomie ist gesperrt\./);
  assert.match(appSource, /URL-Slug entsperren\?/);
  assert.match(appSource, /Ja, entsperren/);
  assert.match(appSource, /function parseManualMeasurement/);
  assert.match(appSource, /function composeManualSexedMeasurement/);
  assert.match(appSource, /class="edit-fields new-species-fields manual-species-fields"/);
  assert.match(appSource, /data-measurement="\$\{escapeHtml\(kind\)\}"/);
  assert.match(appSource, /form\.elements\.sizeSexed/);
  assert.match(appSource, /form\.elements\.weightSexed/);
  assert.match(appSource, /name="lifeExpectancyUnit"/);
  assert.match(serverSource, /function formatTaxonomyName\(value\)/);
  assert.match(updateSource, /function normalizeTaxonomyFields\(entry\)/);
  assert.doesNotMatch(appSource, /Taxonomie und Name sind in Phase 7\.4 gesperrt\./);
  assert.match(appSource, /class="map-edit-section"/);
  assert.match(appSource, /class="map-auto-search-button"/);
  assert.match(appSource, /openPipelinePreview\("manual-maps"/);
  assert.match(appSource, /silent: true/);
  assert.match(appSource, /fetch\("\/api\/pending-changes"\)/);
  assert.match(appSource, /refreshExplorerModelOnly\(\{ reload: true \}\)/);
  assert.match(serverSource, /async function fetchMapPreviewSourceWithPowerShell\(source\)/);
  assert.match(serverSource, /MAP_SOURCE_POWERSHELL_RETRY_ATTEMPTS = 3/);
  assert.match(appSource, /direkter Karten-JPEG-Link/);
  assert.match(appSource, /class="map-preview-button"/);
  assert.match(appSource, /class="map-save-button"/);
  assert.match(appSource, /Karte wird lokal gesichert und ersetzt/);
  assert.match(cssSource, /\.map-compare-grid/);
  assert.match(
    cssSource,
    /\.map-compare-frame img\s*\{[^}]*width:\s*100% !important[^}]*height:\s*auto !important[^}]*object-fit:\s*contain !important/s,
  );
  assert.match(cssSource, /\.new-species-manual-map/);
  assert.match(appSource, /class="sound-edit-section"/);
  assert.match(appSource, /class="sound-auto-search-button"/);
  assert.match(appSource, /openPipelinePreview\("nc-sounds"/);
  assert.match(appSource, /const releaseCurrentSoundAudio = async/);
  assert.match(appSource, /async function releaseAllAudioElements\(\)/);
  assert.match(appSource, /await releaseAllAudioElements\(\)/);
  assert.match(appSource, /class="sound-preview-button"/);
  assert.match(appSource, /class="sound-save-button"/);
  assert.match(appSource, /Sound, Credits und Spektrogramm lokal gesichert und ersetzt/);
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
  assert.doesNotMatch(
    appSource,
    /<div class="section-actions detail-actions edit-only"[\s\S]*edit-species-open[\s\S]*delete-species-open/,
  );
  assert.match(appSource, /function inlineEditButton\(section\)/);
  assert.match(appSource, /function inlineDeleteButton\(assetType, label\)/);
  assert.match(appSource, /function inlineRestoreButton\(assetType, backup = null\)/);
  assert.match(appSource, /function sectionActions\(editSection = ""/);
  assert.match(appSource, /\/assets\/\$\{assetType\}\/restore/);
  assert.match(cssSource, /\.inline-restore-open/);
  assert.match(appSource, /inlineEditButton\("manual"\)/);
  assert.match(appSource, /species\.inInput \? "map" : ""/);
  assert.match(appSource, /sectionActions\([\s\S]*"sound"[\s\S]*"Soundpaket löschen"/);
  assert.match(appSource, /sectionActions\(species\.inInput \? "portrait" : ""/);
  assert.match(appSource, /Bisheriges Artporträt beibehalten/);
  assert.match(appSource, /class="refresh-species-open"/);
  assert.match(appSource, /Art aktualisieren/);
  assert.match(appSource, /openPipelinePreview\("all",/);
  assert.match(appSource, /Automatische Aktualisierung für/);
  assert.match(appSource, /silent:\s*true/);
  assert.match(appSource, /function formatPendingFileStatus/);
  assert.match(appSource, /showQuickConfirm/);
  assert.match(cssSource, /body:not\(\.edit-mode\) \.header-edit-slot:not\(\.database-status\)/);
  assert.match(appSource, /\/api\/pending-changes/);
  assert.match(appSource, /beforeunload/);
  assert.match(appSource, /data-edit-section="\$\{escapeHtml\(section\)\}"/);
  assert.match(appSource, /dialog\.dataset\.activeSection = activeSection/);
  assert.match(cssSource, /\.edit-dialog\[data-active-section="map"\]\s+\.manual-edit-section/);
  assert.match(appSource, /const saveAndStartPipeline = async \(\) =>/);
  assert.match(appSource, /state\.newSpeciesPipelineActive = true/);
  assert.match(appSource, /\/api\/pipeline\/preview/);
  assert.match(appSource, /\/api\/pipeline\/start/);
  assert.match(appSource, /\/api\/pipeline\/assets\/review/);
  assert.match(appSource, /data-new-species-map-decision="reject"/);
  assert.match(appSource, /data-new-species-sound-decision="reject"/);
  assert.doesNotMatch(
    appSource,
    /await state\.openPipelinePreview\?\.\("missing",\s*\{\s*targetSlugs:\s*\[savedSpeciesId\],\s*autoStart:\s*true\s*\}\)/,
  );
  assert.match(htmlSource, /Lesemodus 🔒\s*<\/button>/);
  assert.match(htmlSource, /id="new-species-button"/);
  assert.match(htmlSource, /id="new-species-dialog"/);
  assert.match(htmlSource, /new-species-steps/);
  assert.match(htmlSource, /Allgemeine Daten/);
  assert.match(htmlSource, /Artportrait/);
  assert.match(htmlSource, /Karte/);
  assert.match(htmlSource, /Sound &amp; Abschluss|Sound & Abschluss/);
  assert.match(htmlSource, /name="german"/);
  assert.match(htmlSource, /name="scientificName"/);
  assert.match(htmlSource, /name="sizeSexed"/);
  assert.match(htmlSource, /name="sizeMale"/);
  assert.match(htmlSource, /name="sizeFemale"/);
  assert.match(htmlSource, /name="weightSexed"/);
  assert.match(htmlSource, /name="weightMale"/);
  assert.match(htmlSource, /name="weightFemale"/);
  assert.match(htmlSource, /placeholder="Turdus Merula"/);
  assert.match(htmlSource, /placeholder="Amsel"/);
  assert.match(htmlSource, /placeholder="23,5-29"/);
  assert.match(htmlSource, /name="sizeUnit"/);
  assert.match(htmlSource, /placeholder="80-110"/);
  assert.match(htmlSource, /name="weightUnit"/);
  assert.match(htmlSource, /placeholder="3"/);
  assert.match(htmlSource, /name="lifeExpectancyUnit"/);
  assert.doesNotMatch(htmlSource, /name="genus"/);
  assert.doesNotMatch(htmlSource, /name="species"/);
  assert.match(htmlSource, /class="new-species-json"/);
  assert.match(htmlSource, /class="new-species-step new-species-portrait"/);
  assert.match(htmlSource, /new-species-portrait-file-input/);
  assert.match(htmlSource, /Portrait-Prompt erstellen/);
  assert.match(htmlSource, /Artportrait überspringen/);
  assert.match(htmlSource, /Karte,\s*Sound und Spektrogramm geprüft oder erstellt/);
  assert.match(htmlSource, /new-species-map-review/);
  assert.match(htmlSource, /new-species-sound-review/);
  assert.match(appSource, /Manuell per URL einfügen/);
  assert.match(appSource, /new-species-map-source-input/);
  assert.match(appSource, /pipelineRunId:\s*inlineRunId/);
  assert.match(serverSource, /allowDuringCurrentReview/);
  assert.doesNotMatch(htmlSource, /SPECIES_LIST\.JSON/);
  assert.doesNotMatch(htmlSource, /species-info\.json/);
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
  assert.match(htmlSource, /Lesemodus 🔒/);
  assert.match(htmlSource, /id="pipeline-menu-button"/);
  assert.match(htmlSource, /Datenbank aktualisieren/);
  assert.match(appSource, /Änderungen übertragen/);
  assert.match(appSource, /openPreview\("transfer", \{ transfer: true \}\)/);
  assert.match(htmlSource, /id="pipeline-mode-choice"/);
  assert.match(htmlSource, /Datenbank-Aktionen/);
  assert.match(htmlSource, /Daten aktualisieren/);
  assert.match(htmlSource, /Backup und Einstellungen/);
  assert.match(htmlSource, /<details class="action-group action-group-danger">/);
  assert.match(htmlSource, /Neue\/Unvollständige Arten aktualisieren/);
  assert.match(htmlSource, /Manuelle und fehlende Karten erneut bei IUCN prüfen/);
  assert.match(htmlSource, /id="asset-review-dialog"/);
  assert.match(htmlSource, /id="asset-review-list"/);
  assert.match(htmlSource, /id="asset-review-map-lightbox"/);
  assert.match(htmlSource, /id="asset-review-map-lightbox-image"/);
  assert.match(appSource, /value="reject"/);
  assert.match(appSource, /Gefundenen Sound ablehnen und weiter suchen/);
  assert.match(appSource, /decision:\s*formData\.get/);
  assert.match(appSource, /audio\.removeAttribute\("src"\)/);
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
  assert.match(cssSource, /html,\s*body\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(cssSource, /\.app-shell\s*\{[^}]*height:\s*100vh[^}]*grid-template-rows:\s*auto\s+auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(cssSource, /\.workspace\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(cssSource, /\.detail-panel\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(cssSource, /\.species-list\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.doesNotMatch(cssSource, /\.species-list\s*\{[^}]*max-height:/s);
  assert.match(
    cssSource,
    /\.species-panel\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s,
  );
  assert.doesNotMatch(cssSource, /\.species-panel\s*\{[^}]*align-self:\s*start/s);
  assert.match(cssSource, /\.species-item\s*\{[^}]*height:\s*61px/s);
  assert.doesNotMatch(appSource, /\["Kartenpflege"/);
  assert.doesNotMatch(appSource, /\["Daten abgerufen", species\.iucn\.fetchedAt\]/);
  assert.match(cssSource, /\.detail-media-layout\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(cssSource, /\.detail-panel\s*\{[^}]*container-name:\s*species-detail/s);
  assert.match(cssSource, /@container species-detail \(max-width:\s*1320px\)[\s\S]*?\.detail-media-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(cssSource, /@media \(max-height:\s*780px\)[\s\S]*?\.validation-card small\s*\{[^}]*display:\s*none/s);
  assert.match(cssSource, /\.sex-specific-value\s*\{[^}]*display:\s*grid/s);
  assert.match(cssSource, /\.iucn-heading-status,\s*\.iucn-heading-trend\s*\{/);
  assert.match(cssSource, /\.species-list-indicator\s*\{/);
  assert.match(cssSource, /\.iucn-data-value\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(cssSource, /\.section-heading > \.inline-edit-open\s*\{[^}]*margin-right:\s*10px/s);
  assert.doesNotMatch(cssSource, /\.detail-side-stack\s*\{/);
  assert.doesNotMatch(appSource, /detail-side-stack/);
  assert.match(
    cssSource,
    /\.detail-media-layout > \.map-panel,[\s\S]*?\.detail-media-layout > \.species-image-panel\s*\{[^}]*flex-direction:\s*column/s,
  );
  assert.match(
    cssSource,
    /\.detail-media-layout > \.map-panel,[\s\S]*?\.detail-media-layout > \.species-image-panel\s*\{[^}]*container-name:\s*detail-media-card[^}]*container-type:\s*inline-size/s,
  );
  assert.match(
    cssSource,
    /@container detail-media-card \(max-width:\s*600px\)[\s\S]*?\.section-heading-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(cssSource, /\.species-image-panel\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(
    cssSource,
    /\.species-portrait-image\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*100%[^}]*object-fit:\s*contain/s,
  );
  assert.doesNotMatch(appSource, /function syncSpeciesPanelHeight\(\)/);
  assert.doesNotMatch(appSource, /lastDetailBlock\.getBoundingClientRect\(\)\.bottom/);
  assert.doesNotMatch(appSource, /elements\.speciesPanel\.style\.height = `\$\{targetHeight\}px`/);
  assert.doesNotMatch(appSource, /window\.addEventListener\("resize", syncSpeciesPanelHeight\)/);
  assert.match(cssSource, /\.audio-visual\s*\{[^}]*height:\s*clamp\(64px,\s*4\.5vw,\s*84px\)/s);
  assert.match(appSource, /JPEG- oder PNG-Datei bis 20 MB oder direkter Karten-JPEG-Link/);
  assert.match(appSource, /accept="\.jpg,\.jpeg,\.png,image\/jpeg,image\/png"/);
  assert.match(cssSource, /\.new-species-fields\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /\.new-species-fields\s*\{[^}]*align-items:\s*start/s);
  assert.match(cssSource, /\.new-species-steps\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.match(cssSource, /\.edit-fields label\[hidden\]\s*\{[^}]*display:\s*none !important/s);
  assert.match(cssSource, /\.new-species-json\s*\{[^}]*white-space:\s*pre-wrap/s);
  assert.match(cssSource, /\.asset-header-actions\s*\{/);
  assert.match(cssSource, /body:not\(\.edit-mode\) \.edit-only\s*\{[^}]*display:\s*none/s);
  assert.match(cssSource, /\.pipeline-mode-choice\s*\{[^}]*display:\s*grid/s);
  assert.match(cssSource, /\.action-group\s*\{/);
  assert.match(cssSource, /\.action-group-buttons\s*\{[^}]*display:\s*grid/s);
  assert.match(cssSource, /\.header-action\s*\{[^}]*border:/s);
  assert.match(cssSource, /\.mode-toggle\s*\{[^}]*width:\s*174px/s);
  assert.match(cssSource, /\.mode-toggle\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(cssSource, /\.database-status\.outdated\s*\{[^}]*background:\s*#a32929/s);
  assert.match(cssSource, /\.database-status\.current\s*\{[^}]*background:\s*#1f6b4f/s);
  assert.match(cssSource, /\.asset-review-item\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /\.asset-review-item\[data-type="map"\]\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /\.asset-review-map-compare\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(cssSource, /\.map-lightbox\s*\{[^}]*scrollbar-gutter:\s*stable/s);
  assert.match(cssSource, /\.map-lightbox-close\s*\{[^}]*right:\s*max\(54px,/s);
  assert.match(cssSource, /\.asset-review-map-trigger\s*\{[^}]*cursor:\s*zoom-in/s);
  assert.match(cssSource, /\.detail-actions\s*\{/);
  assert.match(cssSource, /\.delete-assets-option\s*\{/);
  assert.match(cssSource, /\.delete-assets-option input\s*\{[^}]*width:\s*16px/s);
  assert.match(serverSource, /mode:\s*preview\.mode/);
  assert.match(serverSource, /function safeGraphicsPath\(pathname, repoRoot\)/);
  assert.match(cssSource, /button\.danger/);
  assert.match(appSource, /window\.scrollTo\(scrollPosition\)/);
  assert.doesNotMatch(appSource, /renderSpeciesList\(\);\s*renderDetail\(species\)/);
});
