local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrUUID = import "LrUUID"

local Json = require "Json"

local TaxonomyHelper = {}

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

local function quoteArgument(value)
  local text = tostring(value or "")
  return '"' .. string.gsub(text, '"', '\\"') .. '"'
end

local function defaultSearchRoot(tempRoot)
  local localAppData = cleanText(tempRoot) ~= "" and LrPathUtils.parent(tempRoot) or ""
  if localAppData == "" then
    return ""
  end
  return LrPathUtils.child(
    localAppData,
    "FN Wildlife Travel/Arten-Explorer/lightroom"
  )
end

local function resolveCommandProcessor(tempRoot)
  local systemDrive = string.match(cleanText(tempRoot), "^([A-Za-z]:)") or "C:"
  local candidate = systemDrive .. "\\Windows\\System32\\cmd.exe"
  if LrFileUtils.exists(candidate) then
    return candidate
  end
  return "cmd.exe"
end

local function defaultHelperPath()
  local pluginParent = LrPathUtils.parent(_PLUGIN.path)
  local repositoryRoot = LrPathUtils.parent(pluginParent)
  return LrPathUtils.child(
    repositoryRoot,
    "species-explorer/lightroom-search-helper.mjs"
  )
end

local function defaultCorrectionHelperPath()
  local pluginParent = LrPathUtils.parent(_PLUGIN.path)
  local repositoryRoot = LrPathUtils.parent(pluginParent)
  return LrPathUtils.child(
    repositoryRoot,
    "species-explorer/lightroom-correction-helper.mjs"
  )
end

local function resolveNodePath(configuredPath)
  local configured = cleanText(configuredPath)
  if configured ~= "" then
    if LrFileUtils.exists(configured) then
      return configured
    end
    return configured
  end

  -- Lightroom stellt in seiner eingebetteten Lua-Laufzeit weder
  -- os.getenv noch einen verlässlichen Prozess-PATH bereit. Der Temp-Pfad
  -- liefert uns dagegen Laufwerk und lokales AppData ohne Shell-Aufruf.
  local tempRoot = cleanText(LrPathUtils.getStandardFilePath("temp"))
  local localAppData = tempRoot ~= "" and LrPathUtils.parent(tempRoot) or ""
  local systemDrive = string.match(tempRoot, "^([A-Za-z]:)") or "C:"
  local candidates = {
    systemDrive .. "\\Program Files\\nodejs\\node.exe",
    systemDrive .. "\\Program Files (x86)\\nodejs\\node.exe",
  }
  if localAppData ~= "" then
    table.insert(candidates, LrPathUtils.child(localAppData, "Programs/nodejs/node.exe"))
  end

  for _, candidate in ipairs(candidates) do
    if LrFileUtils.exists(candidate) then
      return candidate
    end
  end
  return "node.exe"
end

local function removeFile(path)
  if path then
    pcall(function()
      if LrFileUtils.exists(path) then
        LrFileUtils.delete(path)
      end
    end)
  end
end

local function writeTextFile(path, content)
  local file, openError = io.open(path, "wb")
  if not file then
    return nil, openError
  end

  local written, writeError = file:write(content)
  local closed, closeError = file:close()
  if not written then
    return nil, writeError
  end
  if not closed then
    return nil, closeError
  end
  return true
end

local function readTextFile(path)
  local file, openError = io.open(path, "rb")
  if not file then
    return nil, openError
  end

  local content, readError = file:read("*a")
  local closed, closeError = file:close()
  if content == nil then
    return nil, readError
  end
  if not closed then
    return nil, closeError
  end
  return content
end

local function responseError(response)
  if type(response) ~= "table" then
    return "Die lokale Taxonomie-Suchhilfe lieferte keine gültige Antwort."
  end
  if type(response.error) == "table" and response.error.message then
    return tostring(response.error.message)
  end
  return "Die lokale Taxonomie-Suchhilfe meldete einen unbekannten Fehler."
end

function TaxonomyHelper.searchRoot()
  local prefs = LrPrefs.prefsForPlugin()
  local configured = cleanText(prefs.searchRoot)
  if configured ~= "" then
    return configured
  end
  return defaultSearchRoot(LrPathUtils.getStandardFilePath("temp"))
end

function TaxonomyHelper.searchPackageStatus()
  local root = TaxonomyHelper.searchRoot()
  local activeRoot = root ~= "" and LrPathUtils.child(root, "active") or ""
  local databasePath = activeRoot ~= ""
      and LrPathUtils.child(activeRoot, "taxonomy-search.sqlite")
    or ""
  local manifestPath = activeRoot ~= "" and LrPathUtils.child(activeRoot, "manifest.json") or ""
  local status = {
    root = root,
    databasePath = databasePath,
    manifestPath = manifestPath,
    available = databasePath ~= "" and LrFileUtils.exists(databasePath) == "file",
    taxonCount = 0,
    packageId = "",
    masterVersion = "",
    correctionRevision = "",
  }
  if manifestPath ~= "" and LrFileUtils.exists(manifestPath) == "file" then
    local content = readTextFile(manifestPath)
    if content then
      local ok, manifest = pcall(Json.decode, content)
      if ok and type(manifest) == "table" then
        status.taxonCount = tonumber(manifest.taxonCount or 0) or 0
        status.packageId = cleanText(manifest.packageId)
        status.masterVersion = cleanText(manifest.masterVersion)
      end
    end
  end
  local correctionPointerPath = root ~= ""
      and LrPathUtils.child(LrPathUtils.parent(root), "corrections/active.json")
    or ""
  if correctionPointerPath ~= "" and LrFileUtils.exists(correctionPointerPath) == "file" then
    local content = readTextFile(correctionPointerPath)
    if content then
      local ok, pointer = pcall(Json.decode, content)
      if ok and type(pointer) == "table"
          and cleanText(pointer.basePackageId) == status.packageId
          and cleanText(pointer.baseMasterVersion) == status.masterVersion then
        status.correctionRevision = cleanText(pointer.revision)
      end
    end
  end
  return status
