local SmartCollections = {}

local TOOLKIT_ID = "de.fnwildlifetravel.taxonomy"

local function textCriterion(field, operation)
  return {
    criteria = "sdktext:" .. TOOLKIT_ID .. "." .. field,
    operation = operation,
  }
end

local function valueCriterion(field, value)
  return {
    criteria = "sdk:" .. TOOLKIT_ID .. "." .. field,
    operation = "==",
    value = value,
  }
end

function SmartCollections.create(catalog)
  local created = 0
  catalog:withWriteAccessDo("FN Wildlife-Sammlungen einrichten", function()
    local collectionSet = catalog:createCollectionSet("FN Wildlife & Travel", nil, true)
    local definitions = {
      {
        name = "Taxonomie zugewiesen",
        rules = { textCriterion("masterTaxonId", "notEmpty"), combine = "intersect" },
      },
      {
        name = "Taxonomie fehlt",
        rules = { textCriterion("masterTaxonId", "empty"), combine = "intersect" },
      },
      {
        name = "Art-Favoriten",
        rules = { valueCriterion("referenceImage", "yes"), combine = "intersect" },
      },
    }
    for _, definition in ipairs(definitions) do
      catalog:createSmartCollection(definition.name, definition.rules, collectionSet, true)
      created = created + 1
    end
  end)
  return created
end

return SmartCollections
