import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { createTaxonomyMasterService } from "../species-explorer/taxonomy-master-service.mjs";
import { createTaxonomyProviderRefreshService } from "../species-explorer/taxonomy-provider-refresh-service.mjs";
import {
  taxonomyMasterActiveDirectory,
  taxonomyMasterCandidateDirectory,
  taxonomyMasterDatabasePath,
  taxonomyMasterRoot,
} from "../species-explorer/taxonomy-master-storage.mjs";
import { openTaxonomyMasterStore } from "../species-explorer/taxonomy-master-store.mjs";
import { createTaxonomyReferenceService } from "../species-explorer/taxonomy-reference-service.mjs";
import { createTaxonomySupplementService } from "../species-explorer/taxonomy-supplement-service.mjs";
import { defaultTaxonomyRoot } from "../species-explorer/taxonomy-storage.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function optionValue(args, name, fallback = "") {
  const prefix = `--${name}=`;
  const entry = args.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function parseOptions(args = process.argv.slice(2)) {
  const inaturalistArchive = optionValue(args, "inaturalist-archive");
  const inaturalistPackage = optionValue(args, "inaturalist-package");
  return {
    repoRoot: path.resolve(optionValue(args, "repo-root", DEFAULT_REPO_ROOT)),
    taxonomyRoot: path.resolve(optionValue(args, "taxonomy-root", defaultTaxonomyRoot())),
    refreshProviders: args.includes("--refresh-providers"),
    activate: args.includes("--activate"),
    verifyRollback: args.includes("--verify-rollback"),
    rollbackOnly: args.includes("--rollback-only"),
    inaturalistArchivePath: inaturalistArchive ? path.resolve(inaturalistArchive) : "",
    inaturalistPackageDirectory: inaturalistPackage ? path.resolve(inaturalistPackage) : "",
    inaturalistProviderVersion: optionValue(args, "inaturalist-version"),
    forceInaturalist: args.includes("--force-inaturalist"),
    json: args.includes("--json"),
  };
}

async function stageRollbackProbe(taxonomyRoot, { now = () => new Date() } = {}) {
  const activeDirectory = taxonomyMasterActiveDirectory(taxonomyRoot);
  const stagingDirectory = taxonomyMasterCandidateDirectory(taxonomyRoot);
  const activeDatabase = taxonomyMasterDatabasePath(taxonomyRoot, "active");
  const stagingDatabase = taxonomyMasterDatabasePath(taxonomyRoot, "staging");
  const activeManifestPath = path.join(activeDirectory, "manifest.json");
  const stagingManifestPath = path.join(stagingDirectory, "manifest.json");
  const activeManifest = JSON.parse(await fs.readFile(activeManifestPath, "utf8"));
  const timestamp = now().toISOString();
  const candidateId = `${activeManifest.candidateId}-rollback-probe-${timestamp.replace(/[^0-9]/g, "").slice(0, 17)}`;
  await fs.rm(stagingDirectory, { recursive: true, force: true });
  await fs.mkdir(stagingDirectory, { recursive: true });
  let storageMode = "hardlink";
  try {
    await fs.link(activeDatabase, stagingDatabase);
  } catch (error) {
    if (!["EPERM", "EXDEV", "ENOTSUP", "EACCES"].includes(error?.code)) throw error;
    storageMode = "copy";
    await fs.copyFile(activeDatabase, stagingDatabase);
  }
  await fs.writeFile(stagingManifestPath, `${JSON.stringify({
    ...activeManifest,
    candidateId,
    createdAt: timestamp,
    state: "staging",
    requiresConfirmation: true,
    rollbackProbe: true,
  }, null, 2)}\n`, "utf8");
  return { candidateId, storageMode };
}

