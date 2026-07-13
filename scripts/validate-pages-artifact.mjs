import { fileURLToPath } from "node:url";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  isAllowedArtifactPath,
  listPublishableSourceFiles,
  normalizeArtifactPath,
  PAGE_GENERATED_FILES,
} from "./pages-artifact-policy.mjs";

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export async function validatePagesArtifact({
  repoRoot = process.cwd(),
  artifactRoot = path.join(repoRoot, "_site"),
} = {}) {
  const errors = [];
  const actualFiles = await collectArtifactFiles(artifactRoot, errors);
  const expectedFiles = new Set([
    ...(await listPublishableSourceFiles(repoRoot)),
    ...PAGE_GENERATED_FILES,
  ]);
  const actualSet = new Set(actualFiles);

  for (const relativePath of actualFiles) {
    if (!isAllowedArtifactPath(relativePath)) {
      errors.push(`Nicht freigegebene Datei im Pages-Artefakt: ${relativePath}`);
    }
  }
  for (const relativePath of expectedFiles) {
    if (!actualSet.has(relativePath)) errors.push(`Erwartete Pages-Datei fehlt: ${relativePath}`);
  }
  for (const relativePath of actualSet) {
    if (!expectedFiles.has(relativePath)) errors.push(`Unerwartete Pages-Datei: ${relativePath}`);
  }

  return {
    ok: errors.length === 0,
    artifactRoot,
    expectedFileCount: expectedFiles.size,
    actualFileCount: actualFiles.length,
    errors,
  };
}

async function collectArtifactFiles(artifactRoot, errors) {
  const rootInfo = await lstat(artifactRoot).catch(() => null);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) {
    errors.push(`Pages-Artefakt fehlt oder ist kein reguläres Verzeichnis: ${artifactRoot}`);
    return [];
  }

  const files = [];
  await walk(artifactRoot, artifactRoot, files, errors);
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

async function walk(root, currentDir, files, errors) {
  for (const entry of await readdir(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = normalizeArtifactPath(path.relative(root, fullPath));
    if (entry.isSymbolicLink()) {
      errors.push(`Symbolischer Link im Pages-Artefakt: ${relativePath}`);
    } else if (entry.isDirectory()) {
      await walk(root, fullPath, files, errors);
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      errors.push(`Nicht unterstützter Eintrag im Pages-Artefakt: ${relativePath}`);
    }
  }
}

if (isCli) {
  const repoRootArg = process.argv.find((arg) => arg.startsWith("--repo-root="));
  const artifactRootArg = process.argv.find((arg) => arg.startsWith("--artifact-root="));
  const repoRoot = path.resolve(repoRootArg ? repoRootArg.slice("--repo-root=".length) : process.cwd());
  const artifactRoot = path.resolve(
    artifactRootArg ? artifactRootArg.slice("--artifact-root=".length) : path.join(repoRoot, "_site"),
  );
  const result = await validatePagesArtifact({ repoRoot, artifactRoot });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
