local TaxonomyRanks = require "TaxonomyRanks"

local fields = {
  {
    id = "masterTaxonId",
    title = "Interne Master-Taxon-ID",
    dataType = "string",
    searchable = false,
    browsable = false,
  },
  {
    id = "projectTaxonId",
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
    title = "Interner Taxonomiepfad",
    dataType = "string",
    searchable = false,
    browsable = false,
  },
}

for _, rank in ipairs(TaxonomyRanks.all()) do
  table.insert(fields, {
    id = TaxonomyRanks.metadataFieldId(rank.id),
    title = rank.label .. " (wissenschaftlich)",
    dataType = "string",
    searchable = true,
    browsable = true,
  })
end

table.insert(fields, {
  id = "referenceImage",
  title = "Bevorzugtes Artbild",
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
  schemaVersion = 3,
  metadataFieldsForPhotos = fields,
}
