import assert from "node:assert/strict";
import test from "node:test";
import { observeSquarespacePublicTarget } from "./squarespace-public-target.mjs";

const ORIGIN = "https://www.fnwildlifetravel.de";
const PARENT = "/wildlife/heimische-tierwelt", TARGET = PARENT + "/pruefart";
const COLLECTION_ID = "67556be0338df718ea064210";
const failure = { code: "SQUARESPACE_PUBLIC_TARGET_UNCONFIRMED", statusCode: 409 };
const page = ({ title = "FN Wildlife &amp; Travel", head = "", body = "", bodyAttrs = "" } = {}) =>
  `<!doctype html><html lang="de"><head><title>${title}</title>${head}</head><body${bodyAttrs}>${body}</body></html>`;
const canonical = (url) => `<link rel="canonical" href="${url}">`;
const parentHtml = page({ title: "Heimische Tierwelt", head: canonical(ORIGIN + PARENT), bodyAttrs: ` id="collection-${COLLECTION_ID}"` });
const targetHtml = page();

function fixture(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const side = url === ORIGIN + TARGET ? "target" : url === ORIGIN + PARENT ? "parent" : null;
    assert.ok(side, `unexpected URL ${url}`);
    const settings = { status: side === "target" ? 404 : 200, body: side === "target" ? targetHtml : parentHtml,
      url, redirected: false, ...overrides[side] };
    const response = new Response(settings.body, { status: settings.status,
      headers: { "Content-Type": "text/html; charset=utf-8", ...settings.headers } });
    Object.defineProperties(response, { url: { value: settings.url }, redirected: { value: settings.redirected } });
    return response;
  };
  return { calls, fetchImpl };
}

