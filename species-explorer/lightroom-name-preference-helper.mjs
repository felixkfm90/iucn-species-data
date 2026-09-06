import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleLightroomSearchRequestFile } from "./lightroom-search-helper.mjs";
import { defaultLightroomSearchRoot } from "./lightroom-search-storage.mjs";
import { createTaxonomyNamePreferenceService } from "./taxonomy-name-preference-service.mjs";

export async function handleNamePreferenceRequest(request, service) {
  try {
    if (!["preview", "save"].includes(request?.command)) throw new Error("Unbekannte Namenswahl-Aktion.");
    return { ok: true, requestId: request.requestId || null, result: await service[request.command](request) };
  } catch (error) {
    return { ok: false, requestId: request?.requestId || null, error: { code: "name-preference-failed", message: error.message } };
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const option = (key, fallback = "") => process.argv.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
  const searchRoot = option("search-root", defaultLightroomSearchRoot());
  const service = createTaxonomyNamePreferenceService({ searchRoot });
  handleLightroomSearchRequestFile({
    requestPath: option("request"), responsePath: option("response"), searchRoot,
    createHandler: async () => ({ handle: (request) => handleNamePreferenceRequest(request, service), close() {} }),
  }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
