import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const presentationSource = await readFile(
  new URL("./public/app-presentation.js", import.meta.url),
  "utf8",
);
const measurementSource = await readFile(
  new URL("./public/app-measurements.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({ URL });
new vm.Script(presentationSource, { filename: "app-presentation.js" }).runInContext(context);
new vm.Script(measurementSource, { filename: "app-measurements.js" }).runInContext(context);
const measurements = context.SpeciesExplorerMeasurements;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("Messwerteinheiten sind unveränderlich und zentral definiert", () => {
  assert.equal(Object.isFrozen(measurements), true);
  assert.equal(Object.isFrozen(measurements.MANUAL_SIZE_UNITS), true);
  assert.deepEqual([...measurements.MANUAL_SIZE_UNITS], ["mm", "cm", "m"]);
  assert.deepEqual([...measurements.MANUAL_WEIGHT_UNITS], ["g", "kg", "t"]);
  assert.deepEqual([...measurements.MANUAL_AGE_UNITS], ["Tage", "Monate", "Jahre"]);
});

test("Gemeinsame und ältere Freitextwerte werden verlustfrei eingelesen", () => {
  assert.deepEqual(
    plain(measurements.parseManualMeasurement(
      "ca. 23,5–29 cm",
      measurements.MANUAL_SIZE_UNITS,
      "cm",
    )),
    {
      sexed: false,
      value: "23,5–29",
      unit: "cm",
      maleValue: "",
      maleUnit: "cm",
      femaleValue: "",
      femaleUnit: "cm",
    },
  );
  assert.equal(
    measurements.parseManualMeasurement(
      "bis etwa handlang",
      measurements.MANUAL_SIZE_UNITS,
      "cm",
    ).value,
    "bis etwa handlang",
  );
});

test("Geschlechtsspezifische Werte werden in getrennte Felder zerlegt", () => {
  assert.deepEqual(
    plain(measurements.parseManualMeasurement(
      "Männchen: ca. 150–250 kg; Weibchen: ca. 110–180 kg",
      measurements.MANUAL_WEIGHT_UNITS,
      "g",
    )),
    {
      sexed: true,
      value: "",
      unit: "g",
      maleValue: "150–250",
      maleUnit: "kg",
      femaleValue: "110–180",
      femaleUnit: "kg",
    },
  );
});

test("Formatierung normalisiert ca.-Präfix, Einheiten und Singularformen", () => {
  assert.equal(
    measurements.stripManualMeasureInput("ca. 150–250 kg", measurements.MANUAL_WEIGHT_UNITS),
    "150–250",
  );
  assert.equal(
    measurements.formatManualMeasurement("ca. 1 Jahr", "Jahre", {
      units: measurements.MANUAL_AGE_UNITS,
      age: true,
    }),
    "ca. 1 Jahr",
  );
  assert.equal(
    measurements.formatManualMeasurement("2", "Jahre", {
      units: measurements.MANUAL_AGE_UNITS,
      age: true,
    }),
    "ca. 2 Jahre",
  );
  assert.equal(
    measurements.composeManualSexedMeasurement(
      "90–105",
      "cm",
      "75–85",
      "cm",
      { units: measurements.MANUAL_SIZE_UNITS },
    ),
    "Männchen: ca. 90–105 cm; Weibchen: ca. 75–85 cm",
  );
});

test("Formular-Markup übernimmt Zustand und maskiert Nutzereingaben", () => {
  const parsed = measurements.parseManualMeasurement(
    "Männchen: ca. 8–16 kg; Weibchen: ca. 3,5–5 kg",
    measurements.MANUAL_WEIGHT_UNITS,
    "g",
  );
  parsed.maleValue = `8–16\" onfocus=\"alert(1)`;
  const html = measurements.renderManualMeasurementEditor({
    kind: "weight",
    label: "Gewicht <Test>",
    parsed,
    units: measurements.MANUAL_WEIGHT_UNITS,
  });

  assert.match(html, /name="weightSexed" checked/);
  assert.match(html, /data-field="weight" hidden/);
  assert.match(html, /data-sexed-fields="weight">/);
  assert.match(html, /Gewicht &lt;Test&gt; Männchen/);
  assert.match(html, /value="8–16&quot; onfocus=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /<Test>/);
  assert.match(html, /value="kg" selected/);
});
