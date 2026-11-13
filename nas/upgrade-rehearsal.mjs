import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { createSharedProjectStore } from "../species-explorer/shared-project/store.mjs";
import { validateAndRestoreSharedProjectSnapshot } from "./snapshot.mjs";

const originalTables = ["meta", "users", "devices", "sessions", "login_attempts", "objects", "versions",
  "conflicts", "changes", "audit", "website_alt_receipts", "page_authoring_receipts"];
const addedTables = ["image_media_assets", "image_media_blobs", "normal_media_assets", "normal_media_blobs"];

function inspectCopy(filename, schema) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map(row => row.name);
    const expected = (schema === 6 ? [...originalTables, ...addedTables] : [...originalTables]).sort();
    if (db.prepare("PRAGMA user_version").get().user_version !== schema || tables.join(",") !== expected.join(",")
      || db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").get()) {
      throw new Error("Die Prüfkopie hat ein unerwartetes Datenbankformat oder ist nicht konsistent.");
    }
    const generation = db.prepare("SELECT value FROM meta WHERE key='reader_media_generation'").get()?.value;
    if (schema === 6 ? generation !== "0" || addedTables.some(table => db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get())
      : generation !== undefined) throw new Error("Die neuen Medientabellen haben einen unerwarteten Anfangsstand.");

    const fingerprints = originalTables.map(table => {
      const where = table === "meta" && schema === 6 ? " WHERE key<>'reader_media_generation'" : "";
      const rows = db.prepare(`SELECT * FROM ${table}${where} ORDER BY rowid`);
      rows.setReadBigInts(true);
      const hash = createHash("sha256");
      for (const row of rows.iterate()) {
        hash.update(JSON.stringify(row, (_key, value) => typeof value === "bigint" ? { integer: value.toString() } : value));
        hash.update("\n");
      }
      return hash.digest("hex");
    });
    return {
      fingerprints,
      users: db.prepare("SELECT count(*) AS n FROM users").get().n,
      enabledAdmins: db.prepare("SELECT count(*) AS n FROM users WHERE role='admin' AND blocked=0").get().n,
      approvedSpecies: db.prepare("SELECT count(*) AS n FROM objects WHERE kind='species' AND approved_revision IS NOT NULL").get().n,
      openConflicts: db.prepare("SELECT count(*) AS n FROM conflicts WHERE resolved_at IS NULL").get().n,
    };
  } finally { db.close(); }
}

async function hashFile(filename) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest("hex");
}

/** Run with a read-only snapshot mount and a disposable scratch directory. */
export async function verifyProjectSnapshotUpgrade({ snapshotDirectory, scratchParent, expectedSha256, targetSchema }) {
  if (typeof snapshotDirectory !== "string" || !path.isAbsolute(snapshotDirectory)
    || typeof scratchParent !== "string" || !path.isAbsolute(scratchParent) || !/^[a-f0-9]{64}$/.test(expectedSha256)
    || ![4, 6].includes(targetSchema)) throw new Error("Die Prüfquelle, Zielversion oder erwartete Prüfsumme fehlt.");
  const scratch = await fs.realpath(scratchParent);
  const source = await fs.realpath(snapshotDirectory);
  const relative = path.relative(source, scratch);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Der temporäre Arbeitsordner muss außerhalb der Sicherung liegen.");
  }
  const manifest = path.join(snapshotDirectory, "snapshot.json");
  const manifestStat = await fs.lstat(manifest);
  if (!manifestStat.isFile() || manifestStat.size > 65536) throw new Error("Der Sicherungsnachweis ist ungültig.");
  const manifestBytes = await fs.readFile(manifest);
  const manifestValue = JSON.parse(manifestBytes);
  if (manifestValue?.sha256 !== expectedSha256 || manifestValue.databaseSchema !== 4) {
    throw new Error("Die Sicherung gehört nicht zu dieser Prüfprobe.");
  }
  const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
  const directory = await fs.mkdtemp(path.join(scratch, "arten-upgrade-"));
  const filename = path.join(directory, "copy.sqlite");
  const restored = await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: filename, localStorageConfirmed: true });
  if (restored.sha256 !== expectedSha256) throw new Error("Die Sicherung gehört nicht zu dieser Prüfprobe.");
  const before = inspectCopy(filename, 4);
  const store = createSharedProjectStore({ filename, localStorageConfirmed: true });
  store.close();
  const { fingerprints, ...counts } = inspectCopy(filename, targetSchema);
  if (fingerprints.some((hash, index) => hash !== before.fingerprints[index])) {
    throw new Error("Bestehende Projektdaten wurden beim Öffnen der Prüfkopie verändert.");
  }
  if (await hashFile(manifest) !== manifestHash || await hashFile(path.join(snapshotDirectory, "project.sqlite")) !== expectedSha256) {
    throw new Error("Die Sicherungsquelle hat sich während der Probe verändert.");
  }
  return { passed: true, sourceSchema: 4, targetSchema, snapshotSha256: expectedSha256,
    originalTablesPreserved: originalTables.length, snapshotUnchanged: true, ...counts };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [snapshotDirectory, expectedSha256, target, ...extra] = process.argv.slice(2);
  try {
    if (!snapshotDirectory || !expectedSha256 || !/^[46]$/.test(target) || extra.length) throw new Error("Ungültiger Prüfauftrag.");
    const result = await verifyProjectSnapshotUpgrade({ snapshotDirectory, scratchParent: "/tmp", expectedSha256, targetSchema: Number(target) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write("Die Upgradeprobe konnte nicht bestätigt werden. Sicherung, Laufzeit und Prüfkonfiguration prüfen.\n");
    process.exitCode = 1;
  }
}
