(function initializeSpeciesTaxonomy(global) {
  "use strict";

  const EMPTY_VALUES = new Set(["", "-", "n/a", "na", "null", "undefined", "unknown"]);
  const TAXONOMY_STYLESHEET_ID = "species-taxonomy-styles";
  const TAXONOMY_STYLESHEET_PATH = "docs/squarespace-custom.css";

  const TAXONOMY_LEVELS = Object.freeze([
    { key: "Kingdom", rank: "Reich", className: "kingdom", icon: "globe" },
    { key: "Phylum", rank: "Stamm", className: "phylum", icon: "branch" },
    { key: "Subphylum", rank: "Unterstamm", className: "subphylum", icon: "spine" },
    { key: "Class", rank: "Klasse", className: "class", icon: "layers" },
    { key: "Order", rank: "Ordnung", className: "order", icon: "hierarchy" },
    { key: "Family", rank: "Familie", className: "family", icon: "group" },
    { key: "Genus", rank: "Gattung", className: "genus", icon: "sprout" },
    { key: "Species", rank: "Art", className: "species", icon: "leaf" },
  ]);

  const TAXONOMY_TRANSLATIONS = Object.freeze({
    Kingdom: Object.freeze({
      Animalia: "Tiere",
    }),
    Phylum: Object.freeze({
      Chordata: "Chordatiere",
    }),
    Subphylum: Object.freeze({
      Vertebrata: "Wirbeltiere",
    }),
    Class: Object.freeze({
      Aves: "Vögel",
      Mammalia: "Säugetiere",
      Reptilia: "Reptilien",
    }),
    Order: Object.freeze({
      Accipitriformes: "Greifvögel",
      Anseriformes: "Gänsevögel",
      Artiodactyla: "Paarhufer",
      Carnivora: "Raubtiere",
      Charadriiformes: "Regenpfeiferartige",
      Coraciiformes: "Rackenvögel",
      Falconiformes: "Falkenartige",
      Galliformes: "Hühnervögel",
      Gruiformes: "Kranichvögel",
      Otidiformes: "Trappenvögel",
      Passeriformes: "Sperlingsvögel",
      Pelecaniformes: "Pelekanvögel",
      Piciformes: "Spechtvögel",
      Primates: "Primaten",
      Psittaciformes: "Papageien",
      Rodentia: "Nagetiere",
      Squamata: "Schuppenkriechtiere",
      Strigiformes: "Eulen",
      Suliformes: "Tölpelartige",
      Trogoniformes: "Trogone",
    }),
    Family: Object.freeze({
      Accipitridae: "Habichtartige",
      Alcedinidae: "Eisvögel",
      Alcidae: "Alkenvögel",
      Anatidae: "Entenvögel",
      Ardeidae: "Reiher",
      Atelidae: "Klammerschwanzaffen",
      Balaenopteridae: "Furchenwale",
      Canidae: "Hunde",
      Cebidae: "Kapuzinerartige",
      Cervidae: "Hirsche",
      Charadriidae: "Regenpfeifer",
      Corvidae: "Rabenvögel",
      Cricetidae: "Wühler",
      Falconidae: "Falkenartige",
      Felidae: "Katzen",
      Fringillidae: "Finken",
      Haematopodidae: "Austernfischer",
      Iguanidae: "Leguane",
      Momotidae: "Sägeracken",
      Motacillidae: "Stelzen und Pieper",
      Muscicapidae: "Fliegenschnäpper",
      Otididae: "Trappen",
      Panuridae: "Bartmeisen",
      Paridae: "Meisen",
      Phalacrocoracidae: "Kormorane",
      Phasianidae: "Fasanenartige",
      Picidae: "Spechte",
      Psittacidae: "Eigentliche Papageien",
      Rallidae: "Rallen",
      Ramphastidae: "Tukane",
      Sciuridae: "Hörnchen",
      Scolopacidae: "Schnepfenvögel",
      Sittidae: "Kleiber",
      Strigidae: "Eigentliche Eulen",
      Trogonidae: "Trogone",
      Turdidae: "Drosseln",
    }),
    Genus: Object.freeze({
      Turdus: "Echte Drosseln",
    }),
  });

  const ICONS = Object.freeze({
    globe: "<circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M4 12h16M12 4c2.6 2.3 3.7 5 3.7 8S14.6 17.7 12 20M12 4C9.4 6.3 8.3 9 8.3 12S9.4 17.7 12 20\"/>",
    branch: "<path d=\"M12 20V5M12 10 7 6M12 14l5-5M7 6 5-2M17 9l2-3\"/>",
    spine: "<path d=\"M12 3v18M7 6h10M7.5 10h9M7.5 14h9M8 18h8\"/>",
    layers: "<path d=\"m12 4 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 16l8 4 8-4\"/>",
    hierarchy: "<path d=\"M12 4v5M5 20v-5h14v5M5 15v-3h14v3M12 9v3\"/><circle cx=\"12\" cy=\"4\" r=\"2\"/><circle cx=\"5\" cy=\"20\" r=\"2\"/><circle cx=\"19\" cy=\"20\" r=\"2\"/>",
    group: "<circle cx=\"12\" cy=\"8\" r=\"3\"/><circle cx=\"5.5\" cy=\"10\" r=\"2.2\"/><circle cx=\"18.5\" cy=\"10\" r=\"2.2\"/><path d=\"M6 20c0-4 2.2-6 6-6s6 2 6 6M2.5 19c0-3 1.2-4.5 3.7-4.8M21.5 19c0-3-1.2-4.5-3.7-4.8\"/>",
    sprout: "<path d=\"M12 21V10M12 14c-5 0-7-2.5-7-6 5 0 7 2.5 7 6ZM12 11c5 0 7-2.5 7-6-5 0-7 2.5-7 6Z\"/>",
    leaf: "<path d=\"M4 17C5 8 11 4 20 5c-1 9-7 14-16 12ZM5 16c4-3 8-6 13-9\"/>",
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function resolveTaxonomyStylesheetUrl() {
    const source = global.document?.currentScript?.src;
    if (!source || typeof global.URL !== "function") return "";
    const scriptUrl = new global.URL(source, global.document?.baseURI);
    const stylesheetUrl = new global.URL(TAXONOMY_STYLESHEET_PATH, scriptUrl);
    stylesheetUrl.search = scriptUrl.search;
    return stylesheetUrl.href;
  }

  function ensureTaxonomyStyles() {
    const document = global.document;
    if (!document?.createElement || !document.head) return Promise.resolve(true);

    const stylesheetUrl = resolveTaxonomyStylesheetUrl();
    if (!stylesheetUrl) return Promise.resolve(true);

    const existing = document.getElementById(TAXONOMY_STYLESHEET_ID);
    if (existing?.sheet || existing?.dataset?.loaded === "true") return Promise.resolve(true);

    return new Promise((resolve) => {
      const link = existing || document.createElement("link");
      let settled = false;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        if (loaded) link.dataset.loaded = "true";
        resolve(loaded);
      };

      link.id = TAXONOMY_STYLESHEET_ID;
      link.rel = "stylesheet";
      link.href = stylesheetUrl;
      link.addEventListener("load", () => finish(true), { once: true });
      link.addEventListener("error", () => finish(false), { once: true });
      if (!existing) document.head.append(link);
      global.setTimeout?.(() => finish(Boolean(link.sheet)), 8000);
    });
  }

  function normalizedValue(value) {
    return String(value ?? "").trim();
  }

  function isUsableValue(value) {
    return !EMPTY_VALUES.has(normalizedValue(value).toLocaleLowerCase("de"));
  }

  function capitalize(value) {
    const text = normalizedValue(value);
    return text
      ? `${text[0].toLocaleUpperCase("de")}${text.slice(1)}`
      : text;
  }

  function translateValue(key, rawValue) {
    const raw = normalizedValue(rawValue);
    return capitalize(TAXONOMY_TRANSLATIONS[key]?.[raw] ?? raw);
  }

  function buildLevels(data) {
    return TAXONOMY_LEVELS
      .filter((level) => isUsableValue(data?.[level.key]))
      .map((level, index) => {
        const rawValue = normalizedValue(data[level.key]);
        const displayValue = translateValue(level.key, rawValue);
        return { ...level, index, rawValue, displayValue };
      });
  }

  function iconMarkup(icon) {
    return `
      <svg class="taxonomy-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        ${ICONS[icon]}
      </svg>
    `;
  }

  function levelMarkup(level) {
    const isTranslated = level.displayValue !== capitalize(level.rawValue);
    const accessibleText = isTranslated
      ? `${level.rank}: ${level.displayValue}; wissenschaftlich ${level.rawValue}`
      : `${level.rank}: ${level.displayValue}`;
    const title = isTranslated
      ? ` title="Wissenschaftlicher Wert: ${escapeHtml(level.rawValue)}"`
      : "";
    return `
      <li
        class="taxonomy-level taxonomy-level--${level.className} taxonomy-depth-${level.index}"
        data-taxonomy-key="${level.key}"
        aria-label="${escapeHtml(accessibleText)}"
      >
        <div class="taxonomy-stage"${title}>
          <span class="taxonomy-icon-wrap" aria-hidden="true">${iconMarkup(level.icon)}</span>
          <span class="taxonomy-stage-divider" aria-hidden="true"></span>
          <span class="taxonomy-copy">
            <span class="taxonomy-rank-label">${level.rank}:</span>
            <span class="taxonomy-value">${escapeHtml(level.displayValue)}</span>
          </span>
        </div>
      </li>
    `;
  }

  function renderMarkup(data) {
    const levels = buildLevels(data);
    if (!levels.length) {
      return '<p class="frame-box taxonomy-empty">Keine Taxonomiedaten verfügbar.</p>';
    }
    return `
      <section class="frame-box taxonomy-frame" aria-label="Taxonomische Einordnung">
        <div class="taxonomy-layout">
          <div class="taxonomy-direction" aria-hidden="true"><span>Taxonomie</span></div>
          <ol class="taxonomy-levels">
            ${levels.map(levelMarkup).join("")}
          </ol>
        </div>
      </section>
    `;
  }

  function numericStyleValue(styles, property) {
    const value = Number.parseFloat(styles?.[property]);
    return Number.isFinite(value) ? value : 0;
  }

  function measureNaturalStageWidth(stage) {
    const styles = global.getComputedStyle?.(stage);
    const icon = stage.querySelector?.(".taxonomy-icon-wrap");
    const divider = stage.querySelector?.(".taxonomy-stage-divider");
    const copy = stage.querySelector?.(".taxonomy-copy");
    if (!styles || !icon || !divider || !copy) {
      return Math.ceil(stage.scrollWidth || stage.getBoundingClientRect?.().width || 0);
    }

    const horizontalFrame =
      numericStyleValue(styles, "paddingLeft")
      + numericStyleValue(styles, "paddingRight")
      + numericStyleValue(styles, "borderLeftWidth")
      + numericStyleValue(styles, "borderRightWidth");
    const columnGap = numericStyleValue(styles, "columnGap");
    const rank = copy.querySelector?.(".taxonomy-rank-label");
    const value = copy.querySelector?.(".taxonomy-value");
    const rankStyles = rank ? global.getComputedStyle?.(rank) : null;
    const copyWidth = rank && value
      ? rank.getBoundingClientRect().width
        + value.getBoundingClientRect().width
        + numericStyleValue(rankStyles, "marginRight")
      : copy.scrollWidth;
    return Math.ceil(
      horizontalFrame
      + icon.getBoundingClientRect().width
      + divider.getBoundingClientRect().width
      + copyWidth
      + (columnGap * 2)
      + 8,
    );
  }

  function calculateStageWidths(naturalWidths, availableWidth, compactViewport = false) {
    const count = naturalWidths.length;
    if (!count || availableWidth <= 0) return { widths: [], wrapped: false, taperStep: 0 };

    const preferredStep = 10;
    const minimumStep = 5;
    if (compactViewport) {
      const safeSteps = naturalWidths
        .map((width, index) => (index > 0 ? (availableWidth - width) / index : Number.POSITIVE_INFINITY))
        .filter(Number.isFinite);
      const largestSafeStep = safeSteps.length ? Math.min(...safeSteps) : preferredStep;
      const mobileStep = Math.min(preferredStep, Math.max(4, largestSafeStep));
      const widths = naturalWidths.map((_, index) => Math.max(0, availableWidth - (index * mobileStep)));
      return {
        widths,
        wrapped: widths.some((width, index) => naturalWidths[index] > width + 0.5),
        taperStep: mobileStep,
      };
    }
    const requiredBase = Math.max(
      ...naturalWidths.map((width, index) => width + (index * preferredStep)),
    );

    let baseWidth = Math.min(requiredBase, availableWidth);
    let taperStep = preferredStep;
    if (requiredBase > availableWidth) {
      const fittingSteps = naturalWidths
        .map((width, index) => (index > 0 ? (availableWidth - width) / index : Number.POSITIVE_INFINITY))
        .filter(Number.isFinite);
      const largestNonWrappingStep = fittingSteps.length
        ? Math.min(...fittingSteps)
        : preferredStep;
      taperStep = Math.min(preferredStep, Math.max(minimumStep, largestNonWrappingStep));
      baseWidth = availableWidth;
    }

    const widths = naturalWidths.map((_, index) => Math.max(0, baseWidth - (index * taperStep)));
    return {
      widths,
      wrapped: widths.some((width, index) => naturalWidths[index] > width + 0.5),
      taperStep,
    };
  }

  function fitTaxonomyStages(container) {
    const levels = container.querySelector?.(".taxonomy-levels");
    if (!levels) return;
    const stages = [...levels.querySelectorAll(".taxonomy-stage")];
    if (!stages.length) return;

    levels.classList.remove("taxonomy-levels--wrapped");
    levels.style.removeProperty("width");
    stages.forEach((stage) => stage.style.removeProperty("width"));

    const layout = levels.closest(".taxonomy-layout");
    const direction = layout?.querySelector(".taxonomy-direction");
    const layoutStyles = layout ? global.getComputedStyle?.(layout) : null;
    const availableWidth = Math.floor(layout && direction
      ? layout.getBoundingClientRect().width
        - direction.getBoundingClientRect().width
        - numericStyleValue(layoutStyles, "columnGap")
      : levels.getBoundingClientRect().width || levels.clientWidth || 0);
    const naturalWidths = stages.map(measureNaturalStageWidth);
    const result = calculateStageWidths(naturalWidths, availableWidth, global.innerWidth <= 480);
    levels.classList.toggle("taxonomy-levels--wrapped", result.wrapped);
    levels.style.setProperty("--taxonomy-taper-half", `${result.taperStep / 2}px`);
    levels.style.width = `${Math.min(availableWidth, result.widths[0])}px`;
    stages.forEach((stage, index) => {
      stage.style.width = `${Math.min(availableWidth, result.widths[index])}px`;
    });
  }

  function watchTaxonomyLayout(container) {
    if (!container.querySelector?.(".taxonomy-levels")) return;
    let frame = 0;
    const scheduleFit = () => {
      if (frame && global.cancelAnimationFrame) global.cancelAnimationFrame(frame);
      const run = () => {
        frame = 0;
        fitTaxonomyStages(container);
      };
      if (global.requestAnimationFrame) frame = global.requestAnimationFrame(run);
      else run();
    };

    fitTaxonomyStages(container);
    global.document?.fonts?.ready?.then(scheduleFit).catch(() => {});
    if (typeof global.ResizeObserver === "function") {
      const layout = container.querySelector(".taxonomy-layout");
      const observer = new global.ResizeObserver(scheduleFit);
      observer.observe(layout);
      container.taxonomyResizeObserver?.disconnect?.();
      container.taxonomyResizeObserver = observer;
    } else {
      global.addEventListener?.("resize", scheduleFit, { passive: true });
    }
  }

  async function renderTaxonomy() {
    const container = global.document?.getElementById("species-taxonomy");
    if (!container) return;
    try {
      const stylesLoaded = await ensureTaxonomyStyles();
      if (!stylesLoaded) {
        throw new Error("Die Taxonomie-Darstellung konnte nicht geladen werden.");
      }
      const data = await global.SpeciesCore.getSpeciesData();
      container.innerHTML = renderMarkup(data);
      watchTaxonomyLayout(container);
    } catch (error) {
      container.innerHTML = `<p class="frame-box taxonomy-error">${escapeHtml(error.message)}</p>`;
    }
  }

  void renderTaxonomy();
})(globalThis);
