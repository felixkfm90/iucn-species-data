import path from "node:path";

import { taxonomyHierarchyDisplayEntry } from "./taxonomy-display-names.mjs";
import { readActiveTaxonomyPointer } from "./taxonomy-storage.mjs";
import { openTaxonomyStore } from "./taxonomy-store.mjs";
import { readTaxonomyMasterManifest } from "./taxonomy-master-candidate.mjs";
import { openTaxonomyMasterStore } from "./taxonomy-master-store.mjs";
import {
  foldTaxonomySearchTerm,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";

const SEARCH_KINDS = new Set(["all", "scientific", "vernacular", "identifier"]);
const SEARCH_LANGUAGES = new Set(["all", "de", "en"]);
const SEARCH_RANKS = new Set([
  "all",
  "kingdom",
  "phylum",
  "subphylum",
  "class",
  "order",
  "family",
  "subfamily",
  "genus",
  "species",
  "subspecies",
]);
const MAX_QUERY_LENGTH = 160;
const MAX_REFERENCE_LENGTH = 160;
const MAX_KINGDOM_LENGTH = 100;
const MAX_KINGDOMS = 64;
const MAX_RESULTS = 12;
const MAX_VERNACULAR_NAME_LENGTH = 120;
const MAX_CORRECTION_NOTE_LENGTH = 240;

function createHttpError(message, statusCode, details = []) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function unavailablePayload(reason, message) {
  return {
    available: false,
    reason,
    message,
    manualEntryAvailable: true,
  };
}

function normalizeSearchOptions({
  query,
  kind = "all",
  kingdomId = "Animalia",
  kingdomIds = null,
  language = "all",
  rank = "all",
  limit = MAX_RESULTS,
} = {}) {
  const normalizedQuery = String(query ?? "").trim();
  const normalizedKind = String(kind ?? "all").trim().toLowerCase();
  const normalizedKingdom = String(kingdomId ?? "Animalia").trim() || "Animalia";
  const normalizedKingdoms = (
    Array.isArray(kingdomIds)
      ? kingdomIds
      : typeof kingdomIds === "string"
        ? kingdomIds.split(",")
        : []
  )
    .map((value) => String(value ?? "").trim())
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  const normalizedLanguage = String(language ?? "all").trim().toLowerCase() || "all";
  const normalizedRank = String(rank ?? "all").trim().toLowerCase() || "all";
  const parsedLimit = Number(limit);

  if (!normalizedQuery) {
    throw createHttpError("Bitte einen Suchbegriff eingeben.", 400);
  }
  if (normalizedQuery.length > MAX_QUERY_LENGTH) {
    throw createHttpError(
      `Der Taxonomie-Suchbegriff darf höchstens ${MAX_QUERY_LENGTH} Zeichen enthalten.`,
      400,
    );
  }
  if (!SEARCH_KINDS.has(normalizedKind)) {
    throw createHttpError("Die gewählte Taxonomie-Suchart wird nicht unterstützt.", 400);
  }
  if (normalizedKingdom.length > MAX_KINGDOM_LENGTH) {
    throw createHttpError("Die Reichskennung ist zu lang.", 400);
  }
  if (
    normalizedKingdoms.length > MAX_KINGDOMS
    || normalizedKingdoms.some((value) => value.length > MAX_KINGDOM_LENGTH)
  ) {
    throw createHttpError("Die Auswahl der Reiche ist ungültig.", 400);
  }
  if (!SEARCH_LANGUAGES.has(normalizedLanguage)) {
    throw createHttpError("Die gewählte Taxonomie-Suchsprache wird nicht unterstützt.", 400);
  }
  if (!SEARCH_RANKS.has(normalizedRank)) {
    throw createHttpError("Der gewählte Taxonomie-Rang wird nicht unterstützt.", 400);
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_RESULTS) {
    throw createHttpError(`Es sind zwischen 1 und ${MAX_RESULTS} Vorschläge erlaubt.`, 400);
  }

  return {
    query: normalizedQuery,
    kind: normalizedKind,
    kingdom: normalizedKingdoms.length ? "all" : normalizedKingdom,
    kingdoms: normalizedKingdoms.length ? normalizedKingdoms : null,
    language: normalizedLanguage,
    rank: normalizedRank,
    limit: parsedLimit,
  };
}

function normalizeTaxonReference(reference) {
  const value = String(reference ?? "").trim();
  if (!value || value.length > MAX_REFERENCE_LENGTH || value.includes("/") || value.includes("\\")) {
    throw createHttpError("Die Taxonkennung ist ungültig.", 400);
  }
  return value;
}

function normalizeCorrectionText(value, label, maxLength) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length > maxLength) {
    throw createHttpError(
      `${label} darf höchstens ${maxLength} Zeichen enthalten.`,
      400,
    );
  }
  return normalized;
}

