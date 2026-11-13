import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { assertCompletionCloseReady } from "./close-guard.mjs";
import { UPDATE_RUN_PATTERN } from "./proof.mjs";
import { completionError, createCompletionStore, DEVICE_PATTERN, ID_PATTERN } from "./storage.mjs";

export const COMPLETION_ACTIONS = Object.freeze(["none", "exit-explorer", "shutdown", "restart"]);
const ACTIVE = new Set(["selected", "waiting-update", "awaiting-display", "countdown", "blocked"]);
const CLAIMED = new Set(["claimed", "requested", "uncertain", "failed"]);
const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const defaultClock = { now: () => Date.now(), monotonic: () => performance.now(), setTimeout, clearTimeout };

export function createUpdateCompletionService({ stateRoot, deviceId, deviceName, proofReader,
  readCloseState, prepareClose, execute, store = createCompletionStore({ stateRoot, deviceId }),
  clock = defaultClock, sessionId = randomUUID(), countdownSeconds = 60,
  onChange = () => {}, onError = () => {}, verifyStartBinding = ({ selection, workflow }) =>
    Date.parse(workflow.startedAt) >= Date.parse(selection.selectedAt) } = {}) {
  if (!DEVICE_PATTERN.test(deviceId || "") || !ID_PATTERN.test(sessionId || "") || !deviceName
    || !proofReader?.read || !proofReader?.readWorkflow || typeof readCloseState !== "function"
    || typeof prepareClose !== "function" || typeof execute !== "function" || !Number.isInteger(countdownSeconds)
    || countdownSeconds < 15 || countdownSeconds > 300 || ["now", "monotonic", "setTimeout", "clearTimeout"].some((key) => typeof clock[key] !== "function")) throw new TypeError("Lokales Gerät, echte Abschlussquelle, Schließ-/Ausführungsadapter und 15–300 Sekunden Countdown sind erforderlich.");
  let serial = Promise.resolve(), closed = false, timer = null, monitoring = false, dispatching = "", lastRuntimeError = "";
  const countdowns = new Map();
  const nowIso = () => new Date(clock.now()).toISOString();
  function exclusive(operation) {
    const pending = serial.catch(() => {}).then(operation);
    serial = pending.catch(() => {});
    return pending;
  }
  function assertOpen() { if (closed) throw completionError("Die lokale Abschlussbegleitung ist beendet."); }
  function assertDevice(selectedDeviceId = deviceId) {
    if (selectedDeviceId !== deviceId) throw completionError("Diese Aktion ist ausschließlich an den bestätigten lokalen PC gebunden.", "UPDATE_COMPLETION_WRONG_DEVICE");
  }
  function validate(record) {
    if (record && (!COMPLETION_ACTIONS.includes(record.action) || !Number.isSafeInteger(record.revision)
      || record.deviceId !== deviceId || record.selectionId !== record.requestId)) throw completionError("Ungültige gespeicherte Abschlussauswahl.");
    return record;
  }
  function snapshot(record) {
    if (!record) return { available: true, deviceId, deviceName, action: "none", status: "inactive", cancellable: false, message: "Nach dem Update nichts tun.", runtimeError: lastRuntimeError };
    const countdown = countdowns.get(record.selectionId);
    const remainingSeconds = record.status === "countdown" && countdown
      ? Math.max(0, Math.ceil((countdown.durationMs - (clock.monotonic() - countdown.started)) / 1000)) : null;
    return { available: true, deviceId, deviceName, action: record.action, status: record.status, selectionId: record.selectionId,
      updateRunId: record.updateRunId || "", revision: record.revision, message: record.message,
      error: record.status === "cancelled" ? "" : record.error || "", runtimeError: lastRuntimeError, remainingSeconds,
      countdownSeconds, presentationToken: record.status === "awaiting-display" ? record.presentationToken : "",
      cancellable: ACTIVE.has(record.status), outcome: record.outcome || null };
  }
  async function save(record, patch) {
    const next = { ...record, ...patch, revision: record.revision + 1, updatedAt: nowIso() };
    await store.save(next);
    try { onChange(snapshot(next)); } catch (error) { onError(error); }
    return next;
  }
  async function load() {
    let record = validate(await store.current());
    if (!record) return null;
    let claim, claimError;
    try { claim = await store.readClaim(record.selectionId); } catch (error) { claimError = error; }
    if ((claim || claimError) && !CLAIMED.has(record.status)) {
      return save(record, { status: "uncertain", error: claimError?.message || "",
        message: "Die Ausführung wurde bereits beansprucht; ihr Ausgang ist ungeklärt. Keine automatische Wiederholung." });
    }
    if (record.sessionId !== sessionId && ACTIVE.has(record.status)) {
      countdowns.delete(record.selectionId);
      record = await save(record, { status: "disarmed", deadlineAt: null,
        message: "Die frühere Abschlussauswahl wurde beim Programmneustart deaktiviert. Für einen neuen Auftrag erneut wählen." });
    } else if (record.sessionId !== sessionId && record.status === "claimed") {
      record = await save(record, { status: "uncertain", message: "Der letzte Ausführungsversuch wurde unterbrochen. Sein Ausgang wird nicht automatisch wiederholt." });
    }
    return record;
  }
  function schedule(record) {
    if (!monitoring || closed || timer || !record || !ACTIVE.has(record.status) || record.status === "selected") return;
    timer = clock.setTimeout(() => {
      timer = null;
      void api.evaluate().catch((error) => { lastRuntimeError = error.message; onError(error); });
    }, record.status === "countdown" ? 1_000 : 10_000);
    timer?.unref?.();
  }
  async function readCurrentUnderLock(operation) {
    return store.exclusive(async () => operation(await load()));
  }
  async function markResult(context, patch) {
    return store.exclusive(async () => {
      const record = validate(await store.read(context.selectionId));
      if (!record || record.claimId !== context.claimId) throw completionError("Der beanspruchte Abschlussauftrag wurde verändert.");
      return save(record, patch);
    });
  }
  const api = {
    deviceId, deviceName, sessionId,
    async status() {
      return exclusive(async () => {
        const initial = await store.current();
        if (!initial) return snapshot(null);
        return readCurrentUnderLock((record) => snapshot(record));
      });
    },
    async prepareSelection({ action = "none", deviceId: selectedDeviceId = deviceId, requestId = randomUUID() } = {}) {
      return exclusive(async () => {
        assertOpen(); assertDevice(selectedDeviceId);
        if (!COMPLETION_ACTIONS.includes(action) || !ID_PATTERN.test(requestId)) throw completionError("Unbekannte Abschlussaktion oder Anfrage.");
        return readCurrentUnderLock(async (current) => {
          const existing = validate(await store.read(requestId));
          if (existing) {
            if (existing.action !== action) throw completionError("Diese Anfrage gehört bereits zu einer anderen Abschlussauswahl.");
            return snapshot(existing); // Idempotent response retry never creates a new selection.
          }
          if (current && ACTIVE.has(current.status)) throw completionError("Die bisherige Abschlussauswahl zuerst abbrechen.");
          const workflow = await proofReader.readWorkflow();
          const record = { schemaVersion: 1, requestId, selectionId: requestId, deviceId, deviceName, sessionId,
            action, status: action === "none" ? "inactive" : "selected", revision: 1, selectedAt: nowIso(), updatedAt: nowIso(),
            baselineRunId: workflow?.updateRunId || "", updateRunId: "", error: "",
            message: action === "none" ? "Nach dem Update nichts tun." : `Für den nächsten bestätigten Updateauftrag auf ${deviceName} vorgemerkt.` };
          await store.save(record); await store.pointTo(record);
          return snapshot(record);
        });
      });
    },
    async bindStartedRun({ selectionId, updateRunId, deviceId: selectedDeviceId = deviceId } = {}) {
      return exclusive(async () => {
        assertOpen(); assertDevice(selectedDeviceId);
        return readCurrentUnderLock(async (record) => {
          if (!record || record.selectionId !== selectionId || record.sessionId !== sessionId) throw completionError("Die Abschlussauswahl gehört nicht zum aktuellen lokalen Start.");
          if (record.updateRunId === updateRunId && record.status !== "selected") return snapshot(record);
          if (!["selected", "inactive"].includes(record.status) || !UPDATE_RUN_PATTERN.test(updateRunId || "")) throw completionError("Diese Abschlussauswahl kann nicht an einen anderen Auftrag gebunden werden.");
          const workflow = await proofReader.readWorkflow();
          if (!workflow || workflow.updateRunId !== updateRunId || updateRunId === record.baselineRunId
            || !await verifyStartBinding({ selection: copy(record), workflow: copy(workflow) })) {
            throw completionError("Der tatsächlich neu gespeicherte Updateauftrag passt nicht zur Auswahl vor dem Start.", "UPDATE_COMPLETION_STALE_RUN");
          }
          record = await save(record, { updateRunId, startedAt: workflow.startedAt,
            status: record.action === "none" ? "inactive" : "waiting-update", message: record.action === "none" ? "Nach dem Update nichts tun." : "Wartet auf den vollständig erfolgreichen Gesamtauftrag." });
          schedule(record);
          return snapshot(record);
        });
      });
    },
    async acknowledgeCountdown({ selectionId, updateRunId, presentationToken, deviceId: selectedDeviceId = deviceId } = {}) {
      return exclusive(async () => {
        assertOpen(); assertDevice(selectedDeviceId);
        return readCurrentUnderLock(async (record) => {
          if (!record || record.selectionId !== selectionId || record.updateRunId !== updateRunId || record.sessionId !== sessionId) throw completionError("Der angezeigte Countdown gehört nicht zum lokalen Auftrag.");
          if (record.status === "countdown" && record.presentationToken === presentationToken) return snapshot(record);
          if (record.status !== "awaiting-display" || !ID_PATTERN.test(presentationToken || "") || presentationToken !== record.presentationToken) throw completionError("Der Countdown wurde nicht frisch angezeigt.");
          assertCompletionCloseReady(await readCloseState({ selectionId, updateRunId, deviceId }), deviceId);
          countdowns.set(selectionId, { started: clock.monotonic(), durationMs: countdownSeconds * 1000 });
          record = await save(record, { status: "countdown", deadlineAt: new Date(clock.now() + countdownSeconds * 1000).toISOString(),
            message: `Gewählte Abschlussaktion auf ${deviceName} in ${countdownSeconds} Sekunden. Jetzt noch abbrechbar.` });
          schedule(record);
          return snapshot(record);
        });
      });
    },
    async cancel({ selectionId, updateRunId, deviceId: selectedDeviceId = deviceId } = {}) {
      return exclusive(async () => {
        assertOpen(); assertDevice(selectedDeviceId);
        return readCurrentUnderLock(async (record) => {
          if (!record || record.selectionId !== selectionId || updateRunId && record.updateRunId !== updateRunId) throw completionError("Die Abwahl gehört nicht zum lokalen Auftrag.");
          if (record.status === "cancelled") return snapshot(record);
          if (!ACTIVE.has(record.status)) throw completionError("Diese Abschlussaktion wurde bereits beendet oder beansprucht. Keine automatische Wiederholung.");
          countdowns.delete(selectionId);
          return snapshot(await save(record, { status: "cancelled", deadlineAt: null, message: "Abschlussaktion abgewählt. Der Explorer bleibt geöffnet." }));
        });
      });
    },
    async evaluate() {
      return exclusive(async () => {
        assertOpen();
        let context = null;
        let record = await readCurrentUnderLock(async (current) => {
          if (!current || !ACTIVE.has(current.status) || current.status === "selected") return current;
          let completion;
          try { completion = await proofReader.read(); }
          catch (error) {
            countdowns.delete(current.selectionId);
            return save(current, { status: "blocked", deadlineAt: null, error: error.message,
              message: "Der gespeicherte Gesamtabschluss ist momentan nicht sicher lesbar. Keine Abschlussaktion." });
          }
          const { workflow, proof } = completion;
          if (closed) return current;
          if (workflow?.updateRunId !== current.updateRunId) return save(current, { status: "disarmed", message: "Der gespeicherte Gesamtauftrag wurde gewechselt. Keine Abschlussaktion." });
          if (!proof.ready) {
            countdowns.delete(current.selectionId);
            return save(current, { status: proof.terminal ? "disarmed" : "waiting-update", deadlineAt: null, message: proof.reason });
          }
          if (current.proofRevision && current.proofRevision !== proof.proofRevision) return save(current, { status: "disarmed", message: "Der bestätigte Gesamtabschluss hat sich verändert. Keine Abschlussaktion." });
          try { assertCompletionCloseReady(await readCloseState({ selectionId: current.selectionId, updateRunId: current.updateRunId, deviceId }), deviceId,
            { requireVisibleCountdown: current.status === "countdown" }); }
          catch (error) {
            countdowns.delete(current.selectionId);
            return save(current, { status: "blocked", deadlineAt: null, error: error.message, message: error.message });
          }
          if (closed) return current;
          if (current.status !== "countdown") {
            if (current.status === "awaiting-display") return current;
            return save(current, { status: "awaiting-display", proofRevision: proof.proofRevision, presentationToken: randomUUID(),
              deadlineAt: null, error: "", message: `Erfolgreich abgeschlossen. Abbrechbaren Countdown für ${deviceName} anzeigen.` });
          }
          const countdown = countdowns.get(current.selectionId);
          if (!countdown) return save(current, { status: "disarmed", message: "Der Countdown ist in dieser Sitzung nicht mehr frisch bestätigt." });
          if (clock.monotonic() - countdown.started < countdown.durationMs) return current;
          // Renderer/close-state queries may yield while another run starts.
          // Rebind the final saved completion before creating the irreversible claim.
          let final;
          try { final = await proofReader.read(); }
          catch (error) {
            countdowns.delete(current.selectionId);
            return save(current, { status: "blocked", deadlineAt: null, error: error.message,
              message: "Der letzte Updateabschluss konnte nicht sicher geprüft werden. Keine Abschlussaktion." });
          }
          if (closed) return current;
          if (!final.proof.ready || final.workflow?.updateRunId !== current.updateRunId || final.proof.proofRevision !== proof.proofRevision) {
            return save(current, { status: "disarmed", message: "Der Updateabschluss hat sich während der letzten Schließprüfung geändert. Keine Abschlussaktion." });
          }
          context = { schemaVersion: 1, claimId: randomUUID(), selectionId: current.selectionId, sessionId,
            updateRunId: current.updateRunId, deviceId, action: current.action, proofRevision: proof.proofRevision, claimedAt: nowIso() };
          if (!await store.claim(context)) {
            context = null;
            return save(current, { status: "uncertain", message: "Diese Aktion wurde bereits beansprucht. Keine automatische Wiederholung." });
          }
          current = await save(current, { status: "claimed", claimId: context.claimId,
            message: "Abschlussaktion eindeutig beansprucht. Eigene Arbeiten werden regulär geschlossen." });
          return current;
        });
        if (context) {
          dispatching = context.claimId;
          try {
            const receipt = await prepareClose(copy(context));
            const outcome = await execute(copy(context), receipt);
            record = await markResult(context, { status: "requested", outcome: copy(outcome || { requested: true }), error: "",
              message: "Die gewählte Abschlussaktion wurde angefordert. Keine automatische Wiederholung." });
          } catch (error) {
            record = await markResult(context, { status: "uncertain", error: error.message,
              message: "Schließen oder Ausführung wurde nicht sicher bestätigt. Bitte prüfen; keine automatische Wiederholung." });
          } finally { dispatching = ""; countdowns.delete(context.selectionId); }
        }
        schedule(record);
        return snapshot(record);
      });
    },
    async readClaim(selectionId) { return copy(await store.readClaim(selectionId)); },
    async consumeClaimExecution(context) { return store.consumeClaimExecution(copy(context)); },
    startMonitoring() { assertOpen(); monitoring = true; void api.evaluate().catch((error) => { lastRuntimeError = error.message; onError(error); }); },
    async close() {
      closed = true; monitoring = false;
      if (timer) clock.clearTimeout(timer);
      timer = null;
      // The regular server close can be called by prepareClose itself. The
      // already durable claim must finish outside that server without deadlock.
      if (dispatching) return;
      await serial;
      const current = await store.current();
      if (current?.sessionId === sessionId && ACTIVE.has(current.status)) await store.exclusive(async () => {
        const record = validate(await store.current());
        if (record?.sessionId === sessionId && ACTIVE.has(record.status)) await save(record,
          { status: "disarmed", message: "Der Explorer wurde geschlossen; die frühere Abschlussauswahl ist deaktiviert." });
      });
    },
  };
  return api;
}
