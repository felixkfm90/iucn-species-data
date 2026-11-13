import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createExplorerLocalAiService } from "./explorer-service.mjs";
import { createLocalAiService } from "./service.mjs";
import { initialDocument } from "../page-authoring/model.mjs";
import { fingerprint, sha256, clone } from "../page-authoring/contract.mjs";
import { pixel } from "./test-fixtures.mjs";
import { createTestJpeg } from "../server-test-fixtures.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

function fixture(t, { shared = null, serviceOverrides = {}, cacheOverrides = {}, pageAuthoring = null, normalizer, useRealService = false, websiteSnapshot = async () => ({}) } = {}) {
  const calls = [], jobs = new Map(); let profile = shared, config, actualAi;
  const cache = { status: async () => ({ status: "not-installed" }),
    download: async () => { calls.push("download"); }, close: async () => { calls.push("cache-close"); }, ...cacheOverrides };
  const worker = { status: () => ({ state: "stopped", busy: false, ownWorkerActive: false, ownPid: 12345, errorCode: "" }),
    complete: async () => { calls.push("model-complete"); return { text: "Testart auf einem Ast.", uncertainties: [] }; },
    stop: async () => { calls.push("worker-stop"); }, close: async () => { calls.push("worker-close"); } };
  const images = { busy: false, loadImage() {}, isBindingCurrent: async () => true,
    close: async () => { calls.push("images-close"); await normalizer?.close?.(); } };
  const ai = { status: (ownerId) => ({ busy: false, queued: 0, worker: worker.status(),
    jobs: [...jobs.values()].filter((job) => job.ownerId === ownerId).map(({ ownerId: ignored, ...job }) => job) }),
  suggestAltText(input) { calls.push({ action: "suggest-alt", input }); const job = { jobId: "own-job", ...input }; jobs.set(job.jobId, job); return job; },
  get(id, ownerId) { const job = jobs.get(id); if (!job || job.ownerId !== ownerId) throw new Error("Fremder Auftrag"); return job; },
  cancel(id, ownerId) { calls.push({ action: "cancel", id, ownerId }); return this.get(id, ownerId); },
  cancelOwner: async (ownerId) => { calls.push({ action: "cancel-owner", ownerId }); },
  close: async () => { calls.push("ai-close"); }, ...serviceOverrides };
  const service = createExplorerLocalAiService({ cacheRoot: path.resolve("synthetic-personal-profile", "local-ai"), deviceId: "synthetic-device", repoRoot: path.resolve("synthetic-workspace"),
    websiteAltTexts: { snapshot: websiteSnapshot }, sharedProject: { snapshot: async () => profile }, pageAuthoring,
    ...(normalizer ? { normalizer } : {}),
    cacheFactory: () => cache, workerFactory: () => worker, imageLoaderFactory: () => images,
    serviceFactory: (value) => { config = value; actualAi = useRealService ? createLocalAiService(value) : ai; return actualAi; } });
  t.after(() => service.close());
  return { service, calls, jobs, worker, images, getConfig: () => config, getAi: () => actualAi, setShared(value) { profile = value; } };
}

const writer = (user = "felix", project = "fn-project") => ({ status: { baseUrl: "https://project.invalid", projectId: project, user: { id: user, role: "publisher", version: 1 }, connection: "online", readOnlySession: false }, busy: false,
  permissions: { canRead: true, canEdit: true } });

