import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const root = new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/", import.meta.url);
const source = await fs.readFile(new URL("TaxonomyDetailsView.lua", root), "utf8");
const assignmentSource = await fs.readFile(new URL("AssignmentWindow.lua", root), "utf8");
const ranksSource = await fs.readFile(new URL("TaxonomyRanks.lua", root), "utf8");

function execute(body) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const script = `
    local choices, dialogs, beforeModal = {}, {}, nil
    local yieldCount, trace = 0, {}
    local factory = { static_text = function(_, args) return args end }
    function import(name)
      if name == "LrView" then return { osFactory = function() return factory end } end
      if name == "LrDialogs" then return { presentModalDialog = function(args)
        table.insert(trace, "modal:enter")
        if beforeModal then beforeModal(args) end
        table.insert(dialogs, args)
        assert(#dialogs < 100, "Unbounded detail navigation")
        local result = table.remove(choices, 1)
        table.insert(trace, "modal:return")
        return result
      end } end
      error("Unexpected SDK access: " .. name)
    end
    function require(name) error("Unexpected dependency: " .. name) end
    local Details = (function() ${source} end)()
    ${body}
  `;
  try {
    assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK, lua.lua_tojsstring(state, -1));
    const result = lua.lua_pcall(state, 0, 0, 0);
    assert.equal(result, lua.LUA_OK, result === lua.LUA_OK ? "" : lua.lua_tojsstring(state, -1));
  } finally {
    lua.lua_close(state);
  }
}

test("Taxonomiedetails: kurzer Text bleibt vollständig in einer reinen Anzeige", () => {
  execute(`
    local text = "Deutsch: Rebhuhn\\nWissenschaftlich: Perdix perdix"
    choices = { "ok" }
    Details.show(text)
    assert(#dialogs == 1)
    local dialog = dialogs[1]
    assert(dialog.title == "Taxonomiedetails – Seite 1 von 1")
    assert(dialog.contents.title == text and dialog.contents.height_in_lines == 2)
    assert(dialog.contents.width_in_chars == 52)
    assert(dialog.actionVerb == "Fertig" and dialog.cancelVerb == "Schließen")
    assert(dialog.otherVerb == nil and dialog.contents.value == nil)
  `);
});

test("Taxonomiedetails: lange Unicode-Namen und Leerzeilen vollständig über alle Seiten", () => {
  execute(`
    local text = "Deutsch: " .. string.rep("Äöß🐦", 65) .. " Ende\\n\\nVollständiger Taxonomiepfad:"
    for i = 1, 27 do text = text .. "\\nRang " .. tostring(i) .. ": Taxon " .. tostring(i) end
    for i = 1, 25 do choices[i] = "ok" end
    Details.show(text)
    assert(#dialogs > 4)
    local pages = {}
    for index, dialog in ipairs(dialogs) do
      assert(dialog.title == "Taxonomiedetails – Seite " .. tostring(index) .. " von " .. tostring(#dialogs))
      assert(dialog.contents.height_in_lines <= 8)
      assert(dialog.cancelVerb == "Schließen")
      assert(dialog.otherVerb == (index > 1 and "Zurück" or nil))
      for line in string.gmatch(dialog.contents.title .. "\\n", "(.-)\\n") do
        local count = 0
        for _, byte in ipairs({ string.byte(line, 1, #line) }) do
          if byte < 128 or byte >= 192 then count = count + 1 end
        end
        assert(count <= 52)
      end
      assert(utf8.len(dialog.contents.title) ~= nil, "A Unicode character was split")
      table.insert(pages, dialog.contents.title)
    end
    local displayed = table.concat(pages, "\\n")
    assert(displayed:gsub("\\n", "") == text:gsub("\\n", ""))
    assert(displayed:find("Ende\\n\\nVollständiger Taxonomiepfad:", 1, true))
    assert(displayed:find("Rang 27: Taxon 27", 1, true))
  `);
});

test("Taxonomiedetails: Zurück und Weiter wechseln nur die Anzeigeseite", () => {
  execute(`
    local text = ""
    for i = 1, 17 do text = text .. (i > 1 and "\\n" or "") .. "Zeile " .. tostring(i) end
    choices = { "ok", "other", "ok", "ok", "other", "cancel" }
    Details.show(text)
    assert(#dialogs == 6)
    local expected = { 1, 2, 1, 2, 3, 2 }
    for index, page in ipairs(expected) do
      assert(dialogs[index].title == "Taxonomiedetails – Seite " .. tostring(page) .. " von 3")
    end
    assert(dialogs[1].contents.title == dialogs[3].contents.title)
    assert(dialogs[2].contents.title == dialogs[4].contents.title)
    assert(dialogs[5].actionVerb == "Fertig" and dialogs[5].cancelVerb == "Schließen")
  `);
});

