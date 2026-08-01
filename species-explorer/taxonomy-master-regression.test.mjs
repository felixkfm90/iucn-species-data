import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { openTaxonomyMasterStore } from "./taxonomy-master-store.mjs";

const FIRST = new Date("2026-08-01T08:00:00.000Z");
const SECOND = new Date("2026-09-01T08:00:00.000Z");

async function createRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-master-regression-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function colRelease(version, date) {
  return {
    releaseId: `col-${version}`,
    providerVersion: version,
    importedAt: date.toISOString(),
    sourceUrl: "https://www.catalogueoflife.org/",
    recordCount: 1,
  };
}

function providerSlice(provider, providerVersion, records, date = FIRST) {
  return {
    manifest: {
      provider,
      providerVersion,
      retrievedAt: date.toISOString(),
      sourceUrl: `https://example.test/${provider}`,
    },
    records,
  };
}

function sciurusProject() {
  return {
    projectTaxonKey: "sciurusvulgaris",
    projectSlug: "sciurusvulgaris",
    scientificName: "Sciurus vulgaris",
    rank: "species",
    kingdom: "Animalia",
    germanName: "Eurasisches Eichhörnchen",
    englishName: "Eurasian Red Squirrel",
  };
}

function sciurusExternal(provider, providerRecordId) {
  return {
    providerRecordId,
    scientificName: "Sciurus vulgaris",
    rank: "species",
    kingdom: "Animalia",
    hierarchy: {
      kingdom: "Animalia",
      phylum: "Chordata",
      class: "Mammalia",
      order: "Rodentia",
      family: "Sciuridae",
      genus: "Sciurus",
      species: "Sciurus vulgaris",
    },
    names: provider === "wikidata"
      ? [{ name: "Eurasisches Eichhörnchen", language: "de", nameKind: "vernacular", verified: true }]
      : [],
    relevanceReasons: ["project-species", "col-reference-gap"],
  };
}

function sciurusColRecord({ withSynonym = false } = {}) {
  return {
    providerRecordId: "col-sciurus-vulgaris",
    scientificName: "Sciurus vulgaris",
    rank: "species",
    kingdom: "Animalia",
    hierarchy: {
      kingdom: "Animalia",
      phylum: "Chordata",
      class: "Mammalia",
      order: "Rodentia",
      family: "Sciuridae",
      genus: "Sciurus",
      species: "Sciurus vulgaris",
    },
    scientificNames: withSynonym
      ? [{ scientific_name: "Sciurus europaeus" }]
      : [],
  };
}

function readMasterRows(root, slot = "active") {
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, slot), { readOnly: true });
  try {
    return {
      taxa: database.prepare("SELECT * FROM master_taxon ORDER BY master_taxon_id").all(),
      statuses: database.prepare("SELECT * FROM master_taxon_status ORDER BY master_taxon_id, status_name").all(),
      projects: database.prepare("SELECT * FROM project_taxon_link ORDER BY project_taxon_key").all(),
      aliases: database.prepare("SELECT * FROM master_taxon_alias ORDER BY normalized_name").all(),
    };
  } finally {
    database.close();
  }
}

test("9.11 schließt die Sciurus-vulgaris-CoL-Lücke ohne zweiten Masterdatensatz", async (t) => {
  const root = await createRoot(t);
  const externalSlices = [
    providerSlice("gbif", "2026-08", [sciurusExternal("gbif", "5219668")]),
    providerSlice("inaturalist", "2026-08", [sciurusExternal("inaturalist", "46017")]),
    providerSlice("wikidata", "2026-08", [sciurusExternal("wikidata", "Q179451")]),
  ];
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", FIRST),
    colRecords: [],
    providerSlices: externalSlices,
    projectTaxa: [sciurusProject()],
    now: () => FIRST,
  });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
  const first = readMasterRows(root);
  assert.equal(first.taxa.length, 1);
  assert.equal(first.taxa[0].reference_state, "reference-gap");
  assert.deepEqual(
    first.statuses.map((entry) => entry.status_name),
    ["col-reference-gap", "externally-confirmed"],
  );
  assert.equal(first.projects[0].project_slug, "sciurusvulgaris");
  const stableId = first.taxa[0].master_taxon_id;

  const candidate = await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-09", SECOND),
    colRecords: [sciurusColRecord()],
    providerSlices: externalSlices,
    projectTaxa: [sciurusProject()],
    now: () => SECOND,
  });
  assert.deepEqual(candidate.diff.closedReferenceGaps, ["Sciurus vulgaris"]);
  const staged = readMasterRows(root, "staging");
  assert.equal(staged.taxa.length, 1);
  assert.equal(staged.taxa[0].master_taxon_id, stableId);
  assert.equal(staged.taxa[0].reference_state, "exact-col");
  assert.equal(staged.projects[0].project_slug, "sciurusvulgaris");
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => SECOND });

  const active = readMasterRows(root);
  assert.equal(active.taxa.length, 1);
  assert.equal(active.taxa[0].master_taxon_id, stableId);
  assert.equal(active.taxa[0].reference_state, "exact-col");
  assert.equal(active.statuses.some((entry) => entry.status_name === "col-reference-gap"), false);
  assert.equal(active.statuses.some((entry) => entry.status_name === "col-confirmed"), true);
});