function pageReaderFixture() {
  const status = writer().status, hooks = {}, reads = [], bytes = Buffer.from(pixel), jpeg = createTestJpeg(3, 2);
  const sourceScope = fingerprint([status.baseUrl, status.projectId, status.user.id]), revision = sha256("page-revision");
  const asset = { id: "image-32bb29d3-d346-420f-8d69-b3112cd702f2", projectId: status.projectId, sha256: sha256(bytes), bytes: bytes.length, mimeType: "image/png", attribution: "Eigene Aufnahme" };
  const species = { slug: "test-art", scientificName: "Testus fixture", commonName: "Testart", assetName: "Testart", taxonomy: [], general: [], status: "",
    revision: "species-bound", dataSha256: sha256("species-bound"), runtimeReady: false, normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null } };
  const document = initialDocument({ templateId: "fn-compact-20261031", species, parentPath: "/wildlife/heimische-tierwelt" });
  document.images = [{ id: "position-a", assetId: asset.id, alt: "Testart auf einem Ast", caption: "Eigene Beschriftung", decorative: false, asset: clone(asset) }];
  const speciesRecord = { type: "fn-species-record", schemaVersion: 1, id: species.slug, input: { german: "Testart", genus: "Testus", species: "fixture", privatePrompt: "PRIVATE_RAW_MUST_NOT_REACH_MODEL" },
    generated: null, taxonomyOverride: null, assessmentBinding: null, assets: { assetName: "Testart", files: {}, overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, generalSectionId: null, embeddedGeneralText: null, gallery: [], sections: [{ id: "provided", title: "Gelieferter Arttext", text: "Die Oberseite ist blau.", intentionallyEmpty: false }] } };
  const snapshot = { sourceScope, origin: status.baseUrl, projectId: status.projectId, user: clone(status.user), permissions: { canRead: true, canEdit: true },
    connection: "online", readOnlySession: false, draft: { id: "draft-a", projectId: status.projectId, revision, current: true, document }, speciesRecord };
  let closes = 0, prepares = 0;
  return { snapshot, reads, hooks, closes: () => closes, prepares: () => prepares,
    request: (extra = {}) => ({ type: "page-authoring", sourceScope, draftId: "draft-a", expectedRevision: revision, ...extra }),
    pageAuthoring: { aiReader: {
      async readSnapshot(input, context) { reads.push({ input, signal: context.signal }); await hooks.snapshot?.(input, context); return clone(snapshot); },
      async readImage(input, context) { reads.push({ input, signal: context.signal }); await hooks.image?.(input, context); return { metadata: clone(asset), buffer: Buffer.from(bytes) }; },
    } },
    normalizer: { async normalize(input, context) { prepares++; assert.deepEqual(input, bytes); await hooks.normalize?.(input, context); return { bytes: Buffer.from(jpeg), mimeType: "image/jpeg" }; }, async close() { closes++; } },
  };
}
async function waitFacadeJob(service, job) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await service.operation({ action: "get", id: job.jobId });
    if (["completed", "failed", "stale", "cancelled"].includes(value.status)) return value;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Synthetic facade job did not finish");
}

test("Öffnen der optionalen Hilfe lädt nichts, startet kein Modell und gibt keine Prozesskennung aus", async (t) => {
  const f = fixture(t), result = await f.service.snapshot();
  assert.equal(result.mode, "cpu"); assert.equal(result.busy, false); assert.equal(result.installing, false);
  assert.equal(result.cache.status, "not-installed"); assert.equal(result.worker.ownPid, undefined);
  assert.deepEqual(f.calls, []);
});

test("KI-Aufträge erhalten die wirkliche lokale oder gemeinsame Identität; Rendereridentitäten sind abgewiesen", async (t) => {
  const f = fixture(t);
  await assert.rejects(f.service.operation({ action: "suggest-alt", payload: { ownerId: "foreign", imageKey: "image" } }), /fremde Anmeldung/);
  await f.service.operation({ action: "suggest-alt", payload: { imageKey: "image" } });
  const localOwner = f.calls.at(-1).input.ownerId; assert.match(localOwner, /^[a-f0-9-]{36}:[a-f0-9]{64}$/);
  f.setShared(writer());
  await f.service.operation({ action: "suggest-alt", payload: { imageKey: "image" } });
  const sharedOwner = f.calls.at(-1).input.ownerId; assert.match(sharedOwner, /^[a-f0-9-]{36}:[a-f0-9]{64}$/); assert.notEqual(sharedOwner, localOwner);
  f.setShared(writer("niko"));
  assert.deepEqual((await f.service.snapshot()).jobs, []);
  await assert.rejects(f.service.operation({ action: "get", id: "own-job" }), /Fremder Auftrag/);
  assert.equal(f.calls.filter((call) => call.action === "suggest-alt").length, 2);
});

