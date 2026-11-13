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
import { composePage } from "../page-authoring/compose.mjs";
import { createCmsReadbackTestProof } from "../page-authoring/cms-readback-test-fixture.mjs";
import { createCmsContentSteps } from "../page-authoring/cms-content-steps.mjs";
import { encodePageAuthoringDraft } from "../page-authoring/shared.mjs";
import { pageWorkspaceScope } from "../page-authoring/repository.mjs";
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
async function cmsAttempt(fixture, edit) {
  let draft = await fixture.ready();
  if (edit) draft = await fixture.save(draft, edit);
  const plan = await fixture.plan(draft);
  const created = await fixture.service.beginCmsAttempt("publisher", { draftId: draft.id, mutationId: fixture.mutationId(), expectedRevision: draft.revision, planId: plan.id });
  return { draft, plan, attempt: created.attempt };
}
const cmsReceipt = (plan, attempt, extra = {}) => ({ schemaVersion: 2, id: "receipt-a", attemptId: attempt.id, planHash: plan.payload.planHash,
  contentHash: plan.payload.contentHash, imagesHash: plan.payload.imagesHash, status: "saved-unpublished", pageId: "cms-page-a",
  path: plan.payload.target.path, unpublished: true, observedAt: CLOCK,
  ...createCmsReadbackTestProof(plan, { pageId: extra.pageId ?? "cms-page-a" }), ...extra });

function withHash(value, field) { const { [field]: ignoredHash, ...body } = value; return { ...body, [field]: fingerprint(body) }; }
async function historicalSourceArtifacts(t, { completed = false, variant = "legacy" } = {}) {
  const f = pageFixture(t); let draft = await f.ready();
  draft = await f.save(draft, document => {
    document.sources = [{ id: "page-source", label: "Historische Seitenquelle", url: "https://example.org/page-source" }];
    document.sections.find(section => section.id === "appearance").sources = [
      { id: "section-source", label: "Historische Fachquelle", url: "https://example.org/section-source" }];
  });
  const { preview, approved } = await f.approval(draft);
  const plan = (await f.service.prepareCmsPlan("publisher", { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision,
    approvalId: approved.artifact.id })).artifact;
  const attempt = (await f.service.beginCmsAttempt("publisher", { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision, planId: plan.id })).attempt;
  if (completed) {
    await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(), attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: "historical-dispatch" });
    await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt: cmsReceipt(plan, attempt) });
  }
  const current = composePage(draft, new Map()).structure;
  assert.equal(current.slots.filter(slot => slot.type === "source").length, 2);
  const historical = { ...clone(current), slots: current.slots.filter(slot => slot.type !== "source") };
  let planStructure = historical, reportStructure = historical;
  if (variant === "partial") planStructure = reportStructure = { ...clone(current), slots: current.slots.filter(slot => slot.type !== "source" || slot.source.id !== "section-source") };
  if (variant === "other-slot") planStructure = reportStructure = { ...clone(historical), slots: historical.slots.slice(1) };
  if (variant === "mixed-current-plan") planStructure = current;
  if (variant === "mixed-current-report") reportStructure = current;
  // Git HEAD's old composer already emitted exactly the same HTML sources.
  // Its sole structure difference was the complete absence of source slots;
  // keep the real previewHash and rebind every dependent persisted proof.
  const report = withHash({ ...preview.report, structureHash: fingerprint(reportStructure) }, "reportHash");
  const approval = withHash({ ...approved.artifact.payload, reportHash: report.reportHash }, "approvalHash");
  const { readback: ignoredReadback, ...legacyPlanBody } = plan.payload;
  const payload = { ...legacyPlanBody, schemaVersion: 1, approvalHash: approval.approvalHash, reportHash: report.reportHash,
    structure: planStructure, structureHash: fingerprint(planStructure) };
  payload.steps = [{ action: "confirm-new-target", path: payload.target.path, observationId: payload.target.observationId },
    { action: "create-unpublished-page", title: draft.document.title, path: payload.target.path },
    ...planStructure.slots.map((slot, index) => ({ action: "insert-observed-editor-block", index, slot })),
    { action: "save-unpublished" }, { action: "readback-and-compare", expectedStructureHash: payload.structureHash }, { action: "record-adapter-receipt" }];
  const historicalPlan = withHash(payload, "planHash"), byId = new Map([[preview.artifact.id, report], [approved.artifact.id, approval], [plan.id, historicalPlan]]);
  const oldReceipt = value => ({ id: value.id, attemptId: value.attemptId, planHash: historicalPlan.planHash,
    contentHash: value.contentHash, imagesHash: value.imagesHash, status: value.status, pageId: value.pageId, path: value.path,
    unpublished: true, observedAt: value.observedAt, readbackStructureHash: historicalPlan.structureHash,
    ...(Object.hasOwn(value, "reason") ? { reason: value.reason } : {}) });
  modify(f.filename, db => {
    for (const [id, body] of byId) db.prepare("UPDATE artifacts SET payload_json=? WHERE id=?").run(JSON.stringify(body), id);
    for (const row of db.prepare("SELECT * FROM mutations").all()) {
      const result = JSON.parse(row.result_json);
      if (result.artifact && byId.has(result.artifact.id)) {
        result.artifact.payload = byId.get(result.artifact.id);
        const intentHash = result.artifact.id === approved.artifact.id ? fingerprint({ operation: "approve", input: {
          draftId: draft.id, mutationId: row.mutation_id, expectedRevision: draft.revision, previewId: preview.artifact.id,
          reportHash: report.reportHash, review: approval.review, missingAltAcknowledged: approval.missingAltAcknowledged } }) : row.intent_hash;
        db.prepare("UPDATE mutations SET result_json=?,intent_hash=? WHERE project_id=? AND actor_id=? AND mutation_id=?")
          .run(JSON.stringify(result), intentHash, row.project_id, row.actor_id, row.mutation_id);
      }
    }
    for (const row of db.prepare("SELECT * FROM cms_receipts").all()) {
      const value = oldReceipt(JSON.parse(row.payload_json));
      db.prepare("UPDATE cms_receipts SET payload_json=?,payload_hash=? WHERE project_id=? AND attempt_id=? AND receipt_id=? AND payload_hash=?")
        .run(JSON.stringify(value), fingerprint(value), row.project_id, row.attempt_id, row.receipt_id, row.payload_hash);
    }
    for (const row of db.prepare("SELECT * FROM cms_attempts").all()) {
      const state = JSON.parse(row.state_json);
      if (state.receipt) { state.receipt = oldReceipt(state.receipt); state.receiptHash = fingerprint(state.receipt); }
      db.prepare("UPDATE cms_attempts SET state_json=?,state_revision=? WHERE project_id=? AND id=?")
        .run(JSON.stringify(state), fingerprint(state), row.project_id, row.id);
    }
  });
  return { ...f, draft, report, historicalPlan, currentPlan: plan, attempt, planId: plan.id, approvalId: approved.artifact.id };
}

