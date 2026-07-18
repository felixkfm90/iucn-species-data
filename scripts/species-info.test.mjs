import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../species-info.js", import.meta.url), "utf8");

async function renderInfo(data) {
  const container = { innerHTML: "" };
  const context = vm.createContext({
    document: {
      getElementById: (id) => (id === "species-info" ? container : null),
    },
    window: {
      SpeciesCore: {
        getSpeciesData: async () => data,
      },
    },
  });

  new vm.Script(source, { filename: "species-info.js" }).runInContext(context);
  await new Promise((resolve) => setImmediate(resolve));
  return container.innerHTML;
}

const commonData = {
  "Deutscher Name": "Löwe",
  "Wissenschaftlicher Name": "Panthera leo",
  Größe: "ca. 140–250 cm",
  Gewicht: "Männchen: ca. 150–250 kg; Weibchen: ca. 110–180 kg",
  Lebenserwartung: "ca. 10–14 Jahre",
  Generationsdauer: "6,98 Jahre",
  Populationsgröße: "Unbekannt",
};

test("einheitliche und geschlechtsspezifische Werte nutzen dieselbe Wertspalte", async () => {
  const html = await renderInfo(commonData);
  assert.match(html, /class="species-info-row"/);
  assert.match(html, /class="species-info-row species-info-row--split"/);
  assert.match(html, /<span class="species-info-values">ca\. 140–250 cm<\/span>/);
  assert.match(html, /<span>Männchen: ca\. 150–250 kg;<\/span>/);
  assert.match(html, /<span>Weibchen: ca\. 110–180 kg<\/span>/);
  assert.doesNotMatch(html, /style=/);
});

test("Größe und Gewicht können gleichzeitig getrennte Werte enthalten", async () => {
  const html = await renderInfo({
    ...commonData,
    "Deutscher Name": "Großtrappe",
    "Wissenschaftlicher Name": "Otis tarda",
    Größe: "Männchen: ca. 90–105 cm; Weibchen: ca. 75–85 cm",
    Gewicht: "Männchen: ca. 8–16 kg; Weibchen: ca. 3,5–5 kg",
  });
  assert.equal((html.match(/species-info-row--split/g) || []).length, 2);
  assert.match(html, /Großtrappe/);
});