end

local function executeHelperRequest(payload, options)
  options = options or {}
  local prefs = LrPrefs.prefsForPlugin()
  local nodePath = resolveNodePath(prefs.nodePath)
  local helperPath = options.helperPath or prefs.helperPath or defaultHelperPath()
  local helperLabel = options.helperLabel or "Taxonomie-Suchhilfe"
  if not LrFileUtils.exists(helperPath) then
    error(
      "Die lokale " .. helperLabel .. " wurde nicht gefunden: " .. helperPath
    )
  end

  local tempRoot = LrPathUtils.getStandardFilePath("temp")
  local searchRoot = TaxonomyHelper.searchRoot()
  if searchRoot == "" then
    error("Der lokale Speicherort des Lightroom-Suchpakets konnte nicht ermittelt werden.")
  end
  local requestId = LrUUID.generateUUID()
  local requestPath = LrPathUtils.child(
    tempRoot,
    "fn-wildlife-taxonomy-request-" .. requestId .. ".json"
  )
  local responsePath = LrPathUtils.child(
    tempRoot,
    "fn-wildlife-taxonomy-response-" .. requestId .. ".json"
  )
  local commandPath = LrPathUtils.child(
    tempRoot,
    "fn-wildlife-taxonomy-command-" .. requestId .. ".cmd"
  )
  local logPath = LrPathUtils.child(
    tempRoot,
    "fn-wildlife-taxonomy-command-" .. requestId .. ".log"
  )
  payload.requestId = requestId

  local function executeRequest()
    local encoded = Json.encode(payload)
    local written, writeError = writeTextFile(requestPath, encoded)
    if not written then
      error("Die Anfrage konnte nicht geschrieben werden: " .. tostring(writeError))
    end

    local helperCommand = table.concat({
      quoteArgument(nodePath),
      "--no-warnings",
      quoteArgument(helperPath),
      quoteArgument("--request=" .. requestPath),
      quoteArgument("--response=" .. responsePath),
      quoteArgument("--search-root=" .. searchRoot),
    }, " ")
    local commandWritten, commandWriteError = writeTextFile(
      commandPath,
      "@echo off\r\n"
        .. helperCommand
        .. " > "
        .. quoteArgument(logPath)
        .. " 2>&1\r\nexit /b %ERRORLEVEL%\r\n"
    )
    if not commandWritten then
      error(
        "Der Startbefehl der " .. helperLabel .. " konnte nicht geschrieben werden: "
          .. tostring(commandWriteError)
      )
    end

    local command = resolveCommandProcessor(tempRoot)
      .. " /d /c "
      .. quoteArgument(commandPath)
    local exitCode = LrTasks.execute(command)
    if exitCode ~= 0 then
      local diagnosticText = readTextFile(logPath)
      local diagnostic = cleanText(diagnosticText)
      if string.len(diagnostic) > 1200 then
        diagnostic = string.sub(diagnostic, -1200)
      end
      local detail = diagnostic ~= ""
          and (" Technische Meldung: " .. diagnostic)
        or ""
      error(
        "Die lokale " .. helperLabel .. " konnte nicht gestartet werden. "
          .. "Verwendeter Node-Pfad: "
          .. nodePath
          .. ". Suchpaket: "
          .. searchRoot
          .. "."
          .. detail
      )
    end

    local responseText, readError = readTextFile(responsePath)
    if not responseText then
      error("Die Antwort der " .. helperLabel .. " konnte nicht gelesen werden: " .. tostring(readError))
    end
    if not responseText or responseText == "" then
      error("Die lokale " .. helperLabel .. " hat keine Antwort gespeichert.")
    end

    local decodedOk, response = pcall(Json.decode, responseText)
    if not decodedOk then
      error("Die Antwort der " .. helperLabel .. " ist kein gültiges JSON.")
    end
    if not response.ok then
      error(responseError(response))
    end
    return response.result
  end

  local ok, result = LrTasks.pcall(executeRequest)
  removeFile(requestPath)
  removeFile(responsePath)
  removeFile(commandPath)
  removeFile(logPath)
  if not ok then
    error(result)
  end
  return result
end

function TaxonomyHelper.request(payload)
  return executeHelperRequest(payload, {
    helperPath = LrPrefs.prefsForPlugin().helperPath or defaultHelperPath(),
    helperLabel = "Taxonomie-Suchhilfe",
  })
end

function TaxonomyHelper.openCorrection(masterTaxonId)
  return executeHelperRequest({
    masterTaxonId = cleanText(masterTaxonId),
  }, {
    helperPath = defaultCorrectionHelperPath(),
    helperLabel = "Korrekturübergabe",
  })
end

return TaxonomyHelper
