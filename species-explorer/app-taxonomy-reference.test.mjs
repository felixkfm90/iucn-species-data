import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-taxonomy-reference.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "app-taxonomy-reference.js" }).runInContext(context);
const taxonomyReference = context.SpeciesExplorerTaxonomyReference;

test("Such-URL begrenzt die Suche auf Richtung, Reich und Ergebniszahl", () => {
  const url = taxonomyReference.taxonomySearchUrl({
    query: "Stieglitz & Zeisig",
    kind: "vernacular",
    kingdomId: "Animalia",
    language: "de",
    rank: "species",
    limit: 12,
  });
  assert.equal(
    url,
    "/api/taxonomy/search?q=Stieglitz%20%26%20Zeisig&kind=vernacular&kingdomId=Animalia&language=de&rank=species&limit=12",
  );
});

test("Fehlende Referenz wird als manuelle, nicht blockierende Eingabe dargestellt", () => {
  assert.deepEqual(
    { ...taxonomyReference.taxonomyAvailabilityPresentation({
      available: false,
      message: "Lokale Referenz fehlt.",
    }) },
    {
      state: "unavailable",
      label: "Manuelle Eingabe",
      message: "Lokale Referenz fehlt.",
    },
  );
  assert.equal(
    taxonomyReference.taxonomyAvailabilityPresentation({ available: true }).label,
    "Referenz verfügbar",
  );
});

test("der Assistent verwendet den verschachtelten Referenzstatus der Wartungs-API", () => {
  const status = {
    status: "idle",
    message: "Noch keine Aktualisierung gestartet.",
    reference: {
      available: true,
      releaseId: "col-xr-2026-07-17-315834",
    },
  };
  assert.deepEqual(
    { ...taxonomyReference.taxonomyReferenceStatus(status) },
    { ...status.reference },
  );
  assert.equal(
    taxonomyReference.taxonomyAvailabilityPresentation(status).state,
    "available",
  );
});

test("Alle Reiche und Animalia stehen vor den alphabetisch sortierten übrigen Reichen", () => {
  const sorted = taxonomyReference.sortTaxonomyKingdoms([
    { id: "Animalia", label: "Tiere (Animalia)" },
    { id: "Plantae", label: "Pflanzen (Plantae)" },
    { id: "Chromista", label: "Chromisten (Chromista)" },
    { id: "Fungi", label: "Pilze (Fungi)" },
  ], {
    includesAllOption: true,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(sorted)),
    [
      { id: "all", label: "Alle Reiche" },
      { id: "Animalia", label: "Tiere (Animalia)" },
      { id: "Chromista", label: "Chromisten (Chromista)" },
      { id: "Plantae", label: "Pflanzen (Plantae)" },
      { id: "Fungi", label: "Pilze (Fungi)" },
    ],
  );
});

test("Trefferdarstellung trennt deutschen Namen, akzeptierten Namen und Synonym", () => {
  const result = taxonomyReference.taxonomyResultPresentation({
    taxonId: 42,
    germanName: "Stieglitz",
    acceptedScientificName: "Carduelis carduelis",
    matchedTerm: "Fringilla carduelis",
    kingdom: { label: "Tiere" },
    rank: "species",
    hasVerifiedGermanName: true,
    synonym: {
      scientificName: "Fringilla carduelis",
      acceptedScientificName: "Carduelis carduelis",
    },
  });
  assert.equal(result.title, "Stieglitz");
  assert.equal(result.subtitle, "Carduelis carduelis");
  assert.equal(result.note, "Gefunden als Synonym: Fringilla carduelis");
  assert.equal(result.kingdom, "Tiere");
  assert.equal(result.rank, "Art");
  assert.equal(result.source, "");
  assert.equal(result.taxonId, "42");
});

test("englischer Name wird ohne deutschen Namen sichtbar als Ersatz gekennzeichnet", () => {
  const result = taxonomyReference.taxonomyResultPresentation({
    taxonId: 84,
    germanName: null,
    englishName: "Red fox",
    acceptedScientificName: "Vulpes vulpes",
    matchedTerm: "Vulpes vulpes",
    kingdom: { label: "Tiere" },
    rank: "species",
    hasVerifiedGermanName: false,
  });
  assert.equal(result.title, "Red fox");
  assert.equal(result.subtitle, "Vulpes vulpes");
  assert.equal(result.usesEnglishFallback, true);
  assert.equal(result.note, "Englischer Ersatzname");

  const detail = taxonomyReference.taxonomyDetailPresentation({
    scientific_name: "Vulpes vulpes",
    germanNames: [],
    englishNames: [{ name: "Red fox" }],
    hierarchy: [],
  }, {
    germanName: null,
    englishName: "Red fox",
    hasVerifiedGermanName: false,
  });
  assert.equal(detail.germanName, "");
  assert.equal(detail.englishName, "Red fox");
  assert.equal(detail.displayName, "Red fox");
  assert.equal(detail.nameToApply, "Red fox");
  assert.equal(detail.usesEnglishFallback, true);
});

test("Detaildarstellung liefert Hierarchie, Quelle und manuellen Animalia-Fallback", () => {
  const detail = taxonomyReference.taxonomyDetailPresentation({
    scientific_name: "Carduelis carduelis",
    source_id: "COL:123",
    source: "Catalogue of Life",
    releaseId: "col-xr-2026-07-17",
    germanNames: [{ name: "Stieglitz" }],
    hierarchy: [
      { rank: "kingdom", scientific_name: "Animalia" },
      { rank: "species", scientific_name: "Carduelis carduelis" },
    ],
    manualGermanNameFallback: {
      provider: "Animalia.bio",
      url: "https://animalia.bio/search?query=Carduelis%20carduelis",
    },
    rank: "species",
    status: "accepted",
    trust_tier: "base",
  }, {
    germanName: "Stieglitz",
    hasVerifiedGermanName: true,
  });
  assert.equal(detail.germanName, "Stieglitz");
  assert.equal(detail.hierarchy[0].label, "Reich");
  assert.equal(detail.hierarchy[1].label, "Art");
  assert.equal(detail.sourceId, "COL:123");
  assert.equal(detail.rank, "Art");
  assert.equal(detail.status, "accepted");
  assert.equal(detail.trustTier, "base");
  assert.equal(detail.manualGermanNameFallback.provider, "Animalia.bio");
});
