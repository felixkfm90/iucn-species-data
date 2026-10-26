import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { buildTaxonomyMasterCandidate, inspectTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { appendClassificationBatch, readIdentityRegistry, identityRegistryRevision, validateIdentityRegistry, writeIdentityRegistry, emptyIdentityRegistry, previewIdentityDecision, confirmIdentityDecision } from "./taxonomy-identity-registry.mjs";
import { canonicalBuildInput } from "./taxonomy-build-inputs.mjs";
import { CLASSIFICATION_RETENTION_POLICY, CLASSIFICATION_RETENTION_KIND, classificationRetentionMarker,
  classificationRetentionForTaxon, assertClassificationRetentions, finalizeClassificationRetentionRegistry, summarizeClassificationRetentions } from "./taxonomy-classification-retention.mjs";

const FIRST = new Date("2026-01-01T00:00:00Z"), SECOND = new Date("2026-01-02T00:00:00Z"), THIRD = new Date("2026-01-03T00:00:00Z");
const release = (version, now) => ({ releaseId: version, providerVersion: version, importedAt: now.toISOString() });
const scientificName = "Testus retentus";
const external = { providerRecordId: "101", scientificName, rank: "species", kingdom: "Bacteria",
  hierarchy: { kingdom: "Bacteria", genus: "Testus", species: scientificName }, relevanceReasons: ["col-reference-gap"],
  names: [{ name: "Quellenname", language: "de", nameKind: "vernacular" }] };
const providerSlices = [{ manifest: { provider: "inaturalist", providerVersion: "fixture-inat", retrievedAt: FIRST.toISOString() }, records: [external] }];
const col = (ids = ["inat:101"], kingdom = "Bacillati") => ({ providerRecordId: "col-101", scientificName, rank: "species", kingdom,
  hierarchy: { kingdom, genus: "Testus", species: scientificName }, identifiers: ids.map((identifier) => ({ type: "inat", identifier })) });
const policy = { policy: CLASSIFICATION_RETENTION_POLICY, usageRevision: "a".repeat(64) };
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const plain = (value) => JSON.parse(JSON.stringify(value));
function open(root, slot = "active", readOnly = true) { return new DatabaseSync(taxonomyMasterDatabasePath(root, slot), { readOnly }); }
function read(root, slot, operation) { const db = open(root, slot); try { return operation(db); } finally { db.close(); } }

async function fixture(t, { ownClassification = false, fixtureProviderSlices = providerSlices } = {}) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "retention-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(directory, "taxonomy");
  await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-seed", FIRST), colRecords: [], providerSlices: fixtureProviderSlices, now: () => FIRST });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
  const candidate = await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-classified", SECOND),
    colRecords: [col()], providerSlices: fixtureProviderSlices, now: () => SECOND });
  const beforeRegistry = read(root, "active", readIdentityRegistry);
  const proof = read(root, "staging", (db) => JSON.parse(db.prepare("SELECT resolution_note FROM master_conflict WHERE conflict_id GLOB 'classification_*'").get().resolution_note));
  const registry = appendClassificationBatch({ registry: beforeRegistry, cases: [proof], batchRevision: "b".repeat(64),
    sourceRevision: candidate.inputRevisions.identitySources, inputRevision: candidate.inputRevisions.identityInputs,
    confirmedAt: SECOND.toISOString(), ...(ownClassification ? {} : { automation: { policy: "unused-classifications-v1", usageRevision: policy.usageRevision } }) });
  await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-classified", SECOND), colRecords: [col()], providerSlices: fixtureProviderSlices,
    identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 1000) });
  const id = registry.events.at(-1).targets[0].masterTaxonId;
  const activeBytes = await fs.readFile(taxonomyMasterDatabasePath(root));
  const activeManifest = JSON.parse(await fs.readFile(taxonomyMasterManifestPath(root)));
  return { root, id, registry, activeBytes, activeManifest,
    build: (extra = {}) => buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-current", THIRD),
      colRecords: [], providerSlices: fixtureProviderSlices, classificationRetention: policy, now: () => THIRD, ...extra }) };
}

