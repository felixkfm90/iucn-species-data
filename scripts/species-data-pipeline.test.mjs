import assert from "node:assert/strict";
import test from "node:test";
import { createIucnDataAdapter } from "./iucn-data-adapter.mjs";
import { createSpeciesDataPipeline, createEmptyPipelineSpeciesData, hasUsablePipelineSpeciesData,
  preservePipelineSpeciesData, formatPipelineTaxonomyName } from "./species-data-pipeline.mjs";

const input = Object.freeze({ genus: "Turdus", species: "merula", german: "Amsel", english: "Blackbird",
  size: "24 cm", weight: "100 g", life_expectancy: "3 Jahre", privateSource: { retained: true } });
const complete = () => ({ URLSlug: "turdusmerula", "Wissenschaftlicher Name": "Turdus merula", "Deutscher Name": "Amsel",
  "Assessment ID": 123, Status: "LC", Kategorie: "Nicht gefährdet", Trend: "Stabil", Class: "AVES",
  unknownGeneratedField: { retain: ["original"] } });
const quiet = { warn() {}, error() {}, log() {} };

test("Datenlauf bindet manuelle Felder und die bestätigte Taxonomiereferenz", async () => {
  let received;
  const result = await createSpeciesDataPipeline({ fetchSpeciesData: async (...args) => { received = args; return complete(); } })
    .prepareSpeciesData(input);
  assert.deepEqual(received, ["Turdus", "merula", "Amsel", "Blackbird", "24 cm", "100 g", "3 Jahre", input]);
  assert.equal(result.fetched, true);
  assert.equal(result.usedExistingData, false);
  assert.equal(result.data["Assessment ID"], 123);
});

test("Unvollständiger realer IUCN-Adapterabruf erhält brauchbaren Altstand und unbekannte Felder", async () => {
  const old = complete(), before = structuredClone(old), messages = [];
  const adapter = createIucnDataAdapter({ fetch: async () => ({ ok: true, json: async () => ({ taxon: null }) }),
    token: "fixture-token", sleep: async () => {}, emptyEntry: createEmptyPipelineSpeciesData,
    formatTaxonomyName: formatPipelineTaxonomyName, logger: quiet });
  const result = await createSpeciesDataPipeline({ fetchSpeciesData: adapter.fetchSpeciesData,
    logError: message => messages.push(message), logger: quiet }).prepareSpeciesData(input, { existingData: old });
  assert.equal(result.usedExistingData, true);
  assert.equal(result.fetched, true);
  assert.equal(result.data["Assessment ID"], 123);
  assert.equal(result.data.Größe, "24 cm");
  assert.equal(result.data["Englischer Name"], "Blackbird");
  assert.equal(result.data.Class, "Aves");
  assert.deepEqual(result.data.unknownGeneratedField, { retain: ["original"] });
  assert.deepEqual(old, before);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Fallback.*Amsel.*Turdus merula/);
});

test("Reiner Medienlauf mit Altstand ruft keine Fachdatenquelle auf", async () => {
  const result = await createSpeciesDataPipeline({ fetchSpeciesData: () => assert.fail("Kein Abruf im reinen Medienlauf") })
    .prepareSpeciesData(input, { existingData: complete(), assetOnly: true });
  assert.equal(result.fetched, false);
  assert.equal(result.usedExistingData, true);
  assert.equal(result.data.Class, "Aves");
});

test("Reiner Medienlauf ohne Altstand erzeugt den tatsächlich abgefragten Kandidaten", async () => {
  let requests = 0;
  const result = await createSpeciesDataPipeline({ fetchSpeciesData: async () => { requests++; return complete(); } })
    .prepareSpeciesData(input, { assetOnly: true });
  assert.equal(requests, 1);
  assert.equal(result.fetched, true);
  assert.equal(result.usedExistingData, false);
});

test("Fehlender neuer und unbrauchbarer alter Assessmentstand werden nicht als vollständige Daten ausgegeben", async () => {
  const missing = createEmptyPipelineSpeciesData("Turdus merula", "Amsel", "Blackbird", { size: "24 cm" },
    { now: () => new Date("2026-11-02T12:00:00Z") });
  const result = await createSpeciesDataPipeline({ fetchSpeciesData: async () => missing }).prepareSpeciesData(input,
    { existingData: { "Wissenschaftlicher Name": "Turdus merula", Status: "LC" } });
  assert.equal(hasUsablePipelineSpeciesData(result.data), false);
  assert.equal(result.usedExistingData, false);
  assert.equal(result.data["Daten abgerufen"], "2026-11-02");
  assert.equal(result.data.Gewicht, "n/a");
  assert.equal(result.data.Genus, "Turdus");
  assert.equal(result.data.Species, "merula");
  assert.equal(result.data.Größe, "24 cm");
});

test("Abweichender aufgelöster Name bleibt sichtbar, Eingabe und stabiler Slug werden nicht umbenannt", async () => {
  const result = await createSpeciesDataPipeline({ fetchSpeciesData: async () => ({ ...complete(),
    "Wissenschaftlicher Name": "Turdus resolvedus" }) }).prepareSpeciesData(input);
  assert.equal(result.data["Wissenschaftlicher Name"], "Turdus resolvedus");
  assert.equal(result.data.URLSlug, "turdusmerula");
  assert.equal(input.species, "merula");
});

test("Fehlende manuelle Ergänzungen löschen bei einer Rückfallentscheidung keine vorhandenen Werte", () => {
  const result = preservePipelineSpeciesData({ ...complete(), "Englischer Name": "Existing name", Gewicht: "95 g",
    Größe: "23 cm", Lebenserwartung: "4 Jahre", Subphylum: "VERTEBRATA" }, { english: "", size: "", weight: "", life_expectancy: "" });
  assert.equal(result["Englischer Name"], "Existing name");
  assert.equal(result.Größe, "23 cm");
  assert.equal(result.Gewicht, "95 g");
  assert.equal(result.Lebenserwartung, "4 Jahre");
  assert.equal(result.Subphylum, "Vertebrata");
});

test("Unerwarteter Quellenfehler wird weitergegeben und nicht als erfolgreicher Kandidat getarnt", async () => {
  await assert.rejects(createSpeciesDataPipeline({ fetchSpeciesData: async () => { throw new Error("fixture interrupted"); } })
    .prepareSpeciesData(input, { existingData: complete() }), /fixture interrupted/);
});
