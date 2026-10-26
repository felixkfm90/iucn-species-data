import { assertCatalogUsageRevision, catalogProtectedMasterIds, catalogUsageStatus } from "./lightroom-catalog-usage.mjs";
import { CLASSIFICATION_RETENTION_POLICY, assertClassificationRetentions } from "./taxonomy-classification-retention.mjs";
import { normalizeProtectedMasterIds, protectedMasterIdsRevision } from "./taxonomy-master-inputs.mjs";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";

function checkedBinding(binding) {
  if (!binding || binding.policy !== CLASSIFICATION_RETENTION_POLICY
      || !/^[a-f0-9]{64}$/.test(binding.usageRevision || "")) {
    throw new Error("Die zurückbehaltene Klassifikation benötigt die bestätigte Regel und eine gebundene vollständige FN-Nutzungsrevision.");
  }
  return { policy: binding.policy, usageRevision: binding.usageRevision };
}

// Mutation boundary only. Ordinary searches and status reads never enter this gate.
// Existing receipts remain immutable; only their current, closed file binding is checked.
export async function assertClassificationRetentionUsage(taxonomyRoot, binding, { full = true } = {}) {
  if (binding == null) return null;
  const checked = checkedBinding(binding);
  await assertCatalogUsageRevision(taxonomyRoot, checked.usageRevision, { full });
  const protectedIds = await catalogProtectedMasterIds(taxonomyRoot);
  const protectionRevision = protectedMasterIdsRevision(protectedIds);
  if (binding.protectedMasterIdsRevision !== undefined && binding.protectedMasterIdsRevision !== protectionRevision) {
    throw new Error("Die FN-Schutzmenge wurde seit der zurückbehaltenen Klassifikation verändert. Bitte erneut prüfen und aufbauen.");
  }
  if (binding.retainedMasterTaxonIds !== undefined) {
    const retained = normalizeProtectedMasterIds(binding.retainedMasterTaxonIds);
    if (JSON.stringify(retained) !== JSON.stringify(binding.retainedMasterTaxonIds)
        || !retained.length || retained.length !== binding.total) {
      throw new Error("Die gebundene Menge zurückbehaltener Klassifikationen ist unvollständig oder verändert.");
    }
    const protectedSet = new Set(protectedIds);
    if (retained.some((id) => protectedSet.has(id))) {
      throw new Error("Eine zurückbehaltene Klassifikation ist inzwischen in Lightroom zugewiesen. Eine neue fachliche Prüfung ist erforderlich.");
    }
  }
  return { ...checked, protectedMasterIdsRevision: protectionRevision };
}

// Rollbacks must find markers even if their manifest summary was removed before
// the operation began. Candidate publication already performs this inspection.
export async function assertClassificationRetentionMaster(databasePath, manifest) {
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return assertClassificationRetentions(database, manifest?.classificationRetentions, {
      baseVersion: manifest?.sourceMasterVersion, registryRevision: manifest?.inputRevisions?.identities,
      sourceRevision: manifest?.inputRevisions?.identitySources, inputRevision: manifest?.inputRevisions?.identityInputs,
      protectedMasterIdsRevision: manifest?.inputRevisions?.protectedMasterIds,
    });
  } finally { database.close(); }
}

// A missing fresh negative proof never becomes an empty usage set. The actual
// candidate may retain only after the core guard has checked all other protections.
export async function readClassificationRetentionBuildPolicy(taxonomyRoot, registry) {
  if (!registry?.events?.some((event) => event.type === "classification")) return null;
  const usage = await catalogUsageStatus(taxonomyRoot);
  // A normal matching carry remains usable without a negative FN proof. Only
  // the optional retention path is unavailable; its core guard stays strict.
  if (!usage.ready) return null;
  const binding = { policy: CLASSIFICATION_RETENTION_POLICY, usageRevision: usage.revision };
  await assertClassificationRetentionUsage(taxonomyRoot, binding);
  return binding;
}
