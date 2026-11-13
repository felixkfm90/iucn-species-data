import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { check, canonical, fingerprint, fields, identifier, digest, clone, PageAuthoringError } from "./contract.mjs";
import { assertCmsSaveReadback, validateCmsSaveBinding } from "./cms-save-binding.mjs";

const APPLICATION_ID = 0x464e5041;
export const PAGE_AUTHORING_REPOSITORY_VERSION = 1;
export const PAGE_AUTHORING_CORE_COLUMNS = Object.freeze({
  drafts: 'project_id,id,path,head,sequence', versions: 'project_id,draft_id,revision,sequence,parent_revision,body_hash,body_json,actor_id,created_at',
  mutations: 'project_id,actor_id,mutation_id,intent_hash,result_json', artifacts: 'project_id,draft_id,id,kind,revision,payload_json,actor_id,created_at',
  cms_attempts: 'project_id,draft_id,id,revision,plan_id,actor_id,status,state_revision,state_json',
  cms_receipts: 'project_id,attempt_id,receipt_id,payload_hash,payload_json',
});
export const PAGE_WORKSPACE_COLUMNS = 'project_id,draft_id,state_revision,state_json';
export const PAGE_SCOPE_COLUMNS = 'scope_id,origin,actor_id';
export const pageWorkspaceScope = (origin, actorId) => fingerprint({ origin, actorId });
export function canRecoverCmsSave(attempt) {
  if (!attempt?.saveBinding || !attempt.dispatchId || !attempt.dispatchedAt || attempt.repeatAllowed !== false
      || attempt.uncertainty !== undefined) return false;
  const { receipt, receiptHash } = attempt;
  if (attempt.status === "dispatched") return receipt === null && receiptHash === undefined;
  return attempt.status === "uncertain" && receipt?.schemaVersion === 2 && receipt.status === "uncertain"
    && receipt.recovery === undefined && receipt.pageId === null && receipt.unpublished === null && receipt.readback === null
    && Array.isArray(receipt.mediaBindings) && receipt.mediaBindings.length === 0 && receipt.readbackStructureHash === null
    && receipt.mediaBindingsHash === null && receiptHash === fingerprint(receipt);
}
export function validatePageWorkspaceBinding(value) {
  fields(value, ['origin','actorId','projectId','draftId','baseLocalRevision','remoteRevision','remoteDataHash','remoteObject','confirmedObject',
    'frameLocalRevision','frameHash','approvalId','state','errorCode']);
  identifier(value.actorId); identifier(value.projectId); identifier(value.draftId);
  let url; try { url = new URL(value.origin); } catch { /* checked below */ }
  check(url && (url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))
    && !url.username && !url.password && !url.search && !url.hash, 'invalid_workspace_scope', 'Die persönliche Projektadresse ist nicht eindeutig gebunden.');
  for (const field of ['baseLocalRevision','remoteDataHash','frameLocalRevision','frameHash']) if (value[field] !== null) digest(value[field]);
  if (value.approvalId !== null) identifier(value.approvalId);
  check(['unlinked','creating','uncertain','local-only','queueing','queued','synced','conflict'].includes(value.state)
    && (value.errorCode === null || /^[a-zA-Z0-9_-]{1,100}$/.test(value.errorCode)), 'invalid_workspace_state', 'Der persönliche Artseitenabgleich ist ungültig.');
  check(value.remoteObject === null ? value.remoteRevision === null && value.remoteDataHash === null
    : value.remoteObject?.kind === 'page' && value.remoteObject.revision === value.remoteRevision
      && typeof value.remoteRevision === 'string' && value.remoteRevision.length <= 80 && fingerprint(value.remoteObject.data) === value.remoteDataHash,
  'invalid_workspace_binding', 'Die gemeinsame Seitenbasis ist widersprüchlich.');
  check((value.frameLocalRevision === null) === (value.frameHash === null), 'invalid_workspace_binding', 'Der vorbereitete Transport ist nicht eindeutig gebunden.');
  return value;
}
function safePath(filename) {
  check(typeof filename === "string" && path.isAbsolute(filename) && !/^(?:[\\/]{2}|file:)/i.test(filename)
    && !/[\u0000-\u001f]/.test(filename), "unsafe_repository", "Ein persönlicher lokaler Entwurfsspeicher ist erforderlich.");
  let current = path.parse(filename).root;
  for (const part of path.relative(current, filename).split(path.sep)) {
    current = path.join(current, part);
    let stat; try { stat = fs.lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat) check(!stat.isSymbolicLink(), "unsafe_repository", "Verknüpfte Entwurfspfade sind nicht zulässig.");
  }
  for (const file of [filename, `${filename}-wal`, `${filename}-shm`, `${filename}-journal`]) {
    if (fs.existsSync(file)) { const stat = fs.lstatSync(file); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "unsafe_repository", "Der Entwurfsspeicher ist keine eigene reguläre Datei."); }
  }
  if (fs.existsSync(filename)) {
    const handle = fs.openSync(filename, "r");
    try {
      const header = Buffer.alloc(100), bytes = fs.readSync(handle, header, 0, 100, 0);
      check(bytes === 100 && header.subarray(0, 16).equals(Buffer.from("SQLite format 3\0")) && header.readUInt32BE(68) === APPLICATION_ID,
        "foreign_repository", "Eine fremde Datei wird nicht als Artseiten-Entwurfsspeicher geöffnet.");
    } finally { fs.closeSync(handle); }
  }
}

