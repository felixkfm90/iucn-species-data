(function initializeTaxonomyDatabase(global) {
  "use strict";

  const SEARCH_DELAY_MS = 350;

  function taxonomyReleaseLabel(release) {
    if (!release) return "";
    const name = release.alias || release.version || release.releaseId || "";
    if (!name) return "";
    return release.issued
      ? `${name} vom ${String(release.issued).split("-").reverse().join(".")}`
      : name;
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

  function createTaxonomyDatabaseController({
    state,
    elements,
    fetchJson,
    escapeHtml,
    createDialogController,
    taxonomyReference,
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

    function renderOverview() {
      const referenceStatus = state.taxonomyMaintenanceSnapshot || {};
      const masterStatus = state.taxonomyMasterSnapshot || {};
      const masterLifecycle = masterStatus.lifecycle || {};
      const active = referenceStatus.active === true || masterStatus.active === true
        || ["refreshing", "building", "activating", "rolling-back"].includes(masterStatus.status);
      const failed = referenceStatus.status === "failed" || Boolean(masterStatus.error);
      const updateAvailable = referenceStatus.updateAvailable === true;
      const blockingConflicts = Array.isArray(masterLifecycle.blockingConflicts)
        ? masterLifecycle.blockingConflicts.length
        : 0;
      const projectConflicts = Number(referenceStatus.conflicts?.referenceGaps || 0)
        + Number(referenceStatus.conflicts?.suggestions || 0)
        + Number(referenceStatus.conflicts?.ambiguous || 0)
        + Number(referenceStatus.conflicts?.missing || 0);
      const counts = taxonomyDatabaseCounts(masterStatus);
      const latest = taxonomyReleaseLabel(referenceStatus.latest);

      elements.taxonomyDatabaseOverviewSummary.textContent = active
        ? "Taxonomiedatenbank wird aktualisiert"
        : failed
          ? "Taxonomiedatenbank prüfen"
          : updateAvailable
            ? "Neuere Datenbankversion verfügbar"
            : masterLifecycle.active
              ? "Datenbank aktuell"
              : "Noch keine Taxonomiedatenbank aktiviert";

      const details = [];
      if (counts) details.push(counts);
      if (updateAvailable && latest) details.push(`Verfügbar: ${latest}`);
      if (blockingConflicts) {
        details.push(`${blockingConflicts} Aktualisierungskonflikt(e) benötigen eine Entscheidung`);
      }
      if (projectConflicts) {
        details.push(`${projectConflicts} Projektzuordnung(en) manuell prüfen`);
      }
      if (failed) {
        details.push(
          masterStatus.error
          || referenceStatus.error
          || referenceStatus.message
          || "Aktualisierung fehlgeschlagen",
        );
      }
      if (!details.length) details.push("Umfang, Aktualität und Konflikte werden zusammengeführt.");
      elements.taxonomyDatabaseOverviewDetail.textContent = `${details.join(" · ")}.`;
    }

    state.renderTaxonomyDatabaseOverview = renderOverview;

    const dialogController = createDialogController({
      dialog,
      closeButtons: dialog.querySelectorAll(".taxonomy-database-close"),
      afterOpen() {
        searchInput.focus();
      },
      afterClose() {
        clearTimeout(timer);
        requestVersion += 1;
        searchInput.value = "";
        searchResults = [];
        selectedResult = null;
        selectedDetail = null;
        results.hidden = true;
        results.innerHTML = "";
        detail.hidden = true;
        detail.innerHTML = "";
        setMessage("", "");
      },
    });

    function setMessage(text, type = "info") {
      message.hidden = !text;
      message.textContent = text;
      message.className = `edit-message${type ? ` ${type}` : ""}`;
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
      const view = detailPresentation(selectedDetail, selectedResult);
      const hierarchy = view.hierarchy.map((entry) => `
        <div><dt>${escapeHtml(entry.label)}</dt><dd>${escapeHtml(entry.value)}</dd></div>
      `).join("");
      const correctionAllowed = view.rank === "Art";
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
          </section>
        ` : `
          <p class="taxonomy-database-readonly-note">
            Eigene Namenskorrekturen sind in dieser Oberfläche derzeit auf die Artstufe begrenzt.
          </p>
        `}
      `;
      detail.hidden = false;
    }

    async function search() {
      const query = searchInput.value.trim();
      const version = ++requestVersion;
      selectedResult = null;
      selectedDetail = null;
      detail.hidden = true;
      detail.innerHTML = "";
      if (query.length < 2) {
        searchResults = [];
        renderResults();
        setMessage(query ? "Bitte mindestens zwei Zeichen eingeben." : "", "info");
        return;
      }
      setMessage("Taxa werden in der aktiven Datenbank gesucht …", "info");
      try {
        const payload = await fetchJson(
          `/api/taxonomy/search?q=${encodeURIComponent(query)}&kind=all&kingdomId=all&rank=all&limit=20`,
        );
        if (version !== requestVersion) return;
        searchResults = payload.results || [];
        renderResults();
        setMessage(
          searchResults.length
            ? `${searchResults.length} Treffer gefunden.`
            : "Kein passender Eintrag gefunden.",
          searchResults.length ? "success" : "warning",
        );
      } catch (error) {
        if (version !== requestVersion) return;
        searchResults = [];
        renderResults();
        setMessage(error.message || "Die Datenbank konnte nicht durchsucht werden.", "error");
      }
    }

    async function selectTaxon(taxonId) {
      const version = ++requestVersion;
      selectedResult = searchResults.find((entry) => String(entry.taxonId) === taxonId) || null;
      if (!selectedResult) return;
      setMessage("Taxondetails werden geladen …", "info");
      try {
        selectedDetail = await fetchJson(`/api/taxonomy/taxa/${encodeURIComponent(taxonId)}`);
        if (version !== requestVersion) return;
        renderDetail();
        setMessage("Taxon geladen. Wissenschaftliche Taxonomie ist schreibgeschützt.", "success");
      } catch (error) {
        if (version !== requestVersion) return;
        setMessage(error.message || "Taxondetails konnten nicht geladen werden.", "error");
      }
    }

    async function saveCorrection(action, button) {
      if (!selectedDetail) return;
      const view = detailPresentation(selectedDetail, selectedResult);
      button.disabled = true;
      try {
        if (action === "save") {
          selectedDetail = await fetchJson("/api/taxonomy/corrections/save", {
            method: "POST",
            body: JSON.stringify({
              scientificName: view.scientificName,
              germanName: detail.querySelector("[name='taxonomyDatabaseGerman']")?.value || "",
              englishName: detail.querySelector("[name='taxonomyDatabaseEnglish']")?.value || "",
              note: detail.querySelector("[name='taxonomyDatabaseNote']")?.value || "",
            }),
          });
          selectedResult = {
            ...selectedResult,
            germanName: selectedDetail.germanNames?.[0]?.name || null,
            englishName: selectedDetail.englishNames?.[0]?.name || null,
            hasVerifiedGermanName: Boolean(selectedDetail.germanNames?.[0]?.name),
          };
          setMessage("Die eigene Namenskorrektur wurde gespeichert.", "success");
        } else {
          await fetchJson("/api/taxonomy/corrections/reset", {
            method: "POST",
            body: JSON.stringify({ scientificName: view.scientificName }),
          });
          selectedDetail = await fetchJson(
            `/api/taxonomy/taxa/${encodeURIComponent(selectedResult.taxonId)}`,
          );
          selectedResult = {
            ...selectedResult,
            germanName: selectedDetail.germanNames?.[0]?.name || null,
            englishName: selectedDetail.englishNames?.[0]?.name || null,
            hasVerifiedGermanName: Boolean(selectedDetail.germanNames?.[0]?.name),
          };
          setMessage("Die eigene Namenskorrektur wurde zurückgesetzt.", "success");
        }
        renderDetail();
      } catch (error) {
        button.disabled = false;
        setMessage(error.message || "Die Namenskorrektur konnte nicht gespeichert werden.", "error");
      }
    }

    function setup() {
      renderOverview();
      elements.taxonomyDatabaseOpenButton.addEventListener("click", () => dialogController.open());
      searchInput.addEventListener("input", () => {
        clearTimeout(timer);
        requestVersion += 1;
        timer = setTimeout(() => void search(), SEARCH_DELAY_MS);
      });
      results.addEventListener("click", (event) => {
        const button = event.target.closest("[data-taxonomy-database-taxon]");
        if (button) void selectTaxon(button.dataset.taxonomyDatabaseTaxon);
      });
      detail.addEventListener("click", (event) => {
        const button = event.target.closest("[data-taxonomy-database-correction]");
        if (button) void saveCorrection(button.dataset.taxonomyDatabaseCorrection, button);
      });
    }

    return Object.freeze({ setup });
  }

  global.SpeciesExplorerTaxonomyDatabase = Object.freeze({
    createTaxonomyDatabaseController,
  });
})(globalThis);
