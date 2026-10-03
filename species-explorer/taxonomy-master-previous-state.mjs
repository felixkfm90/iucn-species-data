import { configureTaxonomyBuildDatabase } from "./taxonomy-build-cache.mjs";
import { existsSync } from "node:fs";

import { addProviderTaxonAssertion, registerProviderRelease } from "./taxonomy-master-model.mjs";
import { emptyIdentityRegistry, readIdentityRegistry } from "./taxonomy-identity-registry.mjs";

function openSnapshot(databasePath, DatabaseSync) {
  if (!databasePath || !existsSync(databasePath)) return null;
  const database = configureTaxonomyBuildDatabase(new DatabaseSync(databasePath, { readOnly: true }));
  try {
    const fields = database.prepare(`
      SELECT field.*, release.provider, release.provider_version
      FROM master_field_assertion field
      JOIN provider_release release ON release.release_id = field.release_id
      WHERE field.selected = 1 AND field.master_taxon_id = ?
    `);
    const decisions = database.prepare(`
      SELECT decision.decision_id, decision.field_name, decision.language,
        decision.decision_type, decision.decided_at, field.field_value
      FROM master_decision decision
      LEFT JOIN master_field_assertion field ON field.assertion_id = decision.selected_assertion_id
      WHERE decision.master_taxon_id = ?
    `);
    const protection = database.prepare(`SELECT status_detail FROM master_taxon_status
      WHERE master_taxon_id = ? AND status_name = 'manually-protected'`);
    return { database, fields, decisions, protection };
  } catch (error) {
    database.close();
    throw error;
  }
}

