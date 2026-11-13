import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { loadLocalDeviceProfile } from "./device-profile.mjs";
import { createDesktopUpdateCompletionOwner, readTrustedCompletionPresentation } from "./update-completion-owner.mjs";
import { createDesktopProjectImportOptions, startManagedExplorerServer, stopManagedExplorerServer } from "./server-lifecycle.mjs";
import { createEditableFixture, createTestWebp, registerFixtureCleanup, withServerFixtureStorageEnvironment } from "../server-test-fixtures.mjs";
import { fixture as createProjectFixture } from "../shared-project/test-fixtures.mjs";
import { createSharedProjectHttp } from "../shared-project/http.mjs";
import { createExplorerSharedProjectService } from "../shared-project/explorer-service.mjs";
import { createInitialProjectImport } from "../shared-project/initial-import.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";
import { normalMediaBinding } from "../shared-project/normal-media.mjs";
import { buildSpeciesContent } from "../species-content/export.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");

async function desktopImportFixture(t, { withMedia = false } = {}) {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot), profileRoot = path.join(repoRoot, "personal-import-fixture");
  await loadLocalDeviceProfile(profileRoot);
  const [input] = JSON.parse(await fs.readFile(path.join(repoRoot, "species_list.json"), "utf8"));
  const [generated] = JSON.parse(await fs.readFile(path.join(repoRoot, "speciesData.json"), "utf8"));
  Object.assign(input, { english: "Human working name", size: "Manual 27 cm", originalManualField: { retain: [7, false] } });
  Object.assign(generated, { originalGeneratedField: { retain: "Generated source" } });
  const overrides = { version: 1, assets: { Amsel: { map: { protectFromPipeline: true, source: "Own fixture map", reason: "Human care" } } } };
  const taxonomy = { version: 1, species: { turdusmerula: { reason: "Human taxonomy", originalTaxonomy: true } } };
  const assessment = { Amsel: { id: 1, originalAssessmentBinding: true } };
  const sources = { "species_list.json": [input], "speciesData.json": [generated], "species-assets-overrides.json": overrides,
    "species-taxonomy-overrides.json": taxonomy, "lastSavedAssessmentId.json": assessment };
  for (const [filename, value] of Object.entries(sources)) await fs.writeFile(path.join(repoRoot, filename), JSON.stringify(value));
  const assets = path.join(repoRoot, "species-assets", "Amsel");
  const portrait = withMedia ? createTestWebp() : Buffer.from("Isolated original portrait bytes");
  if (withMedia) for (const file of ["map.jpg", "sound.mp3", "spectrogram.webp", "credits.json"]) await fs.unlink(path.join(assets, file));
  await fs.writeFile(path.join(assets, "portrait.webp"), portrait);
  await fs.writeFile(path.join(assets, "portrait.json"), JSON.stringify({ source: "Synthetic original", prompt: "Private synthetic prompt retained only in full record" }));
  const projected = buildSpeciesContent({ record: generated }).data;
  projected.sections.push({ id: "habitat", title: "Lebensraum", text: "Human editorial habitat", intentionallyEmpty: false });
  const catalog = buildCatalog({ revision: "synthetic-desktop-bound-source", species: [projected] }), catalogBytes = Buffer.from(JSON.stringify(catalog));
  const sourcePaths = [...Object.keys(sources).map((name) => path.join(repoRoot, name)),
    ...(await fs.readdir(assets)).map((name) => path.join(assets, name))];
  const originals = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async (filename) => [path.relative(repoRoot, filename), sha(await fs.readFile(filename))])));
  const imageOptions = withMedia ? { imageDecode: async () => ({ width: 8, height: 8 }) } : {};
  const project = createProjectFixture(), { store, a } = await project.initialized(imageOptions), remote = createSharedProjectHttp({ store }), address = await remote.listen();
  t.after(async () => { await remote.close(); project.cleanup(); });
  let catalogReads = 0;
  const importOptions = createDesktopProjectImportOptions(profileRoot);
  async function start() {
    const managed = await withServerFixtureStorageEnvironment(repoRoot, () => startManagedExplorerServer({ repoRoot, preferredPort: 0,
      sharedProjectOptions: { filename: path.join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true, ...imageOptions },
      sharedProjectImportOptions: { ...importOptions, readWorkingCatalog: async () => { catalogReads++; return catalogBytes; } },
    }));
    register(managed.server);
    const session = await (await fetch(`${managed.baseUrl}/api/session`)).json();
    async function request(suffix, body) {
      const response = await fetch(`${managed.baseUrl}/api/shared-project${suffix}`, body === undefined ? undefined : {
        method: "POST", headers: { "Content-Type": "application/json", Origin: managed.baseUrl,
          "Sec-Fetch-Site": "same-origin", "X-Species-Explorer-Session": session.token }, body: JSON.stringify(body),
      });
      return { status: response.status, value: await response.json() };
    }
    const connect = () => request("/connect", { baseUrl: address.url, username: a.user.username, password: project.password });
    return { managed, request, connect };
  }
  async function oldPublicPlan({ complete = false } = {}) {
    const service = createExplorerSharedProjectService({ filename: path.join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true });
    let controller;
    try {
      await service.connect({ baseUrl: address.url, username: a.user.username, password: project.password });
      controller = createInitialProjectImport({ service, filename: importOptions.filename, localStorageConfirmed: true,
        readCatalog: async () => catalogBytes, expectedSha256: sha(catalogBytes), expectedSpeciesCount: 1 });
      const plan = await controller.prepare();
      if (complete) await controller.apply({ planId: plan.planId, confirmed: true });
      return { planId: plan.planId, receipts: controller.receipts(plan.planId) };
    } finally { await controller?.close(); await service.close(); }
  }
  function journalPlan(id) {
    const db = new DatabaseSync(importOptions.filename, { readOnly: true });
    try { return { plan: db.prepare("SELECT * FROM plans WHERE id=?").get(id), binding: db.prepare("SELECT * FROM source_bindings WHERE plan_id=?").get(id),
      items: db.prepare("SELECT * FROM items WHERE plan_id=? ORDER BY id").all(id), receipts: db.prepare("SELECT * FROM receipts WHERE plan_id=? ORDER BY sequence").all(id) }; }
    finally { db.close(); }
  }
  return { repoRoot, profileRoot, input, generated, sources, importOptions, catalog, store, a, start, oldPublicPlan, journalPlan,
    originals, portrait, get catalogReads() { return catalogReads; } };
}

