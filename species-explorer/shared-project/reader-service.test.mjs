import test from "node:test";
import assert from "node:assert/strict";
import { fixture, species } from "./test-fixtures.mjs";
import { editorialIntegrationFixture } from "./editorial-integration-fixtures.mjs";
import { buildPageEditorialAdoption } from "./species-editorial-adoption.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { encodePageAuthoringDraft } from "../page-authoring/shared.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";
import { digest } from "./security.mjs";
import { createTestPng } from "../server-test-fixtures.mjs";

const denied = code => error => error.code === code;
async function scoped(fn, options) {
  const f = fixture(); let http;
  try {
    const initialized = await f.initialized();
    const source = editorialIntegrationFixture(initialized.store, initialized.a, options);
    http = createSharedProjectHttp({ store: initialized.store }); const address = await http.listen();
    await fn({ f, ...initialized, ...source, address });
  } finally { await http?.close(); f.cleanup(); }
}
function adopt(source, changeId = "reader-editorial-adoption") {
  const candidate = buildPageEditorialAdoption(source);
  return source.store.submitChange(source.a.token, { changeId, kind: "species", id: source.speciesObject.id,
    baseRevision: source.speciesObject.revision, data: candidate.data, intent: candidate.intent }).object;
}
function approveReader(source, current) {
  const preview = source.store.previewReaderApproval(source.a.token, current.id, { expectedRevision: current.revision });
  return source.store.approveObject(source.a.token, "species", current.id, { expectedRevision: current.revision, readerCatalogVersion: 2,
    expectedReview: { projectId: preview.projectId, userId: preview.user.id, role: preview.user.role }, expectedReaderHash: preview.readerHash });
}
async function api(source, pathname, { token = source.a.token, method = "GET", data } = {}) {
  const response = await fetch(`${source.address.url}${pathname}`, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { "Content-Type": "application/json" } : {}) }, body: data ? JSON.stringify(data) : undefined });
  return { status: response.status, value: await response.json() };
}

test("reader2 remains a curated projection and an explicit release never occurs during page adoption", () => scoped(async source => {
  const { store, a, speciesObject } = source;
  store.approveObject(a.token, "species", speciesObject.id, { expectedRevision: speciesObject.revision });
  const previous = store.readerCatalog(a.token); assert.equal(previous.schemaVersion, 2); assert.equal(previous.species[0].content.kind, "legacy-sections");
  const current = adopt(source);
  assert.deepEqual(store.readerCatalog(a.token).species, previous.species);
  assert.throws(() => store.approveObject(a.token, "species", current.id, { expectedRevision: current.revision }), denied("reader_catalog_version_required"));
  approveReader(source, current);
  const result = store.readerCatalog(a.token), text = JSON.stringify(result);
  assert.equal(result.projectId, a.projectId); assert.equal(result.species[0].content.kind, "structured");
  assert.equal(result.species[0].content.title, source.pageObject.data.document.title);
  for (const key of ["originalUnknown", "assessmentBinding", "sourceBindings", "emptyDecision", "authorId", "taxonomyOverride"]) assert.equal(text.includes(`"${key}"`), false, key);
  assert.throws(() => store.catalog(a.token), denied("reader_catalog_version_required"), "the legacy endpoint cannot silently omit or flatten the newer approved species");
}));

test("private image usages retain their own captions and only approved exact bytes are readable", () => scoped(async source => {
  const { store, a } = source, bytes = createTestPng(6, 4), id = "image-11111111-1111-4111-8111-111111111111";
  const binding = { projectId: a.projectId, userId: a.user.id, role: a.user.role };
  store.declareImageMedia(a.token, { id, sha256: digest(bytes), bytes: bytes.length, mimeType: "image/png", attribution: "Eigene Aufnahme", expectedBinding: binding });
  const ready = await store.putImageMedia(a.token, id, bytes, { expectedBinding: binding, mimeType: "image/png" });
  const asset = Object.fromEntries(["id", "projectId", "sha256", "bytes", "mimeType", "attribution"].map(key => [key, ready[key]]));
  const document = structuredClone(source.pageObject.data.document);
  document.images = ["first", "second"].map((usage, index) => ({ id: usage, assetId: id, asset: { ...asset }, alt: `Motiv ${index}`, caption: `Beschriftung ${index}`, decorative: false }));
  const data = encodePageAuthoringDraft({ id: source.pageObject.data.pageId, revision: fingerprint("reader-image-page"), document });
  source.pageObject = store.submitChange(a.token, { kind: "page", id: source.pageObject.id, changeId: "reader-image-source", baseRevision: source.pageObject.revision, data }).object;
  const current = adopt(source);
  const reader = await store.login({ username: a.user.username, password: source.f.password, scope: "read" });
  assert.equal(store.readerCatalog(reader.token).species.length, 0);
  assert.throws(() => store.readImageMedia(reader.token, id), denied("image_media_not_found"));
  approveReader(source, current);
  const result = store.readerCatalog(reader.token).species[0];
  assert.deepEqual(result.media.gallery.map(image => image.id), ["first", "second"]);
  assert.deepEqual(result.media.gallery.map(image => image.caption), ["Beschriftung 0", "Beschriftung 1"]);
  assert.equal(result.media.gallery[0].asset.kind, "project-image");
  assert.equal(result.media.gallery[0].asset.id, result.media.gallery[1].asset.id);
  assert.deepEqual(store.readImageMedia(reader.token, id).bytes, bytes);
}));

