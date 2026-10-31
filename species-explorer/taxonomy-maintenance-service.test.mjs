import { assertTestTempPath, tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { discoverLatestCatalogueRelease, downloadCatalogueArchive, normalizeCatalogueRelease } from "./taxonomy-release-client.mjs";

import {
  createTaxonomyMaintenanceService,
  taxonomyMaintenanceInternals,
} from "./taxonomy-maintenance-service.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("Beenden wartet auf die laufende Startprüfung einschließlich Cache-Schreiben", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-close-check-"));
  const bodyEntered = deferred(), body = deferred();
  let startup, closing, secondClosing, calls = 0;
  const service = createTaxonomyMaintenanceService({
    taxonomyRoot: path.join(root, "data", "taxonomy"), repoRoot: root,
    referenceService: { reset() {} }, readPointer: async () => null,
    discoverRelease: (options) => discoverLatestCatalogueRelease({ ...options,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => {
          bodyEntered.resolve();
          await body.promise;
          return { result: [{ key: 2, issued: "2026-10-31", origin: "xrelease" }] };
        } };
      },
    }),
  });
  t.after(async () => {
    body.resolve();
    await Promise.allSettled([startup, closing, secondClosing, service.close()]);
    await fs.rm(assertTestTempPath(root), { recursive: true, force: true });
  });
  startup = service.startupCheck();
  await bodyEntered.promise;
  let completed = 0;
  closing = service.close().then(() => { completed += 1; });
  secondClosing = service.close().then(() => { completed += 1; });
  await new Promise((resolve) => setImmediate(resolve));
  const completedWhilePending = completed;
  body.resolve();
  await Promise.all([startup, closing, secondClosing]);
  const cached = JSON.parse(await fs.readFile(service.cachePath, "utf8"));
  assert.equal(completedWhilePending, 0, "Auch ein zweites close() muss auf den noch ausstehenden Schreibabschluss warten");
  assert.equal(completed, 2);
  assert.equal(cached.latest.releaseId, "col-xr-2026-10-31-2");
  assert.equal(calls, 1);
  await fs.rm(assertTestTempPath(root), { recursive: true, force: true });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(fs.access(root), { code: "ENOENT" });
  await assert.rejects(service.checkLatest(), { statusCode: 503 });
});

test("Beenden wartet auf alle Versionsprüfungen auch bei einem fehlgeschlagenen Abruf", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-close-concurrent-"));
  const requests = [deferred(), deferred()];
  let calls = 0, first, second, closing;
  const service = createTaxonomyMaintenanceService({ taxonomyRoot: path.join(root, "taxonomy"), repoRoot: root,
    referenceService: { reset() {} }, discoverRelease: () => requests[calls++].promise });
  t.after(async () => {
    requests.forEach((request) => request.resolve({ latest: latestRelease(), checkedAt: "2026-10-31T00:00:00Z" }));
    await Promise.allSettled([first, second, closing, service.close()]);
    await fs.rm(assertTestTempPath(root), { recursive: true, force: true });
  });
  first = service.checkLatest().catch((error) => error);
  second = service.checkLatest();
  let completed = false;
  closing = service.close().then(() => { completed = true; });
  requests[0].reject(new Error("simulierter Metadatenfehler"));
  assert.match((await first).message, /Metadatenfehler/);
  await new Promise((resolve) => setImmediate(resolve));
  const completedWithSecondPending = completed;
  requests[1].resolve({ latest: latestRelease(), checkedAt: "2026-10-31T00:00:00Z" });
  await Promise.all([second, closing]);
  assert.equal(completedWithSecondPending, false, "Ein fehlgeschlagener Abruf beendet die übrigen laufenden Prüfungen nicht");
  assert.equal(completed, true);
  assert.equal(calls, 2);
});

test("Beenden schließt den gestarteten Projektvergleich ab und beginnt danach keinen Versionsabruf", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-close-comparison-"));
  const entered = deferred(), finish = deferred();
  const reportPath = path.join(root, "taxonomy", "comparison.json");
  let startup, closing, pointerReads = 0, releaseChecks = 0;
  const service = createTaxonomyMaintenanceService({ taxonomyRoot: path.join(root, "taxonomy"), repoRoot: root,
    referenceService: { reset() {} },
    readPointer: async () => { pointerReads += 1; return { activeRelease: "col-active" }; },
    readProjectConflicts: async () => null,
    compareProjectSpecies: async () => {
      entered.resolve();
      await finish.promise;
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, "{}\n");
    },
    discoverRelease: async () => { releaseChecks += 1; return { latest: latestRelease(), checkedAt: "2026-10-31T00:00:00Z" }; },
  });
  t.after(async () => {
    finish.resolve();
    await Promise.allSettled([startup, closing, service.close()]);
    await fs.rm(assertTestTempPath(root), { recursive: true, force: true });
  });
  startup = service.startupCheck();
  await entered.promise;
  let completed = false;
  closing = service.close().then(() => { completed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  const completedWhileComparing = completed;
  finish.resolve();
  await Promise.all([startup, closing]);
  assert.equal(completedWhileComparing, false);
  assert.equal(await fs.readFile(reportPath, "utf8"), "{}\n");
  assert.equal(releaseChecks, 0);
  assert.equal(await service.startupCheck(), null);
  assert.equal(pointerReads, 1, "Nach dem Schließen darf auch keine neue Startprüfung anlaufen");
});

