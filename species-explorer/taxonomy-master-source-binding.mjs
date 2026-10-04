import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { masterFileFingerprint } from "./taxonomy-master-inputs.mjs";
import { latestProviderSliceVersion, providerSliceManifestPath, providerSliceDataPath } from "./taxonomy-master-slices.mjs";
import { readActiveTaxonomyPointer, taxonomyActivePointerPath, taxonomyDatabasePath, taxonomyReleaseManifestPath } from "./taxonomy-storage.mjs";
import { assertPendingClassificationAutomation } from "./taxonomy-classification-automation.mjs";
import { relocatedStoragePath } from "./storage-paths.mjs";

const PROVIDERS = ["inaturalist", "gbif", "worms", "wikidata", "animalia"];
async function fingerprint(filename) {
  try { return await masterFileFingerprint(filename); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

// Enumerate TODAY's selection, not only the files which existed at job creation.
// No network request and no SQLite open. Called for preparation/resume, not polling.
export async function readMasterSourceBinding(taxonomyRoot, selection) {
  if (!selection?.speciesListPath || !selection?.correctionsPath) throw new Error("Projektdateien für den Masteraufbau fehlen.");
  const reference = await readActiveTaxonomyPointer(taxonomyRoot);
  const versions = await Promise.all(PROVIDERS.map(async (provider) => [provider, await latestProviderSliceVersion(taxonomyRoot, provider)]));
  const files = [relocatedStoragePath(selection.speciesListPath), relocatedStoragePath(selection.correctionsPath),
    path.join(taxonomyRoot, "master", "identity-review.json"),
    path.join(taxonomyRoot, "catalog-usage", "registry.json"),
    path.join(taxonomyRoot, "catalog-usage", "captures.json"),
    taxonomyActivePointerPath(taxonomyRoot),
    ...(reference ? [taxonomyDatabasePath(taxonomyRoot, reference.activeRelease), taxonomyReleaseManifestPath(taxonomyRoot, reference.activeRelease)] : []),
    ...versions.flatMap(([provider, version]) => version
      ? [providerSliceManifestPath(taxonomyRoot, provider, version), providerSliceDataPath(taxonomyRoot, provider, version)] : [])];
  // Ordinary search-cache timestamps are not build inputs. Only retained taxa
  // from this cache affect selection; unrelated searches must not stale a job.
  const retainedRevision = createHash("sha256").update(JSON.stringify(await readRetainedMasterTaxa(taxonomyRoot))).digest("hex");
  const automation = await assertPendingClassificationAutomation(taxonomyRoot);
  return { reference: reference?.activeRelease || null, versions, retainedRevision,
    ...(automation ? { classificationAutomation: automation } : {}),
    files: await Promise.all(files.map(async (filename) => [path.resolve(filename), await fingerprint(filename)])) };
}

export async function readRetainedMasterTaxa(taxonomyRoot) {
  try {
    const cache = JSON.parse(await fs.readFile(path.join(taxonomyRoot, "supplements.json"), "utf8"));
    return (Array.isArray(cache.researchedTaxa) ? cache.researchedTaxa : []).filter((entry) => entry?.scientificName);
  } catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