test("known requested normal files need real availability before reader2 release, without inventing public URLs", () => scoped(async source => {
  const { store, a } = source;
  const document = structuredClone(source.pageObject.data.document); document.sections.at(-1).requested = true;
  const data = encodePageAuthoringDraft({ id: source.pageObject.data.pageId, revision: fingerprint("requested-private-map"), document });
  source.pageObject = store.submitChange(a.token, { kind: "page", id: source.pageObject.id, changeId: "reader-map-source",
    baseRevision: source.pageObject.revision, data }).object;
  const current = adopt(source);
  assert.throws(() => approveReader(source, current), denied("reader_media_required"));
  assert.equal(store.getObject(a.token, "species", current.id).approval, "draft");
  assert.equal(store.readerCatalog(a.token).species.length, 0);
}, { files: { "map.jpg": { id: "fixture:map", sha256: "b".repeat(64), bytes: 123, mimeType: "image/jpeg" } } }));

test("reader pages use only approved versions, stable order and an authenticated snapshot with a final check", () => scoped(async source => {
  const { store, a } = source;
  for (const id of ["reader-c", "reader-a", "reader-b"]) {
    const value = store.createObject(a.token, { kind: "species", id, data: species(id) });
    store.approveObject(a.token, "species", id, { expectedRevision: value.revision });
  }
  const first = await api(source, "/api/v2/catalog/page?limit=2");
  assert.equal(first.status, 200); assert.equal(first.value.totalCount, 3); assert.equal(first.value.complete, false);
  assert.deepEqual(first.value.species.map(item => item.id), ["reader-a", "reader-b"]);
  const next = await api(source, `/api/v2/catalog/page?limit=2&snapshot=${first.value.snapshot}&cursor=${first.value.nextCursor}`);
  assert.equal(next.status, 200); assert.equal(next.value.complete, true); assert.deepEqual(next.value.species.map(item => item.id), ["reader-c"]);
  const checked = await api(source, `/api/v2/catalog/page?snapshot=${first.value.snapshot}&check=1`);
  assert.equal(checked.status, 200); assert.equal(checked.value.checked, true); assert.deepEqual(checked.value.species, []);
  assert.equal((await api(source, "/api/v2/catalog/page", { token: null })).status, 401);
  assert.equal((await api(source, "/api/v2/catalog/page?limit=2&limit=3")).status, 400);
  assert.equal((await api(source, "/api/v2/catalog/page?kind=species")).status, 400);
  assert.equal((await api(source, "/api/v1/capabilities")).value.readerCatalogVersions.join(","), "1,2");
}));

test("approval or role changes invalidate reader cursors while an unrelated draft does not become visible", () => scoped(async source => {
  const { store, a, b, speciesObject } = source;
  store.approveObject(a.token, "species", speciesObject.id, { expectedRevision: speciesObject.revision });
  const initial = store.readerCatalogPage(a.token);
  store.createObject(a.token, { kind: "species", id: "another-draft", data: species("another-draft") });
  assert.equal(store.readerCatalogPage(a.token, { snapshot: initial.snapshot, checkOnly: true }).totalCount, 1);
  store.updateUser(b.token, a.user.id, { role: "publisher", expectedVersion: store.me(a.token).version });
  assert.throws(() => store.readerCatalogPage(a.token, { snapshot: initial.snapshot, checkOnly: true }), denied("reader_snapshot_changed"));
  const second = store.readerCatalogPage(a.token);
  const other = store.getObject(a.token, "species", "another-draft");
  store.approveObject(a.token, "species", other.id, { expectedRevision: other.revision });
  assert.throws(() => store.readerCatalogPage(a.token, { snapshot: second.snapshot, checkOnly: true }), denied("reader_snapshot_changed"));
  assert.throws(() => store.readerCatalogPage(b.token, { snapshot: second.snapshot, checkOnly: true }), denied("reader_snapshot_changed"));
}));

