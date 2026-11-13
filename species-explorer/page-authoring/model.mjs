import { sanitizeAssetName } from "../species-model.mjs";
import { fields, text, identifier, slug, digest, sourceBinding, unique, fingerprint, check, clone } from "./contract.mjs";
import { getPageTemplate } from "./templates.mjs";

export const NORMAL_ASSET_FILES = { portrait: "portrait.webp", map: "map.jpg", sound: "sound.mp3", credits: "credits.json", spectrogram: "spectrogram.webp" };
export function normalizeBlocks(input) {
  check(Array.isArray(input) && input.length <= 300, "invalid_blocks", "Eine begrenzte Textgliederung ist erforderlich.");
  return input.map(block => {
    fields(block, ["type", "text", "items", "level"]);
    check(["paragraph", "heading", "bullet-list", "numbered-list"].includes(block.type), "unsafe_richtext", "Zulässig sind Absätze, Zwischenüberschriften und Textlisten.");
    if (["bullet-list", "numbered-list"].includes(block.type)) {
      check(Array.isArray(block.items) && block.items.length > 0 && block.items.length <= 100 && block.text === undefined && block.level === undefined,
        "invalid_list", "Eine gültige Textliste ist erforderlich.");
      return { type: block.type, items: block.items.map(value => text(value, 10000)) };
    }
    check(block.items === undefined && (block.type !== "paragraph" || block.level === undefined), "invalid_blocks", "Diese Textstruktur ist nicht zulässig.");
    if (block.type === "heading") check([5, 6].includes(block.level), "unsafe_heading", "Zwischenüberschriften verwenden die Stufen 5 oder 6.");
    return { type: block.type, text: text(block.text, 100000, true), ...(block.type === "heading" ? { level: block.level } : {}) };
  });
}
export function hasContent(blocks) { return blocks.some(block => block.text?.trim() || block.items?.some(value => value.trim())); }
export function emptySectionHash(section) { return fingerprint({ id: section.id, title: section.title, kind: section.kind, blocks: section.blocks }); }
export function initialDocument({ templateId, species, parentPath, title = species.commonName || species.scientificName }) {
  const template = getPageTemplate(templateId);
  return normalizeDocument({ templateId, slug: species.slug, parentPath, title, introduction: [], sources: [],
    sections: template.sections.map(section => ({ id: section.id, title: section.title, requested: section.kind === "editorial", blocks: [], sources: [] })),
    images: [], galleryRequested: true }, { species, previous: null });
}
export function normalizeSpeciesSnapshot(input, projectId, wantedSlug) {
  fields(input, ["slug", "scientificName", "commonName", "assetName", "taxonomy", "general", "status", "revision", "dataSha256", "runtimeReady", "normalAssets"]);
  check(input.slug === wantedSlug, "species_changed", "Die Artzuordnung stimmt nicht mit der gewählten Art überein.", 409);
  check(Array.isArray(input.taxonomy) && input.taxonomy.length <= 30 && Array.isArray(input.general) && input.general.length <= 40, "invalid_species", "Die Artgrunddaten sind unvollständig.");
  const normalAssets = {};
  fields(input.normalAssets, Object.keys(NORMAL_ASSET_FILES));
  for (const role of Object.keys(NORMAL_ASSET_FILES)) {
    const asset = input.normalAssets[role];
    if (asset === null || asset === undefined) { normalAssets[role] = null; continue; }
    normalAssets[role] = normalizeAssetMetadata(asset, projectId);
    const expected = { portrait:'image/webp',map:'image/jpeg',sound:'audio/mpeg',credits:'application/json',spectrogram:'image/webp' }[role];
    check(normalAssets[role].mimeType === expected,'normal_asset_format','Die normale Artdatei benötigt ihr bestehendes FN-Dateiformat.');
  }
  const value = { slug: slug(input.slug), scientificName: text(input.scientificName, 300), commonName: text(input.commonName, 300, true),
    taxonomy: input.taxonomy.map(value => { fields(value, ["rank", "name"]); return { rank: text(value.rank, 80), name: text(value.name, 300) }; }),
    general: input.general.map(value => { fields(value, ["label", "value"]); return { label: text(value.label, 300), value: text(value.value, 3000, true) }; }),
    status: text(input.status, 1000, true), revision: identifier(input.revision), dataSha256: digest(input.dataSha256), runtimeReady: input.runtimeReady === true, normalAssets };
  const assetName = input.assetName === undefined ? sanitizeAssetName(value.commonName || value.scientificName) : input.assetName;
  check(typeof assetName === 'string' && assetName.length > 0 && assetName.length <= 512 && assetName === assetName.trim()
    && !['.', '..'].includes(assetName) && !/[\\/:*?"<>|\x00-\x1f\x7f]/.test(assetName) && !/[. ]$/.test(assetName)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(assetName), 'invalid_asset_name', 'Die gebundene Artablage benötigt einen sicheren einzelnen Ordnernamen.');
  return { ...value, assetName };
}
export function normalizeAssetMetadata(input, projectId) {
  fields(input, ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"]);
  check(input.projectId === projectId, "foreign_media", "Das Medium gehört nicht zum angemeldeten Projekt.", 403);
  check(Number.isSafeInteger(input.bytes) && input.bytes > 0 && input.bytes <= 32 * 1024 * 1024, "media_size", "Das bereitgestellte Medium ist zu groß oder leer.");
  check(["image/png", "image/jpeg", "image/webp", "audio/mpeg", "application/json"].includes(input.mimeType), "unsafe_media_type", "Dieses Medienformat wird für die Artseite nicht verwendet.");
  return { id: identifier(input.id), projectId: identifier(input.projectId), sha256: digest(input.sha256), bytes: input.bytes,
    mimeType: input.mimeType, attribution: text(input.attribution ?? "", 8000, true) };
}
export function normalizeDocument(input, { species, previous }) {
  fields(input, ["templateId", "slug", "parentPath", "title", "introduction", "sections", "images", "sources", "galleryRequested"]);
  const template = getPageTemplate(input.templateId);
  check(input.slug === species.slug, "species_changed", "Ein Entwurf bleibt an seine konkrete Art gebunden.", 409);
  check(typeof input.parentPath === "string" && /^\/wildlife\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.parentPath), "invalid_parent", "Der bestehende Wildlife-Zielbereich ist erforderlich.");
  check(Array.isArray(input.sections) && input.sections.length === template.sections.length, "incomplete_structure", "Alle Abschnitte der gewählten Gliederung müssen erhalten bleiben.");
  const allowed = new Map(template.sections.map(value => [value.id, value]));
  const sections = input.sections.map(value => {
    fields(value, ["id", "title", "requested", "blocks", "sources"]);
    const slot = allowed.get(value.id); check(slot, "unknown_section", "Dieser Abschnitt gehört nicht zur gewählten Vorlage.");
    check(typeof value.requested === "boolean" && Array.isArray(value.sources) && value.sources.length <= 30, "invalid_section", "Abschnittswunsch und Quellen müssen vollständig angegeben sein.");
    return { id: slot.id, kind: slot.kind, title: text(value.title, 300), requested: value.requested,
      blocks: normalizeBlocks(value.blocks), sources: value.sources.map(sourceBinding) };
  });
  unique(sections.map(value => value.id));
  check(sections[0].kind === "general-module" && sections.at(-1).kind === "map-module", "unsafe_module_order", "Artgrunddaten bleiben am Anfang und die Verbreitungskarte am Ende der Fachabschnitte.");
  check(Array.isArray(input.images) && input.images.length <= 200 && Array.isArray(input.sources) && input.sources.length <= 100
    && typeof input.galleryRequested === "boolean", "invalid_images", "Eine begrenzte Bildauswahl und Quellenliste sind erforderlich.");
  const images = input.images.map(value => {
    fields(value, ["id", "assetId", "alt", "caption", "decorative"]);
    check(typeof value.decorative === "boolean", "invalid_image", "Die Bildrolle muss ausdrücklich festgelegt sein.");
    const image = { id: identifier(value.id), assetId: identifier(value.assetId), alt: text(value.alt, 3000, true), caption: text(value.caption, 3000, true), decorative: value.decorative };
    check(!image.decorative || image.alt === "", "decorative_text", "Ein bewusst dekoratives Bild hat keinen zusätzlichen Alternativtext."); return image;
  });
  unique(images.map(value => value.id));
  const emptyConfirmations = {};
  for (const section of sections) {
    const prior = previous?.emptyConfirmations?.[section.id];
    if (!hasContent(section.blocks) && prior?.sectionHash === emptySectionHash(section)) emptyConfirmations[section.id] = clone(prior);
  }
  const result = { schemaVersion: 1, templateId: template.id, templateHash: template.templateHash, slug: species.slug,
    parentPath: input.parentPath, title: text(input.title, 300), introduction: normalizeBlocks(input.introduction),
    sections, images, galleryRequested: input.galleryRequested, sources: input.sources.map(sourceBinding), emptyConfirmations, species: clone(species) };
  check(Buffer.byteLength(JSON.stringify(result)) <= 2 * 1024 * 1024, "document_too_large", "Der Seitenentwurf überschreitet die vorgesehene Größe."); return result;
}
export function editableDocument(document) {
  return { templateId: document.templateId, slug: document.slug, parentPath: document.parentPath, title: document.title,
    introduction: clone(document.introduction), sections: document.sections.map(({ id, title, requested, blocks, sources }) => ({ id, title, requested, blocks: clone(blocks), sources: clone(sources) })),
    images: document.images.map(({ id, assetId, alt, caption, decorative }) => ({ id, assetId, alt, caption, decorative })),
    sources: clone(document.sources), galleryRequested: document.galleryRequested };
}
