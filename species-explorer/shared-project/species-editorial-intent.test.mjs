import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, digest } from './security.mjs';
import { validateEditorialSourceBindings, createPageEditorialIntent, validatePageEditorialIntent, pageEditorialIntentHash } from './species-editorial-intent.mjs';

const sourceCode = 'invalid_editorial_source_bindings', intentCode = 'invalid_editorial_intent';
const denied = code => error => error.status === 400 && error.code === code;
const uuid = '01234567-89ab-4cde-8fab-0123456789ab';
const otherUuid = '11234567-89ab-4cde-bfab-0123456789ab';
const sha = label => digest(label);
function source() {
  return { projectId: 'fixture-project', page: { objectId: `fn-species-page-${sha('page')}`, objectRevision: uuid,
    dataRevision: sha('page-data-revision'), contentHash: sha('page-content'), imagesHash: sha('page-images'), dataHash: sha('page-data') },
  species: { id: 'fixture-owl', objectRevision: otherUuid, dataHash: sha('species-data'), sourceHash: sha('protected-species-source') } };
}
function request() { return { sourceBindings: source(), projectionHash: sha('computed-node-projection'), actor: { projectId: 'fixture-project', userId: 'fixture-user', role: 'contributor' } }; }
const intent = () => createPageEditorialIntent(request());
function setAt(root, path, value) {
  const parts = path.split('.'); let target = root;
  for (const key of parts.slice(0, -1)) target = target[key];
  target[parts.at(-1)] = value;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('source and intent validators preserve the exact agreed canonical shape without mutating inputs', () => {
  const input = request(), before = structuredClone(input);
  freeze(input);
  const result = createPageEditorialIntent(input);
  assert.deepEqual(result, { kind: 'page-editorial-adoption', schemaVersion: 1, binding: before.actor,
    sourceBindings: before.sourceBindings, projectionHash: before.projectionHash });
  assert.deepEqual(input, before);
  assert.deepEqual(result, JSON.parse(canonicalJson(result)));
  assert.notStrictEqual(result.binding, input.actor); assert.notStrictEqual(result.sourceBindings, input.sourceBindings);
  assert.notStrictEqual(result.sourceBindings.page, input.sourceBindings.page);
  assert.notStrictEqual(result.sourceBindings.species, input.sourceBindings.species);
  assert.deepEqual(validateEditorialSourceBindings(input.sourceBindings), before.sourceBindings);
  const checked = validatePageEditorialIntent(result);
  assert.notStrictEqual(checked, result); assert.notStrictEqual(checked.binding, result.binding);
  checked.sourceBindings.species.sourceHash = sha('changed-copy');
  assert.equal(result.sourceBindings.species.sourceHash, before.sourceBindings.species.sourceHash);
});

test('hash uses the canonical validated full intent and is independent of input key insertion order', () => {
  const value = intent(), reversed = Object.fromEntries(Object.entries(value).reverse());
  reversed.binding = Object.fromEntries(Object.entries(value.binding).reverse());
  reversed.sourceBindings = { species: { ...value.sourceBindings.species }, page: Object.fromEntries(Object.entries(value.sourceBindings.page).reverse()), projectId: value.sourceBindings.projectId };
  assert.equal(pageEditorialIntentHash(value), digest(canonicalJson(value)));
  assert.equal(pageEditorialIntentHash(reversed), pageEditorialIntentHash(value));
});

test('every source, projection and eligible actor change is part of the intent fingerprint', () => {
  const original = intent(), originalHash = pageEditorialIntentHash(original);
  const mutations = {
    'sourceBindings.page.objectId': `fn-species-page-${sha('different-page')}`,
    'sourceBindings.page.objectRevision': otherUuid,
    'sourceBindings.page.dataRevision': sha('different-data-revision'),
    'sourceBindings.page.contentHash': sha('different-content'),
    'sourceBindings.page.imagesHash': sha('different-images'),
    'sourceBindings.page.dataHash': sha('different-page-data'),
    'sourceBindings.species.id': 'another-species',
    'sourceBindings.species.objectRevision': uuid,
    'sourceBindings.species.dataHash': sha('different-species-data'),
    'sourceBindings.species.sourceHash': sha('different-protected-source'),
    'projectionHash': sha('different-projection'), 'binding.userId': 'other-user', 'binding.role': 'publisher',
  };
  for (const [path, value] of Object.entries(mutations)) {
    const changed = structuredClone(original); setAt(changed, path, value);
    assert.notEqual(pageEditorialIntentHash(changed), originalHash, path);
  }
  const otherProject = structuredClone(original);
  otherProject.binding.projectId = 'other-project'; otherProject.sourceBindings.projectId = 'other-project';
  assert.notEqual(pageEditorialIntentHash(otherProject), originalHash);
});

test('all exact object levels reject missing, unknown, hidden and symbolic fields', () => {
  for (const path of ['', 'binding', 'sourceBindings', 'sourceBindings.page', 'sourceBindings.species']) {
    const select = root => path ? path.split('.').reduce((value, key) => value[key], root) : root;
    for (const kind of ['unknown', 'hidden', 'symbol', 'missing']) {
      const value = intent(), target = select(value);
      if (kind === 'unknown') target.unexpected = 'reject';
      if (kind === 'hidden') Object.defineProperty(target, 'hidden', { value: 'reject', enumerable: false });
      if (kind === 'symbol') target[Symbol('reject')] = 'reject';
      if (kind === 'missing') delete target[Object.keys(target)[0]];
      assert.throws(() => validatePageEditorialIntent(value));
      assert.throws(() => pageEditorialIntentHash(value));
    }
  }
  const input = request(); input.unexpected = true;
  assert.throws(() => createPageEditorialIntent(input), denied(intentCode));
  delete input.unexpected; input.actor.unexpected = true;
  assert.throws(() => createPageEditorialIntent(input), denied(intentCode));
});

test('getters and duplicate-like changing values never execute during validation or hashing', () => {
  for (const path of ['binding.role', 'sourceBindings.projectId', 'sourceBindings.page.contentHash', 'sourceBindings.species.sourceHash']) {
    const value = intent(), parts = path.split('.'); let target = value, calls = 0;
    for (const key of parts.slice(0, -1)) target = target[key];
    Object.defineProperty(target, parts.at(-1), { enumerable: true, get() { calls++; return calls === 1 ? 'one' : 'another'; } });
    assert.throws(() => validatePageEditorialIntent(value));
    assert.throws(() => pageEditorialIntentHash(value));
    assert.equal(calls, 0, path);
  }
  let calls = 0;
  const input = request(); Object.defineProperty(input, 'actor', { enumerable: true, get() { calls++; throw new Error('must never run'); } });
  assert.throws(() => createPageEditorialIntent(input), denied(intentCode)); assert.equal(calls, 0);
});

test('foreign and null prototypes, toJSON hooks and proxies cannot manufacture a plain source proof', () => {
  for (const make of [value => Object.assign(Object.create({ inherited: true }), value), value => Object.assign(Object.create(null), value),
    value => Object.assign(value, { toJSON() { throw new Error('must never serialize hooks'); } })]) {
    const value = intent(); value.sourceBindings.page = make(value.sourceBindings.page);
    assert.throws(() => validatePageEditorialIntent(value), denied(sourceCode));
  }
  const parsedProto = JSON.parse(JSON.stringify(source()).replace('"projectId":', '"__proto__":{},"projectId":'));
  assert.throws(() => validateEditorialSourceBindings(parsedProto), denied(sourceCode));
  let traps = 0;
  const proxy = new Proxy(source(), { getPrototypeOf() { traps++; return Object.prototype; }, ownKeys() { traps++; return []; } });
  assert.throws(() => validateEditorialSourceBindings(proxy), denied(sourceCode)); assert.equal(traps, 0);
  const { proxy: revoked, revoke } = Proxy.revocable(source(), {}); revoke();
  assert.throws(() => validateEditorialSourceBindings(revoked), denied(sourceCode));
});

test('page IDs, hashes and data revisions must be exact lowercase full SHA256 strings', () => {
  const hashes = ['page.dataRevision', 'page.contentHash', 'page.imagesHash', 'page.dataHash', 'species.dataHash', 'species.sourceHash'];
  for (const path of hashes) for (const invalid of ['x', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), ` ${sha('x')}`, null, 12, { value: sha('x') }]) {
    const value = source(); setAt(value, path, invalid);
    assert.throws(() => validateEditorialSourceBindings(value), denied(sourceCode));
  }
  for (const objectId of [`page-${sha('page')}`, `fn-species-page-${'A'.repeat(64)}`, `fn-species-page-${'a'.repeat(63)}`, null]) {
    const value = source(); value.page.objectId = objectId;
    assert.throws(() => validateEditorialSourceBindings(value), denied(sourceCode));
  }
  for (const invalid of ['a'.repeat(63), 'A'.repeat(64), null]) {
    const value = intent(); value.projectionHash = invalid;
    assert.throws(() => validatePageEditorialIntent(value), denied(intentCode));
  }
});