test("lokale Gerätekennung bleibt über Neustart stabil und beschädigte Identität wird nicht ersetzt", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "device-profile-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  const first = await loadLocalDeviceProfile(root, { deviceName: "Erster PC" });
  assert.deepEqual(await loadLocalDeviceProfile(root, { deviceName: "Anderer Anzeigename" }), first);
  await fs.writeFile(path.join(root, "device.json"), '{"schemaVersion":9}');
  await assert.rejects(loadLocalDeviceProfile(root));
  assert.equal(await fs.readFile(path.join(root, "device.json"), "utf8"), '{"schemaVersion":9}');
  await assert.rejects(loadLocalDeviceProfile("relative-path"));
});

test("der verwaltete Desktopserver öffnet die festen Bildtext- und Artseitenjournale und aktiviert persönliche Sicherungen ohne Anmeldung", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot), profileRoot = path.join(repoRoot, "personal-fixture");
  const device = await loadLocalDeviceProfile(profileRoot), filename = path.join(profileRoot, "website-alt-sync.sqlite"),
    pageFilename = path.join(profileRoot, "page-authoring.sqlite");
  const managed = await withServerFixtureStorageEnvironment(repoRoot, () => startManagedExplorerServer({ repoRoot, preferredPort: 0,
    sharedProjectOptions: { filename: path.join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true },
    sharedProjectImportOptions: createDesktopProjectImportOptions(profileRoot),
    websiteAltSyncOptions: { filename, localStorageConfirmed: true }, pageAuthoringOptions: { filename: pageFilename, localStorageConfirmed: true },
    deviceBackupProfile: { profileRoot, deviceId: device.id },
  }));
  register(managed.server);
  const shared = await (await fetch(`${managed.baseUrl}/api/website/alt-texts/shared`)).json();
  assert.equal(shared.available, true); assert.equal(shared.permissions.canEdit, false); assert.deepEqual(shared.pages, []);
  assert.match(shared.message, /Projektanmeldung/);
  const importer = await (await fetch(`${managed.baseUrl}/api/shared-project/import`)).json();
  assert.equal(importer.available, true); assert.equal(importer.source.kind, "working-records"); assert.equal(importer.plan, null);
  const pages = await (await fetch(`${managed.baseUrl}/api/page-authoring`)).json();
  assert.equal(pages.available, false); assert.equal(pages.permissions.canEdit, false); assert.deepEqual(pages.drafts, []);
  assert.equal(pages.templates.length, 2);
  const backup = await (await fetch(`${managed.baseUrl}/api/settings`)).json();
  assert.equal(backup.deviceProfilesConfigured, true);
  assert.equal((await fs.stat(filename)).isFile(), true);
  assert.equal((await fs.stat(pageFilename)).isFile(), true);
  assert.equal((await managed.server.readLocalWorkState()).known, true);
  await stopManagedExplorerServer(managed);
});

