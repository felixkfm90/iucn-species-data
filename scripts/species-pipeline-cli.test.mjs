import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir, assertTestTempPath } from "./test-temp.mjs";
import { DatabaseSync } from "node:sqlite";
import { createTaxonomyMasterSchema } from "../species-explorer/taxonomy-master-schema.mjs";
import { createMasterTaxon, addMasterTaxonAlias } from "../species-explorer/taxonomy-master-model.mjs";
import { taxonomyMasterDatabasePath } from "../species-explorer/taxonomy-master-storage.mjs";

const execute = promisify(execFile), cli = fileURLToPath(new URL("../update.mjs", import.meta.url));
const input = { genus: "Turdus", species: "merula", german: "Amsel", english: "Blackbird", size: "24 cm",
  weight: "100 g", life_expectancy: "3 Jahre", selectedReference: { retained: true } };
const old = { URLSlug: "turdusmerula", "Wissenschaftlicher Name": "Turdus merula", "Deutscher Name": "Amsel",
  "Englischer Name": "Blackbird", Größe: "24 cm", Gewicht: "100 g", Lebenserwartung: "3 Jahre", "Assessment ID": 123,
  Status: "LC", Kategorie: "Nicht gefährdet", Trend: "Stabil", Class: "Aves", unknownGenerated: { retained: true } };
const json = value => JSON.stringify(value, null, 2);

async function fixture(t, { incomplete = false, synonym = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "species-pipeline-cli-"));
  t.after(async () => { assertTestTempPath(root); await rm(root, { recursive: true, force: true }); });
  const assetDir = join(root, "species-assets", "Amsel");
  await mkdir(assetDir, { recursive: true });
  const retained = {
    "species_list.json": json([input]),
    "lastSavedAssessmentId.json": json({ Amsel: 123 }),
    "species-assets-overrides.json": json({ version: 1, assets: { Amsel: { sound: { manual: true } } } }),
    "species-assets/Amsel/sound.mp3": "protected fixture sound bytes",
    "species-assets/Amsel/map.jpg": "current fixture map bytes",
    "species-assets/Amsel/portrait.webp": "fixture portrait bytes",
    "species-assets/Amsel/spectrogram.webp": "fixture spectrogram bytes",
    "species-assets/Amsel/credits.json": json({ source: "fixture", license: "https://creativecommons.org/licenses/by/4.0/" }),
  };
  for (const [name, bytes] of Object.entries(retained)) await writeFile(join(root, name), bytes);
  await writeFile(join(root, "speciesData.json"), json([{ ...old, Größe: "23 cm" }]));
  if (synonym) {
    const databasePath = taxonomyMasterDatabasePath(join(root, "data", "taxonomy"));
    await mkdir(dirname(databasePath), { recursive: true });
    await writeFile(join(dirname(databasePath), "manifest.json"), json({ candidateId: "fixture-cli-master" }));
    const database = new DatabaseSync(databasePath); createTaxonomyMasterSchema(database);
    const id = `mtx_${"a".repeat(32)}`;
    createMasterTaxon(database, { masterTaxonId: id, scientificName: "Turdus merula", rank: "species", kingdom: "Animalia",
      referenceState: "exact-col", createdAt: "2026-11-06T12:00:00Z" });
    addMasterTaxonAlias(database, { masterTaxonId: id, name: "Merula merula", rank: "species" });
    for (const [name, kind] of [["Turdus merula", "scientific"], ["Merula merula", "synonym"]]) {
      database.prepare(`INSERT INTO master_search_term(master_taxon_id,term,normalized_term,folded_term,german_key,term_kind,source_provider)
        VALUES(?,?,?,?,?,?,?)`).run(id, name, name.toLowerCase(), name.toLowerCase(), name.toLowerCase(), kind, "catalogue-of-life");
    }
    database.close();
  }
  const loaderPath = join(root, "fixture-fetch.mjs"), loader = pathToFileURL(loaderPath).href;
  // Every request is a synthetic adapter response. An unexpected provider aborts
  // instead of reaching the network; existing map/sound bytes must be retained.
  await writeFile(loaderPath, `import {writeFileSync} from 'node:fs';
const requests=[];
globalThis.fetch=async url=>{
  requests.push(String(url));
  if(${synonym} && String(url).includes('/taxa/scientific_name?genus_name=Turdus&')) return {ok:true,json:async()=>({taxon:null})};
  if(String(url).includes('/taxa/scientific_name?')) return {ok:true,json:async()=>(${incomplete ? "{taxon:null}" :
    JSON.stringify({ taxon: { scientific_name: synonym ? "Merula merula" : "Turdus merula", kingdom_name: "ANIMALIA", phylum_name: "CHORDATA",
      subphylum_name: "VERTEBRATA", class_name: "AVES", order_name: "PASSERIFORMES", family_name: "TURDIDAE",
      genus_name: "Turdus", species_name: "merula" }, assessments: [{ assessment_id: 123, red_list_category_code: "LC",
      year_published: 2026, scopes: [{ description: { en: "Global" } }] }] })})};
  if(String(url).endsWith('/assessment/123')) return {ok:true,json:async()=>({population_trend:{description:{en:'Stable'}},
    red_list_category:{code:'LC'},supplementary_info:{population_size:'1000',generational_length:4}})};
  throw new Error('Unexpected fixture request: '+url);
};
process.on('exit',()=>writeFileSync('fixture-requests.json',JSON.stringify(requests)));
`);
  return { root, loader, async checkRetained() {
    for (const [name, bytes] of Object.entries(retained)) assert.equal(await readFile(join(root, name), "utf8"), bytes, name);
  } };
}

