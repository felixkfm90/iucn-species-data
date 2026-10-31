import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fixture, page, species } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createExplorerSharedProjectService } from "./explorer-service.mjs";

const denied = (code) => (error) => error.code === code;
async function scoped(fn) {
  const f = fixture(); let adapter; const services = [];
  try {
    const initialized = await f.initialized(), { store, a } = initialized;
    const original = store.createObject(a.token, { kind: "species", id: "fixture-owl", data: species() });
    adapter = createSharedProjectHttp({ store }); const address = await adapter.listen();
    function service(options = {}) {
      const value = createExplorerSharedProjectService({ filename: path.join(f.root, `explorer-${services.length}.sqlite`), localStorageConfirmed: true,
        allowLoopbackHttp: true, ...options }); services.push(value); return value;
    }
    const connect = (value, username = a.user.username) => value.connect({ baseUrl: address.url, username, password: f.password });
    await fn({ f, ...initialized, original, address, service, connect });
  } finally { for (const value of services) await value.close(); if (adapter) await adapter.close(); f.cleanup(); }
}

test("Explorer facade has no automatic network/import and returns credential-free cache snapshots", () => scoped(async ({ f, service, connect }) => {
  let calls = 0; const tokens = [];
  const value = service({ fetchImpl: async (url, options) => { calls++; if (options.headers.Authorization) tokens.push(options.headers.Authorization.slice(7)); return fetch(url, options); } });
  const empty = await value.snapshot(); assert.equal(calls, 0); assert.equal(empty.objects.length, 0);
  await value.list(); await value.users(); await value.devices(); assert.equal(calls, 0);
  const connected = await connect(value), after = calls;
  const cached = await value.snapshot(); await value.list(); await value.get("species", "fixture-owl"); await value.conflicts();
  assert.deepEqual(await value.backupProjectIds(), [connected.status.projectId]);
  assert.equal(calls, after); assert.equal(connected.permissions.canCreate, true);
  const serialized = JSON.stringify(cached); assert.ok(!serialized.includes(f.password)); for (const token of tokens) assert.ok(!serialized.includes(token));
  assert.equal(cached.externalPublication, "not-performed");
}));

test("local edit comparison protects a second form; sync and internal approval are separate explicit actions", () => scoped(async ({ service, connect, store, a }) => {
  const value = service(); await connect(value);
  const first = await value.get("species", "fixture-owl"), changed = structuredClone(first.data); changed.commonName = "First local name";
  const saved = await value.editExisting(first.kind, first.id, { expectedEditRevision: first.editRevision, data: changed });
  assert.equal(saved.localPending, true); assert.notEqual(saved.editRevision, first.editRevision);
  await assert.rejects(value.editExisting(first.kind, first.id, { expectedEditRevision: first.editRevision, data: species() }), denied("local_object_changed"));
  await assert.rejects(value.approve(first.kind, first.id, { expectedRevision: first.revision }), denied("pending_review"));
  assert.equal(store.getObject(a.token, first.kind, first.id).data.commonName, "Testkauz");
  await value.sync(); const current = await value.get(first.kind, first.id);
  const approved = await value.approve(first.kind, first.id, { expectedRevision: current.revision });
  assert.equal(approved.approval, "approved"); assert.equal(approved.externalPublication, "not-performed");
  assert.equal(store.catalog(a.token).species[0].commonName, "First local name");
  const displayed = await value.get(first.kind, first.id);
  const localAgain = await value.editExisting(first.kind, first.id, { expectedEditRevision: displayed.editRevision, data: { ...displayed.data, commonName: "Unsent next draft" } });
  assert.equal(localAgain.approval, "local-draft"); assert.equal(localAgain.serverApproval, "approved");
  assert.equal(store.catalog(a.token).species[0].commonName, "First local name");
}));

test("offline edits remain available; new objects and approval remain online actions", () => scoped(async ({ service, connect, store, a }) => {
  let offline = false, calls = 0;
  const value = service({ fetchImpl: async (...args) => { calls++; if (offline) throw new Error("synthetic offline"); return fetch(...args); } });
  await connect(value); offline = true; await assert.rejects(value.refresh(), denied("offline"));
  const before = calls, current = await value.get("species", "fixture-owl");
  await value.editExisting(current.kind, current.id, { expectedEditRevision: current.editRevision, data: { ...current.data, commonName: "Offline edit" } });
  assert.equal(calls, before);
  const status = await value.snapshot(); assert.equal(status.permissions.canEdit, true); assert.equal(status.permissions.canCreate, false); assert.equal(status.permissions.canApprove, false);
  await assert.rejects(value.create({ kind: "page", id: "new-page", data: page() }), denied("offline"));
  assert.throws(() => store.getObject(a.token, "page", "new-page"));
  offline = false; await value.sync(); assert.equal(store.getObject(a.token, "species", "fixture-owl").data.commonName, "Offline edit");
}));

