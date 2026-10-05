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

local function sameStoragePath(left, right)
  if type(left) ~= "string" or type(right) ~= "string" or left == "" or right == "" then return false end
  local function normalize(value)
    local text = value:gsub("\\", "/"):gsub("/+$", "")
    if text:match("^%a:/") or text:sub(1, 2) == "//" then return text:lower() end
    return text
  end
  return normalize(left) == normalize(right)
end

local function legacySearchRoot(tempRoot)
  local localAppData = cleanText(tempRoot) ~= "" and LrPathUtils.parent(tempRoot) or ""
  if localAppData == "" then
    return ""
  end
  return LrPathUtils.child(
    localAppData,
    "FN Wildlife Travel/Arten-Explorer/lightroom"
  )
end

local function storageConfiguration()
  local repositoryRoot = LrPathUtils.parent(LrPathUtils.parent(_PLUGIN.path))
  local file = io.open(LrPathUtils.child(repositoryRoot, "storage-path.json"), "rb")
  if not file then return nil, repositoryRoot end
  local body = file:read("*a")
  file:close()
  local ok, value = pcall(Json.decode, body)
  if not ok or type(value) ~= "table" or value.schemaVersion ~= 1 or value.state ~= "ready"
    or type(value.dataRoot) ~= "string" or value.dataRoot == "" then
    error("Speicherkonfiguration ungültig. Bitte den Speicherwechsel im Arten-Explorer prüfen.")
  end
  local dataRoot = value.dataRoot
  if dataRoot == "Daten" then dataRoot = LrPathUtils.child(repositoryRoot, "Daten")
  elseif not dataRoot:match("^%a:[/\\]") and not dataRoot:match("^[/\\][/\\]") and not dataRoot:match("^/") then
    error("Der gemeinsame Datenpfad muss absolut sein.")
  end
  if not LrFileUtils.exists(dataRoot) then error("Der bestätigte Datenordner fehlt: " .. dataRoot) end
  if value.legacyDataRoot or value.previousRepoRoot or value.migrationRevision then
    local journalFile = io.open(LrPathUtils.child(dataRoot, ".storage-migration.json"), "rb")
    if not journalFile then error("Der Nachweis des Datenumzugs fehlt.") end
    local journalBody = journalFile:read("*a")
    journalFile:close()
    local journalOk, journal = pcall(Json.decode, journalBody)
    if not journalOk or type(journal) ~= "table" or journal.schemaVersion ~= 1 or journal.state ~= "committed"
      or type(journal.plan) ~= "table" or journal.plan.revision ~= value.migrationRevision
      or not sameStoragePath(journal.plan.sourceRoot, value.legacyDataRoot)
      or not sameStoragePath(journal.plan.repoRoot, value.previousRepoRoot)
      or type(journal.copied) ~= "table" or type(journal.plan.files) ~= "table" or #journal.copied ~= #journal.plan.files then
      error("Der Datenumzug ist unvollständig oder sein Nachweis wurde verändert.")
    end
  end
  return { dataRoot = dataRoot, legacyDataRoot = value.legacyDataRoot }, repositoryRoot
end

local function defaultSearchRoot(tempRoot)
  local config, repositoryRoot = storageConfiguration()
  if config then return LrPathUtils.child(config.dataRoot, "lightroom") end
  local legacy = legacySearchRoot(tempRoot)
  if legacy ~= "" and LrFileUtils.exists(LrPathUtils.parent(legacy)) then return legacy end
  return LrPathUtils.child(repositoryRoot, "Daten/lightroom")
end

