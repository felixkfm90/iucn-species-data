import assert from "node:assert/strict";
import test from "node:test";
import { initialDocument, emptySectionHash } from "../page-authoring/model.mjs";
import { fingerprint, sha256, clone } from "../page-authoring/contract.mjs";
import { createTestJpeg } from "../server-test-fixtures.mjs";
import { pixel } from "./test-fixtures.mjs";
import { bindTextInput } from "./content.mjs";
import { createPageAuthoringInputs, PAGE_AI_LIMITS } from "./page-authoring-inputs.mjs";

const PROJECT = "project-a", DRAFT = "draft-a", ORIGIN = "https://project.invalid", USER = { id: "person-a", role: "publisher" };
const SCOPE = fingerprint([ORIGIN, PROJECT, USER.id]), REVISION = sha256("saved-page-revision");
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const matches = (...codes) => (error) => codes.includes(error.code);
function fixture(t, options = {}) {
  const bytes = Buffer.from(pixel), jpeg = createTestJpeg(3, 2), calls = [], hooks = {}, normalized = [];
  const asset = { id: "image-bbb15250-36b5-4441-a01c-d1f5a04e90e1", projectId: PROJECT, sha256: sha256(bytes), bytes: bytes.length, mimeType: "image/png", attribution: "Eigene Aufnahme" };
  const species = { slug: "test-art", scientificName: "Testus fixture", commonName: "Testart", assetName: "Testart", taxonomy: [], general: [], status: "",
    revision: "species-bound", dataSha256: sha256("species-bound"), runtimeReady: false, normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null } };
  const document = initialDocument({ templateId: "fn-compact-20261031", species, parentPath: "/wildlife/heimische-tierwelt" });
  document.images = [{ id: "position-a", assetId: asset.id, alt: "Testart auf einem Ast", caption: "Eigene Beschriftung", decorative: false, asset: clone(asset) }];
  document.sections.find((section) => section.id === "habitat").blocks = [{ type: "paragraph", text: "Bereitgestellter Lebensraumtext." }, { type: "numbered-list", items: ["Erster Ort", "Zweiter Ort"] }];
  const record = { type: "fn-species-record", schemaVersion: 1, id: "test-art", input: { german: "Testart", genus: "Testus", species: "fixture", privateNote: "PRIVATE_INPUT_MUST_NOT_REACH_MODEL" },
    generated: { privateNote: "PRIVATE_GENERATED_MUST_NOT_REACH_MODEL" }, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Testart", files: {}, overrides: {}, credits: null, portraitMetadata: { prompt: "PRIVATE_PROMPT_MUST_NOT_REACH_MODEL" } },
    editorial: { websiteUrl: null, generalSectionId: "general-old", embeddedGeneralText: null, gallery: [], sections: [
      { id: "general-old", title: "Allgemein", text: "Nicht als rückgerechnete allgemeine Quelle verwenden.", intentionallyEmpty: false },
      { id: "provided-appearance", title: "Gelieferter Arttext", text: "Die Oberseite ist blau. Die Flügel sind dunkel.", intentionallyEmpty: false },
      { id: "empty-source", title: "Bewusst leer", text: "", intentionallyEmpty: true },
    ] } };
  const snapshot = { sourceScope: SCOPE, origin: ORIGIN, projectId: PROJECT, user: clone(USER), permissions: { canRead: true, canEdit: true, canCreate: true, canApprove: true },
    connection: "online", readOnlySession: false, draft: { id: DRAFT, projectId: PROJECT, revision: REVISION, current: true, document }, speciesRecord: record };
  let closes = 0;
  const adapter = createPageAuthoringInputs({
    async readSnapshot(input, context) { calls.push({ method: "snapshot", input, signal: context.signal }); await hooks.snapshot?.(input, context); return clone(snapshot); },
    async readImage(input, context) { calls.push({ method: "image", input, signal: context.signal }); await hooks.image?.(input, context); return { metadata: clone(asset), buffer: Buffer.from(bytes) }; },
    normalizer: { async normalize(input, context) { normalized.push({ bytes: Buffer.from(input), signal: context.signal }); await hooks.normalize?.(input, context); return options.prepared ? options.prepared() : { bytes: Buffer.from(jpeg), mimeType: "image/jpeg" }; },
      async close() { closes++; await hooks.close?.(); } }, ownNormalizer: options.ownNormalizer === true,
  });
  t.after(() => adapter.close());
  const request = (extra = {}) => ({ type: "page-authoring", sourceScope: SCOPE, draftId: DRAFT, expectedRevision: REVISION, ...extra });
  async function textRequest(sectionId = "appearance", choose = (sources) => sources.filter((source) => source.provenance.kind === "species-editorial").map((source) => source.id)) {
    const catalog = await adapter.listSources(request({ sectionId }));
    return { request: request({ sectionId, sourceIds: choose(catalog.sources), expectedSourcesRevision: catalog.sourcesRevision }), catalog };
  }
  return { adapter, snapshot, document, record, asset, bytes, jpeg, calls, hooks, normalized, request, textRequest, closes: () => closes };
}

