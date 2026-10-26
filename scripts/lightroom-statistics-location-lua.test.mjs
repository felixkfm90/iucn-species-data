import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const pluginRoot = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const moduleNames = ["TaxonomyRanks", "MetadataDefinition", "KeywordIdFinalizer", "StatisticsIndex", "Statistics", "LocationTimeWriter", "KeywordWriter", "ExportFile", "PhotoSelection"];
const modules = (await Promise.all(moduleNames.map(async (name) =>
  `package.preload["${name}"] = function()\n${await readFile(new URL(`${name}.lua`, pluginRoot), "utf8")}\nend`))).join("\n");
const statisticsWindow = await readFile(new URL("ShowStatistics.lua", pluginRoot), "utf8");
const persistentStateSource = await readFile(new URL("PluginState.lua", pluginRoot), "utf8");
const selectionFunction = persistentStateSource.match(/function PluginState\.selectedPhotos\(catalog\)[\s\S]*?\nend/)[0];
const jsonSource = await readFile(new URL("Json.lua", pluginRoot), "utf8");
const suggestionReaderSource = await readFile(new URL("LocationSuggestionReader.lua", pluginRoot), "utf8");
const locationTimeMenuSource = await readFile(new URL("LocationTimeMenu.lua", pluginRoot), "utf8");
const statisticsExportWindowModule = `package.preload.ShowStatistics = function()
  ${statisticsWindow}
  return { chooseExport = chooseExport, selectionStatistics = selectionStatistics,
    exportStatistics = exportStatistics, showDashboard = showDashboard,
    exportLifelist = exportLifelist, exportObservationList = exportObservationList,
    exportSpeciesText = exportSpeciesText }
end`;
const maintenanceSource = await readFile(new URL("CatalogMaintenance.lua", pluginRoot), "utf8");
const maintenanceModule = `package.preload.CatalogMaintenance = function()
  ${maintenanceSource.replace(/return CatalogMaintenance\s*$/, "return { scanCatalog = scanCatalog, resolveTaxonomyGroups = resolveTaxonomyGroups, applyUpdate = applyUpdate, completionText = completionText }")}
end`;

function execute(script) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  try {
    const loaded = lauxlib.luaL_loadstring(state, to_luastring(script));
    assert.equal(loaded, lua.LUA_OK, loaded === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
    const status = lua.lua_pcall(state, 0, 0, 0);
    const message = status === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1);
    const line = Number(/\]:(\d+):/.exec(message)?.[1]);
    assert.equal(status, lua.LUA_OK, `${message}\n${script.split("\n")[line - 1] || ""}`);
  } finally { lua.lua_close(state); }
}

// Real Lua modules; fake SDK and in-memory files. This is not a Lightroom SDK/GUI acceptance test.
const fixture = `
_PLUGIN = {}
local inWrite, inRead = false, false
local dateTableResult = false
local activeProps = nil
local diskEntries = { ["D:/Exports"] = "directory" }
local diskFiles = {}
local progressDoneCount, cancelSelectionRead = 0, false
local sdk = {
  LrDate = { timestampToComponents = function(value)
    local year = math.floor(value / 10000)
    local month = math.floor(value / 100) % 100
    local day = value % 100
    if dateTableResult then return { year = year, month = month, day = day } end
    return year, month, day, 12, 0, 0
  end },
  LrPathUtils = { leafName = function(path) return string.match(path, "[^/\\\\]+$") or path end,
    child = function(parent, child) return parent .. "/" .. child end,
    getStandardFilePath = function(which) assert(which == "documents"); return "D:/Exports" end },
  LrFileUtils = { exists = function(path) return diskEntries[path] end,
    chooseUniqueFileName = function(path)
      local unique, suffix = path, 1
      while diskEntries[unique] do suffix = suffix + 1; unique = path .. "." .. tostring(suffix) end
      return unique
    end,
    move = function(source, destination)
      if diskEntries[source] ~= "file" or diskEntries[destination] then return false, "Move failed" end
      diskEntries[destination] = "file"; diskEntries[source] = nil
      diskFiles[destination] = diskFiles[source]; diskFiles[source] = nil
      return true
    end,
    delete = function(path)
      assert(diskEntries[path] == "file", "Only a known owned file may be deleted")
      diskEntries[path] = nil; diskFiles[path] = nil; return true
    end },
  LrTasks = { pcall = pcall, yield = function() assert(not inRead and not inWrite) end,
    startAsyncTask = function() end },
  LrView = { bind = function(value) return value end,
    osFactory = function() return setmetatable({}, { __index = function(_, key)
      if key == "dialog_spacing" or key == "control_spacing" then return function() return 8 end end
      return function(_, options) return options end
    end }) end },
  LrDialogs = { showModalProgressDialog = function(options)
    assert(options.functionContext and options.cannotCancel == false)
    return { setPortionComplete = function() end, setCaption = function() end,
      isCanceled = function() return cancelSelectionRead end,
      done = function() progressDoneCount = progressDoneCount + 1 end }
  end }, LrApplication = {},
  LrBinding = { makePropertyTable = function() activeProps = {}; return activeProps end },
  LrFunctionContext = { callWithContext = function(_, callback) return callback({}) end },
}
function import(name) assert(sdk[name], name); return sdk[name] end
local loadedIndex, savedBuild, deltaWrites, suggestionReads, dataRevision = nil, nil, 0, 0, 0
package.preload.PluginState = function() return {
  selectedPhotos = (function() local PluginState = {}; ${selectionFunction}; return PluginState.selectedPhotos end)(),
  statisticsRevision = function() return dataRevision end,
  statisticsIndex = function(_, total)
    if loadedIndex and loadedIndex.totalPhotos == total then return loadedIndex end
    return nil, "missing"
  end,
  statisticsBuild = function() return savedBuild end,
  saveStatisticsBuild = function(_, value) savedBuild = value end,
  saveStatisticsIndex = function(_, value) loadedIndex = value; savedBuild = nil end,
  applyStatisticsPhotoChanges = function(_, before, after)
    assert(inWrite); deltaWrites = deltaWrites + 1
    dataRevision = dataRevision + 1; savedBuild = nil
    if loadedIndex then assert(require("StatisticsIndex").applyChanges(loadedIndex, before, after)) end
  end,
} end
package.preload.LocationSuggestionReader = function() return { resolve = function()
  suggestionReads = suggestionReads + 1
  error("This fixture must not resolve/export location suggestions")
end } end
${modules}
local Index = require "StatisticsIndex"
local Stats = require "Statistics"
local Location = require "LocationTimeWriter"
local function clone(value)
  if type(value) ~= "table" then return value end
  local copy = {}; for key, item in pairs(value) do copy[key] = clone(item) end; return copy
end
local function same(left, right, path)
  path = path or "result"
  assert(type(left) == type(right), path .. ": different type")
  if type(left) ~= "table" then assert(left == right, path .. ": different value"); return end
  for key, value in pairs(left) do same(value, right[key], path .. "." .. tostring(key)) end
  for key in pairs(right) do assert(left[key] ~= nil, path .. ": extra key " .. tostring(key)) end
end
local function catalogFixture()
  local catalog = { photos = {}, keywords = {}, keywordCalls = {}, allReads = 0, writes = 0, batches = 0 }
  function catalog:getAllPhotos()
    self.allReads = self.allReads + 1
    if self.forbidAllReads then error("Unexpected full catalog scan") end
    local photos = {}; for _, photo in ipairs(self.photos) do table.insert(photos, photo) end
    return photos
  end
  function catalog:getTargetPhoto() return self.selected and self.selected[1] end
  function catalog:getTargetPhotos()
    self.targetReads = (self.targetReads or 0) + 1
    return self.selected and #self.selected > 0 and self.selected or self.photos
  end
  function catalog:withReadAccessDo(callback)
    assert(not inWrite and not inRead); inRead = true
    local ok, result = pcall(callback); inRead = false
    if not ok then error(result) end
  end
  function catalog:batchGetPropertyForPlugin(photos)
    assert(inRead); self.batches = self.batches + 1
    local result = {}; for _, photo in ipairs(photos) do result[photo] = clone(photo.values) end; return result
  end
  function catalog:batchGetRawMetadata(photos)
    assert(inRead)
    local result = {}; for _, photo in ipairs(photos) do
      result[photo] = clone(photo.raw); result[photo].keywords = photo:getRawMetadata("keywords")
    end; return result
  end
  function catalog:createKeyword(name, _, _, parent, returnExisting)
    assert(inWrite and parent == nil and returnExisting == true)
    self.keywordCalls[name] = (self.keywordCalls[name] or 0) + 1
    -- Lightroom's duplicate-in-one-write nil behavior is reproduced intentionally.
    if self.currentKeywordCalls[name] then return nil end
    self.currentKeywordCalls[name] = true
    if self.keywords[name] then return self.keywords[name] end
    if self.caseInsensitiveKeywordLookup then
      for existingName, keyword in pairs(self.keywords) do
        if string.lower(existingName) == string.lower(name) then return keyword end
      end
    end
    local keyword = { name = name }
    local identifier = tostring(self.nextKeywordId or 1)
    -- Native Lightroom can attach a new keyword in this write gate while its
    -- localIdentifier remains unavailable until the gate has committed.
    if self.delayKeywordIdentifiers then keyword.pendingLocalIdentifier = identifier
    else keyword.localIdentifier = identifier end
    self.nextKeywordId = (self.nextKeywordId or 1) + 1
    keyword.pendingName = self.delayKeywordNames == true
    function keyword:getName() if not self.pendingName then return self.name end end
    self.keywords[name] = keyword; return keyword
  end
  function catalog:getKeywordByLocalIdentifier(id)
    for _, keyword in pairs(self.keywords) do if keyword.localIdentifier == id then return keyword end end
  end
  function catalog:withWriteAccessDo(_, callback, options)
    assert(not inWrite and not inRead and options.timeout == 10)
    if self.busy then return "aborted" end
    if self.beforeWriteAccess then self:beforeWriteAccess() end
    local backups = {}; for _, photo in ipairs(self.photos) do
      backups[photo] = { values = clone(photo.values), keywords = clone(photo.keywords) }
    end
    self.metadataVisibilityBeforeWrite = {}
    if self.delayedMetadataVisibility then
      for photo, before in pairs(backups) do self.metadataVisibilityBeforeWrite[photo] = before.values end
    end
    self.keywordVisibilityBeforeWrite = {}
    if self.delayedKeywordVisibility then
      for _, photo in ipairs(self.photos) do
        local visible = {}
        for name, keyword in pairs(photo.keywords) do visible[name] = keyword end
        self.keywordVisibilityBeforeWrite[photo] = visible
      end
    end
    self.currentKeywordCalls = {}; self.writes = self.writes + 1; inWrite = true
    local ok, err = pcall(callback); inWrite = false
    self.keywordVisibilityBeforeWrite = nil
    self.metadataVisibilityBeforeWrite = nil
    if not ok then
      for photo, before in pairs(backups) do photo.values = before.values; photo.keywords = before.keywords end
      error(err)
    end
    for _, keyword in pairs(self.keywords) do
      keyword.pendingName = nil
      if keyword.pendingLocalIdentifier and not self.keepKeywordIdentifiersPending then
        keyword.localIdentifier = keyword.pendingLocalIdentifier
        keyword.pendingLocalIdentifier = nil
      end
    end
    if self.afterWriteCommit then self:afterWriteCommit() end
    return "executed"
  end
  function catalog:photo(values, raw, formatted)
    local photo = { values = clone(values or {}), raw = clone(raw or {}), formatted = clone(formatted or {}),
      keywords = {}, localIdentifier = #self.photos + 1 }
    photo.raw.uuid = photo.raw.uuid or ("uuid-" .. tostring(photo.localIdentifier))
    function photo:getPropertyForPlugin(_, field)
      if inWrite and catalog.delayedMetadataVisibility then
        return (catalog.metadataVisibilityBeforeWrite[self] or {})[field]
      end
      return self.values[field]
    end
    function photo:setPropertyForPlugin(_, field, value)
      assert(inWrite); self.metadataWrites = (self.metadataWrites or 0) + 1; self.values[field] = value
    end
    function photo:getRawMetadata(field)
      if field == "keywords" then
        local keywords = inWrite and catalog.delayedKeywordVisibility
          and catalog.keywordVisibilityBeforeWrite[self] or self.keywords
        local list = {}; for _, keyword in pairs(keywords or {}) do table.insert(list, keyword) end
        return list
      end
      return self.raw[field]
    end
    function photo:getFormattedMetadata(field)
      if field == "keywordTags" then
        local names = {}; for name in pairs(self.keywords) do table.insert(names, name) end
        return table.concat(names, ", ")
      end
      return self.formatted[field] or ""
    end
    function photo:addKeyword(keyword)
      assert(inWrite); self.keywordWrites = (self.keywordWrites or 0) + 1; self.keywords[keyword.name] = keyword
    end
    function photo:removeKeyword(keyword)
      assert(inWrite); self.keywordWrites = (self.keywordWrites or 0) + 1; self.keywords[keyword.name] = nil
    end
    table.insert(self.photos, photo); return photo
  end
  return catalog
end
`;

// The 15 October native MOV run had the correct real November keyword after
// commit but only the already-existing year ID in its internal metadata. Keep
// this SDK boundary explicit: new IDs become readable at write-gate return.
const delayedKeywordIdentifierFixture = `${fixture}
local function delayedIdentifierCatalog()
  local catalog = catalogFixture()
  catalog.delayKeywordIdentifiers = true
  return catalog
end
local function assertStoredKeywordIdentifiers(photo, field, managed)
  local actual, stored, actualCount = {}, {}, 0
  for _, keyword in ipairs(photo:getRawMetadata("keywords")) do
    if managed(keyword) then
      local id = tostring(keyword.localIdentifier or "")
      assert(id ~= "", "Committed real keyword still has no identifier")
      assert(not actual[id], "Duplicate real keyword identifier")
      actual[id] = true; actualCount = actualCount + 1
    end
  end
  assert(actualCount > 0, "This probe must include newly created reserved keywords")
  for id in string.gmatch(photo.values[field] or "", "[^,]+") do
    assert(actual[id] and not stored[id], field .. ": unexpected or duplicate stored identifier")
    stored[id] = true
  end
  for id in pairs(actual) do assert(stored[id], field .. ": missing committed keyword identifier " .. id) end
end
local function assignmentTaxon()
  return { masterTaxonId = "mtx_a0000000000040008000000000000001", germanName = "Rebhuhn",
    englishName = "Grey Partridge", acceptedScientificName = "Perdix perdix", rank = "species",
    lifecycleState = "active", hierarchy = {
      { rank = "class", scientificName = "Aves" }, { rank = "species", scientificName = "Perdix perdix" } } }
end
local function photoWriteSnapshot(photo)
  local keywords = {}
  for _, keyword in ipairs(photo:getRawMetadata("keywords")) do
    local name = keyword:getName()
    keywords[tostring(keyword.localIdentifier or "") .. "|" .. name] = name
  end
  return { values = clone(photo.values), keywords = keywords, uuid = photo:getRawMetadata("uuid"),
    metadataWrites = photo.metadataWrites or 0, keywordWrites = photo.keywordWrites or 0, revision = dataRevision }
end
local function assertPhotoUnchanged(photo, before)
  same(photoWriteSnapshot(photo), before)
end
local function mutateAfterCommit(photo, mutation)
  if mutation == "uuid" then photo.raw.uuid = "uuid-replaced-after-commit"
  elseif mutation == "fn-field" then photo.values.fnCaptureMonth = "Dezember"
  elseif mutation == "real-keyword" then photo.keywords["November (FN Zeit)"] = nil
  else error("Unknown post-commit mutation") end
end
`;

// Run the real JPEG/XMP reader against owned in-memory SDK renditions.
const suggestionReaderFixture = `${fixture}
local exportCases, exportStarts, exportPhotoCount, exportReleases = {}, 0, 0, 0
sdk.LrProgressScope = function()
  return { setCancelable = function() end, isCanceled = function() return false end, done = function() end }
end
sdk.LrTasks.sleep = function(value) assert(value == 0.1 and not inWrite and not inRead) end
sdk.LrFileUtils.readFile = function(path)
  local scenario = assert(exportCases[path])
  if scenario.readError then error(scenario.readError) end
  return scenario.data or string.char(255, 216, 255, 217)
end
sdk.LrExportSession = function(options)
  assert(options.exportSettings.LR_reimportExportedPhoto == false)
  assert(options.exportSettings.LR_removeLocationMetadata == false)
  exportPhotoCount = exportPhotoCount + #options.photosToExport
  return {
    doExportOnNewTask = function() assert(not inWrite and not inRead); exportStarts = exportStarts + 1 end,
    renditions = function(_, settings)
      assert(settings.stopIfCanceled == false and exportStarts > 0)
      local index = 0
      return function()
        index = index + 1
        local photo = options.photosToExport[index]
        if not photo then return nil end
        local path = "D:/Owned-preview/" .. tostring(photo.localIdentifier) .. ".jpg"
        local scenario = assert(exportCases[photo])
        exportCases[path] = scenario
        return index, { photo = photo, waitForRender = function()
          if scenario.renderError then return false, scenario.renderError end
          return true, path
        end }
      end
    end,
  }
end
package.preload.TempSession = function() return { begin = function()
  return { root = "D:/Owned-preview", register = function(_, path) assert(exportCases[path]) end,
    release = function() exportReleases = exportReleases + 1 end }
end } end
package.preload.LocationSuggestionReader = function() ${suggestionReaderSource} end
package.loaded.LocationSuggestionReader = nil
package.loaded.LocationTimeWriter = nil
Location = require "LocationTimeWriter"
`;

// These are explicit synthetic clock values, not Fengari's host-dependent date formatting.
// Keep every result field in equality checks while controlling independent build timestamps.
const controlledStatisticsClock = `
local clockPosition = 1
local clockValues = {
  { ["%d.%m.%Y, %H:%M"] = "18.10.2026, 08:59", ["!%Y-%m-%dT%H:%M:%SZ"] = "2026-10-18T08:59:59Z" },
  { ["%d.%m.%Y, %H:%M"] = "18.10.2026, 09:00", ["!%Y-%m-%dT%H:%M:%SZ"] = "2026-10-18T09:00:00Z" },
}
os.date = function(format, timestamp)
  assert(timestamp == nil, "Unexpected explicit timestamp in controlled statistics fixture")
  local value = clockValues[clockPosition][format]
  assert(value, "Unexpected date format in controlled statistics fixture: " .. tostring(format))
  return value
end
local function advanceStatisticsClock()
  assert(clockPosition == 1, "Only one explicit minute transition is prepared")
  clockPosition = 2
end
`;

