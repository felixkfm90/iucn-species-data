import assert from "node:assert/strict";
import { test } from "node:test";
import { createLightroomCloseGate } from "./lightroom-close-gate.mjs";

function fixture() {
  let opened = true, working = false, fresh = true;
  const calls = [], target = { id: 17, path: "C:\\Program Files\\Adobe\\Lightroom.exe" };
  const gate = createLightroomCloseGate({
    processes: async () => opened ? [target] : [],
    closeProcesses: async (targets) => { calls.push(["close", targets]); },
    usage: async ({ full }) => { calls.push(["usage", full]); return { ready: fresh, revision: "proof",
      catalogs: [{ catalogPath: "catalog.lrcat" }], reason: fresh ? "" : "catalog-changed-or-open" }; },
    stat: async () => { if (!working) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return {}; },
  });
  return { gate, calls, target, set: (values) => {
    opened = values.opened ?? opened; working = values.working ?? working; fresh = values.fresh ?? fresh;
  } };
}

test("Schließen benötigt Bestätigung und fordert niemals ein hartes Beenden an", async () => {
  const f = fixture();
  await assert.rejects(f.gate.requestClose(), /bestätigt/);
  assert.equal(f.calls.length, 0);
  const response = await f.gate.requestClose({ confirmed: true });
  assert.deepEqual(f.calls.find(([kind]) => kind === "close")[1], [f.target]);
  assert.equal(response.forced, false);
  assert.equal(response.open, true, "Schließanforderung ist kein Schließnachweis");
});

test("Selbstschließen wird erkannt; vorher keine Vollprüfsumme", async () => {
  const f = fixture();
  for (let index = 0; index < 3; index += 1) assert.equal((await f.gate.ready()).reason, "lightroom-open");
  assert.equal(f.calls.filter(([kind, full]) => kind === "usage" && full).length, 0);
  f.set({ opened: false });
  assert.equal((await f.gate.ready()).ready, true);
  assert.equal(f.calls.filter(([kind, full]) => kind === "usage" && full).length, 1);
});

test("Arbeitsdateien und fehlender Nutzungsnachweis sperren auch nach Prozessende", async () => {
  const f = fixture(); f.set({ opened: false, working: true });
  assert.equal((await f.gate.ready()).reason, "lightroom-open");
  f.set({ working: false, fresh: false });
  assert.equal((await f.gate.ready()).reason, "catalog-usage");
  assert.equal(f.calls.some(([kind, full]) => kind === "usage" && full), false);
});

test("Arbeitsdateien nach Prozessende melden den fehlenden Katalogabschluss und behalten die Sperre", async () => {
  for (const suffix of [".lock", "-wal", "-shm", "-journal"]) {
    let opened = false, working = true;
    const calls = [], target = { id: 17, path: "C:\\Program Files\\Adobe\\Lightroom.exe" };
    const gate = createLightroomCloseGate({ processes: async () => opened ? [target] : [],
      closeProcesses: async () => { calls.push(["close"]); },
      usage: async ({ full }) => { calls.push(["usage", full]); return { ready: true, revision: "proof",
        catalogs: [{ catalogPath: "catalog.lrcat" }] }; },
      stat: async (filename) => {
        if (working && filename === `catalog.lrcat${suffix}`) return {};
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      } });
    const status = await gate.status(), blocked = await gate.ready();
    assert.equal(status.workingFiles, true, suffix);
    assert.equal(status.open, true);
    assert.deepEqual(status.processes, []);
    assert.equal(status.canRequestClose, false);
    assert.match(status.message, /Lightroom ist beendet.*Katalogabschluss.*Arbeitsdateien/);
    assert.equal(blocked.ready, false);
    assert.equal(blocked.reason, "lightroom-open");
    assert.match(blocked.message, /Lightroom ist beendet.*Katalogabschluss.*Arbeitsdateien/);
    assert.equal(calls.some(([kind, full]) => kind === "close" || kind === "usage" && full), false);
    opened = true;
    assert.equal((await gate.status()).workingFiles, true);
    assert.doesNotMatch((await gate.ready()).message, /Lightroom ist beendet/);
    working = false;
    const live = await gate.status();
    assert.equal(live.workingFiles, false);
    assert.equal(live.open, true);
    assert.doesNotMatch(live.message, /Lightroom ist beendet/);
    opened = false;
    const closed = await gate.status();
    assert.equal(closed.workingFiles, false);
    assert.equal(closed.open, false);
    assert.equal((await gate.ready()).ready, true);
    assert.equal(calls.filter(([kind, full]) => kind === "usage" && full).length, 1);
    assert.equal(calls.some(([kind]) => kind === "close"), false);
  }
});

