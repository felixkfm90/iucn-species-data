import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fixture, species as legacySpecies } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient } from "./client.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { digest, objectJson, transportJson } from "./security.mjs";
import { createExplorerSpeciesApproval } from "./explorer-species-approval.mjs";
import { projectSpeciesRecordToCatalog } from "./species-record.mjs";

function record() {
  return { type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Testkauz", english: "Synthetic owl", genus: "Strix", species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", privateOriginal: "PRIVATE_INPUT" },
    generated: { URLSlug: "fixture-owl", Genus: "Strix", Species: "fixture", Subphylum: "Vertebrata", Status: "LC", privateOriginal: "PRIVATE_GENERATED" },
    taxonomyOverride: { reason: "Synthetic taxonomy reason", privateOriginal: "PRIVATE_TAXONOMY" }, assessmentBinding: { id: "PRIVATE_BINDING" },
    assets: { assetName: "Testkauz (gebunden)", files: { "map.jpg": { id: "fixture:map", bytes: 42, sha256: "a".repeat(64), mimeType: "image/jpeg",
      url: "https://felixkfm90.github.io/iucn-species-data/species-assets/Testkauz%20(gebunden)/map.jpg" } },
    overrides: { map: { protectedFromPipeline: true, source: "Eigene Karte" } }, credits: null, portraitMetadata: { prompt: "PRIVATE_PROMPT" } },
    editorial: { websiteUrl: null, sections: [{ id: "appearance", title: "Aussehen", text: "Synthetic curated article", intentionallyEmpty: false }],
      gallery: [{ id: "photo-fixture", url: "https://images.squarespace-cdn.com/content/fixture.jpg", alt: "Synthetic image", caption: "Synthetic caption", order: 0 }],
      generalSectionId: null, embeddedGeneralText: null } };
}
const requestFor = (object, status) => ({ sourceScope: digest(transportJson([status.baseUrl, status.projectId, status.user.id])),
  expectedEditRevision: digest(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data })), expectedRevision: object.revision });
const denied = (...codes) => (error) => codes.includes(error.code);
function deferred() { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }
function unit(options = {}) {
  let now = 0, token = 0, getImpl = null, approveImpl = null, chain = Promise.resolve();
  let object = { kind: "species", id: "fixture-owl", revision: "synthetic-server-revision", ordinal: 1, parentRevision: null,
    authorId: "synthetic-author", createdAt: "2026-11-01T00:00:00.000Z", data: record(), approvedRevision: null, approval: "draft", localPending: false, localConflict: false };
  const state = { status: { connection: "online", baseUrl: "https://project.example.org", projectId: "fixture-project", user: { id: "fixture-person", role: "admin" },
    readOnlySession: false, pending: 0, conflicts: 0 }, permissions: { canRead: true, canEdit: true, canApprove: true } };
  const calls = { reads: 0, approvals: [] }, client = {
    async getObject() { calls.reads++; return getImpl ? getImpl() : structuredClone(object); },
    async approveObject(kind, id, input) {
      calls.approvals.push({ kind, id, input: structuredClone(input) });
      return approveImpl ? approveImpl(input) : { ...structuredClone(object), approvedRevision: object.revision, approval: "approved" };
    },
  };
  const approval = createExplorerSpeciesApproval({ withClient: (operation) => {
    const pending = chain.then(() => operation(client, state)); chain = pending.catch(() => {}); return pending;
  }, clock: () => now, tokenId: () => `synthetic-approval-${++token}`, ...options });
  return { approval, state, calls, get object() { return object; }, setObject(value) { object = value; }, setTime(value) { now = value; },
    setGet(fn) { getImpl = fn; }, setApprove(fn) { approveImpl = fn; },
    preview: () => approval.preview(object.id, requestFor(object, state.status)) };
}
async function scoped(fn) {
  const f = fixture(), clients = [], adapters = []; let http;
  try {
    const initialized = await f.initialized(), { store, a } = initialized;
    const object = store.createObject(a.token, { kind: "species", id: "fixture-owl", data: record() });
    http = createSharedProjectHttp({ store }); const address = await http.listen();
    async function open({ username = a.user.username, fetchImpl = fetch, cacheName = `approval-${clients.length}.sqlite` } = {}) {
      const filename = path.join(f.root, cacheName), client = createSharedProjectClient({ filename, localStorageConfirmed: true, allowLoopbackHttp: true, fetchImpl });
      clients.push(client); await client.connect({ baseUrl: address.url, username, password: f.password });
      const withClient = async (operation) => {
        const status = await client.status(), full = !status.readOnlySession && ["admin", "publisher"].includes(status.user?.role) && status.connection === "online";
        return operation(client, { status, permissions: { canRead: Boolean(status.user), canEdit: !status.readOnlySession && status.user?.role !== "reader", canApprove: full } });
      };
      const approval = createExplorerSpeciesApproval({ withClient }); adapters.push(approval);
      return { client, approval, filename, async preview() { return approval.preview(object.id, requestFor(await client.getObject("species", object.id), await client.status())); } };
    }
    await fn({ ...initialized, f, address, object, open });
  } finally { for (const adapter of adapters) adapter.close(); for (const client of clients) await client.close(); if (http) await http.close(); f.cleanup(); }
}

