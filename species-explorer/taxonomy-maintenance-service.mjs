import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { childProcessEnvironment } from "./child-process-environment.mjs";
import { extractTaxonomyArchive } from "./taxonomy-archive.mjs";
import { rollbackTaxonomyRelease } from "./taxonomy-import.mjs";
import {
  compareProjectSpeciesWithTaxonomyRelease,
  readProjectTaxonomyConflictReport,
} from "./taxonomy-project-conflicts.mjs";
import {
  discoverLatestCatalogueRelease,
  downloadCatalogueArchive,
} from "./taxonomy-release-client.mjs";
import {
  activateTaxonomyRelease,
  atomicWriteJson,
  listTaxonomyReleaseIds,
  readActiveTaxonomyPointer,
  taxonomyReleaseManifestPath,
} from "./taxonomy-storage.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

const IMPORT_SCRIPT = fileURLToPath(
  new URL("../scripts/taxonomy-full-import.mjs", import.meta.url),
);
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const REQUIRED_FREE_BYTES = 12 * 1024 ** 3;
const ACTIVE_STATUSES = new Set([
  "downloading",
  "extracting",
  "importing",
  "comparing",
  "activating",
  "supplementing",
  "rolling-back",
]);

function createHttpError(message, statusCode = 500, details = []) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function initialState() {
  return {
    status: "idle",
    phase: "",
    action: "",
    message: "Noch keine Aktualisierung gestartet.",
    progressPercent: null,
    startedAt: "",
    completedAt: "",
    releaseId: "",
    latest: null,
    updateCatalogue: false,
    updateSupplements: false,
    conflicts: null,
    conflictDetails: null,
    supplementRefresh: null,
    error: "",
  };
}

function progressPercent({ phase, current, total }) {
  const ratio = Number(total) > 0
    ? Math.max(0, Math.min(1, Number(current) / Number(total)))
    : 0;
  const ranges = {
    download: [0, 18],
    extract: [18, 27],
    "name-usages": [27, 58],
    materialize: [58, 65],
    "vernacular-names": [65, 75],
    "search-index": [75, 83],
    compact: [83, 86],
    complete: [86, 87],
    compare: [87, 91],
    activate: [91, 94],
    supplements: [94, 100],
    rollback: [0, 100],
  };
  const [start, end] = ranges[phase] ?? [0, 100];
  return Math.round(start + ((end - start) * ratio));
}

async function availableDiskBytes(directory) {
  await fs.mkdir(directory, { recursive: true });
  const stats = await fs.statfs(directory);
  return Number(stats.bavail) * Number(stats.bsize);
}

async function removeWorkDirectory(directory) {
  if (!directory) return;
  for (const delay of [0, 150, 500]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await fs.rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code)) throw error;
    }
  }
}

function parseChildLine(line, onProgress) {
  if (line.startsWith("PROGRESS\t")) {
    const progress = JSON.parse(line.slice("PROGRESS\t".length));
    onProgress(progress);
    return null;
  }
  if (line.startsWith("RESULT\t")) {
    return JSON.parse(line.slice("RESULT\t".length));
  }
  return null;
}

