import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { masterJobDirectory, masterJobsDirectory } from "./taxonomy-master-job.mjs";
import { readActiveTaxonomyPointer, taxonomyActivePointerPath, taxonomyReleaseManifestPath, taxonomyDatabasePath } from "./taxonomy-storage.mjs";
import { latestProviderSliceVersion, providerSliceManifestPath, providerSliceDataPath } from "./taxonomy-master-slices.mjs";
import { taxonomyPublicationPath } from "./taxonomy-publication-storage.mjs";
import { catalogUsageRegistration } from "./lightroom-catalog-usage.mjs";
import { relocatedStoragePath } from "./storage-paths.mjs";
import { taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";

export const restartDigest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const blocked = (message) => Object.assign(new Error(message), { statusCode: 409, code: "UPDATE_RESTART_BLOCKED" });
// Only retained candidate manifests contain growing difference lists; other preview inputs keep their small limits.
const MAX_RETAINED_MANIFEST_BYTES = 12 * 1024 * 1024;
const key = (filename) => process.platform === "win32" ? filename.toLowerCase() : filename;
async function smallFile(filename, maximum = 512 * 1024) {
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size > maximum) throw blocked("Die Neustartvorschau benötigt einen begrenzten, lesbaren Eingangsstand.");
  const bytes = await fs.readFile(filename);
  if (bytes.length > maximum) throw blocked("Der Vorschau-Eingang wurde während des Lesens verändert.");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
const smallJson = async (filename, maximum) => {
  const file = await smallFile(filename, maximum);
  return { value: JSON.parse(file.bytes), sha256: file.sha256 };
};
export function isPreBuildRestart(job) {
  return Boolean(job && ["failed", "interrupted"].includes(job.status) && ["start", "build"].includes(job.phase)
    && job.decision === "rebuild-master" && job.sourceCompleted === true && job.buildStarted === false
    && job.freshUsageCapture === true && !job.boundCandidate && job.restartGuard?.originWorkflowRevision
    && /^update-[a-f0-9-]{36}$/.test(job.restartGuard.identity?.updateRunId || ""));
}
async function fileStamp(filename) {
  try {
    const stat = await fs.stat(filename, { bigint: true });
    if (!stat.isFile()) throw blocked("Ein gebundener Aufbau-Eingang ist keine reguläre Datei.");
    return [stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].map(String);
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function retainedRevision(taxonomyRoot) {
  try {
    const { value } = await smallJson(path.join(taxonomyRoot, "supplements.json"), 12 * 1024 * 1024);
    return restartDigest((Array.isArray(value.researchedTaxa) ? value.researchedTaxa : []).filter((entry) => entry?.scientificName));
  } catch (error) { if (error.code === "ENOENT") return restartDigest([]); throw error; }
}

export function assertRestartScope(job, master, maintenance, retainedCandidate = null) {
  const stoppedBuild = ["failed", "interrupted"].includes(job?.status) && ["build", "resume-build"].includes(job?.phase);
  const waitingResume = job?.status === "waiting-usage" && job.phase === "resume-build";
  if (!job || (!stoppedBuild && !waitingResume)
      || job.buildStarted !== true || job.sourceCompleted !== true || job.boundCandidate
      || !/^update-[a-f0-9-]{36}$/.test(job.updateRunId || "")) {
    throw blocked("Nur ein eigener fehlgeschlagener Aufbau mit abgeschlossener Quellenphase kann neu gestartet werden.");
  }
  const candidate = master.lifecycle?.candidate;
  if (master.active || maintenance.active || candidate && (!retainedCandidate
        || retainedCandidate.updateRunId !== job.updateRunId || retainedCandidate.candidateId !== candidate.candidateId
        || retainedCandidate.buildJobRevision !== candidate.buildJobRevision) || master.lifecycle?.error
      || !master.lifecycle?.active?.candidateId || master.reference?.error || master.reference?.status === "error"
      || !master.buildJob?.available || !["failed", "stale"].includes(master.buildJob.status)
      || master.buildJob.updateRunId !== job.updateRunId
      || master.lifecycle.active.candidateId !== job.baseline?.masterVersion
      || ["failed", "partial", "interrupted", "stale", "paused"].includes(maintenance.status) || maintenance.error) {
    throw blocked("Auftrag, aktiver Stand oder Datenbankaktion erlauben keinen sicheren lokalen Neustart.");
  }
}

function assertRecipeOwner(recipe, root, identity, id) {
  if (!recipe || recipe.schemaVersion !== 1 || recipe.id !== id || recipe.updateRunId !== identity.updateRunId
      || typeof recipe.taxonomyRoot !== "string"
      || recipe.options?.sourceRecoveryScope || path.resolve(relocatedStoragePath(recipe.taxonomyRoot)) !== path.resolve(root)
      || recipe.revision !== restartDigest({ ...recipe, revision: undefined })) {
    throw blocked("Das erhaltene Kandidatenrezept gehört nicht unverändert zum eigenen Aufbau.");
  }
}

async function retainedCandidateOwnership(root, identity, master, currentRecipe, currentState) {
  const candidate = master.lifecycle?.candidate;
  if (!candidate) return null;
  let manifest;
  try { manifest = await smallJson(taxonomyMasterManifestPath(root, "staging"), MAX_RETAINED_MANIFEST_BYTES); }
  catch (error) {
    if (error.code === "ENOENT") throw blocked("Der vorhandene Kandidat hat kein erhaltenes prüfbares Manifest.");
    throw error;
  }
  if (!candidate.candidateId || !/^[a-f0-9]{64}$/.test(candidate.buildJobRevision || "")
      || manifest.value.candidateId !== candidate.candidateId || manifest.value.buildJobRevision !== candidate.buildJobRevision) {
    throw blocked("Der vorhandene Kandidat stimmt nicht mit seinem erhaltenen Manifest überein.");
  }
  let recipe = currentRecipe, state = currentState, id = identity.buildJobId;
  if (recipe.value.revision !== candidate.buildJobRevision) {
    // Historical ready states contain candidateId; inspect only these bounded
    // metadata files, then read the single matching recipe. Never scan spools/DBs.
    const entries = await fs.readdir(masterJobsDirectory(root), { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory() && /^job-[a-f0-9-]{36}$/.test(entry.name));
    if (directories.length > 256) throw blocked("Die Kandidatenherkunft benötigt eine begrenzte gezielte Auftragsprüfung.");
    const matches = [];
    for (const entry of directories) {
      let value;
      try { value = await smallJson(path.join(masterJobDirectory(root, entry.name), "state.json")); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (value.value.candidateId !== candidate.candidateId) continue;
      if (value.value.schemaVersion !== 1 || value.value.id !== entry.name || value.value.status !== "ready") {
        throw blocked("Der erhaltene Kandidatenzustand gehört nicht zum fertigen historischen Aufbau.");
      }
      matches.push({ id: entry.name, state: value });
    }
    if (matches.length !== 1) throw blocked("Der vorhandene Kandidat hat keinen eindeutigen eigenen historischen Aufbau.");
    ({ id, state } = matches[0]);
    recipe = await smallJson(path.join(masterJobDirectory(root, id), "recipe.json"), 12 * 1024 * 1024);
  }
  assertRecipeOwner(recipe.value, root, identity, id);
  if (recipe.value.revision !== candidate.buildJobRevision) throw blocked("Der vorhandene Kandidat gehört nicht zum erhaltenen Aufbaurezept.");
  return { candidateId: candidate.candidateId, buildJobRevision: candidate.buildJobRevision, buildJobId: id,
    updateRunId: identity.updateRunId, manifestSha256: manifest.sha256, recipeSha256: recipe.sha256, stateSha256: state.sha256 };
}

// Read metadata only. Full input/database checks remain at the later build
// boundary; no verifyMasterJob or provider/reference data read occurs here.
export async function readRestartInputs({ taxonomyRoot, identity, master, maintenance, baseline }) {
  if (master.active || maintenance.active || master.lifecycle?.error
      || master.reference?.status === "error" || master.reference?.error
      || ["failed", "partial", "interrupted", "stale", "paused"].includes(maintenance.status) || maintenance.error) {
    throw blocked("Eine Datenbankaktion oder ein anderer Kandidat verhindert den lokalen Neustart.");
  }
  const directory = masterJobDirectory(taxonomyRoot, identity.buildJobId);
  const [current, recipe, state] = await Promise.all([
    smallJson(path.join(masterJobsDirectory(taxonomyRoot), "current.json")),
    smallJson(path.join(directory, "recipe.json"), 12 * 1024 * 1024),
    smallJson(path.join(directory, "state.json")),
  ]);
  if (current.value.id !== identity.buildJobId || current.value.updateRunId !== identity.updateRunId
      || recipe.value.id !== identity.buildJobId || recipe.value.updateRunId !== identity.updateRunId
      || recipe.value.schemaVersion !== 1 || recipe.value.options?.sourceRecoveryScope
      || path.resolve(relocatedStoragePath(recipe.value.taxonomyRoot)) !== path.resolve(taxonomyRoot)
      || recipe.value.revision !== restartDigest({ ...recipe.value, revision: undefined })
      || identity.buildJobRevision && recipe.value.revision !== identity.buildJobRevision
      || state.value.id !== identity.buildJobId || !["failed", "stale"].includes(state.value.status)
      || master.buildJob?.id !== identity.buildJobId || master.buildJob.updateRunId !== identity.updateRunId
      || !["failed", "stale"].includes(master.buildJob.status)) {
    throw blocked("Der gespeicherte Aufbau ist verändert, aktiv oder gehört zu einem anderen Updateauftrag.");
  }
  const retainedCandidate = await retainedCandidateOwnership(taxonomyRoot, identity, master, recipe, state);
  const pointer = await readActiveTaxonomyPointer(taxonomyRoot);
  if (!pointer || pointer.activeRelease !== identity.referenceRelease || master.reference?.activeRelease !== pointer.activeRelease
      || maintenance.activeRelease && maintenance.activeRelease !== pointer.activeRelease) {
    throw blocked("Der vollständig vorbereitete lokale Quellenstand wurde inzwischen geändert.");
  }
  const sourceFiles = [taxonomyActivePointerPath(taxonomyRoot), taxonomyReleaseManifestPath(taxonomyRoot, pointer.activeRelease)];
  // Bind changes to large source files by metadata here. Full fingerprints are
  // still checked once during preparation; preview/polling never reads databases.
  const stampFiles = [taxonomyDatabasePath(taxonomyRoot, pointer.activeRelease), taxonomyPublicationPath(taxonomyRoot),
    path.join(taxonomyRoot, "master", "identity-review.json")];
  for (const provider of ["inaturalist", "gbif", "worms", "wikidata", "animalia"]) {
    const version = await latestProviderSliceVersion(taxonomyRoot, provider);
    if (version) {
      sourceFiles.push(providerSliceManifestPath(taxonomyRoot, provider, version));
      stampFiles.push(providerSliceDataPath(taxonomyRoot, provider, version));
    }
  }
  for (const filename of [recipe.value.selection?.speciesListPath, recipe.value.selection?.correctionsPath]) {
    if (!filename) throw blocked("Die gebundenen Projektdateien des alten Aufbaus fehlen.");
    sourceFiles.push(relocatedStoragePath(filename));
  }
  const sources = await Promise.all(sourceFiles.map(async (filename) => [path.resolve(filename), (await smallFile(filename)).sha256]));
  const sourceStamps = await Promise.all(stampFiles.map(async (filename) => [path.resolve(filename), await fileStamp(filename)]));
  const registration = await catalogUsageRegistration(taxonomyRoot);
  if (!registration?.catalogs.length) throw blocked("Der vollständige FN-Katalogsatz muss vor dem Neustart registriert sein.");
  const catalogs = registration.catalogs.map((catalog) => catalog.catalogPath).sort((a, b) => key(a).localeCompare(key(b), "en"));
  return { catalogs, registryRevision: registration.revision, buildJobRevision: recipe.value.revision,
    binding: { recipeSha256: recipe.sha256, currentSha256: current.sha256, stateSha256: state.sha256,
      sourceRevision: restartDigest(sources), sourceStampsRevision: restartDigest(sourceStamps), retainedRevision: await retainedRevision(taxonomyRoot),
      catalogSetRevision: restartDigest(catalogs.map(key)), ...(retainedCandidate ? { retainedCandidate } : {}), baseline } };
}
