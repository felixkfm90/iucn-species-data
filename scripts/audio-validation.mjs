import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { inspectCompleteMp3Buffer } from "./audio-format.mjs";
import { resolveFfmpegPath } from "./spectrogram-renderer.mjs";

export const AUDIO_DECODE_LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, timeoutMs: 15000, outputBytes: 64 * 1024 });
const defaultRepoRoot = fileURLToPath(new URL("../", import.meta.url));

function problem(code, message) { return Object.assign(new Error(message), { code }); }
const cancelled = () => problem("audio_decode_cancelled", "Die Audioprüfung wurde abgebrochen.");
const timedOut = () => problem("audio_decode_timeout", "Die Audioprüfung hat die erlaubte Zeit überschritten.");
const invalid = () => problem("invalid_audio", "Die MP3-Datei kann nicht vollständig gelesen werden. Bitte eine unbeschädigte Originaldatei auswählen.");
const unavailable = () => problem("audio_decoder_unavailable", "Die Audioprüfung benötigt FFmpeg. Bitte das installierte Medienwerkzeug prüfen; vorhandene Dateien bleiben erhalten.");

/** Full bounded decode of a private byte snapshot. No file writes or audio transformation. */
export async function validateAudioDecode(buffer, { repoRoot = defaultRepoRoot,
  timeoutMs = AUDIO_DECODE_LIMITS.timeoutMs, signal, spawnProcess = spawn } = {}) {
  if (typeof repoRoot !== "string" || !path.isAbsolute(repoRoot) || repoRoot.includes("\0")
    || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > AUDIO_DECODE_LIMITS.timeoutMs
    || typeof spawnProcess !== "function" || signal !== undefined && (!signal || typeof signal.aborted !== "boolean"
      || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")) {
    throw problem("invalid_audio_validation_options", "Die Audioprüfung benötigt einen festen Programmordner und begrenzte Prüfoptionen.");
  }
  const deadline = Date.now() + timeoutMs;
  if (signal?.aborted) throw cancelled();
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > AUDIO_DECODE_LIMITS.bytes) {
    throw problem("audio_decode_size", "Bitte eine MP3-Datei bis 50 MiB bereitstellen; vorhandene Dateien bleiben erhalten.");
  }
  // The caller may retain its Buffer while the decoder is running. Neither a
  // concurrent edit nor a view onto another Buffer can change this proof.
  const bytes = Buffer.from(buffer);
  let structure;
  try { structure = inspectCompleteMp3Buffer(bytes); }
  catch (error) {
    if (error.code === "unsupported_audio_tag") throw problem(error.code, "Diese MP3-Metadatenform oder ihr Umfang wird derzeit nicht unterstützt; das Original bleibt erhalten.");
    throw invalid();
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // Only proved outer metadata is excluded from decoder input. Every MPEG
  // frame and any interleaved ID3 tag remain in the exact original byte span.
  // The returned hash and size always bind the entire unmodified original.
  const audio = bytes.subarray(structure.frameOffset, structure.audioEnd);
  const command = resolveFfmpegPath({ repoRoot });
  if (signal?.aborted) throw cancelled();
  if (Date.now() >= deadline) throw timedOut();
  const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-nostats", "-xerror",
    "-max_alloc", "67108864", "-threads", "1", "-err_detect", "explode", "-protocol_whitelist", "pipe",
    "-f", "mp3", "-i", "pipe:0", "-map", "0:a:0", "-vn", "-sn", "-dn", "-threads", "1",
    "-progress", "pipe:1", "-f", "null", "-"];
  const result = await new Promise((done) => {
    let child;
    try { child = spawnProcess(command, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }); }
    catch (error) { done({ error: error?.code === "ENOENT" ? unavailable() : invalid() }); return; }
    const record = { stdout: "", stderr: "", outputBytes: 0, error: null, status: null };
    let stopping = false;
    const stop = (error) => {
      record.error ??= error;
      if (stopping) return; stopping = true;
      child.stdin.destroy();
      child.kill("SIGKILL");
    };
    const onAbort = () => stop(cancelled());
    const timer = setTimeout(() => stop(timedOut()), Math.max(1, deadline - Date.now()));
    function append(name, chunk) {
      if (stopping) return;
      record.outputBytes += chunk.length;
      if (record.outputBytes > AUDIO_DECODE_LIMITS.outputBytes) {
        stop(problem("audio_decode_output_limit", "Die Audioprüfung liefert zu viel Ausgabe und wurde beendet.")); return;
      }
      record[name] += chunk.toString("utf8");
    }
    child.stdout.on("data", chunk => append("stdout", chunk));
    child.stderr.on("data", chunk => append("stderr", chunk));
    child.on("error", error => { record.error ??= error?.code === "ENOENT" ? unavailable() : invalid(); });
    child.stdin.on("error", () => stop(invalid()));
    // Neither exit nor a completed progress line releases the operation. All
    // private pipe readers and the actual child must have closed first.
    child.once("close", status => {
      clearTimeout(timer); signal?.removeEventListener("abort", onAbort);
      if (Date.now() >= deadline) record.error ??= timedOut();
      record.status = status; done(record);
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else child.stdin.end(audio);
  });
  if (result.error) throw result.error;
  const lines = result.stdout.trim().split(/\r?\n/);
  const duration = lines.filter(line => /^out_time_us=[0-9]+$/.test(line)).at(-1)?.slice("out_time_us=".length);
  if (result.status !== 0 || result.stderr.trim() || lines.at(-1) !== "progress=end"
    || !Number.isSafeInteger(Number(duration)) || Number(duration) <= 0) throw invalid();
  return { bytes: bytes.length, sha256, mimeType: "audio/mpeg" };
}
