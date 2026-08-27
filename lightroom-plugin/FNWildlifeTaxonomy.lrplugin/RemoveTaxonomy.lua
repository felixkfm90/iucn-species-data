local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"

local KeywordWriter = require "KeywordWriter"

LrTasks.startAsyncTask(function()
  local catalog = LrApplication.activeCatalog()
  local photos = catalog:getTargetPhotos() or {}
  if #photos == 0 then
    LrDialogs.message(
      "Keine Fotos ausgewählt",
      "Bitte mindestens ein Foto auswählen, dessen FN-Wildlife-Taxonomie entfernt werden soll.",
      "info"
    )
    return
  end

  local choice = LrDialogs.confirm(
    "Taxonomie entfernen?",
    "Die FN-Wildlife-Taxonomie wird von "
      .. tostring(#photos)
      .. " ausgewählten Foto(s) entfernt. Dabei werden die Plug-in-Metadaten und alle diesen Fotos "
      .. "zugeordneten Stichwörter mit der Endung „(FN)“ entfernt. Lightroom-Stichwörter ohne diese "
      .. "Kennzeichnung und die Bilddateien bleiben unverändert.",
    "Taxonomie entfernen",
    "Abbrechen"
  )
  if choice ~= "ok" then
    return
  end

  local ok, result = LrTasks.pcall(KeywordWriter.remove, catalog, photos)
  if not ok then
    LrDialogs.message("Taxonomie konnte nicht entfernt werden", tostring(result), "warning")
    return
  end

  LrDialogs.message(
    "Taxonomie entfernt",
    tostring(result.assignmentCount)
      .. " Taxonomiezuordnung(en) und "
      .. tostring(result.keywordCount)
      .. " mit „(FN)“ gekennzeichnete Stichwortzuordnung(en) wurden entfernt. "
      .. "Andere Lightroom-Stichwörter blieben erhalten.",
    "info"
  )
end)
