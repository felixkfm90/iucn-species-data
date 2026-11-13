import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fixture, page } from './test-fixtures.mjs';
import { createSharedProjectHttp } from './http.mjs';
import { createSharedProjectClient, createMemoryCredentialStore } from './client.mjs';
import { createSharedProjectClientStore } from './client-store.mjs';
import { objectJson, transportJson, digest } from './security.mjs';
import { validateSpeciesRecord } from './species-record.mjs';
import { speciesPageSourceHash } from './species-editorial.mjs';
import { buildPageEditorialAdoption } from './species-editorial-adoption.mjs';
import { initialDocument, normalizeSpeciesSnapshot, NORMAL_ASSET_FILES } from '../page-authoring/model.mjs';
import { encodePageAuthoringDraft, pageAuthoringObjectId } from '../page-authoring/shared.mjs';

const denied = code => error => error.code === code;
const readonlyKeys = ['type', 'id', 'input', 'generated', 'taxonomyOverride', 'assessmentBinding', 'assets'];

function record() {
  return validateSpeciesRecord({ type: 'fn-species-record', schemaVersion: 1, id: 'fixture-owl',
    input: { german: 'Testkauz', genus: 'Strix', species: 'fixture', english: 'Fixture owl', unknownOriginal: { retained: [false, 'Unverändert'] } },
    generated: { Class: 'Aves', protectedUnknown: { retained: true } }, taxonomyOverride: null, assessmentBinding: { id: 'fixture-assessment' },
    assets: { assetName: 'Historischer Testkauz', files: {}, overrides: { retained: true }, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [{ id: 'old', title: 'Alter Text', text: 'Bisheriger redaktioneller Text', intentionallyEmpty: false }],
      gallery: [], generalSectionId: null, embeddedGeneralText: null } });
}
function authoredPage(speciesObject, projectId) {
  const source = speciesObject.data;
  const snapshot = normalizeSpeciesSnapshot({ slug: source.id, scientificName: 'Strix fixture', commonName: 'Testkauz',
    assetName: source.assets.assetName, taxonomy: [{ rank: 'Class', name: 'Aves' }], general: [], status: '',
    revision: speciesObject.revision, dataSha256: speciesPageSourceHash(source), runtimeReady: false,
    normalAssets: Object.fromEntries(Object.keys(NORMAL_ASSET_FILES).map(role => [role, null])) }, projectId, source.id);
  const document = initialDocument({ templateId: 'fn-compact-20261031', species: snapshot, parentPath: '/wildlife/heimische-tierwelt' });
  document.introduction = [{ type: 'paragraph', text: 'Bewusst geprüfte redaktionelle Einleitung' }];
  document.sections.find(section => section.id === 'appearance').blocks = [
    { type: 'heading', level: 5, text: 'Merkmale' }, { type: 'bullet-list', items: ['Erster Eintrag', 'Zweiter Eintrag'] },
  ];
  document.sources = [{ id: 'source-a', label: 'Menschlich bereitgestellte Quelle', url: 'https://example.org/fixture', sha256: digest('source-fixture') }];
  return encodePageAuthoringDraft({ id: 'fixture-authoring-page', revision: digest('initial-page'), document });
}
function rows(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try { return db.prepare('SELECT * FROM queue ORDER BY seq').all(); } finally { db.close(); }
}
function requestHash(request) {
  return digest(transportJson({ kind: request.kind, id: request.id, baseRevision: request.baseRevision, data: request.data, intent: request.intent }));
}
async function scoped(fn) {
  const f = fixture(), clients = [];
  let adapter;
  try {
    const initialized = await f.initialized(), { store, a } = initialized;
    const species = store.createObject(a.token, { kind: 'species', id: 'fixture-owl', data: record() });
    const data = authoredPage(species, a.projectId), object = store.createObject(a.token, { kind: 'page', id: pageAuthoringObjectId(data.pageId), data });
    adapter = createSharedProjectHttp({ store }); const address = await adapter.listen();
    const filename = path.join(f.root, 'editorial-cache.sqlite');
    const client = (options = {}) => {
      const value = createSharedProjectClient({ filename, localStorageConfirmed: true, allowLoopbackHttp: true, ...options });
      clients.push(value); return value;
    };
    const connect = (value, username = a.user.username) => value.connect({ baseUrl: address.url, username, password: f.password });
    const changePage = text => {
      const current = store.getObject(a.token, 'page', object.id), document = structuredClone(current.data.document);
      document.introduction = [{ type: 'paragraph', text }];
      const next = encodePageAuthoringDraft({ id: current.data.pageId, revision: digest(randomUUID()), document });
      return store.submitChange(a.token, { changeId: randomUUID(), kind: 'page', id: object.id, baseRevision: current.revision, data: next }).object;
    };
    const changeSpecies = english => {
      const current = store.getObject(a.token, 'species', species.id), data = structuredClone(current.data); data.input.english = english;
      return store.submitChange(a.token, { changeId: randomUUID(), kind: 'species', id: species.id, baseRevision: current.revision, data }).object;
    };
    await fn({ f, ...initialized, species, object, address, filename, client, connect, changePage, changeSpecies });
  } finally {
    for (const value of clients) await value.close();
    if (adapter) await adapter.close();
    f.cleanup();
  }
}

