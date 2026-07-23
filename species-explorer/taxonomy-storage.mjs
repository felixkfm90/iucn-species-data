import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const TAXONOMY_SCHEMA_VERSION = 1;
export const TAXONOMY_IMPORTER_VERSION = 1;
export const TAXONOMY_POINTER_SCHEMA_VERSION = 1;

const RELEASE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,100}$/i;

export function assertTaxonomyReleaseId(value) {
  const releaseId = String(value ?? "").trim();
  if (!RELEASE_ID_PATTERN.test(releaseId)) {
    throw new Error(`Ungültige Taxonomie-Releasekennung: ${releaseId || "(leer)"}`);
  }
  return releaseId;
}

export function defaultTaxonomyRoot(environment = process.env) {
  const localAppData = String(environment.LOCALAPPDATA ?? "").trim();
  if (localAppData) {
    return path.join(localAppData, "FN Wildlife Travel", "Arten-Explorer", "taxonomy");
  }
  return path.join(os.homedir(), ".fn-wildlife-travel", "arten-explorer", "taxonomy");
}

export function taxonomyReleaseDirectory(taxonomyRoot, releaseId) {
  return path.join(
    path.resolve(taxonomyRoot),
    "releases",
    assertTaxonomyReleaseId(releaseId),
  );
}

export function taxonomyDatabasePath(taxonomyRoot, releaseId) {
  return path.join(taxonomyReleaseDirectory(taxonomyRoot, releaseId), "taxonomy.sqlite");
}

export function taxonomyReleaseManifestPath(taxonomyRoot, releaseId) {
  return path.join(taxonomyReleaseDirectory(taxonomyRoot, releaseId), "manifest.json");
}

export function taxonomyActivePointerPath(taxonomyRoot) {
  return path.join(path.resolve(taxonomyRoot), "active.json");
}

export function normalizeActivePointer(value) {
  if (!value || typeof value !== "object") return null;
  const activeRelease = assertTaxonomyReleaseId(value.activeRelease);
  const previousRelease = value.previousRelease
    ? assertTaxonomyReleaseId(value.previousRelease)
    : null;
  if (activeRelease === previousRelease) {
    throw new Error("Aktives und vorheriges Taxonomie-Release dürfen nicht identisch sein.");
  }
  return {
    schemaVersion: Number(value.schemaVersion) || TAXONOMY_POINTER_SCHEMA_VERSION,
    activeRelease,
    previousRelease,
    updatedAt: String(value.updatedAt ?? ""),
  };
}

export async function readActiveTaxonomyPointer(taxonomyRoot) {
  try {
    const text = await fs.readFile(taxonomyActivePointerPath(taxonomyRoot), "utf8");
    return normalizeActivePointer(JSON.parse(text));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Taxonomie-Aktivierungsdatei ist ungültig: ${error.message}`, {
      cause: error,
    });
  }
}

export async function atomicWriteJson(filePath, value) {
  const absolutePath = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await fs.rename(temporaryPath, absolutePath);
  } catch (error) {
    if (!["EEXIST", "EPERM"].includes(error?.code)) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
    const previousPath = `${absolutePath}.previous`;
    await fs.rm(previousPath, { force: true });
    try {
      await fs.rename(absolutePath, previousPath);
    } catch (renameError) {
      if (renameError?.code !== "ENOENT") throw renameError;
    }
    try {
      await fs.rename(temporaryPath, absolutePath);
      await fs.rm(previousPath, { force: true });
    } catch (replaceError) {
      try {
        await fs.rename(previousPath, absolutePath);
      } catch {
        // The original error below remains the actionable failure.
      }
      throw replaceError;
    }
  }
}

export async function writeActiveTaxonomyPointer(
  taxonomyRoot,
  { activeRelease, previousRelease = null },
  now = () => new Date(),
) {
  const pointer = normalizeActivePointer({
    schemaVersion: TAXONOMY_POINTER_SCHEMA_VERSION,
    activeRelease,
    previousRelease,
    updatedAt: now().toISOString(),
  });
  await atomicWriteJson(taxonomyActivePointerPath(taxonomyRoot), pointer);
  return pointer;
}

export async function listTaxonomyReleaseIds(taxonomyRoot) {
  const releasesRoot = path.join(path.resolve(taxonomyRoot), "releases");
  try {
    const entries = await fs.readdir(releasesRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && RELEASE_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function pruneTaxonomyReleases(taxonomyRoot, keepReleaseIds) {
  const keep = new Set([...keepReleaseIds].filter(Boolean).map(assertTaxonomyReleaseId));
  const releases = await listTaxonomyReleaseIds(taxonomyRoot);
  const removed = [];
  for (const releaseId of releases) {
    if (keep.has(releaseId)) continue;
    await fs.rm(taxonomyReleaseDirectory(taxonomyRoot, releaseId), {
      recursive: true,
      force: true,
    });
    removed.push(releaseId);
  }
  return removed;
}

export async function loadNodeSqlite() {
  try {
    return await import("node:sqlite");
  } catch (error) {
    throw new Error(
      "Die lokale Taxonomiesuche benötigt eine Laufzeit mit node:sqlite (Node.js 22.5+; empfohlen ist die projektweit verwendete Node.js-24- oder Electron-Laufzeit).",
      { cause: error },
    );
  }
}
