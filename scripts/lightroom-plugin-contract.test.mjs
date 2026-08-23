import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(
  ROOT,
  "lightroom-plugin",
  "FNWildlifeTaxonomy.lrplugin",
);

async function source(file) {
  return fs.readFile(path.join(PLUGIN_ROOT, file), "utf8");
}

test("Lightroom-Plug-in besitzt deutsche Aktionen und vollständigen Metadatenvertrag", async () => {
  const info = await source("Info.lua");
  const metadata = await source("MetadataDefinition.lua");
  const ranks = await source("TaxonomyRanks.lua");
  assert.match(info, /LrToolkitIdentifier\s*=\s*"de\.fnwildlifetravel\.taxonomy"/);
  assert.match(info, /Taxonomie zuweisen/);
  assert.match(info, /Ausgewähltes Foto als Favoritenbild der Art markieren/);
  assert.match(info, /FN Wildlife-Sammlungen einrichten/);
  assert.match(info, /Taxonomie-Statistik/);
  assert.match(info, /LrMetadataProvider\s*=\s*"MetadataDefinition\.lua"/);
  assert.match(info, /LrMetadataTagsetFactory\s*=\s*"MetadataTagset\.lua"/);
  assert.match(info, /LrPluginInfoProvider\s*=\s*"PluginInfoProvider\.lua"/);
  assert.match(info, /minor\s*=\s*4[\s\S]*?revision\s*=\s*0[\s\S]*?build\s*=\s*1/);
  for (const field of [
    "masterTaxonId",
    "projectTaxonId",
    "germanName",
    "englishName",
    "scientificName",
    "taxonRank",
    "taxonomyPath",
    "referenceImage",
    "assignedAt",
  ]) {
    assert.match(metadata, new RegExp(`id\\s*=\\s*"${field}"`));
  }
  assert.match(metadata, /local TaxonomyRanks = require "TaxonomyRanks"/);
  assert.match(metadata, /for _, rank in ipairs\(TaxonomyRanks\.all\(\)\)/);
  assert.match(metadata, /schemaVersion\s*=\s*4/);
  for (const field of ["masterTaxonId", "projectTaxonId", "taxonomyPath", "referenceImage"]) {
    assert.match(
      metadata,
      new RegExp(`id\\s*=\\s*"${field}"[\\s\\S]*?version\\s*=\\s*2`),
      `${field} benötigt für die Lightroom-Katalogmigration eine eigene Feldversion`,
    );
  }
  assert.match(metadata, /title\s*=\s*"Favoritenbild der Art"/);
  for (const rank of [
    "domain",
    "superkingdom",
    "kingdom",
    "subkingdom",
    "infrakingdom",
    "superphylum",
    "phylum",
    "subphylum",
    "infraphylum",
    "parvphylum",
    "superclass",
    "megaclass",
    "class",
    "subclass",
    "infraclass",
    "parvclass",
    "superorder",
    "order",
    "suborder",
    "infraorder",
    "parvorder",
    "superfamily",
    "family",
    "subfamily",
    "tribe",
    "subtribe",
    "genus",
    "subgenus",
    "section",
    "species",
    "subspecies",
    "variety",
    "form",
  ]) {
    assert.match(ranks, new RegExp(`id\\s*=\\s*"${rank}"`));
  }
  assert.doesNotMatch(metadata, /masterVersion|packageVersion|providerVersion/);
});

