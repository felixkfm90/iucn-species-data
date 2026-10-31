import { createHash } from "node:crypto";
import { validateWebsiteAltPageRecord, websiteAltPageRevision } from "../website-alt-store.mjs";
import { normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { validateWebsiteAltObject, validateWebsiteAltRemoteObject, websiteAltObjectId } from "./website-alt-sync.mjs";
import { canonical, fingerprint, fields, identifier, digest, text } from "../page-authoring/contract.mjs";
import { validateStoredDocument, encodePageAuthoringDraft, pageImagesHash } from "../page-authoring/shared.mjs";
import { normalizeAssetMetadata } from "../page-authoring/model.mjs";
import { composePage } from "../page-authoring/compose.mjs";

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SECRET_KEY = /password|credential|secret|authorization|cookie|bearer|apikey|privatekey|token/i;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const check = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (a, b) => canonical(a) === canonical(b);
const tuple = (...values) => JSON.stringify(values);
function tick(context) {
  context.signal?.throwIfAborted();
  check(context.deadline === undefined || Date.now() < context.deadline, "Die Journalprüfung hat ihr Zeitlimit erreicht.");
}
function checkedContext(input = {}) {
  check(/^device-[a-f0-9-]{36}$/.test(input.deviceId || "") && Array.isArray(input.projectIds)
    && input.projectIds.length <= 1000, "Die vertrauenswürdige Geräte-/Projektbindung fehlt.");
  input.projectIds.forEach(identifier); tick(input); return { ...input, projectIds: [...new Set(input.projectIds)].sort() };
}
function noCredentials(value, depth = 0) {
  check(depth <= 40, "Der Journalinhalt ist zu tief verschachtelt.");
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    const url = new URL(value);
    check(!url.username && !url.password && ![...url.searchParams.keys()].some((key) => SECRET_KEY.test(key.replace(/[_-]/g, ""))
      || /signature|x-amz|x-goog/i.test(key)), "Private Zugangsparameter gehören nicht in ein gemeinsames Journalbackup.");
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    check(!SECRET_KEY.test(key.replace(/[_-]/g, "")), "Anmelde-/Tokenfelder gehören nicht in ein gemeinsames Journalbackup.");
    noCredentials(item, depth + 1);
  }
}
function json(value, maxBytes = 32 * 1024 * 1024) {
  check(typeof value === "string" && Buffer.byteLength(value) <= maxBytes, "Ein gespeicherter Journalwert ist unlesbar oder zu groß.");
  const parsed = JSON.parse(value); noCredentials(parsed); return parsed;
}
function date(value) { text(value, 80); check(Number.isFinite(Date.parse(value)), "Ungültiger gespeicherter Journalzeitpunkt."); }
function schema(db, version, applicationId, columns, context) {
  check(db.prepare("PRAGMA user_version").get().user_version === version
    && db.prepare("PRAGMA application_id").get().application_id === applicationId, "Unbekannte Journalversion oder Anwendungskennung.");
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
  check(equal(tables, Object.keys(columns).sort()), "Unbekannte oder fehlende Journaltabelle.");
  check(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type IN ('view','trigger') OR type='index' AND sql IS NOT NULL LIMIT 1").get(),
    "Das Journal enthält unbekannte zusätzliche SQL-Objekte.");
  for (const table of tables) {
    check(db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name).join(",") === columns[table], "Unbekannte Journalspalten.");
    for (const row of db.prepare(`SELECT * FROM "${table}"`).iterate()) {
      tick(context);
      for (const [key, value] of Object.entries(row)) if (key.endsWith("_json") && value !== null) json(value);
    }
  }
}
function bindProject(projectId, context, collected) {
  identifier(projectId); check(context.projectIds.includes(projectId), "Das Journal enthält ein nicht gebundenes Projekt."); collected.add(projectId);
}

