import { check } from "./errors.mjs";
import { NORMAL_MEDIA_LIMITS, NORMAL_MEDIA_MIMES } from "./normal-media.mjs";
import { readBoundedRequestBody } from "./image-media-http.mjs";

/** One unchanged normal file, bounded by its already authorized declaration. */
export async function readNormalMediaBody(request, metadata, { timeoutMs = 120000 } = {}) {
  const { asset, slot } = metadata;
  const maximum = slot === "sound.mp3" ? NORMAL_MEDIA_LIMITS.soundBytes : NORMAL_MEDIA_LIMITS.imageBytes;
  check(Object.hasOwn(NORMAL_MEDIA_MIMES, slot) && asset?.mimeType === NORMAL_MEDIA_MIMES[slot]
    && Number.isSafeInteger(asset.bytes) && asset.bytes > 0 && asset.bytes <= maximum,
  409, "invalid_normal_media", "Die Artdatei besitzt keinen gültigen begrenzten Übertragungsbeleg.");
  check(request.headers["content-type"] === asset.mimeType && request.headers["content-encoding"] === undefined,
    415, "invalid_normal_media", "Der Dateityp passt nicht zur geprüften Artdatei oder die Anfrage ist zusätzlich komprimiert.");
  const declared = request.headers["content-length"], transfer = request.headers["transfer-encoding"];
  check(transfer === undefined || transfer === "chunked", 400, "invalid_normal_media", "Unbekannte Dateiübertragungsform.");
  check(declared === undefined || /^\d+$/.test(declared) && Number(declared) === asset.bytes && Number(declared) <= maximum,
    413, "normal_media_too_large", "Die angekündigte Dateigröße stimmt nicht mit der geprüften Artdatei überein.");
  const bytes = await readBoundedRequestBody(request, { maxBytes: asset.bytes, timeoutMs,
    timeoutCode: "normal_media_timeout", tooLargeCode: "normal_media_too_large", abortedCode: "normal_media_aborted" });
  check(bytes.length === asset.bytes, 400, "normal_media_aborted", "Die Artdatei wurde nicht vollständig übertragen.");
  return bytes;
}

export function respondNormalMedia(response, { bytes, metadata }, cors = {}) {
  response.writeHead(200, { "Content-Type": metadata.asset.mimeType, "Content-Length": bytes.length,
    "X-Content-SHA256": metadata.asset.sha256, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": `inline; filename="${metadata.slot}"`, ...cors });
  response.end(bytes);
}
