import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "../scripts/test-temp.mjs";
import { createTaxonomyMasterSchema } from "./taxonomy-master-schema.mjs";
import { createMasterTaxon, addMasterTaxonAlias } from "./taxonomy-master-model.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { readIucnMasterReference } from "./taxonomy-iucn-reference.mjs";

const id = `mtx_${"a".repeat(32)}`, other = `mtx_${"b".repeat(32)}`;
const input = { genus: "Dendrocoptes", species: "medius", masterTaxonId: id };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "iucn-master-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filename = taxonomyMasterDatabasePath(root);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(path.join(path.dirname(filename), "manifest.json"), JSON.stringify({ candidateId: "fixture-master" }));
  const db = new DatabaseSync(filename); createTaxonomyMasterSchema(db);
  createMasterTaxon(db, { masterTaxonId: id, scientificName: "Dendrocoptes medius", rank: "species", kingdom: "Animalia",
    referenceState: "exact-col", createdAt: "2026-11-06T12:00:00Z" });
  function term(masterId, name, kind) {
    db.prepare(`INSERT INTO master_search_term(master_taxon_id,term,normalized_term,folded_term,german_key,term_kind,source_provider)
      VALUES(?,?,?,?,?,?,?)`).run(masterId, name, normalizeTaxonomySearchTerm(name), name.toLowerCase(), name.toLowerCase(), kind, "catalogue-of-life");
  }
  term(id, "Dendrocoptes medius", "scientific");
  addMasterTaxonAlias(db, { masterTaxonId: id, name: "Leiopicus medius", rank: "species" });
  term(id, "Leiopicus medius", "synonym");
  addMasterTaxonAlias(db, { masterTaxonId: id, name: "Wrongus projectus", rank: "species", aliasType: "project-name" });
  return { root, db, term };
}

test("IUCN-Referenz liest nur gespeicherte Synonyme derselben aktiven Masterart", async t => {
  const f = await fixture(t); f.db.close();
  const result = await readIucnMasterReference({ ...input, synonyms: ["Injected species"] }, { taxonomyRoot: f.root });
  assert.equal(result.scientificName, "Dendrocoptes medius");
  assert.deepEqual(result.synonyms, ["Leiopicus medius"]);
  assert.equal(result.masterTaxonId, id);
  assert.equal(result.masterVersion, "fixture-master");
});

test("Alte Eingaben ohne Master-ID werden nur eindeutig über den lokalen Index gebunden", async t => {
  const f = await fixture(t); f.db.close();
  const result = await readIucnMasterReference({ genus: input.genus, species: input.species }, { taxonomyRoot: f.root });
  assert.equal(result.masterTaxonId, id);
  await assert.rejects(readIucnMasterReference({ ...input, masterTaxonId: other }, { taxonomyRoot: f.root }), /nicht eindeutig/);
  const oldName = await readIucnMasterReference({ genus: "Leiopicus", species: "medius" }, { taxonomyRoot: f.root });
  assert.deepEqual(oldName.synonyms, ["Dendrocoptes medius"]);
});

test("Mehrdeutige Synonyme können keine IUCN-Zuordnung autorisieren", async t => {
  const f = await fixture(t);
  createMasterTaxon(f.db, { masterTaxonId: other, scientificName: "Other species", rank: "species", kingdom: "Animalia",
    referenceState: "exact-col", createdAt: "2026-11-06T12:00:00Z" });
  f.term(other, "Leiopicus medius", "synonym"); f.db.close();
  await assert.rejects(readIucnMasterReference(input, { taxonomyRoot: f.root }), /mehreren Masterarten/);
});

test("Eine nicht installierte Masterreferenz erfindet keine Synonyme", async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "iucn-no-master-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(await readIucnMasterReference(input, { taxonomyRoot: root }), null);
});