test("page input construction and blocking state are passive and the shared normalizer has no transferred ownership", async (t) => {
  const f = fixture(t); assert.deepEqual(f.calls, []); assert.deepEqual(f.normalized, []);
  assert.deepEqual(f.adapter.blockingState(), { known: true, busy: false, activeOperations: 0, closed: false });
  await f.adapter.close(); await f.adapter.close(); assert.equal(f.closes(), 0); assert.equal(f.adapter.blockingState().closed, true);
  await assert.rejects(f.adapter.loadImage(f.request({ imageId: "position-a" })), matches("page_ai_closed"));
});

test("image inputs use the actual fixed position and bytes, then return a signed typed binding without a public page URL", async (t) => {
  const f = fixture(t), before = JSON.stringify(f.snapshot), request = f.request({ imageId: "position-a" });
  const result = await f.adapter.loadImage(request);
  assert.deepEqual(result.bytes, f.jpeg); assert.equal(result.mimeType, "image/jpeg"); assert.equal(result.sourceSha256, sha256(f.bytes));
  assert.equal(result.sha256, sha256(f.jpeg)); assert.deepEqual(f.normalized[0].bytes, f.bytes);
  assert.equal(result.binding.type, "page-authoring"); assert.equal(result.binding.documentId, DRAFT); assert.equal(result.binding.revision, REVISION);
  assert.equal(result.binding.imageId, "position-a"); assert.equal(result.binding.assetId, f.asset.id); assert.equal(result.binding.sourceScope, SCOPE);
  assert.match(result.binding.inputProof, /^[a-f0-9]{64}$/); assert.equal(Object.hasOwn(result.binding, "pageUrl"), false);
  assert.deepEqual(result.context, { pageType: "species", title: "Testart", commonName: "Testart", coupledCaption: false });
  assert.deepEqual(f.calls.find((call) => call.method === "image").input, { sourceScope: SCOPE, draftId: DRAFT, expectedRevision: REVISION, imageId: "position-a", assetId: f.asset.id });
  assert.equal(await f.adapter.isBindingCurrent(result.binding), true); assert.equal(JSON.stringify(f.snapshot), before);
  assert.ok(!JSON.stringify({ context: result.context, binding: result.binding }).includes("PRIVATE_"));
});

test("renderer paths, owner, URLs, inline text and unknown or missing identities are rejected before reading sources", async (t) => {
  const f = fixture(t);
  for (const extra of [{ path: "C:\\private.png" }, { pageUrl: "https://example.org/image" }, { ownerId: "another-person" }, { buffer: "bytes" }, { draft: "Untrusted draft" }])
    await assert.rejects(f.adapter.loadImage(f.request({ imageId: "position-a", ...extra })));
  await assert.rejects(f.adapter.loadImage(f.request({ type: "website", imageId: "position-a" })), matches("page_ai_invalid_input"));
  await assert.rejects(f.adapter.loadImage(f.request({ imageId: "../../private" })));
  assert.deepEqual(f.calls, []); assert.deepEqual(f.normalized, []);
});

