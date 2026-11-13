(function initializeLocalAi(global) {
  "use strict";

  const TERMINAL = new Set(["completed", "cancelled", "failed", "stale"]);
  const JOB_STATES = new Set(["queued", "running", ...TERMINAL]);
  const text = (value, limit = 2000) => typeof value === "string" ? value.slice(0, limit) : "";
  const validText = (value) => typeof value === "string" && value.trim() && value.length <= 2000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
  const refused = (error) => Number.isInteger(error?.status) && error.status >= 400 && error.status < 500;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const HASH = /^[a-f0-9]{64}$/, ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
  const PAGE_KINDS = new Set(["alt-text", "source-text", "review-text", "review-language"]);
  function pageRequest(input) {
    const request = input?.request, kind = input?.kind;
    const fields = ["type", "sourceScope", "draftId", "expectedRevision", ...(kind === "alt-text" ? ["imageId"] : kind === "review-language" ? ["sectionId"] : ["sectionId", "sourceIds", "expectedSourcesRevision"])];
    if (!PAGE_KINDS.has(kind) || !request || Object.keys(request).some((key) => !fields.includes(key)) || request.type !== "page-authoring"
      || !HASH.test(request.sourceScope || "") || !HASH.test(request.expectedRevision || "") || !ID.test(request.draftId || "")
      || !ID.test(request[kind === "alt-text" ? "imageId" : "sectionId"] || "")
      || ["source-text", "review-text"].includes(kind) && (!HASH.test(request.expectedSourcesRevision || "") || !Array.isArray(request.sourceIds) || !request.sourceIds.length || request.sourceIds.length > 20
        || new Set(request.sourceIds).size !== request.sourceIds.length || !request.sourceIds.every((id) => /^source-[a-f0-9]{64}$/.test(id)))) throw new TypeError("Ein konkreter gespeicherter Artseitenauftrag ist erforderlich.");
    return copy(request);
  }
  function pagePreview(value, scope) {
    const match = typeof value === "string" && /^\/api\/page-authoring\/images\/(image-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\?scope=([a-f0-9]{64})$/.exec(value);
    return match && match[2] === scope ? { url: value, assetId: match[1] } : null;
  }
  function languageProposalValid(proposal, original, limit, segments) {
    if (proposal.originalText !== original || typeof proposal.correctedText !== "string" || proposal.correctedText.length > limit
      || !Array.isArray(proposal.findings) || proposal.findings.length > 8) return false;
    const splitSurrogate = (offset) => offset > 0 && offset < original.length && /[\uD800-\uDBFF]/.test(original[offset - 1]) && /[\uDC00-\uDFFF]/.test(original[offset]);
    const findings = [...proposal.findings].sort((left, right) => left?.start - right?.start); let previous = 0;
    for (const finding of findings) {
      if (!finding || !["spelling", "capitalization", "grammar", "punctuation"].includes(finding.kind) || !Number.isSafeInteger(finding.start) || !Number.isSafeInteger(finding.end)
        || finding.start < previous || finding.start < 0 || finding.start >= finding.end || finding.end > original.length || splitSurrogate(finding.start) || splitSurrogate(finding.end)
        || typeof finding.draftQuote !== "string" || !finding.draftQuote || finding.draftQuote.length > 2000 || /[\r\n]/.test(finding.draftQuote)
        || original.slice(finding.start, finding.end) !== finding.draftQuote || typeof finding.replacement !== "string" || finding.replacement.length > 2000 || /[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(finding.replacement)
        || finding.replacement === finding.draftQuote || typeof finding.explanation !== "string" || !finding.explanation.trim() || finding.explanation.length > 240
        || segments && !segments.some((segment) => finding.start >= segment.start && finding.end <= segment.end)) return false;
      previous = finding.end;
    }
    let corrected = original;
    for (const finding of findings.reverse()) corrected = corrected.slice(0, finding.start) + finding.replacement + corrected.slice(finding.end);
    return corrected === proposal.correctedText;
  }

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
    const installHint = make("p", "", "Optional: ca. 3,4 GB herunterladen. Die lokale Hilfe arbeitet danach auf diesem PC; die Einrichtung beginnt erst nach deiner Bestätigung.");
    const download = make("button", "", "Lokale Hilfe einrichten · ca. 3,4 GB"), cancelDownload = make("button", "", "Einrichtung abbrechen");
    download.type = "button"; cancelDownload.type = "button"; installation.append(installHint, download, cancelDownload);
    const progress = make("progress"), progressText = make("span", "local-ai-note"); progress.max = 100; progress.setAttribute("aria-label", "Einrichtung der lokalen Bildtexthilfe"); installation.append(progress, progressText);
    const originalDetails = make("details", "local-ai-details"), originalSummary = make("summary", "", "Vorhandener Text"), originalText = make("p"); originalDetails.append(originalSummary, originalText);
    const label = make("label", "", "Textvorschlag"), draft = make("textarea"); draft.rows = 4; draft.maxLength = 2000; draft.spellcheck = true; draft.lang = "de"; label.append(draft);
    const coupledHint = make("p", "local-ai-note", "Bildunterschrift und Alternativtext bleiben gleich.");
    const actions = make("div", "local-ai-actions"), generate = make("button", "", "Vorschlag erstellen"), apply = make("button", "", "In meinen Textentwurf übernehmen"), cancelJob = make("button", "", "Vorschlag abbrechen"), refresh = make("button", "", "Status neu prüfen");
    for (const button of [generate, apply, cancelJob, refresh]) button.type = "button";
    actions.append(generate, cancelJob, refresh, apply);
    const details = make("details", "local-ai-details"), detailsSummary = make("summary", "", "Hinweise zum Vorschlag"), detailsBody = make("p"); details.append(detailsSummary, detailsBody);
    const textProposal = make("section", "local-ai-details"); textProposal.hidden = true;
    editor.append(status, installation, originalDetails, label, textProposal, coupledHint, actions, details); layout.append(figure, editor); shell.append(header, intro, layout); dialog.append(shell); documentRef.body.append(dialog);
    let selection = null, backend = null, job = null, proposal = null, currentRequest = null, timer = null;
    let generation = 0, disposed = false, working = false, closePending = false, ownDownload = false, applying = false, jobStartedAt = 0;
    let value = "", phase = "closed", message = "", unresolved = false, applied = false, confirmedClose = false, nativeClose = false, detailsText = "";
    const listeners = [];
    const listen = (node, event, handler) => { node.addEventListener(event, handler); listeners.push(() => node.removeEventListener?.(event, handler)); };
    const open = () => controls.isOpen();
    const pageSelection = () => selection?.request?.type === "page-authoring";
    const kind = () => selection?.kind || "alt-text";
    const textSelection = () => kind() !== "alt-text";
    const languageSelection = () => kind() === "review-language";
    const activeJob = () => Boolean(currentRequest && (!job || !TERMINAL.has(job.status)));
    const unsaved = () => Boolean(selection && kind() !== "review-text" && !applied && (languageSelection()
      ? proposal?.findings?.length || value && value !== selection.initialText : proposal || value && value !== selection.initialText));
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
      draft.readOnly = pageSelection() && languageSelection(); draft.maxLength = languageSelection() && pageSelection() ? 8000 : 2000;
      label.hidden = textSelection() && !languageSelection() || !proposal && !value;
      if (draft.value !== value) draft.value = value;
      apply.hidden = kind() === "review-text";
      const languageApplicable = languageSelection() && typeof value === "string" && value.trim() && value.length <= draft.maxLength
        && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
        && (proposal?.findings?.length > 0 || !pageSelection() && value !== selection?.initialText);
      apply.disabled = !proposal || (languageSelection() ? !languageApplicable : textSelection() ? kind() !== "source-text" || !proposal.paragraphs?.length : !validText(value)) || activeJob() || working || applying || unresolved || phase === "stale";
      apply.textContent = languageSelection() ? "Korrekturen übernehmen" : textSelection() ? "Als neue Absätze übernehmen" : "In meinen Textentwurf übernehmen";
      coupledHint.hidden = pageSelection() || languageSelection() || proposal?.caption === null || !proposal;
      textProposal.hidden = !textSelection() || !proposal;
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
    async function current(binding) {
      try { return Boolean(selection) && await selection.isCurrent(binding ? copy(binding) : languageSelection() && proposal ? copy(proposal.binding)
        : pageSelection() ? copy(selection.request) : { pageUrl: selection.pageUrl, imageKey: selection.imageKey,
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
        || result.requestId !== currentRequest?.requestId || result.kind !== kind() || result.approved !== false || result.transferred !== false
        || job && job.jobId !== result.jobId) throw new Error("Der Auftrag passt nicht zum ausgewählten Bild.");
    }
    function pageProposalValid(next) {
      const binding = next?.binding, request = selection.request;
      if (binding?.type !== "page-authoring" || binding.kind !== kind() || binding.sourceScope !== request.sourceScope || binding.documentId !== request.draftId
        || binding.revision !== request.expectedRevision || !ID.test(binding.projectId || "") || !ID.test(binding.userId || "")
        || !["admin", "publisher", "contributor"].includes(binding.role) || typeof binding.origin !== "string"
        || !["inputProof", "authorizationHash", "snapshotHash", "targetHash"].every((key) => HASH.test(binding[key] || ""))) return false;
      if (kind() === "alt-text") return binding.imageId === request.imageId && binding.assetId === selection.previewAssetId
        && ["imageSha256", "sourceSha256", "metadataHash"].every((key) => HASH.test(binding[key] || "")) && validText(next.text) && next.caption === null;
      if (kind() === "review-language") return binding.sectionId === request.sectionId && HASH.test(binding.draftSha256 || "")
        && languageProposalValid(next, selection.initialText, 8000, selection.context.languageSegments);
      if (binding.sectionId !== request.sectionId || binding.sourceCatalogRevision !== request.expectedSourcesRevision
        || JSON.stringify(binding.sourceIds) !== JSON.stringify(request.sourceIds) || !HASH.test(binding.sourcesRevision || "") || !HASH.test(binding.selectedSourcesHash || "")) return false;
      const sources = new Map(selection.context.sources.map((source) => [source.id, source]));
      if (!Array.isArray(next.sources) || next.sources.length !== request.sourceIds.length || new Set(next.sources.map((source) => source.id)).size !== next.sources.length
        || next.sources.some((source) => !request.sourceIds.includes(source.id) || sources.get(source.id)?.revision !== source.revision)) return false;
      const entries = next[kind() === "source-text" ? "paragraphs" : "findings"];
      if (!Array.isArray(entries) || entries.length > 8) return false;
      return entries.every((entry) => {
        const required = kind() === "source-text" || entry.kind === "contradiction";
        if (!Array.isArray(entry.sourceIds) || entry.sourceIds.length > 20 || new Set(entry.sourceIds).size !== entry.sourceIds.length
          || entry.sourceIds.some((id) => !request.sourceIds.includes(id)) || required && !entry.sourceIds.length || !Array.isArray(entry.evidenceQuotes) || entry.evidenceQuotes.length > 20) return false;
        if (entry.evidenceQuotes.some((quote) => !entry.sourceIds.includes(quote.sourceId) || typeof quote.quote !== "string" || quote.quote.length < 3 || quote.quote.length > 1000
          || !sources.get(quote.sourceId)?.text.includes(quote.quote)) || required && entry.sourceIds.some((id) => !entry.evidenceQuotes.some((quote) => quote.sourceId === id))) return false;
        return kind() === "source-text" ? validText(entry.text) && entry.text.length <= 1800 : ["contradiction", "unsupported", "unclear"].includes(entry.kind)
          && typeof entry.draftQuote === "string" && entry.draftQuote.trim() && entry.draftQuote.length <= 1000 && selection.initialText.includes(entry.draftQuote)
          && typeof entry.explanation === "string" && entry.explanation.trim() && entry.explanation.length <= 1000;
      });
    }
    function renderTextProposal() {
      textProposal.replaceChildren();
      if (languageSelection()) {
        textProposal.append(make("h3", "", "Sprachhinweise"), make("p", "local-ai-note", pageSelection()
          ? "Bis zu 8 Hinweise. Korrekturen übernehmen und im Abschnitt weiterbearbeiten. Gliederung und Listen bleiben erhalten. Keine vollständige Prüfung und keine Sprach- oder Sachgarantie."
          : "Bis zu 8 Hinweise. Den Korrekturvorschlag bei Bedarf bearbeiten und bewusst in deinen offenen Entwurf übernehmen. Keine vollständige Prüfung und keine Sprach- oder Sachgarantie."));
        if (!proposal.findings.length) textProposal.append(make("p", "", "Keine Sprachhinweise gefunden. Dies ist keine Fehlerfreiheitsgarantie."));
        for (const finding of proposal.findings) textProposal.append(make("p", "", `${finding.draftQuote} → ${finding.replacement || "entfernen"}`), make("p", "", finding.explanation));
        return;
      }
      textProposal.append(make("h3", "", kind() === "source-text" ? "Textvorschlag" : "Prüfhinweise"),
        make("p", "local-ai-note", kind() === "source-text" ? "Bitte jeden Absatz mit seinen Belegstellen prüfen. Die Annahme ergänzt neue Absätze; vorhandene Texte bleiben erhalten."
          : "Hinweise anhand der ausgewählten Quellen prüfen. Es wird kein Text automatisch korrigiert; fehlende Hinweise sind keine Faktenbestätigung."));
      const entries = proposal[kind() === "source-text" ? "paragraphs" : "findings"];
      if (!entries.length) textProposal.append(make("p", "", kind() === "source-text" ? "Kein Absatz vorgeschlagen." : "Keine Hinweise im bereitgestellten Material gefunden."));
      for (const entry of entries) {
        const row = make("article", "local-ai-details");
        if (kind() === "source-text") row.append(make("p", "", entry.text));
        else row.append(make("p", "", `Entwurfsstelle: ${entry.draftQuote}`), make("p", "", entry.explanation));
        const evidence = make("details", "local-ai-details"); evidence.append(make("summary", "", "Belegstellen"));
        for (const quote of entry.evidenceQuotes) {
          const source = selection.context.sources.find((item) => item.id === quote.sourceId);
          const excerpt = make("blockquote", "", quote.quote);
          if (excerpt.style) { excerpt.style.whiteSpace = "pre-wrap"; excerpt.style.overflowWrap = "anywhere"; }
          evidence.append(make("p", "", source.title || "Ausgewählte Quelle"), excerpt);
        }
        if (!entry.evidenceQuotes.length) evidence.append(make("p", "", "Für diesen Hinweis wurde keine Belegstelle genannt."));
        row.append(evidence); textProposal.append(row);
      }
    }
    async function acceptJob(result, epoch) {
      checkJob(result); if (!sameGeneration(epoch)) return;
      job = result;
      if (!await current()) {
        if (!TERMINAL.has(job.status)) await cancelKnownJob();
        say("stale", languageSelection() ? "Dein Text oder seine Grundlage wurde inzwischen geändert. Bitte die Sprachprüfung erneut öffnen; eigene Eingaben bleiben erhalten."
          : "Das Bild oder dein vorhandener Text wurde inzwischen geändert. Dein Text bleibt erhalten; bitte die Bildtexthilfe neu öffnen."); return;
      }
      if (!sameGeneration(epoch)) return;
      if (result.status === "completed") {
        const next = result.result, binding = next?.binding;
        if (next?.kind !== kind() || next.status !== "proposal" || next.approved !== false || next.transferred !== false || next.humanReviewRequired !== true
          || (pageSelection() ? !pageProposalValid(next) : languageSelection() ? binding?.type !== "website-language" || binding.kind !== "review-language"
            || binding.pageUrl !== selection.pageUrl || binding.imageKey !== selection.imageKey || binding.observationHash !== selection.observationHash
            || !["revision", "snapshotRevision", "draftSha256", "inputProof"].every((key) => HASH.test(binding[key] || "")) || binding.revision !== binding.snapshotRevision
            || !languageProposalValid(next, selection.initialText, 2000)
            : binding?.pageUrl !== selection.pageUrl || binding?.imageKey !== selection.imageKey
            || binding?.revision !== selection.observationHash || !validText(next.text) || next.caption !== null && next.caption !== next.text)) {
          say("stale", languageSelection() ? "Die Sprachkorrektur ist nicht exakt an deinen Text gebunden und wird nicht übernommen."
            : "Der Vorschlag ist nicht eindeutig an dieses Bild gebunden und wird nicht übernommen."); return;
        }
        if (languageSelection() && !await current(next.binding)) { say("stale", "Der Textbestand wurde seit dem Öffnen geändert. Bitte die Sprachprüfung erneut öffnen."); return; }
        if (!sameGeneration(epoch)) return;
        proposal = copy(next); value = languageSelection() ? next.correctedText : textSelection() ? "" : next.text; applied = false;
        if (textSelection()) renderTextProposal();
        detailsText = Array.isArray(next.uncertainties) ? next.uncertainties.slice(0, 8).map((item) => text(item, 300)).join("\n") : "";
        say("proposal", textSelection() ? kind() === "source-text" ? "Vorschlag bereit. Absätze und Belegstellen bitte prüfen." : "Prüfhinweise bereit. Dein Text bleibt unverändert."
          : "Vorschlag bereit. Du kannst ihn bearbeiten und danach in deinen Textentwurf übernehmen.");
      } else if (result.status === "stale") say("stale", "Die Bildgrundlage wurde inzwischen verändert. Dein vorhandener Text bleibt erhalten; bitte die Bildtexthilfe neu öffnen.");
      else if (result.status === "failed") say("error", text(result.error, 500) || "Der Vorschlag konnte nicht erstellt werden. Dein vorhandener Text bleibt erhalten.");
      else if (result.status === "cancelled") say("cancelled", "Der Vorschlag wurde abgebrochen oder das Zeitlimit erreicht. Dein vorhandener Text bleibt erhalten.");
      else say(result.status, languageSelection() ? result.status === "queued" ? "Deine Sprachprüfung wartet auf die lokale Hilfe." : "Dein Text wird sprachlich geprüft …"
        : textSelection() ? result.status === "queued" ? "Dein Auftrag wartet auf die lokale Hilfe." : "Die lokale Hilfe prüft die ausgewählten Textgrundlagen …"
        : result.status === "queued" ? "Dein Bild wartet auf die lokale Bildtexthilfe." : "Die lokale Bildtexthilfe betrachtet das ausgewählte Foto …");
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
        proposal = null; textProposal.replaceChildren(); detailsText = ""; applied = false; job = null; unresolved = false;
        currentRequest = selection.request ? { ...copy(selection.request), requestId: requestId() }
          : { requestId: requestId(), pageUrl: selection.pageUrl, imageKey: selection.imageKey, observationHash: selection.observationHash };
        jobStartedAt = now(); say("starting", textSelection() ? "Deine lokale Texthilfe wird gestartet …" : "Dein lokaler Bildtextvorschlag wird gestartet …");
        const suffix = pageSelection() ? `/page-authoring/${{ "alt-text": "suggest-alt", "source-text": "suggest-text", "review-text": "review-text", "review-language": "review-language" }[kind()]}` : languageSelection() ? "/review-language" : "/suggest-alt";
        try { await acceptJob(await call(suffix, currentRequest), epoch); }
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
      if (apply.disabled || !selection || !proposal || kind() === "review-text") return;
      const epoch = generation; applying = true; render();
      try {
        if (!await current()) { say("stale", "Dein Bild oder vorhandener Text wurde geändert. Der Vorschlag wird nicht übernommen."); return; }
        if (!sameGeneration(epoch)) return;
        const accepted = languageSelection() && !pageSelection() ? await selection.applyProposal(value)
          : textSelection() ? await selection.applyProposal(copy(proposal)) : await selection.applyProposal(value, pageSelection() || proposal.caption === null ? null : value);
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
        if (!discard && (unsaved() || activeJob() || ownDownload || unresolved) && !await confirmed({ title: pageSelection() ? "Lokale Hilfe schließen?" : "Bildtexthilfe schließen?",
          message: unsaved() ? "Der Vorschlag in diesem Fenster ist noch nicht übernommen. Beim Schließen wird er verworfen und ein laufender eigener Auftrag abgebrochen."
            : "Der laufende eigene Vorgang wird abgebrochen. Dein vorhandener Text bleibt erhalten.", confirmLabel: "Abbrechen und schließen" })) return false;
        if (unresolved && !await recover()) return false;
        await cancelKnownJob();
        if (ownDownload) await call("/cancel-download", {});
        stopTimer(); generation++; working = false; ownDownload = false; currentRequest = null; job = null; unresolved = false;
        confirmedClose = true; controls.close("local-ai-finished"); confirmedClose = false; phase = "closed";
        selection = null; proposal = null; value = ""; detailsText = ""; textProposal.replaceChildren(); image.removeAttribute?.("src");
        return true;
      } catch { say("error", "Der eigene Vorgang ist noch nicht sicher beendet. Bitte den Status erneut prüfen; dieses Fenster bleibt geöffnet."); return false; }
      finally { closePending = false; render(); }
    }
    const controls = createDialogController({ dialog, closeButtons: [], closeOnBackdrop: false, closeOnEscape: true,
      beforeClose() { if (confirmedClose) return true; void close(); return false; },
      afterClose() { if (!confirmedClose && selection && !disposed) { nativeClose = true; controls.open(); void close(); } } });
    listen(closeButton, "click", () => { void close(); }); listen(generate, "click", () => { void start(); }); listen(apply, "click", () => { void applyProposal(); });
    listen(draft, "input", () => { if (pageSelection() && languageSelection()) { draft.value = value; return; } value = draft.value; applied = false; render(); });
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
        selection = { ...input, kind: "alt-text", initialText: text(input.initialText) }; backend = null; job = null; proposal = null; currentRequest = null;
        figure.hidden = false; if (layout.style) layout.style.gridTemplateColumns = ""; textProposal.replaceChildren();
        intro.textContent = "Ein Vorschlag auf diesem PC. Bitte am Bild prüfen; du entscheidest, welcher Text in den Entwurf kommt.";
        title.textContent = input.context?.title ? `${text(input.context.title, 80)} · Bildtexthilfe` : "Lokale Bildtexthilfe";
        value = ""; phase = "loading"; message = "Die Verfügbarkeit wird geprüft …"; detailsText = ""; unresolved = false; applied = false; ownDownload = false;
        generation++; image.src = preview; imageError.hidden = true; controls.open(); render(); await poll(); return true;
      },
      async openForPage(input) {
        if (disposed) throw new Error("Die lokale Hilfe wurde bereits geschlossen.");
        const request = pageRequest(input), preview = input.kind === "alt-text" ? pagePreview(input.previewUrl, request.sourceScope) : null;
        const initialText = input.initialText ?? "", sources = input.context?.sources;
        if (typeof input.isCurrent !== "function" || typeof input.applyProposal !== "function" || typeof initialText !== "string"
          || input.kind === "alt-text" && (!preview || initialText.length > 3000)
          || input.kind === "review-language" && (input.previewUrl !== undefined || !initialText.trim() || initialText.length > 8000 || !Array.isArray(input.context?.languageSegments)
            || input.context.languageSegments.some((segment) => !Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end) || segment.start < 0 || segment.end < segment.start || segment.end > initialText.length))
          || ["source-text", "review-text"].includes(input.kind) && (input.previewUrl !== undefined || !Array.isArray(sources) || sources.length !== request.sourceIds.length
            || new Set(sources.map((source) => source.id)).size !== sources.length || sources.some((source) => !request.sourceIds.includes(source.id) || typeof source.text !== "string" || !source.text.trim() || typeof source.revision !== "string")
            || sources.reduce((sum, source) => sum + source.text.length, initialText.length) > 8000
            || input.kind === "source-text" && initialText !== "" || input.kind === "review-text" && !initialText.trim())) throw new TypeError(input.kind === "review-language"
              ? "Die Sprachprüfung benötigt einen aktuellen gespeicherten Abschnitt mit unveränderter Textgliederung."
              : "Die lokale Hilfe benötigt eine sichere Vorschau oder ausdrücklich ausgewählte aktuelle Textquellen.");
        if (open() && !await close()) return false;
        selection = { ...input, request, context: copy(input.context || {}), initialText, previewAssetId: preview?.assetId };
        backend = null; job = null; proposal = null; currentRequest = null; value = ""; phase = "loading";
        message = "Die Verfügbarkeit wird geprüft …"; detailsText = ""; unresolved = false; applied = false; ownDownload = false;
        title.textContent = input.context?.title ? `${text(input.context.title, 80)} · Lokale Hilfe` : "Lokale Texthilfe";
        intro.textContent = input.kind === "review-language" ? "Rechtschreibung, Grammatik und Kommas im gespeicherten Abschnitt prüfen. Es werden keine Fachquellen bewertet." : input.kind === "alt-text" ? "Alttext am Bild prüfen. Deine Bildunterschrift bleibt unverändert."
          : input.kind === "source-text" ? "Ein Vorschlag aus deinen ausdrücklich ausgewählten Textquellen. Du prüfst die Absätze und Belegstellen vor der Annahme."
            : "Prüfhinweise zu deinem gespeicherten Abschnitt anhand ausgewählter Quellen. Dein Text wird nicht automatisch geändert.";
        figure.hidden = !preview; if (layout.style) layout.style.gridTemplateColumns = preview ? "" : "minmax(0, 1fr)";
        image.removeAttribute?.("src"); if (preview) image.src = preview.url; imageError.hidden = true; textProposal.replaceChildren();
        generation++; controls.open(); render(); await poll(); return true;
      },
      async openForLanguage(input) {
        if (disposed) throw new Error("Die lokale Hilfe wurde bereits geschlossen.");
        let page; try { page = new URL(input?.pageUrl); } catch { /* checked below */ }
        if (!page || page.origin !== "https://www.fnwildlifetravel.de" || page.username || page.password || page.search || page.hash
          || !HASH.test(input.imageKey || "") || !HASH.test(input.observationHash || "") || !validText(input.initialText)
          || typeof input.isCurrent !== "function" || typeof input.applyProposal !== "function") throw new TypeError("Die Sprachprüfung benötigt den konkreten aktuellen Website-Textentwurf.");
        if (open() && !await close()) return false;
        selection = { ...input, kind: "review-language", context: copy(input.context || {}), request: { type: "website-language", pageUrl: page.href,
          imageKey: input.imageKey, observationHash: input.observationHash, draftText: input.initialText } };
        backend = null; job = null; proposal = null; currentRequest = null; value = ""; phase = "loading";
        message = "Die Verfügbarkeit wird geprüft …"; detailsText = ""; unresolved = false; applied = false; ownDownload = false;
        title.textContent = "Sprache prüfen"; intro.textContent = "Rechtschreibung, Grammatik und Kommas in deinem offenen Textentwurf prüfen. Bilder werden nicht geladen; eine Annahme gibt den Text nicht frei.";
        figure.hidden = true; if (layout.style) layout.style.gridTemplateColumns = "minmax(0, 1fr)";
        image.removeAttribute?.("src"); imageError.hidden = true; textProposal.replaceChildren(); generation++; controls.open(); render(); await poll(); return true;
      },
      close,
      getState() { return { open: open(), phase, message, draft: value, hasUnsavedChanges: unsaved(), requestId: currentRequest?.requestId ?? null,
        jobId: job?.jobId ?? null, jobStatus: job?.status ?? null, unresolved, ownDownload, applying, nativeClose,
        binding: selection ? selection.request ? copy(selection.request) : { pageUrl: selection.pageUrl, imageKey: selection.imageKey, observationHash: selection.observationHash } : null }; },
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
