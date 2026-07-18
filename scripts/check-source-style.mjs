import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([
  ".bat", ".cmd", ".css", ".html", ".js", ".json", ".md", ".mjs",
  ".ps1", ".svg", ".vbs", ".yaml", ".yml",
]);
const TAB_FREE_EXTENSIONS = new Set([".js", ".json", ".mjs"]);
const GENERATED_ROOT_FILES = new Set([
  "fehlende_elemente_report.json",
  "lastSavedAssessmentId.json",
  "species-assets-overrides.json",
  "speciesData.json",
]);

export function checkTextStyle(relativePath, text) {
  const issues = [];
  const extension = path.extname(relativePath).toLowerCase();
  if (text.charCodeAt(0) === 0xfeff) issues.push("UTF-8-BOM ist nicht erlaubt");
  if (text.includes("\0")) issues.push("NUL-Zeichen ist nicht erlaubt");
  if (text && !text.endsWith("\n")) issues.push("abschließender Zeilenumbruch fehlt");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((line, index) => {
    const markdownLineBreak = extension === ".md" && /\S  $/.test(line);
    if (/[ \t]+$/.test(line) && !markdownLineBreak) issues.push(`Zeile ${index + 1}: Leerraum am Zeilenende`);
    if (TAB_FREE_EXTENSIONS.has(extension) && line.includes("\t")) {
      issues.push(`Zeile ${index + 1}: Tabulator in ${extension}-Datei`);
    }
  });
  return issues;
}

const SOURCE_DIRECTORIES = Object.freeze([".github", "docs", "scripts", "species-explorer"]);
const SKIPPED_DIRECTORIES = new Set([
  "asset-backups",
  "backups",
  "cleanup-trash",
  "logs",
  "node_modules",
  "pipeline-asset-backups",
  "staging",
]);

function collectTextFiles(repoRoot, relativeDirectory, output) {
  const absoluteDirectory = path.join(repoRoot, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return;
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        collectTextFiles(repoRoot, path.join(relativeDirectory, entry.name), output);
      }
      continue;
    }
    const relativePath = path.join(relativeDirectory, entry.name);
    if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) output.push(relativePath);
  }
}

export function repositoryTextFiles(repoRoot) {
  const output = [];
  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (
      entry.isFile()
      && !GENERATED_ROOT_FILES.has(entry.name)
      && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) output.push(entry.name);
  }
  for (const directory of SOURCE_DIRECTORIES) collectTextFiles(repoRoot, directory, output);
  return output.sort((left, right) => left.localeCompare(right, "de"));
}

export function checkRepositoryStyle(repoRoot = process.cwd()) {
  const issues = [];
  for (const relativePath of repositoryTextFiles(repoRoot)) {
    const absolutePath = path.join(repoRoot, relativePath);
    const text = fs.readFileSync(absolutePath, "utf8");
    for (const issue of checkTextStyle(relativePath, text)) {
      issues.push(`${relativePath}: ${issue}`);
    }
  }
  return issues;
}

function runCli() {
  const issues = checkRepositoryStyle();
  if (issues.length) {
    console.error(`Stilprüfung fehlgeschlagen: ${issues.length} Problem(e).`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log("Stilprüfung bestanden: Projektquellen sind frei von BOM, NUL, Tabs in Code/JSON und Zeilenend-Leerraum.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
