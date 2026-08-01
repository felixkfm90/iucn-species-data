const DEFAULT_TIMEOUT_MS = 8_000;
const USER_AGENT = "IUCN-Species-Explorer/1.0 taxonomy-reference";

function trimmed(value) {
  return String(value ?? "").trim();
}

function normalizedLanguage(value) {
  const language = trimmed(value).toLocaleLowerCase("en");
  if (
    language === "de"
    || language === "deu"
    || language === "ger"
    || language === "german"
    || language === "deutsch"
    || language.startsWith("de-")
  ) return "de";
  if (
    language === "en"
    || language === "eng"
    || language === "english"
    || language.startsWith("en-")
  ) return "en";
  return "";
}

function acceptedScientificName(value) {
  return trimmed(value)
    .replace(/\s+\([^)]*\)\s*$/, "")
    .replace(/\s{2,}/g, " ");
}

function hierarchyFromRecord(entry = {}) {
  const aliases = {
    kingdom: ["kingdom"],
    phylum: ["phylum"],
    subphylum: ["subphylum", "subphylum_name"],
    class: ["class", "class_name"],
    order: ["order", "order_name"],
    suborder: ["suborder", "suborder_name"],
    family: ["family", "family_name"],
    subfamily: ["subfamily", "subfamily_name"],
    genus: ["genus", "genus_name"],
    species: ["species", "valid_name", "accepted"],
    subspecies: ["subspecies"],
  };
  return Object.fromEntries(Object.entries(aliases).flatMap(([rank, keys]) => {
    const value = keys.map((key) => trimmed(entry[key])).find(Boolean);
    return value ? [[rank, acceptedScientificName(value)]] : [];
  }));
}

function candidateNames({ germanName = null, englishName = null } = {}) {
  return [
    germanName ? {
      name: germanName,
      language: "de",
      nameKind: "vernacular",
      preferred: true,
      verified: true,
    } : null,
    englishName ? {
      name: englishName,
      language: "en",
      nameKind: "vernacular",
      preferred: true,
      verified: true,
    } : null,
  ].filter(Boolean);
}

function providerCandidate(value = {}) {
  return {
    ...value,
    rank: trimmed(value.rank || "species").toLocaleLowerCase("en"),
    kingdom: trimmed(value.kingdom),
    taxonomicStatus: trimmed(value.taxonomicStatus || "accepted").toLocaleLowerCase("en"),
    acceptedProviderRecordId: trimmed(value.acceptedProviderRecordId),
    parentProviderRecordId: trimmed(value.parentProviderRecordId),
    hierarchy: value.hierarchy || {},
    names: value.names || candidateNames(value),
    externalIds: value.externalIds || {},
    environment: trimmed(value.environment || "unknown").toLocaleLowerCase("en"),
    retrievedAt: value.retrievedAt || new Date().toISOString(),
  };
}

