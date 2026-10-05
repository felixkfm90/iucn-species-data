import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { createPipelineController } from "./pipeline-controller.mjs";
import { createEditableFixture } from "./server-test-fixtures.mjs";
import { createSpeciesCreationSessionStore } from "./species-creation-session.mjs";
import { mkdir } from "node:fs/promises";

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

function fixtureController(root, runtime, overrides = {}) {
  return createPipelineController({ repoRoot: root,
    speciesListPath: join(root, "species_list.json"), assetOverridesPath: join(root, "species-assets-overrides.json"),
    assessmentIdsPath: join(root, "lastSavedAssessmentId.json"), manualMapOverridesPath: join(root, "docs", "manual-map-overrides.md"),
    pipelineLogDir: join(root, "logs"), pipelineAssetBackupRoot: join(root, "backups"), pendingAssetReviewPath: join(root, "review.json"),
    previewTokens: new Map(), previewTokenTtlMs: 600000, pipelineLogLineLimit: 500, runtime,
    getModel: () => ({ species: [] }), refreshModel: async () => {}, cleanupPreviewTokens() {},
    readPendingProjectChanges: async () => ({ files: [], count: 0 }), pendingAssetSpeciesFromFiles: () => [],
    isPipelineActive: () => false, isBackupActive: () => false, isAssetWriteActive: () => false,
    hashText: (text) => createHash("sha256").update(text).digest("hex"), compactTimestamp: () => "fixture",
    readJson: async (file) => JSON.parse(await readFile(file, "utf8")), ...overrides,
  });
}

test("Verspätete Soundprüfung einer gelöschten Art schreibt weder Pflegeeintrag noch Git", async (t) => {
  const root = await createEditableFixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = { state: { status: "awaiting-review", runId: "late-review", mode: "missing", log: [],
    targets: [{ slug: "turdusmerula", safeName: "Amsel" }], reviewAssets: [{ type: "sound", safeName: "Amsel", url: "/old-sound.mp3" }] },
    process: null, assetSnapshot: new Map() };
  const commands = [];
  const controller = fixtureController(root, runtime, { spawnProcess: (...args) => { commands.push(args); throw new Error("No worker may start"); } });
  const oldData = await readFile(join(root, "speciesData.json"), "utf8");
  const oldSound = await readFile(join(root, "species-assets", "Amsel", "sound.mp3"));
  await writeFile(join(root, "species_list.json"), "[]\n");
  await assert.rejects(controller.savePipelineAssetReview({ runId: "late-review",
    choices: [{ safeName: "Amsel", type: "sound", decision: "manual" }] }), (error) => error.statusCode === 409 && /gelöscht/.test(error.message));
  await assert.rejects(readFile(join(root, "species-assets-overrides.json")), { code: "ENOENT" });
  assert.equal(await readFile(join(root, "speciesData.json"), "utf8"), oldData);
  assert.deepEqual(await readFile(join(root, "species-assets", "Amsel", "sound.mp3")), oldSound);
  assert.deepEqual(commands, []);
  assert.equal(runtime.assetReviewSaving, false);
});

test("Beendeter Artanlage-Auftrag kann eine gleichnamige Neuanlage weder markieren noch deren Sound entfernen", async (t) => {
  const root = await createEditableFixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createSpeciesCreationSessionStore({ repoRoot: root });
  const original = await readFile(join(root, "species_list.json"), "utf8");
  const entry = { german: "Testvogel", genus: "Testus", species: "avis" };
  const derived = { slug: "testusavis", safeName: "Testvogel" };
  const backupPath = join(root, "species-explorer", "backups", "creation.json");
  const oldId = await store.begin({ entry, derived, backupPath });
  await writeFile(join(root, "species_list.json"), JSON.stringify([...JSON.parse(original), entry]));
  await store.checkpoint(oldId);
  const runtime = { state: { status: "awaiting-review", runId: "old-creation-review", mode: "missing", log: [],
    creationId: oldId, guidedSpeciesCreation: true, targets: [{ slug: derived.slug, safeName: derived.safeName }],
    reviewAssets: [{ type: "sound", safeName: derived.safeName, url: "/old-sound.mp3" }] },
    process: null, assetSnapshot: new Map() };
  await store.detach(oldId);
  await writeFile(join(root, "species_list.json"), original);
  const newId = await store.begin({ entry, derived, backupPath });
  await writeFile(join(root, "species_list.json"), JSON.stringify([...JSON.parse(original), entry]));
  await mkdir(join(root, "species-assets", derived.safeName));
  const soundPath = join(root, "species-assets", derived.safeName, "sound.mp3");
  await writeFile(soundPath, "new creation's own sound");
  const overridesPath = join(root, "species-assets-overrides.json");
  await writeFile(overridesPath, JSON.stringify({ version: 1, assets: { Testvogel: { sound: { manual: false } } } }));
  await store.checkpoint(newId);
  const files = ["species_list.json", "speciesData.json", "fehlende_elemente_report.json", "species-assets-overrides.json"];
  const before = await Promise.all(files.map((name) => readFile(join(root, name))));
  const commands = [];
  const controller = fixtureController(root, runtime, { creationSessions: store,
    spawnProcess: (...args) => { commands.push(args); throw new Error("No worker may start"); } });
  for (const decision of ["manual", "reject"]) {
    await assert.rejects(controller.savePipelineAssetReview({ runId: runtime.state.runId,
      choices: [{ safeName: derived.safeName, type: "sound", decision }] }),
    (error) => error.statusCode === 409 && /nicht mehr aktiv/.test(error.message));
  }
  assert.deepEqual(await Promise.all(files.map((name) => readFile(join(root, name)))), before);
  assert.equal(await readFile(soundPath, "utf8"), "new creation's own sound");
  await store.assertCurrent(newId, derived.slug);
  assert.deepEqual(commands, []);
  assert.equal(runtime.assetReviewSaving, false);
});

