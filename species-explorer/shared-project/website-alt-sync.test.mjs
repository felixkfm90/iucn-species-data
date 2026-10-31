import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fixture } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient, createMemoryCredentialStore } from "./client.mjs";
import { createWebsiteAltStore } from "../website-alt-store.mjs";
import { encodeWebsiteAltPage, validateWebsiteAltRemoteObject, websiteAltObjectId, createWebsiteAltSync, retainWebsiteAltHistory } from "./website-alt-sync.mjs";

const pageA = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen";
const pageB = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/delphi";
const clock = () => new Date("2026-10-31T10:00:00.000Z");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const image = (name = "first", values = {}) => {
  const src = `https://images.squarespace-cdn.com/content/v1/fixture/${name}.jpg`, result = { src, previewSrc: `${src}?format=750w`,
    context: "content", kind: "image", alt: `${name}.jpg`, caption: "", altPresent: true, ...values };
  return { ...result, key: sha(`${src}\n${result.context}\n${result.kind}`) };
};
const scanPage = (url, values = {}) => ({ url, title: url === pageA ? "Athen" : "Delphi", checkedAt: "2026-10-31T09:00:00.000Z", images: [image(url === pageA ? "first" : "second")], ...values });
async function scan(store, pages = [scanPage(pageA), scanPage(pageB)]) {
  return store.mergeScan({ pages, discoveredUrls: pages.map((entry) => entry.url), completedAt: clock().toISOString(), complete: true, errors: [], coverageNotes: [] });
}
async function edit(store, pageUrl, text, approve = false) {
  const state = await store.snapshot(), page = state.pages.find((entry) => entry.url === pageUrl), img = page.images.find((entry) => entry.status !== "removed");
  return store[approve ? "approve" : "draft"]({ revision: state.revision, pageUrl, imageKey: img.key, text, decorative: false });
}
const failure = (code) => (error) => error.code === code;
async function scoped(fn) {
  const f = fixture(), clients = [], bridges = []; let http;
  try {
    const initialized = await f.initialized(), { store, a, b } = initialized;
    http = createSharedProjectHttp({ store }); const address = await http.listen();
    async function side(label, user, options = {}) {
      const localStore = createWebsiteAltStore({ dataRoot: path.join(f.root, `local-${label}`), now: clock }); await scan(localStore);
      const client = createSharedProjectClient({ filename: path.join(f.root, `client-${label}.sqlite`), localStorageConfirmed: true, allowLoopbackHttp: true, ...options }); clients.push(client);
      await client.connect({ baseUrl: address.url, username: user.username, password: f.password });
      const bridge = createWebsiteAltSync({ localStore, client, filename: path.join(f.root, `bridge-${label}.sqlite`), localStorageConfirmed: true }); bridges.push(bridge);
      return { localStore, client, bridge };
    }
    async function link(side, pageUrl = pageA, adoptUnlinkedApprovals = false) {
      const exported = await side.localStore.exportPage({ pageUrl });
      return side.bridge.link({ pageUrl, expectedPageRevision: exported.pageRevision, confirmed: true, adoptUnlinkedApprovals });
    }
    async function acceptRemote(side, pageUrl = pageA) {
      const exported = await side.localStore.exportPage({ pageUrl }), current = await side.client.getObject("page", websiteAltObjectId(pageUrl), { serverOnly: true });
      await side.bridge.resolve({ pageUrl, strategy: "current", confirmed: true, expectedPageRevision: exported.pageRevision, expectedRemoteRevision: current.revision });
      return side.bridge.importRemote({ pageUrl, confirmed: true, expectedPageRevision: exported.pageRevision });
    }
    await fn({ f, ...initialized, address, side, link, acceptRemote });
  } finally { for (const value of bridges) await value.close(); for (const value of clients) await value.close(); if (http) await http.close(); f.cleanup(); }
}

