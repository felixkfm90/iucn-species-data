import { lookup as dnsLookup } from "node:dns/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { isAbsolute, relative, resolve } from "node:path";

export const SESSION_HEADER = "x-species-explorer-session";

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function assertLocalRequestHost(request, configuredHost) {
  const port = request.socket?.localPort;
  const expectedHost = `${formatHost(configuredHost)}:${port}`.toLowerCase();
  const receivedHost = String(request.headers.host || "").trim().toLowerCase();
  if (!port || receivedHost !== expectedHost) {
    throw httpError(421, "Anfrage verwendet keinen gültigen lokalen Explorer-Host");
  }
  return `http://${expectedHost}`;
}

export function assertBrowserReadContext(request, expectedOrigin) {
  assertFetchSite(request);
  const origin = String(request.headers.origin || "").trim();
  if (origin && origin !== expectedOrigin) {
    throw httpError(403, "Browser-Anfrage stammt nicht vom Arten-Explorer");
  }
}

export function assertWriteRequest(request, {
  expectedOrigin,
  sessionToken,
  sessionProtection = true,
} = {}) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw httpError(415, "Schreibende Anfragen müssen application/json verwenden");
  }
  if (!sessionProtection) return;

  assertBrowserReadContext(request, expectedOrigin);
  const supplied = String(request.headers[SESSION_HEADER] || "");
  if (!safeTokenEqual(supplied, sessionToken)) {
    throw httpError(403, "Explorer-Sitzung fehlt oder ist nicht mehr gültig");
  }
}

export async function assertPublicHttpUrl(value, { lookup = dnsLookup } = {}) {
  let parsed;
  try {
    parsed = value instanceof URL ? new URL(value.href) : new URL(String(value));
  } catch {
    throw httpError(400, "URL ist ungültig");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw httpError(400, "URL muss HTTP oder HTTPS verwenden");
  }
  if (parsed.username || parsed.password) {
    throw httpError(400, "URL darf keine Zugangsdaten enthalten");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".home.arpa")
  ) {
    throw httpError(400, "Lokale oder interne URL-Ziele sind nicht erlaubt");
  }

  const directFamily = isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await lookup(hostname, { all: true, verbatim: true }).catch((error) => {
      throw httpError(400, `URL-Ziel konnte nicht öffentlich aufgelöst werden: ${error.message}`);
    });
  if (!addresses.length || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw httpError(400, "Private, lokale, Link-Local- oder Metadatenziele sind nicht erlaubt");
  }
  return parsed;
}

export function isPrivateNetworkAddress(value) {
  const address = String(value || "").split("%")[0].toLowerCase();
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51)
      || (a === 203 && b === 0)
      || a >= 224;
  }
  if (family === 6) {
    if (address === "::" || address === "::1") return true;
    const embeddedIpv4 = extractEmbeddedIpv4(address);
    if (embeddedIpv4 && isPrivateNetworkAddress(embeddedIpv4)) return true;
    const first = Number.parseInt(address.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00
      || (first & 0xffc0) === 0xfe80
      || (first & 0xffc0) === 0xfec0
      || (first & 0xff00) === 0xff00
      || address.startsWith("2001:db8:");
  }
  return true;
}

function extractEmbeddedIpv4(address) {
  const dotted = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];

  const supportedPrefix = ["::ffff:0:", "::ffff:", "64:ff9b::", "::"]
    .find((prefix) => address.startsWith(prefix));
  if (!supportedPrefix) return null;
  const tail = address.slice(supportedPrefix.length).split(":").filter(Boolean);
  if (tail.length !== 2 || tail.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const high = Number.parseInt(tail[0], 16);
  const low = Number.parseInt(tail[1], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

export function isPathInside(rootPath, candidatePath, { allowRoot = false } = {}) {
  const root = resolve(rootPath);
  const candidate = resolve(candidatePath);
  const child = relative(root, candidate);
  if (!child) return allowRoot;
  return child !== ".." && !child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(child);
}

function assertFetchSite(request) {
  const fetchSite = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw httpError(403, "Browser-Anfrage stammt nicht aus derselben Explorer-Seite");
  }
}

function safeTokenEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function formatHost(host) {
  const value = String(host || "").replace(/^\[|\]$/g, "");
  return value.includes(":") ? `[${value}]` : value;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
