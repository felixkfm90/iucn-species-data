import test from 'node:test';
import assert from 'node:assert/strict';
import { imageRegistryReferences } from './media-reference-context.mjs';
import { createImageMediaStore } from './image-media-store.mjs';
import { ProjectError } from './errors.mjs';
import { digest } from './security.mjs';

const id = 'image-11111111-1111-4111-8111-111111111111';
const otherId = 'image-22222222-2222-4222-8222-222222222222';
const asset = (extra = {}) => ({ id, projectId: 'fixture-project', sha256: 'a'.repeat(64), bytes: 123, mimeType: 'image/webp', attribution: 'Eigene Aufnahme', ...extra });
const file = value => Object.fromEntries(['id', 'sha256', 'bytes', 'mimeType'].map(key => [key, value[key]]));
const page = (normal, references = []) => ({ type: 'fn-species-page', schemaVersion: 1,
  document: { species: { normalAssets: { portrait: normal } }, images: references.map((value, index) => ({ id: `usage-${index}`, asset: value })) } });
const record2 = (normal, references = []) => ({ type: 'fn-species-record', schemaVersion: 2,
  assets: { files: normal ? { 'portrait.webp': file(normal) } : {} }, editorial: { normalAssets: { portrait: normal }, gallery: references.map((value, index) => ({ id: `usage-${index}`, asset: value })) } });
const publicFile = (extra = {}) => ({ ...file(asset()), url: 'https://example.org/normal.webp', ...extra });
const record1 = (normal, references = []) => ({ type: 'fn-species-record', schemaVersion: 1,
  assets: { files: { 'portrait.webp': normal } }, editorial: { gallery: references } });
const changed = error => error.code === 'image_media_changed';

test('fixed normal roles retain image-UUID originals without acquiring an image-register requirement', () => {
  for (const data of [page(asset()), record2(asset()), record1(publicFile()), record1(file(asset()))]) assert.deepEqual(imageRegistryReferences(data), []);
});

test('Page and Record2 exact six-field normal aliases preserve multiple uses without register claims', () => {
  for (const source of [page(asset(), [asset(), asset()]), record2(asset(), [asset(), asset()])]) {
    const before = structuredClone(source); assert.deepEqual(imageRegistryReferences(source), []); assert.deepEqual(source, before);
  }
});

test('missing, null, partial, zero-byte, extra-field and wrong-role normal metadata never suppress a gallery reference', () => {
  const normals = [null, undefined, asset({ bytes: 0 }), asset({ mimeType: 'image/png' }), { ...asset(), width: 20 }];
  for (const key of Object.keys(asset())) { const value = asset(); delete value[key]; normals.push(value); }
  for (const normal of normals) assert.deepEqual(imageRegistryReferences(page(normal, [asset()])), [asset()]);
  const unknown = page(null, [asset()]); unknown.document.species.normalAssets.unknownRole = asset();
  assert.deepEqual(imageRegistryReferences(unknown), [asset()]);
});

test('Record2 editorial normal claims also require the actual matching positive fixed-file proof', () => {
  for (const mutate of [data => { data.assets.files = {}; }, data => { data.assets.files = null; },
    data => { data.assets.files['portrait.webp'].sha256 = 'b'.repeat(64); }, data => { data.assets.files['portrait.webp'].bytes = 0; }]) {
    const data = record2(asset(), [asset()]); mutate(data); assert.deepEqual(imageRegistryReferences(data), [asset()]);
  }
});

test('a different gallery proof with the same normal id remains an independent register use', () => {
  for (const delta of [{ sha256: 'b'.repeat(64) }, { attribution: 'Andere Quelle' }, { projectId: 'foreign-project' }, { bytes: 124 }]) {
    const reference = asset(delta); assert.deepEqual(imageRegistryReferences(page(asset(), [asset(), reference])), [reference]);
  }
});

test('two true register references with the same id and differing proofs fail while identical repeated uses are retained', () => {
  assert.deepEqual(imageRegistryReferences(page(null, [asset(), asset()])), [asset(), asset()]);
  for (const delta of [{ sha256: 'b'.repeat(64) }, { attribution: 'Andere Quelle' }, { projectId: 'foreign-project' }, { bytes: 124 }])
    assert.throws(() => imageRegistryReferences(page(asset({ sha256: 'c'.repeat(64) }), [asset(), asset(delta)])), changed);
});

