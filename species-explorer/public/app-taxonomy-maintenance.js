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
      `${conflicts.referenceGaps || 0} Referenzlücken`,
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
        if (entry.classification === "reference-gap") {
          return `${label}: Artstufe fehlt in CoL, zugehörige Unterarten sind vorhanden`;
        }
        return `${label}: nicht gefunden`;
      })
      .join(", ");
    return [
      `Abgleich vorhandener Arten: ${parts.join(" · ")}.`,
      affected ? `Manuell zu prüfen: ${affected}.` : "",
      "Es wurden keine Artdaten automatisch geändert.",
    ].filter(Boolean).join("\n");
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
    const skippedUnknownTaxa = Number(counts.vernacularNamesSkippedUnknownTaxa);
    if (Number.isFinite(skippedUnknownTaxa) && skippedUnknownTaxa > 0) {
      values.push(
        `${skippedUnknownTaxa.toLocaleString("de-DE")} nicht zuordenbare Namen übersprungen`,
      );
    }
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
    let startupOfferEnabled = false;
    let startupOfferHandled = false;
    let startupOfferPending = false;

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
      const catalogueChanged = status.updateCatalogue === true;
      setActionMessage(
        catalogueChanged
          ? "Taxonomiedatenbank erfolgreich aktualisiert."
          : "Namensbestand erfolgreich aktualisiert.",
        "success",
      );
      void showQuickConfirm({
        eyebrow: "Taxonomiedatenbank",
        title: catalogueChanged
          ? "Neue Datenbank erfolgreich übernommen"
          : "Namensbestand erfolgreich aktualisiert",
        message: [
          catalogueChanged ? `${releaseLabel(release)} ist jetzt aktiv.` : "",
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
        ? "Datenbank aktuell"
        : "Noch keine lokale Taxonomiedatenbank installiert.";
      const latestLabel = latest
        ? `Neueste verfügbare Version: ${releaseLabel(latest)}.`
        : status.latestCheckError
          ? `Versionsprüfung nicht möglich: ${status.latestCheckError}`
          : "Neueste Version wird im Hintergrund geprüft…";

      elements.taxonomyMaintenanceSummary.textContent = active
        ? "Taxonomiedatenbank wird aktualisiert"
        : failedUpdate
          ? "Taxonomie-Aktualisierung fehlgeschlagen"
          : completedUpdate
            ? status.updateCatalogue
              ? "Taxonomiedatenbank erfolgreich aktualisiert"
              : "Namensbestand erfolgreich aktualisiert"
            : activeLabel;
      elements.taxonomyMaintenanceDetail.textContent = active
        ? "Die bestehende Referenz bleibt bis zur erfolgreichen Aktivierung erhalten."
        : failedUpdate
          ? `${status.message} ${status.error || ""}`.trim()
          : completedUpdate
            ? [
              status.message,
              "Bestehende Projektdaten wurden nicht automatisch verändert.",
            ].filter(Boolean).join(" ")
            : latestLabel;

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
      elements.taxonomyUpdateButton.textContent = status.catalogueUpdateAvailable
        ? status.latestInstalled
          ? "Geprüfte Version übernehmen"
          : "Datenbank aktualisieren"
        : status.supplementUpdateAvailable
          ? "Namensbestand aktualisieren"
          : "Datenbank aktualisieren";

      if (active) renderDatabaseStatus("running");
      else renderDatabaseStatus();

      showCompletedUpdate(status);
      void maybeOfferStartupUpdate(status);
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

    async function beginUpdate(result) {
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
    }

    async function maybeOfferStartupUpdate(status) {
      if (
        !startupOfferEnabled
        || startupOfferHandled
        || startupOfferPending
        || status.active
        || !status.updateAvailable
        || !status.latest
        || !status.latestCheckedAt
      ) {
        return;
      }
      startupOfferPending = true;
      try {
        const result = preview?.hasWork ? preview : await createPreview();
        if (!result.hasWork) return;
        const hasReference = status.reference?.available === true;
        const confirmed = await showQuickConfirm({
          eyebrow: "Taxonomiedatenbank",
          title: result.updateCatalogue
            ? hasReference
              ? "Taxonomiedatenbank ist veraltet"
              : "Keine Taxonomiedatenbank installiert"
            : "Namensbestand ist veraltet",
          message: [
            result.updateCatalogue && hasReference
              ? `${releaseLabel(result.latest)} ist verfügbar.`
              : result.updateCatalogue
                ? `${releaseLabel(result.latest)} kann jetzt installiert werden.`
                : "",
            result.warning,
            result.updateCatalogue
              ? `Benötigt werden mindestens ${formatBytes(result.requiredFreeBytes)} freier Speicher.`
              : "",
            "Bestehende Arten werden nur geprüft und niemals automatisch umbenannt.",
          ].filter(Boolean).join(" "),
          confirmLabel: "Jetzt aktualisieren",
          cancelLabel: "Später",
        });
        if (confirmed) {
          await beginUpdate(result);
        } else {
          setActionMessage(
            "Die Taxonomiedatenbank kann später unter „Datenbank-Aktionen“ aktualisiert werden.",
            "info",
          );
        }
      } catch (error) {
        setActionMessage([error.message, ...(error.details || [])].join(" · "), "error");
      } finally {
        startupOfferHandled = true;
        startupOfferPending = false;
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
      setActionMessage("Taxonomiedatenbank wird geprüft…", "info");
      try {
        const result = await createPreview();
        setActionMessage(
          result.hasWork
            ? result.updateCatalogue
              ? `Neuere Datenbankversion verfügbar: ${releaseLabel(result.latest)}.`
              : "Ein neuer Namensbestand ist verfügbar."
            : "Die Taxonomiedatenbank ist aktuell.",
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
          setActionMessage(
            "Die Taxonomiedatenbank ist bereits aktuell.",
            "success",
          );
          return;
        }
        const confirmed = await showQuickConfirm({
          eyebrow: "Taxonomiedatenbank",
          title: result.updateCatalogue
            ? `${releaseLabel(result.latest)} installieren?`
            : "Namensbestand aktualisieren?",
          message: [
            result.warning,
            result.updateCatalogue
              ? `Benötigt werden mindestens ${formatBytes(result.requiredFreeBytes)} freier Speicher.`
              : "",
            "Bestehende Arten werden nur geprüft und niemals automatisch umbenannt.",
          ].filter(Boolean).join(" "),
          confirmLabel: result.updateCatalogue
            ? "Download und Import starten"
            : "Namensbestand aktualisieren",
        });
        if (!confirmed) return;
        await beginUpdate(result);
      } catch (error) {
        setActionMessage([error.message, ...(error.details || [])].join(" · "), "error");
        await refresh();
      }
    }

    async function rollback() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomiedatenbank",
        title: "Vorherigen Grunddatenstand wiederherstellen?",
        message: "Der lokale Grunddatenstand wird zurückgeschaltet. Arten, Namen, Slugs und Assets bleiben unverändert.",
        confirmLabel: "Grunddatenstand wiederherstellen",
      });
      if (!confirmed) return;
      try {
        render(await fetchJson("/api/taxonomy/update/rollback", {
          method: "POST",
          body: "{}",
        }));
        setActionMessage("Vorheriger Grunddatenstand wurde wiederhergestellt.", "success");
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
      startupOfferEnabled = true;
      void refresh();
    }

    return Object.freeze({ setup, refresh });
  }

  global.SpeciesExplorerTaxonomyMaintenance = Object.freeze({
    conflictText,
    createTaxonomyMaintenanceController,
  });
})(globalThis);
