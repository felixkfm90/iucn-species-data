import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { extractTaxonomyArchive } from "./taxonomy-archive.mjs";
import { readCsvFile } from "./taxonomy-csv.mjs";
import { writeProviderSlice } from "./taxonomy-master-slices.mjs";
import { canonicalSpeciesName } from "./taxonomy-taxon-quality.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";

export const INATURALIST_TAXONOMY_SOURCE_URL =
  "https://www.inaturalist.org/taxa/inaturalist-taxonomy.dwca.zip";
export const INATURALIST_TAXONOMY_LICENSE =
  "iNaturalist taxonomy export; individual source attribution remains applicable.";

const TAXA_FILE = "taxa.csv";
const VERNACULAR_FILES = Object.freeze([
  ["VernacularNames-german.csv", "de"],
  ["VernacularNames-english.csv", "en"],
]);
const DEFAULT_BATCH_SIZE = 25_000;
const MAX_NAMES_PER_LANGUAGE = 12;

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function reportProgress(onProgress, phase, current, total, message) {
  onProgress?.({ phase, current, total, message });
}

function providerId(value) {
  const text = cleanText(value);
  const numeric = text.match(/(?:^|\/taxa\/)(\d+)(?:$|[/?#])/i)?.[1];
  return numeric || text;
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function findFile(root, expectedName) {
  const wanted = expectedName.toLocaleLowerCase("en");
  const queue = [path.resolve(root)];
  while (queue.length) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(absolute);
      else if (entry.isFile() && entry.name.toLocaleLowerCase("en") === wanted) return absolute;
    }
  }
  return null;
}

async function importRowsInBatches({
  database,
  rows,
  signal,
  batchSize,
  onRow,
  onBatch,
}) {
  let count = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for await (const row of rows) {
      signal?.throwIfAborted();
      onRow(row);
      count += 1;
      if (count % batchSize === 0) {
        database.exec("COMMIT; BEGIN IMMEDIATE");
        onBatch?.(count);
      }
    }
    database.exec("COMMIT");
    return count;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Der ursprüngliche Importfehler bleibt maßgeblich.
    }
    throw error;
  }
}

