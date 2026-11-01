import { check } from "./errors.mjs";

const text = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 1000 && !/[\x00-\x1f\x7f]/.test(value);
const absent = (value) => value === null || value === undefined;
const valid = (condition) => check(condition, 409, "import_journal_drift", "Der Importzustand ist nicht eindeutig durch seine Absichten und Quittungen belegt.");
const states = ["pending", "skipped", "create-intent", "created", "approve-intent", "approved"];

/** Pure durable-state check. Receipts are raw SQL rows, never public UI projections. */
export function assertImportItemIntegrity(input = {}) {
  valid(input && typeof input === "object" && !Array.isArray(input));
  const { plan, items, receipts } = input;
  valid(plan && text(plan.id) && [0, 1, false, true].includes(plan.release_readers) && Array.isArray(items) && Array.isArray(receipts));
  const release = plan.release_readers === 1 || plan.release_readers === true;
  const byId = new Map(), sequences = new Set();
  for (const item of items) {
    valid(item && item.plan_id === plan.id && text(item.id) && !byId.has(item.id) && states.includes(item.state)
      && (absent(item.intent_actor) || text(item.intent_actor)) && (absent(item.expected_revision) || text(item.expected_revision))
      && (absent(item.expected_approval) || text(item.expected_approval)));
    byId.set(item.id, { item, receipts: [] });
  }
  for (const receipt of receipts) {
    valid(receipt && receipt.plan_id === plan.id && Number.isSafeInteger(receipt.sequence) && receipt.sequence > 0
      && !sequences.has(receipt.sequence) && text(receipt.actor_id));
    sequences.add(receipt.sequence);
    if (absent(receipt.object_id)) {
      valid(receipt.operation === "plan" && ["prepared", "complete"].includes(receipt.phase) && absent(receipt.revision));
    } else {
      valid(byId.has(receipt.object_id) && ["create", "approve"].includes(receipt.operation)
        && ["intent", "confirmed", "recovered-confirmed"].includes(receipt.phase));
      byId.get(receipt.object_id).receipts.push(receipt);
    }
  }
  for (const { item, receipts: objectReceipts } of byId.values()) {
    if (["pending", "skipped"].includes(item.state)) {
      valid(absent(item.intent_actor) && objectReceipts.length === 0);
      if (item.state === "pending") valid(absent(item.expected_revision) && absent(item.expected_approval));
      else valid(text(item.expected_revision));
      continue;
    }
    valid(text(item.intent_actor));
    let createIntent = null, creation = null, approveIntent = null, approval = null;
    for (const receipt of objectReceipts.sort((a, b) => a.sequence - b.sequence)) {
      if (receipt.operation === "create") {
        valid(!creation && !approveIntent && !approval);
        if (receipt.phase === "intent") {
          valid(absent(receipt.revision));
          createIntent = receipt;
        } else {
          valid(createIntent && text(receipt.revision)
            && (receipt.phase === "recovered-confirmed" || receipt.actor_id === createIntent.actor_id));
          creation = receipt;
        }
      } else {
        valid(release && creation && receipt.revision === creation.revision && !approval);
        if (receipt.phase === "intent") approveIntent = receipt;
        else {
          if (approveIntent) valid(receipt.phase === "recovered-confirmed" || receipt.actor_id === approveIntent.actor_id);
          else {
            // Existing crash recovery can observe creation already approved. It
            // writes this exact pair instead of inventing an approval intent.
            valid(receipt.phase === "recovered-confirmed" && creation.phase === "recovered-confirmed"
              && receipt.actor_id === creation.actor_id);
          }
          approval = receipt;
        }
      }
    }
    valid(createIntent && createIntent.actor_id === item.intent_actor);
    if (item.state === "create-intent") {
      valid(!creation && !approveIntent && !approval && absent(item.expected_revision) && absent(item.expected_approval));
      continue;
    }
    valid(creation && text(item.expected_revision) && creation.revision === item.expected_revision);
    if (item.state === "created") valid(!approveIntent && !approval && absent(item.expected_approval));
    else if (item.state === "approve-intent") valid(approveIntent && !approval && absent(item.expected_approval));
    else valid(release && approval && item.expected_approval === item.expected_revision);
  }
  return true;
}
