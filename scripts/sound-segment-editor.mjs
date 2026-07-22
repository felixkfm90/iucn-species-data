import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const MAX_SEGMENTS = 20;
const MAX_OUTPUT_DURATION_SECONDS = 5 * 60;
const MIN_SEGMENT_DURATION_SECONDS = 0.05;

function roundedSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

export function normalizeSoundSegments(rawSegments, durationSeconds) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Die Dauer des aktuellen Sounds konnte nicht ermittelt werden");
  }
  if (!Array.isArray(rawSegments) || rawSegments.length < 1) {
    throw new Error("Mindestens ein Soundabschnitt ist erforderlich");
  }
  if (rawSegments.length > MAX_SEGMENTS) {
    throw new Error(`Es sind maximal ${MAX_SEGMENTS} Soundabschnitte erlaubt`);
  }

  const segments = rawSegments.map((entry, index) => {
    const start = Number(entry?.start);
    const end = Number(entry?.end);
    const label = `Abschnitt ${index + 1}`;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error(`${label}: Start und Ende müssen Zahlen sein`);
    }
    if (start < 0) throw new Error(`${label}: Start darf nicht negativ sein`);
    if (end > duration + 0.05) {
      throw new Error(`${label}: Ende liegt hinter der Sounddauer von ${duration.toFixed(2)} Sekunden`);
    }
    const safeStart = roundedSeconds(Math.max(0, start));
    const safeEnd = roundedSeconds(Math.min(duration, end));
    if (safeEnd - safeStart < MIN_SEGMENT_DURATION_SECONDS) {
      throw new Error(`${label}: Der Abschnitt muss mindestens 0,05 Sekunden lang sein`);
    }
    return {
      start: safeStart,
      end: safeEnd,
      duration: roundedSeconds(safeEnd - safeStart),
    };
  });
  const outputDuration = roundedSeconds(
    segments.reduce((total, segment) => total + segment.duration, 0),
  );
  if (outputDuration > MAX_OUTPUT_DURATION_SECONDS) {
    throw new Error("Der zusammengesetzte Sound darf maximal fünf Minuten lang sein");
  }
  return { duration, outputDuration, segments };
}

export function buildSoundSegmentFilter(segments) {
  const parts = segments.map((segment, index) => (
    `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}]`
  ));
  if (segments.length === 1) {
    parts.push("[a0]anull[outa]");
  } else {
    const inputs = segments.map((_, index) => `[a${index}]`).join("");
    parts.push(`${inputs}concat=n=${segments.length}:v=0:a=1[outa]`);
  }
  return parts.join(";");
}

export function resolveFfprobePath(ffmpegPath = "ffmpeg") {
  const extension = extname(ffmpegPath);
  const fileName = basename(ffmpegPath, extension).toLocaleLowerCase("en");
  if (fileName === "ffmpeg") {
    const sibling = join(dirname(ffmpegPath), `ffprobe${extension}`);
    if (ffmpegPath !== "ffmpeg" && existsSync(sibling)) return sibling;
  }
  return "ffprobe";
}

export async function probeSoundDuration({ inputPath, ffmpegPath = "ffmpeg" }) {
  const ffprobePath = resolveFfprobePath(ffmpegPath);
  const run = await runProcess(ffprobePath, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);
  const duration = Number(String(run.stdout).trim());
  if (run.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
    const details = String(run.stderr || run.stdout).trim();
    throw new Error(`Sounddauer konnte nicht ermittelt werden${details ? `: ${details}` : ""}`);
  }
  return duration;
}

export async function renderSoundSegments({
  inputPath,
  outputPath,
  segments,
  durationSeconds,
  ffmpegPath = "ffmpeg",
}) {
  const normalized = normalizeSoundSegments(segments, durationSeconds);
  await mkdir(dirname(outputPath), { recursive: true });
  const filter = buildSoundSegmentFilter(normalized.segments);
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inputPath,
    "-filter_complex", filter,
    "-map", "[outa]",
    "-vn",
    "-codec:a", "libmp3lame",
    "-b:a", "192k",
    outputPath,
  ];
  const run = await runProcess(ffmpegPath, args);
  if (run.status !== 0) {
    const details = String(run.stderr || run.stdout).trim();
    throw new Error(`Schnittvorschau konnte nicht erzeugt werden${details ? `: ${details}` : ""}`);
  }
  const outputStat = await stat(outputPath);
  return {
    ...normalized,
    outputBytes: outputStat.size,
    ffmpegPath,
  };
}

function runProcess(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      resolveRun({ status: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (status) => {
      resolveRun({ status: Number.isInteger(status) ? status : 1, stdout, stderr });
    });
  });
}
