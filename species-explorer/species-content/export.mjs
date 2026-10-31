import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { sanitizeAssetName } from "../species-model.mjs";
import { buildCatalog, validateCatalogSpecies } from "../shared-project/catalog.mjs";
import { parseWebsiteEditorialPage, parseWebsiteAltPage, normalizeWebsitePageUrl, canonicalWebsiteImageSource } from "../website-alt-parser.mjs";

export const PAGES_ASSET_BASE = "https://felixkfm90.github.io/iucn-species-data/species-assets";
const ranks = ["Kingdom", "Phylum", "Class", "Order", "Family", "Genus", "Species"];
const generalFields = ["Wissenschaftlicher Name", "Deutscher Name", "Englischer Name", "Größe", "Gewicht", "Lebenserwartung",
  "Kategorie", "Status", "Trend", "Populationgröße", "Generationsdauer", "Assessment ID", "Letztes IUCN Update", "Daten abgerufen"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const present = (value) => value !== undefined && value !== null && String(value).trim() !== "";

function issue(code, details = {}, blocking = true) { return { code, blocking, ...details }; }
function required(condition, message) { if (!condition) throw new Error(message); }
function scientificName(record, manual) {
  if (present(record["Wissenschaftlicher Name"])) return String(record["Wissenschaftlicher Name"]).trim();
  if (present(manual?.scientificName)) return String(manual.scientificName).trim();
  const genus = record.Genus || manual?.genus, species = record.Species || manual?.species;
  return present(genus) && present(species) ? `${genus} ${species}`.trim() : "";
}

export function selectSpeciesPageUrls(speciesData, clusterRows, altPages = []) {
  const selected = new Map(), issues = [];
  for (const record of speciesData) {
    const slug = record.URLSlug;
    const matches = new Set(clusterRows.filter((row) => row.species?.slug === slug).map((row) => normalizeWebsitePageUrl(row.url)));
    if (matches.size === 0) {
      for (const page of altPages) {
        const url = normalizeWebsitePageUrl(page.url);
        if (new URL(url).pathname.split("/").at(-1) === slug && new URL(url).pathname.startsWith("/wildlife/")) matches.add(url);
      }
    }
    if (matches.size === 1) selected.set(slug, [...matches][0]);
    else issues.push(issue(matches.size ? "ambiguous-species-page" : "missing-species-page", { slug, candidates: [...matches] }));
  }
  return { selected, issues };
}

async function fileRecord(filename, relative) {
  let stat;
  try { stat = await fs.lstat(filename); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  required(stat.isFile() && !stat.isSymbolicLink(), "Ein Exportmedium ist keine reguläre Datei.");
  const bytes = await fs.readFile(filename), after = await fs.lstat(filename);
  required(after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ino === stat.ino,
    "Ein Exportmedium wurde während des Lesens verändert.");
  return { path: relative.replaceAll(path.sep, "/"), bytes: bytes.length, sha256: hash(bytes), content: bytes };
}
function attribution(meta, keys, labels, issues, context) {
  if (!meta) return null;
  const parts = [];
  for (const key of keys) {
    if (!present(meta[key])) continue;
    if (typeof meta[key] !== "string") { issues.push(issue("invalid-attribution-value", { context, field: key })); continue; }
    parts.push(`${labels[key]}: ${meta[key]}`);
  }
  const text = parts.join("\n");
  if (text.length > 8000) { issues.push(issue("attribution-too-long", { context })); return null; }
  return text || null;
}

export async function readSpeciesMedia({ assetsRoot, record }) {
  required(path.isAbsolute(assetsRoot), "Ein ausdrücklicher absoluter Assetordner ist erforderlich.");
  const assetName = sanitizeAssetName(record["Deutscher Name"]), directory = path.join(assetsRoot, assetName);
  const issues = [], files = [], media = { sounds: [], gallery: [] }, metadata = {};
  try { required(!(await fs.lstat(assetsRoot)).isSymbolicLink(), "Verknüpfter Assetordner."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  try { required(!(await fs.lstat(directory)).isSymbolicLink(), "Verknüpfter Artassetordner."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const name of ["portrait.json", "credits.json"]) {
    const file = await fileRecord(path.join(directory, name), `${assetName}/${name}`);
    if (!file) continue;
    files.push({ path: file.path, bytes: file.bytes, sha256: file.sha256 });
    try { metadata[name] = JSON.parse(file.content.toString("utf8")); }
    catch { issues.push(issue("unreadable-media-metadata", { file: file.path })); }
  }
  for (const [name, key, mimeType] of [["portrait.webp", "portrait", "image/webp"], ["map.jpg", "map", "image/jpeg"], ["sound.mp3", "sound", "audio/mpeg"]]) {
    const file = await fileRecord(path.join(directory, name), `${assetName}/${name}`);
    if (!file) {
      if (key !== "sound") issues.push(issue("missing-required-media", { slug: record.URLSlug, media: key }));
      else if (metadata["credits.json"]) issues.push(issue("sound-metadata-without-sound", { slug: record.URLSlug }));
      continue;
    }
    files.push({ path: file.path, bytes: file.bytes, sha256: file.sha256 });
    const item = { id: `${record.URLSlug}:${key}`, url: `${PAGES_ASSET_BASE}/${encodeURIComponent(assetName)}/${name}`,
      bytes: file.bytes, sha256: file.sha256, mimeType };
    const credit = key === "portrait" ? attribution(metadata["portrait.json"], ["type", "source", "generation_method"],
      { type: "Darstellung", source: "Quelle", generation_method: "Erstellung" }, issues, key)
      : key === "sound" ? attribution(metadata["credits.json"], ["recordist", "license", "source", "url"],
        { recordist: "Aufnahme", license: "Lizenz", source: "Quelle", url: "Quellenadresse" }, issues, key)
        : "Quelle: IUCN Red List — https://www.iucnredlist.org";
    if (credit) item.attribution = credit;
    else if (key !== "map") issues.push(issue("missing-media-attribution", { slug: record.URLSlug, media: key }));
    if (key === "sound") media.sounds.push(item); else media[key] = item;
  }
  // A spectrogram is a derived audio visualization, not an extra recording or a gallery photo.
  const spectrum = await fileRecord(path.join(directory, "spectrogram.webp"), `${assetName}/spectrogram.webp`);
  if (spectrum) files.push({ path: spectrum.path, bytes: spectrum.bytes, sha256: spectrum.sha256, role: "derived-spectrogram-not-in-v1-media-schema" });
  return { media, files, issues };
}

export function buildSpeciesContent({ record, manual, pageUrl, html, localMedia }) {
  const slug = record.URLSlug, issues = [...(localMedia?.issues ?? [])];
  required(typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), "Ungültiger bestehender Artslug.");
  const name = scientificName(record, manual), commonName = String(record["Deutscher Name"] || manual?.german || "");
  if (!name || !/\S+\s+\S+/.test(name)) issues.push(issue("incomplete-scientific-name", { slug }));
  const taxonomy = ranks.filter((rank) => present(record[rank])).map((rank) => ({ rank: rank.toLowerCase(), name: rank === "Species" ? name : String(record[rank]) }));
  const general = generalFields.filter((field) => present(record[field])).map((field) => `${field}: ${record[field]}`).join("\n");
  let editorial = null, inventory = null;
  if (html && pageUrl) {
    try { editorial = parseWebsiteEditorialPage(html, pageUrl); inventory = parseWebsiteAltPage(html, pageUrl); }
    catch { issues.push(issue("unreadable-editorial-page", { slug })); }
  } else issues.push(issue("missing-editorial-page", { slug }));
  if (editorial) issues.push(...editorial.issues.map((entry) => issue(entry.code, { slug, blockId: entry.blockId ?? null })));
  const sections = [], sectionEvidence = [];
  let generalIncluded = false;
  for (const [index, section] of (editorial?.sections ?? []).entries()) {
    const title = section.heading || "Einleitung", id = `section-${String(index + 1).padStart(3, "0")}-${hash(`${section.blockId}\n${title}`).slice(0, 12)}`;
    let text = section.paragraphs.map((entry) => entry.kind === "list-item" ? `• ${entry.text}` : entry.text).join("\n\n");
    let intentionallyEmpty = false, emptyReason = null;
    if (title.trim().toLowerCase() === "allgemein") {
      text = [text, general].filter(Boolean).join("\n\n"); generalIncluded = true;
    }
    if (!text) {
      if (title.trim().toLowerCase() === "verbreitungskarte" && localMedia?.media.map) { intentionallyEmpty = true; emptyReason = "media-backed-map"; }
      else if (index === 0 && section.level && section.level <= 3) { intentionallyEmpty = true; emptyReason = "introductory-heading"; }
      else issues.push(issue("empty-editorial-section", { slug, title, blockId: section.blockId }));
    }
    sections.push({ id, title, text, intentionallyEmpty });
    sectionEvidence.push({ id, blockId: section.blockId, heading: section.heading, paragraphCount: section.paragraphs.length,
      sourceTextSha256: hash(section.paragraphs.map((entry) => entry.text).join("\n")), emptyReason });
  }
  if (!generalIncluded) sections.unshift({ id: "structured-general", title: "Allgemein", text: general, intentionallyEmpty: false });
  if (!editorial?.blocks.length) issues.push(issue("no-editorial-text-blocks", { slug }));
  const media = structuredClone(localMedia?.media ?? { sounds: [], gallery: [] });
  for (const [order, source] of (editorial?.gallerySources ?? []).entries()) {
    const images = inventory.images.filter((image) => image.context === "content" && image.kind === "image" && image.sourceUrl === source);
    const altValues = [...new Set(images.flatMap((image) => image.altVariants))], captionValues = [...new Set(images.flatMap((image) => image.captionVariants).filter(Boolean))];
    if (!images.length || altValues.length > 1 || captionValues.length > 1) issues.push(issue("ambiguous-gallery-text", { slug, source }));
    const canonical = canonicalWebsiteImageSource(source), representation = new URL(canonical);
    if (/squarespace/.test(representation.hostname)) representation.searchParams.set("format", "1500w");
    media.gallery.push({ id: `${slug}:gallery:${hash(canonical).slice(0, 24)}`, url: representation.href,
      alt: images[0]?.alt ?? "", caption: captionValues[0] ?? "", order });
  }
  const data = { id: slug, scientificName: name, commonName, taxonomy, sections, media };
  if (pageUrl) data.websiteUrl = normalizeWebsitePageUrl(pageUrl);
  let validated = null;
  try { validated = validateCatalogSpecies(data, slug); }
  catch (error) { issues.push(issue("invalid-catalog-species", { slug, reason: error.code ?? "validation-error" })); }
  return { data: validated ?? data, complete: !issues.some((entry) => entry.blocking), issues,
    evidence: { htmlSha256: html ? hash(Buffer.from(html)) : null, editorialComplete: editorial?.complete ?? false,
      editorialBlocks: editorial?.blocks.map(({ blockId, sha256, complete }) => ({ blockId, sha256, complete })) ?? [],
      sections: sectionEvidence, galleryCanonicalSources: editorial?.gallerySources ?? [], assetFiles: localMedia?.files ?? [],
      soundState: media.sounds.length ? "present" : "no-existing-recording" } };
}

export async function exportSpeciesCatalog({ speciesData, speciesList, pages, assetsRoot, generatedAt = new Date().toISOString() }) {
  required(Array.isArray(speciesData) && Array.isArray(speciesList) && pages instanceof Map, "Explizite Quelldaten und Seitenzuordnungen sind erforderlich.");
  required(new Set(speciesData.map((entry) => entry.URLSlug)).size === speciesData.length, "Doppelte Artslugs verhindern den Export.");
  const results = [];
  for (const record of speciesData) {
    const candidates = speciesList.filter((entry) => entry.german === record["Deutscher Name"]);
    const manual = candidates.length === 1 ? candidates[0] : null, page = pages.get(record.URLSlug);
    const localMedia = await readSpeciesMedia({ assetsRoot, record });
    if (candidates.length !== 1) localMedia.issues.push(issue("ambiguous-manual-species-record", { slug: record.URLSlug, matches: candidates.length }));
    const result = buildSpeciesContent({ record, manual, pageUrl: page?.url, html: page?.html, localMedia });
    results.push({ slug: record.URLSlug, ...result });
  }
  const revision = hash(JSON.stringify(results.map((entry) => entry.data)));
  let catalog = null;
  try { catalog = buildCatalog({ revision, generatedAt, species: results.map((entry) => entry.data) }); }
  catch { /* Individual and aggregate schema failures remain explicit below. */ }
  const issues = results.flatMap((entry) => entry.issues);
  if (!catalog) issues.push(issue("aggregate-catalog-schema-failure"));
  return { schemaVersion: 1, generatedAt, revision, complete: Boolean(catalog) && !issues.some((entry) => entry.blocking),
    speciesCount: speciesData.length, catalog, results: results.map(({ data, ...entry }) => entry), issues };
}

export function createSpeciesImportPlan(snapshot) {
  required(snapshot?.complete === true && snapshot.catalog && snapshot.catalog.species.length === snapshot.speciesCount,
    "Nur ein vollständig geprüfter Export kann als Importplan vorgeschlagen werden.");
  const catalog = buildCatalog(snapshot.catalog);
  return { schemaVersion: 1, sourceRevision: snapshot.revision, proposedOnly: true, externalPublication: false,
    objects: catalog.species.map((data) => ({ kind: "species", id: data.id, data })) };
}
