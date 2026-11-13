import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("./public/app-page-authoring.js", import.meta.url), "utf8");
const pageAiSource = await fs.readFile(new URL("./public/app-page-ai.js", import.meta.url), "utf8");
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.handlers = new Map(); this.attributes = new Map(); this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.open = false; this.scrollTop = 0; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set innerHTML(_value) { throw new Error("Editor values must be rendered with safe DOM nodes."); }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); if (key === "src") this.src = ""; }
  addEventListener(type, handler) { const handlers = this.handlers.get(type) || []; handlers.push(handler); this.handlers.set(type, handlers); }
  querySelectorAll(selector) {
    return all(this).filter((node) => selector.startsWith("[")
      ? (() => { const match = selector.match(/^\[([^=]+)="([^"]*)"\]$/); return match && node.getAttribute(match[1]) === match[2]; })()
      : node.tagName.toLowerCase() === selector);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  async emit(type, options = {}) { if (this.disabled && !options.force) return; for (const handler of this.handlers.get(type) || []) await handler({ target: options.target || this, preventDefault() {}, ...options }); }
}
const all = (root) => root.children.flatMap((child) => [child, ...all(child)]);
const visible = (root) => root.hidden ? "" : root._text + root.children.map(visible).join("");
const clone = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function settle() { for (let index = 0; index < 7; index++) await new Promise((resolve) => setImmediate(resolve)); }
const SCOPE = "fixture-source-scope", ID = "page-fixture", BASE = `/api/page-authoring/drafts/${ID}`;
function draftView() {
  const editable = { templateId: "fn-compact-20261031", slug: "fixture-owl", parentPath: "/wildlife/heimische-tierwelt", title: "Testkauz <script>safe text</script>",
    introduction: [{ type: "heading", level: 6, text: "Eine erhaltene Zwischenüberschrift" }, { type: "paragraph", text: "Eigene Einleitung" }],
    sections: [{ id: "general", title: "Allgemein", requested: false, blocks: [], sources: [] },
      { id: "appearance", title: "Aussehen", requested: true, blocks: [{ type: "numbered-list", items: ["Erster Punkt", "Zweiter Punkt"] }],
        sources: [{ id: "source-local", label: "Vollständiger Beleg", url: "https://example.org/source", sha256: "a".repeat(64) }] },
      { id: "habitat", title: "Lebensraum", requested: true, blocks: [], sources: [] },
      { id: "map", title: "Verbreitungskarte", requested: false, blocks: [], sources: [] }],
    images: [{ id: "position-first", assetId: "image-first", alt: "Testkauz im Baum", caption: "Sichtbare Beschriftung", decorative: false }],
    sources: [{ id: "document-source", label: "Seitenquelle", sha256: "b".repeat(64) }], galleryRequested: true };
  return { sourceScope: SCOPE, source: "shared-project", connection: "online", editable,
    draft: { id: ID, revision: "revision-1", document: { ...clone(editable), emptyConfirmations: {},
      species: { commonName: "Testkauz", privateOriginal: "DO_NOT_RENDER_PRIVATE" },
      sections: editable.sections.map((item) => ({ ...clone(item), kind: item.id === "general" ? "general-module" : item.id === "map" ? "map-module" : "editorial" })) } },
    approval: null, cms: null, published: false, externalPublication: "not-performed", sync: { state: "synced", bindingRevision: "binding-1", localPending: false,
      localConflict: false, coveredLocalRevision: "revision-1", queuedLocalRevision: null }, externalEvidence: null };
}
function readerComparison(view = draftView()) {
  return { sourceScope: SCOPE, draftId: view.draft.id, token: "reader-token-fixture", expiresAt: new Date(Date.now() + 600000).toISOString(),
    readerApproved: false, externalPublication: "not-performed",
    beforeEditorial: { sections: [{ id: "old-section-private-id", title: "Bisheriger Abschnitt", text: "Bisheriger Arttext", intentionallyEmpty: false }],
      gallery: [{ id: "old-image-private-id", alt: "Bisheriger Alternativtext", caption: "Bisherige Bildunterschrift", order: 0 }] },
    proposedEditorial: { title: view.editable.title, introduction: clone(view.editable.introduction), sources: clone(view.editable.sources),
      sections: view.draft.document.sections.map(section => ({ ...clone(section), emptyDecision: null })), galleryRequested: view.editable.galleryRequested,
      gallery: view.editable.images.map((image, order) => ({ ...clone(image), order, asset: { id: image.assetId, sha256: "d".repeat(64), privateNote: "PRIVATE_MEDIA_NOT_FOR_DISPLAY" } })),
      sourceBindings: { page: { contentHash: "c".repeat(64) }, privateNote: "PRIVATE_SOURCE_NOT_FOR_DISPLAY" } } };
}
function fixture(options = {}) {
  const documentRef = { createElement: (tag) => new Element(tag), body: new Element("body") }, calls = [], confirmations = [], releases = [], aiOpened = [];
  const inline = [];
  const state = { workspace: "shared-project", workspaceEpoch: 1, selectedId: "fixture-owl", editMode: true,
    workspaceStatus: { sourceScope: SCOPE, connection: "online", permissions: { canRead: true, canEdit: true, canCreate: true, canApprove: true } } };
  const species = { id: "fixture-owl", slug: "fixture-owl", germanName: "Testkauz", sourceScope: SCOPE, source: "shared-project" };
  let view = options.view ? clone(options.view) : draftView(), serial = 0, loaded = false;
  const info = { available: true, sourceScope: SCOPE, permissions: clone(state.workspaceStatus.permissions), templates: [{ id: "fn-compact-20261031", name: "Kompakte FN-Artseite", sections: view.editable.sections }] };
  if (Object.hasOwn(options, "cmsAvailable")) info.cmsAvailable = options.cmsAvailable;
  const context = { URLSearchParams,
    ...(options.inline ? { SpeciesExplorerLanguageCheck: { createInlineLanguageCheck(input) {
      const entry = { ...input, disposed: false }; inline.push(entry);
      return { refresh() {}, dispose() { entry.disposed = true; } };
    } } } : {}) }; if (options.ai) vm.runInNewContext(pageAiSource, context); vm.runInNewContext(source, context);
  const controller = context.SpeciesExplorerPageAuthoring.createPageAuthoringController({ state, documentRef,
    reviewLanguage: options.reviewLanguage, createId: () => `ui-${++serial}`, releaseMediaWithin: (node) => { releases.push(node); for (const image of node.querySelectorAll("img")) image.removeAttribute("src"); }, encodeFile: options.encodeFile || (async () => "YWJj"),
    ...(options.ai ? { openAiSuggestion: async (input) => { aiOpened.push(input); return options.openAi ? options.openAi(input) : true; } } : {}),
    confirmAction: async (input) => { confirmations.push(input); return options.confirm ? options.confirm(input) : true; },
    fetchJson: async (url, request = {}) => {
      const body = request.body ? JSON.parse(request.body) : null, call = { url, method: request.method || "GET", body }; calls.push(call);
      const custom = options.request ? await options.request(call, { get view() { return view; }, set view(value) { view = value; }, info }) : undefined;
      if (custom !== undefined) return custom;
      if (url === "/api/page-authoring") return clone(info);
      if (url === "/api/page-authoring/drafts") return { sourceScope: SCOPE, drafts: options.noDraft || options.remote ? [] : [clone(view)], remoteDrafts: options.remote ? [{ draftId: ID, title: "Gemeinsamer Testkauz", slug: species.slug }] : [] };
      if (url === "/api/page-authoring/drafts" && call.method === "POST") throw new Error("Handled above by creation test");
      if (url.includes("/metadata?")) return { sourceScope: SCOPE, image: { id: decodeURIComponent(url.split('/images/')[1].split('/')[0]), localAvailable: loaded || options.localImage === true } };
      if (url.endsWith("/download")) { loaded = true; return { sourceScope: SCOPE, image: { id: decodeURIComponent(url.split('/images/')[1].split('/')[0]), localAvailable: true } }; }
      if (url === BASE) return options.remote ? { sourceScope: SCOPE, draft: null, remoteOnly: {
        object: { revision: "shared-revision-1" }, evidence: { trusted: options.unconfirmed !== true }, data: { pageId: ID, document: { slug: species.slug } },
      } } : clone(view);
      if (url.endsWith("/save")) {
        view.editable = clone(body.document); view.draft.document = { ...view.draft.document, ...clone(body.document), sections: body.document.sections.map((item) => ({ ...clone(item), kind: item.id === "general" ? "general-module" : item.id === "map" ? "map-module" : "editorial" })) };
        view.draft.revision = `revision-${++serial}`; view.approval = null; return clone(view);
      }
      if (url.endsWith("/confirm-empty")) { view.draft.revision = `revision-${++serial}`; view.draft.document.emptyConfirmations[body.sectionId] = { confirmedAt: "2026-11-01" }; return clone(view); }
      if (url.endsWith("/preview")) return { ...clone(view), html: "<!doctype html><p>Gesicherte Vorschau</p>", artifact: { id: "preview-fixture", kind: "preview", draftId: view.draft.id, revision: view.draft.revision },
        report: { reportHash: "report-fixture", revision: view.draft.revision, technicalReady: true, findings: options.missingAlt ? [{ code: "alt_missing", id: "position-first", message: "Alternativtext fehlt", blocking: false }] : [] } };
      if (url.endsWith("/approve")) { view.approval = { id: "approval-fixture", kind: "approval", draftId: view.draft.id, revision: view.draft.revision, payload: { reportHash: "report-fixture" } }; return clone(view); }
      if (url.endsWith("/reader-preview")) return readerComparison(view);
      if (url.endsWith("/reader-adopt")) return { sourceScope: SCOPE, draftId: view.draft.id, queued: true, changeId: "adopted-change-fixture", speciesId: "fixture-owl", readerApproved: false, externalPublication: "not-performed" };
      if (url.endsWith("/refresh")) return clone(view);
      if (url.endsWith("/sync")) { view.sync.state = "synced"; view.sync.coveredLocalRevision = view.draft.revision; view.sync.queuedLocalRevision = null; view.sync.localPending = false; view.sync.localConflict = false; return clone(view); }
      throw new Error(`Unexpected fixture API request: ${url}`);
    },
  });
  const dialog = documentRef.body.children[0], body = all(dialog).find((node) => node.className === "page-authoring-body");
  const button = (label) => all(dialog).find((node) => node.tagName === "BUTTON" && node.textContent === label);
  const input = (label) => all(dialog).find((node) => node.getAttribute("aria-label") === label);
  return { state, species, info, controller, calls, confirmations, dialog, body, button, input, releases, aiOpened, inline, view: () => view,
    async click(label) { const node = button(label); assert.ok(node, `Expected button ${label}`); await node.emit("click"); await settle(); },
    async type(label, value) { const node = input(label); assert.ok(node, `Expected input ${label}`); node.value = value; await node.emit("input"); },
    async check(label, checked = true) { const node = input(label); assert.ok(node, `Expected checkbox ${label}`); node.checked = checked; await node.emit("change"); },
  };
}

const CMS_CREATE = "Unveröffentlicht in Squarespace anlegen";
const CMS_RECHECK = "Entwurf in Squarespace prüfen";
const cmsPosts = f => f.calls.filter(call => call.method === "POST" && /\/(prepare-cms-plan|begin-cms-attempt|create-unpublished-page)$/.test(call.url));
test("Seitenkonflikt zeigt die beiden Texte und übernimmt eine entschiedene gemeinsame Fassung erst nach Bestätigung", async () => {
  const view = draftView(); view.sync.state = "conflict"; view.sync.localConflict = true;
  let queueOpen = true, consent = false;
  const label = "Gemeinsame Fassung als neuen lokalen Entwurf übernehmen";
  const server = { ...clone(view.draft.document), title: "Gemeinsamer Testtext",
    introduction: [{ type: "paragraph", text: "Text aus dem anderen Profil" }] };
  const f = fixture({ view, confirm: () => consent, request(call, local) {
    if (call.url.endsWith("/conflict-preview")) return { sourceScope: SCOPE, draftId: ID, localRevision: view.draft.revision,
      bindingRevision: view.sync.bindingRevision, serverRevision: "server-revision", serverDataHash: "a".repeat(64),
      localDocument: view.draft.document, serverDocument: server, queueOpen };
    if (call.url.endsWith("/conflict-adopt")) {
      const next = draftView(); next.draft.document = clone(server); next.editable.title = server.title;
      next.draft.revision = "new-local-version"; local.view = next; return clone(next);
    }
  } });
  await f.controller.open(f.species); await f.click("Seitenfassungen vergleichen");
  assert.match(visible(f.body), /Eigene gespeicherte Fassung.*Eigene Einleitung/s);
  assert.match(visible(f.body), /Aktuelle gemeinsame Fassung.*Text aus dem anderen Profil/s);
  assert.match(visible(f.body), /Bitte den offenen Konflikt zuerst/); assert.equal(f.button(label), undefined);
  queueOpen = false; await f.click("Seitenfassungen vergleichen");
  await f.click(label); assert.equal(f.calls.filter(call => call.url.endsWith("/conflict-adopt")).length, 0);
  consent = true; await f.click(label);
  const action = f.calls.find(call => call.url.endsWith("/conflict-adopt"));
  assert.deepEqual({ ...action.body, mutationId: null }, { sourceScope: SCOPE, draftId: ID, expectedRevision: view.draft.revision,
    expectedBindingRevision: view.sync.bindingRevision, serverRevision: "server-revision", serverDataHash: "a".repeat(64), confirmed: true, mutationId: null });
  assert.equal(f.input("Seitentitel").value, server.title); assert.equal(f.button(label), undefined);
  assert.equal(cmsPosts(f).length, 0); assert.equal(f.calls.some(call => call.url.endsWith("/sync")), false);
});
function approvedCmsView(status = null) {
  const view = draftView(); view.approval = { id: "approval-fixture", revision: view.draft.revision, kind: "approval" };
  if (status) view.cms = { id: "attempt-fixture", draftId: ID, planId: "plan-fixture", status,
    matchesCurrentRevision: true, stateRevision: "a".repeat(64), revision: view.draft.revision };
  return view;
}
function cmsFixture(options = {}) {
  return fixture({ ...options, cmsAvailable: Object.hasOwn(options, "cmsAvailable") ? options.cmsAvailable : true,
    view: options.view || approvedCmsView(),
    async request(call, local) {
      const result = options.request ? await options.request(call, local) : undefined; if (result !== undefined) return result;
      if (call.url.endsWith("/prepare-cms-plan")) return { ...clone(local.view), artifact: {
        id: "plan-fixture", kind: "cms-plan", draftId: ID, revision: local.view.draft.revision,
        payload: { privatePlanProof: "PRIVATE_PLAN_MUST_NOT_RENDER" } } };
      if (call.url.endsWith("/begin-cms-attempt")) {
        local.view.cms = approvedCmsView("prepared").cms; return clone(local.view);
      }
      if (call.url.endsWith("/create-unpublished-page")) {
        local.view.cms = { ...approvedCmsView("saved-unpublished").cms, status: options.resultStatus || "saved-unpublished" };
        return clone(local.view);
      }
    },
  });
}

function recheckFixture(options = {}) {
  const view = options.view || approvedCmsView("dispatched");
  if (!options.view) view.cms.canRecheckSave = true;
  const f = cmsFixture({ ...options, view });
  Object.assign(f.state.workspaceStatus, { readOnlySession: false, user: { id: "fixture-publisher", role: "publisher", version: 1 } });
  return f;
}

function confirmedRecheck(view) {
  const next = clone(view);
  Object.assign(next.cms, { status: "saved-unpublished", stateRevision: "b".repeat(64), canRecheckSave: false,
    receipt: { schemaVersion: 2, status: "saved-unpublished", attemptId: next.cms.id } });
  return next;
}

test("the CMS readback checks the exact saved attempt and only sends the dedicated request", async () => {
  const f = recheckFixture({ request(call, local) {
    if (call.url.endsWith("/recheck-squarespace-save")) return confirmedRecheck(local.view);
  } });
  await f.controller.open(f.species);
  const section = f.body.querySelector('[data-editor-group="Website-Vorbereitung"]');
  assert.ok(all(section).includes(f.button(CMS_RECHECK)));
  assert.equal(f.button(CMS_RECHECK).disabled, false);
  await f.click(CMS_RECHECK);
  assert.deepEqual(f.calls.filter(call => call.method === "POST"), [{
    url: `${BASE}/recheck-squarespace-save`, method: "POST", body: {
      sourceScope: SCOPE, draftId: ID, attemptId: "attempt-fixture", expectedStateRevision: "a".repeat(64),
    },
  }]);
  assert.match(visible(f.dialog), /Gespeicherter Squarespace-Entwurf bestätigt/);
  assert.equal(f.button(CMS_RECHECK), undefined);
  assert.equal(f.button(CMS_CREATE).disabled, true);
});

test("CMS readback requires the backend capability, an online write context and saved inputs", async () => {
  const noCapability = cmsFixture({ view: approvedCmsView("dispatched") });
  await noCapability.controller.open(noCapability.species);
  assert.equal(noCapability.button(CMS_RECHECK), undefined);
  for (const change of [f => { f.state.workspaceStatus.connection = "offline"; },
    f => { f.state.workspaceStatus.readOnlySession = true; }, f => { f.state.workspaceStatus.permissions.canApprove = false; },
    f => { f.state.editMode = false; }, f => f.type("Seitentitel", "Noch nicht gespeicherter Titel")]) {
    const f = recheckFixture(); await f.controller.open(f.species);
    const button = f.button(CMS_RECHECK);
    assert.ok(button);
    await change(f); f.controller.stateChanged();
    const currentButton = f.button(CMS_RECHECK);
    assert.equal(currentButton.disabled, true);
    await button.emit("click", { force: true });
    if (currentButton !== button) await currentButton.emit("click", { force: true });
    assert.equal(f.calls.some(call => call.method === "POST"), false);
  }
});

test("failed and stale Squarespace readbacks cannot report confirmation or start another operation", async () => {
  for (const mode of ["not-confirmed", "attempt-changed", "scope-changed", "offline", "person-version-changed"]) {
    const waiting = deferred(); let response;
    const f = recheckFixture({ request(call, local) {
      if (!call.url.endsWith("/recheck-squarespace-save")) return;
      response = confirmedRecheck(local.view);
      return waiting.promise;
    } });
    await f.controller.open(f.species);
    const task = f.click(CMS_RECHECK); await settle(); assert.ok(response);
    if (mode === "not-confirmed") waiting.reject(Object.assign(new Error("private CMS detail"), { code: "cms_recheck_unconfirmed" }));
    else {
      if (mode === "attempt-changed") response.cms.id = "another-attempt";
      if (mode === "scope-changed") f.state.workspaceStatus.sourceScope = "another-person-scope";
      if (mode === "offline") f.state.workspaceStatus.connection = "offline";
      if (mode === "person-version-changed") f.state.workspaceStatus.user.version++;
      f.controller.stateChanged(); waiting.resolve(response);
    }
    await task;
    assert.equal(f.calls.filter(call => call.method === "POST").length, 1);
    assert.doesNotMatch(visible(f.dialog), /Gespeicherter Squarespace-Entwurf bestätigt|gespeichert und erneut geprüft|private CMS detail/);
    if (mode === "not-confirmed") {
      assert.match(visible(f.dialog), /konnte noch nicht bestätigt werden/);
      assert.equal(f.button(CMS_RECHECK).disabled, false);
    }
  }
});

test('reopening a CMS draft retains its open state and distinguishes historical receipts from full readback',async()=>{
  const pending=cmsFixture({view:approvedCmsView('dispatched')});await pending.controller.open(pending.species);
  assert.match(visible(pending.dialog),/Übernahme begonnen · Ausgang noch ungeklärt/);assert.equal(pending.button(CMS_CREATE).disabled,true);
  const old=cmsFixture({view:approvedCmsView('saved-unpublished')});await old.controller.open(old.species);
  assert.match(visible(old.dialog),/Historischer Speicherbeleg/);assert.doesNotMatch(visible(old.dialog),/gespeichert und erneut geprüft/);
  const current=approvedCmsView('saved-unpublished');current.cms.receipt={schemaVersion:2};
  const saved=cmsFixture({view:current});await saved.controller.open(saved.species);
  assert.match(visible(saved.dialog),/gespeichert und erneut geprüft/);assert.equal(cmsPosts(saved).length,0);
});

test("CMS creation is offered only from the session's strict capability and remains inside Website-Vorbereitung", async () => {
  for (const cmsAvailable of [undefined, false, "true", 1]) {
    const view = approvedCmsView(); view.cmsAvailable = true;
    const f = cmsFixture({ cmsAvailable, view }); await f.controller.open(f.species);
    assert.equal(f.button(CMS_CREATE), undefined); assert.equal(f.button("CMS-Plan vorbereiten").disabled, true);
    await f.click("CMS-Plan vorbereiten"); assert.equal(cmsPosts(f).length, 0);
  }
  const f = cmsFixture(); await f.controller.open(f.species);
  const section = f.body.querySelector('[data-editor-group="Website-Vorbereitung"]'); assert.ok(section);
  assert.ok(all(section).includes(f.button(CMS_CREATE))); assert.equal(f.button(CMS_CREATE).disabled, false);
  assert.equal(cmsPosts(f).length, 0);
});

test("one explicit CMS click prepares the bound plan and attempt, then sends only persisted execution IDs", async () => {
  const f = cmsFixture(); await f.controller.open(f.species); await f.click(CMS_CREATE);
  const calls = cmsPosts(f);
  assert.deepEqual(calls.map(call => call.url), [`${BASE}/prepare-cms-plan`, `${BASE}/begin-cms-attempt`, `${BASE}/create-unpublished-page`]);
  for (const call of calls.slice(0, 2)) {
    assert.equal(call.body.sourceScope, SCOPE); assert.equal(call.body.draftId, ID); assert.equal(call.body.expectedRevision, "revision-1");
    assert.match(call.body.mutationId, /^ui-[0-9]+$/);
  }
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["approvalId", "draftId", "expectedRevision", "mutationId", "sourceScope"]);
  assert.equal(calls[0].body.approvalId, "approval-fixture");
  assert.deepEqual(Object.keys(calls[1].body).sort(), ["draftId", "expectedRevision", "mutationId", "planId", "sourceScope"]);
  assert.equal(calls[1].body.planId, "plan-fixture");
  assert.deepEqual(calls[2].body, { sourceScope: SCOPE, draftId: ID, attemptId: "attempt-fixture", expectedStateRevision: "a".repeat(64) });
  assert.equal(f.calls.filter(call => call.method === "POST").length, 3);
  assert.equal(f.calls.some(call => /\/(?:approve|sync|save|reader-adopt|record-cms-outcome|publish)$/.test(call.url)), false);
  assert.match(visible(f.dialog), /Unveröffentlichter Squarespace-Entwurf gespeichert und erneut geprüft/);
  assert.match(visible(f.dialog), /Veröffentlichung bleibt ein eigener Schritt/);
  assert.doesNotMatch(visible(f.dialog), /PRIVATE_PLAN_MUST_NOT_RENDER/);
  assert.equal(f.controller.hasUnsavedChanges(), false); assert.equal(f.button(CMS_CREATE).disabled, true);
});

test("a genuinely prepared CMS attempt resumes by ID without creating another plan or attempt", async () => {
  const f = cmsFixture({ view: approvedCmsView("prepared") }); await f.controller.open(f.species); await f.click(CMS_CREATE);
  assert.deepEqual(cmsPosts(f).map(call => call.url), [`${BASE}/create-unpublished-page`]);
  assert.deepEqual(cmsPosts(f)[0].body, { sourceScope: SCOPE, draftId: ID, attemptId: "attempt-fixture", expectedStateRevision: "a".repeat(64) });
});

test("a stale undispatched CMS attempt can be replaced only with the server's permission and a fresh state revision", async () => {
  for (const unchangedState of [false, true]) {
    const view = approvedCmsView("prepared");
    const oldStateRevision = "b".repeat(64);
    Object.assign(view.cms, { revision: "previous-revision", planId: "previous-plan", stateRevision: oldStateRevision,
      matchesCurrentRevision: false, canReplacePrepared: true });
    const f = cmsFixture({ view, request(call, local) {
      if (!unchangedState || !call.url.endsWith("/begin-cms-attempt")) return;
      return { ...clone(local.view), cms: { ...approvedCmsView("prepared").cms, stateRevision: oldStateRevision } };
    } });
    await f.controller.open(f.species);
    assert.equal(f.button(CMS_CREATE).disabled, false);
    assert.match(visible(f.dialog), /Die aktuelle Fassung kann den vorbereiteten Auftrag ersetzen/);
    await f.click(CMS_CREATE);
    const posts = cmsPosts(f);
    assert.deepEqual(posts.slice(0, 2).map(call => call.url), [`${BASE}/prepare-cms-plan`, `${BASE}/begin-cms-attempt`]);
    if (unchangedState) {
      assert.equal(posts.length, 2);
      assert.match(visible(f.dialog), /Der Schritt wurde nicht bestätigt/);
    } else {
      assert.equal(posts.length, 3);
      assert.deepEqual(posts[2].body, { sourceScope: SCOPE, draftId: ID, attemptId: "attempt-fixture", expectedStateRevision: "a".repeat(64) });
    }
  }
});

test("dispatched, completed, uncertain, failed and stale CMS attempts cannot be executed again", async () => {
  for (const status of ["dispatched", "saved-unpublished", "uncertain", "failed", "stale-prepared"]) {
    const view = approvedCmsView(status === "stale-prepared" ? "prepared" : status);
    if (status === "stale-prepared") view.cms.matchesCurrentRevision = false;
    if (status === "dispatched") view.cms.canReplacePrepared = true;
    const f = cmsFixture({ view }); await f.controller.open(f.species); const button = f.button(CMS_CREATE);
    assert.equal(button.disabled, true); await button.emit("click", { force: true }); await settle(); assert.equal(cmsPosts(f).length, 0);
  }
});

test("dirty edits, reading mode and missing publishing permission block CMS work without saving inputs implicitly", async () => {
  for (const mode of ["dirty", "reading", "permission", "unapproved"]) {
    const view = approvedCmsView(); if (mode === "unapproved") view.approval = null;
    const f = cmsFixture({ view }); await f.controller.open(f.species); const before = f.calls.length;
    if (mode === "dirty") await f.type("Seitentitel", "Eigene offene Seiteneingabe");
    if (mode === "reading") { f.state.editMode = false; f.controller.stateChanged(); }
    if (mode === "permission") { f.state.workspaceStatus.permissions.canApprove = false; f.controller.stateChanged(); }
    assert.equal(f.button(CMS_CREATE).disabled, true); await f.button(CMS_CREATE).emit("click", { force: true }); await settle();
    assert.equal(cmsPosts(f).length, 0); assert.equal(f.calls.length, before);
    if (mode === "dirty") { assert.equal(f.input("Seitentitel").value, "Eigene offene Seiteneingabe"); assert.equal(f.controller.hasUnsavedChanges(), true); }
  }
});

test("late CMS responses after scope, selected species, epoch or permission drift cannot trigger another phase or a success message", async () => {
  for (const phase of ["prepare-cms-plan", "begin-cms-attempt", "create-unpublished-page"]) {
    for (const drift of ["scope", "species", "epoch", "permission"]) {
      const waiting = deferred(); let response;
      const f = cmsFixture({ request(call, local) {
        if (!call.url.endsWith(`/${phase}`)) return undefined;
        response = clone(local.view);
        if (phase === "prepare-cms-plan") response.artifact = { id: "plan-fixture", kind: "cms-plan", draftId: ID, revision: "revision-1" };
        if (phase === "begin-cms-attempt") response.cms = approvedCmsView("prepared").cms;
        if (phase === "create-unpublished-page") response.cms = approvedCmsView("saved-unpublished").cms;
        return waiting.promise;
      } });
      await f.controller.open(f.species); const action = f.click(CMS_CREATE); await settle(); assert.ok(response);
      if (drift === "scope") f.state.workspaceStatus.sourceScope = "another-person-scope";
      if (drift === "species") f.state.selectedId = "another-species";
      if (drift === "epoch") f.state.workspaceEpoch++;
      if (drift === "permission") f.state.workspaceStatus.permissions.canApprove = false;
      f.controller.stateChanged(); const requests = cmsPosts(f).length; waiting.resolve(response); await action;
      assert.equal(cmsPosts(f).length, requests); assert.doesNotMatch(visible(f.dialog), /Squarespace-Entwurf gespeichert und erneut geprüft/);
      assert.equal(f.controller.hasUnsavedChanges(), false);
    }
  }
});

test("foreign plan and response bindings cannot start or confirm another page's CMS work", async () => {
  for (const invalid of ["plan-id", "plan-revision", "plan-draft", "response-scope", "response-draft"]) {
    const f = cmsFixture({ request(call, local) {
      if (invalid.startsWith("plan-") && call.url.endsWith("/prepare-cms-plan")) {
        const result = { ...clone(local.view), artifact: { id: "plan-fixture", kind: "cms-plan", draftId: ID, revision: "revision-1" } };
        if (invalid === "plan-id") result.artifact.id = "invalid/plan";
        if (invalid === "plan-revision") result.artifact.revision = "other-revision";
        if (invalid === "plan-draft") result.artifact.draftId = "other-page"; return result;
      }
      if (invalid.startsWith("response-") && call.url.endsWith("/create-unpublished-page")) {
        const result = clone(local.view); result.cms = approvedCmsView("saved-unpublished").cms;
        if (invalid === "response-scope") result.sourceScope = "foreign-scope";
        if (invalid === "response-draft") result.draft.id = "other-page"; return result;
      }
    } });
    await f.controller.open(f.species); await f.click(CMS_CREATE);
    assert.doesNotMatch(visible(f.dialog), /Squarespace-Entwurf gespeichert und erneut geprüft/);
    assert.equal(cmsPosts(f).length, invalid.startsWith("plan-") ? 1 : 3);
  }
});

test("begin and execution responses must bind the exact persisted CMS attempt, plan, draft and reviewed revision", async () => {
  for (const invalid of ["begin-draft", "begin-revision", "begin-plan", "execute-id", "execute-draft", "execute-revision"]) {
    const f = cmsFixture({ request(call, local) {
      const begin = invalid.startsWith("begin-");
      if (!call.url.endsWith(begin ? "/begin-cms-attempt" : "/create-unpublished-page")) return undefined;
      const result = clone(local.view); result.cms = approvedCmsView(begin ? "prepared" : "saved-unpublished").cms;
      if (invalid.endsWith("-draft")) result.cms.draftId = "other-page";
      if (invalid.endsWith("-revision")) result.cms.revision = "other-revision";
      if (invalid === "begin-plan") result.cms.planId = "other-plan";
      if (invalid === "execute-id") result.cms.id = "other-attempt";
      return result;
    } });
    await f.controller.open(f.species); await f.click(CMS_CREATE);
    assert.doesNotMatch(visible(f.dialog), /Squarespace-Entwurf gespeichert und erneut geprüft/);
    assert.equal(cmsPosts(f).length, invalid.startsWith("begin-") ? 2 : 3);
    assert.equal(f.input("Seitentitel").value, draftView().editable.title); assert.equal(f.controller.hasUnsavedChanges(), false);
  }
});

test("CMS transport failures stop the current phase, preserve the page and never retry automatically", async () => {
  for (const phase of ["prepare-cms-plan", "begin-cms-attempt", "create-unpublished-page"]) {
    const f = cmsFixture({ request(call) { if (call.url.endsWith(`/${phase}`)) throw new Error("PRIVATE uncertain CMS transport details"); } });
    await f.controller.open(f.species); await f.click(CMS_CREATE); const count = cmsPosts(f).length; await settle();
    assert.equal(cmsPosts(f).length, count); assert.equal(cmsPosts(f).filter(call => call.url.endsWith(`/${phase}`)).length, 1);
    assert.match(visible(f.dialog), /nicht automatisch wiederholt/); assert.doesNotMatch(visible(f.dialog), /PRIVATE|Squarespace-Entwurf gespeichert und erneut geprüft/);
    assert.equal(f.input("Seitentitel").value, draftView().editable.title); assert.equal(f.controller.hasUnsavedChanges(), false);
  }
});

test("an explicitly uncertain CMS result stays visibly open and does not offer another execution", async () => {
  const f = cmsFixture({ resultStatus: "uncertain" }); await f.controller.open(f.species); await f.click(CMS_CREATE);
  assert.match(visible(f.dialog), /Ausgang.*offen/); assert.match(visible(f.dialog), /nicht automatisch wiederholt/);
  assert.doesNotMatch(visible(f.dialog), /Squarespace-Entwurf gespeichert und erneut geprüft/);
  assert.equal(f.button(CMS_CREATE).disabled, true); await f.button(CMS_CREATE).emit("click", { force: true }); await settle();
  assert.equal(cmsPosts(f).length, 3);
});

test("a bound CMS stop hint is visible immediately and after reopening the draft", async () => {
  const view = approvedCmsView("uncertain");
  const reason = "Beim Vergleich des wieder geöffneten Entwurfs blieb die Übereinstimmung offen. Vergleiche Texte, Bildreihenfolge und Bildtexte mit der freigegebenen Vorschau.";
  view.cms.receipt = { schemaVersion: 2, status: "uncertain", attemptId: view.cms.id, reason };
  const f = cmsFixture({ request(call) { if (call.url.endsWith("/create-unpublished-page")) return clone(view); } });
  await f.controller.open(f.species); await f.click(CMS_CREATE);
  assert.ok(visible(f.dialog).includes(reason)); assert.equal(f.button(CMS_CREATE).disabled, true);
  const reopened = cmsFixture({ view }); await reopened.controller.open(reopened.species);
  assert.ok(visible(reopened.dialog).includes(reason)); assert.equal(cmsPosts(reopened).length, 0);
  const foreign = clone(view); foreign.cms.receipt.attemptId = "different-attempt";
  const mismatched = cmsFixture({ view: foreign }); await mismatched.controller.open(mismatched.species);
  assert.ok(!visible(mismatched.dialog).includes(reason)); assert.equal(mismatched.button(CMS_CREATE).disabled, true);
});

test("reader adoption is available only for the exact saved online shared head without pending changes", async () => {
  for (const change of [view => { view.connection = "offline"; }, view => { view.sync.state = "queued"; },
    view => { view.sync.localPending = true; }, view => { view.sync.localConflict = true; },
    view => { view.sync.coveredLocalRevision = "other-revision"; }, view => { view.sync.queuedLocalRevision = "revision-1"; },
    view => { view.sync.bindingRevision = null; }]) {
    const view = draftView(); change(view); const f = fixture({ view }); await f.controller.open(f.species);
    assert.equal(f.button("In Artbestand übernehmen").disabled, true); await f.click("In Artbestand übernehmen");
    assert.equal(f.calls.some(call => call.url.endsWith("/reader-preview")), false);
  }
  for (const change of [f => { f.state.workspaceStatus.connection = "offline"; }, f => { f.state.workspaceStatus.readOnlySession = true; },
    f => { f.state.workspaceStatus.permissions.canEdit = false; }, f => { f.state.workspaceStatus.user = { id: "reader-person", role: "reader" }; },
    f => { f.state.editMode = false; }]) {
    const f = fixture(); await f.controller.open(f.species); change(f); f.controller.stateChanged();
    assert.equal(f.button("In Artbestand übernehmen").disabled, true); await f.click("In Artbestand übernehmen");
    assert.equal(f.calls.some(call => call.url.endsWith("/reader-preview")), false);
  }
});

test("reader preview presents safe human comparisons and stages only after its separate explicit confirmation", async () => {
  const f = fixture(); await f.controller.open(f.species); await f.click("In Artbestand übernehmen");
  const request = f.calls.find(call => call.url.endsWith("/reader-preview"));
  assert.deepEqual(request.body, { sourceScope: SCOPE, expectedRevision: "revision-1", expectedBindingRevision: "binding-1" });
  assert.equal(f.calls.some(call => call.url.endsWith("/reader-adopt")), false);
  const panel = f.body.querySelector('[data-section="reader-preview"]');
  assert.match(panel.textContent, /Bisheriger Artbestand/); assert.match(panel.textContent, /Bisheriger Arttext/);
  assert.match(panel.textContent, /Eigene Einleitung/); assert.match(panel.textContent, /Bisheriger Alternativtext/);
  assert.match(panel.textContent, /Testkauz im Baum/); assert.match(panel.textContent, /Vollständiger Beleg/);
  assert.doesNotMatch(panel.textContent, /PRIVATE_|[a-f0-9]{64}|sourceBindings|old-section-private-id|old-image-private-id|image-first|schemaVersion/);
  assert.equal(panel.querySelector("script"), null);
  assert.equal(panel.querySelector('[data-editor-group="reader-texts"]').open, false);
  assert.equal(panel.querySelector('[data-editor-group="reader-images"]').open, false);
  await f.click("Als Artentwurf übernehmen");
  assert.deepEqual(f.calls.find(call => call.url.endsWith("/reader-adopt")).body, { sourceScope: SCOPE, token: "reader-token-fixture" });
  assert.match(visible(f.dialog), /vorgemerkt.*noch abgleichen/); assert.equal(f.button("In Artbestand übernehmen").disabled, true);
  assert.equal(f.calls.filter(call => call.method === "POST").length, 2);
  assert.equal(f.calls.some(call => /\/(?:save|sync|approve|prepare-cms-plan)$/.test(call.url)), false);
  assert.equal(f.controller.hasUnsavedChanges(), false);
});

test("cancelling the reader comparison never stages and a detached old confirm button cannot revive it", async () => {
  const f = fixture(); await f.controller.open(f.species); await f.click("In Artbestand übernehmen");
  const confirm = f.button("Als Artentwurf übernehmen"); await f.click("Vorschau schließen");
  assert.equal(f.button("Als Artentwurf übernehmen"), undefined); await confirm.emit("click", { force: true }); await settle();
  assert.equal(f.calls.some(call => call.url.endsWith("/reader-adopt")), false);
  assert.equal(f.controller.hasUnsavedChanges(), false); assert.equal(f.input("Seitentitel").value, draftView().editable.title);
});

test("reader image comparison shows the explicit legacy order and exact newly proposed usage text", async () => {
  const f = fixture({ request(call) {
    if (call.url.endsWith("/reader-preview")) {
      const response = readerComparison(); response.beforeEditorial.gallery = [{ id: "late", order: 9, alt: "Spätere alte Ansicht", caption: "Original später" },
        { id: "early", order: 2, alt: "Frühere alte Ansicht", caption: "Original früher" }];
      response.proposedEditorial.gallery = [{ id: "usage-z", order: 0, alt: "Neu zuerst ohne Punkt", caption: "Neue erste Beschriftung", decorative: false },
        { id: "usage-a", order: 1, alt: "", caption: "Neue zweite Beschriftung", decorative: true }]; return response;
    }
  } });
  await f.controller.open(f.species); await f.click("In Artbestand übernehmen");
  const detail = f.body.querySelector('[data-editor-group="reader-images"]'), text = detail.textContent;
  assert.ok(text.indexOf("Frühere alte Ansicht") < text.indexOf("Spätere alte Ansicht"));
  assert.ok(text.indexOf("Neue erste Beschriftung") < text.indexOf("Neue zweite Beschriftung"));
  assert.match(text, /Neu zuerst ohne Punkt/); assert.match(text, /Bewusst dekorativ/);
  assert.doesNotMatch(text, /usage-z|usage-a|PRIVATE_|[a-f0-9]{64}/);
});

test("dirty input after reader preview removes its consent and remains untouched by a stale confirmation", async () => {
  const f = fixture(); await f.controller.open(f.species); await f.click("In Artbestand übernehmen");
  const confirm = f.button("Als Artentwurf übernehmen"); await f.type("Seitentitel", "Eigene neue Eingabe nach Übernahmevorschau");
  assert.equal(f.button("In Artbestand übernehmen").disabled, true); assert.equal(f.button("Als Artentwurf übernehmen"), undefined);
  await confirm.emit("click", { force: true }); await settle();
  assert.equal(f.calls.some(call => call.url.endsWith("/reader-adopt")), false);
  assert.equal(f.input("Seitentitel").value, "Eigene neue Eingabe nach Übernahmevorschau"); assert.equal(f.controller.hasUnsavedChanges(), true);
});

test("reader consent cannot survive scope, role, selection, epoch or permission drift", async () => {
  for (const change of [f => { f.state.workspaceStatus.sourceScope = "foreign-scope"; }, f => { f.state.selectedId = "another-species"; },
    f => { f.state.workspaceEpoch++; }, f => { f.state.workspaceStatus.permissions.canEdit = false; },
    f => { f.state.workspaceStatus.user.role = "publisher"; }, f => { f.state.workspaceStatus.connection = "offline"; }]) {
    const f = fixture(); f.state.workspaceStatus.user = { id: "current-person", role: "admin" };
    await f.controller.open(f.species); await f.click("In Artbestand übernehmen"); const confirm = f.button("Als Artentwurf übernehmen");
    change(f); f.controller.stateChanged(); await confirm.emit("click", { force: true }); await settle();
    assert.equal(f.calls.some(call => call.url.endsWith("/reader-adopt")), false);
    assert.doesNotMatch(visible(f.dialog), /Bisheriger Arttext|Bisheriger Alternativtext/);
  }
});

test("late reader preview responses are ignored after a role or person change", async () => {
  for (const change of [f => { f.state.workspaceStatus.sourceScope = "another-person"; }, f => { f.state.workspaceStatus.user.role = "publisher"; }]) {
    const waiting = deferred(), f = fixture({ request(call) { if (call.url.endsWith("/reader-preview")) return waiting.promise; } });
    f.state.workspaceStatus.user = { id: "current-person", role: "admin" }; await f.controller.open(f.species);
    const task = f.click("In Artbestand übernehmen"); await settle(); change(f); f.controller.stateChanged();
    waiting.resolve(readerComparison()); await task;
    assert.equal(f.controller.busy, false); assert.equal(f.button("Als Artentwurf übernehmen"), undefined);
    assert.doesNotMatch(visible(f.dialog), /Bisheriger Arttext|Bisheriger Alternativtext/);
    assert.equal(f.calls.some(call => call.url.endsWith("/reader-adopt")), false);
  }
});

test("a late queued reader response cannot appear as success for another selected species or person", async () => {
  const waiting = deferred(), f = fixture({ request(call) { if (call.url.endsWith("/reader-adopt")) return waiting.promise; } });
  await f.controller.open(f.species); await f.click("In Artbestand übernehmen"); const task = f.click("Als Artentwurf übernehmen"); await settle();
  f.state.selectedId = "another-species"; f.state.workspaceStatus.sourceScope = "another-person"; f.controller.stateChanged();
  waiting.resolve({ sourceScope: SCOPE, draftId: ID, queued: true, changeId: "late-change", speciesId: "fixture-owl", readerApproved: false, externalPublication: "not-performed" }); await task;
  assert.equal(f.body.hidden, true); assert.doesNotMatch(visible(f.dialog), /Artentwurf vorgemerkt|Bisheriger Arttext/);
  assert.equal(f.state.selectedId, "another-species"); assert.equal(f.calls.filter(call => call.url.endsWith("/reader-adopt")).length, 1);
});

test("saving alone cannot enable reader adoption until that exact new revision has been explicitly synchronized", async () => {
  const f = fixture(); await f.controller.open(f.species); await f.type("Seitentitel", "Neu gespeicherte Artseite");
  await f.click("Entwurf speichern"); assert.equal(f.controller.hasUnsavedChanges(), false);
  assert.equal(f.button("In Artbestand übernehmen").disabled, true);
  await f.click("Mit gemeinsamem Projekt abgleichen"); assert.equal(f.button("In Artbestand übernehmen").disabled, false);
  await f.click("In Artbestand übernehmen"); const preview = f.calls.find(call => call.url.endsWith("/reader-preview"));
  assert.equal(preview.body.expectedRevision, f.view().draft.revision); assert.equal(preview.body.expectedBindingRevision, f.view().sync.bindingRevision);
});

test("a failed reader stage does not retry, confirm a false result, or change the current editor data", async () => {
  const f = fixture({ request(call) { if (call.url.endsWith("/reader-adopt")) throw new Error("PRIVATE lost transport details"); } });
  await f.controller.open(f.species); await f.click("In Artbestand übernehmen"); await f.click("Als Artentwurf übernehmen");
  assert.equal(f.controller.busy, false); assert.equal(f.calls.filter(call => call.url.endsWith("/reader-adopt")).length, 1);
  assert.equal(f.button("Als Artentwurf übernehmen"), undefined); assert.equal(f.input("Seitentitel").value, draftView().editable.title);
  assert.doesNotMatch(visible(f.dialog), /Artentwurf vorgemerkt|PRIVATE lost transport/); assert.match(visible(f.dialog), /nicht automatisch wiederholt/);
  assert.equal(f.calls.some(call => /\/(?:sync|approve|prepare-cms-plan)$/.test(call.url)), false);
});

test("foreign, expired and falsely approved reader comparisons cannot expose a confirm action", async () => {
  for (const change of [value => { value.sourceScope = "foreign"; }, value => { value.draftId = "another-page"; },
    value => { value.expiresAt = "2000-01-01T00:00:00.000Z"; }, value => { value.readerApproved = true; }, value => { value.externalPublication = "published"; }]) {
    const f = fixture({ request(call) { if (call.url.endsWith("/reader-preview")) { const response = readerComparison(); change(response); return response; } } });
    await f.controller.open(f.species); await f.click("In Artbestand übernehmen");
    assert.equal(f.button("Als Artentwurf übernehmen"), undefined); assert.equal(f.calls.some(call => call.url.endsWith("/reader-adopt")), false);
  }
});

test("a reader stage response must confirm this exact draft and species as queued without claiming approval or publication", async () => {
  for (const change of [value => { value.draftId = "another-page"; }, value => { value.speciesId = "another-species"; },
    value => { value.queued = false; }, value => { value.readerApproved = true; }, value => { value.externalPublication = "published"; }]) {
    const f = fixture({ request(call) {
      if (call.url.endsWith("/reader-adopt")) { const result = { sourceScope: SCOPE, draftId: ID, queued: true, changeId: "change-fixture", speciesId: "fixture-owl", readerApproved: false, externalPublication: "not-performed" }; change(result); return result; }
    } });
    await f.controller.open(f.species); await f.click("In Artbestand übernehmen"); await f.click("Als Artentwurf übernehmen");
    assert.doesNotMatch(visible(f.dialog), /Artentwurf vorgemerkt/); assert.equal(f.calls.filter(call => call.url.endsWith("/reader-adopt")).length, 1);
  }
});

test("a confirmed queued reader draft with newer backend page inputs reports both facts without replacing any inputs", async () => {
  const f = fixture({ request(call, state) {
    if (call.url.endsWith("/reader-adopt")) {
      state.view.editable.title = "Neuere Seiteneingabe aus anderer lokaler Bearbeitung";
      return { sourceScope: SCOPE, draftId: ID, queued: true, changeId: "queued-before-page-change", speciesId: "fixture-owl", localPageChanged: true,
        readerApproved: false, externalPublication: "not-performed", message: "PRIVATE backend detail must not be rendered" };
    }
  } });
  await f.controller.open(f.species); await f.click("In Artbestand übernehmen"); await f.click("Als Artentwurf übernehmen");
  assert.match(visible(f.dialog), /vorgemerkt.*noch abgleichen/); assert.match(visible(f.dialog), /neue Seiteneingaben|Neue Seiteneingaben/);
  assert.equal(f.view().editable.title, "Neuere Seiteneingabe aus anderer lokaler Bearbeitung");
  assert.equal(f.input("Seitentitel").value, draftView().editable.title); assert.equal(f.state.selectedId, "fixture-owl");
  assert.doesNotMatch(visible(f.dialog), /PRIVATE backend detail/); assert.equal(f.calls.some(call => call.url.endsWith("/save")), false);
});

test("page editor construction is passive and opening requires the exact editable shared species", async () => {
  for (const change of [(f) => { f.state.editMode = false; }, (f) => { f.state.workspace = "local"; }, (f) => { f.species.sourceScope = "other"; }, (f) => { f.state.selectedId = "another"; }, (f) => { f.state.workspaceStatus.permissions.canEdit = false; }]) {
    const f = fixture(); assert.deepEqual(f.calls, []); change(f); assert.equal(await f.controller.open(f.species), false); assert.deepEqual(f.calls, []); assert.equal(f.dialog.open, false);
  }
});

test("main save and preview preserves every richtext block, source and manual image text", async () => {
  const f = fixture(); await f.controller.open(f.species);
  assert.equal(f.dialog.open, true); assert.equal(f.input("Seitentitel").value, "Testkauz <script>safe text</script>"); assert.doesNotMatch(f.dialog.textContent, /DO_NOT_RENDER_PRIVATE|schemaVersion|[a-f0-9]{64}/);
  await f.type("Seitentitel", "Eigener Titel ohne Punkt"); await f.type("Aussehen: Listeneintrag 1.2", "Geänderter zweiter Punkt");
  await f.click("Speichern und Vorschau prüfen");
  const save = f.calls.find((call) => call.url.endsWith("/save")), preview = f.calls.find((call) => call.url.endsWith("/preview"));
  assert.equal(save.body.document.title, "Eigener Titel ohne Punkt"); assert.equal(save.body.document.sections[1].blocks[0].type, "numbered-list");
  assert.deepEqual(save.body.document.sections[1].blocks[0].items, ["Erster Punkt", "Geänderter zweiter Punkt"]);
  assert.deepEqual(save.body.document.sections[1].sources, draftView().editable.sections[1].sources);
  assert.deepEqual(save.body.document.sources, draftView().editable.sources); assert.deepEqual(save.body.document.introduction, draftView().editable.introduction);
  assert.deepEqual(save.body.document.images, draftView().editable.images); assert.equal(save.body.sourceScope, SCOPE); assert.equal(save.body.expectedRevision, "revision-1");
  assert.equal(preview.body.expectedRevision, f.view().draft.revision); assert.equal(f.controller.hasUnsavedChanges(), false);
  const iframe = f.body.querySelector("iframe"); assert.equal(iframe.getAttribute("sandbox"), ""); assert.match(iframe.srcdoc, /Gesicherte Vorschau/);
  assert.equal(f.button("Geprüfte Artseite intern freigeben").disabled, true);
});

test("internal approval needs three genuine review decisions and each exact missing-alt acknowledgement", async () => {
  const f = fixture({ missingAlt: true }); await f.controller.open(f.species); await f.click("Speichern und Vorschau prüfen");
  for (const label of ["Texte geprüft", "Bilder und Bildtexte geprüft", "Gesamte Darstellung geprüft"]) { assert.equal(f.input(label).checked, false); await f.check(label); }
  assert.equal(f.button("Geprüfte Artseite intern freigeben").disabled, true); assert.equal(f.calls.some((call) => call.url.endsWith("/approve")), false);
  await f.check("Bild 1: fehlenden Alternativtext bewusst offen lassen"); assert.equal(f.button("Geprüfte Artseite intern freigeben").disabled, false);
  await f.click("Geprüfte Artseite intern freigeben");
  const approved = f.calls.find((call) => call.url.endsWith("/approve"));
  assert.deepEqual(approved.body.review, { texts: true, images: true, layout: true }); assert.deepEqual(approved.body.missingAltAcknowledged, ["position-first"]);
  assert.equal(approved.body.previewId, "preview-fixture"); assert.equal(approved.body.reportHash, "report-fixture"); assert.equal(approved.body.expectedRevision, "revision-1");
  assert.match(f.dialog.textContent, /intern freigegeben.*Website.*nichts veröffentlicht/); assert.equal(f.calls.some((call) => /publish|prepare-cms/.test(call.url)), false);
});

test("editing after preview immediately removes the old frame and prevents reuse of its approval", async () => {
  const f = fixture(); await f.controller.open(f.species); await f.click("Speichern und Vorschau prüfen"); const frame = f.body.querySelector("iframe");
  await f.check("Texte geprüft"); await f.check("Bilder und Bildtexte geprüft"); await f.check("Gesamte Darstellung geprüft");
  await f.type("Alternativtext Bild 1", "Mein neuer Alternativtext ohne Punkt");
  assert.equal(frame.srcdoc, ""); assert.equal(f.body.querySelector("iframe"), null); assert.equal(f.button("Geprüfte Artseite intern freigeben"), undefined);
  assert.equal(f.controller.hasUnsavedChanges(), true); assert.match(f.dialog.textContent, /Ungespeicherte Eingaben/); assert.equal(f.calls.some((call) => call.url.endsWith("/approve")), false);
});

test("an empty editorial section is confirmed only by its explicit button after saving the current input", async () => {
  const f = fixture(); await f.controller.open(f.species); assert.equal(f.calls.some((call) => call.url.endsWith("/confirm-empty")), false);
  await f.type("Seitentitel", "Fassung vor Leerentscheidung"); await f.click("„Lebensraum“ bewusst leer lassen");
  const writes = f.calls.filter((call) => call.method === "POST"); assert.equal(writes.length, 2); assert.ok(writes[0].url.endsWith("/save")); assert.ok(writes[1].url.endsWith("/confirm-empty"));
  assert.equal(writes[1].body.sectionId, "habitat"); assert.equal(writes[1].body.confirmed, true); assert.notEqual(writes[1].body.expectedRevision, "revision-1");
  assert.match(f.dialog.textContent, /Bewusst leer · bestätigt/); assert.equal(f.view().editable.sections[2].blocks.length, 0);
});

test("a remote-only draft is matched by bound slug and imported only after an explicit refresh", async () => {
  const f = fixture({ remote: true }); await f.controller.open(f.species);
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 0); assert.ok(f.button("Gemeinsamen Entwurf einlesen")); assert.equal(f.input("Seitentitel"), undefined);
  await f.click("Gemeinsamen Entwurf einlesen"); const request = f.calls.find((call) => call.url.endsWith("/refresh"));
  assert.equal(request.body.draftId, ID); assert.equal(request.body.sourceScope, SCOPE); assert.equal(request.body.expectedBindingRevision, null); assert.ok(f.input("Seitentitel"));
});

