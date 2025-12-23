(async function () {
  const wrapper = document.getElementById("species-sound");
  if (!wrapper) return;

  try {
    const d = await window.SpeciesCore.getSpeciesData();
    const name = d["Deutscher Name"];
    const url = `https://raw.githubusercontent.com/felixkfm90/iucn-species-data/main/sounds/${encodeURIComponent(name)}/${encodeURIComponent(name)}.mp3`;

    // Existenz prüfen
    const check = await fetch(url, { method: "HEAD" });
    if (!check.ok) {
      wrapper.innerHTML = `
        <div class="frame-box">
          <i>Keine Tierstimme verfügbar</i>
        </div>`;
      return;
    }

    // HTML-Gerüst
    wrapper.innerHTML = `
      <div class="frame-box species-sound-frame">
        <b>Tierstimme</b>
        <div id="species-waveform"></div>
      </div>
    `;

    const waveformEl = document.getElementById("species-waveform");

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

    // Klick = Play / Pause (wie xeno-canto)
    waveformEl.addEventListener("click", () => {
      wavesurfer.playPause();
    });

  } catch (e) {
    wrapper.innerHTML = `<p>${e.message}</p>`;
  }
})();
