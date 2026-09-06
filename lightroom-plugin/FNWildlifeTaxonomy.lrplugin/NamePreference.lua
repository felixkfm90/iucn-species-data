local LrDialogs = import "LrDialogs"
local LrTasks = import "LrTasks"
local TaxonomyHelper = require "TaxonomyHelper"

local NamePreference = {}

function NamePreference.items(taxon)
  local result, seen = {}, {}
  local function add(name)
    if type(name) == "string" and name ~= "" and not seen[name] then
      seen[name] = true
      table.insert(result, { title = name .. (name == taxon.germanName and " (bevorzugt)" or ""), value = name })
    end
  end
  add(taxon.germanName)
  for _, name in ipairs(taxon.names or {}) do
    if name.language == "de" and (name.kind == "vernacular" or name.kind == "project") then add(name.name) end
  end
  return result
end

function NamePreference.prepare(taxon, germanName)
  if not germanName or germanName == "" or germanName == taxon.germanName then return taxon, nil end
  local preview = TaxonomyHelper.namePreference({
    command = "preview", masterTaxonId = taxon.masterTaxonId, germanName = germanName,
  })
  if preview.requiresConfirmation then
    local choice = LrDialogs.confirm("Bevorzugten deutschen Namen ändern?",
      "Bisher: " .. preview.previousGermanName .. "\nNeu: " .. preview.germanName
        .. "\n\nDie Namenswahl gilt künftig im Arten-Explorer und in Lightroom. Bestehende Fotos und Projektdateien werden nicht umbenannt.",
      "Namenswahl übernehmen", "Abbrechen")
    if choice ~= "ok" then return nil, nil end
  end
  local assignment = {}
  for key, value in pairs(taxon) do assignment[key] = value end
  assignment.germanName = preview.germanName
  return assignment, {
    command = "save", masterTaxonId = taxon.masterTaxonId, germanName = preview.germanName,
    token = preview.token, confirmed = true,
  }
end

function NamePreference.publish(payload)
  if not payload then return true, "" end
  local ok, result = LrTasks.pcall(TaxonomyHelper.namePreference, payload)
  if not ok then return false, "Fotos zugewiesen; globale Namenswahl noch offen: " .. tostring(result) end
  if not result.saved then return false, result.message or "Die globale Namenswahl ist noch nicht aktiviert." end
  return true, "Die Namenswahl wurde für Arten-Explorer und Lightroom übernommen."
end

return NamePreference