test("local export is read-only; raw JSON flags cannot authorize importing a foreign approval", () => scoped(async ({ side, a, f }) => {
  const first = await side("a", a.user); await edit(first.localStore, pageA, "Athen caption", true);
  const exported = await first.localStore.exportPage({ pageUrl: pageA }), filename = path.join(f.root, "local-a", "website", "alt-texts.json"), before = await fs.readFile(filename);
  const repeat = await first.localStore.exportPages({ pageUrls: [pageA] }); assert.equal(repeat.pages[0].pageRevision, exported.pageRevision);
  assert.deepEqual(await fs.readFile(filename), before);
  await assert.rejects(first.localStore.importSharedPage({ revision: exported.localRevision, pageUrl: pageA, expectedPageRevision: exported.pageRevision,
    page: exported.page, validatedEvidence: { serverValidated: true, pageUrl: pageA, pageRevision: exported.pageRevision } }), (error) => error.statusCode === 409);
  assert.deepEqual(await fs.readFile(filename), before);
}));

test("unknown local approvals require actual privileged role and explicit adoption; receipts are server-owned", () => scoped(async ({ side, a, store, f, link }) => {
  const first = await side("a", a.user); await edit(first.localStore, pageA, "Approved local text", true);
  const exported = await first.localStore.exportPage({ pageUrl: pageA }), id = websiteAltObjectId(pageA);
  await assert.rejects(first.client.createObject({ kind: "page", id, data: encodeWebsiteAltPage(exported.page) }), (error) => error.status === 403);
  await store.createUser(a.token, { username: "fixture-contributor", displayName: "Synthetic contributor", password: f.password, role: "contributor" });
  const user = (await store.login({ username: "fixture-contributor", password: f.password })).user, contributor = await side("contributor", user);
  const frame = encodeWebsiteAltPage(exported.page, { adoptUnlinkedApprovals: true });
  await assert.rejects(contributor.client.createObject({ kind: "page", id, data: frame }), (error) => error.status === 403);
  await link(first, pageA, true); const object = store.getObject(a.token, "page", id);
  assert.deepEqual(await first.bridge.backupProjectIds(), [a.projectId]);
  assert.equal(object.websiteAltEvidence.trusted, true); assert.equal(object.websiteAltEvidence.receipts[0].actorRole, "admin");
  assert.equal(object.websiteAltEvidence.receipts[0].actorId, a.user.id);
  const db = new DatabaseSync(f.filename, { readOnly: true }); try { assert.equal(db.prepare("SELECT count(*) AS n FROM website_alt_receipts").get().n, 1); } finally { db.close(); }
}));

test("contributor edits demote an approved/verified image while preserving history and cannot reactivate it", () => scoped(async ({ side, a, store, f, link }) => {
  const first = await side("a", a.user); await edit(first.localStore, pageA, "Public approved text", true);
  let state = await first.localStore.snapshot(), img = state.pages[0].images[0];
  await first.localStore.verify({ revision: state.revision, pageUrl: pageA, imageKey: img.key, approvalRevision: img.approval.revision,
    observedPage: scanPage(pageA, { images: [image("first", { alt: "Public approved text", caption: "Public approved text" })] }) });
  await link(first, pageA, true); const id = websiteAltObjectId(pageA), approved = store.getObject(a.token, "page", id);
  await store.createUser(a.token, { username: "typed-contributor", displayName: "Contributor", password: f.password, role: "contributor" });
  const token = (await store.login({ username: "typed-contributor", password: f.password })).token;
  const page = structuredClone(approved.data.page), previous = page.images[0];
  previous.history.push({ at: clock().toISOString(), reason: "Contributor draft", approval: previous.approval, verification: previous.verification });
  previous.approval = null; previous.verification = null; previous.status = "draft"; previous.draftText = "Unreviewed contributor text";
  const changed = store.submitChange(token, { changeId: "typed-contributor-draft", kind: "page", id, baseRevision: approved.revision, data: encodeWebsiteAltPage(page) });
  assert.equal(changed.status, "applied"); assert.equal(changed.object.data.page.images[0].approval, null);
  const revived = structuredClone(page); Object.assign(revived.images[0], { approval: approved.data.page.images[0].approval, verification: approved.data.page.images[0].verification,
    status: "verified", draftText: approved.data.page.images[0].draftText });
  assert.throws(() => store.submitChange(token, { changeId: "typed-contributor-revive", kind: "page", id, baseRevision: changed.object.revision, data: encodeWebsiteAltPage(revived) }), failure("website_alt_approval_required"));
  assert.equal(store.getObject(a.token, "page", id).revision, changed.object.revision);
}));