test("visible conflict versions prevent resolution after a later unseen server edit", () => scoped(async ({ service, connect, store, b, original }) => {
  const value = service(); await connect(value); const current = await value.get(original.kind, original.id);
  await value.editExisting(current.kind, current.id, { expectedEditRevision: current.editRevision, data: species(original.id, "Local proposal") });
  const second = store.submitChange(b.token, { changeId: "explorer-foreign-one", kind: original.kind, id: original.id, baseRevision: original.revision, data: species(original.id, "Server second") }).object;
  await value.sync(); const conflict = (await value.conflicts())[0]; assert.equal(conflict.latestServer.revision, second.revision);
  store.submitChange(b.token, { changeId: "explorer-foreign-two", kind: original.kind, id: original.id, baseRevision: second.revision, data: species(original.id, "Server third") });
  await assert.rejects(value.resolve(conflict.id, { strategy: "merged", data: species(original.id, "Merge"), expectedRevision: conflict.latestServer.revision }), denied("object_changed"));
  await value.refresh(); const refreshed = (await value.conflicts())[0]; assert.equal(refreshed.changedSinceConflict, true);
  const resolved = await value.resolve(conflict.id, { strategy: "merged", data: species(original.id, "Reviewed all versions"), expectedRevision: refreshed.latestServer.revision });
  assert.equal(resolved.data.sections[0].text, "Reviewed all versions");
  assert.equal((await value.snapshot()).status.conflicts, 0);
}));

test("online creation is a draft and the four roles/user/device management stay server-enforced", () => scoped(async ({ f, service, connect, store, a, b }) => {
  const value = service(); await connect(value); await value.refresh({ users: true, devices: true });
  assert.equal((await value.users()).length, 2); assert.ok((await value.devices()).length >= 1);
  const created = await value.create({ kind: "page", id: "online-draft", data: { title: "New page", sections: [{ id: "intro", title: "Einleitung", text: "Draft text", intentionallyEmpty: false }] } });
  assert.equal(created.approval, "draft"); assert.equal(created.approvedRevision, null);
  for (const role of ["publisher", "contributor", "reader"]) await value.createUser({ username: `explorer-${role}`, displayName: role, password: f.password, role });
  assert.equal((await value.users()).length, 5);
  const contributor = service(); await connect(contributor, "explorer-contributor");
  assert.equal((await contributor.snapshot()).permissions.canEdit, true); assert.equal((await contributor.snapshot()).permissions.canApprove, false);
  await assert.rejects(contributor.createUser({ username: "forged-admin", displayName: "Forged", password: f.password, role: "admin" }), denied("forbidden"));
  const reader = service(); await connect(reader, "explorer-reader"); assert.equal((await reader.snapshot()).objects.length, 0);
  await assert.rejects(reader.create({ kind: "page", id: "reader-created", data: page() }), denied("forbidden"));
  const publisher = service(); await connect(publisher, "explorer-publisher");
  const pubObject = await publisher.get("page", created.id); await publisher.approve(pubObject.kind, pubObject.id, { expectedRevision: pubObject.revision });
  await reader.refresh(); assert.equal((await reader.list()).length, 1);
  await value.updateUser(b.user.id, { expectedVersion: 1, role: "reader" });
  await assert.rejects(value.updateUser(a.user.id, { expectedVersion: 1, blocked: true }), denied("last_admin"));
  const serialized = JSON.stringify(await value.snapshot()); assert.ok(!serialized.includes(f.password));
  assert.equal(store.listUsers(a.token).filter((entry) => entry.role === "admin" && !entry.blocked).length, 1);
}));

