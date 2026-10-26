import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { tmpdir } from "../scripts/test-temp.mjs";
import { createBackupService } from "./backup-service.mjs";
import { readNasBackupArchives } from "./nas-backup-archives.mjs";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files, { zip64 = false, encryptedManifest = false, corruptManifestCrc = false } = {}) {
  const contents = [];
  const records = [];
  let offset = 0;
  for (const [name, value] of files) {
    const nameBuffer = Buffer.from(name);
    const raw = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw) ^ (name === "backup-manifest.json" && corruptManifestCrc ? 1 : 0);
    const flags = name === "backup-manifest.json" && encryptedManifest ? 1 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuffer.length, 26);
    contents.push(local, nameBuffer, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(flags, 8); record.writeUInt16LE(8, 10); record.writeUInt32LE(crc >>> 0, 16);
    record.writeUInt32LE(zip64 ? 0xffffffff : compressed.length, 20);
    record.writeUInt32LE(zip64 ? 0xffffffff : raw.length, 24);
    record.writeUInt16LE(nameBuffer.length, 28); record.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
    const extra = Buffer.alloc(zip64 ? 28 : 0);
    if (zip64) {
      record.writeUInt16LE(extra.length, 30); extra.writeUInt16LE(1); extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(raw.length), 4); extra.writeBigUInt64LE(BigInt(compressed.length), 12);
      extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    records.push(record, nameBuffer, extra);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const directory = Buffer.concat(records);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(zip64 ? 0xffff : files.length, 8); end.writeUInt16LE(zip64 ? 0xffff : files.length, 10);
  end.writeUInt32LE(zip64 ? 0xffffffff : directory.length, 12); end.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
  const endings = [];
  if (zip64) {
    const record = Buffer.alloc(56), locator = Buffer.alloc(20);
    record.writeUInt32LE(0x06064b50); record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE(45, 12); record.writeUInt16LE(45, 14);
    record.writeBigUInt64LE(BigInt(files.length), 24); record.writeBigUInt64LE(BigInt(files.length), 32);
    record.writeBigUInt64LE(BigInt(directory.length), 40); record.writeBigUInt64LE(BigInt(offset), 48);
    locator.writeUInt32LE(0x07064b50); locator.writeBigUInt64LE(BigInt(offset + directory.length), 8); locator.writeUInt32LE(1, 16);
    endings.push(record, locator);
  }
  return Buffer.concat([...contents, directory, ...endings, end]);
}

function modernFiles(change = {}) {
  const files = [["speciesData.json", "[]"], ["Daten/taxonomy/master.sqlite", "synthetic database"], ["storage-path.json", "{}"]];
  const manifest = { schemaVersion: 2, backupKind: "arten-explorer-nas-restore", archiveId: "9f50eb9e-be21-454d-b29f-b0bd18cdcff8",
    projectId: "a".repeat(64), createdAt: "2026-10-07T21:53:13+02:00", gitCommit: "b".repeat(40),
    sourceRecordsHash: "c".repeat(64), localDataStateHash: "d".repeat(64), fileCount: files.length,
    totalBytes: files.reduce((sum, [, value]) => sum + Buffer.byteLength(value), 0),
    files: files.map(([name, value]) => ({ path: name, bytes: Buffer.byteLength(value), sha256: createHash("sha256").update(value).digest("hex") })),
    ...change };
  return [...files, ["backup-manifest.json", JSON.stringify(manifest)]];
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "nas-archive-list-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("NAS-Übersicht trennt modernes Prüfverzeichnis, historischen Umfang und defektes Archiv", async (t) => {
  const root = await fixture(t);
  const modernName = "IUCN_Datenbank_2026-10-07_215313_modern.zip";
  const modern = makeZip(modernFiles());
  await writeFile(path.join(root, modernName), modern);
  await writeFile(path.join(root, "IUCN_Datenbank_2026-06-28_1118_old.zip"), makeZip([
    ["speciesData.json", "[]"], ["species-assets/stork.svg", "synthetic"], ["backup-manifest.json", JSON.stringify({ createdAt: "2026-06-28T11:18:00+02:00", fileCount: 999999 })],
  ]));
  await writeFile(path.join(root, "broken.zip"), "not a ZIP");
  await writeFile(path.join(root, "ignored.txt"), "unrelated");
  const before = await readdir(root);
  const events = [];
  const result = await readNasBackupArchives(root, { tempSession: {
    async beginOperation() { events.push("operation-start"); return async () => events.push("operation-end"); },
    async registerHelper(pid) { assert.ok(pid > 0); events.push("helper-start"); return async () => {
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }); events.push("helper-end");
    }; },
  } });
  assert.equal(result.backupRoot, root);
  assert.equal(result.archives.length, 3);
  const current = result.archives.find(({ name }) => name === modernName);
  assert.equal(current.integrityStatus, "manifest-only"); assert.equal(current.readable, true);
  assert.equal(current.schemaVersion, 2); assert.equal(current.fileCount, 3); assert.equal(current.contentBytes, 22);
  assert.equal(current.createdAt, "2026-10-07T19:53:13.000Z"); assert.equal(current.bytes, modern.length);
  assert.match(current.scopeLabel, /gemeinsamer Datenordner/);
  assert.match(current.warning, /heute nicht geprüft/);
  const old = result.archives.find(({ name }) => name.includes("old.zip"));
  assert.equal(old.integrityStatus, "historical"); assert.equal(old.fileCount, 2); assert.equal(old.schemaVersion, null);
  assert.equal(old.readable, true); assert.match(old.scopeLabel, /ohne gemeinsamen Datenordner/);
  assert.match(old.warning, /nicht als unbrauchbar belegt/);
  const broken = result.archives.find(({ name }) => name === "broken.zip");
  assert.equal(broken.readable, false); assert.equal(broken.integrityStatus, "invalid"); assert.match(broken.warning, /ZIP-Verzeichnis/);
  assert.match(result.warning, /nur ZIP-Verzeichnisse/);
  assert.deepEqual(events, ["operation-start", "helper-start", "helper-end", "operation-end"]);
  assert.deepEqual(await readdir(root), before); assert.deepEqual(await readFile(path.join(root, modernName)), modern);
});

