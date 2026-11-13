import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("./public/app-species-conflicts.js", import.meta.url), "utf8");
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.handlers = new Map(); this.attributes = new Map(); this.value = ""; this.disabled = false; this.hidden = false; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((node) => node.textContent).join(""); }
  set innerHTML(_value) { throw new Error("The conflict review must render safe DOM text, never HTML strings."); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  addEventListener(key, handler) { const handlers = this.handlers.get(key) || []; handlers.push(handler); this.handlers.set(key, handlers); }
  async emit(key, { force = false } = {}) { if (this.disabled && !force) return; for (const handler of this.handlers.get(key) || []) await handler({ target: this }); }
}
const all = (root) => root.children.flatMap((child) => [child, ...all(child)]);
const visibleText = (node) => node.hidden ? "" : node._text + node.children.map(visibleText).join("");
const present = (value) => ({ present: true, value }), absent = () => ({ present: false });
const BASE = "/api/shared-project/species/conflicts/conflict-fixture";

test("an editorial conflict explains the actual review boundary and cannot send a four-field decision", async () => {
  const f = fixture(), value = review(); value.canResolve = false;
  value.resolutionBlock = { code: "editorial_adoption_review_required", message: "Seitenübernahme mit aktueller Art und Seite neu prüfen. Alle Fassungen bleiben erhalten." };
  f.setReview(value); await f.controller.open("conflict-fixture");
  assert.match(visibleText(f.root), /Seitenübernahme mit aktueller Art und Seite neu prüfen/);
  assert.doesNotMatch(visibleText(f.root), /Für die Übernahme bitte online mit Bearbeitungsrechten anmelden/);
  for (const node of all(f.root).filter(node => node.tagName === "BUTTON" && /prüfen|übernehmen/i.test(node.textContent))) {
    assert.equal(node.disabled, true); await node.emit("click", { force: true });
  }
  assert.equal(f.calls.filter(call => call.method === "POST").length, 0);
});
function project({ user = "person-a", role = "admin", connection = "online", readOnly = false, projectId = "project-a" } = {}) {
  return { status: { baseUrl: "https://project.example.org", projectId, connection, user: { id: user, role }, readOnlySession: readOnly },
    permissions: { canRead: true, canEdit: role !== "reader" } };
}
function review() {
  const values = [
    ["englishName", "Englischer Name", present("Server owl"), present("Local owl"), present("Another owl"), true],
    ["size", "Größe", present(23), present(22), present(24), true],
    ["weight", "Gewicht", present("150 g"), present("150 g"), present("150 g"), false],
    ["lifeExpectancy", "Lebenserwartung", absent(), present("12 Jahre"), absent(), true],
  ];
  return { id: "conflict-fixture", objectId: "fixture-owl", germanName: "Testkauz <script>safe text</script>", scientificName: "Strix fixture", source: "shared-project",
    sourceScope: "person-project-scope", reviewRevision: "review-revision-1", serverRevision: "server-revision", connection: "online", canResolve: true,
    localVersions: [{ changeId: "change-first", state: "conflict" }, { changeId: "change-next", state: "queued" }],
    fields: values.map(([key, label, server, first, next, requiresChoice]) => ({ key, label, requiresChoice, server, base: present("Ausgangswert"), historicalCurrent: present("Früherer Serverwert"), proposed: first,
      localVersions: [{ changeId: "change-first", state: "conflict", ...first }, { changeId: "change-next", state: "queued", ...next }] })),
    lockedFields: [{ key: "germanName", label: "Deutscher Name", readonly: true, requiresChoice: false, server: present("Aktueller Servername"), base: present("Alter Name"), historicalCurrent: present("Früherer Name"),
      proposed: present("Lokaler Name"), localVersions: [{ changeId: "change-first", state: "conflict", ...present("Lokaler Name") }] }],
    warnings: ["Die Namen bleiben an den aktuellen Serverstand gebunden."], externalPublication: "not-performed",
    privateOriginal: "PRIVATE_REGISTER_MUST_NOT_RENDER", generationPrompt: "PRIVATE_PROMPT_MUST_NOT_RENDER" };
}
function previewFor(snapshot, choices = {}) {
  return { token: "opaque-preview-token", expiresAt: "2099-01-01T00:00:00.000Z", review: structuredClone(snapshot), changes: snapshot.fields.flatMap((field) => {
    const choice = choices[field.key]; if (!choice || choice.kind === "server") return [];
    const after = choice.kind === "custom" ? present(choice.value.trim()) : field.localVersions.find((version) => version.changeId === choice.changeId);
    return [{ key: field.key, field: field.label, before: field.server, after }];
  }), warnings: [], source: "shared-project", externalPublication: "not-performed" };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settle() { for (let index = 0; index < 6; index++) await new Promise((resolve) => setImmediate(resolve)); }
function fixture(options = {}) {
  const root = new Element("div"), calls = [], confirmations = [], dirty = [], resolved = [], documentRef = { createElement: (tag) => new Element(tag) };
  const context = { document: documentRef }; vm.runInNewContext(source, context);
  let snapshot = review(), authority = project(), contextEpoch = 1;
  const controller = context.SpeciesExplorerSpeciesConflicts.createSpeciesConflictReview({ root, documentRef,
    fetchJson: async (url, request = {}) => {
      const body = request.body ? JSON.parse(request.body) : null; calls.push({ url, method: request.method || "GET", body });
      if (url.endsWith("/preview")) return options.preview ? options.preview(body, snapshot) : previewFor(snapshot, body.choices);
      if (url.endsWith("/resolve")) return options.resolve ? options.resolve(body) : { resolved: true, queued: false, serverConfirmed: true, source: "shared-project", objectId: "fixture-owl", externalPublication: "not-performed" };
      return options.get ? options.get(url, snapshot) : structuredClone(snapshot);
    },
    confirmAction: async (input) => { confirmations.push(input); return options.confirm ? options.confirm(input) : true; },
    onDirtyChange: (value) => dirty.push(value), onResolved: async (value) => { resolved.push(value); if (options.onResolved) await options.onResolved(value); },
    ...(options.useContext ? { getContext: () => ({ epoch: contextEpoch }) } : {}),
    ...(options.canEdit ? { canEdit: options.canEdit } : {}),
  });
  if (options.setAuthority !== false) controller.setProjectState(authority);
  const button = (label) => all(root).find((node) => node.tagName === "BUTTON" && node.textContent === label);
  const input = (label) => all(root).find((node) => node.attributes.get("aria-label") === label);
  return { root, controller, calls, confirmations, dirty, resolved, button, input,
    setReview(value) { snapshot = value; }, getReview: () => snapshot,
    setProject(value) { authority = value; controller.setProjectState(value); }, setContext(value) { contextEpoch = value; },
    async click(label) { await button(label).emit("click"); await settle(); },
    async choose(label, value) { const select = input(`${label} wählen`); select.value = value; await select.emit("change"); await settle(); },
    async custom(label, value, force = false) { const node = input(`Eigener Wert: ${label}`); node.value = value; await node.emit("input", { force }); await settle(); },
  };
}
async function chooseRequired(f) {
  await f.choose("Englischer Name", "local:change-first"); await f.choose("Größe", "server"); await f.choose("Lebenserwartung", "server");
}

test("species conflict review construction and project-state updates do not fetch or resolve anything", () => {
  const f = fixture(); assert.equal(f.root.hidden, true); assert.equal(f.controller.hasUnsavedChanges(), false); assert.equal(f.controller.busy, false);
  f.setProject(project()); assert.deepEqual(f.calls, []); assert.deepEqual(f.confirmations, []);
});

test("the review renders curated names and every retained version as safe text and requires deliberate differing choices", async () => {
  const f = fixture(); await f.controller.open("conflict-fixture");
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, BASE); assert.equal(f.calls[0].method, "GET");
  assert.match(f.root.textContent, /Testkauz <script>safe text<\/script>/); assert.match(f.root.textContent, /Strix fixture/);
  assert.match(f.root.textContent, /Another owl/); assert.match(f.root.textContent, /Ausgangswert/); assert.match(f.root.textContent, /Früherer Serverwert/);
  assert.match(f.root.textContent, /Aktueller Servername/); assert.match(f.root.textContent, /Namensänderungen benötigen/);
  assert.doesNotMatch(f.root.textContent, /PRIVATE_REGISTER|PRIVATE_PROMPT/);
  assert.equal(all(f.root).filter((node) => node.tagName === "SELECT").length, 4);
  for (const label of ["Englischer Name", "Größe", "Lebenserwartung"]) assert.equal(f.input(`${label} wählen`).value, "");
  assert.equal(f.input("Deutscher Name wählen"), undefined);
  assert.equal(f.button("Änderungen prüfen").disabled, true); assert.equal(f.button("Geprüfte Grunddaten übernehmen").disabled, true);
  assert.equal(f.controller.hasUnsavedChanges(), false);
});

