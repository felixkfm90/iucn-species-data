local LrApplication = import "LrApplication"
local LrBinding = import "LrBinding"
local LrColor = import "LrColor"
local LrDialogs = import "LrDialogs"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local KeywordWriter = require "KeywordWriter"
local PluginState = require "PluginState"
local Statistics = require "Statistics"
local TaxonomyHelper = require "TaxonomyHelper"
local TaxonomyRanks = require "TaxonomyRanks"

local AssignmentWindow = {}
local bind = LrView.bind
local activeDialogControls = nil

local cleanText = TaxonomyRanks.cleanText

local KINGDOM_ITEMS = {
  { title = "Tiere (Animalia)", value = "Animalia" },
  { title = "Abadenavirae", value = "Abadenavirae" },
  { title = "Bacillati", value = "Bacillati" },
  { title = "Bamfordvirae", value = "Bamfordvirae" },
  { title = "Chromisten (Chromista)", value = "Chromista" },
  { title = "Fusobacteriati", value = "Fusobacteriati" },
  { title = "Helvetiavirae", value = "Helvetiavirae" },
  { title = "Heunggongvirae", value = "Heunggongvirae" },
  { title = "Loebvirae", value = "Loebvirae" },
  { title = "Methanobacteriati", value = "Methanobacteriati" },
  { title = "Nanobdellati", value = "Nanobdellati" },
  { title = "Orthornavirae", value = "Orthornavirae" },
  { title = "Pararnavirae", value = "Pararnavirae" },
  { title = "Pflanzen (Plantae)", value = "Plantae" },
  { title = "Pilze (Fungi)", value = "Fungi" },
  { title = "Promethearchaeati", value = "Promethearchaeati" },
  { title = "Protozoen (Protozoa)", value = "Protozoa" },
  { title = "Pseudomonadati", value = "Pseudomonadati" },
  { title = "Sangervirae", value = "Sangervirae" },
  { title = "Shotokuvirae", value = "Shotokuvirae" },
  { title = "Thermoproteati", value = "Thermoproteati" },
  { title = "Thermotogati", value = "Thermotogati" },
  { title = "Alle Reiche/Domänen", value = "all" },
}

local function resultTitle(result)
  local names = {}
  local seen = {}
  for _, value in ipairs({
    result.germanName,
    result.englishName,
    result.acceptedScientificName,
  }) do
    value = cleanText(value)
    if value ~= "" and not seen[value] then
      table.insert(names, value)
      seen[value] = true
    end
  end
  return table.concat(names, " · ")
end

local function previewText(taxon)
  local lines = {
    "Deutsch: " .. (cleanText(taxon.germanName) ~= "" and cleanText(taxon.germanName) or "nicht vorhanden"),
    "Englisch: " .. (cleanText(taxon.englishName) ~= "" and cleanText(taxon.englishName) or "nicht vorhanden"),
    "Wissenschaftlich: " .. cleanText(taxon.acceptedScientificName),
    "",
    "Vollständiger Taxonomiepfad:",
  }
  for _, entry in ipairs(taxon.hierarchy or {}) do
    local value = TaxonomyRanks.displayTaxon(entry, taxon)
    if value ~= "" then
      table.insert(lines, TaxonomyRanks.label(entry.rank) .. ": " .. value)
    end
  end
  return table.concat(lines, "\n")
end

local function photoFileName(photo)
  local ok, value = pcall(function()
    return photo:getFormattedMetadata("fileName")
  end)
  value = ok and cleanText(value) or ""
  if value ~= "" then
    return value
  end

  ok, value = pcall(function()
    return photo:getRawMetadata("path")
  end)
  value = ok and cleanText(value) or ""
  if value ~= "" then
    return cleanText(LrPathUtils.leafName(value))
  end
  return "Unbenanntes Foto"
end

