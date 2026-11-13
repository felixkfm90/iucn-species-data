import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createSharedProjectStore } from "../species-explorer/shared-project/store.mjs";
import { species } from "../species-explorer/shared-project/test-fixtures.mjs";
import { assertProjectMediaSchema } from "../species-explorer/shared-project/image-media.mjs";
import { assertNormalMediaSchema } from "../species-explorer/shared-project/normal-media-schema.mjs";
import { tmpdir, assertTestTempPath } from "../scripts/test-temp.mjs";
import { createNasServiceConfiguration, writeNasServiceConfiguration } from "./configure.mjs";
import { createSharedProjectSnapshot, exportSharedProjectSnapshot, runScheduledProjectBackup, validateAndRestoreSharedProjectSnapshot, verifySharedProjectSnapshot } from "./snapshot.mjs";
import { verifyProjectSnapshotUpgrade } from "./upgrade-rehearsal.mjs";
import { stageSharedProjectUpgrade } from "./stage-upgrade.mjs";

const projectId = "11111111-1111-4111-8111-111111111111";
function previousFive(db) {
  db.exec("DROP TABLE normal_media_assets; DROP TABLE normal_media_blobs; DELETE FROM meta WHERE key='reader_media_generation'; PRAGMA user_version=5;");
}
async function originalBytes(filename) {
  return Promise.all(["", "-wal"].map(async (suffix) => ({ suffix, bytes: await fs.readFile(filename + suffix).catch((error) => { if (error.code === "ENOENT") return null; throw error; }) })));
}
async function fixture(t, { users = null, separateDatabaseDirectory = false } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "nas-snapshot-"));
  const dataRoot = separateDatabaseDirectory ? path.join(root, "active") : root;
  if (separateDatabaseDirectory) await fs.mkdir(dataRoot);
  const filename = path.join(dataRoot, "live.sqlite");
  const store = createSharedProjectStore({ filename, localStorageConfirmed: true });
  const writer = new DatabaseSync(filename);
  writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
  t.after(async () => { writer.close(); store.close(); await fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }); });
  if (users) await store.bootstrap({ confirmed: true, users });
  else {
    writer.prepare("INSERT INTO meta VALUES ('project_id',?)").run(projectId);
    writer.prepare("INSERT INTO users VALUES (?,?,?,?,?,0,1,?)").run("author", "synthetic", "Synthetic person", "synthetic-nonlogin", "admin", new Date().toISOString());
  }
  const author = writer.prepare("SELECT id FROM users ORDER BY username LIMIT 1").get().id;
  const insert = writer.prepare("INSERT INTO audit(actor_id,action,target,created_at) VALUES (?,?,?,?)");
  writer.exec("BEGIN");
  for (let i = 0; i < 100; i++) insert.run(author, "synthetic-write", `row-${i}-${"x".repeat(1500)}`, "2026-10-31");
  writer.exec("COMMIT");
  return { root, filename, writer, store };
}

test("NAS-Sicherung enthält echte noch nicht eingecheckte WAL-Daten und wird getrennt bytegleich wiederhergestellt", async (t) => {
  const f = await fixture(t), destination = path.join(f.root, "snapshot");
  const revision = "22222222-2222-4222-8222-222222222222", receiptBodies = ['{"fixture":"Bildtextbeleg"}', '{"fixture":"Artseitenbeleg"}'];
  f.writer.prepare("INSERT INTO versions VALUES ('page','fixture-page',?,1,NULL,?,'author','2026-10-31')").run(revision, '{"title":"Fixture page"}');
  f.writer.prepare("INSERT INTO objects VALUES ('page','fixture-page',?,NULL)").run(revision);
  for (const [index, table] of ["website_alt_receipts", "page_authoring_receipts"].entries()) {
    f.writer.prepare(`INSERT INTO ${table} VALUES (?,'fixture-page',?,?)`).run(`receipt-${index}`, revision, receiptBodies[index]);
  }
  assert.ok((await fs.stat(`${f.filename}-wal`)).size > 0);
  const original = await fs.readFile(f.filename);
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination, localStorageConfirmed: true });
  assert.equal(manifest.projectId, projectId); assert.equal(manifest.counts.audit, 100);
  assert.equal(manifest.databaseSchema, 6); assert.equal(manifest.counts.website_alt_receipts, 1); assert.equal(manifest.counts.page_authoring_receipts, 1);
  assert.equal(manifest.counts.normal_media_assets, 0); assert.equal(manifest.counts.normal_media_blobs, 0);
  assert.deepEqual(await fs.readFile(f.filename), original);
  assert.equal(f.writer.prepare("SELECT count(*) AS n FROM audit").get().n, 100);
  f.writer.prepare("INSERT INTO audit(action,created_at) VALUES (?,?)").run("after-backup", "2026-10-31");
  const target = path.join(f.root, "restored.sqlite");
  const result = await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: destination, destination: target, localStorageConfirmed: true });
  assert.equal(result.verified, true); assert.equal(result.existingProjectReplaced, false);
  const probe = new DatabaseSync(target, { readOnly: true });
  try {
    assert.equal(probe.prepare("SELECT count(*) AS n FROM audit").get().n, 100);
    assert.equal(probe.prepare("PRAGMA user_version").get().user_version, 6);
    assert.deepEqual(["website_alt_receipts", "page_authoring_receipts"].map((table) => probe.prepare(`SELECT body FROM ${table}`).get().body), receiptBodies);
  } finally { probe.close(); }
  assert.equal(f.writer.prepare("SELECT count(*) AS n FROM audit").get().n, 101);
});

