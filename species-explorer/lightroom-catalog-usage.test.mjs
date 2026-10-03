import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureCatalogUsage, catalogUsageStatus, createCatalogUsageService, assertCatalogUsageRevision, catalogProtectedMasterIds } from "./lightroom-catalog-usage.mjs";
import { acquireMasterJobLock } from "./taxonomy-master-job.mjs";
import { createLightroomSearchRequestHandler } from "./lightroom-search-helper.mjs";
import { matchExplorerRoute } from "./request-router.mjs";

const ID = `mtx_${"a".repeat(32)}`;
test("Nutzungs- und Automatikwege sind geschützte POST-Aktionen, kein Status-GET", () => {
  for (const suffix of ["catalog-usage/preview", "catalog-usage/save", "classification/automatic-preview", "classification/automatic-save"]) {
    const url = `/api/taxonomy/master/${suffix}`;
    assert.equal(matchExplorerRoute("POST", url).name, "taxonomy-master");
    assert.notEqual(matchExplorerRoute("GET", url).name, "taxonomy-master");
  }
});
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fn-usage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(directory, "taxonomy"), catalogPath = path.join(directory, "current.lrcat");
  await fs.writeFile(catalogPath, "catalog fixture, never opened as SQLite");
  const request = { catalogPath, totalPhotos: 3, usedTaxa: [{ masterTaxonId: ID, photoCount: 2 }], complete: true, passes: 2 };
  const service = createCatalogUsageService({ taxonomyRoot: root });
  const save = async () => {
    const preview = await service.catalogUsagePreview();
    return service.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
  };
  return { directory, root, catalogPath, request, service, save };
}

test("vollständige SDK-Erfassung allein ist keine Abwesenheitsfreigabe; ausdrückliche Gesamtbestätigung bindet unveränderten Katalog", async (t) => {
  const { root, catalogPath, request, service, save } = await fixture(t);
  const before = await fs.readFile(catalogPath);
  assert.equal((await catalogUsageStatus(root)).ready, false);
  const receipt = await captureCatalogUsage(root, request);
  assert.equal(receipt.assignedPhotos, 2);
  assert.equal(receipt.changesPhotos, false);
  assert.equal((await catalogUsageStatus(root)).reason, "missing");
  const preview = await service.catalogUsagePreview();
  assert.equal(preview.catalogs.length, 1);
  for (const missing of ["confirmed", "allCatalogsConfirmed", "unchangedSinceCapture"]) {
    const input = { token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true };
    delete input[missing];
    await assert.rejects(service.catalogUsageSave(input), /ausdrücklich/);
  }
  await assert.rejects(service.catalogUsageSave({ token: "stale", confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true }), /veraltet/);
  const saved = await save();
  const status = await assertCatalogUsageRevision(root, saved.revision, { full: true });
  assert.equal(status.ready, true);
  assert.deepEqual(status.usedIds, [ID]);
  assert.equal(status.catalogs[0].taxonCount, 1);
  assert.deepEqual(await fs.readFile(catalogPath), before);
  await assert.rejects(service.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true }), /veraltet/);
});

test("offene, fehlende oder geänderte Kataloge sind unbekannt; alte positive Nutzung bleibt geschützt", async (t) => {
  const { root, catalogPath, request, save } = await fixture(t);
  await captureCatalogUsage(root, request); const saved = await save();
  for (const suffix of [".lock", "-wal", "-shm", "-journal"]) {
    await fs.writeFile(catalogPath + suffix, "");
    const status = await catalogUsageStatus(root, { full: true });
    assert.equal(status.ready, false); assert.deepEqual(status.usedIds, [ID]);
    await assert.rejects(assertCatalogUsageRevision(root, saved.revision), /veraltet/);
    await fs.unlink(catalogPath + suffix);
  }
  await fs.appendFile(catalogPath, "changed");
  assert.equal((await catalogUsageStatus(root)).ready, false);
  await fs.unlink(catalogPath);
  assert.equal((await catalogUsageStatus(root)).ready, false);
});

test("Alte positive Nutzung und neue SDK-Kennungen schützen auch ohne neue Abwesenheitsfreigabe", async (t) => {
  const { root, request, catalogPath, save } = await fixture(t);
  await captureCatalogUsage(root, request); await save();
  const secondId = `mtx_${"b".repeat(32)}`;
  await captureCatalogUsage(root, { ...request, usedTaxa: [{ masterTaxonId: secondId, photoCount: 1 }] });
  await fs.writeFile(catalogPath + ".lock", "opened");
  assert.equal((await catalogUsageStatus(root)).ready, false);
  assert.deepEqual(await catalogProtectedMasterIds(root), [ID, secondId]);
});

