import { randomUUID } from "node:crypto";
import { check } from "./errors.mjs";
import { canonicalJson, digest, objectJson, transportJson } from "./security.mjs";
import { SPECIES_RECORD_TYPE, validateSpeciesRecord, projectSpeciesRecordToCatalog } from "./species-record.mjs";
import { projectSpeciesRecordToExplorer } from "./species-view.mjs";
import { normalMediaBinding, NORMAL_MEDIA_SLOTS } from "./normal-media.mjs";
import { validateReaderApprovalPreview } from "./reader-approval.mjs";

const source = "shared-project";
const scope = (status) => digest(transportJson([status.baseUrl || "", status.projectId || "", status.user?.id || ""]));
const editRevision = (object) => digest(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data }));
const objectHash = (object) => digest(canonicalJson(object, { maxBytes: 4 * 1024 * 1024 + 16 * 1024, maxNodes: 300000 }));
const authorityHash = (state) => digest(canonicalJson({ sourceScope: scope(state.status), role: state.status.user.role,
  userVersion: state.status.user.version ?? null, connection: state.status.connection, readOnlySession: state.status.readOnlySession === true,
  permissions: state.permissions }));
function access(state) {
  check(state?.status?.connection === "online" && state.status.readOnlySession === false && ["admin", "publisher"].includes(state.status.user?.role)
    && [state.status.baseUrl, state.status.projectId, state.status.user?.id].every((value) => typeof value === "string" && value.trim())
    && state.permissions?.canRead === true && state.permissions.canApprove === true,
  403, "forbidden", "Die interne Artfreigabe benötigt eine volle Online-Anmeldung mit Freigaberecht.");
}
function checkedObject(object, id) {
  check(object?.kind === "species" && object.id === id && object.data?.type === SPECIES_RECORD_TYPE,
    409, "species_record_required", "Die interne Artfreigabe benötigt einen vollständigen gemeinsamen Arbeitsdatensatz.");
  validateSpeciesRecord(object.data, id);
  check(!object.localPending && !object.localConflict, 409, "pending_review", "Bitte die lokalen Änderungen und Konflikte dieser Art zuerst abgleichen und prüfen.");
  return object;
}
function view(object, state) {
  return { ...projectSpeciesRecordToExplorer(object, state), id: object.id, source, sourceScope: scope(state.status), editRevision: editRevision(object),
    revision: object.revision, ordinal: object.ordinal, approvedRevision: object.approvedRevision ?? null, approval: object.approval,
    localPending: object.localPending === true, localConflict: object.localConflict === true, externalPublication: "not-performed" };
}
const metadataKeys = ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"];
const labels = { "portrait.webp": "Artporträt", "map.jpg": "Verbreitungskarte", "sound.mp3": "Tonaufnahme", "spectrogram.webp": "Spektrogramm" };
function normalFiles(record, reader, missing, projectId) {
  const wanted = [];
  for (const item of missing) {
    const asset = item.role === "gallery" ? reader.media.gallery.find(image => image.id === item.id)?.asset
      : item.role === "sound" ? reader.media.sounds.find(sound => sound.id === item.id) : reader.media[item.role];
    if (asset?.kind === "unavailable") wanted.push(asset);
  }
  return NORMAL_MEDIA_SLOTS.map(slot => normalMediaBinding(record, { projectId, slot })).filter(binding => binding
    && wanted.some(asset => metadataKeys.every(key => binding.asset[key] === asset[key])));
}

