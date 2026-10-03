import assert from "node:assert/strict";
import test from "node:test";
import { createMapImportCare, isMapProtected, mapCareState } from "./map-provenance.mjs";
import { createIucnMapAdapter } from "./iucn-map-adapter.mjs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const species = { iucn: { assessmentId: "132000123" } };
const payload = {
  careMode: "iucn-browser", originalName: "T22720330A132000123.jpg", imageBase64: "fixture-only",
  source: "https://www.iucnredlist.org/api/v4/assessments/132000123/distribution_map/jpg",
};

test("Browserherkunft ist eine explizite Nutzerangabe, kein technischer Bildnachweis", () => {
  const care = createMapImportCare(payload, species);
  assert.equal(care.careMode, "provider");
  assert.equal(care.provenance.assurance, "user-declared");
  assert.equal(care.provenance.assessmentId, "132000123");
  const map = { manual: true, protectFromPipeline: true, ...care };
  assert.equal(isMapProtected(map), true);
  assert.equal(mapCareState(map).browserImported, true);
  assert.equal(mapCareState(map).ownCare, false);
});

test("Altdaten und fehlende Pflegewahl bleiben geschützt und werden nicht umklassifiziert", () => {
  const care = createMapImportCare({ ...payload, careMode: undefined }, species);
  assert.equal(care.careMode, "manual");
  assert.equal(care.provenance.provider, "unspecified");
  assert.equal(mapCareState({ manual: true, source: payload.source }).ownCare, true);
  assert.equal(mapCareState({ manual: true, source: payload.source }).browserImported, false);
  assert.equal(isMapProtected({ manual: false, protectFromPipeline: true }), true);
  assert.equal(isMapProtected({ manual: true, protectFromPipeline: false }), true);
  assert.equal(isMapProtected({ manual: false, protectFromPipeline: false }), false);
  assert.equal(isMapProtected(undefined, true), true);
});

test("Browserangabe braucht Datei, kanonische Quelle und passende aktuelle Bewertung", () => {
  for (const changes of [
    { imageBase64: "" }, { source: "" }, { source: payload.source + "?token=test" },
    { source: payload.source.replace("www.iucnredlist.org", "www.iucnredlist.org.evil.example") },
    { source: payload.source.replace("https:", "http:") },
    { source: payload.source.replace("132000123", "42") },
    { originalName: "T22720330A42.jpg" }, { careMode: "automatic" },
  ]) assert.throws(() => createMapImportCare({ ...payload, ...changes }, species));
  assert.throws(() => createMapImportCare(payload, { iucn: { assessmentId: "Unbekannt" } }));
  assert.equal(createMapImportCare({ ...payload, originalName: "selbst-umbenannt.jpg" }, species)
    .provenance.assurance, "user-declared");
});

test("Fehlende oder widersprüchliche Herkunft entzieht keinen Legacy-Schutz", () => {
  const map = { manual: true, careMode: "provider", provenance: { provider: "iucn" } };
  assert.equal(mapCareState(map).ownCare, true);
  assert.equal(mapCareState(map).browserImported, false);
  assert.equal(isMapProtected(map), true);
});

test("Downloadschutz respektiert eigenständigen Schutz und alte manuell-Markierung ohne Anbieteraufruf", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fn-map-care-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "Amsel"));
  await writeFile(join(root, "Amsel", "map.jpg"), "fixture-previous-map");
  for (const map of [{ manual: false, protectFromPipeline: true }, { manual: true, protectFromPipeline: false }]) {
    const adapter = createIucnMapAdapter({
      fetch: async () => assert.fail("geschützte Karte darf nicht automatisch ersetzt werden"),
      iucnGET: async () => assert.fail("keine zusätzliche Quelle"), sleep: async () => {},
      sanitizeAssetName: (name) => name, speciesAssetDir: () => join(root, "Amsel"), ensureDir() {},
      isManualAsset: () => isMapProtected(map), logger: { log() {}, warn() {}, error() {} },
    });
    assert.equal(await adapter.downloadMapForSpecies({ "Deutscher Name": "Amsel", "Assessment ID": "1" }, { force: true }), "ok");
  }
});
