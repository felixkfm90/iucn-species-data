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
    tostring(result) .. " Smart-Sammlungen wurden erstellt oder geprüft.",
    "info"
  )
end)
