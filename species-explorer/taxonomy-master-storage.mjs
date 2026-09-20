import path from "node:path";
import { publishedTaxonomyDirectory } from "./taxonomy-publication-storage.mjs";

export const TAXONOMY_MASTER_SCHEMA_VERSION = 4;
export const READABLE_TAXONOMY_MASTER_SCHEMA_VERSIONS = Object.freeze([2, 3, 4]);

export function taxonomyMasterRoot(taxonomyRoot) {
  return path.join(path.resolve(taxonomyRoot), "master");
}

export function taxonomyMasterActiveDirectory(taxonomyRoot) {
  return publishedTaxonomyDirectory(taxonomyRoot, "master", "active") || path.join(taxonomyMasterRoot(taxonomyRoot), "active");
}

export function taxonomyMasterCandidateDirectory(taxonomyRoot) {
  return path.join(taxonomyMasterRoot(taxonomyRoot), "staging");
}

export function taxonomyMasterPreviousDirectory(taxonomyRoot) {
  return publishedTaxonomyDirectory(taxonomyRoot, "master", "previous") || path.join(taxonomyMasterRoot(taxonomyRoot), "previous");
}

export function taxonomyMasterDatabasePath(taxonomyRoot, slot = "active") {
  const directories = {
    active: taxonomyMasterActiveDirectory,
    staging: taxonomyMasterCandidateDirectory,
    previous: taxonomyMasterPreviousDirectory,
  };
  const directory = directories[slot];
  if (!directory) {
    throw new Error(`Unbekannter Masterdatenbank-Speicherplatz: ${slot}`);
  }
  return path.join(directory(taxonomyRoot), "taxonomy-master.sqlite");
}

export function taxonomyMasterManifestPath(taxonomyRoot, slot = "active") {
  return path.join(path.dirname(taxonomyMasterDatabasePath(taxonomyRoot, slot)), "manifest.json");
}

export function taxonomyMasterProviderRoot(taxonomyRoot) {
  return path.join(taxonomyMasterRoot(taxonomyRoot), "providers");
}
