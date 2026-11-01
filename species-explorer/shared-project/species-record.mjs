import { check } from "./errors.mjs";
import { canonicalJson } from "./security.mjs";
import { validateCatalogSpecies } from "./catalog.mjs";

export const SPECIES_RECORD_TYPE = "fn-species-record";
export function sharedSpeciesScientificIdentity(value) {
  const name = value?.type === SPECIES_RECORD_TYPE ? `${value.input?.genus || ""} ${value.input?.species || ""}` : value?.scientificName;
  return typeof name === "string" ? name.trim().replace(/\s+/gu, " ").toLocaleLowerCase("de") : "";
}
const manualKeys = ["german", "english", "genus", "species", "size", "weight", "life_expectancy"];
const limits = { german: 160, english: 160, genus: 100, species: 100, size: 240, weight: 240, life_expectancy: 240 };
const generalFields = ["Wissenschaftlicher Name", "Deutscher Name", "Englischer Name", "Größe", "Gewicht", "Lebenserwartung",
  "Kategorie", "Status", "Trend", "Populationgröße", "Generationsdauer", "Assessment ID", "Letztes IUCN Update", "Daten abgerufen"];
const ranks = ["Kingdom", "Phylum", "Subphylum", "Class", "Order", "Family", "Genus", "Species"];
const present = (value) => value !== undefined && value !== null && String(value).trim() !== "";
const clone = (value) => JSON.parse(canonicalJson(value));
function record(value) { return value && typeof value === "object" && !Array.isArray(value); }
function fields(value, keys) {
  check(record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    400, "invalid_species_record", "Der gemeinsame Artdatensatz hat eine unbekannte oder unvollständige Struktur.");
}
function text(value, max, allowEmpty = true) {
  check(typeof value === "string" && value.length <= max && (allowEmpty || value.trim()) && !/[\x00-\x1f\x7f]/.test(value),
    400, "invalid_species_record", "Ein Artgrunddatenfeld ist ungültig.");
}
function safeComponent(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value === value.trim()
    && ![".", ".."].includes(value) && !/[\/\\:*?"<>|\x00-\x1f\x7f]/.test(value) && !/[. ]$/.test(value);
}
function generatedGeneral(generated) {
  return generalFields.filter((key) => present(generated?.[key])).map((key) => `${key}: ${generated[key]}`).join("\n");
}
function publicShape(value, sections = value.editorial.sections) {
  const input = value.input, generated = value.generated || {};
  const taxonomy = ranks.flatMap((rank) => {
    const name = rank === "Genus" ? input.genus : rank === "Species" ? `${input.genus} ${input.species}` : generated[rank];
    return present(name) ? [{ rank: rank.toLowerCase(), name: String(name) }] : [];
  });
  return { id: value.id, commonName: input.german, scientificName: `${input.genus} ${input.species}`, taxonomy, sections,
    ...(value.editorial.websiteUrl ? { websiteUrl: value.editorial.websiteUrl } : {}), media: { sounds: [], gallery: value.editorial.gallery } };
}

/** Bounded, lossless private working object. Validation never reads files or materializes assets. */
export function validateSpeciesRecord(value, expectedId) {
  const result = clone(value);
  fields(result, ["type", "schemaVersion", "id", "input", "generated", "taxonomyOverride", "assessmentBinding", "assets", "editorial"]);
  check(result.type === SPECIES_RECORD_TYPE && result.schemaVersion === 1 && typeof result.id === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.id) && result.id.length <= 120 && (!expectedId || result.id === expectedId),
  400, "invalid_species_record", "Artkennung oder Version des gemeinsamen Datensatzes ist ungültig.");
  check(record(result.input), 400, "invalid_species_record", "Die vollständige manuelle Artzeile fehlt.");
  for (const key of manualKeys) {
    if (!Object.hasOwn(result.input, key)) {
      check(!["german", "genus", "species"].includes(key), 400, "invalid_species_record", "Die Artidentität ist unvollständig.");
      continue;
    }
    const value = result.input[key];
    check(typeof value === "string" || ["size", "weight", "life_expectancy"].includes(key) && typeof value === "number" && Number.isFinite(value),
      400, "invalid_species_record", "Ein vorhandenes manuelles Artfeld hat einen ungültigen Wert.");
    text(String(value), limits[key], !["german", "genus", "species"].includes(key));
  }
  check([result.input.genus, result.input.species].every((part) => /^[\p{L}][\p{L}-]*$/u.test(part)),
    400, "invalid_species_record", "Die wissenschaftliche Artidentität ist ungültig.");
  for (const key of ["generated", "taxonomyOverride"]) check(result[key] === null || record(result[key]),
    400, "invalid_species_record", "Gebundene Artquellen müssen vollständig erhalten bleiben.");
  fields(result.assets, ["assetName", "files", "overrides", "credits", "portraitMetadata"]);
  check(safeComponent(result.assets.assetName)
    && record(result.assets.files) && record(result.assets.overrides), 400, "invalid_species_record", "Die stabile Assetbindung ist ungültig.");
  for (const key of ["credits", "portraitMetadata"]) check(result.assets[key] === null || record(result.assets[key]),
    400, "invalid_species_record", "Vorhandene Assetmetadaten müssen vollständig erhalten bleiben.");
  for (const [name, asset] of Object.entries(result.assets.files)) {
    check(safeComponent(name) && record(asset)
      && Object.keys(asset).every((key) => ["id", "bytes", "sha256", "mimeType", "url"].includes(key)),
    400, "invalid_species_record", "Ein verwalteter Assetverweis ist ungültig.");
    text(asset.id, 160, false);
    check(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(asset.id) && Number.isSafeInteger(asset.bytes) && asset.bytes >= 0 && /^[a-f0-9]{64}$/.test(asset.sha256)
      && typeof asset.mimeType === "string" && /^(?:image|audio|application)\/[a-zA-Z0-9.+-]{1,80}$/.test(asset.mimeType),
    400, "invalid_species_record", "Assetgröße, Hash oder Medientyp sind ungültig.");
    const expectedMime = { "portrait.webp": "image/webp", "map.jpg": "image/jpeg", "sound.mp3": "audio/mpeg", "spectrogram.webp": "image/webp" }[name];
    check(!expectedMime || asset.mimeType === expectedMime, 400, "invalid_species_record", "Der gebundene Medientyp passt nicht zum vorhandenen normalen Asset.");
    if (asset.url !== undefined) validateCatalogSpecies({ id: result.id, scientificName: "Validation species", commonName: "", taxonomy: [], sections: [],
      media: { sounds: [{ id: asset.id, url: asset.url }], gallery: [] } }, result.id);
  }
  fields(result.editorial, ["websiteUrl", "sections", "gallery", "generalSectionId", "embeddedGeneralText"]);
  check(result.editorial.websiteUrl === null || typeof result.editorial.websiteUrl === "string", 400, "invalid_species_record", "Die öffentliche Seitenbindung ist ungültig.");
  validateCatalogSpecies(publicShape(result), result.id);
  const generalId = result.editorial.generalSectionId;
  check(generalId === null || typeof generalId === "string" && result.editorial.sections.some((section) => section.id === generalId),
    400, "invalid_species_record", "Der Abschnitt für erzeugte Allgemeinwerte ist nicht gebunden.");
  const embedded = result.editorial.embeddedGeneralText;
  const oldGeneral = generatedGeneral(result.generated);
  if (oldGeneral) for (const section of result.editorial.sections) {
    check(!(section.text === oldGeneral || section.text.endsWith(`\n\n${oldGeneral}`))
      || section.id === generalId && embedded === oldGeneral, 400, "general_binding_required",
    "Ein vorhandener erzeugter Allgemeinblock benötigt eine ausdrückliche exakte Quellenbindung; er wird nicht doppelt ergänzt oder erraten.");
  }
  if (embedded !== null) {
    const section = result.editorial.sections.find((entry) => entry.id === generalId);
    check(typeof embedded === "string" && embedded.length > 0 && embedded === oldGeneral && section
      && (section.text === embedded || section.text.endsWith(`\n\n${embedded}`)),
    400, "invalid_general_binding", "Der frühere erzeugte Allgemeinblock ist nicht exakt an seine Quelle gebunden.");
  }
  return result;
}

