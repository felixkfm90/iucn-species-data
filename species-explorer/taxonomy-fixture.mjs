import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { assertTaxonomyReleaseId } from "./taxonomy-storage.mjs";

const REQUIRED_FILES = Object.freeze({
  "NameUsage.tsv": [
    "ID", "sourceID", "parentID", "scientificName", "authorship", "rank", "status",
    "code", "extinct", "environment", "kingdom", "alternativeID", "colTrustTier",
  ],
  "VernacularName.tsv": [
    "taxonID", "sourceID", "name", "transliteration", "language", "preferred",
    "country", "area", "referenceID", "remarks",
  ],
  "ExternalIdentifier.tsv": [
    "taxonID", "type", "identifier", "source", "release",
  ],
  "WormsComparison.tsv": [
    "taxonID", "aphiaID", "scientificName", "acceptedName", "authority", "rank",
    "status", "kingdom", "phylum", "class", "order", "family", "genus", "marine",
    "brackish", "freshwater", "terrestrial", "modified", "url", "conflict", "fetchedAt",
  ],
  "metadata.yaml": null,
});

function assertNotAborted(signal) {
  signal?.throwIfAborted();
}

function splitTsvLine(line) {
  return line.replace(/\r$/, "").split("\t");
}

async function sha256File(filePath, signal) {
  const hash = crypto.createHash("sha256");
  const stream = createReadStream(filePath);
  try {
    for await (const chunk of stream) {
      assertNotAborted(signal);
      hash.update(chunk);
    }
    return hash.digest("hex");
  } finally {
    stream.destroy();
  }
}

async function readFirstLine(filePath) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) return line;
    return "";
  } finally {
    lines.close();
    stream.destroy();
  }
}

export async function* iterateTaxonomyTsv(filePath, { signal } = {}) {
  assertNotAborted(signal);
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      assertNotAborted(signal);
      if (!headers) {
        headers = splitTsvLine(line);
        continue;
      }
      if (!line) continue;
      const values = splitTsvLine(line);
      if (values.length > headers.length) {
        throw new Error(
          `${path.basename(filePath)} Zeile ${lineNumber} enthält mehr Spalten als der Kopf.`,
        );
      }
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      yield row;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

export async function validateTaxonomyFixture(fixtureDirectory, { signal } = {}) {
  const root = path.resolve(fixtureDirectory);
  assertNotAborted(signal);
  let manifest;
  try {
    manifest = JSON.parse(
      await fs.readFile(path.join(root, "prototype-manifest.json"), "utf8"),
    );
  } catch (error) {
    throw new Error(`Taxonomie-Fixture-Manifest ist nicht lesbar: ${error.message}`, {
      cause: error,
    });
  }
  if (manifest.schemaVersion !== 1 || manifest.boundedPrototype !== true) {
    throw new Error("Das Fixture ist kein unterstützter begrenzter Phase-9.3-Prototyp.");
  }
  const releaseId = assertTaxonomyReleaseId(manifest.release?.releaseId);
  const files = {};
  let sourceBytes = 0;
  for (const [fileName, expectedHeaders] of Object.entries(REQUIRED_FILES)) {
    assertNotAborted(signal);
    const filePath = path.join(root, fileName);
    const expected = manifest.files?.[fileName];
    if (!expected?.sha256 || !Number.isFinite(Number(expected.bytes))) {
      throw new Error(`Prüfsumme für ${fileName} fehlt im Fixture-Manifest.`);
    }
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch (error) {
      throw new Error(`Pflichtdatei ${fileName} fehlt im Taxonomie-Fixture.`, {
        cause: error,
      });
    }
    if (!stats.isFile() || stats.size !== Number(expected.bytes)) {
      throw new Error(`Dateigröße von ${fileName} stimmt nicht mit dem Manifest überein.`);
    }
    const actualChecksum = await sha256File(filePath, signal);
    if (actualChecksum !== expected.sha256) {
      throw new Error(`SHA-256-Prüfsumme von ${fileName} stimmt nicht überein.`);
    }
    if (expectedHeaders) {
      const actualHeaders = splitTsvLine(await readFirstLine(filePath));
      const missingHeaders = expectedHeaders.filter((header) => !actualHeaders.includes(header));
      if (missingHeaders.length) {
        throw new Error(
          `${fileName} enthält nicht alle Pflichtspalten: ${missingHeaders.join(", ")}`,
        );
      }
    }
    files[fileName] = filePath;
    sourceBytes += stats.size;
  }
  const expectedCounts = manifest.counts ?? {};
  for (const key of [
    "nameUsages", "vernacularNames", "externalIdentifiers", "wormsComparisons",
  ]) {
    if (!Number.isInteger(expectedCounts[key]) || expectedCounts[key] < 0) {
      throw new Error(`Ungültiger Fixture-Zähler: ${key}`);
    }
  }
  return {
    root,
    releaseId,
    manifest,
    files,
    sourceBytes,
  };
}
