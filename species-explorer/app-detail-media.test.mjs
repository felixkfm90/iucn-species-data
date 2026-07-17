import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-detail-media.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({ setTimeout, clearTimeout });
new vm.Script(source, { filename: "app-detail-media.js" }).runInContext(context);
const detailMedia = context.SpeciesExplorerDetailMedia;

class FakeAudio {
  constructor() {
    this.currentTime = 8;
    this.pauseCalls = 0;
  }

  pause() {
    this.pauseCalls += 1;
  }
}

function createFixture(overrides = {}) {
  const {
    state: stateOverride = {},
    elements: elementsOverride = {},
    ...dependencyOverrides
  } = overrides;
  const listeners = new Map();
  const audios = [];
  const detailPanel = {
    querySelector: () => null,
  };
  const documentRef = {
    addEventListener(type, listener, capture) {
      listeners.set(type, { listener, capture });
    },
    removeEventListener(type, listener, capture) {
      const current = listeners.get(type);
      if (current?.listener === listener && current.capture === capture) listeners.delete(type);
    },
    querySelectorAll(selector) {
      assert.equal(selector, "audio");
      return audios;
    },
    createElement() {
      return { className: "", innerHTML: "", querySelector: () => null };
    },
  };
  const calls = {
    releasedAudio: [],
    releasedWithin: [],
    reset: [],
    opened: [],
    audioBindings: [],
    zoomBindings: [],
  };
  const state = {
    audioCleanup: null,
    mapCleanup: null,
    portraitCleanup: null,
  };
  const elements = {
    detailPanel,
    assetReviewMapLightbox: null,
    assetReviewMapLightboxImage: null,
  };
  Object.assign(state, stateOverride);
  Object.assign(elements, elementsOverride);
  const dependencies = {
    state,
    elements,
    documentRef,
    AudioElementClass: FakeAudio,
    refreshExplorerModelOnly: async () => ({ species: [] }),
    escapeHtml: (value) => String(value),
    cacheBustedUrl: (url, key) => `${url}?v=${key}`,
    releaseAudioElement: (...args) => calls.releasedAudio.push(args),
    releaseMediaWithin: (...args) => calls.releasedWithin.push(args),
    resetScrollableToTop: (element) => calls.reset.push(element),
    openDialog: (...args) => calls.opened.push(args),
    bindAudioPlayer: (options) => {
      calls.audioBindings.push(options);
      return () => {};
    },
    bindImageZoom: (options) => {
      calls.zoomBindings.push(options);
      return () => {};
    },
    createDialogController: () => ({}),
    waitForRelease: async () => {},
    now: () => 1234,
    ...dependencyOverrides,
  };
  const controller = detailMedia.createDetailMediaController(dependencies);
  return { audios, calls, controller, detailPanel, documentRef, elements, listeners, state };
}

test("Exklusive Audiowiedergabe stoppt und setzt alle anderen Player zurück", () => {
  const fixture = createFixture();
  const current = new FakeAudio();
  const other = new FakeAudio();
  fixture.audios.push(current, other);
  const cleanup = fixture.controller.bindExclusiveAudioPlayback();
  assert.equal(fixture.listeners.get("play").capture, true);
  fixture.listeners.get("play").listener({ target: current });
  assert.equal(current.pauseCalls, 0);
  assert.equal(other.pauseCalls, 1);
  assert.equal(other.currentTime, 0);
  cleanup();
  assert.equal(fixture.listeners.has("play"), false);
});

test("Globale Audiofreigabe räumt Bindung und Medien vor der Wartezeit auf", async () => {
  const order = [];
  const fixture = createFixture({
    waitForRelease: async (milliseconds) => order.push(`wait:${milliseconds}`),
  });
  fixture.state.audioCleanup = () => order.push("cleanup");
  await fixture.controller.releaseAllAudioElements();
  assert.deepEqual(order, ["cleanup", "wait:1500"]);
  assert.equal(fixture.state.audioCleanup, null);
  assert.equal(fixture.calls.releasedWithin[0][0], fixture.documentRef);
  assert.equal(fixture.calls.releasedWithin[0][1].replace, true);
});

test("Detailfreigabe räumt Audio, Karten- und Portraitbindungen gemeinsam auf", () => {
  const cleaned = [];
  const fixture = createFixture();
  fixture.state.audioCleanup = () => cleaned.push("audio");
  fixture.state.mapCleanup = () => cleaned.push("map");
  fixture.state.portraitCleanup = () => cleaned.push("portrait");
  fixture.controller.releaseDetailMedia();
  assert.deepEqual(cleaned, ["audio", "map", "portrait"]);
  assert.equal(fixture.state.audioCleanup, null);
  assert.equal(fixture.state.mapCleanup, null);
  assert.equal(fixture.state.portraitCleanup, null);
  assert.equal(fixture.calls.releasedWithin[0][0], fixture.detailPanel);
  assert.equal(fixture.calls.releasedWithin[0][1].replace, true);
  assert.equal(fixture.calls.releasedWithin[0][1].includeImages, true);
});

