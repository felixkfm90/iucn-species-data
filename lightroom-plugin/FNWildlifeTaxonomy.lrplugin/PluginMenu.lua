local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local ACTION_GROUPS = {
  {
    title = "Taxonomie und Art",
    actions = {
      { title = "Taxonomie zuweisen ...", script = "AssignTaxonomy.lua" },
      { title = "Taxonomie entfernen ...", script = "RemoveTaxonomy.lua" },
      { title = "Art-Favorit festlegen ...", script = "SetReferenceImage.lua" },
    },
  },
  {
    title = "Ort und Zeit – Auswahl",
    actions = {
      { title = "Hinzufügen ...", script = "AddLocationTime.lua" },
      { title = "Entfernen ...", script = "RemoveLocationTime.lua" },
    },
  },
  {
    title = "FN-Daten aktualisieren und bereinigen",
    actions = {
      {
        title = "Ort/Zeit der Auswahl aktualisieren ...",
        script = "UpdateLocationTime.lua",
      },
      {
        title = "Gesamten Katalog aktualisieren ...",
        script = "UpdateCatalogFnData.lua",
      },
      {
        title = "Alle FN-Daten der Auswahl entfernen ...",
        script = "RemoveAllFnData.lua",
      },
    },
  },
  {
    title = "Auswertung und Einrichtung",
    actions = {
      { title = "Taxonomie-Statistik ...", script = "ShowStatistics.lua" },
      { title = "Smart-Sammlungen einrichten ...", script = "CreateCollections.lua" },
    },
  },
}

local ALLOWED_SCRIPTS = {}
for _, group in ipairs(ACTION_GROUPS) do
  for _, action in ipairs(group.actions) do
    ALLOWED_SCRIPTS[action.script] = true
  end
end

local function executeAction(script)
  if not ALLOWED_SCRIPTS[script] then
    LrDialogs.message(
      "Aktion konnte nicht geöffnet werden",
      "Die angeforderte FN-Wildlife-Aktion ist nicht freigegeben.",
      "critical"
    )
    return
  end
  local path = LrPathUtils.child(_PLUGIN.path, script)
  local ok, errorMessage = LrTasks.pcall(dofile, path)
  if not ok then
    LrDialogs.message(
      "Aktion konnte nicht geöffnet werden",
      tostring(errorMessage),
      "critical"
    )
  end
end

LrTasks.startAsyncTask(function()
  LrFunctionContext.callWithContext("FN Wildlife Menü", function(context)
    local factory = LrView.osFactory()
    local dialogControls = nil
    local actionStarted = false

    local function startAction(script)
      if actionStarted then
        return
      end
      actionStarted = true
      if dialogControls then
        dialogControls:close()
      end
      LrTasks.startAsyncTask(function()
        LrTasks.yield()
        executeAction(script)
      end)
    end

    local contents = {
      margin = factory:dialog_spacing(),
      spacing = factory:control_spacing(),
      fill_horizontal = 1,
      factory:static_text({
        title = "Alle FN-Wildlife-Aktionen nach Aufgabe und Reichweite.",
        width_in_chars = 76,
        fill_horizontal = 1,
      }),
    }

    for _, group in ipairs(ACTION_GROUPS) do
      local row = {
        spacing = factory:control_spacing(),
        fill_horizontal = 1,
      }
      for _, action in ipairs(group.actions) do
        local selectedAction = action
        table.insert(row, factory:push_button({
          title = selectedAction.title,
          width_in_chars = 24,
          action = function()
            startAction(selectedAction.script)
          end,
        }))
      end
      table.insert(contents, factory:group_box({
        title = group.title,
        fill_horizontal = 1,
        factory:row(row),
      }))
    end

    table.insert(contents, factory:row({
      fill_horizontal = 1,
      factory:spacer({ fill_horizontal = 1 }),
      factory:push_button({
        title = "Schließen",
        action = function()
          if dialogControls then
            dialogControls:close()
          end
        end,
      }),
    }))

    LrDialogs.presentFloatingDialog(_PLUGIN, {
      title = "FN Wildlife verwalten",
      contents = factory:column(contents),
      blockTask = true,
      resizable = false,
      save_frame = "fnWildlifePluginMenuV1",
      onShow = function(controls)
        dialogControls = controls
      end,
      windowWillClose = function()
        dialogControls = nil
      end,
    })
  end)
end)
