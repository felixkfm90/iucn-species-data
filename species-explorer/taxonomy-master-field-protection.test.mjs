import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate, inspectTaxonomyMasterLifecycle } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { protectedMasterIdsRevision } from "./taxonomy-master-inputs.mjs";
import { coverMasterInputSelection } from "./taxonomy-master-inputs.mjs";

const date = (day) => new Date(`2026-09-${String(day).padStart(2, "0")}T08:00:00.000Z`);
const record = (extra = {}) => ({ providerRecordId: "col-leopard", scientificName: "Panthera pardus",
  rank: "species", kingdom: "Animalia", hierarchy: { kingdom: "Animalia", phylum: "Chordata",
    class: "Mammalia", order: "Carnivora", family: "Felidae", genus: "Panthera", species: "Panthera pardus" },
  germanNames: [{ name: "Leopard", preferred: true }], englishNames: [{ name: "Leopard", preferred: true }], ...extra });
const project = { projectTaxonKey: "leopard", projectSlug: "leopard", scientificName: "Panthera pardus", kingdom: "Animalia" };
const ownName = { scientificName: "Panthera pardus", kingdom: "Animalia", germanName: "Mein Leopard" };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "fn-master-field-protection-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function build(root, day, extra = {}) {
  return buildTaxonomyMasterCandidate({ taxonomyRoot: root,
    colRelease: { providerVersion: `COL-${day}`, importedAt: date(day).toISOString(), recordCount: 1 },
    colRecords: [record()], now: () => date(day), ...extra });
}
function read(root, slot = "staging") {
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root, slot), { readOnly: true });
  try {
    return { id: db.prepare("SELECT master_taxon_id FROM master_taxon").get().master_taxon_id,
      fields: Object.fromEntries(db.prepare("SELECT field_name,field_value FROM master_field_assertion WHERE selected=1").all()
        .map((row) => [row.field_name, row.field_value])),
      conflicts: db.prepare("SELECT field_name,conflict_type FROM master_conflict WHERE conflict_state='open'").all()
        .map((row) => ({ ...row })),
      projects: db.prepare("SELECT project_slug FROM project_taxon_link").all().map((row) => row.project_slug) };
  } finally { db.close(); }
}
for (const protection of ["project", "stored-project", "manual", "stored-manual", "decision", "lightroom"]) {
  test(`geänderte ausgewählte Quellen-Namen und Hierarchie bleiben geschützt: ${protection}`, async (t) => {
    const root = await fixture(t);
    await build(root, 1, { projectTaxa: ["project", "stored-project"].includes(protection) ? [project] : [],
      corrections: ["manual", "stored-manual"].includes(protection) ? [ownName] : [] });
    await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => date(1) });
    const before = read(root, "active");
    if (protection === "decision") {
      const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "active"));
      try {
        db.prepare(`INSERT INTO master_decision (decision_id, master_taxon_id, field_name, language,
          decision_type, selected_assertion_id, decided_at)
          SELECT 'own-source-choice',master_taxon_id,field_name,language,'keep-current',assertion_id,?
          FROM master_field_assertion WHERE selected=1 AND field_name='german-name'`).run(date(1).toISOString());
      } finally { db.close(); }
    }
    const manifest = await build(root, 2, { colRecords: [record({ hierarchy: { ...record().hierarchy, family: "Pantheridae" },
      ...(protection === "stored-manual" ? { germanNames: [{ name: ownName.germanName }] } : {}),
      englishNames: [{ name: "New provider English", preferred: true }] })],
      projectTaxa: protection === "project" ? [project] : [],
      corrections: protection === "manual" ? [ownName] : [],
      protectedMasterIds: protection === "lightroom" ? [before.id] : [] });
    const candidate = read(root);
    assert.equal(candidate.id, before.id);
    assert.equal(candidate.fields.family, "Felidae");
    assert.equal(candidate.fields["english-name"], "Leopard");
    assert.equal(candidate.fields["german-name"], before.fields["german-name"]);
    assert.deepEqual(candidate.conflicts.sort((a, b) => a.field_name.localeCompare(b.field_name)), [
      { field_name: "english-name", conflict_type: "changed-value" },
      { field_name: "family", conflict_type: "changed-value" }]);
    const lifecycle = await inspectTaxonomyMasterLifecycle(root);
    assert.equal(lifecycle.canActivate, false);
    await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => date(2) }), /entschieden werden/);
    assert.deepEqual(read(root, "active").fields, before.fields);
    assert.equal(manifest.inputRevisions.protectedMasterIds,
      protectedMasterIdsRevision(protection === "lightroom" ? [before.id] : []));
  });
}

