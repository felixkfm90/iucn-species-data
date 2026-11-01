import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-species-actions.js", import.meta.url), "utf8");
const copy = (value) => structuredClone(value);
const scope = "a".repeat(64), revision = "b".repeat(64), editRevision = "c".repeat(64);
const speciesSeed = () => ({ id: "strix-aluco", source: "shared-project", sourceScope: scope, canApprove: true,
  revision, editRevision, ordinal: 7, germanName: "Waldkauz", scientificName: "Strix aluco", englishName: "Tawny owl",
  manual: { size: "37–43 cm", weight: "330–590 g", lifeExpectancy: "18 Jahre" },
  editorial: { sections: [{ id: "habitat", title: "Lebensraum", text: "Laubwälder und baumreiche Parks", intentionallyEmpty: false },
    { id: "features", title: "Besondere Merkmale", text: "", intentionallyEmpty: true }] } });
const previewSeed = (species = speciesSeed(), token = "review-token-1") => ({ token, sourceScope: species.sourceScope, species: copy(species),
  readerSpecies: { id: species.id, commonName: species.germanName, scientificName: species.scientificName, taxonomy: [],
    sections: copy(species.editorial.sections), media: { sounds: [], gallery: [] } } });
const approvalSeed = (values = {}) => ({ approved: true, serverConfirmed: true, reviewedRevision: revision,
  approvedRevision: revision, hasNewerLocalChanges: false, sourceScope: scope, externalPublication: "not-performed", ...values });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function microtasks() { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); }

class Element {
  constructor(tag = "div") {
    this.tagName = tag; this.children = []; this.listeners = new Map(); this.matches = new Map(); this.matchLists = new Map();
    this.disabled = false; this.hidden = false; this.open = false; this.className = ""; this._text = "";
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set innerHTML(_value) { throw new Error("Freigabevorschauen müssen Benutzerdaten als Text anzeigen."); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ""; this.children = [...children]; }
  querySelector(selector) { return this.matches.get(selector) || null; }
  querySelectorAll(selector) { return this.matchLists.get(selector) || []; }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]); }
  click() { if (!this.disabled) for (const listener of this.listeners.get("click") || []) listener({ target: this }); }
}

function fixture({ species: inputSpecies, state: inputState, fetch: initialFetch, loadData: onLoad } = {}) {
  const species = copy(inputSpecies || speciesSeed());
  const state = { workspace: "shared-project", workspaceEpoch: 4, selectedId: species.id, editMode: true, notice: "",
    workspaceStatus: { sourceScope: species.sourceScope, connection: "online", permissions: { canApprove: true } },
    localEdits: [{ id: "unrelated-species", revision: "unrelated-local-draft" }], ...inputState };
  const dialog = new Element("dialog"), open = new Element("button"), prepare = new Element("button"), apply = new Element("button");
  const content = new Element(), message = new Element("p"), closeButton = new Element("button"), panel = new Element();
  panel.matches.set(".species-approval-dialog", dialog); panel.matches.set(".species-approval-open", open);
  dialog.matches = new Map([[".species-approval-content", content], [".species-approval-message", message],
    [".species-approval-preview", prepare], [".species-approval-confirm", apply]]);
  dialog.matchLists.set(".species-approval-close", [closeButton]);
  const calls = [], loads = [], dialogEvents = [], mediaReleases = [];
  let respond = initialFetch, dialogOptions;
  const context = vm.createContext({});
  new vm.Script(source, { filename: "app-species-actions.js" }).runInContext(context);
  const actions = context.SpeciesExplorerSpeciesActions.createSpeciesActionsController({ state, elements: { detailPanel: panel },
    async fetchJson(url, options) {
      const call = { url, method: options?.method || "GET", body: options?.body ? JSON.parse(options.body) : null };
      calls.push(call);
      if (respond) return respond(call);
      return url.endsWith("/preview") ? previewSeed(species, `review-token-${calls.filter((entry) => entry.url.endsWith("/preview")).length}`) : approvalSeed();
    },
    async loadData() { loads.push({ notice: state.notice, localEdits: copy(state.localEdits) }); await onLoad?.(); },
    createDialogController(options) {
      dialogOptions = options;
      const control = { open() { dialog.open = true; dialogEvents.push("open"); },
        close(reason) {
          if (options.beforeClose?.() === false) return false;
          dialog.open = false; dialogEvents.push(`close:${reason}`); options.afterClose?.(); return true;
        } };
      closeButton.addEventListener("click", () => control.close("button"));
      return control;
    },
    documentRef: { createElement: (tag) => new Element(tag) }, escapeHtml: (value) => String(value),
    releaseMediaWithin(node) { mediaReleases.push(node); },
    showQuickConfirm: async () => { throw new Error("Ein fremder Bestätigungsablauf wurde gestartet."); },
    backupRetentionText: () => "", releaseDetailMedia() {}, delay: async () => {} });
  const controller = actions.setupSpeciesApproval(species);
  return { state, species, controller, dialog, open, prepare, apply, closeButton, content, message, calls, loads, dialogEvents, mediaReleases,
    renderSpeciesActions() { actions.renderSpeciesActions?.(); },
    setFetch(handler) { respond = handler; },
    attemptClose() {
      if (dialogOptions.beforeClose?.() === false) return false;
      dialog.open = false; dialogOptions.afterClose?.(); return true;
    },
    nativeClose() { dialog.open = false; dialogOptions.afterClose?.(); },
    async clickOpen() { open.click(); await microtasks(); },
    async clickApply() { apply.click(); await microtasks(); } };
}

