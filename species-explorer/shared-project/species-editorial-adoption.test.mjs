import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, digest } from './security.mjs';
import { validateSpeciesRecord } from './species-record.mjs';
import { speciesPageSourceBody, speciesPageSourceHash } from './species-editorial.mjs';
import { buildPageEditorialAdoption, verifyPageEditorialAdoption } from './species-editorial-adoption.mjs';
import { createPageEditorialIntent } from './species-editorial-intent.mjs';
import { initialDocument, normalizeSpeciesSnapshot } from '../page-authoring/model.mjs';
import { encodePageAuthoringDraft, pageAuthoringObjectId, pageImagesHash } from '../page-authoring/shared.mjs';
import { fingerprint } from '../page-authoring/contract.mjs';

const limits = { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 };
const canonical = value => canonicalJson(value, limits);
const denied = (code, status = 409) => error => error.code === code && error.status === status;
const changed = denied('editorial_adoption_changed');
const rev = digit => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

function fixture() {
  const projectId = 'adoption-project';
  const record = validateSpeciesRecord({ type: 'fn-species-record', schemaVersion: 1, id: 'fixture-owl',
    input: { genus: 'Strix', species: 'fixture', german: 'Testkauz', english: 'Fixture owl',
      userExtension: { original: [false, 'unverändert'] } },
    generated: { Class: 'Aves', Status: 'Least Concern', protectedUnknown: { original: true } },
    taxonomyOverride: { unknown: ['Geschützte Einordnung'] }, assessmentBinding: { id: 'assessment-123' },
    assets: { assetName: 'Historischer Testkauz', files: {
      'portrait.webp': { id: 'fixture:portrait', bytes: 123, sha256: fingerprint('portrait'), mimeType: 'image/webp' },
    }, overrides: { map: { unknownProtection: true } }, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [{ id: 'original', title: 'Ursprünglich', text: 'Früherer Text', intentionallyEmpty: false }],
      gallery: [], generalSectionId: null, embeddedGeneralText: null } });
  const snapshot = normalizeSpeciesSnapshot({ slug: record.id, scientificName: 'Strix fixture', commonName: 'Testkauz',
    assetName: record.assets.assetName, taxonomy: [{ rank: 'Class', name: 'Aves' }], general: [], status: '',
    revision: `species-${speciesPageSourceHash(record)}`, dataSha256: speciesPageSourceHash(record), runtimeReady: false,
    normalAssets: { portrait: { ...record.assets.files['portrait.webp'], projectId, attribution: '' },
      map: null, sound: null, credits: null, spectrogram: null } }, projectId, record.id);
  const document = initialDocument({ templateId: 'fn-compact-20261031', species: snapshot,
    parentPath: '/wildlife/heimische-tierwelt', title: 'Menschlicher Titel' });
  document.introduction = [{ type: 'paragraph', text: 'Redaktionelle Einleitung' }];
  document.sections.find(section => section.id === 'appearance').blocks = [
    { type: 'heading', level: 5, text: 'Merkmale' }, { type: 'bullet-list', items: ['Erster Punkt', 'Zweiter Punkt'] },
  ];
  document.sources = [{ id: 'source-a', label: 'Quelle „Original“', url: 'https://example.org/field', sha256: fingerprint('source') }];
  const asset = { id: 'image-11111111-1111-4111-8111-111111111111', projectId, sha256: fingerprint('gallery'),
    bytes: 321, mimeType: 'image/png', attribution: 'Eigene Aufnahme' };
  document.images = ['first', 'second'].map(id => ({ id: `usage-${id}`, assetId: asset.id, asset: structuredClone(asset),
    alt: `Ansicht ${id}`, caption: `Beschriftung ${id}`, decorative: false }));
  const pageData = encodePageAuthoringDraft({ id: 'adoption-page', revision: fingerprint('page-version'), document });
  return { projectId, actor: { id: 'fixture-editor', projectId, role: 'contributor', scope: 'full' },
    pageObject: { kind: 'page', id: pageAuthoringObjectId(pageData.pageId), revision: rev('1'), approval: 'draft', data: pageData },
    speciesObject: { kind: 'species', id: record.id, revision: rev('2'), approval: 'draft', data: record } };
}

function claim(input, candidate = buildPageEditorialAdoption(input)) {
  return { ...input, data: candidate.data, intent: candidate.intent };
}
function rebindPage(input, change) {
  const data = input.pageObject.data; change(data.document);
  data.contentHash = fingerprint(data.document); data.imagesHash = pageImagesHash(data.document); data.title = data.document.title;
  return input;
}