test("approval preview uses the normal curated species DTO and performs no approval or source mutation", async () => {
  const f = unit(), before = structuredClone(f.object), preview = await f.preview();
  assert.deepEqual(f.object, before); assert.equal(f.calls.approvals.length, 0); assert.equal(f.calls.reads, 1);
  assert.equal(preview.source, "shared-project"); assert.equal(preview.internalOnly, true); assert.equal(preview.externalPublication, "not-performed");
  assert.equal(preview.species.id, f.object.id); assert.equal(preview.species.revision, f.object.revision); assert.equal(preview.species.ordinal, 1);
  assert.equal(preview.species.approvedRevision, null); assert.equal(preview.species.manual.size, "20 cm");
  assert.equal(preview.species.assets.map.url, f.object.data.assets.files["map.jpg"].url);
  assert.equal(preview.species.editorial.sections[0].text, "Synthetic curated article"); assert.equal(preview.species.editorial.gallery[0].alt, "Synthetic image");
  assert.equal(preview.species.assets.map.hashVerified, false); assert.doesNotMatch(JSON.stringify(preview), /PRIVATE_INPUT|PRIVATE_GENERATED|PRIVATE_TAXONOMY|PRIVATE_BINDING|PRIVATE_PROMPT/);
  assert.deepEqual(preview.readerSpecies, projectSpeciesRecordToCatalog(f.object.data));
  assert.match(preview.readerSpecies.sections[0].text, /Größe: 20 cm/);
});

test("only full online administrators and publishers can prepare approval; legacy and this object's pending work remain blocked", async () => {
  for (const change of [
    (f) => { f.state.status.user.role = "contributor"; }, (f) => { f.state.status.user.role = "reader"; },
    (f) => { f.state.status.connection = "offline"; }, (f) => { f.state.status.readOnlySession = true; },
    (f) => { f.state.permissions.canApprove = false; }, (f) => { f.state.permissions.canRead = false; },
    (f) => { delete f.state.status.readOnlySession; }, (f) => { f.state.status.projectId = ""; },
    (f) => { f.state.status.baseUrl = ""; }, (f) => { f.state.status.user.id = ""; },
  ]) {
    const f = unit(); change(f); await assert.rejects(f.preview(), denied("forbidden")); assert.equal(f.calls.reads, 0); assert.equal(f.calls.approvals.length, 0);
  }
  const publisher = unit(); publisher.state.status.user.role = "publisher"; assert.ok((await publisher.preview()).token);
  for (const flag of ["localPending", "localConflict"]) {
    const f = unit(); f.object[flag] = true; await assert.rejects(f.preview(), denied("pending_review")); assert.equal(f.calls.approvals.length, 0);
  }
  const legacy = unit(); legacy.object.data = legacySpecies(); await assert.rejects(legacy.preview(), denied("species_record_required"));
  const approved = unit(); approved.object.approvedRevision = approved.object.revision; approved.object.approval = "approved";
  await assert.rejects(approved.preview(), denied("already_approved")); assert.equal(approved.calls.approvals.length, 0);
});

test("preview requires exact source scope, edit stamp and server revision", async () => {
  for (const key of ["sourceScope", "expectedEditRevision", "expectedRevision"]) {
    const f = unit(), request = requestFor(f.object, f.state.status); request[key] = "stale";
    await assert.rejects(f.approval.preview(f.object.id, request), denied("approval_review_changed")); assert.equal(f.calls.approvals.length, 0);
  }
});

