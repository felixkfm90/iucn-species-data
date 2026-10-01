import fs from "node:fs/promises";
import path from "node:path";

import {
  activateTaxonomyCorrectionRelease,
  readActiveTaxonomyCorrectionPointer,
  taxonomyCorrectionsMatchActive,
} from "./taxonomy-correction-release.mjs";
import {
  buildTaxonomyMasterCandidate,
  readTaxonomyMasterManifest,
  taxonomyCorrectionsRevision,
  taxonomyIdentityInputRevision,
} from "./taxonomy-master-candidate.mjs";
import {
  activateTaxonomyMasterCandidate,
  decideTaxonomyMasterConflict,
  inspectTaxonomyMasterLifecycle,
  rollbackTaxonomyMaster,
} from "./taxonomy-master-lifecycle.mjs";
import {
  latestProviderSliceVersion,
  providerSliceManifestPath,
  readProviderSlice,
} from "./taxonomy-master-slices.mjs";
import {
  canonicalSpeciesName,
  isMasterSpeciesCandidate,
} from "./taxonomy-taxon-quality.mjs";
import { readActiveTaxonomyPointer } from "./taxonomy-storage.mjs";
import { masterReferenceRelease, taxonomyMasterReferenceStatus } from "./taxonomy-data-versions.mjs";
import { createTaxonomyUpdatePresence } from "./taxonomy-update-presence.mjs";
import { createIdentityReviewService, readIdentityReview, identityReviewStatus } from "./taxonomy-identity-review.mjs";
import { coverMasterInputSelection } from "./taxonomy-master-inputs.mjs";
import { readTaxonomyPublication } from "./taxonomy-publication-storage.mjs";
import { MasterRunController } from "./taxonomy-master-run-controller.mjs";
import { masterJobBinding } from "./taxonomy-master-job.mjs";
import { readRetainedMasterTaxa } from "./taxonomy-master-source-binding.mjs";
import { createTaxonomyStorageMaintenance } from "./taxonomy-storage-maintenance.mjs";
import { assertTaxonomySpace } from "./taxonomy-space-budget.mjs";
import { taxonomyBaselineSetupStatus, assertBaselineSetup } from "./taxonomy-baseline-setup.mjs";

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
  "applying-corrections",
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
    ...(entry.germanNameMode === "provider" ? { germanNameMode: "provider" } : {}),
    ...(entry.namePreference?.masterTaxonId ? { namePreference: { masterTaxonId: cleanText(entry.namePreference.masterTaxonId) } } : {}),
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
  { providerSlices = [], recheckKnownReferenceGaps = false } = {},
) {
  const records = [];
  for await (const record of streamColRecords(
    store,
    scientificNames,
    onProgress,
    { providerSlices, recheckKnownReferenceGaps },
  )) {
    records.push(record);
  }
  return records;
}

