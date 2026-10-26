local LrDate = import "LrDate"
local LrTasks = import "LrTasks"

local LocationSuggestionReader = require "LocationSuggestionReader"
local PluginState = require "PluginState"
local Statistics = require "Statistics"
local KeywordIdFinalizer = require "KeywordIdFinalizer"

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
  if type(keyword) ~= "table" and type(keyword) ~= "userdata" then
    return ""
  end
  local ok, value = LrTasks.pcall(function()
    return keyword:getName()
  end)
  if not ok then
    error("Lightroom konnte einen zugeordneten Stichwortnamen nicht lesen: " .. tostring(value), 0)
  end
  return cleanText(value)
end

local function keywordLocalIdentifier(keyword)
  local ok, value = LrTasks.pcall(function()
    return keyword.localIdentifier
  end)
  value = ok and cleanText(value) or ""
  return value ~= "" and value or nil
end

local function assignedKeywords(photo)
  -- SDK: keywords ist die Liste tatsächlich zugeordneter LrKeyword-Objekte.
  -- SDK-Leseaufrufe dürfen yielden; normales Lua-pcall würde deren Fehler
  -- verschlucken und anschließend nur die FN-Metadaten leeren.
  local ok, assigned = LrTasks.pcall(function()
    return photo:getRawMetadata("keywords")
  end)
  if not ok or type(assigned) ~= "table" then
    error("Lightroom konnte die zugeordneten Stichwörter nicht lesen: " .. tostring(assigned), 0)
  end
  for key, value in pairs(assigned) do
    local candidate = (type(key) == "table" or type(key) == "userdata") and key or value
    if type(candidate) ~= "table" and type(candidate) ~= "userdata" then
      error("Lightroom lieferte kein gültiges zugeordnetes Stichwortobjekt; FN-Metadaten bleiben erhalten.", 0)
    end
  end
  return assigned
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

  local function fallbackParts(key)
    local value = photo:getRawMetadata(key)
    table.insert(diagnostics, "raw." .. key .. "=" .. diagnosticValue(true, value))
    local fallbackTimestamp = tonumber(value)
    if fallbackTimestamp and fallbackTimestamp > 0 and fallbackTimestamp < math.huge then
      local converted, fallbackYear, fallbackMonth = LrTasks.pcall(timestampParts, fallbackTimestamp)
      local numericYear = tonumber(fallbackYear)
      if converted and numericYear and numericYear >= 1800 and numericYear <= 3000 then
        return fallbackYear, fallbackMonth
      end
    end
    local fallbackYear, fallbackMonth = datePartsFromText(value)
    local numericYear = tonumber(fallbackYear)
    if numericYear and numericYear >= 1800 and numericYear <= 3000 then
      return fallbackYear, fallbackMonth
    end
    local formatted = photo:getFormattedMetadata(key)
    table.insert(diagnostics, "formatted." .. key .. "=" .. diagnosticValue(true, formatted))
    fallbackYear, fallbackMonth = datePartsFromText(formatted)
    numericYear = tonumber(fallbackYear)
    if numericYear and numericYear >= 1800 and numericYear <= 3000 then
      return fallbackYear, fallbackMonth
    end
    return "", ""
  end

  -- For SDK-confirmed videos, Lightroom can expose the visible recording date
  -- as dateTimeDigitized while dateTime contains the later file creation date.
  -- Photos must never substitute their scan date for a missing capture date.
  if photo:getRawMetadata("isVideo") == true then
    year, month = fallbackParts("dateTimeDigitized")
    if year ~= "" then return year, month end
  end

  year, month = fallbackParts("dateTime")
  if year ~= "" then return year, month end
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

local function setMetadata(photo, field, value, expectedMetadata)
  local text = metadataText(value)
  photo:setPropertyForPlugin(_PLUGIN, field, text)
  if expectedMetadata then KeywordIdFinalizer.recordMetadata(expectedMetadata, photo, field, text) end
end