test("Taxonomiedetails: Cancel-Rückgabe beendet die erste, mittlere und letzte Seite", () => {
  execute(`
    local text = string.rep("Zeile\\n", 20)
    for _, sequence in ipairs({ { "cancel" }, { "ok", "cancel" }, { "ok", "ok", "cancel" } }) do
      dialogs, choices = {}, sequence
      local expected = #sequence
      Details.show(text)
      assert(#dialogs == expected)
    end
    dialogs, choices = {}, {}
    Details.show(text)
    assert(#dialogs == 1, "An absent modal result must close the view")
  `);
});

test("Taxonomiedetails: leere Anzeige und Zeilenenden benötigen keine fremden Daten", () => {
  execute(`
    choices = { "ok" }
    Details.show(nil)
    assert(dialogs[1].contents.title == "Noch keine Art ausgewählt.")
    dialogs, choices = {}, { "ok" }
    Details.show("A\\r\\n\\r\\nB\\rC\\n")
    assert(dialogs[1].contents.title == "A\\n\\nB\\nC\\n")
    assert(dialogs[1].contents.height_in_lines == 5)
  `);
});

function executeAssignment(rank, body, after = "", setup = "") {
  execute(`
    local props, view, duringDialog, onTaxon, afterAssignment
    local floatingOpen, opened, closed, fronted, closeError, showError = false, 0, 0, 0, false, false
    local controls, currentOptions
    local propertyTables, selectionReads = 0, 0
    local maxFloaters, activeFloaters = 0, 0
    local values, observers, requests = {}, {}, {}
    local tasks = { pcall = pcall, yield = function() yieldCount = yieldCount + 1; table.insert(trace, "yield") end, sleep = function() end,
      startAsyncTask = function(callback) callback() end }
    factory.dialog_spacing = function() return 12 end
    factory.control_spacing = function() return 6 end
    for _, kind in ipairs({ "column", "row", "group_box", "push_button", "popup_menu", "edit_field", "simple_list", "spacer" }) do
      factory[kind] = function(_, args) args.kind = kind; return args end
    end
    local sdkDialogs = {
      presentFloatingDialog = function(_, args)
        if showError then showError = false; error("Own show error") end
        assert(not floatingOpen, "Only one assignment floater may exist")
        opened = opened + 1
        floatingOpen, currentOptions = true, args
        activeFloaters = activeFloaters + 1; maxFloaters = math.max(maxFloaters, activeFloaters)
        table.insert(trace, "float:enter")
        view = args.contents
        local didClose = false
        controls = { close = function()
          if closeError then error("Own close error") end
          if didClose then return end
          didClose = true
          closed, floatingOpen = closed + 1, false
          activeFloaters = activeFloaters - 1
          args.windowWillClose()
        end, toFront = function() assert(floatingOpen); fronted = fronted + 1 end }
        args.onShow(controls)
        duringDialog(view, opened)
        if not didClose then controls:close() end
        table.insert(trace, "float:return")
      end,
    }
    function import(name)
      if name == "LrView" then return { osFactory = function() return factory end,
        bind = function(key) return { key = key } end } end
      if name == "LrTasks" then return tasks end
      if name == "LrApplication" then return { activeCatalog = function() return {} end } end
      if name == "LrPathUtils" then return {} end
      if name == "LrDialogs" then return sdkDialogs end
      if name == "LrBinding" then return { makePropertyTable = function()
        propertyTables = propertyTables + 1
        props = setmetatable({ addObserver = function(_, key, callback)
          observers[key] = observers[key] or {}
          table.insert(observers[key], callback)
        end }, { __index = values, __newindex = function(_, key, value)
          local old = values[key]; values[key] = value
          if old ~= value then for _, callback in ipairs(observers[key] or {}) do callback() end end
        end })
        return props
      end } end
      error("Unexpected assignment SDK access: " .. name)
    end
    local prohibited = setmetatable({}, { __index = function(_, key) error("Unexpected write/preparation: " .. key) end })
    local modules = {
      KeywordWriter = prohibited, LocationTimeWriter = prohibited, LocationTimeMenu = prohibited,
      PluginState = { selectedPhotos = function() return {} end, recentTaxa = function() return {} end },
      PhotoSelection = { selectedWithCollapsedFolderStacks = function() selectionReads = selectionReads + 1; return {}, 0 end },
      DataVersionView = { summary = function() return "Paket bereit" end },
      NamePreference = { items = function() return {} end },
      TaxonomyDetailsView = Details,
      TaxonomyRanks = (function() ${ranksSource} end)(),
      TaxonomyHelper = { request = function(args)
        table.insert(requests, args)
        if args.command == "status" then return { available = true } end
        if args.command == "search" then return { { masterTaxonId = "mtx_test", germanName = "Prüftaxon" } } end
        assert(args.command == "taxon")
        if onTaxon then onTaxon() end
        return { masterTaxonId = "mtx_test", rank = "${rank}", germanName = "Prüftaxon",
          englishName = "Test taxon", acceptedScientificName = "Testus", hierarchy = { { rank = "${rank}", scientificName = "Testus" } } }
      end },
    }
    function require(name) assert(modules[name], name); return modules[name] end
    local Window = (function() ${assignmentSource} end)()
    local function find(node, title)
      if node.title == title then return node end
      for _, child in ipairs(node) do local found = find(child, title); if found then return found end end
    end
    duringDialog = function(currentView, openIndex) ${body} end
    _PLUGIN = {}
    ${setup}
    Window.show({})
    ${after}
  `);
}