test("complete pre-source-slot preview, approval, CMS plan and mutation/receipt history survives read-only backup and restore", async (t) => {
  for (const completed of [false, true]) {
    const f = await historicalSourceArtifacts(t, { completed }), before = await fileHashes(f.filename);
    const result = inspect(f.filename, validatePageAuthoringJournal);
    assert.equal(result.counts.draftsWithoutCurrentApproval, 0); assert.equal(result.counts.savedUnpublished, completed ? 1 : 0);
    const restored = await roundTrip(f, validatePageAuthoringJournal); assert.deepEqual(restored.result, result);
    assert.equal(result.coverage.publicVerificationPerformed, false); assert.deepEqual(await fileHashes(f.filename), before);
    // Preserving proof is not permission to execute a now-incomplete plan.
    await assert.rejects(f.service.beginCmsAttempt("publisher", { draftId: f.draft.id, mutationId: f.mutationId(),
      expectedRevision: f.draft.revision, planId: f.planId }), error => error.code === "stale_cms_plan");
    if (!completed) {
      const attempt = f.repository.attemptForDraft(f.draft.projectId, f.draft.id), before = structuredClone(attempt);
      await assert.rejects(f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(), attemptId: attempt.id,
        expectedStateRevision: attempt.stateRevision, dispatchId: "blocked-historical-plan" }), { code: "stale_cms_plan" });
      assert.deepEqual(f.repository.attemptForDraft(f.draft.projectId, f.draft.id), before);
    }
  }
});

test("historical compatibility rejects partial source omission, other changed slots and mixed report/plan composition proofs", async (t) => {
  for (const variant of ["partial", "other-slot", "mixed-current-plan", "mixed-current-report"]) {
    const f = await historicalSourceArtifacts(t, { variant });
    assert.throws(() => inspect(f.filename, validatePageAuthoringJournal), /Prüfbericht|CMS-Plan/);
  }
});

test("a known legacy success replays idempotently after a later contradictory receipt without accepting any new hash-only success", async t => {
  const f = await historicalSourceArtifacts(t, { completed: true });
  const first = f.repository.attemptForDraft(f.draft.projectId, f.draft.id), original = structuredClone(first.receipt);
  const failed = { ...original, id: 'later-legacy-receipt', status: 'failed', pageId: null, readbackStructureHash: '', reason: 'Historischer widersprüchlicher Abschluss' };
  const conflict = await f.service.recordCmsOutcome('adapter', { attemptId: first.id, receipt: failed });
  assert.equal(conflict.attempt.status, 'uncertain'); const before = f.repository.counts();
  const replay = await f.service.recordCmsOutcome('adapter', { attemptId: first.id, receipt: original });
  assert.equal(replay.idempotentReplay, true); assert.equal(replay.attempt.status, 'uncertain');
  assert.deepEqual(f.repository.counts(), before);
  await assert.rejects(f.service.recordCmsOutcome('adapter', { attemptId: first.id, receipt: { ...original, id: 'new-hash-only-success' } }), { code: 'cms_readback_required' });
  assert.deepEqual(f.repository.counts(), before);
});

