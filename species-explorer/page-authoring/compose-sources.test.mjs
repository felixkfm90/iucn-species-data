import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, CLOCK } from './test-fixture.mjs';
import { canonical, clone, fingerprint } from './contract.mjs';
import { composePage, verifyDocumentMedia } from './compose.mjs';

const source = (id, label = id, extra = {}) => ({ id, label, ...extra });
const sourceSlots = structure => structure.slots.filter(slot => slot.type === 'source');

test('a complete source plan rechecks media before dispatch and replays only its existing journal acknowledgement', async t => {
  const f = fixture(t); let draft = await f.ready();
  draft = await f.save(draft, document => { document.sources = [source('complete-source', 'Vollständige Seitenquelle')]; });
  const plan = await f.plan(draft), attempt = (await f.service.beginCmsAttempt('publisher', {
    draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision, planId: plan.id,
  })).attempt;
  const beforeReads = f.readCalls, beforeTargets = f.targetCalls;
  const input = { mutationId: f.mutationId(), attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: 'current-source-plan' };
  const result = await f.service.dispatchCmsAttempt('adapter', input);
  assert.equal(result.attempt.status, 'dispatched'); assert.equal(result.idempotentReplay, false);
  assert.ok(f.readCalls>beforeReads); assert.equal(f.targetCalls, beforeTargets); const afterDispatchReads=f.readCalls;
  const replay = await f.service.dispatchCmsAttempt('adapter', input);
  assert.equal(replay.idempotentReplay, true); assert.deepEqual(replay.attempt, result.attempt);
  assert.equal(f.readCalls,afterDispatchReads);
});

test('CMS plan retains every section and page source with its complete ordered binding', async t => {
  const f = fixture(t);
  let draft = await f.ready();
  draft = await f.save(draft, document => {
    for (const section of document.sections) section.sources = [
      source(`${section.id}-first`, `${section.title} · Erste Quelle`, { url: 'https://example.org/reference', sha256: 'a'.repeat(64) }),
      source(`${section.id}-second`, `${section.title} · Zweite Quelle`),
    ];
    document.sources = [source('page-first', 'Seitenquelle', { sha256: 'b'.repeat(64) }), source('page-second', 'Weitere Seitenquelle', { url: 'https://example.org/page' })];
  });
  const plan = await f.plan(draft);
  const expected = draft.document.sections.flatMap(section => section.sources.map(value => ({ type: 'source', sectionId: section.id, source: value })))
    .concat(draft.document.sources.map(value => ({ type: 'source', source: value })));
  assert.deepEqual(sourceSlots(plan.payload.structure), expected);
  assert.deepEqual(plan.payload.steps.filter(step => step.action === 'insert-observed-editor-block' && step.slot.type === 'source').map(step => step.slot), expected);
  assert.equal(plan.payload.structureHash, fingerprint(plan.payload.structure));
  assert.equal(f.repository.counts().cms_attempts, 0);
  assert.equal(plan.payload.publish, false);
  assert.equal(plan.payload.automaticRetry, false);
});

test('source positions follow actual section and list order and remain after their own content', async t => {
  const f = fixture(t);
  let draft = await f.ready();
  const repeated = source('shared-reference', 'Dieselbe Quelle an mehreren Stellen', { url: 'https://example.org/shared' });
  draft = await f.save(draft, document => {
    const appearance = document.sections.find(section => section.id === 'appearance');
    const habitat = document.sections.find(section => section.id === 'habitat');
    const appearanceIndex = document.sections.indexOf(appearance), habitatIndex = document.sections.indexOf(habitat);
    [document.sections[appearanceIndex], document.sections[habitatIndex]] = [habitat, appearance];
    habitat.sources = [source('habitat-b'), source('habitat-a')];
    appearance.sources = [repeated];
    document.sections[0].sources = [repeated];
    document.sections.at(-1).sources = [source('map-source')];
    document.sources = [repeated, source('page-last')];
  });
  const preview = await f.service.preview('publisher', { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision });
  const slots = preview.structure.slots;
  assert.deepEqual(sourceSlots(preview.structure).map(slot => [slot.sectionId ?? null, slot.source.id]), [
    ['general', 'shared-reference'], ['habitat', 'habitat-b'], ['habitat', 'habitat-a'],
    ['appearance', 'shared-reference'], ['map', 'map-source'], [null, 'shared-reference'], [null, 'page-last'],
  ]);
  for (const section of draft.document.sections.filter(value => value.sources.length)) {
    const headingIndex = slots.findIndex(slot => slot.type === 'heading' && slot.sectionId === section.id);
    const nextHeadingIndex = slots.findIndex((slot, index) => index > headingIndex && slot.type === 'heading' && slot.level === 4);
    const sectionSources = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.type === 'source' && slot.sectionId === section.id);
    assert.ok(sectionSources.every(({ index }) => index > headingIndex && (nextHeadingIndex === -1 || index < nextHeadingIndex)));
    const contentIndexes = slots.map((slot, index) => ({ slot, index })).filter(({ slot, index }) => index > headingIndex
      && (nextHeadingIndex === -1 || index < nextHeadingIndex) && ['richtext', 'code'].includes(slot.type));
    assert.ok(contentIndexes.every(({ index }) => index < sectionSources[0].index));
  }
  const galleryIndex = slots.findIndex(slot => slot.type === 'gallery');
  assert.ok(slots.every((slot, index) => slot.type !== 'source' || slot.sectionId !== undefined || index > galleryIndex));
  const visibleLabels = [...preview.html.matchAll(/<p class="source">([^<]*)<\/p>/g)].map(match => match[1]);
  assert.ok(visibleLabels.indexOf('habitat-b') < visibleLabels.indexOf('habitat-a'));
});

