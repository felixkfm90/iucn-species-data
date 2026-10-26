local LrTasks = import "LrTasks"
local TaxonomyRanks = require "TaxonomyRanks"

local IdentitySnapshot = {}
local FIELDS = { "masterTaxonId", "projectTaxonId", "germanName", "englishName",
  "scientificName", "taxonRank", "taxonomyPath", "taxonomyKeywordIds", "assignedAt", "referenceImage" }
for _, rank in ipairs(TaxonomyRanks.all()) do table.insert(FIELDS, TaxonomyRanks.metadataFieldId(rank.id)) end
table.sort(FIELDS)
IdentitySnapshot.fields = FIELDS
local ALLOWED = {}
for _, field in ipairs(FIELDS) do ALLOWED[field] = true end

local function managed(name)
  return type(name) == "string" and (string.match(name, " %(FN%)$") or string.match(name, " %(FN%)%*$")) ~= nil
end

function IdentitySnapshot.validate(snapshot)
  assert(type(snapshot) == "table" and type(snapshot.photoUuid) == "string" and snapshot.photoUuid ~= "",
    "Vollständige Foto-UUID erforderlich.")
  assert(type(snapshot.values) == "table" and type(snapshot.keywords) == "table", "FN-Schnappschuss unvollständig.")
  for _, field in ipairs(FIELDS) do assert(type(snapshot.values[field]) == "string", "FN-Feld fehlt: " .. field) end
  for field in pairs(snapshot.values) do assert(ALLOWED[field], "Fremdes Feld im FN-Schnappschuss: " .. tostring(field)) end
  assert(#snapshot.values.masterTaxonId == 36 and string.match(snapshot.values.masterTaxonId, "^mtx_[a-f0-9]+$"), "Ungültige Master-ID.")
  assert(snapshot.values.referenceImage == "yes" or snapshot.values.referenceImage == "no"
    or snapshot.values.referenceImage == "", "Ungültiger Art-Favoritenstand.")
  local seen = {}
  for _, entry in ipairs(snapshot.keywords) do
    assert(type(entry.id) == "string" and entry.id ~= "" and managed(entry.name) and not seen[entry.id],
      "Ungültiges oder doppeltes FN-Stichwort.")
    seen[entry.id] = true
  end
end

function IdentitySnapshot.protectedNames(photo)
  local names = {}
  local stored = photo:getPropertyForPlugin(_PLUGIN, "locationTimeKeywordNames") or ""
  for name in string.gmatch(stored, "[^\n]+") do names[string.lower(name)] = true end
  return names
end

function IdentitySnapshot.keyword(keyword)
  local kind = type(keyword)
  if kind ~= "table" and kind ~= "userdata" then
    if managed(keyword) then error("Lightroom liefert ein FN-Stichwort ohne lesbare Objektkennung. Keine Artänderung möglich.", 0) end
    return nil
  end
  local name = keyword:getName()
  if not managed(name) then return nil end
  local id = tostring(keyword.localIdentifier or "")
  if id == "" then error("Ein FN-Stichwort besitzt keine lesbare Kennung.", 0) end
  return { id = id, name = name }
end

function IdentitySnapshot.capture(photo)
  local result = { photoUuid = tostring(photo:getRawMetadata("uuid") or ""), values = {}, keywords = {} }
  if result.photoUuid == "" then error("Das Foto besitzt keine lesbare UUID.", 0) end
  for _, field in ipairs(FIELDS) do
    local value = photo:getPropertyForPlugin(_PLUGIN, field)
    if value ~= nil and type(value) ~= "string" then error("FN-Feld nicht vollständig lesbar: " .. field, 0) end
    result.values[field] = value or ""
  end
  local protected = IdentitySnapshot.protectedNames(photo)
  local seen = {}
  for key, value in pairs(photo:getRawMetadata("keywords") or {}) do
    for _, item in ipairs({ key, value }) do
      local entry = IdentitySnapshot.keyword(item)
      if entry and not protected[string.lower(entry.name)] and not seen[entry.id] then
        seen[entry.id] = true
        table.insert(result.keywords, entry)
      end
    end
  end
  table.sort(result.keywords, function(left, right) return left.id < right.id end)
  return result
end

function IdentitySnapshot.equal(left, right)
  if not left or not right or left.photoUuid ~= right.photoUuid then return false end
  for _, field in ipairs(FIELDS) do
    if left.values[field] ~= right.values[field] then return false end
  end
  if #left.keywords ~= #right.keywords then return false end
  local byId = {}
  for _, keyword in ipairs(left.keywords) do byId[keyword.id] = keyword.name end
  for _, keyword in ipairs(right.keywords) do if byId[keyword.id] ~= keyword.name then return false end end
  return true
end

local function numericIdentifier(value)
  return type(value) == "number" and value >= 1 and value <= 9007199254740991 and value % 1 == 0
end

local function keywordReadFailed()
  error("Lightroom konnte die FN-Stichwörter nicht prüfen. Die Artänderung bleibt angehalten; das vorhandene Laufprotokoll bleibt erhalten.", 0)
end

local function invalidKeywordResponse()
  error("Lightroom lieferte keine eindeutige FN-Stichwortantwort. Die Artänderung bleibt angehalten.", 0)
end

-- Journals retain string IDs. The documented SDK lookup accepts an array of
-- numeric localIdentifier values and returns objects, not a positional map.
local function lookupKeywords(catalog, entries)
  local ids, wanted, result = {}, {}, {}
  for _, entry in ipairs(entries) do
    local id = type(entry.id) == "string" and tonumber(entry.id) or nil
    assert(numericIdentifier(id) and string.format("%.0f", id) == entry.id and not wanted[entry.id]
      and managed(entry.name), "Eine protokollierte FN-Stichwortkennung ist ungültig. Keine Fotoänderung wurde gestartet.")
    wanted[entry.id] = true
    table.insert(ids, id)
  end
  if #ids == 0 then return result end
  local ok, keywords = LrTasks.pcall(function() return catalog:getKeywordsByLocalId(ids) end)
  if not ok then keywordReadFailed() end
  if type(keywords) ~= "table" then invalidKeywordResponse() end
  local count = 0
  for index, keyword in pairs(keywords) do
    if type(index) ~= "number" or index < 1 or index % 1 ~= 0 then invalidKeywordResponse() end
    local readable, entry = LrTasks.pcall(function()
      if type(keyword) ~= "table" and type(keyword) ~= "userdata" then return nil end
      local id = keyword.localIdentifier
      if not numericIdentifier(id) then return nil end
      local name = keyword:getName()
      if type(name) ~= "string" then return nil end
      return { id = string.format("%.0f", id), name = name, keyword = keyword }
    end)
    if not readable then keywordReadFailed() end
    if not entry or not wanted[entry.id] or result[entry.id] then invalidKeywordResponse() end
    result[entry.id] = entry
    count = count + 1
  end
  for index = 1, count do if keywords[index] == nil then invalidKeywordResponse() end end
  return result
end

function IdentitySnapshot.resolveKeywords(catalog, snapshot, allowUnavailable)
  local found, result = lookupKeywords(catalog, snapshot.keywords), {}
  for _, entry in ipairs(snapshot.keywords) do
    local actual = found[entry.id]
    if actual and actual.name == entry.name then result[entry.id] = actual.keyword
    elseif allowUnavailable ~= true then
      error("Ein benötigtes FN-Stichwort wurde gelöscht oder umbenannt. Es wird nicht automatisch wiederhergestellt: " .. entry.name, 0)
    end
  end
  return result
end

return IdentitySnapshot
