import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { digest, objectJson } from './security.mjs';
import { validateCatalogSpecies } from './catalog.mjs';
import { validateSpeciesRecord, projectSpeciesRecordToCatalog } from './species-record.mjs';
import { buildPageEditorialAdoption } from './species-editorial-adoption.mjs';
import { speciesPageSourceHash } from './species-editorial.mjs';
import { projectSpeciesRecordToReader, readerMediaRequirements } from './reader-projection.mjs';
import { initialDocument, normalizeSpeciesSnapshot, NORMAL_ASSET_FILES, emptySectionHash } from '../page-authoring/model.mjs';
import { encodePageAuthoringDraft, pageAuthoringObjectId } from '../page-authoring/shared.mjs';

const projectId = 'reader-fixture-project';
const imageId = 'image-11111111-1111-4111-8111-111111111111';
const viewKeys = ['id', 'scientificName', 'commonName', 'taxonomy', 'general', 'status', 'websiteUrl', 'content', 'media'];
const metaKeys = ['id', 'projectId', 'sha256', 'bytes', 'mimeType', 'attribution'];
const attr = { portrait: 'Foto · FN · Eigene Aufnahme', map: 'Quelle: Eigene Karte',
  sound: 'FN · CC BY 4.0 · Eigene Aufnahme · https://example.org/sound',
  spectrogram: 'FN · CC BY 4.0 · Eigene Aufnahme · https://example.org/sound',
  credits: 'FN · CC BY 4.0 · Eigene Aufnahme · https://example.org/sound' };
const denied = code => error => error.code === code;

