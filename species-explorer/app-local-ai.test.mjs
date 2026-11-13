import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-local-ai.js", import.meta.url), "utf8");
const existingPreviewPolicy = await readFile(new URL("./public/app-website-alt-texts.js", import.meta.url), "utf8");
const PAGE = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen";
const PREVIEW = "https://images.squarespace-cdn.com/content/v1/site/athen.jpg?format=750w";
const copy = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let count = 0; count < 8; count++) await new Promise(setImmediate); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function element(tag) {
  const handlers = new Map();
  return { tag, className: "", children: [], attributes: {}, textContent: "", value: "", open: false, disabled: false, hidden: false,
    append(...children) { for (const child of children) { this.children.push(child); child.parent = this; } },
    replaceChildren(...children) { this.children = []; this.textContent = ""; this.append(...children); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.removed = true; },
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(name, handler) { handlers.set(name, [...(handlers.get(name) || []), handler]); },
    removeEventListener(name, handler) { handlers.set(name, (handlers.get(name) || []).filter((item) => item !== handler)); },
    emit(name, fields = {}) { if (name === "click" && this.disabled) return; for (const handler of handlers.get(name) || []) handler({ target: this, preventDefault() {}, ...fields }); },
  };
}
function harness(options = {}) {
  const body = element("body"), nodes = [], timers = new Map(), calls = [], confirmations = [], jobs = new Map(), applied = [];
  let clock = 0, sequence = 0, nextTimer = 0, dialogOptions, controller, current = true, confirm = options.confirm ?? true;
  let backend = { available: true, cache: { status: options.installed === false ? "not-installed" : "ready", totalBytes: 3_400_000_000, downloadedBytes: 0 },
    installing: false, installError: "", busy: false, worker: { state: "idle", busy: false, ownWorkerActive: false, errorCode: "" }, jobs: [] };
  const documentRef = { body, createElement(tag) { const node = element(tag); nodes.push(node); return node; } };
  const context = vm.createContext({ document: documentRef, URL, AbortController,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); } });
  new vm.Script(existingPreviewPolicy).runInContext(context); new vm.Script(source).runInContext(context);
  const api = context.SpeciesExplorerLocalAi;
  const makeJob = (requestId, status = "running", kind = "alt-text") => ({ jobId: `job-${jobs.size + 1}`, requestId, status, kind, approved: false, transferred: false, result: null, error: "" });
  controller = api.createLocalAiController({ documentRef, requestId: () => `request-${++sequence}`, now: () => clock,
    createDialogController(config) { dialogOptions = config; return { open() { config.dialog.open = true; }, isOpen() { return config.dialog.open; },
      close() { if (config.beforeClose?.() === false) return false; config.dialog.open = false; config.afterClose?.(); return true; }, destroy() {} }; },
    async confirmAction(value) { confirmations.push(value); return typeof confirm === "function" ? confirm(value) : confirm; },
    async fetchJson(url, request) {
      const call = { url, method: request?.method || "GET", body: request?.body ? JSON.parse(request.body) : null }; calls.push(call);
      const tools = { makeJob, jobs, get backend() { return backend; }, setBackend: (value) => { backend = value; } };
      if (options.fetch) { const result = await options.fetch(call, tools); if (result !== undefined) return result; }
      if (url === "/api/local-ai") return copy({ ...backend, jobs: [...jobs.values()] });
      if (["/suggest-alt", "/suggest-text", "/review-text", "/review-language"].some((suffix) => url.endsWith(suffix))) {
        const kind = url.endsWith("/review-language") ? "review-language" : url.endsWith("/suggest-text") ? "source-text" : url.endsWith("/review-text") ? "review-text" : "alt-text";
        const job = makeJob(call.body.requestId, "running", kind); jobs.set(job.jobId, job); return copy(job);
      }
      if (url.endsWith("/cancel-download")) { backend.installing = false; backend.busy = false; backend.cache.installing = false; return copy(backend); }
      if (url.endsWith("/download")) { backend.installing = true; backend.busy = true; backend.cache.installing = true; return copy(backend); }
      const match = url.match(/\/jobs\/([^/]+)(\/cancel)?$/);
      if (match) { const job = jobs.get(decodeURIComponent(match[1])); if (!job) throw new Error("Unknown own fixture job");
        if (match[2] && !["completed", "failed", "stale"].includes(job.status)) job.status = "cancelled"; return copy(job); }
      throw new Error(`Unexpected fixture endpoint ${url}`);
    },
  });
  const find = (tag, content) => nodes.find((node) => node.tag === tag && (!content || node.textContent.includes(content)));
  const input = { pageUrl: PAGE, imageKey: "image-a", observationHash: "observation-a", previewUrl: PREVIEW, initialText: "Felix' vorhandener Text",
    context: { title: "Athen", pageType: "travel-detail" }, isCurrent: async () => current,
    async applyProposal(text, caption) { applied.push({ text, caption }); return options.apply ? options.apply(text, caption) : undefined; } };
  let pageInput, languageInput;
  return { api, controller, body, nodes, timers, calls, confirmations, jobs, applied, find, input,
    async open(overrides) { return controller.openForImage({ ...input, ...overrides }); },
    async openPage(kind = "alt-text", overrides = {}) {
      const scope = "1".repeat(64), sourceId = `source-${"3".repeat(64)}`;
      pageInput = { kind, request: { type: "page-authoring", sourceScope: scope, draftId: "page-one", expectedRevision: "2".repeat(64),
        ...(kind === "alt-text" ? { imageId: "usage-one" } : kind === "review-language" ? { sectionId: "habitat" } : { sectionId: "habitat", sourceIds: [sourceId], expectedSourcesRevision: "4".repeat(64) }) },
        ...(kind === "alt-text" ? { previewUrl: `/api/page-authoring/images/image-11111111-2222-4333-8444-555555555555?scope=${scope}` } : {}),
        initialText: kind === "review-language" ? "Das ist ein Feeler." : kind === "source-text" ? "" : kind === "review-text" ? "Gespeicherter Absatz" : "Vorhandener Alttext",
        context: { title: "Amsel", ...(kind === "review-language" ? { languageSegments: [{ start: 0, end: "Das ist ein Feeler.".length }] }
          : kind !== "alt-text" ? { sources: [{ id: sourceId, title: "Gebundene Artquelle", revision: "5".repeat(64), text: "Die Art lebt in Wäldern und sucht am Boden nach Nahrung." }] } : {}) },
        isCurrent: async () => current,
        applyProposal(value, caption) { applied.push(typeof value === "object" ? { proposal: copy(value) } : { text: value, caption }); return options.pageApply ? options.pageApply(value) : true; }, ...overrides };
      return controller.openForPage(pageInput);
    },
    async openLanguage(overrides = {}) {
      languageInput = { pageUrl: PAGE, imageKey: "8".repeat(64), observationHash: "9".repeat(64), initialText: "Das ist ein Feeler.", context: { title: "Offener Bildtext" },
        isCurrent: async () => current, applyProposal(value) { applied.push({ text: value }); return options.languageApply ? options.languageApply(value) : true; }, ...overrides };
      return controller.openForLanguage(languageInput);
    },
    async click(label) { const node = find("button", label); assert.ok(node, label); node.emit("click"); await flush(); },
    async tick(delay = 1200) { const item = [...timers.entries()].find(([, timer]) => timer.delay === delay); assert.ok(item, `Timer ${delay}`);
      timers.delete(item[0]); clock += delay; item[1].fn(); await flush(); },
    async type(value) { const node = find("textarea"); node.value = value; node.emit("input"); await flush(); },
    complete(values = {}) { const job = [...jobs.values()].at(-1); Object.assign(job, { status: "completed", result: { kind: "alt-text", status: "proposal", approved: false,
      transferred: false, humanReviewRequired: true, text: "Säulen der Akropolis auf einem felsigen Hügel", caption: null, uncertainties: [],
      binding: { pageUrl: PAGE, imageKey: "image-a", revision: "observation-a" }, ...values } }); return job; },
    completePage(values = {}) {
      const job = [...jobs.values()].at(-1), request = pageInput.request, kind = pageInput.kind;
      const binding = { type: "page-authoring", kind, sourceScope: request.sourceScope, documentId: request.draftId, revision: request.expectedRevision,
        origin: "https://shared.example", projectId: "project-one", userId: "person-one", role: "contributor",
        inputProof: "a".repeat(64), authorizationHash: "b".repeat(64), snapshotHash: "c".repeat(64), targetHash: "d".repeat(64),
        ...(kind === "alt-text" ? { imageId: request.imageId, assetId: "image-11111111-2222-4333-8444-555555555555", imageSha256: "e".repeat(64), sourceSha256: "f".repeat(64), metadataHash: "6".repeat(64) }
          : kind === "review-language" ? { sectionId: request.sectionId, draftSha256: "7".repeat(64) }
            : { sectionId: request.sectionId, sourceIds: copy(request.sourceIds), sourceCatalogRevision: request.expectedSourcesRevision, sourcesRevision: "7".repeat(64), selectedSourcesHash: "8".repeat(64) }) };
      const evidence = { sourceIds: request.sourceIds ? copy(request.sourceIds) : [], evidenceQuotes: request.sourceIds ? [{ sourceId: request.sourceIds[0], quote: "lebt in Wäldern" }] : [] };
      const result = { kind, status: "proposal", approved: false, transferred: false, humanReviewRequired: true, factualGuarantee: false, binding,
        ...(kind === "review-language" ? { originalText: pageInput.initialText, correctedText: pageInput.initialText.replace('Feeler', 'Fehler'), findings: [{ kind: 'spelling', draftQuote: 'Feeler',
          start: pageInput.initialText.indexOf('Feeler'), end: pageInput.initialText.indexOf('Feeler') + 6, replacement: 'Fehler', explanation: 'Die Schreibweise lautet Fehler.' }] }
          : kind === "alt-text" ? { text: "Amsel auf einem Ast", caption: null, uncertainties: [] }
          : { sources: pageInput.context.sources.map(({ id, revision, title }) => ({ id, revision, title, url: "" })),
            ...(kind === "source-text" ? { paragraphs: [{ text: "Die Art bewohnt Wälder.", ...evidence }] }
              : { findings: [{ kind: "unclear", draftQuote: "Gespeicherter Absatz", explanation: "Diese Aussage bitte anhand der Quelle prüfen.", ...evidence }] }) }), ...values };
      Object.assign(job, { status: "completed", result }); return result;
    },
    completeLanguage(values = {}) {
      const start = languageInput.initialText.indexOf('Feeler');
      const result = { kind: 'review-language', status: 'proposal', approved: false, transferred: false, humanReviewRequired: true,
        originalText: languageInput.initialText, correctedText: languageInput.initialText.replace('Feeler', 'Fehler'),
        binding: { type: 'website-language', kind: 'review-language', pageUrl: languageInput.pageUrl, imageKey: languageInput.imageKey, observationHash: languageInput.observationHash,
          revision: 'b'.repeat(64), snapshotRevision: 'b'.repeat(64), draftSha256: 'a'.repeat(64), inputProof: 'c'.repeat(64) },
        findings: [{ kind: 'spelling', draftQuote: 'Feeler', start, end: start + 6, replacement: 'Fehler', explanation: 'Die Schreibweise lautet Fehler.' }], ...values };
      Object.assign([...jobs.values()].at(-1), { status: 'completed', result }); return result;
    },
    setCurrent(value) { current = value; }, setConfirm(value) { confirm = value; }, setBackend(value) { backend = { ...backend, ...value }; }, advance(ms) { clock += ms; },
    nativeClose() { dialogOptions.dialog.open = false; dialogOptions.afterClose(); },
  };
}

