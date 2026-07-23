import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  "scripts",
  "fixtures",
  "taxonomy",
  "col-xr-2026-07-17",
);

export const PROTOTYPE_RELEASE = Object.freeze({
  source: "Catalogue of Life",
  datasetKey: 315834,
  alias: "COL26.7 XR",
  releaseId: "col-xr-2026-07-17",
  issued: "2026-07-17",
  doi: "10.48580/dgykv",
  attempt: 607,
  format: "ColDP",
  coldpVersion: "1.2",
});

export const PROTOTYPE_BASE_RELEASE = Object.freeze({
  source: "Catalogue of Life",
  datasetKey: 315777,
  alias: "COL26.7",
  releaseId: "col-base-2026-07-14",
  issued: "2026-07-14",
  doi: "10.48580/dgyhw",
  attempt: 606,
});

const TEST_QUERIES = Object.freeze([
  "Turdus merula",
  "Carduelis carduelis",
  "Cyanistes caeruleus",
  "Parus caeruleus",
  "Saimiri oerstedii",
  "Megaptera novaeangliae",
  "Solea solea",
  "Asterias rubens",
  "Quercus robur",
  "Amanita muscaria",
  "Escherichia coli",
  "Aotus",
  "Panthera leo persica",
  "Raphus cucullatus",
  "Tyrannosaurus rex",
]);

const MARINE_TEST_QUERIES = Object.freeze([
  "Megaptera novaeangliae",
  "Solea solea",
  "Asterias rubens",
]);

const CHECKLISTBANK_HOST = "api.checklistbank.org";
const WORMS_HOST = "www.marinespecies.org";
const REQUEST_HEADERS = Object.freeze({
  Accept: "application/json",
  "User-Agent": "FN-Wildlife-Travel-Taxonomy-Prototype/1.0",
});

function parseOutputArgument(argv) {
  const value = argv.find((argument) => argument.startsWith("--output="));
  return value ? path.resolve(value.slice("--output=".length)) : DEFAULT_OUTPUT;
}

