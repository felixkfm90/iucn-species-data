local LrTasks = import "LrTasks"
local Snapshot = require "IdentitySnapshot"
local Helper = require "TaxonomyHelper"
local IdentityCatalog = {}

function IdentityCatalog.key(catalog)
  local value = catalog:getPath()
  assert(type(value) == "string" and value ~= "", "Die Lightroom-Katalogkennung fehlt.")
  return value
end

local function basic(photo)
  local id = photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId")
  if id == nil or id == "" then return nil end
  local uuid = photo:getRawMetadata("uuid")
  local reference = photo:getPropertyForPlugin(_PLUGIN, "referenceImage") or ""
  assert(type(id) == "string" and #id == 36 and string.match(id, "^mtx_[a-f0-9]+$"), "Ungültige FN-Master-ID im Katalog.")
  assert(type(uuid) == "string" and uuid ~= "", "Foto-UUID fehlt.")
  assert(reference == "" or reference == "yes" or reference == "no", "Ungültiger Art-Favoritenstand.")
  return { photoUuid = uuid, masterTaxonId = id, referenceImage = reference }
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
  for index, photo in ipairs(photos) do
    if index % 250 == 1 then
      if progress then assert(progress(index - 1, #photos) ~= false, "Artänderungsprüfung pausiert; keine neue Fotoänderung.") end
      LrTasks.yield()
    end
    local row = basic(photo)
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
  for _, photo in ipairs(catalog:getAllPhotos()) do
    local row = basic(photo)
    if row then
      local old = read.rowsByUuid[row.photoUuid]
      assert(old and not seen[row.photoUuid] and old.masterTaxonId == row.masterTaxonId
        and old.referenceImage == row.referenceImage, "Katalog/Favoriten wurden inzwischen verändert. Bitte neu prüfen.")
      seen[row.photoUuid] = true
      count = count + 1
      local snapshot = read.byUuid[row.photoUuid]
      if snapshot then assert(Snapshot.equal(snapshot, Snapshot.capture(photo)), "Ein FN-Fotostand wurde inzwischen verändert.") end
    end
  end
  assert(count == #read.inventoryRows, "Ein FN-Foto fehlt inzwischen. Bitte neu prüfen.")
  IdentityCatalog.assertPackage(expectedPackage)
end

return IdentityCatalog
