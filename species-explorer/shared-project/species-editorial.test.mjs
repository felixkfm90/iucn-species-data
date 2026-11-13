import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPageEditorial, speciesPageSourceBody, speciesPageSourceHash } from './species-editorial.mjs';
import { validateSpeciesRecord } from './species-record.mjs';
import { readerEditorialFromProjection } from './species-editorial-data.mjs';
import { fingerprint } from '../page-authoring/contract.mjs';
import { initialDocument, normalizeSpeciesSnapshot, emptySectionHash } from '../page-authoring/model.mjs';
import { encodePageAuthoringDraft, pageAuthoringObjectId, pageImagesHash } from '../page-authoring/shared.mjs';

const projectId = 'editorial-fixture-project';
const hash = value => fingerprint(value);
const denied = code => error => error.code === code;
const sourceKeys = ['type', 'schemaVersion', 'id', 'input', 'generated', 'taxonomyOverride', 'assessmentBinding', 'assets'];
const protectedBody = record => Object.fromEntries(sourceKeys.map(key => [key, record[key]]));

function fixture() {
  const files = Object.fromEntries([
    ['portrait.webp', 'portrait', 'image/webp'], ['map.jpg', 'map', 'image/jpeg'],
    ['sound.mp3', 'sound', 'audio/mpeg'], ['credits.json', 'credits', 'application/json'],
    ['spectrogram.webp', 'spectrogram', 'image/webp'],
  ].map(([filename, role, mimeType], index) => [filename,
    { id: `fixture:${role}`, bytes: 100 + index, sha256: hash(role), mimeType }]));
  const record = validateSpeciesRecord({ type: 'fn-species-record', schemaVersion: 1, id: 'fixture-owl',
    input: { genus: 'Strix', species: 'fixture', german: 'Testkauz', english: 'Fixture owl',
      size: '30 cm', weight: '400 g', life_expectancy: '12 Jahre', unknownManual: { retained: ['x', false] } },
    generated: { URLSlug: 'fixture-owl', Kingdom: 'Animalia', Phylum: 'Chordata', Class: 'Aves',
      Status: 'Least Concern', 'Assessment ID': 12345, unknownGenerated: { retained: true } },
    taxonomyOverride: { reason: 'Geschützte Einordnung', unknown: ['retain'] }, assessmentBinding: { id: 12345 },
    assets: { assetName: 'Historischer Testkauz', files, overrides: { map: { source: 'Kartenquelle „Original“' } },
      credits: { recordist: 'Recorder „Original“', license: 'CC BY', source: 'Gebundene Tonquelle', url: 'https://example.org/recording', privateNote: 'Nicht projizieren' },
      portraitMetadata: { type: 'Illustration', source: 'Quelle „Original“', generation_method: 'Gebundene Erstellung', prompt: 'Privater Prompt' } },
    editorial: { websiteUrl: 'https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/fixture-owl',
      sections: [{ id: 'old-general', title: 'Alter Allgemeintext', text: 'Bereits vorhandener Text', intentionallyEmpty: false }],
      gallery: [], generalSectionId: null, embeddedGeneralText: null } });
  const portraitAttribution = 'Illustration · Quelle „Original“ · Gebundene Erstellung';
  const soundAttribution = 'Recorder „Original“ · CC BY · Gebundene Tonquelle · https://example.org/recording';
  const normalAssets = Object.fromEntries([
    ['portrait', 'portrait.webp', portraitAttribution], ['map', 'map.jpg', 'Quelle: Kartenquelle „Original“'],
    ['sound', 'sound.mp3', soundAttribution], ['credits', 'credits.json', soundAttribution], ['spectrogram', 'spectrogram.webp', soundAttribution],
  ].map(([role, filename, attribution]) => [role, { ...files[filename], projectId, attribution }]));
  const snapshot = normalizeSpeciesSnapshot({ slug: record.id, scientificName: 'Strix fixture', commonName: 'Testkauz',
    assetName: record.assets.assetName, taxonomy: [{ rank: 'Class', name: 'Aves' }],
    general: [{ label: 'Größe', value: '30 cm' }], status: 'Least Concern', revision: `species-${hash(protectedBody(record))}`,
    dataSha256: hash(protectedBody(record)), runtimeReady: false, normalAssets }, projectId, record.id);
  const document = initialDocument({ templateId: 'fn-compact-20261031', species: snapshot,
    parentPath: '/wildlife/heimische-tierwelt', title: 'Testkauz – menschlicher Seitentitel' });
  document.introduction = [{ type: 'paragraph', text: 'Einleitung mit „unveränderten“ Zeichen.' },
    { type: 'heading', level: 5, text: 'Einleitende Zwischenüberschrift' },
    { type: 'bullet-list', items: ['Erster Punkt', 'Zweiter Punkt'] }];
  const source = { id: 'field-source', label: 'Exakte Quelle „A“', url: 'https://example.org/source', sha256: hash('source') };
  document.sources = [structuredClone(source)];
  for (const section of document.sections) if (section.kind === 'editorial') {
    section.blocks = [{ type: 'paragraph', text: `Text ${section.id}` }];
    section.sources = [structuredClone(source)];
  }
  const appearance = document.sections.find(section => section.id === 'appearance');
  appearance.blocks = [{ type: 'heading', level: 6, text: 'Bestimmungsmerkmale' },
    { type: 'numbered-list', items: ['Merkmal eins', 'Merkmal zwei'] }, { type: 'paragraph', text: 'Schlussabsatz' }];
  const food = document.sections.find(section => section.id === 'food');
  food.blocks = [];
  document.emptyConfirmations.food = { sectionHash: emptySectionHash(food), actorId: 'fixture-publisher',
    confirmedAt: '2026-11-01T10:00:00.000Z', reason: 'Bewusst leer belassen' };
  const observation = document.sections.find(section => section.id === 'observation');
  observation.blocks = []; observation.requested = false;
  const asset = { id: 'image-11111111-1111-4111-8111-111111111111', projectId,
    sha256: hash('gallery-file'), bytes: 321, mimeType: 'image/png', attribution: 'Eigene Aufnahme „A“' };
  document.images = [
    { id: 'usage-first', assetId: asset.id, asset: structuredClone(asset), alt: 'Erste Verwendung', caption: 'Erste Bildunterschrift', decorative: false },
    { id: 'usage-second', assetId: asset.id, asset: structuredClone(asset), alt: '', caption: 'Zweite Bildunterschrift', decorative: true },
  ];
  const data = encodePageAuthoringDraft({ id: 'fixture-page', revision: hash('page-revision'), document });
  return { projectId,
    pageObject: { kind: 'page', id: pageAuthoringObjectId(data.pageId), revision: '11111111-1111-4111-8111-111111111111',
      ordinal: 2, approval: 'draft', localPending: false, localConflict: false, data },
    speciesObject: { kind: 'species', id: record.id, revision: '22222222-2222-4222-8222-222222222222',
      ordinal: 3, approval: 'approved', data: record } };
}

