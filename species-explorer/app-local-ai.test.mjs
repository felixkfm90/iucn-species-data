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
  const makeJob = (requestId, status = "running") => ({ jobId: `job-${jobs.size + 1}`, requestId, status, kind: "alt-text", approved: false, transferred: false, result: null, error: "" });
  controller = api.createLocalAiController({ documentRef, requestId: () => `request-${++sequence}`, now: () => clock,
    createDialogController(config) { dialogOptions = config; return { open() { config.dialog.open = true; }, isOpen() { return config.dialog.open; },
      close() { if (config.beforeClose?.() === false) return false; config.dialog.open = false; config.afterClose?.(); return true; }, destroy() {} }; },
    async confirmAction(value) { confirmations.push(value); return typeof confirm === "function" ? confirm(value) : confirm; },
    async fetchJson(url, request) {
      const call = { url, method: request?.method || "GET", body: request?.body ? JSON.parse(request.body) : null }; calls.push(call);
      const tools = { makeJob, jobs, get backend() { return backend; }, setBackend: (value) => { backend = value; } };
      if (options.fetch) { const result = await options.fetch(call, tools); if (result !== undefined) return result; }
      if (url === "/api/local-ai") return copy({ ...backend, jobs: [...jobs.values()] });
      if (url.endsWith("/suggest-alt")) { const job = makeJob(call.body.requestId); jobs.set(job.jobId, job); return copy(job); }
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
  return { api, controller, body, nodes, timers, calls, confirmations, jobs, applied, find, input,
    async open(overrides) { return controller.openForImage({ ...input, ...overrides }); },
    async click(label) { const node = find("button", label); assert.ok(node, label); node.emit("click"); await flush(); },
    async tick(delay = 1200) { const item = [...timers.entries()].find(([, timer]) => timer.delay === delay); assert.ok(item, `Timer ${delay}`);
      timers.delete(item[0]); clock += delay; item[1].fn(); await flush(); },
    async type(value) { const node = find("textarea"); node.value = value; node.emit("input"); await flush(); },
    complete(values = {}) { const job = [...jobs.values()].at(-1); Object.assign(job, { status: "completed", result: { kind: "alt-text", status: "proposal", approved: false,
      transferred: false, humanReviewRequired: true, text: "Säulen der Akropolis auf einem felsigen Hügel", caption: null, uncertainties: [],
      binding: { pageUrl: PAGE, imageKey: "image-a", revision: "observation-a" }, ...values } }); return job; },
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
