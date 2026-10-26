local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"

local KeywordWriter = require "KeywordWriter"
local LocationTimeWriter = require "LocationTimeWriter"
local PluginState = require "PluginState"
local PhotoSelection = require "PhotoSelection"

local ACTIONS = {
  add = {
    question = "Orts- und Zeitstichwörter hinzufügen?",
    explanation = "Fehlende FN-Orts- und Zeitfelder sowie Stichwörter werden aus den Lightroom-Ortsfeldern, "
      .. "exportierbaren Ortsvorschlägen und der Aufnahmezeit ergänzt. Bereits gespeicherte FN-Werte bleiben erhalten. "
      .. "Mit „Aktualisieren“ werden vorhandene Werte mit den aktuellen Quelldaten abgeglichen.",
    button = "Hinzufügen",
    success = "Orts- und Zeitstichwörter hinzugefügt",
  },
  remove = {
    question = "Orts- und Zeitstichwörter entfernen?",
    explanation = "Nur die durch diese Plug-in-Funktion gespeicherten Orts- und Zeitstichwörter mit "
      .. "(FN Ort), (FN Ort)*, (FN Zeit) oder (FN Zeit)* sowie deren FN-Metadaten werden entfernt. "
      .. "Taxonomie- und manuelle Stichwörter bleiben erhalten.",
    button = "Entfernen",
    success = "Orts- und Zeitstichwörter entfernt",
  },
  update = {
    question = "Orts- und Zeitstichwörter aktualisieren?",
    explanation = "Bisher gespeicherte FN-Orts- und Zeitstichwörter werden durch die aktuellen "
      .. "Lightroom-Ortsfelder beziehungsweise exportierbaren Ortsvorschläge und die aktuelle "
      .. "Aufnahmezeit ersetzt.",
    button = "Aktualisieren",
    success = "Orts- und Zeitstichwörter aktualisiert",
  },
}

local function resultMessage(result, mode)
  local changedPhotoCount = tonumber(result and result.changedPhotoCount or 0) or 0
  local skippedPhotoCount = tonumber(result and result.skippedPhotoCount or 0) or 0
  local missingDataPhotoCount = tonumber(result and result.missingDataPhotoCount or 0) or 0
  local unresolvedSuggestedLocationPhotoCount = tonumber(
    result and result.unresolvedSuggestedLocationPhotoCount or 0
  ) or 0
  local failedSuggestedLocationPhotoCount = tonumber(
    result and result.failedSuggestedLocationPhotoCount or 0
  ) or 0
  local missingGpsAndLocationPhotoCount = tonumber(
    result and result.missingGpsAndLocationPhotoCount or 0
  ) or 0
  local missingTimePhotoCount = tonumber(result and result.missingTimePhotoCount or 0) or 0
  local removedKeywordCount = tonumber(result and result.removedKeywordCount or 0) or 0
  local captureDiagnostic = tostring(result and result.captureDiagnostic or "")
  local message = tostring(changedPhotoCount)
    .. (changedPhotoCount == 1 and " Foto wurde geändert." or " Fotos wurden geändert.")
  if mode == "remove" then
    message = message
      .. " "
      .. tostring(removedKeywordCount)
      .. (removedKeywordCount == 1
          and " verwaltete Stichwortzuordnung wurde entfernt."
        or " verwaltete Stichwortzuordnungen wurden entfernt.")
  end
  if skippedPhotoCount > 0 then
    message = message
      .. " "
      .. tostring(skippedPhotoCount)
      .. (skippedPhotoCount == 1 and " Foto blieb unverändert." or " Fotos blieben unverändert.")
  end
  if missingDataPhotoCount > 0 then
    message = message
      .. " Für "
      .. tostring(missingDataPhotoCount)
      .. (missingDataPhotoCount == 1
          and " Foto konnten keine Orts- oder Zeitstichwörter erstellt werden."
        or " Fotos konnten keine Orts- oder Zeitstichwörter erstellt werden.")
  end
  if unresolvedSuggestedLocationPhotoCount > 0 then
    message = message
      .. (unresolvedSuggestedLocationPhotoCount == 1
          and " Das Foto enthält GPS-Koordinaten, Lightroom lieferte dafür aber keine exportierbaren Ortsvorschläge."
        or " "
          .. tostring(unresolvedSuggestedLocationPhotoCount)
          .. " Fotos enthalten GPS-Koordinaten, Lightroom lieferte dafür aber keine exportierbaren Ortsvorschläge.")
      .. " Bitte in den Katalogeinstellungen prüfen, ob Adressvorschläge beim Export übernommen werden; private gespeicherte Orte werden von Lightroom ausgelassen."
  end
  if failedSuggestedLocationPhotoCount > 0 then
    message = message
      .. " Für " .. tostring(failedSuggestedLocationPhotoCount)
      .. (failedSuggestedLocationPhotoCount == 1 and " Foto konnten" or " Fotos konnten")
      .. " die Ortsvorschläge nicht exportiert oder gelesen werden. Zeitdaten wurden trotzdem geprüft."
  end
  if missingGpsAndLocationPhotoCount > 0 then
    message = message
      .. (missingGpsAndLocationPhotoCount == 1
          and " Das Foto hat weder gespeicherte Lightroom-Ortsfelder noch GPS-Daten."
        or " "
          .. tostring(missingGpsAndLocationPhotoCount)
          .. " Fotos haben weder gespeicherte Lightroom-Ortsfelder noch GPS-Daten.")
  end
  if missingTimePhotoCount > 0 then
    message = message
      .. " Für "
      .. tostring(missingTimePhotoCount)
      .. (missingTimePhotoCount == 1 and " Foto war" or " Fotos waren")
      .. " keine verwertbare Aufnahmezeit vorhanden."
  end
  if captureDiagnostic ~= "" then
    message = message .. "\n\nLesehinweis: " .. captureDiagnostic
  end
  return message
