import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { tmpdir, assertTestTempPath } from '../../scripts/test-temp.mjs';
import { check } from './errors.mjs';
import { canonicalJson, objectJson, transportJson, digest } from './security.mjs';
import { createSharedProjectHttp } from './http.mjs';
import { createSharedProjectClient } from './client.mjs';
import { validateSpeciesRecord } from './species-record.mjs';
import { projectPageEditorial, speciesPageSourceHash } from './species-editorial.mjs';
import { readerEditorialFromProjection } from './species-editorial-data.mjs';
import { initialDocument, normalizeSpeciesSnapshot, NORMAL_ASSET_FILES } from '../page-authoring/model.mjs';
import { encodePageAuthoringDraft, pageAuthoringObjectId } from '../page-authoring/shared.mjs';

const projectId = 'transport-fixture-project', token = 'transport-fixture-token';
const marker = 'fn-species-record-v2', fourMiB = 4 * 1024 * 1024;
const user = { id: 'fixture-user', username: 'fixture-user', displayName: 'Fixture', role: 'admin', projectId, version: 1 };
const denied = code => error => error.code === code;
const typed = padding => ({ type: 'fn-species-record', schemaVersion: 2, padding });
function exactBytes(bytes) {
  const value = typed(''); value.padding = 'x'.repeat(bytes - Buffer.byteLength(objectJson(value)));
  return value;
}

// Actual pure record/projector chain; no invented rich record factory or
// adoption authority. The HTTP store below is deliberately a transport fixture.
function richRecord() {
  const record = validateSpeciesRecord({ type: 'fn-species-record', schemaVersion: 1, id: 'fixture-owl',
    input: { german: 'Testkauz', genus: 'Strix', species: 'fixture' }, generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: 'Testkauz', files: {}, overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } });
  const snapshot = normalizeSpeciesSnapshot({ slug: record.id, scientificName: 'Strix fixture', commonName: 'Testkauz',
    assetName: record.assets.assetName, taxonomy: [], general: [], status: '', revision: randomUUID(),
    dataSha256: speciesPageSourceHash(record), runtimeReady: false,
    normalAssets: Object.fromEntries(Object.keys(NORMAL_ASSET_FILES).map(key => [key, null])) }, projectId, record.id);
  const document = initialDocument({ templateId: 'fn-compact-20261031', species: snapshot, parentPath: '/wildlife/heimische-tierwelt' });
  document.sections.find(section => section.kind === 'editorial').blocks = Array.from({ length: 6 }, () => ({ type: 'paragraph', text: 'x'.repeat(90 * 1024) }));
  const data = encodePageAuthoringDraft({ id: 'transport-page', revision: digest('transport-page-revision'), document });
  const projection = projectPageEditorial({ projectId,
    pageObject: { kind: 'page', id: pageAuthoringObjectId(data.pageId), revision: randomUUID(), data },
    speciesObject: { kind: 'species', id: record.id, revision: randomUUID(), data: record } });
  return validateSpeciesRecord({ ...record, schemaVersion: 2, editorial: readerEditorialFromProjection(projection) }, record.id);
}

test('only exact typed v2 object serialization receives 4 MiB and keeps canonical output', () => {
  const value = exactBytes(fourMiB);
  assert.equal(Buffer.byteLength(objectJson(value)), fourMiB);
  assert.equal(objectJson(value), canonicalJson(value, { maxBytes: fourMiB, maxNodes: 300000 }));
  assert.throws(() => objectJson({ ...value, padding: `${value.padding}x` }), denied('data_too_large'));
  for (const changed of [{ schemaVersion: 1 }, { schemaVersion: '2' }, { schemaVersion: 3 }, { type: 'other-record' }]) {
    assert.throws(() => objectJson({ ...value, ...changed }), denied('data_too_large'));
  }
  assert.throws(() => objectJson({ padding: 'x'.repeat(256 * 1024) }), denied('data_too_large'));
  const actual = richRecord(); assert.ok(Buffer.byteLength(objectJson(actual)) > 256 * 1024);
  assert.equal(JSON.parse(objectJson(actual)).schemaVersion, 2);
});

