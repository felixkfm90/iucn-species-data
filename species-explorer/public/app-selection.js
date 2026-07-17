(function initializeSpeciesExplorerSelection(global) {
  "use strict";

  function createSpeciesSelectionController({
    state,
    elements,
    windowRef = global,
    documentRef = global.document,
    URLClass = global.URL,
    renderDetail,
    resetScrollableToTop,
    requestFrame = global.requestAnimationFrame?.bind(global),
  } = {}) {
    if (!state || typeof state !== "object") {
      throw new TypeError("Artauswahl benötigt einen Explorer-Zustand.");
    }
    if (!elements?.speciesList || !elements?.detailPanel) {
      throw new TypeError("Artauswahl benötigt Artenliste und Detailbereich.");
    }
    if (typeof URLClass !== "function") {
      throw new TypeError("Artauswahl benötigt eine URL-Implementierung.");
    }
    if (typeof renderDetail !== "function" || typeof resetScrollableToTop !== "function") {
      throw new TypeError("Artauswahl benötigt Detailanzeige und Scrollsteuerung.");
    }

    function selectSpecies(id) {
      const species = state.species.find((entry) => entry.id === id);
      if (!species) return false;
      const scrollPosition = { left: windowRef.scrollX, top: windowRef.scrollY };
      state.selectedId = id;
      const nextUrl = new URLClass(windowRef.location.href);
      nextUrl.searchParams.set("species", id);
      windowRef.history.replaceState(null, "", nextUrl);
      for (const item of elements.speciesList.querySelectorAll(".species-item")) {
        const active = item.dataset.id === id;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      }
      renderDetail(species);
      resetScrollableToTop(elements.detailPanel);
      windowRef.scrollTo(scrollPosition);
      requestFrame?.(() => windowRef.scrollTo(scrollPosition));
      return true;
    }

    function hasOpenDialog() {
      return Boolean(documentRef?.querySelector?.("dialog[open]"));
    }

    return Object.freeze({ selectSpecies, hasOpenDialog });
  }

  global.SpeciesExplorerSelection = Object.freeze({
    createSpeciesSelectionController,
  });
})(typeof window !== "undefined" ? window : globalThis);
