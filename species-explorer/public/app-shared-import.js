(function initializeSharedImport(global) {
  "use strict";
  function createInitialProjectImportController({ root, fetchJson, confirmAction, hasUnsavedChanges = () => false,
    refreshProject = async () => {}, documentRef = global.document } = {}) {
    if (!root || typeof fetchJson !== "function" || typeof confirmAction !== "function") throw new TypeError("Importbereich, geschützte API und Bestätigung sind erforderlich.");
    const create = (tag, text) => { const node = documentRef.createElement(tag); if (text) node.textContent = text; return node; };
    const details = create("details"), summary = create("summary", "Öffentlichen Anfangsbestand übernehmen");
    const note = create("p", "Der geprüfte öffentliche Artbestand kann einmalig in das gemeinsame Projekt übernommen werden. Vorhandene Arten bleiben erhalten. Die Website wird dabei nicht verändert.");
    const label = create("label"), release = create("input"); release.type = "checkbox";
    label.append(release, create("span", "Neu übernommene Arten auch für Projektleser freigeben"));
    const prepare = create("button", "Übernahme zuerst prüfen"), apply = create("button", "Geprüfte Übernahme starten"), message = create("p");
    prepare.type = "button"; apply.type = "button"; apply.disabled = true; message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
    const listDetails = create("details"), list = create("ul"); listDetails.append(create("summary", "Betroffene Arten ansehen"), list);
    details.append(summary, note, label, prepare, apply, message, listDetails); root.replaceChildren(details);
    let plan = null, working = false, running = false, available = false, admin = false, stopped = false, timer = null;
    let configuredSource = "public-catalog";
    let projectKey = null, generation = 0, refreshSequence = 0, messageKind = "";
    const post = (suffix, input = {}) => fetchJson(`/api/shared-project/import/${suffix}`, { method: "POST", body: JSON.stringify(input) });
    function setMessage(text, kind = "status") { message.textContent = text; messageKind = kind; }
    function controls() {
      const full = configuredSource === "working-records";
      summary.textContent = full ? "Vollständige Art-Datensätze übernehmen" : "Öffentlichen Anfangsbestand übernehmen";
      note.textContent = full ? "Grunddaten, Texte und Medienzuordnungen werden als geprüfte Datensätze übernommen. Vorhandene Arten bleiben erhalten. Mediendateien und Website werden dabei nicht verändert."
        : "Der geprüfte öffentliche Artbestand kann einmalig in das gemeinsame Projekt übernommen werden. Vorhandene Arten bleiben erhalten. Die Website wird dabei nicht verändert.";
      prepare.disabled = stopped || working || running || !available || !admin;
      release.disabled = prepare.disabled;
      apply.disabled = prepare.disabled || !plan?.canApply || plan.state === "complete" || release.checked !== plan.releaseForReaders
        || Boolean(plan?.source?.kind && plan.source.kind !== configuredSource);
    }
    function renderPlan(value) {
      plan = value; list.replaceChildren();
      if (!plan) { if (messageKind === "plan") setMessage(""); controls(); return; }
      const counts = plan.counts;
      setMessage(`${counts.willCreate} Art(en) anzulegen · ${counts.skippedExisting} vorhandene ausgelassen · ${counts.created} angelegt · ${counts.approved} intern freigegeben`, "plan");
      if (plan.state === "complete") message.textContent = "Übernahme abgeschlossen. Vorhandene Arten wurden erhalten; die Website wurde nicht verändert.";
      else if (plan.drift?.length || plan.lastError) message.textContent += " · Angehalten: Grundlage oder letzter Schritt muss geprüft werden.";
      for (const item of plan.items || []) list.append(create("li", `${item.commonName} · ${item.state === "skipped" ? "vorhanden, bleibt erhalten" : item.state === "approved" ? "intern freigegeben" : item.state === "created" ? "als Entwurf angelegt" : "noch offen"}`));
      controls();
    }
    function applyProjectState(project) {
      const state = project.status || {}, nextKey = JSON.stringify([state.baseUrl || "", state.projectId || "", state.user?.id || ""]);
      const nextAdmin = state.connection === "online" && state.user?.role === "admin" && !state.readOnlySession
        && project.permissions?.canManageUsers === true;
      if (projectKey !== nextKey || admin !== nextAdmin) renderPlan(null);
      projectKey = nextKey; admin = nextAdmin;
      if (!admin) setMessage("Für die Erstübernahme bitte online mit Administration anmelden.", "access");
      else if (messageKind === "access") setMessage("");
      controls();
    }
    function setProjectState(project) {
      if (stopped) return;
      generation++;
      applyProjectState(project);
    }
    function scheduleRefresh() {
      global.clearTimeout(timer);
      timer = global.setTimeout(() => { void refresh().catch(() => { if (!stopped) { setMessage("Importstatus derzeit nicht erreichbar. Bitte vor einer Wiederaufnahme prüfen."); controls(); } }); }, 1000);
    }
    async function refresh() {
      if (stopped) return;
      const ticket = ++refreshSequence, authorityGeneration = generation;
      const [state, project] = await Promise.all([fetchJson("/api/shared-project/import"), fetchJson("/api/shared-project")]);
      if (stopped || ticket !== refreshSequence) return;
      available = state.available === true; running = state.busy === true;
      configuredSource = state.source?.kind === "working-records" ? "working-records" : "public-catalog";
      root.hidden = !available;
      if (authorityGeneration !== generation) { controls(); scheduleRefresh(); return; }
      applyProjectState(project);
      const currentPlan = state.plan?.projectId === project.status?.projectId && state.plan?.baseUrl === project.status?.baseUrl ? state.plan : null;
      renderPlan(currentPlan);
      if (running) scheduleRefresh();
      else if (currentPlan?.state === "complete") await refreshProject();
    }
    async function action(operation) {
      if (working || stopped || !available || !admin) return;
      if (hasUnsavedChanges()) { setMessage("Bitte zuerst deine Formulareingaben speichern oder ausdrücklich verwerfen."); return; }
      working = true; controls();
      try { await operation(); }
      catch (error) { if (!stopped) setMessage(error?.code === "species_record_server_required"
        ? "Der gemeinsame Dienst muss für diese Übernahme zuerst aktualisiert werden. Vorhandene Arten bleiben erhalten."
        : "Die Übernahme ist nicht bestätigt. Beide Bestände und das Importjournal bleiben erhalten; bitte Grundlage und Anmeldung prüfen."); }
      finally { working = false; controls(); }
    }
    prepare.addEventListener("click", () => { void action(async () => {
      const ticket = generation, shown = plan, input = { releaseForReaders: release.checked };
      if (shown?.canReplace && (shown.drift?.length || shown.lastError || shown.source?.kind && shown.source.kind !== configuredSource)) {
        const accepted = await confirmAction({ title: "Vorbereitung erneuern?", message: "Mit diesem Plan wurde noch nichts geschrieben. Soll die bisherige Vorbereitung als ersetzt erhalten bleiben und ein neuer Plan auf dem aktuellen Bestand erstellt werden?", confirmLabel: "Erneut prüfen" });
        if (!accepted || stopped || ticket !== generation || plan !== shown || !admin || hasUnsavedChanges()) return;
        input.replaceUnstartedPlanId = shown.planId;
      }
      const prepared = await post("prepare", input);
      if (!stopped && ticket === generation) renderPlan(prepared);
    }); });
    release.addEventListener("change", controls);
    apply.addEventListener("click", () => { void action(async () => {
      if (!plan?.canApply || plan.state === "complete" || release.checked !== plan.releaseForReaders) return;
      if (plan.source?.kind && plan.source.kind !== configuredSource) return;
      const shown = plan;
      const accepted = await confirmAction({ title: "Geprüften Anfangsbestand übernehmen?",
        message: `${shown.counts.willCreate} Art(en) werden neu angelegt; ${shown.counts.skippedExisting} vorhandene bleiben erhalten. ${shown.releaseForReaders ? "Die neuen Arten werden anschließend intern für Projektleser freigegeben." : "Die neuen Arten bleiben zunächst Entwürfe."} Es erfolgt keine Websiteveröffentlichung.`, confirmLabel: "Übernahme starten" });
      if (!accepted || stopped || !available || !admin || plan !== shown || release.checked !== shown.releaseForReaders || hasUnsavedChanges()) return;
      await post("start", { planId: shown.planId, confirmed: true, confirmInternalRelease: shown.releaseForReaders });
      await refresh();
    }); });
    return { refresh, setProjectState, get busy() { return working || running; }, destroy() { stopped = true; generation++; global.clearTimeout(timer); } };
  }
  global.SpeciesExplorerSharedImport = Object.freeze({ createInitialProjectImportController });
})(globalThis);
