import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-species-actions.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-species-actions.js" }).runInContext(context);
const actionsModule = context.SpeciesExplorerSpeciesActions;

class ApprovalElement {
  constructor(tag = "div") { this.tagName = tag.toUpperCase(); this.children = []; this.className = ""; this.disabled = false; this.hidden = false; this.listeners = new Map(); this._text = ""; this.open = false; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set innerHTML(_value) { throw new Error("Approval content must use safe DOM nodes."); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ""; this.children = [...children]; }
  addEventListener(type, listener) { const values = this.listeners.get(type) || []; values.push(listener); this.listeners.set(type, values); }
  querySelectorAll(selector) { return approvalNodes(this).filter(node => selector.startsWith(".") ? node.className.split(/\s+/).includes(selector.slice(1)) : node.tagName.toLowerCase() === selector); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  async emit(type, { force = false } = {}) { if (this.disabled && !force) return; for (const listener of this.listeners.get(type) || []) await listener({ preventDefault() {}, target: this }); }
}
const approvalNodes = root => root.children.flatMap(child => [child, ...approvalNodes(child)]);
const cloneApproval = value => JSON.parse(JSON.stringify(value));
const approvalDeferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function settleApproval() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }
const approvalFiles = [{ slot: "portrait.webp", label: "Artporträt", bytes: 123 }, { slot: "map.jpg", label: "Verbreitungskarte", bytes: 456 }];
function approvalPreview({ modern = false, missing = false, preparation = false, alreadyApproved = false } = {}, serial = 1) {
  const species = { id: "fixture-owl", revision: "server-revision", ordinal: 3, germanName: "Testkauz", scientificName: "Strix fixture", englishName: "Fixture owl",
    manual: { size: "42 cm", weight: "300 g", lifeExpectancy: "15 Jahre" }, dataIssues: [], assetIssues: [], privateOriginal: "PRIVATE_ORIGINAL_REGISTER" };
  const result = { token: `approval-token-${serial}`, sourceScope: "approval-scope", species,
    readerSpecies: { id: species.id, scientificName: species.scientificName, commonName: species.germanName, taxonomy: [{ rank: "Class", name: "Aves" }],
      sections: [{ id: "legacy-section", title: "Bisheriger Text", text: "Vorhandener öffentlicher Text", intentionallyEmpty: false }],
      media: { portrait: { id: "old-portrait", url: "https://example.org/portrait.webp" }, map: null, sounds: [], gallery: [] } }, warnings: [] };
  if (!modern) return result;
  const normal = (slot, ready) => ({ kind: ready ? "project-normal" : "unavailable", id: `PRIVATE_NORMAL_ID_${slot}`, projectId: "project-fixture", sha256: "a".repeat(64),
    bytes: slot === "portrait.webp" ? 123 : 456, mimeType: slot === "map.jpg" ? "image/jpeg" : "image/webp", attribution: "FN-Aufnahme",
    ...(ready ? { contentId: `normal-${"b".repeat(64)}` } : { reason: "not-provided" }) });
  const managed = { kind: "project-image", id: "image-11111111-1111-4111-8111-111111111111", projectId: "project-fixture", sha256: "c".repeat(64), bytes: 321, mimeType: "image/png", attribution: "FN" };
  result.readerCatalogVersion = 2; result.alreadyApproved = alreadyApproved;
  result.readerSpecies = { id: species.id, scientificName: species.scientificName, commonName: species.germanName,
    taxonomy: [{ rank: "Class", name: "Aves" }, { rank: "internal_registration", name: "PRIVATE_TAXON_REGISTRATION" }],
    general: [{ label: "Größe", value: "42 cm" }], status: { category: "LC", status: "Least Concern", trend: "Stabil", population: "Unbekannt" }, websiteUrl: null,
    content: { kind: "structured", title: "Redaktioneller Titel", introduction: [{ type: "paragraph", text: "Erhaltene Einleitung" }],
      sections: [{ id: "general", kind: "general-module", title: "Allgemein", requested: true, blocks: [], sources: [], intentionallyEmpty: false },
        { id: "appearance", kind: "editorial", title: "Aussehen", requested: true, blocks: [{ type: "heading", level: 5, text: "Kräftiger Schnabel" }, { type: "numbered-list", items: ["Erster Punkt", "Zweiter Punkt"] }],
          sources: [{ id: "PRIVATE_SOURCE_ID", label: "Abschnittsquelle", url: "https://example.org/section", sha256: "d".repeat(64) }], intentionallyEmpty: false },
        { id: "habitat", kind: "editorial", title: "Lebensraum", requested: true, blocks: [], sources: [], intentionallyEmpty: true },
        { id: "map", kind: "map-module", title: "Verbreitungskarte", requested: true, blocks: [], sources: [], intentionallyEmpty: false }],
      sources: [{ id: "PRIVATE_PAGE_SOURCE_ID", label: "Seitenquelle", url: "https://example.org/reference", sha256: "e".repeat(64) }], galleryRequested: true },
    media: { portrait: normal("portrait.webp", !missing), map: normal("map.jpg", !missing), spectrogram: null,
      sounds: [{ kind: "public-https", id: "public-sound", url: "https://example.org/sound.mp3", attribution: "Eigene Stimme" }],
      gallery: [{ id: "PRIVATE_USAGE_FIRST", asset: managed, alt: "Exakter Alternativtext ohne Punkt", caption: "Erste sichtbare Beschriftung", decorative: false, order: 0 },
        { id: "PRIVATE_USAGE_SECOND", asset: { ...managed }, alt: "", caption: "Zweite sichtbare Beschriftung", decorative: true, order: 1 },
        { id: "PRIVATE_USAGE_PUBLIC", asset: { kind: "public-https", id: "public-photo", url: "https://example.org/photo.jpg" }, alt: "Öffentliche Aufnahme", caption: "Dritte Beschriftung", decorative: false, order: 2 }] } };
  result.missingMedia = missing ? [{ role: "portrait", id: "PRIVATE_NORMAL_ID_portrait.webp" }, { role: "map", id: "PRIVATE_NORMAL_ID_map.jpg" }] : [];
  result.mediaPreparation = { available: preparation, files: preparation ? cloneApproval(approvalFiles) : [], totalBytes: preparation ? 579 : 0 };
  return result;
}
function createApprovalFixture(options = {}) {
  const detail = new ApprovalElement(), dialog = new ApprovalElement("dialog"), content = new ApprovalElement(), message = new ApprovalElement("p");
  const open = new ApprovalElement("button"), prepare = new ApprovalElement("button"), apply = new ApprovalElement("button"), close = new ApprovalElement("button");
  for (const [node, name] of [[dialog, "dialog"], [content, "content"], [message, "message"], [open, "open"], [prepare, "preview"], [apply, "confirm"], [close, "close"]]) node.className = `species-approval-${name}`;
  prepare.textContent = "Vorschau laden"; dialog.append(content, message, prepare, apply, close); detail.append(open, dialog);
  const state = { workspace: "shared-project", workspaceEpoch: 1, selectedId: "fixture-owl", editMode: true, notice: "",
    workspaceStatus: { sourceScope: "approval-scope", connection: "online", readOnlySession: false, user: { id: "owner-a", role: "admin" }, permissions: { canApprove: true } } };
  const calls = [], documentRef = { createElement: tag => new ApprovalElement(tag) }; let previews = 0, provided = false, loaded = 0;
  const fixture = { state, calls, dialog, content, message, open, prepare, apply, close, get previews() { return previews; }, get loaded() { return loaded; } };
  const controller = actionsModule.createSpeciesActionsController({ state, elements: { detailPanel: detail }, documentRef,
    fetchJson: async (url, request = {}) => {
      const call = { url, body: request.body ? JSON.parse(request.body) : null, method: request.method || "GET" }; calls.push(call);
      const custom = options.request ? await options.request(call, fixture) : undefined; if (custom !== undefined) return custom;
      if (url.endsWith("/preview")) return approvalPreview({ ...options, missing: !provided && options.missing, preparation: !provided && options.preparation }, ++previews);
      if (url.endsWith("/provide-media")) { provided = true; return { provided: true, completed: cloneApproval(approvalFiles), stopped: null, requiresNewReview: true, externalPublication: "not-performed" }; }
      if (url.endsWith("/approve")) return { approved: true, serverConfirmed: true, sourceScope: "approval-scope", reviewedRevision: "server-revision", approvedRevision: "server-revision", hasNewerLocalChanges: false, externalPublication: "not-performed" };
      throw new Error("Unexpected approval fixture request");
    }, showQuickConfirm: async () => false, createDialogController(configuration) {
      const result = { open() { dialog.open = true; }, close() { if (configuration.beforeClose?.() === false) return; dialog.open = false; configuration.afterClose?.(); } };
      for (const button of configuration.closeButtons || []) button.addEventListener("click", () => result.close()); return result;
    }, escapeHtml: String, backupRetentionText: () => "", releaseDetailMedia() {}, releaseMediaWithin(node) {
      for (const item of approvalNodes(node)) if (["IMG", "AUDIO"].includes(item.tagName)) item.src = "";
    }, loadData: async () => { loaded++; }, delay: async () => {} });
  fixture.controller = controller;
  fixture.approval = controller.setupSpeciesApproval({ id: "fixture-owl", source: "shared-project", canApprove: true, sourceScope: "approval-scope", revision: "server-revision", editRevision: "edit-revision" });
  fixture.provide = () => approvalNodes(content).find(node => node.tagName === "BUTTON" && node.textContent === "Artdateien bereitstellen");
  fixture.click = async node => { assert.ok(node); await node.emit("click"); await settleApproval(); };
  return fixture;
}

test("legacy approval rendering and its token payload remain unchanged", async () => {
  const f = createApprovalFixture(); await f.click(f.open);
  assert.match(f.content.textContent, /Vorhandener öffentlicher Text/); assert.equal(f.apply.disabled, false); assert.equal(f.provide(), undefined);
  assert.deepEqual(f.calls[0].body, { sourceScope: "approval-scope", expectedEditRevision: "edit-revision", expectedRevision: "server-revision" });
  await f.click(f.apply); assert.deepEqual(f.calls[1].body, { token: "approval-token-1" }); assert.equal(f.loaded, 1);
});

test("Reader2 approval presents rich text, sources, image usage order and private availability without raw source data or invented media urls", async () => {
  const f = createApprovalFixture({ modern: true }); await f.click(f.open);
  assert.equal(f.apply.disabled, false);
  for (const text of ["Redaktioneller Titel", "Erhaltene Einleitung", "Kräftiger Schnabel", "Erster Punkt", "Zweiter Punkt", "Abschnittsquelle", "Seitenquelle", "Bewusst leer gelassen", "Exakter Alternativtext ohne Punkt", "Bewusst dekorativ"]) assert.ok(f.content.textContent.includes(text), text);
  assert.ok(f.content.textContent.indexOf("Erste sichtbare Beschriftung") < f.content.textContent.indexOf("Zweite sichtbare Beschriftung"));
  assert.doesNotMatch(f.content.textContent, /PRIVATE_|[a-f0-9]{64}|sourceBindings|schemaVersion|normal-|image-11111111/);
  const media = approvalNodes(f.content).filter(node => ["IMG", "AUDIO"].includes(node.tagName)); assert.ok(media.length > 0);
  assert.ok(media.every(node => node.src.startsWith("https://example.org/"))); assert.equal(f.content.querySelector("script"), null);
  assert.equal(f.calls.some(call => call.url.endsWith("/approve")), false);
});

test("Reader2 also preserves a legacy-section species while showing the extended media form", async () => {
  const f = createApprovalFixture({ modern: true, request(call) {
    if (call.url.endsWith("/preview")) { const result = approvalPreview({ modern: true }); result.readerSpecies.content = { kind: "legacy-sections", sections: approvalPreview().readerSpecies.sections }; return result; }
  } });
  await f.click(f.open); assert.match(f.content.textContent, /Vorhandener öffentlicher Text/); assert.match(f.content.textContent, /Datei im gemeinsamen Projekt bereitgestellt/);
  assert.equal(f.apply.disabled, false); assert.doesNotMatch(f.content.textContent, /PRIVATE_|[a-f0-9]{64}/);
});

test("Reader2 missing media block both the confirm control and a direct approve call", async () => {
  const f = createApprovalFixture({ modern: true, missing: true }); await f.click(f.open);
  assert.equal(f.apply.disabled, true); assert.match(f.content.textContent, /Leserfreigabe.*gesperrt/);
  await f.approval.approve(); await f.apply.emit("click", { force: true }); await settleApproval();
  assert.equal(f.calls.some(call => call.url.endsWith("/approve")), false); assert.equal(f.provide(), undefined);
});

test("explicit normal media provision consumes its token and loads only a new read preview before separate approval", async () => {
  const f = createApprovalFixture({ modern: true, missing: true, preparation: true }); await f.click(f.open);
  assert.equal(f.apply.disabled, true); const provide = f.provide(); assert.ok(provide); await f.click(provide);
  const provided = f.calls.find(call => call.url.endsWith("/provide-media")); assert.deepEqual(provided.body, { token: "approval-token-1" });
  assert.equal(f.previews, 2); assert.equal(f.calls.some(call => call.url.endsWith("/approve")), false); assert.equal(f.apply.disabled, false);
  assert.equal(f.calls.filter(call => call.url.endsWith("/preview"))[0].body.readerCatalogVersion, undefined);
  assert.equal(f.calls.filter(call => call.url.endsWith("/preview"))[1].body.readerCatalogVersion, 2);
  assert.match(f.message.textContent, /neu geladene Leserfassung/); await f.click(f.apply);
  assert.deepEqual(f.calls.find(call => call.url.endsWith("/approve")).body, { token: "approval-token-2" });
});

test("a partial provision result keeps completed files and requires an explicit new preview without retry or approval", async () => {
  const f = createApprovalFixture({ modern: true, missing: true, preparation: true, request(call) {
    if (call.url.endsWith("/provide-media")) return { provided: false, completed: [{ slot: "portrait.webp", bytes: 123 }],
      stopped: { slot: "map.jpg", code: "normal_media_changed", message: "PRIVATE detail" }, requiresNewReview: true, externalPublication: "not-performed" };
  } });
  await f.click(f.open); const provide = f.provide(); await f.click(provide);
  assert.equal(f.previews, 1); assert.equal(f.apply.disabled, true); assert.equal(provide.hidden, true);
  assert.match(f.message.textContent, /Verbreitungskarte/); assert.match(f.message.textContent, /Bereits bestätigte Dateien bleiben/); assert.doesNotMatch(f.message.textContent, /PRIVATE/);
  await provide.emit("click", { force: true }); await settleApproval(); assert.equal(f.calls.filter(call => call.url.endsWith("/provide-media")).length, 1);
  assert.equal(f.calls.some(call => call.url.endsWith("/approve")), false); await f.click(f.prepare); assert.equal(f.previews, 2);
});

test("lost provision confirmation preserves a clear pending-review state without exposing error internals or retrying", async () => {
  const f = createApprovalFixture({ modern: true, missing: true, preparation: true, request(call) { if (call.url.endsWith("/provide-media")) throw new Error("PRIVATE server path C:/data/file.webp"); } });
  await f.click(f.open); await f.click(f.provide());
  assert.equal(f.apply.disabled, true); assert.equal(f.previews, 1); assert.match(f.message.textContent, /Keine automatische Wiederholung/);
  assert.doesNotMatch(f.message.textContent, /PRIVATE|C:\//); assert.equal(f.calls.filter(call => call.url.endsWith("/provide-media")).length, 1);
});

test("Reader2 preview ignores a late response after a still-approving role change", async () => {
  const waiting = approvalDeferred(), f = createApprovalFixture({ modern: true, request(call) { if (call.url.endsWith("/preview")) return waiting.promise; } });
  const task = f.approval.previewApproval(); await settleApproval(); f.state.workspaceStatus.user.role = "publisher"; f.controller.renderSpeciesActions();
  waiting.resolve(approvalPreview({ modern: true })); await task;
  assert.equal(f.apply.disabled, true); assert.equal(f.content.textContent, ""); assert.equal(f.calls.some(call => call.url.endsWith("/approve")), false);
});

test("media provision responses cannot expose an old person's reader or load a new preview after owner drift", async () => {
  const waiting = approvalDeferred(), f = createApprovalFixture({ modern: true, missing: true, preparation: true, request(call) { if (call.url.endsWith("/provide-media")) return waiting.promise; } });
  await f.click(f.open); const task = f.approval.provideMedia(); await settleApproval();
  f.state.workspaceStatus.sourceScope = "another-person"; f.controller.renderSpeciesActions();
  waiting.resolve({ provided: true, completed: cloneApproval(approvalFiles), stopped: null, requiresNewReview: true, externalPublication: "not-performed" }); await task;
  assert.equal(f.content.textContent, ""); assert.equal(f.previews, 1); assert.equal(f.loaded, 0); assert.equal(f.state.notice, "");
});

test("read mode, changed selection and lost approval permission block provision and approval before dispatch", async () => {
  for (const change of [f => { f.state.editMode = false; }, f => { f.state.selectedId = "another-species"; }, f => { f.state.workspaceStatus.permissions.canApprove = false; },
    f => { f.state.workspaceStatus.readOnlySession = true; }, f => { f.state.workspaceStatus.user.role = "reader"; }]) {
    const f = createApprovalFixture({ modern: true, missing: true, preparation: true }); await f.click(f.open); change(f); f.controller.renderSpeciesActions();
    await f.approval.provideMedia(); await f.approval.approve(); assert.equal(f.apply.disabled, true);
    assert.equal(f.calls.some(call => /\/(?:provide-media|approve)$/.test(call.url)), false);
  }
});

test("contradictory provision summaries do not trigger a new preview or enable approval", async () => {
  for (const completed of [[{ slot: "unknown-slot", bytes: 123 }], [{ slot: "portrait.webp", bytes: 999 }], [{ slot: "portrait.webp", bytes: 123 }]]) {
    const f = createApprovalFixture({ modern: true, missing: true, preparation: true, request(call) {
      if (call.url.endsWith("/provide-media")) return { provided: true, completed, stopped: null, requiresNewReview: true, externalPublication: "not-performed" };
    } });
    await f.click(f.open); await f.click(f.provide()); assert.equal(f.previews, 1); assert.equal(f.apply.disabled, true); assert.equal(f.calls.some(call => call.url.endsWith("/approve")), false);
  }
});

test("already-approved Reader2 still allows missing normal media to be provided but never repeats the approval", async () => {
  const f = createApprovalFixture({ modern: true, missing: true, preparation: true, alreadyApproved: true }); await f.click(f.open);
  assert.equal(f.apply.disabled, true); assert.match(f.content.textContent, /bereits intern freigegeben/); assert.ok(f.provide());
  await f.click(f.provide()); assert.equal(f.previews, 2); assert.equal(f.apply.disabled, true); assert.match(f.message.textContent, /bereits intern freigegeben/);
  await f.approval.approve(); assert.equal(f.calls.some(call => call.url.endsWith("/approve")), false);
});

test("successfully provided normal files do not unlock a reader with another remaining missing gallery use", async () => {
  let reads = 0;
  const f = createApprovalFixture({ modern: true, missing: true, preparation: true, request(call) {
    if (call.url.endsWith("/preview") && ++reads === 2) {
      const result = approvalPreview({ modern: true }, 2); result.missingMedia = [{ role: "gallery", id: "PRIVATE_USAGE_FIRST" }]; return result;
    }
  } });
  await f.click(f.open); await f.click(f.provide()); assert.equal(f.apply.disabled, true);
  assert.match(f.message.textContent, /noch weitere benötigte Dateien offen/); assert.equal(f.calls.some(call => call.url.endsWith("/approve")), false);
});

test("late approval confirmation after a still-authorized role change cannot display success or reload another context", async () => {
  const waiting = approvalDeferred(), f = createApprovalFixture({ modern: true, request(call) { if (call.url.endsWith("/approve")) return waiting.promise; } });
  await f.click(f.open); const task = f.approval.approve(); await settleApproval(); f.state.workspaceStatus.user.role = "publisher"; f.controller.renderSpeciesActions();
  waiting.resolve({ approved: true, serverConfirmed: true, sourceScope: "approval-scope", reviewedRevision: "server-revision", approvedRevision: "server-revision", hasNewerLocalChanges: false, externalPublication: "not-performed" }); await task;
  assert.equal(f.state.notice, ""); assert.equal(f.loaded, 0); assert.equal(f.content.textContent, "");
});

class FakeElement {
  constructor() {
    this.textContent = "";
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.innerHTML = "";
    this.listeners = new Map();
    this.matches = new Map();
    this.matchLists = new Map();
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => {
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelector(selector) {
    return this.matches.get(selector) || null;
  }

  querySelectorAll(selector) {
    return this.matchLists.get(selector) || [];
  }

  replaceChildren() {
    this.innerHTML = "";
  }

  async emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      await listener(event);
    }
  }
}

function createFixture({ fetchJson, showQuickConfirm, openPipelinePreview } = {}) {
  const detailPanel = new FakeElement();
  const elementsBySelector = {
    ".refresh-species-open": new FakeElement(),
    ".delete-dialog": new FakeElement(),
    ".delete-species-open": new FakeElement(),
    ".delete-form": new FakeElement(),
    ".delete-message": new FakeElement(),
    ".delete-effects": new FakeElement(),
    ".delete-assets-now": new FakeElement(),
    ".delete-assets-warning": new FakeElement(),
    ".delete-confirm": new FakeElement(),
  };
  const cancelButton = new FakeElement();
  detailPanel.matches = new Map(Object.entries(elementsBySelector));
  detailPanel.matchLists.set(".delete-cancel", [cancelButton]);

  const state = {
    selectedId: "pantheraleo",
    notice: "",
    openPipelinePreview,
  };
  const dialogEvents = [];
  const calls = [];
  const runtime = {
    state,
    elements: { detailPanel },
    fetchJson: async (...args) => {
      calls.push(args);
      return fetchJson(...args);
    },
    showQuickConfirm,
    createDialogController: () => ({
      open() {
        dialogEvents.push("open");
      },
      close(reason) {
        dialogEvents.push(`close:${reason}`);
      },
    }),
    escapeHtml: (value) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;"),
    backupRetentionText: () => " Backupbestand: 1 Datei.",
    releaseDetailMedia: () => {
      runtime.mediaReleased = true;
    },
    loadData: async () => {
      runtime.dataLoaded = true;
    },
    delay: async (milliseconds) => {
      runtime.delayMilliseconds = milliseconds;
    },
    mediaReleased: false,
    dataLoaded: false,
    delayMilliseconds: 0,
  };
  const controller = actionsModule.createSpeciesActionsController(runtime);
  return {
    controller,
    state,
    calls,
    dialogEvents,
    runtime,
    ...elementsBySelector,
  };
}

test("Artaktionen erzeugen klare Aktualisierungs- und Löschtexte", () => {
  assert.deepEqual(
    { ...actionsModule.refreshConfirmation({ germanName: "Löwe" }) },
    {
      eyebrow: "Art aktualisieren",
      title: "Automatische Aktualisierung",
      message: "Automatische Aktualisierung für Löwe wirklich ausführen?",
      confirmLabel: "Ja, aktualisieren",
      cancelLabel: "Abbrechen",
    },
  );
  assert.deepEqual(
    { ...actionsModule.deleteModePresentation(false) },
    {
      confirmLabel: "Aus Artenliste entfernen",
      warning: "Ohne Auswahl bleiben generierte Daten und Assets bis zum separaten Bereinigungslauf bestehen.",
      danger: false,
    },
  );
  assert.match(actionsModule.deleteModePresentation(true).warning, /nicht wiederherstellbar/);
  assert.equal(
    actionsModule.deleteSuccessNotice({
      inputEntryRemoved: true,
      deleted: { germanName: "Löwe" },
      backup: "species_list-backup.json",
      permanentCleanup: true,
    }, () => " Backupbestand: 1 Datei."),
    "Löwe wurde aus der Eingabeliste entfernt. Sicherung: species_list-backup.json."
      + " Backupbestand: 1 Datei. Generierte Daten und Assetordner wurden dauerhaft gelöscht.",
  );
});

test("Art aktualisieren startet nur nach Bestätigung den gezielten stillen Lauf", async () => {
  const prompts = [];
  const pipelineCalls = [];
  const fixture = createFixture({
    fetchJson: async () => ({}),
    showQuickConfirm: async (prompt) => {
      prompts.push(prompt);
      return true;
    },
    openPipelinePreview: async (...args) => {
      pipelineCalls.push(args);
      return { noWork: true, message: "Keine Änderung erforderlich." };
    },
  });
  fixture.controller.setupSpeciesRefresh({ id: "pantheraleo", germanName: "Löwe" });

  await fixture[".refresh-species-open"].emit("click");
  assert.equal(pipelineCalls[0][0], "all");
  assert.deepEqual(JSON.parse(JSON.stringify(pipelineCalls[0][1])), {
    targetSlugs: ["pantheraleo"],
    silent: true,
    speciesRefresh: true,
  });
  assert.equal(prompts[0].message, "Automatische Aktualisierung für Löwe wirklich ausführen?");
  assert.equal(prompts[1].title, "Keine Aktualisierung gestartet");
  assert.equal(fixture[".refresh-species-open"].disabled, false);
});

test("Fehler beim Artlauf bleiben verständlich und geben die Schaltfläche frei", async () => {
  const prompts = [];
  const fixture = createFixture({
    fetchJson: async () => ({}),
    showQuickConfirm: async (prompt) => {
      prompts.push(prompt);
      return prompts.length === 1;
    },
    openPipelinePreview: async () => {
      throw new Error("Pipeline ist belegt");
    },
  });
  fixture.controller.setupSpeciesRefresh({ id: "pantheraleo", germanName: "Löwe" });

  await fixture[".refresh-species-open"].emit("click");
  assert.equal(prompts[1].title, "Aktualisierung konnte nicht gestartet werden");
  assert.equal(prompts[1].message, "Pipeline ist belegt");
  assert.equal(fixture[".refresh-species-open"].disabled, false);
});

test("Löschvorschau maskiert Auswirkungen und erzwingt notwendige Assetlöschung", async () => {
  const fixture = createFixture({
    fetchJson: async () => ({
      token: "preview-token",
      effects: ["Eintrag <Löwe> entfernen"],
      requiresAssetDeletion: true,
      assetDirectoryExists: true,
    }),
    showQuickConfirm: async () => false,
    openPipelinePreview: async () => ({}),
  });
  fixture.controller.setupSpeciesDelete({
    id: "pantheraleo",
    germanName: "Löwe",
    inGenerated: true,
  });

  await fixture[".delete-species-open"].emit("click");
  assert.equal(fixture.calls[0][0], "/api/species/pantheraleo/delete/preview");
  assert.match(fixture[".delete-effects"].innerHTML, /&lt;Löwe&gt;/);
  assert.equal(fixture[".delete-assets-now"].checked, true);
  assert.equal(fixture[".delete-assets-now"].disabled, true);
  assert.equal(fixture[".delete-confirm"].textContent, "Art und Daten dauerhaft löschen");
  assert.equal(fixture[".delete-confirm"].disabled, false);
  assert.equal(fixture[".delete-message"].textContent, "Löschvorschau ist bereit.");
  assert.deepEqual(fixture.dialogEvents, ["open"]);
});

test("Dauerhaftes Löschen gibt Medien frei, speichert und lädt den Explorer neu", async () => {
  let requestNumber = 0;
  const fixture = createFixture({
    fetchJson: async () => {
      requestNumber += 1;
      if (requestNumber === 1) {
        return {
          token: "preview-token",
          effects: ["Art entfernen"],
          requiresAssetDeletion: false,
          assetDirectoryExists: true,
        };
      }
      return {
        inputEntryRemoved: true,
        deleted: { germanName: "Löwe" },
        backup: "species_list-backup.json",
        permanentCleanup: true,
        pipelineRequired: false,
      };
    },
    showQuickConfirm: async () => false,
    openPipelinePreview: async () => ({}),
  });
  fixture.controller.setupSpeciesDelete({
    id: "pantheraleo",
    germanName: "Löwe",
    inGenerated: true,
  });
  await fixture[".delete-species-open"].emit("click");
  fixture[".delete-assets-now"].checked = true;
  await fixture[".delete-assets-now"].emit("change");
  await fixture[".delete-form"].emit("submit", { preventDefault() {} });

  assert.equal(fixture.calls[1][0], "/api/species/pantheraleo/delete/save");
  assert.deepEqual(JSON.parse(fixture.calls[1][1].body), {
    token: "preview-token",
    deleteAssets: true,
  });
  assert.equal(fixture.runtime.mediaReleased, true);
  assert.equal(fixture.runtime.delayMilliseconds, 800);
  assert.equal(fixture.runtime.dataLoaded, true);
  assert.equal(fixture.state.selectedId, "");
  assert.match(fixture.state.notice, /Löwe wurde aus der Eingabeliste entfernt/);
  assert.deepEqual(fixture.dialogEvents, ["open", "close:programmatic"]);
});
