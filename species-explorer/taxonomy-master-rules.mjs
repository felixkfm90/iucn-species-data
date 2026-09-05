import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

export const MASTER_PROVIDER_PRIORITY = Object.freeze({
  manual: 1_000,
  project: 900,
  "catalogue-of-life": 800,
  worms: 700,
  gbif: 600,
  inaturalist: 550,
  wikidata: 500,
  animalia: 450,
});

export const MASTER_STATUS_LABELS = Object.freeze({
  "col-confirmed": "Durch CoL bestätigt",
  "col-reference-gap": "CoL-Referenzlücke",
  "externally-confirmed": "Extern bestätigt",
  conflicting: "Widersprüchlich",
  stale: "Veraltet",
  "manually-protected": "Manuell geschützt",
});

export const HIERARCHY_FIELDS = Object.freeze([
  "kingdom",
  "phylum",
  "subphylum",
  "class",
  "order",
  "suborder",
  "family",
  "subfamily",
  "genus",
  "species",
  "subspecies",
]);

const NAME_FIELDS = new Set(["german-name", "english-name", "scientific-name"]);
const EXTERNAL_ID_FIELDS = new Set([
  "col-id",
  "gbif-id",
  "inaturalist-id",
  "worms-id",
  "wikidata-id",
  "animalia-id",
]);
const MARINE_ENVIRONMENTS = new Set(["marine", "brackish"]);

function normalized(value) {
  return normalizeTaxonomySearchTerm(value);
}

export function providerFieldPriority(provider, {
  fieldName = "",
  environment = "terrestrial",
} = {}) {
  const source = String(provider || "").toLowerCase();
  const field = String(fieldName || "").toLowerCase();
  if (!(source in MASTER_PROVIDER_PRIORITY)) return Number.NEGATIVE_INFINITY;
  if (source === "wikidata" && !NAME_FIELDS.has(field) && !EXTERNAL_ID_FIELDS.has(field)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (source === "animalia" && !NAME_FIELDS.has(field) && !EXTERNAL_ID_FIELDS.has(field)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (source === "worms" && !MARINE_ENVIRONMENTS.has(String(environment).toLowerCase())) {
    return 575;
  }
  return MASTER_PROVIDER_PRIORITY[source];
}

export function isExactTaxonMatch(left, right) {
  return Boolean(
    normalized(left?.scientificName) === normalized(right?.scientificName)
    && String(left?.rank || "").toLowerCase() === String(right?.rank || "").toLowerCase()
    && (
      !left?.kingdom
      || !right?.kingdom
      || normalized(left.kingdom) === normalized(right.kingdom)
    )
  );
}

export function mayCloseColReferenceGap(colRecord, externalRecord) {
  if (!colRecord || !externalRecord) return false;
  return isExactTaxonMatch(colRecord, externalRecord)
    && String(colRecord.rank).toLowerCase() === "species";
}

export function deriveMasterStatuses({
  exactCol = false,
  referenceGap = false,
  externalProviderCount = 0,
  conflictCount = 0,
  stale = false,
  manuallyProtected = false,
} = {}) {
  const statuses = [];
  if (exactCol) statuses.push("col-confirmed");
  if (referenceGap) statuses.push("col-reference-gap");
  if (externalProviderCount >= 2) statuses.push("externally-confirmed");
  if (conflictCount > 0) statuses.push("conflicting");
  if (stale) statuses.push("stale");
  if (manuallyProtected) statuses.push("manually-protected");
  return statuses;
}

export function chooseFieldAssertion({
  current = null,
  candidate,
  environment = "terrestrial",
} = {}) {
  if (!candidate) throw new TypeError("Kandidat fehlt.");
  const candidatePriority = providerFieldPriority(candidate.provider, {
    fieldName: candidate.fieldName,
    environment,
  });
  if (!Number.isFinite(candidatePriority)) {
    return { action: "reject", reason: "provider-not-authoritative-for-field" };
  }
  if (!current) {
    return { action: "select", reason: "empty-field" };
  }
  if (normalized(current.fieldValue) === normalized(candidate.fieldValue)) {
    return { action: "retain", reason: "same-value" };
  }
  if (candidate.originKind === "manual") {
    return { action: "select", reason: "explicit-manual-correction" };
  }
  if (candidate.originKind === "project" && current.originKind !== "manual") {
    return { action: "select", reason: "explicit-project-value" };
  }
  if (current.originKind === "manual" || current.originKind === "project") {
    return { action: "conflict", reason: "protected-current-value" };
  }
  if (HIERARCHY_FIELDS.includes(String(candidate.fieldName).toLowerCase())) {
    return { action: "conflict", reason: "hierarchy-change-requires-review" };
  }
  const currentPriority = providerFieldPriority(current.provider, {
    fieldName: current.fieldName,
    environment,
  });
  if (candidatePriority > currentPriority) {
    return { action: "conflict", reason: "higher-priority-candidate-requires-review" };
  }
  return { action: "retain", reason: "current-value-remains-authoritative" };
}

export function compareProviderRecord(previous, current) {
  if (!previous && current) return "new";
  if (previous && !current) return "removed";
  if (!previous && !current) return "unchanged";
  const fields = [
    "scientificName",
    "rank",
    "kingdom",
    "taxonomicStatus",
    "acceptedProviderRecordId",
    "parentProviderRecordId",
  ];
  const baseChanged = fields.some(
    (field) => normalized(previous[field]) !== normalized(current[field]),
  );
  const hierarchyChanged = JSON.stringify(previous.hierarchy || {})
    !== JSON.stringify(current.hierarchy || {});
  const namesChanged = JSON.stringify(previous.names || []) !== JSON.stringify(current.names || []);
  return baseChanged || hierarchyChanged || namesChanged ? "changed" : "unchanged";
}
