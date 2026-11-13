import { isProxy } from "node:util/types";
import { check } from "./errors.mjs";
import { canonicalJson } from "./security.mjs";
import { validatePublicCatalogUrl } from "./catalog.mjs";
import { validateEditorialSourceBindings } from "./species-editorial-intent.mjs";
import { identifier, sourceBinding, text } from "../page-authoring/contract.mjs";
import { NORMAL_ASSET_FILES, normalizeAssetMetadata, normalizeBlocks, emptySectionHash, hasContent } from "../page-authoring/model.mjs";

const EDITORIAL_KEYS = ["websiteUrl", "title", "introduction", "sections", "sources", "galleryRequested", "gallery", "normalAssets", "sourceBindings"];
const ASSET_KEYS = ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"];
const JSON_LIMIT = { maxBytes: 2 * 1024 * 1024, maxNodes: 300000 };
const CODE = "invalid_reader_editorial";
const MESSAGE = "Die redaktionelle Leserfassung ist unvollständig oder enthält unzulässige Daten.";

function exact(value, keys) {
  check(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 400, CODE, MESSAGE);
}

// Check descriptors before cloning: neither hidden fields, accessors, proxies nor
// sparse arrays may disappear or run code while a supposedly pure proof is read.
function cloneData(value, limits = JSON_LIMIT) {
  let nodes = 0, bytes = 0;
  function visit(item, depth) {
    check(depth <= 32 && ++nodes <= limits.maxNodes, 400, CODE, MESSAGE);
    if (item === null || ["string", "boolean"].includes(typeof item) || typeof item === "number" && Number.isFinite(item)) {
      bytes += Buffer.byteLength(JSON.stringify(item));
      check(bytes <= limits.maxBytes, 413, "reader_editorial_too_large", "Die redaktionelle Leserfassung überschreitet die vorgesehene Größe.");
      return;
    }
    check(item && typeof item === "object" && !isProxy(item), 400, CODE, MESSAGE);
    const array = Array.isArray(item);
    check(Object.getPrototypeOf(item) === (array ? Array.prototype : Object.prototype), 400, CODE, MESSAGE);
    const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
    if (array) {
      check(keys.length === item.length + 1 && keys.every(key => key === "length"
        || typeof key === "string" && /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length), 400, CODE, MESSAGE);
    }
    for (const key of keys) {
      if (array && key === "length") continue;
      const descriptor = descriptors[key];
      check(typeof key === "string" && !["__proto__", "constructor", "prototype"].includes(key)
        && descriptor.enumerable === true && Object.hasOwn(descriptor, "value"), 400, CODE, MESSAGE);
      if (!array) bytes += Buffer.byteLength(JSON.stringify(key));
      check(bytes <= limits.maxBytes, 413, "reader_editorial_too_large", "Die redaktionelle Leserfassung überschreitet die vorgesehene Größe.");
      visit(descriptor.value, depth + 1);
    }
  }
  visit(value, 0);
  return JSON.parse(canonicalJson(value, limits));
}

function unchanged(original, normalized) {
  check(canonicalJson(original, JSON_LIMIT) === canonicalJson(normalized, JSON_LIMIT), 400, CODE, MESSAGE);
  return normalized;
}

function sources(values, max) {
  check(Array.isArray(values) && values.length <= max, 400, CODE, MESSAGE);
  return values.map(value => unchanged(value, sourceBinding(value)));
}

function asset(value, projectId) {
  exact(value, ASSET_KEYS);
  return unchanged(value, normalizeAssetMetadata(value, projectId));
}

function emptyDecision(value, section) {
  if (value === null) return null;
  exact(value, ["sectionHash", "actorId", "confirmedAt", "reason"]);
  check(!hasContent(section.blocks) && value.sectionHash === emptySectionHash(section), 400, CODE,
    "Die Entscheidung für einen leeren Abschnitt passt nicht mehr zu dessen Inhalt.");
  identifier(value.actorId); text(value.confirmedAt, 80); text(value.reason, 1000, true);
  return value;
}