test("a trusted page imports across devices with both histories intact and no public check or CMS write", () => scoped(async ({ side, a, b, link, acceptRemote }) => {
  const first = await side("a", a.user), second = await side("b", b.user);
  await edit(first.localStore, pageA, "Athen approved", true); await link(first, pageA, true);
  const linked = await link(second); assert.equal(linked.reviewRequired, true);
  const imported = await acceptRemote(second); assert.equal(imported.publicCheckPerformed, false);
  const page = await second.localStore.exportPage({ pageUrl: pageA }); assert.equal(page.page.images[0].approval.text, "Athen approved");
  assert.ok(page.page.images[0].history.length > 0); assert.equal((await second.bridge.snapshot()).pending, 0);
}));

test("different pages sync independently, including a global local-store revision change", () => scoped(async ({ side, a, b, link, acceptRemote, store }) => {
  const first = await side("a", a.user), second = await side("b", b.user);
  await link(first, pageA); await link(first, pageB); await link(second, pageA); await link(second, pageB);
  await edit(first.localStore, pageA, "Athen draft A"); await edit(second.localStore, pageB, "Delphi draft B");
  await first.bridge.queue({ pageUrl: pageA }); await second.bridge.queue({ pageUrl: pageB });
  await first.bridge.sync({ pageUrl: pageA }); await second.bridge.sync({ pageUrl: pageB });
  assert.equal(store.listConflicts(a.token).length, 0);
  assert.equal(store.getObject(a.token, "page", websiteAltObjectId(pageA)).data.page.images[0].draftText, "Athen draft A");
  assert.equal(store.getObject(a.token, "page", websiteAltObjectId(pageB)).data.page.images[0].draftText, "Delphi draft B");
  await second.bridge.pull({ pageUrl: pageA }); const shown = await second.localStore.exportPage({ pageUrl: pageA });
  await edit(second.localStore, pageB, "Another Delphi local edit");
  await second.bridge.importRemote({ pageUrl: pageA, confirmed: true, expectedPageRevision: shown.pageRevision });
  assert.equal((await second.localStore.exportPage({ pageUrl: pageB })).page.images[0].draftText, "Another Delphi local edit");
  assert.ok(acceptRemote);
}));

test("a refreshed cache does not become a false base: same-page CAS preserves base/server/local and stale scan stops", () => scoped(async ({ side, a, b, link, store }) => {
  const first = await side("a", a.user), second = await side("b", b.user); await link(first); await link(second);
  await edit(first.localStore, pageA, "First person's edit"); await first.bridge.queue({ pageUrl: pageA }); await first.bridge.sync({ pageUrl: pageA });
  await second.client.refresh(); await edit(second.localStore, pageA, "Second person's edit"); await second.bridge.queue({ pageUrl: pageA });
  const result = await second.bridge.sync({ pageUrl: pageA }); assert.equal(result.conflict, true);
  const conflict = (await second.bridge.conflicts(pageA))[0];
  assert.equal(conflict.base.page.images[0].draftText, ""); assert.equal(conflict.current.page.images[0].draftText, "First person's edit");
  assert.equal(conflict.proposed.page.images[0].draftText, "Second person's edit");
  const actual = store.getObject(a.token, "page", websiteAltObjectId(pageA)), old = structuredClone(actual.data.page);
  old.checkedAt = "2026-10-30T00:00:00.000Z";
  assert.throws(() => store.submitChange(a.token, { kind: "page", id: actual.id, changeId: "old-scan-rejected", baseRevision: actual.revision, data: encodeWebsiteAltPage(old) }), failure("website_alt_stale_scan"));
}));

