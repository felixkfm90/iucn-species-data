import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, CLOCK } from './test-fixture.mjs';
import { clone, fingerprint } from './contract.mjs';
import { createCmsReadbackTestProof } from './cms-readback-test-fixture.mjs';

const beginInput = (f, draft, plan) => ({ draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision, planId: plan.id });

test('dispatch rechecks actual media and the current species after preparation, before a browser write', async t => {
  for (const change of ['image-bytes','species-source']) {
    const f=fixture(t),draft=await f.ready(),plan=await f.plan(draft);
    const attempt=(await f.service.beginCmsAttempt('publisher',{draftId:draft.id,mutationId:f.mutationId(),expectedRevision:draft.revision,planId:plan.id})).attempt;
    if(change==='image-bytes')f.bytes.set('photo-a',Buffer.from('Changed after the plan and attempt were prepared'));
    else f.species.revision='species-after-preparation';
    await assert.rejects(f.service.dispatchCmsAttempt('adapter',{mutationId:f.mutationId(),attemptId:attempt.id,
      expectedStateRevision:attempt.stateRevision,dispatchId:'fresh-dispatch'}),{code:change==='image-bytes'?'stale_cms_plan':'species_source_changed'});
    assert.equal(f.repository.attempt('project-a',attempt.id).status,'prepared');
  }
});

async function prepared(t) {
  const f = fixture(t), draft = await f.ready(), plan = await f.plan(draft);
  const attempt = (await f.service.beginCmsAttempt('publisher', { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision, planId: plan.id })).attempt;
  const input = { mutationId: f.mutationId(), attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId: 'readback-dispatch' };
  await f.service.dispatchCmsAttempt('adapter', input);
  const receipt = (extra = {}) => ({ schemaVersion: 2, id: 'readback-receipt', attemptId: attempt.id, planHash: plan.payload.planHash,
    contentHash: plan.payload.contentHash, imagesHash: plan.payload.imagesHash, status: 'saved-unpublished', pageId: 'cms-page-a',
    path: plan.payload.target.path, unpublished: true, observedAt: CLOCK, ...createCmsReadbackTestProof(plan), ...extra });
  return { ...f, draft, plan, attempt, receipt, planFor: f.plan };
}

test('the owner can replace a stale undispatched preparation without losing its original journal entry', async t => {
  const f = fixture(t), original = await f.ready(), firstPlan = await f.plan(original);
  const firstInput = beginInput(f, original, firstPlan);
  const first = (await f.service.beginCmsAttempt('publisher', firstInput)).attempt;
  assert.equal((await f.service.getDraft('publisher', original.id)).cms.canReplacePrepared, false);
  const revised = await f.save(original, doc => { doc.title += ' korrigiert'; });
  const freshPlan = await f.plan(revised), freshInput = beginInput(f, revised, freshPlan);
  const resolve = f.authorities.actorAuthority.resolve;
  f.authorities.actorAuthority.resolve = context => context === 'another-publisher'
    ? { id: 'other-publisher', projectId: 'project-a', role: 'publisher', online: true } : resolve(context);
  const view = (await f.service.getDraft('publisher', revised.id)).cms;
  assert.equal(view.matchesCurrentRevision, false);
  assert.equal(view.canReplacePrepared, true);
  assert.equal((await f.service.getDraft('another-publisher', revised.id)).cms.canReplacePrepared, false);
  await assert.rejects(f.service.beginCmsAttempt('another-publisher', freshInput), { code: 'cms_repeat_blocked' });
  const reopened = f.open(), service = f.build(reopened);
  const replacement = (await service.beginCmsAttempt('publisher', freshInput)).attempt;
  assert.equal(replacement.id, first.id);
  assert.equal(replacement.planId, freshPlan.id);
  assert.equal(replacement.revision, revised.revision);
  assert.equal(replacement.supersedesStateRevision, first.stateRevision);
  assert.notEqual(replacement.stateRevision, first.stateRevision);
  assert.equal((await service.getDraft('publisher', revised.id)).cms.canReplacePrepared, false);
  assert.deepEqual(await service.beginCmsAttempt('publisher', firstInput), { attempt: first, idempotentReplay: true });
  assert.deepEqual(reopened.artifact('project-a', firstPlan.id), firstPlan);
  assert.deepEqual(f.repository.attempt('project-a', first.id), replacement);
  assert.equal(reopened.counts().cms_attempts, 1);
  assert.equal(reopened.counts().cms_receipts, 0);
  await assert.rejects(service.beginCmsAttempt('publisher', beginInput(f, revised, freshPlan)), { code: 'cms_repeat_blocked' });
});

