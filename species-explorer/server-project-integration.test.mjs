import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createExplorerServer } from "./server.mjs";
import { createBackupService } from "./backup-service.mjs";
import { loadLocalDeviceProfile } from "./desktop/device-profile.mjs";
import { createMemoryCredentialStore } from "./shared-project/client.mjs";
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
  let finish, entered, receivedProvider, cacheClosed = false;
  const pending = new Promise((resolve) => { finish = resolve; }), started = new Promise((resolve) => { entered = resolve; });
  const provider = { prepare() { throw new Error("Keine echte NASsicherung im Integrationstest"); } };
  const f = await setup(t, { deviceBackupProvider: provider,
    sharedProjectService: { snapshot: async () => ({ busy: false, queuedChanges: 0, conflictCount: 0 }), close: async () => { cacheClosed = true; } },
    async backupServiceFactory(options) {
      receivedProvider = options.deviceBackupProvider;
      const service = await createBackupService(options);
      return { ...service, async close() { entered(); await pending; assert.equal(cacheClosed, false); await service.close(); } };
    } });
  assert.equal(receivedProvider, provider);
  const closing = f.server.close(); await started;
  assert.equal(cacheClosed, false);
  finish(); await closing; assert.equal(cacheClosed, true);
  await f.server.close();
});

test("vollständige persönliche Desktopverdrahtung startet ohne Anmeldung/Modelldownload und bindet echte leere Profilsnapshots", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot), profileRoot = join(repoRoot, "personal-fixture");
  const device = await loadLocalDeviceProfile(profileRoot); let provider;
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: { snapshot: async () => ({ transfer: { running: false } }), close: async () => {} },
    sharedProjectOptions: { filename: join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true, credentialStore: createMemoryCredentialStore() },
    sharedProjectImportOptions: { filename: join(profileRoot, "initial-import.sqlite"), localStorageConfirmed: true },
    localAiOptions: { cacheRoot: join(profileRoot, "local-ai"), deviceId: device.id }, deviceBackupProfile: { profileRoot, deviceId: device.id },
    async backupServiceFactory(options) { provider = options.deviceBackupProvider; return createBackupService(options); } });
  register(server); const address = await server.listen(), origin = `http://127.0.0.1:${address.port}`;
  const state = await (await fetch(`${origin}/api/shared-project`)).json();
  assert.equal(state.status.connection, "disconnected"); assert.deepEqual(state.objects, []);
  const ai = await (await fetch(`${origin}/api/local-ai`)).json();
  assert.equal(ai.available, true); assert.equal(ai.installing, false); assert.equal(ai.worker.ownWorkerActive, false);
  const snapshot = await provider.prepare();
  try {
    assert.deepEqual(snapshot.summary.projectIds, []); assert.equal(snapshot.summary.pending, 0); assert.equal(snapshot.summary.fileCount, 3);
    await snapshot.assertSourcesUnchanged();
  } finally { await snapshot.dispose(); }
  assert.equal((await server.readLocalWorkState()).known, true);
});
