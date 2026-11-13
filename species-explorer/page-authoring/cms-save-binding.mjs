import { isDeepStrictEqual } from 'node:util';
import { isProxy } from 'node:util/types';
import { createCmsContentSteps } from './cms-content-steps.mjs';
import { cmsTargetPath } from './cms-dispatch.mjs';
import { check, digest, identifier, PageAuthoringError } from './contract.mjs';

const bindingKeys = ['schemaVersion', 'attemptId', 'dispatchId', 'planHash', 'pageId', 'path', 'sectionId', 'blockIds', 'mediaBindings'];
const imageKeys = ['usageId', 'assetId', 'sha256', 'bytes', 'mimeType', 'cmsAssetId', 'cmsItemId'];
const collectionId = /^[a-f0-9]{24}$/;
const blockId = /^block-(?:[a-f0-9]{20}|[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/;
const cmsAssetId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const cmsItemId = /^fn-figure-[a-f0-9]{24}$/;
const mimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxBlocks = 1000;
const maxImages = 200;
const maxImageBytes = 32 * 1024 * 1024;

const invalid = condition => check(condition, 'cms_save_binding_invalid',
  'Die Zuordnung für die spätere Squarespace-Speicherprüfung ist ungültig oder unvollständig.');
const matches = condition => check(condition, 'cms_save_binding_mismatch',
  'Die Squarespace-Seite oder Bildzuordnung gehört nicht zum gebundenen Speicherversuch.', 409);

function plainRecord(value) {
  invalid(value && typeof value === 'object' && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype);
  return value;
}

function ownData(value, key) {
  const property = Object.getOwnPropertyDescriptor(value, key);
  invalid(property?.enumerable && Object.hasOwn(property, 'value'));
  return property.value;
}

function record(value, keys) {
  plainRecord(value);
  invalid(Reflect.ownKeys(value).length === keys.length);
  return Object.fromEntries(keys.map(key => [key, ownData(value, key)]));
}

function list(value, maxLength, read) {
  invalid(Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Array.prototype);
  const { length } = value;
  invalid(length <= maxLength && Reflect.ownKeys(value).length === length + 1);
  return Array.from({ length }, (_, index) => read(ownData(value, String(index))));
}

function primitive(validate, value) {
  try { return validate(value); }
  catch (error) {
    if (error instanceof PageAuthoringError) invalid(false);
    throw error;
  }
}

function matchesId(value, pattern) {
  return typeof value === 'string' && pattern.test(value);
}

function imageBinding(raw) {
  const image = record(raw, imageKeys);
  primitive(identifier, image.usageId);
  primitive(identifier, image.assetId);
  primitive(digest, image.sha256);
  invalid(Number.isSafeInteger(image.bytes) && image.bytes > 0 && image.bytes <= maxImageBytes
    && mimeTypes.includes(image.mimeType) && matchesId(image.cmsAssetId, cmsAssetId) && matchesId(image.cmsItemId, cmsItemId));
  return image;
}

/** Validate and copy the private checkpoint against the exact journal attempt and sealed plan payload. */
export function validateCmsSaveBinding(raw, { attempt, plan } = {}) {
  const binding = record(raw, bindingKeys);
  const attemptId = primitive(identifier, binding.attemptId);
  const dispatchId = primitive(identifier, binding.dispatchId);
  const planHash = primitive(digest, binding.planHash);
  const path = primitive(cmsTargetPath, binding.path);
  invalid(binding.schemaVersion === 1 && matchesId(binding.pageId, collectionId)
    && (binding.sectionId === null || matchesId(binding.sectionId, collectionId)));
  matches(attemptId === attempt?.id && dispatchId === attempt?.dispatchId && planHash === plan?.planHash && path === plan?.target?.path);

  const steps = createCmsContentSteps(plan);
  const gallery = steps.find(step => step.kind === 'gallery');
  const planned = plan.structure.slots[gallery.slotIndex].items;
  const blockIds = list(binding.blockIds, maxBlocks, id => {
    invalid(matchesId(id, blockId));
    return id;
  });
  matches(blockIds.length === steps.length - Number(planned.length === 0) && new Set(blockIds).size === blockIds.length);

  const mediaBindings = list(binding.mediaBindings, maxImages, imageBinding);
  matches(mediaBindings.length === planned.length);
  const itemIds = new Set(), usageIds = new Set(), assets = new Map();
  for (const [index, image] of mediaBindings.entries()) {
    const approved = planned[index];
    const { usageId, assetId, sha256, bytes, mimeType, cmsAssetId: asset, cmsItemId: item } = image;
    const physical = { sha256, bytes, mimeType };
    matches(usageId === approved.id && assetId === approved.assetId && sha256 === approved.sha256
      && bytes === approved.bytes && mimeType === approved.mimeType && !itemIds.has(item) && !usageIds.has(usageId)
      && (!assets.has(asset) || isDeepStrictEqual(assets.get(asset), physical)));
    itemIds.add(item);
    usageIds.add(usageId);
    assets.set(asset, physical);
  }
  return { ...binding, blockIds, mediaBindings };
}

/** Bind an independently verified CMS observation to the validated checkpoint. */
export function assertCmsSaveReadback(binding, readback, mediaBindings) {
  const expected = record(binding, bindingKeys);
  const page = plainRecord(ownData(plainRecord(readback), 'page'));
  matches(ownData(page, 'id') === expected.pageId && ownData(page, 'path') === expected.path);
  const expectedImages = list(expected.mediaBindings, maxImages, imageBinding);
  const observedImages = list(mediaBindings, maxImages, imageBinding);
  matches(isDeepStrictEqual(observedImages, expectedImages));
}
