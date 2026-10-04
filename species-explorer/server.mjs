import { existsSync, rmSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { renderSpectrogram } from "../scripts/spectrogram-renderer.mjs";
import {
  probeSoundDuration,
  renderSoundSegments,
} from "../scripts/sound-segment-editor.mjs";
import { createSessionToken } from "./request-security.mjs";
import { renderPortrait } from "../scripts/portrait-renderer.mjs";
import { cleanupManagedExplorerTemp } from "./temp-retention.mjs";
import { cleanupOrphanTempSessions, createManagedTempSession } from "./temp-session.mjs";
import {
  buildExplorerModel,
  buildExplorerRevision,
} from "./explorer-model.mjs";
import { renderMapJpeg } from "./media-assets.mjs";
import { closeActiveFileStreams } from "./http-routing.mjs";
import { createExplorerRequestHandler } from "./request-router.mjs";
import { createSpeciesCreateOperations } from "./species-create.mjs";
import { createTaxonomyNamePreferenceService } from "./taxonomy-name-preference-service.mjs";
import { createSpeciesDeleteOperations } from "./species-delete.mjs";
import { createSpeciesEditOperations } from "./species-edit.mjs";
import { createTaxonomyEditOperations } from "./taxonomy-edit.mjs";
import { createMapAssetOperations } from "./map-asset-workflow.mjs";
import { createSoundAssetOperations } from "./sound-asset-workflow.mjs";
import { createPortraitAssetOperations } from "./portrait-asset-workflow.mjs";
import { createAssetMaintenanceOperations } from "./asset-maintenance.mjs";
import { createPipelineController } from "./pipeline-controller.mjs";
import { createProjectPublicationService } from "./project-publication.mjs";
import { createBackupService } from "./backup-service.mjs";
import { createTaxonomyReferenceService } from "./taxonomy-reference-service.mjs";
import { prepareTaxonomyPublicationInWorker } from "./taxonomy-publication-process.mjs";
import { createTaxonomyMaintenanceService } from "./taxonomy-maintenance-service.mjs";
import { createTaxonomyMasterService } from "./taxonomy-master-service.mjs";
import { createTaxonomyUpdateCoordinator } from "./taxonomy-update-coordinator.mjs";
import { createLightroomCloseGate } from "./lightroom-close-gate.mjs";
import { createLightroomUsageRequestService } from "./lightroom-usage-request.mjs";
import { rebuildLightroomSearchPackage } from "./lightroom-search-update.mjs";
import { publishTaxonomyPair, rollbackTaxonomyPair } from "./taxonomy-publication.mjs";
import { readTaxonomyPublication } from "./taxonomy-publication-storage.mjs";
import {
  defaultLightroomSearchRoot,
  inspectLightroomSearchPackages,
} from "./lightroom-search-storage.mjs";
import { createTaxonomyProviderRefreshService } from "./taxonomy-provider-refresh-service.mjs";
import { createTaxonomySupplementService } from "./taxonomy-supplement-service.mjs";
import { defaultTaxonomyRoot } from "./taxonomy-storage.mjs";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(APP_DIR, "..");
const PUBLIC_DIR = join(APP_DIR, "public");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4177;
const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_MAP_PREVIEW_BODY_BYTES = 28 * 1024 * 1024;
const MAX_SOUND_PREVIEW_BODY_BYTES = 68 * 1024 * 1024;
const MAX_PORTRAIT_PREVIEW_BODY_BYTES = 28 * 1024 * 1024;
const PIPELINE_LOG_LINE_LIMIT = 400;
const BACKUP_LOG_LINE_LIMIT = 400;
const DEFAULT_NAS_BACKUP_ROOT = "W:\\Website Datenbank Backup";
const LOCAL_SETTINGS_FILE = "local-settings.json";
async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}



function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}


async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(filePath, nextText) {
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tempPath, nextText, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}


