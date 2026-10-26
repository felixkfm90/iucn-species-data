import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const root = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const source = (name) => readFile(new URL(`${name}.lua`, root), "utf8");
const stateSource = await source("PluginState");
const selectedFunction = stateSource.match(/function PluginState\.selectedPhotos\(catalog\)[\s\S]*?\nend/)[0];
// Before the fix, exercise the exact existing selection function. This keeps
// the red counterexample tied to the old Lightroom code rather than a copy.
const photoSelectionSource = await source("PhotoSelection").catch((error) => {
  if (error.code !== "ENOENT") throw error;
  return `local PluginState = require "PluginState"; return {
    selectedWithCollapsedFolderStacks = PluginState.selectedPhotos,
  }`;
});
const windowSource = await source("AssignmentWindow");
const assignFunction = windowSource.match(/  local function assign\(\)[\s\S]*?(?=\n  local function openCorrection\(\))/)[0];
const selectionStateFunction = windowSource.match(/local function selectionState\(catalog\)[\s\S]*?(?=\nlocal function recentItems\(\))/)[0];
const modules = (await Promise.all(["TaxonomyRanks", "MetadataDefinition", "KeywordIdFinalizer", "KeywordWriter"].map(async (name) =>
  `package.preload["${name}"] = function()\n${await source(name)}\nend`))).join("\n");

function execute(body) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  try {
    let status = lauxlib.luaL_loadstring(state, to_luastring(`${fixture}\n${body}`));
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
    status = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
  } finally { lua.lua_close(state); }
}

const fixture = `
local nativePcall = pcall
local sdk = { LrTasks = { pcall = nativePcall }, LrDialogs = { confirm = function() return "ok" end } }
function import(name) assert(sdk[name], name); return sdk[name] end
_PLUGIN = {}
package.preload.PluginState = function()
  local PluginState = {}; ${selectedFunction}
  PluginState.addRecentTaxon = function() end
  return PluginState
end
package.preload.Statistics = function() return {} end
package.preload.LocationTimeWriter = function() return {} end
package.preload.PhotoSelection = function() ${photoSelectionSource} end
${modules}
local PluginState = require "PluginState"
local PhotoSelection = require "PhotoSelection"
local KeywordWriter = require "KeywordWriter"
local TaxonomyRanks = require "TaxonomyRanks"
local function photo(id, raw, taxonId)
  local result = { localIdentifier = id, raw = raw or {}, reads = {}, taxonId = taxonId or "" }
  function result:getRawMetadata(key)
    self.reads[key] = (self.reads[key] or 0) + 1
    if self.failureKey == key then error("source unreadable") end
    return self.raw[key]
  end
  function result:getPropertyForPlugin(_, key)
    assert(key == "masterTaxonId", "Selection must only inspect existing taxonomy")
    return self.taxonId
  end
  return result
end
local function folder() return { type = function() return "LrFolder" end } end
local function catalog(selected, sources)
  local result = { selected = selected or {}, sources = sources or { folder() }, kAllPhotos = "all-photos", targetReads = 0 }
  function result:getTargetPhoto() return self.selected[1] end
  function result:getTargetPhotos() self.targetReads = self.targetReads + 1; return self.selected end
  function result:getActiveSources() return self.sources end
  function result:getAllPhotos() error("Selected stacks must never scan the whole catalog") end
  return result
end
local function collapsedStack()
  local top = photo(1, { isInStackInFolder = true, stackInFolderIsCollapsed = true, stackPositionInFolder = 1 })
  local hidden = photo(2, { isInStackInFolder = true, stackInFolderIsCollapsed = true, stackPositionInFolder = 2 })
  local video = photo(3, { isVideo = true, isInStackInFolder = true, stackInFolderIsCollapsed = true, stackPositionInFolder = 3 })
  top.raw.stackInFolderMembers = { top, hidden, video }
  hidden.raw.stackInFolderMembers = top.raw.stackInFolderMembers
  video.raw.stackInFolderMembers = top.raw.stackInFolderMembers
  return top, hidden, video
end
local function assertSelection(actual, expected)
  assert(#actual == #expected, "Expected " .. #expected .. " photos, got " .. #actual)
  for index, entry in ipairs(expected) do assert(actual[index] == entry, "Wrong member at " .. index) end
end
`;

