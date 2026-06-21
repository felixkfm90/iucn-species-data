(function registerSpeciesExplorerFilters(root) {
  function normalize(value) {
    return String(value ?? "").trim().toLocaleLowerCase("de");
  }

  function filterSpecies(species, { query = "", status = "", flag = "" } = {}) {
    const normalizedQuery = normalize(query);

    return species.filter((entry) => {
      const matchesQuery = !normalizedQuery || [
        entry.germanName,
        entry.scientificName,
        entry.slug,
        entry.safeName,
      ].some((value) => normalize(value).includes(normalizedQuery));
      const matchesStatus = !status || entry.iucn.status === status;
      const matchesFlag = !flag
        || (flag === "nc" && entry.isNcSound)
        || (flag === "manual-map" && entry.isManualMap)
        || (flag === "missing-portrait" && entry.missingPortrait)
        || (flag === "data-issues" && entry.dataIssues.length > 0)
        || (flag === "asset-issues" && entry.assetIssues.length > 0)
        || (flag === "issues" && entry.inconsistencies.length > 0);

      return matchesQuery && matchesStatus && matchesFlag;
    });
  }

  root.SpeciesExplorerFilters = { filterSpecies };
}(globalThis));