// Actual persistent state and JSON, with SDK storage gates backed by a catalog fixture.
const persistentFixture = `${fixture}
sdk.LrPrefs = { prefsForPlugin = function() return {} end }
package.preload.Json = function() ${jsonSource} end
package.preload.PluginState = function() ${persistentStateSource} end
package.loaded.PluginState = nil; package.loaded.Statistics = nil
local State = require "PluginState"
Stats = require "Statistics"
package.loaded.LocationTimeWriter = nil
Location = require "LocationTimeWriter"
local function persistentCatalog()
  local catalog = catalogFixture(); catalog.pluginValues = {}
  function catalog:getPath() return "D:/Katalog/Test.lrcat" end
  function catalog:getPropertyForPlugin(_, field) return self.pluginValues[field] end
  function catalog:setPropertyForPlugin(_, field, value)
    assert(inWrite); self.pluginValues[field] = value
  end
  function catalog:withPrivateWriteAccessDo(callback, options)
    assert(not inWrite and not inRead and options.timeout == 10)
    if self.privateBusy then return "aborted" end
    if self.beforePrivateWrite then self.beforePrivateWrite() end
    local before = clone(self.pluginValues); inWrite = true
    local ok, err = pcall(callback); inWrite = false
    if not ok then self.pluginValues = before; error(err) end
    return "executed"
  end
  return catalog
end
`;

// An already running FN task can finish while an SDK modal dialog yields.
// Use the real writer and persisted JSON index to separate fresh index state
// from a previously materialized dashboard/export result.
const statisticsFreshnessFixture = `${persistentFixture}
${statisticsExportWindowModule}
local view = require "ShowStatistics"
local Writer = require "KeywordWriter"
local catalog = persistentCatalog()
local existing = catalog:photo({ masterTaxonId = "mtx_rebhuhn", germanName = "Rebhuhn",
  scientificName = "Perdix perdix", taxonomyClass = "Aves" },
  { dateTimeOriginal = 20260312, isVideo = false })
local whale = catalog:photo({}, { dateTimeOriginal = 20260412, isVideo = false })
local whaleTaxon = { masterTaxonId = "mtx_buckelwal", germanName = "Buckelwal",
  acceptedScientificName = "Megaptera novaeangliae", rank = "species", hierarchy = {
    { rank = "class", scientificName = "Mammalia" },
    { rank = "species", scientificName = "Megaptera novaeangliae" } } }
assert(Stats.build(catalog, { restart = true }).statistics.speciesCount == 1)
local previousStatistics = select(1, Stats.load(catalog))
local function assignWhale()
  local result = Writer.assign(catalog, { whale }, whaleTaxon, Location.prepare(catalog, { whale }))
  assert(result.photoCount == 1 and whale.values.masterTaxonId == "mtx_buckelwal")
  local fresh = Stats.load(catalog)
  assert(fresh.speciesCount == 2 and fresh.assignedPhotos == 2)
end
local function hasTitle(node, wanted)
  if type(node) ~= "table" then return false end
  if node.title == wanted then return true end
  for _, child in pairs(node) do
    if type(child) == "table" and hasTitle(child, wanted) then return true end
  end
  return false
end
`;

test("Lua-Statistikfrische lädt nach Exportabbruch eine während der Dialogwahl abgeschlossene Zuweisung", () => {
  execute(`${statisticsFreshnessFixture}
    local displays = 0
    sdk.LrDialogs.presentModalDialog = function(options)
      if options.title == "Statistik exportieren" then
        assignWhale()
        return "cancel"
      end
      assert(options.title == "FN Wildlife – Taxonomie-Statistik")
      displays = displays + 1
      if displays == 1 then
        assert(hasTitle(options.contents, "Lifelist: 1 Art"))
        return "ok"
      end
      assert(hasTitle(options.contents, "Lifelist: 2 Arten"),
        "The reopened dashboard must show the committed FN delta")
      return "cancel"
    end
    view.showDashboard(catalog, previousStatistics)
    assert(displays == 2 and catalog.batches == 1 and catalog.writes == 1)
  `);
});

for (const [format, fileName] of [["lifelist", "Lifelist.csv"], ["species-text", "Artenliste.txt"]]) {
  test(`Lua-Statistikfrische exportiert ${fileName} aus dem nach der Katalogauswahl aktuellen Index`, () => {
    execute(`${statisticsFreshnessFixture}
      local data, success, dialogs = "", false, 0
      sdk.LrDialogs.presentModalDialog = function(options)
        dialogs = dialogs + 1
        if options.title == "Statistik exportieren" then
          activeProps.exportType = "${format}"; activeProps.exportScope = "catalog"
          assignWhale()
        else
          assert(options.actionVerb == "Speichern" and activeProps.fileName == "${fileName}")
        end
        return "ok"
      end
      sdk.LrDialogs.message = function(_, _, style) assert(style == "info"); success = true end
      io.open = function(path, mode)
        assert(path == "D:/Exports/${fileName}.fn-export.tmp" and mode == "wb")
        diskEntries[path] = "file"
        return { write = function(self, ...)
          for _, value in ipairs({...}) do data = data .. value end; return self
        end, close = function() return true end }
      end
      view.exportStatistics(catalog, previousStatistics)
      assert(success and dialogs == 2 and catalog.targetReads == nil and progressDoneCount == 0)
      assert(string.find(data, "Buckelwal", 1, true) and string.find(data, "Rebhuhn", 1, true),
        "A catalog export must include the FN assignment committed during export choice")
      if "${format}" == "species-text" then assert(string.find(data, "Gesamt: 2 Arten", 1, true)) end
      assert(catalog.batches == 1 and catalog.writes == 1)
    `);
  });
}

test("Lua-Statistikfrische exportiert nach Indexverlust während Katalogwahl keinen alten Snapshot", () => {
  execute(`${statisticsFreshnessFixture}
    local warnings, fileDialogs = {}, 0
    sdk.LrDialogs.presentModalDialog = function(options)
      if options.title == "Statistik exportieren" then
        activeProps.exportScope = "catalog"
        catalog.pluginValues.statisticsIndexV1 = nil
        return "ok"
      end
      fileDialogs = fileDialogs + 1
      return "cancel"
    end
    sdk.LrDialogs.message = function(title, message, style)
      table.insert(warnings, { title = title, message = message, style = style })
    end
    io.open = function() error("An invalid catalog index must not create an export file") end
    view.exportStatistics(catalog, previousStatistics)
    assert(fileDialogs == 0 and #warnings == 1,
      "Missing current index must be explained before choosing an export destination")
    assert(string.find(warnings[1].title .. warnings[1].message, "Statistik", 1, true))
    assert(catalog.targetReads == nil and catalog.batches == 1 and catalog.writes == 0)
  `);
});

test("Lua-Statistikfrische hält die bestätigte Auswahl trotz Indexverlust und späterem Auswahlwechsel gebunden", () => {
  execute(`${statisticsFreshnessFixture}
    catalog.allReads = 0; catalog.forbidAllReads = true
    catalog.selected = { whale }
    local data, success, dialogs = "", false, 0
    sdk.LrDialogs.presentModalDialog = function(options)
      dialogs = dialogs + 1
      if options.title == "Statistik exportieren" then
        activeProps.exportType = "species-text"; activeProps.exportScope = "selection"
        catalog.pluginValues.statisticsIndexV1 = nil
        catalog.selected = { existing }
      else
        assert(options.actionVerb == "Speichern")
        assert(string.find(options.contents[1].title, "Markierte Fotos: 1 Foto", 1, true))
        catalog.selected = { whale }
      end
      return "ok"
    end
    sdk.LrTasks.yield = function()
      assert(not inRead and not inWrite)
      catalog.selected = { whale }
    end
    sdk.LrDialogs.message = function(_, text, style)
      assert(style == "info" and string.find(text, "Markierte Fotos: 1 Foto", 1, true))
      success = true
    end
    io.open = function(path, mode)
      assert(path == "D:/Exports/Artenliste.txt.fn-export.tmp" and mode == "wb")
      diskEntries[path] = "file"
      return { write = function(self, ...)
        for _, value in ipairs({...}) do data = data .. value end; return self
      end, close = function() return true end }
    end
    view.exportStatistics(catalog, previousStatistics)
    assert(success and dialogs == 2 and catalog.targetReads == 1 and progressDoneCount == 1)
    assert(string.find(data, "* Rebhuhn", 1, true) and not string.find(data, "Buckelwal", 1, true))
    assert(catalog.allReads == 0 and catalog.batches == 2 and catalog.writes == 0)
  `);
});

test("Lua-Statistik trennt Screenshot-Mengen, Rangvielfalt und Art-Favoriten von taxonomiefreiem Ort/Zeit", () => {
  execute(`${fixture}
    local index = Index.new(129555)
    for position = 1, 4787 do
      local species = (position - 1) % 46 + 1
      local values = { masterTaxonId = "mtx_" .. tostring(species), germanName = "Art " .. tostring(species),
        taxonomyDomain = "Eukaryota", taxonomyKingdom = "Animalia", taxonomyPhylum = "Stamm " .. tostring(species % 2),
        taxonomyClass = species <= 40 and "Aves" or species <= 44 and "Mammalia" or species == 45 and "Insecta" or "Reptilia",
        taxonomyOrder = "Ordnung " .. tostring(species % 9), taxonomyFamily = "Familie " .. tostring(species % 33),
        taxonomyGenus = "Gattung " .. tostring(species % 44), photoUuid = "uuid-" .. tostring(position),
        referenceImage = (position == 1 or position == 47) and "yes" or "no" }
      if position <= 4775 then values.fnCaptureYear = "2026"; values.fnCaptureMonth = "März" end
      if position <= 1248 or position == 4776 or position == 4777 then
        values.fnCountry = position <= 1178 and "Deutschland" or "Land " .. tostring(position % 3)
        values.fnStateProvince = "Region " .. tostring(position % 11)
        values.fnCity = "Stadt " .. tostring(position % 38)
        values.fnLocation = "Ort " .. tostring(position % 35)
      end
      Index.add(index, Index.snapshot(values))
    end
    local result = Index.result(index)
    assert(result.totalPhotos == 129555 and result.assignedPhotos == 4787 and result.unassignedPhotos == 124768)
    assert(result.speciesCount == 46 and result.genusCount == 44 and result.familyCount == 33)
    assert(result.domainCount == 1 and result.kingdomCount == 1 and result.phylumCount == 2)
    assert(result.rankClassCount == 4 and result.orderCount == 9)
    assert(result.referenceImageCount == 2 and result.speciesWithoutReference == 45 and result.speciesWithMultipleReferences == 1)
    local quality = result.taxonomyDataQuality
    assert(quality.timePhotoCount == 4775 and quality.locationPhotoCount == 1250)
    assert(quality.bothPhotoCount == 1248 and quality.onlyTimePhotoCount == 3527)
    assert(quality.onlyLocationPhotoCount == 2 and quality.neitherPhotoCount == 10)
    assert(result.taxonomyLocationTime.photoCount == 4777)
    assert(result.locationTime.countryCount == 4 and result.locationTime.stateCount == 11)
    assert(result.locationTime.cityCount == 38 and result.locationTime.locationCount == 35)
    assert(#result.topSpecies == 5 and #result.locationTime.topCities == 5)
    Index.add(index, Index.snapshot({ fnCountry = "USA", fnCaptureYear = "2020", fnCaptureMonth = "Januar" }))
    local after = Index.result(index)
    same(after.taxonomyDataQuality, quality)
    assert(after.assignedPhotos == 4787 and after.speciesCount == 46)
    assert(after.locationTime.photoCount == 4778 and after.locationTime.countryCount == 5)
  `);
});

test("Lua-Statistik-Deltas entsprechen Vollaufbau bei Zuweisung, Rücknahme, Ort/Zeit und Favoritenwechsel", () => {
  execute(`${fixture}
    local snapshots = {
      Index.snapshot({ masterTaxonId = "mtx_a", germanName = "Weissstorch", taxonomyClass = "Aves", taxonomyGenus = "Ciconia",
        fnCountry = "Deutschland", fnCaptureYear = "2026", fnCaptureMonth = "Januar", dateTimeOriginal = 20260112, photoUuid = "a", referenceImage = "yes" }),
      Index.snapshot({ masterTaxonId = "mtx_a", germanName = "Weissstorch", taxonomyClass = "Aves", taxonomyGenus = "Ciconia",
        fnCountry = "Deutschland", fnCaptureYear = "2026", fnCaptureMonth = "Januar", dateTimeOriginal = 20260112, photoUuid = "b" }),
      Index.snapshot({ masterTaxonId = "mtx_b", germanName = "Rebhuhn", taxonomyClass = "Aves", taxonomyGenus = "Perdix", photoUuid = "c" }),
    }
    local index = Index.new(4)
    for _, snapshot in ipairs(snapshots) do Index.add(index, snapshot) end
    local initial = Index.result(index)
    assert(#initial.observationRows == 2 and initial.observationRows[1].photoCount == 2)
    local before = clone(snapshots)
    snapshots[1] = Stats.emptySnapshot(snapshots[1])
    snapshots[2] = Stats.referenceSnapshot(snapshots[2], true)
    snapshots[3] = Stats.locationTimeSnapshot(snapshots[3], { fnCountry = "Österreich", fnCaptureYear = "2026", fnCaptureMonth = "Februar" })
    assert(Index.applyChanges(index, before, snapshots))
    local rebuilt = Index.new(4)
    for _, snapshot in ipairs(snapshots) do Index.add(rebuilt, snapshot) end
    same(Index.result(index), Index.result(rebuilt))
    local after = Index.result(index)
    assert(after.assignedPhotos == 2 and after.referenceImageCount == 1 and after.speciesWithoutReference == 1)
    assert(after.locationTime.photoCount == 3 and after.taxonomyLocationTime.photoCount == 2)
    assert(after.taxonomyDataQuality.bothPhotoCount == 2)
    assert(#after.observationRows == 2)
  `);
});

