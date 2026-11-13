import assert from "node:assert/strict";
import test from "node:test";
import { createEnrichmentFetch, ENRICHMENT_TRANSPORT_LIMITS } from "./species-enrichment-transport.mjs";

// Pure, synthetic source streams: no sockets, provider text, decoder or SDK.
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const code = expected => error => error.code === expected;
const jsonUrl = "https://api.iucnredlist.org/api/v4/taxa/scientific_name?genus_name=Fixture";
function source({ chunks = [Buffer.from('{"name":"Prüfung"}')], headers = { "content-type": "application/json" },
  status = 200, next, cancelNever = false } = {}) {
  let offset = 0;
  const state = { reads: 0, cancels: 0, releases: 0, bodyCancels: 0, arrayBuffers: 0 };
  const reader = {
    async read() { state.reads++; if (next) return next(state); return offset === chunks.length ? { done: true } : { done: false, value: chunks[offset++] }; },
    cancel() { state.cancels++; return cancelNever ? new Promise(() => {}) : Promise.resolve(); },
    releaseLock() { state.releases++; },
  };
  const response = { ok: status >= 200 && status < 300, status, statusText: "Fixture", url: jsonUrl, headers: new Headers(headers),
    body: { getReader: () => reader, cancel() { state.bodyCancels++; return Promise.resolve(); } },
    arrayBuffer() { state.arrayBuffers++; assert.fail("The source must be read as bounded chunks."); } };
  return { state, response };
}
const make = (fetch, options = {}) => createEnrichmentFetch({ fetch, assertCurrent: async () => true, ...options });

test("construction is inert; the local bound reader preserves request options and independent response bytes", async () => {
  const original = Buffer.from('{"name":"Prüfung"}'), f = source({ chunks: [original] }), requests = [];
  const caller = new AbortController(), headers = new Headers({ Authorization: "Fixture-only", "User-Agent": "Fixture-agent" });
  const options = { headers, signal: caller.signal, redirect: "manual", credentials: "omit" };
  const fetch = make(async (url, received) => { requests.push({ url, received }); return f.response; });
  assert.equal(requests.length, 0);
  const result = await fetch(jsonUrl, options); original.fill(120);
  assert.equal(requests.length, 1); assert.equal(requests[0].url, jsonUrl);
  assert.strictEqual(requests[0].received.headers, headers); assert.equal(requests[0].received.redirect, "manual");
  assert.equal(requests[0].received.credentials, "omit"); assert.notStrictEqual(requests[0].received.signal, caller.signal);
  assert.strictEqual(options.signal, caller.signal); assert.equal(result.status, 200); assert.equal(result.ok, true);
  assert.equal(result.url, jsonUrl); assert.equal(result.headers.get("content-type"), "application/json");
  const copy = await result.arrayBuffer(); assert.equal(copy.byteLength, Buffer.byteLength('{"name":"Prüfung"}'));
  new Uint8Array(copy).fill(0);
  assert.equal(await result.text(), '{"name":"Prüfung"}');
  const first = await result.json(); first.name = "Changed"; assert.deepEqual(await result.json(), { name: "Prüfung" });
  const read = result.body.getReader(), pieces = [];
  for (;;) { const part = await read.read(); if (part.done) break; pieces.push(Buffer.from(part.value)); }
  read.releaseLock(); assert.equal(Buffer.concat(pieces).toString("utf8"), '{"name":"Prüfung"}');
  assert.equal(f.state.arrayBuffers, 0); assert.equal(f.state.cancels, 1); assert.equal(f.state.releases, 1);
});

test("the source binding must be positively true before a request is started", async () => {
  let requests = 0;
  for (const current of [false, undefined, null, 1, "true"]) {
    await assert.rejects(make(async () => { requests++; }, { assertCurrent: async () => current })(jsonUrl), code("species_enrichment_changed"));
  }
  assert.equal(requests, 0);
});

test("a source change while fetching headers cancels the unread response and yields no body", async () => {
  const f = source(); let current = true;
  await assert.rejects(make(async () => { current = false; return f.response; }, { assertCurrent: async () => current })(jsonUrl), code("species_enrichment_changed"));
  assert.equal(f.state.reads, 0); assert.equal(f.state.bodyCancels, 1);
});

