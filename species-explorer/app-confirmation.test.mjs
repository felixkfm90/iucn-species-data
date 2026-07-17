import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-confirmation.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "app-confirmation.js" }).runInContext(context);
const confirmation = context.SpeciesExplorerConfirmation;

class FakeTarget {
  constructor() {
    this.listeners = new Map();
    this.focused = false;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type) {
    const event = {
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    this.listeners.get(type)?.(event);
    return event;
  }

  focus() {
    this.focused = true;
  }
}

class FakeDialog {
  constructor() {
    this.form = new FakeTarget();
    this.cancel = new FakeTarget();
    this.confirm = new FakeTarget();
    this.className = "";
    this.innerHTML = "";
    this.removed = false;
  }

  querySelector(selector) {
    if (selector === ".quick-confirm-form") return this.form;
    if (selector === ".quick-confirm-cancel") return this.cancel;
    if (selector === ".quick-confirm-ok") return this.confirm;
    return null;
  }

  remove() {
    this.removed = true;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createFixture() {
  const appended = [];
  const controllers = [];
  const documentRef = {
    body: { append: (dialog) => appended.push(dialog) },
    createElement: () => new FakeDialog(),
  };
  const showQuickConfirm = confirmation.createQuickConfirm({
    documentRef,
    escapeHtml,
    createDialogController(options) {
      const controller = {
        opened: false,
        closeReason: "",
        open() { this.opened = true; },
        close(reason) {
          this.closeReason = reason;
          options.afterClose();
        },
      };
      controllers.push(controller);
      return controller;
    },
  });
  return { appended, controllers, showQuickConfirm };
}

test("Kurzbestätigung maskiert sichtbare Texte und übernimmt den Gefahrenstil", () => {
  const fixture = createFixture();
  const pending = fixture.showQuickConfirm({
    eyebrow: "ART <A>",
    title: "Löschen & prüfen",
    message: 'Wirklich "löschen"?',
    confirmLabel: "Ja <jetzt>",
    danger: true,
  });
  const dialog = fixture.appended[0];
  assert.match(dialog.innerHTML, /ART &lt;A&gt;/);
  assert.match(dialog.innerHTML, /Löschen &amp; prüfen/);
  assert.match(dialog.innerHTML, /Wirklich &quot;löschen&quot;\?/);
  assert.match(dialog.innerHTML, /quick-confirm-ok danger/);
  assert.equal(dialog.confirm.focused, true);
  dialog.cancel.emit("click");
  return pending;
});

test("Bestätigen liefert true und schließt mit eindeutigem Grund", async () => {
  const fixture = createFixture();
  const pending = fixture.showQuickConfirm({ title: "Übertragen" });
  const dialog = fixture.appended[0];
  const event = dialog.form.emit("submit");
  assert.equal(event.defaultPrevented, true);
  assert.equal(await pending, true);
  assert.equal(fixture.controllers[0].closeReason, "confirm");
  assert.equal(dialog.removed, true);
});

test("Abbrechen liefert false und entfernt den temporären Dialog", async () => {
  const fixture = createFixture();
  const pending = fixture.showQuickConfirm({ title: "Abbrechen" });
  const dialog = fixture.appended[0];
  dialog.cancel.emit("click");
  assert.equal(await pending, false);
  assert.equal(fixture.controllers[0].closeReason, "cancel");
  assert.equal(dialog.removed, true);
});

test("Fehlende Abhängigkeiten werden vor dem Öffnen erklärt", () => {
  assert.throws(
    () => confirmation.createQuickConfirm({ documentRef: {}, escapeHtml, createDialogController() {} }),
    /Dokument mit body/,
  );
  assert.throws(
    () => confirmation.createQuickConfirm({
      documentRef: { body: { append() {} }, createElement() {} },
      createDialogController() {},
    }),
    /escapeHtml/,
  );
});
