(function initializeSpeciesExplorerSelection(global) {
  "use strict";

  function createListboxNavigationController({
    list,
    optionSelector = '[role="option"]',
    onNavigate = () => {},
    isEnabled = () => !list.hidden,
  } = {}) {
    if (!list?.querySelectorAll || typeof onNavigate !== "function") {
      throw new TypeError("Listennavigation benötigt eine Liste und Auswahlfunktion.");
    }
    const options = () => Array.from(list.querySelectorAll(optionSelector)).filter((item) => (
      !item.hidden && !item.disabled && item.getAttribute("aria-disabled") !== "true"
    ));

    const refresh = () => {
      const items = options();
      const selected = items.find((item) => item.getAttribute("aria-selected") === "true");
      const entry = selected || items[0];
      for (const item of items) item.tabIndex = item === entry ? 0 : -1;
    };

    const selectOption = (selected, { focus = false } = {}) => {
      const items = options();
      if (!items.includes(selected)) return false;
      for (const item of items) {
        item.setAttribute("aria-selected", String(item === selected));
        item.tabIndex = item === selected ? 0 : -1;
      }
      if (focus) {
        selected.focus?.({ preventScroll: true });
        selected.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
      return true;
    };

    list.addEventListener?.("keydown", (event) => {
      if (!isEnabled() || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
          || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const items = options();
      if (!items.length) return;
      const target = items.includes(event.target) ? event.target : event.target?.closest?.(optionSelector);
      let index = items.indexOf(target);
      if (index < 0) index = items.findIndex((item) => item.getAttribute("aria-selected") === "true");
      const next = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : event.key === "ArrowDown" ? Math.min(index + 1, items.length - 1)
            : Math.max(index < 0 ? items.length - 1 : index - 1, 0);
      event.preventDefault();
      const selected = items[next];
      selectOption(selected, { focus: true });
      onNavigate(selected);
    });
    list.addEventListener?.("focusin", (event) => {
      const items = options();
      const target = items.includes(event.target) ? event.target : event.target?.closest?.(optionSelector);
      if (items.includes(target)) {
        for (const item of items) item.tabIndex = item === target ? 0 : -1;
      }
    });
    refresh();
    return Object.freeze({ refresh, selectOption });
  }

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

    const listbox = createListboxNavigationController({
      list: elements.speciesList,
      optionSelector: ".species-item",
      isEnabled: () => !hasOpenDialog(),
      onNavigate: (item) => selectSpecies(item.dataset.id),
    });

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
      listbox.refresh();
      renderDetail(species);
      resetScrollableToTop(elements.detailPanel);
      windowRef.scrollTo(scrollPosition);
      requestFrame?.(() => windowRef.scrollTo(scrollPosition));
      return true;
    }

    function hasOpenDialog() {
      return Boolean(documentRef?.querySelector?.("dialog[open]"));
    }

    return Object.freeze({ selectSpecies, hasOpenDialog, refreshListSelection: listbox.refresh });
  }

  global.SpeciesExplorerSelection = Object.freeze({
    createSpeciesSelectionController,
    createListboxNavigationController,
  });
})(typeof window !== "undefined" ? window : globalThis);