test("NAS-Übersicht unterstützt ZIP64 und einen lesbaren Stand ohne Manifest", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "modern-zip64.zip"), makeZip(modernFiles(), { zip64: true }));
  await writeFile(path.join(root, "IUCN_Datenbank_2026-08-13_185058_no-manifest.zip"), makeZip([["speciesData.json", "[]"]]));
  const result = await readNasBackupArchives(root);
  const modern = result.archives.find(({ name }) => name === "modern-zip64.zip");
  assert.equal(modern.integrityStatus, "manifest-only"); assert.equal(modern.readable, true);
  const unknown = result.archives.find(({ name }) => name.includes("no-manifest"));
  assert.equal(unknown.integrityStatus, "no-manifest"); assert.equal(unknown.fileCount, 1); assert.equal(unknown.readable, true);
  assert.ok(unknown.createdAt); assert.match(unknown.warning, /kein Prüfmanifest/);
});

test("Ein unvollständiges Schema-2-Manifest ergibt keinen positiven Prüfnachweis", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "incomplete.zip"), makeZip(modernFiles({ files: [] })));
  await writeFile(path.join(root, "invalid-count.zip"), makeZip(modernFiles({ fileCount: 4 })));
  await writeFile(path.join(root, "invalid-date.zip"), makeZip(modernFiles({ createdAt: "unknown" })));
  const { archives } = await readNasBackupArchives(root);
  assert.equal(archives.length, 3);
  for (const entry of archives) { assert.equal(entry.readable, false); assert.equal(entry.integrityStatus, "invalid"); assert.match(entry.warning, /unvollständig/); }
});

test("Beschädigte und verschlüsselte Manifeste unterdrücken lesbare Nachbararchive nicht", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "crc.zip"), makeZip(modernFiles(), { corruptManifestCrc: true }));
  await writeFile(path.join(root, "encrypted.zip"), makeZip(modernFiles(), { encryptedManifest: true }));
  await writeFile(path.join(root, "good.zip"), makeZip(modernFiles()));
  const { archives } = await readNasBackupArchives(root);
  assert.equal(archives.find(({ name }) => name === "good.zip").readable, true);
  assert.match(archives.find(({ name }) => name === "crc.zip").warning, /beschädigt/);
  assert.match(archives.find(({ name }) => name === "encrypted.zip").warning, /verschlüsselt/);
});

test("NAS-Übersicht verweigert ZIP-Pfadtraversierung und doppelte Archivpfade", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "unsafe.zip"), makeZip([["../speciesData.json", "[]"]]));
  await writeFile(path.join(root, "duplicate.zip"), makeZip([["speciesData.json", "[]"], ["SpeciesData.json", "[]"]]));
  const { archives } = await readNasBackupArchives(root);
  for (const entry of archives) { assert.equal(entry.readable, false); assert.match(entry.warning, /Unsichere.*doppelte/); }
});

test("NAS-Übersicht begrenzt expandierende Manifestdaten", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "oversize.zip"), makeZip([["backup-manifest.json", Buffer.alloc(4 * 1024 * 1024 + 1, 32)]]));
  const { archives } = await readNasBackupArchives(root);
  assert.equal(archives[0].readable, false); assert.match(archives[0].warning, /begrenzte Lesung/);
});

test("NAS-Übersicht begrenzt die Zahl der gelesenen Archive mit sichtbarem Hinweis", async (t) => {
  const root = await fixture(t);
  const zip = makeZip([["speciesData.json", "[]"]]);
  for (let index = 0; index < 129; index += 1) await writeFile(path.join(root, `archive-${index}.zip`), zip);
  const result = await readNasBackupArchives(root);
  assert.equal(result.archives.length, 128); assert.match(result.warning, /weitere Archive.*fehlen/);
});

