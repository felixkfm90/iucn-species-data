local LrPrefs = import "LrPrefs"

local Json = require "Json"
local StatisticsIndex = require "StatisticsIndex"

local PluginState = {}
local prefs = LrPrefs.prefsForPlugin()
local STATISTICS_INDEX_FIELD = "statisticsIndexV1"
local STATISTICS_BUILD_FIELD = "statisticsBuildV1"
local WRITE_ACCESS_TIMEOUT_SECONDS = 10

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

local function decodeTable(value)
  if type(value) ~= "string" or value == "" then
    return nil
  end
  local ok, result = pcall(Json.decode, value)
  if ok and type(result) == "table" then
    return result
  end
  return nil
end

local function catalogKey(catalog)
  local ok, path = pcall(function()
    return catalog:getPath()
  end)
  if ok and path then
    return tostring(path)
  end
  return "unbekannter-katalog"
end

function PluginState.recentTaxa()
  return decodeTable(prefs.recentTaxaJson) or {}
end

function PluginState.addRecentTaxon(taxon)
  local id = cleanText(taxon.masterTaxonId)
  if id == "" then
    return
  end

  local recent = PluginState.recentTaxa()
  local updated = {
    {
      masterTaxonId = id,
      germanName = cleanText(taxon.germanName),
      englishName = cleanText(taxon.englishName),
      acceptedScientificName = cleanText(taxon.acceptedScientificName),
    },
  }
  for _, entry in ipairs(recent) do
    if cleanText(entry.masterTaxonId) ~= id and #updated < 10 then
      table.insert(updated, entry)
    end
  end
  prefs.recentTaxaJson = Json.encode(updated)
end

local function decodeCatalogValue(catalog, field)
  return decodeTable(catalog:getPropertyForPlugin(_PLUGIN, field))
end

local function writeCatalogValues(catalog, values, clearFields)
  local completed = false
  catalog:withPrivateWriteAccessDo(function()
    for field, value in pairs(values) do
      catalog:setPropertyForPlugin(_PLUGIN, field, value)
    end
    for _, field in ipairs(clearFields or {}) do
      catalog:setPropertyForPlugin(_PLUGIN, field, nil)
    end
    completed = true
  end, { timeout = WRITE_ACCESS_TIMEOUT_SECONDS })
  if not completed then
    error(
      "Lightroom konnte den Statistikindex nicht innerhalb von "
        .. tostring(WRITE_ACCESS_TIMEOUT_SECONDS)
        .. " Sekunden speichern.",
      0
    )
  end
end

function PluginState.statisticsIndex(catalog, totalPhotos)
  local index = decodeCatalogValue(catalog, STATISTICS_INDEX_FIELD)
  if not StatisticsIndex.isValid(index) or index.status ~= "complete" then
    return nil, "missing"
  end
  if tonumber(index.totalPhotos or -1) ~= tonumber(totalPhotos or -2) then
    return nil, "catalog-changed"
  end
  return index, nil
end

function PluginState.statisticsBuild(catalog, totalPhotos)
  local build = decodeCatalogValue(catalog, STATISTICS_BUILD_FIELD)
  if type(build) ~= "table"
    or tonumber(build.schemaVersion) ~= StatisticsIndex.SCHEMA_VERSION
    or tonumber(build.totalPhotos or -1) ~= tonumber(totalPhotos or -2)
    or not StatisticsIndex.isValid(build.index)
  then
    return nil
  end
  return build
end

function PluginState.saveStatisticsBuild(catalog, build)
  build.catalogPath = catalogKey(catalog)
  writeCatalogValues(catalog, {
    [STATISTICS_BUILD_FIELD] = Json.encode(build),
  })
end

function PluginState.saveStatisticsIndex(catalog, index)
  index.status = "complete"
  index.catalogPath = catalogKey(catalog)
  index.generatedAt = os.date("%d.%m.%Y, %H:%M")
  writeCatalogValues(catalog, {
    [STATISTICS_INDEX_FIELD] = Json.encode(index),
  }, { STATISTICS_BUILD_FIELD })
end

function PluginState.applyStatisticsPhotoChanges(catalog, beforeSnapshots, afterSnapshots)
  local index = decodeCatalogValue(catalog, STATISTICS_INDEX_FIELD)
  if not StatisticsIndex.isValid(index) or index.status ~= "complete" then
    return false
  end
  StatisticsIndex.applyChanges(index, beforeSnapshots, afterSnapshots)
  index.generatedAt = os.date("%d.%m.%Y, %H:%M")
  catalog:setPropertyForPlugin(_PLUGIN, STATISTICS_INDEX_FIELD, Json.encode(index))
  return true
end

return PluginState