test("an admitted caller cannot change the request object while asynchronous source reads are pending", async (t) => {
  const f = fixture(t), request = f.request({ imageId: "position-a" }), task = f.adapter.loadImage(request);
  request.expectedRevision = sha256("different revision"); request.imageId = "another-position";
  const result = await task; assert.equal(result.binding.revision, REVISION); assert.equal(result.binding.imageId, "position-a");
});

test("foreign project, person, role, readonly state or revision stops preparation before image work", async (t) => {
  for (const change of [
    (f) => { f.snapshot.projectId = "foreign-project"; }, (f) => { f.snapshot.user.id = "another-person"; },
    (f) => { f.snapshot.user.role = "reader"; }, (f) => { f.snapshot.permissions.canEdit = false; },
    (f) => { f.snapshot.readOnlySession = true; }, (f) => { f.snapshot.draft.revision = sha256("new revision"); },
    (f) => { f.snapshot.speciesRecord.id = "another-species"; }, (f) => { f.snapshot.connection = "authentication-required"; },
  ]) {
    const f = fixture(t); change(f); await assert.rejects(f.adapter.loadImage(f.request({ imageId: "position-a" })));
    assert.equal(f.calls.filter((call) => call.method === "image").length, 0); assert.equal(f.normalized.length, 0);
  }
});

test("decorative, missing or mismatched image positions and changed actual bytes never reach normalization", async (t) => {
  for (const change of [(f) => { f.document.images[0].decorative = true; f.document.images[0].alt = ""; },
    (f) => { f.document.images[0].id = "another-position"; }, (f) => { f.asset.attribution = "Changed provenance"; },
    (f) => { f.bytes[20] ^= 1; }]) {
    const f = fixture(t); change(f); await assert.rejects(f.adapter.loadImage(f.request({ imageId: "position-a" }))); assert.equal(f.normalized.length, 0);
  }
});

test("snapshot drift while reading bytes or normalizing cannot return a result under the earlier scope", async (t) => {
  for (const point of ["image", "normalize"]) {
    const f = fixture(t), entered = deferred(), finish = deferred();
    f.hooks[point] = async () => { entered.resolve(); await finish.promise; };
    const task = f.adapter.loadImage(f.request({ imageId: "position-a" })); await entered.promise;
    f.snapshot.user.role = "admin"; finish.resolve(); await assert.rejects(task, matches("page_ai_binding_changed"));
  }
});

test("normalized output remains bounded and must be an actual JPEG rendition", async (t) => {
  for (const prepared of [() => ({ bytes: Buffer.from(pixel), mimeType: "image/png" }),
    () => ({ bytes: Buffer.alloc(PAGE_AI_LIMITS.preparedBytes + 1), mimeType: "image/jpeg" }),
    () => ({ bytes: Buffer.from("not an image"), mimeType: "image/jpeg" })]) {
    const f = fixture(t, { prepared }); await assert.rejects(f.adapter.loadImage(f.request({ imageId: "position-a" })));
  }
});

test("source catalog contains only actual supplied editorial texts with complete hashes and no preselection", async (t) => {
  const f = fixture(t), before = JSON.stringify(f.snapshot), catalog = await f.adapter.listSources(f.request({ sectionId: "appearance" }));
  assert.equal(catalog.revision, REVISION); assert.equal(catalog.sourceScope, SCOPE); assert.equal(catalog.sectionId, "appearance");
  assert.equal(catalog.sources.length, 2); assert.equal(Object.hasOwn(catalog, "selectedSourceIds"), false);
  assert.deepEqual(catalog.sources.map((source) => source.provenance.kind), ["species-editorial", "draft-editorial"]);
  assert.ok(catalog.sources.every((source) => source.characters === source.text.length && /^[a-f0-9]{64}$/.test(source.revision)));
  assert.ok(!JSON.stringify(catalog).includes("PRIVATE_")); assert.ok(!JSON.stringify(catalog).includes("rückgerechnete")); assert.ok(!JSON.stringify(catalog).includes("Bewusst leer"));
  assert.match(catalog.sources[1].text, /Bereitgestellter Lebensraumtext\.\n\nErster Ort\nZweiter Ort/);
  assert.equal(JSON.stringify(f.snapshot), before); assert.equal(f.normalized.length, 0);
});

