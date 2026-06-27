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
  openPipelinePreview: null,
  openAssetReview: null,
  pipelineWasRunning: false,
  pipelineStatusSnapshot: null,
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

let speciesPanelLayoutFrame = 0;

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
  const activePipelineStatus = state.pipelineStatusSnapshot?.status === "running"
    ? "running"
    : state.pipelineStatusSnapshot?.status === "awaiting-review"
      ? "review"
      : state.pipelineStatusSnapshot?.status === "failed"
        ? "failed"
        : "";
  const status = stateName || activePipelineStatus || (state.databaseNeedsUpdate ? "outdated" : "current");
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
  const missingPortraitCount = validation.special.missingPortraitCount ?? 0;
  elements.validationAssets.textContent = missingPortraitCount
    ? `${validation.assets.completeSpeciesCount} vollständig · ${missingPortraitCount} Portraits fehlen`
    : `${validation.assets.completeSpeciesCount} vollständig`;
  elements.validationAssetsDetail.textContent = assetsOk
    ? (validation.special.soundCareCount
      ? `Kernassets vollständig · ${validation.special.soundCareCount} Soundhinweis(e)`
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
    + `${validation.special.soundCareCount ? ` · ${validation.special.soundCareCount} Sound${validation.special.soundCareCount === 1 ? "" : "s"}` : ""}`;

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
      + `${available.credits} Credits, ${available.spectrograms} Spektrogramme, `
      + `${available.portraits} Artporträts`,
    );
    if (missingPortraitCount) {
      detailItems.push(`Artporträts: ${missingPortraitCount} von ${validation.data.inputCount} fehlen`);
    }
    if (validation.special.soundCareCount) {
      detailItems.push(
        `Soundhinweise: ${validation.special.soundCareCount} Art(en) ohne automatische Tonquelle oder mit manueller Pflege`,
      );
    }
  } else if (validation.special.soundCareCount) {
    detailItems.push(
      `Soundhinweise: ${validation.special.soundCareCount} Art(en) ohne automatische Tonquelle oder mit manueller Pflege`,
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
  const portrait = species.assets.portrait;
  if (portrait?.exists) {
    return `
      <section class="species-image-panel">
        <h3 class="section-title">Artporträt · ${formatBytes(portrait.bytes)}</h3>
        <button class="portrait-zoom-trigger" type="button" aria-label="Artporträt vergrößern">
          <img
            class="species-portrait-image"
            src="${escapeHtml(portrait.url)}"
            alt="${escapeHtml(`Illustriertes Artporträt ${species.germanName}`)}"
          >
          <span class="map-zoom-hint">Vergrößern</span>
        </button>
      </section>
    `;
  }
  return `
    <section class="species-image-panel">
      <h3 class="section-title">Artporträt</h3>
      <div class="species-image-placeholder">
        <strong>${escapeHtml(species.germanName)}</strong>
        <span>Noch kein geprüftes Artporträt vorhanden</span>
      </div>
    </section>
  `;
}

function syncSpeciesPanelHeight() {
  cancelAnimationFrame(speciesPanelLayoutFrame);
  speciesPanelLayoutFrame = requestAnimationFrame(() => {
    if (window.matchMedia("(max-width: 720px)").matches) {
      elements.speciesPanel.style.removeProperty("height");
      return;
    }

    const visibleDetailBlocks = [...elements.detailPanel.children].filter((element) => {
      if (element.tagName === "DIALOG" || element.hidden) return false;
      return window.getComputedStyle(element).display !== "none";
    });
    const lastDetailBlock = visibleDetailBlocks.at(-1);
    if (!lastDetailBlock) {
      elements.speciesPanel.style.removeProperty("height");
      return;
    }

    const detailTop = elements.detailPanel.getBoundingClientRect().top;
    const detailBottom = lastDetailBlock.getBoundingClientRect().bottom;
    const targetHeight = Math.max(0, Math.ceil(detailBottom - detailTop));
    elements.speciesPanel.style.height = `${targetHeight}px`;
  });
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
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
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
    mapLightboxImage.src = url;
    mapLightboxImage.alt = alt;
    mapLightbox.setAttribute("aria-label", `Vergrößerte ${alt}`);
    if (typeof mapLightbox.showModal === "function") mapLightbox.showModal();
    else mapLightbox.setAttribute("open", "");
    document.body.classList.add("explorer-modal-open");
  };

  const setMessage = (text = "", type = "") => {
    elements.assetReviewMessage.textContent = text;
    elements.assetReviewMessage.className = `edit-message asset-review-message${type ? ` ${type}` : ""}`;
    elements.assetReviewMessage.hidden = !text;
  };

  const openReview = (status) => {
    if (!status.reviewAssets?.length) return;
    if (state.assetReviewRunId === status.runId && dialog.open) return;
    state.assetReviewRunId = status.runId;
    const retryMode = status.mode === "manual-maps" || status.mode === "nc-sounds";
    const automaticLabel = status.mode === "manual-maps"
      ? "Automatische Karte übernehmen"
      : status.mode === "nc-sounds"
        ? "Freie Soundalternative übernehmen"
        : "Automatisch durch Pipeline pflegen";
    const manualLabel = status.mode === "manual-maps"
      ? "Bisherige manuelle Karte behalten"
      : status.mode === "nc-sounds"
        ? "Bisherigen NC-Sound behalten"
        : "Manuell pflegen und schützen";
    elements.assetReviewList.innerHTML = status.reviewAssets.map((asset, index) => {
      const assetManualLabel = status.mode === "nc-sounds" && asset.previouslyExisting === false
        ? "Neuen Sound nicht übernehmen"
        : manualLabel;
      return `
      <article class="asset-review-item" data-index="${index}">
        <div class="asset-review-preview">
          ${asset.type === "map"
            ? `
              <button
                class="asset-review-map-trigger"
                type="button"
                data-map-url="${escapeHtml(asset.url)}"
                data-map-alt="${escapeHtml(`neue Karte ${asset.germanName}`)}"
                aria-label="Neue Karte ${escapeHtml(asset.germanName)} vergrößern"
              >
                <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(`Neue Karte ${asset.germanName}`)}">
                <span class="asset-review-zoom-hint">Vergrößern</span>
              </button>
            `
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
              ${automaticLabel}
            </label>
            <label>
              <input type="radio" name="asset-${index}" value="manual" required>
              ${assetManualLabel}
            </label>
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
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  dialog.addEventListener("cancel", (event) => event.preventDefault());
  elements.assetReviewList.addEventListener("click", (event) => {
    const trigger = event.target.closest(".asset-review-map-trigger");
    if (trigger) openMapLightbox(trigger);
  });
  elements.assetReviewMapLightboxClose.addEventListener("click", closeMapLightbox);
  setupSafeBackdropClose(mapLightbox, closeMapLightbox);
  mapLightbox.addEventListener("close", () => document.body.classList.remove("explorer-modal-open"));
  dialog.addEventListener("close", () => {
    stopAssetReviewAudio();
    closeMapLightbox();
  });
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
  const footerCloseButton = dialog.querySelector(".pipeline-dialog-close-button");
  let previewToken = "";
  let previewMode = "";

  const modeLabel = (mode) => ({
    missing: "Neue/Unvollständige Arten aktualisieren",
    all: "Alle Arten vollständig aktualisieren",
    "manual-maps": "Manuelle Karten erneut suchen",
    "nc-sounds": "NC- und fehlende Sounds erneut suchen",
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

  const renderPersistentPipelineStatus = (status) => {
    const presentation = statusPresentation(status);
    elements.pipelineRunNotice.hidden = !presentation;
    elements.pipelineRunNotice.className = `pipeline-run-notice${presentation ? ` ${presentation.className}` : ""}`;
    if (!presentation) return;
    elements.pipelineRunNoticeTitle.textContent = presentation.title;
    elements.pipelineRunNoticeDetail.textContent = presentation.detail;
  };

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

  const openChooser = () => {
    if (state.pipelineStatusSnapshot?.status === "running"
      || state.pipelineStatusSnapshot?.status === "awaiting-review") {
      showStatusDialog(state.pipelineStatusSnapshot);
      return;
    }
    previewToken = "";
    previewMode = "";
    elements.pipelineDialogTitle.textContent = "Laufart auswählen";
    elements.pipelineDialogDescription.textContent = "Welche Aktion soll gestartet werden?";
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
    setDialogCloseMode(false);
    setMessage("Vorschau wird erstellt…", "info");
    elements.pipelineDialogTitle.textContent = modeLabel(mode);
    elements.pipelineDialogDescription.textContent =
      mode === "cleanup"
        ? "Es wird genau einmal bestätigt, welche Alt-Daten und Assets dauerhaft gelöscht werden."
        : mode === "manual-maps"
          ? "Nur manuell geschützte Karten werden erneut bei IUCN gesucht."
          : mode === "nc-sounds"
            ? "Vorhandene NC-Sounds werden auf freie Alternativen geprüft; fehlende Sounds werden erneut gesucht."
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
        mode === "cleanup"
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
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
    }
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
      elements.pipelineLogDetails.hidden = status.log.length === 0;
      elements.pipelineLog.textContent = status.log.join("\n");

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

      if (awaitingReview) state.openAssetReview?.(status);

      if (state.pipelineWasRunning && !active && status.status !== "idle") {
        if (status.status === "completed" && status.gitPublished) state.notice = "";
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
      elements.pipelineStatusDetail.className = "pipeline-dialog-status failed";
      elements.pipelineRunNotice.hidden = false;
      elements.pipelineRunNotice.className = "pipeline-run-notice failed";
      elements.pipelineRunNoticeTitle.textContent = "Pipeline-Status nicht verfügbar";
      elements.pipelineRunNoticeDetail.textContent = error.message;
    }
  }

  for (const button of elements.pipelineButtons) {
    button.addEventListener("click", () => openPreview(button.dataset.pipelineMode));
  }
  elements.pipelineMenuButton.addEventListener("click", openChooser);
  elements.pipelineRunNoticeOpen.addEventListener("click", () => {
    if (state.pipelineStatusSnapshot) showStatusDialog(state.pipelineStatusSnapshot);
  });
  for (const button of cancelButtons) button.addEventListener("click", close);
  setupSafeBackdropClose(dialog, close);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!previewToken) return;
    elements.pipelineStartButton.disabled = true;
    setMessage(
      previewMode === "cleanup" ? "Bereinigung wird gestartet…" : "Pipeline wird gestartet…",
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
  const portraitSection = dialog.querySelector(".new-species-portrait");
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
  const portraitSaveButton = dialog.querySelector(".new-species-portrait-save-button");
  let previewToken = "";
  let portraitPromptText = "";
  let portraitPreviewToken = "";
  let savedSpeciesId = "";
  let newSpeciesSaved = false;

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

  const speciesValues = () => {
    const formData = new FormData(form);
    return {
      german: formData.get("german"),
      scientificName: formData.get("scientificName"),
      size: formData.get("size"),
      weight: formData.get("weight"),
      lifeExpectancy: formData.get("lifeExpectancy"),
    };
  };

  const resetPortraitPrompt = () => {
    portraitPromptText = "";
    portraitPrompt.textContent = "";
    portraitPromptDetails.hidden = true;
    portraitCopyButton.disabled = true;
  };

  const resetPortraitPreview = () => {
    portraitPreviewToken = "";
    portraitPreview.hidden = true;
    portraitPreviewImage.removeAttribute("src");
    portraitPreviewMeta.textContent = "";
    portraitSaveButton.disabled = true;
  };

  const resetPortraitState = ({ hideSection = true, clearFile = true } = {}) => {
    resetPortraitPrompt();
    resetPortraitPreview();
    setPortraitMessage();
    savedSpeciesId = "";
    if (clearFile && portraitFileInput) portraitFileInput.value = "";
    if (hideSection) portraitSection.hidden = true;
  };

  const resetPreview = () => {
    previewToken = "";
    newSpeciesSaved = false;
    preview.hidden = true;
    jsonPreview.textContent = "";
    for (const field of derivedFields) field.textContent = "";
    saveButton.disabled = true;
    resetPortraitState();
  };

  const setBusy = (busy) => {
    previewButton.disabled = busy || newSpeciesSaved;
    saveButton.disabled = busy || !previewToken || newSpeciesSaved;
    portraitPromptButton.disabled = busy || preview.hidden || newSpeciesSaved;
    portraitCopyButton.disabled = busy || !portraitPromptText;
    portraitSaveButton.disabled = busy || !portraitPreviewToken;
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
  setupSafeBackdropClose(dialog, close);

  form.addEventListener("input", (event) => {
    if (event.target.closest(".new-species-portrait")) {
      resetPortraitPrompt();
      resetPortraitPreview();
      setPortraitMessage("Portraitangaben geändert. Prompt oder Bildprüfung bei Bedarf neu erstellen.", "info");
      return;
    }
    resetPreview();
    setMessage("Eingaben geändert. Bitte die Vorschau erneut erstellen.", "info");
  });

  portraitFileInput.addEventListener("change", () => {
    resetPortraitPreview();
    if (portraitFileInput.files?.[0]) {
      setPortraitMessage("Bild ausgewählt. Nach dem Anlegen der Art wird es direkt geprüft.", "info");
    } else {
      setPortraitMessage();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetPreview();
    setBusy(true);
    setMessage("Neue Art und mögliche Kollisionen werden geprüft…", "info");
    try {
      const result = await fetchJson("/api/species/new/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: speciesValues() }),
      });
      previewToken = result.token;
      for (const field of derivedFields) {
        field.textContent = result.derived[field.dataset.derived] ?? "";
      }
      jsonPreview.textContent = JSON.stringify(result.entry, null, 2);
      preview.hidden = false;
      portraitSection.hidden = false;
      portraitPromptButton.disabled = false;
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

  portraitPromptButton.addEventListener("click", async () => {
    resetPortraitPrompt();
    resetPortraitPreview();
    setBusy(true);
    setPortraitMessage("Portrait-Prompt wird aus den neuen Artdaten erstellt…", "info");
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

  const previewNewSpeciesPortrait = async (speciesId) => {
    resetPortraitPreview();
    const file = portraitFileInput.files?.[0];
    if (!file) return false;
    if (file.size > 20 * 1024 * 1024) throw new Error("Bilddatei darf maximal 20 MB groß sein");
    setPortraitMessage("Art wurde angelegt. Portraitbild wird jetzt geprüft…", "info");
    const imageBase64 = await fileToBase64(file);
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(speciesId)}/assets/portrait/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          imageBase64,
          additionalInstructions: portraitInstructions.value || "",
        }),
      },
    );
    portraitPreviewToken = result.token;
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
    portraitSaveButton.disabled = false;
    setPortraitMessage(
      "Vorschau erstellt. Bitte Artmerkmale, Anatomie und vollständige Bildränder prüfen.",
      "success",
    );
    return true;
  };

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
      savedSpeciesId = result.species?.id || result.derived.slug;
      state.selectedId = savedSpeciesId;
      elements.search.value = "";
      elements.statusFilter.value = "";
      elements.flagFilter.value = "";
      newSpeciesSaved = true;
      previewToken = "";
      await loadData({ reload: true });
      if (portraitFileInput.files?.[0]) {
        try {
          await previewNewSpeciesPortrait(savedSpeciesId);
          setMessage(
            `${result.entry.german} wurde angelegt. Das ausgewählte Portraitbild ist jetzt zur Übernahme bereit.`,
            "success",
          );
        } catch (portraitError) {
          setPortraitMessage(
            [`Portraitbild konnte nicht geprüft werden: ${portraitError.message}`, ...(portraitError.details || [])]
              .join(" · "),
            "error",
          );
          setMessage(
            `${result.entry.german} wurde angelegt. Das Portrait kann später im Bearbeiten-Dialog ergänzt werden.`,
            "success",
          );
        }
        setBusy(false);
        return;
      }
      form.reset();
      resetPreview();
      setBusy(false);
      close();
      await state.openPipelinePreview?.("missing");
    } catch (error) {
      setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setBusy(false);
    }
  });

  portraitSaveButton.addEventListener("click", async () => {
    if (!portraitPreviewToken || !savedSpeciesId) return;
    const shouldSave = window.confirm(
      "Artportrait für die neu angelegte Art speichern, committen und pushen?",
    );
    if (!shouldSave) {
      setPortraitMessage("Übernahme abgebrochen. Das geprüfte Vorschaubild wurde nicht gespeichert.", "info");
      return;
    }
    setBusy(true);
    setPortraitMessage("Artportrait wird gespeichert, committed und gepusht…", "info");
    try {
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/portrait/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: portraitPreviewToken }),
        },
      );
      state.notice = result.gitPublished
        ? `Artportrait gespeichert und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
          + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
          + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
        : `Artportrait wurde lokal gespeichert, aber nicht veröffentlicht. ${result.publicationError || "Git-Veröffentlichung wurde übersprungen."}`;
      form.reset();
      resetPreview();
      setBusy(false);
      close();
      await loadData({ reload: true });
      await state.openPipelinePreview?.("missing");
    } catch (error) {
      setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
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
  const soundFileInput = elements.detailPanel.querySelector(".sound-file-input");
  const soundReasonInput = elements.detailPanel.querySelector(".sound-reason-input");
  const soundMessage = elements.detailPanel.querySelector(".sound-edit-message");
  const soundPreview = elements.detailPanel.querySelector(".sound-edit-preview");
  const soundCurrentAudio = elements.detailPanel.querySelector(".sound-preview-current");
  const soundNewAudio = elements.detailPanel.querySelector(".sound-preview-new");
  const soundCurrentMeta = elements.detailPanel.querySelector(".sound-current-meta");
  const soundNewMeta = elements.detailPanel.querySelector(".sound-new-meta");
  const soundCreditsPreview = elements.detailPanel.querySelector(".sound-credits-preview");
  const soundLicenseState = elements.detailPanel.querySelector(".sound-license-state");
  const soundPreviewButton = elements.detailPanel.querySelector(".sound-preview-button");
  const soundSaveButton = elements.detailPanel.querySelector(".sound-save-button");
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
  const portraitSaveButton = elements.detailPanel.querySelector(".portrait-save-button");
  if (!dialog || !openButton || !closeButtons.length || !form || !preview || !previewRows) return;

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
    for (const audio of [soundCurrentAudio, soundNewAudio]) {
      if (!audio) continue;
      audio.pause();
      audio.currentTime = 0;
    }
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
    if (mapFileInput) mapFileInput.disabled = busy;
    if (mapReasonInput) mapReasonInput.disabled = busy;
    if (mapSourceInput) mapSourceInput.disabled = busy;
    for (const button of closeButtons) button.disabled = busy;
  };

  const setSoundBusy = (busy) => {
    if (soundPreviewButton) soundPreviewButton.disabled = busy;
    if (soundSaveButton) soundSaveButton.disabled = busy || !soundPreviewToken;
    if (soundFileInput) soundFileInput.disabled = busy;
    if (soundReasonInput) soundReasonInput.disabled = busy;
    for (const input of form.querySelectorAll(".sound-credit-input")) input.disabled = busy;
    for (const button of closeButtons) button.disabled = busy;
  };

  const setPortraitBusy = (busy) => {
    if (portraitPromptButton) portraitPromptButton.disabled = busy;
    if (portraitCopyButton) portraitCopyButton.disabled = busy || !portraitPromptText;
    if (portraitPreviewButton) portraitPreviewButton.disabled = busy;
    if (portraitSaveButton) portraitSaveButton.disabled = busy || !portraitPreviewToken;
    if (portraitFileInput) portraitFileInput.disabled = busy;
    if (portraitInstructions) portraitInstructions.disabled = busy;
    for (const button of closeButtons) button.disabled = busy;
  };

  openButton.addEventListener("click", () => {
    resetPreview();
    resetMapPreview();
    resetSoundPreview();
    resetPortraitPreview();
    resetPortraitPrompt();
    setMessage();
    setMapMessage();
    setSoundMessage();
    setPortraitMessage();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });

  for (const button of closeButtons) {
    button.addEventListener("click", () => {
      stopSoundPreviewAudio();
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
  }

  setupSafeBackdropClose(dialog, () => {
    stopSoundPreviewAudio();
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  });
  dialog.addEventListener("close", stopSoundPreviewAudio);

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

  mapPreviewButton?.addEventListener("click", async () => {
    resetMapPreview();
    setMapBusy(true);
    setMapMessage("Karte und Angaben werden geprüft…", "info");
    try {
      const file = mapFileInput.files?.[0];
      if (!file) throw new Error("Bitte eine JPEG-Datei auswählen");
      if (file.size > 20 * 1024 * 1024) throw new Error("JPEG-Datei darf maximal 20 MB groß sein");
      const imageBase64 = await fileToBase64(file);
      const result = await fetchJson(
        `/api/species/${encodeURIComponent(species.id)}/assets/map/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalName: file.name,
            imageBase64,
            reason: mapReasonInput.value,
            source: mapSourceInput.value,
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
        : "Keine bisherige Karte";
      mapNewMeta.textContent = `${dimensions(result.newMap)} · ${formatBytes(result.newMap.bytes)}`;
      mapPreview.hidden = false;
      mapSaveButton.disabled = false;
      setMapMessage(
        "Vorschau erstellt. Beim Speichern werden Backup, manueller Schutz, Commit und Push ausgeführt.",
        "success",
      );
    } catch (error) {
      resetMapPreview();
      setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
    } finally {
      setMapBusy(false);
    }
  });

  mapSaveButton?.addEventListener("click", async () => {
    if (!mapPreviewToken) return;
    setMapBusy(true);
    setMapMessage("Karte wird gesichert, ersetzt, committed und gepusht…", "info");
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
        : `Karte wurde lokal gespeichert, aber nicht veröffentlicht. ${result.publicationError || "Git-Veröffentlichung wurde übersprungen."}`;
      if (typeof dialog.close === "function") dialog.close();
      await loadData({ reload: true });
    } catch (error) {
      setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setMapBusy(false);
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
      "Spektrogramm wird erzeugt; danach werden Sound, Credits und Spektrogramm gesichert, ersetzt, committed und gepusht…",
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
        : `Sound und Credits wurden lokal gespeichert, aber nicht veröffentlicht. ${result.publicationError || "Git-Veröffentlichung wurde übersprungen."}`;
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
      "Artporträt und Metadaten werden gespeichert, gesichert, committed und gepusht…",
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
        : `Artporträt wurde lokal gespeichert, aber nicht veröffentlicht. ${result.publicationError || "Git-Veröffentlichung wurde übersprungen."}`;
      if (typeof dialog.close === "function") dialog.close();
      await loadData({ reload: true });
    } catch (error) {
      setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
      setPortraitBusy(false);
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
      deleteAssetsOption.disabled = !result.assetDirectoryExists && !species.inGenerated;
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
    state.audioCleanup?.();
    confirmButton.disabled = true;
    setMessage(
      deleteAssets
        ? "Art, generierte Daten und Assets werden dauerhaft gelöscht…"
        : "Art wird aus species_list.json entfernt…",
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
        `${result.deleted.germanName} wurde aus species_list.json entfernt. Sicherung: ${result.backup}.`
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
        <h2>${escapeHtml(species.germanName)}</h2>
        <p class="scientific-name">${escapeHtml(species.scientificName)}</p>
      </div>
      <div class="detail-meta">
        ${species.inInput ? `
          <div class="section-actions detail-actions edit-only" aria-label="Artaktionen">
            <button class="edit-species-open" type="button">Bearbeiten</button>
            <button class="delete-species-open danger" type="button">Löschen</button>
          </div>
        ` : ""}
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
        <h3 class="section-title">Manuelle Daten</h3>
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
            <p class="edit-eyebrow">species_list.json</p>
            <h3 id="edit-dialog-title">${escapeHtml(species.germanName)} bearbeiten</h3>
            <p>${escapeHtml(species.scientificName)} · Taxonomie und Name sind gesperrt.</p>
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

        <section class="portrait-edit-section">
          <header>
            <div>
              <h4>Artporträt erstellen und importieren</h4>
              <p>
                Die App erstellt den Prompt ohne API-Kosten. Das Bild wird selbst in ChatGPT erzeugt,
                heruntergeladen und anschließend hier geprüft.
              </p>
            </div>
            <span class="portrait-care-state">
              ${species.assets.portrait.exists ? "Porträt vorhanden" : "Noch kein Porträt"}
            </span>
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
            <button class="portrait-preview-button" type="button">Bild prüfen</button>
            <button class="portrait-save-button" type="button" disabled>Artporträt übernehmen</button>
          </div>
        </section>

        <section class="map-edit-section">
          <header>
            <div>
              <h4>Verbreitungskarte ersetzen</h4>
              <p>Nur JPEG bis 20 MB. Quelle und Pflegegrund werden dauerhaft dokumentiert.</p>
            </div>
            <span class="map-care-state">
              ${species.assets.map.manuallyAdded ? "Manuell geschützt" : "Automatische Pflege"}
            </span>
          </header>

          <div class="map-edit-fields">
            <label class="asset-file-field map-file-field">
              <span>Neue JPEG-Datei</span>
              <input class="map-file-input" type="file" accept=".jpg,.jpeg,image/jpeg">
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
                placeholder="https://…"
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
            <span class="sound-care-state">
              ${species.assets.sound.manuallyAdded ? "Manuell geschützt" : "Automatische Pflege"}
            </span>
          </header>

          <div class="sound-species-lock">
            <span>Art</span>
            <strong>${escapeHtml(species.germanName)} · ${escapeHtml(species.scientificName)}</strong>
          </div>

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
            <button class="sound-preview-button" type="button">Sound und Credits prüfen</button>
            <button class="sound-save-button" type="button" disabled>Sound und Credits ersetzen</button>
          </div>
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
        <img src="${escapeHtml(species.assets.map.url)}" alt="${escapeHtml(`Verbreitungskarte ${species.germanName}`)}">
      </dialog>
    ` : ""}

    ${species.assets.portrait.exists ? `
      <dialog class="map-lightbox portrait-lightbox" aria-label="Vergrößertes Artporträt ${escapeHtml(species.germanName)}">
        <button class="map-lightbox-close portrait-lightbox-close" type="button" aria-label="Artporträt schließen">×</button>
        <img
          src="${escapeHtml(species.assets.portrait.url)}"
          alt="${escapeHtml(`Illustriertes Artporträt ${species.germanName}`)}"
        >
      </dialog>
    ` : ""}
  `;

  setupAudioPlayer();
  setupMapZoom(species);
  setupPortraitZoom();
  setupSpeciesEditor(species);
  setupSpeciesDelete(species);
  syncSpeciesPanelHeight();
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
window.addEventListener("resize", syncSpeciesPanelHeight);
elements.detailPanel.addEventListener("toggle", syncSpeciesPanelHeight, true);

setupEditingMode();
setupAssetReview();
setupPipelineControl();
setupNewSpeciesCreator();
loadData().finally(() => monitorProjectRevision());