test('editorial preview is curated, detached and read-only; adoption only stages the exact reader draft', () => scoped(async ({ store, a, species, object, filename, client, connect }) => {
  const requests = [], value = client({ fetchImpl: (url, options) => { requests.push({ url, method: options.method }); return fetch(url, options); } });
  await connect(value); const start = requests.length;
  const preview = await value.previewPageEditorial(object.id, species.id);
  assert.deepEqual(Object.keys(preview).sort(), ['beforeEditorial', 'expiresAt', 'externalPublication', 'proposedEditorial', 'readerApproved', 'sourceBindings', 'token'].sort());
  assert.equal(preview.readerApproved, false); assert.equal(preview.externalPublication, 'not-performed');
  assert.ok(Date.parse(preview.expiresAt) > Date.now());
  assert.equal(preview.beforeEditorial.sections[0].text, 'Bisheriger redaktioneller Text');
  assert.deepEqual(preview.proposedEditorial.introduction, object.data.document.introduction);
  const displayed = structuredClone(preview.proposedEditorial);
  preview.proposedEditorial.introduction[0].text = 'Nur Rückgabekopie geändert';
  preview.sourceBindings.species.dataHash = digest('cannot-change-private-token');
  const staged = await value.adoptPageEditorial(preview.token);
  assert.equal(staged.readerApproved, false); assert.equal(staged.externalPublication, 'not-performed');
  assert.equal(staged.object.localPending, true); assert.equal(staged.object.data.schemaVersion, 2);
  assert.deepEqual(staged.object.data.editorial, displayed);
  for (const key of readonlyKeys) assert.deepEqual(staged.object.data[key], species.data[key], key);
  assert.equal(store.getObject(a.token, 'species', species.id).revision, species.revision);
  assert.equal(store.getObject(a.token, 'page', object.id).revision, object.revision);
  assert.ok(requests.slice(start).every(request => request.method === 'GET'));
  const saved = rows(filename); assert.equal(saved.length, 1); assert.equal(saved[0].state, 'queued');
  const sealed = JSON.parse(saved[0].request_json);
  assert.equal(sealed.intent.kind, 'page-editorial-adoption'); assert.equal(sealed.changeId, staged.changeId);
  await assert.rejects(value.adoptPageEditorial(preview.token), denied('editorial_preview_required'));
}));

test('a staged editorial adoption survives restart and is sent only by explicit sync with its sealed request', () => scoped(async ({ f, store, a, species, object, filename, client, connect }) => {
  const credentials = createMemoryCredentialStore(), sent = [];
  const transport = (url, options) => { if (url.endsWith('/changes')) sent.push(options.body); return fetch(url, options); };
  const first = client({ credentialStore: credentials, fetchImpl: transport }); await connect(first);
  const preview = await first.previewPageEditorial(object.id, species.id), staged = await first.adoptPageEditorial(preview.token);
  const sealed = rows(filename)[0].request_json; await first.close();
  const reopened = client({ credentialStore: credentials, fetchImpl: transport });
  assert.equal((await reopened.status()).pending, 1); assert.equal(sent.length, 0);
  assert.equal(store.getObject(a.token, 'species', species.id).data.schemaVersion, 1);
  await reopened.sync({ kind: 'species', id: species.id });
  assert.deepEqual(sent, [sealed]); assert.equal((await reopened.status()).pending, 0);
  const confirmed = store.getObject(a.token, 'species', species.id);
  assert.equal(confirmed.data.schemaVersion, 2); assert.equal(confirmed.approval, 'draft'); assert.equal(confirmed.approvedRevision, null);
  assert.deepEqual(confirmed.data.editorial, staged.object.data.editorial);
  for (const key of readonlyKeys) assert.deepEqual(confirmed.data[key], species.data[key], key);
  assert.ok(!sealed.includes(f.password));
}));