test('v2 node allowance is bounded and legacy/page/envelope limits stay separate', () => {
  const many = { type: 'fn-species-record', schemaVersion: 2, values: Array(21000).fill(0) };
  assert.ok(objectJson(many));
  assert.throws(() => objectJson({ ...many, schemaVersion: 1 }), denied('invalid_data'));
  assert.throws(() => objectJson({ ...many, values: Array(300000).fill(0) }), denied('invalid_data'));
  assert.ok(objectJson({ type: 'fn-species-page', padding: 'x'.repeat(1024 * 1024) }));
  assert.throws(() => objectJson({ type: 'fn-species-page', padding: 'x'.repeat(2 * 1024 * 1024) }), denied('data_too_large'));
  assert.ok(transportJson({ kind: 'species', data: exactBytes(fourMiB) }));
  assert.throws(() => transportJson({ padding: 'x'.repeat(256 * 1024) }), denied('data_too_large'));
});

test('inherited or accessor version markers never obtain the larger object budget', () => {
  const getter = { type: 'fn-species-record', padding: 'x'.repeat(300 * 1024), get schemaVersion() { return 2; } };
  assert.throws(() => objectJson(getter), denied('data_too_large'));
  const inherited = Object.assign(Object.create({ schemaVersion: 2 }), { type: 'fn-species-record', padding: 'x'.repeat(300 * 1024) });
  assert.throws(() => objectJson(inherited), denied('invalid_data'));
  const hidden = typed('x'.repeat(300 * 1024)); Object.defineProperty(hidden, 'schemaVersion', { value: 2, enumerable: false });
  assert.throws(() => objectJson(hidden), denied('data_too_large'));
});

function fixtureStore() {
  const state = { objects: [], histories: new Map(), conflict: null, calls: [], writes: 0, ordinal: 0 };
  function me(bearer) { check(bearer === token || bearer === 'transport-read-token', 401, 'authentication_required', 'Fixture authentication required.'); return user; }
  function write(bearer) { me(bearer); check(bearer === token, 403, 'forbidden', 'Fixture read-only session.'); state.calls.push('writer-checked'); }
  function make(data, previous) {
    const value = { kind: 'species', id: data.id || 'fixture-owl', data, revision: randomUUID(), ordinal: ++state.ordinal,
      parentRevision: previous?.revision ?? null, authorId: user.id, createdAt: '2026-11-01T10:00:00.000Z', approval: 'draft', approvedRevision: null };
    state.histories.set(value.revision, value); state.objects = [value]; return value;
  }
  const store = {
    assertWriteAccess: write, me,
    login: async () => ({ projectId, user, token, scope: 'full', expiresAt: '2030-01-01T00:00:00Z' }),
    createUser() { state.calls.push('admin-body'); return {}; },
    objectPage(bearer, query) { me(bearer); return { schemaVersion: 1, projectId, user, snapshot: digest(JSON.stringify(state.objects.map(value => value.revision))),
      totalCount: state.objects.length, objects: query.checkOnly ? [] : state.objects, checked: query.checkOnly === true, complete: true, nextCursor: null }; },
    createObject(bearer, input) { write(bearer); state.calls.push('create-body'); objectJson(input.data); state.writes++; return make(input.data); },
    getObject(bearer, _kind, id) { me(bearer); return state.objects.find(value => value.id === id); },
    submitChange(bearer, input) {
      write(bearer); objectJson(input.data); const current = state.objects[0];
      if (current && input.baseRevision !== current.revision) {
        state.conflict = { id: randomUUID(), kind: 'species', objectId: current.id, authorId: user.id, baseRevision: input.baseRevision,
          currentRevision: current.revision, base: state.histories.get(input.baseRevision).data, current: current.data, proposed: input.data,
          createdAt: '2026-11-01T10:00:00.000Z', resolvedAt: null };
        return { status: 'conflict', conflictId: state.conflict.id };
      }
      state.writes++; return { status: 'applied', object: make(input.data, current) };
    },
    getConflict(bearer) { me(bearer); return state.conflict; },
    resolveConflict(bearer, _id, input) {
      write(bearer); objectJson(input.data); state.writes++; const object = make(input.data, state.objects[0]);
      const conflict = { ...state.conflict, resolvedAt: '2026-11-01T10:01:00.000Z', resolvedBy: user.id, resolution: input.strategy, resultingRevision: object.revision };
      state.conflict = conflict; return { conflict, object };
    },
  };
  return { store, state, advance() { return make(state.objects[0].data, state.objects[0]); } };
}
async function scoped(fn) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'record-wire-')), f = fixtureStore(), clients = [];
  const adapter = createSharedProjectHttp({ store: f.store }), address = await adapter.listen();
  try {
    const client = options => {
      const value = createSharedProjectClient({ filename: path.join(root, `cache-${clients.length}.sqlite`), localStorageConfirmed: true, allowLoopbackHttp: true, ...options });
      clients.push(value); return value;
    };
    await fn({ ...f, address, client });
  } finally {
    for (const value of clients) await value.close();
    await adapter.close(); assertTestTempPath(root); fs.rmSync(root, { recursive: true, force: true });
  }
}
async function request(address, pathname, { data, method = 'POST', bearer = token, type = marker } = {}) {
  const response = await fetch(`${address.url}/api/v1/${pathname}`, { method, headers: { 'Content-Type': 'application/json',
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(type ? { 'X-Shared-Object-Type': type } : {}) }, body: JSON.stringify(data) });
  return { status: response.status, data: await response.json() };
}
function declaredOnly(address, pathname, bearer, { bytes = fourMiB, type = marker } = {}) {
  return new Promise((resolve, reject) => {
    let incoming, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      // No pooled socket, pending body or response stream may outlive the probe.
      const complete = () => error ? reject(error) : resolve(result);
      if (outgoing.closed) complete(); else outgoing.once('close', complete);
      incoming?.destroy(); outgoing.destroy();
    };
    const outgoing = http.request({ hostname: address.host, port: address.port, path: `/api/v1/${pathname}`, method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(bytes), Connection: 'close',
        ...(type ? { 'X-Shared-Object-Type': type } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) } }, response => {
      incoming = response; const parts = []; let received = 0;
      response.on('data', part => {
        received += part.length;
        if (received > 16 * 1024) { finish(new Error('Declared-size probe returned an unexpectedly large response.')); return; }
        parts.push(part);
      });
      response.once('error', error => finish(error));
      response.once('aborted', () => finish(new Error('Declared-size probe response was interrupted.')));
      response.once('end', () => {
        try { finish(null, { status: response.statusCode, data: JSON.parse(Buffer.concat(parts).toString('utf8')) }); }
        catch (error) { finish(error); }
      });
    });
    const timeout = setTimeout(() => finish(new Error('Declared-size probe did not reject the headers in time.')), 5000);
    outgoing.once('error', error => finish(error));
    // Deliberately send headers alone: these cases must reject before reading
    // any body. Streaming a huge, already rejected upload races 413 vs reset on
    // Windows and would test socket timing rather than the declared-size gate.
    outgoing.flushHeaders();
  });
}

