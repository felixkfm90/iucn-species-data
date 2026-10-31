import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { check, canonical, fingerprint, PageAuthoringError } from "./contract.mjs";

const APPLICATION_ID = 0x464e5041;
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
  safePath(filename); fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;
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
  `);
  fs.chmodSync(filename, 0o600);
  let closed = false;
  function open() { check(!closed, "repository_closed", "Der Entwurfsspeicher ist geschlossen.", 409); }
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
  function attempt(projectId, id) {
    open(); const row = db.prepare("SELECT * FROM cms_attempts WHERE project_id=? AND id=?").get(projectId, id);
    return row ? { ...JSON.parse(row.state_json), stateRevision: row.state_revision } : null;
  }
  function saveAttempt(projectId, state) {
    const stateRevision = fingerprint(state);
    db.prepare("UPDATE cms_attempts SET status=?,state_revision=?,state_json=? WHERE project_id=? AND id=?")
      .run(state.status, stateRevision, canonical(state), projectId, state.id);
    return { ...state, stateRevision };
  }
  return {
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
        const prior = read(input.projectId, input.id);
        if (input.create) check(!prior, "draft_exists", "Für diese Kennung gibt es bereits einen Entwurf.", 409);
        else current(input.projectId, input.id, input.expectedRevision);
        const bodyHash = fingerprint(input.document);
        if (prior?.contentHash === bodyHash) return { draft: prior, unchanged: true };
        const sequence = (prior?.sequence ?? 0) + 1, createdAt = now();
        const revision = fingerprint({ projectId: input.projectId, id: input.id, sequence, parent: prior?.revision ?? null, bodyHash, actorId: input.actorId });
        const targetPath = `${input.document.parentPath}/${input.document.slug}`;
        const duplicate = db.prepare("SELECT id FROM drafts WHERE project_id=? AND path=?").get(input.projectId, targetPath);
        check(!duplicate || duplicate.id === input.id, "page_path_reserved", "Für diesen Zielpfad ist bereits ein Entwurf vorhanden.", 409);
        db.prepare("INSERT INTO versions VALUES (?,?,?,?,?,?,?,?,?)").run(input.projectId, input.id, revision, sequence, prior?.revision ?? null,
          bodyHash, canonical(input.document), input.actorId, createdAt);
        db.prepare("INSERT INTO drafts VALUES (?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET path=excluded.path,head=excluded.head,sequence=excluded.sequence")
          .run(input.projectId, input.id, targetPath, revision, sequence);
        return { draft: read(input.projectId, input.id), unchanged: false };
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
        check(!db.prepare("SELECT id FROM cms_attempts WHERE project_id=? AND draft_id=?").get(input.projectId, input.draftId),
          "cms_repeat_blocked", "Für diesen Entwurf besteht bereits ein CMS-Versuch. Vor einem weiteren Schreiben ist dessen Vollzug gezielt zu klären.", 409);
        const state = { id: randomUUID(), draftId: input.draftId, revision: input.expectedRevision, planId: input.planId,
          actorId: input.actorId, status: "prepared", createdAt: now(), receipt: null, repeatAllowed: false };
        db.prepare("INSERT INTO cms_attempts VALUES (?,?,?,?,?,?,?,?,?)").run(input.projectId, input.draftId, state.id,
          state.revision, state.planId, input.actorId, state.status, fingerprint(state), canonical(state));
        return { attempt: attempt(input.projectId, state.id) };
      });
    },
    attempt,
    attemptForDraft(projectId, draftId) {
      open(); const row = db.prepare("SELECT id FROM cms_attempts WHERE project_id=? AND draft_id=?").get(projectId, draftId);
      return row ? attempt(projectId, row.id) : null;
    },
    dispatch(input) {
      return mutation(input, () => {
        const value = attempt(input.projectId, input.attemptId);
        check(value && value.actorId === input.actorId, "cms_attempt_not_found", "Dieser CMS-Auftrag gehört nicht zu diesem Ausführungskontext.", 404);
        current(input.projectId, value.draftId, value.revision);
        check(value.stateRevision === input.expectedStateRevision && value.status === "prepared", "cms_repeat_blocked", "Ein bereits begonnener CMS-Auftrag wird nicht erneut gestartet.", 409);
        const { stateRevision, ...state } = value;
        return { attempt: saveAttempt(input.projectId, { ...state, status: "dispatched", dispatchedAt: now(), dispatchId: input.dispatchId }) };
      });
    },
    recordOutcome(input) {
      return transaction(() => {
        const value = attempt(input.projectId, input.attemptId);
        check(value, "cms_attempt_not_found", "Dieser CMS-Versuch ist nicht vorhanden.", 404);
        const payloadHash = fingerprint(input.receipt);
        const rows = db.prepare("SELECT * FROM cms_receipts WHERE project_id=? AND attempt_id=?").all(input.projectId, input.attemptId);
        if (rows.some(row => row.receipt_id === input.receipt.id && row.payload_hash === payloadHash)) return { attempt: value, idempotentReplay: true };
        db.prepare("INSERT INTO cms_receipts VALUES (?,?,?,?,?)").run(input.projectId, input.attemptId, input.receipt.id, payloadHash, canonical(input.receipt));
        const { stateRevision, ...state } = value;
        const success = input.receipt.status === "saved-unpublished";
        const conflict = rows.some(row => row.receipt_id === input.receipt.id && row.payload_hash !== payloadHash)
          || state.receipt && fingerprint(state.receipt) !== fingerprint(input.receipt) && (state.status === "saved-unpublished" || success);
        const status = conflict || success && state.status !== "dispatched" ? "uncertain" : input.receipt.status;
        const updated = { ...state, status, receipt: input.receipt, receiptHash: payloadHash, updatedAt: now(), repeatAllowed: false,
          ...(conflict ? { uncertainty: "conflicting-receipts" } : success && state.status !== "dispatched" ? { uncertainty: "receipt-before-dispatch" } : {}) };
        return { attempt: saveAttempt(input.projectId, updated), idempotentReplay: false };
      });
    },
    counts() { open(); return Object.fromEntries(["drafts", "versions", "mutations", "artifacts", "cms_attempts", "cms_receipts"].map(name => [name, db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n])); },
    close() { if (!closed) { closed = true; db.close(); } },
  };
}
