import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({ clearTimeout() {}, setTimeout(callback, delay) {
  if (delay === 900) queueMicrotask(callback); // Only the explicit workflow wait; no background timer runs.
  return 1;
} });
for (const file of ["app-taxonomy-progress.js", "app-taxonomy-database.js", "app-taxonomy-maintenance.js"]) {
  new vm.Script(await readFile(new URL(`./public/${file}`, import.meta.url), "utf8"), { filename: file }).runInContext(context);
}

function fixture(options = {}) {
  function node() {
    const listeners = {}, children = new Map();
    return { textContent: "", innerHTML: "", hidden: false, disabled: false, value: "",
      classList: { toggle() {} }, removeAttribute(name) { delete this[name]; },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
      querySelectorAll: () => [], addEventListener(type, callback) { listeners[type] = callback; },
      click() { listeners.click?.(); } };
  }
  const nodes = new Map(), elements = new Proxy({}, { get(_, key) {
    if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key);
  } });
  const ready = () => ({ status: "completed", active: false, lifecycle: { active: { candidateId: "new" } },
    reference: { status: "current", needsMasterRebuild: false }, lightroomPackage: { status: "current", needsRebuild: false } });
  const base = () => ({ status: "idle", active: false, lifecycle: { active: { candidateId: "old" } },
    reference: { status: "current", needsMasterRebuild: false }, lightroomPackage: { status: "current", needsRebuild: false } });
  const referenceBase = () => ({ status: "idle", active: false, updateAvailable: options.hasWork !== false,
    latestCheckedAt: "2026-10-02T00:00:00Z", latest: { alias: "COL fixture", issued: "2026-10-01" },
    reference: { available: options.installed !== false }, rollbackAvailable: true });
  let master = options.initialMaster || base(), reference = referenceBase(), phase = "initial";
  let sourceQueued = false, masterQueued = false;
  const calls = [], messages = [], confirmations = [], delegated = [];
  const state = { taxonomyMasterSnapshot: master, taxonomyMaintenanceSnapshot: reference,
    setPipelineMessage: (text, type) => messages.push({ text, type }) };
  const preview = () => ({ hasWork: options.hasWork !== false, token: "bound-source-token", latest: reference.latest,
    updateCatalogue: options.catalogue !== false, warning: "Quellenhinweis", requiredFreeBytes: 12 * 1024 ** 3 });
  const fetchJson = async (url, payload) => {
    calls.push({ url, payload, phase });
    if (payload?.method === "POST") {
      if (url.endsWith("/preview")) return options.preview || preview();
      if (url.endsWith("/start")) {
        if (options.startError) throw new Error(options.startError);
        phase = "sources";
        reference = options.sourceResult || { ...reference, status: "completed", action: "update", updateCatalogue: options.catalogue !== false };
        if (!options.sourceResult) master = { ...master, reference: { ...master.reference, needsMasterRebuild: true } };
        if (options.asyncStages && !options.sourceResult) {
          sourceQueued = true;
          reference = { ...reference, active: true, status: "downloading" };
        }
        return reference;
      }
      if (url.endsWith("/build")) {
        if (options.buildError) throw new Error(options.buildError);
        phase = "build";
        master = options.buildResult || { ...base(), status: "ready",
          lifecycle: { active: { candidateId: "old" }, candidate: { candidateId: "new" }, canActivate: true } };
        if (options.asyncStages && !options.buildResult) {
          masterQueued = master; master = { ...base(), status: "building", active: true };
        }
        return master;
      }
      if (["/activate", "/apply-corrections", "/sync-lightroom"].some((suffix) => url.endsWith(suffix))) {
        phase = "pair";
        master = options.pairResult || ready();
        if (options.asyncStages && !options.pairResult) {
          masterQueued = master; master = { ...base(), status: "activating", active: true };
        }
        return master;
      }
      throw new Error(`Unexpected write: ${url}`);
    }
    if (url.endsWith("/master/status")) {
      if (phase === "initial" && options.statusError) throw new Error(options.statusError);
      if (masterQueued) { master = masterQueued; masterQueued = false; }
      if (phase === "pair" && options.finalMaster) master = options.finalMaster;
      return master;
    }
    if (url.endsWith("/taxonomy/status")) {
      if (phase === "initial" && options.referenceError) throw new Error(options.referenceError);
      if (sourceQueued) { sourceQueued = false; reference = { ...reference, active: false, status: "completed" }; }
      return reference;
    }
    if (url.endsWith("/review")) return { entries: [] };
    throw new Error(`Unexpected read: ${url}`);
  };
  const showQuickConfirm = async (value) => {
    confirmations.push(value);
    return options.confirm ? options.confirm(value) : options.accept !== false;
  };
  const database = context.SpeciesExplorerTaxonomyDatabase.createTaxonomyDatabaseController({ state, elements, fetchJson,
    escapeHtml: String, taxonomyReference: {}, createDialogController: () => ({}), showQuickConfirm, formatBytes: () => "12 GB" });
  const common = state.updateTaxonomyDatabase;
  state.updateTaxonomyDatabase = async (value) => { delegated.push(value); return common(value); };
  const maintenance = context.SpeciesExplorerTaxonomyMaintenance.createTaxonomyMaintenanceController({ state, elements, fetchJson,
    escapeHtml: String, showQuickConfirm, formatBytes: () => "12 GB", renderDatabaseStatus() {} });
  return { state, elements, database, maintenance, calls, messages, confirmations, delegated, ready, base,
    setMaster(value) { master = value; state.taxonomyMasterSnapshot = value; } };
}