test('record2 marker authenticates writer before body read and never enlarges login/admin bodies', () => scoped(async ({ address, state }) => {
  for (const [bearer, status] of [[undefined, 401], ['wrong-token', 401], ['transport-read-token', 403]]) {
    assert.equal((await declaredOnly(address, 'objects', bearer)).status, status);
  }
  assert.equal((await declaredOnly(address, 'auth/login')).status, 413);
  assert.equal((await declaredOnly(address, 'users', token)).status, 413);
  assert.equal(state.writes, 0); assert.ok(!state.calls.includes('create-body')); assert.ok(!state.calls.includes('admin-body'));
}));

test('record2 HTTP data budget admits exactly 4 MiB and rejects the next byte after reading the actual body', () => scoped(async ({ address, state }) => {
  assert.equal((await request(address, 'objects', { data: { kind: 'species', id: 'fixture-owl', data: exactBytes(fourMiB) } })).status, 201);
  assert.equal((await request(address, 'objects', { data: { kind: 'species', id: 'fixture-owl', data: exactBytes(fourMiB + 1) } })).status, 413);
  assert.equal(state.writes, 1);
}));

test('declared HTTP envelope oversize and missing typed marker reject before any body is sent', () => scoped(async ({ address, state }) => {
  const oversized = await declaredOnly(address, 'objects', token, { bytes: fourMiB + 16 * 1024 + 1 });
  assert.equal(oversized.status, 413);
  const noMarker = await declaredOnly(address, 'objects', token, { bytes: 320 * 1024 + 1, type: null });
  assert.equal(noMarker.status, 413);
  assert.equal(state.writes, 0); assert.ok(!state.calls.includes('create-body'));
}));

