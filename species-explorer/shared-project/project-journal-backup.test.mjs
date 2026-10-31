import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createManagedTempSession } from "../temp-session.mjs";
import { createWebsiteAltStore } from "../website-alt-store.mjs";
import { createWebsiteAltSync, websiteAltServerEvidence, websiteAltObjectId } from "./website-alt-sync.mjs";
import { fixture as authoringFixture, CLOCK } from "../page-authoring/test-fixture.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";
import { createDeviceBackupProvider, validateDeviceBackupCopy } from "./device-backup.mjs";
import { validateWebsiteAltJournal, validatePageAuthoringJournal } from "./project-journal-backup.mjs";

const DEVICE = "device-ec2d31f7-0485-4a04-96c4-b40e233b126a", PAGE = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen";
const context = { deviceId: DEVICE, projectIds: ["project-a", "project-b"] };
const sha = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
function inspect(filename, validate, options = context) {
  const db = new DatabaseSync(filename, { readOnly: true }); try { return validate(db, options); } finally { db.close(); }
}
function modify(filename, fn) { const db = new DatabaseSync(filename); try { db.exec("PRAGMA foreign_keys=OFF;"); fn(db); } finally { db.close(); } }
async function fileHashes(filename) {
  const records = [];
  for (const name of [filename, filename + "-wal"]) records.push({ name, hash: await fs.readFile(name).then(sha).catch((error) => { if (error.code === "ENOENT") return null; throw error; }) });
  return records;
}
async function altFixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "journal-alt-")), filename = path.join(root, "website-alt-sync.sqlite");
  const local = createWebsiteAltStore({ dataRoot: path.join(root, "local-data"), now: () => new Date(CLOCK) });
  const src = "https://images.squarespace-cdn.com/content/v1/fixture/athen.jpg";
  await local.mergeScan({ pages: [{ url: PAGE, title: "Athen", checkedAt: CLOCK, images: [{ key: sha(`${src}\ncontent\nimage`), src,
    previewSrc: src + "?format=750w", context: "content", kind: "image", alt: "Athener Säulen", caption: "Athener Säulen", altPresent: true }] }],
    discoveredUrls: [PAGE], complete: true, completedAt: CLOCK, errors: [], coverageNotes: [] });
  const objects = new Map(), queued = new Map(); let projectId = "project-a", offline = false, conflict = false;
  const key = (id) => `${projectId}/${id}`;
  const client = {
    async status() { return { connection: offline ? "offline" : "online", baseUrl: "https://project.example.invalid", projectId, user: { id: "fixture-user", role: "admin" }, readOnlySession: false }; },
    async refresh() {},
    async getObject(kind, id, options) {
      const object = objects.get(key(id)); if (!object) throw Object.assign(new Error("No fixture remote object"), { status: 404 });
      return clone(options?.serverOnly || !queued.has(key(id)) ? object : { ...object, data: queued.get(key(id)), localPending: true });
    },
    async createObject(input) {
      const object = { ...clone(input), revision: randomUUID(), ordinal: 1, authorId: "fixture-user", approval: "draft", approvedRevision: null, createdAt: CLOCK };
      object.websiteAltEvidence = websiteAltServerEvidence({ objectId: object.id, objectRevision: object.revision, data: object.data, receipts: [] });
      objects.set(key(object.id), object); return clone(object);
    },
    async editExistingObject(kind, id, frame) { queued.set(key(id), clone(frame)); },
    async sync() { if (offline) throw Object.assign(new Error("Fixture offline"), { code: "fixture_offline" }); },
    async listConflicts() { return conflict ? [{ id: "fixture-conflict", kind: "page", objectId: websiteAltObjectId(PAGE) }] : []; },
    async resolveConflict() { throw new Error("No conflict resolution is authorized by these backup tests."); },
  };
  const bridge = createWebsiteAltSync({ filename, localStore: local, client, localStorageConfirmed: true });
  t.after(async () => { await bridge.close(); await fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }); });
  return { root, filename, local, client, bridge,
    async link() { const shown = await local.exportPage({ pageUrl: PAGE }); return bridge.link({ pageUrl: PAGE, expectedPageRevision: shown.pageRevision, confirmed: true }); },
    async edit(text) { const state = await local.snapshot(), image = state.pages[0].images[0]; await local.draft({ revision: state.revision, pageUrl: PAGE, imageKey: image.key, text, decorative: false }); },
    project(value) { projectId = value; }, offline(value) { offline = value; }, conflict(value) { conflict = value; },
  };
}
function pageFixture(t) {
  // Reuse the actual module fixture/source schemas; own cleanup adds bounded
  // Windows empty-directory retries after all repository handles are closed.
  const fixture = authoringFixture({ after() {} });
  t.after(async () => { fixture.close(); await fs.rm(assertTestTempPath(fixture.directory), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }); });
  return { ...fixture, root: fixture.directory };
}
async function roundTrip(fixture, validate) {
  const before = await fileHashes(fixture.filename), tempSession = await createManagedTempSession({ repoRoot: fixture.root });
  const files = [{ id: "journal", relativePath: path.basename(fixture.filename), kind: "sqlite", required: true, validate }];
  let snapshot, destination;
  try {
    snapshot = await createDeviceBackupProvider({ profileRoot: path.dirname(fixture.filename), deviceId: DEVICE, resolveProjectIds: async () => context.projectIds, files, tempSession }).prepare();
    const handoff = JSON.parse(await fs.readFile(snapshot.manifestPath, "utf8"));
    destination = await fs.mkdtemp(path.join(tmpdir(), "journal-restore-"));
    for (const entry of handoff.files) await fs.copyFile(entry.sourcePath, path.join(destination, entry.path.slice(`device-profiles/${DEVICE}/`.length)));
    const verified = await validateDeviceBackupCopy({ directory: destination, expectedDeviceId: DEVICE, expectedProjectIds: context.projectIds,
      expectedStateHash: snapshot.summary.stateHash, files, activeProfileRoot: path.dirname(fixture.filename) });
    const result = inspect(path.join(destination, path.basename(fixture.filename)), validate);
    assert.deepEqual(await fileHashes(fixture.filename), before); return { result, verified, pending: snapshot.summary.pending };
  } finally {
    await snapshot?.dispose(); await tempSession.close();
    if (destination) await fs.rm(assertTestTempPath(destination), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  }
}
async function cmsAttempt(fixture) {
  const draft = await fixture.ready(), plan = await fixture.plan(draft);
  const created = await fixture.service.beginCmsAttempt("publisher", { draftId: draft.id, mutationId: fixture.mutationId(), expectedRevision: draft.revision, planId: plan.id });
  return { draft, plan, attempt: created.attempt };
}
const cmsReceipt = (plan, attempt, extra = {}) => ({ id: "receipt-a", attemptId: attempt.id, planHash: plan.payload.planHash,
  contentHash: plan.payload.contentHash, imagesHash: plan.payload.imagesHash, status: "saved-unpublished", pageId: "cms-page-a",
  path: plan.payload.target.path, unpublished: true, readbackStructureHash: plan.payload.structureHash, observedAt: CLOCK, ...extra });

test("actual alt journal WAL/restore preserves an offline conflict and does not double-count historical intents", async (t) => {
  const f = await altFixture(t); await f.link(); await f.edit("Offline geänderter Text"); f.offline(true); await f.bridge.queue({ pageUrl: PAGE });
  await assert.rejects(f.bridge.sync({ pageUrl: PAGE }), /Fixture offline/); f.offline(false); f.conflict(true); await f.bridge.sync({ pageUrl: PAGE });
  modify(f.filename, (db) => db.prepare("INSERT INTO operations SELECT ?,link_key,'captured',local_hash,frame_json,local_page_json,NULL,NULL,created_at FROM operations WHERE phase='queued' LIMIT 1").run(randomUUID()));
  const result = inspect(f.filename, validateWebsiteAltJournal); assert.equal(result.pending, 1); assert.equal(result.counts.conflicts, 1);
  assert.equal(result.coverage.localStateKnown, false); assert.equal(result.coverage.localComparisonRequired, true);
  const restored = await roundTrip(f, validateWebsiteAltJournal); assert.equal(restored.result.pending, 1); assert.equal(restored.verified.pending, 1);
  assert.deepEqual(restored.result.counts, result.counts); assert.equal((await f.bridge.snapshot()).conflictCount, 1);
});

test("alt journal alone never claims the current local saved-page state is known", async (t) => {
  const f = await altFixture(t); await f.link(); await f.edit("Später lokal gespeichert, noch nicht in der Brücke abgeglichen");
  const result = inspect(f.filename, validateWebsiteAltJournal); assert.equal(result.pending, 0); assert.equal(result.coverage.localStateKnown, false);
  assert.equal(result.counts.linksRequiringLocalComparison, 1); assert.equal((await f.bridge.snapshot()).pending, 1);
  f.project("project-b"); await f.link(); assert.deepEqual(inspect(f.filename, validateWebsiteAltJournal).projectIds, context.projectIds);
  assert.throws(() => inspect(f.filename, validateWebsiteAltJournal, { ...context, projectIds: ["project-a"] }), /nicht gebundenes Projekt/);
});

test("alt journal requires its exact version, table/column list and persisted page/operation bindings", async (t) => {
  for (const sql of ["PRAGMA user_version=0", "PRAGMA user_version=2", "CREATE TABLE extra(value TEXT)", "CREATE VIEW extra AS SELECT key FROM links", "ALTER TABLE operations ADD COLUMN extra TEXT",
    "UPDATE links SET state='published'", "UPDATE links SET object_id='other-page'", "UPDATE operations SET link_key='orphan'",
    "UPDATE operations SET phase='auto-published'", "UPDATE operations SET local_hash='changed'", "UPDATE operations SET remote_revision='not-a-uuid' WHERE phase='linked'"]) {
    const f = await altFixture(t); await f.link(); modify(f.filename, (db) => db.exec(sql));
    assert.throws(() => inspect(f.filename, validateWebsiteAltJournal));
  }
});

test("alt authority frames cannot hide credential fields or a changed local source behind valid JSON", async (t) => {
  for (const type of ["local-source", "authority-token", "remote-token"]) {
    const f = await altFixture(t); await f.link();
    modify(f.filename, (db) => {
      const operation = db.prepare("SELECT * FROM operations LIMIT 1").get();
      if (type === "local-source") { const page = JSON.parse(operation.local_page_json); page.title = "Changed source"; db.prepare("UPDATE operations SET local_page_json=?").run(JSON.stringify(page)); }
      else if (type === "authority-token") { const frame = JSON.parse(operation.frame_json); frame.authority = { sessionToken: "fixture-secret" }; db.prepare("UPDATE operations SET frame_json=?").run(JSON.stringify(frame)); }
      else { const row = db.prepare("SELECT remote_json FROM links LIMIT 1").get(), remote = JSON.parse(row.remote_json); remote.websiteAltEvidence.authorization = "Bearer fixture-secret"; db.prepare("UPDATE links SET remote_json=?").run(JSON.stringify(remote)); }
    });
    assert.throws(() => inspect(f.filename, validateWebsiteAltJournal), type === "local-source" ? /lokale Bildtextfassung/ : /Anmelde-/);
  }
});

test("authoring database snapshot preserves an offline edit and honestly lists external media instead of claiming their bytes", async (t) => {
  const f = pageFixture(t); let draft = await f.ready(); draft = await f.save(draft, (document) => { document.introduction = [{ type: "paragraph", text: "Offline gespeicherter eigener Entwurf" }]; }, "offline");
  modify(f.filename, (db) => db.exec("PRAGMA journal_mode=WAL;"));
  const result = inspect(f.filename, validatePageAuthoringJournal); assert.equal(result.pending, 1); assert.equal(result.counts.draftsWithoutCurrentApproval, 1);
  assert.equal(result.coverage.mediaBytesIncluded, false); assert.equal(result.coverage.sharedSyncKnown, false); assert.ok(result.requiredMedia.length >= 3);
  const restored = await roundTrip(f, validatePageAuthoringJournal); assert.deepEqual(restored.result, result); assert.equal(restored.verified.pending, 1);
});

test("authoring approvals and prepared/dispatched CMS attempts retain separate pending meanings", async (t) => {
  const f = pageFixture(t), { attempt } = await cmsAttempt(f);
  let result = inspect(f.filename, validatePageAuthoringJournal); assert.equal(result.counts.draftsWithoutCurrentApproval, 0); assert.equal(result.counts.openCmsAttempts, 1); assert.equal(result.pending, 1);
  await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(), attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: "dispatch-a" });
  result = inspect(f.filename, validatePageAuthoringJournal); assert.equal(result.counts.openCmsAttempts, 1); assert.equal(result.counts.unpublishedDrafts, 1);
});