async function flush() { for (let index = 0; index < 16; index += 1) await new Promise(setImmediate); }
const writes = (f) => f.calls.filter((entry) => entry.payload?.method === "POST" && !entry.url.endsWith("/preview"));
const success = (f) => f.messages.filter((entry) => entry.type === "success" && /gemeinsam aktuell/.test(entry.text));
async function start(f, entry) {
  if (entry === "startup") { f.maintenance.setup(); await flush(); }
  else if (entry === "maintenance") {
    f.maintenance.setup(); await flush();
    f.elements.taxonomyUpdateButton.click(); await flush();
  } else await f.state.updateTaxonomyDatabase();
}

test("Startangebot und manuelle Aktion durchlaufen denselben vollständigen Quellen-/Master-/Paketweg", async (t) => {
  for (const entry of ["startup", "manual"]) await t.test(entry, async () => {
    const f = fixture({ asyncStages: true });
    await start(f, entry);
    assert.equal(f.confirmations.length, 1);
    assert.match(f.confirmations[0].message, /Master und Lightroom-Suchpaket/);
    assert.match(f.confirmations[0].message, /Offene Konflikte stoppen/);
    assert.match(f.confirmations[0].message, /12 GB/);
    assert.deepEqual(writes(f).map((call) => call.url), ["/api/taxonomy/update/start", "/api/taxonomy/master/build", "/api/taxonomy/master/activate"]);
    assert.deepEqual(JSON.parse(writes(f)[0].payload.body), { token: "bound-source-token" });
    assert.deepEqual(JSON.parse(writes(f)[1].payload.body), { refreshProviders: true });
    assert.deepEqual(JSON.parse(writes(f)[2].payload.body), { confirmed: true });
    assert.ok(f.calls.some((call) => call.url === "/api/taxonomy/status" && call.phase === "sources"));
    assert.ok(f.calls.some((call) => call.url === "/api/taxonomy/master/status" && call.phase === "build"));
    assert.ok(f.calls.some((call) => call.url === "/api/taxonomy/master/status" && call.phase === "pair"));
    assert.equal(success(f).length, 1);
    assert.equal(f.state.taxonomyDatabaseBusy, false);
    assert.equal(f.elements.taxonomyDatabaseUpdateButton.disabled, false);
  });
});