export function validateSharedSpecies(value, expectedId) {
  return value?.type === SPECIES_RECORD_TYPE ? validateSpeciesRecord(value, expectedId) : validateCatalogSpecies(value, expectedId);
}

/** Guard is applied inside the actual server transaction, including conflict resolution. */
export function guardSpeciesRecordTransition({ objectId, before, next }) {
  if (!before) { validateSharedSpecies(next, objectId); return true; }
  const typedBefore = before.type === SPECIES_RECORD_TYPE, typedNext = next?.type === SPECIES_RECORD_TYPE;
  check(typedBefore === typedNext, 409, "species_record_adoption_required", "Ein Wechsel der Art-Datenform benötigt eine eigene kontrollierte Übernahme.");
  if (!typedBefore) return true;
  const previous = validateSpeciesRecord(before, objectId), proposed = validateSpeciesRecord(next, objectId);
  for (const key of manualKeys) {
    check(!Object.hasOwn(previous.input, key) || Object.hasOwn(proposed.input, key), 409, "species_record_protected", "Vorhandene manuelle Felder dürfen nicht entfernt werden.");
    if (canonicalJson(previous.input[key] ?? null) !== canonicalJson(proposed.input[key] ?? null) && Object.hasOwn(proposed.input, key)) {
      text(proposed.input[key], limits[key], false);
      check(proposed.input[key] === proposed.input[key].trim(), 400, "invalid_species_record", "Geänderte Artfelder müssen normalisiert sein.");
    }
    delete previous.input[key]; delete proposed.input[key];
  }
  check(canonicalJson(previous) === canonicalJson(proposed), 409, "species_record_protected",
    "Dieser Auftrag darf nur manuelle Grunddaten ändern. Originalquellen, Assetbindungen und Schutzinformationen bleiben erhalten.");
  return true;
}