test("password change and device revocation clear credentials without revealing them", () => scoped(async ({ f, service, connect }) => {
  const value = service(); await connect(value); await value.refresh({ devices: true }); const devices = await value.devices();
  await assert.rejects(value.changePassword({ currentPassword: "wrong synthetic value", newPassword: `${f.password}-changed` }), denied("password_not_changed"));
  const changed = await value.changePassword({ currentPassword: f.password, newPassword: `${f.password}-changed` });
  assert.deepEqual(changed, { changed: true, loginRequired: true }); assert.equal((await value.snapshot()).permissions.canRead, false);
  const fresh = await value.connect({ baseUrl: (await value.snapshot()).status.baseUrl, username: "fixture-admin-a", password: `${f.password}-changed` });
  assert.equal(fresh.permissions.canRead, true); await value.refresh({ devices: true });
  const current = (await value.devices()).find((entry) => !entry.revoked && !devices.some((old) => old.id === entry.id));
  await value.revokeDevice(current.id); assert.equal((await value.snapshot()).permissions.canRead, false);
}));

test("a rejected secure credential write must not leave a silently usable RAM login", () => scoped(async ({ service, connect }) => {
  const value = service({ credentialStore: { async get() { return null; }, async set() { throw new Error("synthetic OS encryption failure"); }, async delete() {} } });
  await assert.rejects(connect(value), denied("credential_store_unavailable"));
  await assert.rejects(value.sync(), denied("authentication_required"));
  assert.equal((await value.snapshot()).permissions.canRead, false);
}));

test("snapshot immediately reports live activity/queued work; close aborts and never recreates cache files", () => scoped(async ({ f, service, connect }) => {
  let blocked = false, notify;
  const entered = new Promise((resolve) => { notify = resolve; });
  const value = service({ fetchImpl: async (url, options) => {
    if (!blocked) return fetch(url, options);
    notify(); return new Promise((resolve, reject) => { options.signal.addEventListener("abort", () => reject(new Error("synthetic abort")), { once: true }); });
  } });
  const first = await value.snapshot(); assert.equal(first.busy, false); assert.equal(first.queuedChanges, 0); assert.equal(first.conflictCount, 0);
  await connect(value); const original = await value.get("species", "fixture-owl");
  await value.editExisting(original.kind, original.id, { expectedEditRevision: original.editRevision, data: species(original.id, "Pending shutdown guard") });
  assert.equal((await value.snapshot()).queuedChanges, 1);
  blocked = true; const syncing = value.sync(); const rejected = assert.rejects(syncing, denied("client_closed"));
  await entered; const during = await value.snapshot(); assert.equal(during.busy, true); assert.equal(during.queuedChanges, 1);
  await value.close(); await rejected;
  const filename = path.join(f.root, "explorer-0.sqlite"); await fs.unlink(filename);
  const closed = await value.snapshot(); assert.equal(closed.busy, false); assert.equal(closed.status.connection, "closed");
  assert.equal(closed.permissions.canRead, false); await assert.rejects(fs.stat(filename), (error) => error.code === "ENOENT");
}));

