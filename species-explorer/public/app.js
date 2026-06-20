const state = {
  species: [],
  filtered: [],
  selectedId: "",
  audioCleanup: null,
  mapCleanup: null,
  notice: "",
  editMode: false,
  databaseNeedsUpdate: true,
  openPipelinePreview: null,
  openAssetReview: null,
  pipelineWasRunning: false,
  pipelinePollTimer: null,
  assetReviewRunId: "",
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
  pipelineStatus: document.querySelector("#pipeline-status"),
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
  assetReviewDialog: document.querySelector("#asset-review-dialog"),
  assetReviewForm: document.querySelector("#asset-review-form"),
  assetReviewList: document.querySelector("#asset-review-list"),
  assetReviewMessage: document.querySelector(".asset-review-message"),
  assetReviewSave: document.querySelector("#asset-review-save"),
  reloadButton: document.querySelector("#reload-button"),
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

function formatIucnFetchDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || "Unbekannt";
}

function formatIucnStatus(status) {
  const code = String(status ?? "").trim();
  return IUCN_STATUS_LABELS[code] ? `${IUCN_STATUS_LABELS[code]} (${code})` : code;
}

function assetStatusText(asset) {
  if (!asset.exists) return "Fehlt";
  const parts = ["Vorhanden"];
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

function setupEditingMode() {
  const applyMode = (enabled) => {
    state.editMode = enabled;
    document.body.classList.toggle("edit-mode", enabled);
    elements.editModeToggle.setAttribute("aria-pressed", String(enabled));
    elements.editModeToggle.textContent = enabled ? "Bearbeitungsmodus" : "Lesemodus";
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

function renderDatabaseStatus(stateName = "") {
  const status = stateName || (state.databaseNeedsUpdate ? "outdated" : "current");
  elements.pipelineMenuButton.className = `header-action header-edit-slot database-status ${status}`;
  elements.pipelineStatus.className = `pipeline-status-text ${status}`;
  if (status === "running") elements.pipelineStatus.textContent = "Aktualisierung läuft";
  else if (status === "review") elements.pipelineStatus.textContent = "Neue Assets prüfen";
  else if (status === "failed") elements.pipelineStatus.textContent = "Datenbank aktualisieren";
  else if (status === "current") elements.pipelineStatus.textContent = "Datenbank aktuell";
  else elements.pipelineStatus.textContent = "Datenbank aktualisieren";
}

function updateValidation(validation) {
  const isOk = validation.status === "ok";
  state.databaseNeedsUpdate = !isOk;
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
  elements.validationAssets.textContent = `${validation.assets.completeSpeciesCount} vollständig`;
  elements.validationAssetsDetail.textContent = assetsOk
    ? "Karte, Sound, Credits und Spektrogramm vorhanden"
    : `${validation.assets.issueSpeciesCount} unvollständige Assetordner`;
  setValidationCardState(elements.validationAssetsCard, assetsOk);

  elements.validationReport.textContent = validation.report.consistent ? "Konsistent" : "Abweichung";
  elements.validationReportDetail.textContent = validation.report.consistent
    ? `${validation.report.checks.length} Reportprüfungen bestanden`
    : `${validation.report.issueCount} Reportproblem(e)`;
  setValidationCardState(elements.validationReportCard, validation.report.consistent);

  elements.validationSpecial.textContent =
    `${validation.special.manualMapCount} Karten · ${validation.special.ncSoundCount} NC`;

  const detailItems = [];
  if (!dataOk) {
    detailItems.push(
      `Daten: ${validation.data.inputOnlyCount} nur in species_list.json, `
      + `${validation.data.generatedOnlyCount} nur in speciesData.json, `
      + `${validation.data.mismatchSpeciesCount} Art(en) mit Feldabweichung`,
    );
  }
  if (!assetsOk) {
    const available = validation.assets.available;
    detailItems.push(
      `Assets vorhanden: ${available.maps} Karten, ${available.sounds} Sounds, `
      + `${available.credits} Credits, ${available.spectrograms} Spektrogramme`,
    );
  }
  for (const check of validation.report.checks.filter((entry) => !entry.ok)) {
    detailItems.push(
      `${check.label}: ${check.missingFromReport.length} fehlen im Report, `
      + `${check.staleInReport.length} stehen nur im Report`,
    );
  }
  detailItems.push(...validation.report.counterIssues.map((issue) => `Report-Zähler: ${issue}`));

  elements.validationDetails.hidden = detailItems.length === 0;
  elements.validationDetails.innerHTML = detailItems.length
    ? `<ul>${detailItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
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

    item.addEventListener("click", () => selectSpecies(species.id));
    elements.speciesList.append(item);
  }

  elements.speciesList.scrollTop = previousScrollTop;
}

function dataRows(entries) {
  return entries.map(([label, value]) => `
    <div class="data-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function mapPanel(asset, alt) {
  const content = asset.exists
    ? `
      <button class="map-zoom-trigger" type="button" aria-label="Verbreitungskarte vergrößern">
        <img class="map-image" src="${escapeHtml(asset.url)}" alt="${escapeHtml(alt)}">
        <span class="map-zoom-hint">Vergrößern</span>
      </button>
    `
    : `<span class="media-missing">Nicht vorhanden</span>`;
  return `
    <section class="map-panel">
      <h3 class="section-title">Verbreitungskarte${asset.exists ? ` · ${formatBytes(asset.bytes)}` : ""}</h3>
      <div class="map-frame">${content}</div>
    </section>
  `;
}

function speciesImagePanel(species) {
  return `
    <section class="species-image-panel">
      <h3 class="section-title">Artporträt · später</h3>
      <div class="species-image-placeholder">
        <strong>${escapeHtml(species.germanName)}</strong>
        <span>Bereich für ein später hinterlegtes Artporträt</span>
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

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Anfrage ist fehlgeschlagen");
    error.details = payload.details || [];
    throw error;
  }
  return payload;
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
  window.scrollTo(scrollPosition);
  requestAnimationFrame(() => window.scrollTo(scrollPosition));
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
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    document.body.classList.add("explorer-modal-open");
  };

  const close = () => {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("explorer-modal-open");
  };

  const closeOnBackdrop = (event) => {
    if (event.target === dialog) close();
  };

  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  dialog.addEventListener("click", closeOnBackdrop);
  dialog.addEventListener("close", () => document.body.classList.remove("explorer-modal-open"));

  state.mapCleanup = () => {
    if (dialog.open) close();
  };
}

function setupAssetReview() {
  const dialog = elements.assetReviewDialog;
  const form = elements.assetReviewForm;

  const setMessage = (text = "", type = "") => {
    elements.assetReviewMessage.textContent = text;
    elements.assetReviewMessage.className = `edit-message asset-review-message${type ? ` ${type}` : ""}`;
    elements.assetReviewMessage.hidden = !text;
  };

  const openReview = (status) => {
    if (!status.reviewAssets?.length) return;
    if (state.assetReviewRunId === status.runId && dialog.open) return;
    state.assetReviewRunId = status.runId;
    elements.assetReviewList.innerHTML = status.reviewAssets.map((asset, index) => `
      <article class="asset-review-item" data-index="${index}">
        <div class="asset-review-preview">
          ${asset.type === "map"
            ? `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(`Neue Karte ${asset.germanName}`)}">`
            : `<audio controls preload="metadata" src="${escapeHtml(asset.url)}"></audio>`}
        </div>
        <div class="asset-review-copy">
          <div>
            <strong>${escapeHtml(asset.germanName)} · ${escapeHtml(asset.label)}</strong>
            <p>${escapeHtml(asset.scientificName)} · ${escapeHtml(asset.file)}</p>
          </div>
          <div class="asset-review-options">
            <label>
              <input type="radio" name="asset-${index}" value="automatic" required>
              Automatisch durch Pipeline pflegen
            </label>
            <label>
              <input type="radio" name="asset-${index}" value="manual" required>
              Manuell pflegen und schützen
            </label>
          </div>
        </div>
      </article>
    `).join("");
    form.dataset.runId = status.runId;
    form.dataset.assets = JSON.stringify(status.reviewAssets);
    setMessage("Bitte für jede neue Karte und jeden neuen Sound eine Pflegeart auswählen.", "info");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  dialog.addEventListener("cancel", (event) => event.preventDefault());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const assets = JSON.parse(form.dataset.assets || "[]");
    const formData = new FormData(form);
    const choices = assets.map((asset, index) => ({
      safeName: asset.safeName,
      type: asset.type,
      manual: formData.get(`asset-${index}`) === "manual",
    }));
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
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      setMessage();
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      elements.assetReviewSave.disabled = false;
    }
  });

  state.openAssetReview = openReview;
}

function setupPipelineControl() {
  const dialog = elements.pipelineDialog;
  const form = elements.pipelineForm;
  const cancelButtons = [...dialog.querySelectorAll(".pipeline-cancel")];
  let previewToken = "";
  let previewMode = "";

  const modeLabel = (mode) => ({
    missing: "Neue/Unvollständige Arten aktualisieren",
    all: "Alle Arten vollständig aktualisieren",
    cleanup: "Verwaiste Daten und Assets dauerhaft löschen",
  }[mode] || mode);

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
  };

  const openChooser = () => {
    previewToken = "";
    previewMode = "";
    elements.pipelineDialogTitle.textContent = "Laufart auswählen";
    elements.pipelineDialogDescription.textContent = "Welche Aktion soll gestartet werden?";
    elements.pipelineModeChoice.hidden = false;
    elements.pipelinePreview.hidden = true;
    elements.pipelineStartButton.hidden = true;
    elements.pipelineStartButton.disabled = true;
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
            <strong>${result.obsoleteAssessmentKeys.length}</strong> alte Assessment-Zuordnungen.</p>
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
    elements.pipelinePreviewContent.innerHTML = `
      <p><strong>${result.targetCount}</strong> von ${result.inputCount} Arten werden verarbeitet.</p>
      ${targetRows ? `<ul class="pipeline-target-list">${targetRows}</ul>` : "<p>Keine Zielarten gefunden.</p>"}
      ${removedRows ? `<h5>Aus Ausgabe entfernen</h5><ul>${removedRows}</ul>` : ""}
    `;
    elements.pipelineWarning.textContent =
      "Nach erfolgreichem Lauf werden die Pipeline-Änderungen automatisch committed und gepusht.";
  };

  async function openPreview(mode) {
    previewToken = "";
    previewMode = mode;
    elements.pipelineStartButton.disabled = true;
    elements.pipelineStartButton.hidden = true;
    elements.pipelineModeChoice.hidden = true;
    elements.pipelinePreview.hidden = true;
    setMessage("Vorschau wird erstellt…", "info");
    elements.pipelineDialogTitle.textContent = modeLabel(mode);
    elements.pipelineDialogDescription.textContent =
      mode === "cleanup"
        ? "Es wird genau einmal bestätigt, welche Alt-Daten und Assets dauerhaft gelöscht werden."
        : "Vor dem Start werden Zielarten und Umfang geprüft.";
    showDialog();

    try {
      const result = await fetchJson("/api/pipeline/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      previewToken = result.token;
      renderPreview(result);
      elements.pipelinePreview.hidden = false;
      elements.pipelineStartButton.hidden = false;
      elements.pipelineStartButton.disabled = !result.hasWork || !result.tokensAvailable;
      elements.pipelineStartButton.textContent =
        mode === "cleanup" ? "Dauerhaft löschen" : "Pipeline starten";
      setMessage(
        !result.tokensAvailable
          ? "Die benötigten API-Tokens fehlen in der Server-Umgebung."
          : result.hasWork
            ? "Vorschau ist bereit."
            : "Für diesen Lauf wurden keine Aktionen gefunden.",
        !result.tokensAvailable ? "error" : result.hasWork ? "success" : "info",
      );
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    }
  }

  async function refreshPipelineStatus() {
    try {
      const status = await fetchJson("/api/pipeline/status");
      const running = status.status === "running";
      const awaitingReview = status.status === "awaiting-review";
      const active = running || awaitingReview;
      setPipelineButtonsDisabled(active);
      if (running) renderDatabaseStatus("running");
      else if (awaitingReview) renderDatabaseStatus("review");
      else if (status.status === "failed") renderDatabaseStatus("failed");
      else renderDatabaseStatus();
      elements.pipelineStatusDetail.textContent = active
        ? `${modeLabel(status.mode)} · gestartet ${formatDate(status.startedAt).replace(/^Report /, "")}`
        : status.completedAt
          ? `${modeLabel(status.mode)} · beendet ${formatDate(status.completedAt).replace(/^Report /, "")}`
          : "Kein Lauf aktiv.";
      elements.pipelineLogDetails.hidden = status.log.length === 0;
      elements.pipelineLog.textContent = status.log.join("\n");

      if (awaitingReview) state.openAssetReview?.(status);

      if (state.pipelineWasRunning && !active && status.status !== "idle") {
        await loadData({ reload: true });
      }
      state.pipelineWasRunning = active;
      clearTimeout(state.pipelinePollTimer);
      state.pipelinePollTimer = active
        ? setTimeout(refreshPipelineStatus, 1000)
        : null;
    } catch (error) {
      elements.pipelineStatus.textContent = "Statusfehler";
      elements.pipelineStatusDetail.textContent = error.message;
    }
  }

  for (const button of elements.pipelineButtons) {
    button.addEventListener("click", () => openPreview(button.dataset.pipelineMode));
  }
  elements.pipelineMenuButton.addEventListener("click", openChooser);
  for (const button of cancelButtons) button.addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!previewToken) return;
    elements.pipelineStartButton.disabled = true;
    setMessage(
      previewMode === "cleanup" ? "Bereinigung wird gestartet…" : "Pipeline wird gestartet…",
      "info",
    );
    try {
      await fetchJson("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: previewToken }),
      });
      close();
      await refreshPipelineStatus();
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      elements.pipelineStartButton.disabled = false;
    }
  });

  state.openPipelinePreview = openPreview;
  void refreshPipelineStatus();
}

function setupNewSpeciesCreator() {
  const dialog = elements.newSpeciesDialog;
  const form = elements.newSpeciesForm;
  const openButton = elements.newSpeciesButton;
  const closeButtons = [...dialog.querySelectorAll(".new-species-cancel")];
  const preview = dialog.querySelector(".new-species-preview");
  const message = dialog.querySelector(".new-species-message");
  const previewButton = dialog.querySelector(".new-species-preview-button");
  const saveButton = dialog.querySelector(".new-species-save-button");
  const jsonPreview = dialog.querySelector(".new-species-json");
  const derivedFields = [...dialog.querySelectorAll("[data-derived]")];
  let previewToken = "";

  const setMessage = (text = "", type = "") => {
    message.textContent = text;
    message.className = `edit-message new-species-message${type ? ` ${type}` : ""}`;
    message.hidden = !text;
  };

  const resetPreview = () => {
    previewToken = "";
    preview.hidden = true;
    jsonPreview.textContent = "";
    for (const field of derivedFields) field.textContent = "";
    saveButton.disabled = true;
  };

  const setBusy = (busy) => {
    previewButton.disabled = busy;
    saveButton.disabled = busy || !previewToken;
    openButton.disabled = busy;
    for (const button of closeButtons) button.disabled = busy;
  };

  const close = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  openButton.addEventListener("click", () => {
    form.reset();
    resetPreview();
    setMessage();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    form.elements.german.focus();
  });

  for (const button of closeButtons) button.addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });

  form.addEventListener("input", () => {
    resetPreview();
    setMessage("Eingaben geändert. Bitte die Vorschau erneut erstellen.", "info");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetPreview();
    setBusy(true);
    setMessage("Neue Art und mögliche Kollisionen werden geprüft…", "info");
    const formData = new FormData(form);
    try {
      const result = await fetchJson("/api/species/new/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: {
            german: formData.get("german"),
            scientificName: formData.get("scientificName"),
            size: formData.get("size"),
            weight: formData.get("weight"),
            lifeExpectancy: formData.get("lifeExpectancy"),
          },
        }),
      });
      previewToken = result.token;
      for (const field of derivedFields) {
        field.textContent = result.derived[field.dataset.derived] ?? "";
      }
      jsonPreview.textContent = JSON.stringify(result.entry, null, 2);
      preview.hidden = false;
      saveButton.disabled = false;
      setMessage(
        "Vorschau erstellt. Beim Anlegen wird zuerst eine lokale Sicherung gespeichert.",
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
    setMessage("species_list.json wird gesichert und um die neue Art ergänzt…", "info");
    try {
      const result = await fetchJson("/api/species/new/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: previewToken }),
      });
      state.notice =
        `${result.entry.german} wurde angelegt. Sicherung: ${result.backup}.`
        + backupRetentionText(result)
        + " Die Art ist bis zum nächsten Pipeline-Lauf erwartungsgemäß unvollständig."
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`;
      state.selectedId = result.species?.id || result.derived.slug;
      elements.search.value = "";
      elements.statusFilter.value = "";
      elements.flagFilter.value = "";
      form.reset();
      resetPreview();
      setBusy(false);
      close();
      await loadData();
      await state.openPipelinePreview?.("missing");
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setBusy(false);
    }
  });
}

