import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await fs.readFile(new URL("./public/app-shared-import.js", import.meta.url), "utf8");
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let index = 0; index < 8; index++) await new Promise((resolve) => setImmediate(resolve)); };
const project = () => ({ status: { baseUrl: "https://fixture.example.invalid", projectId: "fixture-project", connection: "online",
  user: { id: "fixture-admin", role: "admin", version: 1 }, readOnlySession: false }, permissions: { canManageUsers: true } });
const plan = (owner, count = 1) => ({ baseUrl: owner.status.baseUrl, projectId: owner.status.projectId, planId: `plan-${count}`,
  state: "planned", canApply: true, releaseForReaders: false, counts: { willCreate: count, skippedExisting: 0, created: 0, approved: 0 },
  items: [{ commonName: "Erhaltener Fixture-Eingang", state: "planned" }], source: { kind: "working-records" } });

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.handlers = new Map(); this._text = ""; this.checked = false; this.disabled = false; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set innerHTML(_value) { throw new Error("Importstatus muss DOM-Text verwenden."); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
  setAttribute() {}
  addEventListener(name, callback) { const handlers = this.handlers.get(name) || []; handlers.push(callback); this.handlers.set(name, handlers); }
  async emit(name) { for (const handler of this.handlers.get(name) || []) await handler({ target: this, preventDefault() {} }); }
}
const all = (root) => root.children.flatMap((child) => [child, ...all(child)]);

async function panel({ editing = true, withPlan = true, confirm = async () => true, defaultMode = false } = {}) {
  const root = new Element("div"), calls = [], timers = new Map(), scope = { console };
  let mode = editing, owner = project(), state = { available: true, busy: false, source: { kind: "working-records" }, plan: null };
  if (withPlan) state.plan = plan(owner);
  let read = null, prepare = null, dirty = false, refreshed = 0, nextTimer = 0;
  Object.assign(scope, { setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: (id) => timers.delete(id) });
  vm.runInNewContext(source, scope);
  const controller = scope.SpeciesExplorerSharedImport.createInitialProjectImportController({ root,
    documentRef: { createElement: (tag) => new Element(tag) }, confirmAction: confirm,
    hasUnsavedChanges: () => dirty, refreshProject: async () => { refreshed++; },
    ...(defaultMode ? {} : { canEdit: () => mode }),
    fetchJson: async (url, options) => {
      const method = options?.method || "GET", body = options?.body ? JSON.parse(options.body) : undefined;
      calls.push({ url, method, body });
      if (url === "/api/shared-project") return structuredClone(owner);
      if (url === "/api/shared-project/import") return read ? read() : structuredClone(state);
      if (url.endsWith("/prepare")) return prepare ? prepare() : structuredClone(state.plan || plan(owner));
      if (url.endsWith("/start") || url.endsWith("/media")) return {};
      throw new Error(`Unerwarteter Weg: ${url}`);
    },
  });
  await controller.refresh();
  return { root, controller, calls, timers,
    button: (name) => all(root).find((node) => node.tagName === "BUTTON" && node.textContent === name),
    posts: () => calls.filter((call) => call.method === "POST"),
    mode(value) { mode = value; controller.editingModeChanged?.(); },
    setDirty(value) { dirty = value; },
    setState(value) { state = value; }, getState: () => structuredClone(state),
    setProject(value) { owner = structuredClone(value); controller.setProjectState(owner); },
    delayRead(callback) { read = callback; }, delayPrepare(callback) { prepare = callback; },
    get refreshed() { return refreshed; },
    async click(name) { await this.button(name).emit("click"); await settle(); },
    close() { controller.destroy(); assert.equal(timers.size, 0); },
  };
}

test("Lesemodus lässt Status und erhaltene Pläne lesen, sperrt Prepare/Start auch bei alten Buttonereignissen", async () => {
  const h = await panel({ editing: false });
  try {
    const before = h.getState();
    assert.match(h.root.textContent, /Erhaltener Fixture-Eingang/);
    assert.equal(h.button("Übernahme zuerst prüfen").disabled, true);
    assert.equal(h.button("Geprüfte Übernahme starten").disabled, true);
    await h.click("Übernahme zuerst prüfen"); await h.click("Geprüfte Übernahme starten");
    assert.equal(h.posts().length, 0); assert.deepEqual(h.getState(), before);
    assert.equal(h.calls.filter((call) => call.method === "GET").length, 2);
  } finally { h.close(); }
});

