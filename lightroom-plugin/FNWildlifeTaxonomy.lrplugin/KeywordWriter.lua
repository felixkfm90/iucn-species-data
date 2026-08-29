local PluginState = require "PluginState"
local TaxonomyRanks = require "TaxonomyRanks"

local KeywordWriter = {}

local PLUGIN_KEYWORD_SUFFIX = " (FN)"
local PLUGIN_PARTIAL_KEYWORD_SUFFIX = PLUGIN_KEYWORD_SUFFIX .. "*"
local WRITE_ACCESS_TIMEOUT_SECONDS = 10
local WRITE_ACCESS_BUSY_MESSAGE =
  "Lightroom ist noch mit einem anderen Katalogvorgang beschäftigt. Bitte warten und erneut versuchen."
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
  if type(keyword) == "string" then
    return cleanText(keyword)
  end
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

local function appendUniqueName(targets, seen, value)
  local name = cleanText(value)
  if name == "" or seen[name] then
    return
  end
  seen[name] = true
  table.insert(targets, name)
end

local function hasPluginKeywordNameSuffix(value)
  local name = cleanText(value)
  return string.sub(name, -string.len(PLUGIN_KEYWORD_SUFFIX)) == PLUGIN_KEYWORD_SUFFIX
    or string.sub(name, -string.len(PLUGIN_PARTIAL_KEYWORD_SUFFIX))
      == PLUGIN_PARTIAL_KEYWORD_SUFFIX
end

local function hasPluginKeywordSuffix(keyword)
  return hasPluginKeywordNameSuffix(keywordName(keyword))
end

local function resolveManagedKeywordNames(catalog, photo)
  local names = {}
  local seen = {}
  local ok, assigned = pcall(function()
    return photo:getRawMetadata("keywords")
  end)
  local function appendAssignedKeyword(candidate)
    if hasPluginKeywordSuffix(candidate) then
      appendUniqueName(names, seen, keywordName(candidate))
    end
  end
  for key, value in pairs(ok and assigned or {}) do
    -- Lightroom liefert diese Tabelle abhängig von der Version entweder als
    -- Liste oder als Menge mit dem Stichwortobjekt als Schlüssel.
    appendAssignedKeyword(key)
    appendAssignedKeyword(value)
  end

  -- Einige Lightroom-Stände liefern die formatierten Stichwort-Tags
  -- zuverlässiger als die rohen Stichwortobjekte. Da neue Plug-in-
  -- Stichwörter flach sind, kann die kommagetrennte Anzeige hier gezielt auf
  -- das reservierte Suffix geprüft werden.
  local formattedOk, formatted = pcall(function()
    return photo:getFormattedMetadata("keywordTags")
  end)
  if formattedOk then
    for part in string.gmatch(tostring(formatted or ""), "([^,]+)") do
      local name = cleanText(part)
      if hasPluginKeywordNameSuffix(name) then
        appendUniqueName(names, seen, name)
      end
    end
  end

  local storedIds = cleanText(photo:getPropertyForPlugin(_PLUGIN, "taxonomyKeywordIds"))
  local ids = parseKeywordIds(storedIds)
  for id in pairs(ids) do
    local ok, keyword = pcall(function()
      return catalog:getKeywordByLocalIdentifier(id)
    end)
    if ok and keyword and hasPluginKeywordSuffix(keyword) then
      appendUniqueName(names, seen, keywordName(keyword))
    end
  end
  return names
end

local function removeManagedKeywords(catalog, photo, names)
  local removed = 0
  for _, name in ipairs(names or {}) do
    -- Ausschließlich eindeutig mit (FN) oder (FN)* gekennzeichnete Plug-in-
    -- Stichwortobjekte werden vom Foto getrennt. Alle sonstigen, auch manuell
    -- gepflegten Lightroom-Stichwörter bleiben unverändert erhalten.
    -- createKeyword liefert mit returnExisting=true dasselbe Katalogobjekt,
    -- das auch bei der Zuweisung an photo:addKeyword übergeben wurde.
    local keyword = createKeyword(catalog, name, nil)
    photo:removeKeyword(keyword)
    removed = removed + 1
  end
  return removed
end

local function managedKeywordNamesFromMetadata(photo)
  local names = {}
  local seen = {}
  local pathParts = {}
  local taxonomyPath = cleanText(photo:getPropertyForPlugin(_PLUGIN, "taxonomyPath"))
  for part in string.gmatch(taxonomyPath, "([^>]+)") do
    table.insert(pathParts, cleanText(part))
  end

  local pathIndex = 1
  local taxon = {
    germanName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "germanName")),
  }
  for _, rank in ipairs(TaxonomyRanks.all()) do
    local scientificName = cleanText(
      photo:getPropertyForPlugin(_PLUGIN, TaxonomyRanks.metadataFieldId(rank.id))
    )
    if scientificName ~= "" then
      local displayName = pathParts[pathIndex] or scientificName
      local germanName = displayName ~= scientificName and displayName or ""
      local name = taxonomyKeywordName({
        rank = rank.id,
        scientificName = scientificName,
        germanName = germanName,
      }, taxon)
      appendUniqueName(names, seen, managedKeywordName(name))
      pathIndex = pathIndex + 1
    end
  end
  return names
