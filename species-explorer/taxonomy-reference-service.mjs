import path from "node:path";

import { readActiveTaxonomyPointer } from "./taxonomy-storage.mjs";
import { openTaxonomyStore } from "./taxonomy-store.mjs";

const SEARCH_KINDS = new Set(["all", "scientific", "vernacular", "identifier"]);
const MAX_QUERY_LENGTH = 160;
const MAX_REFERENCE_LENGTH = 160;
const MAX_KINGDOM_LENGTH = 100;
const MAX_RESULTS = 12;

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
  limit = MAX_RESULTS,
} = {}) {
  const normalizedQuery = String(query ?? "").trim();
  const normalizedKind = String(kind ?? "all").trim().toLowerCase();
  const normalizedKingdom = String(kingdomId ?? "Animalia").trim() || "Animalia";
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
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_RESULTS) {
    throw createHttpError(`Es sind zwischen 1 und ${MAX_RESULTS} Vorschläge erlaubt.`, 400);
  }

  return {
    query: normalizedQuery,
    kind: normalizedKind,
    kingdom: normalizedKingdom,
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

export class TaxonomyReferenceService {
  constructor({
    taxonomyRoot,
    openStore = openTaxonomyStore,
    readPointer = readActiveTaxonomyPointer,
  } = {}) {
    if (!taxonomyRoot) throw new TypeError("Taxonomie-Zielpfad fehlt.");
    this.taxonomyRoot = path.resolve(taxonomyRoot);
    this.openStore = openStore;
    this.readPointer = readPointer;
    this.store = null;
    this.activeRelease = "";
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

  async status() {
    try {
      const store = await this.ensureStore();
      if (!store) {
        return unavailablePayload(
          "not-installed",
          "Noch keine lokale Taxonomiereferenz installiert. Die Namen können weiterhin manuell eingegeben werden.",
        );
      }
      return {
        ...store.status(),
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
    return {
      available: true,
      ...store.kingdoms(),
    };
  }

  async search(options) {
    const searchOptions = normalizeSearchOptions(options);
    const store = await this.requireStore();
    return {
      available: true,
      ...store.search(searchOptions),
    };
  }

  async taxon(reference) {
    const normalizedReference = normalizeTaxonReference(reference);
    const store = await this.requireStore();
    const result = store.taxon(normalizedReference);
    if (!result) {
      throw createHttpError("Das ausgewählte Taxon wurde nicht gefunden.", 404);
    }
    const status = store.status();
    return {
      available: true,
      ...result,
      releaseId: status.releaseId,
      source: "Catalogue of Life",
    };
  }
}

export function createTaxonomyReferenceService(options) {
  return new TaxonomyReferenceService(options);
}