function file(role, { id = `fixture:${role}`, bytes = 100, url } = {}) {
  return { id, bytes, sha256: digest(`file-${role}`), mimeType: { portrait: 'image/webp', map: 'image/jpeg', sound: 'audio/mpeg', spectrogram: 'image/webp', credits: 'application/json' }[role],
    ...(url ? { url } : {}) };
}
function record(files = {}) {
  return validateSpeciesRecord({ type: 'fn-species-record', schemaVersion: 1, id: 'fixture-owl',
    input: { german: 'Testkauz', genus: 'Strix', species: 'fixture', english: 'Fixture owl', size: 42, weight: '300 g', life_expectancy: '15 Jahre',
      privateOriginal: 'PRIVATE_INPUT_REGISTER' },
    generated: { Class: 'Aves', Status: 'Least Concern', Kategorie: 'LC', Trend: 'Stabil', Populationgröße: 'Unbekannt',
      privateOriginal: 'PRIVATE_GENERATED_REGISTER' },
    taxonomyOverride: { reason: 'PRIVATE_TAXONOMY_REASON' }, assessmentBinding: { id: 'PRIVATE_ASSESSMENT_BINDING' },
    assets: { assetName: 'Historischer Testkauz', files, overrides: { map: { source: 'Eigene Karte', reason: 'PRIVATE_MAP_CARE_REASON' } },
      credits: { recordist: 'FN', license: 'CC BY 4.0', source: 'Eigene Aufnahme', url: 'https://example.org/sound', privateNote: 'PRIVATE_CREDIT_NOTE' },
      portraitMetadata: { type: 'Foto', source: 'FN', generation_method: 'Eigene Aufnahme', prompt: 'PRIVATE_FULL_PROMPT' } },
    editorial: { websiteUrl: 'https://www.fnwildlifetravel.de/wildlife/fixture-owl',
      sections: [{ id: 'old-section', title: 'Vorhandener Fachtext', text: 'Originaler veröffentlichter Text', intentionallyEmpty: false }],
      gallery: [], generalSectionId: null, embeddedGeneralText: null } });
}
function catalog() {
  return validateCatalogSpecies({ id: 'fixture-owl', scientificName: 'Strix fixture', commonName: 'Testkauz',
    taxonomy: [{ rank: 'class', name: 'Aves' }], websiteUrl: 'https://www.fnwildlifetravel.de/wildlife/fixture-owl',
    sections: [{ id: 'old-section', title: 'Alter Text', text: 'Bereits veröffentlichter Text', intentionallyEmpty: false }],
    media: { portrait: { id: 'public-portrait', url: 'https://example.org/portrait.webp' },
      map: { id: 'public-map', url: 'https://example.org/map.jpg', bytes: 123, sha256: digest('public-map'), mimeType: 'image/jpeg' },
      sounds: [{ id: 'public-sound', url: 'https://example.org/sound.mp3', attribution: 'FN' }],
      gallery: [{ id: 'old-image-z', url: 'https://example.org/z.jpg', alt: 'Zweite Ansicht', caption: 'Original Z', order: 9 },
        { id: 'old-image-a', url: 'https://example.org/a.jpg', alt: 'Erste Ansicht', caption: 'Original A', order: 3 }] } });
}
function rich(source = record(), change = () => {}) {
  const normalAssets = Object.fromEntries(Object.entries(NORMAL_ASSET_FILES).map(([role, filename]) => {
    const reference = source.assets.files[filename];
    return [role, reference?.bytes > 0 ? { id: reference.id, projectId, sha256: reference.sha256, bytes: reference.bytes, mimeType: reference.mimeType, attribution: attr[role] } : null];
  }));
  const snapshot = normalizeSpeciesSnapshot({ slug: source.id, commonName: 'Testkauz', scientificName: 'Strix fixture',
    taxonomy: [{ rank: 'Class', name: 'Aves' }], general: [], status: '', assetName: source.assets.assetName,
    revision: randomUUID(), dataSha256: speciesPageSourceHash(source), normalAssets, runtimeReady: false }, projectId, source.id);
  const document = initialDocument({ templateId: 'fn-compact-20261031', species: snapshot, parentPath: '/wildlife/heimische-tierwelt' });
  document.introduction = [{ type: 'paragraph', text: 'Originale Einleitung' }];
  const appearance = document.sections.find(section => section.id === 'appearance');
  appearance.blocks = [{ type: 'heading', level: 5, text: 'Merkmale' }, { type: 'bullet-list', items: ['Punkt eins', 'Punkt zwei'] }];
  appearance.sources = [{ id: 'section-source', label: 'Abschnittsquelle', url: 'https://example.org/section', sha256: digest('section-source') }];
  document.sources = [{ id: 'page-source', label: 'Gesamte Quelle', url: 'https://example.org/reference', sha256: digest('page-source') }];
  const galleryAsset = { id: imageId, projectId, sha256: digest('managed-gallery'), bytes: 321, mimeType: 'image/png', attribution: 'Eigene FN-Aufnahme' };
  document.images = [{ id: 'usage-first', assetId: imageId, asset: structuredClone(galleryAsset), alt: 'Ansicht ohne Punkt', caption: 'Originale Beschriftung', decorative: false },
    { id: 'usage-second', assetId: imageId, asset: structuredClone(galleryAsset), alt: '', caption: 'Zweite Verwendung', decorative: true }];
  change(document);
  const page = encodePageAuthoringDraft({ id: 'reader-page', revision: digest(randomUUID()), document });
  const candidate = buildPageEditorialAdoption({ projectId, actor: { id: 'PRIVATE_EDITOR_ACTOR', projectId, role: 'admin' },
    pageObject: { kind: 'page', id: pageAuthoringObjectId(page.pageId), revision: randomUUID(), data: page },
    speciesObject: { kind: 'species', id: source.id, revision: randomUUID(), data: source } });
  return candidate.data;
}
function normalResolver(metadata) {
  return { kind: 'project-normal', ...metadata, contentId: `normal-${digest(`${metadata.id}:${metadata.sha256}`)}` };
}
function imageResolver(metadata) { return { kind: 'project-image', ...metadata }; }
function forbiddenKeys(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => ['input', 'generated', 'assessmentBinding', 'taxonomyOverride', 'sourceBindings', 'emptyDecision', 'actorId', 'prompt', 'safeName'].includes(key)
    ? [key] : forbiddenKeys(item));
}

