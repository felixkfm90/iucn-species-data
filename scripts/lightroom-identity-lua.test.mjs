import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const root = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
function execute(script) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  try {
    assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK, lua.lua_tojsstring(state, -1));
    const status = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
  } finally { lua.lua_close(state); }
}

const modules = (await Promise.all(["Json", "TaxonomyRanks", "MetadataDefinition", "KeywordIdFinalizer", "KeywordWriter", "StatisticsIndex", "Statistics", "IdentitySnapshot", "IdentityWriter", "IdentityCatalog", "IdentityWorkflow"].map(async (name) =>
  `package.preload["${name}"] = function()\n${await fs.readFile(new URL(`${name}.lua`, root), "utf8")}\nend`))).join("\n");
const fixture = `
local originalPcall = pcall
local inTask, inWrite, noYield = false, false, false
local function sdk()
  assert(inTask, "SDK must run inside LrTask")
  assert(not noYield, "Yielding is not allowed within a C or metamethod call")
end
pcall = function(fn, ...)
  local old = noYield; noYield = true
  local results = { originalPcall(fn, ...) }; noYield = old
  return table.unpack(results)
end
local Tasks = { pcall = originalPcall }
function Tasks.yield() sdk(); assert(not inWrite, "Explicit yield within catalog write") end
function Tasks.startAsyncTask(fn)
  assert(not inTask); inTask = true
  local ok, message = originalPcall(fn); inTask = false
  if not ok then error(message) end
end
_PLUGIN = {}
function import(name)
  if name == "LrTasks" then return Tasks end
  if name == "LrDate" then return {} end
  if name == "LrPathUtils" then return { leafName = function(value) return value:match("[^/]+$") end } end
  error(name)
end
local function clone(value)
  if type(value) ~= "table" then return value end
  local result = {}; for key, item in pairs(value) do result[key] = clone(item) end
  return result
end
local stats, statisticsIndex, statisticsDeltas = 0, nil, {}
package.preload.PluginState = function() return { applyStatisticsPhotoChanges = function(catalog, before, after)
  sdk(); assert(inWrite); assert(#before == #after); stats = stats + #after
  table.insert(statisticsDeltas, { before = clone(before), after = clone(after) })
  if statisticsIndex then assert(require("StatisticsIndex").applyChanges(statisticsIndex, before, after)) end
end } end
package.preload.LocationTimeWriter = function() return {} end
${modules}
local Snapshot = require "IdentitySnapshot"
local Writer = require "IdentityWriter"
local KeywordWriter = require "KeywordWriter"
local catalog = { keywords = {}, photos = {}, created = 0, keywordLookups = {} }
function catalog:getPath() sdk(); return "D:/Fotos/Testkatalog.lrcat" end
function catalog:getAllPhotos()
  sdk(); local result = {}; for _, item in pairs(self.photos) do table.insert(result, item) end; return result
end
local function keyword(id, name)
  assert(type(id) == "number" and id >= 1 and id % 1 == 0)
  local value = { localIdentifier = id, name = name }
  function value:getName() sdk(); if inWrite and self.pendingName then return nil end; return self.name end
  catalog.keywords[id] = value; return value
end
local old = keyword(757, "Alte Art (FN)*")
local new = keyword(761, "Neue Art (FN)")
local userKeyword = keyword(765, "Urlaub")
local placeKeyword = keyword(769, "Deutschland (FN Ort)*")
-- Adobe LrCatalog:getKeywordsByLocalId takes numeric localIdentifier values and
-- returns keyword objects, with no positional guarantee for missing IDs.
-- There is deliberately no getKeywordByLocalIdentifier mock.
function catalog:getKeywordsByLocalId(ids)
  sdk(); assert(type(ids) == "table" and #ids > 0)
  table.insert(self.keywordLookups, clone(ids))
  if self.lookupError then error(self.lookupError) end
  local result = {}
  for _, id in ipairs(ids) do
    assert(type(id) == "number" and id >= 1 and id % 1 == 0, "SDK keyword lookup needs numeric local IDs")
    if self.keywords[id] then table.insert(result, 1, self.keywords[id]) end
  end
  return result
end
function catalog:findPhotoByUuid(uuid) sdk(); return self.photos[uuid] end
function catalog:createKeyword(name, synonyms, export, parent, existing)
  sdk(); assert(inWrite and parent == nil and existing == true)
  if self.failCreate then return nil end
  for _, entry in pairs(self.keywords) do if entry.name == name then return entry end end
  self.created = self.created + 1
  local created = keyword(800 + self.created, name)
  if self.delayedKeywordIdentifiers then created.pendingLocalIdentifier = created.localIdentifier; created.localIdentifier = nil end
  created.pendingName = self.delayedKeywordNames
  return created
end
function catalog:withWriteAccessDo(title, callback, options)
  sdk(); assert(not inWrite, "Nested catalog write"); assert(options.timeout == 10)
  if self.busy then return "aborted" end
  if self.beforeLock then self.beforeLock() end
  local backup, previousStats, previousIndex = {}, stats, clone(statisticsIndex)
  for uuid, photo in pairs(self.photos) do backup[uuid] = { values = clone(photo.values), ids = clone(photo.ids) } end
  self.metadataVisibilityBeforeWrite = self.delayedMetadataVisibility and backup or nil
  inWrite = true
  local ok, message = originalPcall(callback)
  inWrite = false
  self.metadataVisibilityBeforeWrite = nil
  if not ok or self.rollbackAfterCallback then
    for uuid, data in pairs(backup) do self.photos[uuid].values = data.values; self.photos[uuid].ids = data.ids end
    stats = previousStats
    statisticsIndex = previousIndex
  end
  if not ok then error(message) end
  for _, entry in pairs(self.keywords) do
    if entry.pendingLocalIdentifier and not self.keepKeywordIdentifiersPending then
      entry.localIdentifier = entry.pendingLocalIdentifier; entry.pendingLocalIdentifier = nil
    end
    entry.pendingName = nil
  end
  if self.afterWriteCommit then self:afterWriteCommit() end
  return "executed"
end
local function makePhoto(uuid)
  local photo = { uuid = uuid, ids = { [757] = true, [765] = true, [769] = true }, values = {} }
  for _, field in ipairs(Snapshot.fields) do photo.values[field] = "" end
  photo.values.masterTaxonId = "mtx_00000000000000000000000000000001"
  photo.values.taxonomyKeywordIds = "757"
  photo.values.referenceImage = "yes"
  photo.values.fnCountry = "Deutschland"
  photo.values.fnCaptureYear = "2026"
  photo.values.locationTimeKeywordNames = "Deutschland (FN Ort)*"
  function photo:getPropertyForPlugin(plugin, field)
    sdk()
    local visible = inWrite and catalog.metadataVisibilityBeforeWrite
    if visible and visible[self.uuid] then return visible[self.uuid].values[field] end
    return self.values[field]
  end
  function photo:setPropertyForPlugin(plugin, field, value)
    sdk(); assert(inWrite)
    assert(not field:match("^fn") and not field:match("^locationTime"), "must not write location/time")
    if self.failField == field then error("simulated metadata failure") end
    self.values[field] = value
  end
  function photo:getRawMetadata(field)
    sdk()
    if field == "uuid" then return self.uuid end
    if field == "isVideo" then return self.isVideo == true end
    if field == "path" then return "D:/synthetic/" .. self.uuid .. ".jpg" end
    if field == "dateTimeOriginal" then return nil end
    assert(field == "keywords", "undocumented metadata key: " .. field)
    local result = {}; for id in pairs(self.ids) do if catalog.keywords[id] then
      if self.keywordSet then result[catalog.keywords[id]] = true else table.insert(result, catalog.keywords[id]) end
    end end
    return result
  end
  function photo:removeKeyword(value) sdk(); assert(inWrite); if self.failRemove then error("remove failed") end; self.ids[value.localIdentifier] = nil end
  function photo:addKeyword(value) sdk(); assert(inWrite); if self.failAdd then error("add failed") end; assert(not self.ids[value.localIdentifier]); self.ids[value.localIdentifier] = true end
  catalog.photos[uuid] = photo; return photo
end
local photo = makePhoto("photo-one")
local function changeFor(target)
  local before = Snapshot.capture(target)
  local after = clone(before)
  after.values.masterTaxonId = "mtx_00000000000000000000000000000002"
  after.values.germanName = "Neue Art"
  after.values.taxonomyKeywordIds = "761"
  after.values.referenceImage = "no"
  after.keywords = { { id = "761", name = "Neue Art (FN)" } }
  return { before = before, after = after }
end
local function current() sdk() end
`;