test("Eigener Spektrogramm-Worker belegt sein Generator-Metadatendelta für die vollständige Rücknahme", async (t) => {
  const root = await createEditableFixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createSpeciesCreationSessionStore({ repoRoot: root });
  const original = await readFile(join(root, "species_list.json"), "utf8");
  const entry = { german: "Testvogel", genus: "Testus", species: "avis" };
  const backupPath = join(root, "species-explorer", "backups", "creation.json");
  const creationId = await store.begin({ entry, derived: { slug: "testusavis", safeName: "Testvogel" }, backupPath });
  await writeFile(join(root, "species_list.json"), JSON.stringify([...JSON.parse(original), entry]));
  await store.checkpoint(creationId);
  const oldTokens = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN];
  process.env.IUCN_TOKEN = "fixture-iucn"; process.env.XENO_TOKEN = "fixture-sound";
  t.after(() => ["IUCN_TOKEN", "XENO_TOKEN"].forEach((key, i) => { if (oldTokens[i] === undefined) delete process.env[key]; else process.env[key] = oldTokens[i]; }));
  const runtime = { state: { status: "idle", log: [] }, process: null, assetSnapshot: new Map() }, commands = [];
  let resolveReview; const reviewed = new Promise((resolve) => { resolveReview = resolve; });
  const controller = fixtureController(root, runtime, { creationSessions: store,
    getModel: () => ({ species: [{ id: "testusavis", safeName: "Testvogel" }] }),
    refreshModel: async () => { if (runtime.state.status === "awaiting-review") resolveReview(); },
    spawnProcess(command, args) {
      assert.notEqual(command, "git"); commands.push([command, ...args]);
      const worker = new EventEmitter(); worker.stdout = new EventEmitter(); worker.stderr = new EventEmitter();
      setImmediate(() => { void (async () => {
        const assets = join(root, "species-assets", "Testvogel");
        if (args.includes("--mode=missing")) {
          await mkdir(assets); await writeFile(join(assets, "sound.mp3"), "own automatic sound");
          await writeFile(join(assets, "credits.json"), JSON.stringify({ source: "Fixture", license: "https://creativecommons.org/licenses/by/4.0/" }));
        } else if (args[0] === join(root, "scripts", "generate-spectrograms.mjs")) {
          await writeFile(join(assets, "spectrogram.webp"), "own automatic spectrogram");
          await writeFile(join(root, "species-assets-overrides.json"), JSON.stringify({ version: 1,
            spectrogramGenerator: { version: 1, width: 1600 }, assets: { Testvogel: { spectrogram: { stale: false } } } }));
          worker.stdout.emit("data", JSON.stringify({ counts: { generated: 1 }, hashRegistry: { changed: true, updated: 1 } }));
        }
        worker.emit("close", 0);
      })().catch((error) => worker.emit("error", error)); });
      return worker;
    },
  });
  const preview = await controller.previewPipeline({ mode: "missing", targetSlugs: ["testusavis"] });
  await controller.startPipeline({ token: preview.token, guidedSpeciesCreation: true, creationId });
  await reviewed;
  await store.assertCurrent(creationId, "testusavis");
  await store.abort(creationId);
  assert.equal(await readFile(join(root, "species_list.json"), "utf8"), original);
  await assert.rejects(readFile(join(root, "species-assets-overrides.json")), { code: "ENOENT" });
  await assert.rejects(readFile(join(root, "species-assets", "Testvogel", "sound.mp3")), { code: "ENOENT" });
  assert.equal(commands.length, 3);
});

