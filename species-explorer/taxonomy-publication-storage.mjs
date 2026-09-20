import fs from "node:fs";
import path from "node:path";

const samePath = (left, right) => process.platform === "win32"
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);

export function taxonomyPublicationPath(dataRoot) {
  return path.join(path.dirname(path.resolve(dataRoot)), "taxonomy-publication", "active.json");
}

export function readTaxonomyPublication(dataRoot) {
  let value;
  try { value = JSON.parse(fs.readFileSync(taxonomyPublicationPath(dataRoot), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (value.schemaVersion !== 1 || !value.active
    || typeof value.taxonomyRoot !== "string" || !path.isAbsolute(value.taxonomyRoot)
    || typeof value.searchRoot !== "string" || !path.isAbsolute(value.searchRoot)) {
    throw new Error("Der gemeinsame Master-/Suchpaketzeiger ist ungültig.");
  }
  for (const entry of [value.active, value.previous].filter(Boolean)) {
    if (!/^publication-[a-f0-9-]{36}$/.test(entry.id) || !entry.masterVersion || !entry.packageId) {
      throw new Error("Ungültige Kennung im gemeinsamen Master-/Suchpaketzeiger.");
    }
  }
  const root = path.resolve(dataRoot);
  if (![value.taxonomyRoot, value.searchRoot].some((entry) => samePath(entry, root))) return null;
  if (!samePath(path.dirname(value.taxonomyRoot), path.dirname(value.searchRoot))) {
    throw new Error("Master und Suchpaket besitzen keinen gemeinsamen Veröffentlichungsbereich.");
  }
  return value;
}

export function publishedTaxonomyDirectory(dataRoot, kind, slot) {
  if (!["active", "previous"].includes(slot)) return null;
  const pointer = readTaxonomyPublication(dataRoot);
  if (!pointer) return null;
  const root = path.resolve(dataRoot);
  if (!samePath(pointer[kind === "master" ? "taxonomyRoot" : "searchRoot"], root)) {
    throw new Error("Veröffentlichungszeiger gehört zu einem anderen Verbraucher.");
  }
  const entry = pointer[slot];
  const base = kind === "master" ? path.join(root, "master") : root;
  // A missing previous pair must not expose a leftover, unrelated legacy slot.
  if (!entry) return path.join(base, "releases", "no-previous-pair");
  return entry.legacy ? path.join(base, "active") : path.join(base, "releases", entry.id);
}

export function assertSeparatePublicationAllowed(dataRoot) {
  if (readTaxonomyPublication(dataRoot)) {
    throw new Error("Master und Lightroom-Suchpaket werden gemeinsam verwaltet. Bitte Datenbank aktualisieren beziehungsweise die gemeinsame Wiederherstellung verwenden.");
  }
}
