(function initializeSpeciesExplorerConfirmation(global) {
  "use strict";

  function createQuickConfirm({
    documentRef = global.document,
    escapeHtml,
    createDialogController,
  } = {}) {
    if (!documentRef?.createElement || !documentRef?.body?.append) {
      throw new TypeError("Kurzbestätigung benötigt ein Dokument mit body.");
    }
    if (typeof escapeHtml !== "function") {
      throw new TypeError("Kurzbestätigung benötigt escapeHtml als Funktion.");
    }
    if (typeof createDialogController !== "function") {
      throw new TypeError("Kurzbestätigung benötigt createDialogController als Funktion.");
    }

    return function showQuickConfirm({
      eyebrow = "",
      title = "Bestätigen",
      message = "",
      confirmLabel = "Ja",
      cancelLabel = "Abbrechen",
      danger = false,
    } = {}) {
      return new Promise((resolve) => {
        const dialog = documentRef.createElement("dialog");
        dialog.className = "edit-dialog quick-confirm-dialog";
        dialog.innerHTML = `
          <form method="dialog" class="quick-confirm-form">
            ${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
            <h2>${escapeHtml(title)}</h2>
            ${message ? `<p>${escapeHtml(message)}</p>` : ""}
            <div class="dialog-actions">
              ${cancelLabel ? `<button class="quick-confirm-cancel" type="button">${escapeHtml(cancelLabel)}</button>` : ""}
              <button class="quick-confirm-ok ${danger ? "danger" : ""}" type="submit">${escapeHtml(confirmLabel)}</button>
            </div>
          </form>
        `;
        let result = false;
        let settled = false;
        const controller = createDialogController({
          dialog,
          closeOnBackdrop: true,
          closeOnEscape: true,
          afterClose: () => {
            dialog.remove?.();
            if (settled) return;
            settled = true;
            resolve(result);
          },
        });
        dialog.querySelector(".quick-confirm-cancel")?.addEventListener("click", () => {
          result = false;
          controller.close("cancel");
        });
        dialog.querySelector(".quick-confirm-form")?.addEventListener("submit", (event) => {
          event.preventDefault?.();
          result = true;
          controller.close("confirm");
        });
        documentRef.body.append(dialog);
        controller.open();
        dialog.querySelector(".quick-confirm-ok")?.focus?.();
      });
    };
  }

  global.SpeciesExplorerConfirmation = Object.freeze({ createQuickConfirm });
})(globalThis);
