import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { childProcessEnvironment } from "./child-process-environment.mjs";

// Only serializable preparation data crosses IPC. Authority to switch the
// active pair, live input validation and the preference lock stay in the parent.
export async function prepareTaxonomyPublicationInWorker({ taxonomyRoot, searchRoot, id, action, sourceSlot,
  corrections, expectedSourceManifest, projectRevision = "working-tree", now = () => new Date(),
  incremental = true, onProgress = () => {}, signal, execPath = process.execPath, spawnProcess = spawn,
} = {}) {
  if (typeof incremental !== "boolean") throw new Error("Ungültiger Suchpaket-Aufbaumodus.");
  signal?.throwIfAborted();
  const timestamp = now().toISOString();
  const child = spawnProcess(execPath, ["--no-warnings",
    fileURLToPath(new URL("../scripts/taxonomy-publication-worker.mjs", import.meta.url))], {
    env: childProcessEnvironment(execPath), windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let result, failure, callbackError, stderr = "";
  const channelClosed = new Promise((resolve) => { child.once("disconnect", resolve); child.once("error", resolve); });
  const exited = new Promise((resolve) => {
    child.once("exit", (code) => resolve({ code }));
    child.once("error", (error) => resolve({ error }));
  });
  const abort = () => { child.kill(); };
  signal?.addEventListener("abort", abort, { once: true });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-16384); });
  child.on("message", (message) => {
    if (message?.type === "prepared") result = message.prepared;
    if (message?.type === "failed") failure = message.message;
    if (message?.type === "progress") {
      try { onProgress({ ...message.event, workerPid: child.pid }); }
      catch (error) { callbackError = error; abort(); }
    }
  });
  try {
    try {
      child.send({ type: "prepare", options: { taxonomyRoot, searchRoot, id, action, sourceSlot, corrections,
        expectedSourceManifest, projectRevision, timestamp, incremental } }, (error) => {
        if (error) { failure = error.message; abort(); }
      });
    } catch (error) { failure = error.message; abort(); }
    if (signal?.aborted) abort();
    const { code, error } = await exited;
    await channelClosed;
    signal?.throwIfAborted();
    if (error) throw error;
    if (callbackError) throw callbackError;
    if (failure || code !== 0 || !result) throw new Error(failure || stderr.trim()
      || "Die Paarvorbereitung wurde unterbrochen. Der aktive Master-/Lightroom-Stand bleibt erhalten.");
    return result;
  } finally { signal?.removeEventListener("abort", abort); }
}
