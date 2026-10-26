import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import fengari from "fengari";
import { tmpdir } from "./test-temp.mjs";
import { createLightroomSearchRequestHandler } from "../species-explorer/lightroom-search-helper.mjs";
import { IDENTITY_FIELDS } from "../species-explorer/lightroom-identity-snapshot.mjs";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const root = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const actionSource = await fs.readFile(new URL("IdentityAction.lua", root), "utf8");
const viewSource = await fs.readFile(new URL("IdentityView.lua", root), "utf8");
const stateSource = await fs.readFile(new URL("PluginState.lua", root), "utf8");
const selectionFunction = stateSource.match(/function PluginState\.selectedPhotos\(catalog\)[\s\S]*?\nend/)[0];
function execute(script, inspect = () => undefined) {
  const state = lauxlib.luaL_newstate(); lualib.luaL_openlibs(state);
  try {
    assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK, lua.lua_tojsstring(state, -1));
    const code = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(code, lua.LUA_OK, code === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
    return inspect(state);
  } finally { lua.lua_close(state); }
}

const fixture = `
local dialogs, confirms, messages, calls = {}, {}, {}, {}
local choices, permissions = {}, {}
local changed, previews, pause, failWrite, favoriteConflict = 0, 0, false, false, false
local run = { photos = { { photoUuid = "p1", state = "prepared" } } }
local reviewConflicts = {}
local sdkUuid = "11111111-1111-1111-1111-111111111111"
local originalPcall = pcall
function import(name)
  if name == "LrTasks" then return { pcall = originalPcall, yield = function() end } end
  if name == "LrUUID" then return { generateUUID = function() return sdkUuid end } end
  error(name)
end
local View = {
  photos = function(n) return tostring(n) .. (n == 1 and " Foto" or " Fotos") end,
  choose = function(title, text, items)
    table.insert(dialogs, { title = title, text = text, items = items })
    return table.remove(choices, 1)
  end,
  confirm = function(title, text)
    table.insert(confirms, { title = title, text = text })
    local value = table.remove(permissions, 1)
    return value ~= false
  end,
  message = function(title, text) table.insert(messages, { title = title, text = text }) end,
  photoLabel = function(_, uuid) return "Datei " .. uuid end,
  conflicts = function(_, conflicts) return true end,
  work = function(title, callback)
    local result = callback(function() return true end)
    return result, pause
  end,
}
local photos = {}
for i = 1, 2 do
  photos[i] = { getPropertyForPlugin = function() return "old" end, getRawMetadata = function() return "p" .. i end }
end
local catalog = { getTargetPhotos = function() return photos end, getTargetPhoto = function() return photos[1] end }
local Workflow = {
  preview = function(_, input)
    table.insert(calls, "preview"); previews = previews + 1
    local selected = #input.choices > 0
    return { token = "preview-token", ready = selected and (not favoriteConflict or #input.favoriteDecisions > 0),
      cases = { { photos = { { masterTaxonId = "old", germanName = "Bisherige Art", scientificName = "Testus old" }, {} },
        targets = { { masterTaxonId = "new", germanName = "Nachfolgeart", scientificName = "Testus new" } }, containsSplit = true } },
      transfers = selected and { {}, {} } or {}, skippedPhotoCount = 0,
      favoriteConflicts = favoriteConflict and #input.favoriteDecisions == 0 and { { targetMasterTaxonId = "new", photoUuids = { "p1", "outside" } } } or {},
      favoriteEffects = #input.favoriteDecisions > 0 and { { changesFavorite = true } } or {},
    }
  end,
  prepare = function(_, input)
    assert(input.confirmed and input.token == "preview-token" and input.runId)
    assert(input.choices[1].targetMasterTaxonId == "new")
    table.insert(calls, "prepare"); return { journalPrepared = true }
  end,
  applyNext = function(_, input)
    table.insert(calls, "apply:" .. input.direction)
    if failWrite then error("Journalabschluss unklar") end
    assert(input.confirmed); changed = changed + 1
    return { done = not pause, changedPhotoCount = 1 }
  end,
  journal = function(_, _, command)
    table.insert(calls, command)
    if command == "list" then return { runs = { { runId = "r1", createdAt = "2026-09-11T00:00:00Z", state = "prepared", photoCount = 1 } } } end
    return { run = run }
  end,
  reviewRun = function(_, input, command)
    table.insert(calls, command)
    if command == "undo-preview" then return { eligible = { {} }, conflicts = reviewConflicts, token = "undo-token" } end
    if command == "undo-prepare" then assert(input.token == "undo-token" and input.confirmed); return {} end
    if command == "recovery-confirm" then assert(input.token == "recovery-token" and input.confirmed) end
    return { effects = { {} }, conflicts = reviewConflicts, token = "recovery-token", run = run }
  end,
}
package.preload.IdentityWorkflow = function() return Workflow end
package.preload.IdentityCatalog = function() return { key = function() return "catalog" end } end
package.preload.IdentityView = function() return View end
package.preload.PluginState = function()
  local PluginState = {}; ${selectionFunction}; return PluginState
end
package.preload.IdentityAction = function()
${actionSource}
end
local Action = require "IdentityAction"
`;

