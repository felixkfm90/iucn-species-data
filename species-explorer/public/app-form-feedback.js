(function initializeSpeciesExplorerFormFeedback(global) {
  "use strict";

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
  } = {}) {
    if (!form?.querySelector || !form?.querySelectorAll || !form?.elements) {
      throw new TypeError("Feldrückmeldung benötigt ein Formular mit Elementzugriff.");
    }
    if (!documentRef?.createElement) {
      throw new TypeError("Feldrückmeldung benötigt ein Dokument zum Erzeugen der Fehlertexte.");
    }
    const prefix = scope ? `${scope.trim()} ` : "";
    const fieldLabel = (fieldKey) => form.querySelector(`${prefix}[data-field="${fieldKey}"]`);

    const clearFieldErrors = () => {
      for (const label of form.querySelectorAll(`${prefix}[data-field]`)) {
        label.classList.remove("field-error");
        label.querySelector(".field-error-text")?.remove();
      }
    };

    const applyFieldErrors = (fieldErrors = {}) => {
      clearFieldErrors();
      for (const [fieldKey, errors] of Object.entries(fieldErrors)) {
        const label = fieldLabel(fieldKey);
        if (!label) continue;
        label.classList.add("field-error");
        const errorText = documentRef.createElement("small");
        errorText.className = "field-error-text";
        errorText.textContent = Array.isArray(errors) ? errors.join(" · ") : String(errors);
        label.append(errorText);
      }
    };

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