test('Record 1 candidate changes only schemaVersion/editorial and binds the trusted complete projection', () => {
  const input = fixture(), before = structuredClone(input), result = buildPageEditorialAdoption(input);
  assert.deepEqual(input, before); assert.equal(result.data.schemaVersion, 2);
  assert.deepEqual(speciesPageSourceBody(result.data), speciesPageSourceBody(before.speciesObject.data));
  for (const key of ['type', 'id', 'input', 'generated', 'taxonomyOverride', 'assessmentBinding', 'assets'])
    assert.deepEqual(result.data[key], before.speciesObject.data[key], key);
  assert.equal(result.data.editorial.title, 'Menschlicher Titel');
  assert.deepEqual(result.data.editorial.introduction, input.pageObject.data.document.introduction);
  assert.deepEqual(result.data.editorial.sections[1].blocks, input.pageObject.data.document.sections[1].blocks);
  assert.equal(result.data.editorial.gallery.length, 2);
  assert.equal(result.data.editorial.gallery[0].asset.id, result.data.editorial.gallery[1].asset.id);
  assert.equal(result.projection.readerApproved, false); assert.equal(result.projection.externalPublication, 'not-performed');
  assert.equal('approval' in result.data, false); assert.equal('cms' in result.data, false);
  assert.deepEqual(result.intent.binding, { projectId: input.projectId, userId: input.actor.id, role: 'contributor' });
  assert.equal(result.intent.projectionHash, digest(canonical(result.projection)));
});

test('verify recomputes the candidate instead of trusting submitted objects and is repeatable without mutation', () => {
  const input = fixture(), request = claim(input), before = structuredClone(request);
  const first = verifyPageEditorialAdoption(request), second = verifyPageEditorialAdoption(request);
  assert.deepEqual(first, second); assert.deepEqual(request, before);
  first.data.editorial.introduction[0].text = 'Nur Rückgabe verändert';
  first.projection.sources[0].label = 'Nur Projektionskopie verändert';
  first.intent.binding.userId = 'only-result';
  assert.deepEqual(request, before); assert.equal(second.data.editorial.introduction[0].text, 'Redaktionelle Einleitung');
});

test('Record 2 can be handed over again with fresh base CAS while an earlier intent stays stale', () => {
  const input = fixture(), first = buildPageEditorialAdoption(input), oldClaim = claim(input, first);
  const next = structuredClone(input); next.speciesObject.data = first.data; next.speciesObject.revision = rev('3');
  const second = buildPageEditorialAdoption(next);
  assert.equal(second.data.schemaVersion, 2);
  assert.deepEqual(speciesPageSourceBody(second.data), speciesPageSourceBody(input.speciesObject.data));
  assert.equal(second.projection.sourceBindings.species.sourceHash, first.projection.sourceBindings.species.sourceHash);
  assert.equal(second.intent.sourceBindings.species.objectRevision, rev('3'));
  assert.notEqual(second.intent.sourceBindings.species.dataHash, first.intent.sourceBindings.species.dataHash);
  assert.deepEqual(verifyPageEditorialAdoption(claim(next, second)), second);
  assert.throws(() => verifyPageEditorialAdoption({ ...oldClaim, speciesObject: next.speciesObject }), changed);
});

test('the supplied species base is independent from a concurrent head; the page must still be exact HEAD', () => {
  const base = fixture(), request = claim(base), concurrentHead = structuredClone(base.speciesObject);
  concurrentHead.revision = rev('3'); concurrentHead.data.input.english = 'Neuere parallele Eingabe';
  assert.deepEqual(verifyPageEditorialAdoption(request).data, request.data);
  assert.throws(() => verifyPageEditorialAdoption({ ...request, speciesObject: concurrentHead }), changed);
  const pageHead = structuredClone(base.pageObject); pageHead.revision = rev('4');
  assert.throws(() => verifyPageEditorialAdoption({ ...request, pageObject: pageHead }), changed);
});

test('actual actor identity, effective role, scope and project are bound and cannot borrow an old intent', () => {
  const request = claim(fixture());
  for (const change of [{ id: 'other-editor' }, { role: 'publisher' }, { role: 'reader' }, { scope: 'read' }, { projectId: 'foreign-project' }]) {
    assert.throws(() => verifyPageEditorialAdoption({ ...request, actor: { ...request.actor, ...change } }), changed);
  }
  assert.throws(() => verifyPageEditorialAdoption({ ...request, projectId: 'foreign-project' }), changed);
  for (const role of ['admin', 'publisher', 'contributor']) {
    const input = fixture(); input.actor.role = role;
    assert.equal(verifyPageEditorialAdoption(claim(input)).intent.binding.role, role);
  }
});