test("source text uses only the explicitly selected known material and preserves full block and source data", async (t) => {
  const f = fixture(t), selected = await f.textRequest(), before = JSON.stringify(f.snapshot);
  const result = await f.adapter.loadTextContext(selected.request, { kind: "source-text" });
  assert.equal(result.sources.length, 1); assert.equal(result.sources[0].text, f.record.editorial.sections[1].text);
  assert.equal(result.target.intentionallyEmpty, false); assert.equal(result.draft, ""); assert.equal(result.binding.documentId, DRAFT);
  assert.equal(result.binding.sectionId, "appearance"); assert.equal(result.binding.sourceCatalogRevision, selected.catalog.sourcesRevision);
  const normalized = bindTextInput({ target: result.target, sources: result.sources, draft: result.draft,
    binding: { documentId: DRAFT, revision: REVISION } }, "source-text");
  assert.deepEqual(result.sources, normalized.sources); assert.equal(result.binding.sourcesRevision, normalized.binding.sourcesRevision);
  assert.equal(await f.adapter.isBindingCurrent(result.binding), true); assert.equal(JSON.stringify(f.snapshot), before);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_"));
});

test("text binding signs exactly the existing content normalizer output including trimmed sources", async (t) => {
  const f = fixture(t); f.record.editorial.sections[1].text = "  Die Oberseite ist blau.  ";
  const selected = await f.textRequest(), result = await f.adapter.loadTextContext(selected.request, { kind: "source-text" });
  const normalized = bindTextInput({ target: result.target, sources: result.sources, draft: result.draft,
    binding: { documentId: DRAFT, revision: REVISION } }, "source-text");
  assert.equal(result.sources[0].text, "Die Oberseite ist blau."); assert.equal(result.sources[0].url, "");
  assert.deepEqual(result.sources, normalized.sources); assert.equal(result.binding.sourcesRevision, normalized.binding.sourcesRevision);
  assert.equal(result.binding.sourceCatalogRevision, selected.catalog.sourcesRevision); assert.equal(await f.adapter.isBindingCurrent(result.binding), true);
});

test("review reads the actual bound richtext as a deterministic quote base without accepting a renderer draft", async (t) => {
  const f = fixture(t), selected = await f.textRequest("habitat");
  const result = await f.adapter.loadTextContext(selected.request, { kind: "review-text" });
  assert.equal(result.draft, "Bereitgestellter Lebensraumtext.\n\nErster Ort\nZweiter Ort"); assert.equal(result.binding.draftSha256, sha256(result.draft));
  await assert.rejects(f.adapter.loadTextContext({ ...selected.request, draft: "Renderer replacement" }, { kind: "review-text" }));
  assert.equal(await f.adapter.isBindingCurrent(result.binding), true);
});

