import fs from "node:fs/promises";
import path from "node:path";

import {
  foldTaxonomySearchTerm,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { defaultTaxonomySupplementProviders } from "./taxonomy-supplement-providers.mjs";
import {
  canonicalMasterProvider,
  legacySupplementsToProviderRecords,
  migrateLegacySupplementsToSlices,
  writeProviderSlice,
} from "./taxonomy-master-slices.mjs";
import { compareProviderRecord } from "./taxonomy-master-rules.mjs";

const CACHE_SCHEMA_VERSION = 2;
const CORRECTION_SCHEMA_VERSION = 1;
const QUERY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_QUERY_HISTORY = 500;
const MAX_SUPPLEMENT_ENTRIES = 10_000;
const MAX_PROVIDER_RECORDS = 25_000;
const MAX_SCIENTIFIC_NAME_LENGTH = 160;
const MAX_VERNACULAR_NAME_LENGTH = 120;
const MAX_CORRECTION_NOTE_LENGTH = 240;

function normalizedScientificName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function cleanName(value) {
  const result = String(value ?? "").trim().replace(/\s+/g, " ");
  return result || null;
}

function emptyCache() {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    updatedAt: "",
    lastFullRefreshAt: "",
    queries: {},
    entries: [],
    providerRecords: [],
  };
}

function emptyCorrections() {
  return {
    schemaVersion: CORRECTION_SCHEMA_VERSION,
    entries: [],
  };
}

