import { check } from "./errors.mjs";
import { digest, objectJson, transportJson } from "./security.mjs";
import { validateSpeciesRecord } from "./species-record.mjs";
import { normalMediaBinding, NORMAL_MEDIA_SLOTS } from "./normal-media.mjs";

const labels = { "portrait.webp": "Artporträt", "map.jpg": "Verbreitungskarte", "sound.mp3": "Tonaufnahme", "spectrogram.webp": "Spektrogramm" };
const stoppedMessages = {
  normal_media_server_required: "Der Projektdienst unterstützt diese Artdateiablage noch nicht. Er muss zuerst aktualisiert werden.",
  normal_media_quota: "Die persönliche Offlineablage hat ihre Speichergrenze erreicht. Bereits gespeicherte Dateien bleiben erhalten.",
  forbidden: "Die Berechtigung wurde geändert. Bitte die aktuelle Projektanmeldung prüfen; gespeicherte Dateien bleiben erhalten.",
  authentication_required: "Bitte erneut am gemeinsamen Projekt anmelden. Bereits gespeicherte Dateien bleiben erhalten.",
  offline: "Die Projektverbindung wurde unterbrochen. Bereits gespeicherte Dateien bleiben erhalten.",
  normal_media_review_changed: "Die Artfassung oder persönliche Projektbindung wurde geändert. Bitte die Auswahl neu prüfen.",
  offline_source_changed: "Die Artfassung oder persönliche Projektbindung wurde geändert. Bitte die Auswahl neu prüfen.",
};
const scope = status => digest(transportJson([status.baseUrl || "", status.projectId || "", status.user?.id || ""]));
const stamp = object => digest(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data }));
const same = (a, b) => transportJson(a) === transportJson(b);

