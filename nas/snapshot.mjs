import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { inspectImageMediaContents, PROJECT_SCHEMA_COLUMNS } from "../species-explorer/shared-project/image-media.mjs";
import { NORMAL_MEDIA_SCHEMA_COLUMNS } from "../species-explorer/shared-project/normal-media.mjs";
import { inspectNormalMediaContents } from "../species-explorer/shared-project/normal-media-inspection.mjs";

const requiredTables = ["meta", "users", "devices", "sessions", "login_attempts", "objects", "versions", "conflicts", "changes", "audit"];
const normalTables = [...Object.keys(PROJECT_SCHEMA_COLUMNS), ...Object.keys(NORMAL_MEDIA_SCHEMA_COLUMNS)];
const supportedSchemas = new Map([[1, requiredTables], [4, [...requiredTables, "website_alt_receipts", "page_authoring_receipts"]],
  [5, Object.keys(PROJECT_SCHEMA_COLUMNS)], [6, normalTables], [7, normalTables]]);
const tableColumns = {
  meta: "key,value", users: "id,username,display_name,password_hash,role,blocked,version,created_at",
  devices: "id,user_id,token_hash,label,expires_at,revoked,created_at", sessions: "token_hash,user_id,device_id,scope,expires_at,created_at",
  login_attempts: "key,failures,started_at,blocked_until", objects: "kind,id,current_revision,approved_revision",
  versions: "kind,id,revision,ordinal,parent_revision,data,author_id,created_at",
  conflicts: "id,kind,object_id,author_id,base_revision,current_revision,base_data,current_data,proposed_data,created_at,resolved_at,resolved_by,resolution,resulting_revision",
  changes: "author_id,change_id,request_hash,result", audit: "sequence,actor_id,action,target,created_at",
  website_alt_receipts: "id,object_id,version_revision,body", page_authoring_receipts: "id,object_id,version_revision,body",
  image_media_blobs: PROJECT_SCHEMA_COLUMNS.image_media_blobs, image_media_assets: PROJECT_SCHEMA_COLUMNS.image_media_assets,
  ...NORMAL_MEDIA_SCHEMA_COLUMNS,
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const BACKUP_TARGET_MARKER = ".arten-explorer-backup-target";

async function localPath(filename, { existing = false } = {}) {
  if (typeof filename !== "string" || !path.isAbsolute(filename) || /^(?:\\\\|\/\/|file:)/i.test(filename) || filename.includes("\0")) {
    throw new Error("Ein absoluter lokaler Pfad ist erforderlich.");
  }
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || current !== absolute && !stat.isDirectory()) throw new Error("Verknüpfte oder ungültige Speicherpfade sind nicht zulässig.");
      if (existing && current === absolute && !stat.isFile()) throw new Error("Die Quelldatei fehlt.");
    } catch (error) { if (error.code !== "ENOENT" || existing) throw error; }
  }
  return absolute;
}
async function digest(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
function sameOrInside(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return !relative || !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}
async function assertNoSidecars(filename, message = "Zum Wiederherstellungsziel gehört bereits eine SQLite-Begleitdatei. Bitte einen neuen Dateinamen wählen.") {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const existing = await fs.lstat(filename + suffix).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (existing) throw Object.assign(new Error(message), { code: "EEXIST" });
  }
}
async function matchesSnapshotFile(filename, previous, manifest) {
  const current = await fs.lstat(filename, { bigint: true });
  return previous?.isFile() && current.isFile() && current.dev === previous.dev && current.ino === previous.ino
    && current.size === BigInt(manifest.bytes) && await digest(filename) === manifest.sha256;
}
async function removeOwnIncompleteSnapshot(directory) {
  const retryable = new Set(["EBUSY", "EMFILE", "ENFILE", "ENOTEMPTY", "EPERM", "EACCES"]);
  for (let attempt = 0; ; attempt++) {
    try {
      // The directory was created exclusively by this call. Recheck its absolute, unlinked path before deletion.
      if (await localPath(directory) !== directory) throw new Error("Das eigene unvollständige Sicherungsziel wurde verändert.");
      await fs.rm(directory, { recursive: true, force: true }); return;
    } catch (error) {
      if (!retryable.has(error.code) || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
async function writeCompletedManifest(directory, manifestText) {
  const preparedManifest = path.join(directory, "snapshot.partial.json");
  await fs.writeFile(preparedManifest, manifestText, { flag: "wx", mode: 0o600, flush: true });
  await fs.rename(preparedManifest, path.join(directory, "snapshot.json"));
}
function inspect(db) {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  const databaseSchema = db.prepare("PRAGMA user_version").get().user_version, expectedTables = supportedSchemas.get(databaseSchema);
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok" || !expectedTables) {
    throw new Error("Die Projektdatenbank ist unvollständig oder besitzt ein unbekanntes Format.");
  }
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  if (tables.size !== expectedTables.length || expectedTables.some((name) => !tables.has(name))) throw new Error("Die Projekttabellen entsprechen keinem unterstützten Format.");
  for (const name of expectedTables) {
    if (db.prepare(`PRAGMA table_info(${name})`).all().map((column) => column.name).join(",") !== tableColumns[name]) {
      throw new Error("Die Projektspalten entsprechen keinem unterstützten Format.");
    }
  }
  if (db.prepare("PRAGMA foreign_key_check").get()) throw new Error("Die Projektbezüge sind unvollständig.");
  const projectId = db.prepare("SELECT value FROM meta WHERE key='project_id'").get()?.value;
  if (!UUID.test(projectId || "")) throw new Error("Ein eingerichtetes gemeinsames Projekt ist erforderlich.");
  if (databaseSchema >= 5) inspectImageMediaContents(db, projectId);
  if (databaseSchema >= 6) inspectNormalMediaContents(db, projectId);
  const counts = Object.fromEntries(expectedTables.map((name) => [name, db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n]));
  return { databaseSchema, projectId, counts };
}

function assertSnapshotProject(projectId, expectedProjectId) {
  if (expectedProjectId !== undefined && projectId !== expectedProjectId) {
    throw Object.assign(new Error("Die Projektdatenbank gehört nicht zum erwarteten Projekt."), { code: "BACKUP_SOURCE_PROJECT_MISMATCH" });
  }
}

/** Uses SQLite's online backup API, so committed WAL contents are included. */
export async function createSharedProjectSnapshot({ filename, destination, expectedProjectId, localStorageConfirmed = false } = {}) {
  if (localStorageConfirmed !== true) throw new Error("Lokale Speicherung muss bestätigt sein.");
  const source = await localPath(filename, { existing: true });
  const directory = await localPath(destination);
  await fs.mkdir(directory, { mode: 0o700 }); // Exclusive: an older snapshot is never replaced.
  const partial = path.join(directory, "project.partial.sqlite"), target = path.join(directory, "project.sqlite");
  let db;
  try {
    db = new DatabaseSync(source, { readOnly: true });
    await backup(db, partial, { rate: 128 });
    db.close(); db = null;
    const probe = new DatabaseSync(partial);
    let state;
    try { probe.exec("PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON;"); state = inspect(probe); } finally { probe.close(); }
    assertSnapshotProject(state.projectId, expectedProjectId);
    await fs.chmod(partial, 0o600);
    await fs.rename(partial, target);
    const manifest = { schemaVersion: 1, productId: "FN.ArtenExplorer.SharedProject", snapshotId: randomUUID(),
      createdAt: new Date().toISOString(), databaseSchema: state.databaseSchema, projectId: state.projectId, counts: state.counts,
      file: "project.sqlite", bytes: (await fs.stat(target)).size, sha256: await digest(target), method: "sqlite-online-backup" };
    // The exclusive directory belongs to this invocation. Publish the complete marker at once.
    await writeCompletedManifest(directory, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } catch (error) {
    db?.close();
    // Only this call's newly created directory is eligible for removal.
    try { await removeOwnIncompleteSnapshot(directory); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], `${error.message} Das eigene unvollständige Sicherungsziel konnte nicht entfernt werden.`); }
    throw error;
  }
}

async function readSnapshot(snapshotDirectory) {
  const manifestFile = await localPath(path.join(snapshotDirectory, "snapshot.json"), { existing: true });
  if ((await fs.stat(manifestFile)).size > 65536) throw new Error("Ungültiger Sicherungsnachweis.");
  const manifestText = await fs.readFile(manifestFile, "utf8"), manifest = JSON.parse(manifestText);
  if (manifest?.schemaVersion !== 1 || manifest.productId !== "FN.ArtenExplorer.SharedProject" || !supportedSchemas.has(manifest.databaseSchema)
    || manifest.file !== "project.sqlite" || !UUID.test(manifest.projectId || "") || !/^[a-f0-9]{64}$/.test(manifest.sha256 || "")
    || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0) throw new Error("Ungültiger Sicherungsnachweis.");
  const source = await localPath(path.join(snapshotDirectory, "project.sqlite"), { existing: true });
  const identity = await fs.lstat(source, { bigint: true });
  if (!await matchesSnapshotFile(source, identity, manifest)) throw new Error("Die Sicherungsbytes stimmen nicht mit dem Nachweis überein.");
  return { manifest, manifestFile, manifestText, source, identity };
}

function inspectSnapshotContents(filename, manifest) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const state = inspect(db);
    if (state.databaseSchema !== manifest.databaseSchema || state.projectId !== manifest.projectId
        || JSON.stringify(state.counts) !== JSON.stringify(manifest.counts)) throw new Error("Der Projektinhalt passt nicht zum Sicherungsnachweis.");
    return state;
  } finally { db.close(); }
}

