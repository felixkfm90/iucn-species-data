import { classificationReviewCase, assertMatchingClassificationCase } from "./taxonomy-classification-review.mjs";
import { taxonIdentityKey } from "./taxonomy-identity-registry.mjs";

const live = (group) => (group?.records || []).filter((record) => record.versionChangeState !== "removed");

export function validateNewClassification({ event, previousState, groups, releases, baseVersion }) {
  const proof = assertMatchingClassificationCase(event.classificationCase);
  const source = event.sources[0], old = previousState.taxa.get(source.masterTaxonId);
  if (old?.lifecycle_state !== "active" || old.reference_state !== "reference-gap") {
    throw new Error("Die bestätigte Klassifikation gehört nicht mehr zu einer aktiven Referenzlücke.");
  }
  const target = groups.get(taxonIdentityKey(event.targets[0]));
  // target.colRecords is regenerated from the actual inputs, never copied from
  // the review as evidence. Only the scientific identity tuple is supplied.
  const regenerated = classificationReviewCase({ sources: [{ ...source, evidence: previousState.evidenceFor(source.masterTaxonId) }],
    records: live(target).filter((record) => record.provider === "catalogue-of-life"),
    target: { scientificName: target?.scientificName, rank: target?.rank, kingdom: target?.kingdom },
    baseVersion, colVersion: releases.find((release) => release.provider === "catalogue-of-life")?.providerVersion });
  if (regenerated.revision !== proof.revision) throw new Error("Die Quellenbeziehung der vorgemerkten Klassifikation hat sich geändert. Bitte erneut prüfen.");
}

// Move the confirmed species group, not the provider's raw kingdom assertion.
// Subsequent updates must still have a unique matching provider link. An absent
// or contradictory link is never treated as authorization for a new identity.
export function carryClassificationGroups({ state, groups }) {
  const locations = new Map();
  if (!state.classifications.size) return;
  for (const group of groups.values()) for (const record of live(group)) {
    if (record.provider !== "inaturalist") continue;
    const keys = locations.get(record.providerRecordId) || new Set();
    keys.add(group.key);
    locations.set(record.providerRecordId, keys);
  }
  for (const [id, events] of state.classifications) {
    const current = state.current.get(id);
    if (!current) continue; // A later explicit split/merge retired this ID.
    const event = events.at(-1), proof = assertMatchingClassificationCase(event.classificationCase);
    if (taxonIdentityKey(current) !== taxonIdentityKey(event.targets[0])) {
      throw new Error("Eine weiterführende Identitätsänderung nach der Klassifikation benötigt eine erneute Quellenprüfung.");
    }
    const target = groups.get(taxonIdentityKey(current));
    const source = groups.get(taxonIdentityKey(event.sources[0]));
    const records = live(target).filter((record) => record.provider === "catalogue-of-life");
    const checked = classificationReviewCase({ sources: proof.sources, records,
      target: proof.target, baseVersion: proof.baseVersion, colVersion: proof.colVersion });
    assertMatchingClassificationCase(checked);
    const sourceKeys = locations.get(proof.previousProviderIds[0]);
    if (!sourceKeys?.size || sourceKeys.size !== 1 || ![source?.key, target?.key].includes([...sourceKeys][0])) {
      throw new Error("Die bestätigte Anbieter-ID ist im neuen Quellenstand nicht mehr eindeutig derselben Art zugeordnet.");
    }
    if (live(source).some((record) => record.provider === "catalogue-of-life")) {
      throw new Error("Die frühere Reichszuordnung ist erneut als eigenes CoL-Taxon belegt. Klassifikation erneut prüfen.");
    }
    if (source && source !== target) {
      target.records.push(...source.records);
      target.projects.push(...source.projects);
      target.corrections.push(...source.corrections);
      groups.delete(source.key);
    }
    target.identityKingdom = current.kingdom;
    target.identityClassification = true;
  }
}
