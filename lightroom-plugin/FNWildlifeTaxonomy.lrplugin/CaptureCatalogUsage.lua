local LrTasks = import "LrTasks"
local Capture = require "CatalogUsageCapture"

-- Explicit manual first-registration/recovery action. Automatic captures use
-- the same read-only core, but only for a confirmed persisted update request.
LrTasks.startAsyncTask(function()
  Capture.run({ manual = true })
end)
