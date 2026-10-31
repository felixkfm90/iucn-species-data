import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson, objectJson, transportJson, digest } from "./security.mjs";
import { check } from "./errors.mjs";

const pendingStates = "('queued','uncertain','conflict')";

/** Private installation cache. Authentication material is never accepted by this facade. */
export function createSharedProjectClientStore({ filename, localStorageConfirmed = false } = {}) {
  check(localStorageConfirmed && typeof filename === "string" && path.isAbsolute(filename)
    && !/^(?:\\\\|\/\/|file:)/i.test(filename), 400, "unsafe_storage", "Ein lokaler Cachepfad ist erforderlich.");
  let current = path.parse(filename).root;
  for (const part of path.relative(current, filename).split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) check(!fs.lstatSync(current).isSymbolicLink(), 400, "unsafe_storage", "Verknüpfte Cachepfade sind unzulässig.");
  }
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  fs.chmodSync(filename, 0o600);
  db.exec("PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  const schema = db.prepare("PRAGMA user_version").get().user_version;
  if (![0, 1, 2].includes(schema)) { db.close(); check(false, 409, "unsupported_schema", "Unbekannte Cacheversion."); }
  db.exec(`
    CREATE TABLE IF NOT EXISTS bindings(id TEXT PRIMARY KEY, base_url TEXT NOT NULL, project_id TEXT NOT NULL,
      user_id TEXT NOT NULL, user_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cache(binding_id TEXT NOT NULL REFERENCES bindings(id),kind TEXT NOT NULL,id TEXT NOT NULL,
      server_json TEXT NOT NULL,local_json TEXT NOT NULL,visible INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(binding_id,kind,id));
    CREATE TABLE IF NOT EXISTS queue(seq INTEGER PRIMARY KEY AUTOINCREMENT,binding_id TEXT NOT NULL REFERENCES bindings(id),
      change_id TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,object_id TEXT NOT NULL,base_revision TEXT,depends_on TEXT,
      data_json TEXT NOT NULL,request_json TEXT,state TEXT NOT NULL,result_revision TEXT,conflict_id TEXT);
    CREATE TABLE IF NOT EXISTS conflicts(binding_id TEXT NOT NULL REFERENCES bindings(id),id TEXT NOT NULL,
      conflict_json TEXT NOT NULL,resolved INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(binding_id,id));
    CREATE TABLE IF NOT EXISTS pulls(id TEXT PRIMARY KEY,binding_id TEXT NOT NULL REFERENCES bindings(id),
      snapshot TEXT NOT NULL,total_count INTEGER NOT NULL,last_key TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS pull_objects(pull_id TEXT NOT NULL REFERENCES pulls(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,id TEXT NOT NULL,object_json TEXT NOT NULL,PRIMARY KEY(pull_id,kind,id));
    PRAGMA user_version=2;
  `);
  let closed = false;
  function open() { check(!closed, 409, "client_closed", "Der Projektcache ist geschlossen."); }
  function tx(fn) {
    open(); db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function binding(id) {
    open(); const row = db.prepare("SELECT * FROM bindings WHERE id=?").get(id);
    return row ? { id: row.id, baseUrl: row.base_url, projectId: row.project_id, userId: row.user_id, user: JSON.parse(row.user_json) } : null;
  }
  function pending(id) { open(); return db.prepare(`SELECT * FROM queue WHERE binding_id=? AND state IN ${pendingStates} ORDER BY seq`).all(id); }
  function object(id, kind, objectId, { readOnly = false, serverOnly = false } = {}) {
    open(); const row = db.prepare("SELECT * FROM cache WHERE binding_id=? AND kind=? AND id=?").get(id, kind, objectId);
    check(row && row.visible, 404, "object_not_cached", "Dieses Objekt ist für diese Projektverbindung nicht verfügbar.");
    const server = JSON.parse(row.server_json), active = pending(id).filter((entry) => entry.kind === kind && entry.object_id === objectId);
    check(!readOnly || server.approval === "approved" && server.approvedRevision === server.revision, 404, "object_not_cached", "Dieses Objekt ist in der Lesefassung nicht freigegeben.");
    return { ...server, data: readOnly || serverOnly ? server.data : JSON.parse(row.local_json), localPending: active.length > 0, localConflict: active.some((entry) => entry.state === "conflict") };
  }
  function saveRemote(id, value) {
    const active = db.prepare(`SELECT 1 FROM queue WHERE binding_id=? AND kind=? AND object_id=? AND state IN ${pendingStates}`).get(id, value.kind, value.id);
    const serialized = canonicalJson(value, { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 }), local = objectJson(value.data);
    db.prepare(`INSERT INTO cache VALUES (?,?,?,?,?,1) ON CONFLICT(binding_id,kind,id) DO UPDATE SET
      server_json=excluded.server_json,visible=1,local_json=CASE WHEN ? THEN cache.local_json ELSE excluded.local_json END`)
      .run(id, value.kind, value.id, serialized, local, Number(Boolean(active)));
  }
  return {
    projectIds() { open(); return db.prepare("SELECT DISTINCT project_id FROM bindings ORDER BY project_id").all().map(row => row.project_id); },
    active() { open(); return binding(db.prepare("SELECT value FROM state WHERE key='active'").get()?.value ?? ""); },
    bind({ baseUrl, projectId, user }) {
      check(typeof projectId === "string" && projectId.length <= 100 && user && typeof user.id === "string", 502, "invalid_response", "Die Projektidentität fehlt.");
      const id = digest(`${baseUrl}\n${projectId}\n${user.id}`);
      return tx(() => {
        const safeUser = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
        db.prepare("INSERT INTO bindings VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_json=excluded.user_json")
          .run(id, baseUrl, projectId, user.id, canonicalJson(safeUser));
        db.prepare("INSERT OR REPLACE INTO state VALUES ('active',?)").run(id);
        return binding(id);
      });
    },
    updateUser(id, user) {
      return tx(() => {
        const safeUser = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
        db.prepare("UPDATE bindings SET user_json=? WHERE id=?").run(canonicalJson(safeUser), id);
      });
    },
    saveObjects(id, objects) { return tx(() => {
      db.prepare("UPDATE cache SET visible=0 WHERE binding_id=?").run(id);
      for (const value of objects) saveRemote(id, value);
    }); },
    beginPull(id, { snapshot, totalCount }) { return tx(() => {
      check(binding(id) && /^[a-f0-9]{64}$/.test(snapshot) && Number.isInteger(totalCount) && totalCount >= 0 && totalCount <= 100000,
        502, "invalid_response", "Ungültige Bestandsübertragung.");
      const pullId = randomUUID();
      db.prepare("INSERT INTO pulls(id,binding_id,snapshot,total_count) VALUES (?,?,?,?)").run(pullId, id, snapshot, totalCount);
      return pullId;
    }); },
    stagePull(pullId, { snapshot, totalCount, objects }) { return tx(() => {
      const pull = db.prepare("SELECT * FROM pulls WHERE id=?").get(pullId);
      check(pull && pull.snapshot === snapshot && pull.total_count === totalCount && Array.isArray(objects) && objects.length <= 25,
        502, "invalid_response", "Der Seitenabruf gehört nicht zum begonnenen Bestand.");
      let last = pull.last_key;
      for (const value of objects) {
        const key = `${value.kind}/${value.id}`;
        check(key > last, 502, "invalid_response", "Objektfolge ist doppelt oder unvollständig geordnet.");
        db.prepare("INSERT INTO pull_objects VALUES (?,?,?,?)").run(pullId, value.kind, value.id,
          canonicalJson(value, { maxBytes: 3 * 1024 * 1024, maxNodes: 300000 }));
        last = key;
      }
      check(db.prepare("SELECT count(*) AS n FROM pull_objects WHERE pull_id=?").get(pullId).n <= totalCount,
        502, "invalid_response", "Der Bestand enthält zu viele Objekte.");
      db.prepare("UPDATE pulls SET last_key=? WHERE id=?").run(last, pullId);
    }); },
    finishPull(pullId, { snapshot, totalCount }) { return tx(() => {
      const pull = db.prepare("SELECT * FROM pulls WHERE id=?").get(pullId);
      check(pull && pull.snapshot === snapshot && pull.total_count === totalCount
        && db.prepare("SELECT count(*) AS n FROM pull_objects WHERE pull_id=?").get(pullId).n === totalCount,
      502, "invalid_response", "Ein unvollständiger Bestand wird nicht in den Cache übernommen.");
      db.prepare("UPDATE cache SET visible=0 WHERE binding_id=?").run(pull.binding_id);
      for (const row of db.prepare("SELECT object_json FROM pull_objects WHERE pull_id=? ORDER BY kind,id").iterate(pullId)) saveRemote(pull.binding_id, JSON.parse(row.object_json));
      db.prepare("DELETE FROM pulls WHERE id=?").run(pullId);
    }); },
    cancelPull(pullId) { return tx(() => { db.prepare("DELETE FROM pulls WHERE id=?").run(pullId); }); },
    list(id, options) {
      open(); const values = [];
      for (const row of db.prepare("SELECT kind,id,server_json FROM cache WHERE binding_id=? AND visible=1 ORDER BY kind,id").iterate(id)) {
        const server = options?.readOnly ? JSON.parse(row.server_json) : null;
        if (!server || server.approval === "approved" && server.approvedRevision === server.revision) values.push(object(id, row.kind, row.id, options));
      }
      return values;
    },
    get: object,
    edit(id, kind, objectId, data, { baseRevision } = {}) {
      return tx(() => {
        const cached = object(id, kind, objectId), serialized = objectJson(data);
        check(data && typeof data === "object" && !Array.isArray(data), 400, "invalid_data", "Ein Objektinhalt ist erforderlich.");
        const active = pending(id).filter((entry) => entry.kind === kind && entry.object_id === objectId), latest = active.at(-1);
        if (latest && latest.state === "queued" && latest.request_json === null) {
          db.prepare("UPDATE queue SET data_json=? WHERE change_id=?").run(serialized, latest.change_id);
        } else {
          db.prepare("INSERT INTO queue(binding_id,change_id,kind,object_id,base_revision,depends_on,data_json,state) VALUES (?,?,?,?,?,?,?,'queued')")
            .run(id, randomUUID(), kind, objectId, latest ? null : baseRevision ?? cached.revision, latest?.change_id ?? null, serialized);
        }
        db.prepare("UPDATE cache SET local_json=? WHERE binding_id=? AND kind=? AND id=?").run(serialized, id, kind, objectId);
        return object(id, kind, objectId);
      });
    },
    pending,
    prepare(changeId) {
      return tx(() => {
        const row = db.prepare("SELECT * FROM queue WHERE change_id=?").get(changeId);
        check(row && ["queued", "uncertain"].includes(row.state), 409, "change_blocked", "Die Änderung wartet auf eine Entscheidung.");
        if (row.request_json) return JSON.parse(row.request_json);
        let baseRevision = row.base_revision;
        if (row.depends_on) {
          const previous = db.prepare("SELECT * FROM queue WHERE change_id=?").get(row.depends_on);
          check(previous?.state === "applied" && previous.result_revision, 409, "change_blocked", "Die vorherige Änderung ist noch nicht bestätigt.");
          baseRevision = previous.result_revision;
        }
        check(typeof baseRevision === "string", 409, "change_blocked", "Die Ausgangsversion ist noch nicht bestätigt.");
        const request = { changeId: row.change_id, kind: row.kind, id: row.object_id, baseRevision, data: JSON.parse(row.data_json) };
        db.prepare("UPDATE queue SET request_json=?,base_revision=?,state='uncertain' WHERE change_id=?")
          .run(transportJson(request), baseRevision, changeId);
        return request;
      });
    },
    acknowledge(id, changeId, value) {
      return tx(() => {
        db.prepare("UPDATE queue SET state='applied',result_revision=? WHERE binding_id=? AND change_id=?").run(value.revision, id, changeId);
        saveRemote(id, value);
      });
    },
    saveConflict(id, changeId, value) {
      return tx(() => {
        db.prepare("UPDATE queue SET state='conflict',conflict_id=? WHERE binding_id=? AND change_id=?").run(value.id, id, changeId);
        db.prepare("INSERT OR REPLACE INTO conflicts VALUES (?,?,?,0)").run(id, value.id, JSON.stringify(value));
      });
    },
    conflicts(id) {
      open(); return db.prepare("SELECT * FROM conflicts WHERE binding_id=? AND resolved=0 ORDER BY id").all(id).map((row) => {
        const conflict = JSON.parse(row.conflict_json), entries = pending(id).filter((entry) => entry.kind === conflict.kind && entry.object_id === conflict.objectId);
        return { ...conflict, localVersions: entries.map((entry) => ({ changeId: entry.change_id, data: JSON.parse(entry.data_json), state: entry.state })) };
      });
    },
    resolve(id, conflictId, value) {
      return tx(() => {
        const conflict = db.prepare("SELECT * FROM conflicts WHERE binding_id=? AND id=?").get(id, conflictId);
        check(conflict, 404, "conflict_not_found", "Der Konflikt ist lokal nicht vorhanden.");
        const parsed = JSON.parse(conflict.conflict_json);
        db.prepare(`UPDATE queue SET state='superseded' WHERE binding_id=? AND kind=? AND object_id=? AND state IN ${pendingStates}`)
          .run(id, parsed.kind, parsed.objectId);
        db.prepare("UPDATE conflicts SET resolved=1,conflict_json=? WHERE binding_id=? AND id=?")
          .run(JSON.stringify(value.conflict), id, conflictId);
        saveRemote(id, value.object);
      });
    },
    rebaseResolvedConflict(id, conflictId, currentObject, data) {
      return tx(() => {
        const row = db.prepare("SELECT * FROM conflicts WHERE binding_id=? AND id=? AND resolved=0").get(id, conflictId);
        check(row, 404, "conflict_not_found", "Der Konflikt ist lokal nicht vorhanden.");
        const conflict = JSON.parse(row.conflict_json);
        db.prepare(`UPDATE queue SET state='superseded' WHERE binding_id=? AND kind=? AND object_id=? AND state IN ${pendingStates}`)
          .run(id, conflict.kind, conflict.objectId);
        db.prepare("UPDATE conflicts SET resolved=1 WHERE binding_id=? AND id=?").run(id, conflictId);
        saveRemote(id, currentObject);
        if (data !== undefined) {
          const serialized = objectJson(data);
          db.prepare("INSERT INTO queue(binding_id,change_id,kind,object_id,base_revision,data_json,state) VALUES (?,?,?,?,?,?,'queued')")
            .run(id, randomUUID(), conflict.kind, conflict.objectId, currentObject.revision, serialized);
          db.prepare("UPDATE cache SET local_json=? WHERE binding_id=? AND kind=? AND id=?").run(serialized, id, conflict.kind, conflict.objectId);
        }
        return object(id, conflict.kind, conflict.objectId);
      });
    },
    counts(id) {
      open(); return { pending: pending(id).length,
        conflicts: db.prepare("SELECT count(*) AS n FROM conflicts WHERE binding_id=? AND resolved=0").get(id).n,
        otherProjectPending: db.prepare(`SELECT count(*) AS n FROM queue WHERE binding_id<>? AND state IN ${pendingStates}`).get(id).n };
    },
    close() { if (!closed) { db.close(); closed = true; } }
  };
}
