local LrTasks = import "LrTasks"
local Snapshot = require "IdentitySnapshot"
local Helper = require "TaxonomyHelper"
local IdentityCatalog = {}

function IdentityCatalog.key(catalog)
  local value = catalog:getPath()
  assert(type(value) == "string" and value ~= "", "Die Lightroom-Katalogkennung fehlt.")
  return value
end

local CHUNK_SIZE = 250

local function batchResponse(response, photos)
  assert(type(response) == "table", "Lightroom lieferte keine vollständige Metadatenantwort.")
  local expected = {}
  for _, photo in ipairs(photos) do
    assert(not expected[photo] and type(response[photo]) == "table", "Eine Fotoantwort fehlt oder ist doppelt.")
    expected[photo] = true
  end
  for photo in pairs(response) do assert(expected[photo], "Lightroom lieferte eine fremde Fotoantwort.") end
  return response
end

local function basic(properties, raw)
  local id = properties.masterTaxonId
  if id == nil or id == "" then return nil end
  local uuid = raw.uuid
  local reference = properties.referenceImage
  if reference == nil then reference = "" end
  assert(type(id) == "string" and #id == 36 and string.match(id, "^mtx_[a-f0-9]+$"), "Ungültige FN-Master-ID im Katalog.")
  assert(type(uuid) == "string" and uuid ~= "", "Foto-UUID fehlt.")
  assert(reference == "" or reference == "yes" or reference == "no", "Ungültiger Art-Favoritenstand.")
  return { photoUuid = uuid, masterTaxonId = id, referenceImage = reference }
end

-- SDK3.0+: responses are keyed by the actual LrPhoto objects, never positions.
-- Read every photo's identity/favorite fields; missing photo rows fail closed.
local function eachBatch(catalog, photos, first, visit)
  local chunk, assigned = {}, {}
  for index = first, math.min(first + CHUNK_SIZE - 1, #photos) do table.insert(chunk, photos[index]) end
  local properties = batchResponse(catalog:batchGetPropertyForPlugin(chunk, _PLUGIN,
    { "masterTaxonId", "referenceImage" }), chunk)
  for _, photo in ipairs(chunk) do
    local id = properties[photo].masterTaxonId
    if id ~= nil and id ~= "" then
      assert(type(id) == "string" and #id == 36 and string.match(id, "^mtx_[a-f0-9]+$"), "Ungültige FN-Master-ID im Katalog.")
      table.insert(assigned, photo)
    end
  end
  local raw = #assigned > 0 and batchResponse(catalog:batchGetRawMetadata(assigned, { "uuid" }), assigned) or {}
  for _, photo in ipairs(chunk) do visit(photo, basic(properties[photo], raw[photo])) end
end

function IdentityCatalog.assertPackage(expected)
  if not expected then return end -- undo does not require today's package
  local current = Helper.searchPackageStatus()
  assert(current.available and current.packageId == expected.packageId and current.masterVersion == expected.masterVersion
    and (current.correctionRevision or "") == (expected.correctionRevision or ""),
    "Der Datenbankstand hat sich geändert. Artänderung bitte erneut prüfen.")
end

-- Explicit action only. No caller in AssignmentWindow/onShow. Read all basic
-- identities/favorites, full snapshots only for selected/journal photos and all
-- favorites, so a large catalog does not need 43 fields read on every photo.
function IdentityCatalog.read(catalog, wanted, progress)
  local result = { catalogKey = IdentityCatalog.key(catalog), inventoryRows = {}, observed = {}, byUuid = {}, rowsByUuid = {} }
  local photos = catalog:getAllPhotos()
  for first = 1, #photos, CHUNK_SIZE do
    if progress then assert(progress(first - 1, #photos) ~= false, "Artänderungsprüfung pausiert; keine neue Fotoänderung.") end
    LrTasks.yield()
    eachBatch(catalog, photos, first, function(photo, row)
      if row then
        assert(not result.rowsByUuid[row.photoUuid], "Doppelte Foto-UUID im Katalog.")
        result.rowsByUuid[row.photoUuid] = row
        table.insert(result.inventoryRows, row)
        if wanted[row.photoUuid] or row.referenceImage == "yes" then
          assert(#result.observed < 20000, "Zu viele vollständige Fotoschnappschüsse für diesen Lauf.")
          local snapshot = Snapshot.capture(photo)
          Snapshot.validate(snapshot)
          result.byUuid[row.photoUuid] = snapshot
          table.insert(result.observed, snapshot)
        end
      end
    end)
  end
  if progress then assert(progress(#photos, #photos) ~= false, "Artänderungsprüfung pausiert; keine neue Fotoänderung.") end
  return result
end

-- Recheck INSIDE the writer's catalog lock. No helper process, dialog, explicit
-- yield or nested write here. Include newly added photos and outside favorites.
function IdentityCatalog.guard(catalog, read, expectedPackage)
  assert(IdentityCatalog.key(catalog) == read.catalogKey, "Der Lightroom-Katalog wurde gewechselt.")
  IdentityCatalog.assertPackage(expectedPackage)
  local seen, count = {}, 0
  local photos = catalog:getAllPhotos()
  for first = 1, #photos, CHUNK_SIZE do
    eachBatch(catalog, photos, first, function(photo, row)
      if row then
        local old = read.rowsByUuid[row.photoUuid]
        assert(old and not seen[row.photoUuid] and old.masterTaxonId == row.masterTaxonId
          and old.referenceImage == row.referenceImage, "Katalog/Favoriten wurden inzwischen verändert. Bitte neu prüfen.")
        seen[row.photoUuid] = true
        count = count + 1
        local snapshot = read.byUuid[row.photoUuid]
        if snapshot then assert(Snapshot.equal(snapshot, Snapshot.capture(photo)), "Ein FN-Fotostand wurde inzwischen verändert.") end
      end
    end)
  end
  assert(count == #read.inventoryRows, "Ein FN-Foto fehlt inzwischen. Bitte neu prüfen.")
  IdentityCatalog.assertPackage(expectedPackage)
end

return IdentityCatalog