test("9.11 trennt Homonyme gleichen Rangs anhand des Reichs", async (t) => {
  const root = await createRoot(t);
  const duplicateName = "Duplicata exemplaris";
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", FIRST),
    colRecords: [],
    providerSlices: [providerSlice("gbif", "2026-08", [{
      providerRecordId: "animal-1",
      scientificName: duplicateName,
      rank: "species",
      kingdom: "Animalia",
      relevanceReasons: ["searched-taxon"],
    }, {
      providerRecordId: "plant-1",
      scientificName: duplicateName,
      rank: "species",
      kingdom: "Plantae",
      relevanceReasons: ["searched-taxon"],
    }])],
    now: () => FIRST,
  });
  const staged = readMasterRows(root, "staging");
  assert.equal(staged.taxa.length, 2);
  assert.equal(new Set(staged.taxa.map((entry) => entry.master_taxon_id)).size, 2);
  assert.deepEqual(staged.taxa.map((entry) => entry.kingdom).sort(), ["Animalia", "Plantae"]);
});

test("9.11 führt Animalia, Metazoa und einen fehlenden Reichswert zu genau einer Projektart zusammen", async (t) => {
  const root = await createRoot(t);
  const metazoaRecord = {
    ...sciurusExternal("gbif", "5219668"),
    kingdom: "Metazoa",
    hierarchy: {
      ...sciurusExternal("gbif", "5219668").hierarchy,
      kingdom: "Metazoa",
    },
  };
  const recordWithoutKingdom = {
    ...sciurusExternal("inaturalist", "46017"),
    kingdom: "",
    hierarchy: {
      phylum: "Chordata",
      class: "Mammalia",
      order: "Rodentia",
      family: "Sciuridae",
      genus: "Sciurus",
      species: "Sciurus vulgaris",
    },
  };

  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", FIRST),
    colRecords: [],
    providerSlices: [
      providerSlice("gbif", "2026-08", [metazoaRecord]),
      providerSlice("inaturalist", "2026-08", [recordWithoutKingdom]),
    ],
    projectTaxa: [sciurusProject()],
    now: () => FIRST,
  });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });

  const active = readMasterRows(root);
  assert.equal(active.taxa.length, 1);
  assert.equal(active.taxa[0].kingdom, "Animalia");
  assert.equal(active.projects.length, 1);
  assert.equal(active.projects[0].project_slug, "sciurusvulgaris");

  const database = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
  try {
    const providerLinks = database.prepare(`
      SELECT release.provider, assertion.provider_record_id, assertion.master_taxon_id
      FROM provider_taxon_assertion AS assertion
      JOIN provider_release AS release ON release.release_id = assertion.release_id
      ORDER BY release.provider
    `).all();
    assert.equal(providerLinks.length, 2);
    assert.equal(new Set(providerLinks.map((entry) => entry.master_taxon_id)).size, 1);
  } finally {
    database.close();
  }

  const store = await openTaxonomyMasterStore({ taxonomyRoot: root });
  try {
    const result = store.findTaxonByScientificName("Sciurus vulgaris", {
      rank: "species",
      kingdom: "Animalia",
    });
    assert.equal(result?.acceptedScientificName, "Sciurus vulgaris");
    const detail = store.taxon(result?.masterTaxonId);
    assert.equal(detail?.projectLinks?.[0]?.project_slug, "sciurusvulgaris");
  } finally {
    store.close();
  }
});

test("9.11 erhält bekannte Synonyme auch nach einem späteren Quellenstand", async (t) => {
  const root = await createRoot(t);
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", FIRST),
    colRecords: [sciurusColRecord({ withSynonym: true })],
    projectTaxa: [sciurusProject()],
    now: () => FIRST,
  });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-09", SECOND),
    colRecords: [sciurusColRecord()],
    projectTaxa: [sciurusProject()],
    now: () => SECOND,
  });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => SECOND });
  const active = readMasterRows(root);
  assert.equal(active.aliases.some((entry) => entry.name === "Sciurus europaeus"), true);

  const store = await openTaxonomyMasterStore({ taxonomyRoot: root });
  try {
    const result = store.search({ query: "Sciurus europaeus", kingdom: "Animalia" });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].acceptedScientificName, "Sciurus vulgaris");
    assert.equal(result.results[0].synonym.scientificName, "Sciurus europaeus");
  } finally {
    store.close();
  }
});

