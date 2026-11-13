import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReaderMedia, validateReaderSpecies, buildReaderCatalog } from './reader-catalog.mjs';
import { validateCatalogSpecies } from './catalog.mjs';

const projectId = 'reader-project', sha = 'a'.repeat(64), otherSha = 'b'.repeat(64);
const IMAGE_BYTES = 20 * 1024 * 1024, NORMAL_BYTES = 100 * 1024 * 1024;
const context = { projectId }, denied = code => error => error.code === code;
const clone = value => structuredClone(value);
function metadata(changes = {}) {
  return { id: 'image-11111111-1111-4111-8111-111111111111', projectId, sha256: sha,
    bytes: 321, mimeType: 'image/png', attribution: 'Eigene Aufnahme „Original“', ...changes };
}
const projectImage = changes => ({ kind: 'project-image', ...metadata(changes) });
const normal = changes => ({ kind: 'project-normal', ...metadata({ id: 'fixture:portrait', ...changes }), contentId: `normal-${sha}` });
const unavailable = changes => ({ kind: 'unavailable', ...metadata({ id: 'fixture:missing', bytes: 0, ...changes }), reason: 'not-provided' });
const publicMedia = changes => ({ kind: 'public-https', id: 'public-photo', url: 'https://images.example.org/photo.jpg', ...changes });
function richContent() {
  const source = { id: 'field-source', label: 'Quelle „Original“', url: 'https://example.org/source', sha256: sha };
  return { kind: 'structured', title: 'Testkauz – vorhandener Titel',
    introduction: [{ type: 'paragraph', text: 'Unveränderte Einleitung' }],
    sections: [
      { id: 'general', kind: 'general-module', title: 'Allgemein', requested: false, blocks: [], sources: [], intentionallyEmpty: false },
      { id: 'appearance', kind: 'editorial', title: 'Aussehen', requested: true,
        blocks: [{ type: 'heading', level: 5, text: 'Kennzeichen' }, { type: 'bullet-list', items: ['Erster Punkt', 'Zweiter Punkt'] },
          { type: 'numbered-list', items: ['Nummer eins', 'Nummer zwei'] }], sources: [clone(source)], intentionallyEmpty: false },
      { id: 'food', kind: 'editorial', title: 'Nahrung', requested: true, blocks: [], sources: [], intentionallyEmpty: true },
      { id: 'map', kind: 'map-module', title: 'Verbreitungskarte', requested: false, blocks: [], sources: [], intentionallyEmpty: false },
    ], sources: [source], galleryRequested: false };
}
function species(id = 'fixture-owl') {
  const asset = projectImage();
  return { id, scientificName: 'Strix fixture', commonName: 'Testkauz',
    taxonomy: [{ rank: 'kingdom', name: 'Animalia' }, { rank: 'class', name: 'Aves' }],
    general: [{ label: 'Größe', value: '30 cm' }, { label: 'Unbekannter Wert', value: '' }],
    status: { category: '', status: 'Least Concern', trend: 'Unbekannt', population: '' }, websiteUrl: null,
    content: richContent(), media: { portrait: normal({ mimeType: 'image/webp' }), map: null,
      spectrogram: unavailable({ id: 'fixture:spectrogram', mimeType: 'image/webp' }),
      sounds: [normal({ id: 'fixture:sound', mimeType: 'audio/mpeg' })],
      gallery: [
        { id: 'usage-first', asset: clone(asset), alt: 'Erste Ansicht', caption: 'Erste Bildunterschrift', decorative: false, order: 0 },
        { id: 'usage-second', asset: clone(asset), alt: '', caption: 'Zweite Verwendung', decorative: true, order: 1 },
      ] } };
}
const envelope = values => ({ projectId, revision: 7, generatedAt: '2026-11-01T10:00:00.000Z', species: values });
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('all four media variants preserve their exact fields and never construct private endpoint URLs', () => {
  for (const value of [publicMedia(), publicMedia({ bytes: 123, sha256: sha, mimeType: 'image/jpeg', attribution: '' }),
    projectImage(), normal(), normal({ id: 'fixture:sound', mimeType: 'audio/mpeg', bytes: NORMAL_BYTES }), unavailable()]) {
    const before = clone(value); freeze(value);
    const result = validateReaderMedia(value, context);
    assert.deepEqual(result, before); assert.notStrictEqual(result, value);
    if (value.kind !== 'public-https') assert.equal('url' in result, false);
  }
  assert.deepEqual(validateReaderMedia(publicMedia()), publicMedia());
});

