import assert from "node:assert/strict";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createExplorerServer } from "./server.mjs";
import { createBackupService } from "./backup-service.mjs";
import { loadLocalDeviceProfile } from "./desktop/device-profile.mjs";
import { createMemoryCredentialStore } from "./shared-project/client.mjs";
import { fixture as createProjectFixture } from "./shared-project/test-fixtures.mjs";
import { createSharedProjectHttp } from "./shared-project/http.mjs";
import { createWorkingImportSource } from "./species-content/working-import-source.mjs";
import { buildSpeciesContent } from "./species-content/export.mjs";
import { createWebsiteAltTextsService } from "./website-alt-service.mjs";
import { createEditableFixture, registerFixtureCleanup, serverFixtureStoragePaths } from "./server-test-fixtures.mjs";

async function setup(t, options = {}) {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot);
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: { snapshot: async () => ({ transfer: { running: false } }), close: async () => {} }, ...options });
  register(server);
  const address = await server.listen(), baseUrl = `http://127.0.0.1:${address.port}`;
  const { token } = await (await fetch(`${baseUrl}/api/session`)).json();
  const post = (suffix, payload = {}) => fetch(`${baseUrl}${suffix}`, { method: "POST", headers: {
    "content-type": "application/json", "x-species-explorer-session": token, origin: baseUrl }, body: JSON.stringify(payload) });
  return { server, repoRoot, baseUrl, post };
}

test("echter Explorer verdrahtet Projekt und Abschluss und schließt beide neuen Dienste einmalig", async (t) => {
  let sharedClosed = 0, completionClosed = 0, observedContext;
  const shared = { snapshot: async () => ({ schemaVersion: 1, busy: false, queuedChanges: 2, conflictCount: 1, objects: [] }),
    editExisting: async (kind, id, data) => ({ kind, id, ...data }), close: async () => { sharedClosed++; } };
  const completion = { status: async () => ({ available: true, deviceId: "device-fixture", action: "none" }),
    close: async () => { completionClosed++; }, startMonitoring() {} };
  const f = await setup(t, { sharedProjectService: shared, updateCompletionFactory(context) { observedContext = context; return completion; } });
  assert.equal(typeof observedContext.readLocalWorkState, "function");
  assert.equal(typeof observedContext.masterService.status, "function");
  const response = await f.post("/api/shared-project/objects/page/athen", { data: { title: "Athen" }, expectedEditRevision: "shown" });
  assert.equal(response.status, 200); assert.equal((await response.json()).id, "athen");
  assert.equal((await (await fetch(`${f.baseUrl}/api/taxonomy/update-completion`)).json()).deviceId, "device-fixture");
  const state = await f.server.readLocalWorkState(); assert.equal(state.pendingChanges.hasPendingChanges, true);
  assert.equal(state.known, true);
  const release = await f.server.quiesceForCompletion();
  const blocked = await f.post("/api/shared-project/objects/page/athen", {}); assert.equal(blocked.status, 409); await blocked.text();
  release();
  await f.server.close(); await f.server.close(); assert.equal(sharedClosed, 1); assert.equal(completionClosed, 1);
});