test("Leser, abgemeldete Projektmitglieder und laufender Identitätswechsel starten keine Modellarbeit", async (t) => {
  const f = fixture(t);
  for (const profile of [{ ...writer(), permissions: { canRead: true, canEdit: false } },
    { ...writer(), status: { projectId: "fn-project", user: null } }, { ...writer(), busy: true }]) {
    f.setShared(profile);
    await assert.rejects(f.service.operation({ action: "suggest-alt", payload: { imageKey: "image" } }), { statusCode: 403 });
    await assert.rejects(f.service.operation({ action: "download", payload: { confirmed: true } }), { statusCode: 403 });
  }
  assert.deepEqual(f.calls.filter((call) => call === "download" || call?.action === "suggest-alt"), []);
});

test("Zwei gleichzeitige Einrichtungsanfragen starten genau einen ausdrücklich bestätigten Download", async (t) => {
  const pending = deferred();
  const f = fixture(t, { cacheOverrides: { download: async () => { f.calls.push("download"); await pending.promise; } } });
  try {
    await assert.rejects(f.service.operation({ action: "download", payload: {} }), /bestätigen/);
    const results = await Promise.allSettled([f.service.operation({ action: "download", payload: { confirmed: true } }),
      f.service.operation({ action: "download", payload: { confirmed: true } })]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(f.calls.filter((call) => call === "download").length, 1);
  } finally { pending.resolve(); }
});

test("Ein anderer Benutzer kann einen bereits laufenden Einrichtungsdownload nicht abbrechen", async (t) => {
  let aborted = false;
  const f = fixture(t, { shared: writer(), cacheOverrides: { download: ({ signal }) => new Promise((resolve) => {
    signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true });
  }) } });
  await f.service.operation({ action: "download", payload: { confirmed: true } });
  f.setShared(writer("niko"));
  await assert.rejects(f.service.operation({ action: "cancel-download" }), { statusCode: 403 });
  assert.equal(aborted, false);
  f.setShared(writer());
  await f.service.operation({ action: "cancel-download" });
  assert.equal(aborted, true);
  assert.equal((await f.service.snapshot()).installing, false);
});

test("Schließen wartet auf die eigene Einrichtung und beendet den Dienst vor Bildleser und Cache", async (t) => {
  const drain = deferred(), entered = deferred();
  const f = fixture(t, { cacheOverrides: { download: ({ signal }) => new Promise((resolve) => {
    signal.addEventListener("abort", () => { entered.resolve(); drain.promise.then(resolve); }, { once: true });
  }) } });
  await f.service.operation({ action: "download", payload: { confirmed: true } });
  const closing = f.service.close(); await entered.promise;
  assert.deepEqual(f.calls, []);
  assert.equal(f.service.blockingState().busy, true);
  await assert.rejects(f.service.operation({ action: "suggest-alt", payload: { imageKey: "image" } }), /geschlossen/);
  drain.resolve(); await closing;
  assert.deepEqual(f.calls, ["ai-close", "images-close", "cache-close"]);
});

test("ein tatsächlich typisierter Pagebildauftrag nutzt denselben Serviceworker und normalisiert erst nach ausdrücklichem Start", async (t) => {
  const source = pageReaderFixture(), f = fixture(t, { shared: writer(), ...source, useRealService: true });
  const before = await f.service.snapshot(); assert.equal(before.pageAuthoringAvailable, true); assert.equal(source.prepares(), 0); assert.deepEqual(source.reads, []);
  assert.equal(f.getConfig().worker, f.worker);
  const job = await f.service.operation({ action: "suggest-alt", payload: { ...source.request({ imageId: "position-a" }), requestId: "page-image" } });
  const done = await waitFacadeJob(f.service, job); assert.equal(done.status, "completed"); assert.equal(done.result.binding.type, "page-authoring");
  assert.equal(done.result.binding.sourceScope, source.snapshot.sourceScope); assert.equal(done.result.binding.documentId, "draft-a");
  assert.equal(Object.hasOwn(done.result.binding, "pageUrl"), false); assert.equal(source.prepares(), 1); assert.equal(f.calls.filter((call) => call === "model-complete").length, 1);
  assert.equal(done.result.approved, false); assert.equal(done.result.transferred, false);
});

