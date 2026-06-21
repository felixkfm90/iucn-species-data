import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveFfmpegPath } from "./spectrogram-renderer.mjs";

export const DEFAULT_PORTRAIT_OPTIONS = Object.freeze({
  width: 1280,
  height: 1600,
  background: "0xfffbef",
  quality: 90,
});

export async function renderPortrait({
  inputPath,
  outputPath,
  ffmpegPath = resolveFfmpegPath(),
  options = {},
}) {
  const settings = { ...DEFAULT_PORTRAIT_OPTIONS, ...options };
  for (const key of ["width", "height", "quality"]) {
    if (!Number.isInteger(settings[key]) || settings[key] <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const filter = [
    `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease`,
    `pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:${settings.background}`,
    "setsar=1",
  ].join(",");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vf",
    filter,
    "-frames:v",
    "1",
    "-vcodec",
    "libwebp",
    "-quality",
    String(settings.quality),
    outputPath,
  ];

  const run = await runProcess(ffmpegPath, args);
  if (run.status !== 0) {
    const error = new Error(
      `Artporträt konnte nicht in WebP umgewandelt werden: ${run.stderr.trim() || `ffmpeg exit ${run.status}`}`,
    );
    error.code = "PORTRAIT_RENDER_FAILED";
    throw error;
  }

  const outputStat = await stat(outputPath);
  return {
    outputBytes: outputStat.size,
    width: settings.width,
    height: settings.height,
    ffmpegPath,
  };
}

function runProcess(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ status: 1, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (status) => {
      resolve({ status: Number.isInteger(status) ? status : 1, stderr });
    });
  });
}
