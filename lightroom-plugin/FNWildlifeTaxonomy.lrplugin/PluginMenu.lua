local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local ACTION_WIDTH = 330
-- Der native Windows-Button zeichnet seinen sichtbaren Rahmen innerhalb der
-- Layoutfläche. Den Erklärungstext an dieser Rahmenkante beginnen lassen.
local CAPTION_INSET = 3

local ACTIONS = {
  assign = { title = "Taxonomie zuweisen", script = "AssignTaxonomy.lua",
    summary = "Art suchen und markierten Fotos zuweisen.",
    tooltip = "Öffnet das Zuweisungsfenster. Eine ausgewählte Art wird den aktuell markierten Fotos zugewiesen; andere vorhandene Taxonomien werden nicht still ersetzt." },
  favorite = { title = "Art-Favorit festlegen", script = "SetReferenceImage.lua",
    summary = "Ein Foto als Favorit dieser Art festlegen.",
    tooltip = "Legt das ausgewählte taxonomierte Foto als Art-Favorit fest. Ein vorhandener Favorit derselben Art wird nur nach Rückfrage ersetzt; dies ist nicht die Lightroom-Sternebewertung." },
  locationTime = { title = "Ort und Zeit", menu = "locationTime",
    summary = "Angaben der markierten Fotos verwalten.",
    tooltip = "Öffnet Hinzufügen, Aktualisieren und Entfernen für FN-Ort/Zeit der markierten Fotos. Das Öffnen selbst ändert keine Daten und startet keinen Kataloglauf." },
  statistics = { title = "Statistik und Exporte", script = "ShowStatistics.lua",
    summary = "Lifelist, Statistik und Fotoauswahl-Exporte.",
    tooltip = "Zeigt den gespeicherten Statistikindex und bietet Artenliste, Lifelist und Beobachtungsliste für Katalog oder markierte Fotos. Statistik neu aufbauen erfolgt nur auf ausdrücklichen Klick." },
  catalogUpdate = { title = "FN-Daten aktualisieren", script = "UpdateCatalogFnData.lua",
    summary = "FN-Daten im gesamten Katalog prüfen.",
    tooltip = "Prüft den gesamten Lightroom-Katalog und aktualisiert nach Vorschau und Bestätigung vorhandene FN-Taxonomie sowie FN-Ort/Zeit nach dem aktuellen Suchpaket. Kein Download oder Aufbau der Taxonomiedatenbank; unklare IDs werden nicht automatisch umgedeutet." },
  more = { title = "Weitere Aktionen", menu = "more",
    summary = "Einrichtung, Rücknahme und Bereinigung.",
    tooltip = "Öffnet seltenere FN-Aktionen, Erstregistrierung und Wiederherstellung. Keine Erfassung, Entfernung oder Bereinigung allein durch das Öffnen." },
  addLocationTime = { title = "Orts-/Zeitdaten hinzufügen", script = "AddLocationTime.lua",
    summary = "Vorhandene Fotoangaben als FN-Ort/Zeit ergänzen.",
    tooltip = "Ergänzt FN-Orts-/Zeitfelder und Stichwörter für die markierten Fotos aus vorhandenen Lightroom-Angaben. Fehlende Ortsdaten verhindern keine Zeitangabe; keine eigene GPS-Ortssuche." },
  updateLocationTime = { title = "Orts-/Zeitdaten aktualisieren", script = "UpdateLocationTime.lua",
    summary = "Nur FN-Ort/Zeit der markierten Fotos abgleichen.",
    tooltip = "Gleicht nur die markierten Fotos mit ihren aktuellen Lightroom-Orts-/Zeitangaben ab und ersetzt veraltete verwaltete Orts-/Zeitstichwörter. Die Taxonomie wird nicht aktualisiert." },
  removeLocationTime = { title = "Orts-/Zeitdaten entfernen", script = "RemoveLocationTime.lua",
    summary = "Nur FN-Ort/Zeit der markierten Fotos entfernen.",
    tooltip = "Entfernt nach Rückfrage FN-Orts-/Zeitfelder und die zugewiesenen FN-Orts-/Zeitstichwörter. Taxonomie, manuelle Stichwörter und ursprüngliche GPS-/Aufnahmedaten bleiben erhalten." },
  removeTaxonomy = { title = "Taxonomie entfernen", script = "RemoveTaxonomy.lua",
    summary = "Nur Taxonomie der markierten Fotos entfernen.",
    tooltip = "Entfernt nach Rückfrage FN-Taxonomiefelder, Art-Favorit und FN-Taxonomiestichwörter der markierten Fotos. FN-Ort und FN-Zeit sowie manuelle Stichwörter bleiben erhalten." },
  identity = { title = "Artänderungen prüfen", script = "ReviewIdentity.lua",
    summary = "Artwechsel prüfen oder frühere Übernahme zurücknehmen.",
    tooltip = "Prüft bestätigte Taxon-Nachfolger für die Fotoauswahl oder öffnet frühere Übernahmen zur Fortsetzung und Rücknahme. Keine automatische Migration allein beim Öffnen." },
  removeAll = { title = "Alle FN-Daten der Auswahl entfernen", script = "RemoveAllFnData.lua",
    summary = "Taxonomie, Art-Favorit und FN-Ort/Zeit entfernen.",
    tooltip = "Entfernt nach Rückfrage sämtliche FN-Metadaten und reservierten FN-Stichwortzuordnungen der markierten Fotos einschließlich Art-Favorit. Manuelle Stichwörter, Quelldaten und Bilddateien bleiben unverändert." },
  collections = { title = "Smart-Sammlungen einrichten", script = "CreateCollections.lua",
    summary = "FN-Sammlungen anlegen oder deren Regeln erneuern.",
    tooltip = "Legt die verwalteten Smart-Sammlungen für Art-Favoriten und fehlende/zugewiesene Taxonomie an oder aktualisiert ihre Regeln. Die Fotos selbst werden nicht neu zugewiesen." },
  usage = { title = "FN-Katalognutzung erfassen", script = "CaptureCatalogUsage.lua",
    summary = "Manuelle Erstregistrierung oder Wiederherstellung.",
    tooltip = "Liest die FN-Nutzung dieses Katalogs zweimal vollständig, ohne Fotos zu verändern. Für Erstregistrierung und Wiederherstellung; bei regulären bestätigten Datenbankupdates wird eine nötige Erfassung automatisch angefordert." },
}

