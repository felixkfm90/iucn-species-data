import { createHash } from "node:crypto";
import { createSharedProjectClient } from "./client.mjs";
import { canonicalJson, digest, objectJson, transportJson } from "./security.mjs";
import { check, ProjectError } from "./errors.mjs";
import { createExplorerSpeciesEditor } from "./explorer-species-editor.mjs";
import { createSpeciesWorkspace } from "./species-workspace.mjs";
import { createExplorerSpeciesConflicts } from "./explorer-species-conflicts.mjs";
import { createExplorerSpeciesApproval } from "./explorer-species-approval.mjs";
import { createLocalNormalMediaReader } from "./local-normal-media.mjs";
import { normalMediaBinding } from "./normal-media.mjs";
import { createExplorerNormalOffline } from "./explorer-normal-offline.mjs";
import { createExplorerSpeciesCreation } from "./explorer-species-creation.mjs";
import { createExplorerSpeciesEnrichment } from "./explorer-species-enrichment.mjs";
import { importPageAuthoringAsDraft, PAGE_AUTHORING_TYPE } from "../page-authoring/shared.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";

function stamp(object) {
  return createHash("sha256").update(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data })).digest("hex");
}
const editable = (object, { localView = true } = {}) => ({ ...object, serverRevision: object.revision, serverApproval: object.approval,
  localPending: Boolean(localView && object.localPending), localConflict: Boolean(localView && object.localConflict),
  approval: localView && object.localPending ? "local-draft" : object.approval, editRevision: stamp(object) });

function pageConflictReview(conflict, server, status) {
  const versions = conflict?.localVersions;
  if (conflict?.kind !== "page" || server?.data?.type !== PAGE_AUTHORING_TYPE || !versions?.length
      || versions.some(version => version.data?.type !== PAGE_AUTHORING_TYPE)) return null;
  const expectedLocalVersions = versions.map(({ changeId, state, data }) => ({ changeId, state, sha256: digest(objectJson(data)) }));
  const requiredBinding = { baseUrl: status.baseUrl, projectId: status.projectId, userId: status.user?.id, role: status.user?.role };
  const hash = digest(JSON.stringify([conflict.id, server.revision, conflict.resolvedAt ?? null, requiredBinding, status.user?.version, expectedLocalVersions]));
  return { hash, requiredBinding, expectedLocalVersions };
}

