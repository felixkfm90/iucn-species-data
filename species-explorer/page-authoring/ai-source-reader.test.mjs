import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fixture as authoringFixture } from "./test-fixture.mjs";
import { createPageAuthoringAiReader } from "./ai-source-reader.mjs";
import { fingerprint, sha256 } from "./contract.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aoh8AAAAASUVORK5CYII=", "base64");
const clone = (value) => structuredClone(value), denied = (...codes) => (error) => codes.includes(error.code);
function deferred() { let resolve; const promise = new Promise((ready) => { resolve = ready; }); return { promise, resolve }; }
async function fixture(t) {
  const core = authoringFixture(t); core.bytes.set("photo-a", PNG);
  core.metadata.set("photo-a", { ...core.metadata.get("photo-a"), bytes: PNG.length, sha256: sha256(PNG) });
  const legacy = await core.ready(), origin = "https://project.invalid";
  let status = { baseUrl: origin, projectId: "project-a", user: { id: "felix", role: "admin", version: 3 }, connection: "online", readOnlySession: false, closed: false };
  let permissions = { canRead: true, canEdit: true, canCreate: true, canApprove: true }, closed = false, active = 0, withClientCalls = 0, inside = false, mutation = 0;
  const personal = core.repository.scoped({ origin, actorId: status.user.id });
  const draft = personal.commit({ projectId: status.projectId, actorId: status.user.id, id: legacy.id, create: true,
    mutationId: "personal-create", intentHash: fingerprint("personal-create"), document: clone(legacy.document) }).draft;
  const source = { type: "fn-species-record", schemaVersion: 1, id: draft.document.slug,
    input: { german: "Test-Art", english: "Fixture", genus: "Testus", species: "fixture", privateInput: "Node-only original sentinel" },
    generated: { URLSlug: draft.document.slug }, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Test-Art", files: {}, overrides: {}, credits: null, portraitMetadata: { prompt: "Node-only prompt sentinel" } },
    editorial: { websiteUrl: null, sections: [{ id: "habitat", title: "Lebensraum", text: "Gelieferter Fachtext", intentionallyEmpty: false }], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  const hooks = {}, calls = [], client = { async status() { calls.push("status"); await hooks.status?.(); return clone(status); },
    async getObject(kind, id) { calls.push("species"); assert.equal(kind, "species"); assert.equal(id, source.id); await hooks.species?.(); return { kind, id, data: clone(source) }; },
    async refresh() { throw new Error("A source reader must not refresh the network"); }, async capabilities() { throw new Error("A source reader must not request network capabilities"); } };
  const mediaFacade = { async describe(context, id) { calls.push("describe"); assert.equal(context.client, client); assert.equal(context.actor.id, "felix");
    await hooks.describe?.(); return clone(core.metadata.get(id)); },
  async read(context, id) { calls.push("read"); assert.equal(context.sourceScope, fingerprint([origin, "project-a", "felix"])); await hooks.read?.(); return Buffer.from(core.bytes.get(id)); } };
  const withClient = async (operation) => {
    assert.equal(inside, false, "re-entering the shared facade would deadlock"); inside = true; withClientCalls++;
    try { return await operation(client, { status: clone(status), permissions: clone(permissions) }); } finally { inside = false; }
  };
  const reader = createPageAuthoringAiReader({ withClient, repository: core.repository, mediaFacade,
    run(work) { active++; return Promise.resolve().then(work).finally(() => { active--; }); },
    assertOpen() { if (closed) throw Object.assign(new Error("Source session closed"), { code: "page_session_closed" }); } });
  const input = () => ({ sourceScope: fingerprint([status.baseUrl, status.projectId, status.user.id]), draftId: draft.id });
  return { core, personal, source, draft, reader, hooks, calls, client, mediaFacade, input, get active() { return active; }, get withClientCalls() { return withClientCalls; },
    imageInput() { return { ...input(), expectedRevision: personal.read("project-a", draft.id).revision, imageId: "image-a", assetId: "photo-a" }; },
    status(change) { status = { ...status, ...change }; }, permissions(change) { permissions = { ...permissions, ...change }; }, close() { closed = true; },
    edit() { const before = personal.read("project-a", draft.id), document = clone(before.document); document.title = `Später geändert ${++mutation}`;
      return personal.commit({ projectId: "project-a", actorId: "felix", id: draft.id, mutationId: `local-change-${mutation}`, intentHash: fingerprint(mutation), expectedRevision: before.revision, document }).draft; } };
}

test("Node AI snapshots use one existing facade and the actual personal SQLite draft plus a full working species", async (t) => {
  const f = await fixture(t), before = f.core.repository.counts(), value = await f.reader.readSnapshot(f.input());
  assert.equal(f.withClientCalls, 1); assert.equal(value.draft.revision, f.draft.revision); assert.equal(value.speciesRecord.type, "fn-species-record");
  assert.equal(value.speciesRecord.id, f.draft.document.slug); assert.equal(value.speciesRecord.input.privateInput, "Node-only original sentinel");
  assert.deepEqual(value.user, { id: "felix", role: "admin", version: 3 }); assert.equal(value.permissions.canRead, true); assert.equal(value.permissions.canEdit, true);
  assert.equal(value.origin, "https://project.invalid"); assert.deepEqual(f.core.repository.counts(), before); assert.equal(f.active, 0);
  value.draft.document.title = "Caller mutation"; value.speciesRecord.input.german = "Caller mutation";
  assert.notEqual(f.personal.read("project-a", f.draft.id).document.title, "Caller mutation"); assert.equal(f.source.input.german, "Test-Art");
  assert.equal(typeof f.reader.close, "undefined", "the reader never takes ownership of the repository or client");
});

test("existing offline editing and an exact current image position remain readable without networking", async (t) => {
  const f = await fixture(t); f.status({ connection: "offline" });
  const value = await f.reader.readSnapshot(f.input()); assert.equal(value.connection, "offline"); assert.equal(value.permissions.canRead, true); assert.equal(value.permissions.canEdit, true);
  assert.equal(value.permissions.canCreate, false); assert.equal(value.permissions.canApprove, false);
  const image = await f.reader.readImage(f.imageInput()); assert.deepEqual(image.buffer, PNG); assert.equal(image.metadata.sha256, sha256(PNG)); assert.equal(f.withClientCalls, 2);
  assert.deepEqual(f.calls.filter((call) => ["describe", "read"].includes(call)), ["describe", "read"]);
});

test("readers, readonly sessions, inactive connections and missing effective rights cannot inspect private AI sources", async (t) => {
  for (const change of [{ user: { id: "felix", role: "reader", version: 3 } }, { readOnlySession: true }, { connection: "forbidden" }, { connection: "disconnected" },
    { connection: "authentication-required" }, { connection: "closed" }, { connection: "checking" }, { closed: true }]) {
    const f = await fixture(t); f.status(change); await assert.rejects(f.reader.readSnapshot(f.input()), denied("forbidden")); assert.equal(f.calls.length, 0);
  }
  const f = await fixture(t); f.permissions({ canRead: false }); await assert.rejects(f.reader.readSnapshot(f.input()), denied("forbidden"));
  f.permissions({ canRead: true, canEdit: false }); await assert.rejects(f.reader.readImage(f.imageInput()), denied("forbidden"));
});

test("source, person, role, known user version and current draft CAS changes reject late snapshots", async (t) => {
  for (const change of [{ baseUrl: "https://elsewhere.invalid" }, { projectId: "project-b" }, { user: { id: "other", role: "admin", version: 3 } },
    { user: { id: "felix", role: "publisher", version: 4 } }, { user: { id: "felix", role: "admin", version: 4 } }, { readOnlySession: true }]) {
    const f = await fixture(t); f.hooks.species = () => f.status(change);
    await assert.rejects(f.reader.readSnapshot(f.input()), denied("workspace_changed")); assert.equal(f.withClientCalls, 1);
  }
  const f = await fixture(t); f.hooks.species = () => f.edit();
  await assert.rejects(f.reader.readSnapshot(f.input()), denied("draft_conflict")); assert.equal(f.personal.read("project-a", f.draft.id).document.title, "Später geändert 1");
});

test("AI source reads never register an unknown personal namespace or assign existing legacy drafts", async (t) => {
  const f = await fixture(t), inspect = () => {
    const db = new DatabaseSync(f.core.filename, { readOnly: true });
    try { return Buffer.from(JSON.stringify({ schema: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all(),
      scopes: db.prepare("SELECT * FROM workspace_scopes ORDER BY scope_id").all(), count: db.prepare("SELECT count(*) AS n FROM workspace_scopes").get().n })); }
    finally { db.close(); }
  };
  const before = inspect(); f.status({ user: { id: "new-person", role: "admin", version: 3 } });
  await assert.rejects(f.reader.readSnapshot(f.input()), denied("draft_not_found")); assert.deepEqual(inspect(), before);
});

test("image reads bind the exact position, current revision and complete asset metadata before reading bytes", async (t) => {
  const f = await fixture(t), original = f.imageInput();
  for (const changed of [{ imageId: "another-position" }, { assetId: "photo-b" }, { expectedRevision: "f".repeat(64) }]) {
    await assert.rejects(f.reader.readImage({ ...original, ...changed }), denied("image_binding_changed", "draft_conflict"));
  }
  assert.equal(f.calls.includes("describe"), false); assert.equal(f.calls.includes("read"), false);
  for (const changed of [{ sha256: "f".repeat(64) }, { bytes: PNG.length + 1 }, { mimeType: "image/jpeg" }, { attribution: "Andere Quelle" }, { projectId: "project-b" }]) {
    const prior = clone(f.core.metadata.get("photo-a")); f.core.metadata.set("photo-a", { ...prior, ...changed });
    await assert.rejects(f.reader.readImage(original), denied("media_changed", "foreign_media")); f.core.metadata.set("photo-a", prior);
  }
  assert.equal(f.calls.includes("read"), false);
});

test("late image changes preserve the draft and never retry or restore missing personal bytes", async (t) => {
  const f = await fixture(t), original = f.imageInput(); f.hooks.describe = () => f.edit();
  await assert.rejects(f.reader.readImage(original), denied("draft_conflict")); assert.equal(f.calls.includes("read"), false);
  const g = await fixture(t); g.hooks.read = () => g.status({ user: { id: "felix", role: "reader", version: 4 } });
  await assert.rejects(g.reader.readImage(g.imageInput()), denied("workspace_changed"));
  const h = await fixture(t), before = h.draft.revision; h.mediaFacade.read = async () => { throw Object.assign(new Error("Not downloaded"), { code: "image_media_not_local" }); };
  await assert.rejects(h.reader.readImage(h.imageInput()), denied("image_media_not_local")); assert.equal(h.personal.read("project-a", h.draft.id).revision, before);
  assert.equal(h.calls.filter((call) => call === "describe").length, 1);
});

test("wrong bytes or false MIME cannot enter the Node AI image input", async (t) => {
  const f = await fixture(t); f.core.bytes.set("photo-a", Buffer.alloc(PNG.length));
  await assert.rejects(f.reader.readImage(f.imageInput()), denied("media_changed"));
  const g = await fixture(t), prior = g.personal.read("project-a", g.draft.id), document = clone(prior.document);
  document.images[0].asset.mimeType = "image/jpeg"; g.core.metadata.set("photo-a", { ...g.core.metadata.get("photo-a"), mimeType: "image/jpeg" });
  g.personal.commit({ projectId: "project-a", actorId: "felix", id: prior.id, mutationId: "wrong-mime", intentHash: fingerprint("wrong-mime"), expectedRevision: prior.revision, document });
  await assert.rejects(g.reader.readImage(g.imageInput()), denied("media_format_mismatch"));
});

test("signal and injected session lifetime track accepted readers until their actual media operation ends", async (t) => {
  const f = await fixture(t), cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(f.reader.readSnapshot(f.input(), { signal: cancelled.signal }), { name: "AbortError" }); assert.equal(f.withClientCalls, 0);
  const abort = new AbortController(); f.hooks.describe = () => abort.abort();
  await assert.rejects(f.reader.readImage(f.imageInput(), { signal: abort.signal }), { name: "AbortError" }); assert.equal(f.calls.includes("read"), false);
  const g = await fixture(t), entered = deferred(), release = deferred(); g.hooks.read = async () => { entered.resolve(); await release.promise; };
  const pending = g.reader.readImage(g.imageInput()), rejected = assert.rejects(pending, denied("page_session_closed")); await entered.promise;
  assert.equal(g.active, 1); g.close(); assert.equal(g.active, 1); release.resolve(); await rejected; assert.equal(g.active, 0);
  assert.equal(g.personal.read("project-a", g.draft.id).revision, g.draft.revision);
});
