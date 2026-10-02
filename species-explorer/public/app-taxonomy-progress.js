(function initializeTaxonomyProgress(global) {
  "use strict";

  // Logical milestones, not estimated fractions of elapsed time. The first
  // milestone also exists offline: it selects the already available sources.
  const BUILD_STEPS = ["Quellen vorbereiten", "Eingänge sichern und lesen", "Master aufbauen",
    "Master prüfen", "Lightroom-Paket erstellen", "Gesamtstand prüfen", "Gemeinsam übernehmen"];
  const ACTIVE = new Set(["refreshing", "building", "activating", "rolling-back", "syncing-lightroom", "applying-corrections"]);
  const STOPPED = { paused: "pausiert", pausing: "Pause angefordert", interrupted: "unterbrochen",
    stale: "Eingänge geändert", failed: "fehlgeschlagen", partial: "unvollständig" };
  const REFERENCE_PHASES = { download: "Quelldownload", extract: "Archiv entpacken", "name-usages": "Referenztaxa lesen",
    materialize: "Referenz aufbereiten", "vernacular-names": "Namen lesen", "search-index": "Referenzsuche aufbauen",
    compact: "Referenz optimieren", compare: "Projektzuordnungen prüfen", activate: "Referenz übernehmen",
    supplements: "Anbieternamen aktualisieren", complete: "Referenz vorbereitet", rollback: "Referenz zurücknehmen" };
  const number = (value) => value !== null && value !== undefined && value !== "" && typeof value !== "boolean"
    && Number.isFinite(Number(value)) ? Number(value) : null;
  const text = (value) => String(value ?? "").trim();

  function measuredProgress(currentValue, totalValue) {
    const current = number(currentValue), total = number(totalValue);
    if (current === null || total === null || total <= 0 || current < 0 || current > total) return null;
    return { percent: Math.floor(current / total * 100),
      count: `${current.toLocaleString("de-DE")} von ${total.toLocaleString("de-DE")}` };
  }

  function packageStep(phase) {
    if (/Aktivierung|übernehmen|aktivieren/i.test(phase)) return 6;
    if (/Prüfung|prüfen|Abgeschlossen|verify|validate|complete/i.test(phase)) return 5;
    return 4;
  }

  function taxonomyProgressPresentation({ master = {}, reference = {}, busy = false } = {}) {
    master ||= {};
    reference ||= {};
    const job = master.buildJob || {};
    const referenceActive = reference.active === true;
    const pending = job.available === true && job.status !== "ready";
    const running = referenceActive || master.active === true || ACTIVE.has(master.status);
    // A source failure ends before Master work begins. A consumed ready job
    // must not lend its old "Abschluss" phase or action to this failed update.
    const sourceFailure = reference.status === "failed" && !running && !pending
      && !master.error && !["failed", "partial"].includes(master.status);
    const referenceInFocus = referenceActive || sourceFailure;
    const status = referenceInFocus ? reference.status : pending ? job.status : master.status;
    const lifecycle = master.lifecycle || {};
    const conflicts = Number(lifecycle.blockingConflictCount ?? lifecycle.blockingConflicts?.length ?? 0);
    const candidate = Boolean(lifecycle.candidate);
    const sourcesAwaitMaster = reference.action === "update" && reference.status === "completed"
      && Date.parse(reference.completedAt) > Date.parse(master.completedAt || "1970-01-01T00:00:00Z");
    const failed = !referenceActive && (Boolean(master.error) || ["failed", "partial"].includes(status))
      || (!running && reference.status === "failed");
    const waiting = !running && candidate;
    const stopped = !referenceInFocus && STOPPED[status];
    const pairCurrent = master.lightroomPackage?.status === "current"
      && !master.reference?.needsMasterRebuild && !master.corrections?.pending && !master.identities?.pending;
    const completed = !busy && !sourcesAwaitMaster && !running && !failed && !pending && !candidate
      && master.status === "completed" && pairCurrent;
    const unfinished = !busy && !running && master.status === "completed" && !completed;
    if (!running && !pending && !candidate && !failed && !busy && !completed && !unfinished) return null;

    const savedProgress = pending && !ACTIVE.has(master.status) ? job.progress : null;
    let phase = text(referenceInFocus ? REFERENCE_PHASES[reference.phase] || reference.phase
      : savedProgress?.phase || master.progressPhase || job.progress?.phase);
    let steps = BUILD_STEPS, index = 0;
    const action = master.action || "";
    if (!referenceInFocus && (action === "rollback" || master.status === "rolling-back")) {
      steps = ["Vorgänger und eigene Entscheidungen prüfen", "Vorgänger gemeinsam übernehmen"];
      index = /Aktivierung|übernehmen|aktivieren/i.test(phase) ? 1 : 0;
    } else if (!referenceInFocus && (action === "apply-corrections" || master.status === "applying-corrections")) {
      steps = ["Namenswahl prüfen", "Namenswahl gemeinsam übernehmen"];
      index = /aktivieren|Aktivierung|übernehmen/i.test(phase) ? 1 : 0;
    } else if (!referenceInFocus && action === "sync-lightroom") {
      steps = BUILD_STEPS.slice(4);
      index = packageStep(phase) - 4;
    } else if (!referenceInFocus) {
      if (["activating", "syncing-lightroom"].includes(master.status) || action === "activate") {
        // Before the first publication event the service says "Aktivierung",
        // but package preparation/verification still lies ahead.
        index = phase === "Aktivierung" ? 4 : packageStep(phase);
      } else if (candidate && !pending) index = 3;
      else if (/Prüfung|Abschluss|Abgeschlossen/.test(phase)) index = 3;
      else if (/Masterdatenbank|Anbieter-Datensätze|Suchindex|Schreibblock/.test(phase)) index = 2;
      else if (/Eingangsstand|CoL-Referenz|Wiederanlauf|Auftrag/.test(phase)) index = 1;
      else if (pending) index = 2;
    }
    if (completed) { index = steps.length - 1; phase = "Abgeschlossen"; }
    if (!running && sourcesAwaitMaster && !candidate && !pending) {
      steps = BUILD_STEPS; index = 1; phase = "Masterabgleich ausstehend";
    }
    const source = referenceInFocus ? reference : savedProgress || master;
    const measured = completed || waiting || stopped || failed || unfinished ? null
      : measuredProgress(savedProgress ? source.current : source.progressCurrent,
        savedProgress ? source.total : source.progressTotal);
    const stateLabel = failed ? "fehlgeschlagen" : stopped || (waiting ? conflicts ? "Entscheidung erforderlich" : "Übernahme ausstehend"
      : unfinished ? "Prüfung erforderlich" : completed ? "abgeschlossen" : "läuft");
    const stage = steps[index];
    const step = `Schritt ${index + 1} von ${steps.length}`;
    const suffix = measured ? `${measured.percent} % dieses Teilschritts · ${measured.count}` : "";
    const detail = [step, stage, phase && phase !== stage ? phase : "", suffix,
      stateLabel !== "läuft" && stateLabel !== "abgeschlossen" ? stateLabel : ""].filter(Boolean).join(" · ");
    const compactStatus = completed ? "Abgeschlossen"
      : [`${index + 1}/${steps.length} ${stage}`, measured ? `${measured.percent} %` : "",
        stateLabel === "läuft" ? "" : stateLabel].filter(Boolean).join(" · ");
    const compact = `Datenbank-Update\n${compactStatus}`;
    return { step: index + 1, totalSteps: steps.length, stage, phase, percent: measured?.percent ?? null,
      detail, compact, state: stateLabel, running, completed, sourceFailure,
      className: failed ? "failed" : stopped || waiting || unfinished ? "review" : running || busy ? "taxonomy" : "current" };
  }

  global.SpeciesExplorerTaxonomyProgress = Object.freeze({ measuredProgress, taxonomyProgressPresentation });
})(globalThis);
