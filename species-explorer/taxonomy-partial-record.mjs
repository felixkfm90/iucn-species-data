import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

const normalized = (value) => normalizeTaxonomySearchTerm(String(value || ""));
const kingdom = (value) => ({ animal: "animalia", animals: "animalia", metazoa: "animalia",
  viridiplantae: "plantae" })[normalized(value)] || normalized(value);
const union = (before = [], incoming = []) => [...new Set([...incoming, ...before])];

// A search response is not an authoritative replacement for a complete record.
// This function joins ONLY an identical provider ID with compatible identity;
// it never finds or migrates a taxon by its name alone.
export function mergePartialProviderRecord(previous, incoming) {
  if (!previous) return { record: incoming, retainedFields: [] };
  if (previous.provider !== incoming.provider || previous.providerRecordId !== incoming.providerRecordId) {
    throw new Error("Teil-Suchtreffer gehört zu einer anderen Anbieter-ID.");
  }
  if (incoming.versionChangeState === "removed") return { record: incoming, retainedFields: [] };
  if (previous.versionChangeState === "removed") {
    return { record: { ...previous }, retainedFields: ["removal"] };
  }
  for (const field of ["scientificName", "rank"]) {
    if (normalized(previous[field]) !== normalized(incoming[field])) {
      throw new Error(`Teil-Suchtreffer ${incoming.provider}:${incoming.providerRecordId} ändert die Identität (${field}). Bitte den vollständigen Quellenstand prüfen.`);
    }
  }
  const knownKingdoms = [previous.kingdom, previous.hierarchy?.kingdom, incoming.kingdom, incoming.hierarchy?.kingdom]
    .map(kingdom).filter(Boolean);
  if (new Set(knownKingdoms).size > 1) {
    throw new Error(`Teil-Suchtreffer ${incoming.provider}:${incoming.providerRecordId} widerspricht dem belegten Reich. Bitte die Identität prüfen.`);
  }
  const record = { ...incoming };
  const retainedFields = [];
  const retain = (field) => retainedFields.push(field);
  for (const field of ["kingdom", "parentProviderRecordId", "acceptedProviderRecordId", "taxonomicStatus"]) {
    if (!incoming[field] && previous[field]) { record[field] = previous[field]; retain(field); }
  }
  // Local CoL row IDs are release-relative. Do not copy an old colTaxonId into
  // a response from a different reference release; the next build resolves it.
  for (const field of ["hierarchy", "externalIds"]) {
    record[field] = { ...(incoming[field] || {}) };
    for (const [key, value] of Object.entries(previous[field] || {})) {
      if (!record[field][key] && value) { record[field][key] = value; retain(`${field}.${key}`); }
    }
  }
  if ((!incoming.environment || incoming.environment === "unknown") && previous.environment && previous.environment !== "unknown") {
    record.environment = previous.environment; retain("environment");
  }
  record.selectedForMaster = Boolean(previous.selectedForMaster || incoming.selectedForMaster);
  if (previous.selectedForMaster && !incoming.selectedForMaster) retain("selectedForMaster");
  for (const field of ["relevanceReasons", "queryKeys"]) {
    record[field] = union(previous[field], incoming[field]);
    if (record[field].length > (incoming[field] || []).length) retain(field);
  }
  const nameKey = (entry) => [normalized(entry.name), entry.language || "", entry.nameKind || "vernacular"].join("|");
  const names = new Map((incoming.names || []).map((entry) => [nameKey(entry), { ...entry }]));
  for (const entry of previous.names || []) {
    if (!names.has(nameKey(entry))) { names.set(nameKey(entry), { ...entry }); retain(`name:${nameKey(entry)}`); }
  }
  record.names = [...names.values()];
  return { record, retainedFields };
}
