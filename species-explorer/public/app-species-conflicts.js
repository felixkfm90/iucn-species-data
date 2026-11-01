(function initializeSpeciesConflicts(global) {
  "use strict";
  const BASE = "/api/shared-project/species/conflicts";
  const FIELDS = Object.freeze({ englishName: ["Englischer Name", 160], size: ["Größe", 240], weight: ["Gewicht", 240], lifeExpectancy: ["Lebenserwartung", 240] });
  const valueText = (part) => part?.present ? String(part.value ?? "") || "Leer" : "Nicht erfasst";
  const sameValue = (a, b) => Boolean(a?.present) === Boolean(b?.present) && (!a?.present || a.value === b.value);

  function createSpeciesConflictReview({ root, fetchJson, confirmAction, onResolved = () => {}, onDirtyChange = () => {},
    getContext = () => null, documentRef = global.document } = {}) {
    if (!root || !documentRef?.createElement || typeof fetchJson !== "function" || typeof confirmAction !== "function") {
      throw new TypeError("Artvergleich, geschützte API und Bestätigung sind erforderlich.");
    }
    const create = (tag, text, className) => {
      const node = documentRef.createElement(tag);
      if (text !== undefined) node.textContent = String(text);
      if (className) node.className = className;
      return node;
    };
    const button = (text, handler) => {
      const node = create("button", text); node.type = "button";
      node.addEventListener("click", () => { void handler(); }); return node;
    };
    const shell = create("section", undefined, "species-conflict-review"), heading = create("h3", "Grunddaten vergleichen");
    heading.tabIndex = -1;
    const message = create("p", "", "shared-project-message"), content = create("div"), previewRoot = create("div");
    message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
    const actions = create("div", undefined, "shared-project-actions"), reload = button("Vergleich neu laden", () => loadReview(conflictId));
    const keepServer = button("Serverfassung beibehalten", prepareServer), prepare = button("Änderungen prüfen", prepareChanges);
    const apply = button("Geprüfte Grunddaten übernehmen", resolveChanges), close = button("Vergleich schließen", closeReview);
    actions.append(reload, keepServer, prepare, apply, close);
    shell.append(heading, create("p", "Vergleiche die erhaltenen Fassungen und wähle die passenden Grunddaten. Interne Freigabe und Websiteveröffentlichung erfolgen separat."),
      message, content, previewRoot, actions);
    root.replaceChildren(shell); root.hidden = true;
    let project = null, projectKey = "", identity = "", reviewIdentity = "", reviewContext = "", review = null, conflictId = "";
    let choices = {}, preview = null, dirty = false, busy = false, confirming = false, stopped = false, stale = false;
    let generation = 0, editGeneration = 0, notifiedDirty = false;
    let inputs = [];
    function contextKey() { try { return JSON.stringify(getContext()); } catch { return "unavailable"; } }
    function hasUnsavedChanges() { return !stopped && (dirty || busy || confirming); }
    function notifyDirty() {
      const next = hasUnsavedChanges(); if (next !== notifiedDirty) { notifiedDirty = next; onDirtyChange(next); }
    }
    function setMessage(text) { message.textContent = text; message.hidden = !text; }
    function canRead() { return !stopped && project?.permissions?.canRead === true; }
    function canResolve() {
      return canRead() && project?.permissions?.canEdit === true && project.status?.connection === "online"
        && !project.status?.readOnlySession && review?.canResolve === true && review.connection === "online" && !stale
        && reviewIdentity === identity && reviewContext === contextKey();
    }
    function clearPreview() { preview = null; previewRoot.replaceChildren(); }
    function fieldChoiceValid(field) {
      const choice = choices[field.key];
      if (!choice) return !field.requiresChoice;
      if (choice.kind === "server") return true;
      if (choice.kind === "local") {
        const local = field.localVersions?.find((version) => version.changeId === choice.changeId);
        return Boolean(local) && !(field.server?.present && !local.present);
      }
      return choice.kind === "custom" && typeof choice.value === "string" && Boolean(choice.value.trim())
        && choice.value.length <= FIELDS[field.key][1] && !/[\x00-\x1f\x7f]/.test(choice.value);
    }
    function controls() {
      const editable = canResolve() && !busy && !confirming;
      reload.disabled = !canRead() || busy || confirming || !conflictId;
      keepServer.disabled = !editable;
      prepare.disabled = !editable || !review || !review.fields.every(fieldChoiceValid);
      apply.disabled = !editable || !preview?.token || preview.editGeneration !== editGeneration;
      close.disabled = busy || confirming;
      for (const input of inputs) input.disabled = !editable;
    }
    function changed() {
      if (stopped || !review || reviewIdentity !== identity) return false;
      dirty = true; editGeneration++; clearPreview(); setMessage(""); notifyDirty(); controls(); return true;
    }
    function ticket() { return { generation, context: contextKey() }; }
    function current(value) {
      if (stopped || value.generation !== generation) return false;
      if (value.context === contextKey()) return true;
      stale = true; clearPreview(); controls();
      setMessage("Die Projektansicht wurde gewechselt. Deine Auswahl bleibt erhalten; bitte den Vergleich neu laden.");
      return false;
    }
    function warnings(parent, items = []) {
      if (!items.length) return;
      const details = create("details"), list = create("ul"); details.append(create("summary", `Hinweise (${items.length})`), list);
      for (const item of items) if (typeof item === "string") list.append(create("li", item)); parent.append(details);
    }
    function addComparison(parent, field) {
      const details = create("details"), list = create("ul");
      details.append(create("summary", "Erhaltene Fassungen ansehen"), list);
      for (const [label, part] of [["Ausgangsfassung", field.base], ["Damals geladener Serverstand", field.historicalCurrent], ["Konfliktvorschlag", field.proposed]]) {
        list.append(create("li", `${label}: ${valueText(part)}`));
      }
      for (const [index, version] of (field.localVersions || []).entries()) list.append(create("li", `Lokale Fassung ${index + 1}: ${valueText(version)}`));
      parent.append(details);
    }
    function renderField(tbody, field) {
      const row = create("tr"), label = create("th", FIELDS[field.key][0]), server = create("td", valueText(field.server));
      label.setAttribute("scope", "row");
      const local = create("td"); addComparison(local, field);
      const selection = create("td"), select = create("select"), custom = create("input"); custom.type = "text";
      select.setAttribute("aria-label", `${FIELDS[field.key][0]} wählen`);
      custom.setAttribute("aria-label", `Eigener Wert: ${FIELDS[field.key][0]}`); custom.maxLength = FIELDS[field.key][1];
      const option = (value, text, disabled = false) => { const node = create("option", text); node.value = value; node.disabled = disabled; select.append(node); };
      option("", field.requiresChoice ? "Bitte bewusst wählen" : "Serverwert unverändert lassen");
      option("server", `Server: ${valueText(field.server)}`);
      for (const [index, version] of (field.localVersions || []).entries()) {
        const unavailable = field.server?.present && !version.present;
        option(`local:${version.changeId}`, `Lokale Fassung ${index + 1}: ${valueText(version)}${unavailable ? " (vorhandenen Wert erhalten)" : ""}`, unavailable);
      }
      option("custom", "Eigenen Wert eingeben");
      const chosen = choices[field.key];
      select.value = chosen?.kind === "local" ? `local:${chosen.changeId}` : chosen?.kind || "";
      custom.value = chosen?.kind === "custom" ? chosen.value : ""; custom.hidden = chosen?.kind !== "custom";
      select.addEventListener("change", () => {
        if (!changed()) return;
        if (select.value === "server") choices[field.key] = { kind: "server" };
        else if (select.value === "custom") choices[field.key] = { kind: "custom", value: custom.value };
        else if (select.value.startsWith("local:")) choices[field.key] = { kind: "local", changeId: select.value.slice(6) };
        else delete choices[field.key];
        custom.hidden = select.value !== "custom"; controls();
      });
      custom.addEventListener("input", () => {
        if (!changed()) return; choices[field.key] = { kind: "custom", value: custom.value }; controls();
      });
      inputs.push(select, custom); selection.append(select, custom); row.append(label, server, local, selection); tbody.append(row);
    }
    function renderReview() {
      content.replaceChildren(); inputs = []; clearPreview();
      if (!review) { controls(); return; }
      content.hidden = reviewIdentity !== identity;
      content.append(create("h4", review.germanName), create("p", review.scientificName));
      content.append(create("p", `${review.localVersions.length} lokale Fassung(en) bleiben bis zur geprüften Entscheidung erhalten.`));
      const table = create("table", undefined, "species-conflict-table"), head = create("thead"), header = create("tr"), body = create("tbody");
      for (const label of ["Grunddatum", "Aktueller Serverwert", "Erhaltene Fassungen", "Deine Auswahl"]) header.append(create("th", label));
      head.append(header); table.append(head, body); review.fields.forEach((field) => renderField(body, field)); content.append(table);
      if (review.lockedFields.length) {
        const details = create("details"), list = create("ul");
        details.append(create("summary", "Abweichende Namen · aktuell bleibt der Servername erhalten"),
          create("p", "Namensänderungen benötigen die gekoppelte Umbenennung von Art und Medien. Hier werden die aktuellen Servernamen beibehalten."), list);
        for (const field of review.lockedFields) {
          const item = create("li", `${field.label}: ${valueText(field.server)}`); addComparison(item, field); list.append(item);
        }
        content.append(details);
      }
      warnings(content, review.warnings);
      if (!canResolve()) setMessage(stale ? "Grundlage oder Anmeldung wurde geändert. Deine Auswahl bleibt erhalten; bitte den Vergleich neu laden."
        : "Dieser Vergleich ist zurzeit nur lesbar. Für die Übernahme bitte online mit Bearbeitungsrechten anmelden.");
      controls();
    }
    function checkedReview(value) {
      if (!value || value.id !== conflictId || typeof value.sourceScope !== "string" || !value.sourceScope || typeof value.reviewRevision !== "string"
        || !value.reviewRevision || !Array.isArray(value.fields) || value.fields.length !== 4 || !Array.isArray(value.lockedFields)
        || !Array.isArray(value.localVersions) || new Set(value.fields.map((field) => field.key)).size !== 4
        || value.fields.some((field) => !Object.hasOwn(FIELDS, field.key) || !Array.isArray(field.localVersions))) {
        throw new Error("Ungültiger Artvergleich");
      }
      return value;
    }
    function retainedChoices(next) {
      const retained = {}; let removed = false;
      for (const field of next.fields) {
        const choice = choices[field.key], before = review?.fields.find((entry) => entry.key === field.key);
        if (!choice) continue;
        if (choice.kind === "custom") retained[field.key] = { ...choice };
        else if (choice.kind === "server" && before && sameValue(before.server, field.server)) retained[field.key] = { ...choice };
        else if (choice.kind === "local") {
          const previous = before?.localVersions.find((version) => version.changeId === choice.changeId);
          const currentVersion = field.localVersions.find((version) => version.changeId === choice.changeId);
          if (previous && currentVersion && sameValue(previous, currentVersion) && !(field.server?.present && !currentVersion.present)) retained[field.key] = { ...choice };
          else removed = true;
        } else removed = true;
      }
      return { retained, removed };
    }
    async function confirmation(options) {
      confirming = true; controls(); notifyDirty();
      try { return Boolean(await confirmAction(options)); }
      catch { setMessage("Die Bestätigung wurde nicht abgeschlossen. Deine Auswahl bleibt erhalten."); return false; }
      finally { confirming = false; controls(); notifyDirty(); }
    }
    function reportError(error) {
      clearPreview();
      if (error?.status === 409 || /changed|drift|expired/.test(error?.code || "")) stale = true;
      setMessage(stale ? "Die Vergleichsgrundlage wurde inzwischen geändert. Deine Auswahl bleibt erhalten. Bitte zuerst den Serverstand lesen und dann den Vergleich neu laden."
        : "Der Schritt wurde nicht bestätigt. Deine Auswahl bleibt erhalten; bitte Anmeldung und Eingaben prüfen und bei Bedarf den Vergleich neu laden.");
    }
    async function loadReview(id) {
      if (stopped || busy || confirming || !canRead() || typeof id !== "string" || !id) return null;
      const changingIdentity = review && reviewIdentity !== identity, changingContext = review && reviewContext !== contextKey(), changingItem = review && id !== conflictId;
      if (dirty && (changingIdentity || changingContext || changingItem)) {
        const before = ticket();
        if (!await confirmation({ title: "Anderen Artvergleich öffnen?", message: "Sollen deine bisherigen Auswahleingaben verworfen werden? Die gespeicherten lokalen Fassungen bleiben erhalten.", confirmLabel: "Auswahl verwerfen" }) || !current(before)) return null;
      }
      const previousId = conflictId; conflictId = id; root.hidden = false;
      busy = true; clearPreview(); controls(); notifyDirty(); const before = ticket();
      try {
        const next = checkedReview(await fetchJson(`${BASE}/${encodeURIComponent(id)}`));
        if (!current(before)) return null;
        const preserve = !changingIdentity && !changingContext && review?.id === id;
        const retained = preserve ? retainedChoices(next) : { retained: {}, removed: false };
        choices = retained.retained; review = next; reviewIdentity = identity; reviewContext = before.context; stale = false; editGeneration++;
        if (!preserve) dirty = false;
        renderReview();
        root.scrollIntoView?.({ block: "start" }); heading.focus?.({ preventScroll: true });
        if (retained.removed) setMessage("Ein zuvor gewählter Wert oder eine lokale Fassung hat sich geändert. Bitte die offenen Zeilen erneut bewusst wählen.");
        else if (canResolve()) setMessage("");
        return review;
      } catch (error) { if (current(before)) { conflictId = review?.id || previousId || id; reportError(error); } return null; }
      finally { busy = false; controls(); notifyDirty(); }
    }
    async function prepareServer() {
      if (busy || confirming || !canResolve()) return;
      choices = Object.fromEntries(review.fields.filter((field) => field.requiresChoice).map((field) => [field.key, { kind: "server" }]));
      dirty = true; editGeneration++; renderReview(); notifyDirty(); await prepareChanges();
    }
    async function prepareChanges() {
      if (busy || confirming || !canResolve() || !review.fields.every(fieldChoiceValid)) return;
      busy = true; clearPreview(); controls(); notifyDirty(); const before = ticket(), edits = editGeneration;
      try {
        const result = await fetchJson(`${BASE}/${encodeURIComponent(conflictId)}/preview`, { method: "POST", body: JSON.stringify({
          sourceScope: review.sourceScope, expectedReviewRevision: review.reviewRevision, choices,
        }) });
        if (!current(before) || edits !== editGeneration) return;
        if (!result || typeof result.token !== "string" || !result.token || !Array.isArray(result.changes)
          || !result.review || result.review.id !== review.id || result.review.sourceScope !== review.sourceScope
          || result.review.reviewRevision !== review.reviewRevision || result.changes.some((change) => !Object.hasOwn(FIELDS, change.key))) throw new Error("Ungültige Prüfung");
        preview = { ...result, editGeneration: edits };
        previewRoot.append(create("h4", "Geprüfte Änderungen"));
        if (!result.changes.length) previewRoot.append(create("p", "Die aktuellen Serverwerte bleiben erhalten. Die geprüfte Entscheidung für die angezeigten lokalen Fassungen kann übernommen werden."));
        else {
          const list = create("ul");
          for (const change of result.changes) list.append(create("li", `${change.field || FIELDS[change.key]?.[0] || "Grunddatum"}: ${valueText(change.before)} → ${valueText(change.after)}`));
          previewRoot.append(list);
        }
        warnings(previewRoot, result.warnings);
        setMessage("Bitte die geprüften Werte ansehen und die Übernahme ausdrücklich bestätigen.");
      } catch (error) { if (current(before)) reportError(error); }
      finally { busy = false; controls(); notifyDirty(); }
    }
    async function resolveChanges() {
      if (busy || confirming || !canResolve() || !preview?.token || preview.editGeneration !== editGeneration) return;
      const shown = preview, before = ticket(), edits = editGeneration;
      const accepted = await confirmation({ title: "Geprüfte Grunddaten übernehmen?", message: "Die angezeigten Grunddaten werden als gemeinsame Änderung übernommen. Interne Freigabe und Websiteveröffentlichung erfolgen separat.", confirmLabel: "Geprüfte Grunddaten übernehmen" });
      if (!accepted || !current(before) || shown !== preview || edits !== editGeneration || !canResolve()) return;
      busy = true; controls(); notifyDirty();
      try {
        const result = await fetchJson(`${BASE}/${encodeURIComponent(conflictId)}/resolve`, { method: "POST", body: JSON.stringify({ token: shown.token }) });
        if (!current(before)) return;
        if (result?.resolved !== true) throw new Error("Übernahme nicht bestätigt");
        const newerInput = edits !== editGeneration;
        clearPreview();
        if (newerInput) stale = true;
        else { dirty = false; choices = {}; review = null; inputs = []; content.replaceChildren(); }
        const completion = result.queued || result.serverConfirmed !== true ? "Die geprüften Grunddaten sind lokal vorgemerkt. Der gemeinsame Abgleich steht noch aus." : "Der Artkonflikt wurde mit den geprüften Grunddaten geklärt.";
        setMessage(completion + (newerInput ? " Deine neueren Auswahleingaben bleiben erhalten; bitte den Vergleich neu laden." : ""));
        try { await onResolved(result); }
        catch { if (current(before)) setMessage(completion + " Bitte die Projektansicht erneut laden." + (newerInput ? " Deine neueren Auswahleingaben bleiben erhalten." : "")); }
      } catch (error) { if (current(before)) reportError(error); }
      finally { busy = false; controls(); notifyDirty(); }
    }
    async function closeReview() {
      if (busy || confirming || stopped) return;
      if (dirty) {
        const before = ticket();
        if (!await confirmation({ title: "Vergleich schließen?", message: "Sollen deine Auswahleingaben verworfen werden? Die gespeicherten lokalen Fassungen bleiben erhalten.", confirmLabel: "Auswahl verwerfen" }) || !current(before)) return;
      }
      reset();
    }
    function setProjectState(snapshot) {
      if (stopped) return;
      const status = snapshot?.status || {}, nextIdentity = JSON.stringify([status.baseUrl || "", status.projectId || "", status.user?.id || ""]);
      const nextKey = JSON.stringify([nextIdentity, status.user?.role || "", status.connection || "", Boolean(status.readOnlySession),
        snapshot?.permissions?.canRead === true, snapshot?.permissions?.canEdit === true]);
      project = snapshot;
      if (nextKey !== projectKey) {
        generation++; projectKey = nextKey; identity = nextIdentity; clearPreview();
        if (review) {
          stale = true; content.hidden = reviewIdentity !== identity;
          setMessage(reviewIdentity !== identity ? "Anmeldung oder Projekt wurde gewechselt. Die bisherige Auswahl bleibt geschützt; bitte den Artvergleich neu öffnen."
            : "Verbindung oder Berechtigung wurde geändert. Deine Auswahl bleibt erhalten; bitte den Vergleich neu laden.");
        }
      }
      controls();
    }
    function reset() {
      if (busy || confirming || stopped) return false;
      generation++; editGeneration++; review = null; choices = {}; conflictId = ""; dirty = false; stale = false; inputs = [];
      clearPreview(); content.replaceChildren(); content.hidden = false; root.hidden = true; setMessage(""); controls(); notifyDirty(); return true;
    }
    controls();
    return Object.freeze({ open: loadReview, hasUnsavedChanges, setProjectState, reset, get busy() { return busy || confirming; },
      destroy() { stopped = true; generation++; dirty = false; clearPreview(); root.replaceChildren(); root.hidden = true; notifyDirty(); } });
  }
  global.SpeciesExplorerSpeciesConflicts = Object.freeze({ createSpeciesConflictReview });
})(globalThis);
