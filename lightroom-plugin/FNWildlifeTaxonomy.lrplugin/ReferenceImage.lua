local PluginState = require "PluginState"
local Statistics = require "Statistics"

local ReferenceImage = {}

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

function ReferenceImage.findExisting(catalog, photo)
  local masterTaxonId = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
  if masterTaxonId == "" then
    return nil, {}, nil
  end

  local referenceUuids, indexError = PluginState.referenceImageUuids(catalog, masterTaxonId)
  if not referenceUuids then
    return nil, nil, indexError
  end

  local selectedUuid = cleanText(photo:getRawMetadata("uuid"))
  local existingPhotos = {}
  for _, uuid in ipairs(referenceUuids) do
    if uuid ~= selectedUuid then
      local candidate = catalog:findPhotoByUuid(uuid)
      if not candidate
        or cleanText(candidate:getPropertyForPlugin(_PLUGIN, "masterTaxonId")) ~= masterTaxonId
        or cleanText(candidate:getPropertyForPlugin(_PLUGIN, "referenceImage")) ~= "yes"
      then
        return nil, nil, "stale"
      end
      table.insert(existingPhotos, candidate)
    end
  end
  return existingPhotos[1], existingPhotos, nil
end

function ReferenceImage.assign(catalog, photo, existingPhotos)
  local masterTaxonId = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
  if masterTaxonId == "" then
    error("Das ausgewählte Foto besitzt noch keine Taxonomiezuordnung.")
  end

  if not existingPhotos then
    local _, foundPhotos, indexError = ReferenceImage.findExisting(catalog, photo)
    if not foundPhotos then
      error("Der Statistikindex ist für Art-Favoriten nicht verwendbar: " .. tostring(indexError), 0)
    end
    existingPhotos = foundPhotos
  end

  -- Nur das neue Foto und tatsächlich vorhandene bisherige Favoriten müssen
  -- geschrieben werden. Die bisherigen Favoriten wurden beim globalen
  -- Statistikaufbau per persistenter Lightroom-Foto-UUID indiziert.
  local affectedPhotos = { photo }
  for _, existingPhoto in ipairs(existingPhotos) do
    table.insert(affectedPhotos, existingPhoto)
  end

  local beforeStatistics = {}
  for index, candidate in ipairs(affectedPhotos) do
    beforeStatistics[index] = Statistics.photoSnapshot(candidate)
  end

  local completed = false
  catalog:withWriteAccessDo("Favoritenbild der Art markieren", function()
    for _, candidate in ipairs(affectedPhotos) do
      candidate:setPropertyForPlugin(
        _PLUGIN,
        "referenceImage",
        candidate == photo and "yes" or "no"
      )
    end
    local afterStatistics = {}
    for index, candidate in ipairs(affectedPhotos) do
      afterStatistics[index] = Statistics.referenceSnapshot(
        beforeStatistics[index],
        candidate == photo
      )
    end
    PluginState.applyStatisticsPhotoChanges(catalog, beforeStatistics, afterStatistics)
    completed = true
  end)

  if not completed or cleanText(photo:getPropertyForPlugin(_PLUGIN, "referenceImage")) ~= "yes" then
    error("Lightroom hat das ausgewählte Foto nicht als Art-Favorit gespeichert.", 0)
  end

  return {
    masterTaxonId = masterTaxonId,
    germanName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "germanName")),
    scientificName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "scientificName")),
    affectedPhotos = #affectedPhotos,
  }
end

return ReferenceImage
