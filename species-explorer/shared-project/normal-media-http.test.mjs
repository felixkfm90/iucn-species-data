import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { fixture } from "./test-fixtures.mjs";
import { editorialIntegrationFixture } from "./editorial-integration-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { speciesNormalAssetMetadata } from "./species-editorial.mjs";
import { buildPageEditorialAdoption } from "./species-editorial-adoption.mjs";
import { encodePageAuthoringDraft } from "../page-authoring/shared.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";
import { digest } from "./security.mjs";
import { createTestWebp } from "../server-test-fixtures.mjs";
import { resolveFfmpegPath } from "../../scripts/spectrogram-renderer.mjs";
import { createSharedProjectSnapshot, validateAndRestoreSharedProjectSnapshot } from "../../nas/snapshot.mjs";

const normalId = "image-19191919-1919-4191-8191-191919191919";
const binding = a => ({ projectId: a.projectId, userId: a.user.id, role: a.user.role });
const denied = code => error => error.code === code;
const uploadHeaders = (a, mimeType) => ({ "Content-Type": mimeType, "X-Shared-Project-Id": a.projectId,
  "X-Shared-User-Id": a.user.id, "X-Shared-Role": a.user.role });
function originalMp3() {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const result = spawnSync(resolveFfmpegPath({ repoRoot }), ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=44100:duration=0.3", "-c:a", "libmp3lame", "-threads", "1",
    "-b:a", "128k", "-id3v2_version", "0", "-write_xing", "0", "-f", "mp3", "pipe:1"],
  { windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString()); return result.stdout;
}
async function scoped(fn, { slot = "portrait.webp", bytes = createTestWebp(), id = normalId, storeOptions = {}, httpOptions = {} } = {}) {
  const f = fixture(); let adapter;
  try {
    const initialized = await f.initialized(storeOptions), mimeType = slot === "sound.mp3" ? "audio/mpeg" : "image/webp";
    const source = editorialIntegrationFixture(initialized.store, initialized.a, { files: { [slot]: { id, sha256: digest(bytes), bytes: bytes.length, mimeType } } });
    adapter = createSharedProjectHttp({ store: initialized.store, ...httpOptions }); const address = await adapter.listen();
    const role = slot === "sound.mp3" ? "sound" : "portrait";
    const asset = speciesNormalAssetMetadata(source.speciesObject.data, initialized.a.projectId, role);
    await fn({ ...initialized, ...source, f, bytes, asset, slot, mimeType, address, adapter });
  } finally { await adapter?.close(); f.cleanup(); }
}
function declaration(source, extra = {}) {
  return { speciesId: source.speciesObject.id, slot: source.slot, expectedRevision: source.speciesObject.revision,
    asset: source.asset, expectedBinding: binding(source.a), ...extra };
}
async function api(source, pathname, { token = source.a.token, method = "GET", data, bytes, headers = {} } = {}) {
  const response = await fetch(`${source.address.url}/api/v1/${pathname}`, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { "Content-Type": "application/json" } : {}), ...headers },
  body: data ? JSON.stringify(data) : bytes });
  const value = response.headers.get("content-type")?.startsWith("application/json") ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, value };
}
async function complete(source) {
  const intent = await api(source, "normal-media", { method: "POST", data: declaration(source) });
  assert.equal(intent.response.status, 200, JSON.stringify(intent.value));
  const ready = await api(source, `normal-media/${intent.value.contentId}/content`, { method: "PUT", bytes: source.bytes,
    headers: uploadHeaders(source.a, source.mimeType) });
  assert.equal(ready.response.status, 200, JSON.stringify(ready.value)); return ready.value;
}
function approve(source, current = source.speciesObject) {
  const preview = source.store.previewReaderApproval(source.a.token, current.id, { expectedRevision: current.revision });
  return source.store.approveObject(source.a.token, "species", current.id, { expectedRevision: current.revision, readerCatalogVersion: 2,
    expectedReview: binding(source.a), expectedReaderHash: preview.readerHash });
}

