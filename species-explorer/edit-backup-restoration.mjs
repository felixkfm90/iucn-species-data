import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { EDITABLE_TAXONOMY_FIELDS, validateTaxonomyOverrideRegistry } from "../scripts/taxonomy-overrides.mjs";
import { findEditableSpecies, scientificKey, validateEditableValues } from "./species-model.mjs";

// These are small JSON edit states, never the database/NAS restoration path.
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_LIST_BYTES = 16 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 2048;
const MAX_BACKUPS = 64;
const SPECIES_PATTERN = /^species_list-(\d{8}T\d{6}Z)-[^\\/]+-[0-9a-f]{8}\.json$/;
const TAXONOMY_PATTERN = /^taxonomy-(\d{8}T\d{6}Z)-[^\\/]+-[0-9a-f]{8}\.json$/;
const LEGACY_TAXONOMY_PATTERN = /^speciesData-taxonomy-(\d{8}T\d{6}Z)\.json$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function problem(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function identifyBackup(backupId) {
  if (typeof backupId !== "string" || backupId.length > 240 || /[\\/:\x00-\x1f]/.test(backupId)) return null;
  const species = SPECIES_PATTERN.exec(backupId);
  const taxonomy = TAXONOMY_PATTERN.exec(backupId);
  const legacy = LEGACY_TAXONOMY_PATTERN.exec(backupId);
  const match = species ?? taxonomy ?? legacy;
  if (!match) return null;
  const stamp = match[1];
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}.000Z`;
  const validDate = Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString() === iso;
  return { backupId, kind: species ? "species" : "taxonomy", createdAt: validDate ? iso : null, legacy: Boolean(legacy) };
}

async function assertUnlinkedPath(repoRoot, filename) {
  const root = resolve(repoRoot);
  const target = resolve(filename);
  const inside = relative(root, target);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw problem("Der Sicherungspfad liegt außerhalb des Programmordners.");
  }
  let current = root;
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw problem("Verknüpfte Programmordner werden nicht als Bearbeitungsstand gelesen.");
  const parts = inside.split(sep);
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw problem("Verknüpfte Dateien oder Ordner werden nicht als Bearbeitungsstand gelesen.");
    if (index < parts.length - 1 && !stat.isDirectory()) throw problem("Ein Elternpfad des Bearbeitungsstands ist kein Ordner.");
  }
}

async function readSmallJson(repoRoot, filename, { allowMissing = false, budget = null } = {}) {
  let handle;
  try {
    await assertUnlinkedPath(repoRoot, filename);
    handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat();
    if (!before.isFile()) throw problem("Der Bearbeitungsstand ist keine reguläre JSON-Datei.");
    if (before.size > MAX_JSON_BYTES) throw problem("Der Bearbeitungsstand überschreitet die Grenze von 2 MiB.");
    if (budget) {
      if (before.size + 1 > budget.remaining) throw problem("Die Lesegrenze für diese Auswahl ist erreicht. Dieser Stand wird nicht geöffnet.");
      budget.remaining -= before.size + 1;
    }
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const result = await handle.read(buffer, count, buffer.length - count, count);
      if (!result.bytesRead) break;
      count += result.bytesRead;
    }
    const after = await handle.stat();
    await assertUnlinkedPath(repoRoot, filename);
    const pathStat = await lstat(filename);
    if (count !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || before.ino !== pathStat.ino || before.dev !== pathStat.dev || after.size !== pathStat.size || after.mtimeMs !== pathStat.mtimeMs) {
      throw problem("Der Bearbeitungsstand wurde während des Lesens geändert. Bitte erneut prüfen.");
    }
    const bytes = buffer.subarray(0, count);
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw problem("Der Bearbeitungsstand enthält kein gültiges UTF-8-JSON."); }
    return { value, bytes: count, sha256: digest(bytes) };
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return { value: null, bytes: 0, sha256: null };
    if (error.statusCode) throw error;
    throw problem(error.code === "ENOENT" ? "Der Bearbeitungsstand ist nicht mehr vorhanden." : "Der Bearbeitungsstand kann nicht sicher gelesen werden.");
  } finally {
    await handle?.close();
  }
}

function publicSpecies(species) {
  return { id: species.id, germanName: species.germanName, scientificName: species.scientificName };
}

function sameIdentity(left, right) {
  return left?.id === right.id && left?.germanName === right.germanName && left?.scientificName === right.scientificName;
}

function findInput(list, species) {
  if (!Array.isArray(list) || !list.every(isObject)) throw problem("Die Artenliste ist kein gültiger Bearbeitungsstand.");
  const key = scientificKey(species.taxonomy.genus, species.taxonomy.species);
  const matches = list.filter((row) => scientificKey(row.genus, row.species) === key);
  if (matches.length !== 1) throw problem("Die Art fehlt im Bearbeitungsstand oder ist dort nicht eindeutig.");
  const row = matches[0];
  if (row.german !== species.germanName || `${row.genus} ${row.species}` !== species.scientificName) {
    throw problem("Die damalige Artidentität oder der Name weicht von der heutigen Art ab. Namen werden nicht automatisch zurückgesetzt.");
  }
  return row;
}

function validateFields(fields) {
  if (!isObject(fields) || EDITABLE_TAXONOMY_FIELDS.some((field) => typeof fields[field.key] !== "string"
    || (!field.optional && !fields[field.key].trim()) || fields[field.key].length > 160 || /[\x00-\x1f]/.test(fields[field.key]))) {
    throw problem("Die gespeicherten Taxonomieangaben sind ungültig.");
  }
}

export function createEditBackupRestorationOperations({
  repoRoot, backupDir, speciesListPath, speciesDataPath, taxonomyOverridesPath, getModel,
  previewTokens, previewTokenTtlMs, cleanupPreviewTokens,
  previewSpeciesEdit, saveSpeciesEdit, previewTaxonomyEdit, saveTaxonomyEdit,
  now = Date.now,
}) {
  let saveActive = false;

  async function readCurrent(id) {
    const species = findEditableSpecies(getModel(), id);
    if (!species) throw problem("Art wurde nicht gefunden.", 404);
    const input = await readSmallJson(repoRoot, speciesListPath);
    const generated = await readSmallJson(repoRoot, speciesDataPath, { allowMissing: !species.inGenerated });
    const registry = await readSmallJson(repoRoot, taxonomyOverridesPath, { allowMissing: true });
    findInput(input.value, species);
    if (registry.value !== null && validateTaxonomyOverrideRegistry(registry.value).length) throw problem("Die heutigen Taxonomie-Overrides sind ungültig.");
    if (species.inGenerated) {
      if (!Array.isArray(generated.value)) throw problem("Die heutigen Taxonomiedaten sind ungültig.");
      const rows = generated.value.filter((row) => row?.URLSlug === id);
      if (rows.length !== 1 || rows[0]["Deutscher Name"] !== species.germanName || rows[0]["Wissenschaftlicher Name"] !== species.scientificName) {
        throw problem("Die heutige Taxonomie und Artenliste haben keine eindeutige gemeinsame Artidentität.");
      }
    }
    return { species, input, generated, registry };
  }

  function descriptor(identity, bytes = 0, unavailableReason = null) {
    const type = identity.kind === "species" ? "Artenliste (Gesamtstand)" : "Taxonomie dieser Art";
    return { backupId: identity.backupId, kind: identity.kind, createdAt: identity.createdAt, bytes,
      label: `${type} · ${identity.createdAt ?? "Datum ungültig"}`, available: unavailableReason === null, unavailableReason };
  }

  function assess(identity, snapshot, current) {
    if (!identity.createdAt) throw problem("Das Datum des Bearbeitungsstands ist ungültig.");
    if (identity.legacy) throw problem("Dieser ältere vollständige Taxonomiestand enthält keinen verlässlichen Nachweis der manuellen Overrides. Er kann hier nicht sicher wiederhergestellt werden.");
    if (identity.kind === "species") {
      const row = findInput(snapshot.value, current.species);
      const currentRow = findInput(current.input.value, current.species);
      const values = { germanName: currentRow.german, scientificName: `${currentRow.genus} ${currentRow.species}`,
        englishName: row.english, size: row.size, weight: row.weight, lifeExpectancy: row.life_expectancy };
      if (["english", "size", "weight", "life_expectancy"].some((key) => typeof row[key] !== "string")) throw problem("Der Artenlistenstand enthält keine vollständigen bearbeitbaren Angaben.");
      const validated = validateEditableValues(values, current.species);
      if (validated.errors.length) throw problem("Die gespeicherten Artenangaben sind ungültig.");
      return { payload: { values }, warnings: ["Es werden nur englischer Name, Größe, Gewicht und Lebenserwartung dieser Art übernommen. Deutscher und wissenschaftlicher Name, Artidentität, andere Arten und Medien bleiben erhalten."] };
    }
    if (!current.species.inGenerated) throw problem("Für diese Art gibt es noch keine heutige Taxonomie.");
    const value = snapshot.value;
    if (!isObject(value) || value.version !== 1 || !sameIdentity(value.species, publicSpecies(current.species))
      || !Object.hasOwn(value, "override") || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
      throw problem("Dieser Taxonomiestand hat kein gültiges Format oder eine abweichende Artidentität.");
    }
    validateFields(value.generatedTaxonomy);
    if (value.override === null) {
      if (!current.registry.value?.species?.[current.species.id]) throw problem("Die aktuelle Taxonomie ist bereits automatisch; es gibt keinen manuellen Override zurückzunehmen.");
      return { payload: { restoreAutomatic: true }, warnings: ["Der gewählte Stand war ohne manuellen Override. Wiederhergestellt wird die heutige automatische Vergleichsbasis; damalige automatische Werte werden nicht zurückgespielt."] };
    }
    const issues = validateTaxonomyOverrideRegistry({ version: 1, species: { [current.species.id]: value.override } });
    if (issues.length) throw problem("Der gespeicherte Taxonomie-Override ist ungültig.");
    validateFields(value.override.fields);
    validateFields(value.override.automaticFields);
    const provenance = `Wiederherstellung vom ${identity.createdAt}: `;
    const reason = `${provenance}${value.override.reason.trim().replace(/\s+/g, " ")}`.slice(0, 500);
    return { payload: { fields: value.override.fields, reason }, warnings: ["Die damaligen manuellen Taxonomiewerte werden für diese Art übernommen. Die heutige automatische Vergleichsbasis bleibt erhalten."] };
  }

  async function listEditBackups(id) {
    const current = await readCurrent(id);
    try { await assertUnlinkedPath(repoRoot, backupDir); } catch (error) {
      if (error.code === "ENOENT") return { species: publicSpecies(current.species), backups: [] };
      throw error;
    }
    const identities = [];
    let entries = 0;
    const directory = await opendir(backupDir);
    for await (const entry of directory) {
      entries += 1;
      if (entries > MAX_DIRECTORY_ENTRIES) throw problem("Der Sicherungsordner enthält zu viele Dateien für diese begrenzte Auswahl.");
      const identity = identifyBackup(entry.name);
      if (identity) identities.push(identity);
      if (identities.length > MAX_BACKUPS) throw problem("Es sind zu viele Bearbeitungsstände für diese begrenzte Auswahl vorhanden.");
    }
    identities.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.backupId.localeCompare(a.backupId));
    const budget = { remaining: MAX_LIST_BYTES };
    const backups = [];
    for (const identity of identities) {
      let snapshot;
      let bytes = 0;
      try {
        const stat = await lstat(join(backupDir, identity.backupId));
        bytes = stat.isFile() ? stat.size : 0;
        snapshot = await readSmallJson(repoRoot, join(backupDir, identity.backupId), { budget });
        const owner = snapshot.value?.species;
        if (identity.kind === "taxonomy" && !identity.legacy && snapshot.value?.version === 1 && isObject(owner)
          && /^[a-z0-9]+$/i.test(owner.id ?? "") && owner.id !== current.species.id && typeof owner.germanName === "string"
          && typeof owner.scientificName === "string" && owner.scientificName.replace(/\s+/g, "").toLowerCase() === owner.id.toLowerCase()) {
          continue;
        }
        assess(identity, snapshot, current);
        backups.push(descriptor(identity, snapshot.bytes));
      } catch (error) {
        backups.push(descriptor(identity, snapshot?.bytes ?? bytes, error.message));
      }
    }
    return { species: publicSpecies(current.species), backups };
  }

  async function verifyBinding(binding) {
    const current = await readCurrent(binding.id);
    if (!sameIdentity(publicSpecies(current.species), binding.species) || current.input.sha256 !== binding.inputRevision
      || current.generated.sha256 !== binding.generatedRevision || current.registry.sha256 !== binding.registryRevision) {
      throw problem("Die heutigen Daten wurden seit der Vorschau geändert. Bitte den Bearbeitungsstand erneut prüfen.");
    }
    const snapshot = await readSmallJson(repoRoot, join(backupDir, binding.backupId));
    if (snapshot.sha256 !== binding.backupRevision) throw problem("Der ausgewählte Bearbeitungsstand wurde seit der Vorschau geändert. Bitte erneut prüfen.");
  }

  async function previewEditBackupRestoration(id, payload) {
    cleanupPreviewTokens();
    const identity = identifyBackup(payload?.backupId);
    if (!identity || !["species", "taxonomy"].includes(payload?.kind) || identity.kind !== payload.kind) throw problem("Der ausgewählte Bearbeitungsstand ist ungültig.", 400);
    const current = await readCurrent(id);
    const snapshot = await readSmallJson(repoRoot, join(backupDir, identity.backupId));
    const assessed = assess(identity, snapshot, current);
    const inner = identity.kind === "species"
      ? await previewSpeciesEdit(id, assessed.payload) : await previewTaxonomyEdit(id, assessed.payload, { includeOverrideChanges: true });
    try {
      const binding = { id, species: publicSpecies(current.species), backupId: identity.backupId, backupRevision: snapshot.sha256,
        inputRevision: current.input.sha256, generatedRevision: current.generated.sha256, registryRevision: current.registry.sha256 };
      await verifyBinding(binding);
      const innerRecord = previewTokens.get(inner.token);
      const expectedType = identity.kind === "species" ? "edit" : "taxonomy-edit";
      if (!innerRecord || innerRecord.type !== expectedType || innerRecord.id !== id) throw problem("Die Bearbeitungsvorschau ist nicht mehr gültig.");
      // This internal hook is checked by the established save operation immediately
      // before its first data write, outside rollback of already-written data.
      innerRecord.beforeWriteGuard = () => verifyBinding(binding);
      const token = randomUUID();
      const expiresAt = Math.min(now() + previewTokenTtlMs, innerRecord.expiresAt);
      previewTokens.set(token, { type: "edit-backup-restoration", id, kind: identity.kind, innerToken: inner.token, binding, expiresAt, saving: false });
      return { token, expiresAt: new Date(expiresAt).toISOString(), species: binding.species,
        changes: inner.changes.map((change) => ({ key: change.key, label: change.label ?? change.field, before: change.before, after: change.after })),
        warnings: [...assessed.warnings, ...inner.warnings], backup: descriptor(identity, snapshot.bytes) };
    } catch (error) {
      previewTokens.delete(inner.token);
      throw error;
    }
  }

  async function saveEditBackupRestoration(id, payload) {
    cleanupPreviewTokens();
    const token = typeof payload?.token === "string" ? payload.token : "";
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "edit-backup-restoration" || preview.id !== id || preview.expiresAt <= now()) {
      if (preview?.type === "edit-backup-restoration" && preview.id === id) {
        previewTokens.delete(preview.innerToken); previewTokens.delete(token);
      }
      throw problem("Die Wiederherstellungsvorschau ist ungültig oder abgelaufen. Bitte erneut prüfen.");
    }
    if (saveActive || preview.saving) throw problem("Eine Wiederherstellung wird bereits gespeichert. Bitte deren Abschluss abwarten.");
    saveActive = true;
    preview.saving = true;
    try {
      await verifyBinding(preview.binding);
      return await (preview.kind === "species" ? saveSpeciesEdit : saveTaxonomyEdit)(id, { token: preview.innerToken });
    } finally {
      previewTokens.delete(preview.innerToken);
      previewTokens.delete(token);
      saveActive = false;
    }
  }

  return { listEditBackups, previewEditBackupRestoration, saveEditBackupRestoration };
}
