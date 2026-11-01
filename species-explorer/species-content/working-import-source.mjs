import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalJson } from "../shared-project/security.mjs";
import { check, ProjectError } from "../shared-project/errors.mjs";
import { validateCatalogSpecies } from "../shared-project/catalog.mjs";
import { validateSpeciesRecord } from "../shared-project/species-record.mjs";
import { buildSpeciesWorkingRecords } from "./working-records.mjs";

const kind = "working-records", version = 1;
const limits = { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 };
const sourceNames = ["speciesList", "speciesData", "catalog", "assetOverrides", "taxonomyOverrides", "assessmentBindings", "bindings"];
const filenames = ["map.jpg", "sound.mp3", "spectrogram.webp", "portrait.webp", "credits.json", "portrait.json"];
const mimeTypes = ["image/jpeg", "audio/mpeg", "image/webp", "image/webp", "application/json", "application/json"];
const HASH = /^[a-f0-9]{64}$/, ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const json = (value) => canonicalJson(value, limits);
const copy = (value) => JSON.parse(json(value));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const proof = (value) => { const text = json(value); return { sha256: sha(text), bytes: Buffer.byteLength(text), encoding: "canonical-json" }; };
const evidenceHash = (evidence) => sha(json({ kind, version, ...evidence }));
const same = (a, b) => json(a) === json(b);
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
function requireEvidence(condition) { check(condition, 400, "invalid_working_evidence", "Der vollständige Arbeitsbestand besitzt keinen gültigen Quellenbeleg."); }
function keys(value, required, optional = []) {
  requireEvidence(record(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => [...required, ...optional].includes(key)));
}
function validateProof(value) {
  keys(value, ["sha256", "bytes", "encoding"]);
  requireEvidence(HASH.test(value.sha256) && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= limits.maxBytes && value.encoding === "canonical-json");
}
function component(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value === value.trim()
    && ![".", ".."].includes(value) && !/[\/\\:*?"<>|\x00-\x1f\x7f]/.test(value) && !/[. ]$/.test(value)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
}
function validateFile(file, index, speciesId, assetName) {
  keys(file, ["filename", "present"], file?.present === true ? ["id", "bytes", "sha256", "mimeType", "url"] : []);
  requireEvidence(file.filename === filenames[index] && typeof file.present === "boolean");
  if (!file.present) return;
  requireEvidence(typeof file.id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(file.id)
    && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= (index >= 4 ? 256 * 1024 : 256 * 1024 * 1024)
    && HASH.test(file.sha256) && file.mimeType === mimeTypes[index]);
  if (file.url !== undefined) {
    requireEvidence([0, 1, 3].includes(index) && typeof file.url === "string");
    validateCatalogSpecies({ id: speciesId, commonName: "", scientificName: "Validation species", taxonomy: [], sections: [],
      media: { sounds: [{ id: file.id, url: file.url, bytes: file.bytes, sha256: file.sha256, mimeType: file.mimeType }], gallery: [] } }, speciesId);
    let parts;
    try { parts = new URL(file.url).pathname.split("/").map(decodeURIComponent); } catch { requireEvidence(false); }
    requireEvidence(parts.at(-2) === assetName && parts.at(-1) === file.filename);
  }
}

/** Pure validation shared by the importer and its personal journal backup. */
export function validateWorkingImportEvidence(input, species, expectedHash) {
  const evidence = copy(input);
  keys(evidence, ["sources", "evidence"]); keys(evidence.sources, [...sourceNames, "assetsRoot"]);
  for (const value of Object.values(evidence.sources)) validateProof(value);
  requireEvidence(Array.isArray(evidence.evidence) && evidence.evidence.length > 0 && evidence.evidence.length <= 10000);
  const ids = new Set(), inputIndices = new Set(), generatedIndices = new Set(), assetNames = new Set();
  for (const item of evidence.evidence) {
    keys(item, ["id", "assetName", "inputIndex", "generatedIndex", "input", "generated", "catalog", "files", "record"]);
    requireEvidence(typeof item.id === "string" && ID.test(item.id) && item.id.length <= 120 && !ids.has(item.id) && component(item.assetName)
      && !assetNames.has(item.assetName.toLocaleLowerCase("de"))
      && Number.isSafeInteger(item.inputIndex) && item.inputIndex >= 0 && item.inputIndex < 10000 && !inputIndices.has(item.inputIndex)
      && Number.isSafeInteger(item.generatedIndex) && item.generatedIndex >= 0 && item.generatedIndex < 10000 && !generatedIndices.has(item.generatedIndex));
    ids.add(item.id); inputIndices.add(item.inputIndex); generatedIndices.add(item.generatedIndex); assetNames.add(item.assetName.toLocaleLowerCase("de"));
    for (const key of ["input", "generated", "catalog", "record"]) validateProof(item[key]);
    requireEvidence(item.record.bytes <= 256 * 1024 && Array.isArray(item.files) && item.files.length === filenames.length);
    item.files.forEach((file, index) => validateFile(file, index, item.id, item.assetName));
  }
  if (species !== undefined) {
    requireEvidence(Array.isArray(species) && species.length === ids.size);
    const checkedIds = new Set();
    for (const value of species) {
      const valueCopy = validateSpeciesRecord(value, value?.id), item = evidence.evidence.find((entry) => entry.id === valueCopy.id);
      requireEvidence(item && !checkedIds.has(valueCopy.id)); checkedIds.add(valueCopy.id);
      requireEvidence(valueCopy.generated?.URLSlug === valueCopy.id && same(proof(valueCopy), item.record) && same(proof(valueCopy.input), item.input) && same(proof(valueCopy.generated), item.generated)
        && valueCopy.assets.assetName === item.assetName);
      for (const file of item.files) {
        const actual = valueCopy.assets.files[file.filename];
        if (!file.present) requireEvidence(actual === undefined);
        else { const { filename, present, ...attributes } = file; requireEvidence(actual && same(attributes, actual)); }
      }
      requireEvidence(Object.keys(valueCopy.assets.files).every((name) => filenames.includes(name)));
    }
  }
  if (expectedHash !== undefined) check(typeof expectedHash === "string" && HASH.test(expectedHash) && evidenceHash(evidence) === expectedHash,
    409, "working_source_changed", "Der Quellenbeleg wurde gegenüber der angezeigten Arbeitsfassung verändert.");
  return evidence;
}

function sourcesProof(source, assetsRoot) {
  return { ...Object.fromEntries(sourceNames.map((name) => [name, proof(source[name])])), assetsRoot: proof(assetsRoot) };
}
function validateSourceShape(source) {
  check(record(source) && sourceNames.every((name) => Object.hasOwn(source, name)) && Object.keys(source).every((name) => sourceNames.includes(name))
    && Array.isArray(source.speciesList) && Array.isArray(source.speciesData) && Array.isArray(source.bindings)
    && record(source.catalog) && Array.isArray(source.catalog.species), 400, "invalid_working_source", "Die ausdrücklich gebundenen Artquellen sind unvollständig.");
  return source;
}
function complete(result) {
  check(result.complete === true && Array.isArray(result.records) && result.records.length > 0 && !result.issues.some((item) => item.blocking),
    409, "working_source_incomplete", "Der vollständige Arbeitsbestand ist noch nicht eindeutig und konsistent vorbereitet.", result.issues);
}

/** Trusted main-process reader and fixed local asset root; the renderer selects neither. */
export function createWorkingImportSource({ readSources, assetsRoot } = {}) {
  check(typeof readSources === "function" && typeof assetsRoot === "string" && path.isAbsolute(assetsRoot) && !/^(?:\\\\|\/\/|file:)/i.test(assetsRoot),
    400, "invalid_working_source_config", "Ein fester lokaler Assetordner und ein gebundener Quellenleser sind erforderlich.");
  const root = path.resolve(assetsRoot);
  async function currentSources() {
    let source;
    try { source = await readSources(); } catch { throw new ProjectError(503, "working_source_unavailable", "Die gebundenen Artquellen sind derzeit nicht lesbar."); }
    return validateSourceShape(copy(source));
  }
  function snapshot(input) {
    const value = copy(input); keys(value, ["species", "sourceSha256", "evidence"]);
    value.evidence = validateWorkingImportEvidence(value.evidence, value.species, value.sourceSha256);
    return value;
  }
  async function requireUnchangedSources(expected) {
    const source = await currentSources();
    check(same(sourcesProof(source, root), expected), 409, "working_source_changed", "Die Artquellen oder ihre Zuordnung wurden seit der Planung verändert. Bitte neu prüfen.");
    return source;
  }
  return Object.freeze({ kind, version,
    async read() {
      const source = await currentSources(), result = await buildSpeciesWorkingRecords({ ...source, assetsRoot: root }); complete(result);
      const evidence = validateWorkingImportEvidence({ sources: result.sources, evidence: result.evidence }, result.records);
      return copy({ species: result.records, sourceSha256: evidenceHash(evidence), evidence });
    },
    async verifySpecies(input, id) {
      const value = snapshot(input), item = value.evidence.evidence.find((entry) => entry.id === id);
      check(item, 409, "working_species_missing", "Diese Art gehört nicht zur angezeigten vollständigen Übernahme.");
      const source = await requireUnchangedSources(value.evidence.sources);
      const selectedCatalog = source.catalog.species.filter((entry) => entry.id === id), selectedBindings = source.bindings.filter((entry) => entry.id === id);
      check(selectedCatalog.length === 1 && selectedBindings.length === 1 && source.speciesList[item.inputIndex]
        && source.speciesData[item.generatedIndex]?.URLSlug === id, 409, "working_species_changed", "Die geprüfte Artzuordnung stimmt nicht mehr überein.");
      const result = await buildSpeciesWorkingRecords({ ...source, speciesList: [source.speciesList[item.inputIndex]], speciesData: [source.speciesData[item.generatedIndex]],
        catalog: { ...source.catalog, species: selectedCatalog }, bindings: selectedBindings, assetsRoot: root });
      check(result.complete === true && result.records.length === 1 && same(proof(result.records[0]), item.record)
        && same(result.evidence[0].files, item.files) && same(result.evidence[0].input, item.input)
        && same(result.evidence[0].generated, item.generated) && same(result.evidence[0].catalog, item.catalog),
      409, "working_species_changed", "Die gebundenen Dateien oder Artinhalte wurden seit der Planung verändert. Bitte neu prüfen.", result.issues);
      await requireUnchangedSources(value.evidence.sources);
      return true;
    },
  });
}
