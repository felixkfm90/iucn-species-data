import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createTaxonomyMaintenanceService } from "./taxonomy-maintenance-service.mjs";

async function waitForTerminal(service) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const status = await service.status();
    if (!status.active) return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Die simulierte Taxonomieaktualisierung wurde nicht beendet.");
}

function latestRelease() {
  return {
    releaseId: "col-new-release",
    datasetKey: 2,
    alias: "COL Test XR",
    issued: "2026-07-26",
    exportUrl: "https://api.checklistbank.org/dataset/2/export.zip",
  };
}

test("Aktualisierung braucht Vorschau und aktiviert erst nach dem Artenabgleich", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-maintenance-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  let pointer = { activeRelease: "col-old-release", previousRelease: null };
  const sequence = [];
  let resetCount = 0;
  const referenceService = {
    reset() {
      resetCount += 1;
    },
    async status() {
      return {
        available: true,
        releaseId: pointer.activeRelease,
        boundedPrototype: false,
        source: { releaseId: pointer.activeRelease },
      };
    },
  };
  const service = createTaxonomyMaintenanceService({
    taxonomyRoot: path.join(root, "taxonomy"),
    repoRoot: root,
    referenceService,
    discoverRelease: async () => ({
      checkedAt: "2026-07-26T08:00:00.000Z",
      latest: latestRelease(),
    }),
    listReleases: async () => ["col-old-release", "col-new-release"],
    readPointer: async () => pointer,
    compareProjectSpecies: async () => {
      sequence.push("compare");
      return {
        summary: {
          total: 2,
          exact: 1,
          suggestions: 1,
          ambiguous: 0,
          missing: 0,
          blocking: 0,
        },
        results: [
          { germanName: "Amsel", classification: "exact-accepted", severity: "ok" },
          {
            germanName: "Alte Art",
            classification: "accepted-name-change",
            severity: "warning",
          },
        ],
      };
    },
    activateRelease: async (_taxonomyRoot, releaseId) => {
      sequence.push("activate");
      pointer = {
        activeRelease: releaseId,
        previousRelease: pointer.activeRelease,
      };
      return pointer;
    },
    rollbackRelease: async () => {
      const activeRelease = pointer.previousRelease;
      pointer = {
        activeRelease,
        previousRelease: pointer.activeRelease,
      };
      return pointer;
    },
  });
  context.after(() => service.close());

  await assert.rejects(
    service.startUpdate({ token: "ohne-vorschau" }),
    /vorschau ist abgelaufen/i,
  );
  const preview = await service.previewUpdate();
  assert.equal(preview.hasWork, true);
  assert.equal(preview.downloadRequired, false);
  assert.equal(preview.conflictPolicy.automaticProjectChanges, false);
  await service.startUpdate({ token: preview.token });
  const completed = await waitForTerminal(service);
  assert.equal(completed.status, "completed");
  assert.deepEqual(sequence, ["compare", "activate"]);
  assert.equal(pointer.activeRelease, "col-new-release");
  assert.equal(completed.conflicts.suggestions, 1);
  assert.equal(completed.conflictDetails[0].germanName, "Alte Art");
  assert.ok(resetCount >= 1);

  const rolledBack = await service.rollback();
  assert.equal(rolledBack.releaseId, "col-old-release");
  assert.equal(pointer.activeRelease, "col-old-release");
});

test("Fehler vor der Aktivierung lassen die bisherige Referenz aktiv", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-maintenance-failure-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const pointer = { activeRelease: "col-old-release", previousRelease: null };
  const service = createTaxonomyMaintenanceService({
    taxonomyRoot: path.join(root, "taxonomy"),
    repoRoot: root,
    referenceService: {
      reset() {},
      async status() {
        return {
          available: true,
          releaseId: pointer.activeRelease,
          boundedPrototype: false,
        };
      },
    },
    discoverRelease: async () => ({
      checkedAt: "2026-07-26T08:00:00.000Z",
      latest: latestRelease(),
    }),
    listReleases: async () => ["col-old-release", "col-new-release"],
    readPointer: async () => pointer,
    compareProjectSpecies: async () => {
      throw new Error("simulierter Konfliktabgleichfehler");
    },
    activateRelease: async () => {
      throw new Error("Aktivierung darf nicht erreicht werden");
    },
  });
  context.after(() => service.close());

  const preview = await service.previewUpdate();
  await service.startUpdate({ token: preview.token });
  const failed = await waitForTerminal(service);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /Konfliktabgleichfehler/);
  assert.equal(pointer.activeRelease, "col-old-release");
});