test("Interne Artfreigabe liest erst die konkrete Vorschau und schreibt erst nach dem ausdrücklichen Freigabeklick", async () => {
  const response = deferred(), h = fixture({ fetch(call) {
    return call.url.endsWith("/preview") ? previewSeed() : response.promise;
  } });
  assert.equal(h.calls.length, 0);
  assert.equal(h.loads.length, 0);
  assert.equal(h.apply.disabled, true);
  await h.clickOpen();
  assert.equal(h.dialog.open, true);
  assert.deepEqual(h.calls, [{ url: "/api/shared-project/species/strix-aluco/approval/preview", method: "POST",
    body: { sourceScope: scope, expectedEditRevision: editRevision, expectedRevision: revision } }]);
  assert.equal(h.loads.length, 0);
  for (const text of ["Waldkauz", "Strix aluco", "Fassung 7", "Tawny owl", "37–43 cm", "330–590 g", "18 Jahre",
    "Laubwälder und baumreiche Parks", "Bewusst leer gelassen"]) assert.ok(h.content.textContent.includes(text), text);
  assert.equal(h.apply.disabled, false);
  await h.clickApply();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1], { url: "/api/shared-project/species/strix-aluco/approval/approve", method: "POST", body: { token: "review-token-1" } });
  assert.equal(h.loads.length, 0, "Kein Neuladen vor bestätigter Serverantwort");
  assert.equal(h.state.notice, "");
  response.resolve(approvalSeed()); await microtasks();
  assert.equal(h.loads.length, 1);
  assert.match(h.state.notice, /intern freigegeben/);
  assert.equal(h.dialog.open, false);
  assert.equal(h.dialogEvents.at(-1), "close:approved");
  assert.deepEqual(h.state.localEdits, [{ id: "unrelated-species", revision: "unrelated-local-draft" }]);
  assert.ok(h.calls.every((call) => /\/approval\/(?:preview|approve)$/.test(call.url)), "Keine automatische Synchronisierung oder Veröffentlichung");
});

test("Lokale Arten und Arten ohne Freigaberecht erhalten keinen internen Freigabecontroller", () => {
  for (const changes of [{ source: "local" }, { canApprove: false }]) {
    const h = fixture({ species: { ...speciesSeed(), ...changes } });
    assert.equal(h.controller, null);
    h.open.click();
    assert.equal(h.calls.length, 0);
  }
});

test("Leseansicht, lokaler Arbeitsbereich, Offlinezustand und fehlende Berechtigung starten keine Vorschau oder Freigabe", async () => {
  for (const state of [{ editMode: false }, { workspace: "local" }, { workspaceStatus: { sourceScope: scope, connection: "offline", permissions: { canApprove: true } } },
    { workspaceStatus: { sourceScope: scope, connection: "online", permissions: { canApprove: false } } }]) {
    const h = fixture({ state });
    assert.equal(h.open.disabled, true);
    assert.equal(h.prepare.disabled, true);
    assert.equal(h.apply.disabled, true);
    await h.clickOpen(); await h.controller.previewApproval(); await h.controller.approve();
    assert.deepEqual(h.calls, []);
    assert.equal(h.dialog.open, false);
    assert.equal(h.loads.length, 0);
  }
});

