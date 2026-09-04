return {
  LrSdkVersion = 15.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = "de.fnwildlifetravel.taxonomy",
  LrPluginName = "FN Wildlife Taxonomie",
  LrLibraryMenuItems = {
    {
      title = "Taxonomie zuweisen",
      file = "AssignTaxonomy.lua",
      enabledWhen = "photosSelected",
    },
    {
      title = "FN Wildlife verwalten ...",
      file = "PluginMenu.lua",
    },
  },
  LrMetadataProvider = "MetadataDefinition.lua",
  LrMetadataTagsetFactory = {
    "MetadataTagset.lua",
    "MetadataTagsetFull.lua",
  },
  LrPluginInfoProvider = "PluginInfoProvider.lua",
  VERSION = {
    major = 0,
    minor = 4,
    revision = 24,
    build = 6,
  },
}
