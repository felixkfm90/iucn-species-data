(function initializeSharedImport(global) {
  "use strict";
  function createInitialProjectImportController({ root, fetchJson, confirmAction, hasUnsavedChanges = () => false,
    refreshProject = async () => {}, canEdit: editingAllowed = () => true, documentRef = global.document } = {}) {
    if (!root || typeof fetchJson !== "function" || typeof confirmAction !== "function") throw new TypeError("Importbereich, geschützte API und Bestätigung sind erforderlich.");
    const create = (tag, text) => { const node = documentRef.createElement(tag); if (text) node.textContent = text; return node; };
    const details = create("details"), summary = create("summary", "Öffentlichen Anfangsbestand übernehmen");
    const note = create("p", "Der geprüfte öffentliche Artbestand kann einmalig in das gemeinsame Projekt übernommen werden. Vorhandene Arten bleiben erhalten. Die Website wird dabei nicht verändert."), editorialSource = create("p");
    const label = create("label"), release = create("input"); release.type = "checkbox";
    label.append(release, create("span", "Neu übernommene Arten auch für Projektleser freigeben"));
    const prepare = create("button", "Übernahme zuerst prüfen"), apply = create("button", "Geprüfte Übernahme starten"), message = create("p");
    const media = create("button", "Artdateien für das Projekt bereitstellen"), mediaMessage = create("p");
    media.type = "button"; mediaMessage.setAttribute("role", "status"); mediaMessage.setAttribute("aria-live", "polite");
    prepare.type = "button"; apply.type = "button"; apply.disabled = true; message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
    const listDetails = create("details"), list = create("ul"); listDetails.append(create("summary", "Betroffene Arten ansehen"), list);
    details.append(summary, note, editorialSource, label, prepare, apply, message, listDetails, media, mediaMessage); root.replaceChildren(details);
    let plan = null, working = false, running = false, available = false, admin = false, stopped = false, timer = null;
    let configuredSource = "public-catalog";
    let projectKey = null, authorityKey = null, projectId, baseUrl, userId, generation = 0, refreshSequence = 0, messageKind = "";
    let modeGeneration = 0, observedEditing = readEditingMode();
    const post = (suffix, input = {}) => fetchJson(`/api/shared-project/import/${suffix}`, { method: "POST", body: JSON.stringify(input) });
    function readEditingMode() { try { return editingAllowed() === true; } catch { return false; } }
    function observeEditingMode() {
      const next = readEditingMode();
      if (next === observedEditing) return false;
      observedEditing = next; modeGeneration++; generation++; return true;
    }
    function editingModeChanged() { if (observeEditingMode()) controls(); }
    function draftsClear() { try { return hasUnsavedChanges() === false; } catch { return false; } }
    function writeAuthority() { observeEditingMode(); return !stopped && observedEditing && available && admin && !running; }
    function context() { return { generation, projectKey, source: configuredSource }; }
    function current(ticket) { observeEditingMode(); return !stopped && ticket.generation === generation
      && ticket.projectKey === projectKey && ticket.source === configuredSource; }
    function writable(ticket) { return current(ticket) && writeAuthority() && draftsClear(); }
    function belongsToPerson(value) { return !value || !Object.hasOwn(value, "preparedByUserId") || value.preparedByUserId === userId; }
    function ownPlan(value) { return Boolean(value) && value.projectId === projectId && value.baseUrl === baseUrl && belongsToPerson(value); }
    function setMessage(text, kind = "status") { message.textContent = text; messageKind = kind; }
    const mediaSize = bytes => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(bytes / 1000000)} MB`;
    const mediaLabels = { "portrait.webp": "Artporträt", "map.jpg": "Verbreitungskarte", "sound.mp3": "Tonaufnahme", "spectrogram.webp": "Spektrogramm" };
    const mediaProblems = {
      normal_media_server_required: " Der Projektdienst benötigt zuerst ein Update.",
      normal_media_not_local: " Die gebundene Originaldatei fehlt auf diesem PC.",
      normal_media_changed: " Die Originaldatei stimmt nicht mehr mit der übernommenen Artfassung überein.",
      normal_media_review_changed: " Die Artfassung wurde inzwischen geändert. Bitte diese Art einzeln prüfen.",
      object_changed: " Der Projektdienst meldet eine geänderte Artfassung. Bitte den aktuellen Stand prüfen.",
      import_person_changed: " Bitte wieder mit dem vorbereitenden Projektkonto anmelden.",
    };
    function renderMedia() {
      const preview = ownPlan(plan) ? plan.media : null;
      media.hidden = mediaMessage.hidden = !preview;
      media.disabled = !preview || prepare.disabled;
      mediaMessage.textContent = "";
      if (!preview) return;
      const { files, species, bytes, run } = preview;
      const scope = `${files} Originaldateien aus ${species} übernommenen Arten · ${mediaSize(bytes)}.`;
      if (!run) mediaMessage.textContent = scope;
      else if (run.state === "running") mediaMessage.textContent = `${run.confirmedFiles} von ${files} Dateien bestätigt. Bereitstellung läuft.`;
      else if (run.state === "complete") mediaMessage.textContent = `${run.confirmedFiles} Dateien bestätigt.`
        + (run.changedFiles ? ` ${run.changedFiles} Dateien aus geänderten Artfassungen ausgelassen. Die betroffenen Arten sind in der Liste markiert.` : "");
      else mediaMessage.textContent = `${run.confirmedFiles} Dateien bestätigt. Bereitstellung angehalten.`
        + (run.stoppedFile ? ` Betroffen ist ${run.stoppedFile.commonName} (${mediaLabels[run.stoppedFile.slot] || "Artdatei"}).` : "")
        + (Object.hasOwn(mediaProblems, run.error) ? mediaProblems[run.error] : " Bitte den Stand prüfen und bei Bedarf erneut starten.");
    }
    function controls() {
      observeEditingMode();
      const full = configuredSource === "working-records";
      summary.textContent = full ? "Vollständige Art-Datensätze übernehmen" : "Öffentlichen Anfangsbestand übernehmen";
      note.textContent = full ? "Grunddaten, Texte und Medienzuordnungen werden als geprüfte Datensätze übernommen. Vorhandene Arten bleiben erhalten. Die zugehörigen Originaldateien können anschließend separat bereitgestellt werden."
        : "Der geprüfte öffentliche Artbestand kann einmalig in das gemeinsame Projekt übernommen werden. Vorhandene Arten bleiben erhalten. Die Website wird dabei nicht verändert.";
      const editorial = full && ownPlan(plan) ? plan.source?.editorial : null;
      const editorialDate = Date.parse(editorial?.generatedAt);
      editorialSource.hidden = !Number.isFinite(editorialDate);
      editorialSource.textContent = editorialSource.hidden ? "" : `${editorial.kind === "public-release" ? "Geprüfte öffentliche Website-Texte" : "Mitgelieferte Website-Texte"} · ${new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(editorialDate)} · ${editorial.speciesCount} Arten`;
      prepare.disabled = stopped || working || running || !available || !admin || !observedEditing
        || !belongsToPerson(plan) || Boolean(plan?.source?.kind && plan.source.kind !== configuredSource && !plan.canReplace);
      release.disabled = prepare.disabled;
      apply.disabled = prepare.disabled || !plan?.canApply || plan.state === "complete" || release.checked !== plan.releaseForReaders
        || Boolean(plan?.source?.kind && plan.source.kind !== configuredSource);
      renderMedia();
    }
    function renderPlan(value) {
      plan = value; list.replaceChildren();
      if (!plan) { if (messageKind === "plan") setMessage(""); controls(); return; }
      if (!belongsToPerson(plan)) {
        setMessage("Dieser Importplan gehört zur Anmeldung, mit der er vorbereitet wurde. Bitte mit diesem Projektkonto erneut anmelden.", "plan");
        controls(); return;
      }
      const counts = plan.counts;
      setMessage(`${counts.willCreate} Art(en) anzulegen · ${counts.skippedExisting} vorhandene ausgelassen · ${counts.created} angelegt · ${counts.approved} intern freigegeben`, "plan");
      if (plan.state === "complete") message.textContent = "Übernahme abgeschlossen. Vorhandene Arten wurden erhalten; die Website wurde nicht verändert.";
      else if (plan.drift?.length || plan.lastError) message.textContent += " · Angehalten: Grundlage oder letzter Schritt muss geprüft werden.";
      if (counts.existingDifferent > 0) message.textContent += ` · Abweichende vorhandene Artfassungen: ${counts.existingDifferent}. Die Projektfassungen bleiben erhalten.`;
      if (configuredSource === "working-records" && plan.source?.kind === "public-catalog") {
        message.textContent = "Gespeicherter Plan: öffentlicher Anfangsbestand, keine vollständigen Arbeitsdaten. "
          + (plan.canReplace ? "Der unbegonnene Plan kann nach ausdrücklicher Bestätigung durch eine neue Prüfung ersetzt werden."
            : "Dieser bereits begonnene oder abgeschlossene Plan und seine Belege bleiben erhalten. Der Anschluss vollständiger Arbeitsdaten ist noch offen.");
      }
      const changedSpecies = new Set(plan.media?.run?.changedSpecies || []);
      for (const item of plan.items || []) {
        const retained = item.existingMatchesSource === false ? "abweichende Projektfassung bleibt erhalten" : "vorhanden, bleibt erhalten";
        const state = item.state === "skipped" ? retained : item.state === "approved" ? "intern freigegeben"
          : item.state === "created" ? "als Entwurf angelegt" : "noch offen";
        list.append(create("li", `${item.commonName} · ${state}${changedSpecies.has(item.id) ? " · Artdateien einzeln prüfen" : ""}`));
      }
      controls();
    }
    function applyProjectState(project) {
      const state = project.status || {}, nextKey = JSON.stringify([state.baseUrl || "", state.projectId || "", state.user?.id || ""]);
      const nextAdmin = state.connection === "online" && state.user?.role === "admin" && !state.readOnlySession
        && project.permissions?.canManageUsers === true;
      const nextAuthority = JSON.stringify([nextKey, state.user?.version ?? null, state.user?.role || "", state.connection || "",
        state.readOnlySession === true, project.permissions?.canManageUsers === true]);
      if (authorityKey !== nextAuthority) generation++;
      authorityKey = nextAuthority; projectId = state.projectId; baseUrl = state.baseUrl; userId = state.user?.id;
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
      observeEditingMode();
      const ticket = ++refreshSequence, authorityGeneration = generation, editingGeneration = modeGeneration;
      const [state, project] = await Promise.all([fetchJson("/api/shared-project/import"), fetchJson("/api/shared-project")]);
      observeEditingMode();
      if (stopped || ticket !== refreshSequence) return;
      if (editingGeneration !== modeGeneration) { controls(); if (running) scheduleRefresh(); return; }
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
      if (working || !writeAuthority()) return;
      if (!draftsClear()) { setMessage("Bitte zuerst deine Formulareingaben speichern oder ausdrücklich verwerfen."); return; }
      const ticket = context();
      working = true; controls();
      try { await operation(ticket); }
      catch (error) { if (current(ticket)) setMessage(error?.code === "species_record_server_required"
        ? "Der gemeinsame Dienst muss für diese Übernahme zuerst aktualisiert werden. Vorhandene Arten bleiben erhalten."
        : error?.code === "import_person_changed" ? "Die Anmeldung passt nicht mehr zum Importplan. Bitte erneut mit dem ursprünglichen Projektkonto anmelden."
        : error?.code === "working_public_catalog_invalid" ? "Die veröffentlichte Katalogfassung konnte nicht geprüft werden. Bitte später erneut prüfen."
        : "Die Übernahme ist nicht bestätigt. Beide Bestände und das Importjournal bleiben erhalten; bitte Grundlage und Anmeldung prüfen."); }
      finally { working = false; controls(); }
    }
    prepare.addEventListener("click", () => { void action(async (ticket) => {
      const shown = plan, input = { releaseForReaders: release.checked };
      const eligible = () => writable(ticket) && plan === shown && release.checked === input.releaseForReaders
        && (!shown || ownPlan(shown)) && !(shown?.source?.kind && shown.source.kind !== configuredSource && !shown.canReplace);
      if (!eligible()) return;
      if (shown?.canReplace && (shown.drift?.length || shown.lastError || shown.source?.kind && shown.source.kind !== configuredSource)) {
        const accepted = await confirmAction({ title: "Vorbereitung erneuern?", message: "Mit diesem Plan wurde noch nichts geschrieben. Soll die bisherige Vorbereitung als ersetzt erhalten bleiben und ein neuer Plan auf dem aktuellen Bestand erstellt werden?", confirmLabel: "Erneut prüfen" });
        if (!accepted || !eligible()) return;
        input.replaceUnstartedPlanId = shown.planId;
      }
      if (!eligible()) return;
      let prepared;
      try { prepared = await post("prepare", input); }
      catch (error) {
        if (error?.code !== "bound_source_changed" || !shown?.canReplace || input.replaceUnstartedPlanId || !eligible()) throw error;
        const accepted = await confirmAction({ title: "Vorbereitung erneuern?", message: "Die Quellen haben sich seit der ersten Prüfung geändert. Soll ein neuer Plan aus dem aktuellen Bestand erstellt werden?", confirmLabel: "Erneut prüfen" });
        if (!accepted || !eligible()) return;
        prepared = await post("prepare", { ...input, replaceUnstartedPlanId: shown.planId });
      }
      if (!eligible()) return;
      if (!ownPlan(prepared) || prepared?.source?.kind && prepared.source.kind !== configuredSource) {
        setMessage("Die Vorbereitung passt nicht mehr zum aktuellen Projekt oder Datenbestand. Bitte den Status erneut lesen."); return;
      }
      renderPlan(prepared);
    }); });
    release.addEventListener("change", controls);
    apply.addEventListener("click", () => { void action(async (ticket) => {
      const shown = plan;
      const eligible = () => writable(ticket) && plan === shown && ownPlan(shown) && shown?.canApply && shown.state !== "complete"
        && release.checked === shown.releaseForReaders && !(shown.source?.kind && shown.source.kind !== configuredSource);
      if (!eligible()) return;
      const accepted = await confirmAction({ title: "Geprüften Anfangsbestand übernehmen?",
        message: `${shown.counts.willCreate} Art(en) werden neu angelegt; ${shown.counts.skippedExisting} vorhandene bleiben erhalten. ${shown.releaseForReaders ? "Die neuen Arten werden anschließend intern für Projektleser freigegeben." : "Die neuen Arten bleiben zunächst Entwürfe."} Es erfolgt keine Websiteveröffentlichung.`, confirmLabel: "Übernahme starten" });
      if (!accepted || !eligible()) return;
      await post("start", { planId: shown.planId, confirmed: true, confirmInternalRelease: shown.releaseForReaders });
      if (writable(ticket)) await refresh();
    }); });
    media.addEventListener("click", () => { void action(async (ticket) => {
      const shown = plan;
      const eligible = () => writable(ticket) && plan === shown && ownPlan(shown) && shown.state === "complete" && Boolean(shown.media);
      if (!eligible()) return;
      const { files, species, bytes } = shown.media;
      const accepted = await confirmAction({ title: "Artdateien für das gemeinsame Projekt bereitstellen?",
        message: `Geprüft werden ${files} Originaldateien aus ${species} übernommenen Arten (${mediaSize(bytes)}). Der Explorer sendet fehlende Dateien aus unveränderten Artfassungen. Die interne Freigabe bleibt ein eigener Schritt.`,
        confirmLabel: "Artdateien bereitstellen" });
      if (!accepted || !eligible()) return;
      await post("media", { planId: shown.planId, confirmed: true });
      if (writable(ticket)) await refresh();
    }); });
    controls();
    return { refresh, setProjectState, editingModeChanged, get busy() { return working || running; },
      destroy() { stopped = true; generation++; global.clearTimeout(timer); } };
  }
  global.SpeciesExplorerSharedImport = Object.freeze({ createInitialProjectImportController });
})(globalThis);