test("der fertige Sicherungsnachweis ist während eines Teilschreibvorgangs noch nicht sichtbar", async (t) => {
  const f = await fixture(t), destination = path.join(f.root, "snapshot"), manifestFile = path.join(destination, "snapshot.json");
  const write = fs.writeFile;
  let visibleDuringWrite;
  t.mock.method(fs, "writeFile", async (filename, data, options) => {
    if (path.dirname(filename) !== destination || !filename.endsWith(".json")) return write(filename, data, options);
    const cut = Math.floor(data.length / 2);
    await write(filename, data.slice(0, cut), options);
    visibleDuringWrite = await fs.stat(manifestFile).then(() => true, error => {
      if (error.code !== "ENOENT") throw error;
      return false;
    });
    if (!visibleDuringWrite) await assert.rejects(verifySharedProjectSnapshot({ snapshotDirectory: destination, localStorageConfirmed: true }), { code: "ENOENT" });
    await fs.appendFile(filename, data.slice(cut));
  });
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination, localStorageConfirmed: true });
  assert.equal(visibleDuringWrite, false);
  assert.deepEqual(JSON.parse(await fs.readFile(manifestFile, "utf8")), manifest);
  assert.deepEqual((await fs.readdir(destination)).sort(), ["project.sqlite", "snapshot.json"]);
});

test("der Sicherungsauftrag kann die fertige Datenbank und den Nachweis schreibgeschützt prüfen", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "snapshot");
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  const options = { snapshotDirectory, localStorageConfirmed: true };
  const target = path.join(snapshotDirectory, "project.sqlite"), manifestFile = path.join(snapshotDirectory, "snapshot.json");
  const before = await Promise.all([fs.readFile(target), fs.readFile(manifestFile)]);
  const result = { verified: true, projectId, counts: manifest.counts, sha256: manifest.sha256 };
  assert.deepEqual(await verifySharedProjectSnapshot(options), result);
  const script = fileURLToPath(new URL("./snapshot.mjs", import.meta.url));
  const command = spawnSync(process.execPath, ["--no-warnings", script, "verify", snapshotDirectory, "--confirm-local-storage"],
    { encoding: "utf8", timeout: 10000, windowsHide: true });
  assert.equal(command.status, 0, command.stderr || command.error?.message);
  assert.deepEqual(JSON.parse(command.stdout), result);
  assert.deepEqual(await Promise.all([fs.readFile(target), fs.readFile(manifestFile)]), before);
  assert.deepEqual((await fs.readdir(snapshotDirectory)).sort(), ["project.sqlite", "snapshot.json"]);

  await fs.writeFile(`${target}-wal`, "Synthetische Begleitdatei");
  await assert.rejects(verifySharedProjectSnapshot(options), /SQLite-Begleitdateien/);
  await fs.unlink(`${target}-wal`);
  await fs.writeFile(manifestFile, JSON.stringify({ ...manifest, counts: { ...manifest.counts, audit: 99 } }));
  await assert.rejects(verifySharedProjectSnapshot(options), /Projektinhalt passt nicht/);
  await fs.writeFile(manifestFile, before[1]);
  await fs.appendFile(target, "Synthetisch veränderte Bytes");
  await assert.rejects(verifySharedProjectSnapshot(options), /Sicherungsbytes/);
});

test("der NAS-Export kopiert die geprüfte Sicherung bytegleich und lässt sich am Ziel separat wiederherstellen", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "staging"), destination = path.join(f.root, "separater-export");
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  const original = await originalBytes(f.filename);
  const script = fileURLToPath(new URL("./snapshot.mjs", import.meta.url));
  const command = spawnSync(process.execPath, ["--no-warnings", script, "export-copy", snapshotDirectory, destination, "--confirm-local-storage"],
    { encoding: "utf8", timeout: 10000, windowsHide: true });
  assert.equal(command.status, 0, command.stderr || command.error?.message);
  assert.deepEqual(JSON.parse(command.stdout), { verified: true, projectId, counts: manifest.counts, sha256: manifest.sha256, existingProjectReplaced: false, exported: true });
  assert.deepEqual((await fs.readdir(destination)).sort(), ["project.sqlite", "snapshot.json"]);
  for (const name of ["project.sqlite", "snapshot.json"]) {
    assert.deepEqual(await fs.readFile(path.join(destination, name)), await fs.readFile(path.join(snapshotDirectory, name)));
  }
  const target = path.join(f.root, "export-restore.sqlite");
  assert.equal((await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: destination, destination: target, localStorageConfirmed: true })).sha256, manifest.sha256);
  assert.deepEqual(await originalBytes(f.filename), original);
});

test("der NAS-Export lässt vorhandene Ziele und unvollständige Quellsicherungen unangetastet", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "staging"), destination = path.join(f.root, "vorhandenes-ziel");
  await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  await fs.mkdir(destination); await fs.writeFile(path.join(destination, "behalten.txt"), "Eigene Testdatei");
  const options = { snapshotDirectory, localStorageConfirmed: true };
  await assert.rejects(exportSharedProjectSnapshot({ ...options, destination }), { code: "EEXIST" });
  assert.deepEqual(await fs.readdir(destination), ["behalten.txt"]);
  await assert.rejects(exportSharedProjectSnapshot({ ...options, destination: path.join(snapshotDirectory, "inneres-ziel") }), /außerhalb/);
  const sidecar = path.join(snapshotDirectory, "project.sqlite-wal"), unused = path.join(f.root, "unbenutztes-ziel");
  await fs.writeFile(sidecar, "Unvollständiger Prüfstand");
  await assert.rejects(exportSharedProjectSnapshot({ ...options, destination: unused }), /SQLite-Begleitdateien/);
  await assert.rejects(fs.stat(unused), { code: "ENOENT" });
  assert.equal(await fs.readFile(sidecar, "utf8"), "Unvollständiger Prüfstand");
});

