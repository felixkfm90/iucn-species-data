(function initializeSpeciesExplorerHeader(global) {
  "use strict";

  // Header and its inspection dialog share these presentation nodes. Keeping
  // their selectors here leaves app.js as composition, without moving actions.
  function headerElements(documentRef = global.document) {
    return Object.fromEntries(Object.entries({
      speciesCount: "species-count", assetIssues: "asset-issues", ncCount: "nc-count", manualMapCount: "manual-map-count",
      reportDate: "report-date", editModeToggle: "edit-mode-toggle", editModeStatus: "edit-mode-status",
      databaseStatus: "database-status", databaseTransferButton: "database-transfer-button",
      pipelineMenuButton: "pipeline-menu-button", pipelineStatus: "pipeline-status",
      appMenuButton: "app-menu-button", websiteMenuButton: "website-menu-button", validationIssueNotice: "validation-issue-notice",
      validationOverall: "validation-overall", validationDataCard: "validation-data-card", validationData: "validation-data",
      validationDataDetail: "validation-data-detail", validationAssetsCard: "validation-assets-card", validationAssets: "validation-assets",
      validationAssetsDetail: "validation-assets-detail", validationReportCard: "validation-report-card", validationReport: "validation-report",
      validationReportDetail: "validation-report-detail", validationSpecial: "validation-special", validationDetails: "validation-details",
    }).map(([name, id]) => [name, documentRef.querySelector(`#${id}`)]));
  }

  function setupHeader({ state, elements, createDialogController, onDatabaseActions = () => {},
    documentRef = global.document } = {}) {
    const inspection = documentRef.querySelector("#inspection-dialog");
    const menus = [
      { trigger: elements.appMenuButton, panel: documentRef.querySelector("#app-menu"), editable: false },
      { trigger: elements.websiteMenuButton, panel: documentRef.querySelector("#website-menu"), editable: true },
    ];
    const hasDialog = () => Boolean(documentRef.querySelector("dialog[open]"));
    const permitted = (menu) => !hasDialog() && (!menu.editable || state.editMode === true);
    const items = (menu) => [...menu.panel.querySelectorAll('[role="menuitem"]')]
      .filter((item) => !item.hidden && !item.disabled && (state.editMode === true || !item.classList.contains("edit-only")));
    function close(menu, restoreFocus = false) {
      const wasOpen = !menu.panel.hidden;
      menu.panel.hidden = true;
      menu.trigger.setAttribute("aria-expanded", "false");
      if (wasOpen && restoreFocus) menu.trigger.focus();
    }
    function closeAll(restoreFocus = false) { for (const menu of menus) close(menu, restoreFocus); }
    function open(menu, last = false) {
      if (!permitted(menu) || menu.trigger.disabled) return false;
      closeAll();
      menu.panel.hidden = false;
      menu.trigger.setAttribute("aria-expanded", "true");
      const available = items(menu); (last ? available.at(-1) : available[0])?.focus();
      return true;
    }
    const inspectionController = createDialogController({ dialog: inspection,
      closeButtons: [documentRef.querySelector("#inspection-close"), documentRef.querySelector("#inspection-done")],
      afterClose() { elements.appMenuButton.focus(); } });
    function openInspection() {
      if (hasDialog()) return false;
      closeAll();
      return inspectionController.open();
    }
    for (const menu of menus) {
      menu.trigger.addEventListener("click", () => {
        if (menu.panel.hidden) open(menu); else close(menu, true);
      });
      menu.trigger.addEventListener("keydown", (event) => {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(menu, event.key === "ArrowUp"); }
        else if (event.key === "Escape") close(menu, true);
      });
      menu.panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(menu, true); return; }
        if (event.key === "Tab") { close(menu); return; }
        const available = items(menu), index = available.indexOf(documentRef.activeElement);
        const position = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1
          : event.key === "ArrowDown" ? (index + 1) % available.length
            : event.key === "ArrowUp" ? (index - 1 + available.length) % available.length : -1;
        if (position >= 0 && available[position]) { event.preventDefault(); available[position].focus(); }
      });
      // Guard before existing field-specific click handlers run. Merely opening
      // a menu never starts a data/website operation, and a stale menu cannot act.
      menu.panel.addEventListener("click", (event) => {
        const item = event.target.closest?.('[role="menuitem"]');
        if (!item || !menu.panel.contains(item)) return;
        if (menu.panel.hidden || !permitted(menu) || !items(menu).includes(item)) {
          event.preventDefault(); event.stopImmediatePropagation(); close(menu); return;
        }
        close(menu);
      }, true);
    }
    documentRef.querySelector("#inspection-open").addEventListener("click", openInspection);
    elements.databaseTransferButton.addEventListener("click", () => {
      if (elements.databaseTransferButton.hidden || state.editMode !== true || hasDialog()) return;
      closeAll();
      onDatabaseActions({ section: "transfer" });
    });
    for (const [id, section] of [["header-backup-open", "backup"], ["header-settings-open", "settings"]]) {
      documentRef.querySelector(`#${id}`).addEventListener("click", () => {
        if ((section === "settings" || state.editMode === true) && !hasDialog()) onDatabaseActions({ section });
      });
    }
    for (const type of ["pointerdown", "focusin"]) documentRef.addEventListener(type, (event) => {
      for (const menu of menus) {
        if (!menu.panel.hidden && !menu.panel.contains(event.target) && !menu.trigger.contains(event.target)) close(menu);
      }
    });
    function render() {
      for (const menu of menus) {
        menu.trigger.disabled = menu.editable && state.editMode !== true;
        // Feature controllers own each action's native disabled state. Read
        // mode hides edit-only entries and the capture guard also rejects them.
        if (!permitted(menu)) close(menu);
      }
      elements.websiteMenuButton.title = state.editMode === true ? "FN-Website-Aktionen" : "FN-Website-Aktionen sind im Bearbeitungsmodus verfügbar";
    }
    render();
    return Object.freeze({ render, closeAll, openInspection });
  }

  global.SpeciesExplorerHeader = Object.freeze({ headerElements, setupHeader });
})(globalThis);
