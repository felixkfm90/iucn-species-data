import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fixture } from "./test-fixtures.mjs";
import { ProjectError } from "./errors.mjs";
import { digest, objectJson, tokenHash } from "./security.mjs";
import { normalMediaBinding } from "./normal-media.mjs";
import { installNormalMediaSchema } from "./normal-media-schema.mjs";
import { createNormalMediaStore } from "./normal-media-store.mjs";
import { inspectJpeg, inspectWebp } from "../../scripts/image-header.mjs";

// Small synthetic containers plus explicit decoder receipts isolate the actual
// SQLite/actor/CAS lifecycle here. They do not claim real pixel/audio decoding;
// the existing image and full audio validator suites cover that independently.
function jpeg(width = 6, height = 4) {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 0xff, 0xd9]);
  bytes.writeUInt16BE(height, 7); bytes.writeUInt16BE(width, 9); return bytes;
}
function webp(width = 6, height = 4) {
  const bytes = Buffer.alloc(30); bytes.write("RIFF", "ascii"); bytes.writeUInt32LE(22, 4); bytes.write("WEBPVP8X", 8, "ascii");
  bytes.writeUInt32LE(10, 16); bytes.writeUIntLE(width - 1, 24, 3); bytes.writeUIntLE(height - 1, 27, 3); return bytes;
}
function mp3() {
  const frame = Buffer.alloc(417); Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame); return Buffer.concat([frame, frame, frame]);
}
const mediaBytes = { "portrait.webp": webp(), "map.jpg": jpeg(), "sound.mp3": mp3(), "spectrogram.webp": webp() };
const mime = { "portrait.webp": "image/webp", "map.jpg": "image/jpeg", "sound.mp3": "audio/mpeg", "spectrogram.webp": "image/webp" };
const denied = (...codes) => error => codes.includes(error.code);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function waitForDecoder(entered, work) {
  await Promise.race([entered.promise, work.then(() => { throw new Error("The controlled decoder was not entered"); }, error => { throw error; })]);
}
const imageReceipt = async (bytes, { format }) => {
  const value = (format === "jpeg" ? inspectJpeg : inspectWebp)(bytes); return { width: value.width, height: value.height };
};
const audioReceipt = async bytes => ({ bytes: bytes.length, sha256: digest(bytes), mimeType: "audio/mpeg" });
function workingRecord(id = "fixture-owl", bytes = mediaBytes) {
  return { type: "fn-species-record", schemaVersion: 1, id,
    input: { german: "Testkauz", english: "Fixture owl", genus: "Strix", species: "fixture", size: "30 cm", unknownOriginal: { retained: true } },
    generated: { URLSlug: id, Class: "Aves", Status: "LC" }, taxonomyOverride: null, assessmentBinding: { retained: true },
    assets: { assetName: "Historischer Testkauz", files: Object.fromEntries(Object.entries(bytes).map(([slot, content]) => [slot,
      { id: `legacy:${id}:${slot}`, bytes: content.length, sha256: digest(content), mimeType: mime[slot] }])),
    overrides: { map: { source: "Eigene Karte", manual: true } }, credits: { source: "Eigene Tonquelle", recordist: "Fixture Recorder", privateNote: "Private source sentinel" },
    portraitMetadata: { source: "Eigene Aufnahme", prompt: "Private prompt sentinel" } },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
}

async function scoped(t, fn, decoders = {}) {
  const f = fixture(); let db;
  try {
    const initialized = await f.initialized(); db = new DatabaseSync(f.filename);
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF;");
    installNormalMediaSchema(db);
    function transaction(operation, { readOnly = false } = {}) {
      db.exec(readOnly ? "BEGIN" : "BEGIN IMMEDIATE");
      try { const result = operation(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
    // Real fixture sessions/users/devices, read through the same handle as the
    // tested transaction so role and approval reads share its SQLite snapshot.
    function actor(token, roles = ["admin", "publisher", "contributor", "reader"], { write = false } = {}) {
      const now = Date.now();
      const row = db.prepare(`SELECT u.*,s.scope,s.device_id FROM sessions s JOIN users u ON u.id=s.user_id
        LEFT JOIN devices d ON d.id=s.device_id WHERE s.token_hash=? AND s.expires_at>? AND u.blocked=0
        AND (s.device_id IS NULL OR (d.revoked=0 AND d.expires_at>?))`).get(tokenHash(token, "s"), now, now);
      if (!row) throw new ProjectError(401, "authentication_required", "Synthetic fixture authentication required");
      if (!roles.includes(row.role) || write && row.scope !== "full") throw new ProjectError(403, "forbidden", "Synthetic fixture write denied");
      return row;
    }
    const iso = () => new Date().toISOString();
    const audit = (user, action, target) => db.prepare("INSERT INTO audit(actor_id,action,target,created_at) VALUES (?,?,?,?)").run(user.id, action, target, iso());
    const factory = options => createNormalMediaStore({ db, actor, transaction, audit, iso,
      imageDecode: imageReceipt, audioDecode: audioReceipt, ...decoders, ...options });
    const media = factory();
    const source = initialized.store.createObject(initialized.a.token, { kind: "species", id: "fixture-owl", data: workingRecord() });
    const binding = token => { const user = initialized.store.me(token); return { projectId: user.projectId, userId: user.id, role: user.role }; };
    const declare = (slot = "portrait.webp", token = initialized.a.token, object = source) => {
      const value = normalMediaBinding(object.data, { projectId: initialized.a.projectId, slot });
      return media.declare(token, { speciesId: object.id, slot, expectedRevision: object.revision, asset: value.asset, expectedBinding: binding(token) });
    };
    const put = (value, bytes = mediaBytes[value.slot], token = initialized.a.token, options = {}) => media.put(token, value.contentId, bytes,
      { expectedBinding: binding(token), mimeType: value.asset.mimeType, ...options });
    const generation = () => Number(db.prepare("SELECT value FROM meta WHERE key='reader_media_generation'").get().value);
    // Controlled historical source fixtures model future protected-asset
    // adapters. The ordinary shared manual editor still cannot edit assets.
    function appendVersion(data, object = source) {
      return transaction(() => {
        const previous = db.prepare("SELECT v.* FROM objects o JOIN versions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.current_revision WHERE o.kind='species' AND o.id=?").get(object.id);
        const revision = randomUUID();
        db.prepare("INSERT INTO versions(kind,id,revision,ordinal,parent_revision,data,author_id,created_at) VALUES ('species',?,?,?,?,?,?,?)")
          .run(object.id, revision, previous.ordinal + 1, previous.revision, objectJson(data), initialized.a.user.id, iso());
        db.prepare("UPDATE objects SET current_revision=? WHERE kind='species' AND id=?").run(revision, object.id);
        return { ...object, revision, data: structuredClone(data) };
      });
    }
    await fn({ ...initialized, f, db, media, factory, source, binding, declare, put, generation, appendVersion, transaction });
  } finally { db?.close(); f.cleanup(); }
}

test("normal store binds old IDs to real source revisions, preserves original bytes and deduplicates ready content", t => scoped(t, async c => {
  const before = c.declare(), revision = c.source.revision;
  assert.equal(before.complete, false); assert.equal(before.width, null); assert.equal(c.generation(), 0);
  assert.equal(before.asset.id, "legacy:fixture-owl:portrait.webp");
  assert.throws(() => c.media.content(c.a.token, before.contentId), denied("normal_media_incomplete"));
  const bytes = Buffer.from(mediaBytes[before.slot]), ready = await c.put(before, bytes);
  assert.equal(ready.complete, true); assert.equal(ready.width, 6); assert.equal(ready.height, 4); assert.equal(c.generation(), 1);
  assert.deepEqual(c.media.content(c.a.token, ready.contentId).bytes, bytes); assert.deepEqual(bytes, mediaBytes[before.slot]);
  assert.deepEqual(await c.put(ready, bytes), ready); assert.deepEqual(c.declare(), ready); assert.equal(c.generation(), 1);
  const alias = c.declare("spectrogram.webp"); assert.equal(alias.complete, true); assert.notEqual(alias.contentId, ready.contentId);
  assert.equal(c.generation(), 2); assert.equal(c.db.prepare("SELECT count(*) AS n FROM normal_media_blobs").get().n, 1);
  assert.equal(c.db.prepare("SELECT count(*) AS n FROM normal_media_assets").get().n, 2);
  assert.equal(c.db.prepare("SELECT source_revision FROM normal_media_assets WHERE content_id=?").get(ready.contentId).source_revision, revision);
  assert.deepEqual(Object.keys(ready).sort(), ["contentId", "projectId", "speciesId", "slot", "asset", "width", "height", "complete"].sort());
  assert.doesNotMatch(JSON.stringify(ready), /Private source sentinel|Private prompt sentinel|Historischer Testkauz|sourceRevision|source_revision/);
  assert.equal(c.store.listObjects(c.a.token).length, 1);
}));

test("normal JPEG and full-MP3 routes call the injected validators and keep MP3 dimensions null", t => scoped(t, async c => {
  const map = c.declare("map.jpg"), sound = c.declare("sound.mp3");
  assert.equal((await c.put(map)).width, 6);
  const ready = await c.put(sound); assert.equal(ready.width, null); assert.equal(ready.height, null);
  assert.deepEqual(c.media.content(c.a.token, ready.contentId).bytes, mediaBytes["sound.mp3"]);
  assert.equal(c.generation(), 2);
}));

test("declaration requires the actual current source and immutable complete six-field metadata", t => scoped(t, async c => {
  const source = normalMediaBinding(c.source.data, { projectId: c.a.projectId, slot: "portrait.webp" });
  const base = { speciesId: c.source.id, slot: source.slot, expectedRevision: c.source.revision, asset: source.asset, expectedBinding: c.binding(c.a.token) };
  for (const mutate of [value => { value.expectedRevision = randomUUID(); }, value => { value.asset.attribution = "Invented source"; },
    value => { value.asset.id = "invented-id"; }, value => { value.asset.sha256 = "f".repeat(64); }, value => { value.asset.bytes++; },
    value => { value.expectedBinding.projectId = "foreign-project"; }, value => { value.expectedBinding.userId = c.b.user.id; }]) {
    const input = structuredClone(base); mutate(input); assert.throws(() => c.media.declare(c.a.token, input));
  }
  const next = structuredClone(c.source.data); next.input.size = "31 cm";
  c.store.submitChange(c.b.token, { changeId: "normal-source-next", kind: "species", id: c.source.id, baseRevision: c.source.revision, data: next });
  assert.throws(() => c.media.declare(c.a.token, base), denied("object_changed"));
  assert.equal(c.db.prepare("SELECT count(*) AS n FROM normal_media_assets").get().n, 0); assert.equal(c.generation(), 0);
}));

test("all three full writer roles can declare while reader and read-only sessions cannot admit a body", t => scoped(t, async c => {
  for (const role of ["publisher", "contributor", "reader"]) {
    const user = c.store.me(c.b.token); c.store.updateUser(c.a.token, user.id, { expectedVersion: user.version, role });
    if (role === "reader") {
      assert.throws(() => c.declare("map.jpg", c.b.token), denied("forbidden"));
      assert.throws(() => c.media.assertWrite(c.b.token, c.binding(c.b.token)), denied("forbidden"));
      await assert.rejects(c.media.put(c.b.token, "normal-" + "0".repeat(64), Buffer.from([0]), { expectedBinding: c.binding(c.b.token), mimeType: "image/jpeg" }), denied("forbidden"));
      continue;
    }
    const value = c.declare("map.jpg", c.b.token); assert.equal(c.media.assertWrite(c.b.token, c.binding(c.b.token), value.contentId).contentId, value.contentId);
  }
  const value = c.declare(); assert.equal(c.media.assertWrite(c.a.token, c.binding(c.a.token)), true);
  const readonly = await c.store.login({ username: c.a.user.username, password: c.f.password, scope: "read" });
  assert.throws(() => c.media.assertWrite(readonly.token, c.binding(readonly.token), value.contentId), denied("forbidden"));
  assert.throws(() => c.media.get("not-a-session", value.contentId), denied("authentication_required"));
}));

test("reader and read-scope access is bound to the currently approved same-species version and exact slot", t => scoped(t, async c => {
  const first = await c.put(c.declare());
  c.store.updateUser(c.a.token, c.b.user.id, { expectedVersion: c.store.me(c.b.token).version, role: "reader" });
  const readonly = await c.store.login({ username: c.a.user.username, password: c.f.password, scope: "read" });
  for (const token of [c.b.token, readonly.token]) {
    assert.throws(() => c.media.get(token, first.contentId), denied("normal_media_not_found"));
    assert.equal(c.media.resolve(token, first.asset, { speciesId: c.source.id, role: "portrait" }), null);
  }
  c.store.approveObject(c.a.token, "species", c.source.id, { expectedRevision: c.source.revision });
  const nextBytes = webp(7, 4), nextData = structuredClone(c.source.data);
  nextData.assets.files["portrait.webp"] = { ...nextData.assets.files["portrait.webp"], sha256: digest(nextBytes), bytes: nextBytes.length };
  const next = c.appendVersion(nextData), second = await c.put(c.declare("portrait.webp", c.a.token, next), nextBytes);
  for (const token of [c.b.token, readonly.token]) {
    assert.deepEqual(c.media.content(token, first.contentId).bytes, mediaBytes["portrait.webp"]);
    assert.throws(() => c.media.get(token, second.contentId), denied("normal_media_not_found"));
  }
  c.store.approveObject(c.a.token, "species", next.id, { expectedRevision: next.revision });
  for (const token of [c.b.token, readonly.token]) {
    assert.throws(() => c.media.get(token, first.contentId), denied("normal_media_not_found"));
    assert.deepEqual(c.media.content(token, second.contentId).bytes, nextBytes);
    assert.deepEqual(c.media.resolve(token, second.asset, { speciesId: c.source.id, role: "portrait" }), { kind: "project-normal", ...second.asset, contentId: second.contentId });
    assert.equal(c.media.resolve(token, second.asset, { speciesId: "other-species", role: "portrait" }), null);
  }
  const otherData = workingRecord("other-species");
  otherData.input.german = "Anderer Testkauz";
  otherData.input.species = "altera";
  otherData.assets.assetName = "Anderer historischer Testkauz";
  const other = c.store.createObject(c.a.token, { kind: "species", id: "other-species", data: otherData });
  c.db.prepare("UPDATE objects SET approved_revision=? WHERE kind='species' AND id=?").run(other.revision, c.source.id);
  assert.throws(() => c.media.get(c.b.token, second.contentId), denied("normal_media_not_found"));
}));

test("historical declared source revision remains immutable and valid after an ordinary source HEAD advance", t => scoped(t, async c => {
  const value = c.declare(), entered = deferred(), release = deferred();
  const media = c.factory({ imageDecode: async bytes => { assert.equal(c.db.isTransaction, false); entered.resolve(); await release.promise; return imageReceipt(bytes, { format: "webp" }); } });
  const work = media.put(c.a.token, value.contentId, mediaBytes[value.slot], { expectedBinding: c.binding(c.a.token), mimeType: value.asset.mimeType });
  let advanced;
  try {
    await waitForDecoder(entered, work);
    const next = structuredClone(c.source.data); next.input.size = "32 cm";
    advanced = c.store.submitChange(c.b.token, { changeId: "advance-during-normal", kind: "species", id: c.source.id, baseRevision: c.source.revision, data: next }).object;
  } finally { release.resolve(); await work.catch(() => {}); }
  assert.equal((await work).complete, true);
  assert.equal(c.declare("portrait.webp", c.a.token, advanced).contentId, value.contentId);
  assert.equal(c.db.prepare("SELECT source_revision FROM normal_media_assets WHERE content_id=?").get(value.contentId).source_revision, c.source.revision);
  assert.equal(c.generation(), 1);
}));

test("role changes and real device revocation during an asynchronous decoder prevent every final write", t => scoped(t, async c => {
  for (const mode of ["role", "device"]) {
    const session = await c.store.login({ username: c.a.user.username, password: c.f.password, deviceLabel: `Normal ${mode}` });
    const value = c.declare(mode === "role" ? "portrait.webp" : "map.jpg", session.token), entered = deferred(), release = deferred();
    const media = c.factory({ imageDecode: async (bytes, options) => { entered.resolve(); await release.promise; return imageReceipt(bytes, options); } });
    const work = media.put(session.token, value.contentId, mediaBytes[value.slot], { expectedBinding: c.binding(session.token), mimeType: value.asset.mimeType });
    const rejected = assert.rejects(work, denied("media_binding_changed", "forbidden", "authentication_required"));
    try {
      await waitForDecoder(entered, work);
      if (mode === "role") c.store.updateUser(c.b.token, c.a.user.id, { expectedVersion: c.store.me(c.a.token).version, role: "publisher" });
      else c.store.revokeDevice(session.token, session.device.id);
    } finally { release.resolve(); await work.catch(() => {}); }
    await rejected;
    assert.equal(c.db.prepare("SELECT blob_sha256 FROM normal_media_assets WHERE content_id=?").get(value.contentId).blob_sha256, null);
  }
  assert.equal(c.db.prepare("SELECT count(*) AS n FROM normal_media_blobs").get().n, 0); assert.equal(c.generation(), 0);
}));

test("immutable source replacement during decode and source revisions belonging to another object never qualify", t => scoped(t, async c => {
  const value = c.declare(), entered = deferred(), release = deferred();
  const equivalent = c.appendVersion(structuredClone(c.source.data));
  const media = c.factory({ imageDecode: async (bytes, options) => { entered.resolve(); await release.promise; return imageReceipt(bytes, options); } });
  const work = media.put(c.a.token, value.contentId, mediaBytes[value.slot], { expectedBinding: c.binding(c.a.token), mimeType: value.asset.mimeType });
  const rejected = assert.rejects(work, denied("normal_media_changed"));
  try { await waitForDecoder(entered, work); c.db.prepare("UPDATE normal_media_assets SET source_revision=? WHERE content_id=?").run(equivalent.revision, value.contentId); }
  finally { release.resolve(); await work.catch(() => {}); }
  await rejected; assert.equal(c.generation(), 0);
  const other = c.store.createObject(c.a.token, { kind: "page", id: "unrelated-page", data: { title: "Other source kind" } });
  c.db.prepare("UPDATE normal_media_assets SET source_revision=? WHERE content_id=?").run(other.revision, value.contentId);
  assert.throws(() => c.media.get(c.a.token, value.contentId), denied("normal_media_changed"));
  c.db.prepare("UPDATE normal_media_assets SET source_revision=?,slot='spectrogram.webp' WHERE content_id=?").run(c.source.revision, value.contentId);
  assert.throws(() => c.media.get(c.a.token, value.contentId), denied("normal_media_changed"));
  assert.equal(c.db.prepare("SELECT count(*) AS n FROM normal_media_blobs").get().n, 0);
}));

test("wrong byte hashes, MIME, headers, decoder receipts and excessive dimensions leave no complete binding", t => scoped(t, async c => {
  const value = c.declare(), bytes = mediaBytes[value.slot];
  for (const [input, mimeType] of [[Buffer.from("wrong bytes"), value.asset.mimeType], [bytes, "image/jpeg"]]) {
    await assert.rejects(c.media.put(c.a.token, value.contentId, input, { expectedBinding: c.binding(c.a.token), mimeType }), denied("invalid_normal_media"));
  }
  const badImage = c.factory({ imageDecode: async () => ({ width: 50000, height: 50000 }) });
  await assert.rejects(badImage.put(c.a.token, value.contentId, bytes, { expectedBinding: c.binding(c.a.token), mimeType: value.asset.mimeType }), denied("invalid_normal_media"));
  const sound = c.declare("sound.mp3"), badAudio = c.factory({ audioDecode: async bytes => ({ bytes: bytes.length, sha256: "0".repeat(64), mimeType: "audio/mpeg" }) });
  await assert.rejects(badAudio.put(c.a.token, sound.contentId, mediaBytes[sound.slot], { expectedBinding: c.binding(c.a.token), mimeType: sound.asset.mimeType }), denied("invalid_normal_media"));
  const huge = webp(10000, 5000), data = structuredClone(c.source.data);
  data.assets.files["portrait.webp"] = { ...data.assets.files["portrait.webp"], bytes: huge.length, sha256: digest(huge) };
  const next = c.appendVersion(data), declared = c.declare("portrait.webp", c.a.token, next);
  await assert.rejects(c.put(declared, huge), denied("invalid_normal_media"));
  assert.equal(c.db.prepare("SELECT count(*) AS n FROM normal_media_blobs").get().n, 0); assert.equal(c.generation(), 0);
}));

test("single-decoder admission, caller cancellation and shared media_busy remain distinct and release admission", t => scoped(t, async c => {
  const value = c.declare(), entered = deferred(), release = deferred(), controller = new AbortController();
  const media = c.factory({ imageDecode: async (bytes, options) => { entered.resolve(); await release.promise; return imageReceipt(bytes, options); } });
  const options = { expectedBinding: c.binding(c.a.token), mimeType: value.asset.mimeType };
  const first = media.put(c.a.token, value.contentId, mediaBytes[value.slot], { ...options, signal: controller.signal });
  const rejected = assert.rejects(first, denied("normal_media_cancelled"));
  try {
    await waitForDecoder(entered, first);
    await assert.rejects(media.put(c.a.token, value.contentId, mediaBytes[value.slot], options), denied("normal_media_busy"));
    controller.abort(new Error("private cancellation detail"));
  } finally { release.resolve(); await first.catch(() => {}); }
  await rejected; assert.equal(c.generation(), 0);
  assert.equal((await media.put(c.a.token, value.contentId, mediaBytes[value.slot], options)).complete, true);
  const map = c.declare("map.jpg"), busy = new ProjectError(429, "media_busy", "Shared decoder fixture busy");
  const sharedGate = c.factory({ imageDecode: async () => { throw busy; } });
  await assert.rejects(sharedGate.put(c.a.token, map.contentId, mediaBytes[map.slot], { expectedBinding: c.binding(c.a.token), mimeType: map.asset.mimeType }), error => error === busy);
}));

test("a decoder cannot mutate the private byte snapshot into a different committed original", t => scoped(t, async c => {
  const value = c.declare(), input = Buffer.from(mediaBytes[value.slot]), before = Buffer.from(input);
  const media = c.factory({ imageDecode: async (bytes, options) => { const result = await imageReceipt(bytes, options); bytes[bytes.length - 1] ^= 1; return result; } });
  await assert.rejects(media.put(c.a.token, value.contentId, input, { expectedBinding: c.binding(c.a.token), mimeType: value.asset.mimeType }), denied("normal_media_changed"));
  assert.deepEqual(input, before); assert.equal(c.generation(), 0); assert.equal(c.db.prepare("SELECT count(*) AS n FROM normal_media_blobs").get().n, 0);
}));

test("caller Buffer mutations during await cannot change the checked or committed original snapshot", t => scoped(t, async c => {
  const value = c.declare(), input = Buffer.from(mediaBytes[value.slot]), original = Buffer.from(input), entered = deferred(), release = deferred();
  const media = c.factory({ imageDecode: async (bytes, options) => { entered.resolve(); await release.promise; return imageReceipt(bytes, options); } });
  const work = media.put(c.a.token, value.contentId, input, { expectedBinding: c.binding(c.a.token), mimeType: value.asset.mimeType });
  try { await waitForDecoder(entered, work); input.fill(0); }
  finally { release.resolve(); await work.catch(() => {}); }
  const result = await work;
  assert.equal(result.asset.sha256, digest(original)); assert.notEqual(digest(input), result.asset.sha256);
  assert.deepEqual(media.content(c.a.token, value.contentId).bytes, original); assert.equal(c.generation(), 1);
}));

test("content reads and deduplication reject changed stored bytes before returning or confirming another binding", t => scoped(t, async c => {
  const ready = await c.put(c.declare()), bytes = Buffer.from(mediaBytes[ready.slot]); bytes[bytes.length - 1] ^= 1;
  c.db.prepare("UPDATE normal_media_blobs SET data=? WHERE sha256=?").run(bytes, ready.asset.sha256);
  assert.throws(() => c.media.get(c.a.token, ready.contentId), denied("normal_media_changed"));
  assert.throws(() => c.media.content(c.a.token, ready.contentId), denied("normal_media_changed"));
  assert.throws(() => c.declare("spectrogram.webp"), denied("normal_media_changed"));
  assert.equal(c.db.prepare("SELECT count(*) AS n FROM normal_media_assets").get().n, 1); assert.equal(c.generation(), 1);
}));

test("facade reconstruction resumes the durable incomplete source and normal image-UUID IDs remain independent of the image register", t => scoped(t, async c => {
  const data = structuredClone(c.source.data); data.assets.files["portrait.webp"].id = "image-11111111-1111-4111-8111-111111111111";
  const next = c.appendVersion(data), value = c.declare("portrait.webp", c.a.token, next), restarted = c.factory();
  assert.equal(c.db.prepare("SELECT count(*) AS n FROM image_media_assets").get().n, 0);
  assert.deepEqual(restarted.get(c.a.token, value.contentId), value);
  const ready = await restarted.put(c.a.token, value.contentId, mediaBytes[value.slot], { expectedBinding: c.binding(c.a.token), mimeType: value.asset.mimeType });
  assert.equal(ready.asset.id, data.assets.files["portrait.webp"].id); assert.equal(ready.complete, true);
  assert.deepEqual(c.transaction(() => restarted.resolve(c.a.token, ready.asset, { speciesId: next.id, role: "portrait" }), { readOnly: true }),
    { kind: "project-normal", ...ready.asset, contentId: ready.contentId });
  assert.equal(c.generation(), 1);
}));
