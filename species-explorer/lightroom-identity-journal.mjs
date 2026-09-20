import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { identityDigest, normalizeIdentitySnapshot, prepareIdentityJournalChanges } from "./lightroom-identity-snapshot.mjs";
import { undoFavoriteConflicts } from "./lightroom-identity-inventory.mjs";

const SCHEMA = 1;
const MAX_RUNS = 20;
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const runIdValid = (id) => /^[a-f0-9-]{36}$/.test(id || "");

// Dedicated local database, NEVER the .lrcat or taxonomy database. No pruning:
// hitting either limit stops new work and preserves all existing undo records.
export async function openLightroomIdentityJournal({ journalRoot, catalogKey, maxRuns = MAX_RUNS, maxBytes = MAX_BYTES }) {
  if (typeof catalogKey !== "string" || !catalogKey.trim() || catalogKey.length > 1000) throw new Error("Die Katalogkennung fehlt.");
  const catalogHash = identityDigest(catalogKey);
  await fs.mkdir(journalRoot, { recursive: true });
  const filename = path.join(journalRoot, `${catalogHash}.sqlite`);
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version !== 0 && version !== SCHEMA) throw new Error("Diese Journalversion wird nicht unterstützt.");
    const pageSize = db.prepare("PRAGMA page_size").get().page_size;
    db.exec(`PRAGMA max_page_count=${Math.floor(MAX_FILE_BYTES / pageSize)}`);
    db.exec(`CREATE TABLE IF NOT EXISTS journal_info (id INTEGER PRIMARY KEY CHECK(id=1), catalog_key TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS identity_run (run_id TEXT PRIMARY KEY, plan_token TEXT NOT NULL, plan_json TEXT NOT NULL,
        content_hash TEXT NOT NULL, created_at TEXT NOT NULL, payload_bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS identity_photo (run_id TEXT NOT NULL REFERENCES identity_run(run_id), photo_uuid TEXT NOT NULL,
        before_json TEXT NOT NULL, after_json TEXT NOT NULL, before_hash TEXT NOT NULL, after_hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('prepared','applied','not-applied','undo-prepared','reverted')),
        PRIMARY KEY(run_id, photo_uuid));
      CREATE INDEX IF NOT EXISTS identity_photo_state ON identity_photo(state);
      PRAGMA user_version=${SCHEMA};`);
    db.prepare("INSERT OR IGNORE INTO journal_info VALUES (1, ?)").run(catalogKey);
    if (db.prepare("SELECT catalog_key FROM journal_info WHERE id=1").get().catalog_key !== catalogKey) throw new Error("Das Journal gehört zu einem anderen Katalog.");
  } catch (error) { db.close(); throw error; }

  function transaction(run) {
    db.exec("BEGIN IMMEDIATE");
    try { const result = run(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function rows(runId) {
    if (!runIdValid(runId)) throw new Error("Ungültige Journal-Laufkennung.");
    const run = db.prepare("SELECT * FROM identity_run WHERE run_id=?").get(runId);
    if (!run) throw new Error("Der Journallauf wurde nicht gefunden.");
    const photos = db.prepare("SELECT * FROM identity_photo WHERE run_id=? ORDER BY photo_uuid").all(runId).map((row) => {
      const before = normalizeIdentitySnapshot(JSON.parse(row.before_json));
      const after = normalizeIdentitySnapshot(JSON.parse(row.after_json));
      if (before.photoUuid !== row.photo_uuid || after.photoUuid !== row.photo_uuid
          || identityDigest(before) !== row.before_hash || identityDigest(after) !== row.after_hash) throw new Error("Die Journal-Prüfsumme stimmt nicht. Keine Rücknahme möglich.");
      return { photoUuid: row.photo_uuid, before, after, beforeHash: row.before_hash, afterHash: row.after_hash, state: row.state };
    });
    const plan = JSON.parse(run.plan_json);
    const content = photos.map(({ state, ...photo }) => photo);
    if (identityDigest({ plan, changes: content }) !== run.content_hash) throw new Error("Das Änderungsjournal ist nicht vollständig oder wurde verändert.");
    return { runId, plan, createdAt: run.created_at, photos };
  }
  function observedMap(observed) {
    if (!Array.isArray(observed) || observed.length > 20000) throw new Error("Ungültige Foto-Rücklesung.");
    const result = new Map();
    for (const value of observed) {
      const snapshot = normalizeIdentitySnapshot(value);
      if (result.has(snapshot.photoUuid)) throw new Error("Ein Foto wurde mehrfach zurückgelesen.");
      result.set(snapshot.photoUuid, identityDigest(snapshot));
    }
    return result;
  }
  function undoPreview(runId, observed, availableKeywords, favoriteInventory) {
    const run = rows(runId);
    const current = observedMap(observed);
    const keywords = new Map((availableKeywords || []).map((entry) => [entry.id, entry.name]));
    const eligible = [];
    const conflicts = [];
    for (const photo of run.photos) {
      if (!["applied", "undo-prepared"].includes(photo.state)) continue;
      if (current.get(photo.photoUuid) !== photo.afterHash) {
        conflicts.push({ photoUuid: photo.photoUuid, reason: "Der FN-Stand wurde inzwischen geändert oder das Foto fehlt." });
      } else if (photo.before.keywords.some((keyword) => keywords.get(keyword.id) !== keyword.name)) {
        conflicts.push({ photoUuid: photo.photoUuid, reason: "Ein früheres FN-Stichwort wurde gelöscht oder umbenannt. Es wird nicht wiederhergestellt." });
      } else eligible.push(photo);
    }
    const favoriteCheck = undoFavoriteConflicts(eligible, favoriteInventory);
    return { runId, eligible: favoriteCheck.eligible, conflicts: [...conflicts, ...favoriteCheck.conflicts],
      token: identityDigest({ run, observed: [...current].sort(), keywords: [...keywords].sort(),
        favoriteRevision: favoriteCheck.revision }), changesPhotos: false };
  }
  function recoveryPreview(runId, observed, abandonPending = false) {
    if (typeof abandonPending !== "boolean") throw new Error("Ungültige Entscheidung zur Wiederaufnahme.");
    const run = rows(runId);
    const current = observedMap(observed);
    const effects = [];
    const conflicts = [];
    for (const photo of run.photos) {
      if (!["prepared", "undo-prepared"].includes(photo.state)) continue;
      const hash = current.get(photo.photoUuid);
      const undo = photo.state === "undo-prepared";
      if (hash !== photo.beforeHash && hash !== photo.afterHash) {
        conflicts.push({ photoUuid: photo.photoUuid, reason: "Foto fehlt oder stimmt weder mit Vorher noch Nachher überein." });
        continue;
      }
      const completed = hash === (undo ? photo.beforeHash : photo.afterHash);
      effects.push({ photoUuid: photo.photoUuid, fromState: photo.state,
        toState: completed ? (undo ? "reverted" : "applied")
          : abandonPending ? (undo ? "applied" : "not-applied") : photo.state });
    }
    const body = { runId, journalRevision: identityDigest(run), observed: [...current].sort(), abandonPending, effects, conflicts };
    return { ...body, token: identityDigest(body), changesPhotos: false };
  }
  return {
    filename,
    close: () => db.close(),
    read: rows,
    list() {
      return db.prepare(`SELECT run.run_id AS runId, run.created_at AS createdAt, photo.state, COUNT(*) AS photoCount
        FROM identity_run run JOIN identity_photo photo USING(run_id) GROUP BY run.run_id, photo.state ORDER BY run.created_at DESC, photo.state`).all();
    },
    prepare({ runId, plan, changes, confirmed = false }) {
      if (!runIdValid(runId) || confirmed !== true || plan?.catalogKey !== catalogKey) throw new Error("Journalvorbereitung benötigt Katalogkennung und Bestätigung.");
      const normalized = prepareIdentityJournalChanges(plan, changes);
      const contentHash = identityDigest({ plan, changes: normalized });
      const payloadBytes = Buffer.byteLength(JSON.stringify({ plan, changes: normalized }));
      return transaction(() => {
        const existing = db.prepare("SELECT content_hash FROM identity_run WHERE run_id=?").get(runId);
        if (existing) {
          if (existing.content_hash !== contentHash) throw new Error("Dieselbe Laufkennung darf nicht mit anderen Änderungen wiederholt werden.");
          return rows(runId);
        }
        const totals = db.prepare("SELECT COUNT(*) AS runs, COALESCE(SUM(payload_bytes),0) AS bytes FROM identity_run").get();
        if (totals.runs >= maxRuns || totals.bytes + payloadBytes > maxBytes) throw new Error("Das Änderungsjournal ist voll. Rücknahmedaten bleiben erhalten; keine neue Übernahme starten.");
        if (db.prepare("SELECT 1 FROM identity_photo WHERE state IN ('prepared','undo-prepared') LIMIT 1").get()) throw new Error("Zuerst den unterbrochenen Journallauf prüfen. Keine parallele Artänderung starten.");
        db.prepare("INSERT INTO identity_run VALUES (?, ?, ?, ?, ?, ?)").run(runId, plan.token, JSON.stringify(plan), contentHash, new Date().toISOString(), payloadBytes);
        const insert = db.prepare("INSERT INTO identity_photo VALUES (?, ?, ?, ?, ?, ?, 'prepared')");
        for (const photo of normalized) insert.run(runId, photo.photoUuid, JSON.stringify(photo.before), JSON.stringify(photo.after), photo.beforeHash, photo.afterHash);
        return rows(runId);
      });
    },
    // Called ONLY after the Lightroom transaction returns and its fields and
    // keywords have been read again. Never interpret a scheduled callback as success.
    checkpoint(runId, observed, mode = "apply") {
      if (!["apply", "not-applied", "undo"].includes(mode)) throw new Error("Unbekannter Journalabschluss.");
      return transaction(() => {
        const run = rows(runId);
        const current = observedMap(observed);
        const expectedState = mode === "undo" ? "undo-prepared" : "prepared";
        const nextState = mode === "undo" ? "reverted" : mode === "apply" ? "applied" : "not-applied";
        const update = db.prepare("UPDATE identity_photo SET state=? WHERE run_id=? AND photo_uuid=?");
        for (const [uuid, hash] of current) {
          const photo = run.photos.find((entry) => entry.photoUuid === uuid);
          if (!photo || ![expectedState, nextState].includes(photo.state)
              || hash !== (mode === "apply" ? photo.afterHash : photo.beforeHash)) throw new Error("Der zurückgelesene FN-Stand bestätigt diesen Schreibabschluss nicht.");
          update.run(nextState, runId, uuid);
        }
        return rows(runId);
      });
    },
    reconcile(runId, observed) {
      const current = observedMap(observed);
      return rows(runId).photos.map((photo) => ({ photoUuid: photo.photoUuid, state: photo.state,
        observed: current.get(photo.photoUuid) === photo.beforeHash ? "before"
          : current.get(photo.photoUuid) === photo.afterHash ? "after" : "conflict" }));
    },
    undoPreview,
    recoveryPreview,
    // The coordinator must ensure there is no active Lightroom writer. Recovery
    // records observed outcomes; it never replays a catalog write automatically.
    confirmRecovery({ runId, observed, abandonPending = false, token, confirmed }) {
      return transaction(() => {
        const preview = recoveryPreview(runId, observed, abandonPending);
        if (confirmed !== true || token !== preview.token) throw new Error("Wiederaufnahme benötigt eine aktuelle Vorschau und Bestätigung.");
        const update = db.prepare("UPDATE identity_photo SET state=? WHERE run_id=? AND photo_uuid=?");
        for (const effect of preview.effects) update.run(effect.toState, runId, effect.photoUuid);
        return { ...preview, run: rows(runId) };
      });
    },
    prepareUndo({ runId, observed, availableKeywords, favoriteInventory, token, confirmed }) {
      return transaction(() => {
        if (db.prepare("SELECT 1 FROM identity_photo WHERE state='prepared' OR (state='undo-prepared' AND run_id<>?) LIMIT 1").get(runId)) {
          throw new Error("Zuerst den offenen Journallauf klären. Keine parallele Rücknahme starten.");
        }
        const preview = undoPreview(runId, observed, availableKeywords, favoriteInventory);
        if (confirmed !== true || preview.token !== token || !preview.eligible.length) throw new Error("Rücknahme benötigt eine aktuelle Vorschau und Bestätigung.");
        const update = db.prepare("UPDATE identity_photo SET state='undo-prepared' WHERE run_id=? AND photo_uuid=?");
        for (const photo of preview.eligible) update.run(runId, photo.photoUuid);
        return preview;
      });
    },
  };
}