test('provided images and normal audio respect exact size boundaries while unavailable zero bytes remain unavailable', () => {
  for (const value of [projectImage({ bytes: IMAGE_BYTES }), normal({ bytes: IMAGE_BYTES }),
    normal({ mimeType: 'audio/mpeg', bytes: NORMAL_BYTES }), unavailable({ bytes: 0 }), publicMedia({ bytes: 0 })])
    assert.deepEqual(validateReaderMedia(value, context), value);
  for (const value of [projectImage({ bytes: 0 }), normal({ bytes: 0 }), projectImage({ bytes: IMAGE_BYTES + 1 }),
    normal({ bytes: IMAGE_BYTES + 1 }), normal({ mimeType: 'audio/mpeg', bytes: NORMAL_BYTES + 1 }),
    unavailable({ bytes: -1 }), publicMedia({ mimeType: 'image/jpeg', bytes: IMAGE_BYTES + 1 })])
    assert.throws(() => validateReaderMedia(value, context));
});

test('project variants require the exact project and safe image/content identifiers without paths', () => {
  for (const value of [projectImage(), normal(), unavailable()]) {
    assert.throws(() => validateReaderMedia(value));
    assert.throws(() => validateReaderMedia(value, { projectId: 'other-project' }));
    const extra = clone(value); extra.url = '/api/arbitrary/private';
    assert.throws(() => validateReaderMedia(extra, context));
  }
  for (const invalid of ['portrait', `normal-${sha}`, 'image-11111111-1111-0111-8111-111111111111', 'image-11111111-1111-4111-c111-111111111111'])
    assert.throws(() => validateReaderMedia(projectImage({ id: invalid }), context));
  for (const contentId of [`normal-${sha.toUpperCase()}`, `normal-${'a'.repeat(63)}`, '/api/normal/x', sha]) {
    const value = normal(); value.contentId = contentId; assert.throws(() => validateReaderMedia(value, context));
  }
  const missing = unavailable(); missing.contentId = `normal-${sha}`;
  assert.throws(() => validateReaderMedia(missing, context));
});

test('public media reuse Catalog 1 optional metadata rules and reject credential or local addresses', () => {
  for (const url of ['http://example.org/a', 'https://user:secret@example.org/a', 'https://localhost/a', 'https://192.168.1.1/a',
    'https://example.internal/a', 'file:///C:/a.jpg', 'https://example.org/a?token=secret', 'https://example.org/a?X-Amz-Signature=secret', 'https://example.org/a#fragment'])
    assert.throws(() => validateReaderMedia(publicMedia({ url }), context));
  for (const change of [{ bytes: -1 }, { sha256: otherSha.toUpperCase() }, { mimeType: 'application/json' }, { attribution: 'x'.repeat(8001) }])
    assert.throws(() => validateReaderMedia(publicMedia(change), context));
  const optional = publicMedia({ mimeType: 'audio/ogg', attribution: '  Exakte Herkunft  ' });
  assert.deepEqual(validateReaderMedia(optional, context), optional);
});

test('structured content, role order, list types, sources and empty decisions survive without private evidence', () => {
  const input = species(), before = clone(input); freeze(input);
  const result = validateReaderSpecies(input, context);
  assert.deepEqual(result, before); assert.deepEqual(result.content.sections[1].blocks, before.content.sections[1].blocks);
  assert.equal(result.content.sections[2].intentionallyEmpty, true); assert.equal(result.content.sections[3].intentionallyEmpty, false);
  assert.equal(result.content.sections[3].requested, false); assert.equal(result.content.galleryRequested, false);
  assert.equal(result.websiteUrl, null); assert.equal('sourceBindings' in result.content, false);
  result.content.introduction[0].text = 'Andere Kopie'; result.media.gallery[0].asset.attribution = 'Andere Herkunft';
  assert.deepEqual(input, before); assert.notEqual(result.media.gallery[0].asset.attribution, result.media.gallery[1].asset.attribution);
});

test('legacy sections remain exactly Catalog 1 text with no flattening or inferred intentional emptiness', () => {
  const input = species(); input.content = { kind: 'legacy-sections', sections: [
    { id: 'legacy-first', title: 'Vorhanden', text: 'Erster Absatz\n\n• Zweiter Absatz', intentionallyEmpty: false },
    { id: 'legacy-empty', title: 'Unbestätigt leer', text: '', intentionallyEmpty: false },
  ] };
  const old = validateCatalogSpecies({ id: input.id, scientificName: input.scientificName, commonName: input.commonName,
    taxonomy: input.taxonomy, sections: input.content.sections, media: { sounds: [], gallery: [] } });
  assert.deepEqual(validateReaderSpecies(input, context).content.sections, old.sections);
  input.content.sections[1].intentionallyEmpty = true;
  assert.equal(validateReaderSpecies(input, context).content.sections[1].intentionallyEmpty, true);
  input.content.sections[1].text = 'Widersprüchlicher Text'; assert.throws(() => validateReaderSpecies(input, context));
});

