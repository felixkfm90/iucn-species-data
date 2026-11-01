import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { projectSpeciesRecordToExplorer } from "./species-view.mjs";

function object() {
  const file = (name, mimeType) => ({ id: `fixture-owl:${name.replace(".", "-")}`, bytes: 128, sha256: "a".repeat(64), mimeType,
    url: `https://felixkfm90.github.io/iucn-species-data/species-assets/Gruener%20Leguan/${name}` });
  return { kind: "species", id: "fixture-owl", revision: "server-version", localPending: true, localConflict: false, approval: "draft", data: {
    type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Neuer gemeinsamer Name", english: "New common name", genus: "Strix", species: "fixture", size: "40 cm", weight: "450 g", life_expectancy: "15 Jahre",
      privateUnknown: "Private unknown input sentinel" },
    generated: { URLSlug: "fixture-owl", "Deutscher Name": "Vorheriger Name", "Englischer Name": "Old common name", "Wissenschaftlicher Name": "Strix fixture",
      "Größe": "30 cm", Gewicht: "400 g", Lebenserwartung: "12 Jahre", "Assessment ID": 123, Kategorie: "Least Concern", Status: "LC", Trend: "Stable",
      "Populationgröße": "1000", Generationsdauer: "3 Jahre", "Letztes IUCN Update": "2025", "Daten abgerufen": "2026-10-31T12:00:00.000Z",
      Kingdom: "ANIMALIA", Phylum: "CHORDATA", Subphylum: "VERTEBRATA", Class: "AVES", Order: "STRIGIFORMES", Family: "STRIGIDAE", Genus: "Strix", Species: "fixture",
      privateGenerated: "Private generated sentinel", localPath: "D:\\Private\\generated.json" },
    taxonomyOverride: { reason: "Manuell bestätigte Familie", automaticFields: { family: "Originalidae", privatePath: "D:\\Private\\tax.json" }, privateTaxonomy: "Private taxonomy sentinel" },
    assessmentBinding: { id: 123, privateContext: "Private assessment sentinel" },
    assets: { assetName: "Gruener Leguan", files: {
      "map.jpg": file("map.jpg", "image/jpeg"), "sound.mp3": file("sound.mp3", "audio/mpeg"), "spectrogram.webp": file("spectrogram.webp", "image/webp"),
      "portrait.webp": file("portrait.webp", "image/webp"), "credits.json": file("credits.json", "application/json"),
    }, overrides: { map: { manual: true, careMode: "manual", source: "Eigene Kartierung", reason: "Bewusste Kartenpflege", provenance: { provider: "own", privatePath: "D:\\Private\\map.jpg" } },
      sound: { manual: true, reason: "Bewusste Tonpflege" }, spectrogram: { soundSha256: "a".repeat(64), spectrogramSha256: "a".repeat(64), generatedAt: "2026-10-31" },
      portrait: { sha256: "a".repeat(64), metadataSha256: "b".repeat(64), source: "Eigene Illustration" } },
    credits: { source: "Aufnahmequelle", recordist: "Synthetic Recordist", quality: "A", country: "Deutschland", license: "https://creativecommons.org/licenses/by-nc/4.0/",
      url: "https://example.org/recording", notes: "Private credit notes sentinel", location: "Private precise location sentinel" },
    portraitMetadata: { type: "Illustration", source: "Eigene Illustration", prompt: "Private prompt sentinel", imported_at: "2026-10-31", original_file: "D:\\Private\\photo.webp" } },
    editorial: { websiteUrl: null, sections: [{ id: "appearance", title: "Aussehen", text: "Redaktioneller Fachtext", intentionallyEmpty: false }],
      gallery: [], generalSectionId: null, embeddedGeneralText: null },
  } };
}

