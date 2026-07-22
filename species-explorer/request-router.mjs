import {
  assertBrowserReadContext,
  assertLocalRequestHost,
  assertWriteRequest,
} from "./request-security.mjs";
import {
  MAX_JSON_BODY_BYTES,
  readJsonBody,
  safeAssetPath,
  safeGraphicsPath,
  safePublicPath,
  sendFile,
  sendJson,
  sendText,
} from "./http-routing.mjs";

const READ_RESOURCES = new Map([
  ["/api/summary", "summary"],
  ["/api/species", "species"],
  ["/api/validation", "validation"],
  ["/api/revision", "revision"],
  ["/api/pending-changes", "pending-changes"],
  ["/api/settings", "settings"],
  ["/api/pipeline/status", "pipeline-status"],
  ["/api/backup/status", "backup-status"],
  ["/api/reload", "reload"],
]);

const POST_ROUTES = new Map([
  ["/api/pipeline/preview", { name: "pipeline", action: "preview" }],
  ["/api/pipeline/start", { name: "pipeline", action: "start" }],
  ["/api/settings/backup", { name: "backup-settings", action: "save" }],
  ["/api/backup/preview", { name: "backup", action: "preview" }],
  ["/api/backup/start", { name: "backup", action: "start" }],
  ["/api/pipeline/assets/review", { name: "pipeline-asset-review", action: "save" }],
  ["/api/species/new/preview", { name: "new-species", action: "preview" }],
  ["/api/species/new/save", { name: "new-species", action: "save" }],
  ["/api/species/new/portrait-prompt", { name: "new-species", action: "portrait-prompt" }],
  ["/api/species/new/portrait-preview", { name: "new-species", action: "portrait-preview" }],
]);

const ASSET_ACTIONS = {
  map: "preview|save|delete-preview|delete|restore-preview|restore",
  sound: "preview|edit-preview|save|reject|delete-preview|delete|restore-preview|restore",
  portrait: "prompt|preview|save|delete-preview|delete|restore-preview|restore",
};

const ASSET_PREVIEW_MESSAGES = {
  map: "Kartenvorschau nicht gefunden",
  sound: "Soundvorschau nicht gefunden",
  portrait: "Artporträt-Vorschau nicht gefunden",
};

export function matchExplorerRoute(method, pathname) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = String(pathname || "/");

  if (normalizedPath === "/api/session") return { name: "session" };

  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    const previewFileRoute = normalizedPath.match(
      /^\/api\/species\/([^/]+)\/assets\/(map|sound|portrait)\/preview-file$/,
    );
    if (previewFileRoute) {
      return {
        name: "asset-preview-file",
        encodedId: previewFileRoute[1],
        assetType: previewFileRoute[2],
      };
    }
  }

  if (normalizedMethod === "POST") {
    const exactRoute = POST_ROUTES.get(normalizedPath);
    if (exactRoute) return { ...exactRoute };

    for (const [assetType, actions] of Object.entries(ASSET_ACTIONS)) {
      const assetRoute = normalizedPath.match(
        new RegExp(`^/api/species/([^/]+)/assets/${assetType}/(${actions})$`),
      );
      if (assetRoute) {
        return {
          name: "asset",
          encodedId: assetRoute[1],
          assetType,
          action: assetRoute[2],
        };
      }
    }

    const deleteRoute = normalizedPath.match(/^\/api\/species\/([^/]+)\/delete\/(preview|save)$/);
    if (deleteRoute) {
      return { name: "delete-species", encodedId: deleteRoute[1], action: deleteRoute[2] };
    }
    const taxonomyRoute = normalizedPath.match(/^\/api\/species\/([^/]+)\/taxonomy\/(preview|save)$/);
    if (taxonomyRoute) {
      return { name: "edit-taxonomy", encodedId: taxonomyRoute[1], action: taxonomyRoute[2] };
    }
    const editRoute = normalizedPath.match(/^\/api\/species\/([^/]+)\/(preview|save)$/);
    if (editRoute) {
      return { name: "edit-species", encodedId: editRoute[1], action: editRoute[2] };
    }
  }

  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    return { name: "method-not-allowed" };
  }

  const resource = READ_RESOURCES.get(normalizedPath);
  if (resource) return { name: "read", resource };
  if (normalizedMethod === "GET" && normalizedPath === "/api/pipeline/assets/backup-file") {
    return { name: "pipeline-backup-file" };
  }
  if (normalizedPath.startsWith("/assets/")) return { name: "asset-file", pathname: normalizedPath };
  if (normalizedPath.startsWith("/graphics/")) return { name: "graphics-file", pathname: normalizedPath };
  return { name: "public-file", pathname: normalizedPath };
}

function decodeRouteId(encodedId) {
  try {
    return decodeURIComponent(encodedId);
  } catch {
    const error = new Error("Artkennung ist ungültig");
    error.statusCode = 400;
    throw error;
  }
}