test("Eigene FN-Anfrage mit Katalogresten bleibt ohne Schließversuch oder vorzeitige Quittungsbindung gesperrt", async () => {
  let working = true, captured = false, registered = false, completed = false;
  const calls = [], job = { updateRunId: "update-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", phase: "start", freshUsageCapture: true };
  const gate = createLightroomCloseGate({ processes: async () => [],
    usage: async ({ full }) => { calls.push(["usage", full]); return { ready: registered, revision: "proof", catalogs: [{ catalogPath: "catalog.lrcat" }] }; },
    stat: async (filename) => {
      if (working && filename.endsWith("-wal")) return {};
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }, closeProcesses: async () => { calls.push(["close"]); },
    usageRequests: { status: async () => ({ exists: true, ready: captured, alreadyRegistered: registered,
      request: { status: completed ? "completed" : "pending" } }),
    claimNormalClose: async () => { calls.push(["claim"]); return true; },
    bindClosed: async () => { calls.push(["bind"]); registered = completed = true; } } });
  for (const freshCapture of [false, true]) {
    captured = freshCapture;
    const blocked = await gate.ready({ job });
    assert.equal(blocked.ready, false);
    assert.equal(blocked.reason, "lightroom-open");
    assert.match(blocked.message, /Lightroom ist beendet.*Katalogabschluss.*Arbeitsdateien/);
  }
  assert.equal(calls.some(([kind, full]) => ["close", "claim", "bind"].includes(kind) || kind === "usage" && full), false);
  assert.equal(completed, false);
  working = false;
  assert.equal((await gate.ready({ job })).ready, true);
  assert.equal(calls.filter(([kind]) => kind === "bind").length, 1);
  assert.equal(calls.some(([kind]) => ["close", "claim"].includes(kind)), false);
});

test("Neue Katalogarbeitsdatei nach gültiger FN-Bindung sperrt mit genauer Abschlussmeldung", async () => {
  let bound = false;
  const job = { updateRunId: "update-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", phase: "start", freshUsageCapture: true };
  const gate = createLightroomCloseGate({ processes: async () => [],
    usage: async () => ({ ready: true, revision: "proof", catalogs: [{ catalogPath: "catalog.lrcat" }] }),
    stat: async (filename) => {
      if (bound && filename.endsWith("-shm")) return {};
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }, usageRequests: { status: async () => ({ exists: true, ready: true, alreadyRegistered: bound,
      request: { status: bound ? "completed" : "pending" } }),
    bindClosed: async () => { bound = true; } } });
  const blocked = await gate.ready({ job });
  assert.equal(bound, true);
  assert.equal(blocked.ready, false);
  assert.equal(blocked.reason, "lightroom-open");
  assert.match(blocked.message, /Lightroom ist beendet.*Katalogabschluss.*Arbeitsdateien/);
});

test("Unbekannter Prozess-/Dateistand wird nicht als geschlossen behandelt", async () => {
  const gate = createLightroomCloseGate({ processes: async () => { throw new Error("Zugriff verweigert"); } });
  await assert.rejects(gate.status(), /Zugriff verweigert/);
  await assert.rejects(gate.ready(), /Zugriff verweigert/);
});

test("Restart-FN verlangt eine eigene Requestquittung trotz global aktueller Nutzung und prüft abgeschlossene Bindung weiter", async () => {
  let request = { exists: false, ready: false }, preparations = 0;
  const job = { updateRunId: "update-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", phase: "start", freshUsageCapture: true };
  const gate = createLightroomCloseGate({ processes: async () => [], usage: async () => ({ ready: true, revision: "global-current", catalogs: [] }),
    usageRequests: { status: async () => request, prepare: async () => { preparations++; },
      bindClosed: async () => { throw new Error("No incomplete/foreign receipt may be bound"); } } });
  assert.equal((await gate.ready({ job })).ready, false);
  assert.equal(preparations, 1);
  for (const current of [{ exists: true, ready: false, alreadyRegistered: false, request: { status: "completed" } },
    { exists: true, ready: true, alreadyRegistered: false, request: { status: "completed" } }]) {
    request = current;
    assert.equal((await gate.ready({ job: { ...job, phase: "build" } })).ready, false);
  }
  request = { exists: true, ready: true, alreadyRegistered: true, request: { status: "completed" } };
  assert.equal((await gate.ready({ job: { ...job, phase: "build" } })).ready, true);
  request = { exists: true, ready: false, request: { status: "paused", captureError: "SDK-Erfassung abgebrochen" } };
  await assert.rejects(gate.ready({ job }), /SDK-Erfassung abgebrochen/);
});