const workflowFixture = fixture + `
local Json = require "Json"
local packageStamp = { available = true, packageId = "fixture", masterVersion = "master-fixture", correctionRevision = "" }
local calls, saved, answer, checkpointFails = {}, nil, nil, false
package.preload.TaxonomyHelper = function() return {
  searchPackageStatus = function() return packageStamp end,
  request = function(payload)
    sdk(); assert(not inWrite, "Helper called under catalog write lock")
    -- Exercise the actual JSON encoder for every request, including empty arrays.
    local encoded = Json.encode(payload)
    if payload.choices then assert(encoded:find('"choices":%[')) end
    table.insert(calls, payload.command)
    return answer(payload)
  end,
} end
local Reader = require "IdentityCatalog"
local Workflow = require "IdentityWorkflow"
local input = { catalogKey = "D:/Fotos/Testkatalog.lrcat", runId = "11111111-1111-1111-1111-111111111111",
  selectedUuids = { ["photo-one"] = true }, choices = {}, confirmed = true, token = "confirmed-plan", direction = "apply" }
local target = { masterTaxonId = "mtx_00000000000000000000000000000002", germanName = "Neue Art",
  acceptedScientificName = "Testus beta", rank = "species", hierarchy = {
    { rank = "species", scientificName = "Testus beta", germanName = "Neue Art" }
  } }
local plan = { package = clone(packageStamp), transfers = { { photoUuid = "photo-one", targetMasterTaxonId = target.masterTaxonId } }, favoriteEffects = {} }
answer = function(payload)
  local command = payload.command
  if command == "photo-identity-plan" then return plan end
  if command == "photo-identity-confirm" then return { plan = plan, targets = { target } } end
  if command == "photo-identity-prepare" then
    assert(Snapshot.equal(Snapshot.capture(photo), payload.changes[1].before))
    saved = { runId = input.runId, plan = plan, photos = {} }
    for _, change in ipairs(payload.changes) do
      change.photoUuid = change.before.photoUuid; change.state = "prepared"; table.insert(saved.photos, change)
    end
    return { journalPrepared = true, run = saved }
  end
  if command == "photo-identity-read" then return { run = saved } end
  if command == "photo-identity-block-preview" or command == "photo-identity-block-confirm" then
    local state = input.direction == "undo" and "undo-prepared" or "prepared"
    if saved.photos[1].state ~= state then return { ready = false } end
    local expected = input.direction == "undo" and saved.photos[1].after or saved.photos[1].before
    assert(Snapshot.equal(Snapshot.capture(photo), expected), "recovery first")
    return { ready = true, token = "block-token", changes = saved.photos, remainingPhotoCount = 0 }
  end
  if command == "photo-identity-checkpoint" then
    if checkpointFails then error("checkpoint response lost") end
    local expected = payload.mode == "undo" and saved.photos[1].before or saved.photos[1].after
    assert(Snapshot.equal(payload.observed[1], expected))
    saved.photos[1].state = payload.mode == "undo" and "reverted" or "applied"
    return { run = saved }
  end
  error("Unexpected command " .. command)
end
`;