test('a lost adoption acknowledgement replays the same sealed change after restart without a second version', () => scoped(async ({ store, a, species, object, filename, client, connect }) => {
  const credentials = createMemoryCredentialStore(), sent = []; let lose = true;
  const transport = async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/changes')) { sent.push(options.body); if (lose) { lose = false; await response.text(); throw new Error('Synthetic lost adoption acknowledgement'); } }
    return response;
  };
  const first = client({ credentialStore: credentials, fetchImpl: transport }); await connect(first);
  const preview = await first.previewPageEditorial(object.id, species.id); await first.adoptPageEditorial(preview.token);
  await assert.rejects(first.sync(), denied('offline'));
  const confirmed = store.getObject(a.token, 'species', species.id); assert.equal(confirmed.data.schemaVersion, 2);
  assert.equal(rows(filename)[0].state, 'uncertain'); await first.close();
  const reopened = client({ credentialStore: credentials, fetchImpl: transport }); await reopened.sync();
  assert.equal(sent.length, 2); assert.equal(sent[0], sent[1]);
  assert.equal(store.getObject(a.token, 'species', species.id).revision, confirmed.revision);
  assert.equal((await reopened.status()).pending, 0);
}));

test('a contradictory applied acknowledgement cannot clear a sealed editorial draft', async () => {
  for (const mutation of [object => { object.kind = 'page'; }, object => { object.data.input.english = 'Widersprüchlicher bestätigter Inhalt'; }]) {
    await scoped(async ({ store, a, species, object, filename, client, connect }) => {
      let corrupt = true;
      const value = client({ fetchImpl: async (url, options) => {
        const response = await fetch(url, options);
        if (corrupt && url.endsWith('/changes')) { const data = await response.json(); mutation(data.object); return Response.json(data); }
        return response;
      } });
      await connect(value); const preview = await value.previewPageEditorial(object.id, species.id); await value.adoptPageEditorial(preview.token);
      const sealed = rows(filename)[0].request_json;
      await assert.rejects(value.sync(), denied('invalid_response'));
      assert.equal(rows(filename)[0].state, 'uncertain'); assert.equal(rows(filename)[0].request_json, sealed);
      const confirmed = store.getObject(a.token, 'species', species.id); corrupt = false; await value.sync();
      assert.equal((await value.status()).pending, 0); assert.equal(store.getObject(a.token, 'species', species.id).revision, confirmed.revision);
    });
  }
});

test('a contradictory conflict proposal cannot bind or supersede a sealed editorial draft', () => scoped(async ({ species, object, filename, client, connect, changeSpecies }) => {
  let corrupt = true;
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (corrupt && /\/conflicts\/[a-f0-9-]+$/.test(url)) {
      const data = await response.json(); data.proposed.input.english = 'Nicht der eingereichte Entwurf'; return Response.json(data);
    }
    return response;
  } });
  await connect(value); const preview = await value.previewPageEditorial(object.id, species.id), staged = await value.adoptPageEditorial(preview.token);
  changeSpecies('Tatsächlich parallele Artpflege');
  await assert.rejects(value.sync(), denied('invalid_response'));
  assert.equal(rows(filename)[0].state, 'uncertain'); assert.equal((await value.listConflicts()).length, 0);
  await assert.rejects(value.cancelPageEditorial(staged.changeId), denied('invalid_response'));
  assert.equal(rows(filename)[0].state, 'uncertain'); corrupt = false;
  const recovered = await value.cancelPageEditorial(staged.changeId); assert.equal(recovered.conflict, true);
  assert.equal((await value.listConflicts())[0].proposed.input.english, species.data.input.english);
}));

test('a changed page invalidates a preview and leaves the old server species and local queue untouched', () => scoped(async ({ store, a, species, object, filename, client, connect, changePage }) => {
  const value = client(); await connect(value); const preview = await value.previewPageEditorial(object.id, species.id);
  changePage('Neuerer gemeinsamer Seiteninhalt');
  await assert.rejects(value.adoptPageEditorial(preview.token), denied('editorial_adoption_changed'));
  assert.equal(rows(filename).length, 0); assert.equal(store.getObject(a.token, 'species', species.id).revision, species.revision);
  const fresh = await value.previewPageEditorial(object.id, species.id);
  assert.equal(fresh.proposedEditorial.introduction[0].text, 'Neuerer gemeinsamer Seiteninhalt');
}));

test('a changed protected species source blocks the old preview rather than copying stale page data', () => scoped(async ({ store, a, species, object, filename, client, connect, changeSpecies }) => {
  const value = client(); await connect(value); const preview = await value.previewPageEditorial(object.id, species.id);
  changeSpecies('Neu erfasster englischer Name');
  await assert.rejects(value.adoptPageEditorial(preview.token), denied('editorial_adoption_changed'));
  assert.equal(rows(filename).length, 0); assert.equal(store.getObject(a.token, 'species', species.id).data.input.english, 'Neu erfasster englischer Name');
}));

