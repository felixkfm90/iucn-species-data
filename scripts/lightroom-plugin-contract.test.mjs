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

test("Explizite FN-Nutzungserfassung liest nur SDK-Kennungen zweimal und speichert nach Abbruch oder Änderung nichts", async () => {
  const { default: fengari } = await import("fengari");
  const { lua, lauxlib, lualib, to_luastring } = fengari;
  const capture = await source("CaptureCatalogUsage.lua");
  const captureCore = await source("CatalogUsageCapture.lua");
  assert.doesNotMatch(capture, /withWriteAccess|setPropertyForPlugin|addKeyword|removeKeyword|StatisticsIndex|sqlite/i);
  assert.match(await source("PluginMenu.lua"), /FN-Katalognutzung erfassen.*CaptureCatalogUsage\.lua/);
  for (const scenario of ["success", "empty", "cancel", "changed", "duplicate", "invalid", "helper-error", "dialog-cancel"]) {
    const state = lauxlib.luaL_newstate(); lualib.luaL_openlibs(state);
    const script = `
      local scenario = "${scenario}"
      local calls, reads, messages, done = 0, 0, {}, false
      local id = "mtx_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      local photos = {}
      for i = 1, 3 do photos[i] = {
        getRawMetadata = function(_, field) assert(field == "uuid"); return scenario == "duplicate" and "same" or "uuid-" .. i end,
        getPropertyForPlugin = function(_, _, field) assert(field == "masterTaxonId");
          if scenario == "invalid" then return "bad" end
          if scenario == "changed" and reads == 2 and i == 1 then return "" end
          return scenario ~= "empty" and i <= 2 and id or ""
        end,
      } end
      local catalog = { getPath = function() return "D:/current.lrcat" end,
        getAllPhotos = function() reads = reads + 1; return photos end }
      local scope = { setCancelable = function() end, setCaption = function() end, setPortionComplete = function() end,
        isCanceled = function() return scenario == "cancel" end, done = function() done = true end }
      function import(name)
        if name == "LrApplication" then return { activeCatalog = function() return catalog end } end
        if name == "LrDialogs" then return { attachErrorDialogToFunctionContext = function() end,
          confirm = function() return scenario == "dialog-cancel" and "cancel" or "ok" end,
          message = function(title, message) table.insert(messages, title .. message) end } end
        if name == "LrFunctionContext" then return { callWithContext = function(_, callback) callback({}) end } end
        if name == "LrProgressScope" then return function() return scope end end
        if name == "LrTasks" then return { startAsyncTask = function(callback) callback() end, pcall = pcall, yield = function() end } end
        error("Unexpected API: " .. name)
      end
      local Json = (function() ${await source("Json.lua")} end)()
      local core
      function require(name) if name == "Json" then return Json end;
        if name == "CatalogUsageCapture" then return core end;
        assert(name == "TaxonomyHelper"); return { request = function(input)
        calls = calls + 1; assert(input.command == "catalog-usage-capture" and input.complete and input.passes == 2)
        assert(input.totalPhotos == 3)
        if scenario == "empty" then assert(#input.usedTaxa == 0 and Json.encode(input.usedTaxa) == "[]")
        else assert(#input.usedTaxa == 1 and input.usedTaxa[1].photoCount == 2) end
        if scenario == "helper-error" then error("helper failed") end
        return { saved = true, assignedPhotos = 2, taxonCount = 1 }
      end } end
      _PLUGIN = {}
      core = (function() ${captureCore} end)()
      ${capture}
      assert(calls == ((scenario == "success" or scenario == "empty" or scenario == "helper-error") and 1 or 0))
      assert(done == (scenario ~= "dialog-cancel"))
      if scenario == "success" or scenario == "empty" then assert(reads == 2 and messages[1]:find("FN%-Nutzung erfasst"))
      elseif scenario ~= "dialog-cancel" then assert(messages[1]:find("FN%-Nutzung nicht übernommen")) end
    `;
    try {
      assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK, lua.lua_tojsstring(state, -1));
      const result = lua.lua_pcall(state, 0, 0, 0);
      assert.equal(result, lua.LUA_OK, `${scenario}: ${result === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1)}`);
    } finally { lua.lua_close(state); }
  }
});

test("Lua-Paketstatus folgt gemeinsamem Zeiger und Korrekturen ohne Prozess- oder Katalogzugriff", async () => {
  const { default: fengari } = await import("fengari");
  const { lua, lauxlib, lualib, to_luastring } = fengari;
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const script = `
    local Json = (function() ${await source("Json.lua")} end)()
    _PLUGIN = { path = "D:/fixture/lightroom-plugin/FNWildlifeTaxonomy.lrplugin" }
    local files = {}
    local root = "D:/fixture/lightroom"
    local function child(parent, leaf) return parent .. "/" .. leaf end
    function import(name)
      if name == "LrPrefs" then return { prefsForPlugin = function() return { searchRoot = root } end } end
      if name == "LrFileUtils" then return { exists = function(p) return files[p] and "file" or false end } end
      if name == "LrPathUtils" then return { child = child, parent = function(p) return p:match("^(.*)/[^/]+$") end } end
      return setmetatable({}, { __index = function() error("Unexpected Lightroom call: " .. name) end })
    end
    function require(name) assert(name == "Json"); return Json end
    io.open = function(p)
      if not files[p] then return nil end
      return { read = function() return files[p] end, close = function() return true end }
    end
    local Helper = (function() ${await source("TaxonomyHelper.lua")} end)()
    local legacy = root .. "/active/"
    files[legacy .. "taxonomy-search.sqlite"] = "database"
    files[legacy .. "manifest.json"] = Json.encode({ taxonCount=2, packageId="old", masterVersion="master-old" })
    assert(Helper.searchPackageStatus().packageId == "old")
    local pair = { id="publication-11111111-1111-4111-8111-111111111111", packageId="new", masterVersion="master-new",
      correctionPointer={ basePackageId="new", baseMasterVersion="master-new", revision="paired" } }
    local pointerPath = "D:/fixture/taxonomy-publication/active.json"
    files[pointerPath] = Json.encode({ schemaVersion=1, searchRoot=root:lower(), active=pair })
    local release = root .. "/releases/" .. pair.id .. "/"
    files[release .. "taxonomy-search.sqlite"] = "database"
    files[release .. "manifest.json"] = Json.encode({ taxonCount=3, packageId="new", masterVersion="master-new" })
    assert(Helper.searchPackageStatus().packageId == "new")
    assert(Helper.searchPackageStatus().correctionRevision == "paired")
    files["D:/fixture/corrections/active.json"] = Json.encode({ basePackageId="new", baseMasterVersion="master-new", revision="later" })
    assert(Helper.searchPackageStatus().correctionRevision == "later")
    files[pointerPath] = "invalid"
    assert(not Helper.searchPackageStatus().available)
  `;
  try {
    assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK, lua.lua_tojsstring(state, -1));
    const result = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(result, lua.LUA_OK, result === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
  } finally { lua.lua_close(state); }
});

