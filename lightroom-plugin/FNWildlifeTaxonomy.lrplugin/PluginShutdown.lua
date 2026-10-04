-- Stop/reload invalidation only. This is not a catalog-close certificate and
-- never creates, refreshes or confirms a usage receipt during shutdown.
require("CatalogUsageUpdateWatcher").stop()
require("TempSession").shutdown()
