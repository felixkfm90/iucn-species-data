import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { taxonomyPublicationPath } from "../taxonomy-publication-storage.mjs";

export const UPDATE_RUN_PATTERN = /^update-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DECISIONS = new Set(["refresh-and-build", "rebuild-master", "build-corrections", "apply-corrections", "sync-lightroom", "activate", "current"]);
const FAILED = new Set(["failed", "partial", "stale", "interrupted", "cancelled", "aborted"]);
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const samePath = (left, right) => typeof left === "string" && typeof right === "string"
  && (process.platform === "win32" ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right));

export async function readSmallJson(filename) {
  try {
    const info = await fs.lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw new Error("Der kleine Abschlussnachweis fehlt oder ist ungültig.");
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export function validateCompletedUpdate({ workflow, master, maintenance, publication, taxonomyRoot }) {
  if (!workflow || workflow.schemaVersion !== 1 || !UPDATE_RUN_PATTERN.test(workflow.updateRunId || "") || !DECISIONS.has(workflow.decision)) {
    return { ready: false, terminal: true, reason: "Der gespeicherte Gesamtauftrag ist nicht gültig gebunden." };
  }
  if (workflow.error || FAILED.has(workflow.status)) return { ready: false, terminal: true, reason: "Der Updateauftrag ist nicht vollständig erfolgreich." };
  if (workflow.status !== "completed" || workflow.phase !== "completed") return { ready: false, terminal: false, reason: "Der vollständige Updateabschluss steht noch aus." };
  const startedAt = Date.parse(workflow.startedAt), completedAt = Date.parse(workflow.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt || !workflow.masterVersion
    || workflow.decision === "refresh-and-build" && workflow.sourceCompleted !== true) {
    return { ready: false, terminal: true, reason: "Der gespeicherte vollständige Updateabschluss ist nicht belegt." };
  }
  const activeMaster = master?.lifecycle?.active?.candidateId || master?.lifecycle?.active?.masterVersion;
  const expectedRelease = workflow.sourcePlan?.releaseId || workflow.baseline?.referenceRelease;
  const packageState = master?.lightroomPackage;
  // These are the real coordinator.finish/assertPairCurrent inputs, enriched
  // with the actual saved publication and package identities, never UI success.
  if (!master || !maintenance || master.active !== false || maintenance.active !== false || master.error || maintenance.error
    || FAILED.has(master.status) || FAILED.has(maintenance.status) || activeMaster !== workflow.masterVersion
    || master.lifecycle?.candidate || Number(master.lifecycle?.blockingConflictCount || 0) > 0
    || master.reference?.status === "error" || master.reference?.needsMasterRebuild !== false
    || !expectedRelease || master.reference?.activeRelease !== expectedRelease
    || master.corrections?.pending !== false || master.identities?.pending !== false
    || master.buildJob?.available && master.buildJob.status !== "ready"
    || workflow.buildStarted && (!master.buildJob?.available || master.buildJob.updateRunId !== workflow.updateRunId)
    || packageState?.status !== "current" || packageState.needsRebuild !== false
    || packageState.active?.masterVersion !== activeMaster || packageState.packageVersion !== activeMaster) {
    return { ready: false, terminal: true, reason: "Quellen, Master und Lightroom-Suchpaket sind nicht gemeinsam als aktuell bestätigt." };
  }
  if (publication?.schemaVersion !== 1 || !samePath(publication.taxonomyRoot, taxonomyRoot)
    || !samePath(path.dirname(publication.searchRoot || ""), path.dirname(taxonomyRoot))
    || !/^publication-[a-f0-9-]{36}$/.test(publication.active?.id || "")
    || publication.active.masterVersion !== activeMaster || !publication.active.packageId
    || publication.active.packageId !== packageState.active.packageId) {
    return { ready: false, terminal: true, reason: "Der gespeicherte Master-/Suchpaketzeiger passt nicht zum Gesamtauftrag." };
  }
  const evidence = { updateRunId: workflow.updateRunId, workflowRevision: digest(workflow),
    publicationId: publication.active.id, masterVersion: activeMaster, packageId: publication.active.packageId,
    completedAt: workflow.completedAt, referenceRelease: expectedRelease };
  return { ready: true, terminal: false, ...evidence, proofRevision: digest(evidence) };
}

export function createUpdateCompletionProofReader({ taxonomyRoot, masterService, maintenanceService,
  readWorkflow = () => readSmallJson(path.join(taxonomyRoot, "master", "update-workflow.json")),
  readPublication = () => readSmallJson(taxonomyPublicationPath(taxonomyRoot)) } = {}) {
  if (!taxonomyRoot || !masterService?.status || !maintenanceService?.status) throw new TypeError("Gespeicherter Gesamtauftrag und beide echten Statusdienste sind erforderlich.");
  return {
    readWorkflow,
    async read() {
      const workflow = await readWorkflow();
      if (workflow?.status !== "completed") return { workflow, proof: validateCompletedUpdate({ workflow, taxonomyRoot }) };
      const [master, maintenance, publication] = await Promise.all([masterService.status(), maintenanceService.status(), readPublication()]);
      const after = await readWorkflow();
      if (digest(after) !== digest(workflow)) return { workflow: after, proof: { ready: false, terminal: true, reason: "Der Gesamtauftrag wurde während der Abschlussprüfung verändert." } };
      return { workflow, proof: validateCompletedUpdate({ workflow, master, maintenance, publication, taxonomyRoot }) };
    },
  };
}
