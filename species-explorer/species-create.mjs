import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  PORTRAIT_STANDARD,
  buildPortraitPrompt,
  portraitPromptSha256,
} from "../scripts/portrait-generator.mjs";
import {
  DEFAULT_PORTRAIT_OPTIONS,
} from "../scripts/portrait-renderer.mjs";
import { resolveFfmpegPath } from "../scripts/spectrogram-renderer.mjs";
import { pruneSpeciesListBackups } from "./asset-backups.mjs";
import {
  MAX_PORTRAIT_INSTRUCTIONS_LENGTH,
  inspectWebp,
  validatePortraitPreviewPayload,
} from "./media-assets.mjs";
import {
  buildNewSpeciesEntry,
  findNewSpeciesCollisions,
  validateNewSpeciesValues,
} from "./species-model.mjs";

export function createSpeciesCreateOperations({
  repoRoot,
  speciesListPath,
  backupDir,
  assetStagingRoot,
  previewTokens,
  previewTokenTtlMs,
  cleanupPreviewTokens,
  getModel,
  refreshModel,
  hashText,
  compactTimestamp,
  isPipelineBusy,
  isAssetWriteActive,
  portraitAssetSourceRevision,
  removePreviousPortraitPreviews,
  portraitRenderer,
}) {
  async function previewNewSpecies(payload) {
    cleanupPreviewTokens();
    const { values, errors, fieldErrors } = validateNewSpeciesValues(payload?.values);
    if (errors.length) {
      const error = new Error("Eingaben sind ungültig");
      error.statusCode = 400;
      error.details = errors;
      error.fieldErrors = fieldErrors;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    const inputList = JSON.parse(sourceText);
    if (!Array.isArray(inputList)) {
      const error = new Error("Eingabeliste muss ein Array enthalten");
      error.statusCode = 409;
      throw error;
    }

    const { entry, derived } = buildNewSpeciesEntry(values);
    const collisions = findNewSpeciesCollisions({
      inputList,
      model: getModel(),
      entry,
      derived,
      repoRoot,
    });
    if (collisions.length) {
      const error = new Error("Neue Art kollidiert mit bestehenden Daten oder Assets");
      error.statusCode = 409;
      error.details = collisions;
      error.fieldErrors = {
        ...(collisions.some((message) => message.includes("Deutscher Name"))
          ? { german: collisions.filter((message) => message.includes("Deutscher Name")) }
          : {}),
        ...(collisions.some((message) => message.includes("Wissenschaftlicher Name") || message.includes("URL-Slug"))
          ? {
              scientificName: collisions.filter(
                (message) => message.includes("Wissenschaftlicher Name") || message.includes("URL-Slug"),
              ),
            }
          : {}),
      };
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + previewTokenTtlMs;
    previewTokens.set(token, {
      type: "create",
      values,
      sourceRevision: hashText(sourceText),
      expiresAt,
    });

    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      entry,
      derived: {
        ...derived,
        assetDirectory: `species-assets/${derived.safeName}`,
      },
      warnings: [
        "Vor dem Speichern wird automatisch eine lokale Sicherung angelegt.",
        "Die neue Art erscheint zunächst ohne Pipeline-Daten und Assets im Explorer.",
        "Pipeline-Daten und Assets bleiben unverändert. Die Pipeline muss anschließend separat ausgeführt werden.",
      ],
    };
  }

  function createNewSpeciesPortraitPrompt(payload) {
    cleanupPreviewTokens();
    const { values, errors, fieldErrors } = validateNewSpeciesValues(payload?.values);
    const additionalInstructions = String(payload?.additionalInstructions ?? "").trim();
    if (additionalInstructions.length > MAX_PORTRAIT_INSTRUCTIONS_LENGTH) {
      errors.push(
        `Zusätzliche Hinweise dürfen maximal ${MAX_PORTRAIT_INSTRUCTIONS_LENGTH} Zeichen enthalten`,
      );
    }
    if (errors.length) {
      const error = new Error("Eingaben sind ungültig");
      error.statusCode = 400;
      error.details = errors;
      error.fieldErrors = fieldErrors;
      throw error;
    }

    const { entry, derived } = buildNewSpeciesEntry(values);
    const prompt = buildPortraitPrompt({
      germanName: entry.german,
      scientificName: derived.scientificName,
      additionalInstructions,
    });
    return {
      entry,
      derived: {
        ...derived,
        assetDirectory: `species-assets/${derived.safeName}`,
      },
      prompt,
      promptVersion: PORTRAIT_STANDARD.promptVersion,
      promptSha256: portraitPromptSha256(prompt),
      fileName: `${derived.safeName}.png`,
      instructions: [
        "Prompt in ChatGPT einfügen und dort genau ein Bild für diese eine Art erzeugen.",
        `Bild als ${derived.safeName}.png, .jpg oder .webp speichern.`,
        "Art anschließend anlegen und das Bild im selben Dialog prüfen und übernehmen.",
      ],
    };
  }

  async function previewNewSpeciesPortrait(payload) {
    cleanupPreviewTokens();
    if (isPipelineBusy()) {
      const error = new Error("Während eines Pipeline-Laufs können keine Artporträts importiert werden");
      error.statusCode = 409;
      throw error;
    }
    if (isAssetWriteActive()) {
      const error = new Error("Es läuft bereits ein schreibender Assetprozess");
      error.statusCode = 409;
      throw error;
    }
    const createToken = String(payload?.token ?? payload?.createToken ?? "");
    const createPreview = previewTokens.get(createToken);
    if (!createPreview || createPreview.type !== "create") {
      const error = new Error("Artvorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    const sourceText = await readFile(speciesListPath, "utf8");
    if (hashText(sourceText) !== createPreview.sourceRevision) {
      previewTokens.delete(createToken);
      const error = new Error("Eingabeliste wurde seit der Artprüfung geändert. Bitte erneut prüfen.");
      error.statusCode = 409;
      throw error;
    }
    const { values, errors, fieldErrors } = validateNewSpeciesValues(createPreview.values);
    if (errors.length) {
      const error = new Error("Gespeicherte Artvorschau ist ungültig");
      error.statusCode = 409;
      error.details = errors;
      error.fieldErrors = fieldErrors;
      throw error;
    }

    const { entry, derived } = buildNewSpeciesEntry(values);
    const species = {
      id: derived.slug,
      germanName: entry.german,
      scientificName: derived.scientificName,
      safeName: derived.safeName,
    };
    const validated = validatePortraitPreviewPayload(payload, species);
    if (validated.errors.length) {
      const error = new Error("Artporträt-Datei oder Angaben sind ungültig");
      error.statusCode = 400;
      error.details = validated.errors;
      throw error;
    }

    const source = await portraitAssetSourceRevision(species);
    removePreviousPortraitPreviews(species.id);
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
        id: species.id,
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
        species,
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
          url: `/api/species/${encodeURIComponent(species.id)}/assets/portrait/preview-file?token=${encodeURIComponent(token)}`,
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
          "Die Vorschau legt noch keine Art und keine produktive Datei an.",
          "Erst der Abschluss speichert die Art und übernimmt optional dieses Portrait.",
        ],
      };
    } catch (error) {
      rmSync(inputStagingPath, { force: true });
      rmSync(stagingPath, { force: true });
      throw error;
    }
  }

  async function saveNewSpecies(payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "create") {
      const error = new Error("Vorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    if (hashText(sourceText) !== preview.sourceRevision) {
      previewTokens.delete(token);
      const error = new Error("Eingabeliste wurde seit der Vorschau geändert. Bitte erneut prüfen.");
      error.statusCode = 409;
      throw error;
    }

    const inputList = JSON.parse(sourceText);
    if (!Array.isArray(inputList)) {
      const error = new Error("Eingabeliste muss ein Array enthalten");
      error.statusCode = 409;
      throw error;
    }

    const { values, errors } = validateNewSpeciesValues(preview.values);
    if (errors.length) {
      const error = new Error("Gespeicherte Vorschau ist ungültig");
      error.statusCode = 409;
      error.details = errors;
      throw error;
    }

    const { entry, derived } = buildNewSpeciesEntry(values);
    const collisions = findNewSpeciesCollisions({
      inputList,
      model: getModel(),
      entry,
      derived,
      repoRoot,
    });
    if (collisions.length) {
      previewTokens.delete(token);
      const error = new Error("Neue Art kollidiert inzwischen mit bestehenden Daten oder Assets");
      error.statusCode = 409;
      error.details = collisions;
      throw error;
    }

    await mkdir(backupDir, { recursive: true });
    const backupName =
      `species_list-${compactTimestamp()}-${derived.safeName}-${randomUUID().slice(0, 8)}.json`;
    const backupPath = join(backupDir, backupName);
    await writeFile(backupPath, sourceText, "utf8");

    const nextText = `${JSON.stringify([...inputList, entry], null, 2)}\n`;
    const tempPath = `${speciesListPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tempPath, nextText, "utf8");
      await rename(tempPath, speciesListPath);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }

    previewTokens.delete(token);
    await refreshModel({ force: true });
    let backupRetention = { kept: 0, removed: 0 };
    let backupCleanupWarning = "";
    try {
      backupRetention = await pruneSpeciesListBackups(backupDir);
    } catch (error) {
      backupCleanupWarning = `Backup-Bereinigung fehlgeschlagen: ${error.message}`;
    }
    const model = getModel();
    return {
      ok: true,
      backup: `species-explorer/backups/${backupName}`,
      backupRetention,
      backupCleanupWarning,
      entry,
      derived: {
        ...derived,
        assetDirectory: `species-assets/${derived.safeName}`,
      },
      species: model.species.find((item) => item.id === derived.slug) ?? null,
      summary: model.summary,
      validation: model.validation,
      pipelineRequired: true,
    };
  }

  return {
    previewNewSpecies,
    createNewSpeciesPortraitPrompt,
    previewNewSpeciesPortrait,
    saveNewSpecies,
  };
}
