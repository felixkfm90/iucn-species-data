import http from "node:http";
import { check, ProjectError } from "./errors.mjs";

const loopbacks = new Set(["127.0.0.1", "::1", "localhost"]);
const maxBody = 320 * 1024;
const objectWritePath = /^\/api\/v1\/(?:objects(?:\/(?:species|page)\/[a-z0-9-]+)?|changes|conflicts\/[a-f0-9-]+\/resolve)$/;

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
async function body(request) {
  const bodyLimit = ["website-alt-page", "fn-species-page"].includes(request.headers["x-shared-object-type"]) && objectWritePath.test(request.url)
    ? 2 * 1024 * 1024 + 16 * 1024 : maxBody;
  check(request.headers["content-type"]?.split(";")[0].trim().toLowerCase() === "application/json",
    415, "json_required", "Der Auftrag muss JSON enthalten.");
  const declared = request.headers["content-length"];
  check(declared === undefined || /^\d+$/.test(declared) && Number(declared) <= bodyLimit,
    413, "body_too_large", "Der Auftrag ist zu groß.");
  let bytes = 0; const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    check(bytes <= bodyLimit, 413, "body_too_large", "Der Auftrag ist zu groß.");
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* handled below */ }
  check(value && typeof value === "object" && !Array.isArray(value), 400, "invalid_json", "Ungültiges JSON-Objekt.");
  return value;
}