test("public target check binds exactly two cookie-free GETs and reports a public 404 without a CMS existence claim", async () => {
  const f = fixture();
  assert.deepEqual(await observeSquarespacePublicTarget(TARGET, { fetchImpl: f.fetchImpl }), {
    path: TARGET, parentPath: PARENT, publicTarget: "unavailable", parentPublic: true,
  });
  assert.deepEqual(f.calls.map(call => call.url), [ORIGIN + TARGET, ORIGIN + PARENT]);
  for (const { options } of f.calls) {
    assert.deepEqual({ ...options, signal: undefined }, { method: "GET", signal: undefined, redirect: "manual",
      credentials: "omit", cache: "no-store", headers: { Accept: "text/html" } });
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test("invalid target paths never reach the public HTTP client", async () => {
  const f = fixture();
  for (const path of [TARGET + "/", TARGET + "?from=admin", TARGET + "#preview", "//evil.invalid/abc",
    PARENT + "/%2e%2e", "/wildlife/heimische-tierwelt/Prüfart", ORIGIN + TARGET]) {
    await assert.rejects(observeSquarespacePublicTarget(path, { fetchImpl: f.fetchImpl }), { code: "cms_dispatch_binding_invalid" });
  }
  assert.equal(f.calls.length, 0);
});

test("public target check rejects public existing pages, redirects, authentication, and mismatched response addresses", async () => {
  for (const overrides of [
    { target: { status: 200, body: parentHtml } }, { target: { status: 302, headers: { Location: ORIGIN + TARGET } } },
    { parent: { status: 403 } }, { target: { status: 401 } }, { target: { status: 503 } },
    { target: { headers: { "WWW-Authenticate": "Basic" } } }, { parent: { headers: { Location: ORIGIN + PARENT } } },
    { target: { redirected: true } }, { target: { url: ORIGIN + TARGET + "/" } },
    { parent: { url: ORIGIN + PARENT + "?shadow=1" } }, { target: { url: "" } },
    { target: { headers: { "Content-Type": "text/plain" } } },
  ]) {
    const f = fixture(overrides);
    await assert.rejects(observeSquarespacePublicTarget(TARGET, { fetchImpl: f.fetchImpl }), failure);
    assert.equal(f.calls.length, 2);
  }
});

test("public target check requires the exact public HTML identities and rejects shadow paths, ambiguous markup and login forms", async () => {
  for (const overrides of [
    { target: { body: page({ title: "Fehler" }) } },
    { target: { body: page({ head: canonical(ORIGIN + TARGET) }) } },
    { target: { body: page({ bodyAttrs: ` id="collection-${COLLECTION_ID}"` }) } },
    { target: { body: page({ head: '<meta http-equiv="refresh" content="0;url=/login">' }) } },
    { target: { body: page({ body: '<form action="/login"><input type="password"></form>' }) } },
    { target: { body: page({ body: '<form action="/api/login"><input type="email"></form>' }) } },
    { parent: { body: targetHtml } },
    { parent: { body: page({ head: canonical(ORIGIN + PARENT + "/"), bodyAttrs: ` id="collection-${COLLECTION_ID}"` }) } },
    { parent: { body: parentHtml.replace(ORIGIN + PARENT, "https://fnwildlifetravel.de" + PARENT) } },
    { parent: { body: parentHtml.replace("</head>", canonical(ORIGIN + PARENT) + "</head>") } },
    { parent: { body: parentHtml.replace(canonical(ORIGIN + PARENT), `<!--${canonical(ORIGIN + PARENT)}-->`) } },
    { parent: { body: parentHtml.replace(canonical(ORIGIN + PARENT), `<script type="text/plain">${canonical(ORIGIN + PARENT)}</script>`) } },
    { parent: { body: parentHtml.replace("</body>", '</body><body id="foreign">') } },
    { parent: { body: parentHtml.replace(`id="collection-${COLLECTION_ID}"`, `id="shadow" id="collection-${COLLECTION_ID}"`) } },
  ]) {
    const f = fixture(overrides);
    await assert.rejects(observeSquarespacePublicTarget(TARGET, { fetchImpl: f.fetchImpl }), failure);
  }
});

test("public HTML reading stops at its byte budget and rejects incomplete or invalid UTF-8 responses", async () => {
  let cancelled = false;
  const large = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  });
  for (const target of [
    { headers: { "Content-Length": String(4 * 1024 * 1024 + 1) } },
    { headers: { "Content-Length": "1" } }, { body: Uint8Array.of(255) }, { body: large },
  ]) {
    const f = fixture({ target });
    await assert.rejects(observeSquarespacePublicTarget(TARGET, { fetchImpl: f.fetchImpl }), failure);
  }
  assert.equal(cancelled, true);
  const f = fixture({ parent: { headers: { "Content-Encoding": "br", "Content-Length": "8" } } });
  assert.equal((await observeSquarespacePublicTarget(TARGET, { fetchImpl: f.fetchImpl })).parentPublic, true);
});

test("public target check bounds non-cooperative requests and preserves the caller abort reason", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [], fetchImpl = (_url, { signal }) => { calls.push(signal); return new Promise(() => {}); };
  const timedOut = observeSquarespacePublicTarget(TARGET, { fetchImpl });
  t.mock.timers.tick(6000);
  await assert.rejects(timedOut, failure);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(signal => signal.aborted));

  const controller = new AbortController(), reason = new Error("caller cancelled");
  const interrupted = observeSquarespacePublicTarget(TARGET, { signal: controller.signal, fetchImpl });
  controller.abort(reason);
  await assert.rejects(interrupted, error => error === reason);
  await assert.rejects(observeSquarespacePublicTarget(TARGET, { signal: controller.signal, fetchImpl }), error => error === reason);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(signal => signal.aborted));

  let bodyCancelled = false;
  const body = new ReadableStream({ cancel() { bodyCancelled = true; } });
  const f = fixture({ target: { body } });
  const stalledBody = observeSquarespacePublicTarget(TARGET, { fetchImpl: f.fetchImpl });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(6000);
  await assert.rejects(stalledBody, failure);
  assert.equal(bodyCancelled, true);
});
