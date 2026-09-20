(function initializeTaxonomyIdentity(global) {
  "use strict";

  const TYPES = Object.freeze({ continuation: "Dieselbe Art – wissenschaftlicher Name geändert",
    split: "Eine Art wurde aufgeteilt", merge: "Mehrere Arten wurden zusammengeführt" });
  const PROVIDERS = Object.freeze({ "catalogue-of-life": "Catalogue of Life", inaturalist: "iNaturalist",
    gbif: "GBIF", worms: "WoRMS", wikidata: "Wikidata", animalia: "Animalia", manual: "Eigene Korrektur", project: "Projekt" });

  function taxonCard(taxon, escapeHtml) {
    const name = taxon.germanName || "Kein deutscher Name hinterlegt";
    return `<div class="taxonomy-master-conflict-copy"><strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(taxon.scientificName)} · ${escapeHtml(taxon.kingdom)}</span>
      <span>${(taxon.evidence || []).map((entry) => escapeHtml(`${PROVIDERS[entry.provider] || entry.provider} · ${entry.providerVersion} · ${entry.providerRecordId}`)).join("<br>") || "Kein Quellenbeleg vorhanden"}</span>
      ${taxon.projects?.length ? `<span>${taxon.projects.length} Projektzuordnung(en) betroffen</span>` : ""}</div>`;
  }

  function previewPresentation(value) {
    const blocked = value.type !== "continuation" && value.sources.reduce((count, taxon) => count + (taxon.projects?.length || 0), 0)
      !== (value.projectAssignments?.length || 0);
    return { title: TYPES[value.type], blocked, effect: value.type === "continuation"
      ? "Die bisherige Master-ID bleibt erhalten. Eigene Namen und Projektverknüpfungen folgen dieser identischen Art."
      : "Die bisherigen Identitäten bleiben historisch erhalten. Nachfolger erhalten neue IDs; eigene Namen werden nicht automatisch übertragen.",
    note: blocked ? "Bitte für jede Projektart unten einen Nachfolger wählen, das Beibehalten der Projekttexte bestätigen und die Auswirkungen erneut prüfen. Bis dahin ist Speichern gesperrt."
      : "Dies merkt nur die Datenbankentscheidung vor. Fotos, Stichwörter und Art-Favoriten bleiben unverändert. Keine automatische Foto-Neuzuordnung." };
  }

  function createIdentityController({ dialog, openButton, fetchJson, escapeHtml, createDialogController, refreshStatus = async () => {} }) {
    const node = (name) => dialog.querySelector(`[data-identity="${name}"]`);
    const selections = { active: [], staging: [] };
    const results = { active: [], staging: [] };
    const versions = { active: 0, staging: 0 };
    let preview = null;
    let cases = [];
    let next = "";
    let busy = false;
    let epoch = 0;
    let pending = false;
    const projectChoices = new Map();
    let projectNamesConfirmed = false;

    function message(text, error = false) {
      node("message").textContent = text;
      node("message").className = `edit-message ${error ? "error" : "info"}`;
      node("message").hidden = !text;
    }
    function buttons() {
      for (const control of dialog.querySelectorAll("input, select, textarea, button")) control.disabled = busy;
      node("save").disabled = busy || !preview || previewPresentation(preview).blocked || !node("ack").checked;
      node("discard").disabled = busy || !pending;
      node("next").disabled = busy || !next;
    }
    function invalidate() {
      preview = null;
      node("preview").hidden = true;
      node("ack").checked = false;
      buttons();
    }
    function renderSelections() {
      projectChoices.clear(); projectNamesConfirmed = false;
      node("project-choices").innerHTML = "";
      for (const slot of ["active", "staging"]) node(`${slot}-selected`).innerHTML = selections[slot].map((taxon, index) =>
        `<article class="taxonomy-database-review-item">${taxonCard(taxon, escapeHtml)}<button type="button" data-identity-remove="${slot}" data-index="${index}">Aus Auswahl entfernen</button></article>`).join("");
      invalidate();
    }
    async function load(after = "") {
      const request = epoch;
      const data = await fetchJson("/api/taxonomy/master/identity/browse", { method: "POST", body: JSON.stringify({ mode: "projects", after }) });
      if (request !== epoch) return;
      cases = data.cases || [];
      next = data.next || "";
      pending = Boolean(data.review);
      node("cases").innerHTML = cases.length ? cases.map((entry, index) =>
        `<article class="taxonomy-database-review-item"><div>${taxonCard(entry.source, escapeHtml)}<span>${escapeHtml(entry.reason)}</span></div><button type="button" data-identity-case="${index}">Zuordnung prüfen</button></article>`).join("")
        : `<p>${escapeHtml(data.message || "Auf dieser Seite wurden keine geänderten Projektzuordnungen gefunden. Ein Split mit gleich gebliebenem Namen kann trotzdem eine gezielte Prüfung benötigen.")}</p>`;
      node("versions").textContent = data.available ? `Bisher: ${data.activeVersion} · Kandidat: ${data.candidateVersion}` : "Kein vergleichbarer Kandidat verfügbar";
      node("pending").textContent = pending ? `Ein noch nicht aktiver Registerstand ist vorgemerkt. Die folgenden Einträge zeigen seine Historie${data.review.truncated ? " (letzte 100)" : ""}; nur die offenen Vormerkungen können verworfen werden.` : "Keine offenen Vormerkungen.";
      node("pending-list").innerHTML = pending ? data.review.events.map((event) => `<article class="taxonomy-database-review-item"><div><strong>${escapeHtml(TYPES[event.type])}</strong><span>${escapeHtml(event.sources.map((taxon) => taxon.scientificName).join(", "))} → ${escapeHtml(event.targets.map((taxon) => taxon.scientificName).join(", "))}</span><span>${escapeHtml(event.reason)}</span></div></article>`).join("") : "";
      buttons();
    }
    async function search(slot) {
      if (busy || !["active", "staging"].includes(slot)) return;
      const request = ++versions[slot];
      const currentEpoch = epoch;
      const query = node(`${slot}-query`).value.trim();
      results[slot] = [];
      node(`${slot}-results`).innerHTML = "";
      if (query.length < 2) { message("Bitte mindestens zwei Zeichen eingeben."); return; }
      try {
        const data = await fetchJson("/api/taxonomy/master/identity/browse", { method: "POST", body: JSON.stringify({ mode: "search", slot, query }) });
        if (request !== versions[slot] || currentEpoch !== epoch) return;
        results[slot] = data.results || [];
        node(`${slot}-results`).innerHTML = results[slot].length ? results[slot].map((taxon, index) =>
          `<article class="taxonomy-database-review-item">${taxonCard(taxon, escapeHtml)}<button type="button" data-identity-add="${slot}" data-index="${index}">Auswählen</button></article>`).join("") : "Keine passenden Arten gefunden.";
        message(data.message || "Suchtreffer sind keine bestätigten Nachfolger. Bitte Quellen und Artabgrenzung prüfen.");
      } catch (error) { if (currentEpoch === epoch && request === versions[slot]) message(error.message, true); }
      buttons();
    }
    function payload() {
      return { type: node("type").value, reason: node("reason").value,
        projectAssignments: projectNamesConfirmed ? [...projectChoices].filter(([, targetId]) => targetId)
          .map(([projectTaxonKey, targetId]) => ({ projectTaxonKey, targetId, namePolicy: "keep-project-local" })) : [],
        sourceIds: selections.active.map((taxon) => taxon.masterTaxonId), targetIds: selections.staging.map((taxon) => taxon.masterTaxonId) };
    }
    function renderProjectChoices(data) {
      const projects = data.type === "continuation" ? [] : data.sources.flatMap((source) => source.projects || []);
      if (!projects.length) { node("project-choices").innerHTML = ""; return; }
      node("project-choices").innerHTML = `<h4>Projektarten ausdrücklich zuordnen</h4><p>Website-Namen, Slugs und Assets bleiben unverändert. Die neue Masterart erhält ihre eigenen Namen. Alte Projektnamen werden nicht als Synonyme der Nachfolger eingetragen.</p>${projects.map((project) => `<label>${escapeHtml(project.projectSlug)} · ${escapeHtml(project.scientificNameAtLink)}<select data-project-target="${escapeHtml(project.projectTaxonKey)}"><option value="">Nachfolger bewusst wählen</option>${data.targetDetails.map((target) => `<option value="${escapeHtml(target.masterTaxonId)}"${projectChoices.get(project.projectTaxonKey) === target.masterTaxonId ? " selected" : ""}>${escapeHtml(target.germanName || target.scientificName)} · ${escapeHtml(target.scientificName)}</option>`).join("")}</select></label>`).join("")}<label><input type="checkbox" data-project-names${projectNamesConfirmed ? " checked" : ""}> Bisherige Projekttexte nur im Projekt behalten, nicht als Namen der Nachfolger übernehmen.</label>`;
    }
    async function act(action) {
      if (busy) return;
      if (action === "save" && (!preview || previewPresentation(preview).blocked || !node("ack").checked)) return;
      busy = true;
      buttons();
      try {
        if (action === "preview") {
          preview = null;
          node("preview").hidden = true;
          const data = await fetchJson("/api/taxonomy/master/identity/preview", { method: "POST", body: JSON.stringify(payload()) });
          preview = data;
          renderProjectChoices(data);
          const view = previewPresentation(data);
          node("preview").innerHTML = `<h4>${escapeHtml(view.title)}</h4><div class="taxonomy-master-conflict-values"><span><strong>Bisher</strong>${data.sources.map((taxon) => taxonCard(taxon, escapeHtml)).join("")}</span><span><strong>Danach</strong>${data.targetDetails.map((taxon) => taxonCard(taxon, escapeHtml)).join("")}</span></div><p>${escapeHtml(view.effect)}</p><p>${escapeHtml(data.reason)}</p><p>${escapeHtml(view.note)}</p>${(data.projectEffects || []).map((effect) => `<p>Projekt ${escapeHtml(effect.projectSlug)} → ${escapeHtml(effect.targetGermanName || effect.targetScientificName)} · ${escapeHtml(effect.targetScientificName)}. Projekttexte bleiben lokal.</p>`).join("")}`;
          node("preview").hidden = false;
          node("ack").checked = false;
          message("Vorschau erstellt. Es wurde nichts gespeichert.");
        } else if (action === "save") {
          const data = await fetchJson("/api/taxonomy/master/identity/save", { method: "POST", body: JSON.stringify({ ...payload(), token: preview.token, confirmed: true }) });
          invalidate();
          await load();
          await refreshStatus();
          message(data.message);
        }
      } catch (error) { invalidate(); message(error.message, true); }
      finally { busy = false; buttons(); }
    }
    async function discard() {
      if (busy || !pending) return;
      busy = true;
      buttons();
      try {
        const data = await fetchJson("/api/taxonomy/master/identity/discard-preview", { method: "POST", body: "{}" });
        // An explicit second click, not a browser confirm or an automatic write.
        node("discard-preview").hidden = false;
        node("discard-message").textContent = `${data.count} offene Vormerkung(en). ${data.message}`;
        node("discard-confirm").onclick = async () => {
          if (busy) return;
          busy = true;
          buttons();
          try {
            await fetchJson("/api/taxonomy/master/identity/discard", { method: "POST", body: JSON.stringify({ token: data.token, confirmed: true }) });
            invalidate();
            await load();
            await refreshStatus();
            message("Offene Vormerkungen verworfen. Aktive Daten und Fotos sind unverändert.");
          } catch (error) { message(error.message, true); }
          finally { node("discard-preview").hidden = true; busy = false; buttons(); }
        };
      } catch (error) { message(error.message, true); }
      finally { busy = false; buttons(); }
    }
    const controller = createDialogController({ dialog, closeButtons: dialog.querySelectorAll("[data-identity-close]"),
      beforeClose: () => !busy,
      afterOpen() { void load().catch((error) => message(error.message, true)); },
      afterClose() {
        epoch += 1;
        selections.active = []; selections.staging = [];
        for (const slot of ["active", "staging"]) {
          results[slot] = []; node(`${slot}-query`).value = ""; node(`${slot}-results`).innerHTML = "";
        }
        node("type").value = ""; node("reason").value = "";
        node("discard-preview").hidden = true;
        renderSelections(); message("");
      } });
    function setup() {
      openButton.addEventListener("click", () => controller.open());
      dialog.querySelector("form").addEventListener("submit", (event) => event.preventDefault());
      dialog.addEventListener("input", (event) => {
        if (event.target === node("ack")) { buttons(); return; }
        for (const slot of ["active", "staging"]) if (event.target === node(`${slot}-query`)) {
          versions[slot] += 1; results[slot] = []; node(`${slot}-results`).innerHTML = "";
        }
        invalidate();
      });
      dialog.addEventListener("change", (event) => {
        if (event.target.dataset?.projectTarget) projectChoices.set(event.target.dataset.projectTarget, event.target.value);
        if (event.target.hasAttribute?.("data-project-names")) projectNamesConfirmed = event.target.checked;
        if (event.target === node("type")) { projectChoices.clear(); projectNamesConfirmed = false; node("project-choices").innerHTML = ""; }
        if (event.target === node("ack")) buttons(); else invalidate();
      });
      dialog.addEventListener("click", (event) => {
        if (busy) return;
        const button = event.target.closest("button");
        if (!button) return;
        const slot = button.dataset.identityAdd || button.dataset.identityRemove;
        if (slot && ["active", "staging"].includes(slot)) {
          const index = Number(button.dataset.index);
          if (button.dataset.identityAdd) {
            const taxon = results[slot][index];
            if (taxon && !selections[slot].some((entry) => entry.masterTaxonId === taxon.masterTaxonId)) selections[slot].push(taxon);
          } else selections[slot].splice(index, 1);
          renderSelections();
        }
        if (button.dataset.identityCase != null) {
          const entry = cases[Number(button.dataset.identityCase)];
          if (entry) { selections.active = [entry.source]; selections.staging = []; renderSelections(); }
        }
      });
      for (const slot of ["active", "staging"]) node(`${slot}-search`).addEventListener("click", () => void search(slot));
      node("next").addEventListener("click", () => void load(next).catch((error) => message(error.message, true)));
      node("make-preview").addEventListener("click", () => void act("preview"));
      node("save").addEventListener("click", () => void act("save"));
      node("discard").addEventListener("click", () => void discard());
      node("discard-cancel").addEventListener("click", () => { node("discard-preview").hidden = true; });
      buttons();
    }
    return { setup, open: controller.open, search, act };
  }
  function setupIdentityController({ fetchJson, escapeHtml, createDialogController, state, document = global.document }) {
    const controller = createIdentityController({
      dialog: document.querySelector("#taxonomy-identity-dialog"),
      openButton: document.querySelector("[data-taxonomy-identity-open]"),
      fetchJson, escapeHtml, createDialogController,
      refreshStatus: () => state.refreshTaxonomyMasterStatus?.(),
    });
    controller.setup();
    return controller;
  }
  global.SpeciesExplorerTaxonomyIdentity = Object.freeze({ setupIdentityController, createIdentityController, taxonCard, previewPresentation });
})(globalThis);
