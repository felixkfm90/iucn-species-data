local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrUUID = import "LrUUID"
local Json = require "Json"

local TempSession = {}
local closing = false
local operations = {}
local anchor = nil
local anchorCreating = false

local function quote(value)
  return '"' .. string.gsub(tostring(value or ""), '"', '\\"') .. '"'
end

local function normalize(value)
  return string.lower(string.gsub(tostring(value or ""), "\\", "/"))
end

local function runtime()
  local Helper = require "TaxonomyHelper"
  local repository = LrPathUtils.parent(LrPathUtils.parent(_PLUGIN.path))
  return Helper.runtimeNodePath(), Helper.runtimeCommandProcessor(),
    LrPathUtils.child(repository, "species-explorer/lightroom-temp-helper.mjs")
end

local function helperCommand(command, id, capability, extra)
  local node, processor, helper = runtime()
  if not LrFileUtils.exists(helper) then
    error("Die sichere Verwaltung der Plug-in-Arbeitsdateien wurde nicht gefunden.")
  end
  local args = { quote(node), "--no-warnings", quote(helper), quote("--command=" .. command),
    quote("--plugin-root=" .. _PLUGIN.path) }
  if id then table.insert(args, quote("--session-id=" .. id)) end
  if capability then table.insert(args, quote("--capability=" .. capability)) end
  for _, argument in ipairs(extra or {}) do table.insert(args, quote(argument)) end
  return processor .. ' /d /s /c "' .. table.concat(args, " ") .. '"'
end

local function warning(message)
  -- Persistent small warning, not a catalog-close receipt or an external log.
  LrPrefs.prefsForPlugin().tempCleanupWarning = tostring(message)
end

local function readManifest(path)
  local file, message = io.open(path, "rb")
  if not file then error("Temp-Eigentumsnachweis nicht lesbar: " .. tostring(message)) end
  local text = file:read("*a")
  file:close()
  local ok, manifest = pcall(Json.decode, text)
  if not ok or type(manifest) ~= "table" then error("Ungültiger Temp-Eigentumsnachweis.") end
  return manifest
end

local function writeManifest(path, manifest)
  local file, message = io.open(path, "wb")
  if not file then error("Temp-Eigentumsnachweis nicht schreibbar: " .. tostring(message)) end
  local written, writeError = file:write(Json.encode(manifest))
  local closed, closeError = file:close()
  if not written or not closed then error(tostring(writeError or closeError or "Temp-Schreibfehler")) end
end

local function validLeaf(name)
  return type(name) == "string" and name ~= "" and name ~= "." and name ~= ".."
    and not string.find(name, "[/\\:%z]") and not string.find(name, "^%.fn%-temp%-session")
end

local function ensureAnchor()
  while anchorCreating do LrTasks.sleep(0.01) end
  if anchor then return anchor end
  anchorCreating = true
  local ok, result = LrTasks.pcall(function()
    local id, capability = LrUUID.generateUUID(), LrUUID.generateUUID()
    local root = LrPathUtils.child(_PLUGIN.path, "temp/plugin/" .. id)
    if LrTasks.execute(helperCommand("create-owner", id, capability)) ~= 0 then
      error("Eigentümer der Plug-in-Arbeitsdateien konnte nicht sicher erfasst werden.")
    end
    local manifest = readManifest(LrPathUtils.child(root, ".fn-temp-session.json"))
    if manifest.role ~= "plugin-owner" or manifest.sessionId ~= id or manifest.capability ~= capability then
      error("Ungültiger Sitzungsnachweis der Plug-in-Arbeitsdateien.")
    end
    return { id = id, capability = capability, root = root }
  end)
  anchorCreating = false
  if not ok then error(result) end
  anchor = result
  return anchor
end

local function closeAnchor()
  if not anchor or next(operations) then return end
  local current = anchor
  anchor = nil
  local ok, result = LrTasks.pcall(function()
    local manifestPath = LrPathUtils.child(current.root, ".fn-temp-session.json")
    local manifest = readManifest(manifestPath)
    manifest.artifacts = Json.array(manifest.artifacts)
    manifest.helperPids = Json.array(manifest.helperPids)
    manifest.state = "closed"
    writeManifest(manifestPath, manifest)
    return LrTasks.execute(helperCommand("cleanup", current.id, current.capability))
  end)
  if not ok or result ~= 0 then warning("Plug-in-Sitzungsrest bleibt für die nächste sichere Startprüfung erhalten.") end
end

