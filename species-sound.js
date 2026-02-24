(async function () {
  function sanitizeAssetName(input) {
    return String(input ?? "")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae")
      .replace(/Ö/g, "Oe")
      .replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .replace(/æ/g, "ae")
      .replace(/Æ/g, "Ae")
      .replace(/œ/g, "oe")
      .replace(/Œ/g, "Oe")
      .replace(/ø/g, "o")
      .replace(/Ø/g, "O")
      .replace(/å/g, "a")
      .replace(/Å/g, "A")
      .replace(/ð/g, "d")
      .replace(/Ð/g, "D")
      .replace(/þ/g, "th")
      .replace(/Þ/g, "Th")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .replace(/&/g, " and ")
      .replace(/@/g, " at ")
      .replace(/\+/g, " plus ")
      .replace(/[’‘‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[–—−]/g, "-")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\/\\:*?"<>|]/g, "_")
      .replace(/[\x00-\x1F\x7F]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/_+/g, "_")
      .trim()
      .replace(/^[.\s_-]+|[.\s_-]+$/g, "") || "unknown";
  }

  function normalizeUrl(u) {
    if (!u) return "";
    // erlaubt //creativecommons... aus deinen bestehenden credits
    if (u.startsWith("//")) return "https:" + u;
    return u;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const wrapper = document.getElementById("species-sound");
  if (!wrapper) return;

  try {
    const d = await window.SpeciesCore.getSpeciesData();
    const name = d["Deutscher Name"];
    const soundAssetName = sanitizeAssetName(name);

    const base = "https://felixkfm90.github.io/iucn-species-data";
    const audioUrl = `${base}/sounds/${encodeURIComponent(soundAssetName)}/${encodeURIComponent(soundAssetName)}.mp3`;
    const creditsUrl = `${base}/sounds/${encodeURIComponent(soundAssetName)}/credits.json`;

    // schneller Check
    const check = await fetch(audioUrl, { method: "HEAD" });
    if (!check.ok) {
      wrapper.innerHTML = `<div class="frame-box"><i>Keine Tierstimme verfügbar</i></div>`;
      return;
    }

    // Credits laden (best-effort)
    let creditsHtml = `
      <div style="font-size:0.85em; color:#666; margin-top:10px; line-height:1.4;">
        <div><b>Quelle:</b> n/a</div>
      </div>
    `;

    try {
      const cRes = await fetch(creditsUrl, { cache: "no-store" });
      if (cRes.ok) {
        const c = await cRes.json();

        const source = c.source || "n/a";
        const rec = c.recordist || c.rec || c.recorded_by || c.author || "";
        const licRaw = c.license || c.lic || "";
        const srcRaw = c.url || c.source_url || c.xc_url || "";
        const lic = normalizeUrl(licRaw);
        const src = normalizeUrl(srcRaw);

        const licenseHtml = lic
          ? (lic.startsWith("http")
              ? `<a href="${escapeHtml(lic)}" target="_blank" rel="noopener">${escapeHtml(licRaw)}</a>`
              : `${escapeHtml(licRaw)}`)
          : "";

        creditsHtml = `
          <div style="font-size:0.85em; color:#666; margin-top:10px; line-height:1.4;">
            <div><b>Quelle:</b> ${escapeHtml(source)}</div>
            ${rec ? `<div><b>Aufnahme:</b> ${escapeHtml(rec)}</div>` : ``}
            ${licenseHtml ? `<div><b>Lizenz:</b> ${licenseHtml}</div>` : ``}
            ${src ? `<div><a href="${escapeHtml(src)}" target="_blank" rel="noopener">Quelle öffnen (${escapeHtml(source)})</a></div>` : ``}
          </div>
        `;
      }
    } catch (_) {
      // Credits optional – Sound soll trotzdem laufen
    }

    // UI
    wrapper.innerHTML = `
      <div class="frame-box species-sound-frame">
        <b>Tierstimme</b>

        <div class="wave-wrapper">
          <div id="play-toggle" class="play-toggle">▶</div>
          <div id="species-waveform" class="species-waveform"></div>
        </div>

        <div class="wave-meta">
          <span id="current-time" class="current-time">0:00</span>
          <span id="duration" class="duration">0:00</span>
        </div>

        ${creditsHtml}
      </div>
    `;

    // WaveSurfer verfügbar?
    if (typeof window.WaveSurfer === "undefined") {
      const box = wrapper.querySelector(".species-sound-frame");
      if (box) {
        box.insertAdjacentHTML(
          "beforeend",
          `<div style="margin-top:10px; font-size:0.9em; color:#a00;"><i>Audio-Player konnte nicht geladen werden (WaveSurfer fehlt).</i></div>`
        );
      }
      return;
    }

    const waveformEl = wrapper.querySelector("#species-waveform, .species-waveform");
    const playBtn = wrapper.querySelector("#play-toggle, .play-toggle");
    const curEl = wrapper.querySelector("#current-time, .current-time");
    const durEl = wrapper.querySelector("#duration, .duration");
    if (!waveformEl || !playBtn || !curEl || !durEl) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformEl,
      waveColor: "#9b9b9b",
      progressColor: "#2b2b2b",
      cursorColor: "#cc0000",
      height: 90,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      responsive: true,
    });

    function formatTime(sec) {
      sec = Math.floor(sec);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    }

    wavesurfer.on("error", () => {
      wrapper.innerHTML = `
        <div class="frame-box">
          <i>Tierstimme aktuell nicht verfügbar.</i>
          ${creditsHtml}
        </div>
      `;
    });

    wavesurfer.load(audioUrl);

    playBtn.onclick = () => wavesurfer.playPause();
    waveformEl.onclick = () => wavesurfer.playPause();

    wavesurfer.on("play", () => (playBtn.textContent = "❚❚"));
    wavesurfer.on("pause", () => (playBtn.textContent = "▶"));

    wavesurfer.on("ready", () => {
      durEl.textContent = formatTime(wavesurfer.getDuration());
    });

    wavesurfer.on("audioprocess", () => {
      curEl.textContent = formatTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on("seek", () => {
      curEl.textContent = formatTime(wavesurfer.getCurrentTime());
    });

    waveformEl.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const zoom = wavesurfer.params.minPxPerSec || 50;
        wavesurfer.zoom(Math.min(300, Math.max(30, zoom + e.deltaY * -0.1)));
      },
      { passive: false }
    );
  } catch (e) {
    wrapper.innerHTML = `<div class="frame-box"><i>Tierstimme aktuell nicht verfügbar.</i></div>`;
  }
})();