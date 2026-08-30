import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildLightroomSearchPackage,
  verifyLightroomSearchPackage,
} from "../species-explorer/lightroom-search-package.mjs";
import {
  activateLightroomSearchPackage,
  assertManagedLightroomSearchPath,
  defaultLightroomSearchRoot,
  discardLightroomRollbackProbe,
  inspectLightroomSearchPackages,
  lightroomSearchDatabasePath,
  lightroomSearchManifestPath,
  lightroomSearchSlotDirectory,
  prepareLightroomSearchStaging,
  readLightroomSearchManifest,
  rollbackLightroomSearchPackage,
} from "../species-explorer/lightroom-search-storage.mjs";
import { atomicWriteJson, defaultTaxonomyRoot } from "../species-explorer/taxonomy-storage.mjs";

const executeFile = promisify(execFile);
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

function optionValue(args, name, fallback = "") {
  const prefix = `--${name}=`;
  const entry = args.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function parseOptions(args = process.argv.slice(2)) {
  const command = args.find((value) => !value.startsWith("--")) || "status";
  return {
    command,
    repoRoot: path.resolve(optionValue(args, "repo-root", DEFAULT_REPO_ROOT)),
    taxonomyRoot: path.resolve(optionValue(args, "taxonomy-root", defaultTaxonomyRoot())),
    searchRoot: path.resolve(optionValue(args, "search-root", defaultLightroomSearchRoot())),
    slot: optionValue(args, "slot", "active"),
    projectRevision: optionValue(args, "project-revision"),
    activate: args.includes("--activate"),
    skipChecksum: args.includes("--skip-checksum"),
    json: args.includes("--json"),
    progressJson: args.includes("--progress-json"),
  };
}

async function projectRevision(repoRoot) {
  try {
    const { stdout } = await executeFile("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      windowsHide: true,
    });
    return stdout.trim() || "working-tree";
  } catch {
    return "working-tree";
  }
}

function verifier({ skipChecksum = false, full = true } = {}) {
  return (options) => verifyLightroomSearchPackage({
    ...options,
    verifyChecksum: !skipChecksum,
    full,
  });
}

