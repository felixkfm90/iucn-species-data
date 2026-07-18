import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import {
  DEFAULT_SPECTROGRAM_OPTIONS,
  resolveFfmpegPath,
} from "../scripts/spectrogram-renderer.mjs";
import { pruneAssetBackups, writeManagedAssetBackup } from "./asset-backups.mjs";
import { findEditableSpecies } from "./species-model.mjs";
import {
  inspectWebp,
  isNonCommercialLicense,
  validateSoundPreviewPayload,
} from "./media-assets.mjs";

export function createSoundAssetOperations({
  repoRoot,
  assetOverridesPath,
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
  spectrogramRenderer,
  runCommandCapture,
  synchronizeProjectStatusForPublication,
  rejectedSoundSourceFromCredits,
  addRejectedSoundSource,
  hashText,
}) {

  async function publishSoundAssetChanges(species, { message = "", includeReport = false } = {}) {
    if (!publishAssetChanges) {
      return { published: false, skipped: true, commit: "" };
    }
    const paths = [
      `species-assets/${species.safeName}/sound.mp3`,
      `species-assets/${species.safeName}/credits.json`,
      `species-assets/${species.safeName}/spectrogram.webp`,
      "species-assets-overrides.json",
      "docs/project-status.md",
    ];
    if (includeReport) paths.push("fehlende_elemente_report.json");
    const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (stagedBefore.code !== 0) {
      throw new Error(
        "Vor dem Soundimport waren bereits Dateien vorgemerkt. Commit und Push wurden nicht gestartet.",
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
      ["commit", "-m", message || `Replace sound and credits for ${species.germanName}`],
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

  async function soundAssetSourceRevision(species) {
    const assetDirectory = join(repoRoot, "species-assets", species.safeName);
    const soundPath = join(assetDirectory, "sound.mp3");
    const creditsPath = join(assetDirectory, "credits.json");
    const spectrogramPath = join(assetDirectory, "spectrogram.webp");
    const [registryText, soundBuffer, creditsBuffer, spectrogramBuffer] = await Promise.all([
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      existsSync(soundPath) ? readFile(soundPath) : Promise.resolve(Buffer.alloc(0)),
      existsSync(creditsPath) ? readFile(creditsPath) : Promise.resolve(Buffer.alloc(0)),
      existsSync(spectrogramPath) ? readFile(spectrogramPath) : Promise.resolve(Buffer.alloc(0)),
    ]);
    const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
    return {
      revision: hashText(
        `${digest(soundBuffer)}\n${digest(creditsBuffer)}\n${digest(spectrogramBuffer)}\n${registryText}`,
      ),
      assetDirectory,
      soundPath,
      creditsPath,
      spectrogramPath,
      soundBuffer,
      creditsBuffer,
      spectrogramBuffer,
      registryText,
    };
  }

  async function previewSoundAsset(id, payload) {
    cleanupPreviewTokens();
    if (getPipelineProcess() || getPipelineState().status === "running" || getPipelineState().status === "awaiting-review") {
      const error = new Error("Während eines Pipeline-Laufs können keine Sounds ersetzt werden");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const validated = validateSoundPreviewPayload(payload, species);
    if (validated.errors.length) {
      const error = new Error("MP3-Datei oder Credits sind ungültig");
      error.statusCode = 400;
      error.details = validated.errors;
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + previewTokenTtlMs;
    await mkdir(assetStagingRoot, { recursive: true });
    const stagingPath = join(assetStagingRoot, `${token}.mp3`);
    await writeFile(stagingPath, validated.buffer);
    const source = await soundAssetSourceRevision(species);
    const sha256 = createHash("sha256").update(validated.buffer).digest("hex");
    const creditsText = `${JSON.stringify(validated.credits, null, 2)}\n`;
    const creditsSha256 = createHash("sha256").update(creditsText).digest("hex");
    previewTokens.set(token, {
      type: "sound-asset",
      id,
      safeName: species.safeName,
      reason: validated.reason,
      originalName: validated.originalName,
      credits: validated.credits,
      creditsText,
      creditsSha256,
      stagingPath,
      sha256,
      bytes: validated.buffer.length,
      sourceRevision: source.revision,
      expiresAt,
      isNc: validated.isNc,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
      },
      currentSound: {
        exists: source.soundBuffer.length > 0,
        bytes: source.soundBuffer.length,
        url: source.soundBuffer.length
          ? `/assets/${encodeURIComponent(species.safeName)}/sound.mp3?current=${token}`
          : "",
        credits: species.credits ?? null,
      },
      newSound: {
        bytes: validated.buffer.length,
        sha256,
        url: `/api/species/${encodeURIComponent(id)}/assets/sound/preview-file?token=${encodeURIComponent(token)}`,
        credits: validated.credits,
        isNc: validated.isNc,
      },
      reason: validated.reason,
      warnings: [
        "Sound, Credits und vorhandenes Spektrogramm werden vor dem Austausch gemeinsam gesichert.",
        "Vor dem Speichern wird automatisch ein neues Spektrogramm für die ausgewählte MP3 erzeugt.",
        validated.isNc
          ? "Die angegebene Lizenz ist nicht-kommerziell (NC) und bleibt als Prüfhinweis sichtbar."
          : "Die Lizenz wird gespeichert, aber nicht automatisch rechtlich freigegeben.",
        "Sound, Credits, neues Spektrogramm und Hash-Metadaten werden gemeinsam committed und gepusht.",
      ],
    };
  }

  async function saveSoundAsset(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "sound-asset" || preview.id !== id) {
      const error = new Error("Soundvorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    if (isAssetWriteActive() || getPipelineProcess() || getPipelineState().status === "running" || getPipelineState().status === "awaiting-review") {
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
      const error = new Error("Vorgemerkte MP3-Datei fehlt");
      error.statusCode = 409;
      throw error;
    }
    const stagedBuffer = await readFile(preview.stagingPath);
    const stagedHash = createHash("sha256").update(stagedBuffer).digest("hex");
    if (stagedHash !== preview.sha256) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte MP3-Datei wurde verändert");
      error.statusCode = 409;
      throw error;
    }
    const source = await soundAssetSourceRevision(species);
    if (source.revision !== preview.sourceRevision) {
      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      const error = new Error("Sound, Credits oder Pflegeangaben wurden seit der Vorschau geändert");
      error.statusCode = 409;
      throw error;
    }
    if (publishAssetChanges) {
      const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
      if (stagedBefore.code !== 0) {
        const error = new Error(
          "Vor dem Soundimport sind bereits Dateien für Git vorgemerkt. Bitte diese zuerst committen oder aus dem Index entfernen.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    setAssetWriteActive(true);
    let backupRelativePath = "";
    const spectrogramStagingPath = join(assetStagingRoot, `${token}.webp`);
    try {
      preview.spectrogramStagingPath = spectrogramStagingPath;
      let renderedSpectrogram;
      try {
        renderedSpectrogram = await spectrogramRenderer({
          inputPath: preview.stagingPath,
          outputPath: spectrogramStagingPath,
          ffmpegPath: resolveFfmpegPath({ repoRoot }),
          options: DEFAULT_SPECTROGRAM_OPTIONS,
        });
      } catch (error) {
        await unlink(spectrogramStagingPath).catch(() => {});
        const generationError = new Error(
          `Sound wurde nicht gespeichert, weil das Spektrogramm nicht erzeugt werden konnte: ${error.message}`,
        );
        generationError.statusCode = 500;
        throw generationError;
      }
      let stagedSpectrogramBuffer;
      try {
        stagedSpectrogramBuffer = await readFile(spectrogramStagingPath);
        inspectWebp(stagedSpectrogramBuffer);
      } catch (error) {
        await unlink(spectrogramStagingPath).catch(() => {});
        const validationError = new Error(
          `Sound wurde nicht gespeichert, weil das erzeugte Spektrogramm ungültig ist: ${error.message}`,
        );
        validationError.statusCode = 500;
        throw validationError;
      }
      const spectrogramSha256 = createHash("sha256").update(stagedSpectrogramBuffer).digest("hex");

      await mkdir(source.assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      if (source.soundBuffer.length || source.creditsBuffer.length || source.spectrogramBuffer.length) {
        const currentHash = createHash("sha256")
          .update(source.soundBuffer)
          .update(source.creditsBuffer)
          .digest("hex");
        backupRelativePath = await writeManagedAssetBackup({
          repoRoot,
          assetBackupRoot,
          species,
          assetType: "sound",
          files: [
            { fileName: "sound.mp3", buffer: source.soundBuffer },
            { fileName: "credits.json", buffer: source.creditsBuffer },
            { fileName: "spectrogram.webp", buffer: source.spectrogramBuffer },
          ],
          metadata: {
            action: "replace",
            sha256: currentHash,
            override: registry.assets?.[species.safeName]?.sound ?? null,
            spectrogramOverride: registry.assets?.[species.safeName]?.spectrogram ?? null,
          },
        });
      }

      registry.version = 1;
      registry.assets ??= {};
      registry.spectrogramGenerator = {
        version: 1,
        ...DEFAULT_SPECTROGRAM_OPTIONS,
      };
      registry.assets[species.safeName] ??= {};
      const updatedAt = new Date().toISOString();
      registry.assets[species.safeName].sound = {
        manual: true,
        protectFromPipeline: true,
        reason: preview.reason,
        source: preview.credits.source,
        originalUrl: preview.credits.url,
        license: preview.credits.license,
        germanName: species.germanName,
        originalFileName: preview.originalName,
        importedAt: updatedAt,
        updatedAt,
        sha256: preview.sha256,
        creditsSha256: preview.creditsSha256,
        isNc: preview.isNc,
      };
      registry.assets[species.safeName].spectrogram = {
        stale: false,
        soundSha256: preview.sha256,
        spectrogramSha256,
        generatedAt: updatedAt,
        verifiedAt: updatedAt,
      };
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;

      const soundTempPath = `${source.soundPath}.tmp-${randomUUID()}`;
      const creditsTempPath = `${source.creditsPath}.tmp-${randomUUID()}`;
      const spectrogramTempPath = `${source.spectrogramPath}.tmp-${randomUUID()}`;
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(soundTempPath, stagedBuffer);
        await writeFile(creditsTempPath, preview.creditsText, "utf8");
        await writeFile(spectrogramTempPath, stagedSpectrogramBuffer);
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await rename(soundTempPath, source.soundPath);
        await rename(creditsTempPath, source.creditsPath);
        await rename(spectrogramTempPath, source.spectrogramPath);
        await rename(registryTempPath, assetOverridesPath);
      } catch (error) {
        await unlink(soundTempPath).catch(() => {});
        await unlink(creditsTempPath).catch(() => {});
        await unlink(spectrogramTempPath).catch(() => {});
        await unlink(registryTempPath).catch(() => {});
        if (source.soundBuffer.length) await writeFile(source.soundPath, source.soundBuffer);
        else await unlink(source.soundPath).catch(() => {});
        if (source.creditsBuffer.length) await writeFile(source.creditsPath, source.creditsBuffer);
        else await unlink(source.creditsPath).catch(() => {});
        if (source.spectrogramBuffer.length) await writeFile(source.spectrogramPath, source.spectrogramBuffer);
        else await unlink(source.spectrogramPath).catch(() => {});
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        throw error;
      }

      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      rmSync(spectrogramStagingPath, { force: true });
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
          throw new Error(`Report konnte nach dem Soundimport nicht aktualisiert werden: ${reportRun.stderr || reportRun.stdout}`);
        }
      }
      await refreshModel({ force: true });
      let publication;
      let publicationError = "";
      try {
        publication = await publishSoundAssetChanges(species);
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
        spectrogramGenerated: true,
        spectrogramBytes: renderedSpectrogram.outputBytes ?? stagedSpectrogramBuffer.length,
        spectrogramStale: false,
        soundSha256: preview.sha256,
        spectrogramSha256,
        isNc: preview.isNc,
        species: getModel().species.find((entry) => entry.id === id) ?? null,
        summary: getModel().summary,
        validation: getModel().validation,
      };
    } finally {
      setAssetWriteActive(false);
    }
  }

  async function rejectCurrentSoundAsset(id) {
    cleanupPreviewTokens();
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
    const source = await soundAssetSourceRevision(species);
    if (!source.soundBuffer.length && !source.creditsBuffer.length && !source.spectrogramBuffer.length) {
      const error = new Error("Für diese Art ist kein aktueller Sound vorhanden, der abgelehnt werden kann");
      error.statusCode = 409;
      throw error;
    }
    if (publishAssetChanges) {
      const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
      if (stagedBefore.code !== 0) {
        const error = new Error(
          "Vor der Sound-Ablehnung sind bereits Dateien für Git vorgemerkt. Bitte diese zuerst committen oder aus dem Index entfernen.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    setAssetWriteActive(true);
    let backupRelativePath = "";
    const reportPath = join(repoRoot, "fehlende_elemente_report.json");
    const reportText = await readFile(reportPath, "utf8").catch(() => "");
    try {
      await mkdir(source.assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      const currentHash = createHash("sha256")
        .update(source.soundBuffer)
        .update(source.creditsBuffer)
        .update(source.spectrogramBuffer)
        .digest("hex");
      backupRelativePath = await writeManagedAssetBackup({
        repoRoot,
        assetBackupRoot,
        species,
        assetType: "sound",
        files: [
          { fileName: "sound.mp3", buffer: source.soundBuffer },
          { fileName: "credits.json", buffer: source.creditsBuffer },
          { fileName: "spectrogram.webp", buffer: source.spectrogramBuffer },
        ],
        metadata: {
          action: "reject",
          sha256: currentHash,
          override: registry.assets?.[species.safeName]?.sound ?? null,
          spectrogramOverride: registry.assets?.[species.safeName]?.spectrogram ?? null,
        },
      });

      const rejectedSource = rejectedSoundSourceFromCredits({ safeName: species.safeName });
      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      const previousSoundOverride = registry.assets[species.safeName].sound ?? {};
      registry.assets[species.safeName].sound = {
        ...addRejectedSoundSource(previousSoundOverride, rejectedSource),
        manual: false,
        protectFromPipeline: false,
        reason: "Aktuelle Soundquelle wurde manuell abgelehnt; Quelle wird künftig übersprungen.",
        rejectedCurrent: true,
        rejectedAt: rejectedSource.rejectedAt,
        updatedAt: rejectedSource.rejectedAt,
      };
      delete registry.assets[species.safeName].spectrogram;
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;

      try {
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await unlink(source.soundPath).catch(() => {});
        await unlink(source.creditsPath).catch(() => {});
        await unlink(source.spectrogramPath).catch(() => {});
        await rename(registryTempPath, assetOverridesPath);
      } catch (error) {
        await unlink(registryTempPath).catch(() => {});
        if (source.soundBuffer.length) await writeFile(source.soundPath, source.soundBuffer);
        if (source.creditsBuffer.length) await writeFile(source.creditsPath, source.creditsBuffer);
        if (source.spectrogramBuffer.length) await writeFile(source.spectrogramPath, source.spectrogramBuffer);
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        throw error;
      }

      if (rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          if (source.soundBuffer.length) await writeFile(source.soundPath, source.soundBuffer);
          if (source.creditsBuffer.length) await writeFile(source.creditsPath, source.creditsBuffer);
          if (source.spectrogramBuffer.length) await writeFile(source.spectrogramPath, source.spectrogramBuffer);
          await writeFile(assetOverridesPath, source.registryText, "utf8");
          if (reportText) await writeFile(reportPath, reportText, "utf8");
          throw new Error(`Report-Abgleich nach Sound-Ablehnung fehlgeschlagen: ${reportRun.stderr || reportRun.stdout}`);
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
      let publication;
      let publicationError = "";
      try {
        publication = await publishSoundAssetChanges(species, {
          message: `Reject sound source for ${species.germanName}`,
          includeReport: true,
        });
      } catch (error) {
        publication = { published: false, skipped: false, commit: "" };
        publicationError = error.message;
      }
      return {
        ok: !publicationError,
        saved: true,
        rejectedSource,
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


  return {
    previewSoundAsset,
    saveSoundAsset,
    rejectCurrentSoundAsset,
    soundAssetSourceRevision,
  };
}
