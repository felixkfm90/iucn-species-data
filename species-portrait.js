(async function initializeSpeciesPortrait() {
  "use strict";

  const output = document.getElementById("species-output");
  if (!output || !window.SpeciesCore) return;

  const soundContainer = document.getElementById("species-sound");
  if (soundContainer) {
    if (soundContainer.parentElement !== output) output.appendChild(soundContainer);
    output.classList.add("species-output--has-sound");
  }

  let container = document.getElementById("species-portrait");
  if (!container) {
    container = document.createElement("div");
    container.id = "species-portrait";
    output.appendChild(container);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function hidePortrait() {
    container.hidden = true;
    container.innerHTML = "";
    output.classList.remove("species-output--has-portrait");
  }

  try {
    const species = await window.SpeciesCore.getSpeciesData();
    const paths = window.SpeciesCore.getSpeciesAssetPaths(species);
    const speciesName = escapeHtml(species["Deutscher Name"] || species["Wissenschaftlicher Name"]);
    const portraitUrl = escapeHtml(paths.portrait);

    container.hidden = false;
    container.innerHTML = `
      <figure class="frame-box species-portrait-frame">
        <div class="species-portrait-media">
          <img
            class="species-portrait-image"
            src="${portraitUrl}"
            alt="Artporträt – ${speciesName}"
            loading="eager"
            decoding="async"
          >
        </div>
      </figure>
    `;
    output.classList.add("species-output--has-portrait");

    container.querySelector(".species-portrait-image")?.addEventListener("error", hidePortrait, {
      once: true,
    });
  } catch {
    hidePortrait();
  }
})();
