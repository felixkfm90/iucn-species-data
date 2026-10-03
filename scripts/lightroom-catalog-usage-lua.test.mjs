import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const root = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const modules = (await Promise.all(["Json", "CatalogUsageCapture", "CatalogUsageUpdateWatcher"].map(async (name) =>
  `package.preload["${name}"] = function()\n${await readFile(new URL(`${name}.lua`, root), "utf8")}\nend`))).join("\n");
function execute(script) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  try {
    assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK, lua.lua_tojsstring(state, -1));
    const result = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(result, lua.LUA_OK, result === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
  } finally { lua.lua_close(state); }
}
const fixture = `
_PLUGIN = {}
local prefs, tasks, messages = {}, {}, {}
local reads, saves, checks, failures, confirms, finished = 0, 0, 0, 0, 0, 0
local cancel, changed, duplicate, invalid, switched, helperFailure, permissionFailure = false, false, false, false, false, false, false
local onYield, onSave = nil, nil
local catalogPath, activePath = "D:/current.lrcat", "D:/current.lrcat"
local request, contentOverride = nil, nil
local catalog = { getPath = function() return catalogPath end }
function catalog:getAllPhotos()
  reads = reads + 1
  local photos = {}
  for i=1,3 do
    photos[i] = { getRawMetadata = function(_, field) assert(field == "uuid"); return duplicate and "same" or "uuid-" .. i end,
      getPropertyForPlugin = function(_, _, field)
        assert(field == "masterTaxonId")
        if invalid then return "invalid" end
        if changed and reads == 2 and i == 1 then return "" end
        return i < 3 and "mtx_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" or ""
      end }
  end
  return photos
end
local scope = { setCancelable=function() end,setCaption=function() end,setPortionComplete=function() end,
  isCanceled=function() return cancel end,done=function() finished=finished+1 end }
local sdk = {
  LrApplication = { activeCatalog=function()
    if switched then return { getPath=function() return "D:/other.lrcat" end } end
    if activePath ~= catalogPath then return { getPath=function() return activePath end } end
    return catalog
  end },
  LrDialogs = { confirm=function() confirms=confirms+1;return "ok" end,
    message=function(title, message) table.insert(messages, title .. " " .. tostring(message)) end },
  LrFunctionContext = { callWithContext=function(_, callback) callback({}) end },
  LrProgressScope = function() return scope end,
  LrPrefs = { prefsForPlugin=function() return prefs end },
  LrPathUtils = { parent=function() return "D:/explorer" end, child=function(parent, child) return parent.."/"..child end },
  LrTasks = { pcall=pcall, yield=function() if onYield then onYield() end end,
    startAsyncTask=function(callback) table.insert(tasks, coroutine.create(callback)) end,
    sleep=function(seconds) assert(seconds==10);coroutine.yield() end },
}
function import(name) assert(sdk[name], name);return sdk[name] end
${modules}
local Json = require "Json"
package.preload.TaxonomyHelper = function() return {
  searchRoot=function() return "D:/explorer/lightroom" end,
  request=function(input)
    if input.command == "catalog-usage-request" then
      checks=checks+1
      assert(request and input.captureRequestId==request.requestId)
      if permissionFailure then error("changed backend request") end
      return { required=true,requestId=request.requestId,requestRevision=request.captureRevision }
    elseif input.command == "catalog-usage-request-error" then failures=failures+1;return { saved=true }
    end
    assert(input.command=="catalog-usage-capture" and input.complete and input.passes==2)
    saves=saves+1
    if request then assert(input.captureRequestId==request.requestId and input.requestRevision==request.captureRevision) end
    assert(input.totalPhotos==3 and #input.usedTaxa==1 and input.usedTaxa[1].photoCount==2)
    if helperFailure then error("helper save failed") end
    if onSave then onSave(input) end
    return { saved=true,assignedPhotos=2,taxonCount=1 }
  end,
} end
io.open=function(filename,mode)
  assert(filename=="D:/explorer/taxonomy/catalog-usage/update-request.json" and mode=="rb")
  if not request and not contentOverride then return nil end
  return { read=function(_,limit) assert(limit==65537);return contentOverride or Json.encode(request) end,
    close=function() return true end }
end
local Watcher=require "CatalogUsageUpdateWatcher"
local Capture=require "CatalogUsageCapture"
local function pending()
  return { schemaVersion=1,status="pending",requestId="capture-request-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    updateRunId="update-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",createdAt="2026-10-03T10:00:00.000Z",
    revision=string.rep("c",64),captureRevision=string.rep("d",64),catalogs={"D:/current.lrcat"} }
end
local function step(index)
  local ok,message=coroutine.resume(tasks[index or #tasks]);assert(ok,tostring(message))
end
`;

