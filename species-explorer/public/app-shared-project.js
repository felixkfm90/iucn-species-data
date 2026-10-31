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
    object_exists: "Diese Art oder Seite besteht bereits. Bitte den Serverstand laden.", followup_decision_required: "Weitere lokale Fassungen sind erhalten. Bitte einen gemeinsamen Zieltext festlegen.",
    password_not_changed: "Das bisherige Passwort oder die Anmeldung muss erneut geprüft werden.", login_throttled: "Zu viele Anmeldeversuche. Bitte später erneut versuchen.",
    unsafe_server: "Bitte eine gültige HTTPS-Adresse des gemeinsamen Dienstes eingeben.", redirect_rejected: "Eine Weiterleitung wurde aus Sicherheitsgründen abgewiesen.",
    credential_store_unavailable: "Die geschützte Anmeldung konnte nicht gespeichert werden. Die Verbindung wurde nicht übernommen." });
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
      revokeDevice: (id) => send(`/devices/${encodeURIComponent(id)}/revoke`), changePassword: (data) => send("/password", data) };
  }

  function setupSharedProject({ fetchJson, confirmAction, createDialogController, canEdit,
    documentImpl = global.document } = {}) {
    const controller = createSharedProjectController({
      elements: { sharedProjectRoot: documentImpl.querySelector("#shared-project-root") },
      fetchJson, confirmAction, documentImpl,
    });
    const dialog = createDialogController({ dialog: documentImpl.querySelector("#shared-project-dialog"),
      closeButtons: [documentImpl.querySelector("#shared-project-close")],
      beforeClose: () => controller.getState().busy ? false : undefined,
    });
    const importer = global.SpeciesExplorerSharedImport.createInitialProjectImportController({
      root: documentImpl.querySelector("#shared-project-import-root"), fetchJson, confirmAction,
      hasUnsavedChanges: () => controller.hasUnsavedChanges(), refreshProject: () => controller.refresh(),
      documentRef: documentImpl,
    });
    documentImpl.querySelector("#shared-project-open").addEventListener("click", () => {
      if (!canEdit()) return;
      if (dialog.open()) void (async () => { await controller.open(); await importer.refresh(); })().catch(() => {});
    });
    global.addEventListener("pagehide", () => { importer.destroy(); controller.destroy(); }, { once: true });
    return { controller, importer };
  }

  function createSharedProjectController({ elements, api, fetchJson, setStatus = () => {}, confirmAction,
    documentImpl = global.document } = {}) {
    const root = elements?.sharedProjectRoot || elements?.root;
    if (!root || !documentImpl?.createElement || !api && typeof fetchJson !== "function") throw new TypeError("Gemeinsames Projekt benötigt einen Bereich und die lokale Explorer-API.");
    const remote = api || createSharedProjectApi(fetchJson);
    let snapshot = null, selected = null, draft = null, editRevision = "", dirty = false, busy = false, stopped = false, epoch = 0, counter = 0, merge = null, suspended = null, confirming = false;
    const nodes = {};
    const create = (tag, text, className) => { const node = documentImpl.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; };
    function button(text, action, disabled = false) { const node = create("button", text); node.type = "button"; node.disabled = disabled; node.addEventListener("click", action); return node; }
    function field(parent, title, value, update, { multiline = false, type = "text", required = false, maxLength = 100000, disabled = false } = {}) {
      const label = create("label", title), input = create(multiline ? "textarea" : "input");
      if (!multiline) input.type = type; else input.rows = 4;
      input.value = value ?? ""; input.required = required; input.maxLength = maxLength; input.disabled = disabled;
      input.addEventListener("input", () => update(input.value)); label.append(input); parent.append(label); return input;
    }
    function checkbox(parent, title, checked, update, disabled = false) {
      const label = create("label", undefined, "shared-project-check"), input = create("input"); input.type = "checkbox"; input.checked = checked; input.disabled = disabled;
      input.addEventListener("change", () => update(input.checked, input)); label.append(input, create("span", title)); parent.append(label); return input;
    }
    function details(parent, title) { const node = create("details"), content = create("div"); node.append(create("summary", title), content); parent.append(node); return content; }
    function message(text, error = false) {
      nodes.message.textContent = text; nodes.message.className = `shared-project-message${error ? " error" : ""}`;
      nodes.message.hidden = !text; setStatus(text, error ? "error" : "info");
    }
    async function confirm(title, text) {
      if (confirming) return false;
      confirming = true;
      try {
        if (confirmAction) return Boolean(await confirmAction({ title, message: text, confirmLabel: "Bestätigen" }));
        return Boolean(global.confirm?.(`${title}\n\n${text}`));
      } finally { confirming = false; }
    }
    async function discard() {
      if (!dirty && !suspended) return true;
      if (!await confirm("Ungespeicherte Eingaben", "Sollen die Eingaben im Formular verworfen werden? Gespeicherte lokale Entwürfe bleiben erhalten.")) return false;
      suspended = null;
      return true;
    }
    function changed() { dirty = true; if (nodes.save) nodes.save.disabled = busy || !snapshot?.permissions?.canEdit && !selected?.isNew; if (nodes.approve) nodes.approve.disabled = true; }
    function permission(key) { return !busy && Boolean(snapshot?.permissions?.[key]); }
    async function action(fn, success) {
      if (busy || stopped) return null;
      busy = true; const ticket = epoch;
      for (const node of root.querySelectorAll("input, textarea, select, button")) { node.sharedPreviousDisabled = node.disabled; node.disabled = true; }
      renderToolbar();
      try {
        const result = await fn(); if (stopped || ticket !== epoch) return result;
        if (success && result !== false) message(success); return result;
      } catch (error) {
        if (!stopped && ticket === epoch) {
          try { await loadSnapshot(); } catch { /* The existing local display remains honest about the failed action. */ }
          message(ERROR_LABELS[error?.code] || "Die Aktion wurde nicht bestätigt. Gespeicherte Entwürfe und deine Formulareingaben bleiben erhalten.", true);
        }
        return null;
      } finally { if (!stopped && ticket === epoch) {
        busy = false;
        for (const node of root.querySelectorAll("input, textarea, select, button")) if (node.sharedPreviousDisabled !== undefined) { node.disabled = node.sharedPreviousDisabled; delete node.sharedPreviousDisabled; }
        renderToolbar();
      } }
    }
    function renderStatus() {
      const state = snapshot?.status || {};
      const unavailable = snapshot?.available === false;
      nodes.connection.textContent = unavailable ? snapshot.message || "Gemeinsames Projekt in der Desktop-App einrichten." : CONNECTION_LABELS[state.connection] || "Noch keine Verbindung eingerichtet";
      nodes.counts.textContent = `${state.pending || 0} lokale Änderung(en) · ${state.conflicts || 0} Konflikt(e)${state.otherProjectPending ? ` · ${state.otherProjectPending} Änderung(en) in anderen Projektbereichen` : ""}`;
      nodes.identity.textContent = state.user ? `${state.user.displayName} · ${ROLE_LABELS[state.user.role] || "Unbekannte Rolle"}${state.readOnlySession ? " · Sitzung nur lesend" : ""}` : "";
      if (state.baseUrl && !nodes.baseUrl.value) nodes.baseUrl.value = state.baseUrl;
      nodes.loginDetails.open = !state.user || ["authentication-required", "disconnected"].includes(state.connection);
      nodes.loginDetails.hidden = unavailable;
    }
    function renderToolbar() {
      nodes.sync.disabled = !snapshot?.permissions?.canRead || busy;
      nodes.refresh.disabled = !snapshot?.permissions?.canRead || busy;
      nodes.newSpecies.disabled = !permission("canCreate"); nodes.newPage.disabled = !permission("canCreate");
      nodes.disconnect.disabled = !snapshot?.permissions?.canRead || busy; nodes.login.disabled = busy || snapshot?.available === false;
      if (nodes.save) nodes.save.disabled = busy || !(selected?.isNew ? snapshot?.permissions?.canCreate : snapshot?.permissions?.canEdit);
      if (nodes.approve) nodes.approve.disabled = busy || dirty || !snapshot?.permissions?.canApprove || selected?.localPending || selected?.localConflict;
    }
    function renderList() {
      nodes.list.replaceChildren();
      const search = nodes.search.value.toLocaleLowerCase("de");
      for (const item of snapshot?.objects || []) {
        const title = item.data.commonName || item.data.title || item.id;
        if (search && !`${title} ${item.id} ${item.data.scientificName || ""}`.toLocaleLowerCase("de").includes(search)) continue;
        const choose = button(`${item.kind === "species" ? "Art" : "Seite"} · ${title}${item.localConflict ? " · Konflikt" : item.localPending ? " · lokal geändert" : item.approval === "approved" ? " · freigegeben" : " · Entwurf"}`, () => selectObject(item));
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
        field(card, "Alternativtext", image.alt || "", (value) => { image.alt = value; changed(); }, { multiline: true, maxLength: 3000, disabled: !canEdit });
        field(card, "Sichtbare Bildunterschrift", image.caption || "", (value) => { image.caption = value; changed(); }, { multiline: true, maxLength: 3000, disabled: !canEdit });
        field(card, "Quellen- und Lizenzhinweis", image.attribution || "", (value) => { if (value) image.attribution = value; else delete image.attribution; changed(); }, { multiline: true, maxLength: 8000, disabled: !canEdit });
        const source = details(card, "Bildadresse");
        field(source, "Öffentliche HTTPS-Bildadresse", image.url, (value) => {
          image.url = value; delete image.bytes; delete image.sha256; delete image.mimeType; changed();
          message("Bildquelle geändert. Vorschau sowie Quellen-/Lizenzhinweis bitte vor einer Freigabe erneut prüfen.");
        }, { maxLength: 2048, disabled: !canEdit });
        if (canEdit) {
          const move = (offset) => { const other = index + offset; if (other < 0 || other >= gallery.length) return;
            [gallery[index], gallery[other]] = [gallery[other], gallery[index]]; gallery.forEach((entry, order) => { entry.order = order; }); changed(); renderEditor(); };
          card.append(button("Nach vorne", () => move(-1), index === 0), button("Nach hinten", () => move(1), index === gallery.length - 1));
        }
        section.append(card);
      });
      if (canEdit) section.append(button("Galeriebild ergänzen", () => {
        data.media ||= { sounds: [], gallery: [] }; data.media.gallery ||= [];
        data.media.gallery.push({ id: `image-${Date.now()}-${++counter}`, url: "", alt: "", caption: "", order: data.media.gallery.length }); changed(); renderEditor();
      }));
      for (const sound of media.sounds || []) if (sound.attribution) section.append(create("p", `Aufnahmequelle: ${sound.attribution}`, "shared-project-source"));
    }
    function renderEditor() {
      nodes.editor.replaceChildren(); nodes.save = null; nodes.approve = null;
      if (!draft || !selected) { nodes.editor.append(create("p", "Art oder Seite auswählen. Neue Inhalte werden zunächst als Entwurf angelegt.")); return; }
      const canEdit = Boolean(selected.isNew ? snapshot?.permissions?.canCreate : snapshot?.permissions?.canEdit);
      nodes.editor.append(create("h3", merge ? "Konflikt zusammenführen" : selected.isNew ? "Neuen Entwurf vorbereiten" : "Inhalt bearbeiten"));
      nodes.editor.append(create("p", selected.isNew ? "Online-Anlage · noch keine Freigabe" : `Version ${selected.ordinal || "?"} · ${selected.localPending ? "lokal gespeichert, Abgleich offen" : selected.approval === "approved" ? "intern freigegeben" : "Entwurf"}`));
      if (merge) nodes.editor.append(create("p", "Alle erhaltenen Fassungen vergleichen und den gewünschten Zielinhalt festlegen. Diese Entscheidung veröffentlicht nichts auf der Website."));
      const form = create("form"); form.addEventListener("submit", (event) => { event.preventDefault(); saveDraft(); });
      if (selected.isNew) field(form, "Bestehender oder neuer Slug · Kleinbuchstaben/Ziffern", selected.id, (value) => { selected.id = value; if (selected.kind === "species") draft.id = value; changed(); }, { required: true, maxLength: 120, disabled: !canEdit });
      field(form, selected.kind === "species" ? "Deutscher Name" : "Seitentitel", selected.kind === "species" ? draft.commonName : draft.title,
        (value) => { draft[selected.kind === "species" ? "commonName" : "title"] = value; changed(); }, { required: true, maxLength: 300, disabled: !canEdit });
      if (selected.kind === "species") field(form, "Vollständiger wissenschaftlicher Name", draft.scientificName, (value) => { draft.scientificName = value; changed(); }, { required: true, maxLength: 300, disabled: !canEdit });
      field(form, "Vorhandene öffentliche Seitenadresse · optional", draft.websiteUrl || "", (value) => { if (value) draft.websiteUrl = value; else delete draft.websiteUrl; changed(); }, { type: "url", maxLength: 2048, disabled: !canEdit });
      const content = create("div", undefined, "shared-project-sections"); form.append(content);
      if (selected.kind === "page" && typeof draft.text === "string") field(content, "Seiteninhalt", draft.text, (value) => { draft.text = value; changed(); }, { multiline: true, disabled: !canEdit });
      for (const section of draft.sections || []) {
        const card = create("section"); field(card, "Überschrift", section.title, (value) => { section.title = value; changed(); }, { required: true, maxLength: 300, disabled: !canEdit });
        let empty;
        const body = field(card, "Fachtext", section.text, (value) => { section.text = value; if (value.trim()) { section.intentionallyEmpty = false; empty.checked = false; } changed(); }, { multiline: true, disabled: !canEdit });
        empty = checkbox(card, "Dieser Abschnitt bleibt bewusst leer", section.intentionallyEmpty, async (checked, input) => {
          if (checked && section.text.trim() && !await confirm("Abschnitt leeren?", "Soll der vorhandene Fachtext in diesem Entwurf ausdrücklich entfernt werden?")) { input.checked = false; return; }
          section.intentionallyEmpty = checked; if (checked) { section.text = ""; body.value = ""; } changed();
        }, !canEdit);
        content.append(card);
      }
      if (canEdit) form.append(button("Fachabschnitt ergänzen", () => { draft.sections ||= []; draft.sections.push({ id: `section-${Date.now()}-${++counter}`, title: "Neuer Abschnitt", text: "", intentionallyEmpty: false }); changed(); renderEditor(); }));
      if (selected.kind === "species") {
        const taxonomy = details(form, "Systematik");
        for (const rank of draft.taxonomy || []) {
          const row = create("div"), label = create("label", "Taxonomiestufe"), select = create("select");
          for (const [key, title] of Object.entries({ kingdom: "Reich", phylum: "Stamm", class: "Klasse", order: "Ordnung", family: "Familie", genus: "Gattung", species: "Art" })) {
            const option = create("option", title); option.value = key; select.append(option);
          }
          select.value = rank.rank; select.disabled = !canEdit; select.addEventListener("change", () => { rank.rank = select.value; changed(); }); label.append(select); row.append(label);
          field(row, "Taxonomischer Name", rank.name, (value) => { rank.name = value; changed(); }, { required: true, maxLength: 300, disabled: !canEdit }); taxonomy.append(row);
        }
        if (canEdit) taxonomy.append(button("Taxonomiestufe ergänzen", () => { draft.taxonomy ||= []; draft.taxonomy.push({ rank: "family", name: "" }); changed(); renderEditor(); }));
      }
      renderImages(form, draft, canEdit);
      nodes.save = create("button", merge ? "Zusammengeführten Zieltext bestätigen" : selected.isNew ? "Online als Entwurf anlegen" : "Entwurf lokal speichern"); nodes.save.type = "submit"; nodes.save.disabled = !canEdit || busy; form.append(nodes.save);
      if (!selected.isNew && !merge) {
        nodes.approve = button("Aktuelle Version intern freigeben", approveDraft, !permission("canApprove") || dirty || selected.localPending || selected.localConflict); form.append(nodes.approve);
      }
      form.append(create("p", "Interne Freigabe und Websiteübernahme sind getrennte Schritte. Hier werden keine Squarespace-Inhalte veröffentlicht.", "shared-project-note"));
      nodes.editor.append(form);
    }
    function readOnlyContent(parent, data) {
      parent.append(create("strong", data.commonName || data.title || "Erhaltene Fassung"));
      if (data.scientificName) parent.append(create("p", data.scientificName)); if (data.text) parent.append(create("p", data.text, "shared-project-text"));
      for (const section of data.sections || []) { parent.append(create("h5", section.title), create("p", section.text || (section.intentionallyEmpty ? "Bewusst leer" : "Noch ohne Text"), "shared-project-text")); }
      for (const image of data.media?.gallery || []) {
        const card = create("div"); renderPreview(card, image); card.append(create("p", `Alternativtext: ${image.alt || "Keiner"}`), create("p", `Bildunterschrift: ${image.caption || "Keine"}`)); parent.append(card);
      }
    }
    function renderConflicts() {
      nodes.conflicts.replaceChildren(); const conflicts = snapshot?.conflicts || [];
      if (!conflicts.length) return;
      nodes.conflicts.append(create("h3", `${conflicts.length} Konflikt(e) zur Entscheidung`));
      for (const conflict of conflicts) {
        const card = create("article"); card.append(create("h4", conflict.objectId));
        if (conflict.changedSinceConflict || conflict.resolvedAt) card.append(create("p", "Die Serverfassung wurde inzwischen weiterbearbeitet. Der aktuelle Stand ist zusätzlich angezeigt; lokale Fassungen bleiben erhalten."));
        readOnlyContent(details(card, "Ausgangsfassung"), conflict.base);
        readOnlyContent(details(card, "Serverfassung beim Konflikt"), conflict.current);
        if (conflict.latestServer) readOnlyContent(details(card, `Aktuelle Serverversion ${conflict.latestServer.ordinal}`), conflict.latestServer.data);
        readOnlyContent(details(card, "Eigener ursprünglicher Vorschlag"), conflict.proposed);
        for (const [index, local] of (conflict.localVersions || []).entries()) if (index > 0) readOnlyContent(details(card, `Weitere lokale Fassung ${index + 1}`), local.data);
        const expectedRevision = conflict.latestServer?.revision || conflict.currentRevision, hasFollowups = conflict.localVersions?.length > 1;
        async function choose(strategy) {
          if (!await discard() || !await confirm("Konflikt entscheiden", strategy === "current" ? "Soll die angezeigte aktuelle Serverfassung übernommen werden?" : "Soll der eigene angezeigte Vorschlag als Zieltext übernommen werden?")) return;
          await action(async () => { await remote.resolve(conflict.id, { strategy, expectedRevision }); dirty = false; merge = null; await loadSnapshot(); }, "Konfliktentscheidung gespeichert. Eine Websiteveröffentlichung ist nicht erfolgt.");
        }
        card.append(button("Serverfassung wählen", () => choose("current"), busy || hasFollowups), button("Eigenen Vorschlag wählen", () => choose("proposed"), busy || hasFollowups),
          button("Fassungen zusammenführen", async () => {
            if (!await discard()) return;
            const local = conflict.localVersions?.at(-1)?.data || conflict.proposed;
            selected = { kind: conflict.kind, id: conflict.objectId, ordinal: conflict.latestServer?.ordinal, approval: "draft" }; draft = copy(local);
            merge = { id: conflict.id, expectedRevision }; dirty = true; renderEditor();
          }, busy));
        if (hasFollowups) card.append(create("p", "Weitere lokale Fassungen sind vorhanden. Bitte den gemeinsamen Zieltext über „Zusammenführen“ festlegen."));
        nodes.conflicts.append(card);
      }
    }
    function roleSelect(parent, value, update) {
      const label = create("label", "Benutzerstufe"), select = create("select");
      for (const [role, title] of Object.entries(ROLE_LABELS)) { const option = create("option", title); option.value = role; select.append(option); }
      select.value = value; select.addEventListener("change", () => update(select.value)); label.append(select); parent.append(label); return select;
    }
    function renderManagement() {
      nodes.management.replaceChildren();
      const permissions = snapshot?.permissions || {};
      if (permissions.canManageUsers) {
        const users = details(nodes.management, "Personen und Rechte"); users.append(button("Personen vom Dienst laden", () => action(async () => { await loadSnapshot(await remote.refresh({ users: true })); })));
        for (const person of snapshot.users || []) {
          const row = create("section"); row.append(create("strong", person.displayName), create("p", person.username)); let role = person.role, blocked = person.blocked;
          roleSelect(row, role, (value) => { role = value; }); checkbox(row, "Zugang gesperrt", blocked, (value) => { blocked = value; });
          row.append(button("Rechteänderung bestätigen", async () => {
            if (!await confirm("Personenrechte ändern", "Soll diese Benutzerstufe beziehungsweise Sperrung jetzt auf dem Dienst geändert werden?")) return;
            await action(async () => { await remote.updateUser(person.id, { expectedVersion: person.version, role, blocked }); await loadSnapshot(); }, "Personenrechte gespeichert.");
          })); users.append(row);
        }
        const form = create("form"); let username = "", displayName = "", role = "contributor";
        form.append(create("h4", "Person ergänzen")); field(form, "Benutzername", "", (value) => { username = value; }, { required: true, maxLength: 80 });
        field(form, "Anzeigename", "", (value) => { displayName = value; }, { required: true, maxLength: 120 }); roleSelect(form, role, (value) => { role = value; });
        const password = field(form, "Persönlich gewähltes erstes Passwort · mindestens 12 Zeichen", "", () => {}, { type: "password", required: true, maxLength: 256 }); password.autocomplete = "new-password";
        const submit = create("button", "Person anlegen"); submit.type = "submit"; form.append(submit);
        form.addEventListener("submit", (event) => { event.preventDefault(); const input = { username, displayName, role, password: password.value }; password.value = "";
          action(async () => { await remote.createUser(input); await loadSnapshot(); }, "Person angelegt. Zugangsdaten werden hier nicht angezeigt."); }); users.append(form);
      }
      if (permissions.canRead) {
        const devices = details(nodes.management, "Eigene Geräte"); devices.append(button("Geräte vom Dienst laden", () => action(async () => { await loadSnapshot(await remote.refresh({ devices: true })); })));
        for (const device of snapshot.devices || []) {
          const row = create("p", `${device.label} · ${device.revoked ? "widerrufen" : `gültig bis ${new Date(device.expiresAt).toLocaleDateString("de-DE")}`}`);
          if (!device.revoked && permissions.canManageDevices) row.append(button("Gerät abmelden", async () => {
            if (!await confirm("Gerät abmelden", "Soll der gespeicherte Zugang dieses Geräts widerrufen werden?")) return;
            await action(async () => { await remote.revokeDevice(device.id); await loadSnapshot(); }, "Gerätezugang widerrufen.");
          })); devices.append(row);
        }
      }
      if (permissions.canChangePassword) {
        const passwordSection = details(nodes.management, "Eigenes Passwort ändern"), form = create("form");
        const old = field(form, "Bisheriges Passwort", "", () => {}, { type: "password", required: true, maxLength: 256 }); old.autocomplete = "current-password";
        const next = field(form, "Neues Passwort · mindestens 12 Zeichen", "", () => {}, { type: "password", required: true, maxLength: 256 }); next.autocomplete = "new-password";
        const repeated = field(form, "Neues Passwort wiederholen", "", () => {}, { type: "password", required: true, maxLength: 256 }); repeated.autocomplete = "new-password";
        const submit = create("button", "Passwort ändern und neu anmelden"); submit.type = "submit"; form.append(submit);
        form.addEventListener("submit", (event) => {
          event.preventDefault(); if (next.value !== repeated.value || next.value.length < 12) { message("Bitte dasselbe neue Passwort mit mindestens 12 Zeichen zweimal eingeben.", true); return; }
          const input = { currentPassword: old.value, newPassword: next.value }; old.value = ""; next.value = ""; repeated.value = "";
          action(async () => { await remote.changePassword(input); await loadSnapshot(); }, "Passwort geändert. Bitte erneut anmelden.");
        }); passwordSection.append(form);
      }
    }
    async function loadSnapshot(value) {
      const ticket = epoch, received = value || await remote.snapshot(); if (stopped || ticket !== epoch) return;
      if (!received.permissions.canEdit && draft && dirty) {
        suspended = { selected: copy(selected), draft: copy(draft), editRevision, merge: merge ? copy(merge) : null,
          owner: `${snapshot?.status.projectId}/${snapshot?.status.user?.id}` };
        dirty = false; merge = null; draft = null; selected = null;
      }
      snapshot = received;
      const owner = `${snapshot.status.projectId}/${snapshot.status.user?.id}`;
      if (suspended && suspended.owner === owner && snapshot.permissions.canEdit) {
        ({ selected, draft, editRevision, merge } = suspended); dirty = true; suspended = null;
      }
      if (selected && !selected.isNew && !dirty && !merge) {
        const current = snapshot.objects.find((item) => item.kind === selected.kind && item.id === selected.id);
        if (current) { selected = current; draft = copy(current.data); editRevision = current.editRevision; } else { selected = null; draft = null; }
      }
      renderStatus(); renderList(); renderConflicts(); renderManagement(); renderEditor(); renderToolbar();
    }
    async function selectObject(item) {
      if (busy || !await discard()) return;
      selected = item; draft = copy(item.data); editRevision = item.editRevision; dirty = false; merge = null; renderList(); renderEditor(); renderToolbar();
    }
    async function newDraft(kind) {
      if (!permission("canCreate") || !await discard()) return;
      selected = { kind, id: "", isNew: true }; draft = kind === "species" ? { id: "", scientificName: "", commonName: "", taxonomy: [], sections: [], media: { sounds: [], gallery: [] } }
        : { title: "", sections: [], media: { gallery: [] } };
      merge = null; dirty = true; renderEditor();
    }
    async function saveDraft() {
      if (!selected || busy) return;
      const target = { ...selected }, data = copy(draft), revision = editRevision, resolution = merge ? { ...merge } : null;
      if (resolution && !await confirm("Zusammengeführten Zieltext bestätigen", "Soll diese Fassung den Konflikt ausdrücklich entscheiden? Es erfolgt keine Websiteveröffentlichung.")) return;
      await action(async () => {
        let result;
        if (resolution) result = await remote.resolve(resolution.id, { strategy: "merged", data, expectedRevision: resolution.expectedRevision });
        else if (target.isNew) result = await remote.create({ kind: target.kind, id: target.id, data });
        else result = await remote.editExisting(target.kind, target.id, { data, expectedEditRevision: revision });
        dirty = false; merge = null; selected = result; draft = copy(result.data); editRevision = result.editRevision || ""; await loadSnapshot();
      }, resolution ? "Konfliktentscheidung gespeichert. Websiteübernahme bleibt ein eigener Schritt." : target.isNew ? "Online als Entwurf angelegt. Noch nicht freigegeben." : "Entwurf lokal gespeichert. „Abgleichen“ sendet ihn an den gemeinsamen Dienst.");
    }
    async function approveDraft() {
      if (!selected || dirty || !permission("canApprove") || selected.localPending || selected.localConflict) return;
      if (!await confirm("Aktuelle Version intern freigeben", "Soll die angezeigte bestätigte Fassung für Projektleser freigegeben werden? Eine Übernahme in Squarespace ist damit nicht verbunden.")) return;
      if (dirty) { message("Die Formulareingaben wurden geändert. Bitte zuerst speichern und abgleichen.", true); return; }
      await action(async () => { await remote.approve(selected.kind, selected.id, { expectedRevision: selected.revision }); await loadSnapshot(); }, "Intern freigegeben. Eine Websiteveröffentlichung ist nicht erfolgt.");
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
    nodes.sync = button("Lokale Änderungen abgleichen", () => action(async () => { await loadSnapshot(await remote.sync()); }, "Abgleich abgeschlossen. Offene Konflikte sind zur Entscheidung erhalten."));
    nodes.refresh = button("Serverstand lesen", () => action(async () => { await loadSnapshot(await remote.refresh({})); }, "Serverstand geladen. Ungesendete lokale Entwürfe bleiben erhalten."));
    nodes.newSpecies = button("Neue Art vorbereiten", () => newDraft("species")); nodes.newPage = button("Neue Seite vorbereiten", () => newDraft("page"));
    nodes.disconnect = button("Abmelden", async () => { if (!await discard()) return; await action(async () => { dirty = false; selected = null; draft = null; await loadSnapshot(await remote.disconnect()); }, "Lokal abgemeldet. Gespeicherte Entwürfe bleiben im persönlichen Cache."); });
    toolbar.append(nodes.sync, nodes.refresh, nodes.newSpecies, nodes.newPage, nodes.disconnect); root.append(toolbar);
    const workspace = create("div", undefined, "shared-project-workspace"), navigation = create("nav"); navigation.setAttribute("aria-label", "Gemeinsame Arten und Seiten");
    nodes.search = field(navigation, "Art oder Seite suchen", "", renderList, { type: "search", maxLength: 300 }); nodes.list = create("div"); navigation.append(nodes.list);
    nodes.editor = create("section"); workspace.append(navigation, nodes.editor); nodes.conflicts = create("section", undefined, "shared-project-conflicts"); nodes.management = create("section"); root.append(workspace, nodes.conflicts, nodes.management);
    renderStatus(); renderList(); renderEditor(); renderToolbar();
    return { open: () => action(() => loadSnapshot()), refresh: () => action(() => loadSnapshot()),
      select: (kind, id) => { const item = snapshot?.objects.find((entry) => entry.kind === kind && entry.id === id); return item ? selectObject(item) : null; },
      beforeClose: discard, hasUnsavedChanges: () => dirty || Boolean(suspended),
      getState: () => ({ busy, dirty, selected: selected ? { kind: selected.kind, id: selected.id } : null, merging: Boolean(merge), stopped }),
      destroy() { stopped = true; epoch++; nodes.password.value = ""; suspended = null; draft = null; merge = null; }, safeImageUrl };
  }
  global.SpeciesExplorerSharedProject = Object.freeze({ setupSharedProject, createSharedProjectController, createSharedProjectApi, safeImageUrl, ROLE_LABELS, CONNECTION_LABELS });
})(window);