test('pending changes on either exact source block adoption, while another object may stay pending', () => scoped(async ({ store, a, species, object, filename, client, connect }) => {
  const value = client(); await connect(value);
  const other = store.createObject(a.token, { kind: 'page', id: 'another-page', data: page('Anderer Entwurf') }); await value.refresh();
  await value.editExistingObject('page', other.id, page('Unabhängige offene Arbeit'));
  const preview = await value.previewPageEditorial(object.id, species.id);
  let peer;
  try {
    peer = createSharedProjectClientStore({ filename, localStorageConfirmed: true });
    peer.edit(peer.active().id, 'page', object.id, object.data);
    await assert.rejects(value.adoptPageEditorial(preview.token), denied('pending_review'));
    assert.equal((await value.status()).pending, 2);
    assert.ok(rows(filename).every(row => row.request_json === null));
  } finally { peer?.close(); }
}));

test('an unrelated queued object does not block explicitly staging the reviewed editorial adoption', () => scoped(async ({ store, a, species, object, client, connect }) => {
  const other = store.createObject(a.token, { kind: 'page', id: 'unrelated-page', data: page('Andere Seite') });
  const value = client(); await connect(value); await value.editExistingObject('page', other.id, page('Unabhängige offene Eingabe'));
  const preview = await value.previewPageEditorial(object.id, species.id), staged = await value.adoptPageEditorial(preview.token);
  assert.equal(staged.object.localPending, true); assert.equal((await value.status()).pending, 2);
  assert.equal((await value.getObject('page', other.id)).data.title, 'Unabhängige offene Eingabe');
}));

test('a second cache writer during the final identity read preserves its draft and prevents staging', () => scoped(async ({ species, object, filename, client, connect }) => {
  let armed = false, identities = 0, peer;
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (armed && url.endsWith('/auth/me') && ++identities === 2) {
      const data = structuredClone(species.data); data.input.english = 'Eigene neue Eingabe während Authentifizierung';
      peer.edit(peer.active().id, 'species', species.id, data);
    }
    return response;
  } });
  await connect(value); const preview = await value.previewPageEditorial(object.id, species.id);
  try {
    peer = createSharedProjectClientStore({ filename, localStorageConfirmed: true }); armed = true;
    await assert.rejects(value.adoptPageEditorial(preview.token), denied('pending_review'));
    assert.equal(rows(filename).length, 1); assert.equal(rows(filename)[0].request_json, null);
    assert.equal((await value.getObject('species', species.id)).data.input.english, 'Eigene neue Eingabe während Authentifizierung');
  } finally { peer?.close(); }
}));

test('an eligible role change during the last capability response is detected by fresh identity', () => scoped(async ({ store, a, b, species, object, filename, client, connect }) => {
  let armed = false, capabilities = 0;
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (armed && url.endsWith('/capabilities') && ++capabilities === 2)
      store.updateUser(b.token, a.user.id, { role: 'publisher', expectedVersion: store.me(a.token).version });
    return response;
  } });
  await connect(value); const preview = await value.previewPageEditorial(object.id, species.id); armed = true;
  await assert.rejects(value.adoptPageEditorial(preview.token), denied('editorial_adoption_changed'));
  assert.equal(rows(filename).length, 0); armed = false;
  const fresh = await value.previewPageEditorial(object.id, species.id); await value.adoptPageEditorial(fresh.token);
  assert.equal(JSON.parse(rows(filename)[0].request_json).intent.binding.role, 'publisher');
}));

test('reader downgrade, different person, and a restarted client cannot reuse an old RAM preview', () => scoped(async ({ store, a, b, species, object, filename, client, connect }) => {
  const credentials = createMemoryCredentialStore(), value = client({ credentialStore: credentials }); await connect(value);
  const preview = await value.previewPageEditorial(object.id, species.id);
  store.updateUser(b.token, a.user.id, { role: 'reader', expectedVersion: store.me(a.token).version });
  await assert.rejects(value.adoptPageEditorial(preview.token), denied('editorial_adoption_changed'));
  await connect(value, b.user.username);
  await assert.rejects(value.adoptPageEditorial(preview.token), denied('editorial_preview_required'));
  const own = await value.previewPageEditorial(object.id, species.id); await value.close();
  const reopened = client({ credentialStore: credentials });
  await assert.rejects(reopened.adoptPageEditorial(own.token), denied('editorial_preview_required')); assert.equal(rows(filename).length, 0);
}));

