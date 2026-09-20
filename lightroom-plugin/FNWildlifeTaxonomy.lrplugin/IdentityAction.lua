local LrTasks = import "LrTasks"
local LrUUID = import "LrUUID"
local Workflow = require "IdentityWorkflow"
local Catalog = require "IdentityCatalog"
local View = require "IdentityView"
local Action = {}
local running = false

local function count(run, state)
  local result = 0
  for _, photo in ipairs(run.photos) do if photo.state == state then result = result + 1 end end
  return result
end

local function taxonLabel(taxon)
  local german = taxon.germanName or ""
  local scientific = taxon.scientificName or taxon.acceptedScientificName or ""
  return german ~= "" and (german .. " · " .. scientific) or scientific
end

local function paused(input)
  View.message("Artänderung pausiert", "Abgeschlossene Blöcke bleiben gespeichert. Unter „Artänderungen prüfen ...“ → „Protokollierte Läufe“ fortsetzen.\nLauf: " .. input.runId)
end

local function process(catalog, input)
  local changed = 0
  while true do
    local result, canceled = View.work("FN Artänderung · " .. changed .. " Fotos in diesem Durchlauf gespeichert", function(progress)
      return Workflow.applyNext(catalog, input, progress)
    end)
    if result then
      changed = changed + result.changedPhotoCount
      if result.done then
        View.message("Artänderung abgeschlossen", (input.direction == "undo" and "Zurückgenommen: " or "Geändert: ") .. View.photos(changed)
          .. " Bereits zuvor abgeschlossene Blöcke sind im Laufprotokoll enthalten.")
        return
      end
    end
    if canceled then paused(input); return end
    LrTasks.yield()
  end
end