test("JSON markiert leere Listen ausdrücklich, ohne bestehende leere Objekte oder null zu verändern", () => {
  execute(fixture + `
local Json = require "Json"
assert(Json.encode({}) == "{}")
assert(Json.encode(Json.array({})) == "[]")
assert(Json.encode(Json.null) == "null")
assert(Json.encode({ keywords = Json.array({}), values = {}, optional = Json.null }) == '{"keywords":[],"optional":null,"values":{}}')
`);
});

test("Dokumentierter Batch-Lookup bindet numerische SDK-IDs ohne Reihenfolgeannahme an genaue Journalnamen", () => {
  execute(fixture + `
Tasks.startAsyncTask(function()
  old.name = "Tiere (FN)"
  local before = Snapshot.capture(photo)
  local request = {keywords = {{id="757",name="Tiere (FN)"},{id="761",name="Neue Art (FN)"}}}
  local found = Snapshot.resolveKeywords(catalog, request)
  assert(found["757"] == old and found["761"] == new)
  assert(#catalog.keywordLookups > 0 and not photo.ids[761]) -- prepared target need not be assigned
  assert(Snapshot.equal(before, Snapshot.capture(photo)) and catalog.created == 0 and stats == 0)
end)
`);
});

for (const [label, mutation] of [
  ["missing API", "catalog.getKeywordsByLocalId = nil"],
  ["SDK call failure", 'catalog.lookupError = "SDK unavailable"'],
  ["name read failure", 'old.getName = function() error("Name unavailable") end'],
]) {
  test(`SDK-Stichwortprüfung (${label}) meldet Lesefehler statt behaupteter Löschung`, () => {
    execute(fixture + `
Tasks.startAsyncTask(function()
  ${mutation}
  local ok, message = Tasks.pcall(Snapshot.resolveKeywords, catalog, {keywords={{id="757",name="Alte Art (FN)*"}}}, true)
  assert(not ok and message:find("nicht prüfen") and not message:find("gelöscht"))
  assert(photo.ids[757] and photo.ids[765] and photo.ids[769] and stats == 0 and catalog.created == 0)
end)
`);
  });
}

