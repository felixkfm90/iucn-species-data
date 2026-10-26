(function initializeSpeciesExplorerBackupHistory(global) {
  "use strict";

  const KIND_LABELS = Object.freeze({ species: "Artenliste", taxonomy: "Taxonomiebearbeitung" });
  const SCOPE_LABELS = Object.freeze({
    species: "Englischer Name, Größe, Gewicht und Lebenserwartung dieser Art",
    taxonomy: "Manuelle Taxonomie und Begründung dieser Art; ohne damaligen Override heutige automatische Basis",
  });
  const ARCHIVE_CHECKS = Object.freeze({
    "manifest-only": "Prüfverzeichnis vorhanden; Archivinhalt hier nicht neu geprüft",
    historical: "Historisches Prüfverzeichnis; Umfang und Startweg gesondert prüfen",
    "no-manifest": "Kein Prüfverzeichnis vorhanden",
    invalid: "Archiv nicht lesbar oder ungültig",
  });

  function createBackupHistoryController({
    state, elements, documentRef = global.document, fetchJson, createDialogController,
    showQuickConfirm, loadData, escapeHtml, formatDate, formatBytes, backupRetentionText,
  } = {}) {
    const node = (id) => documentRef.querySelector(`#${id}`);
    const dialog = node("backup-history-dialog"), list = node("backup-history-list");
    const title = node("backup-history-title"), message = node("backup-history-message");
    const preview = node("backup-history-preview"), previewContent = node("backup-history-preview-content");
    const save = node("backup-history-save"), refresh = node("backup-history-refresh");
    const archiveDialog = node("backup-archives-dialog"), archives = node("backup-archives-list");
    const archiveMessage = node("backup-archives-message"), archiveRoot = node("backup-archives-root");
    const archiveRefresh = node("backup-archives-refresh");
    let generation = 0, archiveGeneration = 0, selection = 0;
    let speciesId = "", backups = [], candidate = null, phase = "closed", restoring = false;
    let bound = false, archiveLoading = false;

    function setMessage(target, text, type = "info") {
      target.textContent = text;
      target.className = `edit-message ${type}`;
      target.hidden = !text;
    }

    function errorText(error) {
      return [error.message || "Die Anfrage ist fehlgeschlagen.", ...(error.details || [])].join(" · ");
    }

    function dateText(value) {
      return value ? formatDate(value).replace(/^Report /, "") : "Datum nicht belegt";
    }

    function resetPreview() {
      candidate = null;
      preview.hidden = true;
      previewContent.innerHTML = "";
      save.disabled = true;
    }

    function current(ticket, id = speciesId) {
      if (ticket !== generation || !historyController.isOpen()) return false;
      const species = state.species.find((entry) => entry.id === id);
      if (id !== state.selectedId || !state.editMode || !species?.inInput) {
        resetPreview();
        setMessage(message, "Die Artauswahl oder der Bearbeitungsmodus hat sich geändert. Bitte schließen und für die gewünschte Art neu öffnen.", "warning");
        return false;
      }
      return true;
    }

    function renderList() {
      const busy = ["loading", "previewing", "confirming", "restoring"].includes(phase);
      refresh.disabled = busy;
      list.innerHTML = backups.length ? `<table class="backup-history-table">
        <thead><tr><th scope="col">Stand</th><th scope="col">Datum</th><th scope="col">Umfang</th><th scope="col">Auswahl</th></tr></thead>
        <tbody>${backups.map((entry, index) => `<tr>
          <td><strong>${escapeHtml(KIND_LABELS[entry.kind] || "Unbekannter Stand")}</strong></td>
          <td>${escapeHtml(dateText(entry.createdAt))}</td>
          <td>${escapeHtml(SCOPE_LABELS[entry.kind] || entry.label)}<br><small>${escapeHtml(entry.label)} · ${escapeHtml(formatBytes(entry.bytes))}</small></td>
          <td>${entry.available === true && KIND_LABELS[entry.kind]
            ? `<button type="button" data-backup-index="${index}"${busy ? " disabled" : ""}>Stand prüfen</button>`
            : `<span>${escapeHtml(entry.unavailableReason || "Dieser Stand kann nicht wiederhergestellt werden.")}</span>`}</td>
        </tr>`).join("")}</tbody></table>`
        : "<p>Keine gesicherten Bearbeitungsstände für diese Art vorhanden.</p>";
    }

    function invalidateHistory() {
      generation += 1;
      selection += 1;
      phase = "closed";
      resetPreview();
    }

    const historyController = createDialogController({
      dialog, closeButtons: [...dialog.querySelectorAll("[data-history-close]")],
      beforeClose() {
        if (!restoring) {
          invalidateHistory();
          return true;
        }
        setMessage(message, "Die Wiederherstellung läuft. Bitte das Ergebnis abwarten.");
        return false;
      },
      afterClose() {
        // Native close-Ereignisse können erst nach einer unmittelbaren Wiederöffnung eintreffen.
        if (historyController.isOpen()) return;
        if (phase !== "closed") invalidateHistory();
        elements.detailPanel.querySelector("[data-backup-history-open]")?.focus?.();
      },
    });

    const archivesController = createDialogController({
      dialog: archiveDialog, closeButtons: [...archiveDialog.querySelectorAll("[data-archives-close]")],
      beforeClose() {
        archiveGeneration += 1;
        archiveLoading = false;
        return true;
      },
      afterClose() {
        if (archivesController.isOpen()) return;
        archiveGeneration += 1;
        archiveLoading = false;
        elements.pipelineMenuButton?.focus?.();
      },
    });

    async function readHistory() {
      if (restoring || ["loading", "previewing", "confirming"].includes(phase)) return;
      const ticket = ++generation, id = speciesId;
      selection += 1;
      phase = "loading";
      backups = [];
      resetPreview();
      list.innerHTML = "<p>Bearbeitungsstände werden gelesen…</p>";
      refresh.disabled = true;
      setMessage(message, "Bearbeitungsstände werden gelesen…");
      try {
        const result = await fetchJson(`/api/species/${encodeURIComponent(id)}/backups`);
        if (!current(ticket, id)) return;
        if (result.species?.id !== id || !Array.isArray(result.backups)) throw new Error("Die Antwort gehört nicht zu dieser Art oder enthält keine gültige Liste.");
        backups = result.backups;
        phase = "list";
        renderList();
        setMessage(message, "Ein Stand wird erst nach Vorschau und Bestätigung übernommen. Art-ID, deutscher und wissenschaftlicher Name sowie Medien bleiben erhalten.");
      } catch (error) {
        if (!current(ticket, id)) return;
        phase = "list";
        list.innerHTML = "";
        setMessage(message, errorText(error), "error");
      } finally {
        if (ticket === generation && historyController.isOpen()) refresh.disabled = false;
      }
    }

    async function openHistory(id = state.selectedId) {
      if (restoring) return;
      const species = state.species.find((entry) => entry.id === id);
      if (id !== state.selectedId || !state.editMode || !species?.inInput) return;
      // Der Einstieg liegt in den Details. Offene Editoren mit ungespeicherten Eingaben bleiben beim Nutzer.
      if (documentRef.querySelector("dialog[open]:not(#backup-history-dialog)")) return;
      generation += 1;
      speciesId = id;
      phase = "list";
      title.textContent = `Bearbeitungsstände · ${species.germanName}`;
      historyController.open();
      await readHistory();
    }

    async function chooseBackup(index) {
      if (restoring || ["loading", "previewing", "confirming"].includes(phase)) return;
      const ticket = generation, id = speciesId, entry = backups[index];
      if (!current(ticket, id) || !Number.isInteger(index) || entry?.available !== true || !KIND_LABELS[entry.kind]) return;
      const chosen = ++selection;
      resetPreview();
      phase = "previewing";
      renderList();
      setMessage(message, "Ausgewählter Stand wird mit dem heutigen Stand verglichen…");
      try {
        const result = await fetchJson(`/api/species/${encodeURIComponent(id)}/backups/preview`, {
          method: "POST", body: JSON.stringify({ kind: entry.kind, backupId: entry.backupId }),
        });
        if (!current(ticket, id) || chosen !== selection) return;
        if (typeof result.token !== "string" || !result.token || result.species?.id !== id || result.backup?.backupId !== entry.backupId
            || result.backup?.kind !== entry.kind || !Array.isArray(result.changes) || !Array.isArray(result.warnings)) {
          throw new Error("Die Vorschau passt nicht zum ausgewählten Stand. Bitte erneut prüfen.");
        }
        candidate = { ...result, ticket, id, chosen };
        phase = "ready";
        previewContent.innerHTML = `<p><strong>${escapeHtml(KIND_LABELS[entry.kind])}</strong> · ${escapeHtml(dateText(entry.createdAt))}<br>${escapeHtml(entry.label)}</p>
          ${result.changes.length ? `<table class="backup-history-table"><thead><tr><th scope="col">Angabe</th><th scope="col">Heute</th><th scope="col">Nach Wiederherstellung</th></tr></thead>
          <tbody>${result.changes.map((change) => `<tr><th scope="row">${escapeHtml(change.label)}</th><td>${escapeHtml(change.before)}</td><td>${escapeHtml(change.after)}</td></tr>`).join("")}</tbody></table>` : "<p>Dieser Stand bewirkt keine Änderung an den wiederherstellbaren Angaben.</p>"}
          ${result.warnings.length ? `<ul>${result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}`;
        preview.hidden = false;
        save.disabled = result.changes.length === 0;
        renderList();
        setMessage(message, result.changes.length ? "Bitte die Änderungen und Hinweise prüfen. Die Übernahme benötigt noch Ihre Bestätigung." : "Keine Änderung erforderlich.");
      } catch (error) {
        if (!current(ticket, id) || chosen !== selection) return;
        phase = "list";
        resetPreview();
        renderList();
        setMessage(message, errorText(error), "error");
      }
    }

    async function restoreSelected() {
      const plan = candidate;
      if (phase !== "ready" || !plan || !plan.changes.length || !current(plan.ticket, plan.id)) return;
      phase = "confirming";
      save.disabled = true;
      renderList();
      let confirmed;
      try {
        confirmed = await showQuickConfirm({
          eyebrow: "Bearbeitungsstand übernehmen", title: `${plan.species.germanName}: ausgewählten Stand wiederherstellen?`,
          message: `${KIND_LABELS[plan.backup.kind]} vom ${dateText(plan.backup.createdAt)}. ${plan.changes.length} Angabe(n) werden lokal geändert und vorher gesichert. Die Veröffentlichung erfolgt anschließend über „Änderungen übertragen“.`,
          confirmLabel: "Stand wiederherstellen", danger: true,
        });
      } catch (error) {
        if (current(plan.ticket, plan.id) && plan.chosen === selection) {
          phase = "ready";
          save.disabled = false;
          renderList();
          setMessage(message, errorText(error), "error");
        }
        return;
      }
      if (!current(plan.ticket, plan.id) || plan.chosen !== selection || candidate !== plan) return;
      if (!confirmed) {
        phase = "ready";
        save.disabled = false;
        renderList();
        return;
      }
      phase = "restoring";
      restoring = true;
      candidate = null;
      renderList();
      setMessage(message, "Stand wird lokal gesichert und wiederhergestellt…");
      let saved = false;
      try {
        const result = await fetchJson(`/api/species/${encodeURIComponent(plan.id)}/backups/restore`, {
          method: "POST", body: JSON.stringify({ token: plan.token }),
        });
        saved = true;
        state.notice = `${plan.species.germanName}: Bearbeitungsstand wiederhergestellt. ${backupRetentionText(result)} Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht.${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`;
        const snapshot = await loadData({ reload: true });
        if (!snapshot) throw new Error("Der Stand wurde gespeichert; die aktuelle Ansicht konnte noch nicht neu geladen werden.");
        if (current(plan.ticket, plan.id)) {
          preview.hidden = true;
          setMessage(message, state.notice, "success");
        }
      } catch (error) {
        if (current(plan.ticket, plan.id)) {
          setMessage(message, `${saved ? "Wiederherstellung gespeichert. " : "Das Ergebnis der Wiederherstellung ist nicht bestätigt. "}${errorText(error)} Bitte die aktuellen Daten neu laden und den Stand prüfen. Die Schreibanfrage wird nicht automatisch wiederholt.`, "error");
        }
      } finally {
        restoring = false;
        if (plan.ticket === generation && historyController.isOpen()) {
          phase = "list";
          resetPreview();
          renderList();
        }
      }
    }

    async function readArchives() {
      if (archiveLoading) return;
      const ticket = ++archiveGeneration;
      archiveLoading = true;
      archiveRefresh.disabled = true;
      archiveRoot.textContent = "";
      archives.innerHTML = "<p>Archivübersicht wird gelesen…</p>";
      setMessage(archiveMessage, "Archivübersicht wird gelesen…");
      try {
        const result = await fetchJson("/api/backup/archives");
        if (ticket !== archiveGeneration || !archivesController.isOpen()) return;
        if (!Array.isArray(result.archives)) throw new Error("Die Archivübersicht enthält keine gültige Liste.");
        archiveRoot.textContent = result.backupRoot || "Kein Backup-Pfad angegeben";
        archives.innerHTML = result.archives.length ? `<table class="backup-history-table"><thead><tr><th scope="col">Archiv und Pfad</th><th scope="col">Datum</th><th scope="col">Umfang</th><th scope="col">Prüfstatus</th></tr></thead>
          <tbody>${result.archives.map((entry) => `<tr>
            <td><strong>${escapeHtml(entry.name)}</strong><br><code>${escapeHtml(entry.path)}</code></td>
            <td>${escapeHtml(dateText(entry.createdAt))}</td>
            <td>${escapeHtml(entry.scopeLabel || "Umfang nicht belegt")}<br>${Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 ? `${escapeHtml(formatBytes(entry.bytes))} ZIP` : "Umfang unbekannt"}
              ${Number.isSafeInteger(entry.fileCount) ? `<br>${entry.fileCount} Dateien` : ""}
              ${Number.isFinite(entry.contentBytes) ? `<br>${escapeHtml(formatBytes(entry.contentBytes))} unkomprimiert` : ""}</td>
            <td>${escapeHtml(ARCHIVE_CHECKS[entry.integrityStatus] || "Prüfstatus unbekannt")}${entry.readable === false ? "<br>Kein verwendbarer Lesezugriff" : ""}
              ${entry.warning ? `<p>${escapeHtml(entry.warning)}</p>` : ""}</td>
          </tr>`).join("")}</tbody></table>` : "<p>Keine NAS-Archive im eingestellten Backup-Ordner vorhanden.</p>";
        setMessage(archiveMessage, result.warning || "Diese Übersicht liest nur Archivinformationen. Sie bestätigt weder aktuelle Datei-Prüfsummen noch eine erfolgreiche Wiederherstellung.", result.warning ? "warning" : "info");
      } catch (error) {
        if (ticket !== archiveGeneration || !archivesController.isOpen()) return;
        archives.innerHTML = "";
        setMessage(archiveMessage, errorText(error), "error");
      } finally {
        if (ticket === archiveGeneration) {
          archiveLoading = false;
          archiveRefresh.disabled = false;
        }
      }
    }

    async function openArchives() {
      if (restoring) return;
      // Bestehende Menü-/Einstellungsdialoge über deren Schließen-Schaltfläche verlassen.
      for (const [parent, closeSelector] of [[elements.pipelineDialog, ".pipeline-cancel"], [elements.settingsDialog, ".settings-cancel"]]) {
        if (!parent?.open) continue;
        parent.querySelector(closeSelector)?.click();
        if (parent.open) return;
      }
      if (documentRef.querySelector("dialog[open]:not(#backup-archives-dialog)")) return;
      archivesController.open();
      await readArchives();
    }

    function bind() {
      if (bound) return;
      bound = true;
      elements.detailPanel.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-backup-history-open]");
        if (button && elements.detailPanel.contains(button)) void openHistory(button.dataset.backupHistoryOpen);
      });
      list.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-backup-index]");
        if (button && list.contains(button) && !button.disabled) void chooseBackup(Number(button.dataset.backupIndex));
      });
      refresh.addEventListener("click", () => { void readHistory(); });
      save.addEventListener("click", () => { void restoreSelected(); });
      archiveRefresh.addEventListener("click", () => { void readArchives(); });
      for (const button of documentRef.querySelectorAll("[data-backup-archives-open]")) {
        button.addEventListener("click", () => { void openArchives(); });
      }
    }

    bind();
    return Object.freeze({ openHistory, readHistory, chooseBackup, restoreSelected, openArchives, readArchives });
  }

  global.SpeciesExplorerBackupHistory = Object.freeze({ createBackupHistoryController });
})(globalThis);