test("echter Explorer-Grunddatenweg verwendet nur den gemeinsamen Cache und lässt lokale Artdateien bytegleich", async (t) => {
  const project = createProjectFixture(); let http, server;
  t.after(async () => { await server?.close(); await http?.close(); project.cleanup(); });
  const { store, a } = await project.initialized();
  const record = { type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Testkauz", english: "Synthetic owl", genus: "Strix", species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", custom: "preserved" },
    generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Testkauz", files: {}, overrides: { map: { protectFromPipeline: true } }, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  store.createObject(a.token, { kind: "species", id: record.id, data: record });
  http = createSharedProjectHttp({ store }); const address = await http.listen();
  const filename = join(project.root, "explorer-personal.sqlite");
  const f = await setup(t, { sharedProjectOptions: { filename, localStorageConfirmed: true, allowLoopbackHttp: true, credentialStore: createMemoryCredentialStore() } });
  server = f.server;
  await writeFile(join(f.repoRoot, "species-assets-overrides.json"), JSON.stringify({ version: 1, assets: { Testkauz: { map: { protectFromPipeline: true } } } }), { flag: "wx" });
  const sourceFiles = ["species_list.json", "speciesData.json", "species-assets-overrides.json"];
  const original = await Promise.all(sourceFiles.map((file) => readFile(join(f.repoRoot, file))));
  let response = await f.post("/api/shared-project/connect", { baseUrl: address.url, username: a.user.username, password: project.password });
  assert.equal(response.status, 200); await response.json();
  response = await fetch(`${f.baseUrl}/api/shared-project/species/${record.id}`);
  assert.equal(response.status, 200); const shown = await response.json();
  response = await f.post(`/api/shared-project/species/${record.id}/preview`, { sourceScope: shown.sourceScope, expectedEditRevision: shown.editRevision,
    values: { germanName: "Testkauz", englishName: "Synthetic owl", scientificName: "Strix fixture", size: "21 cm", weight: "400 g", lifeExpectancy: "10 Jahre" } });
  assert.equal(response.status, 200); const preview = await response.json();
  response = await f.post(`/api/shared-project/species/${record.id}/save`, { token: preview.token });
  assert.equal(response.status, 200); const saved = await response.json();
  assert.equal(saved.queued, true); assert.equal(saved.species.manual.size, "21 cm"); assert.equal(saved.externalPublication, "not-performed");
  assert.equal(store.getObject(a.token, "species", record.id).data.input.size, "20 cm", "save does not silently start synchronization");
  const approvalPath = `/api/shared-project/species/${record.id}/approval`;
  response = await f.post(`${approvalPath}/preview`, { sourceScope: saved.species.sourceScope,
    expectedEditRevision: saved.species.editRevision, expectedRevision: saved.species.revision });
  assert.equal(response.status, 409); await response.json();
  assert.equal(store.getObject(a.token, "species", record.id).approvedRevision, null, "approval never sends a pending draft");
  response = await f.post("/api/shared-project/sync"); assert.equal(response.status, 200); await response.json();
  const workspace = await (await fetch(`${f.baseUrl}/api/shared-project/species/workspace`)).json(), current = workspace.species[0];
  assert.equal(current.manual.size, "21 cm"); assert.equal(current.canApprove, true); assert.equal(current.approvedRevision, null);
  response = await fetch(`${f.baseUrl}${approvalPath}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 403); await response.json();
  response = await f.post(`${approvalPath}/preview`, { sourceScope: current.sourceScope,
    expectedEditRevision: current.editRevision, expectedRevision: current.revision });
  assert.equal(response.status, 200); const release = await response.json();
  assert.equal(JSON.stringify(release).includes("custom"), false, "approval preview is curated, not the original input register");
  assert.equal(store.getObject(a.token, "species", record.id).approvedRevision, null, "preview cannot release a record");
  response = await f.post(`${approvalPath}/approve`, { token: release.token }); assert.equal(response.status, 200);
  const approved = await response.json(); assert.equal(approved.approvedRevision, current.revision);
  assert.equal(approved.reviewedRevision, current.revision); assert.equal(approved.serverConfirmed, true);
  assert.equal(approved.hasNewerLocalChanges, false); assert.equal(approved.internalOnly, true); assert.equal(approved.externalPublication, "not-performed");
  const final = (await (await fetch(`${f.baseUrl}/api/shared-project/species/workspace`)).json()).species[0];
  assert.equal(final.canApprove, false); assert.equal(final.approvedRevision, final.revision); assert.equal(final.approval, "approved");
  const readerName = "fixture-release-reader";
  await store.createUser(a.token, { username: readerName, displayName: "Synthetic reader", password: project.password, role: "reader" });
  const reader = await store.login({ username: readerName, password: project.password });
  const catalog = store.catalog(reader.token); assert.equal(catalog.species.length, 1);
  assert.equal(JSON.stringify(catalog).includes("preserved"), false, "private source fields are absent from the reader catalog");
  assert.equal(store.getObject(a.token, "species", record.id).data.input.custom, "preserved");
  response = await f.post(`${approvalPath}/approve`, { token: release.token }); assert.equal(response.status, 409); await response.json();
  assert.deepEqual(await Promise.all(sourceFiles.map((file) => readFile(join(f.repoRoot, file)))), original);
});

test("echter Explorer meldet die vollständige Importquelle und überschreibt ihren Umfang nicht mit dem öffentlichen Bündel", async (t) => {
  const project = createProjectFixture(); let remote, local;
  t.after(async () => { await local?.close(); await remote?.close(); project.cleanup(); });
  const { store, a } = await project.initialized(), assetsRoot = join(project.root, "assets");
  await mkdir(join(assetsRoot, "Testkauz"), { recursive: true });
  const sourceAdapter = createWorkingImportSource({ assetsRoot, readSources: async () => ({
    speciesList: [{ german: "Testkauz", genus: "Strix", species: "fixture" }],
    speciesData: [{ URLSlug: "fixture-owl", Genus: "Strix", Species: "fixture", "Wissenschaftlicher Name": "Strix fixture", "Deutscher Name": "Testkauz" }],
    catalog: { schemaVersion: 1, revision: "fixture", generatedAt: "2026-11-01T00:00:00.000Z", species: [{ id: "fixture-owl", scientificName: "Strix fixture", commonName: "Testkauz", taxonomy: [], sections: [], media: { sounds: [], gallery: [] } }] },
    assetOverrides: { version: 1, assets: {} }, taxonomyOverrides: { version: 1, species: {} }, assessmentBindings: {},
    bindings: [{ id: "fixture-owl", assetName: "Testkauz", generalSectionId: null, embeddedGeneralText: null }],
  }) });
  const f = await setup(t, { sharedProjectOptions: { filename: join(project.root, "client.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true },
    sharedProjectImportOptions: { filename: join(project.root, "initial-import.sqlite"), localStorageConfirmed: true, sourceAdapter } }); local = f.server;
  remote = createSharedProjectHttp({ store }); const address = await remote.listen();
  let response = await f.post("/api/shared-project/connect", { baseUrl: address.url, username: a.user.username, password: project.password }); assert.equal(response.status, 200); await response.json();
  response = await fetch(`${f.baseUrl}/api/shared-project/import`); const shown = await response.json();
  assert.equal(shown.source.kind, "working-records"); assert.equal(shown.source.sha256, undefined);
  response = await f.post("/api/shared-project/import/prepare"); assert.equal(response.status, 200);
  const plan = await response.json(); assert.equal(plan.source.kind, "working-records"); assert.equal(plan.counts.total, 1);
  assert.equal(store.listObjects(a.token).length, 0); assert.equal((await (await fetch(`${f.baseUrl}/api/species`)).json())[0].germanName, "Amsel");
});

test("echter Explorer bindet die Artkonfliktentscheidung an Sitzung und Vorschau und erhält lokale Originaldateien", async (t) => {
  const project = createProjectFixture(); let remote, local;
  t.after(async () => { await local?.close(); await remote?.close(); project.cleanup(); });
  const { store, a, b } = await project.initialized();
  const original = { type: "fn-species-record", schemaVersion: 1, id: "fixture-conflict",
    input: { german: "Testkauz", english: "Synthetic owl", genus: "Strix", species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", privateOriginal: { keep: true } },
    generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Testkauz", files: {}, overrides: { map: { protectFromPipeline: true } }, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  const created = store.createObject(a.token, { kind: "species", id: original.id, data: original });
  remote = createSharedProjectHttp({ store }); const address = await remote.listen();
  const f = await setup(t, { sharedProjectOptions: { filename: join(project.root, "conflict-client.sqlite"), localStorageConfirmed: true,
    allowLoopbackHttp: true, credentialStore: createMemoryCredentialStore() } }); local = f.server;
  const sourceFiles = ["species_list.json", "speciesData.json"], sourceBytes = await Promise.all(sourceFiles.map((file) => readFile(join(f.repoRoot, file))));
  let response = await f.post("/api/shared-project/connect", { baseUrl: address.url, username: a.user.username, password: project.password });
  assert.equal(response.status, 200); await response.json();
  const objectPath = `/api/shared-project/objects/species/${original.id}`;
  const shown = await (await fetch(`${f.baseUrl}${objectPath}`)).json(), proposal = structuredClone(original); proposal.input.weight = "430 g";
  response = await f.post(objectPath, { expectedEditRevision: shown.editRevision, data: proposal }); assert.equal(response.status, 200); await response.json();
  const serverData = structuredClone(original); serverData.input.size = "21 cm";
  store.submitChange(b.token, { kind: "species", id: original.id, changeId: "fixture-conflict-remote", baseRevision: created.revision, data: serverData });
  response = await f.post("/api/shared-project/sync"); assert.equal(response.status, 200); await response.json();
  const list = await (await fetch(`${f.baseUrl}/api/shared-project/species/conflicts`)).json(); assert.equal(list.conflicts.length, 1);
  const path = `/api/shared-project/species/conflicts/${list.conflicts[0].id}`, review = await (await fetch(`${f.baseUrl}${path}`)).json();
  assert.equal(review.fields.find((field) => field.key === "weight").localVersions[0].value, "430 g");
  assert.equal(JSON.stringify(review).includes("privateOriginal"), false, "review does not expose the private full record");
  response = await fetch(`${f.baseUrl}${path}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 403); await response.text();
  const { token: localToken } = await (await fetch(`${f.baseUrl}/api/session`)).json();
  response = await fetch(`${f.baseUrl}${path}/resolve`, { method: "POST", headers: { "content-type": "application/json", "x-species-explorer-session": localToken,
    origin: "https://foreign.example" }, body: "{}" }); assert.equal(response.status, 403); await response.text();
  response = await f.post(`${path}/preview`, { sourceScope: review.sourceScope, expectedReviewRevision: review.reviewRevision,
    choices: { size: { kind: "server" }, weight: { kind: "local", changeId: review.localVersions[0].changeId } } });
  assert.equal(response.status, 200); const preview = await response.json();
  assert.equal(store.getObject(a.token, "species", original.id).data.input.weight, "400 g", "preview never writes");
  response = await f.post(`${path}/resolve`, { token: preview.token }); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.serverConfirmed, true); assert.equal(result.externalPublication, "not-performed");
  const current = store.getObject(a.token, "species", original.id); const expected = structuredClone(original); expected.input.size = "21 cm"; expected.input.weight = "430 g";
  assert.deepEqual(current.data, expected); assert.equal(current.approvedRevision, null);
  response = await f.post(`${path}/resolve`, { token: preview.token }); assert.equal(response.status, 409); await response.text();
  assert.deepEqual(await Promise.all(sourceFiles.map((file) => readFile(join(f.repoRoot, file)))), sourceBytes);
});

