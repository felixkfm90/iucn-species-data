import { registerFixtureCleanup } from "./server-test-fixtures.mjs";
import assert from "node:assert/strict";
import fs, { existsSync } from "node:fs";
import fsPromises from "node:fs/promises";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test from "node:test";

import {
  createExplorerServer as createProtectedExplorerServer,
  isExplorerAlreadyReachable,
} from "./server.mjs";
import { buildExplorerModel } from "./explorer-model.mjs";
import { TaxonomyMaintenanceService } from "./taxonomy-maintenance-service.mjs";
import { TaxonomyMasterService } from "./taxonomy-master-service.mjs";
import {
  inspectJpeg,
  inspectMp3,
  inspectPng,
  inspectWebp,
} from "./media-assets.mjs";
import {
  createEditableFixture,
  createTestJpeg,
  createTestMp3,
  createTestPng,
  createTestWebp,
} from "./server-test-fixtures.mjs";
import { buildPipelinePlan } from "../scripts/pipeline-selection.mjs";
import { buildCleanupPlan, runCleanup, runSpeciesCleanup } from "../scripts/species-cleanup.mjs";
import {
  PORTRAIT_STANDARD,
  buildPortraitPrompt,
  portraitPromptSha256,
} from "../scripts/portrait-generator.mjs";
import {
  getExplorerPipelineStatus,
  isPipelineBlockingShutdown,
  startManagedExplorerServer,
  stopManagedExplorerServer,
} from "./desktop/server-lifecycle.mjs";
await import("./public/filter.js");

const createExplorerServer = (options = {}) => createProtectedExplorerServer({
  ...options,
  sessionProtection: false,
});
function requestStatusWithHost(baseUrl, pathname, hostHeader) {
  const target = new URL(pathname, baseUrl);
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "GET",
      headers: { Host: hostHeader },
    }, (response) => {
      response.resume();
      response.on("end", () => resolveRequest(response.statusCode));
    });
    request.on("error", rejectRequest);
    request.end();
  });
}



test("Bearbeiten braucht Vorschau, validiert und legt vor dem Speichern ein Backup an", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  const backupDir = join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  for (let index = 0; index < 22; index += 1) {
    const seconds = String(index).padStart(2, "0");
    await writeFile(
      join(backupDir, `species_list-20260618T1200${seconds}Z-Test-${String(index).padStart(8, "0")}.json`),
      "{}\n",
    );
  }
  await writeFile(join(backupDir, "not-a-managed-backup.txt"), "behalten\n");
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  cleanupFixture(app);
  const baseUrl = `http://${app.host}:${address.port}`;
  const speciesListPath = join(repoRoot, "species_list.json");
  const beforeText = await readFile(speciesListPath, "utf8");

  const invalidPreview = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { size: "", weight: "ca. 81-111 g", lifeExpectancy: "ca. 4 Jahre" },
    }),
  });
  assert.equal(invalidPreview.status, 400);
  assert.match((await invalidPreview.json()).details.join(" "), /Größe/);

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: {
        size: "ca. 24-30 cm",
        weight: "ca. 81-111 g",
        lifeExpectancy: "ca. 4 Jahre",
      },
    }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.changes.length, 3);
  assert.ok(preview.token);
  assert.equal(await readFile(speciesListPath, "utf8"), beforeText);

  const invalidSave = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "ungueltig" }),
  });
  assert.equal(invalidSave.status, 409);

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(
    saveResponse.status,
    200,
    saveResponse.status === 200 ? "" : await saveResponse.clone().text(),
  );
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, true);
  assert.match(saved.backup, /^species-explorer\/backups\/species_list-/);
  assert.equal(saved.backupRetention.kept, 5);
  assert.equal(saved.backupRetention.removed, 18);
  assert.equal(saved.backupCleanupWarning, "");

  const afterList = JSON.parse(await readFile(speciesListPath, "utf8"));
  assert.equal(afterList[0].size, "ca. 24-30 cm");
  assert.equal(afterList[0].weight, "ca. 81-111 g");
  assert.equal(afterList[0].life_expectancy, "ca. 4 Jahre");
  assert.equal(
    await readFile(join(repoRoot, ...saved.backup.split("/")), "utf8"),
    beforeText,
  );
  const backupEntries = await readdir(backupDir);
  assert.equal(
    backupEntries.filter((name) => /^species_list-.*\.json$/.test(name)).length,
    5,
  );
  assert.ok(backupEntries.includes("not-a-managed-backup.txt"));

  const reusedSave = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(reusedSave.status, 409);

  const validation = await (await fetch(`${baseUrl}/api/validation`)).json();
  assert.equal(validation.status, "issues");
  assert.equal(validation.data.mismatchSpeciesCount, 1);
});