test("Eine Freigabe ohne vorher geprüften Token ist auch bei direktem Aufruf wirkungslos", async () => {
  const h = fixture();
  await h.controller.approve(); await h.clickApply();
  assert.deepEqual(h.calls, []);
  assert.equal(h.loads.length, 0);
});

test("Vorschau zeigt fremde Texte und Prüfhinweise ausschließlich als Text und bewahrt die geprüften Daten", async () => {
  const value = previewSeed();
  value.species.germanName = '<img src=x onerror="danger()">';
  value.species.editorial.sections[0].text = "<script>danger()</script>";
  value.readerSpecies.commonName = value.species.germanName;
  value.readerSpecies.sections[0].text = value.species.editorial.sections[0].text;
  value.warnings = ["<b>Serverhinweis</b>"]; value.species.dataIssues = ["<iframe>Datenhinweis</iframe>"];
  const before = copy(value), h = fixture({ fetch: async () => value });
  await h.clickOpen();
  for (const text of [value.species.germanName, value.species.editorial.sections[0].text, value.warnings[0], value.species.dataIssues[0]]) {
    assert.ok(h.content.textContent.includes(text));
  }
  assert.deepEqual(value, before);
  assert.equal(h.calls.length, 1);
});

test("Fehlende, fremde oder veraltete Vorschau kann keinen Freigabeklick aktivieren", async () => {
  for (const change of [(value) => { delete value.token; }, (value) => { value.token = ""; }, (value) => { value.sourceScope = "foreign-person-scope"; },
    (value) => { value.species.id = "different-owl"; }, (value) => { value.species.revision = "newer-unreviewed-revision"; },
    (value) => { delete value.readerSpecies; }, (value) => { value.readerSpecies.id = "different-reader-owl"; },
    (value) => { delete value.readerSpecies.sections; }, (value) => { delete value.readerSpecies.taxonomy; },
    (value) => { delete value.readerSpecies.media.sounds; }, (value) => { delete value.readerSpecies.media.gallery; }]) {
    const value = previewSeed(); change(value);
    const h = fixture({ fetch: async () => value }); await h.clickOpen();
    assert.equal(h.apply.disabled, true);
    assert.match(h.message.textContent, /nicht eindeutig bestätigt/);
    await h.controller.approve();
    assert.equal(h.calls.length, 1);
    assert.equal(h.loads.length, 0);
  }
});

const sourceChanges = [
  ["Arbeitsbereich", (state) => { state.workspace = "local"; }],
  ["Person oder Projekt", (state) => { state.workspaceStatus.sourceScope = "different-person-or-project"; }],
  ["zwischenzeitlich gewechselter Arbeitsbereich", (state) => { state.workspaceEpoch += 2; }],
  ["andere ausgewählte Art", (state) => { state.selectedId = "different-owl"; }],
];

test("Verspätete Vorschau aus einer früheren Quelle, Person oder Arbeitsbereichsepoche bleibt ohne Wirkung", async () => {
  for (const [name, change] of sourceChanges) {
    const response = deferred(), h = fixture({ fetch: () => response.promise });
    const previewing = h.controller.previewApproval();
    assert.equal(h.calls.length, 1);
    change(h.state); response.resolve(previewSeed()); await previewing;
    assert.equal(h.apply.disabled, true, name);
    assert.equal(h.content.textContent, "", name);
    await h.controller.approve();
    assert.equal(h.calls.length, 1, name);
    assert.equal(h.loads.length, 0, name);
  }
});

test("Verspätete bestätigte Freigabe wird nicht auf eine andere Quelle, Person oder Arbeitsbereichsepoche angewendet", async () => {
  for (const [name, change] of sourceChanges) {
    const response = deferred(), h = fixture({ fetch: (call) => call.url.endsWith("/preview") ? previewSeed() : response.promise });
    await h.clickOpen(); const approving = h.controller.approve();
    change(h.state); response.resolve(approvalSeed()); await approving;
    assert.equal(h.loads.length, 0, name);
    assert.equal(h.state.notice, "", name);
    assert.equal(h.calls.length, 2, name);
  }
});