test("opening is status-only, shows the existing safe preview, and never starts a download or model", async () => {
  const h = harness({ installed: false }); await h.open();
  assert.deepEqual(h.calls.map((call) => [call.method, call.url]), [["GET", "/api/local-ai"]]);
  assert.equal(h.find("img").src, PREVIEW); assert.equal(h.find("button", "Vorschlag erstellen").disabled, true);
  assert.match(h.find("p", "Optional:").textContent, /3,4 GB/); assert.equal(h.controller.hasUnsavedChanges(), false);
  await h.controller.dispose(); assert.equal(h.body.children.length, 0); assert.equal(h.timers.size, 0);
});

test("Einrichtungsfehler zeigt die konkrete sichere Cachemeldung und bleibt für einen bewussten neuen Versuch offen", async () => {
  const h = harness({ installed: false });
  h.setBackend({ installError: "Die optionale Einrichtung wurde nicht abgeschlossen.",
    cache: { status: "failed", downloadedBytes: 0, totalBytes: 3400,
      error: "Die Bezugsquelle hat die optionale Datei nicht freigegeben (HTTP 403)." } });
  await h.open();
  assert.match(h.controller.getState().message, /HTTP 403/);
  assert.match(h.controller.getState().message, /Vorhandene Texte bleiben erhalten/);
  assert.equal(h.find("button", "Lokale Hilfe einrichten").disabled, false);
  assert.equal(h.calls.filter((call) => call.method === "POST").length, 0);
  await h.controller.dispose();
});

