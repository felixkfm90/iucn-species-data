(function initializeWebsiteAltSync(global) {
  "use strict";
  const BASE = "/api/website/alt-texts/shared";
  const HEADER_LOGO = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
  const STATES = Object.freeze({ creating: "Verknüpfung noch offen", linked: "Mit dem gemeinsamen Projekt verknüpft", unrelated: "Vorhandene Fassungen vergleichen",
    queued: "Gespeicherte Änderungen warten auf Abgleich", conflict: "Beide Fassungen brauchen eine Entscheidung", "local-changed": "Lokale Änderungen noch nicht gesendet", pulled: "Gemeinsame Fassung geladen · lokale Übernahme offen" });
  const IMAGE_STATES = Object.freeze({ unknown: "Noch nicht erfasst", missing: "Text fehlt", unreviewed: "Noch ungeprüft", draft: "Entwurf", approved: "Freigegeben", verified: "Öffentlich bestätigt", changed: "Erneut prüfen", removed: "Bild nicht mehr gefunden" });
  const ERRORS = Object.freeze({ authentication_required: "Bitte zuerst im gemeinsamen Projekt anmelden.", forbidden: "Für diese Aktion fehlt die Berechtigung oder eine volle Anmeldung.",
    offline: "Der gemeinsame Dienst ist nicht erreichbar. Gespeicherte Texte bleiben erhalten.", website_alt_local_changed: "Die lokale Seite wurde geändert. Bitte neu vergleichen.",
    website_alt_stale_scan: "Die Bildgrundlage ist älter als der gemeinsame Stand. Bitte die Seite erneut erfassen und vergleichen.", object_changed: "Die gemeinsame Fassung hat sich geändert. Bitte neu vergleichen.",
    objects_snapshot_changed: "Bestand oder Berechtigung wurde geändert. Bitte den Stand neu laden.", website_alt_adoption_required: "Vorhandene Freigaben brauchen eine ausdrückliche Übernahme mit Freigaberecht.",
    website_alt_review_required: "Bitte beide Fassungen vor dem nächsten Schritt vergleichen.", website_alt_untrusted_record: "Diese Fassung besitzt keinen passenden gemeinsamen Herkunftsnachweis." });
  function pageUrl(value) {
    try { const url = new URL(value); return url.origin === "https://www.fnwildlifetravel.de" && !url.username && !url.password && !url.search && !url.hash ? url.href : ""; }
    catch { return ""; }
  }
  function createWebsiteAltSyncController({ fetchJson, createDialogController, confirmAction, documentRef = global.document,
    safeImageUrl = global.SpeciesExplorerWebsiteAltTexts?.safeImageUrl, canEdit = () => true, requestTimeoutMs = 30000,
    setTimeoutImpl = global.setTimeout.bind(global), clearTimeoutImpl = global.clearTimeout.bind(global), apiPrefix = BASE } = {}) {
    if (typeof fetchJson !== "function" || typeof createDialogController !== "function" || typeof safeImageUrl !== "function"
      || !documentRef?.createElement || !documentRef.body || apiPrefix !== BASE) throw new TypeError("Gemeinsame Bildtexte benötigen den vorhandenen Dialog-, Vorschau- und API-Anschluss.");
    const make = (tag, text = "", className = "") => { const node = documentRef.createElement(tag); node.textContent = text; if (className) node.className = className; return node; };
    const dialog = make("dialog", "", "website-alt-dialog website-alt-sync-dialog"), shell = make("div", "", "website-alt-shell"), header = make("header", "", "website-alt-sync-header");
    const heading = make("h2", "Gemeinsame Bildtexte"), closeButton = make("button", "Schließen"); closeButton.type = "button";
    heading.id = `website-alt-sync-title-${Math.random().toString(36).slice(2)}`; dialog.setAttribute("aria-labelledby", heading.id); header.append(heading, closeButton);
    const intro = make("p", "Hier teilt ihr gespeicherte Bildtexte und Prüfstände. Die Übernahme in Squarespace bleibt ein eigener Schritt.", "website-alt-note");
    const status = make("p", "", "website-alt-sync-status"), summary = make("p", "", "website-alt-note"), actions = make("div", "", "website-alt-actions");
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const adoptLabel = make("label", "", "website-alt-checkbox"), adopt = make("input"); adopt.type = "checkbox";
    adoptLabel.append(adopt, make("span", "Vorhandene Freigaben ausdrücklich ins gemeinsame Projekt übernehmen"));
    const comparisons = make("div", "", "website-alt-sync-comparisons"), buttons = {};
    for (const [id, text] of Object.entries({ refresh: "Stand neu lesen", link: "Seite gemeinsam verwenden", send: "Meine gespeicherten Änderungen senden", pull: "Gemeinsamen Stand laden",
      import: "Geladene Fassung auf diesem PC übernehmen", current: "Gemeinsame Fassung wählen", local: "Meine Fassung wählen" })) {
      const node = make("button", text); node.type = "button"; buttons[id] = node; actions.append(node);
    }
    shell.append(header, intro, status, summary, adoptLabel, actions, comparisons); dialog.append(shell); documentRef.body.append(dialog);
    let selection = null, snapshot = null, record = null, conflicts = [], busy = false, disposed = false, uncertain = false, epoch = 0, message = "", adoption = false;
    const listeners = [], requests = new Set();
    const listen = (node, event, handler) => { node.addEventListener(event, handler); listeners.push(() => node.removeEventListener?.(event, handler)); };
    const isOpen = () => controls.isOpen();
    const alive = ticket => !disposed && ticket === epoch && isOpen();
    const permission = name => Boolean(record?.permissions?.[name] ?? snapshot?.permissions?.[name]);
    const selectedConflict = () => record?.state === "conflict" ? conflicts.find(item => item.objectId === record?.remote?.id) || conflicts[0] : null;
    const remoteRevision = () => selectedConflict()?.currentRevision || record?.remote?.revision || null;
    const remotePage = () => selectedConflict()?.current?.page || record?.remote?.data?.page || null;
    const binding = () => snapshot?.binding ? JSON.stringify([snapshot.binding.origin, snapshot.binding.projectId, snapshot.binding.userId]) : "";
    const revisionBinding = () => JSON.stringify([selection?.pageUrl, binding(), record?.pageRevision, remoteRevision(), record?.state,
      ["canRead", "canEdit", "canApprove", "canCreate"].map(permission), conflicts.map(item => [item.id, item.currentRevision, item.resolvedAt])]);
    function say(text) { message = text; status.textContent = text; }
    function hideDenied(error) {
      if (["authentication_required", "forbidden"].includes(error?.code) || [401, 403].includes(error?.status || error?.statusCode)) { record = null; conflicts = []; snapshot = { ...snapshot,
        permissions: { canRead: false, canEdit: false, canApprove: false, canCreate: false } }; }
    }
    function imageView(value) {
      try { const url = new URL(safeImageUrl(value)); return url.protocol === "https:" && !url.username && !url.password
        && ![...url.searchParams.keys()].some(key => /token|password|credential|signature/i.test(key)) ? url.href : ""; } catch { return ""; }
    }
    function visibleText(image, value) {
      if (image?.context === "header" && image.kind === "image" && value === "FN Wildlife &amp; Travel") {
        try { const url = new URL(image.sourceUrl || image.src); if (`${url.origin}${url.pathname}` === HEADER_LOGO) return "FN Wildlife & Travel"; } catch { /* Unknown sources retain their literal text. */ }
      }
      return value;
    }
    function imageText(image) {
      if (!image) return "In dieser Fassung nicht enthalten";
      const decorative = image.approval ? image.approval.decorative : image.draftDecorative;
      if (decorative && !(image.approval?.text || image.draftText)) return "Bewusst dekorativ · ohne Bildtext";
      if (image.approval) return visibleText(image, image.approval.text) || "Kein Text";
      if (image.draftSavedAt || image.status === "draft" || image.draftText) return visibleText(image, image.draftText) || "Bewusst leerer Entwurf";
      return visibleText(image, image.caption || image.alt) || "Noch kein Text vorhanden";
    }
    function side(label, image) {
      const node = make("section", "", "website-alt-sync-side"); node.append(make("h4", label), make("p", IMAGE_STATES[image?.status] || "Nicht enthalten", "website-alt-note"), make("p", imageText(image), "website-alt-sync-text"));
      if (image?.caption && image.caption !== imageText(image)) {
        const details = make("details"); details.append(make("summary", "Beobachtete Bildunterschrift"), make("p", visibleText(image, image.caption), "website-alt-sync-text")); node.append(details);
      }
      if (image?.history?.length) {
        const details = make("details"); details.append(make("summary", `Verlauf erhalten · ${image.history.length} Einträge`));
        for (const item of image.history.slice(-3)) details.append(make("p", visibleText(image, item.approval?.text ?? item.draftText ?? item.reason ?? "Frühere Entscheidung"), "website-alt-sync-text"));
        node.append(details);
      }
      return node;
    }
    function renderComparisons() {
      comparisons.replaceChildren(); if (!record?.page) return;
      const local = record.page, remote = remotePage(), base = selectedConflict()?.base?.page, keys = [...new Set([...(local.images || []), ...(remote?.images || []), ...(base?.images || [])].map(image => image.key))];
      for (const [index, key] of keys.entries()) {
        const localImage = local.images.find(item => item.key === key), remoteImage = remote?.images?.find(item => item.key === key), baseImage = base?.images?.find(item => item.key === key);
        const card = make("article", "", "website-alt-sync-card"), figure = make("figure"), chosen = localImage || remoteImage || baseImage;
        const preview = imageView(chosen?.previewSrc || chosen?.sourceUrl || chosen?.src);
        if (preview) {
          const image = make("img"); image.src = preview; image.alt = `Bild ${index + 1} zur Textprüfung`; image.loading = "lazy"; image.decoding = "async"; image.crossOrigin = "anonymous"; image.referrerPolicy = "no-referrer";
          const failed = make("p", "Vorschau nicht verfügbar"); failed.hidden = true; image.addEventListener("error", () => { image.hidden = true; failed.hidden = false; }); figure.append(image, failed);
        } else figure.append(make("p", "Keine sichere Bildvorschau verfügbar"));
        figure.append(make("figcaption", `Bild ${index + 1}`, "website-alt-note"));
        const sides = make("div", "", "website-alt-sync-sides"); sides.append(side("Auf diesem PC", localImage), side("Im gemeinsamen Projekt", remoteImage));
        if (baseImage) { const details = make("details", "", "website-alt-sync-base"); details.append(make("summary", "Ausgangsfassung vor dem Konflikt"), side("Vorheriger gemeinsamer Text", baseImage)); sides.append(details); }
        card.append(figure, sides); comparisons.append(card);
      }
    }
    function render() {
      const unavailable = snapshot?.available === false, linked = Boolean(record?.linked), comparing = ["conflict", "unrelated", "pulled"].includes(record?.state);
      const canAct = canEdit() && !busy && !uncertain && !unavailable && permission("canEdit") && Boolean(record?.pageRevision) && !snapshot?.busy;
      heading.textContent = selection?.title ? `${selection.title} · gemeinsame Bildtexte` : "Gemeinsame Bildtexte";
      status.textContent = message;
      summary.textContent = unavailable ? "Gemeinsames Projekt in der Desktop-App einrichten." : snapshot && !permission("canEdit") ? "Zuerst unter Datenbank-Aktionen → Weitere Aktionen → Backup und Einstellungen → Gemeinsames Projekt anmelden."
        : record ? `${STATES[record.state] || (linked ? "Seitenstand geladen" : "Nur auf diesem PC · noch nicht verknüpft")}${record.pageRevision ? ` · lokal ${record.pageRevision.slice(0, 8)}` : ""}${remoteRevision() ? ` · gemeinsam ${remoteRevision().slice(0, 8)}` : ""}` : "";
      const activeApprovals = record?.page?.images?.some(image => image.approval);
      adoptLabel.hidden = !permission("canApprove") || !activeApprovals; adopt.disabled = !canAct; adopt.checked = adoption;
      buttons.refresh.disabled = busy || unavailable; closeButton.disabled = busy;
      buttons.link.hidden = linked; buttons.link.disabled = !canAct || snapshot?.permissions?.canCreate === false;
      buttons.send.hidden = !linked || comparing; buttons.send.disabled = !canAct;
      buttons.pull.hidden = !linked; buttons.pull.disabled = !canEdit() || busy || uncertain || unavailable || !permission("canRead") || !record?.pageRevision || ["queued", "conflict"].includes(record?.state);
      buttons.import.hidden = record?.state !== "pulled"; buttons.import.disabled = !canAct;
      buttons.current.hidden = !comparing; buttons.local.hidden = !comparing;
      buttons.current.disabled = !canAct || !remoteRevision(); buttons.local.disabled = !canAct || !remoteRevision();
      renderComparisons();
    }
    async function call(path, body) {
      const controller = new global.AbortController(); requests.add(controller); let timer;
      const expired = new Promise((_, reject) => { timer = setTimeoutImpl(() => { controller.abort(); const error = new Error("timeout"); error.code = "timeout"; reject(error); }, requestTimeoutMs); });
      try { return await Promise.race([Promise.resolve().then(() => fetchJson(`${apiPrefix}${path}`, { signal: controller.signal,
        ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) })), expired]); }
      finally { clearTimeoutImpl(timer); requests.delete(controller); }
    }
    async function eligible() {
      try { return canEdit() && Boolean(selection) && await selection.isCurrent({ pageUrl: selection.pageUrl, pageRevision: record?.pageRevision }) === true
        && await selection.hasUnsavedChanges() === false; } catch { return false; }
    }
    async function load(ticket) {
      const nextSnapshot = await call(""); if (!alive(ticket)) return false;
      if (nextSnapshot.available === false || nextSnapshot.permissions?.canEdit === false) { snapshot = nextSnapshot; record = null; conflicts = []; render(); return true; }
      if (nextSnapshot.busy) { snapshot = nextSnapshot; render(); return true; }
      const next = await call(`/page?pageUrl=${encodeURIComponent(selection.pageUrl)}`); if (!alive(ticket)) return false;
      if (next.pageUrl !== selection.pageUrl || next.page?.url !== selection.pageUrl || typeof next.pageRevision !== "string") throw new Error("invalid page response");
      const finalSnapshot = await call(""); if (!alive(ticket)) return false;
      const beforeBinding = nextSnapshot.binding, afterBinding = finalSnapshot.binding;
      if (beforeBinding && afterBinding && JSON.stringify(beforeBinding) !== JSON.stringify(afterBinding)) throw new Error("changed personal binding");
      const nextConflicts = next.linked && (next.permissions?.canEdit ?? finalSnapshot.permissions?.canEdit)
        ? await call(`/conflicts?pageUrl=${encodeURIComponent(selection.pageUrl)}`) : { conflicts: [] };
      if (!alive(ticket)) return false;
      if (!Array.isArray(nextConflicts.conflicts) || nextConflicts.conflicts.some(item => item.objectId !== next.remote?.id)) throw new Error("foreign page conflict");
      if (snapshot?.binding && JSON.stringify(snapshot.binding) !== JSON.stringify(finalSnapshot.binding)) adoption = false;
      snapshot = finalSnapshot; record = next; conflicts = nextConflicts.conflicts; render(); return true;
    }
    async function read() {
      if (disposed || busy || !isOpen()) return false; busy = true; const ticket = epoch; render();
      try { const loaded = await load(ticket); if (loaded && alive(ticket)) { uncertain = Boolean(snapshot?.busy); say(uncertain ? "Eine begonnene Aktion läuft noch. Bitte ihren Abschluss abwarten."
        : snapshot?.available === false ? "Gemeinsame Bildtexte stehen in diesem Fenster noch nicht zur Verfügung."
        : !permission("canEdit") ? "Gemeinsame Bildtexte benötigen eine redaktionelle Projektanmeldung." : "Stand neu gelesen. Gespeicherte Änderungen werden erst auf deinen Klick gesendet."); } return loaded; }
      catch (error) { if (alive(ticket)) { hideDenied(error); uncertain = true; say("Der Stand konnte nicht gelesen werden. Bitte erneut prüfen; es wird nichts automatisch wiederholt."); } return false; }
      finally { if (alive(ticket)) { busy = false; render(); } }
    }
    async function confirm(title, text) {
      return typeof confirmAction === "function" ? await confirmAction({ title, message: text, confirmLabel: "Bestätigen" }) === true : global.confirm?.(`${title}\n\n${text}`) === true;
    }
    async function mutation(action, strategy) {
      if (!canEdit() || disposed || busy || uncertain || !record || snapshot?.busy || snapshot?.available === false || !permission(action === "pull" ? "canRead" : "canEdit")
        || action === "link" && snapshot?.permissions?.canCreate === false) return false;
      busy = true; const ticket = epoch, shown = revisionBinding(), expectedPageRevision = record.pageRevision, expectedRemoteRevision = remoteRevision(), conflict = selectedConflict(), adoptApproved = adoption && permission("canApprove"); render();
      try {
        if (!await eligible() || !alive(ticket)) { say("Die Seite oder ihre Eingaben wurden geändert. Bitte zuerst speichern und neu vergleichen."); return false; }
        await load(ticket);
        if (!alive(ticket) || snapshot?.busy || shown !== revisionBinding() || !await eligible()) { say("Der angezeigte Stand hat sich geändert oder wird gerade verarbeitet. Bitte beide Fassungen neu vergleichen."); return false; }
        const texts = {
          link: ["Seite gemeinsam verwenden", "Die gespeicherten Bildtexte und Prüfstände dieser Seite ins gemeinsame Projekt übernehmen?"],
          send: ["Gespeicherte Änderungen senden", "Nur die angezeigte gespeicherte Fassung dieser Seite senden? Andere Seiten bleiben unberührt."],
          pull: ["Gemeinsamen Stand laden", "Den gemeinsamen Stand dieser Seite zum Vergleich holen? Die Texte auf diesem PC bleiben zunächst erhalten."],
          import: ["Gemeinsame Fassung übernehmen", "Die angezeigte gemeinsame Fassung auf diesem PC übernehmen? Die bisherige Fassung und ihre Entscheidungen bleiben im Verlauf erhalten."],
          resolve: [strategy === "current" ? "Gemeinsame Fassung wählen" : "Meine Fassung wählen", "Beide Fassungen wurden verglichen. Diese Auswahl als Ziel festlegen? Die andere Fassung und der Ausgangsstand bleiben erhalten; die lokale Übernahme folgt getrennt."]
        };
        const [title, text] = texts[action];
        if (!await confirm(title, `${text}${adoptApproved ? " Bestehende Freigaben werden dabei ausdrücklich mit deinem Freigaberecht übernommen." : ""} Es wird nichts in Squarespace veröffentlicht.`)) return false;
        if (!alive(ticket) || !await eligible()) { say("Die Seite oder ihre Eingaben wurden während der Bestätigung geändert. Bitte neu vergleichen."); return false; }
        await load(ticket);
        if (!alive(ticket) || snapshot?.busy || shown !== revisionBinding() || !await eligible()) { say("Die lokale oder gemeinsame Fassung wurde inzwischen geändert oder wird gerade verarbeitet. Bitte neu vergleichen."); return false; }
        const body = { pageUrl: selection.pageUrl, expectedPageRevision };
        let result;
        if (action === "send") {
          const queued = await call("/queue", { ...body, adoptUnlinkedApprovals: adoptApproved });
          if (queued?.queued !== true) throw new Error("queue not acknowledged");
          if (!alive(ticket) || !await eligible()) { say("Die Fassung ist vorgemerkt. Vor dem Senden bitte die geänderte Seite neu vergleichen."); return false; }
          result = await call("/sync", body);
        } else result = await call(`/${action}`, { ...body,
          ...(["link", "import", "resolve"].includes(action) ? { confirmed: true } : {}),
          ...(["link", "resolve"].includes(action) ? { adoptUnlinkedApprovals: adoptApproved } : {}),
          ...(action === "resolve" ? { strategy, expectedRemoteRevision, ...(conflict?.id ? { conflictId: conflict.id } : {}) } : {}) });
        if (!alive(ticket)) return false;
        if (!result || action === "link" && result.linked !== true || action === "import" && result.imported !== true
          || action === "send" && typeof result.synced !== "boolean" || ["pull", "resolve"].includes(action) && result.requiresExplicitImport !== true) throw new Error("action not acknowledged");
        let mainStillCurrent = await eligible();
        if (action === "import" && mainStillCurrent && await selection.onImported?.({ pageUrl: selection.pageUrl, pageRevision: result.pageRevision, localRevision: result.localRevision }) === false) mainStillCurrent = false;
        if (!alive(ticket)) return false;
        adoption = false; await load(ticket); uncertain = false;
        say(action === "import" && !mainStillCurrent ? "Die gemeinsame Fassung wurde gespeichert. Deine inzwischen geänderten Eingaben bleiben offen; bitte im Hauptfenster gezielt neu laden." : action === "send" ? result.conflict ? "Beide Fassungen bleiben erhalten. Bitte den Konflikt vergleichen." : result.synced ? "Diese Seite ist mit dem gemeinsamen Projekt abgeglichen. Squarespace wurde nicht verändert." : "Der Abgleich ist noch offen. Bitte den aktuellen Stand vergleichen."
          : action === "import" ? result.imported === true ? "Die bestätigte gemeinsame Fassung wurde auf diesem PC übernommen." : "Die lokale Übernahme wurde nicht bestätigt. Bitte den Stand neu lesen."
          : action === "link" ? result.reviewRequired ? "Die Seite besteht bereits. Bitte die beiden Fassungen vergleichen." : "Die Seite ist jetzt ausdrücklich mit dem gemeinsamen Projekt verknüpft."
          : "Gemeinsame Fassung geladen. Bitte vergleichen und die lokale Übernahme getrennt bestätigen.");
        return true;
      } catch (error) {
        if (alive(ticket)) {
          hideDenied(error);
          uncertain = true;
          say(`${ERRORS[error?.code] || "Die Aktion wurde nicht bestätigt. Gespeicherte Texte bleiben erhalten."} Bitte den Stand neu lesen; es wird nichts automatisch wiederholt.`);
        }
        return false;
      } finally { if (alive(ticket)) { busy = false; render(); } }
    }
    const controls = createDialogController({ dialog, closeButtons: [closeButton], beforeClose: () => !busy,
      afterClose: () => {
        if (busy && !disposed) { controls.open(); say("Die begonnene Aktion läuft noch. Bitte ihren Abschluss abwarten."); return; }
        const onClosed = selection?.onClosed;
        epoch++; selection = null; record = null; snapshot = null; conflicts = []; uncertain = false; comparisons.replaceChildren();
        onClosed?.();
      } });
    for (const id of ["link", "send", "pull", "import"]) listen(buttons[id], "click", () => mutation(id));
    listen(buttons.current, "click", () => mutation("resolve", "current")); listen(buttons.local, "click", () => mutation("resolve", "local"));
    listen(buttons.refresh, "click", read); listen(adopt, "change", () => { adoption = adopt.checked === true; });
    function stop() {
      if (disposed) return;
      disposed = true; epoch++; for (const controller of requests) controller.abort(); for (const remove of listeners) remove();
      selection = null; record = null; snapshot = null; conflicts = []; uncertain = false; controls.destroy(); dialog.remove();
    }
    render();
    return {
      async openForPage(input = {}) {
        if (!canEdit() || disposed || busy || !pageUrl(input.pageUrl) || typeof input.isCurrent !== "function" || typeof input.hasUnsavedChanges !== "function") return false;
        if (isOpen() && !controls.close("page-change")) return false;
        selection = { pageUrl: pageUrl(input.pageUrl), title: String(input.title || "").slice(0, 160), isCurrent: input.isCurrent,
          hasUnsavedChanges: input.hasUnsavedChanges, onImported: input.onImported, onClosed: input.onClosed };
        snapshot = null; record = null; conflicts = []; adoption = false; uncertain = false; epoch++; say("Gespeicherte Bildtexte werden zum Vergleich gelesen …"); controls.open();
        return read();
      },
      refresh: read,
      close() { return !disposed && controls.close("button"); },
      hasUnsavedChanges: () => !disposed && (busy || uncertain),
      getState: () => ({ open: isOpen(), busy, uncertain, disposed, pageUrl: selection?.pageUrl || null, pageRevision: record?.pageRevision || null, remoteRevision: remoteRevision(), message }),
      async dispose() {
        if (disposed) return true; if (busy || isOpen() && !controls.close("dispose")) return false;
        stop(); return true;
      },
      stop,
    };
  }
  global.SpeciesExplorerWebsiteAltSync = Object.freeze({ createWebsiteAltSyncController });
})(globalThis);