test('source labels and URLs stay exact in semantic slots and escaped in the local rendering', async t => {
  const f = fixture(t);
  let draft = await f.ready();
  const label = 'Quelle <script>alert("x")</script> & \'Zitat\' ohne Punkt';
  const url = 'https://example.org/reference?first=one&second=%22two%22';
  draft = await f.save(draft, document => {
    document.sections[1].sources = [source('section-hostile', label, { url, sha256: 'c'.repeat(64) })];
    document.sources = [source('page-hostile', label, { url })];
  });
  const before = canonical(draft);
  const preview = await f.service.preview('publisher', { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision });
  assert.equal(canonical(draft), before);
  assert.equal(sourceSlots(preview.structure)[0].source.label, label);
  assert.equal(sourceSlots(preview.structure)[0].source.url, url);
  assert.equal(sourceSlots(preview.structure)[0].source.sha256, 'c'.repeat(64));
  const rendered = '<p class="source">Quelle &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Zitat&#39; ohne Punkt · https://example.org/reference?first=one&amp;second=%22two%22</p>';
  assert.equal(preview.html.split(rendered).length - 1, 2);
  assert.ok(!preview.html.includes('<script>'));
  assert.ok(!preview.html.includes('<a '));
});

test('persisted CMS plan roundtrips complete source metadata without touching the saved document', async t => {
  const f = fixture(t);
  let draft = await f.ready();
  draft = await f.save(draft, document => {
    document.sections[1].sources = [source('section-ref', 'Abschnitt', { url: 'https://example.org/section', sha256: 'd'.repeat(64) })];
    document.sources = [source('page-ref', 'Gesamtseite', { url: 'https://example.org/page', sha256: 'e'.repeat(64) })];
  });
  const documentBefore = canonical(draft.document), plan = await f.plan(draft);
  const reopened = f.open(), restored = reopened.artifact(draft.projectId, plan.id);
  assert.deepEqual(restored.payload.structure, plan.payload.structure);
  assert.deepEqual(sourceSlots(JSON.parse(canonical(restored.payload.structure))), sourceSlots(plan.payload.structure));
  assert.equal(restored.payload.structureHash, fingerprint(restored.payload.structure));
  assert.equal(canonical(reopened.read(draft.projectId, draft.id).document), documentBefore);
  assert.equal(restored.payload.target.checkedAt, CLOCK);
  assert.equal(reopened.counts().cms_attempts, 0);
});

test('source identity, hash, text, URL, scope and order all participate in the CMS structure hash', async t => {
  const f = fixture(t);
  let draft = await f.ready();
  draft = await f.save(draft, document => {
    document.sections[1].sources = [source('first-ref', 'Erste Quelle', { url: 'https://example.org/first', sha256: 'a'.repeat(64) }), source('second-ref', 'Zweite Quelle')];
    document.sources = [source('page-ref', 'Seitenquelle')];
  });
  const media = await verifyDocumentMedia(draft.document, f.authorities.mediaFacade, 'publisher');
  const baseline = composePage(draft, media);
  const changes = [
    ['identity', document => { document.sections[1].sources[0].id = 'renamed-ref'; }, false],
    ['hash', document => { document.sections[1].sources[0].sha256 = 'b'.repeat(64); }, false],
    ['text', document => { document.sections[1].sources[0].label = 'Bewusst geänderte Quelle'; }, true],
    ['URL', document => { document.sections[1].sources[0].url = 'https://example.org/changed'; }, true],
    ['order', document => { document.sections[1].sources.reverse(); }, true],
    ['scope', document => { document.sources.push(document.sections[1].sources.shift()); }, true],
    ['removal', document => { document.sources = []; }, true],
  ];
  for (const [name, change, visibleChange] of changes) {
    const changed = clone(draft); change(changed.document);
    const result = composePage(changed, media);
    assert.notEqual(result.report.structureHash, baseline.report.structureHash, name);
    assert.notEqual(result.report.contentHash, baseline.report.contentHash, name);
    assert.equal(result.report.imagesHash, baseline.report.imagesHash, name);
    assert.equal(result.report.previewHash === baseline.report.previewHash, !visibleChange, name);
  }
});

test('source changes require a new human approval before a new CMS plan', async t => {
  const f = fixture(t);
  let draft = await f.ready();
  draft = await f.save(draft, document => { document.sources = [source('page-ref', 'Belegte Quelle', { sha256: 'a'.repeat(64) })]; });
  const oldPlan = await f.plan(draft);
  const oldStructureHash = oldPlan.payload.structureHash;
  const approval = await f.repository.latestArtifact(draft.projectId, draft.id, 'approval', draft.revision);
  const changed = await f.save(draft, document => { document.sources[0].sha256 = 'b'.repeat(64); });
  await assert.rejects(f.service.prepareCmsPlan('publisher', { draftId: changed.id, mutationId: f.mutationId(), expectedRevision: changed.revision, approvalId: approval.id }), error => error.code === 'stale_approval');
  const newPlan = await f.plan(changed);
  assert.notEqual(newPlan.payload.structureHash, oldStructureHash);
  assert.equal(f.repository.artifact(draft.projectId, oldPlan.id).payload.structureHash, oldStructureHash);
  assert.equal(f.repository.counts().cms_attempts, 0);
});
