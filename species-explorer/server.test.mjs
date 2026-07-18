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