test("Pagequellen und Fachvorschlag laufen durch den Node-Reader und behalten signierte normalisierte Belege", async (t) => {
  const source = pageReaderFixture(), f = fixture(t, { shared: writer(), ...source, useRealService: true });
  const catalog = await f.service.operation({ action: "page-sources", payload: source.request({ sectionId: "appearance" }) });
  assert.equal(catalog.sources.length, 1); const sourceId = catalog.sources[0].id;
  f.worker.complete = async () => ({ paragraphs: [{ text: "Die Oberseite ist blau.", sourceIds: [sourceId], evidenceQuotes: [{ sourceId, quote: "Oberseite ist blau" }] }] });
  const job = await f.service.operation({ action: "suggest-text", payload: { ...source.request({ sectionId: "appearance", sourceIds: [sourceId], expectedSourcesRevision: catalog.sourcesRevision }), requestId: "page-text" } });
  const done = await waitFacadeJob(f.service, job); assert.equal(done.status, "completed"); assert.equal(done.result.binding.sourceCatalogRevision, catalog.sourcesRevision);
  assert.match(done.result.binding.inputProof, /^[a-f0-9]{64}$/); assert.deepEqual(done.result.paragraphs[0].sourceIds, [sourceId]);
  assert.ok(!JSON.stringify(done).includes("PRIVATE_RAW_")); assert.equal(source.prepares(), 0);
});

test("Ownerfingerprint trennt Rolle, Ursprung und effektive Rechte trotz gleicher Projekt-/Benutzerkennungen", async (t) => {
  const f = fixture(t, { shared: writer() });
  await f.service.operation({ action: "suggest-alt", payload: { imageKey: "one" } }); const first = f.calls.find((call) => call.action === "suggest-alt").input.ownerId;
  for (const mutate of [
    (profile) => { profile.status.user.role = "admin"; }, (profile) => { profile.status.baseUrl = "https://different.invalid"; },
    (profile) => { profile.status.readOnlySession = true; profile.permissions.canEdit = false; },
    (profile) => { profile.status.user.version = 2; },
  ]) {
    const profile = writer(); mutate(profile); f.setShared(profile); assert.deepEqual((await f.service.snapshot()).jobs, []);
    await assert.rejects(f.service.operation({ action: "get", id: "own-job" }), /Fremder Auftrag/);
    assert.ok(f.calls.some((call) => call.action === "cancel-owner" && call.ownerId === first));
  }
});

test("Page-Reader ist ohne Anschluss oder ohne gemeinsame Redaktionsanmeldung nicht durch beliebige IDs ersetzbar", async (t) => {
  const source = pageReaderFixture(), unavailable = fixture(t, { shared: writer() });
  assert.equal((await unavailable.service.snapshot()).pageAuthoringAvailable, false);
  await assert.rejects(unavailable.service.operation({ action: "page-sources", payload: source.request({ sectionId: "appearance" }) }), /nicht angeschlossen/);
  const local = fixture(t, { ...source });
  await assert.rejects(local.service.operation({ action: "page-sources", payload: source.request({ sectionId: "appearance" }) }), { statusCode: 403 });
  assert.deepEqual(source.reads, []);
});

