(function initializeSpeciesExplorerFormFeedback(global) {
  "use strict";

  let nextFieldErrorId = 0;

  function createMessageSetter(element, baseClass = "edit-message") {
    if (!element || typeof element !== "object") {
      throw new TypeError("Formularmeldung benötigt ein Ausgabeelement.");
    }
    return (text = "", type = "") => {
      element.textContent = text;
      element.className = `${baseClass}${type ? ` ${type}` : ""}`;
      element.hidden = !text;
    };
  }

  function createFieldFeedbackController({
    form,
    documentRef = global.document,
    scope = "",
    validateFields,
  } = {}) {
    if (!form?.querySelector || !form?.querySelectorAll || !form?.elements) {
      throw new TypeError("Feldrückmeldung benötigt ein Formular mit Elementzugriff.");
    }
    if (!documentRef?.createElement) {
      throw new TypeError("Feldrückmeldung benötigt ein Dokument zum Erzeugen der Fehlertexte.");
    }
    const prefix = scope ? `${scope.trim()} ` : "";
    const fieldLabel = (fieldKey) => form.querySelector(`${prefix}[data-field="${fieldKey}"]`);
    const activeErrors = new Map();

    const clearLabelError = (label) => {
      const record = activeErrors.get(label);
      if (record) {
        for (const { control, previousInvalid } of record.controls) {
          const descriptions = String(control.getAttribute("aria-describedby") || "")
            .split(/\s+/).filter((id) => id && id !== record.errorText.id);
          if (descriptions.length) control.setAttribute("aria-describedby", descriptions.join(" "));
          else control.removeAttribute("aria-describedby");
          if (control.getAttribute("aria-invalid") === "true") {
            if (previousInvalid === null) control.removeAttribute("aria-invalid");
            else control.setAttribute("aria-invalid", previousInvalid);
          }
        }
        record.errorText.remove();
        activeErrors.delete(label);
      }
      label.classList.remove("field-error");
      label.querySelector(".field-error-text")?.remove();
    };

    const clearFieldErrors = () => {
      for (const label of form.querySelectorAll(`${prefix}[data-field]`)) {
        clearLabelError(label);
      }
    };

    const applyFieldErrors = (fieldErrors = {}) => {
      clearFieldErrors();
      for (const [fieldKey, errors] of Object.entries(fieldErrors)) {
        const label = fieldLabel(fieldKey);
        if (!label) continue;
        const text = (Array.isArray(errors) ? errors.filter(Boolean).join(" · ") : String(errors ?? "")).trim();
        if (!text) continue;
        label.classList.add("field-error");
        const errorText = documentRef.createElement("small");
        errorText.id = `field-error-${++nextFieldErrorId}`;
        errorText.className = "field-error-text";
        errorText.textContent = text;
        label.append(errorText);
        const candidates = Array.from(label.querySelectorAll("input, select, textarea"));
        const matching = candidates.filter((control) => control.name === fieldKey);
        const controls = (matching.length ? matching : candidates).map((control) => {
          const previousInvalid = control.getAttribute("aria-invalid");
          const descriptions = String(control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
          control.setAttribute("aria-invalid", "true");
          control.setAttribute("aria-describedby", [...new Set([...descriptions, errorText.id])].join(" "));
          return { control, previousInvalid };
        });
        activeErrors.set(label, { fieldKey, errorText, controls });
      }
    };

    const clearCorrectedField = (event) => {
      for (const [label, record] of activeErrors) {
        if (!label.contains(event.target)) continue;
        const remaining = typeof validateFields === "function" ? validateFields()[record.fieldKey] : null;
        if (Array.isArray(remaining) ? remaining.some(Boolean) : Boolean(remaining)) continue;
        clearLabelError(label);
      }
    };
    form.addEventListener?.("input", clearCorrectedField);
    form.addEventListener?.("change", clearCorrectedField);

    const updateMeasurementMode = (kind) => {
      const checked = form.elements[`${kind}Sexed`]?.checked === true;
      const sharedLabel = fieldLabel(kind);
      const sexedFields = form.querySelector(`${prefix}[data-sexed-fields="${kind}"]`);
      if (sharedLabel) sharedLabel.hidden = checked;
      if (sexedFields) sexedFields.hidden = !checked;
      return checked;
    };

    return Object.freeze({
      fieldLabel,
      clearFieldErrors,
      applyFieldErrors,
      updateMeasurementMode,
    });
  }

  global.SpeciesExplorerFormFeedback = Object.freeze({
    createMessageSetter,
    createFieldFeedbackController,
  });
})(typeof window !== "undefined" ? window : globalThis);
