import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, CLOCK } from './test-fixture.mjs';
import { createExplorerCmsExecution } from './explorer-cms.mjs';
import { createPageAuthoringService } from './service.mjs';
import { createCmsBoundSaveTestProof, createCmsReadbackTestProof } from './cms-readback-test-fixture.mjs';
import { editableDocument } from './model.mjs';
import { normalizeActor, fingerprint, sha256, clone } from './contract.mjs';
import { createTestPng } from '../server-test-fixtures.mjs';
import { EventEmitter } from 'node:events';
import { createSquarespaceBrowserAdapter } from '../desktop/squarespace-browser.mjs';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function scenario(t) {
  const f = fixture(t), hooks = {}, setups = [], calls = [];
  const state = { status: { baseUrl: 'https://project.invalid', projectId: 'project-a', user: { id: 'felix', role: 'publisher', version: 1 },
    connection: 'online', readOnlySession: false }, permissions: { canRead: true, canEdit: true, canCreate: true, canApprove: true }, editMode: true };
  let inFacade = false, chain = Promise.resolve(), appOpen = true, browserCloses = 0;
  const frame = () => ({ ...clone(state), permissions: { ...state.permissions,
    canCreate: state.permissions.canCreate && state.status.connection === 'online', canApprove: state.permissions.canApprove && state.status.connection === 'online' } });
  const client = { async refresh() { await hooks.refresh?.(); return clone(state.status); },
    async capabilities() { await hooks.capabilities?.(); return { projectId: state.status.projectId, user: clone(state.status.user) }; },
    async status() { await hooks.status?.(); return clone(state.status); } };
  const withClient = work => {
    const operation = chain.then(async () => { assert.equal(inFacade, false); inFacade = true;
      try { return await work(client, frame()); } finally { inFacade = false; } });
    chain = operation.catch(() => {}); return operation;
  };
  const mediaFacade = { async describe(context, id) { await hooks.describe?.(context, id); return clone(f.metadata.get(id)); },
    async read(context, id) { await hooks.read?.(context, id); return f.bytes.get(id); } };
  const image = createTestPng(8, 6); f.bytes.set('photo-a', image);
  f.metadata.set('photo-a', { ...f.metadata.get('photo-a'), sha256: sha256(image), bytes: image.length });
  const setup = (actualClient, currentState, { trustedCms = false } = {}) => {
    const status = currentState.status, a = normalizeActor({ id: status.user.id, projectId: status.projectId, role: status.user.role,
      online: status.connection === 'online', ...(trustedCms ? { channel: 'cms-adapter' } : {}) });
    const sourceScope = fingerprint([status.baseUrl, a.projectId, a.id]);
    setups.push({ sourceScope, channel: a.channel, online: a.online });
    const repo = f.repository.scoped({ origin: status.baseUrl, actorId: a.id }), context = { client: actualClient, state: currentState, actor: a, sourceScope };
    return { client: actualClient, state: currentState, a, sourceScope, repo, context,
      core: () => createPageAuthoringService({ repository: repo, actorAuthority: { resolve: async () => a },
        speciesAuthority: f.authorities.speciesAuthority, mediaFacade, targetAuthority: f.authorities.targetAuthority, now: () => CLOCK }) };
  };
  const inputFor = (env, value) => { assert.equal(value.sourceScope, env.sourceScope); const { sourceScope, ...body } = value; return body; };
  const view = async (env, id) => { const value = await env.core(id).getDraft(env.context, id);
    return { sourceScope: env.sourceScope, draft: value.draft, cms: value.cms, externalPublication: 'not-performed' }; };
  const adapter = { pageAuthoringAvailable: true, async createUnpublishedPage(payload, callbacks) {
    assert.equal(inFacade, false, 'Browser must run outside the serialized facade'); calls.push({ payload, callbacks });
    if (hooks.driver) return hooks.driver(payload, callbacks);
    await callbacks.beforeWrite(); await callbacks.assertCurrent(); await callbacks.readMedia('photo-a');
    return createCmsReadbackTestProof({ payload });
  }, async recheckUnpublishedPage(payload, options) {
    assert.equal(inFacade, false, 'The verification must run outside the serialized facade');
    return hooks.recheck(payload, options);
  }, async close() { browserCloses++; } };
  const api = createExplorerCmsExecution({ withClient, setup, inputFor, view, cmsAdapter: adapter, mediaFacade, now: () => CLOCK,
    assertOpen() { if (!appOpen) throw Object.assign(new Error('Closed'), { code: 'workspace_closed' }); } });
  t.after(() => api.close());
  const env = setup(client, frame()), core = env.core('draft-a');
  let draft = (await core.createDraft(env.context, { draftId: 'draft-a', mutationId: f.mutationId(), templateId: 'fn-compact-20261031', slug: f.species.slug,
    parentPath: '/wildlife/heimische-tierwelt' })).draft;
  const document = editableDocument(draft.document);
  for (const section of document.sections) if (section.kind === undefined && !['general', 'map'].includes(section.id)) section.blocks = [{ type: 'paragraph', text: `Gelieferter Fachtext ${section.id}` }];
  document.images = [{ id: 'image-a', assetId: 'photo-a', alt: 'Geprüftes Motiv', caption: 'Beschriftung ohne Punkt', decorative: false }];
  draft = (await core.saveDraft(env.context, { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision, document })).draft;
  const preview = await core.preview(env.context, { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision });
  const approval = await core.approve(env.context, { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision,
    previewId: preview.artifact.id, reportHash: preview.report.reportHash, review: { texts: true, images: true, layout: true }, missingAltAcknowledged: [] });
  const plan = (await core.prepareCmsPlan(env.context, { draftId: draft.id, mutationId: f.mutationId(), expectedRevision: draft.revision, approvalId: approval.artifact.id })).artifact;
  const beginInput = () => ({ sourceScope: env.sourceScope, draftId: draft.id, expectedRevision: draft.revision, planId: plan.id, mutationId: f.mutationId() });
  const begin = async () => { const result = await api.begin(beginInput()), attempt = result.result.attempt;
    return { result, attempt, request: { sourceScope: env.sourceScope, draftId: draft.id, attemptId: attempt.id, expectedStateRevision: attempt.stateRevision } }; };
  return { f, hooks, state, setups, calls, env, api, adapter, plan, draft, beginInput, begin, image,
    get browserCloses() { return browserCloses; }, closeApp() { appOpen = false; } };
}

