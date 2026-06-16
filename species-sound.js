(async function () {
  const ASSET_BASE = "https://felixkfm90.github.io/iucn-species-data";
  const STYLE_ID = "species-sound-style";
  const WAVEFORM_BARS = 128;
  const VOLUME_STORAGE_KEY = "speciesSoundVolumePercent";
  const SPEED_STORAGE_KEY = "speciesSoundPlaybackRate";
  const VOLUME_MAX_PERCENT = 200;
  const DEFAULT_VOLUME_PERCENT = 100;
  const DEFAULT_PLAYBACK_RATE = 1;
  const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2, 4];

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #species-sound .species-sound-frame {
        padding: 14px;
      }

      #species-sound .sound-player {
        background: #edf3f1;
        border: 1px solid #d4dfdb;
        border-radius: 8px;
        overflow: hidden;
      }

      #species-sound .sound-visual {
        position: relative;
        height: 108px;
        background: linear-gradient(180deg, #ffffff 0%, #f6faf9 100%);
        border-bottom: 1px solid #d4dfdb;
        overflow: hidden;
      }

      #species-sound .sound-wave-canvas {
        display: block;
        width: 100%;
        height: 100%;
      }

      #species-sound .sound-spectrogram-image {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: fill;
        background: #fff;
      }

      #species-sound .sound-visual.has-spectrogram .sound-wave-canvas {
        display: none;
      }

      #species-sound .sound-cursor {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0%;
        width: 2px;
        background: #d33b35;
        box-shadow: 0 0 0 1px rgba(211,59,53,0.12);
        pointer-events: none;
      }

      #species-sound .sound-scrubber {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        opacity: 0;
        cursor: pointer;
      }

      #species-sound .sound-controls {
        display: grid;
        grid-template-columns: 34px minmax(176px, 230px) auto minmax(12px, 1fr) auto;
        grid-template-areas:
          "title title title title title"
          "play volume time spacer speed";
        align-items: center;
        gap: 5px 10px;
        padding: 8px 10px 9px;
      }

      #species-sound #play-toggle.play-toggle {
        grid-area: play;
        width: 34px;
        height: 34px;
        min-width: 34px;
        border: 0;
        border-radius: 50%;
        padding: 0;
        background: #52635f;
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        line-height: 0;
        box-shadow: none;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      #species-sound #play-toggle.play-toggle:hover {
        background: #3f514d;
      }

      #species-sound .sound-icon {
        display: block;
        flex: 0 0 auto;
      }

      #species-sound .sound-icon-play {
        width: 0;
        height: 0;
        margin-left: 3px;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-left: 12px solid #fff;
      }

      #species-sound .sound-icon-pause {
        width: 5px;
        height: 15px;
        border-left: 4px solid #fff;
        border-right: 4px solid #fff;
      }

      #species-sound .sound-title {
        grid-area: title;
        min-width: 0;
        margin-left: 44px;
        font-size: 0.92rem;
        font-weight: 700;
        line-height: 1.15;
        color: #17221f;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #species-sound .sound-time {
        grid-area: time;
        font-size: 0.78rem;
        color: #38433f;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      #species-sound .sound-volume-control,
      #species-sound .sound-speed-control {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
      }

      #species-sound .sound-volume-control {
        grid-area: volume;
        width: 100%;
      }

      #species-sound .sound-volume-icon {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        color: #52635f;
      }

      #species-sound .sound-mute-toggle {
        position: relative;
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        border: 0;
        border-radius: 4px;
        padding: 2px;
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        color: #52635f;
        cursor: pointer;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      #species-sound .sound-mute-toggle:hover {
        background: rgba(82,99,95,0.08);
      }

      #species-sound .sound-mute-toggle::after {
        content: "";
        position: absolute;
        left: 3px;
        right: 3px;
        top: 50%;
        height: 2px;
        border-radius: 999px;
        background: #cf2d2d;
        transform: rotate(-38deg) scaleX(0);
        transform-origin: center;
      }

      #species-sound .sound-mute-toggle.is-muted {
        color: #cf2d2d;
      }

      #species-sound .sound-mute-toggle.is-muted::after {
        transform: rotate(-38deg) scaleX(1);
      }

      #species-sound .sound-volume-range {
        --sound-volume-progress: 50%;
        appearance: none;
        -webkit-appearance: none;
        flex: 1 1 auto;
        min-width: 86px;
        height: 22px;
        margin: 0;
        background: transparent;
        cursor: pointer;
      }

      #species-sound .sound-volume-range::-webkit-slider-runnable-track {
        height: 10px;
        border: 1px solid #9ea9a5;
        border-radius: 2px;
        background: linear-gradient(
          90deg,
          #2cc84d 0%,
          #2cc84d var(--sound-volume-progress),
          #f2f5f4 var(--sound-volume-progress),
          #f2f5f4 100%
        );
      }

      #species-sound .sound-volume-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 18px;
        margin-top: -5px;
        border: 1px solid #7a8581;
        border-radius: 2px;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0,0,0,0.16);
      }

      #species-sound .sound-volume-range::-moz-range-track {
        height: 10px;
        border: 1px solid #9ea9a5;
        border-radius: 2px;
        background: #f2f5f4;
      }

      #species-sound .sound-volume-range::-moz-range-progress {
        height: 10px;
        border-radius: 2px;
        background: #2cc84d;
      }

      #species-sound .sound-volume-range::-moz-range-thumb {
        width: 10px;
        height: 18px;
        border: 1px solid #7a8581;
        border-radius: 2px;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0,0,0,0.16);
      }

      #species-sound .sound-control-value,
      #species-sound .sound-control-label {
        font-size: 0.76rem;
        line-height: 1;
        color: #52615d;
        white-space: nowrap;
      }

      #species-sound .sound-control-value {
        width: 42px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      #species-sound .sound-speed-select {
        height: 28px;
        border: 1px solid #c1ccc8;
        border-radius: 6px;
        background: #fff;
        color: #26332f;
        font: inherit;
        font-size: 0.78rem;
        line-height: 1;
        padding: 2px 24px 2px 8px;
        cursor: pointer;
      }

      #species-sound .sound-speed-control {
        grid-area: speed;
      }

      #species-sound .sound-details {
        border-top: 1px solid #d4dfdb;
        padding: 7px 10px 9px;
        font-size: 0.82rem;
        color: #52615d;
      }

      #species-sound .sound-details summary {
        cursor: pointer;
        font-weight: 700;
        color: #35433f;
      }

      #species-sound .sound-detail-grid {
        display: grid;
        grid-template-columns: 84px minmax(0, 1fr);
        gap: 4px 8px;
        margin-top: 8px;
      }

      #species-sound .sound-detail-label {
        font-weight: 700;
        color: #64716d;
      }

      #species-sound .sound-details a {
        color: #0f5e55;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      #species-sound .sound-audio {
        display: none;
      }

      @media (max-width: 768px) {
        #species-sound .sound-visual {
          height: 96px;
        }

        #species-sound .sound-controls {
          grid-template-columns: 32px minmax(128px, 1fr) auto;
          grid-template-areas:
            "title title title"
            "play volume time"
            "speed speed speed";
          gap: 6px 8px;
          padding: 8px;
        }

        #species-sound #play-toggle.play-toggle {
          width: 32px;
          height: 32px;
          min-width: 32px;
        }

        #species-sound .sound-title {
          margin-left: 40px;
          font-size: 0.88rem;
        }

        #species-sound .sound-control-value {
          width: 38px;
        }

        #species-sound .sound-speed-control {
          justify-self: end;
        }

        #species-sound .sound-detail-grid {
          grid-template-columns: 1fr;
          gap: 2px;
        }
      }
    `;

    document.head.appendChild(style);
  }

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

  function licenseLabel(value) {
    const raw = String(value || "").trim();
    if (!raw) return "Lizenz n/a";

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

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function readStoredNumber(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : Number(value);
    } catch (_) {
      return fallback;
    }
  }

  function writeStoredNumber(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (_) {
      // Local storage can be unavailable in privacy modes. Controls still work for the current page view.
    }
  }

  function getStoredVolumePercent() {
    return Math.round(clampNumber(
      readStoredNumber(VOLUME_STORAGE_KEY, DEFAULT_VOLUME_PERCENT),
      0,
      VOLUME_MAX_PERCENT,
      DEFAULT_VOLUME_PERCENT
    ));
  }

  function getStoredPlaybackRate() {
    const storedRate = clampNumber(
      readStoredNumber(SPEED_STORAGE_KEY, DEFAULT_PLAYBACK_RATE),
      Math.min(...PLAYBACK_RATES),
      Math.max(...PLAYBACK_RATES),
      DEFAULT_PLAYBACK_RATE
    );

    return PLAYBACK_RATES.includes(storedRate) ? storedRate : DEFAULT_PLAYBACK_RATE;
  }

  function formatPlaybackRate(rate) {
    return `${String(rate).replace(".", ",")}x`;
  }

  function renderStatus(message) {
    return `<div class="frame-box species-sound-frame"><i>${escapeHtml(message)}</i></div>`;
  }

  async function headExists(url) {
    try {
      const response = await fetch(url, { method: "HEAD", cache: "no-store" });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  function seedFromString(value) {
    let seed = 2166136261;
    const text = String(value || "sound");
    for (let i = 0; i < text.length; i += 1) {
      seed ^= text.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }
    return seed >>> 0;
  }

  function seededRandom(seed) {
    let state = seed || 1;
    return function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) % 1000) / 1000;
    };
  }

  function fallbackPeaks(seedText) {
    const random = seededRandom(seedFromString(seedText));
    const peaks = [];
    let last = 0.35;

    for (let i = 0; i < WAVEFORM_BARS; i += 1) {
      const envelope = 0.35 + 0.45 * Math.sin((Math.PI * i) / WAVEFORM_BARS);
      const next = Math.max(0.08, Math.min(1, last * 0.55 + random() * 0.65));
      peaks.push(Math.max(0.08, Math.min(1, next * envelope + 0.08)));
      last = next;
    }

    return peaks;
  }

  function buildPeaks(audioBuffer) {
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / WAVEFORM_BARS));
    const peaks = [];
    let maxPeak = 0;

    for (let i = 0; i < WAVEFORM_BARS; i += 1) {
      const start = i * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      let sum = 0;

      for (let j = start; j < end; j += 1) {
        const value = channel[j];
        sum += value * value;
      }

      const rms = Math.sqrt(sum / Math.max(1, end - start));
      peaks.push(rms);
      if (rms > maxPeak) maxPeak = rms;
    }

    if (!maxPeak) return fallbackPeaks(audioBuffer.duration || "empty");

    return peaks.map((peak) => Math.max(0.06, Math.min(1, Math.pow(peak / maxPeak, 0.72))));
  }

  function getCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect.width || canvas.clientWidth || 600)),
      height: Math.max(1, Math.round(rect.height || canvas.clientHeight || 100)),
    };
  }

  function drawWaveform(canvas, peaks, progress) {
    if (!canvas || !peaks || !peaks.length) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const size = getCanvasSize(canvas);
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(size.width * ratio);
    const pixelHeight = Math.round(size.height * ratio);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.save();
    context.scale(ratio, ratio);

    const width = size.width;
    const height = size.height;
    const centerY = height / 2;
    const barGap = width < 420 ? 1 : 2;
    const barWidth = Math.max(1, (width - (peaks.length - 1) * barGap) / peaks.length);
    const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));
    const playedX = width * safeProgress;

    context.fillStyle = "#f7faf9";
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < peaks.length; i += 1) {
      const x = i * (barWidth + barGap);
      const peak = peaks[i];
      const barHeight = Math.max(4, peak * (height - 22));
      const y = centerY - barHeight / 2;
      const color = x + barWidth / 2 <= playedX ? "#0f5e55" : "#424a48";

      context.fillStyle = color;
      context.globalAlpha = x + barWidth / 2 <= playedX ? 0.92 : 0.56;
      const radius = Math.min(3, barWidth / 2);
      context.beginPath();
      if (typeof context.roundRect === "function") {
        context.roundRect(x, y, barWidth, barHeight, radius);
      } else {
        context.rect(x, y, barWidth, barHeight);
      }
      context.fill();
    }

    context.restore();
  }

  async function decodeWaveform(audioUrl, fallbackSeed) {
    try {
      const response = await fetch(audioUrl, { cache: "force-cache" });
      if (!response.ok) return fallbackPeaks(fallbackSeed);

      const arrayBuffer = await response.arrayBuffer();
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return fallbackPeaks(fallbackSeed);

      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const peaks = buildPeaks(audioBuffer);

      if (typeof audioContext.close === "function") {
        audioContext.close().catch(() => {});
      }

      return peaks;
    } catch (_) {
      return fallbackPeaks(fallbackSeed);
    }
  }

  function buildCreditDetails(credits) {
    if (!credits) {
      return `
        <details class="sound-details">
          <summary>Quelle</summary>
          <div class="sound-detail-grid">
            <span class="sound-detail-label">Quelle</span>
            <span>n/a</span>
          </div>
        </details>
      `;
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

    const licenseHtml = licenseUrl.startsWith("http")
      ? `<a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(licenseText)}</a>`
      : escapeHtml(licenseText);

    return `
      <details class="sound-details">
        <summary>Quelle und Lizenz</summary>
        <div class="sound-detail-grid">
          <span class="sound-detail-label">Quelle</span>
          <span>${escapeHtml(source)}</span>
          ${recordist ? `
            <span class="sound-detail-label">Aufnahme</span>
            <span>${escapeHtml(recordist)}</span>
          ` : ""}
          ${location ? `
            <span class="sound-detail-label">Ort</span>
            <span>${escapeHtml(location)}</span>
          ` : ""}
          ${quality ? `
            <span class="sound-detail-label">Qualitaet</span>
            <span>${escapeHtml(quality)}</span>
          ` : ""}
          <span class="sound-detail-label">Lizenz</span>
          <span>${licenseHtml}</span>
          ${sourceUrl ? `
            <span class="sound-detail-label">Original</span>
            <span><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">oeffnen</a></span>
          ` : ""}
        </div>
      </details>
    `;
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

  function updateCursor(cursorEl, rangeEl, progress) {
    const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));
    cursorEl.style.left = `${safeProgress * 100}%`;
    rangeEl.value = String(safeProgress * 100);
    rangeEl.setAttribute("aria-valuenow", String(Math.round(safeProgress * 100)));
  }

  const wrapper = document.getElementById("species-sound");
  if (!wrapper) return;

  injectStyles();

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
    const spectrogramUrl = `${ASSET_BASE}/sounds/${encodedName}/spectrogram.webp`;
    const audioExists = await headExists(audioUrl);

    if (!audioExists) {
      wrapper.innerHTML = renderStatus("Keine Tierstimme verfuegbar.");
      return;
    }

    const spectrogramExists = await headExists(spectrogramUrl);
    const credits = await fetchCredits(creditsUrl);
    const creditDetails = buildCreditDetails(credits);
    const fallbackPeaksData = fallbackPeaks(soundAssetName);
    const initialVolumePercent = getStoredVolumePercent();
    const initialPlaybackRate = getStoredPlaybackRate();
    const speedOptionsHtml = PLAYBACK_RATES.map((rate) => `
      <option value="${rate}"${rate === initialPlaybackRate ? " selected" : ""}>${formatPlaybackRate(rate)}</option>
    `).join("");

    wrapper.innerHTML = `
      <div class="frame-box species-sound-frame">
        <div class="sound-player" aria-label="Tierstimmen-Player">
          <div class="sound-visual${spectrogramExists ? " has-spectrogram" : ""}">
            ${spectrogramExists ? `
              <img
                id="sound-spectrogram"
                class="sound-spectrogram-image"
                src="${escapeHtml(spectrogramUrl)}"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              >
            ` : ""}
            <canvas id="sound-wave-canvas" class="sound-wave-canvas" aria-hidden="true"></canvas>
            <div id="sound-cursor" class="sound-cursor" aria-hidden="true"></div>
            <input
              id="sound-scrubber"
              class="sound-scrubber"
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
          </div>

          <div class="sound-controls">
            <div class="sound-title">Tierstimme</div>

            <button id="play-toggle" class="play-toggle" type="button" aria-label="Tierstimme abspielen" aria-pressed="false">
              <span class="sound-icon sound-icon-play" aria-hidden="true"></span>
            </button>

            <div class="sound-volume-control">
              <button
                id="sound-mute-toggle"
                class="sound-mute-toggle"
                type="button"
                aria-label="Stummschalten"
                aria-pressed="false"
              >
                <svg class="sound-volume-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M4 9.5v5h3.2L12 18.4V5.6L7.2 9.5H4z"></path>
                  <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M15 8.5c1 1 1.5 2.2 1.5 3.5S16 14.5 15 15.5"></path>
                  <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M17.5 6c1.7 1.7 2.6 3.7 2.6 6s-.9 4.3-2.6 6"></path>
                </svg>
              </button>
              <input
                id="sound-volume"
                class="sound-volume-range"
                type="range"
                min="0"
                max="${VOLUME_MAX_PERCENT}"
                value="${initialVolumePercent}"
                step="1"
                aria-label="Lautstaerke"
                aria-valuemin="0"
                aria-valuemax="${VOLUME_MAX_PERCENT}"
                aria-valuenow="${initialVolumePercent}"
              >
              <span id="sound-volume-value" class="sound-control-value">${initialVolumePercent}%</span>
            </div>

            <div class="sound-time">
              <span id="current-time">0:00</span> / <span id="duration">0:00</span>
            </div>

            <label class="sound-speed-control" for="sound-speed">
              <span class="sound-control-label">Tempo</span>
              <select id="sound-speed" class="sound-speed-select" aria-label="Abspielgeschwindigkeit">
                ${speedOptionsHtml}
              </select>
            </label>
          </div>

          ${creditDetails}
        </div>

        <audio id="species-audio" class="sound-audio" crossorigin="anonymous" preload="metadata" src="${escapeHtml(audioUrl)}"></audio>
      </div>
    `;

    const audio = wrapper.querySelector("#species-audio");
    const playBtn = wrapper.querySelector("#play-toggle");
    const scrubberEl = wrapper.querySelector("#sound-scrubber");
    const visualEl = wrapper.querySelector(".sound-visual");
    const spectrogramImg = wrapper.querySelector("#sound-spectrogram");
    const canvas = wrapper.querySelector("#sound-wave-canvas");
    const cursorEl = wrapper.querySelector("#sound-cursor");
    const currentTimeEl = wrapper.querySelector("#current-time");
    const durationEl = wrapper.querySelector("#duration");
    const volumeEl = wrapper.querySelector("#sound-volume");
    const volumeValueEl = wrapper.querySelector("#sound-volume-value");
    const muteBtn = wrapper.querySelector("#sound-mute-toggle");
    const speedEl = wrapper.querySelector("#sound-speed");

    if (
      !audio ||
      !playBtn ||
      !scrubberEl ||
      !visualEl ||
      !canvas ||
      !cursorEl ||
      !currentTimeEl ||
      !durationEl ||
      !volumeEl ||
      !volumeValueEl ||
      !muteBtn ||
      !speedEl
    ) {
      wrapper.innerHTML = renderStatus("Tierstimme aktuell nicht verfuegbar.");
      return;
    }

    let peaks = fallbackPeaksData;
    let useSpectrogram = Boolean(spectrogramExists && spectrogramImg);
    let waveformDecodeStarted = false;
    let currentVolumePercent = initialVolumePercent;
    let audioContext = null;
    let mediaSourceNode = null;
    let gainNode = null;
    let audioGraphDisabled = false;
    let animationFrameId = 0;
    let lastRenderedTimeText = "";
    let volumeBeforeMute = initialVolumePercent > 0 ? initialVolumePercent : DEFAULT_VOLUME_PERCENT;

    function ensureAudioGraph() {
      if (gainNode) return true;
      if (audioGraphDisabled) return false;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        audioGraphDisabled = true;
        return false;
      }

      try {
        audioContext = new AudioContext();
        mediaSourceNode = audioContext.createMediaElementSource(audio);
        gainNode = audioContext.createGain();
        mediaSourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        return true;
      } catch (_) {
        audioGraphDisabled = true;
        gainNode = null;
        mediaSourceNode = null;
        audioContext = null;
        return false;
      }
    }

    async function resumeAudioGraph() {
      if (!audioContext || audioContext.state !== "suspended") return;
      try {
        await audioContext.resume();
      } catch (_) {
        // If resuming fails, native playback still decides whether the browser allows audio output.
      }
    }

    function shouldUseAudioGraph(percent) {
      return Number(percent) > 100;
    }

    function updateVolumeUi(percent) {
      const fillPercent = (percent / VOLUME_MAX_PERCENT) * 100;
      volumeEl.value = String(percent);
      volumeEl.style.setProperty("--sound-volume-progress", `${fillPercent}%`);
      volumeEl.setAttribute("aria-valuenow", String(percent));
      volumeValueEl.textContent = `${percent}%`;
    }

    function updateMuteUi(isMuted) {
      muteBtn.classList.toggle("is-muted", isMuted);
      muteBtn.setAttribute("aria-pressed", isMuted ? "true" : "false");
      muteBtn.setAttribute("aria-label", isMuted ? "Lautstaerke wiederherstellen" : "Stummschalten");
    }

    function setVolumePercent(percent, options = {}) {
      const safePercent = Math.round(clampNumber(percent, 0, VOLUME_MAX_PERCENT, DEFAULT_VOLUME_PERCENT));
      const gainValue = safePercent / 100;
      currentVolumePercent = safePercent;
      updateVolumeUi(safePercent);
      updateMuteUi(safePercent === 0);

      if (safePercent > 0 && options.remember !== false) {
        volumeBeforeMute = safePercent;
      }

      if ((gainNode || (options.activateGraph && shouldUseAudioGraph(safePercent))) && ensureAudioGraph()) {
        audio.volume = 1;
        if (typeof gainNode.gain.setTargetAtTime === "function") {
          gainNode.gain.setTargetAtTime(gainValue, audioContext.currentTime, 0.01);
        } else {
          gainNode.gain.value = gainValue;
        }
      } else {
        audio.volume = Math.min(1, gainValue);
      }

      if (options.persist) writeStoredNumber(VOLUME_STORAGE_KEY, safePercent);
    }

    function setPlaybackRate(rate, persist) {
      const safeRate = PLAYBACK_RATES.includes(Number(rate)) ? Number(rate) : DEFAULT_PLAYBACK_RATE;
      audio.defaultPlaybackRate = safeRate;
      audio.playbackRate = safeRate;
      speedEl.value = String(safeRate);

      if (persist) writeStoredNumber(SPEED_STORAGE_KEY, safeRate);
    }

    function currentProgress() {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) return 0;
      return audio.currentTime / duration;
    }

    function redraw() {
      const progress = currentProgress();
      if (!useSpectrogram) drawWaveform(canvas, peaks, progress);
      updateCursor(cursorEl, scrubberEl, progress);
    }

    function ensureWaveformDecoded() {
      if (waveformDecodeStarted) return;
      waveformDecodeStarted = true;

      decodeWaveform(audioUrl, soundAssetName).then((decodedPeaks) => {
        peaks = decodedPeaks;
        redraw();
      });
    }

    function setPlaying(isPlaying) {
      playBtn.innerHTML = isPlaying
        ? `<span class="sound-icon sound-icon-pause" aria-hidden="true"></span>`
        : `<span class="sound-icon sound-icon-play" aria-hidden="true"></span>`;
      playBtn.setAttribute("aria-label", isPlaying ? "Tierstimme pausieren" : "Tierstimme abspielen");
      playBtn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
    }

    function updateProgressText() {
      const currentText = formatTime(audio.currentTime);
      const durationText = formatTime(audio.duration);
      const textKey = `${currentText}|${durationText}`;

      if (textKey === lastRenderedTimeText) return;

      currentTimeEl.textContent = currentText;
      durationEl.textContent = durationText;
      lastRenderedTimeText = textKey;
    }

    function updateProgress() {
      updateProgressText();
      redraw();
    }

    function stopProgressAnimation() {
      if (!animationFrameId) return;
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }

    function startProgressAnimation() {
      stopProgressAnimation();

      const tick = () => {
        updateProgress();

        if (!audio.paused && !audio.ended) {
          animationFrameId = window.requestAnimationFrame(tick);
        } else {
          animationFrameId = 0;
        }
      };

      animationFrameId = window.requestAnimationFrame(tick);
    }

    playBtn.addEventListener("click", async () => {
      try {
        if (audio.paused) {
          setVolumePercent(currentVolumePercent, { activateGraph: shouldUseAudioGraph(currentVolumePercent) });
          await resumeAudioGraph();
          await audio.play();
        } else {
          audio.pause();
        }
      } catch (_) {
        wrapper.innerHTML = `
          <div class="frame-box species-sound-frame">
            <i>Wiedergabe wurde vom Browser blockiert.</i>
            ${creditDetails}
          </div>
        `;
      }
    });

    scrubberEl.addEventListener("input", () => {
      const duration = audio.duration;
      const value = Number(scrubberEl.value);
      const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 0;

      if (Number.isFinite(duration) && duration > 0) {
        audio.currentTime = duration * progress;
      }

      if (!useSpectrogram) drawWaveform(canvas, peaks, progress);
      updateCursor(cursorEl, scrubberEl, progress);
      updateProgressText();
    });

    volumeEl.addEventListener("input", () => {
      const nextVolume = Number(volumeEl.value);
      setVolumePercent(nextVolume, { activateGraph: shouldUseAudioGraph(nextVolume), persist: true });
    });

    muteBtn.addEventListener("click", () => {
      if (currentVolumePercent > 0) {
        volumeBeforeMute = currentVolumePercent;
        setVolumePercent(0, { remember: false });
        return;
      }

      const restoredVolume = volumeBeforeMute > 0 ? volumeBeforeMute : DEFAULT_VOLUME_PERCENT;
      setVolumePercent(restoredVolume, {
        activateGraph: shouldUseAudioGraph(restoredVolume),
        persist: true,
      });
    });

    speedEl.addEventListener("change", () => {
      setPlaybackRate(speedEl.value, true);
    });

    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("durationchange", updateProgress);
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("play", () => {
      setPlaying(true);
      startProgressAnimation();
    });
    audio.addEventListener("pause", () => {
      setPlaying(false);
      stopProgressAnimation();
      updateProgress();
    });
    audio.addEventListener("ended", () => {
      setPlaying(false);
      stopProgressAnimation();
      audio.currentTime = 0;
      updateProgress();
    });
    audio.addEventListener("error", () => {
      wrapper.innerHTML = `
        <div class="frame-box species-sound-frame">
          <i>Tierstimme aktuell nicht verfuegbar.</i>
          ${creditDetails}
        </div>
      `;
    });

    if (window.ResizeObserver) {
      const resizeObserver = new window.ResizeObserver(redraw);
      resizeObserver.observe(visualEl);
    } else {
      window.addEventListener("resize", redraw);
    }

    if (spectrogramImg) {
      spectrogramImg.addEventListener("error", () => {
        useSpectrogram = false;
        visualEl.classList.remove("has-spectrogram");
        ensureWaveformDecoded();
        redraw();
      });
    }

    redraw();
    setVolumePercent(initialVolumePercent);
    setPlaybackRate(initialPlaybackRate, false);
    if (!useSpectrogram) ensureWaveformDecoded();
  } catch (_) {
    wrapper.innerHTML = renderStatus("Tierstimme aktuell nicht verfuegbar.");
  }
})();