test("Ältere Artenlistenstände werden über Vorschau artweise zurückgeholt und veraltete Bestätigungen verweigert", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  const listPath = join(repoRoot, "species_list.json");
  const dataPath = join(repoRoot, "speciesData.json");
  const input = JSON.parse(await readFile(listPath, "utf8"));
  const generated = JSON.parse(await readFile(dataPath, "utf8"));
  input.push({ ...input[0], german: "Drossel", genus: "Turdus", species: "philomelos", english: "Song Thrush" });
  generated.push({ ...generated[0], URLSlug: "turdusphilomelos", "Deutscher Name": "Drossel", "Wissenschaftlicher Name": "Turdus philomelos", "Englischer Name": "Song Thrush", Species: "philomelos" });
  await writeFile(listPath, JSON.stringify(input));
  await writeFile(dataPath, JSON.stringify(generated));
  const backupDir = join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  const older = structuredClone(input);
  older[0].english = "Blackbird (earlier)";
  older[0].weight = "ca. 70-100 g";
  older[1].english = "Old foreign species value";
  const backupId = "species_list-20261008T010101Z-Amsel-1234abcd.json";
  const selectedPath = join(backupDir, backupId);
  await writeFile(selectedPath, JSON.stringify(older));
  const mediaPath = join(repoRoot, "species-assets", "Amsel", "sound.mp3");
  const mediaBefore = await readFile(mediaPath);
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  cleanupFixture(app);
  const baseUrl = `http://${app.host}:${address.port}`;
  const api = `${baseUrl}/api/species/turdusmerula/backups`;
  const post = (action, payload) => fetch(`${api}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const listResponse = await fetch(api);
  assert.equal(listResponse.status, 200);
  const history = await listResponse.json();
  assert.equal(history.species.id, "turdusmerula");
  assert.equal(history.backups.find((entry) => entry.backupId === backupId)?.available, true);
  const beforePreview = await readFile(listPath, "utf8");
  const previewResponse = await post("preview", { kind: "species", backupId });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.ok(preview.token);
  assert.equal(await readFile(listPath, "utf8"), beforePreview);
  assert.equal((await post("restore", { token: "invalid" })).status, 409);
  const restored = await post("restore", { token: preview.token });
  assert.equal(restored.status, 200, restored.status === 200 ? "" : await restored.clone().text());
  const current = JSON.parse(await readFile(listPath, "utf8"));
  const currentGenerated = JSON.parse(await readFile(dataPath, "utf8"));
  assert.equal(current[0].english, "Blackbird (earlier)");
  assert.equal(current[0].weight, "ca. 70-100 g");
  assert.deepEqual(current[1], input[1]);
  assert.equal(currentGenerated[0]["Englischer Name"], "Blackbird (earlier)");
  assert.deepEqual(currentGenerated[1], generated[1]);
  assert.deepEqual(await readFile(mediaPath), mediaBefore);
  assert.equal((await post("restore", { token: preview.token })).status, 409);
  older[0].english = "Another old value";
  await writeFile(selectedPath, JSON.stringify(older));
  const freshResponse = await post("preview", { kind: "species", backupId });
  assert.equal(freshResponse.status, 200);
  const fresh = await freshResponse.json();
  const independentlyChanged = JSON.parse(await readFile(listPath, "utf8"));
  independentlyChanged[1].english = "Newer foreign species value";
  await writeFile(listPath, JSON.stringify(independentlyChanged));
  const staleResponse = await post("restore", { token: fresh.token });
  assert.equal(staleResponse.status, 409);
  assert.deepEqual(JSON.parse(await readFile(listPath, "utf8")), independentlyChanged);
  const boundResponse = await post("preview", { kind: "species", backupId });
  assert.equal(boundResponse.status, 200);
  const bound = await boundResponse.json();
  await writeFile(selectedPath, JSON.stringify({ unexpected: "changed backup" }));
  assert.equal((await post("restore", { token: bound.token })).status, 409);
  assert.deepEqual(JSON.parse(await readFile(listPath, "utf8")), independentlyChanged);
});

test("Historische Wiederherstellung und Quellen-/Masteraktionen sperren sich in beiden Richtungen", { timeout: 15000 }, async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  const listPath = join(repoRoot, "species_list.json");
  const sourceText = await readFile(listPath, "utf8");
  const older = JSON.parse(sourceText);
  older[0].english = "Earlier fixture blackbird";
  const backupDir = join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  const backupId = "species_list-20261001T100000Z-Amsel-aabbccdd.json";
  await writeFile(join(backupDir, backupId), JSON.stringify(older));
  const app = await createExplorerServer({ repoRoot, port: 0 });
  cleanupFixture(app);
  const address = await app.listen();
  const baseUrl = `http://${app.host}:${address.port}`;
  const post = (pathname, payload = {}) => fetch(`${baseUrl}${pathname}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const prefix = "/api/species/turdusmerula/backups";
  const previewResponse = await post(`${prefix}/preview`, { kind: "species", backupId });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  const scanEntered = Promise.withResolvers();
  const releaseScan = Promise.withResolvers();
  const originalReaddir = fsPromises.readdir;
  const originalMasterStart = TaxonomyMasterService.prototype.startBuild;
  const originalSourceStart = TaxonomyMaintenanceService.prototype.startUpdate;
  const started = [];
  const services = {};
  let holdScan = true;
  let restoring;
  try {
    // Hold only this fixture's ownership scan after the server acquires its
    // mutation lock. The actual restore and its data writes are unchanged.
    fsPromises.readdir = async (filename, ...options) => {
      if (holdScan && filename === join(repoRoot, "species-explorer", "creation-sessions")) {
        holdScan = false;
        scanEntered.resolve();
        await releaseScan.promise;
      }
      return originalReaddir(filename, ...options);
    };
    syncBuiltinESMExports();
    // Retain the real readiness checks, but never launch a download or build.
    TaxonomyMasterService.prototype.startBuild = function fixtureMasterStart() {
      services.master = this;
      this.assertAvailable();
      started.push("master");
      return { fixtureOnly: true };
    };
    TaxonomyMaintenanceService.prototype.startUpdate = async function fixtureSourceStart() {
      services.source = this;
      this.assertOpen();
      this.assertProjectReady();
      started.push("source");
      return { fixtureOnly: true };
    };
    restoring = post(`${prefix}/restore`, { token: preview.token });
    await scanEntered.promise;
    const sourceDuring = await post("/api/taxonomy/update/start", { token: "fixture-only" });
    const masterDuring = await post("/api/taxonomy/master/build", { refreshProviders: false });
    const sourceError = await sourceDuring.json();
    const masterError = await masterDuring.json();
    assert.deepEqual({ source: sourceDuring.status, master: masterDuring.status }, { source: 409, master: 409 });
    assert.match(sourceError.error, /andere Datenbank-Aktion/);
    assert.match(masterError.error, /bereits eine Datenbank/);
    assert.deepEqual(started, [], "Kein anderer Dienst darf während der Restoremutation starten");
    assert.equal(await readFile(listPath, "utf8"), sourceText, "Die angehaltene Wiederherstellung hat noch nicht geschrieben");
    releaseScan.resolve();
    assert.equal((await restoring).status, 200);
    assert.equal(JSON.parse(await readFile(listPath, "utf8"))[0].english, older[0].english);
    // The completed restoration releases its lock rather than disabling these
    // routes. Both benign service probes can now reach their post-guard work.
    assert.equal((await post("/api/taxonomy/update/start", { token: "fixture-only" })).status, 200);
    assert.equal((await post("/api/taxonomy/master/build", { refreshProviders: false })).status, 200);
    assert.deepEqual(started, ["source", "master"]);
    older[0].english = "Another earlier fixture value";
    await writeFile(join(backupDir, backupId), JSON.stringify(older));
    for (const [name, status] of [["source", "downloading"], ["master", "building"]]) {
      const response = await post(`${prefix}/preview`, { kind: "species", backupId });
      assert.equal(response.status, 200);
      const plan = await response.json();
      const previousStatus = services[name].state.status;
      services[name].state.status = status;
      try {
        const before = await readFile(listPath, "utf8");
        const refused = await post(`${prefix}/restore`, { token: plan.token });
        assert.equal(refused.status, 409, `${name} muss den Restore verhindern`);
        assert.match((await refused.json()).error, /laufende Speicherung, Datenaktualisierung/);
        assert.equal(await readFile(listPath, "utf8"), before);
      } finally { services[name].state.status = previousStatus; }
    }
  } finally {
    releaseScan.resolve();
    if (restoring) await restoring;
    fsPromises.readdir = originalReaddir;
    syncBuiltinESMExports();
    TaxonomyMasterService.prototype.startBuild = originalMasterStart;
    TaxonomyMaintenanceService.prototype.startUpdate = originalSourceStart;
  }
});

test("Taxonomie kann kontrolliert geändert und auf automatische Werte zurückgesetzt werden", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  const backupDir = join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  for (let day = 1; day <= 8; day += 1) {
    await writeFile(join(backupDir, `taxonomy-2026070${day}T010101Z-Amsel-1234abcd.json`), "{}\n");
  }
  await writeFile(join(backupDir, "taxonomy-own-note.json"), "behalten\n");
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  cleanupFixture(app);
  const baseUrl = `http://${app.host}:${address.port}`;
  const fields = {
    Kingdom: "Animalia",
    Phylum: "Chordata",
    Subphylum: "Vertebrata",
    Class: "Aves",
    Order: "Passeriformes",
    Family: "Drosselartige",
  };

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/taxonomy/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, reason: "Geprüfte taxonomische Fachquelle" }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.ok(preview.changes.some((change) => change.key === "Subphylum"));
  assert.ok(preview.changes.some((change) => change.key === "Family"));

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/taxonomy/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.restoredAutomatic, false);
  assert.match(saved.backup, /^species-explorer\/backups\/taxonomy-/);
  assert.deepEqual(saved.backupRetention, { kept: 5, removed: 4 });
  assert.equal(await readFile(join(backupDir, "taxonomy-own-note.json"), "utf8"), "behalten\n");

  const editedData = JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8"));
  assert.equal(editedData[0].Subphylum, "Vertebrata");
  assert.equal(editedData[0].Family, "Drosselartige");
  const editedRegistry = JSON.parse(
    await readFile(join(repoRoot, "species-taxonomy-overrides.json"), "utf8"),
  );
  assert.equal(editedRegistry.species.turdusmerula.fields.Family, "Drosselartige");
  assert.equal(editedRegistry.species.turdusmerula.automaticFields.Family, "Turdidae");
  const editedSpecies = await (await fetch(`${baseUrl}/api/species`)).json();
  assert.equal(editedSpecies[0].taxonomy.manuallyEdited, true);
  assert.equal(editedSpecies[0].taxonomy.family, "Drosselartige");

  const restorePreviewResponse = await fetch(
    `${baseUrl}/api/species/turdusmerula/taxonomy/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restoreAutomatic: true }),
    },
  );
  assert.equal(restorePreviewResponse.status, 200);
  const restorePreview = await restorePreviewResponse.json();
  assert.equal(restorePreview.restoreAutomatic, true);
  const restoreResponse = await fetch(`${baseUrl}/api/species/turdusmerula/taxonomy/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: restorePreview.token }),
  });
  assert.equal(restoreResponse.status, 200);
  assert.equal((await restoreResponse.json()).restoredAutomatic, true);

  const restoredData = JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8"));
  assert.equal(Object.hasOwn(restoredData[0], "Subphylum"), false);
  assert.equal(restoredData[0].Family, "Turdidae");
  const restoredRegistry = JSON.parse(
    await readFile(join(repoRoot, "species-taxonomy-overrides.json"), "utf8"),
  );
  assert.equal(restoredRegistry.species.turdusmerula, undefined);
});

