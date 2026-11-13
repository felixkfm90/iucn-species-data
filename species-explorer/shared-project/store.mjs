import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson, objectJson, transportJson, digest, hashPassword, newToken, tokenHash, verifyPassword } from "./security.mjs";
import { buildCatalog } from "./catalog.mjs";
import { validateSharedSpecies, guardSpeciesRecordTransition, projectSpeciesRecordToCatalog, sharedSpeciesCollisionKeys } from "./species-record.mjs";
import { check, fail } from "./errors.mjs";
import { WEBSITE_ALT_TYPE, guardWebsiteAltTransition, websiteAltServerEvidence } from "./website-alt-sync.mjs";
import { PAGE_AUTHORING_TYPE, guardPageAuthoringTransition, pageAuthoringServerEvidence } from "../page-authoring/shared.mjs";
import { assertProjectMediaSchema, installImageMediaSchema } from "./image-media.mjs";
import { createImageMediaStore } from "./image-media-store.mjs";
import { validatePageEditorialIntent } from "./species-editorial-intent.mjs";
import { verifyPageEditorialAdoption } from "./species-editorial-adoption.mjs";
import { createReaderCatalogService } from "./reader-service.mjs";
import { assertNormalMediaSchema, enableSpeciesEnrichmentSchema, installNormalMediaSchema } from "./normal-media-schema.mjs";
import { createNormalMediaStore } from "./normal-media-store.mjs";
import { normalMediaBinding, NORMAL_MEDIA_SLOTS } from "./normal-media.mjs";
import { projectSpeciesEnrichment, validateSpeciesEnrichmentChange } from "./species-enrichment.mjs";
import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { validateAudioDecode } from "../../scripts/audio-validation.mjs";

export const ROLES = Object.freeze(["admin", "publisher", "contributor", "reader"]);
const writers = ["admin", "publisher", "contributor"];
const releasers = ["admin", "publisher"];
const hours = 60 * 60 * 1000;
const pairingLifetime = 2 * 60 * 1000;
const maxPairings = 128;
const enrichmentMediaKey = (id, slot, sha256) => `species_enrichment_media:${id}:${slot}:${sha256}`;

function short(value, max, label) {
  check(typeof value === "string" && value.trim() && value.length <= max && !/[\u0000-\u001f]/.test(value),
    400, "invalid_input", `${label} ist ungültig.`);
  return value.trim();
}
function username(value) {
  const normalized = short(value, 80, "Benutzername").toLowerCase();
  check(/^[a-z0-9][a-z0-9._@+-]{2,79}$/.test(normalized), 400, "invalid_input", "Ungültiger Benutzername.");
  return normalized;
}
function identifier(kind, id) {
  check(["species", "page"].includes(kind) && typeof id === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 120,
  400, "invalid_object", "Ungültige Objektkennung.");
}
function payload(kind, id, data) {
  check(data && typeof data === "object" && !Array.isArray(data), 400, "invalid_data", "Ein Datensatz muss ein Objekt sein.");
  if (kind === "species") {
    try { return objectJson(validateSharedSpecies(data, id)); }
    catch (error) {
      if (error.name === "PageAuthoringError") fail(error.status, error.code, error.message);
      throw error;
    }
  }
  short(data.title, 500, "Seitentitel");
  return objectJson(data);
}
function publicUser(row) {
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role,
    blocked: Boolean(row.blocked), version: row.version };
}
function safeDatabasePath(filename, localStorageConfirmed) {
  check(localStorageConfirmed === true && typeof filename === "string" && path.isAbsolute(filename)
    && !/^(?:\\\\|\/\/|file:)/i.test(filename) && !filename.includes("\0"),
  400, "unsafe_storage", "Eine ausdrücklich bestätigte lokale SQLite-Datei ist erforderlich; keine Netzwerkfreigabe.");
  const resolved = path.resolve(filename);
  let current = path.parse(resolved).root;
  for (const part of path.relative(current, resolved).split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) check(!fs.lstatSync(current).isSymbolicLink(), 400, "unsafe_storage", "Verknüpfte Datenpfade sind nicht zulässig.");
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  return resolved;
}

