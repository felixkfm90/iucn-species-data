import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { openTaxonomyMasterStore } from "./taxonomy-master-store.mjs";
import { buildLightroomSearchPackage, verifyLightroomSearchPackage } from "./lightroom-search-package.mjs";
import { activateLightroomSearchPackage, lightroomSearchDatabasePath } from "./lightroom-search-storage.mjs";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { activateTaxonomyCorrectionRelease, readActiveTaxonomyCorrectionPointer } from "./taxonomy-correction-release.mjs";
import { createTaxonomyNamePreferenceService } from "./taxonomy-name-preference-service.mjs";
import { resolveProviderGermanName } from "./taxonomy-provider-standard.mjs";

const scientificName = "Ciconia ciconia";
const digest = async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");

test("Anbieterstandard ersetzt eingebauten eigenen Namen, bleibt nach Neubau dynamisch und erlaubt Rückwahl", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fn-provider-standard-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const taxonomyRoot = path.join(root, "taxonomy");
  const searchRoot = path.join(root, "lightroom");
  const correctionsPath = path.join(root, "corrections.json");
  const initial = [{ scientificName, rank: "species", kingdom: "Animalia", germanName: "Eigener Storch", englishName: "My Stork", note: "English retained" }];
  await fs.writeFile(correctionsPath, JSON.stringify({ schemaVersion: 1, entries: initial }));
  const projectTaxa = [{ projectTaxonKey: "stork", projectSlug: "ciconiaciconia", scientificName, rank: "species", kingdom: "Animalia", germanName: "Projektstorch" }];
  const projectSnapshot = JSON.stringify(projectTaxa);
  async function build(day, germanName, corrections) {
    const now = new Date(`2026-09-${day}T10:00:00.000Z`);
    await buildTaxonomyMasterCandidate({ taxonomyRoot, now: () => now, corrections, projectTaxa,
      colRelease: { releaseId: `col-${day}`, providerVersion: `COL-${day}`, importedAt: now.toISOString(), recordCount: 1 },
      colRecords: [{ providerRecordId: "stork", scientificName, rank: "species", kingdom: "Animalia",
        germanNames: [germanName], englishNames: ["White Stork"],
        hierarchy: { kingdom: "Animalia", phylum: "Chordata", class: "Aves", order: "Ciconiiformes", family: "Ciconiidae", genus: "Ciconia", species: scientificName } }],
    });
    await activateTaxonomyMasterCandidate(taxonomyRoot, { confirmed: true, now: () => now });
    await fs.writeFile(path.join(taxonomyRoot, "active.json"), JSON.stringify({ schemaVersion: 1, activeRelease: `COL-${day}` }));
    await buildLightroomSearchPackage({ taxonomyRoot, searchRoot });
    await activateLightroomSearchPackage(searchRoot, { verify: verifyLightroomSearchPackage });
  }
  await build("01", "Weißstorch", initial);
  const master = await openTaxonomyMasterStore({ taxonomyRoot });
  const masterTaxonId = master.search({ query: scientificName, kingdom: "all" }).results[0].masterTaxonId;
  master.close();
  assert.ok(masterTaxonId);
  const service = createTaxonomyNamePreferenceService({ taxonomyRoot, searchRoot, correctionsPath });
  const hashes = async () => Promise.all([taxonomyMasterDatabasePath(taxonomyRoot, "active"), lightroomSearchDatabasePath(searchRoot, "active")].map(digest));
  const before = await hashes();
  const preview = await service.preview({ masterTaxonId, useProviderStandard: true });
  assert.equal(preview.previousGermanName, "Eigener Storch");
  assert.equal(preview.germanName, "Weißstorch");
  assert.equal(preview.providerStandard.provider, "catalogue-of-life");
  assert.equal(await readActiveTaxonomyCorrectionPointer(taxonomyRoot), null);
  await assert.rejects(service.save(preview), /bestätigt/);
  assert.equal((await service.save({ ...preview, confirmed: true })).saved, true);
  assert.deepEqual(await hashes(), before);
  async function checkBoth(germanName, source) {
    const lr = await openLightroomSearchStore({ searchRoot });
    const db = await openTaxonomyMasterStore({ taxonomyRoot });
    try {
      assert.equal(lr.taxon(masterTaxonId).germanName, germanName);
      assert.equal(db.taxon(masterTaxonId).preferredGermanName, germanName);
      assert.equal(lr.taxon(masterTaxonId).englishName, "My Stork");
      assert.equal(db.taxon(masterTaxonId).preferredEnglishName, "My Stork");
      assert.equal(db.taxon(masterTaxonId).germanNames[0].provider, source);
      assert.equal(lr.search(germanName)[0].masterTaxonId, masterTaxonId);
      assert.equal(db.search({ query: germanName, kingdom: "all" }).results[0].masterTaxonId, masterTaxonId);
    } finally { lr.close(); db.close(); }
  }
  await checkBoth("Weißstorch", "catalogue-of-life");
  const corrections = JSON.parse(await fs.readFile(correctionsPath, "utf8")).entries;
  assert.equal(corrections[0].germanName, "");
  assert.equal(corrections[0].germanNameMode, "provider");
  assert.equal(corrections[0].namePreference.previousGermanName, "Eigener Storch");
  await build("02", "Neuer Anbietername", corrections);
  await activateTaxonomyCorrectionRelease({ taxonomyRoot, searchRoot, corrections });
  await checkBoth("Neuer Anbietername", "catalogue-of-life");
  assert.equal(JSON.stringify(projectTaxa), projectSnapshot);
  const undo = await service.preview({ masterTaxonId, usePrevious: true });
  assert.equal(undo.germanName, "Eigener Storch");
  await service.save({ ...undo, confirmed: true });
  await checkBoth("Eigener Storch", "manual");
});

