import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createTaxonomyMasterService,
  taxonomyMasterServiceInternals,
} from "./taxonomy-master-service.mjs";
import { taxonomyCorrectionsRevision } from "./taxonomy-master-candidate.mjs";

const NOW = new Date("2026-08-01T12:00:00.000Z");

async function createFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-master-service-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const speciesListPath = path.join(root, "species_list.json");
  const correctionsPath = path.join(root, "corrections.json");
  await fs.writeFile(speciesListPath, `${JSON.stringify([{
    german: "Leopard",
    englishName: "Leopard",
    genus: "Panthera",
    species: "pardus",
    slug: "pantherapardus",
  }], null, 2)}\n`, "utf8");
  await fs.writeFile(correctionsPath, `${JSON.stringify({ entries: [] }, null, 2)}\n`, "utf8");
  return { root, speciesListPath, correctionsPath };
}

function referenceStore() {
  return {
    status() {
      return {
        releaseId: "col-2026-07",
        importedAt: NOW.toISOString(),
        counts: { taxa: 4_700_000 },
        source: { url: "https://www.catalogueoflife.org/", issued: "2026-07-17" },
      };
    },
    findTaxonByScientificName(scientificName) {
      return scientificName === "Panthera pardus"
        ? { taxonId: "col-panthera-pardus", acceptedScientificName: scientificName, rank: "species" }
        : null;
    },
    taxon(taxonId) {
      return taxonId === "col-panthera-pardus"
        ? {
          source_id: taxonId,
          scientific_name: "Panthera pardus",
          rank: "species",
          kingdom: { scientificName: "Animalia" },
          hierarchy: [],
          germanNames: [{ name: "Leopard" }],
          englishNames: [{ name: "Leopard" }],
        }
        : null;
    },
  };
}

function lifecycle({ blocking = false } = {}) {
  return {
    candidate: { candidateId: "master-test" },
    active: null,
    previous: null,
    conflicts: blocking ? [{ conflict_id: "conflict-1" }] : [],
    blockingConflicts: blocking ? [{ conflict_id: "conflict-1" }] : [],
    canActivate: !blocking,
    canRollback: false,
  };
}

test("Masterstatus erkennt den Drift zwischen aktiver CoL-Referenz und Master-Provenienz", async (t) => {
  const fixture = await createFixture(t);
  let lifecycleSnapshot = {
    ...lifecycle(),
    candidate: null,
    active: {
      candidateId: "master-alt",
      sources: [{
        provider: "catalogue-of-life",
        providerVersion: "col-2026-07",
        releaseId: "col-2026-07",
      }],
    },
  };
  const service = createTaxonomyMasterService({
    taxonomyRoot: fixture.root,
    referenceService: { async requireStore() { return referenceStore(); } },
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    async readReferencePointer() {
      return { activeRelease: "col-2026-08" };
    },
    async inspectLifecycle() { return lifecycleSnapshot; },
  });

  let status = await service.status();
  assert.equal(status.reference.status, "stale");
  assert.equal(status.reference.activeRelease, "col-2026-08");
  assert.equal(status.reference.activeMasterRelease, "col-2026-07");
  assert.equal(status.reference.needsMasterRebuild, true);
  assert.equal(status.reference.candidateMatchesActiveReference, false);

  lifecycleSnapshot = {
    ...lifecycleSnapshot,
    candidate: {
      candidateId: "master-neu",
      sources: [{
        provider: "catalogue-of-life",
        providerVersion: "col-2026-08",
        releaseId: "col-2026-08",
      }],
    },
  };
  status = await service.status();
  assert.equal(status.reference.needsMasterRebuild, true);
  assert.equal(status.reference.candidateRelease, "col-2026-08");
  assert.equal(status.reference.candidateMatchesActiveReference, true);

  lifecycleSnapshot = {
    ...lifecycleSnapshot,
    candidate: null,
    active: null,
  };
  status = await service.status();
  assert.equal(status.reference.status, "stale");
  assert.equal(status.reference.activeMasterRelease, "");
  assert.equal(status.reference.needsMasterRebuild, true);

  lifecycleSnapshot = {
    ...lifecycleSnapshot,
    candidate: null,
    active: {
      ...lifecycleSnapshot.active,
      candidateId: "master-neu",
      sources: [{
        provider: "catalogue-of-life",
        providerVersion: "col-2026-08",
        releaseId: "col-2026-08",
      }],
    },
  };
  status = await service.status();
  assert.equal(status.reference.status, "current");
  assert.equal(status.reference.needsMasterRebuild, false);
  await service.close();
});