async function verifyRealRollback({ master, taxonomyRoot, species, report }) {
  const firstVerification = report.verification || await verifyStore({
    taxonomyRoot,
    species,
    slot: "active",
  });
  const firstCandidateId = firstVerification.status.candidateId;
  const probe = await stageRollbackProbe(taxonomyRoot);
  let probeActivated = false;
  try {
    const stagingVerification = await verifyStore({
      taxonomyRoot,
      species,
      slot: "staging",
    });
    if (stagingVerification.missing.length || stagingVerification.projectLinkMismatches.length) {
      throw new Error("Der Rollback-Prüfkandidat enthält nicht alle Projektverknüpfungen.");
    }
    // Die Aktivierung selbst führt die verbindliche Vollprüfung des
    // Kandidaten durch. Eine vorherige Statusabfrage würde dieselbe mehrere
    // GiB große Datenbank nur ein zweites Mal vollständig prüfen.
    await master.activate({ confirmed: true });
    probeActivated = true;
    const secondStore = await openTaxonomyMasterStore({ taxonomyRoot });
    let secondCandidateId;
    try {
      secondCandidateId = secondStore.status().candidateId;
    } finally {
      secondStore.close();
    }
    if (secondCandidateId === firstCandidateId) {
      throw new Error("Der Rollbacktest konnte keine zweite Masterversion unterscheiden.");
    }
    await master.rollback({ confirmed: true });
    probeActivated = false;
    const restored = await verifyStore({ taxonomyRoot, species, slot: "active" });
    const result = {
      tested: true,
      storageMode: probe.storageMode,
      probeCandidateId: probe.candidateId,
      restoredCandidateId: restored.status.candidateId,
      expectedCandidateId: firstCandidateId,
      successful: restored.status.candidateId === firstCandidateId
        && restored.missing.length === 0
        && restored.projectLinkMismatches.length === 0,
    };
    if (!result.successful) throw new Error("Der reale Rollbacktest ist fehlgeschlagen.");
    return result;
  } catch (error) {
    if (probeActivated) {
      await master.rollback({ confirmed: true }).catch(() => {});
    } else {
      await fs.rm(taxonomyMasterCandidateDirectory(taxonomyRoot), { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

async function directoryBytes(root) {
  let bytes = 0;
  let files = 0;
  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const stats = await fs.stat(absolute);
        bytes += stats.size;
        files += 1;
      }
    }
  }
  await walk(root);
  return { bytes, files };
}

async function listTemporaryArtifacts(root) {
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => [
      ".staging-",
      ".rollback-",
      ".previous-displaced-",
    ].some((prefix) => entry.name.startsWith(prefix)))
    .map((entry) => entry.name)
    .sort();
}

async function cleanupTemporaryArtifacts(root) {
  const entries = await listTemporaryArtifacts(root);
  for (const entry of entries) {
    await fs.rm(path.join(root, entry), { recursive: true, force: true });
  }
  return entries;
}

function projectSpecies(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    germanName: cleanText(entry.germanName || entry.german),
    scientificName: cleanText(
      entry.scientificName
      || [entry.genus, entry.species].map(cleanText).filter(Boolean).join(" "),
    ),
    slug: cleanText(entry.slug || entry.urlSlug)
      || cleanText([entry.genus, entry.species].join(" ")).toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, ""),
    kingdom: cleanText(entry.kingdom || "Animalia"),
  })).filter((entry) => entry.scientificName);
}

async function waitForBuild(service) {
  const run = service.runPromise;
  if (!run) throw new Error("Der Master-Abgleich wurde nicht gestartet.");
  await run;
  const status = await service.status();
  if (status.status === "failed") throw new Error(status.error || status.message);
  return status;
}

async function verifyStore({ taxonomyRoot, species, slot }) {
  const store = await openTaxonomyMasterStore({ taxonomyRoot, slot });
  if (!store || store.available === false) {
    throw new Error(`Masterdatenbank im Speicherplatz ${slot} ist nicht verfügbar.`);
  }
  const startedAt = performance.now();
  const missing = [];
  const mismatched = [];
  try {
    for (const entry of species) {
      const found = store.findTaxonByScientificName(entry.scientificName, {
        rank: "species",
        kingdom: entry.kingdom,
      });
      if (!found) {
        missing.push(entry.scientificName);
        continue;
      }
      const detail = store.taxon(found.masterTaxonId || found.taxonId);
      const projectLink = detail?.projectLinks?.find((link) => link.project_slug === entry.slug);
      if (!projectLink) mismatched.push(entry.scientificName);
    }
    const elapsedMs = performance.now() - startedAt;
    return {
      status: store.status(),
      checkedSpecies: species.length,
      missing,
      projectLinkMismatches: mismatched,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      averageLookupMs: Number((elapsedMs / Math.max(1, species.length)).toFixed(3)),
    };
  } finally {
    store.close();
  }
}

