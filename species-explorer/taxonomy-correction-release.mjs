import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { taxonomyCorrectionsRevision } from "./taxonomy-master-candidate.mjs";
import {
  lightroomSearchDatabasePath,
  readLightroomSearchManifest,
} from "./lightroom-search-storage.mjs";
import {
  taxonomyMasterDatabasePath,
  taxonomyMasterManifestPath,
} from "./taxonomy-master-storage.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { atomicWriteJson, loadNodeSqlite } from "./taxonomy-storage.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { resolveProviderGermanName } from "./taxonomy-provider-standard.mjs";
import { readTaxonomyPublication } from "./taxonomy-publication-storage.mjs";

export const TAXONOMY_CORRECTION_RELEASE_SCHEMA_VERSION = 1;
export const TAXONOMY_CORRECTION_POINTER_SCHEMA_VERSION = 1;

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function correctionRoot(dataRoot) {
  return path.join(path.dirname(path.resolve(dataRoot)), "corrections");
}

export function taxonomyCorrectionRoot(dataRoot) {
  return correctionRoot(dataRoot);
}

export function taxonomyCorrectionActivePointerPath(dataRoot) {
  return path.join(correctionRoot(dataRoot), "active.json");
}

export function taxonomyCorrectionReleasePath(dataRoot, releaseId) {
  const normalized = cleanText(releaseId);
  if (!/^corrections-[a-f0-9]{20}$/u.test(normalized)) {
    throw new Error(`Ungültige Korrektur-Releasekennung: ${normalized || "(leer)"}`);
  }
  return path.join(correctionRoot(dataRoot), "releases", `${normalized}.json`);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readActiveTaxonomyCorrectionPointer(dataRoot, {
  expectedMasterVersion = "", expectedPackageId = "",
} = {}) {
  const publication = readTaxonomyPublication(dataRoot);
  const separate = await readJson(taxonomyCorrectionActivePointerPath(dataRoot));
  const matches = (entry) => entry
    && (!expectedMasterVersion || entry.baseMasterVersion === expectedMasterVersion)
    && (!expectedPackageId || entry.basePackageId === expectedPackageId);
  const pair = publication && [publication.active, publication.previous].find((entry) => entry
    && (!expectedMasterVersion || entry.masterVersion === expectedMasterVersion)
    && (!expectedPackageId || entry.packageId === expectedPackageId));
  const pointer = publication
    ? (matches(separate) && separate.baseMasterVersion === pair?.masterVersion && separate.basePackageId === pair?.packageId
      ? separate : pair?.correctionPointer)
    : separate;
  if (!pointer) return null;
  if (Number(pointer.schemaVersion) !== TAXONOMY_CORRECTION_POINTER_SCHEMA_VERSION) {
    throw new Error(`Nicht unterstützte Korrektur-Aktivierungsversion: ${pointer.schemaVersion}`);
  }
  taxonomyCorrectionReleasePath(dataRoot, pointer.activeRelease);
  if (pointer.previousRelease) taxonomyCorrectionReleasePath(dataRoot, pointer.previousRelease);
  return {
    ...pointer,
    revision: cleanText(pointer.revision),
    baseMasterVersion: cleanText(pointer.baseMasterVersion),
    basePackageId: cleanText(pointer.basePackageId),
  };
}

export async function readActiveTaxonomyCorrectionRelease(dataRoot, {
  expectedMasterVersion = "",
  expectedPackageId = "",
} = {}) {
  const pointer = await readActiveTaxonomyCorrectionPointer(dataRoot, { expectedMasterVersion, expectedPackageId });
  if (!pointer) return null;
  const requiredMaster = cleanText(expectedMasterVersion);
  const requiredPackage = cleanText(expectedPackageId);
  if (requiredMaster && pointer.baseMasterVersion !== requiredMaster) return null;
  if (requiredPackage && pointer.basePackageId !== requiredPackage) return null;
  const release = await readJson(taxonomyCorrectionReleasePath(dataRoot, pointer.activeRelease));
  if (!release) throw new Error("Das aktivierte Korrektur-Release fehlt.");
  if (Number(release.schemaVersion) !== TAXONOMY_CORRECTION_RELEASE_SCHEMA_VERSION) {
    throw new Error(`Nicht unterstützte Korrektur-Releaseversion: ${release.schemaVersion}`);
  }
  for (const key of ["releaseId", "revision", "baseMasterVersion", "basePackageId"]) {
    if (cleanText(release[key]) !== cleanText(pointer[key === "releaseId" ? "activeRelease" : key])) {
      throw new Error(`Korrektur-Aktivierung und Release stimmen bei ${key} nicht überein.`);
    }
  }
  return release;
}

function normalizedCorrections(corrections = []) {
  const unique = new Map();
  for (const value of corrections) {
    const scientificName = cleanText(value.scientificName);
    if (!scientificName) continue;
    const key = normalizeTaxonomySearchTerm(scientificName);
    if (unique.has(key)) {
      throw new Error(`Doppelte eigene Korrektur für ${scientificName}.`);
    }
    const entry = {
      scientificName,
      rank: cleanText(value.rank || "species").toLocaleLowerCase("en"),
      kingdom: cleanText(value.kingdom || "Animalia"),
      germanName: cleanText(value.germanName),
      ...(value.germanNameMode === "provider" ? { germanNameMode: "provider" } : {}),
      ...(value.namePreference?.masterTaxonId ? { namePreference: { masterTaxonId: cleanText(value.namePreference.masterTaxonId) } } : {}),
      englishName: cleanText(value.englishName),
      note: cleanText(value.note),
    };
    if (!entry.germanName && !entry.englishName && entry.germanNameMode !== "provider") {
      throw new Error(`Die Korrektur für ${scientificName} enthält keinen Namen.`);
    }
    unique.set(key, entry);
  }
  return [...unique.values()].sort((left, right) => (
    left.scientificName.localeCompare(right.scientificName, "en", { sensitivity: "base" })
  ));
}

function resolveCorrectionEntries(masterDatabase, lightroomDatabase, corrections) {
  const masterRows = masterDatabase.prepare(`
    SELECT master_taxon_id, canonical_scientific_name, rank, kingdom
    FROM master_taxon
    WHERE canonical_name_normalized = ? AND lifecycle_state != 'deprecated'
    ORDER BY master_taxon_id
  `);
  const packageRow = lightroomDatabase.prepare(`
    SELECT master_taxon_id, accepted_scientific_name, rank, kingdom
    FROM taxon
    WHERE master_taxon_id = ? AND lifecycle_state != 'deprecated'
  `);
  return corrections.map((correction) => {
    const masterMatches = masterRows.all(normalizeTaxonomySearchTerm(correction.scientificName));
    if (masterMatches.length !== 1) {
      throw new Error(
        `${correction.scientificName} ist im aktiven Master nicht eindeutig vorhanden (${masterMatches.length} Treffer).`,
      );
    }
    const master = masterMatches[0];
    if (correction.namePreference?.masterTaxonId && correction.namePreference.masterTaxonId !== master.master_taxon_id) {
      throw new Error(`${correction.scientificName}: Die Namenspräferenz gehört zu einer anderen Masteridentität. Bitte die Artänderung ausdrücklich klären.`);
    }
    const packageMatch = packageRow.get(master.master_taxon_id);
    if (
      !packageMatch
      || normalizeTaxonomySearchTerm(packageMatch.accepted_scientific_name)
        !== normalizeTaxonomySearchTerm(master.canonical_scientific_name)
    ) {
      throw new Error(
        `${correction.scientificName} ist im aktiven Lightroom-Paket nicht eindeutig mit dem Master verknüpft.`,
      );
    }
    if (correction.rank && cleanText(master.rank) !== correction.rank) {
      throw new Error(`${correction.scientificName} besitzt im Master nicht den erwarteten Rang ${correction.rank}.`);
    }
    if (correction.kingdom && cleanText(master.kingdom) !== correction.kingdom) {
      throw new Error(`${correction.scientificName} gehört im Master nicht zum erwarteten Reich ${correction.kingdom}.`);
    }
    const providerStandard = correction.germanNameMode === "provider"
      ? resolveProviderGermanName(masterDatabase, master.master_taxon_id) : null;
    return {
      masterTaxonId: master.master_taxon_id,
      scientificName: master.canonical_scientific_name,
      germanName: providerStandard?.germanName || correction.germanName,
      ...(providerStandard ? { germanNameMode: "provider", germanNameSource: providerStandard } : {}),
      englishName: correction.englishName,
      note: correction.note,
    };
  });
}

// Older releases hashed the names without the subsequently introduced ID binding.
// Accept that representation only after checking every identity in both active DBs.
// This is read-only: neither opening a dialog nor checking status publishes a release.
export async function taxonomyCorrectionsMatchActive({ taxonomyRoot, searchRoot, corrections = [], activeRevision } = {}) {
  if (taxonomyCorrectionsRevision(corrections) === activeRevision) return true;
  const legacy = corrections.map(({ namePreference: _preference, ...entry }) => entry);
  if (!activeRevision || taxonomyCorrectionsRevision(legacy) !== activeRevision || !searchRoot) return false;
  let masterDatabase;
  let lightroomDatabase;
  try {
    const masterManifest = await readJson(taxonomyMasterManifestPath(taxonomyRoot, "active"));
    const packageManifest = await readLightroomSearchManifest(searchRoot, "active");
    const masterVersion = masterManifest?.candidateId || masterManifest?.masterVersion;
    if (!masterVersion || masterVersion !== packageManifest?.masterVersion) return false;
    const overlay = await readActiveTaxonomyCorrectionRelease(taxonomyRoot, {
      expectedMasterVersion: masterVersion, expectedPackageId: packageManifest.packageId,
    });
    if ((overlay?.revision || masterManifest.inputRevisions?.corrections) !== activeRevision) return false;
    const { DatabaseSync } = await loadNodeSqlite();
    masterDatabase = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "active"), { readOnly: true });
    lightroomDatabase = new DatabaseSync(lightroomSearchDatabasePath(searchRoot, "active"), { readOnly: true });
    const resolved = resolveCorrectionEntries(masterDatabase, lightroomDatabase, normalizedCorrections(corrections));
    return !overlay || resolved.every((entry) => overlay.entries.some((old) => (
      old.masterTaxonId === entry.masterTaxonId && old.scientificName === entry.scientificName
    )));
  } catch {
    return false; // Unreadable or changed identities remain pending, never silently accepted.
  } finally {
    lightroomDatabase?.close();
    masterDatabase?.close();
  }
}