test('real personal SQLite begin and browser execution use separate facade phases and the existing core receipts', async t => {
  const s = await scenario(t), prepared = await s.begin();
  assert.equal(prepared.result.cms.status, 'prepared'); assert.equal(s.calls.length, 0);
  assert.equal(s.setups.at(-1).channel, 'interactive');
  const result = await s.api.execute(prepared.request);
  assert.equal(result.cms.status, 'saved-unpublished'); assert.equal(result.result.attempt.id, prepared.attempt.id);
  assert.equal(result.externalPublication, 'not-performed'); assert.equal(s.calls.length, 1);
  assert.equal(s.env.repo.counts().cms_receipts, 1); assert.equal(s.api.blockingState().busy, false);
  assert.ok(s.setups.some(value => value.channel === 'cms-adapter'));
  await assert.rejects(s.api.execute(prepared.request), { code: 'cms_repeat_blocked' }); assert.equal(s.calls.length, 1);
});

test('the bound save target survives reopening SQLite and matches the eventual CMS receipt', async t => {
  for (const outcome of ['confirmed', 'lost-save-confirmation', 'another-page']) {
    const s = await scenario(t), prepared = await s.begin();
    let binding;
    s.hooks.driver = async (payload, callbacks) => {
      const dispatch = await callbacks.beforeWrite();
      const observed = createCmsBoundSaveTestProof(payload, dispatch), { proof } = observed;
      binding = observed.binding;
      assert.equal(await callbacks.rememberSaveBinding(binding), true);
      const reopened = s.f.open().scoped({ origin: s.state.status.baseUrl, actorId: s.state.status.user.id });
      const beforeSave = reopened.attempt('project-a', prepared.attempt.id);
      assert.equal(beforeSave.status, 'dispatched');
      assert.equal(beforeSave.receipt, null);
      assert.deepEqual(beforeSave.saveBinding, binding);
      assert.equal(await callbacks.rememberSaveBinding(binding), true);
      assert.equal(reopened.attempt('project-a', prepared.attempt.id).stateRevision, beforeSave.stateRevision);
      await callbacks.assertCurrent();
      if (outcome === 'lost-save-confirmation') throw Object.assign(new Error('Lost save response'), {
        code: 'SQUARESPACE_PAGE_SAVE_UNCONFIRMED', stage: 'confirm-save' });
      if (outcome === 'another-page') proof.readback.page.id = 'd'.repeat(24);
      return proof;
    };
    const result = await s.api.execute(prepared.request);
    const stored = s.env.repo.attempt('project-a', prepared.attempt.id);
    assert.deepEqual(stored.saveBinding, binding);
    assert.equal(result.cms.status, outcome === 'confirmed' ? 'saved-unpublished' : 'uncertain');
    assert.equal(stored.receipt.pageId, outcome === 'confirmed' ? binding.pageId : null);
    assert.equal(Object.hasOwn(result.cms, 'saveBinding'), false);
    assert.equal(Object.hasOwn(result.result.attempt, 'saveBinding'), false);
    assert.equal(s.env.repo.counts().cms_receipts, 1);
  }
});

