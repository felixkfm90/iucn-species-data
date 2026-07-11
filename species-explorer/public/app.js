const state = {
  species: [],
  filtered: [],
  selectedId: "",
  audioCleanup: null,
  mapCleanup: null,
  portraitCleanup: null,
  notice: "",
  editMode: false,
  databaseNeedsUpdate: true,
  validationNeedsUpdate: true,
  pendingChanges: null,
  openPipelinePreview: null,
  openAssetReview: null,
  holdNewSpeciesBackground: false,
  newSpeciesPipelineActive: false,
  pipelineWasRunning: false,
  silentPipelineContext: null,
  pipelineStatusSnapshot: null,
  pipelinePollTimer: null,
  backupWasRunning: false,
  backupStatusSnapshot: null,
  backupPollTimer: null,
  settingsSnapshot: null,
  assetReviewRunId: "",
  assetReviewSignature: "",
  assetReviewAwaitingRetry: false,
  reloadAfterAssetReviewClose: false,
  reloadAfterEditClose: false,
  pendingRevisionReload: false,
  dataRevision: "",
  dataRevisionTimer: null,
  dataLoading: false,
};
const requestedSpeciesId = new URLSearchParams(window.location.search).get("species") || "";
const IUCN_STATUS_LABELS = {
  NE: "Nicht bewertet",
  DD: "Ungenügende Datengrundlage",
  LC: "Nicht gefährdet",
  NT: "Potenziell gefährdet",
  VU: "Gefährdet",
  EN: "Stark gefährdet",
  CR: "Vom Aussterben bedroht",
  EW: "In der Natur ausgestorben",
  EX: "Ausgestorben",
};
const IUCN_STATUS_ICON_CODES = new Set(["DD", "LC", "NT", "VU", "EN", "CR", "EW", "EX"]);
const IUCN_TREND_ICON_FILES = {
  abnehmend: "abnehmend.png",
  stabil: "stabil.png",
  zunehmend: "zunehmend.png",
  unbekannt: "nodata.png",
  "n/a": "nodata.png",
};

const elements = {
  speciesCount: document.querySelector("#species-count"),
  assetIssues: document.querySelector("#asset-issues"),
  ncCount: document.querySelector("#nc-count"),
  manualMapCount: document.querySelector("#manual-map-count"),
  reportDate: document.querySelector("#report-date"),
  editModeToggle: document.querySelector("#edit-mode-toggle"),
  pipelineMenuButton: document.querySelector("#pipeline-menu-button"),
  validationOverall: document.querySelector("#validation-overall"),
  validationDataCard: document.querySelector("#validation-data-card"),
  validationData: document.querySelector("#validation-data"),
  validationDataDetail: document.querySelector("#validation-data-detail"),
  validationAssetsCard: document.querySelector("#validation-assets-card"),
  validationAssets: document.querySelector("#validation-assets"),
  validationAssetsDetail: document.querySelector("#validation-assets-detail"),
  validationReportCard: document.querySelector("#validation-report-card"),
  validationReport: document.querySelector("#validation-report"),
  validationReportDetail: document.querySelector("#validation-report-detail"),
  validationSpecial: document.querySelector("#validation-special"),
  validationDetails: document.querySelector("#validation-details"),
  search: document.querySelector("#search"),
  statusFilter: document.querySelector("#status-filter"),
  flagFilter: document.querySelector("#flag-filter"),
  visibleCount: document.querySelector("#visible-count"),
  newSpeciesButton: document.querySelector("#new-species-button"),
  newSpeciesDialog: document.querySelector("#new-species-dialog"),
  newSpeciesForm: document.querySelector("#new-species-form"),
  pipelineButtons: [...document.querySelectorAll("[data-pipeline-mode]")],
  backupButtons: [...document.querySelectorAll("[data-backup-action]")],
  settingsButtons: [...document.querySelectorAll("[data-settings-action]")],
  pipelineStatus: document.querySelector("#pipeline-status"),
  pipelineRunNotice: document.querySelector("#pipeline-run-notice"),
  pipelineRunNoticeTitle: document.querySelector("#pipeline-run-notice-title"),
  pipelineRunNoticeDetail: document.querySelector("#pipeline-run-notice-detail"),
  pipelineRunNoticeOpen: document.querySelector("#pipeline-run-notice-open"),
  pipelineStatusDetail: document.querySelector("#pipeline-status-detail"),
  pipelineLogDetails: document.querySelector("#pipeline-log-details"),
  pipelineLog: document.querySelector("#pipeline-log"),
  pipelineDialog: document.querySelector("#pipeline-dialog"),
  pipelineForm: document.querySelector("#pipeline-form"),
  pipelineDialogTitle: document.querySelector("#pipeline-dialog-title"),
  pipelineDialogDescription: document.querySelector("#pipeline-dialog-description"),
  pipelineMessage: document.querySelector(".pipeline-message"),
  pipelinePreview: document.querySelector(".pipeline-preview"),
  pipelinePreviewTitle: document.querySelector("#pipeline-preview-title"),
  pipelinePreviewContent: document.querySelector("#pipeline-preview-content"),
  pipelineWarning: document.querySelector("#pipeline-warning"),
  pipelineStartButton: document.querySelector("#pipeline-start-button"),
  pipelineModeChoice: document.querySelector("#pipeline-mode-choice"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  backupRootInput: document.querySelector("#backup-root-input"),
  backupRootDefault: document.querySelector("#backup-root-default"),
  settingsMessage: document.querySelector(".settings-message"),
  settingsResetButton: document.querySelector(".settings-reset-button"),
  settingsSaveButton: document.querySelector(".settings-save-button"),
  assetReviewDialog: document.querySelector("#asset-review-dialog"),
  assetReviewForm: document.querySelector("#asset-review-form"),
  assetReviewList: document.querySelector("#asset-review-list"),
  assetReviewMessage: document.querySelector(".asset-review-message"),
  assetReviewSave: document.querySelector("#asset-review-save"),
  assetReviewMapLightbox: document.querySelector("#asset-review-map-lightbox"),
  assetReviewMapLightboxImage: document.querySelector("#asset-review-map-lightbox-image"),
  assetReviewMapLightboxClose: document.querySelector("#asset-review-map-lightbox-close"),
  reloadButton: document.querySelector("#reload-button"),
  speciesPanel: document.querySelector(".species-panel"),
  speciesList: document.querySelector("#species-list"),
  detailPanel: document.querySelector("#detail-panel"),
  itemTemplate: document.querySelector("#species-item-template"),
};

function formatDate(value) {
  if (!value) return "Kein Reportdatum";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `Report ${new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MANUAL_SIZE_UNITS = ["mm", "cm", "m"];
const MANUAL_WEIGHT_UNITS = ["g", "kg", "t"];
const MANUAL_AGE_UNITS = ["Tage", "Monate", "Jahre"];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalAgeUnit(unit) {
  return {
    Tag: "Tage",
    Tage: "Tage",
    Monat: "Monate",
    Monate: "Monate",
    Jahr: "Jahre",
    Jahre: "Jahre",
  }[String(unit ?? "")] || "Jahre";
}

function parseManualMeasurement(rawValue, units, defaultUnit, { age = false } = {}) {
  const text = String(rawValue ?? "").trim();
  const allUnits = age
    ? ["Monate", "Jahre", "Tage", "Monat", "Jahr", "Tag"]
    : units;
  const unitPattern = [...allUnits]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const sexedMatch = text.match(new RegExp(
    `^Männchen\\s*:?\\s*(?:ca\\.?\\s*)?(.+?)\\s*(${unitPattern})\\s*;?\\s*`
      + `Weibchen\\s*:?\\s*(?:ca\\.?\\s*)?(.+?)\\s*(${unitPattern})$`,
    "iu",
  ));
  const normalizeUnit = (unit) => (age ? canonicalAgeUnit(unit) : String(unit || defaultUnit));
  if (sexedMatch) {
    return {
      sexed: true,
      value: "",
      unit: defaultUnit,
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
    sexed: false,
    value: sharedMatch ? sharedMatch[1].trim() : text.replace(/^ca\.?\s*/iu, "").trim(),
    unit: normalizeUnit(sharedMatch?.[2] || defaultUnit),
    maleValue: "",
    maleUnit: defaultUnit,
    femaleValue: "",
    femaleUnit: defaultUnit,
  };
}

function stripManualMeasureInput(value, units = []) {
  let text = String(value ?? "").trim().replace(/^ca\.?\s*/iu, "").trim();
  for (const unit of units) {
    text = text.replace(new RegExp(`\\s*${escapeRegExp(unit)}\\.?$`, "iu"), "").trim();
  }
  return text;
}

function singularManualAgeUnit(value, unit) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^1(?:\.0+)?$/.test(normalized)) return unit;
  return { Tage: "Tag", Monate: "Monat", Jahre: "Jahr" }[unit] || unit;
}

function formatManualMeasurement(value, unit, { units = [], age = false } = {}) {
  const cleaned = stripManualMeasureInput(value, units);
  if (!cleaned) return "";
  const finalUnit = age ? singularManualAgeUnit(cleaned, unit) : unit;
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

function formatPendingFileStatus(status) {
  const value = String(status || "").trim();
  if (!value || value.includes("M")) return "geändert";
  if (value.includes("A") || value === "??") return "neu";
  if (value.includes("D")) return "gelöscht";
  if (value.includes("R")) return "umbenannt";
  return value;
}

function iucnDistributionMapUrl(species) {
  const assessmentId = String(species?.iucn?.assessmentId ?? "").trim();
  return /^\d+$/.test(assessmentId)
    ? `https://www.iucnredlist.org/api/v4/assessments/${assessmentId}/distribution_map/jpg`
    : "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const value = String(reader.result ?? "");
      const commaIndex = value.indexOf(",");
      if (commaIndex < 0) {
        reject(new Error("Datei konnte nicht gelesen werden"));
        return;
      }
      resolve(value.slice(commaIndex + 1));
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("Datei konnte nicht gelesen werden")));
    reader.readAsDataURL(file);
  });
}

function waitForAudioMetadata(audio) {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve(audio.duration);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("MP3-Metadaten konnten nicht gelesen werden"));
    }, 8000);
    const cleanup = () => {
      clearTimeout(timeout);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(audio.duration);
      else reject(new Error("MP3-Dauer ist ungültig"));
    };
    const onError = () => {
      cleanup();
      reject(new Error("MP3-Datei kann im Browser nicht abgespielt werden"));
    };
    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.load();
  });
}

function formatIucnFetchDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || "Unbekannt";
}

function formatIucnStatus(status) {
  const code = String(status ?? "").trim();
  return IUCN_STATUS_LABELS[code] ? `${IUCN_STATUS_LABELS[code]} (${code})` : code;
}

function assetStatusText(asset) {
  if (asset.stale) return `Veraltet · ${asset.staleReason || "Hash stimmt nicht überein"}`;
  if (!asset.exists) return "Fehlt";
  const parts = ["Vorhanden"];
  if (asset.hashVerified) parts.push("Soundhash geprüft");
  if (asset.manuallyAdded) parts.push("manuell hinzugefügt");
  parts.push(formatBytes(asset.bytes));
  return parts.join(" · ");
}

function backupRetentionText(result) {
  const retention = result?.backupRetention;
  if (!retention) return "";
  return ` Backupbestand: ${retention.kept} Datei(en)`
    + `${retention.removed ? `, ${retention.removed} alte entfernt` : ""}.`;
}

function setupSafeBackdropClose(dialog, close) {
  let startedOnBackdrop = false;
  dialog.addEventListener("pointerdown", (event) => {
    startedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener("pointercancel", () => {
    startedOnBackdrop = false;
  });
  dialog.addEventListener("click", (event) => {
    const shouldClose = startedOnBackdrop && event.target === dialog;
    startedOnBackdrop = false;
    if (shouldClose) close();
  });
}

function setupEditingMode() {
  const applyMode = (enabled) => {
    state.editMode = enabled;
    document.body.classList.toggle("edit-mode", enabled);
    elements.editModeToggle.setAttribute("aria-pressed", String(enabled));
    elements.editModeToggle.textContent = enabled ? "Bearbeitungsmodus 🔓" : "Lesemodus 🔒";
    elements.editModeToggle.title = enabled
      ? "In den Lesemodus wechseln"
      : "Bearbeitungsfunktionen einblenden";
  };

  elements.editModeToggle.addEventListener("click", () => applyMode(!state.editMode));
  applyMode(false);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showQuickConfirm({
  eyebrow = "",
  title = "Bestätigen",
  message = "",
  confirmLabel = "Ja",
  cancelLabel = "Abbrechen",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
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
    const closeWith = (value) => {
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeWith(false);
    });
    dialog.querySelector(".quick-confirm-cancel")?.addEventListener("click", () => closeWith(false));
    dialog.querySelector(".quick-confirm-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      closeWith(true);
    });
    setupSafeBackdropClose(dialog, () => closeWith(false));
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector(".quick-confirm-ok")?.focus();
  });
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function createFlag(label, className, title = "") {
  const span = document.createElement("span");
  span.className = `flag ${className}`;
  span.textContent = label;
  if (title) span.title = title;
  return span;
}

function updateSummary(summary) {
  elements.speciesCount.textContent = summary.speciesCount;
  elements.assetIssues.textContent = summary.missingCoreAssets;
  elements.ncCount.textContent = summary.ncSoundCount;
  elements.manualMapCount.textContent = summary.manualMapCount;
  elements.reportDate.textContent = formatDate(summary.reportGeneratedAt);
}

function setValidationCardState(card, ok) {
  card.classList.toggle("ok", ok);
  card.classList.toggle("error", !ok);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function updateProcessLog(lines = []) {
  const logLines = Array.isArray(lines) ? lines : [];
  elements.pipelineLogDetails.hidden = logLines.length === 0;
  elements.pipelineLog.textContent = logLines.join("\n");
  if (!elements.pipelineLogDetails.hidden) {
    requestAnimationFrame(() => {
      elements.pipelineLog.scrollTop = elements.pipelineLog.scrollHeight;
    });
  }
}

function renderDatabaseStatus(stateName = "") {
  const activeBackupStatus = state.backupStatusSnapshot?.status === "running" ? "backup" : "";
  const activePipelineStatus = state.pipelineStatusSnapshot?.status === "running"
    ? "running"
    : state.pipelineStatusSnapshot?.status === "awaiting-review"
      ? "review"
      : state.pipelineStatusSnapshot?.status === "failed"
        ? "failed"
        : "";
  const status = stateName || activeBackupStatus || activePipelineStatus || (state.databaseNeedsUpdate ? "outdated" : "current");
  elements.pipelineMenuButton.className = `header-action header-edit-slot database-status ${status}`;
  elements.pipelineStatus.className = `pipeline-status-text ${status}`;
  if (status === "running") elements.pipelineStatus.textContent = "Aktualisierung läuft";
  else if (status === "review") elements.pipelineStatus.textContent = "Neue Assets prüfen";
  else if (status === "failed") elements.pipelineStatus.textContent = "Datenbank aktualisieren";
  else if (status === "current") elements.pipelineStatus.textContent = "Datenbank aktuell";
  else if (status === "outdated") elements.pipelineStatus.textContent = "Änderungen übertragen";
  else elements.pipelineStatus.textContent = "Datenbank aktualisieren";
}

function updateValidation(validation) {
  const isOk = validation.status === "ok";
  state.validationNeedsUpdate = !isOk;
  state.databaseNeedsUpdate = state.validationNeedsUpdate || Boolean(state.pendingChanges?.hasPendingChanges);
  renderDatabaseStatus();
  elements.validationOverall.textContent = isOk
    ? "Alle Prüfungen bestanden"
    : `${validation.issueCount} Prüfhinweis(e)`;
  elements.validationOverall.classList.toggle("ok", isOk);
  elements.validationOverall.classList.toggle("error", !isOk);

  const dataOk = validation.data.issueSpeciesCount === 0;
  elements.validationData.textContent = `${validation.data.inputCount} / ${validation.data.generatedCount}`;
  elements.validationDataDetail.textContent = dataOk
    ? "Eingabe und Pipeline stimmen überein"
    : `${validation.data.issueSpeciesCount} Art(en) mit Datenabweichung`;
  setValidationCardState(elements.validationDataCard, dataOk);

  const assetsOk = validation.assets.issueSpeciesCount === 0;
  const missingPortraitCount = validation.special.missingPortraitCount ?? 0;
  const missingSoundKnownCount = validation.special.missingSoundKnownCount ?? 0;
  const manualSoundCount = validation.special.manualSoundCount ?? 0;
  elements.validationAssets.textContent = missingPortraitCount
    ? `${validation.assets.completeSpeciesCount} vollständig · ${missingPortraitCount} Portraits fehlen`
    : `${validation.assets.completeSpeciesCount} vollständig`;
  elements.validationAssetsDetail.textContent = assetsOk
    ? (missingSoundKnownCount || manualSoundCount
      ? `Kernassets vollständig · ${[
          missingSoundKnownCount ? pluralize(missingSoundKnownCount, "fehlender Sound", "fehlende Sounds") : "",
          manualSoundCount ? pluralize(manualSoundCount, "manueller Sound", "manuelle Sounds") : "",
        ].filter(Boolean).join(" · ")}`
      : "Karte, Sound, Credits, Spektrogramm und Artporträt vorhanden")
    : `${validation.assets.issueSpeciesCount} unvollständige Assetordner`;
  setValidationCardState(elements.validationAssetsCard, assetsOk);

  elements.validationReport.textContent = validation.report.consistent ? "Konsistent" : "Abweichung";
  elements.validationReportDetail.textContent = validation.report.consistent
    ? `${validation.report.checks.length} Reportprüfungen bestanden`
    : `${validation.report.issueCount} Reportproblem(e)`;
  setValidationCardState(elements.validationReportCard, validation.report.consistent);

  elements.validationSpecial.textContent =
    `${validation.special.manualMapCount} Karten · ${validation.special.ncSoundCount} NC`
    + `${manualSoundCount ? ` · ${pluralize(manualSoundCount, "manueller Sound", "manuelle Sounds")}` : ""}`
    + `${missingSoundKnownCount ? ` · ${pluralize(missingSoundKnownCount, "fehlender Sound", "fehlende Sounds")}` : ""}`;

  const detailItems = [];
  if (!dataOk) {
    detailItems.push(
      `Daten: ${validation.data.inputOnlyCount} nur in der Eingabeliste, `
      + `${validation.data.generatedOnlyCount} nur in speciesData.json, `
      + `${validation.data.mismatchSpeciesCount} Art(en) mit Feldabweichung`,
    );
  }
  if (!assetsOk) {
    const available = validation.assets.available;
    detailItems.push(
      `Assets vorhanden: ${available.maps} Karten, ${available.sounds} Sounds, `
      + `${available.credits} Credits, ${available.spectrograms} Spektrogramme, `
      + `${available.portraits} Artporträts`,
    );
    if (missingPortraitCount) {
      detailItems.push(`Artporträts: ${missingPortraitCount} von ${validation.data.inputCount} fehlen`);
    }
    if (missingSoundKnownCount) {
      detailItems.push(
        `Sound fehlt: ${missingSoundKnownCount} Art(en) ohne verwendbare automatische Tonquelle`,
      );
    }
    if (manualSoundCount) {
      detailItems.push(
        `Manuelle Sounds: ${manualSoundCount} Art(en) mit manuell gepflegter Tonquelle`,
      );
    }
  } else {
    if (missingSoundKnownCount) {
      detailItems.push(
        `Sound fehlt: ${missingSoundKnownCount} Art(en) ohne verwendbare automatische Tonquelle`,
      );
    }
    if (manualSoundCount) {
      detailItems.push(
        `Manuelle Sounds: ${manualSoundCount} Art(en) mit manuell gepflegter Tonquelle`,
      );
    }
  }
  for (const check of validation.report.checks.filter((entry) => !entry.ok)) {
    const parts = [];
    if (check.missingFromReport.length) {
      parts.push(`${check.missingFromReport.length} fehlen im Report: ${check.missingFromReport.join(", ")}`);
    }
    if (check.staleInReport.length) {
      parts.push(`${check.staleInReport.length} stehen nur im Report: ${check.staleInReport.join(", ")}`);
    }
    detailItems.push(`${check.label}: ${parts.join("; ")}`);
  }
  detailItems.push(...validation.report.counterIssues.map((issue) => `Report-Zähler: ${issue}`));

  elements.validationDetails.hidden = detailItems.length === 0;
  elements.validationDetails.innerHTML = detailItems.length
    ? `<ul>${detailItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
}

function updatePendingChanges(pendingChanges = {}) {
  state.pendingChanges = pendingChanges;
  state.databaseNeedsUpdate = state.validationNeedsUpdate || Boolean(pendingChanges.hasPendingChanges);
  renderDatabaseStatus();
}

function populateStatusFilter() {
  const current = elements.statusFilter.value;
  const statuses = [...new Set(state.species.map((entry) => entry.iucn.status))]
    .filter(Boolean)
    .sort((a, b) => formatIucnStatus(a).localeCompare(formatIucnStatus(b), "de"));
  elements.statusFilter.replaceChildren(new Option("Alle", ""));
  for (const status of statuses) {
    elements.statusFilter.add(new Option(formatIucnStatus(status), status));
  }
  elements.statusFilter.value = current;
}

function applyFilters() {
  state.filtered = globalThis.SpeciesExplorerFilters.filterSpecies(state.species, {
    query: elements.search.value,
    status: elements.statusFilter.value,
    flag: elements.flagFilter.value,
  });

  renderSpeciesList();
}

function renderSpeciesList() {
  const previousScrollTop = elements.speciesList.scrollTop;
  elements.speciesList.replaceChildren();
  elements.visibleCount.textContent = `${state.filtered.length} ${state.filtered.length === 1 ? "Art" : "Arten"}`;

  if (state.filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "no-results";
    empty.textContent = "Keine Art passt zu den Filtern.";
    elements.speciesList.append(empty);
    return;
  }

  for (const species of state.filtered) {
    const item = elements.itemTemplate.content.firstElementChild.cloneNode(true);
    item.dataset.id = species.id;
    item.classList.toggle("active", species.id === state.selectedId);
    item.setAttribute("aria-selected", String(species.id === state.selectedId));
    item.querySelector("strong").textContent = species.germanName;
    item.querySelector("em").textContent = species.scientificName;

    const flags = item.querySelector(".species-item-flags");
    if (species.inconsistencies.length) {
      flags.append(createFlag("!", "issue", species.inconsistencies.join(", ")));
    }
    if (species.isNcSound) {
      flags.append(createFlag("NC", "nc", "Non-Commercial-Soundlizenz"));
    }
    if (species.isManualMap) {
      flags.append(createFlag("K", "map", "Manuell gepflegte Karte"));
    }
    if (species.soundCareHint) {
      flags.append(createFlag("S", "sound", "Sound fehlt oder wird manuell gepflegt"));
    }
    if (species.missingPortrait) {
      flags.append(createFlag("P", "portrait", "Artporträt fehlt"));
    }

    item.addEventListener("click", () => selectSpecies(species.id));
    elements.speciesList.append(item);
  }

  elements.speciesList.scrollTop = previousScrollTop;
}

function dataRows(entries) {
  return entries.map(([label, value]) => `
    <div class="data-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${value?.trustedHtml === true ? value.html : escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function trustedDataValue(html) {
  return { trustedHtml: true, html };
}

function formatSexSpecificDataValue(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^Männchen\s*:?\s*(.*?)\s*;?\s*Weibchen\s*:?\s*(.*)$/iu);
  if (!match) return text;
  return trustedDataValue(`
    <span class="sex-specific-value">
      <span>Männchen ${escapeHtml(match[1].trim())}</span>
      <span>Weibchen ${escapeHtml(match[2].trim())}</span>
    </span>
  `);
}

function iucnStatusIconUrl(status) {
  const code = String(status ?? "").trim().toUpperCase();
  return IUCN_STATUS_ICON_CODES.has(code)
    ? `/graphics/catagory/${encodeURIComponent(code)}.png`
    : "";
}

function iucnTrendIconUrl(trend) {
  const key = String(trend ?? "").trim().toLocaleLowerCase("de-DE");
  const fileName = IUCN_TREND_ICON_FILES[key];
  return fileName ? `/graphics/trend/${encodeURIComponent(fileName)}` : "";
}

function iconDataValue(value, iconUrl, iconClass = "") {
  const text = String(value ?? "").trim() || "Unbekannt";
  if (!iconUrl) return text;
  return trustedDataValue(`
    <span class="iucn-data-value">
      <img class="iucn-data-icon ${escapeHtml(iconClass)}" src="${escapeHtml(iconUrl)}" alt="">
      <span>${escapeHtml(text)}</span>
    </span>
  `);
}

function inlineEditButton(section) {
  return `
    <button class="inline-edit-open edit-species-open edit-only" type="button" data-edit-section="${escapeHtml(section)}">
      Bearbeiten
    </button>
  `;
}

function inlineDeleteButton(assetType, label) {
  return `
    <button class="inline-delete-open ${escapeHtml(assetType)}-delete-button danger edit-only" type="button">
      ${escapeHtml(label)}
    </button>
  `;
}

function inlineRestoreButton(assetType, backup = null) {
  const hasBackup = backup?.exists === true;
  const title = hasBackup
    ? `Letzte lokale Sicherung wiederherstellen (${formatBytes(backup.bytes || 0)})`
    : "Keine lokale Sicherung vorhanden";
  return `
    <button
      class="inline-restore-open ${escapeHtml(assetType)}-restore-button edit-only${hasBackup ? " available" : ""}"
      type="button"
      data-asset-type="${escapeHtml(assetType)}"
      title="${escapeHtml(title)}"
      ${hasBackup ? "" : "disabled"}
    >
      Wiederherstellen
    </button>
  `;
}

function sectionActions(editSection = "", deleteAssetType = "", deleteLabel = "", restoreAssetType = "", restoreBackup = null) {
  const actions = [];
  if (editSection) actions.push(inlineEditButton(editSection));
  if (restoreAssetType) actions.push(inlineRestoreButton(restoreAssetType, restoreBackup));
  if (deleteAssetType && deleteLabel) actions.push(inlineDeleteButton(deleteAssetType, deleteLabel));
  return actions.length ? `<div class="section-heading-actions edit-only">${actions.join("")}</div>` : "";
}

function mapPanel(asset, alt, editSection = "") {
  const mapUrl = versionedAssetUrl(asset.url, asset);
  const content = asset.exists
    ? `
      <button class="map-zoom-trigger" type="button" aria-label="Verbreitungskarte vergrößern">
        <img class="map-image" src="${escapeHtml(mapUrl)}" alt="${escapeHtml(alt)}">
        <span class="map-zoom-hint">Vergrößern</span>
      </button>
    `
    : `<span class="media-missing">Nicht vorhanden</span>`;
  return `
    <section class="map-panel">
      <div class="section-heading">
        <h3 class="section-title">Verbreitungskarte${asset.exists ? ` · ${formatBytes(asset.bytes)}` : ""}</h3>
        ${sectionActions(editSection, editSection && asset.exists ? "map" : "", "Karte löschen", editSection ? "map" : "", asset.backup)}
      </div>
      <div class="map-frame">${content}</div>
    </section>
  `;
}

function speciesImagePanel(species) {
  const portrait = species.assets.portrait;
  if (portrait?.exists) {
    const portraitUrl = versionedAssetUrl(portrait.url, portrait);
    return `
      <section class="species-image-panel">
        <div class="section-heading">
          <h3 class="section-title">Artporträt · ${formatBytes(portrait.bytes)}</h3>
          ${sectionActions(
            species.inInput ? "portrait" : "",
            species.inInput ? "portrait" : "",
            "Artporträt löschen",
            species.inInput ? "portrait" : "",
            portrait.backup,
          )}
        </div>
        <button class="portrait-zoom-trigger" type="button" aria-label="Artporträt vergrößern">
          <img
            class="species-portrait-image"
            src="${escapeHtml(portraitUrl)}"
            alt="${escapeHtml(`Illustriertes Artporträt ${species.germanName}`)}"
          >
          <span class="map-zoom-hint">Vergrößern</span>
        </button>
      </section>
    `;
  }
  return `
    <section class="species-image-panel">
      <div class="section-heading">
        <h3 class="section-title">Artporträt</h3>
        ${sectionActions(species.inInput ? "portrait" : "", "", "", species.inInput ? "portrait" : "", portrait?.backup)}
      </div>
      <div class="species-image-placeholder">
        <strong>${escapeHtml(species.germanName)}</strong>
        <span>Noch kein geprüftes Artporträt vorhanden</span>
      </div>
    </section>
  `;
}

function creditValue(credits, key) {
  return credits?.[key] || "Unbekannt";
}

function creditLink(credits, key, label) {
  const url = safeUrl(credits?.[key]);
  return url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    : escapeHtml("Nicht verfügbar");
}

function soundLicenseInfo({ isNc = null, license = "" } = {}) {
  const text = String(license ?? "").toLowerCase();
  const nc = isNc === true
    || text.includes("/by-nc")
    || text.includes("by-nc")
    || text.includes("noncommercial")
    || text.includes("non-commercial");
  if (nc) {
    return {
      label: "NC",
      title: "Nicht-kommerzielle Lizenz",
      className: "nc",
    };
  }
  if (isNc === false || text) {
    return {
      label: "frei",
      title: "Nicht als NC markiert",
      className: "free",
    };
  }
  return {
    label: "unbekannt",
    title: "Lizenzstatus unbekannt",
    className: "unknown",
  };
}

function soundLicenseBadgeHtml(info) {
  if (!info) return "";
  return `
    <span class="license-kind-badge ${escapeHtml(info.className)}" title="${escapeHtml(info.title)}">
      ${escapeHtml(info.label)}
    </span>
  `;
}

function creditLinkWithLicense(credits, key, label, licenseInfo) {
  return `
    <span class="credit-link-with-badge">
      ${creditLink(credits, key, label)}
      ${soundLicenseBadgeHtml(licenseInfo)}
    </span>
  `;
}

function openSharedMapLightbox(url, alt = "Verbreitungskarte") {
  const mapLightbox = elements.assetReviewMapLightbox;
  const image = elements.assetReviewMapLightboxImage;
  if (!mapLightbox || !image || !url) return;
  image.onload = () => resetScrollableToTop(mapLightbox);
  image.src = url;
  image.alt = alt;
  mapLightbox.setAttribute("aria-label", `Vergrößerte ${alt}`);
  resetScrollableToTop(mapLightbox);
  if (typeof mapLightbox.showModal === "function") mapLightbox.showModal();
  else mapLightbox.setAttribute("open", "");
  resetScrollableToTop(mapLightbox);
  document.body.classList.add("explorer-modal-open");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Anfrage ist fehlgeschlagen");
    error.details = payload.details || [];
    error.fieldErrors = payload.fieldErrors || {};
    throw error;
  }
  return payload;
}

