import assert from "node:assert/strict";
import test from "node:test";
import { createExplorerDeviceBackupProvider, createExplorerMediaBudgetReader } from "./explorer-backup.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { validateWebsiteAltJournal, validatePageAuthoringJournal } from "./project-journal-backup.mjs";

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

test("media budget reads only the fixed profile files and reports no contents, credentials or arbitrary files", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "image-budget-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "project-cache.sqlite"), Buffer.alloc(12));
  await fs.writeFile(path.join(root, "project-cache.sqlite-wal"), Buffer.alloc(5));
  await fs.writeFile(path.join(root, "initial-import.sqlite"), Buffer.alloc(8));
  await fs.writeFile(path.join(root, "website-alt-sync.sqlite"), Buffer.alloc(9));
  await fs.writeFile(path.join(root, "credentials.bin"), "private-secret");
  const ordinary = await createExplorerMediaBudgetReader({ profileRoot: root })();
  assert.deepEqual(ordinary, { totalBytes: 34 });
  assert.deepEqual(await createExplorerMediaBudgetReader({ profileRoot: root, websiteAltSyncConfigured: true })(), { totalBytes: 34 });
  await fs.writeFile(path.join(root, "page-authoring.sqlite"), Buffer.alloc(7));
  assert.deepEqual(await createExplorerMediaBudgetReader({ profileRoot: root })(), { totalBytes: 41 });
  assert.throws(() => createExplorerMediaBudgetReader({ profileRoot: "relative-profile" }));
  await fs.rm(path.join(root, "initial-import.sqlite")); await fs.mkdir(path.join(root, "initial-import.sqlite"));
  await assert.rejects(createExplorerMediaBudgetReader({ profileRoot: root })());
});

test("configured page journals include every personal scope and cannot disappear from a supposedly complete backup", async () => {
  let config;
  const base = { sharedProject: { backupProjectIds: async () => ["project-current"] },
    initialProjectImport: { backupProjectIds: async () => ["project-import"] },
    websiteAltSync: { backupProjectIds: async () => ["project-alt-old"] }, providerFactory(value) { config = value; } };
  createExplorerDeviceBackupProvider({ ...base, pageAuthoring: { backupProjectIds: async () => ["project-page-old", "project-current"] } });
  assert.deepEqual(await config.resolveProjectIds(), ["project-alt-old", "project-current", "project-import", "project-page-old"]);
  assert.deepEqual(config.files.at(-1), { id: "page-authoring", relativePath: "page-authoring.sqlite", kind: "sqlite",
    required: true, validate: validatePageAuthoringJournal });
  assert.equal(config.files.length, 5);
  createExplorerDeviceBackupProvider({ ...base, pageAuthoringConfigured: true });
  await assert.rejects(config.resolveProjectIds(), /Artseitenablage.*nicht vollständig lesbar/);
  createExplorerDeviceBackupProvider({ ...base, pageAuthoring: { backupProjectIds: async () => { throw new Error("page journal unreadable"); } } });
  await assert.rejects(config.resolveProjectIds(), /page journal unreadable/);
});