// Small DOM used for full renderer behavior, without HTML parsing or a browser.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.handlers = new Map(); this.attributes = new Map(); this.value = ""; this.disabled = false;
    this._text = ""; this.classList = { add: (...names) => { this.className = `${this.className || ""} ${names.join(" ")}`.trim(); } }; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set innerHTML(_value) { throw new Error("Renderer must use DOM/textContent, never HTML strings."); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  addEventListener(key, callback) { const list = this.handlers.get(key) || []; list.push(callback); this.handlers.set(key, list); }
  querySelectorAll(selector) { const names = selector.split(",").map((part) => part.trim().toUpperCase()); return all(this).filter((node) => names.includes(node.tagName)); }
  async emit(key) { for (const fn of this.handlers.get(key) || []) await fn({ target: this, preventDefault() {} }); }
}
function all(root) { return root.children.flatMap((child) => [child, ...all(child)]); }
async function renderer(seed) {
  const root = new Element("div"), calls = [], confirmations = [];
  let stored = structuredClone(seed);
  const document = { createElement: (tag) => new Element(tag) }, context = { document, URL, Date, console, setTimeout, clearTimeout };
  context.window = context;
  vm.runInNewContext(await fs.readFile(fileURLToPath(new URL("../public/app-shared-project.js", import.meta.url)), "utf8"), context);
  const api = { snapshot: async () => structuredClone(stored), connect: async (input) => { calls.push(["connect", input]); return structuredClone(stored); },
    editExisting: async (...args) => { calls.push(["edit", ...args]); const object = stored.objects.find((item) => item.kind === args[0] && item.id === args[1]); object.data = structuredClone(args[2].data); object.localPending = true; return structuredClone(object); },
    create: async (input) => { calls.push(["create", input]); const value = { ...input, revision: "new", editRevision: "new-edit", ordinal: 1, approval: "draft" }; stored.objects.push(value); return value; },
    approve: async (...args) => { calls.push(["approve", ...args]); return {}; }, sync: async () => { calls.push(["sync"]); return structuredClone(stored); },
    refresh: async (input) => { calls.push(["refresh", input]); return structuredClone(stored); }, disconnect: async () => structuredClone(stored),
    resolve: async (...args) => { calls.push(["resolve", ...args]); return stored.objects[0]; } };
  const controller = context.SpeciesExplorerSharedProject.createSharedProjectController({ elements: { sharedProjectRoot: root }, documentImpl: document, api,
    confirmAction: async (input) => { confirmations.push(input); return true; } });
  await controller.open();
  const findButton = (text) => all(root).find((node) => node.tagName === "BUTTON" && node.textContent === text);
  const findInput = (label) => all(root).find((node) => node.tagName === "LABEL" && node._text === label)?.children[0];
  return { root, controller, api, calls, confirmations, findButton, findInput, module: context.SpeciesExplorerSharedProject, replace: (value) => { stored = structuredClone(value); } };
}
function rendererSeed({ role = "admin" } = {}) {
  return { schemaVersion: 1, status: { connection: "online", pending: 0, conflicts: 0, projectId: "fixture-project", user: { id: "fixture-user", displayName: "Fixture", role }, readOnlySession: false },
    permissions: { canRead: true, canEdit: role !== "reader", canCreate: role !== "reader", canApprove: ["admin", "publisher"].includes(role), canManageUsers: false, canManageDevices: true, canChangePassword: false },
    objects: [{ kind: "species", id: "fixture-owl", revision: "displayed-revision", editRevision: "displayed-local-hash", ordinal: 2, approval: "draft",
      data: { ...species(), commonName: "<script>foreign text</script>", media: { sounds: [], gallery: [{ id: "photo", url: "https://images.squarespace-cdn.com/content/fixture.jpg", alt: "Original alt", caption: "Original caption", order: 0 }] } } }], conflicts: [], users: [], devices: [] };
}
async function settled() { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); }

test("shared-project setup preserves edit-mode gating, dialog busy guard, importer drafts and teardown", async () => {
  const nodes = new Map(["root", "dialog", "close", "import-root", "open"].map((id) => [`#shared-project-${id}`, new Element("div")]));
  const root = nodes.get("#shared-project-root"), windowHandlers = new Map();
  const document = { createElement: (tag) => new Element(tag), querySelector: (selector) => nodes.get(selector) };
  let editing = false, dialogAllowed = true, dialogOpens = 0, reads = 0, imported = 0, destroyed = 0, importerOptions, dialogOptions, release;
  const importer = { refresh: async () => { imported++; }, destroy: () => { destroyed++; }, busy: false };
  const context = { document, URL, Date, SpeciesExplorerSharedImport: { createInitialProjectImportController(options) { importerOptions = options; return importer; } },
    addEventListener(name, callback, options) { assert.equal(options.once, true); windowHandlers.set(name, callback); } };
  context.window = context;
  vm.runInNewContext(await fs.readFile(fileURLToPath(new URL("../public/app-shared-project.js", import.meta.url)), "utf8"), context);
  const { controller, importer: wiredImporter } = context.SpeciesExplorerSharedProject.setupSharedProject({
    fetchJson: async () => { reads++; return new Promise((resolve) => { release = resolve; }); }, confirmAction: async () => true,
    canEdit: () => editing,
    createDialogController(options) { dialogOptions = options; return { open() { dialogOpens++; return dialogAllowed; } }; },
  });
  assert.equal(wiredImporter, importer); assert.equal(importerOptions.root, nodes.get("#shared-project-import-root"));
  assert.equal(dialogOptions.dialog, nodes.get("#shared-project-dialog")); assert.equal(dialogOptions.closeButtons[0], nodes.get("#shared-project-close"));
  assert.equal(reads, 0, "setup does not start a connection or read");
  await nodes.get("#shared-project-open").emit("click");
  assert.equal(dialogOpens, 0); assert.equal(reads, 0, "read mode does not open or load the project");
  editing = true; dialogAllowed = false; await nodes.get("#shared-project-open").emit("click");
  assert.equal(reads, 0, "a refused dialog open does not load the project");
  dialogAllowed = true; await nodes.get("#shared-project-open").emit("click");
  assert.equal(reads, 1); assert.equal(imported, 0); assert.equal(dialogOptions.beforeClose(), false);
  release(rendererSeed()); await settled(); assert.equal(imported, 1); assert.equal(dialogOptions.beforeClose(), undefined);
  await controller.select("species", "fixture-owl");
  const text = all(root).find((node) => node.tagName === "LABEL" && node._text === "Fachtext").children[0];
  text.value = "Unsent private form input"; await text.emit("input");
  assert.equal(importerOptions.hasUnsavedChanges(), true, "the importer still sees unsaved private inputs");
  const refresh = importerOptions.refreshProject(); assert.equal(reads, 2); release(rendererSeed()); await refresh;
  const refreshedText = all(root).find((node) => node.tagName === "LABEL" && node._text === "Fachtext").children[0];
  assert.equal(refreshedText.value, "Unsent private form input"); assert.equal(controller.hasUnsavedChanges(), true);
  windowHandlers.get("pagehide")();
  assert.equal(destroyed, 1); assert.equal(controller.getState().stopped, true);
});