// Fehlende Anbieterfelder bleiben belegte Quellenwerte, keine Benutzerentscheidung.
// Alte fehlerhafte Trägerzeilen werden nur mit einem identischen Quellenbeleg aus
// dem vorherigen Master und ohne ausdrückliche Feldentscheidung zurückgeführt.
export function openPreviousMasterState(databasePath, DatabaseSync, { historyPath } = {}) {
  const active = openSnapshot(databasePath, DatabaseSync);
  let history;
  let taxa;
  let aliases;
  let identityRegistry;
  const origins = new WeakMap();
  try {
    history = active ? openSnapshot(historyPath, DatabaseSync) : null;
    identityRegistry = active ? readIdentityRegistry(active.database) : emptyIdentityRegistry();
    taxa = new Map(active ? active.database.prepare(`
      SELECT master.master_taxon_id, master.canonical_scientific_name,
        master.rank, master.kingdom, master.reference_state, master.lifecycle_state,
        COUNT(source.assertion_id) AS source_count
      FROM master_taxon master
      LEFT JOIN provider_taxon_assertion source
        ON source.master_taxon_id = master.master_taxon_id
      GROUP BY master.master_taxon_id
    `).all().map((row) => [row.master_taxon_id, { ...row }]) : []);
    aliases = active?.database.prepare(`
      SELECT * FROM master_taxon_alias WHERE master_taxon_id = ?
    `);
  } catch (error) {
    history?.database.close();
    active?.database.close();
    throw error;
  }
  let closed = false;
  return {
    taxa,
    identityRegistry,
    projectsFor(masterTaxonId) {
      return active?.database.prepare(`SELECT project_taxon_key AS projectTaxonKey, project_slug AS projectSlug,
        scientific_name_at_link AS scientificNameAtLink FROM project_taxon_link WHERE master_taxon_id = ?`)
        .all(masterTaxonId).map((row) => ({ ...row })) || [];
    },
    decisionsFor(masterTaxonId) {
      return active?.decisions.all(masterTaxonId).map((row) => ({ ...row })) || [];
    },
    decisionProtectionFor(masterTaxonId) {
      const detail = active?.protection.get(masterTaxonId)?.status_detail;
      if (!detail) return [];
      let marker;
      try { marker = JSON.parse(detail); } catch { return []; }
      if (marker.kind !== "own-field-decision-protection" || marker.version !== 1 || !Array.isArray(marker.decisions)) return [];
      if (marker.decisions.some((decision) => !decision || typeof decision.decisionId !== "string"
          || typeof decision.sourceMasterVersion !== "string" || typeof decision.fieldName !== "string"
          || typeof decision.decisionType !== "string" || typeof decision.decidedAt !== "string")) {
        throw new Error("Ungültige Herkunft des eigenen Taxon-Schutzmarkers.");
      }
      return marker.decisions;
    },
    evidenceFor(masterTaxonId) {
      return active?.database.prepare(`SELECT release.provider, release.provider_version AS providerVersion,
        source.provider_record_id AS providerRecordId FROM provider_taxon_assertion source
        JOIN provider_release release ON release.release_id = source.release_id
        WHERE source.master_taxon_id = ? AND source.version_change_state != 'removed'`)
        .all(masterTaxonId).map((row) => ({ ...row })) || [];
    },
    fieldsFor(masterTaxonId, protectedKeys = new Set()) {
      const rows = active?.fields.all(masterTaxonId) || [];
      const legacy = rows.filter((row) => row.origin_kind === "manual"
        && row.provider === "manual" && row.created_at === row.provider_version);
      const historicalFields = legacy.length ? history?.fields.all(masterTaxonId) || [] : [];
      const decisionKeys = new Set(legacy.length
        ? [active, history].flatMap((snapshot) => snapshot?.decisions.all(masterTaxonId) || [])
          .map((row) => `${row.field_name}|${row.language || ""}`)
        : []);
      return rows.map((row) => {
        const key = `${row.field_name}|${row.language || ""}`;
        const historical = legacy.includes(row) && !protectedKeys.has(key) && !decisionKeys.has(key)
          ? historicalFields.find((old) => old.origin_kind === "source"
            && old.field_name === row.field_name && old.language === row.language
            && old.field_value === row.field_value)
          : null;
        const field = { ...(historical || row) };
        origins.set(field, historical ? history.database : active.database);
        return field;
      });
    },
    aliasesFor: (masterTaxonId) => aliases?.all(masterTaxonId).map((row) => ({ ...row })) || [],
    retainSource(database, field, masterTaxonId) {
      const sourceDatabase = origins.get(field);
      if (!sourceDatabase || field.origin_kind !== "source") {
        throw new Error("Die ursprüngliche Quelle des übernommenen Masterfelds fehlt.");
      }
      const source = sourceDatabase.prepare(`
        SELECT * FROM provider_taxon_assertion WHERE assertion_id = ?
      `).get(field.provider_taxon_assertion_id);
      const release = sourceDatabase.prepare(`
        SELECT * FROM provider_release WHERE release_id = ?
      `).get(field.release_id);
      if (!source || !release || source.release_id !== release.release_id) {
        throw new Error("Das übernommene Masterfeld hat keine eindeutige Quellenprovenienz.");
      }
      if (!database.prepare("SELECT 1 FROM provider_release WHERE release_id = ?").get(release.release_id)) {
        registerProviderRelease(database, {
          releaseId: release.release_id,
          provider: release.provider,
          providerVersion: release.provider_version,
          dataScope: release.data_scope,
          releaseState: "archived",
          issuedAt: release.issued_at,
          importedAt: release.imported_at,
          sourceUrl: release.source_url,
          checksumSha256: release.checksum_sha256,
          license: release.license,
          recordCount: release.record_count,
          metadata: JSON.parse(release.metadata_json),
        });
      }
      const existing = database.prepare(`
        SELECT assertion_id, master_taxon_id FROM provider_taxon_assertion
        WHERE release_id = ? AND provider_record_id = ?
      `).get(source.release_id, source.provider_record_id);
      if (existing && existing.master_taxon_id !== masterTaxonId) {
        throw new Error("Der alte Quellenbeleg gehört im Kandidaten zu einer anderen Master-Art.");
      }
      const assertionId = existing?.assertion_id || addProviderTaxonAssertion(database, {
        releaseId: source.release_id,
        providerRecordId: source.provider_record_id,
        masterTaxonId,
        parentProviderRecordId: source.parent_provider_record_id,
        acceptedProviderRecordId: source.accepted_provider_record_id,
        scientificName: source.scientific_name,
        rank: source.rank,
        taxonomicStatus: source.taxonomic_status,
        kingdom: source.kingdom,
        matchState: "stale",
        payloadSha256: source.payload_sha256,
        hierarchy: JSON.parse(source.hierarchy_json),
        importedAt: source.imported_at,
        retrievedAt: source.retrieved_at,
        versionChangeState: "removed",
      });
      return { providerTaxonAssertionId: assertionId, releaseId: source.release_id };
    },
    close() {
      if (closed) return;
      closed = true;
      taxa.clear();
      active?.database.close();
      history?.database.close();
    },
  };
}
