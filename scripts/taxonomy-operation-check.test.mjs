import assert from "node:assert/strict";
import { test } from "node:test";
import { runOperationalCheck } from "./taxonomy-operation-check.mjs";

test("Betriebsprüfung verweigert unbeschränkte und zu kleine Testbestände", async () => {
  for (const count of [0, 1199, 20001, NaN, 1200.5]) await assert.rejects(runOperationalCheck({ count }), /Testarten/);
});

test("Echter Workerabbruch, Fortsetzung, Delta-Paket und Rollback bleiben mit offenen Lesern konsistent", async () => {
  const result = await runOperationalCheck({ count: 1200 });
  assert.ok(result.checkpoint >= 500);
  assert.ok(result.reusedTaxa > 0);
  for (const key of ["packageEquality", "oldReadersPreserved", "namePreferencePreserved", "rollbackVerified"]) {
    assert.equal(result[key], true);
  }
});
