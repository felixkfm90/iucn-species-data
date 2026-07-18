import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sendFile, sendText } from "../species-explorer/http-routing.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PREVIEW_PORT = 4188;

export function previewRouteFiles(repoRoot = resolve(scriptDirectory, "..")) {
  const previewRoot = join(repoRoot, "tools", "squarespace-preview");
  return new Map([
    ["/", join(previewRoot, "index.html")],
    ["/index.html", join(previewRoot, "index.html")],
    ["/preview.css", join(previewRoot, "preview.css")],
    ["/preview.js", join(previewRoot, "preview.js")],
    ["/squarespace-custom.css", join(repoRoot, "docs", "squarespace-custom.css")],
    ["/docs/squarespace-custom.css", join(repoRoot, "docs", "squarespace-custom.css")],
    ["/species-taxonomy.js", join(repoRoot, "species-taxonomy.js")],
    ["/speciesData.json", join(repoRoot, "speciesData.json")],
    [
      "/taxonomy-concept.svg",
      join(repoRoot, "docs", "concepts", "taxonomy-pyramid-redesign-concept.svg"),
    ],
  ]);
}

export function resolvePreviewFile(pathname, repoRoot) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  return previewRouteFiles(repoRoot).get(decodedPath) ?? null;
}

export function createSquarespacePreviewServer({ repoRoot } = {}) {
  const resolvedRepoRoot = repoRoot ? resolve(repoRoot) : resolve(scriptDirectory, "..");
  return createServer(async (request, response) => {
    if (!new Set(["GET", "HEAD"]).has(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      sendText(response, 405, "Nur lesende Vorschauzugriffe sind erlaubt");
      return;
    }

    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      await sendFile(request, response, resolvePreviewFile(pathname, resolvedRepoRoot));
    } catch (error) {
      sendText(response, 500, `Vorschaufehler: ${error.message}`);
    }
  });
}

export function parsePreviewPort(args = process.argv.slice(2)) {
  const option = args.find((entry) => entry.startsWith("--port="));
  const value = Number(option?.slice("--port=".length) || DEFAULT_PREVIEW_PORT);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("Der Vorschau-Port muss zwischen 1 und 65535 liegen");
  }
  return value;
}

async function startPreview() {
  const port = parsePreviewPort();
  const server = createSquarespacePreviewServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Die lokale Vorschau läuft bereits unter http://127.0.0.1:${port}`);
    } else {
      console.error(`Die lokale Vorschau konnte nicht gestartet werden: ${error.message}`);
    }
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Lokale Squarespace-Vorschau: http://127.0.0.1:${port}`);
    console.log("Die Vorschau liest ausschließlich Dateien des aktuellen Git-Branches.");
  });
}

const directScriptPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === directScriptPath) {
  await startPreview();
}
