import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareTaxonomyDataVersions, readTaxonomyDataVersions, readVersionJson } from "./taxonomy-data-versions.mjs";
import { createTaxonomyUpdatePresence } from "./taxonomy-update-presence.mjs";

function matching() {
  return {
    available: true,
    reference: { schemaVersion: 1, activeRelease: "col-new" },
    master: { schemaVersion: 3, candidateId: "master-new", sources: [
      { provider: "catalogue-of-life", providerVersion: "col-new" },
    ], inputRevisions: { corrections: "incorporated" } },
    packageManifest: { schemaVersion: 1, packageId: "package-new", masterVersion: "master-new", taxonCount: 100 },
  };
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fn-data-versions-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const searchRoot = path.join(root, "lightroom");
  const taxonomyRoot = path.join(root, "taxonomy");
  const write = async (relative, value) => {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, null, 2));
    return file;
  };
  const data = matching();
  await write("taxonomy/active.json", data.reference);
  await write("taxonomy/master/active/manifest.json", data.master);
  await write("lightroom/active/manifest.json", data.packageManifest);
  // Deliberately not a SQLite database: the version check may only stat this file.
  await write("lightroom/active/taxonomy-search.sqlite", "must not be opened as SQLite");
  return { root, searchRoot, taxonomyRoot, write, data };
}

test("Versionsvergleich trennt Verfügbarkeit, Referenz-/Masterdrift und Paketdrift", () => {
  assert.equal(compareTaxonomyDataVersions(matching()).state, "current");
  const referenceDrift = matching();
  referenceDrift.reference.activeRelease = "col-newer";
  assert.equal(compareTaxonomyDataVersions(referenceDrift).reason, "reference-master-drift");
  const packageDrift = matching();
  packageDrift.packageManifest.masterVersion = "master-old";
  assert.equal(compareTaxonomyDataVersions(packageDrift).reason, "master-package-drift");
  for (const change of [
    { master: null }, { readError: true }, { reference: { schemaVersion: 99 } },
    { master: { ...matching().master, sources: [] } },
  ]) assert.equal(compareTaxonomyDataVersions({ ...matching(), ...change }).state, "unverifiable");
  assert.equal(compareTaxonomyDataVersions({ ...matching(), available: false }).state, "missing");
});

test("Versionsvergleich prüft Korrekturschichten und ignoriert nicht mehr anwendbare alte Zeiger", () => {
  const data = matching();
  data.correction = { baseMasterVersion: "master-new", basePackageId: "package-new", revision: "new-revision" };
  assert.equal(compareTaxonomyDataVersions(data).correctionMode, "overlay");
  assert.equal(compareTaxonomyDataVersions(data).masterCorrectionRevision, "new-revision");
  data.correction.basePackageId = "package-old";
  assert.equal(compareTaxonomyDataVersions(data).reason, "correction-drift");
  data.correction.baseMasterVersion = "master-old";
  assert.equal(compareTaxonomyDataVersions(data).state, "current");
  assert.equal(compareTaxonomyDataVersions(data).masterCorrectionRevision, "incorporated");
});

test("Versionsleser nutzt begrenzten Masterkopf ohne große Differenzlisten oder SQLite-Zugriff", async (t) => {
  const f = await fixture(t);
  const manifest = await f.write("taxonomy/master/active/manifest.json", { ...f.data.master, summary: {}, diff: "x".repeat(200_000) });
  assert.deepEqual(await readVersionJson(manifest, { masterHeader: true }), f.data.master);
  assert.equal((await readTaxonomyDataVersions(f)).state, "current");
  await assert.rejects(readVersionJson(manifest), /Leselimit/);
  await f.write("taxonomy/master/active/manifest.json", { unknown: "x".repeat(70_000), ...f.data.master });
  assert.equal((await readTaxonomyDataVersions(f)).state, "unverifiable");
});

test("Fehlende oder beschädigte Versionsdateien behaupten keine Aktualität", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.taxonomyRoot, "active.json"), "{");
  assert.equal((await readTaxonomyDataVersions(f)).state, "unverifiable");
  await fs.unlink(path.join(f.searchRoot, "active/taxonomy-search.sqlite"));
  assert.equal((await readTaxonomyDataVersions(f)).state, "missing");
});

test("Aktive Korrektur muss eine passende unveränderliche Release-Datei besitzen", async (t) => {
  const f = await fixture(t);
  const correction = { schemaVersion: 1, activeRelease: `corrections-${"a".repeat(20)}`,
    baseMasterVersion: "master-new", basePackageId: "package-new", revision: "revision" };
  await f.write("corrections/active.json", correction);
  assert.equal((await readTaxonomyDataVersions(f)).state, "unverifiable");
  const relative = `corrections/releases/${correction.activeRelease}.json`;
  await f.write(relative, { ...correction, releaseId: correction.activeRelease });
  assert.equal((await readTaxonomyDataVersions(f)).state, "current");
  await f.write(relative, { ...correction, releaseId: correction.activeRelease, revision: "different" });
  assert.equal((await readTaxonomyDataVersions(f)).state, "unverifiable");
});

test("Wechsel während der Abfrage und veraltete offene Suchpakete werden nicht als aktuell gemeldet", async (t) => {
  const f = await fixture(t);
  let reads = 0;
  const switched = await readTaxonomyDataVersions({ ...f, readJson: async (file, options) => {
    const value = await readVersionJson(file, options);
    if (file === path.join(f.taxonomyRoot, "active.json") && ++reads === 2) value.activeRelease = "col-next";
    return value;
  } });
  assert.equal(switched.reason, "versions-changed");
  const old = await readTaxonomyDataVersions({ ...f, loadedPackage: { packageId: "package-old", masterVersion: "master-old" } });
  assert.equal(old.state, "updating");
  const current = await readTaxonomyDataVersions({ ...f, loadedPackage: f.data.packageManifest });
  assert.equal(current.state, "current");
});

test("Frischer Laufhinweis zeigt Aufbau, abgestürzte oder veraltete Hinweise bleiben ungeklärt", async (t) => {
  const f = await fixture(t);
  const now = Date.parse("2026-09-05T10:00:00Z");
  await f.write("taxonomy/master/update-presence.json", { schemaVersion: 1, active: true, pid: 123, updatedAt: new Date(now).toISOString() });
  assert.equal((await readTaxonomyDataVersions({ ...f, now: () => now, isProcessAlive: () => true })).state, "updating");
  assert.equal((await readTaxonomyDataVersions({ ...f, now: () => now, isProcessAlive: () => false })).state, "unverifiable");
  assert.equal((await readTaxonomyDataVersions({ ...f, now: () => now + 31_000, isProcessAlive: () => true })).state, "unverifiable");
});

test("Update-Hinweis wird vor der Operation gesetzt und auch im Fehlerfall beendet", async (t) => {
  const f = await fixture(t);
  const withPresence = createTaxonomyUpdatePresence(f.taxonomyRoot);
  const marker = () => readVersionJson(path.join(f.taxonomyRoot, "master/update-presence.json"));
  assert.equal(await withPresence(async () => { assert.equal((await marker()).active, true); return 42; }), 42);
  assert.equal((await marker()).active, false);
  await assert.rejects(withPresence(async () => { throw new Error("fixture failure"); }), /fixture failure/);
  assert.equal((await marker()).active, false);
});
