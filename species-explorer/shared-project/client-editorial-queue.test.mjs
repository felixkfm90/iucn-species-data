import test from "node:test";
import assert from "node:assert/strict";
import { validateSealedEditorialRequest } from "./client-editorial-queue.mjs";
import { createPageEditorialIntent } from "./species-editorial-intent.mjs";
import { objectJson } from "./security.mjs";

const hash = "a".repeat(64);
const denied = error => error.code === "invalid_editorial_request" || error.code === "invalid_editorial_intent"
  || error.code === "invalid_editorial_source_bindings";

function fixture() {
  const sourceBindings = { projectId: "fixture-project", page: { objectId: `fn-species-page-${hash}`,
    objectRevision: "11111111-1111-4111-8111-111111111111", dataRevision: hash, contentHash: hash, imagesHash: hash, dataHash: hash },
  species: { id: "fixture-owl", objectRevision: "22222222-2222-4222-8222-222222222222", dataHash: hash, sourceHash: hash } };
  const data = { type: "fn-species-record", schemaVersion: 2, id: "fixture-owl",
    input: { german: "Testkauz", genus: "Strix", species: "fixture", privateOriginal: { retained: true } }, generated: null,
    taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Historischer Testkauz", files: {}, overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, title: "Testkauz", introduction: [],
      sections: [{ id: "general", kind: "general-module", title: "Allgemein", requested: false, blocks: [], sources: [], emptyDecision: null },
        { id: "map", kind: "map-module", title: "Verbreitung", requested: false, blocks: [], sources: [], emptyDecision: null }],
      sources: [], galleryRequested: false, gallery: [], normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null },
      sourceBindings: structuredClone(sourceBindings) } };
  const intent = createPageEditorialIntent({ sourceBindings, projectionHash: hash,
    actor: { projectId: "fixture-project", userId: "fixture-user", role: "admin" } });
  const request = { changeId: "33333333-3333-4333-8333-333333333333", kind: "species", id: data.id,
    baseRevision: sourceBindings.species.objectRevision, data, intent };
  const context = { changeId: request.changeId, kind: request.kind, id: request.id, baseRevision: request.baseRevision,
    data: structuredClone(data), projectId: "fixture-project", userId: "fixture-user", role: "admin" };
  return { request, context };
}

test("sealed editorial request roundtrips through restart JSON with independent complete target data", () => {
  const { request, context } = fixture(), before = structuredClone(request);
  const checked = validateSealedEditorialRequest(JSON.parse(JSON.stringify(request)), context);
  assert.deepEqual(checked, before); assert.deepEqual(request, before);
  checked.data.input.privateOriginal.retained = false; checked.intent.sourceBindings.page.contentHash = "b".repeat(64);
  assert.deepEqual(request, before); assert.equal(context.data.input.privateOriginal.retained, true);
});

test("sealed request is canonical rather than dependent on JSON key order", () => {
  const { request, context } = fixture();
  request.data = Object.fromEntries(Object.entries(request.data).reverse());
  request.intent.sourceBindings = Object.fromEntries(Object.entries(request.intent.sourceBindings).reverse());
  assert.equal(objectJson(validateSealedEditorialRequest(request, context).data), objectJson(context.data));
});

test("change, kind, object and exact base revision cannot be silently replaced or rebased", () => {
  for (const mutate of [request => { request.changeId = "other-change"; }, request => { request.kind = "page"; },
    request => { request.id = "other-species"; }, request => { request.baseRevision = "44444444-4444-4444-8444-444444444444"; },
    request => { request.intent.sourceBindings.species.objectRevision = "44444444-4444-4444-8444-444444444444"; },
    request => { request.intent.sourceBindings.species.id = "other-species"; }]) {
    const { request, context } = fixture(); mutate(request);
    assert.throws(() => validateSealedEditorialRequest(request, context), denied);
  }
});

test("sealed change IDs keep the exact remote write boundary even when the local comparison repeats them", () => {
  for (const changeId of ["short", "has.period", "has:colon", "x".repeat(121)]) {
    const { request, context } = fixture(); request.changeId = changeId; context.changeId = changeId;
    assert.throws(() => validateSealedEditorialRequest(request, context), denied);
  }
});

test("sealed purpose remains tied to exact project and person independently of a later known role", () => {
  for (const replacement of [{ projectId: "other-project" }, { userId: "other-user" }, { role: "publisher" }, { role: "reader" }]) {
    const { request, context } = fixture();
    assert.throws(() => validateSealedEditorialRequest(request, { ...context, ...replacement }), denied);
  }
  const { request, context } = fixture(); delete context.role;
  assert.deepEqual(validateSealedEditorialRequest(request, context), request);
});

test("target data identity and its preserved adoption evidence are independently bound", () => {
  for (const mutate of [request => { request.data.input.german = "Geänderter Testkauz"; },
    request => { request.data.id = "other-species"; }, request => { request.data.schemaVersion = 1; },
    request => { request.data.type = "other-record"; }, request => { request.data.editorial.sourceBindings.page.contentHash = "b".repeat(64); }]) {
    const { request, context } = fixture(); mutate(request);
    assert.throws(() => validateSealedEditorialRequest(request, context), denied);
  }
  const { request, context } = fixture();
  request.intent.sourceBindings.page.contentHash = "b".repeat(64);
  assert.throws(() => validateSealedEditorialRequest(request, context), denied);
});

test("exact six-field shape rejects unknown purposes, omitted fields, hidden data, symbols, getters and proxies", () => {
  let executed = false;
  for (const mutate of [request => { request.unknown = true; }, request => { delete request.intent; },
    request => { request.intent.kind = "generic-edit"; }, request => { Object.defineProperty(request, "hidden", { value: true }); },
    request => { request[Symbol("unknown")] = true; },
    request => { Object.defineProperty(request, "intent", { enumerable: true, get() { executed = true; return null; } }); }]) {
    const { request, context } = fixture(); mutate(request);
    assert.throws(() => validateSealedEditorialRequest(request, context), denied);
  }
  const { request, context } = fixture();
  assert.throws(() => validateSealedEditorialRequest(new Proxy(request, { ownKeys() { executed = true; throw new Error("Must not run"); } }), context), denied);
  assert.equal(executed, false);
});

test("exact record2 target content above the old generic limit survives sealing and restart without truncation", () => {
  const { request, context } = fixture();
  request.data.input.privateOriginal.text = "x".repeat(300 * 1024); context.data = structuredClone(request.data);
  const checked = validateSealedEditorialRequest(JSON.parse(JSON.stringify(request)), context);
  assert.deepEqual(checked, request); assert.equal(checked.data.input.privateOriginal.text.length, 300 * 1024);
});

test("oversized record2 data is rejected rather than widening the bounded sealed envelope", () => {
  const { request, context } = fixture();
  request.data.input.privateOriginal.text = "x".repeat(4 * 1024 * 1024); context.data = structuredClone(request.data);
  assert.throws(() => validateSealedEditorialRequest(request, context), error => error.status === 413);
});