test("Lua-Statistik pausiert nach Leseblock und setzt ohne doppelte Fotos oder Export-Vollscan fort", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    assert(Index.captureDate(20260203) == "2026-02-03", "numeric date: " .. Index.captureDate(20260203))
    assert(Index.captureDate("2026-02-03") == "2026-02-03", "text date: " .. Index.captureDate("2026-02-03"))
    for position = 1, 1001 do catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn",
      fnCaptureYear = "2026", fnCaptureMonth = "Februar" },
      { dateTimeOriginal = 20260203, path = "D:/Fotos/Test.jpg" }) end
    local paused = Stats.build(catalog, { progress = function(processed)
      assert(not inRead); if processed == 500 then return "pause" end
    end })
    assert(paused.status == "paused" and paused.processedPhotos == 500 and loadedIndex == nil)
    assert(savedBuild.processedPhotos == 500 and savedBuild.lastPhotoId == 500)
    local completed = Stats.build(catalog)
    assert(completed.status == "complete" and completed.statistics.assignedPhotos == 1001)
    assert(catalog.batches == 3 and savedBuild == nil)
    assert(#completed.statistics.observationRows == 1 and completed.statistics.observationRows[1].photoCount == 1001)
    assert(completed.statistics.observationRows[1].captureDate == "2026-02-03", tostring(completed.statistics.observationRows[1].captureDate))
    assert(catalog.writes == 0)
    catalog.forbidAllReads = true
    same(Index.result(loadedIndex), completed.statistics)
  `);
});

for (const missing of ["metadata-map", "metadata-photo", "raw-map", "raw-photo", "callback"]) {
  test(`Lua-Vollstatistik bewahrt den bisherigen Index bei unvollständigem SDK-Lesen: ${missing}`, () => {
    execute(`${persistentFixture}
      local catalog = persistentCatalog()
      catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" })
      assert(Stats.build(catalog).statistics.assignedPhotos == 1)
      local before = catalog.pluginValues.statisticsIndexV1
      local metadata, raw, read = catalog.batchGetPropertyForPlugin, catalog.batchGetRawMetadata, catalog.withReadAccessDo
      local missing = "${missing}"
      catalog.batchGetPropertyForPlugin = function(self, photos)
        if missing == "metadata-map" then return false end
        if missing == "metadata-photo" then return {} end
        return metadata(self, photos)
      end
      catalog.batchGetRawMetadata = function(self, photos)
        if missing == "raw-map" then return nil end
        if missing == "raw-photo" then return {} end
        return raw(self, photos)
      end
      catalog.withReadAccessDo = function(self, callback)
        if missing ~= "callback" then read(self, callback) end
      end
      local ok, message = pcall(function() Stats.build(catalog, { restart = true }) end)
      assert(not ok and string.find(message, "nicht vollständig", 1, true), tostring(message))
      assert(catalog.pluginValues.statisticsIndexV1 == before and not inRead and not inWrite)
      catalog.batchGetPropertyForPlugin, catalog.batchGetRawMetadata, catalog.withReadAccessDo = metadata, raw, read
      assert(Stats.build(catalog, { restart = true }).statistics.assignedPhotos == 1)
      catalog.photos[1].values = {}
      assert(Stats.build(catalog, { restart = true }).statistics.unassignedPhotos == 1,
        "A genuinely empty per-photo metadata table is a valid unassigned photo")
    `);
  });
}

test("Lua-Statistikcheckpoint überlebt Neuladen und wiederholte Pause ohne doppelte Fotos", () => {
  execute(`${persistentFixture}
    local catalog = persistentCatalog()
    for position = 1, 501 do catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" }) end
    assert(Stats.build(catalog, { progress = function(n) if n == 500 then return "pause" end end }).status == "paused")
    local saved = State.statisticsBuild(catalog, 501)
    assert(saved.processedPhotos == 500 and saved.dataRevision == 0)
    package.loaded.PluginState = nil; package.loaded.Statistics = nil
    State = require "PluginState"; Stats = require "Statistics"
    assert(Stats.build(catalog, { progress = function() return "cancel" end }).status == "paused")
    assert(State.statisticsBuild(catalog, 501).processedPhotos == 501)
    local result = Stats.build(catalog)
    assert(result.status == "complete" and result.statistics.assignedPhotos == 501)
    assert(State.statisticsBuild(catalog, 501) == nil)
    assert(State.statisticsIndex(catalog, 501).assignedPhotos == 501)
  `);
});

test("Lua-Statistik zählt getrennte Foto-UUIDs trotz gleichem Originalpfad und bindet Katalogkopien lokal", () => {
  execute(`${persistentFixture}
    local catalog = persistentCatalog()
    catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn", referenceImage = "yes" },
      { uuid = "master-photo", path = "D:/Fotos/Rebhuhn.jpg" })
    catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn", referenceImage = "yes" },
      { uuid = "virtual-copy", path = "D:/Fotos/Rebhuhn.jpg", isVirtualCopy = true })
    local result = Stats.build(catalog).statistics
    assert(result.totalPhotos == 2 and result.assignedPhotos == 2 and result.speciesCount == 1)
    assert(result.referenceImageCount == 2 and result.speciesWithMultipleReferences == 1)
    assert(#result.observationRows == 1 and result.observationRows[1].photoCount == 2)
    assert(#State.referenceImageUuids(catalog, "mtx_a") == 2)
    local copied = persistentCatalog(); copied.pluginValues = clone(catalog.pluginValues)
    copied.getPath = function() return "D:/Katalog/Kopie.lrcat" end
    assert(State.statisticsIndex(copied, 2).assignedPhotos == 2)
    assert(State.statisticsIndex(copied, 3) == nil)
    assert(State.statisticsRevision(copied) == 0 and State.statisticsRevision(catalog) == 0)
    copied:withPrivateWriteAccessDo(function() State.applyStatisticsPhotoChanges(copied, {}, {}) end, { timeout = 10 })
    assert(State.statisticsRevision(copied) == 1 and State.statisticsRevision(catalog) == 0)
  `);
});

test("Lua-FN-Änderung nach Pause verwirft den veralteten Aufbau und aktualisiert den fertigen Index", () => {
  execute(`${persistentFixture}
    ${controlledStatisticsClock}
    local catalog = persistentCatalog()
    for position = 1, 501 do catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn", fnCountry = "Deutschland" }) end
    assert(Stats.build(catalog).statistics.generatedAt == "18.10.2026, 08:59")
    assert(Stats.build(catalog, { restart = true, progress = function(n) if n == 500 then return "pause" end end }).status == "paused")
    assert(State.statisticsBuild(catalog, 501).savedAt == "2026-10-18T08:59:59Z")
    advanceStatisticsClock()
    Location.execute(catalog, { catalog.photos[1] }, "remove")
    assert(State.statisticsRevision(catalog) == 1 and State.statisticsBuild(catalog, 501) == nil)
    local changed = Index.result(State.statisticsIndex(catalog, 501))
    assert(changed.taxonomyDataQuality.locationPhotoCount == 500 and changed.generatedAt == "18.10.2026, 09:00")
    package.loaded.PluginState = nil; package.loaded.Statistics = nil
    State = require "PluginState"; Stats = require "Statistics"
    local resumed = Stats.build(catalog)
    assert(resumed.statistics.taxonomyDataQuality.locationPhotoCount == 500 and resumed.statistics.generatedAt == "18.10.2026, 09:00")
    same(resumed.statistics, Stats.build(catalog, { restart = true }).statistics)
  `);
});

test("Lua-Statistik behält beim expliziten Minutenwechsel sämtliche Fachwerte und speichert den neuen Zeitpunkt", () => {
  execute(`${persistentFixture}
    ${controlledStatisticsClock}
    local catalog = persistentCatalog()
    catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn", fnCountry = "Deutschland" })
    local before = Stats.build(catalog).statistics
    assert(before.generatedAt == "18.10.2026, 08:59")
    advanceStatisticsClock()
    local rebuilt = Stats.build(catalog, { restart = true }).statistics
    assert(rebuilt.generatedAt == "18.10.2026, 09:00" and before.generatedAt == "18.10.2026, 08:59")
    local expected = clone(before)
    expected.generatedAt = "18.10.2026, 09:00"
    same(rebuilt, expected)
    same(Index.result(State.statisticsIndex(catalog, 1)), expected)
    assert(State.statisticsRevision(catalog) == 0 and State.statisticsBuild(catalog, 1) == nil)
  `);
});

for (const stage of ["progress", "private-write"]) {
  test(`Lua-Aktiver Statistikaufbau veröffentlicht keine alten Werte nach FN-Änderung: ${stage}`, () => {
    execute(`${persistentFixture}
      local catalog = persistentCatalog()
      local photo = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn", fnCountry = "Deutschland" })
      Stats.build(catalog)
      local changed = false
      local function changePhoto()
        if not changed then changed = true; Location.execute(catalog, { photo }, "remove") end
      end
      if "${stage}" == "private-write" then catalog.beforePrivateWrite = changePhoto end
      local ok, message = pcall(function() Stats.build(catalog, { restart = true,
        progress = function() if "${stage}" == "progress" then changePhoto() end end }) end)
      assert(not ok and string.find(message, "FN-Daten wurden", 1, true), tostring(message))
      assert(State.statisticsBuild(catalog, 1) == nil and not inRead and not inWrite)
      assert(Index.result(State.statisticsIndex(catalog, 1)).taxonomyDataQuality.locationPhotoCount == 0)
      catalog.beforePrivateWrite = nil
      assert(Stats.build(catalog).statistics.taxonomyDataQuality.locationPhotoCount == 0)
    `);
  });
}

test("Lua-Statistik-Speichersperre erhält alten Index und erlaubt vollständige Wiederholung", () => {
  execute(`${persistentFixture}
    local catalog = persistentCatalog(); catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" })
    Stats.build(catalog); local before = catalog.pluginValues.statisticsIndexV1
    catalog.privateBusy = true
    local ok, message = pcall(function() Stats.build(catalog, { restart = true }) end)
    assert(not ok and string.find(message, "nicht innerhalb", 1, true))
    assert(catalog.pluginValues.statisticsIndexV1 == before and not inWrite)
    catalog.privateBusy = false
    assert(Stats.build(catalog).statistics.assignedPhotos == 1)
  `);
});

test("Lua-CSV-Exporte neutralisieren Formeln und behalten Unicode, Zeilenumbrüche und Quotes", () => {
  execute(`${fixture}
    package.preload.ShowStatistics = function()
      ${statisticsWindow}
      return { csvField = csvField, exportLifelist = exportLifelist, exportObservationList = exportObservationList }
    end
    local view = require "ShowStatistics"
    for _, value in ipairs({ "=1+1", "+1+1", "-1+1", "@SUM(1)", "  =1+1",
      string.char(9) .. "=1+1", string.char(13) .. "=1+1", string.char(10) .. "@SUM(1)" }) do
      assert(view.csvField(value) == string.char(34) .. "'" .. value .. string.char(34))
    end
    assert(view.csvField('Ärt; "Test"') == '"Ärt; ""Test"""')
    assert(view.csvField("Ciconia ciconia") == '"Ciconia ciconia"')
    assert(view.csvField("2026") == '"2026"' and view.csvField("") == '""')
    local index = Index.new(1)
    Index.add(index, Index.snapshot({ masterTaxonId = "mtx_a", germanName = "=1+1", englishName = "+1+1",
      scientificName = "@SUM(1)", fnCountry = "-1+1", fnCity = "=1+1", fnLocation = "+1+1", path = "D:/Fotos/=1+1.jpg" }))
    local captured = {}
    local Export = require "ExportFile"
    Export.choosePath = function(_, _, filename) return filename end
    Export.write = function(filename, _, writer)
      local text = ""; writer({ write = function(_, ...) for _, item in ipairs({ ... }) do text = text .. item end end })
      captured[filename] = text
    end
    sdk.LrDialogs.message = function() end
    view.exportLifelist(Index.result(index)); view.exportObservationList(Index.result(index))
    assert(string.find(captured["Lifelist.csv"], string.char(34) .. "'=1+1" .. string.char(34), 1, true))
    assert(string.find(captured["Beobachtungsliste.csv"], string.char(34) .. "'-1+1" .. string.char(34), 1, true))
    assert(string.find(captured["Beobachtungsliste.csv"], string.char(34) .. "'=1+1.jpg" .. string.char(34), 1, true))
  `);
});

test("Lua-Ort/Zeit verarbeitet Januar/Februar ohne GPS mit einmaliger Keywordanlage und bleibt wiederholbar", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local january = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" }, { dateTimeOriginal = 20260112 })
    local february = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" }, { dateTimeOriginal = 20260212 })
    local anotherJanuary = catalog:photo({}, {}, { dateTimeOriginal = "12. Januar 2026 11:00:00" })
    local user = { name = "Urlaub", localIdentifier = "user", getName = function(self) return self.name end }
    january.keywords.Urlaub = user
    loadedIndex = Index.new(3)
    for _, photo in ipairs(catalog.photos) do Index.add(loadedIndex, Stats.photoSnapshot(photo)) end
    local plans, preparation = Location.prepare(catalog, catalog.photos, { resolveSuggestedLocations = true })
    assert(preparation.suggestedLocationPhotoCount == 0 and suggestionReads == 0)
    assert(plans[1].values.fnCaptureMonth == "Januar" and plans[2].values.fnCaptureMonth == "Februar")
    dateTableResult = true
    local tablePlans = Location.prepare(catalog, catalog.photos)
    same(tablePlans[1].values, plans[1].values); same(tablePlans[2].values, plans[2].values)
    local result = Location.execute(catalog, catalog.photos, "add", {}, plans)
    assert(result.changedPhotoCount == 3 and result.missingDataPhotoCount == 0 and result.missingTimePhotoCount == 0)
    assert(result.missingGpsAndLocationPhotoCount == 3 and result.afterValues == nil)
    assert(catalog.keywordCalls["Januar (FN Zeit)"] == 1 and catalog.keywordCalls["2026 (FN Zeit)"] == 1)
    assert(catalog.keywordCalls["Februar (FN Zeit)"] == 1 and january.keywords.Urlaub == user)
    assert(january.values.masterTaxonId == "mtx_a" and january.values.fnCountry == "")
    local repeated = Location.execute(catalog, catalog.photos, "add", {}, plans)
    assert(repeated.skippedPhotoCount == 3 and repeated.changedPhotoCount == 0)
    assert(catalog.keywordCalls["Januar (FN Zeit)"] == 1 and catalog.keywordCalls["2026 (FN Zeit)"] == 1)
    local rebuilt = Index.new(3)
    for _, photo in ipairs(catalog.photos) do Index.add(rebuilt, Stats.photoSnapshot(photo)) end
    same(Index.result(loadedIndex), Index.result(rebuilt))
    local quality = Index.result(loadedIndex).taxonomyDataQuality
    assert(quality.timePhotoCount == 2 and quality.locationPhotoCount == 0 and quality.onlyTimePhotoCount == 2)
    assert(catalog.allReads == 0)
  `);
});

test("Lua-Videozeit ergänzt sechs MOV-Aufnahmezeiten neben Fotos und hält die Wiederholung schreibfrei", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local videos = {}
    for position = 1, 6 do
      local video = catalog:photo({ masterTaxonId = "mtx_bart", germanName = "Bartmeise" },
        { fileFormat = "VIDEO", isVideo = true, dateTime = position <= 3 and 20251123 or "2025-11-23T10:13:31" })
      local user = { name = "Eigene Auswahl", localIdentifier = "user-" .. position,
        getName = function(self) return self.name end }
      video.keywords[user.name] = user
      table.insert(videos, video)
    end
    local photo = catalog:photo({ masterTaxonId = "mtx_bach", fnCountry = "Deutschland" },
      { dateTimeOriginal = 20250324, dateTime = 20250412 })
    local first = Location.execute(catalog, catalog.photos, "update")
    assert(first.changedPhotoCount == 7 and first.missingTimePhotoCount == 0,
      "Changed=" .. first.changedPhotoCount .. ", missingTime=" .. first.missingTimePhotoCount)
    for _, video in ipairs(videos) do
      assert(video.values.fnCaptureMonth == "November" and video.values.fnCaptureYear == "2025")
      assert(video.keywords["November (FN Zeit)"] and video.keywords["2025 (FN Zeit)"])
      assert(video.keywords["Eigene Auswahl"] and video.values.masterTaxonId == "mtx_bart")
    end
    assert(photo.values.fnCaptureMonth == "März" and photo.values.fnCountry == "Deutschland")
    local writes, keywordWrites = {}, {}
    for _, item in ipairs(catalog.photos) do
      writes[item] = item.metadataWrites; keywordWrites[item] = item.keywordWrites
    end
    local repeated = Location.execute(catalog, catalog.photos, "update")
    assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 7)
    for _, item in ipairs(catalog.photos) do
      assert(item.metadataWrites == writes[item] and item.keywordWrites == keywordWrites[item])
    end
    assert(suggestionReads == 0 and catalog.allReads == 0)
  `);
});

test("Lua-Videozeit erhält gültige Originalzeit vor angepasster Zeit und verwendet dokumentierte Roh-/Anzeigeformen", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local original = catalog:photo({}, { dateTimeOriginal = 20250324, dateTime = 20251123 })
    local formattedOriginal = catalog:photo({}, { dateTime = 20251123 },
      { dateTimeOriginal = "24. März 2025 10:04:18" })
    local numericString = catalog:photo({}, { dateTime = "20251123" })
    local formattedAdjusted = catalog:photo({}, {}, { dateTime = "23. November 2025 10:12:43" })
    local isoAdjusted = catalog:photo({}, { dateTime = "2025-11-23T10:12:18" })
    for _, item in ipairs({ original, formattedOriginal }) do
      local getter = item.getRawMetadata
      function item:getRawMetadata(field)
        assert(field ~= "dateTime", "Valid original time must not consult a conflicting fallback")
        return getter(self, field)
      end
    end
    local plans = Location.prepare(catalog, catalog.photos)
    assert(plans[1].values.fnCaptureMonth == "März" and plans[2].values.fnCaptureMonth == "März")
    for position = 3, 5 do
      assert(plans[position].values.fnCaptureMonth == "November" and plans[position].values.fnCaptureYear == "2025",
        "Missing adjusted date in plan " .. position)
    end
    dateTableResult = true
    local tablePlans = Location.prepare(catalog, { numericString })
    assert(tablePlans[1].values.fnCaptureMonth == "November" and tablePlans[1].values.fnCaptureYear == "2025")
    assert(catalog.writes == 0)
  `);
});

test("Lua-Videozeit übergibt Cocoa-Sekunden unverändert an die SDK-Datumsumwandlung", () => {
  const timestamp = (Date.parse("2025-11-23T10:09:37Z") - Date.parse("2001-01-01T00:00:00Z")) / 1000;
  execute(`${fixture}
    local catalog = catalogFixture()
    local item = catalog:photo({}, { fileFormat = "VIDEO", dateTime = ${timestamp} })
    local conversions = 0
    sdk.LrDate.timestampToComponents = function(value)
      assert(value == ${timestamp}, "Capture timestamp must not be treated as Unix time or changed")
      conversions = conversions + 1
      return 2025, 11, 23, 10, 9, 37
    end
    local plans = Location.prepare(catalog, { item })
    assert(conversions == 1 and plans[1].values.fnCaptureMonth == "November" and plans[1].values.fnCaptureYear == "2025")
    sdk.LrDate.timestampToComponents = function(value)
      assert(value == ${timestamp}); return { year = 2025, month = 11, day = 23 }
    end
    local tablePlans = Location.prepare(catalog, { item })
    same(tablePlans[1].values, plans[1].values)
    assert(catalog.writes == 0)
  `);
});

