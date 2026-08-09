import path from "node:path";

export const TAXONOMY_MASTER_SCHEMA_VERSION = 3;
export const READABLE_TAXONOMY_MASTER_SCHEMA_VERSIONS = Object.freeze([2, 3]);

export function taxonomyMasterRoot(taxonomyRoot) {
  return path.join(path.resolve(taxonomyRoot), "master");
}

export function taxonomyMasterActiveDirectory(taxonomyRoot) {
  return path.join(taxonomyMasterRoot(taxonomyRoot), "active");
}

export function taxonomyMasterCandidateDirectory(taxonomyRoot) {
  return path.join(taxonomyMasterRoot(taxonomyRoot), "staging");
}

export function taxonomyMasterPreviousDirectory(taxonomyRoot) {
  return path.join(taxonomyMasterRoot(taxonomyRoot), "previous");
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
