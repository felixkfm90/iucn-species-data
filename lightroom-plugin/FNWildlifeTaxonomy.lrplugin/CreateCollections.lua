local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"

local SmartCollections = require "SmartCollections"

LrTasks.startAsyncTask(function()
  local ok, result = LrTasks.pcall(SmartCollections.create, LrApplication.activeCatalog())
  if not ok then
    LrDialogs.message("Sammlungen konnten nicht eingerichtet werden", tostring(result), "critical")
    return
  end
  LrDialogs.message(
    "FN Wildlife-Sammlungen sind bereit",
    tostring(result.total)
      .. " Smart-Sammlungen sind eingerichtet: "
      .. tostring(result.created)
      .. " neu erstellt, "
      .. tostring(result.updated)
      .. " mit den aktuellen Regeln abgeglichen und "
      .. tostring(result.removed)
      .. " nicht mehr benötigte Sammlung(en) entfernt.",
    "info"
  )
end)
