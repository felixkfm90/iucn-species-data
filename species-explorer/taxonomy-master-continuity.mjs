import { statSync } from "node:fs";
import { configureTaxonomyBuildDatabase } from "./taxonomy-build-cache.mjs";

// A confirmed split/merge retains predecessors as deprecated identities. An
// unexplained disappearing ID must never be mistaken for a conflict-free build.
export function inspectMasterTaxonContinuity({ previousPath, currentPath, currentDatabase, DatabaseSync }) {
  try { statSync(previousPath); }
  catch (error) {
    if (error.code === "ENOENT") return { checked: 0, missing: 0, examples: [] };
    throw error;
  }
  let previous, current;
  try {
    previous = configureTaxonomyBuildDatabase(new DatabaseSync(previousPath, { readOnly: true }));
    current = currentDatabase || configureTaxonomyBuildDatabase(new DatabaseSync(currentPath, { readOnly: true }));
    const lookup = current.prepare("SELECT 1 FROM master_taxon WHERE master_taxon_id = ?");
    let checked = 0, missing = 0;
    const examples = [];
    for (const row of previous.prepare("SELECT master_taxon_id, canonical_scientific_name FROM master_taxon").iterate()) {
      checked += 1;
      if (lookup.get(row.master_taxon_id)) continue;
      missing += 1;
      if (examples.length < 5) examples.push(row.canonical_scientific_name);
    }
    return { checked, missing, examples };
  } finally {
    previous?.close();
    if (!currentDatabase) current?.close();
  }
}

export function assertMasterTaxonIdsRetained(options) {
  const { checked, missing, examples } = inspectMasterTaxonContinuity(options);
  if (missing) throw new Error(`${missing.toLocaleString("de-DE")} bisherige Master-ID(s) fehlen im neuen Stand (${examples.join(", ")}). Aktivierung gesperrt: Eingänge beziehungsweise bestätigte Identitätsfortführung prüfen; keine Fotos neu zuweisen.`);
  return { checked, missing };
}