local function selectionState(catalog)
  local photos = catalog:getTargetPhotos() or {}
  if #photos == 0 then
    return photos, "Keine Fotos ausgewählt", "Keine Datei ausgewählt", 0
  end

  local assigned = 0
  local taxonIds = {}
  for _, photo in ipairs(photos) do
    local id = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
    if id ~= "" then
      assigned = assigned + 1
      taxonIds[id] = true
    end
  end
  local different = 0
  for _ in pairs(taxonIds) do
    different = different + 1
  end

  local fileLabel = photoFileName(photos[1])
  if #photos > 1 then
    fileLabel = fileLabel .. " + " .. tostring(#photos - 1) .. " weitere"
  end

  local text = tostring(#photos) .. " Foto(s) ausgewählt"
  if assigned == 0 then
    return photos, text .. " · noch ohne Taxonomie", fileLabel, assigned
  end
  if different == 1 and assigned == #photos then
    return photos, text .. " · bereits einheitlich zugeordnet", fileLabel, assigned
  end
  return photos, text .. " · " .. tostring(assigned) .. " bereits zugeordnet", fileLabel, assigned
end

local function recentItems()
  local items = {}
  for _, taxon in ipairs(PluginState.recentTaxa()) do
    table.insert(items, {
      title = resultTitle(taxon),
      value = taxon.masterTaxonId,
    })
  end
  if #items == 0 then
    table.insert(items, { title = "Noch keine zuletzt verwendete Art", value = "" })
  end
  return items
end

function AssignmentWindow.show(context)
  if activeDialogControls then
    local focused = pcall(function()
      activeDialogControls:toFront()
    end)
    if focused then
      return
    end
    activeDialogControls = nil
  end

  local catalog = LrApplication.activeCatalog()
  local factory = LrView.osFactory()
  local props = LrBinding.makePropertyTable(context)
  local currentTaxon = nil
  local searchRequestSerial = 0

  props.query = ""
  props.kingdom = "Animalia"
  props.kingdomItems = KINGDOM_ITEMS
  props.packageStatus = "Lokales Taxonomie-Suchpaket wird geprüft ..."
  props.searchStatus = "Nach deutschem, englischem oder wissenschaftlichem Namen suchen."
  props.selectionFiles = "Lightroom-Auswahl wird gelesen ..."
  props.selectionStatus = "Lightroom-Auswahl wird gelesen ..."
  props.lifelistStatus = "Lifelist wird berechnet ..."
  props.resultItems = { { title = "Noch keine Suche", value = "" } }
  props.masterTaxonId = ""
  props.recentItems = recentItems()
  props.recentTaxonId = props.recentItems[1].value
  props.preview = "Noch keine Art ausgewählt."
  props.canAssign = false
  props.canRemove = false
  props.canSearch = false
  props.packageReady = false
  props.busy = false

  local function refreshActions()
    local photos = catalog:getTargetPhotos() or {}
    local assigned = 0
    for _, photo in ipairs(photos) do
      if cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId")) ~= "" then
        assigned = assigned + 1
      end
    end
    props.canSearch = props.packageReady and not props.busy
    props.canAssign = currentTaxon ~= nil and #photos > 0 and not props.busy
    -- Der Button bleibt auch nach einer früheren, nur teilweise erfolgreichen
    -- Entfernung verfügbar. So können verwaltete Stichwort-Altlasten in einem
    -- zweiten Durchlauf bereinigt werden, obwohl die Plug-in-Metadaten bereits
    -- leer sind.
    props.canRemove = #photos > 0 and not props.busy
  end

  local function setBusy(value)
    props.busy = value == true
    refreshActions()
  end

  local function refreshSelection()
    local _, status, fileLabel = selectionState(catalog)
    props.selectionFiles = "Datei: " .. fileLabel
    props.selectionStatus = status
    refreshActions()
  end

  local function refreshLifelist(forceRefresh)
    local ok, statistics = LrTasks.pcall(Statistics.load, catalog, forceRefresh == true)
    if ok and statistics then
      local speciesCount = tonumber(statistics.speciesCount or 0) or 0
      local speciesLabel = speciesCount == 1 and "Art" or "Arten"
      props.lifelistStatus = "Lifelist " .. tostring(speciesCount) .. " " .. speciesLabel
    else
      props.lifelistStatus = "Lifelist konnte nicht berechnet werden."
    end
  end

  local function initializeSearchPackage()
    setBusy(true)
    local ok, status = LrTasks.pcall(TaxonomyHelper.request, {
      command = "status",
    })
    if not ok then
      props.packageReady = false
      props.packageStatus = "Lokales Suchpaket ist nicht verfügbar: " .. tostring(status)
      setBusy(false)
      return
    end
    props.packageReady = status and status.available == true
    if props.packageReady then
      props.packageStatus = "Lokale Masterdatenbank bereit · "
        .. tostring(status.taxonCount or 0)
        .. " Taxa"
    else
      props.packageStatus = "Das lokale Taxonomie-Suchpaket ist noch nicht installiert."
    end
    setBusy(false)
  end

  local function loadTaxon(masterTaxonId)
    if cleanText(masterTaxonId) == "" then
      return
    end
    setBusy(true)
    props.searchStatus = "Taxonomiedetails werden geladen ..."
    local ok, taxon = LrTasks.pcall(TaxonomyHelper.request, {
      command = "taxon",
      masterTaxonId = masterTaxonId,
    })
    setBusy(false)
    if not ok then
      props.searchStatus = "Taxonomiedetails konnten nicht geladen werden: " .. tostring(taxon)
      return
    end
    currentTaxon = taxon
    props.preview = previewText(taxon)
    props.searchStatus = "Art ist zur Zuweisung bereit."
    refreshSelection()
  end

  local function search()
    if props.busy then
      return
    end
    local query = cleanText(props.query)
    if string.len(query) < 2 then
      props.searchStatus = "Bitte mindestens zwei Zeichen eingeben."
      return
    end
    currentTaxon = nil
    props.preview = "Noch keine Art ausgewählt."
    setBusy(true)
    props.searchStatus = "Lokale Masterdatenbank wird durchsucht ..."
    local ok, results = LrTasks.pcall(TaxonomyHelper.request, {
      command = "search",
      query = query,
      kingdom = cleanText(props.kingdom) ~= "" and props.kingdom or "Animalia",
      limit = 30,
    })
    setBusy(false)
    if not ok then
      props.searchStatus = "Suche fehlgeschlagen: " .. tostring(results)
      return
    end
    if not results or #results == 0 then
      props.resultItems = { { title = "Kein passender Eintrag", value = "" } }
      props.masterTaxonId = ""
      props.preview = "Noch keine Art ausgewählt."
      props.searchStatus = "Kein passendes Taxon im lokalen Suchpaket gefunden."
      return
    end

    local items = {}
    for _, result in ipairs(results) do
      table.insert(items, { title = resultTitle(result), value = result.masterTaxonId })
    end
    props.resultItems = items
    props.masterTaxonId = items[1].value
    props.searchStatus = tostring(#results) .. " Treffer gefunden."
    loadTaxon(props.masterTaxonId)
  end

  local function startSearch()
    searchRequestSerial = searchRequestSerial + 1
    local requestSerial = searchRequestSerial
    LrTasks.startAsyncTask(function()
      -- Lightroom schreibt den Inhalt eines edit_field erst mit Enter oder
      -- beim Verlassen des Feldes in die gebundene Eigenschaft. Ein Yield
      -- stellt sicher, dass search() danach wirklich den bestätigten Text
      -- liest. Die Seriennummer verhindert doppelte Starts durch Feldaktion
      -- und Standardbutton.
      LrTasks.yield()
      if requestSerial == searchRequestSerial then
        search()
      end
    end)
  end

  props:addObserver("query", function()
    -- Bei immediate=false wird dieser Beobachter erst ausgelöst, wenn die
    -- Eingabe mit Enter bestätigt oder das Feld verlassen wurde.
    startSearch()
  end)

  local function assign()
    if not currentTaxon then
      props.searchStatus = "Bitte zuerst eine Art auswählen."
      return
    end
    local photos = catalog:getTargetPhotos() or {}
    if #photos == 0 then
      props.searchStatus = "Bitte mindestens ein Foto auswählen."
      return
    end
    local conflicts = KeywordWriter.findConflicts(photos, currentTaxon)
    if #conflicts > 0 then
      props.searchStatus = tostring(#conflicts)
        .. " Foto(s) besitzen bereits eine andere Taxonomie. Es wurde nichts geändert."
      return
    end

    setBusy(true)
    props.searchStatus = "Taxonomie wird zugewiesen ..."
    local ok, result = LrTasks.pcall(KeywordWriter.assign, catalog, photos, currentTaxon)
    setBusy(false)
    if not ok then
      props.searchStatus = "Zuweisung fehlgeschlagen: " .. tostring(result)
      return
    end
    PluginState.addRecentTaxon(currentTaxon)
    props.recentItems = recentItems()
    props.recentTaxonId = props.recentItems[1].value
    props.searchStatus = tostring(result.photoCount) .. " Foto(s) wurden vollständig zugeordnet."
    refreshSelection()
    refreshLifelist(true)
  end

  local function removeAssignment()
    local photos = catalog:getTargetPhotos() or {}
    if #photos == 0 then
      props.searchStatus = "Bitte mindestens ein zugeordnetes Foto auswählen."
      return
    end
    local choice = LrDialogs.confirm(
      "Taxonomie entfernen?",
      "Die FN-Wildlife-Taxonomie wird von den aktuell markierten Fotos entfernt. "
        .. "Dabei werden die Plug-in-Metadaten und ausschließlich die vom Plug-in verwalteten "
        .. "Taxonomie-Stichwörter entfernt. Andere Lightroom-Stichwörter und die Bilddateien bleiben unverändert.",
      "Taxonomie entfernen",
      "Abbrechen"
    )
    if choice ~= "ok" then
      return
    end

    setBusy(true)
    props.searchStatus = "Taxonomie wird entfernt ..."
    local ok, result = LrTasks.pcall(KeywordWriter.remove, catalog, photos)
    setBusy(false)
    if not ok then
      props.searchStatus = "Taxonomie konnte nicht entfernt werden: " .. tostring(result)
      return
    end
    props.searchStatus = tostring(result.assignmentCount)
      .. " Taxonomiezuordnung(en) und "
      .. tostring(result.keywordCount)
      .. " verwaltete Stichwortzuordnung(en) wurden entfernt."
    refreshSelection()
    refreshLifelist(true)
  end

  local view = factory:column({
    bind_to_object = props,
    spacing = factory:dialog_spacing(),
    fill_horizontal = 1,
    fill_vertical = 1,
    factory:group_box({
      title = "1. Aktuelle Lightroom-Auswahl",
      fill_horizontal = 1,
      factory:column({
        spacing = factory:control_spacing(),
        factory:static_text({
          title = bind("selectionFiles"),
          width_in_chars = 86,
          fill_horizontal = 1,
          font = "<system/bold>",
        }),
        factory:row({
          fill_horizontal = 1,
          factory:static_text({ title = bind("selectionStatus"), fill_horizontal = 1 }),
          factory:static_text({
            title = bind("lifelistStatus"),
            font = "<system/bold>",
          }),
        }),
        factory:static_text({ title = "Die Zuweisung gilt für alle aktuell markierten Fotos." }),
      }),
    }),
    factory:group_box({
      title = "2. Art suchen und auswählen",
      fill_horizontal = 1,
      factory:column({
        spacing = factory:control_spacing(),
        factory:static_text({ title = bind("packageStatus"), width_in_chars = 86, fill_horizontal = 1 }),
        factory:row({
          spacing = factory:control_spacing(),
          factory:static_text({ title = "Reich/Domäne:" }),
          factory:popup_menu({
            value = bind("kingdom"),
            items = bind("kingdomItems"),
            width_in_chars = 32,
          }),
        }),
        factory:row({
          spacing = factory:control_spacing(),
          fill_horizontal = 1,
          factory:edit_field({
            value = bind("query"),
            width_in_chars = 58,
            fill_horizontal = 1,
            -- Erst Enter beziehungsweise das Verlassen des Feldes bestätigt
            -- die Eingabe. Mit immediate=true behandelt Lightroom jeden
            -- Tastendruck als Änderung, löst aber die Suchaktion nicht sicher
            -- über die Eingabetaste aus.
            immediate = false,
            action = startSearch,
            validate = function(_, value)
              -- validate wird von Lightroom beim Bestätigen mit Enter sicher
              -- aufgerufen. Der Wert wird vor dem asynchronen Start explizit
              -- übernommen, damit search() nicht noch den vorherigen Inhalt
              -- der gebundenen Eigenschaft liest.
              props.query = cleanText(value)
              startSearch()
              return true, value
            end,
          }),
          factory:push_button({
            title = "Art suchen",
            is_default = true,
            enabled = bind("canSearch"),
            action = startSearch,
          }),
        }),
        factory:row({
          spacing = factory:control_spacing(),
          fill_horizontal = 1,
          factory:popup_menu({
            value = bind("masterTaxonId"),
            items = bind("resultItems"),
            width_in_chars = 68,
            fill_horizontal = 1,
          }),
          factory:push_button({
            title = "Auswahl prüfen",
            enabled = bind("canSearch"),
            action = function()
              local id = props.masterTaxonId
              LrTasks.startAsyncTask(function()
                loadTaxon(id)
              end)
            end,
          }),
        }),
        factory:static_text({ title = bind("searchStatus"), width_in_chars = 86, fill_horizontal = 1 }),
        factory:row({
          spacing = factory:control_spacing(),
          fill_horizontal = 1,
          factory:static_text({ title = "Zuletzt verwendet:" }),
          factory:popup_menu({
            value = bind("recentTaxonId"),
            items = bind("recentItems"),
            width_in_chars = 55,
            fill_horizontal = 1,
          }),
          factory:push_button({
            title = "Öffnen",
            enabled = bind("canSearch"),
            action = function()
              local id = props.recentTaxonId
              LrTasks.startAsyncTask(function()
                loadTaxon(id)
              end)
            end,
          }),
        }),
      }),
    }),
    factory:group_box({
      title = "3. Taxonomie prüfen",
      fill_horizontal = 1,
      factory:column({
        fill_horizontal = 1,
        factory:scrolled_view({
          horizontal_scroller = false,
          vertical_scroller = true,
          width = 760,
          height = 150,
          fill_horizontal = 1,
          background_color = LrColor(0.94, 0.94, 0.94),
          factory:static_text({
            title = bind("preview"),
            width = 740,
            height_in_lines = 32,
            fill_horizontal = 1,
          }),
        }),
      }),
    }),
    factory:group_box({
      title = "4. Taxonomie verwalten",
      fill_horizontal = 1,
      factory:row({
        spacing = factory:control_spacing(),
        fill_horizontal = 1,
        factory:push_button({
          title = "Ausgewählte Art zuweisen",
          enabled = bind("canAssign"),
          action = function()
            LrTasks.startAsyncTask(assign)
          end,
        }),
        factory:push_button({
          title = "Taxonomie entfernen",
          enabled = bind("canRemove"),
          action = function()
            LrTasks.startAsyncTask(removeAssignment)
          end,
        }),
        factory:spacer({ fill_horizontal = 1 }),
        factory:static_text({ title = "Das Fenster kann während der Bildauswahl geöffnet bleiben." }),
      }),
    }),
    factory:row({
      fill_horizontal = 1,
      factory:spacer({ fill_horizontal = 1 }),
      factory:push_button({
        title = "Schließen",
        action = function()
          if activeDialogControls then
            pcall(function()
              activeDialogControls:close()
            end)
          end
        end,
      }),
    }),
  })

  refreshSelection()
  local shown, showError = LrTasks.pcall(function()
    LrDialogs.presentFloatingDialog(_PLUGIN, {
      title = "FN Wildlife – Taxonomie zuweisen",
      contents = view,
      resizable = true,
      width = 800,
      height = 540,
      blockTask = true,
      save_frame = "fnWildlifeTaxonomyAssignmentWindowV5",
      selectionChangeObserver = function()
        pcall(refreshSelection)
      end,
      onShow = function(controls)
        activeDialogControls = controls
        pcall(refreshSelection)
        LrTasks.startAsyncTask(function()
          refreshLifelist(false)
          initializeSearchPackage()
        end)
      end,
      windowWillClose = function()
        activeDialogControls = nil
      end,
    })
  end)
  activeDialogControls = nil
  if not shown then
    error(showError)
  end
end

return AssignmentWindow