/** Explicit internal release over the existing serialized client; never syncs or publishes to a CMS. */
export function createExplorerSpeciesApproval({ withClient, normalMediaReader = null, clock = Date.now, tokenId = randomUUID, ttlMs = 5 * 60 * 1000 } = {}) {
  check(typeof withClient === "function" && typeof clock === "function" && typeof tokenId === "function"
    && Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= 60 * 60 * 1000,
  500, "species_approval_unavailable", "Die interne Artfreigabe ist nicht vollständig eingerichtet.");
  const previews = new Map(), abort = new AbortController(); let closed = false;
  function active() {
    check(!closed, 409, "client_closed", "Die gemeinsame Projektverbindung ist geschlossen.");
    for (const [token, preview] of previews) if (preview.expiresAt <= clock()) previews.delete(token);
  }
  function take(id, input) {
    active();
    check(input && Object.keys(input).length === 1 && typeof input.token === "string", 400, "review_required", "Die Aktion benötigt ausschließlich die persönliche Vorschauentscheidung.");
    const preview = previews.get(input.token); if (preview) previews.delete(input.token);
    check(preview && preview.id === id, 409, "review_required", "Die Freigabeprüfung ist ungültig, verbraucht oder abgelaufen. Bitte erneut prüfen.");
    return preview;
  }
  async function checkedPreview(client, state, preview) {
    active(); access(state);
    check(preview.expiresAt > clock(), 409, "review_required", "Die Freigabeprüfung ist abgelaufen. Bitte erneut prüfen.");
    check(preview.sourceScope === scope(state.status) && preview.authority === authorityHash(state),
      409, "approval_review_changed", "Projekt, Person oder Berechtigung wurde seit der Vorschau geändert.");
    const object = checkedObject(await client.getObject("species", preview.id), preview.id); active();
    check(preview.expiresAt > clock(), 409, "review_required", "Die Freigabeprüfung ist abgelaufen. Bitte erneut prüfen.");
    check(preview.objectHash === objectHash(object), 409, "approval_review_changed", "Die geprüfte Artfassung wurde geändert. Bitte erneut prüfen.");
    return object;
  }
  return Object.freeze({
    preview: (id, input) => withClient(async (client, state) => {
      active(); access(state);
      const object = checkedObject(await client.getObject("species", id), id); active();
      check(input?.sourceScope === scope(state.status) && input?.expectedEditRevision === editRevision(object) && input?.expectedRevision === object.revision,
        409, "approval_review_changed", "Die angezeigte Art oder Projektanmeldung wurde inzwischen geändert. Bitte die aktuelle Fassung erneut prüfen.");
      check(previews.size < 100, 429, "too_many_previews", "Bitte offene Freigabeprüfungen zuerst abschließen oder neu laden.");
      const token = tokenId(), expiresAt = clock() + ttlMs;
      check(typeof token === "string" && token.length > 0 && !previews.has(token), 500, "species_approval_unavailable", "Die Freigabeprüfung konnte nicht eindeutig gebunden werden.");
      const species = view(object, state), dataHash = digest(objectJson(object.data));
      check(input.readerCatalogVersion === undefined || [1, 2].includes(input.readerCatalogVersion), 400, "invalid_approval_binding", "Ungültige Leserfassung.");
      const readerCatalogVersion = object.data.schemaVersion === 2 || input.readerCatalogVersion === 2 ? 2 : 1;
      check(object.approvedRevision !== object.revision || readerCatalogVersion === 2, 409, "already_approved", "Diese Artfassung ist bereits intern freigegeben.");
      const binding = { baseUrl: state.status.baseUrl, projectId: state.status.projectId, userId: state.status.user.id, role: state.status.user.role };
      let readerSpecies, readerHash, missingMedia = [], files = [];
      if (readerCatalogVersion === 2) {
        const result = validateReaderApprovalPreview(await client.previewReaderApproval(id, { expectedRevision: object.revision, expectedDataHash: dataHash, requiredBinding: binding }),
          { ...binding, speciesId: id, revision: object.revision, dataHash });
        active(); readerSpecies = result.readerSpecies; readerHash = result.readerHash; missingMedia = result.missingMedia;
        files = normalFiles(object.data, readerSpecies, missingMedia, binding.projectId);
        const fresh = checkedObject(await client.getObject("species", id), id); active();
        check(objectHash(fresh) === objectHash(object), 409, "approval_review_changed", "Die Artfassung wurde während der Leserprüfung geändert.");
      } else readerSpecies = projectSpeciesRecordToCatalog(object.data);
      check(previews.size < 100 && !previews.has(token), 429, "too_many_previews", "Die Freigabevorschau konnte nicht eindeutig vorgemerkt werden. Bitte erneut prüfen.");
      previews.set(token, { id, sourceScope: scope(state.status), authority: authorityHash(state), objectHash: objectHash(object),
        dataHash, revision: object.revision, expiresAt, binding, readerCatalogVersion, readerHash, missingMedia, files });
      return { token, expiresAt: new Date(expiresAt).toISOString(), source, sourceScope: scope(state.status), species, readerSpecies, internalOnly: true,
        ...(readerCatalogVersion === 2 ? { readerCatalogVersion, alreadyApproved: object.approvedRevision === object.revision, missingMedia, mediaPreparation: { available: typeof normalMediaReader?.read === "function" && typeof client.normalMedia?.upload === "function",
          files: files.map(file => ({ slot: file.slot, label: labels[file.slot], bytes: file.asset.bytes })), totalBytes: files.reduce((total, file) => total + file.asset.bytes, 0) } } : {}),
        warnings: ["Die angezeigte Fassung wird ausschließlich intern für Projektleser und das Nachschlagewerk freigegeben.",
          "Medienverweise sind keine Prüfung erreichbarer Dateien oder ihrer tatsächlichen Bytes. Die Websiteübernahme bleibt ein eigener Schritt."],
        externalPublication: "not-performed" };
    }),
    async approve(id, input) {
      const preview = take(id, input);
      return withClient(async (client, state) => {
        const current = await checkedPreview(client, state, preview);
        check(current.approvedRevision !== current.revision, 409, "already_approved", "Diese Artfassung ist bereits intern freigegeben.");
        check(preview.missingMedia.length === 0, 409, "reader_media_required", "Die Leserfassung benötigt zuerst ihre fehlenden Artdateien und eine neue Vorschau.");
        const approved = await client.approveObject("species", id, { expectedRevision: preview.revision,
          expectedDataHash: preview.dataHash, requiredBinding: { ...preview.binding },
          ...(preview.readerCatalogVersion === 2 ? { readerCatalogVersion: 2, expectedReaderHash: preview.readerHash } : {}) });
        active();
        check(approved?.kind === "species" && approved.id === id && approved.revision === preview.revision
          && approved.approvedRevision === preview.revision && approved.approval === "approved"
          && digest(objectJson(approved.data)) === preview.dataHash,
        503, "approval_not_confirmed", "Die interne Freigabe ist nicht eindeutig bestätigt. Bitte den Serverstand ausdrücklich neu lesen.");
        validateSpeciesRecord(approved.data, id);
        return { approved: true, serverConfirmed: true, source, sourceScope: preview.sourceScope, internalOnly: true,
          reviewedRevision: preview.revision, approvedRevision: approved.approvedRevision,
          hasNewerLocalChanges: approved.localPending === true || approved.localConflict === true,
          species: view(approved, state), externalPublication: "not-performed" };
      });
    },
    async provideMedia(id, input) {
      const preview = take(id, input);
      return withClient(async (client, state) => {
        const object = await checkedPreview(client, state, preview);
        check(preview.readerCatalogVersion === 2 && preview.files.length > 0 && typeof normalMediaReader?.read === "function"
          && typeof client.normalMedia?.upload === "function", 409, "normal_media_unavailable", "Für diese Vorschau ist keine normale Artdateibereitstellung eingerichtet.");
        const completed = [];
        for (const file of preview.files) {
          try {
            await checkedPreview(client, state, preview);
            const request = { speciesId: id, slot: file.slot, expectedRevision: preview.revision, expectedDataHash: preview.dataHash, requiredBinding: preview.binding };
            const status = await client.normalMedia.status(request, { signal: abort.signal }); active();
            if (!status.available) {
              const local = await normalMediaReader.read(object.data, { projectId: preview.binding.projectId, slot: file.slot }); active();
              check(canonicalJson(local.binding) === canonicalJson(file), 409, "normal_media_review_changed", "Die lokale Artdatei gehört nicht zur geprüften Originalbindung.");
              await checkedPreview(client, state, preview);
              const ready = await client.normalMedia.upload({ ...request, buffer: local.buffer }, { signal: abort.signal }); active();
              check(ready.available === true, 503, "normal_media_uncertain", "Die Bereitstellung der Artdatei ist noch nicht eindeutig bestätigt.");
            }
            completed.push({ slot: file.slot, bytes: file.asset.bytes });
          } catch (error) {
            active();
            return { provided: false, completed, stopped: { slot: file.slot, code: typeof error?.code === "string" ? error.code : "normal_media_unavailable",
              message: "Diese Artdatei ist noch nicht eindeutig bestätigt. Bereits bestätigte Dateien bleiben erhalten. Bitte den Stand neu prüfen; es wird nicht automatisch wiederholt." },
            requiresNewReview: true, externalPublication: "not-performed" };
          }
        }
        return { provided: true, completed, stopped: null, requiresNewReview: true, externalPublication: "not-performed" };
      });
    },
    close() { closed = true; abort.abort(); previews.clear(); },
  });
}
