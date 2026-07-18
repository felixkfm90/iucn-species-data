import assert from "node:assert/strict";
import test from "node:test";
import { checkTextStyle } from "./check-source-style.mjs";

test("Stilprüfung erkennt BOM, Tabs, Zeilenend-Leerraum und fehlenden Abschluss", () => {
  const issues = checkTextStyle("example.mjs", "\ufeffconst\tvalue = 1;  ");
  assert.ok(issues.some((issue) => issue.includes("BOM")));
  assert.ok(issues.some((issue) => issue.includes("Tabulator")));
  assert.ok(issues.some((issue) => issue.includes("Leerraum")));
  assert.ok(issues.some((issue) => issue.includes("Zeilenumbruch")));
});

test("Stilprüfung akzeptiert sauberen Quelltext", () => {
  assert.deepEqual(checkTextStyle("example.mjs", "const value = 1;\n"), []);
});
