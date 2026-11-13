import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fixture } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient } from "./client.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { createClientNormalMedia } from "./client-normal-media.mjs";
import { normalMediaBinding } from "./normal-media.mjs";
import { ProjectError } from "./errors.mjs";
import { objectJson, digest } from "./security.mjs";
import { inspectWebp } from "../../scripts/image-header.mjs";

// Synthetic frame/container fixtures plus injected decoders isolate transport,
// identity and cache lifecycle. No FFmpeg process is started by this test file.
const webp = Buffer.alloc(30); webp.write("RIFF", "ascii"); webp.writeUInt32LE(22, 4); webp.write("WEBPVP8X", 8, "ascii");
webp.writeUInt32LE(10, 16); webp.writeUIntLE(5, 24, 3); webp.writeUIntLE(3, 27, 3);
const frame = Buffer.alloc(417); Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame);
const mp3 = Buffer.concat([frame, frame, frame]);
const bytesFor = slot => slot === "sound.mp3" ? mp3 : webp;
const imageDecode = async bytes => { const header = inspectWebp(bytes); return { width: header.width, height: header.height }; };
const audioDecode = async bytes => ({ bytes: bytes.length, sha256: digest(bytes), mimeType: "audio/mpeg" });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const denied = code => error => error.code === code;
function record() {
  return { type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Testkauz", genus: "Strix", species: "fixture", english: "Fixture owl", unknownOriginal: { retained: true } },
    generated: { Class: "Aves" }, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Historischer Testkauz", files: {
      "portrait.webp": { id: "image-11111111-1111-4111-8111-111111111111", bytes: webp.length, sha256: digest(webp), mimeType: "image/webp" },
      "sound.mp3": { id: "original:unchanged:sound", bytes: mp3.length, sha256: digest(mp3), mimeType: "audio/mpeg" } },
    overrides: {}, credits: { source: "Eigene Tonquelle" }, portraitMetadata: { source: "Eigene Aufnahme", prompt: "Private prompt sentinel" } },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
}
function object() { return { kind: "species", id: "fixture-owl", revision: "11111111-1111-4111-8111-111111111111", ordinal: 1,
  data: record(), localPending: false, localConflict: false, approval: "draft", approvedRevision: null }; }
