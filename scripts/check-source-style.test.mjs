import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "./test-temp.mjs";
import { checkTextStyle, repositoryTextFiles } from "./check-source-style.mjs";

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

test("Quelltextprüfung lässt lokale Artanlagebelege aus und prüft den Implementierungscode", (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "style-creation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "species-explorer", "creation-sessions"), { recursive: true });
  fs.writeFileSync(path.join(root, "species-explorer", "creation-sessions", "receipt.json"), "{}\n");
  fs.writeFileSync(path.join(root, "species-explorer", "species-creation-session.mjs"), "export const version = 1;\n");
  assert.deepEqual(repositoryTextFiles(root).map((file) => file.split(path.sep).join("/")),
    ["species-explorer/species-creation-session.mjs"]);
});
