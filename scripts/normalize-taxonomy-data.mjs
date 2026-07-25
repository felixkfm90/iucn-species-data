import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeNormalizedTaxonomyFields } from "./taxonomy-overrides.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_PATH = path.join(REPO_ROOT, "speciesData.json");
const BACKUP_DIR = path.join(REPO_ROOT, "species-explorer", "backups");

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const sourceText = fs.readFileSync(DATA_PATH, "utf8");
const entries = JSON.parse(sourceText);
if (!Array.isArray(entries)) throw new Error("speciesData.json muss ein Array enthalten");

let changedEntries = 0;
const normalized = entries.map((entry) => {
  const next = mergeNormalizedTaxonomyFields(entry);
  if (JSON.stringify(next) !== JSON.stringify(entry)) changedEntries += 1;
  return next;
});

if (!changedEntries) {
  console.log("Taxonomie-Schreibweise ist bereits einheitlich.");
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupName = `speciesData-taxonomy-${compactTimestamp()}.json`;
const backupPath = path.join(BACKUP_DIR, backupName);
fs.writeFileSync(backupPath, sourceText, "utf8");

const tempPath = `${DATA_PATH}.tmp-${process.pid}`;
try {
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, DATA_PATH);
} catch (error) {
  fs.rmSync(tempPath, { force: true });
  throw error;
}

console.log(`${changedEntries} Taxonomie-Datensätze normalisiert.`);
console.log(`Sicherung: species-explorer/backups/${backupName}`);