local function clearMetadata(photo, expectedMetadata)
  for _, field in ipairs(VALUE_FIELDS) do
    setMetadata(photo, field, "", expectedMetadata)
  end
  for _, field in ipairs(INTERNAL_FIELDS) do
    setMetadata(photo, field, "", expectedMetadata)
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

local function effectivePlan(photo, plan, preserveExisting)
  local values = {}
  for _, field in ipairs(VALUE_FIELDS) do
    local stored = cleanText(photo:getPropertyForPlugin(_PLUGIN, field))
    local source = cleanText(plan.values and plan.values[field])
    values[field] = metadataText((preserveExisting and stored ~= "" or source == "") and stored or source)
  end
  return {
    values = values, keywordNames = keywordNamesForValues(values),
    hasLocationData = hasAnyValue(values, LOCATION_VALUE_FIELDS), hasGpsData = plan.hasGpsData,
    hasTimeData = cleanText(values.fnCaptureMonth) ~= "" and cleanText(values.fnCaptureYear) ~= "",
    captureDiagnostic = plan.captureDiagnostic,
  }
end

local function assignmentMatches(photo, plan)
  for _, field in ipairs(VALUE_FIELDS) do
    if cleanText(photo:getPropertyForPlugin(_PLUGIN, field)) ~= cleanText(plan.values[field]) then return false end
  end
  local wanted, actual, ids = {}, {}, {}
  for _, name in ipairs(plan.keywordNames) do wanted[string.lower(name)] = true end
  for key, value in pairs(assignedKeywords(photo)) do
    local keyword = (type(key) == "table" or type(key) == "userdata") and key or value
    local name = keywordName(keyword)
    if hasManagedSuffix(name) then
      local normalized = string.lower(name)
      if not wanted[normalized] or actual[normalized] then return false end
      actual[normalized] = true
      local id = keywordLocalIdentifier(keyword)
      if id then ids[id] = true end
    end
  end
  for name in pairs(wanted) do if not actual[name] then return false end end
  if cleanText(photo:getPropertyForPlugin(_PLUGIN, "locationTimeKeywordNames")) ~= table.concat(plan.keywordNames, "\n") then return false end
  local storedIds = {}
  for _, id in ipairs(splitStored(photo:getPropertyForPlugin(_PLUGIN, "locationTimeKeywordIds"), "[^,]+")) do
    if storedIds[id] or not ids[id] then return false end
    storedIds[id] = true
  end
  for id in pairs(ids) do if not storedIds[id] then return false end end
  local assignedAt = cleanText(photo:getPropertyForPlugin(_PLUGIN, "locationTimeAssignedAt"))
  if hasAnyValue(plan.values, VALUE_FIELDS) then return assignedAt ~= "" end
  return assignedAt == ""
end