async function journalBridge(t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "identity-ui-journal-"));
  const sourceId = `mtx_${"1".repeat(32)}`, targetId = `mtx_${"2".repeat(32)}`;
  const before = { photoUuid: "p1", values: { ...Object.fromEntries(IDENTITY_FIELDS.map((key) => [key, ""])),
    masterTaxonId: sourceId, referenceImage: "no", taxonomyKeywordIds: "k1" },
  keywords: [{ id: "k1", name: "Bisherige Art (FN)" }] };
  const after = structuredClone(before);
  after.values.masterTaxonId = targetId; after.values.taxonomyKeywordIds = "k2";
  after.keywords = [{ id: "k2", name: "Nachfolgeart (FN)" }];
  const store = {
    identityRevision: "a".repeat(64),
    status: () => ({ available: true, packageId: "identity-ui-package", masterVersion: "identity-ui-master" }),
    identityResolution: (id) => id === sourceId
      ? { state: "historical", type: "split", eventId: "b".repeat(64), successorIds: [targetId] }
      : { state: "current", successorIds: [] },
    taxon: (id) => id === targetId
      ? { masterTaxonId: targetId, acceptedScientificName: "Testus target", rank: "species", lifecycleState: "active" } : null,
    close() {},
  };
  const helper = await createLightroomSearchRequestHandler({ searchRoot: directory, openStore: async () => store });
  t.after(async () => { helper.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const request = { catalogKey: "catalog", snapshots: [before], observed: [before], writerIdle: true,
    inventoryRows: [{ photoUuid: before.photoUuid, masterTaxonId: sourceId, referenceImage: "no" }],
    choices: [{ sourceMasterTaxonId: sourceId, targetMasterTaxonId: targetId }], favoriteDecisions: [] };
  const preview = await helper.handle({ ...request, command: "photo-identity-plan" });
  assert.equal(preview.ok, true);
  return { helper, request: { ...request, token: preview.result.token, changes: [{ before, after }] } };
}

for (const sdkUuid of ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D",
  "a1B2c3D4-e5F6-4A7b-8C9d-0e1F2a3B4c5D"]) {
  test(`SDK-Laufkennung ${sdkUuid} erreicht über den Lua-Dialog das echte Journal kanonisch`, async (t) => {
    const captured = execute(fixture + `
sdkUuid = ${JSON.stringify(sdkUuid)}
local originalPrepare = Workflow.prepare
Workflow.prepare = function(catalog, input)
  capturedRunId, capturedConfirmed = input.runId, input.confirmed
  return originalPrepare(catalog, input)
end
choices = { "selection", "new" }; Action.run(catalog)
assert(changed == 1)
`, (state) => {
      lua.lua_getglobal(state, to_luastring("capturedRunId"));
      const runId = lua.lua_tojsstring(state, -1); lua.lua_pop(state, 1);
      lua.lua_getglobal(state, to_luastring("capturedConfirmed"));
      return { runId, confirmed: lua.lua_toboolean(state, -1) };
    });
    const { helper, request } = await journalBridge(t);
    if (sdkUuid !== sdkUuid.toLowerCase()) {
      const raw = await helper.handle({ ...request, command: "photo-identity-prepare", runId: sdkUuid, confirmed: true });
      assert.equal(raw.ok, false, "Die Journalgrenze selbst bleibt strikt kanonisch.");
      assert.match(raw.error.message, /Journalvorbereitung/);
    }
    const prepared = await helper.handle({ ...request, command: "photo-identity-prepare", ...captured });
    assert.equal(prepared.ok, true, prepared.error?.message);
    assert.equal(prepared.result.journalPrepared, true);
    assert.equal(prepared.result.run.runId, sdkUuid.toLowerCase());
    const read = await helper.handle({ command: "photo-identity-read", catalogKey: request.catalogKey, runId: captured.runId });
    assert.equal(read.ok, true);
    assert.equal(read.result.run.photos[0].state, "prepared");
  });
}