test("eine neuere Katalogquelle zeigt ihren Stand an und ersetzt den alten Plan erst nach Zustimmung", async () => {
  const confirmations = [], h = await panel({ confirm: async (value) => { confirmations.push(value); return true; } });
  try {
    const state = h.getState();
    state.plan.canReplace = true;
    state.plan.source.editorial = { kind: "bundled-catalog", generatedAt: "2026-10-31T08:16:40.720Z", speciesCount: 63 };
    h.setState(state); await h.controller.refresh();
    assert.match(h.root.textContent, /Mitgelieferte Website-Texte · 31\.10\.2026 · 63 Arten/);
    const next = plan(project(), 65);
    next.source.editorial = { kind: "public-release", generatedAt: "2026-11-12T18:51:24.919Z", speciesCount: 65 };
    h.delayPrepare(async () => {
      if (h.posts().length === 1) throw Object.assign(new Error("source changed"), { code: "bound_source_changed" });
      return next;
    });
    await h.click("Übernahme zuerst prüfen");
    assert.equal(confirmations.length, 1);
    assert.equal(h.posts()[1].body.replaceUnstartedPlanId, state.plan.planId);
    assert.match(h.root.textContent, /Geprüfte öffentliche Website-Texte · 12\.11\.2026 · 65 Arten/);
  } finally { h.close(); }
});

test("derselbe Dienst mit einer anderen Administration kann den persönlichen Plan weder starten noch erneuern", async () => {
  const h = await panel();
  try {
    const original = project(), other = project(); other.status.user.id = "second-admin";
    h.setState({ ...h.getState(), plan: { ...plan(original), preparedByUserId: original.status.user.id, canReplace: true } });
    h.setProject(other); await h.controller.refresh();
    assert.match(h.root.textContent, /mit diesem Projektkonto erneut anmelden/);
    assert.doesNotMatch(h.root.textContent, /Erhaltener Fixture-Eingang/);
    assert.equal(h.button("Übernahme zuerst prüfen").disabled, true);
    assert.equal(h.button("Geprüfte Übernahme starten").disabled, true);
    await h.click("Übernahme zuerst prüfen"); await h.click("Geprüfte Übernahme starten");
    assert.equal(h.posts().length, 0);
    h.setProject(original); await h.controller.refresh();
    assert.equal(h.button("Geprüfte Übernahme starten").disabled, false);
  } finally { h.close(); }
});

test("Artdateien erhalten eine eigene bestätigte Auswahl und sind im Lesemodus gesperrt", async () => {
  const prompts = [], h = await panel({ confirm: async prompt => { prompts.push(prompt); return true; } });
  try {
    const owner = project(), button = "Artdateien für das Projekt bereitstellen";
    assert.equal(h.button(button).hidden, true);
    h.setState({ ...h.getState(), plan: { ...plan(owner), state: "complete", preparedByUserId: owner.status.user.id,
      media: { species: 1, files: 2, bytes: 1500000, run: null } } });
    await h.controller.refresh();
    assert.equal(h.button(button).hidden, false); assert.match(h.root.textContent, /2 Originaldateien.*1,5 MB/);
    h.mode(false); await h.click(button); assert.equal(h.posts().length, 0);
    h.mode(true); await h.click(button);
    assert.match(prompts[0].message, /2 Originaldateien.*1,5 MB/);
    assert.deepEqual(h.posts(), [{ url: "/api/shared-project/import/media", method: "POST", body: { planId: "plan-1", confirmed: true } }]);
  } finally { h.close(); }
});

test("Aus→Ein entwertet ausstehende Startbestätigung bei unveränderter Planreferenz", async () => {
  const gate = deferred(), h = await panel({ confirm: () => gate.promise });
  try {
    await h.click("Geprüfte Übernahme starten");
    h.mode(false); h.mode(true); gate.resolve(true); await settle();
    assert.equal(h.posts().length, 0);
    assert.match(h.root.textContent, /Erhaltener Fixture-Eingang/);
    assert.equal(h.button("Geprüfte Übernahme starten").disabled, false, "Ein neuer eigener Klick darf wieder frisch bestätigen");
  } finally { gate.resolve(false); h.close(); }
});

test("Aus→Ein entwertet ausstehende Erneuerungsbestätigung und erhält den bisherigen Plan", async () => {
  const gate = deferred(), h = await panel({ confirm: () => gate.promise });
  try {
    const prior = { ...plan(project()), source: { kind: "public-catalog" }, canReplace: true, canApply: false };
    h.setState({ available: true, busy: false, source: { kind: "working-records" }, plan: prior }); await h.controller.refresh();
    await h.click("Übernahme zuerst prüfen"); h.mode(false); h.mode(true); gate.resolve(true); await settle();
    assert.equal(h.posts().length, 0); assert.deepEqual(h.getState().plan, prior);
    assert.match(h.root.textContent, /öffentlicher Anfangsbestand/);
  } finally { gate.resolve(false); h.close(); }
});