test("download needs explicit confirmation, reports progress and cancels only a download started here", async () => {
  const h = harness({ installed: false, confirm: false }); await h.open(); await h.click("Lokale Hilfe einrichten");
  assert.equal(h.calls.some((call) => call.url.endsWith("/download")), false);
  h.setConfirm(true); await h.click("Lokale Hilfe einrichten");
  assert.deepEqual(h.calls.find((call) => call.url.endsWith("/download")).body, { confirmed: true });
  assert.equal(h.controller.getState().ownDownload, true); h.setBackend({ cache: { status: "installing", installing: true, downloadedBytes: 1700, totalBytes: 3400 } });
  await h.tick(); assert.equal(h.find("progress").value, 50);
  await h.controller.close(); assert.equal(h.calls.filter((call) => call.url.endsWith("/cancel-download")).length, 1);
});

test("another existing download can be observed without claiming or cancelling it", async () => {
  const h = harness({ installed: false }); h.setBackend({ installing: true, busy: true }); await h.open();
  assert.equal(h.controller.getState().ownDownload, false); await h.controller.close();
  assert.equal(h.calls.some((call) => call.url.endsWith("/cancel-download")), false);
});

test("proposal is bound to the concrete image, editable, and apply only calls the unsaved-editor callback", async () => {
  const h = harness(); await h.open(); await h.click("Vorschlag erstellen"); h.complete(); await h.tick();
  assert.equal(h.controller.getState().phase, "proposal"); assert.equal(h.controller.hasUnsavedChanges(), true); assert.equal(h.applied.length, 0);
  await h.type("Von Felix ergänzter Text ohne Punkt"); await h.click("In meinen Textentwurf übernehmen");
  assert.deepEqual(h.applied, [{ text: "Von Felix ergänzter Text ohne Punkt", caption: null }]);
  assert.equal(h.controller.getState().open, false); assert.equal(h.controller.hasUnsavedChanges(), false);
  const request = h.calls.find((call) => call.url.endsWith("/suggest-alt"));
  assert.deepEqual(Object.keys(request.body).sort(), ["imageKey", "observationHash", "pageUrl", "requestId"]);
  assert.equal(h.calls.some((call) => /save|approve|transfer|squarespace/.test(call.url)), false);
});

test("coupled caption follows the human-edited proposal without applying another punctuation rule", async () => {
  const h = harness(); await h.open(); await h.click("Vorschlag erstellen");
  h.complete({ text: "Kurzer Bildtext", caption: "Kurzer Bildtext" }); await h.tick();
  await h.type("Menschlich geänderter Bildtext"); await h.click("In meinen Textentwurf übernehmen");
  assert.deepEqual(h.applied, [{ text: "Menschlich geänderter Bildtext", caption: "Menschlich geänderter Bildtext" }]);
});