/** Isolated shared project. No repository/catalog discovery and no external publication. */
export function createSharedProjectStore({ filename, localStorageConfirmed = false, clock = Date.now, imageDecode, audioDecode } = {}) {
  const databasePath = safeDatabasePath(filename, localStorageConfirmed);
  const db = new DatabaseSync(databasePath);
  fs.chmodSync(databasePath, 0o600);
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  const schema = db.prepare("PRAGMA user_version").get().user_version;
  if (![0, 1, 2, 3, 4, 5, 6, 7].includes(schema)) {
    db.close(); fail(409, "unsupported_schema", "Die Projektdatenbank hat eine unbekannte Version.");
  }
  if (schema >= 4) {
    try { if (schema >= 6) assertNormalMediaSchema(db); else assertProjectMediaSchema(db, schema); } catch (error) { db.close(); throw error; }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','publisher','contributor','reader')),
      blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)), version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), device_id TEXT REFERENCES devices(id),
      scope TEXT NOT NULL CHECK(scope IN ('full','read')), expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, failures INTEGER NOT NULL, started_at INTEGER NOT NULL, blocked_until INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS objects (
      kind TEXT NOT NULL, id TEXT NOT NULL, current_revision TEXT NOT NULL, approved_revision TEXT,
      PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS versions (
      kind TEXT NOT NULL, id TEXT NOT NULL, revision TEXT PRIMARY KEY, ordinal INTEGER NOT NULL,
      parent_revision TEXT, data TEXT NOT NULL, author_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
      UNIQUE(kind,id,ordinal));
    CREATE INDEX IF NOT EXISTS versions_object ON versions(kind,id);
    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, object_id TEXT NOT NULL, author_id TEXT NOT NULL REFERENCES users(id),
      base_revision TEXT NOT NULL, current_revision TEXT NOT NULL, base_data TEXT NOT NULL,
      current_data TEXT NOT NULL, proposed_data TEXT NOT NULL, created_at TEXT NOT NULL,
      resolved_at TEXT, resolved_by TEXT REFERENCES users(id), resolution TEXT, resulting_revision TEXT);
    CREATE TABLE IF NOT EXISTS changes (
      author_id TEXT NOT NULL REFERENCES users(id), change_id TEXT NOT NULL, request_hash TEXT NOT NULL,
      result TEXT NOT NULL, PRIMARY KEY(author_id,change_id));
    CREATE TABLE IF NOT EXISTS audit (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT NOT NULL,
      target TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS website_alt_receipts (
      id TEXT PRIMARY KEY, object_id TEXT NOT NULL, version_revision TEXT NOT NULL REFERENCES versions(revision), body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS website_alt_receipt_object ON website_alt_receipts(object_id);
    CREATE TABLE IF NOT EXISTS page_authoring_receipts (
      id TEXT PRIMARY KEY, object_id TEXT NOT NULL, version_revision TEXT NOT NULL REFERENCES versions(revision), body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS page_authoring_receipt_object ON page_authoring_receipts(object_id);
    INSERT OR IGNORE INTO meta(key,value) VALUES ('catalog_revision','0');
    INSERT OR IGNORE INTO meta VALUES ('objects_generation','0');
    CREATE TRIGGER IF NOT EXISTS objects_insert_generation AFTER INSERT ON objects BEGIN
      UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='objects_generation'; END;
    CREATE TRIGGER IF NOT EXISTS objects_update_generation AFTER UPDATE ON objects BEGIN
      UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='objects_generation'; END;
  `);
  try {
    if (schema < 5) installImageMediaSchema(db);
    if (schema < 6) installNormalMediaSchema(db);
    // Development stores can already contain guarded files from before the format boundary.
    if (schema === 6 && db.prepare("SELECT 1 FROM meta WHERE key GLOB 'species_enrichment_media:*' LIMIT 1").get()) {
      transaction(() => enableSpeciesEnrichmentSchema(db));
    }
  } catch (error) { db.close(); throw error; }
  function now() { return Number(clock()); }
  function iso() { return new Date(now()).toISOString(); }
  function transaction(fn, { readOnly = false } = {}) {
    let begun = false;
    try { db.exec(readOnly ? "BEGIN" : "BEGIN IMMEDIATE"); begun = true; const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) {
      if (begun) db.exec("ROLLBACK");
      if (error.code === "ERR_SQLITE_ERROR" && /locked|busy/i.test(error.message)) fail(503, "project_busy", "Das Projekt wird gerade gespeichert. Bitte erneut versuchen.");
      throw error;
    }
  }
  function audit(actor, action, target = null) {
    db.prepare("INSERT INTO audit(actor_id,action,target,created_at) VALUES (?,?,?,?)").run(actor?.id ?? null, action, target, iso());
  }
  function guardNewSpeciesIdentity(data) {
    const candidate = sharedSpeciesCollisionKeys(data);
    for (const row of db.prepare("SELECT v.data FROM objects o JOIN versions v ON v.revision=o.current_revision WHERE o.kind='species'").iterate()) {
      const prior = sharedSpeciesCollisionKeys(JSON.parse(row.data));
      check(candidate.scientific !== prior.scientific, 409, "species_identity_exists", "Diese strukturierte Artidentität besteht bereits unter einer anderen Kennung.");
      check(!candidate.german || candidate.german !== prior.german, 409, "species_name_exists", "Dieser deutsche Artname ist bereits vorhanden.");
      check(!candidate.asset || candidate.asset !== prior.asset, 409, "species_asset_exists", "Dieser Assetname wird bereits von einer anderen Art verwendet.");
      check(!candidate.slugs.some(slug => prior.slugs.includes(slug)), 409, "species_slug_exists", "Dieser URL-Slug wird bereits von einer anderen Art verwendet.");
    }
  }
  function sessionUser(sessionHash) {
    return db.prepare(`SELECT u.*, s.scope, s.device_id, s.token_hash AS session_hash FROM sessions s JOIN users u ON u.id=s.user_id
      LEFT JOIN devices d ON d.id=s.device_id WHERE s.token_hash=? AND s.expires_at>? AND u.blocked=0
      AND (s.device_id IS NULL OR (d.revoked=0 AND d.expires_at>?))`).get(sessionHash, now(), now());
  }
  function actor(token, roles = ROLES, { write = false } = {}) {
    const row = sessionUser(tokenHash(token, "s"));
    check(row, 401, "authentication_required", "Bitte erneut anmelden.");
    check(roles.includes(row.role) && (!write || row.scope === "full"), 403, "forbidden", "Für diese Aktion fehlt die Berechtigung.");
    return row;
  }
  let decodingMedia = false;
  const exclusiveDecode = decode => async (...args) => {
    check(!decodingMedia, 429, "media_busy", "Eine Mediendatei wird bereits geprüft. Bitte diesen Abschluss abwarten.");
    decodingMedia = true;
    try { return await decode(...args); } finally { decodingMedia = false; }
  };
  const decodeImage = exclusiveDecode(imageDecode ?? validateImageDecode);
  const imageMedia = createImageMediaStore({ db, actor, transaction, audit, iso, decode: decodeImage });
  const normalMedia = createNormalMediaStore({ db, actor, transaction, audit, iso,
    imageDecode: decodeImage, audioDecode: exclusiveDecode(audioDecode ?? validateAudioDecode) });
  const readerCatalog = createReaderCatalogService({ db, actor, transaction, imageMedia, normalMedia, iso });
  // Older approval clients may still use catalog version 1. Keep the media
  // prerequisite attached to the affected bytes across later draft revisions.
  function requireEnrichmentMedia(token, data) {
    if (data.type !== "fn-species-record") return;
    for (const slot of NORMAL_MEDIA_SLOTS) {
      const file = data.assets.files[slot];
      if (!file || file.url || !db.prepare("SELECT 1 FROM meta WHERE key=?").get(enrichmentMediaKey(data.id, slot, file.sha256))) continue;
      const projectId = db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value;
      const binding = normalMediaBinding(data, { projectId, slot });
      let ready = false;
      try { ready = normalMedia.get(token, binding.contentId).complete; }
      catch (error) { if (error.code !== "normal_media_not_found") throw error; }
      check(ready, 409, "reader_media_required", "Die Leserfassung benötigt zuerst ihre tatsächlich bereitgestellten Bild- und Tondateien.");
    }
  }
  function session(user, { deviceId = null, scope = "full", expiresAt = now() + 12 * hours } = {}) {
    const token = newToken("s");
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now());
    const count = db.prepare("SELECT count(*) AS n FROM sessions WHERE user_id=?").get(user.id).n;
    check(count < 32, 409, "session_limit", "Bitte zuerst eine bestehende Sitzung abmelden.");
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?,?)").run(tokenHash(token, "s"), user.id, deviceId, scope, expiresAt, iso());
    return { token, expiresAt: new Date(expiresAt).toISOString(), scope, user: publicUser(user),
      projectId: db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value };
  }
  function addDevice(user, label) {
    const count = db.prepare("SELECT count(*) AS n FROM devices WHERE user_id=? AND revoked=0 AND expires_at>?").get(user.id, now()).n;
    check(count < 16, 409, "device_limit", "Bitte zuerst ein bestehendes Gerät abmelden.");
    const token = newToken("d"), id = randomUUID(), expiresAt = now() + 30 * 24 * hours;
    db.prepare("INSERT INTO devices VALUES (?,?,?,?,?,0,?)").run(id, user.id, tokenHash(token, "d"), short(label, 80, "Gerätename"), expiresAt, iso());
    return { id, token, expiresAt: new Date(expiresAt).toISOString() };
  }
  // A project process restart invalidates invitations. Issued device credentials
  // still use the normal persistent device/session lifecycle.
  const pairings = new Map();
  function version(kind, id, revision) {
    const row = db.prepare("SELECT * FROM versions WHERE kind=? AND id=? AND revision=?").get(kind, id, revision);
    check(row, 404, "revision_not_found", "Die Objektversion ist nicht vorhanden.");
    const data = JSON.parse(row.data), result = { kind, id, revision: row.revision, ordinal: row.ordinal, parentRevision: row.parent_revision,
      data, authorId: row.author_id, createdAt: row.created_at };
    if (kind === "page" && data.type === WEBSITE_ALT_TYPE) result.websiteAltEvidence = websiteAltServerEvidence({ objectId: id, objectRevision: row.revision, data, receipts: altReceipts(id) });
    if (kind === "page" && data.type === PAGE_AUTHORING_TYPE) result.pageAuthoringEvidence = authoringCheck(() => pageAuthoringServerEvidence({ objectId: id,
      objectRevision: row.revision, objectOrdinal: row.ordinal, data, receipts: authoringReceipts(id) }));
    return result;
  }
  function altReceipts(id) { return db.prepare("SELECT body FROM website_alt_receipts WHERE object_id=? ORDER BY rowid").all(id).map((row) => JSON.parse(row.body)); }
  function authoringReceipts(id) { return db.prepare("SELECT body FROM page_authoring_receipts WHERE object_id=? ORDER BY rowid").all(id).map((row) => JSON.parse(row.body)); }
  function authoringCheck(fn) {
    try { return fn(); } catch (error) { if (error.name === "PageAuthoringError") fail(error.status, error.code, error.message); throw error; }
  }
  function altGuard(user, id, before, next) {
    imageMedia.assertReferences(next);
    return { website: guardWebsiteAltTransition({ objectId: id, before, next, actorRole: user.role, receipts: altReceipts(id) }),
      authoring: authoringCheck(() => guardPageAuthoringTransition({ objectId: id, before, next, actorRole: user.role,
        projectId: db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value, receipts: authoringReceipts(id) })) };
  }
  function saveAltReceipts(user, id, revision, values) {
    for (const value of values.website ?? []) {
      const receipt = { ...value, id: randomUUID(), objectId: id, objectRevision: revision, actorId: user.id, actorRole: user.role, recordedAt: iso() };
      db.prepare("INSERT INTO website_alt_receipts VALUES (?,?,?,?)").run(receipt.id, id, revision, JSON.stringify(receipt));
    }
    for (const value of values.authoring ?? []) {
      const receipt = { ...value, id: randomUUID(), objectId: id, objectRevision: revision,
        objectOrdinal: db.prepare("SELECT ordinal FROM versions WHERE revision=?").get(revision).ordinal,
        actorId: user.id, actorRole: user.role, recordedAt: iso() };
      db.prepare("INSERT INTO page_authoring_receipts VALUES (?,?,?,?)").run(receipt.id, id, revision, JSON.stringify(receipt));
    }
  }
  function objectRow(kind, id) {
    identifier(kind, id);
    const row = db.prepare("SELECT * FROM objects WHERE kind=? AND id=?").get(kind, id);
    check(row, 404, "object_not_found", "Das Objekt ist nicht vorhanden.");
    return row;
  }
  function objectFor(user, row) {
    const readOnly = user.role === "reader" || user.scope === "read";
    const revision = readOnly ? row.approved_revision : row.current_revision;
    check(revision, 404, "object_not_found", "Das Objekt ist nicht freigegeben.");
    return { ...version(row.kind, row.id, revision), approvedRevision: row.approved_revision,
      approval: row.approved_revision === revision ? "approved" : "draft" };
  }
  function insertVersion(user, row, serialized) {
    imageMedia.assertReferences(JSON.parse(serialized));
    const previous = row.current_revision ? version(row.kind, row.id, row.current_revision) : null;
    const revision = randomUUID();
    db.prepare("INSERT INTO versions VALUES (?,?,?,?,?,?,?,?)").run(row.kind, row.id, revision,
      previous ? previous.ordinal + 1 : 1, row.current_revision || null, serialized, user.id, iso());
    return revision;
  }
  function conflictData(row) {
    return { id: row.id, kind: row.kind, objectId: row.object_id, authorId: row.author_id,
      baseRevision: row.base_revision, currentRevision: row.current_revision,
      base: JSON.parse(row.base_data), current: JSON.parse(row.current_data), proposed: JSON.parse(row.proposed_data),
      createdAt: row.created_at, resolvedAt: row.resolved_at, resolvedBy: row.resolved_by,
      resolution: row.resolution, resultingRevision: row.resulting_revision };
  }

  return {
    speciesCreation: 1,
    pageEditorialAdoption: 1,
    speciesEnrichment: 1,
    readerCatalogVersions: Object.freeze([1, 2]),
    readerCatalog: (token) => readerCatalog.catalog(token),
    readerCatalogPage: (token, options) => readerCatalog.page(token, options),
    previewReaderApproval: (token, id, options) => readerCatalog.preview(token, id, options),
    declareImageMedia: (token, input) => imageMedia.declare(token, input),
    getImageMedia: (token, id) => imageMedia.get(token, id),
    readImageMedia: (token, id) => imageMedia.content(token, id),
    putImageMedia: (token, id, bytes, options) => imageMedia.put(token, id, bytes, options),
    assertImageMediaWriteAccess: (token, binding, id) => imageMedia.assertWrite(token, binding, id),
    declareNormalMedia: (token, input) => normalMedia.declare(token, input),
    getNormalMedia: (token, id) => normalMedia.get(token, id),
    readNormalMedia: (token, id) => normalMedia.content(token, id),
    putNormalMedia: (token, id, bytes, options) => normalMedia.put(token, id, bytes, options),
    assertNormalMediaWriteAccess: (token, binding, id) => normalMedia.assertWrite(token, binding, id),
    assertWriteAccess(token) { actor(token, writers, { write: true }); return true; },
    async bootstrap({ confirmed, users }) {
      check(confirmed === true && Array.isArray(users) && users.length >= 2 && users.length <= 20,
        400, "bootstrap_confirmation", "Der einmalige Projektstart benötigt eine ausdrückliche Bestätigung und mindestens zwei Administratoren.");
      check(db.prepare("SELECT count(*) AS n FROM users").get().n === 0, 409, "already_bootstrapped", "Das Projekt ist bereits eingerichtet.");
      const prepared = [];
      for (const user of users) prepared.push({ username: username(user.username),
        displayName: short(user.displayName, 120, "Anzeigename"), hash: await hashPassword(user.password) });
      check(new Set(prepared.map((user) => user.username)).size === prepared.length, 400, "duplicate_user", "Benutzernamen müssen eindeutig sein.");
      return transaction(() => {
        check(db.prepare("SELECT count(*) AS n FROM users").get().n === 0, 409, "already_bootstrapped", "Das Projekt ist bereits eingerichtet.");
        for (const user of prepared) db.prepare("INSERT INTO users VALUES (?,?,?,?,'admin',0,1,?)")
          .run(randomUUID(), user.username, user.displayName, user.hash, iso());
        db.prepare("INSERT INTO meta VALUES ('project_id',?)").run(randomUUID());
        audit(null, "bootstrap");
        return { initialized: true, adminCount: prepared.length };
      });
    },
    async login({ username: input, password, deviceLabel, scope = "full" } = {}) {
      check(["full", "read"].includes(scope), 400, "invalid_scope", "Unbekannter Sitzungsumfang.");
      let name;
      try { name = username(input); } catch { name = null; }
      const key = digest(name ?? "invalid-input"), timestamp = now();
      db.prepare("DELETE FROM login_attempts WHERE started_at<? AND blocked_until<=?")
        .run(timestamp - 24 * hours, timestamp);
      const attempt = db.prepare("SELECT * FROM login_attempts WHERE key=?").get(key);
      check(!attempt || attempt.blocked_until <= timestamp, 429, "login_throttled", "Zu viele Anmeldeversuche. Bitte später erneut versuchen.");
      const user = name ? db.prepare("SELECT * FROM users WHERE username=?").get(name) : undefined;
      const verified = await verifyPassword(password, user?.password_hash);
      const result = transaction(() => {
        const fresh = user && db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
        if (!verified || !fresh || fresh.blocked || fresh.password_hash !== user.password_hash) {
          const old = db.prepare("SELECT * FROM login_attempts WHERE key=?").get(key);
          const failures = old && timestamp - old.started_at < 15 * 60 * 1000 ? old.failures + 1 : 1;
          db.prepare("INSERT OR REPLACE INTO login_attempts VALUES (?,?,?,?)").run(key, failures,
            failures === 1 ? timestamp : old.started_at, failures >= 5 ? timestamp + 15 * 60 * 1000 : 0);
          return { rejected: true };
        }
        db.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
        const device = deviceLabel === undefined ? null : addDevice(fresh, deviceLabel);
        const result = session(fresh, { deviceId: device?.id ?? null, scope });
        if (device) result.device = device;
        audit(fresh, "login");
        return result;
      });
      check(!result.rejected, 401, "authentication_required", "Benutzername oder Passwort stimmt nicht.");
      return result;
    },
    refresh(deviceToken) {
      return transaction(() => {
        const row = db.prepare(`SELECT u.*, d.id AS device_id, d.expires_at FROM devices d JOIN users u ON u.id=d.user_id
          WHERE d.token_hash=? AND d.revoked=0 AND d.expires_at>? AND u.blocked=0`).get(tokenHash(deviceToken, "d"), now());
        check(row, 401, "authentication_required", "Bitte erneut anmelden.");
        return session(row, { deviceId: row.device_id, scope: "read", expiresAt: Math.min(now() + 12 * hours, row.expires_at) });
      });
    },
    issueReadPairing(token) {
      const user = actor(token, ROLES, { write: true });
      const timestamp = now();
      for (const [hash, grant] of pairings) {
        if (grant.expiresAt <= timestamp || grant.userId === user.id) pairings.delete(hash);
      }
      check(pairings.size < maxPairings, 429, "pairing_limit", "Es sind bereits zu viele Einladungen offen. Bitte kurz warten.");
      const code = newToken("p"), expiresAt = timestamp + pairingLifetime;
      const projectId = db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value;
      pairings.set(tokenHash(code, "p"), { projectId, expiresAt, userId: user.id, userVersion: user.version, sessionHash: user.session_hash });
      return { schemaVersion: 1, code, projectId, expiresAt: new Date(expiresAt).toISOString() };
    },
    redeemReadPairing(input) {
      check(input && Object.keys(input).length === 3
        && ["code", "projectId", "deviceLabel"].every(key => Object.hasOwn(input, key))
        && typeof input.projectId === "string" && /^[a-f0-9-]{36}$/.test(input.projectId),
      400, "invalid_pairing", "Die Geräteeinladung ist ungültig.");
      const label = short(input.deviceLabel, 80, "Gerätename");
      const hash = tokenHash(input.code, "p"), grant = pairings.get(hash);
      const unavailable = "Diese Einladung ist nicht mehr gültig. Bitte am PC eine neue erstellen.";
      check(grant && grant.projectId === input.projectId, 401, "pairing_unavailable", unavailable);
      const result = transaction(() => {
        check(grant.expiresAt > now(), 401, "pairing_unavailable", unavailable);
        const user = sessionUser(grant.sessionHash);
        check(user && user.scope === "full" && user.id === grant.userId && user.version === grant.userVersion
          && db.prepare("SELECT value FROM meta WHERE key='project_id'").get()?.value === grant.projectId,
        401, "pairing_unavailable", unavailable);
        const device = addDevice(user, label);
        const sessionResult = session(user, { deviceId: device.id, scope: "read" });
        audit(user, "device-paired", device.id);
        return { ...sessionResult, device };
      });
      pairings.delete(hash);
      return result;
    },
    me(token) { return { ...publicUser(actor(token)), projectId: db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value }; },
    logout(token, { revokeDevice = false } = {}) {
      check(typeof revokeDevice === "boolean", 400, "invalid_input", "Ungültige Geräteabmeldung.");
      return transaction(() => {
        const user = actor(token);
        if (revokeDevice && user.device_id) db.prepare("UPDATE devices SET revoked=1 WHERE id=?").run(user.device_id);
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(user.session_hash);
        audit(user, "logout");
        return { loggedOut: true };
      });
    },
    devices(token) {
      const user = actor(token);
      return db.prepare("SELECT id,label,expires_at,revoked,created_at FROM devices WHERE user_id=? ORDER BY created_at").all(user.id)
        .map((row) => ({ id: row.id, label: row.label, expiresAt: new Date(row.expires_at).toISOString(), revoked: Boolean(row.revoked), createdAt: row.created_at }));
    },
    revokeDevice(token, id) {
      return transaction(() => {
        const user = actor(token, ROLES, { write: true });
        const row = db.prepare("SELECT * FROM devices WHERE id=?").get(id);
        check(row && (row.user_id === user.id || user.role === "admin"), 404, "device_not_found", "Das Gerät ist nicht vorhanden.");
        db.prepare("UPDATE devices SET revoked=1 WHERE id=?").run(id);
        db.prepare("DELETE FROM sessions WHERE device_id=?").run(id);
        audit(user, "device-revoked", id);
        return { revoked: true };
      });
    },
    listUsers(token) { actor(token, ["admin"], { write: true }); return db.prepare("SELECT * FROM users ORDER BY username").all().map(publicUser); },
    async createUser(token, input) {
      actor(token, ["admin"], { write: true });
      const name = username(input.username), displayName = short(input.displayName, 120, "Anzeigename");
      check(ROLES.includes(input.role), 400, "invalid_role", "Unbekannte Benutzerstufe.");
      const hash = await hashPassword(input.password);
      return transaction(() => {
        const user = actor(token, ["admin"], { write: true });
        check(!db.prepare("SELECT id FROM users WHERE username=?").get(name), 409, "duplicate_user", "Dieser Benutzername ist bereits vergeben.");
        const id = randomUUID();
        db.prepare("INSERT INTO users VALUES (?,?,?,?,?,0,1,?)").run(id, name, displayName, hash, input.role, iso());
        audit(user, "user-created", id);
        return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id));
      });
    },
    updateUser(token, id, { expectedVersion, role, blocked, displayName } = {}) {
      return transaction(() => {
        const user = actor(token, ["admin"], { write: true }), target = db.prepare("SELECT * FROM users WHERE id=?").get(id);
        check(target, 404, "user_not_found", "Die Person ist nicht vorhanden.");
        check(expectedVersion === target.version, 409, "user_changed", "Die Benutzerangaben wurden inzwischen geändert.");
        const nextRole = role ?? target.role, nextBlocked = blocked ?? Boolean(target.blocked);
        check(ROLES.includes(nextRole) && typeof nextBlocked === "boolean", 400, "invalid_role", "Ungültige Benutzerstufe oder Sperrung.");
        if (target.role === "admin" && !target.blocked && (nextRole !== "admin" || nextBlocked)) {
          check(db.prepare("SELECT count(*) AS n FROM users WHERE role='admin' AND blocked=0").get().n > 1,
            409, "last_admin", "Die letzte aktive Administration muss erhalten bleiben.");
        }
        db.prepare("UPDATE users SET role=?,blocked=?,display_name=?,version=version+1 WHERE id=?")
          .run(nextRole, Number(nextBlocked), displayName === undefined ? target.display_name : short(displayName, 120, "Anzeigename"), id);
        if (nextBlocked) {
          db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
          db.prepare("UPDATE devices SET revoked=1 WHERE user_id=?").run(id);
        }
        audit(user, "user-updated", id);
        return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id));
      });
    },
    async changePassword(token, { currentPassword, newPassword } = {}) {
      const user = actor(token, ROLES, { write: true });
      check(await verifyPassword(currentPassword, user.password_hash), 401, "authentication_required", "Das bisherige Passwort stimmt nicht.");
      const hash = await hashPassword(newPassword);
      return transaction(() => {
        const fresh = actor(token, ROLES, { write: true });
        check(fresh.password_hash === user.password_hash, 409, "user_changed", "Das Passwort wurde inzwischen geändert.");
        db.prepare("UPDATE users SET password_hash=?,version=version+1 WHERE id=?").run(hash, user.id);
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
        db.prepare("UPDATE devices SET revoked=1 WHERE user_id=?").run(user.id);
        audit(user, "password-changed");
        return { changed: true, loginRequired: true };
      });
    },
    listObjects(token, { kind } = {}) {
      const user = actor(token);
      if (kind !== undefined) check(["species", "page"].includes(kind), 400, "invalid_object", "Unbekannter Objekttyp.");
      const readOnly = user.role === "reader" || user.scope === "read";
      const result = []; let bytes = 2048;
      for (const row of db.prepare(`SELECT * FROM objects WHERE (? IS NULL OR kind=?) ${readOnly ? "AND approved_revision IS NOT NULL" : ""} ORDER BY kind,id`)
        .iterate(kind ?? null, kind ?? null)) {
        const value = objectFor(user, row); bytes += Buffer.byteLength(JSON.stringify(value));
        check(bytes <= 4 * 1024 * 1024 && result.length < 1000, 413, "object_paging_required", "Dieser Bestand benötigt den begrenzten Seitenabruf.");
        result.push(value);
      }
      return result;
    },
    objectPage(token, { kind, snapshot, cursor, limit = 25, checkOnly = false } = {}) {
      check(kind === undefined || ["species", "page"].includes(kind), 400, "invalid_object", "Unbekannter Objekttyp.");
      check(Number.isInteger(limit) && limit >= 1 && limit <= 25 && typeof checkOnly === "boolean", 400, "invalid_paging", "Ungültige Abrufgrenze.");
      check(snapshot === undefined || /^[a-f0-9]{64}$/.test(snapshot), 400, "invalid_paging", "Ungültige Bestandskennung.");
      check(cursor === undefined || typeof cursor === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(cursor), 400, "invalid_paging", "Ungültige Fortsetzung.");
      return transaction(() => {
        const user = actor(token), projectId = db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value;
        const marker = digest(canonicalJson({ projectId, generation: db.prepare("SELECT value FROM meta WHERE key='objects_generation'").get().value,
          actor: user.id, version: user.version, role: user.role, scope: user.scope, session: user.session_hash, kind: kind ?? null }));
        check(snapshot === undefined || snapshot === marker, 409, "objects_snapshot_changed", "Bestand oder Berechtigung hat sich während des Abrufs geändert. Bitte erneut laden.");
        check(!checkOnly || snapshot !== undefined && cursor === undefined, 400, "invalid_paging", "Die Abschlussprüfung benötigt eine Bestandskennung.");
        let afterKind = "", afterId = "";
        if (cursor !== undefined) {
          let decoded; try { decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { /* checked below */ }
          check(snapshot === marker && Array.isArray(decoded) && decoded.length === 3 && decoded[0] === marker
            && ["species", "page"].includes(decoded[1]) && typeof decoded[2] === "string" && /^[a-z0-9-]{1,120}$/.test(decoded[2]),
          400, "invalid_paging", "Die Fortsetzung gehört nicht zu diesem Bestand.");
          [ , afterKind, afterId ] = decoded;
        }
        const readOnly = user.role === "reader" || user.scope === "read", visibility = readOnly ? "AND approved_revision IS NOT NULL" : "";
        const totalCount = db.prepare(`SELECT count(*) AS n FROM objects WHERE (? IS NULL OR kind=?) ${visibility}`).get(kind ?? null, kind ?? null).n;
        const result = { schemaVersion: 1, snapshot: marker, projectId, user: publicUser(user), totalCount,
          objects: [], nextCursor: null, complete: true, checked: checkOnly };
        if (checkOnly) return result;
        const rows = db.prepare(`SELECT * FROM objects WHERE (? IS NULL OR kind=?) ${visibility}
          AND (kind>? OR (kind=? AND id>?)) ORDER BY kind,id LIMIT ?`).all(kind ?? null, kind ?? null, afterKind, afterKind, afterId, limit + 1);
        let bytes = 2048;
        for (const row of rows) {
          if (result.objects.length === limit) { result.complete = false; break; }
          const value = objectFor(user, row), size = Buffer.byteLength(JSON.stringify(value));
          const rich = value.data?.type === "fn-species-record" && value.data.schemaVersion === 2;
          check(size <= (rich ? 4 * 1024 * 1024 + 16 * 1024 : 3 * 1024 * 1024), 413, "object_response_too_large", "Die einzelne Objektfassung überschreitet die Übertragungsgrenze.");
          // A rich record can fill its whole 4MiB data budget. It travels alone
          // with a bounded envelope; ordinary pages retain their 4MiB budget.
          if (bytes + size > 4 * 1024 * 1024 && result.objects.length) { result.complete = false; break; }
          result.objects.push(value); bytes += size;
        }
        if (!result.complete) {
          const last = result.objects.at(-1);
          result.nextCursor = Buffer.from(JSON.stringify([marker, last.kind, last.id])).toString("base64url");
        }
        return result;
      }, { readOnly: true });
    },
    getObject(token, kind, id) { return objectFor(actor(token), objectRow(kind, id)); },
    createObject(token, { kind, id, data, requireAdmin = false, boundSpeciesCreation = false, expectedProjectId, expectedUserId, expectedRole, expectedUserVersion } = {}) {
      check(typeof requireAdmin === "boolean", 400, "invalid_input", "Die Importberechtigung muss ausdrücklich angegeben sein.");
      check(typeof boundSpeciesCreation === "boolean" && (!boundSpeciesCreation || kind === "species" && data?.type === "fn-species-record" && data.schemaVersion === 1),
        400, "invalid_species_creation", "Die gebundene Artanlage benötigt einen vollständigen neuen Artentwurf.");
      identifier(kind, id); const serialized = payload(kind, id, data);
      return transaction(() => {
        const user = actor(token, requireAdmin ? ["admin"] : writers, { write: true });
        if (requireAdmin) check(expectedUserId === user.id && expectedProjectId === db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value,
          409, "import_project_changed", "Die Projekt- und Personenbindung des Imports stimmt nicht mehr überein.");
        if (boundSpeciesCreation) check(expectedUserId === user.id && expectedProjectId === db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value
          && expectedRole === user.role && Number.isSafeInteger(expectedUserVersion) && expectedUserVersion === user.version,
        409, "species_creation_changed", "Projekt, Person oder Berechtigung wurden seit der Artvorschau geändert. Es wurde keine Art angelegt.");
        check(!db.prepare("SELECT id FROM objects WHERE kind=? AND id=?").get(kind, id), 409, "object_exists", "Das Objekt ist bereits vorhanden.");
        if (kind === "species") {
          check(!(data.type === "fn-species-record" && data.schemaVersion === 2), 409, "species_record_adoption_required",
            "Eine redaktionelle Leserfassung wird ausschließlich aus einer vorhandenen Art und einem gespeicherten Seitenentwurf übernommen.");
          if (data.type === "fn-species-record") guardNewSpeciesIdentity(data);
          guardSpeciesRecordTransition({ objectId: id, before: null, next: JSON.parse(serialized) }); imageMedia.assertReferences(JSON.parse(serialized));
        }
        const evidence = kind === "page" ? altGuard(user, id, null, JSON.parse(serialized)) : [];
        const row = { kind, id, current_revision: null }, revision = insertVersion(user, row, serialized);
        db.prepare("INSERT INTO objects VALUES (?,?,?,NULL)").run(kind, id, revision);
        saveAltReceipts(user, id, revision, evidence);
        audit(user, "object-created", `${kind}/${id}`);
        return objectFor(user, objectRow(kind, id));
      });
    },
    submitChange(token, input = {}) {
      const enrichmentRequest = Object.hasOwn(input, "enrichment") ? validateSpeciesEnrichmentChange(input) : null;
      const { changeId, kind, id, baseRevision, data, intent, enrichment } = enrichmentRequest?.change ?? input;
      identifier(kind, id);
      check(typeof changeId === "string" && /^[A-Za-z0-9_-]{8,120}$/.test(changeId), 400, "invalid_change", "Eine stabile Änderungskennung ist erforderlich.");
      check(typeof baseRevision === "string" && baseRevision.length <= 80, 400, "invalid_revision", "Eine Ausgangsversion ist erforderlich.");
      const proof = intent === undefined ? undefined : validatePageEditorialIntent(intent);
      check(proof === undefined || kind === "species" && proof.sourceBindings.species.id === id
        && proof.sourceBindings.species.objectRevision === baseRevision, 400, "invalid_editorial_intent", "Die Übernahme ist nicht an diese Artfassung gebunden.");
      const submitted = enrichment ? null : payload(kind, id, data);
      const hash = enrichmentRequest?.requestHash
        ?? digest(transportJson({ kind, id, baseRevision, data: JSON.parse(submitted), ...(proof ? { intent: proof } : {}) }));
      return transaction(() => {
        const user = actor(token, writers, { write: true });
        const prior = db.prepare("SELECT * FROM changes WHERE author_id=? AND change_id=?").get(user.id, changeId);
        if (prior) {
          check(prior.request_hash === hash, 409, "change_id_reused", "Diese Änderungskennung gehört zu einem anderen Inhalt.");
          return { ...JSON.parse(prior.result), replayed: true };
        }
        // Offline changes deliberately cannot create an absent object.
        const row = objectRow(kind, id);
        if (enrichment) {
          const projectId = db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value;
          check(enrichment.actor.projectId === projectId && enrichment.actor.userId === user.id
            && enrichment.actor.role === user.role && enrichment.actor.userVersion === user.version && row.current_revision === baseRevision,
          409, "species_enrichment_changed", "Artfassung, Projekt oder Benutzerbindung wurde geändert. Der Vorschlag bleibt zur erneuten Prüfung erhalten.");
        }
        const base = version(kind, id, baseRevision);
        const projection = enrichment ? projectSpeciesEnrichment({ speciesObject: base, projectId: enrichment.actor.projectId,
          expectedSourceBindings: enrichment.sourceBindings, result: enrichment.result }) : null;
        if (projection) check(projection.complete && projection.changes.length > 0 && digest(objectJson(projection.data)) === enrichment.targetDataHash,
          409, "species_enrichment_review_changed", "Der Vorschlag entspricht nicht vollständig der geprüften Zielfassung. Bitte erneut prüfen.");
        const serialized = projection ? objectJson(projection.data) : submitted, proposed = JSON.parse(serialized);
        if (kind === "species") {
          if (proof) {
            const pageRow = objectRow("page", proof.sourceBindings.page.objectId);
            const projectId = db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value;
            verifyPageEditorialAdoption({ pageObject: objectFor(user, pageRow), speciesObject: base, projectId,
              actor: { id: user.id, projectId, role: user.role }, data: proposed, intent: proof });
          } else if (!projection) guardSpeciesRecordTransition({ objectId: id, before: base.data, next: proposed });
          imageMedia.assertReferences(proposed);
        }
        const evidence = kind === "page" ? altGuard(user, id, base.data, JSON.parse(serialized)) : [];
        let result;
        if (row.current_revision !== baseRevision) {
          const current = version(kind, id, row.current_revision), conflictId = randomUUID();
          db.prepare("INSERT INTO conflicts VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL)")
            .run(conflictId, kind, id, user.id, baseRevision, row.current_revision, objectJson(base.data), objectJson(current.data), serialized, iso());
          result = { status: "conflict", conflictId, currentRevision: row.current_revision };
          audit(user, "conflict-created", conflictId);
        } else {
          if (projection) enableSpeciesEnrichmentSchema(db);
          const revision = insertVersion(user, row, serialized);
          db.prepare("UPDATE objects SET current_revision=? WHERE kind=? AND id=?").run(revision, kind, id);
          if (projection) for (const slot of NORMAL_MEDIA_SLOTS) {
            const file = proposed.assets.files[slot];
            const before = base.data.assets.files[slot];
            if (file && !file.url && (file.sha256 !== before?.sha256 || file.bytes !== before.bytes)) {
              db.prepare("INSERT OR IGNORE INTO meta VALUES (?,'1')").run(enrichmentMediaKey(id, slot, file.sha256));
            }
          }
          saveAltReceipts(user, id, revision, evidence);
          result = { status: "applied", object: objectFor(user, objectRow(kind, id)) };
          audit(user, projection ? "species-enrichment-applied" : "object-updated", `${kind}/${id}`);
        }
        db.prepare("INSERT INTO changes VALUES (?,?,?,?)").run(user.id, changeId, hash, transportJson(result));
        return result;
      });
    },
    cancelChange(token, { changeId, requestHash } = {}) {
      check(typeof changeId === "string" && /^[A-Za-z0-9_-]{8,120}$/.test(changeId)
        && typeof requestHash === "string" && /^[a-f0-9]{64}$/.test(requestHash),
      400, "invalid_change", "Das Abschließen benötigt die genaue Änderungs- und Inhaltskennung.");
      return transaction(() => {
        const user = actor(token, writers, { write: true });
        const prior = db.prepare("SELECT * FROM changes WHERE author_id=? AND change_id=?").get(user.id, changeId);
        if (prior) {
          check(prior.request_hash === requestHash, 409, "change_id_reused", "Diese Änderungskennung gehört zu einem anderen Inhalt.");
          return { ...JSON.parse(prior.result), replayed: true };
        }
        // A durable tombstone and submitChange share the same write lock. Either
        // the original write wins, or every later exact retry remains cancelled.
        const result = { status: "cancelled", changeId };
        db.prepare("INSERT INTO changes VALUES (?,?,?,?)").run(user.id, changeId, requestHash, canonicalJson(result));
        audit(user, "change-cancelled", changeId);
        return result;
      });
    },
    approveObject(token, kind, id, { expectedRevision, requireAdmin = false, expectedProjectId, expectedUserId, expectedReview, readerCatalogVersion = 1, expectedReaderHash } = {}) {
      check(typeof requireAdmin === "boolean", 400, "invalid_input", "Die Importberechtigung muss ausdrücklich angegeben sein.");
      check(readerCatalogVersion === 1 || kind === "species" && readerCatalogVersion === 2,
        400, "invalid_approval_binding", "Die Leserfassung benötigt eine ausdrücklich unterstützte Katalogversion.");
      check(readerCatalogVersion !== 2 || expectedReview && typeof expectedReaderHash === "string" && /^[a-f0-9]{64}$/.test(expectedReaderHash),
        400, "invalid_approval_binding", "Die erweiterte Leserfreigabe benötigt ihre genaue Personenbindung und geprüfte Leserfassung.");
      check(expectedReview === undefined || expectedReview && typeof expectedReview === "object" && !Array.isArray(expectedReview)
        && Object.keys(expectedReview).sort().join(",") === "projectId,role,userId"
        && [expectedReview.projectId, expectedReview.userId, expectedReview.role].every((value) => typeof value === "string" && value.length > 0)
        && releasers.includes(expectedReview.role), 400, "invalid_approval_binding", "Die interne Freigabe benötigt eine vollständige Projekt-, Personen- und Rollenbindung.");
      return transaction(() => {
        const user = actor(token, requireAdmin ? ["admin"] : releasers, { write: true }), row = objectRow(kind, id);
        if (expectedReview) check(expectedReview.projectId === db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value
          && expectedReview.userId === user.id && expectedReview.role === user.role, 409, "approval_review_changed",
        "Projekt, Person oder Rolle stimmen nicht mehr mit der geprüften internen Freigabe überein. Alle Entwürfe bleiben erhalten.");
        if (requireAdmin) check(expectedUserId === user.id && expectedProjectId === db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value,
          409, "import_project_changed", "Die Projekt- und Personenbindung der internen Freigabe stimmt nicht mehr überein.");
        check(row.current_revision === expectedRevision, 409, "object_changed", "Vor der Freigabe bitte die neue Version prüfen.");
        const current = version(kind, id, row.current_revision);
        if (kind === "species") {
          if (readerCatalogVersion === 2) {
            const reader = readerCatalog.requireReady(token, current.data);
            check(digest(canonicalJson(reader, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 })) === expectedReaderHash,
              409, "approval_review_changed", "Die Leserfassung oder Medienbereitstellung wurde seit der Vorschau geändert. Bitte neu prüfen.");
          }
          else {
            projectSpeciesRecordToCatalog(current.data);
            requireEnrichmentMedia(token, current.data);
          }
        }
        if (current.data.type === WEBSITE_ALT_TYPE) check(current.websiteAltEvidence?.trusted === true, 409, "website_alt_adoption_required", "Unverknüpfte Bildtextfreigaben müssen vor einer internen Lesefreigabe ausdrücklich übernommen werden.");
        if (current.data.type === PAGE_AUTHORING_TYPE) check(current.data.approval && current.pageAuthoringEvidence?.trusted === true,
          409, "page_approval_required", "Ein Artseitenentwurf benötigt seine aktive serverbelegte fachliche Endfreigabe.");
        if (row.approved_revision !== expectedRevision) {
          db.prepare("UPDATE objects SET approved_revision=? WHERE kind=? AND id=?").run(expectedRevision, kind, id);
          if (kind === "species") db.prepare("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='catalog_revision'").run();
          audit(user, "object-approved", `${kind}/${id}`);
        }
        return { ...objectFor(user, objectRow(kind, id)), internalOnly: true, externalPublication: "not-performed" };
      });
    },
    listConflicts(token) {
      actor(token, writers, { write: true });
      return db.prepare("SELECT * FROM conflicts ORDER BY created_at,id").all().map(conflictData);
    },
    getConflict(token, id) {
      actor(token, writers, { write: true });
      const row = db.prepare("SELECT * FROM conflicts WHERE id=?").get(id);
      check(row, 404, "conflict_not_found", "Der Konflikt ist nicht vorhanden.");
      return conflictData(row);
    },
    resolveConflict(token, id, { expectedRevision, strategy, data, expectedProjectId, expectedUserId, expectedRole } = {}) {
      check(["current", "proposed", "merged"].includes(strategy), 400, "invalid_resolution", "Bitte eine Konfliktentscheidung wählen.");
      const decisionBound = [expectedProjectId, expectedUserId, expectedRole].some((value) => value !== undefined);
      check(!decisionBound || [expectedProjectId, expectedUserId, expectedRole].every((value) => typeof value === "string" && value.length > 0)
        && writers.includes(expectedRole), 400, "invalid_conflict_binding", "Die Konfliktentscheidung benötigt eine vollständige Projekt-, Personen- und Rollenbindung.");
      return transaction(() => {
        const user = actor(token, writers, { write: true }), conflict = db.prepare("SELECT * FROM conflicts WHERE id=?").get(id);
        if (decisionBound) check(expectedProjectId === db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value
          && expectedUserId === user.id && expectedRole === user.role, 409, "conflict_review_changed",
        "Projekt, Person oder Rolle stimmen nicht mehr mit der geprüften Konfliktentscheidung überein. Alle Fassungen bleiben erhalten.");
        check(conflict, 404, "conflict_not_found", "Der Konflikt ist nicht vorhanden.");
        check(!conflict.resolved_at, 409, "conflict_resolved", "Der Konflikt ist bereits entschieden.");
        const row = objectRow(conflict.kind, conflict.object_id);
        check(row.current_revision === expectedRevision, 409, "object_changed", "Das Objekt wurde inzwischen erneut geändert.");
        let revision = row.current_revision;
        if (strategy !== "current") {
          const serialized = strategy === "proposed" ? conflict.proposed_data : payload(row.kind, row.id, data);
          if (row.kind === "species") {
            const before = version(row.kind, row.id, row.current_revision).data, next = JSON.parse(serialized);
            check(!(next?.type === "fn-species-record" && next.schemaVersion === 2)
              || before.schemaVersion === 2 && canonicalJson(before.editorial, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 })
                === canonicalJson(next.editorial, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 }),
            409, "editorial_adoption_review_required", "Die redaktionelle Übernahme muss mit der aktuellen Art und Seite neu geprüft werden. Alle Fassungen bleiben erhalten.");
            guardSpeciesRecordTransition({ objectId: row.id, before, next });
          }
          const evidence = row.kind === "page" ? altGuard(user, row.id, version(row.kind, row.id, row.current_revision).data, JSON.parse(serialized)) : [];
          revision = insertVersion(user, row, serialized);
          db.prepare("UPDATE objects SET current_revision=? WHERE kind=? AND id=?").run(revision, row.kind, row.id);
          saveAltReceipts(user, row.id, revision, evidence);
        }
        db.prepare("UPDATE conflicts SET resolved_at=?,resolved_by=?,resolution=?,resulting_revision=? WHERE id=?")
          .run(iso(), user.id, strategy, revision, id);
        audit(user, "conflict-resolved", id);
        return { conflict: conflictData(db.prepare("SELECT * FROM conflicts WHERE id=?").get(id)), object: objectFor(user, objectRow(row.kind, row.id)) };
      });
    },
    catalog(token) {
      return transaction(() => {
        actor(token);
        const species = db.prepare(`SELECT v.data FROM objects o JOIN versions v ON v.revision=o.approved_revision
          WHERE o.kind='species' ORDER BY o.id`).all().map((row) => projectSpeciesRecordToCatalog(JSON.parse(row.data)));
        return buildCatalog({ revision: db.prepare("SELECT value FROM meta WHERE key='catalog_revision'").get().value, generatedAt: iso(), species });
      }, { readOnly: true });
    },
    close() { pairings.clear(); db.close(); }
  };
}