test("Deutscher Artname kann inklusive SafeName, Assetordner und Pflegeeinträgen umbenannt werden", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  const assetDir = join(repoRoot, "species-assets", "Amsel");
  await Promise.all([
    writeFile(join(repoRoot, "lastSavedAssessmentId.json"), `${JSON.stringify({ Amsel: 264548442 }, null, 2)}\n`),
    writeFile(
      join(repoRoot, "species-assets-overrides.json"),
      `${JSON.stringify({
        version: 1,
        assets: {
          Amsel: {
            map: {
              manual: true,
              germanName: "Amsel",
              reason: "Testkarte",
              source: "https://example.test/map.jpg",
            },
            sound: {
              manual: false,
              rejectedSources: [{ key: "xeno-canto:123", source: "xeno-canto" }],
            },
          },
        },
      }, null, 2)}\n`,
    ),
    writeFile(
      join(repoRoot, "docs", "manual-map-overrides.md"),
      [
        "# Manuell gepflegte Karten",
        "",
        "Stand: 2026-06-19",
        "",
        "Aktuell sind 1 Karte als manuell gepflegt dokumentiert.",
        "",
        "| Art | SafeName | Datei | Grund | Quelle | Stand | Status |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| Amsel | Amsel | `species-assets/Amsel/map.jpg` | Testkarte | [Quelle](https://example.test/map.jpg) | 2026-06-19 | erledigt/geprueft |",
        "",
        "## Pflege-Regeln",
        "",
      ].join("\n"),
    ),
    writeFile(join(assetDir, "portrait.webp"), Buffer.alloc(256)),
    writeFile(join(assetDir, "portrait.json"), `${JSON.stringify({ german_name: "Amsel" }, null, 2)}\n`),
    writeFile(join(assetDir, "credits.json"), `${JSON.stringify({
      scientific_name: "Turdus merula",
      german_name: "Amsel",
      source: "Test",
      license: "https://creativecommons.org/licenses/by/4.0/",
    }, null, 2)}\n`),
  ]);
  const report = JSON.parse(await readFile(join(repoRoot, "fehlende_elemente_report.json"), "utf8"));
  report.counts.ncSoundLicensesAll = 1;
  report.ncSoundLicensesAll = ["Amsel"];
  await writeFile(join(repoRoot, "fehlende_elemente_report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  cleanupFixture(app);
  const baseUrl = `http://${app.host}:${address.port}`;

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: {
        germanName: "Schwarzdrossel",
        size: "ca. 23,5-29 cm",
        weight: "ca. 80-110 g",
        lifeExpectancy: "ca. 3 Jahre",
      },
    }),
  });
  assert.equal(
    previewResponse.status,
    200,
    previewResponse.status === 200 ? "" : await previewResponse.clone().text(),
  );
  const preview = await previewResponse.json();
  assert.equal(preview.changes.length, 1);
  assert.equal(preview.changes[0].field, "Deutscher Name");
  assert.equal(preview.changes[0].after, "Schwarzdrossel");

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, false);
  assert.equal(saved.oldSafeName, "Amsel");
  assert.equal(saved.newSafeName, "Schwarzdrossel");
  assert.equal(saved.safeNameChanged, true);

  assert.equal(existsSync(join(repoRoot, "species-assets", "Amsel")), false);
  assert.equal(existsSync(join(repoRoot, "species-assets", "Schwarzdrossel")), true);
  assert.equal(JSON.parse(await readFile(join(repoRoot, "species_list.json"), "utf8"))[0].german, "Schwarzdrossel");
  assert.equal(JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8"))[0]["Deutscher Name"], "Schwarzdrossel");
  assert.equal(JSON.parse(await readFile(join(repoRoot, "lastSavedAssessmentId.json"), "utf8")).Schwarzdrossel, 264548442);
  const registry = JSON.parse(await readFile(join(repoRoot, "species-assets-overrides.json"), "utf8"));
  assert.equal(registry.assets.Amsel, undefined);
  assert.equal(registry.assets.Schwarzdrossel.map.germanName, "Schwarzdrossel");
  assert.equal(registry.assets.Schwarzdrossel.sound.rejectedSources[0].key, "xeno-canto:123");
  assert.equal(
    JSON.parse(await readFile(join(repoRoot, "species-assets", "Schwarzdrossel", "credits.json"), "utf8")).german_name,
    "Schwarzdrossel",
  );
  assert.equal(
    JSON.parse(await readFile(join(repoRoot, "species-assets", "Schwarzdrossel", "portrait.json"), "utf8")).german_name,
    "Schwarzdrossel",
  );
  const nextReport = JSON.parse(await readFile(join(repoRoot, "fehlende_elemente_report.json"), "utf8"));
  assert.deepEqual(nextReport.ncSoundLicensesAll, ["Schwarzdrossel"]);
  const manualDoc = await readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8");
  assert.match(manualDoc, /Schwarzdrossel/);
  assert.match(manualDoc, /species-assets\/Schwarzdrossel\/map\.jpg/);

  const model = await buildExplorerModel(repoRoot);
  assert.equal(model.species[0].germanName, "Schwarzdrossel");
  assert.equal(model.species[0].safeName, "Schwarzdrossel");
  assert.equal(model.species[0].assets.map.exists, true);
});

