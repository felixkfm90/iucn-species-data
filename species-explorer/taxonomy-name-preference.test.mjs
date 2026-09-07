import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTaxonomyNamePreferenceService, germanNameChoices } from "./taxonomy-name-preference-service.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { taxonomyCorrectionsRevision } from "./taxonomy-master-candidate.mjs";
import { handleNamePreferenceRequest } from "./lightroom-name-preference-helper.mjs";

async function fixture(t, { protectedName = false, activationFails = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fn-preference-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const correctionsPath = path.join(root, "corrections.json");
  const document = { schemaVersion: 1, entries: protectedName ? [{ scientificName: "Ciconia ciconia", germanName: "Hausstorch", englishName: "White Stork", note: "Eigene Pflege" }] : [] };
  await fs.writeFile(correctionsPath, JSON.stringify(document));
  const taxon = { masterTaxonId: "mtx_stork", acceptedScientificName: "Ciconia ciconia", germanName: "Hausstorch", englishName: "White Stork", kingdom: "Animalia", rank: "species", names: [
    { language: "de", kind: "vernacular", name: "Hausstorch", source: "Catalogue of Life" },
    { language: "de", kind: "vernacular", name: "Weißstorch", source: "iNaturalist" },
    { language: "en", kind: "vernacular", name: "White Stork" },
    { language: "de", kind: "synonym", name: "Wrong scientific synonym" },
  ] };
  const status = { packageId: "package", masterVersion: "master", correctionRevision: "" };
  const versions = { ...status, state: "current", masterCorrectionRevision: taxonomyCorrectionsRevision(document.entries) };
  let activations = 0;
  const options = {
    taxonomyRoot: path.join(root, "taxonomy"), searchRoot: path.join(root, "lightroom"), correctionsPath,
    openStore: async () => ({ taxon: (id) => id === taxon.masterTaxonId ? structuredClone(taxon) : null, status: () => ({ ...status }), close() {} }),
    readVersions: async () => ({ ...versions }),
    prepare: async () => {},
    readProviderStandard: async () => ({ germanName: "Hausstorch", provider: "catalogue-of-life", providerVersion: "fixture" }),
    activate: async ({ corrections }) => {
      activations += 1;
      if (activationFails) throw new Error("Fixture: Paket belegt");
      taxon.germanName = corrections[0].germanNameMode === "provider" ? "Hausstorch" : corrections[0].germanName;
      versions.masterCorrectionRevision = taxonomyCorrectionsRevision(corrections);
    },
  };
  return { ...options, taxon, status, versions, service: createTaxonomyNamePreferenceService(options), activations: () => activations,
    setActivationFailure: (value) => { activationFails = value; } };
}

const choice = { masterTaxonId: "mtx_stork", germanName: "Weißstorch" };

test("Anbieterstandard löst auch bei gleichem Namen die eigene Bindung nach Bestätigung und erhält Englisch und Rückwahl", async (t) => {
  const f = await fixture(t, { protectedName: true });
  const before = await fs.readFile(f.correctionsPath, "utf8");
  const preview = await f.service.preview({ masterTaxonId: choice.masterTaxonId, useProviderStandard: true });
  assert.equal(preview.unchanged, false);
  assert.equal(preview.requiresConfirmation, true);
  assert.equal(preview.germanName, "Hausstorch");
  await assert.rejects(f.service.save(preview), /bestätigt/);
  assert.equal(await fs.readFile(f.correctionsPath, "utf8"), before);
  assert.equal((await f.service.save({ ...preview, confirmed: true })).saved, true);
  const saved = JSON.parse(await fs.readFile(f.correctionsPath, "utf8")).entries[0];
  assert.equal(saved.germanName, "");
  assert.equal(saved.germanNameMode, "provider");
  assert.equal(saved.englishName, "White Stork");
  assert.equal(saved.namePreference.previousGermanName, "Hausstorch");
  assert.equal((await f.service.save({ ...preview, confirmed: true })).unchanged, true);
  const undo = await f.service.preview({ masterTaxonId: choice.masterTaxonId, usePrevious: true });
  assert.equal(undo.unchanged, false);
  assert.equal(undo.requiresConfirmation, true);
  await f.service.save({ ...undo, confirmed: true });
  assert.equal(JSON.parse(await fs.readFile(f.correctionsPath, "utf8")).entries[0].germanNameMode, undefined);
});

test("Nicht belegbarer Anbieterstandard und zwischenzeitlicher Quellenwechsel verändern keine Korrektur", async (t) => {
  const f = await fixture(t, { protectedName: true });
  const before = await fs.readFile(f.correctionsPath, "utf8");
  const missing = createTaxonomyNamePreferenceService({ ...f, readProviderStandard: async () => { throw new Error("Kein Anbietername"); } });
  await assert.rejects(missing.preview({ masterTaxonId: choice.masterTaxonId, useProviderStandard: true }), /Kein Anbietername/);
  let providerVersion = "old";
  const changed = createTaxonomyNamePreferenceService({ ...f, readProviderStandard: async () => ({ germanName: "Hausstorch", provider: "catalogue-of-life", providerVersion }) });
  const preview = await changed.preview({ masterTaxonId: choice.masterTaxonId, useProviderStandard: true });
  providerVersion = "new";
  await assert.rejects(changed.save({ ...preview, confirmed: true }), /Namensstand wurde verändert/);
  assert.equal(await fs.readFile(f.correctionsPath, "utf8"), before);
});

test("Anbieterstandard bleibt bei Aktivierungsfehler wiederholbar und veröffentlicht keine fremde Korrektur", async (t) => {
  const f = await fixture(t, { protectedName: true, activationFails: true });
  const preview = await f.service.preview({ masterTaxonId: choice.masterTaxonId, useProviderStandard: true });
  const payload = { ...preview, confirmed: true };
  assert.equal((await f.service.save(payload)).pending, true);
  assert.equal(f.activations(), 1);
  f.setActivationFailure(false);
  assert.equal((await f.service.save(payload)).saved, true);
  assert.equal(f.activations(), 2);
});

test("Nur belegte deutsche Varianten, keine Suchtexte, englischen Namen oder wissenschaftlichen Synonyme", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(germanNameChoices(f.taxon), ["Hausstorch", "Weißstorch"]);
  for (const germanName of ["Weiß", "White Stork", "Wrong scientific synonym", "Unbekannt"]) {
    await assert.rejects(f.service.preview({ ...choice, germanName }), /belegten deutschen Namen/);
  }
  assert.equal(f.activations(), 0);
});

