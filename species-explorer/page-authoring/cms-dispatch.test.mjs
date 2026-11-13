import test from 'node:test';
import assert from 'node:assert/strict';
import { createCmsDispatchBinding, validateCmsDispatchBinding, cmsNeutralDraftPath, cmsTargetPath } from './cms-dispatch.mjs';
import { PageAuthoringError } from './contract.mjs';
import { fixture, actors } from './test-fixture.mjs';

const input = () => ({ projectId: 'project-a', attemptId: 'attempt-a', dispatchId: 'dispatch-a',
  planHash: 'a'.repeat(64), targetPath: '/wildlife/heimische-tierwelt/test-art' });
const expectedBinding = value => ({ kind: 'fn-cms-dispatch-binding', schemaVersion: 1, ...value,
  placeholderTitle: `FN Artseitenentwurf ${value.dispatchId}` });
const invalid = error => error instanceof PageAuthoringError && error.code === 'cms_dispatch_binding_invalid' && error.status === 400;
const mismatch = error => error instanceof PageAuthoringError && error.code === 'cms_dispatch_binding_mismatch' && error.status === 409;

test('creation and JSON validation preserve exact journal references and return independent copies', () => {
  const value = input(), before = structuredClone(value), expected = expectedBinding(value);
  const created = createCmsDispatchBinding(value);
  assert.deepEqual(created, expected); assert.deepEqual(value, before);
  assert.equal(Object.getPrototypeOf(created), Object.prototype);
  assert.deepEqual(Object.keys(created), ['kind', 'schemaVersion', 'projectId', 'attemptId', 'dispatchId', 'planHash', 'targetPath', 'placeholderTitle']);
  const encoded = JSON.stringify(created), decoded = JSON.parse(encoded), context = {
    planHash: value.planHash, targetPath: value.targetPath, projectId: value.projectId, attemptId: value.attemptId,
  };
  const checked = validateCmsDispatchBinding(decoded, context);
  assert.deepEqual(checked, expected); assert.notEqual(checked, decoded); assert.deepEqual(context, beforeContext(value));
  checked.placeholderTitle = 'Independent copy'; checked.projectId = 'other-project';
  assert.deepEqual(decoded, expected); assert.deepEqual(created, expected);
  assert.equal(JSON.stringify(decoded), encoded);
});

function beforeContext(value) {
  return { planHash: value.planHash, targetPath: value.targetPath, projectId: value.projectId, attemptId: value.attemptId };
}

test('the neutral root address is derived only from its intact dispatch and is never an art target', () => {
  const binding = createCmsDispatchBinding(input());
  const path = cmsNeutralDraftPath(binding);
  assert.equal(path, '/fn-artseitenentwurf-dispatch-a');
  assert.throws(() => cmsTargetPath(path), invalid);
  assert.throws(() => cmsNeutralDraftPath({ ...binding, placeholderTitle: 'Existing page' }), invalid);
  assert.throws(() => cmsNeutralDraftPath(createCmsDispatchBinding({ ...input(), dispatchId: 'dispatch:other' })), invalid);
});

test('a real dispatched journal supplies the same binding after repository reopen', async t => {
  const f = fixture(t), draft = await f.ready(), plan = await f.plan(draft);
  const attempt = (await f.service.beginCmsAttempt('publisher', { draftId: draft.id, mutationId: f.mutationId(),
    expectedRevision: draft.revision, planId: plan.id })).attempt;
  await f.service.dispatchCmsAttempt('adapter', { mutationId: f.mutationId(), attemptId: attempt.id,
    expectedStateRevision: attempt.stateRevision, dispatchId: 'non-uuid-dispatch:1' });
  const projectId = actors.adapter.projectId, stored = f.repository.attempt(projectId, attempt.id);
  assert.equal(stored.status, 'dispatched');
  const references = { projectId, attemptId: stored.id, dispatchId: stored.dispatchId,
    planHash: plan.payload.planHash, targetPath: plan.payload.target.path };
  const created = createCmsDispatchBinding(references), reopened = f.open();
  const read = reopened.attempt(projectId, attempt.id), readPlan = reopened.artifact(projectId, read.planId);
  assert.equal(read.status, 'dispatched');
  assert.equal(reopened.attempt(actors.foreign.projectId, attempt.id), null);
  const reconstructed = createCmsDispatchBinding({ projectId, attemptId: read.id, dispatchId: read.dispatchId,
    planHash: readPlan.payload.planHash, targetPath: readPlan.payload.target.path });
  assert.deepEqual(created, expectedBinding(references)); assert.deepEqual(reconstructed, created);
  assert.deepEqual(validateCmsDispatchBinding(JSON.parse(JSON.stringify(created)), {
    projectId, attemptId: read.id, planHash: readPlan.payload.planHash, targetPath: readPlan.payload.target.path,
  }), created);
});