test("ungeklärte automatische Altklassifikation erhält ausschließlich dieselbe ID und Quellenherkunft als gesperrten Bestand", async (t) => {
  const f = await fixture(t), registryBefore = canonicalBuildInput(f.registry);
  const beforeFields = read(f.root, "active", (db) => plain(db.prepare("SELECT field_name,field_value,language,origin_kind,created_at,updated_at FROM master_field_assertion ORDER BY field_name,field_value").all()));
  const result = await f.build();
  assert.equal(result.classificationRetentions.total, 1);
  assert.deepEqual(result.classificationRetentions.retainedMasterTaxonIds, [f.id]);
  assert.equal(result.classificationRetentions.registryRevision, identityRegistryRevision(f.registry));
  assert.equal(result.classificationRetentions.usageRevision, policy.usageRevision);
  read(f.root, "staging", (db) => {
    assert.equal(canonicalBuildInput(readIdentityRegistry(db)), registryBefore);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM master_taxon").get().n, 1);
    const row = db.prepare("SELECT * FROM master_taxon WHERE master_taxon_id=?").get(f.id);
    assert.equal(row.kingdom, "Bacillati"); assert.equal(row.lifecycle_state, "stale"); assert.equal(row.reference_state, "reference-gap");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM master_decision").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM provider_taxon_assertion WHERE match_state!='stale' OR version_change_state!='removed'").get().n, 0);
    assert.deepEqual(plain(db.prepare("SELECT field_name,field_value,language,origin_kind,created_at,updated_at FROM master_field_assertion ORDER BY field_name,field_value").all()), beforeFields);
    assertClassificationRetentions(db, result.classificationRetentions);
    const marker = classificationRetentionMarker(db.prepare("SELECT status_detail FROM master_taxon_status WHERE master_taxon_id=? AND status_name='stale'").get(f.id).status_detail);
    assert.equal(marker.masterTaxonId, f.id); assert.equal(marker.currentCase.category, "missing-provider-id");
    assert.equal(marker.currentCase.target.colRecords.length, 0);
    assert.equal(marker.historicalCase.category, "matching-provider-id");
    assert.equal(marker.currentCase.colVersion, "col-current");
  });
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(f.root)), f.activeBytes);
  const repeat = await f.build();
  assert.deepEqual(repeat.classificationRetentions, result.classificationRetentions);
  assert.equal((await inspectTaxonomyMasterCandidate(f.root)).blockingConflictCount, 0);
});

test("ohne Retentionsregel bleibt der bisherige strenge Stopp unverändert", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.build({ classificationRetention: undefined }), /unveränderten, eindeutigen Quellenbeleg/);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(f.root)), f.activeBytes);
});

test("weiterhin passende Altklassifikation benötigt keine Retentionsregel oder neue FN-Bindung", async (t) => {
  const f = await fixture(t);
  const result = await f.build({ classificationRetention: undefined, colRecords: [col()] });
  assert.equal(result.classificationRetentions, undefined);
  read(f.root, "staging", (db) => {
    const row = db.prepare("SELECT * FROM master_taxon WHERE master_taxon_id=?").get(f.id);
    assert.equal(row.lifecycle_state, "active"); assert.equal(row.kingdom, "Bacillati");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM master_taxon_status WHERE status_name='stale'").get().n, 0);
    assert.equal(canonicalBuildInput(readIdentityRegistry(db)), canonicalBuildInput(f.registry));
  });
});

test("bereits zurückbehaltener Bestand bleibt beim nächsten ungeklärten Quellenstand identisch erhalten und kann bei echtem Matching wieder aktiv werden", async (t) => {
  const f = await fixture(t), first = await f.build();
  // Isolated previous-state fixture; publication and its live FN guard have separate tests.
  await fs.copyFile(taxonomyMasterDatabasePath(f.root, "staging"), taxonomyMasterDatabasePath(f.root));
  await fs.copyFile(taxonomyMasterManifestPath(f.root, "staging"), taxonomyMasterManifestPath(f.root));
  const second = await f.build({ colRelease: release("col-next", THIRD) });
  assert.deepEqual(second.classificationRetentions.retainedMasterTaxonIds, first.classificationRetentions.retainedMasterTaxonIds);
  read(f.root, "staging", (db) => assertClassificationRetentions(db, second.classificationRetentions));
  const matching = await f.build({ classificationRetention: undefined, colRecords: [col()] });
  assert.equal(matching.classificationRetentions, undefined);
  read(f.root, "staging", (db) => {
    assert.equal(db.prepare("SELECT lifecycle_state FROM master_taxon WHERE master_taxon_id=?").get(f.id).lifecycle_state, "active");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM master_taxon_status WHERE status_name='stale'").get().n, 0);
    assert.equal(canonicalBuildInput(readIdentityRegistry(db)), canonicalBuildInput(f.registry));
  });
});

