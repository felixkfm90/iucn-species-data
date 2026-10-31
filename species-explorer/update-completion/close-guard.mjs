import { completionError } from "./storage.mjs";

export function assertCompletionCloseReady(snapshot, deviceId, { requireVisibleCountdown = true } = {}) {
  if (!snapshot || snapshot.deviceId !== deviceId || snapshot.known !== true
    || typeof snapshot.uiDrafts !== "boolean" || typeof snapshot.writersActive !== "boolean" || typeof snapshot.jobsActive !== "boolean"
    || !["idle", "running", "awaiting-review", "completed", "failed"].includes(snapshot.pipeline?.status)
    || !["idle", "running", "completed", "failed"].includes(snapshot.backup?.status)
    || typeof snapshot.websiteTransfer?.running !== "boolean" || typeof snapshot.pendingChanges?.hasPendingChanges !== "boolean") {
    throw completionError("Offene Eingaben und laufende Arbeiten sind nicht vollständig geprüft.", "UPDATE_COMPLETION_CLOSE_UNKNOWN");
  }
  if (snapshot.uiDrafts || snapshot.pendingChanges.hasPendingChanges) throw completionError("Offene Eingaben oder Änderungen müssen zuerst geprüft und gespeichert werden.", "UPDATE_COMPLETION_DRAFTS");
  if (snapshot.writersActive || snapshot.jobsActive || snapshot.pipeline.status === "running" || snapshot.pipeline.status === "awaiting-review"
    || snapshot.backup.status === "running" || snapshot.websiteTransfer.running) {
    throw completionError("Eine Sicherung, Übernahme oder eigene Schreibarbeit läuft noch. Es wird keine zusätzliche Sicherung gestartet.", "UPDATE_COMPLETION_BUSY");
  }
  if (requireVisibleCountdown && snapshot.countdownVisible !== true) throw completionError("Der abbrechbare Countdown ist nicht sichtbar bestätigt.", "UPDATE_COMPLETION_NOT_VISIBLE");
  return snapshot;
}