test("one-use approval submits only the reviewed revision, complete data hash and person/project/role binding", async () => {
  const f = unit(); f.state.status.pending = 9; f.state.status.conflicts = 2;
  const preview = await f.preview(), result = await f.approval.approve(f.object.id, { token: preview.token });
  assert.deepEqual(f.calls.approvals, [{ kind: "species", id: f.object.id, input: { expectedRevision: f.object.revision,
    expectedDataHash: digest(objectJson(f.object.data)), requiredBinding: { baseUrl: f.state.status.baseUrl, projectId: f.state.status.projectId,
      userId: f.state.status.user.id, role: "admin" } } }]);
  assert.equal(result.approved, true); assert.equal(result.serverConfirmed, true); assert.equal(result.reviewedRevision, f.object.revision);
  assert.equal(result.approvedRevision, f.object.revision); assert.equal(result.hasNewerLocalChanges, false); assert.equal(result.externalPublication, "not-performed");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_INPUT|PRIVATE_PROMPT/);
  await assert.rejects(f.approval.approve(f.object.id, { token: preview.token }), denied("review_required")); assert.equal(f.calls.approvals.length, 1);
});

test("scope, role and permission changes consume the preview without performing approval", async () => {
  for (const change of [
    (f) => { f.state.status.baseUrl = "https://other.example.org"; }, (f) => { f.state.status.projectId = "other-project"; },
    (f) => { f.state.status.user.id = "other-person"; }, (f) => { f.state.status.user.role = "publisher"; },
    (f) => { f.state.permissions.canEdit = false; }, (f) => { f.state.permissions.canApprove = false; },
    (f) => { f.state.status.connection = "offline"; }, (f) => { f.state.status.readOnlySession = true; },
  ]) {
    const f = unit(), preview = await f.preview(); change(f);
    await assert.rejects(f.approval.approve(f.object.id, { token: preview.token }), denied("approval_review_changed", "forbidden"));
    await assert.rejects(f.approval.approve(f.object.id, { token: preview.token }), denied("review_required")); assert.equal(f.calls.approvals.length, 0);
  }
});

test("any changed record or object metadata and new local work invalidate the complete reviewed state", async () => {
  for (const change of [
    (object) => { object.data.input.size = "Changed locally"; }, (object) => { object.data.input.privateOriginal = "New private original"; },
    (object) => { object.revision = "new-revision"; }, (object) => { object.ordinal++; },
    (object) => { object.authorId = "other-author"; }, (object) => { object.approvedRevision = object.revision; object.approval = "approved"; },
    (object) => { object.localPending = true; }, (object) => { object.localConflict = true; },
  ]) {
    const f = unit(), preview = await f.preview(); change(f.object);
    await assert.rejects(f.approval.approve(f.object.id, { token: preview.token }), denied("approval_review_changed", "pending_review"));
    assert.equal(f.calls.approvals.length, 0); await assert.rejects(f.approval.approve(f.object.id, { token: preview.token }), denied("review_required"));
  }
});

test("expired, consumed, wrong-object and closed capabilities cannot schedule approval", async () => {
  const expired = unit({ ttlMs: 10 }), preview = await expired.preview(); expired.setTime(10);
  await assert.rejects(expired.approval.approve(expired.object.id, { token: preview.token }), denied("review_required")); assert.equal(expired.calls.approvals.length, 0);
  const wrong = unit(), other = await wrong.preview(); await assert.rejects(wrong.approval.approve("other-art", { token: other.token }), denied("review_required"));
  await assert.rejects(wrong.approval.approve(wrong.object.id, { token: other.token }), denied("review_required"));
  const closed = unit(), checked = await closed.preview(); closed.approval.close();
  await assert.rejects(closed.approval.approve(closed.object.id, { token: checked.token }), denied("client_closed"));
  await assert.rejects(closed.preview(), denied("client_closed")); assert.equal(closed.calls.approvals.length, 0);
  const delayed = unit(), delayedPreview = await delayed.preview(), entered = deferred(), release = deferred();
  delayed.setGet(async () => { entered.resolve(); await release.promise; return structuredClone(delayed.object); });
  const attempt = delayed.approval.approve(delayed.object.id, { token: delayedPreview.token }), rejected = assert.rejects(attempt, denied("client_closed"));
  await entered.promise; delayed.approval.close(); release.resolve(); await rejected; assert.equal(delayed.calls.approvals.length, 0);
  const expiring = unit({ ttlMs: 10 }), expiringPreview = await expiring.preview(), readEntered = deferred(), readRelease = deferred();
  expiring.setGet(async () => { readEntered.resolve(); await readRelease.promise; return structuredClone(expiring.object); });
  const expiringAttempt = expiring.approval.approve(expiring.object.id, { token: expiringPreview.token }), expiredRead = assert.rejects(expiringAttempt, denied("review_required"));
  await readEntered.promise; expiring.setTime(10); readRelease.resolve(); await expiredRead; assert.equal(expiring.calls.approvals.length, 0);
});

