import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { scientificKey } from "../species-model.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";
import { canonicalJson } from "../shared-project/security.mjs";
import { SPECIES_RECORD_TYPE, validateSpeciesRecord } from "../shared-project/species-record.mjs";

const assetFiles = [
  ["map.jpg", "image/jpeg", "map"], ["sound.mp3", "audio/mpeg", "sound"],
  ["spectrogram.webp", "image/webp", null], ["portrait.webp", "image/webp", "portrait"],
  ["credits.json", "application/json", null], ["portrait.json", "application/json", null],
];
const jsonLimits = { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => canonicalJson(value, jsonLimits);
const clone = (value) => JSON.parse(json(value));
const sourceProof = (value) => { const text = json(value); return { sha256: hash(text), bytes: Buffer.byteLength(text), encoding: "canonical-json" }; };
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const own = (value, key, fallback) => Object.hasOwn(value, key) ? value[key] : fallback;
const problem = (code) => Object.assign(new Error(code), { code });
const sameFile = (a, b) => ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every((key) => a[key] === b[key]);
const identity = (a, b) => a.dev === b.dev && a.ino === b.ino;

function safeName(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value === value.trim()
    && ![".", ".."].includes(value) && !/[\/\\:*?"<>|\x00-\x1f\x7f]/.test(value) && !/[. ]$/.test(value)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
}
function group(values, key) {
  const result = new Map();
  for (const [index, value] of values.entries()) {
    const id = key(value), entries = result.get(id) || [];
    entries.push({ index, value }); result.set(id, entries);
  }
  return result;
}
async function directoryChain(directory) {
  let current = path.parse(directory).root;
  const entries = [];
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw problem("unsafe-asset-directory");
    entries.push({ filename: current, stat });
  }
  return entries;
}
async function stableFile(filename, metadata) {
  let before;
  try { before = await fs.lstat(filename, { bigint: true }); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!before.isFile() || before.isSymbolicLink()) throw problem("unsafe-asset-file");
  if (before.size > BigInt(metadata ? 256 * 1024 : 256 * 1024 * 1024)) throw problem("asset-file-too-large");
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!sameFile(before, await handle.stat({ bigint: true }))) throw problem("asset-changed-during-read");
    const hasher = createHash("sha256"), buffer = Buffer.alloc(65536), parts = [];
    let total = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > Number(before.size)) throw problem("asset-changed-during-read");
      hasher.update(buffer.subarray(0, bytesRead));
      if (metadata) parts.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    const after = await fs.lstat(filename, { bigint: true });
    if (!after.isFile() || after.isSymbolicLink() || total !== Number(before.size) || !sameFile(before, after)
      || !sameFile(before, await handle.stat({ bigint: true }))) throw problem("asset-changed-during-read");
    return { bytes: total, sha256: hasher.digest("hex"), stat: after, ...(metadata ? { content: Buffer.concat(parts) } : {}) };
  } finally { await handle.close(); }
}
async function unchangedAssets(directory, chain, observed) {
  for (const entry of chain) {
    const stat = await fs.lstat(entry.filename, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || !identity(entry.stat, stat)) throw problem("asset-directory-changed");
  }
  for (const [name, file] of observed) {
    let stat;
    try { stat = await fs.lstat(path.join(directory, name), { bigint: true }); }
    catch (error) { if (error.code !== "ENOENT" || file) throw problem("asset-set-changed"); }
    if (file ? !stat?.isFile() || stat.isSymbolicLink() || !sameFile(file.stat, stat) : Boolean(stat)) throw problem("asset-set-changed");
  }
}
function matchingPublicPath(url, assetName, filename) {
  try {
    const parts = new URL(url).pathname.split("/").map(decodeURIComponent);
    return parts.at(-1) === filename && parts.at(-2) === assetName;
  } catch { return false; }
}
function candidateMedia(catalog, slot, filename, issues, id) {
  const values = slot === "sound" ? catalog.media.sounds : slot && catalog.media[slot] ? [catalog.media[slot]] : [];
  if (values.length <= 1) return values[0] || null;
  // The normal working format has one local recording. Selecting one of several
  // public recordings would silently lose the others instead of preserving them.
  issues.push({ code: "ambiguous-catalog-medium", blocking: true, id, filename });
  return null;
}
async function readAssets({ assetsRoot, binding, catalog, issues }) {
  const directory = path.join(assetsRoot, binding.assetName), chain = await directoryChain(directory), observed = new Map(), files = {}, metadata = {};
  for (const [filename, mimeType, slot] of assetFiles) {
    const file = await stableFile(path.join(directory, filename), mimeType === "application/json");
    observed.set(filename, file);
    const candidate = candidateMedia(catalog, slot, filename, issues, binding.id);
    if (!file) {
      if (candidate) issues.push({ code: "catalog-medium-missing-locally", blocking: true, id: binding.id, filename });
      continue;
    }
    const entry = { id: candidate?.id || `${binding.id}:asset:${filename}`, bytes: file.bytes, sha256: file.sha256, mimeType };
    if (candidate) {
      if (matchingPublicPath(candidate.url, binding.assetName, filename) && candidate.sha256 === file.sha256
          && (candidate.bytes === undefined || candidate.bytes === file.bytes) && (candidate.mimeType === undefined || candidate.mimeType === mimeType)) entry.url = candidate.url;
      else issues.push({ code: "public-medium-not-confirmed", blocking: false, id: binding.id, filename });
    }
    files[filename] = entry;
    if (mimeType === "application/json") {
      try { metadata[filename] = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.content)); }
      catch { throw problem("invalid-asset-metadata"); }
      if (!object(metadata[filename])) throw problem("invalid-asset-metadata");
    }
  }
  for (const [media, details] of [["sound.mp3", "credits.json"], ["portrait.webp", "portrait.json"]]) {
    if (observed.get(media) && !observed.get(details) || !observed.get(media) && observed.get(details)) {
      issues.push({ code: "unpaired-asset-metadata", blocking: true, id: binding.id, filename: details });
    }
  }
  await unchangedAssets(directory, chain, observed);
  return { files, credits: metadata["credits.json"] ?? null, portraitMetadata: metadata["portrait.json"] ?? null,
    evidence: assetFiles.map(([filename]) => ({ filename, ...(files[filename] ? { present: true, ...files[filename] } : { present: false }) })) };
}

