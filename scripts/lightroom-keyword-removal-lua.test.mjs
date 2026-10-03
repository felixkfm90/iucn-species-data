import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const root = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const modules = (await Promise.all(["TaxonomyRanks", "LocationTimeWriter", "KeywordWriter", "LocationTimeMenu"].map(async (name) =>
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

// Execute real Lua modules. Model Lightroom/Lua 5.1's non-yielding plain
// pcall explicitly: Fengari's Lua 5.3 would otherwise hide this SDK failure.
// This is a regression simulation, not a productive SDK acceptance test.
const fixture = `
local nativePcall, noYield, inWrite = pcall, false, false
pcall = function(fn, ...)
  local previous = noYield; noYield = true
  local result = table.pack(nativePcall(fn, ...)); noYield = previous
  return table.unpack(result, 1, result.n)
end
local function sdkRead()
  assert(not noYield, "Yielding is not allowed within a C or metamethod call")
end
local sdk = {
  LrTasks = { pcall = nativePcall, startAsyncTask = function(fn) fn() end },
  LrDate = { timestampToComponents = function() error("Removal must not read capture time") end },
  LrDialogs = {}, LrApplication = {},
}
function import(name) assert(sdk[name], name); return sdk[name] end
_PLUGIN = {}
local deltas, messages, confirms = 0, {}, 0
local function copy(values)
  local result = {}; for key, value in pairs(values or {}) do result[key] = value end; return result
end
package.preload.PluginState = function() return {
  applyStatisticsPhotoChanges = function() assert(inWrite); deltas = deltas + 1 end,
} end
package.preload.Statistics = function() return {
  photoSnapshot = function(photo) return copy(photo.values) end,
  locationTimeSnapshot = function(before, after) return { before = before, after = after } end,
} end
package.preload.LocationSuggestionReader = function() return {
  resolve = function() error("Removal must not request location export") end,
} end
${modules}
local Location = require "LocationTimeWriter"
local Menu = require "LocationTimeMenu"
local Writer = require "KeywordWriter"
local function catalogFixture()
  local catalog = { photos = {}, keywords = {}, creations = 0, removals = 0, writes = 0 }
  function catalog:keyword(id, name)
    local keyword = { localIdentifier = id, name = name }
    function keyword:getName() sdkRead(); if self.unreadable then error("keyword name unreadable") end; return self.name end
    self.keywords[id] = keyword; return keyword
  end
  function catalog:createKeyword(name)
    assert(inWrite); self.creations = self.creations + 1
    for _, keyword in pairs(self.keywords) do if keyword.name == name then return keyword end end
    return self:keyword("new-" .. tostring(self.creations), name)
  end
  function catalog:photo(values, names)
    local photo = { values = copy(values), keywords = {}, rawReads = 0 }
    for id, name in pairs(names or {}) do photo.keywords[id] = self:keyword(id, name) end
    function photo:getPropertyForPlugin(_, field) sdkRead(); return self.values[field] end
    function photo:setPropertyForPlugin(_, field, value) assert(inWrite); self.values[field] = value end
    function photo:getRawMetadata(field)
      sdkRead(); assert(field == "keywords", "Unexpected source read " .. tostring(field))
      self.rawReads = self.rawReads + 1
      if self.readFailure then error("keyword read failed") end
      if self.invalidKeywords then return { "2026 (FN Zeit)" } end
      local assigned = {}; for _, keyword in pairs(self.keywords) do table.insert(assigned, keyword) end
      return assigned
    end
    function photo:getFormattedMetadata() error("Formatted keywords are not authoritative objects") end
    function photo:removeKeyword(keyword)
      assert(inWrite and self.keywords[keyword.localIdentifier] == keyword)
      if self.removeFailure then error("keyword removal failed") end
      self.keywords[keyword.localIdentifier] = nil; catalog.removals = catalog.removals + 1
    end
    function photo:addKeyword(keyword) assert(inWrite); self.keywords[keyword.localIdentifier] = keyword end
    table.insert(self.photos, photo); return photo
  end
  function catalog:withWriteAccessDo(_, callback, options)
    assert(not inWrite and options.timeout == 10)
    if self.busy then return "aborted" end
    local backup = {}; for _, photo in ipairs(self.photos) do
      backup[photo] = { values = copy(photo.values), keywords = copy(photo.keywords) }
    end
    inWrite = true; self.writes = self.writes + 1
    local ok, result = nativePcall(callback); inWrite = false
    if not ok then
      for photo, old in pairs(backup) do photo.values = old.values; photo.keywords = old.keywords end
      error(result)
    end
    return "executed"
  end
  function catalog:getTargetPhoto() return self.target end
  function catalog:getTargetPhotos() return self.photos end
  return catalog
end
local choice = "ok"
sdk.LrDialogs.confirm = function() confirms = confirms + 1; return choice end
sdk.LrDialogs.message = function(title, body) table.insert(messages, { title = title, body = body }) end
local values = { masterTaxonId = "mtx_rebhuhn", germanName = "Rebhuhn", fnCaptureYear = "2026",
  fnCaptureMonth = "Juni", fnCountry = "Namibia", fnLocation = "Sambesi",
  locationTimeKeywordIds = "stale-id", locationTimeKeywordNames = "stale name", locationTimeAssignedAt = "old" }
local names = { year = "2026 (FN Zeit)", month = "Juni (FN Zeit)", country = "Namibia (FN Ort)",
  location = "Sambesi (FN Ort)", taxon = "Rebhuhn (FN)", manual = "Urlaub" }
local function assertRemoved(photo)
  assert(not photo.keywords.year and not photo.keywords.month and not photo.keywords.country and not photo.keywords.location)
  assert(photo.keywords.taxon and photo.keywords.manual)
  assert(photo.values.masterTaxonId == "mtx_rebhuhn" and photo.values.germanName == "Rebhuhn")
  assert(photo.values.fnCaptureYear == "" and photo.values.fnCaptureMonth == "" and photo.values.fnCountry == "")
  assert(photo.values.locationTimeKeywordIds == "" and photo.values.locationTimeAssignedAt == "")
end
`;

test("Lightroom SDK plain-pcall failure is reproduced and documented task-pcall succeeds", () => {
  execute(`${fixture}
    local catalog = catalogFixture(); local photo = catalog:photo(values, names)
    local ok, message = pcall(function() return photo:getRawMetadata("keywords") end)
    assert(not ok and string.find(message, "Yielding is not allowed", 1, true))
    ok, message = sdk.LrTasks.pcall(function() return photo:getRawMetadata("keywords") end)
    assert(ok and #message == 6)
    local result = Location.execute(catalog, { photo }, "remove", { protectedNamesForPhoto = Writer.taxonomyKeywordNameSet })
    assert(result.removedKeywordCount == 4 and result.changedPhotoCount == 1)
    assertRemoved(photo); assert(deltas == 1 and catalog.creations == 0)
  `);
});

test("Time/place removal recovers metadata-empty orphans and is idempotent", () => {
  execute(`${fixture}
    local catalog = catalogFixture(); local photo = catalog:photo({ masterTaxonId = "mtx_rebhuhn", germanName = "Rebhuhn" }, names)
    local result = Location.execute(catalog, { photo }, "remove")
    assert(result.removedKeywordCount == 4 and result.changedPhotoCount == 1); assertRemoved(photo)
    result = Location.execute(catalog, { photo }, "remove")
    assert(result.removedKeywordCount == 0 and result.changedPhotoCount == 0 and catalog.creations == 0)
  `);
});

test("Multiple selection removes FN Ort/Zeit star variants and duplicate objects but preserves other keywords", () => {
  execute(`${fixture}
    local catalog = catalogFixture(); local a = catalog:photo(values, names)
    local b = catalog:photo(values, names)
    b.keywords.year.name = "2026 (FN Zeit)*"; b.keywords.country.name = "Namibia (FN Ort)*"
    b.keywords.duplicate = catalog:keyword("duplicate", "Juni (FN Zeit)")
    b.keywords.extra = catalog:keyword("extra", "Manuell (FN Ort) Zusatz")
    local result = Location.execute(catalog, { a, b }, "remove")
    assert(result.removedKeywordCount == 9 and result.changedPhotoCount == 2)
    assertRemoved(a); assertRemoved(b); assert(not b.keywords.duplicate and b.keywords.extra)
    assert(catalog.creations == 0)
  `);
});

test("Unreadable or invalid SDK keywords fail closed before clearing FN metadata or index", () => {
  for (const failure of ["readFailure", "invalidKeywords", "unreadableName", "removeFailure"]) {
    execute(`${fixture}
      local catalog = catalogFixture(); local photo = catalog:photo(values, names)
      ${failure === "unreadableName" ? "photo.keywords.year.unreadable = true" : `photo.${failure} = true`}
      local ok, message = sdk.LrTasks.pcall(Location.execute, catalog, { photo }, "remove")
      assert(not ok and message and deltas == 0)
      assert(photo.values.fnCaptureYear == "2026" and photo.values.locationTimeAssignedAt == "old")
      assert(photo.keywords.year and photo.keywords.month and photo.keywords.country and photo.keywords.location)
      ${failure === "unreadableName" ? "photo.keywords.year.unreadable = false" : `photo.${failure} = false`}
      local result = Location.execute(catalog, { photo }, "remove")
      assert(result.removedKeywordCount == 4 and deltas == 1); assertRemoved(photo)
    `);
  }
});

test("Busy write gate and batch error preserve metadata; safe retry works", () => {
  execute(`${fixture}
    local catalog = catalogFixture(); local a = catalog:photo(values, names); local b = catalog:photo(values, names)
    catalog.busy = true
    assert(not sdk.LrTasks.pcall(Location.execute, catalog, { a, b }, "remove"))
    assert(a.values.fnCaptureYear == "2026" and a.keywords.year and deltas == 0)
    catalog.busy = false; b.readFailure = true
    assert(not sdk.LrTasks.pcall(Location.execute, catalog, { a, b }, "remove"))
    assert(a.values.fnCaptureYear == "2026" and a.keywords.year and deltas == 0)
    b.readFailure = false
    assert(Location.execute(catalog, { a, b }, "remove").removedKeywordCount == 8)
    assertRemoved(a); assertRemoved(b)
  `);
});

test("Shared menu action cancels without writes, ignores filmstrip without selection and retries errors", () => {
  execute(`${fixture}
    local catalog = catalogFixture(); local photo = catalog:photo(values, names)
    sdk.LrApplication.activeCatalog = function() return catalog end
    Menu.run("remove"); assert(confirms == 0 and catalog.writes == 0 and deltas == 0)
    catalog.target = photo; choice = "cancel"
    Menu.run("remove"); assert(confirms == 1 and catalog.writes == 0 and photo.keywords.year)
    choice = "ok"; photo.readFailure = true
    Menu.run("remove"); assert(photo.values.fnCaptureYear == "2026" and deltas == 0)
    assert(string.find(messages[#messages].title, "konnten nicht", 1, true))
    photo.readFailure = false; Menu.run("remove"); assertRemoved(photo)
    assert(deltas == 1 and catalog.creations == 0)
  `);
});
