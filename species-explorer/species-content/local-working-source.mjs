import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { check, ProjectError } from "../shared-project/errors.mjs";
import { canonicalJson } from "../shared-project/security.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";
import { sanitizeAssetName } from "../species-model.mjs";
import { buildSpeciesContent } from "./export.mjs";
import { readBundledSpeciesCatalog } from "./bundled.mjs";
import { createWorkingImportSource } from "./working-import-source.mjs";

const sourceFiles = Object.freeze({ speciesList: "species_list.json", speciesData: "speciesData.json", assetOverrides: "species-assets-overrides.json",
  taxonomyOverrides: "species-taxonomy-overrides.json", assessmentBindings: "lastSavedAssessmentId.json" });
const maxJsonBytes = 8 * 1024 * 1024;
const same = (a, b) => ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every((key) => a[key] === b[key]);
const changed = () => { throw new ProjectError(409, "local_working_sources_changed", "Die lokalen Artquellen wurden während des Lesens geändert. Bitte erneut prüfen."); };
function regular(stat) {
  check(stat.isFile() && !stat.isSymbolicLink(), 409, "local_working_source_unsafe", "Eine feste Artquelle ist keine reguläre, verknüpfungsfreie Datei.");
  check(stat.size > 0n && stat.size <= BigInt(maxJsonBytes), 413, "local_working_source_size", "Eine feste Artquelle ist leer oder überschreitet ihre Größenbegrenzung.");
}
async function directories(root) {
  let current = path.parse(root).root;
  const entries = [];
  for (const part of root.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current, { bigint: true });
    check(stat.isDirectory() && !stat.isSymbolicLink(), 409, "local_working_source_unsafe", "Der feste Projektpfad darf keine Verknüpfung verwenden.");
    entries.push({ filename: current, stat });
  }
  return entries;
}
function parseJson(bytes, filename) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ProjectError(400, "local_working_source_invalid", `Die feste Quelle ${filename} enthält kein gültiges UTF-8-JSON.`); }
}
async function readFileSnapshot(filename, before) {
  regular(before);
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!same(before, await handle.stat({ bigint: true }))) changed();
    const parts = [], buffer = Buffer.alloc(65536); let size = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > Number(before.size) || size > maxJsonBytes) changed();
      parts.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    const after = await fs.lstat(filename, { bigint: true }); regular(after);
    if (size !== Number(before.size) || !same(before, after) || !same(before, await handle.stat({ bigint: true }))) changed();
    return Buffer.concat(parts);
  } finally { await handle.close(); }
}
function bindGeneratedGeneral(speciesData, catalog) {
  check(Array.isArray(speciesData) && speciesData.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry)),
    400, "local_working_source_invalid", "Die erzeugte Artenliste ist kein vollständiger strukturierter Bestand.");
  return catalog.species.map((species) => {
    const candidates = speciesData.filter((entry) => entry.URLSlug === species.id);
    check(candidates.length === 1, 409, "local_working_identity_ambiguous", "Eine Katalogart besitzt keine eindeutige lokale Originalzeile.");
    const record = candidates[0];
    check(typeof record["Deutscher Name"] === "string" && record["Deutscher Name"].trim(),
      409, "local_working_asset_binding_missing", "Die vorhandene lokale Assetkennung ist nicht eindeutig aus der erzeugten Artzeile gebunden.");
    const general = buildSpeciesContent({ record }).data.sections.find((section) => section.id === "structured-general")?.text;
    check(typeof general === "string" && general.length > 0, 409, "local_working_general_missing", "Die erzeugten Allgemeinwerte der Art sind nicht vollständig gebunden.");
    const matches = species.sections.filter((section) => section.text === general || section.text.endsWith(`\n\n${general}`));
    check(matches.length === 1, 409, matches.length ? "local_working_general_ambiguous" : "local_working_general_missing",
      "Der vorhandene Allgemeintext benötigt genau eine exakte Bindung an seine erzeugte Artquelle.");
    return { id: species.id, assetName: sanitizeAssetName(record["Deutscher Name"]), generalSectionId: matches[0].id, embeddedGeneralText: general,
      generatedSha256: createHash("sha256").update(canonicalJson(record, { maxBytes: maxJsonBytes, maxNodes: 300000 })).digest("hex") };
  });
}

/** Fixed main-process paths only. Reads local originals but never imports, writes or opens a browser. */
export function createLocalWorkingImportSource({ repoRoot, readCatalog = () => readBundledSpeciesCatalog(repoRoot) } = {}) {
  check(typeof repoRoot === "string" && path.isAbsolute(repoRoot) && !/^(?:\\\\|\/\/|file:)/i.test(repoRoot) && !repoRoot.includes("\0") && typeof readCatalog === "function",
    400, "invalid_local_working_source_config", "Ein fester lokaler Projektordner und gebundener Katalogleser sind erforderlich.");
  const root = path.resolve(repoRoot);
  async function readSources() {
    try {
      const chain = await directories(root), files = Object.entries(sourceFiles).map(([key, filename]) => ({ key, filename: path.join(root, filename) }));
      // Bind the whole block before reading its first member, then recheck every
      // member after catalog reading and general-text binding have completed.
      for (const file of files) { file.stat = await fs.lstat(file.filename, { bigint: true }); regular(file.stat); }
      const sources = {};
      for (const file of files) sources[file.key] = parseJson(await readFileSnapshot(file.filename, file.stat), path.basename(file.filename));
      let catalogBytes;
      try { catalogBytes = await readCatalog(); }
      catch { throw new ProjectError(503, "local_working_catalog_unavailable", "Der gebundene öffentliche Artkatalog ist derzeit nicht lesbar."); }
      check((Buffer.isBuffer(catalogBytes) || catalogBytes instanceof Uint8Array) && catalogBytes.length > 0 && catalogBytes.length <= 5 * 1024 * 1024,
        413, "local_working_catalog_invalid", "Der gebundene Artkatalog besitzt keine begrenzte Bytefassung.");
      const catalogValue = parseJson(catalogBytes, "öffentlicher Artkatalog");
      check(catalogValue?.schemaVersion === 1, 400, "local_working_catalog_invalid", "Der gebundene Artkatalog hat ein unbekanntes Format.");
      const catalog = buildCatalog(catalogValue), bindings = bindGeneratedGeneral(sources.speciesData, catalog);
      for (const file of files) { const after = await fs.lstat(file.filename, { bigint: true }); regular(after); if (!same(file.stat, after)) changed(); }
      for (const entry of chain) {
        const after = await fs.lstat(entry.filename, { bigint: true });
        if (!after.isDirectory() || after.isSymbolicLink() || after.dev !== entry.stat.dev || after.ino !== entry.stat.ino) changed();
      }
      return { ...sources, catalog, bindings };
    } catch (error) {
      if (error instanceof ProjectError) throw error;
      throw new ProjectError(503, "local_working_sources_unavailable", "Die festen lokalen Artquellen sind derzeit nicht vollständig lesbar.");
    }
  }
  return createWorkingImportSource({ readSources, assetsRoot: path.join(root, "species-assets") });
}
