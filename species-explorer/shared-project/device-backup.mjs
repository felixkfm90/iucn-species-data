import fs from "node:fs/promises";
import { constants, createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { backup, DatabaseSync } from "node:sqlite";
import { assertNoTempLinks } from "../temp-session.mjs";
import { canonicalJson, objectJson } from "./security.mjs";

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const DEVICE = /^device-[a-f0-9-]{36}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MANIFEST = "device-backup-manifest.json";
const DENIED_KEY = /^(?:password|passwordhash|credential|credentials|sessiontoken|refreshtoken|accesstoken|bearertoken|token|secret|apikey|privatekey)$/i;
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const same = (a, b) => canonical(a) === canonical(b);
const projectList = (ids) => {
  check(Array.isArray(ids) && ids.length <= 1000 && ids.every((id) => typeof id === "string" && ID.test(id)), "Die vertrauenswürdige Projektbindung fehlt.");
  return [...new Set(ids)].sort();
};
function abortIfNeeded(signal, deadline = Infinity) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Gerätesicherung abgebrochen.");
  check(Date.now() < deadline, "Die Vorbereitung der Gerätesicherung hat zu lange gedauert.");
}
function noSecrets(value, depth = 0) {
  check(depth < 80, "Der persönliche Datenbestand ist zu tief verschachtelt.");
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    check(!DENIED_KEY.test(key.replace(/[_-]/g, "")), "Anmeldedaten dürfen nicht im Gerätesicherungspaket enthalten sein.");
    noSecrets(item, depth + 1);
  }
}
async function regularFile(root, filename, { optional = false, maxBytes = 512 * 1024 * 1024 } = {}) {
  await assertNoTempLinks(root, filename);
  const stat = await fs.lstat(filename).catch((error) => { if (optional && error.code === "ENOENT") return null; throw error; });
  if (!stat) return null;
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maxBytes, "Ungültige oder zu große persönliche Sicherungsdatei.");
  return stat;
}
async function fingerprint(root, filename, options = {}) {
  const before = await regularFile(root, filename, options);
  if (!before) return { exists: false };
  abortIfNeeded(options.signal);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename, { signal: options.signal })) hash.update(chunk);
  const after = await regularFile(root, filename, options);
  check(after && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === after.ino,
    "Persönliche Daten wurden während ihrer Prüfung geändert.");
  return { exists: true, bytes: after.size, sha256: hash.digest("hex") };
}
function descriptor(input) {
  check(input && ID.test(input.id || "") && typeof input.relativePath === "string"
    && !input.relativePath.includes("\\") && !input.relativePath.split("/").some((part) => !part || part === "." || part === "..")
    && input.relativePath !== MANIFEST && !path.isAbsolute(input.relativePath) && !input.relativePath.includes(":"), "Ein fester persönlicher Dateipfad ist erforderlich.");
  check(!/(?:credential|password|token|secret|\.bin$|\.env(?:\.|$))/i.test(input.relativePath), "Anmeldedateien sind von der Gerätesicherung ausgeschlossen.");
  const sqlite = ["client-cache", "import-journal", "sqlite"].includes(input.kind);
  check(sqlite ? /\.sqlite$/.test(input.relativePath) : ["device-profile", "json"].includes(input.kind) && /\.json$/.test(input.relativePath), "Unbekannter persönlicher Sicherungstyp.");
  check(!["sqlite", "json"].includes(input.kind) || typeof input.validate === "function", "Neue persönliche Formate benötigen einen eigenen vertrauenswürdigen Validator.");
  const maxBytes = input.maxBytes ?? (sqlite ? 512 * 1024 * 1024 : 16 * 1024 * 1024);
  check(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 1024 * 1024 * 1024, "Ungültige Größenbegrenzung der Gerätesicherung.");
  return { ...input, sqlite, maxBytes, required: input.required === true };
}
function inspectSqlite(db, spec, context) {
  db.exec("PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;");
  check(db.prepare("PRAGMA quick_check").all().every((row) => row.quick_check === "ok")
    && db.prepare("PRAGMA foreign_key_check").all().length === 0, "Das persönliche SQLite-Abbild ist nicht konsistent.");
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
  for (const name of tables) {
    abortIfNeeded(context.signal, context.deadline);
    check(ID.test(name) && !DENIED_KEY.test(name.replace(/[_-]/g, "")), "Unbekannte oder vertrauliche SQLite-Tabelle.");
    const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
    check(columns.every((column) => !DENIED_KEY.test(column.name.replace(/[_-]/g, ""))), "SQLite-Anmeldedaten sind von der Sicherung ausgeschlossen.");
    for (const row of db.prepare(`SELECT * FROM "${name}"`).iterate()) {
      abortIfNeeded(context.signal, context.deadline);
      for (const [key, value] of Object.entries(row)) if (key.endsWith("_json") && value !== null) noSecrets(JSON.parse(value));
    }
  }
  if (spec.kind === "sqlite") return spec.validate(db, context);
  const version = db.prepare("PRAGMA user_version").get().user_version;
  check(spec.kind === "client-cache" ? [1, 2].includes(version) : version === 1, "Unbekannte persönliche SQLite-Version.");
  let projects, pending = 0;
  if (spec.kind === "client-cache") {
    const expectedTables = version === 1 ? ["bindings", "cache", "conflicts", "queue", "state"]
      : ["bindings", "cache", "conflicts", "pull_objects", "pulls", "queue", "state"];
    check(same(tables, expectedTables), "Unbekanntes persönliches Cacheformat.");
    if (version === 2) {
      for (const [table, columns] of [["pulls", ["id", "binding_id", "snapshot", "total_count", "last_key"]],
        ["pull_objects", ["pull_id", "kind", "id", "object_json"]]]) {
        check(same(db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name), columns), "Unbekanntes persönliches Abrufformat.");
      }
      const pullsForeignKeys = db.prepare("PRAGMA foreign_key_list(pulls)").all();
      const objectsForeignKeys = db.prepare("PRAGMA foreign_key_list(pull_objects)").all();
      check(pullsForeignKeys.length === 1 && pullsForeignKeys[0].table === "bindings" && pullsForeignKeys[0].from === "binding_id"
        && pullsForeignKeys[0].to === "id" && objectsForeignKeys.length === 1 && objectsForeignKeys[0].table === "pulls"
        && objectsForeignKeys[0].from === "pull_id" && objectsForeignKeys[0].to === "id" && objectsForeignKeys[0].on_delete === "CASCADE",
      "Die persönlichen Abrufbezüge sind unvollständig.");
      for (const pull of db.prepare("SELECT * FROM pulls ORDER BY id").iterate()) {
        abortIfNeeded(context.signal, context.deadline);
        check(UUID.test(pull.id) && HASH.test(pull.snapshot) && Number.isInteger(pull.total_count) && pull.total_count >= 0
          && pull.total_count <= 100000 && typeof pull.last_key === "string", "Ein persönlicher Zwischenabruf ist beschädigt.");
        let count = 0, last = "";
        for (const row of db.prepare("SELECT kind,id,object_json FROM pull_objects WHERE pull_id=? ORDER BY kind COLLATE BINARY,id COLLATE BINARY").iterate(pull.id)) {
          abortIfNeeded(context.signal, context.deadline);
          const value = JSON.parse(row.object_json), key = `${row.kind}/${row.id}`;
          check(["page", "species"].includes(row.kind) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id) && key > last
            && value?.kind === row.kind && value.id === row.id && UUID.test(value.revision) && Number.isSafeInteger(value.ordinal)
            && value.ordinal >= 1 && value.data && typeof value.data === "object" && !Array.isArray(value.data),
          "Ein persönliches Abrufobjekt ist nicht eindeutig gebunden.");
          objectJson(value.data); canonicalJson(value, { maxBytes: 3 * 1024 * 1024, maxNodes: 300000 });
          last = key; count++;
        }
        check(count <= pull.total_count && last === pull.last_key, "Der persönliche Zwischenabruf besitzt keine passende Mengen-/Reihenfolgebindung.");
      }
    }
    projects = db.prepare("SELECT DISTINCT project_id AS id FROM bindings ORDER BY id").all().map((row) => row.id);
    for (const row of db.prepare("SELECT * FROM queue").iterate()) {
      check(["queued", "uncertain", "conflict", "applied", "superseded"].includes(row.state), "Ungültiger Zustand einer ungesendeten Änderung.");
      const value = JSON.parse(row.data_json);
      check(value && typeof value === "object" && !Array.isArray(value), "Eine ungesendete Änderung ist nicht lesbar.");
      if (row.request_json !== null) {
        const request = JSON.parse(row.request_json);
        check(request.changeId === row.change_id && request.kind === row.kind && request.id === row.object_id
          && same(request.data, value), "Eine ungesendete Änderung besitzt keine eindeutige Anfragebindung.");
      }
      if (["queued", "uncertain", "conflict"].includes(row.state)) pending++;
    }
    for (const row of db.prepare("SELECT key,value FROM state").iterate()) {
      check(!DENIED_KEY.test(row.key.replace(/[_-]/g, "")), "Der Cache enthält unzulässige Anmeldewerte.");
    }
  } else {
    check(same(tables, ["items", "lease", "plans", "receipts"]), "Unbekanntes persönliches Importjournalformat.");
    projects = db.prepare("SELECT DISTINCT project_id AS id FROM plans ORDER BY id").all().map((row) => row.id);
    for (const row of db.prepare("SELECT * FROM plans").iterate()) check(HASH.test(row.source_hash)
      && ["planned", "running", "stopped", "complete", "superseded"].includes(row.state), "Der persönliche Importplan ist beschädigt.");
    for (const row of db.prepare("SELECT items.*,plans.state AS plan_state FROM items JOIN plans ON plans.id=items.plan_id").iterate()) {
      const target = JSON.parse(row.target_json);
      check(["pending", "skipped", "create-intent", "created", "approve-intent", "approved"].includes(row.state)
        && target && HASH.test(row.target_hash) && (row.state === "skipped" || sha(canonicalJson(target)) === row.target_hash), "Ein offener Importauftrag ist nicht lesbar.");
      if (!["skipped", "approved"].includes(row.state) && !["complete", "superseded"].includes(row.plan_state)) pending++;
    }
  }
  check(projects.every((id) => context.projectIds.includes(id)), "Persönliche Daten gehören zu einem nicht gebundenen Projekt.");
  return { projectIds: projectList(projects), pending };
}
async function inspect(filename, spec, context) {
  if (spec.sqlite) {
    const db = new DatabaseSync(filename, { readOnly: true, timeout: 1000 });
    try { return await inspectSqlite(db, spec, context); } finally { db.close(); }
  }
  const value = JSON.parse(await fs.readFile(filename, "utf8")); noSecrets(value);
  if (spec.kind === "device-profile") {
    check(value.schemaVersion === 1 && value.id === context.deviceId && typeof value.name === "string"
      && value.name.trim() && value.name.length <= 100 && Object.keys(value).every((key) => ["schemaVersion", "id", "name"].includes(key)), "Die persönliche Gerätekennung passt nicht zur Sicherung.");
    return { projectIds: [], pending: 0 };
  }
  return spec.validate(value, context);
}
function checkedResult(value, context) {
  check(value && Number.isSafeInteger(value.pending) && value.pending >= 0, "Der persönliche Validator muss offene Änderungen zuverlässig zählen.");
  const ids = projectList(value.projectIds);
  check(ids.every((id) => context.projectIds.includes(id)), "Die persönliche Projektbindung ist widersprüchlich.");
  return { projectIds: ids, pending: value.pending };
}

