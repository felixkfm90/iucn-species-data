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
local CLASS_EXPORT_ORDER = {
  Amphibien = 1,
  Insekten = 2,
  Reptilien = 3,
  ["Säugetiere"] = 4,
  ["Vögel"] = 5,
}
local CLASS_EMOJIS = {
  Amphibien = "🟢",
  Insekten = "🟡",
  Reptilien = "🟤",
  ["Säugetiere"] = "🟠",
  ["Vögel"] = "🔵",
}
local TXT_SEPARATOR = "────────────────────"

local function formatInteger(value)
  local number = math.floor(tonumber(value or 0) or 0)
  local sign = number < 0 and "-" or ""
  local digits = tostring(math.abs(number))
  local reversed = string.reverse(digits)
  reversed = string.gsub(reversed, "(%d%d%d)", "%1.")
  local formatted = string.reverse(reversed)
  formatted = string.gsub(formatted, "^%.", "")
  return sign .. formatted
end

local function countLabel(count, singular, plural)
  count = tonumber(count or 0) or 0
  return formatInteger(count) .. " " .. (count == 1 and singular or plural)
end

local function speciesLabel(count)
  return countLabel(count, "Art", "Arten")
end

local function photoLabel(count)
  return countLabel(count, "Foto", "Fotos")
end

local function storedMessage(count, singular, plural, format)
  count = tonumber(count or 0) or 0
  return countLabel(count, singular, plural)
    .. (count == 1 and " wurde" or " wurden")
    .. " als "
    .. format
    .. " gespeichert."
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
    photoLabel(statistics.assignedPhotos) .. " mit zugewiesener Taxonomie",
    photoLabel(statistics.unassignedPhotos) .. " ohne zugewiesene Taxonomie",
    "Taxonomieabdeckung: " .. percentage(statistics.assignedPhotos, statistics.totalPhotos),
  }, "\n")
end

local function taxonomyScopeText(statistics)
  return table.concat({
    countLabel(statistics.domainCount, "Domäne", "Domänen"),
    countLabel(statistics.kingdomCount, "Reich", "Reiche"),
    countLabel(statistics.phylumCount, "Stamm", "Stämme"),
    countLabel(statistics.rankClassCount, "Klasse", "Klassen"),
    countLabel(statistics.orderCount, "Ordnung", "Ordnungen"),
    countLabel(statistics.familyCount, "Familie", "Familien"),
    countLabel(statistics.genusCount, "Gattung", "Gattungen"),
    speciesLabel(statistics.speciesCount),
  }, "\n")
end

local function favoriteText(statistics)
  local speciesCount = tonumber(statistics.speciesCount or 0) or 0
  local withoutFavorite = tonumber(statistics.speciesWithoutReference or 0) or 0
  local withFavorite = math.max(speciesCount - withoutFavorite, 0)
  local lines = {
    speciesLabel(withFavorite) .. " mit Favoritenbild",
    speciesLabel(withoutFavorite) .. " ohne Favoritenbild",
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
        .. " · "
        .. percentage(entry.photoCount, statistics.assignedPhotos)
    )
  end
  return #lines > 0 and table.concat(lines, "\n") or "Noch keine Klassen erfasst."
end

local section

local function topListText(title, entries, formatter)
  local lines = { title }
  for index, entry in ipairs(entries or {}) do
    local name = formatter and formatter(entry.name) or tostring(entry.name)
    table.insert(
      lines,
      tostring(index) .. ". " .. name .. " · " .. photoLabel(entry.photoCount)
    )
  end
  if #lines == 1 then
    table.insert(lines, "–")
  end
  return table.concat(lines, "\n")
end

local function monthYearLabel(value)
  local year, month = string.match(tostring(value or ""), "^([^|]+)|(.+)$")
  if year and month then
    return month .. " " .. year
  end
  return tostring(value or "")
end

local function dayLabel(value)
  local year, month, day = string.match(tostring(value or ""), "^(%d%d%d%d)%-(%d%d)%-(%d%d)$")
  if year then
    return day .. "." .. month .. "." .. year
  end
  return tostring(value or "")
end

local function photoYearSpanLabel(count)
  count = tonumber(count or 0) or 0
  return "Fotos aus "
    .. formatInteger(count)
    .. " "
    .. (count == 1 and "Jahr" or "Jahren")
end