test("saved-unpublished and contradictory CMS receipts are preserved without inventing a publication or retry", async (t) => {
  const f = pageFixture(t), { draft, plan, attempt } = await cmsAttempt(f);
  await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(), attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: "dispatch-a" });
  await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt: cmsReceipt(plan, attempt) });
  let result = inspect(f.filename, validatePageAuthoringJournal); assert.equal(result.pending, 0); assert.equal(result.counts.savedUnpublished, 1); assert.equal(result.counts.unpublishedDrafts, 1);
  assert.equal(result.coverage.publicVerificationPerformed, false);
  await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt: cmsReceipt(plan, attempt, { id: "receipt-b", pageId: "different-cms-page" }) });
  result = inspect(f.filename, validatePageAuthoringJournal); assert.equal(result.counts.openCmsAttempts, 1); assert.equal(result.pending, 1);
  const restored = await roundTrip(f, validatePageAuthoringJournal); assert.equal(restored.result.pending, 1);
  assert.equal(f.repository.attempt("project-a", attempt.id).repeatAllowed, false);
  await f.save(draft, (document) => { document.title = "Neuere lokale Fassung"; }, "offline");
  result = inspect(f.filename, validatePageAuthoringJournal); assert.equal(result.counts.staleCmsAttempts, 1); assert.equal(result.counts.draftsWithoutCurrentApproval, 1);
});

