(function initializeSharedProject(global) {
  "use strict";
  const BASE = "/api/shared-project";
  const ROLE_LABELS = Object.freeze({ admin: "Administration", publisher: "Redaktion mit Freigabe", contributor: "Mitarbeit", reader: "Lesen" });
  const CONNECTION_LABELS = Object.freeze({ online: "Mit dem gemeinsamen Projekt verbunden", offline: "Offline · geladene Inhalte und lokale Entwürfe bleiben verfügbar",
    disconnected: "Nicht angemeldet", "authentication-required": "Erneute Anmeldung erforderlich", forbidden: "Berechtigung oder volle Anmeldung prüfen", closed: "Verbindung geschlossen" });
  const ERROR_LABELS = Object.freeze({ offline: "Der Dienst ist nicht erreichbar. Lokale Änderungen bleiben erhalten.",
    authentication_required: "Bitte erneut anmelden. Lokale Änderungen bleiben erhalten.", forbidden: "Für diese Aktion fehlt die Berechtigung oder eine volle Anmeldung.",
    last_admin: "Die letzte aktive Administration muss erhalten bleiben.", user_changed: "Die Benutzerangaben wurden inzwischen geändert. Bitte neu laden.",
    local_object_changed: "Die angezeigte Fassung wurde inzwischen geändert. Deine Eingaben bleiben erhalten; bitte neu vergleichen.",
    object_changed: "Die Serverfassung wurde seit der Anzeige geändert. Bitte neu laden und vergleichen.", pending_review: "Bitte zuerst abgleichen und die bestätigte Fassung prüfen.",
    conflict_review_changed: "Die Seitenfassungen haben sich seit der Anzeige geändert. Bitte erneut vergleichen.",
    object_exists: "Diese Art oder Seite besteht bereits. Bitte den Serverstand laden.", followup_decision_required: "Weitere lokale Fassungen sind erhalten. Bitte einen gemeinsamen Zieltext festlegen.",
    password_not_changed: "Das bisherige Passwort oder die Anmeldung muss erneut geprüft werden.", login_throttled: "Zu viele Anmeldeversuche. Bitte später erneut versuchen.",
    unsafe_server: "Bitte eine gültige HTTPS-Adresse des gemeinsamen Dienstes eingeben.", redirect_rejected: "Eine Weiterleitung wurde aus Sicherheitsgründen abgewiesen.",
    credential_store_unavailable: "Die geschützte Anmeldung konnte nicht gespeichert werden. Die Verbindung wurde nicht übernommen.",
    pairing_server_required: "Handy-Kopplung benötigt eine neuere Version des Projektdienstes.",
    pairing_unavailable: "Der QR-Code konnte nicht angezeigt werden. Bitte eine neue Einladung erstellen." });
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function safeImageUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return "";
      const allowed = ["www.fnwildlifetravel.de", "images.squarespace-cdn.com", "static1.squarespace.com", "static.squarespace.com", "images.squarespace.com"].includes(url.hostname)
        || url.hostname === "felixkfm90.github.io" && url.pathname.startsWith("/iucn-species-data/");
      if ([...url.searchParams.keys()].some((key) => /token|password|credential|signature/i.test(key))) return "";
      return allowed ? url.href : "";
    } catch { return ""; }
  }
  function createSharedProjectApi(fetchJson) {
    const send = (suffix, data = {}) => fetchJson(`${BASE}${suffix}`, { method: "POST", body: JSON.stringify(data) });
    const objectPath = (kind, id) => `/objects/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;
    return { snapshot: () => fetchJson(BASE), connect: (data) => send("/connect", data), disconnect: () => send("/disconnect"),
      sync: () => send("/sync"), refresh: (data) => send("/refresh", data), list: () => fetchJson(`${BASE}/objects`),
      get: (kind, id) => fetchJson(`${BASE}${objectPath(kind, id)}`), editExisting: (kind, id, data) => send(objectPath(kind, id), data),
      create: (data) => send("/objects", data), approve: (kind, id, data) => send(`${objectPath(kind, id)}/approve`, data),
      conflicts: () => fetchJson(`${BASE}/conflicts`), resolve: (id, data) => send(`/conflicts/${encodeURIComponent(id)}/resolve`, data),
      createUser: (data) => send("/users", data), updateUser: (id, data) => send(`/users/${encodeURIComponent(id)}`, data),
      issueReadPairing: (data) => send("/devices/pairing", data),
      revokeDevice: (id) => send(`/devices/${encodeURIComponent(id)}/revoke`), changePassword: (data) => send("/password", data) };
  }

  function setupSharedProject({ fetchJson, confirmAction, createDialogController, canEdit,
    onProjectState = () => {},
    documentImpl = global.document } = {}) {
    const controller = createSharedProjectController({
      elements: { sharedProjectRoot: documentImpl.querySelector("#shared-project-root") },
      fetchJson, confirmAction, documentImpl, canEdit,
      onProjectState: (state) => { importer.setProjectState?.(state); onProjectState(state); },
    });
    const dialog = createDialogController({ dialog: documentImpl.querySelector("#shared-project-dialog"),
      closeButtons: [documentImpl.querySelector("#shared-project-close")],
      beforeClose: () => controller.getState().busy ? false : undefined,
      afterClose: () => { controller.hidePairing(); documentImpl.querySelector("#app-menu-button")?.focus?.(); },
    });
    const importer = global.SpeciesExplorerSharedImport.createInitialProjectImportController({
      root: documentImpl.querySelector("#shared-project-import-root"), fetchJson, confirmAction,
      hasUnsavedChanges: () => controller.hasUnsavedChanges(), refreshProject: () => controller.refresh(),
      documentRef: documentImpl, canEdit,
    });
    documentImpl.querySelector("#shared-project-open").addEventListener("click", () => {
      const settings = documentImpl.querySelector("#settings-dialog");
      if (settings?.open) { settings.querySelector(".settings-cancel")?.click(); if (settings.open) return; }
      if (dialog.open()) void (async () => { await controller.open(); await importer.refresh(); })().catch(() => {});
    });
    global.addEventListener("pagehide", () => { importer.destroy(); controller.destroy(); }, { once: true });
    return { controller, importer };
  }

  function createSharedProjectController({ elements, api, fetchJson, setStatus = () => {}, confirmAction, onProjectState = () => {}, canEdit: editingAllowed = () => true,
    documentImpl = global.document } = {}) {
    const root = elements?.sharedProjectRoot || elements?.root;
    if (!root || !documentImpl?.createElement || !api && typeof fetchJson !== "function") throw new TypeError("Gemeinsames Projekt benötigt einen Bereich und die lokale Explorer-API.");
    const mutationPermissions = { sync: "canRead", editExisting: "canEdit", create: "canCreate", approve: "canApprove", resolve: "canEdit",
      createUser: "canManageUsers", updateUser: "canManageUsers", issueReadPairing: "canManageDevices", revokeDevice: "canManageDevices", changePassword: "canChangePassword" };
    const readOnlyError = () => Object.assign(new Error("Im Lesemodus werden keine Projektänderungen übernommen."), { code: "local_read_only" });
    const remote = new Proxy(api || createSharedProjectApi(fetchJson), { get(target, key) {
      const value = target[key];
      if (typeof value !== "function") return value;
      return (...args) => {
        if (Object.hasOwn(mutationPermissions, key)) {
          if (!editingAllowed()) throw readOnlyError();
          if (snapshot?.permissions?.[mutationPermissions[key]] !== true) throw Object.assign(new Error("Projektberechtigung fehlt."), { code: "forbidden" });
        }
        return value.apply(target, args);
      };
    } });
    let modeGeneration = 0, lastEditingMode = Boolean(editingAllowed());
    let snapshot = null, selected = null, draft = null, editRevision = "", dirty = false, busy = false, stopped = false, epoch = 0, counter = 0, merge = null, suspended = null, confirming = false, speciesReview = null, draftGeneration = 0;
    const nodes = {}, conflictButtons = [];
    let removePairing = null;
    const identityKey = (value = snapshot) => JSON.stringify([value?.status?.baseUrl, value?.status?.projectId, value?.status?.user?.id]);
    const ownerKey = (value = snapshot) => JSON.stringify([value?.status?.baseUrl, value?.status?.projectId,
      value?.status?.user?.id, value?.status?.user?.role, value?.status?.user?.version, value?.status?.readOnlySession]);
    const create = (tag, text, className) => { const node = documentImpl.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; };
    function button(text, action, disabled = false) { const node = create("button", text); node.type = "button"; node.disabled = disabled; node.addEventListener("click", action); return node; }
    function editButton(text, action, disabled = false, bound = true) {
      const generation = modeGeneration, owner = ownerKey();
      const node = button(text, (...args) => editingAllowed() && (!bound || generation === modeGeneration && owner === ownerKey()) ? action(...args) : undefined, disabled || !editingAllowed());
      node.sharedRequiresEdit = true; return node;
    }
    function field(parent, title, value, update, { multiline = false, type = "text", required = false, maxLength = 100000, disabled = false, requiresEdit = false } = {}) {
      const label = create("label", title), input = create(multiline ? "textarea" : "input");
      const generation = modeGeneration, owner = ownerKey();
      if (!multiline) input.type = type; else input.rows = 4;
      input.value = value ?? ""; input.required = required; input.maxLength = maxLength; input.disabled = disabled || requiresEdit && !editingAllowed(); input.sharedRequiresEdit = requiresEdit;
      input.addEventListener("input", () => {
        if (!disabled && (!requiresEdit || editingAllowed() && generation === modeGeneration && owner === ownerKey())) update(input.value);
      }); label.append(input); parent.append(label); return input;
    }
    function editField(parent, title, value, update, options = {}) { return field(parent, title, value, update, { ...options, requiresEdit: true }); }
    function checkbox(parent, title, checked, update, disabled = false) {
      const label = create("label", undefined, "shared-project-check"), input = create("input"); input.type = "checkbox"; input.checked = checked; input.disabled = disabled;
      const generation = modeGeneration, owner = ownerKey();
      input.sharedRequiresEdit = true; input.disabled ||= !editingAllowed();
      input.addEventListener("change", () => { if (!disabled && editingAllowed() && generation === modeGeneration && owner === ownerKey()) return update(input.checked, input); }); label.append(input, create("span", title)); parent.append(label); return input;
    }
    function details(parent, title) { const node = create("details"), content = create("div"); node.append(create("summary", title), content); parent.append(node); return content; }
    function message(text, error = false) {
      nodes.message.textContent = text; nodes.message.className = `shared-project-message${error ? " error" : ""}`;
      nodes.message.hidden = !text; setStatus(text, error ? "error" : "info");
    }
    async function confirm(title, text) {
      if (confirming) return false;
      confirming = true; const generation = modeGeneration;
      try {
        const accepted = confirmAction ? Boolean(await confirmAction({ title, message: text, confirmLabel: "Bestätigen" }))
          : Boolean(global.confirm?.(`${title}\n\n${text}`));
        return accepted && generation === modeGeneration;
      } finally { confirming = false; }
    }
    async function discard() {
      if (speciesReview?.busy) return false;
      if (!dirty && !suspended && !speciesReview?.hasUnsavedChanges()) return true;
      if (!await confirm("Ungespeicherte Eingaben", "Sollen die Eingaben im Formular verworfen werden? Gespeicherte lokale Entwürfe bleiben erhalten.")) return false;
      if (speciesReview && !speciesReview.reset()) return false;
      suspended = null;
      return true;
    }
    function changed() { draftGeneration++; dirty = true; if (nodes.save) nodes.save.disabled = busy || !snapshot?.permissions?.canEdit && !selected?.isNew; if (nodes.approve) nodes.approve.disabled = true; }
    function permission(key) { return !busy && !speciesReview?.busy && (key === "canRead" || editingAllowed()) && Boolean(snapshot?.permissions?.[key]); }
    async function action(fn, success) {
      if (busy || speciesReview?.busy || stopped) return null;
      busy = true; const ticket = epoch;
      for (const node of root.querySelectorAll("input, textarea, select, button")) { node.sharedPreviousDisabled = node.disabled; node.disabled = true; }
      renderToolbar();
      try {
        const result = await fn(); if (stopped || ticket !== epoch) return result;
        if (success && result !== false) message(success); return result;
      } catch (error) {
        if (!stopped && ticket === epoch) {
          try { await loadSnapshot(); } catch { /* The existing local display remains honest about the failed action. */ }
          message(error?.code === "local_read_only" ? readOnlyError().message : ERROR_LABELS[error?.code] || "Die Aktion wurde nicht bestätigt. Gespeicherte Entwürfe und deine Formulareingaben bleiben erhalten.", true);
        }
        return null;
      } finally { if (!stopped && ticket === epoch) {
        busy = false;
        for (const node of root.querySelectorAll("input, textarea, select, button")) {
          if (node.sharedPreviousDisabled !== undefined) { node.disabled = node.sharedPreviousDisabled; delete node.sharedPreviousDisabled; }
          if (node.sharedRequiresEdit && !editingAllowed()) node.disabled = true;
        }
        // A mode change can have rebuilt disabled draft fields while this
        // action was pending. Rebuild from the retained current draft only.
        renderEditor();
        renderToolbar();
      } }
    }
    function renderStatus() {
      const state = snapshot?.status || {};
      const unavailable = snapshot?.available === false;
      nodes.connection.textContent = unavailable ? snapshot.message || "Gemeinsames Projekt in der Desktop-App einrichten." : CONNECTION_LABELS[state.connection] || "Noch keine Verbindung eingerichtet";
      nodes.counts.textContent = `${state.pending || 0} lokale Änderung(en) · ${state.conflicts || 0} Konflikt(e)${state.otherProjectPending ? ` · ${state.otherProjectPending} Änderung(en) in anderen Projektbereichen` : ""}`;
      nodes.identity.textContent = state.user ? `${state.user.displayName} · ${ROLE_LABELS[state.user.role] || "Unbekannte Rolle"}${state.readOnlySession ? " · Sitzung nur lesend" : ""}${!editingAllowed() ? " · Explorer im Lesemodus" : ""}` : "";
      if (state.baseUrl && !nodes.baseUrl.value) nodes.baseUrl.value = state.baseUrl;
      nodes.loginDetails.open = !state.user || ["authentication-required", "disconnected"].includes(state.connection);
      nodes.loginDetails.hidden = unavailable;
    }
    function renderToolbar() {
      const blocked = busy || speciesReview?.busy;
      for (const { node, requiresReview } of conflictButtons) {
        node.disabled = Boolean(blocked) || requiresReview || !editingAllowed() || !snapshot?.permissions?.canEdit;
      }
      nodes.sync.disabled = !editingAllowed() || !snapshot?.permissions?.canRead || blocked;
      nodes.refresh.disabled = !snapshot?.permissions?.canRead || blocked;
      nodes.newSpecies.disabled = !permission("canCreate"); nodes.newPage.disabled = !permission("canCreate");
      nodes.disconnect.disabled = !snapshot?.permissions?.canRead || blocked; nodes.login.disabled = blocked || snapshot?.available === false;
      if (nodes.save) nodes.save.disabled = !editingAllowed() || busy || !(selected?.isNew ? snapshot?.permissions?.canCreate : snapshot?.permissions?.canEdit);
      if (nodes.approve) nodes.approve.disabled = !editingAllowed() || busy || dirty || !snapshot?.permissions?.canApprove || selected?.localPending || selected?.localConflict;
    }
    function renderList() {
      nodes.list.replaceChildren();
      const search = nodes.search.value.toLocaleLowerCase("de");
      for (const item of snapshot?.objects || []) {
        const title = item.data.commonName || item.data.title || (item.data.type === "fn-species-record" ? item.data.input?.german : "")
          || (item.data.type === "website-alt-page" ? item.data.page?.title : "") || item.id;
        if (search && !`${title} ${item.id} ${item.data.scientificName || ""}`.toLocaleLowerCase("de").includes(search)) continue;
        const choose = button(`${item.data.type === "website-alt-page" ? "Bildtexte" : item.kind === "species" ? "Art" : "Seite"} · ${title}${item.localConflict ? " · Konflikt" : item.localPending ? " · lokal geändert" : item.approval === "approved" ? " · freigegeben" : " · Entwurf"}`, () => selectObject(item));
        choose.className = "shared-project-list-item"; if (selected?.kind === item.kind && selected?.id === item.id) choose.setAttribute("aria-current", "true"); nodes.list.append(choose);
      }
      if (!nodes.list.children.length) nodes.list.append(create("p", "Noch keine passenden gemeinsamen Inhalte geladen."));
    }
    function renderPreview(parent, image) {
      const url = safeImageUrl(image.url);
      if (!url) { parent.append(create("p", "Keine zugelassene öffentliche Vorschauadresse.")); return; }
      const img = create("img"); img.src = url; img.alt = image.alt || "Bildvorschau"; img.loading = "lazy"; img.decoding = "async";
      img.referrerPolicy = "no-referrer"; img.crossOrigin = "anonymous"; parent.append(img);
      img.addEventListener("error", () => { img.hidden = true; parent.append(create("p", "Bildvorschau derzeit nicht erreichbar.")); });
    }
    function renderImages(parent, data, canEdit) {
      const media = data.media || {}, gallery = media.gallery || [];
      const section = details(parent, `Bilder und Quellen · ${gallery.length} Galeriebilder`);
      for (const key of ["portrait", "map"]) if (media[key]) {
        const card = create("article", undefined, "shared-project-image"); card.append(create("h4", key === "portrait" ? "Porträt" : "Verbreitungskarte")); renderPreview(card, media[key]);
        if (media[key].attribution) card.append(create("p", media[key].attribution, "shared-project-source")); section.append(card);
      }
      gallery.forEach((image, index) => {
        const card = create("article", undefined, "shared-project-image"); card.append(create("h4", `Galeriebild ${index + 1}`)); renderPreview(card, image);
        editField(card, "Alternativtext", image.alt || "", (value) => { image.alt = value; changed(); }, { multiline: true, maxLength: 3000, disabled: !canEdit });
        editField(card, "Sichtbare Bildunterschrift", image.caption || "", (value) => { image.caption = value; changed(); }, { multiline: true, maxLength: 3000, disabled: !canEdit });
        editField(card, "Quellen- und Lizenzhinweis", image.attribution || "", (value) => { if (value) image.attribution = value; else delete image.attribution; changed(); }, { multiline: true, maxLength: 8000, disabled: !canEdit });
        const source = details(card, "Bildadresse");
        editField(source, "Öffentliche HTTPS-Bildadresse", image.url, (value) => {
          image.url = value; delete image.bytes; delete image.sha256; delete image.mimeType; changed();
          message("Bildquelle geändert. Vorschau sowie Quellen-/Lizenzhinweis bitte vor einer Freigabe erneut prüfen.");
        }, { maxLength: 2048, disabled: !canEdit });
        if (canEdit) {
          const move = (offset) => { const other = index + offset; if (other < 0 || other >= gallery.length) return;
            [gallery[index], gallery[other]] = [gallery[other], gallery[index]]; gallery.forEach((entry, order) => { entry.order = order; }); changed(); renderEditor(); };
          card.append(editButton("Nach vorne", () => move(-1), index === 0), editButton("Nach hinten", () => move(1), index === gallery.length - 1));
        }
        section.append(card);
      });
      if (canEdit) section.append(editButton("Galeriebild ergänzen", () => {
        data.media ||= { sounds: [], gallery: [] }; data.media.gallery ||= [];
        data.media.gallery.push({ id: `image-${Date.now()}-${++counter}`, url: "", alt: "", caption: "", order: data.media.gallery.length }); changed(); renderEditor();
      }));
      for (const sound of media.sounds || []) if (sound.attribution) section.append(create("p", `Aufnahmequelle: ${sound.attribution}`, "shared-project-source"));
    }
    function imageTextLocation() {
      return create("p", "Diese Bildtexte und ihre Konflikte unter Website-Bildtexte → Seitenaktionen → Bildtexte gemeinsam abgleichen mit den Bildvorschauen prüfen.", "shared-project-note");
    }
    function speciesRecordLocation() {
      return create("p", "Diese Art unter Artbestand → Gemeinsames Projekt in der normalen Artenansicht öffnen. Dort stehen die Grunddaten entsprechend deiner Berechtigung zur Bearbeitung bereit. Vorhandene Texte und Medien bleiben erhalten.", "shared-project-note");
    }
    function renderEditor() {
      nodes.editor.replaceChildren(); nodes.save = null; nodes.approve = null;
      if (!draft || !selected) { nodes.editor.append(create("p", "Art oder Seite auswählen. Neue Inhalte werden zunächst als Entwurf angelegt.")); return; }
      if (draft.type === "website-alt-page") { nodes.editor.append(create("h3", `Bildtexte · ${draft.page?.title || selected.id}`), imageTextLocation()); return; }
      if (draft.type === "fn-species-record") {
        nodes.editor.append(create("h3", `Art · ${draft.input?.german || selected.id}`),
          create("p", `${draft.input?.genus || ""} ${draft.input?.species || ""}`.trim()), speciesRecordLocation()); return;
      }
      if (draft.type === "fn-species-page") {
        nodes.editor.append(create("h3", `Artseite · ${draft.title || selected.id}`),
          create("p", "Diese Seite im Artseiteneditor der zugehörigen Art bearbeiten.", "shared-project-note"));
        return;
      }
      const canEdit = !busy && editingAllowed() && Boolean(selected.isNew ? snapshot?.permissions?.canCreate : snapshot?.permissions?.canEdit);
      nodes.editor.append(create("h3", merge ? "Konflikt zusammenführen" : selected.isNew ? "Neuen Entwurf vorbereiten" : "Inhalt bearbeiten"));
      nodes.editor.append(create("p", selected.isNew ? "Online-Anlage · noch keine Freigabe" : `Version ${selected.ordinal || "?"} · ${selected.localPending ? "lokal gespeichert, Abgleich offen" : selected.approval === "approved" ? "intern freigegeben" : "Entwurf"}`));
      if (merge) nodes.editor.append(create("p", "Alle erhaltenen Fassungen vergleichen und den gewünschten Zielinhalt festlegen. Diese Entscheidung veröffentlicht nichts auf der Website."));
      const formGeneration = modeGeneration, formOwner = ownerKey(), formSelected = selected;
      const form = create("form"); form.addEventListener("submit", (event) => {
        event.preventDefault(); if (editingAllowed() && formGeneration === modeGeneration && formOwner === ownerKey() && formSelected === selected) saveDraft();
      });
      if (selected.isNew) editField(form, "Bestehender oder neuer Slug · Kleinbuchstaben/Ziffern", selected.id, (value) => { selected.id = value; if (selected.kind === "species") draft.id = value; changed(); }, { required: true, maxLength: 120, disabled: !canEdit });
      editField(form, selected.kind === "species" ? "Deutscher Name" : "Seitentitel", selected.kind === "species" ? draft.commonName : draft.title,
        (value) => { draft[selected.kind === "species" ? "commonName" : "title"] = value; changed(); }, { required: true, maxLength: 300, disabled: !canEdit });
      if (selected.kind === "species") editField(form, "Vollständiger wissenschaftlicher Name", draft.scientificName, (value) => { draft.scientificName = value; changed(); }, { required: true, maxLength: 300, disabled: !canEdit });
      editField(form, "Vorhandene öffentliche Seitenadresse · optional", draft.websiteUrl || "", (value) => { if (value) draft.websiteUrl = value; else delete draft.websiteUrl; changed(); }, { type: "url", maxLength: 2048, disabled: !canEdit });
      const content = create("div", undefined, "shared-project-sections"); form.append(content);
      if (selected.kind === "page" && typeof draft.text === "string") editField(content, "Seiteninhalt", draft.text, (value) => { draft.text = value; changed(); }, { multiline: true, disabled: !canEdit });
      for (const section of draft.sections || []) {
        const card = create("section"); editField(card, "Überschrift", section.title, (value) => { section.title = value; changed(); }, { required: true, maxLength: 300, disabled: !canEdit });
        let empty;
        const body = editField(card, "Fachtext", section.text, (value) => { section.text = value; if (value.trim()) { section.intentionallyEmpty = false; empty.checked = false; } changed(); }, { multiline: true, disabled: !canEdit });
        empty = checkbox(card, "Dieser Abschnitt bleibt bewusst leer", section.intentionallyEmpty, async (checked, input) => {
          if (checked && section.text.trim() && !await confirm("Abschnitt leeren?", "Soll der vorhandene Fachtext in diesem Entwurf ausdrücklich entfernt werden?")) { input.checked = false; return; }
          if (!editingAllowed()) return;
          section.intentionallyEmpty = checked; if (checked) { section.text = ""; body.value = ""; } changed();
        }, !canEdit);
        content.append(card);
      }
      if (canEdit) form.append(editButton("Fachabschnitt ergänzen", () => { draft.sections ||= []; draft.sections.push({ id: `section-${Date.now()}-${++counter}`, title: "Neuer Abschnitt", text: "", intentionallyEmpty: false }); changed(); renderEditor(); }));
      if (selected.kind === "species") {
        const taxonomy = details(form, "Systematik");
        for (const rank of draft.taxonomy || []) {
          const row = create("div"), label = create("label", "Taxonomiestufe"), select = create("select");
          for (const [key, title] of Object.entries({ kingdom: "Reich", phylum: "Stamm", class: "Klasse", order: "Ordnung", family: "Familie", genus: "Gattung", species: "Art" })) {
            const option = create("option", title); option.value = key; select.append(option);
          }
          const generation = modeGeneration, owner = ownerKey();
          select.value = rank.rank; select.disabled = !canEdit; select.sharedRequiresEdit = true; select.addEventListener("change", () => { if (!canEdit || !editingAllowed() || generation !== modeGeneration || owner !== ownerKey()) return; rank.rank = select.value; changed(); }); label.append(select); row.append(label);
          editField(row, "Taxonomischer Name", rank.name, (value) => { rank.name = value; changed(); }, { required: true, maxLength: 300, disabled: !canEdit }); taxonomy.append(row);
        }
        if (canEdit) taxonomy.append(editButton("Taxonomiestufe ergänzen", () => { draft.taxonomy ||= []; draft.taxonomy.push({ rank: "family", name: "" }); changed(); renderEditor(); }));
      }
      renderImages(form, draft, canEdit);
      nodes.save = create("button", merge ? "Zusammengeführten Zieltext bestätigen" : selected.isNew ? "Online als Entwurf anlegen" : "Entwurf lokal speichern"); nodes.save.type = "submit"; nodes.save.disabled = !canEdit || busy; form.append(nodes.save);
      if (!selected.isNew && !merge) {
        nodes.approve = editButton("Aktuelle Version intern freigeben", approveDraft, !permission("canApprove") || dirty || selected.localPending || selected.localConflict); form.append(nodes.approve);
      }
      form.append(create("p", "Interne Freigabe und Websiteübernahme sind getrennte Schritte. Hier werden keine Squarespace-Inhalte veröffentlicht.", "shared-project-note"));
      nodes.editor.append(form);
    }
    function readOnlyContent(parent, data) {
      parent.append(create("strong", data.commonName || data.title || "Erhaltene Fassung"));
      if (data.type === "fn-species-page" && data.document) {
        const page = data.document;
        parent.append(create("p", `Website-Zielbereich ${page.parentPath || ""}`));
        for (const section of page.sections || []) {
          parent.append(create("h5", section.title));
          if (section.requested === false) parent.append(create("p", "Nicht vorgesehen"));
          if (!section.blocks?.length && page.emptyConfirmations?.[section.id]) parent.append(create("p", "Bewusst leer"));
          for (const block of section.blocks || []) {
            if (Array.isArray(block.items)) {
              const list = create(block.type === "numbered-list" ? "ol" : "ul");
              for (const item of block.items) list.append(create("li", item));
              parent.append(list);
            } else if (typeof block.text === "string") parent.append(create(block.type === "heading" ? "h6" : "p", block.text, "shared-project-text"));
          }
          for (const source of section.sources || []) parent.append(create("p", source.label, "shared-project-source"));
        }
        if (page.galleryRequested === false) parent.append(create("p", "Galerie nicht vorgesehen"));
        for (const [index, image] of (page.images || []).entries()) {
          const entry = create("div"); entry.append(create("h5", `Bild ${index + 1}`),
            create("p", image.decorative ? "Bewusst dekorativ" : `Alternativtext: ${image.alt || "Keiner"}`),
            create("p", `Bildunterschrift: ${image.caption || "Keine"}`)); parent.append(entry);
        }
        for (const source of page.sources || []) parent.append(create("p", source.label, "shared-project-source"));
        return;
      }
      if (data.scientificName) parent.append(create("p", data.scientificName)); if (data.text) parent.append(create("p", data.text, "shared-project-text"));
      for (const section of data.sections || []) { parent.append(create("h5", section.title), create("p", section.text || (section.intentionallyEmpty ? "Bewusst leer" : "Noch ohne Text"), "shared-project-text")); }
      for (const image of data.media?.gallery || []) {
        const card = create("div"); renderPreview(card, image); card.append(create("p", `Alternativtext: ${image.alt || "Keiner"}`), create("p", `Bildunterschrift: ${image.caption || "Keine"}`)); parent.append(card);
      }
    }
    function renderConflicts() {
      conflictButtons.length = 0;
      function choice(label, onClick, requiresReview = false) {
        const node = editButton(label, onClick, requiresReview || !permission("canEdit"));
        conflictButtons.push({ node, requiresReview });
        return node;
      }
      nodes.conflicts.replaceChildren(); const conflicts = snapshot?.conflicts || [];
      if (!conflicts.length) return;
      nodes.conflicts.append(create("h3", `${conflicts.length} Konflikt(e) zur Entscheidung`));
      for (const conflict of conflicts) {
        const card = create("article"); card.append(create("h4", conflict.objectId));
        if ([conflict.base, conflict.current, conflict.proposed, conflict.latestServer?.data].some((data) => data?.type === "website-alt-page")) {
          card.append(imageTextLocation()); nodes.conflicts.append(card); continue;
        }
        if ([conflict.base, conflict.current, conflict.proposed, conflict.latestServer?.data].some((data) => data?.type === "fn-species-record")) {
          if (speciesReview) {
            card.append(choice("Grunddaten vergleichen", async () => { const generation = modeGeneration, owner = ownerKey();
              if (await discard() && editingAllowed() && generation === modeGeneration && owner === ownerKey()) await speciesReview.open(conflict.id); }));
          }
          else card.append(speciesRecordLocation());
          nodes.conflicts.append(card); continue;
        }
        if (conflict.changedSinceConflict || conflict.resolvedAt) card.append(create("p", "Die Serverfassung wurde inzwischen weiterbearbeitet. Der aktuelle Stand ist zusätzlich angezeigt; lokale Fassungen bleiben erhalten."));
        readOnlyContent(details(card, "Ausgangsfassung"), conflict.base);
        readOnlyContent(details(card, "Serverfassung beim Konflikt"), conflict.current);
        if (conflict.latestServer) readOnlyContent(details(card, `Aktuelle Serverversion ${conflict.latestServer.ordinal}`), conflict.latestServer.data);
        readOnlyContent(details(card, "Eigener ursprünglicher Vorschlag"), conflict.proposed);
        if ([conflict.base, conflict.current, conflict.proposed, conflict.latestServer?.data].some(data => data?.type === "fn-species-page")) {
          const reviewHash = conflict.pageReview?.hash, expectedRevision = conflict.latestServer?.revision;
          const canChoose = snapshot?.permissions?.canEdit === true && /^[a-f0-9]{64}$/.test(reviewHash || "") && typeof expectedRevision === "string";
          async function choosePage(changeId, label) {
            const generation = modeGeneration, owner = ownerKey();
            const stillShown = () => permission("canEdit") && generation === modeGeneration && owner === ownerKey() && snapshot?.conflicts?.includes(conflict);
            if (!canChoose || !stillShown() || !await discard() || !stillShown()
                || !await confirm("Artseitenkonflikt entscheiden", `${label} wird als vollständige Fassung gewählt. Die anderen Fassungen bleiben im Verlauf erhalten.`)
                || !stillShown()) return;
            await action(async () => {
              const result = await remote.resolve(conflict.id, { expectedRevision, pageChoice: { reviewHash, changeId } });
              dirty = false; merge = null; await loadSnapshot();
              message(result?.localPending ? "Seitenfassung lokal vorgemerkt. Der gemeinsame Abgleich ist noch offen."
                : "Seitenkonflikt entschieden. Die gemeinsame Fassung kann im Artseiteneditor eingelesen werden.");
            });
          }
          card.append(choice("Aktuelle Serverfassung wählen", () => choosePage(null, "Die aktuelle Serverfassung"), !canChoose));
          for (const [index, version] of (conflict.localVersions || []).entries()) {
            const label = `Lokale Fassung ${index + 1}`, body = details(card, label);
            readOnlyContent(body, version.data);
            body.append(choice(`${label} wählen`, () => choosePage(version.changeId, label), !canChoose));
          }
          if (!canChoose) card.append(create("p", "Vor der Entscheidung die Seitenfassungen über „Serverstand lesen“ erneut prüfen."));
          nodes.conflicts.append(card); continue;
        }
        for (const [index, local] of (conflict.localVersions || []).entries()) if (index > 0) readOnlyContent(details(card, `Weitere lokale Fassung ${index + 1}`), local.data);
        const expectedRevision = conflict.latestServer?.revision || conflict.currentRevision, hasFollowups = conflict.localVersions?.length > 1;
        async function choose(strategy) {
          const generation = modeGeneration, owner = ownerKey();
          if (!await discard() || !await confirm("Konflikt entscheiden", strategy === "current" ? "Soll die angezeigte aktuelle Serverfassung übernommen werden?" : "Soll der eigene angezeigte Vorschlag als Zieltext übernommen werden?")) return;
          if (!editingAllowed() || generation !== modeGeneration || owner !== ownerKey() || !snapshot?.conflicts?.includes(conflict)) return;
          await action(async () => { await remote.resolve(conflict.id, { strategy, expectedRevision }); dirty = false; merge = null; await loadSnapshot(); }, "Konfliktentscheidung gespeichert. Eine Websiteveröffentlichung ist nicht erfolgt.");
        }
        card.append(choice("Serverfassung wählen", () => choose("current"), hasFollowups), choice("Eigenen Vorschlag wählen", () => choose("proposed"), hasFollowups),
          choice("Fassungen zusammenführen", async () => {
            const generation = modeGeneration, owner = ownerKey();
            if (!await discard() || !editingAllowed() || generation !== modeGeneration || owner !== ownerKey() || !snapshot?.conflicts?.includes(conflict)) return;
            const local = conflict.localVersions?.at(-1)?.data || conflict.proposed;
            selected = { kind: conflict.kind, id: conflict.objectId, ordinal: conflict.latestServer?.ordinal, approval: "draft" }; draft = copy(local);
            merge = { id: conflict.id, expectedRevision }; dirty = true; renderEditor();
          }));
        if (hasFollowups) card.append(create("p", "Weitere lokale Fassungen sind vorhanden. Bitte den gemeinsamen Zieltext über „Zusammenführen“ festlegen."));
        nodes.conflicts.append(card);
      }
    }
    function roleSelect(parent, value, update) {
      const label = create("label", "Benutzerstufe"), select = create("select");
      const generation = modeGeneration, owner = ownerKey();
      for (const [role, title] of Object.entries(ROLE_LABELS)) { const option = create("option", title); option.value = role; select.append(option); }
      select.value = value; select.disabled = !editingAllowed(); select.sharedRequiresEdit = true; select.addEventListener("change", () => { if (editingAllowed() && generation === modeGeneration && owner === ownerKey()) update(select.value); }); label.append(select); parent.append(label); return select;
    }
    function hidePairing() {
      removePairing?.();
      removePairing = null;
    }
    function showPairing(container, invitation, displayed) {
      const { schemaVersion, code, projectId, server, expiresAt } = invitation || {};
      const timeLeft = Math.min(Date.parse(expiresAt) - Date.now(), 120000);
      if (schemaVersion !== 1 || typeof code !== "string" || !/^p1_[A-Za-z0-9_-]{43}$/.test(code)
          || projectId !== displayed.status.projectId || server !== displayed.status.baseUrl
          || !(timeLeft > 0)) throw Object.assign(new Error("Ungültige Einladung"), { code: "pairing_unavailable" });
      const qr = global.qrcode(0, "M");
      qr.addData(JSON.stringify({ kind: "arten-explorer-device-pairing", schemaVersion, server, projectId, expiresAt, code }));
      qr.make();
      const canvas = create("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "QR-Code für den lesenden Projektzugang");
      const count = qr.getModuleCount(), unit = 6, margin = 4;
      canvas.width = canvas.height = (count + margin * 2) * unit;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#000";
      for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
        if (qr.isDark(row, column)) context.fillRect((column + margin) * unit, (row + margin) * unit, unit, unit);
      }
      container.replaceChildren(create("p", "Öffne am Handy die Arten-Explorer-App und wähle „QR-Code scannen“. Die Einladung gilt zwei Minuten."),
        create("p", `Lesender Zugang · ${displayed.status.user.displayName} · ${server}`),
        canvas, button("QR-Code ausblenden", hidePairing));
      container.hidden = false;
      const timer = global.setTimeout(() => {
        hidePairing();
        message("Der QR-Code ist abgelaufen. Bei Bedarf kannst du eine neue Einladung erstellen.");
      }, timeLeft);
      removePairing = () => {
        global.clearTimeout(timer);
        canvas.width = canvas.height = 0;
        container.replaceChildren();
        container.hidden = true;
      };
    }
    function renderManagement() {
      hidePairing();
      nodes.management.replaceChildren();
      const generation = modeGeneration, displayed = snapshot;
      const current = () => editingAllowed() && generation === modeGeneration && displayed === snapshot;
      const permissions = { ...(snapshot?.permissions || {}) };
      if (!editingAllowed()) for (const key of ["canManageUsers", "canManageDevices", "canChangePassword"]) permissions[key] = false;
      if (permissions.canManageUsers) {
        const users = details(nodes.management, "Personen und Rechte"); users.append(button("Personen vom Dienst laden", () => action(async () => { await loadSnapshot(await remote.refresh({ users: true })); })));
        for (const person of snapshot.users || []) {
          const row = create("section"); row.append(create("strong", person.displayName), create("p", person.username)); let role = person.role, blocked = Boolean(person.blocked);
          roleSelect(row, role, (value) => { role = value; }); checkbox(row, "Zugang gesperrt", blocked, (value) => { blocked = value; });
          row.append(editButton("Rechteänderung bestätigen", async () => {
            if (!current()) return;
            const reviewed = { expectedVersion: person.version, role, blocked };
            if (!await confirm("Personenrechte ändern", `${person.displayName} (${person.username}) erhält die Stufe „${ROLE_LABELS[role]}“. Der Zugang ist danach ${blocked ? "gesperrt" : "aktiv"}.`)) return;
            if (!current() || reviewed.role !== role || reviewed.blocked !== blocked) {
              message("Die ausgewählten Rechte haben sich inzwischen geändert. Bitte erneut prüfen und bestätigen.", true); return;
            }
            await action(async () => { await remote.updateUser(person.id, reviewed); await loadSnapshot(); }, "Personenrechte gespeichert.");
          })); users.append(row);
        }
        const form = create("form"); let username = "", displayName = "", role = "contributor";
        form.append(create("h4", "Person ergänzen")); editField(form, "Benutzername", "", (value) => { username = value; }, { required: true, maxLength: 80 });
        editField(form, "Anzeigename", "", (value) => { displayName = value; }, { required: true, maxLength: 120 }); roleSelect(form, role, (value) => { role = value; });
        const password = editField(form, "Persönlich gewähltes erstes Passwort · mindestens 12 Zeichen", "", () => {}, { type: "password", required: true, maxLength: 256 }); password.autocomplete = "new-password";
        const submit = create("button", "Person anlegen"); submit.type = "submit"; form.append(submit);
        form.addEventListener("submit", (event) => { event.preventDefault(); if (!current()) return; const input = { username, displayName, role, password: password.value }; password.value = "";
          action(async () => { await remote.createUser(input); await loadSnapshot(); }, "Person angelegt. Zugangsdaten werden hier nicht angezeigt."); }); users.append(form);
      }
      if (permissions.canRead) {
        const devices = details(nodes.management, "Eigene Geräte"); devices.append(button("Geräte vom Dienst laden", () => action(async () => { await loadSnapshot(await remote.refresh({ devices: true })); })));
        if (permissions.canManageDevices && typeof global.qrcode === "function"
            && displayed.status.baseUrl?.startsWith("https://") && typeof remote.issueReadPairing === "function") {
          const pairing = create("section", undefined, "shared-project-pairing");
          pairing.hidden = true;
          devices.append(editButton("Handy koppeln", () => action(async () => {
            hidePairing();
            if (!current()) return false;
            const invitation = await remote.issueReadPairing({ projectId: displayed.status.projectId, userId: displayed.status.user.id });
            if (stopped || !current() || !devices.parentElement?.open) return false;
            showPairing(pairing, invitation, displayed);
            return true;
          })), pairing);
          const disclosure = devices.parentElement;
          disclosure?.addEventListener("toggle", () => { if (!disclosure.open && !pairing.hidden) hidePairing(); });
        }
        for (const device of snapshot.devices || []) {
          const row = create("p", `${device.label} · ${device.revoked ? "widerrufen" : `gültig bis ${new Date(device.expiresAt).toLocaleDateString("de-DE")}`}`);
          if (!device.revoked && permissions.canManageDevices) row.append(editButton("Gerät abmelden", async () => {
            if (!await confirm("Gerät abmelden", "Soll der gespeicherte Zugang dieses Geräts widerrufen werden?")) return;
            if (!current()) return;
            await action(async () => { await remote.revokeDevice(device.id); await loadSnapshot(); }, "Gerätezugang widerrufen.");
          })); devices.append(row);
        }
      }
      if (permissions.canChangePassword) {
        const passwordSection = details(nodes.management, "Eigenes Passwort ändern"), form = create("form");
        const old = editField(form, "Bisheriges Passwort", "", () => {}, { type: "password", required: true, maxLength: 256 }); old.autocomplete = "current-password";
        const next = editField(form, "Neues Passwort · mindestens 12 Zeichen", "", () => {}, { type: "password", required: true, maxLength: 256 }); next.autocomplete = "new-password";
        const repeated = editField(form, "Neues Passwort wiederholen", "", () => {}, { type: "password", required: true, maxLength: 256 }); repeated.autocomplete = "new-password";
        const submit = create("button", "Passwort ändern und neu anmelden"); submit.type = "submit"; form.append(submit);
        form.addEventListener("submit", (event) => {
          event.preventDefault(); if (!current()) return; if (next.value !== repeated.value || next.value.length < 12) { message("Bitte dasselbe neue Passwort mit mindestens 12 Zeichen zweimal eingeben.", true); return; }
          const input = { currentPassword: old.value, newPassword: next.value }; old.value = ""; next.value = ""; repeated.value = "";
          action(async () => { await remote.changePassword(input); await loadSnapshot(); }, "Passwort geändert. Bitte erneut anmelden.");
        }); passwordSection.append(form);
      }
    }
    async function loadSnapshot(value) {
      const ticket = epoch, received = value || await remote.snapshot(); if (stopped || ticket !== epoch) return;
      if (draft && dirty && (!received.permissions.canEdit || identityKey(received) !== identityKey())) {
        suspended = { selected: copy(selected), draft: copy(draft), editRevision, merge: merge ? copy(merge) : null,
          owner: identityKey() };
        dirty = false; merge = null; draft = null; selected = null;
      }
      snapshot = received;
      speciesReview?.setProjectState(snapshot);
      const owner = identityKey();
      if (suspended && suspended.owner === owner && snapshot.permissions.canEdit) {
        ({ selected, draft, editRevision, merge } = suspended); dirty = true; suspended = null;
      }
      if (selected && !selected.isNew && !dirty && !merge) {
        const current = snapshot.objects.find((item) => item.kind === selected.kind && item.id === selected.id);
        if (current) { selected = current; draft = copy(current.data); editRevision = current.editRevision; } else { selected = null; draft = null; }
      }
      renderStatus(); renderList(); renderConflicts(); renderManagement(); renderEditor(); renderToolbar();
      onProjectState({ status: snapshot.status, permissions: snapshot.permissions });
    }
    async function selectObject(item) {
      const generation = modeGeneration, owner = ownerKey();
      if (busy || !await discard() || generation !== modeGeneration || owner !== ownerKey()) return;
      if (!snapshot?.objects?.some((current) => current.kind === item.kind && current.id === item.id && current.revision === item.revision)) return;
      selected = item; draft = copy(item.data); editRevision = item.editRevision; dirty = false; merge = null; renderList(); renderEditor(); renderToolbar();
    }
    async function newDraft(kind) {
      const generation = modeGeneration, owner = ownerKey();
      if (!permission("canCreate") || !await discard() || generation !== modeGeneration || owner !== ownerKey() || !permission("canCreate")) return;
      selected = { kind, id: "", isNew: true }; draft = kind === "species" ? { id: "", scientificName: "", commonName: "", taxonomy: [], sections: [], media: { sounds: [], gallery: [] } }
        : { title: "", sections: [], media: { gallery: [] } };
      merge = null; dirty = true; renderEditor();
    }
    async function saveDraft() {
      if (!selected || busy || !permission(selected.isNew ? "canCreate" : "canEdit") || ["website-alt-page", "fn-species-record", "fn-species-page"].includes(draft?.type)) return;
      const target = { ...selected }, data = copy(draft), revision = editRevision, resolution = merge ? { ...merge } : null;
      const generation = modeGeneration, owner = ownerKey(), shown = selected, shownDraft = JSON.stringify(draft), edits = draftGeneration;
      const currentSave = () => !stopped && editingAllowed() && generation === modeGeneration && owner === ownerKey()
        && selected === shown && editRevision === revision && draftGeneration === edits && JSON.stringify(draft) === shownDraft;
      const preserveCurrentDraft = () => {
        if (!stopped) message("Die Antwort gehört zu einem früheren Speicherschritt. Deine aktuelle Eingabe bleibt erhalten; bitte den gespeicherten Stand vor dem nächsten Speichern neu prüfen.");
        return false;
      };
      if (resolution && !await confirm("Zusammengeführten Zieltext bestätigen", "Soll diese Fassung den Konflikt ausdrücklich entscheiden? Es erfolgt keine Websiteveröffentlichung.")) return;
      if (!currentSave()) return;
      await action(async () => {
        let result;
        if (resolution) result = await remote.resolve(resolution.id, { strategy: "merged", data, expectedRevision: resolution.expectedRevision });
        else if (target.isNew) result = await remote.create({ kind: target.kind, id: target.id, data });
        else result = await remote.editExisting(target.kind, target.id, { data, expectedEditRevision: revision });
        if (!currentSave()) return preserveCurrentDraft();
        const fresh = await remote.snapshot();
        if (!currentSave() || ownerKey(fresh) !== owner) return preserveCurrentDraft();
        dirty = false; merge = null; selected = result; draft = copy(result.data); editRevision = result.editRevision || ""; await loadSnapshot(fresh);
      }, resolution ? "Konfliktentscheidung gespeichert. Websiteübernahme bleibt ein eigener Schritt." : target.isNew ? "Online als Entwurf angelegt. Noch nicht freigegeben." : "Entwurf lokal gespeichert. „Abgleichen“ sendet ihn an den gemeinsamen Dienst.");
    }
    async function approveDraft() {
      if (!selected || ["website-alt-page", "fn-species-record", "fn-species-page"].includes(draft?.type) || dirty || !permission("canApprove") || selected.localPending || selected.localConflict) return;
      const shown = selected, target = { kind: selected.kind, id: selected.id, revision: selected.revision }, generation = modeGeneration, owner = ownerKey();
      if (!await confirm("Aktuelle Version intern freigeben", "Soll die angezeigte bestätigte Fassung für Projektleser freigegeben werden? Eine Übernahme in Squarespace ist damit nicht verbunden.")) return;
      if (!permission("canApprove") || generation !== modeGeneration || owner !== ownerKey() || selected !== shown || selected.revision !== target.revision) return;
      if (dirty) { message("Die Formulareingaben wurden geändert. Bitte zuerst speichern und abgleichen.", true); return; }
      await action(async () => { await remote.approve(target.kind, target.id, { expectedRevision: target.revision }); await loadSnapshot(); }, "Intern freigegeben. Eine Websiteveröffentlichung ist nicht erfolgt.");
    }
    root.classList?.add("shared-project"); root.replaceChildren();
    root.append(create("h2", "Gemeinsames Projekt"));
    nodes.connection = create("p"); nodes.identity = create("p"); nodes.counts = create("p"); nodes.message = create("p"); nodes.message.setAttribute("role", "status"); nodes.message.setAttribute("aria-live", "polite");
    root.append(nodes.connection, nodes.identity, nodes.counts, nodes.message);
    nodes.loginDetails = create("details"); nodes.loginDetails.open = true; nodes.loginDetails.append(create("summary", "Mit dem Projektdienst verbinden"));
    const loginForm = create("form"); nodes.baseUrl = field(loginForm, "Dienstadresse · HTTPS", "", () => {}, { type: "url", required: true, maxLength: 2048 });
    nodes.username = field(loginForm, "Persönlicher Benutzername", "", () => {}, { required: true, maxLength: 80 }); nodes.username.autocomplete = "username";
    nodes.password = field(loginForm, "Passwort", "", () => {}, { type: "password", required: true, maxLength: 256 }); nodes.password.autocomplete = "current-password";
    nodes.login = create("button", "Verbinden"); nodes.login.type = "submit"; loginForm.append(nodes.login); nodes.loginDetails.append(loginForm); root.append(nodes.loginDetails);
    loginForm.addEventListener("submit", (event) => {
      if (snapshot?.available === false) { event.preventDefault(); nodes.password.value = ""; return; }
      event.preventDefault(); const input = { baseUrl: nodes.baseUrl.value, username: nodes.username.value, password: nodes.password.value }; nodes.password.value = "";
      action(async () => { if (!await discard()) return false; dirty = false; selected = null; draft = null; await loadSnapshot(await remote.connect(input)); }, "Mit dem gemeinsamen Projekt verbunden.");
    });
    const toolbar = create("div", undefined, "shared-project-toolbar");
    nodes.sync = editButton("Lokale Änderungen abgleichen", () => action(async () => {
      const result = await remote.sync(); await loadSnapshot(result);
      if (result?.pageAuthoringReconciliation?.checked === false || result?.websiteAltReconciliation?.checked === false) {
        message("Projektabgleich bestätigt. Offene Website-Entwürfe und Bildtexte bitte in ihrer jeweiligen Ansicht prüfen."); return false;
      }
    }, "Abgleich abgeschlossen. Offene Konflikte sind zur Entscheidung erhalten."), false, false);
    nodes.refresh = button("Serverstand lesen", () => action(async () => { await loadSnapshot(await remote.refresh({})); }, "Serverstand geladen. Ungesendete lokale Entwürfe bleiben erhalten."));
    nodes.newSpecies = button("Neue Art vorbereiten", () => newDraft("species")); nodes.newPage = button("Neue Seite vorbereiten", () => newDraft("page"));
    nodes.disconnect = button("Abmelden", async () => { if (!await discard()) return; await action(async () => { dirty = false; selected = null; draft = null; await loadSnapshot(await remote.disconnect()); }, "Lokal abgemeldet. Gespeicherte Entwürfe bleiben im persönlichen Cache."); });
    toolbar.append(nodes.sync, nodes.refresh, nodes.newSpecies, nodes.newPage, nodes.disconnect); root.append(toolbar);
    const workspace = create("div", undefined, "shared-project-workspace"), navigation = create("nav"); navigation.setAttribute("aria-label", "Gemeinsame Arten und Seiten");
    nodes.search = field(navigation, "Art oder Seite suchen", "", renderList, { type: "search", maxLength: 300 }); nodes.list = create("div"); navigation.append(nodes.list);
    nodes.editor = create("section"); workspace.append(navigation, nodes.editor); nodes.conflicts = create("section", undefined, "shared-project-conflicts"); nodes.speciesReview = create("section"); nodes.management = create("section"); root.append(workspace, nodes.conflicts, nodes.speciesReview, nodes.management);
    if (global.SpeciesExplorerSpeciesConflicts?.createSpeciesConflictReview && typeof fetchJson === "function") {
      speciesReview = global.SpeciesExplorerSpeciesConflicts.createSpeciesConflictReview({ root: nodes.speciesReview,
        fetchJson: (url, options) => { if (options?.method && options.method !== "GET" && !editingAllowed()) throw readOnlyError(); return fetchJson(url, options); },
        getContext: () => [modeGeneration, Boolean(editingAllowed())],
        canEdit: editingAllowed,
        confirmAction: (options) => confirm(options.title, options.message), documentRef: documentImpl,
        onDirtyChange: () => renderToolbar(), onResolved: () => loadSnapshot() });
    }
    renderStatus(); renderList(); renderEditor(); renderToolbar();
    function editingModeChanged() {
      const current = Boolean(editingAllowed()); if (current === lastEditingMode) return;
      lastEditingMode = current; modeGeneration++;
      if (snapshot) speciesReview?.setProjectState(snapshot);
      renderStatus(); renderEditor(); renderConflicts(); renderManagement(); renderToolbar();
    }
    return { open: () => action(() => loadSnapshot()), refresh: () => action(() => loadSnapshot()), editingModeChanged,
      select: (kind, id) => { const item = snapshot?.objects.find((entry) => entry.kind === kind && entry.id === id); return item ? selectObject(item) : null; },
      beforeClose: discard, hidePairing, hasUnsavedChanges: () => dirty || Boolean(suspended) || Boolean(speciesReview?.hasUnsavedChanges()),
      getState: () => ({ busy: busy || Boolean(speciesReview?.busy), dirty: dirty || Boolean(speciesReview?.hasUnsavedChanges()), selected: selected ? { kind: selected.kind, id: selected.id } : null, merging: Boolean(merge), stopped }),
      destroy() { stopped = true; epoch++; hidePairing(); speciesReview?.destroy(); nodes.password.value = ""; suspended = null; draft = null; merge = null; }, safeImageUrl };
  }
  global.SpeciesExplorerSharedProject = Object.freeze({ setupSharedProject, createSharedProjectController, createSharedProjectApi, safeImageUrl, ROLE_LABELS, CONNECTION_LABELS });
})(window);
