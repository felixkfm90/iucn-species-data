local LrDate = import "LrDate"

local LocationSuggestionReader = require "LocationSuggestionReader"
local PluginState = require "PluginState"
local Statistics = require "Statistics"

local LocationTimeWriter = {}

local LOCATION_KEYWORD_SUFFIX = " (FN Ort)"
local TIME_KEYWORD_SUFFIX = " (FN Zeit)"
local LOCATION_PARTIAL_KEYWORD_SUFFIX = LOCATION_KEYWORD_SUFFIX .. "*"
local TIME_PARTIAL_KEYWORD_SUFFIX = TIME_KEYWORD_SUFFIX .. "*"
local WRITE_ACCESS_TIMEOUT_SECONDS = 10
local MONTH_NAMES = {
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
}
local VALUE_FIELDS = {
  "fnLocation",
  "fnCity",
  "fnStateProvince",
  "fnCountry",
  "fnIsoCountryCode",
  "fnCaptureMonth",
  "fnCaptureYear",
}
local LOCATION_VALUE_FIELDS = {
  "fnLocation",
  "fnCity",
  "fnStateProvince",
  "fnCountry",
  "fnIsoCountryCode",
}
local INTERNAL_FIELDS = {
  "locationTimeKeywordIds",
  "locationTimeKeywordNames",
  "locationTimeAssignedAt",
}

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
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
  return utf8Prefix(value, 460)
end

local function managedKeywordName(value, suffix)
  return utf8Prefix(value, 240 - string.len(suffix)) .. suffix
end

local function hasManagedSuffix(value)
  local name = cleanText(value)
  return name == cleanText(LOCATION_KEYWORD_SUFFIX)
    or name == cleanText(TIME_KEYWORD_SUFFIX)
    or name == cleanText(LOCATION_PARTIAL_KEYWORD_SUFFIX)
    or name == cleanText(TIME_PARTIAL_KEYWORD_SUFFIX)
    or string.sub(name, -string.len(LOCATION_KEYWORD_SUFFIX)) == LOCATION_KEYWORD_SUFFIX
    or string.sub(name, -string.len(TIME_KEYWORD_SUFFIX)) == TIME_KEYWORD_SUFFIX
    or string.sub(name, -string.len(LOCATION_PARTIAL_KEYWORD_SUFFIX))
      == LOCATION_PARTIAL_KEYWORD_SUFFIX
    or string.sub(name, -string.len(TIME_PARTIAL_KEYWORD_SUFFIX))
      == TIME_PARTIAL_KEYWORD_SUFFIX
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
  return value ~= "" and value or nil
end

local function createKeyword(catalog, name)
  return catalog:createKeyword(name, {}, true, nil, true)
end

local function appendUnique(target, seen, value)
  local text = cleanText(value)
  local key = string.lower(text)
  if text == "" or seen[key] then
    return
  end
  seen[key] = true
  table.insert(target, text)
end

local function splitStored(value, pattern)
  local parts = {}
  for part in string.gmatch(cleanText(value), pattern) do
    local text = cleanText(part)
    if text ~= "" then
      table.insert(parts, text)
    end
  end
  return parts
end

local function readFormatted(photo, key)
  return cleanText(photo:getFormattedMetadata(key))
end

local function hasGpsCoordinates(photo)
  local gps = photo:getRawMetadata("gps")
  return type(gps) == "table"
    and tonumber(gps.latitude) ~= nil
    and tonumber(gps.longitude) ~= nil
end

local function diagnosticValue(ok, value)
  if not ok then
    return "Fehler(" .. utf8Prefix(value, 120) .. ")"
  end
  if value == nil then
    return "nil"
  end
  local valueType = type(value)
  if valueType == "table" then
    return "table"
  end
  local text = utf8Prefix(value, 80)
  return valueType .. (text ~= "" and ("(" .. text .. ")") or "(leer)")
end

