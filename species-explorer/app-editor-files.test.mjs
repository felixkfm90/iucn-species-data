import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-editor-files.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({ setTimeout, clearTimeout });
new vm.Script(source, { filename: "app-editor-files.js" }).runInContext(context);
const editorFiles = context.SpeciesExplorerEditorFiles;

class FakeTarget {
  constructor() {
    this.listeners = new Map();
    this.duration = Number.NaN;
    this.loadCalled = false;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  emit(type) {
    this.listeners.get(type)?.({ target: this });
  }

  load() {
    this.loadCalled = true;
  }
}

test("IUCN-Kartenlink wird nur aus einer numerischen Assessment-ID aufgebaut", () => {
  assert.equal(
    editorFiles.iucnDistributionMapUrl({ iucn: { assessmentId: " 264548442 " } }),
    "https://www.iucnredlist.org/api/v4/assessments/264548442/distribution_map/jpg",
  );
  assert.equal(editorFiles.iucnDistributionMapUrl({ iucn: { assessmentId: "A-12" } }), "");
  assert.equal(editorFiles.iucnDistributionMapUrl(null), "");
});

test("Dateileser liefert ausschließlich den Base64-Nutzinhalt", async () => {
  class Reader {
    constructor() {
      this.listeners = new Map();
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    readAsDataURL(file) {
      assert.equal(file.name, "portrait.png");
      this.result = "data:image/png;base64,QUJDRA==";
      this.listeners.get("load")();
    }
  }
  assert.equal(
    await editorFiles.fileToBase64({ name: "portrait.png" }, { FileReaderClass: Reader }),
    "QUJDRA==",
  );
});

test("Dateileser weist ungültige Ergebnisse und Browserfehler verständlich zurück", async () => {
  class InvalidReader {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    readAsDataURL() {
      this.result = "ohne-trennzeichen";
      this.listeners.get("load")();
    }
  }
  class ErrorReader {
    constructor() {
      this.listeners = new Map();
      this.error = new Error("Lesefehler");
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    readAsDataURL() { this.listeners.get("error")(); }
  }
  await assert.rejects(
    editorFiles.fileToBase64({}, { FileReaderClass: InvalidReader }),
    /Datei konnte nicht gelesen werden/,
  );
  await assert.rejects(
    editorFiles.fileToBase64({}, { FileReaderClass: ErrorReader }),
    /Lesefehler/,
  );
});

test("Bereits geladene MP3-Dauer wird ohne neue Listener übernommen", async () => {
  const audio = new FakeTarget();
  audio.duration = 12.5;
  assert.equal(await editorFiles.waitForAudioMetadata(audio), 12.5);
  assert.equal(audio.listeners.size, 0);
  assert.equal(audio.loadCalled, false);
});

test("MP3-Metadaten werden geladen und Listener danach freigegeben", async () => {
  const audio = new FakeTarget();
  let timeoutCallback = null;
  let cleared = false;
  const result = editorFiles.waitForAudioMetadata(audio, {
    scheduleTimeout(callback) {
      timeoutCallback = callback;
      return 9;
    },
    cancelTimeout(value) {
      assert.equal(value, 9);
      cleared = true;
    },
  });
  audio.duration = 33;
  audio.emit("loadedmetadata");
  assert.equal(await result, 33);
  assert.equal(audio.loadCalled, true);
  assert.equal(cleared, true);
  assert.equal(audio.listeners.size, 0);
  assert.equal(typeof timeoutCallback, "function");
});

test("Fehlende MP3-Metadaten laufen kontrolliert in den Timeout", async () => {
  const audio = new FakeTarget();
  let timeoutCallback = null;
  const result = editorFiles.waitForAudioMetadata(audio, {
    scheduleTimeout(callback) {
      timeoutCallback = callback;
      return 4;
    },
    cancelTimeout() {},
  });
  timeoutCallback();
  await assert.rejects(result, /MP3-Metadaten konnten nicht gelesen werden/);
  assert.equal(audio.listeners.size, 0);
});