local function normalizedStoragePath(value)
  local text = cleanText(value):gsub("\\", "/"):lower():gsub("/+$", "")
  local config = storageConfiguration()
  if config and config.legacyDataRoot then
    local legacy = cleanText(config.legacyDataRoot):gsub("\\", "/"):lower():gsub("/+$", "")
    if text == legacy or text:sub(1, #legacy + 1) == legacy .. "/" then
      text = cleanText(config.dataRoot):gsub("\\", "/"):lower():gsub("/+$", "") .. text:sub(#legacy + 1)
    end
  end
  return text
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
    local config = storageConfiguration()
    if config and config.legacyDataRoot and normalizedStoragePath(configured)
      == normalizedStoragePath(LrPathUtils.child(config.dataRoot, "lightroom")) then
      return LrPathUtils.child(config.dataRoot, "lightroom")
    end
    return configured
  end
  return defaultSearchRoot(LrPathUtils.getStandardFilePath("temp"))
end

function TaxonomyHelper.searchPackageStatus()
  local root = TaxonomyHelper.searchRoot()
  local activeRoot = root ~= "" and LrPathUtils.child(root, "active") or ""
  local pair = nil
  local publicationPath = root ~= ""
    and LrPathUtils.child(LrPathUtils.parent(root), "taxonomy-publication/active.json") or ""
  if publicationPath ~= "" and LrFileUtils.exists(publicationPath) == "file" then
    local content = readTextFile(publicationPath)
    local ok, publication = pcall(Json.decode, content or "")
    local function samePath(left, right)
      return normalizedStoragePath(left) == normalizedStoragePath(right)
    end
    if not ok or type(publication) ~= "table" or publication.schemaVersion ~= 1 then
      activeRoot = "" -- Fail closed instead of reporting a stale legacy package as active.
    elseif samePath(publication.searchRoot, root) then
      pair = publication.active
      if type(pair) ~= "table" or not tostring(pair.id or ""):match("^publication%-%x+%-%x+%-%x+%-%x+%-%x+$") then
        activeRoot = ""
        pair = nil
      elseif not pair.legacy then
        activeRoot = LrPathUtils.child(root, "releases/" .. pair.id)
      end
    end
  end
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
  if pair and (pair.packageId ~= status.packageId or pair.masterVersion ~= status.masterVersion) then
    status.available = false
  end
  if pair and type(pair.correctionPointer) == "table"
    and pair.correctionPointer.basePackageId == status.packageId
    and pair.correctionPointer.baseMasterVersion == status.masterVersion then
    status.correctionRevision = cleanText(pair.correctionPointer.revision)
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

  local searchRoot = TaxonomyHelper.searchRoot()
  if searchRoot == "" then
    error("Der lokale Speicherort des Lightroom-Suchpakets konnte nicht ermittelt werden.")
  end
  local operation = require("TempSession").begin("Taxonomie-Hilfsanfrage")
  local requestId = LrUUID.generateUUID()
  local requestPath = operation:path("fn-wildlife-taxonomy-request-" .. requestId .. ".json")
  local responsePath = operation:path("fn-wildlife-taxonomy-response-" .. requestId .. ".json")
  local commandPath = operation:path("fn-wildlife-taxonomy-command-" .. requestId .. ".cmd")
  local logPath = operation:path("fn-wildlife-taxonomy-command-" .. requestId .. ".log")
  payload.requestId = requestId

  local function executeRequest()
    local encoded = Json.encode(payload)
    local written, writeError = writeTextFile(requestPath, encoded)
    if not written then
      error("Die Anfrage konnte nicht geschrieben werden: " .. tostring(writeError))
    end

    local helperCommand = operation:helperCommand(helperPath, requestPath, responsePath, searchRoot)
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

    -- Windows runtime discovery remains based on the SDK's system temp drive,
    -- never the D: plug-in scratch location.
    local command = TaxonomyHelper.runtimeCommandProcessor()
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
  operation:release()
  if not ok then
    error(result)
  end
  return result
end

function TaxonomyHelper.runtimeNodePath()
  return resolveNodePath(LrPrefs.prefsForPlugin().nodePath)
end

function TaxonomyHelper.runtimeCommandProcessor()
  return resolveCommandProcessor(LrPathUtils.getStandardFilePath("temp"))
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

function TaxonomyHelper.namePreference(payload)
  local repositoryRoot = LrPathUtils.parent(LrPathUtils.parent(_PLUGIN.path))
  return executeHelperRequest(payload, {
    helperPath = LrPathUtils.child(repositoryRoot, "species-explorer/lightroom-name-preference-helper.mjs"),
    helperLabel = "Namenswahl",
  })
end

return TaxonomyHelper