test("an early success receipt stays uncertain and an old saved CMS revision never completes a newer head", async (t) => {
  const early = pageFixture(t), first = await cmsAttempt(early);
  await early.service.recordCmsOutcome("adapter", { attemptId: first.attempt.id, receipt: cmsReceipt(first.plan, first.attempt) });
  assert.equal(inspect(early.filename, validatePageAuthoringJournal).pending, 1);
  const f = pageFixture(t), { draft, plan, attempt } = await cmsAttempt(f);
  await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(), attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: "dispatch-a" });
  await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt: cmsReceipt(plan, attempt) });
  const newer = await f.save(draft, (document) => { document.title = "Neue freigegebene lokale Fassung"; }); await f.approval(newer);
  const result = inspect(f.filename, validatePageAuthoringJournal); assert.equal(result.counts.draftsWithoutCurrentApproval, 0);
  assert.equal(result.counts.staleCmsAttempts, 1); assert.equal(result.counts.currentSavedUnpublished, 0); assert.equal(result.pending, 1);
});

test("authoring rejects unknown schemas, broken version chains and altered hash-bound artifacts", async (t) => {
  for (const sql of ["PRAGMA user_version=1", "PRAGMA application_id=0", "CREATE TABLE extra(value TEXT)", "CREATE VIEW extra AS SELECT id FROM drafts", "ALTER TABLE cms_receipts ADD COLUMN extra TEXT",
    "UPDATE versions SET parent_revision='orphan' WHERE sequence=1", "UPDATE drafts SET head='missing'", "UPDATE artifacts SET kind='auto-approval'",
    "UPDATE versions SET body_hash='changed'", "UPDATE artifacts SET revision='orphan'", "DELETE FROM mutations"]) {
    const f = pageFixture(t), draft = await f.ready(); await f.approval(draft); modify(f.filename, (db) => db.exec(sql));
    assert.throws(() => inspect(f.filename, validatePageAuthoringJournal));
  }
});

