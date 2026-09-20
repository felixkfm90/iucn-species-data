local LrTasks = import "LrTasks"
local Helper = require "TaxonomyHelper"
local Catalog = require "IdentityCatalog"
local Writer = require "IdentityWriter"
local Snapshot = require "IdentitySnapshot"
local Json = require "Json"
local IdentityWorkflow = {}
local active = {}
local ARRAYS = { snapshots = true, observed = true, inventoryRows = true, keywords = true,
  changes = true, choices = true, favoriteDecisions = true, availableKeywords = true }

local function transport(value, key)
  if type(value) ~= "table" or value == Json.null then return value end
  local copy = {}
  for childKey, child in pairs(value) do copy[childKey] = transport(child, childKey) end
  if ARRAYS[key] then return Json.array(copy) end
  return copy
end

local function checkCatalog(catalog, input)
  assert(input.catalogKey == Catalog.key(catalog), "Die Vorschau gehört zu einem anderen Lightroom-Katalog.")
end

local function exclusive(catalog, action)
  assert(not active[catalog], "Eine FN-Artänderung läuft bereits für diesen Katalog.")
  active[catalog] = true
  local ok, result = LrTasks.pcall(action)
  active[catalog] = nil
  if not ok then error(result, 0) end
  return result
end

local function request(command, input)
  local payload = {}
  for key, value in pairs(input) do payload[key] = value end
  payload.command = "photo-identity-" .. command
  payload.writerIdle = true -- helper calls are only outside Writer transactions
  return Helper.request(transport(payload))
end

local function readInput(input, read)
  local result = {}
  for key, value in pairs(input) do result[key] = value end
  result.inventoryRows = read.inventoryRows
  result.observed = read.observed
  return result
end

local function selectedInput(input, read)
  local result = readInput(input, read)
  result.snapshots = {}
  for uuid in pairs(input.selectedUuids) do
    assert(read.byUuid[uuid], "Ein ausgewähltes Foto fehlt oder besitzt keine FN-Taxonomie.")
    table.insert(result.snapshots, read.byUuid[uuid])
  end
  result.selectedUuids = nil
  return result
end

local function runInput(catalog, input, progress, withKeywords)
  local run = request("read", input).run
  local wanted = {}
  for _, photo in ipairs(run.photos) do wanted[photo.photoUuid] = true end
  local read = Catalog.read(catalog, wanted, progress)
  local result = readInput(input, read)
  if withKeywords then
    result.availableKeywords = {}
    local seen = {}
    for _, photo in ipairs(run.photos) do
      for _, entry in ipairs(photo.before.keywords) do
        if not seen[entry.id] then
          seen[entry.id] = true
          local ok, name = LrTasks.pcall(function()
            local keyword = catalog:getKeywordByLocalIdentifier(entry.id)
            return keyword and keyword:getName() or nil
          end)
          if ok and name then table.insert(result.availableKeywords, { id = entry.id, name = name }) end
        end
      end
    end
  end
  return result, read, run
end

-- Every confirmation rereads photos and keyword availability; never reuse the
-- dialog's old readback. These operations alter only the separate journal.
function IdentityWorkflow.reviewRun(catalog, input, operation, progress)
  checkCatalog(catalog, input)
  assert(operation == "recovery-preview" or operation == "recovery-confirm"
    or operation == "undo-preview" or operation == "undo-prepare", "Unbekannte Journalaktion.")
  if operation == "recovery-confirm" or operation == "undo-prepare" then
    assert(input.confirmed == true, "Die Journalaktion wurde nicht bestätigt.")
  end
  return exclusive(catalog, function()
    local fresh = runInput(catalog, input, progress, operation == "undo-preview" or operation == "undo-prepare")
    return request(operation, fresh)
  end)
end

function IdentityWorkflow.journal(catalog, input, operation)
  checkCatalog(catalog, input)
  assert(operation == "list" or operation == "read", "Unbekannte Journal-Leseaktion.")
  return exclusive(catalog, function() return request(operation, input) end)
end

function IdentityWorkflow.preview(catalog, input, progress)
  checkCatalog(catalog, input)
  return exclusive(catalog, function()
    local read = Catalog.read(catalog, input.selectedUuids, progress)
    return request("plan", selectedInput(input, read))
  end)
