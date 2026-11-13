import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [headerSource, dialogsSource, html, settingsSource] = await Promise.all([
  readFile(new URL("./public/app-header.js", import.meta.url), "utf8"),
  readFile(new URL("./public/app-dialogs.js", import.meta.url), "utf8"),
  readFile(new URL("./public/index.html", import.meta.url), "utf8"),
  readFile(new URL("./public/app-settings.js", import.meta.url), "utf8"),
]);

function fixture({ editMode = false, realSettings = false } = {}) {
  const nodes = new Map(), calls = [], state = { editMode }, context = vm.createContext({});
  const documentRef = { activeElement: null, listeners: new Map(),
    addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), { fn }]); },
    querySelector(selector) { return selector === "dialog[open]" ? [...nodes.values()].find((node) => node.open) || null : nodes.get(selector); } };
  class Element {
    constructor(id, { parent = null, role = "", editable = false, hidden = false } = {}) {
      this.parentElement = parent; this.hidden = hidden; this.disabled = false; this.open = false; this.listeners = new Map();
      this.children = []; this.attrs = new Map([["id", id], ["role", role]]); this.textContent = "";
      this.classList = { contains: (value) => value === "edit-only" && editable };
      parent?.children.push(this); nodes.set(`#${id}`, this);
    }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.get(name) || null; }
    hasAttribute(name) { return this.attrs.has(name); }
    addEventListener(type, fn, capture = false) { this.listeners.set(type, [...(this.listeners.get(type) || []), { fn, capture }]); }
    removeEventListener() {}
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    querySelectorAll(selector) { return this.children.flatMap((child) => [
      ...(selector === ".edit-only" ? child.classList.contains("edit-only") : child.getAttribute("role") === "menuitem") ? [child] : [],
      ...child.querySelectorAll(selector),
    ]); }
    closest(selector) { return selector === '[role="menuitem"]' && this.getAttribute("role") === "menuitem" ? this : this.parentElement?.closest?.(selector); }
    dispatch(type, value = {}) {
      const path = []; for (let node = this; node; node = node.parentElement) path.push(node); path.push(documentRef);
      const event = { type, target: this, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...value };
      for (const capture of [true, false]) for (const node of capture ? [...path].reverse() : path) {
        for (const listener of node.listeners.get(type) || []) {
          if (Boolean(listener.capture) === capture) listener.fn(event);
          if (event.stopped) return event;
        }
      }
      return event;
    }
    click() { if (!this.disabled) this.dispatch("click"); }
    focus() { documentRef.activeElement = this; this.dispatch("focusin"); }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch("close"); }
  }
  const appButton = new Element("app-menu-button"), webButton = new Element("website-menu-button");
  new Element("database-transfer-button", { hidden: true });
  const appMenu = new Element("app-menu", { hidden: true }), webMenu = new Element("website-menu", { hidden: true });
  for (const id of ["inspection-open", "pipeline-menu-button", "header-backup-open", "header-settings-open"]) {
    new Element(id, { parent: appMenu, role: "menuitem", editable: !["inspection-open", "header-settings-open"].includes(id) });
  }
  for (const id of ["website-pages-check", "website-alt-texts-open"]) new Element(id, { parent: webMenu, role: "menuitem", editable: true });
  const inspection = new Element("inspection-dialog");
  new Element("inspection-close", { parent: inspection }); new Element("inspection-done", { parent: inspection });
  const foreign = new Element("foreign-dialog"), outside = new Element("outside");
  context.document = documentRef;
  new vm.Script(dialogsSource).runInContext(context); new vm.Script(headerSource).runInContext(context);
  const elements = context.SpeciesExplorerHeader.headerElements(documentRef);
  let settingsController;
  if (realSettings) {
    const dialog = new Element("settings-dialog"), close = new Element("settings-close", { parent: dialog });
    dialog.querySelectorAll = () => [close];
    const settingsElements = { settingsDialog: dialog, settingsForm: new Element("settings-form", { parent: dialog }), settingsButtons: [] };
    for (const name of ["settingsMessage", "backupRootInput", "backupRootDefault", "settingsResetButton", "settingsSaveButton"]) settingsElements[name] = new Element(name, { parent: dialog });
    new vm.Script(settingsSource).runInContext(context);
    settingsController = context.SpeciesExplorerSettings.createBackupSettingsController({ state, elements: settingsElements,
      canEdit: () => state.editMode, createDialogController: context.SpeciesExplorerDialogs.createDialogController,
      fetchJson: async (url, options) => { calls.push([url, options?.method || "GET"]); return { backupRoot: "X:\\Sicherung" }; } });
  }
  const controller = context.SpeciesExplorerHeader.setupHeader({ state, elements, documentRef,
    createDialogController: context.SpeciesExplorerDialogs.createDialogController,
    onDatabaseActions: (options) => options.section === "settings" && realSettings ? settingsController.openSettings() : calls.push(["database", options.section]) });
  nodes.get("#pipeline-menu-button").addEventListener("click", () => calls.push(["pipeline"]));
  nodes.get("#website-pages-check").addEventListener("click", () => calls.push(["website"]));
  nodes.get("#website-alt-texts-open").addEventListener("click", () => calls.push(["alt-texts"]));
  return { state, nodes, calls, documentRef, controller, appButton, webButton, appMenu, webMenu, inspection, foreign, outside };
}

