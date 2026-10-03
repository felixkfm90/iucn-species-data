-- Initialization only watches explicit persisted update requests. It does not
-- scan the catalog on Lightroom startup or when a plug-in window is opened.
require("CatalogUsageUpdateWatcher").start()
