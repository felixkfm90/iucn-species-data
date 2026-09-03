local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local KeywordWriter = require "KeywordWriter"
local LocationTimeWriter = require "LocationTimeWriter"
local TaxonomyHelper = require "TaxonomyHelper"

local CatalogMaintenance = {}

local bind = LrView.bind
local READ_CHUNK_SIZE = 500
local WRITE_CHUNK_SIZE = 250
local FIELD_IDS = {
  "masterTaxonId",
  "referenceImage",
  "fnLocation",
  "fnCity",
  "fnStateProvince",
  "fnCountry",
  "fnIsoCountryCode",
  "fnCaptureMonth",
  "fnCaptureYear",
  "locationTimeKeywordIds",
  "locationTimeKeywordNames",
  "locationTimeAssignedAt",
}

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

local function isMasterTaxonId(value)
  return string.sub(cleanText(value), 1, 4) == "mtx_"
end

local function hasLocationTimeAssignment(values)
  for _, field in ipairs({
    "fnLocation",
    "fnCity",
    "fnStateProvince",
    "fnCountry",
    "fnIsoCountryCode",
    "fnCaptureMonth",
    "fnCaptureYear",
    "locationTimeKeywordIds",
    "locationTimeKeywordNames",
    "locationTimeAssignedAt",
  }) do
    if cleanText(values[field]) ~= "" then
      return true
    end
  end
  return false
end

local function photoIdentifier(photo)
  return tonumber(photo.localIdentifier or 0) or 0
end

local function sortedPhotos(catalog)
  local photos = catalog:getAllPhotos()
  table.sort(photos, function(left, right)
    return photoIdentifier(left) < photoIdentifier(right)
  end)
  return photos
end

local function appendUniquePhoto(target, seen, photo)
  if not seen[photo] then
    seen[photo] = true
    table.insert(target, photo)
  end
end