async function verifiedSnapshot(snapshotDirectory) {
  const snapshot = await readSnapshot(snapshotDirectory);
  const { manifest, manifestFile, manifestText, source, identity } = snapshot;
  const message = "Die Sicherung enthält SQLite-Begleitdateien und ist nicht als abgeschlossener Stand bestätigt.";
  await assertNoSidecars(source, message);
  const state = inspectSnapshotContents(source, manifest);
  if (!await matchesSnapshotFile(source, identity, manifest) || await fs.readFile(manifestFile, "utf8") !== manifestText) {
    throw new Error("Die Sicherung hat sich während der Prüfung verändert.");
  }
  await assertNoSidecars(source, message);
  return { ...snapshot, state };
}

/** Checks the finished snapshot in place before handing it to independent backup storage. */
export async function verifySharedProjectSnapshot({ snapshotDirectory, localStorageConfirmed = false } = {}) {
  if (localStorageConfirmed !== true) throw new Error("Lokale Speicherung muss bestätigt sein.");
  const { state, manifest } = await verifiedSnapshot(snapshotDirectory);
  return { verified: true, projectId: state.projectId, counts: state.counts, sha256: manifest.sha256 };
}

async function copySnapshotDatabase({ manifest, source }, destination) {
  const target = await localPath(destination);
  await assertNoSidecars(target);
  await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
  let copied;
  try {
    copied = await fs.lstat(target, { bigint: true });
    await assertNoSidecars(target);
    if (!await matchesSnapshotFile(target, copied, manifest)) throw new Error("Die Wiederherstellung ist nicht bytegleich.");
    await fs.chmod(target, 0o600);
    const state = inspectSnapshotContents(target, manifest);
    if (!await matchesSnapshotFile(target, copied, manifest)) throw new Error("Die Wiederherstellung ist nicht bytegleich.");
    await assertNoSidecars(target);
    return { verified: true, projectId: state.projectId, counts: state.counts, sha256: manifest.sha256, existingProjectReplaced: false };
  } catch (error) {
    try {
      if (!await matchesSnapshotFile(target, copied, manifest)) {
        throw new Error("Die Zieldatei hat sich verändert und bleibt zur Prüfung erhalten.");
      }
      await fs.unlink(target);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") throw new AggregateError([error, cleanupError], `${error.message} ${cleanupError.message}`);
    }
    throw error;
  }
}