function rebindPage(input, mutate) {
  const data = input.pageObject.data;
  mutate(data.document);
  data.contentHash = hash(data.document); data.imagesHash = pageImagesHash(data.document);
  data.title = data.document.title.slice(0, 500);
  return input;
}

test('unapproved page with unavailable public runtime projects only lossless internal editorial content', () => {
  const input = fixture(), before = structuredClone(input), result = projectPageEditorial(input);
  assert.equal(result.kind, 'page-editorial-projection'); assert.equal(result.schemaVersion, 1);
  assert.equal(result.readerApproved, false); assert.equal(result.externalPublication, 'not-performed');
  assert.equal(input.pageObject.data.approval, null); assert.equal(input.pageObject.data.cms, null);
  assert.equal(input.pageObject.data.document.species.runtimeReady, false);
  assert.deepEqual(input, before);
  assert.equal(result.title, input.pageObject.data.document.title);
  assert.deepEqual(result.introduction, input.pageObject.data.document.introduction);
  assert.equal(result.websiteUrl, input.speciesObject.data.editorial.websiteUrl);
  assert.deepEqual(Object.keys(result).sort(), ['kind', 'schemaVersion', 'sourceBindings', 'title', 'introduction', 'sections',
    'sources', 'galleryRequested', 'gallery', 'normalAssets', 'websiteUrl', 'readerApproved', 'externalPublication'].sort());
  assert.equal('general' in result, false); assert.equal('taxonomy' in result, false);
  assert.equal('approval' in result, false); assert.equal('cms' in result, false);
});

