local TaxonomyRanks = require "TaxonomyRanks"

local StatisticsIndex = {}
local cleanText = TaxonomyRanks.cleanText

local LrDate = import "LrDate"
local LrPathUtils = import "LrPathUtils"

StatisticsIndex.SCHEMA_VERSION = 6

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
    monthYears = {},
    days = {},
  }
end

local function normalizedDate(year, month, day)
  year = tonumber(year)
  month = tonumber(month)
  day = tonumber(day)
  if not year or year < 1800 or year > 3000
      or not month or month < 1 or month > 12
      or not day or day < 1 or day > 31 then
    return ""
  end
  return string.format("%04d-%02d-%02d", year, month, day)
end

local function captureDate(value)
  local timestamp = tonumber(value)
  if timestamp then
    local results = { LrDate.timestampToComponents(timestamp) }
    local first = results[1]
    if type(first) == "table" then
      local date = normalizedDate(
        first.year or first[1],
        first.month or first[2],
        first.day or first[3]
      )
      if date ~= "" then
        return date
      end
    else
      for index = 1, #results - 2 do
        local date = normalizedDate(results[index], results[index + 1], results[index + 2])
        if date ~= "" then
          return date
        end
      end
    end
  end
  local text = cleanText(value)
  local year, month, day = string.match(text, "(%d%d%d%d)[%-/:](%d%d?)[%-/:](%d%d?)")
  if not year then
    day, month, year = string.match(text, "(%d%d?)[%.%-/](%d%d?)[%.%-/](%d%d%d%d)")
  end
  return normalizedDate(year, month, day)
end

local function fileName(value)
  local path = cleanText(value)
  if path == "" then
    return ""
  end
  return cleanText(LrPathUtils.leafName(path))
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

local function observationKeyPart(value)
  local text = cleanText(value)
  return tostring(#text) .. ":" .. text
end

local function observationKey(snapshot)
  local hasFnTime = cleanText(snapshot.fnCaptureYear) ~= ""
    or cleanText(snapshot.fnCaptureMonth) ~= ""
  local date = hasFnTime and cleanText(snapshot.captureDate) or ""
  return table.concat({
    observationKeyPart(date),
    observationKeyPart(snapshot.fnCaptureYear),
    observationKeyPart(snapshot.fnCaptureMonth),
    observationKeyPart(snapshot.fnCountry),
    observationKeyPart(snapshot.fnStateProvince),
    observationKeyPart(snapshot.fnCity),
    observationKeyPart(snapshot.fnLocation),
    observationKeyPart(snapshot.masterTaxonId),
  }, "|"), date
end

local function copyObservationText(entry, field, value)
  value = cleanText(value)
  if value ~= "" then
    entry[field] = value
  end
end

local function changeObservation(index, snapshot, amount)
  if not hasValidTaxonomy(snapshot) then
    return
  end
  local key, date = observationKey(snapshot)
  local entry = index.observations[key]
  if amount > 0 then
    if not entry then
      entry = {
        captureDate = date,
        captureYear = cleanText(snapshot.fnCaptureYear),
        captureMonth = cleanText(snapshot.fnCaptureMonth),
        country = cleanText(snapshot.fnCountry),
        stateProvince = cleanText(snapshot.fnStateProvince),
        city = cleanText(snapshot.fnCity),
        location = cleanText(snapshot.fnLocation),
        masterTaxonId = cleanText(snapshot.masterTaxonId),
        germanName = "",
        englishName = "",
        scientificName = "",
        className = "",
        order = "",
        family = "",
        genus = "",
        photoCount = 0,
        exampleFileName = "",
        examplePhotoUuid = "",
      }
      index.observations[key] = entry
    end
    copyObservationText(entry, "germanName", snapshot.germanName)
    copyObservationText(entry, "englishName", snapshot.englishName)
    copyObservationText(entry, "scientificName", snapshot.scientificName)
    copyObservationText(entry, "className", snapshot.className)
    copyObservationText(entry, "order", snapshot.order)
    copyObservationText(entry, "family", snapshot.family)
    copyObservationText(entry, "genus", snapshot.genus)
    entry.photoCount = (tonumber(entry.photoCount or 0) or 0) + amount
    if cleanText(entry.exampleFileName) == "" and cleanText(snapshot.exampleFileName) ~= "" then
      entry.exampleFileName = cleanText(snapshot.exampleFileName)
      entry.examplePhotoUuid = cleanText(snapshot.photoUuid)
    end
    return
  end
  if not entry then
    return
  end
  entry.photoCount = math.max((tonumber(entry.photoCount or 0) or 0) + amount, 0)
  if entry.photoCount == 0 then
    index.observations[key] = nil
  elseif cleanText(snapshot.photoUuid) ~= ""
      and cleanText(snapshot.photoUuid) == cleanText(entry.examplePhotoUuid) then
    -- Der Index speichert absichtlich keine Fotoliste pro Beobachtung. Wird das
    -- Beispiel entfernt, bleibt das optionale Feld bis zur nächsten Ergänzung leer.
    entry.exampleFileName = ""
    entry.examplePhotoUuid = ""
  end
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
  if hasTime then
    local year = cleanText(snapshot.fnCaptureYear)
    local month = cleanText(snapshot.fnCaptureMonth)
    if year ~= "" and month ~= "" then
      increment(aggregate.monthYears, year .. "|" .. month, amount)
    end
    increment(aggregate.days, snapshot.captureDate, amount)
  end
end

local function validLocationTimeAggregate(aggregate)
  return type(aggregate) == "table"
    and type(aggregate.countries) == "table"
    and type(aggregate.states) == "table"
    and type(aggregate.cities) == "table"
    and type(aggregate.locations) == "table"
    and type(aggregate.years) == "table"
    and type(aggregate.months) == "table"
    and type(aggregate.monthYears) == "table"
    and type(aggregate.days) == "table"
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

local function observationSortValue(value)
  local text = string.lower(cleanText(value))
  return text ~= "" and text or "\255"
end

local function sortObservations(left, right)
  local leftDate = observationSortValue(left.captureDate)
  local rightDate = observationSortValue(right.captureDate)
  if leftDate ~= rightDate then
    return leftDate < rightDate
  end
  for _, field in ipairs({ "country", "stateProvince", "city", "location" }) do
    local leftValue = observationSortValue(left[field])
    local rightValue = observationSortValue(right[field])
    if leftValue ~= rightValue then
      return leftValue < rightValue
    end
  end
  local leftName = observationSortValue(
    cleanText(left.germanName) ~= "" and left.germanName or left.scientificName
  )
  local rightName = observationSortValue(
    cleanText(right.germanName) ~= "" and right.germanName or right.scientificName
  )
  if leftName == rightName then
    return cleanText(left.masterTaxonId) < cleanText(right.masterTaxonId)
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
    domains = {},
    kingdoms = {},
    phyla = {},
    classRanks = {},
    orders = {},
    classes = {},
    locationTime = newLocationTimeAggregate(),
    taxonomyLocationTime = newLocationTimeAggregate(),
    observations = {},
  }
