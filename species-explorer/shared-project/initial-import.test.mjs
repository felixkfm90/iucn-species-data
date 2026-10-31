import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_SPECIES_SOURCE, readBundledSpeciesCatalog } from "../species-content/bundled.mjs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fixture, species } from "./test-fixtures.mjs";
import { buildCatalog } from "./catalog.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createExplorerSharedProjectService } from "./explorer-service.mjs";
import { createInitialProjectImport } from "./initial-import.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const denied = (code) => (error) => error.code === code;
async function scoped(fn) {
  const f = fixture(), controllers = []; let adapter, service;
  try {
    const initialized = await f.initialized();
    adapter = createSharedProjectHttp({ store: initialized.store }); const address = await adapter.listen();
    service = createExplorerSharedProjectService({ filename: path.join(f.root, "cache.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true });
    await service.connect({ baseUrl: address.url, username: initialized.a.user.username, password: f.password });
    const catalog = buildCatalog({ revision: "bound-fixture", generatedAt: "2026-10-31T10:00:00.000Z", species: [species("first-fixture"), species("second-fixture")] });
    const originalBytes = Buffer.from(JSON.stringify(catalog)); let bytes = originalBytes;
    const filename = path.join(f.root, "initial-import.sqlite");
    function controller(options = {}) {
      const value = createInitialProjectImport({ service, filename, localStorageConfirmed: true, readCatalog: async () => bytes,
        expectedSha256: sha(originalBytes), expectedSpeciesCount: 2, ...options }); controllers.push(value); return value;
    }
    await fn({ f, ...initialized, service, controller, filename, address, catalog, originalBytes, changeBytes: (value) => { bytes = value; } });
  } finally { for (const value of controllers) await value.close(); if (service) await service.close(); if (adapter) await adapter.close(); f.cleanup(); }
}

test("initial import previews a bound delta without mutation and requires separate create/release confirmation", () => scoped(async ({ controller, store, a }) => {
  const value = controller(); assert.equal(store.listObjects(a.token).length, 0);
  const plan = await value.prepare({ releaseForReaders: true });
  assert.deepEqual(value.backupProjectIds(), [plan.projectId]);
  assert.equal(plan.counts.willCreate, 2); assert.equal(plan.externalPublication, "not-performed");
  assert.equal(store.listObjects(a.token).length, 0);
  await assert.rejects(value.apply({ planId: plan.planId }), denied("import_confirmation_required"));
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_release_confirmation_required"));
  const completed = await value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true });
  assert.equal(completed.state, "complete"); assert.equal(completed.counts.approved, 2); assert.equal(store.catalog(a.token).species.length, 2);
  const receipts = value.receipts(plan.planId);
  assert.equal(receipts.filter((entry) => entry.operation === "create" && entry.phase === "confirmed").length, 2);
  assert.equal(receipts.filter((entry) => entry.operation === "approve" && entry.phase === "confirmed").length, 2);
  const before = receipts.length; await value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true });
  assert.equal(value.receipts(plan.planId).length, before);
  const repeated = await value.prepare({ releaseForReaders: true }); assert.equal(repeated.planId, plan.planId); assert.equal(repeated.state, "complete");
}));

test("existing different drafts are visible in the plan and never overwritten or automatically released", () => scoped(async ({ controller, store, a, catalog }) => {
  const existing = store.createObject(a.token, { kind: "species", id: catalog.species[0].id, data: species(catalog.species[0].id, "Existing human text") });
  const value = controller(), plan = await value.prepare({ releaseForReaders: true });
  assert.equal(plan.counts.skippedExisting, 1); assert.equal(plan.counts.existingDifferent, 1); assert.equal(plan.counts.willCreate, 1);
  await value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true });
  const after = store.getObject(a.token, "species", existing.id);
  assert.equal(after.revision, existing.revision); assert.equal(after.approvedRevision, null); assert.equal(after.data.sections[0].text, "Existing human text");
  assert.equal(store.catalog(a.token).species.length, 1);
}));

