import { existsSync, rmSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { renderSpectrogram } from "../scripts/spectrogram-renderer.mjs";
import { createSessionToken } from "./request-security.mjs";
import { renderPortrait } from "../scripts/portrait-renderer.mjs";
import { cleanupManagedExplorerTemp } from "./temp-retention.mjs";
import {
  buildExplorerModel,
  buildExplorerRevision,
} from "./explorer-model.mjs";
import { renderMapJpeg } from "./media-assets.mjs";
import { closeActiveFileStreams } from "./http-routing.mjs";
import { createExplorerRequestHandler } from "./request-router.mjs";
import { createSpeciesCreateOperations } from "./species-create.mjs";
import { createSpeciesDeleteOperations } from "./species-delete.mjs";
import { createSpeciesEditOperations } from "./species-edit.mjs";
import { createMapAssetOperations } from "./map-asset-workflow.mjs";
import { createSoundAssetOperations } from "./sound-asset-workflow.mjs";
import { createPortraitAssetOperations } from "./portrait-asset-workflow.mjs";
import { createAssetMaintenanceOperations } from "./asset-maintenance.mjs";
import { createPipelineController } from "./pipeline-controller.mjs";
import { createProjectPublicationService } from "./project-publication.mjs";
import { createBackupService } from "./backup-service.mjs";

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
  portraitRenderer = renderPortrait,
  mapImageRenderer = renderMapJpeg,
  sessionProtection = true,
} = {}) {
  await cleanupManagedExplorerTemp({ repoRoot, phase: "startup" });
  let model = await buildExplorerModel(repoRoot);
  let modelRevision = await buildExplorerRevision(repoRoot);
  let modelRefreshPromise = null;
  const previewTokens = new Map();
  const sessionToken = createSessionToken();
  const speciesListPath = join(repoRoot, "species_list.json");
  const assetOverridesPath = join(repoRoot, "species-assets-overrides.json");
  const assessmentIdsPath = join(repoRoot, "lastSavedAssessmentId.json");
  const manualMapOverridesPath = join(repoRoot, "docs", "manual-map-overrides.md");
  const backupDir = join(repoRoot, "species-explorer", "backups");
  const localSettingsPath = join(repoRoot, "species-explorer", LOCAL_SETTINGS_FILE);
  const pipelineLogDir = join(repoRoot, "species-explorer", "logs");
  const pipelineAssetBackupRoot = join(repoRoot, "species-explorer", "pipeline-asset-backups");
  const assetStagingRoot = join(repoRoot, "species-explorer", "staging");
  const assetBackupRoot = join(repoRoot, "species-explorer", "asset-backups");
  const pendingAssetReviewPath = join(repoRoot, "species-explorer", "pending-asset-review.json");
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

  function isPipelineActive() {
    return pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review";
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
    saveSoundAsset,
    rejectCurrentSoundAsset,
    soundAssetSourceRevision,
  } = createSoundAssetOperations({
    ...assetOperationContext,
    spectrogramRenderer,
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
    createNewSpeciesPortraitPrompt,
    previewNewSpeciesPortrait,
    saveNewSpecies,
  } = createSpeciesCreateOperations({
    repoRoot,
    speciesListPath,
    backupDir,
    assetStagingRoot,
    previewTokens,
    previewTokenTtlMs: PREVIEW_TOKEN_TTL_MS,
    cleanupPreviewTokens,
    getModel: () => model,
    refreshModel,
    hashText,
    compactTimestamp,
    isPipelineBusy: () => Boolean(
      pipelineProcess
      || pipelineState.status === "running"
      || pipelineState.status === "awaiting-review"
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
      previewAssetFile({ assetType, id, token }) {
        cleanupPreviewTokens();
        const expectedType = {
          map: "map-asset",
          sound: "sound-asset",
          portrait: "portrait-asset",
        }[assetType];
        const preview = previewTokens.get(token);
        return preview && preview.type === expectedType && preview.id === id
          ? preview.stagingPath
          : null;
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
          if (action === "reject") return rejectCurrentSoundAsset(id);
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
      async pipelineBackupFile({ url, request, response }) {
        await sendPipelineBackupFile(url, request, response);
      },
    },
  });
  const server = createHttpServer(requestHandler);

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
    async close() {
      await new Promise((resolveClose, reject) => {
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
      closeActiveFileStreams();
      previewTokens.clear();
      await cleanupManagedExplorerTemp({ repoRoot, phase: "shutdown" }).catch(() => {});
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