test("Referenzstatus liefert echte Messmengen getrennt von alten Phasenmarken und löscht veraltete Zähler", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-progress-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = createTaxonomyMaintenanceService({ taxonomyRoot: path.join(root, "taxonomy"), repoRoot: root,
    referenceService: { reset() {} } });
  service.updateProgress({ phase: "download", current: 25, total: 100 });
  assert.equal(service.state.progressCurrent, 25);
  assert.equal(service.state.progressTotal, 100);
  assert.notEqual(service.state.progressPercent, 25, "Legacy-Gewichtung bleibt API-kompatibel, ist aber kein Anzeigewert mehr");
  service.updateProgress({ phase: "compact" });
  assert.equal(service.state.progressCurrent, null);
  assert.equal(service.state.progressTotal, null);
  await service.close();
});

test("Importfehler werden ohne technischen Stacktrace angezeigt", () => {
  assert.equal(
    taxonomyMaintenanceInternals.summarizeImportFailure(
      [
        "Error: Das entpackte CoL-Paket enthält zu viele Dateien.",
        "    at walkFiles (file:///D:/IUCN_Datenbank/species-explorer/taxonomy-package.mjs:50:15)",
        "    at async validateTaxonomyPackage (file:///D:/IUCN_Datenbank/species-explorer/taxonomy-package.mjs:94:27)",
      ].join("\n"),
      1,
    ),
    "Das entpackte CoL-Paket enthält zu viele Dateien.",
  );
  assert.equal(
    taxonomyMaintenanceInternals.summarizeImportFailure("", 7),
    "Der Taxonomieimport wurde mit Code 7 beendet.",
  );
});

test("CoL-Referenzlücken können bewusst durch den aktiven Master bestätigt werden", async (context) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-conflict-decision-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const mappingsPath = path.join(root, "species-reference-mappings.json");
  const conflictReport = {
    summary: {
      total: 1,
      exact: 0,
      suggestions: 0,
      referenceGaps: 1,
      ambiguous: 0,
      missing: 0,
    },
    results: [{
      germanName: "Eurasisches Eichhörnchen",
      scientificName: "Sciurus vulgaris",
      classification: "reference-gap",
      severity: "warning",
    }],
  };
  const service = createTaxonomyMaintenanceService({
    taxonomyRoot: path.join(root, "taxonomy"),
    repoRoot: root,
    mappingsPath,
    speciesListPath: path.join(root, "species_list.json"),
    referenceService: {
      reset() {},
      async status() {
        return { available: true, releaseId: "col-active", boundedPrototype: false };
      },
      async exactMasterTaxonByScientificName() {
        return {
          masterTaxonId: "mtx-sciurus-vulgaris",
          acceptedScientificName: "Sciurus vulgaris",
          rank: "species",
          sourceProviders: ["gbif", "inaturalist", "wikidata"],
          masterStatuses: ["col-reference-gap", "externally-confirmed"],
        };
      },
      async search() {
        throw new Error("Die allgemeine Suche darf hier nicht verwendet werden.");
      },
    },
    readPointer: async () => ({ activeRelease: "col-active", previousRelease: null }),
    listReleases: async () => ["col-active"],
    readProjectConflicts: async () => conflictReport,
    compareProjectSpecies: async () => ({
      summary: {
        total: 1,
        exact: 1,
        suggestions: 0,
        referenceGaps: 0,
        ambiguous: 0,
        missing: 0,
      },
      results: [{
        germanName: "Eurasisches Eichhörnchen",
        scientificName: "Sciurus vulgaris",
        classification: "externally-confirmed-reference-gap",
        severity: "ok",
      }],
    }),
    now: () => new Date("2026-08-10T10:00:00.000Z"),
  });
  context.after(() => service.close());

  const status = await service.decideProjectConflict({
    action: "accept-external-reference-gap",
    scientificName: "Sciurus vulgaris",
  });
  const mappings = JSON.parse(await fs.readFile(mappingsPath, "utf8"));
  assert.equal(
    mappings.mappings["sciurus vulgaris"].masterTaxonId,
    "mtx-sciurus-vulgaris",
  );
  assert.equal(status.conflicts.referenceGaps, 0);
  assert.equal(status.conflictDetails.length, 0);
});

