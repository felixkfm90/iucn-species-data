/** One species, explicit providers and outputs; no register writes or publication. */
export function createSpeciesPipeline({ prepareSpeciesData, downloadSoundIfMissing, downloadMapForSpecies,
  sanitizeAssetName, isManualAsset, logger = console } = {}) {
  for (const [name, value] of Object.entries({ prepareSpeciesData, downloadSoundIfMissing, downloadMapForSpecies,
    sanitizeAssetName, isManualAsset })) {
    if (typeof value !== "function") throw new TypeError(`Der Einartlauf benötigt ${name}.`);
  }

  async function runSpecies(input, { mode = "all", existingData } = {}) {
    if (!["all", "missing", "manual-maps", "nc-sounds"].includes(mode)) throw new TypeError("Ungültiger Einartmodus.");
    const prepared = await prepareSpeciesData(input, { existingData, assetOnly: mode === "manual-maps" || mode === "nc-sounds" });
    const { data } = prepared;
    const soundStatus = mode === "manual-maps" ? "ok" : await downloadSoundIfMissing(input.genus, input.species, input.german,
      { forceAlternativeSearch: mode === "nc-sounds" });
    const recheckProtectedMap = mode === "all" && isManualAsset(sanitizeAssetName(input.german), "map");
    const mapStatus = mode === "nc-sounds" ? "ok" : await downloadMapForSpecies(data,
      mode === "manual-maps" || recheckProtectedMap ? { force: true, allowManual: true, recordAssessment: false } : undefined);
    const speciesOk = data && data["Wissenschaftlicher Name"] !== "n/a" && data["Assessment ID"] && data["Assessment ID"] !== "n/a";
    const soundLabel = mode === "manual-maps" ? "nicht geprüft" : soundStatus;
    const mapLabel = mode === "nc-sounds" ? "nicht geprüft" : mapStatus;
    const dataLabel = speciesOk ? "ok" : "n/a";
    const hasError = soundLabel === "error" || mapLabel === "error";
    const hasBlocked = soundLabel === "locked" || mapLabel === "locked";
    const hasMissing = soundLabel === "missing" || mapLabel === "missing" || mapLabel === "n/a" || dataLabel === "n/a";
    const icon = hasError ? "❌" : hasBlocked || hasMissing ? "⚠" : "✅";
    const germanName = data["Deutscher Name"] || input.german || "unbekannt";
    const scientificName = data["Wissenschaftlicher Name"] || `${input.genus} ${input.species}`;
    logger.log(`${icon} Fertig: ${germanName} - ${scientificName} (Sound: ${soundLabel}, Map: ${mapLabel}, Spezies-Data: ${dataLabel})`);
    logger.log("");
    return { ...prepared, soundStatus, mapStatus, soundLabel, mapLabel, dataLabel };
  }

  return Object.freeze({ runSpecies });
}
