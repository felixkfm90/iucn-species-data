import { createHash } from "node:crypto";
import { check } from "./errors.mjs";
import { digest, transportJson } from "./security.mjs";
import { SPECIES_RECORD_TYPE } from "./species-record.mjs";
import { projectSpeciesRecordToExplorer } from "./species-view.mjs";

const source = "shared-project";
const stamp = (object) => digest(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data }));
const scope = (status) => digest(transportJson([status.baseUrl || "", status.projectId || "", status.user?.id || ""]));
const connections = new Set(["online", "offline", "disconnected", "authentication-required", "forbidden", "checking", "closed"]);
const mediaKeys = ["map", "sound", "credits", "spectrogram", "portrait"];
function identity(state) {
  check(state.permissions?.canRead === true, 403, "forbidden", "Die aktuelle Projektanmeldung erlaubt keinen Zugriff auf die gemeinsame Artenansicht.");
  const status = state.status || {};
  check(typeof status.baseUrl === "string" && status.baseUrl && typeof status.projectId === "string" && status.projectId
    && typeof status.user?.id === "string" && status.user.id, 401, "authentication_required", "Die gemeinsame Projektanmeldung muss erneut geprüft werden.");
  check(Number.isSafeInteger(status.pending) && status.pending >= 0 && Number.isSafeInteger(status.conflicts) && status.conflicts >= 0,
    503, "workspace_status_unavailable", "Der Stand der lokalen Warteschlange ist noch nicht verlässlich verfügbar.");
  return { status, sourceScope: scope(status), connection: connections.has(status.connection) ? status.connection : "checking",
    permissions: Object.fromEntries(["canRead", "canEdit", "canCreate", "canApprove"].map((key) => [key, state.permissions[key] === true])) };
}
function workspaceRevision(objects, state, active) {
  const hash = createHash("sha256");
  hash.update("FN.ArtenExplorer.SpeciesWorkspace.1\n");
  hash.update(transportJson({ sourceScope: active.sourceScope, connection: active.connection, role: state.status.user.role,
    userVersion: state.status.user.version ?? null, readOnlySession: state.status.readOnlySession === true, permissions: active.permissions,
    pending: state.status.pending, conflicts: state.status.conflicts, otherProjectPending: state.status.otherProjectPending ?? 0 }));
  // Each object retains the exact editor stamp; a large catalogue is never put into one bounded JSON value.
  const ordered = [...objects].sort((left, right) => {
    const a = `${left.kind}/${left.id}`, b = `${right.kind}/${right.id}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (const object of ordered) {
    hash.update("\n");
    hash.update(transportJson({ kind: object.kind, id: object.id, editRevision: stamp(object), ordinal: object.ordinal ?? null,
      localPending: object.localPending === true, localConflict: object.localConflict === true,
      approval: object.approval ?? null, approvedRevision: object.approvedRevision ?? null }));
  }
  return hash.digest("hex");
}
function visibleLegacy(object) {
  return { id: object.id, commonName: typeof object.data?.commonName === "string" ? object.data.commonName : "" };
}

/** Read-only projection over the existing serialized personal client. No import, fallback, network or new queue. */
export function createSpeciesWorkspace({ withClient } = {}) {
  check(typeof withClient === "function", 500, "species_workspace_unavailable", "Die gemeinsame Artenansicht ist nicht eingerichtet.");
  async function load(client, state) {
    const active = identity(state), objects = await client.listObjects();
    check(Array.isArray(objects), 503, "workspace_status_unavailable", "Der lokale gemeinsame Bestand ist noch nicht verfügbar.");
    return { active, objects, revision: workspaceRevision(objects, state, active) };
  }
  return Object.freeze({
    revision: () => withClient(async (client, state) => {
      const { active, revision } = await load(client, state);
      return { revision, source, sourceScope: active.sourceScope };
    }),
    read: () => withClient(async (client, state) => {
      const { active, objects, revision } = await load(client, state);
      const speciesObjects = objects.filter((object) => object.kind === "species");
      const legacySpecies = speciesObjects.filter((object) => object.data?.type !== SPECIES_RECORD_TYPE).map(visibleLegacy);
      const species = speciesObjects.filter((object) => object.data?.type === SPECIES_RECORD_TYPE).map((object) => ({
        ...projectSpeciesRecordToExplorer(object, state), id: object.id, source, sourceScope: active.sourceScope, editRevision: stamp(object),
        assetName: object.data.assets.assetName, revision: object.revision, ordinal: object.ordinal,
        localPending: object.localPending === true, localConflict: object.localConflict === true,
        approval: object.approval, approvedRevision: object.approvedRevision ?? null,
        canApprove: active.permissions.canApprove && active.connection === "online" && !object.localPending && !object.localConflict
          && object.approvedRevision !== object.revision,
        canEdit: active.permissions.canEdit, externalPublication: "not-performed",
      })).sort((left, right) => left.germanName.localeCompare(right.germanName, "de") || left.id.localeCompare(right.id));
      const pending = active.status.pending, conflicts = active.status.conflicts;
      const availableMediaCount = species.reduce((sum, entry) => sum + mediaKeys.filter((key) => entry.assets[key].availableOnline === true).length, 0);
      const missingMediaCount = species.length * mediaKeys.length - availableMediaCount;
      const message = legacySpecies.length
        ? `${legacySpecies.length} Art(en) besitzen bislang nur einen Katalogdatensatz. Sie bleiben erhalten und werden bis zur bewussten vollständigen Quellenübernahme nicht als bearbeitbare Art umgewandelt.`
        : species.length ? "Gemeinsamer Artbestand aus dem persönlichen Projektcache. Medienverweise sind keine geprüften lokalen Dateien."
          : "Noch keine vollständigen gemeinsamen Art-Arbeitsdatensätze vorhanden. Es wurde nichts aus lokalen Dateien übernommen.";
      return { species,
        summary: { source, speciesCount: species.length,
          missingCoreAssets: species.filter((entry) => mediaKeys.some((key) => !entry.assets[key].availableOnline)).length,
          ncSoundCount: species.filter((entry) => entry.isNcSound).length,
          manualMapCount: species.filter((entry) => entry.isManualMap).length,
          browserImportedMapCount: species.filter((entry) => entry.assets.map.browserImported).length,
          ownCareMapCount: species.filter((entry) => entry.assets.map.ownCare).length, reportGeneratedAt: null },
        validation: { source, speciesCount: species.length, availableMediaCount, missingMediaCount, pending, conflicts,
          connection: active.connection, legacyCount: legacySpecies.length },
        revision: { revision },
        pendingChanges: { source, hasPendingChanges: pending > 0 || conflicts > 0, pending, conflicts },
        workspace: { source, sourceScope: active.sourceScope, connection: active.connection, permissions: active.permissions,
          pending, conflicts, legacySpecies, legacyCount: legacySpecies.length, message },
      };
    }),
  });
}