test("ein abgebrochener NAS-Export bleibt ohne fertigen Nachweis und verlangt beim Wiederholen einen neuen Zielordner", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "staging"), destination = path.join(f.root, "abgebrochener-export");
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  const write = fs.writeFile;
  t.mock.method(fs, "writeFile", async (filename, data, options) => {
    if (filename !== path.join(destination, "snapshot.partial.json")) return write(filename, data, options);
    await write(filename, data.slice(0, 10), options);
    assert.deepEqual(await fs.readFile(path.join(destination, "project.sqlite")), await fs.readFile(path.join(snapshotDirectory, "project.sqlite")));
    await assert.rejects(verifySharedProjectSnapshot({ snapshotDirectory: destination, localStorageConfirmed: true }), { code: "ENOENT" });
    throw new Error("Synthetische Schreibunterbrechung");
  });
  await assert.rejects(exportSharedProjectSnapshot({ snapshotDirectory, destination, localStorageConfirmed: true }), /Synthetische Schreibunterbrechung/);
  await assert.rejects(verifySharedProjectSnapshot({ snapshotDirectory: destination, localStorageConfirmed: true }), { code: "ENOENT" });
  await assert.rejects(exportSharedProjectSnapshot({ snapshotDirectory, destination, localStorageConfirmed: true }), { code: "EEXIST" });
  assert.equal((await verifySharedProjectSnapshot({ snapshotDirectory, localStorageConfirmed: true })).sha256, manifest.sha256);
});

const targetId = "33333333-3333-4333-8333-333333333333";
async function scheduledFixture(t) {
  const f = await fixture(t, { separateDatabaseDirectory: true });
  const stagingRoot = path.join(path.dirname(f.filename), "staging"), targetRoot = path.join(f.root, "backup-target");
  await fs.mkdir(stagingRoot); await fs.mkdir(targetRoot);
  return { ...f, stagingRoot, targetRoot, marker: path.join(targetRoot, ".arten-explorer-backup-target"), expectedTargetId: targetId, localStorageConfirmed: true };
}

test("der geplante NAS-Lauf sichert, exportiert und prüft im Ziel, bevor er seine Zwischenkopie entfernt", async (t) => {
  const f = await scheduledFixture(t), before = await originalBytes(f.filename);
  await fs.writeFile(f.marker, `${targetId}\n`);
  const script = fileURLToPath(new URL("./snapshot.mjs", import.meta.url));
  const command = spawnSync(process.execPath, ["--no-warnings", script, "run-backup", f.filename, f.stagingRoot, f.targetRoot, targetId, "--confirm-local-storage"],
    { encoding: "utf8", timeout: 10000, windowsHide: true });
  assert.equal(command.status, 0, command.stderr || command.error?.message);
  const result = JSON.parse(command.stdout);
  assert.match(result.runId, /^snapshot-[a-f0-9-]{36}$/);
  assert.equal(result.stagingRemoved, true);
  assert.deepEqual(await fs.readdir(f.stagingRoot), []);
  const snapshotDirectory = path.join(f.targetRoot, result.runId);
  const restored = await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: path.join(f.root, "restore-check.sqlite"), localStorageConfirmed: true });
  assert.equal(result.verified, true); assert.equal(result.projectId, projectId); assert.equal(result.sha256, restored.sha256);
  assert.equal(result.counts.audit, 100);
  assert.deepEqual(await originalBytes(f.filename), before);
});

test("der geplante NAS-Lauf exportiert nur das erwartete Projekt", async (t) => {
  const f = await scheduledFixture(t), before = await originalBytes(f.filename);
  await fs.writeFile(f.marker, `${targetId}\n`);
  await assert.rejects(runScheduledProjectBackup({ ...f, expectedProjectId: targetId }), { code: "BACKUP_SOURCE_PROJECT_MISMATCH" });

  const script = fileURLToPath(new URL("./snapshot.mjs", import.meta.url));
  const run = (expectedProjectId) => spawnSync(process.execPath, ["--no-warnings", script, "run-backup", f.filename, f.stagingRoot,
    f.targetRoot, targetId, "--expect-project", expectedProjectId, "--confirm-local-storage"],
  { encoding: "utf8", timeout: 10000, windowsHide: true });
  const rejected = run(targetId);
  assert.equal(rejected.status, 1, rejected.error?.message);
  assert.match(rejected.stderr, /Projektdatenbank gehört nicht zum erwarteten Projekt/);
  assert.equal(rejected.stdout, "");
  assert.deepEqual(await fs.readdir(f.stagingRoot), []);
  assert.deepEqual(await fs.readdir(f.targetRoot), [".arten-explorer-backup-target"]);

  const accepted = run(projectId);
  assert.equal(accepted.status, 0, accepted.stderr || accepted.error?.message);
  const result = JSON.parse(accepted.stdout);
  const verified = await verifySharedProjectSnapshot({ snapshotDirectory: path.join(f.targetRoot, result.runId), localStorageConfirmed: true });
  assert.equal(result.verified, true);
  assert.equal(result.projectId, projectId);
  assert.equal(verified.projectId, projectId);
  assert.equal(verified.sha256, result.sha256);
  assert.deepEqual(await fs.readdir(f.stagingRoot), []);
  assert.deepEqual(await originalBytes(f.filename), before);
});