async function readbackFixture(t, { status = "saved-unpublished", withoutObservation = false } = {}) {
  const f = pageFixture(t); let draft = await f.ready();
  draft = await f.save(draft, document => {
    document.introduction = [{ type: "paragraph", text: "Einleitung mit eigenem Absatz" }];
    const section = document.sections.find(value => value.id === "appearance");
    section.blocks = [{ type: "heading", level: 5, text: "Zwischenüberschrift" },
      { type: "paragraph", text: "Gelieferter Fachtext mit eigener Zeile\nund Fortsetzung" },
      { type: "bullet-list", items: ["Erster Listenpunkt", "Zweiter Listenpunkt"] }];
    section.sources = [{ id: "section-source", label: "Fachquelle", url: "https://example.org/source" }];
    document.sources = [{ id: "page-source", label: "Seitenquelle", url: "https://example.org/page" }];
    document.images.push({ id: "second-use", assetId: "photo-a", alt: "Zweite bewusste Verwendung", caption: "Andere Beschriftung", decorative: false });
  });
  const plan = await f.plan(draft);
  const attempt = (await f.service.beginCmsAttempt("publisher", { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision, planId: plan.id })).attempt;
  await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(), attemptId: attempt.id,
    expectedStateRevision: attempt.stateRevision, dispatchId: "readback-dispatch" });
  const receipt = cmsReceipt(plan, attempt, { status, ...(withoutObservation ? { readback: null, mediaBindings: [], pageId: null, unpublished: null } : {}) });
  await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt });
  return { ...f, draft, plan, attempt, receipt };
}
function rewriteStoredReadback(f, edit, { keepBadDerivedHash = false, receiptId } = {}) {
  modify(f.filename, db => {
    const row = receiptId === undefined ? db.prepare("SELECT * FROM cms_receipts LIMIT 1").get()
      : db.prepare("SELECT * FROM cms_receipts WHERE receipt_id=?").get(receiptId);
    const value = JSON.parse(row.payload_json); edit(value);
    if (!keepBadDerivedHash) {
      value.readbackStructureHash = value.readback === null ? null : fingerprint(value.readback);
      value.mediaBindingsHash = value.readback === null ? null : fingerprint(value.mediaBindings);
    }
    const hash = fingerprint(value);
    db.prepare("UPDATE cms_receipts SET payload_json=?,payload_hash=? WHERE project_id=? AND attempt_id=? AND receipt_id=? AND payload_hash=?")
      .run(JSON.stringify(value), hash, row.project_id, row.attempt_id, row.receipt_id, row.payload_hash);
    const saved = db.prepare("SELECT * FROM cms_attempts WHERE id=?").get(row.attempt_id), state = JSON.parse(saved.state_json);
    state.receipt = value; state.receiptHash = hash;
    db.prepare("UPDATE cms_attempts SET state_json=?,state_revision=? WHERE id=?").run(JSON.stringify(state), fingerprint(state), row.attempt_id);
  });
}

test("plan2 and receipt2 retain full reopened observations, richtext AST and per-use upload bindings through backup/restore", async (t) => {
  const f = await readbackFixture(t), before = await fileHashes(f.filename);
  assert.equal(f.plan.payload.schemaVersion, 2); assert.equal(f.plan.payload.readback.schemaVersion, 1);
  const expected = f.plan.payload.readback.expectation;
  assert.equal(f.plan.payload.readback.expectationHash, fingerprint(expected));
  assert.equal(expected.blocks.filter(block => block.type === "source").length, 2);
  assert.ok(expected.blocks.some(block => block.type === "richtext" && block.blocks.some(part => part.type === "bullet-list")));
  const result = inspect(f.filename, validatePageAuthoringJournal), restored = await roundTrip(f, validatePageAuthoringJournal);
  assert.equal(result.counts.savedUnpublished, 1); assert.equal(result.coverage.publicVerificationPerformed, false);
  assert.deepEqual(restored.result, result); assert.deepEqual(await fileHashes(f.filename), before);
  const db = new DatabaseSync(f.filename, { readOnly: true });
  try {
    const value = JSON.parse(db.prepare("SELECT payload_json FROM cms_receipts").get().payload_json);
    assert.equal(value.schemaVersion, 2); assert.equal(value.readback.page.reopened, true);
    assert.equal(value.readbackStructureHash, fingerprint(value.readback)); assert.equal(value.mediaBindingsHash, fingerprint(value.mediaBindings));
    assert.equal(value.mediaBindings.length, 2); assert.equal(value.mediaBindings[0].cmsAssetId, value.mediaBindings[1].cmsAssetId);
    assert.notEqual(value.mediaBindings[0].cmsItemId, value.mediaBindings[1].cmsItemId);
  } finally { db.close(); }
});

