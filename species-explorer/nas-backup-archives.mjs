import { spawn } from "node:child_process";
import { lstat, open, opendir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const SELF = fileURLToPath(import.meta.url);
const MAX_ARCHIVES = 128;
const MAX_DIRECTORY_ENTRIES = 4096;
const MAX_CENTRAL_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_READ_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024;
const MAX_ENTRIES = 50000;
const INVENTORY_WARNING = "Diese Übersicht liest nur ZIP-Verzeichnisse und begrenzte Manifeste. Dateiinhalt-Prüfsummen und ein Programmstart nach Wiederherstellung werden dabei nicht geprüft.";

function inventoryError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeInteger(value) {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("ZIP-Metadaten enthalten einen ungültigen Umfang.");
  return number;
}

function safeEntryName(name) {
  return name && !/[\\:\0]/.test(name) && !name.startsWith("/")
    && !name.split("/").some((part, index, parts) => part === "." || part === ".." || (!part && index < parts.length - 1));
}

async function noLinks(target) {
  for (let current = path.resolve(target);;) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("Verknüpfte Sicherungsordner oder Archivdateien werden nicht geöffnet.");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function readRange(handle, size, position, length, budget) {
  if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(length) || length < 0 || position + length > size) {
    throw new Error("Das ZIP-Verzeichnis liegt außerhalb der Archivdatei.");
  }
  budget.remaining -= length;
  if (budget.remaining < 0) throw new Error("Die begrenzte Metadatenlesung ist ausgeschöpft; dieses Archiv wurde nicht geprüft.");
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error("Das Archiv endete während der Metadatenlesung.");
    offset += bytesRead;
  }
  return buffer;
}

