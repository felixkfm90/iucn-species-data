import { tmpdir } from "./test-temp.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  isAllowedArtifactPath,
  assertPagesOutputDirectory,
  isIgnoredDesignSource,
  isPublishableSourcePath,
  listPublishableSourceFiles,
  PAGE_GENERATED_FILES,
  PAGE_SOURCE_DIRS,
  PAGE_SOURCE_FILES,
} from "./pages-artifact-policy.mjs";
import { validatePagesArtifact } from "./validate-pages-artifact.mjs";

test("Pages-Ausgabewahl schützt Daten, Quellen und fremde Ziele vor Ersetzen", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const data = path.join(root, "Daten");
  await mkdir(data);
  await writeFile(path.join(data, "private.txt"), "preserve");
  for (const target of [root, data, path.join(root, "data"), path.join(root, "species-assets"), path.join(root, ".git"),
    path.join(root, "temp"), path.join(root, "..", "_site")]) {
    await assert.rejects(assertPagesOutputDirectory(root, target), /Pages-Ausgabe/);
  }
  const { readFile } = await import("node:fs/promises");
  assert.equal(await readFile(path.join(data, "private.txt"), "utf8"), "preserve");
  assert.equal(await assertPagesOutputDirectory(root, path.join(root, "_site")), path.join(root, "_site"));
  const temporary = path.join(root, "temp", "own-build", "_site");
  await assert.rejects(assertPagesOutputDirectory(root, temporary), /Pages-Ausgabe/);
});

test("Pages-Bau erhält den Reviewbestand einer fremden Temp-Sitzung", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const session = path.join(root, "temp", "foreign-session");
  await mkdir(path.join(session, "_site"), { recursive: true });
  await writeFile(path.join(session, "owner.json"), JSON.stringify({ owner: "foreign-owner" }));
  const marker = path.join(session, "_site", "unfinished-review.txt");
  await writeFile(marker, "preserve review");
  const result = spawnSync(process.execPath,
    [fileURLToPath(new URL("prepare-pages-artifact.mjs", import.meta.url)), "--out=temp/foreign-session/_site"],
    { cwd: root, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pages-Ausgabe/);
  const { readFile } = await import("node:fs/promises");
  assert.equal(await readFile(marker, "utf8"), "preserve review");
});

test("Pages-Ausgabe verweigert verknüpfte Verzeichnisse vor Löschung", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const { symlink, readFile } = await import("node:fs/promises");
  const data = path.join(root, "Daten");
  await mkdir(data);
  await writeFile(path.join(data, "private.txt"), "preserve");
  await symlink(data, path.join(root, "_site"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(assertPagesOutputDirectory(root, path.join(root, "_site")), /Link/);
  assert.equal(await readFile(path.join(data, "private.txt"), "utf8"), "preserve");
});

test("Pages-Bau mit versehentlichem Datenziel stoppt vor jeder Änderung", async (context) => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const data = path.join(root, "Daten");
  await mkdir(data);
  await writeFile(path.join(data, "private.txt"), "preserve");
  const result = spawnSync(process.execPath,
    [fileURLToPath(new URL("prepare-pages-artifact.mjs", import.meta.url)), "--out=Daten"],
    { cwd: root, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pages-Ausgabe/);
  const { readFile } = await import("node:fs/promises");
  assert.equal(await readFile(path.join(data, "private.txt"), "utf8"), "preserve");
});

test("Pages-Pfadregeln erlauben nur Laufzeitdateien", () => {
  assert.equal(isPublishableSourcePath("species-assets/Amsel/map.jpg"), true);
  assert.equal(isPublishableSourcePath("species-assets/Amsel/map.jpg.deleted"), false);
  assert.equal(isPublishableSourcePath("graphics/catagory/LC.png"), true);
  assert.equal(isPublishableSourcePath("graphics/catagory/Alternativ/Blaupause.psd"), false);
  assert.equal(isPublishableSourcePath("README.md"), false);
  assert.equal(isPublishableSourcePath("docs/roadmap.md"), false);
  assert.equal(isPublishableSourcePath("docs/squarespace-custom.css"), true);
  assert.equal(isPublishableSourcePath("species-hero-layout.js"), true);
  assert.equal(isPublishableSourcePath("header-navigation.js"), true);
  assert.equal(isIgnoredDesignSource("graphics/catagory/Alternativ/Blaupause.psd"), true);
  assert.equal(isAllowedArtifactPath(".nojekyll"), true);
  assert.equal(isAllowedArtifactPath("species-explorer/local-settings.json"), false);
  for (const filename of ["data/taxonomy/active.json", "Daten/taxonomy/active.json", "temp/tests/a.sqlite", "storage-path.json",
    "lightroom-plugin/FNWildlifeTaxonomy.lrplugin/temp/request.json"]) {
    assert.equal(isPublishableSourcePath(filename), false);
    assert.equal(isAllowedArtifactPath(filename), false);
  }
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
  const root = await mkdtemp(path.join(tmpdir(), "pages-policy-"));
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
