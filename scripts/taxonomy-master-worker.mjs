import { executeMasterJob } from "../species-explorer/taxonomy-master-worker.mjs";

let disconnected = false;
process.on("disconnect", () => { disconnected = true; });
const send = (value) => new Promise((resolve) => {
  if (process.connected) process.send(value, () => resolve());
  else resolve();
});
try {
  const [taxonomyRoot, id, flag] = process.argv.slice(2);
  if (!taxonomyRoot || !id || process.argv.length > 5 || flag && flag !== "--resume") throw new Error("Taxonomiepfad und Auftragskennung sind erforderlich.");
  const manifest = await executeMasterJob({ taxonomyRoot, id, resume: flag === "--resume", shouldPause: () => disconnected,
    onProgress: (event) => send({ type: "progress", event }) });
  await send({ type: "ready", manifest });
} catch (error) {
  await send({ type: "failed", code: error.code, message: error.message });
  process.exitCode = error.code === "MASTER_BUILD_PAUSED" ? 2 : 1;
} finally { if (process.connected) process.disconnect(); }
