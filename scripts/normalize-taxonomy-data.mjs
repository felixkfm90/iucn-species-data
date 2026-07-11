import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_PATH = path.join(REPO_ROOT, "speciesData.json");
const BACKUP_DIR = path.join(REPO_ROOT, "species-explorer", "backups");
const TAXONOMY_FIELDS = ["Kingdom", "Phylum", "Class", "Order", "Family"];

function formatTaxonomyName(value) {
  const text = String(value ?? "").trim();
  if (!text || text.toLocaleLowerCase("de") === "n/a") return text || "n/a";
  return text
    .toLocaleLowerCase("de")
    .replace(/(^|[\s-])([\p{L}])/gu, (_match, prefix, letter) => (
      `${prefix}${letter.toLocaleUpperCase("de")}`
    ));
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const sourceText = fs.readFileSync(DATA_PATH, "utf8");
const entries = JSON.parse(sourceText);
if (!Array.isArray(entries)) throw new Error("speciesData.json muss ein Array enthalten");

let changedEntries = 0;
const normalized = entries.map((entry) => {
  let changed = false;
  const next = { ...entry };
  for (const field of TAXONOMY_FIELDS) {
    const value = formatTaxonomyName(entry?.[field]);
    if (value !== entry?.[field]) changed = true;
    next[field] = value;
  }
  if (changed) changedEntries += 1;
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
