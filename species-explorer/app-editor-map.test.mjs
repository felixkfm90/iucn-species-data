import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-editor-map.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const url = "https://www.iucnredlist.org/api/v4/assessments/132000123/distribution_map/jpg";
const file = { name: "T22720330A132000123.jpg", size: 579333 };

class Element {
  value = "";
  files = [];
  disabled = false;
  hidden = true;
  textContent = "";
  listeners = new Map();
  classes = new Set();
  classList = {
    toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name),
    remove: (name) => this.classes.delete(name),
  };
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  async emit(type, detail = {}) {
    const event = {
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      ...detail,
    };
    await this.listeners.get(type)?.(event);
    return event;
  }
}

function harness(overrides = {}) {
  const elements = Object.fromEntries([
    "mapFileInput", "mapDropZone", "mapFileStatus", "mapReasonInput", "mapSourceInput", "mapCareModeInput",
    "mapMessage", "mapPreview", "mapCurrentImage", "mapNewImage", "mapCurrentMeta", "mapNewMeta",
    "mapPreviewButton", "mapSaveButton", "mapAutoSearchButton", "mapBrowserLink", "mapDeleteButton",
  ].map((key) => [key, new Element()]));
  elements.mapBrowserLink.href = url;
  elements.mapSaveButton.disabled = true;
  const calls = [];
  let reads = 0, closes = 0;
  const preview = {
    token: "preview-token",
    currentMap: { exists: true, url: "/old.jpg", bytes: 123, dimensions: { width: 10, height: 20 } },
    newMap: { url: "/preview.jpg", bytes: 456, dimensions: { width: 40, height: 80 } },
  };
  const controller = context.SpeciesExplorerMapEditor.createMapEditorController({
    ...elements,
    species: { id: "chlorischloris", germanName: "Grünfink", iucn: { assessmentId: 132000123 } },
    state: {},
    closeButtons: [new Element()],
    fileToBase64: async () => { reads += 1; return "image-bytes"; },
    formatBytes: (bytes) => `${bytes} Bytes`,
    closeEditDialog: () => { assert.equal(controller.isBusy(), false); closes += 1; },
    loadData: async () => {},
    ...overrides,
    fetchJson: async (path, options) => {
      calls.push({ path, body: JSON.parse(options.body) });
      if (overrides.fetchJson) return overrides.fetchJson(path, options);
      return path.endsWith("/save") ? { saved: true, gitPublished: false } : preview;
    },
  });
  return { ...elements, controller, calls, preview, reads: () => reads, closes: () => closes };
}

async function drop(h, files = [file]) {
  return h.mapDropZone.emit("drop", { dataTransfer: { files } });
}

test("Dateiablage prüft lokal, ergänzt IUCN-Quelle und speichert erst nach Bestätigung", async () => {
  const h = harness();
  const event = await drop(h);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].path, "/api/species/chlorischloris/assets/map/preview");
  assert.equal(h.calls[0].body.source, url);
  assert.equal(h.calls[0].body.imageBase64, "image-bytes");
  assert.equal(h.calls[0].body.reason, "Karte als lokale Datei importiert.");
  assert.equal(h.mapPreview.hidden, false);
  assert.equal(h.mapSaveButton.disabled, false);
  assert.match(h.mapFileStatus.textContent, /T22720330A132000123.jpg/);
  await h.mapSaveButton.emit("click");
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].body, { token: "preview-token", careMode: "manual" });
  assert.equal(h.closes(), 1);
});

test("Dateiauswahl startet dieselbe Prüfung und respektiert eigene Angaben", async () => {
  const h = harness();
  h.mapReasonInput.value = "Manuell ausgewählte Karte";
  h.mapSourceInput.value = "https://example.com/meine-karte";
  h.mapFileInput.files = [{ ...file, name: "T22720330A132000123 (1).jpg" }];
  await h.mapFileInput.emit("change");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].body.reason, h.mapReasonInput.value);
  assert.equal(h.calls[0].body.source, "https://example.com/meine-karte");
});

test("Generische PNG-Datei ohne Quellenangabe erfindet keine IUCN-Provenienz", async () => {
  const h = harness();
  await drop(h, [{ name: "meine-karte.png", size: 123 }]);
  assert.equal(h.calls[0].body.source, "");
  assert.equal(h.calls[0].body.originalName, "meine-karte.png");
});

test("Browserherkunft braucht eigene Wahl und geänderte Pflegewahl entwertet die Vorschau", async () => {
  const h = harness();
  await drop(h);
  assert.equal(h.calls[0].body.careMode, "manual");
  h.mapCareModeInput.value = "iucn-browser";
  await h.mapCareModeInput.emit("change");
  assert.equal(h.mapSaveButton.disabled, true);
  await h.mapSaveButton.emit("click");
  assert.equal(h.calls.length, 1);
  await h.mapPreviewButton.emit("click");
  assert.equal(h.calls[1].body.careMode, "iucn-browser");
  assert.equal(h.calls[1].body.imageBase64, "image-bytes");
  await h.mapSaveButton.emit("click");
  assert.equal(h.calls[2].body.careMode, "iucn-browser");
});