test('source bindings distinguish server heads, page content, images and complete decision-bearing data', () => {
  const input = fixture(), result = projectPageEditorial(input), binding = result.sourceBindings;
  assert.deepEqual(binding, { projectId,
    page: { objectId: input.pageObject.id, objectRevision: input.pageObject.revision,
      dataRevision: input.pageObject.data.revision, contentHash: input.pageObject.data.contentHash,
      imagesHash: input.pageObject.data.imagesHash, dataHash: hash(input.pageObject.data) },
    species: { id: input.speciesObject.id, objectRevision: input.speciesObject.revision,
      dataHash: hash(input.speciesObject.data), sourceHash: hash(protectedBody(input.speciesObject.data)) } });
  input.pageObject.revision = '33333333-3333-4333-8333-333333333333';
  assert.notDeepEqual(projectPageEditorial(input).sourceBindings, binding);
});

test('ordered roles, richtext, section references and whole-source references remain distinct and unflattened', () => {
  const input = rebindPage(fixture(), document => {
    [document.sections[1], document.sections[3]] = [document.sections[3], document.sections[1]];
  });
  const result = projectPageEditorial(input), document = input.pageObject.data.document;
  assert.deepEqual(result.sections.map(section => section.id), document.sections.map(section => section.id));
  assert.equal(result.sections[0].kind, 'general-module'); assert.equal(result.sections.at(-1).kind, 'map-module');
  for (const section of document.sections) {
    const projected = result.sections.find(entry => entry.id === section.id);
    assert.deepEqual(projected.blocks, section.blocks); assert.deepEqual(projected.sources, section.sources);
    assert.equal(projected.requested, section.requested); assert.equal(projected.title, section.title);
  }
  assert.deepEqual(result.sources, document.sources);
  assert.equal(result.sections.find(section => section.id === 'appearance').blocks[1].type, 'numbered-list');
});

test('exact empty decisions, unconfirmed empty content and requested false survive without invented approval', () => {
  const input = fixture(), result = projectPageEditorial(input);
  assert.deepEqual(result.sections.find(section => section.id === 'food').emptyDecision,
    input.pageObject.data.document.emptyConfirmations.food);
  const observation = result.sections.find(section => section.id === 'observation');
  assert.equal(observation.requested, false); assert.deepEqual(observation.blocks, []); assert.equal(observation.emptyDecision, null);
  assert.equal(result.sections[0].emptyDecision, null);
  assert.equal(result.readerApproved, false);
  rebindPage(input, document => { document.sections.find(section => section.id === 'food').title = 'Geänderter Titel'; });
  // Canonical stored-document validation rejects the stale confirmation first.
  assert.throws(() => projectPageEditorial(input), denied('invalid_document'));
});

test('two usages of the same file retain separate usage IDs, text, decoration and actual array order', () => {
  const input = rebindPage(fixture(), document => { document.images.reverse(); document.galleryRequested = false; });
  const result = projectPageEditorial(input);
  assert.equal(result.galleryRequested, false); assert.equal(result.gallery.length, 2);
  assert.deepEqual(result.gallery.map(image => [image.id, image.order]), [['usage-second', 0], ['usage-first', 1]]);
  assert.equal(result.gallery[0].asset.id, result.gallery[1].asset.id);
  assert.equal(result.gallery[0].decorative, true); assert.equal(result.gallery[0].alt, '');
  assert.equal(result.gallery[0].caption, 'Zweite Bildunterschrift');
  for (const image of result.gallery) assert.deepEqual(Object.keys(image.asset).sort(), ['id', 'projectId', 'sha256', 'bytes', 'mimeType', 'attribution'].sort());
});

test('outputs own all nested objects and cannot mutate source documents or alias duplicate uses', () => {
  const input = fixture(), before = structuredClone(input), result = projectPageEditorial(input);
  result.introduction[0].text = 'Anderer Text'; result.sections[1].blocks[0].text = 'Anderer Abschnitt';
  result.sections[1].sources[0].label = 'Andere Abschnittsquelle'; result.sources[0].label = 'Andere Gesamtquelle';
  result.sections.find(section => section.id === 'food').emptyDecision.reason = 'Andere Entscheidung';
  result.normalAssets.portrait.attribution = 'Andere Herkunft'; result.gallery[0].asset.attribution = 'Andere Aufnahme';
  assert.notEqual(result.gallery[0].asset.attribution, result.gallery[1].asset.attribution);
  assert.deepEqual(input, before);
});

