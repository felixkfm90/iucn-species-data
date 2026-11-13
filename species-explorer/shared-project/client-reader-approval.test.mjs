import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fixture } from "./test-fixtures.mjs";
import { editorialIntegrationFixture } from "./editorial-integration-fixtures.mjs";
import { buildPageEditorialAdoption } from "./species-editorial-adoption.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient } from "./client.mjs";
import { createExplorerSpeciesApproval } from "./explorer-species-approval.mjs";
import { createLocalNormalMediaReader } from "./local-normal-media.mjs";
import { canonicalJson, digest, objectJson, transportJson } from "./security.mjs";
import { encodePageAuthoringDraft } from "../page-authoring/shared.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";
import { createTestWebp, createTestJpeg } from "../server-test-fixtures.mjs";
import { matchProjectFeatureRoute, invokeSharedProjectOperation } from "../project-feature-routes.mjs";
import { createPageAuthoringExplorerFixture } from "../server-page-authoring-fixtures.mjs";

const denied = (...codes) => error => codes.includes(error.code);
const requestFor = (object, status) => ({ sourceScope: digest(transportJson([status.baseUrl, status.projectId, status.user.id])),
  expectedEditRevision: digest(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data })), expectedRevision: object.revision });
async function scoped(fn, { files = false, fetchHook, readHook, legacy = false, large = false } = {}) {
  const f = fixture(); let http, client, approval;
  try {
    const { store, a, b } = await f.initialized(), content = files ? { "portrait.webp": createTestWebp(), "map.jpg": createTestJpeg(6, 4) } : {};
    const fileMetadata = Object.fromEntries(Object.entries(content).map(([slot, bytes]) => [slot, { id: `original:${slot}`, bytes: bytes.length,
      sha256: digest(bytes), mimeType: slot === "map.jpg" ? "image/jpeg" : "image/webp" }]));
    const source = editorialIntegrationFixture(store, a, { files: fileMetadata });
    if (files || large) {
      const document = structuredClone(source.pageObject.data.document); document.sections.at(-1).requested = true;
      if (large) document.sections.find(section => section.kind === "editorial").blocks = Array.from({ length: 12 }, (_, index) => ({ type: "paragraph", text: `${index}: ${"Vollständiger Fachtext. ".repeat(2200)}` }));
      source.pageObject = store.submitChange(a.token, { kind: "page", id: source.pageObject.id, baseRevision: source.pageObject.revision,
        changeId: "reader-approval-map-request", data: encodePageAuthoringDraft({ id: source.pageObject.data.pageId, revision: fingerprint("reader-map-request"), document }) }).object;
      const directory = path.join(f.root, "species-assets", source.speciesObject.data.assets.assetName); await fs.mkdir(directory, { recursive: true });
      for (const [slot, bytes] of Object.entries(content)) await fs.writeFile(path.join(directory, slot), bytes);
    }
    if (!legacy) {
      const candidate = buildPageEditorialAdoption(source);
      source.speciesObject = store.submitChange(a.token, { kind: "species", id: source.speciesObject.id, baseRevision: source.speciesObject.revision,
        changeId: "reader-approval-adoption", data: candidate.data, intent: candidate.intent }).object;
    }
    http = createSharedProjectHttp({ store }); const address = await http.listen(), requests = [];
    client = createSharedProjectClient({ filename: path.join(f.root, "reader-client.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true,
      fetchImpl: async (url, options) => { requests.push({ url: String(url), method: options?.method || "GET" }); return fetchHook ? fetchHook(url, options, { store, a, b, source }) : fetch(url, options); } });
    await client.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
    let reads = 0, chain = Promise.resolve(); const reader = createLocalNormalMediaReader({ repoRoot: f.root });
    const normalMediaReader = { async read(record, context) { reads++; return readHook ? readHook(record, context, reader, { store, a, b, source }) : reader.read(record, context); } };
    const withClient = operation => {
      const result = chain.then(async () => { const status = await client.status(); return operation(client, { status,
        permissions: { canRead: Boolean(status.user), canEdit: !status.readOnlySession && status.user?.role !== "reader",
          canApprove: !status.readOnlySession && ["admin", "publisher"].includes(status.user?.role) && status.connection === "online" } }); });
      chain = result.catch(() => {}); return result;
    };
    approval = createExplorerSpeciesApproval({ withClient, normalMediaReader });
    const preview = async (extra = {}) => approval.preview(source.speciesObject.id, { ...requestFor(await client.getObject("species", source.speciesObject.id), await client.status()), ...extra });
    await fn({ f, store, a, b, source, client, approval, preview, requests, content, get reads() { return reads; } });
  } finally { approval?.close(); await client?.close(); await http?.close(); f.cleanup(); }
}

test("the PC reader2 preview and explicit release preserve structured content and never upload files while reviewing", () => scoped(async c => {
  const preview = await c.preview(); assert.equal(preview.readerCatalogVersion, 2); assert.equal(preview.readerSpecies.content.kind, "structured");
  assert.equal(preview.readerSpecies.content.title, c.source.speciesObject.data.editorial.title); assert.equal(preview.missingMedia.length, 0);
  assert.equal(c.reads, 0); assert.equal(c.requests.some(value => value.method === "PUT" || value.url.includes("/normal-media")), false);
  assert.equal(c.store.readerCatalog(c.a.token).species.length, 0);
  const result = await c.approval.approve(c.source.speciesObject.id, { token: preview.token });
  assert.equal(result.approved, true); assert.equal(result.externalPublication, "not-performed");
  assert.equal(c.store.readerCatalog(c.a.token).species[0].content.kind, "structured");
}));

test("the real PC preview and release preserve a structured source beyond the old 512KiB review boundary", () => scoped(async c => {
  assert.ok(Buffer.byteLength(objectJson(c.source.speciesObject.data)) > 512 * 1024);
  const preview = await c.preview(), blocks = preview.readerSpecies.content.sections.find(section => section.kind === "editorial").blocks;
  assert.equal(blocks.length, 12); assert.ok(blocks.every(block => block.text.length > 50000));
  await c.approval.approve(c.source.speciesObject.id, { token: preview.token });
  assert.deepEqual(c.store.readerCatalog(c.a.token).species[0].content.sections.find(section => section.kind === "editorial").blocks, blocks);
}, { large: true }));

test("missing normal files are explicitly provided unchanged, consume the old review and require a new human release", () => scoped(async c => {
  const preview = await c.preview(); assert.equal(preview.missingMedia.length, 2); assert.equal(preview.mediaPreparation.available, true);
  assert.deepEqual(preview.mediaPreparation.files.map(file => file.slot), ["portrait.webp", "map.jpg"]); assert.equal(c.reads, 0);
  const blocked = await c.preview(); await assert.rejects(c.approval.approve(c.source.speciesObject.id, { token: blocked.token }), denied("reader_media_required"));
  const result = await c.approval.provideMedia(c.source.speciesObject.id, { token: preview.token });
  assert.equal(result.provided, true); assert.equal(result.requiresNewReview, true); assert.equal(result.completed.length, 2); assert.equal(c.reads, 2);
  assert.equal(c.store.readerCatalog(c.a.token).species.length, 0);
  await assert.rejects(c.approval.approve(c.source.speciesObject.id, { token: preview.token }), denied("review_required"));
  const fresh = await c.preview(); assert.equal(fresh.missingMedia.length, 0);
  await c.approval.approve(c.source.speciesObject.id, { token: fresh.token });
  const reader = c.store.readerCatalog(c.a.token).species[0]; assert.equal(reader.media.portrait.kind, "project-normal"); assert.equal(reader.media.map.kind, "project-normal");
  for (const [slot, bytes] of Object.entries(c.content)) assert.deepEqual(await fs.readFile(path.join(c.f.root, "species-assets", "Testkauz", slot)), bytes);
}, { files: true }));

test("an interrupted normal preparation reports confirmed earlier files and does not repeat or approve any open file", () => scoped(async c => {
  const preview = await c.preview(), result = await c.approval.provideMedia(c.source.speciesObject.id, { token: preview.token });
  assert.equal(result.provided, false); assert.deepEqual(result.completed.map(item => item.slot), ["portrait.webp"]); assert.equal(result.stopped.slot, "map.jpg");
  assert.equal(result.requiresNewReview, true); assert.equal(result.externalPublication, "not-performed");
  assert.equal(c.store.getObject(c.a.token, "species", c.source.speciesObject.id).approval, "draft");
  await assert.rejects(c.approval.provideMedia(c.source.speciesObject.id, { token: preview.token }), denied("review_required"));
  const fresh = await c.preview(); assert.deepEqual(fresh.missingMedia.map(item => item.role), ["map"]);
}, { files: true, readHook(record, context, reader) { if (context.slot === "map.jpg") throw new Error("Synthetic local failure with private path sentinel"); return reader.read(record, context); } }));

test("role or source drift before file provision prevents every local read and remote upload", () => scoped(async c => {
  const preview = await c.preview(); c.store.updateUser(c.b.token, c.a.user.id, { role: "contributor", expectedVersion: c.store.me(c.a.token).version });
  await c.client.capabilities();
  await assert.rejects(c.approval.provideMedia(c.source.speciesObject.id, { token: preview.token }), denied("forbidden", "approval_review_changed"));
  assert.equal(c.reads, 0); assert.equal(c.requests.some(item => item.method === "PUT"), false);
}, { files: true }));

test("an old service capability cannot be treated as reader2 and produces no approval or file transfer", () => scoped(async c => {
  await assert.rejects(c.preview(), denied("reader_catalog_version_required"));
  assert.equal(c.store.getObject(c.a.token, "species", c.source.speciesObject.id).approval, "draft");
  assert.equal(c.requests.some(item => item.method === "PUT" || item.url.endsWith("/approve")), false);
}, { fetchHook: async (url, options) => {
  const response = await fetch(url, options);
  if (!String(url).endsWith("/capabilities")) return response;
  const value = await response.json(); delete value.boundReaderApproval; delete value.readerCatalogVersions;
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
} }));

test("a previously approved legacy record can explicitly prepare reader2 files without a second approval or changing text", () => scoped(async c => {
  c.store.approveObject(c.a.token, "species", c.source.speciesObject.id, { expectedRevision: c.source.speciesObject.revision }); await c.client.refresh();
  const before = canonicalJson(c.store.getObject(c.a.token, "species", c.source.speciesObject.id).data, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 });
  await assert.rejects(c.preview(), denied("already_approved"));
  const preview = await c.preview({ readerCatalogVersion: 2 }); assert.equal(preview.alreadyApproved, true);
  const result = await c.approval.provideMedia(c.source.speciesObject.id, { token: preview.token }); assert.equal(result.provided, true);
  const fresh = await c.preview({ readerCatalogVersion: 2 }); assert.equal(fresh.alreadyApproved, true); assert.equal(fresh.missingMedia.length, 0);
  await assert.rejects(c.approval.approve(c.source.speciesObject.id, { token: fresh.token }), denied("already_approved"));
  assert.equal(canonicalJson(c.store.getObject(c.a.token, "species", c.source.speciesObject.id).data, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 }), before);
}, { files: true, legacy: true }));

