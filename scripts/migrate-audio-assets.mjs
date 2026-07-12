import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  audioFormatLabel,
  detectAudioFormat,
  inspectMp3Buffer,
} from "./audio-format.mjs";
import { checkFfmpeg, resolveFfmpegPath } from "./spectrogram-renderer.mjs";

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(args.repoRoot || process.cwd());
const assetsRoot = path.join(repoRoot, "species-assets");
const mode = args.write ? "write" : args.check ? "check" : "dry-run";
const bitrateKbps = positiveInteger(args.bitrate, 160, "bitrate");
const ffmpegPath = resolveFfmpegPath({ repoRoot, explicitPath: args.ffmpeg });

if (!fs.existsSync(assetsRoot)) {
  throw new Error(`Assetordner wurde nicht gefunden: ${assetsRoot}`);
}

const inspected = collectSoundFiles(assetsRoot).map(inspectSoundFile);
const invalid = inspected.filter((entry) => entry.format !== "mp3");
const wavFiles = invalid.filter((entry) => entry.format === "wav");
const unsupported = invalid.filter((entry) => entry.format !== "wav");
const baseResult = {
  mode,
  repoRoot,
  bitrateKbps,
  counts: {
    soundFiles: inspected.length,
    mp3: inspected.length - invalid.length,
    wav: wavFiles.length,
    unsupported: unsupported.length,
  },
  bytes: {
    total: sumBytes(inspected),
    mp3: sumBytes(inspected.filter((entry) => entry.format === "mp3")),
    wav: sumBytes(wavFiles),
    unsupported: sumBytes(unsupported),
  },
  files: inspected.map(publicInspection),
};

if (mode === "check") {
  console.log(JSON.stringify(baseResult, null, 2));
  process.exit(invalid.length ? 1 : 0);
}

if (mode === "dry-run") {
  console.log(JSON.stringify({
    ...baseResult,
    plannedConversions: wavFiles.map(publicInspection),
    error: unsupported.length
      ? "Mindestens eine Datei hat ein nicht unterstütztes Audioformat und kann nicht automatisch migriert werden."
      : "",
  }, null, 2));
  process.exit(unsupported.length ? 2 : 0);
}

if (unsupported.length) {
  throw new Error(
    `Migration abgebrochen: ${unsupported.length} Datei(en) besitzen ein nicht unterstütztes Audioformat.`,
  );
}

if (!wavFiles.length) {
  console.log(JSON.stringify({ ...baseResult, migrated: [], message: "Alle sound.mp3-Dateien sind bereits echte MP3-Dateien." }, null, 2));
  process.exit(0);
}

const ffmpeg = checkFfmpeg(ffmpegPath);
if (!ffmpeg.available) {
  throw new Error(`FFmpeg ist nicht verfügbar: ${ffmpeg.error}`);
}
const ffprobePath = resolveFfprobePath(ffmpegPath);
const ffprobe = checkTool(ffprobePath, ["-version"]);
if (!ffprobe.available) {
  throw new Error(`FFprobe ist nicht verfügbar: ${ffprobe.error}`);
}

const backupRoot = args.backupRoot
  ? path.resolve(repoRoot, args.backupRoot)
  : path.join(repoRoot, "species-explorer", "backups", `audio-format-migration-${timestamp()}`);
if (fs.existsSync(backupRoot)) {
  throw new Error(`Sicherungsordner existiert bereits: ${backupRoot}`);
}
fs.mkdirSync(backupRoot, { recursive: true });

const registryPath = path.join(repoRoot, "species-assets-overrides.json");
if (fs.existsSync(registryPath)) {
  copyVerified(registryPath, path.join(backupRoot, "species-assets-overrides.json"));
}

