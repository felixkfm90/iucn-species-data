import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-editor-form.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-editor-form.js" }).runInContext(context);
const editorForm = context.SpeciesExplorerEditorForm;

const sizeUnits = ["cm"];
const weightUnits = ["kg"];
const ageUnits = ["Jahre"];

function createModel(values = {}, { unlocked = false } = {}) {
  const calls = { shared: [], sexed: [], stripped: [] };
  const model = editorForm.createEditorFormModel({
    form: {},
    scientificNameInput: { dataset: { unlocked: unlocked ? "true" : "false" } },
    FormDataClass: class {
      get(name) { return values[name] ?? null; }
    },
    composeManualSexedMeasurement(...args) {
      calls.sexed.push(args);
      return `sexed:${args.slice(0, 4).join("|")}`;
    },
    formatManualMeasurement(...args) {
      calls.shared.push(args);
      return `shared:${args[0]}|${args[1]}`;
    },
    stripManualMeasureInput(value, units) {
      calls.stripped.push([value, units]);
      return String(value ?? "").trim();
    },
    sizeUnits,
    weightUnits,
    ageUnits,
  });
  return { calls, model };
}

test("Bearbeitungswerte enthalten Namen, Sperrstatus und gemeinsame Messwerte", () => {
  const fixture = createModel({
    germanName: "Löwe",
    scientificName: "Panthera leo",
    size: "140-250",
    sizeUnit: "cm",
    weight: "110-250",
    weightUnit: "kg",
    lifeExpectancy: "10-14",
    lifeExpectancyUnit: "Jahre",
  }, { unlocked: true });
  const result = fixture.model.editableValues();
  assert.equal(result.germanName, "Löwe");
  assert.equal(result.scientificName, "Panthera leo");
  assert.equal(result.scientificNameUnlocked, true);
  assert.equal(result.size, "shared:140-250|cm");
  assert.equal(result.weight, "shared:110-250|kg");
  assert.equal(result.lifeExpectancy, "shared:10-14|Jahre");
  assert.equal(fixture.calls.shared[2][2].age, true);
});

test("Größe und Gewicht können im Bearbeitungsdialog unabhängig getrennt werden", () => {
  const fixture = createModel({
    germanName: "Löwe",
    scientificName: "Panthera leo",
    size: "200",
    sizeUnit: "cm",
    weightSexed: "on",
    weightMale: "150-250",
    weightMaleUnit: "kg",
    weightFemale: "110-180",
    weightFemaleUnit: "kg",
    lifeExpectancy: "12",
    lifeExpectancyUnit: "Jahre",
  });
  const result = fixture.model.editableValues();
  assert.equal(result.size, "shared:200|cm");
  assert.equal(result.weight, "sexed:150-250|kg|110-180|kg");
  assert.equal(fixture.calls.sexed[0][4].units, weightUnits);
});

test("Vollständige Bearbeitungseingaben erzeugen keine Feldfehler", () => {
  const fixture = createModel({
    germanName: "Amsel",
    scientificName: "Turdus merula",
    size: "23-29",
    weight: "80-110",
    lifeExpectancy: "3",
  });
  assert.equal(Object.keys(fixture.model.validateEditableFields()).length, 0);
});

test("Leere gemeinsame Bearbeitungsfelder werden feldgenau erklärt", () => {
  const errors = createModel().model.validateEditableFields();
  assert.equal(errors.germanName[0], "Deutscher Name darf nicht leer sein");
  assert.equal(errors.scientificName[0], "Wissenschaftlicher Name darf nicht leer sein");
  assert.equal(errors.size[0], "Größe darf nicht leer sein");
  assert.equal(errors.weight[0], "Gewicht darf nicht leer sein");
  assert.equal(errors.lifeExpectancy[0], "Lebenserwartung darf nicht leer sein");
});

test("Geschlechtsspezifische Bearbeitungsfelder werden getrennt geprüft", () => {
  const errors = createModel({
    germanName: "Löwe",
    scientificName: "Panthera leo",
    sizeSexed: "on",
    weightSexed: "on",
    lifeExpectancy: "10",
  }).model.validateEditableFields();
  assert.equal(errors.sizeMale[0], "Größe Männchen darf nicht leer sein");
  assert.equal(errors.sizeFemale[0], "Größe Weibchen darf nicht leer sein");
  assert.equal(errors.weightMale[0], "Gewicht Männchen darf nicht leer sein");
  assert.equal(errors.weightFemale[0], "Gewicht Weibchen darf nicht leer sein");
});

test("Fehlende Bearbeitungsabhängigkeiten oder Einheiten werden früh erkannt", () => {
  assert.throws(
    () => editorForm.createEditorFormModel({ form: {}, FormDataClass: class {} }),
    /composeManualSexedMeasurement/,
  );
  assert.throws(
    () => editorForm.createEditorFormModel({
      form: {},
      FormDataClass: class {},
      composeManualSexedMeasurement() {},
      formatManualMeasurement() {},
      stripManualMeasureInput() {},
    }),
    /Messwerteinheiten/,
  );
});