test("fest gewählte lokale Arbeitsquelle erreicht über den echten Explorer den planbaren Originalbestand", async (t) => {
  const project = createProjectFixture(); let remote, local, catalog;
  t.after(async () => { await local?.close(); await remote?.close(); project.cleanup(); });
  const { store, a } = await project.initialized();
  const f = await setup(t, { sharedProjectOptions: { filename: join(project.root, "client.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true },
    sharedProjectImportOptions: { filename: join(project.root, "initial-import.sqlite"), localStorageConfirmed: true, sourceKind: "working-records", readWorkingCatalog: async () => Buffer.from(JSON.stringify(catalog)) } }); local = f.server;
  const [record] = JSON.parse(await readFile(join(f.repoRoot, "speciesData.json"), "utf8"));
  catalog = { schemaVersion: 1, revision: "fixture", generatedAt: "2026-11-01T00:00:00.000Z", species: [buildSpeciesContent({ record }).data] };
  for (const [filename, value] of Object.entries({ "species-assets-overrides.json": { version: 1, assets: {} },
    "species-taxonomy-overrides.json": { version: 1, species: {} }, "lastSavedAssessmentId.json": { Amsel: 1 } })) {
    await writeFile(join(f.repoRoot, filename), JSON.stringify(value), { flag: "wx" });
  }
  remote = createSharedProjectHttp({ store }); const address = await remote.listen();
  let response = await f.post("/api/shared-project/connect", { baseUrl: address.url, username: a.user.username, password: project.password }); assert.equal(response.status, 200); await response.json();
  response = await f.post("/api/shared-project/import/prepare"); assert.equal(response.status, 200);
  const plan = await response.json(); assert.equal(plan.source.kind, "working-records"); assert.equal(plan.counts.total, 1); assert.equal(plan.items[0].id, "turdusmerula");
  assert.equal(store.listObjects(a.token).length, 0);
});

test("beschädigter persönlicher Cache bleibt erhalten und der vorhandene lokale Explorer startet weiter", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot);
  const filename = join(repoRoot, "broken-cache.sqlite"), original = Buffer.from("synthetic damaged private cache");
  await writeFile(filename, original);
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    sharedProjectOptions: { filename, localStorageConfirmed: true },
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: { snapshot: async () => ({ transfer: { running: false } }), close: async () => {} } });
  register(server); const address = await server.listen(), baseUrl = `http://127.0.0.1:${address.port}`;
  const summary = await fetch(`${baseUrl}/api/summary`); assert.equal(summary.status, 200); await summary.json();
  const status = await (await fetch(`${baseUrl}/api/shared-project`)).json();
  assert.equal(status.available, false); assert.match(status.message, /Projektcache/);
  assert.deepEqual(await readFile(filename), original);
  assert.equal((await server.readLocalWorkState()).known, false);
});