test("Lua-Fotozeit erfindet keine Aufnahmezeit aus Digitalisierung, Dateinamen oder ungültigen Ersatzwerten", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    for _, invalid in ipairs({ 0, -1, math.huge, 0/0, "kein Datum", "2025-13-23", "0000-11-23" }) do
      local item = catalog:photo({ fnCaptureYear = "2024", fnCaptureMonth = "April", fnCity = "Eigener Ort" },
        { fileFormat = "JPEG", isVideo = false, dateTime = invalid, dateTimeDigitized = 20251123,
          dateCreated = "2025-11-23", path = "D:/20251123_101243.MOV" })
      local getter = item.getRawMetadata
      function item:getRawMetadata(field)
        assert(field ~= "dateTimeDigitized" and field ~= "dateCreated",
          "A non-capture field was used to guess time: " .. field)
        return getter(self, field)
      end
    end
    local plans = Location.prepare(catalog, catalog.photos)
    for _, plan in ipairs(plans) do
      assert(plan.values.fnCaptureMonth == "April" and plan.values.fnCaptureYear == "2024")
      assert(string.find(plan.captureDiagnostic, "dateTime", 1, true))
    end
    local updated = Location.execute(catalog, catalog.photos, "update", {}, plans)
    assert(updated.missingTimePhotoCount == 0)
    for _, item in ipairs(catalog.photos) do
      assert(item.values.fnCaptureYear == "2024" and item.values.fnCaptureMonth == "April")
      assert(item.values.fnCity == "Eigener Ort" and item.keywords["April (FN Zeit)"])
    end
    local missing = catalog:photo({}, { dateTime = 0, dateTimeDigitized = 20251123 })
    local noTime = Location.execute(catalog, { missing }, "update")
    assert(noTime.missingTimePhotoCount == 1 and noTime.changedPhotoCount == 0 and missing.metadataWrites == nil)
  `);
});

// Native synthetic MOV (23 November 2025), read through Lightroom's SDK:
// dateTimeOriginal=nil; dateTime=813703041 -> 14 October 2026 (file creation);
// dateTimeDigitized=785581777 -> 23 November 2025 (visible capture time).
const nativeVideoCaptureFixture = `${fixture}
local nativeCreationTime, nativeCaptureTime = 813703041, 785581777
sdk.LrDate.timestampToComponents = function(value)
  if value == nativeCreationTime then return 2026, 10, 14, 22, 37, 21, 4 end
  if value == nativeCaptureTime then return 2025, 11, 23, 10, 9, 37, 1 end
  error("Unexpected timestamp: " .. tostring(value))
end
local nativeTaxon = { masterTaxonId = "mtx_eichhorn", germanName = "Eurasisches Eichhörnchen",
  acceptedScientificName = "Sciurus vulgaris", rank = "species", lifecycleState = "active",
  hierarchy = { { rank = "class", scientificName = "Mammalia" },
    { rank = "species", scientificName = "Sciurus vulgaris" } } }
`;

test("Lua-Videozeit verwendet bei nativer MOV-Zuweisung die Aufnahmequelle statt der widersprüchlichen Dateierstellung", () => {
  execute(`${nativeVideoCaptureFixture}
    local catalog = catalogFixture()
    local video = catalog:photo({}, { isVideo = true, fileFormat = "VIDEO",
      dateTime = nativeCreationTime, dateTimeDigitized = nativeCaptureTime })
    local photo = catalog:photo({}, { isVideo = false, fileFormat = "JPEG",
      dateTime = nativeCreationTime, dateTimeDigitized = nativeCaptureTime })
    local manual = { name = "ManualAuditKeep", localIdentifier = "manual",
      getName = function(self) return self.name end }
    video.keywords[manual.name] = manual
    local plans = Location.prepare(catalog, catalog.photos)
    local result = require("KeywordWriter").assign(catalog, catalog.photos, nativeTaxon, plans)
    assert(result.updatedTaxonomyPhotoCount == 2 and result.updatedLocationTimePhotoCount == 2)
    assert(video.values.fnCaptureMonth == "November" and video.values.fnCaptureYear == "2025",
      "MOV must use visible capture November/2025, got " .. tostring(video.values.fnCaptureMonth) .. "/" .. tostring(video.values.fnCaptureYear))
    assert(video.keywords["November (FN Zeit)"] and video.keywords["2025 (FN Zeit)"])
    assert(not video.keywords["Oktober (FN Zeit)"] and not video.keywords["2026 (FN Zeit)"])
    assert(video.keywords[manual.name] == manual and video.values.masterTaxonId == nativeTaxon.masterTaxonId)
    assert(photo.values.fnCaptureMonth == "Oktober" and photo.values.fnCaptureYear == "2026",
      "A photograph must not adopt its digitization date as capture")
    local before = clone(video.values)
    local metadataWrites, keywordWrites = video.metadataWrites, video.keywordWrites
    local repeated = Location.execute(catalog, { video }, "update")
    assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 1)
    same(video.values, before)
    assert(video.metadataWrites == metadataWrites and video.keywordWrites == keywordWrites)
    assert(catalog.allReads == 0 and suggestionReads == 0)
  `);
});

test("Lua-Videozeit liest rohe und angezeigte Digitalisierungszeit nur für bestätigte Videos und erhält gültige Originalzeit", () => {
  execute(`${nativeVideoCaptureFixture}
    local catalog = catalogFixture()
    local numericText = catalog:photo({}, { isVideo = true, dateTime = nativeCreationTime,
      dateTimeDigitized = "785581777" })
    local rawIso = catalog:photo({}, { isVideo = true, dateTime = nativeCreationTime,
      dateTimeDigitized = "2025-11-23T10:09:37" })
    local formatted = catalog:photo({}, { isVideo = true, dateTime = nativeCreationTime },
      { dateTimeDigitized = "23. November 2025 10:09:37" })
    local original = catalog:photo({}, { isVideo = true, dateTimeOriginal = nativeCreationTime,
      dateTimeDigitized = nativeCaptureTime })
    local formattedOriginal = catalog:photo({}, { isVideo = true, dateTimeDigitized = nativeCaptureTime },
      { dateTimeOriginal = "14. Oktober 2026 22:37:21" })
    local unclassified = catalog:photo({}, { dateTimeDigitized = nativeCaptureTime })
    for _, item in ipairs({ original, formattedOriginal, unclassified }) do
      local getter = item.getRawMetadata
      function item:getRawMetadata(field)
        assert(field ~= "dateTimeDigitized", "Original/unknown media must not consult digitization fallback")
        return getter(self, field)
      end
    end
    local plans = Location.prepare(catalog, catalog.photos)
    for position = 1, 3 do
      assert(plans[position].values.fnCaptureYear == "2025" and plans[position].values.fnCaptureMonth == "November",
        "Video capture source form " .. position .. " was lost")
    end
    for position = 4, 5 do
      assert(plans[position].values.fnCaptureYear == "2026" and plans[position].values.fnCaptureMonth == "Oktober",
        "Valid original source must retain priority")
    end
    assert(plans[6].values.fnCaptureYear == "" and plans[6].values.fnCaptureMonth == "")
    assert(catalog.writes == 0)
  `);
});

test("Lua-Videozeit erhält bei ungültigen Aufnahmequellen vorhandene FN-Zeit ohne Dateinamen zu raten", () => {
  execute(`${nativeVideoCaptureFixture}
    local catalog = catalogFixture()
    for _, invalid in ipairs({ 0, -1, math.huge, 0/0, "kein Datum", "2025-13-23", "0000-11-23" }) do
      local item = catalog:photo({ fnCaptureYear = "2024", fnCaptureMonth = "April" },
        { isVideo = true, fileFormat = "VIDEO", dateTimeDigitized = invalid, dateTime = invalid,
          dateCreated = "2025-11-23", path = "D:/20251123_100937.MOV" })
      local getter = item.getRawMetadata
      function item:getRawMetadata(field)
        assert(field ~= "dateCreated", "File creation must not invent capture time")
        return getter(self, field)
      end
    end
    local missing = catalog:photo({}, { isVideo = true, fileFormat = "VIDEO" })
    local result = Location.execute(catalog, catalog.photos, "update")
    assert(result.missingTimePhotoCount == 1 and missing.metadataWrites == nil)
    for position = 1, #catalog.photos - 1 do
      local item = catalog.photos[position]
      assert(item.values.fnCaptureYear == "2024" and item.values.fnCaptureMonth == "April")
      assert(item.keywords["April (FN Zeit)"] and item.keywords["2024 (FN Zeit)"])
    end
  `);
});

test("Lua-Videozeit-Katalogpflege korrigiert den nativen MOV-Zeitfehler ohne Fotos oder unzugewiesene Videos zu verändern", () => {
  execute(`${nativeVideoCaptureFixture}
    local packageStatus = { packageId = "package", masterVersion = "master", correctionRevision = "revision" }
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return packageStatus end,
      request = function() return { taxa = { nativeTaxon }, searchPackage = packageStatus } end,
    } end
    ${maintenanceModule}
    local Maintenance = require "CatalogMaintenance"
    local catalog = catalogFixture()
    local video = catalog:photo({}, { isVideo = true, fileFormat = "VIDEO", dateTime = nativeCreationTime })
    local photo = catalog:photo({}, { isVideo = false, fileFormat = "JPEG",
      dateTime = nativeCreationTime, dateTimeDigitized = nativeCaptureTime })
    require("KeywordWriter").assign(catalog, catalog.photos, nativeTaxon, Location.prepare(catalog, catalog.photos))
    assert(video.values.fnCaptureMonth == "Oktober" and video.keywords["2026 (FN Zeit)"])
    video.raw.dateTimeDigitized = nativeCaptureTime
    local photoBefore = clone(photo.values)
    local photoMetadataWrites, photoKeywordWrites = photo.metadataWrites, photo.keywordWrites
    local unassigned = catalog:photo({}, { isVideo = true, fileFormat = "VIDEO",
      dateTime = nativeCreationTime, dateTimeDigitized = nativeCaptureTime })
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    assert(state.resolvedTaxonomyPhotoCount == 2)
    catalog.forbidAllReads = true
    local result = Maintenance.applyUpdate(catalog, state)
    assert(result.status == "complete" and result.updatedTaxonomyPhotoCount == 0)
    assert(result.updatedLocationTimePhotoCount == 1 and result.unchangedLocationTimePhotoCount == 1,
      "Native MOV capture must be corrected exactly once")
    assert(video.values.fnCaptureMonth == "November" and video.values.fnCaptureYear == "2025")
    assert(video.keywords["November (FN Zeit)"] and video.keywords["2025 (FN Zeit)"])
    assert(not video.keywords["Oktober (FN Zeit)"] and not video.keywords["2026 (FN Zeit)"])
    same(photo.values, photoBefore)
    assert(photo.metadataWrites == photoMetadataWrites and photo.keywordWrites == photoKeywordWrites)
    assert(unassigned.metadataWrites == nil and unassigned.keywordWrites == nil)
    local videoMetadataWrites, videoKeywordWrites = video.metadataWrites, video.keywordWrites
    local repeated = Maintenance.applyUpdate(catalog, state)
    assert(repeated.updatedTaxonomyPhotoCount == 0 and repeated.updatedLocationTimePhotoCount == 0)
    assert(repeated.unchangedLocationTimePhotoCount == 2)
    assert(video.metadataWrites == videoMetadataWrites and video.keywordWrites == videoKeywordWrites)
  `);
});

test("Lua-Videozeit wird bei expliziter Taxonomiezuweisung für alle sechs MOV übernommen", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    for position = 1, 6 do
      catalog:photo({}, { fileFormat = "VIDEO", isVideo = true, dateTime = 20251123 })
    end
    local taxon = { masterTaxonId = "mtx_bart", germanName = "Bartmeise", acceptedScientificName = "Panurus biarmicus",
      rank = "species", hierarchy = { { rank = "class", scientificName = "Aves" },
        { rank = "species", scientificName = "Panurus biarmicus" } } }
    local plans = Location.prepare(catalog, catalog.photos, { resolveSuggestedLocations = true, skipExisting = true })
    local result = require("KeywordWriter").assign(catalog, catalog.photos, taxon, plans)
    assert(result.updatedTaxonomyPhotoCount == 6 and result.updatedLocationTimePhotoCount == 6)
    for _, item in ipairs(catalog.photos) do
      assert(item.values.masterTaxonId == "mtx_bart" and item.values.taxonomyClass == "Aves")
      assert(item.values.fnCaptureMonth == "November" and item.values.fnCaptureYear == "2025")
      assert(item.keywords["November (FN Zeit)"] and item.keywords["Bartmeise (FN)"])
    end
    assert(suggestionReads == 0)
  `);
});

test("Lua-Videozeit-Katalogpflege ergänzt nur sechs fehlende Zeiten und erhält Fotos sowie vorhandene FN ohne Quelle", () => {
  execute(`${fixture}
    local packageStatus = { packageId = "package", masterVersion = "master", correctionRevision = "revision" }
    local taxon = { masterTaxonId = "mtx_bart", germanName = "Bartmeise", acceptedScientificName = "Panurus biarmicus",
      rank = "species", lifecycleState = "active", hierarchy = {
        { rank = "class", scientificName = "Aves" }, { rank = "species", scientificName = "Panurus biarmicus" } } }
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return packageStatus end,
      request = function() return { taxa = { taxon }, searchPackage = packageStatus } end,
    } end
    ${maintenanceModule}
    local Maintenance = require "CatalogMaintenance"
    local catalog = catalogFixture()
    for position = 1, 6 do catalog:photo({}, { fileFormat = "VIDEO", isVideo = true }) end
    local original = catalog:photo({}, { dateTimeOriginal = 20250324, dateTime = 20250412 })
    local kept = catalog:photo({ fnCaptureYear = "2024", fnCaptureMonth = "April", fnCity = "Eigener Ort" })
    require("KeywordWriter").assign(catalog, catalog.photos, taxon, Location.prepare(catalog, catalog.photos))
    local originalBefore, keptBefore = clone(original.values), clone(kept.values)
    for position = 1, 6 do catalog.photos[position].raw.dateTime = 20251123 end
    local unassigned = catalog:photo({}, { fileFormat = "VIDEO", isVideo = true, dateTime = 20251123 })
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    assert(state.resolvedTaxonomyPhotoCount == 8)
    catalog.forbidAllReads = true
    local result = Maintenance.applyUpdate(catalog, state)
    assert(result.status == "complete" and result.updatedTaxonomyPhotoCount == 0 and result.unchangedTaxonomyPhotoCount == 8)
    assert(result.updatedLocationTimePhotoCount == 6 and result.unchangedLocationTimePhotoCount == 2,
      "Time updates=" .. result.updatedLocationTimePhotoCount .. ", unchanged=" .. result.unchangedLocationTimePhotoCount)
    assert(result.missingTimePhotoCount == 0 and unassigned.metadataWrites == nil)
    for position = 1, 6 do
      local item = catalog.photos[position]
      assert(item.values.fnCaptureMonth == "November" and item.values.fnCaptureYear == "2025")
      assert(item.keywords["November (FN Zeit)"] and item.keywords["2025 (FN Zeit)"])
    end
    same(original.values, originalBefore); same(kept.values, keptBefore)
    local writes, keywords = {}, {}
    for _, item in ipairs(catalog.photos) do writes[item] = item.metadataWrites; keywords[item] = item.keywordWrites end
    local repeated = Maintenance.applyUpdate(catalog, state)
    assert(repeated.updatedTaxonomyPhotoCount == 0 and repeated.updatedLocationTimePhotoCount == 0)
    assert(repeated.unchangedLocationTimePhotoCount == 8)
    for _, item in ipairs(catalog.photos) do
      assert(item.metadataWrites == writes[item] and item.keywordWrites == keywords[item])
    end
  `);
});

test("Lua-Ort/Zeit meldet fehlende Daten und Schreibtimeout ohne Erfolg; Rücknahme erhält Taxonomie und fremde Keywords", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local empty = catalog:photo({ masterTaxonId = "mtx_a" })
    local missing = Location.execute(catalog, { empty }, "add")
    assert(missing.missingDataPhotoCount == 1 and missing.changedPhotoCount == 0 and missing.missingTimePhotoCount == 1)
    assert(empty.values.masterTaxonId == "mtx_a")
    local photo = catalog:photo({ masterTaxonId = "mtx_b", fnCountry = "Deutschland", fnCaptureYear = "2025" },
      { dateTimeOriginal = 20260203 })
    for position, name in ipairs({ "Deutschland (FN Ort)*", "2025 (FN Zeit)*", "Rebhuhn (FN)", "Urlaub" }) do
      local keyword = { name = name, localIdentifier = tostring(position), getName = function(self) return self.name end }
      photo.keywords[name] = keyword; catalog.keywords[name] = keyword
    end
    local removed = Location.execute(catalog, { photo }, "remove")
    assert(removed.changedPhotoCount == 1 and removed.removedKeywordCount == 2, tostring(removed.removedKeywordCount))
    assert(photo.values.masterTaxonId == "mtx_b" and photo.values.fnCountry == "" and photo.values.fnCaptureYear == "")
    assert(photo.keywords["Rebhuhn (FN)"] and photo.keywords.Urlaub)
    assert(not photo.keywords["Deutschland (FN Ort)*"] and not photo.keywords["2025 (FN Zeit)*"])
    assert(next(catalog.keywordCalls) == nil, "Removal must not create any keywords")
    catalog.busy = true
    local before = clone(photo.values)
    local ok, errorMessage = pcall(function() Location.execute(catalog, { photo }, "add") end)
    assert(not ok and string.find(errorMessage, "Schreibzugriff", 1, true))
    same(photo.values, before)
    assert(catalog.allReads == 0)
  `);
});

test("Lua-Ort/Zeit ergänzt fehlende Monate in 260 gemischten Fotos und erhält vollständige Zuweisungen", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    for position = 1, 260 do
      catalog:photo(position <= 130 and { fnCountry = "Deutschland", fnCaptureYear = "2026" } or {},
        { dateTimeOriginal = position <= 130 and 20260312 or 20260412 })
    end
    local plans = Location.prepare(catalog, catalog.photos)
    local result = Location.execute(catalog, catalog.photos, "add", {}, plans)
    assert(result.changedPhotoCount == 260, "Only " .. result.changedPhotoCount .. " of 260 repaired")
    for position, photo in ipairs(catalog.photos) do
      local month = position <= 130 and "März" or "April"
      assert(photo.values.fnCaptureMonth == month and photo.keywords[month .. " (FN Zeit)"])
      assert(photo.values.fnCaptureYear == "2026" and photo.keywords["2026 (FN Zeit)"])
      if position <= 130 then assert(photo.values.fnCountry == "Deutschland") end
    end
    local again = Location.execute(catalog, catalog.photos, "add", {}, plans)
    assert(again.changedPhotoCount == 0 and again.skippedPhotoCount == 260)
  `);
});