test("the offline editor opens the exact cached version and keeps an unconfirmed page locked", async () => {
  for (const unconfirmed of [true, false]) {
    const f = fixture({ remote: true, unconfirmed });
    f.state.workspaceStatus.connection = "offline";
    f.state.workspaceStatus.permissions.canCreate = false;
    f.state.workspaceStatus.permissions.canApprove = false;
    await f.controller.open(f.species);
    const open = f.button("Zuletzt geladenen Entwurf öffnen");
    assert.equal(open.disabled, unconfirmed);
    assert.equal(f.calls.some((call) => call.method === "POST"), false);
    if (unconfirmed) continue;
    await f.click("Zuletzt geladenen Entwurf öffnen");
    const refresh = f.calls.find((call) => call.url.endsWith("/refresh"));
    assert.equal(refresh.body.expectedCachedRevision, "shared-revision-1");
    assert.equal(refresh.body.expectedBindingRevision, null);
    assert.ok(f.input("Seitentitel"));
    assert.match(f.dialog.textContent, /Änderungen werden auf diesem PC gespeichert/);
  }
});

test("creation requires a consciously selected template and region and does not promise publication", async () => {
  const f = fixture({ noDraft: true, request(call, state) {
    if (call.url === "/api/page-authoring/drafts" && call.method === "POST") {
      const created = draftView(); created.draft.id = call.body.draftId; created.editable.title = call.body.title; created.draft.document.title = call.body.title; state.view = created; return clone(created);
    }
  } }); await f.controller.open(f.species);
  assert.equal(f.input("FN-Seitenvorlage").value, ""); assert.equal(f.input("Neuer Website-Zielbereich").value, "");
  await f.click("Artseitenentwurf anlegen"); assert.equal(f.calls.filter((call) => call.method === "POST").length, 0);
  const select = f.input("FN-Seitenvorlage"); select.value = "fn-compact-20261031"; await select.emit("change");
  await f.type("Neuer Website-Zielbereich", "/wildlife/afrika"); await f.type("Neuer Seitentitel", "Bewusster Seitentitel"); await f.click("Artseitenentwurf anlegen");
  const write = f.calls.find((call) => call.method === "POST"); assert.equal(write.body.slug, "fixture-owl"); assert.equal(write.body.parentPath, "/wildlife/afrika"); assert.equal(write.body.title, "Bewusster Seitentitel");
  assert.equal(write.body.confirmedCreate, undefined); assert.ok(write.body.mutationId); assert.match(f.dialog.textContent, /Artseitenentwurf angelegt/);
});

