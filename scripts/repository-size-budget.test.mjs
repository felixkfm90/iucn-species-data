import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "./test-temp.mjs";
import {
  MIB,
  SIZE_POLICY,
  calculateRepositorySizeBudget,
  auditRepositorySize,
} from "./repository-size-budget.mjs";

test("Größenbudget wächst pro Art und bleibt absolut begrenzt", () => {
  assert.equal(calculateRepositorySizeBudget(0), SIZE_POLICY.baseBytes);
  assert.equal(calculateRepositorySizeBudget(50), 145 * MIB);
  assert.equal(calculateRepositorySizeBudget(1_000), SIZE_POLICY.absoluteTreeLimitBytes);
});

test("Lokale Daten, eigene Tempdateien und Speicherkonfiguration zählen nicht zum Veröffentlichungscode", (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "size-local-data-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "species_list.json"), "[]");
  fs.writeFileSync(path.join(root, "storage-path.json"), JSON.stringify({ dataRoot: "Daten" }));
  for (const directory of ["Daten/taxonomy", "temp/tests", "species-explorer/temp", "species-explorer/Daten"]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, directory, "large.sqlite"), Buffer.alloc(4096));
  }
  assert.equal(auditRepositorySize(root).treeBytes, 2);
});

test("Größenbudget lässt sich mit eigener Richtlinie berechnen", () => {
  const policy = {
    baseBytes: 10,
    perSpeciesBytes: 5,
    absoluteTreeLimitBytes: 25,
  };
  assert.equal(calculateRepositorySizeBudget(2, policy), 20);
  assert.equal(calculateRepositorySizeBudget(4, policy), 25);
});