test("the existing local route dispatches only the explicit media preparation action", async () => {
  const pathname = "/api/shared-project/species/fixture-owl/approval/provide-media", route = matchProjectFeatureRoute("POST", pathname), calls = [];
  assert.equal(matchProjectFeatureRoute("GET", pathname), null); assert.equal(route.action, "species-approval-provide-media");
  const result = await invokeSharedProjectOperation({ speciesApproval: { provideMedia(id, input) { calls.push({ id, input }); return { provided: true }; } } }, { ...route, payload: { token: "review-token" } });
  assert.equal(result.provided, true); assert.deepEqual(calls, [{ id: "fixture-owl", input: { token: "review-token" } }]);
});

test("the actual Explorer HTTP route binds the normal-file action to its local session and trusted repository", async t => {
  const f = await createPageAuthoringExplorerFixture(t, { normalSlots: ["portrait.webp", "map.jpg"] });
  const readJson = async (response, expected) => { const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value; };
  await readJson(await f.post("/api/shared-project/connect", { baseUrl: f.address.url, username: f.a.user.username, password: f.project.password }), 200);
  const id = f.record.id, prefix = `/api/shared-project/species/${id}/approval`;
  const object = f.store.getObject(f.a.token, "species", id), status = await readJson(await fetch(`${f.base}/api/shared-project`), 200);
  const input = { ...requestFor(object, { ...status.status, baseUrl: f.address.url }), readerCatalogVersion: 2 };
  const preview = await readJson(await f.post(`${prefix}/preview`, input), 200);
  assert.equal(preview.missingMedia.length, 2); assert.equal(preview.mediaPreparation.available, true);
  await readJson(await fetch(`${f.base}${prefix}/provide-media`, { method: "POST", headers: { "Content-Type": "application/json", Origin: f.base }, body: JSON.stringify({ token: preview.token }) }), 403);
  await readJson(await f.post(`${prefix}/provide-media`, { token: preview.token }, { Origin: "https://foreign.example" }), 403);
  const result = await readJson(await f.post(`${prefix}/provide-media`, { token: preview.token }), 200);
  assert.equal(result.provided, true); assert.equal(result.completed.length, 2); assert.equal(result.externalPublication, "not-performed");
  assert.equal(f.store.getObject(f.a.token, "species", id).approval, "draft");
  assert.deepEqual(await Promise.all(f.originalFiles.map(filename => fs.readFile(path.join(f.repoRoot, filename)))), f.originalBytes);
});