test('the bound read-only recheck can confirm an interrupted save without sending any new CMS writes', async t => {
  for (const outcome of ['confirmed', 'wrong-page', 'role-changed', 'browser-failed']) {
    const s = await scenario(t), prepared = await s.begin();
    let observed;
    s.hooks.driver = async (payload, callbacks) => {
      observed = createCmsBoundSaveTestProof(payload, await callbacks.beforeWrite());
      await callbacks.rememberSaveBinding(observed.binding);
      throw Object.assign(new Error('The save response was lost'), { code: 'SQUARESPACE_PAGE_SAVE_UNCONFIRMED' });
    };
    const initial = await s.api.execute(prepared.request);
    assert.equal(initial.cms.status, 'uncertain');
    assert.equal(initial.cms.canRecheckSave, true);
    const request = { ...prepared.request, expectedStateRevision: initial.cms.stateRevision };
    await assert.rejects(s.api.recheck({ ...request, readback: observed.proof }), { code: 'invalid_cms_input' });
    const previous = s.env.repo.attempt('project-a', initial.cms.id);
    let reads = 0;
    s.hooks.recheck = async (payload, { saveBinding, assertCurrent, signal, ...options }) => {
      reads++;
      assert.equal(payload.planHash, s.plan.payload.planHash);
      assert.deepEqual(saveBinding, observed.binding);
      assert.deepEqual(options, {});
      assert.equal(signal.aborted, false);
      await assertCurrent();
      if (outcome === 'role-changed') s.state.status.user.version++;
      if (outcome === 'wrong-page') observed.proof.readback.page.id = 'd'.repeat(24);
      if (outcome === 'browser-failed') throw new Error('https://private.invalid/?token=secret');
      return observed.proof;
    };
    if (outcome === 'confirmed') {
      const checked = await s.api.recheck(request);
      assert.equal(checked.cms.status, 'saved-unpublished');
      assert.equal(checked.cms.canRecheckSave, false);
      assert.equal(checked.externalPublication, 'not-performed');
      assert.equal(s.env.repo.counts().cms_receipts, 2);
      await assert.rejects(s.api.recheck(request), { code: 'cms_binding_changed' });
    } else {
      await assert.rejects(s.api.recheck(request), {
        code: { 'wrong-page': 'cms_save_binding_mismatch', 'role-changed': 'cms_binding_changed', 'browser-failed': 'cms_recheck_unconfirmed' }[outcome],
      });
      assert.deepEqual(s.env.repo.attempt('project-a', initial.cms.id), previous);
      assert.equal(s.env.repo.counts().cms_receipts, 1);
    }
    assert.equal(reads, 1);
    assert.equal(s.calls.length, 1);
  }
});