test('server object revisions require UUID versions one through eight with the RFC variant', () => {
  for (const version of '12345678') {
    const value = source(); value.page.objectRevision = `01234567-89ab-${version}cde-8fab-0123456789ab`;
    assert.equal(validateEditorialSourceBindings(value).page.objectRevision, value.page.objectRevision);
  }
  for (const path of ['page.objectRevision', 'species.objectRevision']) for (const invalid of [
    '01234567-89ab-0cde-8fab-0123456789ab', '01234567-89ab-9cde-8fab-0123456789ab',
    '01234567-89ab-4cde-7fab-0123456789ab', '01234567-89ab-4cde-cfab-0123456789ab', uuid.toUpperCase(), sha('not-a-uuid'), null,
  ]) {
    const value = source(); setAt(value, path, invalid);
    assert.throws(() => validateEditorialSourceBindings(value), denied(sourceCode));
  }
});

test('existing identifier and species slug rules stay exact, bounded and unnormalized', () => {
  for (const invalid of ['', ' project', '../other', 'a'.repeat(161), 'invalid@project']) {
    const value = source(); value.projectId = invalid;
    assert.throws(() => validateEditorialSourceBindings(value), denied(sourceCode));
    const requestValue = request(); requestValue.actor.userId = invalid;
    assert.throws(() => createPageEditorialIntent(requestValue), denied(intentCode));
  }
  for (const invalid of ['', 'Fixture-Owl', 'owl_slug', '-owl', 'owl--slug', 'a'.repeat(121)]) {
    const value = source(); value.species.id = invalid;
    assert.throws(() => validateEditorialSourceBindings(value), denied(sourceCode));
  }
  const value = source(); value.projectId = 'Project_A:1.test'; value.species.id = 'a'.repeat(120);
  assert.deepEqual(validateEditorialSourceBindings(value), value);
});

