import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mediaSource = await readFile(
  new URL("./public/app-media.js", import.meta.url),
  "utf8",
);

const scheduledFrames = [];
const context = vm.createContext({
  requestAnimationFrame(callback) {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  },
  cancelAnimationFrame() {},
});
new vm.Script(mediaSource, { filename: "app-media.js" }).runInContext(context);
const media = context.SpeciesExplorerMedia;

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, values = {}) {
    const event = {
      target: values.target || this,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...values,
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

function createClassList() {
  const values = new Set();
  return {
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
    contains: (value) => values.has(value),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const renderers = media.createMediaRenderers({
  escapeHtml,
  formatBytes: (value) => `${value} B`,
  versionedAssetUrl: (url, asset) => `${url}?v=${asset.bytes || 0}`,
});

test("Zeitformatierung behandelt volle Minuten, ungültige und negative Werte", () => {
  assert.equal(media.formatTime(0), "0:00");
  assert.equal(media.formatTime(65.9), "1:05");
  assert.equal(media.formatTime(Number.NaN), "0:00");
  assert.equal(media.formatTime(-2), "0:00");
});

test("Medienkarten rendern Kartenaktionen, Sicherungsstatus und sichere Texte", () => {
  const html = renderers.mapPanel({
    exists: true,
    url: "/asset/map.jpg",
    bytes: 321,
    backup: { exists: true, bytes: 123 },
  }, 'Karte <Amsel> "groß"', "map");

  assert.match(html, /Verbreitungskarte · 321 B/);
  assert.match(html, /src="\/asset\/map\.jpg\?v=321"/);
  assert.match(html, /alt="Karte &lt;Amsel&gt; &quot;groß&quot;"/);
  assert.match(html, /data-edit-section="map"/);
  assert.match(html, /Karte löschen/);
  assert.match(html, /Letzte lokale Sicherung wiederherstellen \(123 B\)/);

  const missing = renderers.mapPanel({ exists: false, url: "", bytes: 0 }, "Karte", "map");
  assert.match(missing, /Nicht vorhanden/);
  assert.doesNotMatch(missing, /Karte löschen/);
  assert.match(missing, /disabled/);
});

test("Portraitkarte unterscheidet vorhandenes und fehlendes Artporträt", () => {
  const species = {
    germanName: "Amsel & Co.",
    inInput: true,
    assets: {
      portrait: {
        exists: true,
        url: "/asset/portrait.webp",
        bytes: 456,
        backup: { exists: false },
      },
    },
  };
  const existing = renderers.speciesImagePanel(species);
  assert.match(existing, /Artporträt · 456 B/);
  assert.match(existing, /Illustriertes Artporträt Amsel &amp; Co\./);
  assert.match(existing, /Artporträt löschen/);

  const missing = renderers.speciesImagePanel({
    ...species,
    assets: { portrait: { exists: false, backup: { exists: true, bytes: 90 } } },
  });
  assert.match(missing, /Noch kein geprüftes Artporträt vorhanden/);
  assert.doesNotMatch(missing, /Artporträt löschen/);
  assert.match(missing, /restore-button edit-only available/);
});

test("Scrollposition wird sofort und im nächsten Darstellungsframe zurückgesetzt", () => {
  let deferred = null;
  const element = { scrollTop: 80, scrollLeft: 40 };
  media.resetScrollableToTop(element, (callback) => {
    deferred = callback;
    return 1;
  });
  assert.deepEqual(element, { scrollTop: 0, scrollLeft: 0 });
  element.scrollTop = 12;
  element.scrollLeft = 7;
  deferred();
  assert.deepEqual(element, { scrollTop: 0, scrollLeft: 0 });
});

test("Audiocontroller koppelt Zeit, Fortschritt, Lautstärke und Freigabe", () => {
  const audio = new FakeTarget();
  Object.assign(audio, {
    duration: 120,
    currentTime: 0,
    volume: 1,
    paused: true,
    ended: false,
    removedAttributes: [],
    play() {
      this.paused = false;
      this.emit("play");
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      this.emit("pause");
    },
    removeAttribute(name) {
      this.removedAttributes.push(name);
    },
    loadCalled: false,
    load() {
      this.loadCalled = true;
    },
  });
  const playButton = new FakeTarget();
  Object.assign(playButton, {
    textContent: "",
    attributes: {},
    classList: createClassList(),
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  });
  const visual = new FakeTarget();
  visual.getBoundingClientRect = () => ({ left: 10, width: 100 });
  const marker = { style: {} };
  const time = { textContent: "" };
  const volume = new FakeTarget();
  volume.value = "0.4";
  const nodes = new Map([
    [".explorer-audio", audio],
    [".audio-play-toggle", playButton],
    [".audio-visual", visual],
    [".audio-progress-marker", marker],
    [".audio-time", time],
    [".audio-volume", volume],
  ]);
  const root = { querySelector: (selector) => nodes.get(selector) || null };
  const cleanup = media.bindAudioPlayer({
    root,
    requestFrame: () => 1,
    cancelFrame: () => {},
  });

  assert.equal(time.textContent, "0:00 / 2:00");
  assert.equal(playButton.textContent, "▶");
  audio.currentTime = 30;
  audio.emit("timeupdate");
  assert.equal(marker.style.left, "25%");
  assert.equal(time.textContent, "0:30 / 2:00");
  volume.emit("input");
  assert.equal(audio.volume, 0.4);
  playButton.emit("click");
  assert.equal(audio.paused, false);
  assert.equal(playButton.attributes["aria-label"], "Pause");

  cleanup();
  assert.equal(audio.paused, true);
  assert.deepEqual(audio.removedAttributes, ["src"]);
  assert.equal(audio.loadCalled, true);
});

test("Bildzoom bindet Öffnen und gibt Trigger sowie Dialogcontroller frei", () => {
  const trigger = new FakeTarget();
  const dialog = { scrollTop: 22, scrollLeft: 9 };
  const closeButton = new FakeTarget();
  const nodes = new Map([
    [".trigger", trigger],
    [".dialog", dialog],
    [".close", closeButton],
  ]);
  const calls = [];
  const cleanup = media.bindImageZoom({
    root: { querySelector: (selector) => nodes.get(selector) || null },
    triggerSelector: ".trigger",
    dialogSelector: ".dialog",
    closeSelector: ".close",
    createDialogController(options) {
      assert.equal(options.dialog, dialog);
      assert.equal(options.closeButtons.length, 1);
      assert.equal(options.closeButtons[0], closeButton);
      return {
        open: () => calls.push("open"),
        close: (reason) => calls.push(`close:${reason}`),
        destroy: () => calls.push("destroy"),
      };
    },
  });

  trigger.emit("click");
  assert.deepEqual(calls, ["open"]);
  assert.equal(dialog.scrollTop, 0);
  assert.equal(dialog.scrollLeft, 0);
  cleanup();
  assert.deepEqual(calls, ["open", "close:cleanup", "destroy"]);
  trigger.emit("click");
  assert.deepEqual(calls, ["open", "close:cleanup", "destroy"]);
});