test("preview submits explicit field and change IDs without silently selecting the latest local version", async () => {
  const f = fixture(); await f.controller.open("conflict-fixture"); await chooseRequired(f);
  assert.equal(f.button("Änderungen prüfen").disabled, false); await f.click("Änderungen prüfen");
  const preview = f.calls.find((call) => call.url.endsWith("/preview"));
  assert.deepEqual(preview.body, { sourceScope: "person-project-scope", expectedReviewRevision: "review-revision-1",
    choices: { englishName: { kind: "local", changeId: "change-first" }, size: { kind: "server" }, lifeExpectancy: { kind: "server" } } });
  assert.match(f.root.textContent, /Server owl → Local owl/); assert.equal(f.button("Geprüfte Grunddaten übernehmen").disabled, false);
  assert.equal(f.confirmations.length, 0); assert.equal(f.calls.some((call) => call.url.endsWith("/resolve")), false);
  await f.choose("Größe", "custom"); await f.custom("Größe", "42 cm");
  assert.equal(f.button("Geprüfte Grunddaten übernehmen").disabled, true); assert.equal(f.calls.length, 2); assert.equal(f.controller.hasUnsavedChanges(), true);
});

test("keeping the server prepares all affected field decisions and a preview before any explicit resolution", async () => {
  const f = fixture(); await f.controller.open("conflict-fixture"); await f.click("Serverfassung beibehalten");
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1].body.choices, { englishName: { kind: "server" }, size: { kind: "server" }, lifeExpectancy: { kind: "server" } });
  assert.match(f.root.textContent, /Serverwerte bleiben erhalten/); assert.match(f.root.textContent, /Another owl/); assert.equal(f.confirmations.length, 0);
  await f.click("Geprüfte Grunddaten übernehmen");
  assert.equal(f.confirmations[0].confirmLabel, "Geprüfte Grunddaten übernehmen");
  assert.match(f.confirmations[0].message, /Interne Freigabe und Websiteveröffentlichung erfolgen separat/);
  assert.deepEqual(f.calls.at(-1), { url: `${BASE}/resolve`, method: "POST", body: { token: "opaque-preview-token" } });
  assert.equal(f.resolved.length, 1); assert.equal(f.controller.hasUnsavedChanges(), false); assert.match(f.root.textContent, /Artkonflikt wurde.*geklärt/);
});