export async function prepareTaxonomyCorrectionRelease({
  taxonomyRoot,
  searchRoot,
  corrections = [],
  now = () => new Date(),
  masterDirectory = null,
  packageDirectory = null,
} = {}) {
  if (!taxonomyRoot || !searchRoot) {
    throw new TypeError("Taxonomie- und Lightroom-Suchpaketpfad sind erforderlich.");
  }
  masterDirectory ??= path.dirname(taxonomyMasterDatabasePath(taxonomyRoot, "active"));
  packageDirectory ??= path.dirname(lightroomSearchDatabasePath(searchRoot, "active"));
  const masterCorrectionRoot = correctionRoot(taxonomyRoot);
  const packageCorrectionRoot = correctionRoot(searchRoot);
  if (masterCorrectionRoot !== packageCorrectionRoot) {
    throw new Error(
      "Masterdatenbank und Lightroom-Suchpaket verwenden keinen gemeinsamen Korrekturspeicher.",
    );
  }
  const normalized = normalizedCorrections(corrections);
  const [masterManifest, packageManifest] = await Promise.all([
    readJson(path.join(masterDirectory, "manifest.json")),
    readJson(path.join(packageDirectory, "manifest.json")),
  ]);
  if (!masterManifest || !packageManifest) {
    throw new Error("Für die schnelle Korrektur müssen Master und Lightroom-Suchpaket aktiv sein.");
  }
  const baseMasterVersion = cleanText(masterManifest.candidateId || masterManifest.masterVersion);
  const packageMasterVersion = cleanText(packageManifest.masterVersion);
  if (!baseMasterVersion || packageMasterVersion !== baseMasterVersion) {
    throw new Error("Das aktive Lightroom-Suchpaket entspricht nicht dem aktiven Masterstand.");
  }
  const activeCorrectionRelease = await readActiveTaxonomyCorrectionRelease(taxonomyRoot, {
    expectedMasterVersion: baseMasterVersion,
    expectedPackageId: packageManifest.packageId,
  });
  const correctionKeys = new Set(
    normalized.map((entry) => normalizeTaxonomySearchTerm(entry.scientificName)),
  );
  const removedActiveCorrection = activeCorrectionRelease?.entries?.find((entry) => (
    !correctionKeys.has(normalizeTaxonomySearchTerm(entry.scientificName))
  ));
  const bakedCorrectionCount = Number(
    masterManifest.sources?.find((source) => source.provider === "manual")?.recordCount || 0,
  );
  if (
    removedActiveCorrection
    || (!activeCorrectionRelease && normalized.length < bakedCorrectionCount)
  ) {
    const scientificName = removedActiveCorrection?.scientificName || "eine vorhandene Art";
    throw new Error(
      `Das Zurücksetzen der bereits aktiven Korrektur für ${scientificName} benötigt einen vollständigen Master-Neuaufbau.`,
    );
  }
  const { DatabaseSync } = await loadNodeSqlite();
  const masterDatabase = new DatabaseSync(
    path.join(masterDirectory, "taxonomy-master.sqlite"),
    { readOnly: true },
  );
  const lightroomDatabase = new DatabaseSync(
    path.join(packageDirectory, path.basename(lightroomSearchDatabasePath(searchRoot, "active"))),
    { readOnly: true },
  );
  let entries;
  try {
    entries = resolveCorrectionEntries(masterDatabase, lightroomDatabase, normalized);
  } finally {
    masterDatabase.close();
    lightroomDatabase.close();
  }
  const revision = taxonomyCorrectionsRevision(normalized);
  const releaseId = `corrections-${crypto.createHash("sha256")
    .update(`${baseMasterVersion}|${packageManifest.packageId}|${revision}`)
    .digest("hex").slice(0, 20)}`;
  const release = {
    schemaVersion: TAXONOMY_CORRECTION_RELEASE_SCHEMA_VERSION,
    releaseId,
    revision,
    state: "ready",
    createdAt: now().toISOString(),
    baseMasterVersion,
    basePackageId: cleanText(packageManifest.packageId),
    entries,
  };
  const releasePath = taxonomyCorrectionReleasePath(taxonomyRoot, releaseId);
  const existing = await readJson(releasePath);
  if (existing) {
    if (["schemaVersion", "releaseId", "revision", "baseMasterVersion", "basePackageId", "entries"]
      .some((key) => JSON.stringify(existing[key]) !== JSON.stringify(release[key]))) {
      throw new Error("Ein unveränderliches Korrektur-Release besitzt unerwartet abweichenden Inhalt.");
    }
    return existing;
  }
  await atomicWriteJson(releasePath, release);
  return release;
}