test("Später/Abbrechen schreibt nichts; ein späterer manueller Start bleibt möglich", async (t) => {
  for (const entry of ["startup", "manual"]) await t.test(entry, async () => {
    let confirmed = false;
    const f = fixture({ installed: false, confirm: async () => confirmed });
    await start(f, entry);
    assert.equal(f.confirmations.length, 1);
    assert.equal(writes(f).length, 0);
    assert.equal(f.state.taxonomyDatabaseBusy, false);
    if (entry === "startup") {
      assert.equal(f.confirmations[0].title, "Keine Taxonomiedatenbank installiert");
      assert.equal(f.confirmations[0].cancelLabel, "Später");
      await f.maintenance.refresh(); await flush();
      assert.equal(f.confirmations.length, 1);
    }
    confirmed = true;
    await f.state.updateTaxonomyDatabase();
    assert.equal(success(f).length, 1);
  });
});

test("beide Einstiege sind schon während der Rückfrage gemeinsam gesperrt", async () => {
  let releaseConfirm;
  const f = fixture({ confirm: () => new Promise((resolve) => { releaseConfirm = resolve; }) });
  const running = f.state.updateTaxonomyDatabase(); await flush();
  assert.equal(f.state.taxonomyDatabaseBusy, true);
  await f.state.updateTaxonomyDatabase({ startup: true });
  assert.equal(f.confirmations.length, 1);
  assert.equal(f.elements.taxonomyUpdateButton.disabled, true);
  assert.equal(f.elements.taxonomyDatabaseUpdateButton.disabled, true);
  releaseConfirm(false); await running;
  assert.equal(writes(f).length, 0);
  assert.equal(f.state.taxonomyDatabaseBusy, false);
});

test("Fehler nach Quellenwechsel setzt beim nächsten Klick lokal fort; erneutes Öffnen startet nichts", async () => {
  const options = { buildError: "Masteraufbau fehlgeschlagen" }, f = fixture(options);
  await f.state.updateTaxonomyDatabase();
  assert.equal(success(f).length, 0);
  assert.equal(f.state.taxonomyDatabaseBusy, false);
  options.buildError = null;
  const before = writes(f).length;
  f.database.setup(); await flush(); // Opening only refreshes the stored status.
  assert.equal(writes(f).length, before);
  await f.state.updateTaxonomyDatabase();
  assert.deepEqual(writes(f).slice(before).map((call) => call.url), ["/api/taxonomy/master/build", "/api/taxonomy/master/activate"]);
  assert.equal(JSON.parse(writes(f)[before].payload.body).refreshProviders, false);
  assert.equal(success(f).length, 1);
});

test("frische laufende Aktion oder Vergleichsfehler überstimmt einen alten bereiten UI-Stand", async (t) => {
  for (const master of [{ status: "building", active: true },
    { status: "idle", reference: { status: "error", error: "Referenzvergleich fehlgeschlagen" } }]) await t.test(master.status, async () => {
    const f = fixture({ initialMaster: master });
    f.state.taxonomyMasterSnapshot = f.ready(); // Cache is intentionally more permissive than the service.
    await f.state.updateTaxonomyDatabase();
    assert.equal(writes(f).length, 0); assert.equal(f.confirmations.length, 0);
    assert.equal(success(f).length, 0);
  });
});

test("gespeicherte oder vorgemerkte Kandidaten haben Vorrang vor neuen Quellen und bleiben beim Abbruch erhalten", async () => {
  const f = fixture({ initialMaster: { status: "paused", buildJob: { available: true, status: "paused" } }, accept: false });
  await start(f, "startup");
  assert.equal(f.confirmations[0].title, "Neuen Datenbankaufbau starten?");
  assert.match(f.confirmations[0].message, /Zwischenstand wird nicht überschrieben/);
  assert.equal(writes(f).length, 0);
  assert.equal(f.state.taxonomyMasterSnapshot.buildJob.status, "paused");
  const candidate = fixture({ initialMaster: { status: "ready", lifecycle: { active: { candidateId: "old" },
    candidate: { candidateId: "prepared" }, canActivate: true } } });
  await start(candidate, "startup");
  assert.deepEqual(writes(candidate).map((call) => call.url), ["/api/taxonomy/master/activate"]);
});

test("der ältere Wartungsbutton verwendet ebenfalls ausschließlich den gemeinsamen Update-Einstieg", async () => {
  let accepted = false;
  const f = fixture({ confirm: async () => accepted });
  f.maintenance.setup(); await flush();
  assert.equal(writes(f).length, 0);
  accepted = true; f.elements.taxonomyUpdateButton.click(); await flush();
  assert.equal(f.delegated.length, 2);
  assert.equal(success(f).length, 1);
  assert.equal(writes(f).length, 3);
});

