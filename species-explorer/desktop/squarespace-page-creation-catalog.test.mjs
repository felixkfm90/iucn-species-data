import assert from "node:assert/strict";
import test from "node:test";
import { observeSquarespacePageCreationCatalog, selectSquarespaceBlankPage } from "./squarespace-page-creation-catalog.mjs";

function fixture({ foreignModal = false, switchedPreview = false, missingBlank = false, initiallyOpen = false, onOpen,
  movedBlank = false, unconfirmedClick = false, delayedOpenPoint = false, changedWhileScrolling = false, shiftingOpen = false,
  remembersClassic = false } = {}) {
  const actions = [];
  let mode = initiallyOpen ? "pages" : "closed", modal = null, path = "/", authorized = false, openReads = 0;
  const state = () => ({ epoch: 123, mode, modalId: modal, previewPath: path });
  const controls = signal => ({
    signal, waitMs: 1, timeoutMs: 200,
    async read({ operation, expected, reveal }) {
      if (operation === "catalog-state") return state();
      assert.deepEqual(expected, state());
      if (operation === "catalog-blank-point") {
        assert.equal(mode, "classic");
        return missingBlank ? null : { operation, x: movedBlank && authorized ? 2 : 1 };
      }
      assert.equal(mode, { "catalog-open": "closed", "catalog-classic": "pages", "catalog-close": "classic" }[operation]);
      if (operation === "catalog-open") {
        if (++openReads === 1 && (delayedOpenPoint || changedWhileScrolling)) {
          if (changedWhileScrolling) path = "/andere-seite";
          return null;
        }
        if (shiftingOpen) {
          if (openReads === 2) { assert.equal(reveal, false); return null; }
          return { operation, x: openReads > 2 ? 2 : 1 };
        }
      }
      return { operation };
    },
    click({ operation, x }) {
      actions.push(operation);
      if (operation === "catalog-blank-point" && unconfirmedClick) return false;
      if (operation === "catalog-open") {
        if (shiftingOpen) assert.equal(x, 2);
        mode = remembersClassic ? "classic" : "pages";
        modal = "m12345678-1234-1234-1234-1234567890ab";
        onOpen?.();
      }
      if (operation === "catalog-classic") {
        mode = "classic";
        if (foreignModal) modal = "m12345678-1234-1234-1234-1234567890ac";
        if (switchedPreview) path = "/andere-seite";
      }
      if (operation === "catalog-close") { mode = "closed"; modal = null; }
      return true;
    },
  });
  return { actions, inspect: signal => observeSquarespacePageCreationCatalog(controls(signal)), select: () => {
    return selectSquarespaceBlankPage(controls(), { expectedInitial: state(),
      authorize: async () => { authorized = true; actions.push("authorized"); }, markAttempt: () => { actions.push("recorded"); } });
  } };
}

test("die Vorbereitung öffnet und schließt den klassischen Katalog ohne die Leerseitenaktion auszulösen", async () => {
  const f = fixture();
  await f.inspect();
  assert.deepEqual(f.actions, ["catalog-open", "catalog-classic", "catalog-close"]);
});

test("ein erneut geöffneter Katalog kann direkt den zuvor gewählten klassischen Editor anzeigen", async () => {
  const readOnly = fixture({ remembersClassic: true });
  await readOnly.inspect();
  assert.deepEqual(readOnly.actions, ["catalog-open", "catalog-close"]);

  const authorized = fixture({ remembersClassic: true });
  await authorized.select();
  assert.deepEqual(authorized.actions, ["catalog-open", "authorized", "recorded", "catalog-blank-point"]);
});

test("der Katalog wartet auf den Klickpunkt nach dem Scrollen, solange dieselbe Vorschau geöffnet bleibt", async () => {
  const delayed = fixture({ delayedOpenPoint: true });
  await delayed.inspect();
  assert.deepEqual(delayed.actions, ["catalog-open", "catalog-classic", "catalog-close"]);

  const shifted = fixture({ shiftingOpen: true });
  await shifted.inspect();
  assert.deepEqual(shifted.actions, ["catalog-open", "catalog-classic", "catalog-close"]);

  const changed = fixture({ changedWhileScrolling: true });
  await assert.rejects(changed.inspect(), { code: "SQUARESPACE_EDITOR_NOT_READY" });
  assert.deepEqual(changed.actions, []);
});

test("Leerseitenklick setzt aktuelle Freigabe und dieselbe Position voraus und lässt einen unklaren Klick offen", async () => {
  const moved = fixture({ movedBlank: true });
  await assert.rejects(moved.select(), { code: "SQUARESPACE_EDITOR_NOT_READY" });
  assert.deepEqual(moved.actions, ["catalog-open", "catalog-classic", "authorized", "catalog-close"]);
  const uncertain = fixture({ unconfirmedClick: true });
  await assert.rejects(uncertain.select(), { code: "SQUARESPACE_PAGE_CREATION_UNCONFIRMED" });
  assert.deepEqual(uncertain.actions, ["catalog-open", "catalog-classic", "authorized", "recorded", "catalog-blank-point"]);
});

test("fremder Dialog oder geänderte Vorschau führt zu keinem weiteren Klick", async () => {
  for (const options of [{ foreignModal: true }, { switchedPreview: true }, { initiallyOpen: true }]) {
    const f = fixture(options);
    await assert.rejects(f.inspect(), { code: "SQUARESPACE_EDITOR_NOT_READY" });
    assert.deepEqual(f.actions, options.initiallyOpen ? [] : ["catalog-open", "catalog-classic"]);
  }
});

test("fehlende Leerseitenaktion stoppt die Vorbereitung und schließt nur den eigenen Katalog", async () => {
  const f = fixture({ missingBlank: true });
  await assert.rejects(f.inspect(), { code: "SQUARESPACE_EDITOR_NOT_READY" });
  assert.deepEqual(f.actions, ["catalog-open", "catalog-classic", "catalog-close"]);
});

test("Abbruch lässt den Katalog ohne weiteren Klick offen", async () => {
  const controller = new AbortController();
  const reason = new Error("abgebrochen");
  const f = fixture({ onOpen: () => controller.abort(reason) });
  await assert.rejects(f.inspect(controller.signal), error => error === reason);
  assert.deepEqual(f.actions, ["catalog-open"]);
});
