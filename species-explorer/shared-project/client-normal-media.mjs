import { isProxy } from "node:util/types";
import { check, ProjectError } from "./errors.mjs";
import { canonicalJson, objectJson, digest } from "./security.mjs";
import { NORMAL_MEDIA_SLOTS, NORMAL_MEDIA_LIMITS, normalMediaBinding } from "./normal-media.mjs";
import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { validateAudioDecode } from "../../scripts/audio-validation.mjs";
import { inspectJpeg, inspectWebp } from "../../scripts/image-header.mjs";
import { inspectCompleteMp3Buffer } from "../../scripts/audio-format.mjs";
import { validateClientNormalMetadata } from './client-normal-media-store.mjs';
import { SHARED_MEDIA_LIMITS } from './shared-media-budget.mjs';

const KEYS = ["speciesId", "slot", "expectedRevision", "expectedDataHash", "requiredBinding"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const WRITERS = ["admin", "publisher", "contributor"];
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
function exact(value, keys, code = "invalid_normal_media_input") {
  check(value && typeof value === "object" && !isProxy(value) && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype,
    400, code, "Eine vollständige feste Artdateiauswahl ist erforderlich.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(descriptors).length === keys.length && Reflect.ownKeys(descriptors).every(key => typeof key === "string" && keys.includes(key)
    && descriptors[key].enumerable && Object.hasOwn(descriptors[key], "value")), 400, code, "Die Artdateiauswahl enthält unbekannte oder unvollständige Felder.");
}
function prepareBinding(required) {
  exact(required, ["baseUrl", "projectId", "userId", "role"]);
  let origin;
  if (typeof required.baseUrl === "string") try { origin = new URL(required.baseUrl); } catch { /* rejected below */ }
  check(typeof required.baseUrl === "string" && required.baseUrl.length <= 2048 && origin?.origin === required.baseUrl
    && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/"
    && (origin.protocol === "https:" || origin.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname))
    && [required.projectId, required.userId].every(value => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value))
    && [...WRITERS, "reader"].includes(required.role), 400, "invalid_normal_media_input", "Art, Ausgangsfassung oder persönliche Projektbindung ist ungültig.");
  return {...required};
}
function prepare(input, upload) {
  exact(input, [...KEYS, ...(upload ? ["buffer"] : [])]);const required=prepareBinding(input.requiredBinding);
  check(typeof input.speciesId==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.speciesId)&&input.speciesId.length<=120
    &&NORMAL_MEDIA_SLOTS.includes(input.slot)&&typeof input.expectedRevision==='string'&&UUID.test(input.expectedRevision)
    &&typeof input.expectedDataHash==='string'&&/^[a-f0-9]{64}$/.test(input.expectedDataHash),400,'invalid_normal_media_input','Die Artdateiauswahl benötigt ihre exakte Ausgangsfassung.');
  const prepared = { speciesId: input.speciesId, slot: input.slot, expectedRevision: input.expectedRevision,
    expectedDataHash: input.expectedDataHash, requiredBinding: { ...required } };
  if (upload) {
    const maximum = input.slot === "sound.mp3" ? NORMAL_MEDIA_LIMITS.soundBytes : NORMAL_MEDIA_LIMITS.imageBytes;
    check(!isProxy(input.buffer) && Buffer.isBuffer(input.buffer) && input.buffer.length > 0 && input.buffer.length <= maximum,
      413, "normal_media_too_large", "Die Originaldatei fehlt oder überschreitet ihre feste Bereitstellungsgröße.");
    prepared.buffer = Buffer.from(input.buffer);
  }
  return prepared;
}
function signalOption(options) {
  const hasSignal = options && typeof options === "object" && !isProxy(options) && Object.hasOwn(options, "signal");
  exact(options, hasSignal ? ["signal"] : []);
  const signal = options.signal;
  check(signal === undefined || signal && typeof signal.aborted === "boolean" && typeof signal.addEventListener === "function"
    && typeof signal.removeEventListener === "function", 400, "invalid_normal_media_input", "Der Dateiauftrag benötigt einen gültigen Abbruchkontext.");
  return signal;
}