function setupSpeciesEditor(species) {
  const dialog = elements.detailPanel.querySelector(".edit-dialog");
  const openButton = elements.detailPanel.querySelector(".edit-species-open");
  const closeButtons = [...elements.detailPanel.querySelectorAll(".edit-cancel")];
  const form = elements.detailPanel.querySelector(".edit-form");
  const preview = elements.detailPanel.querySelector(".edit-preview");
  const previewRows = elements.detailPanel.querySelector(".edit-preview-rows");
  const message = elements.detailPanel.querySelector(".edit-message");
  const previewButton = elements.detailPanel.querySelector(".edit-preview-button");
  const saveButton = elements.detailPanel.querySelector(".edit-save-button");
  if (!dialog || !openButton || !closeButtons.length || !form || !preview || !previewRows) return;

  let previewToken = "";

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

  const setBusy = (busy) => {
    previewButton.disabled = busy;
    saveButton.disabled = busy || !previewToken;
    for (const button of closeButtons) button.disabled = busy;
  };

  openButton.addEventListener("click", () => {
    resetPreview();
    setMessage();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });

  for (const button of closeButtons) {
    button.addEventListener("click", () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && typeof dialog.close === "function") dialog.close();
  });

  form.addEventListener("input", () => {
    resetPreview();
    setMessage("Eingaben geändert. Bitte die Vorschau erneut erstellen.", "info");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetPreview();
    setBusy(true);
    setMessage("Änderungen werden geprüft…", "info");
    const formData = new FormData(form);
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: {
              size: formData.get("size"),
              weight: formData.get("weight"),
              lifeExpectancy: formData.get("lifeExpectancy"),
            },
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
    setMessage("species_list.json wird gesichert und gespeichert…", "info");
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
        + "Die Datenpipeline muss anschließend separat ausgeführt werden."
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`;
      if (typeof dialog.close === "function") dialog.close();
      await loadData();
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setBusy(false);
    }
  });
}

function setupSpeciesDelete(species) {
  const dialog = elements.detailPanel.querySelector(".delete-dialog");
  const openButton = elements.detailPanel.querySelector(".delete-species-open");
  const form = elements.detailPanel.querySelector(".delete-form");
  const message = elements.detailPanel.querySelector(".delete-message");
  const effects = elements.detailPanel.querySelector(".delete-effects");
  const confirmButton = elements.detailPanel.querySelector(".delete-confirm");
  const cancelButtons = [...elements.detailPanel.querySelectorAll(".delete-cancel")];
  if (!dialog || !openButton || !form || !message || !effects || !confirmButton) return;
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

  openButton.addEventListener("click", async () => {
    previewToken = "";
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
      confirmButton.disabled = false;
      setMessage("Löschvorschau ist bereit. Der Assetordner bleibt erhalten.", "success");
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    }
  });

  for (const button of cancelButtons) button.addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!previewToken) return;
    confirmButton.disabled = true;
    setMessage("Art wird aus species_list.json entfernt…", "info");
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/delete/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: previewToken }),
        },
      );
      state.notice =
        `${result.deleted.germanName} wurde aus species_list.json entfernt. Sicherung: ${result.backup}.`
        + backupRetentionText(result)
        + ` Assetordner bleibt erhalten: ${result.assetDirectoryPreserved}.`
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
  const badges = [
    `<span class="status-pill">${escapeHtml(species.iucn.status)}</span>`,
    species.assetIssues.length
      ? `<span class="status-pill error">${species.assetIssues.length} Assetproblem(e)</span>`
      : `<span class="status-pill ok">Assets vollständig</span>`,
    species.dataIssues.length
      ? `<span class="status-pill error">${species.dataIssues.length} Datenhinweis(e)</span>`
      : "",
    species.isNcSound ? `<span class="status-pill warning">NC-Sound</span>` : "",
  ].filter(Boolean).join("");

  const audio = species.assets.sound.exists
    ? `
      <div class="audio-player">
        <audio class="explorer-audio" preload="metadata" src="${escapeHtml(species.assets.sound.url)}"></audio>
        <div
          class="audio-visual"
          role="button"
          tabindex="0"
          aria-label="Spektrogramm: klicken zum Springen, Leertaste zum Abspielen"
        >
          ${species.assets.spectrogram.exists
            ? `<img src="${escapeHtml(species.assets.spectrogram.url)}" alt="Spektrogramm ${escapeHtml(species.germanName)}">`
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
    : `<p class="media-missing">Keine Sounddatei vorhanden.</p>`;

  const issueGroups = [
    ["Datenabweichungen", species.dataIssues],
    ["Assetprobleme", species.assetIssues],
  ].filter(([, entries]) => entries.length > 0);
  const issues = issueGroups.length
    ? `
      <section class="issues-section">
        <h3 class="section-title">Validierungshinweise</h3>
        <div class="issue-groups">
          ${issueGroups.map(([title, entries]) => `
            <div>
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
        <h2>${escapeHtml(species.germanName)}</h2>
        <p class="scientific-name">${escapeHtml(species.scientificName)}</p>
      </div>
      <div class="detail-meta">
        <div class="detail-badges">${badges}</div>
        <p class="detail-fetched-at">
          IUCN-Daten abgerufen: <strong>${escapeHtml(formatIucnFetchDate(species.iucn.fetchedAt))}</strong>
        </p>
      </div>
    </header>

    <div class="detail-media-layout">
      ${mapPanel(species.assets.map, `Verbreitungskarte ${species.germanName}`)}

      <div class="detail-side-stack">
        ${speciesImagePanel(species)}

        <section class="audio-section">
          <h3 class="section-title">Tierstimme${species.assets.sound.exists ? ` · ${formatBytes(species.assets.sound.bytes)}` : ""}</h3>
          <div class="audio-body">
            ${audio}
            <details class="audio-credits">
              <summary>Quellen und Lizenz</summary>
              <div class="credit-grid">
                <div><span>Quelle</span><strong>${escapeHtml(creditValue(species.credits, "source"))}</strong></div>
                <div><span>Aufnahme</span><strong>${escapeHtml(creditValue(species.credits, "recordist"))}</strong></div>
                <div><span>Qualität</span><strong>${escapeHtml(creditValue(species.credits, "quality"))}</strong></div>
                <div><span>Land</span><strong>${escapeHtml(creditValue(species.credits, "country"))}</strong></div>
                <div><span>Lizenz</span>${creditLink(species.credits, "license", "Lizenz öffnen")}</div>
                <div><span>Original</span>${creditLink(species.credits, "url", "Quelle öffnen")}</div>
              </div>
            </details>
          </div>
        </section>
      </div>
    </div>

    <div class="data-grid">
      <section class="data-section">
        <div class="section-title-row">
          <h3 class="section-title">Manuelle Daten</h3>
          ${species.inInput ? `
            <div class="section-actions edit-only">
              <button class="edit-species-open" type="button">Bearbeiten</button>
              <button class="delete-species-open danger" type="button">Löschen</button>
            </div>
          ` : ""}
        </div>
        <dl class="data-list">
          ${dataRows([
            ["Größe", species.manual.size],
            ["Gewicht", species.manual.weight],
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
            ["Kategorie", species.iucn.category],
            ["Trend", species.iucn.trend],
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
            ["Sound", assetStatusText(species.assets.sound)],
            ["Credits", assetStatusText(species.assets.credits)],
            ["Spektrogramm", assetStatusText(species.assets.spectrogram)],
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
            <p class="edit-eyebrow">species_list.json</p>
            <h3 id="edit-dialog-title">${escapeHtml(species.germanName)} bearbeiten</h3>
            <p>${escapeHtml(species.scientificName)} · Taxonomie und Name sind in Phase 7.4 gesperrt.</p>
          </div>
          <button class="edit-cancel edit-close" type="button" aria-label="Bearbeiten schließen">×</button>
        </header>

        <div class="edit-fields">
          <label>
            <span>Größe</span>
            <input name="size" required maxlength="240" value="${escapeHtml(species.manual.size)}">
          </label>
          <label>
            <span>Gewicht</span>
            <input name="weight" required maxlength="240" value="${escapeHtml(species.manual.weight)}">
          </label>
          <label>
            <span>Lebenserwartung</span>
            <input
              name="lifeExpectancy"
              required
              maxlength="240"
              value="${escapeHtml(species.manual.lifeExpectancy)}"
            >
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
            Speichern ändert nur <code>species_list.json</code>. Danach ist ein Pipeline-Lauf erforderlich.
          </p>
        </section>

        <div class="edit-actions">
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
              <p class="edit-eyebrow">species_list.json</p>
              <h3 id="delete-dialog-title">${escapeHtml(species.germanName)} löschen</h3>
              <p>${escapeHtml(species.scientificName)}</p>
            </div>
            <button class="edit-close delete-cancel" type="button" aria-label="Dialog schließen">×</button>
          </header>
          <p class="edit-message delete-message" hidden></p>
          <div class="delete-effects"></div>
          <p class="edit-warning">
            Diese Aktion entfernt zunächst nur den Listeneintrag. Produktive Assets werden nur über den separaten
            Bereinigungslauf dauerhaft gelöscht.
          </p>
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
        <img src="${escapeHtml(species.assets.map.url)}" alt="${escapeHtml(`Verbreitungskarte ${species.germanName}`)}">
      </dialog>
    ` : ""}
  `;

  setupAudioPlayer();
  setupMapZoom(species);
  setupSpeciesEditor(species);
  setupSpeciesDelete(species);
}

async function loadData({ reload = false } = {}) {
  state.dataLoading = true;
  elements.reloadButton.disabled = true;
  elements.reloadButton.textContent = "Lädt…";
  try {
    if (reload) await fetch("/api/reload");
    const [summaryResponse, validationResponse, speciesResponse, revisionResponse] = await Promise.all([
      fetch("/api/summary"),
      fetch("/api/validation"),
      fetch("/api/species"),
      fetch("/api/revision"),
    ]);
    if (
      !summaryResponse.ok
      || !validationResponse.ok
      || !speciesResponse.ok
      || !revisionResponse.ok
    ) {
      throw new Error("Lokale Daten konnten nicht geladen werden.");
    }

    const [summary, validation, species, revision] = await Promise.all([
      summaryResponse.json(),
      validationResponse.json(),
      speciesResponse.json(),
      revisionResponse.json(),
    ]);
    state.dataRevision = revision.revision;
    state.species = species;
    updateSummary(summary);
    updateValidation(validation);
    populateStatusFilter();
    applyFilters();

    const selectedExists = state.species.some((entry) => entry.id === state.selectedId);
    const next = selectedExists
      ? state.selectedId
      : state.species.some((entry) => entry.id === requestedSpeciesId)
        ? requestedSpeciesId
        : state.filtered[0]?.id || state.species[0]?.id;
    if (next) selectSpecies(next);
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
      await loadData();
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

setupEditingMode();
setupAssetReview();
setupPipelineControl();
setupNewSpeciesCreator();
loadData().finally(() => monitorProjectRevision());
