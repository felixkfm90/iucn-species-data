local PluginState = require "PluginState"

local PhotoSelection = {}

local function showsFolderStacks(catalog)
  if type(catalog.getActiveSources) ~= "function" then return false end
  local sources = catalog:getActiveSources() or {}
  if #sources == 0 then return false end
  for _, source in ipairs(sources) do
    if type(source) == "string" then
      if source ~= catalog.kAllPhotos then return false end
    elseif type(source.type) ~= "function" or source:type() ~= "LrFolder" then
      -- Collection stacks have their own membership and collapsed state.
      -- The SDK exposes only folder-stack metadata; never substitute it here.
      return false
    end
  end
  return true
end

function PhotoSelection.selectedWithCollapsedFolderStacks(catalog)
  local selected = PluginState.selectedPhotos(catalog)
  if #selected == 0 then return {}, 0 end
  local photos, seenPhotos, seenIds = {}, {}, {}
  local function append(photo)
    local id = photo.localIdentifier
    id = id ~= nil and tostring(id) or nil
    if seenPhotos[photo] or id and seenIds[id] then return false end
    seenPhotos[photo] = true
    if id then seenIds[id] = true end
    table.insert(photos, photo)
    return true
  end
  for _, photo in ipairs(selected) do append(photo) end
  if not showsFolderStacks(catalog) then return photos, 0 end
  local added = 0
  for _, photo in ipairs(selected) do
    if photo:getRawMetadata("isInStackInFolder") == true
      and photo:getRawMetadata("stackInFolderIsCollapsed") == true
      and photo:getRawMetadata("stackPositionInFolder") == 1 then
      local members = photo:getRawMetadata("stackInFolderMembers")
      if type(members) ~= "table" or #members == 0 then
        error("Der eingeklappte Stapel konnte nicht vollständig gelesen werden. Bitte Stapel aufklappen und erneut auswählen.", 0)
      end
      for _, member in ipairs(members) do
        if append(member) then added = added + 1 end
      end
    end
  end
  return photos, added
end

return PhotoSelection