local function selection(catalog)
  local photos = catalog:getTargetPhotos() or {}
  assert(#photos > 0 and #photos <= 10000, "Bitte 1 bis 10.000 Fotos für die Prüfung auswählen.")
  local selected, selectedCount = {}, 0
  for _, photo in ipairs(photos) do
    local id = photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId")
    if id and id ~= "" then
      local uuid = photo:getRawMetadata("uuid")
      assert(type(uuid) == "string" and uuid ~= "", "Foto-UUID fehlt.")
      selected[uuid] = true; selectedCount = selectedCount + 1
    end
  end
  if selectedCount == 0 then View.message("Keine zugewiesene Taxonomie", "Die Auswahl enthält keine FN-Taxonomie. Es wurde nichts geändert."); return end
  if not View.confirm("Auswahl auf Artänderungen prüfen?", "Prüfung: " .. View.photos(selectedCount) .. " mit FN-Taxonomie. "
    .. "Unberührt: " .. View.photos(#photos - selectedCount) .. " ohne FN-Taxonomie.\nFür Art-Favoriten werden die FN-Grundfelder im gesamten Katalog gelesen; noch wird nichts geschrieben.", "Prüfen") then return end
  local input = { catalogKey = Catalog.key(catalog), selectedUuids = selected, choices = {}, favoriteDecisions = {} }
  local function preview()
    local result, canceled = View.work("FN Artänderungen prüfen", function(progress) return Workflow.preview(catalog, input, progress) end)
    if not result and canceled then View.message("Prüfung abgebrochen", "Es wurde kein Foto geändert. Die Auswahl kann später erneut geprüft werden.") end
    return result
  end
  local initial = preview()
  if not initial then return end
  for _, case in ipairs(initial.cases) do
    if #case.targets > 0 then
      local options = { { title = "Diese Art später entscheiden – Fotos unverändert lassen", value = "skip" } }
      for _, target in ipairs(case.targets) do table.insert(options, { title = taxonLabel(target), value = target.masterTaxonId }) end
      local old = case.photos[1]
      local choice = View.choose("Nachfolger ausdrücklich wählen", taxonLabel(old) .. "\n" .. View.photos(#case.photos) .. " aus der Auswahl.\n"
        .. (case.containsSplit and "Die Art wurde aufgeteilt. Die passende neue Art muss für diese Fotos bekannt sein.\n" or "Bestätigte Änderung der Artidentität.\n")
        .. "Die Wahl gilt nur für diese ausgewählten Fotos, nicht für alle Fotos dieser Art.", options, "Vormerken")
      if not choice then return end
      if choice ~= "skip" then table.insert(input.choices, { sourceMasterTaxonId = old.masterTaxonId, targetMasterTaxonId = choice }) end
    end
  end
  if #input.choices == 0 then View.message("Keine Artänderung vorgemerkt", "Kein Nachfolger gewählt oder kein bestätigter Nachfolger vorhanden. Die Fotos bleiben unverändert."); return end
  local plan = preview()
  if not plan then return end
  for _, conflict in ipairs(plan.favoriteConflicts) do
    local options = {}
    local targetLabel = conflict.targetMasterTaxonId
    for _, case in ipairs(plan.cases) do
      for _, target in ipairs(case.targets) do
        if target.masterTaxonId == conflict.targetMasterTaxonId then targetLabel = taxonLabel(target) end
      end
    end
    for _, uuid in ipairs(conflict.photoUuids) do table.insert(options, { title = View.photoLabel(catalog, uuid), value = uuid }) end
    local winner = View.choose("Art-Favoritenkonflikt", targetLabel .. "\nMehrere Favoriten würden derselben Nachfolgeart zugeordnet.\nWelches Foto soll ihr Art-Favorit bleiben?\nAndere Favoriten dieser Zielart werden abgewählt, gegebenenfalls auch außerhalb der Auswahl.", options, "Favorit vormerken")
    if not winner then return end
    table.insert(input.favoriteDecisions, { targetMasterTaxonId = conflict.targetMasterTaxonId, photoUuid = winner })
  end
  if #plan.favoriteConflicts > 0 then plan = preview(); if not plan then return end end
  assert(plan.ready, "Die Vorschau ist nicht vollständig bestätigt oder enthält Konflikte.")
  local demotions = 0
  for _, effect in ipairs(plan.favoriteEffects) do if effect.changesFavorite then demotions = demotions + 1 end end
  if not View.confirm("Vorgemerkte Artänderungen übernehmen?", "Übertragung auf die ausdrücklich gewählten Nachfolger: " .. View.photos(#plan.transfers) .. ".\n"
    .. "Unverändert: " .. View.photos(plan.skippedPhotoCount) .. ". Entfernte Favoritenmarkierungen: " .. demotions .. ".\n"
    .. "Ort/Zeit und fremde Stichwörter bleiben erhalten. Bitte vorher den Lightroom-Katalog sichern.\n"
    .. "Ein Rücknahmeprotokoll wird gespeichert. Nach einem Vorbereitungsabbruch können leere neue FN-Stichwörter bestehen bleiben.", "Übernehmen") then return end
  input.runId = LrUUID.generateUUID()
  input.confirmed = true; input.token = plan.token; input.direction = "apply"
  local prepared, canceled = View.work("FN Artänderung vorbereiten", function(progress) return Workflow.prepare(catalog, input, progress) end)
  if not prepared then
    if canceled then View.message("Vorbereitung abgebrochen", "Kein Foto wurde geändert. Leere neu vorbereitete FN-Stichwörter können bestehen bleiben.") end
    return
  end
  if canceled then paused(input); return end
  process(catalog, input)
end

local function history(catalog)
  local input = { catalogKey = Catalog.key(catalog) }
  local rows = Workflow.journal(catalog, input, "list").runs
  local items, runs = {}, {}
  local labels = { prepared = "offen", applied = "angewendet", ["not-applied"] = "nicht angewendet",
    ["undo-prepared"] = "Rücknahme offen", reverted = "zurückgenommen" }
  for _, row in ipairs(rows) do
    if not runs[row.runId] then
      local item = { title = row.createdAt .. " · " .. row.runId, value = row.runId }
      runs[row.runId] = item; table.insert(items, item)
    end
    runs[row.runId].title = runs[row.runId].title .. " · " .. row.photoCount .. " " .. (labels[row.state] or row.state)
  end
  if #items == 0 then View.message("Keine protokollierten Artänderungen", "Für diesen Lightroom-Katalog sind noch keine Läufe gespeichert."); return end
  input.runId = View.choose("Protokollierte Läufe", "Lauf auswählen. Zeitangaben sind UTC.\nEs werden noch keine Fotos gelesen oder geändert.", items)
  if not input.runId then return end
  local run = Workflow.journal(catalog, input, "read").run
  local operation = View.choose("Artänderung prüfen", count(run, "applied") .. " angewendet · " .. count(run, "prepared") .. " offen · "
    .. count(run, "undo-prepared") .. " Rücknahmen offen · " .. count(run, "reverted") .. " zurückgenommen.\n"
    .. "Fortsetzen und Rücknahme lesen die betroffenen Fotos sowie die aktuellen Katalog-Favoriten erneut.", {
    { title = "Unterbrochenen Lauf prüfen und fortsetzen", value = "resume" },
    { title = "Nicht ausgeführte Schritte beenden (Gespeichertes bleibt)", value = "abandon" },
    { title = "Angewendete Änderungen gezielt zurücknehmen", value = "undo" },
  })
  if not operation then return end
  local function review(mode)
    local result, canceled = View.work("FN Laufprotokoll prüfen", function(progress) return Workflow.reviewRun(catalog, input, mode, progress) end)
    if not result and canceled then View.message("Laufprüfung pausiert", "Es wurde keine weitere Fotoänderung gestartet. Das Protokoll bleibt erhalten.") end
    return result, canceled
  end
  input.confirmed = true
  if operation == "undo" then
    if count(run, "prepared") > 0 or count(run, "undo-prepared") > 0 then
      View.message("Zuerst den offenen Lauf prüfen", "Bitte die offene Übernahme oder Rücknahme zunächst fortsetzen oder die nicht ausgeführten Schritte beenden. Bereits geänderte Fotos bleiben rücknehmbar."); return
    end
    local preview = review("undo-preview")
    if not preview or not View.conflicts(catalog, preview.conflicts) then return end
    if #preview.eligible == 0 then View.message("Keine sichere Rücknahme möglich", "Es sind keine unverändert rücknehmbaren Fotos vorhanden. Gelöschte Altstichwörter werden nicht wiederhergestellt."); return end
    if not View.confirm("Artänderung zurücknehmen?", "Rücknahme auf den protokollierten FN-Taxonomiestand: " .. View.photos(#preview.eligible) .. ".\n"
      .. #preview.conflicts .. " Konfliktfotos bleiben unverändert. Ort/Zeit und fremde Stichwörter bleiben erhalten.", "Zurücknehmen") then return end
    input.token = preview.token
    local prepared, canceled = review("undo-prepare")
    if not prepared then return end
    if canceled then paused(input); return end
    input.direction = "undo"
  else
    input.abandonPending = operation == "abandon"
    local preview = review("recovery-preview")
    if not preview or not View.conflicts(catalog, preview.conflicts) then return end
    if not View.confirm("Gelesenen Laufstand bestätigen?", #preview.effects .. " vorbereitete Fotozustände sind eindeutig lesbar. "
      .. #preview.conflicts .. " bleiben ungeklärt.\n" .. (input.abandonPending
        and "Nicht ausgeführte Schritte werden im Protokoll beendet. Bereits gespeicherte Fotoänderungen bleiben bestehen."
        or "Bereits gespeicherte Ergebnisse werden im Protokoll bestätigt; unveränderte Fotos bleiben für die Fortsetzung vorbereitet.")
      .. "\nDieser Schritt ändert keine Fotos.", "Protokoll bestätigen") then return end
    input.token = preview.token
    local result, canceled = review("recovery-confirm")
    if not result then return end
    if operation == "abandon" or #result.conflicts > 0 then View.message("Laufprotokoll geprüft", "Eindeutig gelesene Zustände wurden protokolliert. " .. #result.conflicts .. " Fotos bleiben ungeklärt. Es wurde kein Foto geändert."); return end
    if canceled then paused(input); return end
    run = result.run
    local undo = count(run, "undo-prepared")
    local remaining = undo > 0 and undo or count(run, "prepared")
    if remaining == 0 then View.message("Lauf bereits abgeschlossen", "Keine vorbereiteten Fotoänderungen mehr vorhanden."); return end
    input.direction = undo > 0 and "undo" or "apply"
    if not View.confirm("Lauf fortsetzen?", (undo > 0 and "Rücknahme: " or "Übernahme: ") .. View.photos(remaining)
      .. ". Bereits abgeschlossene Fotos werden nicht erneut geschrieben.", "Fortsetzen") then return end
  end
  process(catalog, input)
end

function Action.run(catalog)
  if running then View.message("Artänderung bereits geöffnet", "Bitte den bestehenden FN-Artänderungsdialog verwenden."); return end
  running = true
  local ok, message = LrTasks.pcall(function()
    local action = View.choose("Artänderungen prüfen", "Nur bestätigte Aufteilungen oder Zusammenführungen aus der Masterdatenbank.\n"
      .. "Eine reine Namensänderung benötigt diese Aktion nicht.\nEs startet kein Kataloglauf, bevor du eine Aktion bestätigst.", {
      { title = "Aktuelle Fotoauswahl auf Nachfolger prüfen", value = "selection" },
      { title = "Protokollierte Läufe – Fortsetzen oder Rücknahme", value = "history" },
    })
    if action == "selection" then selection(catalog) elseif action == "history" then history(catalog) end
  end)
  running = false
  if not ok then View.message("Artänderung angehalten", tostring(message)
    .. "\nBereits gespeicherte Blöcke bleiben erhalten. Vor einem erneuten Schreibversuch bitte den protokollierten Lauf prüfen.", "warning") end
end

return Action