test("Init wartet nur auf kleine explizite Aufträge; kein SDK-Lauf beim Öffnen", () => execute(`${fixture}
  Watcher.start();step();step();assert(reads==0 and saves==0 and checks==0 and confirms==0)
  request=pending();request.status="paused";step();assert(reads==0 and checks==0)
  Watcher.stop();step();assert(coroutine.status(tasks[1])=="dead")
`));

test("bestätigter Request liest zweimal, liefert neue gebundene Quittung und fragt nicht erneut", () => execute(`${fixture}
  request=pending();Watcher.start();step();step()
  assert(reads==2 and saves==1 and checks==1 and finished==1 and confirms==0 and failures==0)
  assert(#messages==0)
  Watcher.stop();step()
`));

for (const scenario of ["cancel", "changed", "duplicate", "invalid", "helperFailure", "permissionFailure", "switched"]) {
  test(`SDK-Erfassungsfehler hält den Request sicher an: ${scenario}`, () => execute(`${fixture}
    request=pending();${scenario}=true
    Watcher.start();step();step()
    assert(saves==${scenario === "helperFailure" ? 1 : 0} and checks==1 and failures==1 and confirms==0)
    assert(#messages>=1)
    Watcher.stop();step()
  `));
}

test("unbekannter Katalog wird gemeldet, nicht gescannt", () => execute(`${fixture}
  request=pending();activePath="D:/foreign.lrcat"
  Watcher.start();step();step();assert(reads==0 and saves==0 and checks==1 and failures==1)
  Watcher.stop();step()
`));

test("Neuladen stoppt alten Task; keine doppelte Erfassung desselben erfolgreichen Requests", () => execute(`${fixture}
  Watcher.start();Watcher.start();request=pending()
  step(1);assert(reads==0 and coroutine.status(tasks[1])=="dead")
  step(2);step(2);assert(reads==2 and saves==1)
  Watcher.stop();step(2)
`));

test("Auftragwechsel oder Shutdown während Erfassung verhindert Submit", () => {
  for (const mode of ["replace", "stop"]) execute(`${fixture}
    request=pending()
    onYield=function() ${mode === "replace" ? 'request.captureRevision=string.rep("e",64)' : "Watcher.stop()"} end
    Watcher.start();step();assert(saves==0)
    Watcher.stop();if coroutine.status(tasks[#tasks])~="dead" then step() end
  `);
});

test("normale Close-Vormerkung verändert nicht die immutable Capturebindung", () => execute(`${fixture}
  request=pending()
  onYield=function() request.revision=string.rep("e",64);request.normalCloseRequestedAt="now" end
  Watcher.start();step();assert(reads==2 and saves==1 and failures==0)
  Watcher.stop();step()
`));

test("beschädigte oder übergroße Anfrage startet keine Erfassung", () => {
  for (const content of ["broken", "x".repeat(65537)]) execute(`${fixture}
    contentOverride=${JSON.stringify(content)};Watcher.start();step();step()
    assert(reads==0 and saves==0 and checks==0 and #messages==1)
    Watcher.stop();step()
  `);
});

test("manuelle Erstaufnahme verwendet denselben Core und bewahrt ihre Bestätigung", () => execute(`${fixture}
  local outcome=Capture.run({manual=true})
  assert(outcome.ok and reads==2 and saves==1 and confirms==1 and #messages==1)
`));
