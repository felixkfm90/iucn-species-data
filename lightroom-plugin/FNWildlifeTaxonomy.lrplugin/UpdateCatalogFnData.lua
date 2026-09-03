local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"

local CatalogMaintenance = require "CatalogMaintenance"

LrTasks.startAsyncTask(function()
  local ok, errorMessage = LrTasks.pcall(
    CatalogMaintenance.show,
    LrApplication.activeCatalog()
  )
  if not ok then
    LrDialogs.message(
      "FN-Daten im Katalog konnten nicht aktualisiert werden",
      tostring(errorMessage),
      "critical"
    )
  end
end)