/** No cache or queue of its own. getObject is a synchronous internal cache read. */
export function createClientNormalMedia({ run, capture, ensureOpen, online, authenticated, actionError, getObject,
  imageDecode = validateImageDecode, audioDecode = validateAudioDecode, imageDecodeOptions = {}, audioDecodeOptions = {},store,mediaBudgetReader }) {
  function changed(condition) { check(condition, 409, "normal_media_review_changed", "Artfassung, Projekt, Person oder Berechtigung wurde geändert. Bitte den aktuellen Stand erneut prüfen."); }
  function current(context) {
    if(context.local)return currentLocal(context);
    ensureOpen(); check(!context.signal?.aborted, 409, "normal_media_cancelled", "Der Artdateiauftrag wurde abgebrochen.");
    const active = capture(), expected = context.input.requiredBinding;
    const registered=store?.active?.();changed(!registered||registered.id===active.id&&registered.user.role===active.user.role);
    changed(active?.baseUrl === expected.baseUrl && active.projectId === expected.projectId && active.userId === expected.userId
      && active.user?.id === expected.userId && active.user.role === expected.role
      && (context.readOnly === undefined || Boolean(active.readOnly) === context.readOnly));
    let object;
    try { object = (context.getQueuedObject ?? getObject)("species", context.input.speciesId, { serverOnly: true }); } catch { changed(false); }
    changed(object?.kind === "species" && object.id === context.input.speciesId && object.revision === context.input.expectedRevision
      && object.localPending === false && object.localConflict === false && digest(objectJson(object.data)) === context.input.expectedDataHash);
    changed(!(active.readOnly || active.user.role === "reader") || object.approval === "approved" && object.approvedRevision === object.revision);
    if (context.upload) check(WRITERS.includes(active.user.role) && !active.readOnly, 403, "forbidden", "Für die Dateibereitstellung fehlt die volle Bearbeitungsberechtigung.");
    return { active, object };
  }
  async function admission(context,metadata) {
    check(store?.normalMedia,409,'normal_media_cache_required','Die persönliche Normaldateiablage ist nicht eingerichtet.');
    const additionalBytes=store.normalMedia.admissionBytes(metadata);store.normalMedia.budget();
    if(mediaBudgetReader) {
      const supplied=await checkedAwait(context,mediaBudgetReader({additionalBytes}));
      check(supplied&&Number.isSafeInteger(supplied.totalBytes)&&supplied.totalBytes>=0,409,'normal_media_budget_unavailable','Die persönliche Sicherungsreserve konnte nicht sicher bestimmt werden.');
      check(supplied.totalBytes+additionalBytes<=SHARED_MEDIA_LIMITS.profileBytes,413,'normal_media_quota','Die Normaldatei würde den persönlichen Sicherungsrahmen überschreiten. Vorhandene Daten bleiben erhalten.');
    }
    current(context);
  }
  function currentLocal(context) {
    ensureOpen();check(!context.signal?.aborted,409,'normal_media_cancelled','Der lokale Artdateiauftrag wurde abgebrochen.');
    const active=capture(),required=context.input.requiredBinding,registered=store?.active?.();
    changed(active?.baseUrl===required.baseUrl&&active.projectId===required.projectId&&active.userId===required.userId
      &&active.user?.id===required.userId&&active.user.role===required.role&&(context.readOnly===undefined||Boolean(active.readOnly)===context.readOnly)
      &&(!registered||registered.id===active.id&&registered.user.role===active.user.role));
    check(store?.normalMedia,409,'normal_media_cache_required','Die persönliche Normaldateiablage ist nicht eingerichtet.');
    const metadata=validateClientNormalMetadata(store.normalMedia.describe(active.id,context.input.contentId),{projectId:active.projectId});
    changed(!context.metadataHash||context.metadataHash===digest(canonicalJson(metadata)));
    if(active.readOnly||active.user.role==='reader')store.normalMedia.assertReadable(active.id,context.input.contentId);
    return {active,metadata};
  }
  function local(input,options,read) {
    let prepared,signal,failure;
    try {
      exact(input,['contentId','requiredBinding']);check(typeof input.contentId==='string'&&/^normal-[a-f0-9]{64}$/.test(input.contentId),400,'invalid_normal_media_input','Eine feste Normaldateikennung ist erforderlich.');
      prepared={contentId:input.contentId,requiredBinding:prepareBinding(input.requiredBinding)};signal=signalOption(options);
    }catch(error){failure=error;}
    return run(async()=>{
      if(failure)throw failure;const context={local:true,input:prepared,signal},first=currentLocal(context);context.readOnly=Boolean(first.active.readOnly);
      context.metadataHash=digest(canonicalJson(first.metadata));context.media=first.metadata;
      if(!read)return {metadata:first.metadata,localAvailable:true};
      const cached=store.normalMedia.get(first.active.id,prepared.contentId);check(cached,404,'normal_media_not_local','Diese Artdatei ist noch nicht offline vorhanden.');
      const bytes=Buffer.from(cached.buffer);await checkedAwait(context,decode(bytes,context));const fresh=currentLocal(context);
      const checked=store.normalMedia.get(fresh.active.id,prepared.contentId);changed(checked&&digest(checked.buffer)===fresh.metadata.asset.sha256);
      return {metadata:fresh.metadata,buffer:bytes};
    });
  }
  async function checkedAwait(context, operation) { try { return await operation; } finally { current(context); } }
  async function supported(context) {
    current(context);
    await checkedAwait(context, online());
    const result = await checkedAwait(context, authenticated("capabilities", { signal: context.signal }));
    if (result.status !== 200 && result.status !== 404) throw actionError(result);
    if (result.status === 404) check(false, 409, "normal_media_server_required", "Der Projektdienst benötigt zuerst die normale Artdateibereitstellung.");
    const binding = context.input.requiredBinding;
    changed(result.value?.projectId === binding.projectId && result.value.user?.id === binding.userId && result.value.user.role === binding.role);
    check(result.value.normalMedia !== undefined && result.value.normalMedia !== 0, 409, "normal_media_server_required", "Der Projektdienst benötigt zuerst die normale Artdateibereitstellung.");
    check(result.value.normalMedia === 1, 502, "invalid_normal_media_response", "Die Dienstantwort nennt eine unbekannte Version der normalen Dateibereitstellung.");
  }
  function metadata(value, context, decoded) {
    exact(value, ["contentId", "projectId", "speciesId", "slot", "asset", "width", "height", "complete"], "invalid_normal_media_response");
    exact(value.asset, ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"], "invalid_normal_media_response");
    const expected = context.media;
    check(value.contentId === expected.contentId && value.projectId === expected.projectId && value.speciesId === expected.speciesId
      && value.slot === expected.slot && ["id", "projectId", "sha256", "mimeType", "attribution"].every(key => typeof value.asset[key] === "string")
      && Number.isSafeInteger(value.asset.bytes) && same(value.asset, expected.asset) && typeof value.complete === "boolean",
    502, "invalid_normal_media_response", "Die Dienstantwort gehört nicht zur geprüften unveränderten Originaldatei.");
    const dimensions = !value.complete || value.asset.mimeType === "audio/mpeg" ? value.width === null && value.height === null
      : Number.isSafeInteger(value.width) && value.width > 0 && Number.isSafeInteger(value.height) && value.height > 0
        && value.width * value.height <= NORMAL_MEDIA_LIMITS.imagePixels;
    check(dimensions && (!decoded || !value.complete || value.width === decoded.width && value.height === decoded.height),
      502, "invalid_normal_media_response", "Die bestätigten Abmessungen stimmen nicht mit der Originaldatei überein.");
    return JSON.parse(canonicalJson(value));
  }
  async function status(context, decoded) {
    const result = await checkedAwait(context, authenticated(`normal-media/${context.media.contentId}`, { signal: context.signal }));
    if (result.status === 404) return { available: false, metadata: null };
    if (result.status !== 200) throw actionError(result);
    const checked = metadata(result.value, context, decoded); return { available: checked.complete, metadata: checked };
  }
  function verifyBytes(bytes, context) {
    check(Buffer.isBuffer(bytes) && bytes.length === context.media.asset.bytes && digest(bytes) === context.media.asset.sha256,
      400, "invalid_normal_media", "Die Dateibytes stimmen nicht mit dem gebundenen unveränderten Original überein.");
  }
  async function decode(bytes, context) {
    verifyBytes(bytes, context); const privateBytes = Buffer.from(bytes), mime = context.media.asset.mimeType;
    let decoded;
    try {
      if (mime === "audio/mpeg") {
        inspectCompleteMp3Buffer(privateBytes);
        const result = await checkedAwait(context, audioDecode(privateBytes, { ...audioDecodeOptions, signal: context.signal }));
        check(result?.bytes === bytes.length && result.sha256 === context.media.asset.sha256 && result.mimeType === mime,
          400, "invalid_normal_media", "Die vollständige MP3-Prüfung besitzt keinen passenden Originaldateibeleg.");
        decoded = { width: null, height: null };
      } else {
        const header = (mime === "image/jpeg" ? inspectJpeg : inspectWebp)(privateBytes);
        check(header.valid && header.width * header.height <= NORMAL_MEDIA_LIMITS.imagePixels, 400, "invalid_normal_media", "Die Originalbilddatei besitzt keine gültigen begrenzten Abmessungen.");
        decoded = await checkedAwait(context, imageDecode(privateBytes, { ...imageDecodeOptions, format: header.format, signal: context.signal }));
        check(decoded?.width === header.width && decoded.height === header.height, 400, "invalid_normal_media", "Die Bildprüfung stimmt nicht mit dem Originalbild überein.");
      }
    } catch (error) {
      current(context);
      if (error instanceof ProjectError && ["normal_media_review_changed", "forbidden", "client_closed", "normal_media_cancelled", "media_busy"].includes(error.code)) throw error;
      check(false, 400, error.code === "unsupported_audio_tag" ? error.code : "invalid_normal_media", "Die Originaldatei konnte nicht vollständig geprüft werden; vorhandene Daten bleiben erhalten.");
    }
    verifyBytes(privateBytes, context); verifyBytes(bytes, context); return decoded;
  }
  function invoke(input, options, upload, operation, getQueuedObject) {
    let prepared, signal, failure;
    try { prepared = prepare(input, upload); signal = signalOption(options); } catch (error) { failure = error; }
    const execute = async () => {
      if (failure) throw failure;
      const context = { input: prepared, signal, upload, getQueuedObject }, first = current(context);
      context.readOnly = Boolean(first.active.readOnly);
      context.media = normalMediaBinding(first.object.data, { projectId: prepared.requiredBinding.projectId, slot: prepared.slot });
      if (!context.media) {
        if (operation === "status") return { available: false, metadata: null };
        check(false, 404, "normal_media_missing", "Für diese Art ist keine entsprechende Originaldatei gebunden.");
      }
      if (upload) verifyBytes(prepared.buffer, context);
      await checkedAwait(context, supported(context));
      const observed = await checkedAwait(context, status(context));
      if (operation === "status") return observed;
      if (!upload) {
        check(observed.metadata, 404, "normal_media_missing", "Diese Artdatei wurde auf dem Projektdienst noch nicht bereitgestellt.");
        check(observed.available, 409, "normal_media_incomplete", "Die Artdatei ist auf dem Projektdienst noch nicht vollständig vorhanden.");
        if(operation==='download')await admission(context,validateClientNormalMetadata(observed.metadata));
        const result = await checkedAwait(context, authenticated(`normal-media/${context.media.contentId}/content`, { responseType: "buffer", signal,
          maxResponseBytes: prepared.slot === "sound.mp3" ? NORMAL_MEDIA_LIMITS.soundBytes : NORMAL_MEDIA_LIMITS.imageBytes }));
        if (result.status !== 200) throw actionError(result);
        const length = result.headers?.get("content-length");
        check(result.headers?.get("content-type")?.split(";")[0].trim().toLowerCase() === context.media.asset.mimeType
          && result.headers?.get("x-content-sha256") === context.media.asset.sha256
          && (length === null || length === undefined || /^(?:0|[1-9][0-9]*)$/.test(length) && Number(length) === context.media.asset.bytes),
        502, "invalid_normal_media_response", "Die Dateiantwort besitzt keinen passenden Format-, Hash- und Größenbeleg.");
        verifyBytes(result.value, context); const bytes = Buffer.from(result.value);
        const decoded = await checkedAwait(context, decode(bytes, context)); await checkedAwait(context, supported(context));
        const confirmed=metadata(observed.metadata, context, decoded);
        if(operation==='download') {
          await admission(context,confirmed);const active=current(context).active;
          const saved=store.normalMedia.save(active.id,confirmed,bytes,{sourceRevision:prepared.expectedRevision,sourceDataHash:prepared.expectedDataHash},()=>current(context));
          return {metadata:saved,localAvailable:true};
        }
        return { metadata:confirmed, buffer: bytes };
      }
      const decoded = await checkedAwait(context, decode(prepared.buffer, context)); await checkedAwait(context, supported(context));
      let attemptedPut = false;
      if (!observed.available) {
        const expected = prepared.requiredBinding;
        const declared = await checkedAwait(context, authenticated("normal-media", { method: "POST", signal, data: { speciesId: prepared.speciesId, slot: prepared.slot,
          expectedRevision: prepared.expectedRevision, asset: { ...context.media.asset },
          expectedBinding: { projectId: expected.projectId, userId: expected.userId, role: expected.role } } }));
        if (![200, 201].includes(declared.status)) throw actionError(declared);
        const claim = metadata(declared.value, context, decoded);
        if (!claim.complete) {
          try {
            attemptedPut = true;
            const result = await checkedAwait(context, authenticated(`normal-media/${context.media.contentId}/content`, { method: "PUT", buffer: prepared.buffer, signal,
              headers: { "Content-Type": context.media.asset.mimeType, "X-Shared-Project-Id": expected.projectId,
                "X-Shared-User-Id": expected.userId, "X-Shared-Role": expected.role } }));
            if (![200, 201].includes(result.status)) throw actionError(result);
            check(metadata(result.value, context, decoded).complete, 502, "invalid_normal_media_response", "Die vollständige Dateibereitstellung wurde nicht bestätigt.");
          } catch (error) {
            current(context);
            if (error instanceof ProjectError && (error.status < 500 && !["invalid_normal_media_response", "offline"].includes(error.code))) throw error;
            check(false, 409, "normal_media_uncertain", "Die Dateibereitstellung wurde nicht eindeutig bestätigt. Bitte den Status mit einem neuen Auftrag prüfen; es wird nicht automatisch wiederholt.");
          }
        }
      }
      let confirmed;
      try { confirmed = await checkedAwait(context, status(context, decoded)); }
      catch (error) {
        current(context);
        if (attemptedPut && (!(error instanceof ProjectError) || error.status >= 500)) {
          check(false, 409, "normal_media_uncertain", "Die abschließende Dateibestätigung fehlt. Bitte den Status mit einem neuen Auftrag prüfen; es wird nicht automatisch wiederholt.");
        }
        throw error;
      }
      check(confirmed.available, 409, "normal_media_uncertain", "Der abschließende Dateistatus wurde nicht vollständig bestätigt. Bitte später ausdrücklich erneut prüfen.");
      return confirmed;
    };
    return getQueuedObject ? execute() : run(execute);
  }
  return Object.freeze({ status: (input, options = {}) => invoke(input, options, false, "status"),
    read: (input, options = {}) => invoke(input, options, false, "read"), upload: (input, options = {}) => invoke(input, options, true, "upload"),
    uploadQueued: (input, getQueuedObject) => invoke(input, {}, true, "upload", getQueuedObject),
    download:(input,options={})=>invoke(input,options,false,'download'),describeLocal:(input,options={})=>local(input,options,false),readLocal:(input,options={})=>local(input,options,true) });
}