end

function StatisticsIndex.isValid(index)
  return type(index) == "table"
    and tonumber(index.schemaVersion) == StatisticsIndex.SCHEMA_VERSION
    and type(index.species) == "table"
    and type(index.families) == "table"
    and type(index.genera) == "table"
    and type(index.domains) == "table"
    and type(index.kingdoms) == "table"
    and type(index.phyla) == "table"
    and type(index.classRanks) == "table"
    and type(index.orders) == "table"
    and type(index.classes) == "table"
    and validLocationTimeAggregate(index.locationTime)
    and validLocationTimeAggregate(index.taxonomyLocationTime)
    and type(index.observations) == "table"
end

function StatisticsIndex.snapshot(values)
  values = values or {}
  return {
    masterTaxonId = cleanText(values.masterTaxonId),
    germanName = cleanText(values.germanName),
    englishName = cleanText(values.englishName),
    scientificName = cleanText(values.scientificName),
    domain = cleanText(values.taxonomyDomain),
    kingdom = cleanText(values.taxonomyKingdom),
    phylum = cleanText(values.taxonomyPhylum),
    order = cleanText(values.taxonomyOrder),
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
    captureDate = captureDate(values.captureDate or values.dateTimeOriginal),
    exampleFileName = cleanText(values.exampleFileName) ~= ""
      and cleanText(values.exampleFileName)
      or fileName(values.path),
  }
end