test('old or withdrawn adoption capabilities block before staging and preserve server data', () => scoped(async ({ store, a, species, object, filename, client, connect }) => {
  let mode = 'old'; const requests = [];
  const value = client({ fetchImpl: async (url, options) => {
    requests.push({ url, method: options.method }); const response = await fetch(url, options);
    if (!url.endsWith('/capabilities') || mode === 'current') return response;
    if (mode === 'missing') return Response.json({ error: { code: 'not_found' } }, { status: 404 });
    const data = await response.json(); delete data.pageEditorialAdoption; delete data.speciesRecordVersions;
    return Response.json(data);
  } });
  await connect(value); const start = requests.length;
  for (const unavailable of ['old', 'missing']) { mode = unavailable; await assert.rejects(value.previewPageEditorial(object.id, species.id), denied('editorial_adoption_server_required')); }
  assert.ok(requests.slice(start).every(request => request.method === 'GET' && !request.url.includes('/objects/page')));
  mode = 'current'; const preview = await value.previewPageEditorial(object.id, species.id); mode = 'old';
  await assert.rejects(value.adoptPageEditorial(preview.token), denied('editorial_adoption_server_required'));
  assert.equal(rows(filename).length, 0); assert.equal(store.getObject(a.token, 'species', species.id).revision, species.revision);
  mode = 'current'; await value.adoptPageEditorial(preview.token); assert.equal(rows(filename).length, 1);
}));

test('preview expiry and bounded RAM capacity do not silently replace another pending review', () => scoped(async ({ species, object, filename, client, connect }) => {
  let now = 100;
  const value = client({ editorialClock: () => now }); await connect(value);
  const first = await value.previewPageEditorial(object.id, species.id);
  now += 10 * 60 * 1000;
  await assert.rejects(value.adoptPageEditorial(first.token), denied('editorial_preview_required'));
  const tokens = [];
  for (let index = 0; index < 64; index++) tokens.push((await value.previewPageEditorial(object.id, species.id)).token);
  await assert.rejects(value.previewPageEditorial(object.id, species.id), denied('editorial_preview_limit'));
  await value.adoptPageEditorial(tokens[0]); assert.equal(rows(filename).length, 1);
}));

test('close during an outstanding capability read cannot stage or expose a late preview', () => scoped(async ({ species, object, filename, client, connect }) => {
  let armed = false, announce, release;
  const entered = new Promise(resolve => { announce = resolve; }), held = new Promise(resolve => { release = resolve; });
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (armed && url.endsWith('/capabilities')) { announce(); await held; }
    return response;
  } });
  await connect(value); armed = true;
  const pending = value.previewPageEditorial(object.id, species.id), rejected = assert.rejects(pending, denied('client_closed'));
  await entered; const closed = value.close(); release(); await rejected; await closed;
  assert.equal(rows(filename).length, 0);
}));

test('a definite stale-page rejection preserves the sealed draft, reports why, and blocks silent re-preview', () => scoped(async ({ store, a, species, object, filename, client, connect, changePage }) => {
  const value = client(); await connect(value); const preview = await value.previewPageEditorial(object.id, species.id);
  await value.adoptPageEditorial(preview.token); const sealed = rows(filename)[0].request_json;
  changePage('Nach dem Staging bewusst geänderter Seitentext');
  await assert.rejects(value.sync(), error => error.code === 'editorial_adoption_changed' && /bleibt erhalten/.test(error.message));
  assert.equal(rows(filename)[0].state, 'uncertain'); assert.equal(rows(filename)[0].request_json, sealed);
  assert.equal((await value.getObject('species', species.id)).data.schemaVersion, 2);
  assert.equal(store.getObject(a.token, 'species', species.id).data.schemaVersion, 1);
  await assert.rejects(value.previewPageEditorial(object.id, species.id), denied('pending_review'));
}));

test('explicit cancellation binds a server tombstone, preserves history and permits a fresh preview', () => scoped(async ({ store, a, species, object, filename, client, connect, changePage }) => {
  const value = client(); await connect(value); const preview = await value.previewPageEditorial(object.id, species.id);
  const staged = await value.adoptPageEditorial(preview.token), sealed = JSON.parse(rows(filename)[0].request_json);
  changePage('Neue gemeinsame Seite nach alter Übernahme');
  const cancelled = await value.cancelPageEditorial(staged.changeId);
  assert.equal(cancelled.cancelled, true); assert.equal(cancelled.readerApproved, false);
  assert.equal(rows(filename)[0].state, 'superseded'); assert.equal((await value.status()).pending, 0);
  const replay = store.submitChange(a.token, sealed); assert.equal(replay.status, 'cancelled'); assert.equal(replay.changeId, staged.changeId);
  assert.equal(store.getObject(a.token, 'species', species.id).data.schemaVersion, 1);
  const fresh = await value.previewPageEditorial(object.id, species.id); assert.equal(fresh.proposedEditorial.introduction[0].text, 'Neue gemeinsame Seite nach alter Übernahme');
}));