test("Browserlink ergänzt nur Quellenangabe und startet keinen Abruf", async () => {
  const h = harness();
  await h.mapBrowserLink.emit("click");
  assert.equal(h.mapSourceInput.value, url);
  assert.equal(h.calls.length, 0);
  assert.match(h.mapMessage.textContent, /Bild speichern unter/);
});

test("Mehrere Dateien, Links, HTML, leere und übergroße Dateien werden früh zurückgewiesen", async () => {
  for (const [files, message] of [
    [[file, file], /genau eine/], [[], /keine Links/],
    [[{ name: "karte.html", size: 123 }], /JPEG/],
    [[{ ...file, size: 0 }], /leer/],
    [[{ ...file, size: 20 * 1024 * 1024 + 1 }], /20 MB/],
    [[{ ...file, name: "T123A137567006.jpg" }], /andere[nr]? Bewertung/],
  ]) {
    const h = harness();
    await drop(h, files);
    assert.equal(h.calls.length, 0);
    assert.equal(h.reads(), 0);
    assert.equal(h.mapSaveButton.disabled, true);
    assert.match(h.mapMessage.textContent, message);
  }
});

test("Neue ungültige Auswahl entwertet alte erfolgreiche Vorschau", async () => {
  const h = harness();
  await drop(h);
  await drop(h, [{ name: "karte.html", size: 123 }]);
  await h.mapSaveButton.emit("click");
  assert.equal(h.calls.length, 1);
  assert.equal(h.mapPreview.hidden, true);
});

test("Geänderte Angaben entwerten Vorschau; erneute Prüfung verwendet weiterhin die Datei", async () => {
  for (const field of ["mapSourceInput", "mapReasonInput"]) {
    const h = harness();
    await drop(h);
    h[field].value = field === "mapSourceInput" ? "https://example.com/neue-quelle" : "Geänderter Grund";
    await h[field].emit("input");
    await h.mapSaveButton.emit("click");
    assert.equal(h.calls.length, 1);
    assert.equal(h.mapSaveButton.disabled, true);
    await h.mapPreviewButton.emit("click");
    assert.equal(h.calls[1].body.imageBase64, "image-bytes");
    assert.equal(h.mapSaveButton.disabled, false);
  }
});

test("Verspätete Antworten nach Dialogreset aktivieren keine alte Vorschau", async () => {
  let resolve;
  const h = harness({ fetchJson: () => new Promise((done) => { resolve = done; }) });
  const pending = drop(h);
  await Promise.resolve();
  assert.equal(h.controller.isBusy(), true);
  await drop(h);
  await h.mapPreviewButton.emit("click");
  assert.equal(h.calls.length, 1);
  h.controller.resetSelection();
  resolve(h.preview);
  await pending;
  assert.equal(h.controller.isBusy(), false);
  assert.equal(h.mapPreview.hidden, true);
  assert.equal(h.mapSaveButton.disabled, true);
});

test("Beschädigte Datei vom Server oder nicht darstellbare Vorschau bleibt ungespeichert", async () => {
  const failed = harness({ fetchJson: async () => { throw new Error("Dateisignatur ist kein JPEG"); } });
  await drop(failed);
  assert.match(failed.mapMessage.textContent, /Dateisignatur/);
  assert.equal(failed.mapSaveButton.disabled, true);
  const h = harness();
  h.mapNewImage.decode = async () => { throw new Error("Bild nicht lesbar"); };
  await drop(h);
  assert.match(h.mapMessage.textContent, /nicht lesbar/);
  assert.equal(h.mapSaveButton.disabled, true);
});

test("Dateien werden nach erneutem Öffnen nicht heimlich weiterverwendet", async () => {
  const h = harness();
  await drop(h, [{ name: "karte.png", size: 123 }]);
  h.controller.resetSelection();
  await h.mapPreviewButton.emit("click");
  assert.equal(h.calls.length, 1);
  assert.match(h.mapFileStatus.textContent, /keine Datei/);
});

test("Drag-Markierung wird nach Verlassen und Ablegen entfernt", async () => {
  const h = harness();
  const event = await h.mapDropZone.emit("dragover", { dataTransfer: {} });
  assert.equal(event.prevented, true);
  assert.equal(event.dataTransfer.dropEffect, "copy");
  assert.equal(h.mapDropZone.classes.has("is-dragging"), true);
  await h.mapDropZone.emit("dragleave");
  assert.equal(h.mapDropZone.classes.has("is-dragging"), false);
  await drop(h);
  assert.equal(h.mapDropZone.classes.has("is-dragging"), false);
});
