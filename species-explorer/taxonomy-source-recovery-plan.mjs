import crypto from "node:crypto";
import { mergePartialProviderRecord } from "./taxonomy-partial-record.mjs";
import { normalizeProviderSliceRecord } from "./taxonomy-master-slices.mjs";
import { createStableMasterTaxonId } from "./taxonomy-master-model.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

export const recoveryDigest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalized = (value) => normalizeTaxonomySearchTerm(String(value || ""));
const eligible = (row) => row.versionChangeState !== "removed" && (row.selectedForMaster
  || row.relevanceReasons.some((reason) => reason !== "searched-taxon"));
const identity = (row) => ({ scientificName: row.scientificName, rank: row.rank, kingdom: row.kingdom || "" });

// No matching by name: the reader supplies old master rows with their exact,
// unique provider assertion and all current owners of that same provider ID.
export function planSourceRecovery({ affected, previous, current, binding }) {
  const oldRows = new Map(), newRows = new Map();
  const wanted = new Set(affected.map((row) => row.providerRecordId));
  for (const [slice, target] of [[previous, oldRows], [current, newRows]]) {
    const seen = new Set();
    for (const row of slice.records) {
      if (!row.providerRecordId || seen.has(row.providerRecordId)) throw new Error("Quellenstand enthält fehlende oder doppelte Anbieter-IDs.");
      seen.add(row.providerRecordId);
      if (wanted.has(row.providerRecordId)) target.set(row.providerRecordId,
        normalizeProviderSliceRecord(row, { provider: slice.manifest.provider, retrievedAt: slice.manifest.retrievedAt }));
    }
  }
  if (affected.length > 2000 || wanted.size !== affected.length) throw new Error("Reparaturumfang ist zu groß oder nicht eindeutig an Anbieter-IDs gebunden.");
  const rows = [], blockers = [];
  for (const item of affected) {
    try {
      const before = oldRows.get(item.providerRecordId), after = newRows.get(item.providerRecordId);
      if (!before || !after || !eligible(before) || after.versionChangeState === "removed") {
        throw new Error("Kein beidseitiger lebender Quellenbeleg; entfernte Arten werden nicht wiederhergestellt.");
      }
      if (item.lifecycleState !== "active" || before.provider !== "inaturalist" || before.rank !== "species"
          || item.protectedHistory
          || createStableMasterTaxonId(before) !== item.masterTaxonId
          || normalized(before.scientificName) !== normalized(item.scientificName)
          || normalized(before.kingdom) !== normalized(item.kingdom) || before.rank !== item.rank) {
        throw new Error("Der alte Quellenbeleg reproduziert die ursprüngliche Masteridentität nicht eindeutig.");
      }
      const merged = mergePartialProviderRecord(before, after);
      const repaired = normalizeProviderSliceRecord({ ...merged.record, versionChangeState: "changed" });
      if (!eligible(repaired) || createStableMasterTaxonId(repaired) !== item.masterTaxonId) {
        throw new Error("Die Vereinigung stellt die ursprüngliche Aufnahme/Identität nicht her.");
      }
      const owners = item.currentOwners;
      if (owners.length > 1) throw new Error("Die Anbieter-ID gehört aktuell zu mehreren Masteridentitäten.");
      const owner = owners[0];
      if (owner && (owner.lifecycleState !== "active" || owner.kingdom || after.kingdom
          || normalized(owner.scientificName) !== normalized(before.scientificName)
          || owner.rank !== before.rank || owner.masterTaxonId !== createStableMasterTaxonId(after))) {
        throw new Error("Die aktuelle ID-Abweichung ist nicht ausschließlich durch das geleerte Reich erklärt.");
      }
      if (owner && (owner.projects || owner.manualDecisions || owner.foreignEvidence || owner.identityEvent)) {
        throw new Error("Die Ersatz-ID besitzt zusätzliche Verknüpfungen oder Entscheidungen und benötigt eine gesonderte Prüfung.");
      }
      if (!owner && eligible(after)) throw new Error("Die fehlende Aufnahme ist nicht durch verlorene Aufnahme-Merkmale erklärt.");
      rows.push({ providerRecordId: item.providerRecordId, originalId: item.masterTaxonId,
        ...identity(before), kind: owner ? "empty-kingdom-id" : "lost-selection",
        replacementId: owner?.masterTaxonId || null, retainedFields: merged.retainedFields,
        previousRecordHash: recoveryDigest(before), currentRecordHash: recoveryDigest(after),
        repairedRecordHash: recoveryDigest(repaired), repaired });
    } catch (error) {
      blockers.push({ originalId: item.masterTaxonId, scientificName: item.scientificName, reason: error.message });
    }
  }
  rows.sort((a, b) => a.originalId.localeCompare(b.originalId));
  const body = { schemaVersion: 1, kind: "partial-source-recovery", binding, rows, blockers,
    replacementPolicy: "preserve-history-no-photo-migration" };
  return { ...body, revision: recoveryDigest(body), canPrepare: rows.length > 0 && blockers.length === 0,
    requiresConfirmation: true, changesPhotos: false, activatesDatabase: false };
}

export function recoverySummary(plan) {
  return { revision: plan.revision, canPrepare: plan.canPrepare, requiresConfirmation: true,
    changesPhotos: false, activatesDatabase: false, count: plan.rows.length, blockers: plan.blockers,
    selectionCount: plan.rows.filter((row) => row.kind === "lost-selection").length,
    identityCases: plan.rows.filter((row) => row.replacementId).map(({ repaired, ...row }) => row),
    replacementPolicy: plan.replacementPolicy,
    message: "Nur separaten Reparaturentwurf vorbereiten. Ursprüngliche IDs rekonstruieren; Ersatz-IDs als ausdrücklich offene Historienfälle erhalten. Kein Quellenwechsel, Datenbankaufbau oder Fotoabgleich." };
}