export async function createExplorerServer({
  repoRoot = REPO_ROOT,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  publishAssetChanges = false,
  rebuildReportAfterAssetSave = true,
  nasBackupRoot = process.env.IUCN_NAS_BACKUP_DIR || DEFAULT_NAS_BACKUP_ROOT,
  spectrogramRenderer = renderSpectrogram,
  soundDurationProbe = probeSoundDuration,
  soundSegmentRenderer = renderSoundSegments,
  portraitRenderer = renderPortrait,
  mapImageRenderer = renderMapJpeg,
  sessionProtection = true,
  taxonomyRoot = defaultTaxonomyRoot(process.env, repoRoot),
  lightroomSearchRoot = defaultLightroomSearchRoot(process.env, repoRoot),
  lightroomCloseGate = null,
} = {}) {
  await cleanupManagedExplorerTemp({ repoRoot, phase: "startup" });
  await cleanupOrphanTempSessions({ repoRoot, owner: "explorer" });
  const tempSession = await createManagedTempSession({ repoRoot, owner: "explorer" });
  let model = await buildExplorerModel(repoRoot);
  let modelRevision = await buildExplorerRevision(repoRoot);
  let modelRefreshPromise = null;
  const previewTokens = new Map();
  const sessionToken = createSessionToken();
  const speciesListPath = join(repoRoot, "species_list.json");
  const speciesDataPath = join(repoRoot, "speciesData.json");
  const speciesReferenceMappingsPath = join(repoRoot, "species-reference-mappings.json");
  const taxonomyReferenceCorrectionsPath = join(
    repoRoot,
    "taxonomy-reference-corrections.json",
  );
  const taxonomyNamePreference = createTaxonomyNamePreferenceService({
    searchRoot: lightroomSearchRoot, taxonomyRoot, correctionsPath: taxonomyReferenceCorrectionsPath,
  });
  const assetOverridesPath = join(repoRoot, "species-assets-overrides.json");
  const taxonomyOverridesPath = join(repoRoot, "species-taxonomy-overrides.json");
  const assessmentIdsPath = join(repoRoot, "lastSavedAssessmentId.json");
  const manualMapOverridesPath = join(repoRoot, "docs", "manual-map-overrides.md");
  const backupDir = join(repoRoot, "species-explorer", "backups");
  const localSettingsPath = join(repoRoot, "species-explorer", LOCAL_SETTINGS_FILE);
  const pipelineLogDir = join(repoRoot, "species-explorer", "logs");
  const pipelineAssetBackupRoot = join(repoRoot, "species-explorer", "pipeline-asset-backups");
  const assetStagingRoot = tempSession.root;
  const stageFilePath = (filename) => tempSession.filePath(filename);
  const assetBackupRoot = join(repoRoot, "species-explorer", "asset-backups");
  const pendingAssetReviewPath = join(repoRoot, "species-explorer", "pending-asset-review.json");
  const taxonomySupplements = createTaxonomySupplementService({
    taxonomyRoot,
    correctionsPath: taxonomyReferenceCorrectionsPath,
  });
  const taxonomyReference = createTaxonomyReferenceService({
    taxonomyRoot,
    supplementService: taxonomySupplements,
  });
  const taxonomyProviderRefresh = createTaxonomyProviderRefreshService({
    taxonomyRoot,
    repoRoot,
    supplementService: taxonomySupplements,
  });
  let taxonomyMaintenanceService = null;
  let taxonomyMasterService = null;
  let taxonomyUpdateCoordinator = null;
  const usageRequests = createLightroomUsageRequestService({ taxonomyRoot });
  const closeGate = lightroomCloseGate || createLightroomCloseGate({ taxonomyRoot, usageRequests });
  let pipelineProcess = null;
  let assetWriteActive = false;
  let pipelineAssetSnapshot = new Map();
  let pipelineState = {
    status: "idle",
    phase: "",
    mode: "",
    initialMode: "",
    runId: "",
    startedAt: "",
    completedAt: "",
    exitCode: null,
    targetCount: 0,
    targets: [],
    removed: [],
    log: [],
    logFile: "",
    error: "",
    reviewAssets: [],
    gitPublished: false,
    publishAfterAssetOnlyNoAssets: false,
  };
  if (existsSync(pendingAssetReviewPath)) {
    try {
      const pending = await readJson(pendingAssetReviewPath);
      if (pending?.status === "awaiting-review" && Array.isArray(pending.reviewAssets)) {
        pipelineState = pending;
      }
    } catch {
      // Eine unlesbare lokale Statusdatei wird beim nächsten erfolgreichen Lauf ersetzt.
    }
  }

  async function refreshModel({ force = false } = {}) {
    if (modelRefreshPromise) return modelRefreshPromise;
    modelRefreshPromise = (async () => {
      const currentRevision = await buildExplorerRevision(repoRoot);
      if (!force && currentRevision === modelRevision) return false;
      model = await buildExplorerModel(repoRoot);
      modelRevision = currentRevision;
      return true;
    })();
    try {
      return await modelRefreshPromise;
    } finally {
      modelRefreshPromise = null;
    }
  }

  function cleanupPreviewTokens() {
    const now = Date.now();
    for (const [token, preview] of previewTokens) {
      if (preview.expiresAt === null && (preview.type === "create"
          || (preview.type === "portrait-asset" && preview.createToken))) continue;
      if (preview.expiresAt > now) continue;
      if (["map-asset", "sound-asset", "portrait-asset"].includes(preview.type) && preview.stagingPath) {
        rmSync(preview.stagingPath, { force: true });
      }
      if (preview.type === "portrait-asset" && preview.inputStagingPath) {
        rmSync(preview.inputStagingPath, { force: true });
      }
      if (preview.type === "sound-asset" && preview.spectrogramStagingPath) {
        rmSync(preview.spectrogramStagingPath, { force: true });
      }
      previewTokens.delete(token);
    }
  }

  function isPipelineProcessActive() {
    return pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review";
  }

  function isPipelineActive() {
    return Boolean(
      isPipelineProcessActive()
      || taxonomyMaintenanceService?.isActive()
      || taxonomyMasterService?.isActive()
      || taxonomyUpdateCoordinator?.isBusy(),
    );
  }

  const {
    runCommandCapture,
    synchronizeProjectStatusForPublication,
    readPendingProjectChanges,
    pendingAssetSpeciesFromFiles,
  } = createProjectPublicationService({ repoRoot });

  const {
    publicSettingsPayload,
    saveBackupSettings,
    previewNasBackup,
    startNasBackup,
    isBackupActive,
    getState: getBackupState,
  } = await createBackupService({
    repoRoot,
    defaultBackupRoot: nasBackupRoot,
    localSettingsPath,
    localSettingsFile: LOCAL_SETTINGS_FILE,
    backupLogLineLimit: BACKUP_LOG_LINE_LIMIT,
    isPipelineActive,
    isAssetWriteActive: () => assetWriteActive,
  });

  taxonomyMaintenanceService = createTaxonomyMaintenanceService({
    taxonomyRoot,
    repoRoot,
    referenceService: taxonomyReference,
    supplementService: taxonomySupplements,
    providerRefreshService: taxonomyProviderRefresh,
    mappingsPath: speciesReferenceMappingsPath,
    speciesListPath,
    isProjectBusy: () => Boolean(
      isPipelineProcessActive()
      || isBackupActive()
      || assetWriteActive
      || taxonomyMasterService?.isActive()
    ),
  });
  taxonomyMasterService = createTaxonomyMasterService({
    taxonomyRoot,
    backgroundBuild: true,
    referenceService: taxonomyReference,
    supplementService: taxonomySupplements,
    speciesListPath,
    correctionsPath: taxonomyReferenceCorrectionsPath,
    lightroomSearchRoot,
    inspectLightroomPackages: () => inspectLightroomSearchPackages(lightroomSearchRoot),
    publishPair: (options) => {
      const operation = options.sourceSlot === "previous" && readTaxonomyPublication(taxonomyRoot)
        ? rollbackTaxonomyPair : publishTaxonomyPair;
      return operation({ ...options, taxonomyRoot, searchRoot: lightroomSearchRoot,
        prepare: (prepareOptions) => prepareTaxonomyPublicationInWorker({
          ...prepareOptions, projectRevision: modelRevision,
        }),
      });
    },
    rebuildLightroomPackage: ({ onProgress }) => rebuildLightroomSearchPackage({
      repoRoot,
      taxonomyRoot,
      searchRoot: lightroomSearchRoot,
      projectRevision: modelRevision,
      onProgress,
    }),
    isProjectBusy: () => Boolean(
      isPipelineProcessActive()
      || isBackupActive()
      || assetWriteActive
      || taxonomyMaintenanceService?.isActive()
    ),
  });
  await taxonomyMasterService.ensureCorrectionBaseline().catch(() => false);
  void taxonomyMaintenanceService.startupCheck();
  taxonomyUpdateCoordinator = createTaxonomyUpdateCoordinator({ taxonomyRoot,
    maintenanceService: taxonomyMaintenanceService, masterService: taxonomyMasterService,
    checkStartReady: (context) => closeGate.ready(context),
    prepareStart: lightroomCloseGate ? undefined : (job) => usageRequests.prepare(job),
    onStateChange: lightroomCloseGate ? undefined : (job) => usageRequests.syncJob(job), pollIntervalMs: 10000 });
  await taxonomyUpdateCoordinator.restore();

  async function assertUpdateRouteAllowed(action) {
    if (!taxonomyUpdateCoordinator.isBusy()) return;
    const sequence = await taxonomyUpdateCoordinator.status();
    const readOnly = action === "preview" || action.endsWith("-preview") || action.endsWith("-browse");
    const decision = ["decide", "decide-project-conflict", "identity-save", "classification-save", "classification-deferral-save"].includes(action);
    const usage = ["catalog-usage-save", "catalog-usage-preview"].includes(action);
    if (readOnly || usage || decision && sequence.status === "waiting-decisions") return;
    throw Object.assign(new Error("Der gespeicherte Datenbank-Updateauftrag besitzt den Ablauf. Bitte dessen Fortsetzen/Pause verwenden."), { statusCode: 409 });
  }

  async function continueAfterDecision(result) {
    if (taxonomyUpdateCoordinator.status().status !== "waiting-decisions") return result;
    const workflow = await taxonomyUpdateCoordinator.afterConfirmedDecision();
    return { ...result, updateWorkflow: workflow };
  }

  const pipelineRuntime = {
    get state() { return pipelineState; },
    set state(value) { pipelineState = value; },
    get process() { return pipelineProcess; },
    set process(value) { pipelineProcess = value; },
    get assetSnapshot() { return pipelineAssetSnapshot; },
    set assetSnapshot(value) { pipelineAssetSnapshot = value; },
  };
  const {
    pendingChangesPayload,
    previewPipeline,
    startPipeline,
    savePipelineAssetReview,
    sendPipelineBackupFile,
    rejectedSoundSourceFromCredits,
    addRejectedSoundSource,
  } = createPipelineController({
    repoRoot,
    speciesListPath,
    assetOverridesPath,
    assessmentIdsPath,
    manualMapOverridesPath,
    pipelineLogDir,
    pipelineAssetBackupRoot,
    pendingAssetReviewPath,
    previewTokens,
    previewTokenTtlMs: PREVIEW_TOKEN_TTL_MS,
    pipelineLogLineLimit: PIPELINE_LOG_LINE_LIMIT,
    runtime: pipelineRuntime,
    getModel: () => model,
    refreshModel,
    cleanupPreviewTokens,
    readPendingProjectChanges,
    pendingAssetSpeciesFromFiles,
    isPipelineActive,
    isBackupActive,
    isAssetWriteActive: () => assetWriteActive,
    hashText,
    compactTimestamp,
    readJson,
  });

  const assetOperationContext = {
    repoRoot,
    assetOverridesPath,
    manualMapOverridesPath,
    assetStagingRoot,
    stageFilePath,
    assetBackupRoot,
    previewTokens,
    previewTokenTtlMs: PREVIEW_TOKEN_TTL_MS,
    cleanupPreviewTokens,
    getModel: () => model,
    refreshModel,
    getPipelineState: () => pipelineState,
    getPipelineProcess: () => pipelineProcess,
    isAssetWriteActive: () => assetWriteActive,
    setAssetWriteActive(value) { assetWriteActive = Boolean(value); },
    publishAssetChanges,
    rebuildReportAfterAssetSave,
    runCommandCapture,
    synchronizeProjectStatusForPublication,
    hashText,
  };

  const {
    previewMapAsset,
    saveMapAsset,
    mapAssetSourceRevision,
  } = createMapAssetOperations({
    ...assetOperationContext,
    mapImageRenderer,
  });
  const {
    previewSoundAsset,
    previewEditedSoundAsset,
    saveSoundAsset,
    rejectCurrentSoundAsset,
    resetSoundRejections,
    soundAssetSourceRevision,
  } = createSoundAssetOperations({
    ...assetOperationContext,
    spectrogramRenderer,
    soundDurationProbe,
    soundSegmentRenderer,
    rejectedSoundSourceFromCredits,
    addRejectedSoundSource,
  });
  const {
    createPortraitPrompt,
    previewPortraitAsset,
    savePortraitAsset,
    portraitAssetSourceRevision,
    removePreviousPortraitPreviews,
  } = createPortraitAssetOperations({
    ...assetOperationContext,
    portraitRenderer,
  });

  const {
    createAssetMutationPreview,
    runConfirmedAssetMutation,
    deleteSpeciesAsset,
    restoreSpeciesAsset,
  } = createAssetMaintenanceOperations({
    ...assetOperationContext,
    sessionProtection,
    mapAssetSourceRevision,
    soundAssetSourceRevision,
    portraitAssetSourceRevision,
  });

  const {
    previewNewSpecies,
    discardNewSpecies,
    createNewSpeciesPortraitPrompt,
    previewNewSpeciesPortrait,
    saveNewSpecies,
  } = createSpeciesCreateOperations({
    repoRoot,
    speciesListPath,
    backupDir,
    assetStagingRoot,
    stageFilePath,
    previewTokens,
    cleanupPreviewTokens,
    getModel: () => model,
    refreshModel,
    hashText,
    compactTimestamp,
    isPipelineBusy: () => Boolean(
      isPipelineActive()
    ),
    isAssetWriteActive: () => assetWriteActive,
    portraitAssetSourceRevision,
    removePreviousPortraitPreviews,
    portraitRenderer,
  });

  const {
    previewSpeciesDelete,
    saveSpeciesDelete,
  } = createSpeciesDeleteOperations({
    repoRoot,
    speciesListPath,
    backupDir,
    previewTokens,
    previewTokenTtlMs: PREVIEW_TOKEN_TTL_MS,
    cleanupPreviewTokens,
    getModel: () => model,
    refreshModel,
    hashText,
    compactTimestamp,
  });

  const {
    previewSpeciesEdit,
    saveSpeciesEdit,
  } = createSpeciesEditOperations({
    repoRoot,
    speciesListPath,
    assetOverridesPath,
    taxonomyOverridesPath,
    assessmentIdsPath,
    manualMapOverridesPath,
    backupDir,
    previewTokens,
    previewTokenTtlMs: PREVIEW_TOKEN_TTL_MS,
    cleanupPreviewTokens,
    getModel: () => model,
    refreshModel,
    hashText,
    compactTimestamp,
    readJson,
    writeJsonAtomic,
    writeTextAtomic,
  });

  const {
    previewTaxonomyEdit,
    saveTaxonomyEdit,
  } = createTaxonomyEditOperations({
    speciesDataPath,
    taxonomyOverridesPath,
    backupDir,
    previewTokens,
    previewTokenTtlMs: PREVIEW_TOKEN_TTL_MS,
    cleanupPreviewTokens,
    getModel: () => model,
    refreshModel,
    hashText,
    compactTimestamp,
    writeJsonAtomic,
  });

  const requestHandler = createExplorerRequestHandler({
    host,
    sessionToken,
    sessionProtection,
    repoRoot,
    publicDir: PUBLIC_DIR,
    bodyLimits: {
      map: MAX_MAP_PREVIEW_BODY_BYTES,
      sound: MAX_SOUND_PREVIEW_BODY_BYTES,
      portrait: MAX_PORTRAIT_PREVIEW_BODY_BYTES,
    },
    operations: {
      previewAssetFile({ assetType, id, token, kind }) {
        cleanupPreviewTokens();
        const expectedType = {
          map: "map-asset",
          sound: "sound-asset",
          portrait: "portrait-asset",
        }[assetType];
        const preview = previewTokens.get(token);
        if (!preview || preview.type !== expectedType || preview.id !== id) return null;
        if (assetType === "sound" && kind === "spectrogram") {
          return preview.spectrogramStagingPath || null;
        }
        return preview.stagingPath;
      },
      async asset({ assetType, id, action, payload }) {
        if (action === "delete-preview" || action === "restore-preview") {
          return createAssetMutationPreview(
            id,
            assetType,
            action === "delete-preview" ? "delete" : "restore",
          );
        }
        if (action === "delete" || action === "restore") {
          const operation = action;
          return runConfirmedAssetMutation(payload, id, assetType, operation, () => (
            operation === "delete"
              ? deleteSpeciesAsset(id, assetType)
              : restoreSpeciesAsset(id, assetType)
          ));
        }
        if (assetType === "map") {
          return action === "preview"
            ? previewMapAsset(id, payload)
            : saveMapAsset(id, payload);
        }
        if (assetType === "sound") {
          if (action === "rejections-preview") return resetSoundRejections(id, payload, true);
          if (action === "rejections-reset") return resetSoundRejections(id, payload);
          if (action === "reject") return rejectCurrentSoundAsset(id);
          if (action === "edit-preview") return previewEditedSoundAsset(id, payload);
          return action === "preview"
            ? previewSoundAsset(id, payload)
            : saveSoundAsset(id, payload);
        }
        if (action === "prompt") return createPortraitPrompt(id, payload);
        return action === "preview"
          ? previewPortraitAsset(id, payload)
          : savePortraitAsset(id, payload);
      },
      async pipeline({ action, payload }) {
        return action === "preview"
          ? previewPipeline(payload)
          : startPipeline(payload);
      },
      async backupSettings({ payload }) {
        return saveBackupSettings(payload);
      },
      async backup({ action, payload }) {
        return action === "preview"
          ? previewNasBackup()
          : startNasBackup(payload);
      },
      async pipelineAssetReview({ payload }) {
        return savePipelineAssetReview(payload);
      },
      async newSpecies({ action, payload }) {
        if (action === "preview") return previewNewSpecies(payload);
        if (action === "discard") return discardNewSpecies(payload);
        if (action === "portrait-prompt") return createNewSpeciesPortraitPrompt(payload);
        if (action === "portrait-preview") return previewNewSpeciesPortrait(payload);
        return saveNewSpecies(payload);
      },
      async deleteSpecies({ id, action, payload }) {
        return action === "preview"
          ? previewSpeciesDelete(id)
          : saveSpeciesDelete(id, payload);
      },
      async editSpecies({ id, action, payload }) {
        return action === "preview"
          ? previewSpeciesEdit(id, payload)
          : saveSpeciesEdit(id, payload);
      },
      async editTaxonomy({ id, action, payload }) {
        return action === "preview"
          ? previewTaxonomyEdit(id, payload)
          : saveTaxonomyEdit(id, payload);
      },
      async read({ resource }) {
        if (resource === "summary") {
          await refreshModel();
          return model.summary;
        }
        if (resource === "species") {
          await refreshModel();
          return model.species;
        }
        if (resource === "validation") {
          await refreshModel();
          return model.validation;
        }
        if (resource === "revision") {
          const changed = await refreshModel();
          return { revision: modelRevision, changed };
        }
        if (resource === "pending-changes") {
          await refreshModel();
          return pendingChangesPayload();
        }
        if (resource === "settings") return publicSettingsPayload();
        if (resource === "pipeline-status") return pipelineState;
        if (resource === "backup-status") return getBackupState();
        if (resource === "reload") {
          await refreshModel({ force: true });
          return { ok: true, summary: model.summary };
        }
        const error = new Error("Unbekannte Leseoperation");
        error.statusCode = 404;
        throw error;
      },
      async taxonomyRead({ resource, reference, searchParams }) {
        if (resource === "master-status") return { ...await taxonomyMasterService.status(),
          updateWorkflow: { ...await taxonomyUpdateCoordinator.status(), available: true } };
        if (resource === "sequence-status") return taxonomyUpdateCoordinator.status();
        if (resource === "lightroom-status") return closeGate.status({ updateRunId: taxonomyUpdateCoordinator.status().updateRunId });
        if (resource === "status") return taxonomyMaintenanceService.status();
        if (resource === "kingdoms") return taxonomyReference.kingdoms();
        if (resource === "review") return taxonomyReference.review();
        if (resource === "search") {
          return taxonomyReference.search({
            query: searchParams.get("q"),
            kind: searchParams.get("kind") || "all",
            kingdomId: searchParams.get("kingdomId") || "Animalia",
            kingdomIds: searchParams.get("kingdomIds"),
            language: searchParams.get("language") || "all",
            rank: searchParams.get("rank") || "all",
            limit: searchParams.get("limit") || 12,
          });
        }
        if (resource === "taxon") return taxonomyReference.taxon(reference);
        const error = new Error("Unbekannte Taxonomie-Leseoperation");
        error.statusCode = 404;
        throw error;
      },
      async taxonomyMaintenance({ action, payload }) {
        if (action === "sequence-start") return taxonomyUpdateCoordinator.start(payload);
        if (action === "sequence-resume") return taxonomyUpdateCoordinator.resume(payload);
        if (action === "sequence-pause") return taxonomyUpdateCoordinator.pause();
        if (action === "lightroom-close") return closeGate.requestClose({ confirmed: payload.confirmed,
          updateRunId: taxonomyUpdateCoordinator.status().updateRunId });
        await assertUpdateRouteAllowed(action);
        if (action === "preview") return taxonomyMaintenanceService.previewUpdate();
        if (action === "start") return taxonomyMaintenanceService.startUpdate({ token: payload.token });
        if (action === "rollback") return taxonomyMaintenanceService.rollback();
        if (action === "decide-project-conflict") {
          return taxonomyMaintenanceService.decideProjectConflict(payload);
        }
        const error = new Error("Unbekannte Taxonomie-Wartungsoperation");
        error.statusCode = 404;
        throw error;
      },
      async taxonomyCorrection({ action, payload }) {
        if (action === "preference-preview") return taxonomyNamePreference.preview(payload);
        await assertUpdateRouteAllowed(action);
        if (taxonomyMasterService.isActive()) throw new Error("Eine Datenbankaktualisierung läuft. Bitte danach erneut versuchen.");
        if (action === "preference-save") {
          const result = await taxonomyNamePreference.save(payload);
          taxonomyReference.reset();
          return result;
        }
        if (action === "save") return taxonomyReference.saveCorrection(payload);
        if (action === "reset") return taxonomyReference.resetCorrection(payload);
        const error = new Error("Unbekannte Taxonomie-Korrekturoperation");
        error.statusCode = 404;
        throw error;
      },
      async taxonomyMaster({ action, payload }) {
        await assertUpdateRouteAllowed(action);
        if (payload.updateRunId) throw new Error("Update-Eigentümer dürfen nicht über Einzelaktionen übernommen werden.");
        if (action === "build") return taxonomyMasterService.startBuild(payload);
        if (action === "build-baseline") return taxonomyMasterService.startBaselineBuild(payload);
        if (action === "pause-build") return taxonomyMasterService.pauseBuild();
        if (action === "resume-build") return taxonomyMasterService.resumeBuild(payload);
        if (action === "storage-preview") return taxonomyMasterService.maintainStorage("preview");
        if (action === "storage-clean") return taxonomyMasterService.maintainStorage("clean", payload);
        if (action === "apply-corrections") return taxonomyMasterService.applyCorrections(payload);
        if (action === "decide") return continueAfterDecision(await taxonomyMasterService.decide(payload));
        if (action === "identity-preview") return taxonomyMasterService.reviewIdentity("preview", payload);
        if (action === "classification-preview") return taxonomyMasterService.reviewIdentity("classificationPreview", payload);
        if (action === "classification-automatic-preview") return taxonomyMasterService.reviewIdentity("classificationAutomaticPreview", payload);
        if (action === "classification-automatic-save") return taxonomyMasterService.reviewIdentity("classificationAutomaticSave", payload);
        if (action === "catalog-usage-preview") return taxonomyMasterService.reviewIdentity("catalogUsagePreview", payload);
        if (action === "catalog-usage-save") return taxonomyMasterService.reviewIdentity("catalogUsageSave", payload);
        if (action === "classification-save") return continueAfterDecision(await taxonomyMasterService.reviewIdentity("classificationSave", payload));
        if (action === "classification-deferral-preview") return taxonomyMasterService.reviewIdentity("classificationDeferralPreview", payload);
        if (action === "classification-deferral-save") return continueAfterDecision(await taxonomyMasterService.reviewIdentity("classificationDeferralSave", payload));
        if (action === "identity-save") return taxonomyMasterService.reviewIdentity("save", payload);
        if (action === "identity-browse") return taxonomyMasterService.reviewIdentity("browse", payload);
        if (action === "identity-discard-preview") return taxonomyMasterService.reviewIdentity("discardPreview", payload);
        if (action === "identity-discard") return taxonomyMasterService.reviewIdentity("discard", payload);
        if (action === "activate") return taxonomyMasterService.activate(payload);
        if (action === "rollback") return taxonomyMasterService.rollback(payload);
        if (action === "sync-lightroom") return taxonomyMasterService.syncLightroomPackage();
        const error = new Error("Unbekannte Masterdatenbank-Operation");
        error.statusCode = 404;
        throw error;
      },
      async pipelineBackupFile({ url, request, response }) {
        await sendPipelineBackupFile(url, request, response);
      },
    },
  });
  const server = createHttpServer((request, response) => {
    void (async () => {
      const release = await tempSession.beginOperation();
      try { await requestHandler(request, response); }
      finally { await release(); }
    })().catch(() => { if (!response.destroyed) response.destroy(); });
  });
  let closePromise;

  return {
    host,
    port,
    server,
    listen() {
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolveListen(server.address());
        });
      });
    },
    close() {
      // Repeated close requests (window, shutdown hook, reopening test) share
      // one complete cleanup. A server that never listened still owns resources.
      closePromise ||= (async () => {
        await new Promise((resolveClose, reject) => {
          server.closeIdleConnections?.();
          server.closeAllConnections?.();
          server.close((error) => (error && error.code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : resolveClose()));
        });
        closeActiveFileStreams();
        await taxonomyUpdateCoordinator.close();
        await taxonomyMasterService.close();
        await taxonomyMaintenanceService.close();
        taxonomyReference.close();
        previewTokens.clear();
        await tempSession.close();
        await cleanupManagedExplorerTemp({ repoRoot, phase: "shutdown" }).catch(() => {});
      })();
      return closePromise;
    },
  };
}