test('intent kind/version, actor roles and foreign project bindings are never coerced or accepted', () => {
  for (const role of ['admin', 'publisher', 'contributor']) {
    const input = request(); input.actor.role = role;
    assert.equal(createPageEditorialIntent(input).binding.role, role);
  }
  for (const role of ['reader', 'Admin', 'owner', null, 1]) {
    const input = request(); input.actor.role = role;
    assert.throws(() => createPageEditorialIntent(input), denied(intentCode));
  }
  for (const [key, invalid] of [['kind', 'other-intent'], ['kind', 1], ['schemaVersion', 2], ['schemaVersion', '1'], ['schemaVersion', null]]) {
    const value = intent(); value[key] = invalid;
    assert.throws(() => validatePageEditorialIntent(value), denied(intentCode));
  }
  const input = request(); input.actor.projectId = 'foreign-project';
  assert.throws(() => createPageEditorialIntent(input), denied(intentCode));
  const value = intent(); value.binding.projectId = 'foreign-project';
  assert.throws(() => pageEditorialIntentHash(value), denied(intentCode));
});

test('an opaque computed hash is evidence only and produces no approval, permission or publication claim', () => {
  const value = intent();
  assert.deepEqual(Object.keys(value).sort(), ['binding', 'kind', 'projectionHash', 'schemaVersion', 'sourceBindings']);
  for (const key of ['authorized', 'canEdit', 'approved', 'readerApproved', 'externalPublication', 'token', 'password']) {
    const altered = structuredClone(value); altered[key] = true;
    assert.throws(() => validatePageEditorialIntent(altered), denied(intentCode));
  }
});