export function normalizeSpeciesManualValues(values) {
  const normalized = {};
  for (const [key, limit] of Object.entries({ germanName: 160, englishName: 160, size: 240, weight: 240, lifeExpectancy: 240 })) {
    normalized[key] = String(values?.[key] ?? "").trim(); text(normalized[key], limit, false);
  }
  const scientific = String(values?.scientificName ?? "").trim(), parts = scientific.split(/\s+/).filter(Boolean);
  check(scientific.length <= 201 && !/[\x00-\x1f\x7f]/.test(scientific) && parts.length === 2
    && parts.every((part) => part.length <= 100 && /^[\p{L}][\p{L}-]*$/u.test(part)),
    400, "invalid_species_record", "Der wissenschaftliche Name muss aus Gattung und Art-Epitheton bestehen.");
  normalized.genus = parts[0].charAt(0).toLocaleUpperCase("de") + parts[0].slice(1).toLocaleLowerCase("de");
  normalized.species = parts[1].toLocaleLowerCase("de");
  normalized.scientificName = `${normalized.genus} ${normalized.species}`;
  return normalized;
}

export function applySpeciesManualEdit(value, values) {
  const result = validateSpeciesRecord(value, value?.id), normalized = normalizeSpeciesManualValues(values);
  Object.assign(result.input, { german: normalized.germanName, english: normalized.englishName, genus: normalized.genus, species: normalized.species,
    size: normalized.size, weight: normalized.weight, life_expectancy: normalized.lifeExpectancy });
  guardSpeciesRecordTransition({ objectId: result.id, before: value, next: result });
  return result;
}

function selectedAttribution(metadata, keys) {
  return keys.filter((key) => typeof metadata?.[key] === "string" && metadata[key].trim()).map((key) => `${key}: ${metadata[key]}`).join("\n");
}

/** Approved object -> public mobile schema 1 only; never forwards private original registers or prompts. */
export function projectSpeciesRecordToCatalog(value) {
  if (value?.type !== SPECIES_RECORD_TYPE) return validateCatalogSpecies(value, value?.id);
  const source = validateSpeciesRecord(value, value.id), generated = { ...(source.generated || {}) }, input = source.input;
  const manual = { "Wissenschaftlicher Name": `${input.genus} ${input.species}`, "Deutscher Name": input.german };
  for (const [key, label] of Object.entries({ english: "Englischer Name", size: "Größe", weight: "Gewicht", life_expectancy: "Lebenserwartung" })) {
    if (Object.hasOwn(input, key)) manual[label] = input[key];
  }
  Object.assign(generated, manual);
  const general = generatedGeneral(generated), editorial = source.editorial;
  const sections = editorial.sections.map((section) => {
    if (section.id !== editorial.generalSectionId) return section;
    let text = section.text;
    if (editorial.embeddedGeneralText !== null) text = text === editorial.embeddedGeneralText ? "" : text.slice(0, -editorial.embeddedGeneralText.length - 2);
    text = [text, general].filter(Boolean).join("\n\n");
    return { ...section, text, intentionallyEmpty: text ? false : section.intentionallyEmpty };
  });
  if (editorial.generalSectionId === null) {
    let id = "structured-general";
    while (sections.some((section) => section.id === id)) id += "-values";
    sections.unshift({ id, title: "Allgemein", text: general, intentionallyEmpty: false });
  }
  const result = publicShape(source, sections);
  for (const [filename, key, metadata, selected] of [
    ["portrait.webp", "portrait", source.assets.portraitMetadata, ["type", "source", "generation_method"]],
    ["map.jpg", "map", null, []],
    ["sound.mp3", "sound", source.assets.credits, ["recordist", "license", "source", "url"]],
  ]) {
    const file = source.assets.files[filename];
    if (!file?.url) continue;
    const mapSource = source.assets.overrides.map?.source ?? source.assets.overrides.map?.provenance?.source;
    const attribution = key === "map" ? typeof mapSource === "string" && mapSource.trim() ? `Quelle: ${mapSource}` : ""
      : selectedAttribution(metadata, selected);
    const entry = { ...file, ...(attribution ? { attribution } : {}) };
    if (key === "sound") result.media.sounds.push(entry); else result.media[key] = entry;
  }
  return validateCatalogSpecies(result, source.id);
}
