local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrProgressScope = import "LrProgressScope"
local LrTasks = import "LrTasks"
local Helper = require "TaxonomyHelper"
local Json = require "Json"

local Capture = {}

function Capture.samePath(left, right)
  local function normalize(value)
    local path = tostring(value or ""):gsub("\\", "/"):gsub("/+$", "")
    if path:match("^[A-Za-z]:/") or path:match("^//") then path = path:lower() end
    return path
  end
  return normalize(left) == normalize(right)
end

local function assertCurrent(scope, options, stage)
  assert(not scope:isCanceled(), "FN-Nutzungserfassung abgebrochen; keine Freigabe gespeichert.")
  assert(not options.isCurrent or options.isCurrent(stage),
    "Der Erfassungsauftrag oder das Zusatzmodul wurde inzwischen ersetzt; keine Freigabe gespeichert.")
end

local function assertCatalog(catalogPath)
  local active = LrApplication.activeCatalog()
  assert(active and Capture.samePath(active:getPath(), catalogPath),
    "Der aktive Lightroom-Katalog wurde während der Erfassung gewechselt.")
end

local function read(catalog, scope, pass, options)
  local catalogPath = catalog:getPath()
  assertCatalog(catalogPath)
  assertCurrent(scope, options, "scan")
  local photos = catalog:getAllPhotos()
  assert(#photos <= 1000000, "Zu viele Fotos für diese FN-Nutzungserfassung.")
  local rows, counts = {}, {}
  for index, photo in ipairs(photos) do
    if index % 250 == 1 then
      assertCurrent(scope, options, "scan")
      scope:setCaption("FN-Kennungen lesen – Durchgang " .. tostring(pass) .. " von 2")
      scope:setPortionComplete((pass - 1) * #photos + index - 1, math.max(1, 2 * #photos))
      LrTasks.yield()
      assertCurrent(scope, options, "scan")
    end
    local uuid = photo:getRawMetadata("uuid")
    local id = photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId") or ""
    assert(type(uuid) == "string" and uuid ~= "" and rows[uuid] == nil, "Fehlende oder doppelte Foto-UUID.")
    assert(id == "" or type(id) == "string" and #id == 36 and id:match("^mtx_[a-f0-9]+$"),
      "Ungültige FN-Master-ID im Katalog.")
    rows[uuid] = id
    if id ~= "" then counts[id] = (counts[id] or 0) + 1 end
  end
  assertCurrent(scope, options, "scan")
  assertCatalog(catalogPath)
  assert(Capture.samePath(catalog:getPath(), catalogPath), "Katalog wurde inzwischen verändert.")
  return { rows = rows, counts = counts, totalPhotos = #photos, catalogPath = catalogPath }
end

-- Read-only SDK core. Neither this module nor the watcher changes photos,
-- plug-in metadata, keywords, selection, favorites or the statistics index.
function Capture.capture(catalog, scope, options)
  options = options or {}
  local first = read(catalog, scope, 1, options)
  local second = read(catalog, scope, 2, options)
  assert(Capture.samePath(first.catalogPath, second.catalogPath) and first.totalPhotos == second.totalPhotos,
    "Katalog wurde inzwischen verändert.")
  for uuid, id in pairs(first.rows) do
    assert(second.rows[uuid] == id, "FN-Daten wurden während der Erfassung geändert. Bitte erneut erfassen.")
  end
  local taxa = Json.array({})
  for id, count in pairs(second.counts) do table.insert(taxa, { masterTaxonId = id, photoCount = count }) end
  table.sort(taxa, function(left, right) return left.masterTaxonId < right.masterTaxonId end)
  assertCurrent(scope, options, "submit")
  assertCatalog(second.catalogPath)
  local payload = { command = "catalog-usage-capture", catalogPath = second.catalogPath,
    totalPhotos = second.totalPhotos, usedTaxa = taxa, complete = true, passes = 2 }
  if options.captureRequestId then
    payload.captureRequestId = options.captureRequestId
    payload.requestRevision = options.requestRevision
  end
  local result = Helper.request(payload)
  assert(result and result.saved, "Die FN-Nutzung konnte nicht gespeichert werden.")
  return result
end

function Capture.run(options)
  options = options or {}
  local outcome = { ok = false }
  LrFunctionContext.callWithContext("FN-Katalognutzung erfassen", function(context)
    if options.manual then
      local confirmed = LrDialogs.confirm("FN-Katalognutzung erfassen?",
        "Die FN-Master-Kennungen aller Fotos werden zweimal nur gelesen. Fotos, Metadaten und Stichwörter bleiben unverändert. Danach Lightroom normal schließen und den Nutzungsstand im Arten-Explorer bestätigen. Während der Erfassung bitte keine Fotoänderungen starten.",
        "Erfassen", "Abbrechen")
      if confirmed ~= "ok" then outcome.cancelled = true; return end
    end
    local scope = LrProgressScope({ title = "FN-Katalognutzung erfassen", functionContext = context })
    scope:setCancelable(true)
    local ok, result = LrTasks.pcall(function()
      local catalog = LrApplication.activeCatalog()
      assert(catalog, "Kein aktiver Lightroom-Katalog vorhanden.")
      if options.catalogPath then
        assert(Capture.samePath(catalog:getPath(), options.catalogPath), "Der Erfassungsauftrag gehört zu einem anderen Katalog.")
      end
      return Capture.capture(catalog, scope, options)
    end)
    scope:done()
    outcome = { ok = ok, result = ok and result or nil, error = not ok and tostring(result) or nil }
    if not ok then
      LrDialogs.message("FN-Nutzung nicht übernommen", tostring(result), "warning")
    elseif options.manual then
      LrDialogs.message("FN-Nutzung erfasst", tostring(result.assignedPhotos) .. " Fotos mit FN-Taxonomie · "
        .. tostring(result.taxonCount) .. " verwendete Arten.\nBitte jetzt Lightroom normal schließen, ohne weitere FN-Daten zu ändern. Im Arten-Explorer unter Taxonomiedatenbank → FN-Nutzung bestätigen fortfahren. Noch keine automatische Klassifikationsfreigabe.", "info")
    end
  end)
  return outcome
end

return Capture