test("Eigene Präferenz verlangt Bestätigung, Vorschau und Ablehnung verändern nichts", async (t) => {
  const f = await fixture(t, { protectedName: true });
  const before = await fs.readFile(f.correctionsPath, "utf8");
  const preview = await f.service.preview(choice);
  assert.equal(preview.requiresConfirmation, true);
  assert.equal(preview.previousGermanName, "Hausstorch");
  await assert.rejects(f.service.save(preview), /bestätigt/);
  assert.equal(await fs.readFile(f.correctionsPath, "utf8"), before);
  assert.equal(f.activations(), 0);
});

test("Bestätigte Namenswahl erhält Englisch, Identität, Hinweis und vorherigen Namen; Replay ist idempotent", async (t) => {
  const f = await fixture(t, { protectedName: true });
  const preview = await f.service.preview(choice);
  assert.equal((await f.service.save({ ...preview, confirmed: true })).saved, true);
  const saved = JSON.parse(await fs.readFile(f.correctionsPath, "utf8")).entries[0];
  assert.equal(saved.englishName, "White Stork");
  assert.equal(saved.note, "Eigene Pflege");
  assert.equal(saved.namePreference.previousGermanName, "Hausstorch");
  assert.equal(saved.namePreference.masterTaxonId, "mtx_stork");
  assert.equal((await f.service.save({ ...preview, confirmed: true })).unchanged, true);
  assert.equal(f.activations(), 1);
  const undo = await f.service.preview({ masterTaxonId: choice.masterTaxonId, usePrevious: true });
  assert.equal(undo.germanName, "Hausstorch");
  assert.equal(undo.requiresConfirmation, true);
  await f.service.save({ ...undo, confirmed: true });
  assert.equal(f.taxon.germanName, "Hausstorch");
});