test("a failed initial list never offers creation from an unproven empty project and can be retried deliberately", async () => {
  let fail = true;
  const f = fixture({ noDraft: true, request(call) { if (call.url === "/api/page-authoring/drafts" && fail) { fail = false; throw new Error("network failed"); } } });
  await f.controller.open(f.species); assert.equal(f.button("Artseitenentwurf anlegen"), undefined); assert.ok(f.button("Entwürfe erneut laden"));
  assert.equal(f.controller.busy, false); assert.equal(f.calls.length, 2); await f.click("Entwürfe erneut laden"); assert.ok(f.button("Artseitenentwurf anlegen"));
});

test("a lost create response is inspected by its original draft id and never creates an automatic duplicate", async () => {
  let input, saved;
  const f = fixture({ noDraft: true, request(call, state) {
    if (call.url === "/api/page-authoring/drafts" && call.method === "POST") {
      input = clone(call.body); saved = draftView(); saved.draft.id = input.draftId; state.view = saved; throw new Error("lost create acknowledgement");
    }
    if (input && call.url === `/api/page-authoring/drafts/${input.draftId}`) return clone(saved);
  } }); await f.controller.open(f.species);
  f.input("FN-Seitenvorlage").value = "fn-compact-20261031"; await f.input("FN-Seitenvorlage").emit("change");
  await f.type("Neuer Website-Zielbereich", "/wildlife/afrika"); await f.click("Artseitenentwurf anlegen");
  assert.equal(f.button("Artseitenentwurf anlegen"), undefined); assert.ok(f.button("Angelegten Entwurf prüfen")); assert.equal(f.button("Neuanlage ausdrücklich bestätigen"), undefined);
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 1); await f.click("Angelegten Entwurf prüfen");
  assert.ok(f.input("Seitentitel")); assert.equal(f.calls.filter((call) => call.method === "POST").length, 1); assert.equal(f.view().draft.id, input.draftId);
});