test("lost creation acknowledgement resumes from the durable intent without creating or approving duplicates", () => scoped(async ({ controller, service, store, a }) => {
  let lose = true, creations = 0;
  const wrapped = { refresh: (...args) => service.refresh(...args), approve: (...args) => service.approve(...args),
    async create(input) { creations++; const result = await service.create(input); if (lose) { lose = false; throw new Error("synthetic lost creation acknowledgement"); } return result; } };
  const first = controller({ service: wrapped }), plan = await first.prepare({ releaseForReaders: true });
  await assert.rejects(first.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true }), denied("import_not_confirmed"));
  assert.equal(first.status().plan.counts.uncertain, 1); await first.close();
  const reopened = controller({ service: wrapped }), recovered = await reopened.prepare({ releaseForReaders: true });
  assert.equal(recovered.planId, plan.planId); assert.equal(recovered.drift.length, 0);
  await reopened.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true });
  assert.equal(creations, 2); assert.equal(store.listObjects(a.token).length, 2);
  assert.ok(store.listObjects(a.token).every((object) => object.ordinal === 1));
  assert.equal(reopened.receipts(plan.planId).filter((entry) => entry.operation === "create" && entry.phase === "recovered-confirmed").length, 1);
}));

test("lost approval acknowledgement resumes by observing the exact approved version", () => scoped(async ({ controller, service, store, a }) => {
  let lose = true, approvals = 0;
  const wrapped = { refresh: (...args) => service.refresh(...args), create: (...args) => service.create(...args),
    async approve(...args) { approvals++; const result = await service.approve(...args); if (lose) { lose = false; throw new Error("synthetic lost approval acknowledgement"); } return result; } };
  const first = controller({ service: wrapped }), plan = await first.prepare({ releaseForReaders: true });
  await assert.rejects(first.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true }), denied("import_not_confirmed")); await first.close();
  const reopened = controller({ service: wrapped }); await reopened.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true });
  assert.equal(approvals, 2); assert.equal(store.catalog(a.token).species.length, 2);
  assert.equal(reopened.receipts(plan.planId).filter((entry) => entry.operation === "approve" && entry.phase === "recovered-confirmed").length, 1);
}));

test("foreign content drift between creation and release stops the run and preserves the other person's version", () => scoped(async ({ controller, service, store, b }) => {
  let changed = false;
  const wrapped = { refresh: (...args) => service.refresh(...args), approve: (...args) => service.approve(...args),
    async create(input) {
      const result = await service.create(input);
      if (!changed) { changed = true; store.submitChange(b.token, { changeId: "human-during-import", kind: result.kind, id: result.id,
        baseRevision: result.revision, data: species(result.id, "Human edit during import") }); }
      return result;
    } };
  const value = controller({ service: wrapped }), plan = await value.prepare({ releaseForReaders: true });
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true }), denied("import_drift"));
  assert.equal(store.listObjects(b.token).length, 1); const actual = store.listObjects(b.token)[0];
  assert.equal(actual.data.sections[0].text, "Human edit during import"); assert.equal(actual.approvedRevision, null);
  assert.equal(value.status().plan.state, "stopped");
}));

test("source-byte drift and journal-content drift are rejected before any server write", () => scoped(async ({ controller, filename, changeBytes, originalBytes, store, a }) => {
  const first = controller(), plan = await first.prepare(); changeBytes(Buffer.concat([originalBytes, Buffer.from(" ")]));
  await assert.rejects(first.apply({ planId: plan.planId, confirmed: true }), denied("bound_source_changed"));
  assert.equal(store.listObjects(a.token).length, 0); changeBytes(originalBytes); await first.close();
  const db = new DatabaseSync(filename); const row = db.prepare("SELECT * FROM items WHERE plan_id=? LIMIT 1").get(plan.planId);
  const changed = JSON.parse(row.target_json); changed.commonName = "Tampered journal value";
  db.prepare("UPDATE items SET target_json=? WHERE plan_id=? AND id=?").run(JSON.stringify(changed), plan.planId, row.id); db.close();
  const reopened = controller(); await assert.rejects(reopened.apply({ planId: plan.planId, confirmed: true }), denied("import_journal_drift"));
  assert.equal(store.listObjects(a.token).length, 0);
}));

test("admin rights are checked online for the import and again before internal release", () => scoped(async ({ controller, service, store, a, b }) => {
  let demoted = false;
  const wrapped = { refresh: (...args) => service.refresh(...args), approve: (...args) => service.approve(...args),
    async create(input) {
      const result = await service.create(input);
      if (!demoted) { demoted = true; store.updateUser(b.token, a.user.id, { expectedVersion: 1, role: "contributor" }); }
      return result;
    } };
  const value = controller({ service: wrapped }), plan = await value.prepare({ releaseForReaders: true });
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true }), denied("forbidden"));
  assert.equal(store.listObjects(b.token).length, 1); assert.equal(store.listObjects(b.token)[0].approvedRevision, null);
  await assert.rejects(value.prepare({ releaseForReaders: true }), denied("forbidden"));
}));

