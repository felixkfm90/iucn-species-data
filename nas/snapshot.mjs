import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { pathToFileURL } from "node:url";

const requiredTables = ["meta", "users", "devices", "sessions", "login_attempts", "objects", "versions", "conflicts", "changes", "audit"];
const supportedSchemas = new Map([[1, requiredTables], [4, [...requiredTables, "website_alt_receipts", "page_authoring_receipts"]]]);
const tableColumns = {
  meta: "key,value", users: "id,username,display_name,password_hash,role,blocked,version,created_at",
  devices: "id,user_id,token_hash,label,expires_at,revoked,created_at", sessions: "token_hash,user_id,device_id,scope,expires_at,created_at",
  login_attempts: "key,failures,started_at,blocked_until", objects: "kind,id,current_revision,approved_revision",
  versions: "kind,id,revision,ordinal,parent_revision,data,author_id,created_at",
  conflicts: "id,kind,object_id,author_id,base_revision,current_revision,base_data,current_data,proposed_data,created_at,resolved_at,resolved_by,resolution,resulting_revision",
  changes: "author_id,change_id,request_hash,result", audit: "sequence,actor_id,action,target,created_at",
  website_alt_receipts: "id,object_id,version_revision,body", page_authoring_receipts: "id,object_id,version_revision,body",
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

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
  const counts = Object.fromEntries(expectedTables.map((name) => [name, db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n]));
  return { databaseSchema, projectId, counts };
}

/** Uses SQLite's online backup API, so committed WAL contents are included. */
export async function createSharedProjectSnapshot({ filename, destination, localStorageConfirmed = false } = {}) {
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
    await fs.chmod(partial, 0o600);
    await fs.rename(partial, target);
    const manifest = { schemaVersion: 1, productId: "FN.ArtenExplorer.SharedProject", snapshotId: randomUUID(),
      createdAt: new Date().toISOString(), databaseSchema: state.databaseSchema, projectId: state.projectId, counts: state.counts,
      file: "project.sqlite", bytes: (await fs.stat(target)).size, sha256: await digest(target), method: "sqlite-online-backup" };
    await fs.writeFile(path.join(directory, "snapshot.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return manifest;
  } catch (error) {
    db?.close();
    // Only this call's newly created directory is eligible for removal.
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/** Restores only to an absent filename. No live project or original is replaced. */
export async function validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination, localStorageConfirmed = false } = {}) {
  if (localStorageConfirmed !== true) throw new Error("Lokale Speicherung muss bestätigt sein.");
  const manifestFile = await localPath(path.join(snapshotDirectory, "snapshot.json"), { existing: true });
  if ((await fs.stat(manifestFile)).size > 65536) throw new Error("Ungültiger Sicherungsnachweis.");
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.productId !== "FN.ArtenExplorer.SharedProject" || !supportedSchemas.has(manifest.databaseSchema)
    || manifest.file !== "project.sqlite" || !UUID.test(manifest.projectId || "") || !/^[a-f0-9]{64}$/.test(manifest.sha256 || "")
    || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0) throw new Error("Ungültiger Sicherungsnachweis.");
  const source = await localPath(path.join(snapshotDirectory, "project.sqlite"), { existing: true });
  const before = await fs.stat(source);
  if (before.size !== manifest.bytes || await digest(source) !== manifest.sha256) throw new Error("Die Sicherungsbytes stimmen nicht mit dem Nachweis überein.");
  const target = await localPath(destination);
  await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
  let succeeded = false;
  try {
    await fs.chmod(target, 0o600);
    if ((await fs.stat(target)).size !== manifest.bytes || await digest(target) !== manifest.sha256) throw new Error("Die Wiederherstellung ist nicht bytegleich.");
    const db = new DatabaseSync(target, { readOnly: true });
    let state;
    try { state = inspect(db); } finally { db.close(); }
    if (state.databaseSchema !== manifest.databaseSchema || state.projectId !== manifest.projectId
      || JSON.stringify(state.counts) !== JSON.stringify(manifest.counts)) throw new Error("Der wiederhergestellte Projektinhalt passt nicht zum Sicherungsnachweis.");
    succeeded = true;
    return { verified: true, projectId: state.projectId, counts: state.counts, sha256: manifest.sha256, existingProjectReplaced: false };
  } finally { if (!succeeded) await fs.unlink(target).catch(() => {}); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [command, source, destination, confirmation, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || confirmation !== "--confirm-local-storage" || !["backup", "restore-copy"].includes(command)) throw new Error("Ungültiger Auftrag.");
    const result = command === "backup"
      ? await createSharedProjectSnapshot({ filename: source, destination, localStorageConfirmed: true })
      : await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: source, destination, localStorageConfirmed: true });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch { process.stderr.write("Sicherung/Wiederherstellung nicht abgeschlossen. Neue lokale Zieladresse, Rechte und Sicherungsnachweis prüfen.\n"); process.exitCode = 1; }
}
