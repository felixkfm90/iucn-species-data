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
    openAiSuggestion,
    reviewLanguage,
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
      const prepareLabel = prepare?.textContent || "Vorschau erneut laden";
      const closes = [...dialog.querySelectorAll(".species-approval-close")];
      const sourceEpoch = state.workspaceEpoch || 0, base = `/api/shared-project/species/${encodeURIComponent(species.id)}`;
      let token = "", reviewedRevision = "", busy = false, generation = 0, reviewOwner = "", readerVersion = 1;
      let missingMedia = [], mediaPreparation = null, provideButton = null, alreadyApproved = false;
      const sameSource = () => state.workspace === "shared-project" && (state.workspaceEpoch || 0) === sourceEpoch
        && state.selectedId === species.id && state.workspaceStatus?.sourceScope === species.sourceScope;
      const permitted = () => sameSource() && state.editMode && state.workspaceStatus?.connection === "online"
        && state.workspaceStatus?.permissions?.canApprove === true && state.workspaceStatus?.readOnlySession !== true
        && (!state.workspaceStatus?.user?.role || ["admin", "publisher"].includes(state.workspaceStatus.user.role));
      const owner = () => JSON.stringify([state.workspace, state.workspaceEpoch || 0, state.selectedId, state.workspaceStatus?.sourceScope,
        state.editMode, state.workspaceStatus?.connection, state.workspaceStatus?.readOnlySession, state.workspaceStatus?.permissions,
        state.workspaceStatus?.user?.id, state.workspaceStatus?.user?.role]);
      const current = (request, binding) => request === generation && permitted() && owner() === binding;
      const controller = createDialogController({ dialog, closeButtons: closes, beforeClose: () => !busy,
        afterClose: () => { generation++; token = ""; reviewedRevision = ""; reviewOwner = ""; readerVersion = 1; provideButton = null; releaseMediaWithin(content); content.replaceChildren(); } });
      function controls() {
        if (!permitted() || reviewOwner && reviewOwner !== owner()) {
          if (!sameSource() || reviewOwner && reviewOwner !== owner()) readerVersion = 1;
          token = ""; reviewedRevision = ""; reviewOwner = ""; missingMedia = []; mediaPreparation = null; provideButton = null;
          releaseMediaWithin(content); content.replaceChildren();
        }
        openButton.disabled = busy || !permitted(); prepare.disabled = busy || !permitted(); apply.disabled = busy || !permitted() || !token || missingMedia.length > 0 || alreadyApproved;
        if (provideButton) provideButton.disabled = busy || !permitted() || !token || reviewOwner !== owner();
        for (const button of closes) button.disabled = busy;
      }
      const create = (tag, text) => { const element = documentRef.createElement(tag); element.textContent = String(text ?? ""); return element; };
      const slots = { "portrait.webp": "Artporträt", "map.jpg": "Verbreitungskarte", "sound.mp3": "Tierstimme", "spectrogram.webp": "Stimmenspektrogramm" };
      function bytesText(bytes) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`; }
      function richBlocks(parent, blocks) {
        for (const block of Array.isArray(blocks) ? blocks : []) {
          if (Array.isArray(block.items)) {
            const list = create(block.type === "numbered-list" ? "ol" : "ul");
            for (const item of block.items) if (typeof item === "string") list.append(create("li", item)); parent.append(list);
          } else if (typeof block.text === "string") { const text = create(block.type === "heading" ? "h5" : "p", block.text); text.className = "shared-project-text"; parent.append(text); }
        }
      }
      function readerSources(parent, sources) {
        if (!Array.isArray(sources) || !sources.length) return;
        const list = create("ul");
        for (const source of sources) if (typeof source.label === "string") list.append(create("li", `${source.label}${typeof source.url === "string" ? ` · ${source.url}` : ""}`));
        parent.append(create("h5", "Quellen"), list);
      }
      function readerContent(parent, reader) {
        const details = create("details"), value = reader.content;
        details.append(create("summary", "Texte und Quellen im Nachschlagewerk"));
        if (value.kind === "legacy-sections") {
          for (const section of value.sections) { const text = create("p", section.intentionallyEmpty ? "Bewusst leer gelassen" : section.text || "Kein Text erfasst"); text.className = "shared-project-text"; details.append(create("h4", section.title), text); }
        } else {
          details.append(create("h4", value.title));
          if (value.introduction.length) { details.append(create("h5", "Einleitung")); richBlocks(details, value.introduction); }
          for (const section of value.sections) {
            details.append(create("h4", section.title));
            if (!section.requested) details.append(create("p", "Nicht vorgesehen"));
            richBlocks(details, section.blocks); readerSources(details, section.sources);
            if (section.intentionallyEmpty) details.append(create("p", "Bewusst leer gelassen"));
            else if (!section.blocks.length && section.kind === "editorial") details.append(create("p", "Kein Text erfasst"));
            else if (section.kind === "general-module") details.append(create("p", "Artgrunddaten aus dieser geprüften Fassung"));
          }
          readerSources(details, value.sources);
        }
        parent.append(details);
      }
      function readerMedia(parent, reader, mediaUrl) {
        const details = create("details"); details.append(create("summary", "Bilder, Bildtexte und Ton im Nachschlagewerk"));
        function image(reference, title, usage, requested = true) {
          if (!reference) return;
          const card = create("section"); card.append(create("h4", title));
          if (!requested) card.append(create("p", "Nicht vorgesehen"));
          if (reference.kind === "public-https" && mediaUrl(reference.url)) {
            const figure = create("figure"), img = create("img"); img.src = reference.url; img.alt = usage?.alt || title; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
            figure.append(img); card.append(figure);
          } else card.append(create("p", reference.kind === "unavailable" ? requested ? "Datei noch nicht bereitgestellt" : "Keine Bereitstellung für diese Verwendung erforderlich" : "Datei im gemeinsamen Projekt bereitgestellt"));
          if (usage) {
            card.append(create("p", usage.decorative ? "Bewusst dekorativ" : `Alternativtext: ${usage.alt || "Kein Text erfasst"}`),
              create("p", `Bildunterschrift: ${usage.caption || "Keine erfasst"}`));
          }
          if (reference.attribution) card.append(create("p", reference.attribution)); details.append(card);
        }
        image(reader.media.portrait, "Artporträt");
        const structured = reader.content.kind === "structured", mapRequested = !structured || reader.content.sections.some(section => section.kind === "map-module" && section.requested);
        image(reader.media.map, "Verbreitungskarte", null, mapRequested); image(reader.media.spectrogram, "Stimmenspektrogramm");
        const galleryRequested = !structured || reader.content.galleryRequested;
        reader.media.gallery.forEach((usage, index) => image(usage.asset, `Galeriebild ${index + 1}`, usage, galleryRequested));
        for (const reference of reader.media.sounds) {
          details.append(create("h4", "Tierstimme"));
          const url = reference.kind === "public-https" ? mediaUrl(reference.url) : "";
          if (url) { const audio = create("audio"); audio.src = url; audio.controls = true; audio.preload = "none"; details.append(audio); }
          else details.append(create("p", reference.kind === "unavailable" ? "Tondatei noch nicht bereitgestellt" : "Tondatei im gemeinsamen Projekt bereitgestellt"));
          if (reference.attribution) details.append(create("p", reference.attribution));
        }
        if (details.children.length === 1) details.append(create("p", "Für diese Fassung sind keine Bilder oder Tonquellen gebunden.")); parent.append(details);
      }
      function renderPreparation(parent) {
        if (missingMedia.length) {
          const notice = create("p", alreadyApproved ? "Gebundene Bild- oder Tondateien sind noch nicht vollständig bereitgestellt. Die bestehende interne Freigabe bleibt erhalten."
            : "Benötigte Bild- oder Tondateien sind noch nicht vollständig bereitgestellt. Die Leserfreigabe bleibt bis zur vollständigen Bereitstellung gesperrt.");
          parent.append(notice);
        }
        if (!mediaPreparation?.available || !mediaPreparation.files.length) return;
        const details = create("details"), list = create("ul"); details.append(create("summary", `Artdateien bereitstellen · ${bytesText(mediaPreparation.totalBytes)}`), list);
        for (const file of mediaPreparation.files) list.append(create("li", `${slots[file.slot]} · ${bytesText(file.bytes)}`));
        details.append(create("p", "Die Artdateien werden in das gemeinsame Projekt übertragen. Danach wird die Leserfassung erneut zur Prüfung angezeigt."));
        provideButton = create("button", "Artdateien bereitstellen"); provideButton.type = "button";
        provideButton.addEventListener("click", () => { void provideMedia(); }); details.append(provideButton); parent.append(details);
      }
      function renderPreview(value) {
        const shown = value.species, reader = value.readerSpecies, data = create("dl"), modern = value.readerCatalogVersion === 2;
        provideButton = null;
        releaseMediaWithin(content);
        content.replaceChildren(create("h3", shown.germanName), create("p", `${shown.scientificName} · Fassung ${shown.ordinal}`));
        for (const [label, text] of [["Englischer Name", shown.englishName], ["Größe", shown.manual?.size], ["Gewicht", shown.manual?.weight], ["Lebenserwartung", shown.manual?.lifeExpectancy]]) {
          data.append(create("dt", label), create("dd", text || "Nicht erfasst"));
        }
        content.append(data);
        const taxonomy = create("details"), taxa = create("dl"); taxonomy.append(create("summary", "Taxonomie im Nachschlagewerk"), taxa);
        const ranks = { kingdom: "Reich", phylum: "Stamm", subphylum: "Unterstamm", class: "Klasse", order: "Ordnung", family: "Familie", genus: "Gattung", species: "Art" };
        for (const taxon of reader.taxonomy) if (!modern || ranks[String(taxon.rank).toLowerCase()]) taxa.append(create("dt", ranks[String(taxon.rank).toLowerCase()] || taxon.rank), create("dd", taxon.name));
        content.append(taxonomy);
        if (modern) {
          content.append(create("p", "Diese redaktionelle Fassung wird für Projektleser und das Nachschlagewerk geprüft. Die Websiteveröffentlichung erfolgt separat."));
          if (alreadyApproved) content.append(create("p", "Diese Fassung ist bereits intern freigegeben."));
          readerContent(content, reader);
          const facts = create("details"), values = create("dl"); facts.append(create("summary", "Weitere Angaben im Nachschlagewerk"), values);
          const labels = ["Wissenschaftlicher Name", "Deutscher Name", "Englischer Name", "Größe", "Gewicht", "Lebenserwartung"];
          for (const item of reader.general || []) if (labels.includes(item.label)) values.append(create("dt", item.label), create("dd", item.value));
          for (const [key, label] of [["category", "Gefährdungskategorie"], ["status", "Gefährdungsstatus"], ["trend", "Populationstrend"], ["population", "Population"]])
            if (reader.status?.[key]) values.append(create("dt", label), create("dd", reader.status[key]));
          content.append(facts);
        } else {
          const sections = create("details"); sections.append(create("summary", "Texte im Nachschlagewerk"));
          for (const section of reader.sections) {
            const text = create("p", section.intentionallyEmpty ? "Bewusst leer gelassen" : section.text || "Kein Text erfasst"); text.className = "shared-project-text";
            sections.append(create("h4", section.title), text);
          }
          content.append(sections);
        }
        const media = create("details"); media.append(create("summary", "Bilder und Ton im Nachschlagewerk"));
        const mediaUrl = (url) => typeof url === "string" && /^https:\/\/[^/@\s]+(?:\/|$)/.test(url) ? url : "";
        function image(file, title) {
          const url = mediaUrl(file?.url); if (!url) return;
          const figure = create("figure"), img = create("img"); img.src = url; img.alt = file.alt || title; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
          figure.append(img, create("figcaption", file.caption || title));
          if (file.attribution) figure.append(create("p", file.attribution)); media.append(figure);
        }
        if (modern) readerMedia(content, reader, mediaUrl);
        else {
          image(reader.media.portrait, "Artporträt"); image(reader.media.map, "Verbreitungskarte");
          for (const file of reader.media.gallery) image(file, file.alt || "Galeriebild");
          for (const file of reader.media.sounds) {
            const url = mediaUrl(file.url); if (!url) continue;
            const audio = create("audio"); audio.src = url; audio.controls = true; audio.preload = "none";
            media.append(create("p", file.attribution || "Tierstimme"), audio);
          }
          if (media.children.length === 1) media.append(create("p", "Für diese Fassung sind keine Bilder oder Tonquellen gebunden.")); content.append(media);
        }
        if (modern) renderPreparation(content);
        const hints = [...(value.warnings || []), ...(shown.dataIssues || []), ...(shown.assetIssues || [])]
          .filter(hint => !modern || typeof hint === "string" && !/[a-f0-9]{64}|sourceBindings|schemaVersion/.test(hint));
        if (hints.length) {
          const details = create("details"), list = create("ul"); details.append(create("summary", `Prüfhinweise (${hints.length})`), list);
          for (const hint of hints) list.append(create("li", hint)); content.append(details);
        }
      }
      function modernPreview(value) {
        const reader = value.readerSpecies, body = reader?.content, preparation = value.mediaPreparation;
        return (value.alreadyApproved === undefined || typeof value.alreadyApproved === "boolean")
          && Array.isArray(value.missingMedia) && value.missingMedia.every(item => typeof item?.role === "string" && typeof item.id === "string")
          && body && ["structured", "legacy-sections"].includes(body.kind) && Array.isArray(body.sections)
          && (body.kind !== "structured" || typeof body.title === "string" && Array.isArray(body.introduction) && Array.isArray(body.sources)
            && typeof body.galleryRequested === "boolean" && body.sections.every(section => Array.isArray(section.blocks) && Array.isArray(section.sources)))
          && preparation && typeof preparation.available === "boolean" && Array.isArray(preparation.files) && preparation.files.length <= 4
          && preparation.files.every(file => Object.hasOwn(slots, file?.slot) && Number.isSafeInteger(file.bytes) && file.bytes > 0)
          && new Set(preparation.files.map(file => file.slot)).size === preparation.files.length
          && Number.isSafeInteger(preparation.totalBytes) && preparation.totalBytes === preparation.files.reduce((sum, file) => sum + file.bytes, 0);
      }
      function preparationError(error) {
        if (["forbidden", "authentication_required", "approval_review_changed", "approval_preview_changed"].includes(error?.code))
          return "Artfassung oder Berechtigung wurde geändert. Bitte die Art erneut öffnen und die aktuelle Fassung prüfen.";
        return "Die Bereitstellung wurde nicht vollständig bestätigt. Bereits bestätigte Dateien bleiben erhalten. Bitte die Vorschau erneut laden und offene Dateien prüfen. Keine automatische Wiederholung.";
      }
      async function previewApproval() {
        if (busy || !permitted()) return false;
        const request = ++generation, binding = owner(); token = ""; reviewedRevision = ""; reviewOwner = ""; missingMedia = []; mediaPreparation = null; provideButton = null; alreadyApproved = false;
        releaseMediaWithin(content); content.replaceChildren(); busy = true; controls(); message.textContent = "Die angezeigte Fassung wird geprüft…";
        try {
          const result = await fetchJson(`${base}/approval/preview`, { method: "POST", body: JSON.stringify({ sourceScope: species.sourceScope,
            expectedEditRevision: species.editRevision, expectedRevision: species.revision, ...(readerVersion === 2 ? { readerCatalogVersion: 2 } : {}) }) });
          if (!current(request, binding)) { message.textContent = "Artbestand oder Berechtigung wurde geändert. Bitte die Ansicht schließen und die Art erneut öffnen."; return false; }
          readerVersion = result?.readerCatalogVersion === 2 ? 2 : 1;
          if (typeof result?.token !== "string" || !result.token || result.sourceScope !== species.sourceScope || result.species?.id !== species.id
            || result.species.revision !== species.revision || result.readerSpecies?.id !== species.id
            || ![undefined, 1, 2].includes(result.readerCatalogVersion) || (readerVersion === 2 ? !modernPreview(result) : !Array.isArray(result.readerSpecies.sections))
            || !Array.isArray(result.readerSpecies.taxonomy) || !Array.isArray(result.readerSpecies.media?.gallery)
            || !Array.isArray(result.readerSpecies.media?.sounds)) throw new Error("Die geprüfte Artfassung ist nicht eindeutig bestätigt.");
          missingMedia = readerVersion === 2 ? [...result.missingMedia] : [];
          alreadyApproved = readerVersion === 2 && result.alreadyApproved === true;
          mediaPreparation = readerVersion === 2 ? { available: result.mediaPreparation.available, totalBytes: result.mediaPreparation.totalBytes, files: result.mediaPreparation.files.map(file => ({ slot: file.slot, bytes: file.bytes })) } : null;
          prepare.textContent = readerVersion === 2 ? "Vorschau erneut laden" : prepareLabel;
          reviewOwner = binding; renderPreview(result); token = result.token; reviewedRevision = result.species.revision;
          message.textContent = alreadyApproved ? "Diese Fassung ist bereits intern freigegeben. Gebundene Artdateien können bei Bedarf bereitgestellt werden."
            : missingMedia.length ? "Vor der Leserfreigabe sind noch benötigte Dateien bereitzustellen. Bitte die Fassung und die Dateihinweise prüfen."
              : "Bitte die Fassung prüfen und die interne Freigabe bestätigen."; return true;
        } catch (error) { token = ""; reviewedRevision = ""; if (request === generation) message.textContent = !current(request, binding)
          ? "Artbestand oder Berechtigung wurde geändert. Bitte die Art erneut öffnen."
          : readerVersion === 2 ? "Die Leserfassung wurde nicht eindeutig bestätigt. Bitte den Serverstand lesen und die Art erneut prüfen."
            : `${error.message} Bitte bei geändertem Serverstand zuerst „Serverstand lesen“ verwenden und die Art erneut öffnen.`; return false; }
        finally { busy = false; controls(); }
      }
      async function provideMedia() {
        if (busy || !permitted() || !token || reviewOwner !== owner() || !mediaPreparation?.available || !mediaPreparation.files.length) return;
        const reviewedToken = token, expected = mediaPreparation.files.map(file => ({ ...file })), binding = owner(), request = generation;
        token = ""; reviewedRevision = ""; busy = true; controls(); message.textContent = "Artdateien werden im gemeinsamen Projekt bereitgestellt…";
        let completedProvision = false;
        try {
          const result = await fetchJson(`${base}/approval/provide-media`, { method: "POST", body: JSON.stringify({ token: reviewedToken }) });
          if (!current(request, binding)) { message.textContent = "Artbestand oder Berechtigung wurde geändert. Bitte den aktuellen Stand bewusst neu laden."; return; }
          const completed = result?.completed;
          if (typeof result?.provided !== "boolean" || result.externalPublication !== "not-performed" || result.requiresNewReview !== true || !Array.isArray(completed)
            || completed.length > expected.length || new Set(completed.map(file => file?.slot)).size !== completed.length
            || !completed.every(file => expected.some(item => item.slot === file?.slot && item.bytes === file.bytes))
            || result.provided && (result.stopped !== null || completed.length !== expected.length)
            || !result.provided && (!Object.hasOwn(slots, result.stopped?.slot) || !expected.some(file => file.slot === result.stopped.slot)
              || completed.some(file => file.slot === result.stopped.slot))) throw new Error("Die Dateibereitstellung wurde nicht eindeutig bestätigt.");
          completedProvision = result.provided;
          if (!result.provided) {
            message.textContent = `Die Bereitstellung wurde bei „${slots[result.stopped.slot]}“ angehalten. ${completed.length ? "Bereits bestätigte Dateien bleiben bereitgestellt. " : ""}Bitte die offene Datei prüfen und die Vorschau erneut laden. Keine automatische Wiederholung.`;
          }
        } catch (error) { if (current(request, binding)) message.textContent = preparationError(error); }
        finally {
          token = ""; reviewedRevision = ""; mediaPreparation = null; if (provideButton) { provideButton.disabled = true; provideButton.hidden = true; }
          busy = false; controls();
        }
        if (completedProvision && current(request, binding)) {
          const loaded = await previewApproval();
          if (permitted() && owner() === binding) message.textContent = loaded
            ? alreadyApproved ? "Artdateien bereitgestellt. Diese Fassung ist bereits intern freigegeben."
              : missingMedia.length ? "Artdateien bereitgestellt. Für die Leserfassung sind noch weitere benötigte Dateien offen. Bitte die Hinweise der neu geladenen Vorschau prüfen."
                : "Artdateien bereitgestellt. Bitte die neu geladene Leserfassung prüfen und anschließend bewusst freigeben."
            : "Artdateien sind bereitgestellt. Bitte die neue Leserfassung über „Vorschau erneut laden“ bewusst erneut prüfen.";
        }
      }
      async function approve() {
        if (busy || !token || !permitted() || missingMedia.length || alreadyApproved || reviewOwner !== owner()) return;
        const reviewedToken = token, revision = reviewedRevision, request = generation, binding = owner(); token = ""; busy = true; controls();
        message.textContent = "Die geprüfte Fassung wird intern freigegeben…";
        try {
          const result = await fetchJson(`${base}/approval/approve`, { method: "POST", body: JSON.stringify({ token: reviewedToken }) });
          if (!current(request, binding)) { message.textContent = "Artbestand oder Berechtigung wurde geändert. Bitte den aktuellen Stand bewusst neu laden."; return; }
          if (result?.approved !== true || result.serverConfirmed !== true || result.reviewedRevision !== revision || result.approvedRevision !== revision
            || result.sourceScope !== species.sourceScope || result.externalPublication !== "not-performed"
            || typeof result.hasNewerLocalChanges !== "boolean") throw new Error("Die interne Freigabe wurde nicht eindeutig bestätigt.");
          state.notice = result.hasNewerLocalChanges ? "Die geprüfte Fassung ist intern freigegeben. Neuere lokale Änderungen bleiben ungeprüft erhalten."
            : "Die geprüfte Artfassung ist für Projektleser und das Nachschlagewerk intern freigegeben.";
          busy = false; controls(); controller.close("approved"); await loadData();
        } catch (error) { if (request === generation) message.textContent = readerVersion === 2
          ? "Die interne Freigabe wurde nicht eindeutig bestätigt. Keine automatische Wiederholung. Bitte den Serverstand lesen und die Fassung erneut prüfen."
          : `${error.message} Keine automatische Wiederholung. Bitte den Serverstand lesen und die Fassung erneut prüfen.`; }
        finally { busy = false; controls(); }
      }
      openButton.addEventListener("click", () => { if (!busy && permitted()) { content.replaceChildren(); controller.open(); void previewApproval(); } });
      prepare.addEventListener("click", () => { void previewApproval(); }); apply.addEventListener("click", () => { void approve(); });
      renderApprovalState = controls; controls(); return Object.freeze({ openButton, previewApproval, approve, provideMedia });
    }

    let pageController = null, offlineController = null, enrichmentController = null, renderPageState = () => {};
    function setupSpeciesPagePreparation(species) {
      offlineController?.dispose();
      offlineController = global.SpeciesExplorerNormalOffline?.createSpeciesOfflineController({ state, detailPanel: elements.detailPanel, species, fetchJson, documentRef });
      enrichmentController?.dispose();
      enrichmentController = global.SpeciesExplorerEnrichment?.createSpeciesEnrichmentController({ state, detailPanel: elements.detailPanel, species, fetchJson, loadData, releaseMediaWithin, documentRef });
      pageController?.stateChanged();
      const button = elements.detailPanel.querySelector(".species-page-prepare-open");
      renderPageState = () => {};
      if (!button) return;
      const permitted = () => state.editMode && state.workspace === "shared-project" && species.source === "shared-project"
        && state.selectedId === species.id && state.workspaceStatus?.sourceScope === species.sourceScope
        && state.workspaceStatus?.permissions?.canEdit === true;
      renderPageState = () => { button.hidden = !permitted(); button.disabled = !permitted(); };
      button.addEventListener("click", () => {
        if (!permitted()) return;
        const factory = global.SpeciesExplorerPageAuthoring?.createPageAuthoringController;
        if (!factory) { state.notice = "Der Artseiteneditor konnte nicht geladen werden. Bitte den Explorer regulär neu öffnen."; return; }
        pageController ||= factory({ state, documentRef, fetchJson, escapeHtml, releaseMediaWithin, confirmAction: showQuickConfirm, openAiSuggestion, reviewLanguage });
        void pageController.open(species);
      });
      renderPageState();
    }
    return Object.freeze({ setupSpeciesRefresh, setupSpeciesDelete, setupSpeciesApproval, setupSpeciesPagePreparation,
      hasPageAuthoringChanges: () => pageController?.hasUnsavedChanges() === true,
      renderSpeciesActions: () => { renderApprovalState(); renderPageState(); pageController?.stateChanged(); offlineController?.stateChanged(); enrichmentController?.stateChanged(); } });
  }

  global.SpeciesExplorerSpeciesActions = Object.freeze({
    refreshConfirmation,
    deleteModePresentation,
    deleteSuccessNotice,
    createSpeciesActionsController,
  });
})(globalThis);