test("Tatsächlicher lokaler CLI nutzt den Einartkern und erhält Eingabe, geschützten Ton und aktuelle Karte", async t => {
  const f = await fixture(t);
  const result = await execute(process.execPath, ["--import", f.loader, cli, "--mode=missing", "--species=turdusmerula", "--quiet-report"],
    { cwd: f.root, env: { ...process.env, IUCN_TOKEN: "fixture-only", XENO_TOKEN: "fixture-only" }, timeout: 20_000 });
  assert.match(result.stdout, /Fertig: Amsel - Turdus merula \(Sound: ok, Map: ok, Spezies-Data: ok\)/);
  const generated = JSON.parse(await readFile(join(f.root, "speciesData.json"), "utf8"));
  assert.equal(generated.length, 1);
  assert.equal(generated[0]["Assessment ID"], 123);
  assert.equal(generated[0].Class, "Aves");
  assert.equal(generated[0]["Englischer Name"], "Blackbird");
  assert.equal(JSON.parse(await readFile(join(f.root, "fixture-requests.json"), "utf8")).length, 2);
  assert.ok(JSON.parse(await readFile(join(f.root, "fehlende_elemente_report.json"), "utf8")));
  await f.checkRetained();
});

test("Tatsächlicher CLI erhält bei unvollständiger IUCN-Antwort den brauchbaren vollständigen Altstand", async t => {
  const f = await fixture(t, { incomplete: true });
  const result = await execute(process.execPath, ["--import", f.loader, cli, "--mode=missing", "--species=turdusmerula", "--quiet-report"],
    { cwd: f.root, env: { ...process.env, IUCN_TOKEN: "fixture-only", XENO_TOKEN: "fixture-only" }, timeout: 20_000 });
  assert.match(result.stderr, /Verwende vorhandene Daten/);
  const generated = JSON.parse(await readFile(join(f.root, "speciesData.json"), "utf8"));
  assert.deepEqual(generated[0].unknownGenerated, { retained: true });
  assert.equal(generated[0]["Assessment ID"], 123);
  assert.equal(JSON.parse(await readFile(join(f.root, "fixture-requests.json"), "utf8")).length, 1);
  await f.checkRetained();
});

test("Lokaler CLI verwendet gespeicherte Mastersynonyme und erhält führenden Namen, Eingabe und Assets", async t => {
  const f = await fixture(t, { synonym: true });
  await execute(process.execPath, ["--import", f.loader, cli, "--mode=missing", "--species=turdusmerula", "--quiet-report"],
    { cwd: f.root, env: { ...process.env, FN_EXPLORER_DATA_ROOT: join(f.root, "data"), IUCN_TOKEN: "fixture-only", XENO_TOKEN: "fixture-only" }, timeout: 20_000 });
  const [generated] = JSON.parse(await readFile(join(f.root, "speciesData.json"), "utf8"));
  assert.equal(generated["Assessment ID"], 123);
  assert.equal(generated["Wissenschaftlicher Name"], "Turdus merula");
  assert.equal(generated.Genus, "Turdus");
  assert.equal(generated["IUCN-Zuordnung"].scientificName, "Merula merula");
  assert.equal(generated["IUCN-Zuordnung"].matchedBy, "master-synonym");
  assert.equal(JSON.parse(await readFile(join(f.root, "fixture-requests.json"), "utf8")).length, 3);
  await f.checkRetained();
});

test("Tatsächlicher NC-CLI erhält Fachdaten bytegleich und vermeidet geschützte Ton-/Kartenabrufe", async t => {
  const f = await fixture(t), before = await readFile(join(f.root, "speciesData.json"));
  const result = await execute(process.execPath, ["--import", f.loader, cli, "--mode=nc-sounds", "--species=turdusmerula", "--quiet-report"],
    { cwd: f.root, env: { ...process.env, XENO_TOKEN: "fixture-only" }, timeout: 20_000 });
  assert.match(result.stdout, /Keine ungeschützten NC-Sounds oder fehlenden Sounds gefunden/);
  assert.deepEqual(await readFile(join(f.root, "speciesData.json")), before);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, "fixture-requests.json"), "utf8")), []);
  await f.checkRetained();
});

test("Der normale Report-Neuaufbau erfasst auch ein übersprungenes Artportrait", async t => {
  const f = await fixture(t);
  await rm(join(f.root, "species-assets", "Amsel", "portrait.webp"));
  await execute(process.execPath, ["--import", f.loader, cli, "--report-only", "--quiet-report"],
    { cwd: f.root, env: { ...process.env }, timeout: 20_000 });
  const report = JSON.parse(await readFile(join(f.root, "fehlende_elemente_report.json"), "utf8"));
  assert.deepEqual(report.missing.speciesAssets, [{ german: "Amsel", safeName: "Amsel", missing: ["portrait.webp"] }]);
});