test('a narrow Catalog1 species keeps its public texts and media without fabricating structured facts or a project', () => {
  const source = catalog(), before = structuredClone(source), result = projectSpeciesRecordToReader(source);
  assert.deepEqual(Object.keys(result).sort(), [...viewKeys].sort());
  assert.deepEqual(result.content, { kind: 'legacy-sections', sections: source.sections });
  assert.deepEqual(result.general, []); assert.deepEqual(result.status, { category: '', status: '', trend: '', population: '' });
  assert.equal(result.media.portrait.kind, 'public-https'); assert.equal(result.media.spectrogram, null);
  assert.equal(result.media.sounds[0].id, source.media.sounds[0].id);
  assert.deepEqual(result.media.gallery.map(image => [image.id, image.asset.url, image.alt, image.caption, image.order]),
    source.media.gallery.map((image, index) => [image.id, image.url, image.alt, image.caption, index]));
  assert.deepEqual(readerMediaRequirements(result), []); assert.deepEqual(source, before);
});

test('Record1 keeps the existing Catalog1 projection as its legacy section source and adds only curated facts', () => {
  const source = record(), legacy = projectSpeciesRecordToCatalog(source), before = structuredClone(source);
  const result = projectSpeciesRecordToReader(source);
  assert.deepEqual(result.content.sections, legacy.sections); assert.deepEqual(result.taxonomy, legacy.taxonomy);
  assert.deepEqual(result.general, [{ label: 'Wissenschaftlicher Name', value: 'Strix fixture' }, { label: 'Deutscher Name', value: 'Testkauz' },
    { label: 'Englischer Name', value: 'Fixture owl' }, { label: 'Größe', value: '42' }, { label: 'Gewicht', value: '300 g' }, { label: 'Lebenserwartung', value: '15 Jahre' }]);
  assert.deepEqual(result.status, { category: 'LC', status: 'Least Concern', trend: 'Stabil', population: 'Unbekannt' });
  assert.deepEqual(result.media, { portrait: null, map: null, spectrogram: null, sounds: [], gallery: [] });
  assert.deepEqual(forbiddenKeys(result), []); assert.ok(!JSON.stringify(result).includes('PRIVATE_')); assert.deepEqual(source, before);
});

