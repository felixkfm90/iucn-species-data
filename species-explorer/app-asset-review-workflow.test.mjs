import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-asset-review-workflow.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "app-asset-review-workflow.js" }).runInContext(context);
const workflow = context.SpeciesExplorerAssetReviewWorkflow;

function createFixture({ decisions = {}, fetchError = null } = {}) {
  const calls = {
    bindMedia: 0,
    closeLightbox: 0,
    fetch: [],
    load: [],
    stopAudio: 0,
  };
  const dialog = { open: false };
  const form = {
    dataset: {},
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    emit(type) {
      const event = { preventDefault() { this.defaultPrevented = true; } };
      return this.listeners.get(type)?.(event);
    },
  };
  const elements = {
    assetReviewDialog: dialog,
    assetReviewForm: form,
    assetReviewList: { innerHTML: "" },
    assetReviewMessage: { textContent: "", className: "", hidden: true },
    assetReviewSave: { textContent: "", disabled: false },
    assetReviewMapLightbox: {},
    assetReviewMapLightboxImage: {},
    assetReviewMapLightboxClose: {},
  };
  const state = {
    assetReviewAwaitingRetry: false,
    assetReviewSignature: "",
    reloadAfterAssetReviewClose: false,
    pendingRevisionReload: false,
  };
  let controllerOptions = null;
  const result = workflow.setupAssetReviewWorkflow({
    state,
    elements,
    createAssetReviewMediaController: () => ({
      stopAudio: () => { calls.stopAudio += 1; },
      closeMapLightbox: () => { calls.closeLightbox += 1; },
      bindRenderedMedia: () => { calls.bindMedia += 1; },
    }),
    createDialogController(options) {
      controllerOptions = options;
      return {
        open() { dialog.open = true; },
        close() {
          dialog.open = false;
          options.afterClose?.();
        },
      };
    },
    releaseMediaWithin() {},
    resetScrollableToTop() {},
    loadData: async (options) => calls.load.push(options),
    reviewSignature: (assets) => assets.map((asset) => `${asset.safeName}:${asset.type}`).join("|"),
    renderAssetReviewList: (status) => `review:${status.runId}`,
    soundSearchOutcome: () => ({ message: "Keine weitere Alternative gefunden.", messageType: "info" }),
    fetchJson: async (...args) => {
      calls.fetch.push(args);
      if (fetchError) throw fetchError;
      return {};
    },
    FormDataClass: class {
      get(name) { return decisions[name] ?? null; }
    },
  });
  return { calls, controllerOptions, dialog, elements, form, result, state };
}

const soundStatus = {
  runId: "run-1",
  mode: "nc-sounds",
  reviewAssets: [{ safeName: "Amsel", type: "sound", previouslyExisting: true }],
};

test("Leere oder bereits identisch geöffnete Prüfungen werden nicht erneut aufgebaut", () => {
  const fixture = createFixture();
  assert.equal(fixture.result.openReview({ reviewAssets: [] }), false);
  assert.equal(fixture.result.openReview(soundStatus), true);
  assert.equal(fixture.result.openReview(soundStatus), false);
  assert.equal(fixture.calls.bindMedia, 1);
});

test("Prüfdialog setzt Laufdaten, Alternativhinweis und Medienbindung", () => {
  const fixture = createFixture();
  fixture.result.openReview(soundStatus);
  assert.equal(fixture.dialog.open, true);
  assert.equal(fixture.form.dataset.runId, "run-1");
  assert.match(fixture.form.dataset.assets, /Amsel/);
  assert.equal(fixture.elements.assetReviewList.innerHTML, "review:run-1");
  assert.match(fixture.elements.assetReviewMessage.textContent, /übernommen, abgelehnt/);
  assert.match(fixture.elements.assetReviewMessage.className, /info/);
  assert.equal(fixture.calls.bindMedia, 1);
});

test("Schließen räumt Medien und Prüfzustand auf und lädt vorgemerkte Änderungen", async () => {
  const fixture = createFixture();
  fixture.result.openReview(soundStatus);
  fixture.state.reloadAfterAssetReviewClose = true;
  fixture.result.closeReviewDialog();
  await Promise.resolve();
  assert.equal(fixture.calls.stopAudio, 1);
  assert.equal(fixture.calls.closeLightbox, 1);
  assert.equal(fixture.state.assetReviewSignature, "");
  assert.equal(fixture.form.dataset.closeOnly, "false");
  assert.equal(fixture.calls.load[0].reload, true);
});

test("Abgelehnter Sound wird gespeichert und hält den Dialog für die Folgesuche offen", async () => {
  const fixture = createFixture({ decisions: { "asset-0": "reject" } });
  fixture.result.openReview(soundStatus);
  await fixture.form.emit("submit");
  assert.equal(fixture.dialog.open, true);
  assert.equal(fixture.state.assetReviewAwaitingRetry, true);
  assert.equal(fixture.calls.fetch.length, 1);
  const payload = JSON.parse(fixture.calls.fetch[0][1].body);
  assert.equal(payload.runId, "run-1");
  assert.equal(payload.choices[0].decision, "reject");
  assert.equal(payload.choices[0].manual, false);
  assert.match(fixture.elements.assetReviewMessage.textContent, /Nächster Sound wird gesucht/);
});

test("Beendete Folgesuche wechselt kontrolliert in den Schließen-Modus", () => {
  const fixture = createFixture({ decisions: { "asset-0": "reject" } });
  fixture.result.openReview(soundStatus);
  fixture.state.assetReviewAwaitingRetry = true;
  assert.equal(fixture.state.finishAssetReviewWaiting({ status: "completed", log: "fertig" }), true);
  assert.equal(fixture.form.dataset.closeOnly, "true");
  assert.equal(fixture.elements.assetReviewSave.textContent, "Fenster schließen");
  assert.match(fixture.elements.assetReviewMessage.textContent, /Keine weitere Alternative/);
  assert.equal(fixture.state.assetReviewAwaitingRetry, false);
});

test("Normale Pflegeentscheidung schließt; API-Fehler bleibt sichtbar korrigierbar", async () => {
  const accepted = createFixture({ decisions: { "asset-0": "manual" } });
  accepted.result.openReview(soundStatus);
  await accepted.form.emit("submit");
  assert.equal(accepted.dialog.open, false);
  const payload = JSON.parse(accepted.calls.fetch[0][1].body);
  assert.equal(payload.choices[0].manual, true);

  const failed = createFixture({
    decisions: { "asset-0": "automatic" },
    fetchError: Object.assign(new Error("Speichern fehlgeschlagen"), { details: ["Serverdetail"] }),
  });
  failed.result.openReview(soundStatus);
  await failed.form.emit("submit");
  assert.equal(failed.dialog.open, true);
  assert.equal(failed.elements.assetReviewSave.disabled, false);
  assert.match(failed.elements.assetReviewMessage.textContent, /Speichern fehlgeschlagen · Serverdetail/);
  assert.match(failed.elements.assetReviewMessage.className, /error/);
});
