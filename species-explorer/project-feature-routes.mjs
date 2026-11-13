import { matchPageAuthoringRoute } from "./page-authoring/routes.mjs";
import { matchPageAiRoute } from "./local-ai/page-routes.mjs";

const readActions = new Map([["", "snapshot"], ["/objects", "list"], ["/conflicts", "conflicts"], ["/users", "users"], ["/devices", "devices"],
  ["/import", "import-status"], ["/import/receipts", "import-receipts"]]);
const writeActions = new Map([["/connect", "connect"], ["/disconnect", "disconnect"], ["/sync", "sync"],
  ["/refresh", "refresh"], ["/objects", "create"], ["/users", "createUser"], ["/password", "changePassword"], ["/devices/pairing", "issueReadPairing"],
  ["/import/prepare", "import-prepare"], ["/import/start", "import-start"], ["/import/media", "import-media"]]);

/** Local front-end routes only; the remote NAS API keeps its own role checks. */
export function matchProjectFeatureRoute(method, pathname) {
  const page = matchPageAuthoringRoute(method, pathname);
  if (page) return page;
  const pageAi = matchPageAiRoute(method, pathname);
  if (pageAi) return pageAi;
  const read = method === "GET" || method === "HEAD";
  if (pathname === "/api/language-check" && read) return { name: "language-check", action: "status" };
  if (pathname === "/api/language-check/check" && method === "POST") return { name: "language-check", action: "check" };
  const altShared = pathname.match(/^\/api\/website\/alt-texts\/shared(?:\/(page|conflicts|link|queue|sync|pull|import|resolve))?$/);
  if (altShared && (read && [undefined, "page", "conflicts"].includes(altShared[1])
      || method === "POST" && ["link", "queue", "sync", "pull", "import", "resolve"].includes(altShared[1]))) {
    return { name: "website-alt-sync", action: altShared[1] || "snapshot" };
  }
  if (pathname === "/api/local-ai" && read) return { name: "local-ai", action: "status" };
  const aiAction = pathname.match(/^\/api\/local-ai\/(download|cancel-download|suggest-alt|suggest-text|review-text|review-language)$/);
  if (aiAction && method === "POST") return { name: "local-ai", action: aiAction[1] };
  const aiJob = pathname.match(/^\/api\/local-ai\/jobs\/([a-f0-9-]{36})(\/cancel)?$/);
  if (aiJob && (read && !aiJob[2] || method === "POST" && aiJob[2])) return { name: "local-ai", action: read ? "get" : "cancel", id: aiJob[1] };
  if (pathname === "/api/taxonomy/update-completion" && read) return { name: "update-completion", action: "status" };
  const completion = pathname.match(/^\/api\/taxonomy\/update-completion\/(displayed|cancel)$/);
  if (completion && method === "POST") return { name: "update-completion", action: completion[1] };
  if (!pathname.startsWith("/api/shared-project")) return null;
  const tail = pathname.slice("/api/shared-project".length);
  const speciesCreation = tail.match(/^\/species\/new\/(availability|preview|create|recover)$/);
  if (speciesCreation && (read && speciesCreation[1] === "availability" || method === "POST" && speciesCreation[1] !== "availability"))
    return { name: "shared-project", action: `species-create-${speciesCreation[1]}` };
  const speciesOffline = tail.match(/^\/species\/([a-z0-9]+(?:-[a-z0-9]+)*)\/offline\/(preview|download)$/);
  if (speciesOffline && method === "POST") return { name: "shared-project", action: `species-offline-${speciesOffline[2]}`, id: speciesOffline[1] };
  const speciesContent = tail.match(/^\/species\/([a-z0-9]+(?:-[a-z0-9]+)*)\/normal-content\/(portrait\.webp|map\.jpg|sound\.mp3|spectrogram\.webp)$/);
  if (speciesContent && read) return { name: "shared-project", action: "species-normal-content", id: speciesContent[1], slot: speciesContent[2] };
  const speciesEnrichment = tail.match(/^\/species\/([a-z0-9]+(?:-[a-z0-9]+)*)\/enrichment\/(status|prepare|stage|sync)$/);
  if (speciesEnrichment && method === "POST") return { name: "shared-project", action: `species-enrichment-${speciesEnrichment[2]}`, id: speciesEnrichment[1] };
  const speciesEnrichmentFile = tail.match(/^\/species\/([a-z0-9]+(?:-[a-z0-9]+)*)\/enrichment\/([a-f0-9]{64})\/file\/(portrait\.webp|map\.jpg|sound\.mp3|spectrogram\.webp)$/);
  if (speciesEnrichmentFile && read) return { name: "shared-project", action: "species-enrichment-file",
    id: speciesEnrichmentFile[1], candidateId: speciesEnrichmentFile[2], slot: speciesEnrichmentFile[3] };
  if (tail === "/species/conflicts" && read) return { name: "shared-project", action: "species-conflicts-list" };
  const speciesApproval = tail.match(/^\/species\/([a-z0-9]+(?:-[a-z0-9]+)*)\/approval\/(preview|approve|provide-media)$/);
  if (speciesApproval && method === "POST") return { name: "shared-project", action: `species-approval-${speciesApproval[2]}`, id: speciesApproval[1] };
  const speciesConflict = tail.match(/^\/species\/conflicts\/([a-f0-9-]{36})(?:\/(preview|resolve))?$/);
  if (speciesConflict && (read && !speciesConflict[2] || method === "POST" && speciesConflict[2])) {
    return { name: "shared-project", action: `species-conflicts-${speciesConflict[2] || "get"}`, id: speciesConflict[1] };
  }
  if (tail === "/species/workspace" && read) return { name: "shared-project", action: "species-workspace" };
  if (tail === "/species/workspace/revision" && read) return { name: "shared-project", action: "species-workspace-revision" };
  if (tail === "/species" && read) return { name: "shared-project", action: "species-list" };
  const speciesEditor = tail.match(/^\/species\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(preview|save))?$/);
  if (speciesEditor && (read && !speciesEditor[2] || method === "POST" && speciesEditor[2])) {
    return { name: "shared-project", action: `species-${speciesEditor[2] || "get"}`, id: speciesEditor[1] };
  }
  const exact = (read ? readActions : method === "POST" ? writeActions : new Map()).get(tail);
  if (exact) return { name: "shared-project", action: exact };
  const object = tail.match(/^\/objects\/(species|page)\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/approve)?$/);
  if (object && (read && !object[3] || method === "POST")) {
    return { name: "shared-project", action: read ? "get" : object[3] ? "approve" : "editExisting", kind: object[1], id: object[2] };
  }
  const conflict = tail.match(/^\/conflicts\/([a-f0-9-]{36})(\/resolve)?$/);
  if (conflict && (read && !conflict[2] || method === "POST" && conflict[2])) {
    return { name: "shared-project", action: read ? "conflict" : "resolve", id: conflict[1] };
  }
  const user = tail.match(/^\/users\/([a-f0-9-]{36})$/);
  if (user && method === "POST") return { name: "shared-project", action: "updateUser", id: user[1] };
  const device = tail.match(/^\/devices\/([a-f0-9-]{36})\/revoke$/);
  if (device && method === "POST") return { name: "shared-project", action: "revokeDevice", id: device[1] };
  return null;
}

