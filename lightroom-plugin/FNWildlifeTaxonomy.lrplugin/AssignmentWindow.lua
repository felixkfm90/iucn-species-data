local LrApplication = import "LrApplication"
local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local KeywordWriter = require "KeywordWriter"
local PluginState = require "PluginState"
local TaxonomyHelper = require "TaxonomyHelper"

local AssignmentWindow = {}
local bind = LrView.bind
local activeDialogControls = nil

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

local function resultTitle(result)
  local names = {}
  for _, value in ipairs({
    result.germanName,
    result.englishName,
    result.acceptedScientificName,
  }) do
    value = cleanText(value)
    if value ~= "" then
      table.insert(names, value)
    end
  end
  return table.concat(names, " · ")
end

local function previewText(taxon)
  local lines = {
    "Deutsch: " .. (cleanText(taxon.germanName) ~= "" and taxon.germanName or "nicht vorhanden"),
    "Englisch: " .. (cleanText(taxon.englishName) ~= "" and taxon.englishName or "nicht vorhanden"),
    "Wissenschaftlich: " .. cleanText(taxon.acceptedScientificName),
    "",
    "Vollständiger Taxonomiepfad:",
  }
  for _, entry in ipairs(taxon.hierarchy or {}) do
    local value = cleanText(entry.scientificName)
    local germanName = cleanText(entry.germanName)
    if germanName ~= "" and germanName ~= value then
      value = germanName .. " (" .. value .. ")"
    end
    table.insert(lines, KeywordWriter.rankLabel(entry.rank) .. ": " .. value)
  end
  return table.concat(lines, "\n")
end

local function selectionState(catalog)
  local photos = catalog:getTargetPhotos() or {}
  if #photos == 0 then
    return photos, "Keine Fotos ausgewählt"
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

  local text = tostring(#photos) .. " Foto(s) ausgewählt"
  if assigned == 0 then
    return photos, text .. " · noch ohne Taxonomie"
  end
  if different == 1 and assigned == #photos then
    return photos, text .. " · bereits einheitlich zugeordnet"
  end
  return photos, text .. " · " .. tostring(assigned) .. " bereits zugeordnet"
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

  props.query = ""
  props.packageStatus = "Lokales Taxonomie-Suchpaket wird geprüft ..."
  props.searchStatus = "Nach deutschem, englischem oder wissenschaftlichem Namen suchen."
  props.selectionStatus = "Lightroom-Auswahl wird gelesen ..."
  props.resultItems = { { title = "Noch keine Suche", value = "" } }
  props.masterTaxonId = ""
  props.recentItems = recentItems()
  props.recentTaxonId = props.recentItems[1].value
  props.preview = "Noch keine Art ausgewählt."
  props.canAssign = false
  props.canSearch = false
  props.packageReady = false
  props.busy = false

  local function refreshActions()
    local photos = catalog:getTargetPhotos() or {}
    props.canSearch = props.packageReady and not props.busy
    props.canAssign = currentTaxon ~= nil and #photos > 0 and not props.busy
  end

  local function setBusy(value)
    props.busy = value == true
    refreshActions()
  end

  local function refreshSelection()
    local _, status = selectionState(catalog)
    props.selectionStatus = status
    refreshActions()
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
      kingdom = "all",
      limit = 30,
    })
    setBusy(false)
    if not ok then
      props.searchStatus = "Suche fehlgeschlagen: " .. tostring(results)
      return
    end
    if not results or #results == 0 then
      currentTaxon = nil
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
    props.searchStatus = tostring(result.photoCount)
      .. " Foto(s) wurden vollständig zugeordnet."
    refreshSelection()
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
          title = bind("selectionStatus"),
          width_in_chars = 86,
          fill_horizontal = 1,
        }),
        factory:static_text({
          title = "Die Zuweisung gilt für alle aktuell markierten Fotos.",
        }),
      }),
    }),
    factory:group_box({
      title = "2. Art suchen und auswählen",
      fill_horizontal = 1,
      factory:column({
        spacing = factory:control_spacing(),
        factory:static_text({
          title = bind("packageStatus"),
          width_in_chars = 86,
          fill_horizontal = 1,
        }),
        factory:row({
          spacing = factory:control_spacing(),
          fill_horizontal = 1,
          factory:edit_field({
            value = bind("query"),
            width_in_chars = 58,
            fill_horizontal = 1,
            immediate = true,
          }),
          factory:push_button({
            title = "Art suchen",
            enabled = bind("canSearch"),
            action = function()
              LrTasks.startAsyncTask(search)
            end,
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
        factory:static_text({
          title = bind("searchStatus"),
          width_in_chars = 86,
          fill_horizontal = 1,
        }),
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
        factory:static_text({
          title = bind("preview"),
          width_in_chars = 86,
          height_in_lines = 11,
          fill_horizontal = 1,
        }),
      }),
    }),
    factory:group_box({
      title = "4. Taxonomie zuweisen",
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
        factory:spacer({ fill_horizontal = 1 }),
        factory:static_text({
          title = "Das Fenster kann während der Bildauswahl geöffnet bleiben.",
        }),
      }),
    }),
    factory:spacer({ fill_vertical = 1 }),
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
      width = 760,
      height = 560,
      blockTask = true,
      save_frame = "fnWildlifeTaxonomyAssignmentWindowV3",
      selectionChangeObserver = function()
        pcall(refreshSelection)
      end,
      onShow = function(controls)
        activeDialogControls = controls
        pcall(refreshSelection)
        LrTasks.startAsyncTask(initializeSearchPackage)
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