/**
 * Root/main-owned paths only; never accept renderer-supplied paths or targets.
 * resolveProjectIds({signal}) resolves ALL local bindings, including inactive
 * projects with pending work. files is a fixed list of {id,relativePath,kind,
 * required?,maxBytes?,validate?}; new sqlite/json formats require validate(db
 * or parsedJson,{deviceId,projectIds,signal,deadline}) -> {projectIds,pending}.
 * A custom validator must finish before returning and must not retain the db.
 * prepare's result owns an open managed-temp operation until dispose(); it
 * must remain alive until the existing PS NAS run has fully exited.
 */
export function createDeviceBackupProvider({ profileRoot, deviceId, resolveProjectIds, files, tempSession,
  maxTotalBytes = 1024 * 1024 * 1024, timeoutMs = 120000 } = {}) {
  check(path.isAbsolute(profileRoot || "") && !/^[/\\]{2}/.test(profileRoot) && DEVICE.test(deviceId || "")
    && typeof resolveProjectIds === "function" && tempSession?.filePath && tempSession?.beginOperation, "Die vertrauenswürdige lokale Gerätesicherung ist unvollständig.");
  check(Array.isArray(files) && files.length > 0 && files.length <= 32 && Number.isSafeInteger(maxTotalBytes)
    && maxTotalBytes > 0 && Number.isSafeInteger(timeoutMs) && timeoutMs > 0, "Die feste persönliche Sicherungsliste fehlt.");
  const specs = files.map(descriptor);
  check(new Set(specs.map((spec) => spec.id)).size === specs.length && new Set(specs.map((spec) => spec.relativePath.toLowerCase())).size === specs.length,
    "Doppelte persönliche Sicherungsdatei.");
  let preparing = false;
  return {
    async prepare({ signal } = {}) {
      check(!preparing, "Die persönliche Sicherung wird bereits vorbereitet."); preparing = true;
      const paths = [], owned = new Map();
      let release;
      try { release = await tempSession.beginOperation(); } catch (error) { preparing = false; throw error; }
      let disposed = false;
      const dispose = async () => {
        if (disposed) return; disposed = true;
        try {
          for (const filename of paths.reverse()) {
            await assertNoTempLinks(tempSession.root, filename);
            const stat = await fs.lstat(filename).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
            if (stat) { check(stat.isFile() && !stat.isSymbolicLink() && owned.get(filename) === `${stat.dev}:${stat.ino}`,
              "Unbekanntes persönliches Temp-Artefakt bleibt geschützt."); await fs.unlink(filename); }
          }
        } finally { await release(); }
      };
      try {
        abortIfNeeded(signal);
        const deadline = Date.now() + timeoutMs, projectIds = projectList(await resolveProjectIds({ signal }));
        const remember = async (filename) => { const stat = await fs.lstat(filename); owned.set(filename, `${stat.dev}:${stat.ino}`); };
        const context = { deviceId, projectIds, signal, deadline }, prefix = `device-${randomUUID()}`, records = [], originals = [];
        let totalBytes = 0, pending = 0;
        await assertNoTempLinks(profileRoot);
        for (const spec of specs) {
          abortIfNeeded(signal, deadline);
          const source = path.join(profileRoot, spec.relativePath), before = [];
          for (const suffix of spec.sqlite ? ["", "-wal"] : [""]) before.push({ path: source + suffix,
            ...await fingerprint(profileRoot, source + suffix, { optional: !spec.required || Boolean(suffix), maxBytes: spec.maxBytes, signal }) });
          originals.push(...before);
          if (!before[0].exists) {
            check(before.every((original) => !original.exists), "Eine persönliche Datenbank fehlt, obwohl noch ein WAL-Journal vorhanden ist.");
            continue;
          }
          const extension = spec.sqlite ? ".sqlite" : ".json", filename = await tempSession.filePath(`${prefix}-${spec.id}${extension}`);
          paths.push(filename);
          if (spec.sqlite) {
            await fs.writeFile(filename, "", { flag: "wx", mode: 0o600 }); await remember(filename);
            for (const suffix of ["-wal", "-shm", "-journal"]) {
              paths.push(await tempSession.filePath(path.basename(filename) + suffix));
            }
            try {
              const db = new DatabaseSync(source, { readOnly: true, timeout: 1000 });
              try { await backup(db, filename, { rate: 64, progress: () => abortIfNeeded(signal, deadline) }); }
              finally { db.close(); }
              // Only our new copy is normalized. Never checkpoint or change the live source.
              const copy = new DatabaseSync(filename, { timeout: 1000 });
              try { copy.exec("PRAGMA journal_mode=DELETE;"); } finally { copy.close(); }
            } finally {
              for (const suffix of ["-wal", "-shm", "-journal"]) {
                const sidecar = filename + suffix;
                await assertNoTempLinks(tempSession.root, sidecar);
                if (await fs.lstat(sidecar).catch((error) => { if (error.code === "ENOENT") return null; throw error; })) await remember(sidecar);
              }
            }
          } else { await fs.copyFile(source, filename, constants.COPYFILE_EXCL); await remember(filename); }
          await fs.chmod(filename, 0o600);
          const checked = checkedResult(await inspect(filename, spec, context), context);
          const copied = await fingerprint(tempSession.root, filename, { maxBytes: spec.maxBytes, signal });
          totalBytes += copied.bytes; pending += checked.pending;
          check(totalBytes <= maxTotalBytes, "Der persönliche Sicherungsumfang überschreitet die erlaubte Größe.");
          for (const original of before) check(same(original, { path: original.path,
            ...await fingerprint(profileRoot, original.path, { optional: true, maxBytes: spec.maxBytes, signal }) }), "Persönliche Daten wurden während der Snapshot-Erstellung geändert.");
          records.push({ id: spec.id, kind: spec.kind, relativePath: spec.relativePath, bytes: copied.bytes, sha256: copied.sha256,
            projectIds: checked.projectIds, pending: checked.pending, sourcePath: filename });
        }
        const logical = records.map(({ sourcePath, ...record }) => record), stateHash = sha(canonical({ deviceId, projectIds, files: logical }));
        const manifest = { schemaVersion: 1, backupKind: "arten-explorer-device-profile", deviceId, projectIds, stateHash,
          pending, files: logical, excluded: ["credentials", "passwords", "tokens", "credential .bin files"], completeness: "all-configured-files" };
        const manifestPath = await tempSession.filePath(`${prefix}-handoff.json`), archiveManifest = await tempSession.filePath(`${prefix}-manifest.json`);
        paths.push(manifestPath, archiveManifest);
        await fs.writeFile(archiveManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        await remember(archiveManifest);
        const manifestRecord = await fingerprint(tempSession.root, archiveManifest, { maxBytes: 1024 * 1024, signal });
        const archivePrefix = `device-profiles/${deviceId}/`;
        const entries = [...records.map((record) => ({ sourcePath: record.sourcePath, path: archivePrefix + record.relativePath,
          bytes: record.bytes, sha256: record.sha256 })), { sourcePath: archiveManifest, path: archivePrefix + MANIFEST,
          bytes: manifestRecord.bytes, sha256: manifestRecord.sha256 }];
        const handoff = { schemaVersion: 1, backupKind: "arten-explorer-device-handoff", deviceId, projectIds, stateHash, pending,
          stagingRoot: tempSession.root, profileRoot, files: entries, originals };
        await fs.writeFile(manifestPath, `${JSON.stringify(handoff, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        await remember(manifestPath);
        const assertSourcesUnchanged = async () => {
          check(!disposed, "Der persönliche Snapshot wurde bereits freigegeben.");
          for (const original of originals) check(same(original, { path: original.path, ...await fingerprint(profileRoot, original.path,
            { optional: true, maxBytes: 1024 * 1024 * 1024, signal }) }), "Persönliche Daten wurden seit der Snapshot-Erstellung geändert.");
          for (const entry of entries) check(same({ exists: true, bytes: entry.bytes, sha256: entry.sha256 },
            await fingerprint(tempSession.root, entry.sourcePath, { maxBytes: 1024 * 1024 * 1024, signal })), "Der persönliche Snapshot wurde verändert.");
        };
        await assertSourcesUnchanged();
        return { manifestPath, summary: { deviceId, projectIds, stateHash, pending, fileCount: records.length, totalBytes }, assertSourcesUnchanged, dispose };
      } catch (error) { await dispose(); throw error; }
      finally { preparing = false; }
    },
  };
}

/** Validate a separately extracted copy AFTER the existing full NAS-v2 archive verification. No restore/mutation API. */
export async function validateDeviceBackupCopy({ directory, expectedDeviceId, expectedProjectIds, expectedStateHash = null, files, activeProfileRoot = null } = {}) {
  check(path.isAbsolute(directory || "") && DEVICE.test(expectedDeviceId || ""), "Die getrennte Wiederherstellungskopie ist nicht gebunden.");
  if (activeProfileRoot) {
    const relative = path.relative(path.resolve(activeProfileRoot), path.resolve(directory));
    check(relative && (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)), "Das aktive Geräteprofil ist kein Wiederherstellungsprüfziel.");
  }
  const projectIds = projectList(expectedProjectIds), specs = files.map(descriptor);
  await regularFile(directory, path.join(directory, MANIFEST), { maxBytes: 1024 * 1024 });
  const manifest = JSON.parse(await fs.readFile(path.join(directory, MANIFEST), "utf8"));
  check(expectedStateHash === null || HASH.test(expectedStateHash) && manifest.stateHash === expectedStateHash, "Die persönliche Kopie gehört nicht zum ausgewählten geprüften Sicherungsstand.");
  check(manifest.schemaVersion === 1 && manifest.backupKind === "arten-explorer-device-profile" && manifest.deviceId === expectedDeviceId
    && same(manifest.projectIds, projectIds) && manifest.completeness === "all-configured-files" && Array.isArray(manifest.files)
    && manifest.files.length <= 32, "Die persönliche Sicherung besitzt eine fremde oder unvollständige Bindung.");
  check(sha(canonical({ deviceId: manifest.deviceId, projectIds, files: manifest.files })) === manifest.stateHash, "Das persönliche Sicherungsverzeichnis wurde verändert.");
  const seen = new Set(); let pending = 0;
  for (const record of manifest.files) {
    const spec = specs.find((entry) => entry.id === record.id);
    check(spec && spec.kind === record.kind && spec.relativePath === record.relativePath && !seen.has(spec.id), "Unbekannte oder doppelte persönliche Sicherungsdatei."); seen.add(spec.id);
    const filename = path.join(directory, spec.relativePath), actual = await fingerprint(directory, filename, { maxBytes: spec.maxBytes });
    check(actual.bytes === record.bytes && actual.sha256 === record.sha256, "Die persönliche Wiederherstellungskopie stimmt nicht mit ihren Prüfwerten überein.");
    const checked = checkedResult(await inspect(filename, spec, { deviceId: expectedDeviceId, projectIds }), { projectIds });
    check(same(checked.projectIds, record.projectIds) && checked.pending === record.pending, "Die persönlichen offenen Änderungen sind nicht vollständig gebunden."); pending += checked.pending;
  }
  check(specs.every((spec) => !spec.required || seen.has(spec.id)) && pending === manifest.pending, "Die persönliche Sicherung enthält nicht alle benötigten offenen Änderungen.");
  const expectedFiles = new Set([MANIFEST, ...manifest.files.map((record) => record.relativePath)]);
  async function visit(relative = "") {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      await assertNoTempLinks(directory, path.join(directory, name));
      if (entry.isDirectory()) {
        check([...expectedFiles].some((filename) => filename.startsWith(name + "/")), "Ein unbekannter Wiederherstellungsordner bleibt ungeprüft."); await visit(name);
      } else check(entry.isFile() && expectedFiles.has(name), "Die Wiederherstellungskopie enthält unbekannte oder vertrauliche Zusatzdateien.");
    }
  }
  await visit();
  return { ok: true, deviceId: expectedDeviceId, projectIds, stateHash: manifest.stateHash, pending, fileCount: seen.size };
}