for (const rank of ["species", "genus", "family"]) {
  test(`Taxonomiedetails: ${rank} ohne Fotoauswahl per eigener Aktion vollständig lesen`, () => {
    executeAssignment(rank, `
      if openIndex > 1 then return end
      local read = find(currentView, "Taxonomiedetails lesen")
      assert(read.enabled.key == "canReadDetails" and not props.canReadDetails)
      props.query = "test"
      assert(props.canReadDetails and not props.canAssign)
      assert(props.canCorrect == (${rank === "species"}))
      requestCount, preview = #requests, props.preview
      read.action()
      assert(preview:find("Wissenschaftlich: Testus", 1, true))
      assert(props.preview == preview and props.selectedGermanName == "Prüftaxon")
    `, `
      assert(#dialogs == 1 and #requests == requestCount)
      assert(dialogs[1].contents.title == preview)
      assert(opened == 2 and closed == 2)
    `);
  });
}

test("Taxonomiedetails: neue Suche und laufender Detailabruf sperren alte Leseaktion", () => {
  executeAssignment("genus", `
    local read = find(currentView, "Taxonomiedetails lesen")
    props.query = "test"
    assert(props.canReadDetails)
    onTaxon = function()
      assert(props.busy and not props.canReadDetails)
      read.action()
      assert(#dialogs == 0)
    end
    find(currentView, "Auswahl prüfen").action()
    assert(props.canReadDetails and not props.busy)
    props.query = "x"
    assert(not props.canReadDetails and props.preview == "Noch keine Art ausgewählt.")
    read.action()
    assert(#dialogs == 0)
  `);
});

test("Taxonomiedetails: Zuweisung schließt vor Modal und kehrt mit derselben Auswahl zurück", () => {
  executeAssignment("species", `
    if openIndex == 1 then
      props.query = "test"
      originalView, originalProps, closedOptions = currentView, props, currentOptions
      local read = find(currentView, "Taxonomiedetails lesen")
      beforeModal = function(args)
        assert(not floatingOpen and closed == 1)
        assert(args.contents.title == originalProps.preview)
        local wrongFront = 0
        closedOptions.onShow({ toFront = function() wrongFront = wrongFront + 1 end })
        Window.show({})
        assert(wrongFront == 0, "Returned floater must not regain ownership during transition")
        assert(opened == 1, "Transition must reject another assignment window")
        read.action()
        assert(closed == 1, "Detached reader callback must not close a different window")
      end
      read.action()
      read.action()
      assert(#dialogs == 0, "Modal must wait until presentFloatingDialog returns")
    else
      assert(openIndex == 2 and currentView ~= originalView and props == originalProps, "Fresh view with identical props required")
      assert(props.query == "test" and props.masterTaxonId == "mtx_test")
      assert(props.selectedGermanName == "Prüftaxon" and props.canReadDetails)
    end
  `, `
    assert(opened == 2 and closed == 2 and #dialogs == 1)
    local statusCount = 0
    for _, request in ipairs(requests) do if request.command == "status" then statusCount = statusCount + 1 end end
    assert(statusCount == 1, "Reading must not reinitialize or re-query the current taxon")
  `);
});