end

local function removeCurrentManagedKeywords(catalog, photo)
  local removed = 0
  local seen = {}

  local function removeCandidate(candidate)
    local name = keywordName(candidate)
    if not hasPluginKeywordNameSuffix(name) or seen[name] then
      return
    end
    seen[name] = true
    local keyword = type(candidate) == "string" and createKeyword(catalog, name, nil) or candidate
    photo:removeKeyword(keyword)
    removed = removed + 1
  end

  -- Der bei der Zuweisung gespeicherte Taxonomiepfad bildet zusammen mit den
  -- wissenschaftlichen Rangwerten exakt dieselben sichtbaren Namen nach, die
  -- assign() an createKeyword uebergibt. Dieser deterministische Rueckweg ist
  -- noetig, weil Lightroom die zugeordneten Stichwortobjekte nicht in allen
  -- Versionen zuverlaessig ueber getRawMetadata("keywords") zurueckliefert.
  for _, name in ipairs(managedKeywordNamesFromMetadata(photo)) do
    removeCandidate(name)
  end

  local ok, assigned = pcall(function()
    return photo:getRawMetadata("keywords")
  end)
  for key, value in pairs(ok and assigned or {}) do
    removeCandidate(key)
    removeCandidate(value)
  end

  local formattedOk, formatted = pcall(function()
    return photo:getFormattedMetadata("keywordTags")
  end)
  if formattedOk then
    for part in string.gmatch(tostring(formatted or ""), "([^,]+)") do
      removeCandidate(cleanText(part))
    end
  end

  local storedIds = parseKeywordIds(photo:getPropertyForPlugin(_PLUGIN, "taxonomyKeywordIds"))
  for id in pairs(storedIds) do
    local idOk, keyword = pcall(function()
      return catalog:getKeywordByLocalIdentifier(id)
    end)
    if idOk and keyword then
      removeCandidate(keyword)
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

local function metadataText(value)
  -- Lightroom begrenzt indizierte String-Metadaten auf weniger als 512 Byte.
  return utf8Prefix(value, 460)
end

local function setText(photo, field, value)
  photo:setPropertyForPlugin(_PLUGIN, field, metadataText(value))
end

local function runWithWriteAccess(catalog, actionName, callback)
  local ok, result = pcall(function()
    return catalog:withWriteAccessDo(actionName, callback, {
      timeout = WRITE_ACCESS_TIMEOUT_SECONDS,
    })
  end)
  if ok then
    return result
  end
  local message = tostring(result)
  local lowerMessage = string.lower(message)
  if string.find(lowerMessage, "blocked by another write access call", 1, true)
      or (string.find(lowerMessage, "write access", 1, true)
        and string.find(lowerMessage, "timeout", 1, true)) then
    error(WRITE_ACCESS_BUSY_MESSAGE, 0)
  end
  error(message, 0)
end

