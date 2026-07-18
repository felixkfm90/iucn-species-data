import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  isAllowedArtifactPath,
  isIgnoredDesignSource,
  isPublishableSourcePath,
  listPublishableSourceFiles,
  PAGE_GENERATED_FILES,
  PAGE_SOURCE_DIRS,
  PAGE_SOURCE_FILES,
} from "./pages-artifact-policy.mjs";
import { validatePagesArtifact } from "./validate-pages-artifact.mjs";

test("Pages-Pfadregeln erlauben nur Laufzeitdateien", () => {
  assert.equal(isPublishableSourcePath("species-assets/Amsel/map.jpg"), true);
  assert.equal(isPublishableSourcePath("species-assets/Amsel/map.jpg.deleted"), false);
  assert.equal(isPublishableSourcePath("graphics/catagory/LC.png"), true);
  assert.equal(isPublishableSourcePath("graphics/catagory/Alternativ/Blaupause.psd"), false);
  assert.equal(isPublishableSourcePath("README.md"), false);
  assert.equal(isPublishableSourcePath("docs/roadmap.md"), false);
  assert.equal(isPublishableSourcePath("docs/squarespace-custom.css"), false);
  assert.equal(isIgnoredDesignSource("graphics/catagory/Alternativ/Blaupause.psd"), true);
  assert.equal(isAllowedArtifactPath(".nojekyll"), true);
  assert.equal(isAllowedArtifactPath("species-explorer/local-settings.json"), false);
});

test("Pages-Artefakt entspricht exakt der freigegebenen Quelle", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const artifactRoot = path.join(root, "_site");
  await copyFixtureArtifact(root, artifactRoot);

  const result = await validatePagesArtifact({ repoRoot: root, artifactRoot });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.actualFileCount, result.expectedFileCount);
});

test("Pages-Artefakt weist unerwartete Dateien zurück", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const artifactRoot = path.join(root, "_site");
  await copyFixtureArtifact(root, artifactRoot);
  await writeFile(path.join(artifactRoot, "secret.env"), "SECRET=1\n");

  const result = await validatePagesArtifact({ repoRoot: root, artifactRoot });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /secret\.env/);
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "pages-policy-"));
  for (const relativePath of PAGE_SOURCE_FILES) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "fixture\n");
  }
  for (const relativeDir of PAGE_SOURCE_DIRS) await mkdir(path.join(root, relativeDir), { recursive: true });
  await mkdir(path.join(root, "species-assets", "Amsel"), { recursive: true });
  await writeFile(path.join(root, "species-assets", "Amsel", "map.jpg"), "fixture");
  await mkdir(path.join(root, "graphics", "catagory", "Alternativ"), { recursive: true });
  await writeFile(path.join(root, "graphics", "catagory", "LC.png"), "fixture");
  await writeFile(path.join(root, "graphics", "catagory", "Alternativ", "Blaupause.psd"), "design");
  return root;
}

async function copyFixtureArtifact(root, artifactRoot) {
  const sourceFiles = await listPublishableSourceFiles(root);
  for (const relativePath of sourceFiles) {
    const source = path.join(root, ...relativePath.split("/"));
    const target = path.join(artifactRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    const contents = await import("node:fs/promises").then(({ readFile }) => readFile(source));
    await writeFile(target, contents);
  }
  for (const relativePath of PAGE_GENERATED_FILES) {
    await writeFile(path.join(artifactRoot, relativePath), "generated\n");
  }
}
