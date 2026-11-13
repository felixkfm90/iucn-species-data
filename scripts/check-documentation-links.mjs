import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(rootDir, "docs");

function collectMarkdownFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectMarkdownFiles(absolutePath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      result.push(absolutePath);
    }
  }
  return result;
}

function normalizeMarkdownTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  const target = trimmed.startsWith("<")
    ? trimmed.slice(1, trimmed.lastIndexOf(">"))
    : trimmed.split(/\s+["']/u, 1)[0];
  return target.split("#", 1)[0].split("?", 1)[0];
}

function isExternalOrPageLink(target) {
  return (
    !target ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(target)
  );
}

function relativeFromRoot(absolutePath) {
  return path.relative(rootDir, absolutePath).replaceAll(path.sep, "/");
}

const moduleDirectories = ["installer", "nas", "mobile", "species-explorer/shared-project",
  "species-explorer/species-content", "species-explorer/update-completion", "species-explorer/local-ai",
  "species-explorer/page-authoring", "species-explorer/language-check", "species-explorer/desktop/assets"];
// Only direct project documentation, never generated builds, SDK caches, model
// downloads or dependency READMEs beneath a module.
const moduleFiles = moduleDirectories.flatMap((relative) => {
  const directory = path.join(rootDir, relative);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(directory, entry.name));
});
const files = [path.join(rootDir, "AGENTS.md"), path.join(rootDir, "README.md"), ...collectMarkdownFiles(docsDir), ...moduleFiles];
const missing = [];

for (const filePath of files) {
  const source = fs.readFileSync(filePath, "utf8");

  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = normalizeMarkdownTarget(match[1]);
    if (isExternalOrPageLink(target)) continue;

    let decodedTarget = target;
    try {
      decodedTarget = decodeURIComponent(target);
    } catch {
      // An invalid escape remains a normal path and is reported as missing below.
    }

    const resolvedTarget = path.resolve(path.dirname(filePath), decodedTarget);
    if (!fs.existsSync(resolvedTarget)) {
      missing.push(`${relativeFromRoot(filePath)} -> ${target}`);
    }
  }

  for (const match of source.matchAll(/`((?:AGENTS|README)\.md|docs\/[A-Za-z0-9_./-]+\.(?:md|html|css))`/gu)) {
    const resolvedTarget = path.resolve(rootDir, match[1]);
    if (!fs.existsSync(resolvedTarget)) {
      missing.push(`${relativeFromRoot(filePath)} -> ${match[1]}`);
    }
  }
}

const uniqueMissing = [...new Set(missing)].sort((left, right) => left.localeCompare(right, "de"));
if (uniqueMissing.length > 0) {
  console.error(`Dokumentationsprüfung fehlgeschlagen: ${uniqueMissing.length} lokaler Verweis(e) fehlen.`);
  for (const entry of uniqueMissing) console.error(`- ${entry}`);
  process.exitCode = 1;
} else {
  console.log(`Dokumentationsprüfung bestanden: ${files.length} Markdown-Dateien ohne fehlende lokale Verweise.`);
}
