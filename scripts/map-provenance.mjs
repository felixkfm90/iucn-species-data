// Acquisition, declared content care and overwrite protection are independent.
// Legacy `manual` remains an additional fail-closed protection signal.
export function isMapProtected(map, legacyManual = false) {
  return map?.protectFromPipeline === true || map?.manual === true
    || (typeof map?.manual !== "boolean" && legacyManual);
}

export function mapCareState(map, legacyManual = false) {
  const provenance = map?.provenance;
  const browserImported = map?.careMode === "provider"
    && provenance?.provider === "iucn"
    && provenance?.acquisition === "browser-file"
    && provenance?.assurance === "user-declared";
  const protectedFromPipeline = isMapProtected(map, legacyManual);
  return {
    protectedFromPipeline,
    browserImported,
    ownCare: !browserImported && (map?.careMode === "manual"
      || map?.manual === true || (typeof map?.manual !== "boolean" && legacyManual)),
    careMode: browserImported ? "provider" : map?.careMode || "legacy",
    provenance: provenance ?? null,
  };
}

export function createMapImportCare(payload, species) {
  const importMode = payload?.careMode ?? "manual";
  if (!["manual", "iucn-browser"].includes(importMode)) {
    throw new Error("Ungültige Karten-Pflegewahl.");
  }
  if (importMode === "manual") {
    return { importMode, careMode: "manual", provenance: {
      provider: "unspecified", acquisition: payload?.imageBase64 ? "file" : "url",
      assurance: "unverified",
    } };
  }
  if (!payload?.imageBase64) {
    throw new Error("Die IUCN-Browserangabe erfordert eine lokal gespeicherte Kartendatei.");
  }
  const assessmentId = String(species?.iucn?.assessmentId ?? "").trim();
  const source = String(payload?.source ?? "").trim();
  const canonicalUrl = `https://www.iucnredlist.org/api/v4/assessments/${assessmentId}/distribution_map/jpg`;
  if (!/^\d+$/.test(assessmentId) || source !== canonicalUrl) {
    throw new Error("Für die IUCN-Browserangabe ist der unveränderte IUCN-Kartenlink dieser Bewertung erforderlich.");
  }
  const fileAssessment = String(payload?.originalName ?? "")
    .match(/^T\d+A(\d+)(?:\s*\(\d+\))?\.(?:jpe?g|png)$/i)?.[1];
  if (fileAssessment && fileAssessment !== assessmentId) {
    throw new Error("Die IUCN-Datei gehört zu einer anderen Bewertung.");
  }
  return { importMode, careMode: "provider", provenance: {
    provider: "iucn", acquisition: "browser-file", assurance: "user-declared",
    assessmentId, canonicalUrl,
  } };
}
