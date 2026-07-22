import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  EDITABLE_TAXONOMY_FIELDS,
  createEmptyTaxonomyOverrideRegistry,
  normalizeTaxonomyFields,
  validateTaxonomyOverrideRegistry,
} from "../scripts/taxonomy-overrides.mjs";
import { findEditableSpecies } from "./species-model.mjs";

const TAXONOMY_BACKUP_RETENTION_COUNT = 20;

function publicTaxonomyFields(fields) {
  return Object.fromEntries(EDITABLE_TAXONOMY_FIELDS.map((field) => [field.key, fields[field.key] ?? ""]));
}

function validatePayload(payload, { restoreAutomatic = false } = {}) {
  if (restoreAutomatic) return { fields: null, reason: "" };
  const fieldErrors = {};
  const rawFields = payload?.fields && typeof payload.fields === "object" ? payload.fields : {};
  for (const field of EDITABLE_TAXONOMY_FIELDS) {
    const value = String(rawFields[field.key] ?? "").trim();
    if (!field.optional && !value) fieldErrors[field.key] = `${field.label} darf nicht leer sein.`;
    if (value.length > 160) fieldErrors[field.key] = `${field.label} darf maximal 160 Zeichen enthalten.`;
  }
  const reason = String(payload?.reason ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < 3) fieldErrors.reason = "Bitte einen nachvollziehbaren Änderungsgrund angeben.";
  if (reason.length > 500) fieldErrors.reason = "Der Änderungsgrund darf maximal 500 Zeichen enthalten.";
  if (Object.keys(fieldErrors).length) {
    const error = new Error("Taxonomieangaben sind ungültig");
    error.statusCode = 400;
    error.fieldErrors = fieldErrors;
    throw error;
  }
  return { fields: normalizeTaxonomyFields(rawFields), reason };
}

function findGeneratedEntry(speciesData, species) {
  return speciesData.find((entry) => (
    String(entry?.URLSlug ?? "").toLocaleLowerCase("de") === String(species.id).toLocaleLowerCase("de")
  ));
}

function buildChanges(before, after) {
  return EDITABLE_TAXONOMY_FIELDS
    .filter((field) => before[field.key] !== after[field.key])
    .map((field) => ({
      key: field.key,
      label: field.label,
      before: before[field.key] || "Nicht vorhanden",
      after: after[field.key] || "Nicht vorhanden",
    }));
}

async function pruneTaxonomyBackups(backupDir) {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /^taxonomy-\d{8}T\d{6}Z-.+-[0-9a-f]{8}\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, "en"));
  const remove = candidates.slice(TAXONOMY_BACKUP_RETENTION_COUNT);
  await Promise.all(remove.map((name) => unlink(join(backupDir, name))));
  return { kept: Math.min(candidates.length, TAXONOMY_BACKUP_RETENTION_COUNT), removed: remove.length };
}