test("späte vorbereitete Freigabe nach Moduszyklus ersetzt weder Plan noch sichtbare Grundlage", async () => {
  const gate = deferred(), h = await panel();
  try {
    h.delayPrepare(() => gate.promise); await h.click("Übernahme zuerst prüfen");
    assert.equal(h.posts().length, 1);
    h.mode(false); h.mode(true); gate.resolve(plan(project(), 99)); await settle();
    assert.doesNotMatch(h.root.textContent, /99 Art/);
    assert.match(h.root.textContent, /Erhaltener Fixture-Eingang/);
    assert.equal(h.posts().filter((call) => call.url.endsWith("/start")).length, 0);
  } finally { gate.resolve(null); h.close(); }
});

test("späte lesende Statusantwort kann im Lesemodus keine Schreibcontrols reaktivieren", async () => {
  const gate = deferred(), h = await panel();
  try {
    h.delayRead(() => gate.promise); const pending = h.controller.refresh(); await settle();
    h.mode(false); gate.resolve({ available: true, busy: false, source: { kind: "working-records" }, plan: plan(project(), 99) }); await pending;
    assert.equal(h.button("Übernahme zuerst prüfen").disabled, true);
    assert.equal(h.button("Geprüfte Übernahme starten").disabled, true);
    assert.doesNotMatch(h.root.textContent, /99 Art/);
    assert.equal(h.posts().length, 0);
  } finally { gate.resolve({ available: false }); h.close(); }
});

test("späte Statusantwort nach Aus→Ein darf keinen früheren Plan zurückbringen", async () => {
  const gate = deferred(), h = await panel();
  try {
    h.delayRead(() => gate.promise); const pending = h.controller.refresh(); await settle();
    h.mode(false); h.mode(true);
    gate.resolve({ available: true, busy: false, source: { kind: "working-records" }, plan: plan(project(), 99) }); await pending;
    assert.doesNotMatch(h.root.textContent, /99 Art/);
    assert.match(h.root.textContent, /Erhaltener Fixture-Eingang/);
    assert.equal(h.posts().length, 0);
  } finally { gate.resolve({ available: false }); h.close(); }
});

test("gleichbleibender Modus startet keine Anmeldung/Statusabfrage und entwertet keine gültige Bestätigung", async () => {
  const gate = deferred(), h = await panel({ confirm: () => gate.promise });
  try {
    await h.click("Geprüfte Übernahme starten"); const before = h.calls.length;
    h.mode(true); h.mode(true);
    assert.equal(h.calls.length, before); gate.resolve(true); await settle();
    assert.equal(h.posts().length, 1); assert.equal(h.posts()[0].url, "/api/shared-project/import/start");
    assert.equal(h.posts()[0].body.planId, "plan-1");
  } finally { gate.resolve(false); h.close(); }
});

test("aktuelle Rechte/Person/Projekt und ungespeicherte Eingaben sperren vor dem Start", async () => {
  for (const change of [
    (h) => { const value = project(); value.status.user.id = "other-admin"; h.setProject(value); },
    (h) => { const value = project(); value.status.baseUrl = "https://other.example.invalid"; h.setProject(value); },
    (h) => { const value = project(); value.status.connection = "offline"; h.setProject(value); },
    (h) => { const value = project(); value.permissions.canManageUsers = false; h.setProject(value); },
    (h) => h.setDirty(true),
  ]) {
    const gate = deferred(), h = await panel({ confirm: () => gate.promise });
    try {
      await h.click("Geprüfte Übernahme starten"); change(h); gate.resolve(true); await settle();
      assert.equal(h.posts().length, 0);
    } finally { gate.resolve(false); h.close(); }
  }
});

test("fremde vorbereitete Pläne und nicht ersetzbare Altquellen erhalten keine Startfreigabe", async () => {
  const h = await panel();
  try {
    h.delayPrepare(async () => ({ ...plan(project(), 99), baseUrl: "https://other.example.invalid" }));
    await h.click("Übernahme zuerst prüfen");
    assert.doesNotMatch(h.root.textContent, /99 Art/);
    const old = { ...plan(project()), source: { kind: "public-catalog" }, canReplace: false };
    h.setState({ available: true, busy: false, source: { kind: "working-records" }, plan: old }); await h.controller.refresh();
    const count = h.posts().length; await h.click("Übernahme zuerst prüfen"); await h.click("Geprüfte Übernahme starten");
    assert.equal(h.posts().length, count); assert.deepEqual(h.getState().plan, old);
  } finally { h.close(); }
});

test("bestehende Aufrufer ohne Modusprovider behalten die bisherige ausdrückliche Vorbereitung", async () => {
  const h = await panel({ defaultMode: true });
  try { await h.click("Übernahme zuerst prüfen"); assert.equal(h.posts().length, 1); }
  finally { h.close(); }
});