test('an earlier dispatch already checking media cannot dispatch a concurrent replacement', async t => {
  const f = fixture(t), original = await f.ready(), firstPlan = await f.plan(original);
  const first = (await f.service.beginCmsAttempt('publisher', beginInput(f, original, firstPlan))).attempt;
  const writer = f.build(f.open());
  const read = f.authorities.mediaFacade.read;
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  let pause = true;
  f.authorities.mediaFacade.read = async (...args) => {
    if (pause) { pause = false; enter(); await held; }
    return read(...args);
  };
  const dispatch = (service, attempt, dispatchId) => service.dispatchCmsAttempt('adapter', { mutationId: f.mutationId(),
    attemptId: attempt.id, expectedStateRevision: attempt.stateRevision, dispatchId });
  const stale = assert.rejects(dispatch(writer, first, 'stale-dispatch'), { code: 'cms_repeat_blocked' });
  let replacement;
  try {
    await entered;
    const revised = await f.save(original, doc => { doc.title += ' korrigiert'; });
    const freshPlan = await f.plan(revised);
    replacement = (await f.service.beginCmsAttempt('publisher', beginInput(f, revised, freshPlan))).attempt;
  } finally { release(); }
  await stale;
  assert.deepEqual(f.repository.attempt('project-a', first.id), replacement);
  const current = (await dispatch(writer, replacement, 'current-dispatch')).attempt;
  assert.equal(current.status, 'dispatched');
  assert.equal(current.dispatchId, 'current-dispatch');
  assert.equal(current.planId, replacement.planId);
});

test('a revised draft cannot replace a dispatched or concluded attempt', async t => {
  for (const status of ['dispatched', 'uncertain', 'saved-unpublished']) {
    const f = await prepared(t);
    if (status !== 'dispatched') await f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id,
      receipt: status === 'saved-unpublished' ? f.receipt() : f.receipt({ status, pageId: null, unpublished: null, readback: null, mediaBindings: [] }) });
    const revised = await f.save(f.draft, doc => { doc.title += ' korrigiert'; });
    const currentPlan = await f.planFor(revised);
    const view = (await f.service.getDraft('publisher', revised.id)).cms;
    assert.equal(view.status, status);
    assert.equal(view.matchesCurrentRevision, false);
    assert.equal(view.canReplacePrepared, false);
    await assert.rejects(f.service.beginCmsAttempt('publisher', beginInput(f, revised, currentPlan)), { code: 'cms_repeat_blocked' });
    assert.equal(f.repository.attempt('project-a', f.attempt.id).stateRevision, view.stateRevision);
  }
});

test('new plans separately bind private sources and the reconstructible editor expectation', async t => {
  const f = fixture(t); let draft = await f.ready();
  draft = await f.save(draft, document => { document.sources = [{ id: 'local-source-id', label: 'Sichtbarer Quellenwortlaut', sha256: 'b'.repeat(64) }]; });
  const plan = await f.plan(draft), expectation = plan.payload.readback.expectation;
  assert.equal(plan.payload.schemaVersion, 2); assert.equal(plan.payload.readback.schemaVersion, 1);
  assert.equal(plan.payload.readback.expectationHash, fingerprint(expectation));
  assert.notEqual(plan.payload.structureHash, plan.payload.readback.expectationHash);
  assert.doesNotMatch(JSON.stringify(expectation), /local-source-id|photo-a|normalAssetBindings|templateHash|sha256|projectId/);
  assert.ok(JSON.stringify(expectation).includes('Sichtbarer Quellenwortlaut'));
  assert.equal(plan.payload.steps.find(step => step.action === 'readback-and-compare').expectedReadbackHash, fingerprint(expectation));
});

test('hash-only receipts cannot confirm a newly prepared page and leave the actual attempt untouched', async t => {
  const f = await prepared(t), before = f.repository.attempt('project-a', f.attempt.id);
  const old = { id: 'old-hash-only', attemptId: f.attempt.id, planHash: f.plan.payload.planHash, contentHash: f.plan.payload.contentHash,
    imagesHash: f.plan.payload.imagesHash, status: 'saved-unpublished', pageId: 'cms-page-a', path: f.plan.payload.target.path,
    unpublished: true, observedAt: CLOCK, readbackStructureHash: f.plan.payload.structureHash };
  await assert.rejects(f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id, receipt: old }), { code: 'cms_readback_required' });
  const missing = f.receipt(); delete missing.readback;
  await assert.rejects(f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id, receipt: missing }));
  assert.deepEqual(f.repository.attempt('project-a', f.attempt.id), before);
});

