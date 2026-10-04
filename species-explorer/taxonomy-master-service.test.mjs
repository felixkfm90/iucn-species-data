import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  createTaxonomyMasterService,
  taxonomyMasterServiceInternals,
} from "./taxonomy-master-service.mjs";
import { taxonomyCorrectionsRevision, readTaxonomyMasterManifest } from "./taxonomy-master-candidate.mjs";
import { taxonomyBaselineSetupStatus, assertBaselineSetup } from "./taxonomy-baseline-setup.mjs";

const NOW = new Date("2026-08-01T12:00:00.000Z");

test("Masterfortschritt erhält Messmengen und verwirft sie bei einer unbestimmten Folgephase", async (t) => {
  const f = await createFixture(t);
  const service = createTaxonomyMasterService({ taxonomyRoot: f.root,
    speciesListPath: f.speciesListPath, correctionsPath: f.correctionsPath, referenceService: { reset() {} } });
  service.updateProgress({ phase: "Masterdatenbank schreiben", current: 1200, total: 3000, percent: 74 });
  assert.equal(service.state.progressCurrent, 1200);
  assert.equal(service.state.progressTotal, 3000);
  service.updateProgress({ phase: "Prüfung", percent: 95 });
  assert.equal(service.state.progressCurrent, null);
  assert.equal(service.state.progressTotal, null);
  await service.close();
});

const baselineStatus = () => ({ lifecycle: { active: { candidateId: "old-master", schemaVersion: 3 } },
  lightroomPackage: { status: "current", active: { packageId: "old-package", masterVersion: "old-master" } },
  reference: { status: "current", activeRelease: "col-2026-07" }, corrections: { currentRevision: "names-1" } });

test("Grundlagenangebot verwendet nur vorhandene Manifestangaben; Kandidaten, Fehler und Aufträge haben Vorrang", () => {
  assert.equal(taxonomyBaselineSetupStatus().needed, false);
  assert.equal(taxonomyBaselineSetupStatus({ lightroomPackage: null }).needed, false);
  const old = baselineStatus();
  const offered = taxonomyBaselineSetupStatus(old);
  assert.equal(offered.needed, true); assert.equal(offered.canStart, true);
  assert.equal(offered.check, "manifest-only");
  assertBaselineSetup({ baselineSetup: offered }, offered.revision);
  for (const change of [
    { lifecycle: { ...old.lifecycle, candidate: { candidateId: "candidate" } } },
    { lifecycle: { ...old.lifecycle, error: "Lesefehler" } },
    { reference: { status: "stale" } }, { lightroomPackage: null },
    { lightroomPackage: { status: "error" } },
    ...["paused", "interrupted", "failed", "stale", "building"].map((status) => ({ buildJob: { available: true, status } })),
  ]) {
    const blocked = taxonomyBaselineSetupStatus({ ...old, ...change });
    assert.equal(blocked.canStart, false);
    assert.throws(() => assertBaselineSetup({ baselineSetup: blocked }, blocked.revision), { statusCode: 409 });
  }
  assert.equal(taxonomyBaselineSetupStatus({ ...old, active: true }).canStart, false);
  const changed = taxonomyBaselineSetupStatus({ ...old, corrections: { currentRevision: "names-2" } });
  assert.throws(() => assertBaselineSetup({ baselineSetup: changed }, offered.revision), { statusCode: 409 });
  const present = structuredClone(old);
  present.lifecycle.active.buildInputs = { available: true, file: "build-inputs.sqlite", fingerprint: "a".repeat(64), masterSha256: "b".repeat(64) };
  assert.equal(taxonomyBaselineSetupStatus(present).needed, true, "Paketgrundlage noch nicht vorhanden");
  present.lightroomPackage.active.exportContract = "c".repeat(64);
  present.lightroomPackage.active.sourceChecksum = `sha256:${"d".repeat(64)}`;
  assert.equal(taxonomyBaselineSetupStatus(present).needed, false);
});

