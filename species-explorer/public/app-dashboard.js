(function initializeSpeciesExplorerDashboard(global) {
  "use strict";

  function createValidationPresentation(validation, { pluralize } = {}) {
    if (typeof pluralize !== "function") {
      throw new TypeError("Validierungsanzeige benötigt pluralize als Funktion.");
    }

    const isOk = validation.status === "ok";
    const dataOk = validation.data.issueSpeciesCount === 0;
    const assetsOk = validation.assets.issueSpeciesCount === 0;
    const missingPortraitCount = validation.special.missingPortraitCount ?? 0;
    const missingSoundKnownCount = validation.special.missingSoundKnownCount ?? 0;
    const manualSoundCount = validation.special.manualSoundCount ?? 0;
    const detailItems = [];

    if (!dataOk) {
      detailItems.push(
        `Daten: ${validation.data.inputOnlyCount} nur in der Eingabeliste, `
        + `${validation.data.generatedOnlyCount} nur in speciesData.json, `
        + `${validation.data.mismatchSpeciesCount} Art(en) mit Feldabweichung`,
      );
    }

    if (!assetsOk) {
      const available = validation.assets.available;
      detailItems.push(
        `Assets vorhanden: ${available.maps} Karten, ${available.sounds} Sounds, `
        + `${available.credits} Credits, ${available.spectrograms} Spektrogramme, `
        + `${available.portraits} Artporträts`,
      );
      if (missingPortraitCount) {
        detailItems.push(`Artporträts: ${missingPortraitCount} von ${validation.data.inputCount} fehlen`);
      }
    }

    if (missingSoundKnownCount) {
      detailItems.push(
        `Sound fehlt: ${missingSoundKnownCount} Art(en) ohne verwendbare automatische Tonquelle`,
      );
    }
    if (manualSoundCount) {
      detailItems.push(
        `Manuelle Sounds: ${manualSoundCount} Art(en) mit manuell gepflegter Tonquelle`,
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
      detailItems.push(`${check.label}: ${parts.join("; ")}`);
    }
    detailItems.push(...validation.report.counterIssues.map((issue) => `Report-Zähler: ${issue}`));

    return Object.freeze({
      isOk,
      overallText: isOk ? "Alle Prüfungen bestanden" : `${validation.issueCount} Prüfhinweis(e)`,
      data: Object.freeze({
        ok: dataOk,
        value: `${validation.data.inputCount} / ${validation.data.generatedCount}`,
        detail: dataOk
          ? "Eingabe und Pipeline stimmen überein"
          : `${validation.data.issueSpeciesCount} Art(en) mit Datenabweichung`,
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
    });
  }

  function createSpeciesListItemPresentation(species, {
    formatIucnStatus,
    iucnStatusIconUrl,
    iucnTrendIconUrl,
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
    if (species.soundCareHint) {
      flags.push({ label: "S", className: "sound", title: "Sound fehlt oder wird manuell gepflegt" });
    }
    if (species.missingPortrait) {
      flags.push({ label: "P", className: "portrait", title: "Artporträt fehlt" });
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
    renderDatabaseStatus,
    onSpeciesSelect,
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
      renderDatabaseStatus,
      onSpeciesSelect,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Dashboard benötigt ${name} als Funktion.`);
      }
    }
    if (!state || !elements || !documentRef || typeof OptionConstructor !== "function") {
      throw new TypeError("Dashboard benötigt Zustand, Elemente, Dokument und Option-Konstruktor.");
    }

    const setValidationCardState = (card, ok) => {
      card.classList.toggle("ok", ok);
      card.classList.toggle("error", !ok);
    };

    const createFlag = ({ label, className, title }) => {
      const span = documentRef.createElement("span");
      span.className = `flag ${className}`;
      span.textContent = label;
      if (title) span.title = title;
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
      elements.reportDate.textContent = formatDate(summary.reportGeneratedAt);
    }

    function updateValidation(validation) {
      const presentation = createValidationPresentation(validation, { pluralize });
      state.validationNeedsUpdate = !presentation.isOk;
      state.databaseNeedsUpdate = state.validationNeedsUpdate || Boolean(state.pendingChanges?.hasPendingChanges);
      renderDatabaseStatus();

      elements.validationOverall.textContent = presentation.overallText;
      elements.validationOverall.classList.toggle("ok", presentation.isOk);
      elements.validationOverall.classList.toggle("error", !presentation.isOk);

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
        ? `<ul>${presentation.detailItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
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
      elements.speciesList.replaceChildren();
      elements.visibleCount.textContent = `${state.filtered.length} ${state.filtered.length === 1 ? "Art" : "Arten"}`;

      if (state.filtered.length === 0) {
        const empty = documentRef.createElement("p");
        empty.className = "no-results";
        empty.textContent = "Keine Art passt zu den Filtern.";
        elements.speciesList.append(empty);
        return;
      }

      for (const species of state.filtered) {
        const presentation = createSpeciesListItemPresentation(species, {
          formatIucnStatus,
          iucnStatusIconUrl,
          iucnTrendIconUrl,
        });
        const item = elements.itemTemplate.content.firstElementChild.cloneNode(true);
        item.dataset.id = presentation.id;
        item.classList.toggle("active", presentation.id === state.selectedId);
        item.setAttribute("aria-selected", String(presentation.id === state.selectedId));
        item.querySelector("strong").textContent = presentation.germanName;
        item.querySelector("em").textContent = presentation.scientificName;

        const flags = item.querySelector(".species-item-flags");
        for (const indicator of presentation.indicators) flags.append(createIndicatorIcon(indicator));
        for (const flag of presentation.flags) flags.append(createFlag(flag));

        item.addEventListener("click", () => onSpeciesSelect(presentation.id));
        elements.speciesList.append(item);
      }

      elements.speciesList.scrollTop = previousScrollTop;
    }

    return Object.freeze({
      updateSummary,
      updateValidation,
      updatePendingChanges,
      populateStatusFilter,
      applyFilters,
      renderSpeciesList,
    });
  }

  global.SpeciesExplorerDashboard = Object.freeze({
    createValidationPresentation,
    createSpeciesListItemPresentation,
    statusFilterValues,
    createDashboardController,
  });
})(globalThis);