test("cancelled confirmation performs no resolution and queued decisions are not reported as server confirmed", async () => {
  const cancelled = fixture({ confirm: async () => false }); await cancelled.controller.open("conflict-fixture"); await cancelled.click("Serverfassung beibehalten");
  await cancelled.click("Geprüfte Grunddaten übernehmen"); assert.equal(cancelled.calls.length, 2); assert.equal(cancelled.controller.hasUnsavedChanges(), true);
  const queued = fixture({ resolve: async () => ({ resolved: true, queued: true, serverConfirmed: false }) });
  await queued.controller.open("conflict-fixture"); await queued.click("Serverfassung beibehalten"); await queued.click("Geprüfte Grunddaten übernehmen");
  assert.match(queued.root.textContent, /lokal vorgemerkt.*Abgleich steht noch aus/); assert.doesNotMatch(queued.root.textContent, /Artkonflikt wurde.*geklärt/);
  assert.equal(queued.calls.length, 3); assert.equal(queued.resolved.length, 1); assert.equal(queued.controller.hasUnsavedChanges(), false);
});

test("review drift preserves custom input and invalid local choices require a new decision after manual reload", async () => {
  const f = fixture({ preview: async () => { throw Object.assign(new Error("Private backend detail"), { status: 409, code: "review_changed" }); } });
  await f.controller.open("conflict-fixture"); await chooseRequired(f); await f.choose("Größe", "custom"); await f.custom("Größe", "Eigene 42 cm");
  const originalInput = f.input("Eigener Wert: Größe"); await f.click("Änderungen prüfen");
  assert.equal(f.input("Eigener Wert: Größe"), originalInput); assert.equal(originalInput.value, "Eigene 42 cm");
  assert.equal(f.calls.length, 2); assert.equal(f.button("Änderungen prüfen").disabled, true); assert.match(f.root.textContent, /Vergleich neu laden/);
  assert.doesNotMatch(f.root.textContent, /Private backend detail/);
  const next = review(); next.reviewRevision = "review-revision-2";
  next.localVersions[0].changeId = "new-change-id";
  for (const field of next.fields) field.localVersions[0].changeId = "new-change-id";
  f.setReview(next); await f.click("Vergleich neu laden");
  assert.equal(f.input("Eigener Wert: Größe").value, "Eigene 42 cm"); assert.equal(f.input("Englischer Name wählen").value, "");
  assert.match(f.root.textContent, /offenen Zeilen erneut bewusst wählen/); assert.equal(f.calls.length, 3);
});