test("a proven missing create attempt can only be retried by a separate user action with identical id and mutation", async () => {
  let attempts = 0, input;
  const f = fixture({ noDraft: true, request(call) {
    if (call.url === "/api/page-authoring/drafts" && call.method === "POST") {
      attempts++; if (attempts === 1) { input = clone(call.body); throw new Error("lost before create"); }
      assert.deepEqual(call.body, input); const saved = draftView(); saved.draft.id = input.draftId; return saved;
    }
    if (input && call.url === `/api/page-authoring/drafts/${input.draftId}`) return { sourceScope: SCOPE, draft: null, remoteOnly: null };
  } }); await f.controller.open(f.species);
  f.input("FN-Seitenvorlage").value = "fn-compact-20261031"; await f.input("FN-Seitenvorlage").emit("change");
  await f.type("Neuer Website-Zielbereich", "/wildlife/afrika"); await f.click("Artseitenentwurf anlegen"); await f.click("Angelegten Entwurf prüfen");
  assert.equal(attempts, 1); assert.ok(f.button("Neuanlage ausdrücklich bestätigen")); await f.click("Neuanlage ausdrücklich bestätigen");
  assert.equal(attempts, 2); assert.equal(input.confirmedCreate, undefined); assert.ok(f.input("Seitentitel"));
});