test("failed and mismatched acknowledgements consume the preview and never retry", async () => {
  for (const change of [
    (approved) => { approved.revision = "different-revision"; }, (approved) => { approved.approvedRevision = "different-revision"; },
    (approved) => { approved.approval = "draft"; }, (approved) => { approved.data.input.size = "Unreviewed data"; },
  ]) {
    const f = unit(), preview = await f.preview(); f.setApprove(async () => { const result = { ...structuredClone(f.object), approval: "approved", approvedRevision: f.object.revision }; change(result); return result; });
    await assert.rejects(f.approval.approve(f.object.id, { token: preview.token }), denied("approval_not_confirmed"));
    await assert.rejects(f.approval.approve(f.object.id, { token: preview.token }), denied("review_required")); assert.equal(f.calls.approvals.length, 1);
  }
  const failed = unit(), preview = await failed.preview(); failed.setApprove(async () => { throw Object.assign(new Error("Synthetic lost response"), { code: "offline" }); });
  await assert.rejects(failed.approval.approve(failed.object.id, { token: preview.token }), denied("offline"));
  await assert.rejects(failed.approval.approve(failed.object.id, { token: preview.token }), denied("review_required")); assert.equal(failed.calls.approvals.length, 1);
});

test("new local work after approval is preserved but is never represented as reviewed and approved content", async () => {
  const f = unit(), preview = await f.preview();
  f.setApprove(async () => {
    const receipt = { ...structuredClone(f.object), approval: "approved", approvedRevision: f.object.revision, localPending: true, localConflict: false };
    f.object.data.input.size = "A newer unreviewed local value"; f.object.localPending = true; return receipt;
  });
  const result = await f.approval.approve(f.object.id, { token: preview.token });
  assert.equal(result.serverConfirmed, true); assert.equal(result.hasNewerLocalChanges, true); assert.equal(result.species.localPending, true);
  assert.equal(result.species.manual.size, "20 cm"); assert.equal(result.reviewedRevision, preview.species.revision);
  assert.doesNotMatch(JSON.stringify(result), /A newer unreviewed local value/); assert.equal(f.object.data.input.size, "A newer unreviewed local value");
});

test("a real second cache writer during authentication blocks approval before any POST and preserves both versions", () => scoped(async ({ open, store, a, object }) => {
  const entered = deferred(), release = deferred(); let hold = false, approvalPosts = 0;
  const f = await open({ fetchImpl: async (url, options) => {
    if (hold && new URL(url).pathname.endsWith("/auth/me")) { hold = false; entered.resolve(); await release.promise; }
    if (options?.method === "POST" && new URL(url).pathname.endsWith("/approve")) approvalPosts++;
    return fetch(url, options);
  } });
  const preview = await f.preview(), writer = createSharedProjectClientStore({ filename: f.filename, localStorageConfirmed: true });
  let attempt;
  try {
    hold = true; attempt = f.approval.approve(object.id, { token: preview.token });
    const rejected = assert.rejects(attempt, denied("pending_review", "approval_review_changed"));
    await entered.promise;
    const binding = writer.active(), next = structuredClone(object.data); next.input.size = "Human second-writer value";
    writer.edit(binding.id, "species", object.id, next); release.resolve(); await rejected;
    assert.equal(approvalPosts, 0); assert.equal(store.getObject(a.token, "species", object.id).approval, "draft");
    assert.equal((await f.client.getObject("species", object.id)).data.input.size, "Human second-writer value");
    await assert.rejects(f.approval.approve(object.id, { token: preview.token }), denied("review_required"));
  } finally { release.resolve(); await attempt?.catch(() => {}); writer.close(); }
}));

