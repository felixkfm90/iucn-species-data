local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrProgressScope = import "LrProgressScope"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local Statistics = require "Statistics"

local function percentage(part, total)
  part = tonumber(part or 0) or 0
  total = tonumber(total or 0) or 0
  if total <= 0 then
    return "0,0 %"
  end
  local value = math.floor(((part / total) * 1000) + 0.5) / 10
  return string.gsub(string.format("%.1f", value), "%.", ",") .. " %"
end

local function calculate(catalog, forceRefresh)
  local scope = nil
  if forceRefresh then
    scope = LrProgressScope({ title = "Taxonomie-Statistik wird berechnet" })
  end
  local statistics, cached = Statistics.load(catalog, forceRefresh, function(index, total)
    if scope then
      scope:setPortionComplete(index, math.max(total, 1))
    end
    LrTasks.yield()
  end)
  if scope then
    scope:done()
  end
  return statistics, cached
end

local function dashboardText(statistics, cached)
  local lines = {
    "Fotos im Katalog: " .. tostring(statistics.totalPhotos or 0),
    "Mit Taxonomie: " .. tostring(statistics.assignedPhotos or 0),
    "Ohne Taxonomie: " .. tostring(statistics.unassignedPhotos or 0),
    "Taxonomie-Abdeckung: "
      .. percentage(statistics.assignedPhotos, statistics.totalPhotos),
    "",
    "Arten: " .. tostring(statistics.speciesCount or 0),
    "Gattungen: " .. tostring(statistics.genusCount or 0),
    "Familien: " .. tostring(statistics.familyCount or 0),
    "Klassen: " .. tostring(statistics.classCount or 0),
    "",
    "Art-Referenzbilder: " .. tostring(statistics.referenceImageCount or 0),
    "Arten ohne Referenzbild: " .. tostring(statistics.speciesWithoutReference or 0),
  }
  if tonumber(statistics.speciesWithMultipleReferences or 0) > 0 then
    table.insert(lines, "Mehrfache Referenzbilder: " .. tostring(statistics.speciesWithMultipleReferences))
  end
  table.insert(lines, "")
  table.insert(lines, "Am häufigsten fotografierte Arten:")
  if #(statistics.topSpecies or {}) == 0 then
    table.insert(lines, "Noch keine Arten zugewiesen.")
  else
    for index, entry in ipairs(statistics.topSpecies or {}) do
      table.insert(
        lines,
        tostring(index)
          .. ". "
          .. tostring(entry.name)
          .. ": "
          .. tostring(entry.photoCount)
          .. " Fotos"
      )
    end
  end
  table.insert(lines, "")
  table.insert(lines, "Stand: " .. tostring(statistics.generatedAt or "soeben") .. (cached and " (Cache)" or ""))
  return table.concat(lines, "\n")
end

LrTasks.startAsyncTask(function()
  local ok, errorMessage = LrTasks.pcall(function()
    local catalog = LrApplication.activeCatalog()
    local forceRefresh = false
    while true do
      local statistics, cached = calculate(catalog, forceRefresh)
      local factory = LrView.osFactory()
      local result = LrDialogs.presentModalDialog({
        title = "FN Wildlife – Taxonomie-Statistik",
        actionVerb = "Neu berechnen",
        cancelVerb = "Schließen",
        contents = factory:static_text({
          title = dashboardText(statistics, cached),
          width_in_chars = 55,
          height_in_lines = 28,
        }),
      })
      if result ~= "ok" then
        break
      end
      forceRefresh = true
    end
  end)
  if not ok then
    LrDialogs.message("Statistik konnte nicht erstellt werden", tostring(errorMessage), "critical")
  end
end)
