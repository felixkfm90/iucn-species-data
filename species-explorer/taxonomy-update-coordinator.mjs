import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { masterJobDirectory } from "./taxonomy-master-job.mjs";
import { assertRestartScope, isPreBuildRestart, readRestartInputs, restartDigest } from "./taxonomy-update-restart.mjs";
import * as classificationAutomation from "./taxonomy-classification-automation.mjs";

const DECISIONS = new Set(["refresh-and-build", "rebuild-master", "build-corrections", "apply-corrections", "sync-lightroom", "activate", "current"]);
const RUNNING = new Set(["sources", "building", "activating", "applying-corrections", "syncing-lightroom"]);
const WAITING = new Set(["waiting-lightroom", "waiting-usage"]);
const STOPPED = new Set(["failed", "partial", "stale", "interrupted", "paused", "pausing"]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => String(value ?? "").trim();
const candidateId = (status) => text(status.lifecycle?.candidate?.candidateId);
const identityRevision = (status) => text(status.identities?.revision || status.identities?.currentRevision);
const activeVersion = (status) => text(status.lifecycle?.active?.candidateId || status.lifecycle?.active?.masterVersion);

function failure(message, code = "UPDATE_WORKFLOW_BLOCKED") {
  return Object.assign(new Error(message), { code, statusCode: 409 });
}

function baseline(status) {
  return {
    masterVersion: activeVersion(status), candidateId: candidateId(status),
    referenceRelease: text(status.reference?.activeRelease),
    correctionsRevision: text(status.corrections?.currentRevision),
    identityRevision: identityRevision(status),
  };
}

function assertHealthy(status, label) {
  if (!status || typeof status !== "object") throw failure(`${label}: kein gültiger Status verfügbar.`);
  if (["failed", "partial", "stale"].includes(status.status) || status.error) {
    throw failure([status.message, status.error].filter(Boolean).join(" ") || `${label} ist fehlgeschlagen.`, "UPDATE_OPERATION_FAILED");
  }
}

function assertPairCurrent(master, maintenance, expectedRelease = "") {
  assertHealthy(master, "Gesamtaktualisierung");
  assertHealthy(maintenance, "Quellenaktualisierung");
  if (master.active || maintenance.active || !activeVersion(master) || master.lifecycle?.candidate
    || master.reference?.status === "error" || master.reference?.needsMasterRebuild
    || master.corrections?.pending || master.identities?.pending || master.lightroomPackage?.status !== "current"
    || master.lightroomPackage?.needsRebuild || (master.buildJob?.available && master.buildJob.status !== "ready")
    || (expectedRelease && text(master.reference?.activeRelease) !== expectedRelease)) {
    throw failure("Quellen, Master und Lightroom-Suchpaket sind noch nicht gemeinsam aktuell.", "UPDATE_NOT_COMPLETE");
  }
}

// The coordinator owns sequencing, never taxonomy decisions or the catalog
// proof. All mutations remain guarded by the existing injected services.
export class TaxonomyUpdateCoordinator {
  constructor({ taxonomyRoot, maintenanceService, masterService, checkStartReady = async () => ({ ready: false, reason: "catalog-usage" }),
    prepareStart = async () => {}, onStateChange = async () => {},
    readProtectedUsageRenewalTarget = (root) => classificationAutomation.pendingClassificationUsageRenewalTarget(root),
    prepareProtectedUsageRenewal = async () => { throw failure("Die gespeicherte automatische Vormerkung benötigt eine gezielte erneute FN-Prüfung."); },
    now = () => new Date(), pollIntervalMs = 10000, setTimer = setTimeout, clearTimer = clearTimeout,
    isRestartBlocked = () => false,
    writeState = atomicWriteJson, readState = async (file, { maxBytes = 0 } = {}) => {
      try {
        if (maxBytes && (await fs.stat(file)).size > maxBytes) throw failure("Der gespeicherte Aufbaunachweis überschreitet seine zulässige Größe.");
        return JSON.parse(await fs.readFile(file, "utf8"));
      }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
    } } = {}) {
    if (!taxonomyRoot || !maintenanceService || !masterService) throw new TypeError("Taxonomiespeicher und beide Wartungsdienste sind erforderlich.");
    this.file = path.join(path.resolve(taxonomyRoot), "master", "update-workflow.json");
    this.maintenance = maintenanceService;
    this.master = masterService;
    this.checkStartReady = checkStartReady;
    this.prepareStart = prepareStart;
    this.readProtectedUsageRenewalTarget = readProtectedUsageRenewalTarget;
    this.prepareProtectedUsageRenewal = prepareProtectedUsageRenewal;
    this.onStateChange = onStateChange;
    this.now = now;
    this.pollIntervalMs = pollIntervalMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.isRestartBlocked = isRestartBlocked;
    this.writeState = writeState;
    this.readState = readState;
    this.job = null;
    this.timer = null;
    this.closed = false;
    this.serial = Promise.resolve();
    this.ownerLock = null;
  }

  status() {
    return { available: true, ...(this.job ? clone(this.job) : { status: "idle", phase: "", updateRunId: "", message: "Kein gespeicherter Aktualisierungsauftrag." }),
      active: Boolean(this.job && (RUNNING.has(this.job.status) || WAITING.has(this.job.status))) };
  }

  isBusy() { return Boolean(this.job && !["completed", "idle"].includes(this.job.status)); }

  exclusive(operation) {
    const current = this.serial.catch(() => {}).then(operation);
    this.serial = current.catch(() => {});
    return current;
  }

  async save(patch) {
    const next = { ...this.job, ...patch, updatedAt: this.now().toISOString() };
    if (RUNNING.has(next.status) || WAITING.has(next.status)) next.completedAt = null;
    await this.writeState(this.file, next);
    this.job = next;
    await this.onStateChange(clone(next));
  }

  async ensureOwnerLock() {
    if (this.ownerLock) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const database = new DatabaseSync(path.join(path.dirname(this.file), "update-workflow-lock.sqlite"));
    try { database.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE"); }
    catch (error) { database.close(); throw failure("Ein anderer Explorer begleitet bereits den gespeicherten Aktualisierungsauftrag.", error.code); }
    this.ownerLock = database;
  }

  schedule() {
    if (this.closed || this.timer || !this.job || (!RUNNING.has(this.job.status) && !WAITING.has(this.job.status))) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.exclusive(() => this.advance()).catch(() => {});
    }, this.pollIntervalMs);
    this.timer?.unref?.();
  }

  async stop(status, message, error = "") {
    await this.save({ status, message, error, completedAt: status === "failed" ? this.now().toISOString() : null });
  }

  async start({ confirmed = false, decision, token = "", candidateId: selectedCandidate = "", buildJobId = "", buildJobRevision = "", usageConsent = null } = {}) {
    return this.exclusive(async () => {
      if (this.closed) throw failure("Die Aktualisierungsbegleitung ist geschlossen.");
      if (confirmed !== true) throw failure("Die gesamte Datenbankaktualisierung muss ausdrücklich bestätigt werden.");
      if (!DECISIONS.has(decision)) throw failure("Unbekannter Aktualisierungsweg.");
      await this.ensureOwnerLock();
      const saved = await this.readState(this.file);
      if (saved && !this.job && !["completed", "idle"].includes(saved.status)) {
        throw failure("Ein gespeicherter Aktualisierungsauftrag muss zuerst geprüft und gezielt fortgesetzt werden.");
      }
      const replacingFailedSources = this.job && ["failed", "interrupted"].includes(this.job.status)
        && this.job.phase === "sources" && decision === "refresh-and-build";
      if (this.isBusy() && !replacingFailedSources) throw failure("Ein gespeicherter Aktualisierungsauftrag ist noch offen.");
      const [master, maintenance] = await Promise.all([this.master.status(), this.maintenance.status()]);
      if (master.active || maintenance.active) throw failure("Eine Datenbankaktion läuft bereits.");
      const savedBuild = master.buildJob;
      if (savedBuild?.available && savedBuild.status !== "ready") throw failure("Ein vorhandener Zwischenstand muss gezielt fortgesetzt werden; kein zweiter Aufbau wurde gestartet.");
      let boundCandidate = null;
      if (decision === "activate") {
        const candidate = master.lifecycle?.candidate;
        if (!candidate || savedBuild?.status !== "ready" || savedBuild.updateRunId
          || selectedCandidate !== candidate.candidateId || buildJobId !== savedBuild.id
          || !buildJobRevision || buildJobRevision !== candidate.buildJobRevision) {
          throw failure("Die ausdrücklich gewählte Kandidaten-/Auftragsgrundlage ist nicht frisch oder gehört zu einem anderen Update.");
        }
        boundCandidate = { candidateId: selectedCandidate, buildJobId, buildJobRevision };
      }
      const sourcePlan = decision === "refresh-and-build" ? await this.maintenance.bindUpdatePlan({ token }) : null;
      if (replacingFailedSources) {
        // Preserve the old intent, never delete its imported sources or reports.
        await this.writeState(path.join(path.dirname(this.file), "update-workflow-history", `${this.job.updateRunId}.json`), this.job);
      }
      const job = { schemaVersion: 1, updateRunId: `update-${randomUUID()}`, status: "waiting-lightroom", phase: "start",
        decision, sourcePlan, baseline: baseline(master), boundCandidate, startedAt: this.now().toISOString(),
        usageConsent: usageConsent ? clone(usageConsent) : null,
        sourceCompleted: false, buildStarted: false, automaticFollowupRevision: "", automaticAttemptedCandidates: [],
        message: "Der bestätigte Startauftrag wartet auf geschlossenes Lightroom und einen aktuellen FN-Nutzungsnachweis.", error: "" };
      await this.writeState(this.file, job); // Persist authorization and exact source target before any mutation.
      this.job = job;
      try { await this.prepareStart(clone(job)); }
      catch (error) {
        await this.stop("waiting-usage", error.message, error.message);
        this.schedule();
        return this.status();
      }
      await this.advance();
      return this.status();
    });
  }

  async restartSnapshot() {
    if (this.closed || await this.isRestartBlocked()) throw failure("Eine andere Aktion verhindert die lokale Neustartvorschau.");
    const saved = await this.readState(this.file);
    if (!saved || restartDigest(saved) !== restartDigest(this.job)) throw failure("Der gespeicherte Updateauftrag wurde inzwischen verändert.");
    const [master, maintenance] = await Promise.all([this.master.status(), this.maintenance.status()]);
    let originJob = this.job;
    if (isPreBuildRestart(this.job)) {
      const origin = this.job.restartGuard.identity;
      originJob = await this.readState(path.join(path.dirname(this.file), "update-workflow-history", `${origin.updateRunId}.json`));
      if (!originJob || restartDigest(originJob) !== this.job.restartGuard.originWorkflowRevision
          || originJob.updateRunId !== origin.updateRunId || master.buildJob?.id !== origin.buildJobId) {
        throw failure("Die Ursprungshistorie des lokalen Ersatzauftrags wurde verändert; kein neuer Aufbau.");
      }
    }
    const identity = { updateRunId: originJob.updateRunId, buildJobId: master.buildJob.id,
      referenceRelease: text(originJob.sourcePlan?.releaseId || originJob.baseline.referenceRelease) };
    if (isPreBuildRestart(this.job)) identity.buildJobRevision = this.job.restartGuard.identity.buildJobRevision;
    const inputs = await readRestartInputs({ taxonomyRoot: path.dirname(path.dirname(this.file)), identity,
      master, maintenance, baseline: baseline(master) });
    assertRestartScope(originJob, master, maintenance, inputs.binding.retainedCandidate);
    await this.bindProtectedUsageRenewalTarget(inputs, originJob, master);
    identity.buildJobRevision = inputs.buildJobRevision;
    const token = restartDigest({ job: this.job, identity, inputs });
    return { identity, inputs, originJob, public: { available: true, token, updateRunId: this.job.updateRunId,
      buildJobId: identity.buildJobId, buildJobRevision: identity.buildJobRevision, baseline: inputs.binding.baseline,
      catalogSetRevision: inputs.binding.catalogSetRevision, catalogCount: inputs.catalogs.length } };
  }

  async restartBuildPreview() {
    return this.exclusive(async () => (await this.restartSnapshot()).public);
  }

  async restartBuild({ confirmed = false, token = "", updateRunId = "", buildJobId = "", buildJobRevision = "", usageConsent = null } = {}) {
    return this.exclusive(async () => {
      if (confirmed !== true || usageConsent?.allCatalogsConfirmed !== true || usageConsent?.noChangesUntilClose !== true) {
        throw failure("Der neue lokale Aufbau und alle FN-Kataloge müssen ausdrücklich bestätigt werden.");
      }
      await this.ensureOwnerLock();
      const preview = await this.restartSnapshot();
      if (token !== preview.public.token || updateRunId !== preview.public.updateRunId
          || buildJobId !== preview.identity.buildJobId || buildJobRevision !== preview.identity.buildJobRevision) {
        throw failure("Die gebundene Neustartvorschau wurde verändert. Bitte erneut prüfen und bestätigen.");
      }
      const old = clone(this.job), history = path.join(path.dirname(this.file), "update-workflow-history", `${old.updateRunId}.json`);
      const archived = await this.readState(history);
      if (archived && restartDigest(archived) !== restartDigest(old)) throw failure("Die vorhandene Auftragshistorie darf nicht ersetzt werden.");
      if (!archived) await this.writeState(history, old);
      if ((await this.restartSnapshot()).public.token !== token) throw failure("Die Neustartvorschau hat sich während der Auftragssicherung verändert.");
      const job = { schemaVersion: 1, updateRunId: `update-${randomUUID()}`, status: "waiting-usage", phase: "start",
        decision: "rebuild-master", sourcePlan: null, sourceCompleted: true, buildStarted: false, boundCandidate: null,
        baseline: preview.inputs.binding.baseline, startedAt: this.now().toISOString(),
        usageConsent: clone(usageConsent), confirmedCatalogs: preview.inputs.catalogs, freshUsageCapture: true,
        restartGuard: { identity: preview.identity, binding: preview.inputs.binding, originWorkflowRevision: restartDigest(preview.originJob) },
        ...(preview.inputs.protectedUsageRenewalTarget ? { protectedUsageRenewalTarget: preview.inputs.protectedUsageRenewalTarget } : {}),
        automaticFollowupRevision: "", automaticAttemptedCandidates: [],
        message: "Der neue lokale Auftrag wartet auf eine frische FN-Erfassung und geschlossenes Lightroom.", error: "" };
      await this.writeState(this.file, job);
      this.job = job;
      try { await this.prepareStart(clone(job)); }
      catch (error) {
        await this.stop("waiting-usage", error.message, error.message);
        this.schedule();
        return this.status();
      }
      await this.advance();
      return this.status();
    });
  }

  async assertRestartGuard(master, maintenance) {
    if (!this.job.restartGuard || this.job.buildStarted) return;
    if (await this.isRestartBlocked()) throw failure("Eine andere Aktion verhindert den lokalen Aufbau.");
    const origin = await this.readState(path.join(path.dirname(this.file), "update-workflow-history", `${this.job.restartGuard.identity.updateRunId}.json`));
    if (!origin || restartDigest(origin) !== this.job.restartGuard.originWorkflowRevision) {
      throw failure("Die Ursprungshistorie wurde während des Wartens verändert; kein neuer Aufbau.");
    }
    const inputs = await readRestartInputs({ taxonomyRoot: path.dirname(path.dirname(this.file)),
      identity: this.job.restartGuard.identity, master, maintenance, baseline: baseline(master) });
    await this.bindProtectedUsageRenewalTarget(inputs, origin, master);
    if (restartDigest(inputs.binding) !== restartDigest(this.job.restartGuard.binding)) {
      throw failure("Der für den Neustart bestätigte Eingang wurde verändert. Bitte eine neue Vorschau bestätigen.");
    }
  }

  async bindProtectedUsageRenewalTarget(inputs, origin, master) {
    if (!origin.automaticFollowupRevision) return;
    const target = await this.readProtectedUsageRenewalTarget(path.dirname(path.dirname(this.file)));
    if (!target || !/^[a-f0-9]{64}$/.test(target.identityReviewRevision || "") || target.identityReviewRevision !== origin.automaticFollowupRevision
        || master.identities?.revision !== target.identityReviewRevision || target.activeMasterId !== origin.baseline.masterVersion
        || target.candidateId !== inputs.binding.retainedCandidate?.candidateId || !/^[a-f0-9]{64}$/.test(target.eventRevision || "")
        || !/^[a-f0-9]{64}$/.test(target.identitySources || "") || !/^[a-f0-9]{64}$/.test(target.identityInputs || "")
        || !Array.isArray(target.eventIds) || !target.eventIds.length || target.eventIds.length > 10000 || new Set(target.eventIds).size !== target.eventIds.length
        || target.eventIds.some((id) => !/^[a-f0-9]{64}$/.test(id)) || !Array.isArray(target.usageRevisions) || !target.usageRevisions.length
        || new Set(target.usageRevisions).size !== target.usageRevisions.length || target.usageRevisions.some((revision) => !/^[a-f0-9]{64}$/.test(revision))) {
      throw failure("Die automatische Vormerkung gehört nicht unverändert zum geschützten lokalen Neustart.");
    }
    inputs.protectedUsageRenewalTarget = clone(target);
    inputs.binding.protectedUsageRenewalTargetRevision = restartDigest(target);
  }

  async restore() {
    return this.exclusive(async () => {
      if (this.closed) throw failure("Die Aktualisierungsbegleitung ist geschlossen.");
      if (!await this.readState(this.file)) return this.status(); // Idle startup is entirely read-only.
      await this.ensureOwnerLock();
      const saved = await this.readState(this.file); // Re-read under cross-process ownership.
      if (!saved) return this.status();
      if (saved.schemaVersion !== 1 || !/^update-[a-f0-9-]{36}$/.test(saved.updateRunId) || !DECISIONS.has(saved.decision)
        || !Array.isArray(saved.automaticAttemptedCandidates)) throw failure("Der gespeicherte Aktualisierungsauftrag ist ungültig.");
      this.job = saved;
      if (RUNNING.has(saved.status)) {
        await this.stop("interrupted", saved.status === "sources"
          ? "Quellenlauf wurde unterbrochen. Ein importierter CoL-Stand belegt keine abgeschlossene Ergänzungsprüfung; bitte den Auftrag prüfen."
          : "Die gespeicherte Phase wurde unterbrochen. Eine gezielte technische Fortsetzung ist erforderlich.");
      } else this.schedule(); // Only the already confirmed pre-start wait resumes automatically.
      return this.status();
    });
  }

  async readyForPhase(nextPhase) {
    const proof = await this.checkStartReady({ job: clone(this.job) });
    if (proof?.ready !== true || !text(proof.usageRevision)) {
      await this.save({ status: proof?.reason === "lightroom-open" ? "waiting-lightroom" : "waiting-usage", phase: nextPhase,
        message: proof?.message || "Aktueller vollständiger FN-Nutzungsnachweis erforderlich.", error: "" });
      return false;
    }
    await this.save({ usageRevision: text(proof.usageRevision) });
    return true;
  }

  async assertOwned(master) {
    const job = master.buildJob;
    if (this.job.boundCandidate) {
      const bound = this.job.boundCandidate;
      if (job?.updateRunId || job?.id !== bound.buildJobId || candidateId(master) !== bound.candidateId
        || master.lifecycle?.candidate?.buildJobRevision !== bound.buildJobRevision) {
        throw failure("Der gewählte Kandidat wurde ersetzt; keine fremde Übernahme.");
      }
    } else if (!job?.available || job.updateRunId !== this.job.updateRunId) {
      throw failure("Der Masteraufbau gehört nicht zum gespeicherten Aktualisierungsauftrag.");
    }
  }

  async ownedBuildReady(master) {
    await this.assertOwned(master);
    const job = master.buildJob;
    if (["paused", "pausing", "interrupted"].includes(job.status)) {
      await this.stop(job.status === "interrupted" ? "interrupted" : "paused",
        master.message || "Der eigene gesicherte Aufbau wartet auf gezielte Fortsetzung.");
      return false;
    }
    assertHealthy(job, "Eigener Masteraufbau");
    if (job.status !== "ready") return false;
    if (this.job.boundCandidate) return true; // Explicit legacy binding is already checked above.
    const directory = masterJobDirectory(path.dirname(path.dirname(this.file)), job.id);
    const state = await this.readState(path.join(directory, "state.json"), { maxBytes: 512 * 1024 });
    if (!state || state.schemaVersion !== 1 || state.id !== job.id) throw failure("Der fertige eigene Aufbau hat keinen eindeutigen Zustandsnachweis.");
    if (["paused", "pausing", "interrupted"].includes(state.status)) {
      await this.stop(state.status === "interrupted" ? "interrupted" : "paused",
        "Der eigene gesicherte Aufbau wartet auf gezielte Fortsetzung.");
      return false;
    }
    assertHealthy(state, "Eigener Masteraufbau");
    if (state.status !== "ready") return false;
    if (text(state.candidateId)) {
      if (state.candidateId !== candidateId(master)) throw failure("Der vorhandene Kandidat gehört nicht zum fertigen eigenen Aufbau.");
    } else {
      // Older ready/resumed states may omit candidateId. Read only their recipe
      // at this phase boundary, never hash inputs or open a database on a poll.
      const recipe = await this.readState(path.join(directory, "recipe.json"), { maxBytes: 12 * 1024 * 1024 });
      if (!recipe || recipe.schemaVersion !== 1 || recipe.id !== job.id || recipe.updateRunId !== this.job.updateRunId
          || !text(recipe.revision) || recipe.revision !== master.lifecycle?.candidate?.buildJobRevision) {
        throw failure("Der vorhandene Kandidat gehört nicht zum Rezept des fertigen eigenen Aufbaus.");
      }
    }
    return true;
  }

  async beginBuild({ alreadyReady = false } = {}) {
    if (!alreadyReady && !await this.readyForPhase("build")) return;
    if (this.closed) return;
    if (this.job.restartGuard && !this.job.buildStarted) {
      if (this.job.protectedUsageRenewalTarget) {
        await this.save({ status: "waiting-usage",
          message: "FN-Nachweis registriert. Gespeicherte Entscheidungen werden erneut geprüft." });
        if (this.closed) return;
        const renewed = await this.prepareProtectedUsageRenewal({ job: clone(this.job), usageRevision: this.job.usageRevision });
        if (!/^[a-f0-9]{64}$/.test(renewed?.receiptRevision || "")) throw failure("Die erneute FN-Prüfung hat keinen gebundenen Abschlussnachweis.");
        await this.save({ protectedUsageRenewalRevision: renewed.receiptRevision });
        if (this.closed) return;
      }
      const [master, maintenance] = await Promise.all([this.master.status(), this.maintenance.status()]);
      await this.assertRestartGuard(master, maintenance);
    }
    await this.save({ status: "building", phase: "build", buildStarted: true, boundCandidate: null,
      message: "Der lokale Master wird aus den gebundenen Quellen aufgebaut.", error: "" });
    if (this.closed) return;
    await this.master.startBuild({ refreshProviders: false, updateRunId: this.job.updateRunId });
  }

  async beginIntent() {
    const [master, maintenance] = await Promise.all([this.master.status(), this.maintenance.status()]);
    if (master.active || maintenance.active) throw failure("Eine fremde Datenbankaktion läuft; der gespeicherte Auftrag wurde nicht gestartet.");
    if (JSON.stringify(baseline(master)) !== JSON.stringify(this.job.baseline)) {
      throw failure("Der gebundene Ausgangsstand hat sich während des Wartens verändert. Bitte die neue Vorschau bestätigen.");
    }
    if (this.job.decision === "refresh-and-build") {
      await this.save({ status: "sources", phase: "sources", message: "Die bestätigten Quellen werden aktualisiert." });
      if (this.closed) return;
      await this.maintenance.startUpdate({ updatePlan: this.job.sourcePlan });
    } else if (["rebuild-master", "build-corrections"].includes(this.job.decision)) await this.beginBuild({ alreadyReady: true });
    else if (this.job.decision === "activate") await this.inspectCandidate(master, { alreadyReady: true });
    else if (this.job.decision === "current") await this.finish(master, maintenance);
    else await this.beginStandalonePhase();
  }

  async beginStandalonePhase() {
    const correction = this.job.decision === "apply-corrections";
    await this.save({ status: correction ? "applying-corrections" : "syncing-lightroom", phase: correction ? "corrections" : "package",
      message: correction ? "Eigene Namen werden gemeinsam geprüft und übernommen." : "Lightroom-Suchpaket wird geprüft und synchronisiert.", error: "" });
    if (this.closed) return;
    if (correction) await this.master.applyCorrections({ confirmed: true });
    else await this.master.syncLightroomPackage();
  }

  standaloneNeedsRetry(master) {
    const phase = this.job.phase.replace(/^resume-/, "");
    const correction = phase === "corrections";
    if (!["corrections", "package"].includes(phase) || this.job.buildStarted || this.job.boundCandidate
      || this.job.decision !== (correction ? "apply-corrections" : "sync-lightroom")
      || JSON.stringify(baseline(master)) !== JSON.stringify(this.job.baseline)) {
      throw failure("Die gebundene Grundlage des Namens- oder Paketabgleichs wurde verändert. Bitte den gespeicherten Auftrag prüfen.");
    }
    return correction ? master.corrections?.pending === true
      : master.lightroomPackage?.needsRebuild === true || ["missing", "stale"].includes(master.lightroomPackage?.status);
  }

  async resumeStandalonePhase() {
    // Re-read after the asynchronous catalog proof, never retarget the original
    // authorization. Already committed effects only need their completion proof.
    const [master, maintenance] = await Promise.all([this.master.status(), this.maintenance.status()]);
    if (master.active || maintenance.active) throw failure("Eine Datenbankaktion ist noch aktiv.");
    if (!this.standaloneNeedsRetry(master)) await this.finish(master, maintenance);
    else await this.beginStandalonePhase();
  }

  async inspectCandidate(master, { alreadyReady = false } = {}) {
    assertHealthy(master, "Masterprüfung");
    if (!await this.ownedBuildReady(master)) return;
    const blocking = Number(master.lifecycle?.blockingConflictCount ?? master.lifecycle?.blockingConflicts?.length ?? 0);
    const id = candidateId(master);
    if (!id) throw failure("Der zum Auftrag gehörige Masterkandidat fehlt.");
    if (blocking) {
      const classificationCount = Number(master.lifecycle?.candidate?.classificationReview?.total || 0);
      if (classificationCount && !this.job.automaticFollowupRevision && !this.job.automaticAttemptedCandidates.includes(id)) {
        if (!alreadyReady && !await this.readyForPhase("candidate")) return;
        await this.save({ phase: "automatic-preview" });
        const preview = await this.master.reviewIdentity("classificationAutomaticPreview", {});
        if (preview.available !== true) {
          await this.stop("waiting-usage", preview.message || "Verlässliche FN-Nutzung fehlt.");
          await this.save({ phase: "candidate" });
          return;
        }
        if (preview.candidateId !== id) throw failure("Die automatische Vorschau gehört nicht mehr zum Kandidaten.");
        if (Number(preview.matching || 0) + Number(preview.deferred || 0) > 0) {
          // Only an uncertain mutation outcome blocks replay. A read-only
          // preview with missing usage can be retried after a fresh proof.
          await this.save({ phase: "automatic-save", automaticPreviewRevision: text(preview.token),
            automaticAttemptedCandidates: [...this.job.automaticAttemptedCandidates, id] });
          if (this.closed) return;
          const saved = await this.master.reviewIdentity("classificationAutomaticSave", preview);
          if (saved.saved === true) {
            if (!text(saved.revision)) throw failure("Die gespeicherte Klassifikationsvormerkung hat keine Revision.");
            await this.save({ automaticFollowupRevision: saved.revision, automaticProtected: Number(saved.protected || 0) });
            await this.beginBuild({ alreadyReady: true });
            return;
          }
        }
      }
      await this.stop("waiting-decisions", `${blocking} relevante Aktualisierungskonflikte benötigen eine Entscheidung.`);
      return;
    }
    if (master.lifecycle?.canActivate !== true) {
      await this.stop("waiting-decisions", "Der Kandidat ist noch nicht freigegeben. Bitte offene Entscheidungen prüfen.");
      return;
    }
    if (!alreadyReady && !await this.readyForPhase("candidate")) return;
    await this.save({ status: "activating", phase: "activation", activationCandidateId: id,
      message: "Master und Lightroom-Suchpaket werden vollständig geprüft und gemeinsam übernommen." });
    if (this.closed) return;
    await this.master.activate({ confirmed: true, ...(this.job.boundCandidate ? {} : { updateRunId: this.job.updateRunId }) });
  }

  async finish(master = null, maintenance = null) {
    const values = master && maintenance ? [master, maintenance] : await Promise.all([this.master.status(), this.maintenance.status()]);
    const expectedRelease = text(this.job.sourcePlan?.releaseId || this.job.baseline.referenceRelease);
    assertPairCurrent(values[0], values[1], expectedRelease);
    await this.save({ status: "completed", phase: "completed", completedAt: this.now().toISOString(), error: "",
      masterVersion: activeVersion(values[0]), message: "Quellen, Master und Lightroom-Suchpaket sind gemeinsam aktuell." });
  }

  async advance() {
    if (this.closed || !this.job || (!RUNNING.has(this.job.status) && !WAITING.has(this.job.status))) return;
    try {
      if (WAITING.has(this.job.status)) {
        const phase = this.job.phase;
        if (!await this.readyForPhase(phase)) return;
        if (phase === "start") await this.beginIntent();
        else if (phase === "build") await this.beginBuild({ alreadyReady: true });
        else if (phase === "candidate") await this.inspectCandidate(await this.master.status(), { alreadyReady: true });
        else if (phase === "resume-build") await this.resumeExistingBuild();
        else if (["resume-corrections", "resume-package"].includes(phase)) await this.resumeStandalonePhase();
        else throw failure("Die gespeicherte Wartephase ist nicht eindeutig fortsetzbar.");
      } else if (this.job.status === "sources") {
        const source = await this.maintenance.status();
        assertHealthy(source, "Quellenaktualisierung");
        if (!source.active) {
          if (source.status !== "completed") throw failure("Der vollständige Quellenabschluss ist nicht bestätigt.");
          await this.save({ sourceCompleted: true });
          await this.beginBuild();
        }
      } else {
        const master = await this.master.status();
        assertHealthy(master, "Master-/Paketaktualisierung");
        if (master.active) return;
        if (this.job.status === "building") await this.inspectCandidate(master);
        else if (STOPPED.has(master.status) || (master.buildJob?.available && STOPPED.has(master.buildJob.status))) {
          await this.stop(master.status === "paused" || master.buildJob?.status === "paused" ? "paused" : "interrupted",
            master.message || "Der gesicherte Aufbau wartet auf gezielte Fortsetzung.");
          return;
        }
        else await this.finish();
      }
    } catch (error) {
      await this.stop("failed", "Die Aktualisierung wurde sicher angehalten. Der letzte gemeinsame Stand bleibt maßgeblich.", error.message);
    } finally { this.schedule(); }
  }

  async resume({ confirmed = false } = {}) {
    return this.exclusive(async () => {
      if (this.closed || confirmed !== true || !this.job || !["interrupted", "paused", "waiting-decisions", "failed"].includes(this.job.status)) {
        throw failure("Eine gezielte Fortsetzung des gespeicherten Auftrags muss bestätigt werden.");
      }
      if (this.job.phase === "sources") throw failure("Ein unterbrochener Quellenlauf wird nicht aus einem bereits importierten CoL-Stand fortgesetzt. Frische vollständige Quellenprüfung erforderlich.");
      const master = await this.master.status();
      if (master.active || (await this.maintenance.status()).active) throw failure("Eine Datenbankaktion ist noch aktiv.");
      if (this.job.phase === "start") {
        await this.prepareStart({ ...clone(this.job), renewUsageRequest: true });
        await this.save({ status: "waiting-lightroom", error: "" });
        await this.advance();
      } else if (["corrections", "package", "resume-corrections", "resume-package"].includes(this.job.phase)) {
        if (!this.standaloneNeedsRetry(master)) await this.finish(master, await this.maintenance.status());
        else {
          await this.save({ status: "waiting-usage", phase: `resume-${this.job.phase.replace(/^resume-/, "")}`, error: "" });
          await this.advance();
        }
      } else if (this.job.buildStarted && master.buildJob?.status !== "ready") {
        await this.assertOwned(master);
        if (!master.buildJob?.canResume) throw failure("Der eigene gespeicherte Aufbau kann nicht sicher fortgesetzt werden.");
        if (await this.readyForPhase("resume-build")) await this.resumeExistingBuild();
      } else {
        if (this.job.status === "waiting-decisions" && master.identities?.pending && !master.identities?.candidateIncludesCurrent) {
          // This user-confirmed new revision warrants exactly one local rebuild.
          await this.assertOwned(master);
          await this.save({ automaticFollowupRevision: "", error: "" });
          await this.beginBuild();
        } else if (this.job.phase === "activation" && !master.lifecycle?.candidate) await this.finish();
        else {
          await this.save({ status: "building", phase: "candidate", error: "" });
          await this.inspectCandidate(master);
        }
      }
      this.schedule();
      return this.status();
    });
  }

  async resumeExistingBuild() {
    const master = await this.master.status();
    await this.assertOwned(master);
    if (master.active || !master.buildJob?.canResume) throw failure("Der eigene gespeicherte Aufbau kann nicht sicher fortgesetzt werden.");
    await this.save({ status: "building", phase: "build", error: "", message: "Der eigene gesicherte Aufbau wird gezielt fortgesetzt." });
    if (this.closed) return;
    await this.master.resumeBuild({ confirmed: true, updateRunId: this.job.updateRunId });
  }

  async afterConfirmedDecision() {
    return this.exclusive(async () => {
      if (this.closed || this.job?.status !== "waiting-decisions") return this.status();
      try {
        const master = await this.master.status();
        assertHealthy(master, "Masterprüfung nach Entscheidung");
        if (master.active) throw failure("Eine fremde Aktion läuft während der Entscheidungsübergabe.");
        if (!await this.ownedBuildReady(master)) return this.status();
        const count = Number(master.lifecycle?.blockingConflictCount || 0);
        if (!count) await this.inspectCandidate(master);
        else if (master.identities?.pending && !master.identities?.candidateIncludesCurrent
          && Number(master.lifecycle?.candidate?.classificationReview?.total || 0)) {
          const readiness = await this.master.reviewIdentity("classificationDecisionReadiness", {});
          if (readiness.ready === true && readiness.candidateId === candidateId(master)) {
            await this.save({ automaticFollowupRevision: "", error: "" });
            await this.beginBuild();
          }
        }
      } catch (error) {
        await this.stop("failed", "Die Entscheidung ist gespeichert; die technische Fortsetzung wurde sicher angehalten.", error.message);
      }
      this.schedule();
      return this.status();
    });
  }

  async pause() {
    return this.exclusive(async () => {
      if (!this.job || !["building", ...WAITING].includes(this.job.status)) throw failure("Diese Phase kann nicht pausiert werden.");
      if (this.job.status === "building") {
        const master = await this.master.status();
        await this.assertOwned(master);
        await this.master.pauseBuild();
      }
      if (this.timer) this.clearTimer(this.timer);
      this.timer = null;
      await this.stop("paused", "Der gespeicherte Auftrag ist pausiert; der bisherige gemeinsame Stand bleibt aktiv.");
      return this.status();
    });
  }

  async close() {
    this.closed = true;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    await this.serial;
    this.ownerLock?.close();
    this.ownerLock = null;
    // The exact phase intent is already durable. Closing the server does not
    // fabricate success or implicitly stop/resume somebody else's worker.
  }
}

export function createTaxonomyUpdateCoordinator(options) { return new TaxonomyUpdateCoordinator(options); }
