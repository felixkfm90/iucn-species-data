(function initializeSpeciesExplorerDetailView(global) {
  "use strict";

  function createDetailViewRenderer(dependencies = {}) {
    const {
      state,
      elements,
      escapeHtml,
      formatBytes,
      formatIucnFetchDate,
      formatIucnStatus,
      assetStatusText,
      dataRows,
      formatSexSpecificDataValue,
      iucnStatusIconUrl,
      iucnTrendIconUrl,
      iconDataValue,
      creditValue,
      creditLink,
      soundLicenseInfo,
      creditLinkWithLicense,
      assetVersionKey,
      versionedAssetUrl,
      sizeUnits,
      weightUnits,
      ageUnits,
      parseManualMeasurement,
      renderUnitOptions,
      renderManualMeasurementEditor,
      iucnDistributionMapUrl,
      inlineEditButton,
      sectionActions,
      mapPanel,
      speciesImagePanel,
      setupAudioPlayer,
      setupMapZoom,
      setupPortraitZoom,
      setupSpeciesEditor,
      setupSpeciesRefresh,
      setupSpeciesDelete,
    } = dependencies;
    const MANUAL_SIZE_UNITS = sizeUnits;
    const MANUAL_WEIGHT_UNITS = weightUnits;
    const MANUAL_AGE_UNITS = ageUnits;

    function renderDetail(species) {
      const browserMapUrl = iucnDistributionMapUrl(species);
      const editableSize = parseManualMeasurement(
        species.manual.size,
        MANUAL_SIZE_UNITS,
        "cm",
      );
      const editableWeight = parseManualMeasurement(
        species.manual.weight,
        MANUAL_WEIGHT_UNITS,
        "g",
      );
      const editableLifeExpectancy = parseManualMeasurement(
        species.manual.lifeExpectancy,
        MANUAL_AGE_UNITS,
        "Jahre",
        { age: true },
      );
      const detailMapUrl = versionedAssetUrl(species.assets.map.url, species.assets.map);
      const detailPortraitUrl = versionedAssetUrl(species.assets.portrait.url, species.assets.portrait);
      const soundVersion = assetVersionKey(
        species.assets.sound,
        species.assets.spectrogram?.soundSha256,
        species.assets.spectrogram?.actualSoundSha256,
      );
      const soundUrl = versionedAssetUrl(species.assets.sound.url, species.assets.sound, soundVersion);
      const spectrogramUrl = versionedAssetUrl(
        species.assets.spectrogram.url,
        species.assets.spectrogram,
        species.assets.spectrogram?.soundSha256,
      );
      const statusIconUrl = iucnStatusIconUrl(species.iucn.status);
      const statusTitle = formatIucnStatus(species.iucn.status);
      const trendIconUrl = iucnTrendIconUrl(species.iucn.trend);
      const trendTitle = `Populationstrend: ${species.iucn.trend || "Unbekannt"}`;
      const badges = [
        statusIconUrl
          ? `<span class="iucn-heading-status" title="${escapeHtml(statusTitle)}">
              <img src="${escapeHtml(statusIconUrl)}" alt="">
              <span class="visually-hidden">${escapeHtml(statusTitle)}</span>
            </span>`
          : `<span class="status-pill">${escapeHtml(species.iucn.status)}</span>`,
        trendIconUrl
          ? `<span class="iucn-heading-trend" title="${escapeHtml(trendTitle)}">
              <img src="${escapeHtml(trendIconUrl)}" alt="">
              <span class="visually-hidden">${escapeHtml(trendTitle)}</span>
            </span>`
          : "",
        species.assetIssues.length
          ? `<span class="status-pill error">${species.assetIssues.length} Assetproblem(e)</span>`
          : `<span class="status-pill ok">Assets vollständig</span>`,
        species.dataIssues.length
          ? `<span class="status-pill error">${species.dataIssues.length} Datenhinweis(e)</span>`
          : "",
        species.isNcSound ? `<span class="status-pill warning">NC-Sound</span>` : "",
      ].filter(Boolean).join("");
      const detailSoundLicenseInfo = soundLicenseInfo({
        isNc: species.isNcSound,
        license: species.credits?.license,
      });

      const audio = species.assets.sound.exists
        ? `
          <div class="audio-player">
            <audio class="explorer-audio" preload="metadata" src="${escapeHtml(soundUrl)}"></audio>
            <div
              class="audio-visual"
              role="button"
              tabindex="0"
              aria-label="Spektrogramm: klicken zum Springen, Leertaste zum Abspielen"
            >
              ${species.assets.spectrogram.exists
                ? `<img src="${escapeHtml(spectrogramUrl)}" alt="Spektrogramm ${escapeHtml(species.germanName)}">`
                : `<span class="media-missing">Kein Spektrogramm vorhanden</span>`}
              <span class="audio-progress-marker" aria-hidden="true"></span>
            </div>
            <div class="audio-controls">
              <button class="audio-play-toggle" type="button" aria-label="Abspielen">▶</button>
              <span class="audio-time">0:00 / 0:00</span>
              <label class="audio-volume-control">
                <span>Lautstärke</span>
                <input class="audio-volume" type="range" min="0" max="1" step="0.05" value="1">
              </label>
            </div>
          </div>
        `
        : `<p class="media-missing">${
          species.soundMissingKnown
            ? "Keine automatische Tonquelle gefunden. Falls später ein geeigneter Sound verfügbar ist, manuell pflegen."
            : "Keine Sounddatei vorhanden."
        }</p>`;

      const issueGroups = [
        { title: "Datenabweichungen", entries: species.dataIssues, className: "error" },
        { title: "Assetprobleme", entries: species.assetIssues, className: "error" },
        { title: "Hinweise", entries: species.careHints || [], className: "care" },
      ].filter((group) => group.entries.length > 0);
      const issues = issueGroups.length
        ? `
          <section class="issues-section">
            <h3 class="section-title">Validierungshinweise</h3>
            <div class="issue-groups">
              ${issueGroups.map(({ title, entries, className }) => `
                <div class="${escapeHtml(className)}">
                  <h4>${escapeHtml(title)}</h4>
                  <ul>${entries.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
                </div>
              `).join("")}
            </div>
          </section>
        `
        : "";

      elements.detailPanel.innerHTML = `
        ${state.notice ? `
          <div class="save-notice" role="status">
            ${escapeHtml(state.notice)}
          </div>
        ` : ""}

        <header class="detail-header">
          <div>
            <div class="detail-title-row">
              <h2>${escapeHtml(species.germanName)}</h2>
              <div class="detail-badges">${badges}</div>
            </div>
            <p class="scientific-name">${escapeHtml(species.scientificName)}</p>
          </div>
          <div class="detail-meta">
            ${species.inInput ? `
              <div class="section-actions detail-actions edit-only" aria-label="Artaktionen">
                <button class="refresh-species-open" type="button">Art aktualisieren</button>
                <button class="delete-species-open danger" type="button">Löschen</button>
              </div>
            ` : ""}
            <p class="detail-fetched-at">
              IUCN-Daten abgerufen: <strong>${escapeHtml(formatIucnFetchDate(species.iucn.fetchedAt))}</strong>
            </p>
          </div>
        </header>

        <div class="detail-media-layout">
          ${mapPanel(
            species.assets.map,
            `Verbreitungskarte ${species.germanName}`,
            species.inInput ? "map" : "",
          )}

          <section class="audio-section">
            <div class="section-heading">
              <h3 class="section-title">Tierstimme${species.assets.sound.exists ? ` · ${formatBytes(species.assets.sound.bytes)}` : ""}</h3>
              ${sectionActions(
                species.inInput ? "sound" : "",
                species.inInput && (species.assets.sound.exists || species.assets.credits.exists || species.assets.spectrogram.exists)
                  ? "sound"
                  : "",
                "Soundpaket löschen",
                species.inInput ? "sound" : "",
                species.assets.sound.backup,
              )}
            </div>
            <div class="audio-body">
              ${audio}
              <details class="audio-credits" open>
                <summary>Quellen und Lizenz</summary>
                <div class="credit-grid">
                  <div><span>Quelle</span><strong>${escapeHtml(creditValue(species.credits, "source"))}</strong></div>
                  <div><span>Aufnahme</span><strong>${escapeHtml(creditValue(species.credits, "recordist"))}</strong></div>
                  <div><span>Qualität</span><strong>${escapeHtml(creditValue(species.credits, "quality"))}</strong></div>
                  <div><span>Land</span><strong>${escapeHtml(creditValue(species.credits, "country"))}</strong></div>
                  <div><span>Lizenz</span>${creditLinkWithLicense(species.credits, "license", "Lizenz öffnen", detailSoundLicenseInfo)}</div>
                  <div><span>Original</span>${creditLink(species.credits, "url", "Quelle öffnen")}</div>
                </div>
              </details>
            </div>
          </section>

          ${speciesImagePanel(species)}
        </div>

        <div class="data-grid">
          <section class="data-section">
            <div class="section-heading">
              <h3 class="section-title">Manuelle Daten</h3>
              ${species.inInput ? inlineEditButton("manual") : ""}
            </div>
            <dl class="data-list">
              ${dataRows([
                ["Größe", formatSexSpecificDataValue(species.manual.size)],
                ["Gewicht", formatSexSpecificDataValue(species.manual.weight)],
                ["Lebenserwartung", species.manual.lifeExpectancy],
                ["URL-Slug", species.slug || "Unbekannt"],
                ["Assetname", species.safeName],
              ])}
            </dl>
          </section>

          <section class="data-section">
            <h3 class="section-title">IUCN-Daten</h3>
            <dl class="data-list">
              ${dataRows([
                ["Kategorie", iconDataValue(species.iucn.category, statusIconUrl)],
                ["Trend", iconDataValue(species.iucn.trend, trendIconUrl, "trend")],
                ["Population", species.iucn.population],
                ["Generationsdauer", species.iucn.generationLength],
                ["Assessment ID", species.iucn.assessmentId],
                ["IUCN Update", species.iucn.lastUpdate],
              ])}
            </dl>
          </section>

          <section class="data-section">
            <h3 class="section-title">Taxonomie</h3>
            <dl class="data-list">
              ${dataRows([
                ["Reich", species.taxonomy.kingdom],
                ["Stamm", species.taxonomy.phylum],
                ...(species.taxonomy.subphylum === "Unbekannt"
                  ? []
                  : [["Unterstamm", species.taxonomy.subphylum]]),
                ["Klasse", species.taxonomy.className],
                ["Ordnung", species.taxonomy.order],
                ["Familie", species.taxonomy.family],
                ["Gattung", species.taxonomy.genus],
                ["Art", species.taxonomy.species],
              ])}
            </dl>
          </section>

          <section class="data-section">
            <h3 class="section-title">Assetstatus</h3>
            <dl class="data-list">
              ${dataRows([
                ["Karte", assetStatusText(species.assets.map)],
                ["Sound", species.soundMissingKnown
                  ? "Keine automatische Tonquelle gefunden · Hinweis S"
                  : assetStatusText(species.assets.sound)],
                ["Credits", species.soundMissingKnown
                  ? "Ohne Sound nicht erforderlich"
                  : assetStatusText(species.assets.credits)],
                ["Spektrogramm", species.soundMissingKnown
                  ? "Ohne Sound nicht erforderlich"
                  : assetStatusText(species.assets.spectrogram)],
                ["Artporträt", species.assets.portrait.exists
                  ? `Vorhanden${species.assets.portrait.hashVerified ? " · Hash geprüft" : ""}`
                  : "Optional · nicht vorhanden"],
                ["Soundlizenz", species.isNcSound ? "NC · intern prüfen" : "Frei/nicht als NC markiert"],
              ])}
            </dl>
          </section>
        </div>

        ${issues}

        <dialog class="edit-dialog" aria-labelledby="edit-dialog-title">
          <form class="edit-form">
            <header class="edit-dialog-header">
              <div>
                <h3 id="edit-dialog-title">${escapeHtml(species.germanName)} bearbeiten</h3>
                <p>${escapeHtml(species.scientificName)} · Taxonomie ist gesperrt.</p>
              </div>
              <button class="edit-cancel edit-close" type="button" aria-label="Bearbeiten schließen">×</button>
            </header>

            <section class="manual-edit-section">
              <header>
                <div>
                  <h4>Allgemeine Daten bearbeiten</h4>
                  <p>Deutscher Name, wissenschaftlicher Name, Größe, Gewicht und Lebenserwartung werden in der manuellen Artenliste gespeichert.</p>
                </div>
              </header>

              <div class="edit-fields new-species-fields manual-species-fields">
                <label data-field="germanName">
                  <span>Deutscher Name</span>
                  <input name="germanName" maxlength="160" value="${escapeHtml(species.germanName)}">
                </label>
                <label class="scientific-name-field" data-field="scientificName">
                  <span>Wissenschaftlicher Name</span>
                  <div class="locked-input-row">
                    <input
                      class="scientific-name-input"
                      name="scientificName"
                      maxlength="201"
                      readonly
                      data-unlocked="false"
                      value="${escapeHtml(species.scientificName)}"
                    >
                    <button
                      class="scientific-name-unlock"
                      type="button"
                      title="Wissenschaftlichen Namen entsperren"
                      aria-label="Wissenschaftlichen Namen entsperren"
                    >🔒</button>
                  </div>
                  <small class="scientific-name-warning" hidden>
                    Änderung ändert den URL-Slug und kann sich direkt auf die Website auswirken.
                  </small>
                </label>
                ${renderManualMeasurementEditor({
                  kind: "size",
                  label: "Größe",
                  parsed: editableSize,
                  units: MANUAL_SIZE_UNITS,
                })}
                ${renderManualMeasurementEditor({
                  kind: "weight",
                  label: "Gewicht",
                  parsed: editableWeight,
                  units: MANUAL_WEIGHT_UNITS,
                })}
                <label data-field="lifeExpectancy">
                  <span>Lebenserwartung</span>
                  <span class="new-species-value-unit age-unit">
                    <span aria-hidden="true">ca.</span>
                    <input
                      name="lifeExpectancy"
                      type="text"
                      maxlength="80"
                      autocomplete="off"
                      value="${escapeHtml(editableLifeExpectancy.value)}"
                    >
                    <select name="lifeExpectancyUnit" aria-label="Alterseinheit">
                      ${renderUnitOptions(MANUAL_AGE_UNITS, editableLifeExpectancy.unit)}
                    </select>
                  </span>
                </label>
              </div>

              <p class="edit-message" hidden></p>

              <section class="edit-preview" hidden>
                <h4>Diff-Vorschau</h4>
                <div class="edit-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Feld</th><th>Vorher</th><th>Nachher</th></tr>
                    </thead>
                    <tbody class="edit-preview-rows"></tbody>
                  </table>
                </div>
                <p class="edit-warning">
                  Speichern merkt die Änderung lokal vor. Veröffentlichung erfolgt anschließend über „Änderungen übertragen“.
                </p>
              </section>
            </section>

              <section class="portrait-edit-section">
              <header>
                <div>
                  <h4>Artporträt erstellen und importieren</h4>
                  <p>
                    Die App erstellt den Prompt ohne API-Kosten. Das Bild wird selbst in ChatGPT erzeugt,
                    heruntergeladen und anschließend hier geprüft.
                  </p>
                </div>
                <div class="asset-header-actions">
                  <span class="portrait-care-state">
                    ${species.assets.portrait.exists ? "Porträt vorhanden" : "Noch kein Porträt"}
                  </span>
                </div>
              </header>

              <div class="portrait-species-lock">
                <span>Art</span>
                <strong>${escapeHtml(species.germanName)} · ${escapeHtml(species.scientificName)}</strong>
              </div>

              <label class="portrait-instructions-field">
                <span>Zusätzliche Hinweise · optional</span>
                <textarea
                  class="portrait-instructions-input"
                  maxlength="800"
                  rows="3"
                  placeholder="z. B. adultes Männchen im Brutkleid; vollständiger Schwanz sichtbar"
                ></textarea>
              </label>

              <div class="portrait-prompt-actions">
                <button class="portrait-prompt-button" type="button">Prompt erstellen</button>
                <button class="portrait-copy-button" type="button" disabled>Prompt kopieren</button>
              </div>

              <details class="portrait-prompt-details" hidden>
                <summary>Prompt anzeigen</summary>
                <pre class="portrait-prompt-preview"></pre>
              </details>

              <label class="asset-file-field portrait-file-field">
                <span>In ChatGPT erzeugtes Bild</span>
                <input
                  class="portrait-file-input"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                >
              </label>

              <p class="edit-message portrait-edit-message" hidden></p>

              <section class="portrait-edit-preview" hidden>
                <div class="portrait-compare-grid">
                  <figure>
                    <figcaption>Bisheriges Artporträt</figcaption>
                    <div class="portrait-compare-frame">
                      <img
                        class="portrait-preview-current"
                        alt="Bisheriges Artporträt ${escapeHtml(species.germanName)}"
                      >
                    </div>
                    <p class="portrait-current-meta"></p>
                  </figure>
                  <figure>
                    <figcaption>Neue KI-Vorschau</figcaption>
                    <div class="portrait-compare-frame">
                      <img
                        class="portrait-preview-new"
                        alt="Neue Artporträt-Vorschau ${escapeHtml(species.germanName)}"
                      >
                    </div>
                    <p class="portrait-new-meta"></p>
                  </figure>
                </div>
                <p class="edit-warning">
                  Vor der Übernahme müssen Artmerkmale, Anatomie, Gliedmaßen, Zehen, Flügel, Flossen, Schwanz und
                  Bildränder geprüft werden. Speichern legt <code>portrait.webp</code> und
                  <code>portrait.json</code> an und führt anschließend Commit und Push aus.
                </p>
              </section>

              <div class="portrait-edit-actions">
                ${species.assets.portrait.exists ? `
                  <button class="portrait-keep-button" type="button">Bisheriges Artporträt beibehalten</button>
                ` : ""}
                <button class="portrait-preview-button" type="button">Bild prüfen</button>
                <button class="portrait-save-button" type="button" disabled>Artporträt übernehmen</button>
              </div>
            </section>

            <section class="map-edit-section">
              <header>
                <div>
                  <h4>Verbreitungskarte ersetzen</h4>
                  <p>JPEG- oder PNG-Datei bis 20 MB oder direkter Karten-JPEG-Link. Pflegegrund wird dauerhaft dokumentiert; Quellen-URL ist nur bei Linkimport Pflicht.</p>
                </div>
                <div class="asset-header-actions">
                  ${browserMapUrl ? `
                    <a
                      class="map-browser-link"
                      href="${escapeHtml(browserMapUrl)}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >IUCN-Karte im Browser öffnen</a>
                  ` : ""}
                  <button class="map-auto-search-button" type="button">Automatisch suchen</button>
                  <span class="map-care-state">
                    ${species.assets.map.manuallyAdded ? "Manuell geschützt" : "Automatische Pflege"}
                  </span>
                </div>
              </header>

              <div class="map-edit-fields">
                <label class="asset-file-field map-file-field">
                  <span>Neue Karten-Datei</span>
                  <input class="map-file-input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png">
                </label>
                <label class="asset-reason-field map-reason-field">
                  <span>Pflegegrund</span>
                  <textarea
                    class="map-reason-input"
                    maxlength="500"
                    rows="2"
                    placeholder="Warum wird diese Karte manuell gepflegt?"
                  >${escapeHtml(species.assets.map.manualReason || "")}</textarea>
                </label>
                <label class="map-source-field">
                  <span>Quellen-URL</span>
                  <input
                    class="map-source-input"
                    type="url"
                    maxlength="2000"
                    placeholder="https://… oder signierter IUCN/Backblaze-JPEG-Link"
                    value="${escapeHtml(species.assets.map.source || "")}"
                  >
                </label>
              </div>

              <p class="edit-message map-edit-message" hidden></p>

              <section class="map-edit-preview" hidden>
                <div class="map-compare-grid">
                  <figure>
                    <figcaption>Bisherige Karte</figcaption>
                    <div class="map-compare-frame">
                      <img class="map-preview-current" alt="Bisherige Karte ${escapeHtml(species.germanName)}">
                    </div>
                    <p class="map-current-meta"></p>
                  </figure>
                  <figure>
                    <figcaption>Neue Karte</figcaption>
                    <div class="map-compare-frame">
                      <img class="map-preview-new" alt="Neue Karte ${escapeHtml(species.germanName)}">
                    </div>
                    <p class="map-new-meta"></p>
                  </figure>
                </div>
                <p class="edit-warning">
                  Speichern ersetzt <code>map.jpg</code>, legt ein lokales Backup an, aktiviert den manuellen
                  Pipeline-Schutz und führt anschließend Commit und Push aus.
                </p>
              </section>

              <div class="map-edit-actions">
                <button class="map-preview-button" type="button">Karte prüfen</button>
                <button class="map-save-button" type="button" disabled>Karte ersetzen</button>
              </div>
            </section>

            <section class="sound-edit-section">
              <header>
                <div>
                  <h4>Sound und Credits ersetzen</h4>
                  <p>MP3 und Credits werden nur gemeinsam gespeichert. Die Lizenz bleibt eine manuelle Prüfentscheidung.</p>
                </div>
                <div class="asset-header-actions">
                  ${!species.assets.sound.manuallyAdded ? `
                    <button class="sound-auto-search-button" type="button">
                      ${species.assets.sound.exists ? "Alternative suchen" : "Automatisch suchen"}
                    </button>
                  ` : ""}
                  <span class="sound-care-state">
                    ${species.assets.sound.manuallyAdded ? "Manuell geschützt" : "Automatische Pflege"}
                  </span>
                </div>
              </header>

              <div class="sound-species-lock">
                <span>Art</span>
                <strong>${escapeHtml(species.germanName)} · ${escapeHtml(species.scientificName)}</strong>
              </div>

              ${species.assets.sound.exists ? `
                <section class="current-sound-preview">
                  <div>
                    <strong>Aktueller Sound</strong>
                    <span>${escapeHtml(species.isNcSound ? "NC-Lizenz" : "frei/akzeptiert")}</span>
                  </div>
                  <audio class="current-sound-audio" controls preload="metadata" src="${escapeHtml(soundUrl)}"></audio>
                </section>
              ` : ""}

              <div class="sound-edit-fields">
                <label class="asset-file-field sound-file-field">
                  <span>Neue MP3-Datei</span>
                  <input class="sound-file-input" type="file" accept=".mp3,audio/mpeg">
                </label>
                <label class="asset-reason-field sound-reason-field">
                  <span>Pflegegrund</span>
                  <textarea
                    class="sound-reason-input"
                    maxlength="500"
                    rows="2"
                    placeholder="Warum wird dieser Sound manuell gepflegt?"
                  >${escapeHtml(species.assets.sound.manualReason || "")}</textarea>
                </label>
                <label class="sound-recordist-field">
                  <span>Aufnahme / Urheber</span>
                  <input
                    class="sound-credit-input"
                    name="soundRecordist"
                    maxlength="500"
                    value="${escapeHtml(species.credits?.recordist || "")}"
                  >
                </label>
                <label class="sound-source-field">
                  <span>Quelle</span>
                  <input
                    class="sound-credit-input"
                    name="soundSource"
                    maxlength="500"
                    placeholder="z. B. xeno-canto.org"
                    value="${escapeHtml(species.credits?.source || "")}"
                  >
                </label>
                <label class="sound-url-field">
                  <span>Original-URL</span>
                  <input
                    class="sound-credit-input"
                    name="soundUrl"
                    type="url"
                    maxlength="2000"
                    placeholder="https://…"
                    value="${escapeHtml(species.credits?.url || "")}"
                  >
                </label>
                <label class="sound-license-field">
                  <span>Lizenz-URL</span>
                  <input
                    class="sound-credit-input"
                    name="soundLicense"
                    type="url"
                    maxlength="2000"
                    placeholder="https://creativecommons.org/…"
                    value="${escapeHtml(species.credits?.license || "")}"
                  >
                </label>
                <label class="sound-country-field">
                  <span>Land</span>
                  <input
                    class="sound-credit-input"
                    name="soundCountry"
                    maxlength="240"
                    value="${escapeHtml(species.credits?.country || "")}"
                  >
                </label>
                <label class="sound-location-field">
                  <span>Ort</span>
                  <input
                    class="sound-credit-input"
                    name="soundLocation"
                    maxlength="500"
                    value="${escapeHtml(species.credits?.location || "")}"
                  >
                </label>
                <label class="sound-quality-field">
                  <span>Qualität</span>
                  <input
                    class="sound-credit-input"
                    name="soundQuality"
                    maxlength="120"
                    value="${escapeHtml(species.credits?.quality || "")}"
                  >
                </label>
                <label class="sound-notes-field">
                  <span>Notizen</span>
                  <textarea
                    class="sound-credit-input"
                    name="soundNotes"
                    maxlength="2000"
                    rows="2"
                  >${escapeHtml(species.credits?.notes || "")}</textarea>
                </label>
              </div>

              <p class="edit-message sound-edit-message" hidden></p>

              <section class="sound-edit-preview" hidden>
                <div class="sound-compare-grid">
                  <figure>
                    <figcaption>Bisheriger Sound</figcaption>
                    <audio class="sound-preview-current" controls preload="metadata"></audio>
                    <p class="sound-current-meta"></p>
                  </figure>
                  <figure>
                    <figcaption>Neuer Sound</figcaption>
                    <audio class="sound-preview-new" controls preload="metadata"></audio>
                    <p class="sound-new-meta"></p>
                  </figure>
                </div>
                <span class="sound-license-state"></span>
                <dl class="data-list sound-credits-preview"></dl>
                <p class="edit-warning">
                  Speichern sichert das bisherige Soundpaket und ersetzt <code>sound.mp3</code>,
                  <code>credits.json</code> und <code>spectrogram.webp</code> gemeinsam. Das neue Spektrogramm wird
                  automatisch erzeugt und über SHA-256 mit dem Sound verknüpft.
                </p>
              </section>

              <div class="sound-edit-actions">
                ${species.assets.sound.exists ? `
                  <button class="sound-reject-current-button danger" type="button">
                    Aktuellen Sound ablehnen
                  </button>
                ` : ""}
                <button class="sound-preview-button" type="button">Sound und Credits prüfen</button>
                <button class="sound-save-button" type="button" disabled>Sound und Credits ersetzen</button>
              </div>
            </section>

            <div class="edit-actions manual-edit-actions">
              <button class="edit-cancel" type="button">Abbrechen</button>
              <button class="edit-preview-button" type="submit">Änderungen prüfen</button>
              <button class="edit-save-button" type="button" disabled>Jetzt speichern</button>
            </div>
          </form>
        </dialog>

        ${species.inInput ? `
          <dialog class="edit-dialog delete-dialog" aria-labelledby="delete-dialog-title">
            <form class="edit-form delete-form">
              <header class="edit-dialog-header">
                <div>
                  <h3 id="delete-dialog-title">${escapeHtml(species.germanName)} löschen</h3>
                  <p>${escapeHtml(species.scientificName)}</p>
                </div>
                <button class="edit-close delete-cancel" type="button" aria-label="Dialog schließen">×</button>
              </header>
              <p class="edit-message delete-message" hidden></p>
              <div class="delete-effects"></div>
              <label class="delete-assets-option">
                <input class="delete-assets-now" type="checkbox">
                <span>Zugehörige generierte Daten und Assets sofort dauerhaft löschen</span>
              </label>
              <p class="edit-warning delete-assets-warning"></p>
              <div class="edit-actions">
                <button class="delete-cancel" type="button">Abbrechen</button>
                <button class="delete-confirm danger" type="submit" disabled>Aus Artenliste entfernen</button>
              </div>
            </form>
          </dialog>
        ` : ""}

        ${species.assets.map.exists ? `
          <dialog class="map-lightbox" aria-label="Vergrößerte Verbreitungskarte ${escapeHtml(species.germanName)}">
            <button class="map-lightbox-close" type="button" aria-label="Vergrößerte Karte schließen">×</button>
            <img src="${escapeHtml(detailMapUrl)}" alt="${escapeHtml(`Verbreitungskarte ${species.germanName}`)}">
          </dialog>
        ` : ""}

        ${species.assets.portrait.exists ? `
          <dialog class="map-lightbox portrait-lightbox" aria-label="Vergrößertes Artporträt ${escapeHtml(species.germanName)}">
            <button class="map-lightbox-close portrait-lightbox-close" type="button" aria-label="Artporträt schließen">×</button>
            <img
              src="${escapeHtml(detailPortraitUrl)}"
              alt="${escapeHtml(`Illustriertes Artporträt ${species.germanName}`)}"
            >
          </dialog>
        ` : ""}
      `;

      setupAudioPlayer();
      setupMapZoom();
      setupPortraitZoom();
      setupSpeciesEditor(species);
      setupSpeciesRefresh(species);
      setupSpeciesDelete(species);
    }

    return renderDetail;
  }

  global.SpeciesExplorerDetailView = Object.freeze({
    createDetailViewRenderer,
  });
})(globalThis);
