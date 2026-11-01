import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { check } from "./errors.mjs";

const derive = promisify(scrypt);
const parameters = Object.freeze({ N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
const dummySalt = "f1dcae605538b1e4660ca82f327d284b";

export function validatePassword(password) {
  check(typeof password === "string" && password.length >= 12 && password.length <= 256
    && !password.includes("\0"), 400, "invalid_password", "Das Passwort muss 12 bis 256 Zeichen enthalten.");
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64, parameters);
  return `scrypt$131072$8$1$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  const validInput = typeof password === "string" && password.length <= 256 && !password.includes("\0");
  const match = typeof encoded === "string" && /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  const key = await derive(validInput ? password : "invalid input", match ? match[1] : dummySalt, 64, parameters);
  const expected = match ? Buffer.from(match[2], "hex") : Buffer.alloc(64);
  return Boolean(timingSafeEqual(key, expected) && match && validInput);
}

export function digest(value) { return createHash("sha256").update(value).digest("hex"); }
export function newToken(kind) { return `${kind}1_${randomBytes(32).toString("base64url")}`; }
export function tokenHash(token, kind) {
  return typeof token === "string" && new RegExp(`^${kind}1_[A-Za-z0-9_-]{43}$`).test(token) ? digest(token) : "";
}

// Stable JSON binds retries to their exact semantic request, not key order.
export function canonicalJson(value, { maxBytes = 256 * 1024, maxNodes = 20000 } = {}) {
  check(Number.isInteger(maxBytes) && maxBytes > 0 && maxBytes <= 8 * 1024 * 1024 && Number.isInteger(maxNodes)
    && maxNodes > 0 && maxNodes <= 300000, 400, "invalid_data", "Ungültige interne JSON-Grenze.");
  let nodes = 0;
  function visit(item, depth) {
    check(depth <= 32 && ++nodes <= maxNodes, 400, "invalid_data", "Die Datenstruktur ist zu groß oder zu tief.");
    if (item === null || typeof item === "boolean" || typeof item === "string") return JSON.stringify(item);
    if (typeof item === "number" && Number.isFinite(item)) return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map((entry) => visit(entry, depth + 1)).join(",")}]`;
    check(item && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype,
      400, "invalid_data", "Es werden ausschließlich JSON-Daten angenommen.");
    const keys = Object.keys(item).sort();
    check(!keys.some((key) => ["__proto__", "prototype", "constructor"].includes(key)),
      400, "invalid_data", "Unzulässiger Datenschlüssel.");
    return `{${keys.map((key) => `${JSON.stringify(key)}:${visit(item[key], depth + 1)}`).join(",")}}`;
  }
  const result = visit(value, 0);
  check(Buffer.byteLength(result) <= maxBytes, 413, "data_too_large", "Der Datensatz ist zu groß.");
  return result;
}

export function objectJson(value) {
  return canonicalJson(value, ["website-alt-page", "fn-species-page"].includes(value?.type) ? { maxBytes: 2 * 1024 * 1024, maxNodes: 250000 } : {});
}
export function transportJson(value) {
  return canonicalJson(value, ["website-alt-page", "fn-species-page", "fn-species-record"].includes(value?.data?.type) || ["website-alt-page", "fn-species-page", "fn-species-record"].includes(value?.object?.data?.type)
    ? { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 } : {});
}
