import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-asset-review.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "app-asset-review.js" }).runInContext(context);
const assetReview = context.SpeciesExplorerAssetReview;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const renderer = assetReview.createAssetReviewRenderer({ escapeHtml });

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
    const event = { target: values.target || this, ...values };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

test("Asset-Signatur berücksichtigt alle für eine neue Prüfung relevanten Quellen", () => {
  const asset = {
    safeName: "Amsel",
    germanName: "Amsel",
    scientificName: "Turdus merula",
    label: "Sound",
    type: "sound",
    file: "sound.mp3",
    url: "/new.mp3",
    spectrogramUrl: "/new.webp",
    previousUrl: "/old.mp3",
    previousSpectrogramUrl: "/old.webp",
    sourceLabel: "frei",
    previousSourceLabel: "NC",
    isNc: false,
    previousIsNc: true,
    previouslyExisting: true,
    previousManual: false,
  };
  const signature = JSON.parse(assetReview.reviewSignature([asset]));
  assert.deepEqual(signature[0], [
    "Amsel",
    "Amsel",
    "Turdus merula",
    "Sound",
    "sound",
    "sound.mp3",
    "/new.mp3",
    "/new.webp",
    "/old.mp3",
    "/old.webp",
    "frei",
    "NC",
    false,
    true,
    true,
    false,
  ]);
  assert.notEqual(
    assetReview.reviewSignature([asset]),
    assetReview.reviewSignature([{ ...asset, url: "/other.mp3" }]),
  );
  assert.notEqual(
    assetReview.reviewSignature([asset]),
    assetReview.reviewSignature([{ ...asset, sourceLabel: "NC", isNc: true }]),
  );
});

test("Entscheidungstexte unterscheiden Laufart, bisherigen Kartenstatus und Soundlizenz", () => {
  assert.deepEqual(
    { ...renderer.decisionLabels("manual-maps", {
      type: "map",
      previouslyExisting: true,
      previousManual: true,
    }) },
    {
      automatic: "Automatische Karte übernehmen",
      manual: "Bisherige manuelle Karte behalten",
    },
  );
  assert.deepEqual(
    { ...renderer.decisionLabels("all", {
      type: "map",
      previouslyExisting: true,
      previousManual: true,
    }) },
    {
      automatic: "Automatische Karte übernehmen",
      manual: "Bisherige manuelle Karte behalten",
    },
  );
  assert.deepEqual(
    { ...renderer.decisionLabels("all", {
      type: "sound",
      isNc: false,
      previouslyExisting: true,
    }) },
    {
      automatic: "Gefundenen Sound übernehmen (frei)",
      manual: "Bisherigen Sound behalten",
    },
  );
  assert.deepEqual(
    { ...renderer.decisionLabels("manual-maps", {
      type: "map",
      previouslyExisting: true,
      previousManual: false,
    }) },
    {
      automatic: "Automatische Karte übernehmen",
      manual: "Bisherige automatische Karte behalten",
    },
  );
  assert.deepEqual(
    { ...renderer.decisionLabels("nc-sounds", {
      type: "sound",
      isNc: true,
      previouslyExisting: false,
    }) },
    {
      automatic: "Gefundenen Sound übernehmen (NC)",
      manual: "Sound nicht übernehmen",
    },
  );
});

test("Kartenvergleich rendert beide Karten, sichere Texte und passende Entscheidungen", () => {
  const html = renderer.renderAssetReviewList({
    mode: "manual-maps",
    reviewAssets: [{
      type: "map",
      germanName: "Amsel <Nord>",
      scientificName: "Turdus merula",
      safeName: "Amsel",
      label: "Karte",
      file: "map.jpg",
      url: "/new-map.jpg?x=1&y=2",
      previousUrl: "/old-map.jpg",
      previouslyExisting: true,
      previousManual: false,
    }],
  });

  assert.match(html, /Bisherige Karte/);
  assert.match(html, /Gefundene Karte/);
  assert.match(html, /Amsel &lt;Nord&gt;/);
  assert.match(html, /new-map\.jpg\?x=1&amp;y=2/);
  assert.match(html, /Automatische Karte übernehmen/);
  assert.match(html, /Bisherige automatische Karte behalten/);
  assert.doesNotMatch(html, /Sound ablehnen/);
});