test("Entzogener Bearbeitungs- oder Freigabemodus sperrt bereits vor dem Freigabeklick", async () => {
  for (const change of [(state) => { state.editMode = false; }, (state) => { state.workspaceStatus.permissions.canApprove = false; }]) {
    const h = fixture(); await h.clickOpen(); change(h.state);
    await h.controller.approve();
    assert.equal(h.calls.length, 1);
    assert.equal(h.loads.length, 0);
  }
});

test("Berechtigungsentzug während einer Anfrage darf verspätete Bestätigung nicht auf die aktuelle Leseansicht anwenden", async () => {
  for (const change of [(state) => { state.editMode = false; }, (state) => { state.workspaceStatus.permissions.canApprove = false; }]) {
    const response = deferred(), h = fixture({ fetch: (call) => call.url.endsWith("/preview") ? previewSeed() : response.promise });
    await h.clickOpen(); const approving = h.controller.approve(); change(h.state);
    response.resolve(approvalSeed()); await approving;
    assert.equal(h.loads.length, 0);
    assert.equal(h.state.notice, "");
  }
});

test("Doppelklick startet je Vorschau und Freigabe nur einen Auftrag; Schließen bleibt während der Anfrage gesperrt", async () => {
  const previewResponse = deferred(), approveResponse = deferred(), h = fixture({ fetch: (call) => call.url.endsWith("/preview") ? previewResponse.promise : approveResponse.promise });
  const previewing = h.controller.previewApproval(); await h.controller.previewApproval();
  assert.equal(h.calls.length, 1);
  assert.equal(h.open.disabled, true); assert.equal(h.closeButton.disabled, true); assert.equal(h.attemptClose(), false);
  previewResponse.resolve(previewSeed()); await previewing;
  const approving = h.controller.approve(); await h.controller.approve();
  assert.equal(h.calls.length, 2);
  assert.equal(h.apply.disabled, true); assert.equal(h.closeButton.disabled, true); assert.equal(h.attemptClose(), false);
  approveResponse.resolve(approvalSeed()); await approving;
  assert.equal(h.loads.length, 1);
});

test("Native Schließung entwertet eine noch ausstehende Vorschau und verhindert einen späteren Freigabeauftrag", async () => {
  const response = deferred(), h = fixture({ fetch: () => response.promise });
  await h.clickOpen(); h.nativeClose(); response.resolve(previewSeed()); await microtasks();
  assert.equal(h.dialog.open, false);
  assert.equal(h.apply.disabled, true);
  assert.equal(h.content.textContent, "");
  await h.controller.approve();
  assert.equal(h.calls.length, 1);
  assert.equal(h.loads.length, 0);
});

test("Fehler und verlorene Freigabeantwort werden nicht wiederholt; ein neuer bewusster Vorschauabruf liefert einen neuen Token", async () => {
  for (const failure of ["Freigabe abgelehnt", "Antwort nach Serverfreigabe verloren"]) {
    let failed = false;
    const h = fixture({ fetch(call) {
      if (call.url.endsWith("/preview")) return previewSeed(speciesSeed(), failed ? "fresh-review-token" : "first-review-token");
      if (!failed) { failed = true; throw new Error(failure); }
      return approvalSeed();
    } });
    await h.clickOpen(); await h.controller.approve();
    assert.equal(h.loads.length, 0);
    assert.equal(h.state.notice, "");
    assert.equal(h.apply.disabled, true);
    assert.match(h.message.textContent, /Keine automatische Wiederholung.*Serverstand lesen/);
    await h.controller.approve();
    assert.equal(h.calls.length, 2, "Kein Wiederholen des verbrauchten Tokens");
    await h.controller.previewApproval(); await h.controller.approve();
    assert.deepEqual(h.calls.filter((call) => call.url.endsWith("/approve")).map((call) => call.body), [
      { token: "first-review-token" }, { token: "fresh-review-token" }]);
    assert.equal(h.loads.length, 1);
  }
});

test("Fehlgeschlagene Vorschau erteilt keine Freigabe und braucht einen neuen bewussten Prüfversuch", async () => {
  const h = fixture({ fetch: async () => { throw new Error("Server nicht erreichbar"); } });
  await h.clickOpen(); await h.controller.approve();
  assert.equal(h.calls.length, 1);
  assert.equal(h.loads.length, 0);
  assert.equal(h.apply.disabled, true);
  assert.match(h.message.textContent, /Server nicht erreichbar/);
  h.setFetch(() => previewSeed()); h.prepare.click(); await microtasks();
  assert.equal(h.calls.length, 2);
  assert.equal(h.apply.disabled, false);
});

