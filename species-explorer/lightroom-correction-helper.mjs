import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLightroomCorrectionHandoff } from "./lightroom-correction-handoff.mjs";
import { defaultLightroomSearchRoot } from "./lightroom-search-storage.mjs";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function optionValue(args, name, fallback = "") {
  const prefix = `--${name}=`;
  const entry = args.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function response(request, result = null, error = null) {
  return error
    ? {
        ok: false,
        requestId: cleanText(request?.requestId) || null,
        error: { code: error?.code || "handoff-failed", message: cleanText(error?.message || error) },
      }
    : { ok: true, requestId: cleanText(request?.requestId) || null, result };
}

export async function handleLightroomCorrectionRequest(request = {}, {
  searchRoot = defaultLightroomSearchRoot(),
  openStore = openLightroomSearchStore,
  createHandoff = createLightroomCorrectionHandoff,
} = {}) {
  let store;
  try {
    const masterTaxonId = cleanText(request.masterTaxonId);
    if (!masterTaxonId) throw new Error("Für die Namenskorrektur wurde keine Art ausgewählt.");
    store = await openStore({ searchRoot, slot: "active" });
    if (store?.available === false) {
      throw new Error("Das Lightroom-Taxonomie-Suchpaket ist noch nicht installiert.");
    }
    const taxon = store.taxon(masterTaxonId);
    if (!taxon) throw new Error("Die ausgewählte Art wurde im aktiven Suchpaket nicht gefunden.");
    const result = await createHandoff({ taxon, packageStatus: store.status() });
    return response(request, result);
  } catch (error) {
    return response(request, null, error);
  } finally {
    store?.close?.();
  }
}

export async function handleLightroomCorrectionRequestFile({
  requestPath,
  responsePath,
  searchRoot = defaultLightroomSearchRoot(),
  handleRequest = handleLightroomCorrectionRequest,
} = {}) {
  if (!requestPath || !responsePath) {
    throw new Error("Anfrage- und Antwortdatei sind erforderlich.");
  }
  const request = JSON.parse(await fs.readFile(path.resolve(requestPath), "utf8"));
  const result = await handleRequest(request, { searchRoot });
  await atomicWriteJson(path.resolve(responsePath), result);
  return result;
}

async function main(args = process.argv.slice(2)) {
  const requestPath = optionValue(args, "request");
  const responsePath = optionValue(args, "response");
  const searchRoot = path.resolve(optionValue(args, "search-root", defaultLightroomSearchRoot()));
  return handleLightroomCorrectionRequestFile({ requestPath, responsePath, searchRoot });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Lightroom-Korrekturübergabe fehlgeschlagen: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export const lightroomCorrectionHelperInternals = Object.freeze({
  main,
  optionValue,
  response,
});