function inputFor(source, binding, slot = "portrait.webp") {
  return { speciesId: source.id, slot, expectedRevision: source.revision, expectedDataHash: digest(objectJson(source.data)), requiredBinding: { ...binding } };
}
function fake(options = {}) {
  const cache = object(), active = { baseUrl: "https://fixture.example", projectId: "fixture-project", userId: "fixture-user",
    user: { id: "fixture-user", role: "admin" }, readOnly: false };
  const requiredBinding = { baseUrl: active.baseUrl, projectId: active.projectId, userId: active.userId, role: active.user.role };
  const calls = [], state = { metadata: null, closed: false, hooks: {}, capability: 1, capabilityStatus: 200, contentHeaders: null, contentBytes: null };
  let chain = Promise.resolve();
  const expected = slot => normalMediaBinding(cache.data, { projectId: active.projectId, slot });
  function dto(slot, complete) { return { ...expected(slot), width: complete && slot !== "sound.mp3" ? 6 : null,
    height: complete && slot !== "sound.mp3" ? 4 : null, complete }; }
  const factory = overrides => createClientNormalMedia({
    run(operation) { const work = chain.then(async () => { if (options.runGate) await options.runGate; return operation(); }); chain = work.catch(() => {}); return work; },
    capture: () => ({ ...active, user: { ...active.user } }),
    ensureOpen() { if (state.closed) throw new ProjectError(409, "client_closed", "Fixture closed"); },
    getObject(kind, id, mode) { assert.equal(kind, "species"); assert.equal(id, cache.id); assert.deepEqual(mode, { serverOnly: true }); return cache; },
    async online() { await state.hooks.online?.(); return active; },
    async authenticated(route, request = {}) {
      calls.push({ route, method: request.method ?? "GET" });
      await state.hooks.request?.(route, request);
      if (route === "capabilities") return { status: state.capabilityStatus,
        value: { projectId: active.projectId, user: { id: active.userId, role: active.user.role }, ...(state.capability === undefined ? {} : { normalMedia: state.capability }) } };
      const slot = route.includes(expected("sound.mp3").contentId) ? "sound.mp3" : "portrait.webp";
      if (route === "normal-media" && request.method === "POST") { state.metadata = dto(request.data.slot, false); return { status: 200, value: state.metadata }; }
      if (route.endsWith("/content") && request.method === "PUT") {
        assert.deepEqual(request.buffer, bytesFor(slot)); state.metadata = dto(slot, true);
        if (state.hooks.lostPut) throw new ProjectError(503, "offline", "Fixture lost response");
        return { status: 200, value: state.metadata };
      }
      if (route.endsWith("/content")) return { status: 200, value: state.contentBytes ?? Buffer.from(bytesFor(slot)),
        headers: state.contentHeaders ?? new Headers({ "Content-Type": state.metadata.asset.mimeType, "Content-Length": String(state.metadata.asset.bytes), "X-Content-SHA256": state.metadata.asset.sha256 }) };
      return state.metadata ? { status: 200, value: state.metadata } : { status: 404, value: { error: { code: "normal_media_not_found" } } };
    },
    actionError: result => new ProjectError(result.status, "service_error", "Fixture service failure"), imageDecode, audioDecode, ...options, ...overrides,
  });
  return { cache, active, calls, state, dto, factory, media: factory(), input: slot => inputFor(cache, requiredBinding, slot) };
}
async function real(t, operation, { clientOptions = {}, storeOptions = {} } = {}) {
  const f = fixture(), clients = []; let http;
  try {
    const initialized = await f.initialized({ imageDecode, audioDecode, ...storeOptions });
    const source = initialized.store.createObject(initialized.a.token, { kind: "species", id: "fixture-owl", data: record() });
    http = createSharedProjectHttp({ store: initialized.store }); const address = await http.listen();
    async function client(name, login = initialized.a, options = {}) {
      const filename = path.join(f.root, `${name}.sqlite`), value = createSharedProjectClient({ filename, localStorageConfirmed: true,
        allowLoopbackHttp: true, imageDecode, audioDecode, ...clientOptions, ...options }); clients.push(value);
      await value.connect({ baseUrl: address.url, username: login.user.username, password: f.password });
      return { value, filename };
    }
    async function input(value, slot = "portrait.webp") {
      const source = await value.getObject("species", "fixture-owl"), status = await value.status();
      return inputFor(source, { baseUrl: status.baseUrl, projectId: status.projectId, userId: status.user.id, role: status.user.role }, slot);
    }
    await operation({ ...initialized, f, source, address, client, input });
  } finally { for (const client of clients) await client.close(); await http?.close(); f.cleanup(); }
}
function cacheEvidence(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try { return { queue: db.prepare("SELECT * FROM queue ORDER BY seq").all(),
    contents: db.prepare("SELECT kind,id,server_json,local_json FROM cache ORDER BY kind,id").all(),
    images: db.prepare("SELECT count(*) AS n FROM image_media").get().n }; } finally { db.close(); }
}

