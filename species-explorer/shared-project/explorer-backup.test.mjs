import assert from "node:assert/strict";
import test from "node:test";
import { createExplorerDeviceBackupProvider } from "./explorer-backup.mjs";
import { validateWebsiteAltJournal } from "./project-journal-backup.mjs";

test("persönliche Sicherung bindet ausschließlich feste Profile und alle alten Cache-/Importprojekte", async () => {
  let config; const sentinel = {};
  const provider = createExplorerDeviceBackupProvider({ profileRoot: "D:\\fixture-profile", deviceId: "device-fixture", tempSession: sentinel,
    sharedProject: { backupProjectIds: async () => ["project-current", "project-old"] },
    initialProjectImport: { backupProjectIds: async () => ["project-import-only", "project-current"] },
    providerFactory(value) { config = value; return sentinel; }, files: [{ relativePath: "credentials.bin" }] });
  assert.equal(provider, sentinel); assert.equal(config.tempSession, sentinel);
  assert.deepEqual(await config.resolveProjectIds(), ["project-current", "project-import-only", "project-old"]);
  assert.deepEqual(config.files.map((value) => value.relativePath), ["device.json", "project-cache.sqlite", "initial-import.sqlite"]);
  assert.ok(config.files.every((value) => value.required));
});

test("unlesbares Teilprofil oder Abbruch verhindert eine vermeintlich vollständige Sicherungsbindung", async () => {
  let config;
  createExplorerDeviceBackupProvider({ sharedProject: { backupProjectIds: async () => [] }, providerFactory(value) { config = value; } });
  await assert.rejects(config.resolveProjectIds(), /nicht vollständig lesbar/);
  const abort = new AbortController(); abort.abort(new Error("eigener Sicherungsabbruch"));
  await assert.rejects(config.resolveProjectIds({ signal: abort.signal }), /eigener Sicherungsabbruch/);
});

test("eingerichtetes Bildtextjournal bindet auch frühere eigene Projekte und seinen exakten Validator", async () => {
  let config;
  const base = { sharedProject: { backupProjectIds: async () => ["project-current"] },
    initialProjectImport: { backupProjectIds: async () => [] }, providerFactory(value) { config = value; } };
  createExplorerDeviceBackupProvider({ ...base, websiteAltSync: { backupProjectIds: async () => ["project-alt-old", "project-current"] } });
  assert.deepEqual(await config.resolveProjectIds(), ["project-alt-old", "project-current"]);
  assert.equal(config.files.length, 4);
  assert.deepEqual(config.files[3], { id: "website-alt-sync", relativePath: "website-alt-sync.sqlite", kind: "sqlite",
    required: true, validate: validateWebsiteAltJournal });
  createExplorerDeviceBackupProvider({ ...base, websiteAltSyncConfigured: true });
  await assert.rejects(config.resolveProjectIds(), /Bildtextjournal.*nicht vollständig lesbar/);
});