test("fehlende frische Status-/Vorschaudaten verwenden keinen schreibenden Cache-Fallback", async (t) => {
  for (const option of [{ statusError: "Masterstatus nicht lesbar" }, { referenceError: "Quellenstatus nicht lesbar" },
    { preview: {} }, { preview: { hasWork: true } }]) await t.test(JSON.stringify(option), async () => {
    const f = fixture(option); await f.state.updateTaxonomyDatabase();
    assert.equal(f.confirmations.length, 0);
    assert.equal(writes(f).length, 0);
    assert.equal(success(f).length, 0);
    assert.equal(f.state.taxonomyDatabaseBusy, false);
    assert.equal(f.messages.at(-1).type, "error");
  });
});

test("veraltete Freigabe oder Quellenfehler starten keinen Master und bleiben erneut bedienbar", async (t) => {
  for (const option of [{ startError: "Quellenvorschau ist veraltet" },
    ...["failed", "partial"].map((status) => ({ sourceResult: { status, message: "Quellenfehler", active: false } }))]) {
    await t.test(JSON.stringify(option), async () => {
      const f = fixture(option); await f.state.updateTaxonomyDatabase();
      assert.deepEqual(writes(f).map((call) => call.url), ["/api/taxonomy/update/start"]);
      assert.equal(success(f).length, 0);
      assert.equal(f.state.taxonomyDatabaseBusy, false);
      assert.equal(f.elements.taxonomyDatabaseUpdateButton.disabled, false);
    });
  }
});

test("Aktueller Downloadfehler überdeckt alten fertigen Auftrag; Wiederöffnung startet nichts und zeigt keinen Gesamtabschluss", async () => {
  const f = fixture({ initialMaster: { status: "idle", active: false, message: "Noch kein Master-Abgleich gestartet.",
    lifecycle: { active: { candidateId: "old", summary: { taxa: 273466, germanNames: 45502, englishNames: 157607 } } },
    reference: { needsMasterRebuild: false }, lightroomPackage: { status: "current" },
    buildJob: { available: true, status: "ready", progress: { phase: "Abschluss", percent: 99 } } },
    sourceResult: { status: "failed", phase: "download", active: false, action: "update",
      message: "Taxonomie-Aktualisierung fehlgeschlagen. Die bisherige Version bleibt aktiv.",
      error: "ChecklistBank hat keine sichere Downloadweiterleitung geliefert (HTTP 404)." } });
  await f.state.updateTaxonomyDatabase();
  assert.deepEqual(writes(f).map((call) => call.url), ["/api/taxonomy/update/start"]);
  assert.equal(success(f).length, 0); assert.equal(f.state.taxonomyDatabaseBusy, false);
  assert.equal(f.elements.taxonomyDatabaseUpdateButton.disabled, false);
  const detail = f.elements.taxonomyDatabaseOverviewDetail.textContent;
  assert.match(detail, /Schritt 1 von 7.*Quelldownload.*fehlgeschlagen/);
  assert.match(detail, /Bisheriger aktiver Bestand: 273\.466 Taxa.*45\.502 deutsche Namen.*157\.607 englische Namen/);
  assert.match(detail, /HTTP 404/); assert.doesNotMatch(detail, /Master prüfen|Noch kein Master-Abgleich/);
  await f.database.refresh();
  assert.equal(writes(f).length, 1, "Nur lesende Wiederöffnung, kein unbestätigter Wiederholungsstart");
  assert.equal(f.state.taxonomyMasterSnapshot.lifecycle.active.candidateId, "old");
});

