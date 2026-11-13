import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./public/app-page-ai.js', import.meta.url), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let index = 0; index < 4; index++) await new Promise(setImmediate); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function element(tag) {
  let text = ''; const handlers = new Map();
  return { tag, children: [], attributes: {}, value: '', checked: false, disabled: false, hidden: false,
    get textContent() { return text + this.children.map((child) => child.textContent).join(''); }, set textContent(value) { text = String(value); this.children = []; },
    append(...children) { this.children.push(...children); }, replaceChildren(...children) { text = ''; this.children = [...children]; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, handler) { handlers.set(name, [...(handlers.get(name) || []), handler]); },
    removeEventListener(name, handler) { handlers.set(name, (handlers.get(name) || []).filter((item) => item !== handler)); },
    querySelectorAll(selector) { return this.children.flatMap((child) => [...(child.tag === selector ? [child] : []), ...child.querySelectorAll(selector)]); },
    async emit(name) { if (this.disabled && ['click', 'change'].includes(name)) return; for (const handler of handlers.get(name) || []) await handler({ target: this }); },
  };
}
function fixture(options = {}) {
  const nodes = [], calls = [], opened = [], applied = [], notices = [];
  const binding = { sourceScope: 'personal-scope', draftId: 'draft-one', expectedRevision: 'revision-one', localGeneration: 3, saved: true, canEdit: true, workspaceEpoch: 5, userId: 'person-one' };
  const image = { alt: 'Vorhandener Alternativtext', caption: 'Felix eigene Bildunterschrift ohne Punkt', previewUrl: '/api/page-authoring/images/image-one?scope=personal-scope', decorative: false };
  const section = { id: 'habitat', kind: 'editorial', title: 'Lebensraum', requested: true, emptyConfirmed: false, blocks: [], sources: [] };
  const sources = options.sources || [{ id: 'species-habitat', title: 'Artquelle', revision: 'species-rev', text: 'Die Art lebt in Wäldern.', provenance: { type: 'species-editorial', sectionId: 'habitat' } },
    { id: 'draft-food', title: 'Vorhandene redaktionelle Quelle', revision: 'draft-rev', text: 'Die Art sucht am Boden nach Nahrung.', provenance: { type: 'draft-editorial', sectionId: 'food' } }];
  for (const item of sources) item.characters = item.text.length;
  const response = { sourceScope: binding.sourceScope, draftId: binding.draftId, revision: binding.expectedRevision, sectionId: section.id,
    sourcesRevision: 'sources-catalog-revision', target: { sectionId: section.id }, sources };
  const documentRef = { createElement(tag) { const node = element(tag); nodes.push(node); return node; } };
  const context = vm.createContext({ document: documentRef, URLSearchParams }); new vm.Script(source).runInContext(context);
  const actions = context.SpeciesExplorerPageAi.createPageAiActions({ documentRef,
    async fetchJson(url, request) { calls.push({ url, request }); return options.fetch ? options.fetch(url, request, response) : clone(response); },
    async openSuggestion(input) { opened.push(input); return options.open ? options.open(input) : true; },
    notice(message) { notices.push(message); } });
  const common = { getBinding: () => clone(binding), isCurrent: (captured) => options.current ? options.current(captured) : true };
  const imageContext = { ...common, imageId: 'usage-image-one', title: 'Amsel', getImage: () => clone(image),
    applyImageText(text, metadata) { applied.push({ type: 'image', text, metadata: clone(metadata) }); if (options.accept === false) return false;
      image.alt = text; binding.localGeneration++; binding.saved = false; f.preview = null; return true; } };
  const sectionContext = { ...common, sectionId: section.id, getSection: () => clone(section),
    applySectionProposal(proposal, metadata) { applied.push({ type: 'section', proposal: clone(proposal), metadata: clone(metadata) }); if (options.accept === false) return false;
      if (proposal.kind === 'source-text') section.blocks.push(...proposal.paragraphs.map((item) => ({ type: 'paragraph', text: item.text })));
      binding.localGeneration++; binding.saved = false; f.preview = null; return true; } };
  const f = { actions, nodes, calls, opened, applied, notices, binding, image, section, response, imageContext, sectionContext, preview: { id: 'old-preview' },
    find(root, tag, label) { return [root, ...root.querySelectorAll(tag)].find((node) => node.tag === tag && (!label || node.textContent === label)); },
    imageAction: () => actions.createImageAction(imageContext), sectionActions: () => actions.createSectionActions(sectionContext),
    async load(root) { await this.find(root, 'button', 'Quellen auswählen').emit('click'); },
    async select(root, id, checked = true) { const input = root.querySelectorAll('input').find((node) => node.value === id); assert.ok(input, id); input.checked = checked; await input.emit('change'); },
    async click(root, label) { const node = this.find(root, 'button', label); assert.ok(node, label); await node.emit('click'); },
    proposal(kind = opened.at(-1)?.kind) { const request = opened.at(-1).request;
      return { kind, status: 'proposal', approved: false, transferred: false, humanReviewRequired: true,
        binding: { type: 'page-authoring', sourceScope: request.sourceScope, documentId: request.draftId, sectionId: request.sectionId,
          revision: request.expectedRevision, sourceIds: clone(request.sourceIds), sourcesRevision: 'selected-sources-hash' },
        sources: sources.filter((item) => request.sourceIds.includes(item.id)).map(({ id, revision, title }) => ({ id, revision, title })),
        ...(kind === 'source-text' ? { paragraphs: [{ text: 'Die Art bewohnt Wälder.', sourceIds: ['species-habitat'], evidenceQuotes: [{ sourceId: 'species-habitat', quote: 'lebt in Wäldern' }] }] }
          : { findings: [{ kind: 'unclear', draftQuote: 'Ungeprüfter Absatz', explanation: 'Bitte die Aussage anhand der Quelle prüfen.', sourceIds: ['species-habitat'], evidenceQuotes: [{ sourceId: 'species-habitat', quote: 'lebt in Wäldern' }] }] }) };
    } };
  return f;
}