test("a failed save returns control, keeps human inputs and does not retry or approve", async () => {
  const f = fixture({ request(call) { if (call.url.endsWith("/save")) throw new Error("PRIVATE transport detail"); } });
  await f.controller.open(f.species); await f.type("Aussehen: Listeneintrag 1.1", "Mein erhaltener Text"); await f.click("Speichern und Vorschau prüfen");
  assert.equal(f.controller.busy, false); assert.equal(f.controller.hasUnsavedChanges(), true); assert.equal(f.input("Aussehen: Listeneintrag 1.1").value, "Mein erhaltener Text");
  assert.equal(f.calls.filter((call) => call.url.endsWith("/save")).length, 1); assert.equal(f.calls.some((call) => call.url.endsWith("/preview")), false);
  assert.match(f.dialog.textContent, /nicht automatisch wiederholt/); assert.doesNotMatch(f.dialog.textContent, /PRIVATE transport detail/);
});

test("scope, epoch, species or edit permission drift discards a pending preview and hides the old private form", async () => {
  for (const change of [(f) => { f.state.workspaceStatus.sourceScope = "another-person"; }, (f) => { f.state.workspaceEpoch++; }, (f) => { f.state.selectedId = "another-species"; }, (f) => { f.state.workspaceStatus.permissions.canEdit = false; }, (f) => { f.state.editMode = false; }]) {
    const waiting = deferred(), f = fixture({ request(call) { if (call.url.endsWith("/preview")) return waiting.promise; } });
    await f.controller.open(f.species); const task = f.click("Speichern und Vorschau prüfen"); await settle(); assert.equal(f.controller.busy, true);
    change(f); f.controller.stateChanged(); waiting.resolve({ ...draftView(), html: "OLD_PRIVATE_HTML", report: { revision: "revision-1", reportHash: "old", findings: [], technicalReady: true }, artifact: { id: "old-preview" } }); await task;
    assert.equal(f.body.hidden, true); assert.equal(f.controller.busy, false); assert.doesNotMatch(visible(f.dialog), /OLD_PRIVATE|Testkauz/);
    assert.equal(f.calls.some((call) => call.url.endsWith("/approve")), false);
  }
});

