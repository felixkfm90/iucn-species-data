import crypto from "node:crypto";
import { canonicalBuildInput, taxonomyRecordFingerprint } from "./taxonomy-build-inputs.mjs";
import { classificationReviewCase, assertMatchingClassificationCase } from "./taxonomy-classification-review.mjs";
import { identityRegistryRevision, identityRegistryState, readIdentityRegistry, taxonIdentityKey, validateIdentityRegistry } from "./taxonomy-identity-registry.mjs";
import { protectedMasterIdsRevision } from "./taxonomy-master-inputs.mjs";
import { createMasterTaxon, registerProviderRelease, addProviderTaxonAssertion, addProviderNameAssertion, addMasterConflict,
  addProviderSliceMembership, addMasterFieldAssertion, addMasterTaxonAlias, setMasterTaxonStatus } from "./taxonomy-master-model.mjs";

export const CLASSIFICATION_RETENTION_POLICY = "unused-classification-retention-v1";
export const CLASSIFICATION_RETENTION_KIND = "classification-source-retention";
const hash = (value) => crypto.createHash("sha256").update(canonicalBuildInput(value)).digest("hex");
const same = (left, right) => canonicalBuildInput(left) === canonicalBuildInput(right);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^mtx_[a-f0-9]{32}$/;
const live = (group) => (group?.records || []).filter((row) => row.versionChangeState !== "removed");
const identity = (row) => ({ scientificName: row.canonical_scientific_name, rank: row.rank, kingdom: row.kingdom });
const plain = (value) => JSON.parse(JSON.stringify(value));

