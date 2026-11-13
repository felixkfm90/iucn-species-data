import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { validateSpeciesRecord } from "../shared-project/species-record.mjs";
import { projectSpeciesRecordToExplorer } from "../shared-project/species-view.mjs";
import { speciesPageSourceBody as sourceBody,speciesNormalAssets } from "../shared-project/species-editorial.mjs";
import { normalMediaBinding, normalMediaContentId } from "../shared-project/normal-media.mjs";
import { createLocalNormalMediaReader } from "../shared-project/local-normal-media.mjs";
import { digest,objectJson } from "../shared-project/security.mjs";
import { sanitizeAssetName } from "../species-model.mjs";
import { check, fingerprint, sha256, normalizeActor, slug as checkedSlug, PageAuthoringError } from "./contract.mjs";
import { NORMAL_ASSET_FILES, normalizeAssetMetadata, normalizeSpeciesSnapshot } from "./model.mjs";

const PUBLIC_ROOT = "https://felixkfm90.github.io/iucn-species-data/";
const managedId = /^image-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const metadataOnly = (asset) => Object.fromEntries(["id", "projectId", "sha256", "bytes", "mimeType", "attribution"].map((key) => [key, asset?.[key]]));
const runtimeKeys = ["URLSlug", "Wissenschaftlicher Name", "Deutscher Name", "Englischer Name", "Größe", "Gewicht", "Lebenserwartung",
  "Kingdom", "Phylum", "Subphylum", "Class", "Order", "Family", "Genus", "Species", "Status", "Kategorie", "Trend", "Populationgröße",
  "Generationsdauer", "Assessment ID", "Letztes IUCN Update", "Daten abgerufen"];
const value = (input) => {
  check(input === undefined || input === null || typeof input === "string" || typeof input === "number" && Number.isFinite(input),
    "invalid_runtime_value", "Ein öffentlicher Artgrundwert besitzt kein prüfbares Text-/Zahlenformat.", 409);
  return input === undefined || input === null ? null : String(input);
};
function runtimeValues(record) {
  const fields = { ...record.generated, URLSlug: record.id, "Deutscher Name": record.input.german, "Wissenschaftlicher Name": `${record.input.genus} ${record.input.species}`,
    Genus: record.input.genus, Species: record.input.species };
  for (const [key, label] of Object.entries({ english: "Englischer Name", size: "Größe", weight: "Gewicht", life_expectancy: "Lebenserwartung" })) {
    if (Object.hasOwn(record.input, key)) fields[label] = record.input[key];
  }
  return Object.fromEntries(runtimeKeys.map((key) => [key, value(fields[key])]));
}