/** Restores only to an absent filename. No live project or original is replaced. */
export async function validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination, localStorageConfirmed = false } = {}) {
  if (localStorageConfirmed !== true) throw new Error("Lokale Speicherung muss bestätigt sein.");
  return copySnapshotDatabase(await readSnapshot(snapshotDirectory), destination);
}

/** Publishes the exact verified pair to a new destination chosen by the backup operator. */
export async function exportSharedProjectSnapshot({ snapshotDirectory, destination, expectedProjectId, localStorageConfirmed = false } = {}) {
  if (localStorageConfirmed !== true) throw new Error("Lokale Speicherung muss bestätigt sein.");
  const sourceDirectory = await localPath(snapshotDirectory), directory = await localPath(destination);
  if (sameOrInside(sourceDirectory, directory)) {
    throw new Error("Das Exportziel muss außerhalb der Quellsicherung liegen.");
  }
  const snapshot = await verifiedSnapshot(sourceDirectory);
  assertSnapshotProject(snapshot.state.projectId, expectedProjectId);
  await fs.mkdir(directory, { mode: 0o700 });
  const target = path.join(directory, "project.sqlite");
  const copied = await copySnapshotDatabase(snapshot, target);
  const handle = await fs.open(target, "r+");
  try { await handle.sync(); } finally { await handle.close(); }
  await writeCompletedManifest(directory, snapshot.manifestText);
  return { ...copied, exported: true };
}

async function backupTarget(directory, expectedTargetId, identity) {
  const current = await fs.lstat(await localPath(directory), { bigint: true });
  if (!current.isDirectory() || identity && (current.dev !== identity.dev || current.ino !== identity.ino)) {
    throw new Error("Das bestätigte Sicherungsziel ist nicht mehr eingebunden.");
  }
  const marker = await localPath(path.join(directory, BACKUP_TARGET_MARKER), { existing: true });
  if ((await fs.stat(marker)).size > 80 || (await fs.readFile(marker, "utf8")).trim() !== expectedTargetId) {
    throw new Error("Die Kennung des eingebundenen Sicherungsziels stimmt nicht überein.");
  }
  return current;
}

