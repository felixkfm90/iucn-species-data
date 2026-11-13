import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

// Same public snapshot used by Android. These are intentionally source-bound
// bytes, not today's local unapproved editorial drafts or an arbitrary path.
export const BUNDLED_SPECIES_SOURCE = Object.freeze({
  relativePath: "mobile/assets/catalog.json", bytes: 733442, speciesCount: 63,
  sha256: "dec3aff4835a75ce7c11585e5b838381f82eb29bc83be041646557fe32a016f3",
  generatedAt: "2026-10-31T08:16:40.720Z",
});

export async function readBundledSpeciesCatalog(repoRoot) {
  if (!path.isAbsolute(repoRoot || "")) throw new Error("Ein gebundener Projektordner ist erforderlich.");
  const filename = path.join(repoRoot, ...BUNDLED_SPECIES_SOURCE.relativePath.split("/"));
  let current = path.parse(filename).root;
  for (const part of filename.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || current !== filename && !stat.isDirectory()) throw new Error("Die gebundene Katalogquelle darf keine Verknüpfung verwenden.");
    if (current === filename && (!stat.isFile() || stat.size !== BUNDLED_SPECIES_SOURCE.bytes)) throw new Error("Die gebundene Katalogquelle stimmt nicht überein.");
  }
  const bytes = await fs.readFile(filename);
  if (bytes.length !== BUNDLED_SPECIES_SOURCE.bytes || createHash("sha256").update(bytes).digest("hex") !== BUNDLED_SPECIES_SOURCE.sha256) {
    throw new Error("Die Katalogbytes stimmen nicht mit dem geprüften öffentlichen Anfangsbestand überein.");
  }
  return bytes;
}
