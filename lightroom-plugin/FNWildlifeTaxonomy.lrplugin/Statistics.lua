local PluginState = require "PluginState"
local TaxonomyRanks = require "TaxonomyRanks"

local Statistics = {}
local cleanText = TaxonomyRanks.cleanText
local READ_CHUNK_SIZE = 500

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

local function classRows(classPhotoCounts, classSpecies)
  local rows = {}
  for className, photoCount in pairs(classPhotoCounts) do
    table.insert(rows, {
      name = className,
      photoCount = photoCount,
      speciesCount = countKeys(classSpecies[className] or {}),
    })
  end
  table.sort(rows, function(left, right)
    if left.photoCount == right.photoCount then
      return left.name < right.name
    end
    return left.photoCount > right.photoCount
  end)
  return rows
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
  local classPhotoCounts = {}
  local classSpecies = {}
  local assignedPhotos = 0

  local function processPhoto(index)
    local photo = photos[index]
    if photo then
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
        if className ~= "" then
          classes[className] = true
          classPhotoCounts[className] = (classPhotoCounts[className] or 0) + 1
          classSpecies[className] = classSpecies[className] or {}
          classSpecies[className][masterTaxonId] = true
        end
        if cleanText(photo:getPropertyForPlugin(_PLUGIN, "referenceImage")) == "yes" then
          referenceCounts[masterTaxonId] = (referenceCounts[masterTaxonId] or 0) + 1
        end
      end
    end
  end

  for chunkStart = 1, #photos, READ_CHUNK_SIZE do
    local chunkEnd = math.min(chunkStart + READ_CHUNK_SIZE - 1, #photos)
    catalog:withReadAccessDo(function()
      for index = chunkStart, chunkEnd do
        processPhoto(index)
      end
    end)
    -- Yield und Fortschrittsanzeige liegen bewusst außerhalb von
    -- withReadAccessDo. Lightroom erlaubt kein Yield innerhalb dieses
    -- SDK-Callbacks.
    if progress then
      progress(chunkEnd, #photos)
    end
  end

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
    classBreakdown = classRows(classPhotoCounts, classSpecies),
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