test("Wissenschaftlicher Artname bleibt gesperrt und kann bewusst mit URL-Slug geändert werden", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  const assetDir = join(repoRoot, "species-assets", "Amsel");
  await Promise.all([
    writeFile(join(assetDir, "portrait.json"), `${JSON.stringify({
      german_name: "Amsel",
      scientific_name: "Turdus merula",
    }, null, 2)}\n`),
    writeFile(join(assetDir, "credits.json"), `${JSON.stringify({
      german_name: "Amsel",
      scientific_name: "Turdus merula",
      source: "Test",
      license: "https://creativecommons.org/licenses/by/4.0/",
    }, null, 2)}\n`),
  ]);
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  cleanupFixture(app);
  const baseUrl = `http://${app.host}:${address.port}`;
  const payload = {
    germanName: "Amsel",
    scientificName: "Turdus iliacus",
    size: "ca. 23,5-29 cm",
    weight: "ca. 80-110 g",
    lifeExpectancy: "ca. 3 Jahre",
  };

  const lockedPreviewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: payload }),
  });
  assert.equal(lockedPreviewResponse.status, 409);
  assert.match((await lockedPreviewResponse.json()).details.join(" "), /URL-Slug/);

  const previewResponse = await fetch(`${baseUrl}/api/species/turdusmerula/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: { ...payload, scientificNameUnlocked: true } }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.deepEqual(
    preview.changes.map((entry) => entry.field),
    ["Wissenschaftlicher Name", "URL-Slug"],
  );
  assert.match(preview.warnings.join(" "), /Website/);

  const saveResponse = await fetch(`${baseUrl}/api/species/turdusmerula/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, false);
  assert.equal(saved.slugChanged, true);
  assert.equal(saved.oldSlug, "turdusmerula");
  assert.equal(saved.newSlug, "turdusiliacus");
  assert.equal(saved.species.id, "turdusiliacus");
  assert.equal(existsSync(assetDir), true);

  const inputList = JSON.parse(await readFile(join(repoRoot, "species_list.json"), "utf8"));
  assert.equal(inputList[0].genus, "Turdus");
  assert.equal(inputList[0].species, "iliacus");
  const generated = JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8"))[0];
  assert.equal(generated["Wissenschaftlicher Name"], "Turdus iliacus");
  assert.equal(generated.Genus, "Turdus");
  assert.equal(generated.Species, "iliacus");
  assert.equal(generated.URLSlug, "turdusiliacus");
  assert.equal(
    JSON.parse(await readFile(join(assetDir, "credits.json"), "utf8")).scientific_name,
    "Turdus iliacus",
  );
  assert.equal(
    JSON.parse(await readFile(join(assetDir, "portrait.json"), "utf8")).scientific_name,
    "Turdus iliacus",
  );
});

