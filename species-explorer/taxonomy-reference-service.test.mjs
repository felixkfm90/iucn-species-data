import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importTaxonomyPrototype } from "./taxonomy-import.mjs";
import { createTaxonomyReferenceService } from "./taxonomy-reference-service.mjs";

const FIXTURE_DIRECTORY = path.resolve(
  "scripts",
  "fixtures",
  "taxonomy",
  "col-xr-2026-07-17",
);

async function temporaryTaxonomyRoot(context, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    root,
    taxonomyRoot: path.join(root, "taxonomy"),
  };
}

function registerCleanup(context, service, root) {
  context.after(async () => {
    service.close();
    await fs.rm(root, { recursive: true, force: true });
  });
}

test("fehlende Referenzdaten blockieren die manuelle Artanlage nicht", async (context) => {
  const { root, taxonomyRoot } = await temporaryTaxonomyRoot(context, "taxonomy-reference-missing-");
  const service = createTaxonomyReferenceService({ taxonomyRoot });
  registerCleanup(context, service, root);

  assert.deepEqual(await service.status(), {
    available: false,
    reason: "not-installed",
    message: "Noch keine lokale Taxonomiereferenz installiert. Die Namen können weiterhin manuell eingegeben werden.",
    manualEntryAvailable: true,
  });
  await assert.rejects(
    service.kingdoms(),
    (error) => error.statusCode === 503 && /Noch keine/.test(error.message),
  );
});

test("aktive Referenz liefert Reichsauswahl, Drei-Feld-Suche und Taxondetails", async (context) => {
  const { root, taxonomyRoot } = await temporaryTaxonomyRoot(context, "taxonomy-reference-ready-");
  await importTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
  });
  const service = createTaxonomyReferenceService({ taxonomyRoot });
  registerCleanup(context, service, root);

  const status = await service.status();
  assert.equal(status.available, true);
  assert.equal(status.releaseId, "col-xr-2026-07-17");
  assert.equal(status.manualEntryAvailable, true);

  const kingdoms = await service.kingdoms();
  assert.equal(kingdoms.defaultKingdom, "Animalia");
  assert.equal(kingdoms.values[0].label, "Tiere (Animalia)");

  const german = await service.search({
    query: "Stieg",
    kind: "vernacular",
    kingdomId: "Animalia",
    language: "de",
    rank: "species",
    limit: 12,
  });
  assert.equal(german.results[0].germanName, "Stieglitz");
  assert.equal(german.results[0].acceptedScientificName, "Carduelis carduelis");

  const scientific = await service.search({
    query: "Card",
    kind: "scientific",
    kingdomId: "Animalia",
    rank: "species",
    limit: 12,
  });
  const speciesResult = scientific.results.find(
    (entry) => entry.acceptedScientificName === "Carduelis carduelis",
  );
  assert.ok(speciesResult);
  const detail = await service.taxon(speciesResult.taxonId);
  assert.equal(detail.scientific_name, "Carduelis carduelis");
  assert.ok(detail.germanNames.some((entry) => entry.name === "Stieglitz"));
  assert.equal(detail.source, "Catalogue of Life");
  assert.equal(detail.releaseId, "col-xr-2026-07-17");
  assert.ok(detail.hierarchy.length > 1);
});

test("Suchparameter und unbekannte Taxa werden an der API-Grenze validiert", async (context) => {
  const { root, taxonomyRoot } = await temporaryTaxonomyRoot(context, "taxonomy-reference-validation-");
  await importTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
  });
  const service = createTaxonomyReferenceService({ taxonomyRoot });
  registerCleanup(context, service, root);

  await assert.rejects(
    service.search({ query: "", kind: "all" }),
    (error) => error.statusCode === 400 && /Suchbegriff/.test(error.message),
  );
  await assert.rejects(
    service.search({ query: "Amsel", kind: "unknown" }),
    (error) => error.statusCode === 400 && /Suchart/.test(error.message),
  );
  await assert.rejects(
    service.search({ query: "Amsel", rank: "unknown" }),
    (error) => error.statusCode === 400 && /Rang/.test(error.message),
  );
  await assert.rejects(
    service.search({ query: "Amsel", language: "unknown" }),
    (error) => error.statusCode === 400 && /Suchsprache/.test(error.message),
  );
  await assert.rejects(
    service.search({ query: "Amsel", limit: 13 }),
    (error) => error.statusCode === 400 && /zwischen 1 und 12/.test(error.message),
  );
  await assert.rejects(
    service.taxon("nicht-vorhanden"),
    (error) => error.statusCode === 404 && /nicht gefunden/.test(error.message),
  );
});
