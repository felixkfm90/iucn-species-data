local TaxonomyRanks = {}

local RANKS = {
  { id = "domain", label = "Domäne" },
  { id = "superkingdom", label = "Überreich" },
  { id = "kingdom", label = "Reich" },
  { id = "subkingdom", label = "Unterreich" },
  { id = "infrakingdom", label = "Infrareich" },
  { id = "superphylum", label = "Überstamm" },
  { id = "phylum", label = "Stamm" },
  { id = "subphylum", label = "Unterstamm" },
  { id = "infraphylum", label = "Infrastamm" },
  { id = "parvphylum", label = "Parvstamm" },
  { id = "superclass", label = "Überklasse" },
  { id = "megaclass", label = "Megaklasse" },
  { id = "class", label = "Klasse" },
  { id = "subclass", label = "Unterklasse" },
  { id = "infraclass", label = "Infraklasse" },
  { id = "parvclass", label = "Parvklasse" },
  { id = "superorder", label = "Überordnung" },
  { id = "order", label = "Ordnung" },
  { id = "suborder", label = "Unterordnung" },
  { id = "infraorder", label = "Infraordnung" },
  { id = "parvorder", label = "Parvordnung" },
  { id = "superfamily", label = "Überfamilie" },
  { id = "family", label = "Familie" },
  { id = "subfamily", label = "Unterfamilie" },
  { id = "tribe", label = "Tribus" },
  { id = "subtribe", label = "Untertribus" },
  { id = "genus", label = "Gattung" },
  { id = "subgenus", label = "Untergattung" },
  { id = "section", label = "Sektion" },
  { id = "species", label = "Art" },
  { id = "subspecies", label = "Unterart" },
  { id = "variety", label = "Varietät" },
  { id = "form", label = "Form" },
}

local BY_ID = {}
for _, rank in ipairs(RANKS) do
  BY_ID[rank.id] = rank
end

function TaxonomyRanks.cleanText(value)
  if value == nil then
    return ""
  end
  if type(value) == "table" then
    -- JSON-null wird vom lokalen Decoder als Tabelle dargestellt.
    for _, key in ipairs({ "value", "text", "name" }) do
      if type(value[key]) == "string" then
        return TaxonomyRanks.cleanText(value[key])
      end
    end
    return ""
  end
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

function TaxonomyRanks.all()
  return RANKS
end

function TaxonomyRanks.label(rankId)
  local rank = BY_ID[TaxonomyRanks.cleanText(rankId)]
  return rank and rank.label or TaxonomyRanks.cleanText(rankId)
end

function TaxonomyRanks.metadataFieldId(rankId)
  local cleaned = TaxonomyRanks.cleanText(rankId)
  if cleaned == "" then
    return ""
  end
  return "taxonomy" .. string.upper(string.sub(cleaned, 1, 1)) .. string.sub(cleaned, 2)
end

function TaxonomyRanks.displayTaxon(entry, taxon)
  local scientificName = TaxonomyRanks.cleanText(entry and entry.scientificName)
  local germanName = TaxonomyRanks.cleanText(entry and entry.germanName)
  local rank = TaxonomyRanks.cleanText(entry and entry.rank)
  if germanName == "" and rank == "species" then
    germanName = TaxonomyRanks.cleanText(taxon and taxon.germanName)
  end
  return germanName ~= "" and germanName or scientificName
end

return TaxonomyRanks
