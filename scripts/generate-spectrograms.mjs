import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  DEFAULT_SPECTROGRAM_OPTIONS,
  checkFfmpeg,
  renderSpectrogram,
  resolveFfmpegPath,
} from "./spectrogram-renderer.mjs";

const DEFAULT_WIDTH = DEFAULT_SPECTROGRAM_OPTIONS.width;
const DEFAULT_HEIGHT = DEFAULT_SPECTROGRAM_OPTIONS.height;
const DEFAULT_INNER_HEIGHT = DEFAULT_SPECTROGRAM_OPTIONS.innerHeight;
const DEFAULT_TOP_PADDING = DEFAULT_SPECTROGRAM_OPTIONS.topPadding;
const DEFAULT_FORMAT = "webp";
const DEFAULT_OUTPUT_NAME = "spectrogram";
const DEFAULT_COLOR = DEFAULT_SPECTROGRAM_OPTIONS.color;
const DEFAULT_SCALE = DEFAULT_SPECTROGRAM_OPTIONS.scale;
const DEFAULT_GAIN = DEFAULT_SPECTROGRAM_OPTIONS.gain;
const DEFAULT_STOP = DEFAULT_SPECTROGRAM_OPTIONS.stop;
const DEFAULT_DRANGE = DEFAULT_SPECTROGRAM_OPTIONS.drange;
const DEFAULT_CONTRAST = DEFAULT_SPECTROGRAM_OPTIONS.contrast;
const DEFAULT_BRIGHTNESS = DEFAULT_SPECTROGRAM_OPTIONS.brightness;
const DEFAULT_QUALITY = DEFAULT_SPECTROGRAM_OPTIONS.quality;

const args = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const speciesAssetsDir = path.join(cwd, "species-assets");
const ffmpegPath = resolveFfmpegPath({ repoRoot: cwd, explicitPath: args.ffmpeg });
const format = normalizeFormat(args.format || DEFAULT_FORMAT);
const outputFileName = `${args.outputName || DEFAULT_OUTPUT_NAME}.${format}`;
const width = positiveInteger(args.width, DEFAULT_WIDTH, "width");
const height = positiveInteger(args.height, DEFAULT_HEIGHT, "height");
const innerHeight = positiveInteger(args.innerHeight, DEFAULT_INNER_HEIGHT, "inner-height");
const topPadding = nonNegativeInteger(args.topPadding, DEFAULT_TOP_PADDING, "top-padding");
const gain = Number.isFinite(Number(args.gain)) ? Number(args.gain) : DEFAULT_GAIN;
const stop = nonNegativeInteger(args.stop, DEFAULT_STOP, "stop");
const drange = positiveNumber(args.drange, DEFAULT_DRANGE, "drange");
const contrast = positiveNumber(args.contrast, DEFAULT_CONTRAST, "contrast");
const brightness = finiteNumber(args.brightness, DEFAULT_BRIGHTNESS, "brightness");
const quality = positiveInteger(args.quality, DEFAULT_QUALITY, "quality");
const color = args.color || DEFAULT_COLOR;
const scale = args.scale || DEFAULT_SCALE;

if (innerHeight > height) {
  throw new Error("inner-height must be less than or equal to height");
}

if (topPadding + innerHeight > height) {
  throw new Error("top-padding plus inner-height must be less than or equal to height");
}

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!fs.existsSync(speciesAssetsDir)) {
  throw new Error(`Species assets directory not found: ${speciesAssetsDir}`);
}

const ffmpeg = checkFfmpeg(ffmpegPath);
const existingRegistry = fs.existsSync(path.join(cwd, "species-assets-overrides.json"))
  ? JSON.parse(fs.readFileSync(path.join(cwd, "species-assets-overrides.json"), "utf8"))
  : { version: 1, assets: {} };
const jobs = collectJobs({
  speciesAssetsDir,
  speciesFilter: args.species,
  outputRoot: args.outputRoot,
  outputFileName,
  force: Boolean(args.force),
  registry: existingRegistry,
});