test("journal ownership blocks a second live controller and close waits for preparation without recreating files", () => scoped(async ({ controller, filename, originalBytes }) => {
  let release; const held = new Promise((resolve) => { release = resolve; });
  const first = controller({ readCatalog: async () => { await held; return originalBytes; } });
  const preparing = first.prepare(); assert.equal(first.status().busy, true);
  const second = controller(); await assert.rejects(second.prepare(), denied("import_in_use"));
  const closing = first.close(); release(); await preparing; await closing;
  assert.equal(first.status().closed, true);
  await second.close(); await fs.unlink(filename); first.status(); await assert.rejects(fs.stat(filename), (error) => error.code === "ENOENT");
}));

test("the actual bound 63-species source produces a proposal only; no import action is executed", async () => {
  const f = fixture(); let value;
  try {
    const root = fileURLToPath(new URL("../../", import.meta.url)), bytes = await readBundledSpeciesCatalog(root);
    const service = { async refresh() { return { status: { connection: "online", projectId: "synthetic-project", baseUrl: "https://project.example.org", user: { id: "synthetic-admin", role: "admin" }, readOnlySession: false },
      permissions: { canManageUsers: true }, queuedChanges: 0, conflictCount: 0, busy: false, objects: [] }; },
    async create() { throw new Error("Actual import prohibited in this proposal test"); }, async approve() { throw new Error("Actual approval prohibited in this proposal test"); } };
    value = createInitialProjectImport({ service, filename: path.join(f.root, "bound-plan.sqlite"), localStorageConfirmed: true, readCatalog: async () => bytes,
      expectedSha256: BUNDLED_SPECIES_SOURCE.sha256 });
    const plan = await value.prepare({ releaseForReaders: true }); assert.equal(plan.counts.willCreate, 63); assert.equal(plan.counts.total, 63); assert.equal(plan.state, "planned");
  } finally { if (value) await value.close(); f.cleanup(); }
});

test("changing the connected project after planning cannot redirect the import to another server", () => scoped(async ({ controller, service, store, a }) => {
  const other = fixture(); let adapter;
  try {
    const initialized = await other.initialized(); adapter = createSharedProjectHttp({ store: initialized.store }); const address = await adapter.listen();
    const value = controller(), plan = await value.prepare();
    await service.connect({ baseUrl: address.url, username: initialized.a.user.username, password: other.password });
    await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_project_changed"));
    assert.equal(store.listObjects(a.token).length, 0); assert.equal(initialized.store.listObjects(initialized.a.token).length, 0);
  } finally { if (adapter) await adapter.close(); other.cleanup(); }
}));

test("close waits for a begun creation, journals it, and stops before the next internal release", () => scoped(async ({ controller, service, store, a }) => {
  let release, reached;
  const gate = new Promise((resolve) => { release = resolve; }), entered = new Promise((resolve) => { reached = resolve; });
  const wrapped = { refresh: (...args) => service.refresh(...args), approve: (...args) => service.approve(...args),
    async create(input) { const result = await service.create(input); reached(); await gate; return result; } };
  const value = controller({ service: wrapped }), plan = await value.prepare({ releaseForReaders: true });
  const applying = value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true });
  const rejected = assert.rejects(applying, denied("import_stopped")); await entered;
  const closing = value.close(); assert.equal(value.status().busy, true); release(); await closing; await rejected;
  const objects = store.listObjects(a.token); assert.equal(objects.length, 1); assert.equal(objects[0].approvedRevision, null);
  assert.equal(value.status().closed, true); assert.equal(value.status().plan.counts.created, 1);
}));

test("a journal lease left by a proven exited process can be resumed without stealing a live owner's work", () => scoped(async ({ controller, filename }) => {
  const first = controller(), plan = await first.prepare(); await first.close();
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { windowsHide: true, stdio: "ignore" });
  const pid = child.pid; assert.equal((await once(child, "exit"))[0], 0);
  const db = new DatabaseSync(filename); db.prepare("INSERT INTO lease VALUES (1,?,?)").run("synthetic-exited-owner", pid); db.close();
  const reopened = controller(), resumed = await reopened.prepare(); assert.equal(resumed.planId, plan.planId);
}));
