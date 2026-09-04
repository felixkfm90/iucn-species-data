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
  const pluginMenu = await source("PluginMenu.lua");
  const provider = await source("PluginInfoProvider.lua");
  const metadata = await source("MetadataDefinition.lua");
  const ranks = await source("TaxonomyRanks.lua");
  assert.match(info, /LrToolkitIdentifier\s*=\s*"de\.fnwildlifetravel\.taxonomy"/);
  assert.match(
    info,
    /title = "Taxonomie zuweisen"[\s\S]*?file = "AssignTaxonomy\.lua"[\s\S]*?enabledWhen = "photosSelected"/,
  );
  assert.match(
    info,
    /title = "FN Wildlife verwalten \.\.\."[\s\S]*?file = "PluginMenu\.lua"/,
  );
  const libraryMenu = info.slice(
    info.indexOf("LrLibraryMenuItems"),
    info.indexOf("LrMetadataProvider"),
  );
  assert.equal(
    [...libraryMenu.matchAll(/file\s*=\s*"[^"]+"/g)].length,
    2,
    "Das native Lightroom-Menü muss auf zwei belegte Einstiegspunkte begrenzt bleiben",
  );
  for (const group of [
    "Taxonomie und Art",
    "Ort und Zeit – Auswahl",
    "FN-Daten aktualisieren und bereinigen",
    "Auswertung und Einrichtung",
  ]) {
    assert.match(pluginMenu, new RegExp(group));
  }
  for (const script of [
    "AssignTaxonomy.lua",
    "RemoveTaxonomy.lua",
    "SetReferenceImage.lua",
    "AddLocationTime.lua",
    "UpdateLocationTime.lua",
    "RemoveLocationTime.lua",
    "UpdateCatalogFnData.lua",
    "RemoveAllFnData.lua",
    "ShowStatistics.lua",
    "CreateCollections.lua",
  ]) {
    assert.match(pluginMenu, new RegExp(script.replace(".", "\\.")));
  }
  assert.match(pluginMenu, /ALLOWED_SCRIPTS\[action\.script\] = true/);
  assert.match(pluginMenu, /LrPathUtils\.child\(_PLUGIN\.path, script\)/);
  assert.match(pluginMenu, /LrTasks\.pcall\(dofile, path\)/);
  assert.match(pluginMenu, /title = "Schließen"[\s\S]*?dialogControls:close\(\)/);
  assert.match(pluginMenu, /title = "Taxonomie zuweisen \.\.\."[\s\S]*?script = "AssignTaxonomy\.lua"/);
  assert.match(pluginMenu, /Ort\/Zeit der Auswahl aktualisieren \.\.\./);
  assert.match(pluginMenu, /Gesamten Katalog aktualisieren \.\.\./);
  assert.match(info, /LrMetadataProvider\s*=\s*"MetadataDefinition\.lua"/);
  assert.match(info, /LrMetadataTagsetFactory\s*=\s*\{/);
  assert.match(info, /"MetadataTagset\.lua"/);
  assert.match(info, /"MetadataTagsetFull\.lua"/);
  assert.match(info, /LrPluginInfoProvider\s*=\s*"PluginInfoProvider\.lua"/);
  const version = info.match(
    /VERSION\s*=\s*\{[\s\S]*?major\s*=\s*(\d+)[\s\S]*?minor\s*=\s*(\d+)[\s\S]*?revision\s*=\s*(\d+)[\s\S]*?build\s*=\s*(\d+)/,
  );
  assert.ok(version, "Info.lua muss eine vollständig lesbare Plug-in-Version enthalten");
  assert.equal(version.slice(1).join("."), "0.4.24.6");
  assert.match(
    provider,
    new RegExp(`Version: ${version.slice(1).join("\\.")}`),
    "Zusatzmodul-Manager und Info.lua müssen dieselbe Plug-in-Version anzeigen",
  );
  for (const field of [
    "masterTaxonId",
    "projectTaxonId",
    "germanName",
    "englishName",
    "scientificName",
    "taxonRank",
    "taxonomyPath",
    "taxonomyKeywordIds",
    "locationTimeKeywordIds",
    "locationTimeKeywordNames",
    "fnLocation",
    "fnCity",
    "fnStateProvince",
    "fnCountry",
    "fnIsoCountryCode",
    "fnCaptureMonth",
    "fnCaptureYear",
    "locationTimeAssignedAt",
    "referenceImage",
    "assignedAt",
  ]) {
    assert.match(metadata, new RegExp(`id\\s*=\\s*"${field}"`));
  }
  assert.match(metadata, /local TaxonomyRanks = require "TaxonomyRanks"/);
  assert.match(metadata, /for _, rank in ipairs\(TaxonomyRanks\.all\(\)\)/);
  assert.match(metadata, /schemaVersion\s*=\s*7/);
  assert.match(
    metadata,
    /id\s*=\s*TaxonomyRanks\.metadataFieldId\(rank\.id\)[\s\S]*?version\s*=\s*2[\s\S]*?title\s*=\s*rank\.label/,
  );
  assert.doesNotMatch(metadata, /rank\.label\s*\.\.\s*" \(wissenschaftlich\)"/);
  assert.match(
    metadata,
    /id\s*=\s*"masterTaxonId"[\s\S]*?version\s*=\s*3/,
    "masterTaxonId benötigt nach Änderung der Suchbarkeit eine erhöhte Feldversion",
  );
  for (const field of ["projectTaxonId", "taxonomyPath", "referenceImage"]) {
    assert.match(
      metadata,
      new RegExp(`id\\s*=\\s*"${field}"[\\s\\S]*?version\\s*=\\s*2`),
      `${field} benötigt für die Lightroom-Katalogmigration eine eigene Feldversion`,
    );
  }
  assert.match(
    metadata,
    /id\s*=\s*"taxonomyKeywordIds"[\s\S]*?version\s*=\s*1[\s\S]*?searchable\s*=\s*false/,
  );
  for (const field of [
    "locationTimeKeywordIds",
    "locationTimeKeywordNames",
    "fnLocation",
    "fnCity",
    "fnStateProvince",
    "fnCountry",
    "fnIsoCountryCode",
    "fnCaptureMonth",
    "fnCaptureYear",
    "locationTimeAssignedAt",
  ]) {
    assert.match(
      metadata,
      new RegExp(`id\\s*=\\s*"${field}"[\\s\\S]*?version\\s*=\\s*1`),
    );
  }
  assert.match(
    metadata,
    /id\s*=\s*"masterTaxonId"[\s\S]*?searchable\s*=\s*true[\s\S]*?browsable\s*=\s*false/,
  );
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
  assert.match(helper, /lightroom-correction-helper\.mjs/);
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
  assert.match(window, /Artbezeichnung korrigieren \.\.\./);
  assert.match(window, /TaxonomyHelper\.openCorrection/);
  assert.match(window, /props\.canCorrect = isSpeciesTaxon\(currentTaxon\) and not props\.busy/);
  assert.match(window, /KeywordWriter\.remove/);
  assert.match(window, /Datei: /);
  assert.match(window, /fileName ~= "" and \("Datei: " \.\. fileName\) or "1 Foto ausgewählt"/);
  assert.match(window, /selectionLabel = photoCountText\(#photos\) \.\. " ausgewählt"/);
  assert.doesNotMatch(window, /Unbenanntes Foto|\+ [^\n]*weitere/);
  assert.doesNotMatch(window, /require "Statistics"|lifelistStatus|refreshLifelist|Lifelist/);
  assert.match(window, /getFormattedMetadata\("fileName"\)/);
  assert.match(window, /local function startSearch\(\)/);
  assert.match(window, /searchRequestSerial\s*=\s*searchRequestSerial \+ 1/);
  assert.match(
    window,
    /factory:edit_field\(\{[\s\S]*?value\s*=\s*bind\("query"\)[\s\S]*?immediate\s*=\s*true[\s\S]*?\}\),\s*factory:push_button\(\{[\s\S]*?title\s*=\s*"Art suchen"[\s\S]*?action\s*=\s*startSearch/,
    "Suchfeld und Suchbutton müssen denselben unmittelbar gebundenen Suchtext verwenden",
  );
  assert.match(window, /props:addObserver\("query", function\(\)/);
  assert.match(window, /scheduleAutoSearch\s*=\s*function\(\)/);
  assert.match(window, /LrTasks\.sleep\(0\.5\)/);
  assert.match(window, /currentTaxon\s*=\s*nil[\s\S]*?props\.masterTaxonId\s*=\s*""/);
  assert.match(window, /query ~= "" and query ~= cleanText\(currentTaxonQuery\)/);
  assert.match(window, /title = "Artauswahl prüfen"|"Artauswahl prüfen"/);
  assert.doesNotMatch(window, /validate\s*=\s*function\(_, value\)/);
  assert.doesNotMatch(window, /is_default\s*=/);
  assert.match(window, /title\s*=\s*"Schließen"/);
  assert.match(window, /activeDialogControls:close\(\)/);
  assert.doesNotMatch(window, /factory:spacer\(\{ fill_vertical = 1 \}\)/);
  assert.match(window, /fill_horizontal\s*=\s*1,\s*\n\s*fill_vertical\s*=\s*1,/);
  assert.match(window, /height\s*=\s*150/);
  assert.match(window, /ASSIGNMENT_WINDOW_WIDTH\s*=\s*960/);
  assert.match(window, /TAXONOMY_PREVIEW_WIDTH\s*=\s*ASSIGNMENT_WINDOW_WIDTH - 30/);
  assert.match(window, /local function setPreview\(value\)/);
  assert.match(window, /string\.gmatch\(text \.\. "\\n", "\(\.\-\)\\n"\)/);
  assert.match(window, /props\.previewLines\s*=\s*lines/);
  assert.match(window, /title\s*=\s*line == "" and " " or line/);
  assert.match(window, /value\s*=\s*tostring\(#lines \+ 1\)/);
  assert.match(window, /props\.previewSelection\s*=\s*\{\}/);
  assert.match(window, /factory:simple_list\(\{/);
  assert.match(window, /items\s*=\s*bind\("previewLines"\)/);
  assert.match(window, /width\s*=\s*TAXONOMY_PREVIEW_WIDTH/);
  assert.doesNotMatch(window, /background_color|local LrColor/);
  assert.doesNotMatch(window, /PREVIEW_LINE_LIMIT|previewLineVisible|previewLineViews/);
  assert.doesNotMatch(window, /width\s*=\s*760/);
  assert.doesNotMatch(window, /width\s*=\s*740/);
  assert.doesNotMatch(window, /height_in_lines\s*=\s*-1/);
  assert.doesNotMatch(window, /previewLineCount|textLineCount/);
  assert.doesNotMatch(window, /height_in_lines\s*=\s*32/);
  assert.match(window, /resizable\s*=\s*false/);
  assert.match(window, /width\s*=\s*ASSIGNMENT_WINDOW_WIDTH/);
  assert.match(window, /height\s*=\s*565/);
  assert.match(window, /save_frame\s*=\s*"fnWildlifeTaxonomyAssignmentWindowV6"/);
  assert.match(window, /PluginState\.recentTaxa/);
  assert.match(window, /blockTask\s*=\s*true/);
  assert.match(window, /selectionChangeObserver/);
  assert.match(window, /local function scheduleSelectionRefresh\(\)/);
  assert.match(window, /selectionRefreshSerial\s*=\s*selectionRefreshSerial \+ 1/);
  assert.match(window, /LrTasks\.startAsyncTask\(function\(\)[\s\S]*?LrTasks\.yield\(\)[\s\S]*?refreshSelection\(\)/);
  assert.match(window, /selectionChangeObserver\s*=\s*function\(\)\s*scheduleSelectionRefresh\(\)/);
  assert.doesNotMatch(window, /selectionChangeObserver\s*=\s*function\(\)\s*pcall\(refreshSelection\)/);
  assert.match(window, /windowWillClose/);
  assert.match(window, /activeDialogControls:toFront\(\)/);
  assert.match(window, /LrTasks\.pcall\(TaxonomyHelper\.request/);
  assert.match(window, /LrTasks\.pcall\(\s*KeywordWriter\.assign/);
  assert.match(window, /local activePackage = TaxonomyHelper\.searchPackageStatus\(\)/);
  assert.match(window, /selectedPackageId ~= cleanText\(activePackage\.packageId\)/);
  assert.match(
    window,
    /selectedCorrectionRevision ~= cleanText\(activePackage\.correctionRevision\)/,
  );
  assert.match(helper, /corrections\/active\.json/);
  assert.match(helper, /pointer\.basePackageId/);
  assert.match(helper, /pointer\.baseMasterVersion/);
  assert.match(window, /Bitte die Art erneut suchen/);
  assert.match(window, /"1 Foto wurde " \.\. speciesName \.\. " zugewiesen\."/);
  assert.match(window, /tostring\(result\.photoCount\) \.\. " Fotos wurden " \.\. speciesName \.\. " zugewiesen\."/);
  assert.match(window, /"Von " \.\. photoCountText\(result\.photoCount\) \.\. " wurde die Taxonomie entfernt\."/);
  assert.match(window, /LrTasks\.pcall\(function\(\)\s*\n\s*LrDialogs\.presentFloatingDialog/);
  assert.doesNotMatch(window, /12 \* 60 \* 60/);
  assert.match(writer, /catalog:withWriteAccessDo/);
  assert.doesNotMatch(writer, /import "LrTasks"|LrTasks\.pcall/);
  assert.match(writer, /local result = catalog:withWriteAccessDo\(/);
  assert.match(writer, /WRITE_ACCESS_TIMEOUT_SECONDS\s*=\s*10/);
  assert.match(writer, /\{ timeout = WRITE_ACCESS_TIMEOUT_SECONDS \}/);
  assert.match(writer, /local completed = false/);
  assert.match(writer, /callbackResult = callback\(\)[\s\S]*?completed = true/);
  assert.match(
    writer,
    /local result = catalog:withWriteAccessDo\([\s\S]*?function\(\)[\s\S]*?return callbackResult\s*end,[\s\S]*?\{ timeout = WRITE_ACCESS_TIMEOUT_SECONDS \}[\s\S]*?\)/,
  );
  assert.doesNotMatch(
    writer,
    /catalog:withWriteAccessDo\(actionName, function\(\)[\s\S]*?return callbackResult\s*\}\)/,
    "Der Lua-Callback von withWriteAccessDo muss mit end) geschlossen werden",
  );
  assert.doesNotMatch(writer, /Lightroom ist noch mit einem anderen Katalogvorgang beschäftigt|blocked by another write access call/);
  assert.match(writer, /if completed then[\s\S]*return result/);
  assert.match(writer, /Lightroom konnte den Katalog-Schreibzugriff innerhalb von/);
  assert.match(writer, /catalog:createKeyword/);
  assert.match(writer, /photo:addKeyword/);
  assert.match(writer, /photo:setPropertyForPlugin/);
  assert.match(writer, /PLUGIN_KEYWORD_SUFFIX\s*=\s*" \(FN\)"/);
  assert.match(writer, /PLUGIN_PARTIAL_KEYWORD_SUFFIX\s*=\s*PLUGIN_KEYWORD_SUFFIX \.\. "\*"/);
  assert.match(
    writer,
    /string\.sub\(name, -string\.len\(PLUGIN_PARTIAL_KEYWORD_SUFFIX\)\)[\s\S]*== PLUGIN_PARTIAL_KEYWORD_SUFFIX/,
  );
  assert.match(writer, /local function managedKeywordName\(value\)/);
  assert.match(writer, /utf8Prefix\(value, maximumNameBytes\) \.\. PLUGIN_KEYWORD_SUFFIX/);
  assert.match(writer, /local keyword = createKeyword\(catalog, readableKeyword, nil\)/);
  assert.doesNotMatch(writer, /LrTasks\.pcall\(createKeyword|LrTasks\.pcall\(setText/);
  const uniqueKeywordListIndex = writer.indexOf("local managedKeywordNames = {}");
  const writeAccessIndex = writer.indexOf(
    'runWithWriteAccess(catalog, "FN Wildlife Taxonomie zuweisen"',
  );
  assert.ok(uniqueKeywordListIndex >= 0 && uniqueKeywordListIndex < writeAccessIndex);
  assert.match(writer, /local seenKeywordNames = \{\}/);
  assert.match(writer, /local keywordKey = string\.lower\(readableKeyword\)/);
  assert.match(
    writer,
    /if not seenKeywordNames\[keywordKey\] then\s*seenKeywordNames\[keywordKey\] = true\s*table\.insert\(managedKeywordNames, readableKeyword\)/,
  );
  assert.equal(
    writer.match(/photo:addKeyword\(keyword\)/g)?.length,
    1,
    "Jedes eindeutige Stichwort darf im Zuweisungspfad nur einmal pro Foto hinzugefügt werden",
  );
  assert.match(writer, /table\.insert\(hierarchyPath, utf8Prefix\(metadataValue, 240\)\)/);
  assert.match(writer, /local taxonomyPath = boundedPath\(hierarchyPath\)/);
  assert.match(writer, /local function assignmentError\(taxon, keyword, step, photoCount, reason\)/);
  for (const label of [
    "Deutscher Artname",
    "Wissenschaftlicher Name",
    "Keyword",
    "Arbeitsschritt",
    "Fotos",
    "Ursache",
  ]) {
    assert.match(writer, new RegExp(label));
  }
  assert.match(writer, /"Stichwort erzeugen"/);
  assert.match(writer, /"Stichwort zum Foto hinzufügen"/);
  assert.match(writer, /"Metadatenfeld " \.\. field \.\. " schreiben"/);
  assert.match(writer, /"Zuweisung verifizieren"/);
  assert.match(writer, /photo:getPropertyForPlugin\(_PLUGIN, "masterTaxonId"\)/);
  const writeSection = writer.slice(writer.indexOf("local function runWithWriteAccess"));
  assert.doesNotMatch(
    writeSection,
    /(^|[^.\w])pcall\(/m,
    "Yield-fähige Lightroom-Schreibaufrufe dürfen nicht in normalem Lua-pcall liegen",
  );
  assert.doesNotMatch(writer, /createKeyword\(catalog, "Taxonomie"|PLUGIN_KEYWORD_ROOT/);
  assert.match(writer, /Ausschließlich eindeutig mit \(FN\) oder \(FN\)\* gekennzeichnete Plug-in-/);
  assert.match(writer, /Alle sonstigen, auch manuell\s+(?:--\s*)?gepflegten Lightroom-Stichwörter bleiben unverändert erhalten/);
  assert.match(writer, /taxonomyKeywordIds/);
  assert.match(writer, /keywordLocalIdentifier/);
  assert.match(writer, /if type\(keyword\) == "string" then\s*return cleanText\(keyword\)/);
  assert.match(writer, /resolveManagedKeywordNames/);
  assert.match(writer, /photo:getRawMetadata\("keywords"\)/);
  assert.match(writer, /for key, value in pairs\(ok and assigned or \{\}\) do/);
  assert.match(writer, /appendAssignedKeyword\(key\)/);
  assert.match(writer, /appendAssignedKeyword\(value\)/);
  assert.match(writer, /photo:getFormattedMetadata\("keywordTags"\)/);
  assert.match(writer, /if hasPluginKeywordSuffix\(candidate\) then/);
  assert.match(writer, /catalog:getKeywordByLocalIdentifier\(id\)/);
  assert.match(writer, /if hasPluginKeywordNameSuffix\(name\) then/);
  assert.doesNotMatch(writer, /catalog:getKeywords\(\)/);
  assert.match(writer, /#storedKeywordIds > 0 and table\.concat\(storedKeywordIds, ","\) or "none"/);
  assert.doesNotMatch(writer, /resolveLegacyKeywordTargets/);
  assert.doesNotMatch(writer, /name == "Artnamen"|keywordParent|keywordChildren/);
  assert.doesNotMatch(writer, /malformedLegacyKeywordTargets|legacyMetadataValues|legacyRankPrefix/);
  assert.match(writer, /removeManagedKeywords/);
  assert.match(writer, /local keyword = createKeyword\(catalog, name, nil\)\s*\n\s*photo:removeKeyword\(keyword\)/);
  assert.match(writer, /local function removeCurrentManagedKeywords\(catalog, photo, protectedNames\)/);
  assert.match(writer, /local function managedKeywordNamesFromMetadata\(photo\)/);
  assert.match(writer, /getPropertyForPlugin\(_PLUGIN, "taxonomyPath"\)/);
  assert.match(
    writer,
    /for _, name in ipairs\(managedKeywordNamesFromMetadata\(photo\)\) do\s*\n\s*removeCandidate\(name\)/,
    "Die beim Zuweisen erzeugten Namen müssen vor dem Leeren der Metadaten deterministisch rekonstruiert werden",
  );
  assert.match(writer, /local keyword = type\(candidate\) == "string" and createKeyword\(catalog, name, nil\) or candidate/);
  assert.match(writer, /clearPluginMetadata/);
  assert.match(
    writer,
    /function KeywordWriter\.remove[\s\S]*runWithWriteAccess\(catalog, "FN Wildlife Taxonomie entfernen"[\s\S]*removeCurrentManagedKeywords\([\s\S]*?catalog,[\s\S]*?photo,[\s\S]*?LocationTimeWriter\.managedKeywordNameSet\(photo\)[\s\S]*?clearPluginMetadata\(photo\)/,
    "Stichwörter müssen im selben Schreibzugriff und vor den Plug-in-Metadaten entfernt werden",
  );
  assert.match(writer, /PluginState\.applyStatisticsPhotoChanges\(catalog, beforeStatistics, afterStatistics\)/);
  assert.match(writer, /Statistics\.assignmentSnapshot\(/);
  assert.match(writer, /beforeStatistics\[index\]\.referenceImage/);
  assert.match(writer, /Statistics\.emptySnapshot\(beforeStatistics\[index\]\)/);
  assert.doesNotMatch(
    writer,
    /afterStatistics\[index\]\s*=\s*Statistics\.photoSnapshot\(photo\)/,
    "Innerhalb des Lightroom-Schreibcallbacks darf nicht der noch alte Fotozustand als Statistikdelta gelesen werden",
  );
  assert.match(writer, /utf8Prefix\(value, 460\)/);
  assert.match(writer, /maximumNameBytes\s*=\s*240 - string\.len\(PLUGIN_KEYWORD_SUFFIX\)/);
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
  const maintenance = await source("CatalogMaintenance.lua");
  const pluginMenu = await source("PluginMenu.lua");
  assert.match(assignment, /title\s*=\s*"Schließen"[\s\S]*?activeDialogControls:close\(\)/);
  assert.match(statistics, /cancelVerb\s*=\s*"Schließen"/);
  assert.match(maintenance, /title\s*=\s*"Schließen"[\s\S]*?dialogControls:close\(\)/);
  assert.match(pluginMenu, /title\s*=\s*"Schließen"[\s\S]*?dialogControls:close\(\)/);
});

test("Taxonomie kann als eigene Zusatzmodul-Aktion kontrolliert entfernt werden", async () => {
  const pluginMenu = await source("PluginMenu.lua");
  const removal = await source("RemoveTaxonomy.lua");
  assert.match(pluginMenu, /title = "Taxonomie entfernen \.\.\."/);
  assert.match(pluginMenu, /script = "RemoveTaxonomy\.lua"/);
  assert.match(removal, /catalog:getTargetPhotos\(\)/);
  assert.match(removal, /LrDialogs\.confirm/);
  assert.match(removal, /KeywordWriter\.remove/);
  assert.match(removal, /verwalteten Taxonomie-Stichwörter/);
  assert.match(removal, /Andere Lightroom-Stichwörter/);
  assert.match(removal, /"Von "[\s\S]*result\.photoCount[\s\S]*" wurde die Taxonomie entfernt\."/);
});

test("Orts- und Zeitstichwörter verwenden ausschließlich dokumentierte Lightroom-Felder und getrennte FN-Metadaten", async () => {
  const pluginMenu = await source("PluginMenu.lua");
  const addAction = await source("AddLocationTime.lua");
  const removeAction = await source("RemoveLocationTime.lua");
  const updateAction = await source("UpdateLocationTime.lua");
  const menu = await source("LocationTimeMenu.lua");
  const locationTime = await source("LocationTimeWriter.lua");
  const suggestions = await source("LocationSuggestionReader.lua");
  const taxonomy = await source("KeywordWriter.lua");
  const assignmentWindow = await source("AssignmentWindow.lua");
  for (const script of [
    "AddLocationTime.lua",
    "RemoveLocationTime.lua",
    "UpdateLocationTime.lua",
  ]) {
    assert.match(pluginMenu, new RegExp(script.replace(".", "\\.")));
  }
  assert.match(addAction, /LocationTimeMenu"\)\.run\("add"\)/);
  assert.match(removeAction, /LocationTimeMenu"\)\.run\("remove"\)/);
  assert.match(updateAction, /LocationTimeMenu"\)\.run\("update"\)/);
  assert.match(menu, /catalog:getTargetPhotos\(\)/);
  assert.match(menu, /LrDialogs\.confirm/);
  assert.match(menu, /LrTasks\.pcall\(/);
  assert.match(menu, /KeywordWriter\.taxonomyKeywordNameSet/);
  assert.match(menu, /\(FN Ort\)- und \(FN Zeit\)-Stichwörter/);
  for (const field of ["location", "city", "stateProvince", "country", "isoCountryCode"]) {
    assert.ok(locationTime.includes(`readFormatted(photo, "${field}")`));
  }
  assert.match(locationTime, /fnStateProvince = readFormatted\(photo, "stateProvince"\)/);
  assert.match(locationTime, /photo:getRawMetadata\("dateTimeOriginal"\)/);
  assert.match(locationTime, /photo:getRawMetadata\("gps"\)/);
  assert.match(locationTime, /tonumber\(gps\.latitude\)/);
  assert.match(locationTime, /tonumber\(gps\.longitude\)/);
  assert.match(locationTime, /LrDate\.timestampToComponents\(timestamp\)/);
  assert.match(locationTime, /if type\(first\) == "table" then/);
  assert.match(locationTime, /first\.year or first\[1\]/);
  assert.match(locationTime, /photo:getFormattedMetadata\("dateTimeOriginal"\)/);
  assert.match(locationTime, /captureDiagnostic = plan\.captureDiagnostic/);
  assert.match(menu, /Lesehinweis:/);
  assert.match(locationTime, /datePartsFromText\(formattedValue\)/);
  assert.match(locationTime, /string\.find\(lowerText, string\.lower\(monthName\), 1, true\)/);
  assert.match(locationTime, /"Januar"[\s\S]*"Dezember"/);
  assert.match(locationTime, /local LOCATION_KEYWORD_SUFFIX = " \(FN Ort\)"/);
  assert.match(locationTime, /local TIME_KEYWORD_SUFFIX = " \(FN Zeit\)"/);
  assert.match(locationTime, /LOCATION_PARTIAL_KEYWORD_SUFFIX = LOCATION_KEYWORD_SUFFIX \.\. "\*"/);
  assert.match(locationTime, /TIME_PARTIAL_KEYWORD_SUFFIX = TIME_KEYWORD_SUFFIX \.\. "\*"/);
  assert.match(locationTime, /name == cleanText\(LOCATION_KEYWORD_SUFFIX\)/);
  assert.match(locationTime, /name == cleanText\(TIME_KEYWORD_SUFFIX\)/);
  assert.match(
    locationTime,
    /string\.sub\(name, -string\.len\(LOCATION_PARTIAL_KEYWORD_SUFFIX\)\)[\s\S]*== LOCATION_PARTIAL_KEYWORD_SUFFIX/,
  );
  assert.match(
    locationTime,
    /string\.sub\(name, -string\.len\(TIME_PARTIAL_KEYWORD_SUFFIX\)\)[\s\S]*== TIME_PARTIAL_KEYWORD_SUFFIX/,
  );
  assert.match(locationTime, /values\.fnCountry/);
  assert.match(locationTime, /values\.fnStateProvince/);
  assert.match(locationTime, /values\.fnCity/);
  assert.match(locationTime, /values\.fnLocation/);
  assert.match(locationTime, /values\.fnCaptureMonth/);
  assert.match(locationTime, /values\.fnCaptureYear/);
  assert.match(locationTime, /local text = cleanText\(value\)\s*if text ~= "" then\s*appendUnique/);
  assert.doesNotMatch(locationTime, /appendUnique\(names, seen, values\.fnIsoCountryCode\)/);
  assert.match(locationTime, /locationTimeKeywordIds/);
  assert.match(locationTime, /locationTimeKeywordNames/);
  assert.match(locationTime, /locationTimeAssignedAt/);
  assert.match(locationTime, /photo:getRawMetadata\("keywords"\)/);
  assert.match(locationTime, /photo:getFormattedMetadata\("keywordTags"\)/);
  assert.match(locationTime, /function LocationTimeWriter\.prepare\(catalog, photos, options\)/);
  assert.doesNotMatch(locationTime, /batchGetRawMetadata|batchGetFormattedMetadata/);
  assert.ok(
    menu.indexOf("LocationTimeWriter.prepare(catalog, photos, {")
      < menu.indexOf("LrTasks.pcall("),
    "Lightroom-Lesezugriffe müssen vor der nicht yield-fähigen pcall-Grenze liegen",
  );
  assert.match(locationTime, /missingLocationPhotoCount = 0/);
  assert.match(locationTime, /gpsWithoutStoredLocationPhotoCount = 0/);
  assert.match(locationTime, /missingGpsAndLocationPhotoCount = 0/);
  assert.match(locationTime, /missingTimePhotoCount = 0/);
  assert.match(menu, /Lightroom lieferte dafür aber keine exportierbaren Ortsvorschläge\./);
  assert.match(menu, /Adressvorschläge beim Export übernommen werden/);
  assert.match(locationTime, /local LocationSuggestionReader = require "LocationSuggestionReader"/);
  assert.match(locationTime, /LocationSuggestionReader\.resolve\(suggestionPhotos\)/);
  assert.match(locationTime, /resolveSuggestedLocations == true/);
  assert.match(suggestions, /local LrExportSession = import "LrExportSession"/);
  assert.match(suggestions, /local LrTasks = import "LrTasks"/);
  assert.match(suggestions, /LR_format = "JPEG"/);
  assert.match(suggestions, /LR_embeddedMetadataOption = "all"/);
  assert.match(suggestions, /LR_removeLocationMetadata = false/);
  assert.match(suggestions, /session:renditions\(/);
  assert.match(suggestions, /session:doExportOnNewTask\(\)/);
  assert.match(suggestions, /LrTasks\.sleep\(0\.1\)/);
  assert.ok(
    suggestions.indexOf("session:doExportOnNewTask()")
      < suggestions.indexOf("session:renditions({"),
    "Die temporäre Export-Session muss vor dem Warten auf Renditions gestartet werden",
  );
  assert.match(suggestions, /rendition:waitForRender\(\)/);
  assert.match(suggestions, /Iptc4xmpCore:Location/);
  assert.match(suggestions, /photoshop:City/);
  assert.match(suggestions, /photoshop:State/);
  assert.match(suggestions, /photoshop:Country/);
  assert.match(suggestions, /Iptc4xmpCore:CountryCode/);
  assert.match(suggestions, /iptcValue\(app13, 92\)/);
  assert.match(suggestions, /iptcValue\(app13, 90\)/);
  assert.match(suggestions, /iptcValue\(app13, 95\)/);
  assert.match(suggestions, /iptcValue\(app13, 101\)/);
  assert.match(suggestions, /iptcValue\(app13, 100\)/);
  assert.match(suggestions, /cleanupDirectory\(outputDirectory\)/);
  assert.doesNotMatch(suggestions, /LrHttp|\.lrcat|sqlite/i);
  const assignmentFunction = assignmentWindow.slice(
    assignmentWindow.indexOf("local function assign()"),
    assignmentWindow.indexOf("local function openCorrection()"),
  );
  assert.ok(
    assignmentFunction.indexOf("LocationTimeWriter.prepare(catalog, photos")
      < assignmentFunction.indexOf("LrTasks.pcall("),
    "Ortsvorschläge müssen vor der nicht yield-fähigen Zuweisungs-pcall-Grenze aufgelöst werden",
  );
  assert.match(assignmentFunction, /resolveSuggestedLocations = true/);
  assert.match(locationTime, /function LocationTimeWriter\.applyPrepared\(/);
  assert.match(locationTime, /local function prepareKeywordObjects\(catalog, photos, plans, mode\)/);
  assert.match(locationTime, /if key ~= "" and not keywordsByName\[key\] then/);
  assert.match(locationTime, /keywordsByName\[key\] = keyword/);
  const addLocationTimeKeywords = locationTime.slice(
    locationTime.indexOf("local function addKeywords(photo, names, keywordsByName)"),
    locationTime.indexOf("local function protectedNames"),
  );
  assert.match(addLocationTimeKeywords, /keywordsByName\[string\.lower\(cleanText\(name\)\)\]/);
  assert.doesNotMatch(addLocationTimeKeywords, /createKeyword/);
  const applyPrepared = locationTime.slice(
    locationTime.indexOf("function LocationTimeWriter.applyPrepared"),
    locationTime.indexOf("local function runWithWriteAccess"),
  );
  assert.ok(
    applyPrepared.indexOf("local keywordsByName = prepareKeywordObjects(catalog, photos, plans, mode)")
      < applyPrepared.indexOf("for index, photo in ipairs(photos or {}) do"),
    "Orts-/Zeitstichwörter müssen vor der fotoweisen Zuweisung einmalig erzeugt werden",
  );
  assert.match(locationTime, /function LocationTimeWriter\.execute\(/);
  assert.match(locationTime, /catalog:withWriteAccessDo\(/);
  assert.match(locationTime, /timeout = WRITE_ACCESS_TIMEOUT_SECONDS/);
  assert.match(locationTime, /local callbackResult = nil/);
  assert.match(locationTime, /callbackResult = callback\(\)/);
  assert.match(locationTime, /if completed then\s*return callbackResult/);
  assert.doesNotMatch(
    locationTime,
    /local result = catalog:withWriteAccessDo\(/,
    "Das SDK-Ergebnis von withWriteAccessDo ist nicht das fachliche Aktionsergebnis",
  );
  assert.match(menu, /tonumber\(result and result\.skippedPhotoCount or 0\) or 0/);
  assert.match(menu, /tonumber\(result and result\.removedKeywordCount or 0\) or 0/);
  assert.match(menu, /verwaltete Stichwortzuordnungen wurden entfernt/);
  assert.match(locationTime, /removedKeywordCount > removedBeforePhoto/);
  assert.match(locationTime, /Statistics\.photoSnapshot\(photo\)/);
  assert.match(locationTime, /Statistics\.locationTimeSnapshot\(/);
  assert.match(locationTime, /PluginState\.applyStatisticsPhotoChanges\(/);
  assert.match(taxonomy, /locationTimeResult\.afterValues\[index\]/);
  assert.match(taxonomy, /LocationTimeWriter\.prepare\(catalog, photos, \{ resolveSuggestedLocations = false \}\)/);
  assert.match(taxonomy, /Statistics\.emptySnapshot\(beforeStatistics\[index\]\)/);
  const existingAssignment = locationTime.slice(
    locationTime.indexOf("local function existingAssignment"),
    locationTime.indexOf("local function removeStoredKeywords"),
  );
  assert.match(existingAssignment, /for _, field in ipairs\(VALUE_FIELDS\) do/);
  assert.doesNotMatch(existingAssignment, /locationTimeAssignedAt|storedKeywordNames/);
  assert.doesNotMatch(locationTime, /getAllPhotos|LrHttp|reverse.?geocod/i);
  assert.match(taxonomy, /local LocationTimeWriter = require "LocationTimeWriter"/);
  assert.match(
    taxonomy,
    /LocationTimeWriter\.prepare\(catalog, photos, \{ resolveSuggestedLocations = false \}\)/,
  );
  assert.match(taxonomy, /LocationTimeWriter\.applyPrepared\([\s\S]*?"add"/);
  assert.match(taxonomy, /LocationTimeWriter\.managedKeywordNameSet\(photo\)/);
  assert.match(taxonomy, /function KeywordWriter\.taxonomyKeywordNameSet\(photo\)/);
});

test("Gesamtbereinigung und Katalogpflege bleiben kontrolliert, blockweise und ID-basiert", async () => {
  const pluginMenu = await source("PluginMenu.lua");
  const removal = await source("RemoveAllFnData.lua");
  const maintenanceAction = await source("UpdateCatalogFnData.lua");
  const maintenance = await source("CatalogMaintenance.lua");
  const writer = await source("KeywordWriter.lua");
  const locationTime = await source("LocationTimeWriter.lua");

  assert.match(pluginMenu, /Alle FN-Daten der Auswahl entfernen \.\.\./);
  assert.match(pluginMenu, /Gesamten Katalog aktualisieren \.\.\./);
  assert.match(removal, /catalog:getTargetPhotos\(\)/);
  assert.match(removal, /LrDialogs\.confirm/);
  assert.match(removal, /KeywordWriter\.removeAll/);
  for (const suffix of [
    "\\(FN\\)",
    "\\(FN\\)\\*",
    "\\(FN Ort\\)",
    "\\(FN Ort\\)\\*",
    "\\(FN Zeit\\)",
    "\\(FN Zeit\\)\\*",
  ]) {
    assert.match(removal, new RegExp(suffix));
  }
  assert.match(writer, /function KeywordWriter\.removeAll\(catalog, photos\)/);
  assert.match(writer, /function KeywordWriter\.hasManagedKeywordSuffix\(value\)/);
  assert.match(writer, /removeCurrentManagedKeywords\(catalog, photo\)/);
  assert.match(writer, /LocationTimeWriter\.applyPrepared\([\s\S]*?"remove"/);
  assert.match(writer, /Statistics\.emptySnapshot\(\)/);
  assert.match(maintenanceAction, /CatalogMaintenance\.show/);
  assert.match(maintenance, /catalog:getAllPhotos\(\)/);
  assert.match(maintenance, /READ_CHUNK_SIZE = 500/);
  assert.match(maintenance, /WRITE_CHUNK_SIZE = 250/);
  assert.match(maintenance, /catalog:batchGetPropertyForPlugin\(chunk, _PLUGIN, FIELD_IDS\)/);
  assert.match(maintenance, /catalog:batchGetRawMetadata\(chunk, \{ "keywords" \}\)/);
  assert.match(maintenance, /orphanTaxonomyKeywordPhotoCount/);
  assert.match(maintenance, /orphanLocationTimeKeywordPhotoCount/);
  assert.match(maintenance, /Verwaiste FN-Stichwörter ohne zugehörige Plug-in-Metadaten/);
  assert.match(maintenance, /werden nur mit „Alle FN-Daten entfernen“ bereinigt/);
  assert.match(maintenance, /command = "taxa"/);
  assert.match(maintenance, /masterTaxonIds = state\.taxonomyIds/);
  assert.match(maintenance, /cleanText\(taxon\.lifecycleState\) == "active"/);
  assert.match(maintenance, /not packageMatches\(state\.searchPackage\)/);
  assert.match(maintenance, /locationTimeMode = "update"/);
  assert.match(maintenance, /resolveSuggestedLocations = true/);
  assert.match(maintenance, /LocationTimeWriter\.prepare\(catalog, targetPhotos/);
  assert.match(maintenance, /Vorschau vollständig\. Noch wurden keine Fotos verändert\./);
  assert.match(maintenance, /title = "Vorschau übernehmen"/);
  assert.match(maintenance, /Pause wird nach dem aktuellen Lese- oder Schreibblock wirksam/);
  assert.match(maintenance, /Mehrere Art-Favoriten/);
  assert.match(maintenance, /werden nicht automatisch geändert/);
  assert.doesNotMatch(maintenance, /existingId.*scientificName|ähnlich|similar/i);
  assert.match(locationTime, /function LocationTimeWriter\.hasManagedKeywordSuffix\(value\)/);
  assert.match(locationTime, /LOCATION_PARTIAL_KEYWORD_SUFFIX/);
  assert.match(locationTime, /TIME_PARTIAL_KEYWORD_SUFFIX/);
  assert.doesNotMatch(locationTime, /managedKeywordName\([^\n]+PARTIAL_KEYWORD_SUFFIX/);
  assert.match(locationTime, /options\.beforeSuggestions\(#suggestionPhotos\)/);
});

test("Abweichende vorhandene Taxonomie wird nicht still überschrieben", async () => {
  const writer = await source("KeywordWriter.lua");
  assert.match(writer, /getPropertyForPlugin\(_PLUGIN, "masterTaxonId"\)/);
  assert.match(writer, /existingId ~= taxon\.masterTaxonId/);
  assert.match(writer, /Das Plug-in überschreibt diese nicht/);
});

test("Art-Favorit und Taxonomiestatus verwenden ausschließlich Plug-in-Metadaten", async () => {
  const metadata = await source("MetadataDefinition.lua");
  const reference = await source("ReferenceImage.lua");
  const referenceAction = await source("SetReferenceImage.lua");
  const collections = await source("SmartCollections.lua");
  const collectionAction = await source("CreateCollections.lua");
  assert.match(metadata, /id\s*=\s*"referenceImage"[\s\S]*?dataType\s*=\s*"enum"/);
  assert.match(metadata, /value\s*=\s*"yes"/);
  assert.match(metadata, /value\s*=\s*"no"/);
  assert.match(reference, /masterTaxonId/);
  assert.match(reference, /referenceImage/);
  assert.match(reference, /function ReferenceImage\.findExisting\(catalog, photo\)/);
  assert.match(reference, /PluginState\.referenceImageUuids\(catalog, masterTaxonId\)/);
  assert.match(reference, /photo:getRawMetadata\("uuid"\)/);
  assert.match(reference, /catalog:findPhotoByUuid\(uuid\)/);
  assert.doesNotMatch(reference, /catalog:getAllPhotos\(\)/);
  assert.match(reference, /candidate == photo and "yes" or "no"/);
  assert.match(reference, /catalog:withWriteAccessDo/);
  assert.match(reference, /Statistics\.referenceSnapshot\(/);
  assert.match(reference, /PluginState\.applyStatisticsPhotoChanges\(catalog, beforeStatistics, afterStatistics\)/);
  assert.match(reference, /return existingPhotos\[1\], existingPhotos/);
  assert.match(reference, /local affectedPhotos = \{ photo \}/);
  assert.match(reference, /Lightroom hat das ausgewählte Foto nicht als Art-Favorit gespeichert/);
  assert.match(referenceAction, /Zuerst Taxonomie zuweisen/);
  assert.match(referenceAction, /Favoritenbild der Art/);
  assert.match(referenceAction, /local existingPhoto, existingPhotos, indexError = ReferenceImage\.findExisting\(catalog, photo\)/);
  assert.match(referenceAction, /ReferenceImage\.assign\(catalog, photo, existingPhotos\)/);
  assert.match(referenceAction, /Statistik neu aufbauen/);
  assert.match(referenceAction, /if existingPhoto then[\s\S]*?LrDialogs\.confirm/);
  assert.match(referenceAction, /Für [\s\S]*?ist bereits ein Art-Favorit festgelegt/);
  assert.match(referenceAction, /"Ja, ersetzen"/);
  assert.match(referenceAction, /"Nein, behalten"/);
  assert.match(referenceAction, /if choice ~= "ok" then\s*return/);
  assert.doesNotMatch(referenceAction, /Bisher:|Neu:|photoDescription/);
  assert.match(collections, /catalog:createCollectionSet/);
  assert.match(collections, /catalog:createSmartCollection/);
  assert.match(collections, /criteria = "sdktext:" \.\. TOOLKIT_ID \.\. "\." \.\. field/);
  assert.match(
    collections,
    /name = "Taxonomie zugewiesen"[\s\S]*?textCriterion\("masterTaxonId", "beginsWith", "mtx_"\)[\s\S]*?combine = "intersect"/,
  );
  assert.match(
    collections,
    /name = "Taxonomie fehlt"[\s\S]*?textCriterion\("masterTaxonId", "beginsWith", "mtx_"\)[\s\S]*?combine = "exclude"/,
  );
  assert.doesNotMatch(collections, /textCriterion\("masterTaxonId", "(?:empty|notEmpty)"/);
  assert.match(
    collections,
    /name = "Art-Favoriten"[\s\S]*?valueCriterion\("referenceImage", "yes"\)/,
  );
  assert.match(collections, /\["5-Sterne-Tierbilder"\] = true/);
  assert.match(collections, /\["Art-Referenzbilder"\] = true/);
  assert.doesNotMatch(collections, /name = "5-Sterne-Tierbilder"|name = "Art-Referenzbilder"/);
  assert.match(collections, /collection:delete\(\)/);
  assert.match(collections, /existing:setSearchDescription\(definition\.rules\)/);
  assert.match(
    collections,
    /catalog:createSmartCollection\(definition\.name, definition\.rules, collectionSet, false\)/,
  );
  assert.match(collectionAction, /mit den aktuellen Regeln abgeglichen/);
  assert.match(collectionAction, /nicht mehr benötigte Sammlung\(en\) entfernt/);
  assert.doesNotMatch(collectionAction, /manuell entfernt/);
  assert.doesNotMatch(collections, /criteria\s*=\s*"keywords"|criteria\s*=\s*"keyword"/);
  const combined = `${reference}\n${collections}`;
  assert.doesNotMatch(combined, /TaxonomyHelper|lightroom-search-helper|\.lrcat|sqlite3/i);
});

test("Katalogstatistik ist persistent, inkrementell, pausierbar und exportierbar", async () => {
  const state = await source("PluginState.lua");
  const index = await source("StatisticsIndex.lua");
  const statistics = await source("Statistics.lua");
  const dialog = await source("ShowStatistics.lua");
  assert.match(state, /STATISTICS_INDEX_FIELD\s*=\s*"statisticsIndexV1"/);
  assert.match(state, /STATISTICS_BUILD_FIELD\s*=\s*"statisticsBuildV1"/);
  assert.match(state, /catalog:getPropertyForPlugin\(_PLUGIN, field\)/);
  assert.match(state, /catalog:setPropertyForPlugin\(_PLUGIN, field, value\)/);
  assert.match(state, /withPrivateWriteAccessDo/);
  assert.match(state, /applyStatisticsPhotoChanges/);
  assert.match(index, /StatisticsIndex\.SCHEMA_VERSION\s*=\s*6/);
  assert.match(index, /function StatisticsIndex\.applyChanges/);
  assert.match(index, /referenceImageUuids/);
  assert.match(index, /photoUuid/);
  assert.match(index, /lifelist = lifelist/);
  assert.match(index, /classBreakdown = classBreakdown/);
  assert.match(index, /locationTime = locationTimeResult\(index\.locationTime\)/);
  assert.match(index, /taxonomyLocationTime = locationTimeResult\(index\.taxonomyLocationTime\)/);
  assert.match(index, /taxonomyDataQuality = taxonomyDataQualityResult\(index\.taxonomyLocationTime, assignedPhotos\)/);
  assert.match(index, /observations = \{\}/);
  assert.match(index, /type\(index\.observations\) == "table"/);
  assert.match(index, /local function changeObservation\(index, snapshot, amount\)/);
  assert.match(index, /changeObservation\(index, snapshot, 1\)/);
  assert.match(index, /changeObservation\(index, snapshot, -1\)/);
  assert.match(index, /observationRows = observationRows/);
  for (const aggregate of [
    "countries",
    "states",
    "cities",
    "locations",
    "years",
    "months",
    "monthYears",
    "days",
  ]) {
    assert.match(index, new RegExp(`sortedCounts\\(aggregate\\.${aggregate}, 5\\)`));
  }
  assert.match(index, /captureDate = captureDate\(values\.captureDate or values\.dateTimeOriginal\)/);
  assert.match(index, /string\.sub\(masterTaxonId, 1, 4\) == "mtx_"/);
  assert.match(index, /while #topSpecies > 5 do/);
  assert.match(index, /englishName = cleanText\(entry\.englishName\)/);
  assert.match(index, /order = cleanText\(entry\.order\)/);
  for (const field of [
    "fnLocation",
    "fnCity",
    "fnStateProvince",
    "fnCountry",
    "fnCaptureMonth",
    "fnCaptureYear",
  ]) {
    assert.match(index, new RegExp(field));
    assert.match(statistics, new RegExp(`"${field}"`));
  }
  assert.match(statistics, /catalog:getAllPhotos\(\)/);
  assert.match(statistics, /READ_CHUNK_SIZE\s*=\s*500/);
  assert.match(statistics, /CHECKPOINT_CHUNK_COUNT\s*=\s*10/);
  assert.match(statistics, /for chunkStart = startIndex, totalPhotos, READ_CHUNK_SIZE do/);
  assert.match(statistics, /catalog:batchGetPropertyForPlugin\(chunk, _PLUGIN, FIELD_IDS\)/);
  assert.match(statistics, /catalog:batchGetRawMetadata\([\s\S]*?chunk,[\s\S]*?\{ "uuid", "dateTimeOriginal", "path" \}[\s\S]*?\)/);
  assert.match(statistics, /PluginState\.saveStatisticsBuild/);
  assert.match(statistics, /PluginState\.saveStatisticsIndex/);
  assert.match(statistics, /function Statistics\.assignmentSnapshot/);
  assert.match(statistics, /function Statistics\.emptySnapshot/);
  assert.match(statistics, /function Statistics\.locationTimeSnapshot/);
  assert.match(statistics, /function Statistics\.referenceSnapshot/);
  assert.match(statistics, /end\)\s*\n\s*processedPhotos = chunkEnd[\s\S]*?options\.progress\(processedPhotos, totalPhotos\)/);
  assert.doesNotMatch(statistics, /catalog:withReadAccessDo\(function\(\)[\s\S]*?LrTasks\.yield\(\)/);
  assert.match(dialog, /presentFloatingDialog\(_PLUGIN/);
  assert.match(dialog, /blockTask\s*=\s*true/);
  assert.match(dialog, /Pause wird nach dem aktuellen Fotoblock gespeichert/);
  assert.match(dialog, /Aufbau pausiert/);
  assert.match(dialog, /startWorker\(\)/);
  assert.match(dialog, /Statistik neu aufbauen/);
  assert.match(dialog, /section\(factory, "Klassen", classBreakdownText\(statistics\)/);
  assert.doesNotMatch(dialog, /factory:scrolled_view/);
  assert.match(dialog, /runSavePanel/);
  assert.match(dialog, /requiredFileType\s*=\s*fileType/);
  assert.match(dialog, /string\.char\(239, 187, 191\)/);
  assert.match(dialog, /Deutscher Name/);
  assert.match(dialog, /Englischer Name/);
  assert.match(dialog, /Wissenschaftlicher Name/);
  assert.match(dialog, /csvField\("Ordnung"\)/);
  assert.match(dialog, /Art-Favorit/);
  assert.doesNotMatch(dialog, /classExpanded|Arten anzeigen|Arten ausblenden/);
  assert.match(dialog, /Taxonomieabdeckung:/);
  assert.match(dialog, /title = "Lifelist: " \.\. speciesLabel\(statistics\.speciesCount\)/);
  assert.match(dialog, /"Klassen"/);
  assert.match(dialog, /Art-Favoriten/);
  assert.match(dialog, /Aves = "Vögel"/);
  assert.match(dialog, /Mammalia = "Säugetiere"/);
  assert.match(dialog, /Actinopterygii = "Strahlenflosser"/);
  assert.match(dialog, /Am häufigsten fotografierte Arten/);
  assert.match(dialog, /Noch keine Arten zugewiesen/);
  assert.doesNotMatch(dialog, /FN-Orte und FN-Zeiten/);
  assert.match(dialog, /Datenqualität der taxonomierten Fotos/);
  assert.match(dialog, /mit Zeit- und Ortsangabe/);
  assert.match(dialog, /nur mit Zeitangabe/);
  assert.match(dialog, /nur mit Ortsangabe/);
  assert.match(dialog, /ohne Zeit- und Ortsangabe/);
  assert.match(dialog, /"Orte"/);
  assert.match(dialog, /"Zeiten"/);
  assert.match(dialog, /Länder/);
  assert.match(dialog, /Regionen/);
  assert.match(dialog, /Städte\/Gemeinden/);
  assert.match(dialog, /Orte\/Details/);
  assert.match(dialog, /Top 5 Jahre/);
  assert.match(dialog, /local function photoYearSpanLabel\(count\)/);
  assert.match(dialog, /count == 1 and "Jahr" or "Jahren"/);
  assert.match(dialog, /Top 5 Monate/);
  assert.match(dialog, /Top 5 Monate\/Jahre/);
  assert.match(dialog, /Top 5 Tage/);
  assert.match(dialog, /Top 5 Länder/);
  assert.match(dialog, /Top 5 Regionen/);
  assert.match(dialog, /Top 5 Städte\/Gemeinden/);
  assert.match(dialog, /Top 5 Orte\/Details/);
  assert.match(dialog, /percentage\(entry\.photoCount, statistics\.assignedPhotos\)/);
  assert.match(dialog, /line\(quality\.timePhotoCount, "mit Zeitangabe"\)/);
  assert.match(dialog, /actionVerb = "Exportieren \.\.\."/);
  assert.match(dialog, /Lifelist als CSV exportieren/);
  assert.match(dialog, /Beobachtungsliste als CSV exportieren/);
  assert.match(dialog, /Artenliste als TXT exportieren/);
  assert.match(dialog, /function exportObservationList\(statistics\)/);
  assert.match(dialog, /local rows = statistics\.observationRows or \{\}/);
  assert.doesNotMatch(dialog, /Statistics\.observationRows\(catalog|LrProgressScope/);
  assert.match(statistics, /fnCaptureMonth/);
  assert.match(statistics, /fnCaptureYear/);
  assert.match(dialog, /Beispiel-Dateiname/);
  assert.match(dialog, /csvField\("Art-Favorit vorhanden"\)/);
  assert.match(dialog, /rawInteger\(entry\.photoCount\)/);
  assert.match(dialog, /CLASS_EXPORT_ORDER/);
  assert.match(dialog, /function exportSpeciesText\(statistics\)/);
  assert.match(dialog, /Gesamt: /);
  assert.match(dialog, /TXT_SEPARATOR/);
  assert.match(dialog, /"\* " \.\. speciesDisplayName\(entry\)/);
  assert.doesNotMatch(statistics, /function Statistics\.observationRows/);
  const observationExport = dialog.slice(
    dialog.indexOf("local function exportObservationList"),
    dialog.indexOf("local function exportSpeciesText"),
  );
  assert.doesNotMatch(
    observationExport,
    /getAllPhotos|batchGetPropertyForPlugin|batchGetRawMetadata|withReadAccessDo/,
  );
  assert.match(index, /local function observationKey\(snapshot\)/);
  assert.match(index, /local hasFnTime = cleanText\(snapshot\.fnCaptureYear\) ~= ""/);
  assert.match(index, /local date = hasFnTime and cleanText\(snapshot\.captureDate\) or ""/);
  assert.match(index, /exampleFileName = cleanText\(entry\.exampleFileName\)/);
  assert.doesNotMatch(statistics, /getRawMetadata\("gps"\)|reverse.?geocod/i);
  assert.doesNotMatch(`${statistics}\n${dialog}`, /setPropertyForPlugin|addKeyword|createKeyword/);
  assert.doesNotMatch(dialog, /Bedeutung:/);
  assert.match(dialog, /local function formatInteger\(value\)/);
  assert.match(dialog, /string\.gsub\(reversed, "\(%d%d%d\)", "%1\."\)/);
  assert.doesNotMatch(dialog, /\bBild(?:er)?\b/);
  for (const rankLabel of ["Domäne", "Reich", "Stamm", "Klasse", "Ordnung", "Familie", "Gattung"]) {
    assert.match(dialog, new RegExp(rankLabel));
  }
  for (const rankField of ["taxonomyDomain", "taxonomyKingdom", "taxonomyPhylum", "taxonomyOrder"]) {
    assert.match(statistics, new RegExp(`"${rankField}"`));
  }
  for (const rankMap of ["domains", "kingdoms", "phyla", "classRanks", "orders", "families", "genera"]) {
    assert.match(index, new RegExp(`type\\(index\\.${rankMap}\\) == "table"`));
  }
  assert.match(index, /bothPhotoCount = math\.max\(locationPhotoCount \+ timePhotoCount - unionPhotoCount, 0\)/);
  assert.match(index, /onlyLocationPhotoCount = math\.max\(locationPhotoCount - bothPhotoCount, 0\)/);
  assert.match(index, /onlyTimePhotoCount = math\.max\(timePhotoCount - bothPhotoCount, 0\)/);
  assert.match(index, /neitherPhotoCount = math\.max\(\(tonumber\(assignedPhotos or 0\) or 0\) - unionPhotoCount, 0\)/);
  const screenshotCounts = {
    assigned: 4787,
    location: 1250,
    time: 4775,
    union: 4777,
  };
  const both = screenshotCounts.location + screenshotCounts.time - screenshotCounts.union;
  assert.deepEqual(
    {
      both,
      onlyTime: screenshotCounts.time - both,
      onlyLocation: screenshotCounts.location - both,
      neither: screenshotCounts.assigned - screenshotCounts.union,
    },
    { both: 1248, onlyTime: 3527, onlyLocation: 2, neither: 10 },
  );
  assert.ok(
    index.indexOf("if not hasValidTaxonomy(snapshot) then\n    return")
      < index.indexOf("index.assignedPhotos = (tonumber(index.assignedPhotos or 0) or 0) + 1"),
    "Taxonomieabdeckung darf nur gültige masterTaxonId-Zuweisungen zählen",
  );
});

test("Aufgeräumte Metadatenansicht und Plug-in-Info verbergen technische Felder", async () => {
  const tagset = await source("MetadataTagset.lua");
  const fullTagset = await source("MetadataTagsetFull.lua");
  const fields = await source("MetadataTagsetFields.lua");
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
    const index = fields.indexOf(`"${field}"`);
    assert.ok(index > previousIndex, `${field} muss im Standardblock in der erwarteten Reihenfolge stehen`);
    previousIndex = index;
  }
  assert.ok(
    previousIndex < fields.indexOf('TOOLKIT_ID .. ".germanName"'),
    "Standard-Fotometadaten müssen vor den Taxonomiefeldern stehen",
  );
  assert.match(fields, /TOOLKIT_ID \.\. "\.germanName"/);
  assert.match(fields, /TOOLKIT_ID \.\. "\.englishName"/);
  assert.match(fields, /TOOLKIT_ID \.\. "\.scientificName"/);
  assert.match(fields, /local COMPACT_RANKS\s*=\s*\{/);
  for (const rank of ["kingdom", "phylum", "class", "order", "family", "genus", "species", "subspecies"]) {
    assert.match(fields, new RegExp(`"${rank}"`));
  }
  assert.match(fields, /function MetadataTagsetFields\.full\(\)/);
  assert.match(fields, /TaxonomyRanks\.metadataFieldId\(rank\.id\)/);
  assert.match(tagset, /MetadataTagsetFields\.compact\(\)/);
  assert.match(fullTagset, /FN Wildlife – vollständige Taxonomie/);
  assert.match(fullTagset, /MetadataTagsetFields\.full\(\)/);
  const visibleTagsets = `${tagset}\n${fullTagset}\n${fields}`;
  assert.doesNotMatch(
    visibleTagsets,
    /masterTaxonId|projectTaxonId|taxonomyPath|taxonomyKeywordIds|locationTimeKeywordIds|locationTimeKeywordNames/,
  );
  assert.match(provider, /Version: 0\.4\.24\.6/);
  assert.match(provider, /TaxonomyHelper\.searchPackageStatus\(\)/);
  assert.match(provider, /Taxonomiedatenbank, Aktualisierungen und Sicherungen werden zentral im Arten-Explorer verwaltet/);
  assert.match(helper, /function TaxonomyHelper\.searchPackageStatus\(\)/);
  assert.match(helper, /taxonomy-search\.sqlite/);
  assert.match(helper, /manifest\.json/);
});
