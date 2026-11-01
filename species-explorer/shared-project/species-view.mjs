import { validateSpeciesRecord } from "./species-record.mjs";

const UNKNOWN = "Unbekannt";
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function publicText(value, fallback = "", limit = 8000) {
  if (!(typeof value === "string" || typeof value === "number" && Number.isFinite(value))) return fallback;
  const text = String(value);
  if (text.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)
    || /(?:\b[a-z]:[\\/]|\\\\|file:\/\/|(?:^|\s)\/(?:volume\d+|home|root|Users|var|tmp|app|project|configuration)(?:\/|$))/i.test(text)
    || /[?&](?:token|secret|password|credential|signature|x-amz[^=]*|x-goog[^=]*)=/i.test(text)) return fallback;
  return text.trim() ? text : fallback;
}
function publicUrl(value) {
  if (typeof value !== "string" || publicText(value) !== value) return "";
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.hash || !host.includes(".")
      || /^\d+(?:\.\d+){3}$/.test(host) || ["local", "localhost", "internal", "test", "invalid"].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
      || [...url.searchParams.keys()].some((key) => /token|secret|password|credential|signature|x-amz|x-goog/i.test(key))) return "";
    return value;
  } catch { return ""; }
}
function display(value) { return publicText(value, UNKNOWN); }
function taxon(value) {
  const text = publicText(value).trim();
  if (!text || ["n/a", "unbekannt"].includes(text.toLocaleLowerCase("de"))) return display(value);
  return text.toLocaleLowerCase("de").replace(/(^|[\s-])([\p{L}])/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("de")}`);
}
function metadata(value, keys) {
  if (!value) return null;
  return Object.fromEntries(keys.map((key) => [key, key === "url" ? publicUrl(value[key]) : publicText(value[key])]));
}
function backup() { return { exists: false, path: "", updatedAt: "", bytes: 0 }; }
function asset(file, assetName) {
  const url = publicUrl(file?.url), available = Boolean(url);
  return { exists: available, availableOnline: available, localExists: false, bytes: file?.bytes ?? 0,
    declaredBytes: file?.bytes ?? 0, sha256: isHash(file?.sha256) ? file.sha256 : "", hashVerified: false,
    storage: file ? "public-https-reference" : "not-provided", availability: available ? "online-only" : file ? "not-provided" : "missing-reference",
    bytesVerified: false, assetName, url, mimeType: file?.mimeType ?? "", backup: backup() };
}
function mapCare(override) {
  const source = override?.provenance || {};
  const provenance = override?.provenance ? { provider: publicText(source.provider), acquisition: publicText(source.acquisition), assurance: publicText(source.assurance),
    assessmentId: publicText(source.assessmentId), canonicalUrl: publicUrl(source.canonicalUrl) } : null;
  const browserImported = override?.careMode === "provider" && source.provider === "iucn" && source.acquisition === "browser-file" && source.assurance === "user-declared";
  const protectedFromPipeline = override?.protectFromPipeline === true || override?.protectedFromPipeline === true || override?.manual === true;
  return { protectedFromPipeline, browserImported, ownCare: !browserImported && (override?.careMode === "manual" || override?.manual === true),
    careMode: publicText(override?.careMode, "legacy", 80), provenance };
}

/** Pure renderer DTO. An online reference is displayable, never evidence of local bytes or verified hashes. */
export function projectSpeciesRecordToExplorer(object, { permissions = {}, status = {} } = {}) {
  const record = validateSpeciesRecord(object?.data, object?.id), input = record.input, generated = record.generated || {};
  const files = record.assets.files, overrides = record.assets.overrides, assetName = record.assets.assetName;
  const mapOverride = overrides.map || {}, soundOverride = overrides.sound || {}, spectrumOverride = overrides.spectrogram || {}, portraitOverride = overrides.portrait || {};
  const care = mapCare(mapOverride), credits = metadata(record.assets.credits, ["source", "recordist", "quality", "country", "license", "url"]);
  const portraitMetadata = metadata(record.assets.portraitMetadata, ["type", "source", "generation_method", "imported_at", "approved_at", "prompt_version"]);
  const map = { ...asset(files["map.jpg"], assetName), manuallyAdded: care.protectedFromPipeline,
    browserImported: care.browserImported, ownCare: care.ownCare, careMode: care.careMode, provenance: care.provenance,
    protectFromPipeline: care.protectedFromPipeline, manualReason: publicText(mapOverride.reason),
    source: publicText(mapOverride.source ?? mapOverride.provenance?.source) };
  const sound = { ...asset(files["sound.mp3"], assetName), manuallyAdded: soundOverride.manual === true, manualReason: publicText(soundOverride.reason) };
  const spectrum = { ...asset(files["spectrogram.webp"], assetName), stale: spectrumOverride.stale === true,
    staleReason: publicText(spectrumOverride.reason), hashTracked: isHash(spectrumOverride.soundSha256) && isHash(spectrumOverride.spectrogramSha256),
    soundSha256: isHash(spectrumOverride.soundSha256) ? spectrumOverride.soundSha256 : "",
    spectrogramSha256: isHash(spectrumOverride.spectrogramSha256) ? spectrumOverride.spectrogramSha256 : "",
    actualSoundSha256: "", actualSpectrogramSha256: "", generatedAt: publicText(spectrumOverride.generatedAt) };
  const portrait = { ...asset(files["portrait.webp"], assetName), metadataExists: Boolean(portraitMetadata), metadataAvailable: Boolean(portraitMetadata),
    metadataStorage: portraitMetadata ? "record-metadata" : "not-provided", metadataLocalExists: false, metadataError: "", metadata: portraitMetadata,
    hashTracked: isHash(portraitOverride.sha256) && isHash(portraitOverride.metadataSha256),
    metadataSha256: isHash(portraitOverride.metadataSha256) ? portraitOverride.metadataSha256 : "", actualSha256: "", actualMetadataSha256: "",
    importedAt: publicText(portraitOverride.importedAt ?? record.assets.portraitMetadata?.imported_at),
    approvedAt: publicText(portraitOverride.approvedAt ?? record.assets.portraitMetadata?.approved_at),
    source: publicText(portraitOverride.source ?? record.assets.portraitMetadata?.source),
    promptVersion: publicText(portraitOverride.promptVersion ?? record.assets.portraitMetadata?.prompt_version) };
  const creditsAsset = { ...asset(files["credits.json"], assetName), metadataAvailable: Boolean(credits) };
  const fieldMismatches = [], dataIssues = [], assetIssues = [];
  if (!record.generated) dataIssues.push("Im gemeinsamen Datensatz ist noch keine erzeugte Artfassung gebunden.");
  else {
    const comparisons = [
      ["Deutscher Name", input.german, generated["Deutscher Name"]], ["Englischer Name", input.english, generated["Englischer Name"]],
      ["Wissenschaftlicher Name", `${input.genus} ${input.species}`, generated["Wissenschaftlicher Name"]],
      ["Größe", input.size, generated["Größe"]], ["Gewicht", input.weight, generated.Gewicht], ["Lebenserwartung", input.life_expectancy, generated.Lebenserwartung],
      ["URL-Slug", `${input.genus}${input.species}`.toLocaleLowerCase("de"), generated.URLSlug],
    ];
    for (const [field, manual, bound] of comparisons) if (publicText(manual).trim() !== publicText(bound).trim()) {
      const message = `${field} weicht zwischen manueller Eingabe und gebundener erzeugter Fassung ab`;
      fieldMismatches.push({ field, input: display(manual), generated: display(bound), message }); dataIssues.push(message);
    }
    for (const [key, label] of [["Assessment ID", "Assessment ID"], ["Status", "IUCN-Status"], ["Kategorie", "IUCN-Kategorie"], ["Trend", "Populationstrend"]]) {
      if (!publicText(generated[key]).trim() || String(generated[key]).trim().toLocaleLowerCase("de") === "n/a") dataIssues.push(`${label} fehlt in der gebundenen erzeugten Fassung`);
    }
  }
  for (const [value, label] of [[map, "die Verbreitungskarte"], [sound, "den Sound"], [portrait, "das Artporträt"]]) {
    if (!value.availableOnline) assetIssues.push(`Für ${label} ist noch kein öffentlicher Medienverweis zur Ansicht bereitgestellt.`);
  }
  if (sound.availableOnline && !spectrum.availableOnline) assetIssues.push("Für das Spektrogramm ist noch kein öffentlicher Medienverweis zur Ansicht bereitgestellt.");
  if (sound.availableOnline && !credits) assetIssues.push("Für den bereitgestellten Sound sind noch keine Quellen-/Lizenzmetadaten gebunden.");
  if (spectrum.stale) assetIssues.push("Das gebundene Spektrogramm ist als veraltet markiert.");
  const careHints = ["Gemeinsamer Projektstand: Medien sind ausschließlich über ausdrücklich gebundene öffentliche HTTPS-Verweise sichtbar. Lokale Dateien, Erreichbarkeit und Dateihashes wurden nicht geprüft."];
  if (care.protectedFromPipeline) careHints.push("Die gebundene Karte ist gegen automatische Übernahme geschützt.");
  if (sound.manuallyAdded) careHints.push("Die gebundene Tonquelle wird manuell gepflegt.");
  if (!sound.availableOnline) careHints.push("In dieser gemeinsamen Ansicht ist keine Tondatei bereitgestellt; daraus folgt keine Aussage über frühere Suchläufe.");
  const automatic = record.taxonomyOverride?.automaticFields;
  const automaticFields = automatic && typeof automatic === "object" && !Array.isArray(automatic)
    ? Object.fromEntries(["kingdom", "phylum", "subphylum", "className", "class", "order", "family", "genus", "species", ...["Kingdom", "Phylum", "Subphylum", "Class", "Order", "Family", "Genus", "Species"]]
      .filter((key) => Object.hasOwn(automatic, key)).map((key) => [key, publicText(automatic[key])])) : null;
  return {
    germanName: display(input.german), englishName: display(input.english), scientificName: `${input.genus} ${input.species}`,
    safeName: assetName, slug: typeof generated.URLSlug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(generated.URLSlug) ? generated.URLSlug : record.id,
    inInput: true, inGenerated: record.generated !== null,
    manual: { size: display(input.size), weight: display(input.weight), lifeExpectancy: display(input.life_expectancy) },
    iucn: { assessmentId: display(generated["Assessment ID"]), status: display(generated.Status), category: display(generated.Kategorie), trend: display(generated.Trend),
      population: display(generated["Populationgröße"]), generationLength: display(generated.Generationsdauer), lastUpdate: display(generated["Letztes IUCN Update"]), fetchedAt: display(generated["Daten abgerufen"]) },
    taxonomy: { kingdom: taxon(generated.Kingdom), phylum: taxon(generated.Phylum), subphylum: taxon(generated.Subphylum), className: taxon(generated.Class),
      order: taxon(generated.Order), family: taxon(generated.Family), genus: display(generated.Genus ?? input.genus), species: display(generated.Species ?? input.species),
      manuallyEdited: record.taxonomyOverride !== null, manualReason: publicText(record.taxonomyOverride?.reason), automaticFields },
    assets: { map, sound, credits: creditsAsset, spectrogram: spectrum, portrait }, credits, creditsError: "",
    isNcSound: /\/by-nc(?:-|\/)|\bby[-\s]*nc\b|non[-\s]*commercial/i.test(credits?.license || ""), reportNcSound: false,
    isManualMap: care.protectedFromPipeline, isManualSound: sound.manuallyAdded, soundMissingKnown: false,
    soundCareHint: sound.manuallyAdded || !sound.availableOnline, careHints, missingPortrait: !portrait.availableOnline,
    fieldMismatches, dataIssues, assetIssues, inconsistencies: [...dataIssues, ...assetIssues],
    editorial: { sections: record.editorial.sections.map(({ id, title, text, intentionallyEmpty }) => ({ id, title, text, intentionallyEmpty })),
      gallery: record.editorial.gallery.map(({ id, url, alt, caption, order }) => ({ id, url, alt, caption, order })).sort((a, b) => a.order - b.order) },
    sourcePermissions: { canEditManual: permissions.canEdit === true, canRename: false, canEditTaxonomy: false, canEditMedia: false,
      canRefresh: false, canDelete: false, canRestore: false },
    sourceInfo: { type: "shared-project-record", recordSchemaVersion: 1, generatedBound: record.generated !== null,
      localFilesInspected: false, remoteFilesVerified: false, mediaStorage: "public-https-reference",
      connection: ["online", "offline", "disconnected", "authentication-required", "forbidden", "checking", "closed"].includes(status.connection) ? status.connection : "checking",
      localPending: object.localPending === true, localConflict: object.localConflict === true,
      approval: ["approved", "draft", "local-draft"].includes(object.approval) ? object.approval : "draft" },
  };
}
