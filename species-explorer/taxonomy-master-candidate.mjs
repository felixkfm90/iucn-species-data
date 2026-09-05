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
  assertTaxonomyMasterContent,
  isMasterSpeciesCandidate,
} from "./taxonomy-taxon-quality.mjs";
import {
  TAXONOMY_MASTER_SCHEMA_VERSION,
  taxonomyMasterActiveDirectory,
  taxonomyMasterCandidateDirectory,
  taxonomyMasterDatabasePath,
  taxonomyMasterManifestPath,
  taxonomyMasterRoot,
} from "./taxonomy-master-storage.mjs";
import { diffTaxonomyMasterDatabases } from "./taxonomy-master-diff.mjs";
import { openPreviousMasterState } from "./taxonomy-master-previous-state.mjs";
import {
  foldTaxonomySearchTerm,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";
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
  "animalia-id",
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
  ["viridiplantae", "Plantae"],
]);

function canonicalKingdomIdentity(value) {
  const kingdom = cleanText(value);
  if (!kingdom) return "";
  return KINGDOM_IDENTITY_ALIASES.get(normalized(kingdom)) || kingdom;
}

function addColKingdomByGenus(kingdomsByGenus, record) {
  const [genus] = cleanText(record.scientificName).split(/\s+/u);
  const kingdom = canonicalKingdomIdentity(record.kingdom);
  if (!genus || !kingdom) return;
  const key = normalized(genus);
  if (!kingdomsByGenus.has(key)) {
    kingdomsByGenus.set(key, kingdom);
  } else if (kingdomsByGenus.get(key) !== kingdom) {
    kingdomsByGenus.set(key, "");
  }
}

