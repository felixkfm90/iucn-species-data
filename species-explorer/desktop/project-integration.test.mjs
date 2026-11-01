import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { loadLocalDeviceProfile } from "./device-profile.mjs";
import { createDesktopUpdateCompletionOwner, readTrustedCompletionPresentation } from "./update-completion-owner.mjs";
import { startManagedExplorerServer, stopManagedExplorerServer } from "./server-lifecycle.mjs";
import { createEditableFixture, registerFixtureCleanup, withServerFixtureStorageEnvironment } from "../server-test-fixtures.mjs";

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

test("der verwaltete Desktopserver öffnet das feste Bildtextjournal und aktiviert persönliche Sicherungen ohne Anmeldung", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot), profileRoot = path.join(repoRoot, "personal-fixture");
  const device = await loadLocalDeviceProfile(profileRoot), filename = path.join(profileRoot, "website-alt-sync.sqlite");
  const managed = await withServerFixtureStorageEnvironment(repoRoot, () => startManagedExplorerServer({ repoRoot, preferredPort: 0,
    sharedProjectOptions: { filename: path.join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true },
    sharedProjectImportOptions: { filename: path.join(profileRoot, "initial-import.sqlite"), localStorageConfirmed: true },
    websiteAltSyncOptions: { filename, localStorageConfirmed: true }, deviceBackupProfile: { profileRoot, deviceId: device.id },
  }));
  register(managed.server);
  const shared = await (await fetch(`${managed.baseUrl}/api/website/alt-texts/shared`)).json();
  assert.equal(shared.available, true); assert.equal(shared.permissions.canEdit, false); assert.deepEqual(shared.pages, []);
  assert.match(shared.message, /Projektanmeldung/);
  const backup = await (await fetch(`${managed.baseUrl}/api/settings`)).json();
  assert.equal(backup.deviceProfilesConfigured, true);
  assert.equal((await fs.stat(filename)).isFile(), true);
  assert.equal((await managed.server.readLocalWorkState()).known, true);
  await stopManagedExplorerServer(managed);
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
