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
      <div class="frame-box" style="background:#d0d0d0">
        <b>Tierstimme</b>
        <audio controls preload="none" style="width:100%">
          <source src="${url}" type="audio/mpeg">
        </audio>
      </div>
    `;
  } catch (e) {
    wrapper.innerHTML = `<p>${e.message}</p>`;
  }
})();