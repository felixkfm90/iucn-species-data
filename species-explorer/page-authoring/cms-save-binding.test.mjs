import test from 'node:test';
import assert from 'node:assert/strict';
import { createCmsContentSteps } from './cms-content-steps.mjs';
import { createCmsReadbackExpectation } from './cms-readback.mjs';
import { assertCmsSaveReadback, validateCmsSaveBinding } from './cms-save-binding.mjs';
import { composePage } from './compose.mjs';
import { fingerprint } from './contract.mjs';
import { initialDocument, normalizeSpeciesSnapshot } from './model.mjs';

const invalid = { code: 'cms_save_binding_invalid', status: 400 };
const mismatch = { code: 'cms_save_binding_mismatch', status: 409 };
const collection = '1'.repeat(24);
const section = '2'.repeat(24);
const firstAsset = '11111111-2222-4333-8444-555555555555';
const secondAsset = '22222222-3333-4444-8555-666666666666';

function fixture({ originals = ['c', 'c'], sectionId = section } = {}) {
  const projectId = 'test-project', slug = 'test-art';
  const species = normalizeSpeciesSnapshot({ slug, commonName: 'Testart', scientificName: 'Testus test', taxonomy: [], general: [], status: '',
    revision: 'species-a', dataSha256: 'a'.repeat(64), runtimeReady: false,
    normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null } }, projectId, slug);
  const document = initialDocument({ templateId: 'fn-compact-20261031', species, parentPath: '/wildlife/heimische-tierwelt', title: 'Testart' });
  document.images = originals.map((hash, index) => {
    const assetId = `asset-${index + 1}`;
    return { id: `usage-${index + 1}`, assetId, alt: `Alttext ${index + 1}`, caption: '', decorative: false,
      asset: { id: assetId, projectId, sha256: hash.repeat(64), bytes: 123, mimeType: 'image/png', attribution: '' } };
  });
  const structure = composePage({ id: 'draft-a', revision: fingerprint('revision'), document }, new Map()).structure;
  const payload = { schemaVersion: 2, target: { path: structure.path }, structure, publish: false,
    readback: { schemaVersion: 1, expectation: createCmsReadbackExpectation(document, structure) } };
  const plan = { ...payload, planHash: fingerprint(payload) };
  const attempt = { id: 'attempt-a', dispatchId: 'dispatch-a' };
  const mediaBindings = structure.slots.find(slot => slot.type === 'gallery').items.map((image, index) => ({
    usageId: image.id, assetId: image.assetId, sha256: image.sha256, bytes: image.bytes, mimeType: image.mimeType,
    cmsAssetId: firstAsset, cmsItemId: `fn-figure-${String(index + 1).padStart(24, '0')}`,
  }));
  const blockIds = createCmsContentSteps(plan).filter(step => step.kind !== 'gallery' || mediaBindings.length > 0)
    .map((_step, index) => `block-${String(index + 1).padStart(24, '0')}`);
  const binding = { schemaVersion: 1, attemptId: attempt.id, dispatchId: attempt.dispatchId, planHash: plan.planHash,
    pageId: collection, path: structure.path, sectionId, blockIds, mediaBindings };
  return { binding, attempt, plan, readback: { page: { id: collection, path: structure.path } } };
}

test('copies the full checkpoint and allows the same CMS original for distinct approved usages of identical bytes', () => {
  const { binding, ...context } = fixture();
  binding.blockIds[0] = 'block-yui_3_17_2_1_1760000000000_521';
  binding.blockIds[1] = `block-${'c'.repeat(20)}`;
  const verified = validateCmsSaveBinding(binding, context);
  assert.deepEqual(verified, binding);
  assert.notEqual(verified.blockIds, binding.blockIds);
  assert.notEqual(verified.mediaBindings[0], binding.mediaBindings[0]);
  assert.equal(verified.mediaBindings[0].cmsAssetId, verified.mediaBindings[1].cmsAssetId);
});

test('an empty approved gallery has no CMS gallery block or image bindings', () => {
  const { binding, ...context } = fixture({ originals: [], sectionId: null });
  assert.deepEqual(validateCmsSaveBinding(binding, context), binding);
  assert.doesNotThrow(() => assertCmsSaveReadback(binding, context.readback, []));
  assert.throws(() => validateCmsSaveBinding({ ...binding, blockIds: [...binding.blockIds, `block-${'f'.repeat(24)}`] }, context), mismatch);
});

