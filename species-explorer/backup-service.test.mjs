import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "../scripts/test-temp.mjs";
import { createBackupService } from "./backup-service.mjs";

test("Gleichzeitiges Speichern verschiedener NAS-Pfade erhält lesbare vollständige Einstellungen", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "nas-settings-concurrent-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const localSettingsPath = join(repoRoot, "species-explorer", "local-settings.json");
  await mkdir(join(repoRoot, "species-explorer"), { recursive: true });
  await writeFile(localSettingsPath, JSON.stringify({ preferredView: "gallery" }));
  const options = { repoRoot, defaultBackupRoot: "W:\\Sicherungen", localSettingsPath,
    localSettingsFile: "local-settings.json", backupLogLineLimit: 10,
    isPipelineActive: () => false, isAssetWriteActive: () => false,
    spawnProcess() { throw new Error("Diese Einstellungsprüfung darf keine Sicherung starten."); } };
  const first = await createBackupService(options), second = await createBackupService(options);
  const paths = [`W:\\${"ü".repeat(490)}`, "W:\\kurz"];
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const order = attempt % 2 ? [...paths].reverse() : paths;
    await Promise.all([first.saveBackupSettings({ backupRoot: order[0] }), second.saveBackupSettings({ backupRoot: order[1] })]);
    const saved = JSON.parse(await readFile(localSettingsPath, "utf8"));
    assert.ok(paths.includes(saved.nasBackupRoot), "Eine vollständige gespeicherte Auswahl muss erhalten sein.");
    assert.equal(saved.preferredView, "gallery");
    assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));
  }
  const reopened = await createBackupService(options);
  assert.ok(paths.includes(reopened.publicSettingsPayload().backupRoot));
});

test("NAS-Dienst bindet drei Stände, geschützten Kontrollstand und sichere Rotationsvorschau", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "nas-service-retention-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const calls = [];
  const result = {
    backupRoot: "W:\\Sicherungen", archivePath: "W:\\Sicherungen\\new.zip",
    retentionPolicy: "two-newest-plus-oldest-verified-checkpoint",
    retainedCheckpoint: "W:\\Sicherungen\\older.zip",
    retainedArchivePaths: ["new.zip", "recent.zip", "older.zip"],
    protectedArchives: [{ path: "legacy.zip", reason: "Kein Prüfnachweis" }],
    rotationPlanRevision: "bound-plan", retentionWouldRemove: 4,
    retainedBackups: 3, removedBackups: 4,
  };
  const service = await createBackupService({ repoRoot, defaultBackupRoot: result.backupRoot,
    localSettingsPath: join(repoRoot, "species-explorer", "local-settings.json"),
    localSettingsFile: "local-settings.json", backupLogLineLimit: 10,
    isPipelineActive: () => false, isAssetWriteActive: () => false,
    spawnProcess(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      setImmediate(() => { child.stdout.emit("data", Buffer.from(JSON.stringify(result))); child.emit("close", 0); });
      return child;
    },
  });
  assert.equal(service.publicSettingsPayload().maxBackups, 3);
  assert.equal(service.publicSettingsPayload().retentionPolicy, result.retentionPolicy);
  const preview = await service.previewNasBackup();
  for (const key of ["retentionPolicy", "retainedCheckpoint", "retainedArchivePaths", "protectedArchives", "rotationPlanRevision", "retentionWouldRemove"]) {
    assert.deepEqual(preview[key], result[key]);
  }
  assert.match(preview.warnings.join(" "), /zwei jüngere.*älteren geschützten Kontrollstand/);
  assert.match(preview.warnings.join(" "), /unbekannte Altarchive.*geschützt/);
  assert.equal(calls[0].args[calls[0].args.indexOf("-MaxBackups") + 1], "3");
  assert.ok(calls[0].args.includes("-DryRun"));
  assert.equal(calls[0].options.windowsHide, true);
  service.startNasBackup();
  for (let attempt = 0; attempt < 20 && service.isBackupActive(); attempt += 1) await new Promise(setImmediate);
  assert.equal(service.getState().status, "completed");
  for (const key of ["retainedCheckpoint", "retainedArchivePaths", "protectedArchives", "rotationPlanRevision", "removedBackups"]) {
    assert.deepEqual(service.getState()[key], result[key]);
  }
});