test("a failed resolution keeps choices, discards its token and never retries automatically", async () => {
  const f = fixture({ resolve: async () => { throw Object.assign(new Error("Offline"), { status: 503 }); } });
  await f.controller.open("conflict-fixture"); await chooseRequired(f); await f.click("Änderungen prüfen"); await f.click("Geprüfte Grunddaten übernehmen");
  assert.equal(f.calls.length, 3); assert.equal(f.input("Englischer Name wählen").value, "local:change-first");
  assert.equal(f.controller.hasUnsavedChanges(), true); assert.equal(f.controller.busy, false);
  assert.equal(f.button("Geprüfte Grunddaten übernehmen").disabled, true); assert.equal(f.button("Änderungen prüfen").disabled, false);
  assert.match(f.root.textContent, /Schritt wurde nicht bestätigt/); assert.equal(f.resolved.length, 0);
});

test("permission changes invalidate a pending preview, preserve fields and require a fresh review", async () => {
  const pending = deferred(), f = fixture({ preview: () => pending.promise });
  await f.controller.open("conflict-fixture"); await chooseRequired(f); await f.click("Änderungen prüfen");
  assert.equal(f.controller.busy, true); assert.equal(f.controller.reset(), false);
  f.setProject(project({ role: "reader" })); pending.resolve(previewFor(f.getReview(), {})); await settle();
  assert.equal(f.controller.busy, false); assert.equal(f.input("Englischer Name wählen").value, "local:change-first");
  assert.equal(f.input("Englischer Name wählen").disabled, true); assert.equal(f.button("Geprüfte Grunddaten übernehmen").disabled, true);
  f.setProject(project()); assert.equal(f.button("Änderungen prüfen").disabled, true); assert.equal(f.calls.length, 2);
  await f.click("Vergleich neu laden"); assert.equal(f.input("Englischer Name wählen").value, "local:change-first"); assert.equal(f.button("Änderungen prüfen").disabled, false);
});

