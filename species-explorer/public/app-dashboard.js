(function initializeSpeciesExplorerDashboard(global) {
  "use strict";

  function createValidationPresentation(validation, { pluralize } = {}) {
    if (typeof pluralize !== "function") {
      throw new TypeError("Validierungsanzeige benötigt pluralize als Funktion.");
    }

    if (validation.source === "shared-project") {
      const clean = validation.pending === 0 && validation.conflicts === 0;
      const detailItems = validation.legacyCount
        ? ["Für vorhandene Arten ohne vollständige Grunddaten ist die kontrollierte Bestandsübernahme noch offen."] : [];
      return { isOk: clean && validation.connection === "online", hasErrors: validation.conflicts > 0, overallText: validation.conflicts ? `${validation.conflicts} Konflikt(e) prüfen`
        : validation.connection === "online" ? validation.pending ? "Lokale Änderungen warten auf Abgleich" : "Gemeinsamer Stand auf diesem Gerät"
          : "Offline · gespeicherter gemeinsamer Stand",
      data: { ok: true, value: `${validation.speciesCount} Arten`, detail: validation.legacyCount ? `${validation.legacyCount} weitere Arten benötigen vollständige Grunddaten` : "Vollständige gemeinsame Arbeitsdatensätze" },
      assets: { ok: validation.missingMediaCount === 0, value: `${validation.availableMediaCount} Medienverweise`, detail: "Medien benötigen eine Internetverbindung, solange sie nicht auf diesem Gerät heruntergeladen sind." },
      report: { ok: clean, value: validation.conflicts ? `${validation.conflicts} Konflikte` : validation.pending ? `${validation.pending} lokale Änderungen` : "Kein Abgleich offen",
        detail: "Interne Freigabe und Websiteübernahme bleiben eigene Schritte." }, specialText: "Gemeinsamer FN-Bestand",
      detailItems, detailEntries: detailItems.map((text) => ({ text, severity: "info" })) };
    }

    const isOk = validation.status === "ok";
    const dataOk = validation.data.issueSpeciesCount === 0;
    const assetsOk = validation.assets.issueSpeciesCount === 0;
    const missingPortraitCount = validation.special.missingPortraitCount ?? 0;
    const missingSoundKnownCount = validation.special.missingSoundKnownCount ?? 0;
    const manualSoundCount = validation.special.manualSoundCount ?? 0;
    const detailItems = [], detailEntries = [];
    const addDetail = (text, severity) => { detailItems.push(text); detailEntries.push(Object.freeze({ text, severity })); };

    if (!dataOk) {
      addDetail(
        `Daten: ${pluralize(validation.data.inputOnlyCount, "angelegte Art", "angelegte Arten")} ohne zugehörige abgerufene Artdaten, `
        + `${pluralize(validation.data.generatedOnlyCount, "abgerufener Artdatensatz", "abgerufene Artdatensätze")} ohne zugehörige Artanlage, `
        + `${pluralize(validation.data.mismatchSpeciesCount, "Art", "Arten")} mit abweichenden Angaben`, "error",
      );
    }

    if (!assetsOk) {
      const available = validation.assets.available;
      addDetail(
        `Assets vorhanden: ${available.maps} Karten, ${available.sounds} Sounds, `
        + `${available.credits} Credits, ${available.spectrograms} Spektrogramme, `
        + `${available.portraits} Artporträts`, "error",
      );
      if (missingPortraitCount) {
        addDetail(`Artporträts: ${missingPortraitCount} von ${validation.data.inputCount} fehlen`, "error");
      }
    }

    if (missingSoundKnownCount) {
      addDetail(
        `Sound fehlt: ${missingSoundKnownCount} Art(en) ohne verwendbare automatische Tonquelle`, "care",
      );
    }
    if (manualSoundCount) {
      addDetail(
        `Manuelle Sounds: ${manualSoundCount} Art(en) mit manuell gepflegter Tonquelle`, "info",
      );
    }

    for (const check of validation.report.checks.filter((entry) => !entry.ok)) {
      const parts = [];
      if (check.missingFromReport.length) {
        parts.push(`${check.missingFromReport.length} fehlen im Report: ${check.missingFromReport.join(", ")}`);
      }
      if (check.staleInReport.length) {
        parts.push(`${check.staleInReport.length} stehen nur im Report: ${check.staleInReport.join(", ")}`);
      }
      addDetail(`${check.label}: ${parts.join("; ")}`, "error");
    }
    for (const issue of validation.report.counterIssues) addDetail(`Report-Zähler: ${issue}`, "error");

    return Object.freeze({
      isOk,
      hasErrors: !dataOk || !assetsOk || !validation.report.consistent,
      overallText: isOk ? "Alle Prüfungen bestanden" : `${validation.issueCount} Prüfhinweis(e)`,
      data: Object.freeze({
        ok: dataOk,
        value: `${validation.data.inputCount} angelegt · ${validation.data.generatedCount} abgerufen`,
        detail: dataOk
          ? "Angelegte Arten und abgerufene Artdaten stimmen überein"
          : `${validation.data.issueSpeciesCount} Art(en) mit offenen oder abweichenden Artdaten`,
      }),
      assets: Object.freeze({
        ok: assetsOk,
        value: missingPortraitCount
          ? `${validation.assets.completeSpeciesCount} vollständig · ${missingPortraitCount} Portraits fehlen`
          : `${validation.assets.completeSpeciesCount} vollständig`,
        detail: assetsOk
          ? (missingSoundKnownCount || manualSoundCount
            ? `Kernassets vollständig · ${[
                missingSoundKnownCount
                  ? pluralize(missingSoundKnownCount, "fehlender Sound", "fehlende Sounds")
                  : "",
                manualSoundCount ? pluralize(manualSoundCount, "manueller Sound", "manuelle Sounds") : "",
              ].filter(Boolean).join(" · ")}`
            : "Karte, Sound, Credits, Spektrogramm und Artporträt vorhanden")
          : `${validation.assets.issueSpeciesCount} unvollständige Assetordner`,
      }),
      report: Object.freeze({
        ok: validation.report.consistent,
        value: validation.report.consistent ? "Konsistent" : "Abweichung",
        detail: validation.report.consistent
          ? `${validation.report.checks.length} Reportprüfungen bestanden`
          : `${validation.report.issueCount} Reportproblem(e)`,
      }),
      specialText:
        `${validation.special.manualMapCount} Karten · ${validation.special.ncSoundCount} NC`
        + `${manualSoundCount ? ` · ${pluralize(manualSoundCount, "manueller Sound", "manuelle Sounds")}` : ""}`
        + `${missingSoundKnownCount ? ` · ${pluralize(missingSoundKnownCount, "fehlender Sound", "fehlende Sounds")}` : ""}`,
      detailItems: Object.freeze(detailItems),
      detailEntries: Object.freeze(detailEntries),
    });
  }

  function createSpeciesListItemPresentation(species, {
    formatIucnStatus,
    iucnStatusIconUrl,
    iucnTrendIconUrl,
    websitePagesSnapshot = null,
  } = {}) {
    for (const [name, dependency] of Object.entries({
      formatIucnStatus,
      iucnStatusIconUrl,
      iucnTrendIconUrl,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Artenlistenanzeige benötigt ${name} als Funktion.`);
      }
    }

    const indicators = [];
    const statusUrl = iucnStatusIconUrl(species.iucn.status);
    const trendUrl = iucnTrendIconUrl(species.iucn.trend);
    if (statusUrl) {
      indicators.push({
        url: statusUrl,
        title: formatIucnStatus(species.iucn.status),
        className: "status",
      });
    }
    if (trendUrl) {
      indicators.push({
        url: trendUrl,
        title: `Populationstrend: ${species.iucn.trend || "Unbekannt"}`,
        className: "trend",
      });
    }

    const flags = [];
    if (species.inconsistencies.length) {
      flags.push({ label: "!", className: "issue", title: species.inconsistencies.join(", ") });
    }
    if (species.isNcSound) {
      flags.push({ label: "NC", className: "nc", title: "Non-Commercial-Soundlizenz" });
    }
    if (species.isManualMap) {
      flags.push({ label: "K", className: "map", title: "Manuell gepflegte Karte" });
    }
    if (species.soundMissingKnown) {
      flags.push({ label: "S", className: "sound-care", title: "Keine geeignete automatische Soundquelle gefunden · Pflegehinweis" });
    } else if (species.isManualSound) {
      flags.push({ label: "S", className: "sound-manual", title: "Sound wird manuell gepflegt" });
    } else if (species.soundCareHint) {
      flags.push({ label: "S", className: "sound-care", title: "Soundhinweis prüfen" });
    }
    if (species.missingPortrait) {
      flags.push({ label: "P", className: "portrait", title: "Artporträt fehlt" });
    }
    if (global.SpeciesExplorerWebsitePages?.pagePresentation(species.id, websitePagesSnapshot).status === "missing") {
      flags.push({ label: "W", className: "website", role: "img",
        title: "Art noch nicht auf der FN-Website veröffentlicht" });
    }

    return Object.freeze({
      id: species.id,
      germanName: species.germanName,
      scientificName: species.scientificName,
      indicators: Object.freeze(indicators.map((entry) => Object.freeze(entry))),
      flags: Object.freeze(flags.map((entry) => Object.freeze(entry))),
    });
  }

  function statusFilterValues(species, formatIucnStatus) {
    if (typeof formatIucnStatus !== "function") {
      throw new TypeError("Statusfilter benötigt formatIucnStatus als Funktion.");
    }
    return [...new Set(species.map((entry) => entry.iucn.status))]
      .filter(Boolean)
      .sort((a, b) => formatIucnStatus(a).localeCompare(formatIucnStatus(b), "de"));
  }

  function createDashboardController({
    state,
    elements,
    formatDate,
    formatIucnStatus,
    pluralize,
    escapeHtml,
    iucnStatusIconUrl,
    iucnTrendIconUrl,
    filterSpecies,
    resolveDatabaseStatus,
    databaseStatusLabel,
    onSpeciesSelect,
    onSpeciesListRendered = () => {},
    documentRef = global.document,
    OptionConstructor = global.Option,
  } = {}) {
    for (const [name, dependency] of Object.entries({
      formatDate,
      formatIucnStatus,
      pluralize,
      escapeHtml,
      iucnStatusIconUrl,
      iucnTrendIconUrl,
      filterSpecies,
      resolveDatabaseStatus,
      databaseStatusLabel,
      onSpeciesSelect,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Dashboard benötigt ${name} als Funktion.`);
      }
    }
    if (!state || !elements || !documentRef || typeof OptionConstructor !== "function") {
      throw new TypeError("Dashboard benötigt Zustand, Elemente, Dokument und Option-Konstruktor.");
    }

    function renderDatabaseStatus(stateName = "") {
      const showStatus = (status, label, detail = label) => {
        const transferAvailable = status === "outdated" && state.editMode === true && state.workspace !== "shared-project";
        elements.databaseStatus.className = `database-status ${status}`;
        if (elements.databaseTransferButton) {
          elements.databaseTransferButton.hidden = !transferAvailable;
          if (transferAvailable) elements.databaseStatus.className += " visually-hidden";
        }
        elements.pipelineStatus.className = `pipeline-status-text ${status}`;
        elements.pipelineStatus.textContent = label;
        elements.databaseStatus.title = detail;
        elements.databaseStatus.setAttribute("aria-label", detail);
      };
      if (state.dataLoadError) {
        showStatus("failed", "Daten nicht verfügbar", "Der ausgewählte Artbestand konnte nicht geladen werden.");
        if (elements.validationIssueNotice) { elements.validationIssueNotice.hidden = false;
          elements.validationIssueNotice.textContent = "Der ausgewählte Artbestand konnte nicht geladen werden. Angezeigte Daten sind nicht frisch bestätigt."; }
        return;
      }
      if (state.workspace === "shared-project" && !state.taxonomyDatabaseBusy && !state.taxonomyMaintenanceSnapshot?.active
        && !state.taxonomyMasterSnapshot?.active && !["running", "awaiting-review", "failed"].includes(state.pipelineStatusSnapshot?.status)
        && !["running", "failed"].includes(state.backupStatusSnapshot?.status)) {
        const shared = state.workspaceStatus;
        if (state.dataLoading) showStatus("review", "Bestand wird geladen");
        else if (!shared || shared.available === false) showStatus("failed", "Projektverbindung prüfen");
        else if (shared.connection !== "online") showStatus("review", "Gemeinsamer Stand offline", "Gespeicherter gemeinsamer Bestand auf diesem Gerät; Serverstand nicht frisch bestätigt.");
        else if (shared.conflicts) showStatus("review", `${shared.conflicts} Konflikt(e) prüfen`);
        else if (shared.pending) showStatus("review", "Abgleich offen", `${shared.pending} lokale Änderung(en) warten auf ausdrücklichen Abgleich.`);
        else showStatus("current", "Gemeinsamer Bestand geladen", "Gemeinsamer FN-Bestand auf diesem Gerät. Interne Freigabe und Websiteübernahme sind eigene Schritte.");
        return;
      }
      const taxonomyProgress = global.SpeciesExplorerTaxonomyProgress.taxonomyProgressPresentation({
        master: state.taxonomyMasterSnapshot, reference: state.taxonomyMaintenanceSnapshot,
        busy: state.taxonomyDatabaseBusy, preparation: state.taxonomyDatabasePreparation });
      const taxonomyActive = Boolean(
        state.taxonomyDatabaseBusy
        || state.taxonomyMaintenanceSnapshot?.active
        || state.taxonomyMasterSnapshot?.active,
      );
      const otherWork = ["running", "awaiting-review", "failed"].includes(state.pipelineStatusSnapshot?.status)
        || ["running", "failed"].includes(state.backupStatusSnapshot?.status) || state.databaseNeedsUpdate;
      const showTaxonomy = taxonomyProgress && (taxonomyActive || !otherWork
        || ["failed", "review"].includes(taxonomyProgress.className));
      const status = showTaxonomy ? taxonomyProgress.className : resolveDatabaseStatus({
        explicitStatus: taxonomyActive ? "taxonomy" : state.backupStatusSnapshot?.status === "failed" ? "failed" : stateName,
        backupStatus: state.backupStatusSnapshot?.status,
        pipelineStatus: state.pipelineStatusSnapshot?.status,
        databaseNeedsUpdate: state.databaseNeedsUpdate,
      });
      if (showTaxonomy) showStatus(status, taxonomyProgress.compact, taxonomyProgress.detail);
      else if (state.dataLoading && !["running", "backup", "review", "taxonomy", "failed"].includes(status)) showStatus("review", "Bestand wird geladen");
      else showStatus(status, ({ outdated: "Änderungen offen", failed: "Aktualisierung fehlgeschlagen" })[status] || databaseStatusLabel(status));
    }

    const setValidationCardState = (card, ok) => {
      card.classList.toggle("ok", ok);
      card.classList.toggle("error", !ok);
    };

    const createFlag = ({ label, className, title, role }) => {
      const span = documentRef.createElement("span");
      span.className = `flag ${className}`;
      span.textContent = label;
      if (title) span.title = title;
      if (role) {
        span.setAttribute("role", role);
        span.setAttribute("aria-label", title);
      }
      return span;
    };

    const createIndicatorIcon = ({ url, title, className }) => {
      const span = documentRef.createElement("span");
      span.className = `species-list-indicator ${className}`.trim();
      span.title = title;
      span.setAttribute("aria-label", title);
      const image = documentRef.createElement("img");
      image.src = url;
      image.alt = "";
      span.append(image);
      return span;
    };

    function updateSummary(summary) {
      elements.speciesCount.textContent = summary.speciesCount;
      elements.assetIssues.textContent = summary.missingCoreAssets;
      elements.ncCount.textContent = summary.ncSoundCount;
      elements.manualMapCount.textContent = summary.manualMapCount;
      const mapProvenanceCounts = documentRef.querySelector?.("#map-provenance-counts");
      if (mapProvenanceCounts) mapProvenanceCounts.textContent =
        `${summary.browserImportedMapCount || 0} IUCN-Browserimporte · ${summary.ownCareMapCount ?? summary.manualMapCount} eigene Pflege/Altmarkierungen`;
      elements.reportDate.textContent = summary.source === "shared-project" ? "Gemeinsames Projekt" : formatDate(summary.reportGeneratedAt);
    }

    function updateValidation(validation) {
      const presentation = createValidationPresentation(validation, { pluralize });
      state.validationNeedsUpdate = !presentation.isOk;
      state.databaseNeedsUpdate = state.validationNeedsUpdate || Boolean(state.pendingChanges?.hasPendingChanges);
      renderDatabaseStatus();

      elements.validationOverall.textContent = presentation.overallText;
      elements.validationOverall.classList.toggle("ok", presentation.isOk);
      elements.validationOverall.classList.toggle("error", presentation.hasErrors);
      elements.validationOverall.classList.toggle("warning", !presentation.isOk && !presentation.hasErrors);
      if (elements.validationIssueNotice) {
        elements.validationIssueNotice.hidden = !presentation.hasErrors;
        elements.validationIssueNotice.textContent = presentation.hasErrors
          ? validation.source === "shared-project"
            ? `${validation.conflicts} Versionskonflikt(e) im gemeinsamen Bestand prüfen · Einzelheiten unter ⋮ → Prüfung & Hinweise`
            : "Daten- oder Dateifehler prüfen · Einzelheiten unter ⋮ → Prüfung & Hinweise" : "";
      }

      elements.validationData.textContent = presentation.data.value;
      elements.validationDataDetail.textContent = presentation.data.detail;
      setValidationCardState(elements.validationDataCard, presentation.data.ok);

      elements.validationAssets.textContent = presentation.assets.value;
      elements.validationAssetsDetail.textContent = presentation.assets.detail;
      setValidationCardState(elements.validationAssetsCard, presentation.assets.ok);

      elements.validationReport.textContent = presentation.report.value;
      elements.validationReportDetail.textContent = presentation.report.detail;
      setValidationCardState(elements.validationReportCard, presentation.report.ok);

      elements.validationSpecial.textContent = presentation.specialText;
      elements.validationDetails.hidden = presentation.detailItems.length === 0;
      elements.validationDetails.innerHTML = presentation.detailItems.length
        ? `<ul>${presentation.detailEntries.map(({ text, severity }) => `<li class="validation-detail ${severity}">${escapeHtml(text)}</li>`).join("")}</ul>`
        : "";
    }

    function updatePendingChanges(pendingChanges = {}) {
      state.pendingChanges = pendingChanges;
      state.databaseNeedsUpdate = state.validationNeedsUpdate || Boolean(pendingChanges.hasPendingChanges);
      renderDatabaseStatus();
    }

    function populateStatusFilter() {
      const current = elements.statusFilter.value;
      const statuses = statusFilterValues(state.species, formatIucnStatus);
      elements.statusFilter.replaceChildren(new OptionConstructor("Alle", ""));
      for (const status of statuses) {
        elements.statusFilter.add(new OptionConstructor(formatIucnStatus(status), status));
      }
      elements.statusFilter.value = current;
    }

    function applyFilters() {
      state.filtered = filterSpecies(state.species, {
        query: elements.search.value,
        status: elements.statusFilter.value,
        flag: elements.flagFilter.value,
      });
      renderSpeciesList();
    }

    function renderSpeciesList() {
      const previousScrollTop = elements.speciesList.scrollTop;
      const focusedId = elements.speciesList.contains?.(documentRef.activeElement)
        ? documentRef.activeElement?.dataset?.id : "";
      elements.speciesList.replaceChildren();
      elements.visibleCount.textContent = `${state.filtered.length} ${state.filtered.length === 1 ? "Art" : "Arten"}`;

      if (state.filtered.length === 0) {
        const empty = documentRef.createElement("p");
        empty.className = "no-results";
        empty.textContent = "Keine Art passt zu den Filtern.";
        elements.speciesList.append(empty);
        elements.speciesList.tabIndex = 0;
        onSpeciesListRendered();
        if (focusedId) elements.speciesList.focus?.({ preventScroll: true });
        return;
      }

      const entryId = state.filtered.some((entry) => entry.id === state.selectedId)
        ? state.selectedId : state.filtered[0]?.id;
      elements.speciesList.tabIndex = -1;
      let restoreFocusItem = null;
      for (const species of state.filtered) {
        const presentation = createSpeciesListItemPresentation(species, {
          formatIucnStatus,
          iucnStatusIconUrl,
          iucnTrendIconUrl,
          websitePagesSnapshot: state.websitePagesSnapshot,
        });
        const item = elements.itemTemplate.content.firstElementChild.cloneNode(true);
        item.dataset.id = presentation.id;
        item.classList.toggle("active", presentation.id === state.selectedId);
        item.setAttribute("aria-selected", String(presentation.id === state.selectedId));
        item.tabIndex = presentation.id === entryId ? 0 : -1;
        if (presentation.id === focusedId) restoreFocusItem = item;
        else if (!restoreFocusItem && presentation.id === entryId) restoreFocusItem = item;
        item.querySelector("strong").textContent = presentation.germanName;
        item.querySelector("em").textContent = presentation.scientificName;

        const flags = item.querySelector(".species-item-flags");
        for (const indicator of presentation.indicators) flags.append(createIndicatorIcon(indicator));
        for (const flag of presentation.flags) flags.append(createFlag(flag));

        item.addEventListener("click", () => onSpeciesSelect(presentation.id));
        elements.speciesList.append(item);
      }

      elements.speciesList.scrollTop = previousScrollTop;
      onSpeciesListRendered();
      if (focusedId) restoreFocusItem?.focus?.({ preventScroll: true });
    }

    return Object.freeze({
      updateSummary,
      updateValidation,
      updatePendingChanges,
      populateStatusFilter,
      applyFilters,
      renderSpeciesList,
      renderDatabaseStatus,
    });
  }

  global.SpeciesExplorerDashboard = Object.freeze({
    createValidationPresentation,
    createSpeciesListItemPresentation,
    statusFilterValues,
    createDashboardController,
  });
})(globalThis);
