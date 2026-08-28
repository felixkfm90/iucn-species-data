local TaxonomyRanks = require "TaxonomyRanks"

local fields = {
  {
    id = "masterTaxonId",
    version = 3,
    title = "Interne Master-Taxon-ID",
    dataType = "string",
    searchable = true,
    browsable = false,
  },
  {
    id = "projectTaxonId",
    version = 2,
    title = "Interne Arten-Explorer-ID",
    dataType = "string",
    searchable = false,
    browsable = false,
  },
  {
    id = "germanName",
    title = "Deutscher Artname",
    dataType = "string",
    searchable = true,
    browsable = true,
  },
  {
    id = "englishName",
    title = "Englischer Artname",
    dataType = "string",
    searchable = true,
    browsable = true,
  },
  {
    id = "scientificName",
    title = "Wissenschaftlicher Artname",
    dataType = "string",
    searchable = true,
    browsable = true,
  },
  {
    id = "taxonRank",
    title = "Taxonomischer Rang",
    dataType = "string",
    searchable = true,
    browsable = true,
  },
  {
    id = "taxonomyPath",
    version = 2,
    title = "Interner Taxonomiepfad",
    dataType = "string",
    searchable = false,
    browsable = false,
  },
  {
    id = "taxonomyKeywordIds",
    version = 1,
    title = "Interne Taxonomie-Stichwort-IDs",
    dataType = "string",
    searchable = false,
    browsable = false,
  },
}

for _, rank in ipairs(TaxonomyRanks.all()) do
  table.insert(fields, {
    id = TaxonomyRanks.metadataFieldId(rank.id),
    version = 2,
    title = rank.label,
    dataType = "string",
    searchable = true,
    browsable = true,
  })
end

table.insert(fields, {
  id = "referenceImage",
  version = 2,
  title = "Favoritenbild der Art",
  dataType = "enum",
  values = {
    { value = "no", title = "Nein" },
    { value = "yes", title = "Ja" },
  },
  searchable = true,
  browsable = true,
})

table.insert(fields, {
  id = "assignedAt",
  title = "Taxonomie zugewiesen am",
  dataType = "string",
  searchable = false,
  browsable = false,
})

return {
  schemaVersion = 6,
  metadataFieldsForPhotos = fields,
}