test("image/main-editor drift before start, during a job and before apply never overwrites a human text", async () => {
  const before = harness(); await before.open(); before.setCurrent(false); await before.click("Vorschlag erstellen");
  assert.equal(before.calls.some((call) => call.url.endsWith("/suggest-alt")), false); assert.equal(before.controller.getState().phase, "stale");
  const during = harness(); await during.open(); await during.click("Vorschlag erstellen"); during.setCurrent(false); await during.tick();
  assert.equal(during.controller.getState().phase, "stale"); assert.equal(during.calls.filter((call) => call.url.endsWith("/cancel")).length, 1);
  const after = harness(); await after.open(); await after.click("Vorschlag erstellen"); after.complete(); await after.tick();
  after.setCurrent(false); await after.click("In meinen Textentwurf übernehmen"); assert.equal(after.applied.length, 0); assert.equal(after.controller.getState().phase, "stale");
});

test("foreign page, image, observation or already-approved output cannot enable apply", async () => {
  for (const values of [{ binding: { pageUrl: PAGE + "/other", imageKey: "image-a", revision: "observation-a" } },
    { binding: { pageUrl: PAGE, imageKey: "image-b", revision: "observation-a" } },
    { binding: { pageUrl: PAGE, imageKey: "image-a", revision: "older-observation" } }, { approved: true }, { caption: "Another story" }]) {
    const h = harness(); await h.open(); await h.click("Vorschlag erstellen"); h.complete(values); await h.tick();
    assert.equal(h.controller.getState().phase, "stale"); assert.equal(h.find("button", "In meinen Textentwurf").disabled, true); assert.equal(h.applied.length, 0);
  }
});

test("closing an edited proposal needs discard confirmation; native-close attempts reopen to protect it", async () => {
  const h = harness({ confirm: false }); await h.open(); await h.click("Vorschlag erstellen"); h.complete(); await h.tick(); await h.type("Mein bearbeiteter Vorschlag");
  assert.equal(await h.controller.close(), false); assert.equal(await h.controller.dispose(), false); assert.equal(h.controller.getState().open, true);
  h.nativeClose(); await flush(); assert.equal(h.controller.getState().open, true); assert.equal(h.controller.getState().draft, "Mein bearbeiteter Vorschlag");
  h.setConfirm(true); assert.equal(await h.controller.dispose(), true); assert.equal(h.controller.hasUnsavedChanges(), false); assert.equal(h.body.children.length, 0);
});

test("clearing an existing proposal remains an unsaved human change", async () => {
  const h = harness({ confirm: false }); await h.open(); await h.click("Vorschlag erstellen"); h.complete(); await h.tick(); await h.type("");
  assert.equal(h.controller.hasUnsavedChanges(), true); assert.equal(h.find("button", "In meinen Textentwurf").disabled, true);
  assert.equal(await h.controller.close(), false);
});

test("close cancels exactly its own live job and removes polling only after confirmed cancellation", async () => {
  const h = harness(); await h.open(); await h.click("Vorschlag erstellen");
  h.jobs.set("other-job", { jobId: "other-job", requestId: "another-request", kind: "alt-text", status: "running", approved: false, transferred: false });
  assert.equal(await h.controller.dispose(), true);
  assert.deepEqual(h.calls.filter((call) => call.url.endsWith("/cancel")).map((call) => call.url), ["/api/local-ai/jobs/job-1/cancel"]);
  assert.equal(h.jobs.get("other-job").status, "running"); assert.equal(h.timers.size, 0);
});

test("job timeout, failed, cancelled and stale responses never produce a successful proposal", async () => {
  const timeout = harness(); await timeout.open(); await timeout.click("Vorschlag erstellen"); timeout.advance(210001); await timeout.tick();
  assert.equal(timeout.controller.getState().phase, "cancelled"); assert.equal(timeout.jobs.get("job-1").status, "cancelled");
  for (const status of ["failed", "cancelled", "stale"]) {
    const h = harness(); await h.open(); await h.click("Vorschlag erstellen"); Object.assign(h.jobs.get("job-1"), { status, error: "Fixture-Ergebnis" }); await h.tick();
    assert.equal(h.find("button", "In meinen Textentwurf").disabled, true); assert.equal(h.applied.length, 0);
  }
});