function uniqueCandidates(values) {
  const seen = new Set();
  return values.filter((entry) => {
    const key = [
      entry.source,
      entry.providerId,
      entry.scientificName.toLocaleLowerCase("en"),
      entry.germanName?.toLocaleLowerCase("de") || "",
      entry.englishName?.toLocaleLowerCase("en") || "",
    ].join("|");
    if (!entry.scientificName || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(fetchImpl, url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = {},
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...headers,
      },
    });
    if (!response.ok) {
      throw new Error(`${new URL(url).hostname} antwortete mit HTTP ${response.status}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function languageOptions(language) {
  if (language === "de") return ["de"];
  if (language === "en") return ["en"];
  return ["de", "en"];
}

export async function searchINaturalistTaxa({
  query,
  language = "all",
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") return [];
  const payloads = await Promise.all(languageOptions(language).map(async (locale) => {
    const url = new URL("https://api.inaturalist.org/v1/taxa");
    url.searchParams.set("q", trimmed(query));
    url.searchParams.set("rank", "species");
    url.searchParams.set("per_page", "20");
    url.searchParams.set("locale", locale);
    return {
      locale,
      payload: await fetchJson(fetchImpl, url, { timeoutMs }),
    };
  }));
  return uniqueCandidates(payloads.flatMap(({ locale, payload }) => (
    (payload?.results || []).map((entry) => providerCandidate({
      scientificName: acceptedScientificName(entry.name),
      germanName: locale === "de" ? trimmed(entry.preferred_common_name) || null : null,
      englishName: locale === "en"
        ? trimmed(entry.preferred_common_name || entry.english_common_name) || null
        : null,
      source: "iNaturalist",
      providerId: trimmed(entry.id),
      confidence: 0.86,
      rank: entry.rank,
      kingdom: entry.iconic_taxon_name === "Animalia" ? "Animalia" : "",
      taxonomicStatus: entry.is_active === false ? "inactive" : "accepted",
      parentProviderRecordId: entry.parent_id,
      hierarchy: hierarchyFromRecord(entry),
      externalIds: { inaturalist: trimmed(entry.id) },
    }))
  )));
}

export async function searchGbifTaxa({
  query,
  language = "all",
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") return [];
  const url = new URL("https://api.gbif.org/v1/species/search");
  url.searchParams.set("q", trimmed(query));
  url.searchParams.set("rank", "SPECIES");
  url.searchParams.set("limit", "20");
  const payload = await fetchJson(fetchImpl, url, { timeoutMs });
  const records = (payload?.results || []).filter((entry) => (
    trimmed(entry.rank).toLocaleLowerCase("en") === "species"
  ));
  const detailed = await Promise.all(records.slice(0, 8).map(async (entry) => {
    const key = entry.acceptedKey || entry.key;
    let vernacularNames = [];
    if (key) {
      try {
        const names = await fetchJson(
          fetchImpl,
          `https://api.gbif.org/v1/species/${encodeURIComponent(key)}/vernacularNames`,
          { timeoutMs },
        );
        vernacularNames = names?.results || [];
      } catch {
        // Ein fehlender Vernakular-Endpunkt verwirft den wissenschaftlichen Treffer nicht.
      }
    }
    const nameForLanguage = (wanted) => vernacularNames.find(
      (name) => normalizedLanguage(name.language) === wanted && trimmed(name.vernacularName),
    )?.vernacularName;
    const germanName = language === "en" ? null : trimmed(nameForLanguage("de")) || null;
    const englishName = language === "de" ? null : trimmed(nameForLanguage("en")) || null;
    return providerCandidate({
      scientificName: acceptedScientificName(
        entry.accepted || entry.canonicalName || entry.scientificName,
      ),
      germanName,
      englishName,
      source: "GBIF",
      providerId: trimmed(key),
      confidence: 0.82,
      rank: entry.rank,
      kingdom: entry.kingdom,
      taxonomicStatus: entry.taxonomicStatus || entry.status,
      acceptedProviderRecordId: entry.acceptedKey || key,
      parentProviderRecordId: entry.parentKey,
      hierarchy: hierarchyFromRecord(entry),
      externalIds: { gbif: trimmed(key) },
    });
  }));
  return uniqueCandidates(detailed);
}

