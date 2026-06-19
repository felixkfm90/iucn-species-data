import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildExplorerModel, createExplorerServer } from "./server.mjs";
await import("./public/filter.js");

test("Explorer-Modell bildet den aktuellen Projektstand ab", async () => {
  const model = await buildExplorerModel();

  assert.equal(model.summary.speciesCount, 45);
  assert.equal(model.summary.inputCount, 45);
  assert.equal(model.summary.generatedCount, 45);
  assert.equal(model.summary.missingCoreAssets, 0);
  assert.equal(model.summary.ncSoundCount, 3);
  assert.equal(model.summary.manualMapCount, 7);
  assert.equal(model.summary.readOnly, true);
  assert.equal(model.validation.status, "ok");
  assert.equal(model.validation.issueCount, 0);
  assert.equal(model.validation.data.matchedCount, 45);
  assert.equal(model.validation.data.issueSpeciesCount, 0);
  assert.equal(model.validation.assets.completeSpeciesCount, 45);
  assert.equal(model.validation.assets.issueSpeciesCount, 0);
  assert.equal(model.validation.report.consistent, true);
  assert.equal(model.validation.report.issueCount, 0);
  assert.ok(model.validation.report.checks.every((check) => check.ok));
  assert.equal(model.species.filter((entry) => entry.isNcSound).length, 3);
  assert.equal(model.species.filter((entry) => entry.isManualMap).length, 7);
  assert.equal(model.species.filter((entry) => entry.assets.map.manuallyAdded).length, 7);
  assert.equal(model.species.filter((entry) => entry.assets.sound.manuallyAdded).length, 0);
  assert.ok(model.species.every((entry) => entry.inconsistencies.length === 0));
  assert.ok(model.species.every((entry) => (
    entry.assets.map.exists
    && entry.assets.sound.exists
    && entry.assets.credits.exists
    && entry.assets.spectrogram.exists
  )));
});

test("Lokaler Server liefert API und Assets, lehnt Schreibzugriffe ab", async (context) => {
  const app = await createExplorerServer({ port: 0 });
  const address = await app.listen();
  context.after(() => app.close());
  const baseUrl = `http://${app.host}:${address.port}`;

  const summaryResponse = await fetch(`${baseUrl}/api/summary`);
  assert.equal(summaryResponse.status, 200);
  assert.equal((await summaryResponse.json()).speciesCount, 45);

  const speciesResponse = await fetch(`${baseUrl}/api/species`);
  assert.equal(speciesResponse.status, 200);
  assert.equal((await speciesResponse.json()).length, 45);

  const validationResponse = await fetch(`${baseUrl}/api/validation`);
  assert.equal(validationResponse.status, 200);
  assert.equal((await validationResponse.json()).status, "ok");

  const assetResponse = await fetch(`${baseUrl}/assets/Amsel/map.jpg`);
  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get("content-type"), "image/jpeg");

  const writeResponse = await fetch(`${baseUrl}/api/species`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(writeResponse.status, 405);
  assert.match(await writeResponse.text(), /Read-only/);
});

test("Suche und Filter finden Namen, Slugs und Projektkennzeichnungen", async () => {
  const model = await buildExplorerModel();
  const { filterSpecies } = globalThis.SpeciesExplorerFilters;

  assert.deepEqual(
    filterSpecies(model.species, { query: "Amsel" }).map((entry) => entry.germanName),
    ["Amsel"],
  );
  assert.deepEqual(
    filterSpecies(model.species, { query: "Turdus merula" }).map((entry) => entry.germanName),
    ["Amsel"],
  );
  assert.deepEqual(
    filterSpecies(model.species, { query: "turdusmerula" }).map((entry) => entry.germanName),
    ["Amsel"],
  );
  assert.equal(filterSpecies(model.species, { flag: "nc" }).length, 3);
  assert.equal(filterSpecies(model.species, { flag: "manual-map" }).length, 7);
  assert.equal(filterSpecies(model.species, { flag: "data-issues" }).length, 0);
  assert.equal(filterSpecies(model.species, { flag: "asset-issues" }).length, 0);
  assert.equal(filterSpecies(model.species, { flag: "issues" }).length, 0);
  assert.ok(filterSpecies(model.species, { status: "LC" }).length > 0);

  const dataIssue = structuredClone(model.species[0]);
  dataIssue.dataIssues = ["Testabweichung"];
  dataIssue.inconsistencies = ["Testabweichung"];
  const assetIssue = structuredClone(model.species[1]);
  assetIssue.assetIssues = ["Testasset fehlt"];
  assetIssue.inconsistencies = ["Testasset fehlt"];
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "data-issues" }).length, 1);
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "asset-issues" }).length, 1);
  assert.equal(filterSpecies([dataIssue, assetIssue], { flag: "issues" }).length, 2);
});

test("Explorer-Oberflaeche zeigt Medien kompakt und kennzeichnet Datenquellen", async () => {
  const [appSource, cssSource, htmlSource] = await Promise.all([
    readFile(new URL("./public/app.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app.css", import.meta.url), "utf8"),
    readFile(new URL("./public/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /class="map-image"/);
  assert.match(cssSource, /\.map-image\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(appSource, /map-zoom-trigger/);
  assert.match(appSource, /map-lightbox/);
  assert.match(appSource, /species-image-placeholder/);
  assert.match(cssSource, /\.detail-media-layout\s*\{[^}]*grid-template-columns/s);
  assert.match(appSource, /class="explorer-audio"/);
  assert.match(appSource, /class="audio-visual"/);
  assert.match(appSource, /audio-progress-marker/);
  assert.match(appSource, /requestAnimationFrame/);
  assert.match(appSource, /Gefährdet/);
  assert.match(appSource, /IUCN-Daten abgerufen/);
  assert.match(appSource, /class="audio-credits"/);
  assert.match(appSource, /assetStatusText\(species\.assets\.map\)/);
  assert.match(appSource, /updateValidation/);
  assert.match(appSource, /fetch\("\/api\/validation"\)/);
  assert.match(htmlSource, /class="validation-dashboard"/);
  assert.match(htmlSource, /value="data-issues"/);
  assert.match(htmlSource, /value="asset-issues"/);
  assert.match(
    htmlSource,
    /value="issues">Alle Probleme<\/option>\s*<option value="asset-issues">Assetproblem<\/option>\s*<option value="data-issues">Datenabweichung<\/option>\s*<option value="manual-map">Manuelle Karte<\/option>\s*<option value="nc">NC-Sound<\/option>/s,
  );
  assert.match(cssSource, /\.validation-grid\s*\{[^}]*grid-template-columns/s);
  assert.doesNotMatch(appSource, /\["Kartenpflege"/);
  assert.doesNotMatch(appSource, /\["Daten abgerufen", species\.iucn\.fetchedAt\]/);
  assert.match(cssSource, /\.detail-media-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(cssSource, /\.detail-side-stack\s*\{[^}]*grid-template-rows:\s*minmax\(280px,\s*2fr\)\s*auto/s);
  assert.match(cssSource, /\.audio-visual\s*\{[^}]*height:\s*clamp\(64px,\s*4\.5vw,\s*84px\)/s);
  assert.match(appSource, /window\.scrollTo\(scrollPosition\)/);
  assert.doesNotMatch(appSource, /renderSpeciesList\(\);\s*renderDetail\(species\)/);
});