async function zipDirectory(handle, size, budget) {
  const tail = await readRange(handle, size, Math.max(0, size - 65557), Math.min(size, 65557), budget);
  let end = -1;
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) === 0x06054b50 && offset + 22 + tail.readUInt16LE(offset + 20) === tail.length) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("Kein vollständiges ZIP-Verzeichnis gefunden.");
  if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) throw new Error("Mehrteilige ZIP-Archive werden nicht unterstützt.");
  let count = tail.readUInt16LE(end + 10);
  let directoryBytes = tail.readUInt32LE(end + 12);
  let directoryOffset = tail.readUInt32LE(end + 16);
  let directoryEnd = size - tail.length + end;
  if (count === 0xffff || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff) {
    const locatorOffset = directoryEnd - 20;
    const locator = await readRange(handle, size, locatorOffset, 20, budget);
    if (locator.readUInt32LE(0) !== 0x07064b50 || locator.readUInt32LE(4) || locator.readUInt32LE(16) !== 1) {
      throw new Error("Ungültiges oder mehrteiliges ZIP64-Verzeichnis.");
    }
    directoryEnd = safeInteger(locator.readBigUInt64LE(8));
    const record = await readRange(handle, size, directoryEnd, 56, budget);
    if (record.readUInt32LE(0) !== 0x06064b50 || record.readUInt32LE(16) || record.readUInt32LE(20)
        || record.readBigUInt64LE(24) !== record.readBigUInt64LE(32)) throw new Error("Ungültiger ZIP64-Abschluss.");
    count = safeInteger(record.readBigUInt64LE(32));
    directoryBytes = safeInteger(record.readBigUInt64LE(40));
    directoryOffset = safeInteger(record.readBigUInt64LE(48));
  } else if (tail.readUInt16LE(end + 8) !== count) throw new Error("Mehrteilige ZIP-Archive werden nicht unterstützt.");
  if (count > MAX_ENTRIES || directoryBytes > MAX_CENTRAL_BYTES || directoryOffset + directoryBytes > directoryEnd) {
    throw new Error("ZIP-Verzeichnis überschreitet die sichere Metadatengrenze oder ist beschädigt.");
  }
  const buffer = await readRange(handle, size, directoryOffset, directoryBytes, budget);
  const entries = [];
  const names = new Set();
  let offset = 0;
  while (offset < buffer.length) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Beschädigter ZIP-Verzeichniseintrag.");
    const nameBytes = buffer.readUInt16LE(offset + 28);
    const extraBytes = buffer.readUInt16LE(offset + 30);
    const commentBytes = buffer.readUInt16LE(offset + 32);
    const next = offset + 46 + nameBytes + extraBytes + commentBytes;
    if (next > buffer.length) throw new Error("Unvollständiger ZIP-Verzeichniseintrag.");
    const name = buffer.subarray(offset + 46, offset + 46 + nameBytes).toString("utf8");
    const attributes = buffer.readUInt32LE(offset + 38);
    if (!safeEntryName(name) || names.has(name.toLowerCase()) || ((attributes >>> 16) & 0xf000) === 0xa000
        || (attributes & 0x400)) throw new Error("Unsichere, verknüpfte oder doppelte Pfade im ZIP-Verzeichnis.");
    names.add(name.toLowerCase());
    let bytes = buffer.readUInt32LE(offset + 24);
    let compressedBytes = buffer.readUInt32LE(offset + 20);
    let localOffset = buffer.readUInt32LE(offset + 42);
    let disk = buffer.readUInt16LE(offset + 34);
    if (bytes === 0xffffffff || compressedBytes === 0xffffffff || localOffset === 0xffffffff || disk === 0xffff) {
      let extraOffset = offset + 46 + nameBytes;
      const extraEnd = extraOffset + extraBytes;
      let found = false;
      while (extraOffset + 4 <= extraEnd) {
        const tag = buffer.readUInt16LE(extraOffset), length = buffer.readUInt16LE(extraOffset + 2);
        const body = extraOffset + 4;
        if (body + length > extraEnd) throw new Error("Beschädigte ZIP64-Zusatzfelder.");
        if (tag === 1) {
          let cursor = body;
          const take = () => { if (cursor + 8 > body + length) throw new Error("Unvollständige ZIP64-Größen.");
            const value = safeInteger(buffer.readBigUInt64LE(cursor)); cursor += 8; return value; };
          if (bytes === 0xffffffff) bytes = take();
          if (compressedBytes === 0xffffffff) compressedBytes = take();
          if (localOffset === 0xffffffff) localOffset = take();
          if (disk === 0xffff) { if (cursor + 4 > body + length) throw new Error("Unvollständige ZIP64-Plattennummer."); disk = buffer.readUInt32LE(cursor); }
          found = true;
          break;
        }
        extraOffset = body + length;
      }
      if (!found) throw new Error("ZIP64-Größen fehlen.");
    }
    if (disk || localOffset + 30 + compressedBytes > directoryOffset) throw new Error("Ungültige oder mehrteilige ZIP-Dateiposition.");
    entries.push({ name, bytes, compressedBytes, localOffset, method: buffer.readUInt16LE(offset + 10),
      flags: buffer.readUInt16LE(offset + 8), crc: buffer.readUInt32LE(offset + 16) });
    offset = next;
  }
  if (entries.length !== count) throw new Error("ZIP-Dateianzahl passt nicht zum Verzeichnis.");
  return { entries, directoryOffset };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function readManifest(handle, size, entry, directoryOffset, budget) {
  if (entry.bytes > MAX_MANIFEST_BYTES || entry.compressedBytes > MAX_MANIFEST_BYTES || entry.flags & 1) {
    throw new Error("Das Prüfmanifest ist verschlüsselt oder überschreitet die begrenzte Lesung.");
  }
  const local = await readRange(handle, size, entry.localOffset, 30, budget);
  if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(8) !== entry.method || local.readUInt16LE(6) !== entry.flags) {
    throw new Error("Manifestposition passt nicht zum ZIP-Verzeichnis.");
  }
  const nameBytes = local.readUInt16LE(26), extraBytes = local.readUInt16LE(28);
  const name = await readRange(handle, size, entry.localOffset + 30, nameBytes, budget);
  if (name.toString("utf8") !== entry.name) throw new Error("Manifestname passt nicht zum ZIP-Verzeichnis.");
  const bodyOffset = entry.localOffset + 30 + nameBytes + extraBytes;
  if (bodyOffset + entry.compressedBytes > directoryOffset) throw new Error("Manifest liegt außerhalb des ZIP-Dateibereichs.");
  const compressed = await readRange(handle, size, bodyOffset, entry.compressedBytes, budget);
  let raw;
  if (entry.method === 0) raw = compressed;
  else if (entry.method === 8) raw = inflateRawSync(compressed, { maxOutputLength: MAX_MANIFEST_BYTES });
  else throw new Error("Unbekannte Kompression des Prüfmanifests.");
  if (raw.length !== entry.bytes || crc32(raw) !== entry.crc) throw new Error("Das Prüfmanifest ist beschädigt.");
  const manifest = JSON.parse(raw.toString("utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Ungültiges Prüfmanifest.");
  return manifest;
}

