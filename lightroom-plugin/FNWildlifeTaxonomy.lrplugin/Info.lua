return {
  LrSdkVersion = 15.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = "de.fnwildlifetravel.taxonomy",
  LrPluginName = "FN Wildlife Taxonomie",
  LrLibraryMenuItems = {
    {
      title = "Taxonomie zuweisen ...",
      file = "AssignTaxonomy.lua",
    },
    {
      title = "Ausgewähltes Foto als bevorzugtes Artbild markieren ...",
      file = "SetReferenceImage.lua",
    },
    {
      title = "FN Wildlife-Sammlungen einrichten ...",
      file = "CreateCollections.lua",
    },
    {
      title = "Taxonomie-Statistik ...",
      file = "ShowStatistics.lua",
    },
  },
  LrMetadataProvider = "MetadataDefinition.lua",
  LrMetadataTagsetFactory = "MetadataTagset.lua",
  LrPluginInfoProvider = "PluginInfoProvider.lua",
  VERSION = {
    major = 0,
    minor = 4,
    revision = 0,
    build = 0,
  },
}