async function* streamColRecords(
  store,
  scientificNames,
  onProgress = () => {},
  { providerSlices = [], recheckKnownReferenceGaps = false } = {},
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
    if (
      !recheckKnownReferenceGaps
      && knownColReferenceGaps.has(scientificName)
      && !knownColTaxonIds.has(scientificName)
    ) {
      continue;
    }
    // `colTaxonId` aus einem Anbieter-Ausschnitt ist die interne SQLite-Zeilen-ID
    // des damaligen CoL-Releases. Sie ist nur innerhalb genau dieses Releases
    // stabil und darf nach einem Referenzwechsel nicht wiederverwendet werden.
    const knownColTaxonId = recheckKnownReferenceGaps
      ? null
      : knownColTaxonIds.get(scientificName);
    if (knownColTaxonId) {
      const detail = store.taxon(knownColTaxonId);
      if (
        detail
        && canonicalSpeciesName(detail.scientific_name || detail.acceptedScientificName)
          === canonicalSpeciesName(scientificName)
      ) {
        yield normalizeColTaxon(detail, null, status);
        continue;
      }
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
    lightroomSearchRoot = null,
    isProjectBusy = () => false,
    now = () => new Date(),
    buildCandidate = buildTaxonomyMasterCandidate,
    inspectLifecycle = inspectTaxonomyMasterLifecycle,
    decideConflict = decideTaxonomyMasterConflict,
    activateCandidate = activateTaxonomyMasterCandidate,
    rollbackCandidate = rollbackTaxonomyMaster,
    inspectLightroomPackages = null,
    rebuildLightroomPackage = null,
    publishPair = null,
    activateCorrections = activateTaxonomyCorrectionRelease,
    readReferencePointer = readActiveTaxonomyPointer,
    backgroundBuild = false,
    runController = null,
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
    this.lightroomSearchRoot = lightroomSearchRoot ? path.resolve(lightroomSearchRoot) : null;
    this.isProjectBusy = isProjectBusy;
    this.now = now;
    this.buildCandidate = buildCandidate;
    this.inspectLifecycle = inspectLifecycle;
    this.decideConflict = decideConflict;
    this.activateCandidate = activateCandidate;
    this.rollbackCandidate = rollbackCandidate;
    this.inspectLightroomPackages = inspectLightroomPackages;
    this.rebuildLightroomPackage = rebuildLightroomPackage;
    this.publishPair = publishPair;
    this.activateCorrections = activateCorrections;
    this.readReferencePointer = readReferencePointer;
    this.runController = runController || (backgroundBuild ? new MasterRunController(this.taxonomyRoot) : null);
    this.storageMaintenance = this.runController && this.lightroomSearchRoot ? createTaxonomyStorageMaintenance({
      taxonomyRoot: this.taxonomyRoot, searchRoot: this.lightroomSearchRoot, controller: this.runController, now,
    }) : null;
    this.state = initialState();
    this.closed = false;
    this.runPromise = null;
    const withPresence = createTaxonomyUpdatePresence(this.taxonomyRoot);
    this.withVersionPresence = async (operation) => {
      try { return await (this.runController ? this.runController.exclusive(() => withPresence(operation)) : withPresence(operation)); }
      catch (error) {
        if (ACTIVE_STATUSES.has(this.state.status)) this.state = { ...this.state, status: "failed", error: error.message,
          message: "Datenbankaktion konnte nicht abgeschlossen werden. Der bisherige aktive Stand bleibt erhalten." };
        throw error;
      } finally { this.runPromise = null; }
    };
    this.identityReviewBusy = false;
    this.identityReviewService = createIdentityReviewService({ taxonomyRoot: this.taxonomyRoot, now: this.now,
      readInputRevision: async () => {
        const [species, corrections] = await Promise.all([readJson(this.speciesListPath, []), readJson(this.correctionsPath, { entries: [] })]);
        return taxonomyIdentityInputRevision({ projectTaxa: projectTaxaFromSpeciesList(species), corrections: correctionsFromDocument(corrections) });
      } });
  }

  assertOpen() {
    if (this.closed) throw new Error("Die Masterdatenbank-Wartung wurde bereits beendet.");
  }

  isActive() {
    return this.identityReviewBusy || ACTIVE_STATUSES.has(this.state.status) || Boolean(this.runController?.isActive());
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
    const buildJob = this.runController ? await this.runController.status() : { available: false };
    const lifecycle = await this.inspectLifecycle(this.taxonomyRoot, {
      lightweight: true,
    }).catch((error) => ({
      error: error.message,
      candidate: null,
      active: null,
      previous: null,
      conflicts: [],
      blockingConflicts: [],
      canActivate: false,
      canRollback: false,
    }));
    const [lightroomPackage, corrections, reference, identities] = await Promise.all([
      this.lightroomPackageStatus(lifecycle),
      this.correctionsStatus(lifecycle),
      this.referenceStatus(lifecycle),
      identityReviewStatus(this.taxonomyRoot, lifecycle),
    ]);
    if (identities.pending && !identities.candidateIncludesCurrent) lifecycle.canActivate = false;
    const incompleteJob = buildJob.available && buildJob.status !== "ready";
    if (incompleteJob) lifecycle.canActivate = false; // Do not activate an older unrelated staging candidate.
    const recovered = this.runController && !ACTIVE_STATUSES.has(this.state.status) && incompleteJob;
    const messages = { paused: "Masteraufbau pausiert. Der gesicherte Stand kann nach erneuter Prüfung fortgesetzt werden.",
      interrupted: "Masteraufbau wurde unterbrochen. Der gesicherte Stand ist erhalten; es wurde nichts automatisch gestartet.",
      stale: "Gespeicherter Masteraufbau ist veraltet. Bitte einen neuen Aufbau starten.",
      building: "Gespeicherter Masteraufbau läuft noch im Hintergrund.", pausing: "Pause angefordert. Der Hintergrundprozess hält am nächsten sicheren Punkt an.",
      failed: "Masteraufbau fehlgeschlagen. Der bisherige aktive Stand bleibt erhalten." };
    return {
      ...this.state,
      ...(recovered ? { status: buildJob.status, message: messages[buildJob.status],
        error: ["failed", "stale"].includes(buildJob.status) ? buildJob.error : "",
        progressPercent: buildJob.progress?.percent ?? null, progressPhase: buildJob.progress?.phase || "",
        progressCurrent: buildJob.progress?.current ?? null, progressTotal: buildJob.progress?.total ?? null,
        startedAt: buildJob.startedAt } : {}),
      active: this.isActive(),
      buildJob,
      lifecycle,
      lightroomPackage,
      corrections,
      reference,
      identities,
      baselineSetup: taxonomyBaselineSetupStatus({ lifecycle, lightroomPackage, corrections, reference,
        identities, buildJob, active: this.isActive() || this.isProjectBusy() }),
    };
  }

  async referenceStatus(lifecycle = null) {
    const snapshot = lifecycle || await this.inspectLifecycle(this.taxonomyRoot);
    try {
      const pointer = await this.readReferencePointer(this.taxonomyRoot);
      return taxonomyMasterReferenceStatus(pointer?.activeRelease, snapshot);
    } catch (error) {
      return {
        ...taxonomyMasterReferenceStatus("", snapshot),
        status: "error",
        error: error.message,
      };
    }
  }

  async correctionsStatus(lifecycle = null) {
    const snapshot = lifecycle || await this.inspectLifecycle(this.taxonomyRoot);
    const document = await readJson(this.correctionsPath, { entries: [] });
    const corrections = correctionsFromDocument(document);
    const currentRevision = taxonomyCorrectionsRevision(corrections);
    const activeRevision = cleanText(snapshot.active?.inputRevisions?.corrections);
    const candidateRevision = cleanText(snapshot.candidate?.inputRevisions?.corrections);
    const activeMasterVersion = cleanText(
      snapshot.active?.candidateId || snapshot.active?.masterVersion,
    );
    const correctionPointer = await readActiveTaxonomyCorrectionPointer(this.taxonomyRoot)
      .catch(() => null);
    const overlayRevision = correctionPointer?.baseMasterVersion === activeMasterVersion
      ? cleanText(correctionPointer.revision)
      : "";
    const activeManualCount = Number(
      snapshot.active?.sources?.find((source) => source.provider === "manual")?.recordCount || 0,
    );
    const activeCurrent = await taxonomyCorrectionsMatchActive({
      taxonomyRoot: this.taxonomyRoot, searchRoot: this.lightroomSearchRoot,
      corrections, activeRevision: overlayRevision || activeRevision,
    }) || (!activeRevision && !overlayRevision && corrections.length === 0 && activeManualCount === 0);
    return {
      count: corrections.length,
      currentRevision,
      pending: !activeCurrent,
      candidateIncludesCurrent: Boolean(candidateRevision)
        && candidateRevision === currentRevision,
      activeRevision: overlayRevision || activeRevision,
      activationMode: overlayRevision ? "incremental" : "master",
    };
  }

  async ensureCorrectionBaseline() {
    if (!this.lightroomSearchRoot) return false;
    if (this.runController?.isActive()) return false;
    // A paired master already has a verified baseline or a bound overlay. Do not
    // reinterpret historical correction names on startup after an identity change.
    if (readTaxonomyPublication(this.taxonomyRoot)) return false;
    const existing = await readActiveTaxonomyCorrectionPointer(this.taxonomyRoot);
    if (existing) return false;
    const lifecycle = await this.inspectLifecycle(this.taxonomyRoot, { lightweight: true });
    const activeRevision = cleanText(lifecycle.active?.inputRevisions?.corrections);
    if (!activeRevision) return false;
    const document = await readJson(this.correctionsPath, { entries: [] });
    const corrections = correctionsFromDocument(document);
    if (taxonomyCorrectionsRevision(corrections) !== activeRevision) return false;
    const packageStatus = await this.lightroomPackageStatus(lifecycle);
    if (packageStatus?.status !== "current") return false;
    await this.activateCorrections({
      taxonomyRoot: this.taxonomyRoot,
      searchRoot: this.lightroomSearchRoot,
      corrections,
      now: this.now,
    });
    this.referenceService.reset();
    return true;
  }

  applyCorrections({ confirmed = false } = {}) {
    this.assertAvailable();
    if (!confirmed) {
      throw new Error("Die Aktivierung der eigenen Namenskorrekturen muss ausdrücklich bestätigt werden.");
    }
    if (!this.lightroomSearchRoot) {
      throw new Error("Der gemeinsame Lightroom-Korrekturspeicher ist nicht konfiguriert.");
    }
    this.state = {
      ...initialState(),
      status: "applying-corrections",
      action: "apply-corrections",
      message: "Namenskorrekturen werden gegen Master und Lightroom-Suchpaket geprüft.",
      progressPercent: 5,
      progressPhase: "Korrekturen prüfen",
      startedAt: this.now().toISOString(),
    };
    this.runPromise = this.withVersionPresence(() => this.runApplyCorrections()).catch(() => null);
    return this.status();
  }

  async runApplyCorrections() {
    try {
      const document = await readJson(this.correctionsPath, { entries: [] });
      const corrections = correctionsFromDocument(document);
      this.updateProgress({
        status: "applying-corrections",
        phase: "Gemeinsamen Kandidaten vorbereiten",
        message: "Betroffene Taxa werden im aktiven Master und Lightroom-Paket abgeglichen.",
        percent: 30,
      });
      const result = await this.activateCorrections({
        taxonomyRoot: this.taxonomyRoot,
        searchRoot: this.lightroomSearchRoot,
        corrections,
        now: this.now,
      });
      this.updateProgress({
        status: "applying-corrections",
        phase: "Gemeinsam aktivieren",
        message: "Geprüfte Korrekturschicht wird für Arten-Explorer und Lightroom freigegeben.",
        percent: 90,
      });
      this.referenceService.reset();
      this.state = {
        ...this.state,
        status: "completed",
        message: "Namenskorrekturen wurden atomar für Master und Lightroom-Suche aktiviert.",
        progressPercent: 100,
        progressPhase: "Abgeschlossen",
        completedAt: this.now().toISOString(),
        error: "",
        result: {
          correctionRelease: result.release,
          correctionActivation: result.pointer,
        },
      };
      return this.status();
    } catch (error) {
      this.state = {
        ...this.state,
        status: "failed",
        message: "Die Namenskorrekturen konnten nicht aktiviert werden. Der bisherige gemeinsame Stand bleibt aktiv.",
        progressPercent: null,
        completedAt: this.now().toISOString(),
        error: error.message,
      };
      throw error;
    } finally {
      this.runPromise = null;
    }
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

  async startBaselineBuild({ confirmed = false, revision = "" } = {}) {
    this.assertAvailable();
    if (confirmed !== true) {
      const error = new Error("Der einmalige lokale Grundlagenlauf muss ausdrücklich bestätigt werden.");
      error.statusCode = 400;
      throw error;
    }
    assertBaselineSetup(await this.status(), revision);
    // startBuild checks availability again after the asynchronous status read.
    return this.startBuild({ refreshProviders: false }, revision);
  }

  startBuild(options = {}, baselineRevision = "") {
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
    this.runPromise = this.withVersionPresence(async () => {
      // Repeat under the existing cross-process build lock; do not trust a stale UI confirmation.
      if (baselineRevision) assertBaselineSetup(await this.status(), baselineRevision);
      return this.runBuild({ ...options, refreshProviders });
    }).catch(() => null);
    return this.status();
  }

  async pauseBuild() {
    this.assertOpen();
    if (!this.runController) throw new Error("Der Master-Hintergrundaufbau ist nicht eingerichtet.");
    await this.runController.pause();
    return this.status();
  }

  resumeBuild({ confirmed = false } = {}) {
    this.assertAvailable();
    if (!this.runController || !confirmed) throw new Error("Das Fortsetzen des gespeicherten Masteraufbaus muss bestätigt werden.");
    this.state = { ...initialState(), action: "build", status: "building", startedAt: this.now().toISOString(),
      message: "Gespeicherte Eingänge werden vor dem Fortsetzen erneut geprüft.", progressPhase: "Wiederanlauf prüfen" };
    this.runPromise = this.withVersionPresence(async () => {
      const job = await this.runController.current();
      if (!job) throw new Error("Kein gespeicherter Masteraufbau vorhanden.");
      try {
        const manifest = await this.runController.resume((event) => this.updateProgress({ ...event, status: "building" }));
        const lifecycle = await this.inspectLifecycle(this.taxonomyRoot, { lightweight: true });
        this.state = { ...this.state, status: "ready", message: "Fortgesetzter Masteraufbau ist geprüft. Der Kandidat kann übernommen werden.",
          progressPercent: 100, progressPhase: "Abgeschlossen", result: { manifest, lifecycle }, warnings: job.warnings || [], completedAt: this.now().toISOString() };
      } catch (error) {
        this.state = { ...this.state, status: error.code === "MASTER_BUILD_PAUSED" ? "paused" : "failed",
          error: error.code === "MASTER_BUILD_PAUSED" ? "" : error.message, message: error.message, completedAt: this.now().toISOString() };
        throw error;
      }
    }).catch(() => null);
    return this.status();
  }

  async runBuild({ refreshProviders = true, ...providerOptions } = {}) {
    try {
      if (this.runController) await assertTaxonomySpace(this.taxonomyRoot);
      let [speciesList, correctionsDocument] = await Promise.all([
        readJson(this.speciesListPath, []),
        readJson(this.correctionsPath, { entries: [] }),
      ]);
      let projectTaxa = projectTaxaFromSpeciesList(speciesList);
      let corrections = correctionsFromDocument(correctionsDocument);
      let researchedTaxa = this.supplementService?.selectedTaxa
        ? await this.supplementService.selectedTaxa()
        : [];
      let store = await this.referenceService.requireStore();
      const activeMasterManifest = await readTaxonomyMasterManifest(this.taxonomyRoot, "active");
      const activeMasterRelease = masterReferenceRelease(activeMasterManifest);
      const activeReferenceRelease = cleanText(store.status()?.releaseId);
      let recheckKnownReferenceGaps = Boolean(
        activeReferenceRelease
        && activeMasterRelease !== activeReferenceRelease
      );
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
      let workerBinding = null;
      const selection = { speciesListPath: this.speciesListPath, correctionsPath: this.correctionsPath };
      if (this.runController) {
        this.updateProgress({ status: "building", phase: "Eingangsstand sichern", message: "Aktuelle Quellen und eigene Entscheidungen werden für den Aufbau gebunden.", percent: 45 });
        workerBinding = await masterJobBinding(this.taxonomyRoot, [], selection);
        // Read all build values AFTER capturing the binding, not from the values
        // previously used for a possibly long provider refresh.
        [speciesList, correctionsDocument, researchedTaxa] = await Promise.all([
          readJson(this.speciesListPath, []), readJson(this.correctionsPath, { entries: [] }), readRetainedMasterTaxa(this.taxonomyRoot),
        ]);
        projectTaxa = projectTaxaFromSpeciesList(speciesList);
        corrections = correctionsFromDocument(correctionsDocument);
        this.referenceService.reset?.();
        store = await this.referenceService.requireStore();
        if (store.status()?.releaseId !== workerBinding.selection.reference) throw new Error("Geladene CoL-Referenz und aktueller Eingang stimmen nicht überein.");
        recheckKnownReferenceGaps = masterReferenceRelease(await readTaxonomyMasterManifest(this.taxonomyRoot, "active")) !== store.status()?.releaseId;
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
        { providerSlices, recheckKnownReferenceGaps },
      );
      const colRelease = releaseFromStoreStatus(store.status());
      const inputs = coverMasterInputSelection({ colRelease, colRecords, targetNames, providerSlices });
      const buildCandidate = this.runController ? (options) => this.runController.build(options) : this.buildCandidate;
      const manifest = await buildCandidate({
        taxonomyRoot: this.taxonomyRoot,
        colRelease,
        colRecords: inputs.records(),
        buildInputCoverage: inputs.coverage,
        providerSlices,
        projectTaxa,
        corrections,
        retainedTaxa: researchedTaxa,
        identityRegistry: (await readIdentityReview(this.taxonomyRoot))?.registry,
        ...(workerBinding ? { selection, expectedBinding: workerBinding } : {}),
        warnings,
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
      const lifecycle = await this.inspectLifecycle(this.taxonomyRoot, { lightweight: true });
      this.state = {
        ...this.state,
        status: "ready",
        message: lifecycle.blockingConflictCount
          ? `${lifecycle.blockingConflictCount} Konflikt(e) müssen vor der Aktivierung entschieden werden.`
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
        status: error.code === "MASTER_BUILD_PAUSED" ? "paused" : "failed",
        message: error.code === "MASTER_BUILD_PAUSED" ? error.message : "Master-Abgleich fehlgeschlagen. Die bisherige aktive Version bleibt unverändert.",
        progressPercent: null,
        completedAt: this.now().toISOString(),
        error: error.code === "MASTER_BUILD_PAUSED" ? "" : error.message,
      };
      throw error;
    } finally {
      this.runPromise = null;
    }
  }

  async reviewIdentity(action, payload = {}) {
    this.assertAvailable();
    if (!["preview", "save", "browse", "discardPreview", "discard"].includes(action)) throw new Error("Unbekannte Identitätsaktion.");
    this.identityReviewBusy = true;
    try {
      const operation = () => this.identityReviewService[action](payload);
      return await (this.runController ? this.runController.exclusive(operation) : operation());
    }
    finally { this.identityReviewBusy = false; }
  }

  async decide(payload = {}) {
    this.assertAvailable();
    const operation = () => this.decideConflict(this.taxonomyRoot, { ...payload, now: this.now });
    await (this.runController ? this.runController.exclusive(operation) : operation());
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
    this.runPromise = this.withVersionPresence(() => this.runActivate({ confirmed })).catch(() => null);
    return this.status();
  }

  async runActivate({ confirmed = false } = {}) {
    let masterActivated = false;
    try {
      await this.runController?.assertReadyForActivation();
      if (confirmed) this.referenceService.reset();
      let lightroomResult;
      if (this.publishPair) {
        lightroomResult = await this.performPairAction("staging", confirmed);
        this.referenceService.reset();
      } else {
        await this.activateCandidate(this.taxonomyRoot, { confirmed, now: this.now });
        masterActivated = true;
        lightroomResult = await this.rebuildLightroomAfterMasterChange();
      }
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
    this.runPromise = this.withVersionPresence(() => this.runRollback({ confirmed })).catch(() => null);
    return this.status();
  }

  async runRollback({ confirmed = false } = {}) {
    let masterRestored = false;
    try {
      if (confirmed) this.referenceService.reset();
      let lightroomResult;
      if (this.publishPair) {
        lightroomResult = await this.performPairAction("previous", confirmed);
        this.referenceService.reset();
      } else {
        await this.rollbackCandidate(this.taxonomyRoot, { confirmed, now: this.now });
        masterRestored = true;
        lightroomResult = await this.rebuildLightroomAfterMasterChange();
      }
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
    if (!this.publishPair && typeof this.rebuildLightroomPackage !== "function") {
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
    this.runPromise = this.withVersionPresence(() => this.runLightroomPackageSync()).catch(() => null);
    return this.status();
  }

  async runLightroomPackageSync() {
    try {
      const result = this.publishPair
        ? await this.performPairAction("active", true)
        : await this.rebuildLightroomAfterMasterChange();
      if (this.publishPair) this.referenceService.reset();
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
        status: this.publishPair ? "failed" : "partial",
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

  async maintainStorage(action, payload = {}) {
    this.assertOpen();
    if (!this.storageMaintenance) throw new Error("Die gemeinsame Speicherpflege ist nicht eingerichtet.");
    if (this.closing || this.isActive() || this.isProjectBusy()) throw new Error("Ein Datenbank- oder Projektlauf ist aktiv. Bitte vor der Speicherpflege warten.");
    if (action === "preview") return this.storageMaintenance.preview();
    if (action === "clean") return this.storageMaintenance.clean(payload);
    throw new Error("Unbekannte Speicherpflegeaktion.");
  }

  async performPairAction(sourceSlot, confirmed) {
    if (this.closing) throw new Error("Explorer wird geschlossen; es wurde keine Paarvorbereitung gestartet.");
    const controller = new AbortController();
    this.publicationAbortController = controller;
    const readInputs = async () => {
      const [species, document, reference, identities, providers] = await Promise.all([
        readJson(this.speciesListPath, []), readJson(this.correctionsPath, { entries: [] }),
        this.readReferencePointer(this.taxonomyRoot), readIdentityReview(this.taxonomyRoot),
        Promise.all(PROVIDERS.map(async (provider) => {
          const version = await latestProviderSliceVersion(this.taxonomyRoot, provider);
          return version ? readJson(providerSliceManifestPath(this.taxonomyRoot, provider, version), null) : null;
        })),
      ]);
      const corrections = correctionsFromDocument(document);
      return { corrections, reference, identities, providers,
        identityInputs: taxonomyIdentityInputRevision({ projectTaxa: projectTaxaFromSpeciesList(species), corrections }) };
    };
    try { return await this.publishPair({ sourceSlot, confirmed, now: this.now, readInputs, signal: controller.signal,
      validateInputs: async (manifest) => {
        if (sourceSlot !== "staging") return;
        const inputs = await readInputs();
        const staleProvider = PROVIDERS.some((provider, index) => inputs.providers[index]
          && (manifest.sources || []).find((source) => source.provider === provider)?.providerVersion !== inputs.providers[index].providerVersion);
        if ((inputs.reference?.activeRelease && masterReferenceRelease(manifest) !== inputs.reference.activeRelease)
          || staleProvider
          || (inputs.identities && manifest.inputRevisions?.identities !== inputs.identities.revision)
          || (manifest.inputRevisions?.identityInputs && manifest.inputRevisions.identityInputs !== inputs.identityInputs)
          || (manifest.inputRevisions?.corrections && manifest.inputRevisions.corrections !== taxonomyCorrectionsRevision(inputs.corrections))) {
          throw new Error("Referenz, Projektzuordnungen oder eigene Entscheidungen wurden seit dem Kandidatenbau geändert. Bitte neu aufbauen.");
        }
      },
      onProgress: ({ phase, message, percent }) => this.updateProgress({
        phase: LIGHTROOM_PROGRESS_PHASES[phase] || phase, message, percent,
      }),
    }); } finally { this.publicationAbortController = null; }
  }

  async close() {
    this.closing = true;
    this.publicationAbortController?.abort(new Error("Explorer wird geschlossen; die Paarvorbereitung wurde abgebrochen."));
    await this.runController?.requestClose();
    await this.providerRefreshService?.close?.();
    await this.runPromise?.catch?.(() => null);
    this.closed = true;
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
  masterReferenceRelease,
  normalizeColTaxon,
  projectTaxaFromSpeciesList,
  releaseFromStoreStatus,
  streamColRecords,
  taxonomyMasterReferenceStatus,
});