test("pure normal-view projection preserves shared input and bound generated differences without private records or identity wrappers", () => {
  const source = object(), before = structuredClone(source), view = projectSpeciesRecordToExplorer(source, { permissions: { canEdit: true }, status: { connection: "offline" } });
  assert.deepEqual(source, before);
  assert.equal(view.id, undefined); assert.equal(view.editRevision, undefined); assert.equal(view.sourceScope, undefined);
  assert.equal(view.germanName, "Neuer gemeinsamer Name"); assert.equal(view.englishName, "New common name");
  assert.equal(view.safeName, "Gruener Leguan"); assert.equal(view.slug, "fixture-owl");
  assert.equal(view.manual.size, "40 cm"); assert.equal(view.iucn.assessmentId, "123"); assert.equal(view.iucn.status, "LC");
  assert.equal(view.taxonomy.subphylum, "Vertebrata"); assert.equal(view.taxonomy.className, "Aves");
  assert.equal(view.taxonomy.manuallyEdited, true); assert.deepEqual(view.taxonomy.automaticFields, { family: "Originalidae" });
  const mismatch = view.fieldMismatches.find((entry) => entry.field === "Größe");
  assert.equal(mismatch.input, "40 cm"); assert.equal(mismatch.generated, "30 cm");
  assert.match(mismatch.message, /gebundener erzeugter Fassung/);
  assert.ok(view.fieldMismatches.some((entry) => entry.field === "Deutscher Name" && entry.generated === "Vorheriger Name"));
  assert.equal(view.sourcePermissions.canEditManual, true);
  for (const [key, value] of Object.entries(view.sourcePermissions)) if (key !== "canEditManual") assert.equal(value, false);
  assert.equal(view.sourceInfo.connection, "offline"); assert.equal(view.sourceInfo.localPending, true);
  assert.deepEqual(view.editorial.sections, source.data.editorial.sections); assert.notEqual(view.editorial.sections, source.data.editorial.sections);
  const serialized = JSON.stringify(view);
  for (const hidden of ["Private unknown input sentinel", "Private generated sentinel", "Private taxonomy sentinel", "Private assessment sentinel", "Private credit notes sentinel",
    "Private precise location sentinel", "Private prompt sentinel", "D:\\Private", "original_file", "privatePath"]) assert.ok(!serialized.includes(hidden), hidden);
});

test("all displayed media remain explicit online references with no local bytes, verification or fabricated backup", () => {
  const source = object(), view = projectSpeciesRecordToExplorer(source);
  for (const [key, asset] of Object.entries(view.assets)) {
    assert.equal(asset.exists, true, key); assert.equal(asset.availableOnline, true, key);
    assert.equal(asset.localExists, false); assert.equal(asset.bytesVerified, false); assert.equal(asset.hashVerified, false);
    assert.equal(asset.storage, "public-https-reference"); assert.equal(asset.availability, "online-only");
    assert.equal(asset.assetName, "Gruener Leguan"); assert.match(asset.url, /Gruener%20Leguan/); assert.doesNotMatch(asset.url, /Neuer/);
    assert.deepEqual(asset.backup, { exists: false, path: "", updatedAt: "", bytes: 0 });
  }
  assert.equal(view.assets.portrait.actualSha256, ""); assert.equal(view.assets.portrait.actualMetadataSha256, "");
  assert.equal(view.assets.spectrogram.actualSoundSha256, ""); assert.equal(view.assets.spectrogram.actualSpectrogramSha256, "");
  assert.equal(view.assets.portrait.hashTracked, true); assert.equal(view.assets.spectrogram.hashTracked, true);
  assert.match(view.careHints.join(" "), /Lokale Dateien, Erreichbarkeit und Dateihashes wurden nicht geprüft/);
  assert.equal(view.isNcSound, true); assert.equal(view.isManualMap, true); assert.equal(view.isManualSound, true);
  assert.equal(view.assets.map.source, "Eigene Kartierung"); assert.equal(view.assets.map.protectFromPipeline, true);
  assert.equal(view.soundMissingKnown, false); assert.equal(view.sourceInfo.localFilesInspected, false); assert.equal(view.sourceInfo.remoteFilesVerified, false);
});

