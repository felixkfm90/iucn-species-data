local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrFileUtils = import "LrFileUtils"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local ExportFile = {}
local lastDirectory = nil

local function validatedFileName(value, fileType)
  local name = string.match(tostring(value or ""), "^%s*(.-)%s*$") or ""
  if name == "" or #name > 255 or string.find(name, '[%c/\\:*?"<>|]')
    or string.match(name, "[%. ]$") then
    return nil
  end
  local deviceName = string.upper(string.match(string.match(name, "^[^%.]+") or name, "^%s*(.-)%s*$"))
  if deviceName == "CON" or deviceName == "PRN" or deviceName == "AUX" or deviceName == "NUL"
    or string.match(deviceName, "^COM%d$") or string.match(deviceName, "^LPT%d$") then
    return nil
  end
  local extension = string.match(name, "%.([^%.]+)$")
  if not extension then
    local withExtension = name .. "." .. fileType
    return #withExtension <= 255 and withExtension or nil
  end
  return string.lower(extension) == fileType and name or nil
end

function ExportFile.choosePath(title, fileType, fileName, scopeText)
  return LrFunctionContext.callWithContext("FN Wildlife Exportdatei", function(context)
    local factory = LrView.osFactory()
    local props = LrBinding.makePropertyTable(context)
    props.fileName = fileName
    props.directory = lastDirectory or LrPathUtils.getStandardFilePath("documents")
    while true do
      local result = LrDialogs.presentModalDialog({
        title = title,
        actionVerb = "Speichern",
        cancelVerb = "Abbrechen",
        otherVerb = "Zielordner wählen ...",
        contents = factory:column({
          bind_to_object = props,
          margin = factory:dialog_spacing(),
          spacing = factory:control_spacing(),
          factory:static_text({ title = scopeText or "Gesamter Katalog · persistenter Index" }),
          factory:static_text({ title = "Dateiname:" }),
          factory:edit_field({ value = LrView.bind("fileName"), width_in_chars = 52 }),
          factory:static_text({ title = "Zielordner:" }),
          factory:static_text({ title = LrView.bind("directory"), width_in_chars = 72 }),
        }),
      })
      if result == "other" then
        local directories = LrDialogs.runOpenPanel({
          title = "Zielordner für Export wählen",
          prompt = "Auswählen",
          canChooseFiles = false,
          canChooseDirectories = true,
          canCreateDirectories = true,
          allowsMultipleSelection = false,
          initialDirectory = props.directory,
        })
        if directories and directories[1] then
          props.directory = directories[1]
        end
      elseif result ~= "ok" then
        return nil
      else
        local name = validatedFileName(props.fileName, fileType)
        if not name then
          LrDialogs.message(
            "Dateiname prüfen",
            "Bitte einen Dateinamen ohne Pfadangaben oder Sonderzeichen und mit der Endung ."
              .. fileType .. " angeben.",
            "warning"
          )
        elseif LrFileUtils.exists(props.directory) ~= "directory" then
          LrDialogs.message("Zielordner prüfen", "Bitte einen vorhandenen Zielordner wählen.", "warning")
        else
          local path = LrPathUtils.child(props.directory, name)
          local existing = LrFileUtils.exists(path)
          if existing == "directory" then
            LrDialogs.message("Dateiname prüfen", "Unter diesem Namen besteht bereits ein Ordner.", "warning")
          elseif not existing or LrDialogs.confirm(
            "Vorhandene Exportdatei ersetzen?",
            path,
            "Ersetzen",
            "Abbrechen"
          ) == "ok" then
            lastDirectory = props.directory
            return path, existing == "file"
          else
            return nil
          end
        end
      end
    end
  end)
end

local function removeTemporaryFile(path)
  if LrFileUtils.exists(path) == "file" then
    local ok, removed = LrTasks.pcall(function() return LrFileUtils.delete(path) end)
    if not ok or not removed then
      return "\nTemporäre Datei erhalten: " .. path
    end
  end
  return ""
end

local function moveFile(source, destination)
  local ok, moved, reason = LrTasks.pcall(function()
    return LrFileUtils.move(source, destination)
  end)
  return ok and moved, ok and reason or moved
end

function ExportFile.write(path, kind, writer, replaceExisting)
  local temporaryPath = LrFileUtils.chooseUniqueFileName(path .. ".fn-export.tmp")
  local file, openError = io.open(temporaryPath, "wb")
  if not file then
    error(kind .. " konnte nicht geöffnet werden: " .. tostring(openError), 0)
  end
  local checkedFile = {}
  function checkedFile:write(...)
    local written, writeError = file:write(...)
    if not written then
      error(kind .. " konnte nicht vollständig gespeichert werden: " .. tostring(writeError), 0)
    end
  end
  local ok, writeError = LrTasks.pcall(function()
    checkedFile:write(string.char(239, 187, 191))
    writer(checkedFile)
  end)
  local closeOk, closed, closeError = LrTasks.pcall(function() return file:close() end)
  if not ok then
    error(tostring(writeError) .. removeTemporaryFile(temporaryPath), 0)
  end
  if not closeOk or not closed then
    error(kind .. " konnte nicht abgeschlossen werden: " .. tostring(closeOk and closeError or closed)
      .. removeTemporaryFile(temporaryPath), 0)
  end

  local existing = LrFileUtils.exists(path)
  if existing and (existing ~= "file" or not replaceExisting) then
    error("Das Exportziel hat sich geändert. Bitte den Export erneut bestätigen."
      .. removeTemporaryFile(temporaryPath), 0)
  end
  local backupPath = nil
  if existing == "file" then
    backupPath = LrFileUtils.chooseUniqueFileName(path .. ".fn-export-backup")
    local backedUp, backupError = moveFile(path, backupPath)
    if not backedUp then
      error("Die bisherige Exportdatei konnte nicht gesichert werden: " .. tostring(backupError)
        .. removeTemporaryFile(temporaryPath), 0)
    end
  end
  local published, publishError = moveFile(temporaryPath, path)
  if not published then
    local recovery = ""
    if backupPath then
      local restored = moveFile(backupPath, path)
      if not restored then
        recovery = "\nDie bisherige Exportdatei bleibt in dieser Sicherung erhalten: " .. backupPath
      end
    end
    error("Die neue Exportdatei konnte nicht übernommen werden: " .. tostring(publishError)
      .. recovery .. removeTemporaryFile(temporaryPath), 0)
  end
  if backupPath then
    local okRemoved, removed = LrTasks.pcall(function() return LrFileUtils.delete(backupPath) end)
    if not okRemoved or not removed then
      return backupPath
    end
  end
  return nil
end

return ExportFile
