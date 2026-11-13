const DRAFT_ACTIONS = new Set(["save", "confirm-empty", "preview", "approve", "refresh-species", "refresh", "sync", "prepare-cms-plan", "begin-cms-attempt", "create-unpublished-page", "recheck-squarespace-save", "reader-preview", "reader-adopt", "conflict-preview", "conflict-adopt"]);
const draftId = value => /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value);
const imageId = value => /^image-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

export function matchPageAuthoringRoute(method, pathname) {
  const read = method === "GET" || method === "HEAD", name = "page-authoring";
  if (pathname === "/api/page-authoring" && read) return { name, action: "status" };
  if (pathname === "/api/page-authoring/templates" && read) return { name, action: "templates" };
  if (pathname === "/api/page-authoring/drafts" && (read || method === "POST")) return { name, action: read ? "list" : "create" };
  if (pathname === "/api/page-authoring/images/import" && method === "POST") return { name, action: "import-image" };
  const match = /^\/api\/page-authoring\/(drafts|images)\/([^/]+)(?:\/([a-z-]+))?$/.exec(pathname);
  if (!match) return null;
  let id;
  try { id = decodeURIComponent(match[2]); } catch { return null; }
  if (match[1] === "drafts" && draftId(id)) {
    if (read && !match[3]) return { name, action: "get", id };
    if (method === "POST" && DRAFT_ACTIONS.has(match[3])) return { name, action: match[3], id };
  }
  if (match[1] === "images" && imageId(id)) {
    if (read && !match[3]) return { name, action: "image-content", id };
    if (read && match[3] === "metadata") return { name, action: "image-metadata", id };
    if (method === "POST" && ["refresh", "download"].includes(match[3])) return { name, action: `${match[3]}-image`, id };
  }
  return null;
}

export function readPageImageScope(parameters) {
  if ([...parameters.keys()].some(key => key !== "scope") || parameters.getAll("scope").length !== 1
    || !/^[a-f0-9]{64}$/.test(parameters.get("scope") || "")) {
    throw Object.assign(new Error("Die Bildansicht benötigt ihre eindeutige persönliche Projektzuordnung."), { statusCode: 400, code: "invalid_image_scope" });
  }
  return parameters.get("scope");
}