test("Schwebende Zuweisung nutzt nur Suchhelfer und offizielle Katalog-API", async () => {
  const helper = await source("TaxonomyHelper.lua");
  const json = await source("Json.lua");
  const assignment = await source("AssignTaxonomy.lua");
  const window = await source("AssignmentWindow.lua");
  const writer = await source("KeywordWriter.lua");
  assert.match(helper, /lightroom-search-helper\.mjs/);
  assert.match(helper, /resolveNodePath/);
  assert.doesNotMatch(helper, /(?:os|LrSystemInfo)\.getenv\s*\(/);
  assert.match(helper, /getStandardFilePath\("temp"\)/);
  assert.match(helper, /Program Files\\\\nodejs\\\\node\.exe/);
  assert.match(helper, /FN Wildlife Travel\/Arten-Explorer\/lightroom/);
  assert.match(helper, /--search-root=/);
  assert.match(helper, /fn-wildlife-taxonomy-command-/);
  assert.match(helper, /Technische Meldung/);
  assert.match(helper, /local Json = require "Json"/);
  assert.doesNotMatch(helper, /LrJson/);
  assert.match(json, /function Json\.encode\(value\)/);
  assert.match(json, /function Json\.decode\(text\)/);
  assert.match(helper, /--request=/);
  assert.match(helper, /--response=/);
  assert.match(helper, /local ok, result = LrTasks\.pcall\(executeRequest\)/);
  assert.match(helper, /local function writeTextFile\(path, content\)/);
  assert.match(helper, /local function readTextFile\(path\)/);
  assert.match(helper, /io\.open\(path, "wb"\)/);
  assert.match(helper, /io\.open\(path, "rb"\)/);
  assert.doesNotMatch(helper, /LrFileUtils\.(?:writeFile|readFile)/);
  assert.match(helper, /removeFile\(requestPath\)/);
  assert.match(helper, /removeFile\(responsePath\)/);
  assert.match(assignment, /AssignmentWindow\.show/);
  assert.match(
    assignment,
    /LrTasks\.pcall\(AssignmentWindow\.show, context\)/,
  );
  assert.match(window, /presentFloatingDialog/);
  assert.match(window, /catalog:getTargetPhotos\(\)/);
  assert.match(window, /command\s*=\s*"search"/);
  assert.match(window, /command\s*=\s*"taxon"/);
  assert.match(window, /command\s*=\s*"status"/);
  assert.match(window, /Lokale Masterdatenbank bereit/);
  assert.match(window, /factory:group_box/);
  assert.match(window, /1\. Aktuelle Lightroom-Auswahl/);
  assert.match(window, /2\. Art suchen und auswählen/);
  assert.match(window, /3\. Taxonomie prüfen/);
  assert.match(window, /4\. Taxonomie verwalten/);
  assert.match(window, /Ausgewählte Art zuweisen/);
  assert.match(window, /Taxonomie entfernen/);
  assert.match(window, /KeywordWriter\.remove/);
  assert.match(window, /Datei: /);
  assert.match(window, /" \+ " \.\. tostring\(#photos - 1\) \.\. " weitere"/);
  assert.match(window, /Lifelist: /);
  assert.match(window, /getFormattedMetadata\("fileName"\)/);
  assert.match(window, /action\s*=\s*function\(\)\s*\n\s*LrTasks\.startAsyncTask\(search\)/);
  assert.match(window, /title\s*=\s*"Schließen"/);
  assert.match(window, /activeDialogControls:close\(\)/);
  assert.match(window, /factory:spacer\(\{ fill_vertical = 1 \}\)/);
  assert.match(window, /fill_horizontal\s*=\s*1,\s*\n\s*fill_vertical\s*=\s*1,/);
  assert.match(window, /save_frame\s*=\s*"fnWildlifeTaxonomyAssignmentWindowV4"/);
  assert.match(window, /PluginState\.recentTaxa/);
  assert.match(window, /blockTask\s*=\s*true/);
  assert.match(window, /selectionChangeObserver/);
  assert.match(window, /windowWillClose/);
  assert.match(window, /activeDialogControls:toFront\(\)/);
  assert.match(window, /LrTasks\.pcall\(TaxonomyHelper\.request/);
  assert.match(window, /LrTasks\.pcall\(KeywordWriter\.assign/);
  assert.match(window, /LrTasks\.pcall\(function\(\)\s*\n\s*LrDialogs\.presentFloatingDialog/);
  assert.doesNotMatch(window, /12 \* 60 \* 60|LrTasks\.sleep\(0\.5\)/);
  assert.match(writer, /catalog:withWriteAccessDo/);
  assert.match(writer, /catalog:createKeyword/);
  assert.match(writer, /photo:addKeyword/);
  assert.match(writer, /photo:setPropertyForPlugin/);
  assert.match(writer, /PLUGIN_KEYWORD_ROOT\s*=\s*"FN Wildlife & Travel"/);
  assert.match(writer, /createKeyword\(catalog, "Taxonomie", root\)/);
  assert.match(writer, /keywordName\(current\) == "Taxonomie"/);
  assert.match(writer, /keywordName\(parent\) == PLUGIN_KEYWORD_ROOT/);
  assert.match(writer, /Alle sonstigen, auch manuell gepflegten Stichwörter bleiben erhalten/);
  assert.match(writer, /removeManagedKeywords/);
  assert.match(writer, /clearPluginMetadata/);
  assert.match(writer, /PluginState\.markStatisticsDirty/);
  assert.match(writer, /utf8Prefix\(value, 460\)/);
  assert.match(writer, /utf8Prefix\(value, 240\)/);
  assert.match(writer, /for _, rank in ipairs\(TaxonomyRanks\.all\(\)\)/);
  assert.match(writer, /for _, entry in ipairs\(taxon\.hierarchy or \{\}\)/);
  assert.doesNotMatch(writer, /TaxonomyRanks\.label\(entry\.rank\)\s*\.\.\s*": "/);
  const uiAndWriter = `${assignment}\n${window}\n${writer}`;
  assert.doesNotMatch(uiAndWriter, /\.lrcat|sqlite3|taxonomy-search\.sqlite|\.xmp/i);
  assert.doesNotMatch(helper, /\.lrcat|sqlite3(?:\.exe)?|\.xmp/i);
  assert.match(helper, /species-explorer\/lightroom-search-helper\.mjs/);
});

test("Alle dauerhaften Plug-in-Fenster besitzen unten eine Schließen-Aktion", async () => {
  const assignment = await source("AssignmentWindow.lua");
  const statistics = await source("ShowStatistics.lua");
  assert.match(assignment, /title\s*=\s*"Schließen"[\s\S]*?activeDialogControls:close\(\)/);
  assert.match(statistics, /cancelVerb\s*=\s*"Schließen"/);
});

test("Abweichende vorhandene Taxonomie wird nicht still überschrieben", async () => {
  const writer = await source("KeywordWriter.lua");
  assert.match(writer, /getPropertyForPlugin\(_PLUGIN, "masterTaxonId"\)/);
  assert.match(writer, /existingId ~= taxon\.masterTaxonId/);
  assert.match(writer, /Der Prototyp überschreibt diese nicht/);
});

test("Favoritenbild der Art und Smart-Sammlungen bleiben abgeleitete Lightroom-Funktionen", async () => {
  const metadata = await source("MetadataDefinition.lua");
  const reference = await source("ReferenceImage.lua");
  const referenceAction = await source("SetReferenceImage.lua");
  const collections = await source("SmartCollections.lua");
  assert.match(metadata, /id\s*=\s*"referenceImage"[\s\S]*?dataType\s*=\s*"enum"/);
  assert.match(metadata, /value\s*=\s*"yes"/);
  assert.match(metadata, /value\s*=\s*"no"/);
  assert.match(reference, /masterTaxonId/);
  assert.match(reference, /referenceImage/);
  assert.match(reference, /candidate == photo and "yes" or "no"/);
  assert.match(reference, /catalog:withWriteAccessDo/);
  assert.match(reference, /PluginState\.markStatisticsDirty/);
  assert.match(referenceAction, /Zuerst Taxonomie zuweisen/);
  assert.match(referenceAction, /Favoritenbild der Art/);
  assert.match(referenceAction, /weder kopiert noch verändert/);
  assert.match(referenceAction, /LrDialogs\.confirm/);
  assert.match(collections, /catalog:createCollectionSet/);
  assert.match(collections, /catalog:createSmartCollection/);
  assert.match(collections, /Taxonomie zugewiesen/);
  assert.match(collections, /Taxonomie fehlt/);
  assert.match(collections, /Favoritenbilder der Arten/);
  assert.match(collections, /5-Sterne-Tierbilder/);
  const combined = `${reference}\n${collections}`;
  assert.doesNotMatch(combined, /TaxonomyHelper|lightroom-search-helper|\.lrcat|sqlite3/i);
});

test("Katalogstatistik ist cachebar und kann ausdrücklich neu berechnet werden", async () => {
  const state = await source("PluginState.lua");
  const statistics = await source("Statistics.lua");
  const dialog = await source("ShowStatistics.lua");
  assert.match(state, /statisticsCacheJson/);
  assert.match(state, /statisticsDirty/);
  assert.match(statistics, /catalog:getAllPhotos\(\)/);
  assert.match(statistics, /speciesCount/);
  assert.match(statistics, /familyCount/);
  assert.match(statistics, /referenceImageCount/);
  assert.match(statistics, /topSpecies/);
  assert.match(statistics, /classBreakdown/);
  assert.match(statistics, /math\.min\(10, #rows\)/);
  assert.match(dialog, /Neu berechnen/);
  assert.match(dialog, /LrProgressScope/);
  assert.match(dialog, /Taxonomie-Abdeckung/);
  assert.match(dialog, /Lifelist:/);
  assert.match(dialog, /Klassenverteilung/);
  assert.match(dialog, /Am häufigsten fotografierte Arten/);
  assert.match(dialog, /Noch keine Arten zugewiesen/);
});

test("Aufgeräumte Metadatenansicht und Plug-in-Info verbergen technische Felder", async () => {
  const tagset = await source("MetadataTagset.lua");
  const provider = await source("PluginInfoProvider.lua");
  const helper = await source("TaxonomyHelper.lua");
  assert.match(tagset, /FN Wildlife – Foto & Taxonomie/);
  const standardFields = [
    "com.adobe.filename",
    "com.adobe.captureDateTime",
    "com.adobe.imageCroppedDimensions",
    "com.adobe.copyright",
    "com.adobe.creator",
    "com.adobe.combinedCameraName",
    "com.adobe.lens",
    "com.adobe.focalLength",
    "com.adobe.apertureValue",
    "com.adobe.ISOSpeedRating",
    "com.adobe.shutterSpeedValue",
    "com.adobe.GPS",
  ];
  let previousIndex = -1;
  for (const field of standardFields) {
    const index = tagset.indexOf(`"${field}"`);
    assert.ok(index > previousIndex, `${field} muss im Standardblock in der erwarteten Reihenfolge stehen`);
    previousIndex = index;
  }
  assert.ok(
    previousIndex < tagset.indexOf('TOOLKIT_ID .. ".germanName"'),
    "Standard-Fotometadaten müssen vor den Taxonomiefeldern stehen",
  );
  assert.match(tagset, /TOOLKIT_ID \.\. "\.germanName"/);
  assert.match(tagset, /TOOLKIT_ID \.\. "\.englishName"/);
  assert.match(tagset, /TOOLKIT_ID \.\. "\.scientificName"/);
  assert.match(tagset, /TaxonomyRanks\.metadataFieldId\(rank\.id\)/);
  assert.doesNotMatch(tagset, /masterTaxonId|projectTaxonId|taxonomyPath/);
  assert.match(provider, /Version: 0\.4\.0\.1/);
  assert.match(provider, /TaxonomyHelper\.searchPackageStatus\(\)/);
  assert.match(provider, /Taxonomiedatenbank, Aktualisierungen und Sicherungen werden zentral im Arten-Explorer verwaltet/);
  assert.match(helper, /function TaxonomyHelper\.searchPackageStatus\(\)/);
  assert.match(helper, /taxonomy-search\.sqlite/);
  assert.match(helper, /manifest\.json/);
});