/** Read-only preparation from explicit snapshots. No discovery, import, approval, network or writes. */
export async function buildSpeciesWorkingRecords({ speciesList, speciesData, catalog, assetOverrides, taxonomyOverrides,
  assessmentBindings, bindings, assetsRoot } = {}) {
  if (!path.isAbsolute(assetsRoot || "") || /^(?:\\\\|\/\/|file:)/i.test(assetsRoot)) throw problem("explicit-local-assets-root-required");
  const source = clone({ speciesList, speciesData, catalog, assetOverrides, taxonomyOverrides, assessmentBindings, bindings });
  if (!Array.isArray(source.speciesList) || !Array.isArray(source.speciesData) || !Array.isArray(source.bindings)
      || source.speciesList.length > 10000 || source.speciesData.length > 10000 || source.bindings.length > 10000
      || source.speciesList.some((entry) => !object(entry)) || source.speciesData.some((entry) => !object(entry)) || source.bindings.some((entry) => !object(entry))
      || source.catalog?.schemaVersion !== 1 || !Array.isArray(source.catalog.species)
      || !object(source.assetOverrides?.assets) || source.assetOverrides.version !== 1
      || !object(source.taxonomyOverrides?.species) || source.taxonomyOverrides.version !== 1 || !object(source.assessmentBindings)) throw problem("invalid-explicit-working-sources");
  const checkedCatalog = buildCatalog(source.catalog), issues = [], records = [], evidence = [];
  const sources = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, sourceProof(value)]));
  sources.assetsRoot = sourceProof(path.resolve(assetsRoot));
  const inputs = group(source.speciesList, (entry) => scientificKey(entry?.genus, entry?.species));
  const generated = group(source.speciesData, (entry) => entry?.URLSlug);
  const scientific = group(source.speciesData, (entry) => scientificKey(entry?.Genus, entry?.Species));
  const bindingIds = group(source.bindings, (entry) => entry?.id), assetNames = group(source.bindings, (entry) => String(entry?.assetName || "").toLocaleLowerCase("de"));
  const usedInput = new Set(), usedGenerated = new Set(), catalogIds = new Set(checkedCatalog.species.map((entry) => entry.id));
  for (const entry of source.bindings) if (!catalogIds.has(entry?.id)) issues.push({ code: "binding-without-catalog-species", blocking: true, id: entry?.id ?? null });
  for (const publicSpecies of checkedCatalog.species) {
    const id = publicSpecies.id, localIssues = [];
    const add = (code, details = {}) => localIssues.push({ code, blocking: true, id, ...details });
    const selected = bindingIds.get(id) || [], generatedRows = generated.get(id) || [];
    if (selected.length !== 1) add(selected.length ? "ambiguous-working-binding" : "missing-working-binding");
    if (generatedRows.length !== 1) add(generatedRows.length ? "ambiguous-generated-species" : "missing-generated-species");
    if (localIssues.length) { issues.push(...localIssues); continue; }
    const binding = selected[0].value, generatedRow = generatedRows[0], data = generatedRow.value;
    if (!safeName(binding.assetName)) add("unsafe-asset-name");
    else if (assetNames.get(binding.assetName.toLocaleLowerCase("de")).length !== 1) add("ambiguous-asset-binding");
    if (!Object.hasOwn(binding, "generalSectionId") || !Object.hasOwn(binding, "embeddedGeneralText")) add("explicit-general-decision-required");
    if (!object(own(source.assetOverrides.assets, binding.assetName, {}))) add("invalid-art-asset-overrides");
    const key = scientificKey(data.Genus, data.Species), manualRows = inputs.get(key) || [];
    if (scientific.get(key).length !== 1) add("ambiguous-generated-scientific-key");
    if (manualRows.length !== 1) add(manualRows.length ? "ambiguous-input-species" : "missing-input-species");
    if (scientificKey(publicSpecies.scientificName, "") !== key
      || data["Wissenschaftlicher Name"] !== undefined && scientificKey(data["Wissenschaftlicher Name"], "") !== key) add("inconsistent-scientific-identity");
    if (binding.embeddedGeneralText !== null && binding.generatedSha256 !== sourceProof(data).sha256) add("general-source-binding-required");
    if (localIssues.length) { issues.push(...localIssues); continue; }
    usedInput.add(manualRows[0].index); usedGenerated.add(generatedRow.index);
    try {
      const assets = await readAssets({ assetsRoot: path.resolve(assetsRoot), binding, catalog: publicSpecies, issues: localIssues });
      const record = validateSpeciesRecord({ type: SPECIES_RECORD_TYPE, schemaVersion: 1, id, input: manualRows[0].value, generated: data,
        taxonomyOverride: own(source.taxonomyOverrides.species, id, null), assessmentBinding: own(source.assessmentBindings, binding.assetName, null),
        assets: { assetName: binding.assetName, files: assets.files, overrides: own(source.assetOverrides.assets, binding.assetName, {}), credits: assets.credits, portraitMetadata: assets.portraitMetadata },
        editorial: { websiteUrl: publicSpecies.websiteUrl ?? null, sections: publicSpecies.sections, gallery: publicSpecies.media.gallery,
          generalSectionId: binding.generalSectionId, embeddedGeneralText: binding.embeddedGeneralText } }, id);
      if (!localIssues.some((issue) => issue.blocking)) {
        records.push(record);
        evidence.push({ id, assetName: binding.assetName, inputIndex: manualRows[0].index, generatedIndex: generatedRow.index,
          input: sourceProof(manualRows[0].value), generated: sourceProof(data), catalog: sourceProof(publicSpecies),
          files: assets.evidence, record: sourceProof(record) });
      }
    } catch (error) { add(typeof error.code === "string" ? error.code : "working-record-source-unreadable"); }
    issues.push(...localIssues);
  }
  source.speciesList.forEach((entry, index) => { if (!usedInput.has(index)) issues.push({ code: "input-species-not-bound", blocking: true, inputIndex: index }); });
  source.speciesData.forEach((entry, index) => { if (!usedGenerated.has(index)) issues.push({ code: "generated-species-not-bound", blocking: true, generatedIndex: index }); });
  return { schemaVersion: 1, proposedOnly: true, complete: !issues.some((issue) => issue.blocking), records, sources, evidence, issues,
    externalPublication: "not-performed", sharedProjectWrites: "not-performed" };
}
