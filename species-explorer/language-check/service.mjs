import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createManagedTempSession } from "../temp-session.mjs";
import { languageCheckInput, parseLanguageToolResponse, LANGUAGE_CHECK_LIMITS, textSha256 } from "./parser.mjs";
import { resolveLanguageRuntime } from "./runtime.mjs";
import { LanguageCheckError, cancelled, requireValue } from "./errors.mjs";
import { cleanOwnLanguageNativeTemp } from "./native-temp.mjs";

const CONFIG = "maxTextLength=20000\nmaxTextHardLength=20000\nmaxCheckTimeMillis=10000\nmaxCheckThreads=1\nmaxWorkQueueSize=1\n"
  + "maxSpellingSuggestions=10\ncacheSize=0\npipelineCaching=true\nmaxPipelinePoolSize=1\npipelinePrewarming=false\n";
const REPEATED_LETTER_REVIEW = Object.freeze({ textLength: 2000, candidates: 2, timeoutMs: 1200 });
const CAPTION_CONTEXT_PREFIX = "Das Foto zeigt ";
const CAPTION_RELATIVE_CLAUSE = /[\p{L}\p{N}][ \t]+(?:der|die|das|den|dem|dessen|deren|welch(?:er|e|es|en|em))[ \t]+\p{L}/iu;
const CAPTION_PRONOUN_GAP = /[ \t]+(?:der|die|das|den|dem|dessen|deren|welch(?:er|e|es|en|em))$/iu;
function differsByOneEdit(first, second) {
  const [longer, shorter] = first.length >= second.length ? [first, second] : [second, first];
  if (longer.length - shorter.length > 1) return false;
  let position = 0;
  while (position < shorter.length && longer[position] === shorter[position]) position++;
  return longer.slice(position + 1) === shorter.slice(position + Number(longer.length === shorter.length));
}
function repeatedLetterCandidate(word, suggestion) {
  if (!/^[\p{Script=Latin}]{3,48}$/u.test(word) || differsByOneEdit(word, suggestion)) return null;
  const repetitions = [...word.matchAll(/(\p{Script=Latin})\1+/gu)];
  if (repetitions.length !== 1) return null;
  const [repetition] = repetitions;
  return word.slice(0, repetition.index) + word.slice(repetition.index + repetition[1].length);
}
const findingPosition = ({ start, end, ruleId }, shift = 0) => `${start + shift}:${end + shift}:${ruleId}`;
const failure = (code, message, status = 409) => new LanguageCheckError(code, message, status);
const MESSAGES = Object.freeze({
  LANGUAGE_CHECK_NOT_INSTALLED: "Die lokale deutsche Sprachprüfung ist noch nicht vollständig eingerichtet.",
  LANGUAGE_CHECK_JAVA_MISSING: "Für die lokale Sprachprüfung fehlt eine eingerichtete Java-Laufzeit ab Version 17.",
  LANGUAGE_CHECK_START_FAILED: "Die lokale Sprachprüfung konnte nicht gestartet werden. Texte bleiben unverändert.",
  LANGUAGE_CHECK_RUNTIME_CHANGED: "Die lokale Sprachprüflaufzeit passt nicht zum geprüften Herstellerpaket.",
  LANGUAGE_CHECK_CANCELLED: "Die Sprachprüfung wurde abgebrochen.",
  LANGUAGE_CHECK_TIMEOUT: "Die lokale Sprachprüfung hat ihr Zeitlimit erreicht. Texte bleiben unverändert.",
  LANGUAGE_CHECK_BUSY: "Die lokale Sprachprüfung arbeitet noch am vorherigen Text.",
  LANGUAGE_CHECK_STOP_UNCONFIRMED: "Der eigene Sprachprüfprozess ist noch nicht regulär beendet.",
  LANGUAGE_CHECK_CLEANUP_FAILED: "Der eigene Sprachprüfprozess ist beendet; sein privater Tempabschluss muss noch geprüft werden.",
  LANGUAGE_CHECK_INVALID_RESPONSE: "Die lokale Sprachantwort konnte dem aktuellen Text nicht sicher zugeordnet werden.",
  LANGUAGE_CHECK_CLOSED: "Die lokale Sprachprüfung wurde beendet.",
});
function safeFailure(error, fallback = "LANGUAGE_CHECK_START_FAILED") {
  const code = Object.hasOwn(MESSAGES, error?.code) ? error.code : fallback;
  return failure(code, MESSAGES[code]);
}
function privateEnvironment(directory, environment) {
  const result = {};
  for (const name of ["SystemRoot", "WINDIR", "SystemDrive", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"]) {
    if (environment[name]) result[name] = environment[name];
  }
  result.TEMP = directory; result.TMP = directory;
  return result;
}
async function reservePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}
function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled()); signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort)).catch(() => {});
  });
}
async function responseText(response, signal) {
  const length = response.headers?.get?.("content-length");
  requireValue(!length || /^\d+$/.test(length) && Number(length) <= LANGUAGE_CHECK_LIMITS.response,
    "LANGUAGE_CHECK_INVALID_RESPONSE", MESSAGES.LANGUAGE_CHECK_INVALID_RESPONSE, 502);
  requireValue(response.body?.getReader, "LANGUAGE_CHECK_INVALID_RESPONSE", MESSAGES.LANGUAGE_CHECK_INVALID_RESPONSE, 502);
  const reader = response.body.getReader(), chunks = []; let total = 0;
  try {
    for (;;) {
      const value = await abortable(reader.read(), signal);
      if (value.done) break;
      total += value.value.byteLength;
      requireValue(total <= LANGUAGE_CHECK_LIMITS.response, "LANGUAGE_CHECK_INVALID_RESPONSE", MESSAGES.LANGUAGE_CHECK_INVALID_RESPONSE, 502);
      chunks.push(Buffer.from(value.value));
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Owned local process, bounded checks, no text logs, no network destination supplied by callers. */
export function createLanguageCheckService({ repoRoot, runtimeRoot, javaPath, environment = process.env,
  spawnImpl = spawn, fetchImpl = globalThis.fetch, allocatePort = reservePort, resolveRuntime = resolveLanguageRuntime,
  createSession = createManagedTempSession, startupTimeoutMs = 30000, requestTimeoutMs = 15000, stopTimeoutMs = 20000,
  idleTimeoutMs = 60000 } = {}) {
  requireValue(typeof repoRoot === "string" && path.isAbsolute(repoRoot), "LANGUAGE_CHECK_UNSAFE_RUNTIME", "Die Sprachprüfung benötigt ihren Programmordner.");
  for (const timeout of [startupTimeoutMs, requestTimeoutMs, stopTimeoutMs, idleTimeoutMs]) {
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 180000) throw new TypeError("Ungültige Sprachprüfzeitgrenze.");
  }
  let own = null, starting = null, startController = null, closing = null, closed = false, idleTimer = null;
  let state = "stopped", lastError = "", lastExit = null;
  const operations = new Set(), requests = new Set();
  function clearIdle() { clearTimeout(idleTimer); idleTimer = null; }
  function idle() {
    clearIdle(); if (closed || requests.size || starting || !own || own.stopping) return;
    idleTimer = setTimeout(() => { idleTimer = null; void stopRecord(own).catch(error => { lastError = safeFailure(error).code; }); }, idleTimeoutMs);
    idleTimer.unref?.();
  }
  async function cleanup(record) {
    if (record.cleanup) return record.cleanup;
    record.cleanup = (async () => {
      if (record.releaseHelper) await record.releaseHelper();
      await cleanOwnLanguageNativeTemp(record.session.root);
      const result = await record.session.close();
      requireValue(!result.pending && !result.errors?.length && !result.kept?.length, "LANGUAGE_CHECK_CLEANUP_FAILED", MESSAGES.LANGUAGE_CHECK_CLEANUP_FAILED);
      if (own === record) own = null;
    })();
    return record.cleanup;
  }
  async function stopRecord(record) {
    if (!record) return;
    if (record.stopping) return record.stopping;
    clearIdle(); state = "stopping";
    record.stopping = (async () => {
      if (!record.exited) {
        try { record.child.stdin.end(`FN_LT_STOP ${record.nonce}\n`); } catch { /* EOF also invokes the own launcher's normal stop. */ }
      }
      let timer;
      try {
        await Promise.race([record.exit, new Promise((_, reject) => {
          timer = setTimeout(() => reject(failure("LANGUAGE_CHECK_STOP_UNCONFIRMED", MESSAGES.LANGUAGE_CHECK_STOP_UNCONFIRMED)), stopTimeoutMs);
        })]);
        await cleanup(record);
        if (!closed) state = "stopped";
      } catch (error) { state = "close-blocked"; lastError = record.exited ? "LANGUAGE_CHECK_CLEANUP_FAILED" : "LANGUAGE_CHECK_STOP_UNCONFIRMED";
        record.stopping = null; throw safeFailure(error, lastError); }
      finally { clearTimeout(timer); }
    })();
    return record.stopping;
  }
  async function start() {
    if (closed) throw failure("LANGUAGE_CHECK_CLOSED", MESSAGES.LANGUAGE_CHECK_CLOSED);
    if (own?.stopping) await own.stopping;
    if (own?.exited) await cleanup(own);
    if (own && !own.exited && own.ready) return own;
    if (starting) return starting;
    startController = new AbortController(); state = "starting"; lastError = "";
    starting = (async () => {
      const timeout = setTimeout(() => startController.abort(failure("LANGUAGE_CHECK_TIMEOUT", MESSAGES.LANGUAGE_CHECK_TIMEOUT)), startupTimeoutMs);
      const controller = startController; let session, record;
      try {
        const runtime = await resolveRuntime({ repoRoot, runtimeRoot, javaPath, environment, signal: controller.signal });
        controller.signal.throwIfAborted();
        session = await createSession({ repoRoot });
        const config = await session.filePath("language-server.properties"); await fs.writeFile(config, CONFIG, { flag: "wx", mode: 0o600 });
        controller.signal.throwIfAborted();
        const port = await allocatePort();
        requireValue(Number.isSafeInteger(port) && port >= 1024 && port <= 65535, "LANGUAGE_CHECK_START_FAILED", MESSAGES.LANGUAGE_CHECK_START_FAILED);
        controller.signal.throwIfAborted();
        const nonce = randomBytes(24).toString("hex");
        const args = ["-Xms64m", "-Xmx512m", "-XX:ActiveProcessorCount=2", "-XX:-UsePerfData", "-Djava.awt.headless=true", "-Dfile.encoding=UTF-8",
          `-Duser.home=${session.root}`, `-Djava.io.tmpdir=${session.root}`, `-Djna.tmpdir=${session.root}`,
          "-cp", [runtime.launcherPath, path.join(runtime.directory, "languagetool-server.jar")].join(path.delimiter),
          "org.languagetool.server.FNManagedLanguageTool", String(port), config, nonce];
        const child = spawnImpl(runtime.javaPath, args, { cwd: session.root, windowsHide: true, shell: false,
          stdio: ["pipe", "pipe", "pipe"], env: privateEnvironment(session.root, environment) });
        let readyResolve, readyReject, exitResolve;
        const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
        record = { child, session, nonce, port, runtime, ready: false, exited: false, exit: new Promise(resolve => { exitResolve = resolve; }) };
        own = record;
        let line = "";
        child.stdout.on("data", chunk => {
          line += chunk.toString("utf8");
          for (let newline; (newline = line.indexOf("\n")) >= 0;) {
            const current = line.slice(0, newline).replace(/\r$/, ""); line = line.slice(newline + 1);
            if (current === `FN_LT_READY ${nonce}`) { record.ready = true; readyResolve(record); }
          }
          if (line.length > 4096) line = ""; // Engine logs are drained and discarded, never retained or surfaced.
        });
        child.stderr.on("data", () => {});
        child.stdin.on("error", () => {});
        child.once("error", () => readyReject(failure("LANGUAGE_CHECK_START_FAILED", MESSAGES.LANGUAGE_CHECK_START_FAILED)));
        child.once("close", (code, signal) => {
          record.exited = true; record.ready = false; lastExit = { code, signal: signal || null }; exitResolve(lastExit);
          readyReject(failure("LANGUAGE_CHECK_START_FAILED", MESSAGES.LANGUAGE_CHECK_START_FAILED));
          if (own === record && !record.stopping) { state = "stopped"; lastError = "LANGUAGE_CHECK_START_FAILED"; }
        });
        // Attach the waiter before registering ownership, so early process errors are handled.
        const waiting = abortable(ready, controller.signal); waiting.catch(() => {});
        if (Number.isSafeInteger(child.pid) && child.pid > 0) record.releaseHelper = await session.registerHelper(child.pid);
        await waiting; controller.signal.throwIfAborted();
        requireValue(!record.exited, "LANGUAGE_CHECK_START_FAILED", MESSAGES.LANGUAGE_CHECK_START_FAILED);
        state = "ready"; return record;
      } catch (error) {
        if (record) await stopRecord(record);
        else if (session) await session.close();
        const result = safeFailure(controller.signal.aborted ? controller.signal.reason : error);
        state = "unavailable"; lastError = result.code; throw result;
      } finally { clearTimeout(timeout); startController = null; starting = null; idle(); }
    })();
    return starting;
  }
  function track(work) { const operation = Promise.resolve().then(work); operations.add(operation); operation.finally(() => operations.delete(operation)).catch(() => {}); return operation; }
  async function checkedText(record, text, context, signal) {
    const response = await abortable(fetchImpl(`http://127.0.0.1:${record.port}/v2/check`, { method: "POST", redirect: "error", signal,
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ language: "de-DE", text, level: "default" }).toString() }), signal);
    requireValue(response.status === 200, response.status === 429 || response.status === 503 ? "LANGUAGE_CHECK_BUSY" : "LANGUAGE_CHECK_INVALID_RESPONSE",
      response.status === 429 || response.status === 503 ? MESSAGES.LANGUAGE_CHECK_BUSY : MESSAGES.LANGUAGE_CHECK_INVALID_RESPONSE, 502);
    requireValue(response.headers?.get?.("content-type")?.split(";")[0].trim().toLowerCase() === "application/json",
      "LANGUAGE_CHECK_INVALID_RESPONSE", MESSAGES.LANGUAGE_CHECK_INVALID_RESPONSE, 502);
    const raw = await responseText(response, signal); signal.throwIfAborted();
    let value; try { value = JSON.parse(raw); } catch { throw failure("LANGUAGE_CHECK_INVALID_RESPONSE", MESSAGES.LANGUAGE_CHECK_INVALID_RESPONSE, 502); }
    requireValue(own === record && !record.exited && record.ready, "LANGUAGE_CHECK_START_FAILED", MESSAGES.LANGUAGE_CHECK_START_FAILED);
    return parseLanguageToolResponse(value, { text, context, version: record.runtime.version });
  }
  async function reviewRepeatedLetters(record, text, context, result, signal) {
    if (text.length > REPEATED_LETTER_REVIEW.textLength) return result;
    let attempts = 0, reviewSignal;
    for (const [index, finding] of result.findings.entries()) {
      if (attempts >= REPEATED_LETTER_REVIEW.candidates || reviewSignal?.aborted) break;
      if (finding.kind !== "spelling" || finding.ruleId !== "GERMAN_SPELLER_RULE") continue;
      const word = text.slice(finding.start, finding.end), replacement = repeatedLetterCandidate(word, finding.replacement);
      if (!replacement) continue;
      attempts++;
      reviewSignal ??= AbortSignal.any([signal, AbortSignal.timeout(REPEATED_LETTER_REVIEW.timeoutMs)]);
      const shift = replacement.length - word.length;
      const unaffected = new Set(result.findings.filter(item => item !== finding && (item.end <= finding.start || item.start >= finding.end))
        .map(item => findingPosition(item, item.start >= finding.end ? shift : 0)));
      const variant = text.slice(0, finding.start) + replacement + text.slice(finding.end);
      try {
        const reviewed = await checkedText(record, variant, context, reviewSignal);
        if (reviewed.findings.every(item => unaffected.has(findingPosition(item)))) {
          result.findings[index] = { ...finding, replacement, alternative: finding.replacement };
        }
      } catch {
        signal.throwIfAborted();
        break;
      }
    }
    return result;
  }
  async function reviewCaptionComma(record, text, context, result, signal) {
    if (context !== "caption" || text.length > 300 || /[\r\n]/.test(text) || !CAPTION_RELATIVE_CLAUSE.test(text)) return result;
    const caption = text.trimEnd(), tail = /[.!?…]$/u.test(caption) ? "" : ".";
    const reviewSignal = AbortSignal.any([signal, AbortSignal.timeout(1200)]);
    let review;
    try {
      review = await checkedText(record, CAPTION_CONTEXT_PREFIX + caption + tail, context, reviewSignal);
    } catch {
      signal.throwIfAborted();
      return result;
    }
    const prefixLength = CAPTION_CONTEXT_PREFIX.length;
    for (const finding of review.findings) {
      const start = finding.start - prefixLength, end = finding.end - prefixLength;
      if (finding.ruleId !== "COMMA_IN_FRONT_RELATIVE_CLAUSE" || finding.kind !== "punctuation" || start < 0 || end > caption.length) continue;
      const quote = caption.slice(start, end), comma = quote.search(CAPTION_PRONOUN_GAP);
      if (comma <= 0 || finding.replacement !== `${quote.slice(0, comma)},${quote.slice(comma)}`) continue;
      if (!result.findings.some(existing => existing.start === start && existing.end === end && existing.replacement === finding.replacement)) {
        result.findings.push({ ...finding, start, end });
      }
    }
    result.findings.sort((a, b) => a.start - b.start || a.end - b.end || a.ruleId.localeCompare(b.ruleId));
    return result;
  }
  async function runCheck(input) {
    const { text, context, signal } = languageCheckInput(input);
    if (signal?.aborted) throw cancelled();
    requireValue(!closed, "LANGUAGE_CHECK_CLOSED", MESSAGES.LANGUAGE_CHECK_CLOSED);
    requireValue(requests.size < 2, "LANGUAGE_CHECK_BUSY", MESSAGES.LANGUAGE_CHECK_BUSY);
    const controller = new AbortController(), onAbort = () => controller.abort(cancelled());
    requests.add(controller); clearIdle(); signal?.addEventListener("abort", onAbort, { once: true });
    let timer, record;
    try {
      record = await abortable(start(), controller.signal);
      if (!text.trim()) return { available: true, textSha256: textSha256(text), findings: [] };
      timer = setTimeout(() => controller.abort(failure("LANGUAGE_CHECK_TIMEOUT", MESSAGES.LANGUAGE_CHECK_TIMEOUT)), requestTimeoutMs);
      const checked = await checkedText(record, text, context, controller.signal);
      const spelling = await reviewRepeatedLetters(record, text, context, checked, controller.signal);
      const result = await reviewCaptionComma(record, text, context, spelling, controller.signal);
      controller.signal.throwIfAborted(); return result;
    } catch (error) {
      const actual = controller.signal.aborted ? controller.signal.reason : error;
      if (actual?.code === "LANGUAGE_CHECK_CANCELLED") throw cancelled();
      const result = safeFailure(actual, "LANGUAGE_CHECK_INVALID_RESPONSE"); lastError = result.code;
      if (record && result.code !== "LANGUAGE_CHECK_BUSY") await stopRecord(record);
      return { available: false, textSha256: textSha256(text), code: result.code, message: result.message, findings: [] };
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); requests.delete(controller); idle(); }
  }
  return Object.freeze({
    check: input => track(() => runCheck(input)),
    status: () => track(async () => {
      if (closed) return { available: false, state: own ? state : "closed", version: "6.6", code: lastError || "LANGUAGE_CHECK_CLOSED",
        message: MESSAGES[lastError] || MESSAGES.LANGUAGE_CHECK_CLOSED, running: Boolean(own && !own.exited), pending: requests.size };
      if (own && !own.exited) return { available: state === "ready", state, version: "6.6", code: lastError || null,
        message: lastError ? MESSAGES[lastError] : "Die deutsche Sprachprüfung arbeitet lokal.", running: true, pending: requests.size };
      if (lastError && lastError !== "LANGUAGE_CHECK_BUSY") return { available: false, state: "unavailable", version: "6.6", code: lastError,
        message: MESSAGES[lastError], running: false, pending: requests.size };
      try {
        await resolveRuntime({ repoRoot, runtimeRoot, javaPath, environment });
        return { available: true, state: "stopped", version: "6.6", code: null, message: "Die deutsche Sprachprüfung ist lokal eingerichtet.", running: false, pending: requests.size };
      } catch (error) { const value = safeFailure(error); return { available: false, state: "unavailable", version: "6.6", code: value.code,
        message: value.message, running: false, pending: requests.size }; }
    }),
    close() {
      if (closing) return closing;
      closed = true; clearIdle(); startController?.abort(failure("LANGUAGE_CHECK_CLOSED", MESSAGES.LANGUAGE_CHECK_CLOSED));
      for (const controller of requests) controller.abort(cancelled());
      closing = (async () => {
        await Promise.allSettled([...operations]);
        if (starting) await starting.catch(() => {});
        await stopRecord(own); state = "closed";
        return { closed: true, running: false, lastExit };
      })().catch(error => { closing = null; throw error; });
      return closing;
    },
  });
}