test("renderer uses DOM for hostile content and public image previews without auth attributes", async () => {
  const h = await renderer(rendererSeed()); await h.controller.select("species", "fixture-owl");
  assert.equal(h.findInput("Deutscher Name").value, "<script>foreign text</script>");
  const image = all(h.root).find((node) => node.tagName === "IMG"); assert.equal(image.crossOrigin, "anonymous"); assert.equal(image.referrerPolicy, "no-referrer");
  assert.ok(!all(h.root).some((node) => node.tagName === "SCRIPT"));
  for (const url of ["javascript:alert(1)", "https://u:p@images.squarespace-cdn.com/a", "https://evil.example.org/a.jpg", "http://images.squarespace-cdn.com/a.jpg"]) assert.equal(h.module.safeImageUrl(url), "");
});

test("renderer edits structured text and image captions as a local draft with the visible comparison marker", async () => {
  const h = await renderer(rendererSeed()); await h.controller.select("species", "fixture-owl");
  const text = h.findInput("Fachtext"); text.value = "Reviewed new text"; await text.emit("input");
  const caption = h.findInput("Sichtbare Bildunterschrift"); caption.value = "Reviewed caption"; await caption.emit("input");
  const form = h.findButton("Entwurf lokal speichern").parentElement;
  await Promise.all([form.emit("submit"), form.emit("submit")]); await settled();
  const request = h.calls.find((entry) => entry[0] === "edit");
  assert.equal(request[3].expectedEditRevision, "displayed-local-hash"); assert.equal(request[3].data.sections[0].text, "Reviewed new text");
  assert.equal(request[3].data.media.gallery[0].caption, "Reviewed caption");
  assert.equal(h.calls.filter((entry) => entry[0] === "edit").length, 1);
  assert.ok(!h.calls.some((entry) => ["sync", "approve"].includes(entry[0])));
});

test("renderer keeps internal approval explicit and shows role restrictions", async () => {
  const h = await renderer(rendererSeed()); await h.controller.select("species", "fixture-owl");
  await h.findButton("Aktuelle Version intern freigeben").emit("click"); await settled();
  assert.equal(h.calls.filter((entry) => entry[0] === "approve").length, 1);
  assert.match(h.confirmations[0].message, /nicht verbunden/);
  const reader = await renderer(rendererSeed({ role: "reader" })); await reader.controller.select("species", "fixture-owl");
  assert.equal(reader.findInput("Fachtext").disabled, true); assert.equal(reader.findButton("Neue Art vorbereiten").disabled, true);
});

test("renderer clears login password before requests and never reflects an arbitrary error message", async () => {
  const h = await renderer(rendererSeed()), password = h.findInput("Passwort");
  h.findInput("Dienstadresse · HTTPS").value = "https://project.example.org"; h.findInput("Persönlicher Benutzername").value = "fixture";
  password.value = "Never echo this synthetic password";
  h.api.connect = async () => { assert.equal(password.value, ""); throw new Error("Never echo this synthetic password"); };
  await password.parentElement.parentElement.emit("submit"); await settled();
  assert.ok(!h.root.textContent.includes("Never echo this synthetic password"));
  assert.ok(!JSON.stringify(h.controller.getState()).includes("password"));
});