test("real admin and publisher approvals preserve other pending objects and expose only the approved mobile projection", () => scoped(async ({ f, open, store, a, b, object }) => {
  const publisher = await store.createUser(a.token, { username: "fixture-publisher", displayName: "Synthetic Publisher", password: f.password, role: "publisher" });
  await store.createUser(a.token, { username: "fixture-reader", displayName: "Synthetic Reader", password: f.password, role: "reader" });
  const reader = await store.login({ username: "fixture-reader", password: f.password });
  for (const [role, username] of [["admin", a.user.username], ["publisher", publisher.username]]) {
    if (role === "publisher") {
      const current = store.getObject(b.token, "species", object.id), next = structuredClone(current.data); next.input.size = "21 cm";
      store.submitChange(b.token, { changeId: "new-version-for-publisher", kind: "species", id: object.id, baseRevision: current.revision, data: next });
    }
    store.createObject(a.token, { kind: "page", id: `other-${role}`, data: { title: "Existing other page" } });
    const client = await open({ username }); await client.client.editExistingObject("page", `other-${role}`, { title: "Human unsent page edit" });
    const preview = await client.preview(), approved = await client.approval.approve(object.id, { token: preview.token });
    assert.equal(approved.serverConfirmed, true); assert.equal(approved.approvedRevision, preview.species.revision); assert.equal(approved.hasNewerLocalChanges, false);
    assert.equal((await client.client.status()).pending, 1); assert.equal(store.getObject(a.token, "page", `other-${role}`).data.title, "Existing other page");
    assert.equal((await client.client.getObject("page", `other-${role}`)).data.title, "Human unsent page edit");
    const catalog = store.catalog(reader.token); assert.equal(catalog.species.length, 1);
    assert.equal(catalog.species[0].sections.find((section) => section.id === "appearance").text, "Synthetic curated article");
    assert.doesNotMatch(JSON.stringify(catalog), /PRIVATE_INPUT|PRIVATE_GENERATED|PRIVATE_PROMPT/);
    await assert.rejects(client.preview(), denied("already_approved"));
  }
}));

test("a changed server revision is never silently substituted for the reviewed version", () => scoped(async ({ open, store, b, object }) => {
  const f = await open(), preview = await f.preview(), next = structuredClone(object.data); next.input.size = "Other person's server text";
  const changed = store.submitChange(b.token, { changeId: "server-version-after-preview", kind: "species", id: object.id, baseRevision: object.revision, data: next });
  await assert.rejects(f.approval.approve(object.id, { token: preview.token }), denied("approval_review_changed", "object_changed"));
  const actual = store.getObject(b.token, "species", object.id); assert.equal(actual.revision, changed.object.revision); assert.equal(actual.approval, "draft");
  assert.equal(actual.data.input.size, "Other person's server text");
  await assert.rejects(f.approval.approve(object.id, { token: preview.token }), denied("review_required"));
}));

test("a last-moment publisher role upgrade stops in the server transaction instead of approving under a different role", () => scoped(async ({ f, open, store, a, b, object }) => {
  const publisher = await store.createUser(a.token, { username: "race-publisher", displayName: "Synthetic role race", password: f.password, role: "publisher" });
  let switched = false;
  const client = await open({ username: publisher.username, fetchImpl: async (url, options) => {
    if (!switched && options?.method === "POST" && new URL(url).pathname.endsWith("/approve")) {
      switched = true; store.updateUser(b.token, publisher.id, { expectedVersion: publisher.version, role: "admin" });
    }
    return fetch(url, options);
  } });
  const preview = await client.preview();
  await assert.rejects(client.approval.approve(object.id, { token: preview.token }), denied("approval_review_changed"));
  assert.equal(switched, true); assert.equal(store.getObject(a.token, "species", object.id).approval, "draft");
}));

test("a lost real acknowledgement does not retry or claim certainty although the reviewed server version may already be approved", () => scoped(async ({ open, store, a, object }) => {
  let posts = 0;
  const f = await open({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (options?.method === "POST" && new URL(url).pathname.endsWith("/approve")) { posts++; throw new Error("Synthetic lost reply after committed approval"); }
    return response;
  } });
  const preview = await f.preview(); await assert.rejects(f.approval.approve(object.id, { token: preview.token }), denied("offline"));
  assert.equal(posts, 1); assert.equal(store.getObject(a.token, "species", object.id).approvedRevision, preview.species.revision);
  await assert.rejects(f.approval.approve(object.id, { token: preview.token }), denied("review_required")); assert.equal(posts, 1);
}));
