local LrTasks = import "LrTasks"
local MetadataDefinition = require "MetadataDefinition"

local KeywordIdFinalizer = {}
local TARGETS = {
  taxonomyKeywordIds = { suffixes = { " (FN)", " (FN)*" }, emptyValue = "none" },
  locationTimeKeywordIds = {
    suffixes = { " (FN Ort)", " (FN Ort)*", " (FN Zeit)", " (FN Zeit)*" },
    emptyValue = "",
  },
}
local METADATA_FIELDS = {}
for _, definition in ipairs(MetadataDefinition.metadataFieldsForPhotos) do
  METADATA_FIELDS[definition.id] = true
end

local function cleanText(value)
  return string.match(tostring(value or ""), "^%s*(.-)%s*$") or ""
end

local function fail(reason)
  error("Die internen FN-Stichwortkennungen konnten nicht abschließend gesichert werden: "
    .. reason .. " Ein bereits gespeicherter Zuweisungsschritt wird dadurch nicht zurückgenommen.", 0)
end

local function hasSuffix(name, suffixes)
  for _, suffix in ipairs(suffixes) do
    if name == cleanText(suffix) or string.sub(name, -string.len(suffix)) == suffix then return true end
  end
  return false
end

local function isReserved(name)
  for _, target in pairs(TARGETS) do
    if hasSuffix(name, target.suffixes) then return true end
  end
  return false
end

local function identifier(keyword)
  local ok, value = LrTasks.pcall(function() return keyword.localIdentifier end)
  value = ok and cleanText(value) or ""
  if value == "" then
    ok, value = LrTasks.pcall(function() return keyword:getLocalIdentifier() end)
    value = ok and cleanText(value) or ""
  end
  return value ~= "" and value or nil
end

local function capturedAssigned(photo)
  local assigned = photo:getRawMetadata("keywords")
  if type(assigned) ~= "table" then fail("Die tatsächlichen Stichwörter sind nicht lesbar.") end
  local entries, seenObjects = {}, {}
  for key, value in pairs(assigned) do
    local keyword = (type(key) == "table" or type(key) == "userdata") and key or value
    if type(keyword) ~= "table" and type(keyword) ~= "userdata" then
      fail("Lightroom lieferte kein gültiges zugeordnetes Stichwortobjekt.")
    end
    if not seenObjects[keyword] then
      seenObjects[keyword] = true
      local ok, name = LrTasks.pcall(function() return keyword:getName() end)
      name = ok and cleanText(name) or ""
      table.insert(entries, { keyword = keyword, name = name ~= "" and name or nil,
        id = identifier(keyword) })
    end
  end
  return entries
end

local function appendState(names, seenNames, name, entry)
  local normalized = string.lower(name)
  if seenNames[normalized] then fail("Ein reservierter FN-Stichwortname ist mehrfach zugeordnet.") end
  seenNames[normalized] = true
  names[name] = { keyword = entry.keyword, id = entry.id }
end

local function assignedState(photo)
  local names, seenNames = {}, {}
  for _, entry in ipairs(capturedAssigned(photo)) do
    if not entry.name then fail("Ein tatsächlicher Stichwortname ist nach dem Schreibabschluss nicht lesbar.") end
    if isReserved(entry.name) then appendState(names, seenNames, entry.name, entry) end
  end
  return names
end

local function targetIdentifiers(state, field, wantedNames)
  local target = TARGETS[field]
  if not target then fail("Das interne Zielfeld ist nicht freigegeben.") end
  local wanted, actual, ids, seenIds, complete = {}, {}, {}, {}, true
  for name, entry in pairs(state) do
    if hasSuffix(name, target.suffixes) then actual[string.lower(name)] = entry end
  end
  for _, name in ipairs(wantedNames) do
    local normalized = string.lower(name)
    if wanted[normalized] or not hasSuffix(name, target.suffixes) then
      fail("Die erwarteten FN-Stichwortnamen sind nicht eindeutig.")
    end
    wanted[normalized] = true
    local entry = actual[normalized]
    if not entry then fail("Ein gerade zugewiesenes FN-Stichwort fehlt am Foto.") end
    if entry.id then
      if seenIds[entry.id] then fail("Mehrere FN-Stichwörter besitzen dieselbe Kennung.") end
      seenIds[entry.id] = true
      table.insert(ids, entry.id)
    else
      complete = false
    end
  end
  for name in pairs(actual) do
    if not wanted[name] then
      fail("Die tatsächlichen FN-Stichwörter weichen von der Zuweisung ab.")
    end
  end
  local text = #ids > 0 and table.concat(ids, ",") or target.emptyValue
  if string.len(text) > 460 then fail("Die Kennungen überschreiten die Lightroom-Metadatengrenze.") end
  return text, complete
