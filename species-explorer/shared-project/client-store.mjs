import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson, objectJson, transportJson, digest } from "./security.mjs";
import { check } from "./errors.mjs";
import { CLIENT_IMAGE_SCHEMA, createClientImageStore } from "./client-image-media-store.mjs";
import { validateSealedEditorialRequest } from "./client-editorial-queue.mjs";
import { CLIENT_NORMAL_SCHEMA,createClientNormalStore,assertClientNormalSchema } from './client-normal-media-store.mjs';
import { normalMediaBinding } from './normal-media.mjs';
import { CLIENT_ENRICHMENT_SCHEMA, createClientEnrichmentStore, readQueuedSpeciesEnrichment } from "./client-enrichment-store.mjs";

const pendingStates = "('queued','uncertain','conflict')";
const cacheColumns={bindings:'id,base_url,project_id,user_id,user_json',state:'key,value',cache:'binding_id,kind,id,server_json,local_json,visible',
  queue:'seq,binding_id,change_id,kind,object_id,base_revision,depends_on,data_json,request_json,state,result_revision,conflict_id',
  conflicts:'binding_id,id,conflict_json,resolved',pulls:'id,binding_id,snapshot,total_count,last_key',pull_objects:'pull_id,kind,id,object_json',
  image_blobs:'sha256,bytes,data',image_media:'binding_id,id,metadata_json,blob_sha256,uploaded,receipt_json',
  normal_blobs:'sha256,bytes,mime_type,width,height,data',normal_media:'binding_id,content_id,metadata_json,source_revision,source_data_hash,blob_sha256,receipt_json',
  enrichment_candidates:"binding_id,candidate_id,payload_json",enrichment_files:"binding_id,candidate_id,slot,sha256,bytes,mime_type,data"};