function cacheBustedUrl(url, key = Date.now()) {
  if (!url) return "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${encodeURIComponent(key)}`;
}

function resetScrollableToTop(element) {
  if (!element) return;
  element.scrollTop = 0;
  element.scrollLeft = 0;
  requestAnimationFrame(() => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
}

function assetVersionKey(asset = {}, ...extraParts) {
  return [
    asset.sha256,
    asset.actualSha256,
    asset.metadataSha256,
    asset.actualMetadataSha256,
    asset.soundSha256,
    asset.spectrogramSha256,
    asset.actualSoundSha256,
    asset.actualSpectrogramSha256,
    asset.generatedAt,
    asset.importedAt,
    asset.approvedAt,
    asset.bytes,
    ...extraParts,
  ].filter(Boolean).join("-");
}

function versionedAssetUrl(url, asset = {}, ...extraParts) {
  const key = assetVersionKey(asset, ...extraParts);
  return key ? cacheBustedUrl(url, key) : url;
}

async function refreshExplorerModelOnly({ reload = false } = {}) {
  if (reload) await fetch("/api/reload");
  const [
    summaryResponse,
    validationResponse,
    speciesResponse,
    revisionResponse,
    pendingChangesResponse,
  ] = await Promise.all([
    fetch("/api/summary"),
    fetch("/api/validation"),
    fetch("/api/species"),
    fetch("/api/revision"),
    fetch("/api/pending-changes"),
  ]);
  if (
    !summaryResponse.ok
    || !validationResponse.ok
    || !speciesResponse.ok
    || !revisionResponse.ok
    || !pendingChangesResponse.ok
  ) {
    throw new Error("Lokale Daten konnten nicht aktualisiert werden.");
  }
  const [summary, validation, species, revision, pendingChanges] = await Promise.all([
    summaryResponse.json(),
    validationResponse.json(),
    speciesResponse.json(),
    revisionResponse.json(),
    pendingChangesResponse.json(),
  ]);
  state.dataRevision = revision.revision;
  state.species = species;
  updateSummary(summary);
  updateValidation(validation);
  updatePendingChanges(pendingChanges);
  populateStatusFilter();
  applyFilters();
  return { summary, validation, species, revision, pendingChanges };
}

async function refreshOpenSoundEditor(speciesId) {
  const editDialog = elements.detailPanel.querySelector(".edit-dialog[open]");
  if (!editDialog || editDialog.dataset.activeSection !== "sound") return false;
  const { species } = await refreshExplorerModelOnly({ reload: true });
  const updatedSpecies = species.find((entry) => entry.id === speciesId);
  if (!updatedSpecies) return false;

  const form = editDialog.querySelector(".edit-form");
  const soundFields = editDialog.querySelector(".sound-edit-fields");
  let currentPreview = editDialog.querySelector(".current-sound-preview");
  if (updatedSpecies.assets.sound.exists) {
    if (!currentPreview && soundFields) {
      currentPreview = document.createElement("section");
      currentPreview.className = "current-sound-preview";
      soundFields.before(currentPreview);
    }
    if (currentPreview) {
      releaseAudioElement(currentPreview.querySelector("audio"), { replace: false });
      const cacheKey = [
        updatedSpecies.assets.sound.sha256,
        updatedSpecies.assets.sound.bytes,
        updatedSpecies.assets.spectrogram?.soundSha256,
        Date.now(),
      ].filter(Boolean).join("-");
      currentPreview.innerHTML = `
        <div>
          <strong>Aktueller Sound</strong>
          <span>${escapeHtml(updatedSpecies.isNcSound ? "NC-Lizenz" : "frei/akzeptiert")}</span>
        </div>
        <audio
          class="current-sound-audio"
          controls
          preload="metadata"
          src="${escapeHtml(cacheBustedUrl(updatedSpecies.assets.sound.url, cacheKey))}"
        ></audio>
      `;
    }
  } else if (currentPreview) {
    releaseAudioElement(currentPreview.querySelector("audio"), { replace: false });
    currentPreview.remove();
  }

  const setField = (name, value) => {
    const field = form?.querySelector(`[name="${name}"]`);
    if (field) field.value = value || "";
  };
  const credits = updatedSpecies.credits || {};
  setField("soundRecordist", credits.recordist);
  setField("soundSource", credits.source);
  setField("soundUrl", credits.url);
  setField("soundLicense", credits.license);
  setField("soundCountry", credits.country);
  setField("soundLocation", credits.location);
  setField("soundQuality", credits.quality);
  setField("soundNotes", credits.notes);

  const reasonInput = editDialog.querySelector(".sound-reason-input");
  if (reasonInput) reasonInput.value = updatedSpecies.assets.sound.manualReason || "";
  const careState = editDialog.querySelector(".sound-care-state");
  if (careState) careState.textContent = updatedSpecies.assets.sound.manuallyAdded
    ? "Manuell geschützt"
    : "Automatische Pflege";
  const autoSearchButton = editDialog.querySelector(".sound-auto-search-button");
  if (autoSearchButton) autoSearchButton.textContent = updatedSpecies.assets.sound.exists
    ? "Alternative suchen"
    : "Automatisch suchen";

  const preview = editDialog.querySelector(".sound-edit-preview");
  if (preview) preview.hidden = true;
  for (const audio of editDialog.querySelectorAll(".sound-preview-current, .sound-preview-new")) {
    releaseAudioElement(audio, { replace: false });
  }
  const saveButton = editDialog.querySelector(".sound-save-button");
  if (saveButton) saveButton.disabled = true;
  const creditsPreview = editDialog.querySelector(".sound-credits-preview");
  if (creditsPreview) creditsPreview.replaceChildren();
  return true;
}

function selectSpecies(id) {
  const species = state.species.find((entry) => entry.id === id);
  if (!species) return;
  const scrollPosition = { left: window.scrollX, top: window.scrollY };
  state.selectedId = id;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("species", id);
  window.history.replaceState(null, "", nextUrl);
  for (const item of elements.speciesList.querySelectorAll(".species-item")) {
    const active = item.dataset.id === id;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  }
  renderDetail(species);
  resetScrollableToTop(elements.detailPanel);
  window.scrollTo(scrollPosition);
  requestAnimationFrame(() => window.scrollTo(scrollPosition));
}

function releaseAudioElement(audio, { replace = false } = {}) {
  if (!audio) return null;
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {}
  audio.removeAttribute("src");
  audio.load();
  if (!replace || !audio.parentNode) return audio;
  const releasedAudio = audio.cloneNode(false);
  releasedAudio.controls = audio.controls;
  releasedAudio.preload = "none";
  releasedAudio.className = audio.className;
  audio.parentNode.replaceChild(releasedAudio, audio);
  return releasedAudio;
}

async function releaseAllAudioElements() {
  state.audioCleanup?.();
  state.audioCleanup = null;
  for (const audio of document.querySelectorAll("audio")) {
    releaseAudioElement(audio, { replace: true });
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

document.addEventListener("play", (event) => {
  const current = event.target;
  if (!(current instanceof HTMLAudioElement)) return;
  for (const audio of document.querySelectorAll("audio")) {
    if (audio === current) continue;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // currentTime kann bei noch nicht geladenen Audiodateien gesperrt sein.
    }
  }
}, true);

function releaseDetailMedia() {
  state.audioCleanup?.();
  state.audioCleanup = null;
  state.mapCleanup?.();
  state.mapCleanup = null;
  state.portraitCleanup?.();
  state.portraitCleanup = null;

  for (const audio of elements.detailPanel.querySelectorAll("audio")) {
    releaseAudioElement(audio, { replace: true });
  }
  for (const image of elements.detailPanel.querySelectorAll("img")) {
    image.removeAttribute("src");
    image.removeAttribute("srcset");
  }
}

function hasOpenDialog() {
  return Boolean(document.querySelector("dialog[open]"));
}

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function setupAudioPlayer() {
  state.audioCleanup?.();
  state.audioCleanup = null;

  const audio = elements.detailPanel.querySelector(".explorer-audio");
  if (!audio) return;

  const playButton = elements.detailPanel.querySelector(".audio-play-toggle");
  const visual = elements.detailPanel.querySelector(".audio-visual");
  const marker = elements.detailPanel.querySelector(".audio-progress-marker");
  const time = elements.detailPanel.querySelector(".audio-time");
  const volume = elements.detailPanel.querySelector(".audio-volume");
  let animationFrame = 0;

  const updateProgress = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const progress = duration > 0 ? Math.min(1, Math.max(0, audio.currentTime / duration)) : 0;
    marker.style.left = `${progress * 100}%`;
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
  };

  const animate = () => {
    updateProgress();
    if (!audio.paused && !audio.ended) animationFrame = requestAnimationFrame(animate);
  };

  const updatePlayState = () => {
    const playing = !audio.paused && !audio.ended;
    playButton.textContent = playing ? "Ⅱ" : "▶";
    playButton.setAttribute("aria-label", playing ? "Pause" : "Abspielen");
    playButton.classList.toggle("playing", playing);
    cancelAnimationFrame(animationFrame);
    if (playing) animationFrame = requestAnimationFrame(animate);
    else updateProgress();
  };

  const togglePlayback = async () => {
    if (audio.paused || audio.ended) {
      try {
        await audio.play();
      } catch {
        updatePlayState();
      }
    } else {
      audio.pause();
    }
  };

  const seekFromPointer = async (event) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = visual.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = progress * audio.duration;
    updateProgress();
    try {
      await audio.play();
    } catch {
      updatePlayState();
    }
  };

  playButton.addEventListener("click", togglePlayback);
  visual.addEventListener("click", seekFromPointer);
  visual.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      audio.currentTime = Math.min(audio.duration || 0, Math.max(0, audio.currentTime + direction * 5));
      updateProgress();
    }
  });
  volume.addEventListener("input", () => {
    audio.volume = Number(volume.value);
  });
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("durationchange", updateProgress);
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("play", updatePlayState);
  audio.addEventListener("pause", updatePlayState);
  audio.addEventListener("ended", updatePlayState);
  updatePlayState();

  state.audioCleanup = () => {
    cancelAnimationFrame(animationFrame);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  };
}

function setupMapZoom(species) {
  state.mapCleanup?.();
  state.mapCleanup = null;

  const trigger = elements.detailPanel.querySelector(".map-zoom-trigger");
  const dialog = elements.detailPanel.querySelector(".map-lightbox");
  const closeButton = elements.detailPanel.querySelector(".map-lightbox-close");
  if (!trigger || !dialog || !closeButton) return;

  const open = () => {
    resetScrollableToTop(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    resetScrollableToTop(dialog);
    document.body.classList.add("explorer-modal-open");
  };

  const close = () => {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("explorer-modal-open");
  };

  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  setupSafeBackdropClose(dialog, close);
  dialog.addEventListener("close", () => document.body.classList.remove("explorer-modal-open"));

  state.mapCleanup = () => {
    if (dialog.open) close();
  };
}

function setupPortraitZoom() {
  state.portraitCleanup?.();
  state.portraitCleanup = null;

  const trigger = elements.detailPanel.querySelector(".portrait-zoom-trigger");
  const dialog = elements.detailPanel.querySelector(".portrait-lightbox");
  const closeButton = elements.detailPanel.querySelector(".portrait-lightbox-close");
  if (!trigger || !dialog || !closeButton) return;

  const open = () => {
    resetScrollableToTop(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    resetScrollableToTop(dialog);
    document.body.classList.add("explorer-modal-open");
  };
  const close = () => {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("explorer-modal-open");
  };

  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  setupSafeBackdropClose(dialog, close);
  dialog.addEventListener("close", () => document.body.classList.remove("explorer-modal-open"));
  state.portraitCleanup = () => {
    if (dialog.open) close();
  };
}

function setupAssetReview() {
  const dialog = elements.assetReviewDialog;
  const form = elements.assetReviewForm;
  const mapLightbox = elements.assetReviewMapLightbox;
  const mapLightboxImage = elements.assetReviewMapLightboxImage;

  const stopAssetReviewAudio = () => {
    for (const audio of elements.assetReviewList.querySelectorAll("audio")) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
    }
  };

  const closeMapLightbox = () => {
    if (mapLightbox.open && typeof mapLightbox.close === "function") mapLightbox.close();
    else mapLightbox.removeAttribute("open");
    document.body.classList.remove("explorer-modal-open");
  };

  const openMapLightbox = (trigger) => {
    const url = trigger.dataset.mapUrl;
    const alt = trigger.dataset.mapAlt || "Neue Verbreitungskarte";
    if (!url) return;
    mapLightboxImage.onload = () => resetScrollableToTop(mapLightbox);
    mapLightboxImage.src = url;
    mapLightboxImage.alt = alt;
    mapLightbox.setAttribute("aria-label", `Vergrößerte ${alt}`);
    resetScrollableToTop(mapLightbox);
    if (typeof mapLightbox.showModal === "function") mapLightbox.showModal();
    else mapLightbox.setAttribute("open", "");
    resetScrollableToTop(mapLightbox);
    document.body.classList.add("explorer-modal-open");
  };

  const setMessage = (text = "", type = "") => {
    elements.assetReviewMessage.textContent = text;
    elements.assetReviewMessage.className = `edit-message asset-review-message${type ? ` ${type}` : ""}`;
    elements.assetReviewMessage.hidden = !text;
  };

  const closeReviewDialog = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  const reviewSignature = (assets = []) => JSON.stringify(
    assets.map((asset) => [
      asset.safeName,
      asset.type,
      asset.file,
      asset.url,
      asset.spectrogramUrl,
      asset.previousUrl,
      asset.previousSpectrogramUrl,
      asset.sourceLabel,
    ]),
  );

  const openReview = (status) => {
    if (!status.reviewAssets?.length) return;
    const nextSignature = reviewSignature(status.reviewAssets);
    if (state.assetReviewRunId === status.runId && state.assetReviewSignature === nextSignature && dialog.open) {
      return;
    }
    state.assetReviewRunId = status.runId;
    state.assetReviewSignature = nextSignature;
    state.assetReviewAwaitingRetry = false;
    form.dataset.closeOnly = "false";
    elements.assetReviewSave.textContent = "Entscheidung speichern";
    elements.assetReviewSave.disabled = false;
    const retryMode = status.mode === "manual-maps" || status.mode === "nc-sounds";
    const decisionLabels = (asset) => {
      if (asset.type === "map") {
        return {
          automatic: status.mode === "manual-maps"
            ? "Automatische Karte übernehmen"
            : "Karte automatisch pflegen",
          manual: status.mode === "manual-maps" && asset.previouslyExisting === false
            ? "Neue Karte nicht übernehmen"
            : status.mode === "manual-maps"
              ? `Bisherige ${asset.previousManual ? "manuelle" : "automatische"} Karte behalten`
              : "Manuell pflegen und schützen",
        };
      }
      const soundKind = asset.isNc ? "NC" : "frei";
      return {
        automatic: `Gefundenen Sound übernehmen (${soundKind})`,
        manual: status.mode === "nc-sounds" && asset.previouslyExisting === false
          ? "Sound nicht übernehmen"
          : status.mode === "nc-sounds"
            ? "Bisherigen Sound behalten"
            : "Manuell pflegen und schützen",
      };
    };
    elements.assetReviewList.innerHTML = status.reviewAssets.map((asset, index) => {
      const labels = decisionLabels(asset);
      const currentSoundKind = asset.previousSourceLabel || (asset.previousIsNc === true ? "NC" : "frei");
      const foundSoundKind = asset.sourceLabel || (asset.isNc ? "NC" : "frei");
      const metaLine = asset.type === "sound"
        ? `${asset.scientificName} · gefundener Sound: ${foundSoundKind}`
        : `${asset.scientificName} · ${asset.file}`;
      return `
      <article class="asset-review-item" data-index="${index}" data-type="${escapeHtml(asset.type)}">
        <div class="asset-review-preview">
          ${asset.type === "map"
            ? `
              <div class="asset-review-map-compare">
                <div class="asset-review-map-preview">
                  <strong>Bisherige Karte</strong>
                  ${asset.previousUrl ? `
                    <button
                      class="asset-review-map-trigger"
                      type="button"
                      data-map-url="${escapeHtml(asset.previousUrl)}"
                      data-map-alt="${escapeHtml(`bisherige Karte ${asset.germanName}`)}"
                      aria-label="Bisherige Karte ${escapeHtml(asset.germanName)} vergrößern"
                    >
                      <img src="${escapeHtml(asset.previousUrl)}" alt="${escapeHtml(`Bisherige Karte ${asset.germanName}`)}">
                      <span class="asset-review-zoom-hint">Vergrößern</span>
                    </button>
                  ` : `<span class="asset-review-no-map">Keine Karte vorhanden</span>`}
                </div>
                <div class="asset-review-map-preview">
                  <strong>Gefundene Karte</strong>
                  <button
                    class="asset-review-map-trigger"
                    type="button"
                    data-map-url="${escapeHtml(asset.url)}"
                    data-map-alt="${escapeHtml(`gefundene Karte ${asset.germanName}`)}"
                    aria-label="Gefundene Karte ${escapeHtml(asset.germanName)} vergrößern"
                  >
                    <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(`Gefundene Karte ${asset.germanName}`)}">
                    <span class="asset-review-zoom-hint">Vergrößern</span>
                  </button>
                </div>
              </div>
            `
            : `
              <div class="asset-review-sound-compare">
                ${asset.previousUrl ? `
                  <div class="asset-review-sound-preview">
                    <strong>Aktueller Sound (${escapeHtml(currentSoundKind)})</strong>
                    ${asset.previousSpectrogramUrl ? `
                      <button
                        class="asset-review-spectrogram"
                        type="button"
                        aria-label="Im bisherigen Spektrogramm von ${escapeHtml(asset.germanName)} springen"
                      >
                        <img src="${escapeHtml(asset.previousSpectrogramUrl)}" alt="${escapeHtml(`Bisheriges Spektrogramm ${asset.germanName}`)}">
                        <span class="asset-review-progress-marker"></span>
                      </button>
                    ` : `<span class="asset-review-no-spectrogram">Bisheriges Spektrogramm nicht vorhanden</span>`}
                    <audio controls preload="metadata" src="${escapeHtml(asset.previousUrl)}"></audio>
                  </div>
                ` : ""}
                <div class="asset-review-sound-preview">
                  <strong>Gefundener Sound (${escapeHtml(foundSoundKind)})</strong>
                  ${asset.spectrogramUrl ? `
                    <button
                      class="asset-review-spectrogram"
                      type="button"
                      aria-label="Im Spektrogramm von ${escapeHtml(asset.germanName)} springen"
                    >
                      <img src="${escapeHtml(asset.spectrogramUrl)}" alt="${escapeHtml(`Spektrogramm ${asset.germanName}`)}">
                      <span class="asset-review-progress-marker"></span>
                    </button>
                  ` : `<span class="asset-review-no-spectrogram">Spektrogramm noch nicht vorhanden</span>`}
                  <audio controls preload="metadata" src="${escapeHtml(asset.url)}"></audio>
                </div>
              </div>
            `}
        </div>
        <div class="asset-review-copy">
          <div>
            <strong>${escapeHtml(asset.germanName)} · ${escapeHtml(asset.label)}</strong>
            <p>${escapeHtml(metaLine)}</p>
          </div>
          <div class="asset-review-options">
            <label>
              <input type="radio" name="asset-${index}" value="automatic" required>
              ${escapeHtml(labels.automatic)}
            </label>
            <label>
              <input type="radio" name="asset-${index}" value="manual" required>
              ${escapeHtml(labels.manual)}
            </label>
            ${asset.type === "sound" ? `
              <label>
                <input type="radio" name="asset-${index}" value="reject" required>
                Gefundenen Sound ablehnen und weiter suchen
              </label>
            ` : ""}
          </div>
        </div>
      </article>
    `;
    }).join("");
    form.dataset.runId = status.runId;
    form.dataset.assets = JSON.stringify(status.reviewAssets);
    setMessage(
      retryMode
        ? "Bitte für jede gefundene Alternative festlegen, ob sie übernommen, abgelehnt oder der bisherige Bestand behalten wird."
        : "Bitte für jede neue Karte und jeden neuen Sound eine Pflegeart auswählen.",
      "info",
    );
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    for (const item of elements.assetReviewList.querySelectorAll(".asset-review-sound-preview")) {
      const audio = item.querySelector("audio");
      const marker = item.querySelector(".asset-review-progress-marker");
      if (!audio || !marker) continue;
      const updateMarker = () => {
        const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
        marker.style.left = `${Math.min(1, Math.max(0, progress)) * 100}%`;
      };
      audio.addEventListener("timeupdate", updateMarker);
      audio.addEventListener("loadedmetadata", updateMarker);
      audio.addEventListener("seeked", updateMarker);
    }
  };

  dialog.addEventListener("cancel", (event) => event.preventDefault());
  elements.assetReviewList.addEventListener("click", (event) => {
    const trigger = event.target.closest(".asset-review-map-trigger");
    if (trigger) openMapLightbox(trigger);
    const spectrogram = event.target.closest(".asset-review-spectrogram");
    if (spectrogram) {
      const item = spectrogram.closest(".asset-review-sound-preview");
      const audio = item?.querySelector("audio");
      const marker = spectrogram.querySelector(".asset-review-progress-marker");
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const rect = spectrogram.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.currentTime = progress * audio.duration;
      if (marker) marker.style.left = `${progress * 100}%`;
      audio.play().catch(() => {});
    }
  });
  elements.assetReviewMapLightboxClose.addEventListener("click", closeMapLightbox);
  setupSafeBackdropClose(mapLightbox, closeMapLightbox);
  mapLightbox.addEventListener("close", () => document.body.classList.remove("explorer-modal-open"));
  dialog.addEventListener("close", () => {
    stopAssetReviewAudio();
    closeMapLightbox();
    state.assetReviewAwaitingRetry = false;
    state.assetReviewSignature = "";
    form.dataset.closeOnly = "false";
    elements.assetReviewSave.textContent = "Entscheidung speichern";
    if (state.reloadAfterAssetReviewClose || state.pendingRevisionReload) {
      const forceReload = state.reloadAfterAssetReviewClose;
      state.reloadAfterAssetReviewClose = false;
      state.pendingRevisionReload = false;
      void loadData({ reload: forceReload });
    }
  });
  state.finishAssetReviewWaiting = (status) => {
    if (!dialog.open || !state.assetReviewAwaitingRetry) return false;
    const failed = status.status === "failed";
    const logText = (status.log || []).join("\n");
    const noAlternative =
      /Keine neue automatische Alternative gefunden|Keine neue geeignete Soundalternative|Keine weitere Soundquelle|Keine weitere Soundalternative|Keine freie Alternative gefunden|keine weitere taugliche Quelle/i
        .test(logText);
    stopAssetReviewAudio();
    setMessage(
      failed
        ? status.error || "Sound-Suchlauf fehlgeschlagen. Der bisherige Sound bleibt erhalten."
        : noAlternative
        ? "Sound-Suchlauf abgeschlossen. Es wurde keine weitere geeignete Soundalternative gefunden; der bisherige Sound bleibt erhalten."
        : "Sound-Suchlauf abgeschlossen. Der bisherige Sound bleibt erhalten.",
      failed ? "error" : "info",
    );
    form.dataset.closeOnly = "true";
    elements.assetReviewSave.textContent = "Fenster schließen";
    elements.assetReviewSave.disabled = false;
    state.assetReviewAwaitingRetry = false;
    return true;
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.closeOnly === "true") {
      closeReviewDialog();
      return;
    }
    const assets = JSON.parse(form.dataset.assets || "[]");
    const formData = new FormData(form);
    const choices = assets.map((asset, index) => ({
      safeName: asset.safeName,
      type: asset.type,
      decision: formData.get(`asset-${index}`),
      manual: formData.get(`asset-${index}`) === "manual",
    }));
    const rejectedSound = choices.some((choice) => choice.type === "sound" && choice.decision === "reject");
    elements.assetReviewSave.disabled = true;
    setMessage("Pflegeentscheidungen werden gespeichert…", "info");
    try {
      await fetchJson("/api/pipeline/assets/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: form.dataset.runId,
          choices,
        }),
      });
      if (rejectedSound) {
        state.assetReviewAwaitingRetry = true;
        stopAssetReviewAudio();
        setMessage(
          "Gefundener Sound wurde abgelehnt und gemerkt. Nächster Sound wird gesucht …",
          "info",
        );
      } else {
        closeReviewDialog();
        setMessage();
      }
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      elements.assetReviewSave.disabled = false;
    } finally {
      if (!rejectedSound && form.dataset.closeOnly !== "true") elements.assetReviewSave.disabled = false;
    }
  });

  state.openAssetReview = openReview;
}

