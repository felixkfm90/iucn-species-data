// A single bounded page of read-only source rows. This is NOT a validation cache:
// the copier still sends each value through the existing model validators.
export function createMasterReuseReader(database, orderedIds, { batchSize = 128 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 128) throw new Error("Ungültige Master-Lesegruppe.");
  const ids = [...new Set(orderedIds)], positions = new Map(ids.map((id, index) => [id, index]));
  if (ids.some((id) => typeof id !== "string" || !id)) throw new Error("Ungültige Master-Leseidentität.");
  const slots = Array.from({ length: batchSize }, () => "?").join(",");
  const taxon = database.prepare(`SELECT master_taxon_id,canonical_scientific_name,rank,kingdom,lifecycle_state,reference_state
    FROM master_taxon WHERE master_taxon_id IN (${slots})`);
  const sources = database.prepare(`SELECT a.master_taxon_id,a.assertion_id,a.provider_record_id,a.parent_provider_record_id,
    a.accepted_provider_record_id,a.scientific_name,a.rank,a.taxonomic_status,a.kingdom,a.match_state,
    a.hierarchy_json,r.provider,r.release_state FROM provider_taxon_assertion a
    JOIN provider_release r USING(release_id) WHERE a.master_taxon_id IN (${slots}) ORDER BY a.assertion_id`);
  const fields = database.prepare(`SELECT master_taxon_id,provider_taxon_assertion_id,origin_kind,field_name,field_value,language,
    confidence,review_state,selected FROM master_field_assertion WHERE master_taxon_id IN (${slots}) ORDER BY assertion_id`);
  const names = database.prepare(`SELECT a.master_taxon_id,n.provider_taxon_assertion_id,n.name,n.language,n.name_kind,n.preferred,n.verified
    FROM provider_taxon_assertion a JOIN provider_name_assertion n ON n.provider_taxon_assertion_id=a.assertion_id
    WHERE a.master_taxon_id IN (${slots}) ORDER BY n.assertion_id`);
  const memberships = database.prepare(`SELECT a.master_taxon_id,m.provider_taxon_assertion_id,m.relevance_reason
    FROM provider_taxon_assertion a JOIN provider_slice_membership m ON m.provider_taxon_assertion_id=a.assertion_id
    WHERE a.master_taxon_id IN (${slots}) ORDER BY m.provider_taxon_assertion_id,m.relevance_reason`);
  const statuses = database.prepare(`SELECT master_taxon_id,status_name,status_detail FROM master_taxon_status
    WHERE master_taxon_id IN (${slots}) ORDER BY master_taxon_id,status_name`);
  let cache = new Map(), closed = false;
  const groupSourceRows = (rows, page, key) => {
    for (const row of rows) {
      const grouped = page.get(row.master_taxon_id)[key], sourceId = row.provider_taxon_assertion_id;
      if (!grouped.has(sourceId)) grouped.set(sourceId, []);
      grouped.get(sourceId).push(row);
    }
  };
  return {
    read(id) {
      if (closed) throw new Error("Master-Lesegruppe ist geschlossen.");
      if (!positions.has(id)) throw new Error("Unbekannte Master-Leseidentität.");
      if (!cache.has(id)) {
        const start = Math.floor(positions.get(id) / batchSize) * batchSize;
        const selected = ids.slice(start, start + batchSize), params = [...selected];
        while (params.length < batchSize) params.push(null);
        const page = new Map(selected.map((key) => [key, { taxon: null, sources: [], fields: [], statuses: [],
          names: new Map(), memberships: new Map() }]));
        for (const row of taxon.all(...params)) page.get(row.master_taxon_id).taxon = row;
        for (const row of sources.all(...params)) page.get(row.master_taxon_id).sources.push(row);
        for (const row of fields.all(...params)) page.get(row.master_taxon_id).fields.push(row);
        groupSourceRows(names.all(...params), page, "names");
        groupSourceRows(memberships.all(...params), page, "memberships");
        for (const row of statuses.all(...params)) page.get(row.master_taxon_id).statuses.push(row);
        cache = page; // Failed reads never publish a partial page.
      }
      return cache.get(id);
    },
    close() { closed = true; cache.clear(); positions.clear(); ids.length = 0; },
  };
}