function cacheSchema(db,version) {
  const names=Object.keys(cacheColumns).filter(name=>version>=4||!name.startsWith('normal_')).filter(name=>version>=3||!name.startsWith('image_'))
    .filter(name=>version>=2||!['pulls','pull_objects'].includes(name)).filter(name=>version>=5||!name.startsWith("enrichment_")).sort();
  const actual=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
  check(JSON.stringify(names)===JSON.stringify(actual),409,'unsupported_schema','Die persönlichen Cachetabellen besitzen ein unbekanntes oder unvollständiges Format.');
  for(const name of names)check(db.prepare(`PRAGMA table_xinfo(${name})`).all().map(column=>column.name).join(',')===cacheColumns[name],409,'unsupported_schema','Die persönlichen Cachespalten besitzen ein unbekanntes Format.');
  check(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type<>'table' AND sql IS NOT NULL").get().n===0,
    409,'unsupported_schema','Unbekannte ausführbare Cacheelemente bleiben geschützt.');
  if(version>=4)assertClientNormalSchema(db);
  if(version===5) {
    const normalize = sql => sql.replace(/\s+/gu, "").toLowerCase();
    for (const statement of CLIENT_ENRICHMENT_SCHEMA.split(";").map(value=>value.trim()).filter(Boolean)) {
      const table=/^CREATE TABLE (\w+)/.exec(statement)[1];
      check(normalize(db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)?.sql||"")===normalize(statement),
        409,"unsupported_schema","Das Format der persönlichen Artvorschläge wurde verändert.");
    }
  }
}

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
  try {
  fs.chmodSync(filename, 0o600);
  db.exec("PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  const schema = db.prepare("PRAGMA user_version").get().user_version;
  check([0, 1, 2, 3, 4, 5].includes(schema), 409, "unsupported_schema", "Unbekannte Cacheversion.");
  if(schema)cacheSchema(db,schema);
  else check(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").get().n===0,409,'unsupported_schema','Eine unbekannte vorhandene Datenbank wird nicht als neuer Cache angelegt.');
  if(schema<3)db.exec(`
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
    ${CLIENT_IMAGE_SCHEMA}
    PRAGMA user_version=3;
  `);
  if(schema<4) {
    db.exec('BEGIN IMMEDIATE');try{cacheSchema(db,3);db.exec(CLIENT_NORMAL_SCHEMA);db.exec('PRAGMA user_version=4');cacheSchema(db,4);db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  }catch(error){db.close();throw error;}
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
  function editorialChange(id, changeId) {
    const owner = binding(id), row = db.prepare("SELECT * FROM queue WHERE binding_id=? AND change_id=?").get(id, changeId);
    check(owner && row && ["queued", "uncertain"].includes(row.state) && row.request_json, 409, "change_blocked", "Dieser Übernahmeauftrag kann nicht auf diese Weise abgeschlossen werden.");
    const request = validateSealedEditorialRequest(JSON.parse(row.request_json), { changeId, kind: row.kind, id: row.object_id,
      baseRevision: row.base_revision, data: JSON.parse(row.data_json), projectId: owner.projectId, userId: owner.userId });
    check(!pending(id).some(entry => entry.kind === row.kind && entry.object_id === row.object_id && entry.seq > row.seq),
      409, "editorial_followup_review_required", "Hinter dieser Übernahme liegen weitere eigene Änderungen. Sie müssen vor dem Abschließen gesondert geprüft werden; alle Fassungen bleiben erhalten.");
    return request;
  }
  function conflictStamp(id, conflictId) {
    open(); const row = db.prepare("SELECT conflict_json FROM conflicts WHERE binding_id=? AND id=? AND resolved=0").get(id, conflictId);
    return row ? digest(row.conflict_json) : null;
  }
  function assertConflictVersions(id, conflictId, expected) {
    if (expected === undefined) return true;
    const row = db.prepare("SELECT conflict_json FROM conflicts WHERE binding_id=? AND id=? AND resolved=0").get(id, conflictId);
    check(row && Array.isArray(expected) && expected.length <= 100000, 409, "conflict_review_changed", "Die erhaltenen lokalen Fassungen müssen erneut verglichen werden.");
    const conflict = JSON.parse(row.conflict_json), current = pending(id).filter((entry) => entry.kind === conflict.kind && entry.object_id === conflict.objectId);
    check(current.length === expected.length && current.every((entry, index) => {
      const shown = expected[index];
      return shown && Object.keys(shown).length === 3 && shown.changeId === entry.change_id && shown.state === entry.state
        && shown.sha256 === digest(objectJson(JSON.parse(entry.data_json)));
    }), 409, "conflict_review_changed", "Nach der Vorschau ist eine weitere lokale Fassung hinzugekommen oder geändert worden. Alle Eingaben bleiben erhalten.");
    return true;
  }
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
    media: createClientImageStore({ db, tx, binding, open }),
    speciesEnrichment: createClientEnrichmentStore({ db, tx,
      currentOwner() {
        open();
        return binding(db.prepare("SELECT value FROM state WHERE key='active'").get()?.value ?? "");
      },
      currentSource: (id, speciesId) => object(id, "species", speciesId, { serverOnly: true }),
      enqueue(owner, sealed, data) {
        const { change } = sealed, serialized = objectJson(data);
        db.prepare("INSERT INTO queue(binding_id,change_id,kind,object_id,base_revision,data_json,request_json,state) VALUES (?,?,?,?,?,?,?,'queued')")
          .run(owner.id, change.changeId, change.kind, change.id, change.baseRevision, serialized,
            canonicalJson(sealed, { maxBytes: 2 * 1024 * 1024, maxNodes: 300000 }));
        db.prepare("UPDATE cache SET local_json=? WHERE binding_id=? AND kind='species' AND id=?").run(serialized, owner.id, change.id);
        return { changeId: change.changeId, candidateId: sealed.candidateId, object: object(owner.id, change.kind, change.id),
          readerApproved: false, externalPublication: "not-performed" };
      },
      ensureSchema() {
        if (db.prepare("PRAGMA user_version").get().user_version === 5) return;
        cacheSchema(db, 4);
        db.exec(CLIENT_ENRICHMENT_SCHEMA);
        db.exec("PRAGMA user_version=5");
        cacheSchema(db, 5);
      },
    }),
    normalMedia:createClientNormalStore({db,tx,binding,open,assertSource(id,metadata,source){
      check(db.prepare("SELECT value FROM state WHERE key='active'").get()?.value===id,409,'normal_media_review_changed','Die aktive persönliche Cachebindung wurde geändert.');
      const value=object(id,'species',metadata.speciesId,{serverOnly:true}),owner=binding(id);
      const expected=normalMediaBinding(value.data,{projectId:owner.projectId,slot:metadata.slot});
      check(value.revision===source.sourceRevision&&digest(objectJson(value.data))===source.sourceDataHash&&!value.localPending&&!value.localConflict
        &&expected?.contentId===metadata.contentId&&(!['reader'].includes(owner.user.role)||value.approval==='approved'&&value.approvedRevision===value.revision),
        409,'normal_media_review_changed','Die bestätigte Art- oder Personenbindung wurde vor der Cacheaufnahme geändert.');
    }}),
    projectIds() { open(); return db.prepare("SELECT DISTINCT project_id FROM bindings ORDER BY project_id").all().map(row => row.project_id); },
    active() { open(); return binding(db.prepare("SELECT value FROM state WHERE key='active'").get()?.value ?? ""); },
    bind({ baseUrl, projectId, user }) {
      check(typeof projectId === "string" && projectId.length <= 100 && user && typeof user.id === "string", 502, "invalid_response", "Die Projektidentität fehlt.");
      const id = digest(`${baseUrl}\n${projectId}\n${user.id}`);
      return tx(() => {
        const safeUser = { id: user.id, username: user.username, displayName: user.displayName, role: user.role,
          ...(Number.isSafeInteger(user.version) && user.version > 0 ? { version: user.version } : {}) };
        db.prepare("INSERT INTO bindings VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_json=excluded.user_json")
          .run(id, baseUrl, projectId, user.id, canonicalJson(safeUser));
        db.prepare("INSERT OR REPLACE INTO state VALUES ('active',?)").run(id);
        return binding(id);
      });
    },
    updateUser(id, user) {
      return tx(() => {
        const safeUser = { id: user.id, username: user.username, displayName: user.displayName, role: user.role,
          ...(Number.isSafeInteger(user.version) && user.version > 0 ? { version: user.version } : {}) };
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
          canonicalJson(value, { maxBytes: value.data?.type === "fn-species-record" && value.data.schemaVersion === 2
            ? 4 * 1024 * 1024 + 16 * 1024 : 3 * 1024 * 1024, maxNodes: 300000 }));
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
    edit(id, kind, objectId, data, { baseRevision, expectedLocalReview } = {}) {
      return tx(() => {
        check(!db.prepare("SELECT 1 FROM state WHERE key LIKE 'editorial-cancel-%' AND value=?").get(`${id}/${kind}/${objectId}`),
          409, "change_blocked", "Ein alter Seitenübernahmeauftrag wird gerade eindeutig abgeschlossen. Bitte diesen Abschluss zuerst fortsetzen; deine Eingaben bleiben im Formular erhalten.");
        const cached = object(id, kind, objectId), serialized = objectJson(data);
        check(data && typeof data === "object" && !Array.isArray(data), 400, "invalid_data", "Ein Objektinhalt ist erforderlich.");
        check(expectedLocalReview === undefined || expectedLocalReview?.revision === cached.revision
          && expectedLocalReview.pending === cached.localPending && expectedLocalReview.conflict === cached.localConflict
          && expectedLocalReview.dataHash === digest(objectJson(cached.data)), 409, "local_object_changed",
        "Die Artfassung oder ihr Abgleichstatus hat sich seit der Vorschau geändert. Bitte neu vergleichen. Deine Eingaben bleiben im Formular.");
        const active = pending(id).filter((entry) => entry.kind === kind && entry.object_id === objectId), latest = active.at(-1);
        check(!active.some(entry => entry.request_json && Object.hasOwn(JSON.parse(entry.request_json), "candidateId")),
          409, "species_enrichment_pending", "Für diese Art wartet ein geprüfter Vorschlag auf den Abgleich. Bitte zuerst diesen Abgleich abschließen; deine Eingaben bleiben im Formular erhalten.");
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
    stageEditorialAdoption(id, { data, intent }) {
      return tx(() => {
        const owner = binding(id);
        check(owner && db.prepare("SELECT value FROM state WHERE key='active'").get()?.value === id,
          409, "editorial_adoption_changed", "Die aktive Projektverbindung hat sich geändert.");
        const changeId = randomUUID(), speciesId = data?.id, baseRevision = intent?.sourceBindings?.species?.objectRevision;
        const request = validateSealedEditorialRequest({ changeId, kind: "species", id: speciesId, baseRevision, data, intent },
        { changeId, kind: "species", id: speciesId, baseRevision, data, projectId: owner.projectId, userId: owner.userId, role: owner.user.role });
        const source = request.intent.sourceBindings;
        for (const [kind, objectId, revision, dataHash] of [
          ["page", source.page.objectId, source.page.objectRevision, source.page.dataHash],
          ["species", source.species.id, source.species.objectRevision, source.species.dataHash],
        ]) {
          const current = object(id, kind, objectId);
          check(!current.localPending && !current.localConflict && current.revision === revision
            && digest(objectJson(current.data)) === dataHash, 409, "editorial_adoption_changed",
          "Art oder Seite hat sich seit der Vorschau geändert. Die Übernahme muss erneut geprüft werden.");
        }
        const serialized = objectJson(request.data);
        db.prepare("INSERT INTO queue(binding_id,change_id,kind,object_id,base_revision,data_json,request_json,state) VALUES (?,?,?,?,?,?,?,'queued')")
          .run(id, request.changeId, "species", request.id, request.baseRevision, serialized, transportJson(request));
        db.prepare("UPDATE cache SET local_json=? WHERE binding_id=? AND kind='species' AND id=?").run(serialized, id, request.id);
        return { changeId: request.changeId, object: object(id, "species", request.id), readerApproved: false, externalPublication: "not-performed" };
      });
    },
    editorialChange(id, changeId) {
      return tx(() => {
        const request = editorialChange(id, changeId);
        // Every cache writer checks this durable guard in the same write
        // transaction as edit(). No network wait holds a SQLite transaction.
        db.prepare("INSERT OR REPLACE INTO state(key,value) VALUES (?,?)")
          .run(`editorial-cancel-${changeId}`, `${id}/species/${request.id}`);
        return request;
      });
    },
    editorialCancellationPending(id, changeId) {
      open(); const row = db.prepare("SELECT kind,object_id FROM queue WHERE binding_id=? AND change_id=?").get(id, changeId);
      return Boolean(row && db.prepare("SELECT 1 FROM state WHERE key=? AND value=?")
        .get(`editorial-cancel-${changeId}`, `${id}/${row.kind}/${row.object_id}`));
    },
    cancelEditorialChange(id, changeId) {
      return tx(() => {
        const request = editorialChange(id, changeId);
        db.prepare("UPDATE queue SET state='superseded' WHERE binding_id=? AND change_id=?").run(id, changeId);
        db.prepare("DELETE FROM state WHERE key=?").run(`editorial-cancel-${changeId}`);
        const cached = object(id, "species", request.id, { serverOnly: true });
        db.prepare("UPDATE cache SET local_json=? WHERE binding_id=? AND kind='species' AND id=?").run(objectJson(cached.data), id, request.id);
        return { cancelled: true, changeId, object: object(id, "species", request.id), readerApproved: false, externalPublication: "not-performed" };
      });
    },
    pending,
    pendingEnrichment(id, speciesId) {
      const row = pending(id).find(value => value.kind === "species" && value.object_id === speciesId
        && value.request_json && Object.hasOwn(JSON.parse(value.request_json), "candidateId"));
      if (!row) return null;
      const { candidateId } = readQueuedSpeciesEnrichment(db, binding(id), row);
      return { candidateId, changeId: row.change_id, acceptedRevision: row.result_revision, state: row.state };
    },
    prepare(changeId) {
      return tx(() => {
        const row = db.prepare("SELECT * FROM queue WHERE change_id=?").get(changeId);
        check(row && ["queued", "uncertain"].includes(row.state), 409, "change_blocked", "Die Änderung wartet auf eine Entscheidung.");
        if (row.request_json) {
          const prepared = JSON.parse(row.request_json);
          if (Object.hasOwn(prepared, "candidateId")) {
            const queued = readQueuedSpeciesEnrichment(db, binding(row.binding_id), row, { readBytes: true });
            db.prepare("UPDATE queue SET state='uncertain' WHERE change_id=?").run(changeId);
            return { ...queued, resultRevision: row.result_revision };
          }
          if (Object.hasOwn(prepared, "intent")) {
            const owner = binding(row.binding_id);
            validateSealedEditorialRequest(prepared, { changeId, kind: row.kind, id: row.object_id,
              baseRevision: row.base_revision, data: JSON.parse(row.data_json), projectId: owner.projectId, userId: owner.userId });
          }
          db.prepare("UPDATE queue SET state='uncertain' WHERE change_id=?").run(changeId);
          return prepared;
        }
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
    updateEnrichment(id, changeId, value, phase) {
      return tx(() => {
        const row = db.prepare("SELECT * FROM queue WHERE binding_id=? AND change_id=?").get(id, changeId), owner = binding(id);
        check(owner && row?.state === "uncertain" && db.prepare("SELECT value FROM state WHERE key='active'").get()?.value === id,
          409, "species_enrichment_changed", "Der persönliche Übernahmeauftrag wurde zwischenzeitlich geändert. Bitte erneut abgleichen.");
        const { change } = readQueuedSpeciesEnrichment(db, owner, row);
        check(value.kind === change.kind && value.id === change.id, 502, "invalid_response", "Die bestätigte Art gehört nicht zum geprüften Vorschlag.");
        if (phase === "accepted") {
          check(value.parentRevision === change.baseRevision && value.revision !== change.baseRevision
            && digest(objectJson(value.data)) === change.enrichment.targetDataHash && (!row.result_revision || value.revision === row.result_revision),
          502, "invalid_response", "Die bestätigte Entwurfsfassung entspricht nicht dem geprüften Vorschlag.");
          db.prepare("UPDATE queue SET result_revision=? WHERE change_id=?").run(value.revision, changeId);
        } else if (phase !== "observed") {
          check(phase === "complete" && row.result_revision || phase === "stale" && row.result_revision === null,
            409, "species_enrichment_changed", "Der bestätigte Übernahmestand wurde zwischenzeitlich geändert.");
          db.prepare("UPDATE queue SET state=? WHERE change_id=?").run(phase === "complete" ? "applied" : "superseded", changeId);
        } else check(row.result_revision, 409, "species_enrichment_changed", "Der Entwurf wurde noch nicht eindeutig bestätigt.");
        saveRemote(id, value);
      });
    },
    acknowledge(id, changeId, value) {
      return tx(() => {
        db.prepare("UPDATE queue SET state='applied',result_revision=? WHERE binding_id=? AND change_id=?").run(value.revision, id, changeId);
        db.prepare("DELETE FROM state WHERE key=?").run(`editorial-cancel-${changeId}`);
        saveRemote(id, value);
      });
    },
    saveConflict(id, changeId, value) {
      return tx(() => {
        db.prepare("UPDATE queue SET state='conflict',conflict_id=? WHERE binding_id=? AND change_id=?").run(value.id, id, changeId);
        db.prepare("DELETE FROM state WHERE key=?").run(`editorial-cancel-${changeId}`);
        db.prepare("INSERT OR REPLACE INTO conflicts VALUES (?,?,?,0)").run(id, value.id, JSON.stringify(value));
      });
    },
    conflictStamp,
    refreshConflict(id, changeId, value, expectedStamp) {
      return tx(() => {
        const row = db.prepare("SELECT * FROM queue WHERE binding_id=? AND change_id=? AND state='conflict'").get(id, changeId);
        if (!row || row.conflict_id !== value.id || expectedStamp === null || conflictStamp(id, value.id) !== expectedStamp) return false;
        check(value.kind === row.kind && value.objectId === row.object_id, 502, "invalid_response", "Der Konflikt gehört nicht zum erhaltenen lokalen Entwurf.");
        db.prepare("UPDATE conflicts SET conflict_json=? WHERE binding_id=? AND id=? AND resolved=0").run(JSON.stringify(value), id, value.id);
        return true;
      });
    },
    conflicts(id) {
      open(); return db.prepare("SELECT * FROM conflicts WHERE binding_id=? AND resolved=0 ORDER BY id").all(id).map((row) => {
        const conflict = JSON.parse(row.conflict_json), entries = pending(id).filter((entry) => entry.kind === conflict.kind && entry.object_id === conflict.objectId);
        return { ...conflict, localVersions: entries.map((entry) => ({ changeId: entry.change_id, data: JSON.parse(entry.data_json), state: entry.state })) };
      });
    },
    assertConflictVersions,
    resolve(id, conflictId, value, { expectedLocalVersions } = {}) {
      return tx(() => {
        assertConflictVersions(id, conflictId, expectedLocalVersions);
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
    rebaseResolvedConflict(id, conflictId, currentObject, data, { expectedLocalVersions } = {}) {
      return tx(() => {
        assertConflictVersions(id, conflictId, expectedLocalVersions);
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