test("an initial status response arriving after a person change does not continue loading that person's drafts", async () => {
  const pending = deferred(), f = fixture({ request(call) { if (call.url === "/api/page-authoring") return pending.promise; } });
  const opening = f.controller.open(f.species); await settle(); f.state.workspaceStatus.sourceScope = "new-person-scope";
  pending.resolve({ ...f.info, sourceScope: SCOPE }); await opening;
  assert.equal(f.calls.length, 1); assert.equal(f.body.hidden, true); assert.equal(f.controller.busy, false); assert.equal(f.input("Seitentitel"), undefined);
});

test("a role epoch suspension keeps unsaved inputs for explicit reopening under a freshly valid scope", async () => {
  const f = fixture(); await f.controller.open(f.species); await f.type("Seitentitel", "Eingabe vor Rollenwechsel");
  f.state.workspaceEpoch++; f.state.workspaceStatus.permissions.canEdit = false; f.controller.stateChanged(); assert.equal(f.body.hidden, true);
  f.state.workspaceEpoch++; f.state.workspaceStatus.permissions.canEdit = true; await f.controller.open(f.species);
  assert.equal(f.input("Seitentitel").value, "Eingabe vor Rollenwechsel"); assert.equal(f.controller.hasUnsavedChanges(), true); assert.equal(f.calls.some((call) => call.method === "POST"), false);
});

test("going offline keeps permitted existing editing available while invalidating the online preview", async () => {
  const f = fixture(); await f.controller.open(f.species); await f.click("Speichern und Vorschau prüfen");
  await f.type("Seitentitel", "Offline weiter bearbeiten");
  f.state.workspaceStatus.connection = "offline"; f.state.workspaceStatus.permissions.canCreate = false; f.state.workspaceStatus.permissions.canApprove = false; f.controller.stateChanged();
  assert.equal(f.body.hidden, false); assert.equal(f.input("Seitentitel").value, "Offline weiter bearbeiten"); assert.equal(f.input("Seitentitel").disabled, false);
  assert.equal(f.body.querySelector("iframe"), null); assert.equal(f.controller.hasUnsavedChanges(), true); assert.equal(f.calls.filter((call) => call.method === "POST").length, 1);
});

