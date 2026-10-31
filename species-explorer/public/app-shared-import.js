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
    const post = (suffix, input = {}) => fetchJson(`/api/shared-project/import/${suffix}`, { method: "POST", body: JSON.stringify(input) });
    function controls() {
      prepare.disabled = stopped || working || running || !available || !admin;
      release.disabled = prepare.disabled;
      apply.disabled = prepare.disabled || !plan?.canApply || plan.state === "complete" || release.checked !== plan.releaseForReaders;
    }
    function renderPlan(value) {
      plan = value; list.replaceChildren();
      if (!plan) { controls(); return; }
      const counts = plan.counts;
      message.textContent = `${counts.willCreate} Art(en) anzulegen · ${counts.skippedExisting} vorhandene ausgelassen · ${counts.created} angelegt · ${counts.approved} intern freigegeben`;
      if (plan.state === "complete") message.textContent = "Übernahme abgeschlossen. Vorhandene Arten wurden erhalten; die Website wurde nicht verändert.";
      else if (plan.drift?.length || plan.lastError) message.textContent += " · Angehalten: Grundlage oder letzter Schritt muss geprüft werden.";
      for (const item of plan.items || []) list.append(create("li", `${item.commonName} · ${item.state === "skipped" ? "vorhanden, bleibt erhalten" : item.state === "approved" ? "intern freigegeben" : item.state === "created" ? "als Entwurf angelegt" : "noch offen"}`));
      controls();
    }
    async function refresh() {
      if (stopped) return;
      const [state, project] = await Promise.all([fetchJson("/api/shared-project/import"), fetchJson("/api/shared-project")]);
      if (stopped) return;
      available = state.available === true; admin = project.permissions?.canManageUsers === true; running = state.busy === true;
      root.hidden = !available;
      if (!admin) message.textContent = "Für die Erstübernahme bitte online mit Administration anmelden.";
      renderPlan(state.plan || null);
      if (running) {
        global.clearTimeout(timer);
        timer = global.setTimeout(() => { void refresh().catch(() => { if (!stopped) { message.textContent = "Importstatus derzeit nicht erreichbar. Bitte vor einer Wiederaufnahme prüfen."; controls(); } }); }, 1000);
      } else if (state.plan?.state === "complete") await refreshProject();
    }
    async function action(operation) {
      if (working || stopped) return;
      if (hasUnsavedChanges()) { message.textContent = "Bitte zuerst deine Formulareingaben speichern oder ausdrücklich verwerfen."; return; }
      working = true; controls();
      try { await operation(); }
      catch { if (!stopped) message.textContent = "Die Übernahme ist nicht bestätigt. Beide Bestände und das Importjournal bleiben erhalten; bitte Grundlage und Anmeldung prüfen."; }
      finally { working = false; controls(); }
    }
    prepare.addEventListener("click", () => { void action(async () => {
      renderPlan(await post("prepare", { releaseForReaders: release.checked }));
    }); });
    release.addEventListener("change", controls);
    apply.addEventListener("click", () => { void action(async () => {
      if (!plan?.canApply || plan.state === "complete" || release.checked !== plan.releaseForReaders) return;
      const shown = plan;
      const accepted = await confirmAction({ title: "Geprüften Anfangsbestand übernehmen?",
        message: `${shown.counts.willCreate} Art(en) werden neu angelegt; ${shown.counts.skippedExisting} vorhandene bleiben erhalten. ${shown.releaseForReaders ? "Die neuen Arten werden anschließend intern für Projektleser freigegeben." : "Die neuen Arten bleiben zunächst Entwürfe."} Es erfolgt keine Websiteveröffentlichung.`, confirmLabel: "Übernahme starten" });
      if (!accepted || stopped || plan !== shown || release.checked !== shown.releaseForReaders || hasUnsavedChanges()) return;
      await post("start", { planId: shown.planId, confirmed: true, confirmInternalRelease: shown.releaseForReaders });
      await refresh();
    }); });
    return { refresh, get busy() { return working || running; }, destroy() { stopped = true; global.clearTimeout(timer); } };
  }
  global.SpeciesExplorerSharedImport = Object.freeze({ createInitialProjectImportController });
})(globalThis);