test("9.11 fuehrt doppelte normalisierte Anbieternamen idempotent zusammen", async (t) => {
  const root = await createRoot(t);
  const source = sciurusExternal("wikidata", "Q179451");
  source.names = [{
    name: "Eurasisches Eichhoernchen",
    language: "de",
    nameKind: "vernacular",
    preferred: false,
    verified: false,
  }, {
    name: "  Eurasisches   Eichhoernchen  ",
    language: "DE",
    nameKind: "vernacular",
    preferred: true,
    verified: true,
  }];
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", FIRST),
    colRecords: [],
    providerSlices: [providerSlice("wikidata", "2026-08", [source])],
    projectTaxa: [sciurusProject()],
    now: () => FIRST,
  });
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
  try {
    const names = database.prepare(`
      SELECT name, language, preferred, verified
      FROM provider_name_assertion
      WHERE language = 'de'
    `).all();
    assert.equal(names.length, 1);
    assert.equal(names[0].name, "Eurasisches Eichhoernchen");
    assert.equal(names[0].preferred, 1);
    assert.equal(names[0].verified, 1);
  } finally {
    database.close();
  }
});

test("9.11 fuehrt doppelte Anbieter-IDs innerhalb eines Releases verlustfrei zusammen", async (t) => {
  const root = await createRoot(t);
  const first = sciurusExternal("gbif", "5219668");
  first.hierarchy = {
    kingdom: "Animalia",
    phylum: "Chordata",
    class: "Mammalia",
  };
  first.names = [{
    name: "Eurasian Red Squirrel",
    language: "en",
    nameKind: "vernacular",
    preferred: true,
    verified: true,
  }];
  first.relevanceReasons = ["project-species"];
  first.versionChangeState = "unchanged";

  const second = sciurusExternal("gbif", "5219668");
  second.hierarchy = {
    order: "Rodentia",
    family: "Sciuridae",
    genus: "Sciurus",
    species: "Sciurus vulgaris",
  };
  second.names = [{
    name: "Red Squirrel",
    language: "en",
    nameKind: "vernacular",
    preferred: false,
    verified: true,
  }];
  second.relevanceReasons = ["col-reference-gap", "missing-hierarchy"];
  second.versionChangeState = "changed";

  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", FIRST),
    colRecords: [],
    providerSlices: [providerSlice("gbif", "2026-08", [first, second])],
    projectTaxa: [sciurusProject()],
    now: () => FIRST,
  });

  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
  try {
    const assertions = database.prepare(`
      SELECT provider_record_id, hierarchy_json, version_change_state
      FROM provider_taxon_assertion
      WHERE provider_record_id = '5219668'
    `).all();
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0].version_change_state, "changed");
    assert.deepEqual(JSON.parse(assertions[0].hierarchy_json), {
      kingdom: "Animalia",
      phylum: "Chordata",
      class: "Mammalia",
      order: "Rodentia",
      family: "Sciuridae",
      genus: "Sciurus",
      species: "Sciurus vulgaris",
    });
    const assertionId = database.prepare(`
      SELECT assertion_id
      FROM provider_taxon_assertion
      WHERE provider_record_id = '5219668'
    `).get().assertion_id;
    const reasons = database.prepare(`
      SELECT relevance_reason
      FROM provider_slice_membership
      WHERE provider_taxon_assertion_id = ?
      ORDER BY relevance_reason
    `).all(assertionId).map((entry) => entry.relevance_reason);
    assert.deepEqual(reasons, ["col-reference-gap", "missing-hierarchy", "project-species"]);
    const names = database.prepare(`
      SELECT name
      FROM provider_name_assertion
      WHERE provider_taxon_assertion_id = ?
        AND name_kind = 'vernacular'
      ORDER BY name
    `).all(assertionId).map((entry) => entry.name);
    assert.deepEqual(names, ["Eurasian Red Squirrel", "Red Squirrel"]);
  } finally {
    database.close();
  }
});

test("9.11 lehnt widerspruechliche Taxa unter derselben Anbieter-ID ab", async (t) => {
  const root = await createRoot(t);
  const first = sciurusExternal("gbif", "5219668");
  const second = {
    ...sciurusExternal("gbif", "5219668"),
    scientificName: "Sciurus carolinensis",
  };
  await assert.rejects(
    buildTaxonomyMasterCandidate({
      taxonomyRoot: root,
      colRelease: colRelease("2026-08", FIRST),
      colRecords: [],
      providerSlices: [providerSlice("gbif", "2026-08", [first, second])],
      projectTaxa: [sciurusProject()],
      now: () => FIRST,
    }),
    /verweist innerhalb eines Releases auf mehrere Taxa/,
  );
});