/** Recorded journal work only. A live local-page comparison is deliberately not fabricated. */
export function validateWebsiteAltJournal(db, input) {
  const context = checkedContext(input), projects = new Set();
  schema(db, 1, 0, { links: "key,origin,project_id,user_id,page_url,object_id,base_local_hash,last_remote_revision,remote_json,state",
    operations: "id,link_key,phase,local_hash,frame_json,local_page_json,remote_revision,error_code,created_at" }, context);
  const states = new Set(["creating", "linked", "unrelated", "queued", "conflict", "local-changed", "pulled"]);
  const phases = new Set(["captured", "link-intent", "local-import-intent", "resolution-intent", "queued", "linked", "initial-conflict", "shared", "locally-imported", "resolved"]);
  const terminal = new Set(["linked", "initial-conflict", "shared", "locally-imported", "resolved"]);
  const links = new Map(); let pending = 0, conflicts = 0, operationCount = 0;
  for (const row of db.prepare("SELECT * FROM links ORDER BY key").iterate()) {
    tick(context); bindProject(row.project_id, context, projects); identifier(row.user_id);
    const origin = new URL(row.origin);
    check((origin.protocol === "https:" || origin.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname))
      && origin.origin === row.origin && !origin.username && !origin.password && !origin.search && !origin.hash,
    "Die gespeicherte Projektadresse enthält keine gültige öffentliche Dienstbindung.");
    check(normalizeWebsitePageUrl(row.page_url) === row.page_url && row.object_id === websiteAltObjectId(row.page_url)
      && row.key === sha(`${row.origin}\n${row.project_id}\n${row.user_id}\n${row.page_url}`) && HASH.test(row.base_local_hash)
      && states.has(row.state), "Die gespeicherte Bildtextseite ist nicht eindeutig an Projekt, Person und Seite gebunden.");
    if (row.remote_json === null) check(row.state === "creating" && row.last_remote_revision === null, "Die gemeinsame Ausgangsfassung fehlt.");
    else {
      const remote = json(row.remote_json); validateWebsiteAltRemoteObject(remote, row.page_url);
      check(UUID.test(remote.revision) && UUID.test(row.last_remote_revision)
        && (row.state === "pulled" || row.last_remote_revision === remote.revision), "Die gespeicherte gemeinsame Ausgangsversion ist widersprüchlich.");
    }
    links.set(row.key, row); if (row.state !== "linked") pending++; if (["conflict", "unrelated"].includes(row.state)) conflicts++;
  }
  for (const row of db.prepare("SELECT * FROM operations ORDER BY rowid").iterate()) {
    tick(context); operationCount++; const link = links.get(row.link_key);
    check(link && UUID.test(row.id) && phases.has(row.phase) && HASH.test(row.local_hash), "Ein Bildtextauftrag besitzt keine gültige Seiten-/Phasenbindung."); date(row.created_at);
    const local = validateWebsiteAltPageRecord(json(row.local_page_json)), frame = json(row.frame_json);
    validateWebsiteAltObject(frame, link.object_id);
    check(local.url === link.page_url && websiteAltPageRevision(local) === row.local_hash && frame.pageUrl === link.page_url,
      "Die lokale Bildtextfassung oder ihr gewünschter gemeinsamer Stand ist verändert.");
    check(terminal.has(row.phase) ? UUID.test(row.remote_revision) : row.remote_revision === null, "Die Bildtextquittung besitzt keine gültige gemeinsame Revision.");
    check(row.error_code === null || /^[a-zA-Z0-9_-]{1,100}$/.test(row.error_code), "Der gespeicherte Bildtextfehler ist nicht lesbar gebunden.");
  }
  return { projectIds: [...projects].sort(), pending, counts: { linkedPages: links.size, recordedOpenPages: pending, conflicts, historicalOperations: operationCount,
    linksRequiringLocalComparison: links.size }, coverage: { scope: "recorded-journal-only", localStateKnown: false,
    localComparisonRequired: links.size > 0, sharedQueueIncluded: false, authorityRevalidated: false } };
}

