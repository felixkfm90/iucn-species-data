import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { TAXONOMY_ARCHIVE_LIMITS } from "./taxonomy-archive.mjs";
import { assertTaxonomyReleaseId } from "./taxonomy-storage.mjs";

const REQUIRED_HEADERS = Object.freeze({
  "NameUsage.tsv": ["ID", "scientificName", "rank", "status"],
});
const OPTIONAL_HEADERS = Object.freeze({
  "VernacularName.tsv": ["taxonID", "name", "language"],
});
export const TAXONOMY_PACKAGE_LIMITS = Object.freeze({
  maxFiles: TAXONOMY_ARCHIVE_LIMITS.maxEntries,
  maxDirectoryDepth: 6,
});

function splitHeader(line) {
  return line.replace(/^\uFEFF/, "").replace(/\r$/, "").split("\t");
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

async function walkFiles(root, relative = "", depth = 0, result = []) {
  if (depth > TAXONOMY_PACKAGE_LIMITS.maxDirectoryDepth) {
    throw new Error("Das entpackte CoL-Paket ist unerwartet tief verschachtelt.");
  }
  const directory = path.join(root, relative);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const nextRelative = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolischer Link im CoL-Paket ist nicht erlaubt: ${nextRelative}`);
    }
    if (entry.isDirectory()) {
      await walkFiles(root, nextRelative, depth + 1, result);
    } else if (entry.isFile()) {
      result.push(path.join(root, nextRelative));
      if (result.length > TAXONOMY_PACKAGE_LIMITS.maxFiles) {
        throw new Error("Das entpackte CoL-Paket enthält zu viele Dateien.");
      }
    }
  }
  return result;
}

function findUniqueFile(files, fileName, required) {
  const matches = files.filter(
    (filePath) => path.basename(filePath).toLowerCase() === fileName.toLowerCase(),
  );
  if (!matches.length) {
    if (!required) return null;
    throw new Error(`Pflichtdatei ${fileName} fehlt im CoL-Paket.`);
  }
  if (matches.length > 1) {
    throw new Error(`Das CoL-Paket enthält ${fileName} mehrfach und ist nicht eindeutig.`);
  }
  return matches[0];
}

async function validateHeaders(filePath, fileName, expectedHeaders) {
  const headers = splitHeader(await readFirstLine(filePath));
  const missing = expectedHeaders.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`${fileName} enthält nicht alle Pflichtspalten: ${missing.join(", ")}`);
  }
  return headers;
}

async function fingerprintFiles(files) {
  const hash = crypto.createHash("sha256");
  for (const filePath of Object.values(files).filter(Boolean).sort()) {
    const stats = await fs.stat(filePath);
    hash.update(`${path.basename(filePath)}:${stats.size}\n`);
  }
  return hash.digest("hex");
}

export async function validateTaxonomyPackage(packageDirectory, {
  release,
  archive,
} = {}) {
  const root = path.resolve(packageDirectory);
  const filesFound = await walkFiles(root);
  const files = {};
  for (const [fileName, headers] of Object.entries(REQUIRED_HEADERS)) {
    const filePath = findUniqueFile(filesFound, fileName, true);
    await validateHeaders(filePath, fileName, headers);
    files[fileName] = filePath;
  }
  for (const [fileName, headers] of Object.entries(OPTIONAL_HEADERS)) {
    const filePath = findUniqueFile(filesFound, fileName, false);
    if (filePath) await validateHeaders(filePath, fileName, headers);
    files[fileName] = filePath;
  }
  files["ExternalIdentifier.tsv"] = findUniqueFile(
    filesFound,
    "ExternalIdentifier.tsv",
    false,
  );
  files["metadata.yaml"] = findUniqueFile(filesFound, "metadata.yaml", true);
  const metadataText = await fs.readFile(files["metadata.yaml"], "utf8");
  if (!/col(?:dp|data package)/i.test(metadataText) && !/version\s*:\s*1\.[12]/i.test(metadataText)) {
    throw new Error("metadata.yaml weist das Archiv nicht als unterstütztes ColDP-Paket aus.");
  }
  let sourceBytes = 0;
  for (const filePath of Object.values(files).filter(Boolean)) {
    sourceBytes += (await fs.stat(filePath)).size;
  }
  const normalizedRelease = {
    ...release,
    releaseId: assertTaxonomyReleaseId(release?.releaseId),
  };
  return {
    root,
    releaseId: normalizedRelease.releaseId,
    release: normalizedRelease,
    files,
    headers: {
      nameUsage: await validateHeaders(
        files["NameUsage.tsv"],
        "NameUsage.tsv",
        REQUIRED_HEADERS["NameUsage.tsv"],
      ),
      vernacularName: files["VernacularName.tsv"]
        ? await validateHeaders(
          files["VernacularName.tsv"],
          "VernacularName.tsv",
          OPTIONAL_HEADERS["VernacularName.tsv"],
        )
        : null,
    },
    sourceBytes,
    packageFingerprint: await fingerprintFiles(files),
    archive: {
      bytes: Number(archive?.bytes) || null,
      sha256: String(archive?.sha256 || "").trim() || null,
      downloadUrl: String(archive?.downloadUrl || "").trim() || null,
    },
  };
}