const prepared = [];
try {
  for (const entry of wavFiles) {
    const relativeSoundPath = path.relative(repoRoot, entry.path);
    const backupSoundPath = path.join(backupRoot, "original", relativeSoundPath);
    copyVerified(entry.path, backupSoundPath);

    const spectrogramPath = path.join(path.dirname(entry.path), "spectrogram.webp");
    if (fs.existsSync(spectrogramPath)) {
      copyVerified(
        spectrogramPath,
        path.join(backupRoot, "original", path.relative(repoRoot, spectrogramPath)),
      );
    }

    const convertedPath = path.join(backupRoot, "converted", relativeSoundPath);
    fs.mkdirSync(path.dirname(convertedPath), { recursive: true });
    const originalDuration = probeDuration(ffprobePath, entry.path);
    transcodeToMp3(ffmpegPath, entry.path, convertedPath, bitrateKbps);
    const convertedBuffer = fs.readFileSync(convertedPath);
    inspectMp3Buffer(convertedBuffer);
    const convertedDuration = probeDuration(ffprobePath, convertedPath);
    const durationTolerance = Math.max(0.25, originalDuration * 0.005);
    if (Math.abs(originalDuration - convertedDuration) > durationTolerance) {
      throw new Error(
        `Dauerprüfung fehlgeschlagen für ${entry.safeName}: ${originalDuration}s -> ${convertedDuration}s`,
      );
    }
    prepared.push({
      ...entry,
      backupPath: backupSoundPath,
      convertedPath,
      originalDuration,
      convertedDuration,
      convertedBytes: convertedBuffer.length,
      convertedSha256: sha256(convertedBuffer),
    });
  }

  const replaced = [];
  try {
    for (const entry of prepared) {
      const incomingPath = `${entry.path}.audio-migration-${process.pid}`;
      const previousPath = `${entry.path}.audio-migration-original-${process.pid}`;
      fs.copyFileSync(entry.convertedPath, incomingPath);
      inspectMp3Buffer(fs.readFileSync(incomingPath));
      fs.renameSync(entry.path, previousPath);
      try {
        fs.renameSync(incomingPath, entry.path);
      } catch (error) {
        fs.renameSync(previousPath, entry.path);
        throw error;
      }
      fs.rmSync(previousPath, { force: true });
      replaced.push(entry);
    }
  } catch (error) {
    for (const entry of replaced.reverse()) {
      fs.copyFileSync(entry.backupPath, entry.path);
    }
    throw error;
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    repoRoot,
    ffmpeg: ffmpeg.version,
    ffprobe: ffprobe.version,
    bitrateKbps,
    files: prepared.map((entry) => ({
      safeName: entry.safeName,
      path: path.relative(repoRoot, entry.path).replaceAll("\\", "/"),
      backupPath: path.relative(repoRoot, entry.backupPath).replaceAll("\\", "/"),
      originalFormat: entry.format,
      originalBytes: entry.bytes,
      originalSha256: entry.sha256,
      originalDuration: entry.originalDuration,
      convertedFormat: "mp3",
      convertedBytes: entry.convertedBytes,
      convertedSha256: entry.convertedSha256,
      convertedDuration: entry.convertedDuration,
    })),
  };
  fs.writeFileSync(path.join(backupRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const after = collectSoundFiles(assetsRoot).map(inspectSoundFile);
  const remainingInvalid = after.filter((entry) => entry.format !== "mp3");
  if (remainingInvalid.length) {
    throw new Error(`Nach der Migration sind noch ${remainingInvalid.length} ungültige sound.mp3-Dateien vorhanden.`);
  }

  console.log(JSON.stringify({
    ...baseResult,
    backupRoot: path.relative(repoRoot, backupRoot).replaceAll("\\", "/"),
    ffmpeg: ffmpeg.version,
    ffprobe: ffprobe.version,
    migrated: manifest.files,
    bytesAfter: sumBytes(after),
    bytesSaved: sumBytes(inspected) - sumBytes(after),
  }, null, 2));
} catch (error) {
  const failurePath = path.join(backupRoot, "FAILED.txt");
  fs.writeFileSync(failurePath, `${new Date().toISOString()}\n${error.stack || error.message}\n`, "utf8");
  throw error;
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (const arg of rawArgs) {
    if (arg === "--write") parsed.write = true;
    else if (arg === "--check") parsed.check = true;
    else if (arg.startsWith("--bitrate=")) parsed.bitrate = arg.slice("--bitrate=".length);
    else if (arg.startsWith("--ffmpeg=")) parsed.ffmpeg = arg.slice("--ffmpeg=".length);
    else if (arg.startsWith("--repo-root=")) parsed.repoRoot = arg.slice("--repo-root=".length);
    else if (arg.startsWith("--backup-root=")) parsed.backupRoot = arg.slice("--backup-root=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/migrate-audio-assets.mjs [options]

Without --write or --check, the script only prints a migration preview.

  --check                 Validate all sound.mp3 files and exit non-zero for non-MP3 content.
  --write                 Back up and convert WAV/PCM content to real MP3 files.
  --bitrate=<kbps>        MP3 bitrate. Default: 160.
  --ffmpeg=<path>         Explicit FFmpeg path.
  --backup-root=<path>    Explicit local backup path.
  --repo-root=<path>      Repository root. Default: current working directory.
`);
      process.exit(0);
    } else {
      throw new Error(`Unbekannter Parameter: ${arg}`);
    }
  }
  if (parsed.write && parsed.check) throw new Error("--write und --check können nicht gemeinsam verwendet werden");
  return parsed;
}

function collectSoundFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      safeName: entry.name,
      path: path.join(root, entry.name, "sound.mp3"),
    }))
    .filter((entry) => fs.existsSync(entry.path))
    .sort((a, b) => a.safeName.localeCompare(b.safeName, "de"));
}

function inspectSoundFile(entry) {
  const buffer = fs.readFileSync(entry.path);
  return {
    ...entry,
    format: detectAudioFormat(buffer),
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
}

function publicInspection(entry) {
  return {
    safeName: entry.safeName,
    path: path.relative(repoRoot, entry.path).replaceAll("\\", "/"),
    format: entry.format,
    formatLabel: audioFormatLabel(entry.format),
    bytes: entry.bytes,
    sha256: entry.sha256,
  };
}

function transcodeToMp3(command, inputPath, outputPath, bitrate) {
  const run = spawnSync(command, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-map_metadata",
    "0",
    "-vn",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    `${bitrate}k`,
    "-id3v2_version",
    "3",
    outputPath,
  ], { encoding: "utf8", windowsHide: true });
  if (run.error || run.status !== 0) {
    throw new Error(`FFmpeg-Konvertierung fehlgeschlagen: ${run.error?.message || run.stderr || `Exit ${run.status}`}`);
  }
}

function probeDuration(command, inputPath) {
  const run = spawnSync(command, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ], { encoding: "utf8", windowsHide: true });
  const duration = Number.parseFloat(String(run.stdout || "").trim());
  if (run.error || run.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`FFprobe-Dauerprüfung fehlgeschlagen für ${inputPath}: ${run.error?.message || run.stderr || run.stdout}`);
  }
  return Number(duration.toFixed(3));
}

function resolveFfprobePath(ffmpegCommand) {
  const resolved = path.resolve(ffmpegCommand);
  if (fs.existsSync(resolved)) {
    const extension = process.platform === "win32" ? ".exe" : "";
    const sibling = path.join(path.dirname(resolved), `ffprobe${extension}`);
    if (fs.existsSync(sibling)) return sibling;
  }
  return "ffprobe";
}

function checkTool(command, toolArgs) {
  const run = spawnSync(command, toolArgs, { encoding: "utf8", windowsHide: true });
  if (run.error || run.status !== 0) {
    return { available: false, version: "", error: run.error?.message || run.stderr || `Exit ${run.status}` };
  }
  return {
    available: true,
    version: String(run.stdout || run.stderr || "").split(/\r?\n/)[0],
    error: "",
  };
}

function copyVerified(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  const sourceHash = sha256(fs.readFileSync(source));
  const targetHash = sha256(fs.readFileSync(target));
  if (sourceHash !== targetHash) throw new Error(`Sicherungsprüfung fehlgeschlagen: ${source}`);
}

function positiveInteger(value, fallback, label) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} muss eine positive Ganzzahl sein`);
  return number;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sumBytes(entries) {
  return entries.reduce((sum, entry) => sum + entry.bytes, 0);
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
