import fs from "node:fs/promises";
import path from "node:path";

import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import {
  activateTaxonomyMasterCandidate,
  decideTaxonomyMasterConflict,
  inspectTaxonomyMasterLifecycle,
  rollbackTaxonomyMaster,
} from "./taxonomy-master-lifecycle.mjs";
import {
  latestProviderSliceVersion,
  readProviderSlice,
} from "./taxonomy-master-slices.mjs";
import {
  canonicalSpeciesName,
  isMasterSpeciesCandidate,
} from "./taxonomy-taxon-quality.mjs";

const PROVIDERS = Object.freeze(["inaturalist", "gbif", "worms", "wikidata", "animalia"]);
const LIGHTROOM_PROGRESS_PHASES = Object.freeze({
  schema: "Schema",
  copy: "Taxonomieexport",
  index: "Suchindizes",
  validate: "Paketprüfung",
  verify: "Vollprüfung",
  activate: "Vollprüfung und Aktivierung",
  complete: "Abgeschlossen",
});
const ACTIVE_STATUSES = new Set([
  "refreshing",
  "building",
  "activating",
  "rolling-back",
  "syncing-lightroom",
]);

function initialState() {
  return {
    status: "idle",
    action: "",
    message: "Noch kein Master-Abgleich gestartet.",
    progressPercent: null,
    progressPhase: "",
    progressCurrent: null,
    progressTotal: null,
    startedAt: "",
    completedAt: "",
    error: "",
    warnings: [],
    result: null,
  };
}

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function projectTaxaFromSpeciesList(speciesList) {
  return (Array.isArray(speciesList) ? speciesList : []).map((entry) => {
    const scientificName = cleanText(
      entry.scientificName
      || [entry.genus, entry.species].map(cleanText).filter(Boolean).join(" "),
    );
    const projectSlug = cleanText(entry.slug || entry.urlSlug)
      || scientificName.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
    return {
      projectTaxonKey: cleanText(entry.projectTaxonKey || projectSlug),
      projectSlug,
      scientificName,
      rank: cleanText(entry.rank || "species").toLocaleLowerCase("en"),
      kingdom: cleanText(entry.kingdom || "Animalia"),
      germanName: cleanText(entry.germanName || entry.german),
      englishName: cleanText(entry.englishName || entry.english),
    };
  }).filter((entry) => entry.scientificName);
}

function correctionsFromDocument(document) {
  return (Array.isArray(document?.entries) ? document.entries : []).map((entry) => ({
    scientificName: cleanText(entry.scientificName),
    rank: cleanText(entry.rank || "species").toLocaleLowerCase("en"),
    kingdom: cleanText(entry.kingdom || "Animalia"),
    germanName: cleanText(entry.germanName),
    englishName: cleanText(entry.englishName),
    note: cleanText(entry.note),
  })).filter((entry) => entry.scientificName);
}

async function latestProviderSlices(taxonomyRoot) {
  const slices = [];
  for (const provider of PROVIDERS) {
    const latest = await latestProviderSliceVersion(taxonomyRoot, provider);
    if (!latest) continue;
    slices.push(await readProviderSlice(taxonomyRoot, provider, latest));
  }
  return slices;
}

function activeMasterProviderSlices(slices) {
  return slices.map((slice) => ({
    ...slice,
    records: (slice.records || []).filter((record) => (
      record.versionChangeState !== "removed"
      &&
      isMasterSpeciesCandidate(record)
      && (
        record.selectedForMaster
        || (record.relevanceReasons || []).some((reason) => [
          "col-reference-gap",
          "project-species",
          "missing-name",
          "missing-hierarchy",
          "manual-correction",
        ].includes(reason))
      )
    )),
  }));
}

function providerScientificNames(slices) {
  return slices.flatMap((slice) => slice.records || [])
    .map((record) => canonicalSpeciesName(record.scientificName))
    .filter(Boolean);
}

