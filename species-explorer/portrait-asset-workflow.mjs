import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import {
  PORTRAIT_STANDARD,
  buildPortraitPrompt,
  portraitPromptSha256,
} from "../scripts/portrait-generator.mjs";
import { DEFAULT_PORTRAIT_OPTIONS } from "../scripts/portrait-renderer.mjs";
import { resolveFfmpegPath } from "../scripts/spectrogram-renderer.mjs";
import { pruneAssetBackups, writeManagedAssetBackup } from "./asset-backups.mjs";
import { findEditableSpecies } from "./species-model.mjs";
import {
  MAX_PORTRAIT_INSTRUCTIONS_LENGTH,
  inspectWebp,
  validatePortraitPreviewPayload,
} from "./media-assets.mjs";

export function createPortraitAssetOperations({
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
  portraitRenderer,
  runCommandCapture,
  synchronizeProjectStatusForPublication,
  hashText,
}) {

  async function publishPortraitAssetChanges(species) {
    if (!publishAssetChanges) {
      return { published: false, skipped: true, commit: "" };
    }
    const paths = [
      `species-assets/${species.safeName}/portrait.webp`,
      `species-assets/${species.safeName}/portrait.json`,
      "species-assets-overrides.json",
      "docs/project-status.md",
    ];
    const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (stagedBefore.code !== 0) {
      throw new Error(
        "Vor der Porträtübernahme waren bereits Dateien vorgemerkt. Commit und Push wurden nicht gestartet.",
      );
    }
    await synchronizeProjectStatusForPublication();
    const staged = await runCommandCapture("git", ["add", "--", ...paths]);
    if (staged.code !== 0) {
      throw new Error(`Porträtdateien konnten nicht vorgemerkt werden: ${staged.stderr || staged.stdout}`);
    }
    const changed = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (changed.code === 0) return { published: true, skipped: false, commit: "" };
    if (changed.code !== 1) {
      throw new Error(`Git-Änderungen konnten nicht geprüft werden: ${changed.stderr || changed.stdout}`);
    }
    const committed = await runCommandCapture(
      "git",
      ["commit", "-m", `Add species portrait for ${species.germanName}`],
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

  async function portraitAssetSourceRevision(species) {
    const assetDirectory = join(repoRoot, "species-assets", species.safeName);
    const portraitPath = join(assetDirectory, "portrait.webp");
    const metadataPath = join(assetDirectory, "portrait.json");
    const [registryText, portraitBuffer, metadataBuffer] = await Promise.all([
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      existsSync(portraitPath) ? readFile(portraitPath) : Promise.resolve(Buffer.alloc(0)),
      existsSync(metadataPath) ? readFile(metadataPath) : Promise.resolve(Buffer.alloc(0)),
    ]);
    const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
    return {
      revision: hashText(`${digest(portraitBuffer)}\n${digest(metadataBuffer)}\n${registryText}`),
      assetDirectory,
      portraitPath,
      metadataPath,
      portraitBuffer,
      metadataBuffer,
      registryText,
    };
  }

  function removePreviousPortraitPreviews(id) {
    for (const [token, preview] of previewTokens) {
      if (preview.type !== "portrait-asset" || preview.id !== id) continue;
      if (preview.stagingPath) rmSync(preview.stagingPath, { force: true });
      if (preview.inputStagingPath) rmSync(preview.inputStagingPath, { force: true });
      previewTokens.delete(token);
    }
  }

  function createPortraitPrompt(id, payload) {
    cleanupPreviewTokens();
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const additionalInstructions = String(payload?.additionalInstructions ?? "").trim();
    if (additionalInstructions.length > MAX_PORTRAIT_INSTRUCTIONS_LENGTH) {
      const error = new Error(
        `Zusätzliche Hinweise dürfen maximal ${MAX_PORTRAIT_INSTRUCTIONS_LENGTH} Zeichen enthalten`,
      );
      error.statusCode = 400;
      throw error;
    }
    const prompt = buildPortraitPrompt({
      germanName: species.germanName,
      scientificName: species.scientificName,
      additionalInstructions,
    });
    return {
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
        safeName: species.safeName,
      },
      prompt,
      promptVersion: PORTRAIT_STANDARD.promptVersion,
      promptSha256: portraitPromptSha256(prompt),
      fileName: `${species.safeName}.png`,
      instructions: [
        "Prompt in ChatGPT einfügen und dort ein Bild erzeugen.",
        `Bild als ${species.safeName}.png, .jpg oder .webp speichern.`,
        "Bild anschließend in der App prüfen und übernehmen.",
      ],
    };
  }

  async function previewPortraitAsset(id, payload) {
    cleanupPreviewTokens();
    if (getPipelineProcess() || getPipelineState().status === "running" || getPipelineState().status === "awaiting-review") {
      const error = new Error("Während eines Pipeline-Laufs können keine Artporträts importiert werden");
      error.statusCode = 409;
      throw error;
    }
    if (isAssetWriteActive()) {
      const error = new Error("Es läuft bereits ein schreibender Assetprozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const validated = validatePortraitPreviewPayload(payload, species);
    if (validated.errors.length) {
      const error = new Error("Artporträt-Datei oder Angaben sind ungültig");
      error.statusCode = 400;
      error.details = validated.errors;
      throw error;
    }
    const source = await portraitAssetSourceRevision(species);
    removePreviousPortraitPreviews(id);
    const token = randomUUID();
    const expiresAt = Date.now() + previewTokenTtlMs;
    const importedAt = new Date().toISOString();
    const inputExtension = validated.image.format === "jpeg"
      ? ".jpg"
      : `.${validated.image.format}`;
    await mkdir(assetStagingRoot, { recursive: true });
    const inputStagingPath = join(assetStagingRoot, `${token}.portrait-input${inputExtension}`);
    const stagingPath = join(assetStagingRoot, `${token}.portrait.webp`);
    await writeFile(inputStagingPath, validated.buffer);
    try {
      const rendered = await portraitRenderer({
        inputPath: inputStagingPath,
        outputPath: stagingPath,
        ffmpegPath: resolveFfmpegPath({ repoRoot }),
        options: DEFAULT_PORTRAIT_OPTIONS,
      });
      const renderedBuffer = await readFile(stagingPath);
      inspectWebp(renderedBuffer);
      const sha256 = createHash("sha256").update(renderedBuffer).digest("hex");
      previewTokens.set(token, {
        type: "portrait-asset",
        id,
        safeName: species.safeName,
        inputStagingPath,
        stagingPath,
        sha256,
        bytes: renderedBuffer.length,
        sourceRevision: source.revision,
        expiresAt,
        importedAt,
        additionalInstructions: validated.additionalInstructions,
        prompt: validated.prompt,
        promptSha256: validated.promptSha256,
        originalName: validated.originalName,
        originalFormat: validated.image.format,
        originalDimensions: {
          width: validated.image.width,
          height: validated.image.height,
        },
      });
      return {
        token,
        expiresAt: new Date(expiresAt).toISOString(),
        species: {
          id: species.id,
          germanName: species.germanName,
          scientificName: species.scientificName,
        },
        currentPortrait: {
          exists: source.portraitBuffer.length > 0,
          bytes: source.portraitBuffer.length,
          url: source.portraitBuffer.length
            ? `/assets/${encodeURIComponent(species.safeName)}/portrait.webp?current=${token}`
            : "",
        },
        newPortrait: {
          bytes: renderedBuffer.length,
          sha256,
          url: `/api/species/${encodeURIComponent(id)}/assets/portrait/preview-file?token=${encodeURIComponent(token)}`,
          size: `${rendered.width}x${rendered.height}`,
          promptVersion: PORTRAIT_STANDARD.promptVersion,
          prompt: validated.prompt,
          originalName: validated.originalName,
          originalFormat: validated.image.format,
          originalDimensions: {
            width: validated.image.width,
            height: validated.image.height,
          },
        },
        warnings: [
          "Das extern erzeugte Bild muss vor der Übernahme auf Artmerkmale und Anatomie geprüft werden.",
          "Die Vorschau ersetzt noch keine produktive Datei.",
          "Erst Artporträt übernehmen speichert, committed und pusht.",
        ],
      };
    } catch (error) {
      rmSync(inputStagingPath, { force: true });
      rmSync(stagingPath, { force: true });
      throw error;
    }
  }

  async function savePortraitAsset(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const publishAfterSave = payload?.publish !== false;
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "portrait-asset" || preview.id !== id) {
      const error = new Error("Artporträt-Vorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    if (isAssetWriteActive() || getPipelineProcess()
      || getPipelineState().status === "running" || getPipelineState().status === "awaiting-review") {
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
      const error = new Error("Vorgemerkte Artporträt-Datei fehlt");
      error.statusCode = 409;
      throw error;
    }
    const stagedBuffer = await readFile(preview.stagingPath);
    const stagedHash = createHash("sha256").update(stagedBuffer).digest("hex");
    if (stagedHash !== preview.sha256) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte Artporträt-Datei wurde verändert");
      error.statusCode = 409;
      throw error;
    }
    inspectWebp(stagedBuffer);
    const source = await portraitAssetSourceRevision(species);
    if (source.revision !== preview.sourceRevision) {
      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      rmSync(preview.inputStagingPath, { force: true });
      const error = new Error("Artporträt oder Metadaten wurden seit der Vorschau geändert");
      error.statusCode = 409;
      throw error;
    }
    if (publishAssetChanges && publishAfterSave) {
      const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
      if (stagedBefore.code !== 0) {
        const error = new Error(
          "Vor der Porträtübernahme sind bereits Dateien für Git vorgemerkt. Bitte diese zuerst committen oder aus dem Index entfernen.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    setAssetWriteActive(true);
    let backupRelativePath = "";
    try {
      await mkdir(source.assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      if (source.portraitBuffer.length || source.metadataBuffer.length) {
        const currentHash = createHash("sha256")
          .update(source.portraitBuffer)
          .update(source.metadataBuffer)
          .digest("hex");
        backupRelativePath = await writeManagedAssetBackup({
          repoRoot,
          assetBackupRoot,
          species,
          assetType: "portrait",
          files: [
            { fileName: "portrait.webp", buffer: source.portraitBuffer },
            { fileName: "portrait.json", buffer: source.metadataBuffer },
          ],
          metadata: {
            action: "replace",
            sha256: currentHash,
            override: registry.assets?.[species.safeName]?.portrait ?? null,
          },
        });
      }

      const approvedAt = new Date().toISOString();
      const metadata = {
        version: 1,
        german_name: species.germanName,
        scientific_name: species.scientificName,
        type: "AI-generated natural-history illustration",
        source: "ChatGPT",
        generation_method: "Manuell in ChatGPT erzeugt und im Arten-Explorer importiert",
        prompt_version: PORTRAIT_STANDARD.promptVersion,
        prompt_sha256: preview.promptSha256,
        prompt: preview.prompt,
        original_file_name: preview.originalName,
        original_format: preview.originalFormat,
        original_width: preview.originalDimensions.width,
        original_height: preview.originalDimensions.height,
        product_width: DEFAULT_PORTRAIT_OPTIONS.width,
        product_height: DEFAULT_PORTRAIT_OPTIONS.height,
        product_format: PORTRAIT_STANDARD.outputFormat,
        additional_instructions: preview.additionalInstructions,
        imported_at: preview.importedAt,
        approved_at: approvedAt,
        sha256: preview.sha256,
      };
      const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
      const metadataSha256 = createHash("sha256").update(metadataText).digest("hex");
      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      registry.assets[species.safeName].portrait = {
        managedBy: "species-explorer",
        source: metadata.source,
        generationMethod: metadata.generation_method,
        promptVersion: metadata.prompt_version,
        importedAt: metadata.imported_at,
        approvedAt,
        sha256: preview.sha256,
        metadataSha256,
      };
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;

      const portraitTempPath = `${source.portraitPath}.tmp-${randomUUID()}`;
      const metadataTempPath = `${source.metadataPath}.tmp-${randomUUID()}`;
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(portraitTempPath, stagedBuffer);
        await writeFile(metadataTempPath, metadataText, "utf8");
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await rename(portraitTempPath, source.portraitPath);
        await rename(metadataTempPath, source.metadataPath);
        await rename(registryTempPath, assetOverridesPath);
      } catch (error) {
        await unlink(portraitTempPath).catch(() => {});
        await unlink(metadataTempPath).catch(() => {});
        await unlink(registryTempPath).catch(() => {});
        if (source.portraitBuffer.length) await writeFile(source.portraitPath, source.portraitBuffer);
        else await unlink(source.portraitPath).catch(() => {});
        if (source.metadataBuffer.length) await writeFile(source.metadataPath, source.metadataBuffer);
        else await unlink(source.metadataPath).catch(() => {});
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        throw error;
      }

      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      rmSync(preview.inputStagingPath, { force: true });
      let backupRetention = { kept: 0, removed: 0, bytes: 0 };
      let backupCleanupWarning = "";
      try {
        backupRetention = await pruneAssetBackups(assetBackupRoot);
      } catch (error) {
        backupCleanupWarning = `Assetbackup-Bereinigung fehlgeschlagen: ${error.message}`;
      }
      await refreshModel({ force: true });
      let publication = { published: false, skipped: true, commit: "" };
      let publicationError = "";
      if (publishAfterSave) {
        try {
          publication = await publishPortraitAssetChanges(species);
        } catch (error) {
          publication = { published: false, skipped: false, commit: "" };
          publicationError = error.message;
        }
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
        portraitSha256: preview.sha256,
        metadataSha256,
        species: getModel().species.find((entry) => entry.id === id) ?? null,
        summary: getModel().summary,
        validation: getModel().validation,
      };
    } finally {
      setAssetWriteActive(false);
    }
  }


  return {
    createPortraitPrompt,
    previewPortraitAsset,
    savePortraitAsset,
    portraitAssetSourceRevision,
    removePreviousPortraitPreviews,
  };
}