for (const [label, response] of [
  ["wrong ID", "{new}"], ["duplicate ID", "{old,old}"], ["non-array", "{unexpected=old}"],
  ["no array", "nil"], ["non-object", '{"Tiere (FN)"}'],
  ["non-numeric object ID", '{ {localIdentifier="757",getName=function() return "Alte Art (FN)*" end} }'],
]) {
  test(`Widersprüchliche SDK-Stichwortantwort (${label}) bleibt auch in der Rücknahmevorprüfung gesperrt`, () => {
    execute(fixture + `
Tasks.startAsyncTask(function()
  catalog.getKeywordsByLocalId = function() sdk(); return ${response} end
  local ok, message = Tasks.pcall(Snapshot.resolveKeywords, catalog, {keywords={{id="757",name="Alte Art (FN)*"}}}, true)
  assert(not ok and message:find("Stichwortantwort") and not message:find("gelöscht"))
  assert(photo.ids[757] and stats == 0 and catalog.created == 0)
end)
`);
  });
}

test("Nicht exakt numerisch darstellbare Journal-IDs erreichen keinen SDK-Aufruf", () => {
  execute(fixture + `
Tasks.startAsyncTask(function()
  for _, id in ipairs({"k1", "0757", "757.0", "7.57e2", "-1", "0", "9007199254740992", " 757", 757}) do
    local ok, message = Tasks.pcall(Snapshot.resolveKeywords, catalog, {keywords={{id=id,name="Alte Art (FN)*"}}}, true)
    assert(not ok and message:find("Stichwortkennung", 1, true))
  end
  assert(#catalog.keywordLookups == 0 and stats == 0 and catalog.created == 0)
end)
`);
});

test("Nur tatsächlich fehlende oder umbenannte Altobjekte sind in der Rücknahmevorschau nicht verfügbar", () => {
  execute(fixture + `
Tasks.startAsyncTask(function()
  local request = {keywords={{id="757",name="Alte Art (FN)*"}}}
  for _, renamed in ipairs({false,true}) do
    if renamed then catalog.keywords[757]=old; old.name="Geändert (FN)" else catalog.keywords[757]=nil end
    local found = Snapshot.resolveKeywords(catalog, request, true)
    assert(next(found)==nil)
    local ok, message = Tasks.pcall(Snapshot.resolveKeywords, catalog, request)
    assert(not ok and message:find("gelöscht oder umbenannt"))
  end
  assert(catalog.created==0 and stats==0)
end)
`);
});

test("Lua-Orchestrierung bereitet Journal vor und schreibt erst danach mit Rücklesung und Journalabschluss", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  local before = Snapshot.capture(photo)
  local prepared = Workflow.prepare(catalog, input)
  assert(prepared.journalPrepared and Snapshot.equal(before, Snapshot.capture(photo)))
  assert(stats == 0 and calls[1] == "photo-identity-confirm" and calls[2] == "photo-identity-prepare")
  local result = Workflow.applyNext(catalog, input)
  assert(result.done and result.changedPhotoCount == 1 and stats == 1)
  assert(Snapshot.equal(Snapshot.capture(photo), saved.photos[1].after))
  assert(calls[#calls] == "photo-identity-checkpoint")
  assert(Workflow.applyNext(catalog, input).changedPhotoCount == 0 and stats == 1)
  input.direction = "undo"; saved.photos[1].state = "undo-prepared"
  packageStamp.available = false -- exact journal undo works without today's database
  result = Workflow.applyNext(catalog, input)
  assert(result.done and Snapshot.equal(Snapshot.capture(photo), before) and stats == 2)
  assert(photo.ids[765] and photo.ids[769])
end)
`);
});

test("Verlorener Journalabschluss wiederholt keine Fotoänderung und gibt die lokale Laufsperre frei", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  Workflow.prepare(catalog, input)
  checkpointFails = true
  local ok, message = Tasks.pcall(Workflow.applyNext, catalog, input)
  assert(not ok and message:find("checkpoint response lost"))
  assert(stats == 1 and saved.photos[1].state == "prepared")
  assert(Snapshot.equal(Snapshot.capture(photo), saved.photos[1].after))
  ok, message = Tasks.pcall(Workflow.applyNext, catalog, input)
  assert(not ok and message:find("recovery first") and stats == 1)
end)
`);
});

test("Lua-Katalogwächter erkennt neue Favoriten, fehlende Fotos und Paketwechsel direkt unter Schreibsperre", () => {
  for (const mutation of [
    'makePhoto("new-favorite").values.masterTaxonId = target.masterTaxonId',
    'photo.values.referenceImage = "no"',
    'catalog.photos["photo-one"] = nil',
    'packageStamp.correctionRevision = "changed"',
  ]) {
    execute(workflowFixture + `
Tasks.startAsyncTask(function()
  Workflow.prepare(catalog, input)
  catalog.beforeLock = function() ${mutation} end
  local ok = Tasks.pcall(Workflow.applyNext, catalog, input)
  assert(not ok and stats == 0 and saved.photos[1].state == "prepared")
  assert(photo.ids[757])
  assert(calls[#calls] == "photo-identity-block-confirm")
end)
`);
  }
});

