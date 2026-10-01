import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { checkedRecoveryOptions, sourceRecoveryBinding, assertRecoveryPath } from "./taxonomy-source-recovery-reader.mjs";
import { recoveryDigest } from "./taxonomy-source-recovery-plan.mjs";
import { assertSourceRecoveryDecisions } from "./taxonomy-source-recovery.mjs";
import { readScopedSourceRecoveryInputs } from "./taxonomy-source-recovery-candidate.mjs";
import { assertRecoveryCandidateScope, frozenRecoveryColInput } from "./taxonomy-source-recovery-scope.mjs";
import { MasterRunController } from "./taxonomy-master-run-controller.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { masterJobsDirectory, masterJobDirectory, prepareMasterJob, verifyMasterJob } from "./taxonomy-master-job.mjs";
import { startMasterJobProcess } from "./taxonomy-master-process.mjs";
import { inspectTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { providerSliceReleaseDirectory } from "./taxonomy-master-slices.mjs";
import { readIdentityRegistry, identityRegistryRevision } from "./taxonomy-identity-registry.mjs";
import { assertMasterTaxonIdsRetained } from "./taxonomy-master-continuity.mjs";
import { sha256File } from "./lightroom-search-storage.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { assertTaxonomySpace, taxonomyDirectoryBytes } from "./taxonomy-space-budget.mjs";

const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const optional = (file) => json(file).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const revisionPattern = /^[a-f0-9]{64}$/;
async function fingerprint(file, signal) {
  signal?.throwIfAborted(); await assertRecoveryPath(file);
  try { return await sha256File(file, { signal }); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function treeFiles(directory) {
  await assertRecoveryPath(directory);
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name); await assertRecoveryPath(name);
    if (entry.isDirectory()) files.push(...await treeFiles(name));
    else if (entry.isFile()) files.push(name);
    else throw new Error("Unbekannter Dateityp im zu erhaltenden Reparaturstand.");
  }
  return files.sort();
}

// A new, explicitly confirmed plan, not a rehash of the old executable recipe.
// Reuses only the already installed derivative source and unchanged four events.
export function createSourceRecoveryReplacementService(config, { now = () => new Date(),
  readBuildInputs = readScopedSourceRecoveryInputs, runJob = startMasterJobProcess,
  checkSpace = assertTaxonomySpace, beforeRetain = async () => {} } = {}) {
  const options = checkedRecoveryOptions(config), root = options.taxonomyRoot;
  const controller = new MasterRunController(root);
  const recoveryRoot = path.join(root, "master/source-recovery");
  const staging = path.dirname(taxonomyMasterManifestPath(root, "staging"));
  const currentFile = path.join(masterJobsDirectory(root), "current.json");
  const reviewFile = path.join(root, "master/identity-review.json");
  const dynamic = new Set([currentFile, taxonomyMasterManifestPath(root, "staging")]);
  const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
  const locations = (revision, failedPlanRevision) => {
    if (!revisionPattern.test(revision || "")) throw new Error("Ungültige ursprüngliche Reparaturrevision.");
    if (failedPlanRevision !== undefined && !revisionPattern.test(failedPlanRevision)) throw new Error("Ungültige fehlgeschlagene Planrevision.");
    return { oldTransfer: path.join(recoveryRoot, "transfers", `recovery-${revision}.json`),
      draft: path.join(recoveryRoot, "drafts", `recovery-${revision}`),
      journal: failedPlanRevision
        ? path.join(recoveryRoot, "restarts", `recovery-${revision}`, `after-${failedPlanRevision}.json`)
        : path.join(recoveryRoot, "replacements", `recovery-${revision}.json`),
      retained: path.join(recoveryRoot, "retained-candidates", `recovery-${revision}`) };
  };
  function checkedOld(document, revision) {
    const { checksum, ...value } = document;
    const { revision: planRevision, canPrepare, requiresConfirmation, changesPhotos, activatesDatabase, ...body } = value.plan || {};
    if (checksum !== recoveryDigest(value) || value.kind !== "source-recovery-candidate" || value.schemaVersion !== 1
        || value.revision !== revision || value.state !== "ready" || planRevision !== revision || recoveryDigest(body) !== revision
        || !canPrepare || !requiresConfirmation || changesPhotos || activatesDatabase || !same(value.plan.binding.options, options)
        || value.manifest?.metadata?.sourceRecoveryRevision !== revision || value.recordsChecksum !== value.manifest.checksumSha256
        || value.manifest.providerVersion !== `recovery-${revision.slice(0, 24)}`) throw new Error("Ursprünglicher fertiger Reparaturauftrag ist ungültig.");
    masterJobDirectory(root, value.jobId);
    return value;
  }
  function checkedJournal(document, revision) {
    const { checksum, ...value } = document;
    const { revision: planRevision, ...body } = value.plan || {};
    if (checksum !== recoveryDigest(value) || value.schemaVersion !== 1 || value.kind !== "scoped-source-recovery-replacement"
        || value.originalRevision !== revision || planRevision !== recoveryDigest(body)
        || !["reserved", "building", "ready"].includes(value.state) || !same(value.plan.binding.options, options)) throw new Error("Ersatzauftrag ist ungültig.");
    if (value.jobId) masterJobDirectory(root, value.jobId);
    return value;
  }
  const save = (file, body) => atomicWriteJson(file, { ...body, checksum: recoveryDigest(body) });

  async function assertPlanFresh(plan, saved, signal) {
    const old = checkedOld(await json(locations(plan.originalRevision).oldTransfer), plan.originalRevision);
    const currentBinding = await sourceRecoveryBinding(options, { signal, allowedProviderVersion: old.manifest.providerVersion });
    const stable = (binding) => ({ ...binding, files: binding.files.filter(([file]) => !dynamic.has(file)) });
    if (!same(stable(currentBinding), stable(plan.binding))) throw new Error("Ersatzvorschau ist veraltet; Eingangsstand oder Aufbauregeln wurden geändert.");
    for (const [file, hash] of plan.files) {
      const relative = path.relative(staging, file);
      const wasStaging = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
      const candidateFile = wasStaging && (saved || plan.restart) ? path.join(locations(plan.originalRevision).retained, relative) : file;
      const located = await fingerprint(candidateFile, signal);
      // Reserved but not moved yet is an explicit recoverable state.
      if (located !== hash && !(wasStaging && saved?.state === "reserved" && located === null && await fingerprint(file, signal) === hash)) {
        throw new Error("Gesicherter Alt-Kandidat, Auftrag oder Quellenbeleg wurde verändert.");
      }
    }
    const retainedManifest = await optional(path.join(locations(plan.originalRevision).retained, "manifest.json"));
    const directory = retainedManifest ? locations(plan.originalRevision).retained : staging;
    const expectedFiles = plan.files.map(([file]) => path.relative(staging, file))
      .filter((relative) => relative && !relative.startsWith("..") && !path.isAbsolute(relative)).sort();
    if (retainedManifest || !saved?.jobId) {
      const actualFiles = (await treeFiles(directory)).map((file) => path.relative(directory, file)).sort();
      if (!same(actualFiles, expectedFiles)) throw new Error("Alt-Kandidat enthält zusätzliche oder fehlende Dateien.");
    }
    const current = await optional(currentFile), candidate = await optional(taxonomyMasterManifestPath(root, "staging"));
    if (!same(current, plan.oldCurrent) && !(saved?.jobId && current?.id === saved.jobId)) throw new Error("Ein fremder Aufbau hat den aktuellen Auftrag ersetzt.");
    if (candidate && !same(candidate, plan.oldCandidate)
        && !(saved?.jobRevision && candidate.buildJobRevision === saved.jobRevision)) throw new Error("Ein fremder Kandidat wird nicht überschrieben.");
    if (!candidate && !saved && !plan.restart) throw new Error("Der bestätigte Alt-Kandidat fehlt.");
    return old;
  }

  // A failed immutable recipe is evidence, not a resumable recipe under new rules.
  // Keep its journal and every job file; bind a separately confirmed new attempt.
  async function restartSnapshot({ revision, failedPlanRevision, signal } = {}) {
    if (!revisionPattern.test(failedPlanRevision || "")) throw new Error("Fehlgeschlagene Planrevision für Neustart fehlt.");
    const location = locations(revision, failedPlanRevision);
    for (const file of Object.values(location)) await assertRecoveryPath(file);
    const existing = await optional(location.journal);
    if (existing) {
      const saved = checkedJournal(existing, revision);
      if (saved.plan.restart?.failedPlanRevision !== failedPlanRevision) throw new Error("Neustartjournal gehört zu einem anderen Fehlerstand.");
      await assertPlanFresh(saved.plan, saved, signal);
      return { ...saved.plan, state: saved.state, jobId: saved.jobId || null };
    }
    const failedJournalFile = locations(revision).journal;
    const failed = checkedJournal(await json(failedJournalFile), revision);
    if (failed.plan.revision !== failedPlanRevision || failed.state !== "building" || !failed.jobId) throw new Error("Der gebundene Ersatzlauf ist nicht fehlgeschlagen.");
    const jobDirectory = masterJobDirectory(root, failed.jobId);
    const state = await json(path.join(jobDirectory, "state.json"));
    const recipe = await json(path.join(jobDirectory, "recipe.json"));
    if (state.status !== "failed" || recipe.id !== failed.jobId || recipe.revision !== failed.jobRevision
        || recipe.revision !== recoveryDigest({ ...recipe, revision: undefined })) throw new Error("Fehlerstatus und unveränderlicher Altauftrag widersprechen sich.");
    if (await optional(taxonomyMasterManifestPath(root, "staging"))) throw new Error("Ein vorhandener Kandidat wird durch den Neustart nicht überschrieben.");
    const current = await json(currentFile);
    if (current.id !== failed.jobId) throw new Error("Ein fremder Auftrag hat den Fehlerstand ersetzt.");
    const old = checkedOld(await json(location.oldTransfer), revision);
    const binding = await sourceRecoveryBinding(options, { signal, allowedProviderVersion: old.manifest.providerVersion });
    const stableData = (value) => ({ ...value, rulesRevision: undefined,
      files: value.files.filter(([file]) => !dynamic.has(file) && !(path.dirname(file) === moduleRoot && file.endsWith(".mjs"))) });
    if (!same(stableData(binding), stableData(failed.plan.binding))) throw new Error("Produktive Daten seit dem fehlgeschlagenen Plan verändert; Neustartumfang muss neu geprüft werden.");
    if (identityRegistryRevision(recipe.options?.identityRegistry) !== old.review.revision
        || !same(recipe.options?.sourceRecoveryScope, old.plan.rows.map(({ originalId, replacementId }) => ({ originalId, replacementId })))) {
      throw new Error("Fehlgeschlagener Auftrag gehört nicht zu den ursprünglichen Reparaturfällen.");
    }
    const files = [];
    for (const [file, hash] of failed.plan.files) {
      const relative = path.relative(staging, file);
      const located = relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? path.join(location.retained, relative) : file;
      if (await fingerprint(located, signal) !== hash) throw new Error("Gesicherter Alt-Kandidat, Auftrag oder Quellenbeleg wurde verändert.");
      files.push([file, hash]);
    }
    for (const file of [failedJournalFile, ...await treeFiles(jobDirectory)]) files.push([file, await fingerprint(file, signal)]);
    const { revision: ignored, state: ignoredState, jobId: ignoredJob, ...previousBody } = failed.plan;
    const body = { ...previousBody, binding, files, oldCurrent: current, oldCandidate: null,
      restart: { failedPlanRevision, failedJobId: failed.jobId, failedJobRevision: failed.jobRevision, failedJournalFile } };
    const plan = { ...body, revision: recoveryDigest(body) };
    await assertPlanFresh(plan, null, signal);
    return plan;
  }

  async function previewSnapshot({ revision, signal } = {}) {
    const location = locations(revision);
    for (const file of Object.values(location)) await assertRecoveryPath(file);
    const existing = await optional(location.journal);
    if (existing) {
      const saved = checkedJournal(existing, revision); await assertPlanFresh(saved.plan, saved, signal);
      return { ...saved.plan, state: saved.state, jobId: saved.jobId || null };
    }
    const old = checkedOld(await json(location.oldTransfer), revision);
    const binding = await sourceRecoveryBinding(options, { signal, allowedProviderVersion: old.manifest.providerVersion });
    const oldBinding = old.plan.binding;
    const originalFiles = oldBinding.files.filter(([file]) => !dynamic.has(file) && file !== reviewFile
      && !(path.dirname(file) === moduleRoot && file.endsWith(".mjs")));
    const hashes = new Map(binding.files);
    if (!same(binding.publication, oldBinding.publication) || binding.sourceSelection.reference !== oldBinding.sourceSelection.reference
        || binding.sourceSelection.retainedRevision !== oldBinding.sourceSelection.retainedRevision
        || !same(binding.sourceSelection.versions.map(([provider, version]) => [provider,
          provider === "inaturalist" && version === old.manifest.providerVersion ? options.currentVersion : version]), oldBinding.sourceSelection.versions)
        || originalFiles.some(([file, hash]) => hashes.get(file) !== hash)) throw new Error("Daten oder Entscheidungen seit der ursprünglichen Reparatur verändert; neuer Umfang muss geprüft werden.");
    const derivative = providerSliceReleaseDirectory(root, "inaturalist", old.manifest.providerVersion);
    if (!same(await json(path.join(derivative, "manifest.json")), old.manifest)
        || await fingerprint(path.join(derivative, "records.json"), signal) !== old.recordsChecksum
        || !same(await json(reviewFile), old.review) || !same(await json(path.join(location.draft, "plan.json")), old.plan)
        || await fingerprint(path.join(location.draft, "records.json"), signal) !== old.recordsChecksum) {
      throw new Error("Reparierte Quelle, Entwurf oder Historienvormerkung fehlt oder ist verändert.");
    }
    const oldCurrent = await json(currentFile), oldCandidate = await json(taxonomyMasterManifestPath(root, "staging"));
    if (oldCurrent.id !== old.jobId || oldCandidate.buildJobRevision !== old.jobRevision) throw new Error("Altauftrag und vorhandener Kandidat gehören nicht zusammen.");
    const oldRecipe = await json(path.join(masterJobDirectory(root, old.jobId), "recipe.json"));
    if (oldRecipe.schemaVersion !== 1 || oldRecipe.id !== old.jobId || oldRecipe.revision !== old.jobRevision
        || oldRecipe.revision !== recoveryDigest({ ...oldRecipe, revision: undefined })
        || identityRegistryRevision(oldRecipe.options?.identityRegistry) !== old.review.revision) throw new Error("Altauftrag oder seine Historienbindung ist verändert.");
    const frozen = await frozenRecoveryColInput(root, binding.sourceSelection.reference);
    const files = [...new Set([location.oldTransfer, ...["records.json", "manifest.json", "plan.json"].map((name) => path.join(location.draft, name)),
      ...await treeFiles(staging), ...await treeFiles(masterJobDirectory(root, old.jobId)), ...frozen.files])].sort();
    const body = { schemaVersion: 1, kind: "scoped-source-recovery-replacement-plan", originalRevision: revision, binding,
      oldCurrent, oldCandidate, repairedVersion: old.manifest.providerVersion, files: [],
      restoredCount: old.plan.rows.length, historicalReplacementCount: old.plan.rows.filter((row) => row.replacementId).length,
      retainedCandidateDirectory: location.retained, requiresConfirmation: true, changesPhotos: false, activatesDatabase: false };
    for (const file of files) body.files.push([file, await fingerprint(file, signal)]);
    const plan = { ...body, revision: recoveryDigest(body) };
    await assertPlanFresh(plan, null, signal);
    return plan;
  }

  return { async preview(request) {
    if (controller.isActive()) throw new Error("Ein Datenbank-Hintergrundlauf ist noch aktiv.");
    return request?.failedPlanRevision ? restartSnapshot(request) : previewSnapshot(request);
  }, async stage({ confirmed, revision, planRevision, failedPlanRevision, replacementDecisions, signal, onProgress = () => {} } = {}) {
    if (confirmed !== true || !revisionPattern.test(planRevision || "")) throw new Error("Neuer Ersatzplan benötigt ausdrückliche Bestätigung und seine frische Planrevision.");
    const location = locations(revision, failedPlanRevision);
    for (const file of [...Object.values(location), ...["control", "execution"].map((kind) => path.join(masterJobsDirectory(root), `${kind}-lock.sqlite`)),
      path.join(path.dirname(root), "corrections/edit-lock.sqlite")]) await assertRecoveryPath(file);
    return controller.exclusive(() => withTaxonomyCorrectionLock(root, async () => {
      let saved;
      const document = await optional(location.journal);
      if (document) {
        saved = checkedJournal(document, revision);
        if ((saved.plan.restart?.failedPlanRevision || undefined) !== failedPlanRevision) throw new Error("Neustartjournal gehört zu einem anderen Fehlerstand.");
      }
      else {
        const plan = failedPlanRevision ? await restartSnapshot({ revision, failedPlanRevision, signal }) : await previewSnapshot({ revision, signal });
        saved = { schemaVersion: 1, kind: "scoped-source-recovery-replacement", originalRevision: revision,
          state: "reserved", plan, timestamp: now().toISOString() };
      }
      if (saved.plan.revision !== planRevision) throw new Error("Bestätigte Ersatzvorschau ist veraltet.");
      const old = await assertPlanFresh(saved.plan, document ? saved : null, signal);
      assertSourceRecoveryDecisions(old.plan, replacementDecisions);
      await checkSpace(root, 2 * await taxonomyDirectoryBytes(failedPlanRevision ? taxonomyMasterDatabasePath(root) : staging));
      await beforeRetain(); signal?.throwIfAborted(); await assertPlanFresh(saved.plan, document ? saved : null, signal);
      if (!document) { await fs.mkdir(path.dirname(location.journal), { recursive: true }); await save(location.journal, saved); }
      const retained = await optional(path.join(location.retained, "manifest.json"));
      if (!retained) {
        const exists = await fs.lstat(location.retained).then(() => true).catch((error) => { if (error.code === "ENOENT") return false; throw error; });
        if (exists) throw new Error("Der Aufbewahrungsordner ist bereits unbekannt belegt; nichts wird überschrieben.");
        await fs.mkdir(path.dirname(location.retained), { recursive: true });
        await fs.rename(staging, location.retained); // recoverable, exact target from the confirmed plan
      }
      await assertPlanFresh(saved.plan, saved, signal);
      if (!saved.jobId) {
        const records = await json(path.join(providerSliceReleaseDirectory(root, "inaturalist", old.manifest.providerVersion), "records.json"));
        const values = await readBuildInputs(options, { manifest: old.manifest, records }, onProgress, old.plan);
        try {
          const guardFiles = [...saved.plan.binding.files.filter(([file]) => !dynamic.has(file)).map(([file]) => file),
            ...saved.plan.files.map(([file]) => {
              const relative = path.relative(staging, file);
              return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? path.join(location.retained, relative) : file;
            }), ...(values.guardFiles || [])];
          const job = await prepareMasterJob({ taxonomyRoot: root, ...values, guardFiles, identityRegistry: old.review.registry,
            sourceRecoveryScope: old.plan.rows.map(({ originalId, replacementId }) => ({ originalId, replacementId })),
            now: () => new Date(saved.timestamp), checkSpace,
            onProgress: (event) => { signal?.throwIfAborted(); onProgress(event); } });
          const recipe = await json(path.join(job.directory, "recipe.json"));
          saved = { ...saved, state: "building", jobId: job.id, jobRevision: recipe.revision };
          await save(location.journal, saved);
        } finally { await values.close?.(); }
      }
      await assertPlanFresh(saved.plan, saved, signal);
      const recipe = await json(path.join(masterJobDirectory(root, saved.jobId), "recipe.json"));
      if (recipe.revision !== saved.jobRevision || identityRegistryRevision(recipe.options.identityRegistry) !== old.review.revision) throw new Error("Ersatzauftrag und bestätigte Historie widersprechen sich.");
      await verifyMasterJob(root, recipe);
      await atomicWriteJson(currentFile, { schemaVersion: 1, id: saved.jobId, startedAt: saved.timestamp, warnings: [] });
      if (saved.state !== "ready") await runJob({ taxonomyRoot: root, id: saved.jobId, resume: true,
        onProgress: (event) => { signal?.throwIfAborted(); onProgress(event); } });
      const candidate = await inspectTaxonomyMasterCandidate(root);
      if (!candidate.available || candidate.manifest.buildJobRevision !== saved.jobRevision) throw new Error("Ersatzkandidat gehört nicht zum neuen Auftrag.");
      const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
      try {
        assertMasterTaxonIdsRetained({ previousPath: taxonomyMasterDatabasePath(root), currentDatabase: db, DatabaseSync });
        const lookup = db.prepare("SELECT lifecycle_state FROM master_taxon WHERE master_taxon_id=?");
        for (const row of old.plan.rows) if (lookup.get(row.originalId)?.lifecycle_state !== "active"
            || row.replacementId && lookup.get(row.replacementId)?.lifecycle_state !== "deprecated") throw new Error("Bestätigte Reparatur-ID fehlt im Ersatzkandidaten.");
        if (identityRegistryRevision(readIdentityRegistry(db)) !== old.review.revision) throw new Error("Historie im Ersatzkandidaten verändert.");
      } finally { db.close(); }
      assertRecoveryCandidateScope(root, old.plan);
      await assertPlanFresh(saved.plan, saved, signal);
      saved = { ...saved, state: "ready" }; await save(location.journal, saved);
      return { ready: true, jobId: saved.jobId, candidateId: candidate.manifest.candidateId, planRevision,
        restoredCount: old.plan.rows.length, historicalReplacementCount: saved.plan.historicalReplacementCount,
        retainedCandidateDirectory: location.retained, changesPhotos: false, activatesDatabase: false, requiresActivationConfirmation: true };
    }));
  } };
}