test("missing sources and references have complete normal DTO defaults without guessing a failed search or local asset loss", () => {
  const source = object(); source.data.generated = null; source.data.taxonomyOverride = null; source.data.assets.files = {};
  source.data.assets.credits = null; source.data.assets.portraitMetadata = null; source.data.assets.overrides = {};
  const view = projectSpeciesRecordToExplorer(source, { permissions: { canEdit: false }, status: { connection: "online" } });
  assert.equal(view.inInput, true); assert.equal(view.inGenerated, false); assert.equal(view.slug, "fixture-owl");
  assert.equal(view.iucn.status, "Unbekannt"); assert.equal(view.taxonomy.subphylum, "Unbekannt"); assert.equal(view.taxonomy.genus, "Strix");
  assert.equal(view.taxonomy.manuallyEdited, false); assert.equal(view.taxonomy.automaticFields, null);
  for (const asset of Object.values(view.assets)) {
    assert.equal(asset.exists, false); assert.equal(asset.localExists, false); assert.equal(asset.url, ""); assert.equal(asset.bytes, 0); assert.equal(asset.hashVerified, false);
  }
  for (const key of ["dataIssues", "assetIssues", "inconsistencies", "fieldMismatches", "careHints"]) assert.ok(Array.isArray(view[key]), key);
  assert.equal(view.missingPortrait, true); assert.equal(view.soundCareHint, true); assert.equal(view.soundMissingKnown, false);
  assert.match(view.assetIssues.join(" "), /öffentlicher Medienverweis/);
  assert.doesNotMatch(view.assetIssues.join(" "), /Pipeline|auf dem PC|Hash stimmt nicht/);
  assert.equal(view.sourcePermissions.canEditManual, false);
});

