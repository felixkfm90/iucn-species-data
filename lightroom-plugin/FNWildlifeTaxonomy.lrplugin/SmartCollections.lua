local SmartCollections = {}

local TOOLKIT_ID = "de.fnwildlifetravel.taxonomy"
local COLLECTION_SET_NAME = "FN Wildlife & Travel"
local OBSOLETE_COLLECTION_NAMES = {
  ["5-Sterne-Tierbilder"] = true,
  ["Art-Referenzbilder"] = true,
}

local function textCriterion(field, operation)
  return {
    criteria = "sdktext:" .. TOOLKIT_ID .. "." .. field,
    operation = operation,
  }
end

local function valueCriterion(field, value)
  return {
    criteria = "sdktext:" .. TOOLKIT_ID .. "." .. field,
    operation = "==",
    value = value,
  }
end

local function definitions()
  return {
    {
      name = "Art-Favoriten",
      rules = { valueCriterion("referenceImage", "yes"), combine = "intersect" },
    },
    {
      name = "Taxonomie fehlt",
      rules = {
        textCriterion("masterTaxonId", "empty"),
        textCriterion("scientificName", "empty"),
        combine = "union",
      },
    },
    {
      name = "Taxonomie zugewiesen",
      rules = {
        textCriterion("masterTaxonId", "notEmpty"),
        textCriterion("scientificName", "notEmpty"),
        combine = "intersect",
      },
    },
  }
end

local function findCollectionSet(catalog)
  for _, collectionSet in ipairs(catalog:getChildCollectionSets() or {}) do
    if collectionSet:getName() == COLLECTION_SET_NAME then
      return collectionSet
    end
  end
  return nil
end

function SmartCollections.create(catalog)
  local collectionSet = findCollectionSet(catalog)
  local targetDefinitions = definitions()
  local definitionsByName = {}
  for _, definition in ipairs(targetDefinitions) do
    definitionsByName[definition.name] = definition
  end

  local existingByName = {}
  local obsoleteCollections = {}
  if collectionSet then
    for _, collection in ipairs(collectionSet:getChildCollections() or {}) do
      local name = collection:getName()
      if OBSOLETE_COLLECTION_NAMES[name] then
        table.insert(obsoleteCollections, collection)
      elseif definitionsByName[name] then
        if not collection:isSmartCollection() then
          error("Im Sammlungssatz '" .. COLLECTION_SET_NAME .. "' ist '" .. name .. "' keine Smart-Sammlung.")
        end
        existingByName[name] = collection
      end
    end
  end

  local created = 0
  local updated = 0
  local removed = 0
  catalog:withWriteAccessDo("FN Wildlife-Sammlungen einrichten", function()
    if not collectionSet then
      collectionSet = catalog:createCollectionSet(COLLECTION_SET_NAME, nil, false)
    end

    for _, collection in ipairs(obsoleteCollections) do
      collection:delete()
      removed = removed + 1
    end

    for _, definition in ipairs(targetDefinitions) do
      local existing = existingByName[definition.name]
      if existing then
        existing:setSearchDescription(definition.rules)
        updated = updated + 1
      else
        catalog:createSmartCollection(definition.name, definition.rules, collectionSet, false)
        created = created + 1
      end
    end
  end)
  return {
    created = created,
    updated = updated,
    removed = removed,
    total = #targetDefinitions,
  }
end

return SmartCollections