function setupBackupSettings() {
  const dialog = elements.settingsDialog;
  const form = elements.settingsForm;
  if (!dialog || !form) return;
  const cancelButtons = [...dialog.querySelectorAll(".settings-cancel")];

  const setMessage = (text = "", type = "") => {
    elements.settingsMessage.textContent = text;
    elements.settingsMessage.className = `edit-message settings-message${type ? ` ${type}` : ""}`;
    elements.settingsMessage.hidden = !text;
  };

  const close = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  const showDialog = () => {
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  const applySettings = (settings) => {
    state.settingsSnapshot = settings;
    elements.backupRootInput.value = settings.backupRoot || "";
    elements.backupRootDefault.textContent = settings.defaultBackupRoot || "W:\\Website Datenbank Backup";
  };

  const loadSettings = async () => {
    const settings = await fetchJson("/api/settings");
    applySettings(settings);
    return settings;
  };

  const openSettings = async () => {
    setMessage("Einstellungen werden geladen...", "info");
    elements.settingsSaveButton.disabled = true;
    showDialog();
    try {
      const settings = await loadSettings();
      setMessage(
        settings.hasCustomBackupRoot
          ? "Eigener Backup-Pfad ist aktiv."
          : "Der Standardpfad ist aktiv.",
        "info",
      );
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      elements.settingsSaveButton.disabled = false;
    }
  };

  for (const button of elements.settingsButtons) {
    button.addEventListener("click", openSettings);
  }

  elements.settingsResetButton.addEventListener("click", () => {
    const defaultBackupRoot = state.settingsSnapshot?.defaultBackupRoot || "W:\\Website Datenbank Backup";
    elements.backupRootInput.value = defaultBackupRoot;
    setMessage("Standardpfad wird beim Speichern verwendet.", "info");
  });

  for (const button of cancelButtons) button.addEventListener("click", close);
  setupSafeBackdropClose(dialog, close);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.settingsSaveButton.disabled = true;
    setMessage("Backup-Pfad wird gespeichert...", "info");
    const requestedBackupRoot = elements.backupRootInput.value.trim();
    const defaultBackupRoot = state.settingsSnapshot?.defaultBackupRoot || "";
    try {
      const settings = await fetchJson("/api/settings/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          requestedBackupRoot === defaultBackupRoot
            ? { reset: true }
            : { backupRoot: requestedBackupRoot },
        ),
      });
      applySettings(settings);
      setMessage("Backup-Pfad gespeichert.", "success");
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      elements.settingsSaveButton.disabled = false;
    }
  });
}

function setupPipelineControl() {
  const dialog = elements.pipelineDialog;
  const form = elements.pipelineForm;
  const cancelButtons = [...dialog.querySelectorAll(".pipeline-cancel")];
  const footerCloseButton = dialog.querySelector(".pipeline-dialog-close-button");
  let previewToken = "";
  let previewMode = "";
  let previewKind = "";
  let backupForceStart = false;

  const modeLabel = (mode) => ({
    missing: "Neue/Unvollständige Arten aktualisieren",
    all: "Alle Arten vollständig aktualisieren",
    "manual-maps": "Manuelle und fehlende Karten erneut suchen",
    "nc-sounds": "NC- und fehlende Sounds erneut suchen",
    transfer: "Änderungen übertragen",
    cleanup: "Verwaiste Daten und Assets dauerhaft löschen",
  }[mode] || mode);

  const backupLabel = () => "NAS-Backup erstellen";

  const setMessage = (text = "", type = "") => {
    elements.pipelineMessage.textContent = text;
    elements.pipelineMessage.className = `edit-message pipeline-message${type ? ` ${type}` : ""}`;
    elements.pipelineMessage.hidden = !text;
  };

  const close = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  const showDialog = () => {
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  const setPipelineButtonsDisabled = (disabled) => {
    for (const button of elements.pipelineButtons) button.disabled = disabled;
    for (const button of elements.backupButtons) button.disabled = disabled;
    for (const button of elements.settingsButtons) button.disabled = disabled;
  };

  const setDialogCloseMode = (active) => {
    footerCloseButton.textContent = active ? "Fenster schließen" : "Abbrechen";
  };

  const statusPresentation = (status) => {
    if (status.status === "running") {
      return {
        className: "running",
        title: "Pipeline-Lauf läuft gerade",
        detail: `${modeLabel(status.mode)} · ${status.phase || "Verarbeitung läuft"}`,
        message: "Pipeline-Lauf läuft gerade. Das Fenster kann geschlossen werden; der Lauf läuft im Hintergrund weiter.",
        messageType: "info",
      };
    }
    if (status.status === "awaiting-review") {
      return {
        className: "review",
        title: "Pipeline-Lauf wartet auf Prüfung",
        detail: `${modeLabel(status.mode)} · neue Karten oder Sounds müssen geprüft werden`,
        message: "Der Pipeline-Lauf wartet auf die Prüfung der neuen Karten und Sounds.",
        messageType: "info",
      };
    }
    if (status.status === "completed") {
      return {
        className: "completed",
        title: "Pipeline-Lauf abgeschlossen",
        detail: status.gitPublished
          ? `${modeLabel(status.mode)} · Verarbeitung, Commit und Push sind abgeschlossen`
          : `${modeLabel(status.mode)} · Verarbeitung ist abgeschlossen`,
        message: status.gitPublished
          ? "Pipeline-Lauf abgeschlossen. Änderungen wurden committed und gepusht."
          : "Pipeline-Lauf abgeschlossen.",
        messageType: "success",
      };
    }
    if (status.status === "failed") {
      return {
        className: "failed",
        title: "Pipeline-Lauf fehlgeschlagen",
        detail: status.error || `${modeLabel(status.mode)} wurde nicht erfolgreich abgeschlossen`,
        message: `Pipeline-Lauf fehlgeschlagen${status.error ? `: ${status.error}` : "."}`,
        messageType: "error",
      };
    }
    return null;
  };

  const backupStatusPresentation = (status) => {
    if (status.status === "running") {
      return {
        className: "running",
        title: "NAS-Backup läuft gerade",
        detail: `${Math.max(0, Math.min(100, Math.round(status.percent || 0)))}% · ${status.phase || "Backup läuft"}`,
        message: "NAS-Backup läuft gerade. Das Fenster kann geschlossen werden; der Lauf läuft im Hintergrund weiter.",
        messageType: "info",
      };
    }
    if (status.status === "completed") {
      return {
        className: "completed",
        title: status.skipped ? "NAS-Backup nicht erforderlich" : "NAS-Backup abgeschlossen",
        detail: status.skipped
          ? (status.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt")
          : `${formatBytes(status.totalBytes)} · ${status.archivePath || status.backupRoot}`,
        message: status.skipped
          ? (status.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt.")
          : "NAS-Backup abgeschlossen.",
        messageType: "success",
      };
    }
    if (status.status === "failed") {
      return {
        className: "failed",
        title: "NAS-Backup fehlgeschlagen",
        detail: status.error || "Backup wurde nicht erfolgreich abgeschlossen",
        message: `NAS-Backup fehlgeschlagen${status.error ? `: ${status.error}` : "."}`,
        messageType: "error",
      };
    }
    return null;
  };

  const renderPersistentPipelineStatus = (status) => {
    const backupPresentation = backupStatusPresentation(state.backupStatusSnapshot || {});
    const backupFirst = state.backupStatusSnapshot?.status === "running" || state.backupWasRunning;
    const presentation = backupFirst
      ? backupPresentation || statusPresentation(status)
      : statusPresentation(status) || backupPresentation;
    elements.pipelineRunNotice.hidden = !presentation;
    elements.pipelineRunNotice.className = `pipeline-run-notice${presentation ? ` ${presentation.className}` : ""}`;
    if (!presentation) return;
    elements.pipelineRunNoticeTitle.textContent = presentation.title;
    elements.pipelineRunNoticeDetail.textContent = presentation.detail;
  };
  state.renderPersistentPipelineStatus = renderPersistentPipelineStatus;

  const showStatusDialog = (status) => {
    const presentation = statusPresentation(status);
    if (!presentation) return;
    previewToken = "";
    previewMode = status.mode;
    elements.pipelineDialogTitle.textContent = presentation.title;
    elements.pipelineDialogDescription.textContent = modeLabel(status.mode);
    elements.pipelineModeChoice.hidden = true;
    elements.pipelinePreview.hidden = true;
    elements.pipelineStartButton.hidden = true;
    elements.pipelineStartButton.disabled = true;
    setDialogCloseMode(true);
    setMessage(presentation.message, presentation.messageType);
    showDialog();
  };

  const showBackupStatusDialog = (status) => {
    const presentation = backupStatusPresentation(status);
    if (!presentation) return;
    previewToken = "";
    previewMode = "nas-backup";
    previewKind = "backup";
    elements.pipelineDialogTitle.textContent = presentation.title;
    elements.pipelineDialogDescription.textContent = backupLabel();
    elements.pipelineModeChoice.hidden = true;
    elements.pipelinePreview.hidden = true;
    elements.pipelineStartButton.hidden = true;
    elements.pipelineStartButton.disabled = true;
    setDialogCloseMode(status.status === "running");
    setMessage(presentation.message, presentation.messageType);
    showDialog();
  };

  const openChooser = () => {
    if (state.pipelineStatusSnapshot?.status === "running"
      || state.pipelineStatusSnapshot?.status === "awaiting-review") {
      showStatusDialog(state.pipelineStatusSnapshot);
      return;
    }
    if (state.backupStatusSnapshot?.status === "running") {
      showBackupStatusDialog(state.backupStatusSnapshot);
      return;
    }
    previewToken = "";
    previewMode = "";
    previewKind = "";
    backupForceStart = false;
    elements.pipelineDialogTitle.textContent = "Datenbank-Aktionen";
    elements.pipelineDialogDescription.textContent = "Wähle aus, was aktualisiert, gesichert oder bereinigt werden soll.";
    elements.pipelineModeChoice.hidden = false;
    elements.pipelinePreview.hidden = true;
    elements.pipelineStartButton.hidden = true;
    elements.pipelineStartButton.disabled = true;
    setDialogCloseMode(false);
    setMessage();
    showDialog();
  };

  const renderPreview = (result) => {
    if (result.mode === "cleanup") {
      const assetRows = result.obsoleteAssetDirectories.map((entry) => `
        <li><strong>${escapeHtml(entry.path)}</strong> · ${escapeHtml(formatBytes(entry.bytes))}</li>
      `).join("");
      const dataRows = result.obsoleteData.map((entry) => `
        <li><strong>${escapeHtml(entry.germanName)}</strong> · ${escapeHtml(entry.scientificName)}</li>
      `).join("");
      elements.pipelinePreviewContent.innerHTML = result.hasWork
        ? `
          <p><strong>${result.obsoleteData.length}</strong> veraltete Datensätze,
            <strong>${result.obsoleteAssetDirectories.length}</strong> verwaiste Assetordner und
            <strong>${result.obsoleteAssessmentKeys.length}</strong> alte Assessment-Zuordnungen sowie
            <strong>${result.obsoleteOverrideKeys.length}</strong> verwaiste Pflegeeinträge.</p>
          ${dataRows ? `<h5>Datensätze</h5><ul>${dataRows}</ul>` : ""}
          ${assetRows ? `<h5>Assetordner</h5><ul>${assetRows}</ul>` : ""}
        `
        : "<p>Keine verwaisten Daten oder Assetordner gefunden.</p>";
      elements.pipelineWarning.textContent =
        "Dauerhaft löschen: Die aufgelisteten Daten und Dateien sind danach nicht wiederherstellbar.";
      return;
    }

    const targetRows = result.targets.map((entry) => `
      <li>
        <strong>${escapeHtml(entry.germanName)}</strong>
        <span>${escapeHtml(entry.scientificName)} · ${escapeHtml(entry.reasons.join(", "))}</span>
      </li>
    `).join("");
    const removedRows = result.removed.map((entry) => `
      <li><strong>${escapeHtml(entry.germanName)}</strong> · wird aus der Pipeline-Ausgabe entfernt</li>
    `).join("");
    const pendingFiles = Array.isArray(result.pendingFiles) ? result.pendingFiles : [];
    const pendingFileRows = pendingFiles.slice(0, 12).map((entry) => `
      <li><strong>${escapeHtml(formatPendingFileStatus(entry.status))}</strong> · ${escapeHtml(entry.path)}</li>
    `).join("");
    const pendingMoreRows = pendingFiles.length > 12
      ? `<li>${pendingFiles.length - 12} weitere Datei(en)</li>`
      : "";
    const affectedSpeciesCount = Number.isFinite(result.affectedSpeciesCount)
      ? result.affectedSpeciesCount
      : result.targetCount;
    const transferSummary = result.mode === "transfer"
      ? `
        <p>
          <strong>${affectedSpeciesCount}</strong> Art(en) betroffen:
          <strong>${result.targetCount}</strong> mit geänderten Eingabefeldern,
          <strong>${result.pendingFileCount || 0}</strong> lokale Dateiänderung(en).
        </p>
      `
      : `<p><strong>${result.targetCount}</strong> von ${result.inputCount} Arten werden verarbeitet.</p>`;
    elements.pipelinePreviewContent.innerHTML = `
      ${transferSummary}
      ${targetRows ? `<ul class="pipeline-target-list">${targetRows}</ul>` : result.mode === "transfer" && pendingFiles.length ? "" : "<p>Keine Zielarten gefunden.</p>"}
      ${pendingFileRows || pendingMoreRows ? `<h5>Lokale Dateiänderungen</h5><ul>${pendingFileRows}${pendingMoreRows}</ul>` : ""}
      ${removedRows ? `<h5>Aus Ausgabe entfernen</h5><ul>${removedRows}</ul>` : ""}
    `;
    elements.pipelineWarning.textContent =
      result.mode === "transfer"
        ? "Nach erfolgreicher Übertragung werden die gesammelten Änderungen committed und gepusht."
        : "Nach erfolgreichem Lauf werden die Pipeline-Änderungen automatisch committed und gepusht.";
  };

  const renderBackupPreview = (result) => {
    backupForceStart = result.skipped === true;
    elements.pipelinePreviewContent.innerHTML = result.skipped
      ? `
        <p><strong>Kein neues Backup erforderlich.</strong></p>
        <p>${escapeHtml(result.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt.")}</p>
        <p>Letztes Backup: <strong>${escapeHtml(result.archivePath || "Unbekannt")}</strong></p>
      `
      : `
        <p><strong>${result.fileCount}</strong> Dateien werden als ZIP gesichert.</p>
        <ul>
          <li>Ziel: <strong>${escapeHtml(result.backupRoot)}</strong></li>
          <li>Voraussichtliche Rohdatenmenge: <strong>${escapeHtml(formatBytes(result.totalBytes))}</strong></li>
          <li>Geplante Datei: <strong>${escapeHtml(result.archivePath)}</strong></li>
          <li>Backup-Rotation entfernt danach: <strong>${result.retentionWouldRemove}</strong> alte Datei(en)</li>
        </ul>
      `;
    elements.pipelineWarning.textContent = result.skipped
      ? "Du kannst trotzdem manuell ein neues Backup erzwingen."
      : "Das Backup wird auf dem NAS erstellt. Die App zeigt den Fortschritt in Prozent.";
  };

  async function startCurrentPipelinePreview() {
    if (!previewToken) return;
    state.audioCleanup?.();
    state.audioCleanup = null;
    if (previewMode === "nc-sounds") await releaseAllAudioElements();
    elements.pipelineStartButton.disabled = true;
    setMessage(
      previewMode === "cleanup"
        ? "Bereinigung wird gestartet…"
        : previewMode === "transfer"
          ? "Übertragung wird gestartet…"
          : "Pipeline wird gestartet…",
      "info",
    );
    try {
      const startedStatus = await fetchJson("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: previewToken }),
      });
      state.pipelineStatusSnapshot = startedStatus;
      state.pipelineWasRunning = true;
      previewToken = "";
      elements.pipelineStartButton.hidden = true;
      elements.pipelinePreview.hidden = true;
      setDialogCloseMode(true);
      const presentation = statusPresentation(startedStatus);
      elements.pipelineDialogTitle.textContent = presentation.title;
      elements.pipelineDialogDescription.textContent = modeLabel(startedStatus.mode);
      setMessage(presentation.message, presentation.messageType);
      renderPersistentPipelineStatus(startedStatus);
      await refreshPipelineStatus();
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      elements.pipelineStartButton.disabled = false;
    }
  }

  async function startSilentPipelinePreview(mode, options = {}) {
    state.silentPipelineContext = options.context || null;
    if (mode === "nc-sounds") await releaseAllAudioElements();
    const result = await fetchJson("/api/pipeline/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, targetSlugs: options.targetSlugs || [] }),
    });
    if (!result.tokensAvailable) {
      throw new Error("Die benötigten API-Tokens fehlen in der Server-Umgebung.");
    }
    if (!result.hasWork) {
      state.silentPipelineContext = null;
      return {
        noWork: true,
        message: "Für diese Art wurde aktuell keine passende Suchaktion gefunden.",
        preview: result,
      };
    }
    const startedStatus = await fetchJson("/api/pipeline/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: result.token }),
    });
    state.pipelineStatusSnapshot = startedStatus;
    state.pipelineWasRunning = true;
    renderPersistentPipelineStatus(startedStatus);
    void refreshPipelineStatus();
    return { noWork: false, status: startedStatus, preview: result };
  }

  async function openPreview(mode, options = {}) {
    if (options.silent) return startSilentPipelinePreview(mode, options);
    previewToken = "";
    previewMode = mode;
    previewKind = "pipeline";
    backupForceStart = false;
    elements.pipelineStartButton.disabled = true;
    elements.pipelineStartButton.hidden = true;
    elements.pipelineModeChoice.hidden = true;
    elements.pipelinePreview.hidden = true;
    setDialogCloseMode(false);
    setMessage("Vorschau wird erstellt…", "info");
    elements.pipelineDialogTitle.textContent = options.transfer
      ? "Änderungen übertragen"
      : options.speciesRefresh
        ? "Art aktualisieren"
        : modeLabel(mode);
    elements.pipelineDialogDescription.textContent =
      options.transfer
        ? "Geänderte Eingabefelder und lokal gespeicherte Assets werden ohne externe Suche übertragen."
        : options.speciesRefresh
          ? "Vollständiger Pipeline-Lauf nur für diese Art."
        : mode === "cleanup"
        ? "Es wird genau einmal bestätigt, welche Alt-Daten und Assets dauerhaft gelöscht werden."
        : mode === "manual-maps"
          ? "Manuell geschützte und fehlende Karten werden erneut bei IUCN gesucht."
          : mode === "nc-sounds"
            ? "Vorhandene NC-Sounds werden auf freie Alternativen geprüft; fehlende Sounds werden erneut gesucht."
            : "Vor dem Start werden Zielarten und Umfang geprüft.";
    showDialog();

    try {
      const result = await fetchJson("/api/pipeline/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, targetSlugs: options.targetSlugs || [] }),
      });
      previewToken = result.token;
      renderPreview(result);
      elements.pipelinePreview.hidden = false;
      elements.pipelineStartButton.hidden = false;
      elements.pipelineStartButton.disabled = !result.hasWork || !result.tokensAvailable;
      elements.pipelineStartButton.textContent =
        options.transfer
          ? "Änderungen übertragen"
          : mode === "cleanup"
          ? "Dauerhaft löschen"
          : mode === "manual-maps" || mode === "nc-sounds"
            ? "Suchlauf starten"
            : "Pipeline starten";
      setMessage(
        !result.tokensAvailable
          ? "Die benötigten API-Tokens fehlen in der Server-Umgebung."
          : result.hasWork
            ? "Vorschau ist bereit."
            : "Für diesen Lauf wurden keine Aktionen gefunden.",
        !result.tokensAvailable
          ? "error"
          : result.hasWork ? "success" : "info",
      );
      if (options.autoStart && result.hasWork && result.tokensAvailable) {
        await startCurrentPipelinePreview();
      }
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    }
  }

  async function openBackupPreview() {
    previewToken = "";
    previewMode = "nas-backup";
    previewKind = "backup";
    backupForceStart = false;
    elements.pipelineStartButton.disabled = true;
    elements.pipelineStartButton.hidden = true;
    elements.pipelineModeChoice.hidden = true;
    elements.pipelinePreview.hidden = true;
    setDialogCloseMode(false);
    setMessage("Backup-Vorschau wird erstellt...", "info");
    elements.pipelineDialogTitle.textContent = backupLabel();
    elements.pipelineDialogDescription.textContent = "Vor dem Start werden Zielpfad, Umfang und Rotation geprueft.";
    showDialog();

    try {
      const result = await fetchJson("/api/backup/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      renderBackupPreview(result);
      elements.pipelinePreview.hidden = false;
      elements.pipelineStartButton.hidden = false;
      elements.pipelineStartButton.disabled = false;
      elements.pipelineStartButton.textContent = result.skipped
        ? "Backup trotzdem erstellen"
        : "Backup starten";
      setMessage("Backup-Vorschau ist bereit.", "success");
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    }
  }

  async function notifySilentPipelineContext(status) {
    const context = state.silentPipelineContext;
    if (!context || context.source !== "editor") return false;
    const editDialog = elements.detailPanel.querySelector(".edit-dialog[open]");
    if (!editDialog) return false;
    const message = editDialog.querySelector(
      context.section === "map" ? ".map-edit-message" : ".sound-edit-message",
    );
    if (!message) return false;

    const setEditorMessage = (text, type = "info") => {
      message.textContent = text;
      message.className = `edit-message ${context.section === "map" ? "map-edit-message" : "sound-edit-message"} ${type}`;
      message.hidden = false;
    };

    if (status.status === "failed") {
      setEditorMessage(
        status.error || "Der gezielte Suchlauf ist fehlgeschlagen. Details stehen im Datenbankstatus.",
        "error",
      );
      return true;
    }

    if (status.status !== "completed") return false;

    const logText = (status.log || []).join("\n");
    const noAlternative =
      /Keine neue automatische Alternative gefunden|Keine neue geeignete Soundalternative|Keine neue automatisch abrufbare Karte|Keine weitere Soundalternative|Keine freie Alternative gefunden/i
        .test(logText);
    const soundLocked = /Sounddatei .*gesperrt|noch geöffnet oder gesperrt|Datei gesperrt/i.test(logText);
    const rejectedSourcesSkipped = /Abgelehnte Soundquelle wird übersprungen/i.test(logText);
    if (context.section === "map") {
      try {
        await refreshExplorerModelOnly({ reload: true });
      } catch (error) {
        setEditorMessage(
          `Kartensuchlauf abgeschlossen, aber der Status konnte nicht aktualisiert werden: ${error.message}`,
          "error",
        );
        return true;
      }
      setEditorMessage(
        noAlternative
          ? "Kartensuchlauf abgeschlossen. Lokal wurde keine direkt speicherbare Karte gefunden. Bitte „IUCN-Karte im Browser öffnen“ nutzen, den sichtbaren Backblaze-JPEG-Link ins Quellenfeld kopieren und „Karte prüfen“ wählen."
          : "Kartensuchlauf abgeschlossen. Die Auswahl wurde verarbeitet.",
        noAlternative ? "info" : "success",
      );
    } else {
      let refreshedSoundEditor = false;
      if (!soundLocked && !noAlternative) {
        try {
          refreshedSoundEditor = await refreshOpenSoundEditor(context.speciesId);
        } catch (error) {
          setEditorMessage(
            `Sound-Suchlauf abgeschlossen, aber die offene Ansicht konnte nicht aktualisiert werden: ${error.message}`,
            "error",
          );
          return true;
        }
      }
      setEditorMessage(
        soundLocked
          ? "Sound-Suchlauf abgeschlossen. Die Sounddatei war noch geöffnet oder gesperrt; bitte Wiedergabe/Fenster schließen und erneut suchen."
          : rejectedSourcesSkipped && noAlternative
          ? "Sound-Suchlauf abgeschlossen. Bereits abgelehnte Soundquellen wurden übersprungen; keine weitere geeignete Alternative gefunden."
          : noAlternative
          ? "Sound-Suchlauf abgeschlossen. Es wurde keine weitere geeignete Soundalternative gefunden."
          : refreshedSoundEditor
          ? "Sound-Suchlauf abgeschlossen. Der aktuelle Sound und die Credits wurden im geöffneten Fenster aktualisiert."
          : "Sound-Suchlauf abgeschlossen. Die Auswahl wurde verarbeitet.",
        soundLocked ? "error" : noAlternative ? "info" : "success",
      );
    }
    return true;
  }

  async function refreshPipelineStatus() {
    try {
      const status = await fetchJson("/api/pipeline/status");
      state.pipelineStatusSnapshot = status;
      const running = status.status === "running";
      const awaitingReview = status.status === "awaiting-review";
      const active = running || awaitingReview;
      setPipelineButtonsDisabled(active);
      if (running) renderDatabaseStatus("running");
      else if (awaitingReview) renderDatabaseStatus("review");
      else if (status.status === "failed") renderDatabaseStatus("failed");
      else renderDatabaseStatus();
      renderPersistentPipelineStatus(status);
      elements.pipelineStatusDetail.textContent = active
        ? `${modeLabel(status.mode)} · gestartet ${formatDate(status.startedAt).replace(/^Report /, "")}`
        : status.completedAt
          ? `${modeLabel(status.mode)} · beendet ${formatDate(status.completedAt).replace(/^Report /, "")}`
          : "Kein Lauf aktiv.";
      elements.pipelineStatusDetail.className = `pipeline-dialog-status${
        status.status === "awaiting-review" ? " review" : status.status !== "idle" ? ` ${status.status}` : ""
      }`;
      updateProcessLog(status.log);

      if (dialog.open && active) {
        const presentation = statusPresentation(status);
        setDialogCloseMode(true);
        setMessage(presentation.message, presentation.messageType);
      } else if (dialog.open && state.pipelineWasRunning && !active) {
        const presentation = statusPresentation(status);
        if (presentation) {
          elements.pipelineDialogTitle.textContent = presentation.title;
          elements.pipelineDialogDescription.textContent = modeLabel(status.mode);
          setDialogCloseMode(true);
          setMessage(presentation.message, presentation.messageType);
        }
      }

      if (awaitingReview && !state.newSpeciesPipelineActive) state.openAssetReview?.(status);

      if (state.pipelineWasRunning && !active && status.status !== "idle") {
        if (status.status === "completed" && status.gitPublished) state.notice = "";
        const keepAssetReviewOpen = state.finishAssetReviewWaiting?.(status) === true;
        const keepEditDialogOpen = await notifySilentPipelineContext(status);
        if (keepEditDialogOpen) state.reloadAfterEditClose = true;
        else if (keepAssetReviewOpen) state.reloadAfterAssetReviewClose = true;
        else await loadData({ reload: true });
        if (state.silentPipelineContext) state.silentPipelineContext = null;
      }
      state.pipelineWasRunning = active;
      clearTimeout(state.pipelinePollTimer);
      state.pipelinePollTimer = active
        ? setTimeout(refreshPipelineStatus, 1000)
        : null;
    } catch (error) {
      elements.pipelineStatus.textContent = "Statusfehler";
      elements.pipelineStatusDetail.textContent = error.message;
      elements.pipelineStatusDetail.className = "pipeline-dialog-status failed";
      elements.pipelineRunNotice.hidden = false;
      elements.pipelineRunNotice.className = "pipeline-run-notice failed";
      elements.pipelineRunNoticeTitle.textContent = "Pipeline-Status nicht verfügbar";
      elements.pipelineRunNoticeDetail.textContent = error.message;
    }
  }

  async function refreshBackupStatus() {
    try {
      const status = await fetchJson("/api/backup/status");
      state.backupStatusSnapshot = status;
      const active = status.status === "running";
      if (active) {
        renderDatabaseStatus("backup");
        elements.pipelineStatus.textContent = "Backup läuft";
      } else {
        renderDatabaseStatus();
      }
      renderPersistentPipelineStatus(state.pipelineStatusSnapshot || { status: "idle" });

      if (dialog.open && (previewKind === "backup" || state.backupWasRunning)) {
        const presentation = backupStatusPresentation(status);
        if (presentation) {
          elements.pipelineDialogTitle.textContent = presentation.title;
          elements.pipelineDialogDescription.textContent = backupLabel();
          setDialogCloseMode(active);
          setMessage(presentation.message, presentation.messageType);
        }
        elements.pipelineStatusDetail.textContent = active
          ? `${Math.max(0, Math.min(100, Math.round(status.percent || 0)))}% · ${status.phase || "Backup läuft"}`
          : status.completedAt
            ? `${backupLabel()} · beendet ${formatDate(status.completedAt).replace(/^Report /, "")}`
            : "Kein Backup aktiv.";
        elements.pipelineStatusDetail.className = `pipeline-dialog-status${status.status !== "idle" ? ` ${status.status}` : ""}`;
        updateProcessLog(status.log);
      }

      state.backupWasRunning = active;
      clearTimeout(state.backupPollTimer);
      state.backupPollTimer = active
        ? setTimeout(refreshBackupStatus, 1000)
        : null;
    } catch (error) {
      elements.pipelineRunNotice.hidden = false;
      elements.pipelineRunNotice.className = "pipeline-run-notice failed";
      elements.pipelineRunNoticeTitle.textContent = "Backup-Status nicht verfügbar";
      elements.pipelineRunNoticeDetail.textContent = error.message;
    }
  }

  for (const button of elements.pipelineButtons) {
    button.addEventListener("click", () => openPreview(button.dataset.pipelineMode));
  }
  for (const button of elements.backupButtons) {
    button.addEventListener("click", openBackupPreview);
  }
  elements.pipelineMenuButton.addEventListener("click", () => {
    const pipelineActive = state.pipelineStatusSnapshot?.status === "running"
      || state.pipelineStatusSnapshot?.status === "awaiting-review";
    const backupActive = state.backupStatusSnapshot?.status === "running";
    if (pipelineActive) {
      showStatusDialog(state.pipelineStatusSnapshot);
      return;
    }
    if (backupActive) {
      showBackupStatusDialog(state.backupStatusSnapshot);
      return;
    }
    if (state.databaseNeedsUpdate) {
      void openPreview("transfer", { transfer: true });
      return;
    }
    if (!state.editMode) return;
    openChooser();
  });
  elements.pipelineRunNoticeOpen.addEventListener("click", () => {
    if (statusPresentation(state.pipelineStatusSnapshot || {})) showStatusDialog(state.pipelineStatusSnapshot);
    else if (backupStatusPresentation(state.backupStatusSnapshot || {})) showBackupStatusDialog(state.backupStatusSnapshot);
  });
  for (const button of cancelButtons) button.addEventListener("click", close);
  setupSafeBackdropClose(dialog, close);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (previewKind === "backup") {
      elements.pipelineStartButton.disabled = true;
      setMessage("NAS-Backup wird gestartet...", "info");
      try {
        const startedStatus = await fetchJson("/api/backup/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: backupForceStart }),
        });
        state.backupStatusSnapshot = startedStatus;
        state.backupWasRunning = true;
        elements.pipelineStartButton.hidden = true;
        elements.pipelinePreview.hidden = true;
        setDialogCloseMode(true);
        const presentation = backupStatusPresentation(startedStatus);
        elements.pipelineDialogTitle.textContent = presentation.title;
        elements.pipelineDialogDescription.textContent = backupLabel();
        setMessage(presentation.message, presentation.messageType);
        renderPersistentPipelineStatus(state.pipelineStatusSnapshot || { status: "idle" });
        await refreshBackupStatus();
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        elements.pipelineStartButton.disabled = false;
      }
      return;
    }
    await startCurrentPipelinePreview();
  });

  state.openPipelinePreview = openPreview;
  state.openBackupPreview = openBackupPreview;
  void refreshPipelineStatus();
  void refreshBackupStatus();
}

