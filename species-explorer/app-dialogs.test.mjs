import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const dialogSource = await readFile(
  new URL("./public/app-dialogs.js", import.meta.url),
  "utf8",
);

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
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...values,
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

class FakeDialog extends FakeTarget {
  constructor() {
    super();
    this.open = false;
    this.attributes = new Set();
  }

  showModal() {
    this.open = true;
    this.attributes.add("open");
  }

  close() {
    this.open = false;
    this.attributes.delete("open");
    this.emit("close");
  }

  setAttribute(name) {
    this.attributes.add(name);
    if (name === "open") this.open = true;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "open") this.open = false;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }
}

function createClassList() {
  const values = new Set();
  return {
    add: (value) => values.add(value),
    remove: (value) => values.delete(value),
    contains: (value) => values.has(value),
  };
}

const bodyClassList = createClassList();
const context = vm.createContext({
  document: { body: { classList: bodyClassList } },
});
new vm.Script(dialogSource, { filename: "app-dialogs.js" }).runInContext(context);
const dialogs = context.SpeciesExplorerDialogs;

test("Dialog-Controller öffnet und schließt modal mit gemeinsamer Körperklasse", () => {
  const dialog = new FakeDialog();
  const reasons = [];
  const controller = dialogs.createDialogController({
    dialog,
    bodyClass: "explorer-modal-open",
    afterClose: ({ reason }) => reasons.push(reason),
  });

  assert.equal(controller.open(), true);
  assert.equal(controller.open(), false);
  assert.equal(dialog.open, true);
  assert.equal(bodyClassList.contains("explorer-modal-open"), true);
  assert.equal(controller.close("test"), true);
  assert.equal(dialog.open, false);
  assert.equal(bodyClassList.contains("explorer-modal-open"), false);
  assert.deepEqual(reasons, ["test"]);
});

test("Hintergrundklick schließt nur bei Beginn und Ende auf dem Dialoghintergrund", () => {
  const dialog = new FakeDialog();
  const inside = {};
  const controller = dialogs.createDialogController({ dialog });
  controller.open();

  dialog.emit("pointerdown", { target: inside });
  dialog.emit("click", { target: dialog });
  assert.equal(dialog.open, true);

  dialog.emit("pointerdown", { target: dialog });
  dialog.emit("click", { target: dialog });
  assert.equal(dialog.open, false);
});

test("Escape respektiert Sperren und deaktivierbare Dialogabschlüsse", () => {
  const guardedDialog = new FakeDialog();
  let busy = true;
  const guarded = dialogs.createDialogController({
    dialog: guardedDialog,
    beforeClose: () => !busy,
  });
  guarded.open();
  const blockedEscape = guardedDialog.emit("cancel");
  assert.equal(blockedEscape.defaultPrevented, true);
  assert.equal(guardedDialog.open, true);
  busy = false;
  guardedDialog.emit("cancel");
  assert.equal(guardedDialog.open, false);

  const reviewDialog = new FakeDialog();
  const review = dialogs.createDialogController({
    dialog: reviewDialog,
    closeOnEscape: false,
    closeOnBackdrop: false,
  });
  review.open();
  reviewDialog.emit("cancel");
  assert.equal(reviewDialog.open, true);
});

test("Schließen-Schaltflächen werden zentral gebunden und wieder freigegeben", () => {
  const dialog = new FakeDialog();
  const button = new FakeTarget();
  const controller = dialogs.createDialogController({ dialog, closeButtons: [button] });
  controller.open();
  button.emit("click");
  assert.equal(dialog.open, false);

  controller.open();
  controller.destroy();
  button.emit("click");
  assert.equal(dialog.open, true);
});

test("Medienfreigabe stoppt Wiedergabe, entfernt Quellen und kann Elemente ersetzen", () => {
  let replacement = null;
  const clone = { controls: false, preload: "", className: "" };
  const media = {
    currentTime: 18,
    controls: true,
    preload: "metadata",
    className: "sound",
    paused: false,
    pause() { this.paused = true; },
    removed: [],
    removeAttribute(name) { this.removed.push(name); },
    loadCalled: false,
    load() { this.loadCalled = true; },
    cloneNode() { return clone; },
    parentNode: {
      replaceChild(next) { replacement = next; },
    },
  };

  const released = dialogs.releaseMediaElement(media, { replace: true });
  assert.equal(media.paused, true);
  assert.equal(media.currentTime, 0);
  assert.deepEqual(media.removed, ["src", "srcset"]);
  assert.equal(media.loadCalled, true);
  assert.equal(released, clone);
  assert.equal(replacement, clone);
  assert.equal(clone.controls, true);
  assert.equal(clone.preload, "none");
  assert.equal(clone.className, "sound");
});