/** Local Explorer adapter. Construction and snapshot/list/get/conflicts never use the network. */
export function createExplorerSharedProjectService(options = {}) {
  const client = createSharedProjectClient(options);
  const ownedSessions = new Set();
  let chain = Promise.resolve(), closed = false, closing = false, users = [], devices = [], working = 0, lastSnapshot = null;
  function run(fn) {
    if (closing || closed) return Promise.reject(new ProjectError(409, "client_closed", "Die gemeinsame Projektverbindung ist geschlossen."));
    working++;
    const result = chain.then(fn).finally(() => { working--; }); chain = result.catch(() => {}); return result;
  }
  async function permissions() {
    const status = await client.status(), online = status.connection === "online";
    const signedIn = !["disconnected", "authentication-required", "closed"].includes(status.connection) && Boolean(status.user);
    const full = signedIn && !status.readOnlySession && status.connection !== "forbidden", writer = ["admin", "publisher", "contributor"].includes(status.user?.role);
    return { status, permissions: { canRead: signedIn, canEdit: full && writer, canCreate: full && writer && online,
      canApprove: full && ["admin", "publisher"].includes(status.user?.role) && online,
      canManageUsers: full && status.user?.role === "admin" && online, canManageDevices: full && online,
      canChangePassword: full && online } };
  }
  async function snapshot() {
    const state = await permissions(), objects = (await client.listObjects()).map((object) => editable(object, { localView: state.permissions.canEdit }));
    let conflicts = [];
    if (state.permissions.canEdit) conflicts = await localConflicts();
    const result = { schemaVersion: 1, ...state, objects, conflicts, busy: working > 1 || speciesEnrichment.busy,
      queuedChanges: state.status.pending, conflictCount: state.status.conflicts,
      users: state.permissions.canManageUsers ? users : [], devices: state.permissions.canRead ? devices : [], externalPublication: "not-performed" };
    lastSnapshot = structuredClone(result);
    return result;
  }
  async function localConflicts() {
    const values = await client.listConflicts(), status = await client.status();
    return Promise.all(values.map(async (conflict) => {
      const latestServer = await client.getObject(conflict.kind, conflict.objectId, { serverOnly: true });
      const review = pageConflictReview(conflict, latestServer, status);
      return { ...conflict, latestServer: { ...latestServer, localPending: false, localConflict: false },
        changedSinceConflict: latestServer.revision !== conflict.currentRevision, ...(review && { pageReview: { hash: review.hash } }) };
    }));
  }
  const withClient = (operation) => run(async () => operation(client, await permissions()));
  let speciesCreationSource = options.prepareSpeciesCreation ?? null;
  const speciesCreation = createExplorerSpeciesCreation({ withClient, isSourceReady: () => typeof speciesCreationSource === "function", prepareLocalCreation: async payload => {
    check(typeof speciesCreationSource === "function", 503, "species_creation_source_unavailable", "Die gemeinsame Artanlage ist auf diesem Gerät noch nicht vollständig eingerichtet.");
    return speciesCreationSource(payload);
  } });
  const speciesEditor = createExplorerSpeciesEditor({ withClient });
  const speciesWorkspace = createSpeciesWorkspace({ withClient });
  const speciesConflicts = createExplorerSpeciesConflicts({ withClient });
  const normalMediaReader = options.normalMediaReader ?? (options.repoRoot ? createLocalNormalMediaReader({ repoRoot: options.repoRoot }) : null);
  const speciesEnrichment = createExplorerSpeciesEnrichment({ withClient, repoRoot: options.repoRoot, normalMediaReader,
    providerOptions: options.speciesEnrichmentProviders });
  const speciesApproval = createExplorerSpeciesApproval({ withClient, normalMediaReader });
  const normalOffline = createExplorerNormalOffline({ withClient });
  return {
    speciesEditor, speciesWorkspace, speciesConflicts, speciesApproval, normalOffline, speciesCreation, speciesEnrichment,
    // Node-only. The initial import supplies this revision and slot from its own journal.
    initialImportMedia: normalMediaReader ? (input, { signal } = {}) => withClient(async (activeClient, state) => {
      const { requiredBinding, speciesId, slot, expectedRevision, expectedDataHash } = input;
      const { status } = state;
      check(status.connection === "online" && !status.readOnlySession && state.permissions.canManageUsers
        && status.baseUrl === requiredBinding.baseUrl && status.projectId === requiredBinding.projectId
        && status.user?.id === requiredBinding.userId && status.user.role === "admin" && requiredBinding.role === "admin",
      409, "import_person_changed", "Projekt oder vorbereitendes Administrationskonto wurde gewechselt.");
      signal?.throwIfAborted();
      const object = await activeClient.getObject("species", speciesId);
      check(object.revision === expectedRevision && digest(objectJson(object.data)) === expectedDataHash && !object.localPending && !object.localConflict,
        409, "normal_media_review_changed", "Die übernommene Artfassung hat sich vor der Dateibereitstellung geändert.");
      const binding = normalMediaBinding(object.data, { projectId: status.projectId, slot });
      check(binding, 409, "normal_media_not_bound", "Die geprüfte Artfassung enthält keine passende Originaldatei.");
      const present = await activeClient.normalMedia.status(input, { signal });
      if (present.available) return present;
      const local = await normalMediaReader.read(object.data, { projectId: status.projectId, slot });
      check(canonicalJson(local.binding) === canonicalJson(binding), 409, "normal_media_review_changed", "Das Original passt nicht zur übernommenen Dateibindung.");
      signal?.throwIfAborted();
      return activeClient.normalMedia.upload({ ...input, buffer: local.buffer }, { signal });
    }) : null,
    // Node-only: the composition root supplies the actual local taxonomy/list reader once.
    configureSpeciesCreationSource(source) {
      check(!closing && !closed && typeof source === "function", 409, "client_closed", "Die gemeinsame Artanlage kann nicht mehr eingerichtet werden.");
      if (speciesCreationSource) return false;
      speciesCreationSource = source; return true;
    },
    capabilities: () => run(() => client.capabilities()),
    snapshot: async () => {
      if (working || speciesEnrichment.busy || closing || closed) {
        const cached = lastSnapshot ? structuredClone(lastSnapshot) : { schemaVersion: 1, status: { connection: "checking" },
          permissions: { canRead: false, canEdit: false, canCreate: false, canApprove: false, canManageUsers: false, canManageDevices: false, canChangePassword: false },
          objects: [], conflicts: [], users: [], devices: [], queuedChanges: null, conflictCount: null, externalPublication: "not-performed" };
        return { ...cached, busy: !closed, ...(closed ? { status: { ...cached.status, connection: "closed", user: null },
          permissions: Object.fromEntries(Object.keys(cached.permissions).map((key) => [key, false])), objects: [], conflicts: [], users: [], devices: [] } : {}) };
      }
      return snapshot();
    },
    connect: (input) => run(async () => {
      // The client can accept the new account before its first catalog read finishes.
      users = []; devices = []; lastSnapshot = null;
      await client.connect(input);
      return snapshot();
    }),
    disconnect: () => run(async () => { const result = await client.disconnect(); users = []; devices = []; return { ...await snapshot(), remoteLogoutConfirmed: result.remoteLogoutConfirmed }; }),
    refresh: (input = {}) => run(async () => {
      await client.refresh();
      if (input.users === true) users = await client.listUsers();
      if (input.devices === true) devices = await client.listDevices();
      return snapshot();
    }),
    sync: () => run(async () => { await client.sync(); return snapshot(); }),
    list: () => run(async () => { const state = await permissions(); return (await client.listObjects()).map((object) => editable(object, { localView: state.permissions.canEdit })); }),
    get: (kind, id) => run(async () => { const state = await permissions(); return editable(await client.getObject(kind, id), { localView: state.permissions.canEdit }); }),
    editExisting: (kind, id, input) => run(async () => {
      const current = await client.getObject(kind, id);
      check(input?.expectedEditRevision === stamp(current), 409, "local_object_changed", "Die angezeigte Fassung wurde inzwischen geändert. Bitte neu laden; deine Eingabe bleibt erhalten.");
      return editable(await client.editExistingObject(kind, id, input.data));
    }),
    conflicts: () => run(localConflicts),
    resolve: (id, input) => run(async () => {
      check(typeof input?.expectedRevision === "string", 400, "review_required", "Die angezeigte Serverversion muss bestätigt werden.");
      if (input.pageChoice !== undefined) {
        const conflict = (await client.listConflicts()).find(entry => entry.id === id);
        check(conflict?.kind === "page", 409, "conflict_review_changed", "Der Seitenkonflikt muss erneut geladen werden.");
        const server = await client.getObject("page", conflict.objectId, { serverOnly: true });
        const review = pageConflictReview(conflict, server, await client.status());
        const { reviewHash, changeId } = input.pageChoice ?? {};
        check(review && review.hash === reviewHash && server.revision === input.expectedRevision, 409, "conflict_review_changed",
          "Die Seitenfassungen haben sich seit dem Vergleich geändert. Bitte erneut prüfen.");
        const options = { expectedRevision: input.expectedRevision, requiredBinding: review.requiredBinding, expectedLocalVersions: review.expectedLocalVersions };
        if (changeId === null) return editable(await client.resolveConflict(id, { ...options, strategy: "current" }));
        const chosen = conflict.localVersions.find(version => version.changeId === changeId);
        check(chosen, 409, "conflict_review_changed", "Die gewählte lokale Seitenfassung ist nicht mehr verfügbar.");
        const data = importPageAuthoringAsDraft(chosen.data), previous = importPageAuthoringAsDraft(server.data);
        data.history = [...new Map([...previous.history, ...data.history].map(entry => [fingerprint(entry), entry])).values()];
        return editable(await client.resolveConflict(id, { ...options, strategy: "merged", data }));
      }
      return editable(await client.resolveConflict(id, input));
    }),
    create: (input) => run(async () => editable(await client.createObject(input))),
    approve: (kind, id, input) => run(() => client.approveObject(kind, id, input)),
    users: () => run(async () => { const state = await permissions(); return state.permissions.canManageUsers ? users : []; }),
    createUser: (input) => run(async () => { const user = await client.createUser(input); users = [...users, user]; return user; }),
    updateUser: (id, input) => run(async () => { const user = await client.updateUser(id, input); users = users.map((entry) => entry.id === id ? user : entry); return user; }),
    devices: () => run(async () => { const state = await permissions(); return state.permissions.canRead ? devices : []; }),
    issueReadPairing: (input) => run(() => client.issueReadPairing(input)),
    revokeDevice: (id) => run(async () => { const result = await client.revokeDevice(id); devices = devices.map((entry) => entry.id === id ? { ...entry, revoked: true } : entry); return result; }),
    changePassword: (input) => run(() => client.changePassword(input)),
    // Node-only backup authority: all locally known projects, also while signed out. No network or credentials.
    backupProjectIds: () => run(() => client.backupProjectIds()),
    async createPageAuthoringService(sessionOptions) {
      check(!closing && !closed, 409, "client_closed", "Die gemeinsame Projektverbindung wird geschlossen.");
      const { createExplorerPageAuthoringSession } = await import("../page-authoring/explorer-session.mjs");
      check(!closing && !closed, 409, "client_closed", "Die gemeinsame Projektverbindung wird geschlossen.");
      const session = await createExplorerPageAuthoringSession({ ...sessionOptions, withClient });
      if (closing || closed) {
        await session.close();
        throw new ProjectError(409, "client_closed", "Die gemeinsame Projektverbindung wird geschlossen.");
      }
      ownedSessions.add(session);
      return session;
    },
    // Node-only capability for the typed website bridge; never serialized by snapshot or a route.
    createWebsiteAltSyncAdapter() {
      return Object.freeze({ status: () => client.status(), getObject: (...args) => client.getObject(...args),
        editExistingObject: (...args) => client.editExistingObject(...args), refresh: () => client.refresh(),
        sync: (...args) => client.sync(...args), createObject: (...args) => client.createObject(...args),
        listConflicts: (...args) => client.listConflicts(...args), resolveConflict: (...args) => client.resolveConflict(...args) });
    },
    async close() {
      if (closed) return;
      closing = true;
      speciesEditor.close();
      speciesCreation.close();
      speciesConflicts.close();
      speciesApproval.close();
      normalOffline.close();
      const enrichmentClosing = speciesEnrichment.close();
      const sessionsClosing = [...ownedSessions].map(session => Promise.resolve().then(() => session.close()));
      // Abort an in-flight client request before joining the adapter queue.
      await client.close(); await chain; await Promise.all([enrichmentClosing, ...sessionsClosing]);
      ownedSessions.clear(); closed = true; users = []; devices = [];
    }
  };
}
