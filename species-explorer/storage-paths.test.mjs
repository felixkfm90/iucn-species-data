import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { tmpdir } from "../scripts/test-temp.mjs";
import { explorerStoragePaths, readExplorerStorageConfig, relocatedStoragePath } from "./storage-paths.mjs";

async function fixture(t) {
  const repoRoot = await fs.mkdtemp(path.join(tmpdir(), "storage-path-"));
  t.after(() => fs.rm(repoRoot, { recursive: true, force: true }));
  return repoRoot;
}

test("neue/fremde Installation verwendet ihren data-Unterordner und keine produktive AppData", async (t) => {
  const repoRoot = await fixture(t);
  const result = explorerStoragePaths({ repoRoot });
  assert.equal(result.dataRoot, path.join(repoRoot, "data"));
  assert.equal(result.taxonomyRoot, path.join(repoRoot, "data", "taxonomy"));
  assert.equal(result.mode, "local-default");
});

test("bestehender unkonfigurierter Daten-Ordner bleibt sichtbar; zwei Datenziele stoppen", async (t) => {
  const repoRoot = await fixture(t);
  await fs.mkdir(path.join(repoRoot, "Daten"));
  assert.equal(explorerStoragePaths({ repoRoot }).dataRoot, path.join(repoRoot, "Daten"));
  await fs.mkdir(path.join(repoRoot, "data"));
  assert.throws(() => explorerStoragePaths({ repoRoot }), /beide|mehrdeutig/);
});

test("data akzeptiert den unveränderten alten Umzugsbeleg und übersetzt nur gebundene Datenpfade", async (t) => {
  const repoRoot = await fixture(t), oldRepo = path.join(repoRoot, "old-program");
  const dataRoot = path.join(repoRoot, "data"), legacyDataRoot = path.join(repoRoot, "old-appdata");
  await fs.mkdir(dataRoot);
  const plan = { schemaVersion: 1, repoRoot: oldRepo, sourceRoot: legacyDataRoot,
    targetRoot: path.join(oldRepo, "Daten"), files: [], totalBytes: 0 };
  plan.revision = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  const original = JSON.stringify({ schemaVersion: 1, state: "committed", plan, copied: [] });
  const journalFile = path.join(dataRoot, ".storage-migration.json");
  await fs.writeFile(journalFile, original);
  await fs.writeFile(path.join(repoRoot, "storage-path.json"), JSON.stringify({ schemaVersion: 1, state: "ready",
    dataRoot: "data", legacyDataRoot, previousRepoRoot: oldRepo, migrationRevision: plan.revision }));
  assert.equal(readExplorerStorageConfig(repoRoot).dataRoot, dataRoot);
  for (const from of [legacyDataRoot, path.join(repoRoot, "Daten"), path.join(oldRepo, "Daten")]) {
    assert.equal(relocatedStoragePath(path.join(from, "taxonomy", "active.json"), { repoRoot }), path.join(dataRoot, "taxonomy", "active.json"));
    assert.equal(relocatedStoragePath(path.join(`${from}-other`, "file"), { repoRoot }),
      from.startsWith(oldRepo) ? path.join(repoRoot, "Daten-other", "file") : path.join(`${from}-other`, "file"));
  }
  assert.equal(await fs.readFile(journalFile, "utf8"), original);
  if (process.platform === "win32") {
    for (const variant of ["DATEN", "daten", "Daten/"]) {
      const variantPlan = { ...plan, targetRoot: path.join(oldRepo, variant) };
      delete variantPlan.revision;
      variantPlan.revision = createHash("sha256").update(JSON.stringify(variantPlan)).digest("hex");
      await fs.writeFile(journalFile, JSON.stringify({ schemaVersion: 1, state: "committed", plan: variantPlan, copied: [] }));
      await fs.writeFile(path.join(repoRoot, "storage-path.json"), JSON.stringify({ schemaVersion: 1, state: "ready",
        dataRoot: "data", legacyDataRoot, previousRepoRoot: oldRepo, migrationRevision: variantPlan.revision }));
      assert.equal(readExplorerStorageConfig(repoRoot).dataRoot, dataRoot);
    }
  }
  const broken = JSON.parse(original); broken.plan.targetRoot = path.join(oldRepo, "foreign");
  await fs.writeFile(journalFile, JSON.stringify(broken));
  assert.throws(() => readExplorerStorageConfig(repoRoot), /nicht vollständig/);
});

test("konfigurierbarer absoluter Datenpfad und portable Standardkonfiguration", async (t) => {
  const repoRoot = await fixture(t), dataRoot = path.join(repoRoot, "Daten");
  await fs.mkdir(dataRoot);
  await fs.writeFile(path.join(repoRoot, "storage-path.json"), JSON.stringify({ schemaVersion: 1, state: "ready", dataRoot: "Daten" }));
  assert.equal(explorerStoragePaths({ repoRoot }).searchRoot, path.join(dataRoot, "lightroom"));
  const external = path.join(repoRoot, "custom");
  assert.equal(explorerStoragePaths({ repoRoot, environment: { FN_EXPLORER_DATA_ROOT: external } }).dataRoot, external);
  assert.throws(() => explorerStoragePaths({ repoRoot, environment: { FN_EXPLORER_DATA_ROOT: "relative" } }), /absolut/);
});

test("fehlendes/ungültiges/noch umziehendes konfiguriertes Datenziel fail-closed", async (t) => {
  const repoRoot = await fixture(t), file = path.join(repoRoot, "storage-path.json");
  for (const config of [{ schemaVersion: 1, state: "ready", dataRoot: "Daten" },
    { schemaVersion: 1, state: "migrating", dataRoot: "Daten" }, { schemaVersion: 1, state: "ready", dataRoot: "../fremd" }]) {
    await fs.writeFile(file, JSON.stringify(config));
    assert.throws(() => readExplorerStorageConfig(repoRoot));
  }
});

test("explizite Speicherrelocation erhält die Originalbelege und keine falschen Prefix-Treffer", async (t) => {
  const repoRoot = await fixture(t);
  const oldData = path.join(repoRoot, "old"), dataRoot = path.join(repoRoot, "Daten"), oldRepo = path.join(repoRoot, "old-program");
  const config = { legacyDataRoot: oldData, dataRoot, previousRepoRoot: oldRepo };
  const proof = { path: path.join(oldData, "taxonomy", "active.json"), checksum: "proof" };
  assert.equal(relocatedStoragePath(proof.path, { repoRoot, config }), path.join(dataRoot, "taxonomy", "active.json"));
  assert.equal(proof.path, path.join(oldData, "taxonomy", "active.json"));
  const foreign = path.join(`${oldData}-foreign`, "file");
  assert.equal(relocatedStoragePath(foreign, { repoRoot, config }), foreign);
  assert.equal(relocatedStoragePath(path.join(oldRepo, "species_list.json"), { repoRoot, config }), path.join(repoRoot, "species_list.json"));
});
