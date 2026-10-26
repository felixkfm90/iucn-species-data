import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sources = await Promise.all(["app-dialogs.js", "app-presentation.js", "app-backup-history.js"].map((file) =>
  readFile(new URL(`./public/${file}`, import.meta.url), "utf8")));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function element() {
  const handlers = new Map();
  return {
    open: false, hidden: false, disabled: false, textContent: "", innerHTML: "", className: "", dataset: {},
    addEventListener(type, fn) { handlers.set(type, [...(handlers.get(type) || []), fn]); },
    removeEventListener(type, fn) { handlers.set(type, (handlers.get(type) || []).filter((entry) => entry !== fn)); },
    emit(type, values = {}) {
      const event = { target: this, preventDefault() { this.prevented = true; }, ...values };
      for (const handler of handlers.get(type) || []) handler(event);
      return event;
    },
    click() { if (!this.disabled) this.emit("click"); },
    showModal() { this.open = true; },
    close() { this.open = false; this.emit("close"); },
    hasAttribute(name) { return name === "open" && this.open; },
    querySelectorAll() { return []; }, querySelector() { return null; },
    contains(target) { return target.parent === this; },
    focus() { this.focused = true; },
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100 }; },
  };
}

const species = { id: "Ciconia_ciconia", germanName: "Weißstorch", scientificName: "Ciconia ciconia", inInput: true };
const backup = (kind, backupId, available = true) => ({
  kind, backupId, available, label: kind === "species" ? "Englischer Name und Messangaben dieser Art" : "Manuelle Taxonomiebearbeitung dieser Art",
  bytes: 180, createdAt: "2026-10-08T08:00:00Z", unavailableReason: available ? null : "Art fehlt in diesem Stand",
});
const savedBackups = [backup("species", "older-list"), backup("taxonomy", "older-taxonomy"), backup("species", "missing-art", false)];
const previewResult = (entry = savedBackups[0]) => ({
  token: `bound-${entry.backupId}`, species, backup: entry, expiresAt: "2026-10-10T10:05:00Z",
  changes: [{ key: "englishName", label: "Englischer Name", before: "White Stork", after: "Stork" }],
  warnings: ["Namenidentität und Medien bleiben erhalten."],
});

function harness({ fetch, confirm, reload } = {}) {
  const nodes = new Map();
  for (const id of ["backup-history-dialog", "backup-history-list", "backup-history-title", "backup-history-message",
    "backup-history-preview", "backup-history-preview-content", "backup-history-save", "backup-history-refresh",
    "backup-archives-dialog", "backup-archives-list", "backup-archives-message", "backup-archives-root", "backup-archives-refresh"]) nodes.set(id, element());
  const historyClose = element(), archiveClose = element(), archiveOpen = element(), historyOpen = element();
  const detailPanel = element(), pipelineMenuButton = element(), pipelineDialog = element(), settingsDialog = element();
  const pipelineClose = element(), settingsClose = element();
  pipelineDialog.querySelector = () => pipelineClose;
  settingsDialog.querySelector = () => settingsClose;
  pipelineClose.addEventListener("click", () => { pipelineDialog.open = false; });
  settingsClose.addEventListener("click", () => { settingsDialog.open = false; });
  const state = { species: [species, { ...species, id: "Perdix_perdix", germanName: "Rebhuhn" }], selectedId: species.id, editMode: true };
  historyOpen.dataset.backupHistoryOpen = species.id;
  historyOpen.parent = detailPanel;
  historyOpen.closest = () => historyOpen;
  detailPanel.querySelector = () => historyOpen;
  nodes.get("backup-history-dialog").querySelectorAll = () => [historyClose];
  nodes.get("backup-archives-dialog").querySelectorAll = () => [archiveClose];
  const calls = [], confirmations = [], reloads = [];
  let foreignDialog = null;
  const documentRef = {
    querySelector(selector) {
      if (selector.startsWith("dialog[open]")) {
        if (foreignDialog?.open) return foreignDialog;
        if (pipelineDialog.open) return pipelineDialog;
        if (settingsDialog.open) return settingsDialog;
        const excluded = selector.includes("not(#backup-history-dialog)") ? "backup-history-dialog" : "backup-archives-dialog";
        return [...nodes].find(([id, entry]) => id.endsWith("dialog") && id !== excluded && entry.open)?.[1] || null;
      }
      return nodes.get(selector.slice(1));
    },
    querySelectorAll() { return [archiveOpen]; },
  };
  const context = vm.createContext({});
  sources.forEach((source) => new vm.Script(source).runInContext(context));
  const api = context.SpeciesExplorerBackupHistory.createBackupHistoryController({
    state, elements: { detailPanel, pipelineMenuButton, pipelineDialog, settingsDialog }, documentRef,
    createDialogController: context.SpeciesExplorerDialogs.createDialogController,
    ...context.SpeciesExplorerPresentation,
    fetchJson: async (url, options) => {
      calls.push({ url, method: options?.method || "GET", body: options?.body ? JSON.parse(options.body) : undefined });
      if (fetch) return fetch(url, options);
      if (url.endsWith("/preview")) return previewResult(savedBackups.find((entry) => entry.backupId === JSON.parse(options.body).backupId));
      if (url.endsWith("/restore")) return { species, retainedBackups: 5, backup: "new-backup" };
      if (url === "/api/backup/archives") return { backupRoot: "W:\\Sicherungen", archives: [] };
      return { species, backups: savedBackups };
    },
    showQuickConfirm: async (options) => { confirmations.push(options); return confirm ? confirm(options) : true; },
    loadData: async (options) => { reloads.push(options); return reload ? reload(options) : {}; },
  });
  return { api, state, nodes, calls, confirmations, reloads, historyClose, archiveClose, archiveOpen, historyOpen,
    detailPanel, pipelineMenuButton, pipelineDialog, settingsDialog, pipelineClose, settingsClose,
    setForeignDialog(value) { foreignDialog = value; } };
}