test("HTTP normal bytes keep their original image-looking ID and become readable only for their approved species binding", () => scoped(async source => {
  const ready = await complete(source); assert.equal(ready.complete, true); assert.equal(ready.asset.id, normalId); assert.equal(ready.width, 8);
  assert.deepEqual(Object.keys(ready).sort(), ["contentId", "projectId", "speciesId", "slot", "asset", "width", "height", "complete"].sort());
  const read = await source.store.login({ username: source.a.user.username, password: source.f.password, scope: "read" });
  const pathname = `normal-media/${ready.contentId}/content`;
  assert.equal((await api(source, pathname, { token: null })).response.status, 401);
  assert.equal((await api(source, pathname, { token: read.token })).response.status, 404);
  approve(source);
  const result = await api(source, pathname, { token: read.token });
  assert.equal(result.response.status, 200); assert.deepEqual(result.value, source.bytes);
  assert.equal(result.response.headers.get("x-content-sha256"), source.asset.sha256);
  assert.equal(result.response.headers.get("content-type"), "image/webp"); assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(source.store.readerCatalog(read.token).species[0].media.portrait.kind, "project-normal");
  const capabilities = await api(source, "capabilities"); assert.equal(capabilities.value.normalMedia, 1);
}));

test("HTTP declaration binds the actual immutable source version and rejects stale or substituted metadata", () => scoped(async source => {
  for (const extra of [{ expectedRevision: "33333333-3333-4333-8333-333333333333" },
    { asset: { ...source.asset, attribution: "Different source" } }, { unknown: true }, { expectedBinding: { ...binding(source.a), userId: source.b.user.id } }]) {
    const result = await api(source, "normal-media", { method: "POST", data: declaration(source, extra) });
    assert.ok([400, 409].includes(result.response.status), JSON.stringify(result.value));
  }
  const first = source.store.declareNormalMedia(source.a.token, declaration(source));
  assert.equal(first.complete, false); assert.equal(first.width, null); assert.deepEqual(source.store.declareNormalMedia(source.a.token, declaration(source)), first);
  const read = await source.store.login({ username: source.a.user.username, password: source.f.password, scope: "read" });
  assert.equal((await api(source, "normal-media", { method: "POST", token: read.token, data: declaration(source) })).response.status, 403);
  assert.equal((await api(source, "normal-media/not-a-content-id", {})).response.status, 404);
}));

test("normal HTTP transfer rejects MIME changes, byte truncation and an incorrect person before completing a file", () => scoped(async source => {
  const metadata = source.store.declareNormalMedia(source.a.token, declaration(source)), pathname = `normal-media/${metadata.contentId}/content`;
  const wrongType = await api(source, pathname, { method: "PUT", bytes: source.bytes, headers: uploadHeaders(source.a, "image/jpeg") });
  assert.equal(wrongType.response.status, 415);
  const short = await api(source, pathname, { method: "PUT", bytes: source.bytes.subarray(0, source.bytes.length - 1), headers: uploadHeaders(source.a, source.mimeType) });
  assert.equal(short.response.status, 413);
  const incorrect = await api(source, pathname, { method: "PUT", bytes: source.bytes,
    headers: { ...uploadHeaders(source.a, source.mimeType), "X-Shared-User-Id": source.b.user.id } });
  assert.equal(incorrect.response.status, 409); assert.equal(source.store.getNormalMedia(source.a.token, metadata.contentId).complete, false);
}));

