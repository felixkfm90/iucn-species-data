import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { BUNDLED_SPECIES_SOURCE, readBundledSpeciesCatalog } from "./bundled.mjs";
import { sourceAllowed } from "../../installer/build.mjs";

test("Desktop und Android verwenden dieselbe gebundene öffentliche Quelle ohne Medienbeigabe", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const bytes = await readBundledSpeciesCatalog(root), catalog = JSON.parse(bytes);
  const manifest = JSON.parse(await fs.readFile(path.join(root, "mobile", "assets", "catalog-manifest.json"), "utf8"));
  assert.equal(catalog.species.length, BUNDLED_SPECIES_SOURCE.speciesCount);
  assert.equal(bytes.length, BUNDLED_SPECIES_SOURCE.bytes);
  assert.equal(manifest.catalogSha256, BUNDLED_SPECIES_SOURCE.sha256);
  assert.equal(manifest.catalogBytes, bytes.length);
  assert.equal(manifest.revision, catalog.revision);
  assert.equal(catalog.species.find(art => art.id === "cebusimitator").sections[0].title,
    "Panama-Kapuzineraffe – Kluger Akrobat des Regenwaldes");
  assert.equal(sourceAllowed("mobile/assets/catalog.json"), true);
  assert.equal(sourceAllowed("mobile/assets/catalog-manifest.json"), true);
  assert.equal(sourceAllowed("mobile/artifacts/arten-explorer-0.1.1-debug-arm64.apk"), false);
  assert.equal(sourceAllowed("mobile/build-evidence/artifact.json"), false);
});

test("veränderter Anfangskatalog wird vor einer Importfreigabe zurückgewiesen", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "bundled-catalog-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  const directory = path.join(root, "mobile", "assets"); await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "catalog.json"), "changed");
  await assert.rejects(readBundledSpeciesCatalog(root), /Katalogquelle stimmt/);
  await fs.writeFile(path.join(directory, "catalog.json"), Buffer.alloc(BUNDLED_SPECIES_SOURCE.bytes, 32));
  await assert.rejects(readBundledSpeciesCatalog(root), /Katalogbytes/);
});
