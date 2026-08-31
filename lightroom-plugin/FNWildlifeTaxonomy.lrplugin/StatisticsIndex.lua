local TaxonomyRanks = require "TaxonomyRanks"

local StatisticsIndex = {}
local cleanText = TaxonomyRanks.cleanText

StatisticsIndex.SCHEMA_VERSION = 1

local function countKeys(values)
  local count = 0
  for _ in pairs(values or {}) do
    count = count + 1
  end
  return count
end

local function increment(values, key, amount)
  key = cleanText(key)
  if key == "" then
    return
  end
  local nextValue = (tonumber(values[key] or 0) or 0) + amount
  if nextValue > 0 then
    values[key] = nextValue
  else
    values[key] = nil
  end
end

local function displayName(entry)
  local germanName = cleanText(entry and entry.germanName)
  if germanName ~= "" then
    return germanName
  end
  local scientificName = cleanText(entry and entry.scientificName)
  return scientificName ~= "" and scientificName or cleanText(entry and entry.masterTaxonId)
end

local function sortSpecies(left, right)
  local leftName = string.lower(displayName(left))
  local rightName = string.lower(displayName(right))
  if leftName == rightName then
    return cleanText(left.scientificName) < cleanText(right.scientificName)
  end
  return leftName < rightName
end

function StatisticsIndex.new(totalPhotos)
  return {
    schemaVersion = StatisticsIndex.SCHEMA_VERSION,
    status = "building",
    totalPhotos = tonumber(totalPhotos or 0) or 0,
    assignedPhotos = 0,
    species = {},
    families = {},
    genera = {},
    classes = {},
  }
end

function StatisticsIndex.isValid(index)
  return type(index) == "table"
    and tonumber(index.schemaVersion) == StatisticsIndex.SCHEMA_VERSION
    and type(index.species) == "table"
    and type(index.families) == "table"
    and type(index.genera) == "table"
    and type(index.classes) == "table"
end

function StatisticsIndex.snapshot(values)
  values = values or {}
  return {
    masterTaxonId = cleanText(values.masterTaxonId),
    germanName = cleanText(values.germanName),
    scientificName = cleanText(values.scientificName),
    family = cleanText(values.taxonomyFamily),
    genus = cleanText(values.taxonomyGenus),
    className = cleanText(values.taxonomyClass),
    referenceImage = cleanText(values.referenceImage) == "yes",
  }
end

function StatisticsIndex.photoSnapshot(photo)
  return StatisticsIndex.snapshot({
    masterTaxonId = photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"),
    germanName = photo:getPropertyForPlugin(_PLUGIN, "germanName"),
    scientificName = photo:getPropertyForPlugin(_PLUGIN, "scientificName"),
    taxonomyFamily = photo:getPropertyForPlugin(_PLUGIN, "taxonomyFamily"),
    taxonomyGenus = photo:getPropertyForPlugin(_PLUGIN, "taxonomyGenus"),
    taxonomyClass = photo:getPropertyForPlugin(_PLUGIN, "taxonomyClass"),
    referenceImage = photo:getPropertyForPlugin(_PLUGIN, "referenceImage"),
  })
end

function StatisticsIndex.add(index, snapshot)
  local masterTaxonId = cleanText(snapshot and snapshot.masterTaxonId)
  if masterTaxonId == "" then
    return
  end
  index.assignedPhotos = (tonumber(index.assignedPhotos or 0) or 0) + 1
  increment(index.families, snapshot.family, 1)
  increment(index.genera, snapshot.genus, 1)

  local className = cleanText(snapshot.className)
  if className == "" then
    className = "Unbekannt"
  end
  local classEntry = index.classes[className]
  if not classEntry then
    classEntry = { photoCount = 0, species = {} }
    index.classes[className] = classEntry
  end
  classEntry.photoCount = (tonumber(classEntry.photoCount or 0) or 0) + 1
  increment(classEntry.species, masterTaxonId, 1)

  local speciesEntry = index.species[masterTaxonId]
  if not speciesEntry then
    speciesEntry = {
      masterTaxonId = masterTaxonId,
      germanName = "",
      scientificName = "",
      className = className,
      family = "",
      genus = "",
      photoCount = 0,
      referenceImageCount = 0,
    }
    index.species[masterTaxonId] = speciesEntry
  end
  if cleanText(snapshot.germanName) ~= "" then
    speciesEntry.germanName = cleanText(snapshot.germanName)
  end
  if cleanText(snapshot.scientificName) ~= "" then
    speciesEntry.scientificName = cleanText(snapshot.scientificName)
  end
  speciesEntry.className = className
  speciesEntry.family = cleanText(snapshot.family)
  speciesEntry.genus = cleanText(snapshot.genus)
  speciesEntry.photoCount = (tonumber(speciesEntry.photoCount or 0) or 0) + 1
  if snapshot.referenceImage then
    speciesEntry.referenceImageCount = (tonumber(speciesEntry.referenceImageCount or 0) or 0) + 1
  end
end