test("Anbieterermittlung ignoriert manuelle, entfernte und abgelehnte Werte und blockiert unklare WoRMS-Priorität", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE provider_release (release_id TEXT, provider TEXT, provider_version TEXT, release_state TEXT);
      CREATE TABLE provider_taxon_assertion (assertion_id INTEGER, version_change_state TEXT, match_state TEXT, release_id TEXT, master_taxon_id TEXT);
      CREATE TABLE master_field_assertion (assertion_id INTEGER PRIMARY KEY, master_taxon_id TEXT, field_name TEXT,
        language TEXT, field_value TEXT, confidence REAL, origin_kind TEXT, release_id TEXT,
        provider_taxon_assertion_id INTEGER, review_state TEXT);
    `);
    const add = (id, provider, name, { origin = "source", change = "unchanged", review = "pending" } = {}) => {
      database.prepare("INSERT INTO provider_release VALUES (?, ?, 'fixture', 'active')").run(String(id), provider);
      database.prepare("INSERT INTO provider_taxon_assertion VALUES (?, ?, 'exact', ?, 'taxon')").run(id, change, String(id));
      database.prepare("INSERT INTO master_field_assertion VALUES (?, 'taxon', 'german-name', 'de', ?, 1, ?, ?, ?, ?)").run(id, name, origin, String(id), id, review);
    };
    add(1, "manual", "Eigener Name", { origin: "manual" });
    add(2, "catalogue-of-life", "Entfernt", { change: "removed" });
    add(3, "catalogue-of-life", "Abgelehnt", { review: "rejected" });
    assert.throws(() => resolveProviderGermanName(database, "taxon"), /kein belegter/);
    add(4, "gbif", "GBIF-Name");
    assert.equal(resolveProviderGermanName(database, "taxon").germanName, "GBIF-Name");
    add(5, "worms", "WoRMS-Name");
    assert.throws(() => resolveProviderGermanName(database, "taxon"), /nicht eindeutig/);
    add(6, "catalogue-of-life", "CoL-Name");
    assert.equal(resolveProviderGermanName(database, "taxon").germanName, "CoL-Name");
  } finally { database.close(); }
});
