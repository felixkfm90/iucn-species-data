import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createSourceRecoveryService } from "./taxonomy-source-recovery.mjs";
import { inspectSourceRecovery } from "./taxonomy-source-recovery-reader.mjs";
import { planSourceRecovery } from "./taxonomy-source-recovery-plan.mjs";
import { createStableMasterTaxonId, createMasterTaxon, addMasterConflict, addMasterFieldAssertion,
  addMasterDecision, registerProviderRelease, resolveMasterConflict } from "./taxonomy-master-model.mjs";
import { createTaxonomyMasterSchema } from "./taxonomy-master-schema.mjs";
import { preserveRecoveryConflictState } from "./taxonomy-source-recovery-conflicts.mjs";
import { normalizeProviderSliceRecord, providerSliceDataPath, providerSliceManifestPath, latestProviderSliceVersion, readProviderSlice } from "./taxonomy-master-slices.mjs";
import { writeTaxonomyPublication, prepareTaxonomyPublication } from "./taxonomy-publication.mjs";
import { sha256File } from "./lightroom-search-storage.mjs";
import { acquireMasterJobLock } from "./taxonomy-master-job.mjs";
import { taxonomyCorrectionActivePointerPath } from "./taxonomy-correction-release.mjs";
import { parseSourceRecoveryArgs, runSourceRecovery } from "../scripts/taxonomy-source-recovery.mjs";
import { sourceRecoveryIdentityRegistry } from "./taxonomy-source-recovery-identities.mjs";
import { readIdentityRegistry, validateIdentityRegistry, previewIdentityDecision } from "./taxonomy-identity-registry.mjs";
import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { buildLightroomSearchPackage } from "./lightroom-search-package.mjs";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { identitySuccessorOptions } from "./lightroom-identity-plan.mjs";
import { createSourceRecoveryCandidateService } from "./taxonomy-source-recovery-candidate.mjs";
import { executeMasterJob } from "./taxonomy-master-worker.mjs";
import { MasterRunController } from "./taxonomy-master-run-controller.mjs";
import { masterJobsDirectory, masterJobDirectory, verifyMasterJob, prepareMasterJob } from "./taxonomy-master-job.mjs";
import { readIdentityReview } from "./taxonomy-identity-review.mjs";
import { identityRegistryRevision } from "./taxonomy-identity-registry.mjs";
import { importTaxonomyPrototype } from "./taxonomy-import.mjs";
import { startMasterJobProcess } from "./taxonomy-master-process.mjs";
import { inspectTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { createSourceRecoveryReplacementService } from "./taxonomy-source-recovery-replacement.mjs";
import { assertRecoveryCandidateScope, scopedRecoveryColRecords, frozenRecoveryColInput } from "./taxonomy-source-recovery-scope.mjs";

const OLD = "2026-09-03T00:00:00.000Z", NOW = "2026-09-27T00:00:00.000Z";
const COL = "col-xr-2026-07-17";
const CLI_FIXTURE_ROOT = path.resolve(os.tmpdir(), "fn-source-recovery-cli-fixture");
const CLI_DECISIONS = `--replacement-decisions=${path.join(CLI_FIXTURE_ROOT, "decisions.json")}`;
const cliFixtureArgs = () => [
  ...[["taxonomy-root", "taxonomy"], ["search-root", "lightroom"], ["species-list", "species.json"], ["corrections", "corrections.json"]]
    .map(([flag, file]) => `--${flag}=${path.join(CLI_FIXTURE_ROOT, file)}`),
  "--previous-version=old", "--current-version=current",
];
const json = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n"); };
const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const record = (providerRecordId, scientificName, extra = {}) => normalizeProviderSliceRecord({ provider: "inaturalist", providerRecordId,
  scientificName, rank: "species", kingdom: "Animalia", hierarchy: { kingdom: "Animalia", family: "Testidae" },
  selectedForMaster: true, relevanceReasons: ["missing-name"], names: [{ name: `Name ${providerRecordId}`, language: "de" }],
  retrievedAt: OLD, ...extra });

async function fixture(t, { stableName = "Testus stable", stableKingdom = "Animalia", stableNotice = true,
  stableNoticeState = "open" } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "fn-source-recovery-"));
  t.after(() => fs.rm(base, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const options = { taxonomyRoot: path.join(base, "taxonomy"), searchRoot: path.join(base, "lightroom"),
    speciesListPath: path.join(base, "species.json"), correctionsPath: path.join(base, "corrections.json"),
    previousVersion: "snapshot-old", currentVersion: "snapshot-current" };
  await json(options.speciesListPath, []); await json(options.correctionsPath, { entries: [] });
  const stable = record("3", stableName, { kingdom: stableKingdom, hierarchy: { kingdom: stableKingdom, family: "Testidae" } });
  const before = [record("1", "Testus missing"), record("2", "Testus empty"), stable];
  const after = [record("1", "Testus missing", { selectedForMaster: false, hierarchy: {}, relevanceReasons: ["searched-taxon"], names: [], retrievedAt: NOW }),
    record("2", "Testus empty", { kingdom: "", hierarchy: {}, selectedForMaster: false, relevanceReasons: ["col-reference-gap"], retrievedAt: NOW }),
    { ...stable, retrievedAt: NOW }];
  async function source(version, records, timestamp) {
    const file = providerSliceDataPath(options.taxonomyRoot, "inaturalist", version);
    await json(file, records);
    await json(providerSliceManifestPath(options.taxonomyRoot, "inaturalist", version), { schemaVersion: 2,
      provider: "inaturalist", providerVersion: version, retrievedAt: timestamp, recordCount: records.length,
      checksumSha256: await sha256File(file) });
  }
  await source(options.previousVersion, before, OLD); await source(options.currentVersion, after, NOW);
  async function pair(rows, providerVersion, timestamp) {
    const id = `publication-${crypto.randomUUID()}`, masterVersion = `master-${providerVersion}`, packageId = `package-${providerVersion}`;
    const masterDir = path.join(options.taxonomyRoot, "master/releases", id), searchDir = path.join(options.searchRoot, "releases", id);
    await fs.mkdir(masterDir, { recursive: true }); await fs.mkdir(searchDir, { recursive: true });
    const master = path.join(masterDir, "taxonomy-master.sqlite"), search = path.join(searchDir, "taxonomy-search.sqlite");
    const colRelease = { releaseId: COL, providerVersion: COL, importedAt: timestamp, recordCount: 0 };
    const providerSlices = [{ manifest: await read(providerSliceManifestPath(options.taxonomyRoot, "inaturalist", providerVersion)), records: rows }];
    const job = await prepareMasterJob({ taxonomyRoot: options.taxonomyRoot, colRelease, colRecords: [], providerSlices,
      buildInputCoverage: [{ provider: "catalogue-of-life", version: COL, scopeKey: "fixture", rawCount: 0, complete: true },
        { provider: "inaturalist", version: providerVersion, scopeKey: "fixture", rawCount: rows.length, complete: true }],
      now: () => new Date(timestamp) });
    const recipe = await read(path.join(job.directory, "recipe.json"));
    const built = await buildTaxonomyMasterCandidate({ ...recipe.options, taxonomyRoot: options.taxonomyRoot, providerSlices,
      colRecords: [], now: () => new Date(timestamp) });
    await fs.copyFile(taxonomyMasterDatabasePath(options.taxonomyRoot, "staging"), master);
    await fs.copyFile(path.join(path.dirname(taxonomyMasterDatabasePath(options.taxonomyRoot, "staging")), "build-inputs.sqlite"), path.join(masterDir, "build-inputs.sqlite"));
    // Model the existing reference-gap notice of a previously updated master;
    // a first-ever provider-only build does not yet create that notice.
    const db = new DatabaseSync(master);
    try {
      for (const row of rows) {
        if (row.providerRecordId === "3" && !stableNotice) continue;
        addMasterConflict(db, { conflictId: `fixture-gap-${row.providerRecordId}`,
          masterTaxonId: createStableMasterTaxonId(row), conflictType: "reference-gap", detectedAt: timestamp,
          resolutionNote: "Keine exakte Artzeile in der aktiven CoL-Referenz." });
        if (row.providerRecordId === "3" && stableNoticeState !== "open") {
          resolveMasterConflict(db, { conflictId: "fixture-gap-3", conflictState: stableNoticeState,
            resolvedAt: timestamp, resolutionNote: "Bereits bestätigt, nicht erneut öffnen" });
          const field = db.prepare("SELECT assertion_id FROM master_field_assertion WHERE master_taxon_id=? AND field_name='german-name' AND selected=1")
            .get(createStableMasterTaxonId(row));
          addMasterDecision(db, { decisionId: "fixture-own-choice", masterTaxonId: createStableMasterTaxonId(row),
            conflictId: "fixture-gap-3", fieldName: "german-name", language: "de", decisionType: "keep-current",
            selectedAssertionId: field.assertion_id, decidedAt: timestamp, note: "Eigene bestätigte Wahl" });
        }
      }
    } finally { db.close(); }
    await fs.writeFile(search, "unchanged package fixture");
    await json(path.join(masterDir, "manifest.json"), { ...built, candidateId: masterVersion, buildJobRevision: recipe.revision,
      buildInputs: { ...built.buildInputs, masterSha256: await sha256File(master) } });
    await json(path.join(searchDir, "manifest.json"), { masterVersion, packageId });
    return { id, masterVersion, packageId, masterChecksum: `sha256:${await sha256File(master)}`, packageChecksum: `sha256:${await sha256File(search)}` };
  }
  const previous = await pair(before, options.previousVersion, OLD), active = await pair(after.slice(1), options.currentVersion, NOW);
  const pointer = { schemaVersion: 1, taxonomyRoot: options.taxonomyRoot, searchRoot: options.searchRoot, active, previous };
  await writeTaxonomyPublication(options.taxonomyRoot, pointer);
  await fs.rm(path.dirname(taxonomyMasterDatabasePath(options.taxonomyRoot, "staging")), { recursive: true, force: true });
  const service = (extra) => createSourceRecoveryService(options, { now: () => new Date("2026-09-30T10:00:00Z"), ...extra });
  const draftRoot = path.join(options.taxonomyRoot, "master/source-recovery/drafts");
  const files = [options.speciesListPath, options.correctionsPath,
    path.join(base, "taxonomy-publication/active.json"), ...[previous, active].flatMap((entry) => [
      path.join(options.taxonomyRoot, "master/releases", entry.id, "taxonomy-master.sqlite"),
      path.join(options.searchRoot, "releases", entry.id, "taxonomy-search.sqlite")]),
    ...[options.previousVersion, options.currentVersion].flatMap((version) => [providerSliceDataPath(options.taxonomyRoot, "inaturalist", version), providerSliceManifestPath(options.taxonomyRoot, "inaturalist", version)])];
  const fingerprints = async () => Promise.all(files.map(async (file) => [file, await sha256File(file)]));
  const request = (preview) => ({ confirmed: true, revision: preview.revision,
    replacementDecisions: preview.identityCases.map((row) => ({ replacementId: row.replacementId, originalId: row.originalId, policy: preview.replacementPolicy })) });
  return { options, before, after, source, service, request, draftRoot, fingerprints, active, previous, files };
}

function candidateService(f, overrides = {}) {
  return createSourceRecoveryCandidateService(f.options, { now: () => new Date("2026-09-30T11:00:00Z"),
    readBuildInputs: async (_options, repaired) => ({ colRelease: { provider: "catalogue-of-life", releaseId: COL,
      providerVersion: COL, importedAt: repaired.manifest.retrievedAt, recordCount: 0 },
    colRecords: [], providerSlices: [repaired], corrections: [], projectTaxa: [], retainedTaxa: [] }),
    runJob: (request) => executeMasterJob(request), ...overrides });
}

test("Vorschau ist lesend; bestätigter Entwurf bewahrt Quellen, Paar und beide ID-Varianten", async (t) => {
  const f = await fixture(t), before = await f.fingerprints(), service = f.service();
  const preview = await service.preview();
  assert.equal(preview.count, 2); assert.equal(preview.selectionCount, 1); assert.equal(preview.identityCases.length, 1);
  assert.equal(preview.identityCases[0].originalId, createStableMasterTaxonId(f.before[1]));
  await assert.rejects(fs.stat(f.draftRoot), { code: "ENOENT" });
  assert.deepEqual(await f.fingerprints(), before);
  await assert.rejects(service.prepare({ revision: preview.revision }), /ausdrückliche/);
  await assert.rejects(service.prepare({ ...f.request(preview), replacementDecisions: [] }), /Ersatz-ID/);
  const saved = await service.prepare(f.request(preview));
  assert.equal(saved.activatesDatabase, false); assert.equal(saved.changesPhotos, false);
  assert.equal(saved.changedRecordCount, 2); assert.equal(saved.recordCount, 3);
  const rows = await read(path.join(saved.directory, "records.json"));
  assert.equal(rows[0].selectedForMaster, true); assert.equal(rows[1].kingdom, "Animalia");
  assert.deepEqual(rows[2], f.after[2], "nicht betroffene Zeile bleibt semantisch exakt unverändert");
  assert.equal(await latestProviderSliceVersion(f.options.taxonomyRoot, "inaturalist"), f.options.currentVersion);
  assert.deepEqual(await f.fingerprints(), before);
  assert.equal((await f.service().inspect({ revision: preview.revision })).prepared, true, "Neustart findet und prüft Entwurf");
  assert.equal((await f.service().prepare(f.request(preview))).alreadyPrepared, true, "Wiederholung erzeugt keinen zweiten Entwurf");
  const reordered = { ...f.request(preview), replacementDecisions: preview.identityCases.map((row) => ({
    policy: preview.replacementPolicy, originalId: row.originalId, replacementId: row.replacementId })) };
  assert.equal((await f.service().prepare(reordered)).alreadyPrepared, true, "JSON-Schlüsselreihenfolge ist keine fachliche Änderung");
  assert.equal((await fs.readdir(f.draftRoot)).length, 1);
});

test("veränderte Quellenwahl und Namensdatei veralten die Bestätigung", async (t) => {
  const f = await fixture(t), preview = await f.service().preview();
  await json(f.options.correctionsPath, { entries: [{ scientificName: "Testus stable", germanName: "Eigene Wahl" }] });
  await assert.rejects(f.service().prepare(f.request(preview)), /veraltet/);
  await f.source("snapshot-next", f.after, "2026-09-28T00:00:00Z");
  await assert.rejects(f.service().preview(), /nicht mehr der aktuelle/);
  await assert.rejects(fs.stat(f.draftRoot), { code: "ENOENT" });
});

test("Änderung während Vorbereitung, Abbruch und Platzmangel hinterlassen keinen fertigen Entwurf", async (t) => {
  const f = await fixture(t), initial = await f.fingerprints();
  const first = await f.service().preview();
  await assert.rejects(f.service({ checkSpace: async () => { throw new Error("Test-Platzmangel"); } }).prepare(f.request(first)), /Test-Platzmangel/);
  assert.deepEqual(await f.fingerprints(), initial);
  const cancellation = new AbortController();
  await assert.rejects(f.service({ beforePublish: async () => cancellation.abort() }).prepare({ ...f.request(first), signal: cancellation.signal }), { name: "AbortError" });
  assert.deepEqual(await fs.readdir(f.draftRoot), []);
  await assert.rejects(f.service({ beforePublish: async () => json(f.options.correctionsPath, { entries: [], changed: true }) }).prepare(f.request(first)), /während der Vorbereitung/);
  assert.deepEqual(await fs.readdir(f.draftRoot), []);
  const fresh = await f.service().preview();
  assert.equal((await f.service().prepare(f.request(fresh))).prepared, true, "Fehler geben Sperren frei");
});

test("laufender Worker sperrt Vorbereitung; fehlerhaft veränderte Entwürfe werden nicht wiederverwendet", async (t) => {
  const f = await fixture(t), preview = await f.service().preview();
  const unlock = await acquireMasterJobLock(f.options.taxonomyRoot);
  try { await assert.rejects(f.service().prepare(f.request(preview)), /Hintergrund/); } finally { unlock(); }
  const saved = await f.service().prepare(f.request(preview));
  const file = path.join(saved.directory, "records.json"), rows = await read(file);
  rows[2].scientificName = "Tampered other"; await json(file, rows);
  const manifestFile = path.join(saved.directory, "manifest.json"), manifest = await read(manifestFile);
  manifest.checksumSha256 = await sha256File(file); await json(manifestFile, manifest);
  await assert.rejects(f.service().inspect({ revision: preview.revision }), /Quellenplan/);
  await assert.rejects(f.service().prepare(f.request(preview)), /Quellenplan/);
});

test("Reparatur ist an belegte Identität gebunden und blockiert widersprüchliche/entfernte Quellen", async (t) => {
  const f = await fixture(t), { plan, current } = await inspectSourceRecovery(f.options);
  const previous = { manifest: await read(providerSliceManifestPath(f.options.taxonomyRoot, "inaturalist", f.options.previousVersion)), records: f.before };
  const affected = f.before.slice(0, 1).map((row) => ({ ...row, masterTaxonId: createStableMasterTaxonId(row), lifecycleState: "active", currentOwners: [] }));
  const input = { affected, previous, current, binding: plan.binding };
  const untouched = structuredClone(input);
  for (const mutation of [{ scientificName: "Testus different" }, { kingdom: "Plantae" }, { versionChangeState: "removed" }, { rank: "genus" }]) {
    const changed = structuredClone(input); Object.assign(changed.current.records[0], mutation);
    const result = planSourceRecovery(changed); assert.equal(result.canPrepare, false); assert.equal(result.blockers.length, 1);
  }
  const protectedCase = structuredClone(input); protectedCase.affected[0].protectedHistory = 1;
  assert.equal(planSourceRecovery(protectedCase).canPrepare, false);
  const duplicate = structuredClone(input); duplicate.current.records.push(duplicate.current.records[0]);
  assert.throws(() => planSourceRecovery(duplicate), /doppelte/);
  assert.deepEqual(input, untouched, "Planung verändert die übergebenen Quellen nicht");
});

test("zusätzliche Entscheidungen und Mehrfachbesitz einer Ersatz-ID verhindern ihre automatische Behandlung", async (t) => {
  const f = await fixture(t), state = await inspectSourceRecovery(f.options);
  const row = f.before[1], owner = { ...f.after[1], lifecycleState: "active", masterTaxonId: createStableMasterTaxonId(f.after[1]) };
  const input = { binding: state.plan.binding, current: state.current,
    previous: { manifest: await read(providerSliceManifestPath(f.options.taxonomyRoot, "inaturalist", f.options.previousVersion)), records: f.before },
    affected: [{ ...row, lifecycleState: "active", masterTaxonId: createStableMasterTaxonId(row), currentOwners: [owner] }] };
  assert.equal(planSourceRecovery(input).canPrepare, true);
  for (const key of ["projects", "manualDecisions", "foreignEvidence", "identityEvent"]) {
    const changed = structuredClone(input); changed.affected[0].currentOwners[0][key] = 1;
    assert.equal(planSourceRecovery(changed).canPrepare, false);
  }
  const multiple = structuredClone(input); multiple.affected[0].currentOwners.push(owner);
  assert.equal(planSourceRecovery(multiple).canPrepare, false);
  await json(f.options.correctionsPath, { entries: [{ masterTaxonId: owner.masterTaxonId, germanName: "Eigene Wahl" }] });
  await assert.rejects(f.service().preview(), /eigene Namensentscheidung/);
});

test("CLI besitzt keine Standardpfade oder Aktivierung und verlangt explizite Bestätigung", () => {
  const base = cliFixtureArgs();
  assert.equal(parseSourceRecoveryArgs(["preview", ...base]).command, "preview");
  assert.throws(() => parseSourceRecoveryArgs(["activate", ...base]), /keine Aktivierung/);
  assert.throws(() => parseSourceRecoveryArgs(["preview"]), /fehlt/);
  assert.throws(() => parseSourceRecoveryArgs(["preview", ...base, "--confirm"]), /lesend/);
  assert.throws(() => parseSourceRecoveryArgs(["prepare", ...base, `--revision=${"a".repeat(64)}`]), /confirm/);
  assert.throws(() => parseSourceRecoveryArgs(["inspect", ...base, "--revision=../../bad"]), /revision/);
  assert.throws(() => parseSourceRecoveryArgs(["preview", ...base, "--current-version=other"]), /doppelte/);
  for (const command of ["prepare", "candidate"]) {
    const revision = `--revision=${"a".repeat(64)}`;
    assert.equal(parseSourceRecoveryArgs([command, ...base, revision, "--confirm", CLI_DECISIONS]).decisionsFile, path.join(CLI_FIXTURE_ROOT, "decisions.json"));
    assert.throws(() => parseSourceRecoveryArgs([command, ...base, revision, CLI_DECISIONS]), /confirm/);
    assert.throws(() => parseSourceRecoveryArgs([command, ...base, revision, "--confirm", "--replacement-decisions=decisions.json"]), /absolute/);
  }
});

test("unvollständiger Alt-Entwurf wird nie als fertig erkannt; frische Vorbereitung bleibt getrennt", async (t) => {
  const f = await fixture(t), preview = await f.service().preview();
  const interrupted = path.join(f.draftRoot, `preparing-${crypto.randomUUID()}`);
  await json(path.join(interrupted, "records.json"), ["partial"]);
  await assert.rejects(f.service().inspect({ revision: preview.revision }), { code: "ENOENT" });
  const saved = await f.service().prepare(f.request(preview));
  assert.notEqual(saved.directory, interrupted);
  assert.deepEqual(await read(path.join(interrupted, "records.json")), ["partial"]);
});

test("fremde Herkunftsangaben und historische Entscheidungen im Entwurf werden abgewiesen", async (t) => {
  const f = await fixture(t), preview = await f.service().preview();
  await assert.rejects(f.service().prepare({ ...f.request(preview), replacementDecisions: [null] }), /Ersatz-ID/);
  const saved = await f.service().prepare(f.request(preview));
  const file = path.join(saved.directory, "manifest.json"), original = await read(file);
  for (const mutation of [{ provider: "gbif" }, { sourceVersion: "other" }, { proposedProviderVersion: "other" },
    { createdAt: "invalid" }, { identityCases: [] }, { replacementPolicy: "migrate-photos" }]) {
    await json(file, { ...original, ...mutation });
    await assert.rejects(f.service().inspect({ revision: preview.revision }), /Quellenplan/);
  }
  await json(file, original);
  const planFile = path.join(saved.directory, "plan.json"), plan = await read(planFile);
  plan.rows[0].retainedFields = []; await json(planFile, plan);
  await assert.rejects(f.service().inspect({ revision: preview.revision }), /Reparaturplan/);
});

test("gleiche Versionskennung schützt nicht vor stiller Quellenänderung", async (t) => {
  const f = await fixture(t), preview = await f.service().preview();
  const changed = structuredClone(f.after); changed[2].names.push({ name: "Weitere Variante", language: "de" });
  await f.source(f.options.currentVersion, changed, NOW);
  await assert.rejects(f.service().prepare(f.request(preview)), /veraltet/);
  await assert.rejects(fs.stat(f.draftRoot), { code: "ENOENT" });
});

test("fehlende Korrekturreleases und unlesbare Namensentscheidungen sperren die Vorschau", async (t) => {
  const f = await fixture(t);
  await json(f.options.correctionsPath, { schemaVersion: 1 });
  await assert.rejects(f.service().preview(), /Namenskorrekturstand ist unvollständig/);
  await json(f.options.correctionsPath, { entries: [] });
  await json(taxonomyCorrectionActivePointerPath(f.options.taxonomyRoot), { activeRelease: `corrections-${"a".repeat(20)}` });
  await assert.rejects(f.service().preview(), /Namenskorrekturstand fehlt/);
  await assert.rejects(fs.stat(f.draftRoot), { code: "ENOENT" });
});

test("abgebrochene Vorschau bleibt lesend und der Kommandozeilenweg reicht Abbruch weiter", async (t) => {
  const f = await fixture(t), initial = await f.fingerprints(), controller = new AbortController();
  controller.abort();
  await assert.rejects(f.service().preview({ signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(runSourceRecovery(["preview", `--taxonomy-root=${f.options.taxonomyRoot}`, `--search-root=${f.options.searchRoot}`,
    `--species-list=${f.options.speciesListPath}`, `--corrections=${f.options.correctionsPath}`,
    `--previous-version=${f.options.previousVersion}`, `--current-version=${f.options.currentVersion}`], { signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(fs.stat(f.draftRoot), { code: "ENOENT" });
  assert.deepEqual(await f.fingerprints(), initial);
});

test("echter Kandidat und Suchpaket bewahren Ersatz-ID als technischen Historienfall und stellen Alt-IDs wieder her", async (t) => {
  const f = await fixture(t), unchanged = await f.fingerprints(), service = f.service(), preview = await service.preview();
  const saved = await service.prepare(f.request(preview)), state = await inspectSourceRecovery(f.options);
  const manifest = await read(path.join(saved.directory, "manifest.json")), records = await read(path.join(saved.directory, "records.json"));
  const sourceManifest = await read(providerSliceManifestPath(f.options.taxonomyRoot, "inaturalist", f.options.currentVersion));
  const slice = { manifest: { ...sourceManifest, providerVersion: manifest.proposedProviderVersion,
    retrievedAt: manifest.createdAt, checksumSha256: manifest.checksumSha256 }, records };
  const colRelease = { provider: "catalogue-of-life", releaseId: "col-repair-fixture", providerVersion: "col-repair-fixture",
    importedAt: manifest.createdAt, recordCount: 0 };
  const releases = [colRelease, { ...slice.manifest, releaseId: `inaturalist-${slice.manifest.providerVersion}` }];
  const active = new DatabaseSync(taxonomyMasterDatabasePath(f.options.taxonomyRoot), { readOnly: true });
  let registry;
  try { registry = sourceRecoveryIdentityRegistry({ plan: state.plan, registry: readIdentityRegistry(active),
    repairedVersion: manifest.proposedProviderVersion, releases, timestamp: manifest.createdAt }); } finally { active.close(); }
  assert.equal(registry.events[0].type, "source-repair");
  assert.throws(() => previewIdentityDecision({ type: "source-repair" }), /wählen/);
  const tampered = structuredClone(registry); tampered.events[0].sources[0].kingdom = "Plantae";
  assert.throws(() => validateIdentityRegistry(tampered), /Quellenreparatur/);
  const candidate = await buildTaxonomyMasterCandidate({ taxonomyRoot: f.options.taxonomyRoot,
    colRelease, colRecords: [], providerSlices: [slice], identityRegistry: registry, now: () => new Date(manifest.createdAt) });
  assert.equal(candidate.identityContinuity.missing, 0);
  const database = new DatabaseSync(taxonomyMasterDatabasePath(f.options.taxonomyRoot, "staging"), { readOnly: true });
  try {
    for (const row of f.before) assert.equal(database.prepare("SELECT lifecycle_state FROM master_taxon WHERE master_taxon_id=?")
      .get(createStableMasterTaxonId(row)).lifecycle_state, "active");
    assert.equal(database.prepare("SELECT lifecycle_state FROM master_taxon WHERE master_taxon_id=?")
      .get(preview.identityCases[0].replacementId).lifecycle_state, "deprecated");
  } finally { database.close(); }
  await buildLightroomSearchPackage({ taxonomyRoot: f.options.taxonomyRoot, searchRoot: f.options.searchRoot, sourceSlot: "staging" });
  const store = await openLightroomSearchStore({ searchRoot: f.options.searchRoot, slot: "staging" });
  try {
    const relation = store.identityResolution(preview.identityCases[0].replacementId);
    assert.equal(relation.type, "source-repair"); assert.equal(relation.state, "historical");
    assert.equal(relation.requiresConfirmation, true); assert.equal(relation.automaticPhotoChange, false);
    const choices = identitySuccessorOptions(store, relation.masterTaxonId);
    assert.equal(choices.targets[0].masterTaxonId, preview.identityCases[0].originalId);
    assert.equal(choices.unresolved, false);
  } finally { store.close(); }
  assert.deepEqual(await f.fingerprints(), unchanged, "aktive und vorherige Dateien bleiben erhalten");
});

test("bestätigter Reparaturauftrag baut echten Kandidaten und installiert neuen Eingang ohne Paaraktivierung", async (t) => {
  const f = await fixture(t), initial = await f.fingerprints(), preview = await f.service().preview(), request = f.request(preview);
  const service = candidateService(f);
  await assert.rejects(service.stage({ ...request, confirmed: false }), /ausdrücklich/);
  const result = await service.stage(request);
  assert.equal(result.ready, true); assert.equal(result.restoredCount, 2); assert.equal(result.historicalReplacementCount, 1);
  assert.equal(result.activatesDatabase, false); assert.equal(result.requiresActivationConfirmation, true);
  const version = await latestProviderSliceVersion(f.options.taxonomyRoot, "inaturalist");
  assert.equal(version, `recovery-${preview.revision.slice(0, 24)}`);
  const source = await readProviderSlice(f.options.taxonomyRoot, "inaturalist", version);
  assert.equal(source.records[0].selectedForMaster, true); assert.equal(source.manifest.previousVersion, f.options.currentVersion);
  const review = await readIdentityReview(f.options.taxonomyRoot);
  assert.equal(review.registry.events[0].type, "source-repair");
  const recipe = await read(path.join(masterJobDirectory(f.options.taxonomyRoot, result.jobId), "recipe.json"));
  assert.equal(review.revision, identityRegistryRevision(recipe.options.identityRegistry));
  await verifyMasterJob(f.options.taxonomyRoot, recipe);
  await new MasterRunController(f.options.taxonomyRoot).assertReadyForActivation();
  assert.deepEqual(await f.fingerprints(), initial);
  const repeated = await candidateService(f).stage(request);
  assert.equal(repeated.jobId, result.jobId, "Wiederholung verwendet denselben gesicherten Auftrag");
  await assert.rejects(candidateService(f).stage({ ...request, replacementDecisions: [] }), /Ersatz-ID/);
  assert.deepEqual(await f.fingerprints(), initial);
});

test("unterbrochener Worker und Abbruch vor Quellenübernahme bleiben mit demselben Auftrag fortsetzbar", async (t) => {
  const f = await fixture(t), initial = await f.fingerprints(), preview = await f.service().preview(), request = f.request(preview);
  const calls = [];
  const interrupted = candidateService(f, { runJob: async (value) => { calls.push(value.id); throw new Error("Worker-Testabbruch"); } });
  await assert.rejects(interrupted.stage(request), /Worker-Testabbruch/);
  assert.equal(await latestProviderSliceVersion(f.options.taxonomyRoot, "inaturalist"), f.options.currentVersion);
  assert.deepEqual(await f.fingerprints(), initial);
  const cancellation = new AbortController();
  const canceled = candidateService(f, { beforeInstall: async () => cancellation.abort(),
    runJob: (value) => { calls.push(value.id); return executeMasterJob(value); } });
  await assert.rejects(canceled.stage({ ...request, signal: cancellation.signal }), { name: "AbortError" });
  assert.equal(await latestProviderSliceVersion(f.options.taxonomyRoot, "inaturalist"), f.options.currentVersion);
  assert.deepEqual(await f.fingerprints(), initial);
  const completed = await candidateService(f, { runJob: (value) => { calls.push(value.id); return executeMasterJob(value); } }).stage(request);
  assert.equal(new Set([...calls, completed.jobId]).size, 1);
  assert.equal((await fs.readdir(masterJobsDirectory(f.options.taxonomyRoot))).filter((name) => /^job-/.test(name)).length, 3, "zwei Ausgangsaufträge und genau ein Reparaturauftrag");
});

test("Abbruch zwischen neuem Quellenstand und Historienvormerkung lässt sich ohne Überschreiben wiederholen", async (t) => {
  const f = await fixture(t), initial = await f.fingerprints(), preview = await f.service().preview(), request = f.request(preview);
  await assert.rejects(candidateService(f, { afterSourceInstall: async () => { throw new Error("Commit-Testunterbrechung"); } }).stage(request), /Commit-Testunterbrechung/);
  const version = await latestProviderSliceVersion(f.options.taxonomyRoot, "inaturalist");
  assert.equal(version, `recovery-${preview.revision.slice(0, 24)}`);
  assert.equal(await readIdentityReview(f.options.taxonomyRoot), null);
  const savedHash = await sha256File(providerSliceDataPath(f.options.taxonomyRoot, "inaturalist", version));
  const completed = await candidateService(f).stage(request);
  assert.equal(completed.ready, true); assert.ok(await readIdentityReview(f.options.taxonomyRoot));
  assert.equal(await sha256File(providerSliceDataPath(f.options.taxonomyRoot, "inaturalist", version)), savedHash);
  assert.deepEqual(await f.fingerprints(), initial);
});

test("geänderte Eingänge sperren die Wiederaufnahme eines Reparaturauftrags", async (t) => {
  const f = await fixture(t), preview = await f.service().preview(), request = f.request(preview);
  await assert.rejects(candidateService(f, { runJob: async () => { throw new Error("Worker-Testabbruch"); } }).stage(request), /Worker-Testabbruch/);
  await json(f.options.correctionsPath, { entries: [], changed: true });
  await assert.rejects(candidateService(f).stage(request), /veraltet/);
  assert.equal(await latestProviderSliceVersion(f.options.taxonomyRoot, "inaturalist"), f.options.currentVersion);
});

test("regulärer Eingangsleser nutzt ausschließlich die installierte lokale CoL-Referenz", async (t) => {
  const f = await fixture(t);
  await importTaxonomyPrototype({ fixtureDirectory: path.resolve("scripts/fixtures/taxonomy/col-xr-2026-07-17"),
    taxonomyRoot: f.options.taxonomyRoot, now: () => new Date(NOW) });
  const preview = await f.service().preview(), initial = await f.fingerprints();
  const service = createSourceRecoveryCandidateService(f.options, { now: () => new Date("2026-09-30T11:00:00Z"),
    runJob: (request) => executeMasterJob(request) });
  const result = await service.stage(f.request(preview));
  assert.equal(result.restoredCount, 2); assert.equal(result.ready, true);
  const recipe = await read(path.join(masterJobDirectory(f.options.taxonomyRoot, result.jobId), "recipe.json"));
  assert.equal(recipe.options.buildInputCoverage[0].complete, true);
  assert.match(recipe.options.colRelease.releaseId, /^col-xr-/);
  assert.deepEqual(await f.fingerprints(), initial);
});

test("Reparaturauftrag läuft im echten Hilfsprozess und bleibt anschließend regulär aktivierbar", async (t) => {
  const f = await fixture(t), initial = await f.fingerprints(), preview = await f.service().preview();
  const result = await candidateService(f, { runJob: startMasterJobProcess }).stage(f.request(preview));
  assert.equal(result.ready, true);
  await new MasterRunController(f.options.taxonomyRoot).assertReadyForActivation();
  const state = await read(path.join(masterJobDirectory(f.options.taxonomyRoot, result.jobId), "state.json"));
  assert.equal(state.status, "ready"); assert.notEqual(state.pid, process.pid);
  assert.deepEqual(await f.fingerprints(), initial);
});

test("CoL-Eingang bleibt außerhalb der Reparatur exakt eingefroren; keine Lücken-/Homonymsuche", async () => {
  const old = { providerRecordId: "old", scientificName: "Stable species", rank: "species", kingdom: "Animalia",
    germanNames: [{ name: "Alter Name" }], hierarchy: { kingdom: "Animalia" } };
  const repair = { providerRecordId: "new", scientificName: "Recovered species", rank: "species", kingdom: "Animalia" };
  const plan = { rows: [{ scientificName: repair.scientificName, rank: repair.rank, kingdom: repair.kingdom }] };
  const rows = [];
  for await (const row of scopedRecoveryColRecords({ frozen: [old], repairRecords: [repair], plan })) rows.push(row);
  assert.deepEqual(rows, [old, repair]); assert.equal(rows[0], old, "keine Neu-Normalisierung der Altzeile");
  const duplicated = [];
  for await (const row of scopedRecoveryColRecords({ frozen: [old, repair], repairRecords: [repair], plan })) duplicated.push(row);
  assert.deepEqual(duplicated, [old, repair], "Anbieter-ID wird nicht doppelt eingespielt");
  for (const mutation of [{ kingdom: "Plantae" }, { scientificName: "Unapproved species" }, { rank: "genus" }]) {
    await assert.rejects(async () => {
      for await (const _row of scopedRecoveryColRecords({ frozen: [old], repairRecords: [{ ...repair, ...mutation }], plan })) { /* consume */ }
    }, /außerhalb/);
  }
  await assert.rejects(async () => {
    for await (const _row of scopedRecoveryColRecords({ frozen: [repair], repairRecords: [{ ...repair, germanNames: ["Unapproved name"] }], plan })) { /* consume */ }
  }, /bestehenden Beleg verändern/);
});

test("CoL-Ausgangseingang verlangt dieselbe Referenz und unveränderte Auftragsdateien", async (t) => {
  const f = await fixture(t), frozen = await frozenRecoveryColInput(f.options.taxonomyRoot, COL);
  const rows = []; for await (const row of frozen.records()) rows.push(row);
  assert.deepEqual(rows, []);
  await assert.rejects(frozenRecoveryColInput(f.options.taxonomyRoot, "col-other"), /Referenzherkunft/);
  await fs.appendFile(frozen.files[1], "{}\n");
  await assert.rejects(frozenRecoveryColInput(f.options.taxonomyRoot, COL), /verändert/);
});

test("Kandidatenprüfung blockiert zusätzliche IDs, fremde Belege, Werte, Namen und Konflikte", async (t) => {
  const f = await fixture(t), preview = await f.service().preview();
  await candidateService(f).stage(f.request(preview));
  const transfer = await read(path.join(f.options.taxonomyRoot, "master/source-recovery/transfers", `recovery-${preview.revision}.json`));
  assert.doesNotThrow(() => assertRecoveryCandidateScope(f.options.taxonomyRoot, transfer.plan));
  const file = taxonomyMasterDatabasePath(f.options.taxonomyRoot, "staging"), snapshot = await fs.readFile(file);
  const stableId = createStableMasterTaxonId(f.before[2]);
  for (const change of [
    (db) => createMasterTaxon(db, { masterTaxonId: createStableMasterTaxonId({ scientificName: "Unexpected species", rank: "species", kingdom: "Plantae" }),
      scientificName: "Unexpected species", rank: "species", kingdom: "Plantae", referenceState: "exact-col", createdAt: NOW }),
    (db) => db.prepare("UPDATE provider_taxon_assertion SET hierarchy_json='{}' WHERE master_taxon_id=?").run(stableId),
    (db) => db.prepare("UPDATE provider_taxon_assertion SET version_change_state='removed' WHERE master_taxon_id=?").run(stableId),
    (db) => db.prepare("UPDATE provider_taxon_assertion SET master_taxon_id=NULL, match_state='unlinked' WHERE master_taxon_id=?").run(stableId),
    (db) => db.prepare("UPDATE master_field_assertion SET field_value='Changed value' WHERE master_taxon_id=? AND selected=1").run(stableId),
    (db) => db.prepare("UPDATE provider_name_assertion SET name='Changed name' WHERE provider_taxon_assertion_id IN (SELECT assertion_id FROM provider_taxon_assertion WHERE master_taxon_id=?)").run(stableId),
    (db) => addMasterConflict(db, { conflictId: "unapproved-returned", masterTaxonId: stableId, conflictType: "reference-returned", detectedAt: NOW }),
  ]) {
    const db = new DatabaseSync(file); try { change(db); } finally { db.close(); }
    assert.throws(() => assertRecoveryCandidateScope(f.options.taxonomyRoot, transfer.plan), /Umfang|Reparaturumfang/);
    await assert.rejects(inspectTaxonomyMasterCandidate(f.options.taxonomyRoot), /Reparaturumfang/, "auch reguläre Kandidaten-/Aktivierungsprüfung erzwingt die Grenze");
    await fs.writeFile(file, snapshot);
  }
  assert.doesNotThrow(() => assertRecoveryCandidateScope(f.options.taxonomyRoot, transfer.plan));
  const db = new DatabaseSync(file);
  try { db.prepare("UPDATE master_taxon SET lifecycle_state='deprecated' WHERE master_taxon_id=?").run(transfer.plan.rows[0].originalId); }
  finally { db.close(); }
  await assert.rejects(inspectTaxonomyMasterCandidate(f.options.taxonomyRoot), /Reparatur-ID/);
  await fs.writeFile(file, snapshot);
});

test("enge Reparatur erhält eine unbeteiligte Referenzlücke ohne bisherigen Konflikthinweis", async (t) => {
  const f = await fixture(t, { stableNotice: false }), initial = await f.fingerprints();
  const preview = await f.service().preview();
  await candidateService(f).stage(f.request(preview));
  const id = createStableMasterTaxonId(f.before[2]);
  for (const slot of ["active", "staging"]) {
    const db = new DatabaseSync(taxonomyMasterDatabasePath(f.options.taxonomyRoot, slot), { readOnly: true });
    try {
      assert.equal(db.prepare("SELECT reference_state FROM master_taxon WHERE master_taxon_id=?").get(id).reference_state, "reference-gap");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM master_conflict WHERE master_taxon_id=?").get(id).n, 0);
    } finally { db.close(); }
  }
  assert.deepEqual(await f.fingerprints(), initial);
});

test("regulärer Folgeaufbau erzeugt weiterhin den Referenzlückenhinweis für einen vorhandenen Vorgänger", async (t) => {
  const f = await fixture(t, { stableNotice: false }), initial = await f.fingerprints();
  await buildTaxonomyMasterCandidate({ taxonomyRoot: f.options.taxonomyRoot,
    colRelease: { releaseId: COL, providerVersion: COL, importedAt: NOW }, colRecords: [],
    providerSlices: [{ manifest: await read(providerSliceManifestPath(f.options.taxonomyRoot, "inaturalist", f.options.currentVersion)), records: f.after }],
    now: () => new Date("2026-10-01T14:00:00Z") });
  const db = new DatabaseSync(taxonomyMasterDatabasePath(f.options.taxonomyRoot, "staging"), { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM master_conflict WHERE master_taxon_id=? AND conflict_type='reference-gap'")
      .get(createStableMasterTaxonId(f.before[2])).n, 1);
  } finally { db.close(); }
  assert.deepEqual(await f.fingerprints(), initial);
});

test("enger Kandidatenbau erhält einen verworfenen Referenzhinweis und die eigene Entscheidung", async (t) => {
  const f = await fixture(t, { stableNoticeState: "dismissed" }), initial = await f.fingerprints();
  const preview = await f.service().preview();
  await candidateService(f).stage(f.request(preview));
  const checked = await inspectTaxonomyMasterCandidate(f.options.taxonomyRoot);
  assert.equal(checked.available, true);
  assert.deepEqual(checked.manifest.recoveryConflictState, { conflicts: 1, decisions: 1 });
  const db = new DatabaseSync(taxonomyMasterDatabasePath(f.options.taxonomyRoot, "staging"), { readOnly: true });
  try {
    const row = db.prepare("SELECT * FROM master_conflict WHERE conflict_id='fixture-gap-3'").get();
    assert.equal(row.conflict_state, "dismissed"); assert.equal(row.detected_at, NOW); assert.equal(row.resolved_at, NOW);
    assert.equal(row.resolution_note, "Bereits bestätigt, nicht erneut öffnen");
    const choice = db.prepare(`SELECT d.*, f.field_value FROM master_decision d
      JOIN master_field_assertion f ON f.assertion_id=d.selected_assertion_id WHERE decision_id='fixture-own-choice'`).get();
    assert.equal(choice.field_value, "Name 3"); assert.equal(choice.conflict_id, "fixture-gap-3");
    assert.equal(choice.note, "Eigene bestätigte Wahl"); assert.equal(choice.decided_at, NOW);
  } finally { db.close(); }
  assert.deepEqual(await f.fingerprints(), initial);
});

async function conflictFixture(t, state = "resolved-keep", { missing = false, ambiguous = false } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "fn-recovery-conflicts-"));
  const previousPath = path.join(base, "old.sqlite"), candidatePath = path.join(base, "candidate.sqlite");
  const before = new DatabaseSync(previousPath), database = new DatabaseSync(candidatePath);
  t.after(async () => { database.close(); await fs.rm(base, { recursive: true, force: true }); });
  const stableId = createStableMasterTaxonId({ scientificName: "Testus stable", rank: "species", kingdom: "Animalia" });
  const repairId = createStableMasterTaxonId({ scientificName: "Testus repair", rank: "species", kingdom: "Animalia" });
  const fields = (db, id, value, selected) => addMasterFieldAssertion(db, { masterTaxonId: id,
    fieldName: "german-name", fieldValue: value, language: "de", originKind: "manual", releaseId: "manual-fixture",
    reviewState: selected ? "accepted" : "pending", selected, createdAt: OLD });
  for (const db of [before, database]) {
    createTaxonomyMasterSchema(db);
    registerProviderRelease(db, { releaseId: "manual-fixture", provider: "manual", providerVersion: "fixture",
      dataScope: "manual", releaseState: "active", importedAt: OLD });
    for (const [id, name] of [[stableId, "Testus stable"], [repairId, "Testus repair"]]) {
      createMasterTaxon(db, { masterTaxonId: id, scientificName: name, rank: "species", kingdom: "Animalia",
        referenceState: "reference-gap", createdAt: OLD });
    }
  }
  const current = fields(before, stableId, "Eigener Name", true), alternative = fields(before, stableId, "Anderer Name", false);
  fields(before, repairId, "Reparatur", true);
  fields(database, repairId, "Reparatur", true); // Different assertion numbering is deliberate.
  const mappedCurrent = fields(database, stableId, "Eigener Name", true);
  const mappedAlternative = missing ? null : fields(database, stableId, "Anderer Name", false);
  if (ambiguous) fields(database, stableId, "Anderer Name", false);
  addMasterConflict(before, { conflictId: "old-stable", masterTaxonId: stableId, fieldName: "german-name",
    currentAssertionId: current, candidateAssertionId: alternative, conflictType: "changed-value", detectedAt: OLD,
    resolutionNote: "Alter Hinweis" });
  if (state !== "open") resolveMasterConflict(before, { conflictId: "old-stable", conflictState: state,
    resolvedAt: NOW, resolutionNote: "Eigene bestätigte Entscheidung" });
  addMasterDecision(before, { decisionId: "own-choice", masterTaxonId: stableId, conflictId: "old-stable",
    fieldName: "german-name", language: "de", decisionType: "keep-current", selectedAssertionId: current,
    decidedAt: NOW, note: "Eigene Wahl erhalten" });
  addMasterConflict(database, { conflictId: "new-stable", masterTaxonId: stableId, conflictType: "reference-gap", detectedAt: NOW });
  addMasterConflict(database, { conflictId: "approved-repair", masterTaxonId: repairId, conflictType: "reference-gap", detectedAt: NOW });
  before.close();
  const oldHash = await sha256File(previousPath);
  return { database, previousPath, candidatePath, oldHash, stableId, repairId,
    mappedCurrent, mappedAlternative, scope: [{ originalId: repairId, replacementId: null }] };
}

test("enge Konfliktübernahme erhält offene, verworfene und bestätigte Zustände samt Belegen/Entscheidung", async (t) => {
  for (const state of ["open", "dismissed", "resolved-keep", "resolved-accept", "resolved-manual"]) {
    await t.test(state, async (t) => {
      const f = await conflictFixture(t, state);
      const result = await preserveRecoveryConflictState(f);
      assert.deepEqual(result, { conflicts: 1, decisions: 1 });
      const conflict = f.database.prepare("SELECT * FROM master_conflict WHERE conflict_id='old-stable'").get();
      assert.equal(conflict.conflict_state, state); assert.equal(conflict.detected_at, OLD);
      assert.equal(conflict.resolved_at, state === "open" ? null : NOW);
      assert.equal(conflict.resolution_note, state === "open" ? "Alter Hinweis" : "Eigene bestätigte Entscheidung");
      assert.equal(conflict.current_assertion_id, f.mappedCurrent);
      assert.equal(conflict.candidate_assertion_id, f.mappedAlternative);
      const decision = f.database.prepare("SELECT * FROM master_decision WHERE decision_id='own-choice'").get();
      assert.equal(decision.selected_assertion_id, f.mappedCurrent); assert.equal(decision.conflict_id, "old-stable");
      assert.equal(decision.decided_at, NOW); assert.equal(decision.note, "Eigene Wahl erhalten");
      assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM master_conflict WHERE conflict_id='new-stable'").get().n, 0);
      assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM master_conflict WHERE conflict_id='approved-repair'").get().n, 1);
      assert.deepEqual(f.database.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(await sha256File(f.previousPath), f.oldHash);
    });
  }
});

test("fehlende oder mehrdeutige alte Konfliktbelege brechen ab statt Verweise zu erraten", async (t) => {
  for (const options of [{ missing: true }, { ambiguous: true }]) {
    await t.test(JSON.stringify(options), async (t) => {
      const f = await conflictFixture(t, "resolved-keep", options);
      await assert.rejects(preserveRecoveryConflictState(f), /fehlt oder ist mehrdeutig/);
      assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM master_conflict WHERE conflict_id='new-stable'").get().n, 1);
      assert.equal(await sha256File(f.previousPath), f.oldHash);
    });
  }
});

test("Abbruch der Konfliktübernahme wird zurückgerollt; Wiederholung verdoppelt keine Hinweise", async (t) => {
  const f = await conflictFixture(t), initial = f.database.prepare("SELECT * FROM master_conflict ORDER BY conflict_id").all();
  f.database.exec("BEGIN IMMEDIATE");
  await assert.rejects(preserveRecoveryConflictState({ ...f, onProgress(event) {
    if (event.current > 0) throw new Error("Testabbruch nach Übernahme");
  } }), /Testabbruch/);
  f.database.exec("ROLLBACK");
  assert.deepEqual(f.database.prepare("SELECT * FROM master_conflict ORDER BY conflict_id").all(), initial);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    f.database.exec("BEGIN IMMEDIATE");
    assert.deepEqual(await preserveRecoveryConflictState(f), { conflicts: 1, decisions: 1 });
    f.database.exec("COMMIT");
  }
  assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM master_conflict").get().n, 2);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM master_decision").get().n, 1);
  assert.equal(await sha256File(f.previousPath), f.oldHash);
});

test("Konfliktübernahme sperrt ungültigen Umfang und das Beschreiben des Ausgangsmasters", async (t) => {
  const f = await conflictFixture(t), initial = await sha256File(f.candidatePath);
  await assert.rejects(preserveRecoveryConflictState({ ...f, scope: [{ originalId: f.repairId, replacementId: f.repairId }] }), /Reparaturumfang/);
  const source = new DatabaseSync(f.previousPath);
  try { await assert.rejects(preserveRecoveryConflictState({ ...f, database: source }), /Ausgangsmaster/); }
  finally { source.close(); }
  assert.equal(await sha256File(f.previousPath), f.oldHash);
  assert.equal(await sha256File(f.candidatePath), initial);
});

test("Workerfehler während Konfliktübernahme bleibt mit unverändertem Testauftrag wiederaufnehmbar", async (t) => {
  const f = await fixture(t, { stableNotice: false }), preview = await f.service().preview(), initial = await f.fingerprints();
  let id;
  await assert.rejects(candidateService(f, { runJob: (request) => {
    id = request.id;
    return executeMasterJob({ ...request, onProgress(event) {
      if (event.phase === "Konfliktdaten übernehmen") throw new Error("Konflikt-Worker-Testfehler");
    } });
  } }).stage(f.request(preview)), /Konflikt-Worker-Testfehler/);
  const directory = masterJobDirectory(f.options.taxonomyRoot, id), stateFile = path.join(directory, "state.json");
  assert.equal((await read(stateFile)).status, "failed");
  const recipeHash = await sha256File(path.join(directory, "recipe.json"));
  assert.equal((await inspectTaxonomyMasterCandidate(f.options.taxonomyRoot)).available, false);
  const result = await candidateService(f).stage(f.request(preview));
  assert.equal(result.jobId, id); assert.equal(result.ready, true);
  assert.equal((await read(stateFile)).status, "ready");
  assert.equal(await sha256File(path.join(directory, "recipe.json")), recipeHash);
  assert.deepEqual(await f.fingerprints(), initial);
});

test("Konfliktübernahmeregel ist an Reparaturvorschau und gespeicherte Masterregeln gebunden", async () => {
  for (const file of ["taxonomy-master-inputs.mjs", "taxonomy-source-recovery-reader.mjs"]) {
    assert.match(await fs.readFile(new URL(file, import.meta.url), "utf8"), /"taxonomy-source-recovery-conflicts\.mjs"/);
  }
});

test("Scopefehler im Worker veröffentlicht keinen fertig aktivierbaren Kandidaten oder Quellenstand", async (t) => {
  const f = await fixture(t), preview = await f.service().preview(), initial = await f.fingerprints();
  await assert.rejects(candidateService(f, { readBuildInputs: async (_options, repaired) => ({
    colRelease: { releaseId: COL, providerVersion: COL, importedAt: NOW },
    colRecords: [{ providerRecordId: "outside", scientificName: "Outside species", rank: "species", kingdom: "Plantae" }],
    providerSlices: [repaired], projectTaxa: [], corrections: [], retainedTaxa: [],
  }) }).stage(f.request(preview)), /Reparaturumfang/);
  assert.equal((await inspectTaxonomyMasterCandidate(f.options.taxonomyRoot)).available, false);
  const current = await read(path.join(masterJobsDirectory(f.options.taxonomyRoot), "current.json"));
  const state = await read(path.join(masterJobDirectory(f.options.taxonomyRoot, current.id), "state.json"));
  assert.equal(state.status, "failed");
  await assert.rejects(new MasterRunController(f.options.taxonomyRoot).assertReadyForActivation(), /nicht abgeschlossen/);
  assert.equal(await latestProviderSliceVersion(f.options.taxonomyRoot, "inaturalist"), f.options.currentVersion);
  assert.deepEqual(await f.fingerprints(), initial);
});

async function replacementFixture(t) {
  const f = await fixture(t);
  await importTaxonomyPrototype({ fixtureDirectory: path.resolve("scripts/fixtures/taxonomy/col-xr-2026-07-17"),
    taxonomyRoot: f.options.taxonomyRoot, now: () => new Date(NOW) });
  const first = await f.service().preview(), request = f.request(first);
  const oldResult = await candidateService(f).stage(request);
  const service = (overrides = {}) => createSourceRecoveryReplacementService(f.options, { now: () => new Date("2026-09-30T12:00:00Z"),
    runJob: (value) => executeMasterJob(value), ...overrides });
  const oldDirectory = masterJobDirectory(f.options.taxonomyRoot, oldResult.jobId);
  const oldFiles = [path.join(oldDirectory, "recipe.json"), path.join(oldDirectory, "state.json"),
    path.join(oldDirectory, "col.jsonl"), path.join(oldDirectory, "provider-0.jsonl"),
    path.join(f.options.taxonomyRoot, "master/identity-review.json"),
    providerSliceDataPath(f.options.taxonomyRoot, "inaturalist", `recovery-${first.revision.slice(0, 24)}`)];
  const hashes = async () => Promise.all(oldFiles.map(async (file) => [file, await sha256File(file)]));
  const replacementRequest = (plan) => ({ ...request, planRevision: plan.revision });
  return { f, first, request, service, oldResult, hashes, replacementRequest };
}

test("Ersatzvorschau bleibt lesend, benötigt neue Freigabe und erhält alten Kandidaten/Auftrag", async (t) => {
  const r = await replacementFixture(t), { f } = r;
  const initial = await f.fingerprints(), oldHashes = await r.hashes();
  const oldCandidateHash = await sha256File(taxonomyMasterDatabasePath(f.options.taxonomyRoot, "staging"));
  const plan = await r.service().preview({ revision: r.first.revision });
  assert.equal(plan.activatesDatabase, false); assert.equal(plan.restoredCount, 2);
  await assert.rejects(fs.stat(plan.retainedCandidateDirectory), { code: "ENOENT" });
  await assert.rejects(r.service().stage({ ...r.replacementRequest(plan), confirmed: false }), /ausdrückliche/);
  await assert.rejects(r.service().stage({ ...r.replacementRequest(plan), planRevision: "a".repeat(64) }), /veraltet/);
  await assert.rejects(r.service().stage({ ...r.replacementRequest(plan), replacementDecisions: [] }), /Ersatz-ID/);
  const result = await r.service({ runJob: startMasterJobProcess }).stage(r.replacementRequest(plan));
  assert.equal(result.ready, true); assert.notEqual(result.jobId, r.oldResult.jobId);
  assert.equal(result.activatesDatabase, false);
  assert.equal(await sha256File(path.join(result.retainedCandidateDirectory, "taxonomy-master.sqlite")), oldCandidateHash);
  assert.deepEqual(await r.hashes(), oldHashes); assert.deepEqual(await f.fingerprints(), initial);
  await new MasterRunController(f.options.taxonomyRoot).assertReadyForActivation();
  const repeated = await r.service().stage(r.replacementRequest(plan));
  assert.equal(repeated.jobId, result.jobId, "kein zweiter Auftrag bei Wiederholung");
  assert.equal((await r.service().preview({ revision: r.first.revision })).state, "ready");
});

test("Ersatzweg bleibt nach Abbruch vor Aufbewahrung und Workerfehler wiederaufnehmbar", async (t) => {
  const r = await replacementFixture(t), plan = await r.service().preview({ revision: r.first.revision });
  const initial = await r.f.fingerprints(), hashes = await r.hashes(), cancel = new AbortController();
  await assert.rejects(r.service({ beforeRetain: async () => cancel.abort() }).stage({ ...r.replacementRequest(plan), signal: cancel.signal }), { name: "AbortError" });
  await assert.rejects(fs.stat(plan.retainedCandidateDirectory), { code: "ENOENT" });
  const calls = [];
  await assert.rejects(r.service({ runJob: async (value) => { calls.push(value.id); throw new Error("Ersatz-Worker-Testfehler"); } }).stage(r.replacementRequest(plan)), /Ersatz-Worker-Testfehler/);
  const reopened = await r.service().preview({ revision: r.first.revision });
  assert.equal(reopened.state, "building"); assert.equal(reopened.revision, plan.revision);
  const result = await r.service().stage(r.replacementRequest(plan));
  assert.equal(result.jobId, calls[0]); assert.deepEqual(await r.hashes(), hashes); assert.deepEqual(await r.f.fingerprints(), initial);
});

test("eigene Änderungen veralten Ersatzfreigabe und Vorschau vor der Aufbewahrung", async (t) => {
  const r = await replacementFixture(t), plan = await r.service().preview({ revision: r.first.revision });
  await json(r.f.options.correctionsPath, { entries: [], changed: true });
  await assert.rejects(r.service().stage(r.replacementRequest(plan)), /veraltet|verändert/);
  await assert.rejects(r.service().preview({ revision: r.first.revision }), /verändert/);
  await assert.rejects(fs.stat(plan.retainedCandidateDirectory), { code: "ENOENT" });
});

test("wirklicher lokaler Eingangsleser fügt kein gleichnamiges fremdes CoL-Reich hinzu", async (t) => {
  const f = await fixture(t, { stableName: "Ciconia ciconia", stableKingdom: "Bacteria" });
  await importTaxonomyPrototype({ fixtureDirectory: path.resolve("scripts/fixtures/taxonomy/col-xr-2026-07-17"),
    taxonomyRoot: f.options.taxonomyRoot, now: () => new Date(NOW) });
  const preview = await f.service().preview(), initial = await f.fingerprints();
  const result = await createSourceRecoveryCandidateService(f.options, { now: () => new Date("2026-09-30T11:00:00Z"),
    runJob: (value) => executeMasterJob(value) }).stage(f.request(preview));
  const db = new DatabaseSync(taxonomyMasterDatabasePath(f.options.taxonomyRoot, "staging"), { readOnly: true });
  try {
    const rows = db.prepare("SELECT master_taxon_id,kingdom FROM master_taxon WHERE canonical_scientific_name='Ciconia ciconia'").all();
    assert.equal(rows.length, 1); assert.equal(rows[0].kingdom, "Bacteria");
    assert.equal(rows[0].master_taxon_id, createStableMasterTaxonId(f.before[2]));
  } finally { db.close(); }
  assert.equal(result.restoredCount, 2); assert.deepEqual(await f.fingerprints(), initial);
});

test("Ersatzplan verweigert fremden Auftrag, Quellenwechsel und unbekannten Aufbewahrungsordner", async (t) => {
  const r = await replacementFixture(t), plan = await r.service().preview({ revision: r.first.revision });
  const currentFile = path.join(masterJobsDirectory(r.f.options.taxonomyRoot), "current.json"), originalCurrent = await read(currentFile);
  await json(currentFile, { ...originalCurrent, id: `job-${crypto.randomUUID()}` });
  await assert.rejects(r.service().stage(r.replacementRequest(plan)), /Altauftrag|fremder/);
  await json(currentFile, originalCurrent);
  await fs.mkdir(plan.retainedCandidateDirectory, { recursive: true });
  await json(path.join(plan.retainedCandidateDirectory, "foreign.json"), { keep: true });
  await assert.rejects(r.service().stage(r.replacementRequest(plan)), /unbekannt belegt/);
  assert.deepEqual(await read(path.join(plan.retainedCandidateDirectory, "foreign.json")), { keep: true });
  await r.f.source("snapshot-next", r.f.after, "2026-10-01T00:00:00Z");
  await assert.rejects(r.service().preview({ revision: r.first.revision }), /nicht mehr der aktuelle/);
});

test("Fehler nach Aufbewahrung vor Auftragssicherung erhält Altstand und gibt Sperren frei", async (t) => {
  const r = await replacementFixture(t), plan = await r.service().preview({ revision: r.first.revision });
  const hashes = await r.hashes();
  await assert.rejects(r.service({ readBuildInputs: async () => { throw new Error("Test-Eingangsfehler"); } }).stage(r.replacementRequest(plan)), /Test-Eingangsfehler/);
  assert.equal((await r.service().preview({ revision: r.first.revision })).state, "reserved");
  assert.deepEqual(await r.hashes(), hashes);
  const result = await r.service().stage(r.replacementRequest(plan));
  assert.equal(result.ready, true); assert.deepEqual(await r.hashes(), hashes);
});

test("CLI trennt lesende Ersatzvorschau und frisch bestätigten Ersatzkandidaten", () => {
  const base = [...cliFixtureArgs(), `--revision=${"a".repeat(64)}`];
  assert.equal(parseSourceRecoveryArgs(["replacement-preview", ...base]).command, "replacement-preview");
  assert.throws(() => parseSourceRecoveryArgs(["replacement-preview", ...base, "--confirm"]), /lesend/);
  assert.throws(() => parseSourceRecoveryArgs(["replacement-candidate", ...base, "--confirm", CLI_DECISIONS]), /plan-revision/);
  const plan = `--plan-revision=${"b".repeat(64)}`;
  const parsed = parseSourceRecoveryArgs(["replacement-candidate", ...base, "--confirm", CLI_DECISIONS, plan]);
  assert.equal(parsed.planRevision, "b".repeat(64));
  assert.equal(parsed.decisionsFile, path.join(CLI_FIXTURE_ROOT, "decisions.json"));
  assert.throws(() => parseSourceRecoveryArgs(["replacement-candidate", ...base, CLI_DECISIONS, plan]), /confirm/);
  assert.throws(() => parseSourceRecoveryArgs(["replacement-candidate", ...base, "--confirm", "--replacement-decisions=decisions.json", plan]), /absolute/);
});

test("Paarvorbereitung prüft kopierten engen Kandidaten gegen den richtigen Ausgangsmaster", async (t) => {
  const f = await fixture(t), preview = await f.service().preview(), initial = await f.fingerprints();
  const result = await candidateService(f).stage(f.request(preview));
  const prepared = await prepareTaxonomyPublication({ ...f.options, id: `publication-${crypto.randomUUID()}` });
  assert.equal(prepared.result.masterVersion, result.candidateId);
  assert.deepEqual(await f.fingerprints(), initial, "nur Testvorbereitung, kein Zeigerwechsel");
});

async function failedReplacementFixture(t) {
  const r = await replacementFixture(t), plan = await r.service().preview({ revision: r.first.revision });
  await assert.rejects(r.service({ runJob: (value) => executeMasterJob({ ...value,
    onProgress: (event) => { if (event.phase === "Konfliktdaten übernehmen") throw new Error("Test-Konfliktfehler"); } })
  }).stage(r.replacementRequest(plan)), /Test-Konfliktfehler/);
  const current = await new MasterRunController(r.f.options.taxonomyRoot).current();
  const failedDirectory = masterJobDirectory(r.f.options.taxonomyRoot, current.id);
  const failedJournal = path.join(r.f.options.taxonomyRoot, "master/source-recovery/replacements", `recovery-${r.first.revision}.json`);
  const files = [failedJournal, ...await fs.readdir(failedDirectory).then((names) => names.filter((name) => name.endsWith(".json") || name.endsWith(".jsonl")).map((name) => path.join(failedDirectory, name))),
    path.join(failedDirectory, "candidate/taxonomy-master.sqlite")];
  const failedHashes = () => Promise.all(files.map(async (file) => [file, await sha256File(file)]));
  const restartRequest = { revision: r.first.revision, failedPlanRevision: plan.revision };
  return { ...r, failedPlan: plan, failedJobId: current.id, failedDirectory, failedHashes, restartRequest };
}

test("Neustartvorschau ist lesend; neuer Worker erhält alten Fehlerauftrag, Quellen und beide Paare", async (t) => {
  const r = await failedReplacementFixture(t), initial = await r.f.fingerprints(), hashes = await r.failedHashes(), oldHashes = await r.hashes();
  const plan = await r.service().preview(r.restartRequest);
  assert.notEqual(plan.revision, r.failedPlan.revision); assert.equal(plan.restoredCount, 2);
  assert.equal(plan.restart.failedJobId, r.failedJobId); assert.equal(plan.historicalReplacementCount, 1);
  assert.deepEqual(await r.failedHashes(), hashes);
  const request = { ...r.replacementRequest(plan), ...r.restartRequest };
  await assert.rejects(r.service().stage({ ...request, confirmed: false }), /ausdrückliche/);
  await assert.rejects(r.service().stage({ ...request, planRevision: r.failedPlan.revision }), /veraltet/);
  const result = await r.service({ runJob: startMasterJobProcess }).stage(request);
  assert.equal(result.ready, true); assert.notEqual(result.jobId, r.failedJobId); assert.notEqual(result.jobId, r.oldResult.jobId);
  assert.equal(result.activatesDatabase, false); assert.equal(result.requiresActivationConfirmation, true);
  assert.deepEqual(await r.failedHashes(), hashes); assert.deepEqual(await r.hashes(), oldHashes); assert.deepEqual(await r.f.fingerprints(), initial);
  assert.equal((await r.service().preview(r.restartRequest)).state, "ready");
  assert.equal((await r.service().stage(request)).jobId, result.jobId, "Wiederholung erzeugt keinen weiteren Auftrag");
  await new MasterRunController(r.f.options.taxonomyRoot).assertReadyForActivation();
});

test("Neustart nach Eingangsfehler, Abbruch und erneutem Workerfehler bleibt mit gleichem neuen Auftrag wiederholbar", async (t) => {
  const r = await failedReplacementFixture(t), plan = await r.service().preview(r.restartRequest), hashes = await r.failedHashes();
  const request = { ...r.replacementRequest(plan), ...r.restartRequest }, cancel = new AbortController();
  await assert.rejects(r.service({ beforeRetain: async () => cancel.abort() }).stage({ ...request, signal: cancel.signal }), { name: "AbortError" });
  assert.equal((await r.service().preview(r.restartRequest)).jobId, undefined);
  await assert.rejects(r.service({ readBuildInputs: async () => { throw new Error("Test-Neustarteingang"); } }).stage(request), /Test-Neustarteingang/);
  assert.equal((await r.service().preview(r.restartRequest)).state, "reserved");
  const jobs = [];
  await assert.rejects(r.service({ runJob: (value) => { jobs.push(value.id); return executeMasterJob({ ...value,
    onProgress: (event) => { if (event.phase === "Konfliktdaten übernehmen") throw new Error("Test-Neustartworker"); } }); }
  }).stage(request), /Test-Neustartworker/);
  const reopened = await r.service().preview(r.restartRequest);
  assert.equal(reopened.jobId, jobs[0]);
  const result = await r.service().stage(request);
  assert.equal(result.jobId, jobs[0]); assert.equal(result.ready, true); assert.deepEqual(await r.failedHashes(), hashes);
});

test("Neustart verweigert Änderungen an Daten, Fehlernachweis, Freigabe und fremde Aufträge", async (t) => {
  const r = await failedReplacementFixture(t), plan = await r.service().preview(r.restartRequest);
  const request = { ...r.replacementRequest(plan), ...r.restartRequest };
  await assert.rejects(r.service().preview({ ...r.restartRequest, failedPlanRevision: "f".repeat(64) }), /nicht fehlgeschlagen/);
  await assert.rejects(r.service().stage({ ...request, replacementDecisions: [] }), /Ersatz-ID/);
  const stateFile = path.join(r.failedDirectory, "state.json"), state = await read(stateFile);
  await json(stateFile, { ...state, status: "building" });
  await assert.rejects(r.service().preview(r.restartRequest), /Fehlerstatus/);
  await json(stateFile, state);
  const currentFile = path.join(masterJobsDirectory(r.f.options.taxonomyRoot), "current.json"), current = await read(currentFile);
  await json(currentFile, { ...current, id: `job-${crypto.randomUUID()}` });
  await assert.rejects(r.service().stage(request), /fremder Auftrag/);
  await json(currentFile, current);
  const unlock = await acquireMasterJobLock(r.f.options.taxonomyRoot);
  try { await assert.rejects(r.service().preview(r.restartRequest), /noch aktiv/); await assert.rejects(r.service().stage(request), /noch aktiv/); }
  finally { unlock(); }
  await json(r.f.options.correctionsPath, { entries: [], changed: true });
  await assert.rejects(r.service().preview(r.restartRequest), /Produktive Daten/);
  await assert.rejects(r.service().stage(request), /Produktive Daten/);
});

test("CLI trennt Fehlerplan, frische Neustartfreigabe und lesende Vorschau", () => {
  const base = [...cliFixtureArgs(), `--revision=${"a".repeat(64)}`];
  const failed = `--failed-plan-revision=${"b".repeat(64)}`;
  assert.throws(() => parseSourceRecoveryArgs(["restart-preview", ...base]), /failed-plan-revision/);
  assert.throws(() => parseSourceRecoveryArgs(["replacement-preview", ...base, failed]), /ausschließlich zum Neustart/);
  assert.throws(() => parseSourceRecoveryArgs(["restart-preview", ...base, failed, "--confirm"]), /lesend/);
  assert.throws(() => parseSourceRecoveryArgs(["restart-candidate", ...base, failed]), /plan-revision/);
  assert.equal(parseSourceRecoveryArgs(["restart-preview", ...base, failed]).failedPlanRevision, "b".repeat(64));
  const plan = `--plan-revision=${"c".repeat(64)}`;
  const parsed = parseSourceRecoveryArgs(["restart-candidate", ...base, failed, "--confirm", CLI_DECISIONS, plan]);
  assert.equal(parsed.planRevision, "c".repeat(64));
  assert.equal(parsed.decisionsFile, path.join(CLI_FIXTURE_ROOT, "decisions.json"));
  assert.throws(() => parseSourceRecoveryArgs(["restart-candidate", ...base, failed, CLI_DECISIONS, plan]), /confirm/);
  assert.throws(() => parseSourceRecoveryArgs(["restart-candidate", ...base, failed, "--confirm", "--replacement-decisions=decisions.json", plan]), /absolute/);
});
