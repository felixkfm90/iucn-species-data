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

test("Unbekannter Prozess-/Dateistand wird nicht als geschlossen behandelt", async () => {
  const gate = createLightroomCloseGate({ processes: async () => { throw new Error("Zugriff verweigert"); } });
  await assert.rejects(gate.status(), /Zugriff verweigert/);
  await assert.rejects(gate.ready(), /Zugriff verweigert/);
});