function normalizeCorrectionScientificName(value) {
  const normalized = normalizeCorrectionText(
    value,
    "Der wissenschaftliche Name",
    MAX_REFERENCE_LENGTH,
  );
  if (!normalized) {
    throw createHttpError("Der wissenschaftliche Name fehlt.", 400);
  }
  return normalized;
}

function searchResultScore(query, result) {
  const normalizedQuery = normalizeTaxonomySearchTerm(query);
  const foldedQuery = foldTaxonomySearchTerm(query);
  const germanQuery = germanTaxonomySearchKey(query);
  const values = [
    { value: result.germanName, exact: -20, prefix: 10, contains: 40 },
    { value: result.englishName, exact: -10, prefix: 15, contains: 45 },
    { value: result.acceptedScientificName, exact: -5, prefix: 20, contains: 50 },
    { value: result.matchedTerm, exact: 0, prefix: 25, contains: 55 },
  ];
  let score = Number.isFinite(result.supplementScore)
    ? Number(result.supplementScore)
    : Number.POSITIVE_INFINITY;
  for (const candidate of values) {
    const value = String(candidate.value || "").trim();
    if (!value) continue;
    const normalizedValue = normalizeTaxonomySearchTerm(value);
    const foldedValue = foldTaxonomySearchTerm(value);
    const germanValue = germanTaxonomySearchKey(value);
    if (
      normalizedValue === normalizedQuery
      || foldedValue === foldedQuery
      || germanValue === germanQuery
    ) score = Math.min(score, candidate.exact);
    else if (
      normalizedValue.startsWith(normalizedQuery)
      || foldedValue.startsWith(foldedQuery)
      || germanValue.startsWith(germanQuery)
    ) score = Math.min(score, candidate.prefix);
    else if (
      normalizedValue.includes(normalizedQuery)
      || foldedValue.includes(foldedQuery)
      || germanValue.includes(germanQuery)
    ) score = Math.min(score, candidate.contains);
  }
  return Number.isFinite(score) ? score : 100;
}

function mergeSearchResults(query, baseResults, supplementResults, limit) {
  const merged = new Map();
  for (const result of baseResults) {
    merged.set(String(result.taxonId), result);
  }
  for (const result of supplementResults) {
    const key = String(result.taxonId);
    merged.set(key, {
      ...(merged.get(key) || {}),
      ...result,
    });
  }
  return [...merged.values()]
    .map((result) => ({
      ...result,
      referenceScore: searchResultScore(query, result),
    }))
    .sort((left, right) => (
      left.referenceScore - right.referenceScore
      || String(left.displayName || left.acceptedScientificName || "").localeCompare(
        String(right.displayName || right.acceptedScientificName || ""),
        "de",
        { sensitivity: "base" },
      )
    ))
    .slice(0, limit)
    .map(({ referenceScore, ...result }) => result);
}

function scientificResultKey(result = {}) {
  return [
    normalizeTaxonomySearchTerm(result.acceptedScientificName || result.scientificName),
    String(result.rank || "").trim().toLowerCase(),
    String(result.kingdom?.id || result.kingdom || "").trim().toLowerCase(),
  ].join("|");
}

function mergeMasterAndReferenceResults(query, masterResults, referenceResults, limit) {
  const merged = new Map();
  for (const result of masterResults) {
    merged.set(scientificResultKey(result), result);
  }
  for (const result of referenceResults) {
    const key = scientificResultKey(result);
    if (!merged.has(key)) merged.set(key, result);
  }
  return [...merged.values()]
    .map((result) => ({ ...result, referenceScore: searchResultScore(query, result) }))
    .sort((left, right) => (
      left.referenceScore - right.referenceScore
      || (left.masterTaxonId ? -1 : 0) - (right.masterTaxonId ? -1 : 0)
      || String(left.displayName || left.acceptedScientificName || "").localeCompare(
        String(right.displayName || right.acceptedScientificName || ""),
        "de",
        { sensitivity: "base" },
      )
    ))
    .slice(0, limit)
    .map(({ referenceScore, ...result }) => result);
}