test('creating actions only builds inline controls and never opens a dialog or starts a request', () => {
  const f = fixture(), image = f.imageAction(), section = f.sectionActions();
  assert.equal(image.tag, 'button'); assert.equal(section.tag, 'div'); assert.equal(f.nodes.some((node) => node.tag === 'dialog'), false);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.opened, []); assert.deepEqual(f.applied, []);
});

test('image action sends only the exact saved image-usage request and acceptance preserves the existing caption', async () => {
  const f = fixture(), button = f.imageAction(), caption = f.image.caption; await button.emit('click');
  assert.equal(f.opened.length, 1); const input = f.opened[0];
  assert.equal(input.kind, 'alt-text'); assert.equal(input.initialText, 'Vorhandener Alternativtext'); assert.equal(input.previewUrl, f.image.previewUrl);
  assert.deepEqual(clone(input.request), { type: 'page-authoring', sourceScope: 'personal-scope', draftId: 'draft-one', expectedRevision: 'revision-one', imageId: 'usage-image-one' });
  assert.equal(f.applied.length, 0); assert.equal(f.binding.saved, true);
  assert.equal(await input.applyProposal('Menschlich geprüfter Alttext', 'Diese Caption darf nicht übernommen werden'), true);
  assert.equal(f.image.alt, 'Menschlich geprüfter Alttext'); assert.equal(f.image.caption, caption); assert.equal(f.binding.saved, false); assert.equal(f.preview, null);
  assert.deepEqual(Object.keys(f.applied[0].metadata).sort(), ['binding', 'imageId']); assert.equal(await input.applyProposal('Noch einmal'), false);
  assert.deepEqual(f.calls, []);
});

test('unsaved input, missing edit rights and decorative images cannot start an image suggestion', async () => {
  for (const change of [(f) => { f.binding.saved = false; }, (f) => { f.binding.canEdit = false; }, (f) => { f.image.decorative = true; }]) {
    const f = fixture(); change(f); const button = f.imageAction(); assert.equal(button.disabled, true); await button.emit('click'); assert.equal(f.opened.length, 0);
  }
  const f = fixture(), button = f.imageAction(); f.binding.saved = false; await button.emit('click');
  assert.equal(f.opened.length, 0); assert.match(f.notices.join(' '), /zuerst speichern/); assert.equal(f.binding.saved, false);
});