function StatisticsIndex.remove(index, snapshot)
  local masterTaxonId = cleanText(snapshot and snapshot.masterTaxonId)
  if masterTaxonId == "" then
    return
  end
  index.assignedPhotos = math.max((tonumber(index.assignedPhotos or 0) or 0) - 1, 0)
  increment(index.families, snapshot.family, -1)
  increment(index.genera, snapshot.genus, -1)

  local className = cleanText(snapshot.className)
  if className == "" then
    className = "Unbekannt"
  end
  local classEntry = index.classes[className]
  if classEntry then
    classEntry.photoCount = math.max((tonumber(classEntry.photoCount or 0) or 0) - 1, 0)
    increment(classEntry.species, masterTaxonId, -1)
    if classEntry.photoCount == 0 then
      index.classes[className] = nil
    end
  end

  local speciesEntry = index.species[masterTaxonId]
  if speciesEntry then
    speciesEntry.photoCount = math.max((tonumber(speciesEntry.photoCount or 0) or 0) - 1, 0)
    if snapshot.referenceImage then
      speciesEntry.referenceImageCount = math.max(
        (tonumber(speciesEntry.referenceImageCount or 0) or 0) - 1,
        0
      )
    end
    if speciesEntry.photoCount == 0 then
      index.species[masterTaxonId] = nil
    end
  end
end

function StatisticsIndex.applyChanges(index, beforeSnapshots, afterSnapshots)
  if not StatisticsIndex.isValid(index) then
    return false
  end
  for _, snapshot in ipairs(beforeSnapshots or {}) do
    StatisticsIndex.remove(index, snapshot)
  end
  for _, snapshot in ipairs(afterSnapshots or {}) do
    StatisticsIndex.add(index, snapshot)
  end
  return true
end

function StatisticsIndex.result(index)
  if not StatisticsIndex.isValid(index) then
    return nil
  end
  local lifelist = {}
  local referenceImageCount = 0
  local speciesWithoutReference = 0
  local speciesWithMultipleReferences = 0
  for _, entry in pairs(index.species) do
    local row = {
      masterTaxonId = cleanText(entry.masterTaxonId),
      germanName = cleanText(entry.germanName),
      scientificName = cleanText(entry.scientificName),
      className = cleanText(entry.className),
      family = cleanText(entry.family),
      genus = cleanText(entry.genus),
      photoCount = tonumber(entry.photoCount or 0) or 0,
      referenceImageCount = tonumber(entry.referenceImageCount or 0) or 0,
    }
    referenceImageCount = referenceImageCount + row.referenceImageCount
    if row.referenceImageCount == 0 then
      speciesWithoutReference = speciesWithoutReference + 1
    elseif row.referenceImageCount > 1 then
      speciesWithMultipleReferences = speciesWithMultipleReferences + 1
    end
    table.insert(lifelist, row)
  end
  table.sort(lifelist, sortSpecies)

  local classBreakdown = {}
  for className, classEntry in pairs(index.classes) do
    local classSpecies = {}
    for masterTaxonId, classPhotoCount in pairs(classEntry.species or {}) do
      local speciesEntry = index.species[masterTaxonId]
      if speciesEntry then
        table.insert(classSpecies, {
          masterTaxonId = masterTaxonId,
          germanName = cleanText(speciesEntry.germanName),
          scientificName = cleanText(speciesEntry.scientificName),
          photoCount = tonumber(classPhotoCount or 0) or 0,
        })
      end
    end
    table.sort(classSpecies, sortSpecies)
    table.insert(classBreakdown, {
      name = className,
      photoCount = tonumber(classEntry.photoCount or 0) or 0,
      speciesCount = #classSpecies,
      species = classSpecies,
    })
  end
  table.sort(classBreakdown, function(left, right)
    if left.photoCount == right.photoCount then
      return left.name < right.name
    end
    return left.photoCount > right.photoCount
  end)

  local topSpecies = {}
  for _, entry in ipairs(lifelist) do
    table.insert(topSpecies, {
      masterTaxonId = entry.masterTaxonId,
      name = displayName(entry),
      photoCount = entry.photoCount,
    })
  end
  table.sort(topSpecies, function(left, right)
    if left.photoCount == right.photoCount then
      return left.name < right.name
    end
    return left.photoCount > right.photoCount
  end)
  while #topSpecies > 10 do
    table.remove(topSpecies)
  end

  local totalPhotos = tonumber(index.totalPhotos or 0) or 0
  local assignedPhotos = tonumber(index.assignedPhotos or 0) or 0
  return {
    totalPhotos = totalPhotos,
    assignedPhotos = assignedPhotos,
    unassignedPhotos = math.max(totalPhotos - assignedPhotos, 0),
    speciesCount = #lifelist,
    familyCount = countKeys(index.families),
    genusCount = countKeys(index.genera),
    classCount = #classBreakdown,
    referenceImageCount = referenceImageCount,
    speciesWithoutReference = speciesWithoutReference,
    speciesWithMultipleReferences = speciesWithMultipleReferences,
    topSpecies = topSpecies,
    classBreakdown = classBreakdown,
    lifelist = lifelist,
    generatedAt = cleanText(index.generatedAt),
  }
end

return StatisticsIndex