local function taxonomyDataQualityText(statistics)
  local quality = statistics.taxonomyDataQuality or {}
  local total = tonumber(statistics.assignedPhotos or 0) or 0
  local function line(count, label)
    return photoLabel(count) .. " " .. label .. " · " .. percentage(count, total)
  end
  return table.concat({
    line(quality.timePhotoCount, "mit Zeitangabe"),
    line(quality.locationPhotoCount, "mit Ortsangabe"),
    line(quality.bothPhotoCount, "mit Zeit- und Ortsangabe"),
    line(quality.onlyTimePhotoCount, "nur mit Zeitangabe"),
    line(quality.onlyLocationPhotoCount, "nur mit Ortsangabe"),
    line(quality.neitherPhotoCount, "ohne Zeit- und Ortsangabe"),
  }, "\n")
end

local function locationSummaryText(statistics)
  statistics = statistics or {}
  return table.concat({
    photoLabel(statistics.locationPhotoCount) .. " mit Ortsangabe",
    countLabel(statistics.countryCount, "Land", "Länder")
      .. " · " .. countLabel(statistics.stateCount, "Region", "Regionen")
      .. " · " .. countLabel(statistics.cityCount, "Stadt/Gemeinde", "Städte/Gemeinden")
      .. " · " .. countLabel(statistics.locationCount, "Ort/Detail", "Orte/Details"),
  }, "\n")
end

local function timeSummaryText(statistics)
  statistics = statistics or {}
  return table.concat({
    photoLabel(statistics.timePhotoCount) .. " mit Zeitangabe",
    photoYearSpanLabel(statistics.yearCount),
  }, "\n")
end

local function topListsSection(factory, title, summary, lists)
  local column = {
    spacing = factory:control_spacing(),
    fill_horizontal = 1,
    factory:static_text({
      title = summary,
      width_in_chars = 94,
      height_in_lines = 2,
      fill_horizontal = 1,
    }),
  }
  for index = 1, #lists, 2 do
    local left = lists[index]
    local right = lists[index + 1]
    local row = {
      spacing = factory:dialog_spacing(),
      fill_horizontal = 1,
      factory:static_text({
        title = topListText(left.title, left.entries, left.formatter),
        width_in_chars = 45,
        height_in_lines = 6,
        fill_horizontal = 1,
      }),
    }
    if right then
      table.insert(row, factory:static_text({
        title = topListText(right.title, right.entries, right.formatter),
        width_in_chars = 45,
        height_in_lines = 6,
        fill_horizontal = 1,
      }))
    end
    table.insert(column, factory:row(row))
  end
  return factory:group_box({
    title = title,
    fill_horizontal = 1,
    factory:column(column),
  })
end

local function locationSection(factory, statistics)
  statistics = statistics or {}
  return topListsSection(factory, "Orte", locationSummaryText(statistics), {
    { title = "Top 5 Länder", entries = statistics.topCountries },
    { title = "Top 5 Regionen", entries = statistics.topStates },
    { title = "Top 5 Städte/Gemeinden", entries = statistics.topCities },
    { title = "Top 5 Orte/Details", entries = statistics.topLocations },
  })
end