test("Collapsed selected folder stack includes hidden photos and videos exactly once", () => {
  execute(`
    local top, hidden, video = collapsedStack()
    local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ top }))
    assertSelection(photos, { top, hidden, video }); assert(added == 2)
    assert(not hidden.reads.stackInFolderMembers and not video.reads.stackInFolderMembers,
      "Added members must not recursively expand unrelated stacks")
  `);
});

test("Expanded folder stacks retain the exact chosen subset", () => {
  execute(`
    local top, hidden = collapsedStack(); top.raw.stackInFolderIsCollapsed = false
    local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ top }))
    assertSelection(photos, { top }); assert(added == 0 and not top.reads.stackInFolderMembers)
    photos = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ top, hidden }))
    assertSelection(photos, { top, hidden })
  `);
});

test("A mixed batch includes each chosen collapsed stack but leaves an open stack subset unchanged", () => {
  execute(`
    local first, firstHidden, firstVideo = collapsedStack()
    local second, secondHidden, secondVideo = collapsedStack()
    second.localIdentifier = 4; secondHidden.localIdentifier = 5; secondVideo.localIdentifier = 6
    local openTop, openHidden = collapsedStack()
    openTop.localIdentifier = 7; openHidden.localIdentifier = 8; openTop.raw.stackInFolderIsCollapsed = false
    local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ first, second, openTop }))
    assertSelection(photos, { first, second, openTop, firstHidden, firstVideo, secondHidden, secondVideo })
    assert(added == 4 and not openTop.reads.stackInFolderMembers)
  `);
});

test("Selecting only a lower stack member never silently includes the other members", () => {
  execute(`
    local _, hidden = collapsedStack()
    local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ hidden }))
    assertSelection(photos, { hidden }); assert(added == 0 and not hidden.reads.stackInFolderMembers)
  `);
});

test("Visible duplicates and repeated wrappers of a catalog photo are deduplicated before writing", () => {
  execute(`
    local top, hidden, video = collapsedStack()
    local alias = photo(2)
    top.raw.stackInFolderMembers = { top, alias, video, hidden, video }
    local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ top, hidden, top }))
    assertSelection(photos, { top, hidden, video }); assert(added == 1)
  `);
});

test("Missing active selection never falls back to the unmarked filmstrip or reads its sources", () => {
  execute(`
    local top = collapsedStack(); local cat = catalog({ top })
    cat.getTargetPhoto = function() return nil end
    cat.getActiveSources = function() error("No source read without a selection") end
    cat.getTargetPhotos = function() error("Unmarked filmstrip must not become selection") end
    local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(cat)
    assert(#photos == 0 and added == 0)
  `);
});

test("Collection stacks and mixed collection/folder sources never use the different folder stack state", () => {
  execute(`
    local top = collapsedStack()
    local collection = { type = function() return "LrCollection" end }
    for _, sources in ipairs({ { collection }, { folder(), collection }, { "quick-collection" } }) do
      local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ top }, sources))
      assertSelection(photos, { top }); assert(added == 0 and not next(top.reads))
    end
  `);
});

test("All Photographs uses folder stack metadata without broadening to the rest of the catalog", () => {
  execute(`
    local top, hidden, video = collapsedStack()
    local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ top }, { "all-photos" }))
    assertSelection(photos, { top, hidden, video }); assert(added == 2)
  `);
});

