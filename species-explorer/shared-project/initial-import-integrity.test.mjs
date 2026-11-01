import assert from "node:assert/strict";
import test from "node:test";
import { ProjectError } from "./errors.mjs";
import { assertImportItemIntegrity } from "./initial-import-integrity.mjs";

const drift = (error) => error instanceof ProjectError && error.status === 409 && error.code === "import_journal_drift";
function fixture(state = "pending", { release = true, creator = "first-admin" } = {}) {
  const plan = { id: "synthetic-plan", release_readers: release ? 1 : 0 };
  const item = { plan_id: plan.id, id: "fixture-art", state, expected_revision: null, expected_approval: null, intent_actor: null };
  const receipts = [{ sequence: 1, plan_id: plan.id, object_id: null, operation: "plan", phase: "prepared", revision: null, actor_id: creator }];
  const add = (operation, phase, revision = null, actor = creator) => {
    const receipt = { sequence: receipts.length + 1, plan_id: plan.id, object_id: item.id, operation, phase, revision, actor_id: actor };
    receipts.push(receipt); return receipt;
  };
  if (state === "skipped") item.expected_revision = "existing-revision";
  if (["create-intent", "created", "approve-intent", "approved"].includes(state)) {
    item.intent_actor = creator; add("create", "intent");
  }
  if (["created", "approve-intent", "approved"].includes(state)) {
    item.expected_revision = "created-revision"; add("create", "confirmed", item.expected_revision);
  }
  if (["approve-intent", "approved"].includes(state)) add("approve", "intent", item.expected_revision);
  if (state === "approved") {
    item.expected_approval = item.expected_revision; add("approve", "confirmed", item.expected_revision);
  }
  return { plan, items: [item], receipts, item, add };
}
const input = ({ plan, items, receipts }) => ({ plan, items, receipts });

test("each legitimate import item state has a consistent durable receipt chain without UUID assumptions or mutation", () => {
  for (const state of ["pending", "skipped", "create-intent", "created", "approve-intent", "approved"]) {
    const f = fixture(state), value = input(f), before = structuredClone(value);
    assert.equal(assertImportItemIntegrity(value), true);
    assert.deepEqual(value, before);
  }
  const skipped = fixture("skipped"); skipped.item.expected_approval = "older-approved-version";
  assert.equal(assertImportItemIntegrity(input(skipped)), true);
  assert.equal(assertImportItemIntegrity({ plan: { id: "unused-plan", release_readers: 0 }, items: [], receipts: [] }), true);
});

test("changing a skipped existing item to created or approved without import receipts is rejected", () => {
  for (const state of ["created", "approved"]) {
    const f = fixture("skipped"); f.item.state = state; f.item.intent_actor = "first-admin";
    if (state === "approved") f.item.expected_approval = f.item.expected_revision;
    assert.throws(() => assertImportItemIntegrity(input(f)), drift);
  }
});

test("pending and skipped items cannot contain object write receipts or an import actor", () => {
  for (const state of ["pending", "skipped"]) {
    const actor = fixture(state); actor.item.intent_actor = "unexpected-admin";
    assert.throws(() => assertImportItemIntegrity(input(actor)), drift);
    const receipt = fixture(state); receipt.add("create", "intent");
    assert.throws(() => assertImportItemIntegrity(input(receipt)), drift);
  }
  const pending = fixture(); pending.item.expected_revision = "existing-revision";
  assert.throws(() => assertImportItemIntegrity(input(pending)), drift);
  const pendingApproval = fixture(); pendingApproval.item.expected_approval = "existing-revision";
  assert.throws(() => assertImportItemIntegrity(input(pendingApproval)), drift);
  const skipped = fixture("skipped"); skipped.item.expected_revision = null;
  assert.throws(() => assertImportItemIntegrity(input(skipped)), drift);
});

test("import states cannot advance without each required intent and confirmation", () => {
  for (const [state, operation, phase] of [
    ["create-intent", "create", "intent"], ["created", "create", "intent"], ["created", "create", "confirmed"],
    ["approve-intent", "create", "confirmed"], ["approve-intent", "approve", "intent"],
    ["approved", "approve", "intent"], ["approved", "approve", "confirmed"],
  ]) {
    const f = fixture(state); f.receipts = f.receipts.filter((receipt) => receipt.operation !== operation || receipt.phase !== phase);
    assert.throws(() => assertImportItemIntegrity(input(f)), drift);
  }
  const premature = fixture("create-intent"); premature.item.expected_revision = "not-confirmed";
  assert.throws(() => assertImportItemIntegrity(input(premature)), drift);
  const prematureApproval = fixture("create-intent"); prematureApproval.item.expected_approval = "not-confirmed";
  assert.throws(() => assertImportItemIntegrity(input(prematureApproval)), drift);
  const completed = fixture("approved"); completed.item.state = "created";
  assert.throws(() => assertImportItemIntegrity(input(completed)), drift);
});