// Regression sources written before adding persistent normal-media APIs. These
// require a deliberate download; ordinary read/status/upload remain RAM-only.
test('explicit normal download survives a client reopen and local reading performs no network or queue write',t=>real(t,async c=>{
  const first=await c.client('offline-normal');const input=await c.input(first.value);
  await first.value.normalMedia.upload({...input,buffer:webp});const before=cacheEvidence(first.filename);
  const downloaded=await first.value.normalMedia.download(input);assert.equal(downloaded.localAvailable,true);
  assert.deepEqual(await first.value.normalMedia.describeLocal({contentId:downloaded.metadata.contentId,requiredBinding:input.requiredBinding}),downloaded);
  assert.deepEqual(cacheEvidence(first.filename),before);await first.value.close();let online=true,requests=0;
  const reopened=await c.client('offline-normal',c.a,{fetchImpl:(url,options)=>{requests++;if(!online)throw new Error('No network permitted for local normal media');return fetch(url,options);}});
  const current=await c.input(reopened.value);online=false;const previous=requests;
  const read=await reopened.value.normalMedia.readLocal({contentId:downloaded.metadata.contentId,requiredBinding:current.requiredBinding});
  assert.deepEqual(read.buffer,webp);assert.deepEqual(read.metadata,downloaded.metadata);assert.equal(requests,previous);
  const db=new DatabaseSync(reopened.filename,{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
    assert.equal(db.prepare('SELECT count(*) AS n FROM normal_media').get().n,1);}finally{db.close();}
}));

test('normal download does not silently persist a read and a failed profile budget preserves the original cache and queue',t=>real(t,async c=>{
  let blocked=false;const pc=await c.client('normal-budget',c.a,{mediaBudgetReader:async()=>({totalBytes:blocked?1024*1024*1024:0})}),input=await c.input(pc.value);
  await pc.value.normalMedia.upload({...input,buffer:webp});const memory=await pc.value.normalMedia.read(input),before=cacheEvidence(pc.filename);
  await assert.rejects(pc.value.normalMedia.describeLocal({contentId:memory.metadata.contentId,requiredBinding:input.requiredBinding}),denied('normal_media_not_local'));
  blocked=true;await assert.rejects(pc.value.normalMedia.download(input),denied('normal_media_quota'));
  assert.deepEqual(cacheEvidence(pc.filename),before);
  await assert.rejects(pc.value.normalMedia.readLocal({contentId:memory.metadata.contentId,requiredBinding:input.requiredBinding}),denied('normal_media_not_local'));
}));

test("real clients upload and explicitly read normal image-UUID and MP3 originals without queue or media-cache writes", t => real(t, async c => {
  const calls = [], first = await c.client("first", c.a, { fetchImpl: (url, options) => { calls.push([new URL(url).pathname, options.method ?? "GET"]); return fetch(url, options); } });
  const second = await c.client("second", c.b), before = cacheEvidence(first.filename);
  for (const slot of ["portrait.webp", "sound.mp3"]) {
    const input = await c.input(first.value, slot), absent = await first.value.normalMedia.status(input);
    assert.deepEqual(absent, { available: false, metadata: null });
    const ready = await first.value.normalMedia.upload({ ...input, buffer: bytesFor(slot) }); assert.equal(ready.available, true);
    assert.equal(ready.metadata.asset.id, c.source.data.assets.files[slot].id); assert.equal("buffer" in ready, false);
    const read = await second.value.normalMedia.read(await c.input(second.value, slot));
    assert.deepEqual(read.buffer, bytesFor(slot)); assert.equal(read.metadata.contentId, ready.metadata.contentId);
  }
  assert.deepEqual(cacheEvidence(first.filename), before); assert.equal(cacheEvidence(second.filename).images, 0);
  assert.equal(calls.some(([route]) => /^\/api\/v1\/media(?:\/|$)/.test(route)), false);
}));

test("a real committed PUT with a lost response is not repeated and a later explicit upload starts with status recovery", t => real(t, async c => {
  let putCount = 0, postCount = 0, lose = true;
  const client = await c.client("uncertain", c.a, { fetchImpl: async (url, options) => {
    const route = new URL(url).pathname;
    if (route === "/api/v1/normal-media" && options.method === "POST") postCount++;
    const response = await fetch(url, options);
    if (/\/normal-media\/normal-[a-f0-9]{64}\/content$/.test(route) && options.method === "PUT") {
      putCount++; if (lose) { lose = false; await response.arrayBuffer(); throw new Error("Synthetic response loss"); }
    }
    return response;
  } });
  const input = await c.input(client.value);
  await assert.rejects(client.value.normalMedia.upload({ ...input, buffer: webp }), denied("normal_media_uncertain"));
  assert.equal(putCount, 1);
  assert.equal((await client.value.normalMedia.upload({ ...input, buffer: webp })).available, true);
  assert.equal(putCount, 1); assert.equal(postCount, 1); assert.equal(cacheEvidence(client.filename).queue.length, 0);
}));

test("a second real cache writer during decode preserves its draft and prevents any normal declaration", t => real(t, async c => {
  const entered = deferred(), release = deferred(), client = await c.client("cache-race", c.a, { imageDecode: async (bytes, options) => {
    entered.resolve(); await release.promise; return imageDecode(bytes, options);
  } });
  const input = await c.input(client.value), work = client.value.normalMedia.upload({ ...input, buffer: webp });
  const rejected = assert.rejects(work, denied("normal_media_review_changed"));
  try {
    await Promise.race([entered.promise, work]);
    const other = createSharedProjectClientStore({ filename: client.filename, localStorageConfirmed: true });
    try { const active = other.active(), source = other.get(active.id, "species", input.speciesId), next = structuredClone(source.data);
      next.input.english = "Retained parallel local edit"; other.edit(active.id, "species", input.speciesId, next); }
    finally { other.close(); }
  } finally { release.resolve(); await work.catch(() => {}); }
  await rejected; assert.equal(cacheEvidence(client.filename).queue.length, 1);
  const db = new DatabaseSync(c.f.filename, { readOnly: true });
  try { assert.equal(db.prepare("SELECT count(*) AS n FROM normal_media_assets").get().n, 0); } finally { db.close(); }
}));

test("real server role changes during decode are refreshed before any normal write", t => real(t, async c => {
  const entered = deferred(), release = deferred(), client = await c.client("role-race", c.a, { imageDecode: async (bytes, options) => {
    entered.resolve(); await release.promise; return imageDecode(bytes, options);
  } });
  const work = client.value.normalMedia.upload({ ...await c.input(client.value), buffer: webp }), rejected = assert.rejects(work, denied("normal_media_review_changed"));
  try { await Promise.race([entered.promise, work]); c.store.updateUser(c.b.token, c.a.user.id, { expectedVersion: c.store.me(c.a.token).version, role: "publisher" }); }
  finally { release.resolve(); await work.catch(() => {}); }
  await rejected;
  const db = new DatabaseSync(c.f.filename, { readOnly: true });
  try { assert.equal(db.prepare("SELECT count(*) AS n FROM normal_media_assets").get().n, 0); } finally { db.close(); }
}));

test("status is read-only and distinguishes absent, incomplete and complete exact metadata", async () => {
  const f = fake(); assert.deepEqual(await f.media.status(f.input()), { available: false, metadata: null });
  f.state.metadata = f.dto("portrait.webp", false);
  assert.deepEqual(await f.media.status(f.input()), { available: false, metadata: f.state.metadata });
  f.state.metadata = f.dto("portrait.webp", true); assert.equal((await f.media.status(f.input())).available, true);
  assert.equal(f.calls.some(call => call.method !== "GET"), false);
});

test("only a proven old or missing capability permits the dedicated legacy-server error", async () => {
  for (const capability of [undefined, 0]) {
    const f = fake(); f.state.capability = capability;
    await assert.rejects(f.media.status(f.input()), denied("normal_media_server_required"));
    assert.equal(f.calls.some(call => call.route.startsWith("normal-media/")), false);
  }
  const old = fake(); old.state.capabilityStatus = 404; await assert.rejects(old.media.status(old.input()), denied("normal_media_server_required"));
  const offline = fake(); offline.state.capabilityStatus = 503; await assert.rejects(offline.media.status(offline.input()), denied("service_error"));
  const unknown = fake(); unknown.state.capability = 2; await assert.rejects(unknown.media.status(unknown.input()), denied("invalid_normal_media_response"));
});

test("every post-await check binds identity, readonly refresh and exact local source head", async () => {
  for (const mutate of [f => { f.active.projectId = "other-project"; }, f => { f.active.userId = "other-user"; },
    f => { f.active.user.role = "publisher"; }, f => { f.active.readOnly = true; }, f => { f.cache.localPending = true; },
    f => { f.cache.localConflict = true; }, f => { f.cache.revision = "22222222-2222-4222-8222-222222222222"; },
    f => { f.cache.data.input.english = "Source changed"; }]) {
    const f = fake(), input = f.input(); f.state.hooks.online = () => mutate(f);
    await assert.rejects(f.media.upload({ ...input, buffer: webp }), denied("normal_media_review_changed"));
    assert.equal(f.calls.some(call => call.method === "POST" || call.method === "PUT"), false);
  }
});

test("reader and read-only views require exact approval and can never upload", async () => {
  const f = fake(); f.active.user.role = "reader"; const input = f.input(); input.requiredBinding.role = "reader";
  await assert.rejects(f.media.status(input), denied("normal_media_review_changed"));
  f.cache.approval = "approved"; f.cache.approvedRevision = f.cache.revision; f.state.metadata = f.dto("portrait.webp", true);
  assert.equal((await f.media.status(input)).available, true);
  await assert.rejects(f.media.upload({ ...input, buffer: webp }), denied("forbidden"));
});

test("wrong metadata fields, source provenance and raw response headers cannot confirm another normal file", async () => {
  for (const mutate of [value => { value.asset.attribution = "Another source"; }, value => { value.contentId = `normal-${"f".repeat(64)}`; },
    value => { value.width = 40000001; }, value => { value.asset.url = "https://example.org/not-allowed"; }, value => { value.unexpected = true; }]) {
    const f = fake(); f.state.metadata = f.dto("portrait.webp", true); mutate(f.state.metadata);
    await assert.rejects(f.media.status(f.input()), denied("invalid_normal_media_response"));
  }
  for (const changed of [{ "Content-Type": "image/jpeg" }, { "X-Content-SHA256": "f".repeat(64) }, { "Content-Length": "1" }]) {
    const f = fake(); f.state.metadata = f.dto("portrait.webp", true);
    f.state.contentHeaders = new Headers({ "Content-Type": "image/webp", "X-Content-SHA256": digest(webp), "Content-Length": String(webp.length), ...changed });
    await assert.rejects(f.media.read(f.input()), denied("invalid_normal_media_response"));
  }
  const corrupt = fake(); corrupt.state.metadata = corrupt.dto("portrait.webp", true); corrupt.state.contentBytes = Buffer.from(webp); corrupt.state.contentBytes[29] ^= 1;
  await assert.rejects(corrupt.media.read(corrupt.input()), denied("invalid_normal_media"));
});

test("upload copies its caller buffer before queue waits and never lets a decoder alter the checked original", async () => {
  const gate = deferred(), f = fake({ runGate: gate.promise }), caller = Buffer.from(webp);
  const work = f.media.upload({ ...f.input(), buffer: caller }); caller.fill(0); gate.resolve();
  assert.equal((await work).available, true);
  const mutated = fake({ imageDecode: async bytes => { const result = await imageDecode(bytes); bytes[29] ^= 1; return result; } });
  await assert.rejects(mutated.media.upload({ ...mutated.input(), buffer: webp }), denied("invalid_normal_media"));
  assert.equal(mutated.calls.some(call => call.method === "POST" || call.method === "PUT"), false);
});

test("abort and close after asynchronous decoding cannot return a read or upload confirmation", async () => {
  for (const method of ["read", "upload"]) for (const cancel of [true, false]) {
    const entered = deferred(), release = deferred(), controller = new AbortController(), f = fake({ imageDecode: async bytes => {
      entered.resolve(); await release.promise; return imageDecode(bytes);
    } });
    f.state.metadata = f.dto("portrait.webp", true);
    const input = method === "upload" ? { ...f.input(), buffer: webp } : f.input();
    const work = f.media[method](input, { signal: controller.signal });
    const rejected = assert.rejects(work, denied(cancel ? "normal_media_cancelled" : "client_closed"));
    try { await Promise.race([entered.promise, work]); if (cancel) controller.abort(new Error("private reason")); else f.state.closed = true; }
    finally { release.resolve(); await work.catch(() => {}); }
    await rejected; assert.equal(f.calls.some(call => call.method === "POST" || call.method === "PUT"), false);
  }
});

test("a cancelled network await remains cancellation even when the transport reports an offline error", async () => {
  const controller = new AbortController(), f = fake();
  f.state.hooks.request = async route => {
    if (route === "capabilities") { controller.abort(new Error("private abort detail")); throw new ProjectError(503, "offline", "Synthetic transport abort"); }
  };
  await assert.rejects(f.media.read(f.input(), { signal: controller.signal }), denied("normal_media_cancelled"));
  assert.equal(f.calls.some(call => call.route.startsWith("normal-media/")), false);
});

test("fixed decoder options retain repository context while format and live signal cannot be overridden", async () => {
  const controller = new AbortController(); let imageOptions, audioOptions;
  const f = fake({ imageDecodeOptions: { repoRoot: "D:\\fixed-fixture", format: "wrong", signal: null },
    audioDecodeOptions: { repoRoot: "D:\\fixed-fixture", signal: null },
    imageDecode: async (bytes, options) => { imageOptions = options; return imageDecode(bytes); },
    audioDecode: async (bytes, options) => { audioOptions = options; return audioDecode(bytes); } });
  await f.media.upload({ ...f.input(), buffer: webp }, { signal: controller.signal });
  f.state.metadata = null; await f.media.upload({ ...f.input("sound.mp3"), buffer: mp3 }, { signal: controller.signal });
  assert.equal(imageOptions.repoRoot, "D:\\fixed-fixture"); assert.equal(imageOptions.format, "webp"); assert.equal(imageOptions.signal, controller.signal);
  assert.equal(audioOptions.repoRoot, "D:\\fixed-fixture"); assert.equal(audioOptions.signal, controller.signal);
});

test("strict operation inputs reject free paths, extra URLs, accessors and missing authoritative cache flags", async () => {
  const f = fake(); let accessed = false;
  for (const mutate of [input => { input.path = "D:\\private-file"; }, input => { input.url = "https://example.org/arbitrary"; },
    input => { input.requiredBinding.password = "not-allowed"; }, input => { input.expectedDataHash = "wrong"; },
    input => { input.requiredBinding.baseUrl = { toString() { accessed = true; return "https://fixture.example"; } }; },
    input => { Object.defineProperty(input, "slot", { enumerable: true, get() { accessed = true; return "portrait.webp"; } }); }]) {
    const input = f.input(); mutate(input); await assert.rejects(f.media.status(input));
  }
  assert.equal(accessed, false); assert.equal(f.calls.length, 0);
  const proxy = new Proxy(webp, { get() { accessed = true; throw new Error("Must not read proxy Buffer"); },
    getPrototypeOf() { accessed = true; throw new Error("Must not inspect proxy Buffer"); } });
  await assert.rejects(f.media.upload({ ...f.input(), buffer: proxy }), denied("normal_media_too_large"));
  assert.equal(accessed, false); assert.equal(f.calls.length, 0);
  delete f.cache.localPending; await assert.rejects(f.media.status(f.input()), denied("normal_media_review_changed"));
});