test("fehlende, abweichende und mehrdeutige aktuelle Quellen bleiben ohne gebundene Regel gesperrt", async (t) => {
  const f = await fixture(t);
  for (const colRecords of [[], [col(["inat:202"])], [col(["inat:101", "inat:202"])]]) {
    await assert.rejects(f.build({ classificationRetention: undefined, colRecords }), /unveränderten, eindeutigen Quellenbeleg/);
  }
  for (const classificationRetention of [{ ...policy, policy: "other" }, { ...policy, usageRevision: "bad" }]) {
    await assert.rejects(f.build({ classificationRetention }), (error) => error.code === "CLASSIFICATION_RETENTION_INVALID");
  }
});

for (const category of ["different", "ambiguous"]) test(`heutiger ${category}-Anbieterbeleg bleibt ungeklärt und wird niemals passend gerechnet`, async (t) => {
  const f = await fixture(t);
  const result = await f.build({ colRecords: [col(category === "different" ? ["inat:202"] : ["inat:101", "inat:202"])] });
  read(f.root, "staging", (db) => {
    const marker = classificationRetentionMarker(db.prepare("SELECT status_detail FROM master_taxon_status WHERE status_name='stale'").get().status_detail);
    assert.equal(marker.currentCase.category, `${category}-provider-id`);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM provider_taxon_assertion WHERE match_state='exact'").get().n, 0);
    assertClassificationRetentions(db, result.classificationRetentions);
  });
});

test("widersprechende neue Reichsgruppe mit gleicher Anbieter-ID wird zurückgehalten statt als neue ID wiederzuerstehen", async (t) => {
  const f = await fixture(t);
  const result = await f.build({ colRecords: [col(["inat:101"], "Bacteria")] });
  read(f.root, "staging", (db) => {
    assert.equal(db.prepare("SELECT COUNT(*) n FROM master_taxon").get().n, 1);
    assert.equal(db.prepare("SELECT kingdom FROM master_taxon WHERE master_taxon_id=?").get(f.id).kingdom, "Bacillati");
    assertClassificationRetentions(db, result.classificationRetentions);
  });
});

test("fremdes gleichnamiges Homonym wird nicht durch Retention gelöscht oder auf die Bestands-ID umgebogen", async (t) => {
  const f = await fixture(t);
  const result = await f.build({ colRecords: [{ ...col([], "Animalia"), providerRecordId: "animal-homonym" }] });
  read(f.root, "staging", (db) => {
    const rows = db.prepare("SELECT master_taxon_id,kingdom,lifecycle_state FROM master_taxon ORDER BY kingdom").all();
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.kingdom === "Animalia").lifecycle_state, "active");
    assert.notEqual(rows.find((row) => row.kingdom === "Animalia").master_taxon_id, f.id);
    assertClassificationRetentions(db, result.classificationRetentions);
  });
});