test("Menüs öffnen schreibfrei; erst die vorhandene Fachaktion erhält den Klick und das Menü schließt vorher", () => {
  const f = fixture({ editMode: true });
  f.appButton.click(); assert.equal(f.appMenu.hidden, false); assert.deepEqual(f.calls, []);
  assert.equal(f.appButton.getAttribute("aria-expanded"), "true");
  f.nodes.get("#pipeline-menu-button").click();
  assert.deepEqual(f.calls, [["pipeline"]]); assert.equal(f.appMenu.hidden, true);
  f.appButton.click(); f.nodes.get("#header-backup-open").click();
  f.appButton.click(); f.nodes.get("#header-settings-open").click();
  assert.deepEqual(f.calls.slice(1), [["database", "backup"], ["database", "settings"]]);
  f.webButton.click(); f.nodes.get("#website-alt-texts-open").click();
  assert.equal(f.webMenu.hidden, true); assert.deepEqual(f.calls.at(-1), ["alt-texts"]);
});

test("Lesemodus bietet Prüfung, sperrt tatsächliche Website- und Datenaktionen auch über alte Menüklicks", () => {
  const f = fixture();
  assert.equal(f.webButton.disabled, true);
  f.webButton.click(); assert.equal(f.webMenu.hidden, true);
  f.nodes.get("#website-pages-check").click(); f.nodes.get("#pipeline-menu-button").click();
  f.appButton.click(); f.nodes.get("#pipeline-menu-button").click();
  assert.deepEqual(f.calls, []);
  f.appButton.click(); f.nodes.get("#inspection-open").click();
  assert.equal(f.inspection.open, true);
  f.nodes.get("#inspection-close").click();
  assert.equal(f.inspection.open, false); assert.equal(f.documentRef.activeElement, f.appButton);
  f.state.editMode = true; f.controller.render(); f.webButton.click(); assert.equal(f.webMenu.hidden, false);
  f.state.editMode = false; f.controller.render(); assert.equal(f.webMenu.hidden, true);
  f.nodes.get("#website-alt-texts-open").click(); assert.deepEqual(f.calls, []);
});

test("Änderungen offen öffnet die Übertragungsvorschau nur als verfügbare Aktion", () => {
  const f = fixture({ editMode: true });
  const transfer = f.nodes.get("#database-transfer-button");
  transfer.click();
  assert.deepEqual(f.calls, []);
  transfer.hidden = false;
  f.appButton.click();
  transfer.click();
  assert.equal(f.appMenu.hidden, true);
  assert.deepEqual(f.calls, [["database", "transfer"]]);
  f.foreign.open = true;
  transfer.click();
  f.foreign.open = false;
  f.state.editMode = false;
  transfer.click();
  assert.deepEqual(f.calls, [["database", "transfer"]]);
});