test('scope, revision, local generation, target text and permission drift invalidate a pending image proposal', async () => {
  for (const change of [(f) => { f.binding.sourceScope = 'other-person'; }, (f) => { f.binding.expectedRevision = 'newer'; },
    (f) => { f.binding.localGeneration++; }, (f) => { f.image.alt = 'Eigene neuere Eingabe'; }, (f) => { f.image.caption = 'Neue eigene Caption'; },
    (f) => { f.binding.canEdit = false; }, (f) => { f.binding.saved = false; }, (f) => { f.binding.workspaceEpoch++; }, (f) => { f.binding.userId = 'other-person'; }]) {
    const f = fixture(), button = f.imageAction(); await button.emit('click'); const input = f.opened[0]; change(f);
    assert.equal(await input.isCurrent(), false); assert.equal(await input.applyProposal('Veralteter Vorschlag'), false); assert.equal(f.applied.length, 0);
  }
});

test('an asynchronous freshness response cannot cross a later editor change before opening or applying', async () => {
  let gate = deferred(); const before = fixture({ current: () => gate.promise }), button = before.imageAction();
  const opening = button.emit('click'); await flush(); before.binding.localGeneration++; gate.resolve(true); await opening; assert.equal(before.opened.length, 0);
  let checking = false; gate = deferred(); const apply = fixture({ current: () => checking ? gate.promise : true }); await apply.imageAction().emit('click'); checking = true;
  const applying = apply.opened[0].applyProposal('Später Text'); await flush(); apply.image.alt = 'Inzwischen eigene Eingabe'; gate.resolve(true);
  assert.equal(await applying, false); assert.equal(apply.applied.length, 0); assert.equal(apply.image.alt, 'Inzwischen eigene Eingabe');
});

test('a double click opens once and disposal prevents a late proposal from applying', async () => {
  const gate = deferred(), f = fixture({ open: () => gate.promise }), button = f.imageAction();
  const opening = button.emit('click'); await flush(); await button.emit('click'); assert.equal(f.opened.length, 1);
  f.actions.dispose(); gate.resolve(true); await opening; assert.equal(await f.opened[0].isCurrent(), false); assert.equal(await f.opened[0].applyProposal('Late'), false);
  await button.emit('click'); assert.equal(f.opened.length, 1); f.actions.dispose(); assert.equal(f.applied.length, 0);
});

test('editorial sources load only by explicit action and start only after deliberate selection', async () => {
  const f = fixture(), root = f.sectionActions(); await f.load(root);
  assert.equal(f.calls.length, 1); const url = new URL(f.calls[0].url, 'http://fixture');
  assert.equal(url.pathname, '/api/local-ai/page-authoring/sources');
  assert.deepEqual(Object.fromEntries(url.searchParams), { draftId: 'draft-one', scope: 'personal-scope', revision: 'revision-one', sectionId: 'habitat' });
  assert.equal(f.calls[0].request, undefined); assert.equal(root.querySelectorAll('input').every((node) => !node.checked), true);
  const start = f.find(root, 'button', 'Text aus Quellen vorschlagen'); assert.equal(start.disabled, true); await start.emit('click'); assert.equal(f.opened.length, 0);
  await f.select(root, 'species-habitat'); assert.equal(start.disabled, false); await start.emit('click');
  assert.equal(f.opened.length, 1); assert.equal(f.opened[0].initialText, ''); assert.equal(f.opened[0].kind, 'source-text');
  assert.deepEqual(clone(f.opened[0].request), { type: 'page-authoring', sourceScope: 'personal-scope', draftId: 'draft-one', expectedRevision: 'revision-one',
    sectionId: 'habitat', sourceIds: ['species-habitat'], expectedSourcesRevision: 'sources-catalog-revision' });
  assert.equal(f.applied.length, 0); assert.deepEqual(f.section.blocks, []); assert.equal(f.binding.saved, true);
  const proposal = f.proposal(); assert.equal(await f.opened[0].applyProposal(proposal), true);
  assert.deepEqual(f.applied[0].proposal.paragraphs, proposal.paragraphs); assert.deepEqual(f.applied[0].metadata.sources, [f.response.sources[0]]);
  assert.equal(f.binding.saved, false); assert.equal(f.preview, null);
  assert.equal(f.calls.every((call) => new URL(call.url, 'http://fixture').pathname === '/api/local-ai/page-authoring/sources'), true);
});

