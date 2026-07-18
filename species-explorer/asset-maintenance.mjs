import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";

import {
  assetBackupFileNames,
  latestAssetBackup,
  pruneAssetBackups,
  readBackupMetadata,
  writeManagedAssetBackup,
} from "./asset-backups.mjs";
import { findEditableSpecies } from "./species-model.mjs";
import { synchronizeManualMapDocumentation } from "./manual-map-documentation.mjs";
import { closeActiveFileStreams } from "./http-routing.mjs";
import { isPathInside } from "./request-security.mjs";
import { inspectMp3Buffer } from "../scripts/audio-format.mjs";

export function createAssetMaintenanceOperations({
  repoRoot,
  assetOverridesPath,
  manualMapOverridesPath,
  assetBackupRoot,
  previewTokens,
  previewTokenTtlMs,
  cleanupPreviewTokens,
  getModel,
  refreshModel,
  getPipelineState,
  getPipelineProcess,
  isAssetWriteActive,
  setAssetWriteActive,
  rebuildReportAfterAssetSave,
  runCommandCapture,
  sessionProtection,
  mapAssetSourceRevision,
  soundAssetSourceRevision,
  portraitAssetSourceRevision,
}) {

  function createAssetMutationPreview(id, assetType, operation) {
    cleanupPreviewTokens();
    if (!["map", "sound", "portrait"].includes(assetType)) {
      const error = new Error("Assettyp muss Karte, Sound oder Artporträt sein");
      error.statusCode = 400;
      throw error;
    }
    if (!["delete", "restore"].includes(operation)) {
      const error = new Error("Assetaktion ist ungültig");
      error.statusCode = 400;
      throw error;
    }
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const token = randomUUID();
    previewTokens.set(token, {
      type: "asset-mutation",
      id,
      assetType,
      operation,
      expiresAt: Date.now() + previewTokenTtlMs,
    });
    return { ok: true, token, assetType, operation, expiresInSeconds: previewTokenTtlMs / 1000 };
  }

  function consumeAssetMutationToken(payload, id, assetType, operation) {
    cleanupPreviewTokens();
    const token = String(payload?.token || "");
    const preview = previewTokens.get(token);
    if (
      !preview
      || preview.type !== "asset-mutation"
      || preview.id !== id
      || preview.assetType !== assetType
      || preview.operation !== operation
    ) {
      const error = new Error("Bestätigung ist abgelaufen oder passt nicht zu dieser Assetaktion");
      error.statusCode = 409;
      throw error;
    }
    previewTokens.delete(token);
  }

  async function runConfirmedAssetMutation(payload, id, assetType, operation, action) {
    if (sessionProtection) consumeAssetMutationToken(payload, id, assetType, operation);
    return action();
  }

  async function deleteSpeciesAsset(id, assetType) {
    cleanupPreviewTokens();
    if (!["map", "sound", "portrait"].includes(assetType)) {
      const error = new Error("Assettyp muss Karte, Sound oder Artporträt sein");
      error.statusCode = 400;
      throw error;
    }
    if (isAssetWriteActive() || getPipelineProcess() || getPipelineState().status === "running" || getPipelineState().status === "awaiting-review") {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }

    const reportPath = join(repoRoot, "fehlende_elemente_report.json");
    const reportText = await readFile(reportPath, "utf8").catch(() => "");
    const backupFiles = [];
    let backupRelativePath = "";
    let source;
    let documentationText = "";
    let removedLabel = "";
    let reportNeedsRefresh = false;

    if (assetType === "map") {
      source = await mapAssetSourceRevision(species);
      documentationText = source.documentationText;
      if (!source.mapBuffer.length) {
        const error = new Error("Für diese Art ist keine Verbreitungskarte vorhanden");
        error.statusCode = 409;
        throw error;
      }
      removedLabel = "Verbreitungskarte";
      reportNeedsRefresh = true;
      backupFiles.push({ fileName: "map.jpg", path: source.mapPath, buffer: source.mapBuffer });
    } else if (assetType === "sound") {
      source = await soundAssetSourceRevision(species);
      if (!source.soundBuffer.length && !source.creditsBuffer.length && !source.spectrogramBuffer.length) {
        const error = new Error("Für diese Art ist kein Soundpaket vorhanden");
        error.statusCode = 409;
        throw error;
      }
      removedLabel = "Soundpaket";
      reportNeedsRefresh = true;
      backupFiles.push(
        { fileName: "sound.mp3", path: source.soundPath, buffer: source.soundBuffer },
        { fileName: "credits.json", path: source.creditsPath, buffer: source.creditsBuffer },
        { fileName: "spectrogram.webp", path: source.spectrogramPath, buffer: source.spectrogramBuffer },
      );
    } else {
      source = await portraitAssetSourceRevision(species);
      if (!source.portraitBuffer.length && !source.metadataBuffer.length) {
        const error = new Error("Für diese Art ist kein Artporträt vorhanden");
        error.statusCode = 409;
        throw error;
      }
      removedLabel = "Artporträt";
      backupFiles.push(
        { fileName: "portrait.webp", path: source.portraitPath, buffer: source.portraitBuffer },
        { fileName: "portrait.json", path: source.metadataPath, buffer: source.metadataBuffer },
      );
    }

    setAssetWriteActive(true);
    try {
      closeActiveFileStreams((filePath) => isPathInside(source.assetDirectory, filePath, { allowRoot: true }));
      const registry = JSON.parse(source.registryText);
      const currentHash = createHash("sha256")
        .update(Buffer.concat(backupFiles.map((entry) => entry.buffer)))
        .digest("hex");
      backupRelativePath = await writeManagedAssetBackup({
        repoRoot,
        assetBackupRoot,
        species,
        assetType,
        files: backupFiles,
        metadata: {
          action: "delete",
          sha256: currentHash,
          override: registry.assets?.[species.safeName]?.[assetType] ?? null,
          spectrogramOverride: assetType === "sound"
            ? registry.assets?.[species.safeName]?.spectrogram ?? null
            : null,
        },
      });

      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      if (assetType === "map") {
        delete registry.assets[species.safeName].map;
      } else if (assetType === "sound") {
        const previousSoundOverride = registry.assets[species.safeName].sound ?? {};
        const rejectedSources = Array.isArray(previousSoundOverride.rejectedSources)
          ? previousSoundOverride.rejectedSources
          : [];
        registry.assets[species.safeName].sound = rejectedSources.length
          ? {
              rejectedSources,
              manual: false,
              protectFromPipeline: false,
              reason: "Soundpaket wurde manuell gelöscht; bereits abgelehnte Quellen bleiben gespeichert.",
              updatedAt: new Date().toISOString(),
            }
          : undefined;
        if (!registry.assets[species.safeName].sound) delete registry.assets[species.safeName].sound;
        delete registry.assets[species.safeName].spectrogram;
      } else {
        delete registry.assets[species.safeName].portrait;
      }
      if (Object.keys(registry.assets[species.safeName]).length === 0) {
        delete registry.assets[species.safeName];
      }
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;
      const nextDocumentationText = assetType === "map"
        ? synchronizeManualMapDocumentation(documentationText, registry)
        : "";
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      const documentationTempPath = assetType === "map"
        ? `${manualMapOverridesPath}.tmp-${randomUUID()}`
        : "";

      try {
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        if (assetType === "map") {
          await writeFile(documentationTempPath, nextDocumentationText, "utf8");
        }
        for (const entry of backupFiles) {
          if (entry.buffer.length) await unlink(entry.path).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
        await rename(registryTempPath, assetOverridesPath);
        if (assetType === "map") await rename(documentationTempPath, manualMapOverridesPath);
      } catch (error) {
        await unlink(registryTempPath).catch(() => {});
        if (documentationTempPath) await unlink(documentationTempPath).catch(() => {});
        for (const entry of backupFiles) {
          if (entry.buffer.length) await writeFile(entry.path, entry.buffer);
        }
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        if (assetType === "map") await writeFile(manualMapOverridesPath, documentationText, "utf8");
        throw error;
      }

      if (reportNeedsRefresh && rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          for (const entry of backupFiles) {
            if (entry.buffer.length) await writeFile(entry.path, entry.buffer);
          }
          await writeFile(assetOverridesPath, source.registryText, "utf8");
          if (assetType === "map") await writeFile(manualMapOverridesPath, documentationText, "utf8");
          if (reportText) await writeFile(reportPath, reportText, "utf8");
          throw new Error(`Report-Abgleich nach Asset-Löschung fehlgeschlagen: ${reportRun.stderr || reportRun.stdout}`);
        }
      }

      let backupRetention = { kept: 0, removed: 0, bytes: 0 };
      let backupCleanupWarning = "";
      try {
        backupRetention = await pruneAssetBackups(assetBackupRoot);
      } catch (error) {
        backupCleanupWarning = `Assetbackup-Bereinigung fehlgeschlagen: ${error.message}`;
      }
      await refreshModel({ force: true });
      return {
        ok: true,
        deleted: true,
        assetType,
        label: removedLabel,
        backup: backupRelativePath,
        backupRetention,
        backupCleanupWarning,
        species: getModel().species.find((entry) => entry.id === id) ?? null,
        summary: getModel().summary,
        validation: getModel().validation,
        pendingTransfer: true,
      };
    } finally {
      setAssetWriteActive(false);
    }
  }

  async function restoreSpeciesAsset(id, assetType) {
    cleanupPreviewTokens();
    if (!["map", "sound", "portrait"].includes(assetType)) {
      const error = new Error("Assettyp muss Karte, Sound oder Artporträt sein");
      error.statusCode = 400;
      throw error;
    }
    if (isAssetWriteActive() || getPipelineProcess() || getPipelineState().status === "running" || getPipelineState().status === "awaiting-review") {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }

    const latestBackup = await latestAssetBackup(assetBackupRoot, repoRoot, species.safeName, assetType);
    if (!latestBackup.exists) {
      const error = new Error("Für dieses Asset ist keine lokale Sicherung vorhanden");
      error.statusCode = 404;
      throw error;
    }
    const backupPath = resolve(repoRoot, latestBackup.path);
    const allowedBackupRoot = `${resolve(assetBackupRoot, species.safeName, assetType)}${sep}`;
    const backupAsDirectory = existsSync(backupPath) && statSync(backupPath).isDirectory();
    if (
      !isPathInside(allowedBackupRoot, backupPath, { allowRoot: true })
    ) {
      const error = new Error("Unsicherer Sicherungspfad");
      error.statusCode = 409;
      throw error;
    }

    const source = assetType === "map"
      ? await mapAssetSourceRevision(species)
      : assetType === "sound"
        ? await soundAssetSourceRevision(species)
        : await portraitAssetSourceRevision(species);
    const reportPath = join(repoRoot, "fehlende_elemente_report.json");
    const reportText = await readFile(reportPath, "utf8").catch(() => "");
    const documentationText = assetType === "map" ? source.documentationText : "";
    const fileNames = assetBackupFileNames(assetType);
    const backupFiles = [];
    for (const fileName of fileNames) {
      const filePath = backupAsDirectory ? join(backupPath, fileName) : backupPath;
      if (assetType !== "map" && !backupAsDirectory) continue;
      if (!existsSync(filePath)) continue;
      backupFiles.push({ fileName, buffer: await readFile(filePath) });
    }
    if (!backupFiles.length) {
      const error = new Error("Die lokale Sicherung enthält keine wiederherstellbaren Dateien");
      error.statusCode = 409;
      throw error;
    }
    if (assetType === "sound") {
      const soundBackup = backupFiles.find((file) => file.fileName === "sound.mp3");
      if (!soundBackup) {
        const error = new Error("Die lokale Soundsicherung enthält keine sound.mp3");
        error.statusCode = 409;
        throw error;
      }
      try {
        inspectMp3Buffer(soundBackup.buffer);
      } catch (inspectionError) {
        const error = new Error(
          `Die lokale Soundsicherung enthält kein gültiges MP3 und wird nicht wiederhergestellt: ${inspectionError.message}`,
        );
        error.statusCode = 409;
        throw error;
      }
    }

    setAssetWriteActive(true);
    try {
      closeActiveFileStreams((filePath) => isPathInside(source.assetDirectory, filePath, { allowRoot: true }));
      await mkdir(source.assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      const metadata = latestBackup.metadata ?? await readBackupMetadata(backupAsDirectory ? backupPath : join(backupPath, ".."));
      if (metadata.override && typeof metadata.override === "object") {
        registry.assets[species.safeName][assetType] = metadata.override;
      } else {
        delete registry.assets[species.safeName][assetType];
      }
      if (assetType === "sound") {
        if (metadata.spectrogramOverride && typeof metadata.spectrogramOverride === "object") {
          registry.assets[species.safeName].spectrogram = metadata.spectrogramOverride;
        } else {
          delete registry.assets[species.safeName].spectrogram;
        }
      }
      if (Object.keys(registry.assets[species.safeName]).length === 0) {
        delete registry.assets[species.safeName];
      }
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;
      const nextDocumentationText = assetType === "map"
        ? synchronizeManualMapDocumentation(documentationText, registry)
        : "";
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      const documentationTempPath = assetType === "map"
        ? `${manualMapOverridesPath}.tmp-${randomUUID()}`
        : "";

      try {
        for (const file of backupFiles) {
          await writeFile(join(source.assetDirectory, file.fileName), file.buffer);
        }
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await rename(registryTempPath, assetOverridesPath);
        if (assetType === "map") {
          await writeFile(documentationTempPath, nextDocumentationText, "utf8");
          await rename(documentationTempPath, manualMapOverridesPath);
        }
      } catch (error) {
        await unlink(registryTempPath).catch(() => {});
        if (documentationTempPath) await unlink(documentationTempPath).catch(() => {});
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        if (assetType === "map") await writeFile(manualMapOverridesPath, documentationText, "utf8");
        throw error;
      }

      if ((assetType === "map" || assetType === "sound") && rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          await writeFile(assetOverridesPath, source.registryText, "utf8");
          if (assetType === "map") await writeFile(manualMapOverridesPath, documentationText, "utf8");
          if (reportText) await writeFile(reportPath, reportText, "utf8");
          throw new Error(`Report-Abgleich nach Wiederherstellung fehlgeschlagen: ${reportRun.stderr || reportRun.stdout}`);
        }
      }

      await refreshModel({ force: true });
      return {
        ok: true,
        restored: true,
        assetType,
        backup: latestBackup.path,
        species: getModel().species.find((entry) => entry.id === id) ?? null,
        summary: getModel().summary,
        validation: getModel().validation,
        pendingTransfer: true,
      };
    } finally {
      setAssetWriteActive(false);
    }
  }

  return {
    createAssetMutationPreview,
    runConfirmedAssetMutation,
    deleteSpeciesAsset,
    restoreSpeciesAsset,
  };
}
