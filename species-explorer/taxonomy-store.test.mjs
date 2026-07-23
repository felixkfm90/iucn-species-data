import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { importTaxonomyPrototype } from "./taxonomy-import.mjs";
import { openTaxonomyStore } from "./taxonomy-store.mjs";

const FIXTURE_DIRECTORY = path.resolve(
  "scripts",
  "fixtures",
  "taxonomy",
  "col-xr-2026-07-17",
);

let root;
let store;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-store-"));
  const taxonomyRoot = path.join(root, "taxonomy");
  await importTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
  });
  store = await openTaxonomyStore({ taxonomyRoot });
});

after(async () => {
  store?.close();
  await fs.rm(root, { recursive: true, force: true });
});

test("Status und Reichsauswahl bilden den aktivierten Prototyp ab", () => {
  assert.equal(store.status().releaseId, "col-xr-2026-07-17");
  assert.equal(store.status().counts.rawNameUsages, 123);
  const kingdoms = store.kingdoms();
  assert.equal(kingdoms.defaultKingdom, "Animalia");
  assert.equal(kingdoms.includesAllOption, true);
  assert.equal(kingdoms.values[0].id, "Animalia");
  assert.ok(kingdoms.values.some((entry) => entry.id === "Plantae"));
});

test("deutsche und wissenschaftliche Präfixe funktionieren ab einem Zeichen", () => {
  const oneCharacter = store.search({ query: "A" });
  assert.ok(oneCharacter.results.length > 0);
  assert.ok(oneCharacter.results.length <= 12);
  assert.equal(oneCharacter.selected, null);
  const german = store.search({ query: "Stieglitz", kind: "vernacular" });
  assert.equal(german.results[0].acceptedScientificName, "Carduelis carduelis");
  const scientific = store.search({
    query: "Carduelis carduelis",
    kind: "scientific",
  });
  assert.equal(scientific.results[0].germanNames.includes("Stieglitz"), true);
});

test("Synonyme führen nachvollziehbar zum akzeptierten Namen", () => {
  const result = store.search({
    query: "Parus caeruleus",
    kind: "scientific",
  });
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0].synonym, {
    scientificName: "Parus caeruleus",
    acceptedScientificName: "Cyanistes caeruleus",
  });
  assert.equal(result.selected, null);
});

test("gleichlautende Taxa werden durch den Reichsfilter nicht still ausgewählt", () => {
  const animalia = store.search({ query: "Aotus" });
  assert.equal(animalia.results.length, 1);
  assert.equal(animalia.results[0].kingdom.id, "Animalia");
  const all = store.search({ query: "Aotus", kingdom: "all" });
  assert.equal(all.results.length, 2);
  assert.deepEqual(new Set(all.results.map((entry) => entry.kingdom.id)), new Set([
    "Animalia",
    "Plantae",
  ]));
  assert.equal(all.ambiguous, true);
  assert.equal(all.selected, null);
});

test("Unterart, Aussterbestatus und Vertrauensstufe bleiben erhalten", () => {
  const subspecies = store.search({ query: "Panthera leo persica" }).results[0];
  assert.equal(subspecies.acceptedScientificName, "Panthera leo leo");
  assert.equal(subspecies.rank, "subspecies");
  const dodo = store.search({ query: "Raphus cucullatus" }).results[0];
  assert.equal(dodo.extinct, true);
  const provisional = store.search({ query: "Tyrannosaurus rex" }).results[0];
  assert.equal(provisional.status, "provisionally accepted");
  assert.equal(provisional.extinct, null);
  assert.equal(provisional.trustTier, "xr-supplement");
});

test("WoRMS-Provenienz und marine Merkmale sind getrennt abrufbar", () => {
  const result = store.search({ query: "Asterias rubens" }).results[0];
  const detail = store.taxon(result.sourceId);
  assert.equal(detail.worms.aphia_id, 123776);
  assert.equal(detail.worms.marine, 1);
  assert.equal(detail.worms.source_url.includes("marinespecies.org"), true);
  assert.equal(
    detail.identifiers.some((entry) => (
      entry.identifier_type === "worms" && entry.identifier === "123776"
    )),
    true,
  );
});

test("Animalia-Fallback erscheint nur ohne verifizierten deutschen Namen", () => {
  const animalia = store.search({ query: "Tyrannosaurus rex" }).results[0];
  assert.equal(animalia.hasVerifiedGermanName, false);
  assert.equal(animalia.manualGermanNameFallback.provider, "Animalia.bio");
  assert.equal(animalia.manualGermanNameFallback.mode, "manual-browser-search");
  const plant = store.search({
    query: "Quercus robur",
    kingdom: "Plantae",
  }).results[0];
  assert.equal(plant.manualGermanNameFallback, null);
});

test("Ergebnislimit ist auf zwölf Vorschläge begrenzt", () => {
  const result = store.search({
    query: "A",
    kingdom: "all",
    limit: 1000,
  });
  assert.equal(result.limit, 12);
  assert.ok(result.results.length <= 12);
});
