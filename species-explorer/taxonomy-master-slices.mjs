import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { compareProviderRecord } from "./taxonomy-master-rules.mjs";
import { taxonomyMasterProviderRoot } from "./taxonomy-master-storage.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";

export const TAXONOMY_PROVIDER_SLICE_SCHEMA_VERSION = 2;
const READABLE_PROVIDER_SLICE_SCHEMA_VERSIONS = new Set([1, 2]);

const PROVIDER_ALIASES = new Map([
  ["catalogue-of-life", "catalogue-of-life"],
  ["catalogue of life", "catalogue-of-life"],
  ["col", "catalogue-of-life"],
  ["inaturalist", "inaturalist"],
  ["inat", "inaturalist"],
  ["gbif", "gbif"],
  ["worms", "worms"],
  ["wikidata", "wikidata"],
  ["animalia", "animalia"],
  ["animalia.bio", "animalia"],
  ["eigene korrektur", "manual"],
  ["manual", "manual"],
  ["project", "project"],
  ["projekt", "project"],
]);

const RELEVANCE_REASONS = new Set([
  "project-species",
  "col-reference-gap",
  "missing-name",
  "missing-hierarchy",
  "searched-taxon",
  "manual-correction",
]);

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function requiredText(value, label) {
  const result = cleanText(value);
  if (!result) throw new Error(`${label} fehlt.`);
  return result;
}

