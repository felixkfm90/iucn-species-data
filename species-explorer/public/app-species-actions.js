(function initializeSpeciesExplorerSpeciesActions(global) {
  "use strict";

  function refreshConfirmation(species = {}) {
    const germanName = String(species.germanName || "diese Art");
    return Object.freeze({
      eyebrow: "Art aktualisieren",
      title: "Automatische Aktualisierung",
      message: `Automatische Aktualisierung für ${germanName} wirklich ausführen?`,
      confirmLabel: "Ja, aktualisieren",
      cancelLabel: "Abbrechen",
    });
  }

  function deleteModePresentation(permanent) {
    return Object.freeze(permanent
      ? {
          confirmLabel: "Art und Daten dauerhaft löschen",
          warning:
            "Dauerhaft: Generierte Daten, Assetordner und zugehörige Pflegeinformationen "
            + "werden sofort gelöscht und sind nicht wiederherstellbar.",
          danger: true,
        }
      : {
          confirmLabel: "Aus Artenliste entfernen",
          warning:
            "Ohne Auswahl bleiben generierte Daten und Assets bis zum separaten Bereinigungslauf bestehen.",
          danger: false,
        });
  }

  function deleteSuccessNotice(result = {}, backupRetentionText = () => "") {
    const deletedName = result.deleted?.germanName || "Die Art";
    return (
      (result.inputEntryRemoved
        ? `${deletedName} wurde aus der Eingabeliste entfernt.`
        : `${deletedName} war bereits aus der Eingabeliste entfernt.`)
      + (result.backup ? ` Sicherung: ${result.backup}.` : "")
      + backupRetentionText(result)
      + (result.permanentCleanup
        ? " Generierte Daten und Assetordner wurden dauerhaft gelöscht."
        : ` Assetordner bleibt erhalten: ${result.assetDirectoryPreserved}.`)
      + (result.pipelineRequired
        ? " Ein Pipeline- oder Bereinigungslauf entfernt die Art aus den generierten Daten."
        : "")
    );
  }

  function createSpeciesActionsController({
    state,
    elements,
    fetchJson,
    showQuickConfirm,
    createDialogController,
    escapeHtml,
    backupRetentionText,
    releaseDetailMedia,
    loadData,
    documentRef = global.document,
    releaseMediaWithin = () => {},
    delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {}) {
    if (!state || !elements?.detailPanel) {
      throw new TypeError("Artaktionen benötigen Zustand und Detailbereich.");
    }
    for (const [name, dependency] of Object.entries({
      fetchJson,
      showQuickConfirm,
      createDialogController,
      escapeHtml,
      backupRetentionText,
      releaseDetailMedia,
      loadData,
      delay,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Artaktionen benötigen die Funktion ${name}.`);
      }
    }
    let renderApprovalState = () => {};

    function setupSpeciesRefresh(species) {
      const openButton = elements.detailPanel.querySelector(".refresh-species-open");
      if (!openButton) return null;
      const onRefresh = async () => {
        if (!state.openPipelinePreview) return;
        const confirmed = await showQuickConfirm(refreshConfirmation(species));
        if (!confirmed) return;
        openButton.disabled = true;
        try {
          const result = await state.openPipelinePreview("all", {
            targetSlugs: [species.id],
            silent: true,
            speciesRefresh: true,
          });
          if (result?.noWork) {
            await showQuickConfirm({
              title: "Keine Aktualisierung gestartet",
              message: result.message,
              confirmLabel: "OK",
              cancelLabel: "",
            });
          }
        } catch (error) {
          await showQuickConfirm({
            title: "Aktualisierung konnte nicht gestartet werden",
            message: error.message,
            confirmLabel: "OK",
            cancelLabel: "",
          });
        } finally {
          openButton.disabled = false;
        }
      };
      openButton.addEventListener("click", onRefresh);
      return Object.freeze({ openButton, onRefresh });
    }

    function setupSpeciesDelete(species) {
      const dialog = elements.detailPanel.querySelector(".delete-dialog");
      const openButton = elements.detailPanel.querySelector(".delete-species-open");
      const form = elements.detailPanel.querySelector(".delete-form");
      const message = elements.detailPanel.querySelector(".delete-message");
      const effects = elements.detailPanel.querySelector(".delete-effects");
      const deleteAssetsOption = elements.detailPanel.querySelector(".delete-assets-now");
      const deleteWarning = elements.detailPanel.querySelector(".delete-assets-warning");
      const confirmButton = elements.detailPanel.querySelector(".delete-confirm");
      const cancelButtons = [...elements.detailPanel.querySelectorAll(".delete-cancel")];
      if (
        !dialog
        || !openButton
        || !form
        || !message
        || !effects
        || !deleteAssetsOption
        || !deleteWarning
        || !confirmButton
      ) return null;
      let previewToken = "";

      const setMessage = (text = "", type = "") => {
        message.textContent = text;
        message.className = `edit-message delete-message${type ? ` ${type}` : ""}`;
        message.hidden = !text;
      };
      const dialogController = createDialogController({ dialog, closeButtons: cancelButtons });
      const close = () => dialogController.close("programmatic");
      const updateDeleteMode = () => {
        const presentation = deleteModePresentation(deleteAssetsOption.checked);
        confirmButton.textContent = presentation.confirmLabel;
        deleteWarning.textContent = presentation.warning;
        deleteWarning.classList.toggle("danger", presentation.danger);
      };

      const openPreview = async () => {
        previewToken = "";
        deleteAssetsOption.checked = false;
        updateDeleteMode();
        confirmButton.disabled = true;
        effects.replaceChildren();
        setMessage("Auswirkungen werden geprüft…", "info");
        dialogController.open();
        try {
          const result = await fetchJson(
            `/api/species/${encodeURIComponent(species.id)}/delete/preview`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            },
          );
          previewToken = result.token;
          effects.innerHTML = `<ul>${result.effects.map((effect) => `<li>${escapeHtml(effect)}</li>`).join("")}</ul>`;
          if (result.requiresAssetDeletion) {
            deleteAssetsOption.checked = true;
            deleteAssetsOption.disabled = true;
          } else {
            deleteAssetsOption.disabled = !result.assetDirectoryExists && !species.inGenerated;
          }
          updateDeleteMode();
          confirmButton.disabled = false;
          setMessage("Löschvorschau ist bereit.", "success");
        } catch (error) {
          setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        }
      };

      const saveDeletion = async (event) => {
        event.preventDefault();
        if (!previewToken) return;
        const deleteAssets = deleteAssetsOption.checked;
        releaseDetailMedia();
        if (deleteAssets) await delay(800);
        confirmButton.disabled = true;
        setMessage(
          deleteAssets
            ? "Art, generierte Daten und Assets werden dauerhaft gelöscht…"
            : "Art wird aus der Eingabeliste entfernt…",
          "info",
        );
        try {
          const result = await fetchJson(
            `/api/species/${encodeURIComponent(species.id)}/delete/save`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: previewToken, deleteAssets }),
            },
          );
          state.notice = deleteSuccessNotice(result, backupRetentionText);
          state.selectedId = "";
          close();
          await loadData();
        } catch (error) {
          setMessage([error.message, ...(error.details || [])].join(" · "), "error");
          confirmButton.disabled = false;
        }
      };

      openButton.addEventListener("click", openPreview);
      deleteAssetsOption.addEventListener("change", updateDeleteMode);
      form.addEventListener("submit", saveDeletion);
      return Object.freeze({
        openButton,
        openPreview,
        saveDeletion,
        updateDeleteMode,
      });
    }

    function setupSpeciesApproval(species) {
      renderApprovalState = () => {};
      const dialog = elements.detailPanel.querySelector(".species-approval-dialog"), openButton = elements.detailPanel.querySelector(".species-approval-open");
      if (!dialog || !openButton || species.source !== "shared-project" || !species.canApprove) return null;
      const content = dialog.querySelector(".species-approval-content"), message = dialog.querySelector(".species-approval-message");
      const prepare = dialog.querySelector(".species-approval-preview"), apply = dialog.querySelector(".species-approval-confirm");
      const closes = [...dialog.querySelectorAll(".species-approval-close")];
      const sourceEpoch = state.workspaceEpoch || 0, base = `/api/shared-project/species/${encodeURIComponent(species.id)}`;
      let token = "", reviewedRevision = "", busy = false, generation = 0;
      const sameSource = () => state.workspace === "shared-project" && (state.workspaceEpoch || 0) === sourceEpoch
        && state.selectedId === species.id && state.workspaceStatus?.sourceScope === species.sourceScope;
      const permitted = () => sameSource() && state.editMode && state.workspaceStatus?.connection === "online"
        && state.workspaceStatus?.permissions?.canApprove === true;
      const controller = createDialogController({ dialog, closeButtons: closes, beforeClose: () => !busy,
        afterClose: () => { generation++; token = ""; reviewedRevision = ""; releaseMediaWithin(content); } });
      function controls() {
        openButton.disabled = busy || !permitted(); prepare.disabled = busy || !permitted(); apply.disabled = busy || !permitted() || !token;
        for (const button of closes) button.disabled = busy;
      }
      const create = (tag, text) => { const element = documentRef.createElement(tag); element.textContent = String(text ?? ""); return element; };
      function renderPreview(value) {
        const shown = value.species, reader = value.readerSpecies, data = create("dl");
        releaseMediaWithin(content);
        content.replaceChildren(create("h3", shown.germanName), create("p", `${shown.scientificName} · Fassung ${shown.ordinal}`));
        for (const [label, text] of [["Englischer Name", shown.englishName], ["Größe", shown.manual?.size], ["Gewicht", shown.manual?.weight], ["Lebenserwartung", shown.manual?.lifeExpectancy]]) {
          data.append(create("dt", label), create("dd", text || "Nicht erfasst"));
        }
        content.append(data);
        const taxonomy = create("details"), taxa = create("dl"); taxonomy.append(create("summary", "Taxonomie im Nachschlagewerk"), taxa);
        const ranks = { kingdom: "Reich", phylum: "Stamm", subphylum: "Unterstamm", class: "Klasse", order: "Ordnung", family: "Familie", genus: "Gattung", species: "Art" };
        for (const taxon of reader.taxonomy) taxa.append(create("dt", ranks[String(taxon.rank).toLowerCase()] || taxon.rank), create("dd", taxon.name));
        content.append(taxonomy);
        const sections = create("details"); sections.append(create("summary", "Texte im Nachschlagewerk"));
        for (const section of reader.sections) {
          const text = create("p", section.intentionallyEmpty ? "Bewusst leer gelassen" : section.text || "Kein Text erfasst"); text.className = "shared-project-text";
          sections.append(create("h4", section.title), text);
        }
        content.append(sections);
        const media = create("details"); media.append(create("summary", "Bilder und Ton im Nachschlagewerk"));
        const mediaUrl = (url) => typeof url === "string" && /^https:\/\/[^/@\s]+(?:\/|$)/.test(url) ? url : "";
        function image(file, title) {
          const url = mediaUrl(file?.url); if (!url) return;
          const figure = create("figure"), img = create("img"); img.src = url; img.alt = file.alt || title; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
          figure.append(img, create("figcaption", file.caption || title));
          if (file.attribution) figure.append(create("p", file.attribution)); media.append(figure);
        }
        image(reader.media.portrait, "Artporträt"); image(reader.media.map, "Verbreitungskarte");
        for (const file of reader.media.gallery) image(file, file.alt || "Galeriebild");
        for (const file of reader.media.sounds) {
          const url = mediaUrl(file.url); if (!url) continue;
          const audio = create("audio"); audio.src = url; audio.controls = true; audio.preload = "none";
          media.append(create("p", file.attribution || "Tierstimme"), audio);
        }
        if (media.children.length === 1) media.append(create("p", "Für diese Fassung sind keine Bilder oder Tonquellen gebunden."));
        content.append(media);
        const hints = [...(value.warnings || []), ...(shown.dataIssues || []), ...(shown.assetIssues || [])];
        if (hints.length) {
          const details = create("details"), list = create("ul"); details.append(create("summary", `Prüfhinweise (${hints.length})`), list);
          for (const hint of hints) list.append(create("li", hint)); content.append(details);
        }
      }
      async function previewApproval() {
        if (busy || !permitted()) return;
        const request = ++generation; token = ""; reviewedRevision = ""; busy = true; controls(); message.textContent = "Die angezeigte Fassung wird geprüft…";
        try {
          const result = await fetchJson(`${base}/approval/preview`, { method: "POST", body: JSON.stringify({ sourceScope: species.sourceScope,
            expectedEditRevision: species.editRevision, expectedRevision: species.revision }) });
          if (request !== generation || !permitted()) { message.textContent = "Artbestand oder Berechtigung wurde geändert. Bitte die Ansicht schließen und die Art erneut öffnen."; return; }
          if (typeof result?.token !== "string" || !result.token || result.sourceScope !== species.sourceScope || result.species?.id !== species.id
            || result.species.revision !== species.revision || result.readerSpecies?.id !== species.id || !Array.isArray(result.readerSpecies.sections)
            || !Array.isArray(result.readerSpecies.taxonomy) || !Array.isArray(result.readerSpecies.media?.gallery)
            || !Array.isArray(result.readerSpecies.media?.sounds)) throw new Error("Die geprüfte Artfassung ist nicht eindeutig bestätigt.");
          renderPreview(result); token = result.token; reviewedRevision = result.species.revision;
          message.textContent = "Bitte die Fassung prüfen und die interne Freigabe bestätigen.";
        } catch (error) { token = ""; reviewedRevision = ""; if (request === generation) message.textContent = `${error.message} Bitte bei geändertem Serverstand zuerst „Serverstand lesen“ verwenden und die Art erneut öffnen.`; }
        finally { busy = false; controls(); }
      }
      async function approve() {
        if (busy || !token || !permitted()) return;
        const reviewedToken = token, revision = reviewedRevision, request = generation; token = ""; busy = true; controls();
        message.textContent = "Die geprüfte Fassung wird intern freigegeben…";
        try {
          const result = await fetchJson(`${base}/approval/approve`, { method: "POST", body: JSON.stringify({ token: reviewedToken }) });
          if (request !== generation || !permitted()) { message.textContent = "Artbestand oder Berechtigung wurde geändert. Bitte den aktuellen Stand bewusst neu laden."; return; }
          if (result?.approved !== true || result.serverConfirmed !== true || result.reviewedRevision !== revision || result.approvedRevision !== revision
            || result.sourceScope !== species.sourceScope || result.externalPublication !== "not-performed"
            || typeof result.hasNewerLocalChanges !== "boolean") throw new Error("Die interne Freigabe wurde nicht eindeutig bestätigt.");
          state.notice = result.hasNewerLocalChanges ? "Die geprüfte Fassung ist intern freigegeben. Neuere lokale Änderungen bleiben ungeprüft erhalten."
            : "Die geprüfte Artfassung ist für Projektleser und das Nachschlagewerk intern freigegeben.";
          busy = false; controls(); controller.close("approved"); await loadData();
        } catch (error) { if (request === generation) message.textContent = `${error.message} Keine automatische Wiederholung. Bitte den Serverstand lesen und die Fassung erneut prüfen.`; }
        finally { busy = false; controls(); }
      }
      openButton.addEventListener("click", () => { if (!busy && permitted()) { content.replaceChildren(); controller.open(); void previewApproval(); } });
      prepare.addEventListener("click", () => { void previewApproval(); }); apply.addEventListener("click", () => { void approve(); });
      renderApprovalState = controls; controls(); return Object.freeze({ openButton, previewApproval, approve });
    }

    return Object.freeze({ setupSpeciesRefresh, setupSpeciesDelete, setupSpeciesApproval, renderSpeciesActions: () => renderApprovalState() });
  }

  global.SpeciesExplorerSpeciesActions = Object.freeze({
    refreshConfirmation,
    deleteModePresentation,
    deleteSuccessNotice,
    createSpeciesActionsController,
  });
})(globalThis);
