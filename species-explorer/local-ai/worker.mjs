import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { aiError, boundedResponse, childPath, noLinks } from "./files.mjs";

async function reservePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", abort); resolve(); }
    function abort() { clearTimeout(timer); reject(signal.reason); }
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function privateEnvironment(installation, privateDirectory, port) {
  const result = {};
  for (const name of ["SystemRoot", "WINDIR", "SystemDrive", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"]) {
    if (process.env[name]) result[name] = process.env[name];
  }
  result.PATH = installation.runtimeDirectory + path.delimiter + path.join(process.env.SystemRoot || process.env.WINDIR || "C:\\Windows", "System32");
  result.TEMP = privateDirectory; result.TMP = privateDirectory;
  result.LLAMA_SERVER_ROUTER_PORT = String(port);
  result.LLAMA_SERVER_CHILD_ROLE = "instance";
  result.LLAMA_ARG_OFFLINE = "1";
  return result;
}
function failureCode(error, signal, fallback) {
  if (["LOCAL_AI_STOP_UNCONFIRMED", "LOCAL_AI_CLEANUP_FAILED"].includes(error?.code)) return error.code;
  if (signal.aborted) return signal.reason?.code === "LOCAL_AI_WORKER_EXITED" ? "LOCAL_AI_WORKER_EXITED" : "LOCAL_AI_CANCELLED";
  return ["LOCAL_AI_NOT_INSTALLED", "LOCAL_AI_WORKER_EXITED", "LOCAL_AI_START_FAILED", "LOCAL_AI_HTTP_FAILED", "LOCAL_AI_INVALID_RESPONSE"].includes(error?.code) ? error.code : fallback;
}
function failureMessage(code, starting = false) {
  if (code === "LOCAL_AI_WORKER_EXITED") return "Der eigene lokale KI-Prozess wurde unerwartet beendet. Es wurde kein Vorschlag übernommen.";
  if (code === "LOCAL_AI_CANCELLED") return "Die lokale KI-Anfrage wurde abgebrochen oder hat das Zeitlimit erreicht.";
  return starting ? "Die lokale KI konnte nicht sicher gestartet werden." : "Die lokale KI-Antwort konnte nicht sicher übernommen werden.";
}

export function createLocalAiWorker({ cache, spawnImpl = spawn, fetchImpl = globalThis.fetch, allocatePort = reservePort,
  mode = "cpu", startupTimeoutMs = 120_000, requestTimeoutMs = 90_000, stopTimeoutMs = 180_000, pollMs = 250,
  beforeStart = async () => {}, maxRequestBytes = 12 * 1024 * 1024, maxResponseBytes = 256 * 1024 } = {}) {
  if (!cache?.resolveVerified || !["cpu", "vulkan"].includes(mode)) throw new TypeError("Geprüfter optionaler KI-Cache und CPU-/Vulkan-Modus sind erforderlich.");
  let own = null, startTask = null, startAbort = null, requestAbort = null, busy = false, closed = false;
  let state = "stopped", errorCode = "", lastExit = null;
  async function cleanup(record) {
    if (!record.cleanup) record.cleanup = (async () => {
      await noLinks(record.directory);
      await fs.rm(record.directory, { recursive: true, force: true });
      record.key = "";
      if (own === record) { own = null; if (state !== "failed") state = "stopped"; }
    })();
    return record.cleanup;
  }
  async function stopRecord(record) {
    if (!record) return;
    if (record.stopping) return record.stopping;
    record.stopping = (async () => {
      state = "stopping";
      if (!record.exited) {
        // b11960's own managed-child protocol invokes its regular shutdown handler.
        // Do not map SIGTERM to Windows TerminateProcess and do not target a PID by name.
        try { record.child.stdin.write("cmd_router_to_child:exit\n"); }
        catch { /* The confirmed child-exit event remains the authority. */ }
      }
      let timer;
      try {
        await Promise.race([record.exit, new Promise((_, reject) => {
          timer = setTimeout(() => reject(aiError("Der eigene KI-Prozess ist noch nicht regulär beendet. Weitere Arbeit und Schließen bleiben gesperrt.", "LOCAL_AI_STOP_UNCONFIRMED")), stopTimeoutMs);
        })]);
        await cleanup(record);
      } catch (error) {
        state = "close-blocked"; errorCode = error.code === "LOCAL_AI_STOP_UNCONFIRMED" ? error.code : "LOCAL_AI_CLEANUP_FAILED"; record.stopping = null;
        throw aiError(errorCode === "LOCAL_AI_STOP_UNCONFIRMED" ? "Der eigene KI-Prozess ist noch nicht regulär beendet. Weitere Arbeit und Schließen bleiben gesperrt."
          : "Der eigene KI-Prozess ist beendet, aber sein privater Arbeitsbereich konnte nicht sicher entfernt werden.", errorCode);
      }
      finally { clearTimeout(timer); }
    })();
    return record.stopping;
  }
  async function localJson(record, suffix, { signal, body } = {}) {
    if (!["/health", "/v1/models", "/v1/chat/completions"].includes(suffix)) throw aiError("Unzulässiger lokaler KI-Endpunkt.");
    signal?.throwIfAborted();
    const response = await fetchImpl(`http://127.0.0.1:${record.port}${suffix}`, { method: body ? "POST" : "GET", redirect: "error", signal,
      headers: { Authorization: `Bearer ${record.key}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body } : {}) });
    if (suffix === "/health" && response.status === 503) { await response.body?.cancel?.(); return null; }
    if (!response.ok) { await response.body?.cancel?.(); throw aiError(`Die lokale KI-Anfrage wurde nicht bestätigt (HTTP ${response.status}).`, "LOCAL_AI_HTTP_FAILED"); }
    return JSON.parse(await boundedResponse(response, maxResponseBytes, { signal }));
  }
  async function ensureRunning(signal) {
    if (closed) throw aiError("Die lokale KI ist beendet.");
    if (own && !own.exited && state === "ready") return own;
    if (startTask) return startTask;
    if (own?.stopping) { await own.stopping; if (closed) throw aiError("Die lokale KI ist beendet."); }
    if (own && !own.exited) throw aiError("Der vorherige eigene KI-Prozess ist noch nicht beendet.", "LOCAL_AI_STOP_UNCONFIRMED");
    if (own?.exited) await cleanup(own);
    startAbort = new AbortController();
    const combined = AbortSignal.any([startAbort.signal, AbortSignal.timeout(startupTimeoutMs), ...(signal ? [signal] : [])]);
    state = "verifying"; errorCode = ""; lastExit = null;
    startTask = (async () => {
      let record;
      try {
        await beforeStart({ mode, signal: combined }); combined.throwIfAborted();
        const installation = await cache.resolveVerified({ signal: combined }); combined.throwIfAborted();
        for (const filename of [installation.serverPath, installation.modelPath, installation.projectorPath, installation.privateTempRoot]) {
          if (!path.isAbsolute(filename || "") || /^[/\\]{2}/.test(filename)) throw aiError("Die lokale KI benötigt gebundene lokale Offlinepfade.");
          await noLinks(filename);
        }
        await fs.mkdir(installation.privateTempRoot, { recursive: true });
        const directory = childPath(installation.privateTempRoot, `worker-${randomUUID()}`);
        await fs.mkdir(directory, { mode: 0o700 });
        const key = randomBytes(32).toString("hex"), keyFile = path.join(directory, "key.private");
        record = { directory, key, keyFile, port: null, alias: `fn-local-${randomUUID()}`, exited: false, child: null, cleanup: null };
        await fs.writeFile(keyFile, `${key}\n`, { flag: "wx", mode: 0o600 });
        const port = await allocatePort();
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw aiError("Kein gültiger lokaler KI-Port.");
        record.port = port;
        const args = ["-m", installation.modelPath, "--mmproj", installation.projectorPath, "--host", "127.0.0.1", "--port", String(port),
          "--alias", record.alias, "--api-key-file", keyFile, "--offline", "--no-webui", "--no-agent", "--parallel", "1", "--ctx-size", "4096",
          "--n-predict", "512", "--log-disable", "--threads", "4"];
        if (mode === "cpu") args.push("--device", "none", "--n-gpu-layers", "0", "--no-op-offload", "--no-mmproj-offload");
        else args.push("--n-gpu-layers", "auto");
        combined.throwIfAborted();
        let resolveExit;
        record.exit = new Promise((resolve) => { resolveExit = resolve; });
        own = record; state = "starting";
        record.child = spawnImpl(installation.serverPath, args, { cwd: installation.runtimeDirectory, windowsHide: true, shell: false,
          env: privateEnvironment(installation, directory, port), stdio: ["pipe", "ignore", "ignore"] });
        record.pid = record.child.pid;
        const failed = () => {
          if (record.stopping || record.failure) return;
          record.failure = aiError(failureMessage("LOCAL_AI_WORKER_EXITED"), "LOCAL_AI_WORKER_EXITED");
          state = "failed"; errorCode = "LOCAL_AI_WORKER_EXITED";
          // Abort pending HTTP reads with their actual cause. A process crash is not a user cancellation.
          requestAbort?.abort(record.failure);
        };
        const diagnostic = (code, signal) => {
          lastExit = { code: Number.isSafeInteger(code) ? code : null, signal: typeof signal === "string" && /^SIG[A-Z0-9]{1,15}$/.test(signal) ? signal : null,
            phase: record.ready ? "ready" : "starting", expected: Boolean(record.stopping && !record.failure),
            spawnError: ["ENOENT", "EACCES", "EPERM"].includes(record.spawnError) ? record.spawnError : record.spawnError ? "OTHER" : null };
        };
        record.child.once("error", (error) => { record.spawnError = typeof error?.code === "string" ? error.code : "OTHER"; diagnostic(null, null); failed(); });
        record.child.once("exit", (code, signal) => { diagnostic(code, signal); failed(); });
        record.child.once("close", (code, signal) => {
          if (record.exited) return;
          diagnostic(code, signal); failed(); record.exited = true; resolveExit();
          // close, not error/exit, confirms the owned child's stdio handles have drained.
          void cleanup(record).catch(() => { state = "close-blocked"; errorCode = "LOCAL_AI_CLEANUP_FAILED"; });
        });
        record.child.stdin?.on("error", () => {});
        while (!record.exited) {
          combined.throwIfAborted();
          let healthy;
          try { healthy = await localJson(record, "/health", { signal: combined }); }
          catch (error) {
            if (!(error instanceof TypeError) || combined.aborted) throw error;
            await delay(pollMs, combined); continue; // The owned process may not have bound its HTTP socket yet.
          }
          if (healthy) {
            const models = await localJson(record, "/v1/models", { signal: combined });
            const model = models?.data?.find((entry) => entry.id === record.alias);
            if (!model?.architecture?.input_modalities?.includes("image")) throw aiError("Das geladene lokale Modell bestätigt keine Bildunterstützung.");
            await fs.rm(keyFile, { force: true });
            combined.throwIfAborted(); record.ready = true; state = "ready";
            return record;
          }
          await delay(pollMs, combined);
        }
        throw record.failure || aiError("Der eigene lokale KI-Prozess konnte nicht gestartet werden.", "LOCAL_AI_START_FAILED");
      } catch (error) {
        if (record?.child) await stopRecord(record);
        else if (record?.directory) await cleanup(record);
        errorCode = failureCode(error, combined, "LOCAL_AI_START_FAILED");
        state = own && !own.exited ? "close-blocked" : errorCode === "LOCAL_AI_CANCELLED" ? "stopped" : "failed";
        throw aiError(failureMessage(errorCode, true), errorCode);
      }
    })();
    try { return await startTask; } finally { startTask = null; startAbort = null; }
  }
  const api = {
    status() { return { state, busy, ownPid: own?.pid || null, ownWorkerActive: Boolean(own && !own.exited), errorCode, mode, lastExit: lastExit && { ...lastExit } }; },
    async complete(request, { signal } = {}) {
      if (busy || closed) throw aiError("Die lokale KI arbeitet bereits oder ist beendet.");
      if (!request || Object.keys(request).some((key) => !["messages", "response_format", "temperature", "max_tokens", "chat_template_kwargs"].includes(key))
        || !Array.isArray(request.messages) || request.messages.length > 4 || request.response_format?.type !== "json_schema"
        || request.response_format?.json_schema?.schema?.type !== "object") throw aiError("Eine begrenzte strukturierte lokale KI-Anfrage ist erforderlich.");
      for (const message of request.messages) if (!["system", "user"].includes(message.role) || typeof message.content !== "string" && !Array.isArray(message.content)) throw aiError("Ungültige lokale KI-Nachricht.");
      for (const message of request.messages) if (Array.isArray(message.content)) for (const part of message.content) {
        if (part.type === "image_url" && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(part.image_url?.url || "")) throw aiError("Bilddaten müssen serverseitig gebundene Bytes sein; fremde URLs und Dateipfade sind ausgeschlossen.");
      }
      if (Buffer.byteLength(JSON.stringify(request)) > maxRequestBytes) throw aiError("Die lokale KI-Anfrage ist zu groß.");
      busy = true; requestAbort = new AbortController();
      const combined = AbortSignal.any([requestAbort.signal, AbortSignal.timeout(requestTimeoutMs), ...(signal ? [signal] : [])]);
      try {
        const record = await ensureRunning(combined);
        const body = JSON.stringify({ ...request, model: record.alias, stream: false });
        const response = await localJson(record, "/v1/chat/completions", { signal: combined, body });
        const choice = response?.choices?.[0];
        if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string" || choice.message.content.length > 30_000) throw aiError("Die lokale KI-Antwort ist unvollständig oder ungültig.", "LOCAL_AI_INVALID_RESPONSE");
        return JSON.parse(choice.message.content);
      } catch (error) {
        const code = failureCode(error, combined, "LOCAL_AI_INVALID_RESPONSE");
        if (own && !["LOCAL_AI_STOP_UNCONFIRMED", "LOCAL_AI_CLEANUP_FAILED"].includes(error.code)) await stopRecord(own);
        errorCode = code;
        if (!own) state = code === "LOCAL_AI_CANCELLED" ? "stopped" : "failed";
        throw aiError(failureMessage(code), code);
      } finally { busy = false; requestAbort = null; }
    },
    async stop() {
      startAbort?.abort(); requestAbort?.abort();
      if (own) await stopRecord(own);
      if (startTask) await startTask.catch(() => {});
    },
    async close() { closed = true; await api.stop(); },
  };
  return api;
}
