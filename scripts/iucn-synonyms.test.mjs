import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "./test-temp.mjs";
import { createIucnMapAdapter } from "./iucn-map-adapter.mjs";
import { createIucnDataAdapter } from "./iucn-data-adapter.mjs";
import { createEmptyPipelineSpeciesData, formatPipelineTaxonomyName, createSpeciesDataPipeline } from "./species-data-pipeline.mjs";

const input = { genus: "Dendrocoptes", species: "medius", german: "Mittelspecht", english: "Middle Spotted Woodpecker",
  size: "22 cm", weight: "70 g", life_expectancy: "8 Jahre", masterTaxonId: `mtx_${"a".repeat(32)}` };
const reference = { masterTaxonId: input.masterTaxonId, masterVersion: "fixture-master", scientificName: "Dendrocoptes medius",
  synonyms: ["Leiopicus medius", "Dendrocopos medius"], hierarchy: { class: "Aves", genus: "Dendrocoptes" } };
function response(name, id = 22681114) {
  const [genus, species] = name.split(" ");
  return { taxon: { sis_id: id, scientific_name: name, genus_name: genus, species_name: species, class_name: "AVES" },
    assessments: [{ assessment_id: id + 1, red_list_category_code: "LC", scopes: [{ description: { en: "Global" } }] }] };
}
function harness(results, taxonomy = reference) {
  const requests = [], errors = [];
  const adapter = createIucnDataAdapter({ token: "test-only", sleep: async () => {}, emptyEntry: createEmptyPipelineSpeciesData,
    formatTaxonomyName: formatPipelineTaxonomyName, logger: { log() {}, error() {}, warn() {} }, logError: value => errors.push(value),
    resolveTaxonomy: async received => { assert.equal(received.masterTaxonId, input.masterTaxonId); return taxonomy; },
    fetch: async url => {
      const request = new URL(url); requests.push(request);
      if (request.pathname.includes("/assessment/")) return Response.json({ population_trend: { description: { en: "Stable" } }, red_list_category: { code: "LC" } });
      const name = `${request.searchParams.get("genus_name")} ${request.searchParams.get("species_name")}`;
      const value = results[name];
      return typeof value === "number" ? new Response("", { status: value }) : Response.json(value ?? { taxon: null });
    } });
  return { requests, errors, run: () => createSpeciesDataPipeline({ fetchSpeciesData: adapter.fetchSpeciesData }).prepareSpeciesData(input) };
}

test("IUCN-Synonymfallback erhält Mastername und stabilen Slug", async () => {
  const h = harness({ "Leiopicus medius": response("Leiopicus medius") });
  const { data } = await h.run();
  assert.equal(data["Assessment ID"], 22681115);
  assert.equal(data["Wissenschaftlicher Name"], "Dendrocoptes medius");
  assert.equal(data.Genus, "Dendrocoptes");
  assert.equal(data.URLSlug, "dendrocoptesmedius");
  assert.equal(data["IUCN-Zuordnung"].scientificName, "Leiopicus medius");
  assert.equal(data["IUCN-Zuordnung"].matchedBy, "master-synonym");
  assert.equal(data["Taxon ID"], "22681114");
});

test("Direkter IUCN-Treffer benötigt keine Synonymanfragen", async () => {
  const h = harness({ "Dendrocoptes medius": response("Dendrocoptes medius") });
  assert.equal((await h.run()).data["Assessment ID"], 22681115);
  assert.equal(h.requests.length, 2);
});

test("Mehrere IUCN-Taxa aus Synonymen werden nicht willkürlich ausgewählt", async () => {
  const h = harness({ "Leiopicus medius": response("Leiopicus medius"), "Dendrocopos medius": response("Dendrocopos medius", 111) });
  assert.equal((await h.run()).data["Assessment ID"], "n/a");
  assert.ok(h.errors.some(message => /mehrere.*IUCN/i.test(message)));
  assert.equal(h.requests.filter(url => url.pathname.includes("/assessment/")).length, 0);
});

test("Mehrere Synonyme derselben IUCN-ID sind ein eindeutiger Treffer", async () => {
  const h = harness({ "Leiopicus medius": response("Leiopicus medius"), "Dendrocopos medius": response("Leiopicus medius") });
  assert.equal((await h.run()).data["Assessment ID"], 22681115);
});

for (const status of [401, 403, 429, 500]) {
  test(`IUCN-HTTP ${status} löst keine Synonymsuche aus`, async () => {
    const h = harness({ "Dendrocoptes medius": status, "Leiopicus medius": response("Leiopicus medius") });
    assert.equal((await h.run()).data["Assessment ID"], "n/a");
    assert.ok(h.requests.every(url => url.searchParams.get("genus_name") === "Dendrocoptes"));
  });
}

test("Ein bestätigter IUCN-404 erlaubt den belegten Synonymfallback", async () => {
  const h = harness({ "Dendrocoptes medius": 404, "Leiopicus medius": response("Leiopicus medius") });
  assert.equal((await h.run()).data["Assessment ID"], 22681115);
});

test("Ohne Masterzuordnung werden Eingabe-Aliasse nicht als Suchfreigabe verwendet", async () => {
  const h = harness({ "Leiopicus medius": response("Leiopicus medius") }, null);
  assert.equal((await h.run()).data["Assessment ID"], "n/a");
  assert.equal(h.requests.length, 1);
});

test("Fehlende IUCN-Daten erhalten eine zuordenbare Art und die bekannte Masterhierarchie", async () => {
  const h = harness({});
  const { data } = await h.run();
  assert.equal(data["Assessment ID"], "n/a");
  assert.equal(data.Genus, input.genus);
  assert.equal(data.Species, input.species);
  assert.equal(data.Class, "Aves");
});

test("Karten-Cache verwendet den gebundenen IUCN-Namen bei erhaltener Masteridentität", async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "iucn-synonym-map-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queries = [];
  const adapter = createIucnMapAdapter({ fetch: async () => new Response("", { status: 404 }),
    token: "fixture-only", sleep: async () => {}, sanitizeAssetName: value => value, speciesAssetDir: () => root,
    ensureDir() {}, isManualAsset: () => false, platform: "linux", validateUrl: async url => new URL(url),
    logger: { log() {}, warn() {}, error() {} }, iucnGET: async query => { queries.push(query); return { taxon: { sis_id: 22681114 } }; } });
  await adapter.downloadMapForSpecies({ "Deutscher Name": input.german, "Assessment ID": 123, Genus: input.genus, Species: input.species,
    "IUCN-Zuordnung": { scientificName: "Leiopicus medius" } });
  assert.ok(queries.some(query => query.includes("genus_name=Leiopicus&species_name=medius")));
  assert.equal(queries.some(query => query.includes("Dendrocoptes")), false);
});
