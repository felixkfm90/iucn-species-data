import { check, ProjectError } from "./errors.mjs";
import { IMAGE_MEDIA_MAX_BYTES, validateImageMediaBinding } from "./image-media.mjs";

export function imageMediaHeaderBinding(request) {
  return validateImageMediaBinding({ projectId: request.headers["x-shared-project-id"], userId: request.headers["x-shared-user-id"], role: request.headers["x-shared-role"] });
}
export function readBoundedRequestBody(request, { maxBytes, timeoutMs, timeoutCode = "request_timeout", tooLargeCode = "body_too_large", abortedCode = "image_media_aborted" }) {
  return new Promise((resolve, reject) => {
    let received = 0, settled = false; const chunks = [];
    const finish = (error) => {
      if (settled) return; settled = true; clearTimeout(timer);
      request.off("data", data); request.off("end", end); request.off("aborted", aborted); request.off("error", aborted);
      if (error) { request.pause(); reject(error); } else resolve(Buffer.concat(chunks, received));
    };
    const data = (chunk) => {
      received += chunk.length;
      if (received > maxBytes) finish(new ProjectError(413, tooLargeCode, "Die Übertragung überschreitet die erlaubte Größe."));
      else chunks.push(chunk);
    };
    const end = () => finish(request.complete && !request.aborted ? null : new ProjectError(400, abortedCode, "Die Übertragung wurde nicht vollständig abgeschlossen."));
    const aborted = () => finish(new ProjectError(400, abortedCode, "Die Übertragung wurde unterbrochen."));
    const timer = setTimeout(() => finish(new ProjectError(408, timeoutCode, "Die erlaubte Gesamtzeit für diese Übertragung ist abgelaufen.")), timeoutMs);
    request.on("data", data); request.once("end", end); request.once("aborted", aborted); request.once("error", aborted);
  });
}
export async function readImageMediaBody(request, { bytes, mimeType }, { timeoutMs = 120000 } = {}) {
  check(request.headers["content-type"] === mimeType, 415, "invalid_image_media", "Der Bildmedientyp passt nicht zur geprüften Absicht.");
  const declared = request.headers["content-length"], transfer = request.headers["transfer-encoding"];
  check(transfer === undefined || transfer === "chunked", 400, "invalid_image_media", "Unbekannte Bildübertragungsform.");
  check(declared === undefined || /^\d+$/.test(declared) && Number(declared) === bytes && Number(declared) <= IMAGE_MEDIA_MAX_BYTES,
    413, "image_media_too_large", "Die deklarierte Bildgröße stimmt nicht mit der begrenzten Bildabsicht überein.");
  check(request.headers["content-encoding"] === undefined, 415, "invalid_image_media", "Komprimierte Bildanfragen sind nicht zugelassen.");
  const body = await readBoundedRequestBody(request, { maxBytes: Math.min(bytes, IMAGE_MEDIA_MAX_BYTES), timeoutMs,
    timeoutCode: "image_media_timeout", tooLargeCode: "image_media_too_large" });
  check(body.length === bytes, 400, "image_media_aborted", "Die Bildübertragung wurde nicht vollständig abgeschlossen.");
  return body;
}
export function respondImageMedia(response, { bytes, metadata }, cors = {}) {
  response.writeHead(200, { "Content-Type": metadata.mimeType, "Content-Length": bytes.length, "X-Content-SHA256": metadata.sha256,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": `inline; filename="${metadata.id}"`, ...cors });
  response.end(bytes);
}