test("lost start response recovers its requestId via owner status without another generate request", async () => {
  const h = harness({ fetch(call, { jobs, makeJob }) {
    if (call.url.endsWith("/suggest-alt")) { const job = makeJob(call.body.requestId); jobs.set(job.jobId, job); throw new Error("Fixture lost response"); }
  } });
  await h.open(); await h.click("Vorschlag erstellen"); assert.equal(h.controller.getState().jobId, "job-1"); assert.equal(h.controller.getState().unresolved, false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/suggest-alt")).length, 1); assert.equal(await h.controller.close(), true);
});

test("duplicate clicks cannot cross a pending image check or download confirmation", async () => {
  const bound = deferred(), h = harness(); await h.open({ isCurrent: () => bound.promise });
  h.find("button", "Vorschlag erstellen").emit("click"); h.find("button", "Vorschlag erstellen").emit("click"); await flush();
  assert.equal(h.calls.some((call) => call.url.endsWith("/suggest-alt")), false);
  bound.resolve(true); await flush(); assert.equal(h.calls.filter((call) => call.url.endsWith("/suggest-alt")).length, 1);
  const permission = deferred(), download = harness({ installed: false, confirm: () => permission.promise }); await download.open();
  download.find("button", "Lokale Hilfe einrichten").emit("click"); download.find("button", "Lokale Hilfe einrichten").emit("click"); await flush();
  assert.equal(download.confirmations.length, 1); permission.resolve(true); await flush();
  assert.equal(download.calls.filter((call) => call.url.endsWith("/download")).length, 1);
});

test("a timed-out start recovers and cancels its known owner job even if the original response arrives late", async () => {
  const response = deferred();
  const h = harness({ fetch(call, { jobs, makeJob }) {
    if (call.url.endsWith("/suggest-alt")) { const job = makeJob(call.body.requestId); jobs.set(job.jobId, job); return response.promise; }
  } });
  await h.open(); await h.click("Vorschlag erstellen"); assert.equal(await h.controller.close(), false);
  await h.tick(30000); assert.equal(h.controller.getState().jobId, "job-1");
  assert.equal(await h.controller.dispose(), true); response.resolve(copy(h.jobs.get("job-1"))); await flush();
  assert.equal(h.jobs.get("job-1").status, "cancelled"); assert.equal(h.body.children.length, 0); assert.equal(h.timers.size, 0);
});

test("a rejected confirmation does not leak an unhandled action or set up a model", async () => {
  const h = harness({ installed: false, confirm: () => Promise.reject(new Error("Confirmation closed")) });
  await h.open(); await h.click("Lokale Hilfe einrichten"); assert.equal(h.calls.some((call) => call.url.endsWith("/download")), false);
  assert.equal(h.controller.getState().phase, "error");
});

test("uncertain missing response blocks a new generation and refuses to pretend cancellation succeeded", async () => {
  const h = harness({ fetch(call) { if (call.url.endsWith("/suggest-alt")) throw new Error("No trustworthy start result"); } });
  await h.open(); await h.click("Vorschlag erstellen"); assert.equal(h.controller.getState().unresolved, true);
  await h.click("Vorschlag erstellen"); assert.equal(h.calls.filter((call) => call.url.endsWith("/suggest-alt")).length, 1);
  assert.equal(await h.controller.close(), false); assert.equal(h.controller.getState().open, true);
});

test("explicit HTTP refusal does not invent a live job or claim another download", async () => {
  const h = harness({ fetch(call) { if (call.url.endsWith("/suggest-alt")) throw Object.assign(new Error("Forbidden fixture"), { status: 403 }); } });
  await h.open(); await h.click("Vorschlag erstellen"); assert.equal(h.controller.getState().unresolved, false);
  assert.equal(await h.controller.close(), true); assert.equal(h.calls.some((call) => call.url.endsWith("/cancel")), false);
  for (const status of [409, null]) {
    const download = harness({ installed: false, fetch(call) {
      if (call.url.endsWith("/download")) throw Object.assign(new Error("Unconfirmed fixture download"), status ? { status } : {});
    } });
    await download.open(); await download.click("Lokale Hilfe einrichten"); assert.equal(download.controller.getState().ownDownload, false);
    assert.equal(await download.controller.close(), true); assert.equal(download.calls.some((call) => call.url.endsWith("/cancel-download")), false);
  }
});

test("failed apply or cancel keeps the proposal/window and does not claim an editor or job was changed", async () => {
  const h = harness({ apply() { throw new Error("Main editor drift"); } });
  await h.open(); await h.click("Vorschlag erstellen"); h.complete(); await h.tick(); await h.click("In meinen Textentwurf übernehmen");
  assert.equal(h.controller.getState().open, true); assert.equal(h.controller.hasUnsavedChanges(), true);
  const cancel = harness({ fetch(call) { if (call.url.endsWith("/cancel")) throw new Error("Cannot confirm cancel"); } });
  await cancel.open(); await cancel.click("Vorschlag erstellen"); assert.equal(await cancel.controller.close(), false); assert.equal(cancel.controller.getState().open, true);
});

test("unsafe previews are rejected using the existing site policy and human strings never become markup", async () => {
  for (const previewUrl of ["file:///C:/private.jpg", "http://127.0.0.1/private.jpg", "https://foreign.example/private.jpg", "javascript:alert(1)"]) {
    const h = harness(); await assert.rejects(h.open({ previewUrl }), /sicherer Vorschau/); assert.equal(h.calls.length, 0);
  }
  const h = harness(); await h.open({ initialText: '<img src=x onerror="malicious()">' });
  await h.click("Vorschlag erstellen"); h.complete({ text: '<script>keine HTML-Ausführung</script>', uncertainties: ["<img src=private>"] }); await h.tick();
  assert.equal(h.find("textarea").value, '<script>keine HTML-Ausführung</script>');
  assert.equal(h.nodes.some((node) => node.innerHTML), false); assert.equal(h.nodes.filter((node) => node.tag === "img").length, 1);
});

test("Pagebild benutzt denselben Dialog und nur den typisierten Startweg mit geschützter lokaler Vorschau", async () => {
  const h = harness(); await h.openPage();
  assert.equal(h.nodes.filter((node) => node.tag === 'dialog').length, 1);
  assert.deepEqual(h.calls.map((call) => call.url), ['/api/local-ai']);
  assert.match(h.find('img').src, /^\/api\/page-authoring\/images\/image-[a-f0-9-]+\?scope=[a-f0-9]{64}$/);
  assert.equal(h.find('textarea').spellcheck, true); assert.equal(h.find('textarea').lang, 'de');
  await h.click('Vorschlag erstellen');
  const start = h.calls.find((call) => call.method === 'POST');
  assert.equal(start.url, '/api/local-ai/page-authoring/suggest-alt');
  assert.deepEqual(Object.keys(start.body).sort(), ['draftId', 'expectedRevision', 'imageId', 'requestId', 'sourceScope', 'type']);
  assert.equal(start.body.imageId, 'usage-one'); assert.equal(h.applied.length, 0);
  h.completePage(); await h.tick(); await h.type('Mein geprüfter Alttext'); await h.click('In meinen Textentwurf übernehmen');
  assert.deepEqual(h.applied, [{ text: 'Mein geprüfter Alttext', caption: null }]); assert.equal(h.controller.getState().open, false);
  assert.equal(h.calls.some((call) => /save|approve|transfer/.test(call.url)), false);
});

test("Pagevorschauen verweigern fremde oder veränderte Routen vor jeder Anfrage", async () => {
  const scope = '1'.repeat(64), route = `/api/page-authoring/images/image-11111111-2222-4333-8444-555555555555?scope=${scope}`;
  for (const previewUrl of [PREVIEW, `https://same.example${route}`, `//same.example${route}`, route + '&other=1', route + '#fragment',
    route.replace(scope, '2'.repeat(64)), route.replace('/image-', '/normal-'), route.replace('/api/', '/private/'), 'file:///C:/private.jpg']) {
    const h = harness(); await assert.rejects(h.openPage('alt-text', { previewUrl }), /sichere Vorschau/); assert.equal(h.calls.length, 0);
  }
  const h = harness(); await assert.rejects(h.openPage('alt-text', { request: { type: 'page-authoring', role: 'admin' } }), /gespeicherter Artseitenauftrag/);
  assert.equal(h.calls.length, 0);
});

test("Sourcevorschlag zeigt jeden Absatz mit exakter Belegstelle und übernimmt nur den ganzen manuell angenommenen Vorschlag", async () => {
  const h = harness(); await h.openPage('source-text'); await h.click('Vorschlag erstellen');
  const start = h.calls.find((call) => call.method === 'POST');
  assert.equal(start.url, '/api/local-ai/page-authoring/suggest-text');
  assert.deepEqual(Object.keys(start.body).sort(), ['draftId', 'expectedRevision', 'expectedSourcesRevision', 'requestId', 'sectionId', 'sourceIds', 'sourceScope', 'type']);
  const result = h.completePage(); await h.tick();
  assert.ok(h.find('p', 'Die Art bewohnt Wälder.')); assert.equal(h.find('blockquote').textContent, 'lebt in Wäldern');
  assert.ok(h.find('p', 'Gebundene Artquelle')); assert.equal(h.applied.length, 0);
  assert.equal(h.find('label', 'Textvorschlag').hidden, true);
  await h.click('Als neue Absätze übernehmen');
  assert.deepEqual(h.applied, [{ proposal: result }]); assert.equal(h.controller.getState().open, false);
  assert.equal(h.calls.filter((call) => call.url.endsWith('/suggest-text')).length, 1);
});

test("Review zeigt Hinweise und Belegstellen ohne Textannahme, Korrektur oder unnötige Verwerfbestätigung", async () => {
  const h = harness(); await h.openPage('review-text'); await h.click('Vorschlag erstellen');
  assert.equal(h.calls.find((call) => call.method === 'POST').url, '/api/local-ai/page-authoring/review-text');
  h.completePage(); await h.tick();
  assert.ok(h.find('p', 'Entwurfsstelle: Gespeicherter Absatz')); assert.ok(h.find('p', 'Diese Aussage bitte anhand der Quelle prüfen.'));
  assert.equal(h.find('blockquote').textContent, 'lebt in Wäldern'); assert.equal(h.find('button', 'Als neue Absätze übernehmen').hidden, true);
  await h.click('Als neue Absätze übernehmen'); assert.deepEqual(h.applied, []); assert.equal(h.controller.hasUnsavedChanges(), false);
  assert.equal(await h.controller.close(), true); assert.equal(h.confirmations.length, 0);
  assert.equal(h.calls.some((call) => /save|approve|transfer/.test(call.url)), false);
});

test("fremde Pagebindung, fehlender Serverbeleg und falsche Quellenbelegstellen geben keinen Vorschlag zur Annahme frei", async () => {
  for (const change of [(result) => { result.binding.sourceScope = '9'.repeat(64); }, (result) => { result.binding.documentId = 'foreign'; },
    (result) => { result.binding.revision = '9'.repeat(64); }, (result) => { delete result.binding.inputProof; }, (result) => { result.binding.sectionId = 'foreign'; },
    (result) => { result.binding.sourceCatalogRevision = '9'.repeat(64); }, (result) => { result.binding.sourceIds = []; },
    (result) => { result.paragraphs[0].evidenceQuotes[0].quote = 'Diese Aussage steht nicht in der Quelle'; }]) {
    const h = harness(); await h.openPage('source-text'); await h.click('Vorschlag erstellen'); const result = h.completePage(); change(result); await h.tick();
    assert.equal(h.controller.getState().phase, 'stale'); assert.equal(h.find('button', 'Als neue Absätze übernehmen').disabled, true); assert.deepEqual(h.applied, []);
    await h.controller.dispose({ discard: true });
  }
  const image = harness(); await image.openPage(); await image.click('Vorschlag erstellen'); const result = image.completePage(); result.binding.assetId = 'image-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  await image.tick(); assert.equal(image.controller.getState().phase, 'stale'); assert.deepEqual(image.applied, []);
});

test("Pagequellen und gespeicherter Prüftext teilen die Grenze von 8000 Zeichen ohne stille Kürzung", async () => {
  const h = harness(), sourceId = `source-${'3'.repeat(64)}`;
  await assert.rejects(h.openPage('review-text', { initialText: 'T'.repeat(7990), context: { sources: [{ id: sourceId, revision: '5'.repeat(64), title: 'Quelle', text: 'Quelle mit mehr als zehn Zeichen' }] } }), /ausgewählte aktuelle Textquellen/);
  assert.equal(h.calls.length, 0);
});

test("Pageaufträge behalten vorhandene Recovery und brechen nur ihren eigenen Auftrag ab", async () => {
  const h = harness({ fetch(call, { jobs, makeJob }) {
    if (call.url.endsWith('/page-authoring/suggest-text')) { const job = makeJob(call.body.requestId, 'running', 'source-text'); jobs.set(job.jobId, job); throw new Error('lost start reply'); }
  } });
  await h.openPage('source-text'); await h.click('Vorschlag erstellen');
  assert.equal(h.controller.getState().jobId, 'job-1'); assert.equal(h.controller.getState().unresolved, false);
  h.jobs.set('foreign-job', { jobId: 'foreign-job', requestId: 'foreign', kind: 'source-text', status: 'running', approved: false, transferred: false });
  assert.equal(await h.controller.dispose(), true);
  assert.deepEqual(h.calls.filter((call) => call.url.endsWith('/cancel')).map((call) => call.url), ['/api/local-ai/jobs/job-1/cancel']);
  assert.equal(h.jobs.get('foreign-job').status, 'running'); assert.equal(h.calls.filter((call) => call.url.endsWith('/suggest-text')).length, 1);
});

test("geänderte Pageeingaben stoppen laufende Vorschläge und nachträgliche Annahme", async () => {
  const running = harness(); await running.openPage('source-text'); await running.click('Vorschlag erstellen'); running.setCurrent(false); await running.tick();
  assert.equal(running.controller.getState().phase, 'stale'); assert.equal(running.jobs.get('job-1').status, 'cancelled'); assert.deepEqual(running.applied, []);
  const proposal = harness(); await proposal.openPage('source-text'); await proposal.click('Vorschlag erstellen'); proposal.completePage(); await proposal.tick();
  proposal.setCurrent(false); await proposal.click('Als neue Absätze übernehmen'); assert.deepEqual(proposal.applied, []); assert.equal(proposal.controller.getState().open, true);
});

test('Website-Sprachprüfung sendet den ungespeicherten String ohne Bildabruf und übernimmt nur bewusst bearbeiteten Vorschlag', async () => {
  const h = harness(); await h.openLanguage();
  assert.deepEqual(h.calls.map((call) => call.url), ['/api/local-ai']); assert.equal(h.find('img').src, undefined);
  await h.click('Vorschlag erstellen'); const start = h.calls.find((call) => call.method === 'POST');
  assert.equal(start.url, '/api/local-ai/review-language');
  assert.deepEqual(Object.keys(start.body).sort(), ['draftText', 'imageKey', 'observationHash', 'pageUrl', 'requestId', 'type']);
  assert.equal(start.body.type, 'website-language'); assert.equal(start.body.draftText, 'Das ist ein Feeler.'); assert.equal(h.applied.length, 0);
  h.completeLanguage(); await h.tick(); assert.equal(h.find('textarea').value, 'Das ist ein Fehler.'); assert.equal(h.find('textarea').readOnly, false);
  assert.ok(h.find('p', 'Die Schreibweise lautet Fehler.')); assert.ok(h.find('p', 'Bis zu 8 Hinweise.'));
  await h.type('Mein bewusst weiterbearbeiteter Text'); await h.click('Korrekturen übernehmen');
  assert.deepEqual(h.applied, [{ text: 'Mein bewusst weiterbearbeiteter Text' }]); assert.equal(h.controller.getState().open, false);
  assert.equal(h.calls.some((call) => /image-.*scope|suggest-alt|save|approve|transfer/.test(call.url)), false);
});

test('Page-Sprachprüfung ist quellenfrei und der exakte Korrekturtext bleibt bis zur Strukturannahme readonly', async () => {
  const h = harness(); await h.openPage('review-language'); await h.click('Vorschlag erstellen');
  const start = h.calls.find((call) => call.method === 'POST'); assert.equal(start.url, '/api/local-ai/page-authoring/review-language');
  assert.deepEqual(Object.keys(start.body).sort(), ['draftId', 'expectedRevision', 'requestId', 'sectionId', 'sourceScope', 'type']);
  const result = h.completePage(); await h.tick(); assert.equal(h.find('textarea').readOnly, true); assert.equal(h.find('textarea').value, result.correctedText);
  assert.ok(h.find('p', 'Korrekturen übernehmen und im Abschnitt weiterbearbeiten'));
  await h.type('Flacher fremder Ersatz'); assert.equal(h.find('textarea').value, result.correctedText);
  await h.click('Korrekturen übernehmen'); assert.deepEqual(h.applied, [{ proposal: result }]);
  assert.equal(h.calls.some((call) => /sources|save|approve|transfer/.test(call.url)), false);
});

test('falsche Originale, erfundener Gesamttext, überlappende oder zeilenübergreifende Sprachbefunde werden gesperrt', async () => {
  for (const change of [(result) => { result.originalText = 'Fremdes Original'; }, (result) => { result.correctedText = 'Nicht aus den Befunden berechnet'; },
    (result) => { result.findings[0].draftQuote = 'Fremdes Zitat'; }, (result) => { result.findings.push(copy(result.findings[0])); },
    (result) => { result.findings[0].replacement = 'Fehler\nZusatz'; }, (result) => { result.findings[0].draftQuote = 'Feeler\r'; },
    (result) => { result.findings = Array.from({ length: 9 }, () => copy(result.findings[0])); },
    (result) => { result.binding.imageKey = 'foreign-image'; }, (result) => { result.binding.observationHash = 'f'.repeat(64); },
    (result) => { delete result.binding.inputProof; }, (result) => { result.binding.revision = 'f'.repeat(64); }]) {
    const h = harness(); await h.openLanguage(); await h.click('Vorschlag erstellen'); const result = h.completeLanguage(); change(result); await h.tick();
    assert.equal(h.controller.getState().phase, 'stale'); assert.equal(h.find('button', 'Korrekturen übernehmen').disabled, true); assert.deepEqual(h.applied, []);
    await h.controller.dispose({ discard: true });
  }
});

test('Sprachoffsets folgen UTF16 und dürfen weder Surrogate noch Page-Textsegmente teilen', async () => {
  const valid = harness(); await valid.openLanguage({ initialText: '😀 Feeler' }); await valid.click('Vorschlag erstellen'); const result = valid.completeLanguage(); await valid.tick();
  assert.equal(result.findings[0].start, 3); await valid.click('Korrekturen übernehmen'); assert.deepEqual(valid.applied, [{ text: '😀 Fehler' }]);
  const split = harness(); await split.openLanguage({ initialText: '😀 Feeler' }); await split.click('Vorschlag erstellen');
  split.completeLanguage({ correctedText: '\uD83Dx Feeler', findings: [{ kind: 'spelling', start: 1, end: 2, draftQuote: '\uDE00', replacement: 'x', explanation: 'Ungültig geteiltes Zeichen' }] });
  await split.tick(); assert.equal(split.controller.getState().phase, 'stale'); assert.deepEqual(split.applied, []);
  const page = harness(); await page.openPage('review-language', { initialText: 'Feeler', context: { languageSegments: [{ start: 0, end: 3 }, { start: 3, end: 6 }] } });
  await page.click('Vorschlag erstellen'); page.completePage(); await page.tick(); assert.equal(page.controller.getState().phase, 'stale'); assert.deepEqual(page.applied, []);
});

test('spätere eigene Websiteeingabe sperrt Sprachannahme und ein leerer Befund ist keine bestätigte Fehlerfreiheit', async () => {
  const h = harness(); await h.openLanguage(); await h.click('Vorschlag erstellen'); h.completeLanguage(); await h.tick(); h.setCurrent(false);
  await h.click('Korrekturen übernehmen'); assert.deepEqual(h.applied, []); assert.equal(h.controller.getState().open, true);
  const empty = harness(); await empty.openLanguage(); await empty.click('Vorschlag erstellen'); empty.completeLanguage({ findings: [], correctedText: 'Das ist ein Feeler.' }); await empty.tick();
  assert.ok(empty.find('p', 'keine Fehlerfreiheitsgarantie')); assert.equal(empty.find('button', 'Korrekturen übernehmen').disabled, true);
  assert.equal(empty.controller.hasUnsavedChanges(), false); assert.equal(await empty.controller.close(), true); assert.equal(empty.confirmations.length, 0);
});

test('Website-Sprachprüfung trennt Beobachtung von Bestandsrevision und prüft die volle Bindung erneut vor Annahme', async () => {
  const captured = 'b'.repeat(64), seen = []; let actual = captured;
  const h = harness(); await h.openLanguage({ isCurrent(binding) { seen.push(copy(binding)); return actual === captured && (!binding.revision || binding.revision === captured); } });
  await h.click('Vorschlag erstellen'); const result = h.completeLanguage(); await h.tick();
  assert.notEqual(result.binding.revision, result.binding.observationHash); assert.equal(result.binding.revision, result.binding.snapshotRevision);
  assert.equal(h.controller.getState().phase, 'proposal'); assert.ok(seen.some((binding) => binding.revision === captured && binding.inputProof));
  actual = 'd'.repeat(64); await h.click('Korrekturen übernehmen'); assert.deepEqual(h.applied, []); assert.equal(h.controller.getState().phase, 'stale');
});
