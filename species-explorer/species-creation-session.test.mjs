import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createSpeciesCreationSessionStore } from "./species-creation-session.mjs";
import { createExplorerServer } from "./server.mjs";
import { watch, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createPipelineController } from "./pipeline-controller.mjs";
import { createEditableFixture, createTestJpeg, createTestMp3, createTestPng, createTestWebp, registerFixtureCleanup } from "./server-test-fixtures.mjs";

const values = { german: "Testvogel", english: "Test Bird", scientificName: "Testus avis", size: "ca. 20 cm", weight: "ca. 50 g", lifeExpectancy: "ca. 5 Jahre" };
const entry = { german: "Testvogel", english: "Test Bird", genus: "Testus", species: "avis", size: "ca. 20 cm", weight: "ca. 50 g", life_expectancy: "ca. 5 Jahre" };
const derived = { slug: "testusavis", safeName: "Testvogel" };
async function fixture(t, { registryBaseline = null } = {}) {
  const root = await createEditableFixture();
  if (registryBaseline !== null) await writeFile(join(root, "species-assets-overrides.json"), registryBaseline);
  const servers = [];
  t.after(async () => { for (const server of servers) await server.close(); await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); });
  const store = createSpeciesCreationSessionStore({ repoRoot: root });
  const original = await readFile(join(root, "species_list.json"), "utf8");
  const backupPath = join(root, "species-explorer", "backups", "own.json");
  const id = await store.begin({ entry, derived, backupPath });
  await mkdir(join(root, "species-explorer", "backups"), { recursive: true });
  await writeFile(backupPath, original);
  await writeFile(join(root, "species_list.json"), `${JSON.stringify([...JSON.parse(original), entry], null, 2)}\n`);
  await store.checkpoint(id);
  return { root, store, id, original, backupPath, cleanupServer: (server) => servers.push(server) };
}

async function publicationFixture(t) {
  const f = await fixture(t), { root, store, id, original } = f;
  const git = (...args) => execFileSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const input = await readFile(join(root, "species_list.json"), "utf8");
  await writeFile(join(root, "species_list.json"), original);
  await writeFile(join(root, "lastSavedAssessmentId.json"), "{}");
  await writeFile(join(root, "species-assets-overrides.json"), JSON.stringify({ version: 1, assets: {} }));
  await writeFile(join(root, "docs", "project-status.md"), "Fixture status\n");
  const validWebp = Buffer.alloc(30); validWebp.write("RIFF"); validWebp.writeUInt32LE(22, 4);
  validWebp.write("WEBPVP8X", 8); validWebp.writeUInt32LE(10, 16);
  await writeFile(join(root, "species-assets", "Amsel", "map.jpg"), createTestJpeg(640, 480));
  for (const name of ["portrait.webp", "spectrogram.webp"]) await writeFile(join(root, "species-assets", "Amsel", name), validWebp);
  git("init", "--quiet", "-b", "main");
  git("config", "user.email", "creation-fixture@example.invalid"); git("config", "user.name", "Creation fixture");
  git("config", "core.autocrlf", "false"); git("config", "core.logAllRefUpdates", "true");
  const paths = ["species_list.json", "speciesData.json", "fehlende_elemente_report.json", "lastSavedAssessmentId.json",
    "species-assets-overrides.json", "docs/manual-map-overrides.md", "docs/project-status.md", "species-assets"];
  git("add", "--", ...paths); git("commit", "--quiet", "-m", "Initial fixture");
  const remote = join(root, "fixture-origin.git");
  git("init", "--quiet", "--bare", remote); git("remote", "add", "origin", remote);
  git("push", "--quiet", "-u", "origin", "main");
  await writeFile(join(root, "species_list.json"), input);
  const data = JSON.parse(await readFile(join(root, "speciesData.json"), "utf8"));
  data.push({ ...data[0], URLSlug: derived.slug, "Deutscher Name": entry.german, "Wissenschaftlicher Name": "Testus avis",
    "Englischer Name": entry.english, Größe: entry.size, Gewicht: entry.weight, Lebenserwartung: entry.life_expectancy,
    Genus: entry.genus, Species: entry.species });
  await writeFile(join(root, "speciesData.json"), JSON.stringify(data));
  const assets = join(root, "species-assets", derived.safeName); await mkdir(assets);
  await writeFile(join(assets, "map.jpg"), createTestJpeg(640, 480));
  await writeFile(join(assets, "sound.mp3"), createTestMp3(2));
  await writeFile(join(assets, "credits.json"), JSON.stringify({ source: "Fixture", license: "https://creativecommons.org/licenses/by/4.0/" }));
  for (const name of ["portrait.webp", "spectrogram.webp"]) await writeFile(join(assets, name), validWebp);
  await store.checkpoint(id);
  git("add", "--", ...paths); git("commit", "--quiet", "-m", "Add fixture species");
  return { ...f, git, paths, commitId: git("rev-parse", "HEAD") };
}

