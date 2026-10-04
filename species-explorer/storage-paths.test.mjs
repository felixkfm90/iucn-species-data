import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "../scripts/test-temp.mjs";
import { explorerStoragePaths, readExplorerStorageConfig, relocatedStoragePath } from "./storage-paths.mjs";

async function fixture(t) {
  const repoRoot = await fs.mkdtemp(path.join(tmpdir(), "storage-path-"));
  t.after(() => fs.rm(repoRoot, { recursive: true, force: true }));
  return repoRoot;
}

test("neue/fremde Installation verwendet ihren Daten-Unterordner und keine produktive AppData", async (t) => {
  const repoRoot = await fixture(t);
  const result = explorerStoragePaths({ repoRoot });
  assert.equal(result.dataRoot, path.join(repoRoot, "Daten"));
  assert.equal(result.taxonomyRoot, path.join(repoRoot, "Daten", "taxonomy"));
  assert.equal(result.mode, "local-default");
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