function createWorkingSchema(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = FILE;

    CREATE TABLE inat_species (
      provider_id TEXT PRIMARY KEY,
      scientific_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      kingdom TEXT NOT NULL,
      phylum TEXT,
      class_name TEXT,
      order_name TEXT,
      family TEXT,
      genus TEXT,
      parent_provider_id TEXT,
      modified_at TEXT
    ) WITHOUT ROWID;

    CREATE INDEX inat_species_identity_idx
      ON inat_species(kingdom, normalized_name);

    CREATE TABLE inat_name (
      provider_id TEXT NOT NULL,
      language TEXT NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      PRIMARY KEY (provider_id, language, normalized_name),
      FOREIGN KEY (provider_id) REFERENCES inat_species(provider_id) ON DELETE CASCADE
    ) WITHOUT ROWID;

    CREATE INDEX inat_name_language_idx
      ON inat_name(language, provider_id);

    CREATE TABLE relevant_species (
      provider_id TEXT PRIMARY KEY,
      scientific_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      kingdom TEXT NOT NULL,
      phylum TEXT,
      class_name TEXT,
      order_name TEXT,
      family TEXT,
      genus TEXT,
      parent_provider_id TEXT,
      modified_at TEXT,
      col_taxon_id INTEGER,
      relevance_reason TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE relevant_name (
      provider_id TEXT NOT NULL,
      language TEXT NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      PRIMARY KEY (provider_id, language, normalized_name),
      FOREIGN KEY (provider_id) REFERENCES relevant_species(provider_id) ON DELETE CASCADE
    ) WITHOUT ROWID;
  `);
}

async function importSpecies(database, taxaPath, {
  signal,
  batchSize,
  onProgress,
}) {
  const insert = database.prepare(`
    INSERT OR REPLACE INTO inat_species (
      provider_id, scientific_name, normalized_name, kingdom, phylum,
      class_name, order_name, family, genus, parent_provider_id, modified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let accepted = 0;
  const sourceRows = await importRowsInBatches({
    database,
    rows: readCsvFile(taxaPath),
    signal,
    batchSize,
    onRow(row) {
      const rank = cleanText(row.taxonRank).toLocaleLowerCase("en");
      const scientificName = canonicalSpeciesName(row.scientificName);
      const id = providerId(row.id || row.taxonID || row.identifier);
      const kingdom = cleanText(row.kingdom);
      if (rank !== "species" || !scientificName || !id || !kingdom) return;
      insert.run(
        id,
        scientificName,
        normalizeTaxonomySearchTerm(scientificName),
        kingdom,
        cleanText(row.phylum) || null,
        cleanText(row.class) || null,
        cleanText(row.order) || null,
        cleanText(row.family) || null,
        cleanText(row.genus) || scientificName.split(" ")[0],
        providerId(row.parentNameUsageID) || null,
        cleanText(row.modified) || null,
      );
      accepted += 1;
    },
    onBatch(current) {
      reportProgress(
        onProgress,
        "inaturalist-taxa",
        current,
        null,
        `${current.toLocaleString("de-DE")} iNaturalist-Taxonomiezeilen geprüft`,
      );
    },
  });
  return { sourceRows, acceptedSpecies: accepted };
}

function materializeRelevantRecords(database, colDatabasePath) {
  database.prepare("ATTACH DATABASE ? AS col").run(path.resolve(colDatabasePath));
  try {
    database.exec(`
      INSERT INTO relevant_species
      SELECT species.*, NULL, 'col-reference-gap'
      FROM inat_species species
      WHERE NOT EXISTS (
        SELECT 1
        FROM col.search_term term
        WHERE term.kingdom = species.kingdom
          AND term.term_type IN ('accepted_scientific', 'scientific_synonym')
          AND term.normalized = species.normalized_name
        LIMIT 1
      );

      INSERT INTO relevant_name
      SELECT name.*
      FROM inat_name name
      JOIN relevant_species species
        ON species.provider_id = name.provider_id
       AND species.relevance_reason = 'col-reference-gap';

      INSERT OR IGNORE INTO relevant_species
      SELECT species.*, accepted.taxon_id, 'missing-name'
      FROM inat_species species
      JOIN col.search_term accepted
        ON accepted.kingdom = species.kingdom
       AND accepted.term_type = 'accepted_scientific'
       AND accepted.normalized = species.normalized_name
      WHERE EXISTS (
        SELECT 1
        FROM inat_name candidate_name
        WHERE candidate_name.provider_id = species.provider_id
          AND NOT EXISTS (
            SELECT 1
            FROM col.search_term existing_name
            WHERE existing_name.taxon_id = accepted.taxon_id
              AND LOWER(COALESCE(existing_name.language, '')) = candidate_name.language
          )
      );

      INSERT OR IGNORE INTO relevant_name
      SELECT name.*
      FROM inat_name name
      JOIN relevant_species species
        ON species.provider_id = name.provider_id
       AND species.relevance_reason = 'missing-name'
      WHERE NOT EXISTS (
        SELECT 1
        FROM col.search_term existing_name
        WHERE existing_name.taxon_id = species.col_taxon_id
          AND LOWER(COALESCE(existing_name.language, '')) = name.language
      );
    `);
  } finally {
    database.exec("DETACH DATABASE col");
  }
  return {
    colGapSpecies: Number(database.prepare(`
      SELECT COUNT(*) AS count
      FROM relevant_species
      WHERE relevance_reason = 'col-reference-gap'
    `).get().count),
    nameSupplementSpecies: Number(database.prepare(`
      SELECT COUNT(*) AS count
      FROM relevant_species
      WHERE relevance_reason = 'missing-name'
    `).get().count),
    retainedNames: Number(database.prepare("SELECT COUNT(*) AS count FROM relevant_name").get().count),
  };
}

async function importVernacularNames(database, filePath, language, {
  signal,
  batchSize,
  onProgress,
}) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO inat_name (
      provider_id, language, name, normalized_name
    )
    SELECT ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM inat_species WHERE provider_id = ?
    )
  `);
  let retained = 0;
  const sourceRows = await importRowsInBatches({
    database,
    rows: readCsvFile(filePath),
    signal,
    batchSize,
    onRow(row) {
      const id = providerId(row.id);
      const name = cleanText(row.vernacularName);
      if (!id || !name) return;
      const result = insert.run(id, language, name, normalizeTaxonomySearchTerm(name), id);
      retained += Number(result.changes || 0);
    },
    onBatch(current) {
      reportProgress(
        onProgress,
        `inaturalist-names-${language}`,
        current,
        null,
        `${current.toLocaleString("de-DE")} ${language === "de" ? "deutsche" : "englische"} Namen geprüft`,
      );
    },
  });
  return { sourceRows, retainedNames: retained };
}

function providerRecords(database, retrievedAt) {
  const namesByProvider = new Map();
  for (const row of database.prepare(`
    SELECT provider_id, language, name
    FROM relevant_name
    ORDER BY provider_id, language, name COLLATE NOCASE
  `).iterate()) {
    const key = `${row.provider_id}|${row.language}`;
    const names = namesByProvider.get(key) || [];
    if (names.length < MAX_NAMES_PER_LANGUAGE) names.push(row.name);
    namesByProvider.set(key, names);
  }
  const records = [];
  for (const row of database.prepare(`
    SELECT * FROM relevant_species
    ORDER BY scientific_name COLLATE NOCASE, provider_id
  `).iterate()) {
    const names = [];
    for (const language of ["de", "en"]) {
      const languageNames = namesByProvider.get(`${row.provider_id}|${language}`) || [];
      languageNames.forEach((name, index) => names.push({
        name,
        language,
        nameKind: "vernacular",
        preferred: index === 0,
        verified: true,
      }));
    }
    records.push({
      provider: "inaturalist",
      providerRecordId: row.provider_id,
      colTaxonId: row.col_taxon_id ? String(row.col_taxon_id) : "",
      scientificName: row.scientific_name,
      rank: "species",
      kingdom: row.kingdom,
      taxonomicStatus: "accepted",
      parentProviderRecordId: row.parent_provider_id || "",
      hierarchy: {
        kingdom: row.kingdom,
        ...(row.phylum ? { phylum: row.phylum } : {}),
        ...(row.class_name ? { class: row.class_name } : {}),
        ...(row.order_name ? { order: row.order_name } : {}),
        ...(row.family ? { family: row.family } : {}),
        ...(row.genus ? { genus: row.genus } : {}),
        species: row.scientific_name,
      },
      names,
      externalIds: { inaturalist: row.provider_id },
      retrievedAt,
      relevanceReasons: [row.relevance_reason],
      queryKeys: [
        row.scientific_name,
        ...names.map((entry) => entry.name),
      ],
      selectedForMaster: true,
    });
  }
  return records;
}

export async function importInaturalistTaxonomySnapshot({
  taxonomyRoot,
  colDatabasePath,
  archivePath = null,
  packageDirectory = null,
  providerVersion = null,
  retrievedAt = new Date().toISOString(),
  workRoot = null,
  signal,
  onProgress,
  batchSize = DEFAULT_BATCH_SIZE,
  extractor = extractTaxonomyArchive,
} = {}) {
  if (!taxonomyRoot || !colDatabasePath || (!archivePath && !packageDirectory)) {
    throw new TypeError(
      "Taxonomieziel, aktive CoL-Datenbank und iNaturalist-Archiv beziehungsweise Paketordner sind erforderlich.",
    );
  }
  signal?.throwIfAborted();
  const root = path.resolve(workRoot || path.join(taxonomyRoot, "master", "work"));
  const workingDirectory = path.join(root, `inaturalist-${crypto.randomUUID()}`);
  const extractedDirectory = packageDirectory
    ? path.resolve(packageDirectory)
    : path.join(workingDirectory, "package");
  const databasePath = path.join(workingDirectory, "inaturalist-import.sqlite");
  let database = null;
  try {
    await fs.mkdir(workingDirectory, { recursive: true });
    if (!packageDirectory) {
      reportProgress(onProgress, "extract", 0, 1, "iNaturalist-Namensbestand wird entpackt");
      await extractor({
        archivePath: path.resolve(archivePath),
        destinationPath: extractedDirectory,
        onProgress,
      });
    }
    const taxaPath = await findFile(extractedDirectory, TAXA_FILE);
    if (!taxaPath) throw new Error(`${TAXA_FILE} fehlt im iNaturalist-Taxonomiepaket.`);
    const vernacularPaths = [];
    for (const [fileName, language] of VERNACULAR_FILES) {
      const filePath = await findFile(extractedDirectory, fileName);
      if (filePath) vernacularPaths.push({ filePath, fileName, language });
    }
    const archiveChecksum = archivePath ? await sha256File(archivePath) : null;
    const normalizedVersion = cleanText(providerVersion)
      || `inat-dwca-${(archiveChecksum || crypto.createHash("sha256").update(retrievedAt).digest("hex")).slice(0, 16)}`;
    const { DatabaseSync } = await loadNodeSqlite();
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    createWorkingSchema(database);
    const species = await importSpecies(database, taxaPath, {
      signal,
      batchSize,
      onProgress,
    });
    signal?.throwIfAborted();
    const vernacular = [];
    for (const entry of vernacularPaths) {
      vernacular.push({
        language: entry.language,
        ...(await importVernacularNames(database, entry.filePath, entry.language, {
          signal,
          batchSize,
          onProgress,
        })),
      });
    }
    signal?.throwIfAborted();
    reportProgress(
      onProgress,
      "col-gaps",
      0,
      1,
      "CoL-Referenzlücken und fehlende Namen werden ermittelt",
    );
    const relevant = materializeRelevantRecords(database, colDatabasePath);
    signal?.throwIfAborted();
    reportProgress(onProgress, "provider-slice", 0, 1, "Versionierter iNaturalist-Ausschnitt wird geschrieben");
    const records = providerRecords(database, retrievedAt);
    const slice = await writeProviderSlice(taxonomyRoot, {
      provider: "inaturalist",
      providerVersion: normalizedVersion,
      records,
      retrievedAt,
      sourceUrl: INATURALIST_TAXONOMY_SOURCE_URL,
      license: INATURALIST_TAXONOMY_LICENSE,
      metadata: {
        dataScope: "inaturalist-species-closing-col-taxon-and-name-gaps",
        archiveSha256: archiveChecksum,
        taxaSourceRows: species.sourceRows,
        acceptedSpecies: species.acceptedSpecies,
        colGapSpecies: relevant.colGapSpecies,
        nameSupplementSpecies: relevant.nameSupplementSpecies,
        retainedNames: relevant.retainedNames,
        vernacular,
      },
    });
    reportProgress(onProgress, "complete", 1, 1, "iNaturalist-CoL-Lückenbestand ist lokal versioniert");
    return {
      provider: "inaturalist",
      providerVersion: normalizedVersion,
      acceptedSpecies: species.acceptedSpecies,
      colGapSpecies: relevant.colGapSpecies,
      nameSupplementSpecies: relevant.nameSupplementSpecies,
      retainedNames: relevant.retainedNames,
      recordCount: slice.manifest.recordCount,
      vernacular,
      manifest: slice.manifest,
    };
  } finally {
    database?.close();
    await fs.rm(workingDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

export const inaturalistSnapshotInternals = Object.freeze({
  findFile,
  materializeRelevantRecords,
  providerId,
  providerRecords,
  sha256File,
});