test("Erfolgreicher gebundener Push schließt Artauftrag; spätere Karten- und Soundpflege kann ihren Vorgänger zweimal ersetzen", async (t) => {
  const { root, store, id, git, cleanupServer, commitId } = await publicationFixture(t);
  const plan = await store.preparePublication({ runId: "publish-run" });
  assert.deepEqual(plan.preparedIds, [id]); assert.equal(plan.commitId, commitId);
  assert.deepEqual((await store.backupRetentionProtection()).safeNames, [derived.safeName]);
  await assert.rejects(store.confirmPublication(plan, { pushExitCode: 0 }), /Zielstand/);
  git("push", "--quiet", "origin", "main");
  assert.deepEqual((await store.confirmPublication(plan, { pushExitCode: 0 })).closedIds, [id]);
  assert.deepEqual((await store.confirmPublication(plan, { pushExitCode: 0 })).closedIds, [id], "Idempotente Abschlussquittung");
  assert.deepEqual(await store.list(), []); assert.equal(await store.findBySlug(derived.slug), null);
  assert.deepEqual((await store.backupRetentionProtection()).safeNames, []);
  const job = JSON.parse(await readFile(join(root, "species-explorer", "creation-sessions", `${id}.json`), "utf8"));
  assert.equal(job.status, "published"); assert.equal(job.baseline, undefined); assert.equal(job.baselineBackups, undefined);
  assert.equal(job.publication.commitId, commitId);
  for (const operation of [() => store.checkpoint(id), () => store.requestAbort(id), () => store.abort(id), () => store.assertCurrent(id, derived.slug), () => store.detach(id)]) {
    await assert.rejects(operation(), { statusCode: 409 });
  }
  const server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false, publishAssetChanges: false,
    rebuildReportAfterAssetSave: false, spectrogramRenderer: async ({ outputPath }) => {
      await writeFile(outputPath, createTestWebp(9)); return { outputBytes: createTestWebp(9).length };
    } });
  cleanupServer(server); const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
  const post = async (route, body) => { const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) }; };
  for (const type of ["map", "sound"]) {
    const name = type === "map" ? "map.jpg" : "sound.mp3";
    for (let choice = 1; choice <= 2; choice += 1) {
      const before = await readFile(join(root, "species-assets", derived.safeName, name));
      const media = type === "map" ? createTestJpeg(640 + choice, 480) : createTestMp3(choice + 4);
      const payload = type === "map" ? { originalName: name, imageBase64: media.toString("base64"), reason: "Spätere Kartenwahl", source: "https://example.com/karte" }
        : { originalName: name, audioBase64: media.toString("base64"), reason: "Spätere Soundwahl",
          credits: { recordist: "Fixture", source: "Testarchiv", url: "https://example.com/sound", license: "https://creativecommons.org/licenses/by/4.0/" } };
      const route = `/api/species/${derived.slug}/assets/${type}`;
      const preview = await post(`${route}/preview`, payload); assert.equal(preview.status, 200, JSON.stringify(preview));
      assert.equal((await post(`${route}/save`, { token: preview.token, creationId: id, publish: false })).status, 409, "Alte Artanlage-ID schreibt keine spätere Medienwahl");
      const saved = await post(`${route}/save`, { token: preview.token, publish: false });
      assert.equal(saved.status, 200, JSON.stringify(saved)); assert.equal(saved.saved, true);
      assert.deepEqual(await readFile(join(root, "species-assets", derived.safeName, name)), media);
      assert.deepEqual(await readFile(join(root, "species-explorer", "asset-backups", derived.safeName, type, name)), before);
    }
  }
});

test("Vor erfolgreichem Push erzeugte Karten- und Soundtokens bleiben ohne explizite Artanlage-ID terminal gesperrt", async (t) => {
  const { root, store, id, git, cleanupServer } = await publicationFixture(t);
  const server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false, publishAssetChanges: false,
    rebuildReportAfterAssetSave: false, spectrogramRenderer: async ({ outputPath }) => {
      await writeFile(outputPath, createTestWebp(11)); return { outputBytes: createTestWebp(11).length };
    } });
  cleanupServer(server); const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
  const post = async (route, body) => {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const previews = [];
  for (const type of ["map", "sound"]) {
    const name = type === "map" ? "map.jpg" : "sound.mp3";
    const media = type === "map" ? createTestJpeg(652, 480) : createTestMp3(8);
    const payload = type === "map" ? { originalName: name, imageBase64: media.toString("base64"), reason: "Vorherige Kartenwahl", source: "https://example.com/karte" }
      : { originalName: name, audioBase64: media.toString("base64"), reason: "Vorherige Soundwahl",
        credits: { recordist: "Fixture", source: "Testarchiv", url: "https://example.com/sound", license: "https://creativecommons.org/licenses/by/4.0/" } };
    const route = `/api/species/${derived.slug}/assets/${type}`;
    const before = await readFile(join(root, "species-assets", derived.safeName, name));
    const preview = await post(`${route}/preview`, payload); assert.equal(preview.status, 200, JSON.stringify(preview));
    previews.push({ name, media, payload, route, before, token: preview.token });
  }
  const publication = await store.preparePublication({ runId: "old-preview-push" });
  assert.deepEqual(publication.preparedIds, [id]);
  git("push", "--quiet", "origin", "main");
  assert.deepEqual((await store.confirmPublication(publication, { pushExitCode: 0 })).closedIds, [id]);
  // Both old tokens are checked before a fresh save changes shared registry bytes.
  for (const preview of previews) {
    const stale = await post(`${preview.route}/save`, { token: preview.token, publish: false });
    assert.equal(stale.status, 409, JSON.stringify(stale));
    assert.deepEqual(await readFile(join(root, "species-assets", derived.safeName, preview.name)), preview.before);
  }
  for (const preview of previews) {
    const fresh = await post(`${preview.route}/preview`, preview.payload); assert.equal(fresh.status, 200, JSON.stringify(fresh));
    const saved = await post(`${preview.route}/save`, { token: fresh.token, publish: false });
    assert.equal(saved.status, 200, JSON.stringify(saved)); assert.equal(saved.saved, true);
    assert.deepEqual(await readFile(join(root, "species-assets", derived.safeName, preview.name)), preview.media);
    assert.deepEqual(await readFile(join(root, "species-explorer", "asset-backups", derived.safeName,
      preview.name === "map.jpg" ? "map" : "sound", preview.name)), preview.before);
  }
  assert.deepEqual(await store.list(), []); assert.deepEqual((await store.backupRetentionProtection()).safeNames, []);
});

test("Fehlgeschlagener Push und bloßer publicationStarted-Altauftrag bleiben geschützt; No-op erzeugt keinen Abschluss", async (t) => {
  const { root, store, id } = await publicationFixture(t);
  const plan = await store.preparePublication({ runId: "failed-push" });
  await assert.rejects(store.confirmPublication(plan, { pushExitCode: 1 }), /nicht bestätigt/);
  assert.deepEqual((await createSpeciesCreationSessionStore({ repoRoot: root }).recoverPublications()).closedIds, []);
  assert.deepEqual((await store.backupRetentionProtection()).safeNames, [derived.safeName]);
  const path = join(root, "species-explorer", "creation-sessions", `${id}.json`);
  const job = JSON.parse(await readFile(path, "utf8")); delete job.publication; job.publicationStarted = true;
  await writeFile(path, JSON.stringify(job));
  assert.deepEqual((await store.preparePublication({ runId: "no-op", onlyPrepared: true })).preparedIds, []);
  assert.deepEqual((await store.recoverPublications()).closedIds, []);
  assert.deepEqual((await store.backupRetentionProtection()).safeNames, [derived.safeName]);
});