test("der geplante NAS-Lauf hält bei fehlender, fremder oder falsch platzierter Zielkennung vor dem Snapshot an", async (t) => {
  const f = await scheduledFixture(t);
  await assert.rejects(runScheduledProjectBackup(f), { code: "ENOENT" });
  await fs.writeFile(f.marker, `${projectId}\n`);
  await assert.rejects(runScheduledProjectBackup(f), /Kennung.*stimmt nicht/);
  await assert.rejects(runScheduledProjectBackup({ ...f, targetRoot: path.dirname(f.filename) }), /getrennte Zielpfade/);
  assert.deepEqual(await fs.readdir(f.stagingRoot), []);
  assert.deepEqual(await fs.readdir(f.targetRoot), [".arten-explorer-backup-target"]);
});

test("der geplante NAS-Lauf erkennt ein nach dem Snapshot ausgetauschtes Ziel trotz gleicher Kennung", async (t) => {
  const f = await scheduledFixture(t), displaced = path.join(f.root, "ursprüngliches-ziel");
  await fs.writeFile(f.marker, `${targetId}\n`);
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (source, destination) => {
    await rename(source, destination);
    if (path.basename(destination) !== "snapshot.json" || path.dirname(path.dirname(destination)) !== f.stagingRoot) return;
    await rename(assertTestTempPath(f.targetRoot), assertTestTempPath(displaced));
    await fs.mkdir(f.targetRoot); await fs.writeFile(f.marker, `${targetId}\n`);
  });
  await assert.rejects(runScheduledProjectBackup(f), /nicht mehr eingebunden/);
  assert.deepEqual(await fs.readdir(f.targetRoot), [".arten-explorer-backup-target"]);
  const [runId] = await fs.readdir(f.stagingRoot);
  assert.ok(runId);
  assert.equal((await verifySharedProjectSnapshot({ snapshotDirectory: path.join(f.stagingRoot, runId), localStorageConfirmed: true })).verified, true);
});

test("der geplante NAS-Lauf erhält zusätzliche Dateien in der Zwischenablage", async (t) => {
  const f = await scheduledFixture(t);
  await fs.writeFile(f.marker, `${targetId}\n`);
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (source, destination) => {
    await rename(source, destination);
    const directory = path.dirname(destination);
    if (path.basename(destination) !== "snapshot.json" || path.dirname(directory) !== f.targetRoot) return;
    await fs.writeFile(path.join(f.stagingRoot, path.basename(directory), "behalten.txt"), "Zusätzliche Testdatei");
  });
  const result = await runScheduledProjectBackup(f);
  assert.equal(result.verified, true);
  assert.equal(result.stagingRemoved, false);
  const staging = path.join(f.stagingRoot, result.runId);
  assert.deepEqual((await fs.readdir(staging)).sort(), ["behalten.txt", "project.sqlite", "snapshot.json"]);
  assert.equal(await fs.readFile(path.join(staging, "behalten.txt"), "utf8"), "Zusätzliche Testdatei");
});

test("bekanntes Schema 1 bleibt ohne Migration bytegleich sicherbar und getrennt wiederherstellbar", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "snapshot"), target = path.join(f.root, "restore.sqlite");
  previousFive(f.writer);
  f.writer.exec("DROP TABLE image_media_assets; DROP TABLE image_media_blobs; DROP TABLE page_authoring_receipts; DROP TABLE website_alt_receipts; DROP TRIGGER objects_insert_generation; DROP TRIGGER objects_update_generation; DELETE FROM meta WHERE key='objects_generation'; PRAGMA user_version=1;");
  const before = await fs.readFile(f.filename), manifest = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  assert.equal(manifest.databaseSchema, 1); assert.equal(manifest.counts.audit, 100);
  assert.equal(Object.hasOwn(manifest.counts, "website_alt_receipts"), false); assert.equal(Object.hasOwn(manifest.counts, "page_authoring_receipts"), false);
  const result = await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: target, localStorageConfirmed: true });
  assert.equal(result.verified, true); assert.deepEqual(await fs.readFile(f.filename), before);
  const probe = new DatabaseSync(target, { readOnly: true });
  try { assert.equal(probe.prepare("PRAGMA user_version").get().user_version, 1); } finally { probe.close(); }
  assert.equal(f.writer.prepare("PRAGMA user_version").get().user_version, 1, "die aktive Quelle wird nicht migriert");
});

test("Restorekopie lehnt vorhandene SQLite-Begleitdateien am neuen Ziel ab", async (t) => {
  const f = await fixture(t), directory = path.join(f.root, "snapshot");
  await createSharedProjectSnapshot({ filename: f.filename, destination: directory, localStorageConfirmed: true });
  for (const [index, suffix] of ["-wal", "-shm", "-journal"].entries()) {
    const target = path.join(f.root, `restore-${index}.sqlite`), sidecar = target + suffix;
    await fs.writeFile(sidecar, "Fremder vorhandener SQLite-Bestand");
    await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: directory, destination: target, localStorageConfirmed: true }), /SQLite-Begleitdatei/);
    await assert.rejects(fs.access(target), { code: "ENOENT" });
    assert.equal(await fs.readFile(sidecar, "utf8"), "Fremder vorhandener SQLite-Bestand");
  }
});