test('valid context substitutions in every supported identity, hash and target are rejected', () => {
  const value = input(), binding = createCmsDispatchBinding(value), context = beforeContext(value);
  const changes = { projectId: 'project-b', attemptId: 'attempt-b', planHash: 'b'.repeat(64), targetPath: '/wildlife/andere-region/andere-art' };
  for (const [key, replacement] of Object.entries(changes)) {
    assert.throws(() => validateCmsDispatchBinding({ ...binding, [key]: replacement }, context), mismatch);
    assert.throws(() => validateCmsDispatchBinding(binding, { ...context, [key]: replacement }), mismatch);
    assert.deepEqual(validateCmsDispatchBinding(binding, { [key]: value[key] }), binding);
  }
  assert.throws(() => validateCmsDispatchBinding({ ...binding, dispatchId: 'dispatch-b' }, context), invalid);
  assert.throws(() => validateCmsDispatchBinding({ ...binding, placeholderTitle: 'Test-Art' }), invalid);
  assert.throws(() => validateCmsDispatchBinding({ ...binding, placeholderTitle: `${binding.placeholderTitle} ` }), invalid);
});

test('structural validity grants no authorization and does not assert a real dispatch', () => {
  const invented = input(), created = createCmsDispatchBinding(invented);
  assert.deepEqual(validateCmsDispatchBinding(created), expectedBinding(invented));
  assert.equal(Object.hasOwn(created, 'authorized'), false); assert.equal(Object.hasOwn(created, 'role'), false);
  assert.throws(() => validateCmsDispatchBinding({ ...created, authorized: true }), invalid);
});

test('identifier and digest contracts reject coerced, empty, oversized and substituted primitive values', () => {
  for (const key of ['projectId', 'attemptId', 'dispatchId']) {
    for (const value of ['', ' bad', 'bad ', 'bad/name', '<script>', 'x'.repeat(161), null, 1, {}, new String('dispatch-a')]) {
      assert.throws(() => createCmsDispatchBinding({ ...input(), [key]: value }), invalid);
      const binding = expectedBinding({ ...input(), [key]: value });
      assert.throws(() => validateCmsDispatchBinding(binding), invalid);
    }
  }
  for (const value of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), null, 1, {}]) {
    assert.throws(() => createCmsDispatchBinding({ ...input(), planHash: value }), invalid);
    assert.throws(() => validateCmsDispatchBinding({ ...expectedBinding(input()), planHash: value }), invalid);
  }
  const value = { ...input(), projectId: 'project:1', attemptId: 'attempt.1', dispatchId: 'dispatch_1-2' };
  assert.deepEqual(createCmsDispatchBinding(value), expectedBinding(value));
});

test('shared FN target validator preserves the exact browser path grammar and 500-character bound', () => {
  for (const path of ['/wildlife/a/b', '/wildlife/heimische-tierwelt/weissstorch', `/wildlife/a/${'b'.repeat(488)}`]) {
    assert.equal(cmsTargetPath(path), path);
    const value = { ...input(), targetPath: path };
    assert.deepEqual(createCmsDispatchBinding(value), expectedBinding(value));
  }
  for (const path of [null, 1, {}, '', '/', '/wildlife/a', '/wildlife/a/b/', '/wildlife/a/b/c', '/wildlife/A/b', '/wildlife/a/ä',
    '/wildlife/-a/b', '/wildlife/a-/b', '/wildlife/a--a/b', '/wildlife/a/.', '/wildlife/a/..', '/wildlife/a/%62',
    '/wildlife/a/b?x=1', '/wildlife/a/b#x', '//wildlife/a/b', ' /wildlife/a/b', '/wildlife/a/b ', '/wildlife/a/b\n',
    '/wildlife\\a\\b', 'https://www.fnwildlifetravel.de/wildlife/a/b', `/wildlife/a/${'b'.repeat(489)}`]) {
    assert.throws(() => cmsTargetPath(path), invalid);
    assert.throws(() => createCmsDispatchBinding({ ...input(), targetPath: path }), invalid);
    assert.throws(() => validateCmsDispatchBinding({ ...expectedBinding(input()), targetPath: path }), invalid);
  }
});