test("intentional emptiness is preserved and no source text is synthesized for absent or unrequested content", async (t) => {
  const f = fixture(t), target = f.document.sections.find((section) => section.id === "appearance");
  f.document.emptyConfirmations.appearance = { sectionHash: emptySectionHash(target), actorId: USER.id, confirmedAt: "2026-11-01T12:00:00.000Z", reason: "Bewusst leer" };
  let selected = await f.textRequest(); const kept = await f.adapter.loadTextContext(selected.request, { kind: "source-text" });
  assert.equal(kept.target.intentionallyEmpty, true); assert.deepEqual(kept.sources, []); assert.equal(kept.draft, "");
  delete f.document.emptyConfirmations.appearance;
  selected = await f.textRequest("appearance", () => []); const absent = await f.adapter.loadTextContext(selected.request, { kind: "source-text" }); assert.deepEqual(absent.sources, []);
  target.requested = false; selected = await f.textRequest(); await assert.rejects(f.adapter.loadTextContext(selected.request, { kind: "source-text" }), matches("page_ai_not_requested"));
  target.requested = true; target.blocks = [{ type: "paragraph", text: "Vorhandener eigener Fachtext" }]; selected = await f.textRequest();
  await assert.rejects(f.adapter.loadTextContext(selected.request, { kind: "source-text" }), matches("page_ai_target_not_empty")); assert.equal(target.blocks[0].text, "Vorhandener eigener Fachtext");
});

test("unknown, duplicated and overlimit source selections are blocked without truncating actual text", async (t) => {
  const f = fixture(t), selected = await f.textRequest();
  for (const sourceIds of [["source-" + "0".repeat(64)], [selected.request.sourceIds[0], selected.request.sourceIds[0]], Array.from({ length: 21 }, (_, n) => "source-" + sha256(String(n)))])
    await assert.rejects(f.adapter.loadTextContext({ ...selected.request, sourceIds }, { kind: "source-text" }));
  f.record.editorial.sections[1].text = "A".repeat(8001); const long = await f.textRequest();
  assert.equal(long.catalog.sources[0].text.length, 8001);
  await assert.rejects(f.adapter.loadTextContext(long.request, { kind: "source-text" }), matches("page_ai_source_limit"));
  assert.equal(f.record.editorial.sections[1].text.length, 8001);
});

test("global source drift, target changes and record changes invalidate older selection and issued bindings", async (t) => {
  const f = fixture(t), selected = await f.textRequest(), result = await f.adapter.loadTextContext(selected.request, { kind: "source-text" });
  f.record.editorial.sections[1].text = "Eine inzwischen geänderte bereitgestellte Quelle.";
  await assert.rejects(f.adapter.loadTextContext(selected.request, { kind: "source-text" }), matches("page_ai_binding_changed"));
  assert.equal(await f.adapter.isBindingCurrent(result.binding), false);
  const next = await f.textRequest(), current = await f.adapter.loadTextContext(next.request, { kind: "source-text" });
  f.document.sections.find((section) => section.id === "appearance").title = "Andere Zielüberschrift"; assert.equal(await f.adapter.isBindingCurrent(current.binding), false);
});

test("issued input proof rejects manipulated normalized hashes, target identity and a different adapter instance", async (t) => {
  const f = fixture(t), result = await f.adapter.loadImage(f.request({ imageId: "position-a" })), other = fixture(t);
  for (const change of [{ imageSha256: sha256("invented pixels") }, { imageId: "other-image" }, { role: "admin" }, { revision: sha256("other revision") }])
    assert.equal(await f.adapter.isBindingCurrent({ ...result.binding, ...change }), false);
  assert.equal(await other.adapter.isBindingCurrent(result.binding), false);
});

test("close aborts its own preparation and waits for the actual outstanding normalizer completion", async (t) => {
  const f = fixture(t), entered = deferred(), finish = deferred(); let stopped = false;
  f.hooks.normalize = async (_bytes, { signal }) => { entered.resolve(signal); await finish.promise; };
  const task = f.adapter.loadImage(f.request({ imageId: "position-a" })); const outcome = assert.rejects(task, matches("page_ai_cancelled"));
  const signal = await entered.promise, closing = f.adapter.close().then(() => { stopped = true; });
  await tick(); assert.equal(signal.aborted, true); assert.equal(stopped, false); assert.equal(f.adapter.blockingState().busy, true);
  finish.resolve(); await Promise.all([outcome, closing]); assert.equal(f.adapter.blockingState().busy, false); assert.equal(f.closes(), 0);
});