function isoTimestamp(value, label) {
  const result = requiredText(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} ist ungültig.`);
  return new Date(result).toISOString();
}

function safeSegment(value, label) {
  const result = requiredText(value, label)
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!result || result.length > 120) throw new Error(`${label} ist ungültig.`);
  return result;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function canonicalMasterProvider(value) {
  const key = cleanText(value).toLocaleLowerCase("en");
  return PROVIDER_ALIASES.get(key) || null;
}

export function normalizeProviderSliceName(value = {}) {
  const name = requiredText(value.name, "Anbietername");
  const language = cleanText(value.language).toLocaleLowerCase("en");
  const nameKind = cleanText(value.nameKind || value.kind || "vernacular").toLocaleLowerCase("en");
  if (!["scientific", "synonym", "vernacular", "label"].includes(nameKind)) {
    throw new Error(`Nicht unterstützte Namensart: ${nameKind}`);
  }
  return {
    name,
    language,
    nameKind,
    preferred: Boolean(value.preferred),
    verified: Boolean(value.verified),
  };
}

export function normalizeProviderSliceRecord(value = {}, {
  provider,
  retrievedAt,
} = {}) {
  const normalizedProvider = canonicalMasterProvider(provider || value.provider);
  if (!normalizedProvider) throw new Error(`Unbekannter Taxonomieanbieter: ${provider || value.provider}`);
  const recordRetrievedAt = isoTimestamp(
    value.retrievedAt || retrievedAt,
    "Abrufzeitpunkt",
  );
  const reasons = unique(
    (Array.isArray(value.relevanceReasons) ? value.relevanceReasons : [value.relevanceReason])
      .map((entry) => cleanText(entry)),
  );
  for (const reason of reasons) {
    if (!RELEVANCE_REASONS.has(reason)) throw new Error(`Unbekannter Relevanzgrund: ${reason}`);
  }
  const names = (Array.isArray(value.names) ? value.names : [])
    .map(normalizeProviderSliceName);
  const hierarchy = value.hierarchy && typeof value.hierarchy === "object"
    ? Object.fromEntries(Object.entries(value.hierarchy)
      .map(([key, entry]) => [cleanText(key).toLocaleLowerCase("en"), cleanText(entry)])
      .filter(([, entry]) => Boolean(entry)))
    : {};
  const normalized = {
    provider: normalizedProvider,
    providerRecordId: requiredText(
      value.providerRecordId || value.providerId,
      "Anbieter-Datensatz-ID",
    ),
    colTaxonId: cleanText(value.colTaxonId),
    scientificName: requiredText(value.scientificName, "Wissenschaftlicher Name"),
    rank: cleanText(value.rank || "species").toLocaleLowerCase("en"),
    kingdom: cleanText(value.kingdom),
    taxonomicStatus: cleanText(value.taxonomicStatus || value.status),
    acceptedProviderRecordId: cleanText(value.acceptedProviderRecordId),
    parentProviderRecordId: cleanText(value.parentProviderRecordId),
    hierarchy,
    names,
    externalIds: value.externalIds && typeof value.externalIds === "object"
      ? Object.fromEntries(Object.entries(value.externalIds)
        .map(([key, entry]) => [cleanText(key), cleanText(entry)])
        .filter(([key, entry]) => key && entry))
      : {},
    environment: cleanText(value.environment || "unknown").toLocaleLowerCase("en"),
    retrievedAt: recordRetrievedAt,
    relevanceReasons: reasons.length ? reasons : ["searched-taxon"],
    queryKeys: unique(
      (Array.isArray(value.queryKeys) ? value.queryKeys : [])
        .map((entry) => cleanText(entry).toLocaleLowerCase("en")),
    ),
    selectedForMaster: Boolean(value.selectedForMaster),
    versionChangeState: cleanText(value.versionChangeState || "new").toLocaleLowerCase("en"),
  };
  normalized.payloadSha256 = crypto.createHash("sha256")
    .update(JSON.stringify({ ...normalized, payloadSha256: undefined }))
    .digest("hex");
  return normalized;
}

export function providerSliceReleaseDirectory(taxonomyRoot, provider, providerVersion) {
  return path.join(
    taxonomyMasterProviderRoot(taxonomyRoot),
    safeSegment(canonicalMasterProvider(provider) || provider, "Anbieter"),
    "releases",
    safeSegment(providerVersion, "Anbieterversion"),
  );
}

export function providerSliceDataPath(taxonomyRoot, provider, providerVersion) {
  return path.join(providerSliceReleaseDirectory(taxonomyRoot, provider, providerVersion), "records.json");
}

export function providerSliceManifestPath(taxonomyRoot, provider, providerVersion) {
  return path.join(providerSliceReleaseDirectory(taxonomyRoot, provider, providerVersion), "manifest.json");
}

export async function readProviderSlice(taxonomyRoot, provider, providerVersion) {
  const [manifestText, recordsText] = await Promise.all([
    fs.readFile(providerSliceManifestPath(taxonomyRoot, provider, providerVersion), "utf8"),
    fs.readFile(providerSliceDataPath(taxonomyRoot, provider, providerVersion), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const records = JSON.parse(recordsText);
  if (!READABLE_PROVIDER_SLICE_SCHEMA_VERSIONS.has(Number(manifest.schemaVersion)) || !Array.isArray(records)) {
    throw new Error("Der Anbieter-Ausschnitt besitzt ein nicht unterstütztes Format.");
  }
  const checksum = crypto.createHash("sha256").update(recordsText).digest("hex");
  if (manifest.checksumSha256 !== checksum || manifest.recordCount !== records.length) {
    throw new Error("Der Anbieter-Ausschnitt ist unvollständig oder verändert.");
  }
  return {
    manifest,
    records: records.map((record) => normalizeProviderSliceRecord(record, {
      provider: manifest.provider,
      retrievedAt: manifest.retrievedAt,
    })),
  };
}

export async function listProviderSliceVersions(taxonomyRoot, provider) {
  const root = path.join(
    taxonomyMasterProviderRoot(taxonomyRoot),
    safeSegment(canonicalMasterProvider(provider) || provider, "Anbieter"),
    "releases",
  );
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function latestProviderSliceVersion(taxonomyRoot, provider, {
  excludeVersion = "",
} = {}) {
  const versions = await listProviderSliceVersions(taxonomyRoot, provider);
  const excluded = cleanText(excludeVersion);
  const candidates = await Promise.all(versions
    .filter((version) => version !== excluded)
    .map(async (version) => {
      try {
        const manifest = JSON.parse(await fs.readFile(
          providerSliceManifestPath(taxonomyRoot, provider, version),
          "utf8",
        ));
        const timestamp = Date.parse(manifest.retrievedAt || manifest.issuedAt || "");
        return {
          version,
          timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        };
      } catch {
        return { version, timestamp: 0 };
      }
    }));
  return candidates.sort((left, right) => (
    left.timestamp - right.timestamp
    || left.version.localeCompare(right.version, "en")
  )).at(-1)?.version || null;
}

export async function writeProviderSlice(taxonomyRoot, {
  provider,
  providerVersion,
  records,
  retrievedAt = new Date().toISOString(),
  issuedAt = null,
  sourceUrl = null,
  license = null,
  metadata = {},
  preserveUnmentioned = false,
} = {}) {
  const normalizedProvider = canonicalMasterProvider(provider);
  if (!normalizedProvider) throw new Error(`Unbekannter Taxonomieanbieter: ${provider}`);
  const normalizedVersion = requiredText(providerVersion, "Anbieterversion");
  const normalizedRetrievedAt = isoTimestamp(retrievedAt, "Abrufzeitpunkt");
  const previousVersion = await latestProviderSliceVersion(taxonomyRoot, normalizedProvider, {
    excludeVersion: safeSegment(normalizedVersion, "Anbieterversion"),
  });
  const previous = previousVersion
    ? await readProviderSlice(taxonomyRoot, normalizedProvider, previousVersion)
    : { records: [] };
  const previousById = new Map(previous.records.map((record) => [record.providerRecordId, record]));
  const currentById = new Map();
  for (const value of Array.isArray(records) ? records : []) {
    const record = normalizeProviderSliceRecord(value, {
      provider: normalizedProvider,
      retrievedAt: normalizedRetrievedAt,
    });
    record.versionChangeState = compareProviderRecord(previousById.get(record.providerRecordId), record);
    currentById.set(record.providerRecordId, record);
  }
  for (const previousRecord of previous.records) {
    if (currentById.has(previousRecord.providerRecordId)) continue;
    const retainedState = previousRecord.versionChangeState === "removed"
      ? "removed"
      : "unchanged";
    currentById.set(previousRecord.providerRecordId, {
      ...previousRecord,
      retrievedAt: normalizedRetrievedAt,
      versionChangeState: preserveUnmentioned ? retainedState : "removed",
    });
  }
  const normalizedRecords = [...currentById.values()].sort((left, right) => (
    left.scientificName.localeCompare(right.scientificName, "en", { sensitivity: "base" })
    || left.providerRecordId.localeCompare(right.providerRecordId, "en")
  ));
  const recordsText = `${JSON.stringify(normalizedRecords, null, 2)}\n`;
  const checksumSha256 = crypto.createHash("sha256").update(recordsText).digest("hex");
  const directory = providerSliceReleaseDirectory(
    taxonomyRoot,
    normalizedProvider,
    normalizedVersion,
  );
  await fs.mkdir(directory, { recursive: true });
  await atomicWriteJson(
    providerSliceDataPath(taxonomyRoot, normalizedProvider, normalizedVersion),
    normalizedRecords,
  );
  const manifest = {
    schemaVersion: TAXONOMY_PROVIDER_SLICE_SCHEMA_VERSION,
    provider: normalizedProvider,
    providerVersion: normalizedVersion,
    issuedAt: issuedAt ? isoTimestamp(issuedAt, "Ausgabezeitpunkt") : null,
    retrievedAt: normalizedRetrievedAt,
    previousVersion,
    sourceUrl: cleanText(sourceUrl) || null,
    license: cleanText(license) || null,
    recordCount: normalizedRecords.length,
    activeRecordCount: normalizedRecords.filter((record) => record.versionChangeState !== "removed").length,
    checksumSha256,
    metadata,
    preserveUnmentioned: Boolean(preserveUnmentioned),
  };
  await atomicWriteJson(
    providerSliceManifestPath(taxonomyRoot, normalizedProvider, normalizedVersion),
    manifest,
  );
  return { manifest, records: normalizedRecords };
}

function legacyNames(entry, language) {
  const values = language === "de" ? entry.germanNames : entry.englishNames;
  return (Array.isArray(values) ? values : []).map((record) => ({
    name: record.name,
    language,
    nameKind: "vernacular",
    preferred: true,
    verified: Boolean(record.manual || Number(record.confidence) >= 0.8),
    source: record.source,
    providerId: record.providerId,
    checkedAt: record.checkedAt,
  }));
}

export function legacySupplementsToProviderRecords(cache = {}) {
  const grouped = new Map();
  for (const entry of Array.isArray(cache.entries) ? cache.entries : []) {
    const allNames = [...legacyNames(entry, "de"), ...legacyNames(entry, "en")];
    const sourceGroups = new Map();
    for (const name of allNames) {
      const provider = canonicalMasterProvider(name.source);
      if (!provider || provider === "manual") continue;
      const key = `${provider}|${name.providerId || entry.sourceId || entry.scientificName}`;
      const group = sourceGroups.get(key) || { provider, providerId: name.providerId, names: [] };
      group.names.push(name);
      sourceGroups.set(key, group);
    }
    for (const group of sourceGroups.values()) {
      const list = grouped.get(group.provider) || [];
      list.push({
        provider: group.provider,
        providerRecordId: group.providerId || entry.sourceId || entry.scientificName,
        scientificName: entry.scientificName,
        rank: entry.rank || "species",
        kingdom: entry.kingdom || "",
        names: group.names.map(({ source, providerId, checkedAt, ...name }) => name),
        retrievedAt: group.names.map((name) => name.checkedAt).filter(Boolean).sort().at(-1)
          || entry.checkedAt
          || cache.updatedAt,
        relevanceReasons: ["missing-name"],
      });
      grouped.set(group.provider, list);
    }
  }
  return grouped;
}

export async function migrateLegacySupplementsToSlices(taxonomyRoot, cache, {
  versionPrefix = "legacy",
  now = () => new Date(),
} = {}) {
  const grouped = legacySupplementsToProviderRecords(cache);
  const timestamp = now().toISOString();
  const version = `${versionPrefix}-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const migrated = [];
  for (const [provider, records] of grouped) {
    migrated.push(await writeProviderSlice(taxonomyRoot, {
      provider,
      providerVersion: version,
      retrievedAt: timestamp,
      records,
      metadata: { migratedFrom: "supplements.json" },
    }));
  }
  return migrated;
}
