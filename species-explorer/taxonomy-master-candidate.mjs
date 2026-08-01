import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  addMasterConflict,
  addMasterFieldAssertion,
  addMasterTaxonAlias,
  addProviderNameAssertion,
  addProviderSliceMembership,
  addProviderTaxonAssertion,
  createMasterTaxon,
  createStableMasterTaxonId,
  linkProjectTaxon,
  registerProviderRelease,
  setMasterTaxonStatus,
} from "./taxonomy-master-model.mjs";
import {
  HIERARCHY_FIELDS,
  chooseFieldAssertion,
  deriveMasterStatuses,
  providerFieldPriority,
} from "./taxonomy-master-rules.mjs";
import {
  createTaxonomyMasterSchema,
  validateTaxonomyMasterDatabase,
} from "./taxonomy-master-schema.mjs";
import {
  TAXONOMY_MASTER_SCHEMA_VERSION,
  taxonomyMasterActiveDirectory,
  taxonomyMasterCandidateDirectory,
  taxonomyMasterDatabasePath,
  taxonomyMasterManifestPath,
  taxonomyMasterRoot,
} from "./taxonomy-master-storage.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { atomicWriteJson, loadNodeSqlite } from "./taxonomy-storage.mjs";

const SOURCE_FIELDS = new Set([
  "scientific-name",
  "german-name",
  "english-name",
  ...HIERARCHY_FIELDS,
  "col-id",
  "gbif-id",
  "inaturalist-id",
  "worms-id",
  "wikidata-id",
]);

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalized(value) {
  return normalizeTaxonomySearchTerm(value);
}

function normalizeRank(value) {
  return cleanText(value || "species").toLocaleLowerCase("en");
}

const KINGDOM_IDENTITY_ALIASES = new Map([
  ["animal", "Animalia"],
  ["animalia", "Animalia"],
  ["animals", "Animalia"],
  ["metazoa", "Animalia"],
]);

function canonicalKingdomIdentity(value) {
  const kingdom = cleanText(value);
  if (!kingdom) return "";
  return KINGDOM_IDENTITY_ALIASES.get(normalized(kingdom)) || kingdom;
}

function identityKey({ scientificName, rank = "species", kingdom = "" } = {}) {
  return [
    normalized(scientificName),
    normalizeRank(rank),
    normalized(canonicalKingdomIdentity(kingdom)),
  ].join("|");
}

function baseIdentityKey({ scientificName, rank = "species" } = {}) {
  return [normalized(scientificName), normalizeRank(rank)].join("|");
}