test("Reiner Anbietervorschlag braucht keine zusätzliche Bestätigung; andere offene Korrekturen werden nicht veröffentlicht", async (t) => {
  const f = await fixture(t);
  const preview = await f.service.preview(choice);
  assert.equal(preview.requiresConfirmation, false);
  f.versions.masterCorrectionRevision = "different";
  await assert.rejects(f.service.save(preview), /noch nicht aktivierte/);
  assert.equal(f.activations(), 0);
});

test("Zwischenzeitliche Änderung und falsche Identität werden abgewiesen", async (t) => {
  const f = await fixture(t);
  const preview = await f.service.preview(choice);
  f.taxon.germanName = "Zwischenzeitlich geändert";
  await assert.rejects(f.service.save({ ...preview, confirmed: true }), /Namensstand wurde verändert/);
  await assert.rejects(f.service.preview({ ...choice, masterTaxonId: "wrong" }), /eindeutige aktive Art/);
  f.versions.state = "updating";
  await assert.rejects(f.service.preview(choice));
  assert.equal(f.activations(), 0);
});

test("Aktivierungsfehler wird als gespeichert, aber noch nicht aktiviert gemeldet", async (t) => {
  const f = await fixture(t, { activationFails: true });
  const preview = await f.service.preview(choice);
  const result = await f.service.save(preview);
  assert.equal(result.saved, false);
  assert.equal(result.pending, true);
  assert.equal(f.taxon.germanName, "Hausstorch");
  assert.match(result.message, /noch nicht aktiviert/);
  f.setActivationFailure(false);
  assert.equal((await f.service.save(preview)).saved, true);
  assert.equal(f.taxon.germanName, "Weißstorch");
});

test("Fehlende gemeinsame Identität wird vor Änderung der Korrekturdatei erkannt", async (t) => {
  const f = await fixture(t);
  const service = createTaxonomyNamePreferenceService({ ...f, prepare: async () => { throw new Error("Identität nicht eindeutig"); } });
  const before = await fs.readFile(f.correctionsPath, "utf8");
  const preview = await service.preview(choice);
  await assert.rejects(service.save(preview), /Identität nicht eindeutig/);
  assert.equal(await fs.readFile(f.correctionsPath, "utf8"), before);
  assert.equal(f.activations(), 0);
});

test("Wiederholung aktiviert keine später hinzugekommenen fremden Korrekturen", async (t) => {
  const f = await fixture(t, { activationFails: true });
  const preview = await f.service.preview(choice);
  await f.service.save(preview);
  const document = JSON.parse(await fs.readFile(f.correctionsPath, "utf8"));
  document.entries.push({ scientificName: "Other species", germanName: "Andere Entscheidung" });
  await fs.writeFile(f.correctionsPath, JSON.stringify(document));
  await assert.rejects(f.service.save(preview), /Namensstand wurde verändert/);
  assert.equal(f.activations(), 1);
});

test("Gemeinsame Schreibsperre verhindert parallele Korrekturen und wird auch nach Fehler freigegeben", async (t) => {
  const f = await fixture(t);
  await withTaxonomyCorrectionLock(f.taxonomyRoot, async () => {
    await assert.rejects(withTaxonomyCorrectionLock(f.taxonomyRoot, async () => {}), /bereits verarbeitet/);
  });
  await assert.rejects(withTaxonomyCorrectionLock(f.taxonomyRoot, async () => { throw new Error("fixture"); }));
  await withTaxonomyCorrectionLock(f.taxonomyRoot, async () => {});
});

test("Schreibfähiger Lightroom-Helfer erlaubt ausschließlich Vorschau und bestätigte Speicherung", async (t) => {
  const f = await fixture(t);
  assert.equal((await handleNamePreferenceRequest({ command: "preview", ...choice }, f.service)).ok, true);
  assert.equal((await handleNamePreferenceRequest({ command: "search", ...choice }, f.service)).ok, false);
});