export async function runTaxonomyMasterMigration(options = parseOptions()) {
  const speciesListPath = path.join(options.repoRoot, "species_list.json");
  const correctionsPath = path.join(options.repoRoot, "taxonomy-reference-corrections.json");
  const species = projectSpecies(JSON.parse(await fs.readFile(speciesListPath, "utf8")));
  const supplements = createTaxonomySupplementService({
    taxonomyRoot: options.taxonomyRoot,
    correctionsPath,
  });
  const reference = createTaxonomyReferenceService({
    taxonomyRoot: options.taxonomyRoot,
    supplementService: supplements,
  });
  const providerRefresh = createTaxonomyProviderRefreshService({
    taxonomyRoot: options.taxonomyRoot,
    repoRoot: options.repoRoot,
    supplementService: supplements,
  });
  const master = createTaxonomyMasterService({
    taxonomyRoot: options.taxonomyRoot,
    referenceService: reference,
    supplementService: supplements,
    providerRefreshService: providerRefresh,
    speciesListPath,
    correctionsPath,
  });
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    taxonomyRoot: options.taxonomyRoot,
    refreshProviders: options.refreshProviders,
    requestedActivation: options.activate,
    projectSpecies: species.length,
  };
  let rollbackOnFailure = false;
  try {
    report.cleanedTemporaryArtifacts = await cleanupTemporaryArtifacts(
      taxonomyMasterRoot(options.taxonomyRoot),
    );
    if (options.rollbackOnly) {
      report.verification = await verifyStore({
        taxonomyRoot: options.taxonomyRoot,
        species,
        slot: "active",
      });
      if (report.verification.missing.length || report.verification.projectLinkMismatches.length) {
        throw new Error("Die aktive Masterdatenbank ist vor dem Rollbacktest nicht vollständig verknüpft.");
      }
      report.rollback = await verifyRealRollback({
        master,
        taxonomyRoot: options.taxonomyRoot,
        species,
        report,
      });
      report.storage = await directoryBytes(taxonomyMasterRoot(options.taxonomyRoot));
      report.activeDatabaseBytes = (await fs.stat(
        taxonomyMasterDatabasePath(options.taxonomyRoot, "active"),
      )).size;
      report.temporaryArtifacts = await listTemporaryArtifacts(taxonomyMasterRoot(options.taxonomyRoot));
      if (report.temporaryArtifacts.length) {
        throw new Error(`Temporäre Masterartefakte wurden nicht bereinigt: ${report.temporaryArtifacts.join(", ")}`);
      }
      report.completedAt = new Date().toISOString();
      report.success = true;
      return report;
    }
    master.startBuild({
      refreshProviders: options.refreshProviders,
      inaturalistArchivePath: options.inaturalistArchivePath,
      inaturalistPackageDirectory: options.inaturalistPackageDirectory,
      inaturalistProviderVersion: options.inaturalistProviderVersion,
      forceInaturalist: options.forceInaturalist,
    });
    report.build = await waitForBuild(master);
    const lifecycle = report.build.lifecycle;
    report.conflicts = {
      total: lifecycle.conflicts.length,
      blocking: lifecycle.blockingConflicts.length,
    };
    if (options.activate) {
      if (lifecycle.blockingConflicts.length) {
        throw new Error(
          `${lifecycle.blockingConflicts.length} fachliche Konflikt(e) müssen im Arten-Explorer entschieden werden.`,
        );
      }
      report.stagingVerification = await verifyStore({
        taxonomyRoot: options.taxonomyRoot,
        species,
        slot: "staging",
      });
      if (
        report.stagingVerification.missing.length
        || report.stagingVerification.projectLinkMismatches.length
      ) {
        throw new Error(
          `Kandidatenprüfung fehlgeschlagen: ${report.stagingVerification.missing.length} Art(en) fehlen, ${report.stagingVerification.projectLinkMismatches.length} Projektverknüpfung(en) fehlen. Die aktive Masterversion wurde nicht verändert.`,
        );
      }
      report.activation = await master.activate({ confirmed: true });
      rollbackOnFailure = true;
    }
    const slot = options.activate ? "active" : "staging";
    report.verification = await verifyStore({ taxonomyRoot: options.taxonomyRoot, species, slot });
    if (report.verification.missing.length || report.verification.projectLinkMismatches.length) {
      throw new Error(
        `Masterprüfung fehlgeschlagen: ${report.verification.missing.length} Art(en) fehlen, ${report.verification.projectLinkMismatches.length} Projektverknüpfung(en) fehlen.`,
      );
    }
    rollbackOnFailure = false;
    if (options.verifyRollback) {
      if (!options.activate) throw new Error("Der Rollbacktest setzt --activate voraus.");
      report.rollback = await verifyRealRollback({
        master,
        taxonomyRoot: options.taxonomyRoot,
        species,
        report,
      });
    }
    report.storage = await directoryBytes(taxonomyMasterRoot(options.taxonomyRoot));
    report.activeDatabaseBytes = options.activate
      ? (await fs.stat(taxonomyMasterDatabasePath(options.taxonomyRoot, "active"))).size
      : 0;
    report.temporaryArtifacts = await listTemporaryArtifacts(taxonomyMasterRoot(options.taxonomyRoot));
    if (report.temporaryArtifacts.length) {
      throw new Error(`Temporäre Masterartefakte wurden nicht bereinigt: ${report.temporaryArtifacts.join(", ")}`);
    }
    report.completedAt = new Date().toISOString();
    report.success = true;
    return report;
  } catch (error) {
    if (rollbackOnFailure) {
      try {
        const rollback = await master.rollback({ confirmed: true });
        error.message = `${error.message} Die zuvor aktive Masterversion wurde automatisch wiederhergestellt (${rollback?.activeCandidateId || "Rollback erfolgreich"}).`;
      } catch (rollbackError) {
        error.message = `${error.message} Automatischer Rollback fehlgeschlagen: ${rollbackError.message}`;
      }
    }
    throw error;
  } finally {
    await master.close().catch(() => {});
    reference.close();
  }
}

