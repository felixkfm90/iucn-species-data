(function initializeSpeciesExplorerTaxonomyReference(global) {
  "use strict";

  const RANK_LABELS = Object.freeze({
    kingdom: "Reich",
    phylum: "Stamm",
    subphylum: "Unterstamm",
    class: "Klasse",
    order: "Ordnung",
    family: "Familie",
    subfamily: "Unterfamilie",
    genus: "Gattung",
    species: "Art",
    subspecies: "Unterart",
  });
  const NEW_SPECIES_ALLOWED_RANKS = new Set(["species"]);
  const KINGDOM_SETTINGS_STORAGE_KEY = "species-explorer.taxonomy.visible-kingdoms.v1";
  const TAXONOMY_SEARCH_DEBOUNCE_MS = 500;

  function taxonomySearchUrl({
    query,
    kind = "all",
    kingdomId = "Animalia",
    kingdomIds = null,
    language = "all",
    rank = "species",
    limit = 12,
  } = {}) {
    const parameters = [
      ["q", String(query ?? "").trim()],
      ["kind", String(kind || "all")],
      ["language", String(language || "all")],
      ["rank", String(rank || "species")],
      ["limit", String(limit)],
    ];
    if (Array.isArray(kingdomIds)) {
      parameters.push(["kingdomIds", kingdomIds.map((value) => String(value)).join(",")]);
    } else {
      parameters.push(["kingdomId", String(kingdomId || "Animalia")]);
    }
    return `/api/taxonomy/search?${parameters
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&")}`;
  }

  function taxonomyAvailabilityPresentation(status = {}) {
    const referenceStatus = taxonomyReferenceStatus(status);
    if (referenceStatus.available) {
      return {
        state: "available",
        label: "Referenz verfügbar",
        message: "Beim Tippen werden passende Namen aus der lokalen Taxonomiereferenz vorgeschlagen.",
      };
    }
    return {
      state: "unavailable",
      label: "Manuelle Eingabe",
      message: referenceStatus.message
        || "Die Taxonomiereferenz ist derzeit nicht verfügbar. Namen können weiterhin manuell eingegeben werden.",
    };
  }

  function taxonomyReferenceStatus(status = {}) {
    return status.reference && typeof status.reference === "object"
      ? status.reference
      : status;
  }

  function sortTaxonomyKingdoms(values = [], { includesAllOption = false } = {}) {
    const kingdoms = (Array.isArray(values) ? values : []).map((kingdom) => ({
      id: String(kingdom?.id || ""),
      label: String(kingdom?.label || kingdom?.id || ""),
    }));
    if (includesAllOption) {
      kingdoms.push({ id: "all", label: "Alle Reiche" });
    }
    const priority = (kingdom) => (kingdom.id === "all" ? 0 : 1);
    return kingdoms.sort((left, right) => (
      priority(left) - priority(right)
      || left.label.localeCompare(
        right.label,
        "de",
        { numeric: true, sensitivity: "base" },
      )
    ));
  }

  function normalizedFilterText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("de");
  }

  function filterTaxonomyKingdoms(values = [], query = "") {
    const normalizedQuery = normalizedFilterText(query);
    const kingdoms = sortTaxonomyKingdoms(values);
    if (!normalizedQuery) return kingdoms;
    return kingdoms.filter((kingdom) => normalizedFilterText(
      `${kingdom.label} ${kingdom.id}`,
    ).includes(normalizedQuery));
  }

  function createTaxonomySearchScheduler(callback, {
    delayMs = TAXONOMY_SEARCH_DEBOUNCE_MS,
    setTimeoutFn = global.setTimeout?.bind(global),
    clearTimeoutFn = global.clearTimeout?.bind(global),
  } = {}) {
    let timer = null;
    const cancel = () => {
      if (timer !== null && typeof clearTimeoutFn === "function") {
        clearTimeoutFn(timer);
      }
      timer = null;
    };
    const schedule = (...args) => {
      cancel();
      if (typeof setTimeoutFn !== "function") {
        callback(...args);
        return;
      }
      timer = setTimeoutFn(() => {
        timer = null;
        callback(...args);
      }, delayMs);
    };
    return Object.freeze({ cancel, schedule, delayMs });
  }

  function normalizeSelectedKingdomIds(values, availableValues) {
    const available = new Set(
      (Array.isArray(availableValues) ? availableValues : [])
        .map((entry) => String(entry?.id || entry || "").trim())
        .filter(Boolean),
    );
    const selected = [];
    for (const value of Array.isArray(values) ? values : []) {
      const id = String(value || "").trim();
      if (available.has(id) && !selected.includes(id)) selected.push(id);
    }
    return selected;
  }

  function taxonomyResultPresentation(result = {}) {
    const scientificName = String(result.acceptedScientificName || "").trim();
    const germanName = String(result.germanName || "").trim();
    const englishName = String(result.englishName || "").trim();
    const displayName = germanName || englishName;
    const usesEnglishFallback = !germanName && Boolean(englishName);
    const matchedTerm = String(result.matchedTerm || "").trim();
    const synonym = result.synonym?.scientificName
      ? `Gefunden als Synonym: ${result.synonym.scientificName}`
      : "";
    const masterStatuses = Array.isArray(result.masterStatuses)
      ? result.masterStatuses
        .map((entry) => String(entry?.label || entry?.id || "").trim())
        .filter(Boolean)
      : [];
    const note = [
      synonym,
      result.referenceGap === true ? "CoL-Referenzlücke" : "",
      usesEnglishFallback ? "Englischer Name" : "",
      !synonym
        && matchedTerm
        && matchedTerm !== displayName
        && matchedTerm !== scientificName
        ? `Treffer: ${matchedTerm}`
        : "",
    ].filter(Boolean).join(" · ");
    return {
      title: displayName || scientificName || matchedTerm || "Unbenanntes Taxon",
      scientificName,
      germanName,
      englishName,
      displayName,
      usesEnglishFallback,
      subtitle: displayName && scientificName ? scientificName : "",
      note,
      kingdom: result.kingdom?.label || result.kingdom?.scientificName || "",
      rank: RANK_LABELS[String(result.rank || "").toLowerCase()]
        || String(result.rank || ""),
      source: String(result.source || ""),
      masterStatuses,
      referenceGap: result.referenceGap === true,
      releaseId: String(result.releaseId || ""),
      taxonId: String(result.taxonId ?? ""),
      hasVerifiedGermanName: result.hasVerifiedGermanName === true,
    };
  }

  function taxonomyDetailPresentation(detail = {}, selectedResult = {}) {
    const selectedGermanName = selectedResult.hasVerifiedGermanName === true
      ? String(selectedResult.germanName || "").trim()
      : "";
    const germanName = selectedGermanName
      || String(detail.germanNames?.[0]?.name || "").trim();
    const selectedEnglishName = String(selectedResult.englishName || "").trim();
    const englishName = selectedEnglishName
      || String(detail.englishNames?.[0]?.name || "").trim();
    const displayName = germanName || englishName;
    const usesEnglishFallback = !germanName && Boolean(englishName);
    const scientificName = String(detail.scientific_name || "").trim();
    const hierarchy = Array.isArray(detail.hierarchy)
      ? detail.hierarchy
        .map((entry) => ({
          label: RANK_LABELS[String(entry.rank || "").toLowerCase()]
            || String(entry.rank || "Stufe"),
          value: String(
            entry.germanName && entry.germanName !== entry.scientificName
              ? `${entry.germanName} (${entry.scientificName})`
              : entry.displayName || entry.scientificName || entry.scientific_name || "",
          ).trim(),
        }))
        .filter((entry) => entry.value)
      : [];
    return {
      germanName,
      englishName,
      displayName,
      usesEnglishFallback,
      nameToApply: displayName,
      scientificName,
      hierarchy,
      source: String(detail.source || "Catalogue of Life"),
      releaseId: String(detail.releaseId || ""),
      sourceId: String(detail.source_id || selectedResult.sourceId || ""),
      rank: RANK_LABELS[String(detail.rank || selectedResult.rank || "").toLowerCase()]
        || String(detail.rank || selectedResult.rank || ""),
      status: String(detail.status || selectedResult.status || ""),
      trustTier: String(detail.trust_tier || selectedResult.trustTier || ""),
      synonym: selectedResult.synonym?.scientificName
        ? {
          scientificName: String(selectedResult.synonym.scientificName),
          acceptedScientificName: String(
            selectedResult.synonym.acceptedScientificName || scientificName,
          ),
        }
        : null,
      manualGermanNameFallback: detail.manualGermanNameFallback || null,
      supplement: detail.supplement || null,
      masterStatuses: (Array.isArray(detail.masterStatuses)
        ? detail.masterStatuses
        : selectedResult.masterStatuses || [])
        .map((entry) => String(entry?.label || entry?.id || "").trim())
        .filter(Boolean),
      referenceGap: detail.referenceGap === true || selectedResult.referenceGap === true,
    };
  }

  function createTaxonomyReferenceController({
    root,
    form,
    fetchJson,
    escapeHtml,
    onNamesChanged = () => {},
    debounceMs = TAXONOMY_SEARCH_DEBOUNCE_MS,
  } = {}) {
    const section = root?.querySelector?.(".taxonomy-reference");
    if (!section || !form || typeof fetchJson !== "function") {
      return Object.freeze({
        initialize: async () => {},
        reset: () => {},
      });
    }

    const statusBadge = section.querySelector(".taxonomy-reference-status");
    const message = section.querySelector(".taxonomy-reference-message");
    const kingdomSelect = section.querySelector(".taxonomy-reference-kingdom");
    const resultsContainer = section.querySelector(".taxonomy-reference-results");
    const selection = section.querySelector(".taxonomy-reference-selection");
    const selectionContent = section.querySelector(".taxonomy-reference-selection-content");
    const kingdomSettings = section.querySelector(".taxonomy-reference-kingdom-settings");
    const kingdomSettingsToggle = section.querySelector(
      ".taxonomy-reference-kingdom-settings-toggle",
    );
    const kingdomSettingsPanel = section.querySelector(
      ".taxonomy-reference-kingdom-settings-panel",
    );
    const kingdomSettingsList = section.querySelector(
      ".taxonomy-reference-kingdom-settings-list",
    );
    const kingdomSettingsFilter = section.querySelector(
      ".taxonomy-reference-kingdom-settings-filter-input",
    );
    const kingdomSettingsMessage = section.querySelector(
      ".taxonomy-reference-kingdom-settings-message",
    );
    const kingdomSettingsSave = section.querySelector(
      ".taxonomy-reference-kingdom-settings-save",
    );
    const germanInput = form.elements.german;
    const englishInput = form.elements.english;
    const scientificInput = form.elements.scientificName;
    const escape = typeof escapeHtml === "function"
      ? escapeHtml
      : (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

    let available = false;
    let defaultKingdom = "Animalia";
    let allKingdoms = [];
    let selectedKingdomIds = [];
    let requestVersion = 0;
    let activeInput = null;
    let activeKind = "all";
    let activeLanguage = "all";
    let searchResults = [];
    let selectedResult = null;
    let selectedDetail = null;
    let activeSearchController = null;

    const abortActiveSearch = () => {
      activeSearchController?.abort?.();
      activeSearchController = null;
    };

    const setMessage = (text = "", type = "info") => {
      message.textContent = text;
      message.className = `taxonomy-reference-message ${type}`;
      message.hidden = !text;
    };

    const setAvailability = (status) => {
      const presentation = taxonomyAvailabilityPresentation(status);
      available = presentation.state === "available";
      statusBadge.textContent = presentation.label;
      statusBadge.dataset.state = presentation.state;
      kingdomSelect.disabled = !available;
      if (kingdomSettingsToggle) kingdomSettingsToggle.disabled = !available;
      setMessage(presentation.message, available ? "info" : "warning");
    };

    const clearResults = () => {
      searchResults = [];
      resultsContainer.replaceChildren();
      resultsContainer.hidden = true;
    };

    const clearSelection = () => {
      selectedResult = null;
      selectedDetail = null;
      selectionContent.replaceChildren();
      selection.hidden = true;
    };

    const loadStoredKingdomIds = () => {
      try {
        const stored = global.localStorage?.getItem?.(KINGDOM_SETTINGS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    };

    const storeSelectedKingdomIds = () => {
      try {
        global.localStorage?.setItem?.(
          KINGDOM_SETTINGS_STORAGE_KEY,
          JSON.stringify(selectedKingdomIds),
        );
      } catch {
        // Die lokale Auswahl bleibt für diese Sitzung aktiv.
      }
    };

    const currentSearchKingdomIds = () => {
      if (kingdomSelect.value === "all") return [...selectedKingdomIds];
      return selectedKingdomIds.includes(kingdomSelect.value)
        ? [kingdomSelect.value]
        : [];
    };

    const renderKingdomSelect = ({ preferredValue = "" } = {}) => {
      kingdomSelect.replaceChildren();
      const visibleKingdoms = allKingdoms.filter(
        (kingdom) => selectedKingdomIds.includes(kingdom.id),
      );
      const kingdoms = sortTaxonomyKingdoms(visibleKingdoms, {
        includesAllOption: visibleKingdoms.length > 0,
      });
      if (!kingdoms.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Keine Reiche ausgewählt";
        kingdomSelect.append(option);
        kingdomSelect.disabled = true;
        return;
      }
      for (const kingdom of kingdoms) {
        const option = document.createElement("option");
        option.value = kingdom.id;
        option.textContent = kingdom.label;
        kingdomSelect.append(option);
      }
      const fallbackValue = selectedKingdomIds.includes(defaultKingdom)
        ? defaultKingdom
        : "all";
      kingdomSelect.value = kingdoms.some((entry) => entry.id === preferredValue)
        ? preferredValue
        : fallbackValue;
      kingdomSelect.disabled = !available;
    };

    const setKingdomSettingsMessage = (text = "", type = "info") => {
      if (!kingdomSettingsMessage) return;
      kingdomSettingsMessage.textContent = text;
      kingdomSettingsMessage.className =
        `taxonomy-reference-kingdom-settings-message ${type}`;
      kingdomSettingsMessage.hidden = !text;
    };

    const renderKingdomSettings = () => {
      if (!kingdomSettingsList) return;
      const kingdoms = sortTaxonomyKingdoms(allKingdoms);
      kingdomSettingsList.innerHTML = kingdoms.map((kingdom) => `
        <label data-kingdom-id="${escape(kingdom.id)}">
          <input
            type="checkbox"
            value="${escape(kingdom.id)}"
            ${selectedKingdomIds.includes(kingdom.id) ? "checked" : ""}
          >
          <span>${escape(kingdom.label)}</span>
        </label>
      `).join("");
      setKingdomSettingsMessage();
    };

    const applyKingdomSettingsFilter = () => {
      if (!kingdomSettingsList) return;
      const visibleIds = new Set(
        filterTaxonomyKingdoms(allKingdoms, kingdomSettingsFilter?.value)
          .map((kingdom) => kingdom.id),
      );
      let visibleCount = 0;
      for (const label of kingdomSettingsList.querySelectorAll("[data-kingdom-id]")) {
        const visible = visibleIds.has(label.dataset.kingdomId);
        label.hidden = !visible;
        if (visible) visibleCount += 1;
      }
      setKingdomSettingsMessage(
        visibleCount ? "" : "Keine passenden Reiche gefunden.",
        visibleCount ? "info" : "warning",
      );
    };

    const renderKingdoms = (payload = {}) => {
      defaultKingdom = payload.defaultKingdom || "Animalia";
      allKingdoms = sortTaxonomyKingdoms(payload.values);
      const storedSelection = loadStoredKingdomIds();
      selectedKingdomIds = normalizeSelectedKingdomIds(
        storedSelection === null ? [defaultKingdom] : storedSelection,
        allKingdoms,
      );
      renderKingdomSelect({ preferredValue: defaultKingdom });
      renderKingdomSettings();
    };

    const renderResults = () => {
      resultsContainer.innerHTML = searchResults.map((result) => {
        const view = taxonomyResultPresentation(result);
        return `
          <button
            class="taxonomy-reference-result"
            type="button"
            role="option"
            data-taxon-id="${escape(view.taxonId)}"
          >
            <span class="taxonomy-reference-result-main">
              <strong>${escape(view.title)}</strong>
              ${view.subtitle ? `<em>${escape(view.subtitle)}</em>` : ""}
            </span>
            <span class="taxonomy-reference-result-meta">
              ${view.kingdom || view.rank
                ? `<span>${escape([view.rank, view.kingdom].filter(Boolean).join(" · "))}</span>`
                : ""}
              ${view.note ? `<small>${escape(view.note)}</small>` : ""}
              ${view.source ? `<small>${escape(view.source)}</small>` : ""}
            </span>
          </button>
        `;
      }).join("");
      resultsContainer.hidden = searchResults.length === 0;
    };

    const renderSelection = () => {
      const view = taxonomyDetailPresentation(selectedDetail, selectedResult);
      const hierarchy = view.hierarchy.map((entry) => `
        <div>
          <dt>${escape(entry.label)}</dt>
          <dd>${escape(entry.value)}</dd>
        </div>
      `).join("");
      const fallback = view.manualGermanNameFallback?.url
        ? `
          <p class="taxonomy-reference-fallback">
            Kein verifizierter deutscher Name in der lokalen Referenz.
            ${view.usesEnglishFallback
              ? `Vorläufig wird der englische Name <strong>${escape(view.englishName)}</strong> verwendet.`
              : ""}
            <a href="${escape(view.manualGermanNameFallback.url)}" target="_blank" rel="noopener noreferrer">
              Manuell bei Animalia.bio suchen
            </a>
          </p>
        `
        : "";
      const synonym = view.synonym
        ? `
          <p class="taxonomy-reference-synonym">
            Gefunden als Synonym <em>${escape(view.synonym.scientificName)}</em>.
            Übernommen wird <em>${escape(view.synonym.acceptedScientificName)}</em>.
          </p>
        `
        : "";
      const sourceNames = [
        ...(view.supplement?.nameSources?.german || []),
        ...(view.supplement?.nameSources?.english || []),
      ];
      const supplementSources = [...new Set(sourceNames
        .map((entry) => String(entry.source || "").trim())
        .filter(Boolean))];
      const supplement = supplementSources.length
        ? `
          <p class="taxonomy-reference-supplement">
            Namen ergänzt durch: ${escape(supplementSources.join(", "))}
          </p>
        `
        : "";
      selectionContent.innerHTML = `
        <div class="taxonomy-reference-selection-heading">
          <strong>${escape(view.displayName || "Deutschen Namen manuell ergänzen")}</strong>
          <em>${escape(view.scientificName)}</em>
        </div>
        ${synonym}
        <p class="taxonomy-reference-selection-meta">
          ${escape([
            view.rank,
            view.status === "accepted" ? "Akzeptierter Name" : view.status,
            view.trustTier === "base" ? "Basisquelle" : view.trustTier,
            view.referenceGap ? "CoL-Referenzlücke" : "",
            ...view.masterStatuses,
          ].filter(Boolean).join(" · "))}
        </p>
        <dl class="taxonomy-reference-hierarchy">${hierarchy}</dl>
        <p class="taxonomy-reference-source">
          Quelle: ${escape(view.source)}
          ${view.releaseId ? ` · Stand: ${escape(view.releaseId)}` : ""}
          ${view.sourceId ? ` · ID: ${escape(view.sourceId)}` : ""}
        </p>
        ${supplement}
        ${fallback}
        <details class="taxonomy-reference-correction">
          <summary>Eigenen Namen korrigieren</summary>
          <div class="taxonomy-reference-correction-fields">
            <label>
              <span>Deutscher Name</span>
              <input name="correctionGermanName" type="text" maxlength="120" value="${escape(view.germanName)}">
            </label>
            <label>
              <span>Englischer Name</span>
              <input name="correctionEnglishName" type="text" maxlength="120" value="${escape(view.englishName)}">
            </label>
            <label class="taxonomy-reference-correction-note">
              <span>Hinweis · optional</span>
              <input name="correctionNote" type="text" maxlength="240" value="${escape(view.supplement?.note || "")}">
            </label>
          </div>
          <div class="taxonomy-reference-correction-actions">
            <button type="button" data-taxonomy-correction="save">Korrektur speichern</button>
            <button
              type="button"
              class="secondary"
              data-taxonomy-correction="reset"
              ${view.supplement?.correction ? "" : "disabled"}
            >
              Eigene Korrektur zurücksetzen
            </button>
          </div>
        </details>
      `;
      selection.hidden = false;
    };

    const applySelectedNames = () => {
      if (!selectedDetail) return;
      const view = taxonomyDetailPresentation(selectedDetail, selectedResult);
      scientificInput.value = view.scientificName;
      if (view.germanName) germanInput.value = view.germanName;
      if (view.englishName) englishInput.value = view.englishName;
      onNamesChanged();
      setMessage(
        view.germanName
          ? "Deutscher, englischer und wissenschaftlicher Name wurden übernommen. Bitte alle Angaben anschließend prüfen."
          : view.usesEnglishFallback
            ? "Englischer und wissenschaftlicher Name wurden übernommen. Bitte den deutschen Namen ergänzen und alle Angaben prüfen."
            : "Der wissenschaftliche Name wurde übernommen. Bitte deutschen und englischen Namen ergänzen und alle Angaben prüfen.",
        "success",
      );
    };

    const selectResult = async (result) => {
      const version = ++requestVersion;
      selectedResult = result;
      selectedDetail = null;
      clearResults();
      selection.hidden = false;
      selectionContent.textContent = "Taxondetails werden geladen …";
      try {
        const detail = await fetchJson(
          `/api/taxonomy/taxa/${encodeURIComponent(result.taxonId)}`,
        );
        if (version !== requestVersion) return;
        selectedDetail = detail;
        renderSelection();
        applySelectedNames();
      } catch (error) {
        if (version !== requestVersion) return;
        clearSelection();
        setMessage(error.message || "Taxondetails konnten nicht geladen werden.", "error");
      }
    };

    const performSearch = async (input, kind, language, version) => {
      if (!available) return;
      const query = String(input?.value || "").trim();
      if (!query) {
        clearResults();
        clearSelection();
        setMessage(
          "Beim Tippen werden passende Namen aus der lokalen Taxonomiereferenz vorgeschlagen.",
          "info",
        );
        return;
      }
      const kingdomIds = currentSearchKingdomIds();
      if (!kingdomIds.length) {
        clearResults();
        clearSelection();
        setMessage(
          "Für die Referenzsuche ist derzeit kein Reich eingeblendet. Die Namen können weiterhin manuell eingegeben werden.",
          "warning",
        );
        return;
      }
      clearSelection();
      setMessage("Passende Namen werden gesucht …", "info");
      const controller = typeof global.AbortController === "function"
        ? new global.AbortController()
        : null;
      activeSearchController = controller;
      try {
        const payload = await fetchJson(taxonomySearchUrl({
          query,
          kind,
          kingdomIds,
          language,
          rank: "species",
          limit: 12,
        }), controller ? { signal: controller.signal } : undefined);
        if (version !== requestVersion) return;
        searchResults = (payload.results || []).filter((result) => (
          NEW_SPECIES_ALLOWED_RANKS.has(String(result.rank || "").toLowerCase())
        ));
        renderResults();
        setMessage(
          searchResults.length
            ? searchResults.length >= 12
              ? "12 Vorschläge werden angezeigt. Bitte den Suchbegriff weiter ergänzen oder einen Eintrag auswählen."
              : `${searchResults.length} ${searchResults.length === 1 ? "Vorschlag" : "Vorschläge"} gefunden. Bitte einen Eintrag auswählen.`
            : "Kein passender Arteintrag in der lokalen Referenz gefunden. Die manuelle Eingabe bleibt möglich.",
          searchResults.length ? "success" : "warning",
        );
      } catch (error) {
        if (version !== requestVersion) return;
        if (error?.name === "AbortError") return;
        clearResults();
        setMessage(
          error.message || "Die lokale Taxonomiesuche ist derzeit nicht verfügbar.",
          "warning",
        );
      } finally {
        if (activeSearchController === controller) activeSearchController = null;
      }
    };

    const searchScheduler = createTaxonomySearchScheduler(
      (input, kind, language, version) => {
        void performSearch(input, kind, language, version);
      },
      { delayMs: debounceMs },
    );

    const scheduleSearch = (input, kind, language = "all") => {
      abortActiveSearch();
      activeInput = input;
      activeKind = kind;
      activeLanguage = language;
      const version = ++requestVersion;
      clearResults();
      clearSelection();
      if (String(input?.value || "").trim()) {
        setMessage("Eingabe erkannt. Die Suche startet gleich …", "info");
      }
      searchScheduler.schedule(input, kind, language, version);
    };

    const initialize = async () => {
      const version = ++requestVersion;
      abortActiveSearch();
      searchScheduler.cancel();
      statusBadge.textContent = "Referenz wird geprüft …";
      statusBadge.dataset.state = "loading";
      kingdomSelect.disabled = true;
      try {
        const status = await fetchJson("/api/taxonomy/status");
        if (version !== requestVersion) return;
        setAvailability(status);
        if (!available) return;
        const kingdoms = await fetchJson("/api/taxonomy/kingdoms");
        if (version !== requestVersion) return;
        renderKingdoms(kingdoms);
      } catch (error) {
        if (version !== requestVersion) return;
        setAvailability({
          available: false,
          message: error.message
            || "Die Taxonomiereferenz ist derzeit nicht verfügbar. Namen können manuell eingegeben werden.",
        });
      }
    };

    const reset = () => {
      requestVersion += 1;
      abortActiveSearch();
      searchScheduler.cancel();
      activeInput = null;
      activeKind = "all";
      activeLanguage = "all";
      clearResults();
      clearSelection();
      if (kingdomSelect.options.length) {
        kingdomSelect.value = selectedKingdomIds.includes(defaultKingdom)
          ? defaultKingdom
          : "all";
      }
      if (available) {
        setMessage(
          "Beim Tippen werden passende Namen aus der lokalen Taxonomiereferenz vorgeschlagen.",
          "info",
        );
      }
    };

    germanInput.addEventListener(
      "input",
      () => scheduleSearch(germanInput, "vernacular", "de"),
    );
    englishInput.addEventListener(
      "input",
      () => scheduleSearch(englishInput, "vernacular", "en"),
    );
    scientificInput.addEventListener(
      "input",
      () => scheduleSearch(scientificInput, "scientific", "all"),
    );
    kingdomSelect.addEventListener("change", () => {
      if (activeInput?.value?.trim()) {
        scheduleSearch(activeInput, activeKind, activeLanguage);
      }
    });
    resultsContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-taxon-id]");
      if (!button) return;
      const result = searchResults.find(
        (entry) => String(entry.taxonId) === button.dataset.taxonId,
      );
      if (result) void selectResult(result);
    });
    kingdomSettingsToggle?.addEventListener("click", () => {
      const willOpen = kingdomSettingsPanel?.hidden !== false;
      if (kingdomSettingsPanel) kingdomSettingsPanel.hidden = !willOpen;
      kingdomSettingsToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen) {
        if (kingdomSettingsFilter) kingdomSettingsFilter.value = "";
        renderKingdomSettings();
        applyKingdomSettingsFilter();
        kingdomSettingsFilter?.focus();
      }
    });
    kingdomSettingsFilter?.addEventListener("input", applyKingdomSettingsFilter);
    kingdomSettingsSave?.addEventListener("click", () => {
      const previousValue = kingdomSelect.value;
      const checkedValues = [...kingdomSettingsList.querySelectorAll("input:checked")]
        .map((input) => input.value);
      selectedKingdomIds = normalizeSelectedKingdomIds(checkedValues, allKingdoms);
      storeSelectedKingdomIds();
      renderKingdomSelect({ preferredValue: previousValue });
      if (kingdomSettingsPanel) kingdomSettingsPanel.hidden = true;
      kingdomSettingsToggle?.setAttribute("aria-expanded", "false");
      setKingdomSettingsMessage();
      if (!selectedKingdomIds.length) {
        requestVersion += 1;
        abortActiveSearch();
        searchScheduler.cancel();
        clearResults();
        clearSelection();
        setMessage(
          "Keine Reiche eingeblendet. Die Namensfelder können weiterhin manuell ausgefüllt werden.",
          "warning",
        );
      } else if (activeInput?.value?.trim()) {
        scheduleSearch(activeInput, activeKind, activeLanguage);
      } else {
        setMessage(
          "Die sichtbaren Reiche wurden gespeichert. Beim Tippen werden passende Namen vorgeschlagen.",
          "success",
        );
      }
    });
    global.document?.addEventListener?.("click", (event) => {
      if (
        kingdomSettingsPanel?.hidden === false
        && kingdomSettings
        && !kingdomSettings.contains(event.target)
      ) {
        kingdomSettingsPanel.hidden = true;
        kingdomSettingsToggle?.setAttribute("aria-expanded", "false");
      }
    });
    selectionContent.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-taxonomy-correction]")?.dataset
        .taxonomyCorrection;
      if (!action || !selectedDetail) return;
      const view = taxonomyDetailPresentation(selectedDetail, selectedResult);
      const button = event.target.closest("button");
      button.disabled = true;
      try {
        if (action === "save") {
          selectedDetail = await fetchJson("/api/taxonomy/corrections/save", {
            method: "POST",
            body: JSON.stringify({
              scientificName: view.scientificName,
              germanName: selectionContent.querySelector(
                "[name='correctionGermanName']",
              )?.value || "",
              englishName: selectionContent.querySelector(
                "[name='correctionEnglishName']",
              )?.value || "",
              note: selectionContent.querySelector("[name='correctionNote']")?.value || "",
            }),
          });
          selectedResult = {
            ...selectedResult,
            germanName: selectedDetail.germanNames?.[0]?.name || null,
            englishName: selectedDetail.englishNames?.[0]?.name || null,
            hasVerifiedGermanName: Boolean(selectedDetail.germanNames?.[0]?.name),
          };
          renderSelection();
          applySelectedNames();
          setMessage("Die eigene Namenskorrektur wurde gespeichert und übernommen.", "success");
        } else {
          await fetchJson("/api/taxonomy/corrections/reset", {
            method: "POST",
            body: JSON.stringify({ scientificName: view.scientificName }),
          });
          selectedDetail = await fetchJson(
            `/api/taxonomy/taxa/${encodeURIComponent(selectedResult.taxonId)}`,
          );
          selectedResult = {
            ...selectedResult,
            germanName: selectedDetail.germanNames?.[0]?.name || null,
            englishName: selectedDetail.englishNames?.[0]?.name || null,
            hasVerifiedGermanName: Boolean(selectedDetail.germanNames?.[0]?.name),
          };
          renderSelection();
          applySelectedNames();
          setMessage("Die eigene Namenskorrektur wurde zurückgesetzt.", "success");
        }
      } catch (error) {
        setMessage(error.message || "Die Namenskorrektur konnte nicht gespeichert werden.", "error");
        button.disabled = false;
      }
    });

    return Object.freeze({
      initialize,
      reset,
    });
  }

  global.SpeciesExplorerTaxonomyReference = Object.freeze({
    taxonomySearchUrl,
    taxonomyReferenceStatus,
    taxonomyAvailabilityPresentation,
    sortTaxonomyKingdoms,
    filterTaxonomyKingdoms,
    createTaxonomySearchScheduler,
    TAXONOMY_SEARCH_DEBOUNCE_MS,
    normalizeSelectedKingdomIds,
    taxonomyResultPresentation,
    taxonomyDetailPresentation,
    createTaxonomyReferenceController,
  });
})(globalThis);