function setupNewSpeciesCreator() {
  const dialog = elements.newSpeciesDialog;
  const form = elements.newSpeciesForm;
  const openButton = elements.newSpeciesButton;
  const closeButtons = [...dialog.querySelectorAll(".new-species-cancel")];
  const steps = [...dialog.querySelectorAll("[data-new-species-step]")];
  const stepIndicators = [...dialog.querySelectorAll("[data-new-species-step-indicator]")];
  const preview = dialog.querySelector(".new-species-preview");
  const message = dialog.querySelector(".new-species-message");
  const previewButton = dialog.querySelector(".new-species-preview-button");
  const nextButton = dialog.querySelector(".new-species-next-button");
  const backButton = dialog.querySelector(".new-species-back-button");
  const saveButton = dialog.querySelector(".new-species-save-button");
  const jsonPreview = dialog.querySelector(".new-species-json");
  const derivedFields = [...dialog.querySelectorAll("[data-derived]")];
  const portraitInstructions = dialog.querySelector(".new-species-portrait-instructions");
  const portraitPromptButton = dialog.querySelector(".new-species-portrait-prompt-button");
  const portraitCopyButton = dialog.querySelector(".new-species-portrait-copy-button");
  const portraitPromptDetails = dialog.querySelector(".new-species-portrait-prompt-details");
  const portraitPrompt = dialog.querySelector(".new-species-portrait-prompt");
  const portraitFileInput = dialog.querySelector(".new-species-portrait-file-input");
  const portraitMessage = dialog.querySelector(".new-species-portrait-message");
  const portraitPreview = dialog.querySelector(".new-species-portrait-preview");
  const portraitPreviewImage = dialog.querySelector(".new-species-portrait-preview-image");
  const portraitPreviewMeta = dialog.querySelector(".new-species-portrait-preview-meta");
  const portraitPreviewButton = dialog.querySelector(".new-species-portrait-preview-button");
  const portraitSkipButton = dialog.querySelector(".new-species-portrait-skip-button");
  const finalPortraitState = dialog.querySelector(".new-species-final-portrait-state");
  const pipelineMessage = dialog.querySelector(".new-species-pipeline-message");
  const pipelineStepItems = [...dialog.querySelectorAll("[data-new-species-pipeline-step]")];
  const mapReview = dialog.querySelector(".new-species-map-review");
  const soundReview = dialog.querySelector(".new-species-sound-review");
  const finishMessage = dialog.querySelector(".new-species-finish-message");
  const doneSection = dialog.querySelector(".new-species-done");

  let currentStep = 1;
  let previewToken = "";
  let portraitPromptText = "";
  let portraitPreviewToken = "";
  let portraitSkipped = false;
  let busy = false;
  let pipelineBusy = false;
  let completed = false;
  let savedSpeciesId = "";
  let savedSpeciesName = "";
  let inlineRunId = "";
  let inlineReviewAssets = [];
  let inlineReviewChoices = new Map();
  let inlineManualMapPreviewToken = "";
  let inlineManualMapHandled = false;
  let inlinePipelinePollTimer = null;
  let maxStepReached = 1;

  const setMessage = (text = "", type = "") => {
    message.textContent = text;
    message.className = `edit-message new-species-message${type ? ` ${type}` : ""}`;
    message.hidden = !text;
  };

  const setPortraitMessage = (text = "", type = "") => {
    portraitMessage.textContent = text;
    portraitMessage.className = `edit-message new-species-portrait-message${type ? ` ${type}` : ""}`;
    portraitMessage.hidden = !text;
  };

  const setPipelineMessage = (text = "", type = "") => {
    pipelineMessage.textContent = text;
    pipelineMessage.className = `edit-message new-species-pipeline-message${type ? ` ${type}` : ""}`;
    pipelineMessage.hidden = !text;
  };

  const setFinishMessage = (text = "", type = "") => {
    finishMessage.textContent = text;
    finishMessage.className = `edit-message new-species-finish-message${type ? ` ${type}` : ""}`;
    finishMessage.hidden = !text;
  };

  const fieldLabel = (fieldKey) => form.querySelector(`[data-field="${fieldKey}"]`);

  const clearFieldErrors = () => {
    for (const label of form.querySelectorAll("[data-field]")) {
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
      const text = document.createElement("small");
      text.className = "field-error-text";
      text.textContent = Array.isArray(errors) ? errors.join(" · ") : String(errors);
      label.append(text);
    }
  };

  const updateMeasurementMode = (kind) => {
    const checked = form.elements[`${kind}Sexed`]?.checked === true;
    const sharedLabel = fieldLabel(kind);
    const sexedFields = form.querySelector(`[data-sexed-fields="${kind}"]`);
    if (sharedLabel) sharedLabel.hidden = checked;
    if (sexedFields) sexedFields.hidden = !checked;
  };

  const sizeUnits = ["mm", "cm", "m"];
  const weightUnits = ["kg", "g", "t"];
  const ageUnits = ["Tage", "Tag", "Monate", "Monat", "Jahre", "Jahr"];

  const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const stripMeasureInput = (value, units = []) => {
    let text = String(value ?? "").trim();
    text = text.replace(/^ca\.?\s*/i, "").trim();
    for (const unit of units) {
      text = text.replace(new RegExp(`\\s*${escapeRegExp(unit)}\\.?$`, "i"), "").trim();
    }
    return text;
  };

  const singularAgeUnit = (value, unit) => {
    const normalized = String(value ?? "").trim().replace(",", ".");
    if (!/^1(?:\.0+)?$/.test(normalized)) return unit;
    return { Tage: "Tag", Monate: "Monat", Jahre: "Jahr" }[unit] || unit;
  };

  const formatMeasureValue = (value, unit, { units = [], age = false } = {}) => {
    const cleaned = stripMeasureInput(value, units);
    if (!cleaned) return "";
    const finalUnit = age ? singularAgeUnit(cleaned, unit) : unit;
    return `ca. ${cleaned} ${finalUnit}`;
  };

  const composeSexedValue = (male, maleUnit, female, femaleUnit, options = {}) => {
    const maleValue = formatMeasureValue(male, maleUnit, options);
    const femaleValue = formatMeasureValue(female, femaleUnit, options);
    return `Männchen: ${maleValue}; Weibchen: ${femaleValue}`;
  };

  const speciesValues = () => {
    const formData = new FormData(form);
    const sizeSexed = formData.get("sizeSexed") === "on";
    const weightSexed = formData.get("weightSexed") === "on";
    return {
      german: formData.get("german"),
      scientificName: formData.get("scientificName"),
      size: sizeSexed
        ? composeSexedValue(
          formData.get("sizeMale"),
          formData.get("sizeMaleUnit"),
          formData.get("sizeFemale"),
          formData.get("sizeFemaleUnit"),
          { units: sizeUnits },
        )
        : formatMeasureValue(formData.get("size"), formData.get("sizeUnit"), { units: sizeUnits }),
      weight: weightSexed
        ? composeSexedValue(
          formData.get("weightMale"),
          formData.get("weightMaleUnit"),
          formData.get("weightFemale"),
          formData.get("weightFemaleUnit"),
          { units: weightUnits },
        )
        : formatMeasureValue(formData.get("weight"), formData.get("weightUnit"), { units: weightUnits }),
      lifeExpectancy: formatMeasureValue(formData.get("lifeExpectancy"), formData.get("lifeExpectancyUnit"), {
        units: ageUnits,
        age: true,
      }),
    };
  };

  const localFieldErrors = () => {
    const formData = new FormData(form);
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
      if (!stripMeasureInput(formData.get("sizeMale"), sizeUnits)) add("sizeMale", "Größe Männchen darf nicht leer sein");
      if (!stripMeasureInput(formData.get("sizeFemale"), sizeUnits)) add("sizeFemale", "Größe Weibchen darf nicht leer sein");
    } else if (!stripMeasureInput(formData.get("size"), sizeUnits)) {
      add("size", "Größe darf nicht leer sein");
    }
    if (formData.get("weightSexed") === "on") {
      if (!stripMeasureInput(formData.get("weightMale"), weightUnits)) add("weightMale", "Gewicht Männchen darf nicht leer sein");
      if (!stripMeasureInput(formData.get("weightFemale"), weightUnits)) add("weightFemale", "Gewicht Weibchen darf nicht leer sein");
    } else if (!stripMeasureInput(formData.get("weight"), weightUnits)) {
      add("weight", "Gewicht darf nicht leer sein");
    }
    if (!stripMeasureInput(formData.get("lifeExpectancy"), ageUnits)) {
      add("lifeExpectancy", "Lebenserwartung darf nicht leer sein");
    }
    return errors;
  };

  const markSpeciesInputsChanged = () => {
    previewToken = "";
    maxStepReached = 1;
    preview.hidden = true;
    resetPortraitPrompt();
    resetPortraitPreview();
    if (currentStep !== 1) showStep(1);
    setMessage("Eingaben geändert. Bitte erneut prüfen.", "info");
    updateButtons();
  };

  const canAdvanceFromPortrait = () => portraitSkipped || Boolean(portraitPreviewToken);

  const updateFinalPortraitState = () => {
    if (!finalPortraitState) return;
    finalPortraitState.hidden = currentStep >= 3;
    if (finalPortraitState.hidden) return;
    finalPortraitState.textContent = portraitPreviewToken
      ? "Geprüftes Artportrait wird beim Abschluss lokal übernommen."
      : "Artportrait wird übersprungen.";
  };

  const stopInlinePipelinePolling = () => {
    clearTimeout(inlinePipelinePollTimer);
    inlinePipelinePollTimer = null;
  };

  const setPipelineStepState = (activeKey = "", doneKeys = []) => {
    const doneSet = new Set(doneKeys);
    for (const item of pipelineStepItems) {
      const key = item.dataset.newSpeciesPipelineStep;
      item.classList.toggle("active", key === activeKey);
      item.classList.toggle("done", doneSet.has(key));
    }
  };

  const newSpeciesData = () => state.species.find((entry) => entry.id === savedSpeciesId) ?? null;

  const continueAfterMapDecision = () => {
    const soundAsset = inlineReviewAssets.find((entry) => entry.type === "sound");
    if (soundAsset) {
      showStep(4);
      renderInlineSoundReview(soundAsset);
      setFinishMessage("Bitte Sound anhören und entscheiden.", "info");
      return;
    }
    if (inlineReviewAssets.length) void submitInlineAssetReview();
    else void finishNewSpeciesWorkflow({ status: "completed", gitPublished: false });
  };

  const renderInlineSoundPlayback = (container) => {
    const audio = container.querySelector("audio");
    const marker = container.querySelector(".asset-review-progress-marker");
    const spectrogram = container.querySelector(".new-species-review-spectrogram");
    if (!audio || !marker || !spectrogram) return;
    const updateMarker = () => {
      const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      marker.style.left = `${Math.min(1, Math.max(0, progress)) * 100}%`;
    };
    audio.addEventListener("timeupdate", updateMarker);
    audio.addEventListener("loadedmetadata", updateMarker);
    audio.addEventListener("seeked", updateMarker);
    spectrogram.addEventListener("click", (event) => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const rect = spectrogram.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.currentTime = progress * audio.duration;
      marker.style.left = `${progress * 100}%`;
      audio.play().catch(() => {});
    });
  };

  const cacheBustedUrl = (url, key) => {
    if (!url) return "";
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}inline=${encodeURIComponent(key)}`;
  };

  const stopInlineReviewAudio = () => {
    for (const audio of soundReview.querySelectorAll("audio")) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
    }
  };

  const setInlineMapMessage = (text = "", type = "") => {
    const mapMessage = mapReview.querySelector(".new-species-map-message");
    if (!mapMessage) return;
    mapMessage.textContent = text;
    mapMessage.className = `edit-message new-species-map-message${type ? ` ${type}` : ""}`;
    mapMessage.hidden = !text;
  };

  const renderInlineMapReview = (asset) => {
    mapReview.hidden = false;
    mapReview.innerHTML = `
      <h5>Karte prüfen</h5>
      <p>${escapeHtml(asset.germanName)} · ${escapeHtml(asset.scientificName)}</p>
      <div class="new-species-review-media">
        <button
          class="new-species-map-zoom-trigger"
          type="button"
          data-new-species-map-zoom
          data-map-url="${escapeHtml(asset.url)}"
          data-map-alt="${escapeHtml(`Neue Karte ${asset.germanName}`)}"
          aria-label="Neue Karte ${escapeHtml(asset.germanName)} vergrößern"
        >
          <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(`Neue Karte ${asset.germanName}`)}">
          <span class="asset-review-zoom-hint">Vergrößern</span>
        </button>
      </div>
      <div class="new-species-review-actions">
        <button type="button" data-new-species-map-decision="reject">Überspringen / später manuell einfügen</button>
        <button type="button" data-new-species-map-action="manual">Manuell per URL einfügen</button>
        <button class="primary" type="button" data-new-species-map-decision="automatic">Karte übernehmen</button>
      </div>
    `;
  };

  const renderInlineManualMapReview = (messageText = "Keine automatisch speicherbare Karte gefunden.") => {
    inlineManualMapPreviewToken = "";
    const species = newSpeciesData();
    const browserMapUrl = iucnDistributionMapUrl(species);
    mapReview.hidden = false;
    mapReview.innerHTML = `
      <h5>Karte manuell einfügen</h5>
      <p>${escapeHtml(messageText)} Du kannst den sichtbaren Backblaze-JPEG-Link aus dem Browser hier einfügen.</p>
      <div class="new-species-manual-map">
        ${browserMapUrl ? `
          <a
            class="map-browser-link"
            href="${escapeHtml(browserMapUrl)}"
            target="_blank"
            rel="noopener noreferrer"
          >IUCN-Karte im Browser öffnen</a>
        ` : ""}
        <label>
          Quellen-URL
          <input class="new-species-map-source-input" type="url" placeholder="https://...jpg">
        </label>
        <label>
          Pflegegrund
          <textarea class="new-species-map-reason-input">Manuell aus dem IUCN-Kartenlink übernommen, weil der lokale automatische Abruf keinen direkt speicherbaren Kartenlink erhalten hat.</textarea>
        </label>
        <p class="edit-message new-species-map-message" hidden></p>
        <section class="new-species-manual-map-preview" hidden>
          <div class="new-species-review-media">
            <button
              class="new-species-map-zoom-trigger"
              type="button"
              data-new-species-map-zoom
              data-map-url=""
              data-map-alt="${escapeHtml(`Neue Karte ${savedSpeciesName || "Neue Art"}`)}"
              aria-label="Neue Karte vergrößern"
            >
              <img alt="${escapeHtml(`Neue Karte ${savedSpeciesName || "Neue Art"}`)}">
              <span class="asset-review-zoom-hint">Vergrößern</span>
            </button>
          </div>
          <p class="new-species-map-preview-meta"></p>
        </section>
      </div>
      <div class="new-species-review-actions">
        <button type="button" data-new-species-map-action="skip">Karte überspringen</button>
        <button type="button" data-new-species-map-action="preview">Karte prüfen</button>
        <button class="primary" type="button" data-new-species-map-action="save" disabled>Manuelle Karte übernehmen</button>
      </div>
    `;
    setInlineMapMessage("Bitte Quellen-URL einfügen und „Karte prüfen“ wählen.", "info");
  };

  const previewInlineManualMap = async () => {
    inlineManualMapPreviewToken = "";
    const sourceInput = mapReview.querySelector(".new-species-map-source-input");
    const reasonInput = mapReview.querySelector(".new-species-map-reason-input");
    const previewSection = mapReview.querySelector(".new-species-manual-map-preview");
    const previewImage = previewSection?.querySelector("img");
    const previewTrigger = previewSection?.querySelector("[data-new-species-map-zoom]");
    const previewMeta = mapReview.querySelector(".new-species-map-preview-meta");
    const saveMapButton = mapReview.querySelector('[data-new-species-map-action="save"]');
    if (!sourceInput || !reasonInput || !previewSection || !previewImage || !previewMeta || !saveMapButton) return;
    const source = sourceInput.value.trim();
    if (!source) {
      setInlineMapMessage("Bitte zuerst den direkten Karten-JPEG-Link einfügen.", "error");
      return;
    }
    setPipelineBusy(true);
    setInlineMapMessage("Kartenlink wird geprüft…", "info");
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/map/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalName: "",
            imageBase64: "",
            reason: reasonInput.value,
            source,
            pipelineRunId: inlineRunId,
          }),
        },
      );
      inlineManualMapPreviewToken = result.token;
      previewImage.src = result.newMap.url;
      if (previewTrigger) previewTrigger.dataset.mapUrl = result.newMap.url;
      if (typeof previewImage.decode === "function") await previewImage.decode();
      previewMeta.textContent = `${result.newMap.dimensions.width} × ${result.newMap.dimensions.height} px · ${formatBytes(result.newMap.bytes)}`;
      previewSection.hidden = false;
      saveMapButton.disabled = false;
      setInlineMapMessage("Karte geprüft. Bitte vollständige Darstellung kontrollieren und dann übernehmen oder überspringen.", "success");
    } catch (error) {
      previewSection.hidden = true;
      saveMapButton.disabled = true;
      setInlineMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setPipelineBusy(false);
    }
  };

  const saveInlineManualMap = async () => {
    if (!inlineManualMapPreviewToken) {
      setInlineMapMessage("Bitte zuerst die Karte prüfen.", "error");
      return;
    }
    setPipelineBusy(true);
    setInlineMapMessage("Manuelle Karte wird übernommen…", "info");
    try {
      await fetchJson(
        `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/map/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: inlineManualMapPreviewToken,
            pipelineRunId: inlineRunId,
          }),
        },
      );
      const mapAsset = inlineReviewAssets.find((entry) => entry.type === "map");
      if (mapAsset) inlineReviewChoices.set(`${mapAsset.safeName}:map`, "manual");
      inlineManualMapHandled = true;
      inlineManualMapPreviewToken = "";
      await loadData({ reload: true });
      mapReview.hidden = true;
      mapReview.innerHTML = "";
      continueAfterMapDecision();
    } catch (error) {
      setInlineMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setPipelineBusy(false);
    }
  };

  const renderInlineSoundReview = (asset) => {
    stopInlineReviewAudio();
    const reviewKey = `${inlineRunId || "inline"}-${asset.safeName || "sound"}-${Date.now()}`;
    const audioUrl = cacheBustedUrl(asset.url, reviewKey);
    const spectrogramUrl = cacheBustedUrl(asset.spectrogramUrl, reviewKey);
    const licenseInfo = soundLicenseInfo({ isNc: asset.isNc, license: asset.license });
    const sourceLabel = asset.sourceLabel ? ` · ${asset.sourceLabel}` : "";
    soundReview.hidden = false;
    soundReview.innerHTML = `
      <h5 class="new-species-review-title">
        <span>Sound prüfen</span>
        ${soundLicenseBadgeHtml(licenseInfo)}
      </h5>
      <p>${escapeHtml(asset.germanName)} · ${escapeHtml(asset.scientificName)}${escapeHtml(sourceLabel)}</p>
      ${spectrogramUrl ? `
        <button class="new-species-review-spectrogram" type="button">
          <img src="${escapeHtml(spectrogramUrl)}" alt="${escapeHtml(`Spektrogramm ${asset.germanName}`)}">
          <span class="asset-review-progress-marker"></span>
        </button>
      ` : `<p>Spektrogramm ist für diese Vorschau noch nicht vorhanden.</p>`}
      <audio controls preload="metadata" src="${escapeHtml(audioUrl)}"></audio>
      <div class="new-species-review-actions">
        <button type="button" data-new-species-sound-decision="manual">Überspringen / später manuell einfügen</button>
        <button class="danger" type="button" data-new-species-sound-decision="reject">Gefundenen Sound ablehnen und weiter suchen</button>
        <button class="primary" type="button" data-new-species-sound-decision="automatic">Sound übernehmen</button>
      </div>
    `;
    renderInlineSoundPlayback(soundReview);
  };

  const updateButtons = () => {
    previewButton.hidden = currentStep !== 1;
    backButton.hidden = currentStep === 1 || currentStep >= 3 || completed;
    nextButton.hidden = currentStep >= 3 || completed;
    saveButton.hidden = !completed;
    previewButton.disabled = busy || pipelineBusy;
    backButton.disabled = busy || pipelineBusy;
    nextButton.disabled = busy || pipelineBusy || (currentStep === 1 ? !previewToken : !canAdvanceFromPortrait());
    saveButton.disabled = busy || pipelineBusy;
    portraitPromptButton.disabled = busy || pipelineBusy || !previewToken;
    portraitCopyButton.disabled = busy || pipelineBusy || !portraitPromptText;
    portraitPreviewButton.disabled = busy || pipelineBusy || !previewToken;
    portraitSkipButton.disabled = busy || pipelineBusy || !previewToken;
    openButton.disabled = busy || pipelineBusy;
    for (const button of closeButtons) button.disabled = busy || pipelineBusy || state.newSpeciesPipelineActive;
  };

  const showStep = (step) => {
    currentStep = step;
    maxStepReached = Math.max(maxStepReached, step);
    for (const section of steps) {
      const active = Number(section.dataset.newSpeciesStep) === step;
      section.hidden = !active;
      section.classList.toggle("active", active);
    }
    for (const indicator of stepIndicators) {
      const indicatorStep = Number(indicator.dataset.newSpeciesStepIndicator);
      const active = indicatorStep === step;
      indicator.classList.toggle("active", active);
      indicator.classList.toggle("done", indicatorStep < step);
      indicator.classList.toggle("reachable", indicatorStep <= maxStepReached && !active);
    }
    updateFinalPortraitState();
    updateButtons();
  };

  const resetPortraitPrompt = () => {
    portraitPromptText = "";
    portraitPrompt.textContent = "";
    portraitPromptDetails.hidden = true;
    portraitCopyButton.disabled = true;
  };

  const resetPortraitPreview = () => {
    portraitPreviewToken = "";
    portraitSkipped = false;
    portraitPreview.hidden = true;
    portraitPreviewImage.removeAttribute("src");
    portraitPreviewMeta.textContent = "";
    updateFinalPortraitState();
    updateButtons();
  };

  const resetAll = () => {
    stopInlinePipelinePolling();
    previewToken = "";
    portraitPromptText = "";
    portraitPreviewToken = "";
    portraitSkipped = false;
    busy = false;
    pipelineBusy = false;
    completed = false;
    savedSpeciesId = "";
    savedSpeciesName = "";
    inlineRunId = "";
    inlineReviewAssets = [];
    inlineReviewChoices = new Map();
    inlineManualMapPreviewToken = "";
    inlineManualMapHandled = false;
    state.holdNewSpeciesBackground = false;
    state.newSpeciesPipelineActive = false;
    maxStepReached = 1;
    preview.hidden = true;
    jsonPreview.textContent = "";
    for (const field of derivedFields) field.textContent = "";
    mapReview.hidden = true;
    mapReview.innerHTML = "";
    stopInlineReviewAudio();
    soundReview.hidden = true;
    soundReview.innerHTML = "";
    doneSection.hidden = true;
    setPipelineStepState();
    resetPortraitPrompt();
    resetPortraitPreview();
    setMessage("Bitte Eingaben ausfüllen und auf „Eingaben prüfen“ klicken.", "info");
    setPortraitMessage();
    setPipelineMessage();
    setFinishMessage();
    clearFieldErrors();
    updateMeasurementMode("size");
    updateMeasurementMode("weight");
    showStep(1);
  };

  const setBusy = (value) => {
    busy = value;
    updateButtons();
  };

  const setPipelineBusy = (value) => {
    pipelineBusy = value;
    updateButtons();
  };

  const finishNewSpeciesWorkflow = async (status) => {
    stopInlinePipelinePolling();
    setPipelineBusy(false);
    state.holdNewSpeciesBackground = false;
    state.newSpeciesPipelineActive = false;
    state.pipelineWasRunning = false;
    if (status?.status === "completed" && status.gitPublished) state.notice = "";
    await loadData({ reload: true });
    completed = true;
    setPipelineStepState("", ["save", "data", "sound", "spectrogram"]);
    setPipelineMessage();
    setFinishMessage(`✓ Neue Art: ${savedSpeciesName || "Neue Art"} ist erfolgreich angelegt.`, "success");
    doneSection.hidden = false;
    showStep(4);
  };

  const submitInlineAssetReview = async () => {
    const choices = inlineReviewAssets.map((asset) => {
      const decision = inlineReviewChoices.get(`${asset.safeName}:${asset.type}`);
      return {
        safeName: asset.safeName,
        type: asset.type,
        decision,
        manual: decision === "manual",
      };
    });
    if (choices.some((choice) => !choice.decision)) {
      setFinishMessage("Bitte zuerst Karte und Sound bewerten.", "error");
      return;
    }
    setPipelineBusy(true);
    const rejectedSound = choices.some((choice) => choice.type === "sound" && choice.decision === "reject");
    setPipelineMessage(
      rejectedSound
        ? "Sound wurde abgelehnt. Neuer Sound wird gesucht …"
        : `Neue Art: ${savedSpeciesName || "Neue Art"} wird angelegt …`,
      "info",
    );
    setFinishMessage(
      rejectedSound
        ? "Neuer Sound wird gesucht …"
        : `Neue Art: ${savedSpeciesName || "Neue Art"} wird angelegt …`,
      "info",
    );
    try {
      await fetchJson("/api/pipeline/assets/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: inlineRunId, choices }),
      });
      inlineReviewAssets = [];
      inlineReviewChoices = new Map();
      mapReview.hidden = true;
      mapReview.innerHTML = "";
      stopInlineReviewAudio();
      soundReview.hidden = true;
      soundReview.innerHTML = "";
      void pollInlinePipelineStatus();
    } catch (error) {
      setPipelineBusy(false);
      state.newSpeciesPipelineActive = false;
      setFinishMessage([error.message, ...(error.details || [])].join(" · "), "error");
    }
  };

  const handleInlineReviewStatus = async (status) => {
    setPipelineBusy(false);
    inlineRunId = status.runId;
    await loadData({ reload: true });
    if (inlineReviewAssets !== status.reviewAssets) {
      inlineReviewAssets = status.reviewAssets || [];
      inlineReviewChoices = new Map();
    }
    const mapAsset = inlineReviewAssets.find((asset) => asset.type === "map");
    const soundAsset = inlineReviewAssets.find((asset) => asset.type === "sound");
    setPipelineStepState("", ["save", "data", "sound", "spectrogram"]);
    setPipelineMessage("Suchlauf abgeschlossen. Bitte die gefundenen Assets prüfen.", "success");
    if (mapAsset && !inlineReviewChoices.has(`${mapAsset.safeName}:map`)) {
      showStep(3);
      renderInlineMapReview(mapAsset);
      return;
    }
    if (!mapAsset && !inlineManualMapHandled) {
      showStep(3);
      renderInlineManualMapReview("Es wurde keine automatisch speicherbare Karte gefunden.");
      return;
    }
    mapReview.hidden = true;
    if (soundAsset && !inlineReviewChoices.has(`${soundAsset.safeName}:sound`)) {
      showStep(4);
      renderInlineSoundReview(soundAsset);
      setFinishMessage("Bitte Sound anhören und entscheiden.", "info");
      return;
    }
    void submitInlineAssetReview();
  };

  async function pollInlinePipelineStatus() {
    stopInlinePipelinePolling();
    try {
      const status = await fetchJson("/api/pipeline/status");
      state.pipelineStatusSnapshot = status;
      state.renderPersistentPipelineStatus?.(status);
    if (status.status === "running") {
      setPipelineBusy(true);
      const phase = status.phase || "Suchlauf läuft";
      setPipelineMessage(`${phase} · bitte warten.`, "info");
      if (/Weitere Soundquelle|Sound/i.test(phase)) setFinishMessage("Neuer Sound wird gesucht …", "info");
      if (/Spektrogramm/i.test(phase)) setPipelineStepState("spectrogram", ["save", "data", "sound"]);
        else if (/Sound|Datenpipeline/i.test(phase)) setPipelineStepState("sound", ["save", "data"]);
        else setPipelineStepState("data", ["save"]);
        inlinePipelinePollTimer = setTimeout(pollInlinePipelineStatus, 1000);
        return;
      }
      if (status.status === "awaiting-review") {
        await handleInlineReviewStatus(status);
        return;
      }
      if (status.status === "completed") {
        await loadData({ reload: true });
        const createdSpecies = newSpeciesData();
        if (createdSpecies && !createdSpecies.assets?.map?.exists && !inlineManualMapHandled) {
          setPipelineBusy(false);
          state.newSpeciesPipelineActive = false;
          state.pipelineWasRunning = false;
          setPipelineStepState("", ["save", "data", "sound", "spectrogram"]);
          setPipelineMessage("Suchlauf abgeschlossen. Es wurde keine automatisch speicherbare Karte gefunden.", "info");
          showStep(3);
          renderInlineManualMapReview("Es wurde keine automatisch speicherbare Karte gefunden.");
          return;
        }
        await finishNewSpeciesWorkflow(status);
        return;
      }
      if (status.status === "failed") {
        setPipelineBusy(false);
        state.newSpeciesPipelineActive = false;
        setPipelineMessage(status.error || "Suchlauf ist fehlgeschlagen.", "error");
        return;
      }
      inlinePipelinePollTimer = setTimeout(pollInlinePipelineStatus, 1000);
    } catch (error) {
      setPipelineBusy(false);
      state.newSpeciesPipelineActive = false;
      setPipelineMessage(error.message, "error");
    }
  }

  const saveAndStartPipeline = async () => {
    if (!previewToken || pipelineBusy) return;
    showStep(3);
    state.newSpeciesPipelineActive = true;
    setPipelineBusy(true);
    setPipelineStepState("save");
    setPipelineMessage(`Neue Art: ${speciesValues().german || "Neue Art"} wird angelegt …`, "info");
    try {
      const result = await fetchJson("/api/species/new/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: previewToken }),
      });
      savedSpeciesId = result.species?.id || result.derived.slug;
      savedSpeciesName = result.entry.german;
      state.selectedId = savedSpeciesId;
      elements.search.value = "";
      elements.statusFilter.value = "";
      elements.flagFilter.value = "";

      if (portraitPreviewToken) {
        setPipelineMessage("Artportrait wird lokal übernommen…", "info");
        try {
          await fetchJson(
            `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/portrait/save`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: portraitPreviewToken, publish: false }),
            },
          );
        } catch (portraitError) {
          setPipelineMessage(
            `Art wurde angelegt, aber das Portrait konnte nicht übernommen werden: ${portraitError.message}`,
            "error",
          );
        }
      }

      setPipelineStepState("data", ["save"]);
      setPipelineMessage("Suchlauf für Karte, Sound und Spektrogramm startet…", "info");
      await loadData({ reload: true });
      const previewResult = await fetchJson("/api/pipeline/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "missing", targetSlugs: [savedSpeciesId] }),
      });
      if (!previewResult.tokensAvailable) {
        throw new Error("Die benötigten API-Tokens fehlen in der Server-Umgebung.");
      }
      if (!previewResult.hasWork) {
        await finishNewSpeciesWorkflow({ status: "completed", gitPublished: false });
        return;
      }
      const startedStatus = await fetchJson("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: previewResult.token }),
      });
      state.pipelineStatusSnapshot = startedStatus;
      state.pipelineWasRunning = true;
      setPipelineStepState("data", ["save"]);
      setPipelineMessage("Suchlauf läuft. Karte, Sound und Spektrogramm werden vorbereitet…", "info");
      void pollInlinePipelineStatus();
    } catch (error) {
      setPipelineBusy(false);
      state.newSpeciesPipelineActive = false;
      setPipelineMessage([error.message, ...(error.details || [])].join(" · "), "error");
    }
  };

  const close = () => {
    if (busy || pipelineBusy || state.newSpeciesPipelineActive) return;
    form.reset();
    state.holdNewSpeciesBackground = false;
    resetAll();
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  openButton.addEventListener("click", () => {
    form.reset();
    resetAll();
    state.holdNewSpeciesBackground = true;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    form.elements.german.focus();
  });

  for (const button of closeButtons) button.addEventListener("click", close);
  setupSafeBackdropClose(dialog, close);

  form.elements.sizeSexed?.addEventListener("change", () => {
    updateMeasurementMode("size");
    markSpeciesInputsChanged();
  });
  form.elements.weightSexed?.addEventListener("change", () => {
    updateMeasurementMode("weight");
    markSpeciesInputsChanged();
  });

  form.addEventListener("change", (event) => {
    if (event.target.closest(".new-species-map-review") || event.target.closest(".new-species-sound-review")) return;
    if (!event.target.matches(".new-species-value-unit select")) return;
    markSpeciesInputsChanged();
  });

  form.addEventListener("input", (event) => {
    if (event.target.closest(".new-species-map-review")) {
      inlineManualMapPreviewToken = "";
      const saveMapButton = mapReview.querySelector('[data-new-species-map-action="save"]');
      const previewSection = mapReview.querySelector(".new-species-manual-map-preview");
      if (saveMapButton) saveMapButton.disabled = true;
      if (previewSection) previewSection.hidden = true;
      setInlineMapMessage("Kartenangaben geändert. Bitte erneut „Karte prüfen“ wählen.", "info");
      return;
    }
    if (event.target.closest(".new-species-sound-review")) return;
    if (event.target.closest(".new-species-portrait")) {
      if (event.target === portraitInstructions) resetPortraitPrompt();
      resetPortraitPreview();
      setPortraitMessage("Portraitangaben geändert. Bitte Bildprüfung bei Bedarf erneut ausführen.", "info");
      return;
    }
    markSpeciesInputsChanged();
  });

  portraitFileInput.addEventListener("change", () => {
    resetPortraitPreview();
    if (portraitFileInput.files?.[0]) {
      setPortraitMessage("Bild ausgewählt. Bitte mit „Bild prüfen“ validieren.", "info");
    } else {
      setPortraitMessage();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentStep !== 1) return;
    const localErrors = localFieldErrors();
    if (Object.keys(localErrors).length) {
      applyFieldErrors(localErrors);
      setMessage(Object.values(localErrors).flat().join(" · "), "error");
      return;
    }
    clearFieldErrors();
    resetPortraitPrompt();
    resetPortraitPreview();
    setBusy(true);
    setMessage("Neue Art und mögliche Kollisionen werden geprüft…", "info");
    try {
      const result = await fetchJson("/api/species/new/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: speciesValues() }),
      });
      previewToken = result.token;
      maxStepReached = Math.max(maxStepReached, 2);
      for (const field of derivedFields) {
        field.textContent = result.derived[field.dataset.derived] ?? "";
      }
      jsonPreview.textContent = JSON.stringify(result.entry, null, 2);
      preview.hidden = false;
      setMessage("Eingaben sind geprüft. Der nächste Schritt ist jetzt verfügbar.", "success");
      showStep(1);
    } catch (error) {
      applyFieldErrors(error.fieldErrors || {});
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setBusy(false);
    }
  });

  nextButton.addEventListener("click", () => {
    if (currentStep === 1 && previewToken) showStep(2);
    else if (currentStep === 2 && canAdvanceFromPortrait()) void saveAndStartPipeline();
  });

  backButton.addEventListener("click", () => {
    if (currentStep > 1) showStep(currentStep - 1);
  });

  for (const indicator of stepIndicators) {
    indicator.addEventListener("click", () => {
      const targetStep = Number(indicator.dataset.newSpeciesStepIndicator);
      if (!targetStep || targetStep > maxStepReached || busy || pipelineBusy) return;
      showStep(targetStep);
    });
  }

  portraitPromptButton.addEventListener("click", async () => {
    if (!previewToken) return;
    resetPortraitPrompt();
    resetPortraitPreview();
    setBusy(true);
    setPortraitMessage("Portrait-Prompt wird aus den geprüften Artdaten erstellt…", "info");
    try {
      const result = await fetchJson("/api/species/new/portrait-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: speciesValues(),
          additionalInstructions: portraitInstructions.value || "",
        }),
      });
      portraitPromptText = result.prompt;
      portraitPrompt.textContent = result.prompt;
      portraitPromptDetails.hidden = false;
      portraitCopyButton.disabled = false;
      setPortraitMessage(
        `Prompt erstellt. In ChatGPT genau ein Bild erzeugen und anschließend als ${result.fileName} auswählen.`,
        "success",
      );
    } catch (error) {
      applyFieldErrors(error.fieldErrors || {});
      setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setBusy(false);
    }
  });

  portraitCopyButton.addEventListener("click", async () => {
    if (!portraitPromptText) return;
    try {
      await navigator.clipboard.writeText(portraitPromptText);
      setPortraitMessage("Prompt wurde in die Zwischenablage kopiert.", "success");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(portraitPrompt);
      selection.removeAllRanges();
      selection.addRange(range);
      setPortraitMessage(
        "Automatisches Kopieren war nicht möglich. Der Prompt wurde markiert; bitte Strg+C drücken.",
        "info",
      );
    }
  });

  portraitPreviewButton.addEventListener("click", async () => {
    if (!previewToken) return;
    resetPortraitPreview();
    const file = portraitFileInput.files?.[0];
    if (!file) {
      setPortraitMessage("Bitte ein in ChatGPT erzeugtes PNG-, JPEG- oder WebP-Bild auswählen.", "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPortraitMessage("Bilddatei darf maximal 20 MB groß sein.", "error");
      return;
    }
    setBusy(true);
    setPortraitMessage("Bilddatei wird geprüft und in das Produktformat umgewandelt…", "info");
    try {
      const imageBase64 = await fileToBase64(file);
      const result = await fetchJson("/api/species/new/portrait-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: previewToken,
          originalName: file.name,
          imageBase64,
          additionalInstructions: portraitInstructions.value || "",
        }),
      });
      portraitPreviewToken = result.token;
      portraitSkipped = false;
      portraitPreviewImage.src = result.newPortrait.url;
      if (typeof portraitPreviewImage.decode === "function") await portraitPreviewImage.decode();
      portraitPreviewMeta.textContent =
        `${result.newPortrait.size} · ${formatBytes(result.newPortrait.bytes)}`
        + ` · Quelle ${result.newPortrait.originalDimensions.width} × ${result.newPortrait.originalDimensions.height} px`;
      portraitPromptText = result.newPortrait.prompt;
      portraitPrompt.textContent = result.newPortrait.prompt;
      portraitPromptDetails.hidden = false;
      portraitCopyButton.disabled = false;
      portraitPreview.hidden = false;
      setPortraitMessage(
        "Vorschau erstellt. Bitte Artmerkmale, Anatomie und vollständige Bildränder prüfen.",
        "success",
      );
    } catch (error) {
      resetPortraitPreview();
      setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setBusy(false);
    }
  });

  portraitSkipButton.addEventListener("click", () => {
    resetPortraitPreview();
    portraitSkipped = true;
    setPortraitMessage(
      "Artportrait wird für diese neue Art übersprungen. Mit „Nächster Schritt“ wird die Art angelegt.",
      "info",
    );
    updateFinalPortraitState();
    updateButtons();
  });

  mapReview.addEventListener("click", (event) => {
    const zoomButton = event.target.closest("[data-new-species-map-zoom]");
    if (zoomButton) {
      openSharedMapLightbox(
        zoomButton.dataset.mapUrl,
        zoomButton.dataset.mapAlt || "Neue Karte",
      );
      return;
    }
    const actionButton = event.target.closest("[data-new-species-map-action]");
    if (actionButton) {
      const action = actionButton.dataset.newSpeciesMapAction;
      if (action === "manual") {
        renderInlineManualMapReview("Automatische Karte wird nicht übernommen.");
      } else if (action === "preview") {
        void previewInlineManualMap();
      } else if (action === "save") {
        void saveInlineManualMap();
      } else if (action === "skip") {
        const mapAsset = inlineReviewAssets.find((entry) => entry.type === "map");
        if (mapAsset) inlineReviewChoices.set(`${mapAsset.safeName}:map`, "reject");
        inlineManualMapHandled = true;
        inlineManualMapPreviewToken = "";
        mapReview.hidden = true;
        mapReview.innerHTML = "";
        continueAfterMapDecision();
      }
      return;
    }
    const button = event.target.closest("[data-new-species-map-decision]");
    if (!button) return;
    const asset = inlineReviewAssets.find((entry) => entry.type === "map");
    if (!asset) return;
    inlineReviewChoices.set(`${asset.safeName}:map`, button.dataset.newSpeciesMapDecision);
    inlineManualMapHandled = true;
    mapReview.hidden = true;
    continueAfterMapDecision();
  });

  soundReview.addEventListener("click", (event) => {
    const button = event.target.closest("[data-new-species-sound-decision]");
    if (!button) return;
    const asset = inlineReviewAssets.find((entry) => entry.type === "sound");
    if (!asset) return;
    inlineReviewChoices.set(`${asset.safeName}:sound`, button.dataset.newSpeciesSoundDecision);
    stopInlineReviewAudio();
    void submitInlineAssetReview();
  });

  saveButton.addEventListener("click", () => {
    form.reset();
    resetAll();
    close();
  });
}