function normalizeColTaxon(detail, result, status) {
  return {
    providerRecordId: cleanText(
      detail?.source_id || detail?.sourceId || result?.sourceId || result?.taxonId,
    ),
    scientificName: cleanText(
      detail?.scientific_name || detail?.acceptedScientificName || result?.acceptedScientificName,
    ),
    rank: cleanText(detail?.rank || result?.rank || "species").toLocaleLowerCase("en"),
    kingdom: cleanText(
      detail?.kingdom?.scientificName || detail?.kingdom || result?.kingdom?.scientificName,
    ),
    taxonomicStatus: cleanText(detail?.status || result?.status || "accepted"),
    parentProviderRecordId: cleanText(detail?.parent_source_id),
    hierarchy: Array.isArray(detail?.hierarchy) ? detail.hierarchy : [],
    germanNames: detail?.germanNames || [],
    englishNames: detail?.englishNames || [],
    scientificNames: detail?.scientificNames || [],
    identifiers: detail?.identifiers || [],
    retrievedAt: status?.importedAt || new Date().toISOString(),
  };
}

async function collectColRecords(
  store,
  scientificNames,
  onProgress = () => {},
  { providerSlices = [] } = {},
) {
  const records = [];
  for await (const record of streamColRecords(
    store,
    scientificNames,
    onProgress,
    { providerSlices },
  )) {
    records.push(record);
  }
  return records;
}

async function* streamColRecords(
  store,
  scientificNames,
  onProgress = () => {},
  { providerSlices = [] } = {},
) {
  const status = store.status();
  const knownColTaxonIds = new Map();
  const knownColReferenceGaps = new Set();
  for (const slice of providerSlices) {
    for (const record of slice.records || []) {
      const scientificName = canonicalSpeciesName(record.scientificName);
      if (!scientificName) continue;
      if (record.colTaxonId) knownColTaxonIds.set(scientificName, record.colTaxonId);
      if ((record.relevanceReasons || []).includes("col-reference-gap")) {
        knownColReferenceGaps.add(scientificName);
      }
    }
  }
  const names = [...new Set(scientificNames.map(cleanText).filter(Boolean))];
  for (let index = 0; index < names.length; index += 1) {
    const scientificName = names[index];
    onProgress({ current: index, total: names.length, scientificName });
    if (knownColReferenceGaps.has(scientificName) && !knownColTaxonIds.has(scientificName)) {
      continue;
    }
    const knownColTaxonId = knownColTaxonIds.get(scientificName);
    if (knownColTaxonId) {
      const detail = store.taxon(knownColTaxonId);
      if (detail) yield normalizeColTaxon(detail, null, status);
      continue;
    }
    const result = store.findTaxonByScientificName(scientificName, { rank: "species" });
    if (!result) continue;
    const detail = store.taxon(result.taxonId || result.sourceId);
    if (detail) yield normalizeColTaxon(detail, result, status);
  }
  onProgress({ current: names.length, total: names.length || 1 });
}

function releaseFromStoreStatus(status) {
  return {
    releaseId: cleanText(status.releaseId),
    providerVersion: cleanText(status.releaseId),
    issuedAt: status.source?.issued || status.source?.issuedAt || null,
    importedAt: status.importedAt || new Date().toISOString(),
    sourceUrl: status.source?.url || status.source?.sourceUrl || null,
    checksumSha256: status.source?.checksumSha256 || null,
    license: status.source?.license || null,
    recordCount: Number(status.counts?.taxa || 0),
  };
}