const result = {
  generatedAt: new Date().toISOString(),
  dryRun: Boolean(args.dryRun),
  ffmpeg: {
    path: ffmpegPath,
    available: ffmpeg.available,
    version: ffmpeg.version,
    error: ffmpeg.error,
  },
  options: {
    width,
    height,
    innerHeight,
    topPadding,
    format,
    outputFileName,
    color,
    scale,
    gain,
    stop,
    drange,
    contrast,
    brightness,
    quality,
    force: Boolean(args.force),
    outputRoot: args.outputRoot || null,
    species: args.species,
  },
  counts: {
    discovered: jobs.length,
    pending: jobs.filter((job) => job.action === "generate").length,
    skipped: jobs.filter((job) => job.action === "skip").length,
    missingMp3: jobs.filter((job) => job.action === "missing-mp3").length,
  },
  jobs: jobs.map(publicJob),
};

if (args.dryRun) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (!ffmpeg.available) {
  result.error = "ffmpeg is not available. Install ffmpeg, add it to PATH, set FFMPEG_PATH, or pass --ffmpeg=<path>.";
  console.log(JSON.stringify(result, null, 2));
  process.exit(2);
}

const runResults = [];
for (const job of jobs) {
  if (job.action !== "generate") {
    runResults.push({ ...publicJob(job), status: job.action });
    continue;
  }

  const runResult = await generateSpectrogram({
    job,
    ffmpegPath,
    width,
    height,
    innerHeight,
    topPadding,
    color,
    scale,
    gain,
    stop,
    drange,
    contrast,
    brightness,
    quality,
    format,
  });
  runResults.push(runResult);
}

result.results = runResults;
result.counts.generated = runResults.filter((entry) => entry.status === "generated").length;
result.counts.failed = runResults.filter((entry) => entry.status === "failed").length;
result.counts.skipped = runResults.filter((entry) => entry.status === "skip").length;
if (!args.outputRoot && outputFileName === "spectrogram.webp") {
  result.hashRegistry = updateSpectrogramHashRegistry({
    registryPath: path.join(cwd, "species-assets-overrides.json"),
    jobs,
    runResults,
    options: result.options,
  });
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.counts.failed ? 1 : 0);

