import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runSpeciesCleanup } from "../scripts/species-cleanup.mjs";
import { pruneSpeciesListBackups } from "./asset-backups.mjs";
import {
  findEditableSpecies,
  findInputIndex,
  sanitizeAssetName,
} from "./species-model.mjs";

export function createSpeciesDeleteOperations({
  repoRoot,
  speciesListPath,
  backupDir,
  previewTokens,
  previewTokenTtlMs,
  cleanupPreviewTokens,
  getModel,
  refreshModel,
  hashText,
  compactTimestamp,
}) {
  async function previewSpeciesDelete(id) {
    cleanupPreviewTokens();
    const model = getModel();
    const species = findEditableSpecies(model, id);
    if (!species) {
      const error = new Error("Art wurde nicht gefunden");
      error.statusCode = 404;
      throw error;
    }
    const assetDirectoryExists = existsSync(join(repoRoot, "species-assets", species.safeName));
    if (!species.inInput && !species.inGenerated && !assetDirectoryExists) {
      const error = new Error("Für diese Art sind keine löschbaren Eingabe-, Daten- oder Assetreste vorhanden");
      error.statusCode = 409;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (species.inInput && inputIndex < 0) {
      const error = new Error("Art fehlt in der Eingabeliste");
      error.statusCode = 409;
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + previewTokenTtlMs;
    previewTokens.set(token, {
      type: "delete",
      id,
      sourceRevision: hashText(sourceText),
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
        inGenerated: species.inGenerated,
        assetDirectory: `species-assets/${species.safeName}`,
      },
      effects: [
        species.inInput
          ? "Der Eintrag wird aus der Eingabeliste entfernt."
          : "Der Eintrag ist bereits aus der Eingabeliste entfernt; es werden nur noch verbliebene generierte Daten und Assets bereinigt.",
        species.inInput
          ? "Ohne Zusatzoption bleiben generierte Daten und Assets bis zum Bereinigungslauf bestehen."
          : "Die dauerhafte Bereinigung ist erforderlich, damit die Art vollständig aus der App verschwindet.",
        "Mit Zusatzoption werden generierte Daten, Assessment-Zuordnung, Assetpflege und der Assetordner sofort dauerhaft gelöscht.",
      ],
      assetDirectoryExists,
      requiresAssetDeletion: !species.inInput,
    };
  }

  async function saveSpeciesDelete(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const deleteAssets = payload?.deleteAssets === true;
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "delete" || preview.id !== id) {
      const error = new Error("Löschvorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }

    const species = findEditableSpecies(getModel(), id);
    if (!species) {
      previewTokens.delete(token);
      const error = new Error("Art wurde nicht gefunden");
      error.statusCode = 409;
      throw error;
    }
    if (!species.inInput && !deleteAssets) {
      const error = new Error("Art ist bereits aus der Eingabeliste entfernt. Bitte dauerhafte Bereinigung auswählen.");
      error.statusCode = 409;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    if (hashText(sourceText) !== preview.sourceRevision) {
      previewTokens.delete(token);
      const error = new Error("Eingabeliste wurde seit der Löschvorschau geändert");
      error.statusCode = 409;
      throw error;
    }

    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (species.inInput && inputIndex < 0) {
      previewTokens.delete(token);
      const error = new Error("Art fehlt bereits in der Eingabeliste");
      error.statusCode = 409;
      throw error;
    }

    let backupName = "";
    let inputEntryRemoved = false;
    let permanentCleanup = null;
    if (deleteAssets) {
      try {
        permanentCleanup = runSpeciesCleanup(repoRoot, {
          slug: species.slug || species.id,
          safeName: species.safeName,
          allowInputEntry: species.inInput,
        });
      } catch (error) {
        await refreshModel({ force: true }).catch(() => {});
        throw error;
      }
    }

    if (species.inInput) {
      await mkdir(backupDir, { recursive: true });
      backupName =
        `species_list-${compactTimestamp()}-${sanitizeAssetName(species.germanName)}-${randomUUID().slice(0, 8)}.json`;
      await writeFile(join(backupDir, backupName), sourceText, "utf8");
      inputList.splice(inputIndex, 1);
      const tempPath = `${speciesListPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(tempPath, `${JSON.stringify(inputList, null, 2)}\n`, "utf8");
        await rename(tempPath, speciesListPath);
        inputEntryRemoved = true;
      } catch (error) {
        await unlink(tempPath).catch(() => {});
        throw error;
      }
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
      deleted: {
        id,
        germanName: species.germanName,
        scientificName: species.scientificName,
      },
      inputEntryRemoved,
      backup: backupName ? `species-explorer/backups/${backupName}` : "",
      backupRetention,
      backupCleanupWarning,
      assetDirectoryPreserved: deleteAssets ? "" : `species-assets/${species.safeName}`,
      permanentCleanup,
      pipelineRequired: deleteAssets ? false : species.inGenerated,
      summary: model.summary,
      validation: model.validation,
    };
  }

  return { previewSpeciesDelete, saveSpeciesDelete };
}
