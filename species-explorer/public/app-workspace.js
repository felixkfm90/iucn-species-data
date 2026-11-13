(function initializeSpeciesWorkspace(global) {
  "use strict";
  const KEY = "fn-explorer.species-workspace.v1";
  function setupSpeciesWorkspace({ state, fetchJson, loadData, hasOpenDialog = () => false,
    documentRef = global.document, storage } = {}) {
    const select = documentRef.querySelector("#species-workspace"), message = documentRef.querySelector("#species-workspace-status");
    const refresh = documentRef.querySelector("#species-workspace-refresh"), sync = documentRef.querySelector("#species-workspace-sync");
    if (!select || !message || !refresh || !sync) return { render() {}, projectChanged() {} };
    let busy = false, ownMessage = "", projectIdentity = null;
    function clearVisibleWorkspace() {
      state.species = []; state.filtered = []; state.selectedId = "";
      const list = documentRef.querySelector("#species-list"); list?.replaceChildren?.();
      const detail = documentRef.querySelector("#detail-panel");
      if (detail && !detail.querySelector?.("dialog[open]")) { detail.inert = false; detail.textContent = "Artbestand wird geladen…"; }
      else if (detail) detail.inert = true;
    }
    try { storage ??= global.localStorage; if (storage?.getItem(KEY) === "shared-project") state.workspace = "shared-project"; } catch { /* ordinary in-memory selection remains available */ }
    function render() {
      const shared = state.workspace === "shared-project", status = state.workspaceStatus;
      documentRef.body.classList.toggle("shared-species-workspace", shared);
      select.value = state.workspace || "local"; select.disabled = busy || state.dataLoading;
      refresh.hidden = !shared; sync.hidden = !shared;
      refresh.disabled = busy || state.dataLoading;
      sync.disabled = busy || state.dataLoading || !state.editMode || status?.permissions?.canEdit !== true;
      message.textContent = ownMessage || (!shared ? "Lokaler Bestand auf diesem PC"
        : status?.available === false ? "Gemeinsamer Bestand nicht verfügbar. Projektverbindung und Anmeldung prüfen."
          : status ? `${status.connection === "online" ? "Mit dem gemeinsamen Projekt verbunden" : "Offline · geladener Stand"} · ${status.pending || 0} lokale Änderungen · ${status.conflicts || 0} Konflikte${status.legacyCount ? ` · ${status.legacyCount} Arten benötigen noch vollständige Grunddaten` : ""}`
            : "Gemeinsamer Bestand wird geladen…");
      const grid = documentRef.querySelector(".validation-grid");
      if (grid) grid.hidden = shared && status?.available === false;
      if (shared && status?.available === false) {
        for (const id of ["species-count", "asset-issues", "nc-count", "manual-map-count"]) {
          const node = documentRef.querySelector(`#${id}`); if (node) node.textContent = "–";
        }
        const details = documentRef.querySelector("#validation-details");
        if (details) { details.textContent = ""; details.hidden = true; }
        const overall = documentRef.querySelector("#validation-overall");
        if (overall) { overall.textContent = "Projektverbindung prüfen"; overall.classList.toggle("ok", false);
          overall.classList.toggle("warning", false); overall.classList.toggle("error", true); }
        const notice = documentRef.querySelector("#validation-issue-notice");
        if (notice) { notice.hidden = false; notice.textContent = "Gemeinsamer Bestand nicht verfügbar · Projektverbindung unter Einstellungen prüfen"; }
      }
      const create = documentRef.querySelector("#new-species-button");
      const canCreate = !shared || state.editMode === true && status?.available !== false
        && status?.connection === "online" && status?.permissions?.canCreate === true;
      if (create) { create.hidden = shared && !canCreate; create.disabled = busy || state.dataLoading || !canCreate; }
      const reload = documentRef.querySelector("#reload-button");
      if (reload) reload.title = shared ? "Gespeicherten gemeinsamen Stand auf diesem Gerät laden" : "Daten erneut vom lokalen Projekt laden";
      for (const [id, label] of Object.entries(shared ? { "validation-data-label": "Gemeinsamer Bestand", "validation-assets-label": "Medienverweise", "validation-report-label": "Abgleich" }
        : { "validation-data-label": "Eingabe ↔ Pipeline", "validation-assets-label": "Assetstruktur", "validation-report-label": "Report-Abgleich" })) {
        const node = documentRef.querySelector(`#${id}`); if (node) node.textContent = label;
      }
    }
    select.addEventListener("change", async () => {
      const selected = select.value;
      if (busy || state.dataLoading || hasOpenDialog() || !["local", "shared-project"].includes(selected)) {
        ownMessage = "Bitte die geöffnete Bearbeitung oder den Ladevorgang zuerst abschließen."; render(); return;
      }
      state.workspace = selected; state.workspaceEpoch = (state.workspaceEpoch || 0) + 1;
      state.notice = ""; ownMessage = ""; clearVisibleWorkspace();
      try { storage?.setItem(KEY, selected); } catch { /* the current selection still works */ }
      render(); await loadData(); render();
    });
    async function action(name) {
      const inspection = documentRef.querySelector("#inspection-dialog");
      const blockingDialog = hasOpenDialog() && (inspection?.open !== true
        || Boolean(documentRef.querySelector("dialog[open]:not(#inspection-dialog)")));
      if (busy || state.dataLoading || state.workspace !== "shared-project" || blockingDialog
        || name === "sync" && (!state.editMode || state.workspaceStatus?.permissions?.canEdit !== true)) return;
      busy = true; ownMessage = name === "sync" ? "Lokale Änderungen werden abgeglichen…" : "Serverstand wird gelesen…"; render();
      try {
        const result = await fetchJson(`/api/shared-project/${name}`, { method: "POST", body: "{}" });
        ownMessage = result?.pageAuthoringReconciliation?.checked === false || result?.websiteAltReconciliation?.checked === false
          ? "Projektabgleich bestätigt. Offene Website-Entwürfe und Bildtexte bitte in ihrer jeweiligen Ansicht prüfen." : "";
        state.notice = ""; await loadData();
      }
      catch { ownMessage = "Abgleich nicht bestätigt. Gespeicherte Entwürfe bleiben erhalten; Verbindung und offene Konflikte prüfen."; await loadData(); }
      finally { busy = false; render(); }
    }
    refresh.addEventListener("click", () => { void action("refresh"); });
    sync.addEventListener("click", () => { void action("sync"); });
    render();
    function projectChanged(project) {
      const status = project.status || {}, signature = JSON.stringify([status.baseUrl || "", status.projectId || "", status.user?.id || "",
        status.user?.role || "", status.user?.version ?? null, status.readOnlySession === true,
        project.permissions?.canRead === true, project.permissions?.canEdit === true, project.permissions?.canCreate === true]);
      if (signature === projectIdentity) return;
      projectIdentity = signature;
      if (state.workspace !== "shared-project") return;
      state.workspaceEpoch = (state.workspaceEpoch || 0) + 1;
      state.notice = "";
      state.workspaceStatus = { source: "shared-project", available: false, permissions: {} }; clearVisibleWorkspace(); render();
      const detail = documentRef.querySelector("#detail-panel");
      if (detail?.querySelector?.("dialog[open]")) state.pendingRevisionReload = true;
      else void loadData();
    }
    return { render, projectChanged };
  }
  global.SpeciesExplorerWorkspace = Object.freeze({ setupSpeciesWorkspace });
})(globalThis);