local function removeStoredKeywords(catalog, photo, protectedNames)
  local removed = 0
  local seen = {}
  local candidates = {}
  local function rememberAssigned(candidate)
    if type(candidate) ~= "table" and type(candidate) ~= "userdata" then
      return
    end
    local name = keywordName(candidate)
    if hasManagedSuffix(name) and not (protectedNames and protectedNames[string.lower(name)]) then
      table.insert(candidates, candidate)
    end
  end
  local function removeCandidate(candidate)
    local name = keywordName(candidate)
    local key = string.lower(name)
    local identifier = keywordLocalIdentifier(candidate)
    local objectKey = identifier and ("id:" .. identifier) or candidate
    if name == "" or seen[objectKey] or not hasManagedSuffix(name) then
      return
    end
    seen[objectKey] = true
    if protectedNames and protectedNames[key] then
      return
    end
    photo:removeKeyword(candidate)
    removed = removed + 1
  end

  -- Nur tatsächlich am Foto sichtbare Zuordnungen entfernen. Gespeicherte
  -- Namen oder FN-Werte sind kein Beleg für eine noch vorhandene Zuordnung;
  -- insbesondere dürfen Rücknahmen keine neuen Stichwörter erzeugen.
  for key, value in pairs(assignedKeywords(photo)) do
    rememberAssigned(key)
    rememberAssigned(value)
  end
  for _, candidate in ipairs(candidates) do
    removeCandidate(candidate)
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
    if not assignmentMatches(photo, plan) then
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
  local assigned = {}
  local added = 0
  for _, name in ipairs(names) do
    local keyword = keywordsByName[string.lower(cleanText(name))]
    if not keyword then
      error("Lightroom lieferte für „" .. name .. "“ kein Stichwortobjekt zurück.", 0)
    end
    photo:addKeyword(keyword)
    table.insert(assigned, keyword)
    added = added + 1
    local id = keywordLocalIdentifier(keyword)
    if id then
      table.insert(ids, tostring(id))
    end
  end
  return ids, added, assigned
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
    local effective = effectivePlan(photo, { values = values, hasGpsData = hasGpsData,
      captureDiagnostic = captureDiagnostic }, options.preserveExisting == true)
    values = effective.values
    local hasLocationData = hasAnyValue(values, LOCATION_VALUE_FIELDS)
    plans[index] = {
      values = values,
      keywordNames = keywordNamesForValues(values),
      hasLocationData = hasLocationData,
      hasGpsData = hasGpsData,
      hasTimeData = effective.hasTimeData,
      captureDiagnostic = captureDiagnostic,
    }
    if options.resolveSuggestedLocations == true
        and hasGpsData
        and not hasLocationData then
      table.insert(suggestionPhotos, photo)
    end
    if options.progress and (index % 250 == 0 or index == #selectedPhotos) then
      local instruction = options.progress(index, #selectedPhotos, "Quelldaten")
      if instruction == "cancel" then
        return plans, {
          canceled = true,
          suggestedLocationPhotoCount = #suggestionPhotos,
          unresolvedSuggestedLocationPhotoCount = 0,
          failedSuggestedLocationPhotoCount = 0,
        }
      end
    end
  end

  local preparation = {
    canceled = false,
    suggestedLocationPhotoCount = #suggestionPhotos,
    unresolvedSuggestedLocationPhotoCount = 0,
    failedSuggestedLocationPhotoCount = 0,
  }
  if #suggestionPhotos > 0 then
    if options.beforeSuggestions then
      options.beforeSuggestions(#suggestionPhotos)
    end
    local suggestions = LocationSuggestionReader.resolve(suggestionPhotos)
    preparation.canceled = suggestions.canceled == true
    for index, photo in ipairs(selectedPhotos) do
      local values = suggestions.valuesByPhoto[photo]
      local suggestionFailed = suggestions.failedByPhoto
        and suggestions.failedByPhoto[photo] ~= nil
      if suggestionFailed then
        preparation.failedSuggestedLocationPhotoCount =
          preparation.failedSuggestedLocationPhotoCount + 1
      elseif values then
        mergeMissingValues(plans[index].values, values, LOCATION_VALUE_FIELDS)
        plans[index].hasLocationData = hasAnyValue(
          plans[index].values,
          LOCATION_VALUE_FIELDS
        )
        plans[index].keywordNames = keywordNamesForValues(plans[index].values)
      end
      if not suggestionFailed
          and plans[index].hasGpsData
          and not plans[index].hasLocationData then
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
  for key, value in pairs(assignedKeywords(photo)) do
    for _, candidate in ipairs({ key, value }) do
      local name = keywordName(candidate)
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
  local expectedMetadataByPhoto = options and options.expectedMetadataByPhoto or {}
  local effectivePlans = {}
  for index, photo in ipairs(photos or {}) do
    effectivePlans[index] = effectivePlan(photo, plans[index] or {}, mode == "add")
  end
  plans = effectivePlans
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
    pendingKeywordIds = {},
  }
  local keywordsByName = prepareKeywordObjects(catalog, photos, plans, mode)
  for index, photo in ipairs(photos or {}) do
    local plan = plans[index] or { values = {}, keywordNames = {} }
    local changedBeforePhoto = result.changedPhotoCount
    local assignedKeywordObjects = {}
    local expectedMetadata = expectedMetadataByPhoto[photo]
    local alreadyAssigned = existingAssignment(photo)
    local hadInternalValues = false
    for _, field in ipairs(INTERNAL_FIELDS) do
      if cleanText(photo:getPropertyForPlugin(_PLUGIN, field)) ~= "" then
        hadInternalValues = true
        break
      end
    end
    local removedBeforePhoto = result.removedKeywordCount
    if mode ~= "remove" then
      if not hasAnyValue(plan.values, VALUE_FIELDS) then
        result.missingDataPhotoCount = result.missingDataPhotoCount + 1
      end
      if not plan.hasLocationData then
        result.missingLocationPhotoCount = result.missingLocationPhotoCount + 1
        if plan.hasGpsData then
          result.gpsWithoutStoredLocationPhotoCount = result.gpsWithoutStoredLocationPhotoCount + 1
        else
          result.missingGpsAndLocationPhotoCount = result.missingGpsAndLocationPhotoCount + 1
        end
      end
      if not plan.hasTimeData then
        result.missingTimePhotoCount = result.missingTimePhotoCount + 1
        if not result.captureDiagnostic then result.captureDiagnostic = plan.captureDiagnostic end
      end
    end
    if mode ~= "remove" and assignmentMatches(photo, plan) then
      result.skippedPhotoCount = result.skippedPhotoCount + 1
      result.afterValues[index] = plan.values
    else
      if mode ~= "remove" and not expectedMetadata then
        expectedMetadata = KeywordIdFinalizer.metadataExpectation(photo)
        expectedMetadataByPhoto[photo] = expectedMetadata
      end
      result.removedKeywordCount = result.removedKeywordCount
        + removeStoredKeywords(catalog, photo, protectedNames(options, photo))
      clearMetadata(photo, expectedMetadata)
      if mode == "remove" then
        result.afterValues[index] = {}
        if alreadyAssigned or hadInternalValues or result.removedKeywordCount > removedBeforePhoto then
          result.changedPhotoCount = result.changedPhotoCount + 1
        end
      elseif not hasAnyValue(plan.values, VALUE_FIELDS) then
        result.afterValues[index] = {}
        if alreadyAssigned or hadInternalValues or result.removedKeywordCount > removedBeforePhoto then
          result.changedPhotoCount = result.changedPhotoCount + 1
        end
      else
        local ids, added, assigned = addKeywords(photo, plan.keywordNames, keywordsByName)
        assignedKeywordObjects = assigned
        for _, field in ipairs(VALUE_FIELDS) do
          setMetadata(photo, field, plan.values[field], expectedMetadata)
        end
        setMetadata(photo, "locationTimeKeywordIds", table.concat(ids, ","), expectedMetadata)
        setMetadata(photo, "locationTimeKeywordNames", table.concat(plan.keywordNames, "\n"), expectedMetadata)
        setMetadata(photo, "locationTimeAssignedAt", os.date("!%Y-%m-%dT%H:%M:%SZ"), expectedMetadata)
        result.addedKeywordCount = result.addedKeywordCount + added
        result.changedPhotoCount = result.changedPhotoCount + 1
        result.afterValues[index] = plan.values
      end
    end
    if mode ~= "remove" and result.changedPhotoCount > changedBeforePhoto then
      table.insert(result.pendingKeywordIds, KeywordIdFinalizer.capture(
        photo, "locationTimeKeywordIds", plan.keywordNames, assignedKeywordObjects, expectedMetadata
      ))
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
  local plans = preparedPlans or (mode == "remove" and {} or LocationTimeWriter.prepare(catalog, photos))
  local beforeStatistics = {}
  for index, photo in ipairs(photos or {}) do
    beforeStatistics[index] = Statistics.photoSnapshot(photo)
  end
  local result = runWithWriteAccess(
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
      if result.changedPhotoCount > 0 then
        PluginState.applyStatisticsPhotoChanges(catalog, beforeStatistics, afterStatistics)
      end
      result.afterValues = nil
      return result
    end
  )
  local pendingKeywordIds = result.pendingKeywordIds
  result.pendingKeywordIds = nil
  KeywordIdFinalizer.finalize(catalog, pendingKeywordIds)
  return result
end

return LocationTimeWriter