test("failed and uncertain receipt2 preserve either a complete proof or the explicit null form without claiming successful output", async (t) => {
  for (const status of ["failed", "uncertain"]) for (const withoutObservation of [false, true]) {
    const f = await readbackFixture(t, { status, withoutObservation }), result = inspect(f.filename, validatePageAuthoringJournal);
    assert.equal(result.counts.savedUnpublished, 0); assert.equal(result.counts.openCmsAttempts, 1);
    const restored = await roundTrip(f, validatePageAuthoringJournal); assert.deepEqual(restored.result, result);
  }
});

test("rebound receipt2 hashes never substitute for actual observed content, disabled/reopened state and original upload mappings", async (t) => {
  for (const mode of ["no-proof", "enabled", "not-reopened", "title", "heading", "richtext", "source", "gallery-order", "alt", "upload", "item", "unknown", "derived-hash", "legacy-receipt"]) {
    const f = await readbackFixture(t);
    rewriteStoredReadback(f, value => {
      if (mode === "no-proof") { value.readback = null; value.mediaBindings = []; value.pageId = null; value.unpublished = null; }
      if (mode === "enabled") value.readback.page.enabled = true;
      if (mode === "not-reopened") value.readback.page.reopened = false;
      if (mode === "title") value.readback.page.title = "Andere beobachtete Seite";
      if (mode === "heading") value.readback.blocks.find(block => block.type === "heading").text += " verändert";
      if (mode === "richtext") value.readback.blocks.find(block => block.type === "richtext").blocks[0].text += " verändert";
      if (mode === "source") value.readback.blocks.find(block => block.type === "source").text += " verändert";
      const gallery = value.readback?.blocks.find(block => block.type === "gallery");
      if (mode === "gallery-order") gallery.items.reverse();
      if (mode === "alt") gallery.items[0].alt += " verändert";
      if (mode === "upload") value.mediaBindings[0].sha256 = "a".repeat(64);
      if (mode === "item") value.mediaBindings[1].cmsItemId = value.mediaBindings[0].cmsItemId;
      if (mode === "unknown") value.readback.page.unexpected = true;
      if (mode === "derived-hash") value.readbackStructureHash = "a".repeat(64);
      if (mode === "legacy-receipt") {
        delete value.schemaVersion; delete value.readback; delete value.mediaBindings; delete value.mediaBindingsHash;
        value.readbackStructureHash = f.plan.payload.structureHash;
      }
    }, { keepBadDerivedHash: ["derived-hash", "legacy-receipt"].includes(mode) });
    assert.throws(() => inspect(f.filename, validatePageAuthoringJournal));
  }
});

test("plan2 must bind the complete current expectation and readback step, never the historical source-less variant", async (t) => {
  for (const mode of ["expectation", "historical-structure", "step", "wrapper", "legacy-plan"]) {
    const f = pageFixture(t); let draft = await f.ready();
    draft = await f.save(draft, document => { document.sources = [{ id: "source-a", label: "Gespeicherte Quelle" }]; });
    const plan = await f.plan(draft);
    modify(f.filename, db => {
      const payload = clone(plan.payload);
      if (mode === "expectation") {
        payload.readback.expectation.blocks.find(block => block.type === "source").text = "Andere Quelle";
        payload.readback.expectationHash = fingerprint(payload.readback.expectation);
        payload.steps.find(step => step.action === "readback-and-compare").expectedReadbackHash = payload.readback.expectationHash;
      }
      if (mode === "historical-structure") {
        payload.structure.slots = payload.structure.slots.filter(slot => slot.type !== "source"); payload.structureHash = fingerprint(payload.structure);
        payload.steps = [{ action: "confirm-new-target", path: payload.target.path, observationId: payload.target.observationId },
          { action: "create-unpublished-page", title: draft.document.title, path: payload.target.path },
          ...payload.structure.slots.map((slot, index) => ({ action: "insert-observed-editor-block", index, slot })),
          { action: "save-unpublished" }, { action: "readback-and-compare", expectedStructureHash: payload.structureHash,
            expectedReadbackHash: payload.readback.expectationHash }, { action: "record-adapter-receipt" }];
      }
      if (mode === "step") delete payload.steps.find(step => step.action === "readback-and-compare").expectedReadbackHash;
      if (mode === "wrapper") payload.readback.unexpected = true;
      if (mode === "legacy-plan") payload.schemaVersion = 1;
      const changed = withHash(payload, "planHash"); db.prepare("UPDATE artifacts SET payload_json=? WHERE id=?").run(JSON.stringify(changed), plan.id);
      for (const row of db.prepare("SELECT * FROM mutations").all()) {
        const result = JSON.parse(row.result_json); if (result.artifact?.id !== plan.id) continue;
        result.artifact.payload = changed;
        db.prepare("UPDATE mutations SET result_json=? WHERE project_id=? AND actor_id=? AND mutation_id=?")
          .run(JSON.stringify(result), row.project_id, row.actor_id, row.mutation_id);
      }
    });
    assert.throws(() => inspect(f.filename, validatePageAuthoringJournal));
  }
});