local function datePartsFromText(value)
  local text = cleanText(value)
  local year, month = string.match(text, "(%d%d%d%d)[%-/:](%d%d?)")
  if not year then
    month, year = string.match(text, "^%d%d?[%.%-/](%d%d?)[%.%-/](%d%d%d%d)")
  end
  month = tonumber(month)
  if year and month and MONTH_NAMES[month] then
    return tostring(year), MONTH_NAMES[month]
  end
  year = string.match(text, "(%d%d%d%d)")
  local lowerText = string.lower(text)
  if year then
    for index, monthName in ipairs(MONTH_NAMES) do
      if string.find(lowerText, string.lower(monthName), 1, true) then
        return tostring(year), MONTH_NAMES[index]
      end
    end
  end
  return "", ""
end

local function captureParts(photo)
  local diagnostics = {}
  local function timestampParts(timestamp)
    local results = { LrDate.timestampToComponents(timestamp) }
    local first = results[1]
    if type(first) == "table" then
      local year = first.year or first[1]
      local month = tonumber(first.month or first[2])
      if year and month and MONTH_NAMES[month] then
        return tostring(year), MONTH_NAMES[month]
      end
      return "", ""
    end
    for index = 1, #results - 1 do
      local year = tonumber(results[index])
      local month = tonumber(results[index + 1])
      if year and year >= 1800 and year <= 3000 and month and MONTH_NAMES[month] then
        return tostring(year), MONTH_NAMES[month]
      end
    end
    return "", ""
  end

  local rawValue = photo:getRawMetadata("dateTimeOriginal")
  table.insert(diagnostics, "raw.dateTimeOriginal=" .. diagnosticValue(true, rawValue))
  local timestamp = tonumber(rawValue)
  if timestamp then
    local year, month = timestampParts(timestamp)
    if year ~= "" then
      return year, month
    end
  end
  local year, month = datePartsFromText(rawValue)
  if year ~= "" then
    return year, month
  end

  local formattedValue = photo:getFormattedMetadata("dateTimeOriginal")
  table.insert(
    diagnostics,
    "formatted.dateTimeOriginal=" .. diagnosticValue(true, formattedValue)
  )
  year, month = datePartsFromText(formattedValue)
  if year ~= "" then
    return year, month
  end
  return "", "", table.concat(diagnostics, "; ")
end

local function sourceValues(photo)
  local year, month, captureDiagnostic = captureParts(photo)
  return {
    fnLocation = readFormatted(photo, "location"),
    fnCity = readFormatted(photo, "city"),
    fnStateProvince = readFormatted(photo, "stateProvince"),
    fnCountry = readFormatted(photo, "country"),
    fnIsoCountryCode = readFormatted(photo, "isoCountryCode"),
    fnCaptureMonth = month,
    fnCaptureYear = year,
  }, captureDiagnostic, hasGpsCoordinates(photo)
end

local function hasAnyValue(values, fields)
  for _, field in ipairs(fields) do
    if cleanText(values[field]) ~= "" then
      return true
    end
  end
  return false
end

local function mergeMissingValues(values, additions, fields)
  for _, field in ipairs(fields) do
    if cleanText(values[field]) == "" and cleanText(additions and additions[field]) ~= "" then
      values[field] = cleanText(additions[field])
    end
  end
end

local function keywordNamesForValues(values)
  local names = {}
  local seen = {}
  local function appendManaged(value, suffix)
    local text = cleanText(value)
    if text ~= "" then
      appendUnique(names, seen, managedKeywordName(text, suffix))
    end
  end
  -- Grob nach Land bis Ort und anschließend nach Zeit. Der ISO-Code bleibt
  -- als Plug-in-Metadatum erhalten, erzeugt aber kein redundantes Stichwort.
  appendManaged(values.fnCountry, LOCATION_KEYWORD_SUFFIX)
  appendManaged(values.fnStateProvince, LOCATION_KEYWORD_SUFFIX)
  appendManaged(values.fnCity, LOCATION_KEYWORD_SUFFIX)
  appendManaged(values.fnLocation, LOCATION_KEYWORD_SUFFIX)
  appendManaged(values.fnCaptureMonth, TIME_KEYWORD_SUFFIX)
  appendManaged(values.fnCaptureYear, TIME_KEYWORD_SUFFIX)
  return names
end

