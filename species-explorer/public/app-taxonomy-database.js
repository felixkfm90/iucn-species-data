(function initializeTaxonomyDatabase(global) {
  "use strict";

  const SEARCH_DELAY_MS = 350;
  const POLL_DELAY_MS = 900;
  const UPDATE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
  const MASTER_ACTIVE_STATES = new Set([
    "refreshing",
    "building",
    "activating",
    "rolling-back",
    "syncing-lightroom",
  ]);

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function taxonomyReleaseLabel(release) {
    if (!release) return "";
    const name = release.alias || release.version || release.releaseId || "";
    if (!name) return "";
    return release.issued
      ? `${name} vom ${String(release.issued).split("-").reverse().join(".")}`
      : name;
  }

  function formatSnapshotDate(snapshot) {
    const value = snapshot?.activatedAt || snapshot?.restoredAt || snapshot?.createdAt || "";
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
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

  function referenceLabel(status = {}) {
    const reference = status.reference?.source || status.reference || null;
    return taxonomyReleaseLabel(reference)
      || taxonomyReleaseLabel(status.latest)
      || cleanText(status.activeRelease);
  }

  function sleep(duration) {
    return new Promise((resolve) => global.setTimeout(resolve, duration));
  }

  function taxonomyDatabaseUpdateDecision({
    hasCandidate = false,
    hasWork = false,
    lightroomPackageNeedsRebuild = false,
  } = {}) {
    if (hasCandidate) return "activate";
    if (lightroomPackageNeedsRebuild) return "sync-lightroom";
    return hasWork ? "refresh-and-build" : "current";
  }

  function createTaxonomyDatabaseController({
    state,
    elements,
    fetchJson,
    escapeHtml,
    createDialogController,
    taxonomyReference,
    showQuickConfirm,
    renderDatabaseStatus = () => {},
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
    let databaseBusy = false;

    function referenceIsActive(status = {}) {
      return status.active === true;
    }

    function masterIsActive(status = {}) {
      return status.active === true || MASTER_ACTIVE_STATES.has(status.status);
    }

    function setMessage(text, type = "info") {
      message.hidden = !text;
      message.textContent = text;
      message.className = `edit-message${type ? ` ${type}` : ""}`;
    }

    function setActionMessage(text, type = "") {
      state.setPipelineMessage?.(text, type);
    }

    function renderOverview() {
      const referenceStatus = state.taxonomyMaintenanceSnapshot || {};
      const masterStatus = state.taxonomyMasterSnapshot || {};
      const masterLifecycle = masterStatus.lifecycle || {};
      const active = databaseBusy || referenceIsActive(referenceStatus) || masterIsActive(masterStatus);
      const failed = referenceStatus.status === "failed" || Boolean(masterStatus.error);
      const lightroomPackageNeedsRebuild = masterStatus.lightroomPackage?.needsRebuild === true;
      const partial = masterStatus.status === "partial" || lightroomPackageNeedsRebuild;
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
      const currentRelease = referenceLabel(referenceStatus);
      const activeDate = formatSnapshotDate(masterLifecycle.active);
      const previousDate = formatSnapshotDate(masterLifecycle.previous);

      elements.taxonomyDatabaseOverview?.classList.toggle("updating", active);

      elements.taxonomyDatabaseOverviewSummary.textContent = active
        ? "Taxonomiedatenbank wird aktualisiert"
        : partial
          ? "Lightroom-Suchpaket aktualisieren"
          : failed
          ? "Taxonomiedatenbank prüfen"
          : updateAvailable
            ? "Neuere Datenbankversion verfügbar"
            : masterLifecycle.active
              ? "Datenbank aktuell"
              : "Noch keine Taxonomiedatenbank aktiviert";

      const details = [];
      if (active) {
        details.push(
          cleanText(masterStatus.message)
          || cleanText(referenceStatus.message)
          || "Aktualisierung wird vorbereitet",
        );
      }
      if (counts) details.push(counts);
      if (updateAvailable && latest) details.push(`Verfügbar: ${latest}`);
      if (blockingConflicts) {
        details.push(`${blockingConflicts} Aktualisierungskonflikt(e) benötigen eine Entscheidung`);
      }
      if (projectConflicts) {
        details.push(`${projectConflicts} Projektzuordnung(en) manuell prüfen`);
      }
      if (lightroomPackageNeedsRebuild && masterStatus.status !== "partial") {
        details.push(
          masterStatus.lightroomPackage?.error
          || "Das Lightroom-Suchpaket entspricht nicht dem aktiven Masterstand",
        );
      }
      if (failed) {
        details.push(
          cleanText(masterStatus.message)
          || masterStatus.error
          || referenceStatus.error
          || referenceStatus.message
          || "Aktualisierung fehlgeschlagen",
        );
      }
      if (!details.length) details.push("Umfang, Aktualität und Konflikte werden zusammengeführt");
      elements.taxonomyDatabaseOverviewDetail.textContent = `${details.join(" · ")}.`;

      elements.taxonomyDatabaseCurrentVersion.textContent = [
        currentRelease ? `Aktuell: ${currentRelease}` : "Aktueller Datenbankstand",
        activeDate ? `Gesamtstand ${activeDate}` : "",
      ].filter(Boolean).join(" · ");
      elements.taxonomyDatabasePreviousVersion.textContent = previousDate
        ? `Vorheriger Gesamtstand: ${previousDate}`
        : "Kein vorheriger Gesamtstand vorhanden";
      elements.taxonomyDatabaseUpdateButton.disabled = active;
      elements.taxonomyDatabaseRollbackButton.disabled = active || !masterLifecycle.canRollback;
      renderDatabaseStatus();
    }

    state.renderTaxonomyDatabaseOverview = renderOverview;

    async function refreshSnapshots() {
      const [referenceResult, masterResult] = await Promise.allSettled([
        fetchJson("/api/taxonomy/status"),
        fetchJson("/api/taxonomy/master/status"),
      ]);
      if (referenceResult.status === "fulfilled") {
        state.taxonomyMaintenanceSnapshot = referenceResult.value;
      }
      if (masterResult.status === "fulfilled") {
        state.taxonomyMasterSnapshot = masterResult.value;
      }
      renderOverview();
      return {
        reference: state.taxonomyMaintenanceSnapshot || {},
        master: state.taxonomyMasterSnapshot || {},
      };
    }

    async function waitUntilIdle(path, isActive, label) {
      const deadline = Date.now() + UPDATE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const status = await fetchJson(path);
        if (path.includes("/master/")) state.taxonomyMasterSnapshot = status;
        else state.taxonomyMaintenanceSnapshot = status;
        renderOverview();
        if (!isActive(status)) {
          if (status.status === "partial") {
            throw new Error(
              [status.message, status.error].map(cleanText).filter(Boolean).join(" ")
              || `${label} wurde nur teilweise abgeschlossen.`,
            );
          }
          if (status.status === "failed" || status.error) {
            throw new Error(status.error || status.message || `${label} ist fehlgeschlagen.`);
          }
          return status;
        }
        await sleep(POLL_DELAY_MS);
      }
      throw new Error(`${label} hat das Zeitlimit überschritten.`);
    }

    async function activateCandidate(masterStatus) {
      const lifecycle = masterStatus.lifecycle || {};
      const blocking = Array.isArray(lifecycle.blockingConflicts)
        ? lifecycle.blockingConflicts.length
        : 0;
      if (blocking) {
        throw new Error(
          `${blocking} Aktualisierungskonflikt(e) müssen zuerst unter „Datenbank ansehen und korrigieren“ entschieden werden.`,
        );
      }
      if (!lifecycle.canActivate) return masterStatus;
      const started = await fetchJson("/api/taxonomy/master/activate", {
        method: "POST",
        body: JSON.stringify({ confirmed: true }),
      });
      state.taxonomyMasterSnapshot = started;
      renderOverview();
      return masterIsActive(started)
        ? waitUntilIdle("/api/taxonomy/master/status", masterIsActive, "Datenbankaktivierung")
        : started;
    }

    async function updateDatabase() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomiedatenbank",
        title: "Datenbank aktualisieren?",
        message: "Neue Quellenstände werden geladen, geprüft und anschließend als neuer Gesamtstand übernommen. Bestehende Arten werden bei Konflikten nicht still verändert.",
        confirmLabel: "Datenbank aktualisieren",
      });
      if (!confirmed) return;
      databaseBusy = true;
      state.taxonomyDatabaseBusy = true;
      renderOverview();
      setActionMessage("Taxonomiedatenbank wird aktualisiert. Der bisherige Stand bleibt bis zum Abschluss aktiv.", "info");
      try {
        let { master } = await refreshSnapshots();
        let decision = taxonomyDatabaseUpdateDecision({
          hasCandidate: Boolean(master.lifecycle?.candidate),
          lightroomPackageNeedsRebuild: master.lightroomPackage?.needsRebuild === true,
        });
        if (decision === "sync-lightroom") {
          const started = await fetchJson("/api/taxonomy/master/sync-lightroom", {
            method: "POST",
            body: "{}",
          });
          state.taxonomyMasterSnapshot = started;
          renderOverview();
          if (masterIsActive(started)) {
            await waitUntilIdle(
              "/api/taxonomy/master/status",
              masterIsActive,
              "Lightroom-Suchpaketaktualisierung",
            );
          }
        } else if (decision === "activate") {
          await activateCandidate(master);
        } else {
          const preview = await fetchJson("/api/taxonomy/update/preview", {
            method: "POST",
            body: "{}",
          });
          decision = taxonomyDatabaseUpdateDecision({ hasWork: preview.hasWork });
          if (decision === "current") {
            setActionMessage(
              "Die Taxonomiedatenbank ist bereits aktuell. Es wurde kein Neuaufbau gestartet.",
              "success",
            );
            return;
          }
          const started = await fetchJson("/api/taxonomy/update/start", {
            method: "POST",
            body: JSON.stringify({ token: preview.token }),
          });
          state.taxonomyMaintenanceSnapshot = started;
          renderOverview();
          if (referenceIsActive(started)) {
            await waitUntilIdle("/api/taxonomy/status", referenceIsActive, "Referenzaktualisierung");
          }
          const building = await fetchJson("/api/taxonomy/master/build", {
            method: "POST",
            body: JSON.stringify({ refreshProviders: true }),
          });
          state.taxonomyMasterSnapshot = building;
          renderOverview();
          master = masterIsActive(building)
            ? await waitUntilIdle("/api/taxonomy/master/status", masterIsActive, "Datenbankprüfung")
            : building;
          await activateCandidate(master);
        }
        await refreshSnapshots();
        await loadReview();
        setActionMessage("Taxonomiedatenbank wurde erfolgreich aktualisiert.", "success");
      } catch (error) {
        setActionMessage(error.message || "Die Taxonomiedatenbank konnte nicht aktualisiert werden.", "error");
      } finally {
        databaseBusy = false;
        state.taxonomyDatabaseBusy = false;
        await refreshSnapshots();
      }
    }

    async function rollbackDatabase() {
      const previous = formatSnapshotDate(state.taxonomyMasterSnapshot?.lifecycle?.previous);
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomiedatenbank",
        title: "Vorherigen Stand wiederherstellen?",
        message: `${previous ? `Der Gesamtstand vom ${previous}` : "Der vorherige Gesamtstand"} wird wieder aktiviert. Arten, Slugs und Assets bleiben unverändert.`,
        confirmLabel: "Vorherigen Stand wiederherstellen",
      });
      if (!confirmed) return;
      databaseBusy = true;
      state.taxonomyDatabaseBusy = true;
      renderOverview();
      try {
        const started = await fetchJson("/api/taxonomy/master/rollback", {
          method: "POST",
          body: JSON.stringify({ confirmed: true }),
        });
        state.taxonomyMasterSnapshot = started;
        if (masterIsActive(started)) {
          await waitUntilIdle("/api/taxonomy/master/status", masterIsActive, "Wiederherstellung");
        }
        await refreshSnapshots();
        await loadReview();
        setActionMessage("Der vorherige Taxonomiedatenbankstand wurde wiederhergestellt.", "success");
      } catch (error) {
        setActionMessage(error.message || "Der vorherige Stand konnte nicht wiederhergestellt werden.", "error");
      } finally {
        databaseBusy = false;
        state.taxonomyDatabaseBusy = false;
        await refreshSnapshots();
      }
    }

    const dialogController = createDialogController({
      dialog,
      closeButtons: dialog.querySelectorAll(".taxonomy-database-close"),
      afterOpen() {
        void loadReview();
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

    function reviewConflictCards(maintenanceStatus = {}) {
      return (maintenanceStatus.conflictDetails || [])
        .filter((entry) => entry.classification !== "exact")
        .map((entry) => ({
          type: "project-conflict",
          scientificName: cleanText(entry.scientificName),
          title: cleanText(entry.germanName) || cleanText(entry.scientificName) || "Unbekannte Art",
          detail: entry.classification === "reference-gap"
            ? "Die Artstufe fehlt in CoL; die aktive Masterdatenbank kann die externe Bestätigung übernehmen."
            : cleanText(entry.message) || "Die Projektzuordnung muss geprüft werden.",
          action: entry.classification === "reference-gap" ? "confirm-reference-gap" : "open",
        }));
    }

    function renderReview(review = {}, maintenanceStatus = {}) {
      const conflictCards = reviewConflictCards(maintenanceStatus);
      const conflictNames = new Set(conflictCards.map((entry) => entry.scientificName));
      const missingCards = (review.reviewItems || [])
        .filter((entry) => !conflictNames.has(cleanText(entry.scientificName)))
        .map((entry) => ({
          type: "missing-fields",
          scientificName: cleanText(entry.scientificName),
          title: cleanText(entry.scientificName) || cleanText(entry.projectSlug),
          detail: entry.missingFields?.length
            ? `Fehlend: ${entry.missingFields.join(", ")}.`
            : "Diese Art benötigt eine zusätzliche externe Bestätigung.",
          action: "open",
        }));
      const errorCards = (review.errors || []).map((entry) => ({
        type: "error",
        scientificName: cleanText(entry.scientificName),
        title: cleanText(entry.scientificName) || "Datenbankprüfung",
        detail: cleanText(entry.message) || "Dieser Eintrag muss geprüft werden.",
        action: entry.scientificName ? "open" : "",
      }));
      const cards = [...conflictCards, ...missingCards, ...errorCards];
      elements.taxonomyDatabaseReviewSummary.textContent = cards.length
        ? `${cards.length} offene Prüfung(en)`
        : "Keine offenen Prüfungen";
      elements.taxonomyDatabaseReviewList.innerHTML = cards.length
        ? cards.map((entry) => `
          <article class="taxonomy-database-review-item ${escapeHtml(entry.type)}">
            <div>
              <strong>${escapeHtml(entry.title)}</strong>
              ${entry.scientificName && entry.scientificName !== entry.title
                ? `<em>${escapeHtml(entry.scientificName)}</em>`
                : ""}
              <span>${escapeHtml(entry.detail)}</span>
            </div>
            ${entry.action === "confirm-reference-gap" ? `
              <button type="button" data-taxonomy-review-confirm="${escapeHtml(entry.scientificName)}">
                Mit Masterdatenbank bestätigen
              </button>
            ` : entry.action === "open" ? `
              <button type="button" data-taxonomy-review-open="${escapeHtml(entry.scientificName)}">
                Taxon öffnen
              </button>
            ` : ""}
          </article>
        `).join("")
        : `<p class="taxonomy-database-review-empty">Für die Arten im Explorer fehlen derzeit keine Entscheidungen oder Namensfelder.</p>`;
    }

    async function loadReview() {
      elements.taxonomyDatabaseReviewSummary.textContent = "Wird geladen…";
      try {
        const [review, maintenanceStatus] = await Promise.all([
          fetchJson("/api/taxonomy/review"),
          fetchJson("/api/taxonomy/status"),
        ]);
        state.taxonomyMaintenanceSnapshot = maintenanceStatus;
        renderReview(review, maintenanceStatus);
        renderOverview();
      } catch (error) {
        elements.taxonomyDatabaseReviewSummary.textContent = "Prüfung nicht verfügbar";
        elements.taxonomyDatabaseReviewList.innerHTML = `
          <p class="taxonomy-database-review-empty error">${escapeHtml(error.message || "Offene Prüfungen konnten nicht geladen werden.")}</p>
        `;
      }
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

    async function search(forcedQuery = "") {
      const query = cleanText(forcedQuery || searchInput.value);
      const version = ++requestVersion;
      selectedResult = null;
      selectedDetail = null;
      detail.hidden = true;
      detail.innerHTML = "";
      if (query.length < 2) {
        searchResults = [];
        renderResults();
        setMessage(query ? "Bitte mindestens zwei Zeichen eingeben." : "", "info");
        return [];
      }
      setMessage("Taxa werden in der aktiven Datenbank gesucht …", "info");
      try {
        const payload = await fetchJson(
          `/api/taxonomy/search?q=${encodeURIComponent(query)}&kind=all&kingdomId=all&rank=all&limit=12`,
        );
        if (version !== requestVersion) return [];
        searchResults = payload.results || [];
        renderResults();
        setMessage(
          searchResults.length
            ? `${searchResults.length} Treffer gefunden.`
            : "Kein passender Eintrag gefunden.",
          searchResults.length ? "success" : "warning",
        );
        return searchResults;
      } catch (error) {
        if (version !== requestVersion) return [];
        searchResults = [];
        renderResults();
        setMessage(error.message || "Die Datenbank konnte nicht durchsucht werden.", "error");
        return [];
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
        detail.scrollIntoView({ block: "nearest" });
      } catch (error) {
        if (version !== requestVersion) return;
        setMessage(error.message || "Taxondetails konnten nicht geladen werden.", "error");
      }
    }

    async function openTaxon(scientificName) {
      if (!scientificName) return;
      searchInput.value = scientificName;
      const matches = await search(scientificName);
      const exact = matches.find((entry) => (
        cleanText(entry.scientificName).toLocaleLowerCase("de")
        === scientificName.toLocaleLowerCase("de")
      ));
      if (exact) await selectTaxon(String(exact.taxonId));
    }

    async function confirmReferenceGap(scientificName, button) {
      button.disabled = true;
      try {
        state.taxonomyMaintenanceSnapshot = await fetchJson(
          "/api/taxonomy/project-conflicts/decide",
          {
            method: "POST",
            body: JSON.stringify({
              action: "accept-external-reference-gap",
              scientificName,
            }),
          },
        );
        await loadReview();
        state.refreshTaxonomyMaintenanceStatus?.();
        setMessage(`${scientificName} wurde durch die Masterdatenbank bestätigt.`, "success");
        setActionMessage(`${scientificName} wurde durch die Masterdatenbank bestätigt.`, "success");
      } catch (error) {
        button.disabled = false;
        setMessage(error.message || "Die Projektart konnte nicht bestätigt werden.", "error");
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
          setMessage(
            "Die Namenskorrektur wurde gespeichert. Weitere Korrekturen können gesammelt werden; „Datenbank aktualisieren“ baut sie anschließend gemeinsam in den Masterstand ein.",
            "success",
          );
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
        await loadReview();
      } catch (error) {
        button.disabled = false;
        setMessage(error.message || "Die Namenskorrektur konnte nicht gespeichert werden.", "error");
      }
    }

    function setup() {
      renderOverview();
      elements.taxonomyDatabaseUpdateButton.addEventListener("click", () => void updateDatabase());
      elements.taxonomyDatabaseRollbackButton.addEventListener("click", () => void rollbackDatabase());
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
      elements.taxonomyDatabaseReviewList.addEventListener("click", (event) => {
        const confirmButton = event.target.closest("[data-taxonomy-review-confirm]");
        if (confirmButton) {
          void confirmReferenceGap(confirmButton.dataset.taxonomyReviewConfirm, confirmButton);
          return;
        }
        const openButton = event.target.closest("[data-taxonomy-review-open]");
        if (openButton) void openTaxon(openButton.dataset.taxonomyReviewOpen);
      });
      void refreshSnapshots();
    }

    return Object.freeze({ setup, refresh: refreshSnapshots, loadReview });
  }

  global.SpeciesExplorerTaxonomyDatabase = Object.freeze({
    createTaxonomyDatabaseController,
    taxonomyDatabaseUpdateDecision,
  });
})(globalThis);