async function deviceService(t, { provider, output = {}, spawnOverride } = {}) {
  const repoRoot = await mkdtemp(join(tmpdir(), "nas-device-service-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const calls = [];
  const service = await createBackupService({ repoRoot, defaultBackupRoot: "W:\\Fixture-Only",
    localSettingsPath: join(repoRoot, "settings.json"), localSettingsFile: "settings.json", backupLogLineLimit: 10,
    isPipelineActive: () => false, isAssetWriteActive: () => false, deviceBackupProvider: provider,
    spawnProcess(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      if (spawnOverride) spawnOverride(child);
      else setImmediate(() => { child.stdout.emit("data", Buffer.from(JSON.stringify(output))); child.emit("close", 0); });
      return child;
    },
  });
  async function idle() {
    for (let attempt = 0; attempt < 1000 && service.isBackupActive(); attempt++) await new Promise(setImmediate);
    assert.equal(service.isBackupActive(), false, "Der eigene Sicherungsauftrag muss vollständig abgeschlossen sein.");
  }
  return { service, calls, idle };
}
const deviceSummary = { deviceId: "device-fixture", projectIds: ["fixture-project"], stateHash: "a".repeat(64), pending: 2, fileCount: 3, totalBytes: 8192 };
const deviceResult = { ok: true, archivePath: "fixture.zip", includesDeviceProfiles: true, deviceSnapshotStateHash: deviceSummary.stateHash, devicePending: 2 };

test("bestehender NAS-Lauf und Vorschau warten auf persönliche Snapshots und ihre ausdrückliche Bestätigung", async (t) => {
  const events = [];
  const provider = { async prepare() { events.push("prepare"); return { manifestPath: "fixture-handoff.json", summary: deviceSummary,
    async assertSourcesUnchanged() { events.push("verify"); }, async dispose() { events.push("dispose"); } }; } };
  const { service, calls, idle } = await deviceService(t, { provider, output: deviceResult });
  assert.equal(calls.length, 0, "Kein zusätzlicher Sicherungslauf beim Einrichten.");
  const preview = await service.previewNasBackup(); assert.deepEqual(preview.deviceProfile, deviceSummary);
  assert.deepEqual(events, ["prepare", "verify", "verify", "dispose"]);
  events.length = 0; service.startNasBackup(); await idle();
  assert.deepEqual(events, ["prepare", "verify", "verify", "dispose"]);
  assert.equal(service.getState().status, "completed"); assert.deepEqual(service.getState().deviceProfile, deviceSummary);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.args[call.args.indexOf("-DeviceSnapshotManifest") + 1], "fixture-handoff.json");
    assert.equal(call.args.includes("-RequireDeviceSnapshot"), true);
  }
});

test("ein beschädigter Offlinebestand startet keinen ZIP-Prozess und wird nicht als Vollsicherung grün", async (t) => {
  const { service, calls, idle } = await deviceService(t, { provider: { async prepare() { throw new Error("Pendingqueue beschädigt"); } } });
  service.startNasBackup(); await idle(); assert.equal(calls.length, 0);
  assert.equal(service.getState().status, "failed"); assert.match(service.getState().error, /Pendingqueue beschädigt/);
});

test("ein eingerichteter Provider ohne Snapshot kann nicht still auf Repo-only zurückfallen", async (t) => {
  const { service, calls, idle } = await deviceService(t, { provider: { async prepare() { return null; } }, output: { ok: true } });
  service.startNasBackup(); await idle(); assert.equal(calls.length, 0); assert.equal(service.getState().status, "failed");
});

test("fehlende oder fremde Gerätebestätigung und fehlerhaftes Aufräumen verhindern Vollsicherungsstatus", async (t) => {
  for (const mode of ["missing-ack", "different-ack", "cleanup-failed", "source-changed"]) {
    let disposed = 0, checks = 0;
    const provider = { async prepare() { return { manifestPath: "fixture.json", summary: deviceSummary,
      async assertSourcesUnchanged() { if (++checks === 2 && mode === "source-changed") throw new Error("Original geändert"); },
      async dispose() { disposed++; if (mode === "cleanup-failed") throw new Error("Eigene Kopie nicht aufgeräumt"); } }; } };
    const output = mode === "missing-ack" ? { ok: true } : mode === "different-ack" ? { ...deviceResult, devicePending: 0 } : deviceResult;
    const { service, idle } = await deviceService(t, { provider, output }); service.startNasBackup(); await idle();
    assert.equal(service.getState().status, "failed", mode); assert.equal(disposed, 1, mode);
  }
});

test("Schließen während eigener Vorbereitung wartet auf deren Abbruch und startet keinen späteren Prozess", async (t) => {
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const provider = { prepare({ signal }) { started(); return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); } };
  const { service, calls } = await deviceService(t, { provider }); service.startNasBackup(); await ready; await service.close();
  assert.equal(calls.length, 0); assert.equal(service.getState().status, "failed"); assert.equal(service.isBackupActive(), false);
  assert.throws(() => service.startNasBackup(), /geschlossen/);
});

test("Prozessabbruch wartet auf close, bevor eigene Snapshotdateien freigegeben werden", async (t) => {
  const events = []; let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const provider = { async prepare() { return { manifestPath: "fixture.json", summary: deviceSummary,
    async assertSourcesUnchanged() {}, async dispose() { events.push("dispose"); } }; } };
  const { service } = await deviceService(t, { provider, spawnOverride(child) {
    child.pid = 12345;
    child.kill = () => { events.push("kill-owned-child"); setImmediate(() => { events.push("child-close"); child.emit("close", 1); }); };
    started();
  } });
  service.startNasBackup(); await ready; await service.close();
  assert.deepEqual(events, ["kill-owned-child", "child-close", "dispose"]); assert.equal(service.getState().status, "failed");
});

test("Spawnfehler plus späteres close führen zu genau einem Abschluss ohne grüne Erfolgsmeldung", async (t) => {
  let disposed = 0;
  const provider = { async prepare() { return { manifestPath: "fixture.json", summary: deviceSummary,
    async assertSourcesUnchanged() {}, async dispose() { disposed++; } }; } };
  const { service, idle } = await deviceService(t, { provider, spawnOverride(child) {
    setImmediate(() => { child.emit("error", new Error("Fixture Spawnfehler")); child.stdout.emit("data", Buffer.from(JSON.stringify(deviceResult))); child.emit("close", 0); });
  } });
  service.startNasBackup(); await idle(); assert.equal(disposed, 1); assert.equal(service.getState().status, "failed");
});
