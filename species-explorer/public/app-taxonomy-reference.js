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

  function taxonomySearchUrl({
    query,
    kind = "all",
    kingdomId = "Animalia",
    limit = 12,
  } = {}) {
    const parameters = [
      ["q", String(query ?? "").trim()],
      ["kind", String(kind || "all")],
      ["kingdomId", String(kingdomId || "Animalia")],
      ["limit", String(limit)],
    ];
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
    return kingdoms.sort((left, right) => left.label.localeCompare(
      right.label,
      "de",
      { numeric: true, sensitivity: "base" },
    ));
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
    const note = [
      synonym,
      usesEnglishFallback ? "Englischer Ersatzname" : "",
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
          value: String(entry.scientific_name || "").trim(),
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
    };
  }

  function createTaxonomyReferenceController({
    root,
    form,
    fetchJson,
    escapeHtml,
    onNamesChanged = () => {},
    debounceMs = 160,
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
    const applyButton = section.querySelector(".taxonomy-reference-apply");
    const manualButton = section.querySelector(".taxonomy-reference-manual");
    const germanInput = form.elements.german;
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
    let searchTimer = null;
    let requestVersion = 0;
    let activeInput = null;
    let activeKind = "all";
    let searchResults = [];
    let selectedResult = null;
    let selectedDetail = null;

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
      applyButton.disabled = true;
    };

    const renderKingdoms = (payload = {}) => {
      kingdomSelect.replaceChildren();
      defaultKingdom = payload.defaultKingdom || "Animalia";
      const kingdoms = sortTaxonomyKingdoms(payload.values, {
        includesAllOption: payload.includesAllOption,
      });
      for (const kingdom of kingdoms) {
        const option = document.createElement("option");
        option.value = kingdom.id;
        option.textContent = kingdom.label;
        option.selected = kingdom.id === defaultKingdom;
        kingdomSelect.append(option);
      }
      kingdomSelect.value = defaultKingdom;
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
          ].filter(Boolean).join(" · "))}
        </p>
        <dl class="taxonomy-reference-hierarchy">${hierarchy}</dl>
        <p class="taxonomy-reference-source">
          Quelle: ${escape(view.source)}
          ${view.releaseId ? ` · Stand: ${escape(view.releaseId)}` : ""}
          ${view.sourceId ? ` · ID: ${escape(view.sourceId)}` : ""}
        </p>
        ${fallback}
      `;
      selection.hidden = false;
      applyButton.disabled = !view.scientificName;
    };

    const selectResult = async (result) => {
      const version = ++requestVersion;
      selectedResult = result;
      selectedDetail = null;
      selection.hidden = false;
      applyButton.disabled = true;
      selectionContent.textContent = "Taxondetails werden geladen …";
      try {
        const detail = await fetchJson(
          `/api/taxonomy/taxa/${encodeURIComponent(result.taxonId)}`,
        );
        if (version !== requestVersion) return;
        selectedDetail = detail;
        renderSelection();
        setMessage(
          "Vorschlag ausgewählt. Die Eingabefelder ändern sich erst mit „Vorschlag übernehmen“.",
          "info",
        );
      } catch (error) {
        if (version !== requestVersion) return;
        clearSelection();
        setMessage(error.message || "Taxondetails konnten nicht geladen werden.", "error");
      }
    };

    const performSearch = async (input, kind) => {
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
      const version = ++requestVersion;
      clearSelection();
      setMessage("Passende Namen werden gesucht …", "info");
      try {
        const payload = await fetchJson(taxonomySearchUrl({
          query,
          kind,
          kingdomId: kingdomSelect.value || defaultKingdom,
          limit: 12,
        }));
        if (version !== requestVersion) return;
        searchResults = (payload.results || []).filter((result) => (
          NEW_SPECIES_ALLOWED_RANKS.has(String(result.rank || "").toLowerCase())
        ));
        renderResults();
        setMessage(
          searchResults.length
            ? `${searchResults.length} ${searchResults.length === 1 ? "Vorschlag" : "Vorschläge"} gefunden. Bitte einen Eintrag auswählen.`
            : "Kein passender Arteintrag in der lokalen Referenz gefunden. Die manuelle Eingabe bleibt möglich.",
          searchResults.length ? "success" : "warning",
        );
      } catch (error) {
        if (version !== requestVersion) return;
        clearResults();
        setMessage(
          error.message || "Die lokale Taxonomiesuche ist derzeit nicht verfügbar.",
          "warning",
        );
      }
    };

    const scheduleSearch = (input, kind) => {
      activeInput = input;
      activeKind = kind;
      clearTimeout(searchTimer);
      clearResults();
      clearSelection();
      searchTimer = setTimeout(() => {
        void performSearch(input, kind);
      }, debounceMs);
    };

    const initialize = async () => {
      const version = ++requestVersion;
      clearTimeout(searchTimer);
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
      clearTimeout(searchTimer);
      activeInput = null;
      activeKind = "all";
      clearResults();
      clearSelection();
      if (kingdomSelect.options.length) kingdomSelect.value = defaultKingdom;
      if (available) {
        setMessage(
          "Beim Tippen werden passende Namen aus der lokalen Taxonomiereferenz vorgeschlagen.",
          "info",
        );
      }
    };

    germanInput.addEventListener("input", () => scheduleSearch(germanInput, "vernacular"));
    scientificInput.addEventListener(
      "input",
      () => scheduleSearch(scientificInput, "scientific"),
    );
    kingdomSelect.addEventListener("change", () => {
      if (activeInput?.value?.trim()) scheduleSearch(activeInput, activeKind);
    });
    resultsContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-taxon-id]");
      if (!button) return;
      const result = searchResults.find(
        (entry) => String(entry.taxonId) === button.dataset.taxonId,
      );
      if (result) void selectResult(result);
    });
    manualButton.addEventListener("click", () => {
      requestVersion += 1;
      clearTimeout(searchTimer);
      clearResults();
      clearSelection();
      setMessage("Manuelle Eingabe ist aktiv. Die normale Eingabeprüfung bleibt unverändert.", "info");
      germanInput.focus();
    });
    applyButton.addEventListener("click", () => {
      if (!selectedDetail) return;
      const view = taxonomyDetailPresentation(selectedDetail, selectedResult);
      scientificInput.value = view.scientificName;
      if (view.nameToApply) germanInput.value = view.nameToApply;
      onNamesChanged();
      clearResults();
      setMessage(
        view.germanName
          ? "Deutscher und wissenschaftlicher Name wurden übernommen. Bitte alle Angaben anschließend prüfen."
          : view.usesEnglishFallback
            ? "Englischer Ersatzname und wissenschaftlicher Name wurden übernommen. Bitte den Namen prüfen; ein später verfügbarer deutscher Name wird künftig bevorzugt vorgeschlagen."
            : "Der wissenschaftliche Name wurde übernommen. Bitte den deutschen Namen ergänzen und alle Angaben prüfen.",
        "success",
      );
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
    taxonomyResultPresentation,
    taxonomyDetailPresentation,
    createTaxonomyReferenceController,
  });
})(globalThis);