test('an entirely public species needs no invented private project context, while any private reference remains bound', () => {
  const input = species();
  input.media = { portrait: publicMedia(), map: null, spectrogram: null, sounds: [], gallery: [] };
  assert.deepEqual(validateReaderSpecies(input), input);
  input.media.gallery = [{ id: 'private-usage', asset: projectImage(), alt: 'Privates Bild', caption: '', decorative: false, order: 0 }];
  assert.throws(() => validateReaderSpecies(input));
  assert.deepEqual(validateReaderSpecies(input, context), input);
  input.media.gallery[0].asset = null;
  assert.throws(() => validateReaderSpecies(input, context), denied('invalid_reader_catalog'));
});

test('rich role boundaries and exact existing normalization rules reject malformed or silently lossy structures', () => {
  for (const mutate of [
    value => { value.content.sections.reverse(); }, value => { value.content.sections[1].kind = 'general-module'; },
    value => { value.content.sections[1].id = value.content.sections[0].id; },
    value => { value.content.sections[1].blocks[0].level = 3; }, value => { value.content.sections[1].blocks[1].items = []; },
    value => { value.content.sections[1].blocks[0].extra = 'Would be lost'; },
    value => { value.content.sections[1].sources[0].extra = true; },
    value => { value.content.sections[1].intentionallyEmpty = true; }, value => { value.content.sections[1].requested = 1; },
  ]) { const input = species(); mutate(input); assert.throws(() => validateReaderSpecies(input, context)); }
  const ordered = species(); [ordered.content.sections[1], ordered.content.sections[2]] = [ordered.content.sections[2], ordered.content.sections[1]];
  assert.deepEqual(validateReaderSpecies(ordered, context).content.sections.map(section => section.id), ['general', 'food', 'appearance', 'map']);
});

test('reader content cannot carry actor, source bindings, approval or emptyDecision metadata at any defined level', () => {
  for (const place of ['root', 'content', 'section', 'gallery', 'asset', 'status']) for (const key of ['actor', 'sourceBindings', 'approval', 'emptyDecision']) {
    const input = species(), target = place === 'root' ? input : place === 'content' ? input.content : place === 'section' ? input.content.sections[1]
      : place === 'gallery' ? input.media.gallery[0] : place === 'asset' ? input.media.gallery[0].asset : input.status;
    target[key] = { private: 'sentinel' }; assert.throws(() => validateReaderSpecies(input, context));
  }
});

test('gallery usages keep order and independent IDs while every repeated asset binding must remain identical', () => {
  const input = species(), result = validateReaderSpecies(input, context);
  assert.equal(result.media.gallery[0].asset.id, result.media.gallery[1].asset.id);
  assert.notEqual(result.media.gallery[0].id, result.media.gallery[1].id);
  for (const mutate of [value => { value.media.gallery.reverse(); }, value => { value.media.gallery[1].id = value.media.gallery[0].id; },
    value => { value.media.gallery[1].order = 2; }, value => { value.media.gallery[1].asset.sha256 = otherSha; },
    value => { value.media.gallery[1].asset.attribution = 'Andere Herkunft'; }, value => { value.media.gallery[1].alt = 'Nicht leer'; }]) {
    const invalid = species(); mutate(invalid); assert.throws(() => validateReaderSpecies(invalid, context));
  }
});

test('image and sound roles cannot be exchanged and unknown public image size is bounded at its actual role', () => {
  for (const mutate of [value => { value.media.portrait = normal({ mimeType: 'audio/mpeg' }); },
    value => { value.media.sounds = [projectImage()]; }, value => { value.media.gallery[0].asset = publicMedia({ mimeType: 'audio/ogg' }); },
    value => { value.media.portrait = publicMedia({ bytes: IMAGE_BYTES + 1 }); },
    value => { value.media.sounds.push(clone(value.media.sounds[0])); }]) {
    const input = species(); mutate(input); assert.throws(() => validateReaderSpecies(input, context));
  }
  const input = species(); input.media.map = publicMedia();
  assert.deepEqual(validateReaderSpecies(input, context).media.map, publicMedia());
});

test('species bounds, taxonomy, general/status strings and existing website URLs are exact', () => {
  const input = species(); input.websiteUrl = 'https://www.fnwildlifetravel.de/wildlife/voegel/fixture-owl';
  assert.deepEqual(validateReaderSpecies(input, context), input);
  for (const mutate of [value => { value.taxonomy = Array(31).fill({ rank: 'family', name: 'Strigidae' }); },
    value => { value.general = Array(31).fill({ label: 'Länge', value: '' }); }, value => { value.status.population = 123; },
    value => { value.websiteUrl = 'https://localhost/species'; }, value => { value.status.extra = ''; },
    value => { value.media.sounds = Array(501).fill(normal({ mimeType: 'audio/mpeg' })); },
    value => { value.media.gallery = Array(501).fill(value.media.gallery[0]); }]) {
    const invalid = species(); mutate(invalid); assert.throws(() => validateReaderSpecies(invalid, context));
  }
  assert.throws(() => validateReaderSpecies(species()));
});