test("Neustart unmittelbar nach erfolgreichem Push schließt nur vorbereiteten, durch Git belegten Arttransfer; Pages-Fehler öffnet ihn nicht", async (t) => {
  const { root, store, id, git } = await publicationFixture(t);
  await store.preparePublication({ runId: "interrupted-after-push" });
  git("push", "--quiet", "origin", "main");
  // No application confirmation was written before the simulated shutdown.
  const reopened = createSpeciesCreationSessionStore({ repoRoot: root });
  assert.deepEqual((await reopened.recoverPublications()).closedIds, [id]);
  assert.deepEqual((await reopened.recoverPublications()).closedIds, []);
  const path = join(root, "species-explorer", "creation-sessions", `${id}.json`);
  const job = JSON.parse(await readFile(path, "utf8"));
  assert.equal(job.publication.recoveredFromPushLog, true);
  await writeFile(join(root, "pages-failed-fixture.json"), JSON.stringify({ status: "failed" }));
  assert.deepEqual(await reopened.list(), []); assert.deepEqual((await reopened.backupRetentionProtection()).safeNames, []);
  assert.equal(await readFile(path, "utf8"), `${JSON.stringify(job, null, 2)}\n`);
});

test("Geänderte eigene Medien oder falsch gebundene Quittung schließen Artauftrag nicht", async (t) => {
  const { root, store, id, git } = await publicationFixture(t);
  const plan = await store.preparePublication({ runId: "bound-push" });
  git("push", "--quiet", "origin", "main");
  await writeFile(join(root, "species-assets", derived.safeName, "sound.mp3"), createTestMp3(99));
  await assert.rejects(store.confirmPublication(plan, { pushExitCode: 0 }), /verändert/);
  const path = join(root, "species-explorer", "creation-sessions", `${id}.json`), job = JSON.parse(await readFile(path, "utf8"));
  job.publication.revision = "unbound"; await writeFile(path, JSON.stringify(job));
  await assert.rejects(store.recoverPublications(), /gültigen Transfernachweis/);
});

test("Realer Pipeline-Gitweg quittiert nur erfolgreichen Push und schützt bei Pushfehler", async (t) => {
  const variants = [{ name: "Erfolg", pushFails: false }, { name: "Pushfehler", pushFails: true },
    { name: "Pushfehler mit späterem separatem Commit", pushFails: true, laterCommit: true }];
  for (const { name, pushFails, laterCommit = false } of variants) await t.test(name, async (t) => {
    const { root, store, id } = await publicationFixture(t);
    const previousTokens = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN];
    process.env.IUCN_TOKEN = "fixture-iucn"; process.env.XENO_TOKEN = "fixture-sound";
    t.after(() => ["IUCN_TOKEN", "XENO_TOKEN"].forEach((key, i) => {
      if (previousTokens[i] === undefined) delete process.env[key]; else process.env[key] = previousTokens[i];
    }));
    const runtime = { state: { status: "idle", log: [] }, process: null, assetSnapshot: new Map() };
    let finish, blockPush = pushFails, pushCalls = 0; let finished = new Promise((resolve) => { finish = resolve; });
    const controller = createPipelineController({ repoRoot: root,
      speciesListPath: join(root, "species_list.json"), assetOverridesPath: join(root, "species-assets-overrides.json"),
      assessmentIdsPath: join(root, "lastSavedAssessmentId.json"), manualMapOverridesPath: join(root, "docs", "manual-map-overrides.md"),
      pipelineLogDir: join(root, "species-explorer", "logs"), pipelineAssetBackupRoot: join(root, "species-explorer", "pipeline-asset-backups"),
      pendingAssetReviewPath: join(root, "species-explorer", "pending-asset-review.json"),
      previewTokens: new Map(), previewTokenTtlMs: 600000, pipelineLogLineLimit: 500, runtime, creationSessions: store,
      getModel: () => ({ species: [{ id: derived.slug, safeName: derived.safeName }] }),
      refreshModel: async () => { if (["completed", "failed"].includes(runtime.state.status)) finish(); }, cleanupPreviewTokens() {},
      readPendingProjectChanges: async () => ({ files: [], count: 0 }), pendingAssetSpeciesFromFiles: () => [],
      isPipelineActive: () => false, isBackupActive: () => false, isAssetWriteActive: () => false,
      checkPublicationSources: () => ({ ok: true, message: "Isolierter Fixture-Quellstand" }),
      hashText: (text) => createHash("sha256").update(text).digest("hex"), compactTimestamp: () => "fixture",
      readJson: async (file) => JSON.parse(await readFile(file, "utf8")),
      spawnProcess(command, args, options) {
        if (command === "git" && args[0] === "push") pushCalls += 1;
        if (command === "git" && !(blockPush && args[0] === "push")) return spawn(command, args, options);
        const worker = new EventEmitter(); worker.stdout = new EventEmitter(); worker.stderr = new EventEmitter();
        setImmediate(() => { void (async () => {
          if (args[0] === join(root, "update.mjs")) {
            const file = join(root, "speciesData.json"), data = JSON.parse(await readFile(file, "utf8"));
            data.find((item) => item.URLSlug === derived.slug)["Daten abgerufen"] = "2026-10-07";
            await writeFile(file, JSON.stringify(data));
          }
          worker.emit("close", command === "git" ? 1 : 0);
        })().catch((error) => worker.emit("error", error)); });
        return worker;
      },
    });
    const plan = await controller.previewPipeline({ mode: "all", targetSlugs: [derived.slug] });
    await controller.startPipeline({ token: plan.token, creationId: id });
    await finished;
    assert.equal(runtime.state.status, pushFails ? "failed" : "completed", runtime.state.error);
    assert.equal(runtime.state.gitPublished, !pushFails);
    assert.deepEqual((await store.backupRetentionProtection()).safeNames, pushFails ? [derived.safeName] : []);
    assert.equal((await store.list()).length, pushFails ? 1 : 0);
    if (pushFails) {
      const jobPath = join(root, "species-explorer", "creation-sessions", `${id}.json`);
      const beforeJob = await readFile(jobPath, "utf8"), before = JSON.parse(beforeJob).publication.commitId;
      if (laterCommit) execFileSync("git", ["commit", "--quiet", "--allow-empty", "-m", "Separate legitimate fixture change"],
        { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      assert.equal((await controller.pendingChangesPayload()).hasPendingChanges, true, "Transfer ohne Dateidiff bleibt erreichbar");
      const retry = await controller.previewPipeline({ mode: "transfer" }); assert.equal(retry.hasWork, true);
      const pushesBeforeRetry = pushCalls;
      blockPush = false; finished = new Promise((resolve) => { finish = resolve; });
      await controller.startPipeline({ token: retry.token }); await finished;
      if (laterCommit) {
        assert.equal(runtime.state.status, "failed", runtime.state.error); assert.equal(runtime.state.gitPublished, false);
        assert.equal(runtime.state.gitNoChanges, false, "Ein angehaltener Transfer ist kein erfolgreicher No-op");
        assert.equal(pushCalls, pushesBeforeRetry, "Der andere Git-Stand wird nicht unter dem alten Transfernachweis gepusht");
        assert.notEqual(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), before);
        assert.equal(await readFile(jobPath, "utf8"), beforeJob, "Originaler Transfernachweis wird nicht neu gebunden");
        assert.equal((await store.list()).length, 1); assert.deepEqual((await store.backupRetentionProtection()).safeNames, [derived.safeName]);
      } else {
        assert.equal(runtime.state.status, "completed", runtime.state.error); assert.equal(runtime.state.gitPublished, true);
        assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), before, "Kein zweiter Commit");
        assert.deepEqual(await store.list(), []); assert.deepEqual((await store.backupRetentionProtection()).safeNames, []);
        assert.ok(runtime.state.log.some((line) => line.includes("Git-Push nachholen")));
      }
    }
  });
});

