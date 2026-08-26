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
  "taxonomyKeywordIds",
  "assignedAt",
}
for _, rank in ipairs(TaxonomyRanks.all()) do
  table.insert(METADATA_FIELDS, TaxonomyRanks.metadataFieldId(rank.id))
end

local cleanText = TaxonomyRanks.cleanText

-- Nur fuer die von Lightroom erzeugte Stichworthierarchie. Die
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

local function keywordChildren(keyword)
  local ok, value = pcall(function()
    return keyword:getChildren()
  end)
  return ok and value or {}
end

local function keywordParent(keyword)
  local ok, value = pcall(function()
    return keyword:getParent()
  end)
  return ok and value or nil
end

local function findKeywordByName(keywords, name)
  for _, keyword in ipairs(keywords or {}) do
    if keywordName(keyword) == name then
      return keyword
    end
  end
  return nil
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

local function splitTaxonomyPath(value)
  local parts = {}
  for part in string.gmatch(cleanText(value), "([^>]+)") do
    local cleaned = cleanText(part)
    if cleaned ~= "" then
      table.insert(parts, cleaned)
    end
  end
  return parts
end

local function assignedKeywordMap(photo)
  local byId = {}
  for _, keyword in ipairs(photo:getRawMetadata("keywords") or {}) do
    local id = keywordLocalIdentifier(keyword)
    if id then
      byId[id] = keyword
    end
  end
  return byId
end

local function assignedKeywords(photo)
  local ok, value = pcall(function()
    return photo:getRawMetadata("keywords")
  end)
  return ok and value or {}
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

local function isPluginTaxonomyKeyword(keyword)
  local current = keyword
  local depth = 0
  while current and depth < 64 do
    local name = keywordName(current)
    if name == "Taxonomie" or name == "Artnamen" then
      local parent = keywordParent(current)
      return parent ~= nil and keywordName(parent) == PLUGIN_KEYWORD_ROOT
    end
    current = keywordParent(current)
    depth = depth + 1
  end
  return false
end

local function legacyRankPrefix(name)
  for _, rank in ipairs(TaxonomyRanks.all()) do
    local prefix = rank.label .. ":"
    if string.sub(name, 1, string.len(prefix)) == prefix then
      return true
    end
  end
  return false
end

local function appendLegacyValue(values, value)
  local cleaned = cleanText(value)
  if cleaned ~= "" then
    values[cleaned] = true
    values[string.lower(cleaned)] = true
  end
end

local function legacyMetadataValues(photo)
  local values = {}
  for _, field in ipairs({ "germanName", "englishName", "scientificName" }) do
    appendLegacyValue(values, photo:getPropertyForPlugin(_PLUGIN, field))
  end
  for _, part in ipairs(splitTaxonomyPath(photo:getPropertyForPlugin(_PLUGIN, "taxonomyPath"))) do
    appendLegacyValue(values, part)
  end
  for _, rank in ipairs(TaxonomyRanks.all()) do
    appendLegacyValue(
      values,
      photo:getPropertyForPlugin(_PLUGIN, TaxonomyRanks.metadataFieldId(rank.id))
    )
  end
  return values
end

local function malformedLegacyKeywordTargets(photo)
  local assigned = assignedKeywords(photo)
  local prefixed = {}
  local containsTableArtifact = false
  for _, keyword in ipairs(assigned) do
    local name = keywordName(keyword)
    if legacyRankPrefix(name) then
      table.insert(prefixed, keyword)
      if string.find(string.lower(name), "table:", 1, true) then
        containsTableArtifact = true
      end
    end
  end

  -- Eine einzelne, manuell angelegte Beschriftung wie "Art: Vogel" darf nie
  -- als Plug-in-Altlast gelten. Frühere Plug-in-Versionen sind eindeutig an
  -- mehreren Rangpräfixen und mindestens einem serialisierten table:-Wert zu
  -- erkennen.
  if #prefixed < 3 or not containsTableArtifact then
    return {}
  end

  -- Dieselbe frühe Testversion schrieb zusätzlich die reinen Namen flach in
  -- Lightrooms allgemeine Stichwortliste. Sobald die technische Signatur oben
  -- eindeutig erkannt wurde, dürfen deshalb auch exakt zu den gespeicherten
  -- Plug-in-Metadaten gehörende Namenswerte entfernt werden. Freie manuelle
  -- Stichwörter, die nicht exakt in dieser Taxonomie vorkommen, bleiben
  -- unangetastet.
  local legacyValues = legacyMetadataValues(photo)
  local candidates = {}
  for _, keyword in ipairs(assigned) do
    local name = keywordName(keyword)
    if legacyRankPrefix(name)
      or legacyValues[name]
      or legacyValues[string.lower(name)]
    then
      table.insert(candidates, keyword)
    end
  end
  return candidates
