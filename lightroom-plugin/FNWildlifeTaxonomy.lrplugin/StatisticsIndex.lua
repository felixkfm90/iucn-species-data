local TaxonomyRanks = require "TaxonomyRanks"

local StatisticsIndex = {}
local cleanText = TaxonomyRanks.cleanText

StatisticsIndex.SCHEMA_VERSION = 3

local LOCATION_FIELDS = {
  "fnCountry",
  "fnStateProvince",
  "fnCity",
  "fnLocation",
  "fnIsoCountryCode",
}

local TIME_FIELDS = {
  "fnCaptureYear",
  "fnCaptureMonth",
}

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

local function newLocationTimeAggregate()
  return {
    photoCount = 0,
    locationPhotoCount = 0,
    timePhotoCount = 0,
    countries = {},
    states = {},
    cities = {},
    locations = {},
    years = {},
    months = {},
  }
end

local function hasAnyValue(snapshot, fields)
  for _, field in ipairs(fields) do
    if cleanText(snapshot and snapshot[field]) ~= "" then
      return true
    end
  end
  return false
end

local function hasValidTaxonomy(snapshot)
  local masterTaxonId = cleanText(snapshot and snapshot.masterTaxonId)
  return string.sub(masterTaxonId, 1, 4) == "mtx_"
end

local function changeCounter(aggregate, field, amount)
  aggregate[field] = math.max((tonumber(aggregate[field] or 0) or 0) + amount, 0)
end

local function changeLocationTime(aggregate, snapshot, amount)
  local hasLocation = hasAnyValue(snapshot, LOCATION_FIELDS)
  local hasTime = hasAnyValue(snapshot, TIME_FIELDS)
  if not hasLocation and not hasTime then
    return
  end
  changeCounter(aggregate, "photoCount", amount)
  if hasLocation then
    changeCounter(aggregate, "locationPhotoCount", amount)
  end
  if hasTime then
    changeCounter(aggregate, "timePhotoCount", amount)
  end
  increment(aggregate.countries, snapshot.fnCountry, amount)
  increment(aggregate.states, snapshot.fnStateProvince, amount)
  increment(aggregate.cities, snapshot.fnCity, amount)
  increment(aggregate.locations, snapshot.fnLocation, amount)
  increment(aggregate.years, snapshot.fnCaptureYear, amount)
  increment(aggregate.months, snapshot.fnCaptureMonth, amount)
end

local function validLocationTimeAggregate(aggregate)
  return type(aggregate) == "table"
    and type(aggregate.countries) == "table"
    and type(aggregate.states) == "table"
    and type(aggregate.cities) == "table"
    and type(aggregate.locations) == "table"
    and type(aggregate.years) == "table"
    and type(aggregate.months) == "table"
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
    locationTime = newLocationTimeAggregate(),
    taxonomyLocationTime = newLocationTimeAggregate(),
  }
end

function StatisticsIndex.isValid(index)
  return type(index) == "table"
    and tonumber(index.schemaVersion) == StatisticsIndex.SCHEMA_VERSION
    and type(index.species) == "table"
    and type(index.families) == "table"
    and type(index.genera) == "table"
    and type(index.classes) == "table"
    and validLocationTimeAggregate(index.locationTime)
    and validLocationTimeAggregate(index.taxonomyLocationTime)
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
    photoUuid = cleanText(values.photoUuid or values.uuid),
    fnLocation = cleanText(values.fnLocation),
    fnCity = cleanText(values.fnCity),
    fnStateProvince = cleanText(values.fnStateProvince),
    fnCountry = cleanText(values.fnCountry),
    fnIsoCountryCode = cleanText(values.fnIsoCountryCode),
    fnCaptureMonth = cleanText(values.fnCaptureMonth),
    fnCaptureYear = cleanText(values.fnCaptureYear),
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
    photoUuid = photo:getRawMetadata("uuid"),
    fnLocation = photo:getPropertyForPlugin(_PLUGIN, "fnLocation"),
    fnCity = photo:getPropertyForPlugin(_PLUGIN, "fnCity"),
    fnStateProvince = photo:getPropertyForPlugin(_PLUGIN, "fnStateProvince"),
    fnCountry = photo:getPropertyForPlugin(_PLUGIN, "fnCountry"),
    fnIsoCountryCode = photo:getPropertyForPlugin(_PLUGIN, "fnIsoCountryCode"),
    fnCaptureMonth = photo:getPropertyForPlugin(_PLUGIN, "fnCaptureMonth"),
    fnCaptureYear = photo:getPropertyForPlugin(_PLUGIN, "fnCaptureYear"),
  })
