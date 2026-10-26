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
import { createIdentityReviewService, readIdentityReview } from "./taxonomy-identity-review.mjs";
import { createTaxonomyMasterService } from "./taxonomy-master-service.mjs";
import { writeProviderSlice } from "./taxonomy-master-slices.mjs";

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

async function classifiedServiceFixture(t, { deferred = false } = {}) {
  const { root } = await baseline(t);
  const built = await candidate(root, deferred ? [] : ["inat:101"]);
  const review = createIdentityReviewService({ taxonomyRoot: root, now: () => SECOND,
    readInputRevision: async () => built.inputRevisions.identityInputs });
  const preview = await review[deferred ? "classificationDeferralPreview" : "classificationPreview"]();
  assert.equal(preview.count, 1);
  await review[deferred ? "classificationDeferralSave" : "classificationSave"]({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  await candidate(root, deferred ? [] : ["inat:101"], { identityRegistry: registry,
    now: () => new Date(SECOND.getTime() + 1000) });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 2000) });
  const before = readRows(root, "active");
  const speciesListPath = path.join(path.dirname(root), "species-list.json"), correctionsPath = path.join(path.dirname(root), "corrections.json");
  await fs.writeFile(speciesListPath, JSON.stringify(projectTaxa.map((entry) => ({ ...entry, slug: entry.projectSlug }))));
  await fs.writeFile(correctionsPath, JSON.stringify({ entries: corrections }));
  await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "fixture-refreshed",
    retrievedAt: new Date(SECOND.getTime() + 3000).toISOString(), records: [external] });
  let currentIdentifiers = deferred ? [] : ["inat:101"], missing = false;
  const searched = [];
  const store = {
    status: () => ({ releaseId: "col-fixture-next", importedAt: SECOND.toISOString(), source: {} }),
    findTaxonByScientificName(name) {
      searched.push(name);
      return !missing && name === scientificName ? { taxonId: "current-col-record" } : null;
    },
    taxon: () => ({ source_id: "col-fixture-1", scientific_name: scientificName, rank: "species",
      kingdom: { scientificName: "Bacillati" },
      identifiers: currentIdentifiers.map((identifier) => ({ identifier_type: "inat", identifier })) }),
  };
  const service = createTaxonomyMasterService({ taxonomyRoot: root, speciesListPath, correctionsPath,
    referenceService: { requireStore: async () => store }, now: () => new Date(SECOND.getTime() + 4000) });
  t.after(() => service.close());
  return { root, before, searched, service,
    setCurrentIdentifiers: (value) => { currentIdentifiers = value; }, setMissing: () => { missing = true; } };
}

test("Explorer-Folgeaufbau liest bestätigte Klassifikation bei gleicher CoL-Version erneut und erhält ID, eigene Namen und Projektlinks", async (t) => {
  const { root, before, searched, service } = await classifiedServiceFixture(t);
  await service.startBuild({ refreshProviders: false });
  await service.runPromise;
  assert.equal(service.state.status, "ready", service.state.error);
  assert.deepEqual(searched, [scientificName]);
  const after = readRows(root, "staging");
  assert.deepEqual(after.taxa.map((row) => [row.master_taxon_id, row.kingdom]), before.taxa.map((row) => [row.master_taxon_id, row.kingdom]));
  assert.deepEqual(after.links, before.links);
  assert.deepEqual(after.ownNames, before.ownNames);
  assert.deepEqual(readRows(root, "active"), before, "Folgeaufbau aktiviert keinen Kandidaten");
  assert.equal((await inspectTaxonomyMasterCandidate(root)).blockingConflictCount, 0);
});

test("Explorer-Folgeaufbau schützt gespeicherte Klassifikation weiter vor fehlenden, abweichenden oder mehrdeutigen aktuellen Quellenbelegen", async (t) => {
  for (const [label, identifiers] of [["missing-link", []], ["different-link", ["inat:202"]],
    ["ambiguous-link", ["inat:101", "inat:202"]], ["missing-record", null]]) {
    await t.test(label, async (subtest) => {
      const { root, before, searched, service, setCurrentIdentifiers, setMissing } = await classifiedServiceFixture(subtest);
      if (identifiers === null) setMissing(); else setCurrentIdentifiers(identifiers);
      const activeHash = await fingerprint(taxonomyMasterDatabasePath(root, "active"));
      await service.startBuild({ refreshProviders: false });
      await service.runPromise;
      assert.equal(service.state.status, "failed");
      assert.match(service.state.error, /unveränderten, eindeutigen Quellenbeleg/);
      assert.deepEqual(searched, [scientificName], "Der aktuelle Beleg wird tatsächlich geprüft");
      assert.deepEqual(readRows(root, "active"), before);
      assert.equal(await fingerprint(taxonomyMasterDatabasePath(root, "active")), activeHash);
    });
  }
});

test("Explorer-Folgeaufbau prüft historische Zurückstellung bei gleicher CoL-Version und öffnet einen geänderten Quellenfall erneut", async (t) => {
  for (const changed of [false, true]) await t.test(changed ? "changed-current-link" : "unchanged-current-proof", async (subtest) => {
    const { root, before, searched, service, setCurrentIdentifiers } = await classifiedServiceFixture(subtest, { deferred: true });
    if (changed) setCurrentIdentifiers(["inat:101"]);
    await service.startBuild({ refreshProviders: false });
    await service.runPromise;
    assert.equal(service.state.status, "ready", service.state.error);
    const inspected = await inspectTaxonomyMasterCandidate(root);
    assert.equal(inspected.manifest.classificationDeferrals.total, changed ? 0 : 1);
    assert.equal(inspected.blockingConflictCount, changed ? 1 : 0);
    assert.equal(inspected.manifest.classificationReview.matchingProviderId, changed ? 1 : 0);
    assert.deepEqual(searched, [scientificName]);
    assert.deepEqual(readRows(root, "active"), before);
    if (!changed) {
      const after = readRows(root, "staging");
      const taxonIdentity = (row) => [row.master_taxon_id, row.canonical_scientific_name, row.rank, row.kingdom,
        row.lifecycle_state, row.reference_state];
      assert.deepEqual(after.taxa.map(taxonIdentity), before.taxa.map(taxonIdentity));
      assert.deepEqual(after.links, before.links);
      assert.deepEqual(after.ownNames, before.ownNames);
    }
  });
});

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