local MENU_PAGES = {
  main = { title = "FN Wildlife verwalten", intro = "Häufige Aufgaben; weitere Möglichkeiten sind zusammengefasst.",
    actions = { "assign", "favorite", "locationTime", "statistics", "catalogUpdate", "more" } },
  locationTime = { title = "FN Wildlife – Ort und Zeit", intro = "Diese Aktionen betreffen nur die aktuell markierten Fotos.",
    actions = { "addLocationTime", "updateLocationTime", "removeLocationTime" } },
  more = { title = "FN Wildlife – Weitere Aktionen", intro = "Einrichtung, Wiederherstellung und bewusste Bestandsänderungen.",
    actions = { "removeTaxonomy", "identity", "removeAll", "collections", "usage" } },
}

local ALLOWED_SCRIPTS = {}
for _, action in pairs(ACTIONS) do
  if action.script then ALLOWED_SCRIPTS[action.script] = true end
end

local function executeAction(script)
  if not ALLOWED_SCRIPTS[script] then
    LrDialogs.message("Aktion konnte nicht geöffnet werden", "Die angeforderte FN-Wildlife-Aktion ist nicht freigegeben.", "critical")
    return
  end
  local path = LrPathUtils.child(_PLUGIN.path, script)
  local ok, errorMessage = LrTasks.pcall(dofile, path)
  if not ok then LrDialogs.message("Aktion konnte nicht geöffnet werden", tostring(errorMessage), "critical") end
end

LrTasks.startAsyncTask(function()
  LrFunctionContext.callWithContext("FN Wildlife Menü", function()
    local factory = LrView.osFactory()
    local currentMenu = "main"
    local selectedScript = nil
    local contentWidth = 2 * ACTION_WIDTH + factory:control_spacing()

    while currentMenu do
      local page = MENU_PAGES[currentMenu]
      local pageId = currentMenu
      local nextMenu, dialogControls = nil, nil
      local choiceMade = false
      local function choose(action)
        if choiceMade then return end
        choiceMade = true
        nextMenu = action.menu
        selectedScript = action.script
        if dialogControls then dialogControls:close() end
      end
      local contents = {
        margin = factory:dialog_spacing(),
        spacing = factory:dialog_spacing(),
        factory:static_text({ title = page.intro, width = contentWidth }),
      }
      for index = 1, #page.actions, 2 do
        local row = { spacing = factory:control_spacing(), width = contentWidth }
        for offset = 0, 1 do
          local action = ACTIONS[page.actions[index + offset]]
          if action then
            local selectedAction = action
            table.insert(row, factory:column({
              width = ACTION_WIDTH,
              margin = 0,
              spacing = factory:control_spacing(),
              factory:push_button({ title = action.title, tooltip = action.tooltip,
                width = ACTION_WIDTH, place_horizontal = 0,
                action = function() choose(selectedAction) end }),
              factory:row({ width = ACTION_WIDTH, margin_left = CAPTION_INSET,
                factory:static_text({ title = action.summary, tooltip = action.tooltip,
                  width = ACTION_WIDTH - CAPTION_INSET, height_in_lines = 2,
                  alignment = "left", place_horizontal = 0 }),
              }),
            }))
          end
        end
        table.insert(contents, factory:row(row))
      end
      local footer = { width = contentWidth }
      if pageId ~= "main" then
        table.insert(footer, factory:push_button({ title = "Zurück", action = function() choose({ menu = "main" }) end }))
      end
      table.insert(footer, factory:spacer({ fill_horizontal = 1 }))
      table.insert(footer, factory:push_button({ title = "Schließen", action = function() choose({}) end }))
      table.insert(contents, factory:row(footer))

      LrDialogs.presentFloatingDialog(_PLUGIN, {
        title = page.title,
        contents = factory:column(contents),
        blockTask = true,
        save_frame = "fnWildlifePluginMenuV2_" .. pageId,
        onShow = function(controls) dialogControls = controls end,
        windowWillClose = function() dialogControls = nil end,
      })
      currentMenu = nextMenu
    end
    if selectedScript then
      LrTasks.yield()
      executeAction(selectedScript)
    end
  end)
end)
