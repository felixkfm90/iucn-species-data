local PluginState = require "PluginState"

local ReferenceImage = {}

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

function ReferenceImage.assign(catalog, photo)
  local masterTaxonId = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
  if masterTaxonId == "" then
    error("Das ausgewählte Foto besitzt noch keine Taxonomiezuordnung.")
  end

  local matchingPhotos = {}
  catalog:withReadAccessDo(function()
    for _, candidate in ipairs(catalog:getAllPhotos()) do
      if cleanText(candidate:getPropertyForPlugin(_PLUGIN, "masterTaxonId")) == masterTaxonId then
        table.insert(matchingPhotos, candidate)
      end
    end
  end)

  catalog:withWriteAccessDo("Favoritenbild der Art markieren", function()
    for _, candidate in ipairs(matchingPhotos) do
      candidate:setPropertyForPlugin(
        _PLUGIN,
        "referenceImage",
        candidate == photo and "yes" or "no"
      )
    end
  end)
  PluginState.markStatisticsDirty()

  return {
    masterTaxonId = masterTaxonId,
    germanName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "germanName")),
    scientificName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "scientificName")),
    affectedPhotos = #matchingPhotos,
  }
end

return ReferenceImage