async function readJsonOr(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function normalizedSourceName(entry) {
  return String(entry?.source ?? "").trim() || "Unbekannte Ergänzungsquelle";
}

function providerDisplayName(provider, index) {
  const names = {
    searchINaturalistTaxa: "iNaturalist",
    searchGbifTaxa: "GBIF",
    searchWormsTaxa: "WoRMS",
    searchWikidataTaxa: "Wikidata",
  };
  return provider?.taxonomySourceName
    || names[provider?.name]
    || `Quelle ${index + 1}`;
}

function providerKey(provider, providerRecordId) {
  return `${provider}|${String(providerRecordId || "").trim()}`;
}

function mergeProviderNames(current = [], additions = []) {
  const seen = new Set();
  return [...additions, ...current].filter((entry) => {
    const name = cleanName(entry?.name);
    if (!name) return false;
    const language = String(entry.language || "").trim().toLocaleLowerCase("en");
    const nameKind = String(entry.nameKind || "vernacular").trim().toLocaleLowerCase("en");
    const key = `${normalizeTaxonomySearchTerm(name)}|${language}|${nameKind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((entry) => ({
    name: cleanName(entry.name),
    language: String(entry.language || "").trim().toLocaleLowerCase("en"),
    nameKind: String(entry.nameKind || "vernacular").trim().toLocaleLowerCase("en"),
    preferred: Boolean(entry.preferred),
    verified: Boolean(entry.verified),
  }));
}

function normalizedProviderRecord(candidate, {
  checkedAt,
  query,
  taxon = null,
  relevanceReasons = [],
} = {}) {
  const provider = canonicalMasterProvider(normalizedSourceName(candidate));
  const providerRecordId = String(candidate?.providerId || "").trim();
  const scientificName = cleanName(candidate?.scientificName);
  if (!provider || !providerRecordId || !scientificName) return null;
  const names = mergeProviderNames([], candidate.names || [
    candidate.germanName ? {
      name: candidate.germanName,
      language: "de",
      nameKind: "vernacular",
      preferred: true,
      verified: true,
    } : null,
    candidate.englishName ? {
      name: candidate.englishName,
      language: "en",
      nameKind: "vernacular",
      preferred: true,
      verified: true,
    } : null,
  ].filter(Boolean));
  const reasons = new Set([
    "searched-taxon",
    ...relevanceReasons,
    ...(!taxon ? ["col-reference-gap"] : []),
    ...(!names.length ? ["missing-name"] : []),
  ]);
  return {
    provider,
    providerRecordId,
    scientificName,
    rank: String(candidate.rank || "species").trim().toLocaleLowerCase("en"),
    kingdom: cleanName(candidate.kingdom) || taxon?.kingdom?.scientificName || "",
    taxonomicStatus: String(candidate.taxonomicStatus || "accepted").trim(),
    acceptedProviderRecordId: String(candidate.acceptedProviderRecordId || "").trim(),
    parentProviderRecordId: String(candidate.parentProviderRecordId || "").trim(),
    hierarchy: candidate.hierarchy && typeof candidate.hierarchy === "object"
      ? candidate.hierarchy
      : {},
    names,
    externalIds: candidate.externalIds && typeof candidate.externalIds === "object"
      ? candidate.externalIds
      : {},
    environment: String(candidate.environment || "unknown").trim().toLocaleLowerCase("en"),
    retrievedAt: candidate.retrievedAt || checkedAt,
    relevanceReasons: [...reasons],
    queryKeys: [normalizeTaxonomySearchTerm(query)].filter(Boolean),
    colTaxonId: taxon?.taxonId || "",
    colMatched: Boolean(taxon),
    firstSeenAt: checkedAt,
    lastSeenAt: checkedAt,
    versionChangeState: "new",
  };
}

function flattenLegacyProviderRecords(cache) {
  const grouped = legacySupplementsToProviderRecords(cache);
  return [...grouped.values()].flatMap((records) => records).map((record) => ({
    ...record,
    queryKeys: [normalizeTaxonomySearchTerm(record.scientificName)].filter(Boolean),
    colTaxonId: "",
    colMatched: true,
    firstSeenAt: record.retrievedAt || cache.updatedAt || "",
    lastSeenAt: record.retrievedAt || cache.updatedAt || "",
    versionChangeState: "new",
  }));
}

function normalizeNameRecord({
  name,
  source,
  providerId,
  confidence,
  checkedAt,
  manual = false,
} = {}) {
  const normalizedName = cleanName(name);
  if (!normalizedName) return null;
  return {
    name: normalizedName,
    source: String(source || "").trim(),
    providerId: String(providerId || "").trim(),
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    checkedAt: String(checkedAt || "").trim(),
    manual: Boolean(manual),
  };
}

function mergeNameRecords(current = [], additions = []) {
  const records = [];
  const keys = new Set();
  for (const record of [...additions, ...current]) {
    const normalized = normalizeNameRecord(record);
    if (!normalized) continue;
    const key = normalizeTaxonomySearchTerm(normalized.name);
    if (keys.has(key)) continue;
    keys.add(key);
    records.push(normalized);
  }
  return records.sort((left, right) => (
    Number(right.manual) - Number(left.manual)
    || right.confidence - left.confidence
    || left.name.localeCompare(right.name, "de", { sensitivity: "base" })
  ));
}

function entrySearchTerms(entry) {
  return [
    ...(entry.germanNames || []).map((record) => ({ ...record, language: "de" })),
    ...(entry.englishNames || []).map((record) => ({ ...record, language: "en" })),
  ];
}

function matchScore(query, value, language, source) {
  const normalizedQuery = normalizeTaxonomySearchTerm(query);
  const normalizedValue = normalizeTaxonomySearchTerm(value);
  const foldedQuery = foldTaxonomySearchTerm(query);
  const foldedValue = foldTaxonomySearchTerm(value);
  const germanQuery = germanTaxonomySearchKey(query);
  const germanValue = germanTaxonomySearchKey(value);
  let score = Number.POSITIVE_INFINITY;
  if (
    normalizedValue === normalizedQuery
    || foldedValue === foldedQuery
    || (language === "de" && germanValue === germanQuery)
  ) score = 0;
  else if (
    normalizedValue.startsWith(normalizedQuery)
    || foldedValue.startsWith(foldedQuery)
    || (language === "de" && germanValue.startsWith(germanQuery))
  ) score = 20;
  else if (
    normalizedValue.split(" ").some((word) => word.startsWith(normalizedQuery))
    || foldedValue.split(" ").some((word) => word.startsWith(foldedQuery))
  ) score = 35;
  else if (
    normalizedValue.includes(normalizedQuery)
    || foldedValue.includes(foldedQuery)
    || (language === "de" && germanValue.includes(germanQuery))
  ) score = 50;
  if (score === Number.POSITIVE_INFINITY) return score;
  if (source === "Eigene Korrektur") score -= 8;
  if (language === "de" && score === 0) score -= 12;
  return score;
}

function normalizeCorrection(entry) {
  const scientificName = cleanName(entry?.scientificName);
  if (!scientificName) return null;
  return {
    scientificName,
    germanName: cleanName(entry.germanName),
    englishName: cleanName(entry.englishName),
    note: cleanName(entry.note),
    updatedAt: String(entry.updatedAt || "").trim(),
  };
}

function correctionAsSupplement(entry) {
  const checkedAt = entry.updatedAt || "";
  return {
    scientificName: entry.scientificName,
    germanNames: entry.germanName
      ? [{
        name: entry.germanName,
        source: "Eigene Korrektur",
        confidence: 1,
        checkedAt,
        manual: true,
      }]
      : [],
    englishNames: entry.englishName
      ? [{
        name: entry.englishName,
        source: "Eigene Korrektur",
        confidence: 1,
        checkedAt,
        manual: true,
      }]
      : [],
    note: entry.note,
    correction: true,
  };
}

export class TaxonomySupplementService {
  constructor({
    taxonomyRoot,
    correctionsPath,
    providers = defaultTaxonomySupplementProviders(),
    now = () => new Date(),
  } = {}) {
    if (!taxonomyRoot || !correctionsPath) {
      throw new TypeError("Taxonomiepfad und Korrekturdatei sind erforderlich.");
    }
    this.taxonomyRoot = path.resolve(taxonomyRoot);
    this.correctionsPath = path.resolve(correctionsPath);
    this.cachePath = path.join(this.taxonomyRoot, "supplements.json");
    this.providers = [...providers];
    this.now = now;
    this.cache = null;
    this.corrections = null;
    this.loadPromise = null;
    this.legacyCache = null;
  }

  async load() {
    if (this.cache && this.corrections) return;
    if (!this.loadPromise) {
      this.loadPromise = Promise.all([
        readJsonOr(this.cachePath, emptyCache()),
        readJsonOr(this.correctionsPath, emptyCorrections()),
      ]).then(([cache, corrections]) => {
        const legacyCache = Number(cache?.schemaVersion || 1) < CACHE_SCHEMA_VERSION
          ? structuredClone(cache)
          : null;
        this.cache = {
          ...emptyCache(),
          ...cache,
          schemaVersion: CACHE_SCHEMA_VERSION,
          queries: cache?.queries && typeof cache.queries === "object" ? cache.queries : {},
          entries: Array.isArray(cache?.entries) ? cache.entries : [],
          providerRecords: Array.isArray(cache?.providerRecords)
            ? cache.providerRecords
            : flattenLegacyProviderRecords(cache || {}),
        };
        this.legacyCache = legacyCache;
        this.corrections = {
          ...emptyCorrections(),
          ...corrections,
          entries: (Array.isArray(corrections?.entries) ? corrections.entries : [])
            .map(normalizeCorrection)
            .filter(Boolean),
        };
      }).finally(() => {
        this.loadPromise = null;
      });
    }
    await this.loadPromise;
  }

  async resetCache() {
    this.cache = null;
    this.corrections = null;
    await this.load();
  }

  async status() {
    await this.load();
    const currentTime = this.now().getTime();
    const lastFullRefreshAt = Date.parse(this.cache.lastFullRefreshAt || "");
    return {
      available: true,
      schemaVersion: this.cache.schemaVersion,
      updatedAt: this.cache.updatedAt || "",
      lastFullRefreshAt: this.cache.lastFullRefreshAt || "",
      entryCount: this.cache.entries.length,
      providerRecordCount: this.cache.providerRecords.length,
      correctionCount: this.corrections.entries.length,
      providers: ["iNaturalist", "GBIF", "WoRMS", "Wikidata"],
      stale: !Number.isFinite(lastFullRefreshAt)
        || currentTime - lastFullRefreshAt > QUERY_CACHE_TTL_MS,
    };
  }

  combinedEntries() {
    const byScientificName = new Map();
    for (const entry of this.cache.entries) {
      const key = normalizedScientificName(entry.scientificName);
      if (!key) continue;
      byScientificName.set(key, {
        ...entry,
        germanNames: mergeNameRecords(entry.germanNames),
        englishNames: mergeNameRecords(entry.englishNames),
      });
    }
    for (const correction of this.corrections.entries) {
      const overlay = correctionAsSupplement(correction);
      const key = normalizedScientificName(overlay.scientificName);
      const current = byScientificName.get(key) || {
        scientificName: overlay.scientificName,
        germanNames: [],
        englishNames: [],
        sources: [],
      };
      byScientificName.set(key, {
        ...current,
        ...overlay,
        germanNames: mergeNameRecords(current.germanNames, overlay.germanNames),
        englishNames: mergeNameRecords(current.englishNames, overlay.englishNames),
      });
    }
    return [...byScientificName.values()];
  }

  queryCacheKey({ query, kind, language, kingdoms }) {
    return [
      normalizeTaxonomySearchTerm(query),
      kind,
      language,
      ...(Array.isArray(kingdoms) ? [...kingdoms].sort() : []),
    ].join("|");
  }

  isFreshQuery(key) {
    const checkedAt = Date.parse(this.cache.queries[key] || "");
    return Number.isFinite(checkedAt)
      && this.now().getTime() - checkedAt < QUERY_CACHE_TTL_MS;
  }

  async persistCache({ fullRefresh = false } = {}) {
    const queryEntries = Object.entries(this.cache.queries)
      .sort((left, right) => String(right[1]).localeCompare(String(left[1])))
      .slice(0, MAX_QUERY_HISTORY);
    this.cache.queries = Object.fromEntries(queryEntries);
    this.cache.entries = this.cache.entries.slice(0, MAX_SUPPLEMENT_ENTRIES);
    this.cache.providerRecords = this.cache.providerRecords.slice(0, MAX_PROVIDER_RECORDS);
    const writtenAt = this.now().toISOString();
    this.cache.updatedAt = writtenAt;
    if (fullRefresh) this.cache.lastFullRefreshAt = writtenAt;
    await atomicWriteJson(this.cachePath, this.cache);
  }

  mergeProviderCandidate(candidate, taxon, checkedAt) {
    const key = normalizedScientificName(taxon.acceptedScientificName);
    let entry = this.cache.entries.find(
      (current) => normalizedScientificName(current.scientificName) === key,
    );
    if (!entry) {
      entry = {
        scientificName: taxon.acceptedScientificName,
        sourceId: taxon.sourceId,
        kingdom: taxon.kingdom?.scientificName || "",
        rank: taxon.rank,
        germanNames: [],
        englishNames: [],
        sources: [],
      };
      this.cache.entries.push(entry);
    }
    const record = {
      source: normalizedSourceName(candidate),
      providerId: candidate.providerId,
      confidence: candidate.confidence,
      checkedAt,
    };
    entry.germanNames = mergeNameRecords(entry.germanNames, [
      { ...record, name: candidate.germanName },
    ]);
    entry.englishNames = mergeNameRecords(entry.englishNames, [
      { ...record, name: candidate.englishName },
    ]);
    entry.sources = [...new Set([
      ...(entry.sources || []),
      normalizedSourceName(candidate),
    ])].sort();
    entry.checkedAt = checkedAt;
  }

  mergeProviderRecord(candidate, {
    checkedAt,
    query,
    taxon,
    relevanceReasons = [],
  } = {}) {
    const incoming = normalizedProviderRecord(candidate, {
      checkedAt,
      query,
      taxon,
      relevanceReasons,
    });
    if (!incoming) return null;
    const key = providerKey(incoming.provider, incoming.providerRecordId);
    const index = this.cache.providerRecords.findIndex(
      (record) => providerKey(record.provider, record.providerRecordId) === key,
    );
    const current = index >= 0 ? this.cache.providerRecords[index] : null;
    const merged = {
      ...current,
      ...incoming,
      names: mergeProviderNames(current?.names, incoming.names),
      relevanceReasons: [...new Set([
        ...(current?.relevanceReasons || []),
        ...incoming.relevanceReasons,
      ])],
      queryKeys: [...new Set([
        ...(current?.queryKeys || []),
        ...incoming.queryKeys,
      ])],
      firstSeenAt: current?.firstSeenAt || incoming.firstSeenAt,
      versionChangeState: current?.versionChangeState === "removed"
        ? "restored"
        : compareProviderRecord(current, incoming),
    };
    if (index >= 0) this.cache.providerRecords[index] = merged;
    else this.cache.providerRecords.push(merged);
    return merged;
  }

  markMissingProviderRecords({ provider, query, seenKeys, checkedAt }) {
    const queryKey = normalizeTaxonomySearchTerm(query);
    for (const record of this.cache.providerRecords) {
      if (
        record.provider !== provider
        || !(record.queryKeys || []).includes(queryKey)
        || seenKeys.has(providerKey(record.provider, record.providerRecordId))
      ) continue;
      record.versionChangeState = "removed";
      record.lastCheckedAt = checkedAt;
    }
  }

  async writeProviderSlices({ providers = null, metadata = {} } = {}) {
    const checkedAt = this.now().toISOString();
    const version = `snapshot-${checkedAt.replace(/[^0-9]/g, "").slice(0, 17)}`;
    const selectedProviders = providers
      ? [...new Set(providers.map(canonicalMasterProvider).filter(Boolean))]
      : [...new Set(this.cache.providerRecords.map((record) => record.provider))];
    const written = [];
    for (const provider of selectedProviders) {
      const records = this.cache.providerRecords.filter((record) => (
        record.provider === provider && record.versionChangeState !== "removed"
      ));
      written.push(await writeProviderSlice(this.taxonomyRoot, {
        provider,
        providerVersion: version,
        retrievedAt: checkedAt,
        records,
        metadata: {
          ...metadata,
          source: "taxonomy-supplement-service",
        },
      }));
    }
    return written;
  }

  async enrichQuery({
    query,
    kind = "all",
    language = "all",
    kingdoms = null,
    store,
    force = false,
    relevanceReasons = [],
    markMissing = false,
  } = {}) {
    await this.load();
    const key = this.queryCacheKey({ query, kind, language, kingdoms });
    if (!force && this.isFreshQuery(key)) {
      return { refreshed: false, warnings: [] };
    }
    const settled = await Promise.allSettled(this.providers.map((provider) => provider({
      query,
      kind,
      language,
    })));
    const checkedAt = this.now().toISOString();
    let imported = 0;
    const warnings = [];
    let successfulProviderCount = 0;
    const successfulProviders = [];
    const providerRecords = [];
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      if (result.status === "rejected") {
        warnings.push(
          `${providerDisplayName(this.providers[index], index)}: ${
            result.reason?.message || "nicht erreichbar"
          }`,
        );
        continue;
      }
      successfulProviderCount += 1;
      const successfulProvider = canonicalMasterProvider(
        providerDisplayName(this.providers[index], index),
      );
      const providerNamesForResult = new Set(
        successfulProvider ? [successfulProvider] : [],
      );
      const seenKeys = new Set();
      for (const candidate of result.value || []) {
        const taxon = store.findTaxonByScientificName(candidate.scientificName, {
          rank: "species",
        });
        const selectedKingdoms = Array.isArray(kingdoms) ? kingdoms : [];
        if (
          selectedKingdoms.length
          && !selectedKingdoms.includes(
            taxon?.kingdom?.scientificName || candidate.kingdom,
          )
        ) continue;
        const providerRecord = this.mergeProviderRecord(candidate, {
          checkedAt,
          query,
          taxon,
          relevanceReasons,
        });
        if (!providerRecord) continue;
        providerNamesForResult.add(providerRecord.provider);
        seenKeys.add(providerKey(providerRecord.provider, providerRecord.providerRecordId));
        providerRecords.push(providerRecord);
        if (taxon) this.mergeProviderCandidate(candidate, taxon, checkedAt);
        imported += 1;
      }
      for (const providerName of providerNamesForResult) {
        successfulProviders.push(providerName);
        if (markMissing) {
          this.markMissingProviderRecords({
            provider: providerName,
            query,
            seenKeys,
            checkedAt,
          });
        }
      }
    }
    const failedProviderCount = settled.length - successfulProviderCount;
    if (!successfulProviderCount) {
      return {
        refreshed: false,
        imported: 0,
        warnings,
        successfulProviderCount,
        failedProviderCount,
        preservedPreviousCache: true,
      };
    }
    this.cache.queries[key] = checkedAt;
    await this.persistCache();
    return {
      refreshed: true,
      imported,
      warnings,
      successfulProviderCount,
      failedProviderCount,
      preservedPreviousCache: failedProviderCount > 0,
      successfulProviders,
      providerRecords,
    };
  }

  async search({
    query,
    kind = "all",
    language = "all",
    kingdoms = null,
    rank = "species",
    limit = 12,
    store,
    online = true,
  } = {}) {
    await this.load();
    const hasExactLocalName = this.combinedEntries().some((entry) => (
      entrySearchTerms(entry).some((term) => (
        (language === "all" || language === term.language)
        && matchScore(query, term.name, term.language, term.source) <= 0
      ))
    ));
    if (online && !hasExactLocalName && String(query || "").trim().length >= 3) {
      await this.enrichQuery({
        query,
        kind,
        language,
        kingdoms,
        store,
        relevanceReasons: ["searched-taxon"],
      }).catch(() => null);
    }
    const results = [];
    const selectedKingdoms = Array.isArray(kingdoms) ? kingdoms : [];
    for (const entry of this.combinedEntries()) {
      const base = store.findTaxonByScientificName(entry.scientificName, {
        rank: rank === "all" ? "" : rank,
      });
      if (!base) continue;
      if (
        selectedKingdoms.length
        && !selectedKingdoms.includes(base.kingdom?.scientificName)
      ) continue;
      const terms = entrySearchTerms(entry).filter((term) => (
        kind !== "scientific"
        && (language === "all" || language === term.language)
      ));
      if (kind === "all" || kind === "scientific") {
        terms.push({
          name: base.acceptedScientificName,
          source: "Catalogue of Life",
          confidence: 1,
          language: "scientific",
        });
      }
      let best = null;
      for (const term of terms) {
        const score = matchScore(query, term.name, term.language, term.source);
        if (!Number.isFinite(score)) continue;
        if (!best || score < best.score) best = { ...term, score };
      }
      if (!best) continue;
      const germanNames = mergeNameRecords(entry.germanNames);
      const englishNames = mergeNameRecords(entry.englishNames);
      results.push({
        ...base,
        germanName: germanNames[0]?.name || base.germanName,
        germanNames: [
          ...germanNames.map((record) => record.name),
          ...(base.germanNames || []),
        ].filter((value, index, values) => values.indexOf(value) === index),
        englishName: englishNames[0]?.name || base.englishName,
        englishNames: [
          ...englishNames.map((record) => record.name),
          ...(base.englishNames || []),
        ].filter((value, index, values) => values.indexOf(value) === index),
        displayName: germanNames[0]?.name
          || base.germanName
          || englishNames[0]?.name
          || base.englishName,
        displayNameLanguage: germanNames[0]?.name || base.germanName ? "de" : "en",
        usesEnglishFallback: !germanNames[0]?.name && !base.germanName,
        matchedTerm: best.name,
        matchType: best.language === "scientific"
          ? "accepted_scientific"
          : "supplement_vernacular",
        source: best.source,
        supplementSources: entry.sources || [best.source],
        nameSources: {
          german: germanNames,
          english: englishNames,
        },
        hasVerifiedGermanName: Boolean(germanNames[0]?.name || base.germanName),
        manualGermanNameFallback: null,
        supplementScore: best.score,
      });
    }
    return results
      .sort((left, right) => (
        left.supplementScore - right.supplementScore
        || String(left.displayName || "").localeCompare(
          String(right.displayName || ""),
          "de",
          { sensitivity: "base" },
        )
      ))
      .slice(0, Number(limit) || 12);
  }

  async augmentTaxon(detail) {
    await this.load();
    const key = normalizedScientificName(detail?.scientific_name);
    const entry = this.combinedEntries().find(
      (candidate) => normalizedScientificName(candidate.scientificName) === key,
    );
    if (!entry) return detail;
    const germanNames = mergeNameRecords(entry.germanNames);
    const englishNames = mergeNameRecords(entry.englishNames);
    const combinedGerman = [
      ...germanNames,
      ...(detail.germanNames || []),
    ];
    const combinedEnglish = [
      ...englishNames,
      ...(detail.englishNames || []),
    ];
    return {
      ...detail,
      germanNames: mergeNameRecords(combinedGerman),
      englishNames: mergeNameRecords(combinedEnglish),
      displayName: germanNames[0]?.name
        || detail.germanNames?.[0]?.name
        || englishNames[0]?.name
        || detail.englishNames?.[0]?.name
        || null,
      displayNameLanguage: germanNames[0]?.name || detail.germanNames?.[0]?.name
        ? "de"
        : "en",
      usesEnglishFallback: !germanNames[0]?.name && !detail.germanNames?.[0]?.name,
      supplement: {
        sources: entry.sources || [],
        nameSources: {
          german: germanNames,
          english: englishNames,
        },
        correction: entry.correction === true,
        note: entry.note || null,
      },
      manualGermanNameFallback: germanNames.length ? null : detail.manualGermanNameFallback,
    };
  }

  async saveCorrection({
    scientificName,
    germanName = "",
    englishName = "",
    note = "",
  } = {}) {
    await this.load();
    const cleanedScientificName = cleanName(scientificName);
    const cleanedGermanName = cleanName(germanName);
    const cleanedEnglishName = cleanName(englishName);
    const cleanedNote = cleanName(note);
    if ((cleanedScientificName?.length || 0) > MAX_SCIENTIFIC_NAME_LENGTH) {
      throw new Error(
        `Der wissenschaftliche Name darf höchstens ${MAX_SCIENTIFIC_NAME_LENGTH} Zeichen enthalten.`,
      );
    }
    if (
      (cleanedGermanName?.length || 0) > MAX_VERNACULAR_NAME_LENGTH
      || (cleanedEnglishName?.length || 0) > MAX_VERNACULAR_NAME_LENGTH
    ) {
      throw new Error(
        `Deutsche und englische Namen dürfen höchstens ${MAX_VERNACULAR_NAME_LENGTH} Zeichen enthalten.`,
      );
    }
    if ((cleanedNote?.length || 0) > MAX_CORRECTION_NOTE_LENGTH) {
      throw new Error(
        `Der Hinweis darf höchstens ${MAX_CORRECTION_NOTE_LENGTH} Zeichen enthalten.`,
      );
    }
    const normalized = normalizeCorrection({
      scientificName: cleanedScientificName,
      germanName: cleanedGermanName,
      englishName: cleanedEnglishName,
      note: cleanedNote,
      updatedAt: this.now().toISOString(),
    });
    if (!normalized) throw new Error("Der wissenschaftliche Name fehlt.");
    if (!normalized.germanName && !normalized.englishName) {
      throw new Error("Bitte mindestens einen deutschen oder englischen Namen angeben.");
    }
    const key = normalizedScientificName(normalized.scientificName);
    const entries = this.corrections.entries.filter(
      (entry) => normalizedScientificName(entry.scientificName) !== key,
    );
    entries.push(normalized);
    entries.sort((left, right) => left.scientificName.localeCompare(
      right.scientificName,
      "en",
      { sensitivity: "base" },
    ));
    this.corrections = {
      schemaVersion: CORRECTION_SCHEMA_VERSION,
      entries,
    };
    await atomicWriteJson(this.correctionsPath, this.corrections);
    return normalized;
  }

  async resetCorrection(scientificName) {
    await this.load();
    const cleanedScientificName = cleanName(scientificName);
    if (!cleanedScientificName) {
      throw new Error("Der wissenschaftliche Name fehlt.");
    }
    if (cleanedScientificName.length > MAX_SCIENTIFIC_NAME_LENGTH) {
      throw new Error(
        `Der wissenschaftliche Name darf höchstens ${MAX_SCIENTIFIC_NAME_LENGTH} Zeichen enthalten.`,
      );
    }
    const key = normalizedScientificName(cleanedScientificName);
    const before = this.corrections.entries.length;
    this.corrections.entries = this.corrections.entries.filter(
      (entry) => normalizedScientificName(entry.scientificName) !== key,
    );
    if (this.corrections.entries.length !== before) {
      await atomicWriteJson(this.correctionsPath, this.corrections);
    }
    return { removed: before !== this.corrections.entries.length };
  }

  async refreshKnown({ scientificNames = [], store, onProgress = () => {} } = {}) {
    await this.load();
    const targets = [...new Set([
      ...scientificNames,
      ...this.cache.entries.map((entry) => entry.scientificName),
      ...this.cache.providerRecords
        .filter((entry) => entry.versionChangeState !== "removed")
        .map((entry) => entry.scientificName),
      ...this.corrections.entries.map((entry) => entry.scientificName),
    ].map(cleanName).filter(Boolean))];
    const warnings = [];
    let imported = 0;
    let refreshedTargets = 0;
    let preservedTargets = 0;
    const successfulProviders = new Set();
    if (this.legacyCache) {
      await migrateLegacySupplementsToSlices(this.taxonomyRoot, this.legacyCache, {
        now: this.now,
      });
      this.legacyCache = null;
    }
    for (let index = 0; index < targets.length; index += 1) {
      const scientificName = targets[index];
      onProgress({
        current: index,
        total: targets.length,
        message: `Ergänzungsquellen werden für ${scientificName} geprüft`,
      });
      const result = await this.enrichQuery({
        query: scientificName,
        kind: "scientific",
        language: "all",
        kingdoms: null,
        store,
        force: true,
        relevanceReasons: ["project-species"],
        markMissing: true,
      }).catch((error) => ({
        refreshed: false,
        imported: 0,
        warnings: [error.message],
        preservedPreviousCache: true,
      }));
      imported += result.imported || 0;
      warnings.push(...(result.warnings || []));
      if (result.refreshed) refreshedTargets += 1;
      if (result.preservedPreviousCache) preservedTargets += 1;
      for (const provider of result.successfulProviders || []) successfulProviders.add(provider);
    }
    if (refreshedTargets > 0 || targets.length === 0) {
      await this.persistCache({ fullRefresh: true });
      await this.writeProviderSlices({
        providers: [...successfulProviders],
        metadata: {
          targetCount: targets.length,
          refreshedTargets,
          preservedTargets,
        },
      });
    }
    onProgress({
      current: targets.length,
      total: targets.length || 1,
      message: "Ergänzungsquellen wurden aktualisiert",
    });
    return {
      targetCount: targets.length,
      imported,
      refreshedTargets,
      preservedTargets,
      warnings: [...new Set(warnings)],
      preservedPreviousCache: preservedTargets > 0,
      providerSliceCount: successfulProviders.size,
      status: await this.status(),
    };
  }
}

export function createTaxonomySupplementService(options) {
  return new TaxonomySupplementService(options);
}