test("a registered image with the same UUID cannot claim availability of a normal file, and an exact gallery reuse keeps the normal binding", () => scoped(async source => {
  const { projectId, ...image } = source.asset;
  source.store.declareImageMedia(source.a.token, { ...image, expectedBinding: binding(source.a) });
  await source.store.putImageMedia(source.a.token, image.id, source.bytes, { expectedBinding: binding(source.a), mimeType: image.mimeType });
  let preview = source.store.previewReaderApproval(source.a.token, source.speciesObject.id, { expectedRevision: source.speciesObject.revision });
  assert.equal(preview.readerSpecies.media.portrait.kind, "unavailable");
  assert.equal(preview.missingMedia[0].id, image.id);
  const ready = await complete(source);
  const document = structuredClone(source.pageObject.data.document);
  document.images = [{ id: "normal-as-gallery", assetId: image.id, asset: source.asset, alt: "Testkauz im Porträt", caption: "Eigene Bildunterschrift", decorative: false }];
  const page = encodePageAuthoringDraft({ id: source.pageObject.data.pageId, revision: fingerprint("normal-gallery-source"), document });
  source.pageObject = source.store.submitChange(source.a.token, { changeId: "normal-gallery-page-update", kind: "page", id: source.pageObject.id,
    baseRevision: source.pageObject.revision, data: page }).object;
  const candidate = buildPageEditorialAdoption(source), current = source.store.submitChange(source.a.token, { changeId: "normal-gallery-adoption", kind: "species",
    id: source.speciesObject.id, baseRevision: source.speciesObject.revision, data: candidate.data, intent: candidate.intent }).object;
  preview = source.store.previewReaderApproval(source.a.token, current.id, { expectedRevision: current.revision });
  assert.equal(preview.missingMedia.length, 0); approve(source, current);
  const result = source.store.readerCatalog(source.a.token).species[0];
  assert.equal(result.media.portrait.kind, "project-normal"); assert.equal(result.media.gallery[0].asset.kind, "project-normal");
  assert.equal(result.media.gallery[0].asset.contentId, ready.contentId); assert.equal(result.media.gallery[0].caption, "Eigene Bildunterschrift");
}));

test("real normal image bytes and immutable source versions survive a separate snapshot and restore", () => scoped(async source => {
  const ready = await complete(source), snapshotDirectory = path.join(source.f.root, "normal-snapshot"), destination = path.join(source.f.root, "normal-restored.sqlite");
  const manifest = await createSharedProjectSnapshot({ filename: source.f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  assert.equal(manifest.databaseSchema, 6); assert.equal(manifest.counts.normal_media_assets, 1); assert.equal(manifest.counts.normal_media_blobs, 1);
  await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination, localStorageConfirmed: true });
  const db = new DatabaseSync(destination, { readOnly: true });
  try {
    const asset = db.prepare("SELECT * FROM normal_media_assets WHERE content_id=?").get(ready.contentId);
    assert.equal(asset.source_id, normalId); assert.equal(asset.source_revision, source.speciesObject.revision);
    assert.deepEqual(Buffer.from(db.prepare("SELECT data FROM normal_media_blobs WHERE sha256=?").get(source.asset.sha256).data), source.bytes);
  } finally { db.close(); }
}));

test("a same-length corrupted normal blob produces no backup evidence and remains available for diagnosis", () => scoped(async source => {
  await complete(source);
  const db = new DatabaseSync(source.f.filename);
  try {
    const damaged = Buffer.from(source.bytes); damaged[damaged.length - 1] ^= 1;
    db.prepare("UPDATE normal_media_blobs SET data=? WHERE sha256=?").run(damaged, source.asset.sha256);
  } finally { db.close(); }
  const destination = path.join(source.f.root, "invalid-normal-snapshot");
  await assert.rejects(createSharedProjectSnapshot({ filename: source.f.filename, destination, localStorageConfirmed: true }), denied("invalid_normal_media"));
  await assert.rejects(fs.stat(destination), { code: "ENOENT" });
  assert.throws(() => source.store.readNormalMedia(source.a.token, source.store.declareNormalMedia(source.a.token, declaration(source)).contentId), denied("normal_media_changed"));
}));

test("the normal sound route fully decodes unchanged MP3 bytes and a restored snapshot preserves the complete recording", async () => {
  const bytes = originalMp3();
  await scoped(async source => {
    const ready = await complete(source); assert.equal(ready.width, null); assert.equal(ready.height, null); assert.equal(ready.asset.mimeType, "audio/mpeg");
    approve(source);
    assert.equal(source.store.readerCatalog(source.a.token).species[0].media.sounds[0].kind, "project-normal");
    const read = await api(source, `normal-media/${ready.contentId}/content`); assert.deepEqual(read.value, bytes);
    const snapshotDirectory = path.join(source.f.root, "sound-snapshot"), destination = path.join(source.f.root, "sound-restored.sqlite");
    await createSharedProjectSnapshot({ filename: source.f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
    await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination, localStorageConfirmed: true });
    const db = new DatabaseSync(destination, { readOnly: true });
    try { assert.deepEqual(Buffer.from(db.prepare("SELECT data FROM normal_media_blobs").get().data), bytes); } finally { db.close(); }
  }, { slot: "sound.mp3", bytes, id: "original-recording-id" });
});