test("offline edits are durably queued before networking and only the selected page is sent", () => scoped(async ({ side, a, link, store, f }) => {
  let offline = false; const first = await side("a", a.user, { fetchImpl: async (...args) => { if (offline) throw new Error("synthetic offline"); return fetch(...args); } });
  await link(first); await link(first, pageB); offline = true;
  await edit(first.localStore, pageA, "Offline Athen"); await edit(first.localStore, pageB, "Offline Delphi");
  await first.bridge.queue({ pageUrl: pageA }); await first.bridge.queue({ pageUrl: pageB });
  await assert.rejects(first.bridge.sync({ pageUrl: pageA }), failure("offline"));
  const db = new DatabaseSync(path.join(f.root, "client-a.sqlite"), { readOnly: true });
  try { assert.equal(db.prepare("SELECT count(*) AS n FROM queue WHERE state='queued'").get().n, 2); } finally { db.close(); }
  offline = false; await first.bridge.sync({ pageUrl: pageA });
  assert.equal(store.getObject(a.token, "page", websiteAltObjectId(pageA)).data.page.images[0].draftText, "Offline Athen");
  assert.equal(store.getObject(a.token, "page", websiteAltObjectId(pageB)).data.page.images[0].draftText, "");
  assert.equal((await first.client.status()).pending, 1);
}));

test("a forged or foreign image approval cannot become a trusted import and old server receipts remain immutable", () => scoped(async ({ side, a, link, store, f }) => {
  const first = await side("a", a.user); await edit(first.localStore, pageA, "Athen approved", true); await link(first, pageA, true);
  const object = store.getObject(a.token, "page", websiteAltObjectId(pageA)), wrong = structuredClone(object);
  wrong.id = websiteAltObjectId(pageB); assert.throws(() => validateWebsiteAltRemoteObject(wrong, pageB));
  const swapped = structuredClone(object); swapped.websiteAltEvidence.receipts[0].imageKey = "f".repeat(64);
  assert.throws(() => validateWebsiteAltRemoteObject(swapped, pageA), failure("website_alt_untrusted_record"));
  const db = new DatabaseSync(f.filename, { readOnly: true }); let oldBytes;
  try { oldBytes = db.prepare("SELECT body FROM website_alt_receipts ORDER BY rowid").all().map((row) => row.body); } finally { db.close(); }
  await edit(first.localStore, pageA, "Next draft"); await first.bridge.queue({ pageUrl: pageA }); await first.bridge.sync({ pageUrl: pageA });
  const reopened = new DatabaseSync(f.filename, { readOnly: true });
  try { assert.deepEqual(reopened.prepare("SELECT body FROM website_alt_receipts ORDER BY rowid").all().slice(0, oldBytes.length).map((row) => row.body), oldBytes); } finally { reopened.close(); }
}));

test("complete histories over the old generic body size roundtrip without truncation; generic limits stay intact", () => scoped(async ({ side, a, link, store }) => {
  const first = await side("a", a.user), exported = await first.localStore.exportPage({ pageUrl: pageA }), page = exported.page;
  page.images[0].history = Array.from({ length: 180 }, (_, index) => ({ at: clock().toISOString(), reason: `Historical draft ${index}`, approval: null, verification: null,
    draftText: "x".repeat(1800), draftDecorative: false, draftSavedAt: clock().toISOString(), status: "draft" }));
  const frame = encodeWebsiteAltPage(page);
  const object = await first.client.createObject({ kind: "page", id: websiteAltObjectId(pageA), data: frame });
  assert.equal(object.data.page.images[0].history.length, 180);
  assert.equal(store.getObject(a.token, "page", object.id).data.page.images[0].history[179].draftText.length, 1800);
  assert.throws(() => store.createObject(a.token, { kind: "page", id: "oversized-generic", data: { title: "Generic", text: "x".repeat(300000) } }), (error) => error.status === 413);
  assert.ok(link);
}));

