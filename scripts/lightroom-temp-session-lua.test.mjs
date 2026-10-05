import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const root = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const modules = (await Promise.all(["Json", "TempSession", "TaxonomyHelper", "LocationSuggestionReader"].map(async (name) =>
  `package.preload["${name}"] = function()\n${await readFile(new URL(`${name}.lua`, root), "utf8")}\nend`))).join("\n");

function execute(script) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  try {
    const loaded = lauxlib.luaL_loadstring(state, to_luastring(script));
    assert.equal(loaded, lua.LUA_OK, loaded === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
    const status = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
  } finally { lua.lua_close(state); }
}

const fixture = `
local files, preferences, calls, serial = {}, { searchRoot = "D:/fixture/Daten/lightroom" }, {}, 0
local failCleanup, executingHook = false, nil
local function child(parent, leaf) return parent .. "/" .. leaf end
_PLUGIN = { path = "D:/fixture/lightroom-plugin/FNWildlifeTaxonomy.lrplugin" }
local sdk = {
  LrFileUtils = { exists = function(p)
    if files[p] then return "file" end
    return p:find("lightroom%-.*helper%.mjs$") ~= nil or p == "C:\\\\Program Files\\\\nodejs\\\\node.exe"
      or p == "C:\\\\Windows\\\\System32\\\\cmd.exe"
    end,
    readFile = function(p) assert(files[p], p); return files[p] end,
  },
  LrPathUtils = { child = child, parent = function(p) return p:match("^(.*)/[^/]+$") end,
    getStandardFilePath = function(name) assert(name == "temp"); return "C:/Users/felix/AppData/Local/Temp" end },
  LrPrefs = { prefsForPlugin = function() return preferences end },
  LrUUID = { generateUUID = function() serial = serial + 1; return string.format("aaaaaaaa-aaaa-4aaa-8aaa-%012d", serial) end },
  LrTasks = { pcall = pcall, startAsyncTask = function(fn) fn() end, sleep = function() end },
}
function import(name) assert(sdk[name], name); return sdk[name] end
io.open = function(p, mode)
  if mode == "rb" then
    if not files[p] then return nil, "missing" end
    return { read = function() return files[p] end, close = function() return true end }
  end
  return { write = function(_, text) files[p] = text; return true end, close = function() return true end }
end
${modules}
local Json = require "Json"
function sdk.LrTasks.execute(command)
  table.insert(calls, command)
  local action = command:match('%-%-command=([^"%s]+)')
  if action == "orphans" then return 0 end
  local id = command:match('%-%-session%-id=([^"]+)')
  local capability = command:match('%-%-capability=([^"]+)')
  if action == "create" or action == "create-owner" then
    assert(id and capability)
    local path = child(_PLUGIN.path, "temp/plugin/" .. id .. "/.fn-temp-session.json")
    assert(not files[path], "must never reuse sessions")
    files[path] = Json.encode({ schemaVersion=1, ownership="fn-wildlife-temp", owner="plugin", sessionId=id,
      capability=capability, pid=Json.null, state="open", operations=0,
      role=action == "create-owner" and "plugin-owner" or nil,
      artifacts=Json.array(), helperPids=Json.array() })
    return 0
  end
  if action == "cleanup" then
    local prefix = child(_PLUGIN.path, "temp/plugin/" .. id .. "/")
    local raw = files[prefix .. ".fn-temp-session.json"]
    assert(raw:find('"helperPids":[]', 1, true), "empty PID list must stay a JSON array for Node")
    local manifest = Json.decode(raw)
    assert(manifest.state == "closed" and manifest.operations == 0 and manifest.capability == capability)
    if failCleanup then return 1 end
    for _, entry in ipairs(manifest.artifacts) do files[prefix .. entry.relative] = nil end
    return 0
  end
  assert(not action, command)
  -- The old CMD file is now an owned file that invokes the safe Node wrapper.
  local commandPath = command:match('/c "([^"]+)"')
  local helperCommand = files[commandPath]
  assert(helperCommand and helperCommand:find("%-%-command=run"))
  local requestPath = helperCommand:match('%-%-request=([^"]+)')
  local responsePath = helperCommand:match('%-%-response=([^"]+)')
  local payload = Json.decode(files[requestPath])
  if executingHook then executingHook(requestPath, responsePath) end
  files[responsePath] = Json.encode({ ok=true, result={ echoed=payload.command } })
  return 0
end
local Temp = require "TempSession"
`;

test("Lua scratch cleanup is per operation, guarded at reload and leaves foreign files untouched", () => {
  execute(`${fixture}
    local first, second = Temp.begin("first"), Temp.begin("second")
    local file = first:path("request.json"); files[file] = "request"
    local other = second:path("preview.jpg"); files[other] = "preview"
    files[first.root .. "/foreign.txt"] = "foreign"
    assert(Temp.shutdown() == 2)
    assert(not pcall(Temp.begin, "late"))
    assert(files[file] and files[other], "reload must not delete active operations")
    first:release(); assert(not files[file] and files[other])
    assert(files[first.root .. "/foreign.txt"] == "foreign")
    local count = #calls; first:release(); assert(#calls == count)
    second:release(); assert(not files[other])
    Temp.initialize(); assert(calls[#calls]:find("%-%-command=orphans"))
    local third = Temp.begin("new generation"); assert(third.root ~= first.root); third:release()
  `);
});