function addGroupedSourceRecord(groups, groupsByBaseIdentity, locations, record) {
  const providerRecordId = cleanText(record.providerRecordId);
  const recordKey = `${record.provider}|${providerRecordId || identityKey(record)}`;
  const current = locations.get(recordKey);
  if (current) {
    current.group.records[current.index] = mergeSourceRecord(
      current.group.records[current.index],
      record,
    );
    return;
  }
  const group = ensureGroup(groups, groupsByBaseIdentity, record);
  const index = group.records.length;
  group.records.push(record);
  locations.set(recordKey, { group, index });
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
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

export function taxonomyCorrectionsRevision(corrections = []) {
  const normalizedCorrections = corrections
    .map(normalizeCorrection)
    .filter(Boolean)
    .sort((left, right) => (
      normalized(left.scientificName).localeCompare(normalized(right.scientificName), "en")
      || normalized(left.kingdom).localeCompare(normalized(right.kingdom), "en")
      || normalized(left.rank).localeCompare(normalized(right.rank), "en")
    ));
  return crypto.createHash("sha256")
    .update(JSON.stringify(normalizedCorrections))
    .digest("hex");
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

function registerBaseIdentityGroup(groupsByBaseIdentity, group) {
  const key = baseIdentityKey(group);
  const matches = groupsByBaseIdentity.get(key) || new Set();
  matches.add(group);
  groupsByBaseIdentity.set(key, matches);
}

function ensureGroup(groups, groupsByBaseIdentity, value) {
  const scientificName = cleanText(value.scientificName);
  const rank = normalizeRank(value.rank);
  const kingdom = canonicalKingdomIdentity(value.kingdom);
  const key = identityKey({ scientificName, rank, kingdom });
  let group = groups.get(key);
  const sameTaxonGroups = () => [
    ...(groupsByBaseIdentity.get(baseIdentityKey({ scientificName, rank })) || []),
  ];
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
    registerBaseIdentityGroup(groupsByBaseIdentity, group);
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
      `Anbieter-Datensatz ${left.provider}:${left.providerRecordId} besitzt widersprüchliche Reiche.`,
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

function summarizeDatabase(database) {
  const statuses = Object.fromEntries(database.prepare(`
    SELECT status_name, COUNT(*) AS count
    FROM master_taxon_status
    GROUP BY status_name
  `).all().map((row) => [row.status_name, Number(row.count)]));
  return {
    taxa: Number(database.prepare("SELECT COUNT(*) AS count FROM master_taxon").get().count),
    germanNames: Number(database.prepare(`
      SELECT COUNT(DISTINCT master_taxon_id) AS count
      FROM master_field_assertion
      WHERE selected = 1 AND field_name = 'german-name'
    `).get().count),
    englishNames: Number(database.prepare(`
      SELECT COUNT(DISTINCT master_taxon_id) AS count
      FROM master_field_assertion
      WHERE selected = 1 AND field_name = 'english-name'
    `).get().count),
    projectTaxa: Number(database.prepare("SELECT COUNT(*) AS count FROM project_taxon_link").get().count),
    providerAssertions: Number(database.prepare("SELECT COUNT(*) AS count FROM provider_taxon_assertion").get().count),
    names: Number(database.prepare("SELECT COUNT(*) AS count FROM provider_name_assertion").get().count),
    aliases: Number(database.prepare("SELECT COUNT(*) AS count FROM master_taxon_alias").get().count),
    fields: Number(database.prepare("SELECT COUNT(*) AS count FROM master_field_assertion").get().count),
    conflicts: Number(database.prepare("SELECT COUNT(*) AS count FROM master_conflict WHERE conflict_state = 'open'").get().count),
    searchTerms: Number(database.prepare("SELECT COUNT(*) AS count FROM master_search_term").get().count),
    statuses,
  };
}

function searchTokens(value) {
  const text = cleanText(value);
  if (!text) return [];
  return [...new Set(text.split(/[^\p{L}\p{N}]+/u).filter((entry) => entry.length >= 2))];
}

async function rebuildMasterSearchTerms(database, onProgress = () => {}) {
  database.exec("DELETE FROM master_search_term");
  const sourceCounts = [
    "SELECT COUNT(*) AS count FROM master_taxon WHERE lifecycle_state != 'deprecated'",
    "SELECT COUNT(*) AS count FROM master_field_assertion WHERE selected = 1",
    "SELECT COUNT(*) AS count FROM master_taxon_alias",
    `SELECT COUNT(*) AS count
      FROM provider_name_assertion name
      JOIN provider_taxon_assertion source
        ON source.assertion_id = name.provider_taxon_assertion_id
      WHERE source.version_change_state != 'removed'`,
    "SELECT COUNT(*) AS count FROM provider_taxon_assertion WHERE version_change_state != 'removed'",
    "SELECT COUNT(*) AS count FROM project_taxon_link",
  ];
  const total = sourceCounts.reduce((sum, sql) => (
    sum + Number(database.prepare(sql).get().count)
  ), 0);
  let processed = 0;
  const advance = async () => {
    processed += 1;
    if (processed % 2000 !== 0) return;
    onProgress({
      phase: "Suchindex",
      message: "Der Suchindex der Masterdatenbank wird aufgebaut.",
      current: processed,
      total,
      percent: 85 + Math.min(11, Math.round((processed / Math.max(1, total)) * 11)),
    });
    await yieldToEventLoop();
  };
  const insert = database.prepare(`
    INSERT OR IGNORE INTO master_search_term (
      master_taxon_id,
      term,
      normalized_term,
      folded_term,
      german_key,
      term_kind,
      language,
      source_provider,
      weight
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const add = ({
    masterTaxonId,
    term,
    termKind,
    language = "",
    provider,
    weight,
    tokenize = false,
  }) => {
    const values = tokenize ? [cleanText(term), ...searchTokens(term)] : [cleanText(term)];
    for (const value of [...new Set(values.filter(Boolean))]) {
      insert.run(
        masterTaxonId,
        value,
        normalizeTaxonomySearchTerm(value),
        foldTaxonomySearchTerm(value),
        germanTaxonomySearchKey(value),
        termKind,
        language,
        provider,
        Number(weight) + (value === cleanText(term) ? 0 : 12),
      );
    }
  };
  for (const row of database.prepare(`
    SELECT master_taxon_id, canonical_scientific_name
    FROM master_taxon
    WHERE lifecycle_state != 'deprecated'
  `).iterate()) {
    add({
      masterTaxonId: row.master_taxon_id,
      term: row.canonical_scientific_name,
      termKind: "scientific",
      provider: "catalogue-of-life",
      weight: 0,
      tokenize: true,
    });
    await advance();
  }
  for (const row of database.prepare(`
    SELECT field.master_taxon_id, field.field_name, field.field_value, field.language,
      release.provider
    FROM master_field_assertion field
    JOIN provider_release release ON release.release_id = field.release_id
    WHERE field.selected = 1
  `).iterate()) {
    const identifier = row.field_name.endsWith("-id");
    const vernacular = ["german-name", "english-name"].includes(row.field_name);
    add({
      masterTaxonId: row.master_taxon_id,
      term: row.field_value,
      termKind: identifier ? "identifier" : (vernacular ? "vernacular" : "scientific"),
      language: row.language || "",
      provider: row.provider,
      weight: vernacular ? 2 : (identifier ? 25 : 1),
      tokenize: vernacular || row.field_name === "scientific-name",
    });
    await advance();
  }
  for (const row of database.prepare(`
    SELECT alias.master_taxon_id, alias.name, alias.alias_type,
      COALESCE(release.provider, 'project') AS provider
    FROM master_taxon_alias alias
    LEFT JOIN provider_taxon_assertion source
      ON source.assertion_id = alias.source_assertion_id
    LEFT JOIN provider_release release ON release.release_id = source.release_id
  `).iterate()) {
    add({
      masterTaxonId: row.master_taxon_id,
      term: row.name,
      termKind: row.alias_type === "project-name" ? "project" : "synonym",
      provider: row.provider,
      weight: row.alias_type === "project-name" ? 3 : 8,
      tokenize: true,
    });
    await advance();
  }
  for (const row of database.prepare(`
    SELECT source.master_taxon_id, name.name, name.language, name.name_kind,
      name.preferred, name.verified, release.provider
    FROM provider_name_assertion name
    JOIN provider_taxon_assertion source
      ON source.assertion_id = name.provider_taxon_assertion_id
    JOIN provider_release release ON release.release_id = source.release_id
    WHERE source.version_change_state != 'removed'
  `).iterate()) {
    const termKind = ["scientific", "synonym"].includes(row.name_kind)
      ? row.name_kind
      : "vernacular";
    add({
      masterTaxonId: row.master_taxon_id,
      term: row.name,
      termKind,
      language: row.language || "",
      provider: row.provider,
      weight: termKind === "vernacular"
        ? (row.verified ? 4 : (row.preferred ? 6 : 10))
        : (termKind === "synonym" ? 8 : 2),
      tokenize: true,
    });
    await advance();
  }
  for (const row of database.prepare(`
    SELECT source.master_taxon_id, source.provider_record_id, release.provider
    FROM provider_taxon_assertion source
    JOIN provider_release release ON release.release_id = source.release_id
    WHERE source.version_change_state != 'removed'
  `).iterate()) {
    add({
      masterTaxonId: row.master_taxon_id,
      term: row.provider_record_id,
      termKind: "identifier",
      provider: row.provider,
      weight: 25,
    });
    await advance();
  }
  for (const row of database.prepare(`
    SELECT master_taxon_id, project_taxon_key, project_slug, scientific_name_at_link
    FROM project_taxon_link
  `).iterate()) {
    for (const term of [row.project_taxon_key, row.project_slug, row.scientific_name_at_link]) {
      add({
        masterTaxonId: row.master_taxon_id,
        term,
        termKind: "project",
        provider: "project",
        weight: 1,
        tokenize: true,
      });
    }
    await advance();
  }
  onProgress({
    phase: "Suchindex",
    message: "Der Suchindex ist aufgebaut.",
    current: total,
    total,
    percent: 96,
  });
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
  retainedTaxa = [],
  onProgress = () => {},
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
  const normalizedRetainedTaxa = retainedTaxa.map((entry) => ({
    scientificName: cleanText(entry.scientificName),
    rank: normalizeRank(entry.rank),
    kingdom: cleanText(entry.kingdom),
  })).filter((entry) => entry.scientificName);
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
  const groupsByBaseIdentity = new Map();
  const recordLocations = new Map();
  const colKingdomByGenus = new Map();
  for (const project of normalizedProjects) {
    ensureGroup(groups, groupsByBaseIdentity, project).projects.push(project);
  }
  for (const correction of normalizedCorrections) {
    ensureGroup(groups, groupsByBaseIdentity, correction).corrections.push(correction);
  }
  for (const retained of normalizedRetainedTaxa) {
    ensureGroup(groups, groupsByBaseIdentity, retained).retained = true;
  }
  let processedColRecords = 0;
  for await (const value of colRecords) {
    const record = normalizeColRecord(value, {
      importedAt: normalizedColRelease.importedAt,
    });
    processedColRecords += 1;
    if (isMasterSpeciesCandidate(record)) {
      addColKingdomByGenus(colKingdomByGenus, record);
      addGroupedSourceRecord(groups, groupsByBaseIdentity, recordLocations, record);
    }
    if (processedColRecords % 1000 === 0) {
      await yieldToEventLoop();
    }
  }
  let processedProviderRecords = 0;
  const providerRecordCount = normalizedSlices.reduce(
    (sum, slice) => sum + slice.records.length,
    0,
  );
  onProgress({
    phase: "Anbieter-Datensätze",
    message: "Anbieter-Datensätze werden zusammengeführt.",
    current: 0,
    total: providerRecordCount,
    percent: 60,
  });
  for (const slice of normalizedSlices) {
    for (const value of slice.records) {
      const normalizedRecord = {
        ...value,
        provider: slice.release.provider,
        rank: normalizeRank(value.rank),
        scientificName: cleanText(value.scientificName),
        kingdom: cleanText(value.kingdom || value.hierarchy?.kingdom),
        retrievedAt: cleanText(value.retrievedAt || slice.release.importedAt),
        names: Array.isArray(value.names) ? value.names : [],
        hierarchy: value.hierarchy || {},
        externalIds: value.externalIds || {},
        relevanceReasons: value.relevanceReasons || ["searched-taxon"],
        versionChangeState: cleanText(value.versionChangeState || "unchanged"),
      };
      processedProviderRecords += 1;
      if (isMasterSpeciesCandidate(normalizedRecord) && normalizedRecord.scientificName) {
        addGroupedSourceRecord(
          groups,
          groupsByBaseIdentity,
          recordLocations,
          normalizedRecord,
        );
      }
      if (processedProviderRecords % 1000 === 0) {
        onProgress({
          phase: "Anbieter-Datensätze",
          message: "Anbieter-Datensätze werden zusammengeführt.",
          current: processedProviderRecords,
          total: providerRecordCount,
          percent: 60 + Math.min(10, Math.round(
            (processedProviderRecords / Math.max(1, providerRecordCount)) * 10,
          )),
        });
        await yieldToEventLoop();
      }
    }
  }
  recordLocations.clear();

  const { DatabaseSync } = await loadNodeSqlite();
  const activePath = taxonomyMasterDatabasePath(taxonomyRoot, "active");
  const previousState = openPreviousMasterState(activePath, DatabaseSync, {
    historyPath: taxonomyMasterDatabasePath(taxonomyRoot, "previous"),
  });
  const previousByIdentity = new Map();
  const previousByBaseIdentity = new Map();
  for (const previousTaxon of previousState.taxa.values()) {
    const identity = identityKey({
      scientificName: previousTaxon.canonical_scientific_name,
      rank: previousTaxon.rank,
      kingdom: previousTaxon.kingdom,
    });
    previousByIdentity.set(identity, previousTaxon);
    const baseIdentity = baseIdentityKey({
      scientificName: previousTaxon.canonical_scientific_name,
      rank: previousTaxon.rank,
    });
    const matches = previousByBaseIdentity.get(baseIdentity) || [];
    matches.push(previousTaxon);
    previousByBaseIdentity.set(baseIdentity, matches);
  }
  for (const group of groups.values()) {
    const exactPrevious = previousByIdentity.get(group.key);
    const baseKey = baseIdentityKey(group);
    const baseMatches = previousByBaseIdentity.get(baseKey) || [];
    const currentMatches = groupsByBaseIdentity.get(baseKey);
    const onlyPrevious = baseMatches.length === 1 ? baseMatches[0] : null;
    const previousKingdom = canonicalKingdomIdentity(onlyPrevious?.kingdom);
    const currentKingdom = canonicalKingdomIdentity(group.kingdom);
    // Gleicher Name/Rang allein ist bei Homonymen keine Identität. Sonst erbt
    // ein neues Tier die Pflanzenfelder und belegt vorzeitig deren Quellen-ID.
    const unambiguousPrevious = currentMatches?.size === 1
      && (!previousKingdom || !currentKingdom || previousKingdom === currentKingdom)
      ? onlyPrevious : null;
    group.previousTaxon = exactPrevious || unambiguousPrevious;
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
    // Der reale Masterbestand umfasst mehrere hunderttausend Taxa und noch
    // deutlich mehr Namens-, Herkunfts- und Suchzeilen. Ohne eine gemeinsame
    // Transaktion bestaetigt SQLite jeden einzelnen INSERT separat; ein
    // vollstaendiger Kandidatenbau wuerde dadurch viele Stunden dauern. Die
    // Staging-Datenbank ist fuer den Aufbau exklusiv, deshalb darf der gesamte
    // konsistente Kandidat atomar geschrieben werden. Ein Fehler oder das
    // Schliessen vor COMMIT verwirft die unvollstaendige Transaktion.
    database.exec("BEGIN IMMEDIATE");
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
    const groupCount = groups.size;
    let writtenGroups = 0;
    for (const group of groups.values()) {
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
      const [groupGenus] = cleanText(group.scientificName).split(/\s+/u);
      const kingdom = canonicalKingdomIdentity(
        group.projects[0]?.kingdom
        || exactCol?.kingdom
        || activeRecords.find((record) => record.kingdom)?.kingdom
        || colKingdomByGenus.get(normalized(groupGenus)),
      );
      const masterTaxonId = createStableMasterTaxonId({
        scientificName: exactCol?.scientificName || group.scientificName,
        rank: group.rank,
        kingdom,
      });
      const referenceGapContext = Boolean(
        group.projects.length
        || externalProviders.size
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
          // Die Anbieterbehauptung bleibt roh und nachvollziehbar. Eine sicher
          // aus CoL-Gattungsevidenz abgeleitete Masterzuordnung darf nicht so
          // aussehen, als haette der externe Anbieter sie selbst geliefert.
          kingdom: record.kingdom || null,
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
      const oldKingdom = canonicalKingdomIdentity(oldTaxon?.kingdom);
      const compatibleOldTaxon = !oldKingdom || !kingdom || oldKingdom === kingdom ? oldTaxon : null;
      const previousMasterTaxon = previousState.taxa.get(masterTaxonId) || compatibleOldTaxon;
      const previousMasterTaxonId = previousMasterTaxon?.master_taxon_id || masterTaxonId;
      const explicitFieldKeys = new Set(fieldCandidates
        .filter((field) => field && ["manual", "project"].includes(field.originKind))
        .map(candidateKey));
      const currentFields = previousState.fieldsFor(previousMasterTaxonId, explicitFieldKeys);
      const protectedPreviousFieldKeys = new Set([
        ...explicitFieldKeys,
        ...currentFields
          .filter((field) => ["manual", "project"].includes(field.origin_kind))
          .map((field) => `${field.field_name}|${field.language || ""}`),
      ]);
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
        const protectsPreviousField = protectedPreviousFieldKeys.has(key);
        if (list.some((entry) => normalized(entry.fieldValue) === normalized(current.field_value)
          && (current.origin_kind === "source" || entry.originKind === current.origin_kind))) continue;
        // Reine Anbieterwerte des globalen Offlinebestands folgen beim neuen
        // Quellenstand der aktuellen Priorität. Das gilt auch für deren
        // Hierarchiefelder bei einer Projektart. Nur das konkret im Projekt
        // oder manuell gepflegte Feld und Felder ohne jeden frischen Ersatz
        // brauchen den bisherigen Wert als geschützten Vergleichskandidaten.
        if (!protectsPreviousField && list.length) continue;
        const originKind = current.origin_kind;
        const provenance = originKind === "source"
          ? previousState.retainSource(database, current, masterTaxonId)
          : { releaseId: releaseByProvider.get(originKind).releaseId };
        list.push(fieldCandidate({
          fieldName: current.field_name,
          fieldValue: current.field_value,
          language: current.language,
          // Der bisherige Anbieterwert behält Quelle, Release und Feldherkunft.
          // Sonst würde der nächste Aufbau ihn als manuelle Entscheidung schützen.
          provider: current.provider,
          originKind,
          ...provenance,
          confidence: current.confidence,
          selected: true,
          current: true,
        }));
        byField.set(key, list);
      }
      for (const [key, candidates] of byField) {
        const protectsPreviousField = protectedPreviousFieldKeys.has(key);
        candidates.sort(compareCandidates);
        const freshCandidates = candidates.filter((entry) => !entry.current);
        const currentValue = currentFields.find((entry) => (
          `${entry.field_name}|${entry.language || ""}` === key
        ));
        let selectedCandidate = freshCandidates[0] || candidates[0];
        let conflictCandidate = null;
        if (currentValue && protectsPreviousField) {
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
            if (decision.action === "select") {
              selectedCandidate = preferred;
            } else if (decision.action === "conflict") {
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
          groupBlockingConflictCount += 1;
        }
      }
      const referenceGapNeedsReview = !exactCol && Boolean(
        group.projects.length
        || group.corrections.length
        || previousMasterTaxon
      );
      if (referenceGapNeedsReview) {
        const conflictId = shaId("gap", masterTaxonId, group.scientificName);
        addMasterConflict(database, {
          conflictId,
          masterTaxonId,
          conflictType: "reference-gap",
          detectedAt: timestamp,
          resolutionNote: "Keine exakte Artzeile in der aktiven CoL-Referenz.",
        });
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
      for (const alias of previousState.aliasesFor(previousMasterTaxonId)) {
        addMasterTaxonAlias(database, {
          masterTaxonId,
          name: alias.name,
          rank: alias.rank,
          kingdom: alias.kingdom,
          aliasType: alias.alias_type,
        });
      }
      writtenGroups += 1;
      if (writtenGroups % 500 === 0) {
        onProgress({
          phase: "Masterdatenbank schreiben",
          message: "Taxa, Namen, Hierarchie und Herkunft werden in den Kandidaten geschrieben.",
          current: writtenGroups,
          total: groupCount,
          percent: 70 + Math.min(15, Math.round((writtenGroups / Math.max(1, groupCount)) * 15)),
        });
        await yieldToEventLoop();
      }
    }
    onProgress({
      phase: "Masterdatenbank schreiben",
      message: "Die Masterdaten sind vollständig geschrieben.",
      current: groupCount,
      total: groupCount,
      percent: 85,
    });
    groups.clear();
    groupsByBaseIdentity.clear();
    previousByIdentity.clear();
    previousByBaseIdentity.clear();
    colKingdomByGenus.clear();
    previousState.close();
    await rebuildMasterSearchTerms(database, onProgress);
    onProgress({
      phase: "Prüfung",
      message: "Konsistenz, fachliche Mindestwerte und Änderungen werden geprüft.",
      current: null,
      total: null,
      percent: 97,
    });
    const validation = validateTaxonomyMasterDatabase(database);
    const contentQuality = assertTaxonomyMasterContent(database);
    const diff = await diffTaxonomyMasterDatabases({
      previousPath: activePath,
      currentDatabase: database,
      DatabaseSync,
      onProgress,
    });
    const summary = summarizeDatabase(database);
    onProgress({
      phase: "Abschluss",
      message: "Manifest und atomar aktivierbarer Kandidat werden fertiggestellt.",
      current: null,
      total: null,
      percent: 99,
    });
    manifest = {
      schemaVersion: TAXONOMY_MASTER_SCHEMA_VERSION,
      candidateId: `master-${timestamp.replace(/[^0-9]/g, "").slice(0, 17)}`,
      createdAt: timestamp,
      state: "staging",
      inputRevisions: {
        corrections: taxonomyCorrectionsRevision(normalizedCorrections),
      },
      sources: releases.map((release) => ({
        provider: release.provider,
        providerVersion: release.providerVersion,
        releaseId: release.releaseId,
        recordCount: release.recordCount,
      })),
      summary,
      diff,
      validation,
      contentQuality,
      requiresConfirmation: true,
    };
    database.exec("COMMIT");
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
  } finally {
    previousState.close();
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

export async function inspectTaxonomyMasterCandidate(taxonomyRoot, {
  validate = true,
  blockingConflictsOnly = false,
} = {}) {
  const manifest = await readTaxonomyMasterManifest(taxonomyRoot, "staging");
  if (!manifest) return { available: false, reason: "no-candidate" };
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "staging"), {
    readOnly: true,
  });
  try {
    const validation = validate
      ? validateTaxonomyMasterDatabase(database)
      : manifest.validation || null;
    const blockingConflictCount = Number(database.prepare(`
      SELECT COUNT(*) AS count
      FROM master_conflict
      WHERE conflict_state = 'open'
        AND conflict_type IN ('changed-value', 'source-removed', 'ambiguous-match')
    `).get().count);
    const conflictFilter = blockingConflictsOnly
      ? "AND conflict.conflict_type IN ('changed-value', 'source-removed', 'ambiguous-match')"
      : "";
    const conflictLimit = blockingConflictsOnly ? "LIMIT 100" : "";
    const conflicts = database.prepare(`
      SELECT conflict.*, master.canonical_scientific_name,
        german_field.field_value AS german_name,
        current_field.field_value AS current_value,
        current_field.origin_kind AS current_origin_kind,
        current_release.provider AS current_provider,
        candidate_field.field_value AS candidate_value,
        candidate_field.origin_kind AS candidate_origin_kind,
        candidate_release.provider AS candidate_provider
      FROM master_conflict conflict
      JOIN master_taxon master ON master.master_taxon_id = conflict.master_taxon_id
      LEFT JOIN master_field_assertion german_field
        ON german_field.master_taxon_id = conflict.master_taxon_id
        AND german_field.field_name = 'german-name'
        AND german_field.selected = 1
      LEFT JOIN master_field_assertion current_field
        ON current_field.assertion_id = conflict.current_assertion_id
      LEFT JOIN provider_release current_release
        ON current_release.release_id = current_field.release_id
      LEFT JOIN master_field_assertion candidate_field
        ON candidate_field.assertion_id = conflict.candidate_assertion_id
      LEFT JOIN provider_release candidate_release
        ON candidate_release.release_id = candidate_field.release_id
      WHERE conflict.conflict_state = 'open'
        ${conflictFilter}
      ORDER BY master.canonical_name_normalized, conflict.field_name, conflict.conflict_type
      ${conflictLimit}
    `).all().map((row) => ({ ...row }));
    return { available: true, manifest, validation, conflicts, blockingConflictCount };
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
  rebuildMasterSearchTerms,
});