end

local function sameIdentifiers(stored, expected)
  if stored == expected then return true end
  local wanted, actual = {}, {}
  for id in string.gmatch(expected, "[^,]+") do wanted[id] = true end
  for id in string.gmatch(cleanText(stored), "[^,]+") do
    if not wanted[id] or actual[id] then return false end
    actual[id] = true
  end
  for id in pairs(wanted) do if not actual[id] then return false end end
  return true
end

-- Read the complete unchanged baseline before the first metadata setter.
-- Successful setters overlay their exact write values; an SDK getter inside
-- the same write gate may still expose the old committed metadata.
function KeywordIdFinalizer.metadataExpectation(photo)
  local uuid = cleanText(photo:getRawMetadata("uuid"))
  if uuid == "" then fail("Das betroffene Foto besitzt keine lesbare UUID.") end
  local values = {}
  for _, definition in ipairs(MetadataDefinition.metadataFieldsForPhotos) do
    values[definition.id] = photo:getPropertyForPlugin(_PLUGIN, definition.id)
  end
  return { photo = photo, uuid = uuid, values = values }
end

function KeywordIdFinalizer.recordMetadata(expected, photo, field, value)
  if not expected or expected.photo ~= photo or not METADATA_FIELDS[field] then
    fail("Der FN-Metadatenschreibwert besitzt keine vollständige zugehörige Erwartung.")
  end
  expected.values[field] = value
end

-- The raw keyword list and new keyword names/IDs can remain at their old
-- state inside write access. Bind the exact objects actually passed to
-- addKeyword; verify their real committed assignments only after return.
function KeywordIdFinalizer.capture(photo, field, wantedNames, keywords, expectedMetadata)
  if not TARGETS[field] or type(keywords) ~= "table" or #keywords ~= #wantedNames then
    fail("Die tatsächlich zugewiesenen Stichwortobjekte sind nicht vollständig gebunden.")
  end
  local state, seenNames, objects, names = {}, {}, {}, {}
  for index, name in ipairs(wantedNames) do
    local keyword = keywords[index]
    if type(keyword) ~= "table" and type(keyword) ~= "userdata" then
      fail("Ein tatsächlich zugewiesenes Stichwortobjekt ist ungültig.")
    end
    local ok, observedName = LrTasks.pcall(function() return keyword:getName() end)
    observedName = ok and cleanText(observedName) or ""
    -- Existing objects may retain another spelling. If a new object's name
    -- is not readable yet, its requested createKeyword name remains bound.
    local boundName = observedName ~= "" and observedName or name
    if not hasSuffix(boundName, TARGETS[field].suffixes)
        or string.lower(boundName) ~= string.lower(name) then
      fail("Ein zugewiesenes Stichwortobjekt entspricht nicht dem beauftragten FN-Namen.")
    end
    local entry = { keyword = keyword, name = boundName, id = identifier(keyword) }
    appendState(state, seenNames, boundName, entry)
    table.insert(objects, entry)
    table.insert(names, name)
  end
  local ids, complete = targetIdentifiers(state, field, names)
  if not expectedMetadata or expectedMetadata.photo ~= photo then
    fail("Die vollständige erwartete FN-Metadatenzuweisung ist nicht gebunden.")
  end
  return { photo = photo, uuid = expectedMetadata.uuid, values = expectedMetadata.values,
    beforeKeywords = capturedAssigned(photo),
    objects = objects, field = field, names = names,
    needsIds = not complete or not sameIdentifiers(expectedMetadata.values[field], ids) }
end

local function plannedObject(candidate, group)
  for _, plan in ipairs(group.entries) do
    for _, entry in ipairs(plan.objects) do
      if candidate.keyword == entry.keyword then return true end
      local candidateId = candidate.id or identifier(candidate.keyword)
      local plannedId = entry.id or identifier(entry.keyword)
      if candidateId and plannedId and candidateId == plannedId then return true end
    end
  end
  return false
