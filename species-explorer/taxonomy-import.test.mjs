import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  importTaxonomyPrototype,
  rollbackTaxonomyRelease,
} from "./taxonomy-import.mjs";
import {
  listTaxonomyReleaseIds,
  readActiveTaxonomyPointer,
} from "./taxonomy-storage.mjs";

const FIXTURE_DIRECTORY = path.resolve(
  "scripts",
  "fixtures",
  "taxonomy",
  "col-xr-2026-07-17",
);

async function temporaryDirectory(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function copyFixture(root, releaseId) {
  const target = path.join(root, `fixture-${releaseId}`);
  await fs.cp(FIXTURE_DIRECTORY, target, { recursive: true });
  const manifestPath = path.join(target, "prototype-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.release = {
    ...manifest.release,
    releaseId,
    alias: `${manifest.release.alias} ${releaseId}`,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return target;
}

test("Taxonomieimport aktiviert nur eine vollständig validierte unveränderliche Version", async (context) => {
  const root = await temporaryDirectory("taxonomy-import-");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const taxonomyRoot = path.join(root, "taxonomy");
  const result = await importTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
  });
  assert.equal(result.active, true);
  assert.equal(result.manifest.validation.integrity, "ok");
  assert.equal(result.manifest.counts.rawNameUsages, 123);
  assert.equal(result.manifest.counts.wormsComparisons, 3);
  assert.equal((await readActiveTaxonomyPointer(taxonomyRoot)).activeRelease, result.releaseId);
  assert.deepEqual(await listTaxonomyReleaseIds(taxonomyRoot), [result.releaseId]);
  await assert.rejects(
    importTaxonomyPrototype({
      fixtureDirectory: FIXTURE_DIRECTORY,
      taxonomyRoot,
    }),
    /bereits unveränderlich installiert/,
  );
});

test("fehlerhafte Prüfsummen verändern die aktive Version nicht", async (context) => {
  const root = await temporaryDirectory("taxonomy-checksum-");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const taxonomyRoot = path.join(root, "taxonomy");
  const active = await importTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
  });
  const damagedFixture = await copyFixture(root, "col-xr-damaged");
  await fs.appendFile(path.join(damagedFixture, "metadata.yaml"), "\ndamaged: true\n", "utf8");
  await assert.rejects(
    importTaxonomyPrototype({
      fixtureDirectory: damagedFixture,
      taxonomyRoot,
    }),
    /Dateigröße|Prüfsumme/,
  );
  const pointer = await readActiveTaxonomyPointer(taxonomyRoot);
  assert.equal(pointer.activeRelease, active.releaseId);
  assert.equal(pointer.previousRelease, null);
  assert.deepEqual(await listTaxonomyReleaseIds(taxonomyRoot), [active.releaseId]);
});

test("abgebrochene Importe hinterlassen weder Release noch Staging-Rest", async (context) => {
  const root = await temporaryDirectory("taxonomy-abort-");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const taxonomyRoot = path.join(root, "taxonomy");
  const active = await importTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
  });
  const abortedFixture = await copyFixture(root, "col-xr-aborted");
  const controller = new AbortController();
  await assert.rejects(
    importTaxonomyPrototype({
      fixtureDirectory: abortedFixture,
      taxonomyRoot,
      signal: controller.signal,
      onProgress(entry) {
        if (entry.phase === "name-usages" && entry.current >= 25) controller.abort();
      },
    }),
    /aborted|abort/i,
  );
  const pointer = await readActiveTaxonomyPointer(taxonomyRoot);
  assert.equal(pointer.activeRelease, active.releaseId);
  assert.deepEqual(await listTaxonomyReleaseIds(taxonomyRoot), [active.releaseId]);
  const stagingPath = path.join(taxonomyRoot, "staging");
  const stagingEntries = await fs.readdir(stagingPath).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  assert.deepEqual(stagingEntries, []);
});

test("Aktivierung hält genau eine geprüfte Rollbackversion vor", async (context) => {
  const root = await temporaryDirectory("taxonomy-rollback-");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const taxonomyRoot = path.join(root, "taxonomy");
  const first = await importTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
  });
  const secondFixture = await copyFixture(root, "col-xr-prototype-next");
  const second = await importTaxonomyPrototype({
    fixtureDirectory: secondFixture,
    taxonomyRoot,
  });
  assert.deepEqual(await listTaxonomyReleaseIds(taxonomyRoot), [
    first.releaseId,
    second.releaseId,
  ]);
  const activePointer = await readActiveTaxonomyPointer(taxonomyRoot);
  assert.equal(activePointer.schemaVersion, 1);
  assert.equal(activePointer.activeRelease, second.releaseId);
  assert.equal(activePointer.previousRelease, first.releaseId);
  assert.match(activePointer.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  const pointer = await rollbackTaxonomyRelease(taxonomyRoot);
  assert.equal(pointer.activeRelease, first.releaseId);
  assert.equal(pointer.previousRelease, second.releaseId);
});

test("Fehler nach dem Umschalten stellen die vorherige aktive Version wieder her", async (context) => {
  const root = await temporaryDirectory("taxonomy-activation-");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const taxonomyRoot = path.join(root, "taxonomy");
  const first = await importTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
  });
  const secondFixture = await copyFixture(root, "col-xr-activation-error");
  await assert.rejects(
    importTaxonomyPrototype({
      fixtureDirectory: secondFixture,
      taxonomyRoot,
      onProgress(entry) {
        if (entry.phase === "complete") throw new Error("simulierter Abschlussfehler");
      },
    }),
    /simulierter Abschlussfehler/,
  );
  const pointer = await readActiveTaxonomyPointer(taxonomyRoot);
  assert.equal(pointer.activeRelease, first.releaseId);
  assert.equal(pointer.previousRelease, null);
  assert.deepEqual(await listTaxonomyReleaseIds(taxonomyRoot), [first.releaseId]);
});