test("offline and reader comparisons remain readable without writable choices or posts", async () => {
  for (const options of [{ role: "reader" }, { connection: "offline" }, { readOnly: true }]) {
    const f = fixture(); f.setProject(project(options)); await f.controller.open("conflict-fixture");
    assert.match(f.root.textContent, /Server owl/); assert.equal(f.input("Englischer Name wählen").disabled, true);
    await f.click("Serverfassung beibehalten"); await f.click("Änderungen prüfen"); assert.equal(f.calls.length, 1);
  }
});

test("person or project changes reject late reads and hide the former comparison while preserving its draft", async () => {
  const pending = deferred(), loading = fixture({ get: () => pending.promise }), open = loading.controller.open("conflict-fixture");
  loading.setProject(project({ user: "person-b" })); pending.resolve(review()); assert.equal(await open, null);
  assert.doesNotMatch(visibleText(loading.root), /Testkauz/); assert.equal(loading.controller.busy, false);
  const f = fixture(); await f.controller.open("conflict-fixture"); await f.choose("Englischer Name", "custom"); await f.custom("Englischer Name", "Prior person input");
  f.setProject(project({ projectId: "other-project" })); assert.doesNotMatch(visibleText(f.root), /Prior person input|Testkauz/);
  assert.equal(f.controller.hasUnsavedChanges(), true); assert.equal(f.button("Änderungen prüfen").disabled, true); assert.equal(f.calls.length, 1);
});

test("an optional context epoch invalidates a pending preview even before project state is delivered", async () => {
  const pending = deferred(), f = fixture({ useContext: true, preview: () => pending.promise });
  await f.controller.open("conflict-fixture"); await chooseRequired(f); await f.click("Änderungen prüfen");
  f.setContext(2); pending.resolve(previewFor(f.getReview(), {})); await settle();
  assert.equal(f.button("Geprüfte Grunddaten übernehmen").disabled, true); assert.equal(f.controller.busy, false);
  assert.equal(f.input("Englischer Name wählen").value, "local:change-first"); assert.match(f.root.textContent, /Projektansicht wurde gewechselt/);
});

test("old input and select events cannot change preserved choices after context or write access is lost", async () => {
  for (const lost of ["context", "rights"]) {
    const f = fixture({ useContext: true }); await f.controller.open("conflict-fixture"); await chooseRequired(f);
    await f.choose("Größe", "custom"); await f.custom("Größe", "31 cm");
    const text = f.input("Eigener Wert: Größe"), select = f.input("Englischer Name wählen");
    if (lost === "context") f.setContext(2); else f.setProject(project({ role: "reader" }));
    text.value = "Überholte 99 cm"; await text.emit("input", { force: true });
    select.value = "server"; await select.emit("change", { force: true });
    assert.equal(f.calls.filter((call) => call.method === "POST").length, 0);
    // Return to the original review scope solely to read back its preserved
    // choices. A blocked late DOM value must never become a new local choice.
    if (lost === "context") f.setContext(1); else f.setProject(project());
    await f.click("Vergleich neu laden");
    assert.equal(f.input("Eigener Wert: Größe").value, "31 cm");
    assert.equal(f.input("Englischer Name wählen").value, "local:change-first");
  }
});

test("explicit local read mode can reload and inspect a conflict without enabling fresh choices or POSTs", async () => {
  let editing = false;
  const f = fixture({ useContext: true, canEdit: () => editing });
  await f.controller.open("conflict-fixture");
  assert.match(f.root.textContent, /Server owl/); assert.equal(f.input("Englischer Name wählen").disabled, true);
  f.input("Englischer Name wählen").value = "local:change-first"; await f.input("Englischer Name wählen").emit("change", { force: true });
  await f.click("Vergleich neu laden");
  assert.equal(f.input("Englischer Name wählen").value, "");
  await f.button("Serverfassung beibehalten").emit("click", { force: true });
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 0);
  editing = true; f.setContext(2); await f.click("Vergleich neu laden");
  assert.equal(f.input("Englischer Name wählen").disabled, false);
});

