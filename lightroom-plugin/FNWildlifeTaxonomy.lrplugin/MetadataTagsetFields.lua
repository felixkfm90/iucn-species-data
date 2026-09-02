local TaxonomyRanks = require "TaxonomyRanks"

local MetadataTagsetFields = {}

local TOOLKIT_ID = "de.fnwildlifetravel.taxonomy"

local STANDARD_PHOTO_FIELDS = {
  "com.adobe.filename",
  "com.adobe.captureDateTime",
  "com.adobe.imageCroppedDimensions",
  "com.adobe.copyright",
  "com.adobe.creator",
  "com.adobe.combinedCameraName",
  "com.adobe.lens",
  "com.adobe.focalLength",
  "com.adobe.apertureValue",
  "com.adobe.ISOSpeedRating",
  "com.adobe.shutterSpeedValue",
  "com.adobe.GPS",
}

local COMPACT_RANKS = {
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "species",
  "subspecies",
}

local function append(target, value)
  table.insert(target, value)
end

local function appendStandardFields(items)
  for _, field in ipairs(STANDARD_PHOTO_FIELDS) do
    append(items, field)
  end
end

local function appendIdentityFields(items)
  append(items, "com.adobe.separator")
  append(items, TOOLKIT_ID .. ".germanName")
  append(items, TOOLKIT_ID .. ".englishName")
  append(items, TOOLKIT_ID .. ".scientificName")
  append(items, TOOLKIT_ID .. ".taxonRank")
end

local function appendFooterFields(items)
  append(items, "com.adobe.separator")
  append(items, TOOLKIT_ID .. ".fnLocation")
  append(items, TOOLKIT_ID .. ".fnCity")
  append(items, TOOLKIT_ID .. ".fnStateProvince")
  append(items, TOOLKIT_ID .. ".fnCountry")
  append(items, TOOLKIT_ID .. ".fnIsoCountryCode")
  append(items, TOOLKIT_ID .. ".fnCaptureMonth")
  append(items, TOOLKIT_ID .. ".fnCaptureYear")
  append(items, "com.adobe.separator")
  append(items, TOOLKIT_ID .. ".referenceImage")
  append(items, TOOLKIT_ID .. ".assignedAt")
end

function MetadataTagsetFields.compact()
  local items = {}
  appendStandardFields(items)
  appendIdentityFields(items)
  for _, rank in ipairs(COMPACT_RANKS) do
    append(items, TOOLKIT_ID .. "." .. TaxonomyRanks.metadataFieldId(rank))
  end
  appendFooterFields(items)
  return items
end

function MetadataTagsetFields.full()
  local items = {}
  appendStandardFields(items)
  appendIdentityFields(items)
  for _, rank in ipairs(TaxonomyRanks.all()) do
    append(items, TOOLKIT_ID .. "." .. TaxonomyRanks.metadataFieldId(rank.id))
  end
  appendFooterFields(items)
  return items
end

return MetadataTagsetFields