test("neue Erfassung oder zusätzlicher Katalog sperrt die alte Freigabe; registrierte Kataloge dürfen nicht verschwinden", async (t) => {
  const { directory, root, request, service, save } = await fixture(t);
  await captureCatalogUsage(root, request); await save();
  await captureCatalogUsage(root, request);
  assert.equal((await catalogUsageStatus(root)).reason, "new-capture"); await save();
  const other = path.join(directory, "other.lrcat"); await fs.writeFile(other, "other");
  await captureCatalogUsage(root, { ...request, catalogPath: other, usedTaxa: [], totalPhotos: 0 });
  assert.equal((await catalogUsageStatus(root)).reason, "unregistered-catalog"); await save();
  const captureFile = path.join(root, "catalog-usage", "captures.json");
  const captures = JSON.parse(await fs.readFile(captureFile, "utf8")); captures.entries.pop();
  await fs.writeFile(captureFile, JSON.stringify(captures));
  assert.equal((await catalogUsageStatus(root)).reason, "missing-capture");
  await assert.rejects(service.catalogUsagePreview(), /registrierter FN-Katalog fehlt/);
});

test("unvollständige, doppelte, beschädigte oder ungültige Erfassungen werden nicht als leer behandelt", async (t) => {
  const { root, request, service } = await fixture(t);
  for (const override of [{ complete: false }, { passes: 1 }, { totalPhotos: -1 }, { catalogPath: "relative.lrcat" },
    { usedTaxa: [{ masterTaxonId: "bad", photoCount: 1 }] }, { usedTaxa: [request.usedTaxa[0], request.usedTaxa[0]] },
    { usedTaxa: [{ masterTaxonId: ID, photoCount: 4 }] }]) {
    await assert.rejects(captureCatalogUsage(root, { ...request, ...override }));
    assert.equal((await catalogUsageStatus(root)).ready, false);
  }
  await assert.rejects(service.catalogUsagePreview(), /zuerst in Lightroom/);
  await captureCatalogUsage(root, request);
  const file = path.join(root, "catalog-usage", "captures.json");
  await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, entries: {} }));
  await assert.rejects(service.catalogUsagePreview(), /Ungültige/);
  await assert.rejects(captureCatalogUsage(root, request), /Ungültige/);
});

test("Registermanipulation und fehlende Quittung entwerten die Gesamtfreigabe statt Abwesenheit zu behaupten", async (t) => {
  const { root, request, save } = await fixture(t);
  await captureCatalogUsage(root, request); await save();
  const registryFile = path.join(root, "catalog-usage", "registry.json");
  const registry = JSON.parse(await fs.readFile(registryFile, "utf8"));
  const original = JSON.stringify(registry);
  registry.catalogs[0].usedTaxa = []; await fs.writeFile(registryFile, JSON.stringify(registry));
  await assert.rejects(catalogUsageStatus(root, { full: true }), /verändert/);
  await fs.writeFile(registryFile, original);
  await fs.unlink(path.join(root, "catalog-usage", "captures.json"));
  assert.equal((await catalogUsageStatus(root)).ready, false);
  assert.deepEqual((await catalogUsageStatus(root)).usedIds, [ID]);
});

test("Aufbausperre verhindert SDK-Erfassung; Speicherschaden erzeugt keine Teilfreigabe", async (t) => {
  const { root, request, service } = await fixture(t);
  const unlock = await acquireMasterJobLock(root);
  try { await assert.rejects(captureCatalogUsage(root, request), /aufbau läuft/); }
  finally { unlock(); }
  await captureCatalogUsage(root, request);
  const preview = await service.catalogUsagePreview();
  await fs.mkdir(path.join(root, "catalog-usage", "registry.json"));
  await assert.rejects(service.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true }));
});

test("Lightroom-Suchhilfe speichert explizite Erfassung ohne Suchdatenbankzugriff; geschlossene Hilfe lehnt sie ab", async (t) => {
  const { directory, root, request } = await fixture(t);
  let opens = 0;
  const helper = await createLightroomSearchRequestHandler({ searchRoot: path.join(directory, "lightroom"),
    openStore: async () => { opens++; throw new Error("No database access"); } });
  const result = await helper.handle({ command: "catalog-usage-capture", ...request });
  assert.equal(result.result.saved, true); assert.equal(opens, 0);
  assert.equal((await catalogUsageStatus(root)).ready, false);
  helper.close();
  assert.equal((await helper.handle({ command: "catalog-usage-capture", ...request })).error.code, "helper-closed");
});