test("Soundvergleich nennt aktuellen und gefundenen Lizenzstatus ohne internen Dateipfad", () => {
  const html = renderer.renderAssetReviewList({
    mode: "nc-sounds",
    reviewAssets: [{
      type: "sound",
      germanName: "Amsel",
      scientificName: "Turdus merula",
      safeName: "Amsel",
      label: "Sound",
      file: "species-assets/Amsel/sound.mp3",
      url: "/new.mp3",
      spectrogramUrl: "/new.webp",
      previousUrl: "/old.mp3",
      previousSpectrogramUrl: "/old.webp",
      previousSourceLabel: "frei",
      sourceLabel: "NC",
      isNc: true,
      previouslyExisting: true,
    }],
  });

  assert.match(html, /Aktueller Sound \(frei\)/);
  assert.match(html, /Gefundener Sound \(NC\)/);
  assert.match(html, /Gefundenen Sound übernehmen \(NC\)/);
  assert.match(html, /Bisherigen Sound behalten/);
  assert.match(html, /Gefundenen Sound ablehnen und weiter suchen/);
  assert.doesNotMatch(html, /species-assets\/Amsel\/sound\.mp3/);
});

test("Mediencontroller steuert Kartenzoom, Spektrogrammposition und Freigabe", () => {
  const list = new FakeTarget();
  const previews = [];
  list.querySelectorAll = () => previews;
  const mapLightbox = {
    scrollTop: 30,
    scrollLeft: 20,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const mapLightboxImage = {};
  const mapLightboxClose = new FakeTarget();
  const calls = [];
  let released = 0;
  let resets = 0;
  const controller = assetReview.createAssetReviewMediaController({
    list,
    mapLightbox,
    mapLightboxImage,
    mapLightboxClose,
    createDialogController(options) {
      assert.equal(options.dialog, mapLightbox);
      assert.equal(options.closeButtons[0], mapLightboxClose);
      return {
        open: () => calls.push("open"),
        close: (reason) => calls.push(`close:${reason}`),
        destroy: () => calls.push("destroy"),
      };
    },
    releaseMediaWithin(element) {
      assert.equal(element, list);
      released += 1;
    },
    resetScrollableToTop(element) {
      assert.equal(element, mapLightbox);
      resets += 1;
    },
  });

  const mapTrigger = {
    dataset: { mapUrl: "/map.jpg", mapAlt: "Gefundene Karte Amsel" },
  };
  list.emit("click", {
    target: {
      closest(selector) {
        return selector === ".asset-review-map-trigger" ? mapTrigger : null;
      },
    },
  });
  assert.equal(mapLightboxImage.src, "/map.jpg");
  assert.equal(mapLightboxImage.alt, "Gefundene Karte Amsel");
  assert.equal(mapLightbox.attributes["aria-label"], "Vergrößerte Gefundene Karte Amsel");
  assert.deepEqual(calls, ["open"]);
  assert.equal(resets, 2);

  const audio = new FakeTarget();
  Object.assign(audio, {
    duration: 100,
    currentTime: 25,
    playCalled: 0,
    play() {
      this.playCalled += 1;
      return Promise.resolve();
    },
  });
  const marker = { style: {} };
  const preview = {
    querySelector(selector) {
      return selector === "audio" ? audio : marker;
    },
  };
  previews.push(preview);
  controller.bindRenderedMedia();
  audio.emit("timeupdate");
  assert.equal(marker.style.left, "25%");

  const spectrogram = {
    closest: () => preview,
    querySelector: () => marker,
    getBoundingClientRect: () => ({ left: 10, width: 100 }),
  };
  list.emit("click", {
    clientX: 60,
    target: {
      closest(selector) {
        return selector === ".asset-review-spectrogram" ? spectrogram : null;
      },
    },
  });
  assert.equal(audio.currentTime, 50);
  assert.equal(marker.style.left, "50%");
  assert.equal(audio.playCalled, 1);

  controller.stopAudio();
  assert.equal(released, 1);
  audio.currentTime = 80;
  audio.emit("timeupdate");
  assert.equal(marker.style.left, "50%");

  controller.destroy();
  assert.equal(released, 2);
  assert.deepEqual(calls, ["open", "close:cleanup", "destroy"]);
});
