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

  const foundationResponse = await fetch(`${baseUrl}/app-foundation.js`);
  assert.equal(foundationResponse.status, 200);
  assert.match(foundationResponse.headers.get("content-type"), /javascript/);
  assert.match(await foundationResponse.text(), /createExplorerApiClient/);

  const presentationResponse = await fetch(`${baseUrl}/app-presentation.js`);
  assert.equal(presentationResponse.status, 200);
  assert.match(presentationResponse.headers.get("content-type"), /javascript/);
  assert.match(await presentationResponse.text(), /formatSexSpecificDataValue/);

  const measurementsResponse = await fetch(`${baseUrl}/app-measurements.js`);
  assert.equal(measurementsResponse.status, 200);
  assert.match(measurementsResponse.headers.get("content-type"), /javascript/);
  assert.match(await measurementsResponse.text(), /parseManualMeasurement/);

  const editorFilesResponse = await fetch(`${baseUrl}/app-editor-files.js`);
  assert.equal(editorFilesResponse.status, 200);
  assert.match(editorFilesResponse.headers.get("content-type"), /javascript/);
  assert.match(await editorFilesResponse.text(), /waitForAudioMetadata/);

  const dialogsResponse = await fetch(`${baseUrl}/app-dialogs.js`);
  assert.equal(dialogsResponse.status, 200);
  assert.match(dialogsResponse.headers.get("content-type"), /javascript/);
  assert.match(await dialogsResponse.text(), /createDialogController/);

  const confirmationResponse = await fetch(`${baseUrl}/app-confirmation.js`);
  assert.equal(confirmationResponse.status, 200);
  assert.match(confirmationResponse.headers.get("content-type"), /javascript/);
  assert.match(await confirmationResponse.text(), /createQuickConfirm/);

  const formFeedbackResponse = await fetch(`${baseUrl}/app-form-feedback.js`);
  assert.equal(formFeedbackResponse.status, 200);
  assert.match(formFeedbackResponse.headers.get("content-type"), /javascript/);
  assert.match(await formFeedbackResponse.text(), /createFieldFeedbackController/);

  const newSpeciesFormResponse = await fetch(`${baseUrl}/app-new-species-form.js`);
  assert.equal(newSpeciesFormResponse.status, 200);
  assert.match(newSpeciesFormResponse.headers.get("content-type"), /javascript/);
  assert.match(await newSpeciesFormResponse.text(), /createNewSpeciesFormModel/);

  const editorFormResponse = await fetch(`${baseUrl}/app-editor-form.js`);
  assert.equal(editorFormResponse.status, 200);
  assert.match(editorFormResponse.headers.get("content-type"), /javascript/);
  assert.match(await editorFormResponse.text(), /createEditorFormModel/);

  const settingsResponse = await fetch(`${baseUrl}/app-settings.js`);
  assert.equal(settingsResponse.status, 200);
  assert.match(settingsResponse.headers.get("content-type"), /javascript/);
  assert.match(await settingsResponse.text(), /createBackupSettingsController/);

  const mediaResponse = await fetch(`${baseUrl}/app-media.js`);
  assert.equal(mediaResponse.status, 200);
  assert.match(mediaResponse.headers.get("content-type"), /javascript/);
  assert.match(await mediaResponse.text(), /createMediaRenderers/);

  const detailMediaResponse = await fetch(`${baseUrl}/app-detail-media.js`);
  assert.equal(detailMediaResponse.status, 200);
  assert.match(detailMediaResponse.headers.get("content-type"), /javascript/);
  assert.match(await detailMediaResponse.text(), /createDetailMediaController/);

  const selectionResponse = await fetch(`${baseUrl}/app-selection.js`);
  assert.equal(selectionResponse.status, 200);
  assert.match(selectionResponse.headers.get("content-type"), /javascript/);
  assert.match(await selectionResponse.text(), /createSpeciesSelectionController/);

  const assetReviewResponse = await fetch(`${baseUrl}/app-asset-review.js`);
  assert.equal(assetReviewResponse.status, 200);
  assert.match(assetReviewResponse.headers.get("content-type"), /javascript/);
  assert.match(await assetReviewResponse.text(), /createAssetReviewRenderer/);

  const assetReviewWorkflowResponse = await fetch(`${baseUrl}/app-asset-review-workflow.js`);
  assert.equal(assetReviewWorkflowResponse.status, 200);
  assert.match(assetReviewWorkflowResponse.headers.get("content-type"), /javascript/);
  assert.match(await assetReviewWorkflowResponse.text(), /setupAssetReviewWorkflow/);

  const pipelineResponse = await fetch(`${baseUrl}/app-pipeline.js`);
  assert.equal(pipelineResponse.status, 200);
  assert.match(pipelineResponse.headers.get("content-type"), /javascript/);
  assert.match(await pipelineResponse.text(), /createPipelineStatusPresenters/);

  const dashboardResponse = await fetch(`${baseUrl}/app-dashboard.js`);
  assert.equal(dashboardResponse.status, 200);
  assert.match(dashboardResponse.headers.get("content-type"), /javascript/);
  assert.match(await dashboardResponse.text(), /createDashboardController/);

  const lifecycleResponse = await fetch(`${baseUrl}/app-lifecycle.js`);
  assert.equal(lifecycleResponse.status, 200);
  assert.match(lifecycleResponse.headers.get("content-type"), /javascript/);
  assert.match(await lifecycleResponse.text(), /createExplorerLifecycleController/);

  const speciesActionsResponse = await fetch(`${baseUrl}/app-species-actions.js`);
  assert.equal(speciesActionsResponse.status, 200);
  assert.match(speciesActionsResponse.headers.get("content-type"), /javascript/);
  assert.match(await speciesActionsResponse.text(), /createSpeciesActionsController/);

  const assetMaintenanceResponse = await fetch(`${baseUrl}/app-asset-maintenance.js`);
  assert.equal(assetMaintenanceResponse.status, 200);
  assert.match(assetMaintenanceResponse.headers.get("content-type"), /javascript/);
  assert.match(await assetMaintenanceResponse.text(), /createAssetMaintenanceController/);

  const workflowModules = [
    ["app-new-species-workflow.js", "createNewSpeciesWorkflowController"],
    ["app-editor-map.js", "createMapEditorController"],
    ["app-editor-sound.js", "createSoundEditorController"],
    ["app-editor-portrait.js", "createPortraitEditorController"],
    ["app-editor-general.js", "createGeneralEditorController"],
    ["app-species-editor.js", "createSpeciesEditorController"],
    ["app-detail-view.js", "createDetailViewRenderer"],
    ["app-backup-workflow.js", "createBackupWorkflowController"],
    ["app-pipeline-workflow.js", "createPipelineWorkflowController"],
  ];
  for (const [fileName, factoryName] of workflowModules) {
    const response = await fetch(`${baseUrl}/${fileName}`);
    assert.equal(response.status, 200, fileName);
    assert.match(response.headers.get("content-type"), /javascript/, fileName);
    assert.match(await response.text(), new RegExp(factoryName), fileName);
  }

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
  assert.equal(writeResponse.status, 415);
  assert.match(await writeResponse.text(), /application\/json/);
});