/** No TLS termination, proxy trust, static files or URL fetching is enabled here. */
export function createSharedProjectHttp({ store, host = "127.0.0.1", port = 0,
  allowNetwork = false, allowedHosts = [], allowedOrigins = [] } = {}) {
  check(store && (loopbacks.has(host) || allowNetwork === true), 400, "unsafe_bind", "Netzwerkzugriff benötigt eine ausdrückliche Betriebskonfiguration.");
  check(Number.isInteger(port) && port >= 0 && port <= 65535, 400, "invalid_port", "Ungültiger Port.");
  check(Array.isArray(allowedHosts) && allowedHosts.every((value) => typeof value === "string" && /^[a-zA-Z0-9.[\]:-]+$/.test(value))
    && Array.isArray(allowedOrigins) && allowedOrigins.every((value) => {
      try { const url = new URL(value); return url.origin === value && ["http:", "https:"].includes(url.protocol); } catch { return false; }
    }), 400, "invalid_origin", "Ungültige Host- oder Ursprungskonfiguration.");
  check(loopbacks.has(host) || allowedHosts.length > 0, 400, "unsafe_bind", "Netzwerkbetrieb benötigt ausdrücklich erlaubte Hostnamen.");
  let pendingLogins = 0;
  const loginRates = new Map();
  function loginLimit(request) {
    const key = request.socket.remoteAddress, timestamp = Date.now();
    if (loginRates.size >= 10000) for (const [id, value] of loginRates) if (timestamp - value.started > 60000) loginRates.delete(id);
    const previous = loginRates.get(key), rate = previous && timestamp - previous.started < 60000 ? previous : { started: timestamp, count: 0 };
    check(++rate.count <= 20 && pendingLogins < 2 && loginRates.size < 10000, 429, "login_throttled", "Zu viele Anmeldeversuche. Bitte später erneut versuchen.");
    loginRates.set(key, rate);
  }
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 15000, headersTimeout: 10000, keepAliveTimeout: 3000 }, async (request, response) => {
    let cors = {};
    try {
      const address = server.address();
      const ownHost = `${host.includes(":") ? `[${host}]` : host}:${address.port}`;
      const hosts = new Set([...(loopbacks.has(host) ? [ownHost] : []), ...allowedHosts]);
      check(hosts.has(request.headers.host), 421, "host_not_allowed", "Unzulässiger Hostname.");
      for (const name of ["host", "authorization", "origin", "content-type", "content-length", "x-shared-object-type"]) {
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
        && /^\/api\/v1\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&-]+)?$/.test(request.url)
        && !request.url.includes("//"), 400, "invalid_path", "Ungültiger API-Pfad.");
      if (request.method === "OPTIONS") {
        check(origin, 403, "origin_not_allowed", "Ein Browserursprung ist erforderlich.");
        respond(response, 200, {}, { ...cors, "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Shared-Object-Type", "Access-Control-Max-Age": "300" });
        return;
      }
      const [pathname, query] = request.url.split("?"), method = request.method;
      const parameters = new URLSearchParams(query);
      const pageRoute = pathname === "/api/v1/objects/page";
      check(query === undefined || query.split("&").every(part => /^[a-z]+=[A-Za-z0-9_-]+$/.test(part)), 400, "invalid_path", "Ungültige API-Parameterform.");
      check(query === undefined || pathname === "/api/v1/objects" && /^(?:kind=(?:species|page))$/.test(query)
        || pageRoute && [...parameters].every(([key, value]) => parameters.getAll(key).length === 1
          && (key === "kind" && /^(species|page)$/.test(value) || key === "snapshot" && /^[a-f0-9]{64}$/.test(value)
          || key === "cursor" && /^[A-Za-z0-9_-]{1,512}$/.test(value) || key === "limit" && /^(?:[1-9]|1[0-9]|2[0-5])$/.test(value)
          || key === "check" && value === "1")), 400, "invalid_path", "Unzulässige API-Parameter.");
      if (method === "GET") check(!request.headers["transfer-encoding"] && Number(request.headers["content-length"] ?? 0) === 0,
        400, "unexpected_body", "Leseanfragen dürfen keinen Datenkörper enthalten.");
      let result, status = 200;
      if (pathname === "/api/v1/auth/login" && method === "POST") {
        loginLimit(request); pendingLogins++;
        try { result = await store.login(await body(request)); } finally { pendingLogins--; }
      } else if (pathname === "/api/v1/auth/refresh" && method === "POST") {
        // The refresh bearer is a device token; never a password or a session.
        if (request.headers["transfer-encoding"] || Number(request.headers["content-length"] ?? 0) > 0) await body(request);
        result = store.refresh(bearer(request));
      } else {
        const token = bearer(request);
        if (["POST", "PUT"].includes(method) && objectWritePath.test(pathname)) store.assertWriteAccess(token);
        if (pathname === "/api/v1/auth/me" && method === "GET") result = store.me(token);
        else if (pathname === "/api/v1/auth/logout" && method === "POST") result = store.logout(token, await body(request));
        else if (pathname === "/api/v1/auth/password" && method === "POST") result = await store.changePassword(token, await body(request));
        else if (pathname === "/api/v1/auth/devices" && method === "GET") result = { devices: store.devices(token) };
        else if (/^\/api\/v1\/auth\/devices\/[a-f0-9-]+$/.test(pathname) && method === "DELETE") result = store.revokeDevice(token, pathname.split("/").at(-1));
        else if (pathname === "/api/v1/users" && method === "GET") result = { users: store.listUsers(token) };
        else if (pathname === "/api/v1/users" && method === "POST") { result = await store.createUser(token, await body(request)); status = 201; }
        else if (/^\/api\/v1\/users\/[a-f0-9-]+$/.test(pathname) && method === "PATCH") result = store.updateUser(token, pathname.split("/").at(-1), await body(request));
        else if (pathname === "/api/v1/catalog" && method === "GET") result = store.catalog(token);
        else if (pageRoute && method === "GET") result = store.objectPage(token, {
          kind: parameters.get("kind") ?? undefined, snapshot: parameters.get("snapshot") ?? undefined,
          cursor: parameters.get("cursor") ?? undefined, limit: Number(parameters.get("limit") ?? 25), checkOnly: parameters.has("check") });
        else if (pathname === "/api/v1/objects" && method === "GET") result = { objects: store.listObjects(token, { kind: query?.slice(5) }) };
        else if (pathname === "/api/v1/objects" && method === "POST") { result = store.createObject(token, await body(request)); status = 201; }
        else if (pathname === "/api/v1/changes" && method === "POST") {
          result = store.submitChange(token, await body(request));
          if (result.status === "conflict") status = 409;
        } else if (/^\/api\/v1\/objects\/(species|page)\/[a-z0-9-]+(?:\/approve)?$/.test(pathname)) {
          const [, , , , kind, id, action] = pathname.split("/");
          if (action === "approve" && method === "POST") result = store.approveObject(token, kind, id, await body(request));
          else if (!action && method === "GET") result = store.getObject(token, kind, id);
          else if (!action && method === "PUT") {
            const input = await body(request);
            check(input.kind === undefined && input.id === undefined, 400, "invalid_object", "Objektkennung wird ausschließlich im Pfad angegeben.");
            result = store.submitChange(token, { ...input, kind, id });
            if (result.status === "conflict") status = 409;
          }
        } else if (pathname === "/api/v1/conflicts" && method === "GET") result = { conflicts: store.listConflicts(token) };
        else if (/^\/api\/v1\/conflicts\/[a-f0-9-]+(?:\/resolve)?$/.test(pathname)) {
          const parts = pathname.split("/"), id = parts[4];
          if (parts[5] === "resolve" && method === "POST") result = store.resolveConflict(token, id, await body(request));
          else if (!parts[5] && method === "GET") result = store.getConflict(token, id);
        }
        check(result !== undefined, 404, "route_not_found", "Diese API-Aktion ist nicht vorhanden.");
      }
      respond(response, status, result, cors);
    } catch (error) {
      request.resume();
      const known = error instanceof ProjectError;
      respond(response, known ? error.status : 500, { error: { code: known ? error.code : "internal_error",
        message: known ? error.message : "Die Anfrage konnte nicht abgeschlossen werden." } }, cors);
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
    }
  };
}