export class TaxonomyReferenceService {
  constructor({
    taxonomyRoot,
    openStore = openTaxonomyStore,
    openMasterStore = openTaxonomyMasterStore,
    readMasterManifest = readTaxonomyMasterManifest,
    readPointer = readActiveTaxonomyPointer,
    supplementService = null,
  } = {}) {
    if (!taxonomyRoot) throw new TypeError("Taxonomie-Zielpfad fehlt.");
    this.taxonomyRoot = path.resolve(taxonomyRoot);
    this.openStore = openStore;
    this.openMasterStore = openMasterStore;
    this.readMasterManifest = readMasterManifest;
    this.readPointer = readPointer;
    this.supplementService = supplementService;
    this.store = null;
    this.masterStore = null;
    this.activeRelease = "";
    this.activeMasterCandidate = "";
    this.closed = false;
  }

  assertOpen() {
    if (this.closed) {
      throw createHttpError("Die lokale Taxonomiesuche wurde bereits beendet.", 503);
    }
  }

  closeStore() {
    this.store?.close?.();
    this.store = null;
    this.activeRelease = "";
    this.masterStore?.close?.();
    this.masterStore = null;
    this.activeMasterCandidate = "";
  }

  reset() {
    this.assertOpen();
    this.closeStore();
  }

  close() {
    if (this.closed) return;
    this.closeStore();
    this.closed = true;
  }

  async ensureStore() {
    this.assertOpen();
    const pointer = await this.readPointer(this.taxonomyRoot);
    if (!pointer?.activeRelease) {
      this.closeStore();
      return null;
    }
    if (this.store && this.activeRelease === pointer.activeRelease) return this.store;

    this.closeStore();
    const opened = await this.openStore({
      taxonomyRoot: this.taxonomyRoot,
      releaseId: pointer.activeRelease,
    });
    if (!opened || opened.available === false) return null;
    this.store = opened;
    this.activeRelease = pointer.activeRelease;
    return this.store;
  }

  async ensureMasterStore() {
    this.assertOpen();
    const activeManifest = await this.readMasterManifest(this.taxonomyRoot, "active");
    const activeCandidateId = String(activeManifest?.candidateId || "");
    if (
      this.masterStore
      && activeCandidateId
      && this.activeMasterCandidate === activeCandidateId
    ) return this.masterStore;
    const opened = await this.openMasterStore({
      taxonomyRoot: this.taxonomyRoot,
      slot: "active",
    });
    if (!opened || opened.available === false) {
      this.masterStore?.close?.();
      this.masterStore = null;
      this.activeMasterCandidate = "";
      return null;
    }
    const candidateId = String(opened.status?.().candidateId || activeCandidateId);
    if (this.masterStore && this.activeMasterCandidate === candidateId) {
      opened.close?.();
      return this.masterStore;
    }
    this.masterStore?.close?.();
    this.masterStore = opened;
    this.activeMasterCandidate = candidateId;
    return this.masterStore;
  }

  async status() {
    try {
      const [store, masterStore] = await Promise.all([
        this.ensureStore(),
        this.ensureMasterStore(),
      ]);
      if (!store && !masterStore) {
        return unavailablePayload(
          "not-installed",
          "Noch keine lokale Taxonomiereferenz installiert. Die Namen können weiterhin manuell eingegeben werden.",
        );
      }
      let supplements = null;
      if (this.supplementService) {
        try {
          supplements = await this.supplementService.status();
        } catch (error) {
          supplements = {
            available: false,
            stale: true,
            error: error.message,
          };
        }
      }
      return {
        ...(store?.status?.() || {}),
        master: masterStore?.status?.() || {
          available: false,
          reason: "not-installed",
        },
        supplements,
        message: "Die lokale Taxonomiereferenz ist einsatzbereit.",
        manualEntryAvailable: true,
      };
    } catch (error) {
      this.closeStore();
      return unavailablePayload(
        "invalid",
        "Die lokale Taxonomiereferenz ist nicht lesbar. Die Namen können weiterhin manuell eingegeben werden.",
      );
    }
  }