test('lost cancellation acknowledgement retains the draft until the identical explicit cancellation is confirmed', () => scoped(async ({ store, a, species, object, filename, client, connect }) => {
  let lose = true; const sent = [];
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (/\/changes\/[^/]+\/cancel$/.test(url)) {
      sent.push(options.body); if (lose) { lose = false; await response.text(); throw new Error('Synthetic lost cancellation acknowledgement'); }
    }
    return response;
  } });
  await connect(value); const preview = await value.previewPageEditorial(object.id, species.id), staged = await value.adoptPageEditorial(preview.token);
  const saved = rows(filename)[0], sealed = JSON.parse(saved.request_json);
  await assert.rejects(value.cancelPageEditorial(staged.changeId), denied('offline'));
  assert.equal(rows(filename)[0].state, 'queued'); assert.equal(rows(filename)[0].request_json, saved.request_json);
  assert.equal(store.getObject(a.token, 'species', species.id).revision, species.revision);
  const result = await value.cancelPageEditorial(staged.changeId); assert.equal(result.cancelled, true);
  assert.deepEqual(sent, [JSON.stringify({ requestHash: requestHash(sealed) }), JSON.stringify({ requestHash: requestHash(sealed) })]);
  assert.equal((await value.status()).pending, 0);
}));

test('a failed read after confirmed cancellation reports completion separately from refresh and hides private data after permission loss', async () => {
  for (const mode of ['offline', 'authentication_required']) await scoped(async ({ store, a, b, species, object, filename, client, connect }) => {
    let cancelled = false;
    const value = client({ fetchImpl: async (url, options) => {
      if (cancelled && mode === 'offline' && url.includes('/objects/page?')) throw new Error('Synthetic read outage after durable cancellation');
      const response = await fetch(url, options);
      if (/\/changes\/[^/]+\/cancel$/.test(url)) {
        cancelled = true;
        if (mode === 'authentication_required') store.updateUser(b.token, a.user.id, { blocked: true, expectedVersion: store.me(a.token).version });
      }
      return response;
    } });
    await connect(value); const preview = await value.previewPageEditorial(object.id, species.id), staged = await value.adoptPageEditorial(preview.token);
    const result = await value.cancelPageEditorial(staged.changeId);
    assert.equal(result.cancelled, true); assert.equal(result.refreshConfirmed, false); assert.match(result.warning, /bestätigt/);
    assert.equal(rows(filename)[0].state, 'superseded'); assert.equal((await value.status()).pending, 0);
    assert.equal((await value.status()).lastError, mode);
    if (mode === 'authentication_required') assert.equal(Object.hasOwn(result, 'object'), false);
  });
});

test('cancellation recovers an already committed adoption instead of pretending to undo it', () => scoped(async ({ store, a, species, object, client, connect }) => {
  let lose = true;
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (lose && url.endsWith('/changes')) { lose = false; await response.text(); throw new Error('Synthetic lost apply acknowledgement'); }
    return response;
  } });
  await connect(value); const preview = await value.previewPageEditorial(object.id, species.id), staged = await value.adoptPageEditorial(preview.token);
  await assert.rejects(value.sync(), denied('offline')); const committed = store.getObject(a.token, 'species', species.id);
  const cancelled = await value.cancelPageEditorial(staged.changeId);
  assert.equal(cancelled.cancelled, false); assert.equal(cancelled.alreadyApplied, true);
  assert.equal(cancelled.object.revision, committed.revision); assert.equal(cancelled.object.approval, 'draft');
  assert.equal(store.getObject(a.token, 'species', species.id).revision, committed.revision); assert.equal((await value.status()).pending, 0);
}));

test('cancellation recovers an already recorded conflict after response loss and retains both versions', () => scoped(async ({ species, object, client, connect, changeSpecies }) => {
  let lose = true;
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (lose && url.endsWith('/changes')) { lose = false; await response.text(); throw new Error('Synthetic lost conflict acknowledgement'); }
    return response;
  } });
  await connect(value); const preview = await value.previewPageEditorial(object.id, species.id), staged = await value.adoptPageEditorial(preview.token);
  const concurrent = changeSpecies('Parallel gepflegter englischer Name');
  await assert.rejects(value.sync(), denied('offline'));
  const result = await value.cancelPageEditorial(staged.changeId);
  assert.equal(result.cancelled, false); assert.equal(result.conflict, true);
  const conflict = (await value.listConflicts())[0]; assert.equal(conflict.currentRevision, concurrent.revision);
  assert.equal(conflict.current.input.english, 'Parallel gepflegter englischer Name');
  assert.equal(conflict.proposed.schemaVersion, 2); assert.equal(conflict.localVersions.length, 1);
  assert.equal((await value.getObject('species', species.id)).localConflict, true);
}));

