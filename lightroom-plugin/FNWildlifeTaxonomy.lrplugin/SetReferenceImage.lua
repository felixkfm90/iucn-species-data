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
        "Ein Art-Referenzbild ist das bevorzugte Beispielfoto einer bereits zugeordneten Art. "
          .. "Bitte diesem Foto zuerst über „Taxonomie zuweisen ...“ eine Art zuordnen.",
        "info"
      )
      return
    end

    local germanName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "germanName"))
    local scientificName = cleanText(photo:getPropertyForPlugin(_PLUGIN, "scientificName"))
    local name = germanName ~= "" and germanName or scientificName
    local choice = LrDialogs.confirm(
      "Als Art-Referenzbild festlegen?",
      "Dieses Foto wird als bevorzugtes Beispielfoto für "
        .. name
        .. " markiert. Ein bisheriges Referenzbild derselben Art wird ersetzt. "
        .. "Die Bilddatei wird dabei weder kopiert noch verändert.",
      "Referenzbild festlegen",
      "Abbrechen"
    )
    if choice ~= "ok" then
      return
    end

    local result = ReferenceImage.assign(catalog, photo)
    local resultName = result.germanName ~= "" and result.germanName or result.scientificName
    LrDialogs.message(
      "Art-Referenzbild festgelegt",
      "Das ausgewählte Foto ist jetzt das bevorzugte Beispielfoto für " .. resultName .. ".",
      "info"
    )
  end)
  if not ok then
    LrDialogs.message("Referenzbild konnte nicht festgelegt werden", tostring(errorMessage), "warning")
  end
end)