test('spoofed markers reject generic/v1/page/unused merge and small non-object requests after parsing', () => scoped(async ({ address, state }) => {
  const bodies = [
    ['objects', { kind: 'species', id: 'fixture-owl', data: { type: 'fn-species-record', schemaVersion: 1 } }],
    ['objects', { kind: 'species', id: 'fixture-owl', data: { title: 'Generic' } }],
    ['objects', { kind: 'page', id: 'fixture-page', data: typed('') }],
    ['objects', { kind: 'species', id: 'fixture-owl', data: { type: 'fn-species-record', schemaVersion: '2' } }],
    ['conflicts/11111111-1111-4111-8111-111111111111/resolve', { strategy: 'current', data: typed('') }],
    ['auth/login', { username: 'fixture', password: 'not a real credential', data: typed('') }], ['users', { data: typed('') }],
  ];
  for (const [pathname, data] of bodies) {
    const result = await request(address, pathname, { data }); assert.equal(result.status, 400, pathname); assert.equal(result.data.error.code, 'object_type_mismatch');
  }
  assert.equal(state.writes, 0);
  assert.equal((await request(address, 'objects/page/fixture-page', { method: 'PUT', data: { data: typed('') } })).status, 400);
}));

test('actual client and HTTP transport mark a valid large record2 against isolated simulated business responses', () => scoped(async ({ address, client, state, advance }) => {
  const requests = [], value = client({ fetchImpl: async (url, options) => { requests.push({ path: new URL(url).pathname, method: options.method, marker: options.headers['X-Shared-Object-Type'] }); return fetch(url, options); } });
  await value.connect({ baseUrl: address.url, username: user.username, password: 'synthetic unused password' });
  const data = richRecord(); assert.ok(Buffer.byteLength(objectJson(data)) > 256 * 1024);
  const created = await value.createObject({ kind: 'species', id: data.id, data });
  assert.equal(digest(objectJson(created.data)), digest(objectJson(data)));
  await value.editExistingObject('species', data.id, data); await value.sync({ kind: 'species', id: data.id });
  await value.editExistingObject('species', data.id, data); advance(); await value.sync({ kind: 'species', id: data.id });
  const conflict = (await value.listConflicts())[0]; assert.ok(conflict);
  await value.resolveConflict(conflict.id, { strategy: 'merged', data, expectedRevision: state.objects[0].revision });
  for (const pathname of ['/api/v1/objects', '/api/v1/changes', `/api/v1/conflicts/${conflict.id}/resolve`]) {
    assert.ok(requests.some(entry => entry.path === pathname && entry.method === 'POST' && entry.marker === marker), pathname);
  }
}));

test('client capability DTO stays exactly old-shaped unless valid optional fields are declared', () => scoped(async ({ address, client }) => {
  let extra = {};
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (!url.endsWith('/capabilities')) return response;
    return new Response(JSON.stringify({ ...await response.json(), ...extra }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  await value.connect({ baseUrl: address.url, username: user.username, password: 'synthetic unused password' });
  const old = { schemaVersion: 1, projectId, user: { id: user.id, role: user.role }, speciesRecordVersion: 1, adminBoundImport: true };
  assert.deepEqual(await value.capabilities(), old);
  extra = { pageEditorialAdoption: 1 }; assert.deepEqual(await value.capabilities(), { ...old, pageEditorialAdoption: 1 });
  extra = { speciesRecordVersions: [1, 2] }; assert.deepEqual(await value.capabilities(), { ...old, speciesRecordVersions: [1, 2] });
  extra = { pageEditorialAdoption: 1, speciesRecordVersions: [1, 2] };
  const result = await value.capabilities(); assert.deepEqual(result, { ...old, ...extra }); result.speciesRecordVersions[0] = 9;
  assert.deepEqual((await value.capabilities()).speciesRecordVersions, [1, 2]);
  extra = { normalMedia: 1 }; assert.deepEqual(await value.capabilities(), { ...old, normalMedia: 1 });
  extra = { normalMedia: 0 }; assert.deepEqual(await value.capabilities(), old);
  for (const invalid of [{ pageEditorialAdoption: true }, { pageEditorialAdoption: 0 }, { speciesRecordVersions: [1] },
    { speciesRecordVersions: [2, 1] }, { speciesRecordVersions: [1, 2, 2] }, { speciesRecordVersions: ['1', 2] }, { speciesRecordVersions: null }, { normalMedia: 2 }]) {
    extra = invalid; await assert.rejects(value.capabilities(), denied('invalid_response'));
  }
  const support = await fetch(`${address.url}/api/v1/capabilities`, { headers: { Authorization: `Bearer ${token}` } });
  const original = await support.json(); assert.equal(Object.hasOwn(original, 'pageEditorialAdoption'), false); assert.equal(Object.hasOwn(original, 'speciesRecordVersions'), false);
}));
