import assert from "node:assert/strict";
import test from "node:test";
import { observeSquarespaceAdminTarget } from "./squarespace-admin-target.mjs";

const parentPath = "/wildlife/heimische-tierwelt";
const targetPath = parentPath + "/pruefart";
const parent = parentPath.slice(1), target = targetPath.slice(1);

function fixture({ occupied = false, replaced = false, stale = false, onInsert, open = false, movingSearch = false } = {}) {
  let query = "", previous = "", focused = false, reads = 0, epoch = 100, openReads = 0;
  const events = [];
  function state() {
    const renderedQuery = stale && query === target ? previous : query;
    const mode = !open ? "closed" : !renderedQuery ? "empty" : renderedQuery === parent || occupied ? "results" : "no-results";
    return { epoch, inputId: ":r8:", mode, query };
  }
  return { events, observe: (signal, path = targetPath) => observeSquarespaceAdminTarget(path, {
    signal, waitMs: 1, timeoutMs: 65,
    async read({ operation, query: required, expected, reveal }) {
      if (required !== query) return null;
      if (operation === "search-state") {
        if (query === target) reads++;
        return replaced && reads > 0 ? { ...state(), epoch: epoch + 1 } : state();
      }
      assert.deepEqual(expected, state());
      if (operation === "search-focus") {
        assert.equal(open, true);
        focused = true;
        return true;
      }
      if (operation === "search-open") {
        if (open) return null;
        if (!movingSearch) return { action: "open" };
        if (++openReads === 2) { assert.equal(reveal, false); return null; }
        return { action: "open", x: openReads > 2 ? 2 : 1 };
      }
      if (operation === "search-close") return open ? { action: "close" } : null;
      throw new Error(`Unexpected operation: ${operation}`);
    },
    click(control) {
      assert.ok(control);
      if (movingSearch && control.action === "open") assert.equal(control.x, 2);
      events.push(control.action);
      open = control.action === "open";
      if (!open) query = "";
      return true;
    },
    insertText(text) {
      assert.equal(focused, true);
      focused = false;
      previous = query;
      query = text;
      events.push(text);
      onInsert?.();
    },
  }) };
}

test("zwei Wechsel vom Kontrolltreffer zur leeren Zielsuche ergeben nur einen Admin-Teilbefund", async () => {
  for (const movingSearch of [false, true]) {
    const f = fixture({ movingSearch });
    assert.deepEqual(await f.observe(), { path: targetPath, parentPath });
    assert.deepEqual(f.events, ["open", parent, target, parent, target, "close"]);
  }
});

test("Treffer, nachlaufende Trefferanzeige, geändertes Dokument und bereits geöffnete Suche ergeben keine freie Adresse", async () => {
  for (const options of [{ occupied: true }, { stale: true }, { replaced: true }, { open: true }]) {
    const f = fixture(options);
    await assert.rejects(f.observe(), { code: "SQUARESPACE_TARGET_NOT_CONFIRMED" });
    assert.deepEqual(f.events, options.open ? [] : ["open", parent, target, ...(options.replaced ? [] : ["close"])]);
  }
});

test("Abbruch belässt die Steuerung bei der Person und ein falscher Zielbereich erzeugt keine Eingabe", async () => {
  const controller = new AbortController(), cause = new Error("abgebrochen");
  const f = fixture({ onInsert: () => controller.abort(cause) });
  await assert.rejects(f.observe(controller.signal), error => error === cause);
  assert.deepEqual(f.events, ["open", parent]);
  const bad = fixture();
  await assert.rejects(bad.observe(undefined, "/andere-seite"), { code: "cms_dispatch_binding_invalid" });
  assert.deepEqual(bad.events, []);
});
