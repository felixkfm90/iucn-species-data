import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { pruneSpeciesListBackups } from "./asset-backups.mjs";
import { closeActiveFileStreams } from "./http-routing.mjs";
import { synchronizeManualMapDocumentation } from "./manual-map-documentation.mjs";
import { isPathInside } from "./request-security.mjs";
import {
  EDITABLE_SCIENTIFIC_FIELD,
  buildEditChanges,
  editChangesRequirePipelineTransfer,
  findEditableSpecies,
  findInputIndex,
  normalizeComparable,
  replaceReportSpeciesName,
  sanitizeAssetName,
  scientificKey,
  updateAssetMetadataNames,
  validateEditableValues,
  validateGermanRename,
  validateScientificRename,
} from "./species-model.mjs";

export function createSpeciesEditOperations({
  repoRoot,
  speciesListPath,
  assetOverridesPath,
  taxonomyOverridesPath,
  assessmentIdsPath,
  manualMapOverridesPath,
  backupDir,
  previewTokens,
  previewTokenTtlMs,
  cleanupPreviewTokens,
  getModel,
  refreshModel,
  hashText,
  compactTimestamp,
  readJson,
  writeJsonAtomic,
  writeTextAtomic,
}) {
  async function previewSpeciesEdit(id, payload) {
    cleanupPreviewTokens();
    const model = getModel();
    const species = findEditableSpecies(model, id);
    if (!species) {
      const error = new Error("Art wurde nicht gefunden");
      error.statusCode = 404;
      throw error;
    }

    const { values, errors } = validateEditableValues(payload?.values, species);
    if (errors.length) {
      const error = new Error("Eingaben sind ungültig");
      error.statusCode = 400;
      error.details = errors;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (inputIndex < 0) {
      const error = new Error("Art fehlt in der Eingabeliste");
      error.statusCode = 409;
      throw error;
    }

    const [assetOverrides, assessmentIds] = await Promise.all([
      readJson(assetOverridesPath).catch(() => ({ version: 1, assets: {} })),
      readJson(assessmentIdsPath).catch(() => ({})),
    ]);
    const renameErrors = validateGermanRename({
      inputList,
      model,
      species,
      newGermanName: values.germanName,
      repoRoot,
      assetOverrides,
      assessmentIds,
    });
    if (renameErrors.length) {
      const error = new Error("Umbenennung ist nicht möglich");
      error.statusCode = 409;
      error.details = renameErrors;
      throw error;
    }
    const scientificRenameErrors = validateScientificRename({ inputList, model, species, values });
    if (scientificRenameErrors.length) {
      const error = new Error("Wissenschaftliche Umbenennung ist nicht möglich");
      error.statusCode = 409;
      error.details = scientificRenameErrors;
      throw error;
    }

    const changes = buildEditChanges(inputList[inputIndex], values);
    if (!changes.length) {
      const error = new Error("Es wurden keine Änderungen vorgenommen");
      error.statusCode = 400;
      throw error;
    }
    const scientificNameChanged = changes.some((change) => (
      change.key === EDITABLE_SCIENTIFIC_FIELD.key || change.key === "urlSlug"
    ));
    if (scientificNameChanged && !values.scientificNameUnlocked) {
      const error = new Error("Wissenschaftlicher Name ist gesperrt");
      error.statusCode = 409;
      error.details = [
        "Bitte Schloss öffnen und bestätigen: Die Änderung ändert den URL-Slug und kann sich direkt auf die Website auswirken.",
      ];
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + previewTokenTtlMs;
    previewTokens.set(token, {
      type: "edit",
      id,
      values,
      sourceRevision: hashText(sourceText),
      speciesDataRevision: await readFile(join(repoRoot, "speciesData.json"), "utf8")
        .then(hashText)
        .catch(() => ""),
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
      changes,
      warnings: [
        "Vor dem Speichern wird automatisch eine lokale Sicherung angelegt.",
        scientificNameChanged
          ? "Achtung: Der wissenschaftliche Name ändert den URL-Slug und kann sich direkt auf die Website auswirken."
          : "",
        editChangesRequirePipelineTransfer(changes)
          ? "Geänderte Eingabefelder werden später mit „Änderungen übertragen“ in speciesData.json übernommen."
          : "Name, URL-Slug, Assetname, Assetordner und lokale Metadaten werden direkt konsistent umbenannt.",
      ].filter(Boolean),
    };
  }

  async function saveSpeciesEdit(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "edit" || preview.id !== id) {
      const error = new Error("Vorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }

    const model = getModel();
    const species = findEditableSpecies(model, id);
    if (!species) {
      const error = new Error("Art wurde nicht gefunden");
      error.statusCode = 404;
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
    const inputIndex = findInputIndex(inputList, species);
    if (inputIndex < 0) {
      const error = new Error("Art fehlt in der Eingabeliste");
      error.statusCode = 409;
      throw error;
    }

    const { values, errors } = validateEditableValues(preview.values, species);
    if (errors.length) {
      const error = new Error("Gespeicherte Vorschau ist ungültig");
      error.statusCode = 409;
      error.details = errors;
      throw error;
    }

    const speciesDataPath = join(repoRoot, "speciesData.json");
    const reportPath = join(repoRoot, "fehlende_elemente_report.json");
    const [
      speciesDataText,
      registryText,
      taxonomyRegistryText,
      assessmentText,
      reportText,
      manualMapText,
    ] = await Promise.all([
      readFile(speciesDataPath, "utf8").catch(() => "[]\n"),
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      readFile(taxonomyOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "species": {}\n}\n'),
      readFile(assessmentIdsPath, "utf8").catch(() => "{}\n"),
      readFile(reportPath, "utf8").catch(() => ""),
      readFile(manualMapOverridesPath, "utf8").catch(() => ""),
    ]);
    const speciesData = JSON.parse(speciesDataText);
    const registry = JSON.parse(registryText);
    registry.assets ??= {};
    const taxonomyRegistry = JSON.parse(taxonomyRegistryText);
    taxonomyRegistry.version = 1;
    taxonomyRegistry.species ??= {};
    const assessmentIds = JSON.parse(assessmentText);
    const report = reportText ? JSON.parse(reportText) : null;
    const renameErrors = validateGermanRename({
      inputList,
      model,
      species,
      newGermanName: values.germanName,
      repoRoot,
      assetOverrides: registry,
      assessmentIds,
    });
    if (renameErrors.length) {
      const error = new Error("Umbenennung ist nicht möglich");
      error.statusCode = 409;
      error.details = renameErrors;
      throw error;
    }
    const scientificRenameErrors = validateScientificRename({ inputList, model, species, values });
    if (scientificRenameErrors.length) {
      const error = new Error("Wissenschaftliche Umbenennung ist nicht möglich");
      error.statusCode = 409;
      error.details = scientificRenameErrors;
      throw error;
    }

    const changes = buildEditChanges(inputList[inputIndex], values);
    if (!changes.length) {
      previewTokens.delete(token);
      const error = new Error("Die Änderungen sind nicht mehr erforderlich");
      error.statusCode = 409;
      throw error;
    }
    const pipelineRequired = editChangesRequirePipelineTransfer(changes);
    const germanNameChanged =
      normalizeComparable(inputList[inputIndex].german) !== normalizeComparable(values.germanName);
    const newScientificName = values.scientificName;
    const oldSlug = species.id;
    const newSlug = values.slug;
    const scientificNameChanged =
      scientificKey(inputList[inputIndex].genus, inputList[inputIndex].species)
        !== scientificKey(values.genus, values.species);
    if (scientificNameChanged && !values.scientificNameUnlocked) {
      previewTokens.delete(token);
      const error = new Error("Wissenschaftlicher Name ist gesperrt");
      error.statusCode = 409;
      error.details = [
        "Bitte Schloss öffnen und bestätigen: Die Änderung ändert den URL-Slug und kann sich direkt auf die Website auswirken.",
      ];
      throw error;
    }
    const oldGermanName = species.germanName;
    const newGermanName = values.germanName;
    const oldSafeName = species.safeName;
    const newSafeName = sanitizeAssetName(newGermanName);
    const safeNameChanged =
      oldSafeName.toLocaleLowerCase("de") !== newSafeName.toLocaleLowerCase("de");
    const oldAssetDirectory = join(repoRoot, "species-assets", oldSafeName);
    const newAssetDirectory = join(repoRoot, "species-assets", newSafeName);

    await mkdir(backupDir, { recursive: true });
    const backupName =
      `species_list-${compactTimestamp()}-${sanitizeAssetName(species.germanName)}-${randomUUID().slice(0, 8)}.json`;
    const backupPath = join(backupDir, backupName);
    await writeFile(backupPath, sourceText, "utf8");

    const currentEntry = inputList[inputIndex];
    inputList[inputIndex] = {
      ...currentEntry,
      german: values.germanName,
      genus: values.genus,
      species: values.species,
      size: values.size,
      weight: values.weight,
      life_expectancy: values.lifeExpectancy,
    };

    let registryChanged = false;
    let taxonomyRegistryChanged = false;
    let assessmentChanged = false;
    let speciesDataChanged = false;
    let reportChanged = false;
    let manualMapTextNext = manualMapText;

    const generatedIndex = speciesData.findIndex((entry) => (
      entry?.URLSlug === species.id
      || scientificKey(entry?.Genus, entry?.Species)
        === scientificKey(species.taxonomy.genus, species.taxonomy.species)
    ));
    if (generatedIndex >= 0 && (germanNameChanged || scientificNameChanged)) {
      speciesData[generatedIndex] = {
        ...speciesData[generatedIndex],
        ...(germanNameChanged ? { "Deutscher Name": newGermanName } : {}),
        ...(scientificNameChanged
          ? {
              "Wissenschaftlicher Name": newScientificName,
              Genus: values.genus,
              Species: values.species,
              URLSlug: newSlug,
            }
          : {}),
      };
      speciesDataChanged = true;
    }

    if (germanNameChanged) {
      if (registry.assets[oldSafeName]) {
        registry.assets[newSafeName] = registry.assets[oldSafeName];
        if (newSafeName !== oldSafeName) delete registry.assets[oldSafeName];
        for (const assetEntry of Object.values(registry.assets[newSafeName] ?? {})) {
          if (assetEntry && typeof assetEntry === "object" && Object.hasOwn(assetEntry, "germanName")) {
            assetEntry.germanName = newGermanName;
          }
        }
        registryChanged = true;
      }

      if (Object.hasOwn(assessmentIds, oldSafeName)) {
        assessmentIds[newSafeName] = assessmentIds[oldSafeName];
        if (newSafeName !== oldSafeName) delete assessmentIds[oldSafeName];
        assessmentChanged = true;
      }

      if (report) {
        replaceReportSpeciesName(report, oldGermanName, newGermanName, oldSafeName, newSafeName);
        reportChanged = true;
      }

      if (manualMapText && registryChanged) {
        manualMapTextNext = synchronizeManualMapDocumentation(manualMapText, registry);
      }
    }

    if (scientificNameChanged && taxonomyRegistry.species[oldSlug]) {
      taxonomyRegistry.species[newSlug] = taxonomyRegistry.species[oldSlug];
      if (newSlug !== oldSlug) delete taxonomyRegistry.species[oldSlug];
      taxonomyRegistryChanged = true;
    }

    const metadataUpdates = [];
    if ((germanNameChanged || scientificNameChanged) && existsSync(oldAssetDirectory)) {
      metadataUpdates.push("credits.json", "portrait.json");
    }

    let assetDirectoryMoved = false;
    try {
      if (safeNameChanged && existsSync(oldAssetDirectory)) {
        closeActiveFileStreams((filePath) => isPathInside(oldAssetDirectory, filePath, { allowRoot: true }));
        await rename(oldAssetDirectory, newAssetDirectory);
        assetDirectoryMoved = true;
      }

      await writeJsonAtomic(speciesListPath, inputList);
      if (speciesDataChanged) await writeJsonAtomic(speciesDataPath, speciesData);
      if (registryChanged) await writeJsonAtomic(assetOverridesPath, registry);
      if (taxonomyRegistryChanged) await writeJsonAtomic(taxonomyOverridesPath, taxonomyRegistry);
      if (assessmentChanged) await writeJsonAtomic(assessmentIdsPath, assessmentIds);
      if (reportChanged && report) await writeJsonAtomic(reportPath, report);
      if (manualMapTextNext !== manualMapText) await writeTextAtomic(manualMapOverridesPath, manualMapTextNext);

      const metadataDirectory = safeNameChanged ? newAssetDirectory : oldAssetDirectory;
      for (const fileName of metadataUpdates) {
        const metadataPath = join(metadataDirectory, fileName);
        if (!existsSync(metadataPath)) continue;
        const metadata = updateAssetMetadataNames(
          JSON.parse(await readFile(metadataPath, "utf8")),
          { germanName: newGermanName, scientificName: newScientificName },
        );
        await writeJsonAtomic(metadataPath, metadata);
      }
    } catch (error) {
      if (assetDirectoryMoved && existsSync(newAssetDirectory) && !existsSync(oldAssetDirectory)) {
        await rename(newAssetDirectory, oldAssetDirectory).catch(() => {});
      }
      await writeFile(speciesListPath, sourceText, "utf8").catch(() => {});
      if (speciesDataChanged) await writeFile(speciesDataPath, speciesDataText, "utf8").catch(() => {});
      if (registryChanged) await writeFile(assetOverridesPath, registryText, "utf8").catch(() => {});
      if (taxonomyRegistryChanged) {
        await writeFile(taxonomyOverridesPath, taxonomyRegistryText, "utf8").catch(() => {});
      }
      if (assessmentChanged) await writeFile(assessmentIdsPath, assessmentText, "utf8").catch(() => {});
      if (reportChanged && reportText) await writeFile(reportPath, reportText, "utf8").catch(() => {});
      if (manualMapTextNext !== manualMapText) {
        await writeFile(manualMapOverridesPath, manualMapText, "utf8").catch(() => {});
      }
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
    const refreshedModel = getModel();
    return {
      ok: true,
      backup: `species-explorer/backups/${backupName}`,
      backupRetention,
      backupCleanupWarning,
      changes,
      species: refreshedModel.species.find((entry) => entry.id === newSlug)
        ?? refreshedModel.species.find((entry) => entry.id === id)
        ?? null,
      summary: refreshedModel.summary,
      validation: refreshedModel.validation,
      oldSafeName,
      newSafeName,
      safeNameChanged,
      oldSlug,
      newSlug,
      slugChanged: oldSlug !== newSlug,
      pipelineRequired,
    };
  }

  return { previewSpeciesEdit, saveSpeciesEdit };
}