export function createExplorerRequestHandler({
  host,
  sessionToken,
  sessionProtection = true,
  repoRoot,
  publicDir,
  bodyLimits = {},
  operations,
}) {
  const resolvedBodyLimits = {
    map: bodyLimits.map ?? MAX_JSON_BODY_BYTES,
    sound: bodyLimits.sound ?? MAX_JSON_BODY_BYTES,
    portrait: bodyLimits.portrait ?? MAX_JSON_BODY_BYTES,
  };

  return async function explorerRequestHandler(request, response) {
    try {
      const expectedOrigin = assertLocalRequestHost(request, host);
      const url = new URL(request.url, expectedOrigin);
      if (url.origin !== expectedOrigin) {
        const error = new Error("Absolute oder fremde Anfrage-URL ist nicht erlaubt");
        error.statusCode = 400;
        throw error;
      }

      const route = matchExplorerRoute(request.method, url.pathname);
      if (route.name === "session") {
        if (request.method !== "GET") {
          response.setHeader("Allow", "GET");
          sendText(response, 405, "Sitzungsinformationen sind nur lesbar");
          return;
        }
        assertBrowserReadContext(request, expectedOrigin);
        sendJson(response, 200, { token: sessionToken });
        return;
      }

      if (request.method === "POST") {
        assertWriteRequest(request, { expectedOrigin, sessionToken, sessionProtection });
      }

      if (route.name === "asset-preview-file") {
        const id = decodeRouteId(route.encodedId);
        const token = String(url.searchParams.get("token") ?? "");
        const stagingPath = await operations.previewAssetFile({
          assetType: route.assetType,
          id,
          token,
        });
        if (!stagingPath) {
          sendText(response, 404, ASSET_PREVIEW_MESSAGES[route.assetType]);
          return;
        }
        await sendFile(request, response, stagingPath);
        return;
      }

      if (route.name === "asset") {
        const id = decodeRouteId(route.encodedId);
        const payload = await readJsonBody(request, {
          maxBytes: route.action === "preview"
            ? resolvedBodyLimits[route.assetType]
            : MAX_JSON_BODY_BYTES,
        });
        const result = await operations.asset({
          assetType: route.assetType,
          id,
          action: route.action,
          payload,
        });
        sendJson(response, 200, result);
        return;
      }

      if (route.name === "pipeline") {
        const payload = await readJsonBody(request);
        sendJson(response, 200, await operations.pipeline({ action: route.action, payload }));
        return;
      }

      if (route.name === "backup-settings") {
        const payload = await readJsonBody(request);
        sendJson(response, 200, await operations.backupSettings({ payload }));
        return;
      }

      if (route.name === "backup") {
        const payload = await readJsonBody(request);
        sendJson(response, 200, await operations.backup({ action: route.action, payload }));
        return;
      }

      if (route.name === "pipeline-asset-review") {
        const payload = await readJsonBody(request);
        sendJson(response, 200, await operations.pipelineAssetReview({ payload }));
        return;
      }

      if (route.name === "new-species") {
        const payload = await readJsonBody(request, {
          maxBytes: route.action === "portrait-preview"
            ? resolvedBodyLimits.portrait
            : MAX_JSON_BODY_BYTES,
        });
        sendJson(response, 200, await operations.newSpecies({ action: route.action, payload }));
        return;
      }

      if (["delete-species", "edit-species", "edit-taxonomy"].includes(route.name)) {
        const id = decodeRouteId(route.encodedId);
        const payload = await readJsonBody(request);
        const operation = {
          "delete-species": operations.deleteSpecies,
          "edit-species": operations.editSpecies,
          "edit-taxonomy": operations.editTaxonomy,
        }[route.name];
        sendJson(response, 200, await operation({ id, action: route.action, payload }));
        return;
      }

      if (route.name === "method-not-allowed") {
        response.setHeader("Allow", "GET, HEAD, POST");
        sendText(response, 405, "Nur definierte Lese- und Bearbeitungsrouten sind erlaubt.");
        return;
      }

      if (route.name === "read") {
        sendJson(response, 200, await operations.read({ resource: route.resource }));
        return;
      }

      if (route.name === "pipeline-backup-file") {
        await operations.pipelineBackupFile({ url, request, response });
        return;
      }

      if (route.name === "asset-file") {
        await sendFile(request, response, safeAssetPath(route.pathname, repoRoot));
        return;
      }
      if (route.name === "graphics-file") {
        await sendFile(request, response, safeGraphicsPath(route.pathname, repoRoot));
        return;
      }
      await sendFile(request, response, safePublicPath(route.pathname, publicDir));
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, {
        error: error.message,
        details: error.details ?? [],
        fieldErrors: error.fieldErrors ?? {},
      });
    }
  };
}
