import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { assertTestTempPath, tmpdir } from "../scripts/test-temp.mjs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveFfmpegPath } from "../scripts/spectrogram-renderer.mjs";
import { fileURLToPath } from "node:url";

const imageFixtures = new Map();

export function serverFixtureStoragePaths(repoRoot) {
  if (typeof repoRoot !== "string" || !repoRoot) throw new Error("Server-Test benötigt seinen eigenen Fixture-Ordner.");
  const root = assertTestTempPath(repoRoot);
  return { taxonomyRoot: join(root, "Daten", "taxonomy"), lightroomSearchRoot: join(root, "Daten", "lightroom") };
}

export async function withServerFixtureStorageEnvironment(repoRoot, operation) {
  const paths = serverFixtureStoragePaths(repoRoot);
  const values = { FN_EXPLORER_DATA_ROOT: join(repoRoot, "Daten"), IUCN_TAXONOMY_DIR: paths.taxonomyRoot,
    FN_LIGHTROOM_SEARCH_ROOT: paths.lightroomSearchRoot };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return await operation(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createTestImage(format, width, height, seed = 1) {
  const key = `${format}/${width}/${height}/${seed}`;
  if (!imageFixtures.has(key)) {
    const color = ((seed * 104729) % 0xffffff).toString(16).padStart(6, "0");
    const ffmpeg = resolveFfmpegPath({ repoRoot: fileURLToPath(new URL("../", import.meta.url)) });
    const run = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
      `color=c=0x${color}:s=16x16`, "-vf", `scale=${width}:${height},format=rgb24`,
      "-frames:v", "1", "-threads", "1", "-c:v", { jpeg: "mjpeg", png: "png", webp: "libwebp" }[format],
      "-f", "image2pipe", "pipe:1"], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    if (run.error || run.status !== 0 || !run.stdout?.length) throw new Error(`Echtes ${format}-Testbild konnte nicht erzeugt werden: ${run.error?.message || run.stderr}`);
    imageFixtures.set(key, run.stdout);
  }
  return Buffer.from(imageFixtures.get(key));
}

export function registerFixtureCleanup(context, repoRoot) {
  const servers = [];
  context.after(async () => {
    for (const server of servers) await server.close();
    await rm(repoRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
  });
  return (server) => servers.push(server);
}

export function createTestJpeg(width = 3, height = 2) {
  return createTestImage("jpeg", width, height);
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
  return createTestImage("webp", 8, 8, seed);
}

export function createTestPng(width = 1120, height = 1400) {
  return createTestImage("png", width, height);
}

export async function createEditableFixture() {
  const root = await mkdtemp(join(tmpdir(), "species-explorer-edit-"));
  const assetDir = join(root, "species-assets", "Amsel");
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(assetDir, { recursive: true });

  const inputList = [{
    german: "Amsel",
    english: "Eurasian Blackbird",
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
    "Englischer Name": "Eurasian Blackbird",
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
