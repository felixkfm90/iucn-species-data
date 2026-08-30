import { spawn } from "node:child_process";
import path from "node:path";

import { childProcessEnvironment } from "./child-process-environment.mjs";
import { inspectLightroomSearchPackages } from "./lightroom-search-storage.mjs";
import { readTaxonomyMasterManifest } from "./taxonomy-master-candidate.mjs";

const MAX_ERROR_TEXT = 32 * 1024;

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function parseProgressLine(line) {
  const normalized = cleanText(line);
  if (!normalized.startsWith("{")) return null;
  try {
    const payload = JSON.parse(normalized);
    return payload?.type === "progress" ? payload : null;
  } catch {
    return null;
  }
}

function appendBounded(current, chunk, limit = MAX_ERROR_TEXT) {
  return `${current}${String(chunk ?? "")}`.slice(-limit);
}

export async function rebuildLightroomSearchPackage({
  repoRoot,
  taxonomyRoot,
  searchRoot,
  projectRevision = "working-tree",
  onProgress = () => {},
  execPath = process.execPath,
  spawnProcess = spawn,
} = {}) {
  if (!repoRoot || !taxonomyRoot || !searchRoot) {
    throw new TypeError("Repository-, Taxonomie- und Lightroom-Suchpaketpfad sind erforderlich.");
  }
  const scriptPath = path.join(path.resolve(repoRoot), "scripts", "lightroom-search-package.mjs");
  const args = [
    "--no-warnings",
    scriptPath,
    "build",
    "--activate",
    "--progress-json",
    `--repo-root=${path.resolve(repoRoot)}`,
    `--taxonomy-root=${path.resolve(taxonomyRoot)}`,
    `--search-root=${path.resolve(searchRoot)}`,
    `--project-revision=${cleanText(projectRevision) || "working-tree"}`,
  ];
  const child = spawnProcess(execPath, args, {
    cwd: path.resolve(repoRoot),
    env: childProcessEnvironment(execPath),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdoutBuffer = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      const progress = parseProgressLine(line);
      if (progress) onProgress(progress);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = appendBounded(stderr, chunk);
  });
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("close", (code) => resolveExit(Number.isInteger(code) ? code : 1));
  });
  if (exitCode !== 0) {
    throw new Error(
      cleanText(stderr)
      || `Lightroom-Suchpaketprozess wurde mit Exit-Code ${exitCode} beendet.`,
    );
  }
  const [masterManifest, packages] = await Promise.all([
    readTaxonomyMasterManifest(taxonomyRoot, "active"),
    inspectLightroomSearchPackages(searchRoot),
  ]);
  const masterVersion = cleanText(masterManifest?.candidateId || masterManifest?.masterVersion);
  if (!packages.active || cleanText(packages.active.masterVersion) !== masterVersion) {
    throw new Error(
      "Das neu gebaute Lightroom-Suchpaket entspricht nicht der aktiven Masterdatenbank.",
    );
  }
  return {
    active: packages.active,
    previous: packages.previous,
    masterVersion,
  };
}

export const lightroomSearchUpdateInternals = Object.freeze({
  appendBounded,
  parseProgressLine,
});
