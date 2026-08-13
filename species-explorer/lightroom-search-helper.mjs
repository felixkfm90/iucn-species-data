import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { defaultLightroomSearchRoot } from "./lightroom-search-storage.mjs";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";

export const LIGHTROOM_SEARCH_PROTOCOL_VERSION = 1;

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function optionValue(args, name, fallback = "") {
  const prefix = `--${name}=`;
  const entry = args.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function requestId(request) {
  return cleanText(request?.requestId) || null;
}

function success(request, result) {
  return { ok: true, requestId: requestId(request), result };
}

function failure(request, error, code = "request-failed") {
  return {
    ok: false,
    requestId: requestId(request),
    error: { code, message: cleanText(error?.message || error) || "Unbekannter Fehler" },
  };
}

export async function createLightroomSearchRequestHandler({
  searchRoot = defaultLightroomSearchRoot(),
  slot = "active",
  openStore = openLightroomSearchStore,
} = {}) {
  const store = await openStore({ searchRoot, slot });
  let closed = false;

  function assertAvailable() {
    if (closed) throw Object.assign(new Error("Suchhilfe ist bereits geschlossen."), {
      code: "helper-closed",
    });
    if (store?.available === false) {
      throw Object.assign(
        new Error("Das Lightroom-Taxonomie-Suchpaket ist noch nicht installiert."),
        { code: "package-not-installed" },
      );
    }
  }

  return {
    async handle(request = {}) {
      const command = cleanText(request.command).toLowerCase();
      try {
        if (command === "ping") {
          return success(request, {
            service: "fn-lightroom-taxonomy-search",
            protocolVersion: LIGHTROOM_SEARCH_PROTOCOL_VERSION,
          });
        }
        assertAvailable();
        if (command === "status") return success(request, store.status());
        if (command === "search") {
          return success(request, store.search(request.query, {
            limit: request.limit,
            kingdom: cleanText(request.kingdom) || "all",
          }));
        }
        if (command === "taxon") {
          const taxon = store.taxon(request.masterTaxonId);
          if (!taxon) {
            throw Object.assign(new Error("Taxon wurde im Suchpaket nicht gefunden."), {
              code: "taxon-not-found",
            });
          }
          return success(request, taxon);
        }
        if (command === "close") {
          this.close();
          return success(request, { closed: true });
        }
        throw Object.assign(new Error(`Unbekannter Suchbefehl: ${command || "(leer)"}`), {
          code: "unknown-command",
        });
      } catch (error) {
        return failure(request, error, error?.code || "request-failed");
      }
    },
    close() {
      if (closed) return;
      store?.close?.();
      closed = true;
    },
  };
}

export async function handleLightroomSearchRequestFile({
  requestPath,
  responsePath,
  searchRoot = defaultLightroomSearchRoot(),
  slot = "active",
  createHandler = createLightroomSearchRequestHandler,
} = {}) {
  if (!requestPath || !responsePath) {
    throw new Error("Anfrage- und Antwortdatei sind erforderlich.");
  }
  const request = JSON.parse(await fs.readFile(path.resolve(requestPath), "utf8"));
  const handler = await createHandler({ searchRoot, slot });
  try {
    const response = await handler.handle(request);
    await atomicWriteJson(path.resolve(responsePath), response);
    return response;
  } finally {
    handler.close();
  }
}

async function runNdjson({ searchRoot, slot }) {
  const handler = await createLightroomSearchRequestHandler({ searchRoot, slot });
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let request;
      let response;
      try {
        request = JSON.parse(line);
        response = await handler.handle(request);
      } catch (error) {
        response = failure(request, error, "invalid-json");
      }
      process.stdout.write(`${JSON.stringify(response)}\n`);
      if (request?.command === "close") break;
    }
  } finally {
    handler.close();
  }
}

async function main(args = process.argv.slice(2)) {
  const searchRoot = path.resolve(optionValue(args, "search-root", defaultLightroomSearchRoot()));
  const slot = optionValue(args, "slot", "active");
  const requestPath = optionValue(args, "request");
  const responsePath = optionValue(args, "response");
  if (requestPath || responsePath) {
    return handleLightroomSearchRequestFile({ requestPath, responsePath, searchRoot, slot });
  }
  return runNdjson({ searchRoot, slot });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Lightroom-Suchhilfe fehlgeschlagen: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export const lightroomSearchHelperInternals = Object.freeze({
  failure,
  main,
  optionValue,
  requestId,
  runNdjson,
  success,
});