test("Fehlende Sicherungsordner werden ehrlich gemeldet und nicht angelegt", async (t) => {
  const root = await fixture(t), missing = path.join(root, "not-created");
  await assert.rejects(readNasBackupArchives(missing), (error) => error.statusCode === 503 && /nicht erreichbar/.test(error.message));
  assert.deepEqual(await readdir(root), []);
  await assert.rejects(readNasBackupArchives("relative"), (error) => error.statusCode === 400);
});

test("NAS-Übersicht verweigert einen verknüpften Stamm und eine verknüpfte Archivdatei", async (t) => {
  const root = await fixture(t), real = path.join(root, "real"), linked = path.join(root, "linked");
  await mkdir(real); await writeFile(path.join(real, "good.zip"), makeZip(modernFiles()));
  await symlink(real, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(readNasBackupArchives(linked), /Verknüpfte Sicherungsordner/);
  // A directory junction named .zip exercises the archive lstat rejection on
  // Windows without requesting the privilege required for file symlinks.
  await symlink(real, path.join(root, "linked.zip"), process.platform === "win32" ? "junction" : "dir");
  const { archives } = await readNasBackupArchives(root);
  assert.equal(archives.length, 1); assert.equal(archives[0].readable, false); assert.match(archives[0].warning, /Verknüpfte/);
});

function fakeChild(behaviour, observe) {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 999999;
  let closed = false;
  child.kill = () => { observe.push("kill"); if (!closed) setImmediate(() => {
    if (closed) return;
    closed = true; observe.push("close"); child.emit("close", null);
  }); return true; };
  setImmediate(() => behaviour(child, () => { closed = true; observe.push("close"); child.emit("close", 0); }));
  return child;
}

test("NAS-Lesefrist beendet den Helfer vor der Temp- und Antwortfreigabe", async (t) => {
  const root = await fixture(t), events = [];
  await assert.rejects(readNasBackupArchives(root, { timeoutMs: 20,
    tempSession: { async beginOperation() { events.push("begin"); return async () => events.push("release-operation"); },
      async registerHelper() { events.push("register"); return async () => events.push("release-helper"); } },
    spawnProcess(command, args, options) {
      assert.equal(command, process.execPath); assert.deepEqual(args.slice(1), ["--archives-worker", root]);
      assert.equal(options.windowsHide, true); assert.equal(options.shell, false);
      return fakeChild(() => {}, events);
    },
  }), /nicht rechtzeitig/);
  assert.ok(events.indexOf("close") < events.indexOf("release-helper"));
  assert.ok(events.indexOf("release-helper") < events.indexOf("release-operation"));
});

test("NAS-Leser begrenzt Ausgabe und behandelt einen Startfehler nach Prozessende", async (t) => {
  const root = await fixture(t);
  for (const [kind, message] of [["output", /sichere Grenze/], ["error", /nicht gestartet/]]) {
    const events = [];
    await assert.rejects(readNasBackupArchives(root, { spawnProcess() {
      return fakeChild((child, close) => {
        if (kind === "output") child.stdout.emit("data", Buffer.alloc(512 * 1024 + 1));
        else { child.emit("error", new Error("blocked")); close(); }
      }, events);
    } }), message);
    assert.ok(events.includes("close"));
  }
});

test("Backupdienst listet nur den konfigurierten geprüften Pfad und bündelt parallele Lesungen", async (t) => {
  const root = await fixture(t), calls = [], session = {};
  let finish;
  const service = await createBackupService({ repoRoot: root, defaultBackupRoot: "W:\\Sicherungen",
    localSettingsPath: path.join(root, "settings.json"), localSettingsFile: "settings.json", backupLogLineLimit: 10,
    isPipelineActive: () => false, isAssetWriteActive: () => false, tempSession: session,
    readArchives(backupRoot, options) { calls.push({ backupRoot, options }); return new Promise((resolve) => { finish = resolve; }); },
    spawnProcess() { throw new Error("Kein Backup darf gestartet werden."); },
  });
  const first = service.listArchives(), second = service.listArchives();
  assert.equal(first, second); await new Promise(setImmediate);
  assert.equal(calls.length, 1); assert.equal(calls[0].backupRoot, "W:\\Sicherungen"); assert.equal(calls[0].options.tempSession, session);
  finish({ backupRoot: "W:\\Sicherungen", archives: [] }); await first;
  assert.equal(service.getState().status, "idle");
  await service.saveBackupSettings({ backupRoot: "W:\\Older backups" });
  const third = service.listArchives(); await new Promise(setImmediate);
  assert.equal(calls[1].backupRoot, "W:\\Older backups"); finish({ archives: [] }); await third;
});