test("history opening reads dated species and taxonomy candidates without a write; unavailable reasons and empty state stay visible", async () => {
  const h = harness();
  await h.api.openHistory();
  const html = h.nodes.get("backup-history-list").innerHTML;
  assert.match(html, /Artenliste/); assert.match(html, /Taxonomiebearbeitung/);
  assert.match(html, /Englischer Name, Größe, Gewicht und Lebenserwartung/);
  assert.match(html, /ohne damaligen Override heutige automatische Basis/);
  assert.match(html, /Art fehlt in diesem Stand/); assert.match(html, /2026/);
  assert.equal((html.match(/Stand prüfen/g) || []).length, 2);
  assert.deepEqual(h.calls.map(({ method }) => method), ["GET"]);
  await h.api.chooseBackup(2);
  assert.equal(h.calls.length, 1);
  const empty = harness({ fetch: () => ({ species, backups: [] }) });
  await empty.api.openHistory();
  assert.match(empty.nodes.get("backup-history-list").innerHTML, /Keine gesicherten Bearbeitungsstände/);
  assert.equal(empty.nodes.get("backup-history-save").disabled, true);
});

for (const index of [0, 1]) test(`explicit selection ${index} previews the selected dated candidate before separate confirmation and restore`, async () => {
  const h = harness();
  await h.api.openHistory(); await h.api.chooseBackup(index);
  assert.deepEqual(h.calls.at(-1).body, { kind: savedBackups[index].kind, backupId: savedBackups[index].backupId });
  assert.equal(h.confirmations.length, 0); assert.equal(h.calls.filter((call) => call.url.endsWith("/restore")).length, 0);
  assert.match(h.nodes.get("backup-history-preview-content").innerHTML, /White Stork/);
  assert.match(h.nodes.get("backup-history-preview-content").innerHTML, />Stork</);
  await h.api.restoreSelected();
  assert.equal(h.confirmations.length, 1);
  assert.match(h.confirmations[0].message, /lokal geändert und vorher gesichert/);
  assert.deepEqual(h.calls.at(-1).body, { token: `bound-${savedBackups[index].backupId}` });
  assert.deepEqual(h.reloads.map((entry) => ({ ...entry })), [{ reload: true }]);
  assert.match(h.nodes.get("backup-history-message").textContent, /wiederhergestellt/);
  assert.match(h.state.notice, /lokal vorgemerkt/);
  await h.api.restoreSelected();
  assert.equal(h.calls.filter((call) => call.url.endsWith("/restore")).length, 1);
});