function shaId(prefix, ...values) {
  const digest = crypto.createHash("sha256")
    .update(values.map((value) => String(value ?? "")).join("|"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

function normalizeProjectTaxon(value = {}) {
  const scientificName = cleanText(
    value.scientificName
      || [value.genus, value.species].map(cleanText).filter(Boolean).join(" "),
  );
  if (!scientificName) throw new Error("Projektart ohne wissenschaftlichen Namen.");
  const projectSlug = cleanText(value.projectSlug || value.slug || value.urlSlug)
    || normalized(scientificName).replaceAll(" ", "");
  return {
    projectTaxonKey: cleanText(value.projectTaxonKey || value.key || projectSlug),
    projectSlug,
    scientificName,
    rank: normalizeRank(value.rank),
    kingdom: cleanText(value.kingdom || "Animalia"),
    germanName: cleanText(value.germanName || value.german),
    englishName: cleanText(value.englishName || value.english),
  };
}

function normalizeCorrection(value = {}) {
  const scientificName = cleanText(value.scientificName);
  if (!scientificName) return null;
  return {
    scientificName,
    rank: normalizeRank(value.rank),
    kingdom: cleanText(value.kingdom || "Animalia"),
    germanName: cleanText(value.germanName),
    englishName: cleanText(value.englishName),
    note: cleanText(value.note),
  };
}

function normalizeColRecord(value = {}, fallback = {}) {
  const scientificName = cleanText(value.scientificName || value.acceptedScientificName);
  if (!scientificName) throw new Error("CoL-Datensatz ohne wissenschaftlichen Namen.");
  const hierarchy = value.hierarchy && !Array.isArray(value.hierarchy)
    ? { ...value.hierarchy }
    : {};
  if (Array.isArray(value.hierarchy)) {
    for (const entry of value.hierarchy) {
      const rank = normalizeRank(entry.rank);
      const name = cleanText(entry.scientific_name || entry.scientificName);
      if (rank && name) hierarchy[rank] = name;
    }
  }
  return {
    provider: "catalogue-of-life",
    providerRecordId: cleanText(value.providerRecordId || value.sourceId || value.source_id),
    scientificName,
    rank: normalizeRank(value.rank),
    kingdom: cleanText(value.kingdom?.scientificName || value.kingdom || hierarchy.kingdom),
    taxonomicStatus: cleanText(value.taxonomicStatus || value.status || "accepted"),
    acceptedProviderRecordId: cleanText(value.acceptedProviderRecordId),
    parentProviderRecordId: cleanText(value.parentProviderRecordId || value.parent_source_id),
    hierarchy: Object.fromEntries(Object.entries(hierarchy)
      .map(([rank, name]) => [normalizeRank(rank), cleanText(name)])
      .filter(([, name]) => Boolean(name))),
    names: [
      ...(value.germanNames || []).map((entry) => ({
        name: cleanText(entry.name || entry),
        language: "de",
        nameKind: "vernacular",
        preferred: Boolean(entry.preferred ?? true),
        verified: Boolean(entry.verified ?? true),
      })),
      ...(value.englishNames || []).map((entry) => ({
        name: cleanText(entry.name || entry),
        language: "en",
        nameKind: "vernacular",
        preferred: Boolean(entry.preferred ?? true),
        verified: Boolean(entry.verified ?? true),
      })),
      ...(value.scientificNames || [])
        .filter((entry) => normalized(entry.scientific_name || entry.scientificName) !== normalized(scientificName))
        .map((entry) => ({
          name: cleanText(entry.scientific_name || entry.scientificName),
          language: "",
          nameKind: "synonym",
          preferred: false,
          verified: true,
        })),
    ].filter((entry) => entry.name),
    externalIds: Object.fromEntries((value.identifiers || []).map((entry) => [
      cleanText(entry.identifier_type || entry.type),
      cleanText(entry.identifier),
    ]).filter(([key, id]) => key && id)),
    environment: cleanText(value.environment || "unknown").toLocaleLowerCase("en"),
    retrievedAt: cleanText(value.retrievedAt || fallback.importedAt),
    relevanceReasons: value.relevanceReasons || ["project-species"],
    versionChangeState: cleanText(value.versionChangeState || "unchanged"),
    payloadSha256: cleanText(value.payloadSha256),
  };
}

function sourceRelease(value, fallback = {}) {
  const release = {
    releaseId: cleanText(value.releaseId || `${value.provider}-${value.providerVersion}`),
    provider: cleanText(value.provider),
    providerVersion: cleanText(value.providerVersion),
    dataScope: cleanText(value.dataScope || "relevant-slice"),
    issuedAt: value.issuedAt || null,
    importedAt: cleanText(value.importedAt || value.retrievedAt || fallback.importedAt),
    sourceUrl: value.sourceUrl || null,
    checksumSha256: value.checksumSha256 || null,
    license: value.license || null,
    recordCount: Number(value.recordCount ?? value.records?.length ?? 0),
    metadata: value.metadata || {},
  };
  if (!release.provider || !release.providerVersion || !release.releaseId) {
    throw new Error("Anbieter, Anbieterversion und Release-ID sind erforderlich.");
  }
  if (!release.importedAt || !Number.isFinite(Date.parse(release.importedAt))) {
    throw new Error(`Der Importzeitpunkt für ${release.provider} ist ungültig.`);
  }
  return release;
}

function ensureGroup(groups, value) {
  const scientificName = cleanText(value.scientificName);
  const rank = normalizeRank(value.rank);
  const kingdom = canonicalKingdomIdentity(value.kingdom);
  const key = identityKey({ scientificName, rank, kingdom });
  let group = groups.get(key);
  const sameTaxonGroups = () => [...groups.values()].filter((entry) => (
    baseIdentityKey(entry) === baseIdentityKey({ scientificName, rank })
  ));
  if (!group && !kingdom) {
    const matches = sameTaxonGroups();
    const projectMatches = matches.filter((entry) => entry.projects.length || entry.corrections.length);
    if (projectMatches.length === 1) group = projectMatches[0];
    else if (matches.length === 1) group = matches[0];
  }
  if (!group && kingdom) {
    const matches = sameTaxonGroups();
    const unknownKingdomMatches = matches.filter((entry) => !canonicalKingdomIdentity(entry.kingdom));
    const knownKingdomMatches = matches.filter((entry) => canonicalKingdomIdentity(entry.kingdom));
    if (unknownKingdomMatches.length === 1 && knownKingdomMatches.length === 0) {
      group = unknownKingdomMatches[0];
      groups.delete(group.key);
      group.key = key;
      group.kingdom = kingdom;
      groups.set(key, group);
    }
  }
  if (!group) {
    group = {
      key,
      scientificName,
      rank,
      kingdom,
      records: [],
      projects: [],
      corrections: [],
    };
    groups.set(key, group);
  } else if (!group.kingdom && kingdom) {
    group.kingdom = kingdom;
  }
  return group;
}

function nameAssertionKey(value = {}) {
  return [
    normalized(value.name),
    cleanText(value.language).toLocaleLowerCase("en"),
    cleanText(value.nameKind || "vernacular").toLocaleLowerCase("en"),
  ].join("|");
}

function mergeRecordNames(left = [], right = []) {
  const names = new Map();
  for (const value of [...left, ...right]) {
    if (!cleanText(value?.name)) continue;
    const key = nameAssertionKey(value);
    const current = names.get(key);
    if (!current) {
      names.set(key, { ...value });
      continue;
    }
    const incomingPreferred = Boolean(value.preferred);
    const incomingVerified = Boolean(value.verified);
    const currentPreferred = Boolean(current.preferred);
    const currentVerified = Boolean(current.verified);
    names.set(key, {
      ...(incomingVerified > currentVerified
        || (incomingVerified === currentVerified && incomingPreferred > currentPreferred)
        ? value
        : current),
      preferred: currentPreferred || incomingPreferred,
      verified: currentVerified || incomingVerified,
    });
  }
  return [...names.values()];
}

function activeVersionState(left, right) {
  const priority = new Map([
    ["changed", 5],
    ["restored", 4],
    ["new", 3],
    ["unchanged", 2],
    ["removed", 1],
  ]);
  return (priority.get(right) || 0) > (priority.get(left) || 0) ? right : left;
}

function mergeSourceRecord(left, right) {
  if (
    normalized(left.scientificName) !== normalized(right.scientificName)
    || normalizeRank(left.rank) !== normalizeRank(right.rank)
  ) {
    throw new Error(
      `Anbieter-Datensatz ${left.provider}:${left.providerRecordId} verweist innerhalb eines Releases auf mehrere Taxa.`,
    );
  }
  if (
    left.kingdom
    && right.kingdom
    && normalized(left.kingdom) !== normalized(right.kingdom)
  ) {
    throw new Error(
      `Anbieter-Datensatz ${left.provider}:${left.providerRecordId} besitzt widersprÃ¼chliche Reiche.`,
    );
  }
  const later = Date.parse(right.retrievedAt || 0) >= Date.parse(left.retrievedAt || 0)
    ? right
    : left;
  return {
    ...left,
    ...later,
    provider: left.provider,
    providerRecordId: left.providerRecordId,
    scientificName: left.scientificName,
    rank: left.rank,
    kingdom: cleanText(left.kingdom || right.kingdom),
    hierarchy: { ...(left.hierarchy || {}), ...(right.hierarchy || {}) },
    names: mergeRecordNames(left.names, right.names),
    externalIds: { ...(left.externalIds || {}), ...(right.externalIds || {}) },
    relevanceReasons: [...new Set([
      ...(left.relevanceReasons || []),
      ...(right.relevanceReasons || []),
    ])],
    versionChangeState: activeVersionState(
      left.versionChangeState || "unchanged",
      right.versionChangeState || "unchanged",
    ),
  };
}

function deduplicateSourceRecords(records = []) {
  const unique = new Map();
  for (const record of records) {
    const providerRecordId = cleanText(record.providerRecordId);
    const key = `${record.provider}|${providerRecordId || identityKey(record)}`;
    const current = unique.get(key);
    unique.set(key, current ? mergeSourceRecord(current, record) : record);
  }
  return [...unique.values()];
}

function fieldCandidate({
  fieldName,
  fieldValue,
  language = "",
  provider,
  originKind = "source",
  providerTaxonAssertionId = null,
  releaseId,
  confidence = null,
  environment = "terrestrial",
  selected = false,
  current = false,
}) {
  const value = cleanText(fieldValue);
  if (!value || !SOURCE_FIELDS.has(fieldName)) return null;
  return {
    fieldName,
    fieldValue: value,
    language,
    provider,
    originKind,
    providerTaxonAssertionId,
    releaseId,
    confidence,
    environment,
    selected,
    current,
  };
}

function candidateKey(candidate) {
  return `${candidate.fieldName}|${candidate.language || ""}`;
}

function compareCandidates(left, right) {
  return providerFieldPriority(right.provider, right) - providerFieldPriority(left.provider, left)
    || Number(right.confidence || 0) - Number(left.confidence || 0)
    || left.fieldValue.localeCompare(right.fieldValue, "de", { sensitivity: "base" });
}

function activeState(databasePath, DatabaseSync) {
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    return { taxa: new Map(), fields: new Map(), aliases: [], decisions: [] };
  }
  try {
    const taxa = new Map(database.prepare(`
      SELECT master.master_taxon_id, master.canonical_scientific_name,
        master.rank, master.kingdom, master.reference_state, master.lifecycle_state,
        COUNT(source.assertion_id) AS source_count
      FROM master_taxon master
      LEFT JOIN provider_taxon_assertion source
        ON source.master_taxon_id = master.master_taxon_id
      GROUP BY master.master_taxon_id
    `).all().map((row) => [row.master_taxon_id, { ...row }]));
    const fields = new Map();
    for (const row of database.prepare(`
      SELECT field.*, release.provider, release.provider_version,
        source.provider_record_id, source.scientific_name AS source_scientific_name,
        source.rank AS source_rank, source.kingdom AS source_kingdom,
        source.hierarchy_json, source.retrieved_at, source.version_change_state
      FROM master_field_assertion field
      JOIN provider_release release ON release.release_id = field.release_id
      LEFT JOIN provider_taxon_assertion source
        ON source.assertion_id = field.provider_taxon_assertion_id
      WHERE field.selected = 1
    `).all()) {
      const list = fields.get(row.master_taxon_id) || [];
      list.push({ ...row });
      fields.set(row.master_taxon_id, list);
    }
    return {
      taxa,
      fields,
      aliases: database.prepare("SELECT * FROM master_taxon_alias").all().map((row) => ({ ...row })),
      decisions: database.prepare("SELECT * FROM master_decision").all().map((row) => ({ ...row })),
    };
  } finally {
    database.close();
  }
}

function summarizeDatabase(database) {
  const statuses = Object.fromEntries(database.prepare(`
    SELECT status_name, COUNT(*) AS count
    FROM master_taxon_status
    GROUP BY status_name
  `).all().map((row) => [row.status_name, Number(row.count)]));
  return {
    taxa: Number(database.prepare("SELECT COUNT(*) AS count FROM master_taxon").get().count),
    projectTaxa: Number(database.prepare("SELECT COUNT(*) AS count FROM project_taxon_link").get().count),
    providerAssertions: Number(database.prepare("SELECT COUNT(*) AS count FROM provider_taxon_assertion").get().count),
    names: Number(database.prepare("SELECT COUNT(*) AS count FROM provider_name_assertion").get().count),
    aliases: Number(database.prepare("SELECT COUNT(*) AS count FROM master_taxon_alias").get().count),
    fields: Number(database.prepare("SELECT COUNT(*) AS count FROM master_field_assertion").get().count),
    conflicts: Number(database.prepare("SELECT COUNT(*) AS count FROM master_conflict WHERE conflict_state = 'open'").get().count),
    statuses,
  };
}

function selectedFieldMap(database) {
  return new Map(database.prepare(`
    SELECT master_taxon_id, field_name, language, field_value
    FROM master_field_assertion
    WHERE selected = 1
  `).all().map((row) => [
    `${row.master_taxon_id}|${row.field_name}|${row.language}`,
    row.field_value,
  ]));
}

function snapshotFromDatabase(database) {
  return {
    taxa: new Map(database.prepare(`
      SELECT master_taxon_id, canonical_scientific_name, reference_state, lifecycle_state
      FROM master_taxon
    `).all().map((row) => [row.master_taxon_id, { ...row }])),
    fields: selectedFieldMap(database),
    aliases: new Set(database.prepare(`
      SELECT master_taxon_id, normalized_name, alias_type
      FROM master_taxon_alias
    `).all().map((row) => `${row.master_taxon_id}|${row.normalized_name}|${row.alias_type}`)),
  };
}

function diffSnapshots(previous, current) {
  if (!previous) {
    return {
      newTaxa: [...current.taxa.values()].map((row) => row.canonical_scientific_name),
      closedReferenceGaps: [],
      changedScientificNames: [],
      changedNames: [],
      newSynonyms: [...current.aliases],
      staleTaxa: [...current.taxa.values()]
        .filter((row) => row.lifecycle_state === "stale")
        .map((row) => row.canonical_scientific_name),
      removedTaxa: [],
    };
  }
  const newTaxa = [];
  const closedReferenceGaps = [];
  const changedScientificNames = [];
  const staleTaxa = [];
  const removedTaxa = [];
  for (const [id, row] of current.taxa) {
    const old = previous.taxa.get(id);
    if (!old) newTaxa.push(row.canonical_scientific_name);
    else {
      if (old.reference_state === "reference-gap" && row.reference_state === "exact-col") {
        closedReferenceGaps.push(row.canonical_scientific_name);
      }
      if (normalized(old.canonical_scientific_name) !== normalized(row.canonical_scientific_name)) {
        changedScientificNames.push({
          masterTaxonId: id,
          previous: old.canonical_scientific_name,
          candidate: row.canonical_scientific_name,
        });
      }
    }
    if (row.lifecycle_state === "stale") staleTaxa.push(row.canonical_scientific_name);
  }
  for (const [id, row] of previous.taxa) {
    if (!current.taxa.has(id)) removedTaxa.push(row.canonical_scientific_name);
  }
  const changedNames = [];
  for (const [key, value] of current.fields) {
    if (!key.includes("|german-name|") && !key.includes("|english-name|")) continue;
    const old = previous.fields.get(key);
    if (old && normalized(old) !== normalized(value)) {
      const [masterTaxonId, fieldName] = key.split("|");
      changedNames.push({ masterTaxonId, fieldName, previous: old, candidate: value });
    }
  }
  return {
    newTaxa,
    closedReferenceGaps,
    changedScientificNames,
    changedNames,
    newSynonyms: [...current.aliases].filter((value) => !previous.aliases.has(value)),
    staleTaxa,
    removedTaxa,
  };
}

async function replaceDirectory(source, target) {
  const root = path.dirname(target);
  const backup = path.join(root, `.staging-old-${crypto.randomUUID()}`);
  let hadTarget = false;
  try {
    await fs.rename(target, backup);
    hadTarget = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await fs.rename(source, target);
    if (hadTarget) await fs.rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (hadTarget) await fs.rename(backup, target).catch(() => {});
    throw error;
  }
}

export async function buildTaxonomyMasterCandidate({
  taxonomyRoot,
  colRelease,
  colRecords = [],
  providerSlices = [],
  projectTaxa = [],
  corrections = [],
  now = () => new Date(),
} = {}) {
  if (!taxonomyRoot) throw new Error("Taxonomie-Zielpfad fehlt.");
  const timestamp = now().toISOString();
  const normalizedColRelease = sourceRelease({
    provider: "catalogue-of-life",
    dataScope: "full",
    ...colRelease,
  }, { importedAt: timestamp });
  const normalizedProjects = projectTaxa.map(normalizeProjectTaxon);
  const normalizedCorrections = corrections.map(normalizeCorrection).filter(Boolean);
  const normalizedSlices = providerSlices.map((slice) => ({
    release: sourceRelease({
      provider: slice.manifest?.provider,
      providerVersion: slice.manifest?.providerVersion,
      releaseId: `${slice.manifest?.provider}-${slice.manifest?.providerVersion}`,
      dataScope: "relevant-slice",
      issuedAt: slice.manifest?.issuedAt,
      importedAt: slice.manifest?.retrievedAt,
      sourceUrl: slice.manifest?.sourceUrl,
      checksumSha256: slice.manifest?.checksumSha256,
      license: slice.manifest?.license,
      recordCount: slice.records?.length,
      metadata: slice.manifest?.metadata,
    }, { importedAt: timestamp }),
    records: slice.records || [],
  }));
  const groups = new Map();
  for (const project of normalizedProjects) ensureGroup(groups, project).projects.push(project);
  for (const correction of normalizedCorrections) ensureGroup(groups, correction).corrections.push(correction);
  const normalizedColRecords = deduplicateSourceRecords(colRecords.map((record) => normalizeColRecord(record, {
    importedAt: normalizedColRelease.importedAt,
  })));
  for (const record of normalizedColRecords) ensureGroup(groups, record).records.push(record);
  for (const slice of normalizedSlices) {
    const normalizedRecords = deduplicateSourceRecords(slice.records.map((record) => ({
        ...record,
        provider: slice.release.provider,
        rank: normalizeRank(record.rank),
        scientificName: cleanText(record.scientificName),
        kingdom: cleanText(record.kingdom || record.hierarchy?.kingdom),
        retrievedAt: cleanText(record.retrievedAt || slice.release.importedAt),
        names: Array.isArray(record.names) ? record.names : [],
        hierarchy: record.hierarchy || {},
        externalIds: record.externalIds || {},
        relevanceReasons: record.relevanceReasons || ["searched-taxon"],
        versionChangeState: cleanText(record.versionChangeState || "unchanged"),
      })));
    for (const normalizedRecord of normalizedRecords) {
      if (normalizedRecord.scientificName) ensureGroup(groups, normalizedRecord).records.push(normalizedRecord);
    }
  }

  const { DatabaseSync } = await loadNodeSqlite();
  const activePath = taxonomyMasterDatabasePath(taxonomyRoot, "active");
  const previousState = activeState(activePath, DatabaseSync);
  for (const previousTaxon of previousState.taxa.values()) {
    const group = ensureGroup(groups, {
      scientificName: previousTaxon.canonical_scientific_name,
      rank: previousTaxon.rank,
      kingdom: previousTaxon.kingdom,
    });
    group.previousTaxon = previousTaxon;
  }
  const temporaryDirectory = path.join(
    taxonomyMasterRoot(taxonomyRoot),
    `.staging-${crypto.randomUUID()}`,
  );
  await fs.mkdir(temporaryDirectory, { recursive: true });
  const databasePath = path.join(temporaryDirectory, "taxonomy-master.sqlite");
  let database;
  let manifest;
  try {
    database = new DatabaseSync(databasePath);
    try {
    createTaxonomyMasterSchema(database);
    const releases = [normalizedColRelease, ...normalizedSlices.map((slice) => slice.release)];
    releases.push({
      releaseId: `project-${timestamp}`,
      provider: "project",
      providerVersion: timestamp,
      dataScope: "project",
      importedAt: timestamp,
      recordCount: normalizedProjects.length,
      metadata: {},
    });
    releases.push({
      releaseId: `manual-${timestamp}`,
      provider: "manual",
      providerVersion: timestamp,
      dataScope: "manual",
      importedAt: timestamp,
      recordCount: normalizedCorrections.length,
      metadata: {},
    });
    for (const release of releases) {
      registerProviderRelease(database, { ...release, releaseState: "active" });
    }
    const releaseByProvider = new Map(releases.map((release) => [release.provider, release]));
    const conflicts = [];
    for (const group of [...groups.values()].sort((left, right) => (
      left.scientificName.localeCompare(right.scientificName, "en", { sensitivity: "base" })
    ))) {
      const exactCol = group.records.find((record) => (
        record.provider === "catalogue-of-life"
        && record.versionChangeState !== "removed"
        && identityKey(record) === group.key
      ));
      const activeRecords = group.records.filter((record) => record.versionChangeState !== "removed");
      const externalProviders = new Set(activeRecords
        .filter((record) => !["catalogue-of-life", "manual", "project"].includes(record.provider))
        .map((record) => record.provider));
      const oldTaxon = group.previousTaxon || null;
      const sourceRemoved = Boolean(
        oldTaxon
        && Number(oldTaxon.source_count) > 0
        && activeRecords.length === 0
      );
      const removedOnly = sourceRemoved && !group.projects.length && !group.corrections.length;
      const kingdom = cleanText(
        group.projects[0]?.kingdom || exactCol?.kingdom || activeRecords.find((record) => record.kingdom)?.kingdom,
      );
      const masterTaxonId = createStableMasterTaxonId({
        scientificName: exactCol?.scientificName || group.scientificName,
        rank: group.rank,
        kingdom,
      });
      const referenceGapContext = Boolean(
        group.projects.length
        || oldTaxon?.reference_state === "reference-gap"
        || activeRecords.some((record) => (
          (record.relevanceReasons || []).includes("col-reference-gap")
        ))
      );
      const referenceState = exactCol
        ? "exact-col"
        : referenceGapContext
          ? "reference-gap"
          : externalProviders.size
            ? "external-only"
            : group.corrections.length
              ? "manual"
              : oldTaxon?.reference_state || "manual";
      createMasterTaxon(database, {
        masterTaxonId,
        scientificName: exactCol?.scientificName || group.scientificName,
        rank: group.rank,
        kingdom,
        lifecycleState: removedOnly ? "stale" : "active",
        referenceState,
        createdAt: timestamp,
      });
      const fieldCandidates = [];
      for (const record of group.records) {
        const release = releaseByProvider.get(record.provider);
        if (!release) continue;
        const matchState = record.versionChangeState === "removed"
          ? "stale"
          : exactCol || record.provider === "catalogue-of-life"
            ? "exact"
            : "reference-gap";
        const sourceAssertionId = addProviderTaxonAssertion(database, {
          releaseId: release.releaseId,
          providerRecordId: cleanText(record.providerRecordId) || shaId("record", record.provider, record.scientificName),
          masterTaxonId,
          parentProviderRecordId: record.parentProviderRecordId || null,
          acceptedProviderRecordId: record.acceptedProviderRecordId || null,
          scientificName: record.scientificName,
          rank: record.rank,
          taxonomicStatus: record.taxonomicStatus || null,
          kingdom: record.kingdom || kingdom,
          matchState,
          payloadSha256: record.payloadSha256 || null,
          hierarchy: record.hierarchy || {},
          importedAt: release.importedAt,
          retrievedAt: record.retrievedAt || release.importedAt,
          versionChangeState: record.versionChangeState || "unchanged",
        });
        for (const reason of record.relevanceReasons || []) {
          addProviderSliceMembership(database, {
            providerTaxonAssertionId: sourceAssertionId,
            relevanceReason: reason,
            observedAt: record.retrievedAt || release.importedAt,
          });
        }
        addProviderNameAssertion(database, {
          providerTaxonAssertionId: sourceAssertionId,
          name: record.scientificName,
          nameKind: "scientific",
          preferred: true,
          verified: record.provider === "catalogue-of-life",
        });
        fieldCandidates.push(fieldCandidate({
          fieldName: "scientific-name",
          fieldValue: record.scientificName,
          provider: record.provider,
          providerTaxonAssertionId: sourceAssertionId,
          releaseId: release.releaseId,
          confidence: record.provider === "catalogue-of-life" ? 1 : 0.8,
          environment: record.environment,
        }));
        for (const [rank, name] of Object.entries(record.hierarchy || {})) {
          const fieldName = normalizeRank(rank);
          if (!HIERARCHY_FIELDS.includes(fieldName)) continue;
          fieldCandidates.push(fieldCandidate({
            fieldName,
            fieldValue: name,
            provider: record.provider,
            providerTaxonAssertionId: sourceAssertionId,
            releaseId: release.releaseId,
            confidence: record.provider === "catalogue-of-life" ? 1 : 0.75,
            environment: record.environment,
          }));
        }
        for (const name of record.names || []) {
          if (!cleanText(name.name)) continue;
          addProviderNameAssertion(database, {
            providerTaxonAssertionId: sourceAssertionId,
            name: name.name,
            language: name.language || "",
            nameKind: name.nameKind || "vernacular",
            preferred: Boolean(name.preferred),
            verified: Boolean(name.verified),
          });
          if (name.nameKind === "synonym" || name.nameKind === "scientific") {
            if (normalized(name.name) !== normalized(group.scientificName)) {
              addMasterTaxonAlias(database, {
                masterTaxonId,
                name: name.name,
                rank: group.rank,
                kingdom,
                aliasType: "synonym",
                sourceAssertionId,
              });
            }
          } else if (["de", "en"].includes(String(name.language).toLowerCase())) {
            fieldCandidates.push(fieldCandidate({
              fieldName: name.language === "de" ? "german-name" : "english-name",
              fieldValue: name.name,
              language: name.language,
              provider: record.provider,
              providerTaxonAssertionId: sourceAssertionId,
              releaseId: release.releaseId,
              confidence: name.verified ? 0.95 : (name.preferred ? 0.8 : 0.65),
              environment: record.environment,
            }));
          }
        }
        for (const [idType, id] of Object.entries(record.externalIds || {})) {
          const normalizedType = cleanText(idType).toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "-");
          const fieldName = normalizedType.endsWith("-id") ? normalizedType : `${normalizedType}-id`;
          if (!SOURCE_FIELDS.has(fieldName)) continue;
          fieldCandidates.push(fieldCandidate({
            fieldName,
            fieldValue: id,
            provider: record.provider,
            providerTaxonAssertionId: sourceAssertionId,
            releaseId: release.releaseId,
            confidence: 1,
            environment: record.environment,
          }));
        }
      }
      const projectRelease = releaseByProvider.get("project");
      for (const project of group.projects) {
        linkProjectTaxon(database, {
          projectTaxonKey: project.projectTaxonKey,
          masterTaxonId,
          projectSlug: project.projectSlug,
          scientificNameAtLink: project.scientificName,
          linkedAt: timestamp,
        });
        addMasterTaxonAlias(database, {
          masterTaxonId,
          name: project.scientificName,
          rank: project.rank,
          kingdom: project.kingdom,
          aliasType: "project-name",
        });
        for (const [fieldName, fieldValue, language] of [
          ["scientific-name", project.scientificName, ""],
          ["german-name", project.germanName, "de"],
          ["english-name", project.englishName, "en"],
        ]) {
          fieldCandidates.push(fieldCandidate({
            fieldName,
            fieldValue,
            language,
            provider: "project",
            originKind: "project",
            releaseId: projectRelease.releaseId,
            confidence: 1,
          }));
        }
      }
      const manualRelease = releaseByProvider.get("manual");
      for (const correction of group.corrections) {
        for (const [fieldName, fieldValue, language] of [
          ["german-name", correction.germanName, "de"],
          ["english-name", correction.englishName, "en"],
        ]) {
          fieldCandidates.push(fieldCandidate({
            fieldName,
            fieldValue,
            language,
            provider: "manual",
            originKind: "manual",
            releaseId: manualRelease.releaseId,
            confidence: 1,
          }));
        }
      }
      const previousMasterTaxon = previousState.taxa.get(masterTaxonId) || oldTaxon;
      const currentFields = previousState.fields.get(masterTaxonId) || [];
      let groupBlockingConflictCount = 0;
      const byField = new Map();
      for (const candidate of fieldCandidates.filter(Boolean)) {
        const key = candidateKey(candidate);
        const list = byField.get(key) || [];
        if (!list.some((entry) => (
          normalized(entry.fieldValue) === normalized(candidate.fieldValue)
          && entry.provider === candidate.provider
        ))) list.push(candidate);
        byField.set(key, list);
      }
      for (const current of currentFields) {
        const key = `${current.field_name}|${current.language || ""}`;
        const list = byField.get(key) || [];
        if (list.some((entry) => normalized(entry.fieldValue) === normalized(current.field_value))) continue;
        const originKind = current.origin_kind === "project" ? "project" : "manual";
        list.push(fieldCandidate({
          fieldName: current.field_name,
          fieldValue: current.field_value,
          language: current.language,
          // Der bisherige Wert wird als eigenständiger Vergleichskandidat in die
          // neue Datenbank übernommen. Seine ursprüngliche Anbieterpriorität
          // bleibt für den Vergleich erhalten; nur die FK-freie Speicherung
          // erfolgt als manuelle Trägerzeile im Kandidaten.
          provider: current.provider,
          originKind,
          releaseId: releaseByProvider.get(originKind).releaseId,
          confidence: current.confidence,
          selected: true,
          current: true,
        }));
        byField.set(key, list);
      }
      for (const [key, candidates] of byField) {
        candidates.sort(compareCandidates);
        const freshCandidates = candidates.filter((entry) => !entry.current);
        const currentValue = currentFields.find((entry) => (
          `${entry.field_name}|${entry.language || ""}` === key
        ));
        let selectedCandidate = freshCandidates[0] || candidates[0];
        let conflictCandidate = null;
        if (currentValue) {
          const same = candidates.find((entry) => (
            normalized(entry.fieldValue) === normalized(currentValue.field_value)
          ));
          if (same) selectedCandidate = same;
          const preferred = freshCandidates[0];
          if (preferred && normalized(preferred.fieldValue) !== normalized(currentValue.field_value)) {
            const decision = chooseFieldAssertion({
              current: {
                fieldName: currentValue.field_name,
                fieldValue: currentValue.field_value,
                originKind: currentValue.origin_kind,
                provider: currentValue.provider,
              },
              candidate: preferred,
              environment: preferred.environment,
            });
            if (decision.action === "conflict") {
              selectedCandidate = same || candidates.find((entry) => entry.current) || selectedCandidate;
              conflictCandidate = preferred;
            }
          }
        }
        const assertionIds = new Map();
        for (const candidate of candidates) {
          const selected = candidate === selectedCandidate;
          const assertionId = addMasterFieldAssertion(database, {
            masterTaxonId,
            fieldName: candidate.fieldName,
            fieldValue: candidate.fieldValue,
            language: candidate.language,
            originKind: candidate.originKind,
            providerTaxonAssertionId: candidate.providerTaxonAssertionId,
            releaseId: candidate.releaseId,
            confidence: candidate.confidence,
            reviewState: selected ? "accepted" : (candidate === conflictCandidate ? "conflict" : "pending"),
            selected,
            createdAt: timestamp,
          });
          assertionIds.set(candidate, assertionId);
        }
        if (conflictCandidate) {
          const conflictId = shaId(
            "conflict",
            masterTaxonId,
            key,
            selectedCandidate.fieldValue,
            conflictCandidate.fieldValue,
          );
          addMasterConflict(database, {
            conflictId,
            masterTaxonId,
            fieldName: selectedCandidate.fieldName,
            currentAssertionId: assertionIds.get(selectedCandidate),
            candidateAssertionId: assertionIds.get(conflictCandidate),
            conflictType: "changed-value",
            detectedAt: timestamp,
            resolutionNote: "Abweichender Anbieterwert benötigt eine ausdrückliche Entscheidung.",
          });
          conflicts.push(conflictId);
          groupBlockingConflictCount += 1;
        }
      }
      if (!exactCol) {
        const conflictId = shaId("gap", masterTaxonId, group.scientificName);
        addMasterConflict(database, {
          conflictId,
          masterTaxonId,
          conflictType: "reference-gap",
          detectedAt: timestamp,
          resolutionNote: "Keine exakte Artzeile in der aktiven CoL-Referenz.",
        });
        conflicts.push(conflictId);
      } else if (previousMasterTaxon?.reference_state === "reference-gap") {
        addMasterConflict(database, {
          conflictId: shaId("returned", masterTaxonId, normalizedColRelease.providerVersion),
          masterTaxonId,
          conflictType: "reference-returned",
          detectedAt: timestamp,
          resolutionNote: "Die frühere CoL-Referenzlücke ist geschlossen.",
        });
      }
      if (sourceRemoved) {
        const conflictId = shaId("removed", masterTaxonId, timestamp);
        addMasterConflict(database, {
          conflictId,
          masterTaxonId,
          conflictType: "source-removed",
          detectedAt: timestamp,
          resolutionNote: "Der zuvor verwendete Quelleneintrag fehlt im aktuellen Anbieterstand und bleibt bis zur Prüfung als veraltet erhalten.",
        });
        conflicts.push(conflictId);
        groupBlockingConflictCount += 1;
      }
      const statuses = deriveMasterStatuses({
        exactCol: Boolean(exactCol),
        referenceGap: !exactCol,
        externalProviderCount: externalProviders.size,
        conflictCount: groupBlockingConflictCount,
        stale: sourceRemoved || removedOnly,
        manuallyProtected: group.corrections.length > 0 || currentFields.some((field) => field.origin_kind === "manual"),
      });
      for (const statusName of statuses) {
        setMasterTaxonStatus(database, {
          masterTaxonId,
          statusName,
          updatedAt: timestamp,
        });
      }
      for (const alias of previousState.aliases.filter((entry) => entry.master_taxon_id === masterTaxonId)) {
        addMasterTaxonAlias(database, {
          masterTaxonId,
          name: alias.name,
          rank: alias.rank,
          kingdom: alias.kingdom,
          aliasType: alias.alias_type,
        });
      }
    }
    const validation = validateTaxonomyMasterDatabase(database);
    const currentSnapshot = snapshotFromDatabase(database);
    let previousSnapshot = null;
    try {
      const active = new DatabaseSync(activePath, { readOnly: true });
      try { previousSnapshot = snapshotFromDatabase(active); } finally { active.close(); }
    } catch {
      previousSnapshot = null;
    }
    const diff = diffSnapshots(previousSnapshot, currentSnapshot);
    const summary = summarizeDatabase(database);
    manifest = {
      schemaVersion: TAXONOMY_MASTER_SCHEMA_VERSION,
      candidateId: `master-${timestamp.replace(/[^0-9]/g, "").slice(0, 17)}`,
      createdAt: timestamp,
      state: "staging",
      sources: releases.map((release) => ({
        provider: release.provider,
        providerVersion: release.providerVersion,
        releaseId: release.releaseId,
        recordCount: release.recordCount,
      })),
      summary,
      diff,
      validation,
      requiresConfirmation: true,
    };
    } finally {
      database.close();
    }
    await atomicWriteJson(path.join(temporaryDirectory, "manifest.json"), manifest);
    await fs.mkdir(taxonomyMasterRoot(taxonomyRoot), { recursive: true });
    await replaceDirectory(temporaryDirectory, taxonomyMasterCandidateDirectory(taxonomyRoot));
    return manifest;
  } catch (error) {
    try {
      database?.close?.();
    } catch {
      // Der innere finally-Block kann die SQLite-Verbindung bereits geschlossen haben.
    }
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function readTaxonomyMasterManifest(taxonomyRoot, slot = "active") {
  try {
    return JSON.parse(await fs.readFile(taxonomyMasterManifestPath(taxonomyRoot, slot), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function inspectTaxonomyMasterCandidate(taxonomyRoot) {
  const manifest = await readTaxonomyMasterManifest(taxonomyRoot, "staging");
  if (!manifest) return { available: false, reason: "no-candidate" };
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "staging"), {
    readOnly: true,
  });
  try {
    const validation = validateTaxonomyMasterDatabase(database);
    const conflicts = database.prepare(`
      SELECT conflict.*, master.canonical_scientific_name,
        current_field.field_value AS current_value,
        candidate_field.field_value AS candidate_value
      FROM master_conflict conflict
      JOIN master_taxon master ON master.master_taxon_id = conflict.master_taxon_id
      LEFT JOIN master_field_assertion current_field
        ON current_field.assertion_id = conflict.current_assertion_id
      LEFT JOIN master_field_assertion candidate_field
        ON candidate_field.assertion_id = conflict.candidate_assertion_id
      WHERE conflict.conflict_state = 'open'
      ORDER BY master.canonical_name_normalized, conflict.field_name, conflict.conflict_type
    `).all().map((row) => ({ ...row }));
    return { available: true, manifest, validation, conflicts };
  } finally {
    database.close();
  }
}

export const taxonomyMasterCandidateInternals = Object.freeze({
  canonicalKingdomIdentity,
  identityKey,
  normalizeProjectTaxon,
  normalizeCorrection,
  normalizeColRecord,
  diffSnapshots,
});