test("Rollenwechsel während Pagebildvorbereitung verbirgt alte Resultate und invalidiert den eigenen Auftrag", async (t) => {
  const source = pageReaderFixture(), entered = deferred(), finish = deferred();
  source.hooks.normalize = async () => { entered.resolve(); await finish.promise; };
  const f = fixture(t, { shared: writer(), ...source, useRealService: true });
  const job = await f.service.operation({ action: "suggest-alt", payload: { ...source.request({ imageId: "position-a" }), requestId: "role-drift" } }); await entered.promise;
  const reader = writer(); reader.status.user.role = "reader"; reader.permissions.canEdit = false; f.setShared(reader);
  const status = await f.service.snapshot(); assert.deepEqual(status.jobs, []); await assert.rejects(f.service.operation({ action: "get", id: job.jobId }));
  finish.resolve(); assert.equal(f.calls.filter((call) => call === "model-complete").length, 0);
});

test("Pagequellenanzeige prüft nach asynchronem Lesen erneut den tatsächlichen Besitzer", async (t) => {
  const source = pageReaderFixture(), entered = deferred(), finish = deferred();
  source.hooks.snapshot = async () => { entered.resolve(); await finish.promise; };
  const f = fixture(t, { shared: writer(), ...source, useRealService: true });
  const reading = f.service.operation({ action: "page-sources", payload: source.request({ sectionId: "appearance" }) }); const rejection = assert.rejects(reading, { statusCode: 403 });
  await entered.promise; f.setShared(writer("niko")); finish.resolve(); await rejection;
  assert.equal(f.calls.filter((call) => call === "model-complete").length, 0);
});

test("Schließen joint wartende Pagequellen und schließt den gemeinsam genutzten Normalisierer genau einmal", async (t) => {
  const source = pageReaderFixture(), entered = deferred(), finish = deferred(); let ended = false;
  source.hooks.snapshot = async (_input, { signal }) => { entered.resolve(signal); await finish.promise; };
  const f = fixture(t, { shared: writer(), ...source, useRealService: true });
  const reading = f.service.operation({ action: "page-sources", payload: source.request({ sectionId: "appearance" }) });
  const rejection = assert.rejects(reading); const signal = await entered.promise, closing = f.service.close().then(() => { ended = true; });
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(ended, false); assert.equal(signal.aborted, true); assert.equal(f.service.blockingState().busy, true);
  finish.resolve(); await Promise.all([rejection, closing]); await f.service.close(); assert.equal(source.closes(), 1);
});

test("Website-Sprachprüfung bindet den noch ungespeicherten Text statt gespeicherten Alttext und lädt keine Bilder", async (t) => {
  const pageUrl = "https://www.fnwildlifetravel.de/reisen/2024-costa-rica/cordillera-de-talamanca", imageKey = "a".repeat(64), observationHash = "b".repeat(64);
  const document = { revision: "c".repeat(64), pages: [{ url: pageUrl, title: "Bildtext", inventoryStatus: "current", error: "", redirectUrl: null,
    images: [{ key: imageKey, observationHash, context: "content", kind: "image", status: "approved", alt: "Gespeicherter alter Text", draft: { text: "Gespeicherter Entwurf" } }] }] };
  const before = JSON.stringify(document), f = fixture(t, { useRealService: true, websiteSnapshot: async () => clone(document) });
  f.images.loadImage = () => { throw new Error("Language must not load image bytes"); };
  f.worker.complete = async (request) => {
    const input = JSON.parse(request.messages[1].content.split("\nTEXT_DATEN=")[1]); assert.equal(input.text, "das ist mein neuer Text");
    return { draftSha256: input.draftSha256, findings: [{ kind: "capitalization", draftQuote: "das", replacement: "Das", explanation: "Satzanfang großschreiben." }] };
  };
  const status = await f.service.snapshot(); assert.equal(status.languageReviewAvailable, true); assert.equal(status.languageReviewMaxFindings, 8);
  const job = await f.service.operation({ action: "review-language", payload: { type: "website-language", pageUrl, imageKey, observationHash, draftText: "das ist mein neuer Text", requestId: "website-language" } });
  const done = await waitFacadeJob(f.service, job); assert.equal(done.status, "completed"); assert.equal(done.result.binding.type, "website-language");
  assert.equal(done.result.originalText, "das ist mein neuer Text"); assert.equal(done.result.correctedText, "Das ist mein neuer Text");
  assert.equal(done.result.binding.snapshotRevision, document.revision); assert.equal(JSON.stringify(document), before);
  assert.equal(done.result.approved, false); assert.equal(done.result.transferred, false); assert.equal(done.result.languageGuarantee, false);
});