test("Restorekopie entfernt nur die eigene Datenbank, wenn nach dem Kopieren eine Begleitdatei auftaucht", async (t) => {
  const f = await fixture(t), directory = path.join(f.root, "snapshot"), target = path.join(f.root, "restore.sqlite");
  const sidecar = target + "-wal", copyFile = fs.copyFile;
  await createSharedProjectSnapshot({ filename: f.filename, destination: directory, localStorageConfirmed: true });
  t.mock.method(fs, "copyFile", async (source, destination, flags) => {
    await copyFile(source, destination, flags);
    if (destination === target) await fs.writeFile(sidecar, "Anderer Schreiber", { flag: "wx" });
  });
  await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: directory, destination: target, localStorageConfirmed: true }), /SQLite-Begleitdatei/);
  await assert.rejects(fs.access(target), { code: "ENOENT" });
  assert.equal(await fs.readFile(sidecar, "utf8"), "Anderer Schreiber");
});

test("Restorekopie lässt eine nach dem Kopieren veränderte Zieldatei zur Prüfung liegen", async (t) => {
  const f = await fixture(t), directory = path.join(f.root, "snapshot"), target = path.join(f.root, "restore.sqlite");
  const copyFile = fs.copyFile;
  await createSharedProjectSnapshot({ filename: f.filename, destination: directory, localStorageConfirmed: true });
  t.mock.method(fs, "copyFile", async (source, destination, flags) => {
    await copyFile(source, destination, flags);
    if (destination === target) await fs.writeFile(target, "Fremde Fassung");
  });
  await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: directory, destination: target, localStorageConfirmed: true }), /Zieldatei hat sich verändert und bleibt/);
  assert.equal(await fs.readFile(target, "utf8"), "Fremde Fassung");
});

test("historisches genaues Schema 4 bleibt ohne neue Bildtabellen sicherbar und wird nicht migriert", async (t) => {
  const f = await fixture(t); previousFive(f.writer); f.writer.exec("DROP TABLE image_media_assets; DROP TABLE image_media_blobs; PRAGMA user_version=4;");
  const before = await fs.readFile(f.filename), snapshotDirectory = path.join(f.root, "old-four"), target = path.join(f.root, "four-copy.sqlite");
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  assert.equal(manifest.databaseSchema, 4); assert.equal(Object.hasOwn(manifest.counts, "image_media_blobs"), false);
  await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: target, localStorageConfirmed: true });
  assert.deepEqual(await fs.readFile(f.filename), before);
  const probe = new DatabaseSync(target, { readOnly: true });
  try { assert.equal(probe.prepare("PRAGMA user_version").get().user_version, 4); } finally { probe.close(); }
});

