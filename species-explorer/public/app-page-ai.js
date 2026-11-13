(function initializePageAi(global) {
  "use strict";
  const SOURCE_URL = "/api/local-ai/page-authoring/sources";
  const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const content = (blocks) => (blocks || []).map((block) => Array.isArray(block.items) ? block.items.join("\n") : block.text || "").join("\n\n");

  const validText = (value) => typeof value === "string" && value.trim() && value.length <= 2000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
  const signature = (value) => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry);
  const sameBinding = (left, right) => left && right && signature(left) === signature(right);
  const usable = (binding) => binding && typeof binding.sourceScope === "string" && binding.sourceScope && ID.test(binding.draftId || "")
    && typeof binding.expectedRevision === "string" && binding.expectedRevision && Number.isSafeInteger(binding.localGeneration) && binding.localGeneration >= 0
    && binding.saved === true && binding.canEdit === true && binding.busy !== true;

  /** Only editor actions: the existing injected controller owns dialogs, jobs and proposal review. */
  function createPageAiActions({ documentRef = global.document, fetchJson, openSuggestion, notice = () => {} } = {}) {
    if (!documentRef?.createElement || typeof fetchJson !== "function" || typeof openSuggestion !== "function" || typeof notice !== "function")
      throw new TypeError("Die Artseitenhilfe benötigt Oberfläche, Projektzugriff und den vorhandenen Vorschlagsdialog.");
    let disposed = false;
    const removers = [], refreshers = new Set();
    const make = (tag, text, className) => { const node = documentRef.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    function listen(node, event, handler) { node.addEventListener(event, handler); removers.push(() => node.removeEventListener?.(event, handler)); }
    function button(label) { const node = make("button", label); node.type = "button"; return node; }
    function validateContext(context, getter, callback, key) {
      if (!context || !ID.test(context[key] || "") || typeof context.getBinding !== "function" || typeof context.isCurrent !== "function"
        || typeof context[getter] !== "function" || typeof context[callback] !== "function") throw new TypeError("Die Hilfe benötigt einen konkreten aktuellen Redaktionsanschluss.");
    }
    function capture(context, getter) {
      try { return { binding: copy(context.getBinding()), target: copy(context[getter]()) }; } catch { return null; }
    }
    function sameNow(context, getter, bound) {
      const fresh = capture(context, getter);
      return !disposed && usable(fresh?.binding) && sameBinding(bound?.binding, fresh.binding) && signature(fresh.target) === signature(bound.target);
    }
    async function current(context, getter, bound) {
      if (!sameNow(context, getter, bound)) return false;
      try { return await context.isCurrent(copy(bound.binding)) === true && sameNow(context, getter, bound); } catch { return false; }
    }
    function explain(context) {
      if (disposed) return;
      let binding; try { binding = context.getBinding(); } catch { /* generic notice */ }
      notice(binding?.canEdit !== true ? "Die lokale Hilfe benötigt aktuelle Bearbeitungsrechte."
        : binding?.saved !== true ? "Bitte deine Eingaben zuerst speichern. Danach kannst du einen Vorschlag anfordern."
          : "Der Entwurf oder die Auswahl wurde geändert. Bitte die lokale Hilfe erneut öffnen.");
    }
    const baseRequest = (binding) => ({ type: "page-authoring", sourceScope: binding.sourceScope, draftId: binding.draftId, expectedRevision: binding.expectedRevision });

    function createImageAction(context) {
      validateContext(context, "getImage", "applyImageText", "imageId");
      const node = button("Alternativtext vorschlagen"); let busy = false;
      function allowed(bound) { return usable(bound?.binding) && bound.target && bound.target.decorative !== true && typeof bound.target.alt === "string" && typeof bound.target.previewUrl === "string" && bound.target.previewUrl; }
      function render() { const bound = capture(context, "getImage"); node.disabled = disposed || busy || !allowed(bound); node.title = bound?.binding?.saved === false ? "Bitte deine Eingaben zuerst speichern." : "Vorschlag für dieses konkrete Bild prüfen"; }
      listen(node, "click", async () => {
        if (disposed || busy) return;
        const bound = capture(context, "getImage");
        if (!allowed(bound)) { explain(context); return; }
        busy = true; render(); let applied = false;
        try {
          if (!await current(context, "getImage", bound) || !sameNow(context, "getImage", bound)) { explain(context); return; }
          await openSuggestion({ kind: "alt-text", request: { ...baseRequest(bound.binding), imageId: context.imageId },
            previewUrl: bound.target.previewUrl, initialText: bound.target.alt,
            context: { title: context.title || "Artseite", imageId: context.imageId },
            isCurrent: () => current(context, "getImage", bound),
            async applyProposal(text) {
              if (applied || !validText(text) || !await current(context, "getImage", bound) || !sameNow(context, "getImage", bound)) return false;
              applied = true;
              // Deliberately pass no caption. Mutation, dirty state and preview invalidation are one synchronous editor callback.
              const accepted = context.applyImageText(text, { imageId: context.imageId, binding: copy(bound.binding) }) === true;
              if (!accepted) applied = false; return accepted;
            } });
          if (!applied && !sameNow(context, "getImage", bound)) explain(context);
        } catch { if (sameNow(context, "getImage", bound)) notice("Der Vorschlag wurde nicht geöffnet. Dein Text bleibt erhalten; es wird nicht automatisch wiederholt."); }
        finally { busy = false; render(); }
      });
      refreshers.add(render); render(); return node;
    }

    function sourceList(value, bound, sectionId) {
      if (!value || value.sourceScope !== bound.binding.sourceScope || value.draftId !== bound.binding.draftId || value.revision !== bound.binding.expectedRevision
        || value.sectionId !== undefined && value.sectionId !== sectionId || typeof value.sourcesRevision !== "string" || !value.sourcesRevision || !Array.isArray(value.sources)) throw new Error("Unbound sources");
      const ids = new Set();
      for (const source of value.sources) {
        if (!ID.test(source?.id || "") || ids.has(source.id) || typeof source.title !== "string" || typeof source.revision !== "string" || !source.revision
          || typeof source.text !== "string" || !source.text.trim() || source.characters !== source.text.length) throw new Error("Invalid sources");
        ids.add(source.id);
      }
      return copy(value);
    }
    function sectionAllowed(section, kind) {
      return section?.kind === "editorial" && (kind === "source-text" ? section.requested === true && !content(section.blocks).trim() && section.emptyConfirmed !== true : Boolean(content(section.blocks).trim()));
    }
    function createSectionActions(context) {
      validateContext(context, "getSection", "applySectionProposal", "sectionId");
      const root = make("div", undefined, "page-authoring-stack"), load = button("Quellen auswählen"), choices = make("fieldset"), count = make("p", "Noch keine Quellen ausgewählt.", "page-authoring-small");
      const starts = make("div", undefined, "page-authoring-inline"), source = button("Text aus Quellen vorschlagen"), review = button("Text anhand Quellen prüfen");
      choices.hidden = true; starts.append(source, review); root.append(load, choices, count, starts);
      let busy = false, catalog = null, catalogBound = null, serial = 0; const selected = new Set();
      const selectedSources = () => (catalog?.sources || []).filter((item) => selected.has(item.id));
      function selectionKey() { return JSON.stringify(selectedSources().map((item) => item.id)); }
      function render() {
        const bound = capture(context, "getSection"), active = !disposed && !busy && usable(bound?.binding) && bound.target?.kind === "editorial";
        const selection = selectedSources(), characters = selection.reduce((sum, item) => sum + item.characters, content(bound?.target?.blocks).length);
        const ready = active && catalog && sameNow(context, "getSection", catalogBound) && selection.length > 0 && selection.length <= 20 && characters <= 8000;
        load.disabled = !active; source.disabled = !ready || !sectionAllowed(bound?.target, "source-text"); review.disabled = !ready || !sectionAllowed(bound?.target, "review-text");
        source.hidden = bound?.target?.kind !== "editorial"; review.hidden = source.hidden;
        for (const input of choices.querySelectorAll?.("input") || []) input.disabled = !active;
        count.textContent = catalog ? `${selection.length} Quellen ausgewählt · ${characters} von höchstens 8000 Zeichen einschließlich Abschnittstext` : "Noch keine Quellen ausgewählt.";
        load.title = bound?.binding?.saved === false ? "Bitte deine Eingaben zuerst speichern." : "Quellen bewusst für diesen Abschnitt auswählen";
      }
      listen(load, "click", async () => {
        if (disposed || busy) return;
        const bound = capture(context, "getSection");
        if (!usable(bound?.binding) || bound.target?.kind !== "editorial") { explain(context); return; }
        busy = true; serial++; catalog = null; catalogBound = null; selected.clear(); choices.replaceChildren(); choices.hidden = true; render();
        try {
          if (!await current(context, "getSection", bound) || !sameNow(context, "getSection", bound)) { explain(context); return; }
          const query = new URLSearchParams({ draftId: bound.binding.draftId, scope: bound.binding.sourceScope, revision: bound.binding.expectedRevision, sectionId: context.sectionId });
          const result = await fetchJson(`${SOURCE_URL}?${query}`);
          if (!await current(context, "getSection", bound) || !sameNow(context, "getSection", bound)) return;
          catalog = sourceList(result, bound, context.sectionId); catalogBound = bound;
          choices.append(make("legend", "Quellen für diesen Vorschlag"));
          for (const item of catalog.sources) {
            const label = make("label", undefined, "page-authoring-check"), input = make("input"); input.type = "checkbox"; input.value = item.id; input.checked = false;
            label.append(input, make("span", `${item.title || "Quelle"} (${item.characters} Zeichen)`));
            const details = make("details"); details.append(make("summary", "Quellentext ansehen"), make("p", item.text));
            listen(input, "change", () => {
              if (disposed || busy || !sameNow(context, "getSection", catalogBound)) { input.checked = false; explain(context); return; }
              if (input.checked) {
                const size = selectedSources().reduce((sum, entry) => sum + entry.characters, content(catalogBound.target.blocks).length) + item.characters;
                if (selected.size >= 20 || size > 8000) { input.checked = false; notice("Bitte höchstens 20 Quellen mit zusammen höchstens 8000 Zeichen auswählen."); return; }
                selected.add(item.id);
              } else selected.delete(item.id);
              serial++; render();
            });
            choices.append(label, details);
          }
          choices.hidden = false; load.textContent = "Quellen neu laden";
          if (!catalog.sources.length) notice("Für diesen Abschnitt sind noch keine Textquellen vorhanden.");
        } catch { if (sameNow(context, "getSection", bound)) notice("Die Quellen wurden nicht bestätigt. Dein Text bleibt erhalten; bitte die Quellen bei Bedarf erneut laden."); }
        finally { busy = false; render(); }
      });
      async function start(kind) {
        if (disposed || busy) return;
        const bound = capture(context, "getSection"), sources = selectedSources(), version = serial, chosen = selectionKey();
        if (!usable(bound?.binding) || !sectionAllowed(bound?.target, kind) || !catalog || !sameNow(context, "getSection", catalogBound) || !sources.length) { explain(context); return; }
        const stillSelected = () => version === serial && chosen === selectionKey();
        const isCurrent = async () => stillSelected() && await current(context, "getSection", bound) && stillSelected();
        busy = true; render(); let applied = false;
        try {
          if (!await isCurrent() || !sameNow(context, "getSection", bound) || !stillSelected()) return;
          await openSuggestion({ kind, request: { ...baseRequest(bound.binding), sectionId: context.sectionId, sourceIds: sources.map((item) => item.id), expectedSourcesRevision: catalog.sourcesRevision },
            initialText: kind === "review-text" ? content(bound.target.blocks) : "",
            context: { title: bound.target.title || "Artseitenabschnitt", sectionId: context.sectionId, sources: copy(sources) }, isCurrent,
            async applyProposal(proposal) {
              if (applied || !proposal || proposal.kind !== kind || proposal.status !== "proposal" || proposal.approved !== false || proposal.transferred !== false || proposal.humanReviewRequired !== true
                || !Array.isArray(proposal[kind === "source-text" ? "paragraphs" : "findings"])) return false;
              const binding = proposal.binding;
              if (binding?.type !== "page-authoring" || binding.sourceScope !== bound.binding.sourceScope || binding.documentId !== bound.binding.draftId
                || binding.sectionId !== context.sectionId || binding.revision !== bound.binding.expectedRevision
                || JSON.stringify(binding.sourceIds) !== JSON.stringify(sources.map((item) => item.id))) return false;
              if (!await isCurrent() || !sameNow(context, "getSection", bound) || !stillSelected()) return false;
              applied = true;
              const accepted = context.applySectionProposal(copy(proposal), { kind, sectionId: context.sectionId, binding: copy(bound.binding), sources: copy(sources) }) === true;
              if (!accepted) applied = false; return accepted;
            } });
          if (!applied && !sameNow(context, "getSection", bound)) explain(context);
        } catch { if (sameNow(context, "getSection", bound)) notice("Die Texthilfe wurde nicht geöffnet. Eigene Absätze bleiben erhalten; es wird nicht automatisch wiederholt."); }
        finally { busy = false; render(); }
      }
      listen(source, "click", () => start("source-text")); listen(review, "click", () => start("review-text"));
      refreshers.add(render); render(); return root;
    }
    return Object.freeze({ createImageAction, createSectionActions, refresh() { if (!disposed) for (const render of refreshers) render(); },
      dispose() { if (disposed) return; disposed = true; for (const render of refreshers) render(); refreshers.clear(); for (const remove of removers.splice(0)) remove(); } });
  }
  global.SpeciesExplorerPageAi = Object.freeze({ createPageAiActions });
})(globalThis);
