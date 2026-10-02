import crypto from "node:crypto";
import { canonicalBuildInput } from "./taxonomy-build-inputs.mjs";

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const digest = (value) => crypto.createHash("sha256").update(canonicalBuildInput(value)).digest("hex");
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// Retain all references, including malformed/contradictory ones. A collapsed
// externalIds object is not sufficient evidence of a unique provider link.
export function normalizeColIdentifiers(value = {}) {
  const entries = [
    ...(Array.isArray(value.identifiers) ? value.identifiers : []).map((entry) => ({
      type: text(entry.identifier_type ?? entry.type).toLowerCase(), identifier: text(entry.identifier),
    })),
    ...Object.entries(value.externalIds || {}).flatMap(([type, ids]) =>
      (Array.isArray(ids) ? ids : [ids]).map((identifier) => ({ type: text(type).toLowerCase(), identifier: text(identifier) }))),
  ].filter((entry) => entry.type);
  return [...new Map(entries.map((entry) => [canonicalBuildInput(entry), entry])).values()]
    .sort((a, b) => compare(a.type, b.type) || compare(a.identifier, b.identifier));
}

function providerLinks(records) {
  const references = records.flatMap(normalizeColIdentifiers)
    .filter((entry) => ["inat", "inaturalist"].includes(entry.type));
  const ids = new Set();
  let invalid = false;
  for (const entry of references) {
    const match = /^(?:inat:)?([1-9][0-9]*)$/.exec(entry.identifier);
    if (match) ids.add(match[1]);
    else invalid = true;
  }
  return { ids: [...ids].sort(compare), invalid };
}

export function classificationReviewCase({ sources, records, target, baseVersion, colVersion }) {
  const snapshots = sources.map((source) => ({
    masterTaxonId: source.masterTaxonId, scientificName: source.scientificName,
    rank: source.rank, kingdom: source.kingdom,
    evidence: source.evidence.map((entry) => ({ provider: entry.provider,
      providerVersion: entry.providerVersion, providerRecordId: text(entry.providerRecordId) }))
      .sort((a, b) => compare(canonicalBuildInput(a), canonicalBuildInput(b))),
  })).sort((a, b) => compare(a.masterTaxonId, b.masterTaxonId));
  const links = providerLinks(records);
  const previousIds = [...new Set(snapshots.flatMap((source) => source.evidence)
    .filter((entry) => entry.provider === "inaturalist").map((entry) => entry.providerRecordId))].sort(compare);
  const category = links.invalid || links.ids.length > 1 || snapshots.length > 1 || records.length > 1 || previousIds.length > 1
    ? "ambiguous-provider-id"
    : !links.ids.length || !previousIds.length ? "missing-provider-id"
      : links.ids[0] === previousIds[0] ? "matching-provider-id" : "different-provider-id";
  const body = { schemaVersion: 1, baseVersion, colVersion, category, sources: snapshots,
    target: { ...target, colRecords: records.map((record) => ({ providerRecordId: text(record.providerRecordId),
      identifiers: normalizeColIdentifiers(record) })).sort((a, b) => compare(canonicalBuildInput(a), canonicalBuildInput(b))) },
    providerLinks: links, previousProviderIds: previousIds };
  return { ...body, revision: digest(body) };
}

export function isClassificationReviewConflict(value) {
  return /^classification_[a-f0-9]{64}$/.test(text(value?.conflict_id));
}

export function assertClassificationReviewSummary(database, review) {
  if (!review) return; // Legacy candidates have no claim of this new review.
  const fields = ["total", "matchingProviderId", "differentProviderId", "ambiguousProviderId", "missingProviderId"];
  const actual = database.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(json_extract(resolution_note, '$.category')='matching-provider-id'),0) AS matchingProviderId,
    COALESCE(SUM(json_extract(resolution_note, '$.category')='different-provider-id'),0) AS differentProviderId,
    COALESCE(SUM(json_extract(resolution_note, '$.category')='ambiguous-provider-id'),0) AS ambiguousProviderId,
    COALESCE(SUM(json_extract(resolution_note, '$.category')='missing-provider-id'),0) AS missingProviderId
    FROM master_conflict WHERE conflict_state='open' AND conflict_id GLOB 'classification_*'`).get();
  if (review.schemaVersion !== 1 || fields.some((field) => !Number.isSafeInteger(review[field]) || review[field] < 0)
      || review.total !== fields.slice(1).reduce((sum, field) => sum + review[field], 0)
      || fields.some((field) => review[field] !== Number(actual[field])) || !/^[a-f0-9]{64}$/.test(review.revision || "")
      || review.requiresConfirmation !== true || review.changesPhotos !== false || review.acceptanceAvailable !== false) {
    throw new Error("Die gebündelte Klassifikationsprüfung passt nicht zu den offenen Kandidatenfällen. Bitte erneut aufbauen und prüfen.");
  }
}

export function summarizeClassificationReview(cases) {
  const counts = { total: cases.length, matchingProviderId: 0, differentProviderId: 0,
    ambiguousProviderId: 0, missingProviderId: 0 };
  const keys = { "matching-provider-id": "matchingProviderId", "different-provider-id": "differentProviderId",
    "ambiguous-provider-id": "ambiguousProviderId", "missing-provider-id": "missingProviderId" };
  const groups = new Map();
  for (const entry of cases) {
    counts[keys[entry.category]] += 1;
    const previousKingdom = [...new Set(entry.sources.map((source) => source.kingdom))].sort(compare).join(" / ");
    const key = canonicalBuildInput([previousKingdom, entry.target.kingdom, entry.category]);
    const group = groups.get(key) || { previousKingdom, newKingdom: entry.target.kingdom,
      category: entry.category, count: 0, examples: [] };
    group.count += 1;
    group.examples.push(entry.target.scientificName);
    groups.set(key, group);
  }
  const ordered = [...groups.values()].map((entry) => ({ ...entry, examples: [...new Set(entry.examples)].sort(compare).slice(0, 2) }))
    .sort((a, b) => b.count - a.count || compare(canonicalBuildInput(a), canonicalBuildInput(b)));
  return { schemaVersion: 1, revision: digest(cases.map((entry) => entry.revision).sort(compare)), ...counts,
    groups: ordered.slice(0, 8),
    groupCount: groups.size, requiresConfirmation: true, changesPhotos: false, acceptanceAvailable: false };
}
