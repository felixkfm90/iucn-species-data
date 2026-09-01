local PluginState = require "PluginState"
local StatisticsIndex = require "StatisticsIndex"

local Statistics = {}
local activeBuild = false
local READ_CHUNK_SIZE = 500
local CHECKPOINT_CHUNK_COUNT = 10
local FIELD_IDS = {
  "masterTaxonId",
  "germanName",
  "scientificName",
  "taxonomyFamily",
  "taxonomyGenus",
  "taxonomyClass",
  "referenceImage",
}

local function photoIdentifier(photo)
  return tonumber(photo.localIdentifier or 0) or 0
end

local function sortedPhotos(catalog)
  local photos = catalog:getAllPhotos()
  table.sort(photos, function(left, right)
    return photoIdentifier(left) < photoIdentifier(right)
  end)
  return photos
end

local function resumeStartIndex(photos, lastPhotoId)
  local normalizedLastId = tonumber(lastPhotoId or 0) or 0
  if normalizedLastId <= 0 then
    return 1
  end
  for index, photo in ipairs(photos) do
    if photoIdentifier(photo) > normalizedLastId then
      return index
    end
  end
  return #photos + 1
end

local function checkpoint(catalog, index, processedPhotos, lastPhotoId)
  PluginState.saveStatisticsBuild(catalog, {
    schemaVersion = StatisticsIndex.SCHEMA_VERSION,
    totalPhotos = tonumber(index.totalPhotos or 0) or 0,
    processedPhotos = tonumber(processedPhotos or 0) or 0,
    lastPhotoId = tonumber(lastPhotoId or 0) or 0,
    savedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
    index = index,
  })
end

function Statistics.load(catalog)
  local totalPhotos = #(catalog:getAllPhotos())
  local index, reason = PluginState.statisticsIndex(catalog, totalPhotos)
  if not index then
    return nil, false, reason
  end
  return StatisticsIndex.result(index), true, nil
end

function Statistics.beginBuild()
  if activeBuild then
    return false
  end
  activeBuild = true
  return true
end

function Statistics.finishBuild()
  activeBuild = false
end

function Statistics.build(catalog, options)
  options = options or {}
  local photos = sortedPhotos(catalog)
  local totalPhotos = #photos
  local build = options.restart and nil or PluginState.statisticsBuild(catalog, totalPhotos)
  local index = build and build.index or StatisticsIndex.new(totalPhotos)
  local processedPhotos = build and tonumber(build.processedPhotos or 0) or 0
  local lastPhotoId = build and tonumber(build.lastPhotoId or 0) or 0
  local startIndex = resumeStartIndex(photos, lastPhotoId)
  local chunksSinceCheckpoint = 0

  for chunkStart = startIndex, totalPhotos, READ_CHUNK_SIZE do
    local chunkEnd = math.min(chunkStart + READ_CHUNK_SIZE - 1, totalPhotos)
    local chunk = {}
    for indexInCatalog = chunkStart, chunkEnd do
      table.insert(chunk, photos[indexInCatalog])
    end
    catalog:withReadAccessDo(function()
      local valuesByPhoto = catalog:batchGetPropertyForPlugin(chunk, _PLUGIN, FIELD_IDS)
      local rawValuesByPhoto = catalog:batchGetRawMetadata(chunk, { "uuid" })
      for _, photo in ipairs(chunk) do
        local values = valuesByPhoto[photo] or {}
        values.photoUuid = (rawValuesByPhoto[photo] or {}).uuid
        StatisticsIndex.add(index, StatisticsIndex.snapshot(values))
      end
    end)

    processedPhotos = chunkEnd
    lastPhotoId = photoIdentifier(photos[chunkEnd])
    chunksSinceCheckpoint = chunksSinceCheckpoint + 1
    local instruction = nil
    if options.progress then
      -- Yield und Bedienlogik liegen bewusst außerhalb von withReadAccessDo.
      instruction = options.progress(processedPhotos, totalPhotos)
    end
    if instruction == "pause" or instruction == "cancel" then
      checkpoint(catalog, index, processedPhotos, lastPhotoId)
      return {
        status = "paused",
        processedPhotos = processedPhotos,
        totalPhotos = totalPhotos,
      }
    end
    if chunksSinceCheckpoint >= CHECKPOINT_CHUNK_COUNT then
      checkpoint(catalog, index, processedPhotos, lastPhotoId)
      chunksSinceCheckpoint = 0
    end
  end

  index.totalPhotos = totalPhotos
  PluginState.saveStatisticsIndex(catalog, index)
  return {
    status = "complete",
    processedPhotos = totalPhotos,
    totalPhotos = totalPhotos,
    statistics = StatisticsIndex.result(index),
  }
end

function Statistics.photoSnapshot(photo)
  return StatisticsIndex.photoSnapshot(photo)
end

function Statistics.assignmentSnapshot(taxon, rankValues, referenceImage, photoUuid)
  rankValues = rankValues or {}
  return StatisticsIndex.snapshot({
    masterTaxonId = taxon and taxon.masterTaxonId,
    germanName = taxon and taxon.germanName,
    scientificName = taxon and taxon.acceptedScientificName,
    taxonomyFamily = rankValues.family,
    taxonomyGenus = rankValues.genus,
    taxonomyClass = rankValues.class,
    referenceImage = referenceImage and "yes" or "no",
    photoUuid = photoUuid,
  })
end

function Statistics.emptySnapshot()
  return StatisticsIndex.snapshot({})
end

function Statistics.referenceSnapshot(snapshot, referenceImage)
  snapshot = snapshot or {}
  return StatisticsIndex.snapshot({
    masterTaxonId = snapshot.masterTaxonId,
    germanName = snapshot.germanName,
    scientificName = snapshot.scientificName,
    taxonomyFamily = snapshot.family,
    taxonomyGenus = snapshot.genus,
    taxonomyClass = snapshot.className,
    referenceImage = referenceImage and "yes" or "no",
    photoUuid = snapshot.photoUuid,
  })
end

return Statistics
