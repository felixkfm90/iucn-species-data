import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { createPipelineController } from "./pipeline-controller.mjs";
import { createEditableFixture, createTestMp3 } from "./server-test-fixtures.mjs";

async function setupReview(t, { reset = true, stopSearch = false, previouslyExisting = true } = {}) {
  const root = await createEditableFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const assets = join(root, "species-assets", "Amsel");
  const overrides = join(root, "species-assets-overrides.json");
  const previousSound = { manual: false, reason: "behalten", rejectedSources: [
    { key: "xeno-canto:123", source: "xeno-canto" }, { key: "xeno-canto:456", source: "xeno-canto" },
  ] };
  const registry = { version: 1, assets: {
    Amsel: { sound: previousSound, map: { manual: true, reason: "Karte geschützt" } },
    Rotaugenlaubfrosch: { sound: { manual: true, rejectedSources: [{ key: "xeno-canto:123" }] } },
  } };
  await writeFile(overrides, JSON.stringify(registry));
  const backupDir = join(root, "backups", "review-run", "Amsel");
  await mkdir(backupDir, { recursive: true });
  const backupFiles = {}, original = {};
  for (const name of ["sound.mp3", "credits.json", "spectrogram.webp"]) {
    if (previouslyExisting) {
      original[name] = await readFile(join(assets, name));
      backupFiles[name] = join(backupDir, name);
      await copyFile(join(assets, name), backupFiles[name]);
    } else await rm(join(assets, name));
  }
  const originalMap = await readFile(join(assets, "map.jpg"));
  await writeFile(join(assets, "sound.mp3"), createTestMp3(9));
  await writeFile(join(assets, "credits.json"), JSON.stringify({ source: "xeno-canto.org",
    url: "https://xeno-canto.org/999", license: "CC BY 4.0" }));
  const reviewAsset = { type: "sound", safeName: "Amsel", germanName: "Amsel", label: "Sound",
    url: "/assets/Amsel/sound.mp3?review=current", backupFiles, previouslyExisting };
  const previous = { exists: previouslyExisting, override: structuredClone(previousSound), backupFiles };
  const runtime = { process: null, assetSnapshot: new Map([["Amsel:sound", previous]]),
    state: { status: "awaiting-review", runId: "review-run", startedAt: new Date().toISOString(),
      mode: "missing", log: [], targets: [{ safeName: "Amsel", slug: "turdusmerula" }], reviewAssets: [reviewAsset] } };
  const commands = [];
  let finish, searchRegistry, restoredBytes, readBlock;
  const done = new Promise((resolve) => { finish = resolve; });
  const controller = createPipelineController({
    repoRoot: root, speciesListPath: join(root, "species_list.json"), assetOverridesPath: overrides,
    assessmentIdsPath: join(root, "lastSavedAssessmentId.json"), manualMapOverridesPath: join(root, "docs", "manual-map-overrides.md"),
    pipelineLogDir: join(root, "logs"), pipelineAssetBackupRoot: join(root, "backups"),
    pendingAssetReviewPath: join(root, "review.json"), previewTokens: new Map(), previewTokenTtlMs: 600000,
    pipelineLogLineLimit: 500, runtime, compactTimestamp: () => "test", cleanupPreviewTokens() {},
    getModel: () => ({ species: [{ safeName: "Amsel", id: "turdusmerula" }] }),
    refreshModel: async () => {
      if (runtime.state.status === "failed" || runtime.state.status === "awaiting-review") finish();
    },
    isPipelineActive: () => false, isBackupActive: () => false, isAssetWriteActive: () => false,
    hashText: (text) => createHash("sha256").update(text).digest("hex"),
    readJson: async (path) => { if (path === overrides) await readBlock; return JSON.parse(await readFile(path, "utf8")); },
    spawnProcess(command, args) {
      commands.push([command, ...args]);
      assert.notEqual(command, "git", "Die isolierte Prüfung darf nicht veröffentlichen");
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      setImmediate(async () => {
        try {
          if (args.includes("--mode=nc-sounds")) {
            searchRegistry = JSON.parse(await readFile(overrides, "utf8"));
            restoredBytes = {};
            for (const name of Object.keys(original)) restoredBytes[name] = await readFile(join(assets, name));
            if (!previouslyExisting) {
              await assert.rejects(readFile(join(assets, "sound.mp3")), { code: "ENOENT" });
              await assert.rejects(readFile(join(assets, "credits.json")), { code: "ENOENT" });
            }
            if (stopSearch) { child.emit("close", 1); return; }
            // Simulated provider: the earlier candidate is eligible only after clearing its rejection.
            const blocked = searchRegistry.assets.Amsel.sound.rejectedSources.map((entry) => entry.key);
            const next = blocked.includes("xeno-canto:123") ? 777 : 123;
            await writeFile(join(assets, "sound.mp3"), createTestMp3(7));
            await writeFile(join(assets, "credits.json"), JSON.stringify({ source: "xeno-canto.org",
              url: `https://xeno-canto.org/${next}`, license: "CC BY 4.0" }));
          }
          child.emit("close", 0);
        } catch (error) { child.emit("error", error); }
      });
      return child;
    },
  });
  const payload = { runId: "review-run", choices: [{ safeName: "Amsel", type: "sound", decision: "reject",
    ...(reset ? { resetSoundRejections: true, reviewUrl: reviewAsset.url } : {}) }] };
  return { controller, runtime, payload, overrides, root, assets, original, originalMap, previous, registry,
    commands, done, searchRegistry: () => searchRegistry, restoredBytes: () => restoredBytes,
    blockRead: (value) => { readBlock = value; } };
}