test("a changed context after preview blocks confirmation and a late resolution cannot update another person's view", async () => {
  const f = fixture({ useContext: true }); await f.controller.open("conflict-fixture"); await f.click("Serverfassung beibehalten");
  f.setContext(2); await f.click("Geprüfte Grunddaten übernehmen");
  assert.equal(f.calls.length, 2); assert.equal(f.confirmations.length, 0);
  const pending = deferred(), resolving = fixture({ resolve: () => pending.promise });
  await resolving.controller.open("conflict-fixture"); await chooseRequired(resolving); await resolving.click("Änderungen prüfen");
  await resolving.click("Geprüfte Grunddaten übernehmen"); assert.equal(resolving.controller.busy, true);
  resolving.setProject(project({ user: "another-person" })); pending.resolve({ resolved: true, queued: false, serverConfirmed: true }); await settle();
  assert.equal(resolving.resolved.length, 0); assert.equal(resolving.controller.busy, false); assert.equal(resolving.controller.hasUnsavedChanges(), true);
  assert.doesNotMatch(visibleText(resolving.root), /Artkonflikt wurde.*geklärt|Testkauz/); assert.equal(resolving.calls.length, 3);
});

test("an input arriving during preview or confirmation invalidates the old result and cannot resolve it", async () => {
  const pending = deferred(), f = fixture({ preview: () => pending.promise });
  await f.controller.open("conflict-fixture"); await chooseRequired(f); await f.choose("Größe", "custom"); await f.custom("Größe", "30 cm");
  await f.click("Änderungen prüfen"); await f.custom("Größe", "31 cm", true); pending.resolve(previewFor(f.getReview(), {})); await settle();
  assert.equal(f.input("Eigener Wert: Größe").value, "31 cm"); assert.equal(f.button("Geprüfte Grunddaten übernehmen").disabled, true);
  const confirm = deferred(), confirmation = fixture({ confirm: () => confirm.promise });
  await confirmation.controller.open("conflict-fixture"); await chooseRequired(confirmation); await confirmation.choose("Größe", "custom"); await confirmation.custom("Größe", "40 cm");
  await confirmation.click("Änderungen prüfen"); await confirmation.click("Geprüfte Grunddaten übernehmen");
  await confirmation.custom("Größe", "41 cm", true); confirm.resolve(true); await settle();
  assert.equal(confirmation.calls.length, 2); assert.equal(confirmation.controller.busy, false); assert.equal(confirmation.input("Eigener Wert: Größe").value, "41 cm");
});

test("a failed switch to another conflict retains the previous form and its correct request target", async () => {
  const f = fixture({ get: async (url, snapshot) => { if (url.endsWith("another-conflict")) throw new Error("Unavailable"); return structuredClone(snapshot); } });
  await f.controller.open("conflict-fixture"); await chooseRequired(f); await f.controller.open("another-conflict");
  assert.equal(f.input("Englischer Name wählen").value, "local:change-first"); await f.click("Änderungen prüfen");
  assert.equal(f.calls.at(-1).url, `${BASE}/preview`); assert.equal(f.calls.at(-1).body.expectedReviewRevision, "review-revision-1");
});