test("Persistierte eigene Artanlage mit Portrait wird nach Neustart exakt und doppelt sicher zurückgenommen", async (t) => {
  const root = await createEditableFixture();
  const cleanup = registerFixtureCleanup(t, root);
  const baseline = await readFile(join(root, "species_list.json"), "utf8");
  const renderer = async ({ outputPath }) => { await writeFile(outputPath, createTestWebp(3)); return { width: 1280, height: 1600 }; };
  let server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false, portraitRenderer: renderer });
  cleanup(server);
  let address = await server.listen();
  let base = `http://127.0.0.1:${address.port}`;
  const post = async (route, body = {}) => {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const preview = await post("/api/species/new/preview", { values });
  const portrait = await post("/api/species/new/portrait-preview", { token: preview.token,
    originalName: "Testvogel.png", imageBase64: createTestPng(1280, 1600).toString("base64") });
  const created = await post("/api/species/new/save", { token: preview.token });
  assert.equal(created.status, 200, JSON.stringify(created));
  assert.ok(created.creationId);
  const saved = await post(`/api/species/${derived.slug}/assets/portrait/save`, { token: portrait.token, publish: false, creationId: created.creationId });
  assert.equal(saved.status, 200, JSON.stringify(saved));
  await server.close();
  server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false, portraitRenderer: renderer });
  cleanup(server);
  address = await server.listen(); base = `http://127.0.0.1:${address.port}`;
  const sessions = await post("/api/species/new/sessions");
  assert.equal(sessions.sessions[0].id, created.creationId);
  assert.equal(sessions.sessions[0].canAbort, true);
  const aborted = await post("/api/species/new/abort", { creationId: created.creationId });
  assert.equal(aborted.status, 200, JSON.stringify(aborted));
  assert.equal(aborted.aborted, true);
  assert.equal(aborted.pipelineRequired, false);
  assert.equal(await readFile(join(root, "species_list.json"), "utf8"), baseline);
  await assert.rejects(readFile(join(root, "species-assets", "Testvogel", "portrait.webp")), { code: "ENOENT" });
  await assert.rejects(readFile(join(root, "species-assets-overrides.json")), { code: "ENOENT" });
  assert.deepEqual(await readdir(join(root, "species-explorer", "backups")), []);
  assert.equal((await post("/api/species/new/abort", { creationId: created.creationId })).alreadyAborted, true);
  assert.equal((await post("/api/species/new/sessions")).sessions.length, 0);
  assert.equal((await post(`/api/species/${derived.slug}/assets/portrait/save`, { token: portrait.token, publish: false })).status, 409);
  assert.equal((await post("/api/species/new/preview", { values })).status, 200, "same species can be tried again");
});

test("Rücknahme entfernt nur eigene Daten/Metadaten/Assets und erhält später hinzugekommene fremde Daten", async (t) => {
  const { root, store, id } = await fixture(t);
  const dataPath = join(root, "speciesData.json"), reportPath = join(root, "fehlende_elemente_report.json");
  const data = JSON.parse(await readFile(dataPath, "utf8"));
  data.push({ URLSlug: derived.slug, "Deutscher Name": entry.german });
  await writeFile(dataPath, JSON.stringify(data));
  await writeFile(join(root, "lastSavedAssessmentId.json"), JSON.stringify({ Amsel: 1, Testvogel: 22 }));
  await writeFile(join(root, "species-assets-overrides.json"), JSON.stringify({ version: 1, assets: { Testvogel: { sound: { manual: true } } } }));
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  report.generatedAt = "own-pipeline-date"; report.counts.totalSpecies = 2;
  report.missing.maps = [entry.german]; report.counts.missingMap = 1;
  await writeFile(reportPath, JSON.stringify(report));
  await mkdir(join(root, "species-assets", "Testvogel"));
  await writeFile(join(root, "species-assets", "Testvogel", "sound.mp3"), "own sound");
  await store.checkpoint(id, { runId: "own-run" });
  const currentInput = JSON.parse(await readFile(join(root, "species_list.json"), "utf8"));
  const foreign = { german: "Fremdvogel", genus: "Testus", species: "alien" };
  currentInput.push(foreign);
  await writeFile(join(root, "species_list.json"), JSON.stringify(currentInput));
  data[0].Gewicht = "spätere Änderung"; data.push({ URLSlug: "testusalien", "Deutscher Name": "Fremdvogel" });
  await writeFile(dataPath, JSON.stringify(data));
  await writeFile(join(root, "lastSavedAssessmentId.json"), JSON.stringify({ Amsel: 5, Testvogel: 22, Fremdvogel: 33 }));
  await writeFile(join(root, "species-assets-overrides.json"), JSON.stringify({ version: 1, assets: {
    Testvogel: { sound: { manual: true } }, Fremdvogel: { map: { manual: true } },
  } }));
  report.generatedAt = "foreign-pipeline-date"; report.counts.totalSpecies = 3;
  report.missing.maps.push("Fremdvogel"); report.counts.missingMap = 2;
  await writeFile(reportPath, JSON.stringify(report));
  const reopened = createSpeciesCreationSessionStore({ repoRoot: root });
  await reopened.abort(id);
  assert.deepEqual(JSON.parse(await readFile(join(root, "species_list.json"), "utf8")).at(-1), foreign);
  const remaining = JSON.parse(await readFile(dataPath, "utf8"));
  assert.equal(remaining[0].Gewicht, "spätere Änderung");
  assert.equal(remaining.at(-1).URLSlug, "testusalien");
  assert.equal(remaining.some((item) => item.URLSlug === derived.slug), false);
  assert.deepEqual(JSON.parse(await readFile(join(root, "lastSavedAssessmentId.json"), "utf8")), { Amsel: 5, Fremdvogel: 33 });
  assert.deepEqual(JSON.parse(await readFile(join(root, "species-assets-overrides.json"), "utf8")).assets, { Fremdvogel: { map: { manual: true } } });
  const finalReport = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(finalReport.generatedAt, "foreign-pipeline-date");
  assert.equal(finalReport.counts.totalSpecies, 2);
  assert.equal(finalReport.counts.missingMap, 1);
  assert.deepEqual(finalReport.missing.maps, ["Fremdvogel"]);
  await assert.rejects(readFile(join(root, "species-assets", "Testvogel", "sound.mp3")), { code: "ENOENT" });
});

