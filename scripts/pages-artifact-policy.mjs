import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

export const PAGE_SOURCE_FILES = Object.freeze([
  "species-core.js",
  "species-info.js",
  "species-taxonomy.js",
  "species-hero-layout.js",
  "docs/squarespace-custom.css",
  "species-status.js",
  "species-portrait.js",
  "species-sound.js",
  "map-loader.js",
  "search.js",
  "sort.js",
  "lightbox-zoom.js",
  "header-navigation.js",
  "speciesData.json",
  "species_list.json",
  "fehlende_elemente_report.json",
  "lastSavedAssessmentId.json",
  "species-assets-overrides.json",
]);

export const PAGE_SOURCE_DIRS = Object.freeze([
  "species-assets",
  "graphics",
]);

export const PAGE_GENERATED_FILES = Object.freeze([
  ".nojekyll",
  "index.html",
]);

const SPECIES_ASSET_FILES = new Set([
  "map.jpg",
  "portrait.webp",
  "portrait.json",
  "sound.mp3",
  "credits.json",
  "spectrogram.webp",
]);

export function normalizeArtifactPath(relativePath) {
  return String(relativePath ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "");
}

export function isPublishableSourcePath(relativePath) {
  const normalized = normalizeArtifactPath(relativePath);
  if (PAGE_SOURCE_FILES.includes(normalized)) return true;

  const parts = normalized.split("/");
  if (parts[0] === "species-assets") {
    return parts.length === 3 && Boolean(parts[1]) && SPECIES_ASSET_FILES.has(parts[2]);
  }
  if (parts[0] === "graphics") {
    return parts.length >= 2 && path.posix.extname(normalized).toLowerCase() === ".png";
  }
  return false;
}

export function isIgnoredDesignSource(relativePath) {
  const normalized = normalizeArtifactPath(relativePath);
  return normalized.startsWith("graphics/")
    && [".psd", ".psb"].includes(path.posix.extname(normalized).toLowerCase());
}

export function isAllowedArtifactPath(relativePath) {
  const normalized = normalizeArtifactPath(relativePath);
  return PAGE_GENERATED_FILES.includes(normalized) || isPublishableSourcePath(normalized);
}

// The builder replaces its output directory. A path merely being inside the
// checkout must never authorize removal of source files or durable local data.
export async function assertPagesOutputDirectory(repoRoot, outputDirectory) {
  const root = path.resolve(repoRoot);
  const output = path.resolve(outputDirectory);
  const relative = path.relative(root, output);
  const parts = relative.split(path.sep);
  const normalized = parts.map((part) => process.platform === "win32" ? part.toLowerCase() : part);
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)
      || !(normalized.length === 1 && normalized[0] === "_site")) {
    throw new Error("Pages-Ausgabe ist nur im eigenen _site direkt unter der Projektwurzel erlaubt. Quelldateien, dauerhafte Daten und andere Temp-Sitzungen bleiben geschützt.");
  }
  for (let current = output;; current = path.dirname(current)) {
    const info = await lstat(current).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (info?.isSymbolicLink() || info && !info.isDirectory()) {
      throw new Error("Pages-Ausgabepfad enthält einen Link oder ist kein Verzeichnis; nichts wurde entfernt.");
    }
    if (current === path.dirname(current)) break;
  }
  return output;
}

export async function listPublishableSourceFiles(repoRoot) {
  const files = [];

  for (const relativePath of PAGE_SOURCE_FILES) {
    const fullPath = path.join(repoRoot, ...relativePath.split("/"));
    const info = await lstat(fullPath).catch(() => null);
    if (!info?.isFile()) {
      throw new Error(`Pages-Quelldatei fehlt oder ist keine reguläre Datei: ${relativePath}`);
    }
    files.push(relativePath);
  }

  for (const relativeDir of PAGE_SOURCE_DIRS) {
    const fullDir = path.join(repoRoot, relativeDir);
    const info = await lstat(fullDir).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Pages-Quellverzeichnis fehlt oder ist ungültig: ${relativeDir}`);
    }
    await collectDirectoryFiles(repoRoot, fullDir, files);
  }

  return files.sort((left, right) => left.localeCompare(right, "en"));
}

async function collectDirectoryFiles(repoRoot, currentDir, files) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = normalizeArtifactPath(path.relative(repoRoot, fullPath));

    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolische Links sind im Pages-Artefakt nicht erlaubt: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await collectDirectoryFiles(repoRoot, fullPath, files);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Nicht unterstützter Pages-Quelleintrag: ${relativePath}`);
    }
    if (isPublishableSourcePath(relativePath)) {
      files.push(relativePath);
      continue;
    }
    if (isIgnoredDesignSource(relativePath)) continue;
    throw new Error(`Nicht freigegebene Datei in einem Pages-Quellverzeichnis: ${relativePath}`);
  }
}
