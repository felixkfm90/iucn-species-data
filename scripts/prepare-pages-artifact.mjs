import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outDir = path.resolve(root, outArg ? outArg.slice("--out=".length) : "_site");

const requiredFiles = [
  "species-core.js",
  "species-info.js",
  "species-taxonomy.js",
  "species-status.js",
  "species-sound.js",
  "map-loader.js",
  "search.js",
  "sort.js",
  "lightbox-zoom.js",
  "speciesData.json",
  "species_list.json",
  "fehlende_elemente_report.json",
  "lastSavedAssessmentId.json",
  "species-assets-overrides.json",
  "README.md",
];

const requiredDirs = [
  "species-assets",
  "graphics",
  "docs",
];

async function exists(source) {
  try {
    await stat(source);
    return true;
  } catch {
    return false;
  }
}

async function assertPresent(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!(await exists(fullPath))) {
    throw new Error(`Pages-Artefakt kann nicht gebaut werden: ${relativePath} fehlt.`);
  }
}

async function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(outDir, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

async function collectStats(dir) {
  const { readdir } = await import("node:fs/promises");
  let files = 0;
  let bytes = 0;
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = await collectStats(fullPath);
      files += child.files;
      bytes += child.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await stat(fullPath)).size;
    }
  }

  return { files, bytes };
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

for (const entry of [...requiredFiles, ...requiredDirs]) {
  await assertPresent(entry);
}

if (outDir === root || !outDir.startsWith(root + path.sep)) {
  throw new Error(`Ungültiges Pages-Ausgabeverzeichnis: ${outDir}`);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of requiredFiles) {
  await copyEntry(entry);
}

for (const entry of requiredDirs) {
  await copyEntry(entry);
}

await writeFile(path.join(outDir, ".nojekyll"), "");
await writeFile(
  path.join(outDir, "index.html"),
  `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IUCN Species Data</title>
</head>
<body>
  <h1>IUCN Species Data</h1>
  <p>Statische Daten- und Assetbasis für die Squarespace-Wildlife-Seiten.</p>
  <ul>
    <li><a href="./speciesData.json">speciesData.json</a></li>
    <li><a href="./fehlende_elemente_report.json">fehlende_elemente_report.json</a></li>
  </ul>
</body>
</html>
`,
);

const stats = await collectStats(outDir);
console.log(`Pages-Artefakt vorbereitet: ${outDir}`);
console.log(`Dateien: ${stats.files}`);
console.log(`Größe: ${formatBytes(stats.bytes)}`);
