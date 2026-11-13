import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createTestPng } from "../server-test-fixtures.mjs";
import { initialDocument, normalizeSpeciesSnapshot } from "../page-authoring/model.mjs";
import { encodePageAuthoringDraft, pageAuthoringObjectId } from "../page-authoring/shared.mjs";
import { createSharedProjectClient, createMemoryCredentialStore } from "./client.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { clientImageBase, inspectClientImage, referencedClientImages, createClientImageMedia } from "./client-image-media.mjs";
import { digest } from "./security.mjs";

const IMAGE = createTestPng(24, 16), PROJECT = "project-a", USER = { id: "user-a", username: "fixture-a", displayName: "Fixture A", role: "admin" };
function page(metadata, title = "Testseite") {
  const species = normalizeSpeciesSnapshot({ slug: "test-art", scientificName: "Strix fixture", commonName: "Test-Art", taxonomy: [], general: [], status: "",
    revision: "species-1", dataSha256: digest("species"), runtimeReady: true, normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null } }, PROJECT, "test-art");
  const document = initialDocument({ templateId: "fn-compact-20261031", species, parentPath: "/wildlife/heimische-tierwelt", title });
  if (metadata) document.images = [{ id: "usage-a", assetId: metadata.id, asset: clientImageBase(metadata), alt: "Testbild", caption: "", decorative: false }];
  return encodePageAuthoringDraft({ id: "draft-a", revision: digest(title), document });
}
async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "client-images-")), filename = path.join(root, "cache.sqlite"), clients = [];
  const records = new Map(), blobs = new Map(), requests = [], credentials = createMemoryCredentialStore();
  const state = { user: { ...USER }, offline: false, support: 1, before: null, after: null };
  let object = { kind: "page", id: pageAuthoringObjectId("draft-a"), revision: randomUUID(), ordinal: 1, parentRevision: null,
    authorId: USER.id, createdAt: "2026-11-01T12:00:00.000Z", data: page(null), approval: "draft", approvedRevision: null };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  const failure = (code, status = 409) => json({ error: { code } }, status);
  async function transport(url, input) {
    if (state.offline) throw new Error("Synthetic offline");
    const pathname = new URL(url).pathname.replace("/api/v1/", ""), method = input.method || "GET";
    requests.push({ pathname, method, body: input.body, headers: input.headers });
    if (state.before) await state.before(pathname, input);
    let result;
    if (pathname === "auth/login") result = json({ projectId: PROJECT, user: state.user, token: "synthetic-session-token", scope: "full" });
    else if (pathname === "auth/me") result = json({ ...state.user, projectId: PROJECT });
    else if (pathname === "auth/logout") result = json({ revoked: true });
    else if (pathname === "capabilities") result = json({ schemaVersion: 1, managedImageMedia: state.support, projectId: PROJECT, user: state.user });
    else if (pathname === "objects/page") {
      const checked = new URL(url).searchParams.has("check");
      result = json({ schemaVersion: 1, projectId: PROJECT, user: state.user, snapshot: digest(object.revision),
        totalCount: 1, checked, complete: true, nextCursor: null, objects: checked ? [] : [object] });
    }
    else if (pathname === "changes") {
      const change = JSON.parse(input.body); object = { ...object, data: change.data, revision: randomUUID(), ordinal: object.ordinal + 1 };
      result = json({ status: "applied", object });
    } else if (pathname === "media" && method === "POST") {
      const { expectedBinding, ...metadata } = JSON.parse(input.body);
      if (expectedBinding.projectId !== PROJECT || expectedBinding.userId !== state.user.id || expectedBinding.role !== state.user.role) result = failure("media_binding_changed");
      else {
        const previous = records.get(metadata.id);
        if (previous && Object.entries(metadata).some(([key, value]) => previous[key] !== value)) result = failure("image_media_changed");
        else { if (!previous) records.set(metadata.id, { ...metadata, projectId: PROJECT, complete: false, width: null, height: null }); result = json(records.get(metadata.id)); }
      }
    } else if (/^media\/image-[a-f0-9-]+\/content$/.test(pathname)) {
      const id = pathname.split("/")[1], metadata = records.get(id);
      if (!metadata) result = failure("not_found", 404);
      else if (method === "PUT") {
        if (input.headers["X-Shared-Project-Id"] !== PROJECT || input.headers["X-Shared-User-Id"] !== state.user.id || input.headers["X-Shared-Role"] !== state.user.role) result = failure("media_binding_changed");
        else {
          const bytes = Buffer.from(input.body), checked = await inspectClientImage(bytes, { attribution: metadata.attribution, projectId: PROJECT, id });
          if (checked.sha256 !== metadata.sha256) result = failure("image_media_changed");
          else { blobs.set(metadata.sha256, bytes); Object.assign(metadata, checked, { complete: true }); result = json(metadata); }
        }
      } else if (!metadata.complete) result = failure("image_media_incomplete");
      else result = new Response(blobs.get(metadata.sha256), { headers: { "Content-Type": metadata.mimeType, "Content-Length": String(metadata.bytes), "X-Content-SHA256": metadata.sha256 } });
    } else if (/^media\/image-[a-f0-9-]+$/.test(pathname)) result = records.has(pathname.split("/")[1]) ? json(records.get(pathname.split("/")[1])) : failure("not_found", 404);
    else throw new Error(`Unexpected fixture request ${method} ${pathname}`);
    return state.after ? await state.after(pathname, input, result) || result : result;
  }
  function open(extra = {}) {
    const client = createSharedProjectClient({ filename, localStorageConfirmed: true, credentialStore: credentials, fetchImpl: transport, ...options, ...extra }); clients.push(client); return client;
  }
  t.after(async () => { for (const entry of clients) await entry.close(); fs.rmSync(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 20 }); });
  const client = open(); await client.connect({ baseUrl: "https://fixture.invalid", username: USER.username, password: "fixture-password" });
  return { root, filename, client, open, state, records, blobs, requests, setObject(value) { object = value; }, getObject: () => object,
    async queue(metadata, title = "Geänderter Entwurf") { return client.editExistingObject("page", object.id, page(metadata, title)); } };
}