test("Anderweitig geänderte eigene Datei oder Veröffentlichung schützt vor jeder Rücknahme", async (t) => {
  const { root, store, id } = await fixture(t);
  const assetPath = join(root, "species-assets", "Testvogel", "map.jpg");
  await mkdir(join(root, "species-assets", "Testvogel")); await writeFile(assetPath, "own map");
  await store.checkpoint(id);
  const inputBefore = await readFile(join(root, "species_list.json"), "utf8");
  await writeFile(assetPath, "foreign changed map");
  await assert.rejects(store.abort(id), /anderweitig geändert/);
  assert.equal(await readFile(join(root, "species_list.json"), "utf8"), inputBefore);
  assert.equal(await readFile(assetPath, "utf8"), "foreign changed map");
  await writeFile(assetPath, "own map");
  await store.checkpoint(id, { publicationStarted: true });
  await assert.rejects(store.requestAbort(id), /Veröffentlichung/);
  await assert.rejects(store.abort(id), /Veröffentlichung/);
});

test("Nur angelegter Herkunftsauftrag nimmt vorhandene Arten zurück; ungeschriebener Auftrag ist wiederholbar abbrechbar", async (t) => {
  const root = await createEditableFixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createSpeciesCreationSessionStore({ repoRoot: root });
  const backupPath = join(root, "species-explorer", "backups", "own.json");
  await assert.rejects(store.begin({ entry: { ...entry, german: "Amsel" }, derived: { slug: "turdusmerula", safeName: "Amsel" }, backupPath }), /Vorhandene/);
  const original = `${JSON.stringify(JSON.parse(await readFile(join(root, "species_list.json"), "utf8")), null, 3).replaceAll("\n", "\r\n")}\r\n`;
  await writeFile(join(root, "species_list.json"), original);
  const id = await store.begin({ entry, derived, backupPath });
  await assert.rejects(store.begin({ entry, derived, backupPath }), /bereits einen eigenen Artanlage-Auftrag/);
  await store.abort(id);
  assert.equal(await readFile(join(root, "species_list.json"), "utf8"), original);
  assert.equal((await store.abort(id)).alreadyAborted, true);
  const retry = await store.begin({ entry, derived, backupPath });
  assert.notEqual(retry, id);
  await store.abort(retry);
});

test("Eine separate Artlöschung entwertet den alten Auftrag vor einer gleichnamigen Neuanlage", async (t) => {
  const { root, store, id, cleanupServer } = await fixture(t);
  const pendingPath = join(root, "species-explorer", "pending-asset-review.json");
  await writeFile(pendingPath, JSON.stringify({ status: "awaiting-review", creationId: id, guidedSpeciesCreation: true,
    runId: "old-run", targets: [{ slug: derived.slug, safeName: derived.safeName }],
    reviewAssets: [{ safeName: derived.safeName, type: "sound", url: "/old-sound.mp3" }], log: [] }));
  const server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false });
  cleanupServer(server); const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
  const post = async (route, body) => { const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) }; };
  const deletion = await post(`/api/species/${derived.slug}/delete/preview`, {});
  const deleted = await post(`/api/species/${derived.slug}/delete/save`, { token: deletion.token, deleteAssets: true });
  assert.equal(deleted.status, 200, JSON.stringify(deleted));
  await assert.rejects(readFile(pendingPath), { code: "ENOENT" });
  const status = await fetch(`${base}/api/pipeline/status`).then((response) => response.json());
  assert.equal(status.status, "detached");
  const stale = await post("/api/pipeline/assets/review", { runId: "old-run",
    choices: [{ safeName: derived.safeName, type: "sound", decision: "manual" }] });
  assert.equal(stale.status, 409);
  const next = await post("/api/species/new/preview", { values });
  const created = await post("/api/species/new/save", { token: next.token });
  assert.equal(created.status, 200, JSON.stringify(created));
  assert.notEqual(created.creationId, id);
  await assert.rejects(store.abort(id), /separate Artlöschung/);
  assert.equal(JSON.parse(await readFile(join(root, "species_list.json"), "utf8")).filter((item) => item.german === entry.german).length, 1);
});