export async function activateTaxonomyCorrectionRelease(options = {}) {
  return withTaxonomyCorrectionLock(options.taxonomyRoot, () => activateTaxonomyCorrectionReleaseUnlocked(options));
}

export async function activateTaxonomyCorrectionReleaseUnlocked({
  taxonomyRoot,
  searchRoot,
  corrections = [],
  now = () => new Date(),
} = {}) {
  const release = await prepareTaxonomyCorrectionRelease({
    taxonomyRoot,
    searchRoot,
    corrections,
    now,
  });
  const [currentMasterManifest, currentPackageManifest] = await Promise.all([
    readJson(taxonomyMasterManifestPath(taxonomyRoot, "active")),
    readLightroomSearchManifest(searchRoot, "active"),
  ]);
  const currentMasterVersion = cleanText(
    currentMasterManifest?.candidateId || currentMasterManifest?.masterVersion,
  );
  if (
    currentMasterVersion !== release.baseMasterVersion
    || cleanText(currentPackageManifest?.masterVersion) !== release.baseMasterVersion
    || cleanText(currentPackageManifest?.packageId) !== release.basePackageId
  ) {
    throw new Error(
      "Master oder Lightroom-Suchpaket wurden während der Korrekturprüfung verändert. Es wurde nichts aktiviert.",
    );
  }
  const previous = await readActiveTaxonomyCorrectionPointer(taxonomyRoot);
  const pointer = {
    schemaVersion: TAXONOMY_CORRECTION_POINTER_SCHEMA_VERSION,
    activeRelease: release.releaseId,
    previousRelease: previous?.activeRelease || null,
    revision: release.revision,
    baseMasterVersion: release.baseMasterVersion,
    basePackageId: release.basePackageId,
    updatedAt: now().toISOString(),
  };
  await atomicWriteJson(taxonomyCorrectionActivePointerPath(taxonomyRoot), pointer);
  return { release, pointer };
}

export const taxonomyCorrectionReleaseInternals = Object.freeze({
  correctionRoot,
  normalizedCorrections,
  resolveCorrectionEntries,
});