test("Katalogleser begrenzt vollständige Metadaten auf Auswahl und Favoriten; Pause und fremder Katalog schreiben nichts", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  local normal = makePhoto("normal"); normal.values.referenceImage = "no"
  local nonFn = makePhoto("non-fn"); nonFn.values.masterTaxonId = ""
  local read = Reader.read(catalog, { ["normal"] = true })
  assert(#read.observed == 2 and #read.inventoryRows == 2)
  read = Reader.read(catalog, {})
  assert(#read.observed == 1 and read.byUuid["normal"] == nil)
  local ok, message = Tasks.pcall(Workflow.prepare, catalog, input, function() return false end)
  assert(not ok and message:find("pausiert") and #calls == 0 and catalog.created == 0)
  local wrong = clone(input); wrong.catalogKey = "another.lrcat"
  ok, message = Tasks.pcall(Workflow.prepare, catalog, wrong)
  assert(not ok and message:find("anderen Lightroom%-Katalog") and #calls == 0)
  -- Error released the guard; a new read-only preview remains possible.
  Workflow.preview(catalog, input)
  assert(calls[1] == "photo-identity-plan" and stats == 0)
end)
`);
});

test("Rücknahmeprüfung liest vor jeder Bestätigung neu und erfindet keine gelöschten Altstichwörter", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  Workflow.prepare(catalog, input)
  Workflow.applyNext(catalog, input)
  local previousAnswer = answer
  answer = function(payload)
    if payload.command == "photo-identity-undo-preview" or payload.command == "photo-identity-undo-prepare" then
      assert(payload.inventoryRows[1].masterTaxonId == photo.values.masterTaxonId)
      assert(Snapshot.equal(payload.observed[1], Snapshot.capture(photo)))
      local encoded = Json.encode(payload)
      if catalog.keywords[757] then assert(#payload.availableKeywords == 1)
      else assert(encoded:find('"availableKeywords":%[%]')) end
      return { token = "undo-token", changesPhotos = false }
    end
    return previousAnswer(payload)
  end
  assert(Workflow.reviewRun(catalog, input, "undo-preview").token == "undo-token")
  catalog.keywords[757] = nil
  local created = catalog.created
  Workflow.reviewRun(catalog, input, "undo-prepare")
  assert(catalog.created == created and stats == 1)
  local invalid = clone(input); invalid.confirmed = false
  local ok = Tasks.pcall(Workflow.reviewRun, catalog, invalid, "recovery-confirm")
  assert(not ok and stats == 1)
end)
`);
});

test("Rücknahmeprüfung liest unzugewiesene Altobjekte exakt und hält bei SDK-Fehler vor der Bestätigung an", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  Workflow.prepare(catalog,input); Workflow.applyNext(catalog,input)
  assert(not photo.ids[757] and catalog.keywords[757]==old)
  local previousAnswer, mode = answer, "present"
  answer = function(payload)
    if payload.command=="photo-identity-undo-preview" then
      assert(#payload.availableKeywords == (mode=="present" and 1 or 0))
      if mode=="present" then
        assert(payload.availableKeywords[1].id=="757" and payload.availableKeywords[1].name=="Alte Art (FN)*")
      end
      return {token="read-only-undo",changesPhotos=false}
    end
    return previousAnswer(payload)
  end
  assert(Workflow.reviewRun(catalog,input,"undo-preview").token=="read-only-undo")
  mode="renamed"; old.name="Andere Art (FN)"
  Workflow.reviewRun(catalog,input,"undo-preview")
  catalog.lookupError="SDK read failure"
  local ok,message=Tasks.pcall(Workflow.reviewRun,catalog,input,"undo-prepare")
  assert(not ok and message:find("nicht prüfen") and calls[#calls]=="photo-identity-read")
  assert(saved.photos[1].state=="applied" and stats==1 and photo.ids[761] and not photo.ids[757])
end)
`);
});

test("Angehaltener vorbereiteter Lauf wird nach bewusster Rücklesung fortgesetzt statt neu vorbereitet", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  local before=Snapshot.capture(photo)
  Workflow.prepare(catalog,input)
  local originalRunId, originalChanges = saved.runId, Json.encode(saved.photos)
  catalog.lookupError="Temporary SDK read failure"
  local ok,message=Tasks.pcall(Workflow.applyNext,catalog,input)
  assert(not ok and message:find("nicht prüfen") and saved.photos[1].state=="prepared")
  assert(stats==0 and Snapshot.equal(before,Snapshot.capture(photo)) and Json.encode(saved.photos)==originalChanges)
  catalog.lookupError=nil
  local previousAnswer=answer
  answer=function(payload)
    if payload.command=="photo-identity-recovery-preview" then return {token="fresh-recovery",run=saved,changesPhotos=false} end
    if payload.command=="photo-identity-recovery-confirm" then
      assert(payload.confirmed and payload.token=="fresh-recovery")
      assert(saved.runId==originalRunId and Json.encode(saved.photos)==originalChanges)
      return {run=saved,changesPhotos=false}
    end
    return previousAnswer(payload)
  end
  local review=Workflow.reviewRun(catalog,input,"recovery-preview")
  input.token=review.token
  Workflow.reviewRun(catalog,input,"recovery-confirm")
  assert(stats==0 and saved.photos[1].state=="prepared")
  assert(Workflow.applyNext(catalog,input).changedPhotoCount==1)
  assert(saved.runId==originalRunId and saved.photos[1].state=="applied" and stats==1)
  local prepares=0; for _,command in ipairs(calls) do if command=="photo-identity-prepare" then prepares=prepares+1 end end
  assert(prepares==1)
  saved.photos[1].state="undo-prepared"; input.direction="undo"
  Workflow.applyNext(catalog,input)
  assert(saved.photos[1].state=="reverted" and stats==2 and Snapshot.equal(before,Snapshot.capture(photo)))
  assert(photo.ids[765] and photo.ids[769])
end)
`);
});

test("Fehlgeschlagene Journalvorbereitung ändert kein Foto; paralleler Aufruf wird vor Helferzugriff gesperrt", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  target.germanName = "Neu belegte Art"
  target.hierarchy[1].germanName = target.germanName
  local before = Snapshot.capture(photo)
  local previousAnswer = answer
  answer = function(payload)
    if payload.command == "photo-identity-confirm" then
      local ok, message = Tasks.pcall(Workflow.preview, catalog, input)
      assert(not ok and message:find("läuft bereits"))
    end
    if payload.command == "photo-identity-prepare" then error("journal full") end
    return previousAnswer(payload)
  end
  local ok, message = Tasks.pcall(Workflow.prepare, catalog, input)
  assert(not ok and message:find("journal full"))
  assert(Snapshot.equal(before, Snapshot.capture(photo)) and stats == 0 and saved == nil)
  assert(catalog.created > 0) -- empty target keywords may remain; no automatic deletion
end)
`);
});

test("Alle ausgelieferten Lua-Dateien lassen sich parsen (Fengari/Lua 5.3, kein Lightroom-SDK-Ersatz)", async () => {
  for (const name of (await fs.readdir(root)).filter((name) => name.endsWith(".lua"))) {
    const state = lauxlib.luaL_newstate();
    try {
      const code = await fs.readFile(new URL(name, root), "utf8");
      const status = lauxlib.luaL_loadstring(state, to_luastring(code));
      assert.equal(status, lua.LUA_OK, `${name}: ${lua.lua_tojsstring(state, -1)}`);
    } finally { lua.lua_close(state); }
  }
});

test("Lua-Artänderung und Rücknahme erhalten Ort/Zeit und fremde Keywords, aktualisieren Statistik und lesen Erfolg zurück", () => {
  execute(fixture + `
Tasks.startAsyncTask(function()
  local change = changeFor(photo)
  local after = Writer.applyBlock(catalog, { change }, "apply", current)
  assert(Snapshot.equal(after[1], change.after))
  assert(photo.ids[765] and photo.ids[769] and not photo.ids[757] and photo.ids[761])
  assert(photo.values.fnCountry == "Deutschland" and photo.values.fnCaptureYear == "2026")
  assert(stats == 1 and catalog.created == 0)
  local before = Writer.applyBlock(catalog, { change }, "undo", current)
  assert(Snapshot.equal(before[1], change.before)); assert(stats == 2)
  assert(photo.ids[765] and photo.ids[769] and photo.ids[757] and not photo.ids[761])
end)
`);
});

test("Lua-Schreibweg verweigert Aufruf ohne LrTask, Timeout und veralteten Zustand direkt vor dem Schreiblock", () => {
  execute(fixture + `
local ok, message = originalPcall(function() Snapshot.capture(photo) end)
assert(not ok and message:find("LrTask"))
Tasks.startAsyncTask(function()
  local change = changeFor(photo)
  catalog.busy = true
  ok, message = Tasks.pcall(Writer.applyBlock, catalog, {change}, "apply", current)
  assert(not ok and message:find("Katalogvorgang")); assert(Snapshot.equal(Snapshot.capture(photo), change.before))
  catalog.busy = false
  catalog.beforeLock = function() photo.values.germanName = "Inzwischen verändert" end
  ok, message = Tasks.pcall(Writer.applyBlock, catalog, {change}, "apply", current)
  assert(not ok and message:find("verändert")); assert(photo.values.germanName == "Inzwischen verändert")
  assert(photo.ids[757] and not photo.ids[761] and stats == 0)
end)
`);
});

test("Lua-Metadaten-/Keywordfehler rollen den Block zurück und Callback-Ausführung allein gilt nicht als Erfolg", () => {
  for (const fault of ["failAdd", "failRemove", "failField", "rollbackAfterCallback"]) {
    execute(fixture + `
Tasks.startAsyncTask(function()
  local change = changeFor(photo)
  ${fault === "rollbackAfterCallback" ? "catalog.rollbackAfterCallback = true" : `photo.${fault} = ${fault === "failField" ? '"masterTaxonId"' : "true"}`}
  local ok = Tasks.pcall(Writer.applyBlock, catalog, {change}, "apply", current)
  assert(not ok); assert(Snapshot.equal(Snapshot.capture(photo), change.before)); assert(stats == 0)
end)
`);
  }
});

test("Lua-Rücknahme erzeugt keine gelöschten Stichwörter neu und ignoriert keine zusätzlichen FN-Keywords", () => {
  execute(fixture + `
Tasks.startAsyncTask(function()
  photo.keywordSet = true
  local change = changeFor(photo)
  Writer.applyBlock(catalog, {change}, "apply", current)
  catalog.keywords[757] = nil
  local ok, message = Tasks.pcall(Writer.applyBlock, catalog, {change}, "undo", current)
  assert(not ok and message:find("nicht automatisch wiederhergestellt")); assert(catalog.created == 0)
  keyword(773, "Zusatz (FN)"); photo.ids[773] = true
  ok, message = Tasks.pcall(Writer.applyBlock, catalog, {change}, "undo", current)
  assert(not ok and message:find("verändert")); assert(photo.ids[773] and photo.ids[761])
end)
`);
});

test("Artänderungsjournal verwendet neue Stichwortkennungen erst nach dem SDK-Schreibabschluss", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  local before = Snapshot.capture(photo)
  catalog.delayedKeywordIdentifiers = true; catalog.delayedKeywordNames = true
  target.germanName = "Erstmals vorbereitete Art"; target.hierarchy[1].germanName = target.germanName
  local prepared = Workflow.prepare(catalog, input)
  assert(prepared.journalPrepared and #saved.photos[1].after.keywords > 0)
  for _, entry in ipairs(saved.photos[1].after.keywords) do
    assert(entry.id ~= "" and catalog:getKeywordsByLocalId({tonumber(entry.id)})[1]:getName() == entry.name)
  end
  assert(Snapshot.equal(before, Snapshot.capture(photo)) and stats == 0)
end)
`);
});