test("reader2 approval binds the exact curated preview and current person, without trusting a version flag alone", () => scoped(async source => {
  const { store, a, b } = source, current = adopt(source);
  const preview = await api(source, `/api/v2/species/${current.id}/approval-preview`, { method: "POST", data: { expectedRevision: current.revision } });
  assert.equal(preview.status, 200); assert.equal(preview.value.speciesId, current.id); assert.equal(preview.value.externalPublication, "not-performed");
  const expectedReview = { projectId: a.projectId, userId: a.user.id, role: a.user.role };
  assert.throws(() => store.approveObject(a.token, "species", current.id, { expectedRevision: current.revision, readerCatalogVersion: 2 }), denied("invalid_approval_binding"));
  assert.throws(() => store.approveObject(a.token, "species", current.id, { expectedRevision: current.revision, readerCatalogVersion: 2,
    expectedReview, expectedReaderHash: "f".repeat(64) }), denied("approval_review_changed"));
  assert.throws(() => store.approveObject(b.token, "species", current.id, { expectedRevision: current.revision, readerCatalogVersion: 2,
    expectedReview, expectedReaderHash: preview.value.readerHash }), denied("approval_review_changed"));
  const reader = await store.login({ username: a.user.username, password: source.f.password, scope: "read" });
  assert.equal((await api(source, `/api/v2/species/${current.id}/approval-preview`, { method: "POST", token: reader.token,
    data: { expectedRevision: current.revision } })).status, 403);
  assert.throws(() => store.approveObject(reader.token, "species", current.id, { expectedRevision: current.revision, readerCatalogVersion: 2,
    expectedReview, expectedReaderHash: preview.value.readerHash }), denied("forbidden"));
  assert.equal(store.getObject(a.token, "species", current.id).approval, "draft");
  const result = await api(source, `/api/v1/objects/species/${current.id}/approve`, { method: "POST", data: {
    expectedRevision: current.revision, readerCatalogVersion: 2, expectedReview, expectedReaderHash: preview.value.readerHash } });
  assert.equal(result.status, 200); assert.equal(result.value.approval, "approved");
}));

test("HTTP byte paging preserves a multi-MiB collection and refuses an oversized full response without truncation", () => scoped(async source => {
  const { store, a } = source;
  for (const [index, epithet] of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].entries()) {
    const currentSource = { ...source, ...editorialIntegrationFixture(store, a, { id: `reader-large-${index}`,
      pageId: `reader-large-page-${index}`, epithet, commonName: `Testkauz ${epithet}` }) };
    const document = structuredClone(currentSource.pageObject.data.document);
    document.introduction = Array.from({ length: 15 }, () => ({ type: "paragraph", text: String(index).repeat(100000) }));
    const data = encodePageAuthoringDraft({ id: currentSource.pageObject.data.pageId, revision: fingerprint(`large-reader-${index}`), document });
    currentSource.pageObject = store.submitChange(a.token, { kind: "page", id: currentSource.pageObject.id, changeId: `large-page-${index}`,
      baseRevision: currentSource.pageObject.revision, data }).object;
    const current = adopt(currentSource, `large-adoption-${index}`); approveReader(currentSource, current);
  }
  const full = await api(source, "/api/v2/catalog"); assert.equal(full.status, 413); assert.equal(full.value.error.code, "reader_catalog_paging_required");
  const found = []; let snapshot, cursor, pages = 0;
  do {
    const parameters = new URLSearchParams({ limit: "25", ...(snapshot ? { snapshot, cursor } : {}) });
    const response = await api(source, `/api/v2/catalog/page?${parameters}`); assert.equal(response.status, 200);
    assert.ok(Buffer.byteLength(JSON.stringify(response.value)) <= 4 * 1024 * 1024 + 16 * 1024);
    assert.equal(response.value.totalCount, 6); assert.equal(response.value.species.length, 2);
    for (const entry of response.value.species) {
      assert.equal(entry.content.introduction.length, 15); assert.equal(entry.content.introduction[14].text.length, 100000);
      found.push(entry.id);
    }
    snapshot = response.value.snapshot; cursor = response.value.nextCursor; pages++;
    assert.equal(response.value.complete, cursor === null);
  } while (cursor);
  assert.equal(pages, 3); assert.equal(new Set(found).size, 6);
  assert.equal((await api(source, `/api/v2/catalog/page?snapshot=${snapshot}&check=1`)).status, 200);
}));

test("image declaration, completion and actual access revocation invalidate an in-flight reader snapshot", () => scoped(async source => {
  const { store, a, b, speciesObject } = source;
  store.approveObject(a.token, "species", speciesObject.id, { expectedRevision: speciesObject.revision });
  const first = store.readerCatalogPage(a.token), bytes = createTestPng(4, 3), id = "image-22222222-2222-4222-8222-222222222222";
  const binding = { projectId: a.projectId, userId: a.user.id, role: a.user.role };
  store.declareImageMedia(a.token, { id, sha256: digest(bytes), bytes: bytes.length, mimeType: "image/png", attribution: "Eigener Snapshotbeleg", expectedBinding: binding });
  assert.throws(() => store.readerCatalogPage(a.token, { snapshot: first.snapshot, checkOnly: true }), denied("reader_snapshot_changed"));
  const second = store.readerCatalogPage(a.token);
  await store.putImageMedia(a.token, id, bytes, { expectedBinding: binding, mimeType: "image/png" });
  assert.throws(() => store.readerCatalogPage(a.token, { snapshot: second.snapshot, checkOnly: true }), denied("reader_snapshot_changed"));
  const third = store.readerCatalogPage(a.token);
  store.updateUser(b.token, a.user.id, { blocked: true, expectedVersion: store.me(a.token).version });
  assert.equal((await api(source, `/api/v2/catalog/page?snapshot=${third.snapshot}&check=1`)).status, 401);
}));
