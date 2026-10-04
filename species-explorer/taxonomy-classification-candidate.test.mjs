import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { buildTaxonomyMasterCandidate, inspectTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate, decideTaxonomyMasterConflict, inspectTaxonomyMasterLifecycle } from "./taxonomy-master-lifecycle.mjs";
import { prepareTaxonomyPublication } from "./taxonomy-publication.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";

const FIRST = new Date("2026-09-01T00:00:00Z"), SECOND = new Date("2026-10-02T00:00:00Z");
const scientificName = "Testus classificatus";
const external = { providerRecordId: "101", scientificName, rank: "species", kingdom: "Bacteria",
  hierarchy: { kingdom: "Bacteria" }, relevanceReasons: ["col-reference-gap"] };
const providerSlices = [{ manifest: { provider: "inaturalist", providerVersion: "fixture-1", retrievedAt: FIRST.toISOString() }, records: [external] }];
const projectTaxa = [{ projectTaxonKey: "fixture", projectSlug: "fixture", scientificName, kingdom: "Bacteria", germanName: "Eigener Projektname" }];
const corrections = [{ scientificName, kingdom: "Bacteria", germanName: "Bevorzugter eigener Name" }];
const release = (version, date) => ({ releaseId: version, providerVersion: version, importedAt: date.toISOString() });
const fingerprint = async (filename) => crypto.createHash("sha256").update(await fs.readFile(filename)).digest("hex");
async function baseline(t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "fn-classification-candidate-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(directory, "taxonomy"), searchRoot = path.join(directory, "lightroom");
  await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-fixture-old", FIRST), colRecords: [],
    providerSlices, projectTaxa, corrections, now: () => FIRST });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
  return { root, searchRoot };
}
async function candidate(root, identifiers, extra = {}) {
  const record = { providerRecordId: "col-fixture-1", scientificName, rank: "species", kingdom: "Bacillati",
    hierarchy: { kingdom: "Bacillati" }, identifiers: identifiers.map((identifier) => ({ identifier_type: "inat", identifier })) };
  return buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-fixture-next", SECOND),
    colRecords: [record], providerSlices, projectTaxa, corrections, now: () => SECOND, ...extra });
}
function readRows(root, slot) {
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root, slot), { readOnly: true });
  try { return { taxa: db.prepare("SELECT * FROM master_taxon ORDER BY master_taxon_id").all(),
    links: db.prepare("SELECT master_taxon_id, project_taxon_key, project_slug FROM project_taxon_link").all(),
    ownNames: db.prepare("SELECT master_taxon_id, field_value, origin_kind FROM master_field_assertion WHERE field_name='german-name' AND selected=1").all() }; }
  finally { db.close(); }
}

test("regulärer Kandidat hält alle vier Reichs-/Quellenfälle gesperrt und bewahrt ursprüngliche IDs und eigene Namen", async (t) => {
  for (const [ids, expected] of [ [["inat:101"], "matchingProviderId"], [["inat:202"], "differentProviderId"],
    [["inat:101", "inat:202"], "ambiguousProviderId"], [[], "missingProviderId"] ]) {
    await t.test(expected, async (subtest) => {
      const { root } = await baseline(subtest), before = readRows(root, "active");
      const activeHash = await fingerprint(taxonomyMasterDatabasePath(root, "active"));
      const manifestHash = await fingerprint(taxonomyMasterManifestPath(root, "active"));
      const built = await candidate(root, ids);
      assert.equal(built.classificationReview.total, 1);
      assert.equal(built.classificationReview[expected], 1);
      const after = readRows(root, "staging"), lifecycle = await inspectTaxonomyMasterLifecycle(root, { lightweight: true });
      assert.equal(after.taxa.length, 2);
      assert.ok(after.taxa.some((row) => row.master_taxon_id === before.taxa[0].master_taxon_id));
      assert.deepEqual(after.links, before.links);
      assert.deepEqual(after.ownNames, before.ownNames);
      assert.equal(lifecycle.canActivate, false);
      assert.equal(lifecycle.blockingConflictCount, 1);
      const conflict = lifecycle.blockingConflicts[0];
      assert.match(conflict.conflict_id, /^classification_[a-f0-9]{64}$/);
      assert.deepEqual(JSON.parse(conflict.resolution_note).providerLinks.ids, [...new Set(ids.map((id) => id.replace("inat:", "")))].sort());
      for (const decision of ["keep-current", "accept-candidate", "add-alias", "protect-manual"]) {
        await assert.rejects(decideTaxonomyMasterConflict(root, { conflictId: conflict.conflict_id, decision }), /bestätigte Identitätsprüfung/);
      }
      await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /vor der Aktivierung/);
      assert.equal(await fingerprint(taxonomyMasterDatabasePath(root, "active")), activeHash);
      assert.equal(await fingerprint(taxonomyMasterManifestPath(root, "active")), manifestHash);
      const retry = await candidate(root, ids);
      assert.equal(retry.classificationReview.revision, built.classificationReview.revision);
      assert.equal((await inspectTaxonomyMasterLifecycle(root)).blockingConflictCount, 1);
    });
  }
});

