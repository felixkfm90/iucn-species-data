local LrApplication = import "LrApplication"
local LrTasks = import "LrTasks"
local Action = require "IdentityAction"

LrTasks.startAsyncTask(function()
  Action.run(LrApplication.activeCatalog())
end)
