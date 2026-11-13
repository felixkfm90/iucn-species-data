(function initializeSpeciesEnrichment(global) {
  "use strict";

  const modes = { missing: "Fehlende Daten und Dateien ergänzen", all: "Fachdaten und Dateien aktualisieren", "nc-sounds": "Alternative Tonaufnahme suchen" };
  const labels = { "map.jpg": "Verbreitungskarte", "sound.mp3": "Tonaufnahme", "spectrogram.webp": "Spektrogramm", "portrait.webp": "Artporträt",
    "credits.json": "Quellenangaben zur Tonaufnahme", "editorial.generatedGeneral": "Automatischer Abschnitt Allgemein",
    "editorial.normalAssets": "Dateiverweise der Artseite", "taxonomyOverride.automaticFields": "Automatische Taxonomiewerte",
    assessmentBinding: "Zugehörige IUCN-Bewertung", URLSlug: "Artkennung", "Assessment ID": "IUCN-Bewertungsnummer",
    Kingdom: "Reich", Phylum: "Stamm", Subphylum: "Unterstamm", Class: "Klasse", Order: "Ordnung", Family: "Familie", Genus: "Gattung", Species: "Art" };
  const fieldLabel = field => labels[field] || labels[field.replace(/^(?:assets\.files|generated)\./, "")]
    || (field.startsWith("assets.credits.") ? `Quellenangabe · ${field.split(".").at(-1)}` : field.replace(/^generated\./, ""));
  const display = value => value === null ? "–" : typeof value === "object"
    ? `${(value.bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KB` : String(value);
  const mediaSlots = new Set(["map.jpg", "portrait.webp", "sound.mp3", "spectrogram.webp"]);
  const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const revision = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
  const pendingOrder = value => value && hash(value.candidateId) && revision(value.changeId)
    && ["queued", "uncertain"].includes(value.state) && (value.acceptedRevision === null || revision(value.acceptedRevision));
  const displayValue = value => value === null || typeof value === "string" || value && Number.isSafeInteger(value.bytes) && value.bytes >= 0;
  const invalid = () => new Error("Der Vorschlagsstand wurde nicht eindeutig bestätigt. Bitte die Art neu öffnen.");

  function createSpeciesEnrichmentController({ state, detailPanel, species, fetchJson, loadData, releaseMediaWithin = () => {}, documentRef = global.document }) {
    const open = detailPanel.querySelector(".species-enrichment-open");
    if (!open) return null;
    const epoch = state.workspaceEpoch || 0;
    const create = (tag, text) => { const node = documentRef.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
    const button = text => { const node = create("button", text); node.type = "button"; return node; };
    const dialog = create("dialog"), header = create("header"), title = create("h2", `Artvorschlag · ${species.germanName}`);
    const close = button("Schließen"), prepare = button("Vorschlag vorbereiten"), cancel = button("Vorbereitung abbrechen"),
      stage = button("Zur Übernahme vormerken"), sync = button("Jetzt abgleichen");
    const select = create("select"), label = create("label", "Umfang "), message = create("p"), result = create("div"), actions = create("div");
    dialog.className = "edit-dialog species-enrichment-dialog";
    dialog.setAttribute("aria-label", title.textContent);
    message.setAttribute("role", "status"); actions.className = "dialog-actions";
    label.append(select); header.append(title, close); actions.append(prepare, cancel, stage, sync);
    dialog.append(header, create("p", "Prüfe die vorgeschlagenen Fachdaten und Artdateien. Der Abgleich speichert einen gemeinsamen Entwurf. Die interne Leserfreigabe folgt separat."),
      label, message, result, actions); detailPanel.append(dialog);

    let disposed = false, generation = 0, busy = "", abort = null, candidate = null, pending = null, prepareBlocked = false, reloadOnClose = false;
    const permitted = () => !disposed && state.editMode && state.workspace === "shared-project" && (state.workspaceEpoch || 0) === epoch
      && state.selectedId === species.id && state.workspaceStatus?.sourceScope === species.sourceScope && state.workspaceStatus?.permissions?.canEdit === true;
    const online = () => state.workspaceStatus?.connection === "online";
    const current = request => generation === request && permitted();
    const request = (action, body = {}, signal) => fetchJson(`/api/shared-project/species/${encodeURIComponent(species.id)}/enrichment/${action}`,
      { method: "POST", body: JSON.stringify({ sourceScope: species.sourceScope, ...body }), ...(signal ? { signal } : {}) });
    function update() {
      open.hidden = !permitted(); open.disabled = !permitted();
      prepare.hidden = Boolean(pending || reloadOnClose); label.hidden = prepare.hidden; prepare.disabled = Boolean(busy || prepareBlocked || !online() || !select.value || reloadOnClose);
      select.disabled = prepare.disabled; stage.hidden = Boolean(pending || !candidate?.candidateId);
      stage.disabled = Boolean(busy || !online() || !candidate?.complete || reloadOnClose);
      sync.hidden = !pending; sync.disabled = Boolean(busy || !online());
      cancel.hidden = busy !== "prepare"; close.disabled = busy === "stage" || busy === "sync";
    }
    function show(value) {
      if (value && (!Object.hasOwn(modes, value.mode) || typeof value.complete !== "boolean"
        || !(value.candidateId === null && value.targetDataHash === null || hash(value.candidateId) && hash(value.targetDataHash) && value.complete)
        || !Array.isArray(value.issues) || value.issues.some(issue => typeof issue?.message !== "string")
        || !Array.isArray(value.changes) || value.changes.some(change => typeof change?.field !== "string"
          || !displayValue(change.before) || !displayValue(change.after)))) throw invalid();
      candidate = value; releaseMediaWithin(result, { includeImages: true }); result.replaceChildren();
      if (!value) return;
      for (const issue of value.issues) result.append(create("p", issue.message));
      if (!value.changes.length) { result.append(create("p", value.complete ? "Die Prüfung hat keine Änderungen ergeben." : "Für diesen Lauf ist eine erneute Prüfung erforderlich.")); return; }
      const table = create("table"), head = create("thead"), heading = create("tr"), body = create("tbody");
      for (const label of ["Feld", "Bisher", "Vorschlag"]) { const cell = create("th", label); cell.scope = "col"; heading.append(cell); }
      head.append(heading);
      for (const change of value.changes) {
        const row = create("tr"), field = create("th", fieldLabel(change.field)); field.scope = "row";
        row.append(field, create("td", display(change.before)), create("td", display(change.after))); body.append(row);
      }
      table.append(head, body);
      for (const change of value.candidateId ? value.changes : []) {
        if (!change.field.startsWith("assets.files.") || !change.after) continue;
        const slot = change.field.slice("assets.files.".length);
        if (!mediaSlots.has(slot)) continue;
        const details = create("details"), summary = create("summary", `${fieldLabel(change.field)} · Vorschau`);
        details.append(summary); result.append(details);
        let loaded = false;
        details.addEventListener("toggle", () => {
          if (!details.open || loaded || !permitted()) return;
          loaded = true;
          const sound = slot === "sound.mp3", media = create(sound ? "audio" : "img");
          if (sound) { media.controls = true; media.preload = "none"; }
          else media.alt = `${fieldLabel(change.field)} im Artvorschlag`;
          media.src = `/api/shared-project/species/${encodeURIComponent(species.id)}/enrichment/${encodeURIComponent(value.candidateId)}/file/${slot}?scope=${encodeURIComponent(species.sourceScope)}`;
          media.addEventListener("error", () => { details.append(create("p", "Diese Vorschau konnte nicht geöffnet werden.")); });
          details.append(media);
        });
      }
      result.append(table);
    }
    function showStatus(value, preserveMessage) {
      if (!value || !(value.pending === null || pendingOrder(value.pending)) || typeof value.busy !== "boolean"
        || typeof value.hasPendingChanges !== "boolean" || !Array.isArray(value.modes)) throw invalid();
      pending = value.pending; prepareBlocked = value.busy || value.hasPendingChanges;
      const oldMode = select.value;
      select.replaceChildren(...value.modes.filter(mode => Object.hasOwn(modes, mode)).map(mode => {
        const option = create("option", modes[mode]); option.value = mode; return option;
      }));
      if (value.modes.includes(oldMode)) select.value = oldMode;
      show(value.candidate);
      if (preserveMessage) return;
      message.textContent = pending?.acceptedRevision ? "Der Entwurf ist gespeichert. Beim nächsten Abgleich werden die Dateien weiter geprüft."
        : pending ? "Der Vorschlag ist vorgemerkt. Du kannst ihn jetzt mit dem gemeinsamen Projekt abgleichen."
          : value.hasPendingChanges ? "Bitte zuerst die offenen Änderungen dieser Art abgleichen."
            : !online() ? "Gespeicherte Vorschläge kannst du hier prüfen. Vorbereitung und Übernahme benötigen eine Verbindung."
              : !value.modes.length ? "Für die Vorbereitung fehlen die Quellenzugänge auf diesem PC." : value.candidate ? "Gespeicherter Vorschlag" : "";
    }
    async function act(action, work, fallback) {
      if (busy || !permitted()) return;
      const key = ++generation; busy = action; update();
      try { await work(key); }
      catch (error) { if (current(key)) message.textContent = error.name === "AbortError" ? "Vorbereitung abgebrochen." : error.message || fallback; }
      finally { if (key === generation) { busy = ""; abort = null; update(); } }
    }
    function closeDialog() {
      const refresh = reloadOnClose;
      generation++; abort?.abort(); abort = null; busy = ""; show(null); dialog.close();
      if (refresh) { reloadOnClose = false; void loadData(); }
    }
    open.addEventListener("click", () => {
      if (!permitted()) return;
      dialog.showModal(); message.textContent = "Vorschlagsstatus wird geladen …"; show(null); pending = null;
      void act("status", async key => { const value = await request("status"); if (current(key)) showStatus(value, false); }, "Der Vorschlagsstatus konnte nicht geladen werden.");
    });
    prepare.addEventListener("click", () => void act("prepare", async key => {
      show(null); message.textContent = "Die Quellen und vorhandenen Artdateien werden geprüft …"; abort = new AbortController();
      const value = await request("prepare", { mode: select.value, expectedRevision: species.revision, expectedEditRevision: species.editRevision }, abort.signal);
      if (current(key)) { show(value); message.textContent = value.candidateId ? "Vorschlag gespeichert. Bitte die Änderungen prüfen." : "Quellenprüfung abgeschlossen."; }
    }, "Der Artvorschlag konnte nicht vorbereitet werden."));
    cancel.addEventListener("click", () => abort?.abort());
    stage.addEventListener("click", () => void act("stage", async key => {
      if (!candidate?.candidateId) return;
      const { candidateId, targetDataHash } = candidate;
      const value = await request("stage", { candidateId, targetDataHash });
      if (!current(key)) return;
      if (!pendingOrder(value) || value.candidateId !== candidateId) throw invalid();
      pending = value; reloadOnClose = true; show(null); message.textContent = "Der Vorschlag ist vorgemerkt. Der Abgleich ist jetzt möglich.";
    }, "Der Artvorschlag konnte nicht vorgemerkt werden."));
    sync.addEventListener("click", () => void act("sync", async key => {
      if (!pending?.changeId) return;
      message.textContent = "Der Entwurf und seine Dateien werden abgeglichen …";
      try {
        const value = await request("sync", { changeId: pending.changeId });
        if (!current(key)) return;
        if (!value || value.changeId !== pending.changeId || value.speciesId !== species.id || !revision(value.currentRevision)
          || ![value.confirmedFiles, value.supersededFiles].every(count => Number.isSafeInteger(count) && count >= 0 && count <= 4)) throw invalid();
        pending = null; reloadOnClose = true; show(null);
        const files = value.confirmedFiles ? ` ${value.confirmedFiles} ${value.confirmedFiles === 1 ? "Artdatei" : "Artdateien"} bestätigt.` : "";
        const skipped = value.supersededFiles ? ` Inzwischen ersetzt: ${value.supersededFiles} ${value.supersededFiles === 1 ? "Datei" : "Dateien"}.` : "";
        message.textContent = `Entwurf abgeglichen.${files}${skipped} Die interne Freigabe ist ein eigener Schritt.`;
      } catch (error) {
        if (current(key)) {
          reloadOnClose = true;
          try { const status = await request("status"); if (current(key)) showStatus(status, true); } catch { /* keep last known request and its error */ }
        }
        throw error;
      }
    }, "Der Abgleich konnte nicht bestätigt werden. Bitte den Status erneut prüfen."));
    close.addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", event => { event.preventDefault(); if (!close.disabled) closeDialog(); });
    update();
    return Object.freeze({
      stateChanged() { if (!permitted() && dialog.open) closeDialog(); update(); },
      dispose() { disposed = true; generation++; abort?.abort(); show(null); dialog.remove(); },
    });
  }

  global.SpeciesExplorerEnrichment = Object.freeze({ createSpeciesEnrichmentController });
})(globalThis);
