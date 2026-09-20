import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { childProcessEnvironment } from "./child-process-environment.mjs";
import { masterJobDirectory } from "./taxonomy-master-job.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";

export async function pauseMasterJob(taxonomyRoot, id) {
  await atomicWriteJson(path.join(masterJobDirectory(taxonomyRoot, id), "pause.json"), { pause: true });
}

export async function startMasterJobProcess({ taxonomyRoot, id, resume = false, onProgress = () => {},
  execPath = process.execPath, spawnProcess = spawn }) {
  masterJobDirectory(taxonomyRoot, id); // Validate before spawning.
  // Resume is explicit. Merely opening the Explorer must not restart work.
  const child = spawnProcess(execPath, ["--no-warnings", fileURLToPath(new URL("../scripts/taxonomy-master-worker.mjs", import.meta.url)),
    path.resolve(taxonomyRoot), id, ...(resume ? ["--resume"] : [])], { env: childProcessEnvironment(execPath), windowsHide: true,
    stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = "", result = null, failure = null, callbackError = null;
  // Process exit may precede delivery of the final IPC message. Drain the IPC
  // channel as well, without waiting for Windows' unreliable aggregate close.
  const channelClosed = new Promise((resolve) => {
    child.once("disconnect", resolve);
    child.once("error", resolve);
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-16384); });
  child.on("message", (message) => {
    if (message.type === "ready") result = message.manifest;
    if (message.type === "failed") failure = message;
    if (message.type === "progress") {
      try { onProgress(message.event); }
      catch (error) { callbackError = error; void pauseMasterJob(taxonomyRoot, id).catch(() => {}); }
    }
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    // With an explicitly disconnected IPC channel, Windows can leave the
    // aggregate stdio 'close' notification pending after the process has exited.
    child.once("exit", resolve);
  });
  await channelClosed;
  if (callbackError) throw callbackError;
  if (exitCode !== 0 || !result) {
    const error = new Error(failure?.message || stderr.trim() || "Master-Hintergrundprozess wurde unterbrochen; der letzte sichere Schreibblock bleibt erhalten.");
    error.code = failure?.code || (exitCode === 2 ? "MASTER_BUILD_PAUSED" : "MASTER_WORKER_EXIT");
    throw error;
  }
  return result;
}
