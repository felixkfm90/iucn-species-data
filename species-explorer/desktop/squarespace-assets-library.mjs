import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { validateCmsDispatchBinding } from "../page-authoring/cms-dispatch.mjs";
import { squarespaceAssetsLibraryDom } from "./squarespace-assets-library-dom.mjs";
import { identifySquarespaceLibraryImageSource } from "./squarespace-page-observation.mjs";

export const SQUARESPACE_ASSET_LIBRARY_URL = "https://vanilla-gerbil-jwnp.squarespace.com/config/asset-library";
const inputSource = `(${squarespaceAssetsLibraryDom.toString()})`;
const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const identifier = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const active = new WeakSet(), submittedByDispatch = new WeakMap();
const failure = (message = "Der Upload in die Squarespace-Inhaltsbibliothek konnte nicht eindeutig bestätigt werden.") =>
  Object.assign(new Error(message), { code: "SQUARESPACE_ASSET_UPLOAD_UNCONFIRMED", statusCode: 409 });

function bindAssetLibrary(webContents, signal, readTimeoutMs) {
  if (!webContents || webContents.isDestroyed?.() || webContents.getURL() !== SQUARESPACE_ASSET_LIBRARY_URL || !webContents.mainFrame) return null;
  const top = webContents.mainFrame;
  const current = () => !webContents.isDestroyed?.() && webContents.mainFrame === top && webContents.getURL() === SQUARESPACE_ASSET_LIBRARY_URL;
  const run = payload => top.executeJavaScript(`${inputSource}(${JSON.stringify(payload)})`, true);
  async function read(payload) {
    signal?.throwIfAborted();
    if (!current()) return null;
    let timer;
    try {
      const observed = await Promise.race([run(payload), new Promise(resolve => { timer = setTimeout(() => resolve(null), readTimeoutMs); })]);
      signal?.throwIfAborted();
      return current() ? observed : null;
    } finally { clearTimeout(timer); }
  }
  function assertCurrent() {
    signal?.throwIfAborted();
    if (!current()) throw failure();
  }
  return { read, assertCurrent, async submit(payload) {
    assertCurrent();
    const result = await run(payload);
    assertCurrent();
    return result;
  } };
}

async function readStableFile(doc, fileName) {
  const first = await doc.read({ fileName });
  if (!first || first.fileName !== fileName || typeof first.uploadReady !== "boolean"
      || !Number.isFinite(first.epoch) || first.epoch <= 0 || !isDeepStrictEqual(first, await doc.read({ fileName }))) return null;
  const { epoch, status, uploadReady } = first;
  if (status === "empty" && first.sourceUrl === null) return { epoch, status, fileName, uploadReady, assetId: null, sourceUrl: null };
  const source = status === "match" && identifySquarespaceLibraryImageSource(first.sourceUrl, fileName);
  return source ? { epoch, status, fileName, uploadReady, ...source } : null;
}

export async function inspectSquarespaceAssetLibrary(webContents, fileName, { signal, timeoutMs = 2000 } = {}) {
  signal?.throwIfAborted();
  if (typeof fileName !== "string" || !/^[a-z0-9][a-z0-9_-]{0,150}\.(?:png|jpe?g|webp)$/i.test(fileName)) return null;
  const doc = bindAssetLibrary(webContents, signal, timeoutMs);
  return doc ? readStableFile(doc, fileName) : null;
}