local function assignmentError(taxon, keyword, step, photoCount, reason)
  local germanName = cleanText(taxon and taxon.germanName)
  local scientificName = cleanText(taxon and taxon.acceptedScientificName)
  local keywordName = cleanText(keyword)
  local stepName = cleanText(step)
  return "Taxonomiezuweisung fehlgeschlagen · Deutscher Artname: "
    .. (germanName ~= "" and germanName or "nicht vorhanden")
    .. " · Wissenschaftlicher Name: "
    .. (scientificName ~= "" and scientificName or "nicht vorhanden")
    .. " · Keyword: "
    .. (keywordName ~= "" and keywordName or "keines")
    .. " · Arbeitsschritt: "
    .. (stepName ~= "" and stepName or "nicht bekannt")
    .. " · Fotos: "
    .. tostring(photoCount)
    .. " · Ursache: "
    .. tostring(reason)
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
        .. (#conflicts == 1 and " ausgewähltes Foto besitzt" or " ausgewählte Fotos besitzen")
        .. " bereits eine andere Taxonomiezuordnung. "
        .. "Das Plug-in überschreibt diese nicht."
    )
  end

  local previousKeywordNames = {}
  for index, photo in ipairs(photos) do
    previousKeywordNames[index] = resolveManagedKeywordNames(catalog, photo)
  end

  local hierarchyPath = {}
  local rankValues = {}
  local managedKeywordNames = {}
  local seenKeywordNames = {}
  for _, entry in ipairs(taxon.hierarchy or {}) do
    local metadataValue = TaxonomyRanks.displayTaxon(entry, taxon)
    local value = taxonomyKeywordName(entry, taxon)
    local rank = string.lower(cleanText(entry.rank))
    if rank ~= "" then
      rankValues[rank] = cleanText(entry.scientificName)
    end
    if metadataValue ~= "" then
      table.insert(hierarchyPath, utf8Prefix(metadataValue, 240))
    end
    if value ~= "" then
      local readableKeyword = managedKeywordName(value)
      local keywordKey = string.lower(readableKeyword)
      if not seenKeywordNames[keywordKey] then
        seenKeywordNames[keywordKey] = true
        table.insert(managedKeywordNames, readableKeyword)
      end
    end
  end

  local managedKeywords = {}
  runWithWriteAccess(catalog, "FN Wildlife Taxonomie zuweisen", function()
    for index, photo in ipairs(photos) do
      local ok, removeError = pcall(
        removeManagedKeywords,
        catalog,
        photo,
        previousKeywordNames[index]
      )
      if not ok then
        error(
          assignmentError(
            taxon,
            "",
            "vorhandene (FN)-Stichwörter entfernen",
            #photos,
            removeError
          ),
          0
        )
      end
    end

    for _, readableKeyword in ipairs(managedKeywordNames) do
      local ok, keyword = pcall(createKeyword, catalog, readableKeyword, nil)
      if not ok or not keyword then
        error(
          assignmentError(
            taxon,
            readableKeyword,
            "Stichwort erzeugen",
            #photos,
            ok and "Lightroom lieferte kein Stichwortobjekt zurück." or keyword
          ),
          0
        )
      end
      table.insert(managedKeywords, keyword)
      for _, photo in ipairs(photos) do
        local added, addError = pcall(function()
          photo:addKeyword(keyword)
        end)
        if not added then
          error(
            assignmentError(
              taxon,
              readableKeyword,
              "Stichwort zum Foto hinzufügen",
              #photos,
              addError
            ),
            0
          )
        end
      end
    end

    local projectTaxonId = ""
    if taxon.projectLinks and taxon.projectLinks[1] then
      projectTaxonId = cleanText(taxon.projectLinks[1].project_taxon_key)
    end
    local assignedAt = os.date("!%Y-%m-%dT%H:%M:%SZ")
    local taxonomyPath = boundedPath(hierarchyPath)
    local storedKeywordIds = {}
    local seenKeywordIds = {}
    for _, keyword in ipairs(managedKeywords) do
      local keywordId = keywordLocalIdentifier(keyword)
      if keywordId and not seenKeywordIds[keywordId] then
        seenKeywordIds[keywordId] = true
        table.insert(storedKeywordIds, tostring(keywordId))
      end
    end

    local function setAssignmentText(photo, field, value)
      local ok, setError = pcall(setText, photo, field, value)
      if not ok then
        error(
          assignmentError(
            taxon,
            "",
            "Metadatenfeld " .. field .. " schreiben",
            #photos,
            setError
          ),
          0
        )
      end
    end

    for _, photo in ipairs(photos) do
      setAssignmentText(photo, "masterTaxonId", taxon.masterTaxonId)
      setAssignmentText(photo, "projectTaxonId", projectTaxonId)
      setAssignmentText(photo, "germanName", taxon.germanName)
      setAssignmentText(photo, "englishName", taxon.englishName)
      setAssignmentText(photo, "scientificName", taxon.acceptedScientificName)
      setAssignmentText(photo, "taxonRank", taxon.rank)
      setAssignmentText(photo, "taxonomyPath", taxonomyPath)
      setAssignmentText(
        photo,
        "taxonomyKeywordIds",
        #storedKeywordIds > 0 and table.concat(storedKeywordIds, ",") or "none"
      )
      for _, rank in ipairs(TaxonomyRanks.all()) do
        setAssignmentText(photo, TaxonomyRanks.metadataFieldId(rank.id), rankValues[rank.id] or "")
      end
      setAssignmentText(photo, "assignedAt", assignedAt)
    end
  end)

  PluginState.markStatisticsDirty()

  return {
    photoCount = #photos,
    keywordCount = #managedKeywordNames,
    hierarchyCount = #hierarchyPath,
  }
end

function KeywordWriter.remove(catalog, photos)
  local removedKeywords = 0
  local removedAssignments = 0
  runWithWriteAccess(catalog, "FN Wildlife Taxonomie entfernen", function()
    for _, photo in ipairs(photos) do
      if cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId")) ~= "" then
        removedAssignments = removedAssignments + 1
      end
      removedKeywords = removedKeywords + removeCurrentManagedKeywords(catalog, photo)
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
