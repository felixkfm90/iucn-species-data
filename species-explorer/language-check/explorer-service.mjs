import { createHash } from "node:crypto";
import { createLanguageCheckService } from "./service.mjs";

const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const changed = () => failure("Die Bearbeitungsgrundlage wurde geändert. Der Sprachhinweis wird verworfen.");

/** Local text feedback only. The browser/session gate belongs to the existing router. */
export function createExplorerLanguageCheckService({ repoRoot, sharedProject, engine, ...engineOptions } = {}) {
  const service = engine || createLanguageCheckService({ ...engineOptions, repoRoot });
  let closed = false, closing;

  async function owner() {
    if (closed) throw failure("Die lokale Sprachprüfung wird geschlossen.");
    const state = await sharedProject?.snapshot();
    if (closed) throw failure("Die lokale Sprachprüfung wird geschlossen.");
    if (!state?.status?.projectId) return "local";
    const { status, permissions = {} } = state;
    if (!status.baseUrl || !status.user?.id || !permissions.canRead || !permissions.canEdit
        || status.readOnlySession || !["admin", "publisher", "contributor"].includes(status.user.role)
        || !["online", "offline"].includes(status.connection)) {
      throw failure("Die Sprachprüfung benötigt deine aktuelle Bearbeitungsberechtigung.", 403);
    }
    return fingerprint({ origin: status.baseUrl, projectId: status.projectId, user: status.user.id,
      version: status.user.version ?? null, role: status.user.role, connection: status.connection,
      rights: Object.fromEntries(Object.keys(permissions).sort().map(key => [key, permissions[key] === true])) });
  }

  function request(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(payload))
        || Object.keys(payload).some(key => !["text", "context"].includes(key))
        || Object.values(Object.getOwnPropertyDescriptors(payload)).some(value => !("value" in value))
        || typeof payload.text !== "string" || payload.text.length > 20000
        || Buffer.byteLength(payload.text, "utf8") > 80000
        || payload.context !== undefined && !["text", "caption", "heading"].includes(payload.context)) {
      throw failure("Die Sprachprüfung benötigt einen begrenzten Text und seinen Feldtyp.", 400);
    }
    return { text: payload.text, context: payload.context ?? "text" };
  }

  return Object.freeze({
    async operation({ action, payload = {}, signal } = {}) {
      const input = action === "check" ? request(payload) : null;
      if (!["check", "status"].includes(action)) throw failure("Unbekannte Sprachprüfung.", 404);
      signal?.throwIfAborted();
      const captured = await owner();
      signal?.throwIfAborted();
      const result = input ? await service.check({ ...input, signal }) : await service.status();
      signal?.throwIfAborted();
      if (await owner() !== captured) throw changed();
      if (input) {
        if (result?.available !== true) return { available: false, findings: [],
          message: "Die lokale Grammatikprüfung ist noch nicht verfügbar. Die Rechtschreibprüfung bleibt aktiv." };
        if (result.textSha256 !== createHash("sha256").update(input.text).digest("hex") || !Array.isArray(result.findings)) throw changed();
        return { available: true, textSha256: result.textSha256, findings: result.findings };
      }
      return { available: result?.available === true, engine: "LanguageTool", version: "6.6",
        message: result?.available === true ? "Die lokale Sprachprüfung ist verfügbar."
          : "Die lokale Grammatikprüfung ist noch nicht verfügbar. Die Rechtschreibprüfung bleibt aktiv." };
    },
    close() {
      if (!closing) { closed = true; closing = Promise.resolve().then(() => service.close()); }
      return closing;
    },
  });
}
