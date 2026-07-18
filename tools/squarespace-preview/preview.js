(function () {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get("embed") === "1";
  const fallbackSlug = "turdusmerula";
  let speciesListPromise = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function currentSlug() {
    return params.get("species") || fallbackSlug;
  }

  async function getSpeciesList() {
    if (!speciesListPromise) {
      speciesListPromise = fetch("/speciesData.json", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Lokale Artendaten konnten nicht geladen werden");
          return response.json();
        })
        .then((data) => {
          if (!Array.isArray(data)) throw new Error("Lokale Artendaten sind ungültig");
          return data;
        });
    }
    return speciesListPromise;
  }

  async function getSpeciesData(slug = currentSlug()) {
    const species = (await getSpeciesList()).find((entry) => entry.URLSlug === slug);
    if (!species) throw new Error("Art wurde in der lokalen Datenbank nicht gefunden");
    return species;
  }

  window.SpeciesCore = {
    getCurrentSlug: currentSlug,
    getSpeciesList,
    getSpeciesData,
  };

  function embeddedUrl(slug) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("embed", "1");
    url.searchParams.set("species", slug || currentSlug());
    url.searchParams.set("reload", Date.now().toString());
    return url;
  }

  async function initializeControls() {
    document.documentElement.dataset.previewMode = "controls";
    const select = document.getElementById("preview-species");
    const frame = document.getElementById("preview-frame");
    const reloadButton = document.getElementById("preview-reload");
    const newWindowLink = document.getElementById("preview-new-window");
    const widthButtons = [...document.querySelectorAll("[data-preview-width]")];
    const speciesList = await getSpeciesList();

    select.innerHTML = speciesList
      .slice()
      .sort((left, right) => left["Deutscher Name"].localeCompare(right["Deutscher Name"], "de"))
      .map((entry) => (
        `<option value="${escapeHtml(entry.URLSlug)}">${escapeHtml(entry["Deutscher Name"])} · ${escapeHtml(entry["Wissenschaftlicher Name"])}</option>`
      ))
      .join("");
    select.value = currentSlug();

    function loadPreview() {
      const url = embeddedUrl(select.value);
      frame.src = url.href;
      newWindowLink.href = url.href;
    }

    select.addEventListener("change", loadPreview);
    reloadButton.addEventListener("click", loadPreview);
    widthButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const width = Number(button.dataset.previewWidth);
        frame.style.width = `${width}px`;
        widthButtons.forEach((entry) => entry.setAttribute(
          "aria-pressed",
          entry === button ? "true" : "false",
        ));
      });
    });
    widthButtons[0]?.click();
    loadPreview();
  }

  function renderPlaceholder(container, title, rows) {
    container.innerHTML = `
      <div class="frame-box preview-placeholder-frame">
        <h2>${escapeHtml(title)}</h2>
        <dl>
          ${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}
        </dl>
      </div>
    `;
  }

  async function initializeCanvas() {
    document.documentElement.dataset.previewMode = "canvas";
    const species = await getSpeciesData();
    document.title = `${species["Deutscher Name"]} · lokale Taxonomie-Vorschau`;
    document.getElementById("preview-species-title").textContent = species["Deutscher Name"];
    document.getElementById("preview-species-scientific").textContent = species["Wissenschaftlicher Name"];
    renderPlaceholder(document.getElementById("species-info"), "Allgemeine Daten", [
      ["Größe", species.Größe],
      ["Gewicht", species.Gewicht],
      ["Lebenserwartung", species.Lebenserwartung],
    ]);
    renderPlaceholder(document.getElementById("species-status"), "IUCN-Daten", [
      ["Kategorie", species.Kategorie],
      ["Trend", species.Trend],
      ["Population", species.Populationgröße],
    ]);

    const taxonomyScript = document.createElement("script");
    taxonomyScript.src = `/species-taxonomy.js?preview=${Date.now()}`;
    document.body.appendChild(taxonomyScript);
  }

  (embedded ? initializeCanvas() : initializeControls()).catch((error) => {
    document.body.innerHTML = `<main class="preview-canvas"><p class="frame-box">${escapeHtml(error.message)}</p></main>`;
  });
})();