test('the core derives both hashes from complete observed values and persists them across reopening', async t => {
  const f = await prepared(t), input = f.receipt();
  const result = await f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id, receipt: input });
  assert.equal(result.attempt.status, 'saved-unpublished');
  assert.equal(result.attempt.receipt.readbackStructureHash, fingerprint(input.readback));
  assert.equal(result.attempt.receipt.mediaBindingsHash, fingerprint(input.mediaBindings));
  assert.notEqual(result.attempt.receipt.readbackStructureHash, f.plan.payload.structureHash);
  assert.deepEqual(f.open().attempt('project-a', f.attempt.id).receipt, result.attempt.receipt);
  assert.equal((await f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id, receipt: input })).idempotentReplay, true);
});

test('an enabled, unsaved, unreopened or wrongly identified page cannot become an unpublished success', async t => {
  const f = await prepared(t);
  for (const change of [value => { value.readback.page.enabled = true; }, value => { value.readback.page.saved = false; },
    value => { value.readback.page.reopened = false; }, value => { value.readback.page.path = '/wildlife/another-page'; },
    value => { value.readback.page.id = 'different-page'; }]) {
    const value = f.receipt(); change(value);
    await assert.rejects(f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id, receipt: value }));
  }
  assert.equal(f.repository.attempt('project-a', f.attempt.id).status, 'dispatched');
});

test('correct captions cannot hide wrong image identities, reordered usages or missing visible credits', async t => {
  const f = await prepared(t);
  for (const change of [value => { value.readback.blocks.find(block => block.type === 'gallery').items[0].cmsAssetId = 'wrong-image'; },
    value => { value.mediaBindings[0].sha256 = 'e'.repeat(64); },
    value => { value.readback.blocks.find(block => block.type === 'gallery').items[0].attribution = ''; }]) {
    const value = f.receipt(); change(value);
    await assert.rejects(f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id, receipt: value }));
  }
  assert.equal(f.repository.attempt('project-a', f.attempt.id).status, 'dispatched');
});

test('unobserved outcomes remain explicitly unknown and cannot carry half a success proof', async t => {
  const f = await prepared(t), value = f.receipt({ status: 'uncertain', pageId: null, unpublished: null, readback: null, mediaBindings: [], reason: 'Antwortverlust nach möglichem Speichern' });
  const result = await f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id, receipt: value });
  assert.equal(result.attempt.status, 'uncertain'); assert.equal(result.attempt.receipt.readbackStructureHash, null);
  assert.equal(result.attempt.receipt.mediaBindingsHash, null); assert.equal(result.attempt.repeatAllowed, false);
  const half = { ...clone(value), id: 'half-proof', readback: f.receipt().readback };
  await assert.rejects(f.service.recordCmsOutcome('adapter', { attemptId: f.attempt.id, receipt: half }));
  const hidden={...clone(value),id:'hidden-mapping',mediaBindings:Object.assign([],{unobserved:true})};
  await assert.rejects(f.service.recordCmsOutcome('adapter',{attemptId:f.attempt.id,receipt:hidden}));
});

test('another publisher cannot deliver an outcome for the original person\'s CMS attempt', async t => {
  const f = await prepared(t), before=f.repository.attempt('project-a',f.attempt.id);
  f.authorities.actorAuthority.resolve=async()=>({id:'another-publisher',projectId:'project-a',role:'publisher',online:true,channel:'cms-adapter'});
  await assert.rejects(f.service.recordCmsOutcome('adapter',{attemptId:f.attempt.id,receipt:f.receipt()}),{code:'cms_attempt_not_found'});
  assert.deepEqual(f.repository.attempt('project-a',f.attempt.id),before);
});

test('after connection loss the same current adapter may retain only an explicitly unknown local outcome',async t=>{
  const f=await prepared(t);
  f.authorities.actorAuthority.resolve=async()=>({id:'felix',projectId:'project-a',role:'publisher',online:false,channel:'cms-adapter'});
  await assert.rejects(f.service.recordCmsOutcome('adapter',{attemptId:f.attempt.id,receipt:f.receipt()}),{code:'online_required'});
  const unknown=f.receipt({status:'uncertain',pageId:null,unpublished:null,readback:null,mediaBindings:[]});
  const result=await f.service.recordCmsOutcome('adapter',{attemptId:f.attempt.id,receipt:unknown});
  assert.equal(result.attempt.status,'uncertain');assert.equal(result.attempt.receipt.readback,null);
  await assert.rejects(f.service.recordCmsOutcome('adapter',{attemptId:f.attempt.id,receipt:{...unknown,id:'offline-failed',status:'failed'}}),{code:'online_required'});
  await assert.rejects(f.service.recordCmsOutcome('adapter',{attemptId:f.attempt.id,receipt:{...unknown,id:'offline-half',pageId:'guessed'}}),{code:'cms_readback_required'});
});