function parseArgs(rawArgs) {
  const parsed = {
    species: [],
  };

  for (const arg of rawArgs) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg.startsWith("--species=")) {
      const values = arg
        .slice("--species=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      parsed.species.push(...values);
    } else if (arg.startsWith("--ffmpeg=")) parsed.ffmpeg = arg.slice("--ffmpeg=".length);
    else if (arg.startsWith("--output-root=")) parsed.outputRoot = arg.slice("--output-root=".length);
    else if (arg.startsWith("--output-name=")) parsed.outputName = arg.slice("--output-name=".length);
    else if (arg.startsWith("--format=")) parsed.format = arg.slice("--format=".length);
    else if (arg.startsWith("--width=")) parsed.width = arg.slice("--width=".length);
    else if (arg.startsWith("--height=")) parsed.height = arg.slice("--height=".length);
    else if (arg.startsWith("--inner-height=")) parsed.innerHeight = arg.slice("--inner-height=".length);
    else if (arg.startsWith("--top-padding=")) parsed.topPadding = arg.slice("--top-padding=".length);
    else if (arg.startsWith("--color=")) parsed.color = arg.slice("--color=".length);
    else if (arg.startsWith("--scale=")) parsed.scale = arg.slice("--scale=".length);
    else if (arg.startsWith("--gain=")) parsed.gain = arg.slice("--gain=".length);
    else if (arg.startsWith("--stop=")) parsed.stop = arg.slice("--stop=".length);
    else if (arg.startsWith("--drange=")) parsed.drange = arg.slice("--drange=".length);
    else if (arg.startsWith("--contrast=")) parsed.contrast = arg.slice("--contrast=".length);
    else if (arg.startsWith("--brightness=")) parsed.brightness = arg.slice("--brightness=".length);
    else if (arg.startsWith("--quality=")) parsed.quality = arg.slice("--quality=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run generate:spectrograms -- [options]

Options:
  --dry-run                 List planned actions without writing files.
  --force                   Recreate existing spectrograms even when up to date.
  --species=<SafeName>      Generate one or more species. Comma-separated values are supported.
  --ffmpeg=<path>           Path to ffmpeg. Defaults to FFMPEG_PATH or ffmpeg from PATH.
  --output-root=<dir>       Write to another root, e.g. Testlauf/spectrograms.
  --output-name=<name>      Base output file name. Default: ${DEFAULT_OUTPUT_NAME}.
  --format=<webp|png>       Output format. Default: ${DEFAULT_FORMAT}.
  --width=<px>              Output width. Default: ${DEFAULT_WIDTH}.
  --height=<px>             Final output height. Default: ${DEFAULT_HEIGHT}.
  --inner-height=<px>       Spectrogram drawing height before padding. Default: ${DEFAULT_INNER_HEIGHT}.
  --top-padding=<px>        White top padding. Remaining height becomes bottom padding. Default: ${DEFAULT_TOP_PADDING}.
  --color=<ffmpeg-value>    showspectrumpic color option. Default: ${DEFAULT_COLOR}.
  --scale=<ffmpeg-value>    showspectrumpic scale option. Default: ${DEFAULT_SCALE}.
  --gain=<number>           showspectrumpic gain option. Default: ${DEFAULT_GAIN}.
  --stop=<hz>               Upper frequency limit. 0 lets ffmpeg use the full range. Default: ${DEFAULT_STOP}.
  --drange=<number>         showspectrumpic dynamic range. Default: ${DEFAULT_DRANGE}.
  --contrast=<number>       Final grayscale contrast. Default: ${DEFAULT_CONTRAST}.
  --brightness=<number>     Final grayscale brightness. Default: ${DEFAULT_BRIGHTNESS}.
  --quality=<number>        WebP quality. Default: ${DEFAULT_QUALITY}.

Examples:
  npm.cmd run --silent generate:spectrograms -- --dry-run
  npm.cmd run --silent generate:spectrograms -- --species=Amsel --output-root=Testlauf/spectrograms
`);
}

function normalizeFormat(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "webp" || normalized === "png") return normalized;
  throw new Error(`Unsupported format: ${value}. Use webp or png.`);
}

function positiveInteger(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer`);
  return parsed;
}