function printHuman(report) {
  const mib = report.storage ? (report.storage.bytes / 1024 ** 2).toFixed(2) : "0.00";
  console.log("Taxonomie-Mastermigration abgeschlossen.");
  console.log(`Projektarten: ${report.projectSpecies}`);
  console.log(`Mastertaxa: ${report.verification?.status?.summary?.taxa ?? 0}`);
  console.log(`Konflikte: ${report.conflicts?.total ?? 0}, davon blockierend: ${report.conflicts?.blocking ?? 0}`);
  console.log(`Offline-Prüfung: ${report.verification?.checkedSpecies ?? 0} Arten in ${report.verification?.elapsedMs ?? 0} ms`);
  console.log(`Masterspeicher: ${mib} MiB in ${report.storage?.files ?? 0} Dateien`);
  if (report.rollback?.tested) console.log("Rollbacktest: erfolgreich");
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const options = parseOptions();
  runTaxonomyMasterMigration(options).then((report) => {
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
  }).catch((error) => {
    console.error(`Taxonomie-Mastermigration fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  });
}

export const taxonomyMasterMigrationInternals = Object.freeze({
  cleanupTemporaryArtifacts,
  directoryBytes,
  listTemporaryArtifacts,
  parseOptions,
  projectSpecies,
  stageRollbackProbe,
  verifyStore,
});
