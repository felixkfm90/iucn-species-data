(function initializeDesktopCompletion(global) {
  "use strict";

  function createDesktopCompletionPresentation({ documentRef = global.document, statusContainer, draftProviders = [] } = {}) {
    return function readPresentation(context = {}) {
      let uiDrafts;
      try {
        const values = draftProviders.map((read) => read());
        const editingDialog = Array.from(documentRef.querySelectorAll("dialog[open]"))
          .some((dialog) => dialog.id !== "pipeline-dialog");
        uiDrafts = values.every((value) => typeof value === "boolean") ? values.some(Boolean) || editingDialog : undefined;
      } catch { uiDrafts = undefined; }
      const countdownVisible = documentRef.visibilityState === "visible" && statusContainer?.isConnected === true
        && !statusContainer.hidden && statusContainer.getClientRects().length > 0
        && statusContainer.dataset.selectionId === context.selectionId
        && statusContainer.dataset.updateRunId === context.updateRunId;
      return { uiDrafts, countdownVisible: Boolean(countdownVisible) };
    };
  }

  function setupDesktopCompletion({ fetchJson, selectionContainer, statusContainer, draftProviders = [],
    documentRef = global.document, onError = () => {} } = {}) {
    let controller, timer, stopped = false, inFlight = false;
    const readPresentation = createDesktopCompletionPresentation({ documentRef, statusContainer, draftProviders });
    global.SpeciesExplorerCompletionPresentation = readPresentation;
    const api = {
      getSelection() {
        return controller ? { ...controller.getSelection(), requestId: global.crypto.randomUUID() } : { action: "none" };
      },
      readPresentation,
      stop() { stopped = true; global.clearTimeout(timer); controller?.dispose(); },
    };
    async function poll() {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await fetchJson("/api/taxonomy/update-completion");
        if (stopped) return;
        if (!snapshot.available) { selectionContainer.hidden = true; statusContainer.hidden = true; return; }
        if (!controller) {
          selectionContainer.hidden = false;
          controller = global.SpeciesExplorerUpdateCompletion.createUpdateCompletionController({
            documentRef, selectionContainer, statusContainer,
            device: { id: snapshot.deviceId, name: snapshot.deviceName }, requestJson: fetchJson,
            showCountdown: async () => { statusContainer.hidden = false; },
            hasUnsavedDrafts: () => readPresentation().uiDrafts, onError,
          });
        }
        statusContainer.dataset.selectionId = snapshot.selectionId || "";
        statusContainer.dataset.updateRunId = snapshot.updateRunId || "";
        statusContainer.hidden = ["inactive", "disarmed", "cancelled"].includes(snapshot.status);
        await controller.render(snapshot);
      } catch (error) { onError(error); }
      finally {
        inFlight = false;
        if (!stopped) timer = global.setTimeout(() => { void poll(); }, 1000);
      }
    }
    void poll();
    global.addEventListener?.("pagehide", () => api.stop(), { once: true });
    return api;
  }
  global.SpeciesExplorerDesktopCompletion = Object.freeze({ createDesktopCompletionPresentation, setupDesktopCompletion });
})(globalThis);
