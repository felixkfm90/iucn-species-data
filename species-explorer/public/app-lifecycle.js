(function initializeSpeciesExplorerLifecycle(global) {
  "use strict";

  const DEFAULT_REVISION_INTERVAL_MS = 5000;

  function editModePresentation(enabled) {
    return {
      pressed: String(Boolean(enabled)),
      label: enabled ? "Bearbeitungsmodus" : "Lesemodus",
      icon: enabled ? "🔓" : "🔒",
      title: enabled
        ? "In den Lesemodus wechseln"
        : "Bearbeitungsfunktionen einblenden",
    };
  }

  function shouldWarnBeforeUnload({
    pendingChanges,
    pipelineStatus,
    backupStatus,
  } = {}) {
    const pipelineActive = pipelineStatus === "running" || pipelineStatus === "awaiting-review";
    const backupActive = backupStatus === "running";
    return Boolean(pendingChanges?.hasPendingChanges) && !pipelineActive && !backupActive;
  }

  function chooseInitialSpecies({
    species = [],
    filtered = [],
    selectedId = "",
    requestedSpeciesId = "",
  } = {}) {
    if (species.some((entry) => entry.id === selectedId)) return selectedId;
    if (species.some((entry) => entry.id === requestedSpeciesId)) return requestedSpeciesId;
    return filtered[0]?.id || species[0]?.id || "";
  }

  function createExplorerLifecycleController({
    state,
    elements,
    documentRef = global.document,
    windowRef = global,
    requestedSpeciesId = "",
    ensureSessionToken,
    loadExplorerSnapshot,
    fetchRevision,
    updateSummary,
    updateValidation,
    updatePendingChanges,
    populateStatusFilter,
    applyFilters,
    renderSpeciesList,
    selectSpecies,
    hasOpenDialog = () => Boolean(documentRef?.querySelector?.("dialog[open]")),
    escapeHtml = (value) => String(value ?? ""),
    setTimeoutImpl = global.setTimeout?.bind(global),
    clearTimeoutImpl = global.clearTimeout?.bind(global),
    revisionIntervalMs = DEFAULT_REVISION_INTERVAL_MS,
    onWorkspaceState = () => {},
  } = {}) {
    let lifecycleBound = false, loadTicket = 0;

    function applyEditingMode(enabled) {
      state.editMode = Boolean(enabled);
      documentRef.body.classList.toggle("edit-mode", state.editMode);
      const presentation = editModePresentation(state.editMode);
      elements.editModeToggle.setAttribute("aria-pressed", presentation.pressed);
      elements.editModeToggle.textContent = presentation.icon;
      elements.editModeToggle.setAttribute("aria-label", presentation.title);
      elements.editModeToggle.title = presentation.title;
      if (elements.editModeStatus) elements.editModeStatus.textContent = presentation.label;
      onWorkspaceState();
      return presentation;
    }

    function setupEditingMode() {
      elements.editModeToggle.addEventListener("click", () => applyEditingMode(!state.editMode));
      applyEditingMode(false);
    }

    async function refreshExplorerModelOnly({ reload = false } = {}) {
      const workspace = state.workspace || "local", epoch = state.workspaceEpoch || 0;
      const snapshot = await loadExplorerSnapshot({
        reload,
        failureMessage: "Lokale Daten konnten nicht aktualisiert werden.",
      });
      if (workspace !== (state.workspace || "local") || epoch !== (state.workspaceEpoch || 0)) throw new Error("Der Artbestand oder die Projektanmeldung wurde während des Ladens gewechselt.");
      state.dataLoadError = "";
      state.dataRevision = snapshot.revision.revision;
      state.species = snapshot.species;
      state.workspaceStatus = snapshot.workspace || null;
      updateSummary(snapshot.summary);
      updateValidation(snapshot.validation);
      updatePendingChanges(snapshot.pendingChanges);
      populateStatusFilter();
      applyFilters();
      onWorkspaceState();
      return snapshot;
    }

    async function loadData({ reload = false } = {}) {
      const ticket = ++loadTicket, workspace = state.workspace || "local", epoch = state.workspaceEpoch || 0;
      const dialogWasOpen = hasOpenDialog();
      state.dataLoading = true;
      state.dataLoadError = "";
      elements.reloadButton.disabled = true;
      elements.reloadButton.textContent = "Lädt…";
      onWorkspaceState();
      try {
        const snapshot = await loadExplorerSnapshot({
          reload,
          failureMessage: "Lokale Daten konnten nicht geladen werden.",
        });
        if (ticket !== loadTicket || workspace !== (state.workspace || "local") || epoch !== (state.workspaceEpoch || 0)) return null;
        if (!dialogWasOpen && hasOpenDialog()) {
          state.pendingRevisionReload = true;
          return null;
        }
        state.dataRevision = snapshot.revision.revision;
        state.species = snapshot.species;
        state.workspaceStatus = snapshot.workspace || null;
        elements.detailPanel.inert = false;
        updateSummary(snapshot.summary);
        updateValidation(snapshot.validation);
        updatePendingChanges(snapshot.pendingChanges);
        populateStatusFilter();
        applyFilters();

        const next = chooseInitialSpecies({
          species: state.species,
          filtered: state.filtered,
          selectedId: state.selectedId,
          requestedSpeciesId,
        });
        if (next) {
          const holdBackgroundDetail = state.holdNewSpeciesBackground && elements.newSpeciesDialog?.open;
          if (holdBackgroundDetail) {
            state.selectedId = next;
            renderSpeciesList();
          } else {
            selectSpecies(next);
          }
        } else {
          elements.detailPanel.innerHTML = `<div class="empty-state"><h2>Keine Art ausgewählt</h2><p>${workspace === "shared-project"
            ? "Der gemeinsame Bestand enthält noch keine vollständig eingerichtete Art. Die Projektverbindung und die vorbereitete Anfangsübernahme findest du unter Gemeinsames Projekt."
            : "Keine Art im ausgewählten Bestand vorhanden."}</p></div>`;
        }
        return snapshot;
      } catch (error) {
        if (ticket !== loadTicket || workspace !== (state.workspace || "local") || epoch !== (state.workspaceEpoch || 0)) return null;
        if (!dialogWasOpen && hasOpenDialog()) {
          state.pendingRevisionReload = true;
          return null;
        }
        state.dataLoadError = error.message;
        if (workspace === "shared-project") {
          state.species = []; state.filtered = []; state.selectedId = "";
          state.workspaceStatus = { source: "shared-project", available: false, permissions: {} };
          renderSpeciesList();
        }
        elements.detailPanel.innerHTML = `
          <div class="error-state">
            <h2>Daten konnten nicht geladen werden</h2>
            <p>${escapeHtml(error.message)}</p>
          </div>
        `;
        return null;
      } finally {
        if (ticket === loadTicket) {
          state.dataLoading = false;
          elements.reloadButton.disabled = false;
          elements.reloadButton.textContent = "Aktualisieren";
          onWorkspaceState();
        }
      }
    }

    async function monitorProjectRevision({ reschedule = true } = {}) {
      try {
        const current = await fetchRevision();
        if (!current) return;
        if (state.dataRevision && current.revision !== state.dataRevision && !state.dataLoading) {
          if (hasOpenDialog()) {
            state.pendingRevisionReload = true;
          } else {
            await loadData();
          }
        } else if (!state.dataRevision) {
          state.dataRevision = current.revision;
        }
      } catch {
        // Der nächste Intervall versucht die Verbindung erneut.
      } finally {
        if (reschedule && typeof setTimeoutImpl === "function") {
          clearTimeoutImpl?.(state.dataRevisionTimer);
          state.dataRevisionTimer = setTimeoutImpl(() => {
            void monitorProjectRevision();
          }, revisionIntervalMs);
        }
      }
    }

    function handleBeforeUnload(event) {
      const uiDrafts = global.SpeciesExplorerCompletionPresentation?.({})?.uiDrafts === true;
      if (!uiDrafts && !shouldWarnBeforeUnload({
        pendingChanges: state.pendingChanges,
        pipelineStatus: state.pipelineStatusSnapshot?.status,
        backupStatus: state.backupStatusSnapshot?.status,
      })) return false;
      event.preventDefault();
      event.returnValue = "";
      return true;
    }

    function bindLifecycleEvents() {
      if (lifecycleBound) return;
      lifecycleBound = true;
      setupEditingMode();
      elements.search.addEventListener("input", applyFilters);
      elements.statusFilter.addEventListener("change", applyFilters);
      elements.flagFilter.addEventListener("change", applyFilters);
      elements.reloadButton.addEventListener("click", () => {
        void loadData({ reload: true });
      });
      windowRef.addEventListener("beforeunload", handleBeforeUnload);
    }

    async function start() {
      bindLifecycleEvents();
      try {
        await ensureSessionToken();
        return await loadData();
      } finally {
        void monitorProjectRevision();
      }
    }

    return Object.freeze({
      applyEditingMode,
      setupEditingMode,
      refreshExplorerModelOnly,
      loadData,
      monitorProjectRevision,
      handleBeforeUnload,
      bindLifecycleEvents,
      start,
    });
  }

  global.SpeciesExplorerLifecycle = Object.freeze({
    DEFAULT_REVISION_INTERVAL_MS,
    editModePresentation,
    shouldWarnBeforeUnload,
    chooseInitialSpecies,
    createExplorerLifecycleController,
  });
})(typeof window !== "undefined" ? window : globalThis);
