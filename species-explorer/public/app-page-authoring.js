(function initializePageAuthoring(global) {
  "use strict";
  const BASE = "/api/page-authoring";
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const hasText = (blocks) => blocks.some((block) => block.text?.trim() || block.items?.some((item) => item.trim()));
  const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;

  function createPageAuthoringController({ state, documentRef = global.document, fetchJson,
    releaseMediaWithin = () => {}, confirmAction, openAiSuggestion, reviewLanguage, createId = () => global.crypto?.randomUUID?.()
      || `editor-${Date.now()}-${Math.random().toString(16).slice(2)}`, encodeFile } = {}) {
    if (!state || !documentRef?.createElement || typeof fetchJson !== "function") throw new TypeError("Der Artseiteneditor benötigt Zustand, Oberfläche und Projektzugriff.");
    const make = (tag, text, className) => { const node = documentRef.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    const dialog = make("dialog", undefined, "edit-dialog page-authoring"), header = make("header", undefined, "page-authoring-head");
    const heading = make("h2", "Artseite vorbereiten"), status = make("p", "", "page-authoring-status");
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const closeButton = make("button", "Schließen"), body = make("div", undefined, "page-authoring-body");
    closeButton.type = "button"; header.append(heading, closeButton, status); dialog.append(header, body);
    dialog.setAttribute("aria-label", "Artseite vorbereiten"); documentRef.body.append(dialog);
    let opened = false, busy = false, generation = 0, session = null, authority = null, info = null, view = null;
    let model = null, baseline = "", preview = null, changedVersion = 0, suspended = false, review = {}, missingAlt = new Set();
    let readerPreview = null, readerOutcome = null, conflictReview = null;
    let provenMissing = false, controls = [], metadata = new Map(), candidates = [], createValues = null, imageAttribution = "", pendingCreate = null;
    const preserved = new Map(), expanded = new Set(); let pendingClose = false, listReady = false, aiActions = null;
    const languageChecks = new Set(); let languageRender = 0;
    const scope = () => state.workspaceStatus?.sourceScope;
    function identityKey() { return JSON.stringify([state.workspace, state.workspaceEpoch || 0, state.selectedId, scope(), state.editMode === true]); }
    function authorityKey() { return JSON.stringify([state.workspace, state.workspaceEpoch || 0, state.selectedId, scope(), state.editMode === true, state.workspaceStatus?.permissions || {}]); }
    function sameSession() {
      return opened && session && !suspended && state.workspace === "shared-project" && state.editMode === true
        && state.selectedId === session.speciesId && scope() === session.sourceScope && authorityKey() === authority
        && state.workspaceStatus?.permissions?.canEdit === true;
    }
    function ticket() { return { generation, authority, session }; }
    function current(value) { return value.generation === generation && value.authority === authority && value.session === session && sameSession(); }
    function requireCurrent(value) { if (!current(value)) throw Object.assign(new Error("Der Arbeitsbereich wurde geändert. Eingaben bleiben erhalten."), { code: "editor_context_changed" }); }
    function dirty() { return Boolean(model && JSON.stringify(model) !== baseline); }
    function message(text) { status.textContent = text; }
    function clearPreview() {
      preview = null; review = {}; missingAlt.clear();
      conflictReview = null;
      body.querySelector?.('[data-section="page-conflict-review"]')?.replaceChildren();
      clearReaderPreview();
      const panel = body.querySelector?.('[data-section="preview"]');
      if (panel) { releaseMediaWithin(panel, { includeImages: true }); for (const frame of panel.querySelectorAll?.("iframe") || []) frame.srcdoc = ""; panel.replaceChildren(); panel.hidden = true; }
    }
    function clearReaderPreview() {
      readerPreview = null;
      const panel = body.querySelector?.('[data-section="reader-preview"]');
      if (panel) { panel.replaceChildren(); panel.hidden = true; }
    }
    function readerEligible() {
      return Boolean(sameSession() && info?.permissions?.canEdit === true && state.workspaceStatus?.readOnlySession !== true
        && (!state.workspaceStatus?.user?.role || ["admin", "publisher", "contributor"].includes(state.workspaceStatus.user.role))
        && state.workspaceStatus?.connection === "online" && view?.draft && model && !dirty() && view.sync?.state === "synced"
        && view.connection === "online" && view.sync.localPending === false && view.sync.localConflict !== true
        && view.sync.coveredLocalRevision === view.draft.revision && view.sync.queuedLocalRevision === null
        && typeof view.sync.bindingRevision === "string" && view.sync.bindingRevision);
    }
    function readerBinding() {
      return JSON.stringify([generation, authority, session?.key, view?.draft?.id, view?.draft?.revision, view?.sync?.bindingRevision,
        changedVersion, baseline, JSON.stringify(model), state.workspaceStatus?.user?.id, state.workspaceStatus?.user?.role,
        state.workspaceStatus?.readOnlySession, state.workspaceStatus?.connection, view?.connection,
        view?.sync?.coveredLocalRevision, view?.sync?.queuedLocalRevision]);
    }
    function readerCurrent(binding) { return readerEligible() && readerBinding() === binding; }
    function requireReaderCurrent(binding) {
      if (!readerCurrent(binding)) throw Object.assign(new Error("Die geprüfte Übernahmefassung wurde geändert."), { code: "reader_preview_changed" });
    }
    function edited() {
      if (!sameSession() || busy) return false;
      changedVersion++; clearPreview(); provenMissing = false; return true;
    }
    function button(label, handler, { disabled = false, className = "" } = {}) {
      const node = make("button", label, className); node.type = "button"; node.disabled = disabled || busy || !sameSession();
      if (disabled) node.setAttribute("data-locked", "true");
      controls.push(node); node.addEventListener("click", () => { if (!node.disabled && sameSession() && !busy) return handler(); }); return node;
    }
    function editorAuthority() {
      const user = state.workspaceStatus?.user;
      return JSON.stringify([authorityKey(), user?.id, user?.role, user?.version, state.workspaceStatus?.readOnlySession, info?.permissions?.canEdit]);
    }
    function bindLanguageField(input, context) {
      const create = global.SpeciesExplorerLanguageCheck?.createInlineLanguageCheck;
      if (typeof create !== "function" || typeof reviewLanguage !== "function") return;
      const bound = ticket(), form = model, draftId = view?.draft?.id, revision = view?.draft?.revision;
      const renderId = languageRender, permissions = editorAuthority();
      const isCurrent = ({ text } = {}) => renderId === languageRender && current(bound) && model === form
        && view?.draft?.id === draftId && view?.draft?.revision === revision && editorAuthority() === permissions
        && info?.permissions?.canEdit === true && state.workspaceStatus?.readOnlySession !== true
        && !busy && !pendingClose && !input.disabled && !input.readOnly && input.isConnected !== false && input.value === text;
      languageChecks.add(create({ textarea: input, isCurrent,
        async review(text, { signal } = {}) {
          if (!isCurrent({ text })) throw Object.assign(new Error("Der Textentwurf wurde geändert."), { name: "AbortError" });
          const result = await reviewLanguage(text, { signal, context });
          if (!isCurrent({ text })) throw Object.assign(new Error("Der Textentwurf wurde geändert."), { name: "AbortError" });
          return result;
        },
        onApply({ text, nextText }) {
          return isCurrent({ text }) && typeof nextText === "string" && nextText.length <= input.maxLength
            && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(nextText);
        } }));
    }
    function field(label, value, update, { type = "text", maxLength = 300, rows = 3, languageContext = "text" } = {}) {
      const wrap = make("label", undefined, "page-authoring-field"), input = make(type === "textarea" ? "textarea" : "input");
      wrap.append(make("span", label)); input.setAttribute("aria-label", label); input.value = value ?? "";
      if (type !== "textarea") input.type = type; else { input.rows = rows; input.spellcheck = true; input.lang = "de"; }
      input.maxLength = maxLength; input.disabled = busy || !sameSession(); controls.push(input);
      input.addEventListener("input", () => { if (!edited()) return; update(input.value); updateActions(); }); wrap.append(input);
      if (type === "textarea") bindLanguageField(input, languageContext);
      return wrap;
    }
    function checkbox(label, checked, update, { reviewOnly = false } = {}) {
      const wrap = make("label", undefined, "page-authoring-check"), input = make("input"); input.type = "checkbox"; input.checked = checked;
      input.setAttribute("aria-label", label); input.disabled = busy || !sameSession(); controls.push(input);
      input.addEventListener("change", () => {
        if (!sameSession() || busy || !reviewOnly && !edited()) return;
        update(input.checked); if (!reviewOnly) renderEditor(); else updateActions();
      }); wrap.append(input, make("span", label)); return wrap;
    }
    function details(label, key = label) {
      const node = make("details"), content = make("div", undefined, "page-authoring-stack"); node.setAttribute("data-editor-group", key); node.open = expanded.has(key);
      node.append(make("summary", label), content); return { node, content };
    }
    function apiBody(extra = {}) {
      return { sourceScope: session.sourceScope, draftId: view?.draft?.id, mutationId: createId(),
        ...(view?.draft ? { expectedRevision: view.draft.revision } : {}), ...extra };
    }
    async function request(url, options, bound) {
      requireCurrent(bound); const result = await fetchJson(url, options); requireCurrent(bound);
      if (result?.sourceScope !== undefined && result.sourceScope !== session.sourceScope) throw Object.assign(new Error("Die Antwort gehört zu einer anderen Projektanmeldung."), { code: "workspace_changed" });
      return result;
    }
    async function post(action, extra, bound) {
      return request(`${BASE}/drafts/${encodeURIComponent(view.draft.id)}/${action}`, { method: "POST", body: JSON.stringify(apiBody(extra)) }, bound);
    }
    function errorMessage(error) {
      if (["editor_context_changed", "workspace_changed", "cms_binding_changed", "forbidden", "authentication_required"].includes(error?.code)) return "Die Bearbeitung ist angehalten. Projekt, Person oder Berechtigung prüfen; eigene Eingaben bleiben erhalten.";
      if (error?.code === "create_confirmation_required") return "Die gemeinsame Seite fehlt beim erneuten Einlesen. Eine erneute Erstellung muss ausdrücklich bestätigt werden.";
      if (error?.code === "cached_page_changed") return "Der zuletzt geladene Entwurf ist nicht mehr eindeutig verfügbar. Bitte den Seitenstand neu prüfen.";
      if (["draft_conflict", "workspace_conflict", "local_page_changed", "shared_page_conflict"].includes(error?.code)) return "Der Entwurfsstand wurde inzwischen geändert. Eigene Eingaben bleiben erhalten. Bitte den gemeinsamen Stand gezielt prüfen.";
      if (error?.code === "species_source_changed") return "Die Artgrundlage wurde geändert. Bitte unter „Weitere Aktionen“ aktualisieren und die Vorschau neu prüfen.";
      if (error?.code === "invalid_parent") return "Bitte einen vorhandenen Wildlife-Zielbereich als Pfad eintragen. Eigene Eingaben bleiben erhalten.";
      if (error?.code === "decorative_text") return "Bei einem bewusst dekorativen Bild bitte den Alternativtext leeren oder die Bildrolle ändern. Eigene Eingaben bleiben erhalten.";
      if (["local_media_required", "media_missing"].includes(error?.code)) return "Eine benötigte Bilddatei fehlt auf diesem Gerät. Bitte das betreffende Bild gezielt aus dem Projekt laden. Eigene Eingaben bleiben erhalten.";
      if (["target_authority_required", "cms_adapter_unavailable", "SQUARESPACE_PAGE_AUTHORING_UNAVAILABLE"].includes(error?.code)) return "Die automatische Neuanlage in Squarespace ist noch nicht verfügbar. Es wurde keine Websiteänderung ausgeführt.";
      if (error?.code === "SQUARESPACE_LOGIN_REQUIRED") return "Bitte zuerst im Squarespace-Fenster anmelden und danach diesen Schritt erneut starten.";
      if (["SQUARESPACE_TARGET_NOT_CONFIRMED", "target_not_new", "target_observation_stale"].includes(error?.code)) return "Die gewünschte Squarespace-Adresse konnte nicht als frei bestätigt werden. Bitte die Adresse und den Zielbereich prüfen. Der vorbereitete Auftrag bleibt erhalten.";
      if (error?.code === "SQUARESPACE_BUSY") return "Squarespace wird gerade für eine andere Übernahme verwendet. Bitte deren Abschluss abwarten.";
      if (error?.code === "cms_execution_busy") return "Ein Squarespace-Auftrag läuft bereits. Bitte dessen Abschluss abwarten.";
      if (error?.code === "cms_recheck_unavailable") return "Für diesen Auftrag ist die Rückprüfung nicht verfügbar. Bitte den Entwurfsstand neu laden.";
      if (error?.code === "cms_recheck_unconfirmed") return "Der gespeicherte Squarespace-Entwurf konnte noch nicht bestätigt werden.";
      if (error?.code === "cms_repeat_blocked") return "Für diese Artseite besteht bereits ein begonnener Übernahmeauftrag. Bitte dessen gespeicherten Ausgang prüfen; es wird keine zweite Seite angelegt.";
      if (["reader_preview_changed", "reader_preview_required", "editorial_adoption_changed", "editorial_preview_required"].includes(error?.code)) return "Die Übernahmefassung ist nicht mehr aktuell. Bitte den gemeinsamen Stand laden und die Übernahme neu prüfen. Eigene Eingaben bleiben erhalten.";
      if (error?.code === "pending_review") return "Für diese Art oder Seite liegen noch offene Änderungen vor. Bitte diese zuerst im gemeinsamen Artbestand abgleichen oder klären und anschließend neu prüfen.";
      if (["editorial_adoption_server_required", "reader_catalog_version_required"].includes(error?.code)) return "Der gemeinsame Dienst unterstützt diese Artübernahme noch nicht vollständig. Es wurde nichts übernommen.";
      return "Der Schritt wurde nicht bestätigt. Eigene Eingaben und bereits hinzugefügte Bilder bleiben erhalten. Es wird nicht automatisch wiederholt.";
    }
    async function work(operation) {
      if (busy || !sameSession()) return false;
      const bound = ticket(); busy = true; updateActions();
      try { await operation(bound); requireCurrent(bound); return true; }
      catch (error) {
        if (current(bound)) { provenMissing = error?.code === "create_confirmation_required"; message(errorMessage(error)); clearPreview(); renderEditor(); }
        return false;
      } finally {
        if (bound.session === session) {
          busy = false;
          if (opened && !sameSession()) { suspended = true; hidePrivate(); }
          updateActions();
        }
      }
    }
    function accept(next, { keepModel = false } = {}) {
      if (!next || next.sourceScope !== session.sourceScope) throw Object.assign(new Error("Die Entwurfsantwort ist nicht an die Anmeldung gebunden."), { code: "workspace_changed" });
      const expectedId = view?.draft?.id || session.remoteId;
      if (next.draft && (next.draft.document?.slug !== session.slug || !idPattern.test(next.draft.id || "") || expectedId && next.draft.id !== expectedId || typeof next.draft.revision !== "string" || !next.editable))
        throw new Error("Die Artzuordnung des Entwurfs ist nicht bestätigt.");
      if (!next.draft && (!next.remoteOnly || next.remoteOnly.data?.document?.slug !== session.slug || next.remoteOnly.data?.pageId !== expectedId))
        throw new Error("Der gemeinsame Entwurf ist nicht mehr eindeutig zugeordnet.");
      view = next; clearReaderPreview(); readerOutcome = null; conflictReview = null;
      if (next.draft && !keepModel) { model = copy(next.editable); baseline = JSON.stringify(model); preserved.delete(session.key); }
      else if (!next.draft && !keepModel) { model = null; baseline = ""; }
    }
    function release() {
      releaseMediaWithin(dialog, { includeImages: true });
      for (const frame of dialog.querySelectorAll?.("iframe") || []) { frame.srcdoc = ""; frame.removeAttribute?.("src"); }
      for (const image of dialog.querySelectorAll?.("img") || []) image.removeAttribute?.("src");
    }
    function hidePrivate() { clearAiActions(); release(); body.hidden = true; heading.textContent = "Artseite vorbereiten"; message("Die Bearbeitung ist angehalten. Eingaben bleiben erhalten; bitte die Art mit gültiger Projektanmeldung erneut öffnen."); }
    function stateChanged() {
      if (!opened) return;
      if (authorityKey() === authority && sameSession()) { updateActions(); return; }
      if (session.identity === identityKey() && state.workspaceStatus?.permissions?.canEdit === true && !suspended) {
        generation++; authority = authorityKey(); if (info) info.permissions = copy(state.workspaceStatus.permissions); clearPreview(); renderEditor();
        message("Verbindung oder Berechtigungen wurden aktualisiert. Eigene Eingaben bleiben erhalten; die Vorschau bitte neu prüfen."); return;
      }
      generation++; suspended = true; clearPreview(); hidePrivate(); updateActions();
    }
    function updateActions() {
      const allowed = sameSession();
      for (const control of controls) control.disabled = !allowed || busy || control.getAttribute?.("data-locked") === "true";
      const approve = body.querySelector?.('[data-action="approve"]');
      if (approve) approve.disabled = !allowed || busy || dirty() || !preview || !preview.report?.technicalReady || info?.permissions?.canApprove !== true
        || state.workspaceStatus?.permissions?.canApprove !== true || !["texts", "images", "layout"].every((key) => review[key] === true)
        || preview.report.findings.filter((item) => item.code === "alt_missing").some((item) => !missingAlt.has(item.id));
      const previewArea = body.querySelector?.('[data-section="preview"]');
      if (previewArea && !preview) {
        releaseMediaWithin(previewArea, { includeImages: true }); for (const frame of previewArea.querySelectorAll?.("iframe") || []) frame.srcdoc = "";
        previewArea.replaceChildren(); previewArea.hidden = true;
      }
      const saveState = body.querySelector?.('[data-section="save-state"]');
      if (saveState) saveState.textContent = dirty() ? "Ungespeicherte Eingaben" : view?.approval ? "Intern freigegebene Fassung · Websiteveröffentlichung separat" : "Gespeicherter Entwurf · noch nicht intern freigegeben";
      const plan = body.querySelector?.('[data-action="cms-plan"]');
      if (plan) plan.disabled = !allowed || busy || dirty() || !view?.approval?.id || info?.cmsAvailable !== true || info?.permissions?.canApprove !== true || state.workspaceStatus?.permissions?.canApprove !== true;
      const createCms = body.querySelector?.('[data-action="cms-create"]');
      if (createCms) createCms.disabled = !allowed || busy || dirty() || !view?.approval?.id || info?.cmsAvailable !== true
        || info?.permissions?.canApprove !== true || state.workspaceStatus?.permissions?.canApprove !== true
        || Boolean(view?.cms && !(view.cms.status === "prepared" && view.cms.matchesCurrentRevision === true)
          && !canReplacePreparedCms(view.cms));
      const recheckCms = body.querySelector?.('[data-action="cms-recheck"]');
      if (recheckCms) recheckCms.disabled = !allowed || busy || !cmsRecheckEligible();
      const readerStart = body.querySelector?.('[data-action="reader-preview"]');
      if (readerStart) {
        readerStart.disabled = !allowed || busy || !readerEligible() || Boolean(readerOutcome);
        readerStart.title = readerOutcome ? "Die geprüfte Fassung ist bereits vorgemerkt. Bitte im gemeinsamen Artbestand abgleichen."
          : dirty() ? "Eigene Eingaben zuerst speichern und mit dem gemeinsamen Projekt abgleichen."
            : !readerEligible() ? "Benötigt eine Onlineverbindung und den exakt gespeicherten, abgeglichenen Seitenentwurf ohne Konflikt." : "Redaktionelle Inhalte als Artentwurf vorbereiten";
      }
      const readerConfirm = body.querySelector?.('[data-action="reader-adopt"]');
      if (readerConfirm) readerConfirm.disabled = !allowed || busy || !readerPreview || !readerCurrent(readerPreview.binding)
        || !(Date.parse(readerPreview.expiresAt) > Date.now());
      const readerPanel = body.querySelector?.('[data-section="reader-preview"]');
      if (readerPanel && readerPreview && !readerCurrent(readerPreview.binding)) clearReaderPreview();
      closeButton.disabled = busy || pendingClose;
      aiActions?.refresh();
    }
    function aiBinding() {
      return { sourceScope: session?.sourceScope || "", draftId: view?.draft?.id || "", expectedRevision: view?.draft?.revision || "",
        localGeneration: changedVersion, saved: Boolean(model && !dirty()), canEdit: sameSession() && info?.permissions?.canEdit === true,
        busy: busy || pendingClose, workspaceEpoch: state.workspaceEpoch || 0, connection: state.workspaceStatus?.connection || "", generation, authority };
    }
    function aiCurrent(binding) { return sameSession() && !busy && !pendingClose && !dirty() && JSON.stringify(aiBinding()) === JSON.stringify(binding); }
    function pageAi() {
      if (!aiActions && typeof openAiSuggestion === "function" && typeof global.SpeciesExplorerPageAi?.createPageAiActions === "function") {
        aiActions = global.SpeciesExplorerPageAi.createPageAiActions({ documentRef, fetchJson, openSuggestion: openAiSuggestion,
          notice(text) { if (sameSession()) message(text); } });
      }
      return aiActions;
    }
    function clearAiActions() {
      aiActions?.dispose(); aiActions = null; languageRender++;
      for (const check of languageChecks) check.dispose(); languageChecks.clear();
    }
    function imageAiAction(image) {
      return pageAi()?.createImageAction({ imageId: image.id, title: session.name, getBinding: aiBinding, isCurrent: aiCurrent,
        getImage: () => {
          const currentImage = model?.images.find((item) => item.id === image.id);
          return currentImage ? { alt: currentImage.alt, caption: currentImage.caption, decorative: currentImage.decorative, assetId: currentImage.assetId,
            previewUrl: metadata.get(currentImage.assetId)?.localAvailable === true && /^image-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(currentImage.assetId)
              ? `${BASE}/images/${currentImage.assetId}?scope=${session.sourceScope}` : "" } : null;
        },
        applyImageText(text, binding) {
          if (!aiCurrent(binding.binding) || binding.imageId !== image.id || model.images.find((item) => item.id === image.id) !== image
            || image.decorative || typeof text !== "string" || !text.trim() || text.length > 3000) return false;
          if (image.alt === text) return true;
          if (!edited()) return false;
          image.alt = text; renderEditor(); message("Alttext im Entwurf ergänzt. Bildunterschrift unverändert; bitte bewusst speichern."); return true;
        } });
    }
    function sectionAiActions(section, stored) {
      if (stored?.kind !== "editorial") return null;
      return pageAi()?.createSectionActions({ sectionId: section.id, getBinding: aiBinding, isCurrent: aiCurrent,
        getSection: () => {
          const currentSection = model?.sections.find((item) => item.id === section.id);
          return currentSection ? { ...copy(currentSection), kind: stored.kind, emptyConfirmed: Boolean(view.draft.document.emptyConfirmations?.[section.id])
            && stored.title === currentSection.title && JSON.stringify(stored.blocks) === JSON.stringify(currentSection.blocks) } : null;
        },
        applySectionProposal(proposal, binding) {
          if (!aiCurrent(binding.binding) || binding.kind !== "source-text" || binding.sectionId !== section.id || proposal.kind !== "source-text"
            || model.sections.find((item) => item.id === section.id) !== section || !section.requested || hasText(section.blocks)
            || view.draft.document.emptyConfirmations?.[section.id] || !Array.isArray(proposal.paragraphs) || !proposal.paragraphs.length || proposal.paragraphs.length > 8) return false;
          const selected = new Map(binding.sources.map((source) => [source.id, source])), used = new Set(), paragraphs = [];
          for (const paragraph of proposal.paragraphs) {
            if (typeof paragraph.text !== "string" || !paragraph.text.trim() || paragraph.text.length > 1800 || !Array.isArray(paragraph.sourceIds) || !paragraph.sourceIds.length
              || !Array.isArray(paragraph.evidenceQuotes) || paragraph.sourceIds.some((id) => !selected.has(id) || !paragraph.evidenceQuotes.some((quote) => quote.sourceId === id))
              || paragraph.evidenceQuotes.some((quote) => !paragraph.sourceIds.includes(quote.sourceId) || typeof quote.quote !== "string" || quote.quote.length < 3 || !selected.get(quote.sourceId)?.text.includes(quote.quote))) return false;
            paragraph.sourceIds.forEach((id) => used.add(id)); paragraphs.push({ type: "paragraph", text: paragraph.text });
          }
          const sources = copy(section.sources);
          for (const id of used) {
            const source = selected.get(id);
            if (!idPattern.test(id) || !/^[a-f0-9]{64}$/.test(source.revision || "") || typeof source.title !== "string") return false;
            const sourceId = sources.some((item) => item.id === id && item.sha256 !== source.revision) ? `${id}-${source.revision.slice(0, 12)}` : id;
            if (!sources.some((item) => item.id === sourceId && item.sha256 === source.revision)) sources.push({ id: sourceId, label: source.title || "Ausgewählte Textquelle", sha256: source.revision });
          }
          if (sources.length > 30 || section.blocks.length + paragraphs.length > 300) { message("Für weitere Absätze oder Quellen ist in diesem Abschnitt kein Platz. Vorhandene Texte bleiben erhalten."); return false; }
          if (!edited()) return false;
          section.blocks.push(...paragraphs); section.sources = sources; renderEditor(); message("Geprüfte Absätze und Quellen im Entwurf ergänzt. Bitte bewusst speichern."); return true;
        } });
    }
    function addSources(parent, sources, label, key = "document-sources") {
      const more = details(`${label} (${sources.length})`, key);
      const draw = () => {
        more.content.replaceChildren();
        for (const source of sources) {
          const row = make("div", undefined, "page-authoring-source");
          row.append(field("Quellenbezeichnung", source.label, (value) => { source.label = value; }, { maxLength: 1000 }),
            field("Quellenadresse (optional)", source.url || "", (value) => { if (value) source.url = value; else delete source.url; }, { type: "url", maxLength: 4096 }),
            button("Quelle entfernen", () => { if (edited()) { sources.splice(sources.indexOf(source), 1); renderEditor(); } }));
          more.content.append(row);
        }
        more.content.append(button("Quelle hinzufügen", () => { if (edited()) { sources.push({ id: createId(), label: "" }); renderEditor(); } }));
      }; draw(); parent.append(more.node);
    }
    function addBlocks(parent, blocks, label) {
      const stack = make("div", undefined, "page-authoring-stack");
      blocks.forEach((block, index) => {
        const row = make("div", undefined, "page-authoring-block");
        const names = { paragraph: "Absatz", heading: "Zwischenüberschrift", "bullet-list": "Aufzählung", "numbered-list": "Nummerierte Liste" };
        row.append(make("span", `${names[block.type] || "Textblock"} ${index + 1}`, "page-authoring-small"));
        if (Array.isArray(block.items)) {
          block.items.forEach((item, itemIndex) => row.append(field(`${label}: Listeneintrag ${index + 1}.${itemIndex + 1}`, item,
            (value) => { block.items[itemIndex] = value; }, { type: "textarea", maxLength: 10000, rows: 2 }),
          button(`Listeneintrag ${index + 1}.${itemIndex + 1} entfernen`, () => { if (edited()) { block.items.splice(itemIndex, 1); if (!block.items.length) blocks.splice(index, 1); renderEditor(); } })));
          row.append(button("Listeneintrag hinzufügen", () => { if (edited()) { block.items.push(""); renderEditor(); } }));
        } else row.append(field(`${label}: ${names[block.type] || "Text"} ${index + 1}`, block.text,
          (value) => { block.text = value; }, { type: "textarea", maxLength: 100000, rows: block.type === "heading" ? 2 : 5,
            languageContext: block.type === "heading" ? "heading" : "text" }));
        const tools = make("div", undefined, "page-authoring-inline");
        tools.append(button("Textblock nach oben", () => { if (index > 0 && edited()) { [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]]; renderEditor(); } }, { disabled: index === 0 }),
          button("Textblock nach unten", () => { if (index < blocks.length - 1 && edited()) { [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]]; renderEditor(); } }, { disabled: index === blocks.length - 1 }),
          button("Textblock entfernen", () => { if (edited()) { blocks.splice(index, 1); renderEditor(); } }));
        row.append(tools); stack.append(row);
      });
      const tools = make("div", undefined, "page-authoring-inline");
      for (const [type, text] of [["paragraph", "Absatz hinzufügen"], ["heading", "Zwischenüberschrift hinzufügen"], ["bullet-list", "Aufzählung hinzufügen"], ["numbered-list", "Nummerierte Liste hinzufügen"]])
        tools.append(button(text, () => { if (edited()) { blocks.push(type.endsWith("list") ? { type, items: [""] } : { type, text: "", ...(type === "heading" ? { level: 5 } : {}) }); renderEditor(); } }));
      stack.append(tools); parent.append(stack);
    }
    async function save(bound) {
      if (!dirty()) return;
      const next = await post("save", { document: copy(model) }, bound); requireCurrent(bound); accept(next); clearPreview(); renderEditor();
    }
    function cmsOutcomeNote(attempt) {
      const receipt = attempt?.receipt;
      return attempt?.status === "uncertain" && receipt?.status === "uncertain" && receipt.schemaVersion === 2
        && receipt.attemptId === attempt.id && typeof receipt.reason === "string" ? receipt.reason : "";
    }
    function canReplacePreparedCms(attempt) {
      return attempt?.status === "prepared" && attempt.matchesCurrentRevision === false && attempt.canReplacePrepared === true;
    }
    function cmsRecheckEligible() {
      const attempt = view?.cms, draft = view?.draft, workspace = state.workspaceStatus;
      return attempt?.canRecheckSave === true && ["dispatched", "uncertain"].includes(attempt.status)
        && draft && attempt.matchesCurrentRevision === true && attempt.draftId === draft.id && attempt.revision === draft.revision
        && idPattern.test(attempt.id || "") && /^[a-f0-9]{64}$/.test(attempt.stateRevision || "")
        && view.sourceScope === scope() && view.connection === "online" && workspace?.connection === "online"
        && workspace.readOnlySession === false && info?.permissions?.canApprove === true && workspace.permissions?.canApprove === true && !dirty();
    }
    async function recheckCmsSave(shown, bound) {
      if (view !== shown || !cmsRecheckEligible()) return;
      const { id: draftId, revision } = shown.draft, attempt = shown.cms, access = editorAuthority();
      message("Der gespeicherte Entwurf wird in Squarespace geprüft.");
      const next = await request(`${BASE}/drafts/${encodeURIComponent(draftId)}/recheck-squarespace-save`, {
        method: "POST", body: JSON.stringify({ sourceScope: shown.sourceScope, draftId, attemptId: attempt.id, expectedStateRevision: attempt.stateRevision }),
      }, bound);
      if (view !== shown || !cmsRecheckEligible() || access !== editorAuthority())
        throw Object.assign(new Error("Der Arbeitsbereich wurde während der Prüfung geändert."), { code: "editor_context_changed" });
      const checked = next?.cms;
      if (next?.draft?.id !== draftId || next.draft.revision !== revision || checked?.id !== attempt.id
        || checked.draftId !== draftId || checked.revision !== revision || checked.matchesCurrentRevision !== true)
        throw Object.assign(new Error("Die Rückprüfung gehört nicht zum aktuellen Auftrag."), { code: "cms_binding_changed" });
      const confirmed = checked.status === "saved-unpublished";
      if (confirmed && (!/^[a-f0-9]{64}$/.test(checked.stateRevision || "") || checked.stateRevision === attempt.stateRevision
        || checked.receipt?.schemaVersion !== 2 || checked.receipt.status !== "saved-unpublished" || checked.receipt.attemptId !== attempt.id))
        throw Object.assign(new Error("Der Speicherbeleg gehört nicht zur aktuellen Rückprüfung."), { code: "cms_binding_changed" });
      accept(next, { keepModel: true }); renderEditor();
      message(confirmed ? "Gespeicherter Squarespace-Entwurf bestätigt."
        : "Der gespeicherte Squarespace-Entwurf konnte noch nicht bestätigt werden.");
    }
    async function createCmsPage(bound) {
      if (dirty() || !view?.approval?.id || info?.cmsAvailable !== true) return;
      if (!view.cms || canReplacePreparedCms(view.cms)) {
        const previousStateRevision = view.cms?.stateRevision;
        const planned = await post("prepare-cms-plan", { approvalId: view.approval.id }, bound); requireCurrent(bound);
        const artifact = planned.artifact;
        if (artifact?.kind !== "cms-plan" || !idPattern.test(artifact.id || "") || artifact.revision !== view.draft.revision
          || artifact.draftId !== view.draft.id) throw new Error("Der Websiteplan gehört nicht zur aktuellen Artseite.");
        const begun = await post("begin-cms-attempt", { planId: artifact.id }, bound); requireCurrent(bound);
        if (begun.cms?.draftId !== view.draft.id || begun.cms.revision !== view.draft.revision || begun.cms.planId !== artifact.id
          || previousStateRevision && begun.cms.stateRevision === previousStateRevision)
          throw new Error("Der vorbereitete Websiteauftrag gehört nicht zur aktuellen Artseite.");
        accept(begun, { keepModel: true });
      }
      const attempt = view.cms;
      if (!attempt || attempt.status !== "prepared" || attempt.matchesCurrentRevision !== true || attempt.draftId !== view.draft.id
        || attempt.revision !== view.draft.revision || !idPattern.test(attempt.id || "")
        || !/^[a-f0-9]{64}$/.test(attempt.stateRevision || "")) throw Object.assign(new Error("Der Websiteauftrag wurde bereits begonnen."), { code: "cms_repeat_blocked" });
      message("Die freigegebene Artseite wird als unveröffentlichter Squarespace-Entwurf vorbereitet.");
      const next = await request(`${BASE}/drafts/${encodeURIComponent(view.draft.id)}/create-unpublished-page`, { method: "POST", body: JSON.stringify({
        sourceScope: session.sourceScope, draftId: view.draft.id, attemptId: attempt.id, expectedStateRevision: attempt.stateRevision }) }, bound);
      requireCurrent(bound);
      if (next.cms?.id !== attempt.id || next.cms.draftId !== view.draft.id || next.cms.revision !== view.draft.revision)
        throw new Error("Die Websiteantwort gehört nicht zum begonnenen Auftrag.");
      accept(next, { keepModel: true }); renderEditor();
      message(next.cms?.status === "saved-unpublished" && next.cms.matchesCurrentRevision === true
        ? "Unveröffentlichter Squarespace-Entwurf gespeichert und erneut geprüft. Die Veröffentlichung bleibt ein eigener Schritt."
        : cmsOutcomeNote(next.cms) || "Der Ausgang der Squarespace-Vorbereitung ist offen. Bitte den gespeicherten Auftrag prüfen. Er wird nicht automatisch wiederholt.");
    }
    async function makePreview(bound) {
      await save(bound); requireCurrent(bound);
      const version = changedVersion, next = await post("preview", {}, bound); requireCurrent(bound);
      if (version !== changedVersion || !idPattern.test(next.artifact?.id || "") || next.artifact.kind !== "preview" || next.artifact.draftId !== view.draft.id
        || next.artifact.revision !== view.draft.revision || typeof next.html !== "string" || !next.report?.reportHash || !Array.isArray(next.report.findings)
        || next.report.revision !== view.draft.revision) throw new Error("Die Vorschau gehört nicht zur aktuellen Fassung.");
      accept(next); preview = { html: next.html, report: copy(next.report), artifact: copy(next.artifact) }; review = {}; missingAlt.clear();
      message("Vorschau bereit. Texte, Bilder und Darstellung bitte bewusst prüfen."); renderEditor();
      body.querySelector?.('[data-section="preview"]')?.scrollIntoView?.({ block: "start" });
    }
    function renderPreview(parent) {
      const panel = make("section", undefined, "page-authoring-preview"); panel.setAttribute("data-section", "preview"); panel.hidden = !preview; parent.append(panel);
      if (!preview) return;
      panel.append(make("h3", "Vorschau prüfen"));
      const frame = make("iframe"); frame.setAttribute("title", "Vorschau der vorbereiteten Artseite"); frame.setAttribute("sandbox", ""); frame.setAttribute("referrerpolicy", "no-referrer"); frame.srcdoc = preview.html; panel.append(frame);
      const findings = preview.report.findings || [];
      if (findings.some((item) => item.blocking)) panel.append(make("p", "Vor der Freigabe sind noch Inhalte oder Dateien offen. Die Hinweise stehen unter „Prüfergebnis“.", "page-authoring-notice"));
      const report = details(`Prüfergebnis (${findings.length} Hinweise)`);
      if (!findings.length) report.content.append(make("p", "Die automatische Inhalts- und Dateiprüfung ist bestanden."));
      for (const item of findings) report.content.append(make("p", item.message)); panel.append(report.node);
      for (const [key, label] of [["texts", "Texte geprüft"], ["images", "Bilder und Bildtexte geprüft"], ["layout", "Gesamte Darstellung geprüft"]])
        panel.append(checkbox(label, review[key] === true, (checked) => { review[key] = checked; }, { reviewOnly: true }));
      for (const finding of findings.filter((item) => item.code === "alt_missing")) {
        const index = model.images.findIndex((image) => image.id === finding.id);
        panel.append(checkbox(`Bild ${index + 1}: fehlenden Alternativtext bewusst offen lassen`, missingAlt.has(finding.id),
          (checked) => { if (checked) missingAlt.add(finding.id); else missingAlt.delete(finding.id); }, { reviewOnly: true }));
      }
      const approve = button("Geprüfte Artseite intern freigeben", () => work(async (bound) => {
        if (dirty() || !preview || !["texts", "images", "layout"].every((key) => review[key] === true)) return;
        const shown = preview; preview = null; updateActions();
        const next = await post("approve", { previewId: shown.artifact.id, reportHash: shown.report.reportHash, review: copy(review),
          missingAltAcknowledged: shown.report.findings.filter((item) => item.code === "alt_missing" && missingAlt.has(item.id)).map((item) => item.id) }, bound);
        requireCurrent(bound);
        if (next.approval?.kind !== "approval" || next.approval.draftId !== view.draft.id || next.approval.revision !== view.draft.revision
          || next.approval.payload?.reportHash !== shown.report.reportHash) throw new Error("Die interne Freigabe wurde nicht für die gezeigte Fassung bestätigt.");
        accept(next); clearPreview(); message(next.sync?.sharedApprovalConfirmed === true
          ? "Diese Fassung ist im gemeinsamen Projekt intern freigegeben. Auf der Website wurde nichts veröffentlicht."
          : "Diese Fassung ist auf diesem Gerät intern freigegeben. Die gemeinsame Bestätigung steht noch aus. Auf der Website wurde nichts veröffentlicht."); renderEditor();
      })); approve.setAttribute("data-action", "approve"); panel.append(approve);
    }
    function readerCopy(value) {
      return Boolean(value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.sections) && Array.isArray(value.gallery));
    }
    async function makeReaderPreview(bound) {
      if (!readerEligible() || readerOutcome) return;
      const binding = readerBinding(), draftId = view.draft.id;
      clearReaderPreview();
      const next = await request(`${BASE}/drafts/${encodeURIComponent(draftId)}/reader-preview`, { method: "POST", body: JSON.stringify({
        sourceScope: session.sourceScope, expectedRevision: view.draft.revision, expectedBindingRevision: view.sync.bindingRevision }) }, bound);
      requireReaderCurrent(binding);
      if (next?.sourceScope !== session.sourceScope || next.draftId !== draftId || !idPattern.test(next.token || "")
        || !(Date.parse(next.expiresAt) > Date.now()) || !readerCopy(next.beforeEditorial) || !readerCopy(next.proposedEditorial)
        || typeof next.proposedEditorial.title !== "string" || !Array.isArray(next.proposedEditorial.introduction) || !Array.isArray(next.proposedEditorial.sources)
        || next.readerApproved !== false || next.externalPublication !== "not-performed") throw new Error("Die Übernahmevorschau ist nicht eindeutig bestätigt.");
      readerPreview = { binding, token: next.token, expiresAt: next.expiresAt, before: copy(next.beforeEditorial), after: copy(next.proposedEditorial) };
      renderEditor(); message("Übernahmevorschau bereit. Bitte die Änderungen vergleichen und anschließend ausdrücklich als Artentwurf übernehmen.");
      body.querySelector?.('[data-section="reader-preview"]')?.scrollIntoView?.({ block: "start" });
    }
    function readerBlocks(parent, blocks) {
      for (const block of Array.isArray(blocks) ? blocks : []) {
        if (Array.isArray(block.items)) {
          const list = make(block.type === "numbered-list" ? "ol" : "ul");
          for (const item of block.items) if (typeof item === "string") list.append(make("li", item)); parent.append(list);
        } else if (typeof block.text === "string") parent.append(make(block.type === "heading" ? "h5" : "p", block.text, "page-authoring-reader-text"));
      }
    }
    function readerSources(parent, sources) {
      if (!Array.isArray(sources) || !sources.length) return;
      const list = make("ul", undefined, "page-authoring-reader-sources");
      for (const source of sources) if (typeof source.label === "string") list.append(make("li", `${source.label}${typeof source.url === "string" ? ` · ${source.url}` : ""}`));
      parent.append(make("h5", "Quellen"), list);
    }
    function readerTexts(parent, editorial, label) {
      const column = make("section", undefined, "page-authoring-reader-version"); column.append(make("h4", label));
      if (typeof editorial.title === "string") column.append(make("p", editorial.title));
      if (Array.isArray(editorial.introduction)) { column.append(make("h5", "Einleitung")); readerBlocks(column, editorial.introduction); }
      for (const section of editorial.sections) {
        column.append(make("h5", typeof section.title === "string" ? section.title : "Abschnitt"));
        if (section.requested === false) column.append(make("p", "Nicht vorgesehen", "page-authoring-small"));
        if (Array.isArray(section.blocks)) {
          readerBlocks(column, section.blocks);
          if (!hasText(section.blocks)) column.append(make("p", section.kind === "general-module" ? "Gebundene Artgrunddaten"
            : section.kind === "map-module" ? "Verbreitungskarte aus der Artgrundlage"
              : section.emptyDecision || section.intentionallyEmpty ? "Bewusst leer" : "Noch ohne Text", "page-authoring-small"));
        } else if (typeof section.text === "string") column.append(make("p", section.text || (section.intentionallyEmpty ? "Bewusst leer" : "Noch ohne Text"), "page-authoring-reader-text"));
        readerSources(column, section.sources);
      }
      readerSources(column, editorial.sources); parent.append(column);
    }
    function readerImages(parent, editorial, label) {
      const column = make("section", undefined, "page-authoring-reader-version"); column.append(make("h4", label));
      if (editorial.galleryRequested === false) column.append(make("p", "Galerie nicht vorgesehen; hinterlegte Bildtexte bleiben erhalten.", "page-authoring-small"));
      if (!editorial.gallery.length) column.append(make("p", "Keine Galeriebilder erfasst."));
      const images = [...editorial.gallery];
      if (images.every(image => Number.isSafeInteger(image.order))) images.sort((left, right) => left.order - right.order || String(left.id).localeCompare(String(right.id)));
      images.forEach((image, index) => {
        const entry = make("section", undefined, "page-authoring-reader-image"); entry.append(make("h5", `Bild ${index + 1}`));
        entry.append(make("p", image.decorative ? "Bewusst dekorativ" : `Alternativtext: ${typeof image.alt === "string" && image.alt ? image.alt : "Noch ohne Text"}`));
        entry.append(make("p", `Bildunterschrift: ${typeof image.caption === "string" && image.caption ? image.caption : "Keine erfasst"}`)); column.append(entry);
      }); parent.append(column);
    }
    function readerSummary(editorial) {
      const sources = (Array.isArray(editorial.sources) ? editorial.sources.length : 0)
        + editorial.sections.reduce((count, section) => count + (Array.isArray(section.sources) ? section.sources.length : 0), 0);
      return [typeof editorial.title === "string" ? editorial.title : "Kein gesonderter Titel erfasst",
        Array.isArray(editorial.introduction) ? `${editorial.introduction.length} Textblöcke` : "In den bisherigen Textabschnitten",
        `${editorial.sections.length} Abschnitte`, sources ? `${sources} Quellenverweise` : "Keine getrennten Quellen erfasst",
        `${editorial.gallery.length} Bilder${editorial.galleryRequested === false ? " · Galerie nicht vorgesehen" : ""}`];
    }
    function renderPageConflict(parent) {
      if (!view.sync?.localConflict) return;
      const section = make("section", undefined, "page-authoring-reader");
      section.append(make("h3", "Seitenkonflikt prüfen"), button("Seitenfassungen vergleichen", () => work(async bound => {
        if (dirty()) { message("Bitte die eigenen Eingaben vor dem Vergleich speichern."); return; }
        const expectedRevision = view.draft.revision, expectedBindingRevision = view.sync.bindingRevision;
        const result = await request(`${BASE}/drafts/${encodeURIComponent(view.draft.id)}/conflict-preview`, { method: "POST", body: JSON.stringify({
          sourceScope: session.sourceScope, draftId: view.draft.id, expectedRevision, expectedBindingRevision,
        }) }, bound);
        if (result?.draftId !== view.draft.id || result.localRevision !== expectedRevision || result.bindingRevision !== expectedBindingRevision
          || ![result.localDocument, result.serverDocument].every(document => document?.slug === session.slug
            && Array.isArray(document.sections) && Array.isArray(document.images))) throw new Error("Der Seitenvergleich gehört nicht zur aktuellen Fassung.");
        conflictReview = result; renderEditor(); message("Beide Seitenfassungen sind zum Vergleich geladen.");
      })));
      const panel = make("div"); panel.setAttribute("data-section", "page-conflict-review"); section.append(panel); parent.append(section);
      const shown = conflictReview;
      if (!shown) return;
      const texts = details("Texte und Bildbeschriftungen vergleichen", "page-conflict-texts"); texts.node.open = true;
      texts.content.className = "page-authoring-reader-columns";
      for (const [label, document] of [["Eigene gespeicherte Fassung", shown.localDocument], ["Aktuelle gemeinsame Fassung", shown.serverDocument]]) {
        const column = make("div");
        const editorial = { ...document, gallery: document.images, sections: document.sections.map(item => ({ ...item,
          intentionallyEmpty: Boolean(document.emptyConfirmations?.[item.id]) })) };
        readerTexts(column, editorial, label); column.append(make("p", `Website-Zielbereich ${document.parentPath}`));
        readerImages(column, editorial, "Bilder in Seitenreihenfolge"); texts.content.append(column);
      }
      panel.append(texts.node);
      if (shown.queueOpen) {
        panel.append(make("p", "Bitte den offenen Konflikt zuerst unter „Gemeinsames Projekt“ entscheiden und danach die Fassungen erneut vergleichen."));
        return;
      }
      panel.append(button("Gemeinsame Fassung als neuen lokalen Entwurf übernehmen", () => work(async bound => {
        const stillShown = () => conflictReview === shown && !dirty() && view.draft.revision === shown.localRevision
          && view.sync.bindingRevision === shown.bindingRevision && view.sync.localConflict;
        if (!stillShown() || typeof confirmAction !== "function") return;
        const accepted = await confirmAction({ title: "Gemeinsame Fassung lokal übernehmen?",
          message: "Die angezeigte gemeinsame Fassung wird ein neuer lokaler Entwurf. Deine bisherige Fassung bleibt im Verlauf erhalten.",
          confirmLabel: "Als neuen lokalen Entwurf übernehmen" });
        requireCurrent(bound);
        if (!accepted || !stillShown()) return;
        const next = await post("conflict-adopt", { expectedBindingRevision: shown.bindingRevision, serverRevision: shown.serverRevision,
          serverDataHash: shown.serverDataHash, confirmed: true }, bound);
        requireCurrent(bound); accept(next); clearPreview(); renderEditor(); message("Gemeinsame Fassung als neuen lokalen Entwurf übernommen.");
      })));
    }
    function renderReaderPreview(parent) {
      const panel = make("section", undefined, "page-authoring-reader"); panel.setAttribute("data-section", "reader-preview"); panel.hidden = !readerPreview && !readerOutcome; parent.append(panel);
      if (readerOutcome) {
        panel.append(make("h3", "Artentwurf vorgemerkt"), make("p", "Die geprüfte Fassung ist vorgemerkt – noch abgleichen."),
          make("p", "Die Änderungen bitte im gemeinsamen Artbestand abgleichen und dort separat für die Leserfassung freigeben. Die Websiteveröffentlichung erfolgt als eigener Schritt.", "page-authoring-small"));
        if (readerOutcome.localPageChanged) panel.append(make("p", "Inzwischen liegen neue Seiteneingaben vor. Bitte diese vor einer weiteren Übernahme erneut laden und prüfen. Die geprüfte Fassung bleibt vorgemerkt.", "page-authoring-notice"));
        return;
      }
      if (!readerPreview) return;
      panel.append(make("h3", "Übernahme in den Artbestand prüfen"), make("p", "Die redaktionellen Inhalte werden als neuer Artentwurf vorgemerkt. Anschließend folgen der Abgleich und eine separate Freigabe für die Leserfassung.", "page-authoring-small"));
      const table = make("table", undefined, "page-authoring-reader-summary"), head = make("tr");
      for (const label of ["Bereich", "Bisheriger Artbestand", "Nach Übernahme"]) head.append(make("th", label)); table.append(head);
      const before = readerSummary(readerPreview.before), after = readerSummary(readerPreview.after);
      ["Titel", "Einleitung", "Abschnitte", "Quellen", "Bilder und Reihenfolge"].forEach((label, index) => {
        const row = make("tr"); row.append(make("th", label), make("td", before[index]), make("td", after[index])); table.append(row);
      }); panel.append(table);
      const texts = details("Texte und Quellen vergleichen", "reader-texts"), images = details("Bildtexte und Reihenfolge vergleichen", "reader-images");
      texts.content.className = "page-authoring-reader-columns"; images.content.className = "page-authoring-reader-columns";
      readerTexts(texts.content, readerPreview.before, "Bisheriger Artbestand"); readerTexts(texts.content, readerPreview.after, "Nach Übernahme");
      readerImages(images.content, readerPreview.before, "Bisheriger Artbestand"); readerImages(images.content, readerPreview.after, "Nach Übernahme"); panel.append(texts.node, images.node);
      const actions = make("div", undefined, "page-authoring-inline");
      const confirm = button("Als Artentwurf übernehmen", () => work(async (bound) => {
        const shown = readerPreview;
        if (!shown || !readerCurrent(shown.binding) || !(Date.parse(shown.expiresAt) > Date.now())) { clearReaderPreview(); renderEditor(); message("Bitte die aktuelle Übernahmevorschau erneut öffnen."); return; }
        clearReaderPreview();
        const next = await request(`${BASE}/drafts/${encodeURIComponent(view.draft.id)}/reader-adopt`, { method: "POST", body: JSON.stringify({ sourceScope: session.sourceScope, token: shown.token }) }, bound);
        requireReaderCurrent(shown.binding);
        if (next?.sourceScope !== session.sourceScope || next.draftId !== view.draft.id || next.queued !== true || !idPattern.test(next.changeId || "")
          || next.speciesId !== session.slug || next.readerApproved !== false || next.externalPublication !== "not-performed") throw new Error("Die Vormerkung der Artfassung wurde nicht eindeutig bestätigt.");
        readerOutcome = { changeId: next.changeId, speciesId: next.speciesId, localPageChanged: next.localPageChanged === true }; renderEditor();
        message(next.localPageChanged === true ? "Die geprüfte Fassung ist vorgemerkt – noch abgleichen. Neue Seiteneingaben bitte vor einer weiteren Übernahme erneut prüfen."
          : "Als Artentwurf vorgemerkt – noch abgleichen. Leserfreigabe und Websiteveröffentlichung erfolgen separat.");
      })); confirm.setAttribute("data-action", "reader-adopt");
      actions.append(confirm, button("Vorschau schließen", () => { clearReaderPreview(); renderEditor(); message("Übernahmevorschau geschlossen. Es wurde kein Artentwurf vorgemerkt."); })); panel.append(actions);
    }
    function renderImages(parent) {
      const section = make("section", undefined, "page-authoring-section"); section.append(make("h3", "Bilder"));
      section.append(checkbox("Bildergalerie vorsehen", model.galleryRequested, (checked) => { model.galleryRequested = checked; }));
      model.images.forEach((image, index) => {
        const card = make("article", undefined, "page-authoring-image"), figure = make("div", undefined, "page-authoring-image-view");
        const meta = metadata.get(image.assetId);
        const placeholder = () => { figure.replaceChildren(make("p", "Dieses Bild ist auf diesem Gerät noch nicht verfügbar."),
          button("Bild vom Projekt laden", () => work(async (bound) => {
            const next = await request(`${BASE}/images/${encodeURIComponent(image.assetId)}/download`, { method: "POST", body: JSON.stringify({ sourceScope: session.sourceScope }) }, bound);
            requireCurrent(bound); const value = imageResult(next, image.assetId);
            if (value.localAvailable !== true) throw new Error("Der Bilddownload ist nicht bestätigt.");
            metadata.set(image.assetId, value); message("Bild auf dieses Gerät geladen."); renderEditor();
          }))); };
        if (meta?.localAvailable === true) {
          const img = make("img"); img.alt = image.alt || `Bild ${index + 1}`; img.loading = "lazy";
          img.addEventListener("error", () => { img.removeAttribute("src"); if (sameSession()) { metadata.set(image.assetId, { ...meta, localAvailable: false }); placeholder(); updateActions(); } });
          img.src = `${BASE}/images/${encodeURIComponent(image.assetId)}?scope=${encodeURIComponent(session.sourceScope)}`; figure.append(img);
        } else placeholder();
        const fields = make("div", undefined, "page-authoring-stack"); fields.append(make("h4", `Bild ${index + 1}`),
          field(`Alternativtext Bild ${index + 1}`, image.alt, (value) => { image.alt = value; }, { type: "textarea", maxLength: 3000, languageContext: "caption" }),
          field(`Bildunterschrift Bild ${index + 1}`, image.caption, (value) => { image.caption = value; }, { type: "textarea", maxLength: 3000, languageContext: "caption" }),
          checkbox(`Bild ${index + 1} ist bewusst dekorativ`, image.decorative, (checked) => { image.decorative = checked; }));
        if (image.decorative && image.alt) fields.append(make("p", "Bei einem dekorativen Bild den Alternativtext bewusst leeren oder die Bildrolle ändern.", "page-authoring-notice"));
        const ai = imageAiAction(image); if (ai) fields.append(ai);
        const actions = make("div", undefined, "page-authoring-inline"); actions.append(
          button("Bild nach oben", () => { if (index > 0 && edited()) { [model.images[index - 1], model.images[index]] = [model.images[index], model.images[index - 1]]; renderEditor(); } }, { disabled: index === 0 }),
          button("Bild nach unten", () => { if (index < model.images.length - 1 && edited()) { [model.images[index + 1], model.images[index]] = [model.images[index], model.images[index + 1]]; renderEditor(); } }, { disabled: index === model.images.length - 1 }),
          button("Bild aus Entwurf entfernen", () => { if (edited()) { model.images.splice(index, 1); renderEditor(); } }));
        fields.append(actions); card.append(figure, fields); section.append(card);
      });
      const importPanel = details("Bilder hinzufügen", "image-import"), attribution = make("textarea"), files = make("input");
      attribution.rows = 2; attribution.maxLength = 8000; attribution.spellcheck = true; attribution.lang = "de"; attribution.setAttribute("aria-label", "Bildquelle für neue Bilder");
      attribution.value = imageAttribution; attribution.addEventListener("input", () => { if (sameSession() && !busy) imageAttribution = attribution.value; });
      files.type = "file"; files.multiple = true; files.accept = "image/jpeg,image/png,image/webp"; files.setAttribute("aria-label", "Bilddateien auswählen");
      controls.push(attribution, files); importPanel.content.append(make("p", "JPEG, PNG oder WebP · bis 20 MB je Bild. Dateien werden einzeln geprüft."), make("label", "Bildquelle / Urheber (optional)"), attribution, files);
      files.addEventListener("change", () => {
        const selected = Array.from(files.files || []), credit = attribution.value;
        if (!selected.length || !sameSession() || busy) return;
        void work(async (bound) => {
          for (const file of selected) {
            requireCurrent(bound);
            if (model.images.length >= 200) throw new Error("Die Bildauswahl dieser Seite ist vollständig belegt.");
            if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error("Die Bilddatei ist leer oder zu groß.");
            const dataBase64 = await fileBase64(file); requireCurrent(bound);
            const response = await request(`${BASE}/images/import`, { method: "POST", body: JSON.stringify({ sourceScope: session.sourceScope, dataBase64, attribution: credit }) }, bound);
            requireCurrent(bound); const image = imageResult(response);
            if (image.localAvailable !== true) throw new Error("Die Bildaufnahme wurde nicht bestätigt.");
            metadata.set(image.id, { ...image, localAvailable: true }); model.images.push({ id: createId(), assetId: image.id, alt: "", caption: "", decorative: false });
            changedVersion++; clearPreview(); renderEditor(); message(`${file.name || "Bild"} hinzugefügt. Neue Bilder bitte beschreiben.`);
          }
        });
      });
      section.append(importPanel.node); parent.append(section);
    }
    async function fileBase64(file) {
      if (encodeFile) return encodeFile(file);
      const buffer = new Uint8Array(await file.arrayBuffer()); let binary = "";
      for (let index = 0; index < buffer.length; index += 32768) binary += String.fromCharCode(...buffer.subarray(index, index + 32768));
      return global.btoa(binary);
    }
    function imageResult(result, expectedId) {
      if (result?.sourceScope !== session.sourceScope || !idPattern.test(result.image?.id || "") || expectedId && result.image.id !== expectedId)
        throw new Error("Die Bildantwort ist nicht eindeutig an dieses Projekt und Bild gebunden.");
      return result.image;
    }
    function renderEditor() {
      clearAiActions();
      for (const node of body.querySelectorAll?.("details") || []) {
        const key = node.getAttribute("data-editor-group"); if (node.open) expanded.add(key); else expanded.delete(key);
      }
      const scrollTop = body.scrollTop; release(); body.replaceChildren(); controls = []; body.hidden = suspended;
      if (suspended) { updateActions(); return; }
      heading.textContent = `${session.name} · Artseite`;
      if (!listReady || !view?.draft || !model) { renderSelection(); updateActions(); body.scrollTop = scrollTop; return; }
      const top = make("div", undefined, "page-authoring-toolbar");
      top.append(button("Speichern und Vorschau prüfen", () => work(makePreview), { className: "primary" }));
      const readerStart = button("In Artbestand übernehmen", () => work(makeReaderPreview)); readerStart.setAttribute("data-action", "reader-preview"); top.append(readerStart);
      const more = details("Weitere Aktionen", "actions");
      more.content.append(button("Entwurf speichern", () => work(async (bound) => { await save(bound); requireCurrent(bound); message("Entwurf gespeichert. Websiteveröffentlichung erfolgt separat."); })),
        button("Gespeicherten Entwurf neu laden", () => work(async (bound) => {
          if (dirty()) {
            if (typeof confirmAction !== "function") { message("Bitte offene Eingaben zuerst speichern. Ungespeicherte Eingaben werden nicht ersetzt."); return; }
            const confirmed = await confirmAction({ title: "Gespeicherten Entwurf neu laden?", message: "Die ungespeicherten Eingaben dieser Artseite werden durch den zuletzt gespeicherten Entwurf ersetzt.", confirmLabel: "Gespeicherten Entwurf laden", cancelLabel: "Eingaben behalten" });
            requireCurrent(bound); if (!confirmed) return;
          }
          const next = await request(`${BASE}/drafts/${encodeURIComponent(view.draft.id)}`, undefined, bound); requireCurrent(bound); accept(next); clearPreview();
          renderEditor(); message("Zuletzt gespeicherten Entwurf auf diesem Gerät geladen."); await loadImageMetadata(bound);
        })),
        button("Mit gemeinsamem Projekt abgleichen", () => work(async (bound) => {
          await save(bound); requireCurrent(bound); const next = await post("sync", { expectedBindingRevision: view.sync?.bindingRevision ?? null }, bound);
          requireCurrent(bound); accept(next); clearPreview(); renderEditor(); syncMessage();
        })),
        button("Gemeinsamen Stand neu einlesen", () => work(async (bound) => {
          if (dirty()) { message("Bitte eigene Eingaben zuerst speichern. Beim Einlesen werden keine offenen Eingaben ersetzt."); return; }
          const next = await post("refresh", { expectedBindingRevision: view.sync?.bindingRevision ?? null }, bound); requireCurrent(bound); accept(next); clearPreview(); renderEditor(); message("Gemeinsamen Entwurf eingelesen.");
        })),
        button("Artgrundlage aktualisieren", () => work(async (bound) => { await save(bound); requireCurrent(bound); const next = await post("refresh-species", {}, bound); requireCurrent(bound); accept(next); clearPreview(); renderEditor(); message("Artgrundlage aktualisiert. Bitte die neue Vorschau prüfen."); })));
      const cms = details("Website-Vorbereitung"); cms.content.append(make("p", info?.cmsAvailable === true
        ? "Die freigegebene Fassung kann als unveröffentlichter Squarespace-Entwurf vorbereitet werden."
        : "Die automatische Neuanlage in Squarespace ist noch nicht verfügbar. Ein Plan veröffentlicht keine Seite."));
      if (view.cms) {
        const cmsStates = { prepared: "Auftrag vorbereitet · noch kein bestätigter Schreibbeginn", dispatched: "Übernahme begonnen · Ausgang noch ungeklärt",
          "saved-unpublished": view.cms.receipt?.schemaVersion === 2 ? "Unveröffentlichter Squarespace-Entwurf gespeichert und erneut geprüft"
            : "Historischer Speicherbeleg · vollständige Rückleseprüfung noch nicht vorhanden", uncertain: "Ausgang ungeklärt · vor einem weiteren Schreiben gezielt prüfen",
          failed: "Übernahme fehlgeschlagen · gespeicherten Ausgang prüfen" };
        const note = cmsOutcomeNote(view.cms);
        const hint = canReplacePreparedCms(view.cms) ? " Die aktuelle Fassung kann den vorbereiteten Auftrag ersetzen."
          : note ? "" : " Es wird keine weitere Seite automatisch angelegt.";
        cms.content.append(make("p", `${cmsStates[view.cms.status] || "Websiteauftrag noch nicht bestätigt"}${view.cms.matchesCurrentRevision === true
          ? "" : " · gehört zu einer früheren Seitenfassung"}.${hint}`, "page-authoring-small"));
        if (note) cms.content.append(make("p", note, "page-authoring-notice"));
      }
      if (info?.cmsAvailable === true) {
        const createCms = button("Unveröffentlicht in Squarespace anlegen", () => work(createCmsPage));
        createCms.setAttribute("data-action", "cms-create"); cms.content.append(createCms);
      }
      if (view.cms?.canRecheckSave === true) {
        const shown = view;
        const recheck = button("Entwurf in Squarespace prüfen", () => work(bound => recheckCmsSave(shown, bound)));
        recheck.setAttribute("data-action", "cms-recheck");
        recheck.title = "Liest den gespeicherten Entwurf und vergleicht ihn mit der freigegebenen Fassung.";
        cms.content.append(recheck);
      }
      const plan = button("CMS-Plan vorbereiten", () => work(async (bound) => {
        if (dirty() || !view.approval?.id) return; const next = await post("prepare-cms-plan", { approvalId: view.approval.id }, bound);
        requireCurrent(bound); message(next.artifact ? "Interner Plan vorbereitet. Auf der Website wurde nichts angelegt oder veröffentlicht." : "Website-Vorbereitung wurde nicht bestätigt.");
      })); plan.setAttribute("data-action", "cms-plan"); cms.content.append(plan); more.content.append(cms.node);
      top.append(more.node); body.append(top);
      const progress = make("p", dirty() ? "Ungespeicherte Eingaben" : view.approval ? "Intern freigegebene Fassung · Websiteveröffentlichung separat" : "Gespeicherter Entwurf · noch nicht intern freigegeben", "page-authoring-small");
      progress.setAttribute("data-section", "save-state"); body.append(progress);
      renderPageConflict(body);
      renderReaderPreview(body);
      if (provenMissing) body.append(button("Gemeinsame Erstellung bestätigen", () => work(async (bound) => {
        if (!provenMissing || dirty()) return; provenMissing = false;
        const next = await post("sync", { expectedBindingRevision: view.sync?.bindingRevision ?? null, confirmedCreate: true }, bound);
        requireCurrent(bound); accept(next); renderEditor(); syncMessage();
      })));
      const settings = details("Seitentitel und Zielbereich", "settings"); settings.content.append(make("p", `Gebundene Art: ${session.name}`),
        field("Seitentitel", model.title, (value) => { model.title = value; }, { type: "textarea", rows: 1, languageContext: "heading" }), field("Website-Zielbereich", model.parentPath, (value) => { model.parentPath = value; }, { maxLength: 200 }),
        make("p", `Vorlage: ${templateName(model.templateId)}`, "page-authoring-small")); body.append(settings.node);
      const intro = details(`Einleitung (${model.introduction.length} Textblöcke)`, "introduction"); addBlocks(intro.content, model.introduction, "Einleitung");
      body.append(intro.node);
      for (const section of model.sections) {
        const stored = view.draft.document.sections.find((item) => item.id === section.id), panel = details(section.title, `section:${section.id}`);
        panel.content.append(field(`Überschrift ${section.id}`, section.title, (value) => { section.title = value; }, { type: "textarea", rows: 1, languageContext: "heading" }));
        if (stored?.kind !== "editorial") panel.content.append(make("p", stored?.kind === "map-module" ? "Die Verbreitungskarte bleibt an die Artgrundlage gebunden." : "Die Artgrunddaten bleiben an die Artgrundlage gebunden.", "page-authoring-small"));
        addBlocks(panel.content, section.blocks, section.title); addSources(panel.content, section.sources, "Abschnittsquellen", `sources:${section.id}`);
        const ai = sectionAiActions(section, stored); if (ai) panel.content.append(ai);
        if (stored?.kind === "editorial" && !hasText(section.blocks)) {
          const confirmed = Boolean(view.draft.document.emptyConfirmations?.[section.id]) && stored.title === section.title && JSON.stringify(stored.blocks) === JSON.stringify(section.blocks);
          panel.content.append(make("p", confirmed ? "Bewusst leer · bestätigt" : "Text fehlt. Diesen Abschnitt nur nach bewusster Entscheidung leer lassen.", "page-authoring-notice"));
          if (!confirmed) panel.content.append(button(`„${section.title}“ bewusst leer lassen`, () => work(async (bound) => {
            await save(bound); requireCurrent(bound);
            const next = await post("confirm-empty", { sectionId: section.id, confirmed: true, reason: "Im Artseiteneditor ausdrücklich als bewusst leer bestätigt" }, bound);
            requireCurrent(bound); accept(next); clearPreview(); renderEditor(); message(`„${section.title}“ bleibt bewusst leer.`);
          })));
        }
        body.append(panel.node);
      }
      addSources(body, model.sources, "Weitere Seitenquellen"); renderImages(body); renderPreview(body); updateActions(); body.scrollTop = scrollTop;
    }
    function templateName(id) { const template = info?.templates?.find((item) => item.id === id); return template?.name || template?.label || (template?.sections?.length > 8 ? "Erweiterte FN-Gliederung" : "Kompakte FN-Gliederung"); }
    function syncMessage() {
      message(view.sync?.state === "synced" && !view.sync.localPending ? "Entwurf im gemeinsamen Projekt bestätigt. Auf der Website wurde nichts veröffentlicht."
        : view.sync?.localConflict ? "Gemeinsamer Abgleich mit Konflikt. Beide Fassungen bleiben erhalten."
          : "Lokal gespeichert. Der gemeinsame Abgleich ist noch nicht bestätigt.");
    }
    function renderSelection() {
      if (!listReady) {
        body.append(make("p", "Die vorhandenen Artseitenentwürfe konnten noch nicht vollständig geladen werden."),
          button("Entwürfe erneut laden", () => open({ id: session.speciesId, slug: session.slug, germanName: session.name, sourceScope: session.sourceScope })));
        return;
      }
      if (pendingCreate) {
        body.append(make("p", "Der Anlegeversuch wurde nicht eindeutig bestätigt. Bitte zuerst denselben Entwurf prüfen; es wird kein zweiter Entwurf automatisch angelegt."),
          button("Angelegten Entwurf prüfen", () => work(async (bound) => {
            let next;
            try { next = await request(`${BASE}/drafts/${encodeURIComponent(pendingCreate.input.draftId)}`, undefined, bound); }
            catch (error) {
              requireCurrent(bound);
              if (error?.status === 404 || error?.statusCode === 404 || error?.code === "draft_not_found") {
                pendingCreate.missing = true; renderEditor(); message("Dieser Anlegeversuch ist auf dem Gerät nicht vorhanden. Eine erneute Anlage muss bewusst bestätigt werden."); return;
              }
              throw error;
            }
            requireCurrent(bound);
            if (!next.draft && !next.remoteOnly && next.sourceScope === session.sourceScope) {
              pendingCreate.missing = true; renderEditor(); message("Dieser Anlegeversuch ist auf dem Gerät nicht vorhanden. Eine erneute Anlage muss bewusst bestätigt werden."); return;
            }
            accept(next); pendingCreate = null; message("Den vorhandenen Entwurf des Anlegeversuchs eingelesen."); renderEditor(); await loadImageMetadata(bound);
          })));
        if (pendingCreate.missing) body.append(button("Neuanlage ausdrücklich bestätigen", () => work(async (bound) => {
          if (!pendingCreate?.missing) return;
          const next = await request(`${BASE}/drafts`, { method: "POST", body: JSON.stringify(pendingCreate.input) }, bound);
          requireCurrent(bound); accept(next); pendingCreate = null; message("Artseitenentwurf bestätigt angelegt."); renderEditor();
        }), { disabled: info?.permissions?.canCreate !== true || state.workspaceStatus?.permissions?.canCreate !== true }));
        return;
      }
      if (view?.remoteOnly) {
        const offline = state.workspaceStatus?.connection === "offline";
        const cached = view.remoteOnly.object?.revision;
        const canOpenCached = idPattern.test(cached || "") && view.remoteOnly.evidence?.trusted === true
          && !view.remoteOnly.localPending && !view.remoteOnly.localConflict;
        const description = !offline ? "Für diese Art liegt ein gemeinsamer Entwurf vor. Er wird erst nach deiner Auswahl auf dieses Gerät eingelesen."
          : canOpenCached ? "Der zuletzt geladene Stand liegt auf diesem PC. Du kannst ihn bearbeiten und später mit dem Projekt abgleichen."
            : "Für diesen Entwurf fehlt ein eindeutig bestätigter Stand auf diesem PC. Bitte mit dem Projekt verbinden und erneut öffnen.";
        body.append(make("p", description),
          button(offline ? "Zuletzt geladenen Entwurf öffnen" : "Gemeinsamen Entwurf einlesen", () => work(async (bound) => {
            const id = view.remoteOnly.draftId || view.remoteOnly.data?.pageId || view.remoteOnly.object?.data?.pageId || session.remoteId;
            const next = await request(`${BASE}/drafts/${encodeURIComponent(id)}/refresh`, { method: "POST", body: JSON.stringify({ sourceScope: session.sourceScope,
              draftId: id, mutationId: createId(), expectedBindingRevision: null, ...(offline ? { expectedCachedRevision: cached } : {}) }) }, bound);
            requireCurrent(bound); accept(next);
            if (offline) message("Zuletzt geladenen Entwurf geöffnet. Änderungen werden auf diesem PC gespeichert.");
            renderEditor(); await loadImageMetadata(bound);
          }), { disabled: offline && !canOpenCached })); return;
      }
      if (candidates.length) {
        body.append(make("p", "Für diese Art sind mehrere Entwürfe vorhanden. Bitte einen auswählen."));
        for (const candidate of candidates) body.append(button(candidate.title || "Artseitenentwurf", () => work(async (bound) => {
          session.remoteId = candidate.id; const next = await request(`${BASE}/drafts/${encodeURIComponent(candidate.id)}`, undefined, bound); requireCurrent(bound); accept(next); candidates = []; renderEditor(); await loadImageMetadata(bound);
        }))); return;
      }
      body.append(make("p", "Für diese Art wurde noch kein Entwurf im geladenen Projektbestand gefunden."));
      if (!createValues) createValues = { templateId: "", parentPath: "", title: session.name };
      const label = make("label", undefined, "page-authoring-field"), select = make("select"); label.append(make("span", "FN-Seitenvorlage")); select.setAttribute("aria-label", "FN-Seitenvorlage");
      const empty = make("option", "Bitte Vorlage wählen"); empty.value = ""; select.append(empty);
      for (const template of info?.templates || []) { const option = make("option", templateName(template.id)); option.value = template.id; select.append(option); }
      select.value = createValues.templateId; select.addEventListener("change", () => { if (!sameSession() || busy) return; createValues.templateId = select.value; }); controls.push(select); label.append(select);
      body.append(label, field("Neuer Seitentitel", createValues.title, (value) => { createValues.title = value; }, { type: "textarea", rows: 1, languageContext: "heading" }), field("Neuer Website-Zielbereich", createValues.parentPath, (value) => { createValues.parentPath = value; }, { maxLength: 200 }),
        make("p", "Den vorhandenen Wildlife-Bereich als Pfad eingeben, zum Beispiel /wildlife/heimische-tierwelt.", "page-authoring-small"),
        button("Artseitenentwurf anlegen", () => work(async (bound) => {
          if (!info.templates.some((item) => item.id === createValues.templateId) || !/^\/wildlife\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(createValues.parentPath) || !createValues.title.trim()) {
            message("Bitte Vorlage, Titel und vorhandenen Website-Zielbereich bewusst auswählen."); return;
          }
          const newId = createId(); session.remoteId = newId;
          pendingCreate = { missing: false, input: { sourceScope: session.sourceScope, draftId: newId, mutationId: createId(),
            templateId: createValues.templateId, slug: session.slug, parentPath: createValues.parentPath, title: createValues.title } };
          const next = await request(`${BASE}/drafts`, { method: "POST", body: JSON.stringify(pendingCreate.input) }, bound);
          requireCurrent(bound); accept(next); pendingCreate = null; message("Artseitenentwurf angelegt. Texte und Bilder können jetzt ergänzt werden."); renderEditor();
        }), { disabled: info?.permissions?.canCreate !== true || state.workspaceStatus?.permissions?.canCreate !== true }));
    }
    async function loadImageMetadata(bound) {
      for (const image of model?.images || []) {
        requireCurrent(bound); if (metadata.has(image.assetId)) continue;
        try { const next = await request(`${BASE}/images/${encodeURIComponent(image.assetId)}/metadata?scope=${encodeURIComponent(session.sourceScope)}`, undefined, bound); requireCurrent(bound); metadata.set(image.assetId, imageResult(next, image.assetId)); }
        catch (error) { requireCurrent(bound); metadata.set(image.assetId, { localAvailable: false }); }
      }
      requireCurrent(bound); renderEditor();
    }
    async function open(species) {
      const slug = species?.slug || species?.id;
      if (busy || state.workspace !== "shared-project" || !state.editMode || state.workspaceStatus?.permissions?.canEdit !== true
        || !species?.sourceScope || species.sourceScope !== scope() || state.selectedId !== species.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) return false;
      const key = `${scope()}:${species.id}`;
      if (opened && session?.key !== key && (dirty() || creationDirty())) { message("Bitte die aktuelle Bearbeitung zuerst bewusst schließen. Eingaben bleiben erhalten."); return false; }
      if (session?.key !== key && (dirty() || creationDirty())) remember();
      if (session?.key !== key) { model = null; view = null; baseline = ""; createValues = null; imageAttribution = ""; pendingCreate = null; metadata.clear(); }
      session = { key, identity: identityKey(), speciesId: species.id, slug, name: species.germanName || species.scientificName || slug, sourceScope: scope(), remoteId: null };
      authority = authorityKey(); suspended = false; opened = true; generation++; listReady = false; clearPreview(); readerOutcome = null; body.hidden = false;
      if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal(); else dialog.setAttribute("open", "");
      clearAiActions(); body.replaceChildren(); controls = []; message("Artseitenentwürfe werden geladen…");
      return work(async (bound) => {
        info = await request(BASE, undefined, bound); requireCurrent(bound);
        if (info.sourceScope !== session.sourceScope || info.available !== true || info.permissions?.canEdit !== true || !Array.isArray(info.templates)) throw new Error("Der Artseitenbereich ist nicht verfügbar.");
        const list = await request(`${BASE}/drafts`, undefined, bound); requireCurrent(bound);
        if (list.sourceScope !== session.sourceScope || !Array.isArray(list.drafts) || !Array.isArray(list.remoteDrafts)) throw new Error("Die Entwurfsliste ist nicht bestätigt.");
        listReady = true;
        const local = (list.drafts || []).filter((item) => item.draft?.document?.slug === slug).map((item) => ({ id: item.draft.id, title: item.draft.document.title }));
        const remote = (list.remoteDrafts || []).filter((item) => item.slug === slug).map((item) => ({ id: item.draftId, title: item.title }));
        candidates = [...local, ...remote];
        const retained = dirty() && model?.slug === slug || pendingCreate ? { model, baseline, view, createValues, imageAttribution, pendingCreate } : preserved.get(key);
        if (retained) { model = retained.model ? copy(retained.model) : null; baseline = retained.baseline; view = retained.view ? copy(retained.view) : null;
          createValues = retained.createValues ? copy(retained.createValues) : null; imageAttribution = retained.imageAttribution || ""; pendingCreate = retained.pendingCreate ? copy(retained.pendingCreate) : null;
          if (pendingCreate) session.remoteId = pendingCreate.input.draftId;
          if (model) candidates = []; message("Eigene ungespeicherte Eingaben wieder geöffnet. Vor dem Abgleich bitte prüfen und speichern."); }
        else if (candidates.length === 1) {
          session.remoteId = candidates[0].id; const next = await request(`${BASE}/drafts/${encodeURIComponent(candidates[0].id)}`, undefined, bound); requireCurrent(bound); accept(next); candidates = []; message("");
        } else { model = null; view = null; message(""); }
        renderEditor(); await loadImageMetadata(bound); requireCurrent(bound);
      });
    }
    function creationDirty() { return Boolean(pendingCreate || !model && createValues && (createValues.templateId || createValues.parentPath || createValues.title !== session?.name)); }
    function remember() { if (session) preserved.set(session.key, { model: model ? copy(model) : null, baseline, view: view ? copy(view) : null, createValues: createValues ? copy(createValues) : null, imageAttribution, pendingCreate: pendingCreate ? copy(pendingCreate) : null }); }
    async function close() {
      if (!opened || busy || pendingClose) return false;
      const closingSession = session, boundGeneration = generation;
      if (dirty() || creationDirty()) {
        pendingClose = true; updateActions(); let confirmed = false;
        try { if (typeof confirmAction === "function") confirmed = await confirmAction({ title: "Bearbeitung schließen?", message: "Ungespeicherte Eingaben bleiben in dieser geöffneten Explorer-Sitzung erhalten. Sie sind noch nicht dauerhaft gespeichert.", confirmLabel: "Schließen und Eingaben merken", cancelLabel: "Weiter bearbeiten" }); }
        catch { message("Das Schließen wurde nicht bestätigt. Eigene Eingaben bleiben geöffnet."); return false; }
        finally { pendingClose = false; updateActions(); }
        if (!confirmed || session !== closingSession || generation !== boundGeneration) { if (!confirmAction) message("Ungespeicherte Eingaben: bitte erst speichern oder weiter bearbeiten."); return false; }
      }
      if (dirty() || creationDirty()) remember();
      generation++; clearAiActions(); clearPreview(); readerOutcome = null; release(); opened = false;
      if (typeof dialog.close === "function" && dialog.open) dialog.close(); else dialog.removeAttribute("open"); return true;
    }
    closeButton.addEventListener("click", () => { void close(); });
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); void close(); });
    let backdropStarted = false;
    dialog.addEventListener("pointerdown", (event) => { backdropStarted = event.target === dialog; });
    dialog.addEventListener("pointercancel", () => { backdropStarted = false; });
    dialog.addEventListener("click", (event) => { if (backdropStarted && event.target === dialog) void close(); backdropStarted = false; });
    return Object.freeze({ open, stateChanged, close, hasUnsavedChanges: () => dirty() || creationDirty() || preserved.size > 0, get busy() { return busy || pendingClose; } });
  }
  global.SpeciesExplorerPageAuthoring = Object.freeze({ createPageAuthoringController });
})(globalThis);