test("Schema-4-WAL-Snapshot wird getrennt auf Schema 6 migriert und erhält Konten, Geräte, Fassungen, Freigaben und historische Belegbytes", async (t) => {
  const password = "Synthetic migration password 2026!", users = ["alpha", "beta"].map(name => ({
    username: `upgrade-${name}`, displayName: `Synthetic ${name}`, password,
  })), f = await fixture(t, { users }), sessions = [];
  const admin = await f.store.login({ username: users[0].username, password }); sessions.push(admin);
  sessions.push(await f.store.login({ username: users[1].username, password }));
  for (const role of ["publisher", "contributor", "reader"]) {
    const username = `upgrade-${role}`;
    await f.store.createUser(admin.token, { username, displayName: `Synthetic ${role}`, password, role });
    sessions.push(await f.store.login({ username, password, ...(role === "reader" ? { deviceLabel: "Synthetic reader device", scope: "read" } : {}) }));
  }
  const publisher = sessions.find(value => value.user.role === "publisher"), contributor = sessions.find(value => value.user.role === "contributor"),
    reader = sessions.find(value => value.user.role === "reader"), approvedData = species("upgrade-owl", "Vor dem Upgrade freigegebener Fachtext");
  const created = f.store.createObject(contributor.token, { kind: "species", id: approvedData.id, data: approvedData });
  f.store.approveObject(publisher.token, "species", created.id, { expectedRevision: created.revision,
    expectedReview: { projectId: admin.projectId, userId: publisher.user.id, role: publisher.user.role } });
  const changed = f.store.submitChange(contributor.token, { changeId: "upgrade-open-draft", kind: "species", id: created.id,
    baseRevision: created.revision, data: species(created.id, "Noch nicht freigegebener neuer Entwurf") });
  assert.equal(changed.status, "applied");
  const conflict = f.store.submitChange(contributor.token, { changeId: "upgrade-open-conflict", kind: "species", id: created.id,
    baseRevision: created.revision, data: species(created.id, "Abweichender Entwurf vom zweiten Rechner") });
  assert.equal(conflict.status, "conflict");
  const page = f.store.createObject(admin.token, { kind: "page", id: "upgrade-historical-page", data: { title: "Synthetic historical page" } });
  // Historical receipt payloads are opaque fixture bytes, not invented CMS/publication success.
  // Their actual version/author/project links are retained; this case tests preservation only.
  for (const [index, table] of ["website_alt_receipts", "page_authoring_receipts"].entries()) {
    f.writer.prepare(`INSERT INTO ${table} VALUES (?,?,?,?)`).run(`upgrade-receipt-${index}`, page.id, page.revision,
      JSON.stringify({ fixture: "historical-preservation-only", objectId: page.id, objectRevision: page.revision,
        actorId: admin.user.id, actorRole: "admin", projectId: admin.projectId, text: `Beleg ${index} mit Umlauten und &` }));
  }
  // Only this new fixture is rebuilt into the full historical layout; the version alone is insufficient.
  previousFive(f.writer); f.writer.exec("DROP TABLE image_media_assets; DROP TABLE image_media_blobs; PRAGMA user_version=4;");
  assertProjectMediaSchema(f.writer, 4);
  const tables = ["meta", "users", "devices", "sessions", "login_attempts", "objects", "versions", "conflicts", "changes", "audit", "website_alt_receipts", "page_authoring_receipts"];
  const rows = db => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    .filter(row => table !== "meta" || row.key !== "reader_media_generation")]));
  const beforeRows = rows(f.writer), before = await originalBytes(f.filename);
  assert.ok(before.find(value => value.suffix === "-wal").bytes?.length > 0);
  const mainOnly = path.join(f.root, "main-without-wal.sqlite"); await fs.copyFile(f.filename, mainOnly);
  const mainProbe = new DatabaseSync(mainOnly, { readOnly: true });
  try {
    const hasAudit = mainProbe.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='audit'").get();
    assert.ok(!hasAudit || mainProbe.prepare("SELECT count(*) AS n FROM audit").get().n < beforeRows.audit.length,
      "Die Ausgangsdatei allein enthält noch nicht alle bestätigten WAL-Daten.");
  } finally { mainProbe.close(); }
  const snapshotDirectory = path.join(f.root, "upgrade-snapshot"), target = path.join(f.root, "upgrade-copy.sqlite");
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  assert.equal(manifest.databaseSchema, 4); assert.equal(manifest.projectId, admin.projectId);
  for (const table of tables) assert.equal(manifest.counts[table], beforeRows[table].length);
  const snapshotFile = path.join(snapshotDirectory, "project.sqlite"), manifestFile = path.join(snapshotDirectory, "snapshot.json"),
    snapshotBytes = await fs.readFile(snapshotFile), manifestBytes = await fs.readFile(manifestFile);
  assert.deepEqual(await originalBytes(f.filename), before);
  const restored = await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: target, localStorageConfirmed: true });
  assert.equal(restored.verified, true); assert.equal(restored.existingProjectReplaced, false);
  assert.deepEqual(await fs.readFile(target), snapshotBytes);
  const restoredProbe = new DatabaseSync(target, { readOnly: true });
  try { assert.equal(restoredProbe.prepare("PRAGMA user_version").get().user_version, 4); assert.deepEqual(rows(restoredProbe), beforeRows); }
  finally { restoredProbe.close(); }
  let upgraded;
  try {
    upgraded = createSharedProjectStore({ filename: target, localStorageConfirmed: true });
    const probe = new DatabaseSync(target, { readOnly: true });
    try {
      assertNormalMediaSchema(probe); assert.equal(probe.prepare("PRAGMA user_version").get().user_version, 6);
      assert.deepEqual(rows(probe), beforeRows, "Die Migration erhält alle historischen Daten einschließlich Hash-/Tokenbindungen und Belegen.");
      for (const table of ["image_media_assets", "image_media_blobs", "normal_media_assets", "normal_media_blobs"]) {
        assert.equal(probe.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
      }
      assert.equal(probe.prepare("SELECT value FROM meta WHERE key='reader_media_generation'").get().value, "0");
    } finally { probe.close(); }
    for (const session of sessions) assert.deepEqual(upgraded.me(session.token), f.store.me(session.token), "Vorhandene Sitzungen und Rollen bleiben gebunden.");
    assert.deepEqual(upgraded.listUsers(admin.token), f.store.listUsers(admin.token));
    assert.deepEqual(upgraded.devices(reader.token), f.store.devices(reader.token));
    const readerObject = upgraded.getObject(reader.token, "species", created.id), draftObject = upgraded.getObject(contributor.token, "species", created.id);
    assert.equal(readerObject.revision, created.revision); assert.equal(readerObject.approvedRevision, created.revision);
    assert.deepEqual(readerObject.data, created.data); assert.equal(draftObject.revision, changed.object.revision);
    assert.equal(draftObject.approvedRevision, created.revision); assert.deepEqual(draftObject.data, changed.object.data);
    assert.deepEqual(upgraded.catalog(reader.token).species, f.store.catalog(reader.token).species);
    assert.equal(upgraded.readerCatalogPage(reader.token).species[0].content.sections[0].text, approvedData.sections[0].text);
    const fresh = await upgraded.login({ username: publisher.user.username, password }); assert.equal(fresh.user.id, publisher.user.id);
    const refreshed = upgraded.refresh(reader.device.token); assert.equal(refreshed.user.id, reader.user.id);
    assert.equal(upgraded.me(refreshed.token).role, "reader");
    assert.throws(() => upgraded.createObject(refreshed.token, { kind: "page", id: "forbidden-reader-write", data: { title: "Forbidden" } }), { code: "forbidden" });
  } finally { upgraded?.close(); }
  const options = { snapshotDirectory, scratchParent: f.root, expectedSha256: manifest.sha256, targetSchema: 6 };
  await assert.rejects(verifyProjectSnapshotUpgrade({ ...options, expectedSha256: "0".repeat(64) }), /gehört nicht zu dieser Prüfprobe/);
  await assert.rejects(verifyProjectSnapshotUpgrade({ ...options, scratchParent: snapshotDirectory }), /außerhalb der Sicherung/);
  const rehearsal = await verifyProjectSnapshotUpgrade(options);
  assert.deepEqual(rehearsal, { passed: true, sourceSchema: 4, targetSchema: 6, snapshotSha256: manifest.sha256,
    originalTablesPreserved: 12, snapshotUnchanged: true, users: 5, enabledAdmins: 2, approvedSpecies: 1, openConflicts: 1 });
  assert.equal(f.writer.prepare("PRAGMA user_version").get().user_version, 4);
  assert.deepEqual(rows(f.writer), beforeRows); assert.deepEqual(await originalBytes(f.filename), before);
  assert.deepEqual(await fs.readFile(snapshotFile), snapshotBytes); assert.deepEqual(await fs.readFile(manifestFile), manifestBytes);
});

