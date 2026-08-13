local KeywordWriter = {}

local RANK_LABELS = {
  domain = "Domäne",
  superkingdom = "Überreich",
  kingdom = "Reich",
  subkingdom = "Unterreich",
  infrakingdom = "Infrareich",
  superphylum = "Überstamm",
  phylum = "Stamm",
  subphylum = "Unterstamm",
  infraphylum = "Infrastamm",
  parvphylum = "Parvstamm",
  superclass = "Überklasse",
  megaclass = "Megaklasse",
  class = "Klasse",
  subclass = "Unterklasse",
  infraclass = "Infraklasse",
  parvclass = "Parvklasse",
  superorder = "Überordnung",
  order = "Ordnung",
  suborder = "Unterordnung",
  infraorder = "Infraordnung",
  parvorder = "Parvordnung",
  superfamily = "Überfamilie",
  family = "Familie",
  subfamily = "Unterfamilie",
  tribe = "Tribus",
  subtribe = "Untertribus",
  genus = "Gattung",
  subgenus = "Untergattung",
  section = "Sektion",
  species = "Art",
  subspecies = "Unterart",
  variety = "Varietät",
  form = "Form",
}

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

local function createKeyword(catalog, name, parent)
  return catalog:createKeyword(name, {}, true, parent, true)
end

local function displayTaxon(entry)
  local scientificName = cleanText(entry.scientificName)
  local germanName = cleanText(entry.germanName)
  if germanName ~= "" and germanName ~= scientificName then
    return germanName .. " (" .. scientificName .. ")"
  end
  return scientificName
end

local function addNameKeyword(catalog, photos, namesRoot, language, value)
  value = cleanText(value)
  if value == "" then
    return 0
  end
  local languageRoot = createKeyword(catalog, language, namesRoot)
  local keyword = createKeyword(catalog, value, languageRoot)
  for _, photo in ipairs(photos) do
    photo:addKeyword(keyword)
  end
  return 1
end

function KeywordWriter.findConflicts(photos, taxon)
  local conflicts = {}
  for _, photo in ipairs(photos) do
    local existingId = cleanText(photo:getPropertyForPlugin(_PLUGIN, "masterTaxonId"))
    if existingId ~= "" and existingId ~= taxon.masterTaxonId then
      table.insert(conflicts, photo)
    end
  end
  return conflicts
end

function KeywordWriter.assign(catalog, photos, taxon)
  local conflicts = KeywordWriter.findConflicts(photos, taxon)
  if #conflicts > 0 then
    error(
      tostring(#conflicts)
        .. " ausgewählte Foto(s) besitzen bereits eine andere Taxonomiezuordnung. "
        .. "Der Prototyp überschreibt diese nicht."
    )
  end

  local hierarchyPath = {}
  local keywordCount = 0
  catalog:withWriteAccessDo("FN Wildlife Taxonomie zuweisen", function()
    local root = createKeyword(catalog, "FN Wildlife & Travel", nil)
    local taxonomyRoot = createKeyword(catalog, "Taxonomie", root)
    local parent = taxonomyRoot
    for _, entry in ipairs(taxon.hierarchy or {}) do
      local value = displayTaxon(entry)
      if value ~= "" then
        local rankLabel = RANK_LABELS[entry.rank] or cleanText(entry.rank)
        local keywordName = rankLabel .. ": " .. value
        parent = createKeyword(catalog, keywordName, parent)
        table.insert(hierarchyPath, keywordName)
        for _, photo in ipairs(photos) do
          photo:addKeyword(parent)
        end
        keywordCount = keywordCount + 1
      end
    end

    local namesRoot = createKeyword(catalog, "Artnamen", root)
    keywordCount = keywordCount + addNameKeyword(
      catalog,
      photos,
      namesRoot,
      "Deutsch",
      taxon.germanName
    )
    keywordCount = keywordCount + addNameKeyword(
      catalog,
      photos,
      namesRoot,
      "Englisch",
      taxon.englishName
    )
    keywordCount = keywordCount + addNameKeyword(
      catalog,
      photos,
      namesRoot,
      "Wissenschaftlich",
      taxon.acceptedScientificName
    )

    local projectTaxonId = ""
    if taxon.projectLinks and taxon.projectLinks[1] then
      projectTaxonId = cleanText(taxon.projectLinks[1].project_taxon_key)
    end
    local assignedAt = os.date("!%Y-%m-%dT%H:%M:%SZ")
    local taxonomyPath = table.concat(hierarchyPath, " > ")
    for _, photo in ipairs(photos) do
      photo:setPropertyForPlugin(_PLUGIN, "masterTaxonId", taxon.masterTaxonId)
      photo:setPropertyForPlugin(_PLUGIN, "projectTaxonId", projectTaxonId)
      photo:setPropertyForPlugin(_PLUGIN, "germanName", cleanText(taxon.germanName))
      photo:setPropertyForPlugin(_PLUGIN, "englishName", cleanText(taxon.englishName))
      photo:setPropertyForPlugin(
        _PLUGIN,
        "scientificName",
        cleanText(taxon.acceptedScientificName)
      )
      photo:setPropertyForPlugin(_PLUGIN, "taxonRank", cleanText(taxon.rank))
      photo:setPropertyForPlugin(_PLUGIN, "taxonomyPath", taxonomyPath)
      photo:setPropertyForPlugin(_PLUGIN, "assignedAt", assignedAt)
    end
  end)

  return {
    photoCount = #photos,
    keywordCount = keywordCount,
    hierarchyCount = #hierarchyPath,
  }
end

function KeywordWriter.rankLabel(rank)
  return RANK_LABELS[rank] or tostring(rank or "")
end

return KeywordWriter