test("authoring rejects authority/token additions and tampered plan, outcome, receipt and mutation bindings", async (t) => {
  for (const type of ["plan", "state", "receipt", "mutation", "token"]) {
    const f = pageFixture(t), { plan, attempt } = await cmsAttempt(f);
    await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(), attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: "dispatch-a" });
    await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt: cmsReceipt(plan, attempt) });
    modify(f.filename, (db) => {
      if (type === "plan") { const payload = clone(plan.payload); payload.publish = true; const { planHash, ...body } = payload; payload.planHash = fingerprint(body); db.prepare("UPDATE artifacts SET payload_json=? WHERE id=?").run(JSON.stringify(payload), plan.id); }
      if (type === "state") { const row = db.prepare("SELECT state_json FROM cms_attempts").get(), state = JSON.parse(row.state_json); state.repeatAllowed = true; db.prepare("UPDATE cms_attempts SET state_json=?,state_revision=?").run(JSON.stringify(state), fingerprint(state)); }
      if (type === "receipt") { const row = db.prepare("SELECT * FROM cms_receipts LIMIT 1").get(), value = JSON.parse(row.payload_json); value.contentHash = "0".repeat(64); db.prepare("UPDATE cms_receipts SET payload_json=?,payload_hash=?").run(JSON.stringify(value), fingerprint(value)); }
      if (type === "mutation") db.exec("UPDATE mutations SET result_json='{}'");
      if (type === "token") { const row = db.prepare("SELECT state_json FROM cms_attempts").get(), state = JSON.parse(row.state_json); state.authority = { bearerToken: "fixture-secret" }; db.prepare("UPDATE cms_attempts SET state_json=?").run(JSON.stringify(state)); }
    });
    assert.throws(() => inspect(f.filename, validatePageAuthoringJournal));
  }
});

test("both validators require trusted device/projects and respect cancellation/deadline without writes", async (t) => {
  const alt = await altFixture(t); await alt.link(); const page = pageFixture(t); await page.create();
  for (const [f, validate] of [[alt, validateWebsiteAltJournal], [page, validatePageAuthoringJournal]]) {
    const before = await fileHashes(f.filename), abort = new AbortController(); abort.abort(new Error("Fixture-cancel"));
    assert.throws(() => inspect(f.filename, validate, { ...context, signal: abort.signal }), /Fixture-cancel/);
    assert.throws(() => inspect(f.filename, validate, { ...context, deadline: 0 }), /Zeitlimit/);
    assert.throws(() => inspect(f.filename, validate, { ...context, projectIds: ["project-b"] }), /nicht gebundenes Projekt/);
    assert.throws(() => inspect(f.filename, validate, { ...context, deviceId: "untrusted" }), /Geräte-/);
    assert.deepEqual(await fileHashes(f.filename), before);
  }
});