test("Lua scratch rejects traversal/overwriting and records failed cleanup without losing files", () => {
  execute(`${fixture}
    local operation = Temp.begin("safe")
    assert(not pcall(function() operation:path("../other.txt") end))
    assert(not pcall(function() operation:register("D:/outside.jpg") end))
    files[operation.root .. "/foreign.txt"] = "keep"
    assert(not pcall(function() operation:path("foreign.txt") end))
    local file = operation:path("request.json"); files[file] = "request"
    failCleanup = true; operation:release()
    assert(files[file] == "request" and preferences.tempCleanupWarning:find("erhalten"))
  `);
});

test("Lua-Speicherprüfung akzeptiert verifizierte Windows-Pfadvarianten nach Programmumbenennung", () => {
  execute(`${fixture}${String.raw`
    preferences.searchRoot = nil
    files["D:/fixture/Daten"] = "directory"
    local config = { schemaVersion=1, state="ready", dataRoot="Daten",
      legacyDataRoot="C:/Users/felix/AppData/Local/FN Wildlife Travel/Arten-Explorer",
      previousRepoRoot="D:\\IUCN_Datenbank", migrationRevision=string.rep("a", 64) }
    local journal = { schemaVersion=1, state="committed",
      plan={ revision=config.migrationRevision, repoRoot="d:/iucn_datenbank/",
        sourceRoot="c:\\Users\\felix\\AppData\\Local\\FN Wildlife Travel\\Arten-Explorer",
        files=Json.array({ { relative="fixture.json" } }) },
      copied=Json.array({ { relative="fixture.json" } }) }
    files["D:/fixture/storage-path.json"] = Json.encode(config)
    local journalPath = "D:/fixture/Daten/.storage-migration.json"
    files[journalPath] = Json.encode(journal)
    local Helper = require "TaxonomyHelper"
    assert(Helper.searchRoot() == "D:/fixture/Daten/lightroom")
    for _, change in ipairs({
      function() journal.state = "migrating" end,
      function() journal.plan.revision = string.rep("b", 64) end,
      function() journal.plan.sourceRoot = "C:/Users/other/AppData/Local/FN Wildlife Travel/Arten-Explorer" end,
      function() journal.plan.repoRoot = "D:/Other-Explorer" end,
      function() journal.copied = Json.array() end,
    }) do
      local saved = files[journalPath]
      journal = Json.decode(saved)
      change()
      files[journalPath] = Json.encode(journal)
      assert(not pcall(Helper.searchRoot), "invalid migration must remain blocked")
      files[journalPath] = saved
    end
    assert(Helper.searchRoot() == "D:/fixture/Daten/lightroom")
    assert(#calls == 0, "read-only storage check must not invoke helpers or a catalog scan")
  `}`);
});

test("Taxonomy helper keeps Windows discovery on C while request/cmd/logs use D plug-in temp and wait for helper", () => {
  execute(`${fixture}
    local Helper = require "TaxonomyHelper"
    assert(Helper.runtimeNodePath():find("^C:"))
    assert(Helper.runtimeCommandProcessor():find("^C:"))
    executingHook = function(request, response)
      assert(request:find(_PLUGIN.path .. "/temp/plugin/", 1, true) == 1)
      assert(not request:find("AppData", 1, true))
      assert(Temp.shutdown() == 1 and files[request], "closing must retain the running helper's request")
    end
    assert(Helper.request({ command="search" }).echoed == "search")
    for path in pairs(files) do assert(not path:find("fn%-wildlife%-taxonomy%-%w+%-"), path) end
  `);
});

test("Location export waits all renditions before releasing temp even when canceled", () => {
  execute(`${fixture}
    local waited, registered, cleaned = 0, 0, false
    local output
    sdk.LrProgressScope = function() return { setCancelable=function() end, isCanceled=function() return true end,
      done=function() assert(waited == 2); cleaned=true end } end
    sdk.LrExportSession = function(options)
      output = options.exportSettings.LR_export_destinationPathPrefix
      assert(output:find(_PLUGIN.path .. "/temp/plugin/", 1, true) == 1)
      return { doExportOnNewTask=function() end, renditions=function(_, options)
        assert(options.stopIfCanceled == false)
        local i=0; return function()
          i=i+1; if i>2 then return nil end
          return i, { photo=i, waitForRender=function()
            waited=waited+1
            local file=output .. "/export-" .. i .. ".jpg"; files[file]='<photoshop:City>Coburg</photoshop:City>'
            return true, file
          end }
        end
      end }
    end
    local Reader = require "LocationSuggestionReader"
    local result=Reader.resolve({1,2})
    assert(result.canceled and cleaned and waited == 2)
    assert(result.valuesByPhoto[1].fnCity == "Coburg")
    assert(not files[output .. "/export-1.jpg"] and not files[output .. "/export-2.jpg"])
  `);
});

test("Location export throw keeps ownership lease instead of deleting below a possibly running renderer", () => {
  execute(`${fixture}
    local output
    sdk.LrProgressScope = function() return { setCancelable=function() end, isCanceled=function() return false end, done=function() end } end
    sdk.LrExportSession = function(options)
      output=options.exportSettings.LR_export_destinationPathPrefix
      return { doExportOnNewTask=function() files[output .. "/inflight.jpg"]="still rendering" end,
        renditions=function() error("SDK renderer unavailable") end }
    end
    local result=(require "LocationSuggestionReader").resolve({1})
    assert(result.failedByPhoto[1]:find("SDK renderer unavailable"))
    assert(files[output .. "/inflight.jpg"] == "still rendering" and Temp.shutdown() == 1)
    assert(Json.decode(files[output .. "/.fn-temp-session.json"]).state == "open")
  `);
});
