import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "./test-temp.mjs";
import { createManagedTempSession } from "../species-explorer/temp-session.mjs";
import { createSharedProjectClientStore } from "../species-explorer/shared-project/client-store.mjs";
import { createDeviceBackupProvider, validateDeviceBackupCopy } from "../species-explorer/shared-project/device-backup.mjs";

const source = await fs.readFile(new URL("./nas-backup.ps1", import.meta.url), "utf8");
const DEVICE = "device-7576917a-eb55-4850-98a6-e382137c22ec";
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const specs = [{ id: "device", relativePath: "device.json", kind: "device-profile", required: true },
  { id: "cache", relativePath: "project-cache.sqlite", kind: "client-cache", required: true }];
async function command(executable, args, cwd) {
  const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() })); });
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "nasdevice-")), repoRoot = path.join(root, "repo"), profileRoot = path.join(root, "Profil mit Umlaut ü"), nas = path.join(root, "nas-fixture");
  await fs.mkdir(path.join(repoRoot, "scripts"), { recursive: true }); await fs.mkdir(profileRoot); await fs.mkdir(nas);
  await fs.writeFile(path.join(repoRoot, "scripts", "nas-backup.ps1"), source);
  await fs.copyFile(new URL("./nas-backup-retention.ps1", import.meta.url), path.join(repoRoot, "scripts", "nas-backup-retention.ps1"));
  await fs.writeFile(path.join(repoRoot, ".gitignore"), "temp/\n"); await fs.writeFile(path.join(repoRoot, "README.md"), "Isolated small backup fixture\n");
  for (const args of [["init", "--quiet"], ["remote", "add", "origin", "https://example.invalid/backup-fixture.git"], ["add", "."],
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Fixture only"]]) {
    const result = await command("git", args, repoRoot); assert.equal(result.code, 0, result.stderr);
  }
  await fs.writeFile(path.join(profileRoot, "device.json"), JSON.stringify({ schemaVersion: 1, id: DEVICE, name: "Fixture-PC" }));
  await fs.writeFile(path.join(profileRoot, "credential.bin"), "fictional-secret-never-package");
  const store = createSharedProjectClientStore({ filename: path.join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true });
  const user = store.bind({ baseUrl: "https://example.invalid", projectId: "fixture-project", user: { id: "fixture-user", username: "fixture", displayName: "Fixture", role: "admin" } });
  store.saveObjects(user.id, [{ kind: "page", id: "page-a", revision: "rev-a", data: { title: "Initial" } }]);
  store.edit(user.id, "page", "page-a", { title: "Saved while offline" });
  const session = await createManagedTempSession({ repoRoot }), provider = createDeviceBackupProvider({ profileRoot, deviceId: DEVICE,
    resolveProjectIds: async () => ["fixture-project"], files: specs, tempSession: session }), snapshots = [];
  t.after(async () => { for (const snapshot of snapshots) await snapshot.dispose(); store.close(); await session.close(); await fs.rm(assertTestTempPath(root), { recursive: true, force: true }); });
  return { root, repoRoot, profileRoot, nas, store, user, session,
    async prepare() { const snapshot = await provider.prepare(); snapshots.push(snapshot); return snapshot; },
    async backup(snapshot) { return command("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(repoRoot, "scripts", "nas-backup.ps1"),
      "-BackupRoot", nas, "-DeviceSnapshotManifest", snapshot.manifestPath], repoRoot); },
  };
}

