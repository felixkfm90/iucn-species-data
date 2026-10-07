import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "../scripts/test-temp.mjs";
import { createBackupService } from "./backup-service.mjs";

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