export class TaxonomyMasterService {
  constructor({
    taxonomyRoot,
    referenceService,
    supplementService,
    providerRefreshService = null,
    speciesListPath,
    correctionsPath,
    isProjectBusy = () => false,
    now = () => new Date(),
    buildCandidate = buildTaxonomyMasterCandidate,
    inspectLifecycle = inspectTaxonomyMasterLifecycle,
    decideConflict = decideTaxonomyMasterConflict,
    activateCandidate = activateTaxonomyMasterCandidate,
    rollbackCandidate = rollbackTaxonomyMaster,
    inspectLightroomPackages = null,
    rebuildLightroomPackage = null,
  } = {}) {
    if (!taxonomyRoot || !referenceService || !speciesListPath || !correctionsPath) {
      throw new TypeError("Taxonomiepfad, Referenzdienst, Artenliste und Korrekturdatei sind erforderlich.");
    }
    this.taxonomyRoot = path.resolve(taxonomyRoot);
    this.referenceService = referenceService;
    this.supplementService = supplementService;
    this.providerRefreshService = providerRefreshService;
    this.speciesListPath = path.resolve(speciesListPath);
    this.correctionsPath = path.resolve(correctionsPath);
    this.isProjectBusy = isProjectBusy;
    this.now = now;
    this.buildCandidate = buildCandidate;
    this.inspectLifecycle = inspectLifecycle;
    this.decideConflict = decideConflict;
    this.activateCandidate = activateCandidate;
    this.rollbackCandidate = rollbackCandidate;
    this.inspectLightroomPackages = inspectLightroomPackages;
    this.rebuildLightroomPackage = rebuildLightroomPackage;
    this.state = initialState();
    this.closed = false;
    this.runPromise = null;
  }

  assertOpen() {
    if (this.closed) throw new Error("Die Masterdatenbank-Wartung wurde bereits beendet.");
  }

  isActive() {
    return ACTIVE_STATUSES.has(this.state.status);
  }

  updateProgress({
    status = this.state.status,
    phase = this.state.progressPhase,
    message = this.state.message,
    current = null,
    total = null,
    percent = this.state.progressPercent,
  } = {}) {
    this.state.status = status;
    this.state.progressPhase = phase;
    this.state.message = message;
    this.state.progressCurrent = current !== null
      && current !== undefined
      && Number.isFinite(Number(current))
      ? Number(current)
      : null;
    this.state.progressTotal = total !== null
      && total !== undefined
      && Number.isFinite(Number(total))
      ? Number(total)
      : null;
    this.state.progressPercent = Number.isFinite(Number(percent)) ? Number(percent) : null;
  }

  assertAvailable() {
    this.assertOpen();
    if (this.isActive() || this.isProjectBusy()) {
      const error = new Error("Es läuft bereits eine Datenbank-, Pipeline-, Backup- oder Asset-Aktion.");
      error.statusCode = 409;
      throw error;
    }
  }

  async status() {
    this.assertOpen();
    const lifecycle = await this.inspectLifecycle(this.taxonomyRoot).catch((error) => ({
      error: error.message,
      candidate: null,
      active: null,
      previous: null,
      conflicts: [],
      blockingConflicts: [],
      canActivate: false,
      canRollback: false,
    }));
    const lightroomPackage = await this.lightroomPackageStatus(lifecycle);
    return {
      ...this.state,
      active: this.isActive(),
      lifecycle,
      lightroomPackage,
    };
  }

  async lightroomPackageStatus(lifecycle = null) {
    if (typeof this.inspectLightroomPackages !== "function") return null;
    const snapshot = lifecycle || await this.inspectLifecycle(this.taxonomyRoot);
    const masterVersion = cleanText(
      snapshot.active?.candidateId || snapshot.active?.masterVersion,
    );
    let packages;
    try {
      packages = await this.inspectLightroomPackages();
    } catch (error) {
      return {
        status: "error",
        needsRebuild: Boolean(masterVersion),
        masterVersion,
        packageVersion: "",
        active: null,
        previous: null,
        error: error.message,
      };
    }
    const packageVersion = cleanText(packages?.active?.masterVersion);
    let status = "current";
    if (!masterVersion) status = "unavailable";
    else if (!packages?.active) status = "missing";
    else if (packageVersion !== masterVersion) status = "stale";
    return {
      status,
      needsRebuild: status === "missing" || status === "stale",
      masterVersion,
      packageVersion,
      active: packages?.active || null,
      previous: packages?.previous || null,
    };
  }

  startBuild(options = {}) {
    const refreshProviders = options.refreshProviders !== false;
    this.assertAvailable();
    const startedAt = this.now().toISOString();
    this.state = {
      ...initialState(),
      status: refreshProviders ? "refreshing" : "building",
      action: "build",
      message: refreshProviders
        ? "Anbieter-Ausschnitte werden aktualisiert."
        : "Master-Kandidat wird aufgebaut.",
      progressPercent: 0,
      progressPhase: refreshProviders ? "Anbieterquellen" : "Vorbereitung",
      startedAt,
    };
    this.runPromise = this.runBuild({ ...options, refreshProviders }).catch(() => null);
    return this.status();
  }