test('sync recognizes a prior cancellation tombstone without retrying the old editorial content', () => scoped(async ({ store, a, species, object, filename, client, connect }) => {
  const value = client(); await connect(value); const preview = await value.previewPageEditorial(object.id, species.id), staged = await value.adoptPageEditorial(preview.token);
  const sealed = JSON.parse(rows(filename)[0].request_json);
  store.cancelChange(a.token, { changeId: staged.changeId, requestHash: requestHash(sealed) });
  await value.sync(); assert.equal((await value.status()).pending, 0); assert.equal(rows(filename)[0].state, 'superseded');
  assert.equal(store.getObject(a.token, 'species', species.id).revision, species.revision);
}));

test('cancellation never removes a later local follow-up that depends on the sealed change', () => scoped(async ({ species, object, filename, client, connect }) => {
  const requests = [], value = client({ fetchImpl: (url, options) => { requests.push(url); return fetch(url, options); } });
  await connect(value); const preview = await value.previewPageEditorial(object.id, species.id), staged = await value.adoptPageEditorial(preview.token);
  const next = structuredClone(staged.object.data); next.input.english = 'Eigene Folgeänderung';
  await value.editExistingObject('species', species.id, next);
  await assert.rejects(value.cancelPageEditorial(staged.changeId), error => error.status === 409);
  assert.equal(rows(filename).length, 2); assert.equal((await value.getObject('species', species.id)).data.input.english, 'Eigene Folgeänderung');
  assert.ok(!requests.some(url => /\/changes\/[^/]+\/cancel$/.test(url)));
}));

test('a durable cancellation guard blocks a second cache writer, survives lost acknowledgement and clears after restart sync', () => scoped(async ({ species, object, filename, client, connect }) => {
  const credentials = createMemoryCredentialStore(); let peer, blockedCode, lose = true;
  const first = client({ credentialStore: credentials, fetchImpl: async (url, options) => {
    if (lose && /\/changes\/[^/]+\/cancel$/.test(url)) {
      const data = structuredClone(species.data); data.input.english = 'Während des Abbruchs versuchte Folgeeingabe';
      try { peer.edit(peer.active().id, 'species', species.id, data); } catch (error) { blockedCode = error.code; }
      const response = await fetch(url, options); lose = false; await response.text(); throw new Error('Synthetic lost cancellation response with second writer');
    }
    return fetch(url, options);
  } });
  await connect(first); const preview = await first.previewPageEditorial(object.id, species.id), staged = await first.adoptPageEditorial(preview.token);
  try {
    peer = createSharedProjectClientStore({ filename, localStorageConfirmed: true });
    await assert.rejects(first.cancelPageEditorial(staged.changeId), denied('offline'));
    assert.equal(blockedCode, 'change_blocked'); assert.equal(rows(filename).length, 1);
    const data = structuredClone(species.data); data.input.english = 'Auch vor Neustart weiter gesperrt';
    assert.throws(() => peer.edit(peer.active().id, 'species', species.id, data), denied('change_blocked'));
  } finally { peer?.close(); }
  await first.close();
  const reopened = client({ credentialStore: credentials }); await reopened.sync();
  assert.equal((await reopened.status()).pending, 0); assert.equal(rows(filename)[0].state, 'superseded');
  const next = structuredClone((await reopened.getObject('species', species.id)).data); next.input.english = 'Nach bestätigtem Abbruch wieder bearbeitbar';
  await reopened.editExistingObject('species', species.id, next); assert.equal((await reopened.status()).pending, 1);
  assert.equal((await reopened.getObject('species', species.id)).data.input.english, 'Nach bestätigtem Abbruch wieder bearbeitbar');
}));

test('a cancellation lost before delivery resumes cancellation after restart and never sends the original adoption', () => scoped(async ({ store, a, species, object, filename, client, connect }) => {
  const credentials = createMemoryCredentialStore();
  const first = client({ credentialStore: credentials, fetchImpl: (url, options) => {
    if (/\/changes\/[^/]+\/cancel$/.test(url)) throw new Error('Synthetic cancellation request not delivered');
    return fetch(url, options);
  } });
  await connect(first); const preview = await first.previewPageEditorial(object.id, species.id), staged = await first.adoptPageEditorial(preview.token);
  await assert.rejects(first.cancelPageEditorial(staged.changeId), denied('offline')); await first.close();
  assert.equal(rows(filename)[0].state, 'queued');
  const writes = [], reopened = client({ credentialStore: credentials, fetchImpl: (url, options) => {
    if (options.method === 'POST') writes.push(new URL(url).pathname); return fetch(url, options);
  } });
  await reopened.sync();
  assert.deepEqual(writes, [`/api/v1/changes/${staged.changeId}/cancel`]);
  assert.equal((await reopened.status()).pending, 0); assert.equal(rows(filename)[0].state, 'superseded');
  assert.equal(store.getObject(a.token, 'species', species.id).revision, species.revision);
}));

