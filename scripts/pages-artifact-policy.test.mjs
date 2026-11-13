import { tmpdir } from "./test-temp.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  isAllowedArtifactPath,
  assertPagesOutputDirectory,
  isIgnoredDesignSource,
  isPublishableSourcePath,
  listPublicCatalogFiles,
  listPublishableSourceFiles,
  PAGE_GENERATED_FILES,
  PAGE_SOURCE_DIRS,
  PAGE_SOURCE_FILES,
} from "./pages-artifact-policy.mjs";
import { validatePagesArtifact } from "./validate-pages-artifact.mjs";
import { installPublicCatalogCandidate } from "../mobile/tool/install-public-catalog-candidate.mjs";

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

test("Pages kopiert nur die exakt gebundene öffentliche App-Katalogfassung", async context => {
  const root = await createFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "mobile", "catalog"), artifactRoot = path.join(root, "_site");
  const { filename, content } = await writePublicCatalogFixture(directory, publicSpecies());
  await copyFixtureArtifact(root, artifactRoot);
  assert.equal((await validatePagesArtifact({ repoRoot: root, artifactRoot })).ok, true);
  await writeFile(path.join(artifactRoot, "mobile", "catalog", filename), content.replace("amsel", "dross"));
  const tampered = await validatePagesArtifact({ repoRoot: root, artifactRoot });
  assert.equal(tampered.ok, false);
  assert.match(tampered.errors.join("\n"), /weicht von ihrer Freigabedatei ab/);
  await writeFile(path.join(directory, "private-check.json"), "{}");
  await assert.rejects(listPublishableSourceFiles(root), /genau die Freigabedatei/);
});

test("Pages sperrt private oder fremde Medien auch bei gültiger App-Katalog-Prüfsumme", async context => {
  const raw = "https://raw.githubusercontent.com/felixkfm90/iucn-species-data/";
  const cases = [
    ["Projektdatei in Galeriedaten", species => { species.media.gallery[0].projectFile = { projectId: "private" }; }],
    ["fremde Galeriequelle", species => { species.media.gallery[0].url = "https://example.com/gallery/image.png"; }],
    ["fremde Artseite", species => { species.websiteUrl = "https://example.com/wildlife/heimische-tierwelt/amsel"; }],
    ["fremde Spektrogrammquelle", species => { species.media.spectrogram.url = "https://example.com/spectrogram.webp"; }],
    ["unbekanntes Spektrogrammfeld", species => { species.media.spectrogram.projectFile = { projectId: "private" }; }],
    ["veränderlicher Branch", species => { species.media.sounds[0].url = `${raw}main/species-assets/Amsel/sound.mp3`; }],
    ["fremdes Raw-Repository", species => { species.media.sounds[0].url = `${raw.replace("felixkfm90", "foreign")}${"a".repeat(40)}/species-assets/Amsel/sound.mp3`; }],
    ["unsicherer Raw-Ordner", species => { species.media.sounds[0].url = `${raw}${"a".repeat(40)}/species-assets/unsafe%2Ffolder/sound.mp3`; }],
    ["Raw-Ordner mit Steuerzeichen", species => { species.media.sounds[0].url = `${raw}${"a".repeat(40)}/species-assets/Amsel%00/sound.mp3`; }],
  ];
  for (const [name, change] of cases) {
    await context.test(name, async subtest => {
      const root = await mkdtemp(path.join(tmpdir(), "public-catalog-policy-"));
      subtest.after(() => rm(root, { recursive: true, force: true }));
      const species = publicSpecies();
      change(species);
      await writePublicCatalogFixture(path.join(root, "mobile", "catalog"), species);
      await assert.rejects(listPublicCatalogFiles(root), /Ungültiger öffentlicher App-Katalog/);
    });
  }
});