async function waitForTerminal(service) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const status = await service.status();
    if (!status.active) return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Die simulierte Taxonomieaktualisierung wurde nicht beendet.");
}

test("Ein bestätigter Quellenplan bleibt beim Warten auf Lightroom exakt gebunden", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-bound-update-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let activeRelease = "col-old-release", milliseconds = Date.parse("2026-10-03T08:00:00Z");
  const activated = [];
  const service = createTaxonomyMaintenanceService({ taxonomyRoot: path.join(root, "taxonomy"), repoRoot: root,
    referenceService: { reset() {}, status: async () => ({ available: true, releaseId: activeRelease,
      boundedPrototype: false, source: { releaseId: activeRelease } }) },
    now: () => new Date(milliseconds),
    discoverRelease: async () => ({ checkedAt: new Date(milliseconds).toISOString(), latest: latestRelease() }),
    listReleases: async () => ["col-old-release", "col-new-release"],
    readPointer: async () => ({ activeRelease }),
    compareProjectSpecies: async () => ({ summary: { total: 0, blocking: 0 }, results: [] }),
    activateRelease: async (_root, release) => { activated.push(release); activeRelease = release; return { activeRelease }; },
  });
  t.after(() => service.close());
  const preview = await service.previewUpdate();
  const updatePlan = await service.bindUpdatePlan({ token: preview.token });
  milliseconds += 60 * 60 * 1000;
  service.latest = { ...latestRelease(), releaseId: "col-another-new-release" };
  await assert.rejects(service.startUpdate({ token: preview.token }), /abgelaufen/);
  await assert.rejects(service.startUpdate({ updatePlan: { ...updatePlan, updateSupplements: !updatePlan.updateSupplements } }), /verändert/);
  const before = activeRelease; activeRelease = "col-foreign-release";
  await assert.rejects(service.startUpdate({ updatePlan }), /Quellenstand.*verändert/);
  activeRelease = before;
  await service.startUpdate({ updatePlan });
  assert.equal((await waitForTerminal(service)).status, "completed");
  assert.deepEqual(activated, ["col-new-release"], "Kein Wechsel auf ein inzwischen erkanntes neues latest");
});

function latestRelease() {
  return {
    releaseId: "col-new-release",
    datasetKey: 2,
    alias: "COL Test XR",
    issued: "2026-07-26",
    exportUrl: "https://api.checklistbank.org/dataset/2/export.zip",
  };
}

test("API-404-Ersatz läuft nur nach Bestätigung durch die Wartung; Downloadfehler lässt Altstand und Folgeschritte unangetastet", async (t) => {
  for (const succeeds of [true, false]) await t.test(succeeds ? "datierter Archivweg" : "Ersatzabruf scheitert", async (st) => {
    const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-dated-archive-"));
    st.after(() => fs.rm(root, { recursive: true, force: true }));
    const release = normalizeCatalogueRelease({ key: 316441, issued: "2026-09-25", origin: "xrelease" });
    const datedUrl = "https://download.checklistbank.org/col/monthly/2026-09-25_xr_coldp.zip";
    const zip = Buffer.from("504b030400000000", "hex");
    const sequence = [], urls = [];
    let pointer = { activeRelease: "col-old", previousRelease: null };
    const service = createTaxonomyMaintenanceService({ taxonomyRoot: path.join(root, "taxonomy"), repoRoot: root,
      referenceService: { reset() {}, async status() {
        return { available: true, releaseId: pointer.activeRelease, boundedPrototype: false };
      } },
      discoverRelease: async () => ({ checkedAt: "2026-10-02T17:34:00Z", latest: release }),
      readPointer: async () => pointer, listReleases: async () => ["col-old"], diskBytes: async () => 20 * 1024 ** 3,
      downloadArchive: (options) => {
        sequence.push("download");
        return downloadCatalogueArchive({ ...options, fetchImpl: async (url) => {
          urls.push(String(url));
          return urls.length === 1 ? new Response(null, { status: 404 })
            : succeeds ? new Response(zip) : new Response(null, { status: 403 });
        } });
      },
      extractArchive: async ({ archivePath }) => {
        sequence.push("extract"); assert.deepEqual(await fs.readFile(archivePath), zip);
      },
      compareProjectSpecies: async () => {
        sequence.push("compare"); return { summary: { total: 0, exact: 0 }, results: [] };
      },
      activateRelease: async (_taxonomyRoot, releaseId) => {
        sequence.push("activate"); pointer = { activeRelease: releaseId, previousRelease: pointer.activeRelease };
      },
    });
    st.after(() => service.close());
    // Import/extraction are bounded doubles; the archive downloader and service
    // transition/confirmation/metadata/error paths are real, never live data.
    service.runImportChild = async ({ releasePath, archiveMetadataPath }) => {
      sequence.push("import");
      assert.equal(JSON.parse(await fs.readFile(releasePath, "utf8")).releaseId, release.releaseId);
      assert.equal(JSON.parse(await fs.readFile(archiveMetadataPath, "utf8")).downloadUrl, datedUrl);
      return { releaseId: release.releaseId };
    };
    const preview = await service.previewUpdate();
    assert.equal(preview.downloadRequired, true);
    assert.deepEqual(urls, [], "Die Vorschau lädt kein Archiv");
    await service.startUpdate({ token: preview.token });
    const final = await waitForTerminal(service);
    assert.deepEqual(urls, [release.exportUrl, datedUrl]);
    assert.equal(final.active, false);
    if (succeeds) {
      assert.equal(final.status, "completed");
      assert.deepEqual(sequence, ["download", "extract", "import", "compare", "activate"]);
      assert.equal(pointer.activeRelease, release.releaseId); assert.equal(pointer.previousRelease, "col-old");
    } else {
      assert.equal(final.status, "failed"); assert.equal(final.phase, "download"); assert.match(final.error, /HTTP 403/);
      assert.deepEqual(sequence, ["download"]); assert.deepEqual(pointer, { activeRelease: "col-old", previousRelease: null });
    }
  });
});