test('Record1 public normal aliases require matching positive url/hash/size/format and exact optional attribution presence', () => {
  const normal = publicFile(), usage = { ...normal, alt: 'Ein Motiv', caption: 'Eine Beschriftung', order: 0 };
  assert.deepEqual(imageRegistryReferences(record1(normal, [usage, { ...usage, alt: 'Zweite Verwendung', order: 1 }])), []);
  const attributed = { ...normal, attribution: 'Quelle' };
  assert.deepEqual(imageRegistryReferences(record1(attributed, [{ ...attributed, alt: 'Motiv', order: 0 }])), []);
  for (const delta of [{ url: 'https://example.org/other.webp' }, { sha256: 'b'.repeat(64) }, { bytes: 124 }, { mimeType: 'image/png' }, { attribution: '' }, { projectId: 'invented-project' }]) {
    const reference = { ...usage, ...delta }; assert.deepEqual(imageRegistryReferences(record1(normal, [reference])), [reference]);
  }
});

test('incomplete public proofs cannot create a Record1 alias exception or hide an actual gallery source conflict', () => {
  const normal = publicFile();
  for (const key of ['url', 'sha256', 'bytes', 'mimeType']) {
    const incomplete = { ...normal }; delete incomplete[key];
    assert.deepEqual(imageRegistryReferences(record1(incomplete, [{ ...normal }])), [normal]);
    assert.deepEqual(imageRegistryReferences(record1(normal, [incomplete])), [incomplete]);
  }
  assert.throws(() => imageRegistryReferences(record1(normal, [publicFile({ url: 'https://example.org/other.webp' }), publicFile({ sha256: 'c'.repeat(64) })])), changed);
});

test('narrow public Catalog1 keeps its historical media-role and prefix checks without a private normal exception', () => {
  const portrait = publicFile(), gallery = publicFile({ id: otherId });
  assert.deepEqual(imageRegistryReferences({ media: { portrait, map: null, sounds: [], gallery: [gallery] } }), [portrait, gallery]);
  assert.deepEqual(imageRegistryReferences({ media: { sounds: [], gallery: [{ ...gallery, id: 'historical-public-id' }] } }), []);
});

test('results are detached and computed fields cannot run while deriving a register proof', () => {
  const source = page(null, [asset()]), output = imageRegistryReferences(source); output[0].sha256 = 'b'.repeat(64);
  assert.equal(source.document.images[0].asset.sha256, 'a'.repeat(64));
  let calls = 0; const value = asset(); Object.defineProperty(value, 'sha256', { enumerable: true, get() { calls++; return 'a'.repeat(64); } });
  assert.throws(() => imageRegistryReferences(page(null, [value]))); assert.equal(calls, 0);
});

test('actual image-store reference guard never looks up normal-only or exact alias ids but still checks a different gallery source', () => {
  let lookups = 0;
  const store = createImageMediaStore({ db: { prepare(sql) {
    if (sql.includes('FROM image_media_assets')) return { get() { lookups++; return undefined; } };
    if (sql.includes('FROM meta')) return { get() { return { value: 'fixture-project' }; } };
    throw new Error('Unexpected reference-guard fixture query');
  } } });
  store.assertReferences(record1(publicFile())); store.assertReferences(page(asset(), [asset()])); store.assertReferences(record2(asset(), [asset()]));
  assert.equal(lookups, 0);
  assert.throws(() => store.assertReferences(page(asset(), [asset({ sha256: 'b'.repeat(64) })])), error => error.code === 'image_media_not_found');
  assert.equal(lookups, 1);
});

test('a real media_busy decoder gate is preserved and ordinary decode failures remain invalid-image errors', async () => {
  const bytes = Buffer.from('synthetic opaque bytes'), metadata = asset({ bytes: bytes.length, sha256: digest(bytes), mimeType: 'image/png' });
  const busy = new ProjectError(429, 'media_busy', 'Synthetic shared gate is busy.'); let decodeError = busy;
  const store = createImageMediaStore({ actor: () => ({ id: 'fixture-user', role: 'admin', version: 1 }), decode: async () => { throw decodeError; },
    db: { prepare(sql) {
      if (sql.includes('FROM meta')) return { get() { return { value: metadata.projectId }; } };
      if (sql.includes('FROM image_media_assets')) return { get() { return { id: metadata.id, project_id: metadata.projectId, sha256: metadata.sha256,
        bytes: metadata.bytes, mime_type: metadata.mimeType, attribution: metadata.attribution, blob_sha256: null }; } };
      throw new Error('Unexpected decoder-gate fixture query');
    } } });
  const options = { expectedBinding: { projectId: metadata.projectId, userId: 'fixture-user', role: 'admin' }, mimeType: metadata.mimeType };
  await assert.rejects(store.put('fixture-token', id, bytes, options), error => error === busy);
  decodeError = new Error('Synthetic invalid decoder output');
  await assert.rejects(store.put('fixture-token', id, bytes, options), error => error.code === 'invalid_image_media' && error.status === 400);
});