test("Dauerhaft fehlende neue Stichwortkennungen verhindern Journal und Fotoänderung", () => {
  execute(workflowFixture + `
Tasks.startAsyncTask(function()
  local before = Snapshot.capture(photo)
  catalog.delayedKeywordIdentifiers = true; catalog.keepKeywordIdentifiersPending = true
  target.germanName = "Erstmals vorbereitete Art"; target.hierarchy[1].germanName = target.germanName
  local ok = Tasks.pcall(Workflow.prepare, catalog, input)
  assert(not ok and saved == nil and stats == 0 and Snapshot.equal(before, Snapshot.capture(photo)))
end)
`);
});

test("Zielvorbereitung verweigert nach Commit veränderte Fotos oder Paketstände vor der Journalanlage", () => {
  for (const mutation of [
    'photo.values.germanName = "Extern geändert"',
    'packageStamp.packageId = "changed-after-commit"',
    'for _, entry in pairs(catalog.keywords) do if entry.name == "Erstmals vorbereitete Art (FN)" then entry.name = "Fremde Zielart (FN)" end end',
  ]) {
    execute(workflowFixture + `
Tasks.startAsyncTask(function()
  target.germanName = "Erstmals vorbereitete Art"; target.hierarchy[1].germanName = target.germanName
  catalog.delayedKeywordIdentifiers = true
  catalog.afterWriteCommit = function() ${mutation} end
  local ok = Tasks.pcall(Workflow.prepare, catalog, input)
  assert(not ok and saved == nil and stats == 0 and photo.ids[757] and not photo.ids[761])
  assert(photo.values.masterTaxonId == "mtx_00000000000000000000000000000001")
end)
`);
  }
});

