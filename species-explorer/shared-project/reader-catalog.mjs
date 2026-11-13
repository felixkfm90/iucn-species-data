import { isProxy } from 'node:util/types';
import { check } from './errors.mjs';
import { canonicalJson } from './security.mjs';
import { validateCatalogSpecies, validatePublicCatalogUrl } from './catalog.mjs';
import { identifier, text, sourceBinding } from '../page-authoring/contract.mjs';
import { normalizeBlocks, hasContent } from '../page-authoring/model.mjs';

const ART_BYTES = 4 * 1024 * 1024, CATALOG_BYTES = 8 * 1024 * 1024;
const IMAGE_BYTES = 20 * 1024 * 1024, NORMAL_BYTES = 100 * 1024 * 1024;
const LIMITS = { maxBytes: ART_BYTES, maxNodes: 300000 };
const CODE = 'invalid_reader_catalog';
const MESSAGE = 'Der lesende Artenbestand enthält ungültige, unvollständige oder interne Daten.';
const ASSET_KEYS = ['id', 'projectId', 'sha256', 'bytes', 'mimeType', 'attribution'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const HASH = /^[a-f0-9]{64}$/;
const IMAGE_ID = /^image-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const canonical = value => canonicalJson(value, LIMITS);
const valid = condition => check(condition, 400, CODE, MESSAGE);

function plain(value, array = false) {
  valid(value && typeof value === 'object' && !isProxy(value) && Array.isArray(value) === array
    && Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
  return Object.getOwnPropertyDescriptors(value);
}
function exact(value, required, optional = []) {
  const descriptors = plain(value), keys = Reflect.ownKeys(descriptors);
  valid(required.every(key => Object.hasOwn(descriptors, key)) && keys.every(key => typeof key === 'string'
    && [...required, ...optional].includes(key) && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value')));
}
function dense(value, maximum) {
  const descriptors = plain(value, true), length = descriptors.length.value, keys = Reflect.ownKeys(descriptors);
  valid(length <= maximum && keys.length === length + 1 && keys.every(key => key === 'length'
    || typeof key === 'string' && /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < length
      && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value')));
}
function contextProject(options, required = false) {
  exact(options, [], ['projectId']);
  const value = options.projectId;
  if (value === undefined && !required) return undefined;
  return identifier(value);
}

// Inspect descriptors before reading values, and count exact serialized UTF-8
// bytes while copying. No getter/toJSON/Proxy can turn a claim into other data.
function cloneData(input) {
  let nodes = 0, bytes = 0;
  function add(token) {
    bytes += Buffer.byteLength(token);
    check(bytes <= ART_BYTES, 413, 'reader_species_too_large', 'Eine Art überschreitet die zulässige Leserfassung.');
  }
  function visit(value, depth) {
    valid(depth <= 32);
    check(++nodes <= LIMITS.maxNodes, 413, 'reader_species_too_large', 'Eine Art überschreitet die zulässige Leserstruktur.');
    if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) {
      add(JSON.stringify(value)); return value;
    }
    valid(value && typeof value === 'object' && !isProxy(value));
    if (Array.isArray(value)) {
      dense(value, LIMITS.maxNodes); add('[');
      const descriptors = Object.getOwnPropertyDescriptors(value), output = [];
      for (let index = 0; index < value.length; index++) {
        if (index) add(','); output.push(visit(descriptors[index].value, depth + 1));
      }
      add(']'); return output;
    }
    const descriptors = plain(value), keys = Reflect.ownKeys(descriptors), output = {};
    add('{');
    for (const [index, key] of keys.entries()) {
      valid(typeof key === 'string' && !['__proto__', 'prototype', 'constructor'].includes(key)
        && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'));
      if (index) add(','); add(JSON.stringify(key)); add(':');
      output[key] = visit(descriptors[key].value, depth + 1);
    }
    add('}'); return output;
  }
  return visit(input, 0);
}
function unchanged(value, normalized) { valid(canonical(value) === canonical(normalized)); }
function sources(value, maximum) {
  valid(Array.isArray(value) && value.length <= maximum);
  for (const source of value) unchanged(source, sourceBinding(source));
}
function catalogShape(value, sections = []) {
  return validateCatalogSpecies({ id: value.id, scientificName: value.scientificName, commonName: value.commonName,
    taxonomy: value.taxonomy, sections, media: { sounds: [], gallery: [] } });
}

function media(value, projectId) {
  valid(value && typeof value === 'object' && !Array.isArray(value));
  if (value.kind === 'public-https') {
    exact(value, ['kind', 'id', 'url'], ['bytes', 'sha256', 'mimeType', 'attribution']);
    const { kind, ...reference } = value;
    const normalized = validateCatalogSpecies({ id: 'reader-media', scientificName: 'Reader media', commonName: '',
      taxonomy: [], sections: [], media: { sounds: [reference], gallery: [] } }).media.sounds[0];
    unchanged(reference, normalized);
    if (value.bytes !== undefined) valid(value.bytes <= (value.mimeType?.startsWith('image/') ? IMAGE_BYTES : NORMAL_BYTES));
    return value;
  }
  valid(['project-image', 'project-normal', 'unavailable'].includes(value.kind));
  exact(value, ['kind', ...ASSET_KEYS, ...(value.kind === 'project-normal' ? ['contentId'] : []),
    ...(value.kind === 'unavailable' ? ['reason'] : [])]);
  identifier(value.id); identifier(value.projectId);
  valid(projectId !== undefined && value.projectId === projectId && typeof value.sha256 === 'string' && HASH.test(value.sha256));
  valid(Number.isSafeInteger(value.bytes) && value.bytes >= (value.kind === 'unavailable' ? 0 : 1)
    && [ ...IMAGE_MIMES, 'audio/mpeg' ].includes(value.mimeType));
  valid(value.bytes <= (value.mimeType.startsWith('image/') ? IMAGE_BYTES : NORMAL_BYTES));
  text(value.attribution, 8000, true);
  if (value.kind === 'project-image') valid(IMAGE_ID.test(value.id) && IMAGE_MIMES.includes(value.mimeType));
  if (value.kind === 'project-normal') valid(typeof value.contentId === 'string' && /^normal-[a-f0-9]{64}$/.test(value.contentId));
  if (value.kind === 'unavailable') valid(value.reason === 'not-provided');
  return value;
}

/** Validate one reference, not actual bytes, registry membership or a URL to a private endpoint. */
export function validateReaderMedia(input, options = {}) {
  const value = cloneData(input), projectId = contextProject(options);
  valid(value && typeof value === 'object' && !Array.isArray(value));
  return media(value, projectId);
}

function content(value) {
  valid(value && typeof value === 'object' && !Array.isArray(value));
  if (value.kind === 'legacy-sections') {
    exact(value, ['kind', 'sections']);
    return;
  }
  valid(value.kind === 'structured');
  exact(value, ['kind', 'title', 'introduction', 'sections', 'sources', 'galleryRequested']);
  text(value.title, 300); unchanged(value.introduction, normalizeBlocks(value.introduction));
  valid(Array.isArray(value.sections) && value.sections.length >= 2 && value.sections.length <= 100 && typeof value.galleryRequested === 'boolean');
  for (const [index, section] of value.sections.entries()) {
    exact(section, ['id', 'kind', 'title', 'requested', 'blocks', 'sources', 'intentionallyEmpty']);
    identifier(section.id); text(section.title, 300);
    valid(section.kind === (index === 0 ? 'general-module' : index === value.sections.length - 1 ? 'map-module' : 'editorial')
      && typeof section.requested === 'boolean' && typeof section.intentionallyEmpty === 'boolean');
    unchanged(section.blocks, normalizeBlocks(section.blocks)); sources(section.sources, 30);
    valid(!section.intentionallyEmpty || !hasContent(section.blocks));
  }
  valid(new Set(value.sections.map(section => section.id)).size === value.sections.length);
  sources(value.sources, 100);
}

/** Strict ReaderCatalog 2 species. Internal source/actor/approval claims are not fields of this DTO. */
export function validateReaderSpecies(input, options = {}) {
  const value = cloneData(input), projectId = contextProject(options);
  exact(value, ['id', 'scientificName', 'commonName', 'taxonomy', 'general', 'status', 'websiteUrl', 'content', 'media']);
  content(value.content);
  const base = catalogShape(value, value.content.kind === 'legacy-sections' ? value.content.sections : []);
  unchanged(value.taxonomy, base.taxonomy);
  if (value.content.kind === 'legacy-sections') unchanged(value.content.sections, base.sections);
  if (value.websiteUrl !== null) validatePublicCatalogUrl(value.websiteUrl);
  valid(Array.isArray(value.general) && value.general.length <= 30);
  for (const entry of value.general) { exact(entry, ['label', 'value']); text(entry.label, ART_BYTES); text(entry.value, ART_BYTES, true); }
  exact(value.status, ['category', 'status', 'trend', 'population']);
  for (const entry of Object.values(value.status)) text(entry, ART_BYTES, true);
  exact(value.media, ['portrait', 'map', 'spectrogram', 'sounds', 'gallery']);
  valid(Array.isArray(value.media.sounds) && value.media.sounds.length <= 500 && Array.isArray(value.media.gallery) && value.media.gallery.length <= 500);
  const bindings = new Map();
  function bind(reference, role) {
    media(reference, projectId);
    if (reference.mimeType !== undefined) valid(reference.mimeType.startsWith(role === 'image' ? 'image/' : 'audio/'));
    if (role === 'image' && reference.bytes !== undefined) valid(reference.bytes <= IMAGE_BYTES);
    const serialized = canonical(reference);
    valid(!bindings.has(reference.id) || bindings.get(reference.id) === serialized); bindings.set(reference.id, serialized);
  }
  for (const role of ['portrait', 'map', 'spectrogram']) if (value.media[role] !== null) bind(value.media[role], 'image');
  for (const sound of value.media.sounds) bind(sound, 'sound');
  valid(new Set(value.media.sounds.map(sound => sound.id)).size === value.media.sounds.length);
  for (const [index, image] of value.media.gallery.entries()) {
    exact(image, ['id', 'asset', 'alt', 'caption', 'decorative', 'order']);
    identifier(image.id); bind(image.asset, 'image'); text(image.alt, 3000, true); text(image.caption, 3000, true);
    valid(typeof image.decorative === 'boolean' && (!image.decorative || image.alt === '') && image.order === index);
  }
  valid(new Set(value.media.gallery.map(image => image.id)).size === value.media.gallery.length);
  return value;
}

/** Complete bounded envelope; HTTP paging belongs to the caller and is never fabricated here. */
export function buildReaderCatalog(input) {
  exact(input, ['projectId', 'revision', 'generatedAt', 'species']);
  const projectId = identifier(input.projectId), revision = input.revision, generatedAt = input.generatedAt;
  valid((typeof revision === 'string' || Number.isSafeInteger(revision)) && String(revision).length > 0 && String(revision).length <= 120
    && typeof generatedAt === 'string' && !Number.isNaN(Date.parse(generatedAt)) && new Date(generatedAt).toISOString() === generatedAt);
  dense(input.species, 100000);
  const result = { schemaVersion: 2, projectId, revision: String(revision), generatedAt, species: [] };
  let bytes = Buffer.byteLength(JSON.stringify(result)); const ids = new Set();
  for (const inputSpecies of input.species) {
    const entry = validateReaderSpecies(inputSpecies, { projectId });
    valid(!ids.has(entry.id)); ids.add(entry.id);
    bytes += Buffer.byteLength(JSON.stringify(entry)) + (result.species.length ? 1 : 0);
    check(bytes <= CATALOG_BYTES, 413, 'reader_catalog_paging_required', 'Der lesende Artenbestand benötigt einen paginierten Abruf. Es wurde nichts gekürzt.');
    result.species.push(entry);
  }
  result.species.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}
