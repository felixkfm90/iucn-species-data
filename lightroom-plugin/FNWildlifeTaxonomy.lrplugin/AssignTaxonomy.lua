local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrTasks = import "LrTasks"

local AssignmentWindow = require "AssignmentWindow"

LrTasks.startAsyncTask(function()
  LrFunctionContext.callWithContext("FN Wildlife Taxonomie", function(context)
    local ok, errorMessage = LrTasks.pcall(AssignmentWindow.show, context)
    if not ok then
      LrDialogs.message(
        "Taxonomiefenster konnte nicht geöffnet werden",
        tostring(errorMessage),
        "critical"
      )
    end
  end)
end)