test("Pages akzeptiert passende Medien, deren Git-Kennungen sich unterscheiden", async context => {
  const root = await mkdtemp(path.join(tmpdir(), "public-catalog-pinned-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "mobile", "catalog"), species = publicSpecies();
  const raw = "https://raw.githubusercontent.com/felixkfm90/iucn-species-data/";
  species.media.sounds[0].url = `${raw}${"a".repeat(40)}/species-assets/Amsel/sound.mp3`;
  species.media.spectrogram.url = `${raw}${"b".repeat(40)}/species-assets/Amsel/spectrogram.webp`;
  const { filename } = await writePublicCatalogFixture(directory, species);
  assert.deepEqual(await listPublicCatalogFiles(root), ["mobile/catalog/manifest.json", `mobile/catalog/${filename}`]);
});

test("Katalogübernahme prüft die Ausgangsfassung und ersetzt ausschließlich das Katalogpaar", async context => {
  const fixture = await mkdtemp(path.join(tmpdir(), "public-catalog-install-"));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const root = path.join(fixture, "repo"), candidate = path.join(fixture, "candidate");
  const catalogDirectory = path.join("mobile", "catalog");
  const before = await writePublicCatalogFixture(path.join(root, catalogDirectory), publicSpecies());
  const revised = publicSpecies();
  revised.sections = [{ id: "habitat", title: "Lebensraum", text: "Gärten und lichte Wälder.", intentionallyEmpty: false }];
  const after = await writePublicCatalogFixture(path.join(candidate, catalogDirectory), revised);
  const verification = { status: "verified-candidate", catalogSha256: path.parse(after.filename).name,
    baselineSha256: path.parse(before.filename).name };
  const untouched = path.join(root, "speciesData.json");
  await writeFile(untouched, "Unveränderte Artendaten");

  await assert.rejects(installPublicCatalogCandidate({ root, candidate,
    verification: { ...verification, baselineSha256: "f".repeat(64) } }), /Ausgangsfassung/);
  await assert.rejects(installPublicCatalogCandidate({ root, candidate,
    verification: { ...verification, catalogSha256: "f".repeat(64) } }), /Kandidatendateien/);
  assert.deepEqual(await listPublicCatalogFiles(root), ["mobile/catalog/manifest.json", `mobile/catalog/${before.filename}`]);
  await installPublicCatalogCandidate({ root, candidate, verification });
  assert.deepEqual(await listPublicCatalogFiles(root), ["mobile/catalog/manifest.json", `mobile/catalog/${after.filename}`]);
  assert.equal(await readFile(path.join(root, catalogDirectory, after.filename), "utf8"), after.content);
  assert.equal(await readFile(untouched, "utf8"), "Unveränderte Artendaten");
});

test("Pages verlangt trotz passender Dateiprüfsumme die gebundenen Katalog-Metadaten", async context => {
  const root = await mkdtemp(path.join(tmpdir(), "public-catalog-manifest-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "mobile", "catalog");
  for (const change of [{ revision: "a".repeat(64) }, { generatedAt: "2026-11-13T12:00:00.000Z" }, { speciesCount: 2 }]) {
    await writePublicCatalogFixture(directory, publicSpecies(), change);
    await assert.rejects(listPublicCatalogFiles(root), /passt nicht zur Freigabedatei/);
  }
});

function publicSpecies() {
  const assetBase = "https://felixkfm90.github.io/iucn-species-data/species-assets/Amsel";
  return { id: "amsel", scientificName: "Turdus merula", commonName: "Amsel", taxonomy: [], sections: [],
    websiteUrl: "https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/amsel", media: {
      sounds: [{ id: "amsel:sound", url: `${assetBase}/sound.mp3`, bytes: 25, sha256: "a".repeat(64), mimeType: "audio/mpeg" }],
      spectrogram: { id: "amsel:spectrogram", url: `${assetBase}/spectrogram.webp`, bytes: 15, sha256: "b".repeat(64),
        mimeType: "image/webp", alt: "Spektrogramm der Tierstimme" },
      gallery: [{ id: "amsel:gallery:1", url: "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/example/amsel.jpg",
        order: 0, alt: "Amsel", caption: "" }],
    } };
}

async function writePublicCatalogFixture(directory, speciesEntry, manifestChanges = {}) {
  const species = [speciesEntry], generatedAt = "2026-11-12T12:00:00.000Z";
  const revision = createHash("sha256").update(`${JSON.stringify(species)}\n`).digest("hex");
  const content = JSON.stringify({ schemaVersion: 1, revision, generatedAt, species });
  const catalogSha256 = createHash("sha256").update(content).digest("hex"), filename = `${catalogSha256}.json`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), content);
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ schemaVersion: 1, kind: "fn-public-catalog",
    catalogSha256, catalogBytes: Buffer.byteLength(content), revision, generatedAt, speciesCount: species.length, ...manifestChanges }));
  return { filename, content };
}

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