/** Exact, lossless rich source. This validates claims, not current server heads. */
export function validateReaderEditorial(input, { projectId, speciesId } = {}) {
  const value = cloneData(input);
  exact(value, EDITORIAL_KEYS);
  const binding = validateEditorialSourceBindings(value.sourceBindings);
  check((projectId === undefined || binding.projectId === projectId)
    && (speciesId === undefined || binding.species.id === speciesId), 400, CODE,
  "Die redaktionelle Leserfassung gehört nicht zu dieser Art oder diesem Projekt.");
  if (value.websiteUrl !== null) validatePublicCatalogUrl(value.websiteUrl);
  text(value.title, 300);
  unchanged(value.introduction, normalizeBlocks(value.introduction));
  check(Array.isArray(value.sections) && value.sections.length >= 2 && value.sections.length <= 100, 400, CODE, MESSAGE);
  for (const [index, section] of value.sections.entries()) {
    exact(section, ["id", "kind", "title", "requested", "blocks", "sources", "emptyDecision"]);
    identifier(section.id); text(section.title, 300);
    check(typeof section.requested === "boolean"
      && section.kind === (index === 0 ? "general-module" : index === value.sections.length - 1 ? "map-module" : "editorial"),
    400, CODE, "Artgrunddaten und Verbreitungskarte müssen die Fachabschnitte in ihrer vorhandenen Reihenfolge umschließen.");
    unchanged(section.blocks, normalizeBlocks(section.blocks));
    sources(section.sources, 30); emptyDecision(section.emptyDecision, section);
  }
  check(new Set(value.sections.map(section => section.id)).size === value.sections.length, 400, CODE, MESSAGE);
  sources(value.sources, 100);
  check(typeof value.galleryRequested === "boolean" && Array.isArray(value.gallery) && value.gallery.length <= 200, 400, CODE, MESSAGE);
  const bindings = new Map();
  function bind(metadata) {
    const normalized = asset(metadata, binding.projectId), serialized = canonicalJson(normalized);
    check(!bindings.has(normalized.id) || bindings.get(normalized.id) === serialized, 400, CODE,
      "Dasselbe Medium darf nicht mit widersprüchlichen Dateibindungen verwendet werden.");
    bindings.set(normalized.id, serialized);
  }
  for (const [index, image] of value.gallery.entries()) {
    exact(image, ["id", "asset", "alt", "caption", "decorative", "order"]);
    identifier(image.id); bind(image.asset); text(image.alt, 3000, true); text(image.caption, 3000, true);
    check(image.asset.mimeType.startsWith("image/") && typeof image.decorative === "boolean"
      && (!image.decorative || image.alt === "") && image.order === index, 400, CODE,
    "Bildposition, Bildrolle und Alternativtext müssen ausdrücklich und in ihrer gespeicherten Reihenfolge erhalten bleiben.");
  }
  check(new Set(value.gallery.map(image => image.id)).size === value.gallery.length, 400, CODE, MESSAGE);
  exact(value.normalAssets, Object.keys(NORMAL_ASSET_FILES));
  const mimeTypes = { portrait: "image/webp", map: "image/jpeg", sound: "audio/mpeg", credits: "application/json", spectrogram: "image/webp" };
  for (const [role, metadata] of Object.entries(value.normalAssets)) {
    if (metadata === null) continue;
    bind(metadata);
    check(metadata.mimeType === mimeTypes[role], 400, CODE, "Die normale Artdatei benötigt ihr bestehendes Dateiformat.");
  }
  return value;
}

/** Strip only the projector envelope; rich content itself is never flattened. */
export function readerEditorialFromProjection(input) {
  const projection = cloneData(input, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 });
  exact(projection, ["kind", "schemaVersion", ...EDITORIAL_KEYS, "readerApproved", "externalPublication"]);
  check(projection.kind === "page-editorial-projection" && projection.schemaVersion === 1
    && projection.readerApproved === false && projection.externalPublication === "not-performed", 400, CODE, MESSAGE);
  return validateReaderEditorial(Object.fromEntries(EDITORIAL_KEYS.map(key => [key, projection[key]])));
}

function blocksAsText(blocks) {
  return blocks.map(block => block.items ? block.items.map((item, index) => `${block.type === "numbered-list" ? `${index + 1}.` : "•"} ${item}`).join("\n")
    : block.text).join("\n\n");
}
function sourcesAsText(values) {
  return values.map(source => [source.label, source.url, source.sha256 ? `SHA-256: ${source.sha256}` : ""].filter(Boolean).join(" · ")).join("\n");
}

/** Derived display only. The stored rich structures remain the authoritative source. */
export function readerEditorialSectionsAsText(input) {
  const editorial = validateReaderEditorial(input), used = new Set(editorial.sections.map(section => section.id));
  function freeId(wanted) { let id = wanted; while (used.has(id)) id += "-text"; used.add(id); return id; }
  const result = [];
  const introduction = blocksAsText(editorial.introduction);
  if (introduction) result.push({ id: freeId("introduction"), title: "Einleitung", text: introduction, intentionallyEmpty: false });
  for (const section of editorial.sections) {
    const body = blocksAsText(section.blocks), references = sourcesAsText(section.sources);
    result.push({ id: section.id, title: section.title, text: [body, references ? `Quellen:\n${references}` : ""].filter(Boolean).join("\n\n"),
      intentionallyEmpty: !hasContent(section.blocks) && !references && section.emptyDecision !== null });
  }
  const references = sourcesAsText(editorial.sources);
  if (references) result.push({ id: freeId("sources"), title: "Quellen", text: references, intentionallyEmpty: false });
  return result;
}
