local LrDialogs = import "LrDialogs"
local LrView = import "LrView"

local TaxonomyDetailsView = {}
local CHARACTERS_PER_LINE = 52
local LINES_PER_PAGE = 8

local function pagesFor(text)
  text = tostring(text or ""):gsub("\r\n", "\n"):gsub("\r", "\n")
  if text == "" then text = "Noch keine Art ausgewählt." end
  local lines = {}
  for line in string.gmatch(text .. "\n", "(.-)\n") do
    local start, characters = 1, 0
    for index = 1, #line do
      local byte = string.byte(line, index)
      -- Nur vor einem neuen UTF-8-Zeichen umbrechen; alle Originalbytes
      -- einschließlich Leerzeichen und vollständiger langer Namen erhalten.
      if byte < 128 or byte >= 192 then
        if characters == CHARACTERS_PER_LINE then
          table.insert(lines, string.sub(line, start, index - 1))
          start, characters = index, 0
        end
        characters = characters + 1
      end
    end
    table.insert(lines, string.sub(line, start))
  end
  local pages = {}
  for first = 1, #lines, LINES_PER_PAGE do
    local last = math.min(first + LINES_PER_PAGE - 1, #lines)
    table.insert(pages, { text = table.concat(lines, "\n", first, last), lines = last - first + 1 })
  end
  return pages
end

function TaxonomyDetailsView.show(text)
  local pages = pagesFor(text)
  local factory = LrView.osFactory()
  local page = 1
  while true do
    local last = page == #pages
    local result = LrDialogs.presentModalDialog({
      title = "Taxonomiedetails – Seite " .. tostring(page) .. " von " .. tostring(#pages),
      contents = factory:static_text({
        title = pages[page].text,
        width_in_chars = CHARACTERS_PER_LINE,
        height_in_lines = pages[page].lines,
      }),
      actionVerb = last and "Fertig" or "Weiter",
      cancelVerb = "Schließen",
      otherVerb = page > 1 and "Zurück" or nil,
    })
    if result == "other" and page > 1 then
      page = page - 1
    elseif result == "ok" and not last then
      page = page + 1
    else
      return
    end
  end
end

return TaxonomyDetailsView
