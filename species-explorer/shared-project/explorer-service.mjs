import { createHash } from "node:crypto";
import { createSharedProjectClient } from "./client.mjs";
import { canonicalJson, transportJson } from "./security.mjs";
import { check, ProjectError } from "./errors.mjs";
import { createExplorerSpeciesEditor } from "./explorer-species-editor.mjs";
import { createSpeciesWorkspace } from "./species-workspace.mjs";
import { createExplorerSpeciesConflicts } from "./explorer-species-conflicts.mjs";
import { createExplorerSpeciesApproval } from "./explorer-species-approval.mjs";

function stamp(object) {
  return createHash("sha256").update(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data })).digest("hex");
}
const editable = (object, { localView = true } = {}) => ({ ...object, serverRevision: object.revision, serverApproval: object.approval,
  localPending: Boolean(localView && object.localPending), localConflict: Boolean(localView && object.localConflict),
  approval: localView && object.localPending ? "local-draft" : object.approval, editRevision: stamp(object) });

/** Local Explorer adapter. Construction and snapshot/list/get/conflicts never use the network. */
export function createExplorerSharedProjectService(options = {}) {
  const client = createSharedProjectClient(options);
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
    const result = { schemaVersion: 1, ...state, objects, conflicts, busy: working > 1,
      queuedChanges: state.status.pending, conflictCount: state.status.conflicts,
      users: state.permissions.canManageUsers ? users : [], devices: state.permissions.canRead ? devices : [], externalPublication: "not-performed" };
    lastSnapshot = structuredClone(result);
    return result;
  }
  async function localConflicts() {
    const values = await client.listConflicts();
    return Promise.all(values.map(async (conflict) => {
      const latestServer = await client.getObject(conflict.kind, conflict.objectId, { serverOnly: true });
      return { ...conflict, latestServer: { ...latestServer, localPending: false, localConflict: false }, changedSinceConflict: latestServer.revision !== conflict.currentRevision };
    }));
  }
  const withClient = (operation) => run(async () => operation(client, await permissions()));
  const speciesEditor = createExplorerSpeciesEditor({ withClient });
  const speciesWorkspace = createSpeciesWorkspace({ withClient });
  const speciesConflicts = createExplorerSpeciesConflicts({ withClient });
  const speciesApproval = createExplorerSpeciesApproval({ withClient });
  return {
    speciesEditor, speciesWorkspace, speciesConflicts, speciesApproval,
    capabilities: () => run(() => client.capabilities()),
    snapshot: async () => {
      if (working || closing || closed) {
        const cached = lastSnapshot ? structuredClone(lastSnapshot) : { schemaVersion: 1, status: { connection: "checking" },
          permissions: { canRead: false, canEdit: false, canCreate: false, canApprove: false, canManageUsers: false, canManageDevices: false, canChangePassword: false },
          objects: [], conflicts: [], users: [], devices: [], queuedChanges: null, conflictCount: null, externalPublication: "not-performed" };
        return { ...cached, busy: !closed, ...(closed ? { status: { ...cached.status, connection: "closed", user: null },
          permissions: Object.fromEntries(Object.keys(cached.permissions).map((key) => [key, false])), objects: [], conflicts: [], users: [], devices: [] } : {}) };
      }
      return snapshot();
    },
    connect: (input) => run(async () => { await client.connect(input); users = []; devices = []; return snapshot(); }),
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
      return editable(await client.resolveConflict(id, input));
    }),
    create: (input) => run(async () => editable(await client.createObject(input))),
    approve: (kind, id, input) => run(() => client.approveObject(kind, id, input)),
    users: () => run(async () => { const state = await permissions(); return state.permissions.canManageUsers ? users : []; }),
    createUser: (input) => run(async () => { const user = await client.createUser(input); users = [...users, user]; return user; }),
    updateUser: (id, input) => run(async () => { const user = await client.updateUser(id, input); users = users.map((entry) => entry.id === id ? user : entry); return user; }),
    devices: () => run(async () => { const state = await permissions(); return state.permissions.canRead ? devices : []; }),
    revokeDevice: (id) => run(async () => { const result = await client.revokeDevice(id); devices = devices.map((entry) => entry.id === id ? { ...entry, revoked: true } : entry); return result; }),
    changePassword: (input) => run(() => client.changePassword(input)),
    // Node-only backup authority: all locally known projects, also while signed out. No network or credentials.
    backupProjectIds: () => run(() => client.backupProjectIds()),
    // Node-only capability for the typed website bridge; never serialized by snapshot or a route.
    createWebsiteAltSyncAdapter() {
      return Object.freeze({ status: () => client.status(), getObject: (...args) => client.getObject(...args),
        editExistingObject: (...args) => client.editExistingObject(...args), refresh: () => client.refresh(),
        sync: (...args) => client.sync(...args), createObject: (...args) => client.createObject(...args),
        listConflicts: () => client.listConflicts(), resolveConflict: (...args) => client.resolveConflict(...args) });
    },
    async close() {
      if (closed) return;
      closing = true;
      speciesEditor.close();
      speciesConflicts.close();
      speciesApproval.close();
      // Abort an in-flight client request before joining the adapter queue.
      await client.close(); await chain; closed = true; users = []; devices = [];
    }
  };
}
