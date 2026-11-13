import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fixture, species } from "./test-fixtures.mjs";
import { createSharedProjectStore } from "./store.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient } from "./client.mjs";
import { digest } from "./security.mjs";
import { IMAGE_MEDIA_MAX_BYTES, inspectImageMediaContents } from "./image-media.mjs";
import { createTestPng } from "../server-test-fixtures.mjs";
import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { createSharedProjectSnapshot, validateAndRestoreSharedProjectSnapshot } from "../../nas/snapshot.mjs";
import { initialDocument, normalizeSpeciesSnapshot } from "../page-authoring/model.mjs";
import { encodePageAuthoringDraft, pageAuthoringObjectId } from "../page-authoring/shared.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";

const png = createTestPng(6, 4);
const binding = (a) => ({ projectId: a.projectId, userId: a.user.id, role: a.user.role });
const intent = (a, bytes = png, extra = {}) => ({ id: `image-${randomUUID()}`, sha256: digest(bytes), bytes: bytes.length,
  mimeType: "image/png", attribution: "Synthetic photo, own source", expectedBinding: binding(a), ...extra });
const denied = (...codes) => (error) => codes.includes(error.code);
function deferred() { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }
async function scoped(fn, options = {}, httpOptions = {}) {
  const f = fixture(); let adapter;
  try {
    const initialized = await f.initialized(options); adapter = createSharedProjectHttp({ store: initialized.store, ...httpOptions }); const address = await adapter.listen();
    await fn({ ...initialized, f, adapter, address });
  } finally { await adapter?.close(); f.cleanup(); }
}
async function request(address, path, { token, method = "GET", data, bytes, headers = {} } = {}) {
  const response = await fetch(`${address.url}/api/v1/${path}`, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { "Content-Type": "application/json" } : {}), ...headers,
  }, body: data ? JSON.stringify(data) : bytes });
  return { response, body: response.headers.get("content-type")?.startsWith("application/json") ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
const uploadHeaders = (a, extra = {}) => ({ "Content-Type": "image/png", "X-Shared-Project-Id": a.projectId, "X-Shared-User-Id": a.user.id, "X-Shared-Role": a.user.role, ...extra });
async function complete(store, a, supplied = intent(a)) {
  store.declareImageMedia(a.token, supplied); return store.putImageMedia(a.token, supplied.id, png, { expectedBinding: binding(a), mimeType: supplied.mimeType });
}

test("real image bytes decode, deduplicate and retain immutable per-asset source records without entering normal object lists", () => scoped(async ({ store, a, f }) => {
  const input = intent(a), before = store.declareImageMedia(a.token, input); assert.equal(before.complete, false); assert.equal(before.width, null);
  await assert.rejects(Promise.resolve().then(() => store.readImageMedia(a.token, input.id)), denied("image_media_incomplete"));
  const ready = await complete(store, a, input); assert.equal(ready.complete, true); assert.equal(ready.width, 6); assert.equal(ready.height, 4);
  assert.deepEqual(await complete(store, a, input), ready);
  const second = intent(a, png, { attribution: "Another immutable license record" });
  const alias = store.declareImageMedia(a.token, second); assert.equal(alias.complete, true); assert.notEqual(alias.id, ready.id);
  assert.throws(() => store.declareImageMedia(a.token, { ...input, attribution: "Changed" }), denied("image_media_changed"));
  assert.deepEqual(store.readImageMedia(a.token, input.id).bytes, png); assert.deepEqual(store.listObjects(a.token), []);
  const db = new DatabaseSync(f.filename, { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 6);
    assert.equal(db.prepare("SELECT count(*) AS n FROM image_media_blobs").get().n, 1); assert.equal(db.prepare("SELECT count(*) AS n FROM image_media_assets").get().n, 2);
    inspectImageMediaContents(db, a.projectId);
  } finally { db.close(); }
}));

test("HTTP media metadata and one raw content body are authenticated and idempotent with exact transfer bindings", () => scoped(async ({ address, a }) => {
  const input = intent(a);
  const declared = await request(address, "media", { method: "POST", token: a.token, data: input }); assert.equal(declared.response.status, 200); assert.equal(declared.body.complete, false);
  const ready = await request(address, `media/${input.id}/content`, { method: "PUT", token: a.token, bytes: png, headers: uploadHeaders(a) });
  assert.equal(ready.response.status, 200); assert.equal(ready.body.complete, true); assert.equal(ready.body.width, 6);
  const read = await request(address, `media/${input.id}/content`, { token: a.token });
  assert.equal(read.response.status, 200); assert.equal(read.response.headers.get("content-type"), "image/png"); assert.equal(read.response.headers.get("x-content-sha256"), input.sha256);
  assert.equal(Number(read.response.headers.get("content-length")), png.length); assert.deepEqual(read.body, png);
  const metadata = await request(address, `media/${input.id}`, { token: a.token }); assert.deepEqual(metadata.body, ready.body);
  assert.deepEqual(Object.keys(metadata.body).sort(), ["id", "projectId", "sha256", "bytes", "mimeType", "width", "height", "attribution", "complete"].sort());
  const capabilities = await request(address, "capabilities", { token: a.token }); assert.equal(capabilities.body.managedImageMedia, 1);
  assert.equal((await request(address, `media/${input.id}`)).response.status, 401);
  assert.equal((await request(address, `media/${input.id}/unknown`, { token: a.token })).response.status, 404);
  assert.equal((await request(address, `media/${input.id}/content`, { method: "PUT", token: a.token, bytes: png, headers: uploadHeaders(a, { "X-Shared-User-Id": "another-user" }) })).response.status, 409);
}));

test("reader and read-only device sessions receive only images matching an actually approved version", () => scoped(async ({ store, a, f }) => {
  const visible = await complete(store, a), hidden = await complete(store, a, intent(a, png, { attribution: "Unapproved photo source" }));
  await store.createUser(a.token, { username: "image-reader", displayName: "Image reader", password: f.password, role: "reader" });
  const reader = await store.login({ username: "image-reader", password: f.password });
  const readSession = await store.login({ username: a.user.username, password: f.password, scope: "read", deviceLabel: "Read-only fixture" });
  const data = species(); data.media.portrait = { id: visible.id, url: "https://images.squarespace-cdn.com/content/fixture.png", sha256: visible.sha256, bytes: visible.bytes, mimeType: visible.mimeType, attribution: visible.attribution };
  const object = store.createObject(a.token, { kind: "species", id: data.id, data });
  for (const token of [reader.token, readSession.token]) assert.throws(() => store.getImageMedia(token, visible.id), denied("image_media_not_found"));
  store.approveObject(a.token, "species", object.id, { expectedRevision: object.revision });
  for (const token of [reader.token, readSession.token]) {
    assert.deepEqual(store.readImageMedia(token, visible.id).bytes, png);
    assert.throws(() => store.getImageMedia(token, hidden.id), denied("image_media_not_found"));
    assert.throws(() => store.declareImageMedia(token, intent(a)), denied("forbidden"));
  }
  const unrelated = store.createObject(a.token, { kind: "page", id: "unrelated-draft", data: { title: "Not approved", media: { portrait: hidden } } });
  const db = new DatabaseSync(f.filename);
  try { db.prepare("UPDATE objects SET approved_revision=? WHERE kind='species' AND id=?").run(unrelated.revision, object.id); } finally { db.close(); }
  assert.throws(() => store.getImageMedia(reader.token, hidden.id), denied("image_media_not_found"), "a revision from another object cannot grant image access");
}));

test("wrong hashes, broken pixels, MIME substitutions, oversized bodies and changed project bindings never complete media", () => scoped(async ({ store, a }) => {
  const bad = png.subarray(0, 33), cases = [intent(a, bad), intent(a, png, { mimeType: "image/jpeg" }), intent(a, png, { sha256: "f".repeat(64) })];
  for (const input of cases) {
    store.declareImageMedia(a.token, input);
    await assert.rejects(store.putImageMedia(a.token, input.id, input.bytes === bad.length ? bad : png, { expectedBinding: binding(a), mimeType: input.mimeType }), denied("invalid_image_media"));
    assert.equal(store.getImageMedia(a.token, input.id).complete, false);
  }
  assert.throws(() => store.declareImageMedia(a.token, intent(a, png, { bytes: IMAGE_MEDIA_MAX_BYTES + 1 })), denied("invalid_image_media"));
  assert.throws(() => store.declareImageMedia(a.token, intent(a, png, { unknown: true })), denied("invalid_image_media"));
  assert.throws(() => store.declareImageMedia(a.token, intent(a, png, { expectedBinding: { ...binding(a), projectId: "foreign-project" } })), denied("media_binding_changed"));
  const hugePixels = Buffer.from(png); hugePixels.writeUInt32BE(10000, 16); hugePixels.writeUInt32BE(5000, 20);
  const oversized = intent(a, hugePixels); store.declareImageMedia(a.token, oversized);
  await assert.rejects(store.putImageMedia(a.token, oversized.id, hugePixels, { expectedBinding: binding(a), mimeType: oversized.mimeType }), denied("invalid_image_media"));
  const bounded = intent(a); store.declareImageMedia(a.token, bounded);
  await assert.rejects(store.putImageMedia(a.token, bounded.id, Buffer.alloc(IMAGE_MEDIA_MAX_BYTES + 1), { expectedBinding: binding(a), mimeType: bounded.mimeType }), denied("image_media_too_large"));
}));

test("actual create/change/conflict resolution bind managed page image references to complete immutable project bytes", () => scoped(async ({ store, a, b, f }) => {
  const managed = await complete(store, a), pending = intent(a, createTestPng(7, 4)); store.declareImageMedia(a.token, pending);
  const source = normalizeSpeciesSnapshot({ slug: "test-art", scientificName: "Testus fixture", commonName: "Test-Art", taxonomy: [], general: [], status: "",
    revision: "fixture-source", dataSha256: "a".repeat(64), runtimeReady: false, normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null } }, a.projectId, "test-art");
  const document = initialDocument({ templateId: "fn-compact-20261031", species: source, parentPath: "/wildlife/afrika" });
  const metadata = ({ id, projectId, sha256, bytes, mimeType, attribution }) => ({ id, projectId, sha256, bytes, mimeType, attribution });
  document.images = [{ id: "usage-a", assetId: managed.id, alt: "Human caption", caption: "Human caption", decorative: false, asset: metadata(managed) }];
  const encode = (doc, id = "image-draft") => encodePageAuthoringDraft({ id, revision: fingerprint(doc), document: doc });
  const id = pageAuthoringObjectId("image-draft");
  for (const modify of [
    (image) => { image.asset.attribution = "Unconfirmed source"; }, (image) => { image.asset.sha256 = "b".repeat(64); },
    (image) => { image.assetId = pending.id; image.asset = metadata({ ...pending, projectId: a.projectId }); },
  ]) {
    const bad = structuredClone(document); modify(bad.images[0]);
    assert.throws(() => store.createObject(a.token, { kind: "page", id, data: encode(bad) }), denied("image_media_incomplete"));
  }
  const created = store.createObject(a.token, { kind: "page", id, data: encode(document) });
  const other = structuredClone(document); other.title = "Other person's title";
  const latest = store.submitChange(b.token, { changeId: "managed-page-other", kind: "page", id, baseRevision: created.revision, data: encode(other) });
  const spoofed = structuredClone(document); spoofed.images[0].asset.sha256 = "f".repeat(64);
  assert.throws(() => store.submitChange(a.token, { changeId: "managed-page-spoof", kind: "page", id, baseRevision: created.revision, data: encode(spoofed) }), denied("image_media_incomplete"));
  assert.equal(store.listConflicts(a.token).length, 0);
  const ours = structuredClone(document); ours.images[0].alt = "Later human alternative";
  const conflict = store.submitChange(a.token, { changeId: "managed-page-conflict", kind: "page", id, baseRevision: created.revision, data: encode(ours) });
  assert.throws(() => store.resolveConflict(a.token, conflict.conflictId, { expectedRevision: latest.object.revision, strategy: "merged", data: encode(spoofed) }), denied("image_media_incomplete"));
  assert.equal(store.getObject(a.token, "page", id).data.document.title, "Other person's title");
  store.resolveConflict(a.token, conflict.conflictId, { expectedRevision: latest.object.revision, strategy: "proposed" });
  assert.equal(store.getObject(a.token, "page", id).data.document.images[0].alt, "Later human alternative");
  await createSharedProjectSnapshot({ filename: f.filename, destination: path.join(f.root, "page-image-snapshot"), localStorageConfirmed: true });
}));