test("receipt revisions, creator binding, order and release decision cannot be substituted", () => {
  const mutations = [
    (f) => { f.item.intent_actor = "different-creator"; },
    (f) => { f.receipts[1].actor_id = "different-creator"; },
    (f) => { f.receipts[2].actor_id = "different-creator"; },
    (f) => { f.receipts[2].revision = "different-created-revision"; },
    (f) => { f.receipts[3].revision = "different-approval-intent"; },
    (f) => { f.receipts[4].revision = "different-approved-revision"; },
    (f) => { f.item.expected_approval = "different-approved-revision"; },
    (f) => { f.plan.release_readers = 0; },
    (f) => { f.receipts[1].sequence = 100; },
    (f) => { f.receipts[4].sequence = f.receipts[3].sequence; },
    (f) => { f.receipts[1].revision = "intent-must-not-already-confirm"; },
    (f) => { f.receipts[4].actor_id = "not-the-approval-actor"; },
  ];
  for (const mutate of mutations) {
    const f = fixture("approved"); mutate(f);
    assert.throws(() => assertImportItemIntegrity(input(f)), drift);
  }
});

test("legitimate retries and reacquisition keep the original creator while recovered confirmation may use another administrator", () => {
  const f = fixture("approved"), firstIntent = { ...f.receipts[1], sequence: 2, actor_id: "earlier-attempt-admin" };
  f.receipts.slice(1).forEach((receipt) => { receipt.sequence++; }); f.receipts.splice(1, 0, firstIntent);
  f.receipts.find((receipt) => receipt.operation === "create" && receipt.phase === "confirmed").phase = "recovered-confirmed";
  f.receipts.find((receipt) => receipt.operation === "create" && receipt.phase === "recovered-confirmed").actor_id = "recovery-admin";
  const approveIntent = f.receipts.find((receipt) => receipt.operation === "approve" && receipt.phase === "intent");
  const approveConfirmation = f.receipts.find((receipt) => receipt.operation === "approve" && receipt.phase === "confirmed");
  approveConfirmation.sequence++; approveConfirmation.phase = "recovered-confirmed"; approveConfirmation.actor_id = "next-recovery-admin";
  f.receipts.push({ ...approveIntent, sequence: approveIntent.sequence + 1, actor_id: "next-recovery-admin" });
  assert.equal(assertImportItemIntegrity(input(f)), true);
  assert.equal(f.item.intent_actor, "first-admin");
  f.receipts.reverse(); assert.equal(assertImportItemIntegrity(input(f)), true);
});

test("the existing paired creation and approval recovery is allowed only for the same recovery administrator and revision", () => {
  function paired() {
    const f = fixture("approved"); f.receipts = f.receipts.filter((receipt) => receipt.operation !== "approve" || receipt.phase !== "intent");
    f.receipts.filter((receipt) => receipt.phase === "confirmed").forEach((receipt) => { receipt.phase = "recovered-confirmed"; receipt.actor_id = "recovery-admin"; });
    return f;
  }
  assert.equal(assertImportItemIntegrity(input(paired())), true);
  for (const mutate of [
    (f) => { f.receipts.at(-1).actor_id = "other-admin"; },
    (f) => { f.receipts.at(-1).revision = "other-revision"; },
    (f) => { f.receipts[2].phase = "confirmed"; },
    (f) => { f.receipts.at(-1).phase = "confirmed"; },
    (f) => { f.plan.release_readers = 0; },
    (f) => { f.receipts[2].sequence = 100; },
  ]) {
    const f = paired(); mutate(f); assert.throws(() => assertImportItemIntegrity(input(f)), drift);
  }
});

test("foreign, unknown and malformed receipt or item identities fail with the dedicated journal error", () => {
  for (const mutate of [
    (f) => { f.item.plan_id = "foreign-plan"; },
    (f) => { f.items.push(structuredClone(f.item)); },
    (f) => { f.item.state = "unknown-state"; },
    (f) => { f.receipts[1].plan_id = "foreign-plan"; },
    (f) => { f.receipts[1].object_id = "unknown-art"; },
    (f) => { f.receipts[1].operation = "unknown-operation"; },
    (f) => { f.receipts[1].phase = "unknown-phase"; },
    (f) => { f.receipts[1].actor_id = ""; },
    (f) => { f.receipts[1].sequence = -1; },
    (f) => { f.receipts[1].object_id = null; },
    (f) => { f.receipts[0].operation = "create"; },
    (f) => { f.item.expected_revision = 7; },
  ]) {
    const f = fixture("created"); mutate(f); assert.throws(() => assertImportItemIntegrity(input(f)), drift);
  }
  for (const value of [undefined, null, {}, [], { plan: {}, items: [], receipts: [] }]) assert.throws(() => assertImportItemIntegrity(value), drift);
});
