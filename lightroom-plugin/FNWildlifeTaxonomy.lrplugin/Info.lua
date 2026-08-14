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
      title = "Ausgewähltes Foto als Art-Referenzbild festlegen ...",
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
  VERSION = {
    major = 0,
    minor = 3,
    revision = 4,
    build = 0,
  },
}
