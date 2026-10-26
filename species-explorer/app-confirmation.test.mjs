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
    this.attributes = new Map();
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }

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
  assert.equal(dialog.cancel.focused, true);
  assert.equal(dialog.confirm.focused, false);
  dialog.cancel.emit("click");
  return pending;
});

test("Bestätigen liefert true und schließt mit eindeutigem Grund", async () => {
  const fixture = createFixture();
  const pending = fixture.showQuickConfirm({ title: "Übertragen" });
  const dialog = fixture.appended[0];
  assert.equal(dialog.confirm.focused, true);
  const event = dialog.form.emit("submit");
  assert.equal(event.defaultPrevented, true);
  assert.equal(await pending, true);
  assert.equal(fixture.controllers[0].closeReason, "confirm");
  assert.equal(dialog.removed, true);
});

test("Startangebot legt den Anfangsfokus auf Später und dessen Aktivierung bestätigt nichts", async () => {
  const fixture = createFixture();
  const pending = fixture.showQuickConfirm({ title: "Datenbank aktualisieren?", confirmLabel: "Jetzt aktualisieren",
    cancelLabel: "Später", initialFocus: "cancel" });
  const dialog = fixture.appended[0];
  assert.equal(dialog.cancel.focused, true);
  assert.equal(dialog.confirm.focused, false);
  assert.match(dialog.innerHTML, /quick-confirm-cancel" type="button"/);
  dialog.cancel.emit("click"); // Activation of the focused cancel button (native Enter is checked in the browser).
  assert.equal(await pending, false);
  assert.equal(fixture.controllers[0].closeReason, "cancel");
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

test("Jeder gleichzeitig offene Bestätigungsdialog hat seinen eigenen Titel und Beschreibungsbezug", async () => {
  const first = createFixture();
  const second = createFixture();
  const pendingFirst = first.showQuickConfirm({ title: "Löschen?", message: "Nur die Testart." });
  const pendingSecond = second.showQuickConfirm({ title: "Übertragen?", message: "Geprüfte Änderungen." });
  const [one, two] = [first.appended[0], second.appended[0]];
  for (const dialog of [one, two]) {
    const titleId = dialog.getAttribute("aria-labelledby");
    const descriptionId = dialog.getAttribute("aria-describedby");
    assert.ok(titleId, "Der zugängliche Name muss auf den sichtbaren Titel zeigen");
    assert.ok(descriptionId, "Der Hinweis muss dem Dialog zugeordnet sein");
    assert.ok(dialog.innerHTML.includes(`<h2 id="${titleId}">`));
    assert.ok(dialog.innerHTML.includes(`<p id="${descriptionId}" class="quick-confirm-message">`));
  }
  assert.notEqual(one.getAttribute("aria-labelledby"), two.getAttribute("aria-labelledby"));
  assert.notEqual(one.getAttribute("aria-describedby"), two.getAttribute("aria-describedby"));
  one.cancel.emit("click");
  two.form.emit("submit");
  assert.equal(await pendingFirst, false);
  assert.equal(await pendingSecond, true);
});

test("Eine Bestätigung ohne Zusatztext verweist nicht auf eine fehlende Beschreibung", async () => {
  const fixture = createFixture();
  const pending = fixture.showQuickConfirm();
  const dialog = fixture.appended[0];
  assert.ok(dialog.getAttribute("aria-labelledby"));
  assert.equal(dialog.getAttribute("aria-describedby"), null);
  dialog.cancel.emit("click");
  assert.equal(await pending, false);
});
