import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const pluginRoot = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const moduleNames = ["TaxonomyRanks", "StatisticsIndex", "Statistics", "LocationTimeWriter", "KeywordWriter", "ExportFile"];
const modules = (await Promise.all(moduleNames.map(async (name) =>
  `package.preload["${name}"] = function()\n${await readFile(new URL(`${name}.lua`, pluginRoot), "utf8")}\nend`))).join("\n");
const statisticsWindow = await readFile(new URL("ShowStatistics.lua", pluginRoot), "utf8");
const statisticsExportWindowModule = `package.preload.ShowStatistics = function()
  ${statisticsWindow}
  return { chooseExport = chooseExport, selectionStatistics = selectionStatistics,
    exportStatistics = exportStatistics, showDashboard = showDashboard,
    exportLifelist = exportLifelist, exportObservationList = exportObservationList,
    exportSpeciesText = exportSpeciesText }
end`;
const maintenanceSource = await readFile(new URL("CatalogMaintenance.lua", pluginRoot), "utf8");
const maintenanceModule = `package.preload.CatalogMaintenance = function()
  ${maintenanceSource.replace(/return CatalogMaintenance\s*$/, "return { scanCatalog = scanCatalog, resolveTaxonomyGroups = resolveTaxonomyGroups, applyUpdate = applyUpdate }")}
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
local loadedIndex, savedBuild, deltaWrites, suggestionReads = nil, nil, 0, 0
package.preload.PluginState = function() return {
  statisticsIndex = function(_, total)
    if loadedIndex and loadedIndex.totalPhotos == total then return loadedIndex end
    return nil, "missing"
  end,
  statisticsBuild = function() return savedBuild end,
  saveStatisticsBuild = function(_, value) savedBuild = value end,
  saveStatisticsIndex = function(_, value) loadedIndex = value; savedBuild = nil end,
  applyStatisticsPhotoChanges = function(_, before, after)
    assert(inWrite); deltaWrites = deltaWrites + 1
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
    local keyword = { name = name, localIdentifier = tostring(self.nextKeywordId or 1) }
    self.nextKeywordId = (self.nextKeywordId or 1) + 1
    function keyword:getName() return self.name end
    self.keywords[name] = keyword; return keyword
  end
  function catalog:getKeywordByLocalIdentifier(id)
    for _, keyword in pairs(self.keywords) do if keyword.localIdentifier == id then return keyword end end
  end
  function catalog:withWriteAccessDo(_, callback, options)
    assert(not inWrite and not inRead and options.timeout == 10)
    if self.busy then return "aborted" end
    local backups = {}; for _, photo in ipairs(self.photos) do
      backups[photo] = { values = clone(photo.values), keywords = clone(photo.keywords) }
    end
    self.currentKeywordCalls = {}; self.writes = self.writes + 1; inWrite = true
    local ok, err = pcall(callback); inWrite = false
    if not ok then
      for photo, before in pairs(backups) do photo.values = before.values; photo.keywords = before.keywords end
      error(err)
    end
    return "executed"
  end
  function catalog:photo(values, raw, formatted)
    local photo = { values = clone(values or {}), raw = clone(raw or {}), formatted = clone(formatted or {}),
      keywords = {}, localIdentifier = #self.photos + 1 }
    photo.raw.uuid = photo.raw.uuid or ("uuid-" .. tostring(photo.localIdentifier))
    function photo:getPropertyForPlugin(_, field) return self.values[field] end
    function photo:setPropertyForPlugin(_, field, value) assert(inWrite); self.values[field] = value end
    function photo:getRawMetadata(field)
      if field == "keywords" then local list = {}; for _, keyword in pairs(self.keywords) do table.insert(list, keyword) end; return list end
      return self.raw[field]
    end
    function photo:getFormattedMetadata(field)
      if field == "keywordTags" then
        local names = {}; for name in pairs(self.keywords) do table.insert(names, name) end
        return table.concat(names, ", ")
      end
      return self.formatted[field] or ""
    end
    function photo:addKeyword(keyword) assert(inWrite); self.keywords[keyword.name] = keyword end
    function photo:removeKeyword(keyword) assert(inWrite); self.keywords[keyword.name] = nil end
    table.insert(self.photos, photo); return photo
  end
  return catalog
end
`;

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
    local catalog = catalogFixture(); catalog.forbidAllReads = true
    local index = Index.new(1); Index.add(index, Index.snapshot({ masterTaxonId = "mtx_a", germanName = "Rebhuhn" }))
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
    assert(catalog.allReads == 1 and catalog.batches == 0 and catalog.writes == 0)
    sdk.LrTasks.startAsyncTask = function() end
    ${statisticsExportWindowModule}
    local view = require "ShowStatistics"
    sdk.LrDialogs.presentModalDialog = function()
      assert(activeProps.exportScope == "selection"); return "cancel"
    end
    assert(view.chooseExport(catalog, false) == nil and catalog.targetReads == nil)
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
    assert(completed.status == "complete" and completed.updatedTaxonomyPhotoCount == 1 and completed.updatedLocationTimePhotoCount == 1)
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
    assert(continued.status == "complete" and continued.updatedTaxonomyPhotoCount == 501 and catalog.writes == 4)
    local after = Index.result(loadedIndex)
    local repeated = Maintenance.applyUpdate(catalog, state)
    assert(repeated.status == "complete" and repeated.updatedTaxonomyPhotoCount == 501 and catalog.writes == 7)
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