export function createTaxonomyEditOperations({
  speciesDataPath,
  taxonomyOverridesPath,
  backupDir,
  previewTokens,
  previewTokenTtlMs,
  cleanupPreviewTokens,
  getModel,
  refreshModel,
  hashText,
  compactTimestamp,
  writeJsonAtomic,
}) {
  async function readState(id) {
    const species = findEditableSpecies(getModel(), id);
    if (!species?.inGenerated) {
      const error = new Error("Für diese Art sind noch keine bearbeitbaren Taxonomiedaten vorhanden");
      error.statusCode = 409;
      throw error;
    }
    const [speciesDataText, registryText] = await Promise.all([
      readFile(speciesDataPath, "utf8"),
      readFile(taxonomyOverridesPath, "utf8").catch(() => `${JSON.stringify(createEmptyTaxonomyOverrideRegistry())}\n`),
    ]);
    const speciesData = JSON.parse(speciesDataText);
    const registry = JSON.parse(registryText);
    const registryIssues = validateTaxonomyOverrideRegistry(registry);
    if (registryIssues.length) {
      const error = new Error("Taxonomie-Overrides sind ungültig");
      error.statusCode = 409;
      error.details = registryIssues;
      throw error;
    }
    const generated = findGeneratedEntry(speciesData, species);
    if (!generated) {
      const error = new Error("Taxonomiedatensatz wurde nicht gefunden");
      error.statusCode = 409;
      throw error;
    }
    return { species, speciesDataText, speciesData, registryText, registry, generated };
  }

  async function previewTaxonomyEdit(id, payload) {
    cleanupPreviewTokens();
    const state = await readState(id);
    const restoreAutomatic = payload?.restoreAutomatic === true;
    const validated = validatePayload(payload, { restoreAutomatic });
    const currentFields = normalizeTaxonomyFields(state.generated);
    const override = state.registry.species?.[state.species.id];
    if (restoreAutomatic && !override) {
      const error = new Error("Für diese Art ist keine manuelle Taxonomieänderung gespeichert");
      error.statusCode = 409;
      throw error;
    }
    const nextFields = restoreAutomatic
      ? normalizeTaxonomyFields(override.automaticFields)
      : validated.fields;
    const changes = buildChanges(currentFields, nextFields);
    if (!changes.length && !restoreAutomatic) {
      const error = new Error("Es wurden keine Taxonomieänderungen vorgenommen");
      error.statusCode = 400;
      throw error;
    }
    const token = randomUUID();
    const expiresAt = Date.now() + previewTokenTtlMs;
    previewTokens.set(token, {
      type: "taxonomy-edit",
      id,
      fields: nextFields,
      reason: validated.reason,
      restoreAutomatic,
      speciesDataRevision: hashText(state.speciesDataText),
      registryRevision: hashText(state.registryText),
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      changes,
      restoreAutomatic,
      manuallyEdited: Boolean(override),
      automaticFields: publicTaxonomyFields(override?.automaticFields ?? currentFields),
      warnings: [
        restoreAutomatic
          ? "Die zuletzt von der Pipeline gelieferten Taxonomiewerte werden wiederhergestellt."
          : "Die Änderung bleibt auch nach späteren Pipeline-Läufen bestehen.",
        "Vor dem Speichern wird automatisch eine lokale Sicherung angelegt.",
        "Die Änderung wird erst mit „Änderungen übertragen“ veröffentlicht.",
      ],
    };
  }

  async function saveTaxonomyEdit(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "taxonomy-edit" || preview.id !== id) {
      const error = new Error("Taxonomievorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    const state = await readState(id);
    if (
      hashText(state.speciesDataText) !== preview.speciesDataRevision
      || hashText(state.registryText) !== preview.registryRevision
    ) {
      previewTokens.delete(token);
      const error = new Error("Taxonomiedaten wurden seit der Vorschau geändert. Bitte erneut prüfen.");
      error.statusCode = 409;
      throw error;
    }
    const generatedIndex = state.speciesData.indexOf(state.generated);
    state.speciesData[generatedIndex] = { ...state.generated, ...preview.fields };
    state.registry.version = 1;
    state.registry.species ??= {};
    const previousOverride = state.registry.species[state.species.id] ?? null;
    if (preview.restoreAutomatic) {
      delete state.registry.species[state.species.id];
    } else {
      state.registry.species[state.species.id] = {
        fields: preview.fields,
        automaticFields: normalizeTaxonomyFields(previousOverride?.automaticFields ?? state.generated),
        reason: preview.reason,
        updatedAt: new Date().toISOString(),
      };
    }

    await mkdir(backupDir, { recursive: true });
    const backupName = `taxonomy-${compactTimestamp()}-${state.species.safeName}-${randomUUID().slice(0, 8)}.json`;
    const backupPath = join(backupDir, backupName);
    await writeFile(backupPath, `${JSON.stringify({
      version: 1,
      species: {
        id: state.species.id,
        germanName: state.species.germanName,
        scientificName: state.species.scientificName,
      },
      generatedTaxonomy: normalizeTaxonomyFields(state.generated),
      override: previousOverride,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`, "utf8");

    try {
      await writeJsonAtomic(speciesDataPath, state.speciesData);
      await writeJsonAtomic(taxonomyOverridesPath, state.registry);
    } catch (error) {
      await writeFile(speciesDataPath, state.speciesDataText, "utf8").catch(() => {});
      await writeFile(taxonomyOverridesPath, state.registryText, "utf8").catch(() => {});
      throw error;
    }
    previewTokens.delete(token);
    await refreshModel({ force: true });
    const backupRetention = await pruneTaxonomyBackups(backupDir).catch(() => ({ kept: 0, removed: 0 }));
    return {
      ok: true,
      restoredAutomatic: preview.restoreAutomatic,
      backup: `species-explorer/backups/${backupName}`,
      backupRetention,
      species: getModel().species.find((entry) => entry.id === id) ?? null,
    };
  }

  return { previewTaxonomyEdit, saveTaxonomyEdit };
}