test("personal media imports decode exact bytes, deduplicate storage and never expose bytes or credentials in ordinary DTOs", async (t) => {
  const f = await fixture(t), before = f.requests.length, input = Buffer.from(IMAGE), imported = await f.client.media.importImage({ buffer: input, attribution: "Eigene Aufnahme" }); input.fill(0);
  const second = await f.client.media.importImage({ buffer: IMAGE, attribution: "Zweiter Verwendungsbeleg" });
  assert.notEqual(imported.id, second.id); assert.equal(imported.sha256, second.sha256); assert.equal(imported.width, 24); assert.equal(imported.height, 16);
  assert.deepEqual((await f.client.media.readImage(imported.id)).buffer, IMAGE);
  assert.equal(f.requests.length, before); const described = await f.client.media.describeImage(imported.id);
  assert.equal(described.localAvailable, true); assert.equal(described.remoteBacked, false); assert.equal(Object.hasOwn(described, "buffer"), false);
  const db = new DatabaseSync(f.filename, { readOnly: true });
  try { assert.equal(db.prepare("PRAGMA user_version").get().user_version, 4); assert.equal(db.prepare("SELECT count(*) AS n FROM image_blobs").get().n, 1); assert.equal(db.prepare("SELECT count(*) AS n FROM image_media").get().n, 2); }
  finally { db.close(); }
  const dto = JSON.stringify([await f.client.status(), await f.client.listObjects(), await f.client.media.budget()]);
  assert.ok(!dto.includes("synthetic-session-token")); assert.ok(!dto.includes('"buffer"')); assert.equal((await f.client.media.budget()).profileBudgetChecked, false);
});

test("normal image-UUID roles and exact aliases require no personal image blob or upload, while a distinct gallery proof still does", async () => {
  const reference = { id: "image-11111111-1111-4111-8111-111111111111", projectId: PROJECT, sha256: "a".repeat(64), bytes: 123, mimeType: "image/webp", attribution: "Quelle" };
  const data = { type: "fn-species-page", schemaVersion: 1, document: { species: { normalAssets: { portrait: reference } }, images: [{ id: "normal-use", asset: { ...reference } }] } };
  let lookups = 0, network = 0;
  const media = createClientImageMedia({ capture: () => ({ id: "fixture-binding", projectId: PROJECT, user: USER }),
    store: { media: { get() { lookups++; return null; } } }, online: async () => { network++; throw new Error("No normal image-register request allowed"); } });
  assert.deepEqual(referencedClientImages(data), []); media.requireReferences(data); await media.ensureReferences(data);
  assert.equal(lookups, 0); assert.equal(network, 0);
  data.document.images[0].asset.sha256 = "b".repeat(64);
  assert.deepEqual(referencedClientImages(data), [{ ...reference, sha256: "b".repeat(64) }]);
  assert.throws(() => media.requireReferences(data), { code: "image_media_missing" }); assert.equal(lookups, 1);
  assert.deepEqual(referencedClientImages({ type: "fn-species-record", schemaVersion: 1, assets: { files: { "portrait.webp": reference } }, editorial: { gallery: [reference] } }), []);
  assert.deepEqual(referencedClientImages({ media: { portrait: reference, sounds: [], gallery: [] } }), []);
});

