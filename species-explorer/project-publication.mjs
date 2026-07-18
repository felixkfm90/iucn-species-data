import { spawn } from "node:child_process";
import { join } from "node:path";
import { sanitizeAssetName } from "./species-model.mjs";

const TRACKED_PROJECT_PATHS = Object.freeze([
  "species_list.json",
  "speciesData.json",
  "fehlende_elemente_report.json",
  "lastSavedAssessmentId.json",
  "species-assets-overrides.json",
  "docs/manual-map-overrides.md",
  "species-assets",
]);

function normalizePendingPath(pathValue) {
  let normalized = String(pathValue ?? "").trim();
  if (normalized.includes(" -> ")) normalized = normalized.split(" -> ").pop().trim();
  normalized = normalized.replace(/^"|"$/g, "");
  return normalized.replace(/\\/g, "/");
}

export function createProjectPublicationService({ repoRoot }) {
  function runCommandCapture(command, args) {
    return new Promise((resolveRun) => {
      const child = spawn(command, args, {
        cwd: repoRoot,
        env: process.env,
        windowsHide: true,
      });
      const stdout = [];
      const stderr = [];
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => {
        resolveRun({ code: 1, stdout: "", stderr: error.message });
      });
      child.on("close", (code) => {
        resolveRun({
          code: Number.isInteger(code) ? code : 1,
          stdout: Buffer.concat(stdout).toString("utf8").trim(),
          stderr: Buffer.concat(stderr).toString("utf8").trim(),
        });
      });
    });
  }

  async function synchronizeProjectStatusForPublication() {
    const result = await runCommandCapture(
      process.execPath,
      [join(repoRoot, "scripts", "project-status.mjs")],
    );
    if (result.code !== 0) {
      throw new Error(`Projektstatus konnte nicht synchronisiert werden: ${result.stderr || result.stdout}`);
    }
  }

  async function readPendingProjectChanges() {
    const result = await runCommandCapture("git", [
      "-c",
      "core.quotepath=false",
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ...TRACKED_PROJECT_PATHS,
    ]);
    if (result.code !== 0) {
      return {
        files: [],
        count: 0,
        error: result.stderr || result.stdout || "Git-Status konnte nicht gelesen werden",
      };
    }
    const files = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.{1,2})\s+(.*)$/);
        return {
          status: (match?.[1] ?? line.slice(0, 2)).trim() || "??",
          path: (match?.[2] ?? line.slice(2)).trim(),
        };
      })
      .filter((entry) => entry.path);
    return { files, count: files.length, error: "" };
  }

  function pendingAssetSpeciesFromFiles(files, speciesList) {
    const bySafeName = new Map(
      speciesList.map((entry) => {
        const safeName = sanitizeAssetName(entry.german);
        const scientificName = `${entry.genus ?? ""} ${entry.species ?? ""}`.trim();
        return [safeName.toLocaleLowerCase("de"), {
          slug: `${entry.genus ?? ""}${entry.species ?? ""}`.toLocaleLowerCase("de"),
          safeName,
          germanName: entry.german,
          scientificName,
        }];
      }),
    );
    const affected = new Map();
    for (const file of files ?? []) {
      const match = normalizePendingPath(file.path).match(/^species-assets\/([^/]+)\//);
      if (!match) continue;
      const safeName = match[1];
      const species = bySafeName.get(safeName.toLocaleLowerCase("de")) ?? {
        slug: "",
        safeName,
        germanName: safeName,
        scientificName: "",
      };
      affected.set(safeName.toLocaleLowerCase("de"), species);
    }
    return [...affected.values()].sort((a, b) => a.germanName.localeCompare(b.germanName, "de"));
  }

  return {
    runCommandCapture,
    synchronizeProjectStatusForPublication,
    readPendingProjectChanges,
    pendingAssetSpeciesFromFiles,
  };
}
