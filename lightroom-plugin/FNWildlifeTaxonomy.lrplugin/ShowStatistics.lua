local LrApplication = import "LrApplication"
local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local Statistics = require "Statistics"

local bind = LrView.bind
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

local function topSpeciesText(statistics)
  local lines = {}
  for index, entry in ipairs(statistics.topSpecies or {}) do
    table.insert(
      lines,
      tostring(index) .. ". " .. tostring(entry.name) .. " · " .. photoLabel(entry.photoCount)
    )
  end
  if #lines == 0 then
    return "Noch keine Arten zugewiesen."
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
  return #lines > 0 and table.concat(lines, "\n") or "Noch keine Klassen erfasst."
end

local section

local function rankedValuesLine(label, distinctCount, entries)
  local values = {}
  for _, entry in ipairs(entries or {}) do
    table.insert(values, tostring(entry.name) .. " (" .. tostring(entry.photoCount) .. ")")
  end
  return label
    .. " ("
    .. tostring(tonumber(distinctCount or 0) or 0)
    .. "): "
    .. (#values > 0 and table.concat(values, ", ") or "–")
end

local function locationTimeText(statistics)
  statistics = statistics or {}
  local photoCount = tonumber(statistics.photoCount or 0) or 0
  if photoCount == 0 then
    return "Noch keine passenden FN-Orts-/Zeitdaten gespeichert."
  end
  return table.concat({
    photoLabel(photoCount)
      .. " · " .. photoLabel(statistics.locationPhotoCount) .. " mit Ort"
      .. " · " .. photoLabel(statistics.timePhotoCount) .. " mit Zeit",
    rankedValuesLine("Länder", statistics.countryCount, statistics.topCountries),
    rankedValuesLine("Bundesländer/Regionen", statistics.stateCount, statistics.topStates),
    rankedValuesLine("Städte", statistics.cityCount, statistics.topCities),
    rankedValuesLine("Ortsdetails", statistics.locationCount, statistics.topLocations),
    rankedValuesLine("Jahre", statistics.yearCount, statistics.topYears),
    rankedValuesLine("Monate", statistics.monthCount, statistics.topMonths),
  }, "\n")
end

local function locationTimeDashboard(factory, statistics)
  return factory:group_box({
    title = "FN-Orte und FN-Zeiten",
    fill_horizontal = 1,
    factory:row({
      spacing = factory:dialog_spacing(),
      fill_horizontal = 1,
      section(
        factory,
        "Alle FN-Orts-/Zeitfotos",
        locationTimeText(statistics.locationTime),
        7,
        45
      ),
      section(
        factory,
        "Mit Taxonomie",
        locationTimeText(statistics.taxonomyLocationTime),
        7,
        45
      ),
    }),
  })
end

section = function(factory, title, text, height, width)
  return factory:group_box({
    title = title,
    fill_horizontal = 1,
    factory:static_text({
      title = text,
      width_in_chars = width or 58,
      height_in_lines = height,
      fill_horizontal = 1,
    }),
  })
end

local function dashboard(factory, props, statistics)
  local classCount = #(statistics.classBreakdown or {})
  return factory:column({
    bind_to_object = props,
    margin = factory:dialog_spacing(),
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
    locationTimeDashboard(factory, statistics),
    section(factory, "Klassen", classBreakdownText(statistics), math.max(classCount, 1)),
    section(factory, "Am häufigsten fotografierte Arten", topSpeciesText(statistics), 10),
    factory:static_text({
      title = "Stand: "
        .. tostring(statistics.generatedAt or "soeben")
        .. " · persistenter Katalogindex",
      alignment = "right",
      fill_horizontal = 1,
    }),
    factory:static_text({
      title = "Taxonomie-, Orts-/Zeit- und Art-Favoriten-Aktionen aktualisieren den Index direkt. "
        .. "Nach Änderungen außerhalb des Plug-ins bitte „Statistik neu aufbauen“ verwenden.",
      width_in_chars = 90,
      fill_horizontal = 1,
    }),
  })
end

local function buildProgressText(processed, total)
  processed = tonumber(processed or 0) or 0
  total = tonumber(total or 0) or 0
  local percent = total > 0 and math.floor(((processed / total) * 1000) + 0.5) / 10 or 100
  return tostring(processed)
    .. " von "
    .. tostring(total)
    .. " Fotos · "
    .. string.gsub(string.format("%.1f", percent), "%.", ",")
    .. " %"
end

local function buildIndexWindow(catalog, restart)
  return LrFunctionContext.callWithContext("FN Wildlife Statistikindex", function(context)
    local factory = LrView.osFactory()
    local props = LrBinding.makePropertyTable(context)
    local dialogControls = nil
    local running = false
    local pauseRequested = false
    local windowClosed = false
    local completedStatistics = nil

    props.status = restart
      and "Der Statistikindex wird vollständig neu aufgebaut."
      or "Der Statistikindex wird vorbereitet."
    props.progress = "Noch keine Fotos verarbeitet."
    props.toggleTitle = "Pausieren"

    local function updateControls(status, title)
      if not windowClosed then
        props.status = status
        props.toggleTitle = title
      end
    end

    local startWorker
    startWorker = function()
      if running then
        return
      end
      if not Statistics.beginBuild() then
        updateControls(
          "Ein anderer Statistikaufbau speichert gerade seinen Fortschritt. Bitte kurz warten.",
          "Erneut versuchen"
        )
        return
      end
      running = true
      pauseRequested = false
      updateControls("Statistikindex wird im Hintergrund aufgebaut.", "Pausieren")
      LrTasks.startAsyncTask(function()
        local ok, result = LrTasks.pcall(function()
          return Statistics.build(catalog, {
            restart = restart,
            progress = function(processed, total)
              if not windowClosed then
                props.progress = buildProgressText(processed, total)
              end
              LrTasks.yield()
              if pauseRequested or windowClosed then
                return "pause"
              end
              return nil
            end,
          })
        end)
        Statistics.finishBuild()
        restart = false
        running = false
        if not ok then
          updateControls("Aufbau fehlgeschlagen: " .. tostring(result), "Erneut versuchen")
          return
        end
        if result.status == "paused" then
          updateControls(
            "Aufbau pausiert. Der Fortschritt wurde im Lightroom-Katalog gespeichert.",
            "Fortsetzen"
          )
          return
        end
        completedStatistics = result.statistics
        if not windowClosed then
          props.progress = buildProgressText(result.totalPhotos, result.totalPhotos)
          props.status = "Statistikindex ist vollständig und wurde gespeichert."
        end
        if dialogControls then
          dialogControls:close()
        end
      end)
    end

    local contents = factory:column({
      bind_to_object = props,
      margin = factory:dialog_spacing(),
      spacing = factory:dialog_spacing(),
      fill_horizontal = 1,
      factory:static_text({
        title = bind("status"),
        width_in_chars = 72,
        fill_horizontal = 1,
      }),
      factory:static_text({
        title = bind("progress"),
        font = "<system/bold>",
        fill_horizontal = 1,
      }),
      factory:static_text({
        title = "Lightroom bleibt während des Aufbaus bedienbar. "
          .. "Pausieren und Schließen speichern den zuletzt abgeschlossenen Block.",
        width_in_chars = 72,
        fill_horizontal = 1,
      }),
      factory:row({
        fill_horizontal = 1,
        factory:push_button({
          title = bind("toggleTitle"),
          action = function()
            if running then
              pauseRequested = true
              updateControls("Pause wird nach dem aktuellen Fotoblock gespeichert ...", "Pausieren")
            else
              startWorker()
            end
          end,
        }),
        factory:spacer({ fill_horizontal = 1 }),
        factory:push_button({
          title = "Schließen",
          action = function()
            pauseRequested = true
            if dialogControls then
              dialogControls:close()
            end
          end,
        }),
      }),
    })

    LrDialogs.presentFloatingDialog(_PLUGIN, {
      title = "FN Wildlife – Statistikindex aufbauen",
      contents = contents,
      blockTask = true,
      resizable = false,
      save_frame = "fnWildlifeStatisticsBuildV1",
      onShow = function(controls)
        dialogControls = controls
        startWorker()
      end,
      windowWillClose = function()
        windowClosed = true
        pauseRequested = true
        dialogControls = nil
      end,
    })
    return completedStatistics
  end)
end

local function csvField(value)
  local text = tostring(value or "")
  return '"' .. string.gsub(text, '"', '""') .. '"'
end

local function exportLifelist(statistics)
  local path = LrDialogs.runSavePanel({
    title = "Lifelist als CSV exportieren",
    prompt = "Exportieren",
    requiredFileType = "csv",
    canCreateDirectories = true,
  })
  if not path then
    return
  end
  local file, openError = io.open(path, "wb")
  if not file then
    error("CSV-Datei konnte nicht geöffnet werden: " .. tostring(openError), 0)
  end
  file:write(string.char(239, 187, 191))
  file:write(table.concat({
    csvField("Deutscher Name"),
    csvField("Wissenschaftlicher Name"),
    csvField("Klasse"),
    csvField("Familie"),
    csvField("Gattung"),
    csvField("Fotoanzahl"),
    csvField("Art-Favorit"),
  }, ";"), "\r\n")
  for _, entry in ipairs(statistics.lifelist or {}) do
    file:write(table.concat({
      csvField(entry.germanName),
      csvField(entry.scientificName),
      csvField(classDisplayName(entry.className)),
      csvField(entry.family),
      csvField(entry.genus),
      csvField(entry.photoCount),
      csvField((tonumber(entry.referenceImageCount or 0) or 0) > 0 and "Ja" or "Nein"),
    }, ";"), "\r\n")
  end
  file:close()
  LrDialogs.message(
    "Lifelist exportiert",
    speciesLabel(statistics.speciesCount) .. " wurden als UTF-8-CSV gespeichert.",
    "info"
  )
end

local function showDashboard(catalog, statistics)
  while statistics do
    local result = LrFunctionContext.callWithContext("FN Wildlife Statistik", function(context)
      local factory = LrView.osFactory()
      local props = LrBinding.makePropertyTable(context)
      return LrDialogs.presentModalDialog({
        title = "FN Wildlife – Taxonomie-Statistik",
        actionVerb = "Lifelist als CSV exportieren",
        otherVerb = "Statistik neu aufbauen",
        cancelVerb = "Schließen",
        contents = dashboard(factory, props, statistics),
      })
    end)
    if result == "ok" then
      exportLifelist(statistics)
    elseif result == "other" then
      local rebuilt = buildIndexWindow(catalog, true)
      statistics = rebuilt or select(1, Statistics.load(catalog))
    else
      break
    end
  end
end

LrTasks.startAsyncTask(function()
  local ok, errorMessage = LrTasks.pcall(function()
    local catalog = LrApplication.activeCatalog()
    local statistics = select(1, Statistics.load(catalog))
    if not statistics then
      statistics = buildIndexWindow(catalog, false)
    end
    if statistics then
      showDashboard(catalog, statistics)
    end
  end)
  if not ok then
    LrDialogs.message("Statistik konnte nicht erstellt werden", tostring(errorMessage), "critical")
  end
end)