test("renderer rejects late snapshots after destruction and does not start network calls by construction", async () => {
  const h = await renderer(rendererSeed()); let release;
  h.api.snapshot = () => new Promise((resolve) => { release = resolve; });
  const read = h.controller.refresh(); h.controller.destroy(); release(rendererSeed()); await read;
  assert.equal(h.controller.getState().stopped, true);
  assert.equal(h.findInput("Passwort").value, "");
});

test("default local API adapter uses POST for every mutation and explicit remote refresh", async () => {
  const source = await fs.readFile(fileURLToPath(new URL("../public/app-shared-project.js", import.meta.url)), "utf8"), context = { URL };
  context.window = context; vm.runInNewContext(source, context); const calls = [];
  const api = context.SpeciesExplorerSharedProject.createSharedProjectApi(async (url, options) => { calls.push({ url, options }); return {}; });
  await api.editExisting("species", "fixture-owl", { data: {}, expectedEditRevision: "fixture" }); await api.updateUser("fixture-id", { role: "reader" });
  await api.revokeDevice("fixture-device"); await api.refresh({ users: true }); await api.approve("species", "fixture-owl", { expectedRevision: "fixture" });
  assert.ok(calls.every((entry) => entry.options.method === "POST"));
  assert.equal(calls[2].url, "/api/shared-project/devices/fixture-device/revoke");
});

test("renderer shows preserved conflict versions and sends a reviewed merged target with the displayed server revision", async () => {
  const seed = rendererSeed(), data = seed.objects[0].data;
  seed.status.conflicts = 1;
  seed.conflicts = [{ id: "fixture-conflict", kind: "species", objectId: "fixture-owl", base: species("fixture-owl", "Base version"),
    current: species("fixture-owl", "Server version"), proposed: species("fixture-owl", "Original proposal"), currentRevision: "older-server",
    latestServer: { revision: "displayed-server-version", ordinal: 3, data: species("fixture-owl", "Latest server text") }, changedSinceConflict: true,
    localVersions: [{ data: species("fixture-owl", "Original proposal") }, { data: species("fixture-owl", "Own further draft") }] }];
  const h = await renderer(seed);
  for (const value of ["Base version", "Server version", "Original proposal", "Latest server text", "Own further draft"]) assert.ok(h.root.textContent.includes(value));
  assert.equal(h.findButton("Serverfassung wählen").disabled, true);
  await h.findButton("Fassungen zusammenführen").emit("click");
  const field = h.findInput("Fachtext"); assert.equal(field.value, "Own further draft"); field.value = "Reviewed merged content"; await field.emit("input");
  await h.findButton("Zusammengeführten Zieltext bestätigen").parentElement.emit("submit"); await settled();
  const sent = h.calls.find((entry) => entry[0] === "resolve");
  assert.equal(sent[2].expectedRevision, "displayed-server-version"); assert.equal(sent[2].strategy, "merged");
  assert.equal(sent[2].data.sections[0].text, "Reviewed merged content"); assert.ok(!h.calls.some((entry) => entry[0] === "approve"));
  assert.equal(data.id, "fixture-owl");
});

test("renderer hides a dirty form after rights loss and restores it only for the same newly authorized person", async () => {
  const h = await renderer(rendererSeed()); await h.controller.select("species", "fixture-owl");
  const field = h.findInput("Fachtext"); field.value = "Own unsaved content"; await field.emit("input");
  h.replace(rendererSeed({ role: "reader" })); await h.controller.refresh();
  assert.equal(h.findInput("Fachtext"), undefined); assert.ok(!h.root.textContent.includes("Own unsaved content"));
  assert.equal(h.controller.hasUnsavedChanges(), true, "hidden retained inputs must still block application shutdown");
  h.replace(rendererSeed()); await h.controller.refresh();
  assert.equal(h.findInput("Fachtext").value, "Own unsaved content"); assert.equal(h.controller.hasUnsavedChanges(), true);
});

test("browser-only availability hint is visible and cannot submit a personal connection", async () => {
  const seed = rendererSeed(); seed.available = false; seed.message = "Gemeinsames Projekt in der Desktop-App einrichten.";
  seed.status.connection = "disconnected"; seed.status.user = null; seed.objects = [];
  seed.permissions = Object.fromEntries(Object.keys(seed.permissions).map((key) => [key, false]));
  const h = await renderer(seed);
  assert.ok(h.root.textContent.includes(seed.message)); assert.equal(h.findButton("Verbinden").disabled, true);
  await h.findButton("Verbinden").parentElement.emit("submit"); await settled(); assert.equal(h.calls.length, 0);
});