function parsePort(argv) {
  const arg = argv.find((value) => value.startsWith("--port="));
  const parsed = Number(arg?.split("=")[1] ?? process.env.SPECIES_EXPLORER_PORT ?? DEFAULT_PORT);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

export async function isExplorerAlreadyReachable(host, port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`http://${host}:${port}/`, { signal: controller.signal });
    if (!response.ok) {
      return false;
    }
    const html = await response.text();
    return html.includes("<title>Arten-Explorer</title>") || html.includes("Arten-Explorer");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = await createExplorerServer({ port: parsePort(process.argv.slice(2)) });
  try {
    await app.listen();
    console.log(`Arten-Explorer: http://${app.host}:${app.port}`);
    console.log("Kontrollierte species_list.json-Bearbeitung aktiv. Beenden mit Strg+C.");
  } catch (error) {
    const url = `http://${app.host}:${app.port}`;
    if (error.code === "EADDRINUSE" && (await isExplorerAlreadyReachable(app.host, app.port))) {
      console.log(`Arten-Explorer läuft bereits: ${url}`);
      console.log("Kein zweiter Server gestartet. Bestehendes Fenster oder Browser-Tab verwenden.");
      process.exitCode = 0;
    } else if (error.code === "EADDRINUSE") {
      console.error(`Port ${app.host}:${app.port} ist bereits belegt, aber dort läuft kein erkannter Arten-Explorer.`);
      console.error("Alten Prozess beenden oder mit --port=<Port> einen anderen Port wählen.");
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
