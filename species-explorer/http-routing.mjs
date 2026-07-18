import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { isSpeciesAssetFileName } from "./asset-files.mjs";
import { isPathInside } from "./request-security.mjs";
import { sanitizeAssetName } from "./species-model.mjs";

export const MAX_JSON_BODY_BYTES = 16 * 1024;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".webp": "image/webp",
};

const activeFileStreams = new Set();

export function closeActiveFileStreams(predicate = () => true) {
  for (const entry of [...activeFileStreams]) {
    if (!predicate(entry.path)) continue;
    entry.stream.destroy();
    activeFileStreams.delete(entry);
  }
}

export async function readJsonBody(request, { maxBytes = MAX_JSON_BODY_BYTES } = {}) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      const error = new Error("Anfrage ist zu groß");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Ungültige JSON-Anfrage");
    error.statusCode = 400;
    throw error;
  }
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

export function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

export function safePublicPath(pathname, publicDir) {
  let requested;
  try {
    requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  } catch {
    return null;
  }
  const path = normalize(join(publicDir, requested));
  return isPathInside(publicDir, path) ? path : null;
}

export function safeAssetPath(pathname, repoRoot) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "assets") return null;

  let safeName;
  try {
    safeName = decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
  const fileName = parts[2];
  if (sanitizeAssetName(safeName) !== safeName || !isSpeciesAssetFileName(fileName)) return null;
  const assetRoot = join(repoRoot, "species-assets");
  const path = normalize(join(assetRoot, safeName, fileName));
  return isPathInside(assetRoot, path) ? path : null;
}

export function safeGraphicsPath(pathname, repoRoot) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "graphics") return null;

  let directory;
  let fileName;
  try {
    directory = decodeURIComponent(parts[1]);
    fileName = decodeURIComponent(parts[2]);
  } catch {
    return null;
  }
  if (!new Set(["catagory", "trend"]).has(directory)) return null;
  if (!/^[A-Za-z0-9_-]+\.png$/.test(fileName)) return null;
  const graphicsRoot = join(repoRoot, "graphics");
  const path = normalize(join(graphicsRoot, directory, fileName));
  return isPathInside(graphicsRoot, path) ? path : null;
}

export function parseByteRange(rangeHeader, size) {
  const match = String(rangeHeader ?? "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start;
  let end;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (
    !Number.isInteger(start)
    || !Number.isInteger(end)
    || start < 0
    || end < start
    || start >= size
  ) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

export async function sendFile(request, response, path) {
  if (!path || !existsSync(path)) {
    sendText(response, 404, "Nicht gefunden");
    return;
  }

  const details = await stat(path);
  if (!details.isFile()) {
    sendText(response, 404, "Nicht gefunden");
    return;
  }

  const baseHeaders = {
    "Content-Type": MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };
  const rangeHeader = request.headers.range;

  const streamFile = (options) => {
    const stream = createReadStream(path, options);
    const entry = { path, stream };
    activeFileStreams.add(entry);
    const cleanup = () => {
      activeFileStreams.delete(entry);
      stream.destroy();
    };
    response.on("close", cleanup);
    response.on("finish", cleanup);
    stream.on("close", cleanup);
    stream.on("error", cleanup);
    stream.pipe(response);
  };

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, details.size);
    if (!range) {
      response.writeHead(416, {
        ...baseHeaders,
        "Content-Range": `bytes */${details.size}`,
      });
      response.end();
      return;
    }

    const contentLength = range.end - range.start + 1;
    response.writeHead(206, {
      ...baseHeaders,
      "Content-Length": contentLength,
      "Content-Range": `bytes ${range.start}-${range.end}/${details.size}`,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    streamFile(range);
    return;
  }

  response.writeHead(200, {
    ...baseHeaders,
    "Content-Length": details.size,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  streamFile();
}
