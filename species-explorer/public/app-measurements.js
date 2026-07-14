(function initializeSpeciesExplorerMeasurements(global) {
  "use strict";

  const presentation = global.SpeciesExplorerPresentation;
  if (!presentation) throw new Error("Explorer-Anzeigehelfer konnten nicht geladen werden.");
  const { escapeHtml } = presentation;

  const MANUAL_SIZE_UNITS = Object.freeze(["mm", "cm", "m"]);
  const MANUAL_WEIGHT_UNITS = Object.freeze(["g", "kg", "t"]);
  const MANUAL_AGE_UNITS = Object.freeze(["Tage", "Monate", "Jahre"]);
  const AGE_UNIT_CANONICAL = Object.freeze({
    Tag: "Tage",
    Tage: "Tage",
    Monat: "Monate",
    Monate: "Monate",
    Jahr: "Jahre",
    Jahre: "Jahre",
  });
  const AGE_UNIT_SINGULAR = Object.freeze({
    Tage: "Tag",
    Monate: "Monat",
    Jahre: "Jahr",
  });

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function canonicalAgeUnit(unit) {
    return AGE_UNIT_CANONICAL[String(unit ?? "")] || "Jahre";
  }

  function normalizedUnits(units = [], { age = false } = {}) {
    const source = Array.isArray(units) ? units : [];
    const containsAgeUnit = source.some((unit) => AGE_UNIT_CANONICAL[String(unit)]);
    if (!age && !containsAgeUnit) return [...new Set(source.map(String).filter(Boolean))];
    return [...new Set([
      ...source,
      "Monate",
      "Jahre",
      "Tage",
      "Monat",
      "Jahr",
      "Tag",
    ].map(String).filter(Boolean))];
  }

  function parseManualMeasurement(rawValue, units, defaultUnit, { age = false } = {}) {
    const text = String(rawValue ?? "").trim();
    const allUnits = normalizedUnits(units, { age });
    const unitPattern = allUnits
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|");
    const normalizeUnit = (unit) => (age ? canonicalAgeUnit(unit) : String(unit || defaultUnit));
    const emptyResult = {
      sexed: false,
      value: text.replace(/^ca\.?\s*/iu, "").trim(),
      unit: normalizeUnit(defaultUnit),
      maleValue: "",
      maleUnit: normalizeUnit(defaultUnit),
      femaleValue: "",
      femaleUnit: normalizeUnit(defaultUnit),
    };
    if (!unitPattern) return emptyResult;

    const sexedMatch = text.match(new RegExp(
      `^Männchen\\s*:?\\s*(?:ca\\.?\\s*)?(.+?)\\s*(${unitPattern})\\s*;?\\s*`
        + `Weibchen\\s*:?\\s*(?:ca\\.?\\s*)?(.+?)\\s*(${unitPattern})$`,
      "iu",
    ));
    if (sexedMatch) {
      return {
        sexed: true,
        value: "",
        unit: normalizeUnit(defaultUnit),
        maleValue: sexedMatch[1].trim(),
        maleUnit: normalizeUnit(sexedMatch[2]),
        femaleValue: sexedMatch[3].trim(),
        femaleUnit: normalizeUnit(sexedMatch[4]),
      };
    }

    const sharedMatch = text.match(new RegExp(
      `^(?:ca\\.?\\s*)?(.+?)\\s*(${unitPattern})$`,
      "iu",
    ));
    return {
      ...emptyResult,
      value: sharedMatch ? sharedMatch[1].trim() : emptyResult.value,
      unit: normalizeUnit(sharedMatch?.[2] || defaultUnit),
    };
  }

  function stripManualMeasureInput(value, units = []) {
    let text = String(value ?? "").trim().replace(/^ca\.?\s*/iu, "").trim();
    const orderedUnits = normalizedUnits(units).sort((a, b) => b.length - a.length);
    for (const unit of orderedUnits) {
      text = text.replace(new RegExp(`\\s*${escapeRegExp(unit)}\\.?$`, "iu"), "").trim();
    }
    return text;
  }

  function singularManualAgeUnit(value, unit) {
    const normalized = String(value ?? "").trim().replace(",", ".");
    if (!/^1(?:\.0+)?$/.test(normalized)) return unit;
    return AGE_UNIT_SINGULAR[canonicalAgeUnit(unit)] || unit;
  }

  function formatManualMeasurement(value, unit, { units = [], age = false } = {}) {
    const cleaned = stripManualMeasureInput(value, age ? normalizedUnits(units, { age: true }) : units);
    if (!cleaned) return "";
    const normalizedUnit = age ? canonicalAgeUnit(unit) : unit;
    const finalUnit = age ? singularManualAgeUnit(cleaned, normalizedUnit) : normalizedUnit;
    return `ca. ${cleaned} ${finalUnit}`;
  }

  function composeManualSexedMeasurement(male, maleUnit, female, femaleUnit, options = {}) {
    return `Männchen: ${formatManualMeasurement(male, maleUnit, options)}; `
      + `Weibchen: ${formatManualMeasurement(female, femaleUnit, options)}`;
  }

  function renderUnitOptions(units, selectedUnit) {
    return units.map((unit) => (
      `<option value="${escapeHtml(unit)}"${unit === selectedUnit ? " selected" : ""}>${escapeHtml(unit)}</option>`
    )).join("");
  }

  function renderManualMeasurementEditor({ kind, label, parsed, units }) {
    return `
      <div class="new-species-measurement" data-measurement="${escapeHtml(kind)}">
        <label class="new-species-sex-toggle">
          <input type="checkbox" name="${escapeHtml(kind)}Sexed"${parsed.sexed ? " checked" : ""}>
          <span>${escapeHtml(label)} nach Männchen/Weibchen unterscheiden</span>
        </label>
        <label data-field="${escapeHtml(kind)}"${parsed.sexed ? " hidden" : ""}>
          <span>${escapeHtml(label)}</span>
          <span class="new-species-value-unit compact-unit">
            <span aria-hidden="true">ca.</span>
            <input name="${escapeHtml(kind)}" type="text" maxlength="80" autocomplete="off" value="${escapeHtml(parsed.value)}">
            <select name="${escapeHtml(kind)}Unit" aria-label="${escapeHtml(label)}seinheit">
              ${renderUnitOptions(units, parsed.unit)}
            </select>
          </span>
        </label>
        <div class="new-species-sexed-fields" data-sexed-fields="${escapeHtml(kind)}"${parsed.sexed ? "" : " hidden"}>
          <label data-field="${escapeHtml(kind)}Male">
            <span>${escapeHtml(label)} Männchen</span>
            <span class="new-species-value-unit compact-unit">
              <span aria-hidden="true">ca.</span>
              <input name="${escapeHtml(kind)}Male" type="text" maxlength="80" autocomplete="off" value="${escapeHtml(parsed.maleValue)}">
              <select name="${escapeHtml(kind)}MaleUnit" aria-label="${escapeHtml(label)}seinheit Männchen">
                ${renderUnitOptions(units, parsed.maleUnit)}
              </select>
            </span>
          </label>
          <label data-field="${escapeHtml(kind)}Female">
            <span>${escapeHtml(label)} Weibchen</span>
            <span class="new-species-value-unit compact-unit">
              <span aria-hidden="true">ca.</span>
              <input name="${escapeHtml(kind)}Female" type="text" maxlength="80" autocomplete="off" value="${escapeHtml(parsed.femaleValue)}">
              <select name="${escapeHtml(kind)}FemaleUnit" aria-label="${escapeHtml(label)}seinheit Weibchen">
                ${renderUnitOptions(units, parsed.femaleUnit)}
              </select>
            </span>
          </label>
        </div>
      </div>
    `;
  }

  global.SpeciesExplorerMeasurements = Object.freeze({
    MANUAL_SIZE_UNITS,
    MANUAL_WEIGHT_UNITS,
    MANUAL_AGE_UNITS,
    parseManualMeasurement,
    stripManualMeasureInput,
    singularManualAgeUnit,
    formatManualMeasurement,
    composeManualSexedMeasurement,
    renderUnitOptions,
    renderManualMeasurementEditor,
  });
})(globalThis);