end

function StatisticsIndex.add(index, snapshot)
  changeLocationTime(index.locationTime, snapshot, 1)
  if hasValidTaxonomy(snapshot) then
    changeLocationTime(index.taxonomyLocationTime, snapshot, 1)
  end
  local masterTaxonId = cleanText(snapshot and snapshot.masterTaxonId)
  if not hasValidTaxonomy(snapshot) then
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
      referenceImageUuids = {},
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
    speciesEntry.referenceImageUuids = speciesEntry.referenceImageUuids or {}
    speciesEntry.referenceImageCount = (tonumber(speciesEntry.referenceImageCount or 0) or 0) + 1
    if cleanText(snapshot.photoUuid) ~= "" then
      speciesEntry.referenceImageUuids[cleanText(snapshot.photoUuid)] = true
    end
  end
end

function StatisticsIndex.remove(index, snapshot)
  changeLocationTime(index.locationTime, snapshot, -1)
  if hasValidTaxonomy(snapshot) then
    changeLocationTime(index.taxonomyLocationTime, snapshot, -1)
  end
  local masterTaxonId = cleanText(snapshot and snapshot.masterTaxonId)
  if not hasValidTaxonomy(snapshot) then
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
      speciesEntry.referenceImageUuids = speciesEntry.referenceImageUuids or {}
      speciesEntry.referenceImageCount = math.max(
        (tonumber(speciesEntry.referenceImageCount or 0) or 0) - 1,
        0
      )
      if cleanText(snapshot.photoUuid) ~= "" then
        speciesEntry.referenceImageUuids[cleanText(snapshot.photoUuid)] = nil
      end
    end
    if speciesEntry.photoCount == 0 then
      index.species[masterTaxonId] = nil
    end
  end
end

local function sortedCounts(values, limit)
  local rows = {}
  for name, photoCount in pairs(values or {}) do
    table.insert(rows, {
      name = cleanText(name),
      photoCount = tonumber(photoCount or 0) or 0,
    })
  end
  table.sort(rows, function(left, right)
    if left.photoCount == right.photoCount then
      return string.lower(left.name) < string.lower(right.name)
    end
    return left.photoCount > right.photoCount
  end)
  while #rows > limit do
    table.remove(rows)
  end
  return rows
end

local function locationTimeResult(aggregate)
  return {
    photoCount = tonumber(aggregate.photoCount or 0) or 0,
    locationPhotoCount = tonumber(aggregate.locationPhotoCount or 0) or 0,
    timePhotoCount = tonumber(aggregate.timePhotoCount or 0) or 0,
    countryCount = countKeys(aggregate.countries),
    stateCount = countKeys(aggregate.states),
    cityCount = countKeys(aggregate.cities),
    locationCount = countKeys(aggregate.locations),
    yearCount = countKeys(aggregate.years),
    monthCount = countKeys(aggregate.months),
    topCountries = sortedCounts(aggregate.countries, 1),
    topStates = sortedCounts(aggregate.states, 1),
    topCities = sortedCounts(aggregate.cities, 1),
    topLocations = sortedCounts(aggregate.locations, 1),
    topYears = sortedCounts(aggregate.years, 1),
    topMonths = sortedCounts(aggregate.months, 1),
  }
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
    locationTime = locationTimeResult(index.locationTime),
    taxonomyLocationTime = locationTimeResult(index.taxonomyLocationTime),
    generatedAt = cleanText(index.generatedAt),
  }
end

return StatisticsIndex
