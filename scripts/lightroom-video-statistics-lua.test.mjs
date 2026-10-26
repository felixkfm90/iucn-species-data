import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const pluginRoot = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const names = ["TaxonomyRanks", "Json", "StatisticsIndex", "PluginState", "Statistics"];
const modules = (await Promise.all(names.map(async name =>
  `package.preload["${name}"] = function()\n${await readFile(new URL(`${name}.lua`, pluginRoot), "utf8")}\nend`))).join("\n");
const windowSource = await readFile(new URL("ShowStatistics.lua", pluginRoot), "utf8");

function execute(body) {
  const script = `${fixture}\n${body}`;
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  try {
    let status = lauxlib.luaL_loadstring(state, to_luastring(script));
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
    status = lua.lua_pcall(state, 0, 0, 0);
    const message = status === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1);
    const line = Number(/\]:(\d+):/.exec(message)?.[1]);
    assert.equal(status, lua.LUA_OK, `${message}\n${script.split("\n")[line - 1] || ""}`);
  } finally { lua.lua_close(state); }
}

// The real Lua index, persistence, reader and export formatters run against an
// in-memory SDK double. No Lightroom process, catalog or local data is opened.
const fixture = `
_PLUGIN = {}
local inRead, inWrite = false, false
local exports = {}
local sdk = {
  LrDate = { timestampToComponents = function() return 2025, 11, 23, 10, 0, 0 end },
  LrPathUtils = { leafName = function(path) return string.match(path, "[^/\\\\]+$") or path end },
  LrPrefs = { prefsForPlugin = function() return {} end },
  LrApplication = {}, LrBinding = {}, LrFunctionContext = {},
  LrDialogs = { message = function() end },
  LrTasks = { startAsyncTask = function() end, yield = function() assert(not inRead and not inWrite) end },
  LrView = { bind = function(key) return key end },
}
function import(name) return assert(sdk[name], name) end
package.preload.ExportFile = function() return {
  choosePath = function(_, _, name) return name, false end,
  write = function(path, _, callback)
    local chunks = {}
    callback({ write = function(_, ...) for _, text in ipairs({...}) do table.insert(chunks, text) end end })
    exports[path] = table.concat(chunks)
  end,
} end
${modules}
package.preload.ShowStatistics = function()
${windowSource}
return { exportLifelist = exportLifelist, exportObservationList = exportObservationList,
  exportSpeciesText = exportSpeciesText }
end
local Stats, Index, State, Json = require "Statistics", require "StatisticsIndex", require "PluginState", require "Json"
local function clone(value)
  if type(value) ~= "table" then return value end
  local result = {}; for key, item in pairs(value) do result[key] = clone(item) end; return result
end
local function same(left, right, label)
  label = label or "value"
  assert(type(left) == type(right), label .. ": type changed")
  if type(left) ~= "table" then assert(left == right, label .. ": value changed"); return end
  for key, item in pairs(left) do same(item, right[key], label .. "." .. tostring(key)) end
  for key in pairs(right) do assert(left[key] ~= nil, label .. ": extra key") end
end
local function catalogFixture()
  local catalog = { photos = {}, values = {}, writes = 0, batches = 0, allReads = 0 }
  function catalog:getPath() return "D:/Owned-video-statistics/Test.lrcat" end
  function catalog:getAllPhotos()
    self.allReads = self.allReads + 1
    if self.forbidAllReads then error("Unexpected full catalog enumeration") end
    local result = {}; for _, photo in ipairs(self.photos) do table.insert(result, photo) end; return result
  end
  function catalog:getTargetPhoto() return self.selected and self.selected[1] end
  function catalog:getTargetPhotos() return self.selected or self.photos end
  function catalog:getPropertyForPlugin(_, key) return self.values[key] end
  function catalog:setPropertyForPlugin(_, key, value) assert(inWrite); self.values[key] = value end
  function catalog:withPrivateWriteAccessDo(callback, options)
    assert(not inRead and not inWrite and options.timeout == 10)
    inWrite = true; self.writes = self.writes + 1
    local ok, result = pcall(callback); inWrite = false; if not ok then error(result) end
  end
  function catalog:withReadAccessDo(callback)
    assert(not inRead and not inWrite); inRead = true
    local ok, result = pcall(callback); inRead = false; if not ok then error(result) end
  end
  function catalog:batchGetPropertyForPlugin(photos)
    assert(inRead); self.batches = self.batches + 1
    local result = {}; for _, photo in ipairs(photos) do result[photo] = clone(photo.values) end; return result
  end
  function catalog:batchGetRawMetadata(photos, keys)
    assert(inRead)
    local result = {}; for _, photo in ipairs(photos) do
      local values = {}; for _, key in ipairs(keys) do values[key] = photo.raw[key] end; result[photo] = values
    end; return result
  end
  function catalog:photo(masterId, video, path)
    local photo = { localIdentifier = #self.photos + 1, keywords = { "Existing manual keyword" },
      raw = { isVideo = video == true, path = path or "D:/Photo.ARW", dateTimeOriginal = 123,
        uuid = "uuid-" .. tostring(#self.photos + 1) },
      values = { masterTaxonId = masterId or "", germanName = masterId or "", scientificName = masterId or "",
        taxonomyClass = "Aves", taxonomyFamily = "Family", taxonomyGenus = "Genus",
        taxonomyKingdom = "Animalia", fnCountry = "Deutschland", fnLocation = "Fotoort",
        fnCaptureYear = "2025", fnCaptureMonth = "11", referenceImage = "yes" } }
    function photo:getRawMetadata(key) return self.raw[key] end
    function photo:getPropertyForPlugin(_, key) return self.values[key] end
    function photo:setPropertyForPlugin() error("Statistics must not change photo metadata") end
    function photo:addKeyword() error("Statistics must not add keywords") end
    function photo:removeKeyword() error("Statistics must not remove keywords") end
    table.insert(self.photos, photo); return photo
  end
  return catalog
end
local function mixedCatalog()
  local catalog = catalogFixture()
  local photo = catalog:photo("mtx_photo", false, "D:/This-is-a-photo.MOV")
  local sharedVideo = catalog:photo("mtx_photo", true, "D:/This-is-a-video.ARW")
  local uniqueVideo = catalog:photo("mtx_video_only", true, "D:/Unique-video.MOV")
  local unassignedPhoto = catalog:photo(nil, false)
  return catalog, photo, sharedVideo, uniqueVideo, unassignedPhoto
end
`;

