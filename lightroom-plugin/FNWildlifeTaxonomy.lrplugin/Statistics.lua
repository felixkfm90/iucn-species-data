local PluginState = require "PluginState"

local Statistics = {}

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

local function countKeys(values)
  local count = 0
  for _ in pairs(values) do
    count = count + 1
  end
  return count
end

local function topSpecies(speciesCounts, speciesNames)
  local rows = {}
  for masterTaxonId, photoCount in pairs(speciesCounts) do
    table.insert(rows, {
      masterTaxonId = masterTaxonId,
      name = speciesNames[masterTaxonId] or masterTaxonId,
      photoCount = photoCount,
    })
  end
  table.sort(rows, function(left, right)
    if left.photoCount == right.photoCount then
      return left.name < right.name
    end
    return left.photoCount > right.photoCount
  end)
  local result = {}
  for index = 1, math.min(10, #rows) do
    table.insert(result, rows[index])
  end
  return result
end

function Statistics.scan(catalog, progress)
  local photos = catalog:getAllPhotos()
  local species = {}
  local families = {}
  local genera = {}
  local classes = {}
  local speciesCounts = {}
  local speciesNames = {}
  local referenceCounts = {}
  local assignedPhotos = 0

  catalog:withReadAccessDo(function()
    for index, photo in ipairs(photos) do
      local masterTaxonId = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
      if masterTaxonId ~= "" then
        assignedPhotos = assignedPhotos + 1
        species[masterTaxonId] = true
        speciesCounts[masterTaxonId] = (speciesCounts[masterTaxonId] or 0) + 1
        local germanName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "germanName"))
        local scientificName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "scientificName"))
        speciesNames[masterTaxonId] = germanName ~= "" and germanName or scientificName

        local family = cleanText(photo:getPropertyForPlugin(_PLUGIN, "taxonomyFamily"))
        local genus = cleanText(photo:getPropertyForPlugin(_PLUGIN, "taxonomyGenus"))
        local className = cleanText(photo:getPropertyForPlugin(_PLUGIN, "taxonomyClass"))
        if family ~= "" then families[family] = true end
        if genus ~= "" then genera[genus] = true end
        if className ~= "" then classes[className] = true end
        if cleanText(photo:getPropertyForPlugin(_PLUGIN, "referenceImage")) == "yes" then
          referenceCounts[masterTaxonId] = (referenceCounts[masterTaxonId] or 0) + 1
        end
      end
      if progress and (index % 100 == 0 or index == #photos) then
        progress(index, #photos)
      end
    end
  end)

  local references = 0
  local missingReferences = 0
  local duplicateReferences = 0
  for masterTaxonId in pairs(species) do
    local count = referenceCounts[masterTaxonId] or 0
    references = references + count
    if count == 0 then
      missingReferences = missingReferences + 1
    elseif count > 1 then
      duplicateReferences = duplicateReferences + 1
    end
  end

  local result = {
    totalPhotos = #photos,
    assignedPhotos = assignedPhotos,
    unassignedPhotos = #photos - assignedPhotos,
    speciesCount = countKeys(species),
    familyCount = countKeys(families),
    genusCount = countKeys(genera),
    classCount = countKeys(classes),
    referenceImageCount = references,
    speciesWithoutReference = missingReferences,
    speciesWithMultipleReferences = duplicateReferences,
    topSpecies = topSpecies(speciesCounts, speciesNames),
  }
  PluginState.saveStatisticsCache(catalog, result)
  return result
end

function Statistics.load(catalog, forceRefresh, progress)
  local totalPhotos = #(catalog:getAllPhotos())
  if not forceRefresh then
    local cached = PluginState.statisticsCache(catalog, totalPhotos)
    if cached then
      return cached, true
    end
  end
  return Statistics.scan(catalog, progress), false
end

return Statistics
