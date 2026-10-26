local LrTasks = import "LrTasks"
local PluginState = require "PluginState"
local Statistics = require "Statistics"
local LocationTimeWriter = require "LocationTimeWriter"
local KeywordIdFinalizer = require "KeywordIdFinalizer"
local TaxonomyRanks = require "TaxonomyRanks"

local KeywordWriter = {}

local PLUGIN_KEYWORD_SUFFIX = " (FN)"
local PLUGIN_PARTIAL_KEYWORD_SUFFIX = PLUGIN_KEYWORD_SUFFIX .. "*"
local WRITE_ACCESS_TIMEOUT_SECONDS = 10
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
  local ok, value = LrTasks.pcall(function()
    return keyword:getName()
  end)
  return ok and cleanText(value) or ""
end

local function keywordLocalIdentifier(keyword)
  local ok, value = LrTasks.pcall(function()
    return keyword.localIdentifier
  end)
  value = ok and cleanText(value) or ""
  if value == "" then
    ok, value = LrTasks.pcall(function()
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
  local ok, assigned = LrTasks.pcall(function()
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
  local formattedOk, formatted = LrTasks.pcall(function()
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
    local ok, keyword = LrTasks.pcall(function()
      return catalog:getKeywordByLocalIdentifier(id)
    end)
    if ok and keyword and hasPluginKeywordSuffix(keyword) then
      appendUniqueName(names, seen, keywordName(keyword))
    end
  end
  return names
end

local function removeManagedKeywords(catalog, photo, names, protectedNames)
  local removed = 0
  local ok, assigned = LrTasks.pcall(function() return photo:getRawMetadata("keywords") end)
  if not ok or type(assigned) ~= "table" then
    error("Lightroom konnte die vorhandenen Taxonomiestichwörter nicht vollständig lesen.", 0)
  end
  local candidates, seen = {}, {}
  for key, value in pairs(assigned) do
    local keyword = (type(key) == "table" or type(key) == "userdata") and key or value
    if type(keyword) ~= "table" and type(keyword) ~= "userdata" then
      error("Lightroom lieferte kein gültiges zugeordnetes Taxonomiestichwortobjekt.", 0)
    end
    if hasPluginKeywordSuffix(keyword) and not seen[keyword] then
      seen[keyword] = true
      table.insert(candidates, keyword)
    end
  end
  for _, keyword in ipairs(candidates) do
    local name = keywordName(keyword)
    -- Ausschließlich eindeutig mit (FN) oder (FN)* gekennzeichnete Plug-in-
    -- Stichwortobjekte werden vom Foto getrennt. Alle sonstigen, auch manuell
    -- gepflegten Lightroom-Stichwörter bleiben unverändert erhalten.
    -- Reale Objekte verwenden: createKeyword darf innerhalb eines Blocks
    -- nicht für Entfernung und erneute Anlage desselben Namens laufen.
    if not protectedNames or not protectedNames[string.lower(name)] then
      photo:removeKeyword(keyword)
      removed = removed + 1
    end
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

local function removeCurrentManagedKeywords(catalog, photo, protectedNames)
  local removed = 0
  local seenObjects, seenNames = {}, {}

  local function removeCandidate(candidate)
    local name = keywordName(candidate)
    if not hasPluginKeywordNameSuffix(name) then
      return
    end
    if protectedNames and protectedNames[string.lower(name)] then
      return
    end
    if type(candidate) == "string" and seenNames[name] then return end
    local keyword = type(candidate) == "string" and createKeyword(catalog, name, nil) or candidate
    local identifier = keywordLocalIdentifier(keyword)
    local objectKey = identifier and ("id:" .. identifier) or keyword
    if seenObjects[objectKey] then return end
    seenObjects[objectKey] = true
    seenNames[name] = true
    photo:removeKeyword(keyword)
    removed = removed + 1
  end

  -- Tatsächliche Objekte zuerst: gleichnamige Stichwörter können unter
  -- verschiedenen Eltern liegen und sind verschiedene Zuordnungen.
  local ok, assigned = LrTasks.pcall(function()
    return photo:getRawMetadata("keywords")
  end)
  for key, value in pairs(ok and assigned or {}) do
    removeCandidate(key)
    removeCandidate(value)
  end

  -- Deterministischer Rückweg für ältere SDK-Stände mit unvollständiger
  -- Objektliste. Er erzeugt keine zweite Entfernung bereits gelesener Namen.
  for _, name in ipairs(managedKeywordNamesFromMetadata(photo)) do
    removeCandidate(name)
  end

  local formattedOk, formatted = LrTasks.pcall(function()
    return photo:getFormattedMetadata("keywordTags")
  end)
  if formattedOk then
    for part in string.gmatch(tostring(formatted or ""), "([^,]+)") do
      removeCandidate(cleanText(part))
    end
  end

  local storedIds = parseKeywordIds(photo:getPropertyForPlugin(_PLUGIN, "taxonomyKeywordIds"))
  for id in pairs(storedIds) do
    local idOk, keyword = LrTasks.pcall(function()
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

local function setText(photo, field, value, expectedMetadata)
  local text = metadataText(value)
  photo:setPropertyForPlugin(_PLUGIN, field, text)
  if expectedMetadata then KeywordIdFinalizer.recordMetadata(expectedMetadata, photo, field, text) end
end

local function runWithWriteAccess(catalog, actionName, callback, errorFormatter)
  -- Der Aufrufer startet bereits eine LrTask. Der Katalogzugriff bleibt hier
  -- direkt, damit keine zusätzliche Task- oder Fehlergrenze den SDK-Aufruf
  -- als blockierten Schreibvorgang erscheinen lässt.
  local completed = false
  local result = catalog:withWriteAccessDo(
    actionName,
    function()
      local callbackResult = callback()
      completed = true
      return callbackResult
    end,
    { timeout = WRITE_ACCESS_TIMEOUT_SECONDS }
  )
  if completed then
    return result
  end

  local message = "Lightroom konnte den Katalog-Schreibzugriff innerhalb von "
    .. tostring(WRITE_ACCESS_TIMEOUT_SECONDS)
    .. " Sekunden nicht ausführen. Bitte kurz warten und erneut versuchen."
  if errorFormatter then
    error(errorFormatter(message), 0)
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

local function taxonomyAssignmentMatches(photo, template)
  for field, value in pairs(template.values) do
    if field ~= "assignedAt" and field ~= "taxonomyKeywordIds"
        and cleanText(photo:getPropertyForPlugin(_PLUGIN, field)) ~= value then return false end
  end
  if cleanText(photo:getPropertyForPlugin(_PLUGIN, "assignedAt")) == "" then return false end
  local wanted, actual, ids = {}, {}, {}
  for _, name in ipairs(template.names) do wanted[string.lower(name)] = true end
  local assigned = photo:getRawMetadata("keywords")
  if type(assigned) ~= "table" then error("Lightroom konnte die Taxonomiestichwörter nicht vollständig lesen.", 0) end
  for key, value in pairs(assigned) do
    local keyword = (type(key) == "table" or type(key) == "userdata") and key or value
    if type(keyword) ~= "table" and type(keyword) ~= "userdata" then
      error("Lightroom lieferte kein gültiges Taxonomiestichwortobjekt.", 0)
    end
    if hasPluginKeywordSuffix(keyword) then
      local name = string.lower(keywordName(keyword))
      if not wanted[name] or actual[name] then return false end
      actual[name] = true
      local id = keywordLocalIdentifier(keyword)
      if id then ids[id] = true end
    end
  end
  for name in pairs(wanted) do if not actual[name] then return false end end
  local stored = cleanText(photo:getPropertyForPlugin(_PLUGIN, "taxonomyKeywordIds"))
  if next(ids) == nil then return stored == "none" end
  local storedIds = parseKeywordIds(stored)
  for id in pairs(ids) do if not storedIds[id] then return false end end
  for id in pairs(storedIds) do if not ids[id] then return false end end
  return true
end

function KeywordWriter.assign(catalog, photos, taxon, preparedLocationTimePlans, options)
  options = options or {}
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
  local beforeStatistics = {}
  local taxonomyChanges, updatedTaxonomyPhotoCount = {}, 0
  local template = options.skipUnchanged and KeywordWriter.identityTemplate(taxon) or nil
  local locationTimePlans = preparedLocationTimePlans
    or LocationTimeWriter.prepare(catalog, photos, { resolveSuggestedLocations = false })
  for index, photo in ipairs(photos) do
    previousKeywordNames[index] = resolveManagedKeywordNames(catalog, photo)
    beforeStatistics[index] = Statistics.photoSnapshot(photo)
    taxonomyChanges[photo] = not template or not taxonomyAssignmentMatches(photo, template)
    if taxonomyChanges[photo] then updatedTaxonomyPhotoCount = updatedTaxonomyPhotoCount + 1 end
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
  local currentKeyword = ""
  local currentStep = "Katalog-Schreibzugriff starten"
  local locationTimeResult
  local pendingKeywordIds = {}
  local expectedMetadataByPhoto = {}
  runWithWriteAccess(catalog, "FN Wildlife Taxonomie zuweisen", function()
    for index, photo in ipairs(photos) do
      if taxonomyChanges[photo] then
      currentKeyword = ""
      currentStep = "vorhandene (FN)-Stichwörter entfernen"
      removeManagedKeywords(
        catalog,
        photo,
        previousKeywordNames[index],
        LocationTimeWriter.managedKeywordNameSet(photo)
      )
      end
    end

    for _, readableKeyword in ipairs(updatedTaxonomyPhotoCount > 0 and managedKeywordNames or {}) do
      currentKeyword = readableKeyword
      currentStep = "Stichwort erzeugen"
      local keyword = createKeyword(catalog, readableKeyword, nil)
      if not keyword then
        error(
          "Lightroom lieferte kein Stichwortobjekt zurück.",
          0
        )
      end
      table.insert(managedKeywords, keyword)
      for _, photo in ipairs(photos) do
        if taxonomyChanges[photo] then
        currentStep = "Stichwort zum Foto hinzufügen"
        photo:addKeyword(keyword)
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
      currentKeyword = ""
      currentStep = "Metadatenfeld " .. field .. " schreiben"
      if not expectedMetadataByPhoto[photo] then
        expectedMetadataByPhoto[photo] = KeywordIdFinalizer.metadataExpectation(photo)
      end
      setText(photo, field, value, expectedMetadataByPhoto[photo])
    end

    for _, photo in ipairs(photos) do
      if taxonomyChanges[photo] then
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
    end
    currentKeyword = ""
    currentStep = "Orts- und Zeitstichwörter ergänzen"
    locationTimeResult = LocationTimeWriter.applyPrepared(
      catalog,
      photos,
      locationTimePlans,
      options.locationTimeMode == "update" and "update" or "add",
      { protectedNamesForPhoto = KeywordWriter.taxonomyKeywordNameSet,
        expectedMetadataByPhoto = expectedMetadataByPhoto }
    )
    local afterStatistics = {}
    for index in ipairs(photos) do
      afterStatistics[index] = Statistics.assignmentSnapshot(
        taxon,
        rankValues,
        beforeStatistics[index].referenceImage,
        beforeStatistics[index].photoUuid,
        beforeStatistics[index],
        locationTimeResult.afterValues[index]
      )
    end
    if updatedTaxonomyPhotoCount > 0 or locationTimeResult.changedPhotoCount > 0 then
      PluginState.applyStatisticsPhotoChanges(catalog, beforeStatistics, afterStatistics)
    end
    for _, pending in ipairs(locationTimeResult.pendingKeywordIds or {}) do
      table.insert(pendingKeywordIds, pending)
    end
    locationTimeResult.pendingKeywordIds = nil
    for _, photo in ipairs(photos) do
      if taxonomyChanges[photo] then
        table.insert(pendingKeywordIds, KeywordIdFinalizer.capture(
          photo, "taxonomyKeywordIds", managedKeywordNames, managedKeywords,
          expectedMetadataByPhoto[photo]
        ))
      end
    end
  end, function(reason)
    return assignmentError(taxon, currentKeyword, currentStep, #photos, reason)
  end)
  KeywordIdFinalizer.finalize(catalog, pendingKeywordIds)

  for _, photo in ipairs(photos) do
    local assignedTaxonId = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
    if assignedTaxonId ~= cleanText(taxon.masterTaxonId) then
      error(
        assignmentError(
          taxon,
          "",
          "Zuweisung verifizieren",
          #photos,
          "Lightroom hat das Plug-in-Metadatum masterTaxonId nicht gespeichert."
        ),
        0
      )
    end
  end

  return {
    photoCount = #photos,
    keywordCount = #managedKeywordNames,
    hierarchyCount = #hierarchyPath,
    updatedTaxonomyPhotoCount = updatedTaxonomyPhotoCount,
    unchangedTaxonomyPhotoCount = #photos - updatedTaxonomyPhotoCount,
    updatedLocationTimePhotoCount = locationTimeResult.changedPhotoCount,
    unchangedLocationTimePhotoCount = locationTimeResult.skippedPhotoCount,
    missingGpsAndLocationPhotoCount = locationTimeResult.missingGpsAndLocationPhotoCount,
    missingTimePhotoCount = locationTimeResult.missingTimePhotoCount,
  }
end

function KeywordWriter.remove(catalog, photos)
  local removedKeywords = 0
  local removedAssignments = 0
  local beforeStatistics = {}
  for index, photo in ipairs(photos) do
    beforeStatistics[index] = Statistics.photoSnapshot(photo)
  end
  runWithWriteAccess(catalog, "FN Wildlife Taxonomie entfernen", function()
    for _, photo in ipairs(photos) do
      if cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId")) ~= "" then
        removedAssignments = removedAssignments + 1
      end
      removedKeywords = removedKeywords
        + removeCurrentManagedKeywords(
          catalog,
          photo,
          LocationTimeWriter.managedKeywordNameSet(photo)
        )
      clearPluginMetadata(photo)
    end
    local afterStatistics = {}
    for index in ipairs(photos) do
      afterStatistics[index] = Statistics.emptySnapshot(beforeStatistics[index])
    end
    PluginState.applyStatisticsPhotoChanges(catalog, beforeStatistics, afterStatistics)
  end)
  return {
    photoCount = #photos,
    assignmentCount = removedAssignments,
    keywordCount = removedKeywords,
  }
end

-- Read-only template for the separate, confirmed identity-transition writer.
-- It shares the existing keyword/display limits but cannot bypass assign's
-- conflicting-master-ID guard and never invokes location/time preparation.
function KeywordWriter.identityTemplate(taxon)
  local values = {}
  for _, field in ipairs(METADATA_FIELDS) do values[field] = "" end
  local names, seen, path = {}, {}, {}
  for _, entry in ipairs(taxon.hierarchy or {}) do
    local rank = string.lower(cleanText(entry.rank))
    if TaxonomyRanks.label(rank) ~= rank then
      values[TaxonomyRanks.metadataFieldId(rank)] = metadataText(entry.scientificName)
    end
    local display = TaxonomyRanks.displayTaxon(entry, taxon)
    if display ~= "" then table.insert(path, utf8Prefix(display, 240)) end
    local readable = taxonomyKeywordName(entry, taxon)
    if readable ~= "" then
      local name = managedKeywordName(readable)
      if not seen[string.lower(name)] then
        seen[string.lower(name)] = true
        table.insert(names, name)
      end
    end
  end
  values.masterTaxonId = metadataText(taxon.masterTaxonId)
  values.projectTaxonId = metadataText(taxon.projectLinks and taxon.projectLinks[1]
    and taxon.projectLinks[1].project_taxon_key or "")
  values.germanName = metadataText(taxon.germanName)
  values.englishName = metadataText(taxon.englishName)
  values.scientificName = metadataText(taxon.acceptedScientificName)
  values.taxonRank = metadataText(taxon.rank)
  values.taxonomyPath = boundedPath(path)
  values.assignedAt = os.date("!%Y-%m-%dT%H:%M:%SZ")
  return { values = values, names = names }
end

function KeywordWriter.removeAll(catalog, photos)
  local result = {
    photoCount = #photos,
    assignmentCount = 0,
    referenceImageCount = 0,
    taxonomyKeywordCount = 0,
    locationTimeKeywordCount = 0,
    locationTimeAssignmentCount = 0,
  }
  local beforeStatistics = {}
  for index, photo in ipairs(photos) do
    beforeStatistics[index] = Statistics.photoSnapshot(photo)
  end

  runWithWriteAccess(catalog, "FN Wildlife – alle FN-Daten entfernen", function()
    for _, photo in ipairs(photos) do
      if cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId")) ~= "" then
        result.assignmentCount = result.assignmentCount + 1
      end
      if cleanText(photo:getPropertyForPlugin(_PLUGIN, "referenceImage")) == "yes" then
        result.referenceImageCount = result.referenceImageCount + 1
      end
      result.taxonomyKeywordCount = result.taxonomyKeywordCount
        + removeCurrentManagedKeywords(catalog, photo)
      clearPluginMetadata(photo)
    end

    local locationResult = LocationTimeWriter.applyPrepared(
      catalog,
      photos,
      {},
      "remove",
      {}
    )
    result.locationTimeKeywordCount = locationResult.removedKeywordCount
    result.locationTimeAssignmentCount = locationResult.changedPhotoCount

    local afterStatistics = {}
    for index in ipairs(photos) do
      afterStatistics[index] = Statistics.emptySnapshot()
    end
    PluginState.applyStatisticsPhotoChanges(catalog, beforeStatistics, afterStatistics)
  end)
  return result
end

function KeywordWriter.taxonomyKeywordNameSet(photo)
  local names = {}
  for _, name in ipairs(managedKeywordNamesFromMetadata(photo)) do
    names[string.lower(name)] = true
  end
  return names
end

function KeywordWriter.hasManagedKeywordSuffix(value)
  return hasPluginKeywordSuffix(value)
end

function KeywordWriter.rankLabel(rank)
  return TaxonomyRanks.label(rank)
end

function KeywordWriter.displayTaxon(entry, taxon)
  return TaxonomyRanks.displayTaxon(entry or {}, taxon)
end

return KeywordWriter