function setupSpeciesEditor(species) {
  const dialog = elements.detailPanel.querySelector(".edit-dialog");
  const openButtons = [...elements.detailPanel.querySelectorAll(".edit-species-open")];
  const closeButtons = [...elements.detailPanel.querySelectorAll(".edit-cancel")];
  const form = elements.detailPanel.querySelector(".edit-form");
  const preview = elements.detailPanel.querySelector(".edit-preview");
  const previewRows = elements.detailPanel.querySelector(".edit-preview-rows");
  const message = elements.detailPanel.querySelector(".edit-message");
  const previewButton = elements.detailPanel.querySelector(".edit-preview-button");
  const saveButton = elements.detailPanel.querySelector(".edit-save-button");
  const scientificNameInput = elements.detailPanel.querySelector(".scientific-name-input");
  const scientificNameUnlockButton = elements.detailPanel.querySelector(".scientific-name-unlock");
  const scientificNameWarning = elements.detailPanel.querySelector(".scientific-name-warning");
  const mapFileInput = elements.detailPanel.querySelector(".map-file-input");
  const mapReasonInput = elements.detailPanel.querySelector(".map-reason-input");
  const mapSourceInput = elements.detailPanel.querySelector(".map-source-input");
  const mapMessage = elements.detailPanel.querySelector(".map-edit-message");
  const mapPreview = elements.detailPanel.querySelector(".map-edit-preview");
  const mapCurrentImage = elements.detailPanel.querySelector(".map-preview-current");
  const mapNewImage = elements.detailPanel.querySelector(".map-preview-new");
  const mapCurrentMeta = elements.detailPanel.querySelector(".map-current-meta");
  const mapNewMeta = elements.detailPanel.querySelector(".map-new-meta");
  const mapPreviewButton = elements.detailPanel.querySelector(".map-preview-button");
  const mapSaveButton = elements.detailPanel.querySelector(".map-save-button");
  const mapAutoSearchButton = elements.detailPanel.querySelector(".map-auto-search-button");
  const mapBrowserLink = elements.detailPanel.querySelector(".map-browser-link");
  const mapDeleteButton = elements.detailPanel.querySelector(".map-delete-button");
  const mapRestoreButton = elements.detailPanel.querySelector(".map-restore-button");
  const soundFileInput = elements.detailPanel.querySelector(".sound-file-input");
  const soundReasonInput = elements.detailPanel.querySelector(".sound-reason-input");
  const soundMessage = elements.detailPanel.querySelector(".sound-edit-message");
  const soundPreview = elements.detailPanel.querySelector(".sound-edit-preview");
  const currentSoundAudio = elements.detailPanel.querySelector(".current-sound-audio");
  const soundCurrentAudio = elements.detailPanel.querySelector(".sound-preview-current");
  const soundNewAudio = elements.detailPanel.querySelector(".sound-preview-new");
  const soundCurrentMeta = elements.detailPanel.querySelector(".sound-current-meta");
  const soundNewMeta = elements.detailPanel.querySelector(".sound-new-meta");
  const soundCreditsPreview = elements.detailPanel.querySelector(".sound-credits-preview");
  const soundLicenseState = elements.detailPanel.querySelector(".sound-license-state");
  const soundPreviewButton = elements.detailPanel.querySelector(".sound-preview-button");
  const soundSaveButton = elements.detailPanel.querySelector(".sound-save-button");
  const soundRejectCurrentButton = elements.detailPanel.querySelector(".sound-reject-current-button");
  const soundAutoSearchButton = elements.detailPanel.querySelector(".sound-auto-search-button");
  const soundDeleteButton = elements.detailPanel.querySelector(".sound-delete-button");
  const soundRestoreButton = elements.detailPanel.querySelector(".sound-restore-button");
  const portraitInstructions = elements.detailPanel.querySelector(".portrait-instructions-input");
  const portraitMessage = elements.detailPanel.querySelector(".portrait-edit-message");
  const portraitPreview = elements.detailPanel.querySelector(".portrait-edit-preview");
  const portraitCurrentImage = elements.detailPanel.querySelector(".portrait-preview-current");
  const portraitNewImage = elements.detailPanel.querySelector(".portrait-preview-new");
  const portraitCurrentMeta = elements.detailPanel.querySelector(".portrait-current-meta");
  const portraitNewMeta = elements.detailPanel.querySelector(".portrait-new-meta");
  const portraitPrompt = elements.detailPanel.querySelector(".portrait-prompt-preview");
  const portraitPromptDetails = elements.detailPanel.querySelector(".portrait-prompt-details");
  const portraitPromptButton = elements.detailPanel.querySelector(".portrait-prompt-button");
  const portraitCopyButton = elements.detailPanel.querySelector(".portrait-copy-button");
  const portraitFileInput = elements.detailPanel.querySelector(".portrait-file-input");
  const portraitPreviewButton = elements.detailPanel.querySelector(".portrait-preview-button");
  const portraitKeepButton = elements.detailPanel.querySelector(".portrait-keep-button");
  const portraitSaveButton = elements.detailPanel.querySelector(".portrait-save-button");
  const portraitDeleteButton = elements.detailPanel.querySelector(".portrait-delete-button");
  const portraitRestoreButton = elements.detailPanel.querySelector(".portrait-restore-button");
  if (!dialog || !openButtons.length || !closeButtons.length || !form || !preview || !previewRows) return;

  let previewToken = "";
  let mapPreviewToken = "";
  let soundPreviewToken = "";
  let portraitPreviewToken = "";
  let portraitPromptText = "";

  const setMessage = (text = "", type = "") => {
    message.textContent = text;
    message.className = `edit-message${type ? ` ${type}` : ""}`;
    message.hidden = !text;
  };

  const resetPreview = () => {
    previewToken = "";
    preview.hidden = true;
    previewRows.replaceChildren();
    saveButton.disabled = true;
  };

  const manualFieldLabel = (fieldKey) => form.querySelector(`.manual-edit-section [data-field="${fieldKey}"]`);

  const clearManualFieldErrors = () => {
    for (const label of form.querySelectorAll(".manual-edit-section [data-field]")) {
      label.classList.remove("field-error");
      label.querySelector(".field-error-text")?.remove();
    }
  };

  const applyManualFieldErrors = (fieldErrors = {}) => {
    clearManualFieldErrors();
    for (const [fieldKey, errors] of Object.entries(fieldErrors)) {
      const label = manualFieldLabel(fieldKey);
      if (!label) continue;
      label.classList.add("field-error");
      const errorText = document.createElement("small");
      errorText.className = "field-error-text";
      errorText.textContent = Array.isArray(errors) ? errors.join(" · ") : String(errors);
      label.append(errorText);
    }
  };

  const updateManualMeasurementMode = (kind) => {
    const checked = form.elements[`${kind}Sexed`]?.checked === true;
    const sharedLabel = manualFieldLabel(kind);
    const sexedFields = form.querySelector(`.manual-edit-section [data-sexed-fields="${kind}"]`);
    if (sharedLabel) sharedLabel.hidden = checked;
    if (sexedFields) sexedFields.hidden = !checked;
  };

  const editableValues = () => {
    const formData = new FormData(form);
    const sizeSexed = formData.get("sizeSexed") === "on";
    const weightSexed = formData.get("weightSexed") === "on";
    return {
      germanName: formData.get("germanName"),
      scientificName: formData.get("scientificName"),
      scientificNameUnlocked: scientificNameInput?.dataset.unlocked === "true",
      size: sizeSexed
        ? composeManualSexedMeasurement(
          formData.get("sizeMale"),
          formData.get("sizeMaleUnit"),
          formData.get("sizeFemale"),
          formData.get("sizeFemaleUnit"),
          { units: MANUAL_SIZE_UNITS },
        )
        : formatManualMeasurement(formData.get("size"), formData.get("sizeUnit"), {
          units: MANUAL_SIZE_UNITS,
        }),
      weight: weightSexed
        ? composeManualSexedMeasurement(
          formData.get("weightMale"),
          formData.get("weightMaleUnit"),
          formData.get("weightFemale"),
          formData.get("weightFemaleUnit"),
          { units: MANUAL_WEIGHT_UNITS },
        )
        : formatManualMeasurement(formData.get("weight"), formData.get("weightUnit"), {
          units: MANUAL_WEIGHT_UNITS,
        }),
      lifeExpectancy: formatManualMeasurement(
        formData.get("lifeExpectancy"),
        formData.get("lifeExpectancyUnit"),
        { units: ["Tag", "Tage", "Monat", "Monate", "Jahr", "Jahre"], age: true },
      ),
    };
  };

  const validateEditableFields = () => {
    const formData = new FormData(form);
    const errors = {};
    const add = (fieldKey, text) => {
      errors[fieldKey] ??= [];
      errors[fieldKey].push(text);
    };
    if (!String(formData.get("germanName") ?? "").trim()) {
      add("germanName", "Deutscher Name darf nicht leer sein");
    }
    if (!String(formData.get("scientificName") ?? "").trim()) {
      add("scientificName", "Wissenschaftlicher Name darf nicht leer sein");
    }
    if (formData.get("sizeSexed") === "on") {
      if (!stripManualMeasureInput(formData.get("sizeMale"), MANUAL_SIZE_UNITS)) {
        add("sizeMale", "Größe Männchen darf nicht leer sein");
      }
      if (!stripManualMeasureInput(formData.get("sizeFemale"), MANUAL_SIZE_UNITS)) {
        add("sizeFemale", "Größe Weibchen darf nicht leer sein");
      }
    } else if (!stripManualMeasureInput(formData.get("size"), MANUAL_SIZE_UNITS)) {
      add("size", "Größe darf nicht leer sein");
    }
    if (formData.get("weightSexed") === "on") {
      if (!stripManualMeasureInput(formData.get("weightMale"), MANUAL_WEIGHT_UNITS)) {
        add("weightMale", "Gewicht Männchen darf nicht leer sein");
      }
      if (!stripManualMeasureInput(formData.get("weightFemale"), MANUAL_WEIGHT_UNITS)) {
        add("weightFemale", "Gewicht Weibchen darf nicht leer sein");
      }
    } else if (!stripManualMeasureInput(formData.get("weight"), MANUAL_WEIGHT_UNITS)) {
      add("weight", "Gewicht darf nicht leer sein");
    }
    if (!stripManualMeasureInput(
      formData.get("lifeExpectancy"),
      ["Tag", "Tage", "Monat", "Monate", "Jahr", "Jahre"],
    )) {
      add("lifeExpectancy", "Lebenserwartung darf nicht leer sein");
    }
    return errors;
  };

  const setMapMessage = (text = "", type = "") => {
    if (!mapMessage) return;
    mapMessage.textContent = text;
    mapMessage.className = `edit-message map-edit-message${type ? ` ${type}` : ""}`;
    mapMessage.hidden = !text;
  };

  const resetMapPreview = () => {
    mapPreviewToken = "";
    if (mapPreview) mapPreview.hidden = true;
    if (mapSaveButton) mapSaveButton.disabled = true;
    if (mapCurrentImage) mapCurrentImage.removeAttribute("src");
    if (mapNewImage) mapNewImage.removeAttribute("src");
  };

  const stopSoundPreviewAudio = () => {
    for (const audio of [currentSoundAudio, soundCurrentAudio, soundNewAudio]) {
      if (!audio) continue;
      audio.pause();
      audio.currentTime = 0;
    }
  };

  const releaseCurrentSoundAudio = async () => {
    await releaseAllAudioElements();
  };

  const setSoundMessage = (text = "", type = "") => {
    if (!soundMessage) return;
    soundMessage.textContent = text;
    soundMessage.className = `edit-message sound-edit-message${type ? ` ${type}` : ""}`;
    soundMessage.hidden = !text;
  };

  const resetSoundPreview = () => {
    soundPreviewToken = "";
    stopSoundPreviewAudio();
    if (soundPreview) soundPreview.hidden = true;
    if (soundSaveButton) soundSaveButton.disabled = true;
    for (const audio of [soundCurrentAudio, soundNewAudio]) {
      if (!audio) continue;
      audio.removeAttribute("src");
      audio.load();
    }
    if (soundCreditsPreview) soundCreditsPreview.replaceChildren();
  };

  const setPortraitMessage = (text = "", type = "") => {
    if (!portraitMessage) return;
    portraitMessage.textContent = text;
    portraitMessage.className = `edit-message portrait-edit-message${type ? ` ${type}` : ""}`;
    portraitMessage.hidden = !text;
  };

  const resetPortraitPreview = () => {
    portraitPreviewToken = "";
    if (portraitPreview) portraitPreview.hidden = true;
    if (portraitSaveButton) portraitSaveButton.disabled = true;
    if (portraitCurrentImage) portraitCurrentImage.removeAttribute("src");
    if (portraitNewImage) portraitNewImage.removeAttribute("src");
  };

  const resetPortraitPrompt = () => {
    portraitPromptText = "";
    if (portraitPrompt) portraitPrompt.textContent = "";
    if (portraitPromptDetails) portraitPromptDetails.hidden = true;
    if (portraitCopyButton) portraitCopyButton.disabled = true;
  };

  const setBusy = (busy) => {
    previewButton.disabled = busy;
    saveButton.disabled = busy || !previewToken;
    for (const button of closeButtons) button.disabled = busy;
  };

  const setMapBusy = (busy) => {
    if (mapPreviewButton) mapPreviewButton.disabled = busy;
    if (mapSaveButton) mapSaveButton.disabled = busy || !mapPreviewToken;
    if (mapAutoSearchButton) mapAutoSearchButton.disabled = busy;
    if (mapDeleteButton) mapDeleteButton.disabled = busy;
    if (mapFileInput) mapFileInput.disabled = busy;
    if (mapReasonInput) mapReasonInput.disabled = busy;
    if (mapSourceInput) mapSourceInput.disabled = busy;
    for (const button of closeButtons) button.disabled = busy;
  };

  const setSoundBusy = (busy) => {
    if (soundPreviewButton) soundPreviewButton.disabled = busy;
    if (soundSaveButton) soundSaveButton.disabled = busy || !soundPreviewToken;
    if (soundRejectCurrentButton) soundRejectCurrentButton.disabled = busy;
    if (soundAutoSearchButton) soundAutoSearchButton.disabled = busy;
    if (soundDeleteButton) soundDeleteButton.disabled = busy;
    if (soundFileInput) soundFileInput.disabled = busy;
    if (soundReasonInput) soundReasonInput.disabled = busy;
    for (const input of form.querySelectorAll(".sound-credit-input")) input.disabled = busy;
    for (const button of closeButtons) button.disabled = busy;
  };

  const setPortraitBusy = (busy) => {
    if (portraitPromptButton) portraitPromptButton.disabled = busy;
    if (portraitCopyButton) portraitCopyButton.disabled = busy || !portraitPromptText;
    if (portraitPreviewButton) portraitPreviewButton.disabled = busy;
    if (portraitKeepButton) portraitKeepButton.disabled = busy;
    if (portraitSaveButton) portraitSaveButton.disabled = busy || !portraitPreviewToken;
    if (portraitDeleteButton) portraitDeleteButton.disabled = busy;
    if (portraitFileInput) portraitFileInput.disabled = busy;
    if (portraitInstructions) portraitInstructions.disabled = busy;
    for (const button of closeButtons) button.disabled = busy;
  };

  const sectionLabels = {
    manual: "Allgemeine Daten bearbeiten",
    portrait: "Artporträt bearbeiten",
    map: "Verbreitungskarte bearbeiten",
    sound: "Tierstimme bearbeiten",
  };

  const setScientificNameUnlocked = (unlocked) => {
    if (!scientificNameInput || !scientificNameUnlockButton) return;
    scientificNameInput.readOnly = !unlocked;
    scientificNameInput.dataset.unlocked = unlocked ? "true" : "false";
    scientificNameUnlockButton.textContent = unlocked ? "🔓" : "🔒";
    scientificNameUnlockButton.title = unlocked
      ? "Wissenschaftlicher Name ist entsperrt"
      : "Wissenschaftlichen Namen entsperren";
    scientificNameUnlockButton.setAttribute(
      "aria-label",
      unlocked
        ? "Wissenschaftlicher Name ist entsperrt"
        : "Wissenschaftlichen Namen entsperren",
    );
    if (scientificNameWarning) scientificNameWarning.hidden = !unlocked;
  };

  const resetScientificNameLock = () => {
    if (!scientificNameInput) return;
    scientificNameInput.value = species.scientificName;
    setScientificNameUnlocked(false);
  };

  const openEditor = (section = "manual") => {
    const activeSection = ["manual", "portrait", "map", "sound"].includes(section) ? section : "manual";
    form.reset();
    resetPreview();
    resetMapPreview();
    resetSoundPreview();
    resetPortraitPreview();
    resetPortraitPrompt();
    setMessage();
    setMapMessage();
    setSoundMessage();
    setPortraitMessage();
    if (activeSection === "manual") {
      resetScientificNameLock();
      clearManualFieldErrors();
      updateManualMeasurementMode("size");
      updateManualMeasurementMode("weight");
    }
    dialog.dataset.activeSection = activeSection;
    const title = dialog.querySelector("#edit-dialog-title");
    if (title) title.textContent = sectionLabels[activeSection] || `${species.germanName} bearbeiten`;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  mapBrowserLink?.addEventListener("click", () => {
    setMapMessage(
      "Die IUCN-Karte öffnet im externen Browser. Wenn dort ein Backblaze-JPEG-Link sichtbar ist, diesen Link in das Quellen-URL-Feld kopieren und danach „Karte prüfen“ wählen.",
      "info",
    );
  });

  for (const button of openButtons) {
    button.addEventListener("click", () => {
      openEditor(button.dataset.editSection || "manual");
    });
  }

  scientificNameUnlockButton?.addEventListener("click", async () => {
    const alreadyUnlocked = scientificNameInput?.dataset.unlocked === "true";
    if (alreadyUnlocked) {
      setScientificNameUnlocked(false);
      if (scientificNameInput) scientificNameInput.value = species.scientificName;
      resetPreview();
      setMessage("Wissenschaftlicher Name wurde wieder gesperrt.", "info");
      return;
    }
    const confirmed = await showQuickConfirm({
      eyebrow: "WISSENSCHAFTLICHER NAME",
      title: "URL-Slug entsperren?",
      message: "Eine Änderung des wissenschaftlichen Namens ändert den URL-Slug und kann sich direkt auf die Website auswirken.",
      confirmLabel: "Ja, entsperren",
      cancelLabel: "Nein",
      danger: true,
    });
    if (!confirmed) return;
    setScientificNameUnlocked(true);
    scientificNameInput?.focus();
    setMessage(
      "Wissenschaftlicher Name ist entsperrt. Änderungen am URL-Slug vor dem Speichern sorgfältig prüfen.",
      "info",
    );
  });

  const closeEditDialog = () => {
    stopSoundPreviewAudio();
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  const runDeferredEditorReload = () => {
    const forceReload = state.reloadAfterEditClose;
    if (!forceReload && !state.pendingRevisionReload) return;
    if (hasOpenDialog()) return;
    state.reloadAfterEditClose = false;
    state.pendingRevisionReload = false;
    void loadData({ reload: forceReload });
  };

  for (const button of closeButtons) {
    button.addEventListener("click", closeEditDialog);
  }

  setupSafeBackdropClose(dialog, closeEditDialog);
  dialog.addEventListener("close", () => {
    stopSoundPreviewAudio();
    runDeferredEditorReload();
  });

  form.addEventListener("input", (event) => {
    if (event.target.closest(".sound-edit-section")) {
      resetSoundPreview();
      setSoundMessage("Sound oder Credits geändert. Bitte die Vorschau erneut erstellen.", "info");
      return;
    }
    if (event.target.closest(".portrait-edit-section")) {
      resetPortraitPreview();
      if (event.target === portraitInstructions) resetPortraitPrompt();
      setPortraitMessage(
        "Eingabe geändert. Prompt beziehungsweise Bildvorschau bitte erneut erstellen.",
        "info",
      );
      return;
    }
    if (event.target.closest(".map-edit-section")) {
      resetMapPreview();
      setMapMessage("Kartenauswahl oder Angaben geändert. Bitte die Vorschau erneut erstellen.", "info");
      return;
    }
    clearManualFieldErrors();
    resetPreview();
    setMessage("Eingaben geändert. Bitte die Vorschau erneut erstellen.", "info");
  });

  form.elements.sizeSexed?.addEventListener("change", () => updateManualMeasurementMode("size"));
  form.elements.weightSexed?.addEventListener("change", () => updateManualMeasurementMode("weight"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetPreview();
    setBusy(true);
    setMessage("Änderungen werden geprüft…", "info");
    const fieldErrors = validateEditableFields();
    if (Object.keys(fieldErrors).length) {
      applyManualFieldErrors(fieldErrors);
      setMessage("Bitte die markierten Eingaben korrigieren.", "error");
      setBusy(false);
      return;
    }
    clearManualFieldErrors();
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: editableValues(),
          }),
        },
      );
      previewToken = result.token;
      for (const change of result.changes) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <th scope="row">${escapeHtml(change.field)}</th>
          <td>${escapeHtml(change.before)}</td>
          <td>${escapeHtml(change.after)}</td>
        `;
        previewRows.append(row);
      }
      preview.hidden = false;
      saveButton.disabled = false;
      setMessage(
        "Vorschau erstellt. Beim Speichern wird zuerst eine lokale Sicherung angelegt.",
        "success",
      );
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setBusy(false);
    }
  });

  saveButton.addEventListener("click", async () => {
    if (!previewToken) return;
    setBusy(true);
    setMessage("Änderungen werden lokal gesichert und gespeichert…", "info");
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: previewToken }),
        },
      );
      state.notice =
        `Gespeichert. Sicherung: ${result.backup}. `
        + backupRetentionText(result)
        + " "
        + "Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht."
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`;
      if (result.species?.id) state.selectedId = result.species.id;
      if (typeof dialog.close === "function") dialog.close();
      await loadData({ reload: true });
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setBusy(false);
    }
  });

  mapPreviewButton?.addEventListener("click", async () => {
    resetMapPreview();
    setMapBusy(true);
    setMapMessage("Karte und Angaben werden geprüft…", "info");
    try {
      const file = mapFileInput.files?.[0];
      const source = mapSourceInput.value.trim();
      if (!file && !source) throw new Error("Bitte eine JPEG-/PNG-Datei auswählen oder einen direkten JPEG-Link einfügen");
      if (file && file.size > 20 * 1024 * 1024) throw new Error("Karten-Datei darf maximal 20 MB groß sein");
      const imageBase64 = file ? await fileToBase64(file) : "";
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/map/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalName: file?.name || "",
            imageBase64,
            reason: mapReasonInput.value,
            source,
          }),
        },
      );
      mapPreviewToken = result.token;
      mapCurrentImage.hidden = !result.currentMap.exists;
      if (result.currentMap.exists) mapCurrentImage.src = result.currentMap.url;
      mapNewImage.src = result.newMap.url;
      if (typeof mapNewImage.decode === "function") await mapNewImage.decode();
      const dimensions = (entry) => entry.dimensions
        ? `${entry.dimensions.width} × ${entry.dimensions.height} px`
        : "Abmessungen unbekannt";
      mapCurrentMeta.textContent = result.currentMap.exists
        ? `${dimensions(result.currentMap)} · ${formatBytes(result.currentMap.bytes)}`
        : "Keine Karte vorhanden";
      mapNewMeta.textContent = `${dimensions(result.newMap)} · ${formatBytes(result.newMap.bytes)}`;
      mapPreview.hidden = false;
      mapSaveButton.disabled = false;
      setMapMessage(
        "Vorschau erstellt. Beim Speichern wird die Karte lokal vorgemerkt; veröffentlicht wird sie mit Änderungen übertragen.",
        "success",
      );
    } catch (error) {
      resetMapPreview();
      setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setMapBusy(false);
    }
  });

  mapAutoSearchButton?.addEventListener("click", async () => {
    setMapBusy(true);
    setMapMessage("Gezielter Kartensuchlauf wird vorbereitet…", "info");
    try {
      if (!state.openPipelinePreview) throw new Error("Pipeline-Steuerung ist nicht verfügbar");
      const result = await state.openPipelinePreview("manual-maps", {
        targetSlugs: [species.id],
        autoStart: true,
        silent: true,
        context: { source: "editor", section: "map", speciesId: species.id },
      });
      setMapMessage(
        result?.noWork
          ? result.message
          : "Kartensuchlauf läuft im Hintergrund. Falls eine Karte gefunden wird, öffnet sich die Prüfung automatisch.",
        result?.noWork ? "info" : "success",
      );
    } catch (error) {
      state.silentPipelineContext = null;
      setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setMapBusy(false);
    }
  });

  mapSaveButton?.addEventListener("click", async () => {
    if (!mapPreviewToken) return;
    setMapBusy(true);
    setMapMessage("Karte wird lokal gesichert und ersetzt…", "info");
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/map/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: mapPreviewToken }),
        },
      );
      state.notice = result.gitPublished
        ? `Karte gespeichert und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
          + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
          + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
        : `Karte wurde lokal gespeichert. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
      if (typeof dialog.close === "function") dialog.close();
      await loadData({ reload: true });
    } catch (error) {
      setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setMapBusy(false);
    }
  });

  const deleteSingleAsset = async (assetType) => {
    const config = {
      map: {
        label: "Verbreitungskarte",
        message: setMapMessage,
        busy: setMapBusy,
        reset: resetMapPreview,
        confirm:
          "Verbreitungskarte dauerhaft löschen? Die Karte wird lokal gesichert, danach fehlt sie bis zur nächsten automatischen Suche oder manuellen Übernahme.",
      },
      portrait: {
        label: "Artporträt",
        message: setPortraitMessage,
        busy: setPortraitBusy,
        reset: resetPortraitPreview,
        confirm:
          "Artporträt dauerhaft löschen? Das Porträt wird lokal gesichert, danach fehlt es bis zum nächsten manuellen Import.",
      },
      sound: {
        label: "Soundpaket",
        message: setSoundMessage,
        busy: setSoundBusy,
        reset: resetSoundPreview,
        confirm:
          "Sound, Credits und Spektrogramm dauerhaft löschen? Das Paket wird lokal gesichert, danach fehlt die Tierstimme bis zur nächsten Suche oder manuellen Übernahme.",
      },
    }[assetType];
    if (!config) return;
    if (!window.confirm(config.confirm)) return;
    config.reset();
    config.busy(true);
    config.message(`${config.label} wird lokal gesichert und gelöscht …`, "info");
    try {
      if (assetType === "map") {
        state.mapCleanup?.();
        state.mapCleanup = null;
      }
      if (assetType === "portrait") {
        state.portraitCleanup?.();
        state.portraitCleanup = null;
      }
      if (assetType === "sound") await releaseCurrentSoundAudio();
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/${assetType}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      state.notice =
        `${result.label || config.label} wurde gelöscht.`
        + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
        + " Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht."
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`;
      if (typeof dialog.close === "function") dialog.close();
      await loadData({ reload: true });
    } catch (error) {
      config.message([error.message, ...(error.details || [])].join(" · "), "error");
      config.busy(false);
    }
  };

  mapDeleteButton?.addEventListener("click", () => deleteSingleAsset("map"));
  portraitDeleteButton?.addEventListener("click", () => deleteSingleAsset("portrait"));
  soundDeleteButton?.addEventListener("click", () => deleteSingleAsset("sound"));

  const restoreSingleAsset = async (assetType) => {
    const config = {
      map: {
        label: "Verbreitungskarte",
        message: setMapMessage,
        busy: setMapBusy,
        reset: resetMapPreview,
      },
      portrait: {
        label: "Artporträt",
        message: setPortraitMessage,
        busy: setPortraitBusy,
        reset: resetPortraitPreview,
      },
      sound: {
        label: "Soundpaket",
        message: setSoundMessage,
        busy: setSoundBusy,
        reset: resetSoundPreview,
      },
    }[assetType];
    if (!config) return;
    if (!window.confirm(`${config.label} aus der letzten lokalen Sicherung wiederherstellen?`)) return;
    config.reset();
    config.busy(true);
    config.message(`${config.label} wird aus der letzten lokalen Sicherung wiederhergestellt …`, "info");
    try {
      if (assetType === "map") {
        state.mapCleanup?.();
        state.mapCleanup = null;
      }
      if (assetType === "portrait") {
        state.portraitCleanup?.();
        state.portraitCleanup = null;
      }
      if (assetType === "sound") await releaseCurrentSoundAudio();
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/${assetType}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      state.notice =
        `${config.label} wurde aus der lokalen Sicherung wiederhergestellt.`
        + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
        + " Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht.";
      if (typeof dialog.close === "function") dialog.close();
      await loadData({ reload: true });
    } catch (error) {
      config.message([error.message, ...(error.details || [])].join(" · "), "error");
      config.busy(false);
    }
  };

  mapRestoreButton?.addEventListener("click", () => restoreSingleAsset("map"));
  portraitRestoreButton?.addEventListener("click", () => restoreSingleAsset("portrait"));
  soundRestoreButton?.addEventListener("click", () => restoreSingleAsset("sound"));

  portraitKeepButton?.addEventListener("click", () => {
    resetPortraitPreview();
    if (portraitFileInput) portraitFileInput.value = "";
    setPortraitMessage("Bisheriges Artporträt bleibt unverändert.", "info");
  });

  soundRejectCurrentButton?.addEventListener("click", async () => {
    const shouldReject = window.confirm(
      "Aktuellen Sound entfernen und diese Quelle künftig bei der Suche überspringen?",
    );
    if (!shouldReject) return;
    resetSoundPreview();
    setSoundBusy(true);
    setSoundMessage(
      "Aktueller Sound wird lokal gesichert, entfernt, als abgelehnte Quelle gemerkt und für die spätere Übertragung vorgemerkt…",
      "info",
    );
    try {
      await releaseCurrentSoundAudio();
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/sound/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      state.notice = result.gitPublished
        ? `Soundquelle abgelehnt und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
          + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
          + ` Gesperrte Quelle: ${result.rejectedSource?.source || "Unbekannt"}.`
          + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
        : `Soundquelle wurde lokal abgelehnt. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
      stopSoundPreviewAudio();
      state.reloadAfterEditClose = true;
      setSoundMessage("Aktueller Sound wurde abgelehnt. Neuer Sound wird gesucht …", "info");
      if (!state.openPipelinePreview) throw new Error("Pipeline-Steuerung ist nicht verfügbar");
      await state.openPipelinePreview("nc-sounds", {
        targetSlugs: [species.id],
        autoStart: true,
        silent: true,
        context: { source: "editor", section: "sound", speciesId: species.id },
      });
    } catch (error) {
      state.silentPipelineContext = null;
      setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setSoundBusy(false);
    }
  });

  soundAutoSearchButton?.addEventListener("click", async () => {
    resetSoundPreview();
    setSoundBusy(true);
    setSoundMessage("Gezielter Sound-Suchlauf wird vorbereitet…", "info");
    try {
      await releaseCurrentSoundAudio();
      if (!state.openPipelinePreview) throw new Error("Pipeline-Steuerung ist nicht verfügbar");
      const result = await state.openPipelinePreview("nc-sounds", {
        targetSlugs: [species.id],
        autoStart: true,
        silent: true,
        context: { source: "editor", section: "sound", speciesId: species.id },
      });
      setSoundMessage(
        result?.noWork
          ? result.message
          : "Sound-Suchlauf läuft im Hintergrund. Falls ein Sound gefunden wird, öffnet sich die Prüfung automatisch.",
        result?.noWork ? "info" : "success",
      );
    } catch (error) {
      state.silentPipelineContext = null;
      setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setSoundBusy(false);
    }
  });

  soundPreviewButton?.addEventListener("click", async () => {
    resetSoundPreview();
    setSoundBusy(true);
    setSoundMessage("MP3 und Credits werden geprüft…", "info");
    try {
      const file = soundFileInput.files?.[0];
      if (!file) throw new Error("Bitte eine MP3-Datei auswählen");
      if (file.size > 50 * 1024 * 1024) throw new Error("MP3-Datei darf maximal 50 MB groß sein");
      const audioBase64 = await fileToBase64(file);
      const formData = new FormData(form);
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/sound/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalName: file.name,
            audioBase64,
            reason: soundReasonInput.value,
            credits: {
              recordist: formData.get("soundRecordist"),
              source: formData.get("soundSource"),
              url: formData.get("soundUrl"),
              license: formData.get("soundLicense"),
              country: formData.get("soundCountry"),
              location: formData.get("soundLocation"),
              quality: formData.get("soundQuality"),
              notes: formData.get("soundNotes"),
            },
          }),
        },
      );
      soundPreviewToken = result.token;
      soundCurrentAudio.hidden = !result.currentSound.exists;
      if (result.currentSound.exists) soundCurrentAudio.src = result.currentSound.url;
      soundNewAudio.src = result.newSound.url;
      const newDuration = await waitForAudioMetadata(soundNewAudio);
      soundCurrentMeta.textContent = result.currentSound.exists
        ? formatBytes(result.currentSound.bytes)
        : "Kein bisheriger Sound";
      soundNewMeta.textContent = `${formatBytes(result.newSound.bytes)} · ${formatTime(newDuration)}`;
      const credits = result.newSound.credits;
      soundCreditsPreview.innerHTML = dataRows([
        ["Wissenschaftlicher Name", credits.scientific_name],
        ["Deutscher Name", credits.german_name],
        ["Aufnahme/Urheber", credits.recordist],
        ["Quelle", credits.source],
        ["Original-URL", credits.url],
        ["Lizenz", credits.license],
        ["Land", credits.country || "Nicht angegeben"],
        ["Ort", credits.location || "Nicht angegeben"],
        ["Qualität", credits.quality || "Nicht angegeben"],
      ]);
      soundLicenseState.textContent = result.newSound.isNc
        ? "NC-Lizenz · intern prüfen"
        : "Nicht als NC erkannt · Lizenz trotzdem prüfen";
      soundLicenseState.className = `sound-license-state${result.newSound.isNc ? " warning" : ""}`;
      soundPreview.hidden = false;
      soundSaveButton.disabled = false;
      setSoundMessage(
        "Vorschau erstellt. Beim Speichern wird zuerst das neue Spektrogramm erzeugt und anschließend das bisherige Soundpaket gesichert.",
        "success",
      );
    } catch (error) {
      resetSoundPreview();
      setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setSoundBusy(false);
    }
  });

  soundSaveButton?.addEventListener("click", async () => {
    if (!soundPreviewToken) return;
    setSoundBusy(true);
    setSoundMessage(
      "Spektrogramm wird erzeugt; danach werden Sound, Credits und Spektrogramm lokal gesichert und ersetzt…",
      "info",
    );
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/sound/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: soundPreviewToken }),
        },
      );
      state.notice = result.gitPublished
        ? `Sound und Credits gespeichert und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
          + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
          + ` Das neue Spektrogramm wurde automatisch erzeugt${result.spectrogramBytes ? ` (${formatBytes(result.spectrogramBytes)})` : ""}`
          + " und per Soundhash verknüpft."
          + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
        : `Sound und Credits wurden lokal gespeichert. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
      stopSoundPreviewAudio();
      if (typeof dialog.close === "function") dialog.close();
      await loadData({ reload: true });
    } catch (error) {
      setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setSoundBusy(false);
    }
  });

  portraitPromptButton?.addEventListener("click", async () => {
    resetPortraitPreview();
    setPortraitBusy(true);
    setPortraitMessage("Prompt wird lokal aus den Artdaten erstellt…", "info");
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/portrait/prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            additionalInstructions: portraitInstructions?.value || "",
          }),
        },
      );
      portraitPromptText = result.prompt;
      portraitPrompt.textContent = result.prompt;
      portraitPromptDetails.hidden = false;
      portraitCopyButton.disabled = false;
      setPortraitMessage(
        `Prompt erstellt. In ChatGPT einfügen, Bild erzeugen und anschließend als ${result.fileName} herunterladen.`,
        "success",
      );
    } catch (error) {
      resetPortraitPrompt();
      setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setPortraitBusy(false);
    }
  });

  portraitCopyButton?.addEventListener("click", async () => {
    if (!portraitPromptText) return;
    try {
      await navigator.clipboard.writeText(portraitPromptText);
      setPortraitMessage("Prompt wurde in die Zwischenablage kopiert.", "success");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(portraitPrompt);
      selection.removeAllRanges();
      selection.addRange(range);
      setPortraitMessage(
        "Automatisches Kopieren war nicht möglich. Der Prompt wurde markiert; bitte Strg+C drücken.",
        "info",
      );
    }
  });

  portraitPreviewButton?.addEventListener("click", async () => {
    resetPortraitPreview();
    setPortraitBusy(true);
    setPortraitMessage(
      "Bilddatei wird geprüft und lokal in das Produktformat umgewandelt…",
      "info",
    );
    try {
      const file = portraitFileInput.files?.[0];
      if (!file) throw new Error("Bitte ein in ChatGPT erzeugtes PNG-, JPEG- oder WebP-Bild auswählen");
      if (file.size > 20 * 1024 * 1024) throw new Error("Bilddatei darf maximal 20 MB groß sein");
      const imageBase64 = await fileToBase64(file);
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/portrait/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalName: file.name,
            imageBase64,
            additionalInstructions: portraitInstructions?.value || "",
          }),
        },
      );
      portraitPreviewToken = result.token;
      portraitCurrentImage.hidden = !result.currentPortrait.exists;
      if (result.currentPortrait.exists) portraitCurrentImage.src = result.currentPortrait.url;
      portraitNewImage.src = result.newPortrait.url;
      if (typeof portraitNewImage.decode === "function") await portraitNewImage.decode();
      portraitCurrentMeta.textContent = result.currentPortrait.exists
        ? formatBytes(result.currentPortrait.bytes)
        : "Kein bisheriges Artporträt";
      portraitNewMeta.textContent =
        `${result.newPortrait.size} · ${formatBytes(result.newPortrait.bytes)}`
        + ` · Quelle ${result.newPortrait.originalDimensions.width} × ${result.newPortrait.originalDimensions.height} px`;
      portraitPrompt.textContent = result.newPortrait.prompt;
      portraitPromptText = result.newPortrait.prompt;
      portraitPromptDetails.hidden = false;
      portraitCopyButton.disabled = false;
      portraitPreview.hidden = false;
      portraitSaveButton.disabled = false;
      setPortraitMessage(
        "Vorschau erstellt. Bitte Artmerkmale, Anatomie, Anzahl der Gliedmaßen und vollständige Bildränder prüfen.",
        "success",
      );
    } catch (error) {
      resetPortraitPreview();
      setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setPortraitBusy(false);
    }
  });

  portraitSaveButton?.addEventListener("click", async () => {
    if (!portraitPreviewToken) return;
    setPortraitBusy(true);
    setPortraitMessage(
      "Artporträt und Metadaten werden lokal gespeichert und gesichert…",
      "info",
    );
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/portrait/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: portraitPreviewToken }),
        },
      );
      state.notice = result.gitPublished
        ? `Artporträt gespeichert und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
          + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
          + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
        : `Artporträt wurde lokal gespeichert. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
      if (typeof dialog.close === "function") dialog.close();
      await loadData({ reload: true });
    } catch (error) {
      setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setPortraitBusy(false);
    }
  });
}

function setupSpeciesRefresh(species) {
  const openButton = elements.detailPanel.querySelector(".refresh-species-open");
  if (!openButton) return;
  openButton.addEventListener("click", async () => {
    if (!state.openPipelinePreview) return;
    const confirmed = await showQuickConfirm({
      eyebrow: "Art aktualisieren",
      title: "Automatische Aktualisierung",
      message: `Automatische Aktualisierung für ${species.germanName} wirklich ausführen?`,
      confirmLabel: "Ja, aktualisieren",
      cancelLabel: "Abbrechen",
    });
    if (!confirmed) return;
    openButton.disabled = true;
    try {
      const result = await state.openPipelinePreview("all", {
        targetSlugs: [species.id],
        silent: true,
        speciesRefresh: true,
      });
      if (result?.noWork) {
        await showQuickConfirm({
          title: "Keine Aktualisierung gestartet",
          message: result.message,
          confirmLabel: "OK",
          cancelLabel: "",
        });
      }
    } catch (error) {
      await showQuickConfirm({
        title: "Aktualisierung konnte nicht gestartet werden",
        message: error.message,
        confirmLabel: "OK",
        cancelLabel: "",
      });
    } finally {
      openButton.disabled = false;
    }
  });
}

function setupSpeciesDelete(species) {
  const dialog = elements.detailPanel.querySelector(".delete-dialog");
  const openButton = elements.detailPanel.querySelector(".delete-species-open");
  const form = elements.detailPanel.querySelector(".delete-form");
  const message = elements.detailPanel.querySelector(".delete-message");
  const effects = elements.detailPanel.querySelector(".delete-effects");
  const deleteAssetsOption = elements.detailPanel.querySelector(".delete-assets-now");
  const deleteWarning = elements.detailPanel.querySelector(".delete-assets-warning");
  const confirmButton = elements.detailPanel.querySelector(".delete-confirm");
  const cancelButtons = [...elements.detailPanel.querySelectorAll(".delete-cancel")];
  if (
    !dialog
    || !openButton
    || !form
    || !message
    || !effects
    || !deleteAssetsOption
    || !deleteWarning
    || !confirmButton
  ) return;
  let previewToken = "";

  const setMessage = (text = "", type = "") => {
    message.textContent = text;
    message.className = `edit-message delete-message${type ? ` ${type}` : ""}`;
    message.hidden = !text;
  };
  const close = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };
  const updateDeleteMode = () => {
    const permanent = deleteAssetsOption.checked;
    confirmButton.textContent = permanent
      ? "Art und Daten dauerhaft löschen"
      : "Aus Artenliste entfernen";
    deleteWarning.textContent = permanent
      ? "Dauerhaft: Generierte Daten, Assetordner und zugehörige Pflegeinformationen werden sofort gelöscht und sind nicht wiederherstellbar."
      : "Ohne Auswahl bleiben generierte Daten und Assets bis zum separaten Bereinigungslauf bestehen.";
    deleteWarning.classList.toggle("danger", permanent);
  };

  openButton.addEventListener("click", async () => {
    previewToken = "";
    deleteAssetsOption.checked = false;
    updateDeleteMode();
    confirmButton.disabled = true;
    effects.replaceChildren();
    setMessage("Auswirkungen werden geprüft…", "info");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/delete/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      previewToken = result.token;
      effects.innerHTML = `<ul>${result.effects.map((effect) => `<li>${escapeHtml(effect)}</li>`).join("")}</ul>`;
      if (result.requiresAssetDeletion) {
        deleteAssetsOption.checked = true;
        deleteAssetsOption.disabled = true;
      } else {
        deleteAssetsOption.disabled = !result.assetDirectoryExists && !species.inGenerated;
      }
      updateDeleteMode();
      confirmButton.disabled = false;
      setMessage("Löschvorschau ist bereit.", "success");
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    }
  });

  deleteAssetsOption.addEventListener("change", updateDeleteMode);
  for (const button of cancelButtons) button.addEventListener("click", close);
  setupSafeBackdropClose(dialog, close);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!previewToken) return;
    const deleteAssets = deleteAssetsOption.checked;
    releaseDetailMedia();
    if (deleteAssets) await new Promise((resolve) => setTimeout(resolve, 800));
    confirmButton.disabled = true;
    setMessage(
      deleteAssets
        ? "Art, generierte Daten und Assets werden dauerhaft gelöscht…"
        : "Art wird aus der Eingabeliste entfernt…",
      "info",
    );
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/delete/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: previewToken, deleteAssets }),
        },
      );
      state.notice =
        (result.inputEntryRemoved
          ? `${result.deleted.germanName} wurde aus der Eingabeliste entfernt.`
          : `${result.deleted.germanName} war bereits aus der Eingabeliste entfernt.`)
        + (result.backup ? ` Sicherung: ${result.backup}.` : "")
        + backupRetentionText(result)
        + (result.permanentCleanup
          ? " Generierte Daten und Assetordner wurden dauerhaft gelöscht."
          : ` Assetordner bleibt erhalten: ${result.assetDirectoryPreserved}.`)
        + (result.pipelineRequired
          ? " Ein Pipeline- oder Bereinigungslauf entfernt die Art aus den generierten Daten."
          : "");
      state.selectedId = "";
      close();
      await loadData();
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      confirmButton.disabled = false;
    }
  });
}

function renderDetail(species) {
  const browserMapUrl = iucnDistributionMapUrl(species);
  const editableSize = parseManualMeasurement(
    species.manual.size,
    MANUAL_SIZE_UNITS,
    "cm",
  );
  const editableWeight = parseManualMeasurement(
    species.manual.weight,
    MANUAL_WEIGHT_UNITS,
    "g",
  );
  const editableLifeExpectancy = parseManualMeasurement(
    species.manual.lifeExpectancy,
    MANUAL_AGE_UNITS,
    "Jahre",
    { age: true },
  );
  const detailMapUrl = versionedAssetUrl(species.assets.map.url, species.assets.map);
  const detailPortraitUrl = versionedAssetUrl(species.assets.portrait.url, species.assets.portrait);
  const soundVersion = assetVersionKey(
    species.assets.sound,
    species.assets.spectrogram?.soundSha256,
    species.assets.spectrogram?.actualSoundSha256,
  );
  const soundUrl = versionedAssetUrl(species.assets.sound.url, species.assets.sound, soundVersion);
  const spectrogramUrl = versionedAssetUrl(
    species.assets.spectrogram.url,
    species.assets.spectrogram,
    species.assets.spectrogram?.soundSha256,
  );
  const statusIconUrl = iucnStatusIconUrl(species.iucn.status);
  const statusTitle = formatIucnStatus(species.iucn.status);
  const trendIconUrl = iucnTrendIconUrl(species.iucn.trend);
  const badges = [
    statusIconUrl
      ? `<span class="iucn-heading-status" title="${escapeHtml(statusTitle)}">
          <img src="${escapeHtml(statusIconUrl)}" alt="">
          <span class="visually-hidden">${escapeHtml(statusTitle)}</span>
        </span>`
      : `<span class="status-pill">${escapeHtml(species.iucn.status)}</span>`,
    species.assetIssues.length
      ? `<span class="status-pill error">${species.assetIssues.length} Assetproblem(e)</span>`
      : `<span class="status-pill ok">Assets vollständig</span>`,
    species.dataIssues.length
      ? `<span class="status-pill error">${species.dataIssues.length} Datenhinweis(e)</span>`
      : "",
    species.isNcSound ? `<span class="status-pill warning">NC-Sound</span>` : "",
  ].filter(Boolean).join("");
  const detailSoundLicenseInfo = soundLicenseInfo({
    isNc: species.isNcSound,
    license: species.credits?.license,
  });

  const audio = species.assets.sound.exists
    ? `
      <div class="audio-player">
        <audio class="explorer-audio" preload="metadata" src="${escapeHtml(soundUrl)}"></audio>
        <div
          class="audio-visual"
          role="button"
          tabindex="0"
          aria-label="Spektrogramm: klicken zum Springen, Leertaste zum Abspielen"
        >
          ${species.assets.spectrogram.exists
            ? `<img src="${escapeHtml(spectrogramUrl)}" alt="Spektrogramm ${escapeHtml(species.germanName)}">`
            : `<span class="media-missing">Kein Spektrogramm vorhanden</span>`}
          <span class="audio-progress-marker" aria-hidden="true"></span>
        </div>
        <div class="audio-controls">
          <button class="audio-play-toggle" type="button" aria-label="Abspielen">▶</button>
          <span class="audio-time">0:00 / 0:00</span>
          <label class="audio-volume-control">
            <span>Lautstärke</span>
            <input class="audio-volume" type="range" min="0" max="1" step="0.05" value="1">
          </label>
        </div>
      </div>
    `
    : `<p class="media-missing">${
      species.soundMissingKnown
        ? "Keine automatische Tonquelle gefunden. Falls später ein geeigneter Sound verfügbar ist, manuell pflegen."
        : "Keine Sounddatei vorhanden."
    }</p>`;

  const issueGroups = [
    { title: "Datenabweichungen", entries: species.dataIssues, className: "error" },
    { title: "Assetprobleme", entries: species.assetIssues, className: "error" },
    { title: "Hinweise", entries: species.careHints || [], className: "care" },
  ].filter((group) => group.entries.length > 0);
  const issues = issueGroups.length
    ? `
      <section class="issues-section">
        <h3 class="section-title">Validierungshinweise</h3>
        <div class="issue-groups">
          ${issueGroups.map(({ title, entries, className }) => `
            <div class="${escapeHtml(className)}">
              <h4>${escapeHtml(title)}</h4>
              <ul>${entries.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
            </div>
          `).join("")}
        </div>
      </section>
    `
    : "";

  elements.detailPanel.innerHTML = `
    ${state.notice ? `
      <div class="save-notice" role="status">
        ${escapeHtml(state.notice)}
      </div>
    ` : ""}

    <header class="detail-header">
      <div>
        <div class="detail-title-row">
          <h2>${escapeHtml(species.germanName)}</h2>
          <div class="detail-badges">${badges}</div>
        </div>
        <p class="scientific-name">${escapeHtml(species.scientificName)}</p>
      </div>
      <div class="detail-meta">
        ${species.inInput ? `
          <div class="section-actions detail-actions edit-only" aria-label="Artaktionen">
            <button class="refresh-species-open" type="button">Art aktualisieren</button>
            <button class="delete-species-open danger" type="button">Löschen</button>
          </div>
        ` : ""}
        <p class="detail-fetched-at">
          IUCN-Daten abgerufen: <strong>${escapeHtml(formatIucnFetchDate(species.iucn.fetchedAt))}</strong>
        </p>
      </div>
    </header>

    <div class="detail-media-layout">
      ${mapPanel(
        species.assets.map,
        `Verbreitungskarte ${species.germanName}`,
        species.inInput ? "map" : "",
      )}

      <section class="audio-section">
        <div class="section-heading">
          <h3 class="section-title">Tierstimme${species.assets.sound.exists ? ` · ${formatBytes(species.assets.sound.bytes)}` : ""}</h3>
          ${sectionActions(
            species.inInput ? "sound" : "",
            species.inInput && (species.assets.sound.exists || species.assets.credits.exists || species.assets.spectrogram.exists)
              ? "sound"
              : "",
            "Soundpaket löschen",
            species.inInput ? "sound" : "",
            species.assets.sound.backup,
          )}
        </div>
        <div class="audio-body">
          ${audio}
          <details class="audio-credits" open>
            <summary>Quellen und Lizenz</summary>
            <div class="credit-grid">
              <div><span>Quelle</span><strong>${escapeHtml(creditValue(species.credits, "source"))}</strong></div>
              <div><span>Aufnahme</span><strong>${escapeHtml(creditValue(species.credits, "recordist"))}</strong></div>
              <div><span>Qualität</span><strong>${escapeHtml(creditValue(species.credits, "quality"))}</strong></div>
              <div><span>Land</span><strong>${escapeHtml(creditValue(species.credits, "country"))}</strong></div>
              <div><span>Lizenz</span>${creditLinkWithLicense(species.credits, "license", "Lizenz öffnen", detailSoundLicenseInfo)}</div>
              <div><span>Original</span>${creditLink(species.credits, "url", "Quelle öffnen")}</div>
            </div>
          </details>
        </div>
      </section>

      ${speciesImagePanel(species)}
    </div>

    <div class="data-grid">
      <section class="data-section">
        <div class="section-heading">
          <h3 class="section-title">Manuelle Daten</h3>
          ${species.inInput ? inlineEditButton("manual") : ""}
        </div>
        <dl class="data-list">
          ${dataRows([
            ["Größe", formatSexSpecificDataValue(species.manual.size)],
            ["Gewicht", formatSexSpecificDataValue(species.manual.weight)],
            ["Lebenserwartung", species.manual.lifeExpectancy],
            ["URL-Slug", species.slug || "Unbekannt"],
            ["Assetname", species.safeName],
          ])}
        </dl>
      </section>

      <section class="data-section">
        <h3 class="section-title">IUCN-Daten</h3>
        <dl class="data-list">
          ${dataRows([
            ["Kategorie", iconDataValue(species.iucn.category, statusIconUrl)],
            ["Trend", iconDataValue(species.iucn.trend, trendIconUrl, "trend")],
            ["Population", species.iucn.population],
            ["Generationsdauer", species.iucn.generationLength],
            ["Assessment ID", species.iucn.assessmentId],
            ["IUCN Update", species.iucn.lastUpdate],
          ])}
        </dl>
      </section>

      <section class="data-section">
        <h3 class="section-title">Taxonomie</h3>
        <dl class="data-list">
          ${dataRows([
            ["Reich", species.taxonomy.kingdom],
            ["Stamm", species.taxonomy.phylum],
            ["Klasse", species.taxonomy.className],
            ["Ordnung", species.taxonomy.order],
            ["Familie", species.taxonomy.family],
            ["Gattung", species.taxonomy.genus],
            ["Art", species.taxonomy.species],
          ])}
        </dl>
      </section>

      <section class="data-section">
        <h3 class="section-title">Assetstatus</h3>
        <dl class="data-list">
          ${dataRows([
            ["Karte", assetStatusText(species.assets.map)],
            ["Sound", species.soundMissingKnown
              ? "Keine automatische Tonquelle gefunden · Hinweis S"
              : assetStatusText(species.assets.sound)],
            ["Credits", species.soundMissingKnown
              ? "Ohne Sound nicht erforderlich"
              : assetStatusText(species.assets.credits)],
            ["Spektrogramm", species.soundMissingKnown
              ? "Ohne Sound nicht erforderlich"
              : assetStatusText(species.assets.spectrogram)],
            ["Artporträt", species.assets.portrait.exists
              ? `Vorhanden${species.assets.portrait.hashVerified ? " · Hash geprüft" : ""}`
              : "Optional · nicht vorhanden"],
            ["Soundlizenz", species.isNcSound ? "NC · intern prüfen" : "Frei/nicht als NC markiert"],
          ])}
        </dl>
      </section>
    </div>

    ${issues}

    <dialog class="edit-dialog" aria-labelledby="edit-dialog-title">
      <form class="edit-form">
        <header class="edit-dialog-header">
          <div>
            <h3 id="edit-dialog-title">${escapeHtml(species.germanName)} bearbeiten</h3>
            <p>${escapeHtml(species.scientificName)} · Taxonomie ist gesperrt.</p>
          </div>
          <button class="edit-cancel edit-close" type="button" aria-label="Bearbeiten schließen">×</button>
        </header>

        <section class="manual-edit-section">
          <header>
            <div>
              <h4>Allgemeine Daten bearbeiten</h4>
              <p>Deutscher Name, wissenschaftlicher Name, Größe, Gewicht und Lebenserwartung werden in der manuellen Artenliste gespeichert.</p>
            </div>
          </header>

          <div class="edit-fields new-species-fields manual-species-fields">
            <label data-field="germanName">
              <span>Deutscher Name</span>
              <input name="germanName" maxlength="160" value="${escapeHtml(species.germanName)}">
            </label>
            <label class="scientific-name-field" data-field="scientificName">
              <span>Wissenschaftlicher Name</span>
              <div class="locked-input-row">
                <input
                  class="scientific-name-input"
                  name="scientificName"
                  maxlength="201"
                  readonly
                  data-unlocked="false"
                  value="${escapeHtml(species.scientificName)}"
                >
                <button
                  class="scientific-name-unlock"
                  type="button"
                  title="Wissenschaftlichen Namen entsperren"
                  aria-label="Wissenschaftlichen Namen entsperren"
                >🔒</button>
              </div>
              <small class="scientific-name-warning" hidden>
                Änderung ändert den URL-Slug und kann sich direkt auf die Website auswirken.
              </small>
            </label>
            ${renderManualMeasurementEditor({
              kind: "size",
              label: "Größe",
              parsed: editableSize,
              units: MANUAL_SIZE_UNITS,
            })}
            ${renderManualMeasurementEditor({
              kind: "weight",
              label: "Gewicht",
              parsed: editableWeight,
              units: MANUAL_WEIGHT_UNITS,
            })}
            <label data-field="lifeExpectancy">
              <span>Lebenserwartung</span>
              <span class="new-species-value-unit age-unit">
                <span aria-hidden="true">ca.</span>
                <input
                  name="lifeExpectancy"
                  type="text"
                  maxlength="80"
                  autocomplete="off"
                  value="${escapeHtml(editableLifeExpectancy.value)}"
                >
                <select name="lifeExpectancyUnit" aria-label="Alterseinheit">
                  ${renderUnitOptions(MANUAL_AGE_UNITS, editableLifeExpectancy.unit)}
                </select>
              </span>
            </label>
          </div>

          <p class="edit-message" hidden></p>

          <section class="edit-preview" hidden>
            <h4>Diff-Vorschau</h4>
            <div class="edit-table-wrap">
              <table>
                <thead>
                  <tr><th>Feld</th><th>Vorher</th><th>Nachher</th></tr>
                </thead>
                <tbody class="edit-preview-rows"></tbody>
              </table>
            </div>
            <p class="edit-warning">
              Speichern merkt die Änderung lokal vor. Veröffentlichung erfolgt anschließend über „Änderungen übertragen“.
            </p>
          </section>
        </section>

          <section class="portrait-edit-section">
          <header>
            <div>
              <h4>Artporträt erstellen und importieren</h4>
              <p>
                Die App erstellt den Prompt ohne API-Kosten. Das Bild wird selbst in ChatGPT erzeugt,
                heruntergeladen und anschließend hier geprüft.
              </p>
            </div>
            <div class="asset-header-actions">
              <span class="portrait-care-state">
                ${species.assets.portrait.exists ? "Porträt vorhanden" : "Noch kein Porträt"}
              </span>
            </div>
          </header>

          <div class="portrait-species-lock">
            <span>Art</span>
            <strong>${escapeHtml(species.germanName)} · ${escapeHtml(species.scientificName)}</strong>
          </div>

          <label class="portrait-instructions-field">
            <span>Zusätzliche Hinweise · optional</span>
            <textarea
              class="portrait-instructions-input"
              maxlength="800"
              rows="3"
              placeholder="z. B. adultes Männchen im Brutkleid; vollständiger Schwanz sichtbar"
            ></textarea>
          </label>

          <div class="portrait-prompt-actions">
            <button class="portrait-prompt-button" type="button">Prompt erstellen</button>
            <button class="portrait-copy-button" type="button" disabled>Prompt kopieren</button>
          </div>

          <details class="portrait-prompt-details" hidden>
            <summary>Prompt anzeigen</summary>
            <pre class="portrait-prompt-preview"></pre>
          </details>

          <label class="asset-file-field portrait-file-field">
            <span>In ChatGPT erzeugtes Bild</span>
            <input
              class="portrait-file-input"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            >
          </label>

          <p class="edit-message portrait-edit-message" hidden></p>

          <section class="portrait-edit-preview" hidden>
            <div class="portrait-compare-grid">
              <figure>
                <figcaption>Bisheriges Artporträt</figcaption>
                <div class="portrait-compare-frame">
                  <img
                    class="portrait-preview-current"
                    alt="Bisheriges Artporträt ${escapeHtml(species.germanName)}"
                  >
                </div>
                <p class="portrait-current-meta"></p>
              </figure>
              <figure>
                <figcaption>Neue KI-Vorschau</figcaption>
                <div class="portrait-compare-frame">
                  <img
                    class="portrait-preview-new"
                    alt="Neue Artporträt-Vorschau ${escapeHtml(species.germanName)}"
                  >
                </div>
                <p class="portrait-new-meta"></p>
              </figure>
            </div>
            <p class="edit-warning">
              Vor der Übernahme müssen Artmerkmale, Anatomie, Gliedmaßen, Zehen, Flügel, Flossen, Schwanz und
              Bildränder geprüft werden. Speichern legt <code>portrait.webp</code> und
              <code>portrait.json</code> an und führt anschließend Commit und Push aus.
            </p>
          </section>

          <div class="portrait-edit-actions">
            ${species.assets.portrait.exists ? `
              <button class="portrait-keep-button" type="button">Bisheriges Artporträt beibehalten</button>
            ` : ""}
            <button class="portrait-preview-button" type="button">Bild prüfen</button>
            <button class="portrait-save-button" type="button" disabled>Artporträt übernehmen</button>
          </div>
        </section>

        <section class="map-edit-section">
          <header>
            <div>
              <h4>Verbreitungskarte ersetzen</h4>
              <p>JPEG- oder PNG-Datei bis 20 MB oder direkter Karten-JPEG-Link. Pflegegrund wird dauerhaft dokumentiert; Quellen-URL ist nur bei Linkimport Pflicht.</p>
            </div>
            <div class="asset-header-actions">
              ${browserMapUrl ? `
                <a
                  class="map-browser-link"
                  href="${escapeHtml(browserMapUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >IUCN-Karte im Browser öffnen</a>
              ` : ""}
              <button class="map-auto-search-button" type="button">Automatisch suchen</button>
              <span class="map-care-state">
                ${species.assets.map.manuallyAdded ? "Manuell geschützt" : "Automatische Pflege"}
              </span>
            </div>
          </header>

          <div class="map-edit-fields">
            <label class="asset-file-field map-file-field">
              <span>Neue Karten-Datei</span>
              <input class="map-file-input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png">
            </label>
            <label class="asset-reason-field map-reason-field">
              <span>Pflegegrund</span>
              <textarea
                class="map-reason-input"
                maxlength="500"
                rows="2"
                placeholder="Warum wird diese Karte manuell gepflegt?"
              >${escapeHtml(species.assets.map.manualReason || "")}</textarea>
            </label>
            <label class="map-source-field">
              <span>Quellen-URL</span>
              <input
                class="map-source-input"
                type="url"
                maxlength="2000"
                placeholder="https://… oder signierter IUCN/Backblaze-JPEG-Link"
                value="${escapeHtml(species.assets.map.source || "")}"
              >
            </label>
          </div>

          <p class="edit-message map-edit-message" hidden></p>

          <section class="map-edit-preview" hidden>
            <div class="map-compare-grid">
              <figure>
                <figcaption>Bisherige Karte</figcaption>
                <div class="map-compare-frame">
                  <img class="map-preview-current" alt="Bisherige Karte ${escapeHtml(species.germanName)}">
                </div>
                <p class="map-current-meta"></p>
              </figure>
              <figure>
                <figcaption>Neue Karte</figcaption>
                <div class="map-compare-frame">
                  <img class="map-preview-new" alt="Neue Karte ${escapeHtml(species.germanName)}">
                </div>
                <p class="map-new-meta"></p>
              </figure>
            </div>
            <p class="edit-warning">
              Speichern ersetzt <code>map.jpg</code>, legt ein lokales Backup an, aktiviert den manuellen
              Pipeline-Schutz und führt anschließend Commit und Push aus.
            </p>
          </section>

          <div class="map-edit-actions">
            <button class="map-preview-button" type="button">Karte prüfen</button>
            <button class="map-save-button" type="button" disabled>Karte ersetzen</button>
          </div>
        </section>

        <section class="sound-edit-section">
          <header>
            <div>
              <h4>Sound und Credits ersetzen</h4>
              <p>MP3 und Credits werden nur gemeinsam gespeichert. Die Lizenz bleibt eine manuelle Prüfentscheidung.</p>
            </div>
            <div class="asset-header-actions">
              ${!species.assets.sound.manuallyAdded ? `
                <button class="sound-auto-search-button" type="button">
                  ${species.assets.sound.exists ? "Alternative suchen" : "Automatisch suchen"}
                </button>
              ` : ""}
              <span class="sound-care-state">
                ${species.assets.sound.manuallyAdded ? "Manuell geschützt" : "Automatische Pflege"}
              </span>
            </div>
          </header>

          <div class="sound-species-lock">
            <span>Art</span>
            <strong>${escapeHtml(species.germanName)} · ${escapeHtml(species.scientificName)}</strong>
          </div>

          ${species.assets.sound.exists ? `
            <section class="current-sound-preview">
              <div>
                <strong>Aktueller Sound</strong>
                <span>${escapeHtml(species.isNcSound ? "NC-Lizenz" : "frei/akzeptiert")}</span>
              </div>
              <audio class="current-sound-audio" controls preload="metadata" src="${escapeHtml(soundUrl)}"></audio>
            </section>
          ` : ""}

          <div class="sound-edit-fields">
            <label class="asset-file-field sound-file-field">
              <span>Neue MP3-Datei</span>
              <input class="sound-file-input" type="file" accept=".mp3,audio/mpeg">
            </label>
            <label class="asset-reason-field sound-reason-field">
              <span>Pflegegrund</span>
              <textarea
                class="sound-reason-input"
                maxlength="500"
                rows="2"
                placeholder="Warum wird dieser Sound manuell gepflegt?"
              >${escapeHtml(species.assets.sound.manualReason || "")}</textarea>
            </label>
            <label class="sound-recordist-field">
              <span>Aufnahme / Urheber</span>
              <input
                class="sound-credit-input"
                name="soundRecordist"
                maxlength="500"
                value="${escapeHtml(species.credits?.recordist || "")}"
              >
            </label>
            <label class="sound-source-field">
              <span>Quelle</span>
              <input
                class="sound-credit-input"
                name="soundSource"
                maxlength="500"
                placeholder="z. B. xeno-canto.org"
                value="${escapeHtml(species.credits?.source || "")}"
              >
            </label>
            <label class="sound-url-field">
              <span>Original-URL</span>
              <input
                class="sound-credit-input"
                name="soundUrl"
                type="url"
                maxlength="2000"
                placeholder="https://…"
                value="${escapeHtml(species.credits?.url || "")}"
              >
            </label>
            <label class="sound-license-field">
              <span>Lizenz-URL</span>
              <input
                class="sound-credit-input"
                name="soundLicense"
                type="url"
                maxlength="2000"
                placeholder="https://creativecommons.org/…"
                value="${escapeHtml(species.credits?.license || "")}"
              >
            </label>
            <label class="sound-country-field">
              <span>Land</span>
              <input
                class="sound-credit-input"
                name="soundCountry"
                maxlength="240"
                value="${escapeHtml(species.credits?.country || "")}"
              >
            </label>
            <label class="sound-location-field">
              <span>Ort</span>
              <input
                class="sound-credit-input"
                name="soundLocation"
                maxlength="500"
                value="${escapeHtml(species.credits?.location || "")}"
              >
            </label>
            <label class="sound-quality-field">
              <span>Qualität</span>
              <input
                class="sound-credit-input"
                name="soundQuality"
                maxlength="120"
                value="${escapeHtml(species.credits?.quality || "")}"
              >
            </label>
            <label class="sound-notes-field">
              <span>Notizen</span>
              <textarea
                class="sound-credit-input"
                name="soundNotes"
                maxlength="2000"
                rows="2"
              >${escapeHtml(species.credits?.notes || "")}</textarea>
            </label>
          </div>

          <p class="edit-message sound-edit-message" hidden></p>

          <section class="sound-edit-preview" hidden>
            <div class="sound-compare-grid">
              <figure>
                <figcaption>Bisheriger Sound</figcaption>
                <audio class="sound-preview-current" controls preload="metadata"></audio>
                <p class="sound-current-meta"></p>
              </figure>
              <figure>
                <figcaption>Neuer Sound</figcaption>
                <audio class="sound-preview-new" controls preload="metadata"></audio>
                <p class="sound-new-meta"></p>
              </figure>
            </div>
            <span class="sound-license-state"></span>
            <dl class="data-list sound-credits-preview"></dl>
            <p class="edit-warning">
              Speichern sichert das bisherige Soundpaket und ersetzt <code>sound.mp3</code>,
              <code>credits.json</code> und <code>spectrogram.webp</code> gemeinsam. Das neue Spektrogramm wird
              automatisch erzeugt und über SHA-256 mit dem Sound verknüpft.
            </p>
          </section>

          <div class="sound-edit-actions">
            ${species.assets.sound.exists ? `
              <button class="sound-reject-current-button danger" type="button">
                Aktuellen Sound ablehnen
              </button>
            ` : ""}
            <button class="sound-preview-button" type="button">Sound und Credits prüfen</button>
            <button class="sound-save-button" type="button" disabled>Sound und Credits ersetzen</button>
          </div>
        </section>

        <div class="edit-actions manual-edit-actions">
          <button class="edit-cancel" type="button">Abbrechen</button>
          <button class="edit-preview-button" type="submit">Änderungen prüfen</button>
          <button class="edit-save-button" type="button" disabled>Jetzt speichern</button>
        </div>
      </form>
    </dialog>

    ${species.inInput ? `
      <dialog class="edit-dialog delete-dialog" aria-labelledby="delete-dialog-title">
        <form class="edit-form delete-form">
          <header class="edit-dialog-header">
            <div>
              <h3 id="delete-dialog-title">${escapeHtml(species.germanName)} löschen</h3>
              <p>${escapeHtml(species.scientificName)}</p>
            </div>
            <button class="edit-close delete-cancel" type="button" aria-label="Dialog schließen">×</button>
          </header>
          <p class="edit-message delete-message" hidden></p>
          <div class="delete-effects"></div>
          <label class="delete-assets-option">
            <input class="delete-assets-now" type="checkbox">
            <span>Zugehörige generierte Daten und Assets sofort dauerhaft löschen</span>
          </label>
          <p class="edit-warning delete-assets-warning"></p>
          <div class="edit-actions">
            <button class="delete-cancel" type="button">Abbrechen</button>
            <button class="delete-confirm danger" type="submit" disabled>Aus Artenliste entfernen</button>
          </div>
        </form>
      </dialog>
    ` : ""}

    ${species.assets.map.exists ? `
      <dialog class="map-lightbox" aria-label="Vergrößerte Verbreitungskarte ${escapeHtml(species.germanName)}">
        <button class="map-lightbox-close" type="button" aria-label="Vergrößerte Karte schließen">×</button>
        <img src="${escapeHtml(detailMapUrl)}" alt="${escapeHtml(`Verbreitungskarte ${species.germanName}`)}">
      </dialog>
    ` : ""}

    ${species.assets.portrait.exists ? `
      <dialog class="map-lightbox portrait-lightbox" aria-label="Vergrößertes Artporträt ${escapeHtml(species.germanName)}">
        <button class="map-lightbox-close portrait-lightbox-close" type="button" aria-label="Artporträt schließen">×</button>
        <img
          src="${escapeHtml(detailPortraitUrl)}"
          alt="${escapeHtml(`Illustriertes Artporträt ${species.germanName}`)}"
        >
      </dialog>
    ` : ""}
  `;

  setupAudioPlayer();
  setupMapZoom(species);
  setupPortraitZoom();
  setupSpeciesEditor(species);
  setupSpeciesRefresh(species);
  setupSpeciesDelete(species);
}

async function loadData({ reload = false } = {}) {
  state.dataLoading = true;
  elements.reloadButton.disabled = true;
  elements.reloadButton.textContent = "Lädt…";
  try {
    if (reload) await fetch("/api/reload");
    const [
      summaryResponse,
      validationResponse,
      speciesResponse,
      revisionResponse,
      pendingChangesResponse,
    ] = await Promise.all([
      fetch("/api/summary"),
      fetch("/api/validation"),
      fetch("/api/species"),
      fetch("/api/revision"),
      fetch("/api/pending-changes"),
    ]);
    if (
      !summaryResponse.ok
      || !validationResponse.ok
      || !speciesResponse.ok
      || !revisionResponse.ok
      || !pendingChangesResponse.ok
    ) {
      throw new Error("Lokale Daten konnten nicht geladen werden.");
    }

    const [summary, validation, species, revision, pendingChanges] = await Promise.all([
      summaryResponse.json(),
      validationResponse.json(),
      speciesResponse.json(),
      revisionResponse.json(),
      pendingChangesResponse.json(),
    ]);
    state.dataRevision = revision.revision;
    state.species = species;
    updateSummary(summary);
    updateValidation(validation);
    updatePendingChanges(pendingChanges);
    populateStatusFilter();
    applyFilters();

    const selectedExists = state.species.some((entry) => entry.id === state.selectedId);
    const next = selectedExists
      ? state.selectedId
      : state.species.some((entry) => entry.id === requestedSpeciesId)
        ? requestedSpeciesId
        : state.filtered[0]?.id || state.species[0]?.id;
    if (next) {
      const holdBackgroundDetail = state.holdNewSpeciesBackground && elements.newSpeciesDialog?.open;
      if (holdBackgroundDetail) {
        state.selectedId = next;
        renderSpeciesList();
      } else {
        selectSpecies(next);
      }
    }
  } catch (error) {
    elements.detailPanel.innerHTML = `
      <div class="error-state">
        <h2>Daten konnten nicht geladen werden</h2>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  } finally {
    state.dataLoading = false;
    elements.reloadButton.disabled = false;
    elements.reloadButton.textContent = "Aktualisieren";
  }
}