test("two real personal clients upload through page CAS and selectively download shared image bytes", () => scoped(async ({ store, a, b, f, address }) => {
  const source = normalizeSpeciesSnapshot({ slug: "test-art", scientificName: "Testus fixture", commonName: "Test-Art", taxonomy: [], general: [], status: "",
    revision: "fixture-source", dataSha256: "a".repeat(64), runtimeReady: false, normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null } }, a.projectId, "test-art");
  const document = initialDocument({ templateId: "fn-compact-20261031", species: source, parentPath: "/wildlife/afrika" });
  const encode = (doc) => encodePageAuthoringDraft({ id: "two-client-draft", revision: fingerprint(doc), document: doc });
  const id = pageAuthoringObjectId("two-client-draft"); store.createObject(a.token, { kind: "page", id, data: encode(document) });
  let offline = false;
  const first = createSharedProjectClient({ filename: path.join(f.root, "client-a.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true });
  const second = createSharedProjectClient({ filename: path.join(f.root, "client-b.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true,
    fetchImpl: (...args) => { if (offline) throw new Error("Synthetic offline"); return fetch(...args); } });
  try {
    await first.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
    const image = await first.media.importImage({ buffer: png, attribution: "Two-PC synthetic photo" });
    const next = structuredClone(document);
    const { width: _width, height: _height, complete: _complete, ...asset } = image;
    next.images = [{ id: "two-pc-usage", assetId: image.id, asset, alt: "Shared photo", caption: "", decorative: false }];
    await first.editExistingObject("page", id, encode(next)); await first.sync({ kind: "page", id });
    assert.equal(store.getImageMedia(a.token, image.id).complete, true);
    assert.equal(store.getObject(a.token, "page", id).data.document.images[0].asset.id, image.id);
    await second.connect({ baseUrl: address.url, username: b.user.username, password: f.password });
    await second.media.refreshMetadata(image.id);
    assert.equal((await second.media.describeImage(image.id)).remoteBacked, true);
    assert.equal((await second.media.describeImage(image.id)).localAvailable, false);
    await assert.rejects(second.media.readImage(image.id), denied("image_media_not_local"));
    offline = true;
    const existing = await second.getObject("page", id), offlineDocument = structuredClone(existing.data.document); offlineDocument.images[0].alt = "Offline human correction";
    await second.editExistingObject("page", id, encode(offlineDocument));
    assert.equal((await second.getObject("page", id)).data.document.images[0].alt, "Offline human correction");
    offline = false;
    await second.sync({ kind: "page", id });
    assert.equal(store.getObject(a.token, "page", id).data.document.images[0].alt, "Offline human correction");
    await second.media.downloadImage(image.id);
    assert.deepEqual((await second.media.readImage(image.id)).buffer, png);
    assert.equal((await second.media.describeImage(image.id)).localAvailable, true);
  } finally { await first.close(); await second.close(); }
}));

test("role changes and device revocation during a real decode prevent the final SQLite commit", async () => {
  for (const mode of ["role", "device"]) {
    const entered = deferred(), release = deferred();
    await scoped(async ({ store, a, b, f }) => {
      const session = mode === "device" ? await store.login({ username: a.user.username, password: f.password, deviceLabel: "Revoked during decode" }) : a;
      const input = intent(session); store.declareImageMedia(session.token, input);
      const work = store.putImageMedia(session.token, input.id, png, { expectedBinding: binding(session), mimeType: input.mimeType });
      const rejected = assert.rejects(work, denied("media_binding_changed", "forbidden", "authentication_required"));
      try {
        await entered.promise;
        if (mode === "role") store.updateUser(b.token, a.user.id, { expectedVersion: a.user.version, role: "publisher" });
        else store.revokeDevice(session.token, session.device.id);
      } finally { release.resolve(); }
      await rejected; assert.equal(store.getImageMedia(b.token, input.id).complete, false);
    }, { imageDecode: async (bytes, options) => { const dimensions = await validateImageDecode(bytes, options); entered.resolve(); await release.promise; return dimensions; } });
  }
});

test("schema4 migration preserves existing rows and malformed schemas cannot be repaired silently", () => scoped(async ({ f, store, a }) => {
  store.createObject(a.token, { kind: "page", id: "retained", data: { title: "Retained original" } }); store.close();
  const db = new DatabaseSync(f.filename); db.exec("DROP TABLE normal_media_assets; DROP TABLE normal_media_blobs; DELETE FROM meta WHERE key='reader_media_generation'; DROP TABLE image_media_assets; DROP TABLE image_media_blobs; PRAGMA user_version=4;");
  const audits = db.prepare("SELECT count(*) AS n FROM audit").get().n;
  db.exec("CREATE TRIGGER unexpected BEFORE INSERT ON meta BEGIN INSERT INTO audit(action,created_at) VALUES ('unexpected','fixture'); END;"); db.close();
  assert.throws(() => createSharedProjectStore({ filename: f.filename, localStorageConfirmed: true }), denied("unsupported_schema"));
  const blocked = new DatabaseSync(f.filename);
  try {
    assert.equal(blocked.prepare("SELECT count(*) AS n FROM audit").get().n, audits, "unknown schema must stop before any initialization writes");
    assert.equal(blocked.prepare("PRAGMA user_version").get().user_version, 4);
    blocked.exec("DROP TRIGGER unexpected");
  } finally { blocked.close(); }
  const upgraded = createSharedProjectStore({ filename: f.filename, localStorageConfirmed: true });
  try { assert.equal(upgraded.getObject(a.token, "page", "retained").data.title, "Retained original"); } finally { upgraded.close(); }
  const corrupt = new DatabaseSync(f.filename); corrupt.exec("ALTER TABLE image_media_assets ADD COLUMN unknown TEXT"); corrupt.close();
  const before = await fs.readFile(f.filename);
  assert.throws(() => createSharedProjectStore({ filename: f.filename, localStorageConfirmed: true }), denied("unsupported_schema"));
  assert.deepEqual(await fs.readFile(f.filename), before);
}));

test("real WAL snapshot and independent restore retain complete BLOB bytes and immutable metadata; corruption fails closed", () => scoped(async ({ store, a, f }) => {
  const ready = await complete(store, a), destination = path.join(f.root, "media-snapshot"), target = path.join(f.root, "restored.sqlite");
  const snapshot = await createSharedProjectSnapshot({ filename: f.filename, destination, localStorageConfirmed: true });
  assert.equal(snapshot.databaseSchema, 6); assert.equal(snapshot.counts.image_media_blobs, 1); assert.equal(snapshot.counts.image_media_assets, 1);
  await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: destination, destination: target, localStorageConfirmed: true });
  const restored = createSharedProjectStore({ filename: target, localStorageConfirmed: true });
  try { assert.deepEqual(restored.getImageMedia(a.token, ready.id), ready); assert.deepEqual(restored.readImageMedia(a.token, ready.id).bytes, png); } finally { restored.close(); }
  const db = new DatabaseSync(f.filename); db.prepare("UPDATE image_media_blobs SET data=?").run(Buffer.alloc(png.length)); db.close();
  await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination: path.join(f.root, "corrupt-snapshot"), localStorageConfirmed: true }), /Hash/);
}));