/** Explicit per-species local selection. Uses the existing client cache, never a second download queue. */
export function createExplorerNormalOffline({ withClient } = {}) {
  check(typeof withClient === "function", 500, "offline_unavailable", "Die persönliche Offlineablage ist nicht eingerichtet.");
  const abort = new AbortController(); let closed = false;
  function active() { check(!closed, 409, "client_closed", "Die gemeinsame Projektverbindung ist geschlossen."); }
  function access(state) {
    active();
    check(state?.permissions?.canRead === true && ["online", "offline"].includes(state.status?.connection)
      && ["admin", "publisher", "contributor", "reader"].includes(state.status?.user?.role),
    403, "forbidden", "Bitte mit der berechtigten persönlichen Projektanmeldung öffnen.");
  }
  async function capture(client, state, id, input, download, slot) {
    access(state);
    const keys = ["sourceScope", "expectedRevision", "expectedEditRevision", ...(download ? ["slots"] : [])];
    check(input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === keys.length
      && keys.every(key => Object.hasOwn(input, key)), 400, "invalid_offline_selection", "Bitte ausschließlich die angezeigte Artdateiauswahl verwenden.");
    const object = await client.getObject("species", id); active();
    check(object?.kind === "species" && object.id === id && object.data?.type === "fn-species-record", 409, "species_record_required", "Die Offlineauswahl benötigt eine vollständige gemeinsame Artfassung.");
    validateSpeciesRecord(object.data, id);
    check(input.sourceScope === scope(state.status) && input.expectedRevision === object.revision && input.expectedEditRevision === stamp(object),
      409, "offline_source_changed", "Artfassung oder persönliche Projektanmeldung wurde geändert. Bitte die aktuelle Auswahl neu öffnen.");
    if (state.status.user.role === "reader" || state.status.readOnlySession)
      check(object.approval === "approved" && object.approvedRevision === object.revision, 403, "forbidden", "Diese Artfassung ist für die angemeldete Leseansicht nicht freigegeben.");
    const binding = { baseUrl: state.status.baseUrl, projectId: state.status.projectId, userId: state.status.user.id, role: state.status.user.role };
    const result = { id, object, binding, status: state.status, stamp: stamp(object), readOnlySession: Boolean(state.status.readOnlySession),
      files: (slot ? [slot] : NORMAL_MEDIA_SLOTS).map(name => normalMediaBinding(object.data, { projectId: binding.projectId, slot: name })).filter(Boolean) };
    await current(client, result); return result;
  }
  async function current(client, context) {
    active(); const status = await client.status(); active();
    check(status.baseUrl === context.binding.baseUrl && status.projectId === context.binding.projectId
      && status.user?.id === context.binding.userId && status.user.role === context.binding.role && status.user.version === context.status.user.version
      && Boolean(status.readOnlySession) === context.readOnlySession && ["online", "offline"].includes(status.connection),
    409, "offline_source_changed", "Projekt, Person oder Berechtigung wurde während der Offlineauswahl geändert.");
    const object = await client.getObject("species", context.id); active();
    check(stamp(object) === context.stamp && Boolean(object.localPending) === Boolean(context.object.localPending)
      && Boolean(object.localConflict) === Boolean(context.object.localConflict)
      && (!(context.readOnlySession || context.binding.role === "reader") || object.approval === "approved" && object.approvedRevision === object.revision),
    409, "offline_source_changed", "Die benötigte Artfassung wurde inzwischen geändert. Bereits gespeicherte Dateien bleiben erhalten.");
    return status;
  }
  function checkedMetadata(value, expected) {
    check(value?.metadata?.complete === true
      && same(Object.fromEntries(["contentId", "projectId", "speciesId", "slot", "asset"].map(key => [key, value.metadata[key]])), expected),
    409, "normal_media_changed", "Die Artdatei besitzt keine passende vollständige Quellenbindung.");
  }
  function checkedLocal(value, expected) {
    check(value?.localAvailable === true, 409, "normal_media_changed", "Die Artdatei ist noch nicht vollständig offline gespeichert.");
    checkedMetadata(value, expected);
  }
  return Object.freeze({
    content: (id, slot, input, signal) => withClient(async (client, state) => {
      const context = await capture(client, state, id, input, false, slot), [file] = context.files;
      check(file, 404, "normal_media_missing", "Für diese Artfassung ist keine passende Datei gebunden.");
      const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
      check(!combined.aborted, 409, "normal_media_cancelled", "Die Dateiansicht wurde beendet.");
      let value;
      try { value = await client.normalMedia.readLocal({ contentId: file.contentId, requiredBinding: context.binding }, { signal: combined }); }
      catch (error) { if (error.code !== "normal_media_not_local") throw error; }
      if (!value) {
        const status = await current(client, context);
        check(status.connection === "online", 409, "normal_media_not_local", "Die Projektdatei ist noch nicht für den Offlinezugriff gespeichert.");
        check(!context.object.localPending && !context.object.localConflict, 409, "pending_review", "Bitte die Änderungen dieser Art vor dem Dateiaufruf abgleichen.");
        value = await client.normalMedia.read({ speciesId: id, slot, expectedRevision: context.object.revision,
          expectedDataHash: digest(objectJson(context.object.data)), requiredBinding: context.binding }, { signal: combined });
      }
      await current(client, context);
      check(!combined.aborted, 409, "normal_media_cancelled", "Die Dateiansicht wurde beendet.");
      checkedMetadata(value, file);
      check(Buffer.isBuffer(value.buffer) && value.buffer.length === file.asset.bytes && digest(value.buffer) === file.asset.sha256,
        409, "normal_media_changed", "Die geprüften Dateibytes passen nicht zur gewählten Artfassung.");
      return { metadata: file.asset, buffer: value.buffer };
    }),
    preview: (id, input) => withClient(async (client, state) => {
      const context = await capture(client, state, id, input, false), files = [];
      const supported = typeof client.normalMedia?.describeLocal === "function" && typeof client.normalMedia?.download === "function";
      for (const file of context.files) {
        let localAvailable = false;
        if (supported) {
          try { const local = await client.normalMedia.describeLocal({ contentId: file.contentId, requiredBinding: context.binding }); checkedLocal(local, file); localAvailable = true; }
          catch (error) { if (error.code !== "normal_media_not_local") throw error; }
          await current(client, context);
        }
        files.push({ slot: file.slot, label: labels[file.slot], bytes: file.asset.bytes, localAvailable });
      }
      const status = await current(client, context);
      return { sourceScope: scope(status), revision: context.object.revision, editRevision: context.stamp, files,
        totalBytes: files.reduce((total, file) => total + file.bytes, 0),
        downloadAvailable: supported && status.connection === "online" && !context.object.localPending && !context.object.localConflict,
        hasPendingChanges: Boolean(context.object.localPending || context.object.localConflict), externalPublication: "not-performed" };
    }),
    download: (id, input) => withClient(async (client, state) => {
      const context = await capture(client, state, id, input, true);
      check(Array.isArray(input.slots) && input.slots.length > 0 && input.slots.length <= NORMAL_MEDIA_SLOTS.length
        && new Set(input.slots).size === input.slots.length && input.slots.every(slot => context.files.some(file => file.slot === slot)),
      400, "invalid_offline_selection", "Bitte mindestens eine der angezeigten vorhandenen Artdateien auswählen.");
      check(!context.object.localPending && !context.object.localConflict, 409, "pending_review", "Bitte eigene Artänderungen und Konflikte zuerst abgleichen. Vorhandene Offlineinhalte bleiben erhalten.");
      check(state.status.connection === "online", 409, "offline", "Neue Offlineinhalte benötigen eine Verbindung zum gemeinsamen Projekt.");
      check(typeof client.normalMedia?.download === "function", 409, "offline_unavailable", "Die persönliche Artdateiablage ist noch nicht verfügbar.");
      const completed = [];
      for (const file of context.files.filter(file => input.slots.includes(file.slot))) {
        try {
          check((await current(client, context)).connection === "online", 409, "offline", "Die Projektverbindung wurde unterbrochen.");
          const value = await client.normalMedia.download({ speciesId: id, slot: file.slot, expectedRevision: context.object.revision,
            expectedDataHash: digest(objectJson(context.object.data)), requiredBinding: context.binding }, { signal: abort.signal });
          checkedLocal(value, file); await current(client, context); completed.push({ slot: file.slot, bytes: file.asset.bytes });
        } catch (error) {
          active(); return { complete: false, completed, stopped: { slot: file.slot,
            code: typeof error?.code === "string" ? error.code : "offline_unavailable",
            message: stoppedMessages[error?.code] || "Diese Datei konnte noch nicht vollständig bestätigt werden. Bereits gespeicherte Dateien bleiben erhalten. Bitte die Auswahl neu prüfen; es wird nicht automatisch wiederholt." },
          externalPublication: "not-performed" };
        }
      }
      return { complete: true, completed, stopped: null, externalPublication: "not-performed" };
    }),
    close() { closed = true; abort.abort(); },
  });
}