for (const [label, value] of [["nil", "nil"], ["boolean", "false"], ["number", "123"], ["table", "{}"],
  ["empty", '""'], ["nonhex", '"G1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D"'],
  ["shape", '"A1B2C3D4E-5F6-4A7B-8C9D-0E1F2A3B4C5D"'],
  ["short", '"A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5"'],
  ["whitespace", '" A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D"']]) {
  test(`Ungültige SDK-Laufkennung (${label}) hält vor Vorbereitung und Fotoschreiben an`, () => {
    execute(fixture + `
sdkUuid = ${value}; choices = { "selection", "new" }; Action.run(catalog)
assert(changed == 0 and calls[#calls] == "preview", "Keine Vorbereitung oder Fotoänderung bei ungültiger SDK-Kennung")
assert(messages[#messages].title == "Artänderung angehalten")
assert(messages[#messages].text:find("gültige Laufkennung"))
sdkUuid = "A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D"
choices = { "selection", "new" }; Action.run(catalog)
assert(changed == 1) -- Der angehaltene Dialog lässt einen späteren gültigen Lauf zu.
`);
  });
}

test("Artänderungsdialog startet beim Öffnen/Schließen keinen Kataloglauf; Zielwahl und Schlussbestätigung bleiben Pflicht", () => {
  execute(fixture + `
Action.run(catalog); assert(#calls == 0)
choices = { "selection" }; permissions = { false }
Action.run(catalog); assert(#calls == 0)
choices = { "selection" } -- close the successor picker
Action.run(catalog); assert(previews == 1 and changed == 0)
choices = { "selection", "new" }; permissions = { true, false }
Action.run(catalog); assert(changed == 0 and calls[#calls] == "preview")
choices = { "selection", "new" }
Action.run(catalog); assert(changed == 1 and calls[#calls] == "apply:apply")
assert(confirms[#confirms].text:find("Katalog sichern"))
assert(confirms[#confirms].text:find("leere neue FN"))
`);
});

test("Später entscheiden und abgebrochene Favoritenwahl verändern keine Fotos", () => {
  execute(fixture + `
choices = { "selection", "skip" }; Action.run(catalog)
assert(changed == 0 and previews == 1)
favoriteConflict = true; choices = { "selection", "new" }; Action.run(catalog)
assert(changed == 0 and dialogs[#dialogs].title == "Art-Favoritenkonflikt")
assert(dialogs[#dialogs].text:find("außerhalb der Auswahl"))
choices = { "selection", "new", "outside" }; Action.run(catalog)
assert(changed == 1 and confirms[#confirms].text:find("Favoritenmarkierungen: 1"))
`);
});

test("Artänderungsprüfung behandelt unmarkierten Filmstreifen nicht als bestätigte Auswahl", () => {
  execute(fixture + `
catalog.getTargetPhoto = function() return nil end
catalog.getTargetPhotos = function() error("Kein Filmstreifen-Fallback") end
choices = { "selection" }; Action.run(catalog)
assert(#calls == 0 and previews == 0 and changed == 0 and #confirms == 0)
assert(messages[#messages].title == "Artänderung angehalten")
catalog.getTargetPhoto = function() return photos[1] end
choices = { "selection", "new" }; catalog.getTargetPhotos = function() return { photos[1], photos[1], photos[2] } end
Action.run(catalog)
assert(changed == 1 and previews == 2)
assert(confirms[1].text:find("2 Fotos mit FN"))
`);
});