test("historical plan1 cannot be requalified by attaching a receipt2 observation under otherwise rebound hashes", async (t) => {
  const f = await historicalSourceArtifacts(t, { completed: true });
  rewriteStoredReadback(f, value => {
    for (const key of Object.keys(value)) delete value[key];
    Object.assign(value, cmsReceipt(f.currentPlan, f.attempt), { planHash: f.historicalPlan.planHash });
  });
  assert.throws(() => inspect(f.filename, validatePageAuthoringJournal));
});

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

async function replacedCmsPreparation(t) {
  const f = pageFixture(t), first = await cmsAttempt(f);
  const draft = await f.save(first.draft, document => { document.title += " korrigiert"; });
  const plan = await f.plan(draft);
  const { attempt } = await f.service.beginCmsAttempt("publisher", { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision, planId: plan.id });
  assert.equal(attempt.id, first.attempt.id);
  assert.equal(attempt.supersedesStateRevision, first.attempt.stateRevision);
  return { f, first, plan, attempt };
}

test("backup and restore retain replaced preparations and only confirm the dispatched current plan", async (t) => {
  const { f, plan, attempt } = await replacedCmsPreparation(t);
  const prepared = inspect(f.filename, validatePageAuthoringJournal);
  assert.equal(prepared.counts.openCmsAttempts, 1);
  assert.equal(prepared.counts.staleCmsAttempts, 0);
  await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(), attemptId: attempt.id,
    expectedStateRevision: attempt.stateRevision, dispatchId: "current-dispatch" });
  await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt: cmsReceipt(plan, attempt) });
  const restored = await roundTrip(f, validatePageAuthoringJournal);
  assert.equal(restored.result.counts.openCmsAttempts, 0);
  assert.equal(restored.result.counts.currentSavedUnpublished, 1);
  assert.equal(restored.result.pending, 0);
});

test("backup rejects missing preparation history and a dispatch receipt for a replaced plan", async (t) => {
  const missing = await replacedCmsPreparation(t);
  modify(missing.f.filename, db => db.prepare("DELETE FROM mutations WHERE json_extract(result_json,'$.attempt.stateRevision')=?")
    .run(missing.first.attempt.stateRevision));
  assert.throws(() => inspect(missing.f.filename, validatePageAuthoringJournal), /keine unveränderte frühere Vorbereitung/);

  const { f, first, attempt } = await replacedCmsPreparation(t);
  const mutationId = f.mutationId();
  const { attempt: dispatched } = await f.service.dispatchCmsAttempt("adapter", { mutationId, attemptId: attempt.id,
    expectedStateRevision: attempt.stateRevision, dispatchId: "current-dispatch" });
  const { stateRevision: _, ...previous } = first.attempt;
  const stale = { ...previous, status: "dispatched", dispatchId: dispatched.dispatchId, dispatchedAt: dispatched.dispatchedAt };
  const forged = { attempt: { ...stale, stateRevision: fingerprint(stale) }, idempotentReplay: false };
  modify(f.filename, db => db.prepare("UPDATE mutations SET result_json=? WHERE mutation_id=?").run(JSON.stringify(forged), mutationId));
  assert.throws(() => inspect(f.filename, validatePageAuthoringJournal), /fremde CMS-Ausführungsquittung/);
});

function cmsSaveFixture(plan, attempt, pageId = "a".repeat(24)) {
  const receipt = cmsReceipt(plan, attempt, { pageId });
  const assets = new Map();
  receipt.mediaBindings = receipt.mediaBindings.map((media, index) => {
    if (!assets.has(media.cmsAssetId)) {
      assets.set(media.cmsAssetId, `11111111-1111-4111-8111-${String(assets.size + 1).padStart(12, "0")}`);
    }
    return { ...media, cmsAssetId: assets.get(media.cmsAssetId), cmsItemId: `fn-figure-${String(index + 1).padStart(24, "0")}` };
  });
  const gallery = receipt.readback.blocks.find(block => block.type === "gallery");
  if (gallery) gallery.items = gallery.items.map((item, index) => ({ ...item,
    cmsAssetId: receipt.mediaBindings[index].cmsAssetId, cmsItemId: receipt.mediaBindings[index].cmsItemId }));
  const blockIds = createCmsContentSteps(plan.payload).filter(step => step.kind !== "gallery" || receipt.mediaBindings.length > 0)
    .map((_, index) => `block-${String(index + 1).padStart(20, "0")}`);
  return { receipt, binding: { schemaVersion: 1, attemptId: attempt.id, dispatchId: attempt.dispatchId,
    planHash: plan.payload.planHash, pageId, path: plan.payload.target.path, sectionId: "c".repeat(24), blockIds, mediaBindings: receipt.mediaBindings } };
}