end

-- Explicitly confirmed selection only. This prepares exact target keyword IDs
-- and a durable journal; it does not assign any photo. A later failure may leave
-- empty new keywords, but never a photo without its before/after journal.
function IdentityWorkflow.prepare(catalog, input, progress)
  checkCatalog(catalog, input)
  assert(input.confirmed == true, "Die Artänderung wurde nicht bestätigt.")
  return exclusive(catalog, function()
    local read = Catalog.read(catalog, input.selectedUuids, progress)
    local confirmed = request("confirm", selectedInput(input, read))
    local templates = {}
    for _, taxon in ipairs(confirmed.targets) do
      templates[taxon.masterTaxonId] = Writer.prepareTarget(catalog, taxon, function()
        Catalog.guard(catalog, read, confirmed.plan.package)
      end)
    end
    local changes, byUuid = {}, {}
    for _, transfer in ipairs(confirmed.plan.transfers) do
      local before = assert(read.byUuid[transfer.photoUuid])
      local template = assert(templates[transfer.targetMasterTaxonId])
      local after = { photoUuid = before.photoUuid, values = {}, keywords = template.keywords }
      for key, value in pairs(template.values) do after.values[key] = value end
      after.values.referenceImage = before.values.referenceImage
      local change = { before = before, after = after }
      table.insert(changes, change)
      byUuid[before.photoUuid] = change
    end
    for _, effect in ipairs(confirmed.plan.favoriteEffects) do
      local change = byUuid[effect.photoUuid]
      if not change and effect.changesFavorite then
        local before = assert(read.byUuid[effect.photoUuid])
        local after = { photoUuid = before.photoUuid, values = {}, keywords = before.keywords }
        for key, value in pairs(before.values) do after.values[key] = value end
        change = { before = before, after = after }
        table.insert(changes, change)
      end
      if change then change.after.values.referenceImage = effect.referenceImage end
    end
    for _, change in ipairs(changes) do Snapshot.validate(change.after) end
    local fresh = Catalog.read(catalog, input.selectedUuids, progress)
    local preparedInput = selectedInput(input, fresh)
    preparedInput.changes = changes
    local prepared = request("prepare", preparedInput)
    assert(prepared.journalPrepared == true and prepared.run.runId == input.runId, "Dauerhafte Journalvorbereitung nicht bestätigt.")
    return prepared
  end)
end

-- One block only: the future UI may pause between calls. Any error after a
-- successful catalog write (e.g. lost checkpoint response) stops here and must
-- go through recovery. No retry, auto-undo or optimistic success message.
function IdentityWorkflow.applyNext(catalog, input, progress)
  checkCatalog(catalog, input)
  assert(input.confirmed == true, "Die Fortsetzung wurde nicht bestätigt.")
  assert(input.direction == "apply" or input.direction == "undo", "Schreibrichtung fehlt.")
  return exclusive(catalog, function()
    local blockInput, read, run = runInput(catalog, input, progress, false)
    local preview = request("block-preview", blockInput)
    if not preview.ready then return { done = true, changedPhotoCount = 0 } end
    blockInput.token = preview.token
    local block = request("block-confirm", blockInput)
    assert(block.token == preview.token and block.ready, "Schreibblock wurde nicht bestätigt.")
    local observed = Writer.applyBlock(catalog, block.changes, input.direction, function()
      Catalog.guard(catalog, read, input.direction == "apply" and run.plan.package or nil)
    end)
    local completed = request("checkpoint", { catalogKey = input.catalogKey, runId = input.runId,
      observed = observed, mode = input.direction == "undo" and "undo" or "apply" })
    local expected = input.direction == "undo" and "reverted" or "applied"
    local states = {}
    for _, photo in ipairs(completed.run.photos) do states[photo.photoUuid] = photo.state end
    for _, photo in ipairs(observed) do assert(states[photo.photoUuid] == expected, "Journalabschluss unklar. Lauf vor Fortsetzung prüfen.") end
    return { done = block.remainingPhotoCount == 0, changedPhotoCount = #observed, run = completed.run }
  end)
end

return IdentityWorkflow
