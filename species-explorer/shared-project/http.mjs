import http from "node:http";
import { check, ProjectError } from "./errors.mjs";
import { IMAGE_MEDIA_ID } from "./image-media.mjs";
import { imageMediaHeaderBinding, readImageMediaBody, readBoundedRequestBody, respondImageMedia } from "./image-media-http.mjs";
import { readNormalMediaBody, respondNormalMedia } from "./normal-media-http.mjs";
import { SPECIES_ENRICHMENT_MARKER, SPECIES_ENRICHMENT_REQUEST_BYTES } from "./species-enrichment.mjs";

const loopbacks = new Set(["127.0.0.1", "::1", "localhost"]);
const maxBody = 320 * 1024;
const pairingRoute = "/api/v1/auth/pairing";
const objectWritePath = /^\/api\/v1\/(?:objects(?:\/(?:species|page)\/[a-z0-9-]+)?|changes|conflicts\/[a-f0-9-]+\/resolve)$/;
const richSpeciesMarker = "fn-species-record-v2";

function respond(response, status, data, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    ...headers });
  response.end(JSON.stringify(data));
}
function bearer(request) {
  const value = request.headers.authorization;
  check(typeof value === "string" && /^Bearer [A-Za-z0-9_-]{1,100}$/.test(value),
    401, "authentication_required", "Bitte anmelden.");
  return value.slice(7);
}
async function body(request, timeoutMs) {
  const marker = request.headers["x-shared-object-type"];
  const richSpecies = marker === richSpeciesMarker;
  const enrichment = marker === SPECIES_ENRICHMENT_MARKER;
  const submitChange = request.method === "POST" && request.url === "/api/v1/changes";
  check(!enrichment || submitChange, 400, "object_type_mismatch", "Ein Artvorschlag benötigt den gebundenen Änderungsweg.");
  const objectWrite = ["POST", "PUT"].includes(request.method) && objectWritePath.test(request.url);
  const bodyLimit = request.url === pairingRoute || request.url === `${pairingRoute}/redeem` ? 1024
    : enrichment ? SPECIES_ENRICHMENT_REQUEST_BYTES
    : richSpecies && objectWrite ? 4 * 1024 * 1024 + 16 * 1024
    : ["website-alt-page", "fn-species-page"].includes(marker) && objectWritePath.test(request.url)
      ? 2 * 1024 * 1024 + 16 * 1024 : maxBody;
  check(request.headers["content-type"]?.split(";")[0].trim().toLowerCase() === "application/json",
    415, "json_required", "Der Auftrag muss JSON enthalten.");
  const declared = request.headers["content-length"];
  check(declared === undefined || /^\d+$/.test(declared) && Number(declared) <= bodyLimit,
    413, "body_too_large", "Der Auftrag ist zu groß.");
  const bytes = await readBoundedRequestBody(request, { maxBytes: bodyLimit, timeoutMs });
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { /* handled below */ }
  check(value && typeof value === "object" && !Array.isArray(value), 400, "invalid_json", "Ungültiges JSON-Objekt.");
  if (objectWrite) check(enrichment === Object.hasOwn(value, "enrichment"), 400, "object_type_mismatch", "Ein Artvorschlag benötigt seine ausdrückliche Typkennzeichnung.");
  if (richSpecies) {
    const createOrChange = request.method === "POST" && ["/api/v1/objects", "/api/v1/changes"].includes(request.url) && value.kind === "species";
    const update = request.method === "PUT" && /^\/api\/v1\/objects\/species\/[a-z0-9-]+$/.test(request.url);
    const merge = request.method === "POST" && /^\/api\/v1\/conflicts\/[a-f0-9-]+\/resolve$/.test(request.url) && value.strategy === "merged";
    check(objectWrite && (createOrChange || update || merge) && value.data?.type === "fn-species-record" && value.data.schemaVersion === 2,
      400, "object_type_mismatch", "Die erweiterte Übertragung muss den ausdrücklich gekennzeichneten vollständigen Artdatensatz enthalten.");
  }
  return value;
}