test("a preview for another draft cannot enable internal approval even when the slug and revision match", async () => {
  const f = fixture({ request(call) {
    if (call.url.endsWith("/preview")) return { ...draftView(), html: "WRONG_DRAFT_PREVIEW", artifact: { id: "wrong-preview", kind: "preview", draftId: "another-page", revision: "revision-1" },
      report: { reportHash: "wrong-report", revision: "revision-1", findings: [], technicalReady: true } };
  } }); await f.controller.open(f.species); await f.click("Speichern und Vorschau prüfen");
  assert.equal(f.body.querySelector("iframe"), null); assert.equal(f.button("Geprüfte Artseite intern freigeben"), undefined); assert.equal(f.controller.busy, false);
  assert.doesNotMatch(f.dialog.textContent, /WRONG_DRAFT_PREVIEW/); assert.equal(f.calls.some((call) => call.url.endsWith("/approve")), false);
});

test("remote-backed images stay placeholders until an explicit download and never emit a broken image request", async () => {
  const f = fixture(); await f.controller.open(f.species);
  assert.equal(f.body.querySelectorAll("img").length, 0); assert.ok(f.button("Bild vom Projekt laden")); assert.equal(f.calls.filter((call) => call.url.endsWith("/download")).length, 0);
  await f.click("Bild vom Projekt laden"); const img = f.body.querySelector("img"); assert.ok(img); assert.equal(img.src, `/api/page-authoring/images/image-first?scope=${SCOPE}`);
  await img.emit("error"); assert.equal(img.src, ""); assert.ok(f.button("Bild vom Projekt laden"));
});

test("editing manual text keeps local thumbnails loaded while closing releases the editor's own media", async () => {
  const f = fixture({ localImage: true }); await f.controller.open(f.species); const image = f.body.querySelector("img"), sourceUrl = image.src;
  await f.type("Alternativtext Bild 1", "Unverfälschter Text ohne Punkt"); assert.equal(image.src, sourceUrl);
  await f.controller.close(); assert.equal(image.src, ""); assert.equal(f.dialog.open, false);
});

test("image imports are sequential and a later failure preserves the first successful image and existing descriptions", async () => {
  const first = deferred(), reads = []; let imports = 0;
  const f = fixture({ encodeFile: async (file) => { reads.push(file.name); return "YWJj"; }, request(call) {
    if (call.url === "/api/page-authoring/images/import") { imports++; if (imports === 1) return first.promise; throw new Error("second import failed"); }
  } }); await f.controller.open(f.species); const fileInput = f.input("Bilddateien auswählen");
  fileInput.files = [{ name: "first.png", size: 3 }, { name: "second.png", size: 3 }]; await fileInput.emit("change"); await settle();
  assert.deepEqual(reads, ["first.png"]); assert.equal(imports, 1); assert.equal(f.controller.busy, true);
  first.resolve({ sourceScope: SCOPE, image: { id: "image-imported", localAvailable: true } }); await settle();
  assert.deepEqual(reads, ["first.png", "second.png"]); assert.equal(imports, 2); assert.equal(f.controller.busy, false);
  assert.ok(f.input("Alternativtext Bild 2")); assert.equal(f.input("Alternativtext Bild 1").value, "Testkauz im Baum"); assert.equal(f.input("Bildunterschrift Bild 1").value, "Sichtbare Beschriftung");
  assert.equal(f.controller.hasUnsavedChanges(), true); await f.click("Entwurf speichern"); assert.equal(f.view().editable.images[1].assetId, "image-imported");
});

test("a project change while encoding a file prevents its upload to the new project", async () => {
  const read = deferred(), f = fixture({ encodeFile: () => read.promise }); await f.controller.open(f.species);
  const input = f.input("Bilddateien auswählen"); input.files = [{ name: "pending.png", size: 3 }]; await input.emit("change"); await settle();
  f.state.workspaceStatus.sourceScope = "other-project"; f.controller.stateChanged(); read.resolve("YWJj"); await settle();
  assert.equal(f.calls.some((call) => call.url === "/api/page-authoring/images/import"), false); assert.equal(f.body.hidden, true); assert.equal(f.controller.busy, false);
});

test("dirty close is a conscious decision and reopening retains inputs without claiming permanent storage", async () => {
  let consent = false; const f = fixture({ confirm: async () => consent }); await f.controller.open(f.species); await f.type("Seitentitel", "Noch nicht gespeicherter Titel");
  assert.equal(await f.controller.close(), false); assert.equal(f.dialog.open, true); consent = true; assert.equal(await f.controller.close(), true); assert.equal(f.dialog.open, false);
  assert.match(f.confirmations[0].message, /noch nicht dauerhaft gespeichert/); await f.controller.open(f.species);
  assert.equal(f.input("Seitentitel").value, "Noch nicht gespeicherter Titel"); assert.equal(f.controller.hasUnsavedChanges(), true); assert.equal(f.calls.filter((call) => call.method === "POST").length, 0); assert.ok(f.releases.length);
});

test("remembered unsaved input from another species remains visible to the application-wide dirty guard", async () => {
  const f = fixture(); await f.controller.open(f.species); await f.type("Seitentitel", "Offener Kauzentwurf"); await f.controller.close();
  f.state.selectedId = "fixture-fox"; await f.controller.open({ ...f.species, id: "fixture-fox", slug: "fixture-fox", germanName: "Testfuchs" });
  assert.ok(f.input("Neuer Seitentitel")); assert.equal(f.controller.hasUnsavedChanges(), true); await f.controller.close();
  f.state.selectedId = f.species.id; await f.controller.open(f.species); assert.equal(f.input("Seitentitel").value, "Offener Kauzentwurf"); assert.equal(f.controller.hasUnsavedChanges(), true);
});

test("reloading a saved draft replaces unsaved inputs only after explicit consent and a successful read", async () => {
  let consent = false;
  const f = fixture({ confirm: async () => consent }); await f.controller.open(f.species); await f.type("Seitentitel", "Nicht unbemerkt ersetzen");
  const before = f.calls.length; await f.click("Gespeicherten Entwurf neu laden"); assert.equal(f.calls.length, before); assert.equal(f.input("Seitentitel").value, "Nicht unbemerkt ersetzen");
  consent = true; await f.click("Gespeicherten Entwurf neu laden"); assert.equal(f.input("Seitentitel").value, draftView().editable.title); assert.equal(f.controller.hasUnsavedChanges(), false);
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 0);
});

test("a proven missing remote page requires a separate explicit creation confirmation without automatic retry", async () => {
  let tried = false;
  const f = fixture({ request(call) { if (call.url.endsWith("/sync") && !tried) { tried = true; throw Object.assign(new Error("Missing remote"), { code: "create_confirmation_required" }); } } });
  await f.controller.open(f.species); assert.equal(f.button("Gemeinsame Erstellung bestätigen"), undefined); await f.click("Mit gemeinsamem Projekt abgleichen");
  assert.equal(f.calls.filter((call) => call.url.endsWith("/sync")).length, 1); assert.ok(f.button("Gemeinsame Erstellung bestätigen"));
  await f.click("Gemeinsame Erstellung bestätigen"); const sync = f.calls.filter((call) => call.url.endsWith("/sync")); assert.equal(sync.length, 2); assert.equal(sync[0].body.confirmedCreate, undefined); assert.equal(sync[1].body.confirmedCreate, true);
});

const PAGE_AI_SOURCE_ID = `source-${'c'.repeat(64)}`;
function aiSources(call) {
  const query = new URL(call.url, 'http://fixture').searchParams;
  const text = 'Die Art lebt in Wäldern.';
  return { type: 'page-authoring', sourceScope: query.get('scope'), draftId: query.get('draftId'), revision: query.get('revision'), sectionId: query.get('sectionId'),
    sourcesRevision: 'd'.repeat(64), sources: [{ id: PAGE_AI_SOURCE_ID, title: 'Tatsächlich ausgewählte Artquelle', revision: 'e'.repeat(64), text, characters: text.length,
      provenance: { kind: 'species-editorial', speciesId: 'fixture-owl', sectionId: 'habitat' } }], target: { requested: true, empty: true, intentionallyEmpty: false, characters: 0 } };
}
function aiParagraph(input) {
  return { kind: 'source-text', status: 'proposal', approved: false, transferred: false, humanReviewRequired: true,
    binding: { type: 'page-authoring', sourceScope: input.request.sourceScope, documentId: input.request.draftId, revision: input.request.expectedRevision,
      sectionId: input.request.sectionId, sourceIds: clone(input.request.sourceIds) },
    paragraphs: [{ text: 'Die Art bewohnt Wälder.', sourceIds: [PAGE_AI_SOURCE_ID], evidenceQuotes: [{ sourceId: PAGE_AI_SOURCE_ID, quote: 'lebt in Wäldern' }] }] };
}
function sectionButton(f, id, label) {
  const panel = f.body.querySelector(`[data-editor-group="section:${id}"]`);
  return all(panel).find((node) => node.tagName === 'BUTTON' && node.textContent === label);
}
async function chooseAiSource(f, sectionId = 'habitat') {
  await sectionButton(f, sectionId, 'Quellen auswählen').emit('click');
  const panel = f.body.querySelector(`[data-editor-group="section:${sectionId}"]`), selected = panel.querySelectorAll('input').find((node) => node.value === PAGE_AI_SOURCE_ID);
  assert.ok(selected); assert.equal(selected.checked, false); selected.checked = true; await selected.emit('change');
}

test('Artseitenbildvorschlag ist optional, an konkrete Usage gebunden und verändert nur ungespeicherten Alttext', async () => {
  const absent = fixture(); await absent.controller.open(absent.species); assert.equal(absent.button('Alternativtext vorschlagen'), undefined);
  const initial = draftView(); initial.editable.images[0].assetId = 'image-11111111-2222-4333-8444-555555555555';
  initial.draft.document.images = clone(initial.editable.images);
  const f = fixture({ ai: true, localImage: true, view: initial }); await f.controller.open(f.species); await f.click('Speichern und Vorschau prüfen');
  const frame = f.body.querySelector('iframe'), caption = f.input('Bildunterschrift Bild 1').value;
  await f.click('Alternativtext vorschlagen'); const input = f.aiOpened[0];
  assert.equal(input.request.imageId, 'position-first'); assert.equal(input.request.expectedRevision, 'revision-1');
  assert.equal(input.request.draftId, ID); assert.equal(input.request.sourceScope, SCOPE);
  assert.match(input.previewUrl, /\/images\/image-11111111-2222-4333-8444-555555555555\?scope=/);
  const count = f.calls.length; assert.equal(await input.applyProposal('Manuell angenommener Alttext', 'Fremde Caption'), true);
  assert.equal(f.calls.length, count); assert.equal(f.input('Alternativtext Bild 1').value, 'Manuell angenommener Alttext');
  assert.equal(f.input('Bildunterschrift Bild 1').value, caption); assert.equal(f.controller.hasUnsavedChanges(), true);
  assert.equal(frame.srcdoc, ''); assert.equal(f.body.querySelector('iframe'), null); assert.equal(f.button('Alternativtext vorschlagen').disabled, true);
  assert.equal(f.calls.some((call) => /approve|sync/.test(call.url)), false);
  await f.click('Entwurf speichern'); assert.equal(f.button('Alternativtext vorschlagen').disabled, false);
  assert.equal(f.view().editable.images[0].caption, caption);
});