test('binding shape, literal kind and schema, missing and unknown fields are exact', () => {
  const value = input(), binding = expectedBinding(value);
  for (const key of Object.keys(value)) {
    const missing = { ...value }; delete missing[key];
    assert.throws(() => createCmsDispatchBinding(missing), invalid);
  }
  for (const key of Object.keys(binding)) {
    const missing = { ...binding }; delete missing[key];
    assert.throws(() => validateCmsDispatchBinding(missing), invalid);
  }
  for (const changed of [{ kind: 'other-binding' }, { schemaVersion: 2 }, { schemaVersion: '1' }, { extra: true }]) {
    assert.throws(() => validateCmsDispatchBinding({ ...binding, ...changed }), invalid);
  }
  assert.throws(() => createCmsDispatchBinding({ ...value, placeholderTitle: binding.placeholderTitle }), invalid);
  for (const context of [{ dispatchId: value.dispatchId }, { role: 'publisher' }, { planHash: undefined }, { projectId: '' },
    { attemptId: null }, { targetPath: '/other/path' }]) {
    assert.throws(() => validateCmsDispatchBinding(binding, context), invalid);
  }
});

test('accessors, toJSON, symbols and non-enumerable fields are rejected without executing hooks', () => {
  let calls = 0;
  for (const [base, validate, field] of [[input(), createCmsDispatchBinding, 'projectId'],
    [expectedBinding(input()), validateCmsDispatchBinding, 'placeholderTitle'],
    [beforeContext(input()), context => validateCmsDispatchBinding(expectedBinding(input()), context), 'planHash']]) {
    for (const descriptor of [{ enumerable: true, get() { calls++; throw new Error('Getter executed'); } },
      { enumerable: true, set(_) { calls++; } }, { enumerable: false, value: base[field] }]) {
      const value = { ...base }; Object.defineProperty(value, field, descriptor);
      assert.throws(() => validate(value), invalid); assert.equal(calls, 0);
    }
    for (const key of ['toJSON', 'unknown', Symbol('hidden-hook')]) {
      const value = { ...base };
      Object.defineProperty(value, key, { enumerable: false, get() { calls++; throw new Error('Hook executed'); } });
      assert.throws(() => validate(value), invalid); assert.equal(calls, 0);
    }
    const toJson = { ...base, toJSON() { calls++; throw new Error('toJSON executed'); } };
    assert.throws(() => validate(toJson), invalid); assert.equal(calls, 0);
    assert.deepEqual(validate(Object.freeze({ ...base })), validate({ ...base }));
  }
});

test('proxies, revoked proxies, custom prototypes and non-record inputs are rejected before traps or hooks', () => {
  let calls = 0;
  const traps = Object.fromEntries(['get', 'getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'].map(key => [key, () => {
    calls++; throw new Error('Proxy trap executed');
  }]));
  for (const [base, validate] of [[input(), createCmsDispatchBinding], [expectedBinding(input()), validateCmsDispatchBinding],
    [beforeContext(input()), context => validateCmsDispatchBinding(expectedBinding(input()), context)]]) {
    const revoked = Proxy.revocable(base, {}); revoked.revoke();
    const custom = Object.assign(Object.create({ toJSON() { calls++; } }), base);
    for (const value of [new Proxy(base, traps), revoked.proxy, custom, Object.assign(Object.create(null), base),
      null, undefined, [], new Date(), () => base, 'journal-binding', 1]) {
      // An omitted/undefined optional context selects its documented empty default.
      if (value === undefined && base.planHash && !Object.hasOwn(base, 'dispatchId')) continue;
      assert.throws(() => validate(value), invalid); assert.equal(calls, 0);
    }
  }
});
