import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createTestPng } from "../server-test-fixtures.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { createClientImageStore, inspectClientImageStore } from "./client-image-media-store.mjs";
import { CLIENT_IMAGE_LIMITS, inspectClientImage } from "./client-image-media.mjs";

const IMAGE = createTestPng(24, 16);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "image-store-")), filename = path.join(root, "cache.sqlite"), connections = [];
  const store = createSharedProjectClientStore({ filename, localStorageConfirmed: true });
  const owner = store.bind({ baseUrl: "https://fixture.invalid", projectId: "project-a", user: { id: "user-a", username: "fixture-a", displayName: "A", role: "admin" } });
  const other = store.bind({ baseUrl: "https://fixture.invalid", projectId: "project-b", user: { id: "user-b", username: "fixture-b", displayName: "B", role: "admin" } });
  t.after(() => { for (const db of connections) db.close(); store.close(); fs.rmSync(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 20 }); });
  function connection(limits) {
    const db = new DatabaseSync(filename); connections.push(db); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;");
    const media = createClientImageStore({ db, open() {}, limits,
      binding(id) { return [owner, other].find((entry) => entry.id === id); },
      tx(fn) { db.exec("BEGIN IMMEDIATE"); try { const value = fn(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; } } });
    return { db, media };
  }
  return { root, filename, store, owner, other, connection };
}

test("personal v3 image records retain provenance, segregate bindings and deduplicate exact bytes", async (t) => {
  const f = fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: f.owner.projectId, attribution: "Originalquelle" });
  f.store.media.save(f.owner.id, metadata, IMAGE);
  assert.equal(f.store.media.get(f.other.id, metadata.id), null);
  assert.throws(() => f.store.media.save(f.owner.id, { ...metadata, attribution: "Andere Quelle" }, IMAGE), { code: "image_media_changed" });
  const second = { ...metadata, id: `image-${randomUUID()}` }; f.store.media.save(f.owner.id, second, IMAGE);
  assert.equal(f.store.media.budget().imageBytes, IMAGE.length); assert.deepEqual(f.store.media.get(f.owner.id, metadata.id).buffer, IMAGE);
  const { db } = f.connection(); const checked = await inspectClientImageStore(db);
  assert.equal(checked.localBlobCount, 1); assert.equal(checked.localImageBytes, IMAGE.length); assert.deepEqual(checked.remoteBacked, []);
});

test("two real SQLite connections recheck quota inside their final write and still allow deduplicated provenance", async (t) => {
  const f = fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: f.owner.projectId }), bytes = createTestPng(25, 16);
  const different = await inspectClientImage(bytes, { projectId: f.owner.projectId });
  const limits = { blobBytes: IMAGE.length, cacheBytes: 1024 * 1024 }, first = f.connection(limits), second = f.connection(limits);
  assert.equal(first.media.budget().imageBytes, 0); assert.equal(second.media.budget().imageBytes, 0);
  first.media.save(f.owner.id, metadata, IMAGE);
  assert.throws(() => second.media.save(f.owner.id, different, bytes), { code: "image_media_quota" });
  assert.equal(second.media.get(f.owner.id, different.id), null);
  second.media.save(f.owner.id, { ...metadata, id: `image-${randomUUID()}`, attribution: "Weiterer Beleg" }, IMAGE);
  assert.equal(first.media.budget().imageBytes, IMAGE.length); assert.equal(second.db.prepare("SELECT count(*) AS n FROM image_media").get().n, 2);
});

test("cache admission reserves the unchanged backup boundary and cannot raise its limits", async (t) => {
  const f = fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: f.owner.projectId }), cache = f.store.media.budget().cacheBytes;
  const limited = f.connection({ blobBytes: CLIENT_IMAGE_LIMITS.blobBytes, cacheBytes: cache + CLIENT_IMAGE_LIMITS.metadataReserve - 1 });
  assert.throws(() => limited.media.save(f.owner.id, metadata, IMAGE), { code: "image_media_quota" });
  assert.equal(f.store.media.get(f.owner.id, metadata.id), null);
  assert.throws(() => f.connection({ blobBytes: CLIENT_IMAGE_LIMITS.blobBytes + 1, cacheBytes: CLIENT_IMAGE_LIMITS.cacheBytes }), { code: "invalid_image_media" });
});

test("remote-backed images have a complete person/project receipt without pretending to include local bytes", async (t) => {
  const f = fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: f.owner.projectId });
  f.store.media.rememberRemote(f.owner.id, metadata);
  const { db } = f.connection(), result = await inspectClientImageStore(db);
  assert.equal(result.localImageBytes, 0); assert.equal(result.remoteBacked.length, 1);
  assert.equal(result.remoteBacked[0].localBytesIncluded, false); assert.equal(result.remoteBacked[0].requiredServerMedia, true);
  db.prepare("UPDATE image_media SET receipt_json=NULL").run();
  await assert.rejects(inspectClientImageStore(db), { code: "image_media_changed" });
});

test("corrupt image bytes, metadata, unknown schema and unbound open drafts block the whole snapshot", async (t) => {
  for (const corruption of ["bytes", "metadata", "schema", "draft"]) {
    const f = fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: f.owner.projectId }); f.store.media.save(f.owner.id, metadata, IMAGE);
    const { db } = f.connection();
    if (corruption === "bytes") db.prepare("UPDATE image_blobs SET data=?").run(Buffer.alloc(IMAGE.length));
    else if (corruption === "metadata") db.prepare("UPDATE image_media SET metadata_json=?").run(JSON.stringify({ ...metadata, projectId: "other-project" }));
    else if (corruption === "schema") db.exec("CREATE TRIGGER unknown_image_trigger AFTER INSERT ON image_media BEGIN SELECT 1; END;");
    else db.prepare("INSERT INTO queue(binding_id,change_id,kind,object_id,data_json,state) VALUES (?,?, 'page','page-a',?,'queued')").run(f.owner.id, randomUUID(),
      JSON.stringify({ type: "fn-species-page", document: { images: [{ asset: { ...metadata, id: `image-${randomUUID()}` } }] } }));
    await assert.rejects(inspectClientImageStore(db));
  }
});

