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