function positiveNumber(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number`);
  return parsed;
}

function finiteNumber(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function collectJobs({
  speciesAssetsDir,
  speciesFilter,
  outputRoot,
  outputFileName,
  force,
  registry,
}) {
  const selected = new Set((speciesFilter || []).map((name) => name.toLowerCase()));
  const assetDirs = fs.existsSync(speciesAssetsDir)
    ? fs
      .readdirSync(speciesAssetsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    : [];
  const dirs = assetDirs
    .filter((safeName) => !selected.size || selected.has(safeName.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "de"));

  return dirs.map((safeName) => {
    const assetDir = path.join(speciesAssetsDir, safeName);
    const inputPath = path.join(assetDir, "sound.mp3");
    const outputDir = outputRoot ? path.resolve(cwd, outputRoot, safeName) : assetDir;
    const outputPath = path.join(outputDir, outputFileName);

    if (!fs.existsSync(inputPath)) {
      return { safeName, inputPath, outputPath, action: "missing-mp3", reason: "MP3 not found" };
    }

    if (!force && fs.existsSync(outputPath)) {
      const registered = registry.assets?.[safeName]?.spectrogram;
      if (
        registered?.stale === false
        && registered.soundSha256 === fileSha256(inputPath)
        && registered.spectrogramSha256 === fileSha256(outputPath)
      ) {
        const inputStat = fs.statSync(inputPath);
        const outputStat = fs.statSync(outputPath);
        return {
          safeName,
          inputPath,
          outputPath,
          action: "skip",
          reason: "registered sound and spectrogram hashes match",
          inputBytes: inputStat.size,
          outputBytes: outputStat.size,
        };
      }
    }

    const inputStat = fs.statSync(inputPath);
    return {
      safeName,
      inputPath,
      outputPath,
      action: "generate",
      reason: force ? "forced" : "missing or hash mismatch",
      inputBytes: inputStat.size,
    };
  });
}

function publicJob(job) {
  return {
    safeName: job.safeName,
    input: relativeToCwd(job.inputPath),
    output: relativeToCwd(job.outputPath),
    action: job.action,
    reason: job.reason,
    inputBytes: job.inputBytes,
    outputBytes: job.outputBytes,
  };
}

async function generateSpectrogram({
  job,
  ffmpegPath,
  width,
  height,
  innerHeight,
  topPadding,
  color,
  scale,
  gain,
  stop,
  drange,
  contrast,
  brightness,
  quality,
  format,
}) {
  try {
    const rendered = await renderSpectrogram({
      inputPath: job.inputPath,
      outputPath: job.outputPath,
      ffmpegPath,
      options: {
        width,
        height,
        innerHeight,
        topPadding,
        color,
        scale,
        gain,
        stop,
        drange,
        contrast,
        brightness,
        quality,
        format,
      },
    });
    return {
      ...publicJob(job),
      status: "generated",
      outputBytes: rendered.outputBytes,
    };
  } catch (error) {
    return {
      ...publicJob(job),
      status: "failed",
      ffmpegStatus: error.ffmpegStatus ?? 1,
      stderr: error.message,
    };
  }
}

function updateSpectrogramHashRegistry({ registryPath, jobs, runResults, options }) {
  const currentText = fs.existsSync(registryPath)
    ? fs.readFileSync(registryPath, "utf8")
    : "";
  const registry = currentText
    ? JSON.parse(currentText)
    : { version: 1, assets: {} };
  registry.version = 1;
  registry.assets ??= {};
  registry.spectrogramGenerator = {
    version: 1,
    width: options.width,
    height: options.height,
    innerHeight: options.innerHeight,
    topPadding: options.topPadding,
    format: options.format,
    gain: options.gain,
    stop: options.stop,
    drange: options.drange,
    contrast: options.contrast,
    brightness: options.brightness,
    quality: options.quality,
  };
  const resultsBySafeName = new Map(runResults.map((entry) => [entry.safeName, entry]));
  let updated = 0;

  for (const job of jobs) {
    const runResult = resultsBySafeName.get(job.safeName);
    if (!runResult || !["generated", "skip"].includes(runResult.status)) continue;
    if (!fs.existsSync(job.inputPath) || !fs.existsSync(job.outputPath)) continue;
    const soundSha256 = fileSha256(job.inputPath);
    const spectrogramSha256 = fileSha256(job.outputPath);
    const outputStat = fs.statSync(job.outputPath);
    registry.assets[job.safeName] ??= {};
    const existing = registry.assets[job.safeName].spectrogram ?? {};
    const unchanged =
      existing.stale === false
      && existing.soundSha256 === soundSha256
      && existing.spectrogramSha256 === spectrogramSha256
      && existing.generatedAt === outputStat.mtime.toISOString();
    registry.assets[job.safeName].spectrogram = {
      stale: false,
      soundSha256,
      spectrogramSha256,
      generatedAt: outputStat.mtime.toISOString(),
      verifiedAt: unchanged && existing.verifiedAt
        ? existing.verifiedAt
        : new Date().toISOString(),
    };
    updated += 1;
  }

  const nextText = `${JSON.stringify(registry, null, 2)}\n`;
  const changed = updated > 0 && nextText !== currentText;
  if (changed) {
    const tempPath = `${registryPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, nextText, "utf8");
    fs.renameSync(tempPath, registryPath);
  }
  return { updated, changed, registry: relativeToCwd(registryPath) };
}

function fileSha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function relativeToCwd(filePath) {
  return path.relative(cwd, filePath).replace(/\\/g, "/");
}
