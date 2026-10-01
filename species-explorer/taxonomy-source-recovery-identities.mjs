import { recoveryDigest } from "./taxonomy-source-recovery-plan.mjs";
import { identityRegistryRevision, validateIdentityRegistry } from "./taxonomy-identity-registry.mjs";
import { identityBuildSourceRevision } from "./taxonomy-identity-build.mjs";
import { taxonomyIdentityInputRevision } from "./taxonomy-master-candidate.mjs";

// Only the confirmed source-recovery plan may create this technical event.
// The ordinary split/merge UI cannot select it, and Lightroom keeps its normal
// explicit photo-choice/confirmation path for the historical replacement ID.
export function sourceRecoveryIdentityRegistry({ plan, registry, repairedVersion, releases,
  projectTaxa = [], corrections = [], timestamp }) {
  const { revision, canPrepare, requiresConfirmation, changesPhotos, activatesDatabase, ...body } = plan;
  if (!canPrepare || revision !== recoveryDigest(body) || !requiresConfirmation || changesPhotos || activatesDatabase
      || !Number.isFinite(Date.parse(timestamp)) || repairedVersion !== `recovery-${revision.slice(0, 24)}`) {
    throw new Error("Quellenreparatur benötigt den unveränderten bestätigten Reparaturplan.");
  }
  let result = validateIdentityRegistry(registry);
  for (const row of plan.rows.filter((entry) => entry.replacementId)) {
    const event = {
      type: "source-repair", baseVersion: plan.binding.publication.active.masterVersion,
      sourceRevision: identityBuildSourceRevision(releases),
      inputRevision: taxonomyIdentityInputRevision({ projectTaxa, corrections }),
      registryRevision: identityRegistryRevision(result), confirmedAt: timestamp,
      reason: "Technische Quellenreparatur: Das geleerte Reich derselben iNaturalist-ID wird aus dem belegten Altstand ergänzt. Die ursprüngliche Master-ID wird wiederhergestellt; die Ersatz-ID bleibt historisch erhalten.",
      sources: [{ masterTaxonId: row.replacementId, scientificName: row.scientificName, rank: row.rank, kingdom: "" }],
      targets: [{ masterTaxonId: row.originalId, scientificName: row.scientificName, rank: row.rank, kingdom: row.kingdom }],
      evidence: [plan.binding.options.currentVersion, repairedVersion].map((providerVersion) => ({
        provider: "inaturalist", providerVersion, providerRecordId: row.providerRecordId })),
      sourceRepair: { provider: "inaturalist", providerRecordId: row.providerRecordId,
        previousVersion: plan.binding.options.previousVersion, currentVersion: plan.binding.options.currentVersion,
        repairedVersion, recoveryRevision: revision, policy: plan.replacementPolicy,
        previousRecordHash: row.previousRecordHash, currentRecordHash: row.currentRecordHash, repairedRecordHash: row.repairedRecordHash },
    };
    result = validateIdentityRegistry({ schemaVersion: 1, events: [...result.events, { ...event, eventId: recoveryDigest(event) }] });
  }
  return result;
}