test('current normal assets preserve stable names and exact quoted attribution; missing/zero-byte roles stay null', () => {
  const input = fixture(), result = projectPageEditorial(input);
  assert.deepEqual(result.normalAssets, input.pageObject.data.document.species.normalAssets);
  assert.equal(result.normalAssets.portrait.attribution, 'Illustration · Quelle „Original“ · Gebundene Erstellung');
  assert.equal(result.normalAssets.map.attribution, 'Quelle: Kartenquelle „Original“');
  delete input.speciesObject.data.assets.files['sound.mp3'];
  input.speciesObject.data.assets.files['spectrogram.webp'].bytes = 0;
  rebindPage(input, document => {
    document.species.dataSha256 = hash(protectedBody(input.speciesObject.data));
    document.species.normalAssets.sound = null; document.species.normalAssets.spectrogram = null;
  });
  const absent = projectPageEditorial(input);
  assert.equal(absent.normalAssets.sound, null); assert.equal(absent.normalAssets.spectrogram, null);
});

test('existing website URL is retained verbatim and a missing URL is never generated from target path or title', () => {
  const input = fixture(); input.speciesObject.data.editorial.websiteUrl = null;
  const result = projectPageEditorial(input);
  assert.equal(result.websiteUrl, null); assert.equal(result.title, input.pageObject.data.document.title);
});

test('page approval, CMS state and history affect data binding but never become reader approval', () => {
  const input = fixture(), before = projectPageEditorial(input), data = input.pageObject.data;
  const body = { revision: data.revision, contentHash: data.contentHash, imagesHash: data.imagesHash,
    reportHash: hash('report'), previewHash: hash('preview'), review: { texts: true, images: true, layout: true }, missingAltAcknowledged: [] };
  data.approval = { ...body, approvalHash: hash(body) };
  data.cms = { status: 'prepared', attemptId: 'attempt-1', revision: data.revision, contentHash: data.contentHash,
    imagesHash: data.imagesHash, planHash: hash('plan'), unpublished: true };
  data.history = [{ kind: 'cms', decision: structuredClone(data.cms) }];
  const after = projectPageEditorial(input);
  assert.notEqual(after.sourceBindings.page.dataHash, before.sourceBindings.page.dataHash);
  assert.equal(after.sourceBindings.page.contentHash, before.sourceBindings.page.contentHash);
  assert.equal(after.readerApproved, false); assert.equal(after.externalPublication, 'not-performed');
  assert.equal('approval' in after, false); assert.equal('cms' in after, false);
});

test('canonical source helper hashes exactly protected keys, includes unknown protected data and excludes editorial', () => {
  const input = fixture(), record = input.speciesObject.data, before = structuredClone(record);
  assert.deepEqual(speciesPageSourceBody(record), protectedBody(record));
  assert.equal(speciesPageSourceHash(record), hash(protectedBody(record)));
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(speciesPageSourceHash(reordered), speciesPageSourceHash(record));
  record.editorial.sections[0].text = 'Nur frühere redaktionelle Alternative geändert';
  const changed = projectPageEditorial(input);
  assert.equal(changed.sourceBindings.species.sourceHash, hash(protectedBody(before)));
  assert.notEqual(changed.sourceBindings.species.dataHash, hash(before));
  const body = speciesPageSourceBody(record); body.input.unknownManual.retained.push('No alias');
  assert.deepEqual(record.input, before.input);
});

test('valid Record 2 editorial adoption preserves the exact Record 1 protected page source identity', () => {
  const input = fixture(), record1 = structuredClone(input.speciesObject.data);
  const projection = projectPageEditorial(input);
  input.speciesObject.data = validateSpeciesRecord({ ...record1, schemaVersion: 2,
    editorial: readerEditorialFromProjection(projection) }, record1.id);
  input.speciesObject.revision = '33333333-3333-4333-8333-333333333333';
  assert.equal(speciesPageSourceHash(input.speciesObject.data), speciesPageSourceHash(record1));
  assert.deepEqual(speciesPageSourceBody(input.speciesObject.data), protectedBody(record1));
  assert.equal(projectPageEditorial(input).sourceBindings.species.sourceHash, projection.sourceBindings.species.sourceHash);
  assert.notEqual(projectPageEditorial(input).sourceBindings.species.dataHash, projection.sourceBindings.species.dataHash);
  assert.deepEqual(record1, fixture().speciesObject.data);
  const invalid = structuredClone(input.speciesObject.data); invalid.schemaVersion = 3;
  assert.throws(() => speciesPageSourceBody(invalid));
});

test('each actual protected source drift invalidates an otherwise intact page snapshot', () => {
  for (const mutate of [
    record => { record.input.size = '31 cm'; },
    record => { record.generated.unknownGenerated.retained = false; },
    record => { record.taxonomyOverride.reason = 'Neue Einordnung'; },
    record => { record.assessmentBinding.id = 54321; },
    record => { record.assets.files['map.jpg'].sha256 = hash('new-map'); },
  ]) {
    const input = fixture(); mutate(input.speciesObject.data);
    assert.throws(() => projectPageEditorial(input), denied('species_source_changed'));
  }
});

