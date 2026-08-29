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
      .. (#photos == 1 and " ausgewähltem Foto" or " ausgewählten Fotos")
      .. " entfernt. Plug-in-Metadaten und ausschließlich die vom Plug-in "
      .. "verwalteten Taxonomie-Stichwörter werden entfernt. Andere Lightroom-Stichwörter und "
      .. "die Bilddateien bleiben unverändert.",
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
    "Von "
      .. tostring(result.photoCount)
      .. (result.photoCount == 1 and " Foto" or " Fotos")
      .. " wurde die Taxonomie entfernt.",
    "info"
  )
end)