test("Player und beide Zoomarten erhalten ihre unverwechselbaren Selektoren", () => {
  const previous = [];
  const fixture = createFixture();
  fixture.state.audioCleanup = () => previous.push("audio");
  fixture.state.mapCleanup = () => previous.push("map");
  fixture.state.portraitCleanup = () => previous.push("portrait");
  fixture.controller.setupAudioPlayer();
  fixture.controller.setupMapZoom();
  fixture.controller.setupPortraitZoom();
  assert.deepEqual(previous, ["audio", "map", "portrait"]);
  assert.equal(fixture.calls.audioBindings[0].root, fixture.detailPanel);
  assert.equal(fixture.calls.zoomBindings[0].triggerSelector, ".map-zoom-trigger");
  assert.equal(
    fixture.calls.zoomBindings[0].dialogSelector,
    ".map-lightbox:not(.portrait-lightbox)",
  );
  assert.equal(fixture.calls.zoomBindings[1].triggerSelector, ".portrait-zoom-trigger");
  assert.equal(fixture.calls.zoomBindings[1].dialogSelector, ".portrait-lightbox");
});

test("Gemeinsame Karten-Lightbox setzt Bild, Beschriftung und Scrollposition", () => {
  const image = {};
  const lightbox = {
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
  const fixture = createFixture({
    elements: {
      assetReviewMapLightbox: lightbox,
      assetReviewMapLightboxImage: image,
    },
  });
  assert.equal(
    fixture.controller.openSharedMapLightbox("/map.jpg", "Karte Amsel"),
    true,
  );
  assert.equal(image.src, "/map.jpg");
  assert.equal(image.alt, "Karte Amsel");
  assert.equal(lightbox.attributes.get("aria-label"), "Vergrößerte Karte Amsel");
  assert.equal(fixture.calls.reset.length, 2);
  assert.equal(fixture.calls.opened[0][0], lightbox);
  assert.equal(fixture.calls.opened[0][1].bodyClass, "explorer-modal-open");
  image.onload();
  assert.equal(fixture.calls.reset.length, 3);
});

test("Soundeditor wird nur bei einem tatsächlich offenen Sounddialog aktualisiert", async () => {
  const fixture = createFixture();
  assert.equal(await fixture.controller.refreshOpenSoundEditor("amsel"), false);
});

test("Offener Soundeditor übernimmt neue Datei-, Pflege- und Creditdaten", async () => {
  const releasedPreviewAudios = [new FakeAudio(), new FakeAudio()];
  const fields = new Map([
    ["soundRecordist", {}],
    ["soundSource", {}],
    ["soundUrl", {}],
    ["soundLicense", {}],
    ["soundCountry", {}],
    ["soundLocation", {}],
    ["soundQuality", {}],
    ["soundNotes", {}],
  ]);
  const form = {
    querySelector(selector) {
      const match = selector.match(/^\[name="(.+)"\]$/);
      return match ? fields.get(match[1]) : null;
    },
  };
  const oldAudio = new FakeAudio();
  const currentPreview = {
    innerHTML: "",
    querySelector: (selector) => selector === "audio" ? oldAudio : null,
  };
  const reasonInput = {};
  const careState = {};
  const autoSearchButton = {};
  const preview = { hidden: false };
  const saveButton = { disabled: false };
  const creditsPreview = { cleared: false, replaceChildren() { this.cleared = true; } };
  const editDialog = {
    dataset: { activeSection: "sound" },
    querySelector(selector) {
      return new Map([
        [".edit-form", form],
        [".sound-edit-fields", {}],
        [".current-sound-preview", currentPreview],
        [".sound-reason-input", reasonInput],
        [".sound-care-state", careState],
        [".sound-auto-search-button", autoSearchButton],
        [".sound-edit-preview", preview],
        [".sound-save-button", saveButton],
        [".sound-credits-preview", creditsPreview],
      ]).get(selector) || null;
    },
    querySelectorAll() {
      return releasedPreviewAudios;
    },
  };
  const species = {
    id: "amsel",
    isNcSound: true,
    credits: {
      recordist: "Beobachterin",
      source: "Quelle",
      url: "https://example.test/sound",
      license: "CC BY-NC",
      country: "Deutschland",
      location: "Berlin",
      quality: "A",
      notes: "Ruf",
    },
    assets: {
      sound: {
        exists: true,
        url: "/sound.mp3",
        sha256: "sound-hash",
        bytes: 2048,
        manuallyAdded: true,
        manualReason: "Geprüft",
      },
      spectrogram: { soundSha256: "spectrogram-hash" },
    },
  };
  const fixture = createFixture({
    elements: {
      detailPanel: {
        querySelector: (selector) => selector === ".edit-dialog[open]" ? editDialog : null,
      },
    },
    refreshExplorerModelOnly: async (options) => {
      assert.equal(options.reload, true);
      return { species: [species] };
    },
  });
  assert.equal(await fixture.controller.refreshOpenSoundEditor("amsel"), true);
  assert.match(currentPreview.innerHTML, /NC-Lizenz/);
  assert.match(currentPreview.innerHTML, /\/sound\.mp3\?v=sound-hash-2048-spectrogram-hash-1234/);
  assert.equal(fields.get("soundRecordist").value, "Beobachterin");
  assert.equal(fields.get("soundLocation").value, "Berlin");
  assert.equal(reasonInput.value, "Geprüft");
  assert.equal(careState.textContent, "Manuell geschützt");
  assert.equal(autoSearchButton.textContent, "Alternative suchen");
  assert.equal(preview.hidden, true);
  assert.equal(saveButton.disabled, true);
  assert.equal(creditsPreview.cleared, true);
  assert.equal(fixture.calls.releasedAudio.length, 3);
});
