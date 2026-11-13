import { isProxy } from 'node:util/types';
import { check } from './errors.mjs';
import { canonicalJson } from './security.mjs';
import { validatePublicCatalogUrl } from './catalog.mjs';

const IMAGE_ID = /^image-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const META = ['id', 'projectId', 'sha256', 'bytes', 'mimeType', 'attribution'];
const PUBLIC_META = ['id', 'url', 'sha256', 'bytes', 'mimeType'];
const NORMAL_IMAGES = { portrait: ['portrait.webp', 'image/webp'], map: ['map.jpg', 'image/jpeg'], spectrogram: ['spectrogram.webp', 'image/webp'] };
const identity = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
const changed = condition => check(condition, 409, 'image_media_changed', 'Dieselbe Bildkennung verweist auf unterschiedliche Quellenbelege.');

function plain(value) { return Boolean(value && typeof value === 'object' && !isProxy(value) && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype); }
function own(value, key) {
  if (value === undefined || value === null) return undefined;
  check(plain(value), 400, 'invalid_image_media', 'Der Medienkontext muss aus reinen Daten bestehen.');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  check(!descriptor || descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 400, 'invalid_image_media', 'Berechnete Medienfelder sind nicht zulässig.');
  return descriptor?.value;
}
function array(value) {
  if (value === undefined || value === null) return [];
  check(Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Array.prototype,
    400, 'invalid_image_media', 'Die Bildverwendungen benötigen eine eindeutige Liste.');
  const descriptors = Object.getOwnPropertyDescriptors(value), result = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[index];
    check(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 400, 'invalid_image_media', 'Die Bildliste enthält einen unvollständigen oder berechneten Eintrag.');
    result.push(descriptor.value);
  }
  return result;
}
function keys(value, required, optional = []) {
  if (!plain(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(descriptors);
  return required.every(key => Object.hasOwn(descriptors, key)) && actual.every(key => typeof key === 'string'
    && [...required, ...optional].includes(key) && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'));
}
function fileProof(value, mimeType) {
  return plain(value) && identity(own(value, 'id')) && Number.isSafeInteger(own(value, 'bytes')) && value.bytes > 0
    && typeof own(value, 'sha256') === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) && own(value, 'mimeType') === mimeType;
}
function fullNormal(value, mimeType) {
  return keys(value, META) && fileProof(value, mimeType) && identity(value.projectId)
    && typeof value.attribution === 'string' && value.attribution.length <= 8000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value.attribution);
}
function normalBindings(normalAssets, files) {
  const result = [];
  for (const [role, [filename, mimeType]] of Object.entries(NORMAL_IMAGES)) {
    const metadata = own(normalAssets, role);
    if (!fullNormal(metadata, mimeType)) continue;
    if (files !== undefined) {
      const file = own(files, filename);
      if (!fileProof(file, mimeType) || !['id', 'sha256', 'bytes', 'mimeType'].every(key => file[key] === metadata[key])) continue;
    }
    result.push(metadata);
  }
  return result;
}
function publicBinding(value, mimeType, gallery = false) {
  if (!keys(value, PUBLIC_META, ['attribution', ...(gallery ? ['alt', 'caption', 'order'] : [])]) || !fileProof(value, mimeType)) return false;
  if (Object.hasOwn(value, 'attribution') && (typeof value.attribution !== 'string' || value.attribution.length > 8000)) return false;
  try { validatePublicCatalogUrl(value.url); return true; } catch { return false; }
}
function publicNormalAlias(reference, files) {
  for (const [filename, mimeType] of Object.values(NORMAL_IMAGES)) {
    const file = own(files, filename);
    if (!publicBinding(file, mimeType) || !publicBinding(reference, mimeType, true)) continue;
    if (PUBLIC_META.every(key => reference[key] === file[key]) && Object.hasOwn(reference, 'attribution') === Object.hasOwn(file, 'attribution')
      && reference.attribution === file.attribution) return true;
  }
  return false;
}

/** Actual image-registry uses only; original normal-file IDs are a separate domain. No I/O or availability/permission grant. */
export function imageRegistryReferences(data) {
  const type = own(data, 'type'), version = own(data, 'schemaVersion');
  let candidates = [], aliases = [], publicFiles;
  if (type === 'fn-species-page') {
    const document = own(data, 'document'); candidates = array(own(document, 'images')).map(image => own(image, 'asset'));
    if (version === 1) aliases = normalBindings(own(own(document, 'species'), 'normalAssets'));
  } else if (type === 'fn-species-record') {
    const editorial = own(data, 'editorial'), files = own(own(data, 'assets'), 'files');
    if (version === 2) {
      candidates = array(own(editorial, 'gallery')).map(usage => own(usage, 'asset'));
      // A six-field editorial claim without its actual fixed file proof cannot
      // create an exception. The ordinary record validator remains authoritative.
      aliases = files === undefined ? [] : normalBindings(own(editorial, 'normalAssets'), files);
    } else {
      candidates = array(own(editorial, 'gallery'));
      if (version === 1) publicFiles = files;
    }
  } else {
    // Historical narrow Catalog1 objects have no fixed private normal-file
    // context. Keep their previous public media-role/prefix checks unchanged.
    const media = own(data, 'media'); candidates = [own(media, 'portrait'), own(media, 'map'), ...array(own(media, 'sounds')), ...array(own(media, 'gallery'))];
  }
  const references = [], managed = new Map();
  for (const candidate of candidates) {
    if (!candidate || typeof own(candidate, 'id') !== 'string' || !IMAGE_ID.test(candidate.id)) continue;
    const reference = {};
    for (const key of Reflect.ownKeys(Object.getOwnPropertyDescriptors(candidate))) {
      check(typeof key === 'string' && !['__proto__', 'prototype', 'constructor'].includes(key), 400, 'invalid_image_media', 'Ungültiger Medienbeleg.');
      const value = own(candidate, key);
      check(value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value),
        400, 'invalid_image_media', 'Der Medienbeleg muss aus eindeutigen flachen Daten bestehen.');
      reference[key] = value;
    }
    if (keys(reference, META) && aliases.some(metadata => META.every(key => reference[key] === metadata[key]))) continue;
    if (publicFiles !== undefined && publicNormalAlias(reference, publicFiles)) continue;
    // Compare only file/source fields. Per-use alt/caption/order are distinct
    // human decisions and must not make repeated uses of one file conflict.
    const proof = Object.fromEntries([...META, 'url'].filter(key => Object.hasOwn(reference, key)).map(key => [key, own(reference, key)]));
    const serialized = canonicalJson(proof), previous = managed.get(reference.id);
    changed(previous === undefined || previous === serialized); managed.set(reference.id, serialized);
    references.push(JSON.parse(canonicalJson(reference)));
  }
  return references;
}