test("Explorer schließt einen laufenden Sicherungsbesitzer vor persönlichem Cache und Tempablage", async (t) => {
  let finish, entered, receivedProvider, cacheClosed = false, bridgeClosed = false;
  const pending = new Promise((resolve) => { finish = resolve; }), started = new Promise((resolve) => { entered = resolve; });
  const provider = { prepare() { throw new Error("Keine echte NASsicherung im Integrationstest"); } };
  const f = await setup(t, { deviceBackupProvider: provider,
    sharedProjectService: { snapshot: async () => ({ busy: false, queuedChanges: 0, conflictCount: 0 }), close: async () => { cacheClosed = true; } },
    websiteAltSyncService: { close: async () => { assert.equal(cacheClosed, false); bridgeClosed = true; } },
    async backupServiceFactory(options) {
      receivedProvider = options.deviceBackupProvider;
      const service = await createBackupService(options);
      return { ...service, async close() { entered(); await pending; assert.equal(cacheClosed, false); assert.equal(bridgeClosed, false); await service.close(); } };
    } });
  assert.equal(receivedProvider, provider);
  const closing = f.server.close(); await started;
  assert.equal(cacheClosed, false);
  finish(); await closing; assert.equal(cacheClosed, true); assert.equal(bridgeClosed, true);
  await f.server.close();
});

