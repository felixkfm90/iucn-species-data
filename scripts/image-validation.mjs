import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolveFfmpegPath } from "./spectrogram-renderer.mjs";
import { inspectJpeg, inspectPng, inspectWebp } from "./image-header.mjs";

// Header readers supply dimensions; only this bounded decode proves usable
// pixels. Cache successes by exact bytes and decoder, never by path or mtime.
export const IMAGE_DECODE_LIMITS = Object.freeze({ pixels: 40_000_000, bytes: 20 * 1024 * 1024,
  timeoutMs: 15000, cacheEntries: 256 });
const decodedImages = new Map();

function assertCompleteContainer(buffer, format) {
  if (format === "jpeg") {
    const scan = buffer.indexOf(Buffer.from([0xff, 0xda]));
    const end = buffer.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (scan < 0 || end < scan + 4) throw new Error("JPEG-Bilddaten fehlen oder die Datei ist abgeschnitten");
    return;
  }
  if (format === "png") {
    let offset = 8, imageData = false, ended = false;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset), name = buffer.toString("ascii", offset + 4, offset + 8);
      if (length > buffer.length - offset - 12) throw new Error("PNG-Datei ist abgeschnitten");
      if (name === "IDAT" && length) imageData = true;
      offset += length + 12;
      if (name === "IEND") { ended = length === 0 && offset === buffer.length; break; }
    }
    if (!imageData || !ended) throw new Error("PNG-Bilddaten fehlen oder die Datei ist unvollständig");
    return;
  }
  if (format === "webp") {
    if (buffer.length < 20 || buffer.readUInt32LE(4) + 8 !== buffer.length) throw new Error("WebP-Datei ist unvollständig");
    let offset = 12, imageData = false;
    while (offset + 8 <= buffer.length) {
      const name = buffer.toString("ascii", offset, offset + 4), length = buffer.readUInt32LE(offset + 4);
      if (length > buffer.length - offset - 8) throw new Error("WebP-Datei ist abgeschnitten");
      if (["VP8 ", "VP8L", "ANMF"].includes(name) && length) imageData = true;
      offset += 8 + length + length % 2;
    }
    if (!imageData || offset !== buffer.length) throw new Error("WebP-Bilddaten fehlen oder die Datei ist unvollständig");
    return;
  }
  throw new Error("Bildformat wird nicht unterstützt");
}

export async function validateImageDecode(buffer, { format, repoRoot = process.cwd(),
  ffmpegPath = resolveFfmpegPath({ repoRoot }), spawnProcess = spawn,
  timeoutMs = IMAGE_DECODE_LIMITS.timeoutMs } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > IMAGE_DECODE_LIMITS.bytes) {
    throw new Error("Bilddatei ist leer oder überschreitet die erlaubte Prüfgröße von 20 MiB");
  }
  const header = { jpeg: inspectJpeg, png: inspectPng, webp: inspectWebp }[format]?.(buffer);
  if (!header?.valid) throw new Error(header?.reason || "Bildformat wird nicht unterstützt");
  const { width, height } = header;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
      || width * height > IMAGE_DECODE_LIMITS.pixels) {
    throw new Error("Bildabmessungen sind ungültig oder überschreiten die Prüfgrenze von 40 Millionen Pixeln");
  }
  assertCompleteContainer(buffer, format);
  const key = `${ffmpegPath}\0${format}\0${width}x${height}\0${createHash("sha256").update(buffer).digest("hex")}`;
  if (decodedImages.has(key)) return { width, height };
  const args = ["-hide_banner", "-loglevel", "error", "-xerror",
    "-max_alloc", "67108864", "-max_pixels", String(IMAGE_DECODE_LIMITS.pixels),
    "-err_detect", "explode", "-threads", "1", "-f", "image2pipe",
    "-i", "pipe:0", "-map", "0:v:0", "-frames:v", "1", "-threads", "1", "-f", "framemd5", "pipe:1"];
  const result = await new Promise((done) => {
    const child = spawnProcess(ffmpegPath, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const record = { stdout: "", stderr: "", error: null, status: null };
    const stop = (message) => { record.error ??= new Error(message); child.kill(); };
    const timer = setTimeout(() => stop("Bildprüfung hat die erlaubte Zeit überschritten"),
      Math.min(IMAGE_DECODE_LIMITS.timeoutMs, Math.max(1, timeoutMs)));
    const append = (name, chunk) => {
      if (record[name].length + chunk.length > 128 * 1024) { stop("Bildprüfung liefert zu viel Ausgabe"); return; }
      record[name] += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    child.on("error", (error) => { record.error = error; });
    child.stdin.on("error", (error) => { record.error ??= error; });
    // Never report completion or release the import until its reader is gone.
    child.on("close", (status) => { clearTimeout(timer); record.status = status; done(record); });
    child.stdin.end(buffer);
  });
  if (result.error?.code === "ENOENT") throw new Error("Bildprüfung benötigt FFmpeg. Bitte das installierte Medienwerkzeug prüfen; vorhandene Dateien bleiben erhalten.");
  if (result.error || result.status !== 0 || result.stderr?.trim()
      || !/^0,\s*-?\d+,\s*-?\d+,\s*\d+,\s*[1-9]\d*,\s*[a-f0-9]{32}\s*$/m.test(result.stdout ?? "")
      || !new RegExp(`^#dimensions 0: ${width}x${height}\\s*$`, "m").test(result.stdout)) {
    throw new Error("Bilddatei kann nicht vollständig gelesen werden. Bitte eine unbeschädigte Bilddatei auswählen; vorhandene Dateien bleiben erhalten.");
  }
  if (decodedImages.size >= IMAGE_DECODE_LIMITS.cacheEntries) decodedImages.delete(decodedImages.keys().next().value);
  decodedImages.set(key, true);
  return { width, height };
}
