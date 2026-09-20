import { prepareTaxonomyPublication } from "../species-explorer/taxonomy-publication.mjs";
import { buildLightroomSearchPackage } from "../species-explorer/lightroom-search-package.mjs";

// This process has no publication step. If the Explorer disappears, no result
// can be authorized; even fully prepared releases remain inactive.
process.on("disconnect", () => { process.exit(2); });
const send = (value) => new Promise((resolve) => {
  if (process.connected) process.send(value, () => resolve());
  else resolve();
});
process.once("message", async (message) => {
  try {
    if (message?.type !== "prepare" || !message.options) throw new Error("Ungültiger Vorbereitungsauftrag.");
    const { timestamp, projectRevision, ...options } = message.options;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) throw new Error("Ungültiger Auftragszeitpunkt.");
    await send({ type: "progress", event: { phase: "prepare", percent: 0, message: "Master-/Lightroom-Abschlussprüfung läuft im Hintergrund." } });
    const prepared = await prepareTaxonomyPublication({ ...options, now: () => date,
      buildPackage: (build) => buildLightroomSearchPackage({ ...build, projectRevision, now: () => date }),
      onProgress: (event) => { if (process.connected) process.send({ type: "progress", event }, () => {}); },
    });
    await send({ type: "prepared", prepared });
  } catch (error) {
    await send({ type: "failed", message: error.message });
    process.exitCode = 1;
  } finally {
    process.removeAllListeners("disconnect");
    if (process.connected) process.disconnect();
  }
});
