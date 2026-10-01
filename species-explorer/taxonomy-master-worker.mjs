import fs from "node:fs/promises";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { buildTaxonomyMasterCandidate, inspectTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { masterJobDirectory, verifyMasterJob, readMasterJobRecords, acquireMasterJobLock } from "./taxonomy-master-job.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { MasterBuildPaused } from "./taxonomy-master-checkpoint.mjs";
import { assertTaxonomySpace, taxonomyDirectoryBytes } from "./taxonomy-space-budget.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";

export async function executeMasterJob({ taxonomyRoot, id, resume = false, shouldPause = () => false, onProgress = () => {},
  checkSpace = assertTaxonomySpace }) {
  const directory = masterJobDirectory(taxonomyRoot, id);
  const releaseLock = await acquireMasterJobLock(taxonomyRoot);
  let writes = Promise.resolve(), lastSaved = 0;
  let state = { schemaVersion: 1, id, pid: process.pid, status: "building", startedAt: new Date().toISOString() };
  const save = () => {
    const snapshot = { ...state, updatedAt: new Date().toISOString() };
    writes = writes.then(() => atomicWriteJson(path.join(directory, "state.json"), snapshot));
    // Observe rejection immediately; it is rethrown at the next awaited save.
    writes.catch(() => {});
    return writes;
  };
  const paused = () => shouldPause() || existsSync(path.join(directory, "pause.json"));
  const progress = (event) => {
    state = { ...state, progress: event };
    onProgress(event);
    if (Date.now() - lastSaved > 1000) { lastSaved = Date.now(); void save(); }
  };
  try {
    // Clear only the old request under the exclusive lock, before any lengthy
    // input verification. A new pause during that verification must survive.
    if (resume) rmSync(path.join(directory, "pause.json"), { force: true });
    // Keep the last DISPLAY checkpoint even if resume fails during input checks.
    // Actual resume authorization still comes only from the SQLite cursor.
    try {
      const previous = JSON.parse(await fs.readFile(path.join(directory, "state.json"), "utf8"));
      if (previous.id === id && previous.checkpoint) state.checkpoint = previous.checkpoint;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const recipe = JSON.parse(await fs.readFile(path.join(directory, "recipe.json"), "utf8"));
    if (recipe.id !== id) throw new Error("Master-Auftrag und Verzeichnis stimmen nicht überein.");
    await verifyMasterJob(taxonomyRoot, recipe);
    if (paused()) throw new MasterBuildPaused();
    await save();
    const previous = await inspectTaxonomyMasterCandidate(taxonomyRoot, { validate: false });
    // A crash after installing staging but before saving state must not rebuild
    // or replace the candidate again. It is still never activated here.
    if (previous.manifest?.buildJobRevision === recipe.revision) {
      await inspectTaxonomyMasterCandidate(taxonomyRoot);
      state.status = "ready";
      await save();
      return previous.manifest;
    }
    let inputBytes = 0;
    for (const filename of Object.keys(recipe.inputs)) inputBytes += (await fs.stat(path.join(directory, filename))).size;
    const baseBytes = await taxonomyDirectoryBytes(path.dirname(taxonomyMasterDatabasePath(taxonomyRoot)));
    const writtenBytes = await taxonomyDirectoryBytes(path.join(directory, "candidate"));
    await checkSpace(taxonomyRoot, Math.max(0, Math.max(inputBytes * 6, baseBytes * 2) - writtenBytes));
    const providerSlices = [];
    for (const provider of recipe.providers) {
      const records = [];
      for await (const record of readMasterJobRecords(path.join(directory, provider.file))) records.push(record);
      providerSlices.push({ manifest: provider.manifest, records });
    }
    const manifest = await buildTaxonomyMasterCandidate({
      ...recipe.options, taxonomyRoot, providerSlices,
      colRecords: readMasterJobRecords(path.join(directory, "col.jsonl")),
      now: () => new Date(recipe.timestamp),
      checkpoint: { directory: path.join(directory, "candidate"), revision: recipe.revision,
        shouldPause: paused,
        onCheckpoint: async (checkpoint) => {
          state.checkpoint = checkpoint;
          await save();
          await checkSpace(taxonomyRoot);
          onProgress({ phase: "Schreibblock gesichert", ...checkpoint });
        } },
      onProgress: (event) => { progress(event); if (paused()) throw new MasterBuildPaused(); },
      beforePublish: async () => {
        await writes;
        await verifyMasterJob(taxonomyRoot, recipe);
        if (paused()) throw new MasterBuildPaused();
      },
    });
    state = { ...state, status: "ready", candidateId: manifest.candidateId };
    await save();
    return manifest;
  } catch (error) {
    state = { ...state, status: error.code === "MASTER_BUILD_PAUSED" ? "paused" : error.code === "MASTER_JOB_STALE" ? "stale" : "failed", error: error.message };
    await save().catch(() => {});
    throw error;
  } finally { await writes.catch(() => {}); releaseLock(); }
}
