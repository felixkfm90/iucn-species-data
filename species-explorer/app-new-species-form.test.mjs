import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-new-species-form.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-new-species-form.js" }).runInContext(context);
const newSpeciesForm = context.SpeciesExplorerNewSpeciesForm;

const sizeUnits = ["cm"];
const weightUnits = ["kg"];
const ageUnits = ["Jahre"];

function createModel(values = {}) {
  const calls = { shared: [], sexed: [], stripped: [] };
  const model = newSpeciesForm.createNewSpeciesFormModel({
    form: {},
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

test("Gemeinsame Messwerte und Alter werden mit den richtigen Einheiten aufgebaut", () => {
  const fixture = createModel({
    german: "Löwe",
    scientificName: "Panthera leo",
    size: "140-250",
    sizeUnit: "cm",
    weight: "110-250",
    weightUnit: "kg",
    lifeExpectancy: "10-14",
    lifeExpectancyUnit: "Jahre",
  });
  const result = fixture.model.speciesValues();
  assert.equal(result.german, "Löwe");
  assert.equal(result.scientificName, "Panthera leo");
  assert.equal(result.size, "shared:140-250|cm");
  assert.equal(result.weight, "shared:110-250|kg");
  assert.equal(result.lifeExpectancy, "shared:10-14|Jahre");
  assert.equal(fixture.calls.shared[2][2].age, true);
  assert.equal(fixture.calls.shared[2][2].units, ageUnits);
});

test("Größe und Gewicht können unabhängig geschlechtsspezifisch aufgebaut werden", () => {
  const fixture = createModel({
    sizeSexed: "on",
    sizeMale: "150",
    sizeMaleUnit: "cm",
    sizeFemale: "130",
    sizeFemaleUnit: "cm",
    weight: "100",
    weightUnit: "kg",
    lifeExpectancy: "12",
    lifeExpectancyUnit: "Jahre",
  });
  const result = fixture.model.speciesValues();
  assert.equal(result.size, "sexed:150|cm|130|cm");
  assert.equal(result.weight, "shared:100|kg");
  assert.equal(fixture.calls.sexed[0][4].units, sizeUnits);
});

test("Vollständige Eingaben erzeugen keine lokalen Feldfehler", () => {
  const fixture = createModel({
    german: "Amsel",
    scientificName: "Turdus merula",
    size: "23-29",
    weight: "80-110",
    lifeExpectancy: "3",
  });
  assert.equal(Object.keys(fixture.model.localFieldErrors()).length, 0);
});

test("Leere Namen und gemeinsame Messwerte werden feldgenau erklärt", () => {
  const errors = createModel().model.localFieldErrors();
  assert.equal(errors.german[0], "Deutscher Name darf nicht leer sein");
  assert.equal(errors.scientificName[0], "Wissenschaftlicher Name darf nicht leer sein");
  assert.equal(errors.size[0], "Größe darf nicht leer sein");
  assert.equal(errors.weight[0], "Gewicht darf nicht leer sein");
  assert.equal(errors.lifeExpectancy[0], "Lebenserwartung darf nicht leer sein");
});

test("Geschlechtsspezifische Pflichtfelder werden getrennt gemeldet", () => {
  const errors = createModel({
    german: "Löwe",
    scientificName: "Panthera leo",
    sizeSexed: "on",
    weightSexed: "on",
    lifeExpectancy: "10",
  }).model.localFieldErrors();
  assert.equal(errors.sizeMale[0], "Größe Männchen darf nicht leer sein");
  assert.equal(errors.sizeFemale[0], "Größe Weibchen darf nicht leer sein");
  assert.equal(errors.weightMale[0], "Gewicht Männchen darf nicht leer sein");
  assert.equal(errors.weightFemale[0], "Gewicht Weibchen darf nicht leer sein");
});

test("Fehlende Formatierungsabhängigkeiten oder Einheiten werden früh erkannt", () => {
  assert.throws(
    () => newSpeciesForm.createNewSpeciesFormModel({ form: {}, FormDataClass: class {} }),
    /composeManualSexedMeasurement/,
  );
  assert.throws(
    () => newSpeciesForm.createNewSpeciesFormModel({
      form: {},
      FormDataClass: class {},
      composeManualSexedMeasurement() {},
      formatManualMeasurement() {},
      stripManualMeasureInput() {},
    }),
    /Messwerteinheiten/,
  );
});