test('ausgewählte Sourceabsätze ergänzen neue lokale Absätze und Belege ohne vorhandene Listen oder Quellen umzuschreiben', async () => {
  const initial = draftView(); initial.editable.sections[2].sources = [{ id: 'manual-habitat-source', label: 'Eigene erhaltene Quelle', sha256: 'f'.repeat(64) }];
  initial.draft.document.sections[2].sources = clone(initial.editable.sections[2].sources);
  const f = fixture({ ai: true, view: initial, request(call) { if (call.url.startsWith('/api/local-ai/page-authoring/sources?')) return aiSources(call); } });
  await f.controller.open(f.species); assert.equal(f.calls.some((call) => call.url.startsWith('/api/local-ai')), false);
  await chooseAiSource(f); await sectionButton(f, 'habitat', 'Text aus Quellen vorschlagen').emit('click');
  const input = f.aiOpened[0]; assert.equal(input.kind, 'source-text'); assert.equal(input.request.sectionId, 'habitat');
  assert.deepEqual(clone(input.request.sourceIds), [PAGE_AI_SOURCE_ID]); const proposal = aiParagraph(input), count = f.calls.length;
  assert.equal(await input.applyProposal(proposal), true); assert.equal(f.calls.length, count); assert.equal(f.controller.hasUnsavedChanges(), true);
  assert.equal(f.input('Lebensraum: Absatz 1').value, proposal.paragraphs[0].text);
  await f.click('Entwurf speichern'); const saved = f.view().editable;
  assert.deepEqual(saved.sections[2].blocks, [{ type: 'paragraph', text: proposal.paragraphs[0].text }]);
  assert.deepEqual(saved.sections[2].sources, [...initial.editable.sections[2].sources, { id: PAGE_AI_SOURCE_ID, label: 'Tatsächlich ausgewählte Artquelle', sha256: 'e'.repeat(64) }]);
  assert.deepEqual(saved.sections[1], initial.editable.sections[1]); assert.deepEqual(saved.introduction, initial.editable.introduction);
  assert.deepEqual(saved.sources, initial.editable.sources); assert.deepEqual(saved.images, initial.editable.images);
  assert.equal(f.calls.some((call) => /approve|sync|publish/.test(call.url)), false);
});

test('bewusste Leere bleibt leer und Reviewhinweise schreiben vorhandene Fachtexte niemals um', async () => {
  const initial = draftView(); initial.draft.document.emptyConfirmations.habitat = { confirmedAt: '2026-11-01' };
  const empty = fixture({ ai: true, view: initial, request(call) { if (call.url.startsWith('/api/local-ai/page-authoring/sources?')) return aiSources(call); } });
  await empty.controller.open(empty.species); await chooseAiSource(empty);
  const source = sectionButton(empty, 'habitat', 'Text aus Quellen vorschlagen'); assert.equal(source.disabled, true); await source.emit('click', { force: true });
  assert.equal(empty.aiOpened.length, 0); assert.equal(empty.controller.hasUnsavedChanges(), false); assert.deepEqual(empty.view().editable.sections[2].blocks, []);
  const f = fixture({ ai: true, request(call) { if (call.url.startsWith('/api/local-ai/page-authoring/sources?')) return aiSources(call); } });
  await f.controller.open(f.species); await chooseAiSource(f, 'appearance'); await sectionButton(f, 'appearance', 'Text anhand Quellen prüfen').emit('click');
  const input = f.aiOpened[0]; assert.equal(input.kind, 'review-text'); assert.equal(input.initialText, 'Erster Punkt\nZweiter Punkt');
  const proposal = { ...aiParagraph(input), kind: 'review-text', findings: [] }; delete proposal.paragraphs;
  const count = f.calls.length; assert.equal(await input.applyProposal(proposal), false);
  assert.equal(f.calls.length, count); assert.equal(f.controller.hasUnsavedChanges(), false); assert.deepEqual(f.view().editable.sections[1], draftView().editable.sections[1]);
});

test('offene Eingaben und neuer Arbeitsbereich verhindern die Annahme eines früheren Artseitenvorschlags', async () => {
  for (const change of [async (f) => { await f.type('Seitentitel', 'Eigene neuere Eingabe'); }, async (f) => { f.state.workspaceEpoch++; f.controller.stateChanged(); },
    async (f) => { f.state.workspaceStatus.permissions.canEdit = false; f.controller.stateChanged(); }]) {
    const initial = draftView(); initial.editable.images[0].assetId = 'image-11111111-2222-4333-8444-555555555555'; initial.draft.document.images = clone(initial.editable.images);
    const f = fixture({ ai: true, localImage: true, view: initial }); await f.controller.open(f.species); await f.click('Alternativtext vorschlagen');
    const input = f.aiOpened[0]; await change(f); const count = f.calls.length;
    assert.equal(await input.isCurrent(), false); assert.equal(await input.applyProposal('Veralteter Alttext'), false); assert.equal(f.calls.length, count);
    assert.equal(f.view().editable.images[0].alt, initial.editable.images[0].alt);
  }
});

test('bearbeitbare Fachtexte und Bildtexte verwenden deutsche Rechtschreibprüfung ohne ID- oder URLprüfung', async () => {
  const f = fixture(); await f.controller.open(f.species);
  for (const label of ['Einleitung: Absatz 2', 'Aussehen: Listeneintrag 1.1', 'Alternativtext Bild 1', 'Bildunterschrift Bild 1', 'Bildquelle für neue Bilder']) {
    assert.equal(f.input(label).spellcheck, true, label); assert.equal(f.input(label).lang, 'de', label);
  }
  assert.notEqual(f.input('Website-Zielbereich').spellcheck, true);
  assert.notEqual(f.input('Quellenadresse (optional)').spellcheck, true);
});


const activeLanguage = (f, label) => f.inline.findLast(entry => !entry.disposed && entry.textarea.getAttribute('aria-label') === label);

test('inline language binds individual unsaved text fields and routes heading, caption and normal text without a start action', async () => {
  const reviews = [], f = fixture({ inline: true, reviewLanguage: async (text, options) => { reviews.push({ text, options }); return { findings: [] }; } });
  await f.controller.open(f.species);
  assert.equal(f.button('Sprache prüfen'), undefined); assert.equal(reviews.length, 0);
  assert.equal(activeLanguage(f, 'Website-Zielbereich'), undefined);
  for (const [label, expected] of [['Seitentitel', 'heading'], ['Überschrift appearance', 'heading'],
    ['Einleitung: Zwischenüberschrift 1', 'heading'], ['Aussehen: Listeneintrag 1.1', 'text'], ['Alternativtext Bild 1', 'caption'], ['Bildunterschrift Bild 1', 'caption']]) {
    const field = f.input(label), input = activeLanguage(f, label); assert.ok(input, label);
    assert.equal(field.tagName, 'TEXTAREA'); assert.equal(field.lang, 'de'); assert.equal(field.spellcheck, true);
    assert.equal(input.isCurrent({ text: field.value }), true);
    await input.review(field.value, { signal: new AbortController().signal }); assert.equal(reviews.at(-1).options.context, expected);
  }
  const input = activeLanguage(f, 'Aussehen: Listeneintrag 1.1');
  const before = clone(f.view().editable), count = f.calls.length;
  await f.type('Aussehen: Listeneintrag 1.1', 'Der vogel sitzt hier');
  assert.equal(input.onApply({ text: input.textarea.value, nextText: 'Der Vogel sitzt hier' }), true);
  input.textarea.value = 'Der Vogel sitzt hier'; await input.textarea.emit('input');
  assert.equal(f.controller.hasUnsavedChanges(), true); assert.equal(f.calls.length, count);
  assert.deepEqual(f.view().editable, before); assert.equal(f.input('Bildunterschrift Bild 1').value, before.images[0].caption);
  await f.click('Entwurf speichern'); assert.equal(f.view().editable.sections[1].blocks[0].items[0], 'Der Vogel sitzt hier');
  assert.deepEqual(f.view().editable.sections[1].sources, before.sections[1].sources);
});

test('late inline review and acceptance fail after newer input, authority changes or a structural rerender', async () => {
  const gate = deferred(), f = fixture({ inline: true, reviewLanguage: () => gate.promise }); await f.controller.open(f.species);
  const input = activeLanguage(f, 'Aussehen: Listeneintrag 1.1'), original = input.textarea.value;
  const pending = input.review(original); await f.type('Aussehen: Listeneintrag 1.1', 'Eigene neue Fassung'); gate.resolve({ findings: [] });
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(input.onApply({ text: original, nextText: 'Späte Korrektur' }), false);
  const current = activeLanguage(f, 'Bildunterschrift Bild 1'); f.state.workspaceStatus.readOnlySession = true;
  assert.equal(current.isCurrent({ text: current.textarea.value }), false); f.state.workspaceStatus.readOnlySession = false;
  f.state.workspaceStatus.user = { id: 'other-person', role: 'admin', version: 1 };
  assert.equal(current.isCurrent({ text: current.textarea.value }), false);
  f.state.workspaceStatus.user = undefined;
  await f.click('Absatz hinzufügen');
  assert.equal(input.disposed, true); assert.equal(input.isCurrent({ text: input.textarea.value }), false);
});

test('inline correction respects the original field limit and disposal on close while ordinary input works without a checker', async () => {
  const f = fixture({ inline: true, reviewLanguage: async () => ({ findings: [] }) }); await f.controller.open(f.species);
  const caption = activeLanguage(f, 'Bildunterschrift Bild 1'), value = caption.textarea.value;
  assert.equal(caption.onApply({ text: value, nextText: 'a'.repeat(3001) }), false);
  assert.equal(caption.onApply({ text: value, nextText: 'bad\0text' }), false);
  assert.equal(await f.controller.close(), true); assert.equal(caption.disposed, true);
  assert.equal(caption.onApply({ text: value, nextText: 'Später' }), false);
  const plain = fixture(); await plain.controller.open(plain.species); await plain.type('Aussehen: Listeneintrag 1.1', 'Eigener Text');
  assert.equal(plain.controller.hasUnsavedChanges(), true); assert.equal(plain.button('Sprache prüfen'), undefined);
});