function manifestIsComplete(manifest, entries) {
  if (manifest.schemaVersion !== 2 || manifest.backupKind !== "arten-explorer-nas-restore"
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(manifest.archiveId || "")
      || !/^[a-f0-9]{40,64}$/.test(manifest.gitCommit || "")
      || ![manifest.localDataStateHash, manifest.sourceRecordsHash, manifest.projectId].every((value) => /^[a-f0-9]{64}$/.test(value || ""))
      || !Array.isArray(manifest.files) || manifest.files.length !== manifest.fileCount || manifest.files.length !== entries.length - 1) return false;
  const expected = new Map(entries.filter(({ name }) => name !== "backup-manifest.json").map((entry) => [entry.name, entry.bytes]));
  let total = 0;
  for (const record of manifest.files) {
    if (!record || !safeEntryName(record.path) || record.path.endsWith("/") || !/^[a-f0-9]{64}$/.test(record.sha256 || "")
        || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || expected.get(record.path) !== record.bytes) return false;
    expected.delete(record.path);
    total += record.bytes;
  }
  return !expected.size && Number.isSafeInteger(total) && total === manifest.totalBytes;
}

function isoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function archiveDate(name, info) {
  const match = /^IUCN_Datenbank_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})?_/.exec(name);
  if (match) {
    const [, year, month, day, hour, minute, second = "00"] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return info?.mtime?.toISOString() || "";
}

async function inspectArchive(backupRoot, name, budget) {
  const archivePath = path.join(backupRoot, name);
  const result = { name, path: archivePath, createdAt: "", bytes: null, fileCount: null, contentBytes: null,
    schemaVersion: null, integrityStatus: "invalid", scopeLabel: "Umfang unbekannt", warning: "", readable: false };
  let handle;
  try {
    await noLinks(archivePath);
    const info = await lstat(archivePath);
    result.createdAt = archiveDate(name, info);
    result.bytes = safeInteger(info.size);
    if (!info.isFile()) throw new Error("Das Archiv ist keine reguläre Datei.");
    handle = await open(archivePath, "r");
    const opened = await handle.stat();
    if (opened.dev !== info.dev || opened.ino !== info.ino || opened.size !== info.size || opened.mtimeMs !== info.mtimeMs) {
      throw new Error("Das Archiv wurde während der Übersicht geändert.");
    }
    const { entries, directoryOffset } = await zipDirectory(handle, opened.size, budget);
    const files = entries.filter(({ name: entryName }) => !entryName.endsWith("/") && entryName !== "backup-manifest.json");
    result.fileCount = files.length;
    result.contentBytes = safeInteger(files.reduce((sum, entry) => sum + entry.bytes, 0));
    const hasData = files.some(({ name: entryName }) => entryName.startsWith("data/") || entryName.startsWith("Daten/"));
    const hasStorageConfig = files.some(({ name: entryName }) => entryName === "storage-path.json");
    result.scopeLabel = hasData && hasStorageConfig ? "Projekt und gemeinsamer Datenordner enthalten"
      : hasData ? "Projekt mit Datenordner; Speicherkonfiguration fehlt" : "Historischer Projektstand ohne gemeinsamen Datenordner";
    const manifestEntry = entries.find(({ name: entryName }) => entryName === "backup-manifest.json");
    if (!manifestEntry) {
      result.integrityStatus = "no-manifest";
      result.warning = "ZIP-Verzeichnis lesbar, aber kein Prüfmanifest vorhanden. Vollständigkeit, Dateiinhalt und Programmstart sind nicht nachgewiesen.";
    } else {
      const manifest = await readManifest(handle, opened.size, manifestEntry, directoryOffset, budget);
      result.createdAt = isoDate(manifest.createdAt) || result.createdAt;
      result.schemaVersion = Number.isSafeInteger(manifest.schemaVersion) ? manifest.schemaVersion : null;
      if (manifestIsComplete(manifest, entries) && isoDate(manifest.createdAt)) {
        result.integrityStatus = "manifest-only";
        result.warning = "Prüfmanifest mit SHA-256-Einträgen und passendem ZIP-Dateiverzeichnis vorhanden. Dateiinhalt-Prüfsummen und Wiederherstellung wurden heute nicht geprüft.";
      } else if (manifest.schemaVersion === 2) {
        result.integrityStatus = "invalid";
        result.warning = "Das Schema-2-Prüfmanifest ist unvollständig oder passt nicht zum ZIP-Dateiverzeichnis.";
      } else {
        result.integrityStatus = "historical";
        result.warning = "Historisches oder unbekanntes Manifest ohne heutigen vollständigen Prüfnachweis. Das Archiv ist dadurch nicht als unbrauchbar belegt.";
      }
    }
    const finalInfo = await handle.stat();
    if (finalInfo.size !== opened.size || finalInfo.mtimeMs !== opened.mtimeMs) throw new Error("Das Archiv wurde während der Übersicht geändert.");
    await noLinks(archivePath);
    const finalPath = await lstat(archivePath);
    if (finalPath.dev !== opened.dev || finalPath.ino !== opened.ino || finalPath.size !== opened.size || finalPath.mtimeMs !== opened.mtimeMs) {
      throw new Error("Die Archivdatei wurde während der Übersicht ersetzt.");
    }
    result.readable = result.integrityStatus !== "invalid";
  } catch (error) {
    result.integrityStatus = "invalid";
    result.warning = `Archiv nicht sicher lesbar: ${error.message}`;
  } finally { if (handle) await handle.close(); }
  return result;
}