test('rejects a different attempt, dispatch, approved plan or path and a wrong physical block count', () => {
  const { binding, ...context } = fixture();
  for (const change of [
    { attemptId: 'another-attempt' }, { dispatchId: 'another-dispatch' }, { planHash: '9'.repeat(64) },
    { path: '/wildlife/heimische-tierwelt/andere-art' }, { blockIds: binding.blockIds.slice(1) },
    { blockIds: binding.blockIds.map(() => binding.blockIds[0]) },
  ]) assert.throws(() => validateCmsSaveBinding({ ...binding, ...change }, context), mismatch);
});

test('requires the approved order, original metadata and distinct figure identifiers', () => {
  const { binding, ...context } = fixture();
  const [first, second] = binding.mediaBindings;
  for (const mediaBindings of [
    [second, first], [first], [first, { ...second, cmsItemId: first.cmsItemId }],
    [first, { ...second, usageId: first.usageId }], [first, { ...second, assetId: first.assetId }],
    [first, { ...second, sha256: 'd'.repeat(64) }], [first, { ...second, bytes: second.bytes + 1 }],
    [first, { ...second, mimeType: 'image/webp' }],
  ]) assert.throws(() => validateCmsSaveBinding({ ...binding, mediaBindings }, context), mismatch);

  const different = fixture({ originals: ['c', 'd'] });
  assert.throws(() => validateCmsSaveBinding(different.binding, different), mismatch);
  different.binding.mediaBindings[1].cmsAssetId = secondAsset;
  assert.deepEqual(validateCmsSaveBinding(different.binding, different), different.binding);
});

test('rejects foreign fields, invalid IDs, sparse or decorated lists and accessors without evaluating them', () => {
  const { binding, ...context } = fixture();
  const throwGetter = () => { throw new Error('an accessor ran'); };
  const sparse = binding.blockIds.slice();
  delete sparse[0];
  const accessor = binding.mediaBindings.slice();
  Object.defineProperty(accessor, '0', { enumerable: true, get: throwGetter });
  const hidden = Object.defineProperty({ ...binding }, 'hidden', { value: 'unsupported' });
  const proxy = new Proxy(binding, { ownKeys: throwGetter, getPrototypeOf: throwGetter });
  for (const malformed of [
    { ...binding, schemaVersion: 2 }, { ...binding, pageId: 'foreign' }, { ...binding, pageId: `${collection}\n` },
    { ...binding, sectionId: false }, { ...binding, blockIds: ['arbitrary-id', ...binding.blockIds.slice(1)] },
    { ...binding, blockIds: sparse }, { ...binding, mediaBindings: accessor }, hidden, proxy,
    { ...binding, [Symbol('extra')]: true },
    { ...binding, mediaBindings: [{ ...binding.mediaBindings[0], sourceUrl: 'https://example.org/image.jpg' }, binding.mediaBindings[1]] },
    { ...binding, mediaBindings: [{ ...binding.mediaBindings[0], cmsAssetId: 'invalid' }, binding.mediaBindings[1]] },
    { ...binding, mediaBindings: [{ ...binding.mediaBindings[0], cmsItemId: `fn-figure-${'a'.repeat(23)}` }, binding.mediaBindings[1]] },
  ]) assert.throws(() => validateCmsSaveBinding(malformed, context), invalid);
});

test('a verified readback must name the concrete bound page and the same ordered CMS image mappings', () => {
  const f = fixture();
  const binding = validateCmsSaveBinding(f.binding, f);
  const observed = structuredClone(binding.mediaBindings);
  assert.doesNotThrow(() => assertCmsSaveReadback(binding, f.readback, observed));
  assert.throws(() => assertCmsSaveReadback(binding, { page: { ...f.readback.page, id: 'f'.repeat(24) } }, observed), mismatch);
  assert.throws(() => assertCmsSaveReadback(binding, { page: { ...f.readback.page, path: '/wildlife/heimische-tierwelt/andere-art' } }, observed), mismatch);
  assert.throws(() => assertCmsSaveReadback(binding, f.readback, observed.slice().reverse()), mismatch);
  assert.throws(() => assertCmsSaveReadback(binding, f.readback, [{ ...observed[0], cmsAssetId: secondAsset }, observed[1]]), mismatch);
  assert.throws(() => assertCmsSaveReadback(binding, f.readback, [{ ...observed[0], cmsItemId: `fn-figure-${'f'.repeat(24)}` }, observed[1]]), mismatch);
  assert.throws(() => assertCmsSaveReadback(binding, { get page() { throw new Error('an accessor ran'); } }, observed), invalid);
});
