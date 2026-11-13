import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { createSharedProjectSnapshot, validateAndRestoreSharedProjectSnapshot } from "./snapshot.mjs";

const sidecars = ["-wal", "-shm", "-journal"];
const maximumColdBytes = 32 * 1024 * 1024;

async function requireAbsent(filenames, message) {
  for (const filename of filenames) {
    const exists = await fs.lstat(filename).then(() => true, error => {
      if (error.code !== "ENOENT") throw error;
      return false;
    });
    if (exists) throw new Error(message);
  }
}

async function hashFile(filename) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest("hex");
}

async function inspectColdSource(filename) {
  await requireAbsent(sidecars.map(suffix => filename + suffix), "Die alte Datenbank besitzt noch SQLite-Begleitdateien.");
  const stat = await fs.lstat(filename, { bigint: true });
  if (!stat.isFile() || stat.size <= 0n || stat.size > BigInt(maximumColdBytes)) {
    throw new Error("Die alte Datenbank fehlt, ist verknüpft oder passt nicht in das begrenzte Prüfvolumen.");
  }
  return stat;
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** The source is the stopped 0.1.2 data directory, bound read-only in the staging job. */
export async function stageSharedProjectUpgrade({ sourceDirectory, scratchParent, backupParent, candidateDirectory, sourceStoppedConfirmed }) {
  const paths = [sourceDirectory, scratchParent, backupParent, candidateDirectory];
  if (sourceStoppedConfirmed !== true || !paths.every(dir => typeof dir === "string" && path.isAbsolute(dir)
    && !/^(?:\\\\|\/\/|file:)/i.test(dir))) throw new Error("Die angehaltene Quelle und getrennte lokale Ziele müssen bestätigt sein.");
  const [source, scratch, backupRoot, candidate] = await Promise.all(paths.map(dir => fs.realpath(dir)));
  const roots = [source, scratch, backupRoot, candidate];
  if (roots.some((root, index) => roots.some((other, otherIndex) => index !== otherIndex && contains(root, other)))) {
    throw new Error("Quelle, Sicherungsziel, Prüfbereich und Kandidat müssen getrennte Ordner sein.");
  }

  const filename = path.join(source, "project.sqlite"), backup = path.join(backupRoot, "cutover-snapshot"),
    target = path.join(candidate, "project.sqlite");
  await requireAbsent([backup, target, ...sidecars.map(suffix => target + suffix)], "Das Sicherungs- oder Kandidatenziel ist bereits belegt.");
  const original = await inspectColdSource(filename), originalHash = await hashFile(filename);
  const unchangedSource = async () => {
    const stat = await inspectColdSource(filename);
    if (["dev", "ino", "size", "mtimeNs", "ctimeNs"].some(key => original[key] !== stat[key]) || await hashFile(filename) !== originalHash) {
      throw new Error("Der alte Datenbestand hat sich während der Vorbereitung verändert.");
    }
  };
  const own = await fs.mkdtemp(path.join(scratch, "arten-cutover-")), coldCopy = path.join(own, "cold.sqlite");
  await fs.copyFile(filename, coldCopy, fs.constants.COPYFILE_EXCL);
  await fs.chmod(coldCopy, 0o600);
  if (await hashFile(coldCopy) !== originalHash) throw new Error("Die getrennte Kopie stimmt nicht mit dem Ausgangsbestand überein.");
  await unchangedSource();
  const reader = new DatabaseSync(coldCopy, { readOnly: true });
  try {
    if (reader.prepare("PRAGMA user_version").get().user_version !== 4) throw new Error("Für diesen Wechsel wird Schema 4 erwartet.");
  } finally { reader.close(); }

  const manifest = await createSharedProjectSnapshot({ filename: coldCopy, destination: backup, localStorageConfirmed: true });
  const restored = await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: backup, destination: target, localStorageConfirmed: true });
  await unchangedSource();
  return { passed: true, sourceSchema: manifest.databaseSchema, sourceSha256: originalHash, snapshotSha256: restored.sha256,
    sourceUnchanged: true, candidateVerified: restored.verified, users: restored.counts.users, objects: restored.counts.objects };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== "--confirmed-stopped-source") throw new Error("Ungültiger Prüfauftrag.");
    const result = await stageSharedProjectUpgrade({ sourceDirectory: "/stopped", scratchParent: "/tmp", backupParent: "/evidence",
      candidateDirectory: "/candidate", sourceStoppedConfirmed: true });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write("Die getrennte Wechselkopie ist nicht bestätigt. Dienststatus, SQLite-Dateien und neue Ziele prüfen.\n");
    process.exitCode = 1;
  }
}
