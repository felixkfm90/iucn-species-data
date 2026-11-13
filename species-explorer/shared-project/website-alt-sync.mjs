import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { validateWebsiteAltPageRecord, websiteAltPageRevision } from "../website-alt-store.mjs";
import { normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { objectJson } from "./security.mjs";
import { check, ProjectError } from "./errors.mjs";

export const WEBSITE_ALT_TYPE = "website-alt-page";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const hash = websiteAltPageRevision;
const copy = (value) => JSON.parse(JSON.stringify(value));
const privileged = (role) => ["admin", "publisher"].includes(role);
const clientBinding = ({ origin, projectId, userId, role, userVersion }) => ({ baseUrl: origin, projectId, userId, role, userVersion });

export function websiteAltObjectId(pageUrl) { return `website-alt-${sha(normalizeWebsitePageUrl(pageUrl))}`; }
export function encodeWebsiteAltPage(page, { adoptUnlinkedApprovals = false } = {}) {
  const checked = validateWebsiteAltPageRecord(page);
  const bindings = checked.images.filter((image) => image.approval).map((image) => ({ imageKey: image.key, sourceUrl: image.sourceUrl,
    approvalRevision: image.approval.revision, approvalObservationHash: image.approval.observationHash }));
  const result = { type: WEBSITE_ALT_TYPE, schemaVersion: 1, title: checked.title.slice(0, 500), pageUrl: checked.url,
    pageRevision: hash(checked), page: checked, bindings, adoptUnlinkedApprovals: adoptUnlinkedApprovals === true };
  objectJson(result); return result;
}
export function validateWebsiteAltObject(data, objectId) {
  check(data && data.type === WEBSITE_ALT_TYPE && data.schemaVersion === 1 && typeof data.adoptUnlinkedApprovals === "boolean"
    && Object.keys(data).every((key) => ["type", "schemaVersion", "title", "pageUrl", "pageRevision", "page", "bindings", "adoptUnlinkedApprovals"].includes(key)),
  400, "invalid_website_alt_page", "Ungültiges gemeinsames Bildtextformat.");
  let page;
  try { page = validateWebsiteAltPageRecord(data.page); }
  catch { throw new ProjectError(400, "invalid_website_alt_page", "Bild-, Freigabe-, Beobachtungs- oder Historienbindung ist ungültig."); }
  check(data.pageUrl === page.url && data.pageRevision === hash(page) && data.title === page.title.slice(0, 500)
    && (!objectId || websiteAltObjectId(page.url) === objectId), 409, "website_alt_identity_mismatch", "Die Bildtextseite ist nicht an die kanonische URL und Objektkennung gebunden.");
  const expected = encodeWebsiteAltPage(page, { adoptUnlinkedApprovals: data.adoptUnlinkedApprovals });
  check(hash(data.bindings) === hash(expected.bindings), 409, "website_alt_binding_mismatch", "Die Freigaben gehören nicht zu den angegebenen Bildverwendungen.");
  objectJson(data); return page;
}
function receiptMatches(receipt, image, kind) {
  return receipt.kind === kind && receipt.imageKey === image.key && receipt.sourceUrl === image.sourceUrl
    && receipt.approvalRevision === image.approval?.revision && receipt.approvalObservationHash === image.approval?.observationHash
    && privileged(receipt.actorRole) && (kind !== "verification" || receipt.observationHash === image.observationHash
      && receipt.verificationHash === hash(image.verification));
}
function hasDecision(history, image, includeApproval = true) {
  return history.some((entry) => (!includeApproval || entry.approval?.revision === image.approval?.revision)
    && (!image.verification || entry.verification && hash(entry.verification) === hash(image.verification)));
}

/** Called only inside the server's actual authenticated object transaction. */
export function guardWebsiteAltTransition({ objectId, before, next, actorRole, receipts = [] }) {
  check(!objectId.startsWith("website-alt-") || next?.type === WEBSITE_ALT_TYPE, 409, "website_alt_type_changed", "Der reservierte Seitenbereich benötigt das validierte Bildtextformat.");
  if (before?.type !== WEBSITE_ALT_TYPE && next?.type !== WEBSITE_ALT_TYPE) return [];
  check(next?.type === WEBSITE_ALT_TYPE, 409, "website_alt_type_changed", "Ein gemeinsamer Bildtextstand darf nicht in ein ungeprüftes Seitenformat umgewandelt werden.");
  const page = validateWebsiteAltObject(next, objectId), previous = before?.type === WEBSITE_ALT_TYPE ? validateWebsiteAltObject(before, objectId) : null;
  if (previous) {
    check(previous.url === page.url && (!previous.checkedAt || page.checkedAt && Date.parse(page.checkedAt) >= Date.parse(previous.checkedAt)),
      409, "website_alt_stale_scan", "Ein älterer Scan darf die jüngere gemeinsame Bildgrundlage nicht ersetzen.");
    for (const old of previous.images) {
      const image = page.images.find((entry) => entry.key === old.key);
      check(image, 409, "website_alt_history_lost", "Frühere Bildverwendungen müssen mit ihrem Verlauf erhalten bleiben.");
      const hashes = new Set(image.history.map(hash));
      check(old.history.every((entry) => hashes.has(hash(entry))), 409, "website_alt_history_lost", "Historische Nachweise dürfen nicht überschrieben oder entfernt werden.");
      if (old.approval && old.approval.revision !== image.approval?.revision) check(hasDecision(image.history, old), 409, "website_alt_history_lost", "Die bisherige Freigabe und ihre Nachweise müssen in der Historie bleiben.");
      if (old.verification && (!image.verification || hash(old.verification) !== hash(image.verification))) check(hasDecision(image.history, old), 409, "website_alt_history_lost", "Der bisherige öffentliche Nachweis muss erhalten bleiben.");
      if (old.status === "removed" && image.status !== "removed") check(page.checkedAt && previous.checkedAt
        && Date.parse(page.checkedAt) > Date.parse(previous.checkedAt), 409, "website_alt_stale_scan", "Ein entferntes Bild benötigt vor der Wiederkehr eine neuere Erfassung.");
    }
  }
  const created = [];
  for (const image of page.images) {
    if (!image.approval) continue;
    const old = previous?.images.find((entry) => entry.key === image.key);
    if (!privileged(actorRole)) {
      check(old?.approval?.revision === image.approval.revision && image.draftText === old.draftText && image.draftDecorative === old.draftDecorative,
        403, "website_alt_approval_required", "Eine neue oder wieder aktivierte Freigabe benötigt Redaktion mit Freigaberecht.");
      check(!image.verification || old.verification && hash(old.verification) === hash(image.verification),
        403, "website_alt_verification_required", "Ein neuer oder erneut aktivierter öffentlicher Nachweis muss berechtigt geprüft werden.");
    }
    if (!receipts.some((entry) => receiptMatches(entry, image, "approval"))) {
      check(privileged(actorRole) && next.adoptUnlinkedApprovals, 403, "website_alt_adoption_required",
        "Eine bisher unverknüpfte Freigabe benötigt die ausdrückliche Übernahme durch Administration oder Redaktion mit Freigabe.");
      created.push({ kind: "approval", imageKey: image.key, sourceUrl: image.sourceUrl, approvalRevision: image.approval.revision,
        approvalObservationHash: image.approval.observationHash, observationHash: image.observationHash, verificationHash: null,
        origin: image.approval.method === "website-standard" ? "observed-standard-adopted" : "existing-decision-adopted" });
    }
    if (image.verification && !receipts.some((entry) => receiptMatches(entry, image, "verification"))) {
      check(privileged(actorRole), 403, "website_alt_verification_required", "Ein neuer öffentlicher Erfolgsnachweis benötigt eine berechtigte geprüfte Übernahme.");
      created.push({ kind: "verification", imageKey: image.key, sourceUrl: image.sourceUrl, approvalRevision: image.approval.revision,
        approvalObservationHash: image.approval.observationHash, observationHash: image.observationHash,
        verificationHash: hash(image.verification), origin: "public-html-evidence-adopted" });
    }
  }
  return created;
}

export function websiteAltServerEvidence({ objectId, objectRevision, data, receipts }) {
  const page = validateWebsiteAltObject(data, objectId), selected = [];
  for (const image of page.images) {
    if (!image.approval) continue;
    const approval = receipts.find((entry) => receiptMatches(entry, image, "approval"));
    if (!approval) return { schemaVersion: 1, trusted: false, objectId, objectRevision, pageRevision: data.pageRevision, receipts: [] };
    selected.push(approval);
    if (image.verification) {
      const verification = receipts.find((entry) => receiptMatches(entry, image, "verification"));
      if (!verification) return { schemaVersion: 1, trusted: false, objectId, objectRevision, pageRevision: data.pageRevision, receipts: [] };
      selected.push(verification);
    }
  }
  return { schemaVersion: 1, trusted: true, objectId, objectRevision, pageRevision: data.pageRevision, receipts: selected };
}

export function validateWebsiteAltRemoteObject(object, pageUrl) {
  const id = websiteAltObjectId(pageUrl), page = validateWebsiteAltObject(object?.data, id), evidence = object.websiteAltEvidence;
  check(object.kind === "page" && object.id === id && page.url === normalizeWebsitePageUrl(pageUrl) && evidence?.schemaVersion === 1
    && evidence.trusted === true && evidence.objectId === id && evidence.objectRevision === object.revision && evidence.pageRevision === object.data.pageRevision
    && Array.isArray(evidence.receipts), 409, "website_alt_untrusted_record", "Der fremde Prüfstand besitzt keine konkrete serverseitige Freigabebindung.");
  const checked = websiteAltServerEvidence({ objectId: id, objectRevision: object.revision, data: object.data, receipts: evidence.receipts });
  check(checked.trusted, 409, "website_alt_untrusted_record", "Freigabe- oder öffentliche Nachweise gehören nicht zu diesem Bild-/Seitenstand.");
  return page;
}

export function retainWebsiteAltHistory(target, baseline, at = new Date().toISOString()) {
  const page = validateWebsiteAltPageRecord(target), previous = validateWebsiteAltPageRecord(baseline);
  check(page.url === previous.url && (!previous.checkedAt || page.checkedAt && Date.parse(page.checkedAt) >= Date.parse(previous.checkedAt)),
    409, "website_alt_stale_scan", "Die ältere Bildgrundlage muss vor einer Übernahme erneut geprüft werden.");
  for (const old of previous.images) {
    let image = page.images.find((entry) => entry.key === old.key);
    if (!image) {
      check(page.checkedAt && previous.checkedAt && Date.parse(page.checkedAt) > Date.parse(previous.checkedAt), 409, "website_alt_stale_scan", "Nicht mehr enthaltene Bilder benötigen eine neuere Erfassung.");
      image = copy(old); image.status = "removed"; image.approval = null; image.verification = null; page.images.push(image);
    }
    const entries = [...old.history, ...image.history];
    const state = (value) => ({ status: value.status, draftText: value.draftText, draftDecorative: value.draftDecorative, draftSavedAt: value.draftSavedAt,
      draftNote: value.draftNote || "", approval: value.approval, verification: value.verification });
    if (hash(state(old)) !== hash(state(image))) entries.push({ at, reason: "Frühere gemeinsame Fassung erhalten", ...state(old) });
    const seen = new Set(); image.history = entries.filter((entry) => { const key = hash(entry); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  return validateWebsiteAltPageRecord(page);
}

/** Explicit per-page bridge. The caller supplies only synthetic stores in tests. */
export function createWebsiteAltSync({ localStore, client, filename, localStorageConfirmed = false } = {}) {
  check(localStore && ["exportPage", "exportPages", "authorizeSharedPageImport", "importSharedPage"].every((key) => typeof localStore[key] === "function")
    && client && ["status", "getObject", "editExistingObject", "refresh", "sync", "createObject", "listConflicts", "resolveConflict"].every((key) => typeof client[key] === "function"),
  400, "invalid_website_alt_sync", "Die Bildtextanbindung benötigt kontrollierte lokale und gemeinsame Adapter.");
  check(localStorageConfirmed === true && typeof filename === "string" && path.isAbsolute(filename)
    && !/^(?:\\\\|\/\/|file:)/i.test(filename), 400, "unsafe_storage", "Ein persönliches lokales Bildtextjournal ist erforderlich.");
  let probe = path.parse(filename).root;
  for (const part of path.relative(probe, filename).split(path.sep)) { probe = path.join(probe, part); if (fs.existsSync(probe)) check(!fs.lstatSync(probe).isSymbolicLink(), 400, "unsafe_storage", "Verknüpfte Journalpfade sind nicht zulässig."); }
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  try {
    fs.chmodSync(filename, 0o600);
    const schema = db.prepare("PRAGMA user_version").get().user_version;
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
    const columns = { links: "key,origin,project_id,user_id,page_url,object_id,base_local_hash,last_remote_revision,remote_json,state",
      operations: "id,link_key,phase,local_hash,frame_json,local_page_json,remote_revision,error_code,created_at" };
    const knownTables = tables.join(",") === "links,operations";
    if (![0, 1].includes(schema) || schema === 1 && !knownTables || tables.length && !knownTables
      || knownTables && tables.some(name => db.prepare(`PRAGMA table_info(${name})`).all().map(row => row.name).join(",") !== columns[name])) {
      throw new ProjectError(409, "website_alt_journal_schema", "Das persönliche Bildtextjournal hat ein unbekanntes Format; es bleibt unverändert.");
    }
    db.exec(`PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS links(key TEXT PRIMARY KEY,origin TEXT NOT NULL,project_id TEXT NOT NULL,user_id TEXT NOT NULL,
        page_url TEXT NOT NULL,object_id TEXT NOT NULL,base_local_hash TEXT,last_remote_revision TEXT,remote_json TEXT,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,link_key TEXT NOT NULL,phase TEXT NOT NULL,local_hash TEXT,
        frame_json TEXT,local_page_json TEXT,remote_revision TEXT,error_code TEXT,created_at TEXT NOT NULL);
      PRAGMA user_version=1; COMMIT;
    `);
  } catch (error) {
    db.close();
    throw error;
  }
  let chain = Promise.resolve(), active = 0, closing = false, closed = false, currentBinding = null, latest = null;
  const now = () => new Date().toISOString();
  function tx(fn) { db.exec("BEGIN IMMEDIATE"); try { const result = fn(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } }
  function run(fn) {
    if (closing || closed) return Promise.reject(new ProjectError(409, "website_alt_sync_closed", "Die gemeinsame Bildtextanbindung ist geschlossen."));
    active++;
    const result = chain.then(() => { check(!closing, 409, "website_alt_sync_closed", "Die gemeinsame Bildtextanbindung wird geschlossen."); return fn(); })
      .catch((error) => {
        if (error.code === "import_project_changed") throw new ProjectError(409, "website_alt_binding_changed", error.message);
        throw error;
      }).finally(() => { active--; });
    chain = result.catch(() => {}); return result;
  }
  async function context({ online = false, write = false, recheck = false } = {}) {
    const status = await client.status();
    check(status.user && status.projectId && status.baseUrl && !["disconnected", "authentication-required", "closed"].includes(status.connection), 401, "authentication_required", "Bitte am gemeinsamen Projekt anmelden.");
    if (online) check(status.connection === "online", 409, "website_alt_online_required", "Für diesen Bildtextschritt wird eine bestätigte Onlineverbindung benötigt.");
    if (write) check(!status.readOnlySession && (status.connection !== "forbidden" || recheck) && ["admin", "publisher", "contributor"].includes(status.user.role), 403, "forbidden", "Für diesen Bildtextstand fehlt eine volle redaktionelle Anmeldung.");
    currentBinding = { origin: status.baseUrl, projectId: status.projectId, userId: status.user.id, role: status.user.role, userVersion: status.user.version }; return currentBinding;
  }
  function keyFor(binding, pageUrl) { return sha(`${binding.origin}\n${binding.projectId}\n${binding.userId}\n${normalizeWebsitePageUrl(pageUrl)}`); }
  function linked(binding, pageUrl) {
    const value = db.prepare("SELECT * FROM links WHERE key=?").get(keyFor(binding, pageUrl));
    check(value, 409, "website_alt_not_linked", "Diese Seite ist für Server, Projekt und Person noch nicht ausdrücklich verknüpft."); return value;
  }
  async function local(pageUrl, expectedPageRevision) {
    const exported = await localStore.exportPage({ pageUrl });
    check(expectedPageRevision === undefined || expectedPageRevision === exported.pageRevision, 409, "website_alt_local_changed", "Die lokale Seite wurde seit der Anzeige verändert."); return exported;
  }
  function saveOperation(link, phase, exported, frame) {
    const id = randomUUID(); db.prepare("INSERT INTO operations(id,link_key,phase,local_hash,frame_json,local_page_json,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(id, link.key, phase, exported?.pageRevision ?? null, frame ? JSON.stringify(frame) : null, exported?.page ? JSON.stringify(exported.page) : null, now()); return id;
  }
  async function remote(pageUrl, requiredBinding) {
    const object = await client.getObject("page", websiteAltObjectId(pageUrl), { serverOnly: true, requiredBinding });
    validateWebsiteAltRemoteObject(object, pageUrl); return object;
  }
  async function requireSameOnlineEditor(binding) {
    const current = await context({ write: true, online: true });
    check(current.origin === binding.origin && current.projectId === binding.projectId && current.userId === binding.userId
      && current.role === binding.role && current.userVersion === binding.userVersion,
      409, "website_alt_binding_changed", "Projekt, Person oder Redaktionsrechte haben sich geändert. Bitte neu vergleichen.");
    check(!closing, 409, "website_alt_sync_closed", "Der gemeinsame Bildtextabgleich wird geschlossen.");
  }
  function readStatus() {
    if (closed) return { ...(latest || { pages: [], pending: null, conflictCount: null }), busy: false, closed: true };
    if (!currentBinding && db.prepare("SELECT count(*) AS n FROM links").get().n) return { schemaVersion: 1, busy: active > 0, closed: false,
      binding: null, pending: null, conflictCount: null, localStateUnchecked: true, pages: [], externalPublication: "not-performed" };
    const rows = currentBinding ? db.prepare("SELECT * FROM links WHERE origin=? AND project_id=? AND user_id=? ORDER BY page_url")
      .all(currentBinding.origin, currentBinding.projectId, currentBinding.userId) : [];
    return { schemaVersion: 1, busy: active > 0, closed: false, binding: currentBinding ? { origin: currentBinding.origin, projectId: currentBinding.projectId, userId: currentBinding.userId } : null,
      pending: rows.length ? null : 0,
      conflictCount: rows.filter((row) => ["conflict", "unrelated"].includes(row.state)).length,
      localStateUnchecked: rows.length > 0, pages: rows.map((row) => ({ pageUrl: row.page_url, objectId: row.object_id, remoteRevision: row.last_remote_revision, state: row.state })),
      externalPublication: "not-performed" };
  }
  async function inspectLocal() {
    if (!db.prepare("SELECT count(*) AS n FROM links").get().n) return { ...readStatus(), busy: active > 1 };
    await context(); const state = readStatus(), exported = await localStore.exportPages({ pageUrls: state.pages.map((row) => row.pageUrl) });
    for (const row of state.pages) {
      const link = linked(currentBinding, row.pageUrl), page = exported.pages.find((entry) => entry.pageUrl === row.pageUrl);
      row.localPageRevision = page?.pageRevision ?? null; row.localChanged = !page || page.pageRevision !== link.base_local_hash;
      if (row.localChanged && !["queued", "creating", "conflict", "unrelated", "pulled"].includes(row.state)) row.state = "local-changed";
    }
    state.pending = state.pages.filter((row) => row.localChanged || ["queued", "creating", "local-changed", "pulled", "unrelated"].includes(row.state)).length;
    state.localStateUnchecked = false; state.busy = active > 1; latest = copy(state); return state;
  }
  async function queueLocal({ pageUrl, expectedPageRevision, adoptUnlinkedApprovals = false } = {}, owner) {
    const binding = owner ?? await context({ write: true });
    const link = linked(binding, pageUrl), exported = await local(pageUrl, expectedPageRevision), requiredBinding = clientBinding(binding);
    check(!["unrelated", "conflict", "pulled"].includes(link.state), 409, "website_alt_review_required", "Gemeinsame und lokale Fassungen müssen vor dem nächsten Versand gezielt entschieden werden.");
    const cached = await client.getObject("page", link.object_id, { requiredBinding }), baseline = link.remote_json ? JSON.parse(link.remote_json) : null;
    check(baseline && baseline.revision === link.last_remote_revision, 409, "website_alt_untrusted_record", "Die belegte gemeinsame Ausgangsversion fehlt.");
    const page = retainWebsiteAltHistory(exported.page, baseline.data.page), frame = encodeWebsiteAltPage(page, { adoptUnlinkedApprovals });
    guardWebsiteAltTransition({ objectId: link.object_id, before: baseline.data, next: frame, actorRole: binding.role, receipts: baseline.websiteAltEvidence?.receipts || [] });
    const operation = saveOperation(link, "captured", exported, frame);
    if (!(cached.localPending && hash(cached.data) === hash(frame))) await client.editExistingObject("page", link.object_id, frame,
      { baseRevision: link.last_remote_revision, expectedDataHash: sha(objectJson(cached.data)), requiredBinding });
    tx(() => { db.prepare("UPDATE operations SET phase='queued' WHERE id=?").run(operation); db.prepare("UPDATE links SET state='queued' WHERE key=?").run(link.key); });
    return { operationId: operation, pageUrl: exported.pageUrl, queued: true, publiclyVerifiedBySync: false };
  }
  function lastQueued(link) {
    return db.prepare("SELECT * FROM operations WHERE link_key=? AND phase='queued' ORDER BY rowid DESC LIMIT 1").get(link.key);
  }
  function confirmShared(link, object, operation, currentLocalRevision) {
    const saved = operation?.local_hash ?? link.base_local_hash;
    const synced = currentLocalRevision === saved;
    tx(() => {
      db.prepare("UPDATE links SET base_local_hash=?,last_remote_revision=?,remote_json=?,state=? WHERE key=?")
        .run(saved, object.revision, JSON.stringify(object), synced ? "linked" : "local-changed", link.key);
      if (operation) {
        // Earlier local captures are retained without assigning them this receipt.
        db.prepare("UPDATE operations SET phase='shared',remote_revision=?,error_code=NULL WHERE id=?").run(object.revision, operation.id);
        db.prepare("UPDATE operations SET phase='captured',error_code='newer-frame-confirmed' WHERE link_key=? AND phase='queued'").run(link.key);
      }
    });
    return synced;
  }
  return {
    status: readStatus,
    backupProjectIds: () => run(() => db.prepare("SELECT DISTINCT project_id FROM links ORDER BY project_id").all().map(row => row.project_id)),
    snapshot() { if (active || closing || closed) return Promise.resolve(readStatus()); return run(inspectLocal); },
    read: (pageUrl) => run(async () => {
      const binding = await context(), exported = await local(pageUrl), link = db.prepare("SELECT * FROM links WHERE key=?").get(keyFor(binding, pageUrl));
      const state = link?.state === "linked" && exported.pageRevision !== link.base_local_hash ? "local-changed" : link?.state ?? "unlinked";
      return { ...exported, linked: Boolean(link), remote: link?.remote_json ? JSON.parse(link.remote_json) : null, state };
    }),
    link: (input = {}) => run(async () => {
      check(input.confirmed === true, 400, "website_alt_link_confirmation", "Die gemeinsame Seitenverknüpfung muss ausdrücklich bestätigt werden.");
      check(typeof input.expectedPageRevision === "string", 400, "website_alt_review_required", "Die angezeigte lokale Seitenfassung fehlt.");
      const binding = await context({ write: true, recheck: true }), exported = await local(input.pageUrl, input.expectedPageRevision), id = websiteAltObjectId(exported.pageUrl), key = keyFor(binding, exported.pageUrl);
      const frame = encodeWebsiteAltPage(exported.page, { adoptUnlinkedApprovals: input.adoptUnlinkedApprovals === true });
      let link = db.prepare("SELECT * FROM links WHERE key=?").get(key);
      if (!link) { db.prepare("INSERT INTO links VALUES (?,?,?,?,?,?,?,NULL,NULL,'creating')").run(key, binding.origin, binding.projectId, binding.userId, exported.pageUrl, id, exported.pageRevision); link = linked(binding, exported.pageUrl); }
      const operation = saveOperation(link, "link-intent", exported, frame);
      await client.refresh();
      await requireSameOnlineEditor(binding);
      const requiredBinding = clientBinding(binding);
      let object;
      try { object = await remote(exported.pageUrl, requiredBinding); }
      catch (error) {
        if (error.status !== 404) throw error;
        await requireSameOnlineEditor(binding);
        guardWebsiteAltTransition({ objectId: id, before: null, next: frame, actorRole: binding.role });
        object = await client.createObject({ kind: "page", id, data: frame, requiredBinding }); validateWebsiteAltRemoteObject(object, exported.pageUrl);
      }
      await requireSameOnlineEditor(binding);
      const equal = object.data.pageRevision === exported.pageRevision;
      tx(() => { db.prepare("UPDATE links SET last_remote_revision=?,remote_json=?,state=? WHERE key=?").run(object.revision, JSON.stringify(object), equal ? "linked" : "unrelated", key);
        db.prepare("UPDATE operations SET phase=?,remote_revision=? WHERE id=?").run(equal ? "linked" : "initial-conflict", object.revision, operation); });
      return { pageUrl: exported.pageUrl, linked: true, reviewRequired: !equal, remoteRevision: object.revision, externalPublication: "not-performed" };
    }),
    queue: (input) => run(() => queueLocal(input)),
    reconcileAfterProjectSync: (expected) => run(async () => {
      const binding = await context({ write: true, online: true });
      if (!expected || binding.origin !== expected.baseUrl || binding.projectId !== expected.projectId || binding.userId !== expected.user?.id
        || binding.role !== expected.user?.role || binding.userVersion !== expected.user?.version) return { checked: false };
      const links = db.prepare("SELECT * FROM links WHERE origin=? AND project_id=? AND user_id=? AND state='queued' ORDER BY page_url")
        .all(binding.origin, binding.projectId, binding.userId);
      let confirmed = 0, conflicts = 0;
      for (const link of links) {
        const operation = lastQueued(link);
        if (!operation) continue;
        const object = await remote(link.page_url, clientBinding(binding));
        const latest = await local(link.page_url);
        await requireSameOnlineEditor(binding);
        if (object.localConflict) {
          db.prepare("UPDATE links SET state='conflict' WHERE key=?").run(link.key); conflicts++;
        } else if (!object.localPending) {
          if (object.data.pageRevision === JSON.parse(operation.frame_json).pageRevision) {
            confirmShared(link, object, operation, latest.pageRevision); confirmed++;
          } else if (object.revision !== link.last_remote_revision) {
            db.prepare("UPDATE links SET last_remote_revision=?,remote_json=?,state='unrelated' WHERE key=?")
              .run(object.revision, JSON.stringify(object), link.key); conflicts++;
          }
        }
      }
      return { checked: true, confirmed, conflicts };
    }),
    sync: (input = {}) => run(async () => {
      const binding = await context({ write: true }), link = linked(binding, input.pageUrl);
      const requiredBinding = clientBinding(binding);
      const exported = await local(input.pageUrl, input.expectedPageRevision), operation = lastQueued(link);
      check(operation || ["linked", "local-changed"].includes(link.state), 409, "website_alt_not_queued", "Die gespeicherte lokale Fassung muss zuerst dauerhaft in die Clientwarteschlange übernommen werden.");
      if (exported.pageRevision !== (operation?.local_hash ?? link.base_local_hash)) await queueLocal({ ...input, expectedPageRevision: exported.pageRevision }, binding);
      check(!closing, 409, "website_alt_sync_closed", "Der Abgleich wurde vor dem nächsten Netzschritt angehalten.");
      try { await client.sync({ kind: "page", id: link.object_id, requiredBinding }); }
      catch (error) { db.prepare("UPDATE operations SET error_code=? WHERE link_key=? AND phase='queued'").run(error.code || "sync-not-confirmed", link.key); throw error; }
      const conflicts = (await client.listConflicts({ requiredBinding })).filter((entry) => entry.kind === "page" && entry.objectId === link.object_id);
      await requireSameOnlineEditor(binding);
      if (conflicts.length) { db.prepare("UPDATE links SET state='conflict' WHERE key=?").run(link.key); return { pageUrl: link.page_url, synced: false, conflict: true, externalPublication: "not-performed" }; }
      const object = await remote(link.page_url, requiredBinding), final = await local(link.page_url), last = lastQueued(link);
      await requireSameOnlineEditor(binding);
      check(!last || object.data.pageRevision === JSON.parse(last.frame_json).pageRevision, 409, "website_alt_not_confirmed", "Die gemeinsame Version entspricht nicht der gespeicherten Seitenfassung.");
      if (!last && object.revision !== link.last_remote_revision) {
        db.prepare("UPDATE links SET remote_json=?,state='pulled' WHERE key=?").run(JSON.stringify(object), link.key);
        return { pageUrl: link.page_url, synced: false, requiresExplicitImport: true, remoteRevision: object.revision, externalPublication: "not-performed" };
      }
      const synced = confirmShared(link, object, last, final.pageRevision);
      return { pageUrl: link.page_url, synced, remoteRevision: object.revision, publiclyVerifiedBySync: false, externalPublication: "not-performed" };
    }),
    pull: (input = {}) => run(async () => {
      const binding = await context({ write: true, recheck: true }), link = linked(binding, input.pageUrl);
      await client.refresh(); const object = await remote(link.page_url, clientBinding(binding));
      await requireSameOnlineEditor(binding);
      check(link.state !== "queued" && link.state !== "conflict", 409, "website_alt_review_required", "Eigene wartende Fassungen müssen vor einer lokalen Übernahme entschieden werden.");
      db.prepare("UPDATE links SET remote_json=?,state='pulled' WHERE key=?").run(JSON.stringify(object), link.key);
      return { pageUrl: link.page_url, remote: object, requiresExplicitImport: true };
    }),
    importRemote: (input = {}) => run(async () => {
      check(input.confirmed === true, 400, "website_alt_import_confirmation", "Die lokale Übernahme muss ausdrücklich bestätigt werden.");
      check(typeof input.expectedPageRevision === "string", 400, "website_alt_review_required", "Die angezeigte lokale Seitenfassung fehlt.");
      check(typeof input.expectedRemoteRevision === "string" && input.expectedRemoteRevision.length > 0, 400,
        "website_alt_review_required", "Die angezeigte gemeinsame Seitenfassung fehlt.");
      const binding = await context({ write: true, recheck: true }), link = linked(binding, input.pageUrl);
      check(link.remote_json && ["pulled", "linked"].includes(link.state), 409, "website_alt_review_required", "Bitte den gemeinsamen Stand zuerst ausdrücklich laden und vergleichen.");
      const shown = await local(link.page_url, input.expectedPageRevision);
      check(JSON.parse(link.remote_json).revision === input.expectedRemoteRevision, 409, "object_changed", "Die angezeigte gemeinsame Version wurde inzwischen geändert.");
      await client.refresh();
      await requireSameOnlineEditor(binding);
      const object = await remote(link.page_url, clientBinding(binding));
      check(object.revision === input.expectedRemoteRevision, 409, "object_changed", "Die angezeigte gemeinsame Version wurde inzwischen geändert.");
      const page = validateWebsiteAltRemoteObject(object, link.page_url);
      const operation = saveOperation(link, "local-import-intent", shown, object.data);
      const ticket = await localStore.authorizeSharedPageImport({ page, validateEvidence: () => ({ serverValidated: true, pageUrl: page.url, pageRevision: hash(page) }) });
      let result;
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await local(link.page_url, shown.pageRevision);
        await requireSameOnlineEditor(binding);
        try { result = await localStore.importSharedPage({ revision: current.localRevision, pageUrl: page.url, expectedPageRevision: shown.pageRevision, page, validatedEvidence: ticket }); break; }
        catch (error) { if (error.statusCode !== 409 || attempt === 2) throw error; }
      }
      tx(() => { db.prepare("UPDATE links SET base_local_hash=?,last_remote_revision=?,state='linked' WHERE key=?").run(result.pageRevision, object.revision, link.key);
        db.prepare("UPDATE operations SET phase='locally-imported',remote_revision=? WHERE id=?").run(object.revision, operation); });
      return { pageUrl: page.url, localRevision: result.revision, pageRevision: result.pageRevision, imported: true, publicCheckPerformed: false };
    }),
    conflicts: (pageUrl) => run(async () => {
      const binding = await context(), link = linked(binding, pageUrl), exported = await local(pageUrl);
      if (link.state === "unrelated") return [{ id: `initial-${link.key}`, type: "initial-link", base: null, current: JSON.parse(link.remote_json).data, proposed: encodeWebsiteAltPage(exported.page), objectId: link.object_id }];
      return (await client.listConflicts({ requiredBinding: clientBinding(binding) })).filter((entry) => entry.kind === "page" && entry.objectId === link.object_id);
    }),
    resolve: (input = {}) => run(async () => {
      check(typeof input.expectedPageRevision === "string", 400, "website_alt_review_required", "Die angezeigte lokale Seitenfassung fehlt.");
      const binding = await context({ write: true }), link = linked(binding, input.pageUrl), exported = await local(link.page_url, input.expectedPageRevision);
      const requiredBinding = clientBinding(binding);
      check(["conflict", "unrelated", "pulled"].includes(link.state), 409, "website_alt_review_required", "Für diese Seite liegt keine offene Vergleichsentscheidung vor.");
      if (link.state === "conflict") check((await client.listConflicts({ requiredBinding })).some((entry) => entry.id === input.conflictId && entry.kind === "page" && entry.objectId === link.object_id),
        409, "website_alt_foreign_conflict", "Die Konfliktentscheidung gehört zu einer anderen Seite.");
      check(input.confirmed === true && ["current", "local", "merged"].includes(input.strategy), 400, "website_alt_resolution_confirmation", "Die beiden Fassungen müssen gezielt verglichen und entschieden werden.");
      await client.refresh();
      await requireSameOnlineEditor(binding);
      const object = await remote(link.page_url, requiredBinding);
      check(object.revision === input.expectedRemoteRevision, 409, "object_changed", "Die angezeigte gemeinsame Version wurde inzwischen geändert.");
      if (input.strategy === "current") {
        if (link.state === "conflict") await client.resolveConflict(input.conflictId, { strategy: "current", expectedRevision: object.revision, requiredBinding });
        await requireSameOnlineEditor(binding);
        db.prepare("UPDATE links SET remote_json=?,state='pulled' WHERE key=?").run(JSON.stringify(object), link.key);
        return { requiresExplicitImport: true, remoteRevision: object.revision };
      }
      const chosen = input.strategy === "merged" ? input.page : exported.page, page = retainWebsiteAltHistory(chosen, object.data.page);
      const frame = encodeWebsiteAltPage(page, { adoptUnlinkedApprovals: input.adoptUnlinkedApprovals === true });
      guardWebsiteAltTransition({ objectId: link.object_id, before: object.data, next: frame, actorRole: binding.role, receipts: object.websiteAltEvidence.receipts });
      const operation = saveOperation(link, "resolution-intent", exported, frame);
      let resolved;
      if (link.state === "conflict") {
        resolved = await client.resolveConflict(input.conflictId, { strategy: "merged", data: frame, expectedRevision: object.revision, requiredBinding });
      } else {
        const cached = await client.getObject("page", link.object_id, { requiredBinding });
        await client.editExistingObject("page", link.object_id, frame, { baseRevision: object.revision, expectedDataHash: sha(objectJson(cached.data)), requiredBinding });
        await client.sync({ kind: "page", id: link.object_id, requiredBinding });
        resolved = await remote(link.page_url, requiredBinding);
      }
      validateWebsiteAltRemoteObject(resolved, link.page_url);
      await requireSameOnlineEditor(binding);
      if (link.state !== "conflict") {
        if (resolved.localConflict) db.prepare("UPDATE links SET state='conflict' WHERE key=?").run(link.key);
        check(!resolved.localConflict && !resolved.localPending && resolved.data.pageRevision === frame.pageRevision, 409,
          "website_alt_review_required", "Die gewählte Fassung wurde nicht bestätigt. Bitte die aktuellen Fassungen erneut vergleichen.");
      }
      tx(() => { db.prepare("UPDATE links SET remote_json=?,state='pulled' WHERE key=?").run(JSON.stringify(resolved), link.key);
        db.prepare("UPDATE operations SET phase='resolved',remote_revision=? WHERE id=?").run(resolved.revision, operation); });
      return { requiresExplicitImport: true, remoteRevision: resolved.revision, externalPublication: "not-performed" };
    }),
    async close() { if (closed) return; closing = true; await chain; latest = readStatus(); db.close(); closed = true; }
  };
}