test('already public legacy embedded assessment prose stays exact, while new general and status fields never expose private assessments', () => {
  const source = record(); source.generated = { Status: 'Least Concern', 'Assessment ID': 'historically-public-assessment' };
  const embedded = 'Status: Least Concern\nAssessment ID: historically-public-assessment';
  source.editorial.sections = [{ id: 'general', title: 'Allgemein', text: `Menschlicher Originaltext\n\n${embedded}`, intentionallyEmpty: false }];
  source.editorial.generalSectionId = 'general'; source.editorial.embeddedGeneralText = embedded;
  const expected = projectSpeciesRecordToCatalog(source), result = projectSpeciesRecordToReader(source);
  assert.deepEqual(result.content.sections, expected.sections);
  assert.ok(result.content.sections[0].text.includes('historically-public-assessment'));
  assert.ok(!JSON.stringify({ general: result.general, status: result.status }).includes('assessment'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_ASSESSMENT_BINDING'));
});

test('Record2 preserves rich blocks, sources and genuine empty decisions without serializing editorial provenance or actors', () => {
  const source = rich(record(), document => {
    const habitat = document.sections.find(section => section.id === 'habitat'); habitat.blocks = [];
    document.emptyConfirmations[habitat.id] = { sectionHash: emptySectionHash(habitat), actorId: 'PRIVATE_EMPTY_ACTOR', confirmedAt: '2026-11-01T12:00:00.000Z', reason: 'Bewusst nicht erforderlich' };
  });
  const before = structuredClone(source), result = projectSpeciesRecordToReader(source, { resolveMedia: imageResolver });
  assert.equal(result.content.kind, 'structured'); assert.equal(result.content.title, source.editorial.title);
  assert.deepEqual(result.content.introduction, source.editorial.introduction); assert.deepEqual(result.content.sources, source.editorial.sources);
  for (const section of source.editorial.sections) {
    const actual = result.content.sections.find(item => item.id === section.id);
    assert.deepEqual(actual.blocks, section.blocks); assert.deepEqual(actual.sources, section.sources);
    assert.equal(actual.requested, section.requested); assert.equal(actual.intentionallyEmpty, section.emptyDecision !== null);
  }
  assert.deepEqual(forbiddenKeys(result), []); assert.ok(!JSON.stringify(result).includes('PRIVATE_')); assert.deepEqual(source, before);
  result.content.introduction[0].text = 'Nur DTO geändert'; assert.deepEqual(source, before);
});

test('Record2 gallery retains usage identities, repeated asset, ordering, exact alt/caption and decorative choice', () => {
  const source = rich(), calls = [];
  const result = projectSpeciesRecordToReader(source, { projectId, resolveMedia: (metadata, binding) => { calls.push({ metadata, binding }); return imageResolver(metadata); } });
  assert.equal(result.media.gallery.length, 2); assert.equal(calls.length, 2);
  for (const [index, original] of source.editorial.gallery.entries()) {
    const actual = result.media.gallery[index]; assert.equal(actual.id, original.id); assert.equal(actual.order, index);
    assert.equal(actual.alt, original.alt); assert.equal(actual.caption, original.caption); assert.equal(actual.decorative, original.decorative);
    assert.deepEqual(Object.fromEntries(metaKeys.map(key => [key, actual.asset[key]])), original.asset);
    assert.deepEqual(calls[index].binding, { role: 'gallery', speciesId: source.id });
  }
  assert.equal(result.media.gallery[0].asset.id, result.media.gallery[1].asset.id);
  assert.deepEqual(readerMediaRequirements(result), []);
});

test('without a resolver a managed-looking id stays unavailable, and missing requirements retain both usage ids', () => {
  const result = projectSpeciesRecordToReader(rich());
  assert.ok(result.media.gallery.every(image => image.asset.kind === 'unavailable' && image.asset.reason === 'not-provided' && !('url' in image.asset) && !('contentId' in image.asset)));
  assert.deepEqual(readerMediaRequirements(result), [{ role: 'gallery', id: 'usage-first' }, { role: 'gallery', id: 'usage-second' }]);
});

test('each stale resolver metadata field blocks rather than claiming availability or mutating the source', () => {
  const source = rich(), before = structuredClone(source);
  const changes = { id: 'image-22222222-2222-4222-8222-222222222222', projectId: 'foreign-project', sha256: digest('stale'), bytes: 999,
    mimeType: 'image/jpeg', attribution: 'Andere Quelle' };
  for (const [key, value] of Object.entries(changes)) {
    assert.throws(() => projectSpeciesRecordToReader(source, { projectId, resolveMedia: metadata => ({ ...imageResolver(metadata), [key]: value }) }));
  }
  assert.deepEqual(source, before);
});

test('resolver arguments are detached and asynchronous, invented-public or extra-field answers cannot become receipts', () => {
  const source = rich(), before = structuredClone(source);
  assert.throws(() => projectSpeciesRecordToReader(source, { resolveMedia: metadata => { metadata.sha256 = digest('mutated argument'); return imageResolver(metadata); } }));
  assert.deepEqual(source, before);
  for (const resolveMedia of [metadata => Promise.resolve(imageResolver(metadata)), () => undefined,
    metadata => ({ ...metadata, kind: 'public-https', url: 'https://example.org/invented.png' }),
    metadata => ({ ...imageResolver(metadata), localFilename: 'C:/private/image.png' })]) {
    assert.throws(() => projectSpeciesRecordToReader(source, { resolveMedia }));
  }
});

test('all four positive private normal roles keep their old ids, curated attribution and resolver-bound content ids; credits JSON is not binary media', () => {
  const files = Object.fromEntries(Object.entries(NORMAL_ASSET_FILES).map(([role, filename]) => [filename, file(role)]));
  const source = record(files), calls = [];
  const result = projectSpeciesRecordToReader(source, { projectId, resolveMedia: (metadata, binding) => { calls.push(binding); return normalResolver(metadata); } });
  assert.deepEqual(calls.map(call => call.role), ['portrait', 'map', 'sound', 'spectrogram']);
  for (const role of ['portrait', 'map', 'spectrogram', 'sound']) {
    const actual = role === 'sound' ? result.media.sounds[0] : result.media[role];
    assert.equal(actual.kind, 'project-normal'); assert.equal(actual.id, `fixture:${role}`); assert.equal(actual.attribution, attr[role]);
    assert.match(actual.contentId, /^normal-[a-f0-9]{64}$/); assert.equal(actual.projectId, projectId);
  }
  assert.ok(!JSON.stringify(result.media).includes('application/json')); assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
  assert.deepEqual(readerMediaRequirements(result), []);
});

test('positive unprovided normal files become unavailable, while absent and zero-byte roles create no new requirement', () => {
  const source = record({ 'portrait.webp': file('portrait'), 'map.jpg': file('map'), 'sound.mp3': file('sound', { bytes: 0 }) });
  const result = projectSpeciesRecordToReader(source, { projectId });
  assert.equal(result.media.portrait.kind, 'unavailable'); assert.equal(result.media.map.kind, 'unavailable');
  assert.equal(result.media.spectrogram, null); assert.deepEqual(result.media.sounds, []);
  assert.deepEqual(readerMediaRequirements(result), [{ role: 'portrait', id: 'fixture:portrait' }, { role: 'map', id: 'fixture:map' }]);
});

test('Record1 private media require an actual project, and Record2 rejects an explicitly foreign project', () => {
  assert.throws(() => projectSpeciesRecordToReader(record({ 'map.jpg': file('map') })), denied('reader_project_required'));
  assert.throws(() => projectSpeciesRecordToReader(rich(), { projectId: 'foreign-project' }), denied('reader_project_changed'));
  assert.equal(projectSpeciesRecordToReader(rich()).media.gallery[0].asset.projectId, projectId);
});

test('explicit public normal file urls stay public, preserving file proofs without requesting a private resolver', () => {
  const source = record({ 'portrait.webp': file('portrait', { url: 'https://example.org/portrait.webp' }),
    'sound.mp3': file('sound', { url: 'https://example.org/sound.mp3' }), 'spectrogram.webp': file('spectrogram', { url: 'https://example.org/spectrogram.webp' }) });
  const result = projectSpeciesRecordToReader(source, { resolveMedia: () => { throw new Error('Private resolver must not be called.'); } });
  for (const actual of [result.media.portrait, result.media.spectrogram, result.media.sounds[0]]) {
    assert.equal(actual.kind, 'public-https'); assert.ok(actual.url.startsWith('https://example.org/')); assert.equal('projectId' in actual, false);
  }
  assert.equal(result.media.portrait.attribution, attr.portrait); assert.deepEqual(readerMediaRequirements(result), []);
});

test('a normal role with image-UUID uses the resolver receipt rather than classifying the id prefix', () => {
  const source = rich(record({ 'portrait.webp': file('portrait', { id: imageId }) }), document => {
    const asset = document.species.normalAssets.portrait;
    document.images = [{ id: 'same-normal-usage', assetId: asset.id, asset: structuredClone(asset), alt: 'Dasselbe Bild', caption: '', decorative: false }];
  });
  const pending = projectSpeciesRecordToReader(source); assert.equal(pending.media.portrait.kind, 'unavailable');
  const result = projectSpeciesRecordToReader(source, { resolveMedia: imageResolver });
  assert.equal(result.media.portrait.kind, 'project-image'); assert.deepEqual(result.media.portrait, result.media.gallery[0].asset);
});

test('a gallery reuse of an exact public normal file keeps that already bound public reference and its own usage text', () => {
  const url = 'https://example.org/exact-normal-portrait.webp';
  const source = rich(record({ 'portrait.webp': file('portrait', { url }) }), document => {
    const asset = document.species.normalAssets.portrait;
    document.images = [{ id: 'public-normal-usage', assetId: asset.id, asset: structuredClone(asset), alt: 'Eigenständiger Alternativtext', caption: 'Beschriftung der Verwendung', decorative: false }];
  });
  const before = structuredClone(source);
  const result = projectSpeciesRecordToReader(source, { resolveMedia: () => { throw new Error('Exact public normal reuse must not invoke private resolver.'); } });
  assert.equal(result.media.portrait.kind, 'public-https'); assert.equal(result.media.portrait.url, url);
  assert.deepEqual(result.media.gallery[0].asset, result.media.portrait);
  assert.equal(result.media.gallery[0].id, 'public-normal-usage'); assert.equal(result.media.gallery[0].alt, 'Eigenständiger Alternativtext');
  assert.equal(result.media.gallery[0].caption, 'Beschriftung der Verwendung'); assert.deepEqual(readerMediaRequirements(result), []); assert.deepEqual(source, before);
});

test('a gallery reuse of an exact private normal file keeps one trusted receipt without resolving the same bytes twice', () => {
  const source = rich(record({ 'portrait.webp': file('portrait') }), document => {
    const asset = document.species.normalAssets.portrait;
    document.images = [{ id: 'normal-first-use', assetId: asset.id, asset: structuredClone(asset), alt: 'Erste Verwendung', caption: '', decorative: false },
      { id: 'normal-second-use', assetId: asset.id, asset: structuredClone(asset), alt: 'Zweite Verwendung', caption: '', decorative: false }];
  });
  const calls = [], result = projectSpeciesRecordToReader(source, { resolveMedia: (metadata, binding) => { calls.push(binding); return normalResolver(metadata); } });
  assert.deepEqual(calls, [{ role: 'portrait', speciesId: source.id }]);
  assert.equal(result.media.portrait.kind, 'project-normal');
  assert.deepEqual(result.media.gallery.map(image => image.asset), [result.media.portrait, result.media.portrait]);
  assert.deepEqual(result.media.gallery.map(image => image.id), ['normal-first-use', 'normal-second-use']);
  assert.deepEqual(readerMediaRequirements(result), []);
});

test('structured unrequested map and gallery remain present without creating requirements or changing requested decisions', () => {
  const source = rich(record({ 'map.jpg': file('map') }), document => {
    document.galleryRequested = false; document.sections.find(section => section.kind === 'map-module').requested = false;
  });
  const result = projectSpeciesRecordToReader(source);
  assert.equal(result.media.map.kind, 'unavailable'); assert.equal(result.media.gallery.length, 2);
  assert.equal(result.content.galleryRequested, false); assert.equal(result.content.sections.at(-1).requested, false);
  assert.deepEqual(readerMediaRequirements(result), []);
  result.content.galleryRequested = true; result.content.sections.at(-1).requested = true;
  assert.deepEqual(readerMediaRequirements(result), [{ role: 'map', id: 'fixture:map' }, { role: 'gallery', id: 'usage-first' }, { role: 'gallery', id: 'usage-second' }]);
});

test('large valid rich text stays structured and exact, without the old Catalog1 flat-section limit', () => {
  const source = rich(record(), document => {
    document.sections.find(section => section.id === 'appearance').blocks = Array.from({ length: 6 }, (_, index) => ({ type: 'paragraph', text: `${index}: ${'x'.repeat(90 * 1024)}` }));
  });
  assert.ok(Buffer.byteLength(objectJson(source)) > 256 * 1024);
  const before = structuredClone(source), result = projectSpeciesRecordToReader(source), actual = result.content.sections.find(section => section.id === 'appearance');
  assert.deepEqual(actual.blocks, source.editorial.sections.find(section => section.id === 'appearance').blocks);
  assert.equal(actual.blocks.length, 6); assert.ok(actual.blocks.reduce((sum, block) => sum + block.text.length, 0) > 500000);
  assert.deepEqual(source, before); assert.deepEqual(forbiddenKeys(result), []);
});

test('unknown record versions and mixed-project reader requirements fail explicitly', () => {
  assert.throws(() => projectSpeciesRecordToReader({ ...record(), schemaVersion: 3 }));
  const result = projectSpeciesRecordToReader(rich()); result.media.gallery[1].asset.projectId = 'foreign-project';
  assert.throws(() => readerMediaRequirements(result), denied('reader_project_changed'));
});
