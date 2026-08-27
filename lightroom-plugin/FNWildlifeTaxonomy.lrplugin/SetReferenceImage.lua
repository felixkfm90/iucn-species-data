local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"

local ReferenceImage = require "ReferenceImage"

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

LrTasks.startAsyncTask(function()
  local ok, errorMessage = LrTasks.pcall(function()
    local catalog = LrApplication.activeCatalog()
    local photos = catalog:getTargetPhotos() or {}
    if #photos ~= 1 then
      LrDialogs.message(
        "Genau ein Foto auswählen",
        "Bitte genau ein Foto auswählen, dessen Taxonomie bereits zugewiesen wurde.",
        "info"
      )
      return
    end

    local photo = photos[1]
    local masterTaxonId = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
    if masterTaxonId == "" then
      LrDialogs.message(
        "Zuerst Taxonomie zuweisen",
        "Das Favoritenbild der Art ist das ausgewählte Beispielfoto einer bereits zugeordneten Art. "
          .. "Bitte diesem Foto zuerst über „Taxonomie zuweisen“ eine Art zuordnen.",
        "info"
      )
      return
    end

    local germanName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "germanName"))
    local scientificName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "scientificName"))
    local name = germanName ~= "" and germanName or scientificName
    local existingPhoto = ReferenceImage.findExisting(catalog, photo)
    if existingPhoto then
      local choice = LrDialogs.confirm(
        "Art-Favorit ersetzen?",
        "Für "
          .. name
          .. " ist bereits ein Art-Favorit festgelegt. Möchtest du ihn durch das aktuell ausgewählte Bild ersetzen?",
        "Ja, ersetzen",
        "Nein, behalten"
      )
      if choice ~= "ok" then
        return
      end
    end

    local result = ReferenceImage.assign(catalog, photo)
    local resultName = result.germanName ~= "" and result.germanName or result.scientificName
    LrDialogs.message(
      "Favoritenbild der Art markiert",
      "Das ausgewählte Foto ist jetzt das Favoritenbild für " .. resultName .. ".",
      "info"
    )
  end)
  if not ok then
    LrDialogs.message("Favoritenbild der Art konnte nicht markiert werden", tostring(errorMessage), "warning")
  end
end)