test("Lua-Ort/Zeit entfernt reale Objekte trotz alter Namen/IDs und sperrt undokumentierte Rohwerte", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local photo = catalog:photo({ masterTaxonId = "mtx_a", fnCountry = "Deutschland",
      locationTimeKeywordNames = "Alter Name (FN Ort)\\nNicht zugewiesen (FN Zeit)",
      locationTimeKeywordIds = "obsolete,foreign" })
    local function keyword(id, name)
      return { localIdentifier = id, name = name, getName = function(self) return self.name end }
    end
    local assigned = keyword("real", "Neuer Name (FN Ort)")
    local sameNameNotAssigned = keyword("obsolete", "Neuer Name (FN Ort)")
    local absent = keyword("foreign", "Nicht zugewiesen (FN Zeit)")
    local protected = keyword("protected", "Eigene Angabe (FN Ort)*")
    local unrelated = keyword("taxonomy", "Rebhuhn (FN)*")
    catalog.keywords.assigned = assigned; catalog.keywords.obsolete = sameNameNotAssigned
    catalog.keywords.foreign = absent; catalog.keywords.protected = protected; catalog.keywords.taxonomy = unrelated
    photo.keywords[assigned.name] = assigned; photo.keywords[protected.name] = protected; photo.keywords[unrelated.name] = unrelated
    local removedObjects = {}
    function photo:removeKeyword(value)
      assert(inWrite); assert(self.keywords[value.name] == value, "Object is not assigned")
      table.insert(removedObjects, value); self.keywords[value.name] = nil
    end
    local options = { protectedNamesForPhoto = function() return { ["eigene angabe (fn ort)*"] = true } end }
    local result = Location.execute(catalog, { photo }, "remove", options)
    assert(result.removedKeywordCount == 1 and #removedObjects == 1 and removedObjects[1] == assigned)
    assert(photo.keywords[protected.name] and photo.keywords[unrelated.name])
    assert(next(catalog.keywordCalls) == nil)
    local repeated = Location.execute(catalog, { photo }, "remove", options)
    assert(repeated.removedKeywordCount == 0 and repeated.changedPhotoCount == 0)

    local formattedPhoto = catalog:photo({ fnCaptureYear = "2026", locationTimeKeywordIds = "fallback" })
    local fallback = keyword("fallback", "2026 (FN Zeit)")
    catalog.keywords.fallback = fallback; formattedPhoto.keywords[fallback.name] = fallback
    local rawGetter = formattedPhoto.getRawMetadata
    function formattedPhoto:getRawMetadata(field)
      if field == "keywords" then return { "2026 (FN Zeit)" } end
      return rawGetter(self, field)
    end
    local beforeFallback = clone(formattedPhoto.values)
    local fallbackOk = pcall(function() Location.execute(catalog, { formattedPhoto }, "remove") end)
    assert(not fallbackOk and formattedPhoto.keywords[fallback.name])
    same(formattedPhoto.values, beforeFallback)
    assert(next(catalog.keywordCalls) == nil)
  `);
});

test("Lua-Statistikfenster und alle drei Exporte formatieren deutsch und verwenden nur den gelieferten Index", () => {
  execute(`${fixture}
    package.preload.ShowStatistics = function()
      ${statisticsWindow}
      return { catalogOverviewText = catalogOverviewText, favoriteText = favoriteText,
        taxonomyScopeText = taxonomyScopeText, exportLifelist = exportLifelist,
        exportObservationList = exportObservationList, exportSpeciesText = exportSpeciesText }
    end
    local view = require "ShowStatistics"
    local index = Index.new(129555)
    Index.add(index, Index.snapshot({ masterTaxonId = "mtx_a", germanName = 'Rebhuhn; "Test"', englishName = "Common Partridge",
      scientificName = "Perdix perdix", taxonomyClass = "Aves", taxonomyGenus = "Perdix", fnCountry = "Deutschland",
      fnCaptureYear = "2026", fnCaptureMonth = "März", dateTimeOriginal = 20260312, referenceImage = "yes", path = "D:/Fotos/Ä.jpg" }))
    Index.add(index, Index.snapshot({ masterTaxonId = "mtx_b", germanName = "Laubfrosch", taxonomyClass = "Amphibia" }))
    local result = Index.result(index)
    result.assignedPhotos = 4787; result.unassignedPhotos = 124768
    local overview = view.catalogOverviewText(result)
    assert(string.find(overview, "129.555 Fotos im Katalog", 1, true))
    assert(string.find(overview, "4.787 Fotos mit zugewiesener Taxonomie", 1, true))
    assert(string.find(overview, "Taxonomieabdeckung: 3,7 %", 1, true))
    assert(string.find(view.favoriteText(result), "1 Art mit Favoritenbild", 1, true))
    assert(string.find(view.taxonomyScopeText(result), "2 Klassen", 1, true))
    local messages, writes, files = {}, 0, diskFiles
    sdk.LrApplication.activeCatalog = function() error("Export must not access the catalog") end
    local defaultNames = { "Lifelist.csv", "Beobachtungsliste.csv", "Artenliste.txt" }
    local saveCount = 0
    sdk.LrDialogs.presentModalDialog = function(options)
      assert(options.actionVerb == "Speichern"); saveCount = saveCount + 1
      assert(activeProps.fileName == defaultNames[saveCount]); return "ok"
    end
    sdk.LrDialogs.message = function(title) table.insert(messages, title) end
    io.open = function(path, mode)
      assert(mode == "wb"); writes = writes + 1
      local file = { data = "", closed = false }
      function file:write(...)
        for _, item in ipairs({ ... }) do self.data = self.data .. item end
        return self
      end
      function file:close() self.closed = true; return true end
      files[path] = file; diskEntries[path] = "file"; return file
    end
    view.exportLifelist(result)
    local lifelist = files["D:/Exports/Lifelist.csv"].data
    assert(files["D:/Exports/Lifelist.csv"].closed and string.sub(lifelist, 1, 3) == string.char(239, 187, 191))
    assert(string.find(lifelist, '"Rebhuhn; ""Test"""', 1, true))
    assert(string.find(lifelist, '"Amphibien"', 1, true) < string.find(lifelist, '"Vögel"', 1, true))
    view.exportObservationList(result)
    local observations = files["D:/Exports/Beobachtungsliste.csv"].data
    assert(files["D:/Exports/Beobachtungsliste.csv"].closed and string.find(observations, '"12.03.2026"', 1, true))
    assert(string.find(observations, '"Ä.jpg"', 1, true))
    assert(string.find(observations, ';1;"Ja";', 1, true))
    view.exportSpeciesText(result)
    local speciesText = files["D:/Exports/Artenliste.txt"]
    assert(speciesText.closed and string.find(speciesText.data, "Gesamt: 2 Arten", 1, true))
    assert(string.find(speciesText.data, "Amphibien", 1, true) < string.find(speciesText.data, "Vögel", 1, true))
    assert(writes == 3 and #messages == 3)
    sdk.LrDialogs.presentModalDialog = function() return "cancel" end
    view.exportLifelist(result); view.exportObservationList(result); view.exportSpeciesText(result)
    assert(writes == 3 and #messages == 3)
  `);
});

test("Lua-Auswahlexport aggregiert nur markierte Fotos und hält den Katalogindex unverändert", () => {
  execute(`${fixture}
    local catalog = catalogFixture(); catalog.forbidAllReads = true
    local first = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn", taxonomyClass = "Aves",
      fnCountry = "Deutschland", fnCaptureYear = "2026", fnCaptureMonth = "März" }, { dateTimeOriginal = 20260312 })
    local second = catalog:photo(first.values, first.raw)
    local other = catalog:photo({ masterTaxonId = "mtx_b", germanName = "Laubfrosch", taxonomyClass = "Amphibia", referenceImage = "yes" })
    local unassigned = catalog:photo({ fnCountry = "Island" })
    local outside = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn", taxonomyClass = "Aves", referenceImage = "yes" })
    catalog.selected = { first, second, other, unassigned, first }
    loadedIndex = Index.new(1000); Index.add(loadedIndex, Stats.photoSnapshot(outside))
    local before = clone(loadedIndex)
    local captured = Stats.selectedPhotos(catalog)
    assert(#captured == 4 and catalog.targetReads == 1)
    local result = Stats.forPhotos(catalog, captured).statistics
    assert(result.exportScope == "selection" and result.totalPhotos == 4 and result.assignedPhotos == 3)
    assert(result.speciesCount == 2 and result.unassignedPhotos == 1 and #result.observationRows == 2)
    for _, row in ipairs(result.lifelist) do
      if row.masterTaxonId == "mtx_a" then assert(row.photoCount == 2 and row.referenceImageCount == 0) end
    end
    for _, row in ipairs(result.observationRows) do
      if row.masterTaxonId == "mtx_a" then assert(row.photoCount == 2 and not row.referenceImage and row.captureDate == "2026-03-12") end
    end
    same(loadedIndex, before)
    assert(catalog.allReads == 0 and catalog.writes == 0 and deltaWrites == 0 and savedBuild == nil)
    catalog.selected = {}
    assert(#Stats.selectedPhotos(catalog) == 0 and catalog.targetReads == 1,
      "No selection must never expand to the entire filmstrip")
  `);
});

test("Lua-Auswahlexport stoppt unvollständige SDK-Batches ohne unbekannte Fotos als taxonomiefrei zu zählen", () => {
  execute(`${fixture}
    local catalog = catalogFixture(); catalog.forbidAllReads = true
    local photo = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" })
    local metadata, raw = catalog.batchGetPropertyForPlugin, catalog.batchGetRawMetadata
    loadedIndex = Index.new(1); Index.add(loadedIndex, Stats.photoSnapshot(photo))
    local before = clone(loadedIndex)
    for _, missing in ipairs({ "metadata-map", "metadata-photo", "raw-map", "raw-photo" }) do
      catalog.batchGetPropertyForPlugin = function(self, photos)
        if missing == "metadata-map" then return nil end
        if missing == "metadata-photo" then return {} end
        return metadata(self, photos)
      end
      catalog.batchGetRawMetadata = function(self, photos)
        if missing == "raw-map" then return false end
        if missing == "raw-photo" then return {} end
        return raw(self, photos)
      end
      local ok, errorMessage = pcall(function() Stats.forPhotos(catalog, { photo }) end)
      assert(not ok and string.find(errorMessage, "nicht vollständig geliefert", 1, true))
      same(loadedIndex, before)
      assert(savedBuild == nil and catalog.writes == 0 and not inRead)
    end
    catalog.batchGetPropertyForPlugin = metadata; catalog.batchGetRawMetadata = raw
    local result = Stats.forPhotos(catalog, { photo })
    assert(result.statistics.assignedPhotos == 1 and result.statistics.speciesCount == 1)
    local empty = catalog:photo({})
    assert(Stats.forPhotos(catalog, { empty }).statistics.unassignedPhotos == 1,
      "A real empty per-photo metadata table remains valid")
    assert(catalog.allReads == 0 and catalog.writes == 0)
  `);
});

test("Lua-Auswahlexport bindet die Fotoliste über 500er-Blöcke und kann nach Abbruch oder Lesefehler frisch wiederholt werden", () => {
  execute(`${fixture}
    local catalog = catalogFixture(); catalog.forbidAllReads = true
    for position = 1, 501 do catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" }) end
    local photos = {}; for _, photo in ipairs(catalog.photos) do table.insert(photos, photo) end
    local result = Stats.forPhotos(catalog, photos, { progress = function(processed)
      assert(not inRead and not inWrite)
      if processed == 0 then photos[501] = nil; catalog.selected = {} end
    end })
    assert(result.statistics.assignedPhotos == 501 and catalog.batches == 2)
    local initial = Stats.forPhotos(catalog, catalog.photos, { progress = function() return "cancel" end })
    assert(initial.status == "cancelled" and catalog.batches == 2)
    local cancelled = Stats.forPhotos(catalog, catalog.photos, { progress = function(processed)
      return processed == 500 and "cancel" or nil
    end })
    assert(cancelled.status == "cancelled" and cancelled.statistics == nil and catalog.batches == 3)
    local batch = catalog.batchGetPropertyForPlugin
    catalog.batchGetPropertyForPlugin = function() error("Lesefehler") end
    local ok = pcall(function() Stats.forPhotos(catalog, catalog.photos) end)
    assert(not ok and not inRead and loadedIndex == nil and savedBuild == nil)
    catalog.batchGetPropertyForPlugin = batch
    local repeated = Stats.forPhotos(catalog, catalog.photos)
    assert(repeated.status == "complete" and repeated.statistics.assignedPhotos == 501)
    assert(catalog.allReads == 0 and catalog.writes == 0 and deltaWrites == 0)
  `);
});

for (const [format, fileName] of [["lifelist", "Lifelist.csv"], ["observations", "Beobachtungsliste.csv"], ["species-text", "Artenliste.txt"]]) {
  test(`Lua-${fileName} verwendet die bestätigte Auswahl und deutsche Formate ohne spätere Auswahländerung`, () => {
    execute(`${fixture}
      ${statisticsExportWindowModule}
      local view = require "ShowStatistics"
      local catalog = catalogFixture(); catalog.forbidAllReads = true
      local selected = catalog:photo({ masterTaxonId = "mtx_a", germanName = 'Rebhuhn; "Test"',
        englishName = "Common Partridge", scientificName = "Perdix perdix", taxonomyClass = "Aves",
        fnCountry = "Deutschland", fnCaptureYear = "2026", fnCaptureMonth = "März" },
        { dateTimeOriginal = 20260312, path = "D:/Fotos/Ä.jpg" })
      local outside = catalog:photo({ masterTaxonId = "mtx_b", germanName = "Außerhalb", referenceImage = "yes" })
      local index = Index.new(2); Index.add(index, Stats.photoSnapshot(outside))
      local catalogResult = Index.result(index)
      catalog.selected = { outside }
      local modalCount, data, success = 0, "", false
      sdk.LrDialogs.presentModalDialog = function(options)
        modalCount = modalCount + 1
        if modalCount == 1 then
          assert(options.title == "Statistik exportieren")
          activeProps.exportType = "${format}"; activeProps.exportScope = "selection"
          catalog.selected = { selected }
        else
          assert(options.actionVerb == "Speichern" and activeProps.fileName == "${fileName}")
          assert(string.find(options.contents[1].title, "Markierte Fotos: 1 Foto", 1, true))
          catalog.selected = { outside }
        end
        return "ok"
      end
      sdk.LrDialogs.message = function(_, text, style)
        assert(style == "info" and string.find(text, "Markierte Fotos: 1 Foto", 1, true)); success = true
      end
      io.open = function(path, mode)
        assert(path == "D:/Exports/${fileName}.fn-export.tmp" and mode == "wb")
        diskEntries[path] = "file"
        return { write = function(self, ...)
          for _, value in ipairs({...}) do data = data .. value end; return self
        end, close = function() return true end }
      end
      view.exportStatistics(catalog, catalogResult)
      assert(success and modalCount == 2 and catalog.targetReads == 1 and catalog.batches == 1)
      assert(string.sub(data, 1, 3) == string.char(239, 187, 191) and not string.find(data, "Außerhalb", 1, true))
      if "${format}" == "species-text" then
        assert(string.find(data, '* Rebhuhn; "Test"', 1, true) and string.find(data, "Gesamt: 1 Art", 1, true))
      else
        assert(string.find(data, '"Rebhuhn; ""Test"""', 1, true) and string.find(data, '"Vögel"', 1, true))
        assert(string.find(data, ';1;"Nein"', 1, true))
      end
      if "${format}" == "observations" then
        assert(string.find(data, '"12.03.2026"', 1, true) and string.find(data, '"Ä.jpg"', 1, true))
      end
      assert(catalog.allReads == 0 and catalog.writes == 0 and progressDoneCount == 1)
    `);
  });
}

test("Lua-Exportwahl verhindert Katalogrückfall bei leerer oder abgebrochener Auswahl und bleibt wiederholbar", () => {
  execute(`${fixture}
    ${statisticsExportWindowModule}
    local view = require "ShowStatistics"
    local catalog = catalogFixture(); catalog.forbidAllReads = true
    local photo = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" })
    local index = Index.new(1); Index.add(index, Stats.photoSnapshot(photo)); local result = Index.result(index)
    local messages, saved, dialogMode = {}, 0, "selection"
    sdk.LrDialogs.message = function(title) table.insert(messages, title) end
    sdk.LrDialogs.presentModalDialog = function(options)
      if options.title == "Statistik exportieren" then
        activeProps.exportScope = "selection"; return dialogMode == "cancel" and "cancel" or "ok"
      end
      saved = saved + 1; return "cancel"
    end
    io.open = function() error("No file may be created") end
    view.exportStatistics(catalog, result)
    assert(messages[1] == "Keine Fotos markiert" and saved == 0 and catalog.targetReads == nil)
    catalog.selected = { photo }; cancelSelectionRead = true
    view.exportStatistics(catalog, result)
    assert(#messages == 1 and saved == 0 and catalog.batches == 0 and progressDoneCount == 1)
    cancelSelectionRead = false; dialogMode = "cancel"
    view.exportStatistics(catalog, result)
    assert(catalog.targetReads == 1 and saved == 0)
    dialogMode = "selection"
    local original = catalog.batchGetPropertyForPlugin
    catalog.batchGetPropertyForPlugin = function() error("SDK-Lesefehler") end
    view.exportStatistics(catalog, result)
    assert(messages[2] == "Export fehlgeschlagen" and saved == 0 and progressDoneCount == 2)
    catalog.batchGetPropertyForPlugin = original
    view.exportStatistics(catalog, result)
    assert(saved == 1 and progressDoneCount == 3 and catalog.batches == 1)
    local originalSelection = catalog.getTargetPhotos
    catalog.getTargetPhotos = function() error("SDK-Auswahlfehler") end
    view.exportStatistics(catalog, result)
    assert(saved == 1 and messages[3] == "Export fehlgeschlagen")
    catalog.getTargetPhotos = originalSelection
    view.exportStatistics(catalog, result)
    assert(saved == 2 and catalog.batches == 2 and progressDoneCount == 4)
    assert(catalog.allReads == 0 and catalog.writes == 0 and #messages == 3)
  `);
});

test("Lua-Exportdateidialog prüft Namen, Zielordner und Überschreiben vor jeglichem Dateiöffnen", () => {
  execute(`${fixture}
    local Export = require "ExportFile"
    io.open = function() error("The file chooser must not open or change files") end
    local warnings = 0
    sdk.LrDialogs.message = function(_, _, style) assert(style == "warning"); warnings = warnings + 1 end
    local invalidNames = { "../andere.csv", "unter/andere.csv", "falsch.txt", "CON.csv", "COM1.csv", "test?.csv", ".", "" }
    for _, invalid in ipairs(invalidNames) do
      local calls = 0
      sdk.LrDialogs.presentModalDialog = function()
        calls = calls + 1
        if calls == 1 then activeProps.fileName = invalid; return "ok" end
        return "cancel"
      end
      assert(Export.choosePath("Export", "csv", "Lifelist.csv") == nil and calls == 2)
    end
    assert(warnings == #invalidNames)
    sdk.LrDialogs.presentModalDialog = function()
      activeProps.fileName = "Meine Lifelist"; return "ok"
    end
    assert(Export.choosePath("Export", "csv", "Lifelist.csv") == "D:/Exports/Meine Lifelist.csv")
    diskEntries["D:/Exports/Lifelist.csv"] = "file"
    sdk.LrDialogs.presentModalDialog = function() return "ok" end
    sdk.LrDialogs.confirm = function(_, path, verb)
      assert(path == "D:/Exports/Lifelist.csv" and verb == "Ersetzen"); return "cancel"
    end
    assert(Export.choosePath("Export", "csv", "Lifelist.csv") == nil)
    sdk.LrDialogs.confirm = function() return "ok" end
    assert(Export.choosePath("Export", "csv", "Lifelist.csv") == "D:/Exports/Lifelist.csv")
    diskEntries["D:/Andere Exporte"] = "directory"
    local calls = 0
    sdk.LrDialogs.presentModalDialog = function()
      calls = calls + 1; return calls == 1 and "other" or "ok"
    end
    sdk.LrDialogs.runOpenPanel = function(options)
      assert(not options.canChooseFiles and options.canChooseDirectories and not options.allowsMultipleSelection)
      assert(options.initialDirectory == "D:/Exports"); return { "D:/Andere Exporte" }
    end
    assert(Export.choosePath("Export", "txt", "Artenliste.txt") == "D:/Andere Exporte/Artenliste.txt")
    calls = 0; sdk.LrDialogs.runOpenPanel = function() return nil end
    assert(Export.choosePath("Export", "txt", "Artenliste.txt") == "D:/Andere Exporte/Artenliste.txt")
  `);
});

test("Lua-Export meldet Schreib- und Abschlussfehler, schließt Dateien und erlaubt frischen Erfolg", () => {
  execute(`${fixture}
    ${statisticsExportWindowModule}
    local view = require "ShowStatistics"
    local catalog = catalogFixture()
    local photo = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" })
    local index = Index.new(1); Index.add(index, Stats.photoSnapshot(photo)); loadedIndex = index
    local result = Index.result(index)
    local mode, closed, successes, failures = "open", 0, 0, 0
    sdk.LrDialogs.presentModalDialog = function() return "ok" end
    sdk.LrDialogs.message = function(title, _, style)
      if style == "critical" then assert(title == "Export fehlgeschlagen"); failures = failures + 1
      else successes = successes + 1 end
    end
    io.open = function(path)
      if mode == "open" then return nil, "Datei gesperrt" end
      diskEntries[path] = "file"
      local writes = 0
      return { write = function(self)
        writes = writes + 1
        if mode == "write" and writes == 2 then return nil, "Datenträger voll" end
        return self
      end, close = function()
        closed = closed + 1
        if mode == "close" then return nil, "Abschluss fehlgeschlagen" end
        return true
      end }
    end
    for _, failure in ipairs({"open", "write", "close"}) do
      mode = failure; view.exportStatistics(catalog, result)
    end
    assert(failures == 3 and successes == 0 and closed == 2)
    mode = "complete"; view.exportStatistics(catalog, result)
    assert(successes == 1 and closed == 3 and catalog.targetReads == nil and catalog.batches == 0)
  `);
});

test("Lua-Export erhält eine bestehende Datei bei Schreibfehler, Übernahmefehler und gesperrter Rücknahme", () => {
  execute(`${fixture}
    local Export = require "ExportFile"
    local target = "D:/Exports/Lifelist.csv"
    local mode, writes = "write", 0
    local function oldFile()
      diskEntries[target] = "file"; diskFiles[target] = { data = "Unveränderte Altdatei" }
    end
    oldFile()
    local move = sdk.LrFileUtils.move
    sdk.LrFileUtils.move = function(source, destination)
      if (mode == "publish" or mode == "restore") and string.find(source, ".fn-export.tmp", 1, true) then
        return false, "Übernahme gesperrt"
      end
      if mode == "restore" and string.find(source, ".fn-export-backup", 1, true) then
        return false, "Rücknahme gesperrt"
      end
      return move(source, destination)
    end
    io.open = function(path)
      assert(path ~= target); writes = writes + 1
      local file = { data = "" }; diskEntries[path] = "file"; diskFiles[path] = file
      function file:write(text)
        if mode == "write" then return nil, "Schreibfehler" end
        self.data = self.data .. text; return self
      end
      function file:close() return true end
      return file
    end
    local function export()
      return Export.write(target, "CSV-Datei", function(file) file:write("Neue Datei") end, true)
    end
    local ok = pcall(export)
    assert(not ok and diskFiles[target].data == "Unveränderte Altdatei")
    mode = "publish"; ok = pcall(export)
    assert(not ok and diskFiles[target].data == "Unveränderte Altdatei")
    mode = "restore"
    local errorMessage; ok, errorMessage = pcall(export)
    assert(not ok and not diskEntries[target])
    local backup = target .. ".fn-export-backup"
    assert(diskFiles[backup].data == "Unveränderte Altdatei" and string.find(errorMessage, backup, 1, true))
    mode = "complete"; assert(move(backup, target))
    assert(export() == nil and string.find(diskFiles[target].data, "Neue Datei", 1, true))
    assert(not diskEntries[backup] and not diskEntries[target .. ".fn-export.tmp"])
    oldFile()
    ok = pcall(function() Export.write(target, "CSV-Datei", function(file) file:write("Neue Datei") end, false) end)
    assert(not ok and diskFiles[target].data == "Unveränderte Altdatei",
      "A destination that appeared after the dialog must not be overwritten")
    sdk.LrFileUtils.delete = function(path)
      if string.find(path, ".fn-export-backup", 1, true) then return false end
      diskEntries[path] = nil; diskFiles[path] = nil; return true
    end
    local retained = export()
    assert(retained == backup and diskFiles[backup].data == "Unveränderte Altdatei")
    assert(string.find(diskFiles[target].data, "Neue Datei", 1, true) and writes == 6)
  `);
});

test("Lua-Statistiköffnen ohne Index startet keinen Vollaufbau und bietet Auswahl unabhängig vom Index", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    catalog:photo({ masterTaxonId = "mtx_a" })
    sdk.LrApplication.activeCatalog = function() return catalog end
    sdk.LrTasks.startAsyncTask = function(callback) callback() end
    sdk.LrDialogs.presentFloatingDialog = function() error("Opening must not start a statistics build") end
    sdk.LrDialogs.presentModalDialog = function(options)
      assert(options.title == "FN Wildlife – Taxonomie-Statistik")
      assert(string.find(options.contents[1].title, "Markierte Fotos können sofort exportiert", 1, true))
      return "cancel"
    end
    ${statisticsWindow}
    assert(catalog.allReads == 2 and catalog.batches == 0 and catalog.writes == 0)
    sdk.LrTasks.startAsyncTask = function() end
    ${statisticsExportWindowModule}
    local view = require "ShowStatistics"
    sdk.LrDialogs.presentModalDialog = function()
      assert(activeProps.exportScope == "selection"); return "cancel"
    end
    assert(view.chooseExport(catalog, false) == nil and catalog.targetReads == nil)
  `);
});

test("Lua-Statistikhilfe ohne Index und Auswahlhinweis im Export erhalten explizit vier Textzeilen", () => {
  execute(`${fixture}
    ${statisticsExportWindowModule}
    local view = require "ShowStatistics"
    local catalog = catalogFixture()
    local dialogs = 0
    sdk.LrDialogs.presentModalDialog = function(options)
      dialogs = dialogs + 1
      local hint
      if options.title == "FN Wildlife – Taxonomie-Statistik" then
        hint = options.contents[1]
        assert(hint.width_in_chars == 72)
        assert(string.find(hint.title, "Markierte Fotos können sofort exportiert werden.", 1, true))
      else
        assert(options.title == "Statistik exportieren")
        hint = options.contents[5]
        assert(hint.width_in_chars == 64)
        assert(string.find(hint.title, "Art-Favoriten beziehen sich ausschließlich auf diese Auswahl.", 1, true))
      end
      assert(hint.height_in_lines == 4, "The complete hint needs an explicit multiline SDK view")
      return "cancel"
    end
    view.showDashboard(catalog, nil)
    assert(view.chooseExport(catalog, false) == nil)
    assert(dialogs == 2 and catalog.batches == 0 and catalog.writes == 0 and catalog.targetReads == nil)
  `);
});

test("Lua-Katalogpflege prüft nur lesend und stoppt einen Paketwechsel vor dem nächsten 250er-Block", () => {
  execute(`${fixture}
    local packageId = "package-before"
    local taxon = { masterTaxonId = "mtx_a", germanName = "Rebhuhn", acceptedScientificName = "Perdix perdix", lifecycleState = "active" }
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return { packageId = packageId, masterVersion = "master", correctionRevision = "revision" } end,
      request = function(request)
        assert(request.command == "taxa" and #request.masterTaxonIds == 1)
        return { taxa = { taxon }, searchPackage = { packageId = packageId, masterVersion = "master", correctionRevision = "revision" } }
      end,
    } end
    ${maintenanceModule}
    local Maintenance = require "CatalogMaintenance"
    local catalog = catalogFixture()
    for position = 1, 501 do catalog:photo({ masterTaxonId = "mtx_a", germanName = "Altname" }, { dateTimeOriginal = 20260112 }) end
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    assert(catalog.writes == 0 and state.resolvedTaxonomyPhotoCount == 501)
    catalog.forbidAllReads = true
    local result = Maintenance.applyUpdate(catalog, state, { applyProgress = function(processed)
      if processed == 250 then packageId = "package-after" end
    end })
    assert(result.status == "package-changed", "Actual status: " .. tostring(result.status))
    assert(result.updatedTaxonomyPhotoCount == 250 and catalog.writes == 1)
    assert(catalog.photos[1].values.germanName == "Rebhuhn")
    assert(catalog.photos[251].values.germanName == "Altname")
  `);
});

test("Lua-Katalogpflege erhält unauflösbare IDs und bleibt bei Vorbereitungsabbruch vollständig schreibfrei", () => {
  execute(`${fixture}
    local packageStatus = { packageId = "package", masterVersion = "master", correctionRevision = "revision" }
    local taxon = { masterTaxonId = "mtx_a", germanName = "Rebhuhn", acceptedScientificName = "Perdix perdix", lifecycleState = "active" }
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return packageStatus end,
      request = function(request)
        assert(request.command == "taxa" and #request.masterTaxonIds == 2)
        return { taxa = { taxon }, searchPackage = packageStatus }
      end,
    } end
    ${maintenanceModule}
    local Maintenance = require "CatalogMaintenance"
    local catalog = catalogFixture()
    local known = catalog:photo({ masterTaxonId = "mtx_a", germanName = "Altname" }, { dateTimeOriginal = 20260112 })
    local unknown = catalog:photo({ masterTaxonId = "mtx_missing", germanName = "Nicht umdeuten", fnCaptureYear = "2025" }, { dateTimeOriginal = 20260203 })
    local invalid = catalog:photo({ masterTaxonId = "invalid", referenceImage = "yes", germanName = "Ungültig" })
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    assert(catalog.writes == 0 and state.resolvedTaxonomyPhotoCount == 1 and state.unresolvedTaxonomyPhotoCount == 1)
    assert(state.invalidTaxonomyPhotoCount == 1 and state.orphanFavoritePhotoCount == 1)
    local canceled = Maintenance.applyUpdate(catalog, state, { preparationProgress = function() return "cancel" end })
    assert(canceled.status == "canceled" and catalog.writes == 0)
    assert(known.values.germanName == "Altname" and unknown.values.fnCaptureYear == "2025")
    catalog.forbidAllReads = true
    local completed = Maintenance.applyUpdate(catalog, state)
    assert(completed.status == "complete" and completed.updatedTaxonomyPhotoCount == 1 and completed.updatedLocationTimePhotoCount == 2)
    assert(unknown.values.masterTaxonId == "mtx_missing" and unknown.values.germanName == "Nicht umdeuten")
    assert(unknown.values.fnCaptureYear == "2026" and unknown.values.fnCaptureMonth == "Februar")
    assert(invalid.values.masterTaxonId == "invalid" and invalid.values.referenceImage == "yes")
  `);
});

test("Lua-Katalogpflege blockiert vor dem ersten Schreibblock und bleibt nach Pause/Neustart idempotent", () => {
  execute(`${fixture}
    local packageId = "package"
    local taxon = { masterTaxonId = "mtx_a", germanName = "Rebhuhn", acceptedScientificName = "Perdix perdix", lifecycleState = "active" }
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return { packageId = packageId, masterVersion = "master", correctionRevision = "revision" } end,
      request = function() return { taxa = { taxon }, searchPackage = { packageId = packageId, masterVersion = "master", correctionRevision = "revision" } } end,
    } end
    ${maintenanceModule}
    local Maintenance = require "CatalogMaintenance"
    local catalog = catalogFixture()
    for position = 1, 501 do catalog:photo({ masterTaxonId = "mtx_a", germanName = "Altname" }, { dateTimeOriginal = 20260112 }) end
    loadedIndex = Index.new(501)
    for _, photo in ipairs(catalog.photos) do Index.add(loadedIndex, Stats.photoSnapshot(photo)) end
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    packageId = "changed-before-first-block"
    local blocked = Maintenance.applyUpdate(catalog, state)
    assert(blocked.status == "package-changed" and catalog.writes == 0)
    packageId = "package"
    local paused = Maintenance.applyUpdate(catalog, state, { applyProgress = function(processed)
      if processed == 250 then return "cancel" end
    end })
    assert(paused.status == "paused" and paused.updatedTaxonomyPhotoCount == 250 and catalog.writes == 1)
    assert(catalog.photos[251].values.germanName == "Altname")
    local continued = Maintenance.applyUpdate(catalog, state)
    assert(continued.status == "complete" and continued.updatedTaxonomyPhotoCount == 251 and continued.unchangedTaxonomyPhotoCount == 250 and catalog.writes == 4)
    local after = Index.result(loadedIndex)
    local repeated = Maintenance.applyUpdate(catalog, state)
    assert(repeated.status == "complete" and repeated.updatedTaxonomyPhotoCount == 0 and repeated.unchangedTaxonomyPhotoCount == 501 and catalog.writes == 7)
    same(Index.result(loadedIndex), after)
    assert(after.assignedPhotos == 501 and after.taxonomyDataQuality.timePhotoCount == 501)
    assert(after.lifelist[1].photoCount == 501)
  `);
});

test("Lua-Katalogpflege stoppt auch eigenständige Ort/Zeit-Blöcke bei Paketwechsel", () => {
  execute(`${fixture}
    local packageId = "package"
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return { packageId = packageId, masterVersion = "master", correctionRevision = "revision" } end,
      request = function() error("No taxonomy IDs should be requested") end,
    } end
    ${maintenanceModule}
    local Maintenance = require "CatalogMaintenance"
    local catalog = catalogFixture()
    for position = 1, 501 do catalog:photo({ fnCaptureYear = "2025", fnCaptureMonth = "Dezember" }, { dateTimeOriginal = 20260112 }) end
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    assert(state.resolvedTaxonomyPhotoCount == 0 and #state.locationOnlyPhotos == 501 and catalog.writes == 0)
    local result = Maintenance.applyUpdate(catalog, state, { applyProgress = function(processed)
      if processed == 250 then packageId = "changed" end
    end })
    assert(result.status == "package-changed" and result.updatedLocationTimePhotoCount == 250 and catalog.writes == 1)
    assert(catalog.photos[1].values.fnCaptureYear == "2026" and catalog.photos[251].values.fnCaptureYear == "2025")
  `);
});

test("Lua-FN-Abgleich repariert Felder und gelöschte Keywords, zählt Ort/Zeit bei Taxonomiefotos und schreibt Wiederholungen nicht", () => {
  execute(`${fixture}
    local packageStatus = { packageId = "package", masterVersion = "master", correctionRevision = "revision" }
    local taxon = { masterTaxonId = "mtx_a", germanName = "Rebhuhn", englishName = "Grey Partridge",
      acceptedScientificName = "Perdix perdix", rank = "species", lifecycleState = "active", hierarchy = {
        { rank = "class", scientificName = "Aves" }, { rank = "species", scientificName = "Perdix perdix" } } }
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return packageStatus end,
      request = function() return { taxa = { taxon }, searchPackage = packageStatus } end,
    } end
    ${maintenanceModule}
    local Maintenance = require "CatalogMaintenance"
    local catalog = catalogFixture()
    local photo = catalog:photo({ masterTaxonId = "mtx_a", fnCountry = "Deutschland", fnCaptureYear = "2026" },
      { dateTimeOriginal = 20260312, gps = { latitude = 50, longitude = 10 } })
    local user = { name = "Urlaub", localIdentifier = "user", getName = function(self) return self.name end }
    photo.keywords.Urlaub = user
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    local first = Maintenance.applyUpdate(catalog, state)
    assert(first.updatedTaxonomyPhotoCount == 1 and first.updatedLocationTimePhotoCount == 1)
    assert(photo.values.fnCaptureMonth == "März" and photo.values.fnCountry == "Deutschland")
    assert(photo.keywords["März (FN Zeit)"] and photo.keywords["Deutschland (FN Ort)"] and photo.keywords.Urlaub == user)
    assert(photo.values.taxonomyClass == "Aves" and photo.values.englishName == "Grey Partridge")
    assert(suggestionReads == 0)
    local writes, keywords, revision = photo.metadataWrites, photo.keywordWrites, dataRevision
    local second = Maintenance.applyUpdate(catalog, state)
    assert(second.updatedTaxonomyPhotoCount == 0 and second.updatedLocationTimePhotoCount == 0)
    assert(second.unchangedTaxonomyPhotoCount == 1 and second.unchangedLocationTimePhotoCount == 1)
    assert(photo.metadataWrites == writes and photo.keywordWrites == keywords and dataRevision == revision)
    photo.values.englishName = "Alt"; photo.keywords["März (FN Zeit)"] = nil
    local repaired = Maintenance.applyUpdate(catalog, state)
    assert(repaired.updatedTaxonomyPhotoCount == 1 and repaired.updatedLocationTimePhotoCount == 1,
      "taxonomy=" .. repaired.updatedTaxonomyPhotoCount .. ", location=" .. repaired.updatedLocationTimePhotoCount .. ", error=" .. table.concat(repaired.errors, "; "))
    assert(photo.values.englishName == "Grey Partridge" and photo.keywords["März (FN Zeit)"])
    photo.raw.dateTimeOriginal = 20260412
    local changedTime = Maintenance.applyUpdate(catalog, state)
    assert(changedTime.updatedTaxonomyPhotoCount == 0 and changedTime.updatedLocationTimePhotoCount == 1)
    assert(photo.values.fnCaptureMonth == "April" and not photo.keywords["März (FN Zeit)"])
    assert(photo.keywords.Urlaub == user and photo.raw.gps.latitude == 50)
    local message = Maintenance.completionText(state, { unresolvedSuggestedLocationPhotoCount = 1417 })
    assert(string.find(message, "GPS vorhanden, aber Lightroom lieferte keine nutzbaren Ortsvorschläge: 1417", 1, true))
  `);
});

test("Lua-Ort/Zeit schließt verzögerte Stichwortkennungen vor Rückkehr ab und wiederholt ohne Datenwrites", () => {
  execute(`${delayedKeywordIdentifierFixture}
    local catalog = delayedIdentifierCatalog()
    local november = catalog:photo({}, { dateTimeOriginal = 20251123 })
    local march = catalog:photo({}, { dateTimeOriginal = 20250315 })
    local control = catalog:photo({ germanName = "Unberührt" }, { dateTimeOriginal = 20260101 })
    local manual = { name = "ManualAuditKeep", localIdentifier = "manual", getName = function(self) return self.name end }
    november.keywords.ManualAuditKeep = manual
    local controlBefore = photoWriteSnapshot(control)
    local selected = { november, march }
    local first = Location.execute(catalog, selected, "update")
    assert(first.changedPhotoCount == 2 and first.skippedPhotoCount == 0)
    assert(november.values.fnCaptureMonth == "November" and march.values.fnCaptureMonth == "März")
    assert(november.values.fnCaptureYear == "2025" and march.values.fnCaptureYear == "2025")
    for _, photo in ipairs(selected) do
      assertStoredKeywordIdentifiers(photo, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
    end
    assert(dataRevision == 1, "Completing internal IDs must not add another statistics revision")
    assert(november.keywords.ManualAuditKeep == manual)
    controlBefore.revision = dataRevision
    local novemberBefore, marchBefore = photoWriteSnapshot(november), photoWriteSnapshot(march)
    local second = Location.execute(catalog, selected, "update")
    assert(second.changedPhotoCount == 0 and second.skippedPhotoCount == 2)
    assertPhotoUnchanged(november, novemberBefore); assertPhotoUnchanged(march, marchBefore)
    assertPhotoUnchanged(control, controlBefore)
    assert(catalog.allReads == 0)
  `);
});

test("Lua-Taxonomie schließt verzögerte Stichwortkennungen für Taxonomie und Zeit vor Rückkehr ab", () => {
  execute(`${delayedKeywordIdentifierFixture}
    local Writer = require "KeywordWriter"
    local catalog = delayedIdentifierCatalog()
    local photo = catalog:photo({}, { dateTimeOriginal = 20251123 })
    local manual = { name = "ManualAuditKeep", localIdentifier = "manual", getName = function(self) return self.name end }
    photo.keywords.ManualAuditKeep = manual
    local taxon = assignmentTaxon()
    local first = Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })
    assert(first.updatedTaxonomyPhotoCount == 1 and first.updatedLocationTimePhotoCount == 1)
    assertStoredKeywordIdentifiers(photo, "taxonomyKeywordIds", Writer.hasManagedKeywordSuffix)
    assertStoredKeywordIdentifiers(photo, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
    assert(dataRevision == 1 and photo.keywords.ManualAuditKeep == manual)
    local before = photoWriteSnapshot(photo)
    local second = Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })
    assert(second.updatedTaxonomyPhotoCount == 0 and second.updatedLocationTimePhotoCount == 0)
    assert(second.unchangedTaxonomyPhotoCount == 1 and second.unchangedLocationTimePhotoCount == 1)
    assertPhotoUnchanged(photo, before)
    assert(catalog.allReads == 0)
  `);
});

test("Lua-FN-Abgleich schließt verzögerte Stichwortkennungen in beiden Pflegewegen beim ersten Lauf ab", () => {
  execute(`${delayedKeywordIdentifierFixture}
    local taxon = assignmentTaxon()
    local packageStatus = { packageId = "package", masterVersion = "master", correctionRevision = "revision" }
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return packageStatus end,
      request = function() return { taxa = { taxon }, searchPackage = packageStatus } end,
    } end
    ${maintenanceModule}
    local Writer, Maintenance = require "KeywordWriter", require "CatalogMaintenance"
    local catalog = delayedIdentifierCatalog()
    local taxonomy = catalog:photo({ masterTaxonId = taxon.masterTaxonId }, { dateTimeOriginal = 20251123 })
    local timeOnly = catalog:photo({ fnCaptureYear = "2024" }, { dateTimeOriginal = 20250315 })
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    local first = Maintenance.applyUpdate(catalog, state)
    assert(first.status == "complete" and first.failedPhotoCount == 0)
    assert(first.updatedTaxonomyPhotoCount == 1 and first.updatedLocationTimePhotoCount == 2)
    assertStoredKeywordIdentifiers(taxonomy, "taxonomyKeywordIds", Writer.hasManagedKeywordSuffix)
    assertStoredKeywordIdentifiers(taxonomy, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
    assertStoredKeywordIdentifiers(timeOnly, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
    assert(timeOnly.values.fnCaptureMonth == "März" and timeOnly.values.fnCaptureYear == "2025")
    local taxonomyBefore, timeBefore = photoWriteSnapshot(taxonomy), photoWriteSnapshot(timeOnly)
    local second = Maintenance.applyUpdate(catalog, state)
    assert(second.status == "complete" and second.failedPhotoCount == 0)
    assert(second.updatedTaxonomyPhotoCount == 0 and second.updatedLocationTimePhotoCount == 0)
    assert(second.unchangedTaxonomyPhotoCount == 1 and second.unchangedLocationTimePhotoCount == 2)
    assertPhotoUnchanged(taxonomy, taxonomyBefore); assertPhotoUnchanged(timeOnly, timeBefore)
  `);
});

for (const visibility of [
  { label: "Rohstichwörter", keywords: true, metadata: false, names: false },
  { label: "FN-Metadaten", keywords: false, metadata: true, names: false },
  { label: "Rohstichwörter, FN-Metadaten und neue Namen", keywords: true, metadata: true, names: true },
]) {
 for (const path of ["Ort/Zeit", "Taxonomie"]) {
  for (const existing of [false, true]) {
    test(`Lua-ID-Abschluss berücksichtigt verzögerte ${visibility.label} bei ${path} ${existing ? "nach Aufnahmezeitänderung" : "bei erster Zuweisung"}`, () => {
      execute(`${delayedKeywordIdentifierFixture}
        local Writer = require "KeywordWriter"
        local catalog = catalogFixture()
        local photo = catalog:photo({}, { dateTimeOriginal = ${existing ? 20251123 : 20271223} })
        local taxon = assignmentTaxon()
        ${existing ? (path === "Ort/Zeit"
          ? 'Location.execute(catalog, { photo }, "update")'
          : 'Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })') : ""}
        photo.raw.dateTimeOriginal = 20271223
        catalog.delayedKeywordVisibility = ${visibility.keywords}
        catalog.delayedMetadataVisibility = ${visibility.metadata}
        catalog.delayKeywordNames = ${visibility.names}
        catalog.delayKeywordIdentifiers = true
        local ok, result = pcall(function()
          ${path === "Ort/Zeit"
            ? 'return Location.execute(catalog, { photo }, "update")'
            : 'return Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })'}
        end)
        assert(ok, "A queued real keyword must be verified after commit instead of rejected inside it: " .. tostring(result))
        assert(photo.values.fnCaptureMonth == "Dezember" and photo.values.fnCaptureYear == "2027")
        assert(photo.keywords["Dezember (FN Zeit)"] and photo.keywords["2027 (FN Zeit)"])
        assert(not photo.keywords["November (FN Zeit)"] and not photo.keywords["2025 (FN Zeit)"])
        assertStoredKeywordIdentifiers(photo, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
        ${path === "Taxonomie" ? 'assertStoredKeywordIdentifiers(photo, "taxonomyKeywordIds", Writer.hasManagedKeywordSuffix)' : ""}
        local before = photoWriteSnapshot(photo)
        local repeated = ${path === "Ort/Zeit"
          ? 'Location.execute(catalog, { photo }, "update")'
          : 'Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })'}
        ${path === "Ort/Zeit"
          ? 'assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 1)'
          : 'assert(repeated.updatedTaxonomyPhotoCount == 0 and repeated.updatedLocationTimePhotoCount == 0)'}
        assertPhotoUnchanged(photo, before)
      `);
    });
  }
 }
}

test("Lua-ID-Abschluss verwirft ein anderes Raw-Stichwortobjekt wenn der wirklich hinzugefügte Handle nach Commit kennungslos bleibt", () => {
  execute(`${delayedKeywordIdentifierFixture}
    local catalog = delayedIdentifierCatalog()
    catalog.delayedKeywordVisibility = true
    local photo = catalog:photo({}, { dateTimeOriginal = 20271223 })
    local afterReplacement, addedHandle
    catalog.afterWriteCommit = function(self)
      self.afterWriteCommit = nil
      addedHandle = photo.keywords["Dezember (FN Zeit)"]
      local committedId = assert(addedHandle.localIdentifier)
      addedHandle.localIdentifier = nil
      local replacement = { name = addedHandle.name, localIdentifier = committedId,
        getName = function(keyword) return keyword.name end }
      assert(replacement ~= addedHandle)
      photo.keywords[replacement.name] = replacement
      afterReplacement = photoWriteSnapshot(photo)
    end
    local ok, result = pcall(function() return Location.execute(catalog, { photo }, "update") end)
    assert(afterReplacement and addedHandle.localIdentifier == nil)
    assert(not ok, "A different object must not replace the unresolved handle actually added to the photo")
    assert(catalog.writes == 1, "An unproved keyword identity must stop before the ID write gate")
    assertPhotoUnchanged(photo, afterReplacement)
  `);
});

test("Lua-ID-Abschluss akzeptiert denselben wirklich hinzugefügten Handle mit erst nach Commit lesbarer Kennung", () => {
  execute(`${delayedKeywordIdentifierFixture}
    local catalog = delayedIdentifierCatalog()
    catalog.delayedKeywordVisibility = true
    local photo = catalog:photo({}, { dateTimeOriginal = 20271223 })
    local addedHandle, committedKeywordWrites, committedRevision
    catalog.afterWriteCommit = function(self)
      self.afterWriteCommit = nil
      addedHandle = photo.keywords["Dezember (FN Zeit)"]
      assert(addedHandle == self.keywords[addedHandle.name] and addedHandle.localIdentifier ~= nil)
      committedKeywordWrites, committedRevision = photo.keywordWrites, dataRevision
    end
    local result = Location.execute(catalog, { photo }, "update")
    assert(result.changedPhotoCount == 1 and photo.keywords[addedHandle.name] == addedHandle)
    assertStoredKeywordIdentifiers(photo, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
    assert(photo.keywordWrites == committedKeywordWrites and dataRevision == committedRevision)
    local before = photoWriteSnapshot(photo)
    local repeated = Location.execute(catalog, { photo }, "update")
    assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 1)
    assertPhotoUnchanged(photo, before)
  `);
});

for (const delayedMetadata of [false, true]) {
test(`Lua-FN-Abgleich übernimmt die native MOV-Änderung November/2025 nach Dezember/2027 trotz alter In-Gate-Stichwortsicht${delayedMetadata ? " und FN-Metadatensicht" : ""}`, () => {
  execute(`${delayedKeywordIdentifierFixture}
    local taxon = assignmentTaxon()
    local packageStatus = { packageId = "package", masterVersion = "master", correctionRevision = "revision" }
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return packageStatus end,
      request = function() return { taxa = { taxon }, searchPackage = packageStatus } end,
    } end
    ${maintenanceModule}
    local Writer, Maintenance = require "KeywordWriter", require "CatalogMaintenance"
    local catalog = catalogFixture()
    local movie = catalog:photo({}, { isVideo = true, fileFormat = "VIDEO",
      dateTimeDigitized = 20251123, dateTime = 20261014 })
    Writer.assign(catalog, { movie }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })
    assert(movie.values.fnCaptureMonth == "November" and movie.values.fnCaptureYear == "2025")
    movie.raw.dateTimeDigitized = 20271223
    catalog.delayedKeywordVisibility = true
    catalog.delayKeywordIdentifiers = true
    catalog.delayedMetadataVisibility = ${delayedMetadata}
    catalog.delayKeywordNames = ${delayedMetadata}
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    local first = Maintenance.applyUpdate(catalog, state)
    assert(first.status == "complete" and first.failedPhotoCount == 0,
      "Native MOV reproduction: " .. table.concat(first.errors or {}, "; "))
    assert(first.updatedTaxonomyPhotoCount == 0 and first.updatedLocationTimePhotoCount == 1)
    assert(movie.values.fnCaptureMonth == "Dezember" and movie.values.fnCaptureYear == "2027")
    assertStoredKeywordIdentifiers(movie, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
    assertStoredKeywordIdentifiers(movie, "taxonomyKeywordIds", Writer.hasManagedKeywordSuffix)
    local before = photoWriteSnapshot(movie)
    local repeated = Maintenance.applyUpdate(catalog, state)
    assert(repeated.failedPhotoCount == 0 and repeated.updatedTaxonomyPhotoCount == 0
      and repeated.updatedLocationTimePhotoCount == 0)
    assertPhotoUnchanged(movie, before)
  `);
});
}

test("Lua-ID-Abschluss schützt bei verzögerten FN-Lesewerten ein unberührtes Favoritenfeld gegen Änderungen nach Commit", () => {
  execute(`${delayedKeywordIdentifierFixture}
    local catalog = delayedIdentifierCatalog()
    catalog.delayedMetadataVisibility = true
    catalog.delayedKeywordVisibility = true
    local photo = catalog:photo({ referenceImage = "no" }, { dateTimeOriginal = 20271223 })
    local afterMutation
    catalog.afterWriteCommit = function(self)
      self.afterWriteCommit = nil
      photo.values.referenceImage = "yes"
      afterMutation = photoWriteSnapshot(photo)
    end
    local ok, result = pcall(function() return Location.execute(catalog, { photo }, "update") end)
    assert(afterMutation and not ok, "A field outside the actual write set must remain protected")
    assert(catalog.writes == 1, "A foreign FN change must stop before writing internal IDs")
    assertPhotoUnchanged(photo, afterMutation)
  `);
});

test("Lua-ID-Abschluss bindet bei verzögerter Stichwortsicht auch sofortige Taxonomie-IDs neben verzögerten Zeit-IDs", () => {
  execute(`${delayedKeywordIdentifierFixture}
    local Writer = require "KeywordWriter"
    local catalog = delayedIdentifierCatalog()
    local photo = catalog:photo({}, { dateTimeOriginal = 20271223 })
    local taxon = assignmentTaxon()
    for position, name in ipairs(Writer.identityTemplate(taxon).names) do
      catalog.keywords[name] = { name = name, localIdentifier = "existing-taxonomy-" .. tostring(position),
        getName = function(self) return self.name end }
    end
    catalog.delayedKeywordVisibility = true
    local ok, result = pcall(function()
      return Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })
    end)
    assert(ok, "The complete planned taxonomy must be retained beside delayed location/time IDs: " .. tostring(result))
    assertStoredKeywordIdentifiers(photo, "taxonomyKeywordIds", Writer.hasManagedKeywordSuffix)
    assertStoredKeywordIdentifiers(photo, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
    local before = photoWriteSnapshot(photo)
    local repeated = Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })
    assert(repeated.updatedTaxonomyPhotoCount == 0 and repeated.updatedLocationTimePhotoCount == 0)
    assertPhotoUnchanged(photo, before)
  `);
});

for (const path of ["Ort/Zeit", "Taxonomie"]) {
  test(`Lua-ID-Abschluss wartet bei ${path} auf nach Commit verfügbare Namen neuer Stichwortobjekte`, () => {
    execute(`${delayedKeywordIdentifierFixture}
      local Writer = require "KeywordWriter"
      local catalog = delayedIdentifierCatalog()
      catalog.delayKeywordNames = true
      local photo = catalog:photo({}, { dateTimeOriginal = 20271223 })
      local taxon = assignmentTaxon()
      local ok, result = pcall(function()
        ${path === "Ort/Zeit"
          ? 'return Location.execute(catalog, { photo }, "update")'
          : 'return Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })'}
      end)
      assert(ok, "An unfinished new keyword name must be read after commit: " .. tostring(result))
      assertStoredKeywordIdentifiers(photo, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
      ${path === "Taxonomie" ? 'assertStoredKeywordIdentifiers(photo, "taxonomyKeywordIds", Writer.hasManagedKeywordSuffix)' : ""}
      local before = photoWriteSnapshot(photo)
      local repeated = ${path === "Ort/Zeit"
        ? 'Location.execute(catalog, { photo }, "update")'
        : 'Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })'}
      ${path === "Ort/Zeit"
        ? 'assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 1)'
        : 'assert(repeated.updatedTaxonomyPhotoCount == 0 and repeated.updatedLocationTimePhotoCount == 0)'}
      assertPhotoUnchanged(photo, before)
    `);
  });
}

for (const path of ["Ort/Zeit", "Taxonomie"]) {
  for (const delayed of [false, true]) {
    test(`Lua-ID-Abschluss erhält vorhandene Großschreibungsvarianten bei ${path} mit ${delayed ? "verzögerten" : "sofortigen"} neuen Kennungen`, () => {
      execute(`${delayedKeywordIdentifierFixture}
        local Writer = require "KeywordWriter"
        local catalog = catalogFixture()
        catalog.delayKeywordIdentifiers = ${delayed}
        catalog.caseInsensitiveKeywordLookup = true
        local photo = catalog:photo({}, { dateTimeOriginal = 20251123 })
        local existingMonth = { name = "${path === "Ort/Zeit" ? "november" : "November"} (FN Zeit)", localIdentifier = "existing-month",
          getName = function(self) return self.name end }
        catalog.keywords[existingMonth.name] = existingMonth
        local taxon = assignmentTaxon()
        local existingTaxonomy
        ${path === "Taxonomie" ? `
          local firstName = Writer.identityTemplate(taxon).names[1]
          local variant = string.lower(string.sub(firstName, 1, #firstName - 5)) .. " (FN)"
          assert(variant ~= firstName, "The existing taxonomy keyword must differ in case")
          existingTaxonomy = { name = variant, localIdentifier = "existing-taxonomy",
            getName = function(self) return self.name end }
          catalog.keywords[variant] = existingTaxonomy
        ` : ""}
        local ok, result = pcall(function()
          ${path === "Ort/Zeit"
            ? 'return Location.execute(catalog, { photo }, "update")'
            : 'return Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })'}
        end)
        assert(ok, "An existing reserved keyword returned in another case must remain assignable: " .. tostring(result))
        assert(photo.keywords[existingMonth.name] == existingMonth)
        assert(photo.values.fnCaptureMonth == "November" and photo.values.fnCaptureYear == "2025")
        assertStoredKeywordIdentifiers(photo, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
        ${path === "Taxonomie" ? `
          assert(photo.keywords[existingTaxonomy.name] == existingTaxonomy)
          assertStoredKeywordIdentifiers(photo, "taxonomyKeywordIds", Writer.hasManagedKeywordSuffix)
        ` : ""}
        local before = photoWriteSnapshot(photo)
        local repeated = ${path === "Ort/Zeit"
          ? 'Location.execute(catalog, { photo }, "update")'
          : 'Writer.assign(catalog, { photo }, taxon, nil, { skipUnchanged = true, locationTimeMode = "update" })'}
        ${path === "Ort/Zeit"
          ? 'assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 1)'
          : 'assert(repeated.updatedTaxonomyPhotoCount == 0 and repeated.updatedLocationTimePhotoCount == 0)'}
        assertPhotoUnchanged(photo, before)
      `);
    });
  }
}

for (const path of ["Ort/Zeit", "Taxonomie"]) {
  for (const mutation of ["uuid", "fn-field", "real-keyword"]) {
    test(`Lua-ID-Abschluss überschreibt bei ${path} nach Commit geänderte ${mutation} nicht`, () => {
      execute(`${delayedKeywordIdentifierFixture}
        local Writer = require "KeywordWriter"
        local catalog = delayedIdentifierCatalog()
        local photo = catalog:photo({}, { dateTimeOriginal = 20251123 })
        local afterMutation
        catalog.afterWriteCommit = function(self)
          self.afterWriteCommit = nil
          mutateAfterCommit(photo, "${mutation}")
          afterMutation = photoWriteSnapshot(photo)
        end
        local ok, result = pcall(function()
          ${path === "Ort/Zeit"
            ? 'return Location.execute(catalog, { photo }, "update")'
            : 'return Writer.assign(catalog, { photo }, assignmentTaxon(), nil, { skipUnchanged = true, locationTimeMode = "update" })'}
        end)
        assert(afterMutation, "The post-commit race must actually occur")
        assert(not ok, "A changed post-commit assignment must not be reported as successfully finalized")
        assertPhotoUnchanged(photo, afterMutation)
      `);
    });
  }
}

for (const mutation of ["uuid", "fn-field", "real-keyword"]) {
  test(`Lua-ID-Abschluss prüft ${mutation} erneut im zweiten Schreibzugriff`, () => {
    execute(`${delayedKeywordIdentifierFixture}
      local catalog = delayedIdentifierCatalog()
      local photo = catalog:photo({}, { dateTimeOriginal = 20251123 })
      local afterMutation
      catalog.beforeWriteAccess = function(self)
        if self.writes == 1 then
          self.beforeWriteAccess = nil
          mutateAfterCommit(photo, "${mutation}")
          afterMutation = photoWriteSnapshot(photo)
        end
      end
      local ok, result = pcall(function() return Location.execute(catalog, { photo }, "update") end)
      assert(afterMutation, "The second-gate race must actually occur")
      assert(not ok, "A changed second-gate assignment must not be reported as successfully finalized")
      assertPhotoUnchanged(photo, afterMutation)
    `);
  });
}

for (const path of ["Ort/Zeit", "Taxonomie"]) {
  for (const blocked of ["Schreibzugriff belegt", "Kennungen weiterhin unlesbar"]) {
    test(`Lua-ID-Abschluss meldet ${path} bei ${blocked} nicht erfolgreich`, () => {
      execute(`${delayedKeywordIdentifierFixture}
        local Writer = require "KeywordWriter"
        local catalog = delayedIdentifierCatalog()
        local photo = catalog:photo({}, { dateTimeOriginal = 20251123 })
        catalog.keepKeywordIdentifiersPending = ${blocked === "Kennungen weiterhin unlesbar"}
        local afterFirstCommit
        catalog.afterWriteCommit = function(self)
          self.afterWriteCommit = nil
          ${blocked === "Schreibzugriff belegt" ? "self.busy = true" : ""}
          afterFirstCommit = photoWriteSnapshot(photo)
        end
        local ok, message = pcall(function()
          ${path === "Ort/Zeit"
            ? 'return Location.execute(catalog, { photo }, "update")'
            : 'return Writer.assign(catalog, { photo }, assignmentTaxon(), nil, { skipUnchanged = true, locationTimeMode = "update" })'}
        end)
        assert(afterFirstCommit, "The initial real assignment must have committed")
        assert(not ok, "Incomplete internal identifiers must not be reported as a completed assignment")
        assertPhotoUnchanged(photo, afterFirstCommit)
        assert(photo.values.fnCaptureMonth == "November" and photo.values.fnCaptureYear == "2025")
        assert(photo.keywords["November (FN Zeit)"] and photo.keywords["2025 (FN Zeit)"])
      `);
    });
  }
  test(`Lua-ID-Abschluss braucht bei ${path} mit sofort lesbaren Kennungen keinen Zusatzschreibzugriff`, () => {
    execute(`${delayedKeywordIdentifierFixture}
      local Writer = require "KeywordWriter"
      local catalog = catalogFixture()
      local photo = catalog:photo({}, { dateTimeOriginal = 20251123 })
      ${path === "Ort/Zeit"
        ? 'Location.execute(catalog, { photo }, "update")'
        : 'Writer.assign(catalog, { photo }, assignmentTaxon(), nil, { skipUnchanged = true, locationTimeMode = "update" })'}
      assertStoredKeywordIdentifiers(photo, "locationTimeKeywordIds", Location.hasManagedKeywordSuffix)
      ${path === "Taxonomie" ? 'assertStoredKeywordIdentifiers(photo, "taxonomyKeywordIds", Writer.hasManagedKeywordSuffix)' : ""}
      assert(catalog.writes == 1 and dataRevision == 1)
    `);
  });
}

test("Lua-Ortsvorbereitung trennt ungelöstes GPS, vorhandene FN-Orte und fehlendes GPS ohne Orte zu erfinden", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local stored = catalog:photo({ fnCountry = "Deutschland" }, { gps = { latitude = 50, longitude = 10 }, dateTimeOriginal = 20260312 })
    local unresolved = catalog:photo({}, { gps = { latitude = 51, longitude = 11 }, dateTimeOriginal = 20260412 })
    local noGps = catalog:photo({ fnCaptureYear = "2025" })
    require("LocationSuggestionReader").resolve = function(photos)
      suggestionReads = suggestionReads + 1
      assert(#photos == 1 and photos[1] == unresolved)
      return { valuesByPhoto = {}, canceled = false }
    end
    local plans, preparation = Location.prepare(catalog, catalog.photos, { resolveSuggestedLocations = true })
    assert(preparation.suggestedLocationPhotoCount == 1 and preparation.unresolvedSuggestedLocationPhotoCount == 1)
    local result = Location.execute(catalog, catalog.photos, "update", {}, plans)
    assert(result.gpsWithoutStoredLocationPhotoCount == 1 and result.missingGpsAndLocationPhotoCount == 1)
    assert(result.missingTimePhotoCount == 1 and stored.values.fnCountry == "Deutschland")
    assert(unresolved.values.fnCountry == "" and unresolved.values.fnCaptureMonth == "April")
    assert(noGps.values.fnCaptureYear == "2025" and noGps.values.fnCaptureMonth == "")
  `);
});

test("Lua-Ortsvorschläge ohne exportierte Adressfelder sind ergebnislos, keine Exportfehler", () => {
  execute(`${suggestionReaderFixture}
    local catalog = catalogFixture()
    local photo = catalog:photo({}, { gps = { latitude = 51, longitude = 11 }, dateTimeOriginal = 20260412 })
    exportCases[photo] = {}
    local plans, preparation = Location.prepare(catalog, { photo }, { resolveSuggestedLocations = true })
    assert(preparation.unresolvedSuggestedLocationPhotoCount == 1)
    assert(preparation.failedSuggestedLocationPhotoCount == 0)
    assert(exportStarts == 1 and exportReleases == 1 and catalog.writes == 0)
    assert(plans[1].values.fnCountry == "" and plans[1].values.fnCaptureMonth == "April")
  `);
});

test("Lua-Ortsvorschläge zählen echte Render- und Lesefehler getrennt von fehlenden Adressfeldern", () => {
  execute(`${suggestionReaderFixture}
    local catalog = catalogFixture()
    local render = catalog:photo({}, { gps = { latitude = 51, longitude = 11 }, dateTimeOriginal = 20260312 })
    local read = catalog:photo({}, { gps = { latitude = 52, longitude = 12 }, dateTimeOriginal = 20260412 })
    exportCases[render] = { renderError = "Original nicht lesbar" }
    exportCases[read] = { readError = "Vorschaudatei nicht lesbar" }
    local plans, preparation = Location.prepare(catalog, catalog.photos, { resolveSuggestedLocations = true })
    assert(preparation.unresolvedSuggestedLocationPhotoCount == 0,
      "Failed renditions must not be counted as missing address suggestions")
    assert(preparation.failedSuggestedLocationPhotoCount == 2)
    assert(exportPhotoCount == 2 and exportReleases == 1 and catalog.writes == 0)
    assert(plans[1].values.fnCountry == "" and plans[2].values.fnCountry == "")
    Location.execute(catalog, catalog.photos, "update", {}, plans)
    assert(render.values.fnCaptureMonth == "März" and read.values.fnCaptureMonth == "April")
  `);
});

test("Lua-Ortsvorschläge übernehmen reale XMP-Felder, bekannte FN-Orte benötigen keinen Vorschau-Export", () => {
  execute(`${suggestionReaderFixture}
    local catalog = catalogFixture()
    local stored = catalog:photo({ fnCountry = "Deutschland" }, { gps = { latitude = 50, longitude = 10 } })
    local suggested = catalog:photo({}, { gps = { latitude = 51, longitude = 11 }, dateTimeOriginal = 20260412 })
    exportCases[suggested] = { data = '<x:xmpmeta photoshop:Country="Deutschland" photoshop:City="Netzen" Iptc4xmpCore:CountryCode="DE" />' }
    local plans, preparation = Location.prepare(catalog, catalog.photos, { resolveSuggestedLocations = true })
    assert(exportPhotoCount == 1 and preparation.suggestedLocationPhotoCount == 1)
    assert(preparation.unresolvedSuggestedLocationPhotoCount == 0 and preparation.failedSuggestedLocationPhotoCount == 0)
    assert(plans[1].values.fnCountry == "Deutschland" and plans[2].values.fnCity == "Netzen")
    Location.execute(catalog, catalog.photos, "update", {}, plans)
    assert(stored.values.fnCountry == "Deutschland" and suggested.values.fnIsoCountryCode == "DE")
    Location.prepare(catalog, catalog.photos, { resolveSuggestedLocations = true })
    assert(exportStarts == 1, "Known effective FN locations must not be exported again")
  `);
});

test("Lua-Katalogabschluss trennt Vorschaufehler, ergebnislose GPS-Vorschläge und FN-Schreibfehler", () => {
  execute(`${suggestionReaderFixture}
    package.preload.TaxonomyHelper = function() return {
      searchPackageStatus = function() return {} end,
      request = function() error("This location-only fixture must not request taxa") end,
    } end
    ${maintenanceModule}
    local Maintenance = require "CatalogMaintenance"
    local catalog = catalogFixture()
    local photos = {}
    for index = 1, 4 do
      photos[index] = catalog:photo({ fnCaptureYear = "2025" },
        { gps = { latitude = 50 + index, longitude = 10 }, dateTimeOriginal = 20260412 })
    end
    exportCases[photos[1]] = {}
    exportCases[photos[2]] = { renderError = "Original nicht lesbar" }
    exportCases[photos[3]] = { readError = "Vorschaudatei nicht lesbar" }
    exportCases[photos[4]] = { data = '<x:xmpmeta photoshop:Country="Deutschland" />' }
    local state = Maintenance.resolveTaxonomyGroups(Maintenance.scanCatalog(catalog))
    local result = Maintenance.applyUpdate(catalog, state)
    assert(result.status == "complete" and result.failedPhotoCount == 0)
    assert(result.unresolvedSuggestedLocationPhotoCount == 1, "Only the successful empty rendition is unresolved")
    assert(result.failedSuggestedLocationPhotoCount == 2 and result.updatedLocationTimePhotoCount == 4)
    assert(photos[2].values.fnCaptureMonth == "April" and photos[3].values.fnCaptureMonth == "April")
    local message = Maintenance.completionText(state, result)
    assert(string.find(message, "FN-Daten konnten nicht geschrieben werden: 0 Fotos", 1, true))
    assert(string.find(message, "Ortsvorschläge konnten nicht exportiert oder gelesen werden: 2 Fotos", 1, true))
    assert(string.find(message, "GPS vorhanden, aber Lightroom lieferte keine nutzbaren Ortsvorschläge: 1 Fotos", 1, true))
    catalog.busy = true
    local blocked = Maintenance.applyUpdate(catalog, state)
    assert(blocked.failedPhotoCount == 4 and blocked.failedSuggestedLocationPhotoCount == 2)
    local blockedMessage = Maintenance.completionText(state, blocked)
    assert(string.find(blockedMessage, "FN-Daten konnten nicht geschrieben werden: 4 Fotos", 1, true))
    assert(string.find(blockedMessage, "Ortsvorschläge konnten nicht exportiert oder gelesen werden: 2 Fotos", 1, true))
  `);
});

test("Lua-Ort/Zeit-Menü zeigt ergebnislose GPS-Vorschläge und Render-/Lesefehler getrennt an", () => {
  execute(`${suggestionReaderFixture}
    package.preload.LocationTimeMenu = function() ${locationTimeMenuSource} end
    local Menu = require "LocationTimeMenu"
    local catalog = catalogFixture()
    local photos = {}
    for index = 1, 5 do photos[index] = catalog:photo(index == 4 and { fnCountry = "Deutschland" } or {},
      { gps = { latitude = 50 + index, longitude = 10 }, dateTimeOriginal = 20260412 }) end
    exportCases[photos[1]] = {}
    exportCases[photos[2]] = { renderError = "Original nicht lesbar" }
    exportCases[photos[3]] = { readError = "Vorschaudatei nicht lesbar" }
    exportCases[photos[5]] = { data = '<x:xmpmeta photoshop:Country="Frankreich" />' }
    local message
    sdk.LrDialogs.confirm = function() return "ok" end
    sdk.LrDialogs.message = function(_, value) message = value end
    local result = Menu.runForPhotos(catalog, photos, "update")
    assert(result.unresolvedSuggestedLocationPhotoCount == 1)
    assert(result.failedSuggestedLocationPhotoCount == 2)
    assert(exportPhotoCount == 4 and photos[4].values.fnCountry == "Deutschland")
    assert(photos[5].values.fnCountry == "Frankreich" and photos[2].values.fnCaptureMonth == "April")
    assert(string.find(message, "Das Foto enthält GPS-Koordinaten, Lightroom lieferte dafür aber keine exportierbaren Ortsvorschläge.", 1, true))
    assert(string.find(message, "Für 2 Fotos konnten die Ortsvorschläge nicht exportiert oder gelesen werden.", 1, true))
    assert(not string.find(message, "3 Fotos enthalten GPS-Koordinaten", 1, true))
  `);
});

test("Lua-Ort/Zeit-Menü bezeichnet einen Exportfehler niemals als fehlenden Lightroom-Ortsvorschlag", () => {
  execute(`${suggestionReaderFixture}
    package.preload.LocationTimeMenu = function() ${locationTimeMenuSource} end
    local catalog = catalogFixture()
    local photo = catalog:photo({}, { gps = { latitude = 51, longitude = 10 }, dateTimeOriginal = 20260312 })
    exportCases[photo] = { renderError = "Original nicht lesbar" }
    local message
    sdk.LrDialogs.confirm = function() return "ok" end
    sdk.LrDialogs.message = function(_, value) message = value end
    local result = require("LocationTimeMenu").runForPhotos(catalog, { photo }, "add")
    assert(result.failedSuggestedLocationPhotoCount == 1 and result.unresolvedSuggestedLocationPhotoCount == 0)
    assert(string.find(message, "Für 1 Foto konnten die Ortsvorschläge nicht exportiert oder gelesen werden.", 1, true))
    assert(not string.find(message, "keine exportierbaren Ortsvorschläge", 1, true))
    assert(not string.find(message, "Adressvorschläge beim Export", 1, true))
    assert(photo.values.fnCaptureMonth == "März" and photo.values.fnCountry == "")
  `);
});

test("Lua-Ort/Zeit-Menü meldet vorhandene FN-Orte ohne neuen Export oder fälschlichen Vorschlagshinweis", () => {
  execute(`${suggestionReaderFixture}
    package.preload.LocationTimeMenu = function() ${locationTimeMenuSource} end
    local catalog = catalogFixture()
    local photo = catalog:photo({ fnCountry = "Deutschland" },
      { gps = { latitude = 51, longitude = 10 }, dateTimeOriginal = 20260312 })
    local message
    sdk.LrDialogs.confirm = function() return "ok" end
    sdk.LrDialogs.message = function(_, value) message = value end
    local Menu = require "LocationTimeMenu"
    for _, mode in ipairs({ "add", "update" }) do
      local result = Menu.runForPhotos(catalog, { photo }, mode)
      assert(result.failedSuggestedLocationPhotoCount == 0 and result.unresolvedSuggestedLocationPhotoCount == 0)
      assert(not string.find(message, "Ortsvorschläge", 1, true))
      assert(photo.values.fnCountry == "Deutschland" and photo.values.fnCaptureMonth == "März")
    end
    assert(exportStarts == 0 and exportPhotoCount == 0)
  `);
});

test("Lua-Ort/Zeit-Menü weist März und April auch dem verborgenen Mitglied eines ausgewählten Ordnerstapels zu", () => {
  execute(`${suggestionReaderFixture}
    package.preload.LocationTimeMenu = function() ${locationTimeMenuSource} end
    local catalog = catalogFixture()
    local top = catalog:photo({}, { dateTimeOriginal = 20260412,
      isInStackInFolder = true, stackInFolderIsCollapsed = true, stackPositionInFolder = 1 })
    local hidden = catalog:photo({}, { dateTimeOriginal = 20260312 })
    top.raw.stackInFolderMembers = { top, hidden }
    catalog.selected = { top }
    catalog.getActiveSources = function() return { { type = function() return "LrFolder" end } } end
    sdk.LrApplication.activeCatalog = function() return catalog end
    sdk.LrTasks.startAsyncTask = function(callback) callback() end
    local message, confirmations = nil, 0
    sdk.LrDialogs.confirm = function(_, explanation)
      confirmations = confirmations + 1
      assert(string.find(explanation, "2 ausgewählte Fotos", 1, true)); return "ok"
    end
    sdk.LrDialogs.message = function(_, value) message = value end
    require("LocationTimeMenu").run("add")
    assert(confirmations == 1 and string.find(message, "2 Fotos wurden geändert.", 1, true))
    assert(top.values.fnCaptureMonth == "April" and top.keywords["April (FN Zeit)"])
    assert(hidden.values.fnCaptureMonth == "März" and hidden.keywords["März (FN Zeit)"])
    assert(top.values.fnCaptureYear == "2026" and hidden.values.fnCaptureYear == "2026")
    assert(exportStarts == 0 and catalog.allReads == 0)
  `);
});

test("Lua-Ort/Zeit lässt Fotos ohne verwertbare Daten bei wiederholtem Hinzufügen und Aktualisieren unangetastet", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local photo = catalog:photo()
    local user = { name = "Urlaub", localIdentifier = "user", getName = function(self) return self.name end }
    photo.keywords.Urlaub = user
    for _, mode in ipairs({ "add", "update", "add", "update" }) do
      local result = Location.execute(catalog, { photo }, mode)
      assert(result.changedPhotoCount == 0 and result.skippedPhotoCount == 1 and result.missingDataPhotoCount == 1)
      assert(result.missingTimePhotoCount == 1 and result.missingGpsAndLocationPhotoCount == 1)
      assert((photo.metadataWrites or 0) == 0 and (photo.keywordWrites or 0) == 0 and dataRevision == 0)
      assert(photo.keywords.Urlaub == user and next(photo.values) == nil)
    end
  `);
});

test("Lua-Ort/Zeit bewahrt einen allein vorhandenen ISO-Ländercode und erkennt danach unveränderte Zuordnungen", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local photo = catalog:photo({ fnIsoCountryCode = "DE" })
    local result = Location.execute(catalog, { photo }, "add")
    assert(photo.values.fnIsoCountryCode == "DE" and photo.values.locationTimeAssignedAt ~= "")
    assert(result.changedPhotoCount == 1 and result.missingDataPhotoCount == 0 and result.missingLocationPhotoCount == 0)
    assert(result.addedKeywordCount == 0 and result.removedKeywordCount == 0 and dataRevision == 1)
    assert(next(photo.keywords) == nil)
    local writes = photo.metadataWrites
    for _, mode in ipairs({ "add", "update" }) do
      local repeated = Location.execute(catalog, { photo }, mode)
      assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 1)
      assert(photo.values.fnIsoCountryCode == "DE" and photo.metadataWrites == writes and dataRevision == 1)
      assert((photo.keywordWrites or 0) == 0)
    end
  `);
});

test("Lua-Ort/Zeit zählt die Bereinigung verwaister interner Belege als Änderung und schreibt sie nur einmal", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local photo = catalog:photo({ locationTimeKeywordIds = "17", locationTimeKeywordNames = "März (FN Zeit)", locationTimeAssignedAt = "alt" })
    local result = Location.execute(catalog, { photo }, "update")
    assert(result.changedPhotoCount == 1 and result.missingDataPhotoCount == 1 and dataRevision == 1)
    assert(photo.values.locationTimeKeywordIds == "" and photo.values.locationTimeKeywordNames == "" and photo.values.locationTimeAssignedAt == "")
    local writes = photo.metadataWrites
    local repeated = Location.execute(catalog, { photo }, "update")
    assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 1 and repeated.missingDataPhotoCount == 1)
    assert(photo.metadataWrites == writes and dataRevision == 1 and (photo.keywordWrites or 0) == 0)
  `);
});

test("Lua-Ort/Zeit zählt die Entfernung eines verwaisten FN-Stichworts und erhält manuelle Stichwörter", () => {
  execute(`${fixture}
    local catalog = catalogFixture()
    local photo = catalog:photo()
    photo.keywords["März (FN Zeit)"] = { name = "März (FN Zeit)", localIdentifier = "17", getName = function(self) return self.name end }
    local user = { name = "Urlaub", localIdentifier = "user", getName = function(self) return self.name end }
    photo.keywords.Urlaub = user
    local result = Location.execute(catalog, { photo }, "update")
    assert(result.changedPhotoCount == 1 and result.removedKeywordCount == 1 and dataRevision == 1)
    assert(not photo.keywords["März (FN Zeit)"] and photo.keywords.Urlaub == user)
    local writes, keywords = photo.metadataWrites, photo.keywordWrites
    local repeated = Location.execute(catalog, { photo }, "update")
    assert(repeated.changedPhotoCount == 0 and repeated.skippedPhotoCount == 1 and repeated.removedKeywordCount == 0)
    assert(photo.metadataWrites == writes and photo.keywordWrites == keywords and dataRevision == 1)
  `);
});