end

local function resolveLegacyKeywordTargets(catalog, photo)
  local targets = {}
  local path = splitTaxonomyPath(photo:getPropertyForPlugin(_PLUGIN, "taxonomyPath"))
  if #path == 0 then
    return targets
  end

  local root = findKeywordByName(catalog:getKeywords(), PLUGIN_KEYWORD_ROOT)
  if not root then
    return targets
  end
  local parent = findKeywordByName(keywordChildren(root), "Taxonomie")
  if not parent then
    return targets
  end

  for _, part in ipairs(path) do
    parent = findKeywordByName(keywordChildren(parent), part)
    if not parent then
      break
    end
    table.insert(targets, parent)
  end
  return targets
end

local function resolveManagedKeywordTargets(catalog, photo)
  local targets = {}
  local seen = {}
  local assigned = assignedKeywordMap(photo)
  local ids = parseKeywordIds(photo:getPropertyForPlugin(_PLUGIN, "taxonomyKeywordIds"))
  for id in pairs(ids) do
    if assigned[id] then
      appendUniqueKeyword(targets, seen, assigned[id])
    end
  end

  -- Zusätzlich werden ausschließlich tatsächlich am Foto hängende
  -- Stichwörter unterhalb des exakten Plug-in-Zweigs aufgelöst. Das deckt
  -- Kataloge ab, in denen Lightroom keine stabile lokale Kennung geliefert
  -- hat, ohne gleichnamige manuelle Stichwörter außerhalb des Zweigs zu
  -- berühren.
  for _, keyword in ipairs(assignedKeywords(photo)) do
    if isPluginTaxonomyKeyword(keyword) then
      appendUniqueKeyword(targets, seen, keyword)
    end
  end

  -- Migration bestehender Zuweisungen mit gespeichertem Taxonomiepfad.
  for _, keyword in ipairs(resolveLegacyKeywordTargets(catalog, photo)) do
    appendUniqueKeyword(targets, seen, keyword)
  end

  -- Sehr frühe Testversionen legten technische Rangtexte flach an. Diese
  -- werden nur über ihre eindeutige Mehrfachsignatur entfernt.
  for _, keyword in ipairs(malformedLegacyKeywordTargets(photo)) do
    appendUniqueKeyword(targets, seen, keyword)
  end

  return targets
end

local function removeManagedKeywords(photo, targets)
  local removed = 0
  for _, keyword in ipairs(targets or {}) do
    -- Ausschließlich die bei der Zuweisung gespeicherten Stichwortobjekte des
    -- Plug-in-Zweigs werden vom Foto getrennt. Alle sonstigen, auch manuell
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
  local keywordIds = {}
  local keywordCount = 0
  catalog:withWriteAccessDo("FN Wildlife Taxonomie zuweisen", function()
    for index, photo in ipairs(photos) do
      removeManagedKeywords(photo, previousKeywordTargets[index])
    end

    local root = createKeyword(catalog, PLUGIN_KEYWORD_ROOT, nil)
    local taxonomyRoot = createKeyword(catalog, "Taxonomie", root)
    local parent = taxonomyRoot
    for _, entry in ipairs(taxon.hierarchy or {}) do
      local metadataValue = TaxonomyRanks.displayTaxon(entry, taxon)
      local value = taxonomyKeywordName(entry, taxon)
      local rank = string.lower(cleanText(entry.rank))
      if rank ~= "" then
        rankValues[rank] = cleanText(entry.scientificName)
      end
      if value ~= "" then
        local readableKeyword = utf8Prefix(value, 240)
        parent = createKeyword(catalog, readableKeyword, parent)
        table.insert(hierarchyPath, utf8Prefix(metadataValue, 240))
        local keywordId = keywordLocalIdentifier(parent)
        if keywordId then
          table.insert(keywordIds, tostring(keywordId))
        end
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
      setText(photo, "taxonomyKeywordIds", table.concat(keywordIds, ","))
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
