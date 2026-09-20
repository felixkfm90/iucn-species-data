local IdentitySnapshot = require "IdentitySnapshot"
local KeywordWriter = require "KeywordWriter"
local PluginState = require "PluginState"
local Statistics = require "Statistics"

local IdentityWriter = {}

local function write(catalog, title, callback)
  local completed = false
  catalog:withWriteAccessDo(title, function()
    callback()
    completed = true
  end, { timeout = 10 })
  if not completed then
    error("Lightroom ist noch mit einem anderen Katalogvorgang beschäftigt. Bitte warten und erneut versuchen.", 0)
  end
end

-- Allocate only the NEW flat taxonomy keywords, after the caller's confirmed
-- preview. The exact IDs are needed before durably preparing the photo journal.
-- If preparation is canceled later, empty newly allocated keywords may remain;
-- this module never deletes catalog keyword objects or recreates old undo keys.
function IdentityWriter.prepareTarget(catalog, taxon, assertCurrent)
  assert(type(assertCurrent) == "function", "Eine aktuelle bestätigte Vorschau ist erforderlich.")
  assertCurrent()
  local template = KeywordWriter.identityTemplate(taxon)
  local keywords, ids = {}, {}
  write(catalog, "FN Wildlife – Nachfolgerstichwörter vorbereiten", function()
    assertCurrent()
    local seen = {}
    for _, name in ipairs(template.names) do
      local keyword = catalog:createKeyword(name, {}, true, nil, true)
      if not keyword then error("Lightroom lieferte kein Stichwortobjekt für " .. name, 0) end
      local entry = IdentitySnapshot.keyword(keyword)
      if not entry then error("Nachfolgerstichwort ist nicht eindeutig als FN markiert.", 0) end
      if not seen[entry.id] then
        seen[entry.id] = true
        table.insert(keywords, entry)
        table.insert(ids, entry.id)
      end
    end
  end)
  table.sort(keywords, function(left, right) return left.id < right.id end)
  template.values.taxonomyKeywordIds = #ids > 0 and table.concat(ids, ",") or "none"
  if #template.values.taxonomyKeywordIds > 460 then
    error("Die Stichwortkennungen überschreiten die Lightroom-Metadatengrenze. Keine Fotoänderung wurde gestartet.", 0)
  end
  return { values = template.values, keywords = keywords }
end

local function resolveChanges(catalog, changes, direction)
  local result, seen = {}, {}
  for _, change in ipairs(changes) do
    local from = direction == "undo" and change.after or change.before
    local to = direction == "undo" and change.before or change.after
    IdentitySnapshot.validate(from)
    IdentitySnapshot.validate(to)
    assert(from.photoUuid == to.photoUuid and not seen[from.photoUuid], "Fremdes oder doppeltes Journalfoto.")
    seen[from.photoUuid] = true
    local photo = catalog:findPhotoByUuid(from.photoUuid)
    if not photo or not IdentitySnapshot.equal(IdentitySnapshot.capture(photo), from) then
      error("Ein Foto wurde seit der Vorschau verändert oder fehlt. Der Block bleibt unverändert: " .. from.photoUuid, 0)
    end
    local protected = IdentitySnapshot.protectedNames(photo)
    for _, entry in ipairs(to.keywords) do
      if protected[string.lower(entry.name)] then error("Ein Nachfolgerstichwort wird von den FN-Orts-/Zeitdaten verwendet. Keine Übernahme.", 0) end
    end
    table.insert(result, { photo = photo, from = from, to = to,
      oldKeywords = IdentitySnapshot.resolveKeywords(catalog, from),
      newKeywords = IdentitySnapshot.resolveKeywords(catalog, to) })
  end
  return result
end

-- Caller must persist the complete block in the journal BEFORE calling this
-- primitive. This is NOT an assign bypass exposed through a menu or helper.
-- assertCurrent is read-only and must not start a helper or nested catalog write.
function IdentityWriter.applyBlock(catalog, changes, direction, assertCurrent)
  assert(direction == "apply" or direction == "undo", "Unbekannte Artänderungsaktion.")
  assert(type(assertCurrent) == "function", "Journal- und Vorschauprüfung fehlt.")
  assert(#changes > 0 and #changes <= 250, "Ein Artänderungsblock umfasst höchstens 250 Fotos.")
  assertCurrent()
  resolveChanges(catalog, changes, direction)
  local affected
  write(catalog, direction == "undo" and "FN Wildlife – Artänderung zurücknehmen" or "FN Wildlife – Artänderung übernehmen", function()
    assertCurrent()
    affected = resolveChanges(catalog, changes, direction)
    local beforeStatistics, afterStatistics = {}, {}
    for index, entry in ipairs(affected) do beforeStatistics[index] = Statistics.photoSnapshot(entry.photo) end
    for _, entry in ipairs(affected) do
      for id, keyword in pairs(entry.oldKeywords) do
        if not entry.newKeywords[id] then entry.photo:removeKeyword(keyword) end
      end
      for id, keyword in pairs(entry.newKeywords) do
        if not entry.oldKeywords[id] then entry.photo:addKeyword(keyword) end
      end
      for _, field in ipairs(IdentitySnapshot.fields) do
        if entry.from.values[field] ~= entry.to.values[field] then
          entry.photo:setPropertyForPlugin(_PLUGIN, field, entry.to.values[field])
        end
      end
    end
    for index, entry in ipairs(affected) do afterStatistics[index] = Statistics.photoSnapshot(entry.photo) end
    PluginState.applyStatisticsPhotoChanges(catalog, beforeStatistics, afterStatistics)
  end)
  local observed = {}
  for _, entry in ipairs(affected) do
    local actual = IdentitySnapshot.capture(entry.photo)
    if not IdentitySnapshot.equal(actual, entry.to) then
      error("Lightroom hat den vorgesehenen FN-Stand nicht vollständig gespeichert. Journal zur Wiederaufnahme prüfen: " .. actual.photoUuid, 0)
    end
    table.insert(observed, actual)
  end
  return observed
end

return IdentityWriter