test("Soundreset und geführte Wiedersuche bleiben mit echtem Auftrag nach Neustart oder laufendem Worker abbrechbar", async (t) => {
  for (const abortDuringWorker of [false, true]) await t.test(abortDuringWorker ? "laufender Worker" : "leere Review nach Neustart", async (t) => {
    const { root, store, id, original, cleanupServer } = await fixture(t);
    const overridesPath = join(root, "species-assets-overrides.json");
    await writeFile(overridesPath, JSON.stringify({ version: 1, assets: { Testvogel: { sound: {
      manual: false, reason: "own decision", rejectedSources: [{ key: "xeno-canto:123" }],
    } } } }));
    const dataPath = join(root, "speciesData.json");
    const data = JSON.parse(await readFile(dataPath, "utf8"));
    data.push({ ...data[0], URLSlug: derived.slug, "Deutscher Name": entry.german, "Wissenschaftlicher Name": "Testus avis" });
    await writeFile(dataPath, JSON.stringify(data));
    await store.checkpoint(id);
    const oldTokens = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN];
    process.env.IUCN_TOKEN = "fixture-iucn"; process.env.XENO_TOKEN = "fixture-sound";
    t.after(() => ["IUCN_TOKEN", "XENO_TOKEN"].forEach((key, i) => { if (oldTokens[i] === undefined) delete process.env[key]; else process.env[key] = oldTokens[i]; }));
    const commands = [];
    let worker;
    const pipelineSpawnProcess = (command, args) => {
      assert.notEqual(command, "git"); commands.push([command, ...args]);
      worker = new EventEmitter(); worker.stdout = new EventEmitter(); worker.stderr = new EventEmitter();
      if (!abortDuringWorker) setImmediate(() => worker.emit("close", 0));
      return worker;
    };
    let server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false, pipelineSpawnProcess });
    cleanupServer(server); let address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
    const post = async (route, body = {}) => {
      const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, ...(await response.json()) };
    };
    const pipelineStatus = () => fetch(`${base}/api/pipeline/status`).then((response) => response.json());
    const waitStatus = async (expected) => {
      for (let i = 0; i < 150; i += 1) {
        const status = await pipelineStatus(); if (status.status === expected) return status;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail(`Expected pipeline status ${expected}: ${JSON.stringify(await pipelineStatus())}`);
    };
    const preview = await post(`/api/species/${derived.slug}/assets/sound/rejections-preview`);
    const reset = await post(`/api/species/${derived.slug}/assets/sound/rejections-reset`, {
      token: preview.token, confirmed: true, ...(!abortDuringWorker ? { creationId: id } : {}),
    });
    assert.equal(reset.status, 200, JSON.stringify(reset));
    assert.equal(reset.cleared, 1);
    await store.assertCurrent(id, derived.slug);
    const plan = await post("/api/pipeline/preview", { mode: "nc-sounds", targetSlugs: [derived.slug] });
    assert.equal(plan.hasWork, true, JSON.stringify(plan));
    const started = await post("/api/pipeline/start", { token: plan.token, creationId: id, guidedSpeciesCreation: true });
    assert.equal(started.status, "running", JSON.stringify(started));
    assert.equal(started.creationId, id);
    assert.equal(started.guidedSpeciesCreation, true);
    if (!abortDuringWorker) {
      const review = await waitStatus("awaiting-review");
      assert.deepEqual(review.reviewAssets, []);
      await store.assertCurrent(id, derived.slug);
      await server.close();
      server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false, pipelineSpawnProcess });
      cleanupServer(server); address = await server.listen(); base = `http://127.0.0.1:${address.port}`;
      const reopened = await pipelineStatus();
      assert.equal(reopened.status, "awaiting-review"); assert.equal(reopened.creationId, id);
      assert.equal(reopened.runId, review.runId);
      assert.equal((await post("/api/species/new/sessions")).sessions[0].canAbort, true);
    }
    const requested = await post("/api/species/new/abort", { creationId: id });
    assert.equal(requested.status, 200, JSON.stringify(requested));
    if (abortDuringWorker) { assert.equal(requested.pending, true); worker.emit("close", 0); }
    else assert.equal(requested.aborted, true);
    await waitStatus("aborted");
    assert.equal(await readFile(join(root, "species_list.json"), "utf8"), original);
    await assert.rejects(readFile(overridesPath), { code: "ENOENT" });
    assert.equal((await post("/api/species/new/abort", { creationId: id })).alreadyAborted, true);
    assert.equal(commands.length, 1);
    assert.ok(commands[0].includes("--mode=nc-sounds"));
    assert.ok(commands[0].includes(`--species=${derived.slug}`));
    assert.equal((await post("/api/species/new/preview", { values })).status, 200);
  });
});

test("Neustart nach unterbrochener separater Löschung gibt alte Medienprüfung und neue Artanlage frei", async (t) => {
  const { root, store, id, original, cleanupServer } = await fixture(t);
  const pendingPath = join(root, "species-explorer", "pending-asset-review.json");
  await writeFile(pendingPath, JSON.stringify({ status: "awaiting-review", creationId: id, runId: "old-run",
    guidedSpeciesCreation: true, targets: [{ slug: derived.slug, safeName: derived.safeName }], reviewAssets: [], log: [] }));
  await writeFile(join(root, "species_list.json"), original);
  await store.detach(id); // The process stops before its pending-review removal.
  const server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false });
  cleanupServer(server); const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
  const status = await fetch(`${base}/api/pipeline/status`).then((response) => response.json());
  assert.equal(status.status, "detached"); assert.deepEqual(status.reviewAssets, []);
  await assert.rejects(readFile(pendingPath), { code: "ENOENT" });
  const post = async (route, body = {}) => { const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) }; };
  const preview = await post("/api/species/new/preview", { values });
  assert.equal(preview.status, 200, JSON.stringify(preview));
  const created = await post("/api/species/new/save", { token: preview.token });
  assert.equal(created.status, 200, JSON.stringify(created)); assert.notEqual(created.creationId, id);
});