function summarizeImportFailure(stderr, code) {
  const lines = String(stderr || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const errorLine = lines.find((line) => /^error:\s*/i.test(line));
  if (errorLine) return errorLine.replace(/^error:\s*/i, "");
  const readableLine = lines.find((line) => !/^at\s+/i.test(line));
  return readableLine || `Der Taxonomieimport wurde mit Code ${code} beendet.`;
}

export class TaxonomyMaintenanceService {
  constructor({
    taxonomyRoot,
    repoRoot,
    referenceService,
    supplementService = null,
    mappingsPath = path.join(repoRoot || "", "species-reference-mappings.json"),
    speciesListPath = path.join(repoRoot || "", "species_list.json"),
    discoverRelease = discoverLatestCatalogueRelease,
    downloadArchive = downloadCatalogueArchive,
    extractArchive = extractTaxonomyArchive,
    compareProjectSpecies = compareProjectSpeciesWithTaxonomyRelease,
    readProjectConflicts = readProjectTaxonomyConflictReport,
    activateRelease = activateTaxonomyRelease,
    rollbackRelease = rollbackTaxonomyRelease,
    listReleases = listTaxonomyReleaseIds,
    readPointer = readActiveTaxonomyPointer,
    spawnImpl = spawn,
    execPath = process.execPath,
    now = () => new Date(),
    isProjectBusy = () => false,
    diskBytes = availableDiskBytes,
  } = {}) {
    if (!taxonomyRoot || !repoRoot || !referenceService) {
      throw new TypeError("Taxonomiepfad, Projektpfad und Referenzdienst sind erforderlich.");
    }
    this.taxonomyRoot = path.resolve(taxonomyRoot);
    this.repoRoot = path.resolve(repoRoot);
    this.referenceService = referenceService;
    this.supplementService = supplementService;
    this.mappingsPath = path.resolve(mappingsPath);
    this.speciesListPath = path.resolve(speciesListPath);
    this.discoverRelease = discoverRelease;
    this.downloadArchive = downloadArchive;
    this.extractArchive = extractArchive;
    this.compareProjectSpecies = compareProjectSpecies;
    this.readProjectConflicts = readProjectConflicts;
    this.activateRelease = activateRelease;
    this.rollbackRelease = rollbackRelease;
    this.listReleases = listReleases;
    this.readPointer = readPointer;
    this.spawnImpl = spawnImpl;
    this.execPath = execPath;
    this.now = now;
    this.isProjectBusy = isProjectBusy;
    this.diskBytes = diskBytes;
    this.cachePath = path.join(this.taxonomyRoot, "release-check.json");
    this.workRoot = path.join(this.taxonomyRoot, "work");
    this.state = initialState();
    this.latest = null;
    this.latestCheckedAt = "";
    this.latestCheckError = "";
    this.preview = null;
    this.child = null;
    this.closed = false;
  }

  assertOpen() {
    if (this.closed) throw createHttpError("Die Taxonomiewartung wurde bereits beendet.", 503);
  }

  isActive() {
    return ACTIVE_STATUSES.has(this.state.status);
  }

  updateProgress(progress) {
    this.state.phase = String(progress?.phase || this.state.phase);
    this.state.message = String(progress?.message || this.state.message);
    this.state.progressPercent = progressPercent(progress || {});
  }

  async checkLatest({ force = false, visible = false } = {}) {
    this.assertOpen();
    if (visible && !this.isActive()) {
      this.state = {
        ...initialState(),
        status: "checking",
        action: "check",
        message: "Neue Taxonomiereferenz wird gesucht…",
      };
    }
    try {
      const result = await this.discoverRelease({
        cachePath: this.cachePath,
        force,
        now: this.now,
      });
      this.latest = result.latest;
      this.latestCheckedAt = result.checkedAt;
      this.latestCheckError = "";
      if (visible && this.state.status === "checking") {
        this.state = {
          ...initialState(),
          status: "completed",
          action: "check",
          message: "Versionsprüfung abgeschlossen.",
          completedAt: this.now().toISOString(),
          latest: this.latest,
        };
      }
      return result;
    } catch (error) {
      this.latestCheckError = error.message;
      if (visible && this.state.status === "checking") {
        this.state = {
          ...initialState(),
          status: "failed",
          action: "check",
          message: "Versionsprüfung fehlgeschlagen.",
          completedAt: this.now().toISOString(),
          error: error.message,
        };
      }
      throw error;
    }
  }

  async refreshProjectComparisonIfNeeded() {
    const pointer = await this.readPointer(this.taxonomyRoot);
    const activeRelease = pointer?.activeRelease || "";
    if (!activeRelease) return null;
    const report = await this.readProjectConflicts({
      taxonomyRoot: this.taxonomyRoot,
      releaseId: activeRelease,
    });
    if (report?.policy?.speciesLevelReferenceGapsRecognized === true) return report;
    return this.compareProjectSpecies({
      taxonomyRoot: this.taxonomyRoot,
      releaseId: activeRelease,
      speciesListPath: this.speciesListPath,
      mappingsPath: this.mappingsPath,
      now: this.now,
    });
  }

  async startupCheck() {
    await this.refreshProjectComparisonIfNeeded().catch(() => null);
    return this.checkLatest({ force: false, visible: false }).catch(() => null);
  }

  async installedStatus() {
    const [reference, pointer, installedReleases] = await Promise.all([
      this.referenceService.status(),
      this.readPointer(this.taxonomyRoot),
      this.listReleases(this.taxonomyRoot),
    ]);
    const activeRelease = pointer?.activeRelease || reference?.releaseId || "";
    const latestRelease = this.latest?.releaseId || "";
    const catalogueUpdateAvailable = Boolean(
      latestRelease
      && (
        latestRelease !== activeRelease
        || reference?.boundedPrototype === true
      )
    );
    const supplements = reference?.supplements || null;
    const supplementUpdateAvailable = Boolean(
      activeRelease
      && this.supplementService
      && supplements?.available === true
      && supplements?.stale === true
    );
    const conflictReport = activeRelease
      ? await this.readProjectConflicts({
        taxonomyRoot: this.taxonomyRoot,
        releaseId: activeRelease,
      })
      : null;
    return {
      reference,
      activeRelease,
      previousRelease: pointer?.previousRelease || null,
      installedReleases,
      supplements,
      catalogueUpdateAvailable,
      supplementUpdateAvailable,
      updateAvailable: catalogueUpdateAvailable || supplementUpdateAvailable,
      latestInstalled: Boolean(latestRelease && installedReleases.includes(latestRelease)),
      persistedConflicts: conflictReport?.summary ?? null,
      persistedConflictDetails: conflictReport?.results
        ?.filter((entry) => entry.severity !== "ok")
        ?? null,
    };
  }

  async status() {
    this.assertOpen();
    const installed = await this.installedStatus();
    return {
      ...this.state,
      active: this.isActive(),
      latest: this.latest,
      latestCheckedAt: this.latestCheckedAt,
      latestCheckError: this.latestCheckError,
      conflicts: this.state.conflicts ?? installed.persistedConflicts,
      conflictDetails: this.state.conflictDetails ?? installed.persistedConflictDetails,
      ...installed,
      rollbackAvailable: Boolean(installed.previousRelease),
      policy: {
        existingSpeciesChangedAutomatically: false,
        uniqueSynonymsAreSuggestionsOnly: true,
        ambiguousMatchesAreNeverSelectedAutomatically: true,
      },
    };
  }

  async decideProjectConflict({ action, scientificName } = {}) {
    this.assertOpen();
    this.assertProjectReady();
    if (this.isActive()) {
      throw createHttpError("Während einer Taxonomie-Aktualisierung können keine Konflikte entschieden werden.", 409);
    }
    if (action !== "accept-external-reference-gap") {
      throw createHttpError("Unbekannte Konfliktentscheidung.", 400);
    }
    const normalizedName = normalizeTaxonomySearchTerm(scientificName);
    if (!normalizedName) throw createHttpError("Der wissenschaftliche Name fehlt.", 400);

    const pointer = await this.readPointer(this.taxonomyRoot);
    const activeRelease = pointer?.activeRelease || "";
    if (!activeRelease) throw createHttpError("Es ist keine Taxonomiedatenbank aktiv.", 409);
    const report = await this.readProjectConflicts({
      taxonomyRoot: this.taxonomyRoot,
      releaseId: activeRelease,
    });
    const conflict = report?.results?.find((entry) => (
      normalizeTaxonomySearchTerm(entry.scientificName) === normalizedName
      && entry.classification === "reference-gap"
    ));
    if (!conflict) {
      throw createHttpError("Für diese Art liegt keine entscheidbare CoL-Referenzlücke vor.", 409);
    }

    let exact = typeof this.referenceService.exactMasterTaxonByScientificName === "function"
      ? await this.referenceService.exactMasterTaxonByScientificName(scientificName, {
        rank: "species",
        kingdom: "Animalia",
      })
      : null;
    if (!exact) {
      const search = await this.referenceService.search({
        query: scientificName,
        kind: "scientific",
        kingdomId: "Animalia",
        rank: "species",
        limit: 12,
      });
      exact = (search?.results || []).find((entry) => (
        normalizeTaxonomySearchTerm(entry.acceptedScientificName) === normalizedName
        && entry.rank === "species"
      ));
    }
    const statusIds = (exact?.masterStatuses || []).map((entry) => (
      typeof entry === "string" ? entry : entry?.id
    )).filter(Boolean);
    if (
      !exact?.masterTaxonId
      || !statusIds.includes("col-reference-gap")
      || !statusIds.includes("externally-confirmed")
    ) {
      throw createHttpError(
        "Die aktive Masterdatenbank bestätigt diese Art nicht eindeutig als externe CoL-Referenzlücke.",
        409,
      );
    }

    let document = { schemaVersion: 1, mappings: {} };
    try {
      const parsed = JSON.parse(await fs.readFile(this.mappingsPath, "utf8"));
      if (parsed?.schemaVersion === 1 && parsed.mappings && typeof parsed.mappings === "object") {
        document = parsed;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    document.mappings[normalizedName] = {
      sourceType: "master",
      masterTaxonId: exact.masterTaxonId,
      scientificName: exact.acceptedScientificName,
      rank: exact.rank,
      sourceProviders: exact.sourceProviders || [],
      statuses: statusIds,
      decision: action,
      confirmedAt: this.now().toISOString(),
    };
    await atomicWriteJson(this.mappingsPath, document);
    const nextReport = await this.compareProjectSpecies({
      taxonomyRoot: this.taxonomyRoot,
      releaseId: activeRelease,
      speciesListPath: this.speciesListPath,
      mappingsPath: this.mappingsPath,
      now: this.now,
    });
    this.state = {
      ...this.state,
      conflicts: nextReport.summary,
      conflictDetails: nextReport.results.filter((entry) => entry.severity !== "ok"),
      message: `${conflict.germanName || conflict.scientificName} wurde durch die Masterdatenbank bestätigt.`,
    };
    return this.status();
  }

  async projectScientificNames() {
    const entries = JSON.parse(await fs.readFile(this.speciesListPath, "utf8"));
    if (!Array.isArray(entries)) {
      throw new Error("Die Artenliste ist für die Ergänzungsaktualisierung ungültig.");
    }
    return [...new Set(entries.map((entry) => (
      [entry?.genus, entry?.species]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" ")
    )).filter((value) => value.includes(" ")))];
  }

  async previewUpdate() {
    this.assertOpen();
    if (this.isActive()) {
      throw createHttpError("Eine Taxonomie-Aktualisierung läuft bereits.", 409);
    }
    let releaseCheckError = null;
    try {
      await this.checkLatest({ force: true, visible: true });
    } catch (error) {
      releaseCheckError = error;
    }
    const installed = await this.installedStatus();
    if (releaseCheckError && !installed.supplementUpdateAvailable) {
      throw releaseCheckError;
    }
    const updateCatalogue = installed.catalogueUpdateAvailable;
    const updateSupplements = Boolean(
      this.supplementService
      && (updateCatalogue || installed.supplementUpdateAvailable)
    );
    const hasWork = updateCatalogue || updateSupplements;
    const targetRelease = updateCatalogue
      ? this.latest
      : installed.reference?.source || { releaseId: installed.activeRelease };
    const token = hasWork ? crypto.randomUUID() : "";
    this.preview = hasWork
      ? {
        token,
        releaseId: targetRelease.releaseId,
        updateCatalogue,
        updateSupplements,
        expiresAt: this.now().getTime() + PREVIEW_TTL_MS,
      }
      : null;
    const warning = updateCatalogue
      ? updateSupplements
        ? "Die vollständige CoL-Referenz umfasst mehrere Millionen Namen. Anschließend werden fehlende deutsche und englische Namen aus iNaturalist, GBIF, WoRMS und Wikidata ergänzt. Der Download kann deutlich über 1 GB groß sein und der Import längere Zeit dauern."
        : "Die vollständige CoL-Referenz umfasst mehrere Millionen Namen. Der Download kann deutlich über 1 GB groß sein und der Import längere Zeit dauern."
      : updateSupplements
        ? "Catalogue of Life ist aktuell. Ergänzungsnamen aus iNaturalist, GBIF, WoRMS und Wikidata werden neu geprüft; die letzte funktionierende lokale Ergänzungsreferenz bleibt bei Quellenfehlern erhalten."
        : "Die installierte Taxonomiereferenz einschließlich der Ergänzungsnamen ist aktuell.";
    return {
      token,
      hasWork,
      latest: targetRelease,
      ...installed,
      updateCatalogue,
      updateSupplements,
      requiredFreeBytes: REQUIRED_FREE_BYTES,
      downloadRequired: updateCatalogue && !installed.latestInstalled,
      warning,
      conflictPolicy: {
        exactNames: "werden unverändert bestätigt",
        uniqueSynonyms: "werden nur als Vorschlag angezeigt",
        ambiguousOrMissing: "werden zur manuellen Prüfung markiert",
        automaticProjectChanges: false,
      },
    };
  }

  assertProjectReady() {
    if (this.isProjectBusy()) {
      throw createHttpError(
        "Eine andere Datenbank-Aktion läuft bereits. Bitte diese zuerst abschließen.",
        409,
      );
    }
  }

  async startUpdate({ token } = {}) {
    this.assertOpen();
    this.assertProjectReady();
    if (
      !this.preview
      || this.preview.token !== token
      || this.preview.expiresAt <= this.now().getTime()
      || (
        this.preview.updateCatalogue
        && this.preview.releaseId !== this.latest?.releaseId
      )
    ) {
      throw createHttpError("Die Aktualisierungsvorschau ist abgelaufen. Bitte erneut prüfen.", 409);
    }
    const operation = {
      ...this.preview,
      release: this.preview.updateCatalogue
        ? this.latest
        : {
          releaseId: this.preview.releaseId,
        },
    };
    this.preview = null;
    this.state = {
      ...initialState(),
      status: operation.updateCatalogue ? "downloading" : "supplementing",
      phase: operation.updateCatalogue ? "download" : "supplements",
      action: "update",
      message: operation.updateCatalogue
        ? "CoL-Referenz wird vorbereitet…"
        : "Ergänzungsquellen werden vorbereitet…",
      progressPercent: 0,
      startedAt: this.now().toISOString(),
      releaseId: operation.release.releaseId,
      latest: operation.release,
      updateCatalogue: operation.updateCatalogue,
      updateSupplements: operation.updateSupplements,
    };
    void this.runUpdate(operation);
    return this.status();
  }

  async runUpdate({
    release,
    updateCatalogue = true,
    updateSupplements = false,
  }) {
    const operationId = crypto.randomUUID();
    const workDirectory = path.join(this.workRoot, `update-${operationId}`);
    const archivePath = path.join(workDirectory, "catalogue-of-life.zip");
    const packageDirectory = path.join(workDirectory, "package");
    try {
      this.assertProjectReady();
      let conflicts = null;
      if (updateCatalogue) {
        const installedReleases = await this.listReleases(this.taxonomyRoot);
        if (!installedReleases.includes(release.releaseId)) {
          const freeBytes = await this.diskBytes(this.taxonomyRoot);
          if (freeBytes < REQUIRED_FREE_BYTES) {
            throw createHttpError(
              "Für den vollständigen Taxonomieimport ist nicht genügend freier Speicher vorhanden.",
              507,
              [
                `Erforderlich: mindestens ${(REQUIRED_FREE_BYTES / 1024 ** 3).toFixed(0)} GB frei.`,
                `Verfügbar: ${(freeBytes / 1024 ** 3).toFixed(1)} GB.`,
              ],
            );
          }
          await fs.mkdir(workDirectory, { recursive: true });
          const archive = await this.downloadArchive({
            release,
            targetPath: archivePath,
            onProgress: (entry) => this.updateProgress(entry),
          });
          this.state.status = "extracting";
          this.updateProgress({
            phase: "extract",
            current: 0,
            total: 1,
            message: "Referenzpaket wird sicher entpackt",
          });
          await this.extractArchive({
            archivePath,
            destinationPath: packageDirectory,
            onProgress: (entry) => this.updateProgress(entry),
          });
          const releasePath = path.join(workDirectory, "release.json");
          const archiveMetadataPath = path.join(workDirectory, "archive.json");
          await Promise.all([
            atomicWriteJson(releasePath, release),
            atomicWriteJson(archiveMetadataPath, archive),
          ]);
          this.state.status = "importing";
          await this.runImportChild({
            packageDirectory,
            releasePath,
            archiveMetadataPath,
          });
        }

        this.state.status = "comparing";
        this.updateProgress({
          phase: "compare",
          current: 0,
          total: 1,
          message: "Vorhandene Arten werden konfliktfrei abgeglichen",
        });
        conflicts = await this.compareProjectSpecies({
          taxonomyRoot: this.taxonomyRoot,
          releaseId: release.releaseId,
          speciesListPath: this.speciesListPath,
          mappingsPath: this.mappingsPath,
          now: this.now,
        });
        this.state.conflicts = conflicts.summary;
        this.state.conflictDetails = conflicts.results.filter(
          (entry) => entry.severity !== "ok",
        );
        this.updateProgress({
          phase: "compare",
          current: 1,
          total: 1,
          message: "Vorhandene Arten wurden geprüft; keine Projektdaten wurden verändert",
        });

        this.state.status = "activating";
        this.updateProgress({
          phase: "activate",
          current: 0,
          total: 1,
          message: "Geprüfte CoL-Referenz wird atomar aktiviert",
        });
        this.referenceService.reset();
        await this.activateRelease(this.taxonomyRoot, release.releaseId, { now: this.now });
        this.updateProgress({
          phase: "activate",
          current: 1,
          total: 1,
          message: "Neue CoL-Referenz ist aktiv",
        });
      }

      let supplementRefresh = null;
      if (updateSupplements && this.supplementService) {
        this.state.status = "supplementing";
        this.updateProgress({
          phase: "supplements",
          current: 0,
          total: 1,
          message: "Ergänzungsquellen werden vorbereitet",
        });
        try {
          const store = await this.referenceService.requireStore();
          supplementRefresh = await this.supplementService.refreshKnown({
            store,
            scientificNames: await this.projectScientificNames(),
            onProgress: (entry) => this.updateProgress({
              phase: "supplements",
              ...entry,
            }),
          });
        } catch (error) {
          supplementRefresh = {
            targetCount: 0,
            imported: 0,
            warnings: [error.message],
            preservedPreviousCache: true,
          };
        }
        this.state.supplementRefresh = supplementRefresh;
      }

      const supplementWarnings = supplementRefresh?.warnings || [];
      const supplementsUnavailable = Boolean(
        updateSupplements
        && supplementRefresh
        && supplementRefresh.targetCount > 0
        && supplementRefresh.refreshedTargets === 0,
      );
      const conflictWarnings = conflicts && (
        conflicts.summary.suggestions
        || conflicts.summary.referenceGaps
        || conflicts.summary.ambiguous
        || conflicts.summary.missing
      );
      const completedMessage = updateCatalogue
        ? conflictWarnings
          ? "CoL-Referenz aktualisiert. Hinweise zu bestehenden Arten warten auf manuelle Prüfung."
          : "CoL-Referenz aktualisiert. Alle bestehenden Arten stimmen eindeutig überein."
        : supplementsUnavailable
          ? "Die Ergänzungsnamen konnten nicht neu abgerufen werden."
          : "Ergänzungsnamen wurden aktualisiert.";
      this.state = {
        ...this.state,
        status: "completed",
        completedAt: this.now().toISOString(),
        progressPercent: 100,
        message: supplementsUnavailable
          ? `${completedMessage} Der letzte funktionierende lokale Stand bleibt aktiv.`
          : supplementWarnings.length
            ? `${completedMessage} ${supplementWarnings.length} Quellenhinweis(e) wurden protokolliert; vorhandene letzte funktionierende Einträge bleiben erhalten.`
          : updateSupplements
            ? `${completedMessage} Ergänzungsnamen aus iNaturalist, GBIF, WoRMS und Wikidata sind geprüft.`
            : completedMessage,
        error: "",
      };
    } catch (error) {
      this.referenceService.reset();
      this.state = {
        ...this.state,
        status: "failed",
        completedAt: this.now().toISOString(),
        message: "Taxonomie-Aktualisierung fehlgeschlagen. Die bisherige Version bleibt aktiv.",
        error: error.message,
      };
    } finally {
      this.child = null;
      await removeWorkDirectory(workDirectory).catch(() => {});
    }
  }

  runImportChild({ packageDirectory, releasePath, archiveMetadataPath }) {
    return new Promise((resolve, reject) => {
      const args = [
        IMPORT_SCRIPT,
        `--package=${packageDirectory}`,
        `--taxonomy-root=${this.taxonomyRoot}`,
        `--release=${releasePath}`,
        `--archive=${archiveMetadataPath}`,
      ];
      const child = this.spawnImpl(this.execPath, args, {
        cwd: this.repoRoot,
        windowsHide: true,
        env: childProcessEnvironment(this.execPath),
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.child = child;
      let stderr = "";
      let result = null;
      const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
      lines.on("line", (line) => {
        const parsed = parseChildLine(line, (progress) => this.updateProgress(progress));
        if (parsed) result = parsed;
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("close", (code) => {
        lines.close();
        if (code !== 0) {
          reject(new Error(summarizeImportFailure(stderr, code)));
          return;
        }
        if (!result?.releaseId) {
          reject(new Error("Der Taxonomieimport hat kein gültiges Ergebnis geliefert."));
          return;
        }
        resolve(result);
      });
    });
  }

  async rollback() {
    this.assertOpen();
    this.assertProjectReady();
    this.state = {
      ...initialState(),
      status: "rolling-back",
      phase: "rollback",
      action: "rollback",
      message: "Vorherige Taxonomiereferenz wird wiederhergestellt…",
      progressPercent: 0,
      startedAt: this.now().toISOString(),
    };
    try {
      this.referenceService.reset();
      const pointer = await this.rollbackRelease(this.taxonomyRoot, { now: this.now });
      this.state = {
        ...this.state,
        status: "completed",
        releaseId: pointer.activeRelease,
        message: "Vorherige Taxonomiereferenz wurde wiederhergestellt.",
        progressPercent: 100,
        completedAt: this.now().toISOString(),
      };
      return this.status();
    } catch (error) {
      this.state = {
        ...this.state,
        status: "failed",
        message: "Wiederherstellung der Taxonomiereferenz fehlgeschlagen.",
        error: error.message,
        completedAt: this.now().toISOString(),
      };
      throw error;
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.child && !this.child.killed) this.child.kill();
  }
}

export function createTaxonomyMaintenanceService(options) {
  return new TaxonomyMaintenanceService(options);
}

export const taxonomyMaintenanceInternals = Object.freeze({
  REQUIRED_FREE_BYTES,
  ACTIVE_STATUSES,
  progressPercent,
  parseChildLine,
  removeWorkDirectory,
  summarizeImportFailure,
});