test("Aktualisierung braucht Vorschau und aktiviert erst nach dem Artenabgleich", async (context) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-maintenance-"));
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
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-maintenance-failure-"));
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

test("aktuelle CoL-Daten können unabhängig um Ergänzungsnamen aktualisiert werden", async (context) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-maintenance-supplements-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "species_list.json"),
    `${JSON.stringify([{
      german: "Stieglitz",
      genus: "Carduelis",
      species: "carduelis",
    }], null, 2)}\n`,
    "utf8",
  );
  const release = latestRelease();
  const sequence = [];
  const referenceService = {
    reset() {
      throw new Error("Die CoL-Referenz darf bei einem reinen Ergänzungslauf nicht neu geladen werden.");
    },
    async status() {
      return {
        available: true,
        releaseId: release.releaseId,
        boundedPrototype: false,
        source: release,
        supplements: {
          available: true,
          stale: true,
          entryCount: 1,
        },
      };
    },
    async requireStore() {
      return { name: "mock-store" };
    },
  };
  const supplementService = {
    async refreshKnown({ scientificNames, store, onProgress }) {
      sequence.push("supplements");
      assert.deepEqual(scientificNames, ["Carduelis carduelis"]);
      assert.equal(store.name, "mock-store");
      onProgress({
        current: 1,
        total: 1,
        message: "Ergänzungsquellen wurden geprüft",
      });
      return {
        targetCount: 1,
        imported: 2,
        refreshedTargets: 1,
        preservedTargets: 0,
        warnings: [],
        preservedPreviousCache: false,
      };
    },
  };
  const service = createTaxonomyMaintenanceService({
    taxonomyRoot: path.join(root, "taxonomy"),
    repoRoot: root,
    referenceService,
    supplementService,
    discoverRelease: async () => ({
      checkedAt: "2026-07-30T08:00:00.000Z",
      latest: release,
    }),
    listReleases: async () => [release.releaseId],
    readPointer: async () => ({
      activeRelease: release.releaseId,
      previousRelease: null,
    }),
    activateRelease: async () => {
      throw new Error("Ein reiner Ergänzungslauf darf CoL nicht neu aktivieren.");
    },
  });
  context.after(() => service.close());

  const preview = await service.previewUpdate();
  assert.equal(preview.hasWork, true);
  assert.equal(preview.updateCatalogue, false);
  assert.equal(preview.updateSupplements, true);
  assert.equal(preview.downloadRequired, false);

  await service.startUpdate({ token: preview.token });
  const completed = await waitForTerminal(service);
  assert.equal(completed.status, "completed");
  assert.equal(completed.updateCatalogue, false);
  assert.equal(completed.updateSupplements, true);
  assert.deepEqual(sequence, ["supplements"]);
  assert.match(completed.message, /Ergänzungsnamen wurden aktualisiert/);
});
