local DataVersionView = {}

local function value(text)
  if type(text) ~= "string" or text == "" then return "nicht verfügbar" end
  return text
end

function DataVersionView.summary(versions)
  if type(versions) ~= "table" then
    return "Datenstand nicht prüfbar. Bitte im Arten-Explorer prüfen."
  end
  return value(versions.message)
end

function DataVersionView.details(versions)
  versions = type(versions) == "table" and versions or {}
  local correction = versions.correctionMode == "overlay"
      and ("Korrekturschicht: " .. value(versions.correctionRevision))
    or "Korrekturen: im Masterstand enthalten"
  if not versions.masterVersion or versions.masterVersion == "" or versions.state == "unverifiable" then
    correction = "Korrekturstand: nicht verfügbar"
  end
  return table.concat({
    "Aktive CoL-Referenz: " .. value(versions.referenceRelease),
    "CoL im Master: " .. value(versions.masterReferenceRelease),
    "Aktiver Master: " .. value(versions.masterVersion),
    "Master im Lightroom-Paket: " .. value(versions.packageMasterVersion),
    "Lightroom-Paket: " .. value(versions.packageId),
    correction,
  }, "\n")
end

return DataVersionView
