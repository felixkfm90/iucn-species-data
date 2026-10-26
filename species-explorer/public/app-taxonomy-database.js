(function initializeTaxonomyDatabase(global) {
  "use strict";

  const SEARCH_DELAY_MS = 350;
  const POLL_DELAY_MS = 900;
  const UPDATE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
  const MASTER_ACTIVE_STATES = new Set([
    "refreshing",
    "building",
    "activating",
    "rolling-back",
    "syncing-lightroom",
    "applying-corrections",
  ]);

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function taxonomyReleaseLabel(release) {
    if (!release) return "";
    const name = release.alias || release.version || release.releaseId || "";
    if (!name) return "";
    return release.issued
      ? `${name} vom ${String(release.issued).split("-").reverse().join(".")}`
      : name;
  }

  function formatSnapshotDate(snapshot) {
    const value = snapshot?.activatedAt || snapshot?.restoredAt || snapshot?.createdAt || "";
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function taxonomyDatabaseCounts(masterStatus = {}) {
    const lifecycle = masterStatus.lifecycle || {};
    const snapshot = lifecycle.candidate || lifecycle.active;
    const summary = snapshot?.summary;
    if (!summary) return "";
    return [
      `${Number(summary.taxa || 0).toLocaleString("de-DE")} Taxa`,
      `${Number(summary.germanNames || 0).toLocaleString("de-DE")} deutsche Namen`,
      `${Number(summary.englishNames || 0).toLocaleString("de-DE")} englische Namen`,
    ].join(" · ");
  }

  function referenceLabel(status = {}) {
    const reference = status.reference?.source || status.reference || null;
    return taxonomyReleaseLabel(reference)
      || taxonomyReleaseLabel(status.latest)
      || cleanText(status.activeRelease);
  }

  function sleep(duration) {
    return new Promise((resolve) => global.setTimeout(resolve, duration));
  }

  function taxonomyDatabaseUpdateDecision({
    hasCandidate = false,
    hasWork = false,
    lightroomPackageNeedsRebuild = false,
    correctionsPending = false,
    candidateIncludesCorrections = false,
    identitiesPending = false,
    candidateIncludesIdentities = false,
    referenceNeedsMasterRebuild = false,
    candidateMatchesReference = true,
    referenceComparisonError = false,
  } = {}) {
    if (referenceComparisonError) return "reference-error";
    if (
      hasCandidate
      && candidateMatchesReference
      && (!correctionsPending || candidateIncludesCorrections)
      && (!identitiesPending || candidateIncludesIdentities)
    ) return "activate";
    if (referenceNeedsMasterRebuild || (hasCandidate && !candidateMatchesReference)) {
      return "rebuild-master";
    }
    if (identitiesPending) return "rebuild-master";
    if (correctionsPending) return hasCandidate ? "build-corrections" : "apply-corrections";
    if (lightroomPackageNeedsRebuild) return "sync-lightroom";
    return hasWork ? "refresh-and-build" : "current";
  }

  function lightroomCorrectionResult(request = {}, results = []) {
    const requestedId = cleanText(request.masterTaxonId);
    const requestedName = cleanText(request.acceptedScientificName).toLocaleLowerCase("de");
    if (!requestedId || !requestedName) return null;
    return results.find((entry) => (
      cleanText(entry.taxonId) === requestedId
      && cleanText(entry.scientificName).toLocaleLowerCase("de") === requestedName
    )) || null;
  }

  function activeMasterVersion(masterStatus = {}) {
    const active = masterStatus.lifecycle?.active || {};
    return cleanText(active.candidateId || active.masterVersion);
  }

  function taxonomyDatabaseDetailPresentation(detailPresentation, detail, selectedResult) {
    const view = detailPresentation(detail, selectedResult);
    const preferredGermanName = cleanText(view.preferredGermanName);
    if (!preferredGermanName) return view;
    return {
      ...view,
      germanName: preferredGermanName,
      displayName: preferredGermanName,
      usesEnglishFallback: false,
      nameToApply: preferredGermanName,
      germanNameChoices: [...new Set([
        preferredGermanName,
        ...(view.germanNameChoices || []),
      ].filter(Boolean))],
    };
  }

  function shouldScheduleTaxonomyDatabaseSearch(query) {
    return cleanText(query).length >= 2;
  }

  function masterBuildPresentation(status = {}) {
    const job = status.buildJob || {};
    const pending = job.available === true && job.status !== "ready";
    const labels = { building: "Masteraufbau läuft", pausing: "Pause angefordert",
      paused: "Masteraufbau pausiert", interrupted: "Masteraufbau unterbrochen",
      stale: "Gespeicherter Aufbau ist veraltet", failed: "Masteraufbau fehlgeschlagen" };
    const saved = job.checkpoint;
    return { pending, title: labels[job.status] || "", showPause: job.canPause === true || job.status === "pausing",
      canPause: job.canPause === true, showResume: pending && ["paused", "interrupted", "failed"].includes(job.status),
      canResume: job.canResume === true,
      checkpoint: saved ? `Gesichert: ${Number(saved.written).toLocaleString("de-DE")} von ${Number(saved.total).toLocaleString("de-DE")} Artgruppen`
        : pending ? "Noch kein bestätigter Schreibblock; Eingänge und Vorbereitung werden beim Fortsetzen geprüft." : "" };
  }

  function waitingUsageBuildRestartAvailable(masterStatus = {}) {
    const workflow = masterStatus.updateWorkflow || {}, job = masterStatus.buildJob || {};
    return Boolean(workflow.available === true && workflow.updateRunId && workflow.status === "waiting-usage"
      && workflow.phase === "resume-build" && workflow.freshUsageCapture === true && workflow.sourceCompleted === true
      && workflow.buildStarted === true && workflow.decision === "rebuild-master" && !workflow.boundCandidate
      && masterStatus.active !== true && !MASTER_ACTIVE_STATES.has(masterStatus.status)
      && !masterStatus.lifecycle?.error && !masterStatus.reference?.error && masterStatus.reference?.status !== "error"
      && workflow.baseline?.masterVersion && workflow.baseline.masterVersion === masterStatus.lifecycle?.active?.candidateId
      && job.available === true && job.id && job.updateRunId === workflow.updateRunId && ["failed", "stale"].includes(job.status));
  }

  function localBuildRestartAvailable(masterStatus = {}) {
    const workflow = masterStatus.updateWorkflow || {};
    const preBuildRestart = workflow.freshUsageCapture === true && workflow.buildStarted === false && workflow.sourceCompleted === true
      && workflow.decision === "rebuild-master" && workflow.restartGuard?.originWorkflowRevision && ["start", "build"].includes(workflow.phase);
    return waitingUsageBuildRestartAvailable(masterStatus) || Boolean(workflow.updateRunId && ["failed", "interrupted"].includes(workflow.status) && (preBuildRestart
      || workflow.phase === "build" && workflow.buildStarted === true && workflow.sourceCompleted === true
        && ["failed", "stale"].includes(masterStatus.buildJob?.status)));
  }

  function assertBuildMayActivate(status) {
    if (["paused", "interrupted", "stale", "failed", "pausing"].includes(status.status)
        || masterBuildPresentation(status).pending) {
      const error = new Error(status.message || "Der Masteraufbau ist nicht fertig. Es wurde nichts aktiviert.");
      error.code = "MASTER_BUILD_STOPPED";
      throw error;
    }
  }

  function assertOperationComplete(status, label) {
    if (!status || typeof status !== "object") throw new Error(`${label}: kein gültiger Status verfügbar.`);
    if (["paused", "interrupted", "stale", "pausing"].includes(status.status)) assertBuildMayActivate(status);
    if (["partial", "failed"].includes(status.status) || status.error) {
      throw new Error([status.message, status.error].map(cleanText).filter(Boolean).join(" ")
        || `${label} wurde nicht vollständig abgeschlossen.`);
    }
  }

  function createTaxonomyDatabaseController({
    state,
    elements,
    fetchJson,
    escapeHtml,
    createDialogController,
    taxonomyReference,
    showQuickConfirm,
    formatBytes = (value) => `${(Number(value) / 1024 ** 3).toLocaleString("de-DE")} GiB`,
    renderDatabaseStatus = () => {},
  } = {}) {
    const dialog = elements.taxonomyDatabaseDialog;
    if (!dialog) return Object.freeze({ setup() {} });
    const searchInput = elements.taxonomyDatabaseSearch;
    const results = elements.taxonomyDatabaseResults;
    const detail = elements.taxonomyDatabaseDetail;
    const message = elements.taxonomyDatabaseMessage;
    const resultPresentation = taxonomyReference.taxonomyResultPresentation;
    const detailPresentation = taxonomyReference.taxonomyDetailPresentation;
    let timer = null;
    let requestVersion = 0;
    let searchResults = [];
    let selectedResult = null;
    let selectedDetail = null;
    let databaseBusy = false;
    let workflowTimer = null;
    let workflowPollInFlight = false;
    let workflowReadFailures = 0;
    const statusRetryDelays = [1000, 2000, 4000, 8000, 15000];
    const readStatus = global.SpeciesExplorerTaxonomyMaster.createTaxonomyStatusReader({ state, fetchJson });
    let correctionSaved = false;
    let lightroomCorrectionRequest = null;
    const queuedLightroomCorrectionRequests = [];

    function referenceIsActive(status = {}) {
      return status.active === true;
    }

    function masterIsActive(status = {}) {
      return status.active === true || MASTER_ACTIVE_STATES.has(status.status);
    }

    function setMessage(text, type = "info") {
      message.hidden = !text;
      message.textContent = text;
      message.className = `edit-message${type ? ` ${type}` : ""}`;
    }

    function setActionMessage(text, type = "") {
      state.setPipelineMessage?.(text, type);
    }

    function renderOverview() {
      const referenceStatus = state.taxonomyMaintenanceSnapshot || {};
      const masterSnapshot = state.taxonomyMasterSnapshot || {};
      const masterStatus = global.SpeciesExplorerTaxonomyProgress.taxonomyMasterPresentationSnapshot(masterSnapshot);
      const workflow = masterStatus.updateWorkflow || {};
      const workflowOpen = Boolean(workflow.updateRunId && !["completed", "idle"].includes(workflow.status));
      const localRestart = localBuildRestartAvailable(masterStatus) && !referenceIsActive(referenceStatus)
        && !["failed", "partial", "interrupted", "stale", "paused"].includes(referenceStatus.status) && !referenceStatus.error;
      const waitingRestart = localRestart && waitingUsageBuildRestartAvailable(masterStatus);
      const masterLifecycle = masterStatus.lifecycle || {};
      const classificationFollowup = global.SpeciesExplorerTaxonomyProgress.taxonomyClassificationFollowupPresentation(masterStatus);
      const progress = global.SpeciesExplorerTaxonomyProgress.taxonomyProgressPresentation({
        master: masterSnapshot, reference: referenceStatus, busy: databaseBusy,
        preparation: state.taxonomyDatabasePreparation });
      const preparing = progress?.preparation === true;
      const build = masterBuildPresentation(masterStatus);
      const workflowCanPause = workflowOpen && (["waiting-lightroom", "waiting-usage"].includes(workflow.status)
        || workflow.status === "building" && build.canPause);
      const workflowCanResume = !localRestart && workflowOpen && ["paused", "interrupted", "failed", "waiting-decisions"].includes(workflow.status);
      const active = databaseBusy || referenceIsActive(referenceStatus) || masterIsActive(masterStatus) || workflow.active === true;
      const failed = referenceStatus.status === "failed" || Boolean(masterStatus.error) || Boolean(workflow.error);
      const lightroomPackageNeedsRebuild = masterStatus.lightroomPackage?.needsRebuild === true;
      const referenceNeedsMasterRebuild = masterStatus.reference?.needsMasterRebuild === true;
      const correctionsPending = masterStatus.corrections?.pending === true;
      const identitiesPending = masterStatus.identities?.pending === true;
      const partial = masterStatus.status === "partial"
        || lightroomPackageNeedsRebuild
        || referenceNeedsMasterRebuild;
      const updateAvailable = referenceStatus.catalogueUpdateAvailable === true;
      const inspectionDeferred = masterLifecycle.candidateInspection?.status === "deferred";
      const blockingConflicts = inspectionDeferred ? null : Number(
        masterLifecycle.blockingConflictCount
        ?? (Array.isArray(masterLifecycle.blockingConflicts)
          ? masterLifecycle.blockingConflicts.length
          : 0),
      );
      const projectConflicts = Number(referenceStatus.conflicts?.referenceGaps || 0)
        + Number(referenceStatus.conflicts?.suggestions || 0)
        + Number(referenceStatus.conflicts?.ambiguous || 0)
        + Number(referenceStatus.conflicts?.missing || 0);
      const statusReadErrors = Object.values(state.taxonomyStatusReadErrors || {}).filter(Boolean);
      const verifiedCurrent = !statusReadErrors.length && global.SpeciesExplorerTaxonomyMaster?.activePairIsCurrent(masterStatus) === true
        && !active && !failed && !referenceStatus.updateAvailable && !projectConflicts
        && !masterStatus.baselineSetup?.needed;
      const counts = taxonomyDatabaseCounts(progress?.sourceFailure
        ? { ...masterStatus, lifecycle: { ...masterLifecycle, candidate: null } } : masterStatus);
      const latest = taxonomyReleaseLabel(referenceStatus.latest);
      const currentRelease = referenceLabel(referenceStatus);
      const activeDate = formatSnapshotDate(masterLifecycle.active);
      const previousDate = formatSnapshotDate(masterLifecycle.previous);

      elements.taxonomyDatabaseOverview?.classList.toggle("updating", active && !preparing);

      elements.taxonomyDatabaseOverviewSummary.textContent = statusReadErrors.length ? "Datenbankstatus nicht aktuell" : preparing ? progress.stage
        : waitingRestart ? "Lokaler Wiederanlauf benötigt frische FN-Erfassung"
        : localRestart ? "Letzter Aufbau fehlgeschlagen · Neuaufbau erforderlich"
        : workflowOpen && !masterIsActive(masterStatus) && !referenceIsActive(referenceStatus)
        ? workflow.message || "Gespeicherter Updateauftrag"
        : build.pending && !active
        ? build.title
        : active
        ? "Taxonomiedatenbank wird aktualisiert"
        : inspectionDeferred ? "Masterprüfung ausstehend"
        : progress?.state === "fehlgeschlagen" ? "Taxonomieaktualisierung prüfen"
        : progress?.state === "Entscheidung erforderlich" ? "Aktualisierung wartet auf Entscheidung"
        : progress?.state === "Übernahme ausstehend" ? "Geprüfter Kandidat wartet auf Übernahme"
        : progress?.completed ? "Taxonomieaktualisierung abgeschlossen"
        : referenceNeedsMasterRebuild
          ? "Masterdatenbank an aktive Referenz angleichen"
        : partial
          ? "Lightroom-Suchpaket aktualisieren"
          : failed
          ? "Taxonomiedatenbank prüfen"
          : identitiesPending
            ? "Identitätsentscheidungen übernehmen"
          : correctionsPending
            ? "Eigene Korrekturen übernehmen"
          : updateAvailable
            ? "Neuere Datenbankversion verfügbar"
            : masterLifecycle.active
              ? "Datenbank aktuell"
              : "Noch keine Taxonomiedatenbank aktiviert";

      const details = statusReadErrors.length
        ? ["Letzter bestätigter Stand; aktuell nicht bestätigt", ...statusReadErrors] : [];
      if (verifiedCurrent) details.push("Technisch abgeschlossen · keine offenen Entscheidungen. Referenz, Master und Lightroom-Suchpaket stimmen überein");
      if (localRestart) {
        details.push(waitingRestart
          ? 'Der bisherige Master und das Lightroom-Suchpaket bleiben aktiv. „Neu lokal aufbauen“ öffnet zuerst eine geschützte Vorschau, die auch die Herkunft des erhaltenen Kandidaten prüft. Der alte Auftrag und sein Aufbau werden nicht automatisch fortgesetzt'
          : 'Der bisherige Datenbankstand bleibt aktiv. Wähle „Mit lokalen Daten neu aufbauen“. Ein Neustart des Programms startet keinen Aufbau');
        const cause = cleanText(workflow.error || masterStatus.error);
        if (cause) details.push(`Letzter Fehler: ${cause}`);
      }
      if (workflowOpen && workflow.error && !localRestart) details.push(workflow.error);
      if (build.pending && !active && !localRestart) details.push(masterStatus.message || "Fortsetzen prüft zuerst den aktuellen Datenstand. Ein neuer Aufbau bleibt möglich.");
      if (active && !preparing && !localRestart && !progress?.activityMessage) {
        details.push(
          cleanText(masterStatus.message)
          || cleanText(referenceStatus.message)
          || "Aktualisierung wird vorbereitet",
        );
      }
      if (progress && !localRestart && !(inspectionDeferred && progress.completed)) details.push(progress.detail);
      if (counts) details.push(`${active || progress?.sourceFailure || localRestart
        ? !progress?.sourceFailure && masterLifecycle.candidate ? "Geprüfter Kandidat: " : "Bisheriger aktiver Bestand: " : ""}${counts}`);
      if (updateAvailable && latest) details.push(`Verfügbar: ${latest}`);
      if (referenceNeedsMasterRebuild) {
        const referenceRelease = cleanText(masterStatus.reference?.activeRelease) || "unbekannt";
        const masterRelease = cleanText(masterStatus.reference?.activeMasterRelease) || "noch keiner";
        details.push(
          `Aktive CoL-Referenz ${referenceRelease}; im aktiven Master enthalten: ${masterRelease}`,
        );
      }
      if (masterStatus.reference?.status === "error") {
        details.push(
          cleanText(masterStatus.reference?.error)
          || "Der Referenzstand konnte nicht mit dem Master verglichen werden",
        );
      }
      if (inspectionDeferred) details.push("Kandidaten- und Konfliktprüfung ausstehend; die Übernahme bleibt bis zum geprüften Abschluss gesperrt");
      const unresolvedConflicts = inspectionDeferred ? null : classificationFollowup?.remainingConflicts ?? blockingConflicts;
      if (unresolvedConflicts) {
        details.push(`${unresolvedConflicts} Aktualisierungskonflikt(e) benötigen eine Entscheidung`);
      }
      if (projectConflicts) {
        details.push(`${projectConflicts} Projektzuordnung(en) manuell prüfen`);
      }
      if (correctionsPending) {
        details.push(
          `${Number(masterStatus.corrections?.count || 0)} eigene Namenskorrektur(en) warten auf die gemeinsame Aktivierung`,
        );
      }
      if (identitiesPending && !classificationFollowup) {
        details.push("Bestätigte Identitätsentscheidungen warten auf einen erneut geprüften Masterkandidaten; Fotos bleiben unverändert");
      }
      if (masterStatus.baselineSetup?.needed) {
        details.push(masterStatus.baselineSetup.blockedReason
          || "Einmalige Vergleichsgrundlage für künftige Änderungsabgleiche fehlt; lokaler Vollaufbau erforderlich");
      }
      if (lightroomPackageNeedsRebuild && masterStatus.status !== "partial") {
        details.push(
          masterStatus.lightroomPackage?.error
          || "Das Lightroom-Suchpaket entspricht nicht dem aktiven Masterstand",
        );
      }
      const sourceError = cleanText(referenceStatus.error);
      if (sourceError && !details.some((detail) => cleanText(detail).includes(sourceError))) details.push(`Quellenfehler: ${sourceError}`);
      if (failed && !localRestart) {
        const cause = cleanText(masterStatus.error) || sourceError
          || cleanText(referenceStatus.status === "failed" ? referenceStatus.message : masterStatus.message)
          || "Aktualisierung fehlgeschlagen";
        if (!details.some((detail) => cleanText(detail).includes(cause))) details.push(cause);
      }
      if (!details.length) details.push("Umfang, Aktualität und Konflikte werden zusammengeführt");
      elements.taxonomyDatabaseOverviewDetail.textContent = `${details.join(" · ").replace(/\.+$/, "")}.`;

      elements.taxonomyDatabaseCurrentVersion.textContent = [
        currentRelease ? `Aktuell: ${currentRelease}` : "Aktueller Datenbankstand",
        activeDate ? `Gesamtstand ${activeDate}` : "",
      ].filter(Boolean).join(" · ");
      elements.taxonomyDatabasePreviousVersion.textContent = previousDate
        ? `Vorheriger Gesamtstand: ${previousDate}`
        : "Kein vorheriger Gesamtstand vorhanden";
      elements.taxonomyDatabaseUpdateButton.disabled = databaseBusy || referenceIsActive(referenceStatus)
        || masterIsActive(masterStatus) || workflow.active === true && !waitingRestart;
      if (elements.taxonomyUpdateButton) elements.taxonomyUpdateButton.disabled = active || !referenceStatus.updateAvailable;
      if (elements.taxonomyCheckButton) elements.taxonomyCheckButton.disabled = active;
      if (elements.taxonomyRollbackButton) elements.taxonomyRollbackButton.disabled = active || !referenceStatus.rollbackAvailable;
      const updateTitle = elements.taxonomyDatabaseUpdateButton.querySelector("strong");
      if (updateTitle) updateTitle.textContent = waitingRestart ? "Neu lokal aufbauen" : workflowOpen ? workflow.active ? "Gespeicherter Updateauftrag wartet/läuft"
        : localRestart ? "Mit lokalen Daten neu aufbauen" : "Gespeicherten Updateauftrag fortsetzen"
        : build.pending ? "Neuen Datenbankaufbau starten" : "Datenbank aktualisieren";
      if (elements.taxonomyDatabaseBuildProgress) {
        elements.taxonomyDatabaseBuildProgress.hidden = !build.pending || localRestart;
        elements.taxonomyDatabaseBuildProgress.textContent = build.checkpoint;
      }
      if (elements.taxonomyDatabasePauseButton) {
        elements.taxonomyDatabasePauseButton.hidden = workflowOpen ? !workflowCanPause : !build.showPause;
        elements.taxonomyDatabasePauseButton.disabled = databaseBusy || (workflowOpen ? !workflowCanPause : !build.canPause);
        const pauseTitle = elements.taxonomyDatabasePauseButton.querySelector("strong");
        if (pauseTitle) pauseTitle.textContent = workflowOpen && ["waiting-lightroom", "waiting-usage"].includes(workflow.status)
          ? "Updateauftrag pausieren" : "Masteraufbau pausieren";
      }
      if (elements.taxonomyDatabaseResumeButton) {
        elements.taxonomyDatabaseResumeButton.hidden = localRestart || (workflowOpen ? !workflowCanResume : !build.showResume);
        elements.taxonomyDatabaseResumeButton.disabled = active || localRestart || (workflowOpen ? !workflowCanResume : !build.canResume);
      }
      elements.taxonomyDatabaseRollbackButton.disabled = active || inspectionDeferred || !masterLifecycle.canRollback;
      if (elements.taxonomyDatabaseStorageButton) elements.taxonomyDatabaseStorageButton.disabled = active || databaseBusy;
      if (elements.taxonomyDatabaseBaselineButton) {
        elements.taxonomyDatabaseBaselineButton.hidden = masterStatus.baselineSetup?.needed !== true;
        elements.taxonomyDatabaseBaselineButton.disabled = active || databaseBusy || masterStatus.baselineSetup?.canStart !== true;
      }
      renderDatabaseStatus();
      if (workflow.active) watchUpdateWorkflow();
    }

    state.renderTaxonomyDatabaseOverview = renderOverview;
    // All update entry points share this confirmation, lock and complete path.
    state.updateTaxonomyDatabase = updateDatabase;

    function applyMasterSnapshot(status, { acceptedRead = false } = {}) {
      if (!acceptedRead) global.SpeciesExplorerTaxonomyMaster.invalidateTaxonomyStatusRead(state, "master");
      if (state.renderTaxonomyMasterSnapshot) state.renderTaxonomyMasterSnapshot(status);
      else state.taxonomyMasterSnapshot = status;
    }

    async function refreshSnapshots({ requireFresh = false } = {}) {
      const applyRead = async (url, snapshotKey) => {
        const result = await readStatus(url);
        if (!result.isCurrent()) return result;
        if (result.error || !result.value) {
          const error = result.error || new Error("Der aktuelle Datenbankstand konnte nicht gelesen werden.");
          result.error = error;
          (state.taxonomyStatusReadErrors ||= {})[result.channel] = error.message;
        } else {
          if (state.taxonomyStatusReadErrors) delete state.taxonomyStatusReadErrors[result.channel];
          if (snapshotKey === "taxonomyMasterSnapshot") applyMasterSnapshot(result.value, { acceptedRead: true });
          else state[snapshotKey] = result.value;
        }
        renderOverview();
        return result;
      };
      const results = await Promise.all([
        applyRead("/api/taxonomy/status", "taxonomyMaintenanceSnapshot"),
        applyRead("/api/taxonomy/master/status", "taxonomyMasterSnapshot"),
      ]);
      const failed = results.find((result) => result.error);
      const superseded = results.some((result) => !result.isCurrent());
      if (requireFresh) {
        if (failed) throw failed.error;
        if (superseded) throw new Error("Eine neuere Statusprüfung wurde begonnen. Bitte die Aktion erneut prüfen.");
      }
      return {
        reference: state.taxonomyMaintenanceSnapshot || {},
        master: state.taxonomyMasterSnapshot || {},
        fresh: !failed && !superseded,
      };
    }

    async function waitUntilIdle(path, isActive, label) {
      const deadline = Date.now() + UPDATE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const status = await fetchJson(path);
        if (path.includes("/master/")) applyMasterSnapshot(status);
        else state.taxonomyMaintenanceSnapshot = status;
        renderOverview();
        if (!isActive(status)) {
          assertOperationComplete(status, label);
          return status;
        }
        await sleep(POLL_DELAY_MS);
      }
      throw new Error(`${label} hat das Zeitlimit überschritten.`);
    }

    function watchUpdateWorkflow() {
      if (workflowTimer || workflowPollInFlight) return;
      const delay = workflowReadFailures
        ? statusRetryDelays[Math.min(workflowReadFailures - 1, statusRetryDelays.length - 1)] : 5000;
      workflowTimer = global.setTimeout(async () => {
        workflowTimer = null;
        workflowPollInFlight = true;
        try {
          const result = await readStatus("/api/taxonomy/update/sequence-status");
          if (!result.isCurrent()) return;
          if (result.error || !result.value) throw result.error || new Error("Kein gültiger Updateauftragsstatus verfügbar.");
          applyMasterSnapshot({ ...state.taxonomyMasterSnapshot, updateWorkflow: result.value }, { acceptedRead: true });
          const refreshed = await refreshSnapshots();
          if (!refreshed.fresh) { workflowReadFailures += 1; return; }
          workflowReadFailures = 0;
          const workflow = state.taxonomyMasterSnapshot?.updateWorkflow || {};
          setActionMessage([workflow.message, workflow.error].filter(Boolean).join(" "),
            workflow.status === "completed" ? "success" : workflow.error ? "error" : "info");
        } catch (error) {
          workflowReadFailures += 1;
          (state.taxonomyStatusReadErrors ||= {}).master = error.message;
          renderOverview();
          setActionMessage("Der gespeicherte Updateauftrag bleibt erhalten. Status derzeit nicht erreichbar: " + error.message, "warning");
        } finally {
          workflowPollInFlight = false;
          if (state.taxonomyMasterSnapshot?.updateWorkflow?.active === true) watchUpdateWorkflow();
        }
      }, delay);
    }

    async function startSavedUpdate(decision, sourcePreview, master, restartPreview = null) {
      const candidate = master.lifecycle?.candidate;
      const workflow = await fetchJson(restartPreview ? "/api/taxonomy/update/sequence-restart-build" : "/api/taxonomy/update/sequence-start", { method: "POST", body: JSON.stringify(restartPreview ? {
        confirmed: true, token: restartPreview.token, updateRunId: restartPreview.updateRunId,
        buildJobId: restartPreview.buildJobId, buildJobRevision: restartPreview.buildJobRevision,
        usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true },
      } : {
        confirmed: true, decision, token: sourcePreview?.token || "",
        usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true },
        candidateId: candidate?.candidateId || "", buildJobId: master.buildJob?.id || "",
        buildJobRevision: candidate?.buildJobRevision || "",
      }) });
      applyMasterSnapshot({ ...master, updateWorkflow: workflow });
      let closeMessage = "";
      if (["waiting-lightroom", "waiting-usage"].includes(workflow.status)) {
        const lightroom = await fetchJson("/api/taxonomy/update/lightroom-status");
        if (lightroom.canRequestClose) {
          const closeNow = await showQuickConfirm({ eyebrow: "Datenbankaktualisierung", title: "Lightroom schließen?",
            message: "Nach der FN-Prüfung wird das normale Schließen von Lightroom angefordert. Bitte Lightroom-Rückfragen beantworten. Du kannst Lightroom auch selbst schließen. Der Auftrag bleibt gespeichert und läuft anschließend ohne zweiten Startklick weiter.",
            confirmLabel: "Lightroom jetzt schließen", cancelLabel: "Ich schließe Lightroom selbst" });
          if (closeNow) {
            const closing = await fetchJson("/api/taxonomy/update/lightroom-close", { method: "POST", body: JSON.stringify({ confirmed: true }) });
            if (closing.queued) closeMessage = "Nach der FN-Prüfung wird das normale Schließen von Lightroom angefordert. Bitte Lightroom-Rückfragen beantworten; der Auftrag bleibt gespeichert.";
          }
        }
      }
      setActionMessage(closeMessage || [workflow.message, workflow.error].filter(Boolean).join(" "), workflow.error ? "error" : "info");
      if (workflow.active) watchUpdateWorkflow();
      await refreshSnapshots();
    }

    async function activateCandidate(masterStatus, automaticAttempted = false) {
      assertOperationComplete(masterStatus, "Masteraufbau");
      assertBuildMayActivate(masterStatus);
      const lifecycle = masterStatus.lifecycle || {};
      const blocking = Number(
        lifecycle.blockingConflictCount
        ?? (Array.isArray(lifecycle.blockingConflicts)
          ? lifecycle.blockingConflicts.length
          : 0),
      );
      if (blocking) {
        if (!automaticAttempted && Number(lifecycle.candidate?.classificationReview?.total || 0)) {
          const preview = await fetchJson("/api/taxonomy/master/classification/automatic-preview", { method: "POST", body: "{}" });
          if (preview.available && Number(preview.matching || 0) + Number(preview.deferred || 0) > 0) {
            const saved = await fetchJson("/api/taxonomy/master/classification/automatic-save", { method: "POST", body: JSON.stringify(preview) });
            if (saved.saved) return buildAndActivateMaster({ refreshProviders: false, label: "Lokaler Klassifikationsabgleich", automaticAttempted: true });
          }
        }
        throw new Error(
          `${blocking} Aktualisierungskonflikt(e) müssen zuerst unter „Datenbank-Aktionen → Taxonomiedatenbank“ entschieden werden. Klassifikationen können dort gebündelt geprüft oder zurückgestellt werden.`,
        );
      }
      if (!lifecycle.canActivate) throw new Error("Der Kandidat kann noch nicht übernommen werden. Bitte den Datenbankstatus und offene Entscheidungen prüfen.");
      const started = await fetchJson("/api/taxonomy/master/activate", {
        method: "POST",
        body: JSON.stringify({ confirmed: true }),
      });
      applyMasterSnapshot(started);
      renderOverview();
      const completed = masterIsActive(started)
        ? await waitUntilIdle("/api/taxonomy/master/status", masterIsActive, "Datenbankaktivierung") : started;
      assertOperationComplete(completed, "Datenbankaktivierung");
      return completed;
    }

    async function buildAndActivateMaster({ refreshProviders, label, automaticAttempted = false }) {
      const building = await fetchJson("/api/taxonomy/master/build", {
        method: "POST",
        body: JSON.stringify({ refreshProviders }),
      });
      applyMasterSnapshot(building);
      renderOverview();
      const built = masterIsActive(building)
        ? await waitUntilIdle("/api/taxonomy/master/status", masterIsActive, label)
        : building;
      return activateCandidate(built, automaticAttempted);
    }

    async function buildBaseline() {
      if (databaseBusy) return;
      databaseBusy = true;
      state.taxonomyDatabaseBusy = true;
      renderOverview();
      try {
        // A failed read must not silently fall back to a cached eligible status.
        const master = await fetchJson("/api/taxonomy/master/status");
        applyMasterSnapshot(master);
        renderOverview();
        if (!master.baselineSetup?.canStart) {
          throw new Error(master.baselineSetup?.blockedReason || "Der Grundlagenlauf ist derzeit nicht erforderlich oder eine andere Aktion läuft.");
        }
        const confirmed = await showQuickConfirm({
          eyebrow: "Taxonomiedatenbank",
          title: "Vergleichsgrundlage einmalig erstellen?",
          message: "Master und Lightroom-Suchpaket werden aus den bereits lokal vorhandenen Quellen neu aufgebaut und vollständig geprüft. Es werden keine neuen Anbieterstände heruntergeladen. Dieser erste Lauf kann länger dauern; erst danach sind spätere Änderungsabgleiche möglich. Eigene Namensentscheidungen werden berücksichtigt. Der bisherige Stand bleibt bis zur erfolgreichen gemeinsamen Übernahme aktiv und danach als Vorgänger erhalten. Bestehende Fotos werden nicht geändert. Bei offenen Konflikten erfolgt keine automatische Übernahme.",
          confirmLabel: "Lokal aufbauen und geprüft übernehmen",
        });
        if (!confirmed) return;
        const started = await fetchJson("/api/taxonomy/master/build-baseline", {
          method: "POST", body: JSON.stringify({ confirmed: true, revision: master.baselineSetup.revision }),
        });
        applyMasterSnapshot(started);
        renderOverview();
        setActionMessage("Vergleichsgrundlage wird aus lokalen Quellen aufgebaut. Der bisherige Stand bleibt zunächst aktiv.", "info");
        const built = masterIsActive(started)
          ? await waitUntilIdle("/api/taxonomy/master/status", masterIsActive, "Lokaler Grundlagenlauf") : started;
        const activated = await activateCandidate(built);
        if (["failed", "partial"].includes(activated.status) || activated.error) {
          throw new Error(activated.error || activated.message || "Der gemeinsame Datenbankwechsel ist nicht abgeschlossen.");
        }
        setActionMessage("Lokaler Grundlagenlauf abgeschlossen. Master und Lightroom-Suchpaket wurden gemeinsam übernommen.", "success");
      } catch (error) {
        setActionMessage(error.message || "Die Vergleichsgrundlage konnte nicht erstellt werden.", error.code === "MASTER_BUILD_STOPPED" ? "warning" : "error");
      } finally {
        databaseBusy = false;
        state.taxonomyDatabaseBusy = false;
        await refreshSnapshots();
      }
    }

    async function updateDatabase({ startup = false, sourcePreview = null } = {}) {
      if (databaseBusy || state.taxonomyDatabaseBusy) return;
      databaseBusy = true;
      state.taxonomyDatabaseBusy = true;
      state.taxonomyDatabasePreparation = "preview";
      renderOverview();
      try {
        const { master, reference } = await refreshSnapshots({ requireFresh: true });
        const workflow = master.updateWorkflow;
        let restartSources = false;
        if (workflow?.available && workflow.updateRunId && !["completed", "idle"].includes(workflow.status)) {
          const localRestart = localBuildRestartAvailable(master) && !referenceIsActive(reference)
            && !["failed", "partial", "interrupted", "stale", "paused"].includes(reference.status) && !reference.error;
          if (workflow.active && !localRestart) {
            setActionMessage(workflow.message || "Der gespeicherte Auftrag läuft oder wartet im Hintergrund.", "info");
            watchUpdateWorkflow();
            return;
          }
          restartSources = workflow.phase === "sources" && ["failed", "interrupted"].includes(workflow.status);
          if (!restartSources) {
            if (localRestart) {
              const preview = await fetchJson("/api/taxonomy/update/sequence-restart-preview", { method: "POST", body: "{}" });
              if (!preview.available || !preview.token || preview.updateRunId !== workflow.updateRunId
                  || !preview.buildJobId || !preview.buildJobRevision
                  || waitingUsageBuildRestartAvailable(master) && preview.buildJobId !== master.buildJob.id) {
                throw new Error("Keine sichere lokale Neustartvorschau verfügbar. Der alte Auftrag bleibt erhalten.");
              }
              const confirmed = await showQuickConfirm({ eyebrow: "Datenbankaktualisierung", title: "Neu mit lokalen Daten aufbauen?",
                message: "Der alte Auftrag bleibt erhalten. Der neue Lauf nutzt die vorhandenen lokalen Quellen und erfasst die FN-Nutzung neu. Bestätige alle FN-Kataloge; bis zum Schließen keine FN-Zuweisungen, Importe oder Katalogwechsel. Master und Lightroom-Suchpaket werden vor dem gemeinsamen Wechsel geprüft.",
                confirmLabel: "Neu lokal aufbauen", cancelLabel: "Abbrechen" });
              if (confirmed) await startSavedUpdate("rebuild-master", null, master, preview);
              return;
            }
            const resumed = await fetchJson("/api/taxonomy/update/sequence-resume", { method: "POST", body: JSON.stringify({ confirmed: true }) });
            applyMasterSnapshot({ ...master, updateWorkflow: resumed });
            setActionMessage([resumed.message, resumed.error].filter(Boolean).join(" "), resumed.error ? "error" : "info");
            if (resumed.active) watchUpdateWorkflow();
            return;
          }
          // A partial CoL import is not proof that all sources were checked.
          // Discard even a caller-supplied preview and bind a fresh full plan.
          sourcePreview = null;
        }
        if (masterIsActive(master) || referenceIsActive(reference)) throw new Error("Es läuft bereits eine Datenbankaktion. Bitte deren Abschluss oder Pause abwarten.");
        const hasSavedBuild = masterBuildPresentation(master).pending;
        let decision = restartSources ? "refresh-and-build" : hasSavedBuild ? "rebuild-master" : taxonomyDatabaseUpdateDecision({
          hasCandidate: Boolean(master.lifecycle?.candidate),
          lightroomPackageNeedsRebuild: master.lightroomPackage?.needsRebuild === true,
          correctionsPending: master.corrections?.pending === true,
          candidateIncludesCorrections: master.corrections?.candidateIncludesCurrent === true,
          identitiesPending: master.identities?.pending === true,
          candidateIncludesIdentities: master.identities?.candidateIncludesCurrent === true,
          referenceNeedsMasterRebuild: master.reference?.needsMasterRebuild === true,
          candidateMatchesReference: !cleanText(master.reference?.activeRelease)
            || master.reference?.candidateMatchesActiveReference !== false,
          referenceComparisonError: master.reference?.status === "error",
        });
        if (decision === "reference-error") {
          throw new Error(
            master.reference?.error
            || "Der aktive Referenzstand konnte nicht sicher mit dem Master verglichen werden.",
          );
        }
        if (decision === "current" || restartSources) {
          sourcePreview ||= await fetchJson("/api/taxonomy/update/preview", { method: "POST", body: "{}" });
          if (typeof sourcePreview?.hasWork !== "boolean" || (sourcePreview.hasWork && !cleanText(sourcePreview.token))) {
            throw new Error("Die aktuelle Quellenvorschau ist unvollständig. Bitte erneut prüfen; es wurde nichts gestartet.");
          }
          decision = taxonomyDatabaseUpdateDecision({ hasWork: sourcePreview.hasWork });
          if (decision === "current") {
            if (restartSources) throw new Error("Die frische Quellenvorschau bietet keinen vollständigen Wiederholungsplan. Der unterbrochene Auftrag bleibt erhalten; ein Gesamtabschluss ist nicht bestätigt.");
            setActionMessage("Die Taxonomiedatenbank ist bereits aktuell. Es wurde kein Neuaufbau gestartet.", "success");
            return;
          }
        }
        const sourceUpdate = decision === "refresh-and-build";
        const fastCorrection = decision === "apply-corrections";
        if (startup && sourceUpdate && sourcePreview.updateCatalogue !== true) return;
        const confirmLabel = startup && sourceUpdate ? "Jetzt aktualisieren"
          : fastCorrection ? "Korrekturen aktivieren" : "Datenbank aktualisieren";
        const usageConfirmation = master.updateWorkflow?.available === true
          ? `\n\nMit „${confirmLabel}“ bestätigst du: Die gespeicherte FN-Katalogliste ist vollständig. Bis Lightroom geschlossen ist, keine FN-Zuweisungen, Fotoimporte oder Katalogwechsel. Die FN-Nutzung wird auf Aktualität geprüft; die Statistik allein genügt nicht. Bei Bedarf wird sie neu erfasst. Der Auftrag wartet bei geöffnetem Lightroom.`
          : "";
        state.taxonomyDatabasePreparation = "confirmation";
        renderOverview();
        const confirmed = await showQuickConfirm({
          eyebrow: "Taxonomiedatenbank",
          title: hasSavedBuild ? "Neuen Datenbankaufbau starten?" : fastCorrection ? "Namenskorrekturen aktivieren?"
            : startup && sourceUpdate
              ? reference.reference?.available ? "Neue Taxonomieversion verfügbar" : "Taxonomiedatenbank installieren?"
              : "Datenbank aktualisieren?",
          message: (sourceUpdate ? [
            sourcePreview.updateCatalogue ? `${taxonomyReleaseLabel(sourcePreview.latest)} ist verfügbar.` : "",
            sourcePreview.updateCatalogue && sourcePreview.downloadRequired !== false ? "Der CoL-Download kann über 1 GB groß sein; der Import kann länger dauern." : "",
            sourcePreview.updateCatalogue ? `Freier Speicher: mindestens ${formatBytes(sourcePreview.requiredFreeBytes)}.` : "CoL ist aktuell; die Ergänzungsnamen werden erneut geprüft.",
            "Nach der Quellenprüfung werden Master und Lightroom-Suchpaket gemeinsam geprüft und übernommen. Bis dahin bleibt der bisherige Stand aktiv. Offene Konflikte stoppen den Wechsel. Eigene Namen bleiben erhalten; Fotos und Projektdateien unverändert.",
          ].filter(Boolean).join("\n\n") : hasSavedBuild
            ? "Der neue lokale Aufbau nutzt heutige Quellen und Entscheidungen. Der gespeicherte Zwischenstand wird nicht überschrieben. Master und Lightroom-Suchpaket werden gemeinsam geprüft und übernommen. Der bisherige Stand bleibt bis dahin aktiv; offene Konflikte stoppen den Wechsel. Fotos bleiben unverändert; keine neuen Anbieterstände geladen."
            : fastCorrection
              ? "Eigene Namenskorrekturen werden für Master und Lightroom-Suchpaket geprüft und gemeinsam aktiviert. Bis zur erfolgreichen Prüfung bleibt der bisherige Stand aktiv. Fotos bleiben unverändert; keine neuen Anbieterstände geladen."
              : "Der vorhandene Stand und eigene Entscheidungen werden für Master und Lightroom-Suchpaket geprüft und gemeinsam übernommen. Offene Konflikte stoppen den Wechsel. Bis dahin bleibt der bisherige Stand aktiv. Fotos und Projektdateien bleiben unverändert; keine neuen Anbieterstände geladen.") + usageConfirmation,
          confirmLabel,
          cancelLabel: startup ? "Später" : "Abbrechen",
          initialFocus: startup ? "cancel" : "confirm",
        });
        if (!confirmed) {
          if (startup) setActionMessage("Die Taxonomiedatenbank kann später unter „Datenbank-Aktionen“ aktualisiert werden.", "info");
          return;
        }
        state.taxonomyDatabasePreparation = "";
        setActionMessage("Taxonomiedatenbank wird aktualisiert. Der bisherige Master-/Paketstand bleibt bis zur geprüften gemeinsamen Übernahme aktiv.", "info");
        if (master.updateWorkflow?.available === true) {
          await startSavedUpdate(decision, sourcePreview, master);
          return;
        }
        if (decision === "rebuild-master") {
          await buildAndActivateMaster({
            refreshProviders: false,
            label: "Master-Neuaufbau",
          });
        } else if (decision === "sync-lightroom") {
          const started = await fetchJson("/api/taxonomy/master/sync-lightroom", {
            method: "POST",
            body: "{}",
          });
          applyMasterSnapshot(started);
          renderOverview();
          if (masterIsActive(started)) {
            await waitUntilIdle(
              "/api/taxonomy/master/status",
              masterIsActive,
              "Lightroom-Suchpaketaktualisierung",
            );
          } else assertOperationComplete(started, "Lightroom-Suchpaketaktualisierung");
        } else if (decision === "activate") {
          await activateCandidate(master);
        } else if (decision === "apply-corrections") {
          const applying = await fetchJson("/api/taxonomy/master/apply-corrections", {
            method: "POST",
            body: JSON.stringify({ confirmed: true }),
          });
          applyMasterSnapshot(applying);
          renderOverview();
          if (masterIsActive(applying)) {
            await waitUntilIdle(
              "/api/taxonomy/master/status",
              masterIsActive,
              "Korrekturaktivierung",
            );
          } else assertOperationComplete(applying, "Korrekturaktivierung");
        } else if (decision === "build-corrections") {
          await buildAndActivateMaster({
            refreshProviders: false,
            label: "Korrektur-Neuaufbau",
          });
        } else {
          const started = await fetchJson("/api/taxonomy/update/start", {
            method: "POST",
            body: JSON.stringify({ token: sourcePreview.token }),
          });
          state.taxonomyMaintenanceSnapshot = started;
          renderOverview();
          if (referenceIsActive(started)) {
            await waitUntilIdle("/api/taxonomy/status", referenceIsActive, "Referenzaktualisierung");
          } else assertOperationComplete(started, "Referenzaktualisierung");
          await buildAndActivateMaster({
            refreshProviders: true,
            label: "Datenbankprüfung",
          });
        }
        const finished = await refreshSnapshots({ requireFresh: true });
        assertOperationComplete(finished.master, "Gesamtaktualisierung");
        assertBuildMayActivate(finished.master);
        if (masterIsActive(finished.master) || referenceIsActive(finished.reference)
            || !activeMasterVersion(finished.master) || finished.master.reference?.status === "error"
            || finished.master.lifecycle?.candidate || finished.master.reference?.needsMasterRebuild
            || finished.master.corrections?.pending || finished.master.identities?.pending
            || finished.master.lightroomPackage?.status !== "current") {
          throw new Error("Die Quellen sind vorbereitet, aber der gemeinsame Master-/Lightroom-Stand ist noch nicht vollständig bestätigt. Bitte den Datenbankstatus prüfen.");
        }
        await loadReview();
        setActionMessage("Taxonomiedatenbank erfolgreich aktualisiert: Master und Lightroom-Suchpaket sind gemeinsam aktuell.", "success");
      } catch (error) {
        setActionMessage(error.message || "Die Taxonomiedatenbank konnte nicht aktualisiert werden.", error.code === "MASTER_BUILD_STOPPED" ? "warning" : "error");
      } finally {
        databaseBusy = false;
        state.taxonomyDatabaseBusy = false;
        state.taxonomyDatabasePreparation = "";
        await refreshSnapshots();
        await state.refreshTaxonomyMasterStatus?.();
      }
    }

    async function pauseMasterBuild() {
      try {
        if (state.taxonomyMasterSnapshot?.updateWorkflow?.updateRunId
            && state.taxonomyMasterSnapshot.updateWorkflow.status !== "completed") {
          await fetchJson("/api/taxonomy/update/sequence-pause", { method: "POST", body: "{}" });
          await refreshSnapshots();
          return;
        }
        applyMasterSnapshot(await fetchJson("/api/taxonomy/master/pause-build", { method: "POST", body: "{}" }));
        setActionMessage("Pause angefordert. Bitte warten, bis der Masteraufbau als pausiert angezeigt wird.", "info");
        renderOverview();
      } catch (error) { setActionMessage(error.message, "error"); }
    }

    async function resumeMasterBuild() {
      if (state.taxonomyMasterSnapshot?.updateWorkflow?.updateRunId
          && state.taxonomyMasterSnapshot.updateWorkflow.status !== "completed") return updateDatabase();
      const confirmed = await showQuickConfirm({ eyebrow: "Taxonomiedatenbank", title: "Masteraufbau fortsetzen?",
        message: "Die gespeicherten Eingänge werden mit den heutigen Quellen und eigenen Entscheidungen verglichen. Nur bei Übereinstimmung wird fortgesetzt. Nach erfolgreicher Prüfung werden Master und passendes Lightroom-Suchpaket gemeinsam übernommen.",
        confirmLabel: "Prüfen und fortsetzen" });
      if (!confirmed) return;
      databaseBusy = true;
      state.taxonomyDatabaseBusy = true;
      try {
        applyMasterSnapshot(await fetchJson("/api/taxonomy/master/resume-build", { method: "POST", body: JSON.stringify({ confirmed: true }) }));
        renderOverview();
        const built = await waitUntilIdle("/api/taxonomy/master/status", masterIsActive, "Master-Wiederanlauf");
        await activateCandidate(built);
        setActionMessage("Fortgesetzter Datenbankaufbau wurde erfolgreich übernommen.", "success");
      } catch (error) { setActionMessage(error.message, error.code === "MASTER_BUILD_STOPPED" ? "warning" : "error"); }
      finally { databaseBusy = false; state.taxonomyDatabaseBusy = false; await refreshSnapshots(); }
    }

    async function maintainStorage() {
      if (databaseBusy) return;
      databaseBusy = true;
      state.taxonomyDatabaseBusy = true;
      renderOverview();
      const size = (value) => `${(Number(value || 0) / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 2 })} GiB`;
      try {
        setActionMessage("Speicherbestand und vorhandener Rückweg werden geprüft. Es wird noch nichts entfernt.", "info");
        const plan = await fetchJson("/api/taxonomy/master/storage-preview", { method: "POST", body: "{}" });
        const candidates = plan.items.filter((item) => item.eligible);
        const summary = `Verwaltete Alt-/Releasebestände: ${size(plan.managedBytes)}. Frei auf dem Laufwerk: ${size(plan.freeBytes)}. `
          + `Zur Bereinigung freigegeben: ${candidates.length} Einträge · ${size(plan.reclaimableBytes)}.`;
        const warnings = (plan.warnings || []).join(" ");
        if (!candidates.length) { setActionMessage(`${summary} ${warnings} Aktiver Stand, Vorgänger und benötigte Aufträge bleiben erhalten.`, "info"); return; }
        const labels = { pair: "Datenbankpaar", job: "Abgeschlossener Auftrag", preparation: "Alte Vorbereitung" };
        const confirmed = await showQuickConfirm({ eyebrow: "Datenbankspeicher", title: "Freigegebene Altstände endgültig entfernen?",
          message: `${summary}\n${warnings}\nAktiver Stand, ein geprüfter Vorgänger als Backup, aktueller Kandidat und benötigte Fortsetzungsdaten bleiben erhalten. `
            + "Die folgenden alten Dateien werden dauerhaft entfernt; eine direkte Rücknahme der Bereinigung gibt es nicht. Arten, Fotos, Karten und Namenswahlen bleiben unverändert.\n"
            + candidates.map((item) => `${labels[item.kind]} ${item.id} · ${size(item.bytes)}`).join("\n"),
          confirmLabel: "Aufgelistete Altstände entfernen", danger: true });
        if (!confirmed) { setActionMessage("Speicherbereinigung abgebrochen. Es wurde nichts entfernt.", "info"); return; }
        const result = await fetchJson("/api/taxonomy/master/storage-clean", { method: "POST", body: JSON.stringify({ confirmed: true, revision: plan.revision }) });
        setActionMessage(`${result.removed.length} Altstände entfernt · ${size(result.freedBytes)} freigegeben.`
          + (result.failed.length ? ` ${result.failed.length} Einträge konnten nicht vollständig entfernt werden: ${result.failed.map((item) => `${item.id}: ${item.error}`).join("; ")}` : " Geschützte Stände bleiben erhalten."),
        result.failed.length ? "warning" : "success");
      } catch (error) { setActionMessage(error.message, "error"); }
      finally { databaseBusy = false; state.taxonomyDatabaseBusy = false; await refreshSnapshots(); }
    }

    async function rollbackDatabase() {
      const previous = formatSnapshotDate(state.taxonomyMasterSnapshot?.lifecycle?.previous);
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomiedatenbank",
        title: "Vorherigen Stand wiederherstellen?",
        message: `${previous ? `Der Gesamtstand vom ${previous}` : "Der vorherige Gesamtstand"} wird wieder aktiviert. Arten, Slugs und Assets bleiben unverändert.`,
        confirmLabel: "Vorherigen Stand wiederherstellen",
      });
      if (!confirmed) return;
      databaseBusy = true;
      state.taxonomyDatabaseBusy = true;
      renderOverview();
      try {
        const started = await fetchJson("/api/taxonomy/master/rollback", {
          method: "POST",
          body: JSON.stringify({ confirmed: true }),
        });
        applyMasterSnapshot(started);
        if (masterIsActive(started)) {
          await waitUntilIdle("/api/taxonomy/master/status", masterIsActive, "Wiederherstellung");
        }
        await refreshSnapshots();
        await loadReview();
        setActionMessage("Der vorherige Taxonomiedatenbankstand wurde wiederhergestellt.", "success");
      } catch (error) {
        setActionMessage(error.message || "Der vorherige Stand konnte nicht wiederhergestellt werden.", "error");
      } finally {
        databaseBusy = false;
        state.taxonomyDatabaseBusy = false;
        await refreshSnapshots();
      }
    }

    const dialogController = createDialogController({
      dialog,
      closeButtons: dialog.querySelectorAll(".taxonomy-database-close"),
      afterOpen() {
        if (!lightroomCorrectionRequest) {
          clearTimeout(timer);
          searchInput.value = "";
          searchResults = [];
          selectedResult = null;
          selectedDetail = null;
          results.hidden = true;
          results.innerHTML = "";
          detail.hidden = true;
          detail.innerHTML = "";
          setMessage("", "");
        }
        void loadReview();
        searchInput.focus();
      },
      afterClose() {
        clearTimeout(timer);
        requestVersion += 1;
        searchInput.value = "";
        searchResults = [];
        selectedResult = null;
        selectedDetail = null;
        correctionSaved = false;
        lightroomCorrectionRequest = null;
        results.hidden = true;
        results.innerHTML = "";
        detail.hidden = true;
        detail.innerHTML = "";
        setMessage("", "");
        const nextRequest = queuedLightroomCorrectionRequests.shift();
        if (nextRequest) global.setTimeout(() => void showLightroomCorrectionRequest(nextRequest), 0);
      },
    });

    function reviewConflictCards(maintenanceStatus = {}) {
      return (maintenanceStatus.conflictDetails || [])
        .filter((entry) => entry.classification !== "exact")
        .map((entry) => ({
          type: "project-conflict",
          scientificName: cleanText(entry.scientificName),
          title: cleanText(entry.germanName) || cleanText(entry.scientificName) || "Unbekannte Art",
          detail: entry.classification === "reference-gap"
            ? "Die Artstufe fehlt in CoL; die aktive Masterdatenbank kann die externe Bestätigung übernehmen."
            : cleanText(entry.message) || "Die Projektzuordnung muss geprüft werden.",
          action: entry.classification === "reference-gap" ? "confirm-reference-gap" : "open",
        }));
    }

    function renderReview(review = {}, maintenanceStatus = {}) {
      const conflictCards = reviewConflictCards(maintenanceStatus);
      const conflictNames = new Set(conflictCards.map((entry) => entry.scientificName));
      const missingCards = (review.reviewItems || [])
        .filter((entry) => !conflictNames.has(cleanText(entry.scientificName)))
        .map((entry) => ({
          type: "missing-fields",
          scientificName: cleanText(entry.scientificName),
          title: cleanText(entry.scientificName) || cleanText(entry.projectSlug),
          detail: entry.missingFields?.length
            ? `Fehlend: ${entry.missingFields.join(", ")}.`
            : "Diese Art benötigt eine zusätzliche externe Bestätigung.",
          action: "open",
        }));
      const errorCards = (review.errors || []).map((entry) => ({
        type: "error",
        scientificName: cleanText(entry.scientificName),
        title: cleanText(entry.scientificName) || "Datenbankprüfung",
        detail: cleanText(entry.message) || "Dieser Eintrag muss geprüft werden.",
        action: entry.scientificName ? "open" : "",
      }));
      const cards = [...conflictCards, ...missingCards, ...errorCards];
      elements.taxonomyDatabaseReviewSummary.textContent = cards.length
        ? `${cards.length} offene Prüfung(en)`
        : "Keine offenen Prüfungen";
      elements.taxonomyDatabaseReviewList.innerHTML = cards.length
        ? cards.map((entry) => `
          <article class="taxonomy-database-review-item ${escapeHtml(entry.type)}">
            <div>
              <strong>${escapeHtml(entry.title)}</strong>
              ${entry.scientificName && entry.scientificName !== entry.title
                ? `<em>${escapeHtml(entry.scientificName)}</em>`
                : ""}
              <span>${escapeHtml(entry.detail)}</span>
            </div>
            ${entry.action === "confirm-reference-gap" ? `
              <button type="button" data-taxonomy-review-confirm="${escapeHtml(entry.scientificName)}">
                Mit Masterdatenbank bestätigen
              </button>
            ` : entry.action === "open" ? `
              <button type="button" data-taxonomy-review-open="${escapeHtml(entry.scientificName)}">
                Taxon öffnen
              </button>
            ` : ""}
          </article>
        `).join("")
        : `<p class="taxonomy-database-review-empty">Für die Arten im Explorer fehlen derzeit keine Entscheidungen oder Namensfelder.</p>`;
    }

    async function loadReview() {
      elements.taxonomyDatabaseReviewSummary.textContent = "Wird geladen…";
      try {
        const [review, maintenanceStatus] = await Promise.all([
          fetchJson("/api/taxonomy/review"),
          fetchJson("/api/taxonomy/status"),
        ]);
        state.taxonomyMaintenanceSnapshot = maintenanceStatus;
        renderReview(review, maintenanceStatus);
        renderOverview();
      } catch (error) {
        elements.taxonomyDatabaseReviewSummary.textContent = "Prüfung nicht verfügbar";
        elements.taxonomyDatabaseReviewList.innerHTML = `
          <p class="taxonomy-database-review-empty error">${escapeHtml(error.message || "Offene Prüfungen konnten nicht geladen werden.")}</p>
        `;
      }
    }

    function renderResults() {
      results.hidden = searchResults.length === 0;
      results.innerHTML = searchResults.map((entry) => {
        const view = resultPresentation(entry);
        return `
          <button type="button" data-taxonomy-database-taxon="${escapeHtml(view.taxonId)}">
            <span>
              <strong>${escapeHtml(view.title)}</strong>
              ${view.subtitle ? `<em>${escapeHtml(view.subtitle)}</em>` : ""}
            </span>
            <small>${escapeHtml([view.rank, view.kingdom, ...view.masterStatuses].filter(Boolean).join(" · "))}</small>
          </button>
        `;
      }).join("");
    }

    function renderDetail() {
      const view = taxonomyDatabaseDetailPresentation(
        detailPresentation,
        selectedDetail,
        selectedResult,
      );
      const hierarchy = view.hierarchy.map((entry) => `
        <div><dt>${escapeHtml(entry.label)}</dt><dd>${escapeHtml(entry.value)}</dd></div>
      `).join("");
      const correctionAllowed = view.rank === "Art";
      const currentMasterVersion = activeMasterVersion(state.taxonomyMasterSnapshot);
      const lightroomOrigin = lightroomCorrectionRequest ? `
        <p class="taxonomy-database-readonly-note">
          Aus Lightroom übergeben: ${escapeHtml([
            lightroomCorrectionRequest.germanName || "kein deutscher Name",
            lightroomCorrectionRequest.englishName || "kein englischer Name",
          ].join(" · "))}<br>
          Suchpaket: ${escapeHtml(lightroomCorrectionRequest.packageId || "unbekannt")}
          · Masterstand: ${escapeHtml(lightroomCorrectionRequest.masterVersion || "unbekannt")}
          · Aktiver Masterstand: ${escapeHtml(currentMasterVersion || "unbekannt")}
        </p>
      ` : "";
      const savedActions = correctionSaved ? `
        <p>Die Korrektur ist gespeichert, aber noch nicht gemeinsam für Arten-Explorer und Lightroom aktiviert.</p>
        <div class="taxonomy-database-correction-actions">
          <button type="button" data-taxonomy-database-next="collect">Weitere Korrekturen sammeln</button>
          <button type="button" data-taxonomy-database-next="update">Datenbank jetzt aktualisieren</button>
        </div>
      ` : "";
      detail.innerHTML = `
        <header class="taxonomy-database-detail-header">
          <div>
            <strong>${escapeHtml(view.displayName || view.scientificName)}</strong>
            <em>${escapeHtml(view.scientificName)}</em>
          </div>
          <span>${escapeHtml([
            view.rank,
            view.referenceGap ? "CoL-Referenzlücke" : "",
            ...view.masterStatuses,
          ].filter(Boolean).join(" · "))}</span>
        </header>
        <dl class="taxonomy-database-hierarchy">${hierarchy}</dl>
        <p class="taxonomy-database-source">
          Quelle: ${escapeHtml(view.source)}${view.releaseId ? ` · Stand: ${escapeHtml(view.releaseId)}` : ""}
        </p>
        ${lightroomOrigin}
        ${correctionAllowed && view.masterTaxonId && view.germanNameChoices.length > 0 ? `
          <section class="taxonomy-database-correction">
            <h4>Bevorzugte deutsche Namensvariante</h4>
            <label>Deutscher Name <select data-name-preference-choice>${view.germanNameChoices.map((name) => `
              <option value="${escapeHtml(name)}" ${name === view.germanName ? "selected" : ""}>${escapeHtml(name)}${name === view.preferredGermanName ? " (bevorzugt)" : ""}</option>
            `).join("")}</select></label>
            <p>Die Namenswahl gilt künftig auch in Lightroom. Projektdateien und bestehende Fotos bleiben unverändert.</p>
            <button type="button" data-name-preference-save disabled>Namenswahl übernehmen</button>
            <button type="button" data-name-preference-previous ${view.previousGermanName ? "" : "disabled"}>Vorherige Namenswahl wiederherstellen</button>
            <button type="button" data-name-preference-provider>Anbieterstandard verwenden …</button>
          </section>
        ` : ""}
        ${correctionAllowed ? `
          <section class="taxonomy-database-correction">
            <h4>Eigene Namenskorrektur</h4>
            <p>Die wissenschaftliche Taxonomie bleibt geschützt. Diese Namen haben bei späteren Aktualisierungen Vorrang.</p>
            <div class="taxonomy-database-correction-fields">
              <label><span>Deutscher Name</span><input name="taxonomyDatabaseGerman" maxlength="120" value="${escapeHtml(view.germanName)}"></label>
              <label><span>Englischer Name</span><input name="taxonomyDatabaseEnglish" maxlength="120" value="${escapeHtml(view.englishName)}"></label>
              <label><span>Hinweis · optional</span><input name="taxonomyDatabaseNote" maxlength="240" value="${escapeHtml(view.supplement?.note || "")}"></label>
            </div>
            <div class="taxonomy-database-correction-actions">
              <button type="button" data-taxonomy-database-correction="save">Korrektur speichern</button>
              <button type="button" data-taxonomy-database-correction="reset" ${view.supplement?.correction ? "" : "disabled"}>Eigene Korrektur zurücksetzen</button>
            </div>
            ${savedActions}
          </section>
        ` : `
          <p class="taxonomy-database-readonly-note">
            Eigene Namenskorrekturen sind in dieser Oberfläche derzeit auf die Artstufe begrenzt.
          </p>
        `}
      `;
      detail.hidden = false;
    }

    async function search(forcedQuery = "") {
      const query = cleanText(forcedQuery || searchInput.value);
      const version = ++requestVersion;
      selectedResult = null;
      selectedDetail = null;
      correctionSaved = false;
      detail.hidden = true;
      detail.innerHTML = "";
      if (query.length < 2) {
        searchResults = [];
        renderResults();
        setMessage(query ? "Bitte mindestens zwei Zeichen eingeben." : "", "info");
        return [];
      }
      setMessage("Taxa werden in der aktiven Datenbank gesucht …", "info");
      try {
        const payload = await fetchJson(
          `/api/taxonomy/search?q=${encodeURIComponent(query)}&kind=all&kingdomId=all&rank=all&limit=12`,
        );
        if (version !== requestVersion) return [];
        searchResults = payload.results || [];
        renderResults();
        setMessage(
          searchResults.length
            ? `${searchResults.length} Treffer gefunden.`
            : "Kein passender Eintrag gefunden.",
          searchResults.length ? "success" : "warning",
        );
        return searchResults;
      } catch (error) {
        if (version !== requestVersion) return [];
        searchResults = [];
        renderResults();
        setMessage(error.message || "Die Datenbank konnte nicht durchsucht werden.", "error");
        return [];
      }
    }

    function applySelectedDetail(nextDetail) {
      selectedDetail = nextDetail;
      const germanName = cleanText(nextDetail.preferredGermanName || nextDetail.germanNames?.[0]?.name);
      selectedResult = {
        ...selectedResult,
        germanName: germanName || null,
        englishName: nextDetail.englishNames?.[0]?.name || null,
        hasVerifiedGermanName: Boolean(germanName),
      };
      searchResults = searchResults.map((entry) => (
        String(entry.taxonId) === String(selectedResult.taxonId) ? selectedResult : entry
      ));
      renderResults();
      renderDetail();
    }

    async function selectTaxon(taxonId) {
      const version = ++requestVersion;
      selectedResult = searchResults.find((entry) => String(entry.taxonId) === taxonId) || null;
      if (!selectedResult) return false;
      correctionSaved = false;
      setMessage("Taxondetails werden geladen …", "info");
      try {
        const nextDetail = await fetchJson(`/api/taxonomy/taxa/${encodeURIComponent(taxonId)}`);
        if (version !== requestVersion) return false;
        applySelectedDetail(nextDetail);
        setMessage("Taxon geladen. Wissenschaftliche Taxonomie ist schreibgeschützt.", "success");
        detail.scrollIntoView({ block: "nearest" });
        return true;
      } catch (error) {
        if (version !== requestVersion) return false;
        setMessage(error.message || "Taxondetails konnten nicht geladen werden.", "error");
        return false;
      }
    }

    async function openTaxon(scientificName) {
      if (!scientificName) return;
      searchInput.value = scientificName;
      const matches = await search(scientificName);
      const exact = matches.find((entry) => (
        cleanText(entry.scientificName).toLocaleLowerCase("de")
        === scientificName.toLocaleLowerCase("de")
      ));
      if (exact) await selectTaxon(String(exact.taxonId));
    }

    function prepareNextCorrection() {
      correctionSaved = false;
      lightroomCorrectionRequest = null;
      searchInput.value = "";
      searchResults = [];
      selectedResult = null;
      selectedDetail = null;
      renderResults();
      detail.hidden = true;
      detail.innerHTML = "";
      setMessage("Weitere Namenskorrekturen können gesucht und gesammelt werden.", "success");
      searchInput.focus();
    }

    function updateDatabaseFromCorrection() {
      dialogController.close("update-database");
      global.setTimeout(() => void updateDatabase(), 0);
    }

    async function showLightroomCorrectionRequest(request) {
      if (!request || typeof request !== "object") return false;
      if (dialogController.isOpen()) {
        queuedLightroomCorrectionRequests.push(request);
        setMessage(
          "Eine weitere Lightroom-Korrekturanfrage wartet und wird nach dem Schließen dieses Dialogs geöffnet.",
          "warning",
        );
        return false;
      }
      lightroomCorrectionRequest = request;
      correctionSaved = false;
      dialogController.open();
      const snapshots = await refreshSnapshots();
      searchInput.value = cleanText(request.acceptedScientificName);
      const matches = await search(request.acceptedScientificName);
      const exact = lightroomCorrectionResult(request, matches);
      if (!exact) {
        setMessage(
          "Die aus Lightroom übergebene Art stimmt nicht eindeutig mit der aktiven Masterdatenbank überein. Es wurde nichts geändert.",
          "error",
        );
        return false;
      }
      await selectTaxon(String(exact.taxonId));
      const currentVersion = activeMasterVersion(snapshots.master);
      const stale = Boolean(
        cleanText(request.masterVersion)
        && currentVersion
        && cleanText(request.masterVersion) !== currentVersion
      );
      setMessage(
        stale
          ? "Das Lightroom-Suchpaket basiert auf einem älteren Masterstand. Bitte prüfe die aktuellen Namen besonders sorgfältig."
          : "Die aus Lightroom übergebene Art wurde eindeutig im aktiven Masterstand gefunden.",
        stale ? "warning" : "success",
      );
      return true;
    }

    async function confirmReferenceGap(scientificName, button) {
      button.disabled = true;
      try {
        state.taxonomyMaintenanceSnapshot = await fetchJson(
          "/api/taxonomy/project-conflicts/decide",
          {
            method: "POST",
            body: JSON.stringify({
              action: "accept-external-reference-gap",
              scientificName,
            }),
          },
        );
        await loadReview();
        state.refreshTaxonomyMaintenanceStatus?.();
        setMessage(`${scientificName} wurde durch die Masterdatenbank bestätigt.`, "success");
        setActionMessage(`${scientificName} wurde durch die Masterdatenbank bestätigt.`, "success");
      } catch (error) {
        button.disabled = false;
        setMessage(error.message || "Die Projektart konnte nicht bestätigt werden.", "error");
      }
    }

    async function saveCorrection(action, button) {
      if (!selectedDetail) return;
      const selectionVersion = requestVersion;
      const taxonId = selectedResult?.taxonId;
      const view = taxonomyDatabaseDetailPresentation(
        detailPresentation,
        selectedDetail,
        selectedResult,
      );
      const germanName = detail.querySelector("[name='taxonomyDatabaseGerman']")?.value || "";
      const englishName = detail.querySelector("[name='taxonomyDatabaseEnglish']")?.value || "";
      const note = detail.querySelector("[name='taxonomyDatabaseNote']")?.value || "";
      if (
        action === "save"
        && cleanText(germanName) === cleanText(view.germanName)
        && cleanText(englishName) === cleanText(view.englishName)
        && cleanText(note) === cleanText(view.supplement?.note)
      ) {
        setMessage("Es wurde keine geänderte Artbezeichnung eingegeben.", "warning");
        return;
      }
      button.disabled = true;
      try {
        let nextDetail;
        if (action === "save") {
          nextDetail = await fetchJson("/api/taxonomy/corrections/save", {
            method: "POST",
            body: JSON.stringify({
              scientificName: view.scientificName,
              germanName,
              englishName,
              note,
            }),
          });
          if (selectionVersion !== requestVersion) return;
          setMessage(
            "Die Namenskorrektur wurde gespeichert. Weitere Korrekturen können gesammelt werden; „Datenbank aktualisieren“ prüft und aktiviert sie anschließend in wenigen Sekunden gemeinsam für Arten-Explorer und Lightroom.",
            "success",
          );
          correctionSaved = true;
        } else {
          await fetchJson("/api/taxonomy/corrections/reset", {
            method: "POST",
            body: JSON.stringify({ scientificName: view.scientificName }),
          });
          if (selectionVersion !== requestVersion) return;
          nextDetail = await fetchJson(
            `/api/taxonomy/taxa/${encodeURIComponent(taxonId)}`,
          );
          if (selectionVersion !== requestVersion) return;
          setMessage("Die eigene Namenskorrektur wurde zurückgesetzt.", "success");
          correctionSaved = false;
        }
        applySelectedDetail(nextDetail);
        await refreshSnapshots();
        await loadReview();
      } catch (error) {
        if (selectionVersion !== requestVersion) return;
        setMessage(error.message || "Die Namenskorrektur konnte nicht gespeichert werden.", "error");
      } finally {
        button.disabled = false;
      }
    }

    async function saveNamePreference(button, usePrevious = false, useProviderStandard = false) {
      const view = taxonomyDatabaseDetailPresentation(
        detailPresentation,
        selectedDetail,
        selectedResult,
      );
      const germanName = detail.querySelector("[data-name-preference-choice]")?.value;
      const selectionVersion = requestVersion;
      const taxonId = selectedResult?.taxonId;
      const documentRef = button.ownerDocument || global.document;
      const ownedFocus = documentRef?.activeElement === button;
      const selectionIsCurrent = () => selectionVersion === requestVersion
        && taxonId === selectedResult?.taxonId
        && detail.querySelector("[data-name-preference-choice]")?.value === germanName
        && dialogController.isOpen();
      let restoreCancelledFocus = false;
      button.disabled = true;
      try {
        const preview = await fetchJson("/api/taxonomy/name-preference/preview", {
          method: "POST", body: JSON.stringify({ masterTaxonId: view.masterTaxonId, germanName, usePrevious, useProviderStandard }),
        });
        if (!selectionIsCurrent()) return;
        if (preview.requiresConfirmation && !await showQuickConfirm({
          title: useProviderStandard ? "Deutschen Anbieternamen verwenden?" : "Bevorzugten deutschen Namen ändern?",
          message: `Bisher: ${preview.previousGermanName}\nNeu: ${preview.germanName}\n${useProviderStandard ? "Der deutsche Name folgt künftig den Anbieteraktualisierungen. Englische Korrekturen bleiben erhalten.\n" : ""}Diese Namenswahl gilt künftig im Arten-Explorer und in Lightroom. Projektdateien und bestehende Fotos bleiben unverändert.`,
          confirmLabel: useProviderStandard ? "Anbieterstandard verwenden" : "Namenswahl übernehmen",
        })) {
          restoreCancelledFocus = ownedFocus;
          return;
        }
        if (!selectionIsCurrent()) {
          throw new Error("Die Auswahl wurde geändert. Bitte erneut prüfen.");
        }
        const result = await fetchJson("/api/taxonomy/name-preference/save", {
          method: "POST", body: JSON.stringify({ ...preview, confirmed: true }),
        });
        if (selectionVersion !== requestVersion) return;
        if (result.saved) {
          const refreshVersion = requestVersion + 1;
          if (!await selectTaxon(taxonId) || requestVersion !== refreshVersion) return;
        }
        setMessage(result.saved ? "Die Namenswahl ist für Arten-Explorer und Lightroom aktiv." : result.message, result.saved ? "success" : "warning");
      } catch (error) { if (selectionVersion === requestVersion) setMessage(error.message, "error"); }
      finally {
        button.disabled = false;
        if (restoreCancelledFocus && selectionIsCurrent() && button.isConnected && documentRef
            && (documentRef.activeElement === documentRef.body
              || documentRef.activeElement === documentRef.documentElement)) button.focus();
      }
    }

    function setup() {
      elements.taxonomyDatabasePauseButton?.addEventListener("click", () => void pauseMasterBuild());
      elements.taxonomyDatabaseResumeButton?.addEventListener("click", () => void resumeMasterBuild());
      elements.taxonomyDatabaseStorageButton?.addEventListener("click", () => void maintainStorage());
      elements.taxonomyDatabaseBaselineButton?.addEventListener("click", () => void buildBaseline());
      renderOverview();
      elements.taxonomyDatabaseUpdateButton.addEventListener("click", () => void updateDatabase());
      elements.taxonomyDatabaseRollbackButton.addEventListener("click", () => void rollbackDatabase());
      elements.taxonomyDatabaseOpenButton.addEventListener("click", () => dialogController.open());
      searchInput.addEventListener("input", () => {
        lightroomCorrectionRequest = null;
        correctionSaved = false;
        clearTimeout(timer);
        requestVersion += 1;
        if (!shouldScheduleTaxonomyDatabaseSearch(searchInput.value)) {
          searchResults = [];
          selectedResult = null;
          selectedDetail = null;
          renderResults();
          detail.hidden = true;
          detail.innerHTML = "";
          setMessage(cleanText(searchInput.value) ? "Bitte mindestens zwei Zeichen eingeben." : "", "info");
          return;
        }
        timer = setTimeout(() => void search(), SEARCH_DELAY_MS);
      });
      results.addEventListener("click", (event) => {
        const button = event.target.closest("[data-taxonomy-database-taxon]");
        if (button) void selectTaxon(button.dataset.taxonomyDatabaseTaxon);
      });
      detail.addEventListener("click", (event) => {
        const preferenceButton = event.target.closest("[data-name-preference-save]");
        if (preferenceButton) { void saveNamePreference(preferenceButton); return; }
        const previousPreferenceButton = event.target.closest("[data-name-preference-previous]");
        if (previousPreferenceButton) { void saveNamePreference(previousPreferenceButton, true); return; }
        const providerButton = event.target.closest("[data-name-preference-provider]");
        if (providerButton) { void saveNamePreference(providerButton, false, true); return; }
        const button = event.target.closest("[data-taxonomy-database-correction]");
        if (button) {
          void saveCorrection(button.dataset.taxonomyDatabaseCorrection, button);
          return;
        }
        const nextButton = event.target.closest("[data-taxonomy-database-next]");
        if (nextButton?.dataset.taxonomyDatabaseNext === "collect") prepareNextCorrection();
        if (nextButton?.dataset.taxonomyDatabaseNext === "update") updateDatabaseFromCorrection();
      });
      detail.addEventListener("change", (event) => {
        if (!event.target.matches("[data-name-preference-choice]")) return;
        const view = taxonomyDatabaseDetailPresentation(
          detailPresentation,
          selectedDetail,
          selectedResult,
        );
        const saveButton = detail.querySelector("[data-name-preference-save]");
        if (saveButton) saveButton.disabled = cleanText(event.target.value) === cleanText(view.preferredGermanName);
      });
      elements.taxonomyDatabaseReviewList.addEventListener("click", (event) => {
        const confirmButton = event.target.closest("[data-taxonomy-review-confirm]");
        if (confirmButton) {
          void confirmReferenceGap(confirmButton.dataset.taxonomyReviewConfirm, confirmButton);
          return;
        }
        const openButton = event.target.closest("[data-taxonomy-review-open]");
        if (openButton) void openTaxon(openButton.dataset.taxonomyReviewOpen);
      });
      void refreshSnapshots();
    }

    return Object.freeze({
      setup,
      refresh: refreshSnapshots,
      loadReview,
      openCorrectionRequest: showLightroomCorrectionRequest,
    });
  }

  global.SpeciesExplorerTaxonomyDatabase = Object.freeze({
    createTaxonomyDatabaseController,
    lightroomCorrectionResult,
    shouldScheduleTaxonomyDatabaseSearch,
    taxonomyDatabaseDetailPresentation,
    taxonomyDatabaseUpdateDecision,
    masterBuildPresentation,
    assertBuildMayActivate,
  });
})(globalThis);