test("external cancellation stops before normalization and owned normalizers close exactly once", async (t) => {
  const f = fixture(t, { ownNormalizer: true }), controller = new AbortController(); controller.abort();
  await assert.rejects(f.adapter.loadImage(f.request({ imageId: "position-a" }), { signal: controller.signal }), matches("page_ai_cancelled"));
  assert.deepEqual(f.calls, []); await f.adapter.close(); await f.adapter.close(); assert.equal(f.closes(), 1);
});

test("close also joins a reader which cannot finish until its actual asynchronous read settles", async (t) => {
  const f = fixture(t), entered = deferred(), finish = deferred(); let done = false;
  f.hooks.snapshot = async (_input, { signal }) => { entered.resolve(signal); await finish.promise; };
  const task = f.adapter.loadImage(f.request({ imageId: "position-a" })), outcome = assert.rejects(task, matches("page_ai_cancelled"));
  const signal = await entered.promise, closing = f.adapter.close().then(() => { done = true; }); await tick();
  assert.equal(signal.aborted, true); assert.equal(done, false); assert.equal(f.adapter.blockingState().busy, true);
  finish.resolve(); await Promise.all([outcome, closing]); assert.equal(f.normalized.length, 0); assert.equal(f.adapter.blockingState().busy, false);
});

test("language context reads exact saved paragraph and list text without sources or image normalization", async (t) => {
  const f = fixture(t), request = f.request({ sectionId: "habitat" }), result = await f.adapter.loadTextContext(request, { kind: "review-language" });
  assert.equal(result.draft, "Bereitgestellter Lebensraumtext.\n\nErster Ort\nZweiter Ort"); assert.equal(result.binding.kind, "review-language");
  assert.equal(result.binding.draftSha256, sha256(Buffer.from(result.draft))); assert.equal(Object.hasOwn(result.binding, "sourceIds"), false);
  assert.equal(Object.hasOwn(result, "sources"), false); assert.equal(f.normalized.length, 0); assert.equal(f.calls.some((call) => call.method === "image"), false);
  assert.equal(await f.adapter.isBindingCurrent(result.binding), true);
  f.document.sections.find((section) => section.id === "habitat").blocks[0].text = "Anderer inzwischen gespeicherter Fachtext";
  assert.equal(await f.adapter.isBindingCurrent(result.binding), false);
});

test("language supports supplied introduction blocks but never generated general or map modules", async (t) => {
  const f = fixture(t); f.document.introduction = [{ type: "heading", level: 5, text: "eine einleitung" }, { type: "bullet-list", items: ["erstes beispiel", "zweites beispiel"] }];
  const result = await f.adapter.loadTextContext(f.request({ sectionId: "introduction" }), { kind: "review-language" });
  assert.equal(result.draft, "eine einleitung\n\nerstes beispiel\nzweites beispiel"); assert.equal(result.target.title, "Einleitung"); assert.equal(await f.adapter.isBindingCurrent(result.binding), true);
  for (const sectionId of ["general", "map"]) await assert.rejects(f.adapter.loadTextContext(f.request({ sectionId }), { kind: "review-language" }), matches("page_ai_invalid_target"));
});

test("language preserves empty decisions and accepts neither an inline page draft nor factual source selection", async (t) => {
  const f = fixture(t), section = f.document.sections.find((entry) => entry.id === "appearance");
  f.document.emptyConfirmations.appearance = { sectionHash: emptySectionHash(section), actorId: USER.id, confirmedAt: "2026-11-01T12:00:00.000Z", reason: "Bewusst leer" };
  const result = await f.adapter.loadTextContext(f.request({ sectionId: "appearance" }), { kind: "review-language" });
  assert.equal(result.draft, ""); assert.equal(result.target.intentionallyEmpty, true);
  for (const extra of [{ draftText: "Nicht gespeicherter Page-Text" }, { sourceIds: [] }, { expectedSourcesRevision: "a".repeat(64) }])
    await assert.rejects(f.adapter.loadTextContext(f.request({ sectionId: "appearance", ...extra }), { kind: "review-language" }));
  assert.equal(f.normalized.length, 0);
});