test("vollständige persönliche Desktopverdrahtung startet ohne Anmeldung/Modelldownload und bindet echte leere Profilsnapshots", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot), profileRoot = join(repoRoot, "personal-fixture");
  const device = await loadLocalDeviceProfile(profileRoot); let provider;
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: createWebsiteAltTextsService({ repoRoot, dataRoot: join(repoRoot, "Daten") }),
    sharedProjectOptions: { filename: join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true, credentialStore: createMemoryCredentialStore() },
    sharedProjectImportOptions: { filename: join(profileRoot, "initial-import.sqlite"), localStorageConfirmed: true },
    websiteAltSyncOptions: { filename: join(profileRoot, "website-alt-sync.sqlite"), localStorageConfirmed: true },
    localAiOptions: { cacheRoot: join(profileRoot, "local-ai"), deviceId: device.id }, deviceBackupProfile: { profileRoot, deviceId: device.id },
    async backupServiceFactory(options) { provider = options.deviceBackupProvider; return createBackupService(options); } });
  register(server); const address = await server.listen(), origin = `http://127.0.0.1:${address.port}`;
  const state = await (await fetch(`${origin}/api/shared-project`)).json();
  assert.equal(state.status.connection, "disconnected"); assert.deepEqual(state.objects, []);
  const ai = await (await fetch(`${origin}/api/local-ai`)).json();
  assert.equal(ai.available, true); assert.equal(ai.installing, false); assert.equal(ai.worker.ownWorkerActive, false);
  const snapshot = await provider.prepare();
  try {
    assert.deepEqual(snapshot.summary.projectIds, []); assert.equal(snapshot.summary.pending, 0); assert.equal(snapshot.summary.fileCount, 4);
    const manifest = JSON.parse(await readFile(snapshot.manifestPath, "utf8"));
    assert.equal(manifest.files.some((entry) => entry.path.endsWith("/website-alt-sync.sqlite")), true);
    await snapshot.assertSourcesUnchanged();
  } finally { await snapshot.dispose(); }
  assert.equal((await server.readLocalWorkState()).known, true);
});

test("unbekanntes eingerichtetes Bildtextjournal bleibt unverändert und verhindert eine unvollständige persönliche Sicherung", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot), profileRoot = join(repoRoot, "personal-fixture");
  const device = await loadLocalDeviceProfile(profileRoot), filename = join(profileRoot, "website-alt-sync.sqlite");
  const original = Buffer.from("synthetic damaged personal image text journal"); let provider;
  await writeFile(filename, original);
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: createWebsiteAltTextsService({ repoRoot, dataRoot: join(repoRoot, "Daten") }),
    sharedProjectOptions: { filename: join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true },
    sharedProjectImportOptions: { filename: join(profileRoot, "initial-import.sqlite"), localStorageConfirmed: true },
    websiteAltSyncOptions: { filename, localStorageConfirmed: true }, deviceBackupProfile: { profileRoot, deviceId: device.id },
    async backupServiceFactory(options) { provider = options.deviceBackupProvider; return createBackupService(options); } });
  register(server); const address = await server.listen(), origin = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(`${origin}/api/website/alt-texts/shared`)).json();
  assert.equal(status.available, false); assert.match(status.message, /Bildtextjournal/);
  const summary = await fetch(`${origin}/api/summary`); assert.equal(summary.status, 200); await summary.json();
  assert.equal((await server.readLocalWorkState()).known, false);
  await assert.rejects(provider.prepare(), /Bildtextjournal.*nicht vollständig lesbar/);
  await server.close(); assert.deepEqual(await readFile(filename), original);
});