function fail(message, code = "CLASSIFICATION_RETENTION_INVALID", details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

export function classificationRetentionMarker(detail) {
  let value;
  try { value = typeof detail === "string" ? JSON.parse(detail) : detail; } catch {
    if (detail.includes(CLASSIFICATION_RETENTION_KIND) || detail.includes(CLASSIFICATION_RETENTION_POLICY)) {
      throw fail("Der Nachweis einer zurückbehaltenen Klassifikation ist beschädigt.");
    }
    return null;
  }
  if (!value || value.kind !== CLASSIFICATION_RETENTION_KIND) {
    if (value?.policy === CLASSIFICATION_RETENTION_POLICY) throw fail("Der Nachweis einer zurückbehaltenen Klassifikation ist beschädigt.");
    return null;
  }
  const { revision, ...body } = value;
  const sourceRevisionBound = Object.hasOwn(body.binding || {}, "sourceRegistryRevision");
  const sourceCountBound = Object.hasOwn(body.binding || {}, "sourceRegistryEventCount");
  if (body.schemaVersion !== 1 || body.policy !== CLASSIFICATION_RETENTION_POLICY
      || !idPattern.test(body.masterTaxonId || "") || !hashPattern.test(body.eventId || "")
      || !hashPattern.test(body.snapshotHash || "") || !hashPattern.test(revision || "") || hash(body) !== revision
      || !body.identity?.scientificName || body.identity.rank !== "species" || !body.identity.kingdom
      || !body.binding?.sourceMasterVersion
      || ["usageRevision", "registryRevision", "sourceRevision", "inputRevision", "protectedMasterIdsRevision"]
        .some((field) => !hashPattern.test(body.binding[field] || ""))
      || !Array.isArray(body.withheldGroups) || body.withheldGroups.some((group) => !group.key || !Array.isArray(group.records)
        || group.records.some((record) => !record.provider || !record.providerRecordId || !hashPattern.test(record.fingerprint || "")))) {
    throw fail("Der Nachweis einer zurückbehaltenen Klassifikation ist beschädigt.");
  }
  if (sourceRevisionBound !== sourceCountBound || (sourceRevisionBound
      && (!hashPattern.test(body.binding.sourceRegistryRevision || "")
        || !Number.isSafeInteger(body.binding.sourceRegistryEventCount) || body.binding.sourceRegistryEventCount < 1))) {
    throw fail("Die historische Registerbindung der Retention ist beschädigt.");
  }
  const historical = assertMatchingClassificationCase(body.historicalCase);
  const current = classificationReviewCase({ sources: body.currentCase?.sources || [], records: body.currentCase?.target?.colRecords || [],
    target: { scientificName: body.currentCase?.target?.scientificName, rank: body.currentCase?.target?.rank, kingdom: body.currentCase?.target?.kingdom },
    baseVersion: body.currentCase?.baseVersion, colVersion: body.currentCase?.colVersion });
  if (!same(current, body.currentCase) || !["missing-provider-id", "different-provider-id", "ambiguous-provider-id"].includes(current.category)
      || !same(current.sources, historical.sources) || current.baseVersion !== body.binding.sourceMasterVersion
      || taxonIdentityKey(body.identity) !== taxonIdentityKey(historical.target)
      || taxonIdentityKey(current.target) !== taxonIdentityKey(body.identity)
      || historical.sources[0].masterTaxonId !== body.masterTaxonId) {
    throw fail("Die zurückbehaltene Klassifikation hat keinen unverändert gebundenen ungeklärten Quellenfall.");
  }
  return value;
}

export function classificationRetentionForTaxon(taxon) {
  let found = null;
  for (const status of taxon?.statuses || taxon?.masterStatuses || []) {
    const marker = classificationRetentionMarker(status.status_detail ?? status.detail);
    if (!marker) continue;
    const lifecycle = taxon.lifecycle_state ?? taxon.lifecycleState;
    const reference = taxon.reference_state ?? taxon.referenceState;
    if (found || (status.status_name ?? status.status ?? status.id) !== "stale"
        || marker.masterTaxonId !== (taxon.master_taxon_id ?? taxon.masterTaxonId)
        || (lifecycle !== undefined && lifecycle !== "stale") || (reference !== undefined && reference !== "reference-gap")) {
      throw fail("Der Retentionsmarker gehört nicht unverändert zum veralteten Bestandsdatensatz.");
    }
    found = marker;
  }
  return found;
}

export function readClassificationRetentionSnapshot(database, masterTaxonId) {
  const rows = (sql) => database.prepare(sql).all(masterTaxonId).map((row) => ({ ...row }));
  return {
    taxon: { ...database.prepare("SELECT * FROM master_taxon WHERE master_taxon_id=?").get(masterTaxonId) },
    releases: rows(`SELECT DISTINCT release.* FROM provider_release release JOIN provider_taxon_assertion source USING(release_id)
      WHERE source.master_taxon_id=? ORDER BY release.release_id`),
    sources: rows("SELECT * FROM provider_taxon_assertion WHERE master_taxon_id=? ORDER BY assertion_id"),
    names: rows(`SELECT name.* FROM provider_name_assertion name JOIN provider_taxon_assertion source
      ON source.assertion_id=name.provider_taxon_assertion_id WHERE source.master_taxon_id=? ORDER BY name.assertion_id`),
    memberships: rows(`SELECT membership.* FROM provider_slice_membership membership JOIN provider_taxon_assertion source
      ON source.assertion_id=membership.provider_taxon_assertion_id WHERE source.master_taxon_id=? ORDER BY source.assertion_id,membership.relevance_reason`),
    fields: rows("SELECT * FROM master_field_assertion WHERE master_taxon_id=? ORDER BY assertion_id"),
    aliases: rows("SELECT * FROM master_taxon_alias WHERE master_taxon_id=? ORDER BY alias_id"),
  };
}

function snapshotValue(snapshot) {
  const sourceKeys = new Map(snapshot.sources.map((row) => [row.assertion_id, [row.release_id, row.provider_record_id]]));
  const sorted = (rows) => rows.sort((a, b) => compare(canonicalBuildInput(a), canonicalBuildInput(b)));
  const { lifecycle_state, reference_state, updated_at, ...taxon } = snapshot.taxon;
  return { taxon,
    releases: sorted(snapshot.releases.map(({ release_state, ...row }) => row)),
    sources: sorted(snapshot.sources.map(({ assertion_id, match_state, version_change_state, ...row }) => row)),
    names: sorted(snapshot.names.map(({ assertion_id, provider_taxon_assertion_id, ...row }) => ({ ...row, source: sourceKeys.get(provider_taxon_assertion_id) }))),
    memberships: sorted(snapshot.memberships.map(({ provider_taxon_assertion_id, ...row }) => ({ ...row, source: sourceKeys.get(provider_taxon_assertion_id) }))),
    fields: sorted(snapshot.fields.map(({ assertion_id, provider_taxon_assertion_id, ...row }) => ({ ...row, source: sourceKeys.get(provider_taxon_assertion_id) }))),
    aliases: sorted(snapshot.aliases.map(({ alias_id, source_assertion_id, ...row }) => ({ ...row, source: source_assertion_id == null ? null : sourceKeys.get(source_assertion_id) }))),
  };
}

export function classificationRetentionSnapshotHash(snapshot) { return hash(snapshotValue(snapshot)); }

export function classificationRetentionProtection(database, masterTaxonId) {
  const exists = (sql) => Boolean(database.prepare(sql).get(masterTaxonId));
  return [
    ...(exists("SELECT 1 FROM project_taxon_link WHERE master_taxon_id=? LIMIT 1") ? ["Projektart"] : []),
    ...(exists("SELECT 1 FROM master_field_assertion WHERE master_taxon_id=? AND origin_kind IN ('manual','project') LIMIT 1") ? ["eigener Name oder Feldwert"] : []),
    ...(exists("SELECT 1 FROM master_taxon_status WHERE master_taxon_id=? AND status_name='manually-protected' LIMIT 1") ? ["manueller Feld- oder Entscheidungsschutz"] : []),
    ...(exists("SELECT 1 FROM master_decision WHERE master_taxon_id=? LIMIT 1") ? ["gespeicherte Feldentscheidung"] : []),
  ];
}

export function planClassificationRetention({ state, groups, previousState, event, currentCase, classificationRetention,
  protectedMasterIds = [], baseVersion, sourceRevision, inputRevision, releases, locations }) {
  // No policy means the original strict failure remains the behavior.
  if (!classificationRetention) { assertMatchingClassificationCase(currentCase); }
  if (classificationRetention?.policy !== CLASSIFICATION_RETENTION_POLICY || !hashPattern.test(classificationRetention.usageRevision || "")) {
    throw fail("Die vollständige frische FN-Grundlage für das Zurückbehalten ungeklärter Klassifikationen fehlt.");
  }
  const id = event.sources[0].masterTaxonId, current = state.current.get(id), old = previousState.taxa.get(id);
  const activeEvent = previousState.identityRegistry.events.find((value) => value.eventId === event.eventId);
  const snapshot = previousState.retentionSnapshotFor(id);
  const priorMarker = previousState.retentionMarkerFor(id);
  if (!activeEvent || activeEvent.type !== "classification" || !same(activeEvent, event)
      || !old || !current || (old.lifecycle_state !== "active" && !(old.lifecycle_state === "stale" && priorMarker))
      || taxonIdentityKey(identity(old)) !== taxonIdentityKey(current)
      || taxonIdentityKey(current) !== taxonIdentityKey(event.targets[0])) {
    throw fail("Nur eine bereits vollzogene unveränderte Klassifikation darf als Bestandsidentität erhalten bleiben.");
  }
  const target = groups.get(taxonIdentityKey(current)), source = groups.get(taxonIdentityKey(event.sources[0]));
  const ownEvents = previousState.identityRegistry.events.some((value) => !value.classificationAutomation
    && [...value.sources, ...value.targets].some((entry) => entry.masterTaxonId === id));
  const protectedReasons = [
    ...(protectedMasterIds.includes(id) ? ["FN-Nutzung"] : []),
    ...previousState.retentionProtectionFor(id), ...(ownEvents ? ["eigene Identitätsentscheidung"] : []),
    ...([source, target].some((group) => group?.projects.length) ? ["Projektart im neuen Eingang"] : []),
    ...([source, target].some((group) => group?.corrections.length) ? ["eigene Namenskorrektur im neuen Eingang"] : []),
  ];
  if (protectedReasons.length) throw fail("Die Klassifikationsentscheidung hat keinen unveränderten, eindeutigen Quellenbeleg mit gleicher Anbieter-ID. "
    + `Die bisherige Klassifikation von ${current.scientificName} (${id}) ist im neuen Quellenstand ungeklärt. `
    + `Automatisches Zurückbehalten ist gesperrt: ${[...new Set(protectedReasons)].join(", ")}. Die bisherige Identität bleibt unverändert.`,
  "CLASSIFICATION_RETENTION_PROTECTED", { masterTaxonId: id, protectedReasons: [...new Set(protectedReasons)] });
  if (snapshot.fields.some((field) => field.origin_kind !== "source") || !snapshot.sources.length) {
    throw fail("Die erhaltene Bestandsidentität hat keinen vollständig belegten reinen Quellenstand.");
  }
  // Group ownership is an exact provider relationship, never a name heuristic.
  const proof = assertMatchingClassificationCase(event.classificationCase), previousId = proof.previousProviderIds[0];
  const ownerKeys = [...(locations.get(previousId) || [])];
  if (ownerKeys.length > 1 || ownerKeys.some((key) => key !== source?.key && key !== target?.key)) {
    throw fail(`Die Anbieter-ID ${previousId} von ${current.scientificName} (${id}) ist nicht eindeutig derselben bisherigen Gruppe zugeordnet.`);
  }
  if (source && source !== target && [...state.current.values()].some((entry) => entry.masterTaxonId !== id && taxonIdentityKey(entry) === source.key)) {
    throw fail("Die zurückzuhaltende Quellengruppe ist bereits eine andere bestätigte Identität.");
  }
  if (source && source !== target) {
    const releaseProviders = new Map(snapshot.releases.map((release) => [release.release_id, release.provider]));
    const evidence = snapshot.sources.map((row) => ({ provider: releaseProviders.get(row.release_id), providerRecordId: row.provider_record_id }));
    for (const record of live(source)) {
      const known = evidence.some((entry) => entry.provider === record.provider && entry.providerRecordId === record.providerRecordId);
      const linkedCol = record.provider === "catalogue-of-life" && classificationReviewCase({ sources: proof.sources,
        records: [record], target: proof.target, baseVersion, colVersion: releases.find((release) => release.provider === "catalogue-of-life")?.providerVersion }).category === "matching-provider-id";
      if (!known && !linkedCol) throw fail("Die zurückzuhaltende Quellengruppe enthält nicht eindeutig zugehörige Anbieterzeilen.");
    }
  }
  const binding = { sourceMasterVersion: baseVersion, registryRevision: identityRegistryRevision(previousState.identityRegistry),
    sourceRevision, inputRevision, protectedMasterIdsRevision: protectedMasterIdsRevision(protectedMasterIds), usageRevision: classificationRetention.usageRevision };
  const body = { kind: CLASSIFICATION_RETENTION_KIND, schemaVersion: 1, policy: CLASSIFICATION_RETENTION_POLICY,
    masterTaxonId: id, identity: { scientificName: current.scientificName, rank: current.rank, kingdom: current.kingdom }, eventId: event.eventId,
    historicalCase: proof, currentCase: classificationReviewCase({ sources: proof.sources, records: currentCase.target.colRecords,
      target: proof.target, baseVersion, colVersion: releases.find((release) => release.provider === "catalogue-of-life")?.providerVersion }),
    snapshotHash: classificationRetentionSnapshotHash(snapshot), binding,
    withheldGroups: [...new Set([source, target].filter(Boolean))].map((group) => ({ key: group.key,
      records: live(group).map((record) => ({ provider: record.provider, providerRecordId: record.providerRecordId,
        fingerprint: taxonomyRecordFingerprint(plain(record)) })).sort((a, b) => compare(canonicalBuildInput(a), canonicalBuildInput(b))) })).sort((a, b) => compare(a.key, b.key)) };
  const marker = classificationRetentionMarker({ ...body, revision: hash(body) });
  if (source && source !== target) groups.delete(source.key);
  target.records = [];
  target.identityRetention = marker;
  target.identityKingdom = current.kingdom;
  return marker;
}


// Bind the fully planned candidate without weakening the immutable source prefix.
// Only provisional proofs created from this exact previous registry may enter.
export function finalizeClassificationRetentionRegistry(retentions, { previousRegistry, registry }) {
  if (!retentions.length) return [];
  const previous = validateIdentityRegistry(previousRegistry), candidate = validateIdentityRegistry(registry);
  if (JSON.stringify(candidate.events.slice(0, previous.events.length)) !== JSON.stringify(previous.events)) {
    throw fail("Die historische Registergrundlage der Retention wurde entfernt oder verändert.");
  }
  const sourceRevision = identityRegistryRevision(previous), candidateRevision = identityRegistryRevision(candidate);
  const state = identityRegistryState(candidate), appended = candidate.events.slice(previous.events.length);
  return retentions.map((value) => {
    const marker = classificationRetentionMarker(value);
    const historical = previous.events.find((event) => event.eventId === marker.eventId);
    if (Object.hasOwn(marker.binding, "sourceRegistryRevision") || Object.hasOwn(marker.binding, "sourceRegistryEventCount")
        || marker.binding.registryRevision !== sourceRevision || !historical || historical.type !== "classification"
        || !same(historical.classificationCase, marker.historicalCase)
        || taxonIdentityKey(state.current.get(marker.masterTaxonId)) !== taxonIdentityKey(marker.identity)
        || appended.some((event) => !event.classificationAutomation
          && [...event.sources, ...event.targets].some((entry) => entry.masterTaxonId === marker.masterTaxonId))) {
      throw fail("Die Retention gehört nicht unverändert zur historischen und vollständig geplanten Identitätshistorie.");
    }
    const { revision, ...body } = marker;
    const bound = { ...body, binding: { ...body.binding, sourceRegistryRevision: sourceRevision,
      sourceRegistryEventCount: previous.events.length, registryRevision: candidateRevision } };
    return classificationRetentionMarker({ ...bound, revision: hash(bound) });
  });
}

export function summarizeClassificationRetentions(retentions) {
  if (!retentions.length) return null;
  const markers = retentions.map((value) => classificationRetentionMarker(value));
  const binding = markers[0].binding;
  if (markers.some((value) => !same(value.binding, binding)) || new Set(markers.map((value) => value.masterTaxonId)).size !== markers.length) {
    throw fail("Die zurückbehaltenen Klassifikationen gehören nicht zu derselben unveränderten Grundlage.");
  }
  const body = { schemaVersion: 1, policy: CLASSIFICATION_RETENTION_POLICY, ...binding, total: markers.length,
    retainedMasterTaxonIds: markers.map((value) => value.masterTaxonId).sort() };
  return { ...body, revision: hash({ ...body, proofs: markers.map((value) => value.revision).sort() }) };
}

export function writeClassificationRetention(database, previousState, marker, timestamp) {
  marker = classificationRetentionMarker(marker);
  const id = marker.masterTaxonId, snapshot = previousState.retentionSnapshotFor(id);
  if (classificationRetentionSnapshotHash(snapshot) !== marker.snapshotHash) throw fail("Die bisherige Bestandsidentität wurde während des Aufbaus verändert.");
  createMasterTaxon(database, { masterTaxonId: id, ...marker.identity, lifecycleState: "stale", referenceState: "reference-gap",
    createdAt: snapshot.taxon.created_at, updatedAt: timestamp });
  for (const release of snapshot.releases) if (!database.prepare("SELECT 1 FROM provider_release WHERE release_id=?").get(release.release_id)) {
    registerProviderRelease(database, { releaseId: release.release_id, provider: release.provider, providerVersion: release.provider_version,
      dataScope: release.data_scope, releaseState: "archived", issuedAt: release.issued_at, importedAt: release.imported_at,
      sourceUrl: release.source_url, checksumSha256: release.checksum_sha256, license: release.license, recordCount: release.record_count, metadata: JSON.parse(release.metadata_json) });
  }
  const mapping = new Map();
  for (const row of snapshot.sources) {
    const sourceId = addProviderTaxonAssertion(database, { releaseId: row.release_id, providerRecordId: row.provider_record_id,
      masterTaxonId: id, parentProviderRecordId: row.parent_provider_record_id, acceptedProviderRecordId: row.accepted_provider_record_id,
      scientificName: row.scientific_name, rank: row.rank, taxonomicStatus: row.taxonomic_status, kingdom: row.kingdom,
      matchState: "stale", hierarchy: JSON.parse(row.hierarchy_json), payloadSha256: row.payload_sha256,
      importedAt: row.imported_at, retrievedAt: row.retrieved_at, versionChangeState: "removed" });
    mapping.set(row.assertion_id, sourceId);
  }
  for (const row of snapshot.names) addProviderNameAssertion(database, { providerTaxonAssertionId: mapping.get(row.provider_taxon_assertion_id),
    name: row.name, language: row.language, nameKind: row.name_kind, preferred: Boolean(row.preferred), verified: Boolean(row.verified) });
  for (const row of snapshot.memberships) addProviderSliceMembership(database, { providerTaxonAssertionId: mapping.get(row.provider_taxon_assertion_id),
    relevanceReason: row.relevance_reason, observedAt: row.observed_at });
  for (const row of snapshot.fields) addMasterFieldAssertion(database, { masterTaxonId: id, fieldName: row.field_name, fieldValue: row.field_value,
    language: row.language, originKind: row.origin_kind, providerTaxonAssertionId: mapping.get(row.provider_taxon_assertion_id), releaseId: row.release_id,
    confidence: row.confidence, reviewState: row.review_state, selected: Boolean(row.selected), createdAt: row.created_at, updatedAt: row.updated_at });
  for (const row of snapshot.aliases) addMasterTaxonAlias(database, { masterTaxonId: id, name: row.name, rank: row.rank, kingdom: row.kingdom,
    aliasType: row.alias_type, sourceAssertionId: row.source_assertion_id == null ? null : mapping.get(row.source_assertion_id) });
  setMasterTaxonStatus(database, { masterTaxonId: id, statusName: "stale", statusDetail: JSON.stringify(marker), updatedAt: timestamp });
  setMasterTaxonStatus(database, { masterTaxonId: id, statusName: "col-reference-gap", updatedAt: timestamp });
  const conflictId = `classification_retention_${id}`;
  addMasterConflict(database, { conflictId, masterTaxonId: id, conflictType: "reference-gap", detectedAt: timestamp,
    resolutionNote: JSON.stringify(marker) });
  database.prepare("UPDATE master_conflict SET conflict_state='dismissed',resolved_at=? WHERE conflict_id=?").run(timestamp, conflictId);
}

export function assertClassificationRetentions(database, summary, expected = {}) {
  const { checkOrphans = true, ...bindings } = expected;
  const receipts = database.prepare("SELECT * FROM master_conflict WHERE conflict_id GLOB 'classification_retention_*' ORDER BY conflict_id").all();
  const markers = receipts.map((row) => ({ row, marker: classificationRetentionMarker(row.resolution_note) }));
  if (markers.some((value) => !value.marker)) throw fail("Ein Retentionsbeleg enthält keinen gültigen Bestandsnachweis.");
  if (checkOrphans) {
    const owned = [];
    for (const row of database.prepare("SELECT master_taxon_id,status_name,status_detail FROM master_taxon_status WHERE status_detail IS NOT NULL").iterate()) {
      if (classificationRetentionMarker(row.status_detail)) owned.push(row);
    }
    if (owned.length !== markers.length || owned.some((row) => row.status_name !== "stale" || !markers.some((value) => value.row.master_taxon_id === row.master_taxon_id
        && same(value.marker, classificationRetentionMarker(row.status_detail))))) throw fail("Eine zurückbehaltene Klassifikation hat keinen vollständigen Retentionsbeleg.");
  }
  if (!summary) { if (markers.length) throw fail("Die Retentionsübersicht fehlt."); return null; }
  if (!markers.length || !same(summarizeClassificationRetentions(markers.map((value) => value.marker)), summary)) throw fail("Die Retentionsübersicht passt nicht zu den tatsächlichen Bestandsidentitäten.");
  const aliases = { baseVersion: "sourceMasterVersion" };
  for (const [field, value] of Object.entries(bindings)) if (value !== undefined && summary[aliases[field] || field] !== value) throw fail("Die Retentionsübersicht gehört zu einem anderen Master-, Quellen-, Nutzungs- oder Schutzstand.");
  const registry = readIdentityRegistry(database), state = identityRegistryState(registry);
  if (identityRegistryRevision(registry) !== summary.registryRevision) throw fail("Die Identitätshistorie der Retention wurde verändert.");
  if (Object.hasOwn(summary, "sourceRegistryRevision")) {
    const count = summary.sourceRegistryEventCount;
    const source = { schemaVersion: registry.schemaVersion, events: registry.events.slice(0, count) };
    if (count > registry.events.length || identityRegistryRevision(source) !== summary.sourceRegistryRevision
        || markers.some(({ marker }) => !source.events.some((event) => event.eventId === marker.eventId))) {
      throw fail("Die historische Registergrundlage der Retention wurde verändert.");
    }
  }
  for (const { row, marker } of markers) {
    const event = registry.events.find((value) => value.eventId === marker.eventId), snapshot = readClassificationRetentionSnapshot(database, marker.masterTaxonId);
    const status = database.prepare("SELECT status_detail FROM master_taxon_status WHERE master_taxon_id=? AND status_name='stale'").get(marker.masterTaxonId);
    if (row.master_taxon_id !== marker.masterTaxonId || !event || event.type !== "classification"
        || row.conflict_id !== `classification_retention_${marker.masterTaxonId}` || row.conflict_state !== "dismissed"
        || row.resolved_at !== row.detected_at || !same(classificationRetentionMarker(status?.status_detail), marker)
        || !same(event.classificationCase, marker.historicalCase) || taxonIdentityKey(state.current.get(marker.masterTaxonId)) !== taxonIdentityKey(marker.identity)
        || snapshot.taxon.lifecycle_state !== "stale" || snapshot.taxon.reference_state !== "reference-gap"
        || !same(identity(snapshot.taxon), marker.identity) || classificationRetentionProtection(database, marker.masterTaxonId).length
        || snapshot.sources.some((source) => source.match_state !== "stale" || source.version_change_state !== "removed")
        || classificationRetentionSnapshotHash(snapshot) !== marker.snapshotHash) {
      throw fail(`Die zurückbehaltene Klassifikation ${marker.masterTaxonId} erhält Identität, Herkunft oder Schutz nicht unverändert.`);
    }
  }
  return plain(summary);
}
