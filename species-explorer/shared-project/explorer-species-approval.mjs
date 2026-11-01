import { randomUUID } from "node:crypto";
import { check } from "./errors.mjs";
import { canonicalJson, digest, objectJson, transportJson } from "./security.mjs";
import { SPECIES_RECORD_TYPE, validateSpeciesRecord, projectSpeciesRecordToCatalog } from "./species-record.mjs";
import { projectSpeciesRecordToExplorer } from "./species-view.mjs";

const source = "shared-project";
const scope = (status) => digest(transportJson([status.baseUrl || "", status.projectId || "", status.user?.id || ""]));
const editRevision = (object) => digest(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data }));
const objectHash = (object) => digest(canonicalJson(object, { maxBytes: 512 * 1024, maxNodes: 300000 }));
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

/** Explicit internal release over the existing serialized client; never syncs or publishes to a CMS. */
export function createExplorerSpeciesApproval({ withClient, clock = Date.now, tokenId = randomUUID, ttlMs = 5 * 60 * 1000 } = {}) {
  check(typeof withClient === "function" && typeof clock === "function" && typeof tokenId === "function"
    && Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= 60 * 60 * 1000,
  500, "species_approval_unavailable", "Die interne Artfreigabe ist nicht vollständig eingerichtet.");
  const previews = new Map(); let closed = false;
  function active() {
    check(!closed, 409, "client_closed", "Die gemeinsame Projektverbindung ist geschlossen.");
    for (const [token, preview] of previews) if (preview.expiresAt <= clock()) previews.delete(token);
  }
  return Object.freeze({
    preview: (id, input) => withClient(async (client, state) => {
      active(); access(state);
      const object = checkedObject(await client.getObject("species", id), id); active();
      check(input?.sourceScope === scope(state.status) && input?.expectedEditRevision === editRevision(object) && input?.expectedRevision === object.revision,
        409, "approval_review_changed", "Die angezeigte Art oder Projektanmeldung wurde inzwischen geändert. Bitte die aktuelle Fassung erneut prüfen.");
      check(object.approvedRevision !== object.revision, 409, "already_approved", "Diese Artfassung ist bereits intern freigegeben.");
      check(previews.size < 100, 429, "too_many_previews", "Bitte offene Freigabeprüfungen zuerst abschließen oder neu laden.");
      const token = tokenId(), expiresAt = clock() + ttlMs;
      check(typeof token === "string" && token.length > 0 && !previews.has(token), 500, "species_approval_unavailable", "Die Freigabeprüfung konnte nicht eindeutig gebunden werden.");
      const species = view(object, state), readerSpecies = projectSpeciesRecordToCatalog(object.data);
      previews.set(token, { id, sourceScope: scope(state.status), authority: authorityHash(state), objectHash: objectHash(object),
        dataHash: digest(objectJson(object.data)), revision: object.revision, expiresAt,
        binding: { baseUrl: state.status.baseUrl, projectId: state.status.projectId, userId: state.status.user.id, role: state.status.user.role } });
      return { token, expiresAt: new Date(expiresAt).toISOString(), source, sourceScope: scope(state.status), species, readerSpecies, internalOnly: true,
        warnings: ["Die angezeigte Fassung wird ausschließlich intern für Projektleser und das Nachschlagewerk freigegeben.",
          "Medienverweise sind keine Prüfung erreichbarer Dateien oder ihrer tatsächlichen Bytes. Die Websiteübernahme bleibt ein eigener Schritt."],
        externalPublication: "not-performed" };
    }),
    async approve(id, input) {
      active();
      const preview = previews.get(input?.token);
      if (preview) previews.delete(input.token);
      check(preview && preview.id === id, 409, "review_required", "Die Freigabeprüfung ist ungültig, verbraucht oder abgelaufen. Bitte erneut prüfen.");
      return withClient(async (client, state) => {
        active(); access(state);
        check(preview.expiresAt > clock(), 409, "review_required", "Die Freigabeprüfung ist abgelaufen. Bitte erneut prüfen.");
        check(preview.sourceScope === scope(state.status) && preview.authority === authorityHash(state),
          409, "approval_review_changed", "Projekt, angemeldete Person oder Berechtigung wurde geändert. Bitte die Freigabe erneut prüfen.");
        const object = checkedObject(await client.getObject("species", id), id); active();
        check(preview.expiresAt > clock(), 409, "review_required", "Die Freigabeprüfung ist abgelaufen. Bitte erneut prüfen.");
        check(preview.objectHash === objectHash(object), 409, "approval_review_changed", "Die Artfassung wurde seit der Freigabeprüfung geändert. Bitte erneut prüfen.");
        const approved = await client.approveObject("species", id, { expectedRevision: preview.revision,
          expectedDataHash: preview.dataHash, requiredBinding: { ...preview.binding } });
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
    close() { closed = true; previews.clear(); },
  });
}