export async function invokeSharedProjectOperation(service, { action, kind, id, payload = {}, searchParams, signal, candidateId, slot } = {}) {
  if (!service) {
    if (action === "snapshot") return { schemaVersion: 1, available: false,
      status: { connection: "disconnected", pending: 0, conflicts: 0 },
      permissions: { canRead: false, canEdit: false, canCreate: false, canApprove: false, canManageUsers: false, canManageDevices: false, canChangePassword: false },
      objects: [], conflicts: [], users: [], devices: [], busy: false, queuedChanges: 0, conflictCount: 0,
      message: "Gemeinsames Projekt in der Desktop-App einrichten.", externalPublication: "not-performed" };
    throw Object.assign(new Error("Das gemeinsame Projekt ist auf diesem Gerät noch nicht eingerichtet."), { statusCode: 503 });
  }
  switch (action) {
    case "species-create-availability": return service.speciesCreation.availability();
    case "species-create-recover": return service.speciesCreation.recover(payload);
    case "species-create-preview": return service.speciesCreation.preview(payload);
    case "species-create-create": return service.speciesCreation.create(payload);
    case "species-offline-preview": return service.normalOffline.preview(id, payload);
    case "species-offline-download": return service.normalOffline.download(id, payload);
    case "species-normal-content": return service.normalOffline.content(id, slot, payload, signal);
    case "species-enrichment-status": return service.speciesEnrichment.status(id, payload);
    case "species-enrichment-prepare": return service.speciesEnrichment.prepare(id, payload, signal);
    case "species-enrichment-file": return service.speciesEnrichment.file(id, { ...payload, candidateId, slot });
    case "species-enrichment-stage": return service.speciesEnrichment.stage(id, payload);
    case "species-enrichment-sync": return service.speciesEnrichment.sync(id, payload);
    case "species-approval-preview": return service.speciesApproval.preview(id, payload);
    case "species-approval-approve": return service.speciesApproval.approve(id, payload);
    case "species-approval-provide-media": return service.speciesApproval.provideMedia(id, payload);
    case "species-conflicts-list": return service.speciesConflicts.list();
    case "species-conflicts-get": return service.speciesConflicts.get(id);
    case "species-conflicts-preview": return service.speciesConflicts.preview(id, payload);
    case "species-conflicts-resolve": return service.speciesConflicts.resolve(id, payload);
    case "species-workspace": return service.speciesWorkspace.read();
    case "species-workspace-revision": return service.speciesWorkspace.revision();
    case "species-list": return service.speciesEditor.list();
    case "species-get": return service.speciesEditor.get(id);
    case "species-preview": return service.speciesEditor.preview(id, payload);
    case "species-save": return service.speciesEditor.save(id, payload);
    case "snapshot": return service.snapshot();
    case "connect": return service.connect(payload);
    case "disconnect": return service.disconnect();
    case "sync": return service.sync();
    case "refresh": return service.refresh(payload);
    case "list": return service.list({ kind: searchParams?.get("kind") || undefined });
    case "get": return service.get(kind, id);
    case "editExisting": return service.editExisting(kind, id, payload);
    case "create": return service.create(payload);
    case "approve": return service.approve(kind, id, payload);
    case "conflicts": return service.conflicts();
    case "conflict": {
      const conflicts = await service.conflicts();
      const found = (Array.isArray(conflicts) ? conflicts : conflicts.conflicts || []).find((entry) => entry.id === id);
      if (!found) throw Object.assign(new Error("Der lokale Konflikt ist nicht mehr vorhanden."), { statusCode: 404 });
      return found;
    }
    case "resolve": return service.resolve(id, payload);
    case "users": return service.users();
    case "createUser": return service.createUser(payload);
    case "updateUser": return service.updateUser(id, payload);
    case "devices": return service.devices();
    case "issueReadPairing": return service.issueReadPairing(payload);
    case "revokeDevice": return service.revokeDevice(id);
    case "changePassword": return service.changePassword(payload);
    default: throw Object.assign(new Error("Unbekannte Projektaktion."), { statusCode: 404 });
  }
}