local function storedKeywordNames(photo)
  local names = splitStored(
    photo:getPropertyForPlugin(_PLUGIN, "locationTimeKeywordNames"),
    "[^\n]+"
  )
  if #names > 0 then
    return names
  end
  -- Rückfall für einen unvollständigen internen ID-Stand: Die sichtbaren
  -- Namen lassen sich aus den von diesem Plug-in gespeicherten FN-Werten
  -- deterministisch wiederherstellen.
  local values = {}
  for _, field in ipairs(VALUE_FIELDS) do
    values[field] = cleanText(photo:getPropertyForPlugin(_PLUGIN, field))
  end
  return keywordNamesForValues(values)
end

local function storedKeywordIds(photo)
  return splitStored(
    photo:getPropertyForPlugin(_PLUGIN, "locationTimeKeywordIds"),
    "[^,]+"
  )
end

local function setMetadata(photo, field, value)
  photo:setPropertyForPlugin(_PLUGIN, field, metadataText(value))
end

local function clearMetadata(photo)
  for _, field in ipairs(VALUE_FIELDS) do
    photo:setPropertyForPlugin(_PLUGIN, field, "")
  end
  for _, field in ipairs(INTERNAL_FIELDS) do
    photo:setPropertyForPlugin(_PLUGIN, field, "")
  end
end

local function existingAssignment(photo)
  for _, field in ipairs(VALUE_FIELDS) do
    if cleanText(photo:getPropertyForPlugin(_PLUGIN, field)) ~= "" then
      return true
    end
  end
  return false
end

local function removeStoredKeywords(catalog, photo, protectedNames)
  local removed = 0
  local seen = {}
  local function removeCandidate(candidate)
    local name = keywordName(candidate)
    local key = string.lower(name)
    if name == "" or seen[key] or not hasManagedSuffix(name) then
      return
    end
    seen[key] = true
    if protectedNames and protectedNames[key] then
      return
    end
    local keyword = type(candidate) == "string" and createKeyword(catalog, name) or candidate
    if keyword then
      photo:removeKeyword(keyword)
      removed = removed + 1
    end
  end

  for _, name in ipairs(storedKeywordNames(photo)) do
    removeCandidate(name)
  end
  for _, id in ipairs(storedKeywordIds(photo)) do
    local ok, keyword = pcall(function()
      return catalog:getKeywordByLocalIdentifier(id)
    end)
    if ok and keyword then
      removeCandidate(keyword)
    end
  end
  -- Lightroom liefert Stichwörter je nach Katalogzustand nicht immer über
  -- die gespeicherten lokalen IDs zurück. Deshalb werden zusätzlich die
  -- aktuell am Foto sichtbaren Stichwortobjekte und die formatierte flache
  -- Anzeige geprüft. Die reservierten Endungen begrenzen die Entfernung
  -- weiterhin strikt auf FN-Ort und FN-Zeit.
  local rawOk, assigned = pcall(function()
    return photo:getRawMetadata("keywords")
  end)
  for key, value in pairs(rawOk and assigned or {}) do
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
  return removed
end

local function prepareKeywordObjects(catalog, photos, plans, mode)
  local keywordsByName = {}
  if mode == "remove" then
    return keywordsByName
  end
  for index, photo in ipairs(photos or {}) do
    local plan = plans[index] or { keywordNames = {} }
    if not (mode == "add" and existingAssignment(photo)) then
      for _, name in ipairs(plan.keywordNames or {}) do
        local key = string.lower(cleanText(name))
        if key ~= "" and not keywordsByName[key] then
          local keyword = createKeyword(catalog, name)
          if not keyword then
            error("Lightroom lieferte für „" .. name .. "“ kein Stichwortobjekt zurück.", 0)
          end
          keywordsByName[key] = keyword
        end
      end
    end
  end
  return keywordsByName
end

local function addKeywords(photo, names, keywordsByName)
  local ids = {}
  local added = 0
  for _, name in ipairs(names) do
    local keyword = keywordsByName[string.lower(cleanText(name))]
    if not keyword then
      error("Lightroom lieferte für „" .. name .. "“ kein Stichwortobjekt zurück.", 0)
    end
    photo:addKeyword(keyword)
    added = added + 1
    local id = keywordLocalIdentifier(keyword)
    if id then
      table.insert(ids, tostring(id))
    end
  end
  return ids, added
end

local function protectedNames(options, photo)
  if not options or type(options.protectedNamesForPhoto) ~= "function" then
    return {}
  end
  return options.protectedNamesForPhoto(photo) or {}