  async runBuild({ refreshProviders = true, ...providerOptions } = {}) {
    try {
      const [speciesList, correctionsDocument] = await Promise.all([
        readJson(this.speciesListPath, []),
        readJson(this.correctionsPath, { entries: [] }),
      ]);
      const projectTaxa = projectTaxaFromSpeciesList(speciesList);
      const corrections = correctionsFromDocument(correctionsDocument);
      const researchedTaxa = this.supplementService?.selectedTaxa
        ? await this.supplementService.selectedTaxa()
        : [];
      const store = await this.referenceService.requireStore();
      const warnings = [];
      if (refreshProviders && this.providerRefreshService) {
        const refreshed = await this.providerRefreshService.refresh({
          projectTaxa,
          corrections,
          researchedTaxa,
          store,
          ...providerOptions,
          onProgress: ({ current = 0, total = 100, message = "" } = {}) => {
            this.updateProgress({
              status: "refreshing",
              phase: "Anbieterquellen",
              message: message || "Anbieter-Ausschnitte werden aktualisiert.",
              current,
              total,
              percent: Math.round((Number(current) / Math.max(1, Number(total))) * 45),
            });
          },
        });
        warnings.push(...(refreshed.warnings || []));
      } else if (refreshProviders && this.supplementService) {
        const refreshed = await this.supplementService.refreshKnown({
          scientificNames: projectTaxa.map((entry) => entry.scientificName),
          store,
          onProgress: ({ current = 0, total = 1, message = "" } = {}) => {
            this.updateProgress({
              status: "refreshing",
              phase: "Anbieterquellen",
              message: message || "Anbieter-Ausschnitte werden aktualisiert.",
              current,
              total,
              percent: Math.round((Number(current) / Math.max(1, Number(total))) * 45),
            });
          },
        });
        warnings.push(...(refreshed.warnings || []));
      }
      this.updateProgress({
        status: "building",
        phase: "CoL-Referenz",
        message: "Relevante CoL-Taxa werden gelesen.",
        current: 0,
        total: null,
        percent: 45,
      });
      const providerSlices = activeMasterProviderSlices(
        await latestProviderSlices(this.taxonomyRoot),
      );
      const targetNames = [...new Set([
        ...projectTaxa.map((entry) => canonicalSpeciesName(entry.scientificName)),
        ...corrections.map((entry) => canonicalSpeciesName(entry.scientificName)),
        ...researchedTaxa.map((entry) => canonicalSpeciesName(entry.scientificName)),
        ...providerScientificNames(providerSlices),
      ].filter(Boolean))];
      const colRecords = streamColRecords(
        store,
        targetNames,
        ({ current, total }) => {
          this.updateProgress({
            status: "building",
            phase: "CoL-Referenz",
            message: "Relevante CoL-Taxa werden gelesen.",
            current,
            total,
            percent: 45 + Math.round((Number(current) / Math.max(1, Number(total))) * 15),
          });
        },
        { providerSlices },
      );
      const manifest = await this.buildCandidate({
        taxonomyRoot: this.taxonomyRoot,
        colRelease: releaseFromStoreStatus(store.status()),
        colRecords,
        providerSlices,
        projectTaxa,
        corrections,
        retainedTaxa: researchedTaxa,
        now: this.now,
        onProgress: ({ phase, message, current, total, percent }) => {
          this.updateProgress({
            status: "building",
            phase,
            message,
            current,
            total,
            percent,
          });
        },
      });
      const lifecycle = await this.inspectLifecycle(this.taxonomyRoot);
      this.state = {
        ...this.state,
        status: "ready",
        message: lifecycle.blockingConflicts.length
          ? `${lifecycle.blockingConflicts.length} Konflikt(e) müssen vor der Aktivierung entschieden werden.`
          : "Master-Kandidat ist geprüft und kann aktiviert werden.",
        progressPercent: 100,
        progressPhase: "Abgeschlossen",
        progressCurrent: null,
        progressTotal: null,
        completedAt: this.now().toISOString(),
        warnings: [...new Set(warnings)],
        result: { manifest, lifecycle },
      };
      return this.status();
    } catch (error) {
      this.state = {
        ...this.state,
        status: "failed",
        message: "Master-Abgleich fehlgeschlagen. Die bisherige aktive Version bleibt unverändert.",
        progressPercent: null,
        completedAt: this.now().toISOString(),
        error: error.message,
      };
      throw error;
    } finally {
      this.runPromise = null;
    }
  }