async function probeRealRollback(options) {
  const original = await readLightroomSearchManifest(options.searchRoot, "active");
  if (!original) throw new Error("Für den Rollbacktest ist kein aktives Suchpaket installiert.");
  const staleProbeRemoved = await discardLightroomRollbackProbe(options.searchRoot);
  const source = lightroomSearchDatabasePath(options.searchRoot, "active");
  const probeRoot = assertManagedLightroomSearchPath(
    options.searchRoot,
    path.join(options.searchRoot, `.rollback-probe-${crypto.randomUUID()}`),
  );
  const copyDatabase = async (target) => {
    try {
      await fs.link(source, target);
      return "hardlink";
    } catch (error) {
      if (!["EACCES", "EPERM", "EXDEV", "ENOTSUP"].includes(error?.code)) throw error;
      await fs.copyFile(source, target);
      return "copy";
    }
  };
  let storageMode = "hardlink";
  try {
    const activeDirectory = lightroomSearchSlotDirectory(probeRoot, "active");
    await fs.mkdir(activeDirectory, { recursive: true });
    storageMode = await copyDatabase(lightroomSearchDatabasePath(probeRoot, "active"));
    await atomicWriteJson(lightroomSearchManifestPath(probeRoot, "active"), {
      ...original,
      state: "active",
    });

    await prepareLightroomSearchStaging(probeRoot);
    const stagingMode = await copyDatabase(lightroomSearchDatabasePath(probeRoot, "staging"));
    if (stagingMode === "copy") storageMode = "copy";
    await atomicWriteJson(lightroomSearchManifestPath(probeRoot, "staging"), {
      ...original,
      packageId: `${original.packageId}-rollback-probe-${Date.now()}`,
      state: "staging",
      rollbackProbe: true,
      generatedAt: new Date().toISOString(),
    });
    const fastVerify = verifier({ skipChecksum: true, full: false });
    await activateLightroomSearchPackage(probeRoot, { verify: fastVerify });
    await rollbackLightroomSearchPackage(probeRoot, { verify: fastVerify });
    const restored = await readLightroomSearchManifest(probeRoot, "active");
    if (restored?.packageId !== original.packageId) {
      throw new Error("Rollbacktest hat das ursprüngliche Suchpaket nicht wieder aktiviert.");
    }
    return {
      successful: true,
      isolated: true,
      storageMode,
      restoredPackageId: restored.packageId,
      productionPreviousUnchanged: true,
      staleProbeRemoved,
    };
  } finally {
    await fs.rm(probeRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
  }
}

export async function runLightroomSearchPackageCommand(options) {
  if (options.command === "status") {
    return { command: "status", packages: await inspectLightroomSearchPackages(options.searchRoot) };
  }
  if (options.command === "verify") {
    return {
      command: "verify",
      verification: await verifyLightroomSearchPackage({
        searchRoot: options.searchRoot,
        slot: options.slot,
        verifyChecksum: !options.skipChecksum,
      }),
    };
  }
  if (options.command === "rollback") {
    return {
      command: "rollback",
      rollback: await rollbackLightroomSearchPackage(options.searchRoot, {
        verify: verifier({ skipChecksum: options.skipChecksum }),
      }),
    };
  }
  if (options.command === "probe-rollback") {
    return { command: "probe-rollback", probe: await probeRealRollback(options) };
  }
  if (options.command !== "build") {
    throw new Error(`Unbekannter Lightroom-Suchpaketbefehl: ${options.command}`);
  }
  const progress = [];
  const reportProgress = (entry) => {
    progress.push(entry);
    if (options.progressJson) {
      process.stdout.write(`${JSON.stringify({ type: "progress", ...entry })}\n`);
    } else if (!options.json) {
      process.stdout.write(`[${entry.percent}%] ${entry.message}\n`);
    }
  };
  const buildProgressLimit = options.activate ? 82 : 88;
  const manifest = await buildLightroomSearchPackage({
    taxonomyRoot: options.taxonomyRoot,
    searchRoot: options.searchRoot,
    projectRevision: options.projectRevision || await projectRevision(options.repoRoot),
    onProgress: (entry) => {
      reportProgress({
        ...entry,
        percent: Math.round((Number(entry.percent) / 100) * buildProgressLimit),
      });
    },
  });
  let verification = null;
  let activation = null;
  if (options.activate) {
    reportProgress({
      phase: "activate",
      percent: 86,
      message: "Suchpaket wird vor der Aktivierung erneut vollständig geprüft.",
    });
    activation = await activateLightroomSearchPackage(options.searchRoot, {
      verify: verifier({ skipChecksum: options.skipChecksum }),
    });
    verification = activation;
    reportProgress({
      phase: "complete",
      percent: 100,
      message: "Lightroom-Suchpaket wurde atomar aktiviert.",
    });
  } else {
    reportProgress({
      phase: "verify",
      percent: 92,
      message: "Suchpaket wird unabhängig verifiziert.",
    });
    verification = await verifyLightroomSearchPackage({
      searchRoot: options.searchRoot,
      slot: "staging",
      verifyChecksum: !options.skipChecksum,
    });
    reportProgress({
      phase: "complete",
      percent: 100,
      message: "Lightroom-Suchpaket ist vollständig geprüft.",
    });
  }
  return { command: "build", manifest, verification, activation, progress };
}

async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const result = await runLightroomSearchPackageCommand(options);
  if (options.progressJson) {
    process.stdout.write(`${JSON.stringify({
      type: "result",
      command: result.command,
      packageId: result.activation?.manifest?.packageId || result.manifest?.packageId || "",
      masterVersion: result.activation?.manifest?.masterVersion || result.manifest?.masterVersion || "",
    })}\n`);
  } else if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (options.command === "status") {
    process.stdout.write(`Aktiv: ${result.packages.active?.packageId || "nicht installiert"}\n`);
    process.stdout.write(`Vorher: ${result.packages.previous?.packageId || "nicht vorhanden"}\n`);
    process.stdout.write(`Staging: ${result.packages.staging?.packageId || "nicht vorhanden"}\n`);
  } else if (options.command === "build") {
    process.stdout.write(
      options.activate
        ? `Lightroom-Suchpaket ${result.activation.manifest.packageId} wurde aktiviert.\n`
        : `Lightroom-Suchpaket ${result.manifest.packageId} ist geprüft und wartet im Staging.\n`,
    );
  } else {
    process.stdout.write(`${options.command} erfolgreich abgeschlossen.\n`);
  }
  return result;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Lightroom-Suchpaket fehlgeschlagen: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export const lightroomSearchPackageCliInternals = Object.freeze({
  main,
  optionValue,
  parseOptions,
  probeRealRollback,
  projectRevision,
});
