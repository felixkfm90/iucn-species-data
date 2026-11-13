(function initializeUpdateCompletion(global) {
  "use strict";

  const ACTIONS = Object.freeze([
    ["none", "Nichts tun"], ["exit-explorer", "Explorer beenden"],
    ["shutdown", "Diesen PC herunterfahren"], ["restart", "Diesen PC neu starten"],
  ]);

  // Layout rectangles also exist behind showModal(), where the outer page is
  // inert. Both the renderer acknowledgement and trusted desktop read use this
  // same check: the notice AND its actual cancel button must be accessible.
  function isCountdownAccessible({ documentRef = global.document, statusContainer,
    cancelButton = statusContainer?.querySelector?.("button[data-update-completion-cancel]") } = {}) {
    try {
      if (documentRef.visibilityState !== "visible" || statusContainer?.isConnected !== true
        || cancelButton?.isConnected !== true || !statusContainer.contains(cancelButton)
        || cancelButton.disabled || cancelButton.matches(":disabled") || cancelButton.getAttribute("aria-disabled") === "true") return false;
      const dialogs = documentRef.querySelectorAll("dialog[open]");
      if (Array.from(dialogs).some((dialog) => !dialog.contains(statusContainer) || !dialog.contains(cancelButton))) return false;
      const view = documentRef.defaultView;
      const rendered = (node) => {
        if (!node.getClientRects().length) return false;
        for (let current = node; current; current = current.parentElement) {
          if (current.hidden || current.inert || current.getAttribute?.("aria-hidden") === "true") return false;
          const style = view.getComputedStyle(current);
          if (style.display === "none" || ["hidden", "collapse"].includes(style.visibility)
            || style.contentVisibility === "hidden" || Number(style.opacity) === 0) return false;
        }
        return true;
      };
      if (!rendered(statusContainer) || !rendered(cancelButton) || view.getComputedStyle(cancelButton).pointerEvents === "none") return false;
      const width = documentRef.documentElement.clientWidth || view.innerWidth;
      const height = documentRef.documentElement.clientHeight || view.innerHeight;
      const notice = statusContainer.getBoundingClientRect(), button = cancelButton.getBoundingClientRect();
      if (![width, height, ...[notice, button].flatMap((rect) => [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height])]
        .every(Number.isFinite) || width <= 0 || height <= 0 || notice.width <= 0 || notice.height <= 0 || button.width <= 0 || button.height <= 0
        || notice.right <= 0 || notice.bottom <= 0 || notice.left >= width || notice.top >= height
        || button.left < 0 || button.top < 0 || button.right > width || button.bottom > height) return false;
      const hit = documentRef.elementFromPoint((button.left + button.right) / 2, (button.top + button.bottom) / 2);
      return hit === cancelButton || Boolean(hit && cancelButton.contains(hit));
    } catch { return false; }
  }

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
    cancel.setAttribute("data-update-completion-cancel", "");
    statusContainer.append(message, cancel);
    let current = null, disposed = false;
    const presenting = new Set(), acknowledged = new Set();
    function visible() {
      return isCountdownAccessible({ documentRef, statusContainer, cancelButton: cancel });
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
          // Draft providers may yield: a dialog, cancellation or different
          // selection can appear in that interval. Never acknowledge stale UI.
          if (disposed || current?.selectionId !== snapshot.selectionId || current?.presentationToken !== token || !visible()) return;
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

  global.SpeciesExplorerUpdateCompletion = { ACTIONS, isCountdownAccessible, createUpdateCompletionController };
})(globalThis);
