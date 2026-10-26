export function speciesCreationAvailability({ updateWorkflow = {}, databaseActive = false,
  backupActive = false, assetWriteActive = false, creationMutationActive = false } = {}) {
  const status = String(updateWorkflow.status || "idle");
  if (updateWorkflow.updateRunId && !["idle", "completed"].includes(status)) {
    const stopped = ["failed", "interrupted", "paused"].includes(status);
    return {
      available: false, reason: stopped ? `update-${status}` : "update-active",
      message: status === "failed"
        ? "Das Datenbank-Update ist fehlgeschlagen. Der gespeicherte Auftrag ist noch offen und sperrt neue Arten. Bitte den Auftrag im Datenbankfenster prüfen."
        : stopped
          ? "Das Datenbank-Update ist angehalten. Der gespeicherte Auftrag ist noch offen und sperrt neue Arten. Bitte den Auftrag im Datenbankfenster prüfen."
          : "Ein Datenbank-Update ist noch offen. Neue Arten können erst danach angelegt werden.",
    };
  }
  if (databaseActive) return { available: false, reason: "database-active",
    message: "Die Taxonomiedatenbank wird gerade bearbeitet. Bitte den Abschluss abwarten." };
  if (backupActive || assetWriteActive || creationMutationActive) return { available: false, reason: "project-write",
    message: "Eine Sicherung oder Speicherung läuft. Bitte kurz warten und erneut versuchen." };
  return { available: true, reason: "", message: "" };
}
