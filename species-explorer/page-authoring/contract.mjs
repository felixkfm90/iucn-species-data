import { createHash } from "node:crypto";

export class PageAuthoringError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message); this.name = "PageAuthoringError"; this.status = status; this.code = code;
    if (details !== undefined) this.details = details;
  }
}
export function check(condition, code, message, status = 400, details) {
  if (!condition) throw new PageAuthoringError(status, code, message, details);
}
export function canonical(value, depth = 0, budget = { nodes: 0 }) {
  check(depth <= 32 && ++budget.nodes <= 200000, 'invalid_data', 'Der Seitenwert ist zu tief oder zu groß.');
  if (value === null || ["string", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1, budget)).join(",")}]`;
  check(value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value)), "invalid_data", "Ein gültiger Seitenwert ist erforderlich.");
  const keys = Object.keys(value).sort();
  check(!keys.some(key => ['__proto__','constructor','prototype'].includes(key)) && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => 'value' in item), 'invalid_data', 'Der Seitenwert muss reine Daten enthalten.');
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1, budget)}`).join(",")}}`;
}
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const fingerprint = value => sha256(canonical(value));
export function fields(value, allowed) {
  check(value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.keys(value).every(key => allowed.includes(key)) && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => 'value' in item), "invalid_fields", "Die Seiteneingabe enthält unzulässige Felder.");
}
export function text(value, max = 1000, empty = false) {
  check(typeof value === "string" && value.length <= max && (empty || value.trim().length > 0)
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), "invalid_text", "Ein gültiger Seitentext ist erforderlich.");
  return value;
}
export function identifier(value) {
  text(value, 160); check(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value), "invalid_id", "Eine gültige Kennung ist erforderlich."); return value;
}
export function slug(value) {
  text(value, 120); check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), "invalid_slug", "Ein gültiger Artslug ist erforderlich."); return value;
}
export function digest(value) { check(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "invalid_hash", "Ein gebundener Inhaltsprüfwert ist erforderlich."); return value; }
export function https(value) {
  text(value, 4096); let url; try { url = new URL(value); } catch { /* below */ }
  check(url && url.protocol === "https:" && !url.username && !url.password && !url.hash && ![...url.searchParams.keys()].some(key => /token|secret|password|credential|signature|x-amz|x-goog/i.test(key)),
    "unsafe_url", "Quellenadressen benötigen HTTPS ohne Zugangsdaten oder private Freigabeparameter."); return value;
}
export function sourceBinding(value) {
  fields(value, ["id", "label", "url", "sha256"]);
  return { id: identifier(value.id), label: text(value.label, 1000), ...(value.url === undefined ? {} : { url: https(value.url) }),
    ...(value.sha256 === undefined ? {} : { sha256: digest(value.sha256) }) };
}
export function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
export function unique(values) { check(new Set(values).size === values.length, "duplicate_id", "Kennungen und Bildpositionen müssen eindeutig sein."); }
export const clone = value => JSON.parse(canonical(value));

export function normalizeActor(value) {
  check(value && typeof value === "object", "authentication_required", "Eine persönliche Projektanmeldung ist erforderlich.", 401);
  const result = { id: identifier(value.id), projectId: identifier(value.projectId), role: value.role, online: value.online === true,
    channel: value.channel === "cms-adapter" ? "cms-adapter" : "interactive" };
  check(["admin", "publisher", "contributor", "reader"].includes(result.role), "forbidden", "Für diesen Seitenauftrag fehlt die Berechtigung.", 403);
  return Object.freeze(result);
}
export function editor(actor) { check(["admin", "publisher", "contributor"].includes(actor.role), "forbidden", "Dieser Seitenentwurf benötigt redaktionelle Berechtigung.", 403); }
export function publisher(actor) { check(["admin", "publisher"].includes(actor.role), "forbidden", "Die Endfreigabe und CMS-Einpflege benötigen Veröffentlichungsberechtigung.", 403); }
export function online(actor) { check(actor.online, "online_required", "Neue Seiten und CMS-Freigaben benötigen eine bestätigte Projektverbindung.", 409); }
