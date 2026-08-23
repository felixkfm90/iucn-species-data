local PluginState = require "PluginState"
local TaxonomyRanks = require "TaxonomyRanks"

local KeywordWriter = {}

local PLUGIN_KEYWORD_ROOT = "FN Wildlife & Travel"
local METADATA_FIELDS = {
  "masterTaxonId",
  "projectTaxonId",
  "germanName",
  "englishName",
  "scientificName",
  "taxonRank",
  "taxonomyPath",
  "assignedAt",
}
for _, rank in ipairs(TaxonomyRanks.all()) do
  table.insert(METADATA_FIELDS, TaxonomyRanks.metadataFieldId(rank.id))
end

local cleanText = TaxonomyRanks.cleanText

local function createKeyword(catalog, name, parent)
  return catalog:createKeyword(name, {}, true, parent, true)
end

local function keywordName(keyword)
  local ok, value = pcall(function()
    return keyword:getName()
  end)
  return ok and cleanText(value) or ""
end

local function keywordParent(keyword)
  local ok, value = pcall(function()
    return keyword:getParent()
  end)
  return ok and value or nil
end

local function isManagedKeyword(keyword)
  local current = keyword
  for _ = 1, 40 do
    if not current then
      return false
    end
    if keywordName(current) == PLUGIN_KEYWORD_ROOT then
      return true
    end
    current = keywordParent(current)
  end
  return false
end

local function removeManagedKeywords(photo)
  local removed = 0
  local keywords = photo:getRawMetadata("keywords") or {}
  for _, keyword in ipairs(keywords) do
    if isManagedKeyword(keyword) then
      photo:removeKeyword(keyword)
      removed = removed + 1
    end
  end
  return removed
end

local function clearPluginMetadata(photo)
  for _, field in ipairs(METADATA_FIELDS) do
    photo:setPropertyForPlugin(_PLUGIN, field, "")
  end
  photo:setPropertyForPlugin(_PLUGIN, "referenceImage", "no")
end

local function utf8Prefix(value, maximumBytes)
  local text = cleanText(value)
  if string.len(text) <= maximumBytes then
    return text
  end
  local cut = maximumBytes
  while cut > 0 do
    local nextByte = string.byte(text, cut + 1)
    if not nextByte or nextByte < 128 or nextByte >= 192 then
      break
    end
    cut = cut - 1
  end
  return string.sub(text, 1, cut)
end

local function metadataText(value)
  -- Lightroom begrenzt indizierte String-Metadaten auf weniger als 512 Byte.
  return utf8Prefix(value, 460)
end

local function setText(photo, field, value)
  photo:setPropertyForPlugin(_PLUGIN, field, metadataText(value))
end

local function boundedPath(parts)
  local kept = {}
  for _, part in ipairs(parts) do
    local candidate = table.concat(kept, " > ")
    if candidate ~= "" then
      candidate = candidate .. " > " .. part
    else
      candidate = part
    end
    if string.len(candidate) >= 460 then
      break
    end
    table.insert(kept, part)
  end
  return table.concat(kept, " > ")
end

function KeywordWriter.findConflicts(photos, taxon)
  local conflicts = {}
  for _, photo in ipairs(photos) do
    local existingId = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
    if existingId ~= "" and existingId ~= taxon.masterTaxonId then
      table.insert(conflicts, photo)
    end
  end
  return conflicts
end

function KeywordWriter.assign(catalog, photos, taxon)
  local conflicts = KeywordWriter.findConflicts(photos, taxon)
  if #conflicts > 0 then
    error(
      tostring(#conflicts)
        .. " ausgewählte Foto(s) besitzen bereits eine andere Taxonomiezuordnung. "
        .. "Der Prototyp überschreibt diese nicht."
    )
  end

  local hierarchyPath = {}
  local rankValues = {}
  local keywordCount = 0
  catalog:withWriteAccessDo("FN Wildlife Taxonomie zuweisen", function()
    for _, photo in ipairs(photos) do
      removeManagedKeywords(photo)
    end

    local root = createKeyword(catalog, PLUGIN_KEYWORD_ROOT, nil)
    local taxonomyRoot = createKeyword(catalog, "Taxonomie", root)
    local parent = taxonomyRoot
    for _, entry in ipairs(taxon.hierarchy or {}) do
      local value = TaxonomyRanks.displayTaxon(entry, taxon)
      local rank = string.lower(cleanText(entry.rank))
      if rank ~= "" then
        rankValues[rank] = cleanText(entry.scientificName)
      end
      if value ~= "" then
        local readableKeyword = utf8Prefix(value, 240)
        parent = createKeyword(catalog, readableKeyword, parent)
        table.insert(hierarchyPath, readableKeyword)
        for _, photo in ipairs(photos) do
          photo:addKeyword(parent)
        end
        keywordCount = keywordCount + 1
      end
    end

    local projectTaxonId = ""
    if taxon.projectLinks and taxon.projectLinks[1] then
      projectTaxonId = cleanText(taxon.projectLinks[1].project_taxon_key)
    end
    local assignedAt = os.date("!%Y-%m-%dT%H:%M:%SZ")
    local taxonomyPath = boundedPath(hierarchyPath)
    for _, photo in ipairs(photos) do
      setText(photo, "masterTaxonId", taxon.masterTaxonId)
      setText(photo, "projectTaxonId", projectTaxonId)
      setText(photo, "germanName", taxon.germanName)
      setText(photo, "englishName", taxon.englishName)
      setText(photo, "scientificName", taxon.acceptedScientificName)
      setText(photo, "taxonRank", taxon.rank)
      setText(photo, "taxonomyPath", taxonomyPath)
      for _, rank in ipairs(TaxonomyRanks.all()) do
        setText(photo, TaxonomyRanks.metadataFieldId(rank.id), rankValues[rank.id] or "")
      end
      setText(photo, "assignedAt", assignedAt)
    end
  end)

  PluginState.markStatisticsDirty()

  return {
    photoCount = #photos,
    keywordCount = keywordCount,
    hierarchyCount = #hierarchyPath,
  }
end

function KeywordWriter.remove(catalog, photos)
  local removedKeywords = 0
  local removedAssignments = 0
  catalog:withWriteAccessDo("FN Wildlife Taxonomie entfernen", function()
    for _, photo in ipairs(photos) do
      if cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId")) ~= "" then
        removedAssignments = removedAssignments + 1
      end
      removedKeywords = removedKeywords + removeManagedKeywords(photo)
      clearPluginMetadata(photo)
    end
  end)
  PluginState.markStatisticsDirty()
  return {
    photoCount = #photos,
    assignmentCount = removedAssignments,
    keywordCount = removedKeywords,
  }
end

function KeywordWriter.rankLabel(rank)
  return TaxonomyRanks.label(rank)
end

function KeywordWriter.displayTaxon(entry, taxon)
  return TaxonomyRanks.displayTaxon(entry or {}, taxon)
end

return KeywordWriter