export async function searchWormsTaxa({
  query,
  kind = "all",
  language = "all",
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") return [];
  const value = encodeURIComponent(trimmed(query));
  const scientific = kind === "scientific";
  const url = scientific
    ? `https://www.marinespecies.org/rest/AphiaRecordsByName/${value}?like=true&marine_only=false&offset=1`
    : `https://www.marinespecies.org/rest/AphiaRecordsByVernacular/${value}?like=true&marine_only=false&offset=1`;
  const payload = await fetchJson(fetchImpl, url, { timeoutMs });
  const records = (Array.isArray(payload) ? payload : []).filter((entry) => (
    trimmed(entry.rank).toLocaleLowerCase("en") === "species"
  ));
  const detailed = await Promise.all(records.slice(0, 8).map(async (entry) => {
    let vernaculars = [];
    try {
      vernaculars = await fetchJson(
        fetchImpl,
        `https://www.marinespecies.org/rest/AphiaVernacularsByAphiaID/${encodeURIComponent(entry.AphiaID)}`,
        { timeoutMs },
      );
    } catch {
      // Der wissenschaftliche WoRMS-Treffer bleibt auch ohne Vernakularliste nutzbar.
    }
    const firstName = (wanted) => (Array.isArray(vernaculars) ? vernaculars : []).find(
      (name) => normalizedLanguage(name.language_code) === wanted && trimmed(name.vernacular),
    )?.vernacular;
    const germanName = language === "en" ? null : trimmed(firstName("de")) || null;
    const englishName = language === "de" ? null : trimmed(firstName("en")) || null;
    return providerCandidate({
      scientificName: acceptedScientificName(
        entry.valid_name || entry.scientificname,
      ),
      germanName,
      englishName,
      source: "WoRMS",
      providerId: trimmed(entry.valid_AphiaID || entry.AphiaID),
      confidence: 0.9,
      rank: entry.rank,
      kingdom: entry.kingdom,
      taxonomicStatus: entry.status,
      acceptedProviderRecordId: entry.valid_AphiaID || entry.AphiaID,
      parentProviderRecordId: entry.parentNameUsageID || entry.parent_AphiaID,
      hierarchy: hierarchyFromRecord(entry),
      externalIds: { worms: trimmed(entry.valid_AphiaID || entry.AphiaID) },
      environment: entry.isMarine ? "marine" : entry.isBrackish ? "brackish" : "unknown",
    });
  }));
  return uniqueCandidates(detailed);
}

function wikidataClaimValue(entity, property) {
  return entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
}

function wikidataExternalIds(entity, wikidataId) {
  const identifiers = {
    wikidata: wikidataId,
    gbif: wikidataClaimValue(entity, "P846"),
    inaturalist: wikidataClaimValue(entity, "P3151"),
    worms: wikidataClaimValue(entity, "P850"),
  };
  return Object.fromEntries(Object.entries(identifiers)
    .map(([key, value]) => [key, trimmed(value)])
    .filter(([, value]) => Boolean(value)));
}

export async function searchWikidataTaxa({
  query,
  language = "all",
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") return [];
  const searchLanguages = languageOptions(language);
  const searches = await Promise.all(searchLanguages.map(async (searchLanguage) => {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    url.searchParams.set("type", "item");
    url.searchParams.set("limit", "10");
    url.searchParams.set("language", searchLanguage);
    url.searchParams.set("uselang", searchLanguage);
    url.searchParams.set("search", trimmed(query));
    const payload = await fetchJson(fetchImpl, url, { timeoutMs });
    return payload?.search || [];
  }));
  const ids = [...new Set(searches.flat().map((entry) => entry.id).filter(Boolean))].slice(0, 12);
  if (!ids.length) return [];
  const detailUrl = new URL("https://www.wikidata.org/w/api.php");
  detailUrl.searchParams.set("action", "wbgetentities");
  detailUrl.searchParams.set("format", "json");
  detailUrl.searchParams.set("origin", "*");
  detailUrl.searchParams.set("props", "labels|claims");
  detailUrl.searchParams.set("languages", "de|en");
  detailUrl.searchParams.set("ids", ids.join("|"));
  const details = await fetchJson(fetchImpl, detailUrl, { timeoutMs });
  return uniqueCandidates(ids.map((id) => {
    const entity = details?.entities?.[id] || {};
    const germanName = language === "en" ? null : trimmed(entity.labels?.de?.value) || null;
    const englishName = language === "de" ? null : trimmed(entity.labels?.en?.value) || null;
    return providerCandidate({
      scientificName: acceptedScientificName(wikidataClaimValue(entity, "P225")),
      germanName,
      englishName,
      source: "Wikidata",
      providerId: id,
      confidence: 0.76,
      rank: "species",
      externalIds: wikidataExternalIds(entity, id),
    });
  }));
}

export function defaultTaxonomySupplementProviders() {
  return Object.freeze([
    searchINaturalistTaxa,
    searchGbifTaxa,
    searchWormsTaxa,
    searchWikidataTaxa,
  ]);
}