test("v2 to v4 migration retains existing private queue records and bindings", async (t) => {
  const f = fixture(t);
  f.store.saveObjects(f.owner.id, [{ kind: "page", id: "page-a", revision: "r1", data: { title: "Original" } }]);
  f.store.edit(f.owner.id, "page", "page-a", { title: "Eigener Offlineentwurf" }); f.store.close();
  const legacy = new DatabaseSync(f.filename); legacy.exec("DROP TABLE normal_media; DROP TABLE normal_blobs; DROP TABLE image_media; DROP TABLE image_blobs; PRAGMA user_version=2;"); legacy.close();
  const reopened = createSharedProjectClientStore({ filename: f.filename, localStorageConfirmed: true });
  try { assert.equal(reopened.get(f.owner.id, "page", "page-a").data.title, "Eigener Offlineentwurf"); assert.equal(reopened.counts(f.owner.id).pending, 1); assert.deepEqual(reopened.projectIds(), ["project-a", "project-b"]); }
  finally { reopened.close(); }
});

test("local get and snapshot reject a small declared size with larger actual bytes before any BLOB SELECT", async (t) => {
  const f = fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: f.owner.projectId }); f.store.media.save(f.owner.id, metadata, IMAGE);
  const { db } = f.connection(); db.prepare("UPDATE image_blobs SET data=?").run(Buffer.alloc(IMAGE.length + 1));
  let reads = 0;
  const traced = { prepare(sql) { if (/SELECT\s+(?:\*|data)\s+FROM\s+image_blobs\b/i.test(sql)) reads++; return db.prepare(sql); } };
  const media = createClientImageStore({ db: traced, open() {}, binding: () => f.owner, tx: (fn) => fn() });
  assert.throws(() => media.get(f.owner.id, metadata.id), { code: "image_media_changed" }); assert.equal(reads, 0);
  await assert.rejects(inspectClientImageStore(traced), { code: "image_media_changed" }); assert.equal(reads, 0);
});

test("the aggregate image reserve is checked before materializing any individually valid BLOB", async (t) => {
  const f = fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: f.owner.projectId }); f.store.media.save(f.owner.id, metadata, IMAGE);
  const { db } = f.connection(); let reads = 0;
  const traced = { prepare(sql) { if (/SELECT\s+(?:\*|data)\s+FROM\s+image_blobs\b/i.test(sql)) reads++; return db.prepare(sql); } };
  const limits = { ...CLIENT_IMAGE_LIMITS, blobBytes: IMAGE.length - 1 };
  const media = createClientImageStore({ db: traced, open() {}, binding: () => f.owner, tx: (fn) => fn(), limits });
  assert.throws(() => media.get(f.owner.id, metadata.id), { code: "image_media_quota" }); assert.equal(reads, 0);
  await assert.rejects(inspectClientImageStore(traced, { limits }), { code: "image_media_quota" }); assert.equal(reads, 0);
});

test("metadata and receipt cells reject disguised BLOBs and oversized JSON before materialization", async (t) => {
  for (const mode of ["metadata-blob", "receipt-blob", "metadata-text", "receipt-text"]) await t.test(mode, async (t) => {
    const f = fixture(t), metadata = await inspectClientImage(IMAGE, { projectId: f.owner.projectId }); f.store.media.rememberRemote(f.owner.id, metadata);
    const { db } = f.connection(), column = mode.startsWith("metadata") ? "metadata_json" : "receipt_json";
    const original = db.prepare(`SELECT ${column} AS value FROM image_media WHERE id=?`).get(metadata.id).value;
    db.prepare(`UPDATE image_media SET ${column}=? WHERE id=?`).run(mode.endsWith("blob") ? Buffer.from(original) : " ".repeat(64 * 1024 + 1) + original, metadata.id);
    let unboundedBytes = 0;
    const observe = (row) => {
      if (row) for (const key of ["metadata_json", "receipt_json"]) {
        const value = row[key]; if (value instanceof Uint8Array) unboundedBytes += value.byteLength;
        else if (typeof value === "string" && Buffer.byteLength(value) > 64 * 1024) unboundedBytes += Buffer.byteLength(value);
      }
      return row;
    };
    const traced = { prepare(sql) {
      const statement = db.prepare(sql);
      return { get: (...args) => observe(statement.get(...args)), all: (...args) => statement.all(...args).map(observe),
        *iterate(...args) { for (const row of statement.iterate(...args)) yield observe(row); } };
    } };
    const media = createClientImageStore({ db: traced, open() {}, binding: () => f.owner, tx: (fn) => fn() });
    assert.throws(() => media.get(f.owner.id, metadata.id), { code: "invalid_image_media" }); assert.equal(unboundedBytes, 0);
    assert.throws(() => media.describe(f.owner.id, metadata.id), { code: "invalid_image_media" }); assert.equal(unboundedBytes, 0);
    await assert.rejects(inspectClientImageStore(traced), { code: "invalid_image_media" }); assert.equal(unboundedBytes, 0);
  });
});