test('the public capability DTO does not return stale writer claims after its response changes role', () => scoped(async ({ store, a, b, client, connect }) => {
  let armed = false;
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (armed && url.endsWith('/capabilities')) {
      armed = false; store.updateUser(b.token, a.user.id, { role: 'contributor', expectedVersion: store.me(a.token).version });
    }
    return response;
  } });
  await connect(value); armed = true; await assert.rejects(value.capabilities(), denied('project_changed'));
  assert.equal((await value.capabilities()).user.role, 'contributor');
}));

// These final fixtures qualify response framing only. Deliberately injected
// authenticated transport payloads do not prove server adoption authorization.
function largeTransportRecord({ species, object, projectId, userId }, exactBytes = 3 * 1024 * 1024) {
  const data = buildPageEditorialAdoption({ pageObject: object, speciesObject: species, projectId,
    actor: { id: userId, projectId, role: 'admin' } }).data;
  data.input.transportFixture = '';
  data.input.transportFixture = 'x'.repeat(exactBytes - Buffer.byteLength(objectJson(data)));
  return validateSpeciesRecord(data, species.id);
}

test('bounded page response admits a 4 MiB record plus only its small transport envelope', () => scoped(async ({ a, species, object, client, connect }) => {
  const data = largeTransportRecord({ species, object, projectId: a.projectId, userId: a.user.id }, 4 * 1024 * 1024);
  let enabled = false, multiple = false;
  const value = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (!enabled || !url.includes('/objects/page?')) return response;
    const content = await response.json(); content.totalCount = multiple ? 2 : 1;
    content.objects = content.checked ? [] : [{ ...species, data }, ...(multiple ? [object] : [])];
    const text = JSON.stringify(content);
    if (!content.checked) assert.ok(Buffer.byteLength(text) > 4 * 1024 * 1024 && Buffer.byteLength(text) < 4 * 1024 * 1024 + 32 * 1024);
    return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  await connect(value); enabled = true; await value.refresh();
  assert.equal(Buffer.byteLength(objectJson((await value.getObject('species', species.id)).data)), 4 * 1024 * 1024);
  multiple = true; await assert.rejects(value.refresh(), denied('response_too_large'));
}));

test('conflict GET and resolve admit three individually bounded large records while retaining the 13 MiB transport ceiling', () => scoped(async ({ a, species, object, filename, client, connect }) => {
  const large = largeTransportRecord({ species, object, projectId: a.projectId, userId: a.user.id });
  const conflict = { id: randomUUID(), kind: 'species', objectId: species.id, authorId: a.user.id, baseRevision: species.revision,
    currentRevision: species.revision, base: large, current: large, proposed: large, createdAt: '2026-11-01T10:00:00.000Z', resolvedAt: null };
  let tooLarge = false, gets = 0, resolves = 0, peer;
  const value = client({ fetchImpl: async (url, options) => {
    if (url.endsWith(`/conflicts/${conflict.id}`)) {
      gets++; const result = tooLarge ? { ...conflict, transportPadding: 'x'.repeat(5 * 1024 * 1024) } : conflict;
      return Response.json(result);
    }
    if (url.endsWith(`/conflicts/${conflict.id}/resolve`)) {
      resolves++; const result = { conflict: { ...conflict, resolvedAt: '2026-11-01T10:01:00.000Z', resolvedBy: a.user.id, resolution: 'current', resultingRevision: species.revision }, object: species };
      assert.ok(Buffer.byteLength(JSON.stringify(result)) > 8 * 1024 * 1024);
      return Response.json(result);
    }
    return fetch(url, options);
  } });
  await connect(value);
  try {
    peer = createSharedProjectClientStore({ filename, localStorageConfirmed: true }); const binding = peer.active().id;
    peer.edit(binding, 'species', species.id, species.data); peer.saveConflict(binding, peer.pending(binding)[0].change_id, conflict);
    await value.refresh(); assert.ok(gets > 0); assert.equal((await value.listConflicts())[0].current.input.transportFixture.length, large.input.transportFixture.length);
    tooLarge = true; await assert.rejects(value.refresh(), denied('response_too_large')); tooLarge = false;
    await value.resolveConflict(conflict.id, { strategy: 'current', expectedRevision: species.revision });
    assert.equal(resolves, 1); assert.equal((await value.status()).pending, 0);
  } finally { peer?.close(); }
}));
