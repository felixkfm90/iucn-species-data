import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

export const DEFAULT_SPECTROGRAM_OPTIONS = Object.freeze({
  width: 1000,
  height: 240,
  innerHeight: 200,
  topPadding: 20,
  format: "webp",
  color: "channel",
  scale: "log",
  gain: 3,
  stop: 18000,
  drange: 80,
  contrast: 1.25,
  brightness: 0.08,
  quality: 90,
});

export function resolveFfmpegPath({
  repoRoot = process.cwd(),
  explicitPath = process.env.FFMPEG_PATH || "",
} = {}) {
  if (explicitPath) return explicitPath;
  const localPath = join(repoRoot, "local-tools", "ffmpeg", "bin", "ffmpeg.exe");
  return existsSync(localPath) ? localPath : "ffmpeg";
}

export function checkFfmpeg(command) {
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

export async function renderSpectrogram({
  inputPath,
  outputPath,
  ffmpegPath = resolveFfmpegPath(),
  options = {},
}) {
  const settings = { ...DEFAULT_SPECTROGRAM_OPTIONS, ...options };
  validateSettings(settings);
  await mkdir(dirname(outputPath), { recursive: true });

  const spectrumOptions = [
    `s=${settings.width}x${settings.innerHeight}`,
    "legend=disabled",
    `scale=${settings.scale}`,
    `color=${settings.color}`,
    `gain=${settings.gain}`,
    `drange=${settings.drange}`,
  ];
  if (settings.stop > 0) spectrumOptions.push(`stop=${settings.stop}`);

  const filter = [
    `showspectrumpic=${spectrumOptions.join(":")}`,
    "format=gray",
    "negate",
    `eq=contrast=${settings.contrast}:brightness=${settings.brightness}`,
    `pad=${settings.width}:${settings.height}:0:${settings.topPadding}:white`,
  ].join(",");
  const ffmpegArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-lavfi",
    filter,
    "-frames:v",
    "1",
  ];

  if (settings.format === "webp") {
    ffmpegArgs.push("-vcodec", "libwebp", "-quality", String(settings.quality));
  }
  ffmpegArgs.push(outputPath);

  const run = await runProcess(ffmpegPath, ffmpegArgs);
  if (run.status !== 0) {
    const error = new Error(
      `Spektrogramm konnte nicht erzeugt werden: ${run.stderr.trim() || `ffmpeg exit ${run.status}`}`,
    );
    error.code = "SPECTROGRAM_GENERATION_FAILED";
    error.ffmpegStatus = run.status;
    throw error;
  }

  const outputStat = await stat(outputPath);
  return {
    outputBytes: outputStat.size,
    ffmpegPath,
    options: settings,
  };
}

function validateSettings(settings) {
  for (const key of ["width", "height", "innerHeight", "quality"]) {
    if (!Number.isInteger(settings[key]) || settings[key] <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }
  }
  if (!Number.isInteger(settings.topPadding) || settings.topPadding < 0) {
    throw new Error("topPadding must be a non-negative integer");
  }
  if (settings.innerHeight > settings.height) {
    throw new Error("innerHeight must be less than or equal to height");
  }
  if (settings.topPadding + settings.innerHeight > settings.height) {
    throw new Error("topPadding plus innerHeight must be less than or equal to height");
  }
  if (!["webp", "png"].includes(settings.format)) {
    throw new Error(`Unsupported format: ${settings.format}`);
  }
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
      resolve({ status: Number.isInteger(status) ? status : 1, stdout, stderr });
    });
  });
}
