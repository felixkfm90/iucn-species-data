(async function () {
  const wrapper = document.getElementById("species-sound");
  if (!wrapper) return;

  try {
    const d = await window.SpeciesCore.getSpeciesData();
    const name = d["Deutscher Name"];
    const url = `https://raw.githubusercontent.com/felixkfm90/iucn-species-data/main/sounds/${encodeURIComponent(name)}/${encodeURIComponent(name)}.mp3`;

    const check = await fetch(url, { method: "HEAD" });
    if (!check.ok) {
      wrapper.innerHTML = `<div class="frame-box"><i>Keine Tierstimme verfügbar</i></div>`;
      return;
    }

    wrapper.innerHTML = `
      <div class="frame-box species-sound-frame">
        <b>Tierstimme</b>

        <div class="wave-wrapper">
          <div id="play-toggle">▶</div>
          <div id="species-waveform"></div>
        </div>

        <div class="wave-meta">
          <span id="current-time">0:00</span>
          <span id="duration">0:00</span>
        </div>
      </div>
    `;

    const waveformEl = document.getElementById("species-waveform");
    const playBtn = document.getElementById("play-toggle");
    const curEl = document.getElementById("current-time");
    const durEl = document.getElementById("duration");

    const wavesurfer = WaveSurfer.create({
      container: waveformEl,
      waveColor: '#9b9b9b',
      progressColor: '#2b2b2b',
      cursorColor: '#cc0000',
      height: 90,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      responsive: true
    });

    wavesurfer.load(url);

    playBtn.onclick = () => wavesurfer.playPause();
    waveformEl.onclick = () => wavesurfer.playPause();

    wavesurfer.on('play', () => playBtn.textContent = '❚❚');
    wavesurfer.on('pause', () => playBtn.textContent = '▶');

    wavesurfer.on('ready', () => {
      durEl.textContent = formatTime(wavesurfer.getDuration());
    });

    wavesurfer.on('audioprocess', () => {
      curEl.textContent = formatTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('seek', () => {
      curEl.textContent = formatTime(wavesurfer.getCurrentTime());
    });

    // Zoom via Mausrad / Touch
    waveformEl.addEventListener('wheel', e => {
      e.preventDefault();
      const zoom = wavesurfer.params.minPxPerSec || 50;
      wavesurfer.zoom(Math.min(300, Math.max(30, zoom + e.deltaY * -0.1)));
    });

    function formatTime(sec) {
      sec = Math.floor(sec);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

  } catch (e) {
    wrapper.innerHTML = `<p>${e.message}</p>`;
  }
})();