test("Identitäts-Schreibkern bleibt separat, journalgebunden und ohne Ort-/Zeit- oder automatische Menüaktion", async () => {
  const writer = await source("IdentityWriter.lua");
  const snapshot = await source("IdentitySnapshot.lua");
  const normalWriter = await source("KeywordWriter.lua");
  const menu = await source("PluginMenu.lua");
  const workflow = await source("IdentityWorkflow.lua");
  const catalog = await source("IdentityCatalog.lua");
  assert.match(writer, /#changes <= 250/);
  assert.match(writer, /timeout = 10/);
  assert.match(writer, /IdentitySnapshot\.validate\(to\)/);
  assert.match(writer, /IdentitySnapshot\.capture\(entry.photo\)/);
  assert.match(writer, /PluginState\.applyStatisticsPhotoChanges/);
  assert.doesNotMatch(writer, /LocationTimeWriter\.(?:prepare|applyPrepared|execute)|KeywordWriter\.assign/);
  assert.match(snapshot, /LrTasks\.pcall/);
  assert.doesNotMatch(snapshot, /[^.]\bpcall\(/);
  assert.match(normalWriter, /function KeywordWriter\.identityTemplate/);
  assert.match(normalWriter, /function KeywordWriter\.assign[\s\S]*?KeywordWriter\.findConflicts/);
  assert.doesNotMatch(menu, /IdentityWriter|IdentitySnapshot/);
  assert.match(workflow, /request\("prepare", preparedInput\)/);
  assert.match(workflow, /request\("block-confirm", blockInput\)/);
  assert.match(workflow, /Writer\.applyBlock[\s\S]*request\("checkpoint"/);
  assert.match(workflow, /LrTasks\.pcall\(action\)/);
  assert.doesNotMatch(workflow, /[^.]\bpcall\(/);
  assert.match(catalog, /function IdentityCatalog\.guard[\s\S]*catalog:getAllPhotos\(\)/);
  assert.doesNotMatch(catalog.slice(catalog.indexOf("function IdentityCatalog.guard")), /Helper\.request|LrTasks\.yield|withWriteAccessDo/);
  const action = await source("IdentityAction.lua");
  const view = await source("IdentityView.lua");
  assert.match(menu, /Artänderungen prüfen"[\s\S]*?ReviewIdentity\.lua/);
  assert.match(await source("ReviewIdentity.lua"), /LrTasks.startAsyncTask/);
  assert.match(action, /Workflow\.prepare[\s\S]*?process\(catalog, input\)/);
  assert.match(action, /"recovery-preview"/);
  assert.match(action, /"undo-prepare"/);
  assert.match(view, /props.choice = ""/);
  assert.match(view, /scope:setCancelable\(true\)/);
  assert.doesNotMatch(action, /KeywordWriter\.assign|IdentityWriter\.applyBlock|withWriteAccessDo/);
});

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
    "FN Wildlife verwalten",
    "FN Wildlife – Ort und Zeit",
    "FN Wildlife – Weitere Aktionen",
    "Statistik und Exporte",
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
    "ReviewIdentity.lua",
  ]) {
    assert.match(pluginMenu, new RegExp(script.replace(".", "\\.")));
  }
  assert.match(pluginMenu, /ALLOWED_SCRIPTS\[action\.script\] = true/);
  assert.match(pluginMenu, /LrPathUtils\.child\(_PLUGIN\.path, script\)/);
  assert.match(pluginMenu, /LrTasks\.pcall\(dofile, path\)/);
  assert.match(pluginMenu, /title = "Schließen"[\s\S]*?choose\(\{\}\)/);
  assert.match(pluginMenu, /if dialogControls then dialogControls:close\(\) end/);
  assert.match(pluginMenu, /title = "Taxonomie zuweisen"[\s\S]*?script = "AssignTaxonomy\.lua"/);
  assert.match(pluginMenu, /Orts-\/Zeitdaten aktualisieren"/);
  assert.match(pluginMenu, /FN-Daten aktualisieren"/);
  assert.doesNotMatch(pluginMenu, /title = "[^"]*\.\.\.|title = "[^"]*…/);
  assert.match(pluginMenu, /tooltip = action\.tooltip/);
  assert.match(pluginMenu, /title = action\.summary[\s\S]*?height_in_lines = 2/);
  assert.match(info, /LrMetadataProvider\s*=\s*"MetadataDefinition\.lua"/);
  assert.match(info, /LrMetadataTagsetFactory\s*=\s*\{/);
  assert.match(info, /"MetadataTagset\.lua"/);
  assert.match(info, /"MetadataTagsetFull\.lua"/);
  assert.match(info, /LrPluginInfoProvider\s*=\s*"PluginInfoProvider\.lua"/);
  const version = info.match(
    /VERSION\s*=\s*\{[\s\S]*?major\s*=\s*(\d+)[\s\S]*?minor\s*=\s*(\d+)[\s\S]*?revision\s*=\s*(\d+)[\s\S]*?build\s*=\s*(\d+)/,
  );
  assert.ok(version, "Info.lua muss eine vollständig lesbare Plug-in-Version enthalten");
  assert.equal(version.slice(1).join("."), "0.4.24.21");
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
  const tempHelper = await fs.readFile(path.join(ROOT, "species-explorer", "lightroom-temp-helper.mjs"), "utf8");
  assert.match(tempHelper, /--search-root=/);
  assert.match(helper, /require\("TempSession"\)/);
  assert.match(helper, /Technische Meldung/);
  assert.match(helper, /local Json = require "Json"/);
  assert.doesNotMatch(helper, /LrJson/);
  assert.match(json, /function Json\.encode\(value\)/);
  assert.match(json, /function Json\.decode\(text\)/);
  assert.match(tempHelper, /--request=/);
  assert.match(tempHelper, /--response=/);
  assert.match(helper, /local ok, result = LrTasks\.pcall\(executeRequest\)/);
  assert.match(helper, /local function writeTextFile\(path, content\)/);
  assert.match(helper, /local function readTextFile\(path\)/);
  assert.match(helper, /io\.open\(path, "wb"\)/);
  assert.match(helper, /io\.open\(path, "rb"\)/);
  assert.doesNotMatch(helper, /LrFileUtils\.(?:writeFile|readFile)/);
  assert.match(helper, /operation:release\(\)/);
  assert.match(tempHelper, /cleanupOwnedPluginTempSession/);
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
  assert.match(window, /DataVersionView\.summary\(status\.dataVersions\)/);
  assert.match(window, /factory:group_box/);
  assert.match(window, /1\. Aktuelle Lightroom-Auswahl/);
  assert.match(window, /2\. Art suchen und auswählen/);
  assert.match(window, /3\. Taxonomie prüfen/);
  assert.match(window, /4\. Taxonomie verwalten/);
  assert.match(window, /Ausgewählte Art zuweisen/);
  assert.match(window, /Taxonomie entfernen/);
  assert.match(window, /title = "Artbezeichnung korrigieren"/);
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
  assert.doesNotMatch(window, /fill_vertical\s*=/);
  assert.match(window, /height\s*=\s*150/);
  assert.match(window, /ASSIGNMENT_WINDOW_WIDTH\s*=\s*960/);
  assert.doesNotMatch(window, /TAXONOMY_PREVIEW_WIDTH/);
  assert.match(window, /local function setPreview\(value\)/);
  assert.match(window, /string\.gmatch\(text \.\. "\\n", "\(\.\-\)\\n"\)/);
  assert.match(window, /props\.previewLines\s*=\s*lines/);
  assert.match(window, /title\s*=\s*line == "" and " " or line/);
  assert.match(window, /value\s*=\s*tostring\(#lines \+ 1\)/);
  assert.match(window, /props\.previewSelection\s*=\s*\{\}/);
  assert.match(window, /factory:simple_list\(\{/);
  assert.match(window, /items\s*=\s*bind\("previewLines"\)/);
  assert.match(window, /factory:simple_list\(\{[\s\S]*?height = 150,[\s\S]*?fill_horizontal = 1/);
  assert.doesNotMatch(window, /background_color|local LrColor/);
  assert.doesNotMatch(window, /PREVIEW_LINE_LIMIT|previewLineVisible|previewLineViews/);
  assert.doesNotMatch(window, /width\s*=\s*760/);
  assert.doesNotMatch(window, /width\s*=\s*740/);
  assert.doesNotMatch(window, /height_in_lines\s*=\s*-1/);
  assert.doesNotMatch(window, /previewLineCount|textLineCount/);
  assert.doesNotMatch(window, /height_in_lines\s*=\s*32/);
  assert.match(window, /width\s*=\s*ASSIGNMENT_WINDOW_WIDTH/);
  const floatingDialog = window.slice(window.indexOf("LrDialogs.presentFloatingDialog(_PLUGIN"));
  assert.doesNotMatch(floatingDialog, /resizable\s*=|\bwidth\s*=|\bheight\s*=/);
  assert.match(window, /save_frame\s*=\s*"fnWildlifeTaxonomyAssignmentWindowV7"/);
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
  assert.match(writer, /local LrTasks = import "LrTasks"/);
  assert.doesNotMatch(writer, /(^|[^.\w])pcall\(/m,
    "Auch Stichwort-Lesezugriffe müssen die yield-fähige SDK-Fehlergrenze verwenden");
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
  assert.match(pluginMenu, /title\s*=\s*"Schließen"[\s\S]*?choose\(\{\}\)/);
  assert.match(pluginMenu, /if dialogControls then dialogControls:close\(\) end/);
});

test("Taxonomie kann als eigene Zusatzmodul-Aktion kontrolliert entfernt werden", async () => {
  const pluginMenu = await source("PluginMenu.lua");
  const removal = await source("RemoveTaxonomy.lua");
  assert.match(pluginMenu, /title = "Taxonomie entfernen"/);
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
  assert.match(locationTime, /local LrTasks = import "LrTasks"/);
  assert.match(locationTime, /local function assignedKeywords\(photo\)/);
  assert.match(locationTime, /local ok, assigned = LrTasks\.pcall\(function\(\)/);
  assert.match(locationTime, /if not ok or type\(assigned\) ~= "table" then/);
  assert.doesNotMatch(locationTime, /getFormattedMetadata\("keywordTags"\)|getKeywordByLocalIdentifier|getLocalIdentifier/);
  assert.doesNotMatch(locationTime, /(^|[^.\w])pcall\(/m);
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
  assert.match(suggestions, /operation:release\(\)/);
  assert.match(suggestions, /stopIfCanceled = false/);
  assert.doesNotMatch(suggestions, /LrHttp|\.lrcat|sqlite/i);
  const assignmentFunction = assignmentWindow.slice(
    assignmentWindow.indexOf("local function assign()"),
    assignmentWindow.indexOf("local function openCorrection()"),
  );
  assert.ok(
    assignmentFunction.indexOf("LocationTimeWriter.prepare(catalog, photos")
      < assignmentFunction.indexOf("KeywordWriter.assign,"),
    "Ortsvorschläge müssen vor dem eigentlichen Zuweisungsaufruf aufgelöst werden",
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
  assert.match(menu, /function LocationTimeMenu\.runForPhotos\(catalog, photos, mode\)/);
  assert.match(menu, /if mode ~= "remove" then\s*plans, preparation = LocationTimeWriter\.prepare/);
  assert.match(assignmentWindow, /title = "Orts- und Zeitdaten entfernen"/);
  assert.match(assignmentWindow, /LrTasks\.pcall\(LocationTimeMenu\.runForPhotos, catalog, photos, "remove"\)/);
  assert.ok(assignmentWindow.lastIndexOf('title = "Orts- und Zeitdaten entfernen"')
    < assignmentWindow.lastIndexOf('title = "Schließen"'));
});

test("Gesamtbereinigung und Katalogpflege bleiben kontrolliert, blockweise und ID-basiert", async () => {
  const pluginMenu = await source("PluginMenu.lua");
  const removal = await source("RemoveAllFnData.lua");
  const maintenanceAction = await source("UpdateCatalogFnData.lua");
  const maintenance = await source("CatalogMaintenance.lua");
  const writer = await source("KeywordWriter.lua");
  const locationTime = await source("LocationTimeWriter.lua");

  assert.match(pluginMenu, /Alle FN-Daten der Auswahl entfernen"/);
  assert.match(pluginMenu, /FN-Daten aktualisieren"/);
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
  const exportFile = await source("ExportFile.lua");
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
  assert.match(dialog, /ExportFile\.choosePath/);
  assert.match(exportFile, /props\.fileName = fileName/);
  assert.match(exportFile, /factory:edit_field\(\{ value = LrView\.bind\("fileName"\)/);
  assert.match(exportFile, /LrDialogs\.runOpenPanel/);
  assert.match(exportFile, /canChooseFiles = false/);
  assert.match(exportFile, /canChooseDirectories = true/);
  assert.doesNotMatch(exportFile, /initialFileName|initialFilename|runSavePanel/);
  assert.match(exportFile, /string\.char\(239, 187, 191\)/);
  assert.match(exportFile, /LrFileUtils\.chooseUniqueFileName\(path \.\. "\.fn-export\.tmp"\)/);
  assert.match(exportFile, /LrFileUtils\.move\(source, destination\)/);
  assert.match(exportFile, /Vorhandene Exportdatei ersetzen/);
  for (const fileName of ["Lifelist.csv", "Beobachtungsliste.csv", "Artenliste.txt"]) {
    assert.ok(dialog.includes(`"${fileName}"`), fileName);
  }
  assert.match(dialog, /Nur markierte Fotos/);
  assert.match(dialog, /Statistics\.selectedPhotos\(catalog\)/);
  assert.match(dialog, /Statistics\.forPhotos\(catalog, photos/);
  assert.match(statistics, /function Statistics\.selectedPhotos/);
  assert.match(statistics, /if not catalog:getTargetPhoto\(\) then\s+return \{\}/);
  assert.match(statistics, /catalog:getTargetPhotos\(\)/);
  assert.match(statistics, /function Statistics\.forPhotos/);
  const selectionRead = statistics.slice(statistics.indexOf("function Statistics.forPhotos"), statistics.indexOf("function Statistics.beginBuild"));
  assert.doesNotMatch(selectionRead, /getAllPhotos|saveStatisticsIndex|saveStatisticsBuild/);
  const opening = dialog.slice(dialog.lastIndexOf("LrTasks.startAsyncTask(function()"));
  assert.doesNotMatch(opening, /buildIndexWindow/);
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
  assert.match(provider, /Version: 0\.4\.24\.21/);
  assert.match(provider, /TaxonomyHelper\.searchPackageStatus\(\)/);
  assert.match(provider, /Taxonomiedatenbank, Aktualisierungen und Sicherungen werden zentral im Arten-Explorer verwaltet/);
  assert.match(helper, /function TaxonomyHelper\.searchPackageStatus\(\)/);
  assert.match(helper, /taxonomy-search\.sqlite/);
  assert.match(helper, /manifest\.json/);
});

test("Versionsvergleich läuft asynchron und verändert weder Katalog noch Zuweisung", async () => {
  const provider = await source("PluginInfoProvider.lua");
  const window = await source("AssignmentWindow.lua");
  const view = await source("DataVersionView.lua");
  assert.match(provider, /sectionsForTopOfDialog = function\(factory, propertyTable\)/);
  assert.match(provider, /bind_to_object = propertyTable/);
  assert.match(provider, /LrTasks\.startAsyncTask\(function\(\)[\s\S]*LrTasks\.pcall\(TaxonomyHelper\.request, \{ command = "versions" \}\)/);
  assert.match(provider, /Datenstand erneut prüfen/);
  assert.match(window, /local DataVersionView = require "DataVersionView"/);
  assert.match(window, /DataVersionView\.summary\(status\.dataVersions\)/);
  assert.doesNotMatch(window, /require "Statistics"|refreshLifelist|lifelistStatus/);
  assert.doesNotMatch(`${provider}\n${view}`, /withWriteAccessDo|createKeyword|addKeyword|setPropertyForPlugin|command = "build"/);
  for (const key of ["referenceRelease", "masterReferenceRelease", "masterVersion", "packageMasterVersion", "packageId", "correctionRevision"]) assert.match(view, new RegExp(key));
});

test("Namenswahl bestätigt Konflikte und erlaubt eine ausdrückliche Übernahme ohne Fotozuweisung", async () => {
  const window = await source("AssignmentWindow.lua");
  const preference = await source("NamePreference.lua");
  const helper = await source("TaxonomyHelper.lua");
  assert.match(window, /NamePreference\.items\(taxon\)/);
  assert.match(window, /items = bind\("germanNameItems"\)/);
  assert.match(preference, /preview\.requiresConfirmation[\s\S]*LrDialogs\.confirm/);
  assert.match(preference, /preview\.previousGermanName[\s\S]*preview\.germanName/);
  assert.match(preference, /if choice ~= "ok" then return nil, nil end/);
  assert.match(preference, /token = preview\.token, confirmed = true/);
  assert.ok(window.indexOf("KeywordWriter.assign,") < window.indexOf("NamePreference.publish(preference)"));
  assert.match(window, /preference and result\.photoCount > 0/);
  assert.match(window, /title = "Speichern wiederholen"/);
  const directSave = window.match(/local function saveNamePreference\(\)([\s\S]*?)\n  local view =/)[1];
  assert.match(directSave, /LrTasks\.pcall\(NamePreference\.prepare, taxon, germanName\)/);
  assert.match(directSave, /if ok and payload then[\s\S]*NamePreference\.publish\(payload\)/);
  assert.match(directSave, /if not published then pendingNamePreference = payload end/);
  assert.match(directSave, /loadTaxon\(taxon\.masterTaxonId/);
  assert.doesNotMatch(directSave, /KeywordWriter|withWriteAccessDo|setPropertyForPlugin|createKeyword|getTargetPhotos/);
  assert.match(window, /LrTasks\.startAsyncTask\(saveNamePreference\)/);
  assert.match(window, /enabled = bind\("canSavePreference"\)/);
  assert.match(window, /props\.selectedGermanName ~= currentTaxon\.germanName/);
  assert.doesNotMatch(preference, /Fotos zugewiesen;/);
  assert.match(window, /NamePreference\.providerStandard, taxon/);
  assert.match(preference, /function NamePreference\.providerStandard\(taxon\)/);
  assert.match(preference, /useProviderStandard = true/);
  assert.match(helper, /lightroom-name-preference-helper\.mjs/);
  assert.doesNotMatch(preference, /withWriteAccessDo|setPropertyForPlugin|createKeyword/);
});

async function assignmentViewFixture(body) {
  const { default: fengari } = await import("fengari");
  const { lua, lauxlib, lualib, to_luastring } = fengari;
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const script = `
    local props, dialog, duringDialog
    local originalPcall, dialogsClosed, published, confirmations = pcall, 0, 0, 0
    local failPublish, confirmResult, removalCalls = false, "ok", 0
    local preferred = "Rebhuhn"
    local recentTaxa, requests, assignmentCalls = {}, {}, 0
    local allowAssignment, failTaxon, packageAvailable = false, false, true
    local photo = {
      getPropertyForPlugin = function() return "" end,
      getFormattedMetadata = function() return "test.jpg" end,
      getRawMetadata = function() return "D:/test.jpg" end,
    }
    local catalog = { getTargetPhotos = function() return { photo } end, getTargetPhoto = function() return photo end }
    local factory = { dialog_spacing = function() return 12 end, control_spacing = function() return 6 end }
    for _, kind in ipairs({ "column", "row", "group_box", "push_button", "static_text", "popup_menu", "edit_field", "simple_list", "spacer" }) do
      factory[kind] = function(_, value) value.kind = kind; return value end
    end
    function import(name)
      if name == "LrApplication" then return { activeCatalog = function() return catalog end } end
      if name == "LrPathUtils" then return { leafName = function() return "test.jpg" end } end
      if name == "LrView" then return { osFactory = function() return factory end, bind = function(key) return { key = key } end } end
      if name == "LrTasks" then return { pcall = originalPcall, startAsyncTask = function(fn) fn() end, yield = function() end, sleep = function() end } end
      if name == "LrBinding" then return { makePropertyTable = function()
        local values, observers = {}, {}
        props = setmetatable({ addObserver = function(_, key, fn)
          observers[key] = observers[key] or {}; table.insert(observers[key], fn)
        end }, { __index = values, __newindex = function(_, key, value)
          local old = values[key]; values[key] = value
          if old ~= value then for _, fn in ipairs(observers[key] or {}) do fn() end end
        end })
        return props
      end } end
      if name == "LrDialogs" then return {
        confirm = function() confirmations = confirmations + 1; return confirmResult end,
        presentFloatingDialog = function(_, options)
          dialog = options
          options.onShow({ close = function() dialogsClosed = dialogsClosed + 1 end })
          duringDialog(options.contents)
          options.windowWillClose()
        end,
      } end
      error("Unexpected import: " .. name)
    end
    local Helper = {
      request = function(input)
        table.insert(requests, input)
        if input.command == "status" then return { available = packageAvailable } end
        if input.command == "search" then return { { masterTaxonId = "mtx_test", germanName = preferred } } end
        assert(input.command == "taxon")
        if failTaxon then error("test taxon unavailable") end
        return { masterTaxonId = input.masterTaxonId, rank = "species", germanName = preferred,
          searchPackage = { packageId = "package", masterVersion = "master", correctionRevision = "revision" },
          acceptedScientificName = "Perdix perdix", hierarchy = {}, names = {}, }
      end,
      searchPackageStatus = function() return { available = packageAvailable, packageId = "package", masterVersion = "master", correctionRevision = "revision" } end,
      namePreference = function(input)
        if input.command == "preview" then
          return { germanName = input.usePrevious and "Feldhuhn" or input.useProviderStandard and "Feldhuhn" or input.germanName,
            previousGermanName = preferred, requiresConfirmation = true, token = "token" }
        end
        assert(input.command == "save" and input.confirmed and input.token == "token")
        if failPublish then error("test publish failed") end
        published = published + 1
        preferred = input.useProviderStandard and "Feldhuhn" or input.germanName
        return { saved = true }
      end,
    }
    local modules = {
      TaxonomyHelper = Helper,
      PluginState = {
        recentTaxa = function() return recentTaxa end,
        addRecentTaxon = function(taxon) recentTaxa = { taxon } end,
      },
      DataVersionView = { summary = function() return "Paket bereit" end },
      KeywordWriter = {
        findConflicts = function() assert(allowAssignment, "No taxonomy write expected"); return {} end,
        assign = function() assert(allowAssignment, "No taxonomy write expected"); assignmentCalls = assignmentCalls + 1; return { photoCount = 1 } end,
      },
      LocationTimeWriter = { prepare = function() assert(allowAssignment, "No location preparation expected"); return {}, {} end },
      LocationTimeMenu = { runForPhotos = function(receivedCatalog, photos, mode)
        assert(receivedCatalog == catalog and #photos == 1 and mode == "remove")
        removalCalls = removalCalls + 1; return nil
      end },
    }
    function require(name) assert(modules[name], name); return modules[name] end
    modules.TaxonomyRanks = (function() ${await source("TaxonomyRanks.lua")} end)()
    modules.NamePreference = (function() ${await source("NamePreference.lua")} end)()
    _PLUGIN = {}
    local Window = (function() ${await source("AssignmentWindow.lua")} end)()
    local function find(view, title)
      if view.title == title then return view end
      for _, child in ipairs(view) do local found = find(child, title); if found then return found end end
    end
    local function open(body) duringDialog = body; Window.show({}) end
    local function load(view) props.query = "rebhuhn"; find(view, "Art suchen").action() end
    ${body}
  `;
  try {
    assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK, lua.lua_tojsstring(state, -1));
    const result = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(result, lua.LUA_OK, result === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
  } finally { lua.lua_close(state); }
}

test("Zuweisungsansicht bündelt Namensaktionen, gemeinsame Vorschaukanten und beide Rücknahmen in Schritt 4", async () => {
  await assignmentViewFixture(`
    open(function(view)
      local search = find(view, "2. Art suchen und auswählen")[1]
      local save = find(search, "Als bevorzugt speichern")
      local nameRow
      for _, child in ipairs(search) do if child.kind == "row" and child[1] == save then nameRow = child end end
      assert(nameRow and #nameRow == 4 and nameRow.spacing == 6)
      local titles = { "Als bevorzugt speichern", "Vorherigen Namen auswählen", "Anbieterstandard verwenden", "Speichern wiederholen" }
      for i, title in ipairs(titles) do assert(nameRow[i].title == title and #nameRow[i].tooltip > 40) end
      local preview = find(view, "3. Taxonomie prüfen")[1]
      assert(preview.spacing == 6 and preview.fill_horizontal == 1)
      assert(view.width == 960 and view.margin == 0 and view.fill_vertical == nil)
      for _, group in ipairs(view) do if group.kind == "group_box" then
        assert(group.margin_horizontal == 10 and group[1].width == 940)
        assert(group[1].width + 2 * group.margin_horizontal == view.width)
      end end
      assert(preview[1].kind == "simple_list" and preview[1].width == preview.width and preview[1].height == 150)
      assert(preview[1].fill_horizontal == 1 and preview[2].fill_horizontal == 1)
      assert(preview[2][1].kind == "spacer" and preview[2][1].fill_horizontal == 1)
      assert(preview[2][2].title == "Artbezeichnung korrigieren")
      local row = find(view, "4. Taxonomie verwalten")[1][1]
      assert(row.kind == "row" and #row == 3)
      assert(row[2].title == "Taxonomie entfernen" and row[3].title == "Orts- und Zeitdaten entfernen")
      assert(row[2].enabled.key == "canRemove" and row[3].enabled.key == "canRemove")
      row[3].action(); assert(removalCalls == 1 and not props.busy)
      local footer = view[#view]
      assert(#footer == 2 and footer[1].kind == "spacer" and footer[2].title == "Schließen")
      assert(dialog.height == nil and dialog.width == nil and dialog.resizable == nil)
      assert(dialog.save_frame == "fnWildlifeTaxonomyAssignmentWindowV7")
      footer[2].action()
    end)
    assert(dialogsClosed == 1 and published == 0)
    open(function(view) find(view, "Schließen").action() end)
    assert(dialogsClosed == 2 and published == 0)
  `);
});

test("Zuletzt verwendet bleibt beim Öffnen und nach Zuweisung leer; nur explizite Auswahl lädt eine Art", async () => {
  await assignmentViewFixture(`
    recentTaxa = {
      { masterTaxonId = "mtx_recent", germanName = "Rötelschwalbe" },
      { masterTaxonId = "mtx_second", germanName = "Rebhuhn" },
    }
    open(function(view)
      assert(#requests == 1 and requests[1].command == "status")
      assert(#props.recentItems == 3 and props.recentItems[1].value == "")
      assert(props.recentItems[2].value == "mtx_recent" and props.recentItems[3].value == "mtx_second")
      local button = find(view, "Öffnen")
      assert(button.enabled.key == "canOpenRecent" and props.recentTaxonId == "" and not props.canOpenRecent)
      button.action(); assert(#requests == 1)
      props.recentTaxonId = "mtx_recent"; assert(props.canOpenRecent)
      button.action(); assert(#requests == 2 and requests[2].masterTaxonId == "mtx_recent")
      assert(props.canAssign and assignmentCalls == 0 and published == 0)
      allowAssignment = true; find(view, "Ausgewählte Art zuweisen").action()
      assert(assignmentCalls == 1 and props.recentTaxonId == "" and not props.canOpenRecent)
      assert(#props.recentItems == 2 and props.recentItems[2].value == "mtx_recent")
    end)
    open(function(view)
      assert(props.recentTaxonId == "" and not props.canOpenRecent and not props.canAssign)
      assert(props.preview == "Noch keine Art ausgewählt.")
      props.recentTaxonId = "mtx_recent"; failTaxon = true
      find(view, "Öffnen").action()
      assert(not props.canAssign and not props.busy and props.actionStatus:find("test taxon unavailable", 1, true))
    end)
    packageAvailable = false
    open(function(view)
      props.recentTaxonId = "mtx_recent"; assert(not props.canOpenRecent)
      local count = #requests; find(view, "Öffnen").action(); assert(#requests == count)
    end)
    assert(assignmentCalls == 1 and published == 0 and removalCalls == 0)
  `);
});

test("Namensrückmeldungen nutzen vorhandenen Status mit vollständigem Tooltip statt leerer Statusfläche", async () => {
  await assignmentViewFixture(`
    open(function(view)
      local search = find(view, "2. Art suchen und auswählen")[1]
      local status, separatePreferenceStatus
      for _, control in ipairs(search) do if control.kind == "static_text" and type(control.title) == "table" then
        if control.title.key == "actionStatus" then status = control end
        if control.title.key == "preferenceStatus" then separatePreferenceStatus = control end
      end end
      assert(status and status.tooltip.key == "actionStatus" and status.height_in_lines == nil)
      assert(status.width == search.width and not separatePreferenceStatus)
      assert(props.preferenceStatus == "" and props.actionStatus == props.searchStatus)
      load(view); find(view, "Vorherigen Namen auswählen").action()
      assert(props.actionStatus:find("Vorheriger Name ausgewählt", 1, true))
      failPublish = true; find(view, "Als bevorzugt speichern").action()
      assert(props.canRetryPreference and props.actionStatus:find("test publish failed", 1, true))
      assert(props.actionStatus:sub(1, #props.preferenceStatus) == props.preferenceStatus)
      props.searchStatus = "Neue Suchmeldung"
      assert(props.actionStatus:find("Neue Suchmeldung", 1, true) and props.actionStatus:find("test publish failed", 1, true))
      find(view, "Ausgewählte Art zuweisen").action()
      assert(props.actionStatus:find("Speichern wiederholen", 1, true) and assignmentCalls == 0)
      failPublish = false; find(view, "Speichern wiederholen").action()
      assert(published == 1 and not props.canRetryPreference and props.actionStatus:find(props.preferenceStatus, 1, true))
    end)
    assert(assignmentCalls == 0 and removalCalls == 0)
  `);
});

test("Beschriftete Namensaktionen behalten Vorauswahl, Bestätigung und Anbieterstandard ohne Fotozuweisung", async () => {
  await assignmentViewFixture(`
    open(function(view)
      load(view)
      assert(not props.canSavePreference and not props.canRetryPreference, "initial buttons")
      find(view, "Vorherigen Namen auswählen").action()
      assert(props.selectedGermanName == "Feldhuhn" and preferred == "Rebhuhn" and published == 0)
      assert(props.canSavePreference)
      confirmResult = "cancel"; find(view, "Als bevorzugt speichern").action()
      assert(published == 0 and preferred == "Rebhuhn" and not props.busy)
      confirmResult = "ok"; find(view, "Als bevorzugt speichern").action()
      assert(published == 1 and preferred == "Feldhuhn" and not props.canSavePreference, "direct save")
      props.selectedGermanName = "Rebhuhn"; find(view, "Als bevorzugt speichern").action()
      assert(published == 2 and preferred == "Rebhuhn")
      confirmResult = "cancel"; find(view, "Anbieterstandard verwenden").action()
      assert(published == 2 and preferred == "Rebhuhn")
      confirmResult = "ok"; find(view, "Anbieterstandard verwenden").action()
      assert(published == 3 and preferred == "Feldhuhn" and not props.busy)
    end)
    assert(removalCalls == 0 and confirmations == 5)
  `);
});

test("Speichern wiederholen ist nur nach Teilerfolg aktiv und übernimmt dieselbe offene Namenswahl ohne Zuweisung", async () => {
  await assignmentViewFixture(`
    open(function(view)
      load(view)
      find(view, "Vorherigen Namen auswählen").action()
      failPublish = true; find(view, "Als bevorzugt speichern").action()
      assert(published == 0 and preferred == "Rebhuhn" and props.canRetryPreference and not props.busy)
      assert(not props.canSavePreference)
      find(view, "Speichern wiederholen").action()
      assert(published == 0 and props.canRetryPreference and not props.busy)
      failPublish = false; find(view, "Speichern wiederholen").action()
      assert(published == 1 and preferred == "Feldhuhn" and not props.canRetryPreference and not props.busy)
      find(view, "Speichern wiederholen").action()
      assert(published == 1)
    end)
    assert(removalCalls == 0 and confirmations == 1)
  `);
});

test("Verwaltung bündelt sechs Hauptaktionen, bündige Kurztexte und alle zwölf Ziele mit sicherer Navigation", async () => {
  const { default: fengari } = await import("fengari");
  const { lua, lauxlib, lualib, to_luastring } = fengari;
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const script = `
    local calls, messages, closes, fail = {}, {}, 0, false
    local route, step, expectedScript, inDialog = {}, 0, nil, false
    local originalPcall = pcall
    local factory = { dialog_spacing = function() return 12 end, control_spacing = function() return 6 end }
    for _, kind in ipairs({ "column", "row", "push_button", "static_text", "spacer" }) do
      factory[kind] = function(_, value) value.kind = kind; return value end
    end
    local function find(view, title)
      if view.title == title then return view end
      for _, child in ipairs(view) do local result = find(child, title); if result then return result end end
    end
    function import(name)
      if name == "LrView" then return { osFactory = function() return factory end } end
      if name == "LrPathUtils" then return { child = function(root, leaf) return root .. "/" .. leaf end } end
      if name == "LrFunctionContext" then return { callWithContext = function(_, fn) fn({}) end } end
      if name == "LrTasks" then return { pcall = originalPcall, startAsyncTask = function(fn) fn() end, yield = function() end } end
      assert(name == "LrDialogs")
      return { message = function(...) table.insert(messages, { ... }) end, presentFloatingDialog = function(_, options)
        assert(not inDialog, "only one menu window at a time"); inDialog = true
        options.onShow({ close = function() closes = closes + 1 end })
        local cards = {}
        for _, row in ipairs(options.contents) do if row.kind == "row" then
          for _, card in ipairs(row) do if card.kind == "column" then
            assert(card.width == 330 and card.margin == 0 and #card == 2)
            local button, caption = card[1], card[2]
            local help = caption[1]
            assert(button.kind == "push_button" and button.width == card.width and button.place_horizontal == 0)
            assert(not button.title:find("...", 1, true) and not button.title:find("…", 1, true))
            assert(#button.tooltip > 60 and caption.kind == "row" and caption.margin_left == 3)
            assert(help.kind == "static_text" and #help.title > 20 and help.height_in_lines == 2)
            assert(help.tooltip == button.tooltip and help.alignment == "left" and help.place_horizontal == 0)
            assert(help.width + caption.margin_left == button.width)
            table.insert(cards, button)
          end end
        end end
        if options.save_frame == "fnWildlifePluginMenuV2_main" then
          local titles = { "Taxonomie zuweisen", "Art-Favorit festlegen", "Ort und Zeit", "Statistik und Exporte", "FN-Daten aktualisieren", "Weitere Aktionen" }
          assert(#cards == #titles)
          for i, title in ipairs(titles) do assert(cards[i].title == title) end
          assert(not find(options.contents, "Zurück"))
          assert(not find(options.contents, "FN-Katalognutzung erfassen"))
        elseif options.save_frame == "fnWildlifePluginMenuV2_locationTime" then
          assert(#cards == 3 and find(options.contents, "Zurück"))
        else
          assert(options.save_frame == "fnWildlifePluginMenuV2_more" and #cards == 5 and find(options.contents, "Zurück"))
        end
        step = step + 1
        local title = route[step] or "Schließen"
        if title ~= "__window_close__" then
          local button = find(options.contents, title); assert(button, title)
          local count = #calls; button.action(); button.action()
          assert(#calls == count, "navigation must close before executing a target")
        end
        options.windowWillClose(); inDialog = false
      end }
    end
    _PLUGIN = { path = "D:/fixture/plugin" }
    dofile = function(filename)
      assert(not inDialog and filename == _PLUGIN.path .. "/" .. expectedScript)
      table.insert(calls, filename)
      if fail then error("script failed") end
    end
    local function openMenu(sequence, script)
      route, step, expectedScript = sequence, 0, script
      ${await source("PluginMenu.lua")}
    end
    openMenu({}, nil); assert(#calls == 0 and closes == 1)
    openMenu({ "Ort und Zeit", "Zurück", "Weitere Aktionen", "Zurück", "Schließen" }, nil)
    assert(#calls == 0 and closes == 6)
    openMenu({ "Weitere Aktionen", "__window_close__" }, nil); assert(#calls == 0 and closes == 7)
    local cases = {
      { { "Taxonomie zuweisen" }, "AssignTaxonomy.lua" },
      { { "Weitere Aktionen", "Taxonomie entfernen" }, "RemoveTaxonomy.lua" },
      { { "Art-Favorit festlegen" }, "SetReferenceImage.lua" },
      { { "Weitere Aktionen", "Artänderungen prüfen" }, "ReviewIdentity.lua" },
      { { "Ort und Zeit", "Orts-/Zeitdaten hinzufügen" }, "AddLocationTime.lua" },
      { { "Ort und Zeit", "Orts-/Zeitdaten entfernen" }, "RemoveLocationTime.lua" },
      { { "Ort und Zeit", "Orts-/Zeitdaten aktualisieren" }, "UpdateLocationTime.lua" },
      { { "FN-Daten aktualisieren" }, "UpdateCatalogFnData.lua" },
      { { "Weitere Aktionen", "Alle FN-Daten der Auswahl entfernen" }, "RemoveAllFnData.lua" },
      { { "Statistik und Exporte" }, "ShowStatistics.lua" },
      { { "Weitere Aktionen", "Smart-Sammlungen einrichten" }, "CreateCollections.lua" },
      { { "Weitere Aktionen", "FN-Katalognutzung erfassen" }, "CaptureCatalogUsage.lua" },
    }
    for i, case in ipairs(cases) do openMenu(case[1], case[2]); assert(#calls == i) end
    fail = true; openMenu({ "Taxonomie zuweisen" }, "AssignTaxonomy.lua"); assert(#messages == 1 and #calls == 13)
    fail = false; openMenu({ "Taxonomie zuweisen" }, "AssignTaxonomy.lua"); assert(#calls == 14)
    openMenu({}, nil); assert(#calls == 14)
  `;
  try {
    assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK, lua.lua_tojsstring(state, -1));
    const result = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(result, lua.LUA_OK, result === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
  } finally { lua.lua_close(state); }
});
