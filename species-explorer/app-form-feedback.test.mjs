import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-form-feedback.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-form-feedback.js" }).runInContext(context);
const feedback = context.SpeciesExplorerFormFeedback;

function createControl(name) {
  const attributes = new Map();
  return {
    name,
    setAttribute: (key, value) => attributes.set(key, String(value)),
    getAttribute: (key) => attributes.get(key) ?? null,
    removeAttribute: (key) => attributes.delete(key),
    attributes,
  };
}

function createLabel(fieldKey) {
  const classes = new Set();
  const errors = [];
  return {
    hidden: false,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    dataset: { field: fieldKey },
    controls: [createControl(fieldKey), createControl(`${fieldKey}Unit`)],
    querySelector: () => errors.find((error) => !error.removed) || null,
    querySelectorAll() { return this.controls; },
    contains(control) { return this.controls.includes(control); },
    append: (element) => errors.push(element),
    classes,
    errors,
  };
}

function createFixture(scope = "", { validateFields } = {}) {
  const size = createLabel("size");
  const weight = createLabel("weight");
  const sizeMale = createLabel("sizeMale");
  const sizeSexedFields = { hidden: true };
  const labels = { size, weight, sizeMale };
  const expectedPrefix = scope ? `${scope} ` : "";
  const form = {
    listeners: new Map(),
    addEventListener(type, handler) { this.listeners.set(type, handler); },
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
  const controller = feedback.createFieldFeedbackController({ form, documentRef, scope, validateFields });
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

test("Fehler werden genau dem Eingabefeld zugeordnet, Hilfetexte und andere Felder bleiben erhalten", () => {
  const fixture = createFixture();
  const input = fixture.labels.size.controls[0];
  input.setAttribute("aria-describedby", "size-help shared-help");
  fixture.controller.applyFieldErrors({ size: "Größe erforderlich" });
  const error = fixture.labels.size.errors[0];
  assert.ok(error.id);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(input.getAttribute("aria-describedby"), `size-help shared-help ${error.id}`);
  assert.equal(fixture.labels.size.controls[1].getAttribute("aria-invalid"), null);
  assert.equal(fixture.labels.weight.controls[0].getAttribute("aria-invalid"), null);
  input.setAttribute("aria-describedby", `${input.getAttribute("aria-describedby")} added-help`);
  fixture.controller.clearFieldErrors();
  assert.equal(input.getAttribute("aria-invalid"), null);
  assert.equal(input.getAttribute("aria-describedby"), "size-help shared-help added-help");
});

test("Eine korrigierte Eingabe entfernt ihren Fehler, eine weiterhin ungültige Eingabe und fremde Fehler bleiben markiert", () => {
  let sizeInvalid = true;
  const fixture = createFixture("", { validateFields: () => ({ ...(sizeInvalid ? { size: ["Größe erforderlich"] } : {}), weight: ["Gewicht erforderlich"] }) });
  fixture.controller.applyFieldErrors({ size: "Größe erforderlich", weight: "Gewicht erforderlich" });
  const input = fixture.labels.size.controls[0];
  fixture.form.listeners.get("input")?.({ target: input });
  assert.equal(input.getAttribute("aria-invalid"), "true");
  sizeInvalid = false;
  fixture.form.listeners.get("input")?.({ target: input });
  assert.equal(input.getAttribute("aria-invalid"), null);
  assert.equal(input.getAttribute("aria-describedby"), null);
  assert.equal(fixture.labels.size.classes.has("field-error"), false);
  assert.equal(fixture.labels.weight.controls[0].getAttribute("aria-invalid"), "true");
});

test("Wiederholte und parallele Fehler haben eindeutige IDs und erhalten vorhandene Invalid-Zustände", () => {
  const first = createFixture();
  const second = createFixture();
  const input = first.labels.size.controls[0];
  input.setAttribute("aria-invalid", "grammar");
  first.controller.applyFieldErrors({ size: "Erster Fehler" });
  second.controller.applyFieldErrors({ size: "Anderer Dialog" });
  const previousId = first.labels.size.errors[0].id;
  assert.ok(previousId);
  assert.notEqual(previousId, second.labels.size.errors[0].id);
  first.controller.applyFieldErrors({ size: "Neue Prüfung" });
  const currentId = first.labels.size.errors.at(-1).id;
  assert.notEqual(currentId, previousId);
  assert.equal(input.getAttribute("aria-describedby"), currentId);
  first.controller.clearFieldErrors();
  assert.equal(input.getAttribute("aria-invalid"), "grammar");
});

test("Leere Fehlerlisten erzeugen keine Fehlermarkierung oder leeren Beschreibungsbezug", () => {
  const fixture = createFixture();
  fixture.controller.applyFieldErrors({ size: [], weight: "" });
  assert.equal(fixture.labels.size.classes.has("field-error"), false);
  assert.equal(fixture.labels.weight.controls[0].getAttribute("aria-invalid"), null);
});
