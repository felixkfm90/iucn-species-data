import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { createPipelineController } from "./pipeline-controller.mjs";
import { createEditableFixture } from "./server-test-fixtures.mjs";

test("Artassistent hält ohne neue Medien vor der Veröffentlichung an und bindet die Fortsetzung", async (t) => {
  const root = await createEditableFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await rm(join(root, "species-assets", "Amsel", "map.jpg"));
  const soundPath = join(root, "species-assets", "Amsel", "sound.mp3");
  await rm(soundPath);
  const originalSpecies = await readFile(join(root, "species_list.json"));
  const overridesPath = join(root, "species-assets-overrides.json");
  const registry = { version: 1, assets: {
    Amsel: { map: { manual: true, reason: "Karte geschützt" }, sound: {
      manual: false, reason: "eigene Begründung", rejectedSources: [{ key: "xeno-canto:123" }],
    } },
    Rotaugenlaubfrosch: { sound: { manual: true, rejectedSources: [{ key: "xeno-canto:456" }] } },
  } };
  await writeFile(overridesPath, JSON.stringify(registry));
  const existingCredits = await readFile(join(root, "species-assets", "Amsel", "credits.json"));
  const existingSpectrogram = await readFile(join(root, "species-assets", "Amsel", "spectrogram.webp"));
  const originalTokens = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN];
  process.env.IUCN_TOKEN = "fixture-iucn"; process.env.XENO_TOKEN = "fixture-sound";
  t.after(() => { ["IUCN_TOKEN", "XENO_TOKEN"].forEach((key, i) => {
    if (originalTokens[i] === undefined) delete process.env[key]; else process.env[key] = originalTokens[i];
  }); });
  const runtime = { state: { status: "idle", log: [] }, process: null, assetSnapshot: new Map() };
  const commands = [], tokens = new Map();
  let resolveReview;
  const review = new Promise((resolve) => { resolveReview = resolve; });
  let resolveComplete;
  const complete = new Promise((resolve) => { resolveComplete = resolve; });
  const controller = createPipelineController({ repoRoot: root,
    speciesListPath: join(root, "species_list.json"), assetOverridesPath: join(root, "species-assets-overrides.json"),
    assessmentIdsPath: join(root, "lastSavedAssessmentId.json"), manualMapOverridesPath: join(root, "docs", "manual-map-overrides.md"),
    pipelineLogDir: join(root, "logs"), pipelineAssetBackupRoot: join(root, "backups"), pendingAssetReviewPath: join(root, "review.json"),
    previewTokens: tokens, previewTokenTtlMs: 600000, pipelineLogLineLimit: 500, runtime,
    getModel: () => ({ species: [{ safeName: "Amsel", id: "turdusmerula" }] }),
    refreshModel: async () => {
      if (runtime.state.status === "awaiting-review") resolveReview();
      if (runtime.state.status === "completed") resolveComplete();
    },
    cleanupPreviewTokens() {}, readPendingProjectChanges: async () => ({ files: [], count: 0 }),
    pendingAssetSpeciesFromFiles: () => [], isPipelineActive: () => false, isBackupActive: () => false, isAssetWriteActive: () => false,
    hashText: (text) => createHash("sha256").update(text).digest("hex"), compactTimestamp: () => "fixture",
    readJson: async (file) => JSON.parse(await readFile(file, "utf8")),
    spawnProcess(command, args) {
      commands.push([command, ...args]); assert.notEqual(command, "git");
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      setImmediate(() => child.emit("close", 0)); return child;
    },
  });
  const preview = await controller.previewPipeline({ mode: "missing", targetSlugs: ["turdusmerula"] });
  await controller.startPipeline({ token: preview.token, guidedSpeciesCreation: true });
  await review;
  assert.equal(runtime.state.status, "awaiting-review");
  assert.deepEqual(runtime.state.reviewAssets, []);
  assert.equal(runtime.state.guidedSpeciesCreation, true);
  assert.equal(runtime.state.error, "");
  assert.equal(commands.length, 3);
  const saved = JSON.parse(await readFile(join(root, "review.json"), "utf8"));
  assert.equal(saved.guidedSpeciesCreation, true);
  assert.equal(saved.targets[0].slug, "turdusmerula");
  await assert.rejects(controller.savePipelineAssetReview({ runId: "foreign", choices: [] }), /aktuellen Pipeline/);
  await assert.rejects(controller.startPipeline({ token: preview.token, guidedSpeciesCreation: true }), /bereits/);
  await assert.rejects(controller.savePipelineAssetReview({ runId: saved.runId, choices: [], retrySoundSearch: true }), /bestätigte/);
  const repeatedReview = new Promise((resolve) => { resolveReview = resolve; });
  await controller.savePipelineAssetReview({ runId: saved.runId, choices: [], retrySoundSearch: true, confirmed: true });
  await repeatedReview;
  assert.equal(runtime.state.status, "awaiting-review");
  assert.equal(runtime.state.runId, saved.runId);
  assert.equal(runtime.state.guidedSpeciesCreation, true);
  assert.deepEqual(runtime.state.reviewAssets, []);
  const afterRetry = JSON.parse(await readFile(overridesPath, "utf8"));
  assert.deepEqual(afterRetry.assets.Rotaugenlaubfrosch, registry.assets.Rotaugenlaubfrosch);
  assert.deepEqual(afterRetry.assets.Amsel.map, registry.assets.Amsel.map);
  assert.equal(afterRetry.assets.Amsel.sound.manual, false);
  assert.equal(afterRetry.assets.Amsel.sound.reason, "eigene Begründung");
  assert.equal(afterRetry.assets.Amsel.sound.rejectedSources, undefined);
  const soundCommands = commands.filter((args) => args.includes("--mode=nc-sounds"));
  assert.equal(soundCommands.length, 1);
  assert.ok(soundCommands[0].includes("--species=turdusmerula"));
  assert.deepEqual(await readFile(join(root, "species_list.json")), originalSpecies);
  assert.deepEqual(await readFile(join(root, "species-assets", "Amsel", "credits.json")), existingCredits);
  assert.deepEqual(await readFile(join(root, "species-assets", "Amsel", "spectrogram.webp")), existingSpectrogram);
  await assert.rejects(readFile(soundPath), { code: "ENOENT" });
  await controller.savePipelineAssetReview({ runId: saved.runId, choices: [] });
  await complete;
  assert.equal(runtime.state.status, "completed");
  assert.match(runtime.state.publicationPending, /Karte fehlt/);
  assert.equal(runtime.state.gitPublished, false);
  assert.equal(commands.some(([command]) => command === "git"), false);
});