test("a source change delivered with a body chunk prevents another read and releases the source reader", async () => {
  let current = true;
  const f = source({ next: async () => { current = false; return { done: false, value: Buffer.from("first chunk") }; } });
  await assert.rejects(make(async () => f.response, { assertCurrent: async () => current })(jsonUrl), code("species_enrichment_changed"));
  assert.equal(f.state.reads, 1); assert.equal(f.state.cancels, 1); assert.equal(f.state.releases, 1);
});

test("an ignored caller abort still stops an in-flight body read and never waits for an ignored cancellation", { timeout: 1000 }, async () => {
  const reading = deferred(), never = new Promise(() => {}), caller = new AbortController();
  const f = source({ cancelNever: true, next: () => { reading.resolve(); return never; } });
  let requestSignal;
  const pending = make(async (_url, options) => { requestSignal = options.signal; return f.response; })(jsonUrl, { signal: caller.signal });
  await reading.promise; caller.abort();
  await assert.rejects(pending, code("species_enrichment_cancelled"));
  assert.equal(requestSignal.aborted, true); assert.equal(f.state.cancels, 1); assert.equal(f.state.releases, 1);
});

test("the overall abort also stops an ignored fetch and closes a response that arrives only afterwards", { timeout: 1000 }, async () => {
  const fetching = deferred(), late = deferred(), overall = new AbortController(), f = source();
  let requestSignal;
  const pending = make(async (_url, options) => { requestSignal = options.signal; fetching.resolve(); return late.promise; }, { signal: overall.signal })(jsonUrl);
  await fetching.promise; overall.abort(); await assert.rejects(pending, code("species_enrichment_cancelled"));
  assert.equal(requestSignal.aborted, true);
  late.resolve(f.response); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.bodyCancels, 1); assert.equal(f.state.reads, 0);
});

test("an already cancelled caller or overall signal prevents source access", async () => {
  for (const atFactory of [false, true]) {
    const controller = new AbortController(); controller.abort(); let requests = 0;
    const fetch = make(async () => { requests++; }, atFactory ? { signal: controller.signal } : {});
    await assert.rejects(fetch(jsonUrl, atFactory ? {} : { signal: controller.signal }), code("species_enrichment_cancelled"));
    assert.equal(requests, 0);
  }
});

test("the deadline includes a body that never completes, independent of fetch signal support", { timeout: 1000 }, async () => {
  const f = source({ cancelNever: true, next: () => new Promise(() => {}) });
  await assert.rejects(make(async () => f.response, { timeoutMs: 20 })(jsonUrl), code("species_enrichment_timeout"));
  assert.equal(f.state.reads, 1); assert.equal(f.state.cancels, 1); assert.equal(f.state.releases, 1);
});

test("the same deadline bounds a never-returning identity checkpoint before network access", { timeout: 1000 }, async () => {
  let requests = 0;
  await assert.rejects(make(async () => { requests++; }, { timeoutMs: 20, assertCurrent: () => new Promise(() => {}) })(jsonUrl), code("species_enrichment_timeout"));
  assert.equal(requests, 0);
});

test("JSON API paths keep their four MiB limit even when the provider advertises audio", async () => {
  const f = source({ headers: { "content-type": "audio/mpeg", "content-length": String(ENRICHMENT_TRANSPORT_LIMITS.jsonBytes + 1) } });
  await assert.rejects(make(async () => f.response)(jsonUrl), code("species_enrichment_body_too_large"));
  assert.equal(f.state.reads, 0); assert.equal(f.state.bodyCancels, 1);
});

test("all existing provider JSON routes and JSON content types reject oversized declared bodies", async () => {
  for (const url of ["https://xeno-canto.org/api/3/recordings?key=fixture", "https://commons.wikimedia.org/w/api.php?action=query",
    "https://api.inaturalist.org/v1/observations?taxon_name=Fixture", "https://api.iucnredlist.org/api/v4/assessment/123",
    "https://fixture.example/content"]) {
    const f = source({ headers: { "content-type": "application/problem+json", "content-length": String(ENRICHMENT_TRANSPORT_LIMITS.jsonBytes + 1) } });
    await assert.rejects(make(async () => f.response)(url), code("species_enrichment_body_too_large")); assert.equal(f.state.reads, 0);
  }
});

