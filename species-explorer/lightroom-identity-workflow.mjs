import path from "node:path";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { openLightroomIdentityJournal } from "./lightroom-identity-journal.mjs";
import { confirmLightroomIdentity, identityPackageStamp, previewLightroomIdentity } from "./lightroom-identity-plan.mjs";
import { identitySnapshotHash, normalizeIdentitySnapshot } from "./lightroom-identity-snapshot.mjs";
import { previewIdentityBlock } from "./lightroom-identity-block.mjs";
import { identityInventoryFromRead } from "./lightroom-identity-inventory.mjs";

const COMMANDS = new Set(["plan", "confirm", "prepare", "list", "read", "checkpoint",
  "recovery-preview", "recovery-confirm", "block-preview", "block-confirm", "undo-preview", "undo-prepare"]);
export const isIdentityWorkflowCommand = (command) => command.startsWith("photo-identity-")
  && COMMANDS.has(command.slice("photo-identity-".length));

function planningRequest(request) {
  if (!Array.isArray(request.snapshots) || !request.snapshots.length || request.snapshots.length > 10000) {
    throw new Error("Die vollständigen Schnappschüsse der ausgewählten Fotos fehlen.");
  }
  const photos = request.snapshots.map((value) => {
    const snapshot = normalizeIdentitySnapshot(value);
    return { photoUuid: snapshot.photoUuid, masterTaxonId: snapshot.values.masterTaxonId,
      germanName: snapshot.values.germanName, scientificName: snapshot.values.scientificName,
      referenceImage: snapshot.values.referenceImage, snapshotHash: identitySnapshotHash(snapshot) };
  });
  return { catalogKey: request.catalogKey, photos, choices: request.choices,
    favoriteInventory: request.favoriteInventory, favoriteDecisions: request.favoriteDecisions,
    token: request.token, confirmed: request.confirmed };
}

// File-helper bridge. Neither a catalog filename nor a request-supplied journal
// path is opened. Only the separate managed journal below the configured search
// root is writable. No command here writes photos or creates Lightroom keywords.
export function createLightroomIdentityWorkflow({ searchRoot, openStore = openLightroomSearchStore }) {
  const journalRoot = path.join(path.resolve(searchRoot), "identity-journals");
  async function withJournal(request, action) {
    const journal = await openLightroomIdentityJournal({ journalRoot, catalogKey: request.catalogKey });
    try { return action(journal); } finally { journal.close(); }
  }
  async function withStore(action) {
    // Reopen the active pointer for EVERY identity operation, also in a long-lived
    // stdio helper. Never confirm against its previously cached search connection.
    const store = await openStore({ searchRoot, slot: "active" });
    try { return await action(store); } finally { store.close(); }
  }
  function requireIdle(request) {
    if (request.writerIdle !== true) throw new Error("Zuerst den Lightroom-Schreibvorgang beenden oder pausieren und den Fotostand neu lesen.");
  }
  return {
    async handle(request) {
      if (!isIdentityWorkflowCommand(request.command)) throw new Error("Unbekannte Artänderungsaktion.");
      if (request.inventoryRows !== undefined) request = { ...request,
        favoriteInventory: identityInventoryFromRead(request.inventoryRows, request.observed) };
      const command = request.command.slice("photo-identity-".length);
      if (["plan", "confirm", "prepare"].includes(command)) {
        return withStore(async (store) => {
          const input = planningRequest(request);
          const plan = command === "plan" ? previewLightroomIdentity(store, input) : confirmLightroomIdentity(store, input);
          if (command === "plan") return plan;
          if (command === "confirm") return { plan, targets: [...new Set(plan.transfers.map((photo) => photo.targetMasterTaxonId))]
            .map((id) => store.taxon(id)), changesPhotos: false };
          requireIdle(request);
          // confirmLightroomIdentity rechecks package, input hashes and explicit
          // choices BEFORE the journal may be created. Do not accept a client plan.
          return withJournal(request, (journal) => ({ run: journal.prepare({ runId: request.runId, plan,
            changes: request.changes, confirmed: true }), journalPrepared: true, changesPhotos: false }));
        });
      }
      if (["block-preview", "block-confirm"].includes(command)) {
        requireIdle(request);
        const preview = (journal, packageStamp) => {
          const block = previewIdentityBlock(journal.read(request.runId), { ...request, packageStamp });
          if (command === "block-confirm" && (request.confirmed !== true || request.token !== block.token || !block.ready)) {
            throw new Error("Der Schreibblock benötigt eine aktuelle Vorschau und Bestätigung.");
          }
          return block;
        };
        // Undo is tied to exact historical snapshots and existing keyword IDs,
        // not to availability of today's taxonomy package.
        return request.direction === "undo" ? withJournal(request, (journal) => preview(journal, null))
          : withStore((store) => withJournal(request, (journal) => preview(journal, identityPackageStamp(store))));
      }
      if (!["list", "read"].includes(command)) requireIdle(request);
      return withJournal(request, (journal) => {
        if (command === "list") return { runs: journal.list(), changesPhotos: false };
        if (command === "read") return { run: journal.read(request.runId), changesPhotos: false };
        if (command === "checkpoint") return { run: journal.checkpoint(request.runId, request.observed, request.mode), changesPhotos: false };
        if (command === "recovery-preview") return journal.recoveryPreview(request.runId, request.observed, request.abandonPending);
        if (command === "recovery-confirm") return journal.confirmRecovery(request);
        if (command === "undo-preview") return journal.undoPreview(request.runId, request.observed, request.availableKeywords, request.favoriteInventory);
        return journal.prepareUndo(request);
      });
    },
  };
}