test("a late input during resolution survives a successful acknowledgement as an unreviewed choice", async () => {
  const pending = deferred(), f = fixture({ resolve: () => pending.promise });
  await f.controller.open("conflict-fixture"); await chooseRequired(f); await f.choose("Größe", "custom"); await f.custom("Größe", "40 cm");
  await f.click("Änderungen prüfen"); await f.click("Geprüfte Grunddaten übernehmen");
  await f.custom("Größe", "41 cm", true); pending.resolve({ resolved: true, queued: true, serverConfirmed: false }); await settle();
  assert.equal(f.input("Eigener Wert: Größe").value, "41 cm"); assert.equal(f.controller.hasUnsavedChanges(), true);
  assert.equal(f.button("Geprüfte Grunddaten übernehmen").disabled, true); assert.equal(f.button("Änderungen prüfen").disabled, true);
  assert.match(f.root.textContent, /lokal vorgemerkt/); assert.match(f.root.textContent, /neueren Auswahleingaben bleiben erhalten/);
  assert.equal(f.resolved.length, 1); assert.equal(f.calls.length, 3);
});

test("custom validation and missing local values cannot remove an existing server field", async () => {
  const f = fixture(), snapshot = review(); snapshot.fields[0].localVersions[0] = { changeId: "change-first", state: "conflict", present: false };
  f.setReview(snapshot); await f.controller.open("conflict-fixture"); await chooseRequired(f);
  const localOption = all(f.input("Englischer Name wählen")).find((node) => node.value === "local:change-first");
  assert.equal(localOption.disabled, true); assert.equal(f.button("Änderungen prüfen").disabled, true);
  await f.choose("Englischer Name", "custom"); await f.custom("Englischer Name", "   "); assert.equal(f.button("Änderungen prüfen").disabled, true);
  await f.custom("Englischer Name", "x".repeat(161)); assert.equal(f.button("Änderungen prüfen").disabled, true);
  await f.custom("Englischer Name", "New owl"); assert.equal(f.button("Änderungen prüfen").disabled, false);
  assert.equal(f.calls.length, 1);
});

test("reset clears only idle review inputs and destroy prevents all late preview application", async () => {
  const f = fixture(); await f.controller.open("conflict-fixture"); await chooseRequired(f); assert.equal(f.controller.reset(), true);
  assert.equal(f.controller.hasUnsavedChanges(), false); assert.equal(f.root.hidden, true); await f.controller.open("conflict-fixture");
  assert.equal(f.input("Englischer Name wählen").value, "");
  const pending = deferred(), destroyed = fixture({ preview: () => pending.promise });
  await destroyed.controller.open("conflict-fixture"); await chooseRequired(destroyed); await destroyed.click("Änderungen prüfen"); destroyed.controller.destroy();
  pending.resolve(previewFor(destroyed.getReview(), {})); await settle();
  assert.equal(destroyed.root.children.length, 0); assert.equal(destroyed.root.hidden, true); assert.equal(destroyed.controller.hasUnsavedChanges(), false);
  assert.equal(destroyed.calls.length, 2); assert.equal(destroyed.dirty.at(-1), false);
});

test("a failed confirmation preserves the selection and a completed resolution survives a failed parent refresh", async () => {
  const confirmation = fixture({ confirm: async () => { throw new Error("Synthetic cancelled dialog"); } });
  await confirmation.controller.open("conflict-fixture"); await confirmation.click("Serverfassung beibehalten"); await confirmation.click("Geprüfte Grunddaten übernehmen");
  assert.equal(confirmation.calls.length, 2); assert.equal(confirmation.controller.hasUnsavedChanges(), true); assert.match(confirmation.root.textContent, /Bestätigung wurde nicht abgeschlossen/);
  const refreshed = fixture({ onResolved: async () => { throw new Error("Synthetic refresh failure"); } });
  await refreshed.controller.open("conflict-fixture"); await refreshed.click("Serverfassung beibehalten"); await refreshed.click("Geprüfte Grunddaten übernehmen");
  assert.equal(refreshed.calls.length, 3); assert.equal(refreshed.controller.hasUnsavedChanges(), false); assert.match(refreshed.root.textContent, /Artkonflikt wurde.*geklärt/); assert.match(refreshed.root.textContent, /Projektansicht erneut laden/);
});