test('a valid current source hash cannot authorize forged normal files or attribution in the page snapshot', () => {
  for (const mutate of [
    asset => { asset.id = 'another-normal-file'; }, asset => { asset.sha256 = hash('forged-file'); },
    asset => { asset.bytes++; }, asset => { asset.attribution = 'Erfundene Herkunft'; },
  ]) {
    const input = rebindPage(fixture(), document => mutate(document.species.normalAssets.portrait));
    assert.equal(input.pageObject.data.document.species.dataSha256, hash(protectedBody(input.speciesObject.data)));
    assert.throws(() => projectPageEditorial(input), denied('editorial_normal_assets_changed'));
  }
  const wrongMime = rebindPage(fixture(), document => { document.species.normalAssets.portrait.mimeType = 'image/jpeg'; });
  assert.throws(() => projectPageEditorial(wrongMime), denied('normal_asset_format'));
  const missing = rebindPage(fixture(), document => { document.species.normalAssets.map = null; });
  assert.throws(() => projectPageEditorial(missing), denied('editorial_normal_assets_changed'));
  const invented = fixture(); delete invented.speciesObject.data.assets.files['sound.mp3'];
  rebindPage(invented, document => { document.species.dataSha256 = hash(protectedBody(invented.speciesObject.data)); });
  assert.throws(() => projectPageEditorial(invented), denied('editorial_normal_assets_changed'));
  const renamed = rebindPage(fixture(), document => { document.species.assetName = 'Neuer Anzeigename'; });
  assert.throws(() => projectPageEditorial(renamed), denied('editorial_asset_binding_changed'));
});

test('wrong projects cannot borrow gallery or normal metadata, even with an otherwise matching document', () => {
  const input = fixture(); input.projectId = 'foreign-project';
  assert.throws(() => projectPageEditorial(input), denied('foreign_media'));
  const gallery = rebindPage(fixture(), document => { document.images[0].asset.projectId = 'foreign-project'; });
  assert.throws(() => projectPageEditorial(gallery), denied('foreign_media'));
  const normal = rebindPage(fixture(), document => { document.species.normalAssets.portrait.projectId = 'foreign-project'; });
  assert.throws(() => projectPageEditorial(normal));
});

test('wrong kinds, absent revisions, pending work, conflicts and local-draft envelopes never project as current heads', () => {
  for (const field of ['pageObject', 'speciesObject']) for (const mutate of [
    object => { object.kind = 'media'; }, object => { delete object.revision; },
    object => { object.revision = hash('not-a-server-revision'); },
    object => { object.localPending = true; }, object => { object.localConflict = true; },
    object => { object.localPending = 'false'; }, object => { object.approval = 'local-draft'; },
  ]) {
    const input = fixture(); mutate(input[field]);
    assert.throws(() => projectPageEditorial(input));
  }
  const wrongSpecies = fixture(); wrongSpecies.speciesObject.id = 'different-species';
  assert.throws(() => projectPageEditorial(wrongSpecies));
  const wrongPage = fixture(); wrongPage.pageObject.id = 'another-page';
  assert.throws(() => projectPageEditorial(wrongPage), denied('page_binding_mismatch'));
});

test('forged page hashes, source hashes, identity and malformed media are rejected by the actual contracts', () => {
  const badHash = fixture(); badHash.pageObject.data.imagesHash = hash('wrong-images');
  assert.throws(() => projectPageEditorial(badHash), denied('page_binding_mismatch'));
  const badSource = rebindPage(fixture(), document => { document.species.dataSha256 = hash('wrong-source'); });
  assert.throws(() => projectPageEditorial(badSource), denied('species_source_changed'));
  const wrongIdentity = rebindPage(fixture(), document => { document.slug = 'other-art'; document.species.slug = 'other-art'; });
  assert.throws(() => projectPageEditorial(wrongIdentity), denied('editorial_species_mismatch'));
  const duplicate = rebindPage(fixture(), document => { document.images[1].id = document.images[0].id; });
  assert.throws(() => projectPageEditorial(duplicate), denied('duplicate_id'));
  const extraAsset = rebindPage(fixture(), document => { document.images[0].asset.url = 'https://example.org/arbitrary-image'; });
  assert.throws(() => projectPageEditorial(extraAsset), denied('invalid_fields'));
});
