const state = {
  species: [],
  filtered: [],
  selectedId: "",
  audioCleanup: null,
  mapCleanup: null,
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
  search: document.querySelector("#search"),
  statusFilter: document.querySelector("#status-filter"),
  flagFilter: document.querySelector("#flag-filter"),
  visibleCount: document.querySelector("#visible-count"),
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

  const seekFromPointer = (event) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = visual.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = progress * audio.duration;
    updateProgress();
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

function renderDetail(species) {
  const badges = [
    `<span class="status-pill">${escapeHtml(species.iucn.status)}</span>`,
    species.inconsistencies.length
      ? `<span class="status-pill error">${species.inconsistencies.length} Problem(e)</span>`
      : `<span class="status-pill ok">Assets vollständig</span>`,
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

  const issues = species.inconsistencies.length
    ? `
      <section class="issues-section">
        <h3 class="section-title">Inkonsistenzen</h3>
        <ul>${species.inconsistencies.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
      </section>
    `
    : "";

  elements.detailPanel.innerHTML = `
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
            ["Sound", assetStatusText(species.assets.sound)],
            ["Credits", assetStatusText(species.assets.credits)],
            ["Spektrogramm", assetStatusText(species.assets.spectrogram)],
            ["Soundlizenz", species.isNcSound ? "NC · intern prüfen" : "Frei/nicht als NC markiert"],
          ])}
        </dl>
      </section>
    </div>

    ${issues}

    ${species.assets.map.exists ? `
      <dialog class="map-lightbox" aria-label="Vergrößerte Verbreitungskarte ${escapeHtml(species.germanName)}">
        <button class="map-lightbox-close" type="button" aria-label="Vergrößerte Karte schließen">×</button>
        <img src="${escapeHtml(species.assets.map.url)}" alt="${escapeHtml(`Verbreitungskarte ${species.germanName}`)}">
      </dialog>
    ` : ""}
  `;

  setupAudioPlayer();
  setupMapZoom(species);
}

async function loadData({ reload = false } = {}) {
  elements.reloadButton.disabled = true;
  elements.reloadButton.textContent = "Lädt…";
  try {
    if (reload) await fetch("/api/reload");
    const [summaryResponse, speciesResponse] = await Promise.all([
      fetch("/api/summary"),
      fetch("/api/species"),
    ]);
    if (!summaryResponse.ok || !speciesResponse.ok) throw new Error("Lokale Daten konnten nicht geladen werden.");

    const [summary, species] = await Promise.all([
      summaryResponse.json(),
      speciesResponse.json(),
    ]);
    state.species = species;
    updateSummary(summary);
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
    elements.reloadButton.disabled = false;
    elements.reloadButton.textContent = "Aktualisieren";
  }
}

elements.search.addEventListener("input", applyFilters);
elements.statusFilter.addEventListener("change", applyFilters);
elements.flagFilter.addEventListener("change", applyFilters);
elements.reloadButton.addEventListener("click", () => loadData({ reload: true }));

loadData();