test('closing the workspace cancels and joins a pending recheck without replacing the open receipt', async t => {
  const s = await scenario(t), prepared = await s.begin(), entered = deferred(), release = deferred();
  let observed, signal;
  s.hooks.driver = async (payload, callbacks) => {
    observed = createCmsBoundSaveTestProof(payload, await callbacks.beforeWrite());
    await callbacks.rememberSaveBinding(observed.binding);
    throw new Error('Unconfirmed save');
  };
  const initial = await s.api.execute(prepared.request);
  const previous = s.env.repo.attempt('project-a', initial.cms.id);
  s.hooks.recheck = async (_payload, options) => {
    signal = options.signal;
    await options.assertCurrent();
    entered.resolve();
    await release.promise;
    return observed.proof;
  };
  const checking = s.api.recheck({ ...prepared.request, expectedStateRevision: initial.cms.stateRevision });
  const rejected = assert.rejects(checking);
  await entered.promise;
  let closed = false;
  const closing = s.api.close().then(() => { closed = true; });
  assert.equal(signal.aborted, true);
  assert.equal(closed, false);
  release.resolve();
  await rejected;
  await closing;
  assert.equal(closed, true);
  assert.deepEqual(s.env.repo.attempt('project-a', initial.cms.id), previous);
});

test('the browser receives the actual durable dispatch and a neutral title from its trusted journal hook', async t => {
  const s = await scenario(t), prepared = await s.begin();
  let binding;
  s.hooks.driver = async (payload, callbacks) => {
    binding = await callbacks.beforeWrite();
    const reopened = s.f.open().scoped({ origin: s.state.status.baseUrl, actorId: s.state.status.user.id });
    const actual = reopened.attempt('project-a', prepared.attempt.id);
    assert.equal(actual.status, 'dispatched');
    assert.deepEqual(binding, { kind: 'fn-cms-dispatch-binding', schemaVersion: 1, projectId: 'project-a',
      attemptId: actual.id, dispatchId: actual.dispatchId, planHash: payload.planHash,
      targetPath: payload.target.path, placeholderTitle: `FN Artseitenentwurf ${actual.dispatchId}` });
    assert.equal(s.env.repo.attempt('project-a', actual.id).dispatchId, binding.dispatchId);
    await callbacks.assertCurrent();
    return createCmsReadbackTestProof({ payload });
  };
  const result = await s.api.execute(prepared.request);
  assert.equal(result.cms.status, 'saved-unpublished');
  assert.equal(result.result.attempt.dispatchId, binding.dispatchId);
  await assert.rejects(s.api.execute(prepared.request), { code: 'cms_repeat_blocked' });
  assert.equal(s.calls.length, 1);
});

test('capability and exact IDs-only requests reject before any browser call or attempt mutation', async t => {
  const s = await scenario(t);
  s.adapter.pageAuthoringAvailable = false;
  await assert.rejects(s.api.begin(s.beginInput()), { code: 'cms_adapter_unavailable' });
  assert.equal(s.env.repo.counts().cms_attempts, 0); s.adapter.pageAuthoringAvailable = true;
  await assert.rejects(s.api.begin({ ...s.beginInput(), plan: s.plan.payload }), { code: 'invalid_cms_input' });
  const prepared = await s.begin();
  await assert.rejects(s.api.execute({ ...prepared.request, readback: {} }), { code: 'invalid_cms_input' });
  await assert.rejects(s.api.execute({ ...prepared.request, sourceScope: fingerprint('other-source') }), { code: 'cms_binding_changed' });
  assert.equal(s.calls.length, 0); assert.equal(s.env.repo.attempt('project-a', prepared.attempt.id).status, 'prepared');
});

test('busy or login failure before the browser dispatch callback leaves the prepared attempt unchanged', async t => {
  for (const code of ['SQUARESPACE_BUSY', 'SQUARESPACE_LOGIN_REQUIRED']) {
    const s = await scenario(t), prepared = await s.begin();
    s.hooks.driver = async () => { throw Object.assign(new Error('https://private.invalid/?token=do-not-show'), { code }); };
    await assert.rejects(s.api.execute(prepared.request), error => error.code === code && !error.message.includes('private.invalid'));
    assert.deepEqual(s.env.repo.attempt('project-a', prepared.attempt.id), prepared.attempt);
    assert.equal(s.env.repo.counts().cms_receipts, 0);
  }
});

