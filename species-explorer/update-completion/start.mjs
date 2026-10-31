/** A completion choice can only bind to the real newly saved coordinator run. */
export async function startUpdateWithCompletion({ coordinator, completion, payload = {} } = {}) {
  const { completion: choice, ...start } = payload;
  if (!completion) {
    if (choice?.action && choice.action !== "none") throw Object.assign(new Error("Abschlussaktionen sind nur in der eingerichteten Desktop-App verfügbar."), { statusCode: 409 });
    return coordinator.start(start);
  }
  if (!choice) return coordinator.start(start);
  const selection = await completion.prepareSelection(choice);
  // Retrying the same local request after a lost response must return its run,
  // never create a second coordinator or cancel the first successful binding.
  if (selection.updateRunId) {
    const current = await coordinator.status();
    if (current.updateRunId !== selection.updateRunId) throw Object.assign(new Error("Der frühere Start gehört zu einem anderen Updateauftrag."), { statusCode: 409 });
    return current;
  }
  let workflow;
  try {
    workflow = await coordinator.start(start);
  } catch (error) {
    await completion.cancel({ selectionId: selection.selectionId, deviceId: selection.deviceId }).catch(() => {});
    throw error;
  }
  try {
    await completion.bindStartedRun({ selectionId: selection.selectionId, updateRunId: workflow.updateRunId, deviceId: selection.deviceId });
    return workflow;
  } catch {
    // The real update is already started and remains owned by the coordinator.
    // Disarm only the optional side effect and report this bounded outcome.
    await completion.cancel({ selectionId: selection.selectionId, deviceId: selection.deviceId }).catch(() => {});
    return { ...workflow, completionWarning: "Das Update wurde gestartet. Die Abschlussaktion konnte nicht sicher gebunden werden und wird nicht ausgeführt." };
  }
}
