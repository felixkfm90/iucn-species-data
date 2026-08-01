import crypto from "node:crypto";

import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { TAXONOMY_MASTER_PROVIDERS } from "./taxonomy-master-schema.mjs";

const RELEASE_STATES = new Set([
  "staging",
  "active",
  "previous",
  "archived",
  "failed",
]);
const RELEASE_SCOPES = new Set(["full", "relevant-slice", "manual", "project"]);
const REFERENCE_STATES = new Set([
  "exact-col",
  "reference-gap",
  "external-only",
  "manual",
]);
const MATCH_STATES = new Set([
  "unlinked",
  "exact",
  "synonym",
  "reference-gap",
  "conflict",
  "stale",
]);
const MASTER_STATUSES = new Set([
  "col-confirmed",
  "col-reference-gap",
  "externally-confirmed",
  "conflicting",
  "stale",
  "manually-protected",
]);
const SLICE_REASONS = new Set([
  "project-species",
  "col-reference-gap",
  "missing-name",
  "missing-hierarchy",
  "searched-taxon",
  "manual-correction",
]);
const VERSION_CHANGE_STATES = new Set([
  "new",
  "unchanged",
  "changed",
  "removed",
  "restored",
]);

function requiredText(value, label) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text) throw new Error(`${label} fehlt.`);
  return text;
}

function optionalText(value) {
  return String(value ?? "").normalize("NFKC").trim() || null;
}

