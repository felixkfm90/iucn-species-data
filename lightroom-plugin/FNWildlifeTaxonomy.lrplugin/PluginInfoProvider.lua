local TaxonomyHelper = require "TaxonomyHelper"
local DataVersionView = require "DataVersionView"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local function statusText(status)
  if status.available then
    local master = status.packageMasterVersion or status.masterVersion or ""
    local version = master ~= "" and (" · Master " .. master) or ""
    return "Lokales Suchpaket bereit · " .. tostring(status.taxonCount or 0) .. " Taxa" .. version
  end
  return "Lokales Suchpaket nicht verfügbar. Es wird vom Arten-Explorer bereitgestellt."
end

local function refreshVersions(props)
  if props.fnVersionBusy then return end
  props.fnVersionBusy = true
  props.fnVersionStatus = "Lokale Datenstände werden geprüft ..."
  LrTasks.startAsyncTask(function()
    local ok, versions = LrTasks.pcall(TaxonomyHelper.request, { command = "versions" })
    props.fnVersionStatus = ok and DataVersionView.summary(versions)
      or "Datenstand nicht prüfbar. Die lokale Suchhilfe konnte nicht ausgeführt werden."
    props.fnVersionDetails = DataVersionView.details(ok and versions or nil)
    if ok and type(versions) == "table" then
      props.fnPackageStatus = statusText(versions)
    end
    props.fnVersionBusy = false
  end)
end

return {
  sectionsForTopOfDialog = function(factory, propertyTable)
    local status = TaxonomyHelper.searchPackageStatus()
    propertyTable.fnPackageStatus = statusText(status)
    propertyTable.fnVersionDetails = DataVersionView.details(nil)
    refreshVersions(propertyTable)
    return {
      {
        title = "FN Wildlife Taxonomie",
        synopsis = "Version 0.4.24.8",
        factory:column({
          bind_to_object = propertyTable,
          spacing = factory:control_spacing(),
          factory:static_text({ title = "Version: 0.4.24.8" }),
          factory:static_text({ title = LrView.bind("fnPackageStatus"), width_in_chars = 78 }),
          factory:static_text({ title = LrView.bind("fnVersionStatus"), width_in_chars = 78, height_in_lines = 2 }),
          factory:static_text({ title = LrView.bind("fnVersionDetails"), width_in_chars = 78, height_in_lines = 7, selectable = true }),
          factory:push_button({
            title = "Datenstand erneut prüfen",
            action = function() refreshVersions(propertyTable) end,
          }),
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