test('descriptor validation rejects hidden/symbolic fields, accessors, toJSON hooks, sparse arrays and proxies before executing them', () => {
  for (const select of [value => value, value => value.content, value => value.content.sections[1], value => value.media.gallery[0].asset]) {
    for (const mode of ['hidden', 'symbol', 'getter', 'toJSON']) {
      const input = species(), target = select(input); let calls = 0;
      if (mode === 'hidden') Object.defineProperty(target, 'hidden', { value: true });
      if (mode === 'symbol') target[Symbol('private')] = true;
      if (mode === 'getter') Object.defineProperty(target, 'trap', { enumerable: true, get() { calls++; return 'unsafe'; } });
      if (mode === 'toJSON') target.toJSON = () => { calls++; return {}; };
      assert.throws(() => validateReaderSpecies(input, context)); assert.equal(calls, 0);
    }
  }
  const sparse = species(); delete sparse.content.sections[1].blocks[1]; assert.throws(() => validateReaderSpecies(sparse, context));
  let traps = 0; const proxy = new Proxy(species(), { getPrototypeOf() { traps++; return Object.prototype; } });
  assert.throws(() => validateReaderSpecies(proxy, context)); assert.equal(traps, 0);
  const foreign = Object.assign(Object.create({ inherited: true }), species()); assert.throws(() => validateReaderSpecies(foreign, context));
  const hidden = envelope([species()]); Object.defineProperty(hidden.species, 'hidden', { value: true });
  assert.throws(() => buildReaderCatalog(hidden));
});

test('build emits only the sorted schema-2 envelope and never mutates, drops duplicates or invents fields', () => {
  const input = envelope([species('zeta-owl'), species('alpha-owl')]), before = clone(input); freeze(input);
  const result = buildReaderCatalog(input);
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'projectId', 'revision', 'generatedAt', 'species']);
  assert.equal(result.schemaVersion, 2); assert.equal(result.revision, '7');
  assert.deepEqual(result.species.map(entry => entry.id), ['alpha-owl', 'zeta-owl']); assert.deepEqual(input, before);
  assert.throws(() => buildReaderCatalog(envelope([species(), species()])));
  assert.throws(() => buildReaderCatalog({ ...envelope([]), unknown: true }));
  assert.throws(() => buildReaderCatalog({ ...envelope([]), generatedAt: '2026-11-01' }));
});

function largeSpecies(id, textBytes) {
  const result = species(id); result.content = { kind: 'legacy-sections', sections: [] };
  for (let remaining = textBytes, index = 0; remaining > 0; index++) {
    const length = Math.min(100000, remaining); remaining -= length;
    result.content.sections.push({ id: `large-${index}`, title: 'Vorhandener Fachtext', text: 'x'.repeat(length), intentionallyEmpty: false });
  }
  return result;
}

test('each species permits large valid content but rejects an oversized art before any output is truncated', () => {
  const input = largeSpecies('large-valid', 3 * 1024 * 1024), before = JSON.stringify(input);
  assert.deepEqual(validateReaderSpecies(input, context), input); assert.equal(JSON.stringify(input), before);
  assert.throws(() => validateReaderSpecies(largeSpecies('too-large', 4 * 1024 * 1024), context), denied('reader_species_too_large'));
});

test('the independent 300000-node species limit also rejects deeply populated lists below the byte ceiling', () => {
  const input = species(), first = input.content.sections[0], last = input.content.sections.at(-1);
  input.content.sections = [first, ...Array.from({ length: 10 }, (_, index) => ({
    id: `many-items-${index}`, kind: 'editorial', title: 'Vorhandene Listen', requested: true,
    blocks: Array.from({ length: 300 }, () => ({ type: 'bullet-list', items: Array(100).fill('x') })),
    sources: [], intentionallyEmpty: false,
  })), last];
  assert.ok(Buffer.byteLength(JSON.stringify(input)) < 4 * 1024 * 1024);
  assert.throws(() => validateReaderSpecies(input, context), denied('reader_species_too_large'));
});

test('collection overflow explicitly requires HTTP paging while individually valid species remain untouched', () => {
  const values = ['first', 'second', 'third'].map(id => largeSpecies(id, 3 * 1024 * 1024));
  assert.ok(Buffer.byteLength(JSON.stringify(buildReaderCatalog(envelope(values.slice(0, 2))))) < 8 * 1024 * 1024);
  assert.throws(() => buildReaderCatalog(envelope(values)), error => error.status === 413 && error.code === 'reader_catalog_paging_required');
  assert.equal(values[2].content.sections[0].text.length, 100000);
});