/** Main-process authorities. No file discovery, publication, private source DTOs or renderer-selected URLs. */
export function createExplorerPageAuthorities({ repoRoot, fetchImpl = globalThis.fetch, publicBaseUrl = PUBLIC_ROOT,
  publicTimeoutMs = 15000, publicJsonMaxBytes = 8 * 1024 * 1024, imageDecode = validateImageDecode } = {}) {
  check(typeof repoRoot === "string" && path.isAbsolute(repoRoot) && !/^(?:\\\\|\/\/)/.test(repoRoot) && !repoRoot.includes("\0"),
    "unsafe_storage", "Die Artmedien benötigen einen festen lokalen Programmordner.");
  check(publicBaseUrl === PUBLIC_ROOT && typeof fetchImpl === "function" && Number.isSafeInteger(publicTimeoutMs) && publicTimeoutMs > 0 && publicTimeoutMs <= 15000
    && Number.isSafeInteger(publicJsonMaxBytes) && publicJsonMaxBytes > 0 && publicJsonMaxBytes <= 8 * 1024 * 1024,
  "unsafe_public_source", "Die öffentliche FN-Prüfung benötigt ihre feste Adresse und begrenzte Lesegrenzen.");
  const root = path.resolve(repoRoot), operations = new Set(), controllers = new Set(),normalControllers=new Set(); let closed = false, closing;
  const localNormal=createLocalNormalMediaReader({repoRoot:root});
  const ensureOpen = () => check(!closed, "authority_closed", "Die Artseitenprüfung wurde beendet.", 409);
  function run(work) {
    const result = Promise.resolve().then(() => { ensureOpen(); return work(); }); operations.add(result);
    result.then(() => operations.delete(result), () => operations.delete(result)); return result;
  }
  function binding(context) {
    ensureOpen(); const actor = normalizeActor(context?.actor), status = context?.state?.status;
    check(context?.state?.permissions?.canRead === true && typeof status?.baseUrl === "string" && status.baseUrl
      && status.projectId === actor.projectId && status.user?.id === actor.id && status.user.role === actor.role
      && actor.online === (status.connection === "online")
      && context.sourceScope === fingerprint([status.baseUrl, actor.projectId, actor.id]),
    "workspace_changed", "Die Artseitenquelle gehört nicht mehr zu dieser Projektanmeldung.", 409);
    return { actor, baseUrl: status.baseUrl, sourceScope: context.sourceScope };
  }
  async function current(context, expected = binding(context)) {
    ensureOpen(); const status = await context.client.status(); ensureOpen();
    check(status?.baseUrl === expected.baseUrl && status.projectId === expected.actor.projectId && status.user?.id === expected.actor.id
      && status.user.role === expected.actor.role && ["online", "offline"].includes(status.connection),
    "workspace_changed", "Projekt, Person oder Berechtigung wurde während der Artseitenprüfung geändert.", 409);
    return status;
  }
  async function record(context, id) {
    const object = await context.client.getObject("species", checkedSlug(id));
    check(object?.kind === "species" && object.id === id && object.data?.type === "fn-species-record",
      "species_record_required", "Diese Art benötigt ihre vollständige gemeinsame Artquelle.", 409);
    return { object, record: validateSpeciesRecord(object.data, id) };
  }
  function normalAssets(record, projectId) {
    return Object.fromEntries(Object.entries(speciesNormalAssets(record,projectId))
      .map(([role,metadata])=>[role,metadata?normalizeAssetMetadata(metadata,projectId):null]));
  }
  async function publicBytes(relative, { maxBytes, mimeType } = {}) {
    ensureOpen(); const controller = new AbortController(); controllers.add(controller); let reader, response, rejectAbort;
    const aborted = new Promise((_resolve, reject) => { rejectAbort = () => reject(new PageAuthoringError(409, "public_source_unavailable", "Die öffentliche FN-Bereitstellung konnte nicht frisch bestätigt werden.")); });
    controller.signal.addEventListener("abort", rejectAbort, { once: true }); const timer = setTimeout(() => controller.abort(), publicTimeoutMs);
    try {
      const url = new URL(relative, PUBLIC_ROOT).href;
      response = await Promise.race([fetchImpl(url, { signal: controller.signal, redirect: "error", credentials: "omit", cache: "no-store", headers: { Accept: mimeType } }), aborted]);
      check(response?.status === 200 && !response.redirected && (!response.url || response.url === url)
        && response.headers?.get("content-type")?.split(";")[0].trim().toLowerCase() === mimeType,
      "public_source_unavailable", "Die öffentliche FN-Datei ist nicht unverändert erreichbar.", 409);
      const length = response.headers.get("content-length");
      check(length === null || /^\d+$/.test(length) && Number(length) <= maxBytes, "public_source_limit", "Die öffentliche FN-Datei überschreitet ihre Lesegrenze.", 409);
      reader = response.body?.getReader(); check(reader, "public_source_unavailable", "Die öffentliche FN-Datei besitzt keine lesbaren Bytes.", 409);
      let size = 0; const parts = [];
      while (true) {
        const part = await Promise.race([reader.read(), aborted]); if (part.done) break;
        size += part.value.byteLength; check(size <= maxBytes, "public_source_limit", "Die öffentliche FN-Datei überschreitet ihre Lesegrenze.", 409); parts.push(Buffer.from(part.value));
      }
      check(length === null || Number(length) === size, "public_source_unavailable", "Die öffentliche FN-Datei ist unvollständig.", 409);
      return Buffer.concat(parts, size);
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener("abort", rejectAbort); controller.abort(); controllers.delete(controller);
      if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } else await response?.body?.cancel().catch(() => {});
    }
  }
  async function verified(bytes, metadata) {
    check(Buffer.isBuffer(bytes) && bytes.length === metadata.bytes && sha256(bytes) === metadata.sha256,
      "media_changed", "Die Artdatei stimmt nicht mit ihrer geschützten Größe und ihrem Hash überein.", 409);
    if (formats[metadata.mimeType]) {
      try { await imageDecode(bytes, { format: formats[metadata.mimeType], repoRoot: root }); }
      catch { check(false, "media_format_mismatch", "Die gebundene Bilddatei konnte nicht vollständig und sicher geprüft werden.", 409); }
    }
    return bytes;
  }
  async function readiness(record, assets) {
    try {
      if (sanitizeAssetName(record.input.german || `${record.input.genus} ${record.input.species}`) !== record.assets.assetName || !assets.portrait || !assets.map) return false;
      const list = JSON.parse((await publicBytes("speciesData.json", { maxBytes: publicJsonMaxBytes, mimeType: "application/json" })).toString("utf8"));
      if (!Array.isArray(list) || list.length > 10000) return false;
      const matches = list.filter((item) => item?.URLSlug === record.id); if (matches.length !== 1) return false;
      if (fingerprint(Object.fromEntries(runtimeKeys.map((key) => [key, value(matches[0][key])]))) !== fingerprint(runtimeValues(record))) return false;
      for (const role of ["portrait", "map"]) await verified(await publicBytes(`species-assets/${encodeURIComponent(record.assets.assetName)}/${NORMAL_ASSET_FILES[role]}`,
        { maxBytes: Math.min(assets[role].bytes, 20 * 1024 * 1024), mimeType: assets[role].mimeType }), assets[role]);
      return true;
    } catch { return false; }
  }
  function mediaExpectation(context,id,projectId) {
    if(context.mediaAsset===undefined)return null;
    const metadata=normalizeAssetMetadata(context.mediaAsset,projectId);
    check(metadata.id===id,'media_changed','Die konkrete Medienverwendung gehört zu einer anderen Datei.',409);return metadata;
  }
  async function cachedNormal(context,id,expected,{read=false}={}) {
    const wanted=mediaExpectation(context,id,expected.actor.projectId),page=context.pageSpecies;
    if(!wanted||!page)return null;
    const roles=Object.entries(page.normalAssets||{}).filter(([role,asset])=>Object.hasOwn(NORMAL_ASSET_FILES,role)
      &&NORMAL_ASSET_FILES[role]!=='credits.json'&&asset&&fingerprint(normalizeAssetMetadata(asset,expected.actor.projectId))===fingerprint(wanted));
    if(!roles.length)return null;
    check(roles.length===1,'media_binding_ambiguous','Die gespeicherte normale Medienrolle ist nicht eindeutig gebunden.',409);
    const binding={projectId:expected.actor.projectId,speciesId:checkedSlug(page.slug),slot:NORMAL_ASSET_FILES[roles[0][0]],asset:wanted};
    const method=context.client.normalMedia?.[read?'readLocal':'describeLocal'];if(typeof method!=='function')return null;
    let value;const controller=new AbortController();normalControllers.add(controller);
    try { value=await method({contentId:normalMediaContentId(binding),requiredBinding:{baseUrl:expected.baseUrl,projectId:expected.actor.projectId,
      userId:expected.actor.id,role:expected.actor.role}},{signal:controller.signal}); }
    catch(error){if(error.code==='normal_media_not_local')return null;throw error;}
    finally{normalControllers.delete(controller);controller.abort();}
    ensureOpen();await current(context,expected);
    check(value?.metadata?.complete===true&&(read||value.localAvailable===true)&&fingerprint({contentId:value.metadata.contentId,projectId:value.metadata.projectId,
      speciesId:value.metadata.speciesId,slot:value.metadata.slot,asset:normalizeAssetMetadata(value.metadata.asset,expected.actor.projectId)})
      ===fingerprint({contentId:normalMediaContentId(binding),...binding}),
    'media_changed','Die Offline-Artdatei stimmt nicht mit ihrer gespeicherten Verwendung überein.',409);
    if(read)check(Buffer.isBuffer(value.buffer)||value.buffer instanceof Uint8Array,'media_changed','Die Offline-Artdatei besitzt keine bestätigten Bytes.',409);
    return {metadata:wanted,buffer:read?Buffer.from(value.buffer):null};
  }
  async function normalBinding(context, id, wanted=null) {
    const expected = binding(context); await current(context, expected); const found = [];
    let objects;
    if(wanted&&context.pageSpecies) {
      const page=context.pageSpecies,roles=Object.entries(page.normalAssets||{}).filter(([role,metadata])=>Object.hasOwn(NORMAL_ASSET_FILES,role)
        && metadata && fingerprint(normalizeAssetMetadata(metadata,expected.actor.projectId))===fingerprint(wanted));
      if(!roles.length)return null;
      check(roles.length===1,'media_binding_ambiguous','Die konkrete normale Medienrolle ist nicht eindeutig gebunden.',409);
      const source=await record(context,checkedSlug(page.slug)),assets=normalAssets(source.record,expected.actor.projectId),role=roles[0][0];
      check(assets[role]&&fingerprint(assets[role])===fingerprint(wanted),'media_changed','Die normale Artdatei stimmt nicht mehr mit der gespeicherten Verwendung überein.',409);
      await current(context,expected);
      return {metadata:assets[role],assetName:source.record.assets.assetName,filename:NORMAL_ASSET_FILES[role],record:source.record,object:source.object,expected};
    }
    // Compatibility for the old id-only normal-file API; saved page calls above
    // fetch exactly one bound species and never enumerate the project.
    if(wanted)return null;
    objects=await context.client.listObjects();
    for (const object of objects) if (object.kind === "species" && object.data?.type === "fn-species-record") {
      const source = validateSpeciesRecord(object.data, object.id), assets = normalAssets(source, expected.actor.projectId);
      for (const [role, metadata] of Object.entries(assets)) if (metadata?.id === id) {
        normalizeSpeciesSnapshot({ slug: source.id, scientificName: `${source.input.genus} ${source.input.species}`, commonName: source.input.german, assetName: source.assets.assetName,
          taxonomy: [], general: [], status: "", revision: "binding", dataSha256: fingerprint(sourceBody(source)), runtimeReady: false, normalAssets: assets }, expected.actor.projectId, source.id);
        found.push({ metadata, assetName: source.assets.assetName, filename: NORMAL_ASSET_FILES[role],record:source,object });
      }
    }
    check(found.length === 1, "media_binding_ambiguous", "Die normale Artdatei ist nicht eindeutig an eine vorhandene Art gebunden.", 409);
    return { ...found[0], expected };
  }
  async function localCreditsBytes(asset) {
    check(asset.filename==='credits.json','media_binding_ambiguous','Diese lokale Nebenquelle ist nicht an Credits gebunden.',409);
    check(asset.metadata.bytes <= (formats[asset.metadata.mimeType] ? 20 * 1024 * 1024 : 32 * 1024 * 1024),
      "media_size", "Die normale Artdatei überschreitet ihre begrenzte Prüfgröße.", 409);
    const filename = path.join(root, "species-assets", asset.assetName, asset.filename), inspect = async () => {
      let current = path.parse(filename).root;
      for (const part of filename.slice(current.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, part); const stat = await fs.lstat(current);
        check(!stat.isSymbolicLink() && (current === filename ? stat.isFile() && stat.nlink === 1 : stat.isDirectory()), "unsafe_media_path", "Verknüpfte Artdateien werden nicht gelesen.", 409);
      }
      check(await fs.realpath(filename) === filename, "unsafe_media_path", "Die Artdatei liegt nicht im gebundenen Programmordner.", 409);
    };
    await inspect(); const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const before = await handle.stat(); check(before.isFile() && before.nlink === 1 && before.size === asset.metadata.bytes, "media_changed", "Die normale Artdatei wurde verändert.", 409);
      const buffer = Buffer.alloc(before.size); let offset = 0;
      while (offset < buffer.length) { const part = await handle.read(buffer, offset, buffer.length - offset, offset); check(part.bytesRead > 0, "media_changed", "Die Artdatei ist unvollständig.", 409); offset += part.bytesRead; }
      await inspect(); const after = await handle.stat(), linked = await fs.lstat(filename);
      check(after.size === before.size && after.mtimeMs === before.mtimeMs && after.nlink === 1 && linked.dev === after.dev && linked.ino === after.ino,
        "media_changed", "Die Artdatei wurde während der Prüfung verändert.", 409); return buffer;
    } finally { await handle.close(); }
  }
  function pageReadError(error) {
    const codes={unsafe_normal_media_path:'unsafe_media_path',normal_media_changed:'media_changed',normal_media_not_local:'media_not_local',normal_media_read_failed:'media_read_failed'};
    if(codes[error?.code])return new PageAuthoringError(error.status||409,codes[error.code],error.message);
    if(error instanceof PageAuthoringError||error?.name==='ProjectError')return error;
    return new PageAuthoringError(409,'media_read_failed','Die gebundene lokale Artdatei konnte nicht sicher gelesen werden.');
  }
  async function sharedNormalBytes(context,asset) {
    check(asset.object.localPending===false && asset.object.localConflict===false,'media_changed','Die normale Artquelle ist noch nicht exakt gemeinsam bestätigt.',409);
    const expected=normalMediaBinding(asset.record,{projectId:asset.expected.actor.projectId,slot:asset.filename}),controller=new AbortController();normalControllers.add(controller);
    try {
      const result=await context.client.normalMedia.read({speciesId:asset.record.id,slot:asset.filename,expectedRevision:asset.object.revision,
        expectedDataHash:digest(objectJson(asset.object.data)),requiredBinding:{baseUrl:asset.expected.baseUrl,projectId:asset.expected.actor.projectId,
          userId:asset.expected.actor.id,role:asset.expected.actor.role}},{signal:controller.signal});
      ensureOpen();const metadata=result?.metadata;
      check(expected && metadata?.complete===true && fingerprint({contentId:metadata.contentId,projectId:metadata.projectId,speciesId:metadata.speciesId,
        slot:metadata.slot,asset:normalizeAssetMetadata(metadata.asset,asset.expected.actor.projectId)})===fingerprint(expected),
        'media_changed','Die gelesene normale Projektdatei besitzt eine andere Quellen- oder Metadatenbindung.',409);
      check(Buffer.isBuffer(result.buffer)||result.buffer instanceof Uint8Array,'media_changed','Die normale Projektdatei besitzt keine bestätigten Bytes.',409);
      return Buffer.from(result.buffer);
    }finally{normalControllers.delete(controller);controller.abort();}
  }
  async function sourceFor(context,id,expected) {
    const wanted=mediaExpectation(context,id,expected.actor.projectId);
    const normal=wanted?(context.pageSpecies?await normalBinding(context,id,wanted):null):!managedId.test(id)?await normalBinding(context,id):null;
    if(normal){check(!wanted||fingerprint(wanted)===fingerprint(normal.metadata),'media_changed','Die normale Dateibindung passt nicht zur konkreten Verwendung.',409);return {metadata:normal.metadata,normal};}
    check(managedId.test(id),'media_binding_ambiguous','Die Bildverwendung besitzt keine eindeutige normale oder verwaltete Dateibindung.',409);
    const metadata=normalizeAssetMetadata(metadataOnly(await context.client.media.describeImage(id)),expected.actor.projectId);
    check(!wanted||fingerprint(wanted)===fingerprint(metadata),'media_changed','Die verwaltete Bilddatei stimmt nicht mit der gespeicherten Verwendung überein.',409);
    return {metadata,normal:null};
  }
  const mediaFacade = {
    describe: (context, id) => run(async () => {
      const expected = binding(context); await current(context, expected);
      const cached=await cachedNormal(context,id,expected);if(cached)return cached.metadata;
      const {metadata}=await sourceFor(context,id,expected);
      await current(context, expected); return metadata;
    }),
    read: (context, id) => run(async () => {
      const expected = binding(context); await current(context, expected);
      const cached=await cachedNormal(context,id,expected,{read:true});
      if(cached){await verified(cached.buffer,cached.metadata);await current(context,expected);return cached.buffer;}
      const source=await sourceFor(context,id,expected),metadata=source.metadata;let bytes,shared=false;
      if (!source.normal) {
        const image = await context.client.media.readImage(id); bytes = Buffer.from(image.buffer);
        check(fingerprint(normalizeAssetMetadata(metadataOnly(image), expected.actor.projectId)) === fingerprint(metadata), "media_changed", "Die lokale Bildbindung wurde verändert.", 409);
      } else {
        const asset=source.normal;
        try { bytes=asset.filename==='credits.json'?await localCreditsBytes(asset):(await localNormal.read(asset.record,{projectId:expected.actor.projectId,slot:asset.filename})).buffer; }
        catch (error) {
          if(error.code!=='normal_media_not_local'&&error.code!=='ENOENT')throw pageReadError(error);
          check(expected.actor.online, "media_not_local", "Diese Artdatei ist auf diesem Gerät noch nicht bereitgestellt.", 409);
          if(asset.filename!=='credits.json'&&typeof context.client.normalMedia?.read==='function') {
            try{bytes=await sharedNormalBytes(context,asset);shared=true;}
            catch(error){if(error.code!=='normal_media_server_required')throw error;}
          }
          if(!bytes)bytes = await publicBytes(`species-assets/${encodeURIComponent(asset.assetName)}/${asset.filename}`, { maxBytes: Math.min(metadata.bytes, formats[metadata.mimeType] ? 20 * 1024 * 1024 : 32 * 1024 * 1024), mimeType: metadata.mimeType });
        }
      }
      await verified(bytes, metadata);
      if(source.normal) {
        const asset=source.normal,fresh=await normalBinding(context,id,mediaExpectation(context,id,expected.actor.projectId));
        check(fresh&&fingerprint(fresh.metadata)===fingerprint(metadata)&&fresh.assetName===asset.assetName
          &&(!shared||fresh.object.localPending===false&&fresh.object.localConflict===false&&fresh.object.revision===asset.object.revision
            &&digest(objectJson(fresh.object.data))===digest(objectJson(asset.object.data))),
          'media_changed','Die geschützte Artdateibindung wurde inzwischen geändert.',409);
      }
      await current(context, expected); return bytes;
    }),
  };
  return Object.freeze({
    speciesAuthority: { snapshot: (context, id) => run(async () => {
      const expected = binding(context); checkedSlug(id); check(expected.actor.online, "online_required", "Die Artgrundlage muss frisch mit dem gemeinsamen Projekt geprüft werden.", 409);
      const capabilities = await context.client.capabilities(); ensureOpen();
      check(capabilities.projectId === expected.actor.projectId && capabilities.user?.id === expected.actor.id && capabilities.user.role === expected.actor.role,
        "workspace_changed", "Die Artgrundlage gehört zu einer geänderten Projektanmeldung.", 409);
      await context.client.refresh(); const status = await current(context, expected); check(status.connection === "online", "online_required", "Die Artgrundlage ist nicht frisch bestätigt.", 409);
      const source = await record(context, id), view = projectSpeciesRecordToExplorer(source.object), assets = normalAssets(source.record, expected.actor.projectId), hash = fingerprint(sourceBody(source.record));
      const runtimeReady = await readiness(source.record, assets); await current(context, expected);
      check(fingerprint(sourceBody((await record(context, id)).record)) === hash, "species_source_changed", "Die Artgrundlage wurde während der Prüfung geändert.", 409);
      await current(context, expected);
      const general = [["Deutscher Name", view.germanName], ["Englischer Name", view.englishName], ["Wissenschaftlicher Name", view.scientificName],
        ["Größe", view.manual.size], ["Gewicht", view.manual.weight], ["Lebenserwartung", view.manual.lifeExpectancy], ["Assessment ID", view.iucn.assessmentId],
        ["Kategorie", view.iucn.category], ["Trend", view.iucn.trend], ["Populationsgröße", view.iucn.population], ["Generationsdauer", view.iucn.generationLength],
        ["Letztes IUCN Update", view.iucn.lastUpdate], ["Daten abgerufen", view.iucn.fetchedAt]].map(([label, value]) => ({ label, value }));
      const taxonomy = Object.entries({ Kingdom: "kingdom", Phylum: "phylum", Subphylum: "subphylum", Class: "className", Order: "order", Family: "family", Genus: "genus", Species: "species" })
        .map(([rank, key]) => ({ rank, name: view.taxonomy[key] }));
      return normalizeSpeciesSnapshot({ slug: id, scientificName: view.scientificName, commonName: view.germanName, assetName: source.record.assets.assetName,
        taxonomy, general, status: view.iucn.status, revision: `species-${hash}`, dataSha256: hash, runtimeReady, normalAssets: assets }, expected.actor.projectId, id);
    }) }, mediaFacade,
    blockingState: () => ({ known: true, busy: operations.size > 0, closed, activePublicRequests: controllers.size,
      message: operations.size ? "Artgrunddaten oder Bilddateien werden noch geprüft." : "" }),
    close() { if (!closing) { closed = true; for (const controller of [...controllers,...normalControllers]) controller.abort(); closing = Promise.allSettled([...operations]).then(() => {}); } return closing; },
  });
}