test("Unknown or unavailable source context keeps the explicitly selected photos", () => {
  execute(`
    local top = collapsedStack(); local cat = catalog({ top }); cat.getActiveSources = nil
    local photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(cat)
    assertSelection(photos, { top }); assert(added == 0 and not next(top.reads))
    cat = catalog({ top }, {})
    photos, added = PhotoSelection.selectedWithCollapsedFolderStacks(cat)
    assertSelection(photos, { top }); assert(added == 0 and not next(top.reads))
  `);
});

test("An unreadable collapsed stack cannot be reported as a successful partial selection", () => {
  execute(`
    local top = collapsedStack(); top.raw.stackInFolderMembers = nil
    local ok, message = nativePcall(PhotoSelection.selectedWithCollapsedFolderStacks, catalog({ top }))
    assert(not ok and string.find(message, "Stapel", 1, true))
  `);
});

test("The existing taxonomy conflict guard also checks a hidden member of the chosen stack", () => {
  execute(`
    local top, hidden, video = collapsedStack(); hidden.taxonId = "mtx_other"
    local photos = PhotoSelection.selectedWithCollapsedFolderStacks(catalog({ top }))
    local conflicts = KeywordWriter.findConflicts(photos, { masterTaxonId = "mtx_bachstelze" })
    assertSelection(conflicts, { hidden }); assert(top.taxonId == "" and video.taxonId == "")
  `);
});

const assignmentFixture = `
local LrTasks = sdk.LrTasks
local LrDialogs = sdk.LrDialogs
local top, hidden, video = collapsedStack()
local catalog = catalog({ top })
local currentTaxon = { masterTaxonId = "mtx_bachstelze", germanName = "Bachstelze", rank = "species",
  searchPackage = { packageId = "package", masterVersion = "master", correctionRevision = "revision" } }
local currentTaxonQuery = "bachstelze"
local props = { query = "bachstelze", selectedGermanName = "Bachstelze", busy = false }
local assigned, prepared, assignedPhotos, preparedPhotos = 0, 0, nil, nil
local pendingNamePreference
local cleanText = TaxonomyRanks.cleanText
local function photoCountText(count) return tostring(count) .. (count == 1 and " Foto" or " Fotos") end
local function photoFileName() return "selected.ARW" end
local function recentItems() return {} end
local function setBusy(value) props.busy = value end
local function refreshActions() end
local function refreshSelection() end
local function setPreview() end
local NamePreference = { prepare = function(taxon) return taxon end }
local TaxonomyHelper = { searchPackageStatus = function() return {
  available = true, packageId = "package", masterVersion = "master", correctionRevision = "revision",
} end }
local LocationTimeWriter = { prepare = function(_, photos)
  prepared = prepared + 1; preparedPhotos = photos; return {}, {}
end }
KeywordWriter.assign = function(_, photos)
  assigned = assigned + 1; assignedPhotos = photos; return { photoCount = #photos }
end
${assignFunction}
${selectionStateFunction}
`;

test("Real AssignmentWindow action and preview count the same complete selected stack", () => {
  execute(`${assignmentFixture}
    local photos, status, label = selectionState(catalog)
    assertSelection(photos, { top, hidden, video })
    assert(string.find(status, "3 Fotos", 1, true) and string.find(status, "2 aus eingeklappten Stapeln", 1, true))
    assert(string.find(label, "3 Fotos", 1, true))
    assign()
    assert(assigned == 1 and prepared == 1 and assignedPhotos == preparedPhotos)
    assertSelection(assignedPhotos, { top, hidden, video })
    assert(props.searchStatus == "3 Fotos wurden Bachstelze zugewiesen.")
  `);
});

test("Real AssignmentWindow rejects a conflicting hidden photo before location preparation or writing", () => {
  execute(`${assignmentFixture}
    hidden.taxonId = "mtx_other"
    assign()
    assert(assigned == 0 and prepared == 0)
    assert(string.find(props.searchStatus, "bereits eine andere Taxonomie", 1, true))
    assert(top.taxonId == "" and video.taxonId == "")
  `);
});
