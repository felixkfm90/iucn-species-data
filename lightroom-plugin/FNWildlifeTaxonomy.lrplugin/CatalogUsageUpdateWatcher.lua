local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrPathUtils = import "LrPathUtils"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local Helper = require "TaxonomyHelper"
local Json = require "Json"
local Capture = require "CatalogUsageCapture"

local Watcher = {}
local MAX_REQUEST_BYTES = 65536
local GENERATION_KEY = "fnCatalogUsageWatcherGeneration"
local UUID_PATTERN = "^[a-f0-9]+%-[a-f0-9]+%-[a-f0-9]+%-[a-f0-9]+%-[a-f0-9]+$"

local function validId(value, prefix)
  if type(value) ~= "string" or value:sub(1, #prefix) ~= prefix then return false end
  local uuid = value:sub(#prefix + 1)
  if #uuid ~= 36 or not uuid:match(UUID_PATTERN) then return false end
  local first, second, third, fourth, fifth = uuid:match("^([a-f0-9]+)%-([a-f0-9]+)%-([a-f0-9]+)%-([a-f0-9]+)%-([a-f0-9]+)$")
  return #first == 8 and #second == 4 and #third == 4 and #fourth == 4 and #fifth == 12
end

function Watcher.requestFile()
  local root = Helper.searchRoot()
  if type(root) ~= "string" or root == "" then return nil end
  return LrPathUtils.child(LrPathUtils.parent(root), "taxonomy/catalog-usage/update-request.json")
end

function Watcher.readRequest()
  local filename = Watcher.requestFile()
  if not filename then return nil end
  local file = io.open(filename, "rb")
  if not file then return nil end
  local content, readError = file:read(MAX_REQUEST_BYTES + 1)
  local closed, closeError = file:close()
  assert(content ~= nil and closed, tostring(readError or closeError or "Erfassungsauftrag konnte nicht gelesen werden."))
  assert(#content <= MAX_REQUEST_BYTES, "Der lokale FN-Erfassungsauftrag ist zu groß.")
  local ok, request = pcall(Json.decode, content)
  assert(ok and type(request) == "table", "Der lokale FN-Erfassungsauftrag ist ungültig.")
  assert(request.schemaVersion == 1 and validId(request.requestId, "capture-request-")
    and validId(request.updateRunId, "update-") and type(request.createdAt) == "string" and request.createdAt ~= ""
    and type(request.revision) == "string" and #request.revision == 64 and request.revision:match("^[a-f0-9]+$")
    and type(request.captureRevision) == "string" and #request.captureRevision == 64 and request.captureRevision:match("^[a-f0-9]+$")
    and type(request.catalogs) == "table" and #request.catalogs > 0 and #request.catalogs <= 100,
    "Der lokale FN-Erfassungsauftrag ist nicht vollständig gebunden.")
  local seen = {}
  for _, catalogPath in ipairs(request.catalogs) do
    assert(type(catalogPath) == "string" and catalogPath:lower():match("%.lrcat$")
      and (catalogPath:match("^[A-Za-z]:[/\\]") or catalogPath:match("^[/\\][/\\]") or catalogPath:match("^/")),
      "Der Erfassungsauftrag enthält keinen absoluten Lightroom-Katalogpfad.")
    local normalized = catalogPath:gsub("\\", "/"):lower()
    assert(not seen[normalized], "Der Erfassungsauftrag enthält einen Katalog doppelt.")
    seen[normalized] = true
  end
  return request
end

local function nextGeneration(prefs)
  local value = tonumber(prefs[GENERATION_KEY]) or 0
  if value ~= value or value < 0 or value > 1000000000000 then value = 0 end
  prefs[GENERATION_KEY] = value + 1
  return value + 1
end

function Watcher.stop()
  nextGeneration(LrPrefs.prefsForPlugin())
end

function Watcher.start()
  local prefs = LrPrefs.prefsForPlugin()
  local generation = nextGeneration(prefs)
  local attempted, lastError = {}, nil
  local activeAttempt = nil
  local function current() return prefs[GENERATION_KEY] == generation end
  local function poll()
    activeAttempt = nil
    local request = Watcher.readRequest()
    if not request or request.status ~= "pending" or attempted[request.requestId] or not current() then return end
    attempted[request.requestId] = true
    activeAttempt = request
    local catalog = LrApplication.activeCatalog()
    assert(catalog, "Kein aktiver Lightroom-Katalog für den bestätigten Updateauftrag vorhanden.")
    local catalogPath = catalog:getPath()
    local known = false
    for _, filename in ipairs(request.catalogs) do if Capture.samePath(filename, catalogPath) then known = true end end
    -- Report an unknown current catalog once, but never scan it. The backend
    -- independently validates this request before any expensive SDK reads.
    local permission = Helper.request({ command = "catalog-usage-request", catalogPath = catalogPath,
      captureRequestId = request.requestId })
    assert(known, "Der aktive Katalog gehört nicht zum bestätigten FN-Katalogsatz; keine Erfassung gestartet.")
    assert(permission and type(permission.required) == "boolean", "Die Erfassungsanforderung konnte nicht geprüft werden.")
    if not permission.required then return end
    assert(permission.requestId == request.requestId and permission.requestRevision == request.captureRevision,
      "Der Erfassungsauftrag wurde inzwischen verändert; keine Erfassung gestartet.")
    if not current() then return end
    local outcome = Capture.run({ catalogPath = catalogPath, captureRequestId = request.requestId, requestRevision = permission.requestRevision,
      isCurrent = function(stage)
        if not current() then return false end
        if stage ~= "submit" then return true end
        local fresh = Watcher.readRequest()
        return fresh and fresh.status == "pending" and fresh.requestId == request.requestId
          and fresh.captureRevision == permission.requestRevision and fresh.updateRunId == request.updateRunId
      end })
    if not outcome.ok and current() then
      LrTasks.pcall(function()
        Helper.request({ command = "catalog-usage-request-error", captureRequestId = request.requestId,
          requestRevision = permission.requestRevision, message = outcome.error or "FN-Erfassung abgebrochen" })
      end)
    end
  end
  LrTasks.startAsyncTask(function()
    while current() do
      local ok, message = LrTasks.pcall(poll)
      if not ok and current() and tostring(message) ~= lastError then
        lastError = tostring(message)
        if activeAttempt then
          LrTasks.pcall(function()
            Helper.request({ command = "catalog-usage-request-error", captureRequestId = activeAttempt.requestId,
              requestRevision = activeAttempt.captureRevision, message = lastError })
          end)
        end
        LrDialogs.message("FN-Update wartet auf Katalognutzung", lastError, "warning")
      end
      if current() then LrTasks.sleep(10) end
    end
  end)
  return generation
end

return Watcher
