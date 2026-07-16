(function initializeSpeciesExplorerLifecycle(global) {
  "use strict";

  const DEFAULT_REVISION_INTERVAL_MS = 5000;

  function editModePresentation(enabled) {
    return {
      pressed: String(Boolean(enabled)),
      label: enabled ? "Bearbeitungsmodus 🔓" : "Lesemodus 🔒",
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
  } = {}) {
    let lifecycleBound = false;

    function applyEditingMode(enabled) {
      state.editMode = Boolean(enabled);
      documentRef.body.classList.toggle("edit-mode", state.editMode);
      const presentation = editModePresentation(state.editMode);
      elements.editModeToggle.setAttribute("aria-pressed", presentation.pressed);
      elements.editModeToggle.textContent = presentation.label;
      elements.editModeToggle.title = presentation.title;
      return presentation;
    }

    function setupEditingMode() {
      elements.editModeToggle.addEventListener("click", () => applyEditingMode(!state.editMode));
      applyEditingMode(false);
    }

    async function refreshExplorerModelOnly({ reload = false } = {}) {
      const snapshot = await loadExplorerSnapshot({
        reload,
        failureMessage: "Lokale Daten konnten nicht aktualisiert werden.",
      });
      state.dataRevision = snapshot.revision.revision;
      state.species = snapshot.species;
      updateSummary(snapshot.summary);
      updateValidation(snapshot.validation);
      updatePendingChanges(snapshot.pendingChanges);
      populateStatusFilter();
      applyFilters();
      return snapshot;
    }

    async function loadData({ reload = false } = {}) {
      state.dataLoading = true;
      elements.reloadButton.disabled = true;
      elements.reloadButton.textContent = "Lädt…";
      try {
        const snapshot = await loadExplorerSnapshot({
          reload,
          failureMessage: "Lokale Daten konnten nicht geladen werden.",
        });
        state.dataRevision = snapshot.revision.revision;
        state.species = snapshot.species;
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
        }
        return snapshot;
      } catch (error) {
        elements.detailPanel.innerHTML = `
          <div class="error-state">
            <h2>Daten konnten nicht geladen werden</h2>
            <p>${escapeHtml(error.message)}</p>
          </div>
        `;
        return null;
      } finally {
        state.dataLoading = false;
        elements.reloadButton.disabled = false;
        elements.reloadButton.textContent = "Aktualisieren";
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
      if (!shouldWarnBeforeUnload({
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