end

local LocationTimeMenu = {}

function LocationTimeMenu.runForPhotos(catalog, photos, mode)
  local action = ACTIONS[mode]
  if not action then
    error("Unbekannte Orts-/Zeitaktion: " .. tostring(mode))
  end
    photos = photos or {}
    if #photos == 0 then
      LrDialogs.message(
        "Keine Fotos ausgewählt",
        "Bitte mindestens ein Foto auswählen.",
        "info"
      )
      return
    end
    local choice = LrDialogs.confirm(
      action.question,
      action.explanation
        .. " Die Aktion betrifft "
        .. tostring(#photos)
        .. (#photos == 1 and " ausgewähltes Foto." or " ausgewählte Fotos."),
      action.button,
      "Abbrechen"
    )
    if choice ~= "ok" then
      return
    end
    -- Entfernen braucht keine GPS-/Zeitlesung oder Exportvorschläge, auch
    -- dann nicht, wenn nach einer früheren Rücknahme nur Stichwörter bleiben.
    local plans, preparation = {}, nil
    if mode ~= "remove" then
      plans, preparation = LocationTimeWriter.prepare(catalog, photos, {
        resolveSuggestedLocations = true,
        preserveExisting = mode == "add",
      })
    end
    if preparation and preparation.canceled then
      LrDialogs.message(
        "Orts- und Zeitstichwörter abgebrochen",
        "Die Übernahme der Lightroom-Ortsvorschläge wurde abgebrochen. Es wurden keine Plug-in-Metadaten oder Stichwörter geändert.",
        "info"
      )
      return
    end
    local ok, result = LrTasks.pcall(
      LocationTimeWriter.execute,
      catalog,
      photos,
      mode,
      { protectedNamesForPhoto = KeywordWriter.taxonomyKeywordNameSet },
      plans
    )
    if not ok then
      LrDialogs.message(
        "Orts- und Zeitstichwörter konnten nicht verarbeitet werden",
        tostring(result),
        "warning"
      )
      return nil, tostring(result)
    end
    result.suggestedLocationPhotoCount = preparation and preparation.suggestedLocationPhotoCount or 0
    result.unresolvedSuggestedLocationPhotoCount = preparation
      and preparation.unresolvedSuggestedLocationPhotoCount or 0
    result.failedSuggestedLocationPhotoCount = preparation
      and preparation.failedSuggestedLocationPhotoCount or 0
    LrDialogs.message(action.success, resultMessage(result, mode), "info")
    return result
end

function LocationTimeMenu.run(mode)
  LrTasks.startAsyncTask(function()
    local catalog = LrApplication.activeCatalog()
    local photos = mode == "remove" and PluginState.selectedPhotos(catalog)
      or PhotoSelection.selectedWithCollapsedFolderStacks(catalog)
    local ok, result = LrTasks.pcall(LocationTimeMenu.runForPhotos, catalog, photos, mode)
    if not ok then
      LrDialogs.message("Orts- und Zeitstichwörter konnten nicht verarbeitet werden", tostring(result), "warning")
    end
  end)
end

return LocationTimeMenu