test("Taxonomiedetails: Schließfehler öffnet kein Modal und erlaubt einen erneuten Versuch", () => {
  executeAssignment("species", `
    if openIndex > 1 then return end
    props.query = "test"
    local read = find(currentView, "Taxonomiedetails lesen")
    closeError = true
    read.action()
    assert(floatingOpen and #dialogs == 0)
    assert(props.searchStatus:find("Details konnten nicht geöffnet werden", 1, true))
    closeError = false
    read.action()
  `, `assert(opened == 2 and closed == 2 and #dialogs == 1)`);
});

test("Taxonomiedetails: Lesefehler stellt die Zuweisung ohne Suchverlust wieder bereit", () => {
  executeAssignment("species", `
    if openIndex == 1 then
      props.query = "test"
      props.selectedGermanName = "Bewusste Namenswahl"
      savedPreview = props.preview
      beforeModal = function()
        failedAtYield = yieldCount
        error("Own reader error")
      end
      find(currentView, "Taxonomiedetails lesen").action()
    else
      assert(props.query == "test" and props.masterTaxonId == "mtx_test")
      assert(props.searchStatus:find("Details konnten nicht geöffnet werden", 1, true))
      assert(props.canReadDetails and props.canAssign == false)
      assert(yieldCount == failedAtYield + 1, "Reader failure must yield before reopening")
      assert(props.selectedGermanName == "Bewusste Namenswahl" and props.preview == savedPreview)
    end
  `, `assert(opened == 2 and closed == 2)`);
});

test("Taxonomiedetails: nach finalem Schließen bleiben alte Leseraktionen wirkungslos", () => {
  executeAssignment("species", `
    props.query = "test"
    detachedRead = find(currentView, "Taxonomiedetails lesen")
    if not closedSessionOptions then closedSessionOptions = currentOptions end
  `, `
    detachedRead.action()
    assert(opened == 1 and #dialogs == 0 and not floatingOpen)
    beforeModal = nil
    local wrongFront = 0
    closedSessionOptions.windowWillClose()
    closedSessionOptions.selectionChangeObserver()
    closedSessionOptions.onShow({ toFront = function() wrongFront = wrongFront + 1 end })
    Window.show({})
    assert(wrongFront == 0, "Ended generation must not take focus")
    assert(opened == 2 and #dialogs == 0)
  `);
});

test("Taxonomiedetails: ein Fehler beim Wiederöffnen hält keine Übergangssperre fest", () => {
  executeAssignment("species", `
    if openIndex == 1 then
      props.query = "test"
      beforeModal = function() showError = true end
      find(currentView, "Taxonomiedetails lesen").action()
    end
  `, `
    assert(opened == 1 and #dialogs == 1)
    beforeModal = nil
    Window.show({})
    assert(opened == 2 and closed == 2)
  `, `
    local originalShow = Window.show
    Window.show = function(...)
      local ok, err = pcall(originalShow, ...)
      if not ok then assert(tostring(err):find("Own show error", 1, true)) end
    end
  `);
});

test("Taxonomiedetails: verspätete Fensterobserver können die wieder geöffnete Zuweisung nicht ablösen", () => {
  executeAssignment("species", `
    if openIndex == 1 then
      props.query = "test"
      previousOptions = currentOptions
      find(currentView, "Taxonomiedetails lesen").action()
    else
      local reads, yields = selectionReads, yieldCount
      previousOptions.windowWillClose()
      previousOptions.selectionChangeObserver()
      assert(selectionReads == reads and yieldCount == yields and floatingOpen)
      previousOptions.onShow({
        toFront = function() error("Expired onShow controls were used") end,
        close = function() error("Expired close controls were used") end,
      })
      Window.show({})
      assert(opened == 2 and fronted == 1 and floatingOpen)
      assert(props.query == "test" and props.canReadDetails)
    end
  `, `assert(opened == 2 and closed == 2 and #dialogs == 1)`);
});

test("Taxonomiedetails: übergebener Text bleibt trotz neuer Anzeigewerte unverändert", () => {
  executeAssignment("species", `
    if openIndex == 1 then
      props.query = "test"
      capturedPreview = props.preview
      find(currentView, "Taxonomiedetails lesen").action()
      props.preview = "Neue Anzeigewerte nach dem Klick"
      beforeModal = function(args)
        assert(args.contents.title == capturedPreview)
        assert(not floatingOpen)
      end
    end
  `, `assert(#dialogs == 1 and dialogs[1].contents.title == capturedPreview)`);
});