test("Page-Sprachprüfung nutzt den gespeicherten Fachabschnitt ohne Quellenpicker oder Normalisierung", async (t) => {
  const source = pageReaderFixture(); source.snapshot.draft.document.sections.find((section) => section.id === "appearance").blocks = [{ type: "paragraph", text: "das ist ein Test" }];
  const f = fixture(t, { shared: writer(), ...source, useRealService: true });
  f.worker.complete = async (request) => { const input = JSON.parse(request.messages[1].content.split("\nTEXT_DATEN=")[1]); return { draftSha256: input.draftSha256, findings: [] }; };
  const job = await f.service.operation({ action: "review-language", payload: { ...source.request({ sectionId: "appearance" }), requestId: "page-language" } });
  const done = await waitFacadeJob(f.service, job); assert.equal(done.status, "completed"); assert.equal(done.result.originalText, "das ist ein Test");
  assert.equal(done.result.binding.kind, "review-language"); assert.equal(Object.hasOwn(done.result.binding, "sourceIds"), false);
  assert.equal(source.prepares(), 0); assert.equal(source.reads.some((read) => Object.hasOwn(read.input, "assetId")), false);
});

test("Website-Sprachhinweise aus einer inzwischen geänderten Beobachtung werden ohne Modellaufruf verworfen", async (t) => {
  const pageUrl = "https://www.fnwildlifetravel.de/ueber-uns", imageKey = "a".repeat(64), observationHash = "b".repeat(64);
  const f = fixture(t, { useRealService: true, websiteSnapshot: async () => ({ revision: "c".repeat(64), pages: [{ url: pageUrl, title: "Über uns", inventoryStatus: "current", images: [{ key: imageKey, observationHash: "d".repeat(64), context: "content", kind: "image", status: "changed" }] }] }) });
  const job = await f.service.operation({ action: "review-language", payload: { type: "website-language", pageUrl, imageKey, observationHash, draftText: "mein Text", requestId: "stale-language" } });
  const done = await waitFacadeJob(f.service, job); assert.equal(done.status, "failed"); assert.equal(done.result, null); assert.equal(f.calls.includes("model-complete"), false);
});

test("ein Ownerwechsel während einer Sprachmodellantwort legt den privaten noch ungespeicherten Text nicht offen", async (t) => {
  const pageUrl = "https://www.fnwildlifetravel.de/ueber-uns", imageKey = "a".repeat(64), observationHash = "b".repeat(64), entered = deferred(), finish = deferred();
  const f = fixture(t, { shared: writer(), useRealService: true, websiteSnapshot: async () => ({ revision: "c".repeat(64), pages: [{ url: pageUrl, title: "Über uns", inventoryStatus: "current", images: [{ key: imageKey, observationHash, context: "content", kind: "image", status: "approved" }] }] }) });
  f.worker.complete = async (request) => { const input = JSON.parse(request.messages[1].content.split("\nTEXT_DATEN=")[1]); entered.resolve(); await finish.promise; return { draftSha256: input.draftSha256, findings: [] }; };
  const job = await f.service.operation({ action: "review-language", payload: { type: "website-language", pageUrl, imageKey, observationHash, draftText: "PRIVATE_UNSAVED_LANGUAGE_TEXT", requestId: "language-owner" } }); await entered.promise;
  try {
    f.setShared(writer("niko")); const status = await f.service.snapshot(); assert.deepEqual(status.jobs, []); assert.ok(!JSON.stringify(status).includes("PRIVATE_UNSAVED_LANGUAGE_TEXT"));
    await assert.rejects(f.service.operation({ action: "get", id: job.jobId })); assert.ok(f.calls.includes("worker-stop"));
  } finally { finish.resolve(); }
});