test("eigene Korrekturen bleiben bis zu einem passenden Masterkandidaten sichtbar offen", async (t) => {
  const fixture = await createFixture(t);
  const emptyRevision = taxonomyCorrectionsRevision([]);
  let lifecycleSnapshot = {
    ...lifecycle(),
    candidate: null,
    active: {
      candidateId: "master-active",
      inputRevisions: { corrections: emptyRevision },
      sources: [{ provider: "manual", recordCount: 0 }],
    },
  };
  const service = createTaxonomyMasterService({
    taxonomyRoot: fixture.root,
    referenceService: { async requireStore() { return referenceStore(); } },
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    async inspectLifecycle() { return lifecycleSnapshot; },
  });

  assert.equal((await service.status()).corrections.pending, false);
  const entries = [{
    scientificName: "Panthera pardus",
    rank: "species",
    kingdom: "Animalia",
    germanName: "Leopard",
    englishName: "Leopard",
    note: "Geprüfter Name",
  }];
  await fs.writeFile(
    fixture.correctionsPath,
    `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
    "utf8",
  );
  let status = await service.status();
  assert.equal(status.corrections.pending, true);
  assert.equal(status.corrections.candidateIncludesCurrent, false);

  lifecycleSnapshot = {
    ...lifecycleSnapshot,
    candidate: {
      candidateId: "master-candidate",
      inputRevisions: { corrections: taxonomyCorrectionsRevision(entries) },
    },
  };
  status = await service.status();
  assert.equal(status.corrections.pending, true);
  assert.equal(status.corrections.candidateIncludesCurrent, true);
  await service.close();
});

test("eigene Korrekturen werden über einen gemeinsamen schnellen Releasepfad aktiviert", async (t) => {
  const fixture = await createFixture(t);
  const entries = [{
    scientificName: "Panthera pardus",
    rank: "species",
    kingdom: "Animalia",
    germanName: "Leopard",
    englishName: "Leopard",
    note: "Geprüfter Name",
  }];
  await fs.writeFile(
    fixture.correctionsPath,
    `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
    "utf8",
  );
  const calls = [];
  const reference = {
    resetCount: 0,
    async requireStore() { return referenceStore(); },
    reset() { this.resetCount += 1; },
  };
  const service = createTaxonomyMasterService({
    taxonomyRoot: path.join(fixture.root, "taxonomy"),
    lightroomSearchRoot: path.join(fixture.root, "lightroom"),
    referenceService: reference,
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    now: () => NOW,
    async inspectLifecycle() {
      return {
        ...lifecycle(),
        candidate: null,
        active: {
          candidateId: "master-active",
          inputRevisions: { corrections: taxonomyCorrectionsRevision([]) },
        },
      };
    },
    async activateCorrections(options) {
      calls.push(options);
      return {
        release: { releaseId: "corrections-fixture", entries },
        pointer: { revision: taxonomyCorrectionsRevision(entries) },
      };
    },
  });

  assert.throws(() => service.applyCorrections(), /ausdrücklich bestätigt/);
  const started = await service.applyCorrections({ confirmed: true });
  assert.ok(["applying-corrections", "completed"].includes(started.status));
  await service.runPromise;
  const completed = await service.status();
  assert.equal(completed.status, "completed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].corrections[0].scientificName, "Panthera pardus");
  assert.equal(reference.resetCount, 1);
  await service.close();
});

test("passender bestehender Vollmaster erhält beim Start eine sichere Korrekturbaseline", async (t) => {
  const fixture = await createFixture(t);
  const entries = [{
    scientificName: "Panthera pardus",
    rank: "species",
    kingdom: "Animalia",
    germanName: "Leopard",
    englishName: "Leopard",
    note: "Geprüfter Name",
  }];
  await fs.writeFile(
    fixture.correctionsPath,
    `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
    "utf8",
  );
  let activations = 0;
  const reference = {
    resetCount: 0,
    async requireStore() { return referenceStore(); },
    reset() { this.resetCount += 1; },
  };
  const service = createTaxonomyMasterService({
    taxonomyRoot: path.join(fixture.root, "taxonomy"),
    lightroomSearchRoot: path.join(fixture.root, "lightroom"),
    referenceService: reference,
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    now: () => NOW,
    async inspectLifecycle() {
      return {
        ...lifecycle(),
        candidate: null,
        active: {
          candidateId: "master-active",
          inputRevisions: { corrections: taxonomyCorrectionsRevision(entries) },
        },
      };
    },
    async inspectLightroomPackages() {
      return {
        active: { packageId: "package-active", masterVersion: "master-active" },
        previous: null,
      };
    },
    async activateCorrections() {
      activations += 1;
      return {};
    },
  });

  assert.equal(await service.ensureCorrectionBaseline(), true);
  assert.equal(activations, 1);
  assert.equal(reference.resetCount, 1);
  await service.close();
});

test("breite Anbieter-Ausschnitte vermeiden bei unveränderter Referenz erneute CoL-Suchen", async () => {
  const searched = [];
  const loaded = [];
  const store = {
    status() {
      return {
        releaseId: "col-2026-07",
        importedAt: NOW.toISOString(),
        counts: { taxa: 4_700_000 },
        source: {},
      };
    },
    findTaxonByScientificName(scientificName) {
      searched.push(scientificName);
      return null;
    },
    taxon(taxonId) {
      loaded.push(String(taxonId));
      return {
        source_id: String(taxonId),
        scientific_name: "Panthera pardus",
        rank: "species",
        kingdom: { scientificName: "Animalia" },
        hierarchy: [],
        germanNames: [],
        englishNames: [],
      };
    },
  };
  const providerSlices = [{
    records: [
      {
        scientificName: "Panthera pardus",
        colTaxonId: "42",
        relevanceReasons: ["missing-name"],
      },
      {
        scientificName: "Sciurus vulgaris",
        colTaxonId: "",
        relevanceReasons: ["col-reference-gap"],
      },
    ],
  }];

  const records = await taxonomyMasterServiceInternals.collectColRecords(
    store,
    ["Panthera pardus", "Sciurus vulgaris", "Coracias caudatus"],
    () => {},
    { providerSlices },
  );

  assert.deepEqual(loaded, ["42"]);
  assert.deepEqual(searched, ["Coracias caudatus"]);
  assert.equal(records.length, 1);
});

test("bekannte Referenzlücken werden nach einem CoL-Wechsel erneut geprüft", async () => {
  const searched = [];
  const loaded = [];
  const store = {
    status() {
      return {
        releaseId: "col-2026-08",
        importedAt: NOW.toISOString(),
        counts: { taxa: 4_800_000 },
        source: {},
      };
    },
    findTaxonByScientificName(scientificName) {
      searched.push(scientificName);
      return scientificName === "Ciconia ciconia"
        ? { taxonId: "col-ciconia-ciconia", acceptedScientificName: scientificName, rank: "species" }
        : null;
    },
    taxon(taxonId) {
      loaded.push(String(taxonId));
      if (taxonId === "1022266") {
        return {
          source_id: "anderes-taxon",
          scientific_name: "Ciconia boyciana",
          rank: "species",
          kingdom: { scientificName: "Animalia" },
          hierarchy: [],
          germanNames: [],
          englishNames: [],
        };
      }
      return taxonId === "col-ciconia-ciconia"
        ? {
          source_id: taxonId,
          scientific_name: "Ciconia ciconia",
          rank: "species",
          kingdom: { scientificName: "Animalia" },
          hierarchy: [],
          germanNames: [{ name: "Weißstorch" }],
          englishNames: [{ name: "White Stork" }],
        }
        : null;
    },
  };
  const providerSlices = [{
    records: [{
      scientificName: "Ciconia ciconia",
      // Interne ID aus dem vorherigen CoL-Release. Diese darf im neuen
      // Release nicht als stabile Taxonkennung behandelt werden.
      colTaxonId: "1022266",
      relevanceReasons: ["col-reference-gap"],
    }],
  }];

  const records = await taxonomyMasterServiceInternals.collectColRecords(
    store,
    ["Ciconia ciconia"],
    () => {},
    { providerSlices, recheckKnownReferenceGaps: true },
  );

  assert.deepEqual(searched, ["Ciconia ciconia"]);
  assert.deepEqual(loaded, ["col-ciconia-ciconia"]);
  assert.equal(records.length, 1);
  assert.equal(records[0].scientificName, "Ciconia ciconia");
});

test("9.10 baut Anbieter-Ausschnitte fortschrittlich auf und wartet auf ausdrückliche Aktivierung", async (t) => {
  const fixture = await createFixture(t);
  const refreshCalls = [];
  const buildCalls = [];
  const reference = {
    resetCount: 0,
    async requireStore() { return referenceStore(); },
    reset() { this.resetCount += 1; },
  };
  const service = createTaxonomyMasterService({
    taxonomyRoot: fixture.root,
    referenceService: reference,
    supplementService: {
      async refreshKnown(options) {
        refreshCalls.push(options.scientificNames);
        options.onProgress({ current: 1, total: 1, message: "Anbieter geprüft" });
        return { warnings: [] };
      },
    },
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    now: () => NOW,
    async buildCandidate(options) {
      buildCalls.push(options);
      return { candidateId: "master-test", summary: { taxa: 1 } };
    },
    async inspectLifecycle() { return lifecycle(); },
    async activateCandidate() { return lifecycle(); },
  });

  const startStatusPromise = service.startBuild({ refreshProviders: true });
  const runPromise = service.runPromise;
  assert.throws(
    () => service.startBuild({ refreshProviders: false }),
    /bereits eine Datenbank-, Pipeline-, Backup- oder Asset-Aktion/,
  );
  const started = await startStatusPromise;
  assert.equal(started.active, true);
  await runPromise;
  const ready = await service.status();
  assert.equal(ready.status, "ready");
  assert.equal(ready.progressPercent, 100);
  assert.deepEqual(refreshCalls, [["Panthera pardus"]]);
  assert.equal(buildCalls.length, 1);
  assert.equal(buildCalls[0].projectTaxa[0].projectSlug, "pantherapardus");
  assert.equal(reference.resetCount, 0);

  const activationStarted = await service.activate({ confirmed: true });
  assert.ok(["activating", "completed"].includes(activationStarted.status));
  await service.runPromise;
  const activated = await service.status();
  assert.equal(activated.status, "completed");
  assert.equal(reference.resetCount, 1);
  await service.close();
});

test("9.10 bewahrt bei einem fehlgeschlagenen Kandidaten die aktive Referenz", async (t) => {
  const fixture = await createFixture(t);
  const reference = {
    resetCount: 0,
    async requireStore() { return referenceStore(); },
    reset() { this.resetCount += 1; },
  };
  const service = createTaxonomyMasterService({
    taxonomyRoot: fixture.root,
    referenceService: reference,
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    now: () => NOW,
    async buildCandidate() { throw new Error("simulierter Importabbruch"); },
    async inspectLifecycle() {
      return {
        ...lifecycle(),
        active: { candidateId: "master-bisher" },
        candidate: null,
        canActivate: false,
      };
    },
  });

  service.startBuild({ refreshProviders: false });
  await service.runPromise;
  const failed = await service.status();
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /simulierter Importabbruch/);
  assert.equal(failed.lifecycle.active.candidateId, "master-bisher");
  assert.equal(reference.resetCount, 0);
  await service.close();
});

test("9.10 verwendet für echte Updates den zentralen Quellenkoordinator", async (t) => {
  const fixture = await createFixture(t);
  const refreshCalls = [];
  const service = createTaxonomyMasterService({
    taxonomyRoot: fixture.root,
    referenceService: {
      async requireStore() { return referenceStore(); },
      reset() {},
    },
    supplementService: {
      async selectedTaxa() {
        return [{ scientificName: "Sciurus vulgaris" }];
      },
    },
    providerRefreshService: {
      async refresh(options) {
        refreshCalls.push(options);
        options.onProgress({ current: 100, total: 100, message: "Quellen lokal aktualisiert" });
        return { warnings: [] };
      },
      async close() {},
    },
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    now: () => NOW,
    async buildCandidate() { return { candidateId: "master-provider-test" }; },
    async inspectLifecycle() { return lifecycle(); },
  });

  service.startBuild({
    refreshProviders: true,
    inaturalistArchivePath: "D:/cache/inaturalist.zip",
  });
  await service.runPromise;

  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].projectTaxa[0].scientificName, "Panthera pardus");
  assert.equal(refreshCalls[0].researchedTaxa[0].scientificName, "Sciurus vulgaris");
  assert.equal(refreshCalls[0].inaturalistArchivePath, "D:/cache/inaturalist.zip");
  assert.equal((await service.status()).status, "ready");
  await service.close();
});

test("9.10 aktiviert und rollt ausschließlich nach Bestätigung zurück", async (t) => {
  const fixture = await createFixture(t);
  const calls = [];
  const events = [];
  const reference = {
    resetCount: 0,
    async requireStore() { return referenceStore(); },
    reset() {
      this.resetCount += 1;
      events.push("reset");
    },
  };
  const service = createTaxonomyMasterService({
    taxonomyRoot: fixture.root,
    referenceService: reference,
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    now: () => NOW,
    async inspectLifecycle() { return lifecycle(); },
    async activateCandidate(_root, options) {
      calls.push(["activate", options.confirmed]);
      events.push(`activate:${options.confirmed}`);
      if (!options.confirmed) throw new Error("Bestätigung fehlt");
      return lifecycle();
    },
    async rollbackCandidate(_root, options) {
      calls.push(["rollback", options.confirmed]);
      events.push(`rollback:${options.confirmed}`);
      if (!options.confirmed) throw new Error("Bestätigung fehlt");
      return lifecycle();
    },
  });

  assert.throws(() => service.activate(), /ausdrücklich bestätigt/);
  await service.activate({ confirmed: true });
  await service.runPromise;
  const activated = await service.status();
  assert.equal(activated.status, "completed");
  await service.rollback({ confirmed: true });
  await service.runPromise;
  const rolledBack = await service.status();
  assert.equal(rolledBack.status, "completed");
  assert.deepEqual(calls, [
    ["activate", true],
    ["rollback", true],
  ]);
  assert.equal(reference.resetCount, 2);
  assert.deepEqual(events, [
    "reset",
    "activate:true",
    "reset",
    "rollback:true",
  ]);
  await service.close();
});

test("Masteraktivierung baut das passende Lightroom-Suchpaket mit sichtbarem Fortschritt", async (t) => {
  const fixture = await createFixture(t);
  let activeMaster = "master-bisher";
  let activePackage = { packageId: "lightroom-bisher", masterVersion: "master-bisher" };
  const progress = [];
  const service = createTaxonomyMasterService({
    taxonomyRoot: fixture.root,
    referenceService: {
      async requireStore() { return referenceStore(); },
      reset() {},
    },
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    now: () => NOW,
    async inspectLifecycle() {
      return {
        ...lifecycle(),
        candidate: null,
        active: { candidateId: activeMaster },
      };
    },
    async activateCandidate() {
      activeMaster = "master-neu";
    },
    async inspectLightroomPackages() {
      return { active: activePackage, previous: null };
    },
    async rebuildLightroomPackage({ onProgress }) {
      onProgress({ phase: "copy", percent: 42, message: "Taxa werden exportiert." });
      progress.push(service.state.progressPhase, service.state.progressPercent);
      activePackage = { packageId: "lightroom-neu", masterVersion: "master-neu" };
      return { active: activePackage };
    },
  });

  const started = await service.activate({ confirmed: true });
  assert.ok(["activating", "syncing-lightroom", "completed"].includes(started.status));
  await service.runPromise;
  const completed = await service.status();

  assert.equal(completed.status, "completed");
  assert.equal(completed.lightroomPackage.status, "current");
  assert.equal(completed.lightroomPackage.active.packageId, "lightroom-neu");
  assert.deepEqual(progress, ["Lightroom-Suchpaket · Taxonomieexport", 42]);
  await service.close();
});

test("fehlgeschlagener Paketneubau bleibt als Teilerfolg gezielt wiederholbar", async (t) => {
  const fixture = await createFixture(t);
  let activeMaster = "master-bisher";
  let activePackage = { packageId: "lightroom-bisher", masterVersion: "master-bisher" };
  const service = createTaxonomyMasterService({
    taxonomyRoot: fixture.root,
    referenceService: {
      async requireStore() { return referenceStore(); },
      reset() {},
    },
    speciesListPath: fixture.speciesListPath,
    correctionsPath: fixture.correctionsPath,
    now: () => NOW,
    async inspectLifecycle() {
      return {
        ...lifecycle(),
        candidate: null,
        active: { candidateId: activeMaster },
      };
    },
    async activateCandidate() {
      activeMaster = "master-neu";
    },
    async inspectLightroomPackages() {
      return { active: activePackage, previous: null };
    },
    async rebuildLightroomPackage() {
      throw new Error("simulierter Paketfehler");
    },
  });

  await service.activate({ confirmed: true });
  await service.runPromise;
  const partial = await service.status();
  assert.equal(partial.status, "partial");
  assert.equal(partial.lightroomPackage.status, "stale");
  assert.equal(partial.lightroomPackage.needsRebuild, true);
  assert.equal(partial.lightroomPackage.active.packageId, "lightroom-bisher");
  assert.match(partial.message, /bisherige Suchpaket bleibt aktiv/);

  service.rebuildLightroomPackage = async () => {
    activePackage = { packageId: "lightroom-neu", masterVersion: "master-neu" };
    return { active: activePackage };
  };
  await service.syncLightroomPackage();
  await service.runPromise;
  const retried = await service.status();
  assert.equal(retried.status, "completed");
  assert.equal(retried.lightroomPackage.status, "current");
  assert.equal(retried.lightroomPackage.active.packageId, "lightroom-neu");
  await service.close();
});