test("cancelled confirmation keeps the preview but performs no restore", async () => {
  const h = harness({ confirm: () => false });
  await h.api.openHistory(); await h.api.chooseBackup(0); await h.api.restoreSelected();
  assert.equal(h.nodes.get("backup-history-save").disabled, false);
  assert.equal(h.reloads.length, 0);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/restore")).length, 0);
});

for (const mutation of ["selection", "close", "edit-mode"]) test(`a pending confirmation cannot restore after ${mutation} changes`, async () => {
  const confirmation = deferred(), h = harness({ confirm: () => confirmation.promise });
  await h.api.openHistory(); await h.api.chooseBackup(0);
  const pending = h.api.restoreSelected();
  if (mutation === "selection") h.state.selectedId = "Perdix_perdix";
  else if (mutation === "edit-mode") h.state.editMode = false;
  else h.historyClose.click();
  confirmation.resolve(true); await pending;
  assert.equal(h.calls.filter((call) => call.url.endsWith("/restore")).length, 0);
  assert.equal(h.nodes.get("backup-history-save").disabled, true);
});

test("close and reopen discards an old preview response even for the same species", async () => {
  const old = deferred(); let previews = 0;
  const h = harness({ fetch: (url) => {
    if (url.endsWith("/preview")) return ++previews === 1 ? old.promise : previewResult(savedBackups[1]);
    return { species, backups: savedBackups };
  } });
  await h.api.openHistory(); const pending = h.api.chooseBackup(0);
  h.historyClose.click(); await h.api.openHistory(); await h.api.chooseBackup(1);
  old.resolve(previewResult()); await pending;
  assert.match(h.nodes.get("backup-history-preview-content").innerHTML, /Taxonomiebearbeitung/);
  assert.doesNotMatch(h.nodes.get("backup-history-preview-content").innerHTML, /<strong>Artenliste/);
  assert.equal(h.nodes.get("backup-history-save").disabled, false);
});

test("late list response never rebinds another species or a reopened dialog", async () => {
  const old = deferred(); let reads = 0;
  const h = harness({ fetch: () => ++reads === 1 ? old.promise : { species: h.state.species[1], backups: [] } });
  const pending = h.api.openHistory(); h.historyClose.click(); h.state.selectedId = "Perdix_perdix";
  await h.api.openHistory(); old.resolve({ species, backups: savedBackups }); await pending;
  assert.match(h.nodes.get("backup-history-title").textContent, /Rebhuhn/);
  assert.match(h.nodes.get("backup-history-list").innerHTML, /Keine gesicherten/);
});

test("rapid duplicate clicks do not start parallel preview, confirmations, or restore writes; close is blocked only during restore", async () => {
  const preview = deferred(), write = deferred(), confirmation = deferred();
  const h = harness({ confirm: () => confirmation.promise, fetch: (url) => {
    if (url.endsWith("/preview")) return preview.promise;
    if (url.endsWith("/restore")) return write.promise;
    return { species, backups: savedBackups };
  } });
  await h.api.openHistory(); const read = h.api.chooseBackup(0);
  await h.api.chooseBackup(1); await h.api.readHistory();
  assert.equal(h.calls.length, 2);
  preview.resolve(previewResult()); await read;
  const pending = h.api.restoreSelected(); await h.api.restoreSelected();
  assert.equal(h.confirmations.length, 1);
  confirmation.resolve(true); await new Promise((resolve) => setImmediate(resolve));
  await h.api.restoreSelected(); h.historyClose.click();
  assert.equal(h.nodes.get("backup-history-dialog").open, true);
  assert.match(h.nodes.get("backup-history-message").textContent, /läuft/);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/restore")).length, 1);
  write.resolve({ species, backup: "preserved-current" }); await pending;
  h.historyClose.click(); assert.equal(h.nodes.get("backup-history-dialog").open, false);
});