async function inventoryInWorker(backupRoot) {
  await noLinks(backupRoot);
  if (!(await lstat(backupRoot)).isDirectory()) throw new Error("Der Sicherungspfad ist kein Verzeichnis.");
  const names = [];
  let inspectedEntries = 0;
  let bounded = false;
  const directory = await opendir(backupRoot);
  for await (const entry of directory) {
    inspectedEntries += 1;
    if (inspectedEntries > MAX_DIRECTORY_ENTRIES) { bounded = true; break; }
    if (!entry.name.toLowerCase().endsWith(".zip")) continue;
    names.push(entry.name);
    if (names.length === MAX_ARCHIVES) { bounded = true; break; }
  }
  const budget = { remaining: MAX_READ_BYTES };
  const archives = [];
  for (const name of names.sort()) archives.push(await inspectArchive(backupRoot, name, budget));
  archives.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.name.localeCompare(right.name));
  return { backupRoot, archives, warning: `${INVENTORY_WARNING}${bounded ? " Die Übersicht wurde begrenzt; weitere Archive oder Verzeichniseinträge können fehlen." : ""}` };
}

// Network filesystem reads run in a disposable helper. The caller receives a
// result only after close, so a timeout never leaves an inventory reader alive.
export async function readNasBackupArchives(backupRoot, {
  spawnProcess = spawn, timeoutMs = 20000, tempSession = null,
} = {}) {
  if (typeof backupRoot !== "string" || !path.isAbsolute(backupRoot) || backupRoot.length > 500 || backupRoot.includes("\0")) {
    throw inventoryError("Die Archivübersicht benötigt einen gültigen absoluten Sicherungspfad.", 400);
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20000) throw inventoryError("Ungültige Zeitgrenze für die Archivübersicht.", 400);
  const releaseOperation = await tempSession?.beginOperation();
  let releaseHelper;
  let child;
  let completed;
  try {
    child = spawnProcess(process.execPath, [SELF, "--archives-worker", backupRoot], {
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: false,
    });
    const killOnExit = () => { child.kill("SIGKILL"); };
    process.once("exit", killOnExit);
    completed = new Promise((resolveCompleted) => {
      const stdout = [];
      let outputBytes = 0;
      let failure = "";
      const fail = (message) => { if (!failure) failure = message; child.kill("SIGKILL"); };
      const timer = setTimeout(() => fail("Der Sicherungsordner antwortet nicht rechtzeitig; die begrenzte Archivübersicht wurde beendet."), timeoutMs);
      child.stdout.on("data", (chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) fail("Die Antwort der Archivübersicht überschreitet die sichere Grenze.");
        else stdout.push(chunk);
      });
      child.stderr.on("data", (chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) fail("Die Antwort der Archivübersicht überschreitet die sichere Grenze.");
      });
      child.once("error", (error) => { failure = `Archivübersicht konnte nicht gestartet werden: ${error.message}`; });
      child.once("close", (code) => {
        clearTimeout(timer);
        process.removeListener("exit", killOnExit);
        resolveCompleted({ code, failure, stdout: Buffer.concat(stdout).toString("utf8") });
      });
    });
    if (child.pid && tempSession) releaseHelper = await tempSession.registerHelper(child.pid);
    const result = await completed;
    if (result.failure) throw inventoryError(result.failure);
    let value;
    try { value = JSON.parse(result.stdout); }
    catch { throw inventoryError("Die Archivübersicht lieferte keine gültige Antwort."); }
    if (result.code !== 0 || value.error) throw inventoryError(`Sicherungsordner nicht erreichbar oder nicht sicher lesbar: ${value.error || "Lesung fehlgeschlagen"}`);
    return value;
  } finally {
    if (child && completed) { child.kill("SIGKILL"); await completed; }
    if (releaseHelper) await releaseHelper();
    if (releaseOperation) await releaseOperation();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF && process.argv[2] === "--archives-worker") {
  try { process.stdout.write(JSON.stringify(await inventoryInWorker(process.argv[3]))); }
  catch (error) { process.stdout.write(JSON.stringify({ error: error.message })); process.exitCode = 1; }
}