test('protected source edits, editorial base edits and page content changes invalidate the old exact claim', () => {
  for (const change of [
    input => { input.speciesObject.data.input.english = 'Anderer Wert'; },
    input => { input.speciesObject.data.editorial.sections[0].text = 'Anderer voriger Redaktionstext'; },
    input => rebindPage(input, document => { document.title = 'Anderer Seitentitel'; }),
    input => rebindPage(input, document => { document.images.reverse(); }),
    input => rebindPage(input, document => { document.sources[0].label = 'Andere Quelle'; }),
  ]) {
    const input = fixture(), request = claim(input); change(input);
    assert.throws(() => verifyPageEditorialAdoption({ ...request, ...input }), changed);
  }
});

test('a submitted record cannot add protected edits or alter any adopted rich content', () => {
  for (const mutate of [
    data => { data.input.german = 'Anderer Artname'; },
    data => { data.assets.assetName = 'Anderer Ordner'; },
    data => { data.generated.protectedUnknown.original = false; },
    data => { data.editorial.introduction[0].text = 'Fremder Text'; },
    data => { data.editorial.gallery[0].caption = 'Fremde Beschriftung'; },
    data => { data.editorial.sections[1].blocks.reverse(); },
    data => { data.editorial.sourceBindings.page.dataHash = fingerprint('forged'); },
  ]) {
    const request = claim(fixture()); mutate(request.data);
    assert.throws(() => verifyPageEditorialAdoption(request), changed);
  }
});

test('plausible but rebound intent hashes, source revisions and actors fail exact recomputation', () => {
  for (const mutate of [
    intent => { intent.projectionHash = fingerprint('forged-projection'); },
    intent => { intent.sourceBindings.page.dataHash = fingerprint('forged-page'); },
    intent => { intent.sourceBindings.species.dataHash = fingerprint('forged-species'); },
    intent => { intent.sourceBindings.page.objectRevision = rev('5'); },
    intent => { intent.sourceBindings.species.objectRevision = rev('6'); },
    intent => { intent.binding.userId = 'another-user'; },
  ]) {
    const request = claim(fixture()); mutate(request.intent);
    assert.throws(() => verifyPageEditorialAdoption(request), changed);
  }
});

test('malformed claims are 400 invalid intent; changed data and unconfirmed source work are 409 changed', () => {
  for (const mutate of [
    intent => { intent.unexpected = true; }, intent => { delete intent.binding; },
    intent => { intent.projectionHash = 'not-a-hash'; }, intent => { intent.sourceBindings.page.objectRevision = fingerprint('not-uuid'); },
  ]) {
    const request = claim(fixture()); mutate(request.intent);
    assert.throws(() => verifyPageEditorialAdoption(request), denied('invalid_editorial_intent', 400));
  }
  for (const mutate of [request => { request.data = null; }, request => { request.data.editorial.extra = true; },
    request => { request.pageObject.localPending = true; }, request => { request.speciesObject.localConflict = true; }]) {
    const request = claim(fixture()); mutate(request);
    assert.throws(() => verifyPageEditorialAdoption(request), changed);
  }
});

test('projection hash uses the full canonical 8 MiB budget and exact equality ignores object key insertion order only', () => {
  const input = fixture();
  rebindPage(input, document => { document.introduction = Array.from({ length: 4 }, (_, index) => ({ type: 'paragraph', text: `${index}:` + 'a'.repeat(70000) })); });
  const result = buildPageEditorialAdoption(input);
  assert.ok(Buffer.byteLength(canonical(result.projection)) > 256 * 1024);
  assert.equal(result.intent.projectionHash, digest(canonical(result.projection)));
  const reordered = Object.fromEntries(Object.entries(result.data).reverse());
  assert.deepEqual(verifyPageEditorialAdoption({ ...input, data: reordered, intent: result.intent }).data, result.data);
  const supplied = createPageEditorialIntent({ sourceBindings: result.intent.sourceBindings,
    projectionHash: result.intent.projectionHash, actor: result.intent.binding });
  assert.deepEqual(verifyPageEditorialAdoption({ ...input, data: result.data, intent: supplied }).intent, result.intent);
});
