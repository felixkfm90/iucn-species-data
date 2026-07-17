(function initializeSpeciesExplorerNewSpeciesForm(global) {
  "use strict";

  function createNewSpeciesFormModel({
    form,
    FormDataClass = global.FormData,
    composeManualSexedMeasurement,
    formatManualMeasurement,
    stripManualMeasureInput,
    sizeUnits,
    weightUnits,
    ageUnits,
  } = {}) {
    if (!form || typeof FormDataClass !== "function") {
      throw new TypeError("Neue-Art-Formular benötigt Formular und FormData.");
    }
    for (const [name, dependency] of Object.entries({
      composeManualSexedMeasurement,
      formatManualMeasurement,
      stripManualMeasureInput,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Neue-Art-Formular benötigt ${name} als Funktion.`);
      }
    }
    if (!Array.isArray(sizeUnits) || !Array.isArray(weightUnits) || !Array.isArray(ageUnits)) {
      throw new TypeError("Neue-Art-Formular benötigt alle Messwerteinheiten.");
    }

    const readFormData = () => new FormDataClass(form);

    const speciesValues = () => {
      const formData = readFormData();
      const sizeSexed = formData.get("sizeSexed") === "on";
      const weightSexed = formData.get("weightSexed") === "on";
      return {
        german: formData.get("german"),
        scientificName: formData.get("scientificName"),
        size: sizeSexed
          ? composeManualSexedMeasurement(
            formData.get("sizeMale"),
            formData.get("sizeMaleUnit"),
            formData.get("sizeFemale"),
            formData.get("sizeFemaleUnit"),
            { units: sizeUnits },
          )
          : formatManualMeasurement(formData.get("size"), formData.get("sizeUnit"), {
            units: sizeUnits,
          }),
        weight: weightSexed
          ? composeManualSexedMeasurement(
            formData.get("weightMale"),
            formData.get("weightMaleUnit"),
            formData.get("weightFemale"),
            formData.get("weightFemaleUnit"),
            { units: weightUnits },
          )
          : formatManualMeasurement(formData.get("weight"), formData.get("weightUnit"), {
            units: weightUnits,
          }),
        lifeExpectancy: formatManualMeasurement(
          formData.get("lifeExpectancy"),
          formData.get("lifeExpectancyUnit"),
          { units: ageUnits, age: true },
        ),
      };
    };

    const localFieldErrors = () => {
      const formData = readFormData();
      const errors = {};
      const add = (fieldKey, text) => {
        errors[fieldKey] ??= [];
        errors[fieldKey].push(text);
      };
      for (const [fieldKey, label] of [
        ["german", "Deutscher Name"],
        ["scientificName", "Wissenschaftlicher Name"],
      ]) {
        if (!String(formData.get(fieldKey) ?? "").trim()) add(fieldKey, `${label} darf nicht leer sein`);
      }
      if (formData.get("sizeSexed") === "on") {
        if (!stripManualMeasureInput(formData.get("sizeMale"), sizeUnits)) {
          add("sizeMale", "Größe Männchen darf nicht leer sein");
        }
        if (!stripManualMeasureInput(formData.get("sizeFemale"), sizeUnits)) {
          add("sizeFemale", "Größe Weibchen darf nicht leer sein");
        }
      } else if (!stripManualMeasureInput(formData.get("size"), sizeUnits)) {
        add("size", "Größe darf nicht leer sein");
      }
      if (formData.get("weightSexed") === "on") {
        if (!stripManualMeasureInput(formData.get("weightMale"), weightUnits)) {
          add("weightMale", "Gewicht Männchen darf nicht leer sein");
        }
        if (!stripManualMeasureInput(formData.get("weightFemale"), weightUnits)) {
          add("weightFemale", "Gewicht Weibchen darf nicht leer sein");
        }
      } else if (!stripManualMeasureInput(formData.get("weight"), weightUnits)) {
        add("weight", "Gewicht darf nicht leer sein");
      }
      if (!stripManualMeasureInput(formData.get("lifeExpectancy"), ageUnits)) {
        add("lifeExpectancy", "Lebenserwartung darf nicht leer sein");
      }
      return errors;
    };

    return Object.freeze({ speciesValues, localFieldErrors });
  }

  global.SpeciesExplorerNewSpeciesForm = Object.freeze({
    createNewSpeciesFormModel,
  });
})(typeof window !== "undefined" ? window : globalThis);