test("actual chunks, not a missing or understated Content-Length, enforce the JSON bound before copying another chunk", async () => {
  for (const declared of [null, "1"]) {
    const headers = { "content-type": "application/json", ...(declared === null ? {} : { "content-length": declared }) };
    const f = source({ headers, chunks: [Buffer.alloc(ENRICHMENT_TRANSPORT_LIMITS.jsonBytes), Buffer.from("x"), Buffer.from("unread")] });
    await assert.rejects(make(async () => f.response)(jsonUrl), code("species_enrichment_body_too_large"));
    assert.equal(f.state.reads, 2); assert.equal(f.state.releases, 1);
  }
});

test("JPEG routes and JPEG MIME retain twenty MiB, other audio fifty MiB, without allocating oversized files", async () => {
  for (const [url, type, limit] of [
    ["https://www.iucnredlist.org/api/v4/assessments/123/distribution_map/jpg", "application/octet-stream", ENRICHMENT_TRANSPORT_LIMITS.imageBytes],
    ["https://fixture.example/cache/map.jpg", "application/octet-stream", ENRICHMENT_TRANSPORT_LIMITS.imageBytes],
    ["https://fixture.example/image", "image/jpeg", ENRICHMENT_TRANSPORT_LIMITS.imageBytes],
    ["https://fixture.example/sound.mp3", "audio/mpeg", ENRICHMENT_TRANSPORT_LIMITS.audioBytes],
  ]) {
    const f = source({ headers: { "content-type": type, "content-length": String(limit + 1) } });
    await assert.rejects(make(async () => f.response)(url), code("species_enrichment_body_too_large")); assert.equal(f.state.reads, 0);
  }
});

test("malformed length, unreadable streams and malformed JSON produce bounded errors without provider text", async () => {
  for (const length of ["-1", "1, 1", "large"]) {
    const f = source({ headers: { "content-length": length } });
    await assert.rejects(make(async () => f.response)(jsonUrl), code("invalid_species_enrichment_response")); assert.equal(f.state.reads, 0);
  }
  const f = source(); f.response.body = {};
  await assert.rejects(make(async () => f.response)(jsonUrl), code("invalid_species_enrichment_response"));
  const malformed = source({ chunks: [Buffer.from("private-provider-body")] });
  const result = await make(async () => malformed.response)(jsonUrl);
  await assert.rejects(result.json(), error => error.code === "invalid_species_enrichment_response" && !error.message.includes("private-provider-body"));
});

test("HEAD remains a header-only reachability check and non-success status and headers are retained", async () => {
  const head = source(); head.response.body = null;
  const result = await make(async () => head.response)("https://fixture.example/sound.mp3", { method: "HEAD" });
  assert.equal(result.ok, true); assert.equal(await result.text(), ""); assert.equal(head.state.reads, 0);
  const rejected = source({ status: 429, headers: { "content-type": "application/json", "retry-after": "60" }, chunks: [Buffer.from('{"error":"rate-limit"}')] });
  const rate = await make(async () => rejected.response)(jsonUrl);
  assert.equal(rate.ok, false); assert.equal(rate.status, 429); assert.equal(rate.headers.get("retry-after"), "60");
  assert.deepEqual(await rate.json(), { error: "rate-limit" });
});

test("provider exceptions do not leak private query strings or credentials", async () => {
  await assert.rejects(make(async () => { throw new Error("https://fixture.example/?key=private-source-key"); })(jsonUrl),
    error => error.code === "species_enrichment_transport_failed" && !error.message.includes("private-source-key") && !error.message.includes("https:"));
});

test("a later overall cancellation prevents reading previously returned snapshot bytes", async () => {
  const overall = new AbortController(), f = source(), result = await make(async () => f.response, { signal: overall.signal })(jsonUrl);
  overall.abort(); await assert.rejects(result.arrayBuffer(), code("species_enrichment_cancelled"));
  await assert.rejects(result.text(), code("species_enrichment_cancelled")); await assert.rejects(result.json(), code("species_enrichment_cancelled"));
});