for (const protection of ["fn", "project", "correction", "unselected-manual", "decision", "status", "own-identity"]) {
  test(`Schutz ${protection} sperrt Retention mit konkreter ID und erhält die Bestandsidentität`, async (t) => {
    const f = await fixture(t, { ownClassification: protection === "own-identity" });
    const extra = {};
    if (protection === "fn") extra.protectedMasterIds = [f.id];
    if (protection === "project") extra.projectTaxa = [{ projectTaxonKey: "project", projectSlug: "project", scientificName, kingdom: "Bacillati" }];
    if (protection === "correction") extra.corrections = [{ scientificName, kingdom: "Bacillati", germanName: "Eigene Wahl" }];
    if (["unselected-manual", "decision", "status"].includes(protection)) {
      const db = open(f.root, "active", false);
      try {
        if (protection === "unselected-manual") {
          const releaseId = db.prepare("SELECT release_id FROM provider_release LIMIT 1").get().release_id;
          db.prepare(`INSERT INTO master_field_assertion(master_taxon_id,field_name,field_value,normalized_value,language,origin_kind,release_id,review_state,selected,created_at,updated_at)
            VALUES (?,'german-name','Eigene nicht ausgewählte Wahl','eigene nicht ausgewählte wahl','de','manual',?,'superseded',0,?,?)`).run(f.id, releaseId, FIRST.toISOString(), FIRST.toISOString());
        } else if (protection === "status") db.prepare("INSERT INTO master_taxon_status VALUES (?,'manually-protected',NULL,?)").run(f.id, FIRST.toISOString());
        else db.prepare(`INSERT INTO master_decision(decision_id,master_taxon_id,decision_type,decided_at,note) VALUES ('own',?,'keep-current',?,'Eigene Entscheidung')`).run(f.id, FIRST.toISOString());
      } finally { db.close(); }
    }
    const before = await fs.readFile(taxonomyMasterDatabasePath(f.root));
    await assert.rejects(f.build(extra), (error) => error.code === "CLASSIFICATION_RETENTION_PROTECTED" && error.masterTaxonId === f.id && error.message.includes(f.id));
    assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(f.root)), before);
  });
}

test("fremde oder mehrdeutige Anbieterownership wird nicht durch Namen erraten", async (t) => {
  const f = await fixture(t);
  const changed = [{ manifest: providerSlices[0].manifest, records: [{ ...external, scientificName: "Testus alienus" }] }];
  await assert.rejects(f.build({ providerSlices: changed }), /nicht eindeutig/);
});

test("erhaltene Nachweise und Manifest können nicht durch Zähler, Marker oder Identitätsänderung umgangen werden", async (t) => {
  const f = await fixture(t), result = await f.build();
  const filename = taxonomyMasterDatabasePath(f.root, "staging");
  const original = await fs.readFile(filename);
  for (const action of ["remove-marker", "remove-receipt", "change-identity", "promote-source", "add-own-field", "orphan-in-wrong-status"]) {
    const db = open(f.root, "staging", false);
    try {
      if (action === "remove-marker") db.exec("DELETE FROM master_taxon_status WHERE status_name='stale'");
      if (action === "remove-receipt") db.exec("DELETE FROM master_conflict WHERE conflict_id GLOB 'classification_retention_*'");
      if (action === "change-identity") db.exec("UPDATE master_taxon SET kingdom='Animalia'");
      if (action === "promote-source") db.exec("UPDATE provider_taxon_assertion SET match_state='exact',version_change_state='unchanged'");
      if (action === "add-own-field") db.exec("UPDATE master_field_assertion SET origin_kind='manual',provider_taxon_assertion_id=NULL WHERE field_name='german-name'");
      if (action === "orphan-in-wrong-status") {
        db.exec("DELETE FROM master_conflict WHERE conflict_id GLOB 'classification_retention_*'");
        db.exec("UPDATE master_taxon_status SET status_name='conflicting' WHERE status_name='stale'");
        assert.throws(() => assertClassificationRetentions(db, null), /vollständigen Retentionsbeleg/);
      }
      assert.throws(() => assertClassificationRetentions(db, result.classificationRetentions), undefined, action);
    } finally { db.close(); }
    await fs.writeFile(filename, original);
  }
  read(f.root, "staging", (db) => {
    assert.throws(() => assertClassificationRetentions(db, null), /fehlt/);
    assert.throws(() => assertClassificationRetentions(db, { ...result.classificationRetentions, total: 0 }), /Retentionsübersicht/);
    assert.throws(() => assertClassificationRetentions(db, result.classificationRetentions, { usageRevision: "f".repeat(64) }), /anderen/);
  });
});