test("schema qualification preserves quoted MIME literals exactly", async () => {
  for (const changedLiteral of ["IMAGE/JPEG", "image/ jpeg"]) await scoped(async ({ store, a, f }) => {
    await complete(store, a);
    const db = new DatabaseSync(f.filename);
    try {
      const blobSql = db.prepare("SELECT sql FROM sqlite_schema WHERE name='image_media_blobs'").get().sql;
      const assetSql = db.prepare("SELECT sql FROM sqlite_schema WHERE name='image_media_assets'").get().sql;
      const blobs = db.prepare("SELECT * FROM image_media_blobs").all(), assets = db.prepare("SELECT * FROM image_media_assets").all();
      db.exec("DROP TABLE image_media_assets; DROP TABLE image_media_blobs;");
      db.exec(blobSql.replace("'image/jpeg'", `'${changedLiteral}'`)); db.exec(assetSql);
      for (const row of blobs) db.prepare("INSERT INTO image_media_blobs VALUES (?,?,?,?,?,?)").run(row.sha256, row.bytes, row.mime_type, row.width, row.height, row.data);
      for (const row of assets) db.prepare("INSERT INTO image_media_assets VALUES (?,?,?,?,?,?,?,?,?)").run(row.id, row.project_id, row.sha256, row.bytes, row.mime_type, row.attribution, row.creator_id, row.created_at, row.blob_sha256);
      assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok", "retained PNG data satisfy the changed condition; this is a schema mismatch");
    } finally { db.close(); }
    let reopened;
    try { assert.throws(() => { reopened = createSharedProjectStore({ filename: f.filename, localStorageConfirmed: true }); }, denied("unsupported_schema")); }
    finally { reopened?.close(); }
    await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination: path.join(f.root, "literal-mismatch"), localStorageConfirmed: true }), denied("unsupported_schema"));
  });
});

