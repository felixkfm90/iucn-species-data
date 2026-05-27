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

  function renderNativeFallback(audioUrl, creditsHtml, licenseBadgeHtml, message) {
    return `
      <div class="frame-box species-sound-frame">
        <div class="sound-header">
          <div>
            <div class="sound-title">Tierstimme</div>
            <div class="sound-state">Native Wiedergabe</div>
          </div>
          ${licenseBadgeHtml}
        </div>
        <p class="sound-fallback-message"><i>${escapeHtml(message)}</i></p>
        <audio class="sound-fallback-audio" controls preload="metadata" src="${escapeHtml(audioUrl)}"></audio>
        ${creditsHtml}
      </div>
    `;
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
    const creditsHtml = creditView.html;

    wrapper.innerHTML = `
      <div class="frame-box species-sound-frame">
        <div class="sound-header">
          <div>
            <div class="sound-title">Tierstimme</div>
            <div id="sound-state" class="sound-state">Bereit</div>
          </div>
          ${creditView.badgeHtml}
        </div>

        <div class="wave-wrapper">
          <button id="play-toggle" class="play-toggle" type="button" aria-label="Tierstimme abspielen" aria-pressed="false">
            &#9658;
          </button>
          <div id="species-waveform" class="species-waveform" aria-label="Audiowellenform"></div>
        </div>

        <div class="wave-meta">
          <span id="current-time" class="current-time">0:00</span>
          <span id="duration" class="duration">0:00</span>
        </div>

        ${creditsHtml}
      </div>
    `;

    if (typeof window.WaveSurfer === "undefined") {
      wrapper.innerHTML = renderNativeFallback(
        audioUrl,
        creditsHtml,
        creditView.badgeHtml,
        "Audio-Player konnte nicht geladen werden. Native Wiedergabe wird verwendet."
      );
      return;
    }

    const waveformEl = wrapper.querySelector("#species-waveform");
    const playBtn = wrapper.querySelector("#play-toggle");
    const currentTimeEl = wrapper.querySelector("#current-time");
    const durationEl = wrapper.querySelector("#duration");
    const stateEl = wrapper.querySelector("#sound-state");

    if (!waveformEl || !playBtn || !currentTimeEl || !durationEl) return;

    let zoomLevel = 50;

    const wavesurfer = WaveSurfer.create({
      container: waveformEl,
      waveColor: "#9fb9b4",
      progressColor: "#0f5e55",
      cursorColor: "#183f39",
      height: 78,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      minPxPerSec: zoomLevel,
      normalize: true,
      responsive: true,
    });

    function setState(text) {
      if (stateEl) stateEl.textContent = text;
    }

    function setPlaying(isPlaying) {
      playBtn.innerHTML = isPlaying ? "&#10073;&#10073;" : "&#9658;";
      playBtn.setAttribute("aria-label", isPlaying ? "Tierstimme pausieren" : "Tierstimme abspielen");
      playBtn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
      setState(isPlaying ? "Laeuft" : "Bereit");
    }

    playBtn.addEventListener("click", () => {
      wavesurfer.playPause();
    });

    wavesurfer.on("ready", () => {
      durationEl.textContent = formatTime(wavesurfer.getDuration());
      currentTimeEl.textContent = "0:00";
      setPlaying(false);
    });

    wavesurfer.on("play", () => setPlaying(true));
    wavesurfer.on("pause", () => setPlaying(false));
    wavesurfer.on("finish", () => {
      currentTimeEl.textContent = formatTime(wavesurfer.getDuration());
      setPlaying(false);
    });

    wavesurfer.on("audioprocess", () => {
      currentTimeEl.textContent = formatTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on("seek", () => {
      currentTimeEl.textContent = formatTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on("error", () => {
      wrapper.innerHTML = renderNativeFallback(
        audioUrl,
        creditsHtml,
        creditView.badgeHtml,
        "Waveform konnte nicht geladen werden. Native Wiedergabe wird verwendet."
      );
    });

    waveformEl.addEventListener(
      "wheel",
      (event) => {
        if (typeof wavesurfer.zoom !== "function") return;
        event.preventDefault();
        zoomLevel = Math.min(300, Math.max(30, zoomLevel + event.deltaY * -0.1));
        wavesurfer.zoom(zoomLevel);
      },
      { passive: false }
    );

    wavesurfer.load(audioUrl);
  } catch (_) {
    wrapper.innerHTML = renderStatus("Tierstimme aktuell nicht verfuegbar.");
  }
})();