  async requireStore() {
    try {
      const store = await this.ensureStore();
      if (store) return store;
    } catch (error) {
      this.closeStore();
      throw createHttpError(
        "Die lokale Taxonomiereferenz ist nicht lesbar.",
        503,
        [error.message],
      );
    }
    throw createHttpError(
      "Noch keine lokale Taxonomiereferenz installiert.",
      503,
      ["Die Namen können weiterhin manuell eingegeben werden."],
    );
  }

  async kingdoms() {
    const store = await this.requireStore();
    const masterStore = await this.ensureMasterStore();
    const reference = store.kingdoms();
    const master = masterStore?.kingdoms?.() || { values: [] };
    const values = new Map();
    for (const entry of [...master.values, ...reference.values]) {
      const current = values.get(entry.id);
      values.set(entry.id, {
        ...entry,
        taxonCount: Math.max(Number(current?.taxonCount || 0), Number(entry.taxonCount || 0)),
      });
    }
    return {
      available: true,
      ...reference,
      values: [...values.values()].sort((left, right) => (
        (left.id === "Animalia" ? -1 : right.id === "Animalia" ? 1 : 0)
        || left.label.localeCompare(right.label, "de", { sensitivity: "base" })
      )),
    };
  }

  async search(options) {
    const searchOptions = normalizeSearchOptions(options);
    const store = await this.requireStore();
    const masterStore = await this.ensureMasterStore();
    const master = masterStore
      ? masterStore.search(searchOptions)
      : { results: [] };
    const base = store.search(searchOptions);
    const localResults = mergeMasterAndReferenceResults(
      searchOptions.query,
      master.results,
      base.results,
      searchOptions.limit,
    );
    const baseHasExactMatch = localResults.some(
      (result) => searchResultScore(searchOptions.query, result) < 0,
    );
    const supplements = this.supplementService
      ? await this.supplementService.search({
        query: searchOptions.query,
        kind: searchOptions.kind,
        language: searchOptions.language,
        kingdoms: searchOptions.kingdoms
          || (searchOptions.kingdom === "all" ? null : [searchOptions.kingdom]),
        rank: searchOptions.rank,
        limit: searchOptions.limit,
        store,
        online: !baseHasExactMatch,
      })
      : [];
    const results = mergeSearchResults(
      searchOptions.query,
      localResults,
      supplements,
      searchOptions.limit,
    );
    return {
      available: true,
      ...base,
      results,
      ambiguous: results.length > 1,
      masterAvailable: Boolean(masterStore),
    };
  }

  async exactMasterTaxonByScientificName(scientificName, {
    rank = "species",
    kingdom = "Animalia",
  } = {}) {
    const normalizedScientificName = normalizeCorrectionScientificName(scientificName);
    const masterStore = await this.ensureMasterStore();
    if (!masterStore) return null;
    return masterStore.findTaxonByScientificName(normalizedScientificName, {
      rank,
      kingdom,
    });
  }

  async review() {
    const masterStore = await this.ensureMasterStore();
    if (!masterStore) {
      return unavailablePayload(
        "master-unavailable",
        "Es ist noch keine aktive Taxonomie-Masterdatenbank vorhanden.",
      );
    }
    return {
      available: true,
      candidateId: masterStore.status().candidateId,
      ...masterStore.review(),
    };
  }

  async taxon(reference) {
    const normalizedReference = normalizeTaxonReference(reference);
    const store = await this.requireStore();
    const masterStore = await this.ensureMasterStore();
    let result = normalizedReference.startsWith("mtx_")
      ? masterStore?.taxon(normalizedReference)
      : normalizedReference.startsWith("stx_")
        ? await this.supplementService?.taxon(normalizedReference)
        : store.taxon(normalizedReference);
    if (!result) {
      throw createHttpError("Das ausgewählte Taxon wurde nicht gefunden.", 404);
    }
    if (this.supplementService) {
      result = await this.supplementService.augmentTaxon(result);
    }
    result = {
      ...result,
      hierarchy: (result.hierarchy || []).map(taxonomyHierarchyDisplayEntry),
    };
    const status = normalizedReference.startsWith("mtx_")
      ? masterStore.status()
      : normalizedReference.startsWith("stx_")
        ? { releaseId: "Versionierter Ergänzungsausschnitt" }
        : store.status();
    return {
      available: true,
      ...result,
      releaseId: status.releaseId || status.candidateId,
      source: result.source || "Catalogue of Life",
    };
  }

