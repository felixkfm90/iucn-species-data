return {
  LrSdkVersion = 15.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = "de.fnwildlifetravel.taxonomy",
  LrPluginName = "FN Wildlife Taxonomie",
  LrLibraryMenuItems = {
    {
      title = "Taxonomie zuweisen",
      file = "AssignTaxonomy.lua",
      -- The SDK requires anythingSelected to include video-only selections.
      -- The assignment window validates the actual SDK selection again.
      enabledWhen = "anythingSelected",
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
  LrInitPlugin = "PluginInit.lua",
  LrShutdownPlugin = "PluginShutdown.lua",
  VERSION = {
    major = 0,
    minor = 4,
    revision = 24,
    build = 40,
  },
}
