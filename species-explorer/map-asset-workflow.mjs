import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

import { pruneAssetBackups, writeManagedAssetBackup } from "./asset-backups.mjs";
import { findEditableSpecies } from "./species-model.mjs";
import { synchronizeManualMapDocumentation } from "./manual-map-documentation.mjs";
import { inspectJpeg, validateMapPreviewPayload } from "./media-assets.mjs";

export function createMapAssetOperations({
  repoRoot,
  assetOverridesPath,
  manualMapOverridesPath,
  assetStagingRoot,
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
  publishAssetChanges,
  rebuildReportAfterAssetSave,
  mapImageRenderer,
  runCommandCapture,
  synchronizeProjectStatusForPublication,
  hashText,
}) {

  async function publishMapAssetChanges(species) {
    if (!publishAssetChanges) {
      return { published: false, skipped: true, commit: "" };
    }
    const paths = [
      `species-assets/${species.safeName}/map.jpg`,
      "species-assets-overrides.json",
      "docs/manual-map-overrides.md",
      "fehlende_elemente_report.json",
      "docs/project-status.md",
    ];
    const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (stagedBefore.code !== 0) {
      throw new Error(
        "Vor dem Kartenimport waren bereits Dateien vorgemerkt. Commit und Push wurden nicht gestartet.",
      );
    }
    await synchronizeProjectStatusForPublication();
    const staged = await runCommandCapture("git", ["add", "--", ...paths]);
    if (staged.code !== 0) {
      throw new Error(`Git-Dateien konnten nicht vorgemerkt werden: ${staged.stderr || staged.stdout}`);
    }
    const changed = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (changed.code === 0) return { published: true, skipped: false, commit: "" };
    if (changed.code !== 1) {
      throw new Error(`Git-Änderungen konnten nicht geprüft werden: ${changed.stderr || changed.stdout}`);
    }
    const committed = await runCommandCapture(
      "git",
      ["commit", "-m", `Replace distribution map for ${species.germanName}`],
    );
    if (committed.code !== 0) {
      throw new Error(`Git-Commit fehlgeschlagen: ${committed.stderr || committed.stdout}`);
    }
    const commit = await runCommandCapture("git", ["rev-parse", "--short", "HEAD"]);
    const pushed = await runCommandCapture("git", ["push"]);
    if (pushed.code !== 0) {
      throw new Error(`Git-Push fehlgeschlagen: ${pushed.stderr || pushed.stdout}`);
    }
    return { published: true, skipped: false, commit: commit.stdout };
  }

  async function mapAssetSourceRevision(species) {
    const assetDirectory = join(repoRoot, "species-assets", species.safeName);
    const mapPath = join(assetDirectory, "map.jpg");
    const [registryText, documentationText] = await Promise.all([
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      readFile(manualMapOverridesPath, "utf8"),
    ]);
    const mapBuffer = existsSync(mapPath) ? await readFile(mapPath) : Buffer.alloc(0);
    return {
      revision: hashText(
        `${createHash("sha256").update(mapBuffer).digest("hex")}\n${registryText}\n${documentationText}`,
      ),
      assetDirectory,
      mapPath,
      mapBuffer,
      registryText,
      documentationText,
    };
  }

  async function previewMapAsset(id, payload) {
    cleanupPreviewTokens();
    const allowDuringCurrentReview =
      getPipelineState().status === "awaiting-review"
      && String(payload?.pipelineRunId ?? "") === getPipelineState().runId
      && getPipelineState().targets.some((target) => target.slug === id);
    if (
      getPipelineProcess()
      || getPipelineState().status === "running"
      || (getPipelineState().status === "awaiting-review" && !allowDuringCurrentReview)
    ) {
      const error = new Error("Während eines Pipeline-Laufs können keine Karten ersetzt werden");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const validated = await validateMapPreviewPayload(payload, { repoRoot, mapImageRenderer });
    if (validated.errors.length) {
      const error = new Error("Karten-Datei oder Angaben sind ungültig");
      error.statusCode = 400;
      error.details = validated.errors;
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + previewTokenTtlMs;
    await mkdir(assetStagingRoot, { recursive: true });
    const stagingPath = join(assetStagingRoot, `${token}.jpg`);
    await writeFile(stagingPath, validated.buffer);
    const source = await mapAssetSourceRevision(species);
    let currentDimensions = null;
    if (source.mapBuffer.length) {
      try {
        currentDimensions = inspectJpeg(source.mapBuffer);
      } catch {
        currentDimensions = null;
      }
    }
    const sha256 = createHash("sha256").update(validated.buffer).digest("hex");
    previewTokens.set(token, {
      type: "map-asset",
      id,
      safeName: species.safeName,
      reason: validated.reason,
      source: validated.source,
      originalName: validated.originalName,
      stagingPath,
      sha256,
      bytes: validated.buffer.length,
      dimensions: validated.dimensions,
      sourceRevision: source.revision,
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
      },
      currentMap: {
        exists: source.mapBuffer.length > 0,
        bytes: source.mapBuffer.length,
        dimensions: currentDimensions,
        url: source.mapBuffer.length
          ? `/assets/${encodeURIComponent(species.safeName)}/map.jpg?current=${token}`
          : "",
      },
      newMap: {
        bytes: validated.buffer.length,
        dimensions: validated.dimensions,
        sha256,
        url: `/api/species/${encodeURIComponent(id)}/assets/map/preview-file?token=${encodeURIComponent(token)}`,
      },
      reason: validated.reason,
      source: validated.source,
      warnings: [
        "Die vorhandene Karte wird vor dem Austausch lokal gesichert.",
        "Die neue Karte wird als manuell gepflegt markiert und vor automatischen Pipeline-Updates geschützt.",
        "Nach erfolgreichem Speichern werden Karte, Register und Dokumentation automatisch committed und gepusht.",
      ],
    };
  }

  async function saveMapAsset(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "map-asset" || preview.id !== id) {
      const error = new Error("Kartenvorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    const allowDuringCurrentReview =
      getPipelineState().status === "awaiting-review"
      && String(payload?.pipelineRunId ?? "") === getPipelineState().runId
      && getPipelineState().targets.some((target) => target.slug === id);
    if (
      isAssetWriteActive()
      || getPipelineProcess()
      || getPipelineState().status === "running"
      || (getPipelineState().status === "awaiting-review" && !allowDuringCurrentReview)
    ) {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inInput || species.safeName !== preview.safeName) {
      previewTokens.delete(token);
      const error = new Error("Art ist nicht mehr im erwarteten Zustand");
      error.statusCode = 409;
      throw error;
    }
    if (!existsSync(preview.stagingPath)) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte Kartendatei fehlt");
      error.statusCode = 409;
      throw error;
    }
    const stagedBuffer = await readFile(preview.stagingPath);
    const stagedHash = createHash("sha256").update(stagedBuffer).digest("hex");
    if (stagedHash !== preview.sha256) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte Kartendatei wurde verändert");
      error.statusCode = 409;
      throw error;
    }
    const source = await mapAssetSourceRevision(species);
    if (source.revision !== preview.sourceRevision) {
      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      const error = new Error("Karte oder Pflegeangaben wurden seit der Vorschau geändert");
      error.statusCode = 409;
      throw error;
    }
    if (publishAssetChanges) {
      const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
      if (stagedBefore.code !== 0) {
        const error = new Error(
          "Vor dem Kartenimport sind bereits Dateien für Git vorgemerkt. Bitte diese zuerst committen oder aus dem Index entfernen.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    setAssetWriteActive(true);
    let backupRelativePath = "";
    try {
      const assetDirectory = join(repoRoot, "species-assets", species.safeName);
      await mkdir(assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      if (source.mapBuffer.length) {
        const currentHash = createHash("sha256").update(source.mapBuffer).digest("hex");
        backupRelativePath = await writeManagedAssetBackup({
          repoRoot,
          assetBackupRoot,
          species,
          assetType: "map",
          files: [{ fileName: "map.jpg", buffer: source.mapBuffer }],
          metadata: {
            action: "replace",
            sha256: currentHash,
            override: registry.assets?.[species.safeName]?.map ?? null,
          },
        });
      }

      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      const updatedAt = new Date().toISOString();
      registry.assets[species.safeName].map = {
        manual: true,
        protectFromPipeline: true,
        reason: preview.reason,
        source: preview.source,
        germanName: species.germanName,
        originalFileName: preview.originalName,
        importedAt: updatedAt,
        updatedAt,
        sha256: preview.sha256,
      };
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;
      const nextDocumentationText = synchronizeManualMapDocumentation(
        source.documentationText,
        registry,
      );

      const mapTempPath = `${source.mapPath}.tmp-${randomUUID()}`;
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      const documentationTempPath = `${manualMapOverridesPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(mapTempPath, stagedBuffer);
        await rename(mapTempPath, source.mapPath);
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await rename(registryTempPath, assetOverridesPath);
        await writeFile(documentationTempPath, nextDocumentationText, "utf8");
        await rename(documentationTempPath, manualMapOverridesPath);
      } catch (error) {
        await unlink(mapTempPath).catch(() => {});
        await unlink(registryTempPath).catch(() => {});
        await unlink(documentationTempPath).catch(() => {});
        if (source.mapBuffer.length) await writeFile(source.mapPath, source.mapBuffer);
        else await unlink(source.mapPath).catch(() => {});
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        await writeFile(manualMapOverridesPath, source.documentationText, "utf8");
        throw error;
      }

      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      let backupRetention = { kept: 0, removed: 0, bytes: 0 };
      let backupCleanupWarning = "";
      try {
        backupRetention = await pruneAssetBackups(assetBackupRoot);
      } catch (error) {
        backupCleanupWarning = `Assetbackup-Bereinigung fehlgeschlagen: ${error.message}`;
      }
      if (rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          throw new Error(`Report konnte nach dem Kartenimport nicht aktualisiert werden: ${reportRun.stderr || reportRun.stdout}`);
        }
      }
      await refreshModel({ force: true });
      let publication;
      let publicationError = "";
      try {
        publication = await publishMapAssetChanges(species);
      } catch (error) {
        publication = { published: false, skipped: false, commit: "" };
        publicationError = error.message;
      }
      return {
        ok: !publicationError,
        saved: true,
        backup: backupRelativePath,
        backupRetention,
        backupCleanupWarning,
        gitPublished: publication.published,
        gitSkipped: publication.skipped,
        gitCommit: publication.commit,
        publicationError,
        species: getModel().species.find((entry) => entry.id === id) ?? null,
        summary: getModel().summary,
        validation: getModel().validation,
      };
    } finally {
      setAssetWriteActive(false);
    }
  }


  return { previewMapAsset, saveMapAsset, mapAssetSourceRevision };
}