test("Neue Arten werden validiert, kollisionsfrei vorgeschaut und sicher angehängt", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  await mkdir(join(repoRoot, "species-assets", "Kollisionsart"), { recursive: true });
  const app = await createExplorerServer({ repoRoot, port: 0 });
  const address = await app.listen();
  cleanupFixture(app);
  const baseUrl = `http://${app.host}:${address.port}`;
  const speciesListPath = join(repoRoot, "species_list.json");
  const beforeText = await readFile(speciesListPath, "utf8");
  const validValues = {
    german: "Testvogel",
    english: "Test Bird",
    scientificName: "Testus Avis",
    size: "ca. 20 cm",
    weight: "ca. 50 g",
    lifeExpectancy: "ca. 5 Jahre",
  };

  const invalidScientificNameResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { ...validValues, scientificName: "Testus" },
    }),
  });
  assert.equal(invalidScientificNameResponse.status, 400);
  const invalidScientificName = await invalidScientificNameResponse.json();
  assert.match(invalidScientificName.details.join(" "), /genau aus Gattung und Art-Epitheton/);

  const duplicateScientificResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { ...validValues, scientificName: "Turdus Merula" },
    }),
  });
  assert.equal(duplicateScientificResponse.status, 409);
  assert.match(
    (await duplicateScientificResponse.json()).details.join(" "),
    /Wissenschaftlicher Name ist bereits vorhanden/,
  );

  const duplicateGermanResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { ...validValues, german: "Amsel" },
    }),
  });
  assert.equal(duplicateGermanResponse.status, 409);
  assert.match(
    (await duplicateGermanResponse.json()).details.join(" "),
    /Deutscher Name ist bereits vorhanden/,
  );

  const assetCollisionResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: { ...validValues, german: "Kollisionsart" },
    }),
  });
  assert.equal(assetCollisionResponse.status, 409);
  assert.match(
    (await assetCollisionResponse.json()).details.join(" "),
    /Assetordner ist bereits vorhanden/,
  );

  const previewResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: validValues }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.ok(preview.token);
  assert.equal(preview.expiresAt, null);
  assert.deepEqual(preview.entry, {
    german: "Testvogel",
    english: "Test Bird",
    genus: "Testus",
    species: "avis",
    size: "ca. 20 cm",
    weight: "ca. 50 g",
    life_expectancy: "ca. 5 Jahre",
  });
  assert.equal(preview.derived.scientificName, "Testus avis");
  assert.equal(preview.derived.slug, "testusavis");
  assert.equal(preview.derived.safeName, "Testvogel");
  assert.equal(preview.derived.assetDirectory, "species-assets/Testvogel");
  assert.equal(await readFile(speciesListPath, "utf8"), beforeText);

  const portraitPromptResponse = await fetch(`${baseUrl}/api/species/new/portrait-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: validValues,
      additionalInstructions: "vollständiger Schwanz sichtbar",
    }),
  });
  assert.equal(portraitPromptResponse.status, 200);
  const portraitPrompt = await portraitPromptResponse.json();
  assert.equal(portraitPrompt.derived.scientificName, "Testus avis");
  assert.equal(portraitPrompt.fileName, "Testvogel.png");
  assert.match(portraitPrompt.prompt, /German common name: Testvogel/);
  assert.match(portraitPrompt.prompt, /Scientific name: Testus avis/);
  assert.match(portraitPrompt.prompt, /vollständiger Schwanz sichtbar/);
  assert.match(portraitPrompt.prompt, /Do not create a collage/);

  await writeFile(speciesListPath, `${beforeText}\n`, "utf8");
  const staleSaveResponse = await fetch(`${baseUrl}/api/species/new/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: preview.token }),
  });
  assert.equal(staleSaveResponse.status, 409);
  assert.match((await staleSaveResponse.json()).error, /seit der Vorschau geändert/);
  await writeFile(speciesListPath, beforeText, "utf8");

  const invalidSaveResponse = await fetch(`${baseUrl}/api/species/new/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "ungueltig" }),
  });
  assert.equal(invalidSaveResponse.status, 409);

  const finalPreviewResponse = await fetch(`${baseUrl}/api/species/new/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: validValues }),
  });
  assert.equal(finalPreviewResponse.status, 200);
  const finalPreview = await finalPreviewResponse.json();

  const saveResponse = await fetch(`${baseUrl}/api/species/new/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: finalPreview.token }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.pipelineRequired, true);
  assert.equal(saved.species.id, "testusavis");
  assert.equal(saved.species.germanName, "Testvogel");
  assert.match(saved.backup, /^species-explorer\/backups\/species_list-/);
  assert.equal(saved.backupRetention.kept, 1);
  assert.equal(saved.backupRetention.removed, 0);

  const afterList = JSON.parse(await readFile(speciesListPath, "utf8"));
  assert.equal(afterList.length, 2);
  assert.deepEqual(afterList[1], preview.entry);
  assert.equal(
    await readFile(join(repoRoot, ...saved.backup.split("/")), "utf8"),
    beforeText,
  );

  const species = await (await fetch(`${baseUrl}/api/species`)).json();
  const newSpecies = species.find((entry) => entry.id === "testusavis");
  assert.ok(newSpecies);
  assert.deepEqual(newSpecies.dataIssues, ["Kein Eintrag in speciesData.json"]);
  assert.equal(newSpecies.assetIssues.length, 5);
  assert.ok(newSpecies.assetIssues.includes("Artporträt fehlt"));
  const validation = await (await fetch(`${baseUrl}/api/validation`)).json();
  assert.equal(validation.data.inputOnlyCount, 1);

  const pipelinePreviewResponse = await fetch(`${baseUrl}/api/pipeline/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "missing" }),
  });
  assert.equal(pipelinePreviewResponse.status, 200);
  const pipelinePreview = await pipelinePreviewResponse.json();
  assert.equal(pipelinePreview.targetCount, 1);
  assert.equal(pipelinePreview.targets[0].slug, "testusavis");
  assert.match(pipelinePreview.targets[0].reasons.join(" "), /speciesData\.json/);
  assert.ok(pipelinePreview.token);

  const reusedSaveResponse = await fetch(`${baseUrl}/api/species/new/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: finalPreview.token }),
  });
  assert.equal(reusedSaveResponse.status, 409);
});

test("Neue Art erklärt den fehlgeschlagenen Updateauftrag schon vor dem Formular und sperrt auch direkte Vorschauaufrufe", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  const taxonomyRoot = join(repoRoot, "own-taxonomy");
  const masterRoot = join(taxonomyRoot, "master");
  await mkdir(masterRoot, { recursive: true });
  const workflowPath = join(masterRoot, "update-workflow.json");
  const workflowText = JSON.stringify({ schemaVersion: 1,
    updateRunId: "update-11111111-1111-4111-8111-111111111111", status: "failed", phase: "build",
    decision: "refresh-and-build", automaticAttemptedCandidates: [], error: "Testaufbau fehlgeschlagen" });
  await writeFile(workflowPath, workflowText);
  const before = await readFile(join(repoRoot, "species_list.json"), "utf8");
  const app = await createExplorerServer({ repoRoot, taxonomyRoot, port: 0 });
  cleanupFixture(app);
  const address = await app.listen();
  const baseUrl = `http://${app.host}:${address.port}`;
  const response = await fetch(`${baseUrl}/api/species/new/availability`);
  assert.equal(response.status, 200);
  const availability = await response.json();
  assert.equal(availability.available, false);
  assert.equal(availability.reason, "update-failed");
  assert.match(availability.message, /fehlgeschlagen/);
  const blocked = await fetch(`${baseUrl}/api/species/new/preview`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: { german: "Wendehals" } }) });
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).error, /fehlgeschlagen/);
  assert.equal(await readFile(join(repoRoot, "species_list.json"), "utf8"), before);
  assert.equal(await readFile(workflowPath, "utf8"), workflowText);
});