/** No TLS termination, proxy trust, static files or URL fetching is enabled here. */
export function createSharedProjectHttp({ store, host = "127.0.0.1", port = 0,
  allowNetwork = false, allowedHosts = [], allowedOrigins = [], jsonBodyTimeoutMs = 15000, imageBodyTimeoutMs = 120000 } = {}) {
  check(store && (loopbacks.has(host) || allowNetwork === true), 400, "unsafe_bind", "Netzwerkzugriff benötigt eine ausdrückliche Betriebskonfiguration.");
  check(Number.isInteger(port) && port >= 0 && port <= 65535, 400, "invalid_port", "Ungültiger Port.");
  check(Number.isSafeInteger(jsonBodyTimeoutMs) && jsonBodyTimeoutMs > 0 && jsonBodyTimeoutMs <= 15000
    && Number.isSafeInteger(imageBodyTimeoutMs) && imageBodyTimeoutMs > 0 && imageBodyTimeoutMs <= 120000,
  400, "invalid_timeout", "Übertragungsfristen müssen begrenzt bleiben.");
  const readJson = (request) => body(request, jsonBodyTimeoutMs);
  check(Array.isArray(allowedHosts) && allowedHosts.every((value) => typeof value === "string" && /^[a-zA-Z0-9.[\]:-]+$/.test(value))
    && Array.isArray(allowedOrigins) && allowedOrigins.every((value) => {
      try { const url = new URL(value); return url.origin === value && ["http:", "https:"].includes(url.protocol); } catch { return false; }
    }), 400, "invalid_origin", "Ungültige Host- oder Ursprungskonfiguration.");
  check(loopbacks.has(host) || allowedHosts.length > 0, 400, "unsafe_bind", "Netzwerkbetrieb benötigt ausdrücklich erlaubte Hostnamen.");
  let pendingLogins = 0, pendingPairings = 0;
  const loginRates = new Map(), pairingRates = new Map(), imageOperations = new Set(); let pendingImages = 0;
  function loginLimit(request, rates, pending) {
    const key = request.socket.remoteAddress, timestamp = Date.now();
    if (rates.size >= 10000) for (const [id, value] of rates) if (timestamp - value.started > 60000) rates.delete(id);
    const previous = rates.get(key), rate = previous && timestamp - previous.started < 60000 ? previous : { started: timestamp, count: 0 };
    check(++rate.count <= 20 && pending < 2 && rates.size < 10000, 429, "login_throttled", "Zu viele Anmeldeversuche. Bitte später erneut versuchen.");
    rates.set(key, rate);
  }
  // Header limits stay fixed; each actual body reader enforces its own absolute deadline.
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: Math.max(15000, imageBodyTimeoutMs + 10000), headersTimeout: 10000, keepAliveTimeout: 3000 }, async (request, response) => {
    let cors = {};
    try {
      const address = server.address();
      const ownHost = `${host.includes(":") ? `[${host}]` : host}:${address.port}`;
      const hosts = new Set([...(loopbacks.has(host) ? [ownHost] : []), ...allowedHosts]);
      check(hosts.has(request.headers.host), 421, "host_not_allowed", "Unzulässiger Hostname.");
      for (const name of ["host", "authorization", "origin", "content-type", "content-length", "transfer-encoding", "content-encoding", "x-shared-object-type",
        "x-shared-project-id", "x-shared-user-id", "x-shared-role"]) {
        check(request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name).length <= 1,
          400, "duplicate_header", "Mehrdeutige Anfragekopfzeilen.");
      }
      const origin = request.headers.origin;
      if (origin !== undefined) {
        check(allowedOrigins.includes(origin) || loopbacks.has(host) && origin === `http://${ownHost}`,
          403, "origin_not_allowed", "Dieser Browserursprung ist nicht zugelassen.");
        cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
      }
      check(typeof request.url === "string" && request.url.length <= 2048
        && /^\/api\/v[12]\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&-]+)?$/.test(request.url)
        && !request.url.includes("//"), 400, "invalid_path", "Ungültiger API-Pfad.");
      if (request.method === "OPTIONS") {
        check(origin, 403, "origin_not_allowed", "Ein Browserursprung ist erforderlich.");
        respond(response, 200, {}, { ...cors, "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Shared-Object-Type,X-Shared-Project-Id,X-Shared-User-Id,X-Shared-Role", "Access-Control-Max-Age": "300" });
        return;
      }
      const [pathname, query] = request.url.split("?"), method = request.method;
      const parameters = new URLSearchParams(query);
      const pageRoute = pathname === "/api/v1/objects/page";
      const readerPageRoute = pathname === "/api/v2/catalog/page";
      check(query === undefined || query.split("&").every(part => /^[a-z]+=[A-Za-z0-9_-]+$/.test(part)), 400, "invalid_path", "Ungültige API-Parameterform.");
      check(query === undefined || pathname === "/api/v1/objects" && /^(?:kind=(?:species|page))$/.test(query)
        || (pageRoute || readerPageRoute) && [...parameters].every(([key, value]) => parameters.getAll(key).length === 1
          && (pageRoute && key === "kind" && /^(species|page)$/.test(value) || key === "snapshot" && /^[a-f0-9]{64}$/.test(value)
          || key === "cursor" && /^[A-Za-z0-9_-]{1,512}$/.test(value) || key === "limit" && /^(?:[1-9]|1[0-9]|2[0-5])$/.test(value)
          || key === "check" && value === "1")), 400, "invalid_path", "Unzulässige API-Parameter.");
      if (method === "GET") check(!request.headers["transfer-encoding"] && Number(request.headers["content-length"] ?? 0) === 0,
        400, "unexpected_body", "Leseanfragen dürfen keinen Datenkörper enthalten.");
      let result, status = 200;
      if (pathname === "/api/v1/auth/login" && method === "POST") {
        loginLimit(request, loginRates, pendingLogins); pendingLogins++;
        try { result = await store.login(await readJson(request)); } finally { pendingLogins--; }
      } else if (pathname === "/api/v1/auth/refresh" && method === "POST") {
        // The refresh bearer is a device token; never a password or a session.
        if (request.headers["transfer-encoding"] || Number(request.headers["content-length"] ?? 0) > 0) await readJson(request);
        result = store.refresh(bearer(request));
      } else if (pathname === `${pairingRoute}/redeem` && method === "POST") {
        check(request.headers.authorization === undefined, 400, "unexpected_authorization", "Für diese Einladung ist kein Anmeldetoken vorgesehen.");
        loginLimit(request, pairingRates, pendingPairings); pendingPairings++;
        try { result = store.redeemReadPairing(await readJson(request)); } finally { pendingPairings--; }
      } else {
        const token = bearer(request);
        const normalPath = pathname.match(/^\/api\/v1\/normal-media\/(normal-[a-f0-9]{64})(\/content)?$/);
        if (pathname === "/api/v1/normal-media" && method === "POST") {
          store.assertWriteAccess(token); result = store.declareNormalMedia(token, await readJson(request));
        } else if (normalPath) {
          const id = normalPath[1];
          if (!normalPath[2] && method === "GET") result = store.getNormalMedia(token, id);
          else if (normalPath[2] && method === "GET") { respondNormalMedia(response, store.readNormalMedia(token, id), cors); return; }
          else if (normalPath[2] && method === "PUT") {
            const binding = imageMediaHeaderBinding(request);
            const metadata = store.assertNormalMediaWriteAccess(token, binding, id);
            check(pendingImages === 0, 429, "normal_media_busy", "Eine Mediendatei wird bereits übertragen oder geprüft."); pendingImages++;
            const abort = new AbortController(), cancelled = () => { if (!response.writableEnded) abort.abort(); };
            request.once("aborted", cancelled); response.once("close", cancelled);
            try {
              const bytes = await readNormalMediaBody(request, metadata, { timeoutMs: imageBodyTimeoutMs });
              const operation = store.putNormalMedia(token, id, bytes, { expectedBinding: binding, mimeType: request.headers["content-type"], signal: abort.signal });
              imageOperations.add(operation);
              try { result = await operation; } finally { imageOperations.delete(operation); }
            } finally { pendingImages--; request.off("aborted", cancelled); response.off("close", cancelled); }
          }
          check(result !== undefined, 404, "route_not_found", "Diese Artdateiaktion ist nicht vorhanden.");
        } else if (pathname.startsWith("/api/v1/normal-media")) check(false, 404, "route_not_found", "Diese Artdateiaktion ist nicht vorhanden.");
        if (result !== undefined) { respond(response, status, result, cors); return; }
        const mediaPath = pathname.match(/^\/api\/v1\/media\/([^/]+)(\/content)?$/);
        if (pathname === "/api/v1/media" && method === "POST") {
          store.assertWriteAccess(token); result = store.declareImageMedia(token, await readJson(request));
        } else if (mediaPath && IMAGE_MEDIA_ID.test(mediaPath[1])) {
          const id = mediaPath[1];
          if (!mediaPath[2] && method === "GET") result = store.getImageMedia(token, id);
          else if (mediaPath[2] && method === "GET") { respondImageMedia(response, store.readImageMedia(token, id), cors); return; }
          else if (mediaPath[2] && method === "PUT") {
            const binding = imageMediaHeaderBinding(request);
            store.assertImageMediaWriteAccess(token, binding, id);
            check(pendingImages === 0, 429, "image_media_busy", "Ein Bild wird bereits übertragen oder geprüft."); pendingImages++;
            const abort = new AbortController(), cancelled = () => { if (!response.writableEnded) abort.abort(); };
            request.once("aborted", cancelled); response.once("close", cancelled);
            try {
              const metadata = store.getImageMedia(token, id), bytes = await readImageMediaBody(request, metadata, { timeoutMs: imageBodyTimeoutMs });
              const operation = store.putImageMedia(token, id, bytes, { expectedBinding: binding, mimeType: request.headers["content-type"], signal: abort.signal });
              imageOperations.add(operation);
              try { result = await operation; } finally { imageOperations.delete(operation); }
            } finally { pendingImages--; request.off("aborted", cancelled); response.off("close", cancelled); }
          }
          check(result !== undefined, 404, "route_not_found", "Diese Bildaktion ist nicht vorhanden.");
        } else if (pathname.startsWith("/api/v1/media")) check(false, 404, "route_not_found", "Diese Bildaktion ist nicht vorhanden.");
        if (result !== undefined) { respond(response, status, result, cors); return; }
        if (["POST", "PUT"].includes(method) && objectWritePath.test(pathname)) store.assertWriteAccess(token);
        if (pathname === "/api/v1/capabilities" && method === "GET") {
          const current = store.me(token);
          result = { schemaVersion: 1, projectId: current.projectId, user: { id: current.id, role: current.role }, speciesRecordVersion: 1, adminBoundImport: true,
            ...(store.speciesCreation === 1 ? { speciesCreation: 1 } : {}),
            boundConflictReview: 1, boundSpeciesApproval: 1, managedImageMedia: 1, stablePageAssetBinding: 1,
            ...(typeof store.submitChange === "function" && store.pageEditorialAdoption === 1
              ? { pageEditorialAdoption: 1, speciesRecordVersions: [1, 2] } : {}),
            ...(typeof store.submitChange === "function" && store.speciesEnrichment === 1 ? { speciesEnrichment: 1 } : {}),
            ...(store.readerCatalogVersions?.length === 2 && store.readerCatalogVersions[0] === 1 && store.readerCatalogVersions[1] === 2
              && typeof store.readerCatalogPage === "function" ? { readerCatalogVersions: [1, 2], boundReaderApproval: 2 } : {}),
            ...(typeof store.declareNormalMedia === "function" && typeof store.putNormalMedia === "function" ? { normalMedia: 1 } : {}),
            ...(typeof store.issueReadPairing === "function" && typeof store.redeemReadPairing === "function" ? { devicePairing: 1 } : {}) };
        } else if (pathname === "/api/v1/auth/me" && method === "GET") result = store.me(token);
        else if (pathname === pairingRoute && method === "POST") {
          check(Object.keys(await readJson(request)).length === 0, 400, "invalid_pairing", "Die Einladung erhält ihre Daten aus der aktuellen Anmeldung.");
          result = store.issueReadPairing(token); status = 201;
        }
        else if (pathname === "/api/v1/auth/logout" && method === "POST") result = store.logout(token, await readJson(request));
        else if (pathname === "/api/v1/auth/password" && method === "POST") result = await store.changePassword(token, await readJson(request));
        else if (pathname === "/api/v1/auth/devices" && method === "GET") result = { devices: store.devices(token) };
        else if (/^\/api\/v1\/auth\/devices\/[a-f0-9-]+$/.test(pathname) && method === "DELETE") result = store.revokeDevice(token, pathname.split("/").at(-1));
        else if (pathname === "/api/v1/users" && method === "GET") result = { users: store.listUsers(token) };
        else if (pathname === "/api/v1/users" && method === "POST") { result = await store.createUser(token, await readJson(request)); status = 201; }
        else if (/^\/api\/v1\/users\/[a-f0-9-]+$/.test(pathname) && method === "PATCH") result = store.updateUser(token, pathname.split("/").at(-1), await readJson(request));
        else if (pathname === "/api/v1/catalog" && method === "GET") result = store.catalog(token);
        else if (pathname === "/api/v2/catalog" && method === "GET") result = store.readerCatalog(token);
        else if (/^\/api\/v2\/species\/[a-z0-9-]+\/approval-preview$/.test(pathname) && method === "POST") {
          store.assertWriteAccess(token);
          const input = await readJson(request);
          check(Object.keys(input).every(key => ["expectedRevision", "expectedDataHash"].includes(key)),
            400, "invalid_approval_binding", "Die Leserprüfung benötigt ausschließlich ihre gebundene Artfassung.");
          result = store.previewReaderApproval(token, pathname.split("/")[4], input);
        }
        else if (readerPageRoute && method === "GET") result = store.readerCatalogPage(token, {
          snapshot: parameters.get("snapshot") ?? undefined, cursor: parameters.get("cursor") ?? undefined,
          limit: parameters.has("limit") ? Number(parameters.get("limit")) : 25, checkOnly: parameters.get("check") === "1" });
        else if (pageRoute && method === "GET") result = store.objectPage(token, {
          kind: parameters.get("kind") ?? undefined, snapshot: parameters.get("snapshot") ?? undefined,
          cursor: parameters.get("cursor") ?? undefined, limit: Number(parameters.get("limit") ?? 25), checkOnly: parameters.has("check") });
        else if (pathname === "/api/v1/objects" && method === "GET") result = { objects: store.listObjects(token, { kind: query?.slice(5) }) };
        else if (pathname === "/api/v1/objects" && method === "POST") { result = store.createObject(token, await readJson(request)); status = 201; }
        else if (pathname === "/api/v1/changes" && method === "POST") {
          result = store.submitChange(token, await readJson(request));
          if (result.status === "conflict") status = 409;
        } else if (/^\/api\/v1\/changes\/[A-Za-z0-9_-]{8,120}\/cancel$/.test(pathname) && method === "POST") {
          store.assertWriteAccess(token);
          const input = await readJson(request);
          check(Object.keys(input).length === 1 && Object.hasOwn(input, "requestHash"), 400, "invalid_change", "Die Inhaltskennung des alten Auftrags fehlt.");
          result = store.cancelChange(token, { changeId: pathname.split("/")[4], requestHash: input.requestHash });
        } else if (/^\/api\/v1\/objects\/(species|page)\/[a-z0-9-]+(?:\/approve)?$/.test(pathname)) {
          const [, , , , kind, id, action] = pathname.split("/");
          if (action === "approve" && method === "POST") result = store.approveObject(token, kind, id, await readJson(request));
          else if (!action && method === "GET") result = store.getObject(token, kind, id);
          else if (!action && method === "PUT") {
            const input = await readJson(request);
            check(input.kind === undefined && input.id === undefined, 400, "invalid_object", "Objektkennung wird ausschließlich im Pfad angegeben.");
            result = store.submitChange(token, { ...input, kind, id });
            if (result.status === "conflict") status = 409;
          }
        } else if (pathname === "/api/v1/conflicts" && method === "GET") result = { conflicts: store.listConflicts(token) };
        else if (/^\/api\/v1\/conflicts\/[a-f0-9-]+(?:\/resolve)?$/.test(pathname)) {
          const parts = pathname.split("/"), id = parts[4];
          if (parts[5] === "resolve" && method === "POST") result = store.resolveConflict(token, id, await readJson(request));
          else if (!parts[5] && method === "GET") result = store.getConflict(token, id);
        }
        check(result !== undefined, 404, "route_not_found", "Diese API-Aktion ist nicht vorhanden.");
      }
      respond(response, status, result, cors);
    } catch (error) {
      request.resume();
      const known = error instanceof ProjectError;
      if (!response.destroyed && !response.headersSent) {
        if (!request.complete) response.setHeader("Connection", "close");
        respond(response, known ? error.status : 500, { error: { code: known ? error.code : "internal_error",
          message: known ? error.message : "Die Anfrage konnte nicht abgeschlossen werden." } }, cors);
      }
    }
  });
  server.maxHeadersCount = 32;
  server.maxRequestsPerSocket = 100;
  return {
    server,
    async listen() {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => { server.off("error", reject); resolve(); }); });
      const address = server.address();
      return { host, port: address.port, url: `http://${host.includes(":") ? `[${host}]` : host}:${address.port}` };
    },
    async close() {
      if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await Promise.allSettled([...imageOperations]);
    }
  };
}