test("Reine externe Favoritenabwahl und ihre Rücknahme halten Statistik und übrige FN-Daten konsistent", () => {
  execute(fixture + `
Tasks.startAsyncTask(function()
  local Index = require "StatisticsIndex"; local Stats = require "Statistics"
  photo.values.germanName = "Alte Art"
  local selectedBefore = Snapshot.capture(photo)
  local other = makePhoto("outside-selected-photos")
  other.values.germanName = "Alte Art"
  local before = Snapshot.capture(other)
  local after = clone(before); after.values.referenceImage = "no"
  local changes = {{before=before,after=after}}
  statisticsIndex = Index.new(2)
  Index.add(statisticsIndex, Stats.photoSnapshot(photo)); Index.add(statisticsIndex, Stats.photoSnapshot(other))
  catalog.delayedMetadataVisibility = true
  for _, direction in ipairs({"apply", "undo"}) do
    Writer.applyBlock(catalog, changes, direction, current)
    local result = Index.result(statisticsIndex)
    assert(result.assignedPhotos == 2 and result.referenceImageCount == (direction == "apply" and 1 or 2))
    assert(Snapshot.equal(Snapshot.capture(photo), selectedBefore))
    assert(Snapshot.equal(Snapshot.capture(other), direction == "apply" and after or before))
    assert(other.ids[757] and other.ids[765] and other.ids[769] and catalog.created == 0)
  end
end)
`);
});

