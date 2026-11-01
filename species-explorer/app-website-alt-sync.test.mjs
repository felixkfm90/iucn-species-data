import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("./public/app-website-alt-sync.js", import.meta.url), "utf8");
const PAGE = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen", BASE = "/api/website/alt-texts/shared";
const PREVIEW = "https://images.squarespace-cdn.com/content/v1/fixture/image.jpg?format=750w";
const copy = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(setImmediate); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.handlers = new Map(); this.attributes = new Map(); this.disabled = false; this.hidden = false; this.open = false; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set innerHTML(_) { throw new Error("Only DOM/textContent is allowed for shared image texts"); }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  addEventListener(key, fn) { this.handlers.set(key, [...(this.handlers.get(key) || []), fn]); }
  removeEventListener(key, fn) { this.handlers.set(key, (this.handlers.get(key) || []).filter(value => value !== fn)); }
  emit(key) { if (key === "click" && this.disabled) return Promise.resolve(false); return Promise.all((this.handlers.get(key) || []).map(fn => fn({ target: this, preventDefault() {} }))); }
}
const all = node => [node, ...node.children.flatMap(all)];
function image(text, values = {}) { return { key: "image-a", sourceUrl: PREVIEW.split("?")[0], previewSrc: PREVIEW, status: "draft", draftText: text,
  draftSavedAt: "2026-10-31T12:00:00.000Z", draftDecorative: false, caption: text, alt: text, approval: null, verification: null, history: [], ...values }; }
