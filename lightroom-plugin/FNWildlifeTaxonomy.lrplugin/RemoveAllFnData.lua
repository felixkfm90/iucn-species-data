local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"

local KeywordWriter = require "KeywordWriter"

local function photoLabel(count)
  return tostring(count) .. (count == 1 and " Foto" or " Fotos")
end

LrTasks.startAsyncTask(function()
  local catalog = LrApplication.activeCatalog()
  local photos = catalog:getTargetPhotos()
  if #photos == 0 then
    LrDialogs.message(
      "Keine Fotos ausgewählt",
      "Bitte mindestens ein Foto auswählen.",
      "info"
    )
    return
  end

  local choice = LrDialogs.confirm(
    "Alle FN-Daten entfernen?",
    "Von " .. photoLabel(#photos) .. " werden alle eindeutig verwalteten FN-Daten entfernt:\n\n"
      .. "• Taxonomie und Art-Favorit\n"
      .. "• Orts- und Zeitdaten\n"
      .. "• Stichwörter mit (FN), (FN)*, (FN Ort), (FN Ort)*, (FN Zeit) oder (FN Zeit)*\n\n"
      .. "Andere Lightroom-Metadaten und manuelle Stichwörter bleiben erhalten.",
    "Alle FN-Daten entfernen",
    "Abbrechen"
  )
  if choice ~= "ok" then
    return
  end

  local ok, result = LrTasks.pcall(KeywordWriter.removeAll, catalog, photos)
  if not ok then
    LrDialogs.message(
      "FN-Daten konnten nicht entfernt werden",
      tostring(result),
      "warning"
    )
    return
  end

  LrDialogs.message(
    "FN-Daten entfernt",
    (result.photoCount == 1
        and "Das ausgewählte Foto wurde verarbeitet.\n\n"
      or "Die ausgewählten " .. photoLabel(result.photoCount) .. " wurden verarbeitet.\n\n")
      .. tostring(result.assignmentCount) .. " Taxonomiezuordnung(en), "
      .. tostring(result.referenceImageCount) .. " Art-Favorit(en), "
      .. tostring(result.taxonomyKeywordCount) .. " Taxonomiestichwortzuordnung(en) und "
      .. tostring(result.locationTimeKeywordCount) .. " Orts-/Zeitstichwortzuordnung(en) wurden entfernt.",
    "info"
  )
end)
