local LrApplication = import "LrApplication"
local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local KeywordWriter = require "KeywordWriter"
local TaxonomyHelper = require "TaxonomyHelper"

local bind = LrView.bind

local function resultTitle(result)
  local parts = {}
  if result.germanName and result.germanName ~= "" then
    table.insert(parts, result.germanName)
  end
  if result.englishName and result.englishName ~= "" then
    table.insert(parts, result.englishName)
  end
  table.insert(parts, result.acceptedScientificName)
  return table.concat(parts, " · ")
end

local function chooseSearchTerm(factory, context)
  local properties = LrBinding.makePropertyTable(context)
  properties.query = ""
  local result = LrDialogs.presentModalDialog({
    title = "Art und Taxonomie zuweisen",
    actionVerb = "Suchen",
    cancelVerb = "Abbrechen",
    contents = factory:column({
      spacing = factory:control_spacing(),
      factory:static_text({
        title = "Durchsuche alle Taxa und Namen der lokalen Masterdatenbank.",
      }),
      factory:row({
        factory:static_text({ title = "Artname oder Taxon:" }),
        factory:edit_field({
          value = bind("query"),
          width_in_chars = 42,
          immediate = true,
        }),
      }),
    }),
  })
  if result ~= "ok" then
    return nil
  end
  if not properties.query or string.len(properties.query) < 2 then
    LrDialogs.message(
      "Suchbegriff fehlt",
      "Bitte mindestens zwei Zeichen eingeben.",
      "warning"
    )
    return nil
  end
  return properties.query
end

local function chooseResult(factory, context, results)
  local properties = LrBinding.makePropertyTable(context)
  properties.masterTaxonId = results[1].masterTaxonId
  local items = {}
  for _, result in ipairs(results) do
    table.insert(items, {
      title = resultTitle(result),
      value = result.masterTaxonId,
    })
  end
  local dialogResult = LrDialogs.presentModalDialog({
    title = "Taxon auswählen",
    actionVerb = "Auswählen",
    cancelVerb = "Abbrechen",
    contents = factory:column({
      spacing = factory:control_spacing(),
      factory:static_text({
        title = tostring(#results) .. " passende Taxa wurden gefunden.",
      }),
      factory:popup_menu({
        value = bind("masterTaxonId"),
        items = items,
        width_in_chars = 58,
      }),
    }),
  })
  if dialogResult ~= "ok" then
    return nil
  end
  return properties.masterTaxonId
end

local function previewText(taxon, photoCount)
  local lines = {
    "Fotos: " .. tostring(photoCount),
    "Deutsch: " .. tostring(taxon.germanName or "nicht vorhanden"),
    "Englisch: " .. tostring(taxon.englishName or "nicht vorhanden"),
    "Wissenschaftlich: " .. tostring(taxon.acceptedScientificName),
    "",
    "Vollständiger Taxonomiepfad:",
  }
  for _, entry in ipairs(taxon.hierarchy or {}) do
    local value = entry.scientificName
    if entry.germanName and entry.germanName ~= entry.scientificName then
      value = entry.germanName .. " (" .. entry.scientificName .. ")"
    end
    table.insert(lines, KeywordWriter.rankLabel(entry.rank) .. ": " .. value)
  end
  return table.concat(lines, "\n")
end

local function confirmAssignment(factory, taxon, photoCount)
  local result = LrDialogs.presentModalDialog({
    title = "Taxonomiezuweisung prüfen",
    actionVerb = "Zuweisen",
    cancelVerb = "Abbrechen",
    contents = factory:column({
      spacing = factory:control_spacing(),
      factory:static_text({
        title = previewText(taxon, photoCount),
        width_in_chars = 70,
        height_in_lines = math.min(24, 8 + #(taxon.hierarchy or {})),
      }),
      factory:static_text({
        title = "Es werden nur Lightroom-Schlüsselwörter und stabile Plug-in-Felder geändert.",
      }),
    }),
  })
  return result == "ok"
end

local function runAssignment(context)
  local catalog = LrApplication.activeCatalog()
  local photos = catalog:getTargetPhotos()
  if not photos or #photos == 0 then
    LrDialogs.message(
      "Keine Fotos ausgewählt",
      "Bitte mindestens ein Foto in Lightroom Classic markieren.",
      "warning"
    )
    return
  end

  local packageStatus = TaxonomyHelper.request({ command = "status" })
  if not packageStatus or not packageStatus.packageId then
    error("Das lokale Lightroom-Taxonomie-Suchpaket ist nicht einsatzbereit.")
  end

  local factory = LrView.osFactory()
  local query = chooseSearchTerm(factory, context)
  if not query then
    return
  end
  local results = TaxonomyHelper.request({
    command = "search",
    query = query,
    kingdom = "all",
    limit = 30,
  })
  if not results or #results == 0 then
    LrDialogs.message(
      "Kein Taxon gefunden",
      "Im lokalen Suchpaket wurde kein passender Eintrag gefunden.",
      "warning"
    )
    return
  end

  local masterTaxonId = chooseResult(factory, context, results)
  if not masterTaxonId then
    return
  end
  local taxon = TaxonomyHelper.request({
    command = "taxon",
    masterTaxonId = masterTaxonId,
  })
  local conflicts = KeywordWriter.findConflicts(photos, taxon)
  if #conflicts > 0 then
    LrDialogs.message(
      "Abweichende Taxonomie vorhanden",
      tostring(#conflicts)
        .. " ausgewählte Foto(s) besitzen bereits eine andere Zuordnung. "
        .. "Der Prototyp verändert diese Fotos nicht.",
      "warning"
    )
    return
  end
  if not confirmAssignment(factory, taxon, #photos) then
    return
  end

  local result = KeywordWriter.assign(catalog, photos, taxon)
  LrDialogs.message(
    "Taxonomie zugewiesen",
    tostring(result.photoCount)
      .. " Foto(s) wurden mit "
      .. tostring(result.hierarchyCount)
      .. " Taxonomiestufen und den vorhandenen Artnamen versehen.",
    "info"
  )
end

LrTasks.startAsyncTask(function()
  LrFunctionContext.callWithContext("FN Wildlife Taxonomie", function(context)
    local ok, errorMessage = pcall(runAssignment, context)
    if not ok then
      LrDialogs.message(
        "Taxonomiezuweisung fehlgeschlagen",
        tostring(errorMessage),
        "critical"
      )
    end
  end)
end)