test('automatic sections, unrequested sections, conscious emptiness and existing text have distinct actions', async () => {
  const automatic = fixture(); automatic.section.kind = 'runtime'; const hidden = automatic.sectionActions();
  assert.equal(automatic.find(hidden, 'button', 'Quellen auswählen').disabled, true); await automatic.load(hidden); assert.equal(automatic.calls.length, 0);
  for (const change of [(f) => { f.section.requested = false; }, (f) => { f.section.emptyConfirmed = true; }]) {
    const f = fixture(); change(f); const root = f.sectionActions(); await f.load(root); await f.select(root, 'species-habitat');
    assert.equal(f.find(root, 'button', 'Text aus Quellen vorschlagen').disabled, true); assert.equal(f.find(root, 'button', 'Text anhand Quellen prüfen').disabled, true);
  }
  const f = fixture(); f.section.blocks = [{ type: 'paragraph', text: 'Ungeprüfter Absatz mit eigener Schreibweise' }, { type: 'bullet-list', items: ['Eigener Listenpunkt'] }];
  const original = clone(f.section.blocks), root = f.sectionActions(); await f.load(root); await f.select(root, 'species-habitat');
  assert.equal(f.find(root, 'button', 'Text aus Quellen vorschlagen').disabled, true); await f.click(root, 'Text anhand Quellen prüfen');
  assert.equal(f.opened[0].kind, 'review-text'); assert.equal(f.opened[0].initialText, 'Ungeprüfter Absatz mit eigener Schreibweise\n\nEigener Listenpunkt');
  const proposal = f.proposal('review-text'); assert.equal(await f.opened[0].applyProposal(proposal), true);
  assert.deepEqual(f.section.blocks, original, 'review acceptance never replaces or edits existing blocks');
  assert.deepEqual(f.applied[0].proposal.findings, proposal.findings); assert.equal(f.applied[0].metadata.kind, 'review-text');
});

test('a delayed source response is ignored after person, revision, target, local-input or permission changes', async () => {
  for (const change of [(f) => { f.binding.sourceScope = 'other-person'; }, (f) => { f.binding.expectedRevision = 'newer'; },
    (f) => { f.binding.localGeneration++; }, (f) => { f.section.blocks.push({ type: 'paragraph', text: 'Eigener Text inzwischen' }); },
    (f) => { f.binding.saved = false; }, (f) => { f.binding.canEdit = false; }, (f) => { f.binding.workspaceEpoch++; }, (f) => { f.binding.userId = 'other-person'; }]) {
    const gate = deferred(), f = fixture({ fetch: () => gate.promise }), root = f.sectionActions(), loading = f.load(root); await flush();
    assert.equal(f.calls.length, 1); change(f); gate.resolve(clone(f.response)); await loading;
    assert.equal(root.querySelectorAll('input').length, 0); assert.equal(root.textContent.includes('Die Art lebt'), false); assert.equal(f.opened.length, 0); assert.equal(f.applied.length, 0);
  }
});

test('foreign, duplicate and inconsistent source DTOs are not displayed or reused automatically', async () => {
  for (const change of [(value) => { value.sourceScope = 'foreign'; }, (value) => { value.draftId = 'foreign'; }, (value) => { value.revision = 'old'; },
    (value) => { value.sectionId = 'other'; }, (value) => { value.sources.push(clone(value.sources[0])); }, (value) => { value.sources[0].characters++; }]) {
    const f = fixture({ fetch(_url, _options, response) { const value = clone(response); change(value); return value; } }), root = f.sectionActions(); await f.load(root);
    assert.equal(root.querySelectorAll('input').length, 0); assert.equal(f.find(root, 'button', 'Text aus Quellen vorschlagen').disabled, true);
    assert.equal(f.calls.length, 1); assert.equal(f.opened.length, 0); assert.match(f.notices.join(' '), /nicht bestätigt/);
  }
});

test('source selection is limited to twenty explicit IDs and eight thousand characters', async () => {
  const sources = Array.from({ length: 21 }, (_value, index) => ({ id: `source-${index}`, title: `Quelle ${index}`, revision: 'r', text: 'Ein belegter Satz.', provenance: { type: 'draft-editorial', sectionId: `section-${index}` } }));
  const f = fixture({ sources }), root = f.sectionActions(); await f.load(root); for (let index = 0; index < 21; index++) await f.select(root, `source-${index}`);
  assert.equal(root.querySelectorAll('input').filter((node) => node.checked).length, 20); assert.match(f.notices.join(' '), /höchstens 20 Quellen/);
  await f.click(root, 'Text aus Quellen vorschlagen'); assert.equal(f.opened[0].request.sourceIds.length, 20);
  const large = fixture({ sources: [{ id: 'too-large', title: 'Große Quelle', revision: 'r', text: 'A'.repeat(8001), provenance: { type: 'draft-editorial', sectionId: 'habitat' } }] });
  const largeRoot = large.sectionActions(); await large.load(largeRoot); await large.select(largeRoot, 'too-large');
  assert.equal(largeRoot.querySelectorAll('input')[0].checked, false); assert.equal(large.find(largeRoot, 'button', 'Text aus Quellen vorschlagen').disabled, true);
});