test('actual browser readiness refusal leaves the personal SQLite attempt prepared; only an explicit later call dispatches it', async t => {
  const s = await scenario(t), prepared = await s.begin();
  let ready = false, occupied = true, reads = 0, writes = 0;
  class FixtureWindow extends EventEmitter {
    constructor() {
      super(); this.destroyed = false; this.visible = false; this.url = '';
      this.webContents = new EventEmitter();
      this.webContents.session = Object.assign(new EventEmitter(), {
        setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDevicePermissionHandler() {},
      });
      Object.assign(this.webContents, { isDestroyed: () => this.destroyed, getURL: () => this.url, setWindowOpenHandler() {} });
    }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    isVisible() { return this.visible; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    async loadURL(url) { this.url = url; }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const browser = createSquarespaceBrowserAdapter({ BrowserWindow: FixtureWindow, driver: {
    async getStatus() { return { connected: true, status: 'connected' }; },
    async transfer() { throw new Error('No image-text operation expected'); }, async checkNewTarget() {},
    async uploadLibraryImage() { throw new Error('No native file upload expected from this fixture'); },
    async prepareUnpublishedPage(_contents, payload, options) {
      reads++; assert.deepEqual(Object.keys(options), ['signal', 'contentSteps']);
      assert.deepEqual(options.contentSteps.filter(step => step.kind !== 'text').map(step => step.kind), ['species', 'map', 'gallery']);
      assert.deepEqual(s.env.repo.attempt('project-a', prepared.attempt.id), prepared.attempt);
      if (!ready) throw Object.assign(new Error('The actual frame is still empty'), { code: 'SQUARESPACE_EDITOR_NOT_READY' });
      const path = payload.target.path;
      return { ready: true, planHash: payload.planHash, targetPath: path,
        targetObservation: { path, parentPath: path.slice(0, path.lastIndexOf('/')), parentExists: true, exists: occupied, online: true,
          observationId: 'browser-fresh-target', checkedAt: new Date().toISOString() } };
    },
    async createUnpublishedPage(_contents, payload, callbacks) {
      writes++; const current = s.env.repo.attempt('project-a', prepared.attempt.id);
      assert.equal(current.status, 'dispatched'); assert.equal(current.dispatchId, callbacks.dispatchBinding.dispatchId);
      assert.equal(typeof callbacks.uploadLibraryImage, 'function');
      await callbacks.assertCurrent(); assert.deepEqual(await callbacks.readMedia('photo-a'), s.image);
      return createCmsReadbackTestProof({ payload });
    },
  } });
  t.after(() => browser.close()); await browser.connect();
  s.hooks.driver = (payload, callbacks) => browser.createUnpublishedPage(payload, callbacks);
  await assert.rejects(s.api.execute(prepared.request), { code: 'SQUARESPACE_EDITOR_NOT_READY' });
  assert.deepEqual(s.env.repo.attempt('project-a', prepared.attempt.id), prepared.attempt);
  assert.equal(s.env.repo.counts().cms_receipts, 0); assert.equal(reads, 1); assert.equal(writes, 0);
  assert.equal(browser.pageAuthoringAvailable, true); assert.equal((await browser.snapshot()).busy, false);
  ready = true;
  assert.equal(reads, 1, 'changing readiness alone must never retry');
  await assert.rejects(s.api.execute(prepared.request), { code: 'SQUARESPACE_TARGET_NOT_CONFIRMED' });
  assert.deepEqual(s.env.repo.attempt('project-a', prepared.attempt.id), prepared.attempt);
  assert.equal(s.env.repo.counts().cms_receipts, 0); assert.equal(reads, 2); assert.equal(writes, 0);
  occupied = false;
  const result = await s.api.execute(prepared.request);
  assert.equal(result.cms.status, 'saved-unpublished'); assert.equal(reads, 3); assert.equal(writes, 1);
  assert.equal(s.env.repo.counts().cms_receipts, 1);
});

test('an invalid apparent success after confirmed dispatch journals an uncertain null proof without a retry', async t => {
  const s = await scenario(t), prepared = await s.begin();
  s.hooks.driver = async (_payload, callbacks) => { await callbacks.beforeWrite(); return { readback: { hash: 'a'.repeat(64) }, mediaBindings: [] }; };
  const result = await s.api.execute(prepared.request), receipt = result.result.attempt.receipt;
  assert.equal(result.cms.status, 'uncertain'); assert.equal(receipt.status, 'uncertain'); assert.equal(receipt.readback, null);
  assert.equal(receipt.pageId, null); assert.equal(receipt.unpublished, null); assert.deepEqual(receipt.mediaBindings, []);
  assert.equal(result.result.attempt.repeatAllowed, false); assert.equal(s.calls.length, 1);
  await assert.rejects(s.api.execute(prepared.request), { code: 'cms_repeat_blocked' });
});

test('an observed CMS stop records a safe recovery hint without persisting the browser error or allowing retry', async t => {
  for (const [code, stage, hint] of [
    ['SQUARESPACE_PAGE_SAVE_PUBLIC_CHECK_UNCONFIRMED', undefined, /Prüfe in Squarespace, ob die Seite deaktiviert ist/],
    ['SQUARESPACE_ASSET_DRAFT_PUBLIC_CHECK_UNCONFIRMED', undefined, /Bildupload angehalten.*Entwurf deaktiviert und öffentlich nicht erreichbar/],
    ['SQUARESPACE_CODE_PLACEHOLDER_UNCONFIRMED', 'confirm-empty-code-block', /Vorbereitung eines Funktionsblocks/],
    ['SQUARESPACE_PAGE_SAVE_TARGET_CHANGED', 'send-save', /vor dem Speicherklick angehalten/],
    ['SQUARESPACE_PAGE_SAVE_UNCONFIRMED', 'confirm-save', /Speicherklick wurde ausgelöst.*gespeichert sind/],
    ['SQUARESPACE_PAGE_SAVE_UNCONFIRMED', 'reopen-saved-editor', /Wiederöffnen nach dem Speicherklick.*denselben Entwurf/],
    ['SQUARESPACE_PAGE_SAVE_UNCONFIRMED', 'compare-reopened-content', /Texte, Bildreihenfolge und Bildtexte/],
    ['SQUARESPACE_PAGE_SAVE_UNCONFIRMED', 'compare-reopened-code', /Artinformationen und die Verbreitungskarte/],
    ['SQUARESPACE_PAGE_SAVE_UNCONFIRMED', 'reconfirm-disabled-page', /Seiteneinstellungen.*Seite deaktiviert/],
    ['SQUARESPACE_PAGE_SAVE_UNCONFIRMED', 'check-public-access-after-save', /öffentliche Prüfung nach dem Speichern/],
    ['SQUARESPACE_PAGE_SAVE_UNCONFIRMED', 'PRIVATE unknown stage', /Speichern oder Wiederöffnen wurde nicht vollständig bestätigt/],
  ]) {
    const s = await scenario(t), prepared = await s.begin();
    s.hooks.driver = async (_payload, callbacks) => {
      await callbacks.beforeWrite();
      throw Object.assign(new Error('PRIVATE https://private.invalid/?token=secret'), { code, stage });
    };
    const result = await s.api.execute(prepared.request);
    const stored = s.env.repo.attempt('project-a', prepared.attempt.id);
    assert.equal(result.cms.status, 'uncertain');
    assert.equal(stored.receipt.status, 'uncertain');
    assert.match(stored.receipt.reason, hint);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private\.invalid|token=secret/);
    assert.equal(stored.repeatAllowed, false);
    await assert.rejects(s.api.execute(prepared.request), { code: 'cms_repeat_blocked' });
  }
});

test('an unconfirmed blank page gives conditional deactivation steps and keeps the attempt closed to retry', async t => {
  const s = await scenario(t), prepared = await s.begin();
  s.hooks.driver = async (_payload, callbacks) => {
    await callbacks.beforeWrite();
    throw Object.assign(new Error('PRIVATE https://private.invalid/?token=secret'), { code: 'SQUARESPACE_PAGE_CREATION_UNCONFIRMED' });
  };
  const result = await s.api.execute(prepared.request);
  const stored = s.env.repo.attempt('project-a', prepared.attempt.id);
  assert.equal(result.cms.status, 'uncertain');
  assert.equal(stored.receipt.status, 'uncertain');
  assert.equal(stored.receipt.pageId, null);
  assert.equal(stored.receipt.unpublished, null);
  assert.match(stored.receipt.reason, /kann die leere Seite bereits als „Neue Seite“ gespeichert haben/);
  assert.match(stored.receipt.reason, /„Nicht verlinkt“.*diesem Versuch eindeutig zuordnen/);
  assert.match(stored.receipt.reason, /Falls „Seite aktivieren“ eingeschaltet ist, schalte es aus und speichere/);
  assert.match(stored.receipt.reason, /Der Versuch wird nicht automatisch wiederholt\./);
  assert.doesNotMatch(JSON.stringify([result, stored.receipt]), /PRIVATE|private\.invalid|token=secret/);
  assert.equal(stored.repeatAllowed, false);
  await assert.rejects(s.api.execute(prepared.request), { code: 'cms_repeat_blocked' });
});

test('only exact gallery bytes can be read and swallowed callback errors cannot become a success', async t => {
  const s = await scenario(t), prepared = await s.begin();
  s.hooks.driver = async (payload, callbacks) => {
    await callbacks.beforeWrite();
    await assert.rejects(callbacks.readMedia('portrait'), { code: 'cms_media_not_bound' });
    assert.deepEqual(await callbacks.readMedia('photo-a'), s.image);
    return createCmsReadbackTestProof({ payload });
  };
  assert.equal((await s.api.execute(prepared.request)).cms.status, 'uncertain');
  const changed = await scenario(t), other = await changed.begin();
  changed.hooks.driver = async (_payload, callbacks) => {
    await callbacks.beforeWrite(); changed.f.bytes.set('photo-a', Buffer.alloc(changed.image.length)); await callbacks.readMedia('photo-a');
  };
  assert.equal((await changed.api.execute(other.request)).cms.status, 'uncertain');
});

test('role, version or source drift after dispatch cannot journal into another personal scope', async t => {
  for (const mutate of [state => { state.status.user.id = 'other-person'; }, state => { state.status.user.version++; }, state => { state.status.user.role = 'contributor'; }]) {
    const s = await scenario(t), prepared = await s.begin();
    s.hooks.driver = async (_payload, callbacks) => { await callbacks.beforeWrite(); mutate(s.state); await callbacks.assertCurrent(); };
    await assert.rejects(s.api.execute(prepared.request), { code: 'cms_outcome_unconfirmed' });
    assert.equal(s.env.repo.attempt('project-a', prepared.attempt.id).status, 'dispatched');
    assert.equal(s.env.repo.counts().cms_receipts, 0);
    assert.ok(s.setups.every(value => value.sourceScope === s.env.sourceScope));
  }
});

test('network loss after dispatch records honest offline uncertainty without pretending that the actor is online', async t => {
  const s = await scenario(t), prepared = await s.begin();
  s.hooks.driver = async (_payload, callbacks) => { await callbacks.beforeWrite(); s.state.status.connection = 'offline'; throw new Error('https://private.invalid/?token=secret'); };
  const result = await s.api.execute(prepared.request);
  assert.equal(result.cms.status, 'uncertain'); assert.ok(s.setups.some(value => value.online === false && value.channel === 'cms-adapter'));
  assert.ok(!JSON.stringify(result.result).includes('private.invalid')); assert.equal(s.calls.length, 1);
});

test('close aborts and joins the browser operation and final uncertainty without closing the borrowed browser or repository', async t => {
  const s = await scenario(t), prepared = await s.begin(), entered = deferred(), release = deferred(); let signal;
  s.hooks.driver = async (_payload, callbacks) => { await callbacks.beforeWrite(); signal = callbacks.signal; entered.resolve(); await release.promise; throw new Error('Window closed'); };
  const operation = s.api.execute(prepared.request); await entered.promise;
  s.closeApp(); let finished = false; const closing = s.api.close().then(() => { finished = true; });
  await Promise.resolve(); assert.equal(signal.aborted, true); assert.equal(finished, false); assert.equal(s.api.blockingState().busy, true);
  release.resolve(); const result = await operation; await closing;
  assert.equal(result.cms.status, 'uncertain'); assert.equal(s.api.blockingState().busy, false); assert.equal(s.browserCloses, 0);
  assert.equal(s.env.repo.attempt('project-a', prepared.attempt.id).status, 'uncertain');
  await assert.rejects(s.api.execute(prepared.request));
});