for (const stage of ["list", "preview", "confirm", "restore", "reload"]) test(`${stage} failure is honest, does not auto-retry a write, and can be closed`, async () => {
  const h = harness({
    confirm: () => { if (stage === "confirm") throw new Error("confirmation unavailable"); return true; },
    reload: () => { if (stage === "reload") return null; return {}; },
    fetch: (url) => {
      if (url.endsWith("/restore")) { if (stage === "restore") throw new Error("network lost"); return { species }; }
      if (url.endsWith("/preview")) { if (stage === "preview") throw new Error("preview expired"); return previewResult(); }
      if (stage === "list") throw new Error("backup directory unreadable");
      return { species, backups: savedBackups };
    },
  });
  await h.api.openHistory(); if (stage !== "list") await h.api.chooseBackup(0);
  if (!["list", "preview"].includes(stage)) await h.api.restoreSelected();
  assert.match(h.nodes.get("backup-history-message").className, /error/);
  if (stage === "restore") {
    assert.match(h.nodes.get("backup-history-message").textContent, /Ergebnis.*nicht bestätigt/);
    await h.api.restoreSelected();
  }
  if (stage === "reload") assert.match(h.nodes.get("backup-history-message").textContent, /Wiederherstellung gespeichert/);
  assert.ok(h.calls.filter((call) => call.url.endsWith("/restore")).length <= 1);
  h.historyClose.click(); assert.equal(h.nodes.get("backup-history-dialog").open, false);
});

for (const wrong of ["species", "backup", "kind"]) test(`mismatching preview ${wrong} cannot enable a restore`, async () => {
  const value = previewResult();
  if (wrong === "species") value.species = { ...species, id: "other" };
  else value.backup = { ...value.backup, [wrong === "backup" ? "backupId" : "kind"]: "other" };
  const h = harness({ fetch: (url) => url.endsWith("/preview") ? value : { species, backups: savedBackups } });
  await h.api.openHistory(); await h.api.chooseBackup(0); await h.api.restoreSelected();
  assert.match(h.nodes.get("backup-history-message").textContent, /passt nicht/);
  assert.equal(h.nodes.get("backup-history-save").disabled, true);
  assert.equal(h.confirmations.length, 0);
});

test("empty changes remain visible and cannot create a meaningless restore write", async () => {
  const h = harness({ fetch: (url) => url.endsWith("/preview") ? { ...previewResult(), changes: [] } : { species, backups: savedBackups } });
  await h.api.openHistory(); await h.api.chooseBackup(0); await h.api.restoreSelected();
  assert.equal(h.nodes.get("backup-history-preview").hidden, false);
  assert.match(h.nodes.get("backup-history-preview-content").innerHTML, /keine Änderung/);
  assert.equal(h.confirmations.length, 0);
});

test("history details, warnings and archive paths render hostile text as text rather than markup", async () => {
  const hostile = '<img src=x onerror="bad()">';
  const row = { ...savedBackups[0], label: hostile };
  const h = harness({ fetch: (url) => {
    if (url === "/api/backup/archives") return { archives: [{ name: hostile, path: hostile, scopeLabel: hostile, warning: hostile, integrityStatus: "invalid", bytes: 20 }] };
    if (url.endsWith("/preview")) return { ...previewResult(row), changes: [{ label: hostile, before: hostile, after: hostile }], warnings: [hostile] };
    return { species, backups: [row] };
  } });
  await h.api.openHistory(); await h.api.chooseBackup(0);
  for (const id of ["backup-history-list", "backup-history-preview-content"]) {
    assert.match(h.nodes.get(id).innerHTML, /&lt;img/); assert.doesNotMatch(h.nodes.get(id).innerHTML, /<img/);
  }
  h.historyClose.click(); await h.api.openArchives();
  assert.match(h.nodes.get("backup-archives-list").innerHTML, /&lt;img/);
  assert.doesNotMatch(h.nodes.get("backup-archives-list").innerHTML, /<img/);
});

test("NAS archive overview is exclusively read-only and distinguishes metadata, historical, missing and invalid proofs", async () => {
  const h = harness({ fetch: () => ({ backupRoot: "W:\\NAS", warning: "Keine neue Inhaltsprüfung", archives:
    ["manifest-only", "historical", "no-manifest", "invalid"].map((integrityStatus) => ({
      name: `${integrityStatus}.zip`, path: `W:\\NAS\\${integrityStatus}.zip`, createdAt: "2026-10-07T08:00:00Z", bytes: 2048,
      fileCount: integrityStatus === "manifest-only" ? 3459 : null, contentBytes: integrityStatus === "manifest-only" ? 1000 : null,
      scopeLabel: "Gesicherter Projektstand", integrityStatus, readable: integrityStatus !== "invalid", warning: "",
    })) }) });
  await h.api.openArchives();
  const html = h.nodes.get("backup-archives-list").innerHTML;
  assert.match(html, /Archivinhalt hier nicht neu geprüft/); assert.match(html, /Historisches Prüfverzeichnis/);
  assert.match(html, /Kein Prüfverzeichnis/); assert.match(html, /Kein verwendbarer Lesezugriff/);
  assert.match(html, /3459 Dateien/); assert.equal((html.match(/Dateien/g) || []).length, 1);
  assert.match(html, /W:\\NAS/); assert.doesNotMatch(html, /<button|href=/);
  assert.deepEqual(h.calls.map(({ url, method }) => ({ url, method })), [{ url: "/api/backup/archives", method: "GET" }]);
  assert.equal(h.confirmations.length, 0); assert.equal(h.reloads.length, 0);
});