test("Desktop-Erstimport prüft feste vollständige Arbeitsquellen und schreibt erst nach ausdrücklichem Start verlustfreie Entwürfe", async (t) => {
  const f = await desktopImportFixture(t), before = await f.originals(), desktop = await f.start();
  const initial = await desktop.request("/import");
  assert.equal(initial.value.source.kind, "working-records"); assert.equal(initial.value.plan, null);
  assert.equal(f.catalogReads, 0, "Start und Status lesen keine Artquellen und importieren nichts");
  assert.equal(f.store.listObjects(f.a.token).length, 0); assert.equal((await desktop.connect()).status, 200);
  const preview = await desktop.request("/import/prepare", { releaseForReaders: false });
  assert.equal(preview.value.preparedByUserId, f.a.user.id);
  assert.equal(preview.status, 200); assert.equal(preview.value.source.kind, "working-records"); assert.equal(preview.value.counts.willCreate, 1);
  assert.ok(!JSON.stringify(preview.value).includes("originalManualField")); assert.ok(!JSON.stringify(preview.value).includes("Private synthetic prompt"));
  assert.equal(f.store.listObjects(f.a.token).length, 0, "Die Vorschau ist kein Import");
  const start = await desktop.request("/import/start", { planId: preview.value.planId, confirmed: true }); assert.equal(start.status, 200);
  let state;
  for (let attempt = 0; attempt < 100; attempt++) {
    state = (await desktop.request("/import")).value;
    if (!state.busy) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(state.busy, false); assert.equal(state.plan.state, "complete"); assert.equal(state.plan.counts.created, 1); assert.equal(state.plan.counts.approved, 0);
  const object = f.store.getObject(f.a.token, "species", "turdusmerula");
  assert.equal(object.data.type, "fn-species-record"); assert.deepEqual(object.data.input, f.input); assert.deepEqual(object.data.generated, f.generated);
  assert.equal(object.data.editorial.sections.find((section) => section.id === "habitat").text, "Human editorial habitat");
  assert.equal(object.data.assets.assetName, "Amsel"); assert.equal(object.data.assets.portraitMetadata.prompt, "Private synthetic prompt retained only in full record");
  assert.deepEqual(object.data.assets.overrides, f.sources["species-assets-overrides.json"].assets.Amsel);
  assert.deepEqual(object.data.assessmentBinding, f.sources["lastSavedAssessmentId.json"].Amsel); assert.equal(object.approvedRevision, null);
  assert.equal(f.store.catalog(f.a.token).species.length, 0); assert.deepEqual(await f.originals(), before);
});

test("regulärer Desktop stellt Erstbestandsdateien über die eigene bestätigte API-Aktion bereit", async t => {
  const f = await desktopImportFixture(t, { withMedia: true }), before = await f.originals(), desktop = await f.start();
  assert.equal((await desktop.connect()).status, 200);
  const { value: plan } = await desktop.request("/import/prepare", {});
  assert.equal(plan.media, null);
  assert.equal((await desktop.request("/import/media", { planId: plan.planId, confirmed: true })).status, 409);
  assert.equal((await desktop.request("/import/start", { planId: plan.planId, confirmed: true })).status, 200);
  async function idle() {
    for (let attempt = 0; attempt < 200; attempt++) {
      const { value } = await desktop.request("/import");
      if (!value.busy) return value.plan;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail("Die Testoperation blieb aktiv.");
  }
  const complete = await idle();
  assert.equal(complete.state, "complete"); assert.equal(complete.media.files, 1);
  const object = f.store.getObject(f.a.token, "species", "turdusmerula");
  const binding = normalMediaBinding(object.data, { projectId: f.a.projectId, slot: "portrait.webp" });
  assert.throws(() => f.store.getNormalMedia(f.a.token, binding.contentId), { code: "normal_media_not_found" });
  assert.equal((await desktop.request("/import/media", { planId: plan.planId, confirmed: false })).status, 400);
  assert.equal((await desktop.request("/import/media", { planId: plan.planId, confirmed: true })).status, 200);
  const result = (await idle()).media.run;
  assert.equal(result.state, "complete", JSON.stringify(result)); assert.equal(result.confirmedFiles, 1);
  assert.deepEqual(f.store.readNormalMedia(f.a.token, binding.contentId).bytes, f.portrait);
  assert.deepEqual(f.store.getObject(f.a.token, "species", object.id), object);
  assert.deepEqual(await f.originals(), before);
});

test("fehlende feste Desktop-Arbeitsquelle fällt nicht auf den öffentlichen Anfangskatalog zurück", async (t) => {
  const f = await desktopImportFixture(t), desktop = await f.start(); assert.equal((await desktop.connect()).status, 200);
  await fs.unlink(path.join(f.repoRoot, "lastSavedAssessmentId.json"));
  const before = await fs.readFile(path.join(f.repoRoot, "species_list.json")), result = await desktop.request("/import/prepare", {});
  assert.notEqual(result.status, 200); assert.equal(f.catalogReads, 0);
  const state = (await desktop.request("/import")).value;
  assert.equal(state.source.kind, "working-records"); assert.equal(state.plan, null); assert.equal(f.store.listObjects(f.a.token).length, 0);
  assert.deepEqual(await fs.readFile(path.join(f.repoRoot, "species_list.json")), before);
});

test("Desktop erhält alte öffentliche v1-Pläne und Belege; nur ein ausdrücklich benannter unbegonnener Plan wird ersetzt", async (t) => {
  const f = await desktopImportFixture(t), old = await f.oldPublicPlan(), prior = f.journalPlan(old.planId);
  const db = new DatabaseSync(f.importOptions.filename); db.exec("DROP TABLE source_bindings; PRAGMA user_version=1;"); db.close();
  const desktop = await f.start(), state = (await desktop.request("/import")).value;
  assert.equal(state.source.kind, "working-records"); assert.equal(state.plan.source.kind, "public-catalog"); assert.equal(state.plan.planId, old.planId);
  assert.deepEqual(f.journalPlan(old.planId), prior); assert.equal(f.catalogReads, 0); assert.equal(f.store.listObjects(f.a.token).length, 0);
  assert.equal((await desktop.connect()).status, 200);
  const automaticReplacement = await desktop.request("/import/prepare", {}); assert.equal(automaticReplacement.status, 409);
  assert.deepEqual(f.journalPlan(old.planId), prior);
  const replacement = await desktop.request("/import/prepare", { replaceUnstartedPlanId: old.planId, releaseForReaders: false });
  assert.equal(replacement.status, 200); assert.equal(replacement.value.source.kind, "working-records"); assert.notEqual(replacement.value.planId, old.planId);
  const retained = f.journalPlan(old.planId); assert.equal(retained.plan.state, "superseded");
  assert.deepEqual({ ...retained, plan: { ...retained.plan, state: prior.plan.state } }, { ...prior, plan: { ...prior.plan } });
  assert.equal(f.store.listObjects(f.a.token).length, 0);
});

test("Desktop deutet einen begonnenen öffentlichen Import weder um noch führt er ihn beim Quellenwechsel aus", async (t) => {
  const f = await desktopImportFixture(t), old = await f.oldPublicPlan({ complete: true }), prior = f.journalPlan(old.planId);
  const originalObject = f.store.getObject(f.a.token, "species", "turdusmerula"), desktop = await f.start(), state = (await desktop.request("/import")).value;
  assert.equal(state.source.kind, "working-records"); assert.equal(state.plan.source.kind, "public-catalog"); assert.equal(state.plan.state, "complete");
  assert.equal(state.plan.canReplace, false); assert.deepEqual(f.journalPlan(old.planId), prior); assert.equal(f.catalogReads, 0);
  assert.equal((await desktop.connect()).status, 200);
  const replacement = await desktop.request("/import/prepare", { replaceUnstartedPlanId: old.planId }); assert.equal(replacement.status, 409);
  assert.deepEqual(f.journalPlan(old.planId), prior); assert.deepEqual(f.store.getObject(f.a.token, "species", "turdusmerula"), originalObject);
});

test("Countdown-Schließprüfung liest nur das eigene sichtbare Explorerfenster und blockiert unbekannte Eingaben", async () => {
  let reads = 0;
  const window = { isDestroyed: () => false, isVisible: () => true, isMinimized: () => false,
    webContents: { getURL: () => "http://127.0.0.1:4311/", executeJavaScript: async () => { reads++; return { uiDrafts: false, countdownVisible: true }; } } };
  const context = { selectionId: "selection", updateRunId: "run" };
  assert.deepEqual(await readTrustedCompletionPresentation(window, "http://127.0.0.1:4311", context), { known: true, uiDrafts: false, countdownVisible: true });
  assert.equal((await readTrustedCompletionPresentation(window, "http://127.0.0.1:4312", context)).known, false);
  window.isMinimized = () => true;
  assert.equal((await readTrustedCompletionPresentation(window, "http://127.0.0.1:4311", context)).known, false);
  assert.equal(reads, 1);
  window.isMinimized = () => false; window.webContents.executeJavaScript = async () => ({ countdownVisible: true });
  assert.equal((await readTrustedCompletionPresentation(window, "http://127.0.0.1:4311", context)).known, false);
});

test("automatischer Appabschluss wartet auch auf die Freigabe des letzten Journalbesitzers", async () => {
  const selectionId = "11111111-1111-4111-8111-111111111111", sessionId = "22222222-2222-4222-8222-222222222222";
  const context = { schemaVersion: 1, claimId: "33333333-3333-4333-8333-333333333333", selectionId, sessionId,
    updateRunId: `update-${selectionId}`, deviceId: "device-fixture", action: "exit-explorer", proofRevision: "c".repeat(64), claimedAt: new Date().toISOString() };
  const journalReleased = Promise.withResolvers(); let callbacks, exited = false;
  const window = { isDestroyed: () => false, isVisible: () => true, isMinimized: () => false,
    webContents: { getURL: () => "http://127.0.0.1:4321/", executeJavaScript: async () => ({ uiDrafts: false, countdownVisible: true }) } };
  const fakeService = { sessionId, readClaim: async () => context, consumeClaimExecution: async () => true,
    status: () => journalReleased.promise };
  createDesktopUpdateCompletionOwner({ device: { id: context.deviceId, name: "Dieser PC" }, stateRoot: ".",
    getWindow: () => window, getBaseUrl: () => "http://127.0.0.1:4321", acquireDesktopClose: () => () => {},
    finishExplorerExit: async () => { exited = true; }, restoreAfterFailure: async () => {},
    proofReader: { read: async () => ({ workflow: { updateRunId: context.updateRunId }, proof: { ready: true, proofRevision: context.proofRevision } }) },
    serverContext: { readLocalWorkState: async () => ({ known: true, writersActive: false, jobsActive: false,
      pipeline: { status: "idle" }, backup: { status: "idle" }, websiteTransfer: { running: false }, pendingChanges: { hasPendingChanges: false } }),
      quiesceForCompletion: async () => () => {}, closeAppServer: async () => {} },
    serviceFactory(options) { callbacks = options; return fakeService; },
  });
  const receipt = await callbacks.prepareClose(context); await callbacks.execute(context, receipt);
  callbacks.onChange({ status: "requested", selectionId });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(exited, false, "a durable result alone does not prove the journal lock is released");
  journalReleased.resolve({ status: "requested", selectionId });
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(exited, true);
});