test("spezifischer Marker wird streng erkannt; andere alte stale-Details bleiben unverändert", async (t) => {
  const f = await fixture(t); await f.build();
  const marker = read(f.root, "staging", (db) => classificationRetentionMarker(db.prepare("SELECT status_detail FROM master_taxon_status WHERE status_name='stale'").get().status_detail));
  for (const value of [null, "alter Text", "{invalid", JSON.stringify({ kind: "unrelated-old-status" })]) assert.equal(classificationRetentionMarker(value), null);
  assert.throws(() => classificationRetentionMarker({ kind: CLASSIFICATION_RETENTION_KIND }), /beschädigt/);
  for (const value of [`{"kind":"${CLASSIFICATION_RETENTION_KIND}",`, `{"policy":"${CLASSIFICATION_RETENTION_POLICY}",`, { policy: CLASSIFICATION_RETENTION_POLICY }]) {
    assert.throws(() => classificationRetentionMarker(value), (error) => error.code === "CLASSIFICATION_RETENTION_INVALID");
  }
  const taxon = { masterTaxonId: f.id, lifecycleState: "stale", referenceState: "reference-gap", statuses: [{ status: "stale", detail: JSON.stringify(marker) }] };
  assert.deepEqual(classificationRetentionForTaxon(taxon), marker);
  assert.throws(() => classificationRetentionForTaxon({ ...taxon, masterTaxonId: `mtx_${"f".repeat(32)}` }), /Bestandsdatensatz/);
  assert.throws(() => classificationRetentionForTaxon({ ...taxon, statuses: [{ status: "conflicting", detail: JSON.stringify(marker) }] }), /Bestandsdatensatz/);
  assert.throws(() => classificationRetentionForTaxon({ ...taxon, lifecycleState: "active" }), /Bestandsdatensatz/);
  assert.deepEqual(classificationRetentionForTaxon({ masterTaxonId: f.id, masterStatuses: [{ id: "stale", detail: JSON.stringify(marker) }] }), marker);
});

// Regression: separate immutable source prefix from the final candidate registry.

// Additional input is isolated to these regressions; the existing 19 cases keep their original fixture inputs.
const retentionAppendProviderSlices = [{ ...providerSlices[0], records: [...providerSlices[0].records,
  { ...external, providerRecordId: "202", scientificName: "Testus novus", hierarchy: { kingdom: "Bacteria", genus: "Testus", species: "Testus novus" } },
  { ...external, providerRecordId: "303", scientificName: "Testus dubius", hierarchy: { kingdom: "Bacteria", genus: "Testus", species: "Testus dubius" } },
] }];
const retentionAppendCol=(name,id,inat)=>({...col(["inat:"+inat]),providerRecordId:id,scientificName:name,hierarchy:{kingdom:"Bacillati",genus:"Testus",species:name}});
async function retentionAppendPlan(t,{deferred=false}={}) {
 const f=await fixture(t,{fixtureProviderSlices:retentionAppendProviderSlices}),records=[retentionAppendCol("Testus novus","col-202","202"),...(deferred?[retentionAppendCol("Testus dubius","col-303","999")]:[])];
 const control=await f.build({colRecords:records});
 const cases=read(f.root,"staging",db=>db.prepare("SELECT resolution_note FROM master_conflict WHERE conflict_id GLOB 'classification_*' AND conflict_id NOT GLOB 'classification_retention_*'").all().map(row=>JSON.parse(row.resolution_note)));
 let registry=appendClassificationBatch({registry:f.registry,cases:cases.filter(p=>p.target.scientificName==="Testus novus"),batchRevision:"c".repeat(64),sourceRevision:control.inputRevisions.identitySources,inputRevision:control.inputRevisions.identityInputs,confirmedAt:THIRD.toISOString(),automation:{policy:"unused-classifications-v1",usageRevision:policy.usageRevision}});
 if(deferred) registry=appendClassificationBatch({registry,cases:cases.filter(p=>p.target.scientificName==="Testus dubius"),deferred:true,batchRevision:"d".repeat(64),sourceRevision:control.inputRevisions.identitySources,inputRevision:control.inputRevisions.identityInputs,confirmedAt:THIRD.toISOString(),automation:{policy:"unused-classifications-v1",usageRevision:policy.usageRevision}});
 return {f,records,control,registry,cases};
}
const retentionMarkerForFixture=f=>read(f.root,"staging",db=>classificationRetentionMarker(db.prepare("SELECT status_detail FROM master_taxon_status WHERE master_taxon_id=? AND status_name='stale'").get(f.id).status_detail));
const rehashRetentionMarker=marker=>{const {revision,...body}=marker;return {...body,revision:sha(canonicalBuildInput(body))};};

