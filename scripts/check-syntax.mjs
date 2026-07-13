import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const skippedDirectories = new Set([
  ".git",
  "_site",
  "node_modules",
  "local-tools",
  "Testlauf",
  "species-assets",
  "asset-backups",
  "backups",
  "cleanup-trash",
  "logs",
  "pipeline-asset-backups",
  "staging",
]);

const files = await collectSourceFiles(root);
const failures = [];

for (const filePath of files) {
  const relativePath = path.relative(root, filePath);
  try {
    const source = await readFile(filePath, "utf8");
    if (path.extname(filePath).toLowerCase() === ".mjs") {
      new vm.SourceTextModule(source, { identifier: filePath });
    } else {
      new vm.Script(source, { filename: filePath });
    }
  } catch (error) {
    failures.push({
      file: relativePath.replaceAll(path.sep, "/"),
      output: error.stack || error.message,
    });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Syntaxfehler in ${failure.file}:\n${failure.output}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Syntaxprüfung bestanden: ${files.length} JavaScript-/MJS-Dateien.`);
}

async function collectSourceFiles(currentDir) {
  const collected = [];
  for (const entry of await readdir(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collected.push(...await collectSourceFiles(fullPath));
    } else if (entry.isFile() && [".js", ".mjs"].includes(path.extname(entry.name).toLowerCase())) {
      collected.push(fullPath);
    }
  }
  return collected.sort((left, right) => left.localeCompare(right, "en"));
}
