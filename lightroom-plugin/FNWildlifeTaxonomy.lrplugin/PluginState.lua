local LrPrefs = import "LrPrefs"

local Json = require "Json"

local PluginState = {}
local prefs = LrPrefs.prefsForPlugin()

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

function PluginState.markStatisticsDirty()
  prefs.statisticsDirty = true
end

function PluginState.statisticsCache(catalog, totalPhotos)
  if prefs.statisticsDirty == true then
    return nil
  end
  local cache = decodeTable(prefs.statisticsCacheJson)
  if not cache then
    return nil
  end
  if cache.catalogPath ~= catalogKey(catalog) then
    return nil
  end
  if tonumber(cache.totalPhotos or -1) ~= tonumber(totalPhotos or -2) then
    return nil
  end
  return cache
end

function PluginState.saveStatisticsCache(catalog, statistics)
  statistics.catalogPath = catalogKey(catalog)
  statistics.generatedAt = os.date("%d.%m.%Y, %H:%M")
  prefs.statisticsCacheJson = Json.encode(statistics)
  prefs.statisticsDirty = false
end

return PluginState