function seed({ state = "linked", role = "admin", approval = false } = {}) {
  const permissions = { canRead: true, canEdit: role !== "reader", canCreate: role !== "reader", canApprove: ["admin", "publisher"].includes(role) };
  const page = { url: PAGE, title: "Athen", images: [image("Eigener Text", approval ? { approval: { text: "Eigener Text", decorative: false }, status: "approved" } : {})] };
  const remote = state === "unlinked" ? null : { kind: "page", id: "website-alt-fixture", revision: "displayed-server-version", data: { type: "website-alt-page", pageRevision: "b".repeat(64), page: { ...copy(page), images: [image("Gemeinsamer Text")] } } };
  return { snapshot: { available: true, busy: false, binding: { origin: "https://project.example.org", projectId: "project-a", userId: "user-a" }, permissions },
    record: { pageUrl: PAGE, pageRevision: "a".repeat(64), localRevision: "c".repeat(64), page, linked: state !== "unlinked", remote, state, permissions },
    conflicts: state === "conflict" ? [{ id: "conflict-a", kind: "page", objectId: remote.id, currentRevision: "conflict-server-version", base: { page: { ...copy(page), images: [image("Ausgangstext")] } },
      current: { page: { ...copy(page), images: [image("Fremder Text im Konflikt")] } }, proposed: { page: copy(page) }, resolvedAt: null }] : [] };
}
function harness(options = {}) {
  const body = new Element("body"), calls = [], confirmations = [], imported = [], timers = new Map(); let timerId = 0, dialogConfig, state = seed(options), current = true, dirty = false, onConfirm = options.confirm ?? true, interceptor = options.intercept;
  const documentRef = { body, createElement: tag => new Element(tag) }, context = vm.createContext({ URL, AbortController, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  const controller = context.SpeciesExplorerWebsiteAltSync.createWebsiteAltSyncController({ documentRef,
    canEdit: options.canEdit,
    setTimeoutImpl(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeoutImpl(id) { timers.delete(id); },
    safeImageUrl(value) { try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "images.squarespace-cdn.com" && !url.username && !url.password ? url.href : ""; } catch { return ""; } },
    createDialogController(config) { dialogConfig = config; return { open() { config.dialog.open = true; return true; }, isOpen: () => config.dialog.open,
      close() { if (!config.dialog.open || config.beforeClose?.() === false) return false; config.dialog.open = false; config.afterClose?.(); return true; }, destroy() {} }; },
    async confirmAction(value) { confirmations.push(value); return typeof onConfirm === "function" ? onConfirm(value) : onConfirm; },
    async fetchJson(url, request) {
      const call = { url, method: request?.method || "GET", body: request?.body ? JSON.parse(request.body) : null, request }; calls.push(call);
      if (interceptor) { const result = await interceptor(call, state); if (result !== undefined) return result; }
      if (call.method === "GET") {
        if (url === BASE) return copy(state.snapshot);
        if (url.startsWith(`${BASE}/page?`)) return copy(state.record);
        if (url.startsWith(`${BASE}/conflicts?`)) return { conflicts: copy(state.conflicts) };
      }
      if (url === `${BASE}/link`) { state.record.linked = true; state.record.state = "linked"; state.record.remote = { kind: "page", id: "website-alt-fixture", revision: "created-server-version", data: { page: copy(state.record.page), pageRevision: state.record.pageRevision } }; return { linked: true, reviewRequired: false }; }
      if (url === `${BASE}/queue`) { state.record.state = "queued"; return { queued: true }; }
      if (url === `${BASE}/sync`) { state.record.state = "linked"; state.record.remote.data.page = copy(state.record.page); return { synced: true, publiclyVerifiedBySync: false }; }
      if (url === `${BASE}/pull`) { state.record.state = "pulled"; return { requiresExplicitImport: true }; }
      if (url === `${BASE}/import`) { state.record.page = copy(state.record.remote.data.page); state.record.pageRevision = state.record.remote.data.pageRevision; state.record.state = "linked"; return { imported: true, pageRevision: state.record.pageRevision, localRevision: "d".repeat(64) }; }
      if (url === `${BASE}/resolve`) { state.record.state = "pulled"; state.conflicts = []; return { requiresExplicitImport: true }; }
      throw new Error("Unexpected fixture API");
    }
  });
  const button = text => all(body).find(node => node.tag === "button" && node.textContent === text);
  return { body, calls, confirmations, imported, controller, timers, button,
    open: overrides => controller.openForPage({ pageUrl: PAGE, title: "Athen", isCurrent: () => current, hasUnsavedChanges: () => dirty, onImported: value => { imported.push(copy(value)); }, ...overrides }),
    async click(text) { const node = button(text); assert.ok(node, text); await node.emit("click"); await flush(); },
    setCurrent(value) { current = value; }, setDirty(value) { dirty = value; }, setConfirm(value) { onConfirm = value; }, setIntercept(value) { interceptor = value; },
    state: () => state, replace(value) { state = value; }, posts: () => calls.filter(call => call.method === "POST"),
    async adopt() { const node = all(body).find(value => value.tag === "input"); node.checked = true; await node.emit("change"); },
    async timeout() { assert.ok(timers.size); [...timers.values()][0](); await flush(); },
    nativeClose() { dialogConfig.dialog.open = false; dialogConfig.afterClose(); }
  };
}

test("construction is quiet; opening reads only local API and shows pictures with both full texts", async () => {
  const h = harness(); assert.equal(h.calls.length, 0); await h.open();
  assert.equal(h.posts().length, 0); assert.ok(h.body.textContent.includes("Eigener Text")); assert.ok(h.body.textContent.includes("Gemeinsamer Text"));
  assert.ok(h.body.textContent.includes("Squarespace bleibt ein eigener Schritt"));
  const preview = all(h.body).find(node => node.tag === "img"); assert.equal(preview.src, PREVIEW); assert.equal(preview.crossOrigin, "anonymous"); assert.equal(preview.referrerPolicy, "no-referrer");
  assert.equal(h.controller.hasUnsavedChanges(), false); assert.equal(await h.controller.dispose(), true); assert.equal(h.body.children.length, 0);
});

test("Lesemodus öffnet keinen gemeinsamen Vergleich; Moduswechsel während der Bestätigung stoppt alle Schreibschritte", async () => {
  let editing = false;
  const h = harness({ canEdit: () => editing }); assert.equal(await h.open(), false); assert.equal(h.calls.length, 0);
  editing = true; await h.open(); h.setConfirm(() => { editing = false; return true; });
  await h.click("Meine gespeicherten Änderungen senden"); assert.equal(h.posts().length, 0);
});

test("Entladen beendet die Ansicht und verhindert weitere Aufträge nach einer noch offenen Bestätigung", async () => {
  const h = harness(), held = deferred(); await h.open(); h.setConfirm(() => held.promise);
  const pending = h.button("Meine gespeicherten Änderungen senden").emit("click"); await flush();
  h.controller.stop(); held.resolve(true); await pending; await flush();
  assert.equal(h.posts().length, 0); assert.equal(h.body.children.length, 0); assert.equal(h.controller.hasUnsavedChanges(), false);
  assert.equal(await h.open(), false);
});

test("reguläres Schließen meldet den Abschluss genau einmal an die Hauptansicht", async () => {
  let closed = 0; const h = harness(); await h.open({ onClosed: () => { closed++; } });
  assert.equal(h.controller.close(), true); assert.equal(closed, 1);
  assert.equal(h.controller.close(), false); assert.equal(closed, 1);
});

test("first link requires separate confirmation and privileged explicit approval adoption", async () => {
  const h = harness({ state: "unlinked", approval: true, confirm: false }); await h.open(); await h.adopt(); await h.click("Seite gemeinsam verwenden"); assert.equal(h.posts().length, 0);
  h.setConfirm(true); await h.click("Seite gemeinsam verwenden"); assert.equal(h.posts().length, 1);
  assert.deepEqual(h.posts()[0].body, { pageUrl: PAGE, expectedPageRevision: "a".repeat(64), confirmed: true, adoptUnlinkedApprovals: true });
  assert.match(h.confirmations.at(-1).message, /ausdrücklich mit deinem Freigaberecht/); assert.equal(h.imported.length, 0);
});

test("contributor cannot choose approval adoption; reader cannot mutate or request writer conflicts", async () => {
  const contributor = harness({ state: "unlinked", role: "contributor", approval: true }); await contributor.open();
  const checkbox = all(contributor.body).find(node => node.tag === "input"); assert.equal(checkbox.parent.hidden, true);
  await contributor.click("Seite gemeinsam verwenden"); assert.equal(contributor.posts()[0].body.adoptUnlinkedApprovals, false);
  const reader = harness({ role: "reader" }); await reader.open(); assert.equal(reader.calls.some(call => call.url.includes("/conflicts?")), false);
  await reader.click("Meine gespeicherten Änderungen senden"); assert.equal(reader.posts().length, 0);
});

test("unsaved inputs or an obsolete main page stop every modifying route before confirmation", async () => {
  for (const [state, label] of [["unlinked", "Seite gemeinsam verwenden"], ["linked", "Meine gespeicherten Änderungen senden"], ["linked", "Gemeinsamen Stand laden"], ["pulled", "Geladene Fassung auf diesem PC übernehmen"], ["conflict", "Gemeinsame Fassung wählen"], ["conflict", "Meine Fassung wählen"]]) {
    const h = harness({ state }); await h.open(); h.setDirty(true); await h.click(label); assert.equal(h.posts().length, 0, label); assert.equal(h.confirmations.length, 0, label);
    h.setDirty(false); h.setCurrent(false); await h.click(label); assert.equal(h.posts().length, 0, label);
  }
});

test("main-page edits and local/server/person/permission drift during confirmation stop the chosen action", async () => {
  for (const drift of ["main", "local", "remote", "person", "role"]) {
    const h = harness(); await h.open();
    h.setConfirm(() => { if (drift === "main") h.setDirty(true); if (drift === "local") h.state().record.pageRevision = "f".repeat(64);
      if (drift === "remote") h.state().record.remote.revision = "a-new-version"; if (drift === "person") h.state().snapshot.binding.userId = "another-user";
      if (drift === "role") { h.state().snapshot.permissions.canEdit = false; h.state().record.permissions.canEdit = false; } return true; });
    await h.click("Meine gespeicherten Änderungen senden"); assert.equal(h.posts().length, 0, drift);
  }
});

test("one explicit send first persists the shown revision then syncs only this page; double click cannot duplicate it", async () => {
  const h = harness(); await h.open(); const decision = deferred(); h.setConfirm(() => decision.promise);
  const click = h.button("Meine gespeicherten Änderungen senden").emit("click"); await flush();
  await h.button("Meine gespeicherten Änderungen senden").emit("click"); decision.resolve(true); await click; await flush();
  assert.deepEqual(h.posts().map(call => call.url), [`${BASE}/queue`, `${BASE}/sync`]);
  assert.ok(h.posts().every(call => call.body.pageUrl === PAGE && call.body.expectedPageRevision === "a".repeat(64)));
  assert.equal(h.imported.length, 0); assert.match(h.controller.getState().message, /Squarespace wurde nicht verändert/);
});

test("a main-form change after durable queueing stops before network sync and leaves the queued draft", async () => {
  const h = harness(); await h.open(); h.setIntercept((call, state) => { if (call.url.endsWith("/queue")) { state.record.state = "queued"; h.setDirty(true); return { queued: true }; } });
  await h.click("Meine gespeicherten Änderungen senden"); assert.deepEqual(h.posts().map(call => call.url), [`${BASE}/queue`]); assert.equal(h.state().record.state, "queued");
});

test("public proof and local reload callbacks are not invented by pull/resolve/sync; only acknowledged import invokes onImported", async () => {
  const h = harness(); await h.open(); await h.click("Gemeinsamen Stand laden"); assert.equal(h.imported.length, 0);
  await h.click("Geladene Fassung auf diesem PC übernehmen"); assert.equal(h.imported.length, 1); assert.equal(h.imported[0].pageUrl, PAGE);
  assert.equal(h.posts().some(call => /squarespace|publish|approve/.test(call.url)), false);
});

test("conflicts show both texts and the original; current/local choices bind exact conflict and current server version", async () => {
  for (const strategy of ["current", "local"]) {
    const h = harness({ state: "conflict" }); await h.open();
    for (const text of ["Eigener Text", "Fremder Text im Konflikt", "Ausgangstext"]) assert.ok(h.body.textContent.includes(text), text);
    await h.click(strategy === "current" ? "Gemeinsame Fassung wählen" : "Meine Fassung wählen");
    assert.deepEqual(h.posts()[0].body, { pageUrl: PAGE, expectedPageRevision: "a".repeat(64), confirmed: true, adoptUnlinkedApprovals: false,
      strategy, expectedRemoteRevision: "conflict-server-version", conflictId: "conflict-a" }); assert.equal(h.imported.length, 0);
  }
});

test("timeouts never replay a mutation or call onImported from a late answer; status must be read again", async () => {
  const h = harness({ state: "pulled" }); await h.open(); const pending = deferred(); h.setIntercept(call => call.url.endsWith("/import") ? pending.promise : undefined);
  const importing = h.button("Geladene Fassung auf diesem PC übernehmen").emit("click"); await flush(); await h.timeout(); await importing;
  assert.equal(h.controller.getState().uncertain, true); assert.equal(h.posts().length, 1); assert.equal(h.imported.length, 0);
  pending.resolve({ imported: true, pageRevision: "e".repeat(64) }); await flush(); assert.equal(h.imported.length, 0);
  await h.click("Geladene Fassung auf diesem PC übernehmen"); assert.equal(h.posts().length, 1);
  h.setIntercept(null); await h.click("Stand neu lesen"); assert.equal(h.controller.getState().uncertain, false); assert.equal(h.posts().length, 1);
});

test("false import acknowledgements and arbitrary error text never claim completion or leak to the dialog", async () => {
  const h = harness({ state: "pulled" }); await h.open(); h.setIntercept(call => call.url.endsWith("/import") ? { imported: false } : undefined);
  await h.click("Geladene Fassung auf diesem PC übernehmen"); assert.equal(h.imported.length, 0); assert.equal(h.controller.getState().uncertain, true);
  h.setIntercept(null); await h.click("Stand neu lesen"); h.setIntercept(call => { if (call.url.endsWith("/import")) throw new Error("NEVER EXPOSE SYNTHETIC TOKEN"); });
  await h.click("Geladene Fassung auf diesem PC übernehmen"); assert.ok(!h.body.textContent.includes("NEVER EXPOSE")); assert.equal(h.imported.length, 0);
});

test("new unsaved main inputs during successful import are kept instead of triggering a destructive main reload", async () => {
  const h = harness({ state: "pulled" }); await h.open(); h.setIntercept(call => { if (call.url.endsWith("/import")) { h.setDirty(true); return { imported: true, pageRevision: "f".repeat(64) }; } });
  await h.click("Geladene Fassung auf diesem PC übernehmen"); assert.equal(h.imported.length, 0); assert.match(h.controller.getState().message, /Eingaben bleiben offen/);
});

test("busy dialog close/dispose are refused; after completion dispose reports success and removes its own DOM", async () => {
  const h = harness(), held = deferred(); await h.open(); h.setConfirm(() => held.promise);
  const action = h.button("Meine gespeicherten Änderungen senden").emit("click"); await flush();
  assert.equal(h.controller.close(), false); assert.equal(await h.controller.dispose(), false); assert.equal(h.controller.getState().open, true);
  held.resolve(false); await action; await flush(); assert.equal(await h.controller.dispose(), true); assert.equal(h.body.children.length, 0);
  assert.equal(await h.open(), false);
});

test("unavailable desktop service remains a compact hint and does not read pages or mutate", async () => {
  const h = harness(); h.state().snapshot.available = false; await h.open(); assert.equal(h.calls.length, 1);
  assert.match(h.body.textContent, /Desktop-App einrichten/); assert.equal(h.posts().length, 0);
});

test("hostile text is DOM text; unsafe image urls and foreign-page conflicts are never accepted", async () => {
  const h = harness(); h.state().record.page.images[0].draftText = "<script>foreign</script> &amp;"; h.state().record.page.images[0].previewSrc = "javascript:alert(1)"; await h.open();
  assert.ok(h.body.textContent.includes("<script>foreign</script> &amp;")); assert.equal(all(h.body).some(node => node.tag === "script"), false); assert.equal(all(h.body).some(node => node.tag === "img"), false);
  const foreign = harness({ state: "conflict" }); foreign.state().conflicts[0].objectId = "another-page"; await foreign.open(); assert.equal(foreign.controller.getState().uncertain, true); assert.equal(foreign.posts().length, 0);
});

test("a denied request immediately hides previously shown shared drafts and does not retain actionable permissions", async () => {
  const h = harness(); await h.open(); h.setIntercept(call => { if (call.method === "POST") { const error = new Error("arbitrary"); error.code = "forbidden"; throw error; } });
  await h.click("Meine gespeicherten Änderungen senden"); assert.ok(!h.body.textContent.includes("Gemeinsamer Text")); assert.equal(h.controller.getState().pageRevision, null);
  assert.equal(h.controller.getState().uncertain, true); assert.equal(h.imported.length, 0);
});

test("a simulated native close during a live action reopens safely and does not strand the busy state", async () => {
  const h = harness(); await h.open(); const held = deferred(); h.setConfirm(() => held.promise);
  const action = h.button("Meine gespeicherten Änderungen senden").emit("click"); await flush(); h.nativeClose();
  assert.equal(h.controller.getState().open, true); assert.equal(h.controller.getState().busy, true);
  held.resolve(false); await action; assert.equal(h.controller.getState().busy, false); assert.equal(h.posts().length, 0);
  assert.equal(await h.controller.dispose(), true);
});

test("an already running backend action is shown honestly and cannot be overtaken by a second change", async () => {
  const h = harness(); h.state().snapshot.busy = true; await h.open(); assert.equal(h.calls.length, 1);
  assert.equal(h.controller.getState().uncertain, true); assert.match(h.controller.getState().message, /läuft noch/);
  await h.click("Meine gespeicherten Änderungen senden"); assert.equal(h.posts().length, 0);
  h.state().snapshot.busy = false; await h.click("Stand neu lesen"); assert.equal(h.controller.getState().uncertain, false);
});

test("the known FN header logo displays the ampersand correctly while preserving all raw text bindings", async () => {
  const h = harness(), img = h.state().record.page.images[0];
  Object.assign(img, { context: "header", kind: "image", draftText: "FN Wildlife &amp; Travel", caption: "", sourceUrl: "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg" });
  await h.open(); assert.ok(h.body.textContent.includes("FN Wildlife & Travel")); assert.ok(!h.body.textContent.includes("FN Wildlife &amp; Travel"));
  assert.equal(h.state().record.page.images[0].draftText, "FN Wildlife &amp; Travel"); assert.equal(h.posts().length, 0);
});
