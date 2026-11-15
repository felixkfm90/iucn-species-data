import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { normalizeMobileCatalogGeneral } from "../mobile/tool/catalog-editorial.mjs";
import { speciesGeneralSourceText } from "../species-explorer/species-content/general.mjs";

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
  "Englischer Name": "Lion",
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
  assert.ok(html.indexOf("Deutscher Name") < html.indexOf("Englischer Name"));
  assert.ok(html.indexOf("Englischer Name") < html.indexOf("Lateinischer Name"));
  assert.ok(html.indexOf("Lateinischer Name") < html.indexOf("Größe"));
  assert.doesNotMatch(html, />Wissenschaftlicher Name:/);
  assert.doesNotMatch(html, /species-info-name/);
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

test("App-Katalog übernimmt die Website-Regeln für fehlende Allgemein- und IUCN-Werte", async () => {
  for (const marker of [" U ", "n/a", "Na", "N.A.", "unknown", ""]) {
    const record = { ...commonData, URLSlug: "pantheraleo", "Englischer Name": marker, Größe: marker,
      Lebenserwartung: marker, "Populationgröße": marker, Generationsdauer: marker, Trend: marker };
    const html = await renderInfo(record);
    const article = "Redaktioneller Absatz\nPopulationsgröße: U im Beispiel";
    const sections = [{ title: "Allgemein", text: `${article}\n\n${speciesGeneralSourceText(record)}` },
      { title: "Lebensraum", text: "U ist Teil eines unabhängigen Textabsatzes." }];
    const catalog = { species: [{ id: record.URLSlug, sections }] };
    assert.deepEqual(normalizeMobileCatalogGeneral(catalog, [record]), [record.URLSlug]);
    const text = sections[0].text;
    assert.ok(text.startsWith(`${article}\n\n`));
    assert.match(text, /^Populationsgröße: Unbekannt$/m);
    assert.match(text, /^Generationsdauer: Unbekannt$/m);
    assert.match(text, /^Trend: Unbekannt$/m);
    assert.ok(text.includes(`Gewicht: ${record.Gewicht}`));
    assert.doesNotMatch(text, /^(?:Englischer Name|Größe|Lebenserwartung):/m);
    assert.doesNotMatch(html, />(?:Englischer Name|Größe|Lebenserwartung):/);
    assert.match(html, /Generationsdauer:<\/span>\s*<span class="species-info-values">Unbekannt<\/span>/);
    assert.match(html, /Populationsgröße:<\/span>\s*<span class="species-info-values">Unbekannt<\/span>/);
    assert.equal(sections[1].text, "U ist Teil eines unabhängigen Textabsatzes.");
  }
});

test("Die App-Projektion erhält bekannte Werte und verwirft eine fremde Allgemein-Fassung", () => {
  const record = { ...commonData, URLSlug: "pantheraleo", "Populationgröße": "23.000–39.000", Trend: "Abnehmend" };
  const section = { title: "Allgemein", text: speciesGeneralSourceText(record) };
  const catalog = { species: [{ id: record.URLSlug, sections: [section] }] };
  normalizeMobileCatalogGeneral(catalog, [record]);
  assert.match(section.text, /^Populationsgröße: 23\.000–39\.000$/m);
  assert.match(section.text, /^Generationsdauer: 6,98 Jahre$/m);
  assert.match(section.text, /^Trend: Abnehmend$/m);
  section.text = "Unabhängiger redaktioneller Eintrag";
  assert.throws(() => normalizeMobileCatalogGeneral(catalog, [record]), /nicht eindeutig gebunden/);
  assert.equal(section.text, "Unabhängiger redaktioneller Eintrag");
});
