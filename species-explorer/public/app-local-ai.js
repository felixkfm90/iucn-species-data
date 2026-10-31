(function initializeLocalAi(global) {
  "use strict";

  const TERMINAL = new Set(["completed", "cancelled", "failed", "stale"]);
  const JOB_STATES = new Set(["queued", "running", ...TERMINAL]);
  const text = (value, limit = 2000) => typeof value === "string" ? value.slice(0, limit) : "";
  const validText = (value) => typeof value === "string" && value.trim() && value.length <= 2000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
  const refused = (error) => Number.isInteger(error?.status) && error.status >= 400 && error.status < 500;

  /** isCurrent must also compare the unchanged main-editor input captured at openForImage. */
  function createLocalAiController({ documentRef = global.document, fetchJson, createDialogController,
    confirmAction, safeImageUrl = global.SpeciesExplorerWebsiteAltTexts?.safeImageUrl, apiPrefix = "/api/local-ai",
    setTimeoutImpl = global.setTimeout.bind(global), clearTimeoutImpl = global.clearTimeout.bind(global),
    now = Date.now, requestId = () => global.crypto.randomUUID(), pollMs = 1200, requestTimeoutMs = 30000,
    jobTimeoutMs = 210000 } = {}) {
    if (!documentRef?.createElement || !documentRef.body || typeof fetchJson !== "function" || typeof createDialogController !== "function"
      || typeof safeImageUrl !== "function" || typeof requestId !== "function" || !apiPrefix.startsWith("/api/") || apiPrefix.includes("?")) {
      throw new TypeError("Lokale Bildtexthilfe benötigt den vorhandenen Dialog-, Vorschau- und API-Anschluss.");
    }
    const make = (tag, className, content = "") => {
      const element = documentRef.createElement(tag); if (className) element.className = className;
      element.textContent = content; return element;
    };
    const dialog = make("dialog", "local-ai-dialog"), shell = make("div", "local-ai-shell"), header = make("header", "local-ai-header");
    const title = make("h2", "", "Lokale Bildtexthilfe"), closeButton = make("button", "", "Schließen"); closeButton.type = "button";
    title.id = `local-ai-title-${requestId()}`; dialog.setAttribute("aria-labelledby", title.id); header.append(title, closeButton);
    const intro = make("p", "local-ai-note", "Ein Vorschlag auf diesem PC. Bitte am Bild prüfen; du entscheidest, welcher Text in den Entwurf kommt.");
    const layout = make("div", "local-ai-layout"), figure = make("figure", "local-ai-preview"), image = make("img"), imageError = make("p", "", "Die Bildvorschau konnte nicht geladen werden.");
    image.alt = "Bild zur Prüfung des Textvorschlags"; image.referrerPolicy = "no-referrer"; imageError.hidden = true; figure.append(image, imageError);
    const editor = make("div", "local-ai-editor"), status = make("p", "local-ai-status"), installation = make("div", "local-ai-installation");
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const installHint = make("p", "", "Optional: ca. 3,4 GB herunterladen. Die Bildtexthilfe arbeitet danach lokal; die Einrichtung beginnt erst nach deiner Bestätigung.");
    const download = make("button", "", "Lokale Hilfe einrichten · ca. 3,4 GB"), cancelDownload = make("button", "", "Einrichtung abbrechen");
    download.type = "button"; cancelDownload.type = "button"; installation.append(installHint, download, cancelDownload);
    const progress = make("progress"), progressText = make("span", "local-ai-note"); progress.max = 100; progress.setAttribute("aria-label", "Einrichtung der lokalen Bildtexthilfe"); installation.append(progress, progressText);
    const originalDetails = make("details", "local-ai-details"), originalSummary = make("summary", "", "Vorhandener Text"), originalText = make("p"); originalDetails.append(originalSummary, originalText);
    const label = make("label", "", "Textvorschlag"), draft = make("textarea"); draft.rows = 4; draft.maxLength = 2000; label.append(draft);
    const coupledHint = make("p", "local-ai-note", "Bildunterschrift und Alternativtext bleiben gleich.");
    const actions = make("div", "local-ai-actions"), generate = make("button", "", "Vorschlag erstellen"), apply = make("button", "", "In meinen Textentwurf übernehmen"), cancelJob = make("button", "", "Vorschlag abbrechen"), refresh = make("button", "", "Status neu prüfen");
    for (const button of [generate, apply, cancelJob, refresh]) button.type = "button";
    actions.append(generate, cancelJob, refresh, apply);
    const details = make("details", "local-ai-details"), detailsSummary = make("summary", "", "Hinweise zum Vorschlag"), detailsBody = make("p"); details.append(detailsSummary, detailsBody);
    editor.append(status, installation, originalDetails, label, coupledHint, actions, details); layout.append(figure, editor); shell.append(header, intro, layout); dialog.append(shell); documentRef.body.append(dialog);
    let selection = null, backend = null, job = null, proposal = null, currentRequest = null, timer = null;
    let generation = 0, disposed = false, working = false, closePending = false, ownDownload = false, applying = false, jobStartedAt = 0;
    let value = "", phase = "closed", message = "", unresolved = false, applied = false, confirmedClose = false, nativeClose = false, detailsText = "";
    const listeners = [];
    const listen = (node, event, handler) => { node.addEventListener(event, handler); listeners.push(() => node.removeEventListener?.(event, handler)); };
    const open = () => controls.isOpen();
    const activeJob = () => Boolean(currentRequest && (!job || !TERMINAL.has(job.status)));
    const unsaved = () => Boolean(selection && !applied && (proposal || value && value !== selection.initialText));
    function stopTimer() { clearTimeoutImpl(timer); timer = null; }
    function say(nextPhase, nextMessage) { phase = nextPhase; message = nextMessage; render(); }
    function render() {
      const installed = ["ready", "installed-unverified"].includes(backend?.cache?.status);
      const installing = backend?.installing === true || backend?.cache?.installing === true;
      status.textContent = message;
      installation.hidden = backend?.available !== true || installed && !installing;
      download.hidden = installing || backend?.available === false; download.disabled = working || installing || activeJob() || applying || unresolved;
      cancelDownload.hidden = !ownDownload || !installing; cancelDownload.disabled = working;
      progress.hidden = !installing; progressText.hidden = !installing;
      const total = backend?.cache?.totalBytes, received = backend?.cache?.downloadedBytes;
      const percent = Number.isFinite(total) && total > 0 && Number.isFinite(received) ? Math.min(100, Math.floor(received / total * 100)) : null;
      if (percent === null) progress.removeAttribute?.("value"); else progress.value = percent;
      progressText.textContent = percent === null ? "Einrichtung läuft …" : ` ${percent} % heruntergeladen`;
      generate.disabled = !installed || backend?.available !== true || backend?.busy === true || working || activeJob() || applying || unresolved || phase === "stale";
      generate.textContent = proposal ? "Neuen Vorschlag erstellen" : "Vorschlag erstellen";
      cancelJob.hidden = !activeJob() && !unresolved; cancelJob.disabled = working || applying;
      refresh.hidden = !unresolved && phase !== "error" && phase !== "unavailable";
      refresh.disabled = working || applying;
      draft.disabled = activeJob() || applying || working;
      label.hidden = !proposal && !value;
      if (draft.value !== value) draft.value = value;
      apply.disabled = !proposal || !validText(value) || activeJob() || working || applying || unresolved || phase === "stale";
      coupledHint.hidden = proposal?.caption === null || !proposal;
      details.hidden = !detailsText; detailsBody.textContent = detailsText;
      originalDetails.hidden = !selection?.initialText; originalText.textContent = selection?.initialText || "";
    }
    async function call(suffix, body) {
      const controller = new global.AbortController();
      let timeout;
      const expired = new Promise((_, reject) => { timeout = setTimeoutImpl(() => { controller.abort(); reject(new Error("Lokale Anfrage hat ihr Zeitlimit erreicht.")); }, requestTimeoutMs); });
      try {
        return await Promise.race([Promise.resolve().then(() => fetchJson(`${apiPrefix}${suffix}`, { signal: controller.signal,
          ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) })), expired]);
      } finally { clearTimeoutImpl(timeout); }
    }
    function sameGeneration(epoch) { return !disposed && epoch === generation && open(); }
    async function current() {
      try { return Boolean(selection) && await selection.isCurrent({ pageUrl: selection.pageUrl, imageKey: selection.imageKey,
        observationHash: selection.observationHash, initialText: selection.initialText }) === true; }
      catch { return false; }
    }
    function schedule() {
      stopTimer();
      if (!disposed && open() && (activeJob() || backend?.installing || backend?.cache?.installing || backend?.busy)) {
        timer = setTimeoutImpl(() => { timer = null; void poll(); }, pollMs);
      }
    }
    async function cancelKnownJob(target = job) {
      if (!target?.jobId || TERMINAL.has(target.status)) return true;
      const result = await call(`/jobs/${encodeURIComponent(target.jobId)}/cancel`, {});
      if (!result || result.jobId !== target.jobId || result.requestId !== currentRequest?.requestId
        || !TERMINAL.has(result.status)) throw new Error("Der eigene Auftrag ist noch nicht sicher beendet.");
      job = result; return true;
    }
    async function recover() {
      const snapshot = await call(""); backend = snapshot;
      const matches = Array.isArray(snapshot?.jobs) ? snapshot.jobs.filter((item) => item.requestId === currentRequest?.requestId) : [];
      if (matches.length !== 1) { unresolved = true; say("uncertain", "Der Auftragsstatus ist noch unklar. Bitte den Status erneut prüfen; es wird kein weiterer Vorschlag gestartet."); return false; }
      checkJob(matches[0]);
      job = matches[0]; unresolved = false; return true;
    }
    function checkJob(result) {
      if (!result || !JOB_STATES.has(result.status) || typeof result.jobId !== "string" || !result.jobId
        || result.requestId !== currentRequest?.requestId || result.kind !== "alt-text" || result.approved !== false || result.transferred !== false
        || job && job.jobId !== result.jobId) throw new Error("Der Auftrag passt nicht zum ausgewählten Bild.");
    }
    async function acceptJob(result, epoch) {
      checkJob(result); if (!sameGeneration(epoch)) return;
      job = result;
      if (!await current()) {
        if (!TERMINAL.has(job.status)) await cancelKnownJob();
        say("stale", "Das Bild oder dein vorhandener Text wurde inzwischen geändert. Dein Text bleibt erhalten; bitte die Bildtexthilfe neu öffnen."); return;
      }
      if (result.status === "completed") {
        const next = result.result, binding = next?.binding;
        if (next?.kind !== "alt-text" || next.status !== "proposal" || next.approved !== false || next.transferred !== false
          || next.humanReviewRequired !== true || binding?.pageUrl !== selection.pageUrl || binding?.imageKey !== selection.imageKey
          || binding?.revision !== selection.observationHash || !validText(next.text) || next.caption !== null && next.caption !== next.text) {
          say("stale", "Der Vorschlag ist nicht eindeutig an dieses Bild gebunden und wird nicht übernommen."); return;
        }
        proposal = next; value = next.text; applied = false;
        detailsText = Array.isArray(next.uncertainties) ? next.uncertainties.slice(0, 8).map((item) => text(item, 300)).join("\n") : "";
        say("proposal", "Vorschlag bereit. Du kannst ihn bearbeiten und danach in deinen Textentwurf übernehmen.");
      } else if (result.status === "stale") say("stale", "Die Bildgrundlage wurde inzwischen verändert. Dein vorhandener Text bleibt erhalten; bitte die Bildtexthilfe neu öffnen.");
      else if (result.status === "failed") say("error", text(result.error, 500) || "Der Vorschlag konnte nicht erstellt werden. Dein vorhandener Text bleibt erhalten.");
      else if (result.status === "cancelled") say("cancelled", "Der Vorschlag wurde abgebrochen oder das Zeitlimit erreicht. Dein vorhandener Text bleibt erhalten.");
      else say(result.status, result.status === "queued" ? "Dein Bild wartet auf die lokale Bildtexthilfe." : "Die lokale Bildtexthilfe betrachtet das ausgewählte Foto …");
    }
    async function poll() {
      if (working || disposed || !open()) return;
      const epoch = generation; working = true; render();
      try {
        if (activeJob() || unresolved) {
          if (unresolved && !await recover()) return;
          if (now() - jobStartedAt > jobTimeoutMs && !TERMINAL.has(job.status)) {
            await cancelKnownJob(); say("cancelled", "Das Zeitlimit ist erreicht. Der eigene Vorschlag wurde abgebrochen; dein vorhandener Text bleibt erhalten.");
          } else await acceptJob(await call(`/jobs/${encodeURIComponent(job.jobId)}`), epoch);
        } else {
          const snapshot = await call(""); if (!sameGeneration(epoch)) return; backend = snapshot;
          if (!snapshot?.available) say("unavailable", "Die lokale Bildtexthilfe ist auf diesem Gerät noch nicht verfügbar.");
          else if (snapshot.installing || snapshot.cache?.installing) say("installing", "Die optionale Bildtexthilfe wird eingerichtet …");
          else if (snapshot.installError || snapshot.cache?.status === "failed") {
            ownDownload = false;
            say("error", `${text(snapshot.cache?.error, 500) || "Die Einrichtung wurde nicht abgeschlossen."} Vorhandene Texte bleiben erhalten.`);
          }
          else if (snapshot.busy) say("waiting", "Die lokale Bildtexthilfe arbeitet noch. Bitte den laufenden Vorgang abwarten.");
          else { ownDownload = false; say("ready", ["ready", "installed-unverified"].includes(snapshot.cache?.status) ? "Bereit für deinen Bildtextvorschlag." : "Die lokale Bildtexthilfe ist optional und noch nicht eingerichtet."); }
        }
      } catch { if (sameGeneration(epoch)) say("error", "Der lokale Status konnte nicht gelesen werden. Bitte erneut prüfen; dein Text bleibt erhalten."); }
      finally { if (sameGeneration(epoch)) { working = false; render(); schedule(); } }
    }
    async function confirmed(options) { return typeof confirmAction === "function" && await confirmAction(options) === true; }
    async function start() {
      if (generate.disabled || !selection) return;
      const epoch = generation; working = true; render();
      try {
        if (unsaved() && !await confirmed({ title: "Vorschlag ersetzen?", message: "Der bisherige Vorschlag in diesem Fenster wird ersetzt. Dein Hauptentwurf bleibt erhalten.", confirmLabel: "Neuen Vorschlag erstellen" })) return;
        if (!sameGeneration(epoch)) return;
        if (!await current()) { say("stale", "Dein Bild oder Text wurde geändert. Bitte die Bildtexthilfe neu öffnen."); return; }
        if (!sameGeneration(epoch)) return;
        proposal = null; detailsText = ""; applied = false; job = null; unresolved = false;
        currentRequest = { requestId: requestId(), pageUrl: selection.pageUrl, imageKey: selection.imageKey, observationHash: selection.observationHash };
        jobStartedAt = now(); say("starting", "Dein lokaler Bildtextvorschlag wird gestartet …");
        try { await acceptJob(await call("/suggest-alt", currentRequest), epoch); }
        catch (error) {
          if (sameGeneration(epoch)) {
            if (refused(error)) {
              currentRequest = null; job = null; unresolved = false;
              say("error", "Der Vorschlag wurde nicht gestartet. Bitte Verfügbarkeit, Anmeldung und Bearbeitungsrechte prüfen."); return;
            }
            unresolved = true;
            try { if (await recover()) await acceptJob(job, epoch); }
            catch { say("uncertain", "Die Startantwort fehlt. Bitte den Auftragsstatus prüfen; es wird kein weiterer Vorschlag gestartet."); }
          }
        }
      } catch { if (sameGeneration(epoch)) say("error", "Der Vorschlag wurde nicht gestartet. Dein vorhandener Text bleibt erhalten."); }
      finally { if (sameGeneration(epoch)) { working = false; render(); schedule(); } }
    }
    async function applyProposal() {
      if (apply.disabled || !selection || !proposal) return;
      const epoch = generation; applying = true; render();
      try {
        if (!await current()) { say("stale", "Dein Bild oder vorhandener Text wurde geändert. Der Vorschlag wird nicht übernommen."); return; }
        if (!sameGeneration(epoch)) return;
        const accepted = await selection.applyProposal(value, proposal.caption === null ? null : value);
        if (accepted === false) throw new Error("Der Hauptentwurf hat sich geändert.");
        applied = true; await close({ discard: true });
      } catch { if (sameGeneration(epoch)) say("error", "Der Text konnte nicht in deinen Entwurf übernommen werden. Dein Vorschlag bleibt in diesem Fenster erhalten."); }
      finally { applying = false; render(); }
    }
    async function close({ discard = false } = {}) {
      if (!open()) return true;
      if (closePending || working || applying && !applied) { say(phase, "Bitte den laufenden Anfrageabschluss abwarten. Dein Text bleibt erhalten."); return false; }
      closePending = true;
      try {
        if (!discard && (unsaved() || activeJob() || ownDownload || unresolved) && !await confirmed({ title: "Bildtexthilfe schließen?",
          message: unsaved() ? "Der Vorschlag in diesem Fenster ist noch nicht übernommen. Beim Schließen wird er verworfen und ein laufender eigener Auftrag abgebrochen."
            : "Der laufende eigene Vorgang wird abgebrochen. Dein vorhandener Text bleibt erhalten.", confirmLabel: "Abbrechen und schließen" })) return false;
        if (unresolved && !await recover()) return false;
        await cancelKnownJob();
        if (ownDownload) await call("/cancel-download", {});
        stopTimer(); generation++; working = false; ownDownload = false; currentRequest = null; job = null; unresolved = false;
        confirmedClose = true; controls.close("local-ai-finished"); confirmedClose = false; phase = "closed";
        selection = null; proposal = null; value = ""; detailsText = "";
        return true;
      } catch { say("error", "Der eigene Vorgang ist noch nicht sicher beendet. Bitte den Status erneut prüfen; dieses Fenster bleibt geöffnet."); return false; }
      finally { closePending = false; render(); }
    }
    const controls = createDialogController({ dialog, closeButtons: [], closeOnBackdrop: false, closeOnEscape: true,
      beforeClose() { if (confirmedClose) return true; void close(); return false; },
      afterClose() { if (!confirmedClose && selection && !disposed) { nativeClose = true; controls.open(); void close(); } } });
    listen(closeButton, "click", () => { void close(); }); listen(generate, "click", () => { void start(); }); listen(apply, "click", () => { void applyProposal(); });
    listen(draft, "input", () => { value = draft.value; applied = false; render(); });
    listen(refresh, "click", () => { void poll(); });
    listen(image, "error", () => { imageError.hidden = false; }); listen(image, "load", () => { imageError.hidden = true; });
    listen(cancelJob, "click", () => { void (async () => {
      if (working) return; working = true; render();
      try { if (unresolved && !await recover()) return; await cancelKnownJob(); say("cancelled", "Dein lokaler Vorschlag wurde abgebrochen. Der vorhandene Text bleibt erhalten."); }
      catch { unresolved = true; say("uncertain", "Der Abbruch ist noch nicht bestätigt. Bitte den Status erneut prüfen."); }
      finally { working = false; render(); schedule(); }
    })(); });
    listen(download, "click", () => { void (async () => {
      if (download.disabled) return;
      const epoch = generation; working = true; render();
      try {
        if (!await confirmed({ title: "Lokale Bildtexthilfe einrichten?", message: "Einmalig ca. 3,4 GB herunterladen und lokal speichern. Danach kann dieser PC Bildtextvorschläge erstellen.", confirmLabel: "Ca. 3,4 GB herunterladen" }) || !sameGeneration(epoch)) return;
        const response = await call("/download", { confirmed: true });
        if (response?.available !== true || !response.cache) throw new Error("Die Einrichtung ist nicht bestätigt.");
        backend = response; ownDownload = response.installing === true || response.cache.installing === true;
        if (ownDownload) say("installing", "Die optionale Bildtexthilfe wird eingerichtet …");
        else if (["ready", "installed-unverified"].includes(response.cache.status)) say("ready", "Die lokale Bildtexthilfe ist eingerichtet.");
        else say("error", "Die Einrichtung ist noch nicht bestätigt. Bitte den Status erneut prüfen.");
      }
      catch { say("error", "Die Einrichtung ist nicht bestätigt. Bitte den Status prüfen oder die eigene Einrichtung abbrechen."); }
      finally { if (sameGeneration(epoch)) { working = false; render(); schedule(); } }
    })(); });
    listen(cancelDownload, "click", () => { void (async () => {
      if (working || !ownDownload) return; working = true; render();
      try { backend = await call("/cancel-download", {}); ownDownload = false; say("cancelled", "Die optionale Einrichtung wurde abgebrochen. Deine Texte bleiben erhalten."); }
      catch { say("error", "Der Abbruch der Einrichtung ist noch nicht bestätigt. Bitte erneut prüfen."); }
      finally { working = false; render(); schedule(); }
    })(); });
    render();
    return {
      async openForImage(input) {
        if (disposed) throw new Error("Die Bildtexthilfe wurde bereits geschlossen.");
        if (open() && !await close()) return false;
        const preview = safeImageUrl(input?.previewUrl);
        if (!preview || !input?.pageUrl || !input?.imageKey || !input?.observationHash || typeof input.isCurrent !== "function"
          || typeof input.applyProposal !== "function") throw new TypeError("Ein aktuelles konkretes Bild mit sicherer Vorschau und Entwurfsanschluss ist erforderlich.");
        selection = { ...input, initialText: text(input.initialText) }; backend = null; job = null; proposal = null; currentRequest = null;
        title.textContent = input.context?.title ? `${text(input.context.title, 80)} · Bildtexthilfe` : "Lokale Bildtexthilfe";
        value = ""; phase = "loading"; message = "Die Verfügbarkeit wird geprüft …"; detailsText = ""; unresolved = false; applied = false; ownDownload = false;
        generation++; image.src = preview; imageError.hidden = true; controls.open(); render(); await poll(); return true;
      },
      close,
      getState() { return { open: open(), phase, message, draft: value, hasUnsavedChanges: unsaved(), requestId: currentRequest?.requestId ?? null,
        jobId: job?.jobId ?? null, jobStatus: job?.status ?? null, unresolved, ownDownload, applying, nativeClose,
        binding: selection ? { pageUrl: selection.pageUrl, imageKey: selection.imageKey, observationHash: selection.observationHash } : null }; },
      hasUnsavedChanges: unsaved,
      async dispose(options) {
        if (disposed) return true;
        if (!await close(options)) return false;
        disposed = true; generation++; stopTimer(); for (const remove of listeners) remove(); controls.destroy(); dialog.remove(); return true;
      },
    };
  }
  global.SpeciesExplorerLocalAi = Object.freeze({ createLocalAiController });
})(globalThis);