const AUTHORING_COLUMNS = Object.freeze({
  drafts: "project_id,id,path,head,sequence", versions: "project_id,draft_id,revision,sequence,parent_revision,body_hash,body_json,actor_id,created_at",
  mutations: "project_id,actor_id,mutation_id,intent_hash,result_json", artifacts: "project_id,draft_id,id,kind,revision,payload_json,actor_id,created_at",
  cms_attempts: "project_id,draft_id,id,revision,plan_id,actor_id,status,state_revision,state_json",
  cms_receipts: "project_id,attempt_id,receipt_id,payload_hash,payload_json",
});
const CMS_STATES = new Set(["prepared", "dispatched", "saved-unpublished", "uncertain", "failed"]);
function draftValue(row, document, current = false) {
  return { id: row.draft_id, projectId: row.project_id, revision: row.revision, sequence: row.sequence, parentRevision: row.parent_revision,
    contentHash: row.body_hash, document, actorId: row.actor_id, createdAt: row.created_at, current };
}
function receipt(value, attempt, plan) {
  fields(value, ["id", "attemptId", "planHash", "contentHash", "imagesHash", "status", "pageId", "path", "unpublished", "readbackStructureHash", "observedAt", "reason"]);
  identifier(value.id); date(value.observedAt);
  check(["saved-unpublished", "uncertain", "failed"].includes(value.status) && value.attemptId === attempt.id && value.planHash === plan.planHash
    && value.contentHash === plan.contentHash && value.imagesHash === plan.imagesHash && value.path === plan.target.path && value.unpublished === true,
  "Die CMS-Quittung gehört nicht zum unveröffentlichten gebundenen Auftrag.");
  if (value.reason !== undefined) text(value.reason, 1000, true);
  if (value.status === "saved-unpublished") { identifier(value.pageId); check(value.readbackStructureHash === plan.structureHash, "Die CMS-Rückleseprüfung ist widersprüchlich."); }
  else {
    if (value.pageId) identifier(value.pageId);
    if (value.readbackStructureHash !== undefined) check(value.readbackStructureHash === "" || HASH.test(value.readbackStructureHash), "Unbekannter CMS-Rücklesewert.");
  }
}