function isoTimestamp(value, label) {
  const timestamp = requiredText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} ist kein gültiger ISO-Zeitpunkt.`);
  }
  return new Date(timestamp).toISOString();
}

function enumValue(value, allowed, label) {
  const normalized = requiredText(value, label);
  if (!allowed.has(normalized)) {
    throw new Error(`${label} enthält den nicht unterstützten Wert ${normalized}.`);
  }
  return normalized;
}

function runTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createMasterTaxonId(randomUuid = () => crypto.randomUUID()) {
  const compact = String(randomUuid()).replaceAll("-", "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(compact)) {
    throw new Error("Die erzeugte Master-Taxon-ID ist keine gültige UUID.");
  }
  return `mtx_${compact}`;
}

export function createStableMasterTaxonId({
  scientificName,
  rank,
  kingdom = "",
} = {}) {
  const identity = [
    normalizeTaxonomySearchTerm(requiredText(scientificName, "Wissenschaftlicher Name")),
    requiredText(rank, "Rang").toLocaleLowerCase("en"),
    normalizeTaxonomySearchTerm(kingdom),
  ].join("|");
  return `mtx_${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

export function registerProviderRelease(database, {
  releaseId,
  provider,
  providerVersion,
  dataScope,
  releaseState = "staging",
  issuedAt = null,
  importedAt,
  sourceUrl = null,
  checksumSha256 = null,
  license = null,
  recordCount = 0,
  metadata = {},
}) {
  const normalizedProvider = enumValue(
    provider,
    new Set(TAXONOMY_MASTER_PROVIDERS),
    "Anbieter",
  );
  const normalizedState = enumValue(releaseState, RELEASE_STATES, "Release-Status");
  const normalizedScope = enumValue(dataScope, RELEASE_SCOPES, "Datenumfang");
  const normalizedRecordCount = Number(recordCount);
  if (!Number.isInteger(normalizedRecordCount) || normalizedRecordCount < 0) {
    throw new Error("Datensatzzahl muss eine nicht negative ganze Zahl sein.");
  }
  database.prepare(`
    INSERT INTO provider_release (
      release_id,
      provider,
      provider_version,
      data_scope,
      release_state,
      issued_at,
      imported_at,
      source_url,
      checksum_sha256,
      license,
      record_count,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requiredText(releaseId, "Release-ID"),
    normalizedProvider,
    requiredText(providerVersion, "Anbieterversion"),
    normalizedScope,
    normalizedState,
    issuedAt ? isoTimestamp(issuedAt, "Ausgabezeitpunkt") : null,
    isoTimestamp(importedAt, "Importzeitpunkt"),
    optionalText(sourceUrl),
    optionalText(checksumSha256),
    optionalText(license),
    normalizedRecordCount,
    JSON.stringify(metadata ?? {}),
  );
  return requiredText(releaseId, "Release-ID");
}

export function activateProviderRelease(database, releaseId) {
  const normalizedReleaseId = requiredText(releaseId, "Release-ID");
  return runTransaction(database, () => {
    const candidate = database.prepare(`
      SELECT provider, release_state
      FROM provider_release
      WHERE release_id = ?
    `).get(normalizedReleaseId);
    if (!candidate) throw new Error(`Quellenrelease ${normalizedReleaseId} ist nicht installiert.`);
    if (candidate.release_state === "active") return normalizedReleaseId;
    if (candidate.release_state !== "staging") {
      throw new Error(
        `Quellenrelease ${normalizedReleaseId} ist nicht als geprüfter Kandidat vorgemerkt.`,
      );
    }
    database.prepare(`
      UPDATE provider_release
      SET release_state = 'archived'
      WHERE provider = ? AND release_state = 'previous'
    `).run(candidate.provider);
    database.prepare(`
      UPDATE provider_release
      SET release_state = 'previous'
      WHERE provider = ? AND release_state = 'active'
    `).run(candidate.provider);
    database.prepare(`
      UPDATE provider_release
      SET release_state = 'active'
      WHERE release_id = ?
    `).run(normalizedReleaseId);
    return normalizedReleaseId;
  });
}

export function createMasterTaxon(database, {
  masterTaxonId = createMasterTaxonId(),
  scientificName,
  rank,
  kingdom = null,
  lifecycleState = "active",
  referenceState,
  createdAt,
  updatedAt = createdAt,
}) {
  const normalizedScientificName = requiredText(scientificName, "Wissenschaftlicher Name");
  const normalizedReferenceState = enumValue(
    referenceState,
    REFERENCE_STATES,
    "Referenzstatus",
  );
  database.prepare(`
    INSERT INTO master_taxon (
      master_taxon_id,
      canonical_scientific_name,
      canonical_name_normalized,
      rank,
      kingdom,
      lifecycle_state,
      reference_state,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requiredText(masterTaxonId, "Master-Taxon-ID"),
    normalizedScientificName,
    normalizeTaxonomySearchTerm(normalizedScientificName),
    requiredText(rank, "Rang").toLocaleLowerCase("en"),
    optionalText(kingdom),
    enumValue(
      lifecycleState,
      new Set(["active", "stale", "deprecated"]),
      "Lebenszyklusstatus",
    ),
    normalizedReferenceState,
    isoTimestamp(createdAt, "Erstellzeitpunkt"),
    isoTimestamp(updatedAt, "Änderungszeitpunkt"),
  );
  return masterTaxonId;
}

export function updateMasterTaxonReference(database, {
  masterTaxonId,
  referenceState,
  updatedAt,
}) {
  const result = database.prepare(`
    UPDATE master_taxon
    SET reference_state = ?, updated_at = ?
    WHERE master_taxon_id = ?
  `).run(
    enumValue(referenceState, REFERENCE_STATES, "Referenzstatus"),
    isoTimestamp(updatedAt, "Änderungszeitpunkt"),
    requiredText(masterTaxonId, "Master-Taxon-ID"),
  );
  if (Number(result.changes) !== 1) {
    throw new Error(`Mastertaxon ${masterTaxonId} wurde nicht gefunden.`);
  }
}

export function addProviderTaxonAssertion(database, {
  releaseId,
  providerRecordId,
  masterTaxonId = null,
  parentProviderRecordId = null,
  acceptedProviderRecordId = null,
  scientificName,
  rank,
  taxonomicStatus = null,
  kingdom = null,
  matchState = "unlinked",
  payloadSha256 = null,
  hierarchy = {},
  importedAt,
  retrievedAt = importedAt,
  versionChangeState = "new",
}) {
  const normalizedName = requiredText(scientificName, "Wissenschaftlicher Quellenname");
  const result = database.prepare(`
    INSERT INTO provider_taxon_assertion (
      release_id,
      provider_record_id,
      master_taxon_id,
      parent_provider_record_id,
      accepted_provider_record_id,
      scientific_name,
      scientific_name_normalized,
      rank,
      taxonomic_status,
      kingdom,
      match_state,
      payload_sha256,
      hierarchy_json,
      retrieved_at,
      version_change_state,
      imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requiredText(releaseId, "Release-ID"),
    requiredText(providerRecordId, "Anbieter-Datensatz-ID"),
    optionalText(masterTaxonId),
    optionalText(parentProviderRecordId),
    optionalText(acceptedProviderRecordId),
    normalizedName,
    normalizeTaxonomySearchTerm(normalizedName),
    requiredText(rank, "Rang").toLocaleLowerCase("en"),
    optionalText(taxonomicStatus),
    optionalText(kingdom),
    enumValue(matchState, MATCH_STATES, "Zuordnungsstatus"),
    optionalText(payloadSha256),
    JSON.stringify(hierarchy ?? {}),
    isoTimestamp(retrievedAt, "Abrufzeitpunkt"),
    enumValue(versionChangeState, VERSION_CHANGE_STATES, "Versionsvergleich"),
    isoTimestamp(importedAt, "Importzeitpunkt"),
  );
  return Number(result.lastInsertRowid);
}

export function addProviderSliceMembership(database, {
  providerTaxonAssertionId,
  relevanceReason,
  observedAt,
}) {
  database.prepare(`
    INSERT OR IGNORE INTO provider_slice_membership (
      provider_taxon_assertion_id,
      relevance_reason,
      observed_at
    ) VALUES (?, ?, ?)
  `).run(
    Number(providerTaxonAssertionId),
    enumValue(relevanceReason, SLICE_REASONS, "Relevanzgrund"),
    isoTimestamp(observedAt, "Beobachtungszeitpunkt"),
  );
}

export function setMasterTaxonStatus(database, {
  masterTaxonId,
  statusName,
  statusDetail = null,
  updatedAt,
  active = true,
}) {
  const normalizedMasterTaxonId = requiredText(masterTaxonId, "Master-Taxon-ID");
  const normalizedStatus = enumValue(statusName, MASTER_STATUSES, "Masterstatus");
  if (!active) {
    database.prepare(`
      DELETE FROM master_taxon_status
      WHERE master_taxon_id = ? AND status_name = ?
    `).run(normalizedMasterTaxonId, normalizedStatus);
    return;
  }
  database.prepare(`
    INSERT INTO master_taxon_status (
      master_taxon_id,
      status_name,
      status_detail,
      updated_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT (master_taxon_id, status_name) DO UPDATE SET
      status_detail = excluded.status_detail,
      updated_at = excluded.updated_at
  `).run(
    normalizedMasterTaxonId,
    normalizedStatus,
    optionalText(statusDetail),
    isoTimestamp(updatedAt, "Statuszeitpunkt"),
  );
}

export function addProviderNameAssertion(database, {
  providerTaxonAssertionId,
  name,
  language = "",
  nameKind,
  preferred = false,
  verified = false,
}) {
  const normalizedName = requiredText(name, "Quellenname").replace(/\s+/g, " ");
  const normalizedSearchName = normalizeTaxonomySearchTerm(normalizedName);
  const normalizedLanguage = String(language ?? "").trim().toLocaleLowerCase("en");
  const normalizedNameKind = enumValue(
    nameKind,
    new Set(["scientific", "synonym", "vernacular", "label"]),
    "Namensart",
  );
  database.prepare(`
    INSERT INTO provider_name_assertion (
      provider_taxon_assertion_id,
      name,
      normalized_name,
      language,
      name_kind,
      preferred,
      verified
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (
      provider_taxon_assertion_id,
      normalized_name,
      language,
      name_kind
    ) DO UPDATE SET
      name = CASE
        WHEN excluded.verified > provider_name_assertion.verified
          OR (
            excluded.verified = provider_name_assertion.verified
            AND excluded.preferred > provider_name_assertion.preferred
          )
        THEN excluded.name
        ELSE provider_name_assertion.name
      END,
      preferred = MAX(provider_name_assertion.preferred, excluded.preferred),
      verified = MAX(provider_name_assertion.verified, excluded.verified)
  `).run(
    Number(providerTaxonAssertionId),
    normalizedName,
    normalizedSearchName,
    normalizedLanguage,
    normalizedNameKind,
    preferred ? 1 : 0,
    verified ? 1 : 0,
  );
  const result = database.prepare(`
    SELECT assertion_id
    FROM provider_name_assertion
    WHERE provider_taxon_assertion_id = ?
      AND normalized_name = ?
      AND language = ?
      AND name_kind = ?
  `).get(
    Number(providerTaxonAssertionId),
    normalizedSearchName,
    normalizedLanguage,
    normalizedNameKind,
  );
  return Number(result.assertion_id);
}

export function addMasterFieldAssertion(database, {
  masterTaxonId,
  fieldName,
  fieldValue,
  language = "",
  originKind,
  providerTaxonAssertionId = null,
  releaseId = null,
  confidence = null,
  reviewState = "pending",
  selected = false,
  createdAt,
  updatedAt = createdAt,
}) {
  const value = requiredText(fieldValue, "Feldwert");
  const normalizedOriginKind = enumValue(
    originKind,
    new Set(["source", "manual", "project"]),
    "Herkunftsart",
  );
  const normalizedReleaseId = requiredText(releaseId, "Release-ID");
  if (normalizedOriginKind === "source" && providerTaxonAssertionId == null) {
    throw new Error("Ein Quellenfeld benötigt eine Taxon-Quellenzeile.");
  }
  if (normalizedOriginKind !== "source" && providerTaxonAssertionId != null) {
    throw new Error("Manuelle und projektbezogene Felder dürfen keine Taxon-Quellenzeile besitzen.");
  }
  const normalizedConfidence = confidence == null ? null : Number(confidence);
  if (
    normalizedConfidence != null
    && (!Number.isFinite(normalizedConfidence)
      || normalizedConfidence < 0
      || normalizedConfidence > 1)
  ) {
    throw new Error("Konfidenz muss zwischen 0 und 1 liegen.");
  }
  const result = database.prepare(`
    INSERT INTO master_field_assertion (
      master_taxon_id,
      field_name,
      field_value,
      normalized_value,
      language,
      origin_kind,
      provider_taxon_assertion_id,
      release_id,
      confidence,
      review_state,
      selected,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requiredText(masterTaxonId, "Master-Taxon-ID"),
    requiredText(fieldName, "Feldname"),
    value,
    normalizeTaxonomySearchTerm(value),
    String(language ?? "").trim().toLocaleLowerCase("en"),
    normalizedOriginKind,
    providerTaxonAssertionId == null ? null : Number(providerTaxonAssertionId),
    normalizedReleaseId,
    normalizedConfidence,
    enumValue(
      reviewState,
      new Set(["pending", "accepted", "rejected", "superseded", "conflict"]),
      "Prüfstatus",
    ),
    selected ? 1 : 0,
    isoTimestamp(createdAt, "Erstellzeitpunkt"),
    isoTimestamp(updatedAt, "Änderungszeitpunkt"),
  );
  return Number(result.lastInsertRowid);
}

export function selectMasterFieldAssertion(database, {
  assertionId,
  updatedAt,
}) {
  const normalizedAssertionId = Number(assertionId);
  return runTransaction(database, () => {
    const candidate = database.prepare(`
      SELECT master_taxon_id, field_name, language
      FROM master_field_assertion
      WHERE assertion_id = ?
    `).get(normalizedAssertionId);
    if (!candidate) throw new Error(`Masterfeld ${assertionId} wurde nicht gefunden.`);
    database.prepare(`
      UPDATE master_field_assertion
      SET selected = 0,
          review_state = CASE
            WHEN review_state = 'accepted' THEN 'superseded'
            ELSE review_state
          END,
          updated_at = ?
      WHERE master_taxon_id = ?
        AND field_name = ?
        AND language = ?
        AND selected = 1
    `).run(
      isoTimestamp(updatedAt, "Änderungszeitpunkt"),
      candidate.master_taxon_id,
      candidate.field_name,
      candidate.language,
    );
    database.prepare(`
      UPDATE master_field_assertion
      SET selected = 1, review_state = 'accepted', updated_at = ?
      WHERE assertion_id = ?
    `).run(
      isoTimestamp(updatedAt, "Änderungszeitpunkt"),
      normalizedAssertionId,
    );
    return normalizedAssertionId;
  });
}

export function addMasterConflict(database, {
  conflictId,
  masterTaxonId,
  fieldName = null,
  currentAssertionId = null,
  candidateAssertionId = null,
  conflictType,
  detectedAt,
  resolutionNote = null,
}) {
  database.prepare(`
    INSERT INTO master_conflict (
      conflict_id,
      master_taxon_id,
      field_name,
      current_assertion_id,
      candidate_assertion_id,
      conflict_type,
      conflict_state,
      detected_at,
      resolution_note
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(
    requiredText(conflictId, "Konflikt-ID"),
    requiredText(masterTaxonId, "Master-Taxon-ID"),
    optionalText(fieldName),
    currentAssertionId == null ? null : Number(currentAssertionId),
    candidateAssertionId == null ? null : Number(candidateAssertionId),
    enumValue(
      conflictType,
      new Set([
        "changed-value",
        "source-removed",
        "ambiguous-match",
        "reference-gap",
        "reference-returned",
      ]),
      "Konfliktart",
    ),
    isoTimestamp(detectedAt, "Konfliktzeitpunkt"),
    optionalText(resolutionNote),
  );
  return conflictId;
}

export function addMasterTaxonAlias(database, {
  masterTaxonId,
  name,
  rank = null,
  kingdom = null,
  aliasType = "synonym",
  sourceAssertionId = null,
}) {
  const normalizedName = requiredText(name, "Aliasname");
  const result = database.prepare(`
    INSERT INTO master_taxon_alias (
      master_taxon_id,
      name,
      normalized_name,
      rank,
      kingdom,
      alias_type,
      source_assertion_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (master_taxon_id, normalized_name, alias_type) DO UPDATE SET
      name = excluded.name,
      rank = COALESCE(excluded.rank, master_taxon_alias.rank),
      kingdom = COALESCE(excluded.kingdom, master_taxon_alias.kingdom),
      source_assertion_id = COALESCE(
        excluded.source_assertion_id,
        master_taxon_alias.source_assertion_id
      )
  `).run(
    requiredText(masterTaxonId, "Master-Taxon-ID"),
    normalizedName,
    normalizeTaxonomySearchTerm(normalizedName),
    optionalText(rank)?.toLocaleLowerCase("en") ?? null,
    optionalText(kingdom),
    enumValue(
      aliasType,
      new Set(["former-name", "synonym", "project-name"]),
      "Aliasart",
    ),
    sourceAssertionId == null ? null : Number(sourceAssertionId),
  );
  return Number(result.lastInsertRowid || 0);
}

export function resolveMasterConflict(database, {
  conflictId,
  conflictState,
  resolvedAt,
  resolutionNote = null,
}) {
  const state = enumValue(
    conflictState,
    new Set(["resolved-keep", "resolved-accept", "resolved-manual", "dismissed"]),
    "Konfliktentscheidung",
  );
  const result = database.prepare(`
    UPDATE master_conflict
    SET conflict_state = ?, resolved_at = ?, resolution_note = ?
    WHERE conflict_id = ?
  `).run(
    state,
    isoTimestamp(resolvedAt, "Entscheidungszeitpunkt"),
    optionalText(resolutionNote),
    requiredText(conflictId, "Konflikt-ID"),
  );
  if (Number(result.changes) !== 1) {
    throw new Error(`Konflikt ${conflictId} wurde nicht gefunden.`);
  }
  return conflictId;
}

export function addMasterDecision(database, {
  decisionId,
  masterTaxonId,
  conflictId = null,
  fieldName = null,
  language = "",
  decisionType,
  selectedAssertionId = null,
  decidedAt,
  note = null,
}) {
  database.prepare(`
    INSERT INTO master_decision (
      decision_id,
      master_taxon_id,
      conflict_id,
      field_name,
      language,
      decision_type,
      selected_assertion_id,
      decided_at,
      note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requiredText(decisionId, "Entscheidungs-ID"),
    requiredText(masterTaxonId, "Master-Taxon-ID"),
    optionalText(conflictId),
    optionalText(fieldName),
    String(language ?? "").trim().toLocaleLowerCase("en"),
    enumValue(
      decisionType,
      new Set(["keep-current", "accept-candidate", "add-alias", "protect-manual"]),
      "Entscheidungsart",
    ),
    selectedAssertionId == null ? null : Number(selectedAssertionId),
    isoTimestamp(decidedAt, "Entscheidungszeitpunkt"),
    optionalText(note),
  );
  return decisionId;
}

export function linkProjectTaxon(database, {
  projectTaxonKey,
  masterTaxonId,
  projectSlug,
  scientificNameAtLink,
  linkState = "linked",
  linkedAt,
  updatedAt = linkedAt,
}) {
  database.prepare(`
    INSERT INTO project_taxon_link (
      project_taxon_key,
      master_taxon_id,
      project_slug,
      scientific_name_at_link,
      link_state,
      linked_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    requiredText(projectTaxonKey, "Projekt-Taxon-Schlüssel"),
    requiredText(masterTaxonId, "Master-Taxon-ID"),
    requiredText(projectSlug, "Projekt-Slug"),
    requiredText(scientificNameAtLink, "Wissenschaftlicher Projektname"),
    enumValue(
      linkState,
      new Set(["linked", "pending", "conflict"]),
      "Projekt-Zuordnungsstatus",
    ),
    isoTimestamp(linkedAt, "Zuordnungszeitpunkt"),
    isoTimestamp(updatedAt, "Änderungszeitpunkt"),
  );
}
