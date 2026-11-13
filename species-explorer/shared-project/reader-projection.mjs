import { isProxy } from 'node:util/types';
import { check } from './errors.mjs';
import { validateCatalogSpecies } from './catalog.mjs';
import { SPECIES_RECORD_TYPE, validateSpeciesRecord, projectSpeciesRecordToCatalog } from './species-record.mjs';
import { projectSpeciesRecordToExplorer } from './species-view.mjs';
import { validateReaderMedia, validateReaderSpecies } from './reader-catalog.mjs';

const META = ['id', 'projectId', 'sha256', 'bytes', 'mimeType', 'attribution'];
const NORMAL = { portrait: 'portrait.webp', map: 'map.jpg', sound: 'sound.mp3', spectrogram: 'spectrogram.webp' };
const GENERAL = [
  ['german', 'Deutscher Name', view => view.germanName],
  ['english', 'Englischer Name', view => view.englishName],
  ['size', 'Größe', view => view.manual.size],
  ['weight', 'Gewicht', view => view.manual.weight],
  ['life_expectancy', 'Lebenserwartung', view => view.manual.lifeExpectancy],
];
const present = value => (typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)) && String(value).trim() !== '';
const project = value => check(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value),
  400, 'reader_project_required', 'Private Artmedien benötigen ihre tatsächliche Projektbindung.');

function own(object, key, array = false) {
  check(object && typeof object === 'object' && !isProxy(object) && Object.getPrototypeOf(object) === (array ? Array.prototype : Object.prototype),
    400, 'invalid_reader_species', 'Die Leserfassung muss aus reinen Daten bestehen.');
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  check(!descriptor || descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 400, 'invalid_reader_species', 'Die Leserfassung darf keine berechneten Datenfelder enthalten.');
  return descriptor?.value;
}
function entries(media) {
  const result = [own(media, 'portrait'), own(media, 'map'), own(media, 'spectrogram')].filter(Boolean);
  for (const key of ['sounds', 'gallery']) {
    const values = own(media, key);
    check(Array.isArray(values) && !isProxy(values) && Object.getPrototypeOf(values) === Array.prototype,
      400, 'invalid_reader_species', 'Die Medienverwendungen sind unvollständig.');
    for (let index = 0; index < values.length; index++) {
      const item = own(values, String(index), true);
      result.push(key === 'gallery' ? own(item, 'asset') : item);
    }
  }
  return result;
}
function publicMedia(value) {
  return validateReaderMedia({ kind: 'public-https', ...Object.fromEntries(['id', 'url', 'bytes', 'sha256', 'mimeType', 'attribution']
    .filter(key => value[key] !== undefined).map(key => [key, value[key]])) });
}
function publicGallery(values) {
  return values.map((image, order) => ({ id: image.id, asset: publicMedia(image), alt: image.alt, caption: image.caption, decorative: false, order }));
}
function attribution(view, role) {
  if (role === 'map') return view.assets.map.source ? `Quelle: ${view.assets.map.source}` : '';
  if (role === 'portrait') return [view.assets.portrait.metadata?.type, view.assets.portrait.metadata?.source,
    view.assets.portrait.metadata?.generation_method].filter(Boolean).join(' · ');
  return [view.credits?.recordist, view.credits?.license, view.credits?.source, view.credits?.url].filter(Boolean).join(' · ');
}
function privateMedia(metadata, { role, speciesId, projectId, resolveMedia }) {
  project(projectId);
  check(metadata.projectId === projectId && META.every(key => Object.hasOwn(metadata, key)),
    409, 'reader_media_binding_changed', 'Der Medienbeleg gehört nicht vollständig zu diesem Projekt.');
  // A prefix is never a byte receipt. Only the trusted synchronous resolver can
  // identify an existing project image or the fixed normal-media content slot.
  const resolved = resolveMedia ? resolveMedia({ ...metadata }, { role, speciesId }) : null;
  const result = resolved === null ? { kind: 'unavailable', ...metadata, reason: 'not-provided' }
    : validateReaderMedia(resolved, { projectId });
  check(['project-image', 'project-normal', 'unavailable'].includes(result.kind)
    && META.every(key => result[key] === metadata[key]), 409, 'reader_media_binding_changed',
  'Der bereitgestellte Medienbeleg stimmt nicht mehr mit der gespeicherten Artdatei überein.');
  return validateReaderMedia(result, { projectId });
}
function normalMedia(source, view, context) {
  const result = { portrait: null, map: null, spectrogram: null, sounds: [] };
  const bindings = [];
  for (const [role, filename] of Object.entries(NORMAL)) {
    const file = source.assets.files[filename];
    // Existing zero-byte placeholders are absent roles, not new prerequisites.
    if (!file || file.bytes === 0) continue;
    const metadata = source.schemaVersion === 2 ? source.editorial.normalAssets[role]
      : { id: file.id, projectId: context.projectId, sha256: file.sha256, bytes: file.bytes, mimeType: file.mimeType, attribution: attribution(view, role) };
    check(metadata, 409, 'reader_media_binding_changed', 'Die normale Artdatei hat keinen vollständigen redaktionellen Medienbeleg.');
    const media = file.url ? publicMedia({ ...metadata, url: file.url })
      : privateMedia(metadata, { ...context, role, speciesId: source.id });
    bindings.push({ metadata, reference: media });
    if (role === 'sound') result.sounds.push(media); else result[role] = media;
  }
  return { media: result, bindings };
}
function galleryMedia(metadata, normal, context) {
  const existing = normal.bindings.find(binding => META.every(key => binding.metadata[key] === metadata[key]));
  // Reuse only the exact six-field source binding. In particular an explicitly
  // public normal file stays that same reference in a later gallery use; no
  // second delivery form or new public URL is inferred from its identifier.
  return existing ? { ...existing.reference } : privateMedia(metadata, { ...context, role: 'gallery' });
}
function general(source, view) {
  return [{ label: 'Wissenschaftlicher Name', value: view.scientificName }, ...GENERAL
    .filter(([key]) => Object.hasOwn(source.input, key) && present(source.input[key]))
    .map(([, label, display]) => ({ label, value: display(view) }))];
}
function status(source, view) {
  return Object.fromEntries([['category', 'Kategorie', 'category'], ['status', 'Status', 'status'],
    ['trend', 'Trend', 'trend'], ['population', 'Populationgröße', 'population']]
    .map(([key, field, display]) => [key, present(source.generated?.[field]) ? view.iucn[display] : '']));
}
function taxonomy(source, view) {
  return [['Kingdom', 'kingdom'], ['Phylum', 'phylum'], ['Subphylum', 'subphylum'], ['Class', 'className'],
    ['Order', 'order'], ['Family', 'family']].filter(([rank]) => present(source.generated?.[rank]))
    .map(([rank, display]) => ({ rank: rank.toLowerCase(), name: view.taxonomy[display] }))
    .concat([{ rank: 'genus', name: source.input.genus }, { rank: 'species', name: view.scientificName }]);
}
function structuredContent(editorial) {
  return { kind: 'structured', title: editorial.title, introduction: editorial.introduction,
    sections: editorial.sections.map(section => ({ id: section.id, kind: section.kind, title: section.title,
      requested: section.requested, blocks: section.blocks, sources: section.sources, intentionallyEmpty: section.emptyDecision !== null })),
    sources: editorial.sources, galleryRequested: editorial.galleryRequested };
}

