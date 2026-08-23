local TaxonomyRanks = require "TaxonomyRanks"

local TOOLKIT_ID = "de.fnwildlifetravel.taxonomy"

local items = {
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
  "com.adobe.separator",
  TOOLKIT_ID .. ".germanName",
  TOOLKIT_ID .. ".englishName",
  TOOLKIT_ID .. ".scientificName",
  TOOLKIT_ID .. ".taxonRank",
}

for _, rank in ipairs(TaxonomyRanks.all()) do
  table.insert(items, TOOLKIT_ID .. "." .. TaxonomyRanks.metadataFieldId(rank.id))
end

table.insert(items, "com.adobe.separator")
table.insert(items, TOOLKIT_ID .. ".referenceImage")
table.insert(items, TOOLKIT_ID .. ".assignedAt")

return {
  title = "FN Wildlife – Foto & Taxonomie",
  id = "fnWildlifePhotoTaxonomy",
  items = items,
}