test("vollständiges finales Register enthält Klassifikation und Zurückstellung; historische Bindung bleibt separat",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t,{deferred:true});
 const result=await f.build({colRecords:records,identityRegistry:registry});
 assert.equal(registry.events.length,3);
 assert.equal(result.classificationRetentions.registryRevision,identityRegistryRevision(registry));
 assert.equal(result.classificationRetentions.sourceRegistryRevision,identityRegistryRevision(f.registry));
 assert.equal(result.classificationRetentions.sourceRegistryEventCount,1);
 assert.equal(result.inputRevisions.identities,identityRegistryRevision(registry));
 read(f.root,"staging",db=>{assert.deepEqual(readIdentityRegistry(db),registry);assertClassificationRetentions(db,result.classificationRetentions,{registryRevision:result.inputRevisions.identities});});
 assert.equal((await inspectTaxonomyMasterCandidate(f.root)).blockingConflictCount,0);
});

test("gültig neu gehashte Änderung des alten Ereignisses bleibt gesperrt",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t);
 const old=plain(f.registry),body={...old.events[0],reason:"Veränderte alte Entscheidung"};delete body.eventId;old.events[0]={...body,eventId:sha(JSON.stringify(body))};validateIdentityRegistry(old);
 const changed=appendClassificationBatch({registry:old,cases:[registry.events.at(-1).classificationCase],batchRevision:"e".repeat(64),sourceRevision:registry.events.at(-1).sourceRevision,inputRevision:registry.events.at(-1).inputRevision,confirmedAt:THIRD.toISOString(),automation:{policy:"unused-classifications-v1",usageRevision:policy.usageRevision}});
 await assert.rejects(f.build({colRecords:records,identityRegistry:changed}),/aktive Identitätshistorie nicht entfernen oder umschreiben/);
});

test("Entfernen der alten Historie bleibt trotz gültiger neuer Entscheidung gesperrt",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t),event=registry.events.at(-1);
 const changed=appendClassificationBatch({registry:emptyIdentityRegistry(),cases:[event.classificationCase],batchRevision:"e".repeat(64),sourceRevision:event.sourceRevision,inputRevision:event.inputRevision,confirmedAt:THIRD.toISOString(),automation:event.classificationAutomation});
 await assert.rejects(f.build({colRecords:records,identityRegistry:changed}),/aktive Identitätshistorie nicht entfernen oder umschreiben/);
});

test("ungültiges neues Append wird vor Retentionsfinalisierung abgelehnt",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t),invalid=plain(registry);invalid.events.at(-1).reason="ungehasht verändert";
 await assert.rejects(f.build({colRecords:records,identityRegistry:invalid}),/Prüfsumme/);
});

test("nachträgliche gültige Registerverkürzung oder Erweiterung umgeht exakten Vollvergleich nicht",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t,{deferred:true}),result=await f.build({colRecords:records,identityRegistry:registry});
 const db=open(f.root,"staging",false);try{writeIdentityRegistry(db,{schemaVersion:1,events:registry.events.slice(0,-1)});assert.throws(()=>assertClassificationRetentions(db,result.classificationRetentions),/Identitätshistorie der Retention/);writeIdentityRegistry(db,registry);assertClassificationRetentions(db,result.classificationRetentions);
 const event=registry.events.find(e=>e.type==="classification"&&e.targets[0].scientificName==="Testus novus"),source=event.targets[0];
 const input={registry,sources:[source],targets:[source],type:"continuation",reason:"Spätere eigene Bestätigung",evidence:event.evidence,baseVersion:"later",sourceRevision:"e".repeat(64),inputRevision:"f".repeat(64)};
 const preview=previewIdentityDecision(input),extended=confirmIdentityDecision(input,{token:preview.token,confirmed:true,now:()=>THIRD}).registry;
 writeIdentityRegistry(db,extended);assert.throws(()=>assertClassificationRetentions(db,result.classificationRetentions),/Identitätshistorie der Retention/);
 writeIdentityRegistry(db,registry);assertClassificationRetentions(db,result.classificationRetentions);
 }finally{db.close();}
});