function cleanText(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function booleanText(value) {
  if (value === true || value === 1) return "true";
  if (value === false || value === 0) return "false";
  return "";
}

function serializeTsv(headers, records) {
  const lines = [headers.join("\t")];
  for (const record of records) {
    lines.push(headers.map((header) => cleanText(record[header])).join("\t").replace(/\t+$/, ""));
  }
  return `${lines.join("\n")}\n`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function checklistBankUrl(datasetKey, endpoint) {
  return new URL(`https://${CHECKLISTBANK_HOST}/dataset/${datasetKey}/${endpoint}`);
}

async function fetchJson(url, { allowNotFound = false } = {}) {
  const parsed = new URL(url);
  if (![CHECKLISTBANK_HOST, WORMS_HOST].includes(parsed.hostname)) {
    throw new Error(`Nicht freigegebener Taxonomie-Host: ${parsed.hostname}`);
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(parsed, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(30_000) });
      if (allowNotFound && response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} für ${parsed}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const output = new Array(values.length);
  let index = 0;
  async function worker() {
    while (index < values.length) {
      const current = index;
      index += 1;
      output[current] = await mapper(values[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

function addMatchUsage(target, usage) {
  if (!usage?.id) return;
  target.set(usage.id, {
    id: usage.id,
    scientificName: usage.name,
    authorship: usage.authorship ?? "",
    rank: usage.rank ?? "",
    status: usage.status ?? "",
    parentId: usage.parentId ?? "",
    code: usage.code ?? "",
    sectorKey: usage.sectorKey ?? "",
  });
  for (const ancestor of usage.classification ?? []) {
    if (!ancestor?.id || target.has(ancestor.id)) continue;
    target.set(ancestor.id, {
      id: ancestor.id,
      scientificName: ancestor.name,
      authorship: ancestor.authorship ?? "",
      rank: ancestor.rank ?? "",
      status: ancestor.status ?? "accepted",
      parentId: ancestor.parentId ?? "",
      code: ancestor.code ?? "",
      sectorKey: ancestor.sectorKey ?? "",
    });
  }
}

function compactUsageDetail(detail, fallback) {
  if (!detail) return fallback;
  return {
    id: detail.id,
    scientificName: detail.name?.scientificName ?? fallback.scientificName,
    authorship: detail.name?.authorship ?? fallback.authorship,
    rank: detail.name?.rank ?? fallback.rank,
    status: detail.status ?? fallback.status,
    parentId: detail.parentId ?? fallback.parentId,
    code: detail.name?.code ?? fallback.code,
    sectorKey: detail.sectorKey ?? fallback.sectorKey,
    extinct: detail.extinct,
    environment: Array.isArray(detail.environment)
      ? detail.environment.join(",")
      : detail.environment ?? "",
    identifiers: Array.isArray(detail.identifier) ? detail.identifier : [],
  };
}

function resolveAcceptedId(record) {
  return record.status === "accepted" || record.status === "provisionally accepted"
    ? record.id
    : record.parentId;
}

function resolveKingdom(record, usageById) {
  let current = record;
  const visited = new Set();
  while (current?.id && !visited.has(current.id)) {
    visited.add(current.id);
    if (String(current.rank).toLowerCase() === "kingdom") {
      return { id: current.id, name: current.scientificName };
    }
    current = usageById.get(current.parentId);
  }
  return { id: "", name: "" };
}

async function fetchChecklistBankFixture() {
  const matchResults = [];
  const usageById = new Map();
  for (const query of TEST_QUERIES) {
    const url = checklistBankUrl(PROTOTYPE_RELEASE.datasetKey, "match/nameusage");
    url.searchParams.set("scientificName", query);
    url.searchParams.set("verbose", "true");
    const match = await fetchJson(url);
    const candidates = [match.usage, ...(match.alternatives ?? [])].filter(Boolean);
    matchResults.push({
      query,
      matchType: match.type ?? "",
      candidateIds: candidates.map((candidate) => candidate.id),
    });
    for (const candidate of candidates) addMatchUsage(usageById, candidate);
  }

  const initialUsages = [...usageById.values()];
  const details = await mapWithConcurrency(initialUsages, 8, async (usage) => {
    const endpoint = `nameusage/${encodeURIComponent(usage.id)}`;
    const detail = await fetchJson(checklistBankUrl(PROTOTYPE_RELEASE.datasetKey, endpoint));
    return compactUsageDetail(detail, usage);
  });
  for (const detail of details) usageById.set(detail.id, detail);

  for (const detail of details) {
    if (!detail.parentId || usageById.has(detail.parentId)) continue;
    const endpoint = `nameusage/${encodeURIComponent(detail.parentId)}`;
    const parent = await fetchJson(
      checklistBankUrl(PROTOTYPE_RELEASE.datasetKey, endpoint),
      { allowNotFound: true },
    );
    if (parent) usageById.set(parent.id, compactUsageDetail(parent, {}));
  }

  const trustResults = await mapWithConcurrency([...usageById.values()], 8, async (usage) => {
    const endpoint = `nameusage/${encodeURIComponent(usage.id)}`;
    const baseUsage = await fetchJson(
      checklistBankUrl(PROTOTYPE_BASE_RELEASE.datasetKey, endpoint),
      { allowNotFound: true },
    );
    return [usage.id, baseUsage ? "base" : "xr-supplement"];
  });
  const trustById = new Map(trustResults);

  const acceptedSeedIds = new Set();
  for (const result of matchResults) {
    for (const candidateId of result.candidateIds) {
      const candidate = usageById.get(candidateId);
      const acceptedId = resolveAcceptedId(candidate);
      if (acceptedId) acceptedSeedIds.add(acceptedId);
    }
  }

  const vernacularResponses = await mapWithConcurrency([...acceptedSeedIds], 6, async (taxonId) => {
    const url = checklistBankUrl(
      PROTOTYPE_RELEASE.datasetKey,
      `taxon/${encodeURIComponent(taxonId)}/vernacular`,
    );
    url.searchParams.set("limit", "1000");
    return [taxonId, await fetchJson(url)];
  });
  const vernacularRows = [];
  for (const [taxonId, response] of vernacularResponses) {
    const values = Array.isArray(response) ? response : response?.value ?? [];
    const german = values.filter((value) => ["de", "deu", "ger"].includes(value.language));
    for (const [index, value] of german.entries()) {
      vernacularRows.push({
        taxonID: taxonId,
        sourceID: value.sectorKey ? `col-sector-${value.sectorKey}` : "col-xr-315834",
        name: value.name,
        transliteration: value.latin ?? "",
        language: "deu",
        preferred: booleanText(value.preferred ?? index === 0),
        country: value.country ?? "",
        area: value.area ?? "",
        referenceID: value.referenceId ?? "",
        remarks: value.remarks ?? "",
      });
    }
  }

  const nameUsageRows = [...usageById.values()]
    .map((usage) => {
      const kingdom = resolveKingdom(usage, usageById);
      return {
        ID: usage.id,
        sourceID: usage.sectorKey ? `col-sector-${usage.sectorKey}` : "col-xr-315834",
        parentID: usage.parentId ?? "",
        scientificName: usage.scientificName,
        authorship: usage.authorship ?? "",
        rank: usage.rank,
        status: usage.status,
        code: usage.code ?? "",
        extinct: booleanText(usage.extinct),
        environment: usage.environment ?? "",
        kingdom: kingdom.name,
        alternativeID: (usage.identifiers ?? []).join(","),
        colTrustTier: trustById.get(usage.id),
      };
    })
    .sort((left, right) => left.ID.localeCompare(right.ID, "en"));

  const identifierRows = [];
  for (const usage of usageById.values()) {
    const acceptedId = resolveAcceptedId(usage);
    if (!acceptedId || acceptedId !== usage.id) continue;
    identifierRows.push({
      taxonID: usage.id,
      type: "col",
      identifier: usage.id,
      source: "Catalogue of Life",
      release: PROTOTYPE_RELEASE.alias,
    });
    for (const identifier of usage.identifiers ?? []) {
      const separator = identifier.indexOf(":");
      identifierRows.push({
        taxonID: usage.id,
        type: separator > 0 ? identifier.slice(0, separator) : "external",
        identifier: separator > 0 ? identifier.slice(separator + 1) : identifier,
        source: "Catalogue of Life identifier mapping",
        release: PROTOTYPE_RELEASE.alias,
      });
    }
  }

  return {
    matchResults,
    nameUsageRows,
    vernacularRows,
    identifierRows,
  };
}

async function fetchWormsFixture(checklistFixture) {
  const rows = [];
  for (const query of MARINE_TEST_QUERIES) {
    const url = new URL(
      `https://${WORMS_HOST}/rest/AphiaRecordsByName/${encodeURIComponent(query)}`,
    );
    url.searchParams.set("like", "false");
    url.searchParams.set("marine_only", "true");
    url.searchParams.set("offset", "1");
    const records = await fetchJson(url);
    const record = records?.find((candidate) => candidate.status === "accepted") ?? records?.[0];
    const match = checklistFixture.matchResults.find((value) => value.query === query);
    const candidate = checklistFixture.nameUsageRows.find((value) => (
      match?.candidateIds.includes(value.ID) && value.status === "accepted"
    ));
    if (!record || !candidate) continue;
    const conflictFields = [];
    if (record.valid_name !== candidate.scientificName) conflictFields.push("scientificName");
    if (String(record.rank).toLowerCase() !== String(candidate.rank).toLowerCase()) {
      conflictFields.push("rank");
    }
    rows.push({
      taxonID: candidate.ID,
      aphiaID: record.AphiaID,
      scientificName: record.scientificname,
      acceptedName: record.valid_name,
      authority: record.valid_authority ?? record.authority ?? "",
      rank: record.rank,
      status: record.status,
      kingdom: record.kingdom,
      phylum: record.phylum,
      class: record.class,
      order: record.order,
      family: record.family,
      genus: record.genus,
      marine: booleanText(record.isMarine),
      brackish: booleanText(record.isBrackish),
      freshwater: booleanText(record.isFreshwater),
      terrestrial: booleanText(record.isTerrestrial),
      modified: record.modified ?? "",
      url: record.url ?? "",
      conflict: conflictFields.join(","),
      fetchedAt: new Date().toISOString(),
    });
  }
  return rows;
}

async function writeFixture(outputDirectory, checklistFixture, wormsRows) {
  await fs.mkdir(outputDirectory, { recursive: true });
  const files = new Map();
  files.set("NameUsage.tsv", serializeTsv([
    "ID", "sourceID", "parentID", "scientificName", "authorship", "rank", "status",
    "code", "extinct", "environment", "kingdom", "alternativeID", "colTrustTier",
  ], checklistFixture.nameUsageRows));
  files.set("VernacularName.tsv", serializeTsv([
    "taxonID", "sourceID", "name", "transliteration", "language", "preferred",
    "country", "area", "referenceID", "remarks",
  ], checklistFixture.vernacularRows));
  files.set("ExternalIdentifier.tsv", serializeTsv([
    "taxonID", "type", "identifier", "source", "release",
  ], checklistFixture.identifierRows));
  files.set("WormsComparison.tsv", serializeTsv([
    "taxonID", "aphiaID", "scientificName", "acceptedName", "authority", "rank",
    "status", "kingdom", "phylum", "class", "order", "family", "genus", "marine",
    "brackish", "freshwater", "terrestrial", "modified", "url", "conflict", "fetchedAt",
  ], wormsRows));
  files.set("metadata.yaml", [
    "title: Phase 9.3 bounded Catalogue of Life XR prototype fixture",
    `alias: ${PROTOTYPE_RELEASE.alias}`,
    `issued: ${PROTOTYPE_RELEASE.issued}`,
    `version: ${PROTOTYPE_RELEASE.coldpVersion}`,
    "publisher: Catalogue of Life",
    `doi: ${PROTOTYPE_RELEASE.doi}`,
    "license: CC BY 4.0",
    "description: Reproducible bounded test fixture; not a complete Catalogue of Life release.",
    "",
  ].join("\n"));

  for (const [fileName, content] of files) {
    await fs.writeFile(path.join(outputDirectory, fileName), content, "utf8");
  }

  const fileManifest = Object.fromEntries([...files].map(([fileName, content]) => [
    fileName,
    { bytes: Buffer.byteLength(content), sha256: sha256(content) },
  ]));
  const manifest = {
    schemaVersion: 1,
    fixtureVersion: 1,
    generatedAt: new Date().toISOString(),
    boundedPrototype: true,
    release: PROTOTYPE_RELEASE,
    baseRelease: PROTOTYPE_BASE_RELEASE,
    sourceUrls: {
      checklistBank: `https://${CHECKLISTBANK_HOST}/dataset/${PROTOTYPE_RELEASE.datasetKey}`,
      worms: `https://${WORMS_HOST}/rest/`,
      coldpSpecification: "https://github.com/CatalogueOfLife/coldp",
    },
    license: "CC BY 4.0; integrated source provenance remains attributable.",
    testQueries: checklistFixture.matchResults,
    counts: {
      nameUsages: checklistFixture.nameUsageRows.length,
      vernacularNames: checklistFixture.vernacularRows.length,
      externalIdentifiers: checklistFixture.identifierRows.length,
      wormsComparisons: wormsRows.length,
    },
    files: fileManifest,
  };
  await fs.writeFile(
    path.join(outputDirectory, "prototype-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

async function runCli() {
  const outputDirectory = parseOutputArgument(process.argv.slice(2));
  const checklistFixture = await fetchChecklistBankFixture();
  const wormsRows = await fetchWormsFixture(checklistFixture);
  const manifest = await writeFixture(outputDirectory, checklistFixture, wormsRows);
  console.log(JSON.stringify({
    outputDirectory,
    release: manifest.release.alias,
    counts: manifest.counts,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