test("Lua-Statistik zählt im gemischten Katalog ausschließlich SDK-Fotos, auch bei irreführenden Dateiendungen", () => {
  execute(`
    local catalog, photo, sharedVideo, uniqueVideo = mixedCatalog()
    local before = {}; for _, item in ipairs(catalog.photos) do
      before[item] = { values = clone(item.values), raw = clone(item.raw), keywords = clone(item.keywords) }
    end
    local built = Stats.build(catalog, { restart = true })
    assert(built.status == "complete")
    local result = built.statistics
    assert(result.totalPhotos == 2 and result.assignedPhotos == 1 and result.unassignedPhotos == 1)
    assert(result.speciesCount == 1 and result.lifelist[1].masterTaxonId == "mtx_photo")
    assert(result.lifelist[1].photoCount == 1 and result.referenceImageCount == 1)
    assert(#result.classBreakdown == 1 and result.classBreakdown[1].photoCount == 1)
    assert(#result.observationRows == 1 and result.observationRows[1].photoCount == 1)
    assert(result.observationRows[1].exampleFileName == "This-is-a-photo.MOV")
    assert(result.locationTime.photoCount == 2 and result.taxonomyLocationTime.photoCount == 1)
    local refs = State.referenceImageUuids(catalog, "mtx_photo")
    assert(#refs == 1 and refs[1] == photo.raw.uuid)
    local videoRefs = State.referenceImageUuids(catalog, "mtx_video_only")
    assert(#videoRefs == 0)
    for item, expected in pairs(before) do same(expected, { values = item.values, raw = item.raw, keywords = item.keywords }) end
  `);
});