local function timeSection(factory, statistics)
  statistics = statistics or {}
  return topListsSection(factory, "Zeiten", timeSummaryText(statistics), {
    { title = "Top 5 Jahre", entries = statistics.topYears },
    { title = "Top 5 Monate", entries = statistics.topMonths },
    { title = "Top 5 Monate/Jahre", entries = statistics.topMonthYears, formatter = monthYearLabel },
    { title = "Top 5 Tage", entries = statistics.topDays, formatter = dayLabel },
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
      title = "Lifelist: " .. speciesLabel(statistics.speciesCount),
      font = "<system/bold>",
    }),
    factory:row({
      spacing = factory:control_spacing(),
      fill_horizontal = 1,
      section(factory, "Katalogübersicht", catalogOverviewText(statistics), 4, 45),
      section(
        factory,
        "Datenqualität der taxonomierten Fotos",
        taxonomyDataQualityText(statistics),
        6,
        45
      ),
    }),
    factory:row({
      spacing = factory:control_spacing(),
      fill_horizontal = 1,
      section(factory, "Taxonomischer Umfang", taxonomyScopeText(statistics), 8, 45),
      section(factory, "Art-Favoriten", favoriteText(statistics), 3, 45),
    }),
    locationSection(factory, statistics.locationTime),
    timeSection(factory, statistics.locationTime),
    section(factory, "Klassen", classBreakdownText(statistics), math.max(classCount, 1)),
    section(
      factory,
      "Am häufigsten fotografierte Arten",
      topSpeciesText(statistics),
      math.max(#(statistics.topSpecies or {}), 1)
    ),
    factory:static_text({
      title = "Stand: "
        .. tostring(statistics.generatedAt or "soeben")
        .. " · persistenter Katalogindex",
      alignment = "right",
      fill_horizontal = 1,
    }),
    factory:static_text({
      title = "Taxonomie-, Orts-/Zeit- und Art-Favoriten-Aktionen aktualisieren den Index. "
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
  return formatInteger(processed)
    .. " von "
    .. formatInteger(total)
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

local function rawInteger(value)
  return tostring(math.floor(tonumber(value or 0) or 0))
end

local function speciesDisplayName(entry)
  local germanName = tostring(entry and entry.germanName or "")
  if germanName ~= "" then
    return germanName
  end
  return tostring(entry and entry.scientificName or "")
end

local function classSortValues(entry)
  local name = classDisplayName(entry and entry.className)
  return CLASS_EXPORT_ORDER[name] or 100, string.lower(name)
end

local function sortedLifelist(statistics)
  local rows = {}
  for _, entry in ipairs(statistics.lifelist or {}) do
    table.insert(rows, entry)
  end
  table.sort(rows, function(left, right)
    local leftRank, leftClass = classSortValues(left)
    local rightRank, rightClass = classSortValues(right)
    if leftRank ~= rightRank then
      return leftRank < rightRank
    end
    if leftClass ~= rightClass then
      return leftClass < rightClass
    end
    local leftName = string.lower(speciesDisplayName(left))
    local rightName = string.lower(speciesDisplayName(right))
    if leftName == rightName then
      return tostring(left.scientificName or "") < tostring(right.scientificName or "")
    end
    return leftName < rightName
  end)
  return rows
end

local function savePath(title, fileType)
  return LrDialogs.runSavePanel({
    title = title,
    prompt = "Exportieren",
    requiredFileType = fileType,
    canCreateDirectories = true,
  })
end

local function openExportFile(path, kind)
  local file, openError = io.open(path, "wb")
  if not file then
    error(kind .. " konnte nicht geöffnet werden: " .. tostring(openError), 0)
  end
  file:write(string.char(239, 187, 191))
  return file
end

local function exportLifelist(statistics)
  local path = savePath("Lifelist als CSV exportieren", "csv")
  if not path then
    return
  end
  local file = openExportFile(path, "CSV-Datei")
  file:write(table.concat({
    csvField("Deutscher Name"),
    csvField("Englischer Name"),
    csvField("Wissenschaftlicher Name"),
    csvField("Klasse"),
    csvField("Ordnung"),
    csvField("Familie"),
    csvField("Gattung"),
    csvField("Fotoanzahl"),
    csvField("Art-Favorit"),
  }, ";"), "\r\n")
  for _, entry in ipairs(sortedLifelist(statistics)) do
    file:write(table.concat({
      csvField(entry.germanName),
      csvField(entry.englishName),
      csvField(entry.scientificName),
      csvField(classDisplayName(entry.className)),
      csvField(entry.order),
      csvField(entry.family),
      csvField(entry.genus),
      rawInteger(entry.photoCount),
      csvField((tonumber(entry.referenceImageCount or 0) or 0) > 0 and "Ja" or "Nein"),
    }, ";"), "\r\n")
  end
  file:close()
  LrDialogs.message(
    "Lifelist exportiert",
    storedMessage(statistics.speciesCount, "Art", "Arten", "UTF-8-CSV"),
    "info"
  )
end

local function exportObservationList(statistics)
  local path = savePath("Beobachtungsliste als CSV exportieren", "csv")
  if not path then
    return
  end
  local rows = statistics.observationRows or {}
  local writeOk, writeError = LrTasks.pcall(function()
    local file = openExportFile(path, "CSV-Datei")
    file:write(table.concat({
      csvField("Datum"),
      csvField("Jahr"),
      csvField("Monat"),
      csvField("Land"),
      csvField("Region"),
      csvField("Stadt/Gemeinde"),
      csvField("Ort/Detail"),
      csvField("Deutscher Artname"),
      csvField("Englischer Artname"),
      csvField("Wissenschaftlicher Name"),
      csvField("Klasse"),
      csvField("Ordnung"),
      csvField("Familie"),
      csvField("Gattung"),
      csvField("Anzahl Fotos"),
      csvField("Art-Favorit vorhanden"),
      csvField("Beispiel-Dateiname"),
    }, ";"), "\r\n")
    for index, entry in ipairs(rows) do
      file:write(table.concat({
        csvField(dayLabel(entry.captureDate)),
        csvField(entry.captureYear),
        csvField(entry.captureMonth),
        csvField(entry.country),
        csvField(entry.stateProvince),
        csvField(entry.city),
        csvField(entry.location),
        csvField(entry.germanName),
        csvField(entry.englishName),
        csvField(entry.scientificName),
        csvField(classDisplayName(entry.className)),
        csvField(entry.order),
        csvField(entry.family),
        csvField(entry.genus),
        rawInteger(entry.photoCount),
        csvField(entry.referenceImage and "Ja" or "Nein"),
        csvField(entry.exampleFileName),
      }, ";"), "\r\n")
      if index % 500 == 0 then
        LrTasks.yield()
      end
    end
    file:close()
  end)
  if not writeOk then
    error(writeError, 0)
  end
  LrDialogs.message(
    "Beobachtungsliste exportiert",
    storedMessage(#rows, "Beobachtung", "Beobachtungen", "UTF-8-CSV"),
    "info"
  )
end

local function exportSpeciesText(statistics)
  local path = savePath("Artenliste als TXT exportieren", "txt")
  if not path then
    return
  end
  local groups = {}
  for _, entry in ipairs(sortedLifelist(statistics)) do
    local className = classDisplayName(entry.className)
    if not groups[className] then
      groups[className] = {}
    end
    table.insert(groups[className], entry)
  end
  local classNames = {}
  for className in pairs(groups) do
    table.insert(classNames, className)
  end
  table.sort(classNames, function(left, right)
    local leftRank = CLASS_EXPORT_ORDER[left] or 100
    local rightRank = CLASS_EXPORT_ORDER[right] or 100
    if leftRank == rightRank then
      return string.lower(left) < string.lower(right)
    end
    return leftRank < rightRank
  end)

  local lines = { "Gesamt: " .. speciesLabel(statistics.speciesCount), "" }
  for _, className in ipairs(classNames) do
    local prefix = CLASS_EMOJIS[className]
    table.insert(
      lines,
      (prefix and (prefix .. " ") or "") .. className .. ": " .. formatInteger(#groups[className])
    )
  end
  for _, className in ipairs(classNames) do
    local prefix = CLASS_EMOJIS[className]
    table.insert(lines, "")
    table.insert(lines, TXT_SEPARATOR)
    table.insert(lines, "")
    table.insert(
      lines,
      (prefix and (prefix .. " ") or "")
        .. className
        .. " – "
        .. speciesLabel(#groups[className])
    )
    for _, entry in ipairs(groups[className]) do
      table.insert(lines, "* " .. speciesDisplayName(entry))
    end
  end

  local file = openExportFile(path, "TXT-Datei")
  file:write(table.concat(lines, "\r\n"), "\r\n")
  file:close()
  LrDialogs.message(
    "Artenliste exportiert",
    storedMessage(statistics.speciesCount, "Art", "Arten", "UTF-8-TXT"),
    "info"
  )
end

local function chooseExport()
  return LrFunctionContext.callWithContext("FN Wildlife Statistikexport", function(context)
    local factory = LrView.osFactory()
    local props = LrBinding.makePropertyTable(context)
    props.exportType = "lifelist"
    local result = LrDialogs.presentModalDialog({
      title = "Statistik exportieren",
      actionVerb = "Exportieren",
      cancelVerb = "Abbrechen",
      contents = factory:column({
        bind_to_object = props,
        margin = factory:dialog_spacing(),
        spacing = factory:control_spacing(),
        factory:static_text({ title = "Exportformat auswählen:" }),
        factory:popup_menu({
          value = bind("exportType"),
          width_in_chars = 42,
          items = {
            { title = "Lifelist als CSV exportieren", value = "lifelist" },
            { title = "Beobachtungsliste als CSV exportieren", value = "observations" },
            { title = "Artenliste als TXT exportieren", value = "species-text" },
          },
        }),
      }),
    })
    return result == "ok" and props.exportType or nil
  end)
end

local function showDashboard(catalog, statistics)
  while statistics do
    local result = LrFunctionContext.callWithContext("FN Wildlife Statistik", function(context)
      local factory = LrView.osFactory()
      local props = LrBinding.makePropertyTable(context)
      return LrDialogs.presentModalDialog({
        title = "FN Wildlife – Taxonomie-Statistik",
        actionVerb = "Exportieren ...",
        otherVerb = "Statistik neu aufbauen",
        cancelVerb = "Schließen",
        contents = dashboard(factory, props, statistics),
      })
    end)
    if result == "ok" then
      local exportType = chooseExport()
      if exportType == "lifelist" then
        exportLifelist(statistics)
      elseif exportType == "observations" then
        exportObservationList(statistics)
      elseif exportType == "species-text" then
        exportSpeciesText(statistics)
      end
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
