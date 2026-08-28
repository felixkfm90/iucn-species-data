local TaxonomyHelper = require "TaxonomyHelper"

local function statusText(status)
  if status.available then
    local version = status.masterVersion ~= "" and (" · Master " .. status.masterVersion) or ""
    return "Lokales Suchpaket bereit · " .. tostring(status.taxonCount or 0) .. " Taxa" .. version
  end
  return "Lokales Suchpaket nicht verfügbar. Es wird vom Arten-Explorer bereitgestellt."
end

return {
  sectionsForTopOfDialog = function(factory)
    local status = TaxonomyHelper.searchPackageStatus()
    return {
      {
        title = "FN Wildlife Taxonomie",
        synopsis = "Version 0.4.8.0",
        factory:column({
          spacing = factory:control_spacing(),
          factory:static_text({ title = "Version: 0.4.8.0" }),
          factory:static_text({ title = statusText(status), width_in_chars = 78 }),
          factory:static_text({
            title = "Suchpaket: " .. (status.root ~= "" and status.root or "nicht ermittelbar"),
            width_in_chars = 78,
            selectable = true,
          }),
          factory:static_text({
            title = "Taxonomiedatenbank, Aktualisierungen und Sicherungen werden zentral im Arten-Explorer verwaltet.",
            width_in_chars = 78,
          }),
        }),
      },
    }
  end,
}
