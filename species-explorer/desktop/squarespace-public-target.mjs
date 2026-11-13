import { cmsNeutralDraftPath, cmsTargetPath, validateCmsDispatchBinding } from "../page-authoring/cms-dispatch.mjs";
import { observeWebsitePublicHtmlIdentity } from "../website-alt-parser.mjs";

const FN_ORIGIN = "https://www.fnwildlifetravel.de";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const PUBLIC_TIMEOUT_MS = 6000;
const failure = () => Object.assign(new Error("Zielpfad und Elternseite konnten öffentlich nicht eindeutig geprüft werden."),
  { code: "SQUARESPACE_PUBLIC_TARGET_UNCONFIRMED", statusCode: 409 });

async function readPublicHtml(url, status, { fetchImpl, signal, aborted }) {
  let response, reader;
  try {
    response = await Promise.race([fetchImpl(url, { method: "GET", signal, redirect: "manual", credentials: "omit",
      cache: "no-store", headers: { Accept: "text/html" } }), aborted]);
    const header = name => response?.headers?.get(name);
    if (response?.status !== status || response.url !== url || response.redirected !== false
        || response.type === "opaqueredirect" || header("location") !== null || header("www-authenticate") !== null
        || header("proxy-authenticate") !== null || header("content-type")?.split(";")[0].trim().toLowerCase() !== "text/html") throw failure();
    const length = header("content-length"), encoding = header("content-encoding");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_HTML_BYTES || Number(length) === 0)) throw failure();
    reader = response.body?.getReader();
    if (!reader) throw failure();
    const chunks = [];
    let size = 0;
    while (true) {
      const part = await Promise.race([reader.read(), aborted]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_HTML_BYTES) throw failure();
      chunks.push(Buffer.from(part.value));
    }
    // Fetch decompresses encoded HTTP bodies before exposing the byte stream.
    if (!size || length !== null && (encoding === null || encoding.toLowerCase() === "identity") && Number(length) !== size) throw failure();
    return observeWebsitePublicHtmlIdentity(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)));
  } finally {
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    } else void response?.body?.cancel().catch(() => {});
  }
}

/** A public 404 can describe an unpublished page as well as an unused path. */
export async function observeSquarespacePublicTarget(value, options) {
  const path = cmsTargetPath(value), parentPath = path.slice(0, path.lastIndexOf("/"));
  await observePublicVacancy(path, parentPath, options);
  return { path, parentPath, publicTarget: "unavailable", parentPublic: true };
}

export async function observeSquarespacePublicNeutralDraft(binding, options) {
  const dispatch = validateCmsDispatchBinding(binding);
  const path = cmsNeutralDraftPath(dispatch), controlPath = dispatch.targetPath.slice(0, dispatch.targetPath.lastIndexOf("/"));
  await observePublicVacancy(path, controlPath, options);
  return { path };
}

async function observePublicVacancy(path, controlPath, { signal, fetchImpl = globalThis.fetch } = {}) {
  signal?.throwIfAborted();
  if (typeof fetchImpl !== "function") throw failure();
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(failure()), PUBLIC_TIMEOUT_MS);
  let rejectAbort;
  const aborted = new Promise((_resolve, reject) => { rejectAbort = () => reject(controller.signal.reason); });
  void aborted.catch(() => {});
  controller.signal.addEventListener("abort", rejectAbort, { once: true });
  try {
    const options = { fetchImpl, signal: controller.signal, aborted };
    const [target, control] = await Promise.all([
      readPublicHtml(FN_ORIGIN + path, 404, options), readPublicHtml(FN_ORIGIN + controlPath, 200, options),
    ]);
    signal?.throwIfAborted();
    if (target.title !== "FN Wildlife & Travel" || target.collectionId !== null || target.canonicalUrl !== null
        || !control.collectionId || control.canonicalUrl !== FN_ORIGIN + controlPath) throw failure();
  } catch {
    signal?.throwIfAborted();
    throw failure();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
    controller.abort();
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