test("schema5 backup rejects weakened table constraints, missing foreign keys and forged decoded dimensions", async () => {
  for (const mode of ["constraints", "foreign-key", "dimensions"]) await scoped(async ({ store, a, f }) => {
    await complete(store, a);
    const db = new DatabaseSync(f.filename);
    try {
      if (mode === "dimensions") db.exec("UPDATE image_media_blobs SET width=7");
      else {
        const blob = db.prepare("SELECT sql FROM sqlite_schema WHERE name='image_media_blobs'").get().sql;
        const asset = db.prepare("SELECT sql FROM sqlite_schema WHERE name='image_media_assets'").get().sql;
        db.exec("DROP TABLE image_media_assets; DROP TABLE image_media_blobs;");
        db.exec(mode === "constraints" ? blob.replace("CHECK(width*height<=40000000)", "CHECK(width*height<=40000001)") : blob);
        db.exec(mode === "foreign-key" ? asset.replace(" REFERENCES users(id)", "") : asset);
      }
    } finally { db.close(); }
    await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination: path.join(f.root, `invalid-${mode}`), localStorageConfirmed: true }),
      denied("unsupported_schema", "invalid_image_media"));
  });
});

test("HTTP chunk overflow and duplicate binding headers are rejected and aborted bodies never become complete", () => scoped(async ({ store, a, address, adapter }) => {
  const input = intent(a); store.declareImageMedia(a.token, input);
  const raw = (headers, chunks) => new Promise((resolve, reject) => {
    const call = http.request(`${address.url}/api/v1/media/${input.id}/content`, { method: "PUT", headers: { Authorization: `Bearer ${a.token}`, ...uploadHeaders(a), ...headers } }, (response) => {
      response.resume(); response.on("end", () => resolve(response.statusCode));
    }); call.on("error", reject); for (const chunk of chunks) call.write(chunk); call.end();
  });
  assert.equal(await raw({ "X-Shared-Role": ["admin", "contributor"] }, [png]), 400);
  assert.equal(await raw({}, [png, Buffer.from("excess")]), 413);
  const entered = deferred(); adapter.server.once("request", () => entered.resolve());
  const call = http.request(`${address.url}/api/v1/media/${input.id}/content`, { method: "PUT", headers: { Authorization: `Bearer ${a.token}`, ...uploadHeaders(a), "Content-Length": png.length } });
  call.on("error", () => {}); call.write(png.subarray(0, 5)); await entered.promise; call.destroy();
  for (let count = 0; count < 4; count++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.getImageMedia(a.token, input.id).complete, false);
}));