test('a changed selection or foreign proposal binding cannot apply into the current section', async () => {
  const f = fixture(), root = f.sectionActions(); await f.load(root); await f.select(root, 'species-habitat'); await f.click(root, 'Text aus Quellen vorschlagen');
  const input = f.opened[0], proposal = f.proposal();
  for (const change of [(value) => { value.binding.sourceScope = 'foreign'; }, (value) => { value.binding.documentId = 'foreign'; },
    (value) => { value.binding.sectionId = 'other'; }, (value) => { value.binding.revision = 'old'; }, (value) => { value.binding.sourceIds = ['draft-food']; },
    (value) => { value.approved = true; }]) { const value = clone(proposal); change(value); assert.equal(await input.applyProposal(value), false); }
  await f.select(root, 'draft-food'); assert.equal(await input.isCurrent(), false); assert.equal(await input.applyProposal(proposal), false); assert.equal(f.applied.length, 0);
});

test('source loading failure and late disposal preserve the editor without retries or leaked transport details', async () => {
  const f = fixture({ fetch() { throw new Error('PRIVATE SOURCE PATH'); } }), root = f.sectionActions(); await f.load(root);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.section.blocks, []); assert.equal(f.binding.saved, true); assert.doesNotMatch(f.notices.join(' '), /PRIVATE SOURCE PATH/);
  const gate = deferred(), late = fixture({ fetch: () => gate.promise }), lateRoot = late.sectionActions(), loading = late.load(lateRoot); await flush();
  late.actions.dispose(); gate.resolve(clone(late.response)); await loading; assert.equal(lateRoot.querySelectorAll('input').length, 0); assert.equal(late.opened.length, 0);
});

test('aktualisierte Editorrechte und Speicherzustand aktualisieren vorhandene Aktionsknöpfe ohne neue Requests', () => {
  const f = fixture(), button = f.imageAction(); assert.equal(button.disabled, false);
  f.binding.saved = false; f.actions.refresh(); assert.equal(button.disabled, true);
  f.binding.saved = true; f.actions.refresh(); assert.equal(button.disabled, false);
  f.binding.canEdit = false; f.actions.refresh(); assert.equal(button.disabled, true);
  f.actions.dispose(); assert.equal(button.disabled, true); assert.deepEqual(f.calls, []);
});

test('Review zählt den gespeicherten Abschnitt mit Quellen zusammen und behält Zeilenumbrüche innerhalb von Listen', async () => {
  const blocked = fixture(); blocked.section.blocks = [{ type: 'paragraph', text: 'A'.repeat(7990) }];
  const blockedRoot = blocked.sectionActions(); await blocked.load(blockedRoot); await blocked.select(blockedRoot, 'species-habitat');
  assert.equal(blockedRoot.querySelectorAll('input')[0].checked, false);
  assert.equal(blocked.find(blockedRoot, 'button', 'Text anhand Quellen prüfen').disabled, true);
  const f = fixture(); f.section.blocks = [{ type: 'numbered-list', items: ['Erster Absatzpunkt', 'Zweiter Absatzpunkt'] }, { type: 'paragraph', text: 'Eigener Absatz' }];
  const root = f.sectionActions(); await f.load(root); await f.select(root, 'species-habitat'); await f.click(root, 'Text anhand Quellen prüfen');
  assert.equal(f.opened[0].initialText, 'Erster Absatzpunkt\nZweiter Absatzpunkt\n\nEigener Absatz'); assert.equal(f.applied.length, 0);
});


test('section controls retain explicit source work and expose no manual language-start action', () => {
  const f = fixture(), root = f.sectionActions();
  assert.equal(f.find(root, 'button', 'Sprache prüfen'), undefined);
  assert.ok(f.find(root, 'button', 'Quellen auswählen'));
  assert.ok(f.find(root, 'button', 'Text aus Quellen vorschlagen'));
  assert.ok(f.find(root, 'button', 'Text anhand Quellen prüfen'));
  assert.deepEqual(f.calls, []); assert.deepEqual(f.opened, []);
});
