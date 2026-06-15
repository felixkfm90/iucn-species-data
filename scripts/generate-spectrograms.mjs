import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 240;
const DEFAULT_FORMAT = "webp";
const DEFAULT_OUTPUT_NAME = "spectrogram";
const DEFAULT_COLOR = "channel";
const DEFAULT_SCALE = "log";
const DEFAULT_GAIN = 5;

const args = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const soundsDir = path.join(cwd, "sounds");
const ffmpegPath = args.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg";
const format = normalizeFormat(args.format || DEFAULT_FORMAT);
const outputFileName = `${args.outputName || DEFAULT_OUTPUT_NAME}.${format}`;
const width = positiveInteger(args.width, DEFAULT_WIDTH, "width");
const height = positiveInteger(args.height, DEFAULT_HEIGHT, "height");
const gain = Number.isFinite(Number(args.gain)) ? Number(args.gain) : DEFAULT_GAIN;
const color = args.color || DEFAULT_COLOR;
const scale = args.scale || DEFAULT_SCALE;

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!fs.existsSync(soundsDir)) {
  throw new Error(`Sounds directory not found: ${soundsDir}`);
}

const ffmpeg = checkFfmpeg(ffmpegPath);
const jobs = collectJobs({
  soundsDir,
  speciesFilter: args.species,
  outputRoot: args.outputRoot,
  outputFileName,
  force: Boolean(args.force),
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
    format,
    outputFileName,
    color,
    scale,
    gain,
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
    color,
    scale,
    gain,
    format,
  });
  runResults.push(runResult);
}

result.results = runResults;
result.counts.generated = runResults.filter((entry) => entry.status === "generated").length;
result.counts.failed = runResults.filter((entry) => entry.status === "failed").length;
result.counts.skipped = runResults.filter((entry) => entry.status === "skip").length;

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
    else if (arg.startsWith("--color=")) parsed.color = arg.slice("--color=".length);
    else if (arg.startsWith("--scale=")) parsed.scale = arg.slice("--scale=".length);
    else if (arg.startsWith("--gain=")) parsed.gain = arg.slice("--gain=".length);
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
  --height=<px>             Output height. Default: ${DEFAULT_HEIGHT}.
  --color=<ffmpeg-value>    showspectrumpic color option. Default: ${DEFAULT_COLOR}.
  --scale=<ffmpeg-value>    showspectrumpic scale option. Default: ${DEFAULT_SCALE}.
  --gain=<number>           showspectrumpic gain option. Default: ${DEFAULT_GAIN}.

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

function checkFfmpeg(command) {
  const check = spawnSync(command, ["-version"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (check.error) {
    return {
      available: false,
      version: "",
      error: check.error.message,
    };
  }

  if (check.status !== 0) {
    return {
      available: false,
      version: "",
      error: check.stderr || `ffmpeg exited with status ${check.status}`,
    };
  }

  const firstLine = String(check.stdout || "").split(/\r?\n/)[0] || "";
  return {
    available: true,
    version: firstLine,
    error: "",
  };
}

function collectJobs({ soundsDir, speciesFilter, outputRoot, outputFileName, force }) {
  const selected = new Set((speciesFilter || []).map((name) => name.toLowerCase()));
  const dirs = fs
    .readdirSync(soundsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((safeName) => !selected.size || selected.has(safeName.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "de"));

  return dirs.map((safeName) => {
    const sourceDir = path.join(soundsDir, safeName);
    const inputPath = path.join(sourceDir, `${safeName}.mp3`);
    const outputDir = outputRoot ? path.resolve(cwd, outputRoot, safeName) : sourceDir;
    const outputPath = path.join(outputDir, outputFileName);

    if (!fs.existsSync(inputPath)) {
      return { safeName, inputPath, outputPath, action: "missing-mp3", reason: "MP3 not found" };
    }

    if (!force && fs.existsSync(outputPath)) {
      const inputStat = fs.statSync(inputPath);
      const outputStat = fs.statSync(outputPath);
      if (outputStat.mtimeMs >= inputStat.mtimeMs) {
        return {
          safeName,
          inputPath,
          outputPath,
          action: "skip",
          reason: "spectrogram is up to date",
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
      reason: force ? "forced" : "missing or older than MP3",
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

async function generateSpectrogram({ job, ffmpegPath, width, height, color, scale, gain, format }) {
  fs.mkdirSync(path.dirname(job.outputPath), { recursive: true });

  const filter = `showspectrumpic=s=${width}x${height}:legend=disabled:scale=${scale}:color=${color}:gain=${gain}`;
  const ffmpegArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    job.inputPath,
    "-lavfi",
    filter,
    "-frames:v",
    "1",
  ];

  if (format === "webp") {
    ffmpegArgs.push("-vcodec", "libwebp", "-quality", "78");
  }

  ffmpegArgs.push(job.outputPath);

  const run = await runProcess(ffmpegPath, ffmpegArgs);
  if (run.status !== 0) {
    return {
      ...publicJob(job),
      status: "failed",
      ffmpegStatus: run.status,
      stderr: run.stderr.trim(),
    };
  }

  const outputStat = fs.statSync(job.outputPath);
  return {
    ...publicJob(job),
    status: "generated",
    outputBytes: outputStat.size,
  };
}

function runProcess(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ status: 1, stdout, stderr: stderr + error.message });
    });

    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function relativeToCwd(filePath) {
  return path.relative(cwd, filePath).replace(/\\/g, "/");
}