test("Lua-Auswahlstatistik mit ausschließlich Videos enthält weder Fotos, Arten, Orte, Zeiten noch Beobachtungen", () => {
  execute(`
    local catalog = catalogFixture()
    local video = catalog:photo("mtx_video", true)
    local catalogResult = Stats.build(catalog, { restart = true }).statistics
    assert(catalogResult.totalPhotos == 0 and catalogResult.assignedPhotos == 0 and catalogResult.speciesCount == 0)
    catalog.writes, catalog.allReads, catalog.values = 0, 0, {}
    catalog.forbidAllReads = true
    local result = Stats.forPhotos(catalog, { video }).statistics
    assert(result.totalPhotos == 0 and result.assignedPhotos == 0 and result.unassignedPhotos == 0)
    assert(result.speciesCount == 0 and result.referenceImageCount == 0)
    assert(result.locationTime.photoCount == 0 and result.taxonomyLocationTime.photoCount == 0)
    assert(#result.lifelist == 0 and #result.classBreakdown == 0 and #result.observationRows == 0)
    assert(catalog.writes == 0 and next(catalog.values) == nil and catalog.allReads == 0)
  `);
});

test("Lua-Auswahlstatistik Foto plus Videos entspricht exakt der reinen Fotoauswahl ohne Katalogscan", () => {
  execute(`
    local catalog, photo, sharedVideo, uniqueVideo = mixedCatalog()
    catalog.forbidAllReads = true
    local photoOnly = Stats.forPhotos(catalog, { photo }).statistics
    local mixed = Stats.forPhotos(catalog, { photo, sharedVideo, uniqueVideo }).statistics
    same(photoOnly, mixed)
    assert(catalog.allReads == 0 and catalog.writes == 0)
  `);
});

test("Lua-Index ignoriert Video-Snapshots vor allen Aggregaten und bewahrt Statistik bei Hinzufügen und Entfernen", () => {
  execute(`
    local catalog, photo, video = mixedCatalog()
    local index = Index.new(1)
    Index.add(index, Stats.photoSnapshot(photo))
    local before = clone(index)
    local snapshot = Stats.photoSnapshot(video)
    assert(snapshot.isVideo == true)
    Index.add(index, snapshot); same(before, index)
    Index.remove(index, snapshot); same(before, index)
  `);
});

test("Lua-Statistik übernimmt isVideo in Taxonomie-, Ort/Zeit-, Leer- und Favoritendeltas", () => {
  execute(`
    local catalog, photo, video = mixedCatalog()
    Stats.build(catalog, { restart = true })
    local before = Stats.photoSnapshot(video)
    local taxon = { masterTaxonId = "mtx_new_video", germanName = "Nur im Video", acceptedScientificName = "Video taxon" }
    local afterValues = {
      Stats.assignmentSnapshot(taxon, { class = "Aves" }, true, before.photoUuid, before, false),
      Stats.emptySnapshot(before),
      Stats.locationTimeSnapshot(before, { fnCountry = "Videoland", fnCaptureYear = "2026", fnCaptureMonth = "10" }),
      Stats.referenceSnapshot(before, false),
    }
    for _, after in ipairs(afterValues) do
      assert(after.isVideo == true)
      local old = Stats.load(catalog)
      catalog:withPrivateWriteAccessDo(function() assert(State.applyStatisticsPhotoChanges(catalog, { before }, { after })) end,
        { timeout = 10 })
      local current = Stats.load(catalog)
      old.generatedAt, current.generatedAt = nil, nil
      same(old, current)
    end
    -- Complete FN removal supplies an empty after snapshot, without adding a photo.
    local old = Stats.load(catalog)
    catalog:withPrivateWriteAccessDo(function() State.applyStatisticsPhotoChanges(catalog, { before }, { Stats.emptySnapshot() }) end,
      { timeout = 10 })
    local current = Stats.load(catalog); old.generatedAt, current.generatedAt = nil, nil; same(old, current)
  `);
});

test("Lua-Indexschema verwirft alte komplette Statistik und Favoritenpool ohne Fotoänderungen", () => {
  execute(`
    local catalog, photo, video = mixedCatalog()
    local old = Index.new(#catalog.photos)
    old.schemaVersion = 6; old.status = "complete"
    old.species.mtx_video_only = { referenceImageCount = 1, referenceImageUuids = { [video.raw.uuid] = true } }
    catalog.values.statisticsIndexV1 = Json.encode(old)
    local value, valid, reason = Stats.load(catalog)
    assert(value == nil and valid == false and reason == "missing")
    local refs, referenceReason = State.referenceImageUuids(catalog, "mtx_video_only")
    assert(refs == nil and referenceReason == "missing")
    assert(catalog.writes == 0 and catalog.values.statisticsIndexV1 == Json.encode(old))
  `);
});