test("Dienstwechsel bereitet ausschließlich aus einem angehaltenen Schema-4-Bestand eine eigene Startkopie vor", async (t) => {
  const f = await fixture(t);
  previousFive(f.writer);
  f.writer.exec("DROP TABLE image_media_assets; DROP TABLE image_media_blobs; PRAGMA user_version=4;");
  const sourceDirectory = path.join(f.root, "stopped"), candidateDirectory = path.join(f.root, "candidate"),
    backupParent = path.join(f.root, "evidence"), scratchParent = path.join(f.root, "scratch");
  const source = path.join(sourceDirectory, "project.sqlite"), target = path.join(candidateDirectory, "project.sqlite");
  await createSharedProjectSnapshot({ filename: f.filename, destination: sourceDirectory, localStorageConfirmed: true });
  await Promise.all([candidateDirectory, backupParent, scratchParent].map(directory => fs.mkdir(directory)));
  const input = { sourceDirectory, candidateDirectory, backupParent, scratchParent, sourceStoppedConfirmed: true };
  const before = await originalBytes(source);
  await assert.rejects(stageSharedProjectUpgrade({ ...input, sourceStoppedConfirmed: false }), /angehaltene Quelle/);
  await assert.rejects(stageSharedProjectUpgrade({ ...input, candidateDirectory: sourceDirectory }), /getrennte Ordner/);
  await fs.writeFile(`${source}-wal`, "unexpected fixture sidecar", { flag: "wx" });
  await assert.rejects(stageSharedProjectUpgrade(input), /SQLite-Begleitdateien/);
  await fs.unlink(`${source}-wal`);
  assert.deepEqual(await fs.readdir(candidateDirectory), []);
  assert.deepEqual(await fs.readdir(backupParent), []);

  const result = await stageSharedProjectUpgrade(input);
  assert.equal(result.passed, true);
  assert.equal(result.sourceSchema, 4);
  assert.equal(result.users, 1);
  assert.deepEqual(await fs.readFile(target), await fs.readFile(path.join(backupParent, "cutover-snapshot", "project.sqlite")));
  await assert.rejects(stageSharedProjectUpgrade(input), /bereits belegt/);
  createSharedProjectStore({ filename: target, localStorageConfirmed: true }).close();
  const db = new DatabaseSync(target, { readOnly: true });
  try { assert.equal(db.prepare("PRAGMA user_version").get().user_version, 6); }
  finally { db.close(); }
  assert.deepEqual(await originalBytes(source), before);
});

test("historisches genaues Schema 5 bleibt ohne Normaldateitabellen bytegleich sicherbar", async (t) => {
  const f = await fixture(t); previousFive(f.writer);
  const before = await originalBytes(f.filename), snapshotDirectory = path.join(f.root, "old-five"), destination = path.join(f.root, "five-copy.sqlite");
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  assert.equal(manifest.databaseSchema, 5); assert.equal(Object.hasOwn(manifest.counts, "normal_media_blobs"), false);
  await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination, localStorageConfirmed: true });
  assert.deepEqual(await originalBytes(f.filename), before);
  const probe = new DatabaseSync(destination, { readOnly: true });
  try { assert.equal(probe.prepare("PRAGMA user_version").get().user_version, 5); } finally { probe.close(); }
});

test("unbekannte Versionen, unpassende Tabellen und veränderte Spalten ergeben keinen Sicherungsnachweis", async (t) => {
  for (const sql of ["PRAGMA user_version=0", "PRAGMA user_version=2", "PRAGMA user_version=3", "PRAGMA user_version=7", "PRAGMA user_version=8",
    "DROP TABLE page_authoring_receipts", "CREATE TABLE unexpected(value TEXT)", "ALTER TABLE website_alt_receipts ADD COLUMN unexpected TEXT", "PRAGMA user_version=1"]) {
    await t.test(sql, async (t) => {
      const f = await fixture(t), destination = path.join(f.root, "snapshot"); f.writer.exec(sql);
      const requestedVersion = /^PRAGMA user_version=(\d+)$/.exec(sql)?.[1];
      if (requestedVersion !== undefined) assert.equal(f.writer.prepare("PRAGMA user_version").get().user_version,
        Number(requestedVersion), "Die negative Probe muss ihre abweichende Quellversion tatsächlich gesetzt haben.");
      if (sql === "CREATE TABLE unexpected(value TEXT)") assert.equal(f.writer.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name='unexpected'").get().n,
        1, "Die Gegenprobe muss tatsächlich eine zusätzliche Quelltabelle besitzen.");
      const before = await originalBytes(f.filename);
      let unexpectedManifest;
      try {
        await assert.rejects(async () => {
          unexpectedManifest = await createSharedProjectSnapshot({ filename: f.filename, destination, localStorageConfirmed: true });
        }, sql === "PRAGMA user_version=7" ? /Artvorschlagsgrenze/ : /unbekanntes Format|unterstützten Format/);
      } catch (error) {
        if (unexpectedManifest) {
          let sourceProbe, copyProbe;
          try {
            sourceProbe = new DatabaseSync(f.filename, { readOnly: true });
            copyProbe = new DatabaseSync(path.join(destination, "project.sqlite"), { readOnly: true });
            error.message += ` · Synthetische Diagnose: ${JSON.stringify({ sql,
              writerVersion: f.writer.prepare("PRAGMA user_version").get().user_version,
              freshSourceVersion: sourceProbe.prepare("PRAGMA user_version").get().user_version,
              copyVersion: copyProbe.prepare("PRAGMA user_version").get().user_version,
              manifestVersion: unexpectedManifest.databaseSchema })}`;
          } catch { error.message += " · Zusätzliche synthetische Versionsdiagnose nicht verfügbar."; }
          finally { sourceProbe?.close(); copyProbe?.close(); }
        }
        throw error;
      }
      assert.deepEqual(await originalBytes(f.filename), before);
      await assert.rejects(fs.stat(path.join(destination, "snapshot.json")), { code: "ENOENT" });
      await assert.rejects(fs.stat(destination), { code: "ENOENT" });
    });
  }
});