function TempSession.initialize()
  closing = false
  LrTasks.startAsyncTask(function()
    local ok, result = LrTasks.pcall(function()
      return LrTasks.execute(helperCommand("orphans"))
    end)
    if not ok or result ~= 0 then
      warning("Alte Plug-in-Arbeitsdateien konnten nicht sicher geprüft werden; sie bleiben erhalten.")
    end
  end)
end

function TempSession.begin(label)
  if closing then error("Das Plug-in wird geschlossen; keine neue Hilfsoperation wird gestartet.") end
  local owner = ensureAnchor()
  if closing then
    closeAnchor()
    error("Das Plug-in wurde während der Hilfsvorbereitung geschlossen.")
  end
  local id, capability = LrUUID.generateUUID(), LrUUID.generateUUID()
  local root = LrPathUtils.child(_PLUGIN.path, "temp/plugin/" .. id)
  local manifestPath = LrPathUtils.child(root, ".fn-temp-session.json")
  local operation = { root = root, id = id }
  -- Reserve before execute yields. A simultaneous shutdown must not close the
  -- anchor while this operation's guarded directory is being prepared.
  operations[id] = operation
  local prepared, manifest = LrTasks.pcall(function()
    if LrTasks.execute(helperCommand("create", id, capability,
      { "--owner-session=" .. owner.id, "--owner-capability=" .. owner.capability })) ~= 0 then
      error("Eigener Plug-in-Arbeitsordner konnte nicht sicher angelegt werden.")
    end
    local value = readManifest(manifestPath)
    if value.sessionId ~= id or value.capability ~= capability or value.owner ~= "plugin" then
      error("Eigener Plug-in-Arbeitsordner besitzt keinen passenden Eigentumsnachweis.")
    end
    return value
  end)
  if not prepared then
    operations[id] = nil
    if closing then closeAnchor() end
    error(manifest)
  end
  -- JSON arrays must remain arrays when the Lua table is empty.
  manifest.artifacts = Json.array()
  manifest.helperPids = Json.array()
  manifest.operations = 1
  manifest.label = tostring(label or "Hilfsoperation")
  writeManifest(manifestPath, manifest)
  local released = false

  function operation:register(filePath)
    if released then error("Plug-in-Arbeitsoperation bereits beendet.") end
    local prefix = normalize(root) .. "/"
    local normalized = normalize(filePath)
    if string.sub(normalized, 1, string.len(prefix)) ~= prefix then
      error("Arbeitsdatei liegt außerhalb der eigenen Sitzung.")
    end
    local name = string.sub(tostring(filePath), string.len(root) + 2)
    if not validLeaf(name) then error("Ungültiger eigener Arbeitsdateiname.") end
    for _, artifact in ipairs(manifest.artifacts) do
      if normalize(artifact.relative) == normalize(name) then return filePath end
    end
    table.insert(manifest.artifacts, { relative = name, type = "file", durable = false })
    writeManifest(manifestPath, manifest)
    return filePath
  end

  function operation:path(name)
    if not validLeaf(name) then error("Ungültiger eigener Arbeitsdateiname.") end
    local filePath = LrPathUtils.child(root, name)
    if LrFileUtils.exists(filePath) then error("Eine vorhandene fremde Arbeitsdatei wird nicht überschrieben.") end
    return self:register(filePath)
  end

  function operation:helperCommand(helper, request, response, searchRoot)
    return helperCommand("run", id, capability, { "--helper=" .. helper, "--request=" .. request,
      "--response=" .. response, "--search-root=" .. searchRoot })
  end

  function operation:release()
    if released then return end
    released = true
    operations[id] = nil
    local ok, result = LrTasks.pcall(function()
      local latest = readManifest(manifestPath)
      latest.artifacts = Json.array(latest.artifacts)
      latest.helperPids = Json.array(latest.helperPids)
      latest.operations = 0
      latest.state = "closed"
      writeManifest(manifestPath, latest)
      return LrTasks.execute(helperCommand("cleanup", id, capability))
    end)
    if not ok or result ~= 0 then
      warning("Eigene Plug-in-Arbeitsdateien bleiben wegen einer sicheren Bereinigungsgrenze erhalten: " .. tostring(result))
    end
    if closing then closeAnchor() end
  end
  if closing then
    operation:release()
    error("Das Plug-in wurde während der Hilfsvorbereitung geschlossen.")
  end
  return operation
end

function TempSession.shutdown()
  closing = true
  -- LrTasks.execute is synchronous; the owning task releases its files only
  -- after its helper/export has completed. Reload is not proof of LR closure.
  local active = 0
  for _ in pairs(operations) do active = active + 1 end
  if active == 0 then LrTasks.startAsyncTask(closeAnchor) end
  return active
end

return TempSession
