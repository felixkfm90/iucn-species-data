local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrProgressScope = import "LrProgressScope"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local Statistics = require "Statistics"

local CLASS_DISPLAY_NAMES = {
  Aves = "Vögel",
  Mammalia = "Säugetiere",
  Reptilia = "Reptilien",
  Amphibia = "Amphibien",
  Actinopterygii = "Strahlenflosser",
  Insecta = "Insekten",
  Arachnida = "Spinnentiere",
  Unbekannt = "Unbekannt",
}

local function countLabel(count, singular, plural)
  count = tonumber(count or 0) or 0
  return tostring(count) .. " " .. (count == 1 and singular or plural)
end

local function speciesLabel(count)
  return countLabel(count, "Art", "Arten")
end

local function photoLabel(count)
  return countLabel(count, "Foto", "Fotos")
end

local function classDisplayName(name)
  name = tostring(name or "Unbekannt")
  if name == "" then
    name = "Unbekannt"
  end
  return CLASS_DISPLAY_NAMES[name] or name
end

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
  local scope = LrProgressScope({ title = "Taxonomie-Statistik wird geladen" })
  local ok, statistics, cached = LrTasks.pcall(Statistics.load, catalog, forceRefresh, function(index, total)
    scope:setPortionComplete(index, math.max(total, 1))
    LrTasks.yield()
  end)
  scope:done()
  if not ok then
    error(statistics, 0)
  end
  return statistics, cached
end

local function catalogOverviewText(statistics)
  return table.concat({
    photoLabel(statistics.totalPhotos) .. " im Katalog",
    photoLabel(statistics.assignedPhotos) .. " mit Taxonomie",
    photoLabel(statistics.unassignedPhotos) .. " noch ohne Taxonomie",
    "Abdeckung: " .. percentage(statistics.assignedPhotos, statistics.totalPhotos),
  }, "\n")
end

local function taxonomyScopeText(statistics)
  return table.concat({
    speciesLabel(statistics.speciesCount),
    countLabel(statistics.genusCount, "Gattung", "Gattungen"),
    countLabel(statistics.familyCount, "Familie", "Familien"),
    countLabel(statistics.classCount, "Klasse", "Klassen"),
  }, "\n")
end

local function favoriteText(statistics)
  local speciesCount = tonumber(statistics.speciesCount or 0) or 0
  local withoutFavorite = tonumber(statistics.speciesWithoutReference or 0) or 0
  local withFavorite = math.max(speciesCount - withoutFavorite, 0)
  local lines = {
    "Art-Favoriten: " .. speciesLabel(withFavorite),
    "Ohne Favoritenbild: " .. speciesLabel(withoutFavorite),
  }
  if tonumber(statistics.speciesWithMultipleReferences or 0) > 0 then
    table.insert(
      lines,
      "Mehrfach markiert: " .. speciesLabel(statistics.speciesWithMultipleReferences)
    )
  end
  return table.concat(lines, "\n")
end

local function classBreakdownText(statistics)
  local lines = {}
  for _, entry in ipairs(statistics.classBreakdown or {}) do
    table.insert(
      lines,
      classDisplayName(entry.name)
        .. ": "
        .. speciesLabel(entry.speciesCount)
        .. " · "
        .. photoLabel(entry.photoCount)
    )
  end
  if #lines == 0 then
    return "Noch keine Klassen erfasst."
  end
  return table.concat(lines, "\n")
end

local function topSpeciesText(statistics)
  local lines = {}
  for index, entry in ipairs(statistics.topSpecies or {}) do
    table.insert(
      lines,
      tostring(index)
        .. ". "
        .. tostring(entry.name)
        .. " · "
        .. photoLabel(entry.photoCount)
    )
  end
  if #lines == 0 then
    return "Noch keine Arten zugewiesen."
  end
  return table.concat(lines, "\n")
end

local function section(factory, title, text, height)
  return factory:group_box({
    title = title,
    fill_horizontal = 1,
    factory:static_text({
      title = text,
      width_in_chars = 58,
      height_in_lines = height,
      fill_horizontal = 1,
    }),
  })
end

local function dashboard(factory, statistics, cached)
  return factory:column({
    spacing = factory:control_spacing(),
    fill_horizontal = 1,
    factory:static_text({
      title = "Lifelist " .. speciesLabel(statistics.speciesCount),
      font = "<system/bold>",
    }),
    factory:row({
      spacing = factory:control_spacing(),
      fill_horizontal = 1,
      section(factory, "Katalogübersicht", catalogOverviewText(statistics), 4),
      section(factory, "Taxonomischer Umfang", taxonomyScopeText(statistics), 4),
    }),
    section(factory, "Art-Favoriten", favoriteText(statistics), 3),
    section(factory, "Klassenverteilung", classBreakdownText(statistics), 8),
    section(factory, "Am häufigsten fotografierte Arten", topSpeciesText(statistics), 10),
    factory:static_text({
      title = "Stand: "
        .. tostring(statistics.generatedAt or "soeben")
        .. (cached and " · zwischengespeichert" or " · neu berechnet"),
      alignment = "right",
      fill_horizontal = 1,
    }),
  })
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
        contents = dashboard(factory, statistics, cached),
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