test("a declared file without public URL remains unavailable and private path-like metadata is excluded", () => {
  const source = object(); delete source.data.assets.files["map.jpg"].url;
  source.data.assets.overrides.map.source = "D:\\Private\\map.jpg";
  source.data.assets.overrides.map.reason = "Datei unter /volume1/private/map.jpg";
  source.data.assets.credits.source = "file:///private/source";
  source.data.assets.credits.url = "https://example.org/private?token=secret";
  source.data.assets.portraitMetadata.source = "\\\\server\\private\\photo.jpg";
  const view = projectSpeciesRecordToExplorer(source);
  assert.equal(view.assets.map.exists, false); assert.equal(view.assets.map.declaredBytes, 128); assert.equal(view.assets.map.url, "");
  assert.equal(view.assets.map.availability, "not-provided"); assert.equal(view.assets.map.source, ""); assert.equal(view.assets.map.manualReason, "");
  assert.equal(view.credits.source, ""); assert.equal(view.credits.url, "");
  assert.equal(view.assets.portrait.metadata.source, "");
  assert.doesNotMatch(JSON.stringify(view), /Private|\/volume1\/private|token=secret|file:\/\//);
});

test("browser-provider care and declared stale spectrum remain distinct from local verification and generic editing permission", () => {
  const source = object();
  source.data.assets.overrides.map = { careMode: "provider", manual: false, protectFromPipeline: true,
    provenance: { provider: "iucn", acquisition: "browser-file", assurance: "user-declared", assessmentId: "123", canonicalUrl: "https://www.iucnredlist.org/123" } };
  source.data.assets.overrides.spectrogram.stale = true;
  source.data.assets.overrides.spectrogram.reason = "Als veraltet gebundener Sound";
  const view = projectSpeciesRecordToExplorer(source, { permissions: { canEdit: false } });
  assert.equal(view.assets.map.browserImported, true); assert.equal(view.assets.map.ownCare, false); assert.equal(view.assets.map.protectFromPipeline, true);
  assert.equal(view.assets.map.provenance.assurance, "user-declared"); assert.equal(view.assets.map.provenance.assessmentId, "123");
  assert.equal(view.assets.spectrogram.stale, true); assert.equal(view.assets.spectrogram.staleReason, "Als veraltet gebundener Sound");
  assert.equal(view.assets.spectrogram.hashVerified, false); assert.equal(view.sourcePermissions.canEditManual, false);
  assert.ok(view.assetIssues.some((issue) => issue.includes("als veraltet markiert")));
  assert.throws(() => projectSpeciesRecordToExplorer({ ...source, id: "different-object" }));
});

test("normal dashboard, filters and existing detail renderer accept populated and empty projected views", async () => {
  const context = vm.createContext({ URL, setTimeout, clearTimeout });
  for (const filename of ["app-presentation.js", "app-media.js", "app-dashboard.js", "filter.js", "app-detail-view.js"]) {
    new vm.Script(await readFile(new URL(`../public/${filename}`, import.meta.url), "utf8"), { filename }).runInContext(context);
  }
  const presentation = context.SpeciesExplorerPresentation, media = context.SpeciesExplorerMedia.createMediaRenderers(presentation);
  const detailPanel = { innerHTML: "" }, noop = () => {}, statusCalls = [];
  const render = context.SpeciesExplorerDetailView.createDetailViewRenderer({ ...presentation, ...media,
    assetStatusText: (asset) => { statusCalls.push(asset); return presentation.assetStatusText(asset); },
    state: {}, elements: { detailPanel }, sizeUnits: [], weightUnits: [], ageUnits: [],
    parseManualMeasurement: (value) => ({ value: String(value), unit: "cm" }), renderUnitOptions: () => "", renderManualMeasurementEditor: () => "",
    iucnDistributionMapUrl: () => "", setupAudioPlayer: noop, setupMapZoom: noop, setupPortraitZoom: noop,
    setupSpeciesEditor: noop, setupSpeciesRefresh: noop, setupSpeciesDelete: noop,
  });
  const source = object(); source.data.editorial.sections[0].text = "<script>Fachtext</script>";
  const full = { id: "fixture-owl", source: "shared-project", ...projectSpeciesRecordToExplorer(source, { permissions: { canEdit: true } }) };
  assert.doesNotThrow(() => render(full));
  assert.ok(detailPanel.innerHTML.includes("Neuer gemeinsamer Name")); assert.ok(detailPanel.innerHTML.includes("Unterstamm"));
  assert.ok(detailPanel.innerHTML.includes("Gruener%20Leguan")); assert.ok(!detailPanel.innerHTML.includes("Private prompt sentinel"));
  assert.match(detailPanel.innerHTML, /&lt;script&gt;Fachtext&lt;\/script&gt;/); assert.doesNotMatch(detailPanel.innerHTML, /<script>Fachtext/);
  assert.equal(statusCalls.length, 0, "online references must not use the formatter for locally checked files");
  assert.match(detailPanel.innerHTML, /Online verfügbar · noch nicht auf diesem Gerät geprüft/);
  assert.match(detailPanel.innerHTML, /data-edit-section="manual"/);
  assert.match(detailPanel.innerHTML, /Speichern merkt die Änderung lokal für „Änderungen abgleichen“ vor\. Freigabe und Websiteübernahme bleiben eigene Schritte\./);
  for (const section of ["map", "sound", "portrait", "taxonomy"]) assert.ok(!detailPanel.innerHTML.includes(`data-edit-section="${section}"`));
  assert.doesNotMatch(detailPanel.innerHTML, /class="refresh-species-open"|class="delete-species-open|class="inline-delete-open/);
  const item = context.SpeciesExplorerDashboard.createSpeciesListItemPresentation(full, presentation);
  assert.equal(item.germanName, full.germanName); assert.ok(item.flags.some((flag) => flag.label === "K"));
  assert.equal(context.SpeciesExplorerFilters.filterSpecies([full], { query: "Gruener Leguan", flag: "manual-map" }).length, 1);
  assert.equal(context.SpeciesExplorerFilters.filterSpecies([full], { status: "EN" }).length, 0);
  const empty = object(); empty.data.generated = null; empty.data.assets.files = {}; empty.data.assets.credits = null; empty.data.assets.portraitMetadata = null;
  assert.doesNotThrow(() => render({ id: empty.id, source: "shared-project", ...projectSpeciesRecordToExplorer(empty) }));
  assert.match(detailPanel.innerHTML, /Keine Sounddatei vorhanden/);
  assert.equal(statusCalls.length, 0);
  assert.match(detailPanel.innerHTML, /Noch kein Medienverweis bereitgestellt/);

  const local = structuredClone(full); local.source = "local";
  local.assets.map.stale = true; local.assets.map.staleReason = "Isolierte lokale Hashabweichung";
  local.assets.sound.hashVerified = true;
  assert.doesNotThrow(() => render(local));
  assert.ok(statusCalls.includes(local.assets.map)); assert.ok(statusCalls.includes(local.assets.sound));
  assert.match(detailPanel.innerHTML, /Veraltet · Isolierte lokale Hashabweichung/);
  assert.match(detailPanel.innerHTML, /Soundhash geprüft/);
  assert.doesNotMatch(detailPanel.innerHTML, /Online verfügbar · noch nicht auf diesem Gerät geprüft/);
  for (const section of ["map", "sound", "portrait", "taxonomy"]) assert.ok(detailPanel.innerHTML.includes(`data-edit-section="${section}"`));
  assert.match(detailPanel.innerHTML, /class="refresh-species-open"/);
  assert.match(detailPanel.innerHTML, /class="delete-species-open/);
});