async function monitorProjectRevision() {
  try {
    const response = await fetch("/api/revision");
    if (!response.ok) return;
    const current = await response.json();
    if (state.dataRevision && current.revision !== state.dataRevision && !state.dataLoading) {
      if (hasOpenDialog()) {
        state.pendingRevisionReload = true;
      } else {
        await loadData();
      }
    } else if (!state.dataRevision) {
      state.dataRevision = current.revision;
    }
  } catch {
    // Der nächste Intervall versucht die Verbindung erneut.
  } finally {
    clearTimeout(state.dataRevisionTimer);
    state.dataRevisionTimer = setTimeout(monitorProjectRevision, 5000);
  }
}

elements.search.addEventListener("input", applyFilters);
elements.statusFilter.addEventListener("change", applyFilters);
elements.flagFilter.addEventListener("change", applyFilters);
elements.reloadButton.addEventListener("click", () => loadData({ reload: true }));
window.addEventListener("beforeunload", (event) => {
  const pipelineActive = state.pipelineStatusSnapshot?.status === "running"
    || state.pipelineStatusSnapshot?.status === "awaiting-review";
  const backupActive = state.backupStatusSnapshot?.status === "running";
  if (!state.pendingChanges?.hasPendingChanges || pipelineActive || backupActive) return;
  event.preventDefault();
  event.returnValue = "";
});

setupEditingMode();
setupAssetReview();
setupBackupSettings();
setupPipelineControl();
setupNewSpeciesCreator();
loadData().finally(() => monitorProjectRevision());
