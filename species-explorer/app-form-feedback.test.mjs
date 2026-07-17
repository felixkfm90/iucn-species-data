import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-form-feedback.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-form-feedback.js" }).runInContext(context);
const feedback = context.SpeciesExplorerFormFeedback;

function createLabel() {
  const classes = new Set();
  const errors = [];
  return {
    hidden: false,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    querySelector: () => errors[0] || null,
    append: (element) => errors.push(element),
    classes,
    errors,
  };
}

function createFixture(scope = "") {
  const size = createLabel();
  const weight = createLabel();
  const sizeMale = createLabel();
  const sizeSexedFields = { hidden: true };
  const labels = { size, weight, sizeMale };
  const expectedPrefix = scope ? `${scope} ` : "";
  const form = {
    elements: {
      sizeSexed: { checked: false },
      weightSexed: { checked: false },
    },
    querySelector(selector) {
      const field = selector.match(/\[data-field="(.+)"\]$/)?.[1];
      if (field) return labels[field] || null;
      if (selector === `${expectedPrefix}[data-sexed-fields="size"]`) return sizeSexedFields;
      return null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, `${expectedPrefix}[data-field]`);
      return Object.values(labels);
    },
  };
  const documentRef = {
    createElement(tag) {
      assert.equal(tag, "small");
      return {
        className: "",
        textContent: "",
        removed: false,
        remove() { this.removed = true; },
      };
    },
  };
  const controller = feedback.createFieldFeedbackController({ form, documentRef, scope });
  return { controller, form, labels, sizeSexedFields };
}

test("Formularmeldung setzt Text, Typklasse und Sichtbarkeit einheitlich", () => {
  const element = {};
  const setMessage = feedback.createMessageSetter(element, "edit-message map-message");
  setMessage("Karte wird geprüft…", "info");
  assert.equal(element.textContent, "Karte wird geprüft…");
  assert.equal(element.className, "edit-message map-message info");
  assert.equal(element.hidden, false);
  setMessage();
  assert.equal(element.textContent, "");
  assert.equal(element.className, "edit-message map-message");
  assert.equal(element.hidden, true);
});

test("Feldfehler werden markiert, zusammengeführt und unbekannte Felder ignoriert", () => {
  const fixture = createFixture();
  fixture.controller.applyFieldErrors({
    size: ["Pflichtfeld", "Ungültiger Wert"],
    unbekannt: "ignorieren",
  });
  assert.equal(fixture.labels.size.classes.has("field-error"), true);
  assert.equal(fixture.labels.size.errors.length, 1);
  assert.equal(fixture.labels.size.errors[0].className, "field-error-text");
  assert.equal(fixture.labels.size.errors[0].textContent, "Pflichtfeld · Ungültiger Wert");
});

test("Neue Fehlerprüfung entfernt alte Markierung und Fehlertexte zuerst", () => {
  const fixture = createFixture();
  fixture.controller.applyFieldErrors({ size: "Erster Fehler" });
  const previous = fixture.labels.size.errors[0];
  fixture.controller.applyFieldErrors({ weight: "Zweiter Fehler" });
  assert.equal(previous.removed, true);
  assert.equal(fixture.labels.size.classes.has("field-error"), false);
  assert.equal(fixture.labels.weight.classes.has("field-error"), true);
});

test("Geschlechtsspezifischer Modus blendet gemeinsames Feld passend um", () => {
  const fixture = createFixture();
  fixture.form.elements.sizeSexed.checked = true;
  assert.equal(fixture.controller.updateMeasurementMode("size"), true);
  assert.equal(fixture.labels.size.hidden, true);
  assert.equal(fixture.sizeSexedFields.hidden, false);
  fixture.form.elements.sizeSexed.checked = false;
  assert.equal(fixture.controller.updateMeasurementMode("size"), false);
  assert.equal(fixture.labels.size.hidden, false);
  assert.equal(fixture.sizeSexedFields.hidden, true);
});

test("Bereichspräfix begrenzt Fehler und Messwertfelder auf den Bearbeitungsabschnitt", () => {
  const fixture = createFixture(".manual-edit-section");
  assert.equal(fixture.controller.fieldLabel("size"), fixture.labels.size);
  fixture.controller.clearFieldErrors();
  fixture.form.elements.sizeSexed.checked = true;
  fixture.controller.updateMeasurementMode("size");
  assert.equal(fixture.sizeSexedFields.hidden, false);
});

test("Fehlende Kernabhängigkeiten werden verständlich abgewiesen", () => {
  assert.throws(() => feedback.createMessageSetter(null), /Ausgabeelement/);
  assert.throws(() => feedback.createFieldFeedbackController({ form: {} }), /Formular/);
});
