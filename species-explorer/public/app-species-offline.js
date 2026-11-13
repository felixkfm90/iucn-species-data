(function initializeSpeciesOffline(global) {
  "use strict";
  const slots = ["portrait.webp", "map.jpg", "sound.mp3", "spectrogram.webp"];
  const bytes = value => value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;

  function createSpeciesOfflineController({ state, detailPanel, species, fetchJson, documentRef = global.document } = {}) {
    const openButton = detailPanel?.querySelector(".species-offline-open");
    if (!openButton || species?.source !== "shared-project") return null;
    const epoch = state.workspaceEpoch || 0, owner = JSON.stringify([state.workspaceStatus?.user?.id, state.workspaceStatus?.user?.role]);
    const create = (tag, text) => { const node = documentRef.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
    const dialog = create("dialog"), header = create("header"), title = create("h2", "Artdateien offline verwenden");
    dialog.className = "edit-dialog species-offline-dialog";
    const message = create("p"), list = create("div"), summary = create("p"), actions = create("div");
    message.setAttribute("role", "status"); actions.className = "dialog-actions";
    const close = create("button", "Schließen"), refresh = create("button", "Auswahl neu prüfen"), download = create("button", "Auswahl herunterladen");
    for (const button of [close, refresh, download]) button.type = "button";
    header.append(title); actions.append(close, refresh, download);
    dialog.append(header, create("p", "Wähle die Artdateien, die auf diesem PC auch ohne Verbindung verfügbar sein sollen. Zusätzliche Websitefotos sind hier nicht enthalten."), message, list, summary, actions);
    detailPanel.append(dialog);
    let generation = 0, busy = false, disposed = false, preview = null, choices = [];
    const permitted = () => !disposed && state.workspace === "shared-project" && (state.workspaceEpoch || 0) === epoch
      && state.selectedId === species.id && state.workspaceStatus?.sourceScope === species.sourceScope
      && ["online", "offline"].includes(state.workspaceStatus?.connection)
      && state.workspaceStatus?.permissions?.canRead === true
      && owner === JSON.stringify([state.workspaceStatus?.user?.id, state.workspaceStatus?.user?.role]);
    const current = request => request === generation && permitted();
    const closeDialog = () => { if (typeof dialog.close === "function") dialog.close(); else dialog.open = false; };
    function update() {
      const selected = choices.filter(choice => choice.input.checked), total = selected.reduce((sum, choice) => sum + choice.file.bytes, 0);
      summary.textContent = selected.length ? `${selected.length} ausgewählt · ${bytes(total)}` : "Keine Dateien ausgewählt";
      download.disabled = busy || !permitted() || state.workspaceStatus?.connection !== "online" || !preview?.downloadAvailable || selected.length === 0;
      refresh.disabled = busy || !permitted(); close.disabled = busy;
      for (const choice of choices) choice.input.disabled = busy;
      openButton.disabled = !permitted(); openButton.hidden = !permitted();
    }
    function checkedPreview(value) {
      if (!value || value.sourceScope !== species.sourceScope || value.revision !== species.revision || value.editRevision !== species.editRevision
        || typeof value.downloadAvailable !== "boolean" || !Array.isArray(value.files) || value.files.length > 4
        || value.externalPublication !== "not-performed" || new Set(value.files.map(file => file.slot)).size !== value.files.length
        || value.files.some(file => !slots.includes(file.slot) || typeof file.label !== "string" || file.label.length > 100
          || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > (file.slot === "sound.mp3" ? 50 : 20) * 1024 * 1024
          || typeof file.localAvailable !== "boolean")) throw new Error("Die Artdateiauswahl ist nicht eindeutig bestätigt. Bitte neu laden.");
      return value;
    }
    function render(value) {
      preview = checkedPreview(value); choices = []; list.replaceChildren();
      for (const file of preview.files) {
        const label = create("label"), input = create("input"); input.type = "checkbox"; input.checked = !file.localAvailable;
        const text = create("span", `${file.label} · ${bytes(file.bytes)}${file.localAvailable ? " · Bereits offline verfügbar" : ""}`);
        label.className = "species-offline-choice";
        label.append(input, text);
        input.addEventListener("change", update); list.append(label); choices.push({ input, file, text });
      }
      if (!preview.files.length) list.append(create("p", "Für diese Art sind noch keine festen Artdateien hinterlegt."));
      message.textContent = preview.hasPendingChanges ? "Bitte die eigenen Artänderungen und Konflikte zuerst abgleichen. Vorhandene Offlineinhalte bleiben erhalten."
        : !preview.downloadAvailable && preview.files.length ? "Vorhandene Dateien bleiben offline nutzbar. Neue Downloads benötigen eine Verbindung und eine bestätigte Artfassung." : "";
    }
    async function load() {
      if (busy || !permitted()) return;
      const request = ++generation; busy = true; preview = null; choices = []; list.replaceChildren(); message.textContent = "Artdateien werden geprüft …"; update();
      try {
        const value = await fetchJson(`/api/shared-project/species/${encodeURIComponent(species.id)}/offline/preview`, { method: "POST",
          body: JSON.stringify({ sourceScope: species.sourceScope, expectedRevision: species.revision, expectedEditRevision: species.editRevision }) });
        if (current(request)) render(value);
      } catch (error) { if (current(request)) message.textContent = error.message || "Die Artdateiauswahl konnte nicht geprüft werden."; }
      finally { if (request === generation) { busy = false; update(); } }
    }
    openButton.addEventListener("click", () => {
      if (!permitted()) return;
      if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.open = true;
      void load();
    });
    refresh.addEventListener("click", () => { void load(); });
    close.addEventListener("click", () => { if (!busy) { generation++; closeDialog(); } });
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); else generation++; });
    download.addEventListener("click", async () => {
      if (busy || !permitted() || state.workspaceStatus?.connection !== "online" || !preview?.downloadAvailable) return;
      const selection = choices.filter(choice => choice.input.checked).map(choice => ({ slot: choice.file.slot, bytes: choice.file.bytes }));
      if (!selection.length) return;
      const request = ++generation; busy = true; preview = null; message.textContent = "Ausgewählte Artdateien werden heruntergeladen und geprüft …"; update();
      try {
        const value = await fetchJson(`/api/shared-project/species/${encodeURIComponent(species.id)}/offline/download`, { method: "POST",
          body: JSON.stringify({ sourceScope: species.sourceScope, expectedRevision: species.revision, expectedEditRevision: species.editRevision, slots: selection.map(file => file.slot) }) });
        if (!current(request)) return;
        if (!value || typeof value.complete !== "boolean" || value.externalPublication !== "not-performed" || !Array.isArray(value.completed)
          || value.completed.length > selection.length || value.completed.some((file, index) => file.slot !== selection[index].slot || file.bytes !== selection[index].bytes)
          || (value.complete ? value.completed.length !== selection.length || value.stopped !== null
            : value.completed.length >= selection.length || value.stopped?.slot !== selection[value.completed.length].slot))
          throw new Error("Der Download wurde nicht eindeutig bestätigt. Bitte die Auswahl neu prüfen.");
        for (const choice of choices) if (value.completed.some(file => file.slot === choice.file.slot)) {
          choice.file.localAvailable = true; choice.input.checked = false;
          choice.text.textContent = `${choice.file.label} · ${bytes(choice.file.bytes)} · Bereits offline verfügbar`;
        }
        message.textContent = value.complete ? `${value.completed.length} Artdatei${value.completed.length === 1 ? " ist" : "en sind"} vollständig offline gespeichert.`
          : `${value.completed.length} Artdateien gespeichert. ${typeof value.stopped.message === "string" && value.stopped.message.length <= 800
            ? value.stopped.message : "Die nächste Datei ist noch offen. Bitte die Auswahl neu prüfen; bereits gespeicherte Dateien bleiben erhalten."}`;
      } catch (error) { if (current(request)) message.textContent = error.message || "Der Download wurde nicht bestätigt. Bitte die Auswahl neu prüfen."; }
      finally { if (request === generation) { busy = false; update(); } }
    });
    update();
    return Object.freeze({
      stateChanged() { if (!permitted()) { generation++; busy = false; preview = null; closeDialog(); } update(); },
      dispose() { disposed = true; generation++; closeDialog(); dialog.remove(); },
    });
  }
  global.SpeciesExplorerNormalOffline = Object.freeze({ createSpeciesOfflineController });
})(globalThis);