test("Artänderung und Rücknahme aktualisieren echte Statistik trotz alter FN-Lesesicht im Schreibzugriff", () => {
  for (const isVideo of [false, true]) {
    execute(fixture + `
Tasks.startAsyncTask(function()
  local Index = require "StatisticsIndex"
  local Stats = require "Statistics"
  photo.isVideo = ${isVideo}
  photo.values.germanName = "Alte Art"; photo.values.taxonomyClass = "Aves"
  photo.values.taxonomyGenus = "Testus"; photo.values.fnCaptureMonth = "März"
  catalog.delayedMetadataVisibility = true
  statisticsIndex = Index.new(1); Index.add(statisticsIndex, Stats.photoSnapshot(photo))
  local change = changeFor(photo)
  change.after.values.taxonomyClass = "Mammalia"; change.after.values.taxonomyGenus = "Novus"
  for _, direction in ipairs({"apply", "undo"}) do
    Writer.applyBlock(catalog, {change}, direction, current)
    local expected = direction == "apply" and change.after or change.before
    local delta = statisticsDeltas[#statisticsDeltas]
    assert(delta.after[1].masterTaxonId == expected.values.masterTaxonId, "Statistics must use the committed target identity")
    assert(delta.after[1].className == expected.values.taxonomyClass and delta.after[1].genus == expected.values.taxonomyGenus)
    assert(delta.after[1].fnCaptureMonth == "März" and delta.after[1].fnCountry == "Deutschland")
    assert(delta.after[1].isVideo == ${isVideo} and delta.after[1].exampleFileName == "photo-one.jpg")
    local actual = Index.result(statisticsIndex)
    local rebuilt = Index.new(1); Index.add(rebuilt, Stats.photoSnapshot(photo))
    assert(require("Json").encode(actual) == require("Json").encode(Index.result(rebuilt)), "Delta and fresh index must agree")
    assert(Snapshot.equal(Snapshot.capture(photo), expected) and photo.ids[765] and photo.ids[769])
  end
end)
`);
  }
});

test("Lua-Zielvorbereitung dedupliziert gleichnamige Ränge und bleibt ohne Foto-/Ort-/Zeitänderung", () => {
  execute(fixture + `
Tasks.startAsyncTask(function()
  local before = Snapshot.capture(photo)
  local taxon = { masterTaxonId = "mtx_00000000000000000000000000000002", germanName = "Bartmeise",
    acceptedScientificName = "Panurus biarmicus", rank = "species", hierarchy = {
      { rank = "family", scientificName = "Panuridae", germanName = "Bartmeise" },
      { rank = "species", scientificName = "Panurus biarmicus", germanName = "Bartmeise" } } }
  local target = Writer.prepareTarget(catalog, taxon, current)
  assert(#target.keywords == 1 and catalog.created == 1)
  assert(target.values.taxonomyFamily == "Panuridae" and target.values.taxonomySpecies == "Panurus biarmicus")
  assert(Snapshot.equal(before, Snapshot.capture(photo))); assert(stats == 0)
  catalog.failCreate = true
  assert(not Tasks.pcall(Writer.prepareTarget, catalog, taxon, current))
end)
`);
});
