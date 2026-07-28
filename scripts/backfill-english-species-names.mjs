import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultTaxonomyRoot } from "../species-explorer/taxonomy-storage.mjs";
import { openTaxonomyStore } from "../species-explorer/taxonomy-store.mjs";
import { normalizeTaxonomySearchTerm } from "../species-explorer/taxonomy-search-text.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function scientificNameFromInput(entry) {
  return `${String(entry?.genus ?? "").trim()} ${String(entry?.species ?? "").trim()}`.trim();
}

function scientificKey(value) {
  return normalizeTaxonomySearchTerm(value);
}

function exactTaxonomyResult(store, scientificName) {
  const key = scientificKey(scientificName);
  const response = store.search({
    query: scientificName,
    kind: "scientific",
    kingdom: "all",
    language: "all",
    rank: "species",
    limit: 12,
  });
  const exact = response.results.filter(
    (entry) => scientificKey(entry.acceptedScientificName) === key,
  );
  const unique = [...new Map(exact.map((entry) => [entry.taxonId, entry])).values()];
  return unique.length === 1 ? unique[0] : null;
}

async function fetchPreferredEnglishName(scientificName, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return null;
  const url = new URL("https://api.inaturalist.org/v1/taxa");
  url.searchParams.set("q", scientificName);
  url.searchParams.set("rank", "species");
  url.searchParams.set("locale", "en");
  url.searchParams.set("per_page", "20");
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "FN-Wildlife-Travel-Arten-Explorer/1.0",
        },
      });
      if (response.ok || response.status < 500) break;
      lastError = new Error(`iNaturalist antwortete mit HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  if (!response?.ok) {
    throw lastError ?? new Error(`iNaturalist antwortete mit HTTP ${response?.status ?? "?"}.`);
  }
  const payload = await response.json();
  const key = scientificKey(scientificName);
  const exact = (payload.results || [])
    .filter((entry) => scientificKey(entry?.name) === key)
    .sort((left, right) => (
      Number(Boolean(right?.is_active)) - Number(Boolean(left?.is_active))
    ));
  const englishName = String(exact[0]?.preferred_common_name ?? "").trim();
  return englishName || null;
}

async function writeAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function writeBackup({ backupDir, speciesListText, speciesDataText }) {
  await fs.mkdir(backupDir, { recursive: true });
  const backupName = `english-name-backfill-${compactTimestamp()}.json`;
  await fs.writeFile(
    path.join(backupDir, backupName),
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      files: {
        "species_list.json": JSON.parse(speciesListText),
        "speciesData.json": JSON.parse(speciesDataText),
      },
    }, null, 2)}\n`,
    "utf8",
  );
  return `species-explorer/backups/${backupName}`;
}

export async function backfillEnglishSpeciesNames({
  repoRoot = REPO_ROOT,
  taxonomyRoot = defaultTaxonomyRoot(),
  write = false,
  online = true,
  fetchImpl = globalThis.fetch,
} = {}) {
  const speciesListPath = path.join(repoRoot, "species_list.json");
  const speciesDataPath = path.join(repoRoot, "speciesData.json");
  const backupDir = path.join(repoRoot, "species-explorer", "backups");
  const [speciesListText, speciesDataText] = await Promise.all([
    fs.readFile(speciesListPath, "utf8"),
    fs.readFile(speciesDataPath, "utf8"),
  ]);
  const speciesList = JSON.parse(speciesListText);
  const speciesData = JSON.parse(speciesDataText);
  if (!Array.isArray(speciesList) || !Array.isArray(speciesData)) {
    throw new Error("Artenliste und generierte Artendaten müssen Arrays enthalten.");
  }

  const generatedByScientificName = new Map(
    speciesData.map((entry, index) => [
      scientificKey(entry?.["Wissenschaftlicher Name"]),
      { entry, index },
    ]),
  );
  const store = await openTaxonomyStore({ taxonomyRoot });
  if (store.available === false || typeof store.search !== "function") {
    throw new Error("Es ist keine aktive lokale Taxonomiereferenz verfügbar.");
  }

  const updated = [];
  const unresolved = [];
  try {
    for (const input of speciesList) {
      const scientificName = scientificNameFromInput(input);
      const generated = generatedByScientificName.get(scientificKey(scientificName));
      const existingEnglishName = String(
        input?.english || generated?.entry?.["Englischer Name"] || "",
      ).trim();
      if (existingEnglishName) {
        input.english = existingEnglishName;
        if (generated) generated.entry["Englischer Name"] = existingEnglishName;
        continue;
      }

      const reference = exactTaxonomyResult(store, scientificName);
      let englishName = "";
      let source = "";
      let onlineError = "";
      if (online) {
        try {
          englishName = String(
            await fetchPreferredEnglishName(scientificName, fetchImpl) || "",
          ).trim();
          if (englishName) source = "iNaturalist";
        } catch (error) {
          onlineError = error.message;
        }
      }
      if (!englishName) {
        englishName = String(reference?.englishName || "").trim();
        if (englishName) source = "Catalogue of Life";
      }
      if (!englishName) {
        unresolved.push({
          germanName: input.german,
          scientificName,
          reason: onlineError
            ? `kein englischer Name gefunden; Online-Abfrage: ${onlineError}`
            : reference
              ? "kein englischer Name in der Referenz"
              : "Taxon nicht eindeutig gefunden",
        });
        continue;
      }
      input.english = englishName;
      if (generated) generated.entry["Englischer Name"] = englishName;
      updated.push({
        germanName: input.german,
        scientificName,
        englishName,
        source,
      });
    }
  } finally {
    store.close();
  }

  let backup = "";
  if (write && updated.length) {
    backup = await writeBackup({ backupDir, speciesListText, speciesDataText });
    await Promise.all([
      writeAtomic(speciesListPath, speciesList),
      writeAtomic(speciesDataPath, speciesData),
    ]);
  }
  return {
    write,
    total: speciesList.length,
    updated,
    unresolved,
    backup,
  };
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const write = process.argv.includes("--write");
  const online = !process.argv.includes("--offline");
  const result = await backfillEnglishSpeciesNames({ write, online });
  console.log(
    `${write ? "Rückfüllung" : "Vorschau"}: `
    + `${result.updated.length} englische Namen, ${result.unresolved.length} offene Arten.`,
  );
  for (const entry of result.updated) {
    console.log(`✔ ${entry.germanName}: ${entry.englishName} (${entry.source})`);
  }
  for (const entry of result.unresolved) {
    console.log(`⚠ ${entry.germanName} (${entry.scientificName}): ${entry.reason}`);
  }
  if (result.backup) console.log(`Sicherung: ${result.backup}`);
  if (!write && result.updated.length) {
    console.log("Mit --write werden die geprüften Namen nach lokaler Sicherung übernommen.");
  }
}