test("unbenutzte reine Quellenart folgt weiter der aktuellen Priorität", async (t) => {
  const root = await fixture(t);
  await build(root, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await build(root, 2, { colRecords: [record({ hierarchy: { ...record().hierarchy, family: "Pantheridae" },
    germanNames: [{ name: "Panther" }], englishNames: [{ name: "New English" }] })] });
  const candidate = read(root);
  assert.equal(candidate.fields.family, "Pantheridae");
  assert.equal(candidate.fields["german-name"], "Panther");
  assert.equal(candidate.fields["english-name"], "New English");
  assert.deepEqual(candidate.conflicts, []);
  assert.equal((await inspectTaxonomyMasterLifecycle(root)).canActivate, true);
});

test("unveränderte fachliche Werte erzeugen bei geschützter Art trotz neuer Herkunft keinen Konflikt", async (t) => {
  const root = await fixture(t);
  await build(root, 1, { projectTaxa: [project], corrections: [ownName] });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const id = read(root, "active").id;
  await build(root, 2, { protectedMasterIds: [id], projectTaxa: [project], corrections: [ownName],
    colRecords: [record({ retrievedAt: date(2).toISOString(), payloadSha256: "b".repeat(64),
      englishNames: [{ name: "  Leopard  " }], hierarchy: { ...record().hierarchy, family: "  Felidae  " } })] });
  assert.deepEqual(read(root).conflicts, []);
  assert.equal((await inspectTaxonomyMasterLifecycle(root)).canActivate, true);
});

test("nur tatsächliche ausgewählte Werte zählen, nicht eine nachrangige alternative Quellenangabe", async (t) => {
  const root = await fixture(t);
  const slices = (day) => [{ manifest: { provider: "gbif", providerVersion: `GBIF-${day}`, retrievedAt: date(day).toISOString() },
    records: [{ providerRecordId: "gbif-leopard", scientificName: "Panthera pardus", rank: "species", kingdom: "Animalia",
      hierarchy: { family: day === 1 ? "Other old family" : "Other new family" },
      names: [{ name: day === 1 ? "Other old name" : "Other new name", language: "en", nameKind: "vernacular" }] }] }];
  await build(root, 1, { providerSlices: slices(1) });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await build(root, 2, { providerSlices: slices(2), protectedMasterIds: [read(root, "active").id] });
  assert.deepEqual(read(root).conflicts, []);
  assert.equal(read(root).fields.family, "Felidae");
  assert.equal(read(root).fields["english-name"], "Leopard");
});

test("eine neu ausdrücklich getroffene eigene Namenswahl wird nicht nochmals angefragt", async (t) => {
  const root = await fixture(t);
  await build(root, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await build(root, 2, { protectedMasterIds: [read(root, "active").id], corrections: [ownName], projectTaxa: [project] });
  assert.equal(read(root).fields["german-name"], "Mein Leopard");
  assert.deepEqual(read(root).conflicts, []);
});

test("Suchnormalisierung darf eine echte Namensschreibweisenänderung nicht verstecken", async (t) => {
  const root = await fixture(t);
  await build(root, 1, { colRecords: [record({ germanNames: [{ name: "Leopard-Name" }] })] });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await build(root, 2, { protectedMasterIds: [read(root, "active").id],
    colRecords: [record({ germanNames: [{ name: "Leopard Name" }] })] });
  assert.equal(read(root).fields["german-name"], "Leopard-Name");
  assert.deepEqual(read(root).conflicts, [{ field_name: "german-name", conflict_type: "changed-value" }]);
});

test("ungültige Schutzlisten werden vor jedem Kandidatenbau zurückgewiesen", async (t) => {
  const root = await fixture(t);
  for (const protectedMasterIds of [null, {}, "mtx_id", ["mtx_id"], [1], [" mtx_" + "a".repeat(32)]]) {
    await assert.rejects(build(root, 1, { protectedMasterIds }), /geschützte Master-IDs/);
  }
  await assert.rejects(fs.stat(path.join(root, "master")), { code: "ENOENT" });
});

test("echte eigene Quellenfeldentscheidung behält belegten Taxonschutz nach unverändertem Zwischenaufbau", async (t) => {
  const root = await fixture(t);
  const verifiedBuild = async (day, rows = [record()], extra = {}) => {
    const colRelease = { providerVersion: `COL-${day}`, importedAt: date(day).toISOString(), recordCount: rows.length };
    const inputs = coverMasterInputSelection({ colRelease, colRecords: rows, targetNames: ["Panthera pardus"], providerSlices: [] });
    return buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease, colRecords: inputs.records(),
      buildInputCoverage: inputs.coverage, now: () => date(day), ...extra });
  };
  await verifiedBuild(1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const original = read(root, "active");
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "active"));
  try {
    db.prepare(`INSERT INTO master_decision (decision_id, master_taxon_id, field_name, language,
      decision_type, selected_assertion_id, decided_at)
      SELECT 'own-source-choice',master_taxon_id,field_name,language,'keep-current',assertion_id,?
      FROM master_field_assertion WHERE selected=1 AND field_name='german-name'`).run(date(1).toISOString());
  } finally { db.close(); }
  const intermediate = await verifiedBuild(2);
  assert.deepEqual(read(root).conflicts, []);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const own = new DatabaseSync(taxonomyMasterDatabasePath(root, "active"), { readOnly: true });
  let marker;
  try {
    marker = JSON.parse(own.prepare("SELECT status_detail FROM master_taxon_status WHERE status_name='manually-protected'").get().status_detail);
    assert.equal(own.prepare("SELECT COUNT(*) AS n FROM master_decision").get().n, 0, "keine Entscheidung neu erfunden");
    assert.equal(own.prepare("SELECT COUNT(*) AS n FROM master_field_assertion WHERE origin_kind='manual'").get().n, 0,
      "kein Anbieterwert manuell umgeschrieben");
  } finally { own.close(); }
  assert.equal(marker.kind, "own-field-decision-protection");
  assert.equal(marker.decisions[0].decisionId, "own-source-choice");
  assert.equal(marker.decisions[0].selectedValue, "Leopard");
  const same = await verifiedBuild(3);
  assert.equal(same.buildInputs.reuse.reusedTaxa, 0);
  assert.equal(same.buildInputs.comparison.dependencyPlan.statefulTaxa, 1);
  assert.deepEqual(read(root).conflicts, []);
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await verifiedBuild(4, [record({ hierarchy: { ...record().hierarchy, family: "Pantheridae" } })]);
  assert.equal(read(root).id, original.id);
  assert.equal(read(root).fields.family, "Felidae");
  assert.deepEqual(read(root).conflicts, [{ field_name: "family", conflict_type: "changed-value" }]);
  assert.notEqual(marker.decisions[0].sourceMasterVersion, intermediate.candidateId,
    "Marker verweist auf den tatsächlichen Ursprung, nicht auf einen neu gestempelten Nachweis");
});