function StatisticsIndex.photoSnapshot(photo)
  return StatisticsIndex.snapshot({
    masterTaxonId = photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"),
    germanName = photo:getPropertyForPlugin(_PLUGIN, "germanName"),
    englishName = photo:getPropertyForPlugin(_PLUGIN, "englishName"),
    scientificName = photo:getPropertyForPlugin(_PLUGIN, "scientificName"),
    taxonomyDomain = photo:getPropertyForPlugin(_PLUGIN, "taxonomyDomain"),
    taxonomyKingdom = photo:getPropertyForPlugin(_PLUGIN, "taxonomyKingdom"),
    taxonomyPhylum = photo:getPropertyForPlugin(_PLUGIN, "taxonomyPhylum"),
    taxonomyOrder = photo:getPropertyForPlugin(_PLUGIN, "taxonomyOrder"),
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
    dateTimeOriginal = photo:getRawMetadata("dateTimeOriginal"),
    path = photo:getRawMetadata("path"),
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
  changeObservation(index, snapshot, 1)
  index.assignedPhotos = (tonumber(index.assignedPhotos or 0) or 0) + 1
  increment(index.domains, snapshot.domain, 1)
  increment(index.kingdoms, snapshot.kingdom, 1)
  increment(index.phyla, snapshot.phylum, 1)
  increment(index.classRanks, snapshot.className, 1)
  increment(index.orders, snapshot.order, 1)
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
      englishName = "",
      scientificName = "",
      className = className,
      order = "",
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
  if cleanText(snapshot.englishName) ~= "" then
    speciesEntry.englishName = cleanText(snapshot.englishName)
  end
  if cleanText(snapshot.scientificName) ~= "" then
    speciesEntry.scientificName = cleanText(snapshot.scientificName)
  end
  speciesEntry.className = className
  speciesEntry.order = cleanText(snapshot.order)
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
  changeObservation(index, snapshot, -1)
  index.assignedPhotos = math.max((tonumber(index.assignedPhotos or 0) or 0) - 1, 0)
  increment(index.domains, snapshot.domain, -1)
  increment(index.kingdoms, snapshot.kingdom, -1)
  increment(index.phyla, snapshot.phylum, -1)
  increment(index.classRanks, snapshot.className, -1)
  increment(index.orders, snapshot.order, -1)
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
    topCountries = sortedCounts(aggregate.countries, 5),
    topStates = sortedCounts(aggregate.states, 5),
    topCities = sortedCounts(aggregate.cities, 5),
    topLocations = sortedCounts(aggregate.locations, 5),
    topYears = sortedCounts(aggregate.years, 5),
    topMonths = sortedCounts(aggregate.months, 5),
    topMonthYears = sortedCounts(aggregate.monthYears, 5),
    topDays = sortedCounts(aggregate.days, 5),
  }
end

local function taxonomyDataQualityResult(aggregate, assignedPhotos)
  local unionPhotoCount = tonumber(aggregate.photoCount or 0) or 0
  local locationPhotoCount = tonumber(aggregate.locationPhotoCount or 0) or 0
  local timePhotoCount = tonumber(aggregate.timePhotoCount or 0) or 0
  local bothPhotoCount = math.max(locationPhotoCount + timePhotoCount - unionPhotoCount, 0)
  return {
    locationPhotoCount = locationPhotoCount,
    timePhotoCount = timePhotoCount,
    bothPhotoCount = bothPhotoCount,
    onlyLocationPhotoCount = math.max(locationPhotoCount - bothPhotoCount, 0),
    onlyTimePhotoCount = math.max(timePhotoCount - bothPhotoCount, 0),
    neitherPhotoCount = math.max((tonumber(assignedPhotos or 0) or 0) - unionPhotoCount, 0),
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
      englishName = cleanText(entry.englishName),
      scientificName = cleanText(entry.scientificName),
      className = cleanText(entry.className),
      order = cleanText(entry.order),
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
  while #topSpecies > 5 do
    table.remove(topSpecies)
  end

  local observationRows = {}
  for _, entry in pairs(index.observations) do
    local speciesEntry = index.species[cleanText(entry.masterTaxonId)] or {}
    table.insert(observationRows, {
      captureDate = cleanText(entry.captureDate),
      captureYear = cleanText(entry.captureYear),
      captureMonth = cleanText(entry.captureMonth),
      country = cleanText(entry.country),
      stateProvince = cleanText(entry.stateProvince),
      city = cleanText(entry.city),
      location = cleanText(entry.location),
      masterTaxonId = cleanText(entry.masterTaxonId),
      germanName = cleanText(entry.germanName),
      englishName = cleanText(entry.englishName),
      scientificName = cleanText(entry.scientificName),
      className = cleanText(entry.className),
      order = cleanText(entry.order),
      family = cleanText(entry.family),
      genus = cleanText(entry.genus),
      photoCount = tonumber(entry.photoCount or 0) or 0,
      referenceImage = (tonumber(speciesEntry.referenceImageCount or 0) or 0) > 0,
      exampleFileName = cleanText(entry.exampleFileName),
    })
  end
  table.sort(observationRows, sortObservations)

  local totalPhotos = tonumber(index.totalPhotos or 0) or 0
  local assignedPhotos = tonumber(index.assignedPhotos or 0) or 0
  return {
    totalPhotos = totalPhotos,
    assignedPhotos = assignedPhotos,
    unassignedPhotos = math.max(totalPhotos - assignedPhotos, 0),
    speciesCount = #lifelist,
    domainCount = countKeys(index.domains),
    kingdomCount = countKeys(index.kingdoms),
    phylumCount = countKeys(index.phyla),
    rankClassCount = countKeys(index.classRanks),
    orderCount = countKeys(index.orders),
    familyCount = countKeys(index.families),
    genusCount = countKeys(index.genera),
    classCount = #classBreakdown,
    referenceImageCount = referenceImageCount,
    speciesWithoutReference = speciesWithoutReference,
    speciesWithMultipleReferences = speciesWithMultipleReferences,
    topSpecies = topSpecies,
    classBreakdown = classBreakdown,
    lifelist = lifelist,
    observationRows = observationRows,
    locationTime = locationTimeResult(index.locationTime),
    taxonomyLocationTime = locationTimeResult(index.taxonomyLocationTime),
    taxonomyDataQuality = taxonomyDataQualityResult(index.taxonomyLocationTime, assignedPhotos),
    generatedAt = cleanText(index.generatedAt),
  }
end


function StatisticsIndex.captureDate(value)
  return captureDate(value)
end

return StatisticsIndex
