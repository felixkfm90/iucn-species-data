import { openTaxonomyMasterStore } from "./taxonomy-master-store.mjs";

// Deliberately limited to indexed searches and pages of project links. Never
// infer a split/merge from similar names or enumerate the complete master here.
export function identityTaxonDetails(database, id) {
  const row = database.prepare(`SELECT master_taxon_id AS masterTaxonId, canonical_scientific_name AS scientificName,
    rank, kingdom, lifecycle_state AS lifecycleState FROM master_taxon WHERE master_taxon_id = ?`).get(id);
  if (!row || row.lifecycleState === "deprecated") throw new Error("Eine ausgewählte Art ist nicht mehr als aktuelle Identität verfügbar.");
  const names = database.prepare(`SELECT field_name, field_value, origin_kind FROM master_field_assertion
    WHERE master_taxon_id = ? AND selected = 1 AND field_name IN ('german-name', 'english-name') ORDER BY field_name`).all(id);
  const evidence = database.prepare(`SELECT release.provider, release.provider_version AS providerVersion,
    source.provider_record_id AS providerRecordId FROM provider_taxon_assertion source
    JOIN provider_release release ON release.release_id = source.release_id
    WHERE source.master_taxon_id = ? AND source.version_change_state != 'removed'
    ORDER BY release.provider, release.provider_version, source.provider_record_id`).all(id).map((item) => ({ ...item }));
  const projects = database.prepare(`SELECT project_taxon_key AS projectTaxonKey, project_slug AS projectSlug,
    scientific_name_at_link AS scientificNameAtLink
    FROM project_taxon_link WHERE master_taxon_id = ? ORDER BY project_taxon_key`).all(id).map((item) => ({ ...item }));
  return { ...row, germanName: names.find((entry) => entry.field_name === "german-name")?.field_value || "",
    englishName: names.find((entry) => entry.field_name === "english-name")?.field_value || "", names, evidence, projects };
}

function publicDetails(store, id) {
  const value = identityTaxonDetails(store.database, id);
  const correction = store.correctionsByTaxonId.get(id);
  // Match the active reader's current name, including the small correction layer.
  if (correction) {
    const detail = store.taxon(id);
    value.germanName = detail?.preferredGermanName || value.germanName;
    value.englishName = detail?.preferredEnglishName || value.englishName;
  }
  return value;
}

export async function browseIdentityCases(taxonomyRoot, { mode = "projects", slot = "active", query = "", after = "" } = {}) {
  if (!["projects", "search"].includes(mode) || !["active", "staging"].includes(slot)) throw new Error("Unbekannte Fallauswahl.");
  if (typeof query !== "string" || query.length > 200 || typeof after !== "string" || after.length > 300) throw new Error("Die Suchanfrage ist zu lang.");
  if (mode === "search" && query.trim().length < 2) return { available: true, results: [] };
  const stores = [];
  try {
    const selected = await openTaxonomyMasterStore({ taxonomyRoot, slot: mode === "projects" ? "active" : slot });
    stores.push(selected);
    if (selected.available === false) return { available: false, results: [], cases: [], message: "Für die Fallprüfung werden ein aktiver Master und ein geprüfter Kandidat benötigt. Es wird kein Aufbau automatisch gestartet." };
    if (!selected.hasSearchIndex) throw new Error("Dieser ältere Master besitzt noch keinen begrenzten Suchindex. Bitte zuerst einen aktuellen Kandidaten bereitstellen.");
    if (mode === "search") {
      const search = selected.search({ query: query.trim(), rank: "species", kingdom: "all", limit: 20 });
      return { available: true, version: selected.manifest.candidateId,
        results: search.results.map((entry) => publicDetails(selected, entry.masterTaxonId)) };
    }
    const candidate = await openTaxonomyMasterStore({ taxonomyRoot, slot: "staging" });
    stores.push(candidate);
    if (candidate.available === false) return { available: false, cases: [], message: "Noch kein Kandidat vorhanden. Eine Fallprüfung startet keinen Datenbankaufbau." };
    const links = selected.database.prepare(`SELECT project_taxon_key, master_taxon_id FROM project_taxon_link
      WHERE project_taxon_key > ? ORDER BY project_taxon_key LIMIT 21`).all(after);
    const cases = [];
    for (const link of links.slice(0, 20)) {
      const source = publicDetails(selected, link.master_taxon_id);
      const target = candidate.database.prepare(`SELECT canonical_scientific_name, lifecycle_state FROM master_taxon
        WHERE master_taxon_id = ?`).get(source.masterTaxonId);
      if (!target || target.lifecycle_state !== "active" || target.canonical_scientific_name !== source.scientificName) {
        cases.push({ projectTaxonKey: link.project_taxon_key, source, reason: !target
          ? "Die bisherige Zuordnung fehlt im Kandidaten. Ein Nachfolger ist damit noch nicht belegt."
          : target.lifecycle_state !== "active" ? "Die bisherige Art ist im Kandidaten nicht mehr aktiv."
            : "Der wissenschaftliche Name dieser Zuordnung hat sich geändert. Bitte prüfen, ob dieselbe Art gemeint ist." });
      }
    }
    return { available: true, cases, checked: Math.min(20, links.length),
      next: links.length > 20 ? links[19].project_taxon_key : "", activeVersion: selected.manifest.candidateId,
      candidateVersion: candidate.manifest.candidateId, photoCountsKnown: false };
  } finally { for (const store of stores.reverse()) store.close(); }
}