async function discardCompletedStagingCopy(directory, expected) {
  try {
    const { manifest, manifestFile, source } = await readSnapshot(directory);
    if (manifest.snapshotId !== expected.snapshotId || manifest.sha256 !== expected.sha256
        || (await fs.readdir(directory)).sort().join(",") !== "project.sqlite,snapshot.json") return false;
    await fs.unlink(manifestFile);
    await fs.unlink(source);
    await fs.rmdir(directory);
    return true;
  } catch { return false; }
}

/** Runs independently of the Explorer. The operator provisions the destination marker once. */
export async function runScheduledProjectBackup({ filename, stagingRoot, targetRoot, expectedTargetId, expectedProjectId,
  localStorageConfirmed = false } = {}) {
  if (localStorageConfirmed !== true || typeof expectedTargetId !== "string" || !UUID.test(expectedTargetId)) {
    throw new Error("Sicherungsziel und lokale Speicherung müssen bestätigt sein.");
  }
  if (expectedProjectId !== undefined && (typeof expectedProjectId !== "string" || !UUID.test(expectedProjectId))) {
    throw new Error("Die erwartete Projektkennung ist ungültig.");
  }
  const source = await localPath(filename, { existing: true });
  const staging = await localPath(stagingRoot), target = await localPath(targetRoot), live = path.dirname(source);
  if (sameOrInside(live, target) || sameOrInside(target, live) || sameOrInside(staging, target) || sameOrInside(target, staging)) {
    throw new Error("Datenbank, Zwischenablage und Sicherungsziel benötigen getrennte Zielpfade.");
  }
  const identity = await backupTarget(target, expectedTargetId);
  const runId = `snapshot-${randomUUID()}`, snapshotDirectory = path.join(staging, runId), destination = path.join(target, runId);
  const manifest = await createSharedProjectSnapshot({ filename: source, destination: snapshotDirectory, expectedProjectId, localStorageConfirmed });
  await backupTarget(target, expectedTargetId, identity);
  await exportSharedProjectSnapshot({ snapshotDirectory, destination, expectedProjectId: manifest.projectId, localStorageConfirmed });
  const verified = await verifySharedProjectSnapshot({ snapshotDirectory: destination, localStorageConfirmed });
  await backupTarget(target, expectedTargetId, identity);
  if (verified.projectId !== manifest.projectId || verified.sha256 !== manifest.sha256) {
    throw new Error("Die Prüfung am Ziel gehört zu einer anderen Sicherung.");
  }
  const stagingRemoved = await discardCompletedStagingCopy(snapshotDirectory, manifest);
  return { runId, ...verified, stagingRemoved };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [command, source, destination, confirmation, ...extra] = process.argv.slice(2);
  try {
    let result;
    if (command === "run-backup") {
      const [expectedTargetId, flag, expectedProjectId, confirmationFlag] = extra;
      const legacy = extra.length === 2 && flag === "--confirm-local-storage";
      const bound = extra.length === 4 && flag === "--expect-project" && confirmationFlag === "--confirm-local-storage";
      if (!legacy && !bound) throw new Error("Ungültiger Auftrag.");
      result = await runScheduledProjectBackup({ filename: source, stagingRoot: destination, targetRoot: confirmation,
        expectedTargetId, expectedProjectId, localStorageConfirmed: true });
    } else if (command === "verify" && destination === "--confirm-local-storage" && confirmation === undefined) {
      result = await verifySharedProjectSnapshot({ snapshotDirectory: source, localStorageConfirmed: true });
    } else {
      if (extra.length || confirmation !== "--confirm-local-storage") throw new Error("Ungültiger Auftrag.");
      const options = { snapshotDirectory: source, destination, localStorageConfirmed: true };
      if (command === "backup") result = await createSharedProjectSnapshot({ filename: source, destination, localStorageConfirmed: true });
      else if (command === "restore-copy") result = await validateAndRestoreSharedProjectSnapshot(options);
      else if (command === "export-copy") result = await exportSharedProjectSnapshot(options);
      else throw new Error("Ungültiger Auftrag.");
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error.code === "BACKUP_SOURCE_PROJECT_MISMATCH") {
      process.stderr.write("Sicherung nicht abgeschlossen. Die Projektdatenbank gehört nicht zum erwarteten Projekt.\n");
    } else process.stderr.write(command === "verify"
      ? "Sicherung nicht bestätigt. Vollständigen Nachweis, SQLite-Datei und Leserechte prüfen.\n"
      : "Sicherung, Export oder Wiederherstellung nicht abgeschlossen. Neue lokale Zieladresse, Rechte und Sicherungsnachweis prüfen.\n");
    process.exitCode = 1;
  }
}