test("abgewiesenes Schema räumt ein kurzzeitig gesperrtes eigenes Sicherungsziel erneut auf und erzeugt keinen Nachweis", async (t) => {
  const f = await fixture(t), destination = path.join(f.root, "busy-own-snapshot"); f.writer.exec("CREATE TABLE unexpected(value TEXT)");
  const before = await originalBytes(f.filename), remove = fs.rm; let attempts = 0;
  fs.rm = async (target, options) => {
    if (target === destination && attempts++ === 0) throw Object.assign(new Error("Synthetic transient Windows removal lock"), { code: "EBUSY" });
    return remove(target, options);
  };
  try {
    await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination, localStorageConfirmed: true }), /unterstützten Format/);
    assert.ok(attempts > 1, "Ein kurzzeitiger Windows-Löschfehler darf nicht still verschluckt werden.");
    assert.deepEqual(await originalBytes(f.filename), before); await assert.rejects(fs.stat(destination), { code: "ENOENT" });
    await assert.rejects(fs.stat(path.join(destination, "snapshot.json")), { code: "ENOENT" });
    assert.equal(f.writer.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='unexpected'").get().n, 1);
  } finally { fs.rm = remove; }
});

test("dauerhaft gesperrtes eigenes Ziel meldet Aufräumfehler zusammen mit der Schemaablehnung und bleibt ohne Manifest", async (t) => {
  const f = await fixture(t), destination = path.join(f.root, "permanently-busy-snapshot"); f.writer.exec("CREATE TABLE unexpected(value TEXT)");
  const before = await originalBytes(f.filename), remove = fs.rm;
  fs.rm = async (target, options) => {
    if (target === destination) throw Object.assign(new Error("Synthetic persistent removal lock"), { code: "EBUSY" });
    return remove(target, options);
  };
  try {
    await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination, localStorageConfirmed: true }),
      (error) => error instanceof AggregateError && /unterstützten Format/.test(error.errors[0].message) && error.errors[1].code === "EBUSY" && /nicht entfernt/.test(error.message));
    assert.deepEqual(await originalBytes(f.filename), before); await assert.rejects(fs.stat(path.join(destination, "snapshot.json")), { code: "ENOENT" });
  } finally { fs.rm = remove; }
});

test("Restore bindet die Schemanummer an die geprüften Bytes und entfernt eine abgewiesene eigene Kopie", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "snapshot"), target = path.join(f.root, "restore.sqlite");
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  const manifestFile = path.join(snapshotDirectory, "snapshot.json");
  await fs.writeFile(manifestFile, JSON.stringify({ ...manifest, databaseSchema: 8 }));
  await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: target, localStorageConfirmed: true }), /Ungültiger Sicherungsnachweis/);
  await assert.rejects(fs.stat(target), { code: "ENOENT" });
  for (const databaseSchema of [1, 7]) {
    await fs.writeFile(manifestFile, JSON.stringify({ ...manifest, databaseSchema }));
    await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: target, localStorageConfirmed: true }), /passt nicht zum Sicherungsnachweis/);
    await assert.rejects(fs.stat(target), { code: "ENOENT" });
  }
});

test("NAS-Sicherung überschreibt weder vorhandene Sicherung noch ein bestehendes Restoreziel", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "snapshot");
  await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true }), { code: "EEXIST" });
  const bytes = await fs.readFile(f.filename);
  await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: f.filename, localStorageConfirmed: true }), { code: "EEXIST" });
  assert.deepEqual(await fs.readFile(f.filename), bytes);
});

test("veränderte Sicherungsbytes und fehlende lokale Bestätigung stoppen vor Restoreanlage", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "snapshot"), target = path.join(f.root, "restore.sqlite");
  await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory }), /bestätigt/);
  await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  await fs.appendFile(path.join(snapshotDirectory, "project.sqlite"), "corrupted");
  await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: target, localStorageConfirmed: true }), /Sicherungsbytes/);
  await assert.rejects(fs.stat(target), { code: "ENOENT" });
});

test("Konfiguration erlaubt nur explizite HTTPS-Adresse, keinen fremden Browserursprung und kein Überschreiben", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "nas-config-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  const configuration = createNasServiceConfiguration("https://project.example.org");
  assert.equal(configuration.host, "0.0.0.0"); assert.deepEqual(configuration.allowedOrigins, []);
  assert.ok(configuration.allowedHosts.includes("project.example.org"));
  for (const input of ["http://project.example.org", "https://a:b@project.example.org", "https://project.example.org/path", "https://localhost", "https://127.0.0.1"]) {
    assert.throws(() => createNasServiceConfiguration(input));
  }
  const filename = path.join(root, "service.json");
  await writeNasServiceConfiguration(filename, "https://project.example.org");
  await assert.rejects(writeNasServiceConfiguration(filename, "https://other.example.org"), { code: "EEXIST" });
  assert.deepEqual(JSON.parse(await fs.readFile(filename, "utf8")), configuration);
});