test("Pipeline-Auswahl trennt fehlende Arten vom vollständigen Lauf", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  const speciesList = JSON.parse(await readFile(join(repoRoot, "species_list.json"), "utf8"));
  const speciesData = JSON.parse(await readFile(join(repoRoot, "speciesData.json"), "utf8"));
  const sanitize = (value) => value;

  const completePlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "missing",
  });
  assert.equal(completePlan.targetCount, 0);
  assert.equal(completePlan.hasWork, false);

  const changedInputPlan = buildPipelinePlan({
    speciesList: speciesList.map((entry, index) => (index === 0
      ? { ...entry, size: `${entry.size} geändert` }
      : entry)),
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "missing",
  });
  assert.equal(changedInputPlan.targetCount, 1);
  assert.match(changedInputPlan.targets[0].reasons.join(" "), /geänderte Eingabefelder: Größe/);
  const transferPlan = buildPipelinePlan({
    speciesList: speciesList.map((entry, index) => (index === 0
      ? { ...entry, size: `${entry.size} geändert` }
      : entry)),
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "transfer",
  });
  assert.equal(transferPlan.targetCount, 1);
  assert.match(transferPlan.targets[0].reasons.join(" "), /geänderte Eingabefelder: Größe/);

  speciesList.push({
    german: "Testvogel",
    genus: "Testus",
    species: "avis",
    size: "ca. 20 cm",
    weight: "ca. 50 g",
    life_expectancy: "ca. 5 Jahre",
  });
  const missingPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "missing",
  });
  assert.equal(missingPlan.targetCount, 1);
  assert.equal(missingPlan.targets[0].slug, "testusavis");

  const allPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "all",
  });
  assert.equal(allPlan.targetCount, 2);
  assert.ok(allPlan.targets.every((entry) => entry.reasons[0] === "vollständiger Lauf"));

  await writeFile(
    join(repoRoot, "species-assets-overrides.json"),
    `${JSON.stringify({
      version: 1,
      assets: { Amsel: { map: { manual: true } } },
    }, null, 2)}\n`,
  );
  const manualMapPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "manual-maps",
  });
  assert.equal(manualMapPlan.targetCount, 1);
  assert.equal(manualMapPlan.targets[0].safeName, "Amsel");

  await writeFile(
    join(repoRoot, "species-assets-overrides.json"),
    `${JSON.stringify({ version: 1, assets: {} }, null, 2)}\n`,
  );
  const targetedCompleteMapPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "manual-maps",
    targetSlugs: ["turdusmerula"],
  });
  assert.equal(targetedCompleteMapPlan.targetCount, 1);
  assert.equal(targetedCompleteMapPlan.targets[0].safeName, "Amsel");
  assert.match(targetedCompleteMapPlan.targets[0].reasons.join(" "), /gezielte Kartensuche/);

  await rm(join(repoRoot, "species-assets", "Amsel", "map.jpg"), { force: true });
  const untargetedMissingMapPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "manual-maps",
  });
  assert.equal(untargetedMissingMapPlan.targetCount, 1);
  assert.equal(untargetedMissingMapPlan.targets[0].safeName, "Amsel");
  assert.match(untargetedMissingMapPlan.targets[0].reasons.join(" "), /Karte fehlt/);
  const targetedMissingMapPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "manual-maps",
    targetSlugs: ["turdusmerula"],
  });
  assert.equal(targetedMissingMapPlan.targetCount, 1);
  assert.equal(targetedMissingMapPlan.targets[0].safeName, "Amsel");
  assert.match(targetedMissingMapPlan.targets[0].reasons.join(" "), /Karte fehlt/);

  await writeFile(
    join(repoRoot, "species-assets", "Amsel", "credits.json"),
    JSON.stringify({ license: "https://creativecommons.org/licenses/by-nc/4.0/" }),
  );
  const ncSoundPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "nc-sounds",
  });
  assert.equal(ncSoundPlan.targetCount, 1);
  assert.equal(ncSoundPlan.targets[0].safeName, "Amsel");

  await rm(join(repoRoot, "species-assets", "Amsel", "sound.mp3"), { force: true });
  const missingSoundPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "nc-sounds",
  });
  assert.equal(missingSoundPlan.targetCount, 1);
  assert.equal(missingSoundPlan.targets[0].safeName, "Amsel");
  assert.match(missingSoundPlan.targets[0].reasons.join(" "), /Sound fehlt/);
  const transferIgnoresMissingAssetsPlan = buildPipelinePlan({
    speciesList,
    existingSpeciesData: speciesData,
    repoRoot,
    sanitizeAssetName: sanitize,
    mode: "transfer",
  });
  assert.equal(transferIgnoresMissingAssetsPlan.targetCount, 0);
});

test("Explorer-Modell zählt automatisch übernommene Karten nicht als manuell", async (context) => {
  const repoRoot = await createEditableFixture();
  const cleanupFixture = registerFixtureCleanup(context, repoRoot);
  await Promise.all([
    writeFile(join(repoRoot, "docs", "manual-map-overrides.md"), [
      "# Manual Map Overrides",
      "",
      "| Art | SafeName | Datei |",
      "|---|---|---|",
      "| Amsel | Amsel | `species-assets/Amsel/map.jpg` |",
      "",
    ].join("\n")),
    writeFile(
      join(repoRoot, "species-assets-overrides.json"),
      `${JSON.stringify({ version: 1, assets: { Amsel: { map: { manual: false } } } }, null, 2)}\n`,
    ),
  ]);
  const model = await buildExplorerModel(repoRoot);
  assert.equal(model.summary.manualMapCount, 0);
  assert.equal(model.species[0].isManualMap, false);
  assert.equal(model.species[0].assets.map.manuallyAdded, false);
});