test("backup and restore retain the atomic CMS save binding and reject a different saved page", async (t) => {
  const f = pageFixture(t), { plan, attempt } = await cmsAttempt(f);
  const start = { projectId: "project-a", actorId: attempt.actorId, attemptId: attempt.id, expectedStateRevision: attempt.stateRevision };
  assert.throws(() => f.repository.recordCmsSaveBinding({ ...start, binding: {} }), { code: "cms_repeat_blocked" });
  const { attempt: dispatched } = await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(),
    attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: "save-bound-dispatch" });
  const { binding, receipt } = cmsSaveFixture(plan, dispatched);
  const input = { ...start, expectedStateRevision: dispatched.stateRevision, binding };
  assert.throws(() => f.repository.recordCmsSaveBinding({ ...input, actorId: "another-actor" }), { code: "cms_attempt_not_found" });
  assert.throws(() => f.repository.recordCmsSaveBinding({ ...input, expectedStateRevision: attempt.stateRevision }), { code: "cms_repeat_blocked" });
  const counts = f.repository.counts();
  const recorded = f.repository.recordCmsSaveBinding(input);
  assert.notEqual(recorded.stateRevision, dispatched.stateRevision);
  assert.deepEqual(recorded.saveBinding, binding);
  assert.deepEqual(f.repository.recordCmsSaveBinding(input), recorded);
  assert.deepEqual(f.repository.counts(), counts);
  assert.throws(() => f.repository.recordCmsSaveBinding({ ...input, binding: { ...binding, pageId: "d".repeat(24) } }),
    { code: "cms_save_binding_conflict" });
  const { receipt: foreign } = cmsSaveFixture(plan, dispatched, "d".repeat(24));
  assert.throws(() => f.repository.recordOutcome({ projectId: input.projectId, attemptId: attempt.id, receipt: foreign }),
    { code: "cms_save_binding_mismatch" });
  assert.deepEqual(f.repository.counts(), counts);
  assert.equal((await roundTrip(f, validatePageAuthoringJournal)).result.counts.openCmsAttempts, 1);
  await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt });
  const saved = await roundTrip(f, validatePageAuthoringJournal);
  assert.equal(saved.result.counts.currentSavedUnpublished, 1);
  rewriteStoredReadback(f, value => { value.pageId = "d".repeat(24); value.readback.page.id = value.pageId; });
  assert.throws(() => inspect(f.filename, validatePageAuthoringJournal), { code: "cms_save_binding_mismatch" });
});

test("backup preserves contradictory historical CMS receipts without discarding the save binding", async (t) => {
  const f = pageFixture(t), { plan, attempt } = await cmsAttempt(f);
  const { attempt: dispatched } = await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(),
    attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: "save-conflict-dispatch" });
  const { binding, receipt } = cmsSaveFixture(plan, dispatched);
  f.repository.recordCmsSaveBinding({ projectId: "project-a", actorId: attempt.actorId, attemptId: attempt.id,
    expectedStateRevision: dispatched.stateRevision, binding });
  await f.service.recordCmsOutcome("adapter", { attemptId: attempt.id, receipt });
  const { receipt: conflicting } = cmsSaveFixture(plan, dispatched, "d".repeat(24));
  f.repository.recordOutcome({ projectId: "project-a", attemptId: attempt.id, receipt: { ...conflicting, id: "conflicting-save",
    readbackStructureHash: fingerprint(conflicting.readback), mediaBindingsHash: fingerprint(conflicting.mediaBindings) } });
  const state = f.repository.attempt("project-a", attempt.id);
  assert.equal(state.status, "uncertain");
  assert.deepEqual(state.saveBinding, binding);
  const restored = await roundTrip(f, validatePageAuthoringJournal);
  assert.equal(restored.result.counts.openCmsAttempts, 1);
  assert.equal(restored.result.counts.currentSavedUnpublished, 0);
});

async function recoverableCmsSave(t) {
  const f = pageFixture(t), { draft, plan, attempt } = await cmsAttempt(f, document => {
    document.introduction = [{ type: "paragraph", text: "Neutraler Text\nmit zweiter Zeile" }];
  });
  const { attempt: dispatched } = await f.service.dispatchCmsAttempt("adapter", { mutationId: f.mutationId(),
    attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: "recovery-dispatch" });
  const { binding, receipt } = cmsSaveFixture(plan, dispatched);
  const bound = f.repository.recordCmsSaveBinding({ projectId: "project-a", actorId: attempt.actorId, attemptId: attempt.id,
    expectedStateRevision: dispatched.stateRevision, binding });
  return { f, draft, plan, binding, receipt, bound };
}

