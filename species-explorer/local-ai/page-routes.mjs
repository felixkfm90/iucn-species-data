const actions = new Set(["suggest-alt", "suggest-text", "review-text", "review-language"]);
const digest = value => /^[a-f0-9]{64}$/.test(value || "");
const identifier = value => /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value || "");
const invalid = () => Object.assign(new Error("Die Artseitenhilfe benötigt eine eindeutige gespeicherte persönliche Seitenfassung."),
  { statusCode: 400, code: "invalid_page_ai_request" });

export function matchPageAiRoute(method, pathname) {
  const prefix = "/api/local-ai/page-authoring/";
  if (!pathname.startsWith(prefix)) return null;
  const action = pathname.slice(prefix.length), read = method === "GET" || method === "HEAD";
  if (read && action === "sources") return { name: "local-ai", action: "page-sources", pageAuthoring: true };
  return method === "POST" && actions.has(action) ? { name: "local-ai", action, pageAuthoring: true } : null;
}

export function readPageAiPayload(route, payload, parameters) {
  if (route.action === "page-sources") {
    const keys = ["draftId", "scope", "revision", "sectionId"];
    if ([...parameters.keys()].some(key => !keys.includes(key)) || keys.some(key => parameters.getAll(key).length !== 1)
      || !identifier(parameters.get("draftId")) || !identifier(parameters.get("sectionId"))
      || !digest(parameters.get("scope")) || !digest(parameters.get("revision"))) throw invalid();
    return { type: "page-authoring", sourceScope: parameters.get("scope"), draftId: parameters.get("draftId"),
      expectedRevision: parameters.get("revision"), sectionId: parameters.get("sectionId") };
  }
  if ([...parameters.keys()].length || !payload || Array.isArray(payload) || typeof payload !== "object"
    || payload.type !== "page-authoring" || !actions.has(route.action)) throw invalid();
  return payload;
}
