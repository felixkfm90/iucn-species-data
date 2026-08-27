local PluginState = require "PluginState"
local TaxonomyRanks = require "TaxonomyRanks"

local KeywordWriter = {}

local PLUGIN_KEYWORD_SUFFIX = " (FN)"
local METADATA_FIELDS = {
  "masterTaxonId",
  "projectTaxonId",
  "germanName",
  "englishName",
  "scientificName",
  "taxonRank",
  "taxonomyPath",
  "taxonomyKeywordIds",
  "assignedAt",
}
for _, rank in ipairs(TaxonomyRanks.all()) do
  table.insert(METADATA_FIELDS, TaxonomyRanks.metadataFieldId(rank.id))
end

local cleanText = TaxonomyRanks.cleanText

-- Nur fuer die von Lightroom erzeugten Stichwörter. Die
-- wissenschaftlichen Rohwerte in den Zusatzmodul-Metadaten bleiben davon
-- unberuehrt.
local GERMAN_KEYWORD_NAMES = {
  class = {
    amphibia = "Amphibien",
    aves = "Vögel",
    mammalia = "Säugetiere",
    reptilia = "Reptilien",
  },
  order = {
    passeriformes = "Sperlingsvögel",
  },
  family = {
    paridae = "Meisen",
  },
}

local function taxonomyKeywordName(entry, taxon)
  local rank = string.lower(cleanText(entry.rank))
  local scientificName = cleanText(entry.scientificName)
  local germanName = cleanText(entry.germanName)
  if germanName == "" and rank == "species" then
    germanName = cleanText(taxon and taxon.germanName)
  end
  if germanName ~= "" then
    return germanName
  end

  local rankNames = GERMAN_KEYWORD_NAMES[rank]
  local translatedName = rankNames and rankNames[string.lower(scientificName)] or nil
  return translatedName or scientificName
end

local function createKeyword(catalog, name, parent)
  return catalog:createKeyword(name, {}, true, parent, true)
end

local function keywordName(keyword)
  local ok, value = pcall(function()
    return keyword:getName()
  end)
  return ok and cleanText(value) or ""
end

local function keywordLocalIdentifier(keyword)
  local ok, value = pcall(function()
    return keyword.localIdentifier
  end)
  value = ok and cleanText(value) or ""
  if value == "" then
    ok, value = pcall(function()
      return keyword:getLocalIdentifier()
    end)
    value = ok and cleanText(value) or ""
  end
  -- Lightroom behandelt lokale Stichwortkennungen abhängig von Version und
  -- Plattform als Zahl oder undurchsichtige Zeichenfolge. Die Kennung darf
  -- deshalb nicht numerisch normalisiert werden.
  return value ~= "" and value or nil
end

local function parseKeywordIds(value)
  local ids = {}
  for part in string.gmatch(cleanText(value), "[^,]+") do
    local id = cleanText(part)
    if id ~= "" then
      ids[id] = true
    end
  end
  return ids
end

local function appendUniqueKeyword(targets, seen, keyword)
  if not keyword then
    return
  end
  local id = keywordLocalIdentifier(keyword)
  local key = id and ("id:" .. id) or ("object:" .. tostring(keyword))
  if seen[key] then
    return
  end
  seen[key] = true
  table.insert(targets, keyword)
end

local function hasPluginKeywordSuffix(keyword)
  local name = keywordName(keyword)
  return string.sub(name, -string.len(PLUGIN_KEYWORD_SUFFIX)) == PLUGIN_KEYWORD_SUFFIX
end

