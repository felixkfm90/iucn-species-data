local LrFileUtils = import "LrFileUtils"
local LrJson = import "LrJson"
local LrPathUtils = import "LrPathUtils"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrUUID = import "LrUUID"

local TaxonomyHelper = {}

local function quoteArgument(value)
  local text = tostring(value or "")
  return '"' .. string.gsub(text, '"', '\\"') .. '"'
end

local function defaultHelperPath()
  local pluginParent = LrPathUtils.parent(_PLUGIN.path)
  local repositoryRoot = LrPathUtils.parent(pluginParent)
  return LrPathUtils.child(
    repositoryRoot,
    "species-explorer/lightroom-search-helper.mjs"
  )
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

local function responseError(response)
  if type(response) ~= "table" then
    return "Die lokale Taxonomie-Suchhilfe lieferte keine gültige Antwort."
  end
  if type(response.error) == "table" and response.error.message then
    return tostring(response.error.message)
  end
  return "Die lokale Taxonomie-Suchhilfe meldete einen unbekannten Fehler."
end

function TaxonomyHelper.request(payload)
  local prefs = LrPrefs.prefsForPlugin()
  local nodePath = prefs.nodePath or "node.exe"
  local helperPath = prefs.helperPath or defaultHelperPath()
  if not LrFileUtils.exists(helperPath) then
    error(
      "Die lokale Taxonomie-Suchhilfe wurde nicht gefunden: " .. helperPath
    )
  end

  local tempRoot = LrPathUtils.getStandardFilePath("temp")
  local requestId = LrUUID.generateUUID()
  local requestPath = LrPathUtils.child(
    tempRoot,
    "fn-wildlife-taxonomy-request-" .. requestId .. ".json"
  )
  local responsePath = LrPathUtils.child(
    tempRoot,
    "fn-wildlife-taxonomy-response-" .. requestId .. ".json"
  )
  payload.requestId = requestId

  local function executeRequest()
    local encoded = LrJson.encode(payload)
    local written, writeError = LrFileUtils.writeFile(requestPath, encoded)
    if not written then
      error("Die Suchanfrage konnte nicht geschrieben werden: " .. tostring(writeError))
    end

    local command = table.concat({
      quoteArgument(nodePath),
      "--no-warnings",
      quoteArgument(helperPath),
      quoteArgument("--request=" .. requestPath),
      quoteArgument("--response=" .. responsePath),
    }, " ")
    if prefs.searchRoot and prefs.searchRoot ~= "" then
      command = command .. " " .. quoteArgument("--search-root=" .. prefs.searchRoot)
    end

    local exitCode = LrTasks.execute(command)
    if exitCode ~= 0 then
      error(
        "Die lokale Taxonomie-Suchhilfe konnte nicht gestartet werden. "
          .. "Bitte Node.js und das Lightroom-Suchpaket prüfen."
      )
    end

    local responseText = LrFileUtils.readFile(responsePath)
    if not responseText or responseText == "" then
      error("Die lokale Taxonomie-Suchhilfe hat keine Antwort gespeichert.")
    end

    local decodedOk, response = pcall(LrJson.decode, responseText)
    if not decodedOk then
      error("Die Antwort der Taxonomie-Suchhilfe ist kein gültiges JSON.")
    end
    if not response.ok then
      error(responseError(response))
    end
    return response.result
  end

  local ok, result = pcall(executeRequest)
  removeFile(requestPath)
  removeFile(responsePath)
  if not ok then
    error(result)
  end
  return result
end

return TaxonomyHelper
