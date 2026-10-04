(function initializeTaxonomyMaster(global) {
  "use strict";

  const ACTIVE_STATES = new Set([
    "refreshing",
    "building",
    "activating",
    "rolling-back",
    "syncing-lightroom",
    "applying-corrections",
  ]);
  const FIELD_LABELS = Object.freeze({
    "scientific-name": "wissenschaftlicher Name",
    "german-name": "deutscher Name",
    "english-name": "englischer Name",
    kingdom: "Reich",
    phylum: "Stamm",
    subphylum: "Unterstamm",
    class: "Klasse",
    order: "Ordnung",
    suborder: "Unterordnung",
    family: "Familie",
    subfamily: "Unterfamilie",
    genus: "Gattung",
    species: "Art",
    subspecies: "Unterart",
  });
  const CONFLICT_LABELS = Object.freeze({
    "changed-value": "Abweichender Wert",
    "source-removed": "Quelleneintrag fehlt im neuen Anbieterstand",
    "ambiguous-match": "Mehrdeutige Zuordnung",
    "reference-gap": "CoL-Referenzlücke",
    "reference-returned": "CoL-Referenzlücke geschlossen",
  });
  const BASE_DECISIONS = Object.freeze([
    ["keep-current", "Bisherigen Wert behalten"],
    ["accept-candidate", "Neuen Referenzwert übernehmen"],
  ]);
  const NAME_DECISIONS = Object.freeze([
    ["add-alias", "Neuen Namen zusätzlich suchbar machen"],
  ]);
  const PROTECTION_DECISION = Object.freeze([
    "protect-manual",
    "Bisherigen Wert dauerhaft schützen",
  ]);
  const NAME_FIELDS = new Set(["scientific-name", "german-name", "english-name"]);
  const PROVIDER_LABELS = Object.freeze({
    "catalogue-of-life": "Catalogue of Life",
    project: "deine Projektdaten",
    manual: "deine manuelle Korrektur",
    inaturalist: "iNaturalist",
    gbif: "GBIF",
    worms: "WoRMS",
    wikidata: "Wikidata",
    animalia: "lokale Animalia-Ergänzung",
  });

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function listLength(value) {
    if (Array.isArray(value)) return value.length;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  }

  function masterDiffItems(diff = {}) {
    return [
      ["Neue Taxa", listLength(diff.newTaxa), "neu im Kandidaten"],
      ["Geschlossene CoL-Lücken", listLength(diff.closedReferenceGaps), "wieder durch CoL bestätigt"],
      ["Wissenschaftliche Namen", listLength(diff.changedScientificNames), "geändert"],
      ["Deutsche/englische Namen", listLength(diff.changedNames), "geändert"],
      ["Neue Synonyme", listLength(diff.newSynonyms), "ergänzt"],
      ["Veraltet/entfernt", listLength(diff.staleTaxa) + listLength(diff.removedTaxa), "zur Prüfung"],
    ];
  }

  function masterSummary(status = {}) {
    const lifecycle = status.lifecycle || {};
    const snapshot = lifecycle.candidate || lifecycle.active;
    if (!snapshot) return "Noch keine Taxonomiedatenbank aktiviert";
    const summary = snapshot.summary || {};
    return [
      `${Number(summary.taxa || 0).toLocaleString("de-DE")} Taxa`,
      `${Number(summary.germanNames || 0).toLocaleString("de-DE")} deutsche Namen`,
      `${Number(summary.englishNames || 0).toLocaleString("de-DE")} englische Namen`,
    ].join(" · ");
  }

  function masterDetail(status = {}) {
    const lifecycle = status.lifecycle || {};
    if (status.status === "partial") {
      return [status.message, status.error].map(cleanText).filter(Boolean).join(" ");
    }
    if (status.lightroomPackage?.needsRebuild) {
      return status.lightroomPackage.error
        || "Die Masterdatenbank ist aktiv, das Lightroom-Suchpaket muss jedoch neu aufgebaut werden.";
    }
    if (status.error) return `Aktualisierung fehlgeschlagen. ${status.error}`.trim();
    if (ACTIVE_STATES.has(status.status)) {
      return status.message || "Aktualisierung wird vorbereitet und geprüft.";
    }
    if (lifecycle.candidate) {
      const blocking = Number(
        lifecycle.blockingConflictCount ?? listLength(lifecycle.blockingConflicts),
      );
      return blocking
        ? `${blocking} Konflikt(e) benötigen eine Entscheidung. Vorhandene Arten werden nicht automatisch geändert.`
        : "Die geprüfte Aktualisierung ist bereit zur Übernahme. Vorhandene Arten werden nicht automatisch geändert.";
    }
    if (lifecycle.active) {
      return activePairIsCurrent(status)
        ? "Technisch abgeschlossen · keine offenen Entscheidungen. Referenz, Master und Lightroom-Suchpaket stimmen überein."
        : "Bisheriger Masterstand ist aktiv. Quellen- und Lightroom-Paketstand werden getrennt geprüft.";
    }
    return status.message || "Erstelle zunächst eine prüfbare Aktualisierung.";
  }

  // This is a presentation check, not an activation permission. Historical
  // deferrals are not open decisions, but their presence never proves success.
  function activePairIsCurrent(status = {}) {
    const lifecycle = status.lifecycle || {};
    const reference = status.reference || {};
    const searchPackage = status.lightroomPackage || {};
    const masterVersion = cleanText(lifecycle.active?.candidateId || lifecycle.active?.masterVersion);
    const workflow = status.updateWorkflow || {};
    return Boolean(masterVersion)
      && ["idle", "completed"].includes(status.status)
      && status.active !== true
      && !lifecycle.candidate
      && !status.error && !lifecycle.error && !reference.error && !searchPackage.error
      && reference.status === "current" && reference.activeMatchesReference === true
      && reference.needsMasterRebuild !== true
      && searchPackage.status === "current" && searchPackage.needsRebuild !== true
      && cleanText(searchPackage.masterVersion) === masterVersion
      && cleanText(searchPackage.packageVersion) === masterVersion
      && Number(lifecycle.blockingConflictCount ?? lifecycle.blockingConflicts?.length ?? 0) === 0
      && !(lifecycle.blockingConflicts?.length > 0)
      && !(lifecycle.conflicts || []).some((entry) => conflictPresentation(entry).blocking)
      && status.corrections?.pending !== true && !status.corrections?.error
      && status.identities?.pending !== true && !status.identities?.error
      && !(status.buildJob?.available && status.buildJob.status !== "ready")
      && !workflow.active && !workflow.error
      && (!workflow.status || ["idle", "completed"].includes(workflow.status));
  }

  function formatElapsed(startedAt) {
    const started = Date.parse(startedAt || "");
    if (!Number.isFinite(started)) return "";
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function progressDetail(status = {}) {
    const parts = [];
    const progress = global.SpeciesExplorerTaxonomyProgress.taxonomyProgressPresentation({ master: status });
    if (progress) parts.push(progress.detail);
    const elapsed = formatElapsed(status.startedAt);
    if (elapsed) parts.push(`Laufzeit ${elapsed}`);
    return parts.join(" · ");
  }

  function conflictRecommendation(conflict = {}) {
    if (isClassificationConflict(conflict)) {
      return { decision: null, text: "Quellenbeziehung und Reichszuordnung gemeinsam prüfen; keine normale Feldentscheidung" };
    }
    const hasCurrent = Boolean(cleanText(conflict.current_value));
    const hasCandidate = Boolean(cleanText(conflict.candidate_value));
    if (conflict.conflict_type === "reference-returned" && hasCandidate) {
      return { decision: "accept-candidate", text: "Neuen bestätigten Wert übernehmen" };
    }
    if (conflict.conflict_type === "source-removed") {
      return { decision: "keep-current", text: "Bisherigen Wert behalten, bis eine neue Bestätigung vorliegt" };
    }
    if (!hasCurrent && hasCandidate) {
      return { decision: "accept-candidate", text: "Fehlenden Wert aus der neuen Quelle ergänzen" };
    }
    if (["manual", "project"].includes(cleanText(conflict.current_origin_kind))) {
      return { decision: "keep-current", text: "Bisherigen selbst gepflegten Wert behalten" };
    }
    return { decision: "keep-current", text: "Bisherigen Wert zunächst behalten" };
  }

  function conflictExplanation(conflict = {}) {
    if (isClassificationConflict(conflict)) {
      return "CoL liefert zu einem bisherigen Eintrag mit Referenzlücke einen gleichnamigen Eintrag in einem anderen Reich. Die Identität ist noch nicht bestätigt.";
    }
    const field = FIELD_LABELS[conflict.field_name] || cleanText(conflict.field_name) || "Eintrag";
    if (conflict.conflict_type === "source-removed") {
      return `Für das Feld „${field}“ fehlt im neuen Quellenstand ein bisher vorhandener Beleg.`;
    }
    if (conflict.conflict_type === "ambiguous-match") {
      return `Das Feld „${field}“ lässt sich nicht eindeutig einem neuen Quellenwert zuordnen.`;
    }
    if (NAME_FIELDS.has(conflict.field_name)) {
      return `Der bisherige und der neue Quellenstand verwenden unterschiedliche Werte für „${field}“.`;
    }
    return `Die taxonomische Zuordnung bei „${field}“ unterscheidet sich zwischen dem bisherigen und dem neuen Quellenstand.`;
  }

  function providerLabel(provider) {
    const value = cleanText(provider);
    return PROVIDER_LABELS[value] || value || "Quelle nicht angegeben";
  }

  function isClassificationConflict(conflict = {}) {
    return /^classification_[a-f0-9]{64}$/.test(cleanText(conflict.conflict_id));
  }

  function conflictDecisionOptions(fieldName) {
    return [
      ...BASE_DECISIONS,
      ...(NAME_FIELDS.has(fieldName) ? NAME_DECISIONS : []),
      PROTECTION_DECISION,
    ];
  }

  function conflictPresentation(conflict = {}) {
    const recommendation = conflictRecommendation(conflict);
    const scientificName = cleanText(conflict.canonical_scientific_name) || "Unbekanntes Taxon";
    const germanName = cleanText(conflict.german_name);
    return {
      id: cleanText(conflict.conflict_id),
      species: germanName || scientificName,
      scientificName,
      field: FIELD_LABELS[conflict.field_name] || cleanText(conflict.field_name) || "Taxonomieeintrag",
      fieldName: cleanText(conflict.field_name),
      type: CONFLICT_LABELS[conflict.conflict_type] || cleanText(conflict.conflict_type),
      explanation: conflictExplanation(conflict),
      currentValue: cleanText(conflict.current_value) || "nicht vorhanden",
      candidateValue: cleanText(conflict.candidate_value) || "nicht vorhanden",
      currentProvider: providerLabel(conflict.current_provider),
      candidateProvider: providerLabel(conflict.candidate_provider),
      recommendation,
      identityReviewRequired: isClassificationConflict(conflict),
      blocking: ["changed-value", "source-removed", "ambiguous-match"].includes(conflict.conflict_type),
    };
  }

  function createTaxonomyMasterController({
    state,
    elements,
    fetchJson,
    escapeHtml,
    showQuickConfirm,
    renderDatabaseStatus,
  } = {}) {
    let pollTimer = null;
    let classificationBusy = false;
    let classificationSaved = false;
    let deferralSaved = false;
    let classificationSavedCandidateId = null;
    let technicalDetailsKey = null;

    function setActionMessage(message, type = "") {
      state.setPipelineMessage?.(message, type);
    }

    function renderDiff(candidate) {
      const diff = candidate?.diff;
      elements.taxonomyMasterDiff.hidden = !diff;
      elements.taxonomyMasterDiff.innerHTML = !diff ? "" : masterDiffItems(diff)
        .map(([label, count, detail]) => `
          <div class="taxonomy-master-diff-item">
            <strong>${Number(count).toLocaleString("de-DE")} ${escapeHtml(label)}</strong>
            <span>${escapeHtml(detail)}</span>
          </div>
        `).join("");
    }

    function renderTechnicalDetails(lifecycle = {}) {
      const details = elements.taxonomyMasterTechnicalDetails;
      const copy = elements.taxonomyMasterTechnicalDetailsCopy;
      if (!details || !copy) return;
      const snapshot = lifecycle.candidate || lifecycle.active;
      const count = Number(snapshot?.classificationDeferrals?.total || 0);
      const visible = Number.isSafeInteger(count) && count > 0;
      const key = visible ? `${lifecycle.candidate ? "candidate" : "active"}:${cleanText(snapshot.candidateId || snapshot.masterVersion)}:${count}` : "";
      if (key !== technicalDetailsKey || !visible) details.open = false;
      technicalDetailsKey = key;
      details.hidden = !visible;
      copy.innerHTML = visible ? `
        <strong>${count.toLocaleString("de-DE")} ${count === 1 ? "neue CoL-Zuordnung vorerst nicht übernommen" : "neue CoL-Zuordnungen vorerst nicht übernommen"}</strong>
        <p>${lifecycle.candidate ? "Im geprüften Kandidaten bleiben" : "Im aktiven Master bleiben"} die bisherigen Einträge, Master-IDs und eigenen Namen erhalten. Die Verbindung zu diesen neuen CoL-Gegenstücken ist noch nicht eindeutig belegt.</p>
        <p>Die betroffenen Einträge beruhen deshalb weiterhin auf der bisherigen Zuordnung. Diese Quellenzuordnungen sind fachlich noch nicht vollständig geklärt, aber keine aktuell offenen Entscheidungen. Geänderte Quellenbelege werden erneut geprüft; eine automatische Auflösung beim nächsten Update ist nicht garantiert.</p>
      ` : "";
    }

    function renderConflicts(conflicts = [], blockingConflictCount = null, classificationReview = null, actionsBlocked = false) {
      const blocking = conflicts.map(conflictPresentation).filter((entry) => entry.blocking);
      const total = Number(blockingConflictCount ?? blocking.length);
      const classificationTotal = Number(classificationReview?.total || blocking.filter((entry) => entry.identityReviewRequired).length);
      const regular = blocking.filter((entry) => !entry.identityReviewRequired);
      const regularTotal = Math.max(0, total - classificationTotal);
      const format = (value) => Number(value || 0).toLocaleString("de-DE");
      const matching = Number(classificationReview?.matchingProviderId || 0);
      const categoryLabels = { "matching-provider-id": "gleiche Anbieter-ID · Prüfung erforderlich",
        "different-provider-id": "abweichende Anbieter-ID · unklar", "ambiguous-provider-id": "mehrdeutige Belege · unklar",
        "missing-provider-id": "passender Quellenverweis fehlt · unklar" };
      const grouped = !classificationTotal ? "" : `
        <article class="taxonomy-master-conflict taxonomy-master-classification-review">
          <div class="taxonomy-master-conflict-copy">
            <strong>Abweichende Reichszuordnungen prüfen · ${format(classificationTotal)} ${classificationTotal === 1 ? "Fall" : "Fälle"}</strong>
            ${classificationReview ? `<span>${format(matching)} mit übereinstimmender iNaturalist-ID · ${format(classificationTotal - matching)} ohne eindeutigen passenden Quellenverweis</span>` : ""}
            ${classificationReview ? `<span>Abweichende Anbieter-ID: ${format(classificationReview.differentProviderId)} · Mehrdeutige Belege: ${format(classificationReview.ambiguousProviderId)} · Fehlender Verweis: ${format(classificationReview.missingProviderId)}</span>` : ""}
            <span>Eine passende Anbieter-ID ist ein Prüfhinweis, keine bestätigte Identität. Bisherige Master-IDs und Fotos bleiben unverändert. Dieser Kandidat bleibt gesperrt.</span>
            <span>${classificationReview?.acceptanceAvailable === true ? "Passende Quellenfälle können gemeinsam mit ID-Erhalt vorgemerkt werden. Unklare Fälle bleiben gesperrt." : "Für diesen älteren Kandidaten ist die Bündelübernahme noch nicht verfügbar. Bitte mit aktuellem Programmstand erneut prüfen."} Keine normale Feldentscheidung und keine pauschale Zusammenführung.</span>
            ${(classificationReview?.groups || []).map((entry) => `<span>${escapeHtml(entry.previousKingdom)} → ${escapeHtml(entry.newKingdom)}: ${format(entry.count)} ${entry.count === 1 ? "Fall" : "Fälle"} · ${escapeHtml(categoryLabels[entry.category] || "Prüfung erforderlich")}${entry.examples?.length ? ` · z. B. ${escapeHtml(entry.examples.join(", "))}` : ""}</span>`).join("")}
            ${Number(classificationReview?.groupCount) > (classificationReview?.groups || []).length ? `<span>Die Übersicht zeigt die ${format(classificationReview.groups.length)} größten Gruppen von ${format(classificationReview.groupCount)}.</span>` : ""}
          </div>
          <div class="taxonomy-master-conflict-actions"><button type="button" data-catalog-usage${actionsBlocked || classificationBusy ? " disabled" : ""}>FN-Nutzung bestätigen …</button></div>
          <div class="taxonomy-master-conflict-actions"><button type="button" data-classification-automatic${actionsBlocked || classificationBusy ? " disabled" : ""}>Unbenutzte Fälle automatisch vormerken</button></div>
          ${matching && classificationReview?.acceptanceAvailable === true ? `<div class="taxonomy-master-conflict-actions"><button type="button" data-classification-preview${actionsBlocked || classificationBusy || classificationSaved ? " disabled" : ""}>Passende Klassifikationen prüfen …</button></div>` : ""}
          ${classificationTotal > matching && classificationReview?.deferralAvailable === true ? `<div class="taxonomy-master-conflict-actions"><button type="button" data-classification-defer${actionsBlocked || classificationBusy || deferralSaved ? " disabled" : ""}>Unklare Fälle zurückstellen …</button></div>` : ""}
        </article>
      `;
      elements.taxonomyMasterConflicts.hidden = total === 0;
      if (regularTotal > regular.length) {
        elements.taxonomyMasterConflicts.innerHTML = grouped + `
          <div class="taxonomy-master-conflict-overflow">
            <strong>${regularTotal.toLocaleString("de-DE")} technische Konflikte erkannt</strong>
            <span>Dieser Kandidat wird nicht als Liste von Einzelentscheidungen angeboten. Bitte die Masterdatenbank mit dem aktuellen Programmstand neu aufbauen.</span>
          </div>
        `;
        return;
      }
      elements.taxonomyMasterConflicts.innerHTML = grouped + regular.map((entry) => `
        <article class="taxonomy-master-conflict" data-master-conflict="${escapeHtml(entry.id)}">
          <div class="taxonomy-master-conflict-copy">
            <strong>${escapeHtml(entry.species)}</strong>
            ${entry.species === entry.scientificName ? "" : `<span>${escapeHtml(entry.scientificName)}</span>`}
            <span>${escapeHtml(entry.explanation)}</span>
            <div class="taxonomy-master-conflict-values">
              <span><small>Bisher · ${escapeHtml(entry.currentProvider)}</small><strong>${escapeHtml(entry.currentValue)}</strong></span>
              <span><small>Neu · ${escapeHtml(entry.candidateProvider)}</small><strong>${escapeHtml(entry.candidateValue)}</strong></span>
            </div>
            <span class="taxonomy-master-conflict-recommendation">Empfehlung: ${escapeHtml(entry.recommendation.text)}</span>
          </div>
          <div class="taxonomy-master-conflict-actions">
            <select aria-label="Entscheidung für ${escapeHtml(entry.species)}">
              ${conflictDecisionOptions(entry.fieldName).map(([value, label]) => (
                `<option value="${value}"${value === entry.recommendation.decision ? " selected" : ""}>${escapeHtml(label)}</option>`
              )).join("")}
            </select>
            <button type="button" data-master-conflict-save>Entscheidung speichern</button>
          </div>
        </article>
      `).join("");
    }

    function render(status = {}) {
      state.taxonomyMasterSnapshot = status;
      state.renderTaxonomyDatabaseOverview?.();
      const lifecycle = status.lifecycle || {};
      if ((classificationSaved || deferralSaved) && ((lifecycle.candidate?.candidateId && lifecycle.candidate.candidateId !== classificationSavedCandidateId)
          || (status.identities && !status.identities.pending))) {
        classificationSaved = false;
        deferralSaved = false;
      }
      const active = status.active === true || ACTIVE_STATES.has(status.status);
      elements.taxonomyMasterSummary.textContent = masterSummary(status);
      elements.taxonomyMasterDetail.textContent = masterDetail(status);
      elements.taxonomyMasterProgress.hidden = !active;
      elements.taxonomyMasterProgressDetail.hidden = !active;
      elements.taxonomyMasterProgressDetail.textContent = active ? progressDetail(status) : "";
      const measured = global.SpeciesExplorerTaxonomyProgress.taxonomyProgressPresentation({ master: status });
      if (active && measured?.percent !== null && measured?.percent !== undefined) {
        elements.taxonomyMasterProgress.value = measured.percent;
      } else if (active) {
        elements.taxonomyMasterProgress.removeAttribute("value");
      }
      renderDiff(lifecycle.candidate);
      renderConflicts(lifecycle.conflicts || [], lifecycle.blockingConflictCount, lifecycle.candidate?.classificationReview,
        active || (status.identities?.pending && !status.identities.candidateIncludesCurrent
          && status.identities.classificationCandidateId !== lifecycle.candidate?.candidateId));
      renderTechnicalDetails(lifecycle);
      elements.taxonomyMasterBuildButton.disabled = active || classificationBusy;
      elements.taxonomyMasterActivateButton.disabled = active || classificationBusy || !lifecycle.canActivate;
      elements.taxonomyMasterRollbackButton.disabled = active || classificationBusy || !lifecycle.canRollback;
      if (active) renderDatabaseStatus("taxonomy");
      else renderDatabaseStatus();
      clearTimeout(pollTimer);
      pollTimer = active ? setTimeout(refresh, 900) : null;
    }

    async function refresh() {
      try {
        render(await fetchJson("/api/taxonomy/master/status"));
      } catch (error) {
        elements.taxonomyMasterSummary.textContent = "Masterstatus nicht verfügbar";
        elements.taxonomyMasterDetail.textContent = error.message;
        state.taxonomyMasterSnapshot = { status: "failed", error: error.message };
        state.renderTaxonomyDatabaseOverview?.();
      }
    }

    async function build() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomiedatenbank",
        title: "Datenbankänderungen prüfen?",
        message: "Neue Quellenstände und eigene Korrekturen werden zu einer prüfbaren Aktualisierung zusammengeführt. Der aktuelle Datenbestand bleibt bis zur Bestätigung aktiv.",
        confirmLabel: "Prüfung starten",
      });
      if (!confirmed) return;
      try {
        render(await fetchJson("/api/taxonomy/master/build", {
          method: "POST",
          body: JSON.stringify({ refreshProviders: true }),
        }));
        setActionMessage("Datenbankänderungen werden geprüft. Der aktuelle Stand bleibt aktiv.", "info");
      } catch (error) {
        setActionMessage(error.message, "error");
        await refresh();
      }
    }

    async function decide(event) {
      if (event.target.closest("[data-catalog-usage]")) return confirmCatalogUsage();
      if (event.target.closest("[data-classification-automatic]")) return automaticClassification();
      if (event.target.closest("[data-classification-preview]")) return reviewClassification();
      if (event.target.closest("[data-classification-defer]")) return reviewClassification(true);
      const button = event.target.closest("[data-master-conflict-save]");
      if (!button) return;
      const card = button.closest("[data-master-conflict]");
      const decision = card?.querySelector("select")?.value;
      if (!card?.dataset.masterConflict || !decision) return;
      button.disabled = true;
      try {
        render(await fetchJson("/api/taxonomy/master/conflicts/decide", {
          method: "POST",
          body: JSON.stringify({
            conflictId: card.dataset.masterConflict,
            decision,
          }),
        }));
        setActionMessage("Konfliktentscheidung wurde für die Aktualisierung gespeichert.", "success");
      } catch (error) {
        button.disabled = false;
        setActionMessage(error.message, "error");
      }
    }

    async function automaticClassification() {
      if (classificationBusy || ACTIVE_STATES.has(state.taxonomyMasterSnapshot?.status) || state.taxonomyMasterSnapshot?.active) return;
      classificationBusy = true;
      render(state.taxonomyMasterSnapshot);
      try {
        const preview = await fetchJson("/api/taxonomy/master/classification/automatic-preview", { method: "POST", body: "{}" });
        if (!preview.available) throw new Error(preview.message || "FN-Nutzungsstand fehlt oder ist veraltet.");
        const saved = await fetchJson("/api/taxonomy/master/classification/automatic-save", { method: "POST", body: JSON.stringify(preview) });
        setActionMessage(saved.message, saved.saved ? "success" : "info");
      } catch (error) { setActionMessage(error.message, "error"); }
      finally { classificationBusy = false; await refresh(); }
    }

    async function confirmCatalogUsage() {
      if (classificationBusy || ACTIVE_STATES.has(state.taxonomyMasterSnapshot?.status) || state.taxonomyMasterSnapshot?.active) return;
      classificationBusy = true;
      render(state.taxonomyMasterSnapshot);
      try {
        const preview = await fetchJson("/api/taxonomy/master/catalog-usage/preview", { method: "POST", body: "{}" });
        if (!preview?.token || !Array.isArray(preview.catalogs) || !preview.catalogs.length) throw new Error("Die FN-Nutzungsvorschau ist unvollständig. Es wurde nichts bestätigt.");
        const catalogs = preview.catalogs.map((entry) => `${entry.catalogPath}: ${Number(entry.totalPhotos).toLocaleString("de-DE")} Fotos, ${Number(entry.assignedPhotos).toLocaleString("de-DE")} mit FN-Taxonomie`).join("; ");
        const confirmed = await showQuickConfirm({ eyebrow: "FN-Katalognutzung", title: "Alle FN-Kataloge vollständig erfasst?",
          message: `${catalogs}. Bestätige nur, wenn dies alle deine FN-Kataloge sind und seit ihrer Erfassung keine FN-Zuweisungen geändert wurden. Lightroom muss normal geschlossen bleiben. Unbenutzte passende Klassifikationen dürfen künftig mit ID-Erhalt vorgemerkt werden; unklare unbenutzte Gegenstücke werden zurückgestellt. Angelegte Arten, zugewiesene Arten und eigene Entscheidungen bleiben zur Rückfrage geschützt. Diese Bestätigung allein startet keinen Aufbau oder Paketwechsel.`,
          confirmLabel: "Vollständige FN-Nutzung bestätigen" });
        if (!confirmed) return;
        await fetchJson("/api/taxonomy/master/catalog-usage/save", { method: "POST",
          body: JSON.stringify({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true }) });
        setActionMessage("FN-Nutzung bestätigt. Lightroom für den anschließenden Klassifikationsabgleich geschlossen lassen; keine Fotos wurden geändert.", "success");
      } catch (error) { setActionMessage(error.message, "error"); }
      finally { classificationBusy = false; await refresh(); }
    }

    async function reviewClassification(deferred = false) {
      const snapshot = state.taxonomyMasterSnapshot || {};
      if (classificationBusy || (deferred ? deferralSaved : classificationSaved) || snapshot.active || ACTIVE_STATES.has(snapshot.status)
          || (snapshot.identities?.pending && !snapshot.identities.candidateIncludesCurrent
            && snapshot.identities.classificationCandidateId !== snapshot.lifecycle?.candidate?.candidateId)) return;
      classificationBusy = true;
      render(snapshot);
      try {
        const preview = await fetchJson(`/api/taxonomy/master/classification/${deferred ? "deferral-preview" : "preview"}`, { method: "POST", body: "{}" });
        const format = (value) => Number(value || 0).toLocaleString("de-DE");
        const groups = (preview.groups || []).map((entry) => `${entry.previousKingdom} → ${entry.newKingdom}: ${format(entry.count)}`).join("; ");
        const confirmed = await showQuickConfirm({ eyebrow: deferred ? "Unklare Quellenfälle" : "Klassifikation mit ID-Erhalt",
          title: deferred ? "Unklare CoL-Gegenstücke vorerst nicht übernehmen?" : "Passende CoL-Klassifikationen vormerken?",
          message: deferred ? `${format(preview.count)} ${preview.count === 1 ? "unklarer Fall" : "unklare Fälle"}. ${groups}. Nur die neuen CoL-Gegenstücke werden vorerst nicht übernommen. Die bisherigen Arten, Master-IDs, eigenen Namen und Projektlinks bleiben erhalten. Geänderte Quellenfälle werden erneut offen geprüft. Nur Vormerkung; kein automatischer Aufbau, Paketwechsel oder Fotoabgleich.`
            : `${format(preview.count)} ${preview.count === 1 ? "Fall" : "Fälle"} mit eindeutiger übereinstimmender iNaturalist-ID. ${groups}. ${format(preview.remaining)} unklare Fälle bleiben gesperrt. Die ursprünglichen Master-IDs, eigenen Namen und Projektlinks bleiben erhalten. Nur Vormerkung; kein automatischer Aufbau, Paketwechsel oder Fotoabgleich.`,
          confirmLabel: deferred ? "Zurückstellung vormerken" : "Klassifikationen vormerken" });
        if (!confirmed) return;
        const saved = await fetchJson(`/api/taxonomy/master/classification/${deferred ? "deferral-save" : "save"}`, { method: "POST",
          body: JSON.stringify({ token: preview.token, confirmed: true }) });
        if (deferred) deferralSaved = true;
        else classificationSaved = true;
        classificationSavedCandidateId = snapshot.lifecycle?.candidate?.candidateId || null;
        setActionMessage(saved.message, "success");
      } catch (error) {
        setActionMessage(error.message, "error");
      } finally {
        classificationBusy = false;
        await refresh();
      }
    }

    async function activate() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomiedatenbank",
        title: "Geprüfte Aktualisierung übernehmen?",
        message: "Der geprüfte Stand wird atomar aktiviert. Die bisherige Version bleibt für eine Wiederherstellung erhalten. Namen, Slugs und Assets vorhandener Arten werden nicht automatisch geändert.",
        confirmLabel: "Aktualisierung übernehmen",
      });
      if (!confirmed) return;
      try {
        render(await fetchJson("/api/taxonomy/master/activate", {
          method: "POST",
          body: JSON.stringify({ confirmed: true }),
        }));
        setActionMessage(
          "Masterdatenbank wird aktiviert; anschließend wird das Lightroom-Suchpaket neu aufgebaut.",
          "info",
        );
      } catch (error) {
        setActionMessage(error.message, "error");
        await refresh();
      }
    }

    async function rollback() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomiedatenbank",
        title: "Vorherigen Gesamtstand wiederherstellen?",
        message: "Die aktive Taxonomiedatenbank wird auf die unmittelbar vorherige geprüfte Version zurückgesetzt. Artdaten und Assets bleiben unverändert.",
        confirmLabel: "Vorherigen Gesamtstand wiederherstellen",
      });
      if (!confirmed) return;
      try {
        render(await fetchJson("/api/taxonomy/master/rollback", {
          method: "POST",
          body: JSON.stringify({ confirmed: true }),
        }));
        setActionMessage(
          "Vorheriger Masterstand wird wiederhergestellt; anschließend wird das Lightroom-Suchpaket angepasst.",
          "info",
        );
      } catch (error) {
        setActionMessage(error.message, "error");
        await refresh();
      }
    }

    function setup() {
      elements.taxonomyMasterBuildButton.addEventListener("click", () => void build());
      elements.taxonomyMasterActivateButton.addEventListener("click", () => void activate());
      elements.taxonomyMasterRollbackButton.addEventListener("click", () => void rollback());
      elements.taxonomyMasterConflicts.addEventListener("click", (event) => void decide(event));
      state.refreshTaxonomyMasterStatus = refresh;
      void refresh();
    }

    return Object.freeze({ setup, refresh, render, reviewClassification, confirmCatalogUsage, automaticClassification });
  }

  global.SpeciesExplorerTaxonomyMaster = Object.freeze({
    conflictPresentation,
    conflictRecommendation,
    conflictDecisionOptions,
    conflictExplanation,
    masterDiffItems,
    masterSummary,
    activePairIsCurrent,
    progressDetail,
    createTaxonomyMasterController,
  });
})(globalThis);