test("a read-only CMS recheck records one confirmed recovery and retains an earlier uncertain receipt", async (t) => {
  for (const withUncertain of [false, true]) {
    const { f, draft, plan, binding, receipt, bound } = await recoverableCmsSave(t);
    const attemptId = bound.id;
    const state = () => f.repository.attempt("project-a", attemptId);
    if (!withUncertain) {
      const paragraph = receipt.readback.blocks.find(block => block.type === "richtext").blocks[0];
      assert.match(paragraph.text, /\n/);
      paragraph.text = paragraph.text.replaceAll("\n", "\r\n");
    }
    if (withUncertain) await f.service.recordCmsOutcome("adapter", { attemptId, receipt: { ...receipt,
      id: "previous-unobserved", status: "uncertain", pageId: null, unpublished: null, readback: null, mediaBindings: [] } });
    const before = state();
    const input = { attemptId, expectedStateRevision: before.stateRevision, receipt };
    assert.equal((await f.service.getDraft("publisher", draft.id)).cms.canRecheckSave, true);
    assert.equal((await f.service.getDraft("contributor", draft.id)).cms.canRecheckSave, false);
    assert.equal((await f.service.getDraft("publisher", draft.id)).cms.saveBinding, undefined);
    await assert.rejects(f.service.recordRecoveredCmsOutcome("publisher", input), { code: "trusted_adapter_required" });
    await assert.rejects(f.service.recordRecoveredCmsOutcome("adapter", { ...input, expectedStateRevision: "0".repeat(64) }), { code: "cms_recovery_unavailable" });
    const differentPage = cmsSaveFixture(plan, bound, "d".repeat(24)).receipt;
    await assert.rejects(f.service.recordRecoveredCmsOutcome("adapter", { ...input, receipt: differentPage }), { code: "cms_save_binding_mismatch" });
    await assert.rejects(f.service.recordRecoveredCmsOutcome("adapter", { ...input, receipt: { ...receipt,
      recovery: { previousReceiptHash: null, saveBindingHash: fingerprint(binding) } } }));
    assert.deepEqual(state(), before);
    const { attempt: recovered } = await f.service.recordRecoveredCmsOutcome("adapter", input);
    assert.equal(recovered.status, "saved-unpublished");
    assert.notEqual(recovered.stateRevision, before.stateRevision);
    assert.equal(recovered.saveBinding, undefined);
    assert.equal(recovered.receipt.recovery, undefined);
    assert.deepEqual(state().receipt.recovery, { previousReceiptHash: before.receiptHash ?? null, saveBindingHash: fingerprint(binding) });
    assert.equal(f.repository.counts().cms_receipts, withUncertain ? 2 : 1);
    if (withUncertain) assert.equal(f.repository.hasCmsReceipt("project-a", attemptId, before.receipt.id, before.receiptHash), true);
    assert.equal((await f.service.getDraft("publisher", draft.id)).cms.canRecheckSave, false);
    await assert.rejects(f.service.recordRecoveredCmsOutcome("adapter", input), { code: "cms_recovery_unavailable" });
    const saved = await roundTrip(f, validatePageAuthoringJournal);
    assert.equal(saved.result.counts.currentSavedUnpublished, 1);

    if (withUncertain) {
      const marker = state().receipt.recovery;
      const options = { receiptId: receipt.id };
      rewriteStoredReadback(f, value => { value.recovery.previousReceiptHash = null; }, options);
      assert.throws(() => inspect(f.filename, validatePageAuthoringJournal), /vorherigen Quittung/);
      rewriteStoredReadback(f, value => { value.recovery = { ...marker, saveBindingHash: "0".repeat(64) }; }, options);
      assert.throws(() => inspect(f.filename, validatePageAuthoringJournal), /vorherigen Quittung/);
      rewriteStoredReadback(f, value => { value.recovery = marker; }, options);
    }
    await f.service.recordCmsOutcome("adapter", { attemptId, receipt: { ...receipt, id: "later-contradiction" } });
    assert.equal(state().uncertainty, "conflicting-receipts");
    assert.equal((await f.service.getDraft("publisher", draft.id)).cms.canRecheckSave, false);
    await assert.rejects(f.service.recordRecoveredCmsOutcome("adapter", { ...input, expectedStateRevision: state().stateRevision }),
      { code: "cms_recovery_unavailable" });
    assert.equal((await roundTrip(f, validatePageAuthoringJournal)).result.counts.currentSavedUnpublished, 0);
  }
});