/** Database/metadata verification only; external photo/audio bytes are not present in this repository. */
export function validatePageAuthoringJournal(db, input) {
  const context = checkedContext(input), projects = new Set(), heads = new Map(), versions = new Map(), artifacts = new Map(), attempts = new Map(), media = new Map();
  schema(db, 0, 0x464e5041, AUTHORING_COLUMNS, context);
  for (const row of db.prepare("SELECT * FROM drafts ORDER BY project_id,id").iterate()) {
    tick(context); bindProject(row.project_id, context, projects); identifier(row.id); digest(row.head);
    check(Number.isSafeInteger(row.sequence) && row.sequence >= 1, "Die Artseiten-Versionsfolge ist ungültig."); heads.set(tuple(row.project_id, row.id), row);
  }
  const lastVersions = new Map();
  for (const row of db.prepare("SELECT * FROM versions ORDER BY project_id,draft_id,sequence").iterate()) {
    tick(context); bindProject(row.project_id, context, projects); identifier(row.actor_id); date(row.created_at);
    const key = tuple(row.project_id, row.draft_id), prior = lastVersions.get(key), document = validateStoredDocument(json(row.body_json, 2 * 1024 * 1024));
    check(heads.has(key) && row.sequence === (prior?.sequence ?? 0) + 1 && row.parent_revision === (prior?.revision ?? null)
      && row.body_hash === fingerprint(document) && row.revision === fingerprint({ projectId: row.project_id, id: row.draft_id,
        sequence: row.sequence, parent: row.parent_revision, bodyHash: row.body_hash, actorId: row.actor_id }), "Der Artseitenverlauf ist unvollständig oder verändert.");
    for (const asset of [...Object.values(document.species.normalAssets).filter(Boolean), ...document.images.map((image) => image.asset)]) {
      normalizeAssetMetadata(asset, row.project_id); media.set(tuple(asset.projectId, asset.id, asset.sha256), asset);
    }
    const metadata = { ...row, body_json: undefined };
    versions.set(tuple(row.project_id, row.draft_id, row.revision), metadata); lastVersions.set(key, metadata);
    const head = heads.get(key); if (head.head === row.revision) check(head.path === `${document.parentPath}/${document.slug}` && head.sequence === row.sequence,
      "Der Artseitenkopf gehört nicht zur gespeicherten Zielseite.");
  }
  for (const [key, head] of heads) check(lastVersions.get(key)?.revision === head.head && lastVersions.get(key)?.sequence === head.sequence, "Die aktuelle Artseitenfassung fehlt.");
  function version(projectId, draftId, revision) {
    const row = versions.get(tuple(projectId, draftId, revision)); check(row, "Eine Journalentscheidung verweist auf eine fremde oder fehlende Seitenversion.");
    const body = db.prepare("SELECT body_json FROM versions WHERE project_id=? AND draft_id=? AND revision=?").get(projectId, draftId, revision).body_json;
    return draftValue(row, json(body, 2 * 1024 * 1024), heads.get(tuple(projectId, draftId)).head === revision);
  }
  for (const row of db.prepare("SELECT * FROM artifacts ORDER BY rowid").iterate()) {
    tick(context); bindProject(row.project_id, context, projects); identifier(row.actor_id); date(row.created_at);
    check(UUID.test(row.id) && ["preview", "approval", "cms-plan"].includes(row.kind), "Unbekannte Artseitenentscheidung.");
    const value = version(row.project_id, row.draft_id, row.revision), payload = json(row.payload_json);
    const record = { ...row, payload_json: undefined, payload }; artifacts.set(tuple(row.project_id, row.id), record);
    if (row.kind === "preview") {
      fields(payload, ["schemaVersion", "revision", "contentHash", "imagesHash", "templateHash", "speciesBindingHash", "structureHash", "previewHash", "findings", "technicalReady", "editorialReview", "modelReview", "publicVerification", "reportHash"]);
      const { reportHash, ...body } = payload; digest(payload.structureHash); digest(payload.previewHash);
      check(payload.schemaVersion === 1 && payload.revision === row.revision && payload.contentHash === value.contentHash && payload.imagesHash === pageImagesHash(value.document)
        && payload.templateHash === value.document.templateHash && payload.speciesBindingHash === fingerprint(value.document.species) && reportHash === fingerprint(body)
        && payload.structureHash === fingerprint(composePage(value, new Map()).structure)
        && Array.isArray(payload.findings) && payload.technicalReady === !payload.findings.some((finding) => finding.blocking)
        && payload.editorialReview === "human-required" && payload.modelReview === "not-performed" && payload.publicVerification === "not-performed",
      "Der Artseiten-Prüfbericht ist verändert.");
      for (const finding of payload.findings) { fields(finding, ["code", "message", "blocking", "id"]); text(finding.message, 1000);
        check(["section_missing", "gallery_missing", "normal_asset_missing", "runtime_species_missing", "media_changed", "media_format_mismatch", "media_preview_budget", "media_missing", "alt_missing"].includes(finding.code)
          && typeof finding.blocking === "boolean", "Ungültiger gespeicherter Seitenhinweis."); if (finding.id !== null) identifier(finding.id); }
    } else if (row.kind === "approval") {
      encodePageAuthoringDraft(value, { approval: payload });
      check([...artifacts.values()].some((other) => other.project_id === row.project_id && other.draft_id === row.draft_id && other.kind === "preview"
        && other.revision === row.revision && other.payload.reportHash === payload.reportHash && other.payload.previewHash === payload.previewHash), "Die menschliche Artseitenfreigabe besitzt keinen passenden gespeicherten Prüfbericht.");
    } else {
      fields(payload, ["schemaVersion", "draftId", "revision", "contentHash", "imagesHash", "approvalHash", "reportHash", "structureHash", "structure", "target", "publish", "automaticRetry", "requiresObservedEditorAdapter", "steps", "planHash"]);
      const { planHash, ...body } = payload, structure = composePage(value, new Map()).structure;
      fields(payload.target, ["path", "exists", "parentPath", "parentExists", "online", "observationId", "checkedAt"]); identifier(payload.target.observationId); date(payload.target.checkedAt);
      check(payload.schemaVersion === 1 && payload.draftId === row.draft_id && payload.revision === row.revision && payload.contentHash === value.contentHash
        && payload.imagesHash === pageImagesHash(value.document) && planHash === fingerprint(body) && equal(payload.structure, structure)
        && payload.structureHash === fingerprint(structure) && payload.target.path === structure.path && payload.target.parentPath === value.document.parentPath
        && payload.target.exists === false && payload.target.parentExists === true && payload.target.online === true && payload.publish === false
        && payload.automaticRetry === false && payload.requiresObservedEditorAdapter === true,
      "Der unveröffentlichte CMS-Plan ist nicht an die gespeicherte Artseite gebunden.");
      const steps = [{ action: "confirm-new-target", path: payload.target.path, observationId: payload.target.observationId },
        { action: "create-unpublished-page", title: value.document.title, path: payload.target.path },
        ...structure.slots.map((slot, index) => ({ action: "insert-observed-editor-block", index, slot })),
        { action: "save-unpublished" }, { action: "readback-and-compare", expectedStructureHash: payload.structureHash }, { action: "record-adapter-receipt" }];
      check(equal(payload.steps, steps) && [...artifacts.values()].some((other) => other.project_id === row.project_id && other.draft_id === row.draft_id
        && other.kind === "approval" && other.revision === row.revision && other.payload.approvalHash === payload.approvalHash
        && other.payload.reportHash === payload.reportHash), "Der CMS-Plan besitzt keine passende menschliche Freigabe oder Schrittbindung.");
    }
  }
  function attemptState(state, row) {
    fields(state, ["id", "draftId", "revision", "planId", "actorId", "status", "createdAt", "receipt", "repeatAllowed", "dispatchedAt", "dispatchId", "receiptHash", "updatedAt", "uncertainty"]);
    date(state.createdAt);
    check(UUID.test(state.id) && state.id === row.id && state.draftId === row.draft_id && state.revision === row.revision
      && state.planId === row.plan_id && state.actorId === row.actor_id && CMS_STATES.has(state.status) && state.repeatAllowed === false,
    "Der gespeicherte CMS-Auftrag ist nicht eindeutig gebunden.");
    const plan = artifacts.get(tuple(row.project_id, row.plan_id));
    check(plan?.kind === "cms-plan" && plan.draft_id === row.draft_id && plan.revision === row.revision, "Der CMS-Auftrag besitzt keinen passenden gespeicherten Plan.");
    if (state.dispatchedAt !== undefined || state.dispatchId !== undefined) { date(state.dispatchedAt); identifier(state.dispatchId); }
    if (["prepared", "dispatched"].includes(state.status)) check(state.receipt === null && state.receiptHash === undefined, "Ein noch offener CMS-Auftrag enthält eine widersprüchliche Quittung.");
    if (state.status === "prepared") check(state.dispatchedAt === undefined && state.dispatchId === undefined, "Ein vorbereiteter CMS-Auftrag behauptet bereits einen Start.");
    if (state.status === "dispatched" || state.status === "saved-unpublished") check(state.dispatchedAt !== undefined, "Der bestätigte CMS-Start fehlt.");
    if (state.receipt !== null) { receipt(state.receipt, state, plan.payload); check(state.receiptHash === fingerprint(state.receipt), "Die CMS-Quittung wurde verändert."); date(state.updatedAt); }
    else check(["prepared", "dispatched"].includes(state.status), "Der abgeschlossene CMS-Auftrag hat keine Quittung.");
    if (state.uncertainty !== undefined) check(["conflicting-receipts", "receipt-before-dispatch"].includes(state.uncertainty), "Unbekannter CMS-Klärungsgrund.");
    return plan;
  }
  const draftAttempts = new Set();
  for (const row of db.prepare("SELECT * FROM cms_attempts ORDER BY rowid").iterate()) {
    tick(context); bindProject(row.project_id, context, projects); identifier(row.actor_id); version(row.project_id, row.draft_id, row.revision);
    const state = json(row.state_json), key = tuple(row.project_id, row.draft_id);
    check(!draftAttempts.has(key) && row.status === state.status && row.state_revision === fingerprint(state), "Der CMS-Zustand ist doppelt oder verändert.");
    draftAttempts.add(key); attemptState(state, row); attempts.set(tuple(row.project_id, row.id), { ...row, state, receipts: [] });
  }
  for (const row of db.prepare("SELECT * FROM cms_receipts ORDER BY rowid").iterate()) {
    tick(context); bindProject(row.project_id, context, projects);
    const attempt = attempts.get(tuple(row.project_id, row.attempt_id)), value = json(row.payload_json);
    check(attempt && value.id === row.receipt_id && row.payload_hash === fingerprint(value), "Eine CMS-Quittung gehört zu keinem passenden Auftrag.");
    receipt(value, attempt.state, artifacts.get(tuple(row.project_id, attempt.plan_id)).payload); attempt.receipts.push({ id: row.receipt_id, hash: row.payload_hash, value });
  }
  for (const attempt of attempts.values()) {
    const state = attempt.state; let status = state.dispatchedAt === undefined ? "prepared" : "dispatched", previous = null, uncertainty;
    const seen = [];
    for (const item of attempt.receipts) {
      const success = item.value.status === "saved-unpublished";
      const conflict = seen.some((prior) => prior.id === item.id && prior.hash !== item.hash)
        || previous && previous.hash !== item.hash && (status === "saved-unpublished" || success);
      if (conflict) uncertainty = "conflicting-receipts";
      else if (success && status !== "dispatched") uncertainty = "receipt-before-dispatch";
      status = conflict || success && status !== "dispatched" ? "uncertain" : item.value.status;
      seen.push(item); previous = item;
    }
    check(state.status === status && (previous ? state.receiptHash === previous.hash && equal(state.receipt, previous.value) : state.receipt === null)
      && state.uncertainty === uncertainty, "Der letzte CMS-Zustand passt nicht zum erhaltenen Quittungsverlauf.");
  }
  const committedVersions = new Set(), committedArtifacts = new Set(), preparedAttempts = new Set(), dispatchedAttempts = new Set();
  for (const row of db.prepare("SELECT * FROM mutations ORDER BY rowid").iterate()) {
    tick(context); bindProject(row.project_id, context, projects); identifier(row.actor_id); identifier(row.mutation_id); digest(row.intent_hash);
    const result = json(row.result_json); check(result?.idempotentReplay === false, "Eine lokale Auftragsquittung ist nicht lesbar gebunden.");
    const kinds = ["draft", "artifact", "attempt"].filter((name) => result[name]); check(kinds.length === 1, "Unbekannte lokale Auftragsquittung.");
    if (result.draft) {
      fields(result, ["draft", "unchanged", "idempotentReplay"]); const value = result.draft;
      fields(value, ["id", "projectId", "revision", "sequence", "parentRevision", "contentHash", "document", "actorId", "createdAt", "current"]);
      const saved = version(row.project_id, value.id, value.revision);
      check(value.projectId === row.project_id && typeof result.unchanged === "boolean" && typeof value.current === "boolean"
        && equal({ ...value, current: false }, { ...saved, current: false }), "Die Entwurfsquittung gehört zu keiner erhaltenen Seitenfassung.");
      if (!result.unchanged) { const key = tuple(row.project_id, value.id, value.revision);
        check(value.actorId === row.actor_id && !committedVersions.has(key), "Doppelte oder fremde Entstehungsquittung einer Seitenfassung."); committedVersions.add(key); }
    } else if (result.artifact) {
      fields(result, ["artifact", "idempotentReplay"]); const value = result.artifact, saved = artifacts.get(tuple(row.project_id, value.id));
      fields(value, ["id", "kind", "draftId", "revision", "payload", "actorId", "createdAt"]);
      check(saved && value.actorId === row.actor_id && equal(value, { id: saved.id, kind: saved.kind, draftId: saved.draft_id,
        revision: saved.revision, payload: saved.payload, actorId: saved.actor_id, createdAt: saved.created_at }), "Die Entscheidungsquittung gehört zu keinem erhaltenen Artefakt.");
      const key = tuple(row.project_id, value.id); check(!committedArtifacts.has(key), "Doppelte Entscheidungsquittung."); committedArtifacts.add(key);
    } else {
      fields(result, ["attempt", "idempotentReplay"]); const { stateRevision, ...value } = result.attempt, saved = attempts.get(tuple(row.project_id, value.id));
      check(saved && value.actorId === row.actor_id && ["prepared", "dispatched"].includes(value.status) && stateRevision === fingerprint(value), "Die CMS-Auftragsquittung ist verändert.");
      attemptState(value, saved);
      const key = tuple(row.project_id, value.id), collection = value.status === "prepared" ? preparedAttempts : dispatchedAttempts;
      check(!collection.has(key) && value.createdAt === saved.state.createdAt && (value.status !== "dispatched"
        || value.dispatchId === saved.state.dispatchId && value.dispatchedAt === saved.state.dispatchedAt), "Doppelte oder fremde CMS-Ausführungsquittung."); collection.add(key);
    }
  }
  check([...versions.keys()].every((key) => committedVersions.has(key)) && [...artifacts.keys()].every((key) => committedArtifacts.has(key))
    && [...attempts.entries()].every(([key, value]) => preparedAttempts.has(key) && (value.state.dispatchedAt === undefined || dispatchedAttempts.has(key))),
  "Ein gespeicherter Journalstand besitzt keine vollständigen dauerhaft gebundenen Auftragsquittungen.");
  const pendingDrafts = new Set(); let unapproved = 0, openCms = 0, staleCms = 0, savedUnpublished = 0, currentSavedUnpublished = 0;
  for (const [key, head] of heads) {
    if (![...artifacts.values()].some((entry) => entry.project_id === head.project_id && entry.draft_id === head.id && entry.kind === "approval" && entry.revision === head.head)) {
      pendingDrafts.add(key); unapproved++;
    }
  }
  for (const attempt of attempts.values()) {
    const key = tuple(attempt.project_id, attempt.draft_id), current = heads.get(key).head === attempt.revision;
    if (attempt.status !== "saved-unpublished") { openCms++; pendingDrafts.add(key); }
    if (!current) { staleCms++; pendingDrafts.add(key); }
    if (attempt.status === "saved-unpublished") { savedUnpublished++; if (current) currentSavedUnpublished++; }
  }
  return { projectIds: [...projects].sort(), pending: pendingDrafts.size, counts: { drafts: heads.size, versions: versions.size,
    draftsWithoutCurrentApproval: unapproved, openCmsAttempts: openCms, staleCmsAttempts: staleCms,
    savedUnpublished, currentSavedUnpublished, unpublishedDrafts: heads.size, referencedMedia: media.size },
  coverage: { scope: "authoring-database-and-media-references-only", mediaBytesIncluded: false, sharedSyncKnown: false,
    authorityRevalidated: false, publicVerificationPerformed: false },
  requiredMedia: [...media.values()].map(({ projectId, id, sha256, bytes, mimeType }) => ({ projectId, id, sha256, bytes, mimeType })) };
}