test("Nur eine vollständig bestätigte exakt geprüfte Revision darf als interne Freigabe erscheinen", async () => {
  for (const change of [(value) => { value.approved = false; }, (value) => { value.serverConfirmed = false; },
    (value) => { value.reviewedRevision = "different-reviewed-revision"; }, (value) => { value.approvedRevision = "new-unreviewed-revision"; },
    (value) => { value.sourceScope = "foreign-person-scope"; }, (value) => { value.externalPublication = "performed"; },
    (value) => { delete value.hasNewerLocalChanges; }, (value) => { value.hasNewerLocalChanges = "false"; }]) {
    const response = approvalSeed(); change(response);
    const h = fixture({ fetch: (call) => call.url.endsWith("/preview") ? previewSeed() : response });
    await h.clickOpen(); await h.controller.approve();
    assert.equal(h.loads.length, 0, JSON.stringify(response));
    assert.equal(h.state.notice, "");
    assert.equal(h.apply.disabled, true);
    await h.controller.approve(); assert.equal(h.calls.length, 2);
  }
});

test("Neuere lokale Änderungen nach der Serverfreigabe bleiben erhalten und werden ausdrücklich als ungeprüft benannt", async () => {
  const response = deferred(), h = fixture({ fetch: (call) => call.url.endsWith("/preview") ? previewSeed() : response.promise });
  await h.clickOpen(); const approving = h.controller.approve();
  h.state.localEdits.push({ id: h.species.id, revision: "new-local-unreviewed-revision", manual: { size: "Neu bearbeitet" } });
  response.resolve(approvalSeed({ hasNewerLocalChanges: true })); await approving;
  assert.equal(h.loads.length, 1);
  assert.match(h.state.notice, /geprüfte Fassung.*intern freigegeben.*Neuere lokale Änderungen bleiben ungeprüft erhalten/);
  assert.equal(h.state.localEdits.at(-1).revision, "new-local-unreviewed-revision");
  assert.equal(h.loads[0].localEdits.at(-1).revision, "new-local-unreviewed-revision");
  assert.equal(h.calls.filter((call) => call.url.endsWith("/approve")).length, 1);
});

test("Lesemodus zu Bearbeitung aktualisiert Freigabeschalter ohne Neuaufbau der Detailansicht und berücksichtigt anschließenden Rechteverlust", async () => {
  const h = fixture({ state: { editMode: false } });
  const originalController = h.controller;
  assert.equal(h.open.disabled, true);
  await h.clickOpen(); assert.equal(h.calls.length, 0);
  h.state.editMode = true; h.renderSpeciesActions();
  assert.equal(h.controller, originalController, "Der bestehende Controller bleibt gebunden");
  assert.equal(h.open.disabled, false, "Bearbeitungsmodus muss die bereits sichtbare Freigabeaktion aktivieren");
  assert.equal(h.prepare.disabled, false);
  assert.equal(h.apply.disabled, true, "Moduswechsel allein erzeugt keine geprüfte Vorschau");
  assert.equal(h.calls.length, 0, "Moduswechsel allein liest oder genehmigt keine Art");
  await h.clickOpen(); assert.equal(h.calls.length, 1);
  assert.equal(h.apply.disabled, false);
  await h.clickApply(); assert.equal(h.loads.length, 1);
  assert.equal(h.calls.length, 2);
  h.state.workspaceStatus.permissions.canApprove = false; h.renderSpeciesActions();
  assert.equal(h.open.disabled, true);
  assert.equal(h.prepare.disabled, true);
  assert.equal(h.apply.disabled, true);
  await h.clickOpen(); await h.controller.previewApproval(); await h.controller.approve();
  assert.equal(h.calls.length, 2, "Entzogene Rechte verhindern weitere Vorschauen und Freigaben");
});

function descendants(element) { return [element, ...element.children.flatMap(descendants)]; }