  async markResearched(payload = {}) {
    if (!this.supplementService) {
      throw createHttpError("Versionierte Taxonomieergänzungen sind nicht eingerichtet.", 503);
    }
    const scientificName = normalizeCorrectionScientificName(payload.scientificName);
    const rank = normalizeCorrectionText(payload.rank || "species", "Der Rang", 40)
      .toLocaleLowerCase("en");
    if (!SEARCH_RANKS.has(rank) || rank === "all") {
      throw createHttpError("Der gewählte Taxonomierang kann nicht gespeichert werden.", 400);
    }
    const kingdom = normalizeCorrectionText(payload.kingdom, "Das Reich", MAX_KINGDOM_LENGTH);
    const sourceReference = normalizeCorrectionText(
      payload.sourceReference,
      "Die Quellenkennung",
      MAX_REFERENCE_LENGTH,
    );
    const taxon = await this.supplementService.findTaxonByScientificName(scientificName);
    if (!taxon) {
      throw createHttpError(
        "Der ausgewählte externe Taxontreffer ist nicht mehr im lokalen Ergänzungscache vorhanden.",
        404,
      );
    }
    const selected = await this.supplementService.markResearchedTaxon({
      scientificName: taxon.acceptedScientificName,
      rank: taxon.rank || rank,
      kingdom: taxon.kingdom?.scientificName || kingdom,
      sourceReference: sourceReference || taxon.sourceId,
    });
    return {
      ok: true,
      selected,
      taxon: await this.taxon(taxon.taxonId),
    };
  }

  async saveCorrection(payload = {}) {
    const store = await this.requireStore();
    const masterStore = await this.ensureMasterStore();
    if (!this.supplementService) {
      throw createHttpError("Eigene Taxonomiekorrekturen sind nicht eingerichtet.", 503);
    }
    const scientificName = normalizeCorrectionScientificName(payload.scientificName);
    const germanName = normalizeCorrectionText(
      payload.germanName,
      "Der deutsche Name",
      MAX_VERNACULAR_NAME_LENGTH,
    );
    const englishName = normalizeCorrectionText(
      payload.englishName,
      "Der englische Name",
      MAX_VERNACULAR_NAME_LENGTH,
    );
    const note = normalizeCorrectionText(
      payload.note,
      "Der Hinweis",
      MAX_CORRECTION_NOTE_LENGTH,
    );
    if (!germanName && !englishName) {
      throw createHttpError(
        "Bitte mindestens einen deutschen oder englischen Namen angeben.",
        400,
      );
    }
    const taxon = masterStore?.findTaxonByScientificName(scientificName, {
      rank: "species",
    }) || store.findTaxonByScientificName(scientificName, {
      rank: "species",
    }) || await this.supplementService.findTaxonByScientificName?.(scientificName);
    if (!taxon) {
      throw createHttpError(
        "Der wissenschaftliche Name ist in der aktiven Taxonomiereferenz nicht eindeutig vorhanden.",
        400,
      );
    }
    await this.supplementService.saveCorrection({
      scientificName: taxon.acceptedScientificName,
      germanName,
      englishName,
      note,
    });
    return this.taxon(taxon.taxonId);
  }

  async resetCorrection({ scientificName } = {}) {
    if (!this.supplementService) {
      throw createHttpError("Eigene Taxonomiekorrekturen sind nicht eingerichtet.", 503);
    }
    const store = await this.requireStore();
    const masterStore = await this.ensureMasterStore();
    const normalizedScientificName = normalizeCorrectionScientificName(scientificName);
    const taxon = masterStore?.findTaxonByScientificName(normalizedScientificName, {
      rank: "species",
    }) || store.findTaxonByScientificName(normalizedScientificName, {
      rank: "species",
    }) || await this.supplementService.findTaxonByScientificName?.(normalizedScientificName);
    if (!taxon) {
      throw createHttpError(
        "Der wissenschaftliche Name ist in der aktiven CoL-Referenz nicht eindeutig vorhanden.",
        400,
      );
    }
    const result = await this.supplementService.resetCorrection(
      taxon.acceptedScientificName,
    );
    return {
      ok: true,
      ...result,
    };
  }
}

export function createTaxonomyReferenceService(options) {
  return new TaxonomyReferenceService(options);
}

export const taxonomyReferenceServiceInternals = Object.freeze({
  mergeMasterAndReferenceResults,
  scientificResultKey,
});