test("a committed response lost before acknowledgement survives bridge/client reopening without duplicated versions", () => scoped(async ({ side, a, link, store, f }) => {
  const credentialStore = createMemoryCredentialStore(); let lose = true;
  const first = await side("a", a.user, { credentialStore, fetchImpl: async (url, options) => {
    const response = await fetch(url, options); if (lose && url.endsWith("/changes")) { lose = false; await response.text(); throw new Error("synthetic lost committed answer"); } return response;
  } }); await link(first); await edit(first.localStore, pageA, "Committed once"); await first.bridge.queue({ pageUrl: pageA });
  await assert.rejects(first.bridge.sync({ pageUrl: pageA }), failure("offline"));
  const version = store.getObject(a.token, "page", websiteAltObjectId(pageA)).revision;
  await first.bridge.close(); await first.client.close();
  const client = createSharedProjectClient({ filename: path.join(f.root, "client-a.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true, credentialStore });
  const bridge = createWebsiteAltSync({ client, localStore: first.localStore, filename: path.join(f.root, "bridge-a.sqlite"), localStorageConfirmed: true });
  try {
    assert.equal(bridge.status().pending, null); assert.equal(bridge.status().localStateUnchecked, true);
    const result = await bridge.sync({ pageUrl: pageA }); assert.equal(result.synced, true); assert.equal(result.publiclyVerifiedBySync, false);
    assert.equal(store.getObject(a.token, "page", websiteAltObjectId(pageA)).revision, version); assert.equal((await bridge.snapshot()).pending, 0);
  } finally { await bridge.close(); await client.close(); }
}));

test("same-page conflict is deliberately merged and locally imported with both people's drafts retained", () => scoped(async ({ side, a, b, link, store }) => {
  const first = await side("a", a.user), second = await side("b", b.user); await link(first); await link(second);
  await edit(first.localStore, pageA, "Server draft A"); await first.bridge.queue({ pageUrl: pageA }); await first.bridge.sync({ pageUrl: pageA });
  await edit(second.localStore, pageA, "Local draft B"); await second.bridge.queue({ pageUrl: pageA }); await second.bridge.sync({ pageUrl: pageA });
  const conflict = (await second.bridge.conflicts(pageA))[0], shown = await second.localStore.exportPage({ pageUrl: pageA });
  const remote = await second.client.getObject("page", websiteAltObjectId(pageA), { serverOnly: true });
  await assert.rejects(second.bridge.resolve({ pageUrl: pageA, conflictId: "other-page-conflict", strategy: "local", confirmed: true,
    expectedPageRevision: shown.pageRevision, expectedRemoteRevision: remote.revision }), failure("website_alt_foreign_conflict"));
  await second.bridge.resolve({ pageUrl: pageA, conflictId: conflict.id, strategy: "local", confirmed: true,
    expectedPageRevision: shown.pageRevision, expectedRemoteRevision: remote.revision });
  const applied = await second.bridge.importRemote({ pageUrl: pageA, confirmed: true, expectedPageRevision: shown.pageRevision }); assert.equal(applied.imported, true);
  const final = await second.localStore.exportPage({ pageUrl: pageA }); assert.equal(final.page.images[0].draftText, "Local draft B");
  assert.ok(final.page.images[0].history.some((entry) => entry.draftText === "Server draft A"));
  assert.equal(store.listConflicts(a.token).filter((entry) => !entry.resolvedAt).length, 0);
}));

test("pending coupled caption propagation retains the original approval without inventing public verification", () => scoped(async ({ side, a, link, store }) => {
  const first = await side("a", a.user); await edit(first.localStore, pageA, "Approved caption without period", true);
  const approval = (await first.localStore.exportPage({ pageUrl: pageA })).page.images[0].approval.revision;
  await scan(first.localStore, [scanPage(pageA, { checkedAt: "2026-10-31T09:30:00.000Z", images: [image("first", { caption: "Approved caption without period" })] })]);
  const exported = await first.localStore.exportPage({ pageUrl: pageA }); assert.equal(exported.page.images[0].approval.revision, approval); assert.equal(exported.page.images[0].status, "approved");
  await link(first, pageA, true); const object = store.getObject(a.token, "page", websiteAltObjectId(pageA));
  assert.equal(object.data.page.images[0].verification, null); assert.equal(object.websiteAltEvidence.receipts.filter((entry) => entry.kind === "verification").length, 0);
}));

test("bridge close joins a begun refresh but stops before creating a remote object and leaves local work usable", () => scoped(async ({ side, a, f, store }) => {
  const first = await side("a", a.user); let notify, release;
  const entered = new Promise((resolve) => { notify = resolve; }), held = new Promise((resolve) => { release = resolve; });
  const client = { status: () => first.client.status(), getObject: (...args) => first.client.getObject(...args), editExistingObject: (...args) => first.client.editExistingObject(...args),
    sync: (...args) => first.client.sync(...args), createObject: (...args) => first.client.createObject(...args), listConflicts: () => first.client.listConflicts(), resolveConflict: (...args) => first.client.resolveConflict(...args),
    async refresh() { notify(); await held; return first.client.refresh(); } };
  const filename = path.join(f.root, "closing-bridge.sqlite"), bridge = createWebsiteAltSync({ localStore: first.localStore, client, filename, localStorageConfirmed: true });
  const shown = await first.localStore.exportPage({ pageUrl: pageA }), linking = bridge.link({ pageUrl: pageA, expectedPageRevision: shown.pageRevision, confirmed: true });
  const rejected = assert.rejects(linking, failure("website_alt_sync_closed")); await entered; const closing = bridge.close(); release(); await closing; await rejected;
  assert.equal(store.listObjects(a.token).length, 0); await fs.unlink(filename); assert.equal(bridge.status().closed, true); await assert.rejects(fs.stat(filename), (error) => error.code === "ENOENT");
  await edit(first.localStore, pageA, "Legacy workflow still available");
  assert.equal((await first.localStore.exportPage({ pageUrl: pageA })).page.images[0].draftText, "Legacy workflow still available");
}));

test("journal schema is explicit, old own unversioned journals migrate and unknown files stay byte-identical", () => scoped(async ({ side, a, f, link }) => {
  const first = await side("a", a.user); await link(first); await first.bridge.close();
  const filename = path.join(f.root, "bridge-a.sqlite"); let db = new DatabaseSync(filename);
  try { assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1); db.exec("PRAGMA user_version=0;"); } finally { db.close(); }
  const migrated = createWebsiteAltSync({ localStore: first.localStore, client: first.client, filename, localStorageConfirmed: true });
  assert.deepEqual(await migrated.backupProjectIds(), [a.projectId]); assert.equal(migrated.status().pending, null); await migrated.close();
  db = new DatabaseSync(filename); try { db.exec("PRAGMA user_version=99;"); } finally { db.close(); }
  const before = await fs.readFile(filename);
  assert.throws(() => createWebsiteAltSync({ localStore: first.localStore, client: first.client, filename, localStorageConfirmed: true }), failure("website_alt_journal_schema"));
  assert.deepEqual(await fs.readFile(filename), before);
  const foreign = path.join(f.root, "foreign-journal.sqlite"); db = new DatabaseSync(foreign);
  try { db.exec("CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES ('synthetic original');"); } finally { db.close(); }
  const foreignBefore = await fs.readFile(foreign);
  assert.throws(() => createWebsiteAltSync({ localStore: first.localStore, client: first.client, filename: foreign, localStorageConfirmed: true }), failure("website_alt_journal_schema"));
  assert.deepEqual(await fs.readFile(foreign), foreignBefore);
}));
