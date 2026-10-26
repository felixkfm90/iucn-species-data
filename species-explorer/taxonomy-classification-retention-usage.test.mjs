import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { captureCatalogUsage, createCatalogUsageService } from "./lightroom-catalog-usage.mjs";
import { assertClassificationRetentionUsage, readClassificationRetentionBuildPolicy } from "./taxonomy-classification-retention-usage.mjs";
import { CLASSIFICATION_RETENTION_POLICY } from "./taxonomy-classification-retention.mjs";
import { protectedMasterIdsRevision } from "./taxonomy-master-inputs.mjs";

const USED = `mtx_${"a".repeat(32)}`, RETAINED = `mtx_${"b".repeat(32)}`;
async function fixture(t, usedIds = [USED]) {
  const base = await fs.mkdtemp(path.join(tmpdir(), "fn-retention-usage-"));
  t.after(() => fs.rm(base, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(base, "taxonomy"), catalogPath = path.join(base, "own-fixture.lrcat");
  await fs.writeFile(catalogPath, "bounded usage fixture, never opened as SQLite");
  const capture = () => captureCatalogUsage(root, { catalogPath, totalPhotos: 3,
    usedTaxa: usedIds.map((masterTaxonId) => ({ masterTaxonId, photoCount: 1 })), complete: true, passes: 2 });
  const service = createCatalogUsageService({ taxonomyRoot: root });
  const save = async () => {
    const preview = await service.catalogUsagePreview();
    return service.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
  };
  await capture();
  const saved = await save(), binding = { policy: CLASSIFICATION_RETENTION_POLICY, usageRevision: saved.revision };
  const summary = { ...binding, total: 1, retainedMasterTaxonIds: [RETAINED], protectedMasterIdsRevision: protectedMasterIdsRevision(usedIds) };
  return { root, catalogPath, base, capture, save, binding, summary };
}

test("Retention ohne Zusammenfassung erzeugt keinen neuen FN-Gate oder Dateizugriff", async () => {
  assert.equal(await assertClassificationRetentionUsage("missing/not-read", null), null);
  assert.equal(await readClassificationRetentionBuildPolicy("missing/not-read", { events: [] }), null);
});

test("Retention bindet vollständige geschlossene FN-Revision ohne Quittungen umzudatieren", async (t) => {
  const f = await fixture(t), names = ["registry.json", "captures.json"];
  const before = await Promise.all(names.map((name) => fs.readFile(path.join(f.root, "catalog-usage", name))));
  assert.deepEqual(await assertClassificationRetentionUsage(f.root, f.summary), {
    ...f.binding, protectedMasterIdsRevision: f.summary.protectedMasterIdsRevision,
  });
  assert.deepEqual(await readClassificationRetentionBuildPolicy(f.root, { events: [{ type: "classification" }] }), f.binding);
  const after = await Promise.all(names.map((name) => fs.readFile(path.join(f.root, "catalog-usage", name))));
  assert.deepEqual(after, before);
});

test("Retention verweigert fehlende, fremde oder veränderte Nutzungsbindung", async (t) => {
  const f = await fixture(t);
  for (const patch of [{ policy: "unknown" }, { usageRevision: "" }, { usageRevision: "c".repeat(64) },
    { protectedMasterIdsRevision: "d".repeat(64) }, { total: 2 }, { retainedMasterTaxonIds: [RETAINED, RETAINED] }]) {
    await assert.rejects(assertClassificationRetentionUsage(f.root, { ...f.summary, ...patch }));
  }
  assert.equal(await readClassificationRetentionBuildPolicy(path.join(f.base, "unregistered"), { events: [{ type: "classification" }] }), null);
});

test("Retention erlaubt weder positive FN-Nutzung noch unbekannte Abwesenheit bei Arbeitsdateien", async (t) => {
  const f = await fixture(t);
  await assert.rejects(assertClassificationRetentionUsage(f.root, { ...f.summary, retainedMasterTaxonIds: [USED] }), /zugewiesen/);
  for (const suffix of [".lock", "-wal", "-shm", "-journal"]) {
    await fs.writeFile(f.catalogPath + suffix, "");
    await assert.rejects(assertClassificationRetentionUsage(f.root, f.summary), /veraltet/);
    await fs.unlink(f.catalogPath + suffix);
  }
  await fs.appendFile(f.catalogPath, "changed");
  await assert.rejects(assertClassificationRetentionUsage(f.root, f.summary), /veraltet/);
});

test("Neue SDK-Quittung verlangt frische Bindung und ersetzt keinen alten Retentionsbeleg", async (t) => {
  const f = await fixture(t);
  await f.capture();
  await assert.rejects(assertClassificationRetentionUsage(f.root, f.summary), /veraltet/);
  await f.save();
  await assert.rejects(assertClassificationRetentionUsage(f.root, f.summary), /veraltet/);
});

test("Offene oder veraltete FN-Basis liefert keine optionale Retentionspolicy und sperrt vorhandene Retention", async (t) => {
  const f = await fixture(t), registry = { events: [{ type: "classification" }] };
  await fs.writeFile(f.catalogPath + ".lock", "open");
  assert.equal(await readClassificationRetentionBuildPolicy(f.root, registry), null);
  await fs.unlink(f.catalogPath + ".lock");
  await fs.appendFile(f.catalogPath, "changed");
  assert.equal(await readClassificationRetentionBuildPolicy(f.root, registry), null);
  await assert.rejects(assertClassificationRetentionUsage(f.root, f.summary), /veraltet/);
});