test("Laufende Soundprüfung: frühere Quellen freigeben, aktuelle sperren und nur diese Art erneut suchen", async (t) => {
  for (const { reset, previouslyExisting } of [
    { reset: true, previouslyExisting: true }, { reset: false, previouslyExisting: true },
    { reset: true, previouslyExisting: false },
  ]) {
    await t.test(`${reset ? "frühere freigeben" : "normale Ablehnung unverändert"}, vorherige Datei: ${previouslyExisting}`, async (t) => {
      const h = await setupReview(t, { reset, previouslyExisting });
      await h.controller.savePipelineAssetReview(h.payload);
      await h.done;
      assert.equal(h.runtime.state.status, "awaiting-review");
      const saved = h.searchRegistry();
      assert.deepEqual(saved.assets.Amsel.sound.rejectedSources.map((s) => s.key),
        reset ? ["xeno-canto:999"] : ["xeno-canto:123", "xeno-canto:456", "xeno-canto:999"]);
      assert.equal(saved.assets.Amsel.sound.reason, "behalten");
      assert.equal(saved.assets.Amsel.sound.manual, false);
      assert.deepEqual(saved.assets.Rotaugenlaubfrosch, h.registry.assets.Rotaugenlaubfrosch);
      assert.deepEqual(saved.assets.Amsel.map, h.registry.assets.Amsel.map);
      assert.deepEqual(await readFile(join(h.assets, "map.jpg")), h.originalMap);
      assert.deepEqual(h.restoredBytes(), h.original);
      assert.deepEqual(h.previous.override, h.registry.assets.Amsel.sound, "Ausgangssicherung nicht mutieren");
      assert.deepEqual(h.runtime.assetSnapshot.get("Amsel:sound").override, saved.assets.Amsel.sound,
        "Neue Ausgangssicherung übernimmt nur die noch gültigen Ablehnungen");
      const retried = h.commands.filter((cmd) => cmd.includes("--mode=nc-sounds"));
      assert.equal(retried.length, 1);
      assert.ok(retried[0].includes("--species=turdusmerula"));
      const next = JSON.parse(await readFile(join(h.assets, "credits.json"), "utf8"));
      assert.equal(next.url, `https://xeno-canto.org/${reset ? 123 : 777}`);
      if (reset) {
        await assert.rejects(h.controller.savePipelineAssetReview(h.payload), { statusCode: 409 },
          "Alte Rückfrage darf nicht den inzwischen angezeigten nächsten Sound ablehnen");
      }
      assert.equal(h.runtime.assetReviewSaving, false);
    });
  }
});

test("Soundprüfung: ungültige, doppelte und fehlerhafte Rücksetzungen verändern keine fremden Entscheidungen", async (t) => {
  const h = await setupReview(t, { stopSearch: true });
  const initial = await readFile(h.overrides, "utf8");
  for (const patch of [{ decision: "automatic" }, { resetSoundRejections: "yes" }, { reviewUrl: "alt" }]) {
    await assert.rejects(h.controller.savePipelineAssetReview({ ...h.payload,
      choices: [{ ...h.payload.choices[0], ...patch }] }));
    assert.equal(await readFile(h.overrides, "utf8"), initial);
    assert.equal(h.runtime.assetReviewSaving, false);
  }
  await writeFile(h.overrides, "{broken");
  await assert.rejects(h.controller.savePipelineAssetReview(h.payload), SyntaxError);
  assert.equal(await readFile(h.overrides, "utf8"), "{broken");
  assert.equal(h.runtime.assetReviewSaving, false);
  await writeFile(h.overrides, initial);
  let release;
  h.blockRead(new Promise((resolve) => { release = resolve; }));
  const saving = h.controller.savePipelineAssetReview(h.payload);
  await assert.rejects(h.controller.savePipelineAssetReview(h.payload), { statusCode: 409 });
  release();
  await saving; await h.done;
  assert.equal(h.runtime.state.status, "failed", "Suchfehler nach gespeicherter Rücksetzung bleibt sichtbar");
  assert.equal(h.runtime.assetReviewSaving, false);
  const saved = JSON.parse(await readFile(h.overrides, "utf8"));
  assert.deepEqual(saved.assets.Amsel.sound.rejectedSources.map((s) => s.key), ["xeno-canto:999"]);
  assert.deepEqual(saved.assets.Rotaugenlaubfrosch, h.registry.assets.Rotaugenlaubfrosch);
  await assert.rejects(h.controller.savePipelineAssetReview(h.payload), { statusCode: 409 });
});