test("Taxonomiedetails: drei Generationen erhalten Auswahl und Observer ohne Viewwiederverwendung", () => {
  executeAssignment("species", `
    if openIndex == 1 then firstProps, nodes, observerCounts = props, {}, {}
    for key, callbacks in pairs(observers) do observerCounts[key] = #callbacks end
    assert(propertyTables == 1 and #observers.query == 1)
    props.query = "test"
    props.selectedGermanName = "Bewusst gewählter Name"
    expectedPreview = props.preview end
    assert(props == firstProps and propertyTables == 1)
    assert(props.query == "test" and props.masterTaxonId == "mtx_test")
    assert(props.selectedGermanName == "Bewusst gewählter Name" and props.preview == expectedPreview)
    assert(props.canReadDetails and props.canCorrect and not props.canAssign)
    for key, callbacks in pairs(observers) do assert(#callbacks == observerCounts[key], "Observer accumulated: " .. key) end
    local function visit(node) assert(not nodes[node], "A previous view node was reused")
    nodes[node] = true
    for _, child in ipairs(node) do visit(child) end end
    visit(currentView)
    if openIndex < 3 then find(currentView, "Taxonomiedetails lesen").action() end
  `, `
    assert(opened == 3 and closed == 3 and maxFloaters == 1 and activeFloaters == 0)
    assert(#dialogs == 2 and propertyTables == 1 and #observers.query == 1)
    local statuses, searches, taxa = 0, 0, 0
    for _, request in ipairs(requests) do if request.command == "status" then statuses = statuses + 1 end
    if request.command == "search" then searches = searches + 1 end
    if request.command == "taxon" then taxa = taxa + 1 end end
    assert(statuses == 1 and searches == 1 and taxa == 1, "Reopening must not re-query or reinitialize")
  `);
});


test("Taxonomiedetails: Floater- und Leser-Rückgabe geben die Task vor Wiederöffnung frei", () => {
  executeAssignment("species", `
    if openIndex == 1 then props.query = "test"
    find(currentView, "Taxonomiedetails lesen").action() end
  `, `
    local floaters, readers = 0, 0
    for index, event in ipairs(trace) do if event == "float:return" then floaters = floaters + 1
    assert(trace[index + 1] == "yield", "Missing floater-return yield") elseif event == "modal:return" then readers = readers + 1
    assert(trace[index + 1] == "yield", "Missing reader-return yield") end end
    assert(floaters == 2 and readers == 1)
  `);
});


test("Taxonomiedetails: dritte Suche nach zwei zweitseitigen Leserzyklen bleibt ausführbar", () => {
  executeAssignment("species", `
    if openIndex == 1 then props.query = "test"
    firstProps = props
    props.preview = "Deutsch: Prüftaxon\\nEnglisch: Test taxon\\nWissenschaftlich: Testus\\n\\nVollständiger Taxonomiepfad:\\nReich: Animalia\\nStamm: Chordata\\nKlasse: Aves\\nOrdnung: Testordnung\\nFamilie: Testfamilie\\nGattung: Testus\\nArt: Testus"
    initialPreview = props.preview
    choices = { "ok", "cancel", "ok", "cancel" } end
    assert(props == firstProps)
    if openIndex < 3 then if openIndex == 2 then assert(#dialogs == 2 and dialogs[2].title == "Taxonomiedetails – Seite 2 von 2")
    assert(props.preview == initialPreview and props.query == "test" and props.selectedGermanName == "Prüftaxon") end
    find(currentView, "Taxonomiedetails lesen").action() else assert(openIndex == 3 and #dialogs == 4 and dialogs[4].title == "Taxonomiedetails – Seite 2 von 2")
    local before = #requests
    find(currentView, "Art suchen").action()
    assert(#requests == before + 2, "Third search must perform exactly search + taxon")
    assert(requests[before + 1].command == "search" and requests[before + 1].query == "test")
    assert(requests[before + 2].command == "taxon")
    assert(props.canReadDetails and props.canCorrect and not props.busy)
    assert(props.masterTaxonId == "mtx_test" and props.selectedGermanName == "Prüftaxon") end
  `, `
    assert(opened == 3 and closed == 3 and maxFloaters == 1 and #observers.query == 1)
  `);
});


for (const controlTitle of ["Taxonomiedetails lesen", "Schließen"]) {
  test(`Taxonomiedetails: alte Aktion ${controlTitle} kann die neue Generation nicht schließen`, () => {
    executeAssignment("species", `
    if openIndex == 1 then props.query = "test"
    staleAction = find(currentView, "${controlTitle}")
    find(currentView, "Taxonomiedetails lesen").action() else local before = closed
    staleAction.action()
    assert(floatingOpen and closed == before, "Expired view action closed current generation") end
  `, `
    assert(opened == 2 and #dialogs == 1 and closed == 2)
  `);
  });
}