end

local function expectedState(pending, group)
  local state, seenNames = {}, {}
  for _, entry in ipairs(pending.beforeKeywords) do
    if not entry.name then
      if not plannedObject(entry, group) then
        fail("Ein unverändertes Stichwortobjekt war vor dem Schreibabschluss nicht eindeutig lesbar.")
      end
    elseif isReserved(entry.name) then
      local replaced = false
      for field in pairs(group.fields) do
        if hasSuffix(entry.name, TARGETS[field].suffixes) then replaced = true; break end
      end
      if not replaced then appendState(state, seenNames, entry.name, entry) end
    end
  end
  -- Replace every changed domain, including complete IDs and empty results.
  -- The remaining domains retain their original spelling and object identity.
  for _, plan in ipairs(group.entries) do
    for _, entry in ipairs(plan.objects) do appendState(state, seenNames, entry.name, entry) end
  end
  return state
end

local function currentIdentifiers(pending)
  local photo = pending.photo
  if cleanText(photo:getRawMetadata("uuid")) ~= pending.uuid then
    fail("Die Fotoidentität wurde seit der Zuweisung geändert.")
  end
  for _, definition in ipairs(MetadataDefinition.metadataFieldsForPhotos) do
    if photo:getPropertyForPlugin(_PLUGIN, definition.id) ~= pending.values[definition.id] then
      fail("Die FN-Metadaten wurden seit der Zuweisung geändert (Feld: "
        .. tostring(definition.title or definition.id) .. "); keine Kennung wird überschrieben.")
    end
  end
  local current = assignedState(photo)
  for name, previous in pairs(pending.state) do
    local entry = current[name]
    if not entry then fail("Die reservierten FN-Stichwörter wurden seit der Zuweisung geändert.") end
    local previousId = previous.id or identifier(previous.keyword)
    if not previousId and previous.keyword ~= entry.keyword then
      fail("Die ursprüngliche Stichwortidentität ist nach dem Schreibabschluss nicht eindeutig lesbar.")
    end
    if previousId and previousId ~= entry.id then
      fail("Ein reserviertes FN-Stichwortobjekt wurde seit der Zuweisung ersetzt.")
    end
  end
  for name in pairs(current) do
    if not pending.state[name] then fail("Die reservierten FN-Stichwörter wurden seit der Zuweisung geändert.") end
  end
  local ids, complete = targetIdentifiers(current, pending.field, pending.names)
  if not complete then fail("Lightroom liefert nach dem Schreibabschluss noch keine vollständigen Kennungen.") end
  return ids
end

function KeywordIdFinalizer.finalize(catalog, pending)
  if not pending or #pending == 0 then return end
  local groups, needsIds = {}, false
  for _, entry in ipairs(pending) do
    local group = groups[entry.photo]
    if not group then group = { entries = {}, fields = {} }; groups[entry.photo] = group end
    if group.fields[entry.field] then fail("Eine geänderte FN-Domäne ist mehrfach zum Abschluss vorgemerkt.") end
    group.fields[entry.field] = true
    table.insert(group.entries, entry)
    if entry.needsIds then needsIds = true end
  end
  local ids = {}
  for index, entry in ipairs(pending) do
    entry.state = expectedState(entry, groups[entry.photo])
    ids[index] = currentIdentifiers(entry)
  end
  if not needsIds then return end
  local completed = false
  catalog:withWriteAccessDo("FN Wildlife interne Stichwortkennungen abschließen", function()
    -- Validate every snapshot before any write: taxonomy and location/time
    -- can both be pending for the same photo and share this single gate.
    for index, entry in ipairs(pending) do
      if currentIdentifiers(entry) ~= ids[index] then
        fail("Die Stichwortkennungen wurden vor dem Abschluss geändert.")
      end
    end
    for index, entry in ipairs(pending) do
      if entry.needsIds then entry.photo:setPropertyForPlugin(_PLUGIN, entry.field, ids[index]) end
    end
    completed = true
  end, { timeout = 10 })
  if not completed then fail("Lightroom konnte den abschließenden Katalog-Schreibzugriff nicht ausführen.") end
end

return KeywordIdFinalizer