local function resolveManagedKeywordTargets(catalog, photo)
  local targets = {}
  local seen = {}
  local allPluginKeywords = {}
  local pluginKeywordsById = {}
  for _, keyword in ipairs(catalog:getKeywords() or {}) do
    if hasPluginKeywordSuffix(keyword) then
      table.insert(allPluginKeywords, keyword)
      local id = keywordLocalIdentifier(keyword)
      if id then
        pluginKeywordsById[id] = keyword
      end
    end
  end

  local storedIds = cleanText(photo:getPropertyForPlugin(_PLUGIN, "taxonomyKeywordIds"))
  local ids = parseKeywordIds(storedIds)
  for id in pairs(ids) do
    if pluginKeywordsById[id] then
      appendUniqueKeyword(targets, seen, pluginKeywordsById[id])
    end
  end

  -- Nach einem früheren fehlgeschlagenen Löschlauf können die Metadaten und
  -- damit auch die gespeicherten IDs bereits leer sein. Da (FN) für diese
  -- flachen Plug-in-Stichwörter reserviert ist, dürfen dann alle so
  -- gekennzeichneten Katalogobjekte als sichere Entfernungsziele dienen.
  if #targets == 0 then
    for _, keyword in ipairs(allPluginKeywords) do
      appendUniqueKeyword(targets, seen, keyword)
    end
  end
  return targets
end

local function removeManagedKeywords(photo, targets)
  local removed = 0
  for _, keyword in ipairs(targets or {}) do
    -- Ausschließlich eindeutig mit (FN) gekennzeichnete Plug-in-
    -- Stichwortobjekte werden vom Foto getrennt. Alle sonstigen, auch manuell
    -- gepflegten Lightroom-Stichwörter bleiben unverändert erhalten.
    photo:removeKeyword(keyword)
    removed = removed + 1
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

local function managedKeywordName(value)
  local maximumNameBytes = 240 - string.len(PLUGIN_KEYWORD_SUFFIX)
  return utf8Prefix(value, maximumNameBytes) .. PLUGIN_KEYWORD_SUFFIX
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

  local previousKeywordTargets = {}
  for index, photo in ipairs(photos) do
    previousKeywordTargets[index] = resolveManagedKeywordTargets(catalog, photo)
  end

  local hierarchyPath = {}
  local rankValues = {}
  local managedKeywords = {}
  local keywordCount = 0
  catalog:withWriteAccessDo("FN Wildlife Taxonomie zuweisen", function()
    for index, photo in ipairs(photos) do
      removeManagedKeywords(photo, previousKeywordTargets[index])
    end

    for _, entry in ipairs(taxon.hierarchy or {}) do
      local metadataValue = TaxonomyRanks.displayTaxon(entry, taxon)
      local value = taxonomyKeywordName(entry, taxon)
      local rank = string.lower(cleanText(entry.rank))
      if rank ~= "" then
        rankValues[rank] = cleanText(entry.scientificName)
      end
      if value ~= "" then
        local readableKeyword = managedKeywordName(value)
        local keyword = createKeyword(catalog, readableKeyword, nil)
        table.insert(hierarchyPath, utf8Prefix(metadataValue, 240))
        table.insert(managedKeywords, keyword)
        for _, photo in ipairs(photos) do
          photo:addKeyword(keyword)
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
    for index, photo in ipairs(photos) do
      local storedKeywordIds = {}
      for _, keyword in ipairs(managedKeywords) do
        local keywordId = keywordLocalIdentifier(keyword)
        if keywordId then
          table.insert(storedKeywordIds, tostring(keywordId))
        end
      end
      setText(photo, "masterTaxonId", taxon.masterTaxonId)
      setText(photo, "projectTaxonId", projectTaxonId)
      setText(photo, "germanName", taxon.germanName)
      setText(photo, "englishName", taxon.englishName)
      setText(photo, "scientificName", taxon.acceptedScientificName)
      setText(photo, "taxonRank", taxon.rank)
      setText(photo, "taxonomyPath", taxonomyPath)
      setText(
        photo,
        "taxonomyKeywordIds",
        #storedKeywordIds > 0 and table.concat(storedKeywordIds, ",") or "none"
      )
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
  local keywordTargets = {}
  for index, photo in ipairs(photos) do
    keywordTargets[index] = resolveManagedKeywordTargets(catalog, photo)
  end
  catalog:withWriteAccessDo("FN Wildlife Taxonomie entfernen", function()
    for index, photo in ipairs(photos) do
      if cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId")) ~= "" then
        removedAssignments = removedAssignments + 1
      end
      removedKeywords = removedKeywords + removeManagedKeywords(photo, keywordTargets[index])
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