/** Dedicated local adapter. Shared-service implementations use the same semantic CAS contract. */
export function createSqlitePageAuthoringRepository({ filename, localStorageConfirmed = false, now = () => new Date().toISOString() } = {}) {
  check(localStorageConfirmed === true, "storage_confirmation_required", "Die lokale Entwurfsablage muss ausdrücklich eingerichtet sein.");
  const existing = fs.existsSync(filename);
  safePath(filename); fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  try {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  check([0,1].includes(version), 'repository_version', 'Diese neuere Entwurfsspeicherversion wird nicht verändert.');
  function exactSchema(columns) {
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
    check(canonical(tables) === canonical(Object.keys(columns).sort()), 'repository_schema', 'Der Entwurfsspeicher enthält unbekannte Tabellen.');
    check(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('view','trigger') OR type='index' AND sql IS NOT NULL LIMIT 1").get(),
      'repository_schema','Der Entwurfsspeicher enthält unbekannte zusätzliche SQL-Objekte.');
    for (const [name,names] of Object.entries(columns)) check(db.prepare(`PRAGMA table_info("${name}")`).all().map(column=>column.name).join(',') === names,
      'repository_schema', 'Die Entwurfsspalten stimmen nicht mit der eingerichteten Version überein.');
  }
  if (existing && version === 0) exactSchema(PAGE_AUTHORING_CORE_COLUMNS);
  if (existing && version === 1) {
    const columns = {...PAGE_AUTHORING_CORE_COLUMNS,workspace_links:PAGE_WORKSPACE_COLUMNS,workspace_scopes:PAGE_SCOPE_COLUMNS};
    for (const row of db.prepare('SELECT * FROM workspace_scopes').all()) {
      check(row.scope_id === pageWorkspaceScope(row.origin,row.actor_id), 'invalid_workspace_scope', 'Die persönliche Entwurfsablage ist verändert.');
      for (const [table,names] of Object.entries({...PAGE_AUTHORING_CORE_COLUMNS,workspace_links:PAGE_WORKSPACE_COLUMNS})) columns[`${table}_${row.scope_id}`]=names;
    }
    exactSchema(columns);
  }
  db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS drafts(project_id TEXT NOT NULL,id TEXT NOT NULL,path TEXT NOT NULL,head TEXT NOT NULL,sequence INTEGER NOT NULL,
      PRIMARY KEY(project_id,id),UNIQUE(project_id,path));
    CREATE TABLE IF NOT EXISTS versions(project_id TEXT NOT NULL,draft_id TEXT NOT NULL,revision TEXT NOT NULL,sequence INTEGER NOT NULL,
      parent_revision TEXT,body_hash TEXT NOT NULL,body_json TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,
      PRIMARY KEY(project_id,draft_id,revision));
    CREATE TABLE IF NOT EXISTS mutations(project_id TEXT NOT NULL,actor_id TEXT NOT NULL,mutation_id TEXT NOT NULL,intent_hash TEXT NOT NULL,result_json TEXT NOT NULL,
      PRIMARY KEY(project_id,actor_id,mutation_id));
    CREATE TABLE IF NOT EXISTS artifacts(project_id TEXT NOT NULL,draft_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,
      revision TEXT NOT NULL,payload_json TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(project_id,id));
    CREATE TABLE IF NOT EXISTS cms_attempts(project_id TEXT NOT NULL,draft_id TEXT NOT NULL,id TEXT NOT NULL,revision TEXT NOT NULL,plan_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,status TEXT NOT NULL,state_revision TEXT NOT NULL,state_json TEXT NOT NULL,PRIMARY KEY(project_id,id),UNIQUE(project_id,draft_id));
    CREATE TABLE IF NOT EXISTS cms_receipts(project_id TEXT NOT NULL,attempt_id TEXT NOT NULL,receipt_id TEXT NOT NULL,payload_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,PRIMARY KEY(project_id,attempt_id,receipt_id,payload_hash));
    CREATE TABLE IF NOT EXISTS workspace_links(project_id TEXT NOT NULL,draft_id TEXT NOT NULL,state_revision TEXT NOT NULL,state_json TEXT NOT NULL,
      PRIMARY KEY(project_id,draft_id));
    CREATE TABLE IF NOT EXISTS workspace_scopes(scope_id TEXT PRIMARY KEY,origin TEXT NOT NULL,actor_id TEXT NOT NULL,UNIQUE(origin,actor_id));
    PRAGMA user_version=1; COMMIT;
  `);
  } catch(error) {try{db.exec('ROLLBACK');}catch{/* no active transaction */}db.close();throw error;}
  fs.chmodSync(filename, 0o600);
  const database = db, scoped = new Map(); let databaseClosed = false;
  function scopedRepository(scopeId = null) {
  const db = scopeId ? { prepare: sql => database.prepare(sql.replace(/\b(drafts|versions|mutations|artifacts|cms_attempts|cms_receipts|workspace_links)\b/g, table=>`${table}_${scopeId}`)),
    exec: sql => database.exec(sql) } : database;
  let closed = false;
  function open() { check(!closed && !databaseClosed, "repository_closed", "Der Entwurfsspeicher ist geschlossen.", 409); }
  function transaction(fn) {
    open();
    try {
      db.exec("BEGIN IMMEDIATE");
      try { const value = fn(); db.exec("COMMIT"); return value; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    } catch (error) {
      if (error instanceof PageAuthoringError) throw error;
      if (/locked|busy/i.test(error.message)) throw new PageAuthoringError(409, "repository_busy", "Ein anderer Seitenauftrag schreibt gerade. Die eigene Fassung bleibt erhalten.");
      throw error;
    }
  }
  function mutation(input, fn) {
    return transaction(() => {
      if(scopeId)check(database.prepare('SELECT actor_id FROM workspace_scopes WHERE scope_id=?').get(scopeId)?.actor_id===input.actorId,
        'invalid_workspace_scope','Die Änderung gehört nicht zur Person dieser lokalen Arbeitsablage.',403);
      const prior = db.prepare("SELECT * FROM mutations WHERE project_id=? AND actor_id=? AND mutation_id=?")
        .get(input.projectId, input.actorId, input.mutationId);
      if (prior) {
        check(prior.intent_hash === input.intentHash, "mutation_reused", "Diese Auftragskennung gehört zu einem anderen unveränderten Auftrag.", 409);
        return { ...JSON.parse(prior.result_json), idempotentReplay: true };
      }
      const result = { ...fn(), idempotentReplay: false };
      db.prepare("INSERT INTO mutations VALUES (?,?,?,?,?)").run(input.projectId, input.actorId, input.mutationId, input.intentHash, canonical(result));
      return result;
    });
  }
  function read(projectId, id, revision = undefined) {
    open();
    const head = db.prepare("SELECT * FROM drafts WHERE project_id=? AND id=?").get(projectId, id);
    if (!head) return null;
    const row = db.prepare("SELECT * FROM versions WHERE project_id=? AND draft_id=? AND revision=?").get(projectId, id, revision ?? head.head);
    if (!row) return null;
    return { id, projectId, revision: row.revision, sequence: row.sequence, parentRevision: row.parent_revision,
      contentHash: row.body_hash, document: JSON.parse(row.body_json), actorId: row.actor_id, createdAt: row.created_at, current: head.head === row.revision };
  }
  function current(projectId, id, expected) {
    const value = read(projectId, id);
    check(value, "draft_not_found", "Dieser Artseitenentwurf ist nicht vorhanden.", 404);
    check(value.revision === expected, "draft_conflict", "Der Seitenentwurf wurde zwischenzeitlich geändert. Die eigene Fassung wird nicht überschrieben.", 409,
      { currentRevision: value.revision }); return value;
  }
  function artifact(projectId, id) {
    open(); const row = db.prepare("SELECT * FROM artifacts WHERE project_id=? AND id=?").get(projectId, id);
    return row ? { id: row.id, kind: row.kind, draftId: row.draft_id, revision: row.revision, payload: JSON.parse(row.payload_json), actorId: row.actor_id, createdAt: row.created_at } : null;
  }
  function workspaceLink(projectId,id) {
    open();const row=db.prepare('SELECT * FROM workspace_links WHERE project_id=? AND draft_id=?').get(projectId,id);
    if(!row)return null;const binding=validatePageWorkspaceBinding(JSON.parse(row.state_json));
    check(row.state_revision===fingerprint(binding) && binding.projectId===projectId && binding.draftId===id,'invalid_workspace_binding','Die persönliche Seitenbasis wurde verändert.');
    if(scopeId)check(pageWorkspaceScope(binding.origin,binding.actorId)===scopeId,'invalid_workspace_scope','Die Seitenbasis gehört zu einer anderen Person oder Adresse.');
    return {binding, bindingRevision:row.state_revision};
  }
  function putWorkspaceLink(input) {
    const {projectId,draftId,expectedBindingRevision}=input,previous=workspaceLink(projectId,draftId),binding=validatePageWorkspaceBinding(clone(input.binding));
    check(expectedBindingRevision===(previous?.bindingRevision??null),'workspace_conflict','Der persönliche Seitenabgleich wurde inzwischen geändert.',409);
    check(binding.projectId===projectId && binding.draftId===draftId && (!scopeId || pageWorkspaceScope(binding.origin,binding.actorId)===scopeId),
      'invalid_workspace_scope','Diese Seitenbasis gehört nicht zur persönlichen Ablage.');
    for(const revision of [binding.baseLocalRevision,binding.frameLocalRevision].filter(Boolean))check(read(projectId,draftId,revision),'invalid_workspace_binding','Die gebundene lokale Seitenfassung fehlt.');
    const bindingRevision=fingerprint(binding);
    db.prepare('INSERT INTO workspace_links VALUES (?,?,?,?) ON CONFLICT(project_id,draft_id) DO UPDATE SET state_revision=excluded.state_revision,state_json=excluded.state_json')
      .run(projectId,draftId,bindingRevision,canonical(binding));
    return {binding,bindingRevision};
  }
  function attempt(projectId, id) {
    open(); const row = db.prepare("SELECT * FROM cms_attempts WHERE project_id=? AND id=?").get(projectId, id);
    return row ? { ...JSON.parse(row.state_json), stateRevision: row.state_revision } : null;
  }
  function attemptForDraft(projectId, draftId) {
    open(); const row = db.prepare("SELECT id FROM cms_attempts WHERE project_id=? AND draft_id=?").get(projectId, draftId);
    return row ? attempt(projectId, row.id) : null;
  }
  function canReplacePrepared(projectId, value, revision, actorId) {
    return Boolean(value?.status === "prepared" && value.repeatAllowed === false && value.actorId === actorId && value.revision !== revision
      && value.receipt === null && value.dispatchId === undefined && value.dispatchedAt === undefined
      && value.receiptHash === undefined && value.updatedAt === undefined && value.uncertainty === undefined && value.saveBinding === undefined
      && !db.prepare("SELECT 1 FROM cms_receipts WHERE project_id=? AND attempt_id=? LIMIT 1").get(projectId, value.id));
  }
  function saveAttempt(projectId, state, expectedStateRevision) {
    const stateRevision = fingerprint(state);
    const result = db.prepare("UPDATE cms_attempts SET status=?,state_revision=?,state_json=? WHERE project_id=? AND id=? AND state_revision=?")
      .run(state.status, stateRevision, canonical(state), projectId, state.id, expectedStateRevision);
    check(result.changes === 1, "cms_repeat_blocked", "Der gestartete CMS-Auftrag wurde inzwischen geändert.", 409);
    return { ...state, stateRevision };
  }
  return {
    schemaVersion:PAGE_AUTHORING_REPOSITORY_VERSION,
    scopeId,
    backupProjectIds() {
      open();const projects=new Set(database.prepare('SELECT DISTINCT project_id FROM versions').all().map(row=>identifier(row.project_id)));
      for(const row of database.prepare('SELECT * FROM workspace_scopes').all()) {
        check(row.scope_id===pageWorkspaceScope(row.origin,row.actor_id),'invalid_workspace_scope','Die persönliche Entwurfsregistrierung ist verändert.');
        for(const value of database.prepare(`SELECT DISTINCT project_id FROM versions_${row.scope_id}`).all())projects.add(identifier(value.project_id));
      }
      return [...projects].sort();
    },
    workspacePendingState() {
      open();let pending=0,conflicts=0,localOnly=0;
      const rows=database.prepare('SELECT * FROM workspace_scopes').all();
      for(const row of rows) {
        check(row.scope_id===pageWorkspaceScope(row.origin,row.actor_id),'invalid_workspace_scope','Die persönliche Entwurfsregistrierung ist verändert.');
        const scope=scopedRepository(row.scope_id);
        for(const head of database.prepare(`SELECT project_id,id,head FROM drafts_${row.scope_id}`).iterate()) {
          identifier(head.project_id);identifier(head.id);digest(head.head);const link=scope.workspaceLink(head.project_id,head.id);
          if(!link || link.binding.state!=='synced' || link.binding.baseLocalRevision!==head.head) {
            pending++;if(link?.binding.state==='conflict')conflicts++;
            if(!link || link.binding.state!=='queued' || link.binding.baseLocalRevision!==head.head)localOnly++;
          }
        }
      }
      return {known:true,pending,localOnly,conflicts,registeredScopes:rows.length,legacyUnassignedDrafts:database.prepare('SELECT count(*) AS n FROM drafts').get().n};
    },
    scoped({origin,actorId},{existingOnly=false}={}) {
      open();identifier(actorId);let address;try{address=new URL(origin);}catch{/* checked below */}
      check(typeof existingOnly==='boolean','invalid_workspace_scope','Die Lesegrenze der persönlichen Ablage ist ungültig.');
      check(address && !address.username && !address.password && !address.search && !address.hash
        && (address.protocol==='https:' || address.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(address.hostname)),
      'invalid_workspace_scope','Eine gültige persönliche Projektadresse ist erforderlich.');
      const id=pageWorkspaceScope(origin,actorId);
      if(existingOnly && !database.prepare('SELECT scope_id FROM workspace_scopes WHERE scope_id=?').get(id))return null;
      if(scoped.has(id))return scoped.get(id);
      if(!existingOnly)transaction(()=>{
        if(database.prepare('SELECT scope_id FROM workspace_scopes WHERE scope_id=?').get(id))return;
        check(database.prepare('SELECT count(*) AS n FROM workspace_scopes').get().n<1000,'workspace_scope_limit','Zu viele persönliche Entwurfsablagen.');
        for(const table of [...Object.keys(PAGE_AUTHORING_CORE_COLUMNS),'workspace_links']) {
          const definition=database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table).sql;
          database.exec(definition.replace(new RegExp(`\\b${table}\\b`,'g'),`${table}_${id}`));
        }
        database.prepare('INSERT INTO workspace_scopes VALUES (?,?,?)').run(id,origin,actorId);
      });
      const result=scopedRepository(id);scoped.set(id,result);return result;
    },
    list(projectId) {open();return db.prepare('SELECT id FROM drafts WHERE project_id=? ORDER BY id').all(projectId).map(row=>read(projectId,row.id));},
    workspaceLinkIds(projectId) {open();return db.prepare('SELECT draft_id FROM workspace_links WHERE project_id=? ORDER BY draft_id').all(projectId).map(row=>row.draft_id);},
    workspaceLink,
    putWorkspaceLink(input) {return transaction(()=>putWorkspaceLink(input));},
    replay(input) {
      open(); const prior = db.prepare('SELECT * FROM mutations WHERE project_id=? AND actor_id=? AND mutation_id=?').get(input.projectId,input.actorId,input.mutationId);
      if (!prior) return null;
      check(prior.intent_hash === input.intentHash, 'mutation_reused', 'Diese Auftragskennung gehört zu einer anderen Eingabe.', 409);
      return { ...JSON.parse(prior.result_json), idempotentReplay: true };
    },
    read,
    assertCurrent: current,
    artifact,
    latestArtifact(projectId, draftId, kind, revision) {
      open(); const row = db.prepare("SELECT id FROM artifacts WHERE project_id=? AND draft_id=? AND kind=? AND revision=? ORDER BY rowid DESC LIMIT 1")
        .get(projectId, draftId, kind, revision); return row ? artifact(projectId, row.id) : null;
    },
    commit(input) {
      return mutation(input, () => {
        const bind=result=>{if(input.workspace)putWorkspaceLink({projectId:input.projectId,draftId:input.id,
          expectedBindingRevision:input.workspace.expectedBindingRevision,binding:{...input.workspace.binding,baseLocalRevision:result.draft.revision}});return result;};
        const prior = read(input.projectId, input.id);
        if (input.create) check(!prior, "draft_exists", "Für diese Kennung gibt es bereits einen Entwurf.", 409);
        else current(input.projectId, input.id, input.expectedRevision);
        const bodyHash = fingerprint(input.document);
        if (prior?.contentHash === bodyHash && input.forceRevision !== true) return bind({ draft: prior, unchanged: true });
        const sequence = (prior?.sequence ?? 0) + 1, createdAt = now();
        const revision = fingerprint({ projectId: input.projectId, id: input.id, sequence, parent: prior?.revision ?? null, bodyHash, actorId: input.actorId });
        const targetPath = `${input.document.parentPath}/${input.document.slug}`;
        const duplicate = db.prepare("SELECT id FROM drafts WHERE project_id=? AND path=?").get(input.projectId, targetPath);
        check(!duplicate || duplicate.id === input.id, "page_path_reserved", "Für diesen Zielpfad ist bereits ein Entwurf vorhanden.", 409);
        db.prepare("INSERT INTO versions VALUES (?,?,?,?,?,?,?,?,?)").run(input.projectId, input.id, revision, sequence, prior?.revision ?? null,
          bodyHash, canonical(input.document), input.actorId, createdAt);
        db.prepare("INSERT INTO drafts VALUES (?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET path=excluded.path,head=excluded.head,sequence=excluded.sequence")
          .run(input.projectId, input.id, targetPath, revision, sequence);
        return bind({ draft: read(input.projectId, input.id), unchanged: false });
      });
    },
    recordArtifact(input) {
      return mutation(input, () => {
        current(input.projectId, input.draftId, input.expectedRevision);
        const id = randomUUID();
        db.prepare("INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)").run(input.projectId, input.draftId, id, input.kind, input.expectedRevision,
          canonical(input.payload), input.actorId, now());
        return { artifact: artifact(input.projectId, id) };
      });
    },
    createAttempt(input) {
      return mutation(input, () => {
        current(input.projectId, input.draftId, input.expectedRevision);
        const previous = attemptForDraft(input.projectId, input.draftId);
        check(!previous || canReplacePrepared(input.projectId, previous, input.expectedRevision, input.actorId),
          "cms_repeat_blocked", "Für diesen Entwurf besteht bereits ein CMS-Versuch. Vor einem weiteren Schreiben ist dessen Vollzug gezielt zu klären.", 409);
        const state = { id: previous?.id ?? randomUUID(), draftId: input.draftId, revision: input.expectedRevision, planId: input.planId,
          actorId: input.actorId, status: "prepared", createdAt: now(), receipt: null, repeatAllowed: false,
          ...(previous && { supersedesStateRevision: previous.stateRevision }) };
        const stateRevision = fingerprint(state), data = canonical(state);
        if (previous) {
          // The earlier preparation remains in its original mutation receipt and plan artifact.
          const update = db.prepare("UPDATE cms_attempts SET revision=?,plan_id=?,state_revision=?,state_json=? WHERE project_id=? AND id=? AND status='prepared' AND state_revision=?")
            .run(state.revision, state.planId, stateRevision, data, input.projectId, state.id, previous.stateRevision);
          check(update.changes === 1, "cms_repeat_blocked", "Der vorbereitete CMS-Auftrag wurde inzwischen geändert.", 409);
        } else db.prepare("INSERT INTO cms_attempts VALUES (?,?,?,?,?,?,?,?,?)").run(input.projectId, input.draftId, state.id,
          state.revision, state.planId, input.actorId, state.status, stateRevision, data);
        return { attempt: attempt(input.projectId, state.id) };
      });
    },
    attempt,
    attemptForDraft,
    canReplacePrepared,
    hasCmsReceipt(projectId, attemptId, receiptId, payloadHash) {
      open();return Boolean(db.prepare('SELECT 1 FROM cms_receipts WHERE project_id=? AND attempt_id=? AND receipt_id=? AND payload_hash=?')
        .get(projectId,attemptId,receiptId,payloadHash));
    },
    dispatch(input) {
      return mutation(input, () => {
        const value = attempt(input.projectId, input.attemptId);
        check(value && value.actorId === input.actorId, "cms_attempt_not_found", "Dieser CMS-Auftrag gehört nicht zu diesem Ausführungskontext.", 404);
        current(input.projectId, value.draftId, value.revision);
        check(value.stateRevision === input.expectedStateRevision && value.status === "prepared" && value.saveBinding === undefined,
          "cms_repeat_blocked", "Ein bereits begonnener CMS-Auftrag wird nicht erneut gestartet.", 409);
        const { stateRevision, ...state } = value;
        return { attempt: saveAttempt(input.projectId, { ...state, status: "dispatched", dispatchedAt: now(), dispatchId: input.dispatchId }, stateRevision) };
      });
    },
    recordCmsSaveBinding({ projectId, actorId, attemptId, expectedStateRevision, binding }) {
      return transaction(() => {
        const value = attempt(projectId, attemptId);
        check(value && value.actorId === actorId, "cms_attempt_not_found", "Dieser CMS-Auftrag gehört nicht zu diesem Ausführungskontext.", 404);
        if (scopeId) check(database.prepare('SELECT actor_id FROM workspace_scopes WHERE scope_id=?').get(scopeId)?.actor_id === actorId,
          'invalid_workspace_scope', 'Die Änderung gehört nicht zur Person dieser lokalen Arbeitsablage.', 403);
        current(projectId, value.draftId, value.revision);
        check(value.status === "dispatched" && value.dispatchId && value.receipt === null, "cms_repeat_blocked",
          "Nur ein gestarteter CMS-Auftrag ohne Quittung kann die Speicherbindung aufnehmen.", 409);
        const plan = artifact(projectId, value.planId);
        check(plan?.kind === "cms-plan" && plan.draftId === value.draftId && plan.revision === value.revision && plan.payload.schemaVersion === 2,
          "stale_cms_plan", "Die Speicherbindung gehört zu keinem passenden aktuellen CMS-Plan.", 409);
        const normalized = validateCmsSaveBinding(binding, { attempt: value, plan: plan.payload });
        const { stateRevision, saveBinding, ...state } = value;
        if (saveBinding !== undefined) {
          check(canonical(saveBinding) === canonical(normalized), "cms_save_binding_conflict",
            "Der CMS-Auftrag besitzt bereits eine andere Speicherbindung.", 409);
          check(expectedStateRevision === stateRevision || expectedStateRevision === fingerprint(state), "cms_repeat_blocked",
            "Der gestartete CMS-Auftrag wurde inzwischen geändert.", 409);
          return value;
        }
        check(expectedStateRevision === stateRevision, "cms_repeat_blocked", "Der gestartete CMS-Auftrag wurde inzwischen geändert.", 409);
        return saveAttempt(projectId, { ...state, saveBinding: normalized }, stateRevision);
      });
    },
    recordRecoveredCmsOutcome({ projectId, actorId, attemptId, expectedStateRevision, receipt }) {
      return transaction(() => {
        const value = attempt(projectId, attemptId);
        check(value && value.actorId === actorId, "cms_attempt_not_found", "Dieser CMS-Auftrag gehört nicht zu diesem Ausführungskontext.", 404);
        if (scopeId) check(database.prepare('SELECT actor_id FROM workspace_scopes WHERE scope_id=?').get(scopeId)?.actor_id === actorId,
          'invalid_workspace_scope', 'Die Änderung gehört nicht zur Person dieser lokalen Arbeitsablage.', 403);
        current(projectId, value.draftId, value.revision);
        const { stateRevision, ...state } = value;
        check(stateRevision === expectedStateRevision && stateRevision === fingerprint(state) && canRecoverCmsSave(value), "cms_recovery_unavailable",
          "Dieser CMS-Auftrag kann nicht mehr durch eine lesende Nachprüfung abgeschlossen werden.", 409);
        const plan = artifact(projectId, value.planId);
        check(plan?.kind === "cms-plan" && plan.draftId === value.draftId && plan.revision === value.revision && plan.payload.schemaVersion === 2,
          "stale_cms_plan", "Die Speicherbindung gehört zu keinem passenden aktuellen CMS-Plan.", 409);
        const binding = validateCmsSaveBinding(value.saveBinding, { attempt: value, plan: plan.payload });
        check(receipt?.schemaVersion === 2 && receipt.status === "saved-unpublished" && !Object.hasOwn(receipt, "recovery")
          && receipt.attemptId === attemptId && receipt.planHash === plan.payload.planHash && receipt.unpublished === true
          && receipt.contentHash === plan.payload.contentHash && receipt.imagesHash === plan.payload.imagesHash
          && receipt.pageId === binding.pageId && receipt.path === binding.path && receipt.readback,
        "invalid_receipt", "Die lesende CMS-Nachprüfung benötigt eine vollständige passende Erfolgsquittung.", 409);
        digest(receipt.readbackStructureHash); digest(receipt.mediaBindingsHash);
        assertCmsSaveReadback(binding, receipt.readback, receipt.mediaBindings);
        const prior = db.prepare("SELECT receipt_id,payload_hash,payload_json FROM cms_receipts WHERE project_id=? AND attempt_id=? ORDER BY rowid DESC LIMIT 1")
          .get(projectId, attemptId);
        check(value.receipt === null ? prior === undefined : prior?.receipt_id === value.receipt.id
          && prior.payload_hash === value.receiptHash && prior.payload_json === canonical(value.receipt),
        "cms_recovery_unavailable", "Der bisherige Quittungsverlauf stimmt nicht mit dem CMS-Auftrag überein.", 409);
        check(!db.prepare("SELECT 1 FROM cms_receipts WHERE project_id=? AND attempt_id=? AND receipt_id=? LIMIT 1")
          .get(projectId, attemptId, receipt.id), "cms_recovery_unavailable", "Die Quittungskennung der CMS-Nachprüfung wurde bereits verwendet.", 409);
        const payload = { ...clone(receipt), recovery: { previousReceiptHash: value.receiptHash ?? null, saveBindingHash: fingerprint(binding) } };
        const receiptHash = fingerprint(payload);
        db.prepare("INSERT INTO cms_receipts VALUES (?,?,?,?,?)").run(projectId, attemptId, payload.id, receiptHash, canonical(payload));
        return { attempt: saveAttempt(projectId, { ...state, status: "saved-unpublished", receipt: payload, receiptHash, updatedAt: now() }, stateRevision),
          idempotentReplay: false };
      });
    },
    recordOutcome(input) {
      return transaction(() => {
        const value = attempt(input.projectId, input.attemptId);
        check(value, "cms_attempt_not_found", "Dieser CMS-Versuch ist nicht vorhanden.", 404);
        check(!Object.hasOwn(input.receipt, "recovery"), "invalid_receipt", "Eine normale CMS-Quittung darf keine Nachprüfung behaupten.");
        const payloadHash = fingerprint(input.receipt);
        const rows = db.prepare("SELECT * FROM cms_receipts WHERE project_id=? AND attempt_id=?").all(input.projectId, input.attemptId);
        if (rows.some(row => row.receipt_id === input.receipt.id && row.payload_hash === payloadHash)) return { attempt: value, idempotentReplay: true };
        const { stateRevision, ...state } = value;
        const success = input.receipt.status === "saved-unpublished";
        const conflict = rows.some(row => row.receipt_id === input.receipt.id && row.payload_hash !== payloadHash)
          || state.receipt && fingerprint(state.receipt) !== fingerprint(input.receipt) && (state.status === "saved-unpublished" || success);
        const status = conflict || success && state.status !== "dispatched" ? "uncertain" : input.receipt.status;
        if (status === "saved-unpublished" && state.saveBinding) {
          assertCmsSaveReadback(state.saveBinding, input.receipt.readback, input.receipt.mediaBindings);
        }
        db.prepare("INSERT INTO cms_receipts VALUES (?,?,?,?,?)").run(input.projectId, input.attemptId, input.receipt.id, payloadHash, canonical(input.receipt));
        const updated = { ...state, status, receipt: input.receipt, receiptHash: payloadHash, updatedAt: now(), repeatAllowed: false,
          ...(conflict ? { uncertainty: "conflicting-receipts" } : success && state.status !== "dispatched" ? { uncertainty: "receipt-before-dispatch" } : {}) };
        return { attempt: saveAttempt(input.projectId, updated, stateRevision), idempotentReplay: false };
      });
    },
    counts() { open(); return Object.fromEntries(["drafts", "versions", "mutations", "artifacts", "cms_attempts", "cms_receipts"].map(name => [name, db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n])); },
    close() { if (!closed) { closed = true;if(scopeId)scoped.delete(scopeId);else {databaseClosed=true;database.close();} } },
  };
  }
  return scopedRepository();
}