test("invalid/truncated image bytes and oversized images never enter the personal cache", async (t) => {
  const f = await fixture(t);
  for (const bytes of [Buffer.from("not an image"), IMAGE.subarray(0, IMAGE.length - 10), Buffer.alloc(20 * 1024 * 1024 + 1)]) await assert.rejects(f.client.media.importImage({ buffer: bytes }));
  assert.equal((await f.client.media.budget()).imageBytes, 0);
});

test("offline reopen preserves image bytes and provenance and a different person cannot read the previous person's image", async (t) => {
  const f = await fixture(t), image = await f.client.media.importImage({ buffer: IMAGE }); await f.client.close(); f.state.offline = true;
  const reopened = f.open(); assert.deepEqual((await reopened.media.readImage(image.id)).buffer, IMAGE);
  const before = f.requests.length; await reopened.getObject("page", f.getObject().id); await reopened.listObjects(); await reopened.media.describeImage(image.id); assert.equal(f.requests.length, before);
  f.state.offline = false; f.state.user = { ...USER, id: "user-b", username: "fixture-b" };
  await reopened.connect({ baseUrl: "https://fixture.invalid", username: "fixture-b", password: "fixture-password" });
  await assert.rejects(reopened.media.readImage(image.id), { code: "image_media_not_local" });
  await reopened.disconnect(); await assert.rejects(reopened.media.readImage(image.id), { code: "authentication_required" });
});

test("targeted page sync uploads each exact image before the existing object CAS without entering a second queue", async (t) => {
  const f = await fixture(t), image = await f.client.media.importImage({ buffer: IMAGE, attribution: "Quelle" }); await f.queue(image); const start = f.requests.length;
  await f.client.sync({ kind: "page", id: f.getObject().id });
  const requests = f.requests.slice(start), upload = requests.findIndex(({ method }) => method === "PUT"), cas = requests.findIndex(({ pathname }) => pathname === "changes");
  assert.ok(upload >= 0 && cas > upload); assert.equal(f.records.get(image.id).complete, true); assert.deepEqual(f.blobs.get(image.sha256), IMAGE);
  assert.equal((await f.client.status()).pending, 0); assert.equal((await f.client.media.describeImage(image.id)).remoteBacked, true);
});

test("lost image completion acknowledgement preserves bytes and exact queued change for idempotent resume", async (t) => {
  const f = await fixture(t), image = await f.client.media.importImage({ buffer: IMAGE }); await f.queue(image); let lose = true;
  f.state.after = (pathname, input) => { if (lose && pathname.endsWith("/content") && input.method === "PUT") { lose = false; throw new Error("Synthetic lost media acknowledgement"); } };
  await assert.rejects(f.client.sync({ kind: "page", id: f.getObject().id }), { code: "offline" });
  assert.equal((await f.client.status()).pending, 1); assert.deepEqual((await f.client.media.readImage(image.id)).buffer, IMAGE);
  const count = f.requests.filter(({ method }) => method === "PUT").length;
  await f.client.sync({ kind: "page", id: f.getObject().id }); assert.equal((await f.client.status()).pending, 0);
  assert.equal(f.requests.filter(({ method }) => method === "PUT").length, count);
});

