import { openTaxonomyMasterStore } from "./taxonomy-master-store.mjs";
import { defaultTaxonomyRoot } from "./taxonomy-storage.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

const binomial = /^[\p{L}][\p{L}-]* [\p{L}][\p{L}-]*$/u;

function matchingIds(store, name) {
  const normalized = normalizeTaxonomySearchTerm(name);
  const rows = store.exactIndexedSearchRows ? store.exactIndexedSearchRows.all(normalized) : [
    ...store.exactCanonicalRows.all(normalized),
    ...store.exactAliasRows.all(normalized),
  ];
  return [...new Set(rows.filter(row => row.rank === "species" && row.lifecycle_state === "active")
    .map(row => row.master_taxon_id))];
}

/** Resolve only indexed names of the same active master species, never supplied alias lists. */
export async function readIucnMasterReference(input, { taxonomyRoot = defaultTaxonomyRoot() } = {}) {
  const store = await openTaxonomyMasterStore({ taxonomyRoot });
  try {
    if (store.available === false) return null;
    const name = `${input.genus} ${input.species}`;
    const selectedId = input.masterTaxonId || (String(input.taxonomyReference || "").startsWith("mtx_") ? input.taxonomyReference : "");
    const ids = matchingIds(store, name);
    if (!selectedId && ids.length === 0) return null;
    if ((!selectedId && ids.length !== 1) || selectedId && !ids.includes(selectedId)) {
      throw new Error("Die Art ist dem Taxonomie-Master nicht eindeutig zugeordnet. Bitte die Referenz prüfen.");
    }
    const taxon = store.taxon(selectedId || ids[0]);
    if (!taxon || taxon.lifecycleState !== "active" || taxon.assignmentAllowed === false
        || taxon.masterStatuses.some(status => status.id === "conflicting")) {
      throw new Error("Die Masterzuordnung dieser Art muss vor der IUCN-Suche geprüft werden.");
    }
    const synonyms = [...new Set(taxon.scientificNames
      .filter(entry => ["accepted", "synonym"].includes(entry.relationship) && entry.rank === "species" && binomial.test(entry.scientific_name))
      .map(entry => entry.scientific_name))].filter(alias => normalizeTaxonomySearchTerm(alias) !== normalizeTaxonomySearchTerm(name));
    // An alias shared with another active species cannot authorize an assessment match.
    for (const alias of synonyms) {
      if (matchingIds(store, alias).some(id => id !== taxon.masterTaxonId)) {
        throw new Error(`Das bekannte Synonym ${alias} ist mehreren Masterarten zugeordnet. Bitte die Referenz prüfen.`);
      }
    }
    if (synonyms.length > 100) throw new Error("Die Art hat zu viele Synonyme für einen eindeutigen IUCN-Abgleich. Bitte die Zuordnung prüfen.");
    return { masterTaxonId: taxon.masterTaxonId, masterVersion: taxon.masterCandidateId,
      scientificName: taxon.acceptedScientificName, synonyms,
      hierarchy: Object.fromEntries(taxon.hierarchy.map(entry => [entry.rank, entry.scientificName || entry.scientific_name])) };
  } finally { store.close(); }
}
