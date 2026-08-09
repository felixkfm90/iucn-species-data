import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { writeProviderSlice } from "./taxonomy-master-slices.mjs";
import { canonicalSpeciesName, isMasterSpeciesCandidate } from "./taxonomy-taxon-quality.mjs";

const SCHEMA_VERSION = 1;

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function sourceUrl(value) {
  const result = new URL(cleanText(value));
  if (
    result.protocol !== "https:"
    || !(result.hostname === "animalia.bio" || result.hostname.endsWith(".animalia.bio"))
  ) {
    throw new Error("Animalia-Einträge benötigen eine belegte HTTPS-Quelle auf animalia.bio.");
  }
  return result.toString();
}

function animaliaIdentifier(entry, url) {
  const explicit = cleanText(entry.providerRecordId || entry.animaliaId);
  if (explicit) return explicit;
  const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  if (!pathname) throw new Error("Dem Animalia-Eintrag fehlt eine stabile Kennung.");
  return pathname;
}

function normalizeEntry(entry, retrievedAt) {
  const scientificName = canonicalSpeciesName(entry.scientificName);
  const url = sourceUrl(entry.sourceUrl);
  const providerRecordId = animaliaIdentifier(entry, url);
  const germanNames = unique(entry.germanNames || (entry.germanName ? [entry.germanName] : []));
  const englishNames = unique(entry.englishNames || (entry.englishName ? [entry.englishName] : []));
  const reasonValues = Array.isArray(entry.relevanceReasons)
    ? entry.relevanceReasons
    : [entry.relevanceReason || "missing-name"];
  const reasons = unique(reasonValues);
  const record = {
    provider: "animalia",
    providerRecordId,
    scientificName,
    rank: "species",
    kingdom: "Animalia",
    taxonomicStatus: "accepted",
    hierarchy: {},
    names: [
      ...germanNames.map((name, index) => ({
        name,
        language: "de",
        nameKind: "vernacular",
        preferred: index === 0,
        verified: true,
      })),
      ...englishNames.map((name, index) => ({
        name,
        language: "en",
        nameKind: "vernacular",
        preferred: index === 0,
        verified: true,
      })),
    ],
    externalIds: { animalia: providerRecordId },
    environment: "unknown",
    retrievedAt,
    relevanceReasons: reasons,
    queryKeys: unique([scientificName, ...germanNames, ...englishNames]),
    selectedForMaster: true,
    sourceUrl: url,
  };
  if (!isMasterSpeciesCandidate(record)) {
    throw new Error(`Animalia-Eintrag ist keine eindeutige Art: ${entry.scientificName || "ohne Namen"}`);
  }
  if (!record.names.length) {
    throw new Error(`Animalia-Eintrag ${scientificName} ergänzt weder einen deutschen noch englischen Namen.`);
  }
  return record;
}

function versionFor(document, sourceText) {
  const date = new Date(document.updatedAt).toISOString().slice(0, 10).replaceAll("-", "");
  const checksum = crypto.createHash("sha256").update(sourceText).digest("hex").slice(0, 16);
  return `animalia-${date}-${checksum}`;
}

export async function importAnimaliaFallbacks({
  taxonomyRoot,
  fallbackPath,
  onProgress = () => {},
} = {}) {
  if (!taxonomyRoot || !fallbackPath) {
    throw new TypeError("Taxonomiepfad und Animalia-Fallbackdatei sind erforderlich.");
  }
  const absolutePath = path.resolve(fallbackPath);
  let sourceText;
  try {
    sourceText = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        skipped: true,
        warning: "Keine kontrollierte Animalia-Fallbackdatei vorhanden.",
        recordCount: 0,
      };
    }
    throw error;
  }
  const document = JSON.parse(sourceText);
  if (document?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(document.entries)) {
    throw new Error("Die Animalia-Fallbackdatei besitzt ein nicht unterstütztes Format.");
  }
  if (!Number.isFinite(Date.parse(document.updatedAt || ""))) {
    throw new Error("Der Animalia-Fallbackdatei fehlt ein gültiger Aktualisierungszeitpunkt.");
  }
  const retrievedAt = new Date(document.updatedAt).toISOString();
  const records = document.entries.map((entry) => normalizeEntry(entry, retrievedAt));
  onProgress({
    phase: "animalia",
    current: 0,
    total: Math.max(1, records.length),
    message: "Kontrollierte Animalia-Ergänzungen werden übernommen",
  });
  const providerVersion = versionFor(document, sourceText);
  const slice = await writeProviderSlice(taxonomyRoot, {
    provider: "animalia",
    providerVersion,
    records,
    retrievedAt,
    issuedAt: retrievedAt,
    sourceUrl: "https://animalia.bio/",
    metadata: {
      sourceFile: path.basename(absolutePath),
      controlledFallback: true,
      recordsAreNameAndIdOnly: true,
    },
    preserveUnmentioned: false,
  });
  onProgress({
    phase: "animalia",
    current: Math.max(1, records.length),
    total: Math.max(1, records.length),
    message: "Animalia-Ergänzungen sind lokal versioniert",
  });
  return {
    skipped: false,
    providerVersion,
    recordCount: records.length,
    activeRecordCount: slice.manifest.activeRecordCount,
    warning: "",
  };
}

export const animaliaFallbackInternals = Object.freeze({
  normalizeEntry,
  sourceUrl,
  versionFor,
});
