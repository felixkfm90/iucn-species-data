(function initializeTaxonomyMaster(global) {
  "use strict";

  const ACTIVE_STATES = new Set(["refreshing", "building", "activating", "rolling-back"]);
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
  const DECISIONS = Object.freeze([
    ["keep-current", "Bisherigen Wert behalten"],
    ["accept-candidate", "Neuen Wert übernehmen"],
    ["add-alias", "Neuen Wert als Alias ergänzen"],
    ["protect-manual", "Dauerhaft manuell schützen"],
  ]);

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function listLength(value) {
    return Array.isArray(value) ? value.length : 0;
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
    const candidate = lifecycle.candidate;
    const active = lifecycle.active;
    if (ACTIVE_STATES.has(status.status)) return status.message || "Master-Abgleich läuft.";
    if (status.status === "failed") return "Master-Abgleich fehlgeschlagen";
    if (candidate) {
      const count = Number(candidate.summary?.taxa || 0);
      const blocking = listLength(lifecycle.blockingConflicts);
      return blocking
        ? `${count.toLocaleString("de-DE")} Taxa im Kandidaten · ${blocking} Entscheidung(en) offen`
        : `${count.toLocaleString("de-DE")} Taxa im Kandidaten · bereit zur Aktivierung`;
    }
    if (active) {
      const count = Number(active.summary?.taxa || 0);
      return `Aktiver Master: ${count.toLocaleString("de-DE")} Taxa`;
    }
    return "Noch keine Masterdatenbank aktiviert";
  }

  function masterDetail(status = {}) {
    const lifecycle = status.lifecycle || {};
    if (status.error) return `${status.message || "Fehler"} ${status.error}`.trim();
    if (lifecycle.candidate) {
      return "Der Kandidat verändert keine Projektart still. Erst die ausdrückliche Aktivierung ersetzt den aktiven Master.";
    }
    if (lifecycle.active) {
      const activated = lifecycle.active.activatedAt
        ? new Date(lifecycle.active.activatedAt).toLocaleString("de-DE")
        : "unbekannt";
      return `Aktiviert: ${activated}. Anbieterstände und Feldherkunft sind lokal versioniert.`;
    }
    return status.message || "Erstelle zunächst einen prüfbaren Kandidaten aus CoL und den lokalen Anbieter-Ausschnitten.";
  }

  function conflictPresentation(conflict = {}) {
    return {
      id: cleanText(conflict.conflict_id),
      species: cleanText(conflict.canonical_scientific_name) || "Unbekanntes Taxon",
      field: FIELD_LABELS[conflict.field_name] || cleanText(conflict.field_name) || "Taxonomieeintrag",
      type: CONFLICT_LABELS[conflict.conflict_type] || cleanText(conflict.conflict_type),
      currentValue: cleanText(conflict.current_value) || "nicht vorhanden",
      candidateValue: cleanText(conflict.candidate_value) || "nicht vorhanden",
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

    function renderConflicts(conflicts = []) {
      const blocking = conflicts.map(conflictPresentation).filter((entry) => entry.blocking);
      elements.taxonomyMasterConflicts.hidden = blocking.length === 0;
      elements.taxonomyMasterConflicts.innerHTML = blocking.map((entry) => `
        <article class="taxonomy-master-conflict" data-master-conflict="${escapeHtml(entry.id)}">
          <div class="taxonomy-master-conflict-copy">
            <strong>${escapeHtml(entry.species)} · ${escapeHtml(entry.field)}</strong>
            <span>${escapeHtml(entry.type)}</span>
            <span>Bisher: ${escapeHtml(entry.currentValue)} · Neu: ${escapeHtml(entry.candidateValue)}</span>
          </div>
          <div class="taxonomy-master-conflict-actions">
            <select aria-label="Entscheidung für ${escapeHtml(entry.species)}">
              ${DECISIONS.map(([value, label]) => (
                `<option value="${value}">${escapeHtml(label)}</option>`
              )).join("")}
            </select>
            <button type="button" data-master-conflict-save>Entscheidung speichern</button>
          </div>
        </article>
      `).join("");
    }

    function render(status = {}) {
      state.taxonomyMasterSnapshot = status;
      const lifecycle = status.lifecycle || {};
      const active = status.active === true || ACTIVE_STATES.has(status.status);
      elements.taxonomyMasterSummary.textContent = masterSummary(status);
      elements.taxonomyMasterDetail.textContent = masterDetail(status);
      elements.taxonomyMasterProgress.hidden = !active;
      if (active && Number.isFinite(Number(status.progressPercent))) {
        elements.taxonomyMasterProgress.value = Number(status.progressPercent);
      } else if (active) {
        elements.taxonomyMasterProgress.removeAttribute("value");
      }
      renderDiff(lifecycle.candidate);
      renderConflicts(lifecycle.conflicts || []);
      elements.taxonomyMasterBuildButton.disabled = active;
      elements.taxonomyMasterActivateButton.disabled = active || !lifecycle.canActivate;
      elements.taxonomyMasterRollbackButton.disabled = active || !lifecycle.canRollback;
      if (active) renderDatabaseStatus("running");
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
      }
    }

    async function build() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomie-Masterdatenbank",
        title: "Neuen Master-Kandidaten erstellen?",
        message: "CoL, die relevanten Anbieter-Ausschnitte und eigene Korrekturen werden aktualisiert und zu einer prüfbaren Vorschau zusammengeführt. Der aktive Master bleibt unverändert.",
        confirmLabel: "Kandidaten erstellen",
      });
      if (!confirmed) return;
      try {
        render(await fetchJson("/api/taxonomy/master/build", {
          method: "POST",
          body: JSON.stringify({ refreshProviders: true }),
        }));
        setActionMessage("Master-Kandidat wird aufgebaut. Der bisherige Master bleibt aktiv.", "info");
      } catch (error) {
        setActionMessage(error.message, "error");
        await refresh();
      }
    }

    async function decide(event) {
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
        setActionMessage("Konfliktentscheidung wurde im Master-Kandidaten gespeichert.", "success");
      } catch (error) {
        button.disabled = false;
        setActionMessage(error.message, "error");
      }
    }

    async function activate() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomie-Masterdatenbank",
        title: "Geprüften Master-Kandidaten aktivieren?",
        message: "Der Kandidat wird atomar aktiviert. Die bisherige Masterversion bleibt für ein Rollback erhalten. Namen, Slugs und Assets vorhandener Projektarten werden nicht automatisch geändert.",
        confirmLabel: "Master aktivieren",
      });
      if (!confirmed) return;
      try {
        render(await fetchJson("/api/taxonomy/master/activate", {
          method: "POST",
          body: JSON.stringify({ confirmed: true }),
        }));
        setActionMessage("Masterdatenbank wurde erfolgreich aktiviert.", "success");
      } catch (error) {
        setActionMessage(error.message, "error");
        await refresh();
      }
    }

    async function rollback() {
      const confirmed = await showQuickConfirm({
        eyebrow: "Taxonomie-Masterdatenbank",
        title: "Vorherige Masterversion wiederherstellen?",
        message: "Die aktive Masterdatenbank wird auf die unmittelbar vorherige geprüfte Version zurückgesetzt. Projektdaten und Assets bleiben unverändert.",
        confirmLabel: "Vorherigen Master wiederherstellen",
      });
      if (!confirmed) return;
      try {
        render(await fetchJson("/api/taxonomy/master/rollback", {
          method: "POST",
          body: JSON.stringify({ confirmed: true }),
        }));
        setActionMessage("Vorherige Masterversion wurde wiederhergestellt.", "success");
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

    return Object.freeze({ setup, refresh, render });
  }

  global.SpeciesExplorerTaxonomyMaster = Object.freeze({
    conflictPresentation,
    masterDiffItems,
    masterSummary,
    createTaxonomyMasterController,
  });
})(globalThis);
