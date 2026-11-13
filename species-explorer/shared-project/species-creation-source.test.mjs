import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fixture } from "./test-fixtures.mjs";
import { createSpeciesCreateOperations } from "../species-create.mjs";

const values = { german: "Neuer Testkauz", english: "New test owl", scientificName: "Strix nova", size: "30 cm", weight: "300 g", lifeExpectancy: "10 Jahre" };
const hashText = text => createHash("sha256").update(text).digest("hex");
async function scoped(fn) {
  const f = fixture(), filename = path.join(f.root, "species_list.json"), model = { species: [] };
  try {
    await fs.writeFile(filename, "[]\n", { flag: "wx" });
    const make = options => createSpeciesCreateOperations({ repoRoot: f.root, speciesListPath: filename, getModel: () => model, hashText,
      previewTokens: new Map(), cleanupPreviewTokens: () => { throw new Error("Shared preparation must not clean unrelated local previews."); }, ...options });
    await fn({ f, filename, model, make });
  } finally { f.cleanup(); }
}

test("shared preparation uses the normal input and name resolver without writes or invented media and taxonomy", () => scoped(async ({ f, filename, make }) => {
  const before = await fs.readFile(filename), operations = make();
  const prepared = await operations.prepareSharedNewSpecies({ values });
  assert.equal(prepared.derived.slug, "strixnova"); assert.equal(prepared.derived.safeName, "Neuer Testkauz");
  assert.equal(prepared.entry.genus, "Strix"); assert.equal(prepared.entry.species, "nova");
  assert.match(prepared.sourceHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(await fs.readFile(filename), before);
  assert.deepEqual((await fs.readdir(f.root)).sort(), ["species_list.json"]);
  assert.equal(prepared.entry.taxonomyReference, undefined);
  assert.deepEqual(await operations.prepareSharedNewSpecies({ values }), prepared);
}));

test("actual selected taxonomy provenance is retained and any later source change changes the preparation binding", () => scoped(async ({ filename, model, make }) => {
  let generation = 1;
  const reference = "mtx_" + "a".repeat(32), payload = { values, masterTaxonId: reference, taxonomyReference: reference };
  const operations = make({ assertTaxonomyAssignable: async id => ({ id, assignmentBinding: { reference: id, providerRecords: [{ generation }] } }) });
  const first = await operations.prepareSharedNewSpecies(payload);
  assert.equal(first.entry.masterTaxonId, reference); assert.equal(first.entry.taxonomyReference, reference);
  assert.deepEqual(first.entry.taxonomyBinding, { reference, providerRecords: [{ generation: 1 }] });
  generation++;
  assert.notEqual((await operations.prepareSharedNewSpecies(payload)).sourceHash, first.sourceHash);
  generation--;
  await fs.writeFile(filename, "[ ]\n");
  assert.notEqual((await operations.prepareSharedNewSpecies(payload)).sourceHash, first.sourceHash);
  model.species.push({ id: "other", slug: "other", germanName: "Andere Art", scientificName: "Strix alia", safeName: "Andere Art" });
  const afterModel = await operations.prepareSharedNewSpecies(payload);
  model.species[0].slug = "changed";
  assert.notEqual((await operations.prepareSharedNewSpecies(payload)).sourceHash, afterModel.sourceHash);
  await assert.rejects(make().prepareSharedNewSpecies(payload), /Taxonomie kann gerade nicht geprüft werden/);
}));

test("shared preparation rejects existing local species and asset folders rather than silently importing or reusing files", () => scoped(async ({ f, filename, make }) => {
  const operations = make();
  await fs.writeFile(filename, JSON.stringify([{ genus: "Strix", species: "nova", german: "Andere Benennung" }]));
  await assert.rejects(operations.prepareSharedNewSpecies({ values }), error => error.statusCode === 409 && error.details.some(message => message.includes("Wissenschaftlicher Name")));
  await fs.writeFile(filename, "[]\n");
  await fs.mkdir(path.join(f.root, "species-assets", "Neuer Testkauz"), { recursive: true });
  const sentinel = path.join(f.root, "species-assets", "Neuer Testkauz", "portrait.webp");
  await fs.writeFile(sentinel, "Existing protected file");
  await assert.rejects(operations.prepareSharedNewSpecies({ values }), error => error.statusCode === 409 && error.details.some(message => message.includes("Assetordner")));
  assert.equal(await fs.readFile(sentinel, "utf8"), "Existing protected file");
  assert.equal(await fs.readFile(filename, "utf8"), "[]\n");
}));
