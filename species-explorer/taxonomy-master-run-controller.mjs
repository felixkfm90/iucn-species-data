import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { acquireMasterJobLock, masterJobLockHeld, masterJobDirectory, masterJobsDirectory, prepareMasterJob, verifyMasterJob } from "./taxonomy-master-job.mjs";
import { readTaxonomyMasterManifest } from "./taxonomy-master-candidate.mjs";
import { startMasterJobProcess, pauseMasterJob } from "./taxonomy-master-process.mjs";

async function readJson(filename) {
  try { return JSON.parse(await fs.readFile(filename, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export class MasterRunController {
  constructor(taxonomyRoot, { startProcess = startMasterJobProcess } = {}) {
    this.root = taxonomyRoot;
    this.startProcess = startProcess;
    this.currentFile = path.join(masterJobsDirectory(taxonomyRoot), "current.json");
    this.busy = false;
    this.closing = false;
  }
  isActive() {
    return this.busy || masterJobLockHeld(this.root) || masterJobLockHeld(this.root, "control");
  }
  async exclusive(operation) {
    if (this.isActive()) throw new Error("Ein Datenbank-Hintergrundlauf ist noch aktiv. Bitte warten oder pausieren.");
    this.busy = true;
    let unlock;
    try {
      unlock = await acquireMasterJobLock(this.root, "control");
      if (masterJobLockHeld(this.root)) throw new Error("Ein Master-Hintergrundprozess läuft bereits.");
      return await operation();
    } finally { unlock?.(); this.busy = false; }
  }
  async current() {
    const current = await readJson(this.currentFile);
    if (!current) return null;
    masterJobDirectory(this.root, current.id); // Validate before any path access.
    return current;
  }
  async status() {
    const current = await this.current();
    if (!current) return { available: false };
    const directory = masterJobDirectory(this.root, current.id);
    const saved = await readJson(path.join(directory, "state.json"));
    const executing = masterJobLockHeld(this.root);
    const pause = await readJson(path.join(directory, "pause.json"));
    const terminal = ["ready", "paused", "failed", "stale"];
    const status = executing ? pause ? "pausing" : "building"
      : terminal.includes(saved?.status) ? saved.status : "interrupted";
    return { available: true, id: current.id, status, startedAt: current.startedAt,
      warnings: current.warnings || [],
      progress: saved?.progress || null, checkpoint: saved?.checkpoint || null, error: saved?.error || "",
      canPause: executing && !pause,
      canResume: !this.isActive() && ["paused", "interrupted", "failed"].includes(status) };
  }
  // Called inside the service's exclusive operation, after today's inputs were
  // read under a snapshot. It never starts a download or activates a candidate.
  async build(options) {
    if (this.closing) throw new Error("Explorer wird geschlossen; es wurde kein Hintergrundlauf gestartet.");
    const job = await prepareMasterJob(options);
    await atomicWriteJson(this.currentFile, { schemaVersion: 1, id: job.id, startedAt: options.now().toISOString(), warnings: options.warnings || [] });
    if (this.closing) await pauseMasterJob(this.root, job.id);
    return this.startProcess({ taxonomyRoot: this.root, id: job.id, onProgress: options.onProgress });
  }
  async resume(onProgress) {
    const current = await this.current();
    if (!current) throw new Error("Es gibt keinen gespeicherten Masteraufbau zum Fortsetzen.");
    return this.startProcess({ taxonomyRoot: this.root, id: current.id, resume: true, onProgress });
  }
  async assertReadyForActivation() {
    const current = await this.current();
    if (!current) return; // Legacy candidate without a background job.
    const status = await this.status();
    if (status.status !== "ready") throw new Error("Der gespeicherte Masteraufbau ist nicht abgeschlossen. Bitte fortsetzen oder einen neuen Aufbau starten; ein älterer Kandidat wird nicht aktiviert.");
    const directory = masterJobDirectory(this.root, current.id);
    const recipe = await readJson(path.join(directory, "recipe.json"));
    try { await verifyMasterJob(this.root, recipe); }
    catch (error) {
      if (error.code === "MASTER_JOB_STALE") {
        const saved = await readJson(path.join(directory, "state.json"));
        await atomicWriteJson(path.join(directory, "state.json"), { ...saved, status: "stale", error: error.message });
      }
      throw error;
    }
    const candidate = await readTaxonomyMasterManifest(this.root, "staging");
    if (candidate?.buildJobRevision !== recipe.revision) throw new Error("Der Kandidat gehört nicht zum letzten Masteraufbau. Bitte einen neuen Aufbau starten.");
  }
  async pause() {
    const current = await this.current();
    if (!current || !masterJobLockHeld(this.root)) throw new Error("Aktuell läuft kein pausierbarer Masteraufbau.");
    await pauseMasterJob(this.root, current.id);
  }
  async requestClose() {
    this.closing = true;
    if (masterJobLockHeld(this.root)) await this.pause();
  }
}