test("Lokaler Grundlagenstart braucht frische Bestätigung, lädt keine Anbieter und aktiviert serverseitig nichts", async (t) => {
  const f = await createFixture(t);
  let built = 0, candidate = null, changed = false, busy = false;
  const active = { candidateId: "old-master", sources: [{ provider: "catalogue-of-life", providerVersion: "col-2026-07" }] };
  const service = createTaxonomyMasterService({ taxonomyRoot: f.root, ...f,
    referenceService: { requireStore: async () => referenceStore() },
    readReferencePointer: async () => ({ activeRelease: "col-2026-07" }),
    inspectLifecycle: async () => ({ active, candidate }), isProjectBusy: () => busy,
    inspectLightroomPackages: async () => ({ active: { packageId: changed ? "other" : "old-package", masterVersion: "old-master" } }),
    providerRefreshService: { refresh() { throw new Error("Kein Anbieterdownload erlaubt"); }, close() {} },
    supplementService: { selectedTaxa: async () => [], refreshKnown() { throw new Error("Keine Ergänzungsdownloads erlaubt"); } },
    activateCandidate() { throw new Error("Keine serverseitige automatische Aktivierung erlaubt"); },
    buildCandidate: async (options) => {
      built += 1;
      for await (const record of options.colRecords) assert.ok(record);
      candidate = { candidateId: "new-master" }; return candidate;
    }, now: () => NOW,
  });
  t.after(() => service.close());
  const initial = await service.status();
  assert.equal(initial.baselineSetup.canStart, true);
  assert.equal(built, 0);
  await assert.rejects(service.startBaselineBuild(), { statusCode: 400 });
  await assert.rejects(service.startBaselineBuild({ confirmed: true, revision: "wrong" }), { statusCode: 409 });
  changed = true;
  await assert.rejects(service.startBaselineBuild({ confirmed: true, revision: initial.baselineSetup.revision }), { statusCode: 409 });
  changed = false; busy = true;
  await assert.rejects(service.startBaselineBuild({ confirmed: true, revision: initial.baselineSetup.revision }), { statusCode: 409 });
  busy = false;
  const originalPresence = service.withVersionPresence;
  service.withVersionPresence = async (operation) => { changed = true; return originalPresence(operation); };
  await service.startBaselineBuild({ confirmed: true, revision: initial.baselineSetup.revision });
  await service.runPromise;
  assert.equal(built, 0, "Zweite Prüfung unter Sperre stoppt zwischenzeitliche Paketänderung");
  assert.equal((await service.status()).status, "failed");
  service.withVersionPresence = originalPresence; changed = false;
  await service.startBaselineBuild({ confirmed: true, revision: initial.baselineSetup.revision, refreshProviders: true });
  await assert.rejects(service.startBaselineBuild({ confirmed: true, revision: initial.baselineSetup.revision }), { statusCode: 409 });
  await service.runPromise;
  const ready = await service.status();
  assert.equal(ready.status, "ready", ready.error);
  assert.equal(built, 1);
  assert.equal(ready.lifecycle.active.candidateId, "old-master");
  assert.equal(ready.baselineSetup.canStart, false, "Kandidat muss erst übernommen werden");
  await assert.rejects(service.startBaselineBuild({ confirmed: true, revision: initial.baselineSetup.revision }), { statusCode: 409 });
});

test("Update-Eingang erhält Anbieterstandard und bindet Namenspräferenz an ihre Masteridentität", () => {
  const entry = { scientificName: "Ciconia ciconia", germanNameMode: "provider",
    namePreference: { masterTaxonId: "old-id", previousGermanName: "irrelevant for build" } };
  const [normalized] = taxonomyMasterServiceInternals.correctionsFromDocument({ entries: [entry] });
  assert.equal(normalized.germanNameMode, "provider");
  assert.equal(normalized.namePreference.masterTaxonId, "old-id");
  assert.notEqual(taxonomyCorrectionsRevision([normalized]), taxonomyCorrectionsRevision([
    { ...normalized, namePreference: { masterTaxonId: "new-id" } },
  ]));
});

async function createFixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-master-service-"));
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

test("Explorer-Vollaufbau schreibt über die echte Kandidatenanbindung einen belegten Eingangsstand", async (t) => {
  const fixture = await createFixture(t);
  const service = createTaxonomyMasterService({ taxonomyRoot: fixture.root,
    referenceService: { async requireStore() { return referenceStore(); } },
    speciesListPath: fixture.speciesListPath, correctionsPath: fixture.correctionsPath, now: () => NOW });
  try {
    await service.startBuild({ refreshProviders: false });
    await service.runPromise;
    const status = await service.status();
    assert.equal(status.status, "ready", status.error);
    const manifest = await readTaxonomyMasterManifest(fixture.root, "staging");
    assert.equal(manifest.buildInputs.available, true);
    assert.equal(manifest.buildInputs.buildMode, "full");
    // The source has millions of taxa, but the completed selection contains one.
    assert.equal(manifest.buildInputs.recordCount, 1);
    assert.equal(manifest.summary.taxa, 1);
    assert.equal(await readTaxonomyMasterManifest(fixture.root, "active"), null);
  } finally { await service.close(); }
});

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
