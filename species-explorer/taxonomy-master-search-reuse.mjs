import { pathToFileURL } from "node:url";

// Only called after the bound input/rules/dependency and source-order checks.
// Search text contains no release timestamps or assertion IDs. Markers share the
// taxon's transaction/checkpoint. Terms are copied together in the final block,
// in their original order, avoiding random index writes interleaved with fields.
export function createMasterSearchReuseMarker(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS master_build_reused_search (
    master_taxon_id TEXT PRIMARY KEY REFERENCES master_taxon(master_taxon_id)
  ) WITHOUT ROWID`);
  const mark = database.prepare("INSERT INTO master_build_reused_search VALUES(?)");
  return (id) => mark.run(id);
}

export function copyMasterSearchTerms(database, previousPath, expectedTaxa) {
  const present = database.prepare("SELECT 1 FROM sqlite_master WHERE name='master_build_reused_search'").get();
  const count = present ? database.prepare("SELECT COUNT(*) AS n FROM master_build_reused_search").get().n : 0;
  if (count !== expectedTaxa) throw new Error("Gesicherte Suchbegriffe passen nicht zum Master-Aufbaucheckpoint.");
  if (!present) return { reusedTaxa: 0, reusedTerms: 0, present: false };
  database.prepare("ATTACH DATABASE ? AS reuse_search_source")
    .run(`${pathToFileURL(previousPath).href}?mode=ro`);
  if (database.prepare(`SELECT 1 FROM master_build_reused_search r WHERE NOT EXISTS (
    SELECT 1 FROM reuse_search_source.master_search_term t WHERE t.master_taxon_id=r.master_taxon_id) LIMIT 1`).get()) {
    throw new Error("Wiederverwendete Masterart besitzt keine gesicherten Suchbegriffe.");
  }
  const copied = database.prepare(`INSERT INTO master_search_term (
      master_taxon_id,term,normalized_term,folded_term,german_key,term_kind,language,source_provider,weight)
    SELECT master_taxon_id,term,normalized_term,folded_term,german_key,term_kind,language,source_provider,weight
    FROM reuse_search_source.master_search_term NOT INDEXED
    WHERE master_taxon_id IN (SELECT master_taxon_id FROM master_build_reused_search)
    ORDER BY search_term_id`).run();
  return { reusedTaxa: count, reusedTerms: Number(copied.changes), present: true };
}