local function scanCatalog(catalog, callbacks)
  callbacks = callbacks or {}
  local photos = sortedPhotos(catalog)
  local state = {
    totalPhotos = #photos,
    taxonomyGroups = {},
    taxonomyIds = {},
    taxonomyPhotoCount = 0,
    invalidTaxonomyPhotoCount = 0,
    locationOnlyPhotos = {},
    locationOnlySeen = {},
    locationTimePhotoCount = 0,
    orphanFavoritePhotoCount = 0,
    orphanTaxonomyKeywordPhotoCount = 0,
    orphanLocationTimeKeywordPhotoCount = 0,
    multipleFavoriteTaxonCount = 0,
    multipleFavoritePhotoCount = 0,
  }

  for chunkStart = 1, #photos, READ_CHUNK_SIZE do
    local chunkEnd = math.min(chunkStart + READ_CHUNK_SIZE - 1, #photos)
    local chunk = {}
    for index = chunkStart, chunkEnd do
      table.insert(chunk, photos[index])
    end
    local valuesByPhoto = {}
    local rawValuesByPhoto = {}
    catalog:withReadAccessDo(function()
      valuesByPhoto = catalog:batchGetPropertyForPlugin(chunk, _PLUGIN, FIELD_IDS)
      rawValuesByPhoto = catalog:batchGetRawMetadata(chunk, { "keywords" })
    end)
    for _, photo in ipairs(chunk) do
      local values = valuesByPhoto[photo] or {}
      local rawKeywords = (rawValuesByPhoto[photo] or {}).keywords or {}
      local masterTaxonId = cleanText(values.masterTaxonId)
      local locationAssigned = hasLocationTimeAssignment(values)
      local hasTaxonomyKeyword = false
      local hasLocationTimeKeyword = false
      for key, value in pairs(rawKeywords) do
        if KeywordWriter.hasManagedKeywordSuffix(key)
            or KeywordWriter.hasManagedKeywordSuffix(value) then
          hasTaxonomyKeyword = true
        end
        if LocationTimeWriter.hasManagedKeywordSuffix(key)
            or LocationTimeWriter.hasManagedKeywordSuffix(value) then
          hasLocationTimeKeyword = true
        end
      end
      if not isMasterTaxonId(masterTaxonId) and hasTaxonomyKeyword then
        state.orphanTaxonomyKeywordPhotoCount = state.orphanTaxonomyKeywordPhotoCount + 1
      end
      if not locationAssigned and hasLocationTimeKeyword then
        state.orphanLocationTimeKeywordPhotoCount =
          state.orphanLocationTimeKeywordPhotoCount + 1
      end
      if locationAssigned then
        state.locationTimePhotoCount = state.locationTimePhotoCount + 1
      end
      if isMasterTaxonId(masterTaxonId) then
        local group = state.taxonomyGroups[masterTaxonId]
        if not group then
          group = {
            masterTaxonId = masterTaxonId,
            photos = {},
            locationAssignedPhotos = {},
            referenceImageCount = 0,
          }
          state.taxonomyGroups[masterTaxonId] = group
          table.insert(state.taxonomyIds, masterTaxonId)
        end
        table.insert(group.photos, photo)
        if locationAssigned then
          group.locationAssignedPhotos[photo] = true
        end
        if cleanText(values.referenceImage) == "yes" then
          group.referenceImageCount = group.referenceImageCount + 1
        end
        state.taxonomyPhotoCount = state.taxonomyPhotoCount + 1
      else
        if masterTaxonId ~= "" then
          state.invalidTaxonomyPhotoCount = state.invalidTaxonomyPhotoCount + 1
        end
        if cleanText(values.referenceImage) == "yes" then
          state.orphanFavoritePhotoCount = state.orphanFavoritePhotoCount + 1
        end
        if locationAssigned then
          appendUniquePhoto(state.locationOnlyPhotos, state.locationOnlySeen, photo)
        end
      end
    end
    if callbacks.progress then
      local instruction = callbacks.progress(chunkEnd, #photos, "Kataloganalyse")
      if instruction == "cancel" then
        return nil, "canceled"
      end
    end
  end
  table.sort(state.taxonomyIds)
  for _, masterTaxonId in ipairs(state.taxonomyIds) do
    local referenceCount = state.taxonomyGroups[masterTaxonId].referenceImageCount
    if referenceCount > 1 then
      state.multipleFavoriteTaxonCount = state.multipleFavoriteTaxonCount + 1
      state.multipleFavoritePhotoCount = state.multipleFavoritePhotoCount + referenceCount
    end
  end
  return state, nil
end

local function resolveTaxonomyGroups(state)
  state.resolvedGroups = {}
  state.resolvedTaxonomyPhotoCount = 0
  state.unresolvedTaxonomyPhotoCount = 0
  state.unresolvedMasterTaxonIds = {}
  if #state.taxonomyIds == 0 then
    state.searchPackage = TaxonomyHelper.searchPackageStatus()
    return state
  end

  local response = TaxonomyHelper.request({
    command = "taxa",
    masterTaxonIds = state.taxonomyIds,
  })
  local taxaById = {}
  for _, taxon in ipairs(response.taxa or {}) do
    taxaById[cleanText(taxon.masterTaxonId)] = taxon
  end
  state.searchPackage = response.searchPackage or {}

  for _, masterTaxonId in ipairs(state.taxonomyIds) do
    local group = state.taxonomyGroups[masterTaxonId]
    local taxon = taxaById[masterTaxonId]
    if taxon and cleanText(taxon.lifecycleState) == "active" then
      group.taxon = taxon
      table.insert(state.resolvedGroups, group)
      state.resolvedTaxonomyPhotoCount = state.resolvedTaxonomyPhotoCount + #group.photos
    else
      table.insert(state.unresolvedMasterTaxonIds, masterTaxonId)
      state.unresolvedTaxonomyPhotoCount = state.unresolvedTaxonomyPhotoCount + #group.photos
      for _, photo in ipairs(group.photos) do
        if group.locationAssignedPhotos[photo] then
          appendUniquePhoto(state.locationOnlyPhotos, state.locationOnlySeen, photo)
        end
      end
    end
  end
  state.locationOnlySeen = nil
  return state
end

local function packageMatches(expected)
  expected = expected or {}
  local current = TaxonomyHelper.searchPackageStatus()
  return cleanText(current.packageId) == cleanText(expected.packageId)
    and cleanText(current.masterVersion) == cleanText(expected.masterVersion)
    and cleanText(current.correctionRevision) == cleanText(expected.correctionRevision)
end

local function percentText(current, total)
  current = tonumber(current or 0) or 0
  total = tonumber(total or 0) or 0
  local percent = total > 0 and math.floor((current / total) * 1000 + 0.5) / 10 or 100
  return tostring(current) .. " von " .. tostring(total) .. " Fotos · "
    .. string.gsub(string.format("%.1f", percent), "%.", ",") .. " %"
end

local function previewText(state)
  local lines = {
    "Katalog: " .. tostring(state.totalPhotos) .. " Fotos",
    "Aktualisierbare Taxonomie: " .. tostring(state.resolvedTaxonomyPhotoCount)
      .. " Fotos in " .. tostring(#state.resolvedGroups) .. " Taxa",
    "Eigenständige FN-Orts-/Zeitdaten: " .. tostring(#state.locationOnlyPhotos) .. " Fotos",
  }
  if state.unresolvedTaxonomyPhotoCount > 0 then
    table.insert(lines, "Übersprungene unbekannte/veraltete Master-IDs: "
      .. tostring(state.unresolvedTaxonomyPhotoCount) .. " Fotos in "
      .. tostring(#state.unresolvedMasterTaxonIds) .. " Taxa")
  end
  if state.invalidTaxonomyPhotoCount > 0 then
    table.insert(lines, "Ungültige Master-ID: "
      .. tostring(state.invalidTaxonomyPhotoCount) .. " Fotos")
  end
  if state.multipleFavoriteTaxonCount > 0 then
    table.insert(lines, "Mehrere Art-Favoriten: "
      .. tostring(state.multipleFavoritePhotoCount) .. " Fotos in "
      .. tostring(state.multipleFavoriteTaxonCount) .. " Taxa (werden nicht automatisch geändert)")
  end
  if state.orphanFavoritePhotoCount > 0 then
    table.insert(lines, "Art-Favorit ohne gültige Master-ID: "
      .. tostring(state.orphanFavoritePhotoCount) .. " Fotos (wird nicht automatisch geändert)")
  end
  if state.orphanTaxonomyKeywordPhotoCount > 0
      or state.orphanLocationTimeKeywordPhotoCount > 0 then
    table.insert(lines, "Verwaiste FN-Stichwörter ohne zugehörige Plug-in-Metadaten: "
      .. tostring(state.orphanTaxonomyKeywordPhotoCount) .. " Taxonomie-Fotos, "
      .. tostring(state.orphanLocationTimeKeywordPhotoCount) .. " Orts-/Zeit-Fotos "
      .. "(werden nur mit „Alle FN-Daten entfernen“ bereinigt)")
  end
  table.insert(lines, "")
  table.insert(lines, "Es werden nur Datensätze mit unverändert auflösbarer Master-ID automatisch aktualisiert.")
  table.insert(lines, "Manuelle Stichwörter und nicht auflösbare Taxonomien bleiben erhalten.")
  return table.concat(lines, "\n")
end

local function chunkFor(values, firstIndex)
  local chunk = {}
  local lastIndex = math.min(firstIndex + WRITE_CHUNK_SIZE - 1, #values)
  for index = firstIndex, lastIndex do
    table.insert(chunk, values[index])
  end
  return chunk, lastIndex
end

local function plansForPhotos(photos, plansByPhoto)
  local plans = {}
  for index, photo in ipairs(photos) do
    plans[index] = plansByPhoto[photo]
  end
  return plans
end

local function errorSummary(errors)
  local lines = {}
  for index = 1, math.min(#errors, 6) do
    table.insert(lines, "• " .. tostring(errors[index]))
  end
  if #errors > 6 then
    table.insert(lines, "• … und " .. tostring(#errors - 6) .. " weitere Fehler")
  end
  return table.concat(lines, "\n")
end

local function applyUpdate(catalog, state, callbacks)
  callbacks = callbacks or {}
  if #state.resolvedGroups > 0 and not packageMatches(state.searchPackage) then
    return {
      status = "package-changed",
      error = "Das aktive Taxonomie-Suchpaket hat sich seit der Vorschau geändert. Bitte den Lauf neu starten.",
    }
  end

  local targetPhotos = {}
  local targetSeen = {}
  for _, group in ipairs(state.resolvedGroups) do
    for _, photo in ipairs(group.photos) do
      appendUniquePhoto(targetPhotos, targetSeen, photo)
    end
  end
  for _, photo in ipairs(state.locationOnlyPhotos) do
    appendUniquePhoto(targetPhotos, targetSeen, photo)
  end

  local plans, preparation = LocationTimeWriter.prepare(catalog, targetPhotos, {
    resolveSuggestedLocations = true,
    progress = function(current, total, phase)
      if callbacks.preparationProgress then
        return callbacks.preparationProgress(current, total, phase)
      end
      return nil
    end,
    beforeSuggestions = callbacks.beforeSuggestions,
  })
  if preparation and preparation.canceled then
    return { status = "canceled", changedPhotoCount = 0 }
  end
  local plansByPhoto = {}
  for index, photo in ipairs(targetPhotos) do
    plansByPhoto[photo] = plans[index]
  end

  local result = {
    status = "complete",
    targetPhotoCount = #targetPhotos,
    processedPhotoCount = 0,
    updatedTaxonomyPhotoCount = 0,
    updatedLocationTimePhotoCount = 0,
    failedPhotoCount = 0,
    errors = {},
    suggestedLocationPhotoCount = preparation and preparation.suggestedLocationPhotoCount or 0,
    unresolvedSuggestedLocationPhotoCount = preparation
      and preparation.unresolvedSuggestedLocationPhotoCount or 0,
  }

  local function afterBlock(processed)
    result.processedPhotoCount = processed
    if callbacks.applyProgress then
      return callbacks.applyProgress(processed, #targetPhotos)
    end
    return nil
  end

  for _, group in ipairs(state.resolvedGroups) do
    if not packageMatches(state.searchPackage) then
      result.status = "package-changed"
      result.error = "Das aktive Taxonomie-Suchpaket wurde während des Laufs geändert. Der aktuelle Block wurde nicht begonnen."
      return result
    end
    local firstIndex = 1
    while firstIndex <= #group.photos do
      local chunk, lastIndex = chunkFor(group.photos, firstIndex)
      local ok, updateResult = LrTasks.pcall(
        KeywordWriter.assign,
        catalog,
        chunk,
        group.taxon,
        plansForPhotos(chunk, plansByPhoto),
        { locationTimeMode = "update" }
      )
      if ok then
        result.updatedTaxonomyPhotoCount = result.updatedTaxonomyPhotoCount + #chunk
      else
        result.failedPhotoCount = result.failedPhotoCount + #chunk
        table.insert(result.errors, cleanText(group.taxon.germanName)
          .. " (" .. cleanText(group.taxon.acceptedScientificName) .. "): "
          .. tostring(updateResult))
      end
      local instruction = afterBlock(result.processedPhotoCount + #chunk)
      if instruction == "cancel" then
        result.status = "paused"
        return result
      end
      firstIndex = lastIndex + 1
    end
  end

  local firstIndex = 1
  while firstIndex <= #state.locationOnlyPhotos do
    local chunk, lastIndex = chunkFor(state.locationOnlyPhotos, firstIndex)
    local ok, updateResult = LrTasks.pcall(
      LocationTimeWriter.execute,
      catalog,
      chunk,
      "update",
      { protectedNamesForPhoto = KeywordWriter.taxonomyKeywordNameSet },
      plansForPhotos(chunk, plansByPhoto)
    )
    if ok then
      result.updatedLocationTimePhotoCount = result.updatedLocationTimePhotoCount
        + tonumber(updateResult.changedPhotoCount or 0)
    else
      result.failedPhotoCount = result.failedPhotoCount + #chunk
      table.insert(result.errors, "Orts-/Zeitblock ab Foto " .. tostring(firstIndex)
        .. ": " .. tostring(updateResult))
    end
    local instruction = afterBlock(result.processedPhotoCount + #chunk)
    if instruction == "cancel" then
      result.status = "paused"
      return result
    end
    firstIndex = lastIndex + 1
  end
  return result
end

local function completionText(state, result)
  local lines = {
    "Taxonomie aktualisiert: " .. tostring(result.updatedTaxonomyPhotoCount or 0) .. " Fotos",
    "Eigenständige Orts-/Zeitdaten aktualisiert: "
      .. tostring(result.updatedLocationTimePhotoCount or 0) .. " Fotos",
    "Nicht auflösbare Taxonomie übersprungen: "
      .. tostring(state.unresolvedTaxonomyPhotoCount or 0) .. " Fotos",
    "Fehlgeschlagen: " .. tostring(result.failedPhotoCount or 0) .. " Fotos",
  }
  if (result.unresolvedSuggestedLocationPhotoCount or 0) > 0 then
    table.insert(lines, "GPS-Ortsvorschläge ohne verwertbares Ergebnis: "
      .. tostring(result.unresolvedSuggestedLocationPhotoCount) .. " Fotos")
  end
  if #(result.errors or {}) > 0 then
    table.insert(lines, "")
    table.insert(lines, errorSummary(result.errors))
  end
  return table.concat(lines, "\n")
end

function CatalogMaintenance.show(catalog)
  return LrFunctionContext.callWithContext("FN Wildlife Katalogpflege", function(context)
    local factory = LrView.osFactory()
    local props = LrBinding.makePropertyTable(context)
    local dialogControls = nil
    local windowClosed = false
    local pauseRequested = false
    local running = false
    local phase = "scan"
    local scanState = nil

    props.status = "Der Katalog wird auf bekannte FN-Daten geprüft."
    props.progress = "Noch keine Fotos geprüft."
    props.details = "Es werden zunächst keine Fotos verändert."
    props.pauseTitle = "Pausieren"
    props.pauseEnabled = true
    props.applyEnabled = false

    local function setProps(values)
      if windowClosed then
        return
      end
      for key, value in pairs(values) do
        props[key] = value
      end
    end

    local function waitForControl()
      LrTasks.yield()
      while pauseRequested and not windowClosed do
        LrTasks.sleep(0.2)
      end
      return windowClosed and "cancel" or nil
    end

    local function fail(message)
      running = false
      phase = "failed"
      setProps({
        status = "Katalogpflege fehlgeschlagen.",
        details = tostring(message),
        pauseEnabled = false,
        applyEnabled = false,
      })
    end

    local function startScan()
      if running then
        return
      end
      running = true
      LrTasks.startAsyncTask(function()
        local ok, stateOrError = LrTasks.pcall(function()
          local state, scanError = scanCatalog(catalog, {
            progress = function(current, total)
              setProps({ progress = percentText(current, total) })
              return waitForControl()
            end,
          })
          if not state then
            return nil, scanError
          end
          setProps({ status = "Master-Taxa werden gebündelt im aktiven Suchpaket geprüft." })
          return resolveTaxonomyGroups(state), nil
        end)
        running = false
        if not ok then
          fail(stateOrError)
          return
        end
        local state = stateOrError
        if not state or windowClosed then
          return
        end
        scanState = state
        phase = "preview"
        setProps({
          status = "Vorschau vollständig. Noch wurden keine Fotos verändert.",
          progress = percentText(state.totalPhotos, state.totalPhotos),
          details = previewText(state),
          pauseEnabled = false,
          applyEnabled = state.resolvedTaxonomyPhotoCount > 0 or #state.locationOnlyPhotos > 0,
        })
      end)
    end

    local function startApply()
      if running or phase ~= "preview" or not scanState then
        return
      end
      running = true
      phase = "apply"
      pauseRequested = false
      setProps({
        status = "FN-Daten werden vorbereitet.",
        progress = "Quelldaten werden gelesen ...",
        details = "Nur vollständig abgeschlossene 250-Foto-Blöcke werden gespeichert.",
        pauseEnabled = true,
        pauseTitle = "Pausieren",
        applyEnabled = false,
      })
      LrTasks.startAsyncTask(function()
        local ok, result = LrTasks.pcall(applyUpdate, catalog, scanState, {
          preparationProgress = function(current, total)
            setProps({
              status = "Orts-, Zeit- und Taxonomiedaten werden vorbereitet.",
              progress = percentText(current, total),
            })
            return waitForControl()
          end,
          beforeSuggestions = function(count)
            setProps({
              status = "Lightroom-Ortsvorschläge werden einmal gebündelt übernommen.",
              details = tostring(count) .. " Fotos mit GPS, aber ohne gespeicherte Ortsfelder. "
                .. "Während des Lightroom-Exports greift eine Pause nach Abschluss dieses Exports.",
            })
          end,
          applyProgress = function(current, total)
            setProps({
              status = "FN-Daten werden blockweise aktualisiert.",
              progress = percentText(current, total),
            })
            return waitForControl()
          end,
        })
        running = false
        if not ok then
          fail(result)
          return
        end
        if windowClosed then
          return
        end
        if result.status == "package-changed" then
          fail(result.error)
          return
        end
        if result.status == "canceled" then
          phase = "preview"
          setProps({
            status = "Die Übernahme der Lightroom-Ortsvorschläge wurde abgebrochen.",
            details = "Es wurden noch keine FN-Daten verändert.",
            pauseEnabled = false,
            applyEnabled = true,
          })
          return
        end
        phase = result.status == "paused" and "paused" or "complete"
        setProps({
          status = result.status == "paused"
              and "Der Lauf wurde nach dem zuletzt abgeschlossenen Block beendet."
            or "FN-Daten im Katalog wurden aktualisiert.",
          progress = percentText(result.processedPhotoCount, result.targetPhotoCount),
          details = completionText(scanState, result),
          pauseEnabled = false,
          applyEnabled = result.status == "paused",
        })
        if result.status == "paused" then
          phase = "preview"
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
        width_in_chars = 82,
        fill_horizontal = 1,
      }),
      factory:static_text({
        title = bind("progress"),
        font = "<system/bold>",
        fill_horizontal = 1,
      }),
      factory:group_box({
        title = "Vorschau und Ergebnis",
        fill_horizontal = 1,
        factory:static_text({
          title = bind("details"),
          width_in_chars = 82,
          height_in_lines = 10,
          fill_horizontal = 1,
        }),
      }),
      factory:row({
        fill_horizontal = 1,
        factory:push_button({
          title = bind("pauseTitle"),
          enabled = bind("pauseEnabled"),
          action = function()
            pauseRequested = not pauseRequested
            setProps({
              pauseTitle = pauseRequested and "Fortsetzen" or "Pausieren",
              status = pauseRequested
                  and "Pause wird nach dem aktuellen Lese- oder Schreibblock wirksam."
                or (phase == "scan"
                    and "Der Katalog wird weiter geprüft."
                  or "FN-Daten werden weiter aktualisiert."),
            })
          end,
        }),
        factory:push_button({
          title = "Vorschau übernehmen",
          enabled = bind("applyEnabled"),
          action = startApply,
        }),
        factory:spacer({ fill_horizontal = 1 }),
        factory:push_button({
          title = "Schließen",
          action = function()
            windowClosed = true
            pauseRequested = false
            if dialogControls then
              dialogControls:close()
            end
          end,
        }),
      }),
    })

    LrDialogs.presentFloatingDialog(_PLUGIN, {
      title = "FN Wildlife – FN-Daten im Katalog aktualisieren",
      contents = contents,
      blockTask = true,
      resizable = false,
      save_frame = "fnWildlifeCatalogMaintenanceV1",
      onShow = function(controls)
        dialogControls = controls
        startScan()
      end,
      windowWillClose = function()
        windowClosed = true
        pauseRequested = false
        dialogControls = nil
      end,
    })
  end)
end

return CatalogMaintenance
