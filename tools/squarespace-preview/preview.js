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

  function sanitizeAssetName(input) {
    return String(input ?? "")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae")
      .replace(/Ö/g, "Oe")
      .replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\/\\:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[.\s_-]+|[.\s_-]+$/g, "") || "unknown";
  }

  function getSpeciesAssetPaths(dataOrName) {
    const name = typeof dataOrName === "string"
      ? dataOrName
      : dataOrName?.["Deutscher Name"] || dataOrName?.["Wissenschaftlicher Name"] || "";
    const safeName = sanitizeAssetName(name);
    return {
      safeName,
      portrait: `/species-assets/${encodeURIComponent(safeName)}/portrait.webp`,
    };
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
    return params.get("subphylum") === "1"
      ? { ...species, Subphylum: species.Subphylum || "Vertebrata" }
      : species;
  }

  window.SpeciesCore = {
    getCurrentSlug: currentSlug,
    sanitizeAssetName,
    getSpeciesAssetPaths,
    getSpeciesList,
    getSpeciesData,
  };

  function embeddedUrl(slug, simulateSubphylum = false) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("embed", "1");
    url.searchParams.set("species", slug || currentSlug());
    if (simulateSubphylum) url.searchParams.set("subphylum", "1");
    url.searchParams.set("reload", Date.now().toString());
    return url;
  }

  async function initializeControls() {
    document.documentElement.dataset.previewMode = "controls";
    const select = document.getElementById("preview-species");
    const frame = document.getElementById("preview-frame");
    const reloadButton = document.getElementById("preview-reload");
    const newWindowLink = document.getElementById("preview-new-window");
    const subphylumCheckbox = document.getElementById("preview-subphylum");
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
      const url = embeddedUrl(select.value, subphylumCheckbox.checked);
      frame.src = url.href;
      newWindowLink.href = url.href;
    }

    select.addEventListener("change", loadPreview);
    subphylumCheckbox.addEventListener("change", loadPreview);
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

  function loadModule(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${source}?preview=${Date.now()}`;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`Vorschaumodul fehlt: ${source}`)), {
        once: true,
      });
      document.body.appendChild(script);
    });
  }

  async function initializeCanvas() {
    document.documentElement.dataset.previewMode = "canvas";
    const species = await getSpeciesData();
    document.title = `${species["Deutscher Name"]} · lokale Taxonomie-Vorschau`;
    document.getElementById("preview-species-title").textContent = species["Deutscher Name"];
    document.getElementById("preview-species-scientific").textContent = species["Wissenschaftlicher Name"];
    await loadModule("/species-info.js");
    await loadModule("/species-status.js");
    await loadModule("/species-taxonomy.js");
    await loadModule("/species-portrait.js");
  }

  (embedded ? initializeCanvas() : initializeControls()).catch((error) => {
    document.body.innerHTML = `<main class="preview-canvas"><p class="frame-box">${escapeHtml(error.message)}</p></main>`;
  });
})();
