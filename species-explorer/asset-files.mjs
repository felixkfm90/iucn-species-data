export const SPECIES_ASSET_FILE_NAMES = Object.freeze([
  "map.jpg",
  "sound.mp3",
  "credits.json",
  "spectrogram.webp",
  "portrait.webp",
  "portrait.json",
]);

const speciesAssetFileNames = new Set(SPECIES_ASSET_FILE_NAMES);

export function isSpeciesAssetFileName(value) {
  return speciesAssetFileNames.has(value);
}
