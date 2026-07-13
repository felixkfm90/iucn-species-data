import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

export const PAGE_SOURCE_FILES = Object.freeze([
  "species-core.js",
  "species-info.js",
  "species-taxonomy.js",
  "species-status.js",
  "species-sound.js",
  "map-loader.js",
  "search.js",
  "sort.js",
  "lightbox-zoom.js",
  "speciesData.json",
  "species_list.json",
  "fehlende_elemente_report.json",
  "lastSavedAssessmentId.json",
  "species-assets-overrides.json",
  "README.md",
]);

export const PAGE_SOURCE_DIRS = Object.freeze([
  "species-assets",
  "graphics",
  "docs",
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

const DOC_EXTENSIONS = new Set([".md", ".html", ".css", ".svg"]);

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
  if (parts[0] === "docs") {
    return parts.length >= 2 && DOC_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase());
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
