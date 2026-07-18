import assert from "node:assert/strict";
import fs, { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import test from "node:test";

import {
  createExplorerServer as createProtectedExplorerServer,
  isExplorerAlreadyReachable,
} from "./server.mjs";
import { buildExplorerModel } from "./explorer-model.mjs";
import {
  inspectJpeg,
  inspectMp3,
  inspectPng,
  inspectWebp,
} from "./media-assets.mjs";
import {
  createEditableFixture,
  createTestJpeg,
  createTestMp3,
  createTestPng,
  createTestWebp,
} from "./server-test-fixtures.mjs";
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

const createExplorerServer = (options = {}) => createProtectedExplorerServer({
  ...options,
  sessionProtection: false,
});

function requestStatusWithHost(baseUrl, pathname, hostHeader) {
  const target = new URL(pathname, baseUrl);
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "GET",
      headers: { Host: hostHeader },
    }, (response) => {
      response.resume();
      response.on("end", () => resolveRequest(response.statusCode));
    });
    request.on("error", rejectRequest);
    request.end();
  });
}



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
