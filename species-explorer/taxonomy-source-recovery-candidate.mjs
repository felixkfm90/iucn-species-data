import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { checkedRecoveryOptions, inspectSourceRecovery, sourceRecoveryBinding, assertRecoveryPath } from "./taxonomy-source-recovery-reader.mjs";
import { createSourceRecoveryService, assertSourceRecoveryDecisions } from "./taxonomy-source-recovery.mjs";
import { recoveryDigest } from "./taxonomy-source-recovery-plan.mjs";
import { sourceRecoveryIdentityRegistry } from "./taxonomy-source-recovery-identities.mjs";
import { readIdentityRegistry, identityRegistryRevision } from "./taxonomy-identity-registry.mjs";
import { readIdentityReview } from "./taxonomy-identity-review.mjs";
import { readRetainedMasterTaxa } from "./taxonomy-master-source-binding.mjs";
import { taxonomyMasterServiceInternals as inputs } from "./taxonomy-master-service.mjs";
import { openTaxonomyStore } from "./taxonomy-store.mjs";
import { coverMasterInputSelection } from "./taxonomy-master-inputs.mjs";
import { canonicalSpeciesName } from "./taxonomy-taxon-quality.mjs";
import { providerSliceReleaseDirectory } from "./taxonomy-master-slices.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { MasterRunController } from "./taxonomy-master-run-controller.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { prepareMasterJob, masterJobsDirectory, masterJobDirectory, verifyMasterJob } from "./taxonomy-master-job.mjs";
import { startMasterJobProcess } from "./taxonomy-master-process.mjs";
import { inspectTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { sha256File } from "./lightroom-search-storage.mjs";
import { assertTaxonomySpace } from "./taxonomy-space-budget.mjs";
import { assertMasterTaxonIdsRetained } from "./taxonomy-master-continuity.mjs";
import { frozenRecoveryColInput, scopedRecoveryColRecords, assertRecoveryCandidateScope } from "./taxonomy-source-recovery-scope.mjs";

const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const optionalJson = async (file) => json(file).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function readScopedSourceRecoveryInputs(options, repairedSlice, onProgress, plan) {
  const projectTaxa = inputs.projectTaxaFromSpeciesList(await json(options.speciesListPath));
  const corrections = inputs.correctionsFromDocument(await json(options.correctionsPath));
  const retainedTaxa = await readRetainedMasterTaxa(options.taxonomyRoot);
  const allSlices = (await inputs.latestProviderSlices(options.taxonomyRoot))
    .map((slice) => slice.manifest.provider === "inaturalist" ? repairedSlice : slice);
  const providerSlices = inputs.activeMasterProviderSlices(allSlices);
  const names = [...new Set([...projectTaxa, ...corrections, ...retainedTaxa,
    ...providerSlices.flatMap((slice) => slice.records)].map((row) => canonicalSpeciesName(row.scientificName)).filter(Boolean))];
  const store = await openTaxonomyStore({ taxonomyRoot: options.taxonomyRoot });
  try {
    if (typeof store.status !== "function" || !store.status().available) throw new Error("Die lokale CoL-Referenz für den Reparaturkandidaten fehlt.");
    const colRelease = inputs.releaseFromStoreStatus(store.status());
    const frozen = await frozenRecoveryColInput(options.taxonomyRoot, colRelease.providerVersion);
    const covered = coverMasterInputSelection({ colRelease, colRecords: scopedRecoveryColRecords({
      frozen: frozen.records(), plan,
      repairRecords: inputs.streamColRecords(store, plan.rows.map((row) => row.scientificName),
        (event) => onProgress({ phase: "CoL-Reparaturfälle", ...event }), { providerSlices }),
    }), targetNames: names, providerSlices });
    return { colRelease, colRecords: covered.records(), buildInputCoverage: covered.coverage,
      projectTaxa, corrections, retainedTaxa, providerSlices, guardFiles: frozen.files, close: () => store.close() };
  } catch (error) { store.close?.(); throw error; }
}

export function createSourceRecoveryCandidateService(config, { now = () => new Date(),
  readBuildInputs = readScopedSourceRecoveryInputs, runJob = startMasterJobProcess, checkSpace = assertTaxonomySpace,
  beforeInstall = async () => {}, afterSourceInstall = async () => {} } = {}) {
  const options = checkedRecoveryOptions(config), root = options.taxonomyRoot;
  const controller = new MasterRunController(root);
  const draftService = createSourceRecoveryService(options, { now, checkSpace });
  const reviewFile = path.join(root, "master/identity-review.json");
  const currentFile = path.join(masterJobsDirectory(root), "current.json");
  const stagingFile = taxonomyMasterManifestPath(root, "staging");
  const transfers = path.join(root, "master/source-recovery/transfers");
  const draftPath = (revision) => {
    if (!/^[a-f0-9]{64}$/.test(revision || "")) throw new Error("Ungültige Reparaturrevision.");
    return path.join(root, "master/source-recovery/drafts", `recovery-${revision}`);
  };
  const transferPath = (revision) => path.join(transfers, `${path.basename(draftPath(revision))}.json`);

  async function writeTransfer(file, value) {
    await atomicWriteJson(file, { ...value, checksum: recoveryDigest(value) });
  }
  function checkTransfer(value, revision) {
    const { checksum, ...body } = value;
    const { revision: planRevision, canPrepare, requiresConfirmation, changesPhotos, activatesDatabase, ...planBody } = body.plan || {};
    if (checksum !== recoveryDigest(body) || body.schemaVersion !== 1 || body.kind !== "source-recovery-candidate"
        || body.revision !== revision || planRevision !== revision || recoveryDigest(planBody) !== revision
        || !canPrepare || !requiresConfirmation || changesPhotos || activatesDatabase
        || !same(body.plan.binding.options, options) || !Number.isFinite(Date.parse(body.timestamp))
        || !["building", "ready"].includes(body.state) || !body.jobId) throw new Error("Gespeicherter Reparaturauftrag ist ungültig.");
    masterJobDirectory(root, body.jobId);
    if (body.manifest.providerVersion !== `recovery-${revision.slice(0, 24)}`
        || body.manifest.metadata?.sourceRecoveryRevision !== revision
        || body.manifest.checksumSha256 !== body.recordsChecksum) throw new Error("Reparaturauftrag und neue Quellenherkunft widersprechen sich.");
    return body;
  }
  async function assertFresh(transfer, signal) {
    const repairedVersion = transfer.manifest.providerVersion;
    const binding = await sourceRecoveryBinding(options, { signal, allowedProviderVersion: repairedVersion });
    const base = transfer.plan.binding;
    const ignored = new Set([reviewFile, currentFile, stagingFile]);
    const derivative = providerSliceReleaseDirectory(root, "inaturalist", repairedVersion);
    await assertRecoveryPath(derivative);
    const originalFiles = base.files.filter(([file]) => !ignored.has(file));
    const currentFiles = binding.files.filter(([file]) => !ignored.has(file) && path.dirname(file) !== derivative);
    const versions = binding.sourceSelection.versions.map(([provider, version]) => [provider,
      provider === "inaturalist" && version === repairedVersion ? options.currentVersion : version]);
    if (!same(originalFiles, currentFiles) || !same(base.publication, binding.publication)
        || base.rulesRevision !== binding.rulesRevision || !same(base.sourceSelection, { ...binding.sourceSelection, versions })) {
      throw new Error("Quellen, aktive Datenbanken oder eigene Entscheidungen wurden geändert; Reparaturauftrag ist veraltet.");
    }
    for (const [file, expected] of base.files.filter(([file]) => ignored.has(file))) {
      let actual = null;
      try { actual = await sha256File(file, { signal }); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (actual === expected) continue;
      const document = await optionalJson(file);
      const allowed = file === currentFile ? document?.id === transfer.jobId
        : file === reviewFile ? same(document, transfer.review)
          : document?.buildJobRevision === transfer.jobRevision;
      if (!allowed) throw new Error("Ein anderer Auftrag, Kandidat oder eine Identitätsentscheidung hat den Reparaturstand ersetzt.");
    }
    for (const filename of ["records.json", "manifest.json", "plan.json"]) await assertRecoveryPath(path.join(draftPath(transfer.revision), filename));
    if (await sha256File(path.join(draftPath(transfer.revision), "records.json"), { signal }) !== transfer.recordsChecksum
        || !same(await json(path.join(draftPath(transfer.revision), "plan.json")), transfer.plan)) throw new Error("Gesicherter Reparaturentwurf wurde verändert.");
    const installed = await optionalJson(path.join(derivative, "manifest.json"));
    if (installed && (!same(installed, transfer.manifest)
        || await sha256File(path.join(derivative, "records.json"), { signal }) !== transfer.recordsChecksum)) throw new Error("Vorhandener Reparaturquellenstand ist verändert.");
  }
  async function installSource(transfer, signal) {
    const final = providerSliceReleaseDirectory(root, "inaturalist", transfer.manifest.providerVersion);
    await assertRecoveryPath(final);
    const existing = await optionalJson(path.join(final, "manifest.json"));
    if (existing) return; // assertFresh has checked the exact files first.
    await checkSpace(root, (await fs.stat(path.join(draftPath(transfer.revision), "records.json"))).size);
    await fs.mkdir(path.dirname(final), { recursive: true });
    const temporary = path.join(path.dirname(final), `.recovery-${crypto.randomUUID()}`);
    await fs.mkdir(temporary);
    let published = false;
    try {
      await fs.copyFile(path.join(draftPath(transfer.revision), "records.json"), path.join(temporary, "records.json"), fs.constants.COPYFILE_EXCL);
      await atomicWriteJson(path.join(temporary, "manifest.json"), transfer.manifest);
      signal?.throwIfAborted();
      await fs.rename(temporary, final); published = true;
    } finally {
      if (!published) { await assertRecoveryPath(temporary); await fs.rm(temporary, { recursive: true, force: true }); }
    }
  }
  async function checkCandidate(transfer) {
    const inspected = await inspectTaxonomyMasterCandidate(root);
    if (!inspected.available || inspected.manifest.buildJobRevision !== transfer.jobRevision) throw new Error("Der Reparaturkandidat fehlt oder gehört zu einem anderen Auftrag.");
    const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
    try {
      assertMasterTaxonIdsRetained({ previousPath: taxonomyMasterDatabasePath(root), currentDatabase: db, DatabaseSync });
      const lookup = db.prepare("SELECT lifecycle_state FROM master_taxon WHERE master_taxon_id=?");
      for (const row of transfer.plan.rows) {
        if (lookup.get(row.originalId)?.lifecycle_state !== "active"
            || (row.replacementId && lookup.get(row.replacementId)?.lifecycle_state !== "deprecated")) throw new Error("Eine bestätigte Alt-/Ersatz-ID fehlt im Reparaturkandidaten.");
      }
      if (inspected.manifest.identityContinuity?.missing !== 0
          || identityRegistryRevision(readIdentityRegistry(db)) !== transfer.review.revision) throw new Error("Kandidatenhistorie oder ID-Kontinuität widerspricht dem Reparaturplan.");
    } finally { db.close(); }
    assertRecoveryCandidateScope(root, transfer.plan);
    return inspected;
  }

  return {
    async stage({ confirmed, revision, replacementDecisions, signal, onProgress = () => {} } = {}) {
      if (confirmed !== true) throw new Error("Der lokale Reparaturkandidat muss ausdrücklich bestätigt werden.");
      const file = transferPath(revision);
      await assertRecoveryPath(file);
      let saved = await optionalJson(file);
      if (!saved) await draftService.prepare({ confirmed, revision, replacementDecisions, signal });
      for (const lock of ["control", "execution"]) await assertRecoveryPath(path.join(masterJobsDirectory(root), `${lock}-lock.sqlite`));
      await assertRecoveryPath(path.join(path.dirname(root), "corrections/edit-lock.sqlite"));
      return controller.exclusive(() => withTaxonomyCorrectionLock(root, async () => {
        signal?.throwIfAborted();
        await assertRecoveryPath(transfers);
        saved = await optionalJson(file);
        let transfer;
        if (saved) transfer = checkTransfer(saved, revision);
        else {
          await draftService.inspect({ revision, signal });
          const state = await inspectSourceRecovery(options, { signal });
          if (state.plan.revision !== revision) throw new Error("Bestätigte Reparaturrevision ist veraltet; Vorschau erneut prüfen.");
          const existingCandidate = await inspectTaxonomyMasterCandidate(root, { validate: false });
          if (existingCandidate.available) throw new Error("Es gibt bereits einen ungeklärten Kandidaten. Er wird nicht überschrieben.");
          const active = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
          let registry;
          try { registry = readIdentityRegistry(active); } finally { active.close(); }
          const pending = await readIdentityReview(root);
          if (pending && pending.revision !== identityRegistryRevision(registry)) throw new Error("Offene Identitätsentscheidungen zuerst abschließen; sie werden nicht überschrieben.");
          const draft = await json(path.join(draftPath(revision), "manifest.json"));
          const timestamp = now().toISOString();
          if (Date.parse(timestamp) <= Date.parse(state.current.manifest.retrievedAt)) throw new Error("Der Reparaturzeitpunkt muss nach dem aktuellen Quellenstand liegen.");
          const records = await json(path.join(draftPath(revision), "records.json"));
          const manifest = { ...state.current.manifest, providerVersion: draft.proposedProviderVersion,
            retrievedAt: timestamp, previousVersion: options.currentVersion, checksumSha256: draft.checksumSha256,
            activeRecordCount: records.filter((row) => row.versionChangeState !== "removed").length,
            metadata: { ...state.current.manifest.metadata, sourceRecoveryRevision: revision,
              locallyRepairedAt: timestamp, sourceRetrievedAt: state.current.manifest.retrievedAt,
              sourceRecoveryPolicy: state.plan.replacementPolicy } };
          const values = await readBuildInputs(options, { manifest, records }, onProgress, state.plan);
          try {
            const releases = [{ ...values.colRelease, provider: "catalogue-of-life" }, ...values.providerSlices.map((slice) => ({
              ...slice.manifest, releaseId: `${slice.manifest.provider}-${slice.manifest.providerVersion}` }))];
            const identityRegistry = sourceRecoveryIdentityRegistry({ plan: state.plan, registry,
              repairedVersion: manifest.providerVersion, releases, projectTaxa: values.projectTaxa, corrections: values.corrections, timestamp });
            const ignored = new Set([reviewFile, currentFile, stagingFile]);
            const guardFiles = [...state.plan.binding.files.filter(([name]) => !ignored.has(name)).map(([name]) => name),
              ...["records.json", "manifest.json", "plan.json"].map((name) => path.join(draftPath(revision), name)), ...(values.guardFiles || [])];
            const job = await prepareMasterJob({ taxonomyRoot: root, ...values, identityRegistry, guardFiles,
              sourceRecoveryScope: state.plan.rows.map(({ originalId, replacementId }) => ({ originalId, replacementId })),
              now: () => new Date(timestamp), onProgress: (event) => { signal?.throwIfAborted(); onProgress(event); }, checkSpace });
            const recipe = await json(path.join(job.directory, "recipe.json"));
            transfer = { schemaVersion: 1, kind: "source-recovery-candidate", state: "building", revision,
              plan: state.plan, timestamp, manifest, recordsChecksum: draft.checksumSha256, jobId: job.id,
              jobRevision: recipe.revision, review: { schemaVersion: 1, registry: identityRegistry,
                revision: identityRegistryRevision(identityRegistry), sourceRecoveryRevision: revision, confirmedAt: timestamp } };
            await assertFresh(transfer, signal);
            await fs.mkdir(transfers, { recursive: true }); await writeTransfer(file, transfer);
          } finally { await values.close?.(); }
        }
        assertSourceRecoveryDecisions(transfer.plan, replacementDecisions);
        await assertFresh(transfer, signal);
        const recipe = await json(path.join(masterJobDirectory(root, transfer.jobId), "recipe.json"));
        if (recipe.revision !== transfer.jobRevision || identityRegistryRevision(recipe.options.identityRegistry) !== transfer.review.revision) throw new Error("Gesicherter Aufbau gehört nicht zum Reparaturauftrag.");
        await verifyMasterJob(root, recipe);
        if (transfer.state !== "ready") {
          await atomicWriteJson(currentFile, { schemaVersion: 1, id: transfer.jobId, startedAt: transfer.timestamp, warnings: [] });
          await runJob({ taxonomyRoot: root, id: transfer.jobId, resume: true,
            onProgress: (event) => { signal?.throwIfAborted(); onProgress(event); } });
        }
        const candidate = await checkCandidate(transfer);
        await assertFresh(transfer, signal); await beforeInstall(); signal?.throwIfAborted();
        await assertFresh(transfer, signal);
        await installSource(transfer, signal);
        await afterSourceInstall();
        await atomicWriteJson(reviewFile, transfer.review);
        await assertFresh(transfer, signal);
        transfer = { ...transfer, state: "ready" }; await writeTransfer(file, transfer);
        return { ready: true, changesPhotos: false, activatesDatabase: false, revision, jobId: transfer.jobId,
          candidateId: candidate.manifest.candidateId, restoredCount: transfer.plan.rows.length,
          historicalReplacementCount: transfer.plan.rows.filter((row) => row.replacementId).length,
          blockingConflictCount: candidate.blockingConflictCount, requiresActivationConfirmation: true };
      }));
    },
  };
}