test("server-backed metadata can be retained and edited offline without downloading website photos", async (t) => {
  const f = await fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: PROJECT });
  f.records.set(metadata.id, { ...metadata, complete: true }); f.blobs.set(metadata.sha256, IMAGE);
  const start = f.requests.length, described = await f.client.media.refreshMetadata(metadata.id);
  assert.equal(described.remoteBacked, true); assert.equal(described.localAvailable, false);
  assert.ok(f.requests.slice(start).every(({ pathname }) => !pathname.endsWith("/content")));
  f.state.offline = true; await f.queue(metadata, "Offline nur Text geändert");
  assert.equal((await f.client.status()).pending, 1); await assert.rejects(f.client.media.readImage(metadata.id), { code: "image_media_not_local" });
  f.state.offline = false; await f.client.media.downloadImage(metadata.id); assert.deepEqual((await f.client.media.readImage(metadata.id)).buffer, IMAGE);
});

test("missing capability, immutable metadata mismatch and role drift cannot send the page CAS", async (t) => {
  for (const mode of ["capability", "metadata", "role"]) {
    const f = await fixture(t), image = await f.client.media.importImage({ buffer: IMAGE }); await f.queue(image);
    if (mode === "capability") f.state.support = 0;
    if (mode === "metadata") f.records.set(image.id, { ...image, attribution: "Different source", complete: true });
    if (mode === "role") f.state.before = (pathname, input) => { if (input.method === "PUT") f.state.user.role = "publisher"; };
    await assert.rejects(f.client.sync({ kind: "page", id: f.getObject().id }));
    assert.equal((await f.client.status()).pending, 1); assert.equal(f.requests.some(({ pathname }) => pathname === "changes"), false);
    assert.deepEqual((await f.client.media.readImage(image.id)).buffer, IMAGE);
  }
});

test("download rejects redirect, mismatched MIME/hash and excessive response declarations without admitting bytes", async (t) => {
  for (const mode of ["redirect", "mime", "hash", "length"]) {
    const f = await fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: PROJECT });
    f.records.set(metadata.id, { ...metadata, complete: true }); f.blobs.set(metadata.sha256, IMAGE);
    f.state.after = (pathname) => {
      if (!pathname.endsWith("/content")) return;
      if (mode === "redirect") return new Response("", { status: 302, headers: { Location: "https://foreign.invalid/" } });
      return new Response(IMAGE, { headers: { "Content-Type": mode === "mime" ? "image/jpeg" : metadata.mimeType,
        "X-Content-SHA256": mode === "hash" ? "a".repeat(64) : metadata.sha256, "Content-Length": String(mode === "length" ? 20 * 1024 * 1024 + 1 : metadata.bytes) } });
    };
    await assert.rejects(f.client.media.downloadImage(metadata.id)); assert.equal((await f.client.media.describeImage(metadata.id)).localAvailable, false);
  }
});

test("a private global profile budget reader can refuse image admission before any SQLite write", async (t) => {
  const f = await fixture(t, { mediaBudgetReader: async () => ({ totalBytes: 1024 * 1024 * 1024 }) });
  await assert.rejects(f.client.media.importImage({ buffer: IMAGE }), { code: "image_media_quota" }); assert.equal((await f.client.media.budget()).imageBytes, 0);
});

test("a later local page edit made during image upload remains a separate unsent successor", async (t) => {
  const f = await fixture(t), image = await f.client.media.importImage({ buffer: IMAGE }); await f.queue(image);
  const other = createSharedProjectClientStore({ filename: f.filename, localStorageConfirmed: true });
  try {
    f.state.after = (pathname, input) => {
      if (input.method !== "PUT") return;
      f.state.after = null; other.edit(other.active().id, "page", f.getObject().id, page(image, "Späterer eigener Text"));
    };
    await f.client.sync({ kind: "page", id: f.getObject().id });
    assert.equal((await f.client.status()).pending, 1); assert.equal((await f.client.getObject("page", f.getObject().id)).data.title, "Späterer eigener Text");
    assert.equal(f.getObject().data.title, "Geänderter Entwurf"); assert.equal(f.requests.filter(({ pathname }) => pathname === "changes").length, 1);
  } finally { other.close(); }
});

test("closing joins an in-flight decoder and prevents any later image insertion", async (t) => {
  let entered, release;
  const started = new Promise((resolve) => { entered = resolve; }), gate = new Promise((resolve) => { release = resolve; });
  const f = await fixture(t, { imageDecode: async () => { entered(); await gate; } });
  const importing = f.client.media.importImage({ buffer: IMAGE }), rejected = assert.rejects(importing, { code: "client_closed" });
  await started; const closing = f.client.close(); release(); await rejected; await closing;
  const db = new DatabaseSync(f.filename, { readOnly: true });
  try { assert.equal(db.prepare("SELECT count(*) AS n FROM image_media").get().n, 0); } finally { db.close(); }
});

