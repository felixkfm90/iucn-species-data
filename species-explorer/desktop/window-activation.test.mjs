import assert from "node:assert/strict";
import test from "node:test";

import { activateExplorerWindow } from "./window-activation.mjs";

test("erneuter Start stellt das vorhandene Fenster wieder her und aktiviert es", () => {
  const calls = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push("restore"),
    isVisible: () => false,
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
    moveTop: () => calls.push("moveTop"),
  };
  assert.equal(activateExplorerWindow(window), true);
  assert.deepEqual(calls, ["restore", "show", "focus", "moveTop"]);
});

test("zerstörte oder noch nicht erzeugte Fenster werden sicher ignoriert", () => {
  assert.equal(activateExplorerWindow(null), false);
  assert.equal(activateExplorerWindow({ isDestroyed: () => true }), false);
});