test("Freigabevorschau zeigt vollständig die exakte Katalogprojektion samt Taxonomie, abweichenden Lesetexten, Bildern und Ton", async () => {
  const value = previewSeed();
  value.species.editorial.sections = [{ id: "editor-only", title: "Nur Bearbeitungsentwurf", text: "Nicht der gebundene Katalogtext", intentionallyEmpty: false }];
  value.readerSpecies.taxonomy = [{ rank: "order", name: "Strigiformes" }, { rank: "Family", name: "Strigidae" }, { rank: "genus", name: "Strix" }];
  value.readerSpecies.sections = [{ id: "reader-text", title: "Freizugebender Lesertext", text: "Vollständiger Text der geprüften Katalogfassung", intentionallyEmpty: false },
    { id: "reader-empty", title: "Bewusste Leerstelle im Katalog", text: "", intentionallyEmpty: true }];
  value.readerSpecies.media = { portrait: { id: "portrait", url: "https://www.fnwildlifetravel.de/reader/portrait.webp", attribution: "Porträtquelle" },
    map: { id: "map", url: "https://www.fnwildlifetravel.de/reader/map.jpg", attribution: "Kartenquelle" },
    sounds: [{ id: "sound-one", url: "https://www.fnwildlifetravel.de/reader/voice.mp3", attribution: "Erste Tonquelle" },
      { id: "sound-two", url: "https://www.fnwildlifetravel.de/reader/call.mp3", attribution: "Zweite Tonquelle" }],
    gallery: [{ id: "gallery-one", url: "https://www.fnwildlifetravel.de/reader/photo-1.jpg", alt: "Waldkauz am Tag", caption: "Erste sichtbare Bildbeschriftung", attribution: "Erste Fotoquelle", order: 0 },
      { id: "gallery-two", url: "https://www.fnwildlifetravel.de/reader/photo-2.jpg", alt: "Waldkauz bei Nacht", caption: "Zweite sichtbare Bildbeschriftung", attribution: "Zweite Fotoquelle", order: 1 }] };
  const before = copy(value), h = fixture({ fetch: async () => value });
  await h.clickOpen();
  for (const text of ["Ordnung", "Familie", "Gattung", "Strigiformes", "Strigidae", "Freizugebender Lesertext", "Vollständiger Text der geprüften Katalogfassung",
    "Bewusste Leerstelle im Katalog", "Bewusst leer gelassen", "Porträtquelle", "Kartenquelle", "Erste sichtbare Bildbeschriftung",
    "Zweite sichtbare Bildbeschriftung", "Erste Fotoquelle", "Zweite Fotoquelle", "Erste Tonquelle", "Zweite Tonquelle"]) {
    assert.ok(h.content.textContent.includes(text), text);
  }
  assert.doesNotMatch(h.content.textContent, /Nur Bearbeitungsentwurf|Nicht der gebundene Katalogtext/);
  const nodes = descendants(h.content), images = nodes.filter((node) => node.tagName === "img"), audio = nodes.filter((node) => node.tagName === "audio");
  assert.deepEqual(images.map((node) => node.src), [value.readerSpecies.media.portrait.url, value.readerSpecies.media.map.url,
    ...value.readerSpecies.media.gallery.map((file) => file.url)]);
  assert.deepEqual(images.slice(2).map((node) => node.alt), value.readerSpecies.media.gallery.map((file) => file.alt));
  assert.ok(images.every((node) => node.loading === "lazy" && node.referrerPolicy === "no-referrer"));
  assert.deepEqual(audio.map((node) => node.src), value.readerSpecies.media.sounds.map((file) => file.url));
  assert.ok(audio.every((node) => node.controls === true && node.preload === "none" && node.autoplay !== true));
  assert.equal(h.apply.disabled, false);
  assert.equal(h.calls.length, 1, "Medienvorschau genehmigt oder synchronisiert noch nichts");
  assert.equal(h.loads.length, 0);
  assert.deepEqual(value, before);
  assert.equal(h.mediaReleases.at(-1), h.content);
  const previousReleases = h.mediaReleases.length;
  assert.equal(h.attemptClose(), true);
  assert.equal(h.mediaReleases.length, previousReleases + 1);
  assert.equal(h.mediaReleases.at(-1), h.content);
});

test("Eine fehlgeschlagene vollständige Katalogdarstellung darf keinen freigabefähigen Token behalten", async () => {
  const value = previewSeed(); value.readerSpecies.taxonomy = [null];
  const h = fixture({ fetch: async () => value }); await h.clickOpen();
  assert.equal(h.apply.disabled, true, "Eine nicht vollständig prüfbare Fassung darf nicht freigegeben werden");
  await h.controller.approve();
  assert.equal(h.calls.length, 1);
  assert.equal(h.loads.length, 0);
});
