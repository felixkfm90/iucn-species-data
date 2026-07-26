(function initializeTaxonomyMaintenance(global) {
  "use strict";

  function releaseLabel(release) {
    if (!release) return "keine installierte Vollversion";
    const name = release.alias || release.version || release.releaseId;
    return release.issued ? `${name} vom ${release.issued.split("-").reverse().join(".")}` : name;
  }

  function conflictText(conflicts, details = []) {
    if (!conflicts) return "";
    const parts = [
      `${conflicts.exact || 0} eindeutig`,
      `${conflicts.suggestions || 0} Umbenennungsvorschläge`,
      `${conflicts.ambiguous || 0} mehrdeutig`,
      `${conflicts.missing || 0} nicht gefunden`,
    ];
    const affected = details
      .map((entry) => {
        const label = entry.germanName || entry.scientificName;
        if (entry.classification === "accepted-name-change") {
          return `${label}: ${entry.scientificName} → ${
            entry.candidate?.scientificName || "neuer akzeptierter Name"
          }`;
        }
        if (entry.classification === "ambiguous") {
          const candidates = (entry.candidates || [])
            .map((candidate) => candidate.scientificName)
            .filter(Boolean)
            .join(" / ");
          return `${label}: mehrdeutig${candidates ? ` (${candidates})` : ""}`;
        }
        return `${label}: nicht gefunden`;
      })
      .join(", ");
    return [
      `Abgleich vorhandener Arten: ${parts.join(" · ")}.`,
      affected ? `Manuell zu prüfen: ${affected}.` : "",
      "Es wurden keine Artdaten automatisch geändert.",
    ].filter(Boolean).join(" ");
  }

  function referenceCountsText(reference) {
    const counts = reference?.counts || {};
    const values = [
      ["taxa", "Taxa"],
      ["scientificNames", "wissenschaftliche Namen"],
      ["vernacularNames", "gebräuchliche Namen"],
    ]
      .filter(([key]) => Number.isFinite(Number(counts[key])))
      .map(([key, label]) => `${Number(counts[key]).toLocaleString("de-DE")} ${label}`);
    return values.length ? values.join(" · ") : "";
  }

  function updateRunKey(status) {
    return [
      String(status?.releaseId || ""),
      String(status?.startedAt || ""),
    ].join("|");
  }

  function updateCompletionKey(status) {
    if (status?.status !== "completed" || status?.action !== "update") return "";
    return [
      String(status.releaseId || ""),
      String(status.startedAt || ""),
      String(status.completedAt || ""),
    ].join("|");
  }

  function createTaxonomyMaintenanceController({
    state,
    elements,
    fetchJson,
    formatBytes,
    showQuickConfirm,
    renderDatabaseStatus,
  } = {}) {
    let preview = null;
    let pollTimer = null;
    let observedUpdateRun = "";
    let acknowledgedCompletion = "";

    function setActionMessage(message, type = "") {
      if (typeof state.setPipelineMessage === "function") {
        state.setPipelineMessage(message, type);
      }
    }

    function showCompletedUpdate(status) {
      if (status.active && status.action === "update") {
        observedUpdateRun = updateRunKey(status);
        return;
      }
      const completionKey = updateCompletionKey(status);
      if (!completionKey || !observedUpdateRun || completionKey === acknowledgedCompletion) return;
      if (updateRunKey(status) !== observedUpdateRun) return;
      acknowledgedCompletion = completionKey;
      observedUpdateRun = "";
      const release = status.reference?.source || status.latest || {
        releaseId: status.releaseId,
      };
      const counts = referenceCountsText(status.reference);
      setActionMessage("Taxonomiereferenz erfolgreich übernommen.", "success");
      void showQuickConfirm({
        eyebrow: "Taxonomiereferenz",
        title: "Neue Datenbank erfolgreich übernommen",
        message: [
          `${releaseLabel(release)} ist jetzt aktiv.`,
          counts ? `Enthalten: ${counts}.` : "",
          status.message,
          "Bestehende Projektdaten wurden nicht automatisch verändert.",
        ].filter(Boolean).join(" "),
        confirmLabel: "Verstanden",
        cancelLabel: "",
      });
    }

    function render(status) {
      state.taxonomyMaintenanceSnapshot = status;
      const active = status.active === true;
      const completedUpdate = status.status === "completed" && status.action === "update";
      const failedUpdate = status.status === "failed" && status.action === "update";
      const reference = status.reference || {};
      const latest = status.latest;
      const activeLabel = reference.available
        ? `${reference.boundedPrototype ? "Testreferenz" : "Aktive Referenz"}: ${
          releaseLabel(reference.source || { releaseId: reference.releaseId })
        }`
        : "Noch keine lokale Taxonomiereferenz installiert.";
      const latestLabel = latest
        ? `Neueste verfügbare Version: ${releaseLabel(latest)}.`
        : status.latestCheckError
          ? `Versionsprüfung nicht möglich: ${status.latestCheckError}`
          : "Neueste Version wird im Hintergrund geprüft…";

      elements.taxonomyMaintenanceSummary.textContent = active
        ? status.message
        : failedUpdate
          ? "Taxonomie-Aktualisierung fehlgeschlagen"
          : completedUpdate
            ? `Taxonomiereferenz erfolgreich übernommen: ${
              releaseLabel(reference.source || { releaseId: status.releaseId })
            }`
            : status.updateAvailable
              ? `Neue Taxonomiereferenz verfügbar: ${releaseLabel(latest)}`
              : activeLabel;
      elements.taxonomyMaintenanceDetail.textContent = active
        ? `${status.message} Die bestehende Referenz bleibt bis zur erfolgreichen Aktivierung erhalten.`
        : failedUpdate
          ? `${status.message} ${status.error || ""}`.trim()
          : completedUpdate
            ? [
              status.message,
              referenceCountsText(reference)
                ? `Enthalten: ${referenceCountsText(reference)}.`
                : "",
              "Bestehende Projektdaten wurden nicht automatisch verändert.",
            ].filter(Boolean).join(" ")
            : `${activeLabel} ${latestLabel}`;

      elements.taxonomyMaintenanceProgress.hidden = !active;
      if (active) {
        if (Number.isFinite(Number(status.progressPercent))) {
          elements.taxonomyMaintenanceProgress.value = Number(status.progressPercent);
        } else {
          elements.taxonomyMaintenanceProgress.removeAttribute("value");
        }
      }

      const conflicts = conflictText(status.conflicts, status.conflictDetails);
      elements.taxonomyMaintenanceConflicts.hidden = !conflicts;
      elements.taxonomyMaintenanceConflicts.textContent = conflicts;

      elements.taxonomyCheckButton.disabled = active;
      elements.taxonomyUpdateButton.disabled = active || !status.updateAvailable;
      elements.taxonomyRollbackButton.disabled = active || !status.rollbackAvailable;
      elements.taxonomyUpdateButton.textContent = status.latestInstalled
        ? "Geprüfte Version aktivieren"
        : "Referenz aktualisieren";

      if (active) renderDatabaseStatus("running");
      else renderDatabaseStatus();

      showCompletedUpdate(status);
      clearTimeout(pollTimer);
      pollTimer = active || (!status.latestCheckedAt && !status.latestCheckError)
        ? setTimeout(refresh, active ? 1000 : 2500)
        : null;
    }

    async function refresh() {
      try {
        render(await fetchJson("/api/taxonomy/status"));
      } catch (error) {
        elements.taxonomyMaintenanceSummary.textContent = "Taxonomiestatus nicht verfügbar";
        elements.taxonomyMaintenanceDetail.textContent = error.message;
      }
    }

    async function createPreview() {
      const result = await fetchJson("/api/taxonomy/update/preview", {
        method: "POST",
        body: "{}",
      });
      preview = result;
      await refresh();
      return result;
    }

    async function checkForUpdate() {
      elements.taxonomyCheckButton.disabled = true;
      setActionMessage("Taxonomiereferenz wird geprüft…", "info");
      try {
        const result = await createPreview();
        setActionMessage(
          result.hasWork
            ? `Neue Taxonomiereferenz verfügbar: ${releaseLabel(result.latest)}.`
            : "Die Taxonomiereferenz ist aktuell.",
          result.hasWork ? "info" : "success",
        );
      } catch (error) {
        setActionMessage(error.message, "error");
        await refresh();
      }
    }

    async function startUpdate() {
      try {
        const result = preview?.hasWork ? preview : await createPreview();
        if (!result.hasWork) {
          setActionMessage("Die Taxonomiereferenz ist bereits aktuell.", "success");
          return;
        }
        const confirmed = await showQuickConfirm({
          eyebrow: "Taxonomiereferenz",
          title: `${releaseLabel(result.latest)} installieren?`,
          message: `${result.warning} Benötigt werden mindestens ${
            formatBytes(result.requiredFreeBytes)
          } freier Speicher. Bestehende Arten werden nur geprüft und niemals automatisch umbenannt.`,
          confirmLabel: "Download und Import starten",
        });
        if (!confirmed) return;
        const status = await fetchJson("/api/taxonomy/update/start", {
          method: "POST",
          body: JSON.stringify({ token: result.token }),
        });
        preview = null;
        render(status);
        setActionMessage(
          "Taxonomie-Aktualisierung läuft. Das Fenster kann geöffnet bleiben; der Fortschritt wird hier angezeigt.",
          "info",
        );
      } catch (error) {
        setActionMessage([error.message, ...(error.details || [])].join(" · "), "error");
        await refresh();
      }
    }

    async function rollback() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomiereferenz",
        title: "Vorherige Version wiederherstellen?",
        message: "Nur die lokale Referenz wird zurückgeschaltet. Arten, Namen, Slugs und Assets bleiben unverändert.",
        confirmLabel: "Vorherige Version wiederherstellen",
      });
      if (!confirmed) return;
      try {
        render(await fetchJson("/api/taxonomy/update/rollback", {
          method: "POST",
          body: "{}",
        }));
        setActionMessage("Vorherige Taxonomiereferenz wurde wiederhergestellt.", "success");
      } catch (error) {
        setActionMessage(error.message, "error");
        await refresh();
      }
    }

    function setup() {
      elements.taxonomyCheckButton.addEventListener("click", () => void checkForUpdate());
      elements.taxonomyUpdateButton.addEventListener("click", () => void startUpdate());
      elements.taxonomyRollbackButton.addEventListener("click", () => void rollback());
      state.refreshTaxonomyMaintenanceStatus = refresh;
      void refresh();
    }

    return Object.freeze({ setup, refresh });
  }

  global.SpeciesExplorerTaxonomyMaintenance = Object.freeze({
    createTaxonomyMaintenanceController,
  });
})(globalThis);
