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

export async function readActiveTaxonomyCorrectionPointer(dataRoot) {
  const pointer = await readJson(taxonomyCorrectionActivePointerPath(dataRoot));
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
  const pointer = await readActiveTaxonomyCorrectionPointer(dataRoot);
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
      englishName: cleanText(value.englishName),
      note: cleanText(value.note),
    };
    if (!entry.germanName && !entry.englishName) {
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
    return {
      masterTaxonId: master.master_taxon_id,
      scientificName: master.canonical_scientific_name,
      germanName: correction.germanName,
      englishName: correction.englishName,
      note: correction.note,
    };
  });
}

export async function prepareTaxonomyCorrectionRelease({
  taxonomyRoot,
  searchRoot,
  corrections = [],
  now = () => new Date(),
} = {}) {
  if (!taxonomyRoot || !searchRoot) {
    throw new TypeError("Taxonomie- und Lightroom-Suchpaketpfad sind erforderlich.");
  }
  const masterCorrectionRoot = correctionRoot(taxonomyRoot);
  const packageCorrectionRoot = correctionRoot(searchRoot);
  if (masterCorrectionRoot !== packageCorrectionRoot) {
    throw new Error(
      "Masterdatenbank und Lightroom-Suchpaket verwenden keinen gemeinsamen Korrekturspeicher.",
    );
  }
  const normalized = normalizedCorrections(corrections);
  const [masterManifest, packageManifest] = await Promise.all([
    readJson(taxonomyMasterManifestPath(taxonomyRoot, "active")),
    readLightroomSearchManifest(searchRoot, "active"),
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
    taxonomyMasterDatabasePath(taxonomyRoot, "active"),
    { readOnly: true },
  );
  const lightroomDatabase = new DatabaseSync(
    lightroomSearchDatabasePath(searchRoot, "active"),
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
  await atomicWriteJson(taxonomyCorrectionReleasePath(taxonomyRoot, releaseId), release);
  return release;
}

export async function activateTaxonomyCorrectionRelease({
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
