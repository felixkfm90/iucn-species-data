local LrPrefs = import "LrPrefs"

local Json = require "Json"
local StatisticsIndex = require "StatisticsIndex"

local PluginState = {}
local prefs = LrPrefs.prefsForPlugin()
local STATISTICS_INDEX_FIELD = "statisticsIndexV1"
local STATISTICS_BUILD_FIELD = "statisticsBuildV1"
local STATISTICS_REVISION_FIELD = "statisticsRevisionV1"
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

function PluginState.selectedPhotos(catalog)
  -- Ohne aktives Foto liefert getTargetPhotos den unmarkierten Filmstreifen.
  -- Jede Auswahlaktion bindet ausschließlich tatsächlich markierte Fotos.
  if not catalog:getTargetPhoto() then return {} end
  local selected, seen = {}, {}
  for _, photo in ipairs(catalog:getTargetPhotos() or {}) do
    if not seen[photo] then
      seen[photo] = true
      table.insert(selected, photo)
    end
  end
  return selected
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

function PluginState.statisticsRevision(catalog)
  return tonumber(catalog:getPropertyForPlugin(_PLUGIN, STATISTICS_REVISION_FIELD) or 0) or 0
end

local function writeCatalogValues(catalog, values, clearFields, expectedRevision)
  local completed = false
  catalog:withPrivateWriteAccessDo(function()
    if expectedRevision ~= nil and PluginState.statisticsRevision(catalog) ~= expectedRevision then
      error("FN-Daten wurden während des Statistikaufbaus geändert. Bitte Statistik neu aufbauen; der bisherige Index bleibt erhalten.", 0)
    end
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
    or tonumber(build.dataRevision or -1) ~= PluginState.statisticsRevision(catalog)
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
  }, nil, build.dataRevision)
end

function PluginState.saveStatisticsIndex(catalog, index)
  index.status = "complete"
  index.catalogPath = catalogKey(catalog)
  index.generatedAt = os.date("%d.%m.%Y, %H:%M")
  writeCatalogValues(catalog, {
    [STATISTICS_INDEX_FIELD] = Json.encode(index),
  }, { STATISTICS_BUILD_FIELD }, index.dataRevision)
end

function PluginState.applyStatisticsPhotoChanges(catalog, beforeSnapshots, afterSnapshots)
  -- Ein pausierter oder gleichzeitig laufender Aufbau hat ältere Fotowerte.
  -- Er darf sie nach einer eigenen FN-Aktion nicht als aktuell veröffentlichen.
  local revision = PluginState.statisticsRevision(catalog) + 1
  catalog:setPropertyForPlugin(_PLUGIN, STATISTICS_REVISION_FIELD, revision)
  catalog:setPropertyForPlugin(_PLUGIN, STATISTICS_BUILD_FIELD, nil)
  local index = decodeCatalogValue(catalog, STATISTICS_INDEX_FIELD)
  if not StatisticsIndex.isValid(index) or index.status ~= "complete" then
    return false
  end
  StatisticsIndex.applyChanges(index, beforeSnapshots, afterSnapshots)
  index.dataRevision = revision
  index.generatedAt = os.date("%d.%m.%Y, %H:%M")
  catalog:setPropertyForPlugin(_PLUGIN, STATISTICS_INDEX_FIELD, Json.encode(index))
  return true
end

function PluginState.referenceImageUuids(catalog, masterTaxonId)
  local index = decodeCatalogValue(catalog, STATISTICS_INDEX_FIELD)
  if not StatisticsIndex.isValid(index) or index.status ~= "complete" then
    return nil, "missing"
  end
  local speciesEntry = index.species[cleanText(masterTaxonId)]
  if not speciesEntry then
    return {}, nil
  end
  if type(speciesEntry.referenceImageUuids) ~= "table" then
    return nil, "outdated"
  end
  local uuids = {}
  for uuid, active in pairs(speciesEntry.referenceImageUuids) do
    if active and cleanText(uuid) ~= "" then
      table.insert(uuids, cleanText(uuid))
    end
  end
  if (tonumber(speciesEntry.referenceImageCount or 0) or 0) > #uuids then
    return nil, "incomplete"
  end
  table.sort(uuids)
  return uuids, nil
end

return PluginState