function streamRequest(address, pathname, { token, bytes, headers, intervalMs = 0, chunkBytes = bytes.length, hold = false } = {}) {
  let call, timer, offset = 0;
  const result = new Promise((resolve, reject) => {
    call = http.request(`${address.url}/api/v1/${pathname}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, ...headers } }, (response) => {
      clearTimeout(timer); const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk)); response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    call.on("error", reject);
    const pump = () => {
      call.write(bytes.subarray(offset, offset + chunkBytes)); offset += chunkBytes;
      if (hold) return;
      if (offset >= bytes.length) call.end(); else timer = setTimeout(pump, intervalMs);
    }; pump();
  });
  return { call, result: result.finally(() => clearTimeout(timer)) };
}

test("HTTP reserves one image body before buffering and releases the admission slot after completion and abort", () => scoped(async ({ store, a, address, adapter }) => {
  const one = intent(a), two = intent(a, png, { attribution: "Another source" }); store.declareImageMedia(a.token, one); store.declareImageMedia(a.token, two);
  const entered = deferred(); adapter.server.once("request", () => entered.resolve());
  const held = streamRequest(address, `media/${one.id}/content`, { token: a.token, bytes: png, headers: uploadHeaders(a), chunkBytes: 1, hold: true });
  await entered.promise;
  const competing = streamRequest(address, `media/${two.id}/content`, { token: a.token, bytes: png, headers: uploadHeaders(a), chunkBytes: 1, hold: true });
  assert.equal((await competing.result).status, 429); assert.equal(store.getImageMedia(a.token, two.id).complete, false);
  held.call.end(png.subarray(1)); assert.equal((await held.result).status, 200);
  const after = streamRequest(address, `media/${two.id}/content`, { token: a.token, bytes: png, headers: uploadHeaders(a) }); assert.equal((await after.result).status, 200);
  const three = intent(a); store.declareImageMedia(a.token, three);
  const aborted = streamRequest(address, `media/${three.id}/content`, { token: a.token, bytes: png, headers: uploadHeaders(a), chunkBytes: 1, hold: true });
  const ignored = aborted.result.catch(() => {}); aborted.call.destroy(); await ignored;
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await streamRequest(address, `media/${three.id}/content`, { token: a.token, bytes: png, headers: uploadHeaders(a) }).result).status, 200);
}));

test("absolute per-operation body deadlines allow slow images while keeping short JSON bounds and rejecting heartbeat uploads", () => scoped(async ({ store, a, address }) => {
  const invalidJson = Buffer.from('{"title":"A deliberately streamed JSON request body"}');
  const json = streamRequest(address, "objects/page/slow-json", { token: a.token, bytes: invalidJson, headers: { "Content-Type": "application/json" }, intervalMs: 20, chunkBytes: 1 });
  assert.equal((await json.result).status, 408);
  const accepted = intent(a); store.declareImageMedia(a.token, accepted);
  const slow = streamRequest(address, `media/${accepted.id}/content`, { token: a.token, bytes: png, headers: uploadHeaders(a), intervalMs: 25, chunkBytes: Math.ceil(png.length / 4) });
  assert.equal((await slow.result).status, 200);
  const expired = intent(a, createTestPng(7, 4)); store.declareImageMedia(a.token, expired);
  const tooSlow = streamRequest(address, `media/${expired.id}/content`, { token: a.token, bytes: createTestPng(7, 4), headers: uploadHeaders(a), intervalMs: 20, chunkBytes: 1 });
  const result = await tooSlow.result; assert.equal(result.status, 408); assert.equal(result.body.error.code, "image_media_timeout");
  assert.equal(store.getImageMedia(a.token, expired.id).complete, false);
  const retry = await request(address, `media/${expired.id}/content`, { method: "PUT", token: a.token, bytes: createTestPng(7, 4), headers: uploadHeaders(a) });
  assert.equal(retry.response.status, 200);
}, {}, { jsonBodyTimeoutMs: 40, imageBodyTimeoutMs: 180 }));
