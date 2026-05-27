(async function () {
  const ASSET_BASE = "https://felixkfm90.github.io/iucn-species-data";

  function normalizeUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    return url;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isNonCommercialLicense(value) {
    const license = normalizeUrl(value).toLowerCase();
    return (
      license.includes("by-nc") ||
      license.includes("noncommercial") ||
      license.includes("non-commercial")
    );
  }

  function licenseLabel(value) {
    const raw = String(value || "").trim();
    if (!raw) return "n/a";

    const normalized = normalizeUrl(raw);
    const lower = normalized.toLowerCase();

    if (lower.includes("publicdomain/zero") || lower.includes("cc0")) return "CC0 1.0";

    const ccMatch = lower.match(/creativecommons\.org\/licenses\/([^/]+)\/([^/]+)/);
    if (ccMatch) return `CC ${ccMatch[1].toUpperCase()} ${ccMatch[2]}`;

    const shortMatch = lower.match(/\bcc-([a-z-]+)\b/);
    if (shortMatch) return `CC ${shortMatch[1].toUpperCase()}`;

    return raw;
  }

  function formatTime(seconds) {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const rest = safeSeconds % 60;
    return `${minutes}:${rest.toString().padStart(2, "0")}`;
  }

  function renderStatus(message) {
    return `<div class="frame-box species-sound-frame"><i>${escapeHtml(message)}</i></div>`;
  }

  function buildCreditView(credits) {
    if (!credits) {
      return {
        html: `
          <div class="sound-credits">
            <div class="sound-credit-row">
              <span class="sound-credit-label">Quelle</span>
              <span>n/a</span>
            </div>
          </div>
        `,
        badgeHtml: `<span class="sound-license-badge">Lizenz n/a</span>`,
      };
    }

    const source = credits.source || "n/a";
    const recordist = credits.recordist || credits.rec || credits.recorded_by || credits.author || "";
    const location = credits.location || credits.country || "";
    const quality = credits.quality || "";
    const licenseRaw = credits.license || credits.lic || "";
    const sourceRaw = credits.url || credits.source_url || credits.xc_url || "";
    const licenseUrl = normalizeUrl(licenseRaw);
    const sourceUrl = normalizeUrl(sourceRaw);
    const licenseText = licenseLabel(licenseRaw);
    const hasNcLicense = isNonCommercialLicense(licenseRaw);

    const licenseHtml = licenseUrl.startsWith("http")
      ? `<a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(licenseText)}</a>`
      : escapeHtml(licenseText);

    return {
      html: `
        <div class="sound-credits">
          <div class="sound-credit-row">
            <span class="sound-credit-label">Quelle</span>
            <span>${escapeHtml(source)}</span>
          </div>
          ${recordist ? `
            <div class="sound-credit-row">
              <span class="sound-credit-label">Aufnahme</span>
              <span>${escapeHtml(recordist)}</span>
            </div>
          ` : ""}
          ${location ? `
            <div class="sound-credit-row">
              <span class="sound-credit-label">Ort</span>
              <span>${escapeHtml(location)}</span>
            </div>
          ` : ""}
          ${quality ? `
            <div class="sound-credit-row">
              <span class="sound-credit-label">Qualitaet</span>
              <span>${escapeHtml(quality)}</span>
            </div>
          ` : ""}
          <div class="sound-credit-row">
            <span class="sound-credit-label">Lizenz</span>
            <span>${licenseHtml}</span>
          </div>
          ${sourceUrl ? `
            <div class="sound-credit-actions">
              <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Originalquelle oeffnen</a>
            </div>
          ` : ""}
          ${hasNcLicense ? `
            <div class="sound-credit-warning">
              Non-Commercial-Lizenz: vor kommerzieller Nutzung pruefen.
            </div>
          ` : ""}
        </div>
      `,
      badgeHtml: `<span class="sound-license-badge${hasNcLicense ? " sound-license-badge-nc" : ""}">${escapeHtml(licenseText)}</span>`,
    };
  }

  async function fetchCredits(creditsUrl) {
    try {
      const response = await fetch(creditsUrl, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  function setProgress(rangeEl, fillEl, value) {
    const safeValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
    rangeEl.value = String(safeValue);
    rangeEl.setAttribute("aria-valuenow", String(Math.round(safeValue)));
    fillEl.style.width = `${safeValue}%`;
  }

  const wrapper = document.getElementById("species-sound");
  if (!wrapper) return;

  try {
    if (!window.SpeciesCore || typeof window.SpeciesCore.getSpeciesData !== "function") {
      wrapper.innerHTML = renderStatus("Tierstimme aktuell nicht verfuegbar.");
      return;
    }

    wrapper.innerHTML = renderStatus("Tierstimme wird geladen...");

    const data = await window.SpeciesCore.getSpeciesData();
    const name = data["Deutscher Name"];
    const soundAssetName = window.SpeciesCore.sanitizeAssetName(name);
    const encodedName = encodeURIComponent(soundAssetName);
    const audioUrl = `${ASSET_BASE}/sounds/${encodedName}/${encodedName}.mp3`;
    const creditsUrl = `${ASSET_BASE}/sounds/${encodedName}/credits.json`;

    let audioExists = false;
    try {
      const check = await fetch(audioUrl, { method: "HEAD", cache: "no-store" });
      audioExists = check.ok;
    } catch (_) {
      audioExists = false;
    }

    if (!audioExists) {
      wrapper.innerHTML = renderStatus("Keine Tierstimme verfuegbar.");
      return;
    }

    const credits = await fetchCredits(creditsUrl);
    const creditView = buildCreditView(credits);

    wrapper.innerHTML = `
      <div class="frame-box species-sound-frame">
        <div class="sound-header">
          <div>
            <div class="sound-title">Tierstimme</div>
            <div id="sound-state" class="sound-state">Bereit</div>
          </div>
          ${creditView.badgeHtml}
        </div>

        <div class="soundbar" aria-label="Tierstimmen-Player">
          <button id="play-toggle" class="play-toggle" type="button" aria-label="Tierstimme abspielen" aria-pressed="false">
            &#9658;
          </button>

          <div class="soundbar-main">
            <div class="soundbar-track" aria-hidden="true">
              <div id="soundbar-progress-fill" class="soundbar-progress-fill"></div>
            </div>
            <input
              id="soundbar-progress"
              class="soundbar-progress"
              type="range"
              min="0"
              max="100"
              value="0"
              step="0.1"
              aria-label="Position der Tierstimme"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="0"
            >
            <div class="wave-meta">
              <span id="current-time" class="current-time">0:00</span>
              <span id="duration" class="duration">0:00</span>
            </div>
          </div>
        </div>

        <audio id="species-audio" preload="metadata" src="${escapeHtml(audioUrl)}"></audio>

        ${creditView.html}
      </div>
    `;

    const audio = wrapper.querySelector("#species-audio");
    const playBtn = wrapper.querySelector("#play-toggle");
    const progressEl = wrapper.querySelector("#soundbar-progress");
    const progressFillEl = wrapper.querySelector("#soundbar-progress-fill");
    const currentTimeEl = wrapper.querySelector("#current-time");
    const durationEl = wrapper.querySelector("#duration");
    const stateEl = wrapper.querySelector("#sound-state");

    if (!audio || !playBtn || !progressEl || !progressFillEl || !currentTimeEl || !durationEl) {
      wrapper.innerHTML = renderStatus("Tierstimme aktuell nicht verfuegbar.");
      return;
    }

    function setState(text) {
      if (stateEl) stateEl.textContent = text;
    }

    function setPlaying(isPlaying) {
      playBtn.innerHTML = isPlaying ? "&#10073;&#10073;" : "&#9658;";
      playBtn.setAttribute("aria-label", isPlaying ? "Tierstimme pausieren" : "Tierstimme abspielen");
      playBtn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
      setState(isPlaying ? "Laeuft" : "Bereit");
    }

    function updateProgress() {
      const duration = audio.duration;
      const current = audio.currentTime;
      currentTimeEl.textContent = formatTime(current);
      durationEl.textContent = formatTime(duration);

      if (Number.isFinite(duration) && duration > 0) {
        setProgress(progressEl, progressFillEl, (current / duration) * 100);
      } else {
        setProgress(progressEl, progressFillEl, 0);
      }
    }

    playBtn.addEventListener("click", async () => {
      try {
        if (audio.paused) {
          await audio.play();
        } else {
          audio.pause();
        }
      } catch (_) {
        setState("Wiedergabe blockiert");
      }
    });

    progressEl.addEventListener("input", () => {
      const duration = audio.duration;
      const value = Number(progressEl.value);
      setProgress(progressEl, progressFillEl, value);
      if (Number.isFinite(duration) && duration > 0) {
        audio.currentTime = (duration * value) / 100;
      }
    });

    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("durationchange", updateProgress);
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("ended", () => {
      setPlaying(false);
      audio.currentTime = 0;
      setProgress(progressEl, progressFillEl, 0);
      currentTimeEl.textContent = "0:00";
    });
    audio.addEventListener("error", () => {
      wrapper.innerHTML = `
        <div class="frame-box species-sound-frame">
          <i>Tierstimme aktuell nicht verfuegbar.</i>
          ${creditView.html}
        </div>
      `;
    });

    updateProgress();
  } catch (_) {
    wrapper.innerHTML = renderStatus("Tierstimme aktuell nicht verfuegbar.");
  }
})();