test("a CMS recheck requires the current draft, the online owner and a nonconflicting unobserved attempt", async (t) => {
  const { f, draft, receipt, bound } = await recoverableCmsSave(t);
  const resolve = f.authorities.actorAuthority.resolve;
  f.authorities.actorAuthority.resolve = async context => {
    if (context === "other-adapter") return { ...await resolve("adapter"), id: "other-actor" };
    if (context === "offline-adapter") return { ...await resolve("adapter"), online: false };
    return resolve(context);
  };
  const input = { attemptId: bound.id, expectedStateRevision: bound.stateRevision, receipt };
  for (const [context, code] of [["other-adapter", "cms_attempt_not_found"], ["offline-adapter", "online_required"]]) {
    assert.equal((await f.service.getDraft(context, draft.id)).cms.canRecheckSave, false);
    await assert.rejects(f.service.recordRecoveredCmsOutcome(context, input), { code });
  }
  await f.save(draft, document => { document.title += " überarbeitet"; });
  assert.equal((await f.service.getDraft("publisher", draft.id)).cms.canRecheckSave, false);
  await assert.rejects(f.service.recordRecoveredCmsOutcome("adapter", input), { code: "draft_conflict" });
  assert.equal(f.repository.counts().cms_receipts, 0);
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
  for (const sql of ["PRAGMA user_version=2", "PRAGMA application_id=0", "CREATE TABLE extra(value TEXT)", "CREATE VIEW extra AS SELECT id FROM drafts", "ALTER TABLE cms_receipts ADD COLUMN extra TEXT",
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

async function scopedPageFixture(t) {
  const f=pageFixture(t),legacy=await f.ready(),origin='https://project.example.org',actorId='felix',scopeId=pageWorkspaceScope(origin,actorId);
  const repo=f.repository.scoped({origin,actorId}),draft=repo.commit({projectId:'project-a',actorId,id:legacy.id,create:true,
    mutationId:'scoped-create',intentHash:fingerprint('scoped-create'),document:clone(legacy.document)}).draft;
  const binding={origin,actorId,projectId:'project-a',draftId:draft.id,baseLocalRevision:null,remoteRevision:null,remoteDataHash:null,
    remoteObject:null,confirmedObject:null,frameLocalRevision:draft.revision,frameHash:fingerprint(encodePageAuthoringDraft(draft)),
    approvalId:null,state:'uncertain',errorCode:'lost_create_ack'};
  repo.putWorkspaceLink({projectId:'project-a',draftId:draft.id,expectedBindingRevision:null,binding});
  return {...f,scopeId,binding,draft};
}

test('v1 scoped journal restore includes every registered personal scope without assigning legacy history or claiming image bytes',async t=>{
  const f=await scopedPageFixture(t),result=inspect(f.filename,validatePageAuthoringJournal);
  assert.equal(result.counts.personalScopes,1);assert.equal(result.counts.drafts,2);assert.equal(result.counts.workspaceOpen,1);
  assert.equal(result.coverage.personalScopesIncluded,true);assert.equal(result.coverage.legacyScopeAssigned,false);
  assert.equal(result.coverage.mediaBytesIncluded,false);assert.equal(result.coverage.sharedSyncKnown,false);
  const restored=await roundTrip(f,validatePageAuthoringJournal);assert.deepEqual(restored.result,result);
  assert.ok(result.requiredMedia.some(asset=>asset.id==='photo-a'));
  assert.ok(result.scopedRequiredMedia.some(value=>value.origin===f.binding.origin && value.actorId===f.binding.actorId
    && value.asset.id==='photo-a' && value.asset.attribution==='Felix · eigene Aufnahme'));
  assert.ok(result.scopedRequiredMedia.some(value=>value.origin===null && value.actorId===null && value.asset.id==='photo-a'));
});

test("journal media roles bind the actual stored species snapshot rather than the image UUID prefix", async (t) => {
  const f = pageFixture(t), original = f.metadata.get("portrait"), id = "image-00000000-0000-4000-8000-000000000001";
  const asset = { ...original, id }; f.metadata.set(id, asset); f.species.normalAssets.portrait = asset;
  // The current stored-document validator still requires both slugs to agree;
  // the pure collector separately proves that its identity comes from species.
  const created = await f.create("contributor");
  await f.save(created, document => { document.images = [{ id: "alias-use", assetId: id, alt: "Unverändertes Porträt", caption: "", decorative: false }]; });
  const before = await fileHashes(f.filename), result = inspect(f.filename, validatePageAuthoringJournal);
  const portrait = result.scopedRequiredMedia.filter(entry => entry.asset.id === id);
  assert.equal(portrait.length, 1); assert.equal(portrait[0].domain, "normal"); assert.equal(portrait[0].slot, "portrait.webp");
  assert.equal(portrait[0].speciesId, "test-art"); assert.equal(result.coverage.mediaBytesIncluded, false);
  assert.deepEqual(await fileHashes(f.filename), before);
});

test('v1 scope registry, frozen transport, local revision and origin/person bindings are validated beyond their row hash',async t=>{
  for(const kind of ['scope-owner','unregistered-table','origin','actor','frame','local-revision','credential']) {
    const f=await scopedPageFixture(t);
    modify(f.filename,db=>{
      if(kind==='scope-owner'){db.prepare('UPDATE workspace_scopes SET actor_id=? WHERE scope_id=?').run('different-person',f.scopeId);return;}
      if(kind==='unregistered-table'){db.exec('CREATE TABLE drafts_unregistered(value TEXT)');return;}
      const value=clone(f.binding);
      if(kind==='origin')value.origin='https://different-project.example.org';
      if(kind==='actor')value.actorId='different-person';
      if(kind==='frame')value.frameHash='f'.repeat(64);
      if(kind==='local-revision')value.frameLocalRevision='f'.repeat(64);
      if(kind==='credential')value.sessionToken='not-a-real-secret';
      db.prepare(`UPDATE workspace_links_${f.scopeId} SET state_json=?,state_revision=?`).run(JSON.stringify(value),fingerprint(value));
    });
    assert.throws(()=>inspect(f.filename,validatePageAuthoringJournal),kind);
  }
});