test("NAS source keeps device snapshots inside the existing verified v2/rotation flow", () => {
  assert.match(source, /\[string\]\$DeviceSnapshotManifest/);
  assert.match(source, /\$sourceRecords \+= @\(\$deviceSnapshotPlan\.records\)/);
  assert.match(source, /\$afterRecords \+= @\(\$checkedDevicePlan\.records\)/);
  assert.match(source, /deviceProfiles = @\(/);
  assert.ok(source.indexOf("$checkedDevicePlan = Get-DeviceSnapshotPlan") < source.indexOf("Move-Item -LiteralPath $pendingArchivePath"));
  assert.ok(source.indexOf("Move-Item -LiteralPath $pendingArchivePath") < source.indexOf('$rotationPlan = Get-NasRetentionPlan', source.indexOf("Move-Item -LiteralPath $pendingArchivePath")));
  assert.doesNotMatch(source, /[^\x00-\x7f]/);
});

test("actual small isolated PS ZIP includes live-WAL offline data; independent restore verifies and unchanged state skips", { skip: process.platform !== "win32" }, async (t) => {
  const f = await fixture(t), snapshot = await f.prepare();
  const original = await fs.readFile(path.join(f.profileRoot, "project-cache.sqlite")), wal = await fs.readFile(path.join(f.profileRoot, "project-cache.sqlite-wal"));
  const run = await f.backup(snapshot); assert.equal(run.code, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout); assert.equal(result.ok, true); assert.equal(result.skipped, false);
  assert.equal(result.deviceSnapshotStateHash, snapshot.summary.stateHash); assert.equal(result.devicePending, 1);
  assert.equal(result.includesDeviceProfiles, true);
  const extracted = path.join(f.root, "separate-restore-copy");
  const extract = await command("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${quote(result.archivePath)}, ${quote(extracted)})`], f.root);
  assert.equal(extract.code, 0, extract.stderr);
  const manifest = JSON.parse(await fs.readFile(path.join(extracted, "backup-manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 2); assert.equal(manifest.deviceProfiles[0].deviceId, DEVICE);
  assert.equal(manifest.includesDeviceProfiles, true);
  assert.equal(manifest.files.some((file) => /credential\.bin|handoff\.json/.test(file.path)), false);
  const copy = await validateDeviceBackupCopy({ directory: path.join(extracted, "device-profiles", DEVICE), expectedDeviceId: DEVICE,
    expectedProjectIds: ["fixture-project"], files: specs, activeProfileRoot: f.profileRoot });
  assert.equal(copy.pending, 1); assert.deepEqual(await fs.readFile(path.join(f.profileRoot, "project-cache.sqlite")), original);
  assert.deepEqual(await fs.readFile(path.join(f.profileRoot, "project-cache.sqlite-wal")), wal);
  const fresh = await f.prepare(); assert.equal(fresh.summary.stateHash, snapshot.summary.stateHash);
  const second = await f.backup(fresh); assert.equal(second.code, 0, second.stderr || second.stdout); assert.equal(JSON.parse(second.stdout).skipped, true);
});

test("PS rejects tampered snapshots and a source change during ZIP, preserving previous archives without rotation", { skip: process.platform !== "win32" }, async (t) => {
  const f = await fixture(t), first = await f.prepare(), saved = await f.backup(first); assert.equal(saved.code, 0, saved.stderr || saved.stdout);
  const archivePath = JSON.parse(saved.stdout).archivePath, archiveHash = sha(await fs.readFile(archivePath));
  const handoff = JSON.parse(await fs.readFile(first.manifestPath, "utf8")), entry = handoff.files.find((file) => file.path.endsWith("project-cache.sqlite"));
  const bytes = await fs.readFile(entry.sourcePath); await fs.appendFile(entry.sourcePath, "tampered");
  const tampered = await f.backup(first); assert.notEqual(tampered.code, 0); assert.match(tampered.stderr, /Snapshotdatei/);
  await fs.writeFile(entry.sourcePath, bytes);
  const scriptFile = path.join(f.repoRoot, "scripts", "nas-backup.ps1"), device = path.join(f.profileRoot, "device.json");
  const changed = JSON.stringify({ schemaVersion: 1, id: DEVICE, name: "Changed in the middle of this isolated ZIP" });
  const encodedPath = Buffer.from(device, "utf8").toString("base64");
  const injection = `[IO.File]::WriteAllText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}')), ${quote(changed)})\n  `;
  await fs.writeFile(scriptFile, source.replace("$verifiedArchive = Test-NasArchiveContents -ArchivePath $pendingArchivePath", injection + "$verifiedArchive = Test-NasArchiveContents -ArchivePath $pendingArchivePath"));
  const during = await f.backup(first); assert.notEqual(during.code, 0, during.stdout); assert.match(during.stderr, /Offline-Daten wurden/);
  assert.equal(sha(await fs.readFile(archivePath)), archiveHash);
  assert.deepEqual(await fs.readdir(f.nas), [path.basename(archivePath)]);
});

test("unchanged-source skip rechecks personal originals after archive verification and before rotation", { skip: process.platform !== "win32" }, async (t) => {
  const f = await fixture(t), snapshot = await f.prepare(), marker = path.join(f.root, "change-during-archive-check.flag");
  const device = path.join(f.profileRoot, "device.json"), encode = (value) => `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(value).toString("base64")}'))`;
  const line = "$rotationPlan = Get-NasRetentionPlan -BackupRoot $backupRootResolved -MaxBackups $MaxBackups -ExpectedProjectId $projectId -VerifiedProofs @($latestVerified)";
  const changed = JSON.stringify({ schemaVersion: 1, id: DEVICE, name: "Changed during existing archive checks" });
  const injected = source.replace(line, `${line}\n  if ([IO.File]::Exists(${encode(marker)})) { [IO.File]::WriteAllText(${encode(device)}, ${quote(changed)}) }`);
  await fs.writeFile(path.join(f.repoRoot, "scripts", "nas-backup.ps1"), injected);
  const first = await f.backup(snapshot); assert.equal(first.code, 0, first.stderr || first.stdout);
  const archive = JSON.parse(first.stdout).archivePath, before = sha(await fs.readFile(archive));
  await fs.writeFile(marker, "fixture-only");
  const second = await f.backup(snapshot); assert.notEqual(second.code, 0); assert.match(second.stderr, /Offline-Daten wurden/);
  assert.equal(sha(await fs.readFile(archive)), before); assert.deepEqual(await fs.readdir(f.nas), [path.basename(archive)]);
});

test("a routine explicitly requiring personal data stops before any NAS operation if its trusted snapshot is missing", { skip: process.platform !== "win32" }, async (t) => {
  const f = await fixture(t);
  const run = await command("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    path.join(f.repoRoot, "scripts", "nas-backup.ps1"), "-RequireDeviceSnapshot"], f.repoRoot);
  assert.notEqual(run.code, 0); assert.match(run.stderr, /Offline-Sicherung benoetigt/); assert.deepEqual(await fs.readdir(f.nas), []);
});