test("Echte Soundspeicherung, Ablehnung, Reset und Wiedersuche nehmen nur eigene Generator-Metadaten zurück", async (t) => {
  for (const kind of ["new-registry", "existing-generator", "foreign-generator"]) await t.test(kind, async (t) => {
    const baselineRegistry = kind === "new-registry" ? null : `${JSON.stringify({ version: 1, spectrogramGenerator: { version: 77 },
      assets: { Amsel: { sound: { manual: true, reason: "baseline" } } } }, null, 3)}\r\n`;
    const { root, store, id, cleanupServer } = await fixture(t, { registryBaseline: baselineRegistry });
    const dataPath = join(root, "speciesData.json");
    const baselineData = await readFile(dataPath, "utf8"), data = JSON.parse(baselineData);
    data.push({ ...data[0], URLSlug: derived.slug, "Deutscher Name": entry.german, "Wissenschaftlicher Name": "Testus avis" });
    await writeFile(dataPath, JSON.stringify(data)); await store.checkpoint(id);
    const oldTokens = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN];
    process.env.IUCN_TOKEN = "fixture-iucn"; process.env.XENO_TOKEN = "fixture-sound";
    t.after(() => ["IUCN_TOKEN", "XENO_TOKEN"].forEach((key, i) => { if (oldTokens[i] === undefined) delete process.env[key]; else process.env[key] = oldTokens[i]; }));
    const commands = [];
    const server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false, rebuildReportAfterAssetSave: false,
      spectrogramRenderer: async ({ outputPath }) => { await writeFile(outputPath, createTestWebp(3)); return { outputBytes: 20 }; },
      pipelineSpawnProcess(command, args) {
        assert.notEqual(command, "git"); commands.push([command, ...args]);
        const worker = new EventEmitter(); worker.stdout = new EventEmitter(); worker.stderr = new EventEmitter();
        setImmediate(() => worker.emit("close", 0)); return worker;
      },
    });
    cleanupServer(server); const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
    const post = async (route, body = {}) => { const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, ...(await response.json()) }; };
    const soundBase = `/api/species/${derived.slug}/assets/sound`;
    const preview = await post(`${soundBase}/preview`, { originalName: "fixture.mp3", audioBase64: createTestMp3(7).toString("base64"), reason: "Own sound decision",
      credits: { recordist: "Fixture", source: "xeno-canto.org", url: "https://xeno-canto.org/123", license: "https://creativecommons.org/licenses/by/4.0/" } });
    assert.equal(preview.status, 200, JSON.stringify(preview));
    const saved = await post(`${soundBase}/save`, { token: preview.token, creationId: id });
    assert.equal(saved.status, 200, JSON.stringify(saved));
    const registryPath = join(root, "species-assets-overrides.json");
    assert.equal(JSON.parse(await readFile(registryPath, "utf8")).spectrogramGenerator.version, 1);
    const rejected = await post(`${soundBase}/reject`, { creationId: id });
    assert.equal(rejected.status, 200, JSON.stringify(rejected));
    const resetPreview = await post(`${soundBase}/rejections-preview`);
    assert.equal(resetPreview.count, 1);
    assert.equal((await post(`${soundBase}/rejections-reset`, { token: resetPreview.token, confirmed: true, creationId: id })).status, 200);
    const plan = await post("/api/pipeline/preview", { mode: "nc-sounds", targetSlugs: [derived.slug] });
    assert.equal((await post("/api/pipeline/start", { token: plan.token, guidedSpeciesCreation: true, creationId: id })).status, "running");
    let status;
    for (let i = 0; i < 150; i += 1) {
      status = await fetch(`${base}/api/pipeline/status`).then((response) => response.json());
      if (status.status === "awaiting-review") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(status.status, "awaiting-review");
    if (kind === "foreign-generator") {
      const registry = JSON.parse(await readFile(registryPath, "utf8"));
      registry.spectrogramGenerator = { version: 999, reason: "foreign change" };
      await writeFile(registryPath, JSON.stringify(registry));
    }
    const aborted = await post("/api/species/new/abort", { creationId: id });
    assert.equal(aborted.status, 200, JSON.stringify(aborted)); assert.equal(aborted.aborted, true);
    if (kind === "new-registry") await assert.rejects(readFile(registryPath), { code: "ENOENT" });
    else if (kind === "existing-generator") assert.equal(await readFile(registryPath, "utf8"), baselineRegistry);
    else {
      const registry = JSON.parse(await readFile(registryPath, "utf8"));
      assert.deepEqual(registry.spectrogramGenerator, { version: 999, reason: "foreign change" });
      assert.deepEqual(registry.assets, JSON.parse(baselineRegistry).assets);
    }
    assert.equal(await readFile(dataPath, "utf8"), baselineData);
    await assert.rejects(readFile(join(root, "species-assets", derived.safeName, "sound.mp3")), { code: "ENOENT" });
    assert.equal(commands.length, 1);
  });
});

test("Historischer veröffentlichter Artanlage-Nachweis sperrt spätere Soundbearbeitung nicht", async (t) => {
  const { root, store, id, cleanupServer } = await fixture(t);
  await writeFile(join(root, "species-assets-overrides.json"), JSON.stringify({ version: 1, assets: {
    Testvogel: { sound: { manual: true, reason: "later media edit", rejectedSources: [{ key: "xeno-canto:456" }] } },
  } }));
  await store.checkpoint(id, { publicationStarted: true });
  // A normal later editor write intentionally makes the old receipt stale.
  const registryPath = join(root, "species-assets-overrides.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  registry.assets.Testvogel.sound.reason = "changed after publication";
  await writeFile(registryPath, JSON.stringify(registry));
  const server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false });
  cleanupServer(server); const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
  const post = async (route, body = {}) => { const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) }; };
  const preview = await post(`/api/species/${derived.slug}/assets/sound/rejections-preview`);
  const reset = await post(`/api/species/${derived.slug}/assets/sound/rejections-reset`, { token: preview.token, confirmed: true, creationId: id });
  assert.equal(reset.status, 200, JSON.stringify(reset));
  const sound = JSON.parse(await readFile(registryPath, "utf8")).assets.Testvogel.sound;
  assert.equal(sound.reason, "changed after publication"); assert.equal(sound.manual, true);
  assert.equal(sound.rejectedSources, undefined);
  assert.equal((await post("/api/species/new/abort", { creationId: id })).status, 409);
});

test("Abbruchwunsch bleibt während paralleler Checkpoints persistent und Git-Standänderung sperrt Rücknahme", async (t) => {
  const { root, store, id } = await fixture(t);
  await Promise.all([store.checkpoint(id), store.requestAbort(id), store.checkpoint(id)]);
  assert.equal(await store.isAbortRequested(id), true);
  assert.equal((await createSpeciesCreationSessionStore({ repoRoot: root }).list())[0].abortRequested, true);
  await assert.rejects(store.checkpoint(id, { publicationStarted: true }), /Veröffentlichung wird nicht gestartet/);
  assert.equal((await store.list())[0].publicationStarted, false);
  await mkdir(join(root, ".git")); await writeFile(join(root, ".git", "HEAD"), "new-published-head");
  await assert.rejects(store.abort(id), /Git-Stand geändert/);
  assert.equal(JSON.parse(await readFile(join(root, "species_list.json"), "utf8")).at(-1).german, entry.german);
});