test("NAS close and reopen ignores old reads, and errors and empty archives never imply a successful restore", async () => {
  const first = deferred(); let reads = 0;
  const h = harness({ fetch: () => ++reads === 1 ? first.promise : { backupRoot: "new-path", archives: [] } });
  const pending = h.api.openArchives(); h.archiveClose.click(); await h.api.openArchives();
  first.resolve({ backupRoot: "old-path", archives: [{ name: "old" }] }); await pending;
  assert.equal(h.nodes.get("backup-archives-root").textContent, "new-path");
  assert.match(h.nodes.get("backup-archives-list").innerHTML, /Keine NAS-Archive/);
  h.archiveClose.click();
  const failure = harness({ fetch: () => { throw new Error("NAS disconnected"); } });
  await failure.api.openArchives();
  assert.match(failure.nodes.get("backup-archives-message").textContent, /NAS disconnected/);
  assert.equal(failure.nodes.get("backup-archives-list").innerHTML, "");
  assert.equal(failure.nodes.get("backup-archives-refresh").disabled, false);
});

test("foreign open dialogs block history entry instead of stacking unsaved editors", async () => {
  const h = harness(), editor = element(); editor.open = true; h.setForeignDialog(editor);
  await h.api.openHistory();
  assert.equal(editor.open, true); assert.equal(h.nodes.get("backup-history-dialog").open, false);
  assert.equal(h.calls.length, 0);
});

test("detail entry uses the current art binding and excludes non-input/read-only selections", async () => {
  const h = harness(); h.state.selectedId = "Perdix_perdix";
  h.detailPanel.emit("click", { target: h.historyOpen });
  assert.equal(h.calls.length, 0);
  h.state.editMode = false; await h.api.openHistory(); assert.equal(h.calls.length, 0);
  h.state.editMode = true; h.state.species[1].inInput = false; await h.api.openHistory(); assert.equal(h.calls.length, 0);
});

test("a newly chosen candidate replaces the previous restore token; refreshing invalidates the preview", async () => {
  const h = harness();
  await h.api.openHistory(); await h.api.chooseBackup(0); await h.api.chooseBackup(1);
  await h.api.restoreSelected();
  assert.deepEqual(h.calls.at(-1).body, { token: "bound-older-taxonomy" });
  await h.api.chooseBackup(0); await h.api.readHistory(); await h.api.restoreSelected();
  assert.equal(h.calls.filter((call) => call.url.endsWith("/restore")).length, 1);
  assert.equal(h.nodes.get("backup-history-save").disabled, true);
});

for (const parentName of ["pipeline", "settings"]) test(`NAS menu entry closes its ${parentName} parent through the existing button and restores focus`, async () => {
  const h = harness();
  h[`${parentName}Dialog`].open = true;
  await h.api.openArchives();
  assert.equal(h[`${parentName}Dialog`].open, false);
  assert.equal(h.nodes.get("backup-archives-dialog").open, true);
  h.archiveClose.click();
  assert.equal(h.pipelineMenuButton.focused, true);
  assert.deepEqual(h.calls.map(({ method }) => method), ["GET"]);
});

test("NAS entry respects a parent close guard; repeated loading does not issue concurrent archive reads", async () => {
  const waiting = deferred(), h = harness({ fetch: () => waiting.promise });
  h.pipelineDialog.open = true; h.pipelineClose.disabled = true;
  await h.api.openArchives();
  assert.equal(h.calls.length, 0); assert.equal(h.pipelineDialog.open, true);
  h.pipelineClose.disabled = false;
  const pending = h.api.openArchives(); await h.api.openArchives(); await h.api.readArchives();
  assert.equal(h.calls.length, 1);
  waiting.resolve({ archives: [] }); await pending;
});