test("Lua-Aufbau setzt alten Schema-6-Pausenstand mit Videozahlen vollständig neu auf", () => {
  execute(`
    local catalog = mixedCatalog()
    local old = Index.new(#catalog.photos)
    old.schemaVersion = 6; old.assignedPhotos = 999
    catalog.values.statisticsBuildV1 = Json.encode({ schemaVersion = 6, totalPhotos = #catalog.photos,
      dataRevision = 0, processedPhotos = #catalog.photos, lastPhotoId = 999, index = old })
    local result = Stats.build(catalog)
    assert(result.status == "complete" and result.statistics.totalPhotos == 2)
    assert(result.statistics.assignedPhotos == 1 and result.statistics.speciesCount == 1)
    assert(catalog.values.statisticsBuildV1 == nil)
    local index = Json.decode(catalog.values.statisticsIndexV1)
    assert(index.schemaVersion == 7)
  `);
});

test("Lua-Pause und Fortsetzung zählen Videos blockweise genau einmal und bewahren den Katalogumfangsschutz", () => {
  execute(`
    local catalog = catalogFixture()
    for number = 1, 503 do catalog:photo("mtx_photo", number == 2 or number == 501) end
    local paused = Stats.build(catalog, { progress = function(done) if done == 500 then return "pause" end end })
    assert(paused.status == "paused" and paused.processedPhotos == 500)
    local build = Json.decode(catalog.values.statisticsBuildV1)
    assert(build.totalPhotos == 503 and build.index.videoCount == 1)
    local resumed = Stats.build(catalog)
    assert(resumed.status == "complete" and resumed.statistics.totalPhotos == 501)
    assert(resumed.statistics.assignedPhotos == 501 and resumed.statistics.lifelist[1].photoCount == 501)
    local batchReads = catalog.batches
    local loaded, valid = Stats.load(catalog)
    assert(valid and loaded.totalPhotos == 501)
    assert(catalog.batches == batchReads, "Opening a saved index must not re-read all isVideo metadata")
    catalog:photo("mtx_new_video", true)
    local stale, staleValid, reason = Stats.load(catalog)
    assert(stale == nil and staleValid == false and reason == "catalog-changed")
  `);
});

test("Lua-Katalog- und Auswahlexporte enthalten keine ausschließlich im Video vorhandene Art oder Videodatei", () => {
  execute(`
    local catalog, photo, sharedVideo, uniqueVideo = mixedCatalog()
    local window = require "ShowStatistics"
    local results = { Stats.build(catalog, { restart = true }).statistics,
      Stats.forPhotos(catalog, { photo, sharedVideo, uniqueVideo }).statistics }
    for _, statistics in ipairs(results) do
      window.exportLifelist(statistics); window.exportObservationList(statistics); window.exportSpeciesText(statistics)
      assert(string.find(exports["Lifelist.csv"], "mtx_photo", 1, true))
      assert(not string.find(exports["Lifelist.csv"], "mtx_video_only", 1, true))
      assert(not string.find(exports["Beobachtungsliste.csv"], "mtx_video_only", 1, true))
      assert(not string.find(exports["Beobachtungsliste.csv"], "This-is-a-video.ARW", 1, true))
      assert(not string.find(exports["Artenliste.txt"], "mtx_video_only", 1, true))
    end
  `);
});

test("Lua-Auswahlexporte ausschließlich von Videos erzeugen nur leere Listen und Foto-/Artenzahl null", () => {
  execute(`
    local catalog = catalogFixture()
    local video = catalog:photo("mtx_video_only", true, "D:/Unique-video.MOV")
    local statistics = Stats.forPhotos(catalog, { video }).statistics
    local window = require "ShowStatistics"
    window.exportLifelist(statistics); window.exportObservationList(statistics); window.exportSpeciesText(statistics)
    assert(not string.find(exports["Lifelist.csv"], "mtx_video_only", 1, true))
    assert(not string.find(exports["Beobachtungsliste.csv"], "Unique-video.MOV", 1, true))
    assert(string.find(exports["Artenliste.txt"], "Gesamt: 0 Arten", 1, true))
    assert(string.find(exports["Artenliste.txt"], "0 Fotos", 1, true))
    assert(catalog.writes == 0)
  `);
});
