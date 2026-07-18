import assert from "node:assert/strict";
import test from "node:test";
import {
  MIB,
  SIZE_POLICY,
  calculateRepositorySizeBudget,
} from "./repository-size-budget.mjs";

test("Größenbudget wächst pro Art und bleibt absolut begrenzt", () => {
  assert.equal(calculateRepositorySizeBudget(0), SIZE_POLICY.baseBytes);
  assert.equal(calculateRepositorySizeBudget(50), 145 * MIB);
  assert.equal(calculateRepositorySizeBudget(1_000), SIZE_POLICY.absoluteTreeLimitBytes);
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