/** One approved usage, one native submission, and a new filename/asset observation in the same library. */
export async function uploadSquarespaceLibraryImage(webContents, { fileName, bytes, image, dispatchBinding, pageId,
  assertWritable, signal, waitMs = 250, timeoutMs = 20_000 } = {}) {
  signal?.throwIfAborted();
  const dispatch = validateCmsDispatchBinding(dispatchBinding);
  const extension = Object.hasOwn(extensions, image?.mimeType) && extensions[image.mimeType];
  const name = typeof fileName === "string" && /^fn-[a-f0-9]{24}-([1-9][0-9]{0,2})\.(png|jpg|webp)$/.exec(fileName);
  if (!name || name[0] !== fileName || extension !== name[2] || !Number.isSafeInteger(image.order) || Number(name[1]) !== image.order + 1
      || typeof image.id !== "string" || !identifier.test(image.id) || typeof image.assetId !== "string" || !identifier.test(image.assetId)
      || typeof pageId !== "string" || !/^[a-f0-9]{24}$/.test(pageId) || typeof assertWritable !== "function"
      || !Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 32 * 1024 * 1024 || bytes.length !== image.bytes
      || createHash("sha256").update(bytes).digest("hex") !== image.sha256) throw failure();
  const doc = bindAssetLibrary(webContents, signal, Math.min(timeoutMs, 2000));
  if (!doc || typeof webContents.insertText !== "function" || typeof webContents.sendInputEvent !== "function" || active.has(webContents)) throw failure();
  const scope = Object.freeze({ pageId, path: dispatch.targetPath, usageId: image.id, assetId: image.assetId });
  const file = { name: fileName, type: image.mimeType, size: bytes.length, base64: bytes.toString("base64") };
  const issued = submittedByDispatch.get(dispatchBinding) || new Set();
  submittedByDispatch.set(dispatchBinding, issued);
  if (issued.has(scope.usageId)) throw failure("Für diese Bildverwendung wurde bereits ein Upload versucht. Bitte prüfe die Bibliothek.");
  const deadline = performance.now() + timeoutMs;
  async function authorize() {
    doc.assertCurrent();
    if (await assertWritable(scope) !== true) throw failure();
    doc.assertCurrent();
  }
  async function waitFor(observe, message) {
    do {
      await authorize();
      const state = await observe();
      doc.assertCurrent();
      if (state) return state;
      if (performance.now() >= deadline) break;
      await delay(waitMs, undefined, { signal });
    } while (performance.now() < deadline);
    throw failure(message);
  }
  active.add(webContents);
  try {
    const { epoch } = await waitFor(async () => {
      const start = await doc.read({ operation: "start", fileName });
      return Number.isFinite(start?.epoch) && start.epoch > 0 ? start : null;
    }, "Die Squarespace-Inhaltsbibliothek ist für den Upload noch nicht eindeutig bereit.");
    const state = async () => {
      const observed = await readStableFile(doc, fileName);
      if (observed && observed.epoch !== epoch) throw failure();
      return observed;
    };
    async function submitSearch(previousQuery) {
      await authorize();
      if (await doc.read({ operation: "focus-search", fileName, epoch, previousQuery }) !== true) throw failure();
      doc.assertCurrent();
      if (previousQuery === "") await webContents.insertText(fileName);
      const ready = () => doc.read({ operation: "search-ready", fileName, epoch });
      await waitFor(ready);
      await authorize();
      if (await ready() !== true) throw failure();
      doc.assertCurrent();
      for (const type of ["keyDown", "char", "keyUp"]) webContents.sendInputEvent({ type, keyCode: "Enter" });
    }
    await submitSearch("");
    const baseline = await waitFor(state, "Der neue Upload-Dateiname konnte in Squarespace nicht eindeutig geprüft werden.");
    if (baseline.status !== "empty" || !baseline.uploadReady) throw failure("Der Upload-Dateiname oder das Dateifeld ist in Squarespace nicht eindeutig frei.");
    if (!isDeepStrictEqual(await state(), baseline)) throw failure();
    await authorize();
    if (issued.has(scope.usageId)) throw failure();
    // The change event may already have started an upload even when its outcome stays unclear.
    issued.add(scope.usageId);
    if (await doc.submit({ operation: "submit-file", fileName, epoch, file }) !== true) throw failure();
    const refreshAfter = performance.now() + Math.min(1500, timeoutMs / 3);
    let refreshed = false;
    const confirmed = await waitFor(async () => {
      const observed = await state();
      if (observed?.status === "match") return observed;
      if (!refreshed && observed?.uploadReady && performance.now() >= refreshAfter) {
        refreshed = true;
        await submitSearch(fileName);
      }
      return null;
    }, "Squarespace hat für die übergebene Datei keinen eindeutigen neuen Bibliothekseintrag angezeigt.");
    await authorize();
    if (!isDeepStrictEqual(await state(), confirmed)) throw failure();
    return { fileName, assetId: confirmed.assetId, sourceUrl: confirmed.sourceUrl };
  } finally { active.delete(webContents); }
}