test("entry elements, live messages and module composition are present; NAS instructions expose no automated restore action", async () => {
  const [html, app, detail] = await Promise.all(["index.html", "app.js", "app-detail-view.js"].map((file) =>
    readFile(new URL(`./public/${file}`, import.meta.url), "utf8")));
  assert.match(detail, /data-backup-history-open="\$\{escapeHtml\(species\.id\)\}"/);
  assert.match(html, /data-backup-archives-open/);
  assert.ok(html.indexOf('src="/app-backup-history.js"') < html.indexOf('src="/app.js"'));
  assert.match(app, /explorerBackupHistory\.createBackupHistoryController/);
  assert.match(html, /id="backup-history-message"[^>]*role="status"/);
  const instructions = html.slice(html.indexOf('id="backup-archives-dialog"'), html.indexOf('id="settings-dialog"'));
  assert.match(instructions, /eigenen, leeren Ordner/); assert.match(instructions, /Node 24/);
  assert.match(instructions, /ältere Mindestprüfung/);
  assert.doesNotMatch(instructions, /data-(?:backup-action|restore)|type="submit"|href=/);
});

test("queued native close events cannot invalidate an immediately reopened history or archive dialog", async () => {
  const h = harness();
  for (const [id, closeButton, open] of [
    ["backup-history-dialog", h.historyClose, () => h.api.openHistory()],
    ["backup-archives-dialog", h.archiveClose, () => h.api.openArchives()],
  ]) {
    const dialog = h.nodes.get(id);
    dialog.close = () => { dialog.open = false; };
    await open(); closeButton.click(); await open();
    dialog.emit("close");
    assert.equal(dialog.open, true);
    if (id === "backup-history-dialog") {
      await h.api.chooseBackup(0); assert.equal(h.nodes.get("backup-history-save").disabled, false);
    } else {
      await h.api.readArchives(); assert.equal(h.nodes.get("backup-archives-refresh").disabled, false);
    }
    dialog.close = () => { dialog.open = false; dialog.emit("close"); };
    closeButton.click();
  }
});

for (const bytes of [null, -1, "20"]) test(`unknown NAS archive bytes (${JSON.stringify(bytes)}) stay unknown rather than becoming a known ZIP size`, async () => {
  const h = harness({ fetch: () => ({ archives: [{ name: "unreadable.zip", path: "W:\\NAS\\unreadable.zip",
    bytes, integrityStatus: "invalid", readable: false }] }) });
  await h.api.openArchives();
  const html = h.nodes.get("backup-archives-list").innerHTML;
  assert.match(html, /Umfang unbekannt/);
  assert.doesNotMatch(html, /\d+ KiB ZIP/);
});

test("a known zero-byte NAS archive remains explicitly zero rather than unknown", async () => {
  const h = harness({ fetch: () => ({ archives: [{ name: "empty.zip", path: "W:\\NAS\\empty.zip",
    bytes: 0, integrityStatus: "invalid", readable: false }] }) });
  await h.api.openArchives();
  assert.match(h.nodes.get("backup-archives-list").innerHTML, /0 KiB ZIP/);
  assert.doesNotMatch(h.nodes.get("backup-archives-list").innerHTML, /Umfang unbekannt/);
});

test("the backup dialog desktop width wins over the later generic editor dialog width", async () => {
  const css = await readFile(new URL("./public/app.css", import.meta.url), "utf8");
  // Für die beiden einfachen Desktop-Klassenregeln dieselbe Spezifitäts- und Quellreihenfolge wie CSS anwenden.
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match, order) => {
    const width = match[2].match(/(?:^|;)\s*width:\s*([^;]+);/);
    if (!width) return [];
    return match[1].split(",").map((selector) => selector.trim())
      .filter((selector) => /^\.(?:edit-dialog|backup-history-dialog)(?:\.(?:edit-dialog|backup-history-dialog))*$/.test(selector))
      .map((selector) => ({ order, specificity: selector.split(".").length - 1, width: width[1].trim() }));
  }).sort((left, right) => left.specificity - right.specificity || left.order - right.order);
  assert.equal(rules.at(-1)?.width, "min(1000px, calc(100vw - 24px))");
});
