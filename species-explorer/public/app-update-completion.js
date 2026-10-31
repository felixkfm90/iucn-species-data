(function initializeUpdateCompletion(global) {
  "use strict";

  const ACTIONS = Object.freeze([
    ["none", "Nichts tun"], ["exit-explorer", "Explorer beenden"],
    ["shutdown", "Diesen PC herunterfahren"], ["restart", "Diesen PC neu starten"],
  ]);

  function createUpdateCompletionController({ documentRef = global.document, selectionContainer, statusContainer,
    device, requestJson, apiPrefix = "/api/taxonomy/update-completion", showCountdown = async () => {},
    hasUnsavedDrafts = () => undefined, onError = () => {} } = {}) {
    if (!selectionContainer || !statusContainer || !device?.id || !device.name || typeof requestJson !== "function") {
      throw new TypeError("Lokales Gerät, Auswahl-/Statusbereich und geschützte API sind erforderlich.");
    }
    const label = documentRef.createElement("label"), select = documentRef.createElement("select");
    const hint = documentRef.createElement("p"), message = documentRef.createElement("p"), cancel = documentRef.createElement("button");
    label.textContent = "Nach erfolgreichem Update";
    select.setAttribute("aria-label", "Aktion nach erfolgreichem Update");
    for (const [value, title] of ACTIONS) {
      const option = documentRef.createElement("option"); option.value = value; option.textContent = title; select.append(option);
    }
    select.value = "none"; // A new screen never adopts an old stored action.
    label.append(select);
    hint.textContent = `Gilt nur für ${device.name}. Vor der Aktion kannst du den Countdown abbrechen.`;
    selectionContainer.append(label, hint);
    statusContainer.setAttribute("aria-live", "polite");
    cancel.type = "button"; cancel.textContent = "Abschlussaktion abbrechen"; cancel.hidden = true;
    statusContainer.append(message, cancel);
    let current = null, disposed = false;
    const presenting = new Set(), acknowledged = new Set();
    function visible() {
      return documentRef.visibilityState === "visible" && statusContainer.isConnected !== false
        && (typeof statusContainer.getClientRects !== "function" || statusContainer.getClientRects().length > 0);
    }
    async function post(suffix, body) {
      return requestJson(`${apiPrefix}/${suffix}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    }
    async function render(snapshot) {
      if (disposed) return;
      if (!snapshot || snapshot.deviceId !== device.id || !ACTIONS.some(([action]) => action === snapshot.action)) {
        throw new Error("Der Abschlussstatus gehört nicht zu diesem PC.");
      }
      current = snapshot;
      cancel.hidden = snapshot.cancellable !== true;
      message.textContent = snapshot.status === "countdown"
        ? `${ACTIONS.find(([action]) => action === snapshot.action)[1]} auf ${device.name} in ${snapshot.remainingSeconds ?? "…"} Sekunden`
        : snapshot.message || "Nach dem Update nichts tun.";
      if (snapshot.error) message.textContent += ` ${snapshot.error}`;
      if (snapshot.status === "awaiting-display" && snapshot.presentationToken && !acknowledged.has(snapshot.presentationToken) && !presenting.has(snapshot.presentationToken)) {
        const token = snapshot.presentationToken;
        presenting.add(token);
        try {
          await showCountdown(snapshot);
          if (disposed || current?.selectionId !== snapshot.selectionId || current?.presentationToken !== token
            || !visible() || await hasUnsavedDrafts() !== false) return;
          const confirmed = await post("displayed", { selectionId: snapshot.selectionId, updateRunId: snapshot.updateRunId,
            deviceId: device.id, presentationToken: token });
          acknowledged.add(token);
          await render(confirmed);
        } catch (error) { onError(error); }
        finally { presenting.delete(token); }
      }
    }
    cancel.addEventListener("click", async () => {
      if (!current?.cancellable || disposed) return;
      cancel.disabled = true;
      try { await render(await post("cancel", { selectionId: current.selectionId, updateRunId: current.updateRunId, deviceId: device.id })); }
      catch (error) { onError(error); }
      finally { cancel.disabled = false; }
    });
    return {
      render,
      getSelection() { return { action: select.value, deviceId: device.id }; },
      async prepareBeforeStart(requestId) {
        return post("selection", { ...this.getSelection(), ...(requestId ? { requestId } : {}) });
      },
      async bindStartedRun(selection, updateRunId) {
        return render(await post("bind", { selectionId: selection.selectionId, updateRunId, deviceId: device.id }));
      },
      async closeGuardPresentation() { return { uiDrafts: await hasUnsavedDrafts(), countdownVisible: visible() }; },
      dispose() { disposed = true; current = null; },
    };
  }

  global.SpeciesExplorerUpdateCompletion = { ACTIONS, createUpdateCompletionController };
})(globalThis);