  async decide(payload = {}) {
    this.assertAvailable();
    await this.decideConflict(this.taxonomyRoot, { ...payload, now: this.now });
    this.state = {
      ...this.state,
      status: "ready",
      action: "decision",
      message: "Konfliktentscheidung wurde im Kandidaten gespeichert.",
      completedAt: this.now().toISOString(),
      error: "",
    };
    return this.status();
  }

  activate({ confirmed = false } = {}) {
    this.assertAvailable();
    if (!confirmed) {
      throw new Error("Die Aktivierung der Masterdatenbank muss ausdrücklich bestätigt werden.");
    }
    this.state = {
      ...initialState(),
      status: "activating",
      action: "activate",
      message: "Geprüfter Master-Kandidat wird atomar aktiviert.",
      progressPercent: 50,
      progressPhase: "Aktivierung",
      startedAt: this.now().toISOString(),
    };
    this.runPromise = this.runActivate({ confirmed }).catch(() => null);
    return this.status();
  }

  async runActivate({ confirmed = false } = {}) {
    let masterActivated = false;
    try {
      if (confirmed) this.referenceService.reset();
      await this.activateCandidate(this.taxonomyRoot, {
        confirmed,
        now: this.now,
      });
      masterActivated = true;
      const lightroomResult = await this.rebuildLightroomAfterMasterChange();
      this.state = {
        ...this.state,
        status: "completed",
        message: lightroomResult
          ? "Masterdatenbank und Lightroom-Suchpaket wurden erfolgreich aktiviert."
          : "Masterdatenbank wurde erfolgreich aktiviert.",
        progressPercent: 100,
        progressPhase: "Abgeschlossen",
        completedAt: this.now().toISOString(),
        result: lightroomResult ? { lightroomPackage: lightroomResult } : null,
      };
      return this.status();
    } catch (error) {
      this.state = {
        ...this.state,
        status: masterActivated ? "partial" : "failed",
        message: masterActivated
          ? "Die Masterdatenbank wurde aktiviert, aber das Lightroom-Suchpaket konnte nicht erneuert werden. Das bisherige Suchpaket bleibt aktiv; bitte „Datenbank aktualisieren“ erneut ausführen."
          : "Aktivierung fehlgeschlagen. Die bisherige Masterversion bleibt aktiv.",
        error: error.message,
        completedAt: this.now().toISOString(),
      };
      throw error;
    } finally {
      this.runPromise = null;
    }
  }

  rollback({ confirmed = false } = {}) {
    this.assertAvailable();
    if (!confirmed) {
      throw new Error("Die Wiederherstellung der vorherigen Masterversion muss ausdrücklich bestätigt werden.");
    }
    this.state = {
      ...initialState(),
      status: "rolling-back",
      action: "rollback",
      message: "Vorherige Masterversion wird wiederhergestellt.",
      progressPercent: 50,
      progressPhase: "Wiederherstellung",
      startedAt: this.now().toISOString(),
    };
    this.runPromise = this.runRollback({ confirmed }).catch(() => null);
    return this.status();
  }