end

function LocationTimeWriter.prepare(catalog, photos, options)
  options = options or {}
  local plans = {}
  local suggestionPhotos = {}
  local selectedPhotos = photos or {}
  for index, photo in ipairs(selectedPhotos) do
    local values, captureDiagnostic, hasGpsData = sourceValues(photo)
    local hasLocationData = hasAnyValue(values, LOCATION_VALUE_FIELDS)
    plans[index] = {
      values = values,
      keywordNames = keywordNamesForValues(values),
      hasLocationData = hasLocationData,
      hasGpsData = hasGpsData,
      hasTimeData = hasAnyValue(values, { "fnCaptureMonth", "fnCaptureYear" }),
      captureDiagnostic = captureDiagnostic,
    }
    if options.resolveSuggestedLocations == true
        and hasGpsData
        and not hasLocationData
        and not (options.skipExisting == true and existingAssignment(photo)) then
      table.insert(suggestionPhotos, photo)
    end
    if options.progress and (index % 250 == 0 or index == #selectedPhotos) then
      local instruction = options.progress(index, #selectedPhotos, "Quelldaten")
      if instruction == "cancel" then
        return plans, {
          canceled = true,
          suggestedLocationPhotoCount = #suggestionPhotos,
          unresolvedSuggestedLocationPhotoCount = 0,
        }
      end
    end
  end

  local preparation = {
    canceled = false,
    suggestedLocationPhotoCount = #suggestionPhotos,
    unresolvedSuggestedLocationPhotoCount = 0,
  }
  if #suggestionPhotos > 0 then
    if options.beforeSuggestions then
      options.beforeSuggestions(#suggestionPhotos)
    end
    local suggestions = LocationSuggestionReader.resolve(suggestionPhotos)
    preparation.canceled = suggestions.canceled == true
    for index, photo in ipairs(selectedPhotos) do
      local values = suggestions.valuesByPhoto[photo]
      if values then
        mergeMissingValues(plans[index].values, values, LOCATION_VALUE_FIELDS)
        plans[index].hasLocationData = hasAnyValue(
          plans[index].values,
          LOCATION_VALUE_FIELDS
        )
        plans[index].keywordNames = keywordNamesForValues(plans[index].values)
      end
      if plans[index].hasGpsData
          and not plans[index].hasLocationData
          and not (options.skipExisting == true and existingAssignment(photo)) then
        preparation.unresolvedSuggestedLocationPhotoCount =
          preparation.unresolvedSuggestedLocationPhotoCount + 1
      end
    end
  end
  return plans, preparation
end

function LocationTimeWriter.managedKeywordNameSet(photo)
  local names = {}
  for _, name in ipairs(storedKeywordNames(photo)) do
    names[string.lower(name)] = true
  end
  local rawOk, assigned = pcall(function()
    return photo:getRawMetadata("keywords")
  end)
  for key, value in pairs(rawOk and assigned or {}) do
    for _, candidate in ipairs({ key, value }) do
      local name = keywordName(candidate)
      if hasManagedSuffix(name) then
        names[string.lower(name)] = true
      end
    end
  end
  local formattedOk, formatted = pcall(function()
    return photo:getFormattedMetadata("keywordTags")
  end)
  if formattedOk then
    for part in string.gmatch(tostring(formatted or ""), "([^,]+)") do
      local name = cleanText(part)
      if hasManagedSuffix(name) then
        names[string.lower(name)] = true
      end
    end
  end
  return names
end

function LocationTimeWriter.hasManagedKeywordSuffix(value)
  return hasManagedSuffix(keywordName(value))
end

function LocationTimeWriter.applyPrepared(catalog, photos, plans, mode, options)
  local result = {
    photoCount = #(photos or {}),
    changedPhotoCount = 0,
    skippedPhotoCount = 0,
    missingDataPhotoCount = 0,
    missingLocationPhotoCount = 0,
    gpsWithoutStoredLocationPhotoCount = 0,
    missingGpsAndLocationPhotoCount = 0,
    missingTimePhotoCount = 0,
    captureDiagnostic = nil,
    addedKeywordCount = 0,
    removedKeywordCount = 0,
    afterValues = {},
  }
  local keywordsByName = prepareKeywordObjects(catalog, photos, plans, mode)
  for index, photo in ipairs(photos or {}) do
    local plan = plans[index] or { values = {}, keywordNames = {} }
    local alreadyAssigned = existingAssignment(photo)
    local removedBeforePhoto = result.removedKeywordCount
    if mode == "add" and alreadyAssigned then
      result.skippedPhotoCount = result.skippedPhotoCount + 1
      result.afterValues[index] = false
    else
      result.removedKeywordCount = result.removedKeywordCount
        + removeStoredKeywords(catalog, photo, protectedNames(options, photo))
      clearMetadata(photo)
      if mode == "remove" then
        result.afterValues[index] = {}
        if alreadyAssigned or result.removedKeywordCount > removedBeforePhoto then
          result.changedPhotoCount = result.changedPhotoCount + 1
        end
      elseif #plan.keywordNames == 0 then
        result.afterValues[index] = {}
        result.missingDataPhotoCount = result.missingDataPhotoCount + 1
      else
        local ids, added = addKeywords(photo, plan.keywordNames, keywordsByName)
        for _, field in ipairs(VALUE_FIELDS) do
          setMetadata(photo, field, plan.values[field])
        end
        setMetadata(photo, "locationTimeKeywordIds", table.concat(ids, ","))
        setMetadata(photo, "locationTimeKeywordNames", table.concat(plan.keywordNames, "\n"))
        setMetadata(photo, "locationTimeAssignedAt", os.date("!%Y-%m-%dT%H:%M:%SZ"))
        result.addedKeywordCount = result.addedKeywordCount + added
        result.changedPhotoCount = result.changedPhotoCount + 1
        result.afterValues[index] = plan.values
      end
      if mode ~= "remove" then
        if not plan.hasLocationData then
          result.missingLocationPhotoCount = result.missingLocationPhotoCount + 1
          if plan.hasGpsData then
            result.gpsWithoutStoredLocationPhotoCount =
              result.gpsWithoutStoredLocationPhotoCount + 1
          else
            result.missingGpsAndLocationPhotoCount =
              result.missingGpsAndLocationPhotoCount + 1
          end
        end
        if not plan.hasTimeData then
          result.missingTimePhotoCount = result.missingTimePhotoCount + 1
          if not result.captureDiagnostic then
            result.captureDiagnostic = plan.captureDiagnostic
          end
        end
      end
    end
  end
  return result
end

local function runWithWriteAccess(catalog, actionName, callback)
  local completed = false
  local callbackResult = nil
  catalog:withWriteAccessDo(
    actionName,
    function()
      callbackResult = callback()
      completed = true
    end,
    { timeout = WRITE_ACCESS_TIMEOUT_SECONDS }
  )
  if completed then
    return callbackResult
  end
  error(
    "Lightroom konnte den Katalog-Schreibzugriff innerhalb von "
      .. tostring(WRITE_ACCESS_TIMEOUT_SECONDS)
      .. " Sekunden nicht ausführen. Bitte kurz warten und erneut versuchen.",
    0
  )
end

function LocationTimeWriter.execute(catalog, photos, mode, options, preparedPlans)
  local plans = preparedPlans or LocationTimeWriter.prepare(catalog, photos)
  local beforeStatistics = {}
  for index, photo in ipairs(photos or {}) do
    beforeStatistics[index] = Statistics.photoSnapshot(photo)
  end
  return runWithWriteAccess(
    catalog,
    mode == "remove"
        and "FN Wildlife Orts- und Zeitstichwörter entfernen"
      or mode == "update"
        and "FN Wildlife Orts- und Zeitstichwörter aktualisieren"
      or "FN Wildlife Orts- und Zeitstichwörter hinzufügen",
    function()
      local result = LocationTimeWriter.applyPrepared(catalog, photos, plans, mode, options)
      local afterStatistics = {}
      for index in ipairs(photos or {}) do
        afterStatistics[index] = Statistics.locationTimeSnapshot(
          beforeStatistics[index],
          result.afterValues[index]
        )
      end
      PluginState.applyStatisticsPhotoChanges(catalog, beforeStatistics, afterStatistics)
      result.afterValues = nil
      return result
    end
  )
end

return LocationTimeWriter