test("historischer Präfix wird unabhängig vom korrekten finalen Register geprüft",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t),result=await f.build({colRecords:records,identityRegistry:registry}),marker=retentionMarkerForFixture(f),bad=rehashRetentionMarker({...marker,binding:{...marker.binding,sourceRegistryRevision:"f".repeat(64)}});
 const db=open(f.root,"staging",false);try{db.prepare("UPDATE master_taxon_status SET status_detail=? WHERE master_taxon_id=? AND status_name='stale'").run(JSON.stringify(bad),f.id);db.prepare("UPDATE master_conflict SET resolution_note=? WHERE conflict_id=?").run(JSON.stringify(bad),"classification_retention_"+f.id);assert.throws(()=>assertClassificationRetentions(db,summarizeClassificationRetentions([bad])),/historische Registergrundlage/);}finally{db.close();}
});

test("fehlende Hälfte der neuen historischen Bindung ist ungültig",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t);await f.build({colRecords:records,identityRegistry:registry});const marker=retentionMarkerForFixture(f),binding={...marker.binding};delete binding.sourceRegistryEventCount;assert.throws(()=>classificationRetentionMarker(rehashRetentionMarker({...marker,binding})),/historische Registerbindung/);
});

test("Finalisierung akzeptiert kein blindes erneutes Stempeln eines fertigen Markers",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t);await f.build({colRecords:records,identityRegistry:registry});const marker=retentionMarkerForFixture(f);assert.throws(()=>finalizeClassificationRetentionRegistry([marker],{previousRegistry:f.registry,registry}),/unverändert zur historischen/);
});


test("neue eigene Entscheidung an zurückbehaltener ID wird auch bei unverändertem Tupel gesperrt",async t=>{
 const f=await fixture(t);await f.build();const marker=retentionMarkerForFixture(f),binding={...marker.binding};delete binding.sourceRegistryRevision;delete binding.sourceRegistryEventCount;
 const provisional=rehashRetentionMarker({...marker,binding}),event=f.registry.events.at(-1),source=event.targets[0];
 const input={registry:f.registry,sources:[source],targets:[source],type:"continuation",reason:"Neue eigene Entscheidung",evidence:event.evidence,baseVersion:f.activeManifest.candidateId,sourceRevision:event.sourceRevision,inputRevision:event.inputRevision};
 const preview=previewIdentityDecision(input),registry=confirmIdentityDecision(input,{token:preview.token,confirmed:true,now:()=>THIRD}).registry;
 assert.throws(()=>finalizeClassificationRetentionRegistry([provisional],{previousRegistry:f.registry,registry}),/unverändert zur historischen/);
});

test("provisorischer Beleg mit fremder historischer Revision wird nicht neu gestempelt",async t=>{
 const f=await fixture(t);await f.build();const marker=retentionMarkerForFixture(f),binding={...marker.binding,registryRevision:"f".repeat(64)};delete binding.sourceRegistryRevision;delete binding.sourceRegistryEventCount;
 const provisional=rehashRetentionMarker({...marker,binding});assert.throws(()=>finalizeClassificationRetentionRegistry([provisional],{previousRegistry:f.registry,registry:f.registry}),/unverändert zur historischen/);
});

test("gebundener alter Schema-1-Marker bleibt ohne Umschreiben lesbar",async()=>{const original=JSON.parse(await fs.readFile(new URL("../scripts/fixtures/taxonomy/classification-retention-marker.json", import.meta.url),"utf8"));assert.deepEqual(classificationRetentionMarker(original),original);});

test("gültige neue automatische Klassifikation neben alter Retention bleibt gemeinsam aufbaubar",async t=>{
 const {f,records,registry}=await retentionAppendPlan(t);
 const actual=await f.build({colRecords:records,identityRegistry:registry});
 assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(f.root)),f.activeBytes);
 assert.equal(actual.classificationRetentions.total,1);
 assert.equal(actual.inputRevisions.identities,identityRegistryRevision(registry));
 assert.equal(actual.classificationRetentions.registryRevision,identityRegistryRevision(registry));
 assert.equal(actual.classificationRetentions.sourceRegistryRevision,identityRegistryRevision(f.registry));
 assert.deepEqual(registry.events.slice(0,f.registry.events.length),f.registry.events);
});