  async runRollback({ confirmed = false } = {}) {
    let masterRestored = false;
    try {
      if (confirmed) this.referenceService.reset();
      await this.rollbackCandidate(this.taxonomyRoot, { confirmed, now: this.now });
      masterRestored = true;
      const lightroomResult = await this.rebuildLightroomAfterMasterChange();
      this.state = {
        ...this.state,
        status: "completed",
        message: lightroomResult
          ? "Vorherige Masterversion und passendes Lightroom-Suchpaket wurden erfolgreich wiederhergestellt."
          : "Vorherige Masterversion wurde erfolgreich wiederhergestellt.",
        progressPercent: 100,
        progressPhase: "Abgeschlossen",
        completedAt: this.now().toISOString(),
        result: lightroomResult ? { lightroomPackage: lightroomResult } : null,
      };
      return this.status();
    } catch (error) {
      this.state = {
        ...this.state,
        status: masterRestored ? "partial" : "failed",
        message: masterRestored
          ? "Die Masterdatenbank wurde wiederhergestellt, aber das passende Lightroom-Suchpaket konnte nicht aktiviert werden. Das bisherige Suchpaket bleibt aktiv; bitte „Datenbank aktualisieren“ erneut ausführen."
          : "Wiederherstellung der Masterdatenbank ist fehlgeschlagen.",
        error: error.message,
        completedAt: this.now().toISOString(),
      };
      throw error;
    } finally {
      this.runPromise = null;
    }
  }

  syncLightroomPackage() {
    this.assertAvailable();
    if (typeof this.rebuildLightroomPackage !== "function") {
      throw new Error("Der automatische Lightroom-Suchpaketbau ist nicht konfiguriert.");
    }
    this.state = {
      ...initialState(),
      status: "syncing-lightroom",
      action: "sync-lightroom",
      message: "Lightroom-Suchpaket wird aus der aktiven Masterdatenbank neu aufgebaut.",
      progressPercent: 0,
      progressPhase: "Lightroom-Suchpaket",
      startedAt: this.now().toISOString(),
    };
    this.runPromise = this.runLightroomPackageSync().catch(() => null);
    return this.status();
  }

  async runLightroomPackageSync() {
    try {
      const result = await this.rebuildLightroomAfterMasterChange();
      this.state = {
        ...this.state,
        status: "completed",
        message: "Lightroom-Suchpaket wurde erfolgreich neu aufgebaut und aktiviert.",
        progressPercent: 100,
        progressPhase: "Abgeschlossen",
        completedAt: this.now().toISOString(),
        error: "",
        result: { lightroomPackage: result },
      };
      return this.status();
    } catch (error) {
      this.state = {
        ...this.state,
        status: "partial",
        message: "Die Masterdatenbank ist aktiv, aber das Lightroom-Suchpaket konnte nicht erneuert werden. Das bisherige Suchpaket bleibt aktiv; bitte „Datenbank aktualisieren“ erneut ausführen.",
        error: error.message,
        completedAt: this.now().toISOString(),
      };
      throw error;
    } finally {
      this.runPromise = null;
    }
  }

  async rebuildLightroomAfterMasterChange() {
    if (typeof this.rebuildLightroomPackage !== "function") return null;
    this.updateProgress({
      status: "syncing-lightroom",
      phase: "Lightroom-Suchpaket",
      message: "Lightroom-Suchpaket wird aus der aktiven Masterdatenbank neu aufgebaut.",
      percent: 0,
    });
    return this.rebuildLightroomPackage({
      onProgress: ({ phase = "", message = "", percent = null } = {}) => {
        const normalizedPhase = cleanText(phase);
        const phaseLabel = LIGHTROOM_PROGRESS_PHASES[normalizedPhase] || normalizedPhase;
        this.updateProgress({
          status: "syncing-lightroom",
          phase: phaseLabel
            ? `Lightroom-Suchpaket · ${phaseLabel}`
            : "Lightroom-Suchpaket",
          message: cleanText(message)
            || "Lightroom-Suchpaket wird aufgebaut und geprüft.",
          percent,
        });
      },
    });
  }

  async close() {
    this.closed = true;
    await this.providerRefreshService?.close?.();
    await this.runPromise?.catch?.(() => null);
  }
}

export function createTaxonomyMasterService(options) {
  return new TaxonomyMasterService(options);
}

export const taxonomyMasterServiceInternals = Object.freeze({
  activeMasterProviderSlices,
  collectColRecords,
  correctionsFromDocument,
  latestProviderSlices,
  normalizeColTaxon,
  projectTaxaFromSpeciesList,
  releaseFromStoreStatus,
  streamColRecords,
});
