(function initializeWebsiteAltTexts(global) {
  "use strict";

  const BASE = "/api/website/alt-texts";
  const CONNECTED_MESSAGE = "Erfolgreich mit Squarespace verbunden.";
  const HEADER_LOGO_SOURCE = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const STATUS_LABELS = Object.freeze({ unknown: "Noch nicht erfasst", missing: "Text fehlt", unreviewed: "Vorhanden · ungeprüft",
    draft: "Entwurf", approved: "Freigegeben · Übernahme offen", verified: "Öffentlich bestätigt",
    changed: "Geändert · erneut prüfen", removed: "Nicht mehr gefunden" });
  const CONTEXT_LABELS = Object.freeze({ header: "Kopfbereich", footer: "Fußbereich", content: "Seiteninhalt" });
  const TRANSFER_RESULT_LABELS = Object.freeze({ verified: "Öffentlich bestätigt", error: "Fehlgeschlagen", failed: "Fehlgeschlagen",
    unsupported: "Noch nicht unterstützt", pending: "Übernahme läuft",
    "verification-pending": "Öffentliche Bestätigung offen", conflict: "Nicht übernommen · Freigabe geändert", stopped: "Nicht abgeschlossen" });
  const TRANSFER_PHASE_LABELS = Object.freeze({ connecting: "Squarespace-Verbindung wird hergestellt.",
    "login-required": "Die Übernahme wartet auf deine Anmeldung.", transferring: "Freigegebene Texte werden in Squarespace übernommen.",
    verifying: "Öffentliche Ausgabe wird geprüft." });
  const readableCoverage = (notes) => (notes || []).map((note) => String(note)
    .replace(/ \(Daten-SHA256 [a-f0-9]{64}\)/g, "")).join(" ");

  function safeImageUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
      const allowed = host === "www.fnwildlifetravel.de" || host === "images.squarespace-cdn.com"
        || host === "static1.squarespace.com" || host === "static.squarespace.com" || host === "images.squarespace.com"
        || host === "felixkfm90.github.io" && url.pathname.startsWith("/iucn-species-data/");
      return allowed ? url.href : "";
    } catch { return ""; }
  }

  function safePageUrl(value) {
    try {
      const url = new URL(value);
      return url.origin === "https://www.fnwildlifetravel.de" && !url.username && !url.password && !url.search
        && !url.hash ? url.href : "";
    } catch { return ""; }
  }

  function initialEdit(image) {
    const hasDraft = image.status === "draft" || Boolean(image.draftSavedAt || image.draftUpdatedAt) || Boolean(image.draftText);
    const suggested = !hasDraft && !image.approval && image.suggestedDecorative === true;
    return { text: suggested ? "" : String(hasDraft ? image.draftText ?? "" : image.approval?.text ?? image.alt ?? ""),
      decorative: hasDraft ? image.draftDecorative === true : image.approval ? image.approval.decorative === true : suggested,
      nonDecorativeText: suggested ? String(image.alt ?? "") : "",
      observationHash: image.observationHash || "" };
  }

  function visibleImageText(image, value) {
    const text = String(value ?? "");
    if (image.context === "header" && image.kind === "image" && text === "FN Wildlife &amp; Travel") {
      try {
        const url = new URL(safeImageUrl(image.src));
        if (`${url.origin}${url.pathname}` === HEADER_LOGO_SOURCE) return "FN Wildlife & Travel";
      } catch { /* An unknown source retains its literal text. */ }
    }
    return text;
  }
  const visibleEditText = (image, edit) => edit.displayText ?? visibleImageText(image, edit.text);
  const reviewedDraftNote = (image, edit = initialEdit(image)) => Boolean(image.approval && ["approved", "verified"].includes(image.status)
    && edit.observationHash === image.observationHash && edit.text === image.approval.text && edit.decorative === image.approval.decorative);
  const applicableDraftNote = (image) => Boolean(image.draftNote && image.context === "content" && image.kind === "image");
  const activeDraftNote = (image, edit) => applicableDraftNote(image) && !reviewedDraftNote(image, edit);
  const visibleDraftNote = (value) => String(value || "")
    .replaceAll("Bezeichnung vor Übernahme mit Felix prüfen.", "Bezeichnung muss vor Übernahme geprüft werden.")
    .replaceAll("Bezeichnung vor Übernahme abstimmen.", "Bezeichnung muss vor Übernahme geprüft werden.");
  const renderOpenDraftNote = (image, edit, escape) => activeDraftNote(image, edit)
    ? `<p class="website-alt-warning"><strong>Prüfhinweis zum Entwurf:</strong> ${escape(visibleDraftNote(image.draftNote))}</p>` : "";

  function ambiguousImage(image) {
    return (image.altVariants?.length || 0) > 1 || (image.captionVariants || []).filter((value) => value.trim()).length > 1;
  }

  function isAutomaticImage(image) {
    try {
      const url = new URL(safeImageUrl(image.src));
      return url.hostname === "felixkfm90.github.io"
        && /^\/iucn-species-data\/(?:species-assets\/[^/]+\/(?:map\.jpg|portrait\.webp|spectrogram\.webp)|graphics\/(?:catagory\/Alternativ|trend)\/[^/]+\.png)$/.test(url.pathname);
    } catch { return false; }
  }

  function renderAltImageCard(image, { escapeHtml, edit = initialEdit(image), busy = false, loaded = false, transferResult, detailOpen = false, actionsOpen = false,
    suggestionAvailable = false, unsaved = false } = {}) {
    const e = (value) => escapeHtml(String(value ?? "")), src = safeImageUrl(image.previewSrc || image.src);
    const staleEdit = edit.observationHash !== (image.observationHash || "");
    const automatic = isAutomaticImage(image);
    const automaticallyVerified = image.status === "verified" && image.verification?.method === "public-html" && image.verification.automatic === true;
    const ambiguous = ambiguousImage(image);
    const unavailable = image.status === "removed" || image.pageUnavailable === true;
    const canApprove = src && loaded && !busy && !unavailable && !staleEdit && !ambiguous
      && (edit.text.trim() || edit.decorative);
    const verified = image.status === "verified", coupledText = image.textCoupled && image.alt === image.caption;
    return `<article class="website-alt-card" data-alt-image-key="${e(image.key)}">
      <div class="website-alt-image">${src ? `<a href="${e(safeImageUrl(image.src) || src)}" target="_blank" rel="noopener noreferrer" aria-label="Bild in größerer Ansicht öffnen">
        <img src="${e(src)}" alt="Bildvorschau zur Textprüfung" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-alt-preview="${e(image.key)}"></a>`
      : "<p>Keine sichere Bildadresse vorhanden.</p>"}</div>
      <div class="website-alt-editor"><p><strong class="website-alt-badge" data-status="${e(image.status)}">${e(automaticallyVerified ? "Automatisch öffentlich geprüft" : STATUS_LABELS[image.status] || STATUS_LABELS.unknown)}</strong>
        <span>${e(CONTEXT_LABELS[image.context] || "Bild")} · ${image.kind === "background" ? "Hintergrundbild" : "Bild"}</span></p>
        <dl><dt>${coupledText ? "Bildunterschrift und Alternativtext" : "Alternativtext auf der Website"}</dt><dd>${e(visibleImageText(image, image.alt)) || "Kein Text vorhanden"}</dd>
          ${coupledText ? "" : `<dt>Sichtbare Bildunterschrift</dt><dd>${e(visibleImageText(image, image.caption)) || "Keine erfasst"}</dd>`}</dl>
        ${ambiguous ? "<p class=\"website-alt-warning\">Diese Bildquelle hat mehrere unterschiedliche Alternativtexte oder Bildunterschriften. Die Verwendungen müssen zuerst eindeutig zugeordnet werden.</p>" : ""}
        <div data-alt-note="${e(image.key)}">${renderOpenDraftNote(image, edit, e)}</div>
        ${transferResult && transferResult.status !== "verified" ? `<p class="website-alt-warning"><strong>Letzte Übernahme:</strong> ${e(TRANSFER_RESULT_LABELS[transferResult.status] || "Nicht bestätigt")}${transferResult.error ? ` · ${e(transferResult.error)}` : ""}</p>` : ""}
        ${staleEdit ? "<p class=\"website-alt-warning\">Die Bildgrundlage hat sich geändert. Dein ungespeicherter Text bleibt erhalten; bitte erneut prüfen und zunächst als Entwurf speichern.</p>" : ""}
        <p class="website-alt-warning" data-alt-unsaved="${e(image.key)}"${unsaved ? "" : " hidden"}>Ungespeicherte Änderung · „Text freigeben“ speichert sie mit.</p>
        ${verified ? `<details class="website-alt-details" data-alt-detail="${e(image.key)}"${detailOpen || staleEdit || unsaved ? " open" : ""}><summary>Text bearbeiten</summary>` : ""}
        <label>Textentwurf<textarea rows="3" maxlength="2000" data-alt-text="${e(image.key)}"${busy || unavailable ? " disabled" : ""}>${e(visibleEditText(image, edit))}</textarea></label>
        ${image.textCoupled ? "<p class=\"website-alt-note website-alt-coupled\">Bildunterschrift und Alternativtext · kurze Beschriftung ohne abschließenden Punkt.</p>" : ""}
        <label class="website-alt-checkbox"><input type="checkbox" data-alt-decorative="${e(image.key)}"${edit.decorative ? " checked" : ""}${busy || unavailable ? " disabled" : ""}>Bewusst dekorativ · ohne Alternativtext</label>
        <p class="website-alt-preview-note" data-alt-preview-note="${e(image.key)}"${loaded ? " hidden" : ""}>${loaded ? "" : "Freigabe erst nach geladener Bildvorschau."}</p>
        <div class="website-alt-actions">
          <button type="button" data-alt-action="approve" data-alt-key="${e(image.key)}" title="Speichert den aktuellen Text und gibt ihn zur Übernahme frei."${canApprove ? "" : " disabled"}>Text freigeben</button>
          ${suggestionAvailable && image.context === "content" && image.kind === "image" && !automatic
    ? `<button type="button" data-alt-action="suggest" data-alt-key="${e(image.key)}"${busy || unavailable || staleEdit || ambiguous || !src || !loaded || edit.decorative ? " disabled" : ""}>Lokalen Textvorschlag erstellen</button>` : ""}
        </div>
        <details class="website-alt-details website-alt-secondary" data-alt-detail="${e(`${image.key}:actions`)}"${actionsOpen ? " open" : ""}><summary>Weitere Aktionen und Hinweise</summary>
        <div class="website-alt-actions">
          <button type="button" data-alt-action="draft" data-alt-key="${e(image.key)}"${busy || unavailable ? " disabled" : ""}>Entwurf speichern</button>
          <button type="button" data-alt-action="verify" data-alt-key="${e(image.key)}" title="Liest die veröffentlichte Seite frisch und vergleicht sie mit deiner Freigabe. Überträgt keine Texte."${busy || unavailable || !image.approval?.revision ? " disabled" : ""}>Öffentliche Ausgabe prüfen</button>
          <button type="button" data-alt-action="reset" data-alt-key="${e(image.key)}"${busy ? " disabled" : ""}>Eingabe zurücksetzen</button>
        </div>
        ${automatic ? "<p class=\"website-alt-note\">Bild und Text werden automatisch von der Website erzeugt. Korrekturen erfolgen an der Website-Funktion.</p>" : ""}
        ${applicableDraftNote(image) ? `<p class="website-alt-note" data-alt-note-history="${e(image.key)}"${reviewedDraftNote(image, edit) ? "" : " hidden"}><strong>Früherer Prüfhinweis · durch Freigabe erledigt:</strong> ${e(visibleDraftNote(image.draftNote))}</p>` : ""}
        ${image.approval ? `<p class="website-alt-note">${image.approval.method === "website-standard" ? "Website-Standard" : "Freigegebener Text"}: ${e(visibleImageText(image, image.approval.text)) || "bewusst leer (dekorativ)"}<br>${image.status === "verified" ? "Die öffentliche Ausgabe ist bestätigt." : automatic ? "Die automatische öffentliche Ausgabe ist noch zu prüfen." : "Der freigegebene Text kann in Squarespace übernommen werden; die Eintragung ist noch nicht bestätigt."}</p>` : ""}
        </details>${verified ? "</details>" : ""}
      </div></article>`;
  }

  function createWebsiteAltTextsController({ dialog, openButton, fetchJson, escapeHtml, createDialogController,
    confirmAction, openImageSuggestion, canEdit = () => true, setTimeoutImpl = global.setTimeout?.bind(global), clearTimeoutImpl = global.clearTimeout?.bind(global),
    discoveryIntervalMs = 5 * 60 * 1000, pollIntervalMs = 1500, requestTimeoutMs = 15000, now = Date.now } = {}) {
    if (!dialog || typeof fetchJson !== "function" || typeof escapeHtml !== "function" || typeof createDialogController !== "function") {
      throw new TypeError("Dialog, Explorer-API und Anzeigehelfer sind für die Website-Bildtexte erforderlich.");
    }
    dialog.classList?.add("website-alt-dialog");
    dialog.setAttribute?.("aria-labelledby", "website-alt-title");
    dialog.innerHTML = `<div class="website-alt-shell"><header class="website-alt-header"><div><h2 id="website-alt-title">Website · Bildtexte</h2>
      <p class="website-alt-note" data-alt-counts></p></div>
      <button type="button" data-alt-action="close" aria-label="Bildtextübersicht schließen">Schließen</button></header>
      <p class="edit-message" role="status" aria-live="polite" data-alt-message></p>
      <details class="website-alt-details website-alt-management"><summary>Hilfe und Seitenbestand</summary>
      <p>Bild und Text prüfen. <strong>Text freigeben</strong> speichert den aktuellen Text und gibt ihn frei. Danach übernimmt <strong>In Squarespace übernehmen</strong> die freigegebenen Texte der ausgewählten Seite.</p>
      <p>Nur zwischenspeichern: <strong>Weitere Aktionen und Hinweise → Entwurf speichern</strong>.</p>
      <p>Bei Bedarf öffnet sich Squarespace für deine Anmeldung. Danach geht es automatisch weiter; das Fenster wird wieder ausgeblendet.</p>
      <p>„Öffentliche Ausgabe prüfen“ vergleicht die Website mit deiner Freigabe. Der Button überträgt keine Texte.</p>
      <div class="website-alt-toolbar"><button type="button" data-alt-action="discover">Seitenbestand aktualisieren</button>
        <button type="button" data-alt-action="scan">Öffentliche Website erfassen</button>
        <button type="button" data-alt-action="refresh">Gespeicherten Stand laden</button>
        <button type="button" data-alt-action="discard">Ungespeicherte Eingaben verwerfen</button></div>
      <p data-alt-summary></p><p class="website-alt-note" data-alt-coverage></p>
      <p class="website-alt-note">Vorschauen kommen von der Website. Lokal bleiben Texte und Prüfstände, keine Fotokopien. Die Zahl leerer Website-Texte enthält auch dekorative Bilder.</p></details>
      <p class="website-alt-warning" role="status" aria-live="polite" data-alt-scan-status></p>
      <p class="website-alt-note" role="status" aria-live="polite" data-alt-connection></p>
      <details class="website-alt-details website-alt-transfer" data-alt-transfer-details><summary aria-live="polite" data-alt-transfer-summary></summary>
      <p class="website-alt-note" data-alt-transfer></p></details>
      <div class="website-alt-workspace"><nav class="website-alt-pages" aria-label="Websiteseiten"><label>Seite suchen<input type="search" data-alt-search></label>
        <label>Anzeige<select data-alt-filter><option value="all">Alle Seiten</option><option value="open">Offene Arbeit</option>
          <option value="draft">Entwürfe zur Abnahme</option><option value="notes">Mit Prüfhinweisen</option>
          <option value="approved">Freigegeben · Übernahme offen</option><option value="verified">Öffentlich bestätigt</option></select></label>
        <div data-alt-pages></div></nav><section class="website-alt-page" data-alt-page aria-label="Bilder der ausgewählten Seite"></section></div></div>`;
    const node = (selector) => dialog.querySelector(selector);
    const nodes = { message: node("[data-alt-message]"), summary: node("[data-alt-summary]"), coverage: node("[data-alt-coverage]"),
      pages: node("[data-alt-pages]"), page: node("[data-alt-page]"), search: node("[data-alt-search]"), filter: node("[data-alt-filter]"),
      connection: node("[data-alt-connection]"), transfer: node("[data-alt-transfer]"), counts: node("[data-alt-counts]"),
      scanStatus: node("[data-alt-scan-status]"), transferDetails: node("[data-alt-transfer-details]"), transferSummary: node("[data-alt-transfer-summary]") };
    const edits = new Map(), loadedSources = new Map(), activeRequests = new Set();
    const openDetails = new Set();
    let snapshot = null, selectedPageUrl = "", search = "", filter = "all", generation = 0, readEpoch = 0, selection = 0;
    let busy = false, stopped = false, discoveryTimer = null, pollTimer = null, pendingRead = null, transferConfirming = false, suggestionOpening = false, messageSource = "";
    const editKey = (url, key) => JSON.stringify([url, key]);
    const currentPage = () => snapshot?.pages?.find((page) => page.url === selectedPageUrl);
    const currentImage = (key) => currentPage()?.images?.find((image) => image.key === key);
    const alive = (ticket) => !stopped && ticket === generation && controller.isOpen();
    const e = (value) => escapeHtml(String(value ?? ""));

    function message(text, type = "info", source = "") {
      messageSource = source;
      nodes.message.textContent = text;
      nodes.message.className = `edit-message ${type}`;
      nodes.message.hidden = !text;
    }

    function hasEdits() { return edits.size > 0; }
    function firstUnsaved() {
      let first = null;
      for (const identity of edits.keys()) {
        const [pageUrl, key] = JSON.parse(identity), page = snapshot?.pages.find((entry) => entry.url === pageUrl);
        const index = page?.images?.findIndex((image) => image.key === key) ?? -1;
        const change = { identity, pageUrl, key, page, index };
        if (pageUrl === selectedPageUrl) return change;
        first ||= change;
      }
      return first;
    }
    const renderNextStep = (step) => `${e(step.text)}${hasEdits() ? ' <button type="button" data-alt-action="show-unsaved">Offene Eingabe anzeigen</button>' : ""}`;
    const transferRunning = () => snapshot?.transfer?.running === true;
    const approvedCount = (page = currentPage()) => (page?.images || []).filter((image) => image.status === "approved" && image.approval?.revision).length;
    function canTransferPage() {
      const page = currentPage();
      return canEdit() && snapshot?.transfer?.available === true && !busy && !transferRunning()
        && !snapshot.scan?.running && !hasEdits() && page?.inventoryStatus === "current" && !page.error && !page.redirectUrl && approvedCount(page) > 0;
    }
    function closeSession() {
      generation += 1; readEpoch += 1; busy = false; pendingRead = null; transferConfirming = false;
      for (const cancel of activeRequests) cancel();
      clearTimeoutImpl?.(discoveryTimer); clearTimeoutImpl?.(pollTimer);
      discoveryTimer = null; pollTimer = null;
      openButton?.focus?.();
    }
    const controller = createDialogController({ dialog, beforeClose() {
      if (transferRunning() || transferConfirming) { message("Bitte die laufende Squarespace-Verbindung oder Übernahme abwarten.", "warning"); return false; }
      if (busy) { message("Bitte die laufende Anfrage abwarten."); return false; }
      if (hasEdits()) { message("Es gibt ungespeicherte Texte. Bitte speichern, zurücksetzen oder bewusst verwerfen.", "warning"); return false; }
      return true;
    }, afterClose() { if (!controller.isOpen()) closeSession(); } });

    function bindSnapshot(result) {
      if (!result || typeof result.revision !== "string" || !Array.isArray(result.pages)) throw new Error("Ungültiger Bildtextstand.");
      snapshot = result;
      for (const [identity, edit] of edits) {
        const [url, key] = JSON.parse(identity), image = snapshot.pages.find((page) => page.url === url)?.images?.find((entry) => entry.key === key);
        if (!image) continue;
        const baseline = initialEdit(image);
        if (edit.text === baseline.text && edit.decorative === baseline.decorative && edit.observationHash === baseline.observationHash
            && visibleEditText(image, edit) === visibleEditText(image, baseline)) edits.delete(identity);
      }
      if (!snapshot.pages.some((page) => page.url === selectedPageUrl)) { selectedPageUrl = snapshot.pages[0]?.url || ""; selection += 1; }
      render(); schedulePoll();
    }

    function pageMatches(page) {
      if (search && !`${page.title} ${page.url}`.toLocaleLowerCase("de-DE").includes(search)) return false;
      if (page.redirectUrl) return filter === "all" || filter === "open" && (!safePageUrl(page.redirectUrl) || !page.checkedAt || Boolean(page.error));
      const images = page.images || [];
      return filter === "all" || filter === "approved" && images.some((image) => image.status === "approved")
        || filter === "draft" && images.some((image) => image.status === "draft")
        || filter === "notes" && images.some((image) => activeDraftNote(image, edits.get(editKey(page.url, image.key)) || initialEdit(image)))
        || filter === "verified" && !page.unsupportedImageCount && !page.error && images.some((image) => image.status === "verified")
          && images.every((image) => image.status === "verified" || image.status === "removed")
        || filter === "open" && (!page.checkedAt || page.error || page.unsupportedImageCount > 0 || !images.length
          || images.some((image) => image.status !== "verified" && image.status !== "removed"));
    }

    function pageNextStep(page) {
      const images = (page.images || []).filter((image) => image.status !== "removed");
      const complete = images.length > 0 && !page.error && page.checkedAt && !page.unsupportedImageCount
        && images.every((image) => image.status === "verified");
      const approved = approvedCount(page);
      if (hasEdits()) {
        const change = firstUnsaved(), location = change?.index >= 0 ? `bei Bild ${change.index + 1}${change.pageUrl === page.url ? "" : ` auf „${change.page.title || change.page.url}“`}`
          : "auf einer nicht mehr erfassten Seite";
        return { text: `Ungespeicherte Eingabe ${location}. Text freigeben speichert die Änderung mit; alternativ zurücksetzen.`, complete: false };
      }
      if (transferRunning()) return { text: "Übernahme läuft. Bitte das Ergebnis abwarten.", complete: false };
      if (complete) return { text: images.length === 1 ? "1 Bild öffentlich bestätigt." : `Alle ${images.length} Bilder öffentlich bestätigt.`, complete: true };
      return { text: approved > 0 ? `${approved} Bildtext${approved === 1 ? "" : "e"} freigegeben. Jetzt in Squarespace übernehmen.`
        : page.redirectUrl || page.error ? "" : "Bildtexte prüfen und freigeben.", complete: false };
    }

    function render() {
      const pages = snapshot?.pages || [], summary = snapshot?.summary || {};
      const contentPages = summary.pages ?? pages.filter((page) => !page.redirectUrl).length;
      const redirects = summary.redirects ?? pages.filter((page) => page.redirectUrl).length;
      const focused = global.document?.activeElement, focusKey = focused?.dataset?.altText;
      const focusSelection = focusKey ? [focused.selectionStart, focused.selectionEnd] : null;
      nodes.summary.textContent = snapshot ? `${contentPages} Inhaltsseite${contentPages === 1 ? "" : "n"} · ${redirects} Weiterleitung${redirects === 1 ? "" : "en"} · ${summary.images ?? pages.reduce((sum, page) => sum + (page.images?.length || 0), 0)} erfasste Bildverwendungen · ${summary.publicMissing ?? summary.missing ?? 0} leere oder dateinamenartige Website-Texte (einschließlich dekorativer Bilder) · ${summary.draft || 0} Entwürfe zur Abnahme · ${summary.approved || 0} Freigaben zur Übernahme offen · ${summary.verified || 0} öffentlich bestätigt`
        : "Noch kein gespeicherter Bildtextstand geladen.";
      nodes.counts.textContent = snapshot ? `${contentPages} ${contentPages === 1 ? "Seite" : "Seiten"} · ${summary.draft || 0} ${summary.draft === 1 ? "Entwurf" : "Entwürfe"} · ${summary.approved || 0} zur Übernahme · ${summary.verified || 0} bestätigt`
        : "Bildtexte laden …";
      const scan = snapshot?.scan;
      for (const button of dialog.querySelectorAll("[data-alt-action]")) {
        if (["scan", "discover"].includes(button.dataset.altAction)) button.disabled = busy || transferConfirming || transferRunning() || scan?.running === true;
        else if (["refresh", "discard"].includes(button.dataset.altAction)) button.disabled = busy || transferConfirming;
      }
      const transfer = snapshot?.transfer || {};
      const resultList = Array.isArray(transfer.results) ? transfer.results : [];
      const transferPage = pages.find((page) => page.url === transfer.pageUrl);
      const connected = transfer.available === true && transfer.connected === true;
      const transferPhase = transferRunning() && transfer.status === "running" ? transfer.phase : "";
      const waitingForLogin = !connected && transferPhase === "login-required";
      if (connected && messageSource === "connect-transfer") message("");
      nodes.connection.className = waitingForLogin ? "website-alt-warning" : connected ? "website-alt-connection" : "website-alt-note";
      nodes.connection.textContent = !snapshot ? "Squarespace-Verbindung wird geprüft." : waitingForLogin
        ? "Die Übernahme wartet auf deine Anmeldung im eigenen Squarespace-Fenster. Nach der Anmeldung geht es automatisch weiter." : connected
        ? `${CONNECTED_MESSAGE}${transfer.windowHidden === true ? " Das Anmeldefenster ist ausgeblendet. Du kannst im Explorer weiterarbeiten." : ""}`
        : transfer.available ? `Squarespace noch nicht verbunden.${transfer.windowOpen ? " Melde dich im eigenen Squarespace-Fenster an." : " Die Übernahme stellt die Verbindung bei Bedarf selbst her."}`
          : "Die Squarespace-Übernahme steht in dieser Ansicht nicht zur Verfügung. Öffne den Arten-Explorer als Desktopprogramm.";
      nodes.transfer.hidden = !resultList.length && !transfer.pageUrl && transfer.status !== "running";
      nodes.transfer.className = ["partial", "failed", "cancelled"].includes(transfer.status) || resultList.some((result) => !["verified", "pending"].includes(result.status)) ? "website-alt-warning" : "website-alt-note";
      nodes.transfer.textContent = [TRANSFER_PHASE_LABELS[transferPhase] || "", !nodes.transfer.hidden && typeof transfer.message === "string" && transfer.message.trim() !== CONNECTED_MESSAGE ? transfer.message : "",
      resultList.length ? `Letzte Übernahme${transferPage ? ` · ${transferPage.title || transferPage.url}` : ""}: ${resultList.map((result, index) => {
        const number = transferPage?.images?.findIndex((image) => image.key === result.imageKey);
        return `Bild ${number >= 0 ? number + 1 : index + 1}: ${TRANSFER_RESULT_LABELS[result.status] || "Nicht bestätigt"}${result.error ? ` · ${String(result.error)}` : ""}`;
      }).join("; ")}` : ""].filter(Boolean).join(" ");
      nodes.transferDetails.hidden = nodes.transfer.hidden;
      const failedResult = resultList.find((result) => !["verified", "pending"].includes(result.status));
      const verifiedResults = resultList.filter((result) => result.status === "verified").length;
      const shortText = (value, length = 160) => { const text = String(value || ""); return text.length > length ? `${text.slice(0, length - 1)}…` : text; };
      nodes.transferSummary.className = nodes.transfer.className;
      nodes.transferSummary.textContent = [TRANSFER_PHASE_LABELS[transferPhase] || "",
        resultList.length ? `${verifiedResults}/${resultList.length} Bildtext${resultList.length === 1 ? "" : "e"} öffentlich bestätigt` : !transferRunning() ? shortText(transfer.message) : "",
        failedResult ? shortText(failedResult.error || TRANSFER_RESULT_LABELS[failedResult.status] || "Ergebnis offen") : "",
        transferPage ? shortText(transferPage.title || transferPage.url, 90) : ""].filter(Boolean).join(" · ");
      const scanErrors = Array.isArray(scan?.errors) ? scan.errors : [];
      const scanFailure = scan?.error ? `Erfassung fehlgeschlagen: ${String(scan.error)}` : "";
      const partialFailure = scanErrors.length ? `${scanErrors.length} Teilfehler bei der Erfassung.${scanErrors[0]?.url ? ` Erste betroffene Adresse: ${String(scanErrors[0].url)}` : ""}` : "";
      nodes.coverage.className = scanFailure || partialFailure ? "website-alt-warning" : "website-alt-note";
      nodes.coverage.textContent = [scan?.running ? "Öffentliche Erfassung läuft." : "", scanFailure, partialFailure,
        readableCoverage(scan?.coverageNotes) || "Die öffentliche HTML-Erfassung ersetzt keine Prüfung unzugänglicher oder erst dynamisch geladener Bilder."].filter(Boolean).join(" ");
      nodes.scanStatus.hidden = !scan?.running && !scanFailure && !partialFailure;
      nodes.scanStatus.textContent = [scan?.running ? "Website wird erfasst." : "", scanFailure, partialFailure].filter(Boolean).join(" ");
      nodes.pages.innerHTML = pages.filter(pageMatches).map((page) => {
        const images = page.images || [], verified = images.filter((image) => image.status === "verified").length;
        const label = page.redirectUrl ? `Weiterleitung${!safePageUrl(page.redirectUrl) ? " · Ziel ungeklärt" : ""}`
          : `${images.length} Bildverwendungen · ${images.filter((image) => image.status === "draft").length} Entwürfe · ${verified} öffentlich bestätigt`;
        return `<button type="button" data-alt-page-url="${e(page.url)}" class="website-alt-page-choice${page.url === selectedPageUrl ? " selected" : ""}" aria-current="${page.url === selectedPageUrl ? "page" : "false"}">
          <strong>${e(page.title || page.url)}</strong><small>${e(label)}${!page.checkedAt ? " · noch nicht erfasst" : ""}${page.error ? " · Prüfung nicht möglich" : ""}</small></button>`;
      }).join("") || "<p>Keine Seiten für diese Auswahl.</p>";
      const page = currentPage();
      if (!page) { nodes.page.innerHTML = "<p>Noch keine Seiten erfasst. Aktualisiere den Seitenbestand und starte anschließend die öffentliche Erfassung.</p>"; return; }
      const pageUrl = safePageUrl(page.url);
      const redirect = safePageUrl(page.redirectUrl);
      const redirectContent = redirect ? `<p>Weiterleitung auf <a href="${e(redirect)}" target="_blank" rel="noopener noreferrer">${e(redirect)}</a>.</p>
        <p>Die Bildtexte werden bei der Zielseite bearbeitet. Diese Adresse ist keine zusätzliche Inhaltsseite.</p>
        ${pages.some((entry) => entry.url === redirect) ? `<button type="button" data-alt-page-url="${e(redirect)}">Zielseite auswählen</button>` : ""}`
        : "<p class=\"website-alt-warning\">Das Weiterleitungsziel konnte nicht sicher zugeordnet werden. Die Adresse bleibt zur Prüfung offen.</p>";
      const nextStep = pageNextStep(page);
      nodes.page.innerHTML = `<header class="website-alt-page-header"><h3>${e(page.title || page.url)}</h3>
        ${pageUrl ? `<a href="${e(pageUrl)}" target="_blank" rel="noopener noreferrer">Seite auf der Website öffnen ↗</a>` : ""}
        </header><div class="website-alt-page-actions"><button type="button" class="website-alt-primary" data-alt-action="transfer"${!canTransferPage() || transferConfirming ? " disabled" : ""}>In Squarespace übernehmen</button>
        <details class="website-alt-details" data-alt-detail="page-actions"${openDetails.has(editKey(page.url, "page-actions")) ? " open" : ""}><summary>Seitenaktionen</summary><div class="website-alt-actions">
        <button type="button" data-alt-action="scan-page"${busy || transferConfirming || transferRunning() || scan?.running ? " disabled" : ""}>Diese Seite abgleichen</button>
        <button type="button" data-alt-action="connect-transfer" title="${connected ? "Zeigt das eigene Squarespace-Fenster wieder an. Du kannst anschließend zum Explorer zurückkehren." : "Öffnet ein eigenes Browserfenster. Melde dich dort selbst bei Squarespace an."}"${!transfer.available || busy || transferConfirming || transferRunning() || scan?.running ? " disabled" : ""}>${connected ? "Squarespace öffnen" : "Squarespace verbinden"}</button>
        </div></details></div>
        ${nextStep.text ? `<p class="website-alt-next${nextStep.complete ? " website-alt-complete" : ""}" data-alt-next>${renderNextStep(nextStep)}</p>` : ""}
        ${page.error ? `<p class="website-alt-warning">${e(page.error)} Der letzte gespeicherte Stand bleibt sichtbar.</p>` : ""}
        ${page.unsupportedImageCount > 0 ? `<p class="website-alt-warning">${e(page.unsupportedImageCount)} Bildverwendung(en) konnten noch nicht sicher zugeordnet werden. Die Seite bleibt zur Prüfung offen.</p>` : ""}
        ${page.coverageNotes?.length ? `<details class="website-alt-details website-alt-secondary" data-alt-detail="page-coverage"${openDetails.has(editKey(page.url, "page-coverage")) ? " open" : ""}><summary>Umfang der Seitenprüfung</summary><p class="website-alt-note">${e(readableCoverage(page.coverageNotes))}</p></details>` : ""}
        ${page.redirectUrl ? redirectContent : (page.images || []).map((image) => renderAltImageCard({ ...image, pageUnavailable: Boolean(page.error || !page.checkedAt) }, {
          escapeHtml, edit: edits.get(editKey(page.url, image.key)) || initialEdit(image), busy: busy || transferConfirming || transferRunning(),
          loaded: loadedSources.get(editKey(page.url, image.key)) === safeImageUrl(image.previewSrc || image.src),
          transferResult: transfer.pageUrl === page.url ? resultList.find((result) => result.imageKey === image.key) : null,
          detailOpen: openDetails.has(editKey(page.url, image.key)),
          actionsOpen: openDetails.has(editKey(page.url, `${image.key}:actions`)),
          suggestionAvailable: typeof openImageSuggestion === "function",
          unsaved: edits.has(editKey(page.url, image.key)),
        })).join("") || "<p>Für diese Seite sind noch keine Bildverwendungen erfasst. Das ist kein Nachweis einer vollständigen Prüfung.</p>"}`;
      if (focusKey) {
        const replacement = [...nodes.page.querySelectorAll("[data-alt-text]")].find((element) => element.dataset.altText === focusKey);
        replacement?.focus?.({ preventScroll: true });
        if (focusSelection?.every(Number.isInteger)) replacement?.setSelectionRange?.(...focusSelection);
      }
    }

    async function request(url, options) {
      const abort = typeof global.AbortController === "function" ? new global.AbortController() : null;
      let timeout, cancel;
      try {
        return await Promise.race([fetchJson(url, { ...options, ...(abort ? { signal: abort.signal } : {}) }),
          new Promise((resolve, reject) => { timeout = setTimeoutImpl?.(() => {
            abort?.abort(); reject(new Error("Die Anfrage hat zu lange gedauert. Ihr Ergebnis ist noch nicht bestätigt."));
          }, requestTimeoutMs);
          cancel = () => { clearTimeoutImpl?.(timeout); abort?.abort(); reject(new Error("Die Bildtextansicht wurde geschlossen.")); };
          activeRequests.add(cancel); })]);
      } finally { clearTimeoutImpl?.(timeout); activeRequests.delete(cancel); }
    }

    async function refresh() {
      if (!controller.isOpen() || stopped) return;
      if (pendingRead) return pendingRead;
      const ticket = generation, epoch = ++readEpoch;
      const task = (async () => {
        try { const result = await request(BASE); if (alive(ticket) && epoch === readEpoch) bindSnapshot(result); }
        catch (error) { if (alive(ticket) && epoch === readEpoch) message(error.message || "Der gespeicherte Stand konnte nicht gelesen werden.", "error"); }
      })();
      pendingRead = task;
      try { await task; } finally { if (pendingRead === task) pendingRead = null; }
    }

    async function post(action, body = {}, { edit = null } = {}) {
      if (!canEdit() || !controller.isOpen() || stopped || busy || transferConfirming || transferRunning()) return false;
      const ticket = generation;
      busy = true; readEpoch += 1; render();
      try {
        const result = await request(`${BASE}/${action}`, { method: "POST", body: JSON.stringify(body) });
        if (!alive(ticket)) return false;
        if (!result || typeof result.revision !== "string" || !Array.isArray(result.pages)) throw new Error("Ungültiger Bildtextstand.");
        if (edit && edits.get(edit.key) === edit.value) edits.delete(edit.key);
        bindSnapshot(result);
        if (action === "connect-transfer" && result.transfer?.available === true && result.transfer.connected === true) return true;
        if (action === "transfer" && result.transfer?.running === true) return true;
        message(["connect-transfer", "transfer"].includes(action) ? (action === "connect-transfer" && result.transfer?.connectionMessage) || result.transfer?.message
          || (action === "connect-transfer" ? "Squarespace-Verbindung angefragt. Melde dich im eigenen Browserfenster an." : "Übernahme angefragt. Der angezeigte Stand nennt das Ergebnis.")
          : action === "approve" ? "Text freigegeben und gespeichert. Die Übernahme in Squarespace ist noch offen."
          : action === "draft" ? "Entwurf gespeichert." : action === "verify" ? "Die öffentliche Ausgabe wurde neu geprüft. Der angezeigte Stand nennt das Ergebnis."
            : action === "discover" ? "Seitenbestand aktualisiert. Neue Seiten bleiben bis zur Bildprüfung offen." : "Öffentliche Erfassung gestartet.", "info", action === "connect-transfer" ? "connect-transfer" : "");
        return true;
      } catch (error) {
        if (alive(ticket)) {
          message(`${error.message || "Die Anfrage ist fehlgeschlagen."} Deine ungespeicherten Texte bleiben erhalten. Der Stand wird neu gelesen.`, "error");
          pendingRead = null;
          await refresh();
        }
        return false;
      } finally { if (alive(ticket)) { busy = false; render(); schedulePoll(); } }
    }

    async function changeImage(action, key) {
      if (!canEdit() || busy || transferConfirming || transferRunning() || !controller.isOpen()) return false;
      const scope = { pageUrl: selectedPageUrl, generation, selection, key }, clickedImage = currentImage(key);
      if (!clickedImage) return false;
      const clickedValue = { ...(edits.get(editKey(scope.pageUrl, key)) || initialEdit(clickedImage)) };
      const clickedApproval = clickedImage.approval?.revision;
      if (pendingRead) await pendingRead;
      if (!alive(scope.generation) || transferRunning() || transferConfirming || scope.selection !== selection || scope.pageUrl !== selectedPageUrl) return false;
      const page = snapshot?.pages.find((entry) => entry.url === scope.pageUrl), image = page?.images?.find((entry) => entry.key === scope.key);
      if (!page || !image || image.status === "removed" || page.error || !page.checkedAt) return false;
      const localKey = editKey(page.url, key), value = edits.get(localKey) || initialEdit(image);
      if (value.text !== clickedValue.text || value.decorative !== clickedValue.decorative || value.observationHash !== clickedValue.observationHash
        || visibleEditText(image, value) !== visibleEditText(clickedImage, clickedValue)
        || action === "verify" && clickedApproval !== image.approval?.revision) {
        message("Die Bildgrundlage oder Eingabe hat sich während der Anfrage geändert. Bitte den aktuellen Stand prüfen und die Aktion erneut wählen.", "warning");
        return false;
      }
      if (action === "approve" && (!safeImageUrl(image.previewSrc || image.src)
        || loadedSources.get(localKey) !== safeImageUrl(image.previewSrc || image.src)
        || value.observationHash !== (image.observationHash || "") || ambiguousImage(image)
        || !value.decorative && !value.text.trim())) {
        message("Bitte die geladene Vorschau und die aktuelle Bildgrundlage prüfen. Ein leerer Text benötigt eine bewusste dekorative Einordnung.", "warning");
        return false;
      }
      const body = { revision: snapshot.revision, pageUrl: page.url, imageKey: key };
      if (action === "verify") {
        if (!image.approval?.revision) return false;
        body.approvalRevision = image.approval.revision;
      } else { body.text = value.text; body.decorative = value.decorative; }
      return post(action, body, { edit: action === "verify" ? null : { key: localKey, value } });
    }

    async function connectTransfer() {
      if (!snapshot?.transfer?.available || snapshot.scan?.running) return false;
      return post("connect-transfer");
    }

    async function transferCurrentPage() {
      if (!controller.isOpen() || stopped || transferConfirming || !canTransferPage()) return false;
      const scope = { generation, selection, pageUrl: selectedPageUrl, revision: snapshot.revision };
      if (pendingRead) await pendingRead;
      const unchanged = () => alive(scope.generation) && selection === scope.selection && selectedPageUrl === scope.pageUrl
        && snapshot.revision === scope.revision && canTransferPage();
      if (!unchanged() || transferConfirming) return false;
      if (!confirmAction) { message("Für die Übernahme ist die Bestätigung der ausgewählten Seite erforderlich.", "warning"); return false; }
      const page = currentPage(), count = approvedCount(page);
      let confirmed = false;
      transferConfirming = true; render();
      try {
        confirmed = await confirmAction({ title: "Freigegebene Texte in Squarespace übernehmen?",
          message: `${count} freigegebene Bildtexte der Seite „${page.title || page.url}“ werden übernommen und anschließend öffentlich geprüft. Bei Bedarf öffnet sich Squarespace für deine Anmeldung; danach geht es automatisch weiter. Bei gekoppelten Reisefotos wird auch die sichtbare Bildunterschrift geändert.`,
          confirmLabel: "In Squarespace übernehmen" });
      } catch (error) { if (alive(scope.generation)) message(error.message || "Die Übernahme konnte nicht bestätigt werden.", "error"); }
      finally { if (alive(scope.generation)) { transferConfirming = false; render(); } }
      if (!confirmed || !unchanged()) return false;
      return post("transfer", { revision: scope.revision, pageUrl: scope.pageUrl });
    }

    function schedulePoll() {
      clearTimeoutImpl?.(pollTimer); pollTimer = null;
      if (controller.isOpen() && (snapshot?.scan?.running || transferRunning()
        || snapshot?.transfer?.windowOpen && !snapshot.transfer.connected) && !stopped) {
        const ticket = generation;
        pollTimer = setTimeoutImpl?.(() => { if (alive(ticket)) void refresh(); }, pollIntervalMs);
      }
    }
    function scheduleDiscovery() {
      clearTimeoutImpl?.(discoveryTimer);
      if (!controller.isOpen() || stopped) return;
      const ticket = generation;
      discoveryTimer = setTimeoutImpl?.(async () => {
        if (!alive(ticket)) return;
        if (!busy && !transferConfirming && !transferRunning() && !snapshot?.scan?.running) await post("discover");
        if (alive(ticket)) scheduleDiscovery();
      }, discoveryIntervalMs);
    }
    async function open() {
      if (!canEdit() || stopped) return false;
      if (!controller.isOpen()) { generation += 1; controller.open(); }
      const ticket = generation;
      await refresh();
      if (!alive(ticket)) return;
      if (!busy && !transferRunning() && !snapshot?.scan?.running) await post("discover");
      if (alive(ticket)) scheduleDiscovery();
    }

    async function selectPage(url) {
      if (!snapshot?.pages.some((page) => page.url === url) || stopped) return;
      if (selectedPageUrl !== url) selection += 1;
      selectedPageUrl = url; render();
      const checked = Date.parse(currentPage()?.checkedAt || ""), age = now() - checked;
      if (!busy && !transferConfirming && !transferRunning() && !snapshot?.scan?.running && (!Number.isFinite(age) || age < 0 || age >= discoveryIntervalMs)) {
        await post("scan", { pageUrl: url });
      }
    }

    async function showUnsaved() {
      if (busy || transferConfirming || transferRunning()) return;
      const change = firstUnsaved();
      if (!change?.page || change.index < 0) {
        message("Die Seite der offenen Eingabe ist nicht mehr erfasst. Die Eingabe bleibt erhalten; bitte den Seitenbestand prüfen.", "warning"); return;
      }
      openDetails.add(change.identity);
      await selectPage(change.pageUrl);
      if (selectedPageUrl !== change.pageUrl || !controller.isOpen()) return;
      const card = [...nodes.page.querySelectorAll("[data-alt-image-key]")].find((element) => element.dataset.altImageKey === change.key);
      card?.scrollIntoView?.({ block: "center", behavior: "instant" });
      const field = [...nodes.page.querySelectorAll("[data-alt-text]")].find((element) => element.dataset.altText === change.key);
      field?.focus?.({ preventScroll: true });
    }

    function onInput(event) {
      const target = event.target;
      if (target === nodes.search) { search = String(target.value || "").toLocaleLowerCase("de-DE"); render(); return; }
      if (target === nodes.filter) { filter = target.value; render(); return; }
      const key = target?.dataset?.altText || target?.dataset?.altDecorative, image = currentImage(key);
      if (!image) return;
      const localKey = editKey(selectedPageUrl, key), value = { ...(edits.get(localKey) || initialEdit(image)) };
      const baseline = initialEdit(image);
      if (target.dataset.altText) {
        const text = String(target.value || "");
        if (text !== visibleEditText(image, value)) {
          value.text = text === visibleEditText(image, baseline) ? baseline.text : text;
          value.displayText = text;
        }
        if (value.text.trim()) {
          value.decorative = false;
          for (const field of nodes.page.querySelectorAll("[data-alt-decorative]")) if (field.dataset.altDecorative === key) field.checked = false;
        }
      }
      else {
        const wasDecorative = value.decorative;
        if (target.checked === true && !wasDecorative) {
          value.nonDecorativeText = value.text; value.nonDecorativeDisplayText = visibleEditText(image, value);
        }
        value.decorative = target.checked === true;
        if (value.decorative) { value.text = ""; value.displayText = ""; }
        else if (wasDecorative && !value.text) {
          value.text = value.nonDecorativeText || "";
          value.displayText = value.nonDecorativeDisplayText ?? visibleImageText(image, value.text);
        }
        for (const field of nodes.page.querySelectorAll("[data-alt-text]")) if (field.dataset.altText === key) field.value = visibleEditText(image, value);
      }
      if (value.text === baseline.text && visibleEditText(image, value) === visibleEditText(image, baseline)
        && value.decorative === baseline.decorative && value.observationHash === baseline.observationHash) edits.delete(localKey);
      else edits.set(localKey, value);
      updateImageActions(key);
    }

    function onToggle(event) {
      const detail = event.target?.dataset?.altDetail;
      if (!detail || !currentPage()) return;
      const key = editKey(selectedPageUrl, detail);
      if (event.target.open) openDetails.add(key); else openDetails.delete(key);
    }

    function updateImageActions(key) {
      const image = currentImage(key), page = currentPage();
      if (!image || !page) return;
      const value = edits.get(editKey(page.url, key)) || initialEdit(image);
      for (const notice of dialog.querySelectorAll("[data-alt-unsaved]")) {
        if (notice.dataset.altUnsaved === key) notice.hidden = !edits.has(editKey(page.url, key));
      }
      const loaded = loadedSources.get(editKey(page.url, key)) === safeImageUrl(image.previewSrc || image.src);
      for (const note of dialog.querySelectorAll("[data-alt-note]")) {
        if (note.dataset.altNote === key) note.innerHTML = renderOpenDraftNote(image, value, e);
      }
      for (const note of dialog.querySelectorAll("[data-alt-note-history]")) {
        if (note.dataset.altNoteHistory === key) note.hidden = !reviewedDraftNote(image, value);
      }
      for (const button of dialog.querySelectorAll("[data-alt-action=approve]")) {
        if (button.dataset.altKey === key) button.disabled = busy || transferConfirming || transferRunning() || !loaded || !safeImageUrl(image.previewSrc || image.src)
          || image.status === "removed" || page.error || !page.checkedAt || value.observationHash !== (image.observationHash || "")
          || ambiguousImage(image) || !value.decorative && !value.text.trim();
      }
      for (const button of dialog.querySelectorAll("[data-alt-action=suggest]")) {
        if (button.dataset.altKey === key) button.disabled = !canSuggestImage(key);
      }
      for (const note of dialog.querySelectorAll("[data-alt-preview-note]")) {
        if (note.dataset.altPreviewNote === key) {
          note.hidden = loaded;
          note.textContent = loaded ? "" : "Die Vorschau konnte noch nicht geladen werden. Freigabe erst nach sichtbarer Bildprüfung.";
        }
      }
      for (const button of dialog.querySelectorAll("[data-alt-action=transfer]")) button.disabled = transferConfirming || !canTransferPage();
      const nextStep = pageNextStep(page);
      for (const next of nodes.page.querySelectorAll("[data-alt-next]")) {
        next.innerHTML = renderNextStep(nextStep);
        next.className = `website-alt-next${nextStep.complete ? " website-alt-complete" : ""}`;
      }
    }
    function onImage(event) {
      const target = event.target, key = target?.dataset?.altPreview, image = currentImage(key);
      if (!image || !controller.isOpen()) return;
      const source = safeImageUrl(image.previewSrc || image.src);
      if (target.getAttribute?.("src") !== source) return;
      if (event.type === "load") loadedSources.set(editKey(selectedPageUrl, key), source);
      else loadedSources.delete(editKey(selectedPageUrl, key));
      updateImageActions(key);
    }
    async function discard() {
      if (!hasEdits() || busy) return;
      if (!confirmAction) { message("Bitte die ungespeicherten Eingaben an den betreffenden Bildern einzeln zurücksetzen.", "warning"); return; }
      const ticket = generation;
      try {
        const confirmed = await confirmAction({ title: "Ungespeicherte Bildtexte verwerfen?", message: "Nur noch nicht gespeicherte Eingaben werden verworfen. Gespeicherte Entwürfe und Freigaben bleiben erhalten.", confirmLabel: "Eingaben verwerfen", danger: true });
        if (confirmed && alive(ticket) && !busy) { edits.clear(); render(); message("Ungespeicherte Eingaben verworfen."); }
      } catch (error) { if (alive(ticket)) message(error.message || "Die Bestätigung konnte nicht geöffnet werden.", "error"); }
    }
    function canSuggestImage(key) {
      const page = currentPage(), image = currentImage(key);
      if (!canEdit() || typeof openImageSuggestion !== "function" || !controller.isOpen() || stopped || busy || transferConfirming || transferRunning()
          || snapshot?.scan?.running || !page?.checkedAt || page.error || page.redirectUrl || !image
          || image.context !== "content" || image.kind !== "image" || image.status === "removed" || isAutomaticImage(image) || ambiguousImage(image)) return false;
      const value = edits.get(editKey(page.url, key)) || initialEdit(image), src = safeImageUrl(image.previewSrc || image.src);
      return Boolean(src && loadedSources.get(editKey(page.url, key)) === src && !value.decorative
        && value.observationHash && value.observationHash === image.observationHash);
    }
    async function suggestImage(key) {
      if (suggestionOpening || !canSuggestImage(key)) return false;
      suggestionOpening = true;
      const ticket = generation, selected = selection, page = currentPage(), image = currentImage(key);
      const value = edits.get(editKey(page.url, key)) || initialEdit(image), initialText = visibleEditText(image, value);
      const expected = { pageUrl: page.url, key, observationHash: image.observationHash, src: image.src,
        status: image.status, approvalRevision: image.approval?.revision, text: value.text, decorative: value.decorative };
      const isCurrent = (binding = {}) => {
        if (!alive(ticket) || selected !== selection || !canSuggestImage(key)) return false;
        const current = currentImage(key), edit = edits.get(editKey(expected.pageUrl, key)) || initialEdit(current);
        return selectedPageUrl === expected.pageUrl && current.observationHash === expected.observationHash && current.src === expected.src
          && current.status === expected.status && current.approval?.revision === expected.approvalRevision
          && edit.text === expected.text && visibleEditText(current, edit) === initialText && edit.decorative === expected.decorative
          && (!binding.pageUrl || binding.pageUrl === expected.pageUrl) && (!binding.imageKey || binding.imageKey === key)
          && (!binding.revision || binding.revision === expected.observationHash);
      };
      try {
        return await openImageSuggestion({ pageUrl: page.url, imageKey: key, observationHash: image.observationHash,
          previewUrl: image.previewSrc || image.src, initialText, context: { title: page.title }, isCurrent,
          applyProposal(text, caption) {
            if (!isCurrent() || typeof text !== "string" || !text.trim() || text.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)
                || (image.textCoupled ? caption !== text : caption !== null)) return false;
            const next = { ...value, text, displayText: text, decorative: false }, baseline = initialEdit(currentImage(key));
            if (text === baseline.text && visibleEditText(image, next) === visibleEditText(image, baseline) && !baseline.decorative) edits.delete(editKey(page.url, key));
            else edits.set(editKey(page.url, key), next);
            openDetails.add(editKey(page.url, key)); render();
            message("Vorschlag im Textentwurf. Bitte prüfen und bei Bedarf speichern; er ist noch nicht freigegeben.");
            return true;
          } });
      } catch (error) {
        if (alive(ticket)) message(error.message || "Die lokale Bildtexthilfe konnte nicht geöffnet werden.", "error");
        return false;
      } finally { suggestionOpening = false; }
    }
    function onClick(event) {
      const pageButton = event.target?.closest?.("[data-alt-page-url]");
      if (pageButton && dialog.contains?.(pageButton)) { void selectPage(pageButton.dataset.altPageUrl); return; }
      const button = event.target?.closest?.("[data-alt-action]");
      if (!button || button.disabled || !dialog.contains?.(button)) return;
      const action = button.dataset.altAction, key = button.dataset.altKey;
      if (action === "close") controller.close("button");
      else if (action === "refresh") void refresh();
      else if (action === "discover") void post("discover");
      else if (action === "scan" || action === "scan-page") void post("scan", action === "scan-page" ? { pageUrl: selectedPageUrl } : {});
      else if (action === "connect-transfer") void connectTransfer();
      else if (action === "transfer") void transferCurrentPage();
      else if (action === "suggest") void suggestImage(key);
      else if (action === "show-unsaved") void showUnsaved();
      else if (["draft", "approve", "verify"].includes(action)) void changeImage(action, key);
      else if (action === "reset") { edits.delete(editKey(selectedPageUrl, key)); render(); message("Ungespeicherte Eingabe zurückgesetzt."); }
      else if (action === "discard") void discard();
    }
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("input", onInput);
    dialog.addEventListener("change", onInput);
    dialog.addEventListener("load", onImage, true);
    dialog.addEventListener("error", onImage, true);
    dialog.addEventListener("toggle", onToggle, true);
    const onOpen = () => { void open(); };
    openButton?.addEventListener("click", onOpen);
    render();
    return Object.freeze({ open, refresh, discover: () => post("discover"), scan: (pageUrl) => post("scan", pageUrl ? { pageUrl } : {}),
      saveDraft: (key) => changeImage("draft", key), approve: (key) => changeImage("approve", key), verify: (key) => changeImage("verify", key),
      connectTransfer, transfer: transferCurrentPage, suggestImage,
      selectPage, showUnsaved,
      snapshot: () => snapshot,
      hasUnsavedDrafts: hasEdits,
      stop() {
        if (stopped) return;
        stopped = true; closeSession(); controller.destroy?.();
        openButton?.removeEventListener?.("click", onOpen);
        dialog.removeEventListener?.("click", onClick); dialog.removeEventListener?.("input", onInput); dialog.removeEventListener?.("change", onInput);
        dialog.removeEventListener?.("load", onImage, true); dialog.removeEventListener?.("error", onImage, true);
        dialog.removeEventListener?.("toggle", onToggle, true);
      } });
  }

  function setupWebsiteAltTexts(options = {}) {
    const controller = createWebsiteAltTextsController({ ...options,
      dialog: global.document.querySelector("#website-alt-texts-dialog"),
      openButton: global.document.querySelector("#website-alt-texts-open"),
    });
    global.addEventListener?.("pagehide", () => controller.stop(), { once: true });
    return controller;
  }

  global.SpeciesExplorerWebsiteAltTexts = Object.freeze({ safeImageUrl, safePageUrl, renderAltImageCard,
    createWebsiteAltTextsController, setupWebsiteAltTexts, STATUS_LABELS });
})(globalThis);
