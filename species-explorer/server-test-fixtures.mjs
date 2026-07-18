import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTestJpeg(width = 3, height = 2) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x0e,
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

export function createTestMp3(seed = 1) {
  const frameLength = 417;
  const frame = Buffer.alloc(frameLength, seed);
  Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame, 0);
  return Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    frame,
    frame,
    frame,
  ]);
}

export function createTestWebp(seed = 1) {
  return Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x08, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP", "ascii"),
    Buffer.alloc(8, seed),
  ]);
}

export function createTestPng(width = 1120, height = 1400) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 2;
  return buffer;
}

export async function createEditableFixture() {
  const root = await mkdtemp(join(tmpdir(), "species-explorer-edit-"));
  const assetDir = join(root, "species-assets", "Amsel");
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(assetDir, { recursive: true });

  const inputList = [{
    german: "Amsel",
    genus: "Turdus",
    species: "merula",
    size: "ca. 23,5-29 cm",
    weight: "ca. 80-110 g",
    life_expectancy: "ca. 3 Jahre",
  }];
  const generatedList = [{
    URLSlug: "turdusmerula",
    "Wissenschaftlicher Name": "Turdus merula",
    "Deutscher Name": "Amsel",
    Gewicht: "ca. 80-110 g",
    Größe: "ca. 23,5-29 cm",
    Lebenserwartung: "ca. 3 Jahre",
    "Assessment ID": 1,
    Status: "LC",
    Trend: "Stabil",
    Kategorie: "Nicht gefährdet",
    Populationgröße: "Unbekannt",
    Generationsdauer: "4 Jahre",
    Kingdom: "ANIMALIA",
    Phylum: "CHORDATA",
    Class: "AVES",
    Order: "PASSERIFORMES",
    Family: "TURDIDAE",
    Genus: "Turdus",
    Species: "merula",
    "Letztes IUCN Update": "2024",
    "Daten abgerufen": "2026-06-19",
  }];
  const report = {
    generatedAt: "2026-06-19T00:00:00.000Z",
    counts: {
      totalSpecies: 1,
      missingSoundMp3: 0,
      missingSoundCredits: 0,
      missingMap: 0,
      missingAssessmentId: 0,
      missingStatus: 0,
      missingCategory: 0,
      missingTrend: 0,
      missingSpeciesAssets: 0,
      ncSoundLicensesAll: 0,
    },
    missing: {
      soundMp3: [],
      soundCredits: [],
      maps: [],
      speciesAssets: [],
      assessmentId: [],
      status: [],
      category: [],
      trend: [],
    },
    ncSoundLicensesAll: [],
  };

  await Promise.all([
    writeFile(join(root, "species_list.json"), `${JSON.stringify(inputList, null, 2)}\n`),
    writeFile(join(root, "speciesData.json"), `${JSON.stringify(generatedList, null, 2)}\n`),
    writeFile(join(root, "fehlende_elemente_report.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(join(root, "docs", "manual-map-overrides.md"), "# Keine manuellen Karten\n"),
    writeFile(join(assetDir, "map.jpg"), Buffer.alloc(256)),
    writeFile(join(assetDir, "sound.mp3"), createTestMp3(1)),
    writeFile(join(assetDir, "spectrogram.webp"), Buffer.alloc(256)),
    writeFile(join(assetDir, "credits.json"), JSON.stringify({
      source: "Test",
      license: "https://creativecommons.org/licenses/by/4.0/",
    })),
  ]);

  return root;
}