test("Abbruch während eigenem Worker wartet dessen Ende und entfernt Auftrag ohne weitere Worker oder Git", async (t) => {
  const root = await createEditableFixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createSpeciesCreationSessionStore({ repoRoot: root });
  const originalInput = await readFile(join(root, "species_list.json"), "utf8");
  const entry = { german: "Testvogel", genus: "Testus", species: "avis", english: "Test bird" };
  const backupPath = join(root, "species-explorer", "backups", "creation.json");
  const creationId = await store.begin({ entry, derived: { slug: "testusavis", safeName: "Testvogel" }, backupPath });
  await mkdir(join(root, "species-explorer", "backups"), { recursive: true });
  await writeFile(backupPath, originalInput);
  await writeFile(join(root, "species_list.json"), JSON.stringify([...JSON.parse(originalInput), entry]));
  await store.checkpoint(creationId);
  const originalTokens = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN];
  process.env.IUCN_TOKEN = "fixture-iucn"; process.env.XENO_TOKEN = "fixture-sound";
  t.after(() => ["IUCN_TOKEN", "XENO_TOKEN"].forEach((key, i) => { if (originalTokens[i] === undefined) delete process.env[key]; else process.env[key] = originalTokens[i]; }));
  const runtime = { state: { status: "idle", log: [] }, process: null, assetSnapshot: new Map() }, commands = [];
  let worker, resolveAborted;
  const aborted = new Promise((resolve) => { resolveAborted = resolve; });
  const controller = fixtureController(root, runtime, {
    creationSessions: store,
    abortCreation: async (id) => { await store.abort(id); runtime.state.status = "aborted"; resolveAborted(); },
    spawnProcess(command, args) {
      commands.push([command, ...args]);
      worker = new EventEmitter(); worker.stdout = new EventEmitter(); worker.stderr = new EventEmitter(); return worker;
    },
  });
  const preview = await controller.previewPipeline({ mode: "missing", targetSlugs: ["testusavis"] });
  await controller.startPipeline({ token: preview.token, guidedSpeciesCreation: true, creationId });
  assert.equal(runtime.state.status, "running");
  await store.requestAbort(creationId);
  assert.equal(JSON.parse(await readFile(join(root, "species_list.json"), "utf8")).length, 2, "active worker still owns the files");
  const ownAsset = join(root, "species-assets", "Testvogel"); await mkdir(ownAsset); await writeFile(join(ownAsset, "map.jpg"), "worker result");
  worker.emit("close", 0);
  await aborted;
  assert.equal(runtime.state.status, "aborted");
  assert.equal(commands.length, 1);
  assert.equal(commands.some(([command]) => command === "git"), false);
  assert.equal(await readFile(join(root, "species_list.json"), "utf8"), originalInput);
  await assert.rejects(readFile(join(ownAsset, "map.jpg")), { code: "ENOENT" });
  await assert.rejects(controller.savePipelineAssetReview({ runId: runtime.state.runId, choices: [] }), /keine neuen Assets/);
});

test("Git-Änderung während angefordertem Worker-Abbruch endet geschützt und erhält Review-Sicherungen", async (t) => {
  const root = await createEditableFixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createSpeciesCreationSessionStore({ repoRoot: root });
  const input = await readFile(join(root, "species_list.json"), "utf8"), entry = { german: "Testvogel", genus: "Testus", species: "avis" };
  const backupPath = join(root, "species-explorer", "backups", "own.json");
  const creationId = await store.begin({ entry, derived: { slug: "testusavis", safeName: "Testvogel" }, backupPath });
  await mkdir(join(root, "species-explorer", "backups"), { recursive: true }); await writeFile(backupPath, input);
  await writeFile(join(root, "species_list.json"), JSON.stringify([...JSON.parse(input), entry])); await store.checkpoint(creationId);
  const originalTokens = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN];
  process.env.IUCN_TOKEN = "fixture-iucn"; process.env.XENO_TOKEN = "fixture-sound";
  t.after(() => ["IUCN_TOKEN", "XENO_TOKEN"].forEach((key, i) => { if (originalTokens[i] === undefined) delete process.env[key]; else process.env[key] = originalTokens[i]; }));
  const runtime = { state: { status: "idle", log: [] }, process: null, assetSnapshot: new Map() }, commands = [];
  let worker, resolveStopped; const stopped = new Promise((resolve) => { resolveStopped = resolve; });
  const controller = fixtureController(root, runtime, {
    creationSessions: store, abortCreation: (id) => store.abort(id),
    refreshModel: async () => { if (runtime.state.status === "failed") resolveStopped(); },
    spawnProcess(command, args) { commands.push([command, ...args]); worker = new EventEmitter(); worker.stdout = new EventEmitter(); worker.stderr = new EventEmitter(); return worker; },
  });
  const preview = await controller.previewPipeline({ mode: "missing", targetSlugs: ["testusavis"] });
  await controller.startPipeline({ token: preview.token, creationId, guidedSpeciesCreation: true });
  const reviewBackup = join(root, "backups", runtime.state.runId, "Testvogel", "map.jpg");
  await mkdir(join(root, "backups", runtime.state.runId, "Testvogel"), { recursive: true }); await writeFile(reviewBackup, "needed review recovery");
  await store.requestAbort(creationId);
  await mkdir(join(root, ".git")); await writeFile(join(root, ".git", "HEAD"), "changed head");
  worker.emit("close", 0); await stopped;
  assert.equal(runtime.state.status, "failed"); assert.match(runtime.state.error, /Abbruch wurde.*angehalten/);
  assert.equal(commands.length, 1); assert.equal(commands.some(([command]) => command === "git"), false);
  assert.equal(await readFile(reviewBackup, "utf8"), "needed review recovery");
  assert.equal(JSON.parse(await readFile(join(root, "species_list.json"), "utf8")).length, 2);
});
