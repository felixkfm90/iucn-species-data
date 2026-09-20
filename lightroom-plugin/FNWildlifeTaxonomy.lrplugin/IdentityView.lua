local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrProgressScope = import "LrProgressScope"
local LrTasks = import "LrTasks"
local LrView = import "LrView"
local View = {}

function View.photos(number)
  return tostring(number) .. (number == 1 and " Foto" or " Fotos")
end

function View.choose(title, explanation, items, button)
  return LrFunctionContext.callWithContext("FN Wildlife Artänderung", function(context)
    local factory = LrView.osFactory()
    local props = LrBinding.makePropertyTable(context)
    props.choice = ""
    local options = { { title = "Bitte auswählen ...", value = "" } }
    for _, item in ipairs(items) do table.insert(options, item) end
    local result = LrDialogs.presentModalDialog({
      title = title, actionVerb = button or "Weiter", cancelVerb = "Schließen",
      contents = factory:column({
        bind_to_object = props, margin = factory:dialog_spacing(), spacing = factory:control_spacing(),
        factory:static_text({ title = explanation, width_in_chars = 82, height_in_lines = 6 }),
        factory:popup_menu({ value = LrView.bind("choice"), items = options, width_in_chars = 82 }),
      }),
    })
    if result ~= "ok" or props.choice == "" then return nil end
    return props.choice
  end)
end

function View.confirm(title, text, button)
  return LrDialogs.confirm(title, text, button or "Bestätigen", "Abbrechen") == "ok"
end

function View.message(title, text, severity)
  LrDialogs.message(title, text, severity or "info")
end

function View.work(title, action)
  local scope = LrProgressScope({ title = title, caption = "Abbrechen pausiert. Bereits gespeicherte Blöcke bleiben erhalten." })
  scope:setCancelable(true)
  local ok, result = LrTasks.pcall(action, function(done, total)
    scope:setCaption(tostring(done) .. " von " .. tostring(total) .. " Fotos geprüft. Abbrechen pausiert vor dem nächsten Schreibblock.")
    scope:setPortionComplete(done, math.max(total, 1))
    return not scope:isCanceled()
  end)
  local canceled = scope:isCanceled()
  scope:done()
  if not ok then
    if canceled and tostring(result):find("Artänderungsprüfung pausiert", 1, true) then return nil, true end
    error(result, 0) -- never hide a failed write/checkpoint behind a cancel click
  end
  return result, canceled
end

function View.photoLabel(catalog, uuid)
  local ok, name = LrTasks.pcall(function()
    local photo = catalog:findPhotoByUuid(uuid)
    return photo and photo:getFormattedMetadata("fileName") or nil
  end)
  return (ok and name and name ~= "" and name or "Foto nicht verfügbar") .. " · " .. uuid
end

-- Native fixed-size pages instead of Lightroom's unreliable nested scroll UI.
function View.conflicts(catalog, conflicts)
  for first = 1, #conflicts, 4 do
    local lines = {}
    for index = first, math.min(first + 3, #conflicts) do
      local entry = conflicts[index]
      table.insert(lines, View.photoLabel(catalog, entry.photoUuid) .. "\n" .. entry.reason)
    end
    if not View.confirm("Nicht änderbare Fotos · " .. first .. "–" .. math.min(first + 3, #conflicts),
      table.concat(lines, "\n\n"), "Weiter") then return false end
  end
  return true
end

return View