test("Pfeiltasten/Home/End, Escape und Tab führen Fokus ohne versteckte Ziele oder fremde Dialoge", () => {
  const f = fixture({ editMode: true });
  f.appButton.dispatch("keydown", { key: "ArrowDown" });
  assert.equal(f.documentRef.activeElement, f.nodes.get("#inspection-open"));
  f.appMenu.dispatch("keydown", { key: "End" }); assert.equal(f.documentRef.activeElement, f.nodes.get("#header-settings-open"));
  f.appMenu.dispatch("keydown", { key: "Home" }); assert.equal(f.documentRef.activeElement, f.nodes.get("#inspection-open"));
  f.appMenu.dispatch("keydown", { key: "ArrowUp" }); assert.equal(f.documentRef.activeElement, f.nodes.get("#header-settings-open"));
  f.appMenu.dispatch("keydown", { key: "Escape" }); assert.equal(f.documentRef.activeElement, f.appButton); assert.equal(f.appMenu.hidden, true);
  f.appButton.click(); f.appMenu.dispatch("keydown", { key: "Tab" }); assert.equal(f.appMenu.hidden, true);
  f.foreign.open = true; f.appButton.click(); f.webButton.click();
  assert.equal(f.appMenu.hidden, true); assert.equal(f.webMenu.hidden, true); assert.equal(f.controller.openInspection(), false);
  f.foreign.open = false; f.appButton.click(); f.outside.dispatch("pointerdown"); assert.equal(f.appMenu.hidden, true);
  f.appButton.click(); f.outside.focus(); assert.equal(f.appMenu.hidden, true);
});

test("Verdeckte oder inzwischen fremd gebundene Menüs können keine alte Fachaktion mehr auslösen", () => {
  const f = fixture({ editMode: true });
  f.nodes.get("#pipeline-menu-button").click(); assert.deepEqual(f.calls, []);
  f.appButton.click(); f.foreign.open = true; f.nodes.get("#pipeline-menu-button").click(); assert.deepEqual(f.calls, []);
  f.foreign.open = false; f.webButton.click(); f.nodes.get("#website-pages-check").disabled = true;
  f.nodes.get("#website-pages-check").click(); assert.deepEqual(f.calls, []);
  f.appButton.click(); assert.equal(f.webMenu.hidden, true, "Nur ein Menü gleichzeitig");
});

test("Echte Settingsnavigation bleibt im Lesemodus im Menü und öffnet den vorhandenen Dialog ausschließlich lesend", async () => {
  const f = fixture({ realSettings: true });
  f.appButton.click(); f.nodes.get("#header-settings-open").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.nodes.get("#settings-dialog").open, true);
  assert.deepEqual(f.calls, [["/api/settings", "GET"]]);
  assert.equal(f.nodes.get("#backupRootInput").value, "X:\\Sicherung");
  assert.equal(f.nodes.get("#backupRootInput").disabled, true); assert.equal(f.nodes.get("#settingsSaveButton").disabled, true);
  const settings = html.slice(html.indexOf('<dialog id="settings-dialog"'), html.indexOf('id="taxonomy-database-dialog"'));
  assert.match(settings, /id="shared-project-open" type="button"/);
  assert.doesNotMatch(settings, /id="shared-project-open"[^>]*edit-only/);
});

test("HTML trennt reine Statusinfo und Modustext von Aktionen und hält alle Bestands-/Prüf-/Website-IDs einmalig", () => {
  const header = html.slice(html.indexOf('<header class="app-header">'), html.indexOf('<div id="validation-issue-notice"'));
  const inspection = html.slice(html.indexOf('<dialog id="inspection-dialog"'), html.indexOf('<dialog id="website-alt-texts-dialog"'));
  assert.match(header, /<div id="database-status"[^>]*role="status"/);
  assert.doesNotMatch(header, /<button[^>]*id="database-status"/);
  assert.match(header, /<button id="database-transfer-button"[^>]*aria-haspopup="dialog"[^>]*hidden>Änderungen offen/);
  assert.match(header, /<button id="edit-mode-toggle"[^>]*>🔒<\/button>/);
  assert.match(header, /id="edit-mode-status">Lesemodus<\/span>/);
  assert.match(header, /id="species-count"/); assert.match(header, /value="local">Lokaler Bestand/);
  assert.match(header, /value="shared-project">Gemeinsamer FN-Bestand/);
  for (const id of ["species-count", "species-workspace", "pipeline-menu-button", "website-pages-check", "website-alt-texts-open",
    "asset-issues", "nc-count", "manual-map-count", "validation-details", "validation-overall", "species-workspace-refresh", "species-workspace-sync"]) {
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`, "g"))].length, 1, id);
  }
  for (const id of ["asset-issues", "validation-overall", "validation-details", "nc-count", "manual-map-count"]) assert.match(inspection, new RegExp(`id="${id}"`));
  assert.doesNotMatch(header, /id="(?:asset-issues|validation-overall|validation-details|shared-project-open)"/);
  assert.ok(html.indexOf('src="/app-header.js"') < html.indexOf('src="/app.js"'));
});