/** Pure public reader DTO; performs no file, network, authorization or publication action. */
export function projectSpeciesRecordToReader(value, { projectId, resolveMedia } = {}) {
  check(resolveMedia === undefined || typeof resolveMedia === 'function', 400, 'invalid_reader_resolver', 'Der Medienabgleich benötigt einen vertrauenswürdigen synchronen Leser.');
  if (projectId !== undefined) project(projectId);
  if (own(value, 'type') !== SPECIES_RECORD_TYPE) {
    const source = validateCatalogSpecies(value, value.id);
    return validateReaderSpecies({ id: source.id, scientificName: source.scientificName, commonName: source.commonName, taxonomy: source.taxonomy,
      general: [], status: { category: '', status: '', trend: '', population: '' }, websiteUrl: source.websiteUrl ?? null,
      content: { kind: 'legacy-sections', sections: source.sections },
      media: { portrait: source.media.portrait ? publicMedia(source.media.portrait) : null,
        map: source.media.map ? publicMedia(source.media.map) : null, spectrogram: null,
        sounds: source.media.sounds.map(publicMedia), gallery: publicGallery(source.media.gallery) } }, { projectId });
  }
  const source = validateSpeciesRecord(value, value.id), view = projectSpeciesRecordToExplorer({ id: source.id, data: source });
  if (source.schemaVersion === 2) {
    const boundProject = source.editorial.sourceBindings.projectId;
    check(projectId === undefined || projectId === boundProject, 409, 'reader_project_changed', 'Die redaktionelle Artfassung gehört zu einem anderen Projekt.');
    projectId ??= boundProject;
  }
  const context = { projectId, resolveMedia }, normal = normalMedia(source, view, context);
  if (source.schemaVersion === 1) {
    // Catalog1's already public legacy sections (including its historical
    // embedded general text) remain exact. No private registers are new fields,
    // and no prose parser removes or reconstructs values inside old text.
    const legacy = projectSpeciesRecordToCatalog(source);
    return validateReaderSpecies({ id: legacy.id, scientificName: legacy.scientificName, commonName: legacy.commonName, taxonomy: legacy.taxonomy,
      general: general(source, view), status: status(source, view), websiteUrl: legacy.websiteUrl ?? null,
      content: { kind: 'legacy-sections', sections: legacy.sections }, media: { ...normal.media, gallery: publicGallery(legacy.media.gallery) } }, { projectId });
  }
  return validateReaderSpecies({ id: source.id, scientificName: view.scientificName, commonName: view.germanName, taxonomy: taxonomy(source, view),
    general: general(source, view), status: status(source, view), websiteUrl: source.editorial.websiteUrl,
    content: structuredContent(source.editorial), media: { ...normal.media, gallery: source.editorial.gallery.map(image => ({ id: image.id,
      asset: galleryMedia(image.asset, normal, { ...context, speciesId: source.id }), alt: image.alt, caption: image.caption,
      decorative: image.decorative, order: image.order })) } }, { projectId });
}

/** Missing requested uses only; neither registry membership nor permission proof. */
export function readerMediaRequirements(readerSpecies) {
  const media = own(readerSpecies, 'media'), projects = new Set();
  for (const asset of entries(media)) if (own(asset, 'kind') !== 'public-https') projects.add(own(asset, 'projectId'));
  check(projects.size <= 1, 409, 'reader_project_changed', 'Die Leserfassung enthält Medien verschiedener Projekte.');
  const source = validateReaderSpecies(readerSpecies, { projectId: projects.values().next().value });
  const structured = source.content.kind === 'structured', required = [];
  const include = (role, asset, id = asset?.id) => {
    if (asset?.kind === 'unavailable') required.push({ role, id });
  };
  include('portrait', source.media.portrait);
  if (!structured || source.content.sections.some(section => section.kind === 'map-module' && section.requested)) include('map', source.media.map);
  include('spectrogram', source.media.spectrogram);
  for (const sound of source.media.sounds) include('sound', sound);
  if (!structured || source.content.galleryRequested) for (const image of source.media.gallery) include('gallery', image.asset, image.id);
  return required;
}