test("Schreibende API verlangt lokale Sitzung, gleiche Origin und Bestätigungstoken", async (context) => {
  const repoRoot = await createEditableFixture();
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(repoRoot, "species-assets", "Amsel", "portrait.webp"), createTestWebp(7)),
    writeFile(join(repoRoot, "species-assets", "Amsel", "portrait.json"), "{}\n"),
  ]);
  const app = await createProtectedExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const wrongHostStatus = await requestStatusWithHost(baseUrl, "/api/summary", `localhost:${address.port}`);
  assert.equal(wrongHostStatus, 421);

  const crossSiteSession = await fetch(`${baseUrl}/api/session`, {
    headers: { Origin: "https://example.com", "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(crossSiteSession.status, 403);

  const sessionResponse = await fetch(`${baseUrl}/api/session`);
  assert.equal(sessionResponse.status, 200);
  const { token } = await sessionResponse.json();
  assert.ok(token);

  const noSession = await fetch(`${baseUrl}/api/settings/backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ reset: true }),
  });
  assert.equal(noSession.status, 403);

  const crossOrigin = await fetch(`${baseUrl}/api/settings/backup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.com",
      "Sec-Fetch-Site": "cross-site",
      "X-Species-Explorer-Session": token,
    },
    body: JSON.stringify({ reset: true }),
  });
  assert.equal(crossOrigin.status, 403);

  const invalidContentType = await fetch(`${baseUrl}/api/settings/backup`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Origin: baseUrl,
      "X-Species-Explorer-Session": token,
    },
    body: JSON.stringify({ reset: true }),
  });
  assert.equal(invalidContentType.status, 415);

  const secureHeaders = {
    "Content-Type": "application/json",
    Origin: baseUrl,
    "Sec-Fetch-Site": "same-origin",
    "X-Species-Explorer-Session": token,
  };
  const validWrite = await fetch(`${baseUrl}/api/settings/backup`, {
    method: "POST",
    headers: secureHeaders,
    body: JSON.stringify({ reset: true }),
  });
  assert.equal(validWrite.status, 200);

  const directDelete = await fetch(`${baseUrl}/api/species/turdusmerula/assets/portrait/delete`, {
    method: "POST",
    headers: secureHeaders,
    body: "{}",
  });
  assert.equal(directDelete.status, 409);

  const deletePreviewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/assets/portrait/delete-preview`, {
    method: "POST",
    headers: secureHeaders,
    body: "{}",
  });
  assert.equal(deletePreviewResponse.status, 200);
  const deletePreview = await deletePreviewResponse.json();
  const confirmedDelete = await fetch(`${baseUrl}/api/species/turdusmerula/assets/portrait/delete`, {
    method: "POST",
    headers: secureHeaders,
    body: JSON.stringify({ token: deletePreview.token }),
  });
  assert.equal(confirmedDelete.status, 200);
  const reusedDelete = await fetch(`${baseUrl}/api/species/turdusmerula/assets/portrait/delete`, {
    method: "POST",
    headers: secureHeaders,
    body: JSON.stringify({ token: deletePreview.token }),
  });
  assert.equal(reusedDelete.status, 409);
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
  assert.equal(
    saveResponse.status,
    200,
    saveResponse.status === 200 ? "" : await saveResponse.clone().text(),
  );
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
  assert.equal(
    previewResponse.status,
    200,
    previewResponse.status === 200 ? "" : await previewResponse.clone().text(),
  );
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

test("Explorer-Modell zählt automatisch übernommene Karten nicht als manuell", async (context) => {
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

  const sourceUrl = "http://127.0.0.1:8123/iucn-map.jpg?Authorization=test";
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
  assert.equal(linkPreviewResponse.status, 400);
  const linkPreview = await linkPreviewResponse.json();
  assert.match(linkPreview.details.join(" "), /Private, lokale|nicht erlaubt/);

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
  assert.equal(
    saveResponse.status,
    200,
    saveResponse.status === 200 ? "" : await saveResponse.clone().text(),
  );
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
  assert.equal(
    previewResponse.status,
    200,
    previewResponse.status === 200 ? "" : await previewResponse.clone().text(),
  );
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