test("Pausierte Vorbereitung wird nicht geschrieben und Schreibfehler werden nicht als Erfolg angezeigt", () => {
  execute(fixture + `
pause = true; choices = { "selection", "new" }; Action.run(catalog)
assert(changed == 0 and messages[#messages].title == "Artänderung pausiert")
pause = false; failWrite = true; choices = { "selection", "new" }; Action.run(catalog)
assert(changed == 0 and messages[#messages].title == "Artänderung angehalten")
failWrite = false; choices = { "selection", "new" }; Action.run(catalog)
assert(changed == 1) -- UI session lock released after error
`);
});

test("Laufhistorie verlangt getrennte Bestätigung von Rücklesung und Fortsetzung; Beenden schreibt keine Fotos", () => {
  execute(fixture + `
choices = { "history", "r1", "resume" }; permissions = { true, false }; Action.run(catalog)
assert(changed == 0 and calls[#calls] == "recovery-confirm")
choices = { "history", "r1", "abandon" }; Action.run(catalog)
assert(changed == 0 and calls[#calls] == "recovery-confirm")
choices = { "history", "r1", "resume" }; Action.run(catalog)
assert(changed == 1 and calls[#calls] == "apply:apply")
`);
});

test("Rücknahme blockiert ungeklärte Übernahmen und darf erst nach ihrer eigenen Bestätigung schreiben", () => {
  execute(fixture + `
choices = { "history", "r1", "undo" }; Action.run(catalog)
assert(changed == 0 and messages[#messages].title == "Zuerst den offenen Lauf prüfen")
run.photos[1].state = "applied"
choices = { "history", "r1", "undo" }; permissions = { false }; Action.run(catalog)
assert(changed == 0 and calls[#calls] == "undo-preview")
choices = { "history", "r1", "undo" }; Action.run(catalog)
assert(changed == 1 and calls[#calls] == "apply:undo")
reviewConflicts = { { photoUuid = "p1", reason = "changed" } }; run.photos[1].state = "prepared"
choices = { "history", "r1", "resume" }; Action.run(catalog)
assert(changed == 1 and calls[#calls] == "recovery-confirm")
`);
});

test("Native Auswahl startet ohne Vorauswahl; Fortschritt wird auch bei Fehler geschlossen und verdeckt keine Schreibfehler", () => {
  execute(`
local props, canceled, finished, pick = nil, false, 0, false
local originalPcall = pcall
function import(name)
  if name == "LrTasks" then return { pcall = originalPcall } end
  if name == "LrBinding" then return { makePropertyTable = function() props = {}; return props end } end
  if name == "LrFunctionContext" then return { callWithContext = function(_, fn) return fn({}) end } end
  if name == "LrView" then return { bind = function(key) return key end, osFactory = function() return {
    column = function(_, value) return value end, static_text = function(_, value) return value end,
    popup_menu = function(_, value) assert(value.items[1].value == ""); return value end,
    dialog_spacing = function() return 12 end, control_spacing = function() return 6 end,
  } end } end
  if name == "LrDialogs" then return { presentModalDialog = function()
    assert(props.choice == ""); if pick then props.choice = "chosen" end; return "ok"
  end } end
  if name == "LrProgressScope" then return function() return {
    setCancelable = function() end, setCaption = function() end, setPortionComplete = function() end,
    isCanceled = function() return canceled end, done = function() finished = finished + 1 end,
  } end end
  error(name)
end
package.preload.IdentityView = function()
${viewSource}
end
local View = require "IdentityView"
assert(View.choose("test", "text", { {title="chosen",value="chosen"} }) == nil)
pick = true; assert(View.choose("test", "text", {}) == "chosen")
canceled = true
local result, paused = View.work("test", function(progress) assert(progress(0,1) == false); error("Artänderungsprüfung pausiert") end)
assert(result == nil and paused and finished == 1)
local ok, message = originalPcall(View.work, "test", function() error("checkpoint lost") end)
assert(not ok and message:find("checkpoint lost") and finished == 2)
`);
});