test("a new unmanaged claim cannot invent complete bytes and an oversized pixel header is rejected before decoding", async (t) => {
  const f = await fixture(t), unknown = await inspectClientImage(IMAGE, { projectId: PROJECT });
  await assert.rejects(f.queue(unknown), { code: "image_media_missing" });
  const tooLarge = Buffer.from(IMAGE); tooLarge.writeUInt32BE(50000, 16); tooLarge.writeUInt32BE(1000, 20);
  await assert.rejects(f.client.media.importImage({ buffer: tooLarge }), { code: "invalid_image_media" });
  assert.equal((await f.client.status()).pending, 0); assert.equal((await f.client.media.budget()).imageBytes, 0);
});

test("raw image transfers have a separate bounded deadline while JSON keeps its short original deadline", async (t) => {
  const f = await fixture(t, { requestTimeoutMs: 1, imageRequestTimeoutMs: 100 });
  const image = await f.client.media.importImage({ buffer: IMAGE }); await f.queue(image);
  f.state.before = async (pathname) => { if (pathname.endsWith("/content")) await new Promise((resolve) => setTimeout(resolve, 8)); };
  await f.client.sync({ kind: "page", id: f.getObject().id });
  await f.client.media.downloadImage(image.id); assert.deepEqual((await f.client.media.readImage(image.id)).buffer, IMAGE);
});

test("a tiny raw upload deadline aborts once and preserves the local image and untransmitted page", async (t) => {
  const f = await fixture(t, { imageRequestTimeoutMs: 15 }), image = await f.client.media.importImage({ buffer: IMAGE }); await f.queue(image);
  f.state.before = async (pathname, input) => {
    if (!pathname.endsWith("/content")) return;
    await new Promise((_resolve, reject) => input.signal.addEventListener("abort", () => reject(new Error("Synthetic bounded body timeout")), { once: true }));
  };
  await assert.rejects(f.client.sync({ kind: "page", id: f.getObject().id }), { code: "offline" });
  assert.equal(f.requests.filter(({ method }) => method === "PUT").length, 1);
  assert.equal(f.requests.some(({ pathname }) => pathname === "changes"), false); assert.equal((await f.client.status()).pending, 1);
  assert.deepEqual((await f.client.media.readImage(image.id)).buffer, IMAGE);
});

test("a tiny direct download deadline records offline status without admitting partial bytes or retrying", async (t) => {
  const f = await fixture(t, { imageRequestTimeoutMs: 15 }), metadata = await inspectClientImage(IMAGE, { projectId: PROJECT });
  f.records.set(metadata.id, { ...metadata, complete: true }); f.blobs.set(metadata.sha256, IMAGE);
  f.state.before = async (pathname, input) => {
    if (!pathname.endsWith("/content")) return;
    await new Promise((_resolve, reject) => input.signal.addEventListener("abort", () => reject(new Error("Synthetic download timeout")), { once: true }));
  };
  await assert.rejects(f.client.media.downloadImage(metadata.id), { code: "offline" });
  assert.equal((await f.client.status()).connection, "offline"); assert.equal((await f.client.media.describeImage(metadata.id)).localAvailable, false);
  assert.equal(f.requests.filter(({ pathname }) => pathname.endsWith("/content")).length, 1);
});

test("a reader downgrade hides formerly cached unapproved images while preserving their bytes and allowing approved reader references", async (t) => {
  const f = await fixture(t), image = await f.client.media.importImage({ buffer: IMAGE }); f.state.user.role = "reader";
  await assert.rejects(f.client.refresh(), { code: "invalid_response" });
  await assert.rejects(f.client.media.readImage(image.id), { code: "forbidden" });
  await assert.rejects(f.client.media.describeImage(image.id), { code: "forbidden" });
  await assert.rejects(f.client.media.importImage({ buffer: IMAGE }), { code: "forbidden" });
  const object = f.getObject(); f.setObject({ ...object, data: page(image), approval: "approved", approvedRevision: object.revision });
  await f.client.refresh(); assert.deepEqual((await f.client.media.readImage(image.id)).buffer, IMAGE);
  assert.equal((await f.client.media.describeImage(image.id)).localAvailable, true);
});
