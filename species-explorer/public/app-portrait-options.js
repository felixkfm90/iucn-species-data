(function initializeSpeciesExplorerPortraitOptions(global) {
  "use strict";

  const DEFAULTS = Object.freeze({
    motif: "automatic",
    gender: "automatic",
    lifeStage: "automatic",
    crop: "automatic",
    detailSubject: "",
    bodyOrientation: "automatic",
    headDirection: "automatic",
    perspective: "automatic",
    behavior: "automatic",
    food: "none",
    habitat: "subtle",
    timeOfDay: "automatic",
    season: "automatic",
    classOptions: Object.freeze({}),
  });

  const GENERAL_GROUPS = Object.freeze([
    {
      id: "subject",
      title: "Tier und Motiv",
      fields: [
        ["motif", "Motiv", [
          ["automatic", "Automatisch · Einzeltier"],
          ["single", "Ein einzelnes Tier"],
          ["juvenile", "Ein Jungtier"],
          ["adult-with-young", "Adulttier mit Jungtier"],
          ["pair", "Paar"],
          ["small-group", "Kleine Gruppe"],
        ]],
        ["gender", "Geschlecht", [
          ["automatic", "Automatisch"], ["male", "Männlich"], ["female", "Weiblich"],
          ["unspecified", "Nicht hervorheben"],
        ]],
        ["lifeStage", "Lebensstufe", [
          ["automatic", "Automatisch"], ["adult", "Adult"], ["juvenile", "Jungtier"],
        ]],
        ["crop", "Bildausschnitt", [
          ["automatic", "Automatisch · Ganzkörper bevorzugt"], ["full-body", "Ganzkörper"],
          ["expanded-portrait", "Erweitertes Porträt"], ["detail", "Detailaufnahme"],
        ]],
      ],
    },
    {
      id: "pose",
      title: "Körper und Blick",
      fields: [
        ["bodyOrientation", "Körperausrichtung", [
          ["automatic", "Automatisch"], ["left-profile", "Profil nach links"],
          ["right-profile", "Profil nach rechts"], ["frontal", "Frontal"],
          ["three-quarter-left", "Dreiviertelansicht nach links"],
          ["three-quarter-right", "Dreiviertelansicht nach rechts"],
        ]],
        ["headDirection", "Kopf und Blick", [
          ["automatic", "Automatisch"], ["left", "Kopf nach links"], ["right", "Kopf nach rechts"],
          ["camera", "Blick in die Kamera"], ["movement", "Blick in Bewegungsrichtung"],
        ]],
      ],
    },
    {
      id: "action",
      title: "Perspektive und Verhalten",
      fields: [
        ["perspective", "Perspektive", [
          ["automatic", "Automatisch"], ["eye-level", "Auf Augenhöhe"], ["ground-level", "Bodennah"],
          ["slightly-elevated", "Leicht erhöht"], ["macro", "Makro"], ["underwater", "Unter Wasser"],
        ]],
        ["behavior", "Aktivität", [
          ["automatic", "Automatisch"], ["resting", "Ruhend"], ["standing", "Stehend"],
          ["sitting", "Sitzend"], ["walking", "Laufend"], ["climbing", "Kletternd"],
          ["swimming", "Schwimmend"], ["flying", "Fliegend"], ["feeding", "Fressend"],
          ["hunting", "Jagend"],
        ]],
        ["food", "Nahrung oder Beute", [
          ["none", "Keine · Standard"], ["typical-food", "Typische Nahrung"],
          ["typical-prey", "Typische Beute"], ["prey-held", "Beute haltend"],
        ]],
      ],
    },
    {
      id: "environment",
      title: "Umgebung und Licht",
      fields: [
        ["habitat", "Habitat", [
          ["minimal", "Minimal"], ["subtle", "Dezent angedeutet · Standard"], ["clear", "Deutlich sichtbar"],
        ]],
        ["timeOfDay", "Tageszeit", [
          ["automatic", "Automatisch"], ["day", "Tag"], ["dawn", "Morgendämmerung"],
          ["dusk", "Abenddämmerung"], ["night", "Nacht"],
        ]],
        ["season", "Saison oder Zustand", [
          ["automatic", "Automatisch"], ["spring", "Frühling"], ["summer", "Sommer"],
          ["autumn", "Herbst"], ["winter", "Winter"],
        ]],
      ],
    },
  ]);

  const CLASS_GROUPS = Object.freeze({
    birds: {
      title: "Vögel",
      classes: ["aves", "vögel", "vogel"],
      fields: [
        ["birdPlumage", "Gefieder", [["automatic", "Automatisch"], ["breeding", "Brutkleid"], ["nonbreeding", "Schlichtkleid"], ["juvenile", "Jugendkleid"]]],
        ["wingPosition", "Flügel", [["automatic", "Automatisch"], ["folded", "Angelegt"], ["spread", "Ausgebreitet"], ["in-flight", "Im Flug"]]],
        ["birdSubstrate", "Untergrund oder Sitzplatz", [["automatic", "Automatisch"], ["branch", "Ast oder Sitzwarte"], ["ground", "Boden"], ["water", "Wasser"], ["rock", "Fels"]]],
      ],
    },
    mammals: {
      title: "Säugetiere",
      classes: ["mammalia", "säugetiere", "saugetiere"],
      fields: [
        ["mammalCoat", "Fellzustand", [["automatic", "Automatisch"], ["summer", "Sommerfell"], ["winter", "Winterfell"], ["juvenile", "Jugendfell"]]],
        ["socialForm", "Sozialform", [["automatic", "Automatisch"], ["solitary", "Einzeln"], ["pair", "Paar"], ["family", "Familie"], ["group", "Gruppe"]]],
        ["mammalFeature", "Merkmal hervorheben", [["automatic", "Automatisch"], ["antlers", "Geweih"], ["mane", "Mähne"], ["horns", "Hörner"], ["no-emphasis", "Kein Merkmal"]]],
      ],
    },
    reptiles: {
      title: "Reptilien",
      classes: ["reptilia", "reptilien"],
      fields: [
        ["reptileSurface", "Haut oder Schuppen", [["automatic", "Automatisch"], ["dry", "Trocken"], ["wet", "Nass"], ["shedding", "Häutung"]]],
        ["thermoregulation", "Thermoregulation", [["automatic", "Automatisch"], ["basking", "Sonnend"], ["shade", "Im Schatten"], ["active", "Aktiv"]]],
      ],
    },
    amphibians: {
      title: "Amphibien",
      classes: ["amphibia", "amphibien"],
      fields: [
        ["amphibianPhase", "Lebensphase", [["automatic", "Automatisch"], ["terrestrial", "An Land"], ["aquatic", "Im Wasser"], ["metamorphosis", "Metamorphose"]]],
        ["moisture", "Hautzustand", [["automatic", "Automatisch"], ["dry", "Trocken"], ["moist", "Feucht"], ["wet", "Nass"]]],
      ],
    },
    fish: {
      title: "Fische",
      classes: ["actinopterygii", "chondrichthyes", "myxini", "sarcopterygii", "fische", "fish"],
      fields: [
        ["fishEnvironment", "Gewässertyp", [["automatic", "Automatisch"], ["freshwater", "Süßwasser"], ["marine", "Meer"], ["brackish", "Brackwasser"], ["reef", "Riff"], ["open-water", "Freiwasser"], ["bottom", "Bodennah"]]],
        ["fishPosition", "Darstellung", [["automatic", "Automatisch"], ["side-view", "Seitenansicht"], ["three-quarter", "Dreiviertelansicht"], ["school", "Kleiner Schwarm"]]],
      ],
    },
    insects: {
      title: "Insekten",
      classes: ["insecta", "insekten"],
      fields: [
        ["insectStage", "Entwicklungsstadium", [["automatic", "Automatisch"], ["adult", "Imago"], ["larva", "Larve"], ["pupa", "Puppe"]]],
        ["insectWings", "Flügel", [["automatic", "Automatisch"], ["folded", "Angelegt"], ["spread", "Ausgebreitet"], ["in-flight", "Im Flug"]]],
      ],
    },
    arachnids: {
      title: "Spinnentiere",
      classes: ["arachnida", "spinnentiere"],
      fields: [["arachnidContext", "Kontext", [["automatic", "Automatisch"], ["without-web", "Ohne Netz"], ["on-web", "Im Netz"], ["burrow", "Am Bau"]]]],
    },
    crustaceans: {
      title: "Krebstiere",
      classes: ["malacostraca", "branchiopoda", "ostracoda", "crustacea", "krebstiere"],
      fields: [["crustaceanEnvironment", "Lebensraum", [["automatic", "Automatisch"], ["marine", "Meer"], ["freshwater", "Süßwasser"], ["shore", "Küste oder Gezeitenzone"], ["terrestrial", "An Land"]]]],
    },
  });

  const OTHER_INVERTEBRATE_CLASSES = new Set([
    "anthozoa", "bivalvia", "cephalopoda", "gastropoda", "hydrozoa", "polychaeta", "turbellaria",
  ]);

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function normalizedClassName(value) {
    return String(value ?? "").trim().toLocaleLowerCase("de");
  }

  function resolveClassGroup(className) {
    const normalized = normalizedClassName(className);
    for (const group of Object.values(CLASS_GROUPS)) {
      if (group.classes.includes(normalized)) return group;
    }
    if (OTHER_INVERTEBRATE_CLASSES.has(normalized)) {
      return {
        title: "Weitere Wirbellose",
        fields: [["invertebrateEnvironment", "Lebensraum", [["automatic", "Automatisch"], ["marine", "Meer"], ["freshwater", "Süßwasser"], ["terrestrial", "An Land"], ["substrate", "Typischer Untergrund"]]]],
      };
    }
    return null;
  }

  function optionsMarkup(options, selected) {
    return options.map(([value, label]) => (
      `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`
    )).join("");
  }

  function fieldMarkup([key, label, options], { classField = false } = {}) {
    const selectedValue = classField ? "automatic" : (DEFAULTS[key] ?? "automatic");
    return `
      <label class="portrait-option-field">
        <span>${escapeHtml(label)}</span>
        <select data-portrait-option="${escapeHtml(key)}"${classField ? " data-portrait-class-option" : ""}>
          ${optionsMarkup(options, selectedValue)}
        </select>
      </label>
    `;
  }

  function groupMarkup(group, { classField = false } = {}) {
    return `
      <details class="portrait-option-group" data-portrait-option-group="${escapeHtml(group.id || "class")}">
        <summary>
          <span>${escapeHtml(group.title)}</span>
          <small class="portrait-option-group-state">Automatisch</small>
        </summary>
        <div class="portrait-option-grid">
          ${group.fields.map((field) => fieldMarkup(field, { classField })).join("")}
        </div>
      </details>
    `;
  }

  function createPortraitOptionsController({ host, className = "", onChange = () => {} } = {}) {
    if (!host) {
      return Object.freeze({
        getValue: () => ({ ...DEFAULTS, classOptions: {} }),
        validate: () => ({ valid: true, errors: [] }),
        reset() {}, setClassName() {}, setBusy() {},
      });
    }

    host.innerHTML = `
      <details class="portrait-options-panel">
        <summary>
          <span>Erweiterte Vorgaben für die Bildgenerierung</span>
          <small class="portrait-options-state">Automatisch · Habitat dezent</small>
        </summary>
        <p class="portrait-options-help">
          Nur gewünschte Abweichungen auswählen. Nicht gesetzte Merkmale werden artgerecht automatisch bestimmt.
        </p>
        <div class="portrait-option-groups">
          ${GENERAL_GROUPS.map((group) => groupMarkup(group)).join("")}
          <div class="portrait-class-options"></div>
        </div>
      </details>
    `;

    const panel = host.querySelector(".portrait-options-panel");
    const state = host.querySelector(".portrait-options-state");
    const classHost = host.querySelector(".portrait-class-options");
    let currentClassName = className;
    let classGroup = null;

    const getSelect = (key) => host.querySelector(`[data-portrait-option="${key}"]`);
    const getValue = () => {
      const value = {
        ...DEFAULTS,
        classOptions: {},
      };
      for (const group of GENERAL_GROUPS) {
        for (const [key] of group.fields) value[key] = getSelect(key)?.value || DEFAULTS[key];
      }
      value.detailSubject = String(host.querySelector("[data-portrait-detail-subject]")?.value || "").trim();
      for (const select of host.querySelectorAll("[data-portrait-class-option]")) {
        if (select.value && select.value !== "automatic") value.classOptions[select.dataset.portraitOption] = select.value;
      }
      return value;
    };

    const updateDetailField = () => {
      let detailField = host.querySelector(".portrait-detail-subject-field");
      const cropSelect = getSelect("crop");
      if (!detailField && cropSelect) {
        cropSelect.closest(".portrait-option-grid")?.insertAdjacentHTML("beforeend", `
          <label class="portrait-option-field portrait-detail-subject-field" hidden>
            <span>Detailmotiv</span>
            <input
              type="text"
              maxlength="120"
              data-portrait-detail-subject
              placeholder="z. B. Pfote, Schnabel, Auge, Flügel, Schuppen oder Panzer"
            >
            <small>Was soll im Detail gezeigt werden?</small>
          </label>
        `);
        detailField = host.querySelector(".portrait-detail-subject-field");
      }
      if (detailField) detailField.hidden = cropSelect?.value !== "detail";
    };

    const changedLabels = () => {
      const value = getValue();
      const labels = [];
      for (const group of GENERAL_GROUPS) {
        const groupChanges = group.fields.filter(([key]) => value[key] !== DEFAULTS[key]);
        const groupState = host.querySelector(`[data-portrait-option-group="${group.id}"] .portrait-option-group-state`);
        if (groupState) groupState.textContent = groupChanges.length ? `${groupChanges.length} angepasst` : "Automatisch";
        labels.push(...groupChanges.map(([, label]) => label));
      }
      const classChanges = Object.keys(value.classOptions);
      const classState = host.querySelector('[data-portrait-option-group="class"] .portrait-option-group-state');
      if (classState) classState.textContent = classChanges.length ? `${classChanges.length} angepasst` : "Automatisch";
      labels.push(...classChanges);
      state.textContent = labels.length
        ? `${labels.length} Vorgabe${labels.length === 1 ? "" : "n"} angepasst`
        : "Automatisch · Habitat dezent";
      updateDetailField();
    };

    const renderClassOptions = () => {
      classGroup = resolveClassGroup(currentClassName);
      classHost.innerHTML = classGroup
        ? groupMarkup({ ...classGroup, id: "class", title: `${classGroup.title} · besondere Vorgaben` }, { classField: true })
        : "";
      changedLabels();
    };

    const validate = () => {
      const value = getValue();
      const errors = [];
      const detailInput = host.querySelector("[data-portrait-detail-subject]");
      detailInput?.classList.remove("invalid");
      if (value.crop === "detail" && !value.detailSubject) {
        errors.push("Bitte bei der Detailaufnahme angeben, was gezeigt werden soll");
        detailInput?.classList.add("invalid");
        detailInput?.focus();
        panel.open = true;
        detailInput?.closest("details")?.setAttribute("open", "");
      }
      if (value.motif === "juvenile" && value.lifeStage === "adult") {
        errors.push("Jungtier als Motiv und adultes Lebensstadium widersprechen sich");
        const lifeStage = getSelect("lifeStage");
        lifeStage?.classList.add("invalid");
        panel.open = true;
        lifeStage?.closest("details")?.setAttribute("open", "");
        if (errors.length === 1) lifeStage?.focus();
      } else {
        getSelect("lifeStage")?.classList.remove("invalid");
      }
      return { valid: errors.length === 0, errors, value };
    };

    const reset = () => {
      for (const group of GENERAL_GROUPS) {
        for (const [key] of group.fields) {
          const select = getSelect(key);
          if (select) select.value = DEFAULTS[key];
        }
      }
      const detailInput = host.querySelector("[data-portrait-detail-subject]");
      if (detailInput) detailInput.value = "";
      panel.open = false;
      renderClassOptions();
    };

    const setClassName = (nextClassName = "") => {
      const normalizedBefore = normalizedClassName(currentClassName);
      currentClassName = nextClassName;
      if (normalizedClassName(currentClassName) !== normalizedBefore) renderClassOptions();
    };

    const setBusy = (busy) => {
      for (const control of host.querySelectorAll("select, input")) control.disabled = busy;
    };

    host.addEventListener("change", (event) => {
      if (!event.target.matches("select, input")) return;
      changedLabels();
      onChange(getValue());
    });
    host.addEventListener("input", (event) => {
      if (!event.target.matches("input")) return;
      changedLabels();
      onChange(getValue());
    });

    updateDetailField();
    renderClassOptions();
    return Object.freeze({ getValue, validate, reset, setClassName, setBusy });
  }

  global.SpeciesExplorerPortraitOptions = Object.freeze({
    DEFAULTS,
    resolveClassGroup,
    createPortraitOptionsController,
  });
})(globalThis);
