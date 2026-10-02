import crypto from "node:crypto";
import { canonicalBuildInput } from "./taxonomy-build-inputs.mjs";
import { assertUnclearClassificationCase, summarizeClassificationReview } from "./taxonomy-classification-review.mjs";
import { addMasterConflict } from "./taxonomy-master-model.mjs";
import { readIdentityRegistry, identityRegistryState, taxonIdentityKey } from "./taxonomy-identity-registry.mjs";

const equal = (a, b) => canonicalBuildInput(a) === canonicalBuildInput(b);
const caseKey = (value) => canonicalBuildInput({ ...value, baseVersion: "", revision: "" });

// Omit only the explicitly bound NEW CoL counterpart, not the previous species
// or arbitrary provider records. Changed evidence creates an open case again.
export function planClassificationDeferrals({ cases, groups, identityPlan, previousRegistry, previousState }) {
  const fresh = new Set(identityPlan.registry.events.slice(previousRegistry.events.length)
    .filter((event) => event.type === "classification-deferred").map((event) => event.eventId));
  const applied = [];
  const matched = new Set();
  const byCase = new Map([...cases].map(([group, value]) => [caseKey(value), [group, value]]));
  for (const event of identityPlan.state.deferrals) {
    const proof = assertUnclearClassificationCase(event.classificationCase);
    const found = byCase.get(caseKey(proof));
    if (!found) {
      if (fresh.has(event.eventId)) throw new Error("Der zurückgestellte Quellenfall ist nicht mehr unverändert im neuen Eingang belegt.");
      continue;
    }
    const [target, actual] = found;
    if (target.projects.length || target.corrections.length || target.previousTaxon
        || target.records.some((record) => record.provider !== "catalogue-of-life" || record.versionChangeState === "removed")
        || event.sources.some((source) => {
          const group = groups.get(taxonIdentityKey(source)), old = previousState.taxa.get(source.masterTaxonId);
          return !group || !old || old.lifecycle_state !== "active" || old.reference_state !== "reference-gap"
            || !group.records.some((record) => record.versionChangeState !== "removed"
              && proof.sources.find((entry) => entry.masterTaxonId === source.masterTaxonId).evidence.some((entry) =>
                entry.provider === record.provider && entry.providerRecordId === record.providerRecordId));
        })) {
      if (fresh.has(event.eventId)) throw new Error("Die Zurückstellung würde vorhandene Arten, Projektwerte oder zusätzliche Quellen ausblenden. Bitte erneut prüfen.");
      continue; // Existing hold no longer covers the extent: leave the case open.
    }
    groups.delete(target.key);
    cases.delete(target);
    byCase.delete(caseKey(proof));
    matched.add(event.eventId);
    applied.push({ eventId: event.eventId, classificationCase: proof, currentRevision: actual.revision });
  }
  if ([...fresh].some((id) => !matched.has(id))) throw new Error("Die bestätigte Zurückstellung wurde nicht vollständig angewendet.");
  return applied;
}

export function classificationDeferralSummary(applied) {
  const decisions = applied.map((entry) => ({ eventId: entry.eventId, currentRevision: entry.currentRevision })).sort((a, b) => a.eventId.localeCompare(b.eventId));
  return { ...summarizeClassificationReview(applied.map((entry) => entry.classificationCase)),
    acceptanceAvailable: false, deferralAvailable: false,
    decisionsRevision: crypto.createHash("sha256").update(canonicalBuildInput(decisions)).digest("hex") };
}

export function writeClassificationDeferrals(database, applied, timestamp) {
  for (const value of applied) {
    addMasterConflict(database, { conflictId: `classification_hold_${value.eventId}`,
      masterTaxonId: value.classificationCase.sources[0].masterTaxonId, conflictType: "ambiguous-match",
      detectedAt: timestamp, resolutionNote: JSON.stringify(value) });
    database.prepare("UPDATE master_conflict SET conflict_state='dismissed', resolved_at=? WHERE conflict_id=?")
      .run(timestamp, `classification_hold_${value.eventId}`);
  }
}

// A manifest counter alone never exempts an unresolved classification conflict.
// The immutable decision, preserved source IDs and omitted target are verified.
export function assertClassificationDeferrals(database, summary, { baseVersion, colVersion } = {}) {
  const rows = database.prepare("SELECT * FROM master_conflict WHERE conflict_id GLOB 'classification_hold_*' ORDER BY conflict_id").all();
  if (!summary) { if (rows.length) throw new Error("Die Zurückstellungsübersicht fehlt."); return; }
  const events = new Map(identityRegistryState(readIdentityRegistry(database)).deferrals.map((event) => [event.eventId, event]));
  const applied = rows.map((row) => {
    const value = JSON.parse(row.resolution_note), event = events.get(value.eventId);
    const proof = assertUnclearClassificationCase(value.classificationCase);
    if (!event || !equal(event.classificationCase, proof) || row.conflict_id !== `classification_hold_${event.eventId}`
        || !baseVersion || proof.colVersion !== colVersion
        || row.conflict_state !== "dismissed" || row.resolved_at !== row.detected_at
        || row.master_taxon_id !== proof.sources[0].masterTaxonId || !/^[a-f0-9]{64}$/.test(value.currentRevision || "")
        || proof.sources.some((source) => {
          const actual = database.prepare("SELECT lifecycle_state, kingdom, canonical_scientific_name, rank FROM master_taxon WHERE master_taxon_id=?").get(source.masterTaxonId);
          return actual?.lifecycle_state !== "active" || taxonIdentityKey({ scientificName: actual.canonical_scientific_name,
            rank: actual.rank, kingdom: actual.kingdom }) !== taxonIdentityKey(source);
        })
        || database.prepare("SELECT 1 FROM master_taxon WHERE canonical_name_normalized=? AND rank=? AND kingdom=? AND lifecycle_state!='deprecated'")
          .get(taxonIdentityKey(proof.target).split("|")[0], proof.target.rank, proof.target.kingdom)) {
      throw new Error("Die gespeicherte Zurückstellung erhält die bestätigten Arten oder Belege nicht unverändert.");
    }
    return value;
  });
  if ([...events.values()].some((event) => event.baseVersion === baseVersion && !applied.some((entry) => entry.eventId === event.eventId))) {
    throw new Error("Eine frische bestätigte Zurückstellung fehlt in der Kandidatenprüfung.");
  }
  if (!equal(classificationDeferralSummary(applied), summary)) throw new Error("Die Zurückstellungsübersicht passt nicht zu den geprüften Entscheidungen.");
}