test("Kartendokumentation und alte eigene Sicherungen bleiben bei Fremdänderungen erhalten", async (t) => {
  const root = await createEditableFixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const docPath = join(root, "docs", "manual-map-overrides.md"), backupRoot = join(root, "species-explorer", "asset-backups", "Testvogel");
  await writeFile(docPath, "Stand: 2020-01-01\nAktuell sind 0 Karten als geschützt dokumentiert.\n\nFremdtext  mit   Abständen\n");
  await mkdir(join(backupRoot, "sound"), { recursive: true });
  await writeFile(join(backupRoot, "sound", "sound.mp3"), "historical backup");
  const store = createSpeciesCreationSessionStore({ repoRoot: root });
  const backupPath = join(root, "species-explorer", "backups", "own.json");
  const original = await readFile(join(root, "species_list.json"), "utf8");
  const id = await store.begin({ entry, derived, backupPath });
  await mkdir(join(root, "species-explorer", "backups"), { recursive: true });
  await writeFile(backupPath, original); await writeFile(join(root, "species_list.json"), JSON.stringify([...JSON.parse(original), entry]));
  await writeFile(docPath, "Stand: 2026-10-04\nAktuell sind 1 Karte als geschützt dokumentiert.\n\nFremdtext  mit   Abständen\n| Testvogel | Testvogel | `species-assets/Testvogel/map.jpg` | eigene Karte |\n");
  await writeFile(join(backupRoot, "sound", "sound.mp3"), "new own backup");
  await mkdir(join(backupRoot, "map")); await writeFile(join(backupRoot, "map", "map.jpg"), "new map backup");
  await store.checkpoint(id);
  const foreignDoc = (await readFile(docPath, "utf8")).replace("2026-10-04", "2027-01-02").replace("Fremdtext  mit   Abständen", "Fremdtext    mit      neuen Abständen")
    .replace("1 Karte", "2 Karten") + "| Fremdvogel | Fremdvogel | `species-assets/Fremdvogel/map.jpg` | spätere Karte |\n";
  await writeFile(docPath, foreignDoc);
  await store.abort(id);
  const doc = await readFile(docPath, "utf8");
  assert.match(doc, /Stand: 2027-01-02/);
  assert.match(doc, /Fremdtext    mit      neuen Abständen/);
  assert.match(doc, /Aktuell sind 1 Karte als geschützt dokumentiert/);
  assert.match(doc, /species-assets\/Fremdvogel\/map.jpg/);
  assert.doesNotMatch(doc, /species-assets\/Testvogel\/map.jpg/);
  assert.equal(await readFile(join(backupRoot, "sound", "sound.mp3"), "utf8"), "historical backup");
  assert.deepEqual(await readdir(backupRoot), ["sound"]);
});

test("Gleichzeitig angenommene Portraitspeicherung und Abbruch können keine Artdatei neu hinterlassen", async (t) => {
  const root = await createEditableFixture(), cleanup = registerFixtureCleanup(t, root);
  const server = await createExplorerServer({ repoRoot: root, port: 0, sessionProtection: false,
    portraitRenderer: async ({ outputPath }) => { await writeFile(outputPath, createTestWebp(8)); return { width: 1280, height: 1600 }; } });
  cleanup(server); const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
  const post = async (route, body) => { const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) }; };
  const draft = await post("/api/species/new/preview", { values });
  const portrait = await post("/api/species/new/portrait-preview", { token: draft.token, originalName: "Testvogel.png", imageBase64: createTestPng(1280, 1600).toString("base64") });
  const saved = await post("/api/species/new/save", { token: draft.token });
  const [image, queued] = await Promise.all([
    post(`/api/species/${derived.slug}/assets/portrait/save`, { token: portrait.token, publish: false, creationId: saved.creationId }),
    post("/api/species/new/abort", { creationId: saved.creationId }),
  ]);
  assert.ok([200, 409].includes(image.status), JSON.stringify(image));
  assert.equal(queued.status, 200, JSON.stringify(queued));
  const result = queued.pending ? await post("/api/species/new/abort", { creationId: saved.creationId }) : queued;
  assert.equal(result.aborted, true, JSON.stringify(result));
  await assert.rejects(readFile(join(root, "species-assets", "Testvogel", "portrait.webp")), { code: "ENOENT" });
  assert.equal(JSON.parse(await readFile(join(root, "species_list.json"), "utf8")).some((item) => item.german === entry.german), false);
  assert.equal((await post(`/api/species/${derived.slug}/assets/portrait/save`, { token: portrait.token, publish: false })).status, 409);
});

test("Während der Rücknahme hinzugekommene fremde Artdatei bleibt erhalten und Wiederaufnahme bleibt sicher", async (t) => {
  const { root, store, id } = await fixture(t), assetRoot = join(root, "species-assets", "Testvogel");
  await mkdir(assetRoot); await writeFile(join(assetRoot, "map.jpg"), "own map");
  const data = JSON.parse(await readFile(join(root, "speciesData.json"), "utf8"));
  data.push({ URLSlug: derived.slug, "Deutscher Name": entry.german });
  await writeFile(join(root, "speciesData.json"), JSON.stringify(data));
  await writeFile(join(root, "lastSavedAssessmentId.json"), JSON.stringify({ Testvogel: 123 }));
  await writeFile(join(root, "species-assets-overrides.json"), JSON.stringify({ version: 1, assets: { Testvogel: { map: { manual: true } } } }));
  await store.checkpoint(id);
  await store.requestAbort(id);
  let injected = false;
  const observer = watch(root, (_event, filename) => {
    if (String(filename) !== "species_list.json" || injected) return;
    injected = true;
    writeFileSync(join(assetRoot, "foreign.txt"), "foreign write after first JSON replacement");
    observer.close();
  });
  t.after(() => observer.close());
  await assert.rejects(store.abort(id), /fremde Artdateien ergänzt/);
  assert.equal(injected, true, "the actual filesystem race must have occurred");
  assert.equal(await readFile(join(assetRoot, "foreign.txt"), "utf8"), "foreign write after first JSON replacement");
  await assert.rejects(store.assertCurrent(id, derived.slug), /nicht mehr aktiv/);
  // Only this fixture's intentionally introduced foreign file is removed.
  await rm(join(assetRoot, "foreign.txt"));
  const reopened = createSpeciesCreationSessionStore({ repoRoot: root });
  assert.equal((await reopened.abort(id)).aborted, true);
  assert.equal((await reopened.abort(id)).alreadyAborted, true);
});