test("Masterpause, Fehler und Klassifikationskonflikte stoppen vor der Paketaktivierung", async (t) => {
  for (const buildResult of [
    ...["paused", "interrupted", "failed", "stale", "partial"].map((status) => ({ status, active: false, message: "Aufbau gestoppt",
      lifecycle: { candidate: { candidateId: "older" }, canActivate: true } })),
    { status: "ready", active: false, lifecycle: { candidate: { candidateId: "new" }, canActivate: false, blockingConflictCount: 480 } },
  ]) await t.test(buildResult.status + (buildResult.lifecycle.blockingConflictCount || ""), async () => {
    const f = fixture({ buildResult }); await f.state.updateTaxonomyDatabase();
    assert.equal(writes(f).some((call) => call.url.endsWith("/activate")), false);
    assert.equal(success(f).length, 0);
    assert.equal(f.state.taxonomyDatabaseBusy, false);
    if (buildResult.lifecycle.blockingConflictCount) assert.match(f.messages.at(-1).text, /gebündelt geprüft oder zurückgestellt/);
  });
});

test("sofortige Paketfehler und nicht bestätigter Gesamtstand werden nie als Erfolg angezeigt", async (t) => {
  for (const option of [
    ...["partial", "failed"].map((status) => ({ pairResult: { status, active: false, error: "Paketprüfung fehlgeschlagen" } })),
    { finalMaster: { status: "completed", lifecycle: { active: { candidateId: "new" } }, lightroomPackage: { status: "stale" } } },
    { finalMaster: { status: "completed", lifecycle: { active: { candidateId: "new" } }, reference: { needsMasterRebuild: true }, lightroomPackage: { status: "current" } } },
    { finalMaster: { status: "completed", lifecycle: {}, lightroomPackage: { status: "current" } } },
  ]) await t.test(JSON.stringify(option), async () => {
    const f = fixture(option); await f.state.updateTaxonomyDatabase();
    assert.equal(success(f).length, 0);
    assert.equal(f.messages.at(-1).type, "error");
    assert.equal(f.state.taxonomyDatabaseBusy, false);
  });
});

test("lokaler Drift, Namenswahl und Paketnachholung verwenden auch vom Start aus keine Downloads", async (t) => {
  for (const scenario of [
    { reference: { needsMasterRebuild: true, activeRelease: "new-col" }, expected: ["/build", "/activate"] },
    { corrections: { pending: true }, expected: ["/apply-corrections"] },
    { identities: { pending: true }, expected: ["/build", "/activate"] },
    { lightroomPackage: { status: "stale", needsRebuild: true }, expected: ["/sync-lightroom"] },
  ]) await t.test(JSON.stringify(scenario.expected), async () => {
    const f = fixture(); f.state.taxonomyMasterSnapshot = { ...f.base(), ...scenario };
    // The service, not the cached UI state, supplies the authoritative local work.
    const local = fixture({ initialMaster: f.state.taxonomyMasterSnapshot });
    await start(local, "startup");
    assert.deepEqual(writes(local).map((call) => call.url.slice(call.url.lastIndexOf("/"))), scenario.expected);
    assert.ok(writes(local).filter((call) => call.url.endsWith("/build")).every((call) => JSON.parse(call.payload.body).refreshProviders === false));
    assert.match(local.confirmations[0].message, /keine neuen Anbieterstände geladen/);
    assert.equal(success(local).length, 1);
  });
});

test("aktuell ohne Arbeit startet weder Download noch Aufbau; Ergänzungsupdate endet ebenfalls beim geprüften Paar", async () => {
  const current = fixture({ hasWork: false }); await current.state.updateTaxonomyDatabase();
  assert.equal(current.confirmations.length, 0); assert.equal(writes(current).length, 0);
  const supplements = fixture({ catalogue: false }); await start(supplements, "startup");
  assert.equal(supplements.confirmations[0].title, "Namensbestand ist veraltet");
  assert.equal(writes(supplements).length, 3); assert.equal(success(supplements).length, 1);
});

test("fehlende gemeinsame Steuerung bietet keinen reinen Quellen-Start als Ersatz", async () => {
  const f = fixture(); delete f.state.updateTaxonomyDatabase;
  f.maintenance.setup(); await flush();
  assert.equal(f.confirmations.length, 0);
  f.elements.taxonomyUpdateButton.click(); await flush();
  assert.equal(writes(f).length, 0);
  assert.ok(f.messages.some((entry) => /gemeinsame Datenbankaktualisierung ist nicht verfügbar/.test(entry.text)));
});