test("gemeinsame Master-/Lightroom-Vorbereitung stoppt vor Paketbau und Veröffentlichung", async (t) => {
  const { root, searchRoot } = await baseline(t);
  await candidate(root, ["inat:101"]);
  let packageBuilds = 0;
  const activeHash = await fingerprint(taxonomyMasterDatabasePath(root, "active"));
  await assert.rejects(prepareTaxonomyPublication({ taxonomyRoot: root, searchRoot,
    id: `publication-${crypto.randomUUID()}`, checkSpace: async () => {},
    buildPackage: async () => { packageBuilds += 1; } }), /widersprüchliche Änderungen/);
  assert.equal(packageBuilds, 0);
  assert.equal(await fingerprint(taxonomyMasterDatabasePath(root, "active")), activeHash);
  await assert.rejects(fs.stat(path.join(root, "publication.json")), { code: "ENOENT" });
});

test("gleiches Reich schließt Referenzlücke weiterhin ohne Klassifikationssperre", async (t) => {
  const { root } = await baseline(t);
  const manifest = await candidate(root, ["inat:101"], { colRecords: [{ providerRecordId: "col-1", scientificName,
    rank: "species", kingdom: "Bacteria", hierarchy: { kingdom: "Bacteria" } }] });
  assert.equal(manifest.classificationReview.total, 0);
  assert.equal((await inspectTaxonomyMasterLifecycle(root)).canActivate, true);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  assert.equal(readRows(root, "active").taxa.length, 1);
});

test("mehrfache Teilzeilen desselben CoL-Datensatzes erhalten beide Anbieter-Verweise", async (t) => {
  const { root } = await baseline(t);
  const manifest = await candidate(root, [], { colRecords: ["inat:101", "inat:202"].map((identifier) => ({
    providerRecordId: "col-fixture-1", scientificName, kingdom: "Bacillati", rank: "species",
    identifiers: [{ identifier_type: "inat", identifier }],
  })) });
  assert.equal(manifest.classificationReview.ambiguousProviderId, 1);
});

test("veränderte Übersicht oder ausgeräumte Konfliktzeile kann die gebündelte Sperre nicht umgehen", async (t) => {
  const { root } = await baseline(t);
  await candidate(root, ["inat:101"]);
  const filename = taxonomyMasterManifestPath(root, "staging"), original = await fs.readFile(filename, "utf8");
  const manifest = JSON.parse(original);
  manifest.classificationReview.matchingProviderId = 0;
  manifest.classificationReview.differentProviderId = 1;
  await fs.writeFile(filename, JSON.stringify(manifest));
  await assert.rejects(inspectTaxonomyMasterCandidate(root, { validate: false }), /passt nicht/);
  await fs.writeFile(filename, original);
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"));
  try { db.exec("UPDATE master_conflict SET conflict_state='resolved-keep' WHERE conflict_id GLOB 'classification_*'"); }
  finally { db.close(); }
  await assert.rejects(inspectTaxonomyMasterLifecycle(root, { lightweight: true }), /passt nicht/);
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /passt nicht/);
});

test("mehr als 100 Klassifikationsfälle bleiben trotz kompakter Statusliste vollständig gesperrt", async (t) => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "fn-classification-limit-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(directory, "taxonomy");
  const records = Array.from({ length: 105 }, (_, index) => ({ ...external,
    providerRecordId: String(index + 1), scientificName: `Testus classificatus${String.fromCharCode(97 + Math.floor(index / 26), 97 + index % 26)}` }));
  const slices = [{ ...providerSlices[0], records }];
  await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-old", FIRST), colRecords: [],
    providerSlices: slices, now: () => FIRST });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await candidate(root, [], { projectTaxa: [], corrections: [], providerSlices: slices,
    colRecords: records.map((record) => ({ ...record, providerRecordId: `col-${record.providerRecordId}`, kingdom: "Bacillati",
      hierarchy: { kingdom: "Bacillati" }, identifiers: [{ identifier_type: "inat", identifier: `inat:${record.providerRecordId}` }] })) });
  const status = await inspectTaxonomyMasterLifecycle(root, { lightweight: true });
  assert.equal(status.blockingConflicts.length, 100);
  assert.equal(status.blockingConflictCount, 105);
  assert.equal(status.candidate.classificationReview.total, 105);
  assert.equal(status.candidate.classificationReview.matchingProviderId, 105);
  assert.equal(status.canActivate, false);
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /105 widersprüchliche/);
});
