import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fields, identifier, digest, fingerprint, clone, sha256, canonical } from "../page-authoring/contract.mjs";
import { hasContent, emptySectionHash, normalizeAssetMetadata } from "../page-authoring/model.mjs";
import { validateStoredDocument } from "../page-authoring/shared.mjs";
import { validateSpeciesRecord } from "../shared-project/species-record.mjs";
import { imageDimensions, bindTextInput } from "./content.mjs";
import { languageText, LANGUAGE_LIMITS } from "./language.mjs";

const WRITERS = new Set(["admin", "publisher", "contributor"]);
const COMMON = ["type", "sourceScope", "draftId", "expectedRevision"];
const COMMON_BINDING = ["type", "kind", "sourceScope", "origin", "projectId", "userId", "role", "authorizationHash",
  "documentId", "revision", "snapshotHash", "targetHash", "inputProof"];
const IMAGE_BINDING = ["imageId", "assetId", "sourceSha256", "imageSha256", "metadataHash"];
const TEXT_BINDING = ["sectionId", "sourcesRevision", "sourceCatalogRevision", "sourceIds", "selectedSourcesHash", "draftSha256"];
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const PAGE_AI_LIMITS = Object.freeze({ imageBytes: 20 * 1024 * 1024, imagePixels: 40_000_000,
  preparedBytes: 8 * 1024 * 1024, preparedPixels: 2_000_000, preparedEdge: 2048, sourceCount: 20, textCharacters: 8000 });

function fail(message, code = "page_ai_binding_changed", statusCode = 409) { throw Object.assign(new Error(message), { code, statusCode }); }
function check(value, message, code, status) { if (!value) fail(message, code, status); }
function input(value, extras) {
  fields(value, [...COMMON, ...extras]);
  check(value.type === "page-authoring", "Die lokale Hilfe benötigt einen ausdrücklich gebundenen Artseitenauftrag.", "page_ai_invalid_input", 400);
  digest(value.sourceScope); identifier(value.draftId); digest(value.expectedRevision); return clone(value);
}
function abort() { return Object.assign(new Error("Die lokale Artseitenvorbereitung wurde abgebrochen."), { name: "AbortError", code: "page_ai_cancelled", statusCode: 409 }); }
function blocksText(blocks) {
  return blocks.map((block) => ["bullet-list", "numbered-list"].includes(block.type) ? block.items.join("\n") : block.text).join("\n\n");
}
function metadata(value, projectId) {
  return normalizeAssetMetadata(Object.fromEntries(["id", "projectId", "sha256", "bytes", "mimeType", "attribution"].map((key) => [key, value?.[key]])), projectId);
}
function inspectImage(bytes, mimeType, prepared = false) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= (prepared ? PAGE_AI_LIMITS.preparedBytes : PAGE_AI_LIMITS.imageBytes)
    && IMAGE_TYPES.has(mimeType), "Die gebundene Bilddatei fehlt oder überschreitet die lokale Prüfgröße.", "page_ai_image_limit");
  const size = imageDimensions(bytes, mimeType);
  check(Number.isSafeInteger(size.width) && Number.isSafeInteger(size.height) && size.width > 0 && size.height > 0
    && size.width * size.height <= (prepared ? PAGE_AI_LIMITS.preparedPixels : PAGE_AI_LIMITS.imagePixels)
    && (!prepared || size.width <= PAGE_AI_LIMITS.preparedEdge && size.height <= PAGE_AI_LIMITS.preparedEdge),
  "Die gebundene Bilddatei besitzt keine zulässigen Abmessungen.", "page_ai_image_limit");
}

/** Node-only bounded input adapter. Owns no model, jobs, files, network or persistent storage. */
export function createPageAuthoringInputs({ readSnapshot, readImage, normalizer, ownNormalizer = false } = {}) {
  if (typeof readSnapshot !== "function" || typeof readImage !== "function" || typeof normalizer?.normalize !== "function"
    || typeof ownNormalizer !== "boolean" || ownNormalizer && typeof normalizer.close !== "function") {
    throw new TypeError("Die Artseitenhilfe benötigt ihre tatsächlichen Node-Quellen und den vorhandenen Bildnormalisierer.");
  }
  const operations = new Set(), signingKey = randomBytes(32); let closed = false, closing;
  function seal(value) { return { ...value, inputProof: createHmac("sha256", signingKey).update(canonical(value)).digest("hex") }; }
  function issued(value) {
    if (!/^[a-f0-9]{64}$/.test(value.inputProof || "")) return false;
    const { inputProof, ...body } = value;
    return timingSafeEqual(Buffer.from(inputProof, "hex"), Buffer.from(seal(body).inputProof, "hex"));
  }
  function guard(signal) { if (closed || signal?.aborted) throw abort(); }
  function run(options, operation) {
    if (closed) return Promise.reject(Object.assign(new Error("Die lokale Artseitenhilfe ist geschlossen."), { code: "page_ai_closed", statusCode: 409 }));
    const controller = new AbortController(), signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    const entry = { controller, promise: null };
    const promise = Promise.resolve().then(() => { guard(signal); return operation(signal); }); entry.promise = promise; operations.add(entry);
    void promise.finally(() => operations.delete(entry)).catch(() => {}); return promise;
  }
  async function snapshot(request, signal) {
    guard(signal); const raw = await readSnapshot({ sourceScope: request.sourceScope, draftId: request.draftId }, { signal }); guard(signal);
    const value = clone(raw);
    fields(value, ["sourceScope", "origin", "projectId", "user", "permissions", "connection", "readOnlySession", "draft", "speciesRecord"]);
    const { user, permissions, draft } = value;
    let origin; try { origin = new URL(value.origin); } catch { /* checked below */ }
    check(origin && (origin.protocol === "https:" || origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
      && !origin.username && !origin.password && !origin.search && !origin.hash,
    "Die Artseitenquelle besitzt keine eindeutige Projektadresse.");
    identifier(value.projectId); identifier(user?.id);
    check(WRITERS.has(user?.role) && permissions?.canRead === true && permissions.canEdit === true && value.readOnlySession !== true
      && ["online", "offline"].includes(value.connection), "Die lokale Artseitenhilfe benötigt wirksame persönliche Redaktionsrechte.", "forbidden", 403);
    check(value.sourceScope === request.sourceScope && fingerprint([value.origin, value.projectId, user.id]) === value.sourceScope,
      "Projekt oder Person wurde seit der Auswahl geändert.");
    check(draft?.id === request.draftId && draft.projectId === value.projectId && draft.revision === request.expectedRevision && draft.current !== false,
      "Die Artseitenfassung wurde seit der Auswahl geändert.");
    digest(draft.revision); validateStoredDocument(draft.document);
    const record = validateSpeciesRecord(value.speciesRecord, draft.document.slug);
    const authorizationHash = fingerprint({ origin: value.origin, projectId: value.projectId, userId: user.id, role: user.role,
      userVersion: user.version ?? null, permissions, connection: value.connection, readOnlySession: value.readOnlySession === true });
    return { ...value, speciesRecord: record, authorizationHash,
      snapshotHash: fingerprint({ authorizationHash, draft, speciesRecord: record }) };
  }
  async function current(previous, request, signal) {
    guard(signal); const next = await snapshot(request, signal); guard(signal);
    check(next.snapshotHash === previous.snapshotHash, "Artseite, Quellen oder persönliche Berechtigung wurden während der Vorbereitung geändert."); return next;
  }
  function binding(state, kind, targetHash) {
    return { type: "page-authoring", kind, sourceScope: state.sourceScope, origin: state.origin, projectId: state.projectId,
      userId: state.user.id, role: state.user.role, authorizationHash: state.authorizationHash, documentId: state.draft.id,
      revision: state.draft.revision, snapshotHash: state.snapshotHash, targetHash };
  }
  function imageTarget(state, id) {
    identifier(id); const image = state.draft.document.images.find((entry) => entry.id === id);
    check(image && !image.decorative, "Das ausgewählte Bild ist nicht mehr vorhanden oder bewusst dekorativ.", "page_ai_image_unavailable");
    return { image, targetHash: fingerprint(image), expected: metadata(image.asset, state.projectId) };
  }
  async function bytesFor(state, request, target, signal) {
    guard(signal); const raw = await readImage({ sourceScope: request.sourceScope, draftId: request.draftId, expectedRevision: request.expectedRevision,
      imageId: target.image.id, assetId: target.image.assetId }, { signal }); guard(signal);
    const actual = metadata(raw?.metadata, state.projectId);
    check(fingerprint(actual) === fingerprint(target.expected), "Die Bilddatei passt nicht mehr zur gespeicherten Bildposition.");
    check(Buffer.isBuffer(raw?.buffer) || raw?.buffer instanceof Uint8Array, "Das Bild muss zuerst ausdrücklich auf dieses Gerät geladen werden.", "page_ai_local_image_required");
    const bytes = Buffer.from(raw.buffer);
    check(bytes.length === actual.bytes && sha256(bytes) === actual.sha256, "Die Bildbytes stimmen nicht mit dem gebundenen Bild überein.");
    inspectImage(bytes, actual.mimeType); return bytes;
  }
  function sectionTarget(state, id) {
    identifier(id); const section = state.draft.document.sections.find((entry) => entry.id === id);
    check(section?.kind === "editorial", "Nur vorhandene redaktionelle Fachabschnitte können eine lokale Texthilfe erhalten.", "page_ai_invalid_target", 400);
    const confirmation = state.draft.document.emptyConfirmations[section.id];
    const intentionallyEmpty = Boolean(confirmation && confirmation.sectionHash === emptySectionHash(section));
    return { section, text: blocksText(section.blocks), intentionallyEmpty, targetHash: fingerprint({ section, confirmation: confirmation || null }) };
  }
  function languageContext(state, request) {
    const target = request.sectionId === "introduction"
      ? { section: { id: "introduction", title: "Einleitung" }, text: blocksText(state.draft.document.introduction), intentionallyEmpty: false,
        targetHash: fingerprint({ id: "introduction", blocks: state.draft.document.introduction }) }
      : sectionTarget(state, request.sectionId);
    languageText(target.text, LANGUAGE_LIMITS.pageText);
    return { draft: target.text, target: { sectionId: target.section.id, title: target.section.title, intentionallyEmpty: target.intentionallyEmpty },
      binding: seal({ ...binding(state, "review-language", target.targetHash), sectionId: target.section.id, draftSha256: sha256(Buffer.from(target.text)) }) };
  }
  function sourceCatalog(state, target) {
    const sources = [];
    function add(kind, sectionId, title, text, proof) {
      if (!text.trim()) return;
      const provenance = { kind, speciesId: state.draft.document.slug, sectionId, ...(kind === "draft-editorial" ? { draftId: state.draft.id } : {}) };
      const id = `source-${fingerprint(provenance)}`, revision = fingerprint({ provenance, title, text, proof });
      sources.push({ id, title, revision, text, characters: text.length, provenance });
    }
    for (const section of state.speciesRecord.editorial.sections) {
      if (section.id !== state.speciesRecord.editorial.generalSectionId && !section.intentionallyEmpty)
        add("species-editorial", section.id, section.title, section.text, section);
    }
    for (const section of state.draft.document.sections) {
      if (section.kind === "editorial" && section.id !== target.section.id && hasContent(section.blocks))
        add("draft-editorial", section.id, section.title, blocksText(section.blocks), section);
    }
    check(new Set(sources.map((source) => source.id)).size === sources.length, "Die bereitgestellten Textgrundlagen sind nicht eindeutig.");
    return { sources, sourcesRevision: fingerprint({ type: "page-authoring", snapshotHash: state.snapshotHash, sectionId: target.section.id, sources }) };
  }
  function textRequest(value) {
    const request = input(value, ["sectionId", "sourceIds", "expectedSourcesRevision"]); identifier(request.sectionId); digest(request.expectedSourcesRevision);
    check(Array.isArray(request.sourceIds) && request.sourceIds.length <= PAGE_AI_LIMITS.sourceCount
      && request.sourceIds.every((id) => typeof id === "string" && /^source-[a-f0-9]{64}$/.test(id))
      && new Set(request.sourceIds).size === request.sourceIds.length, "Bitte höchstens 20 vorhandene Textgrundlagen ausdrücklich auswählen.", "page_ai_invalid_sources", 400);
    return request;
  }
  function selectedContext(state, request, kind) {
    const target = sectionTarget(state, request.sectionId), catalog = sourceCatalog(state, target);
    check(catalog.sourcesRevision === request.expectedSourcesRevision, "Die auswählbaren Textgrundlagen wurden seit der Anzeige geändert.");
    const selected = request.sourceIds.map((id) => {
      const source = catalog.sources.find((entry) => entry.id === id);
      check(source, "Eine ausgewählte Textgrundlage ist nicht mehr vorhanden.", "page_ai_invalid_sources"); return source;
    });
    if (kind === "source-text" && !target.intentionallyEmpty) {
      check(target.section.requested === true, "Dieser Abschnitt ist nicht zur Ergänzung vorgesehen.", "page_ai_not_requested");
      check(!hasContent(target.section.blocks), "Vorhandene Fachtexte werden durch einen neuen Vorschlag nicht automatisch ersetzt.", "page_ai_target_not_empty");
    }
    const draft = kind === "review-text" ? target.text : "";
    check(selected.reduce((sum, source) => sum + source.text.length, draft.length) <= PAGE_AI_LIMITS.textCharacters,
      "Entwurf und ausgewählte Quellen überschreiten zusammen 8.000 Zeichen. Bitte einen kleineren Abschnitt oder weniger Quellen wählen.", "page_ai_source_limit");
    const content = bindTextInput({ binding: { documentId: state.draft.id, revision: state.draft.revision },
      target: { sectionId: target.section.id, title: target.section.title, intentionallyEmpty: target.intentionallyEmpty },
      sources: target.intentionallyEmpty ? [] : selected.map(({ id, title, text, revision }) => ({ id, title, text, revision })), draft }, kind);
    const resultBinding = seal({ ...binding(state, kind, target.targetHash), ...content.binding, sourceCatalogRevision: catalog.sourcesRevision,
      sourceIds: [...request.sourceIds], selectedSourcesHash: fingerprint(content.sources) });
    return { ...content, binding: resultBinding };
  }
  const api = {
    async loadImage(value, options = {}) {
      const request = input(value, ["imageId"]); identifier(request.imageId);
      return run(options, async (signal) => {
        const state = await snapshot(request, signal), target = imageTarget(state, request.imageId);
        await current(state, request, signal); const bytes = await bytesFor(state, request, target, signal); await current(state, request, signal);
        const prepared = await normalizer.normalize(bytes, { signal }); guard(signal);
        check(prepared?.mimeType === "image/jpeg" && Buffer.isBuffer(prepared.bytes), "Die lokale Bildnormalisierung hat keine geprüfte JPEG-Vorschau geliefert.", "page_ai_invalid_image");
        const preparedBytes = Buffer.from(prepared.bytes); inspectImage(preparedBytes, prepared.mimeType, true); await current(state, request, signal);
        return { bytes: preparedBytes, mimeType: prepared.mimeType, sha256: sha256(preparedBytes), sourceSha256: target.expected.sha256,
          context: { pageType: "species", title: state.draft.document.title, commonName: state.draft.document.species.commonName, coupledCaption: false },
          binding: seal({ ...binding(state, "alt-text", target.targetHash), imageId: target.image.id, assetId: target.image.assetId,
            sourceSha256: target.expected.sha256, imageSha256: sha256(preparedBytes), metadataHash: fingerprint(target.expected) }) };
      });
    },
    async listSources(value, options = {}) {
      const request = input(value, ["sectionId"]); identifier(request.sectionId);
      return run(options, async (signal) => {
        const state = await snapshot(request, signal), target = sectionTarget(state, request.sectionId), catalog = sourceCatalog(state, target);
        await current(state, request, signal);
        return { type: "page-authoring", sourceScope: state.sourceScope, draftId: state.draft.id, revision: state.draft.revision, sectionId: target.section.id,
          sourcesRevision: catalog.sourcesRevision, sources: clone(catalog.sources),
          target: { requested: target.section.requested, intentionallyEmpty: target.intentionallyEmpty, empty: !hasContent(target.section.blocks), characters: target.text.length },
          limits: { sourceCount: PAGE_AI_LIMITS.sourceCount, combinedCharacters: PAGE_AI_LIMITS.textCharacters } };
      });
    },
    async loadTextContext(value, options = {}) {
      check(["source-text", "review-text", "review-language"].includes(options.kind), "Eine bekannte lokale Textaktion ist erforderlich.", "page_ai_invalid_input", 400);
      const kind = options.kind, request = kind === "review-language" ? input(value, ["sectionId"]) : textRequest(value); identifier(request.sectionId);
      return run(options, async (signal) => {
        const state = await snapshot(request, signal), result = kind === "review-language" ? languageContext(state, request) : selectedContext(state, request, kind);
        await current(state, request, signal); return clone(result);
      });
    },
    isBindingCurrent(value, options = {}) {
      if (closed) return Promise.resolve(false);
      let proof; try { fields(value, [...COMMON_BINDING, ...IMAGE_BINDING, ...TEXT_BINDING]); proof = clone(value); if (!issued(proof)) return Promise.resolve(false); }
      catch { return Promise.resolve(false); }
      return run(options, async (signal) => {
        try {
          check(proof.type === "page-authoring" && ["alt-text", "source-text", "review-text", "review-language"].includes(proof.kind), "Unbekannte Vorschlagsbindung.");
          const request = { type: "page-authoring", sourceScope: proof.sourceScope, draftId: proof.documentId, expectedRevision: proof.revision };
          input(request, []); const state = await snapshot(request, signal);
          let expected;
          if (proof.kind === "alt-text") {
            const target = imageTarget(state, proof.imageId); digest(proof.imageSha256);
            await bytesFor(state, request, target, signal);
            expected = seal({ ...binding(state, proof.kind, target.targetHash), imageId: target.image.id, assetId: target.image.assetId,
              sourceSha256: target.expected.sha256, imageSha256: proof.imageSha256, metadataHash: fingerprint(target.expected) });
          } else if (proof.kind === "review-language") {
            identifier(proof.sectionId); expected = languageContext(state, { ...request, sectionId: proof.sectionId }).binding;
          } else {
            const textInput = textRequest({ ...request, sectionId: proof.sectionId, sourceIds: proof.sourceIds, expectedSourcesRevision: proof.sourceCatalogRevision });
            expected = selectedContext(state, textInput, proof.kind).binding;
          }
          await current(state, request, signal); return fingerprint(expected) === fingerprint(proof);
        } catch (error) { if (signal.aborted || closed) throw abort(); return false; }
      });
    },
    blockingState() { return { known: true, busy: operations.size > 0, activeOperations: operations.size, closed }; },
    close() {
      if (!closing) {
        closed = true; const active = [...operations]; for (const operation of active) operation.controller.abort();
        const stop = ownNormalizer ? Promise.resolve().then(() => normalizer.close()) : Promise.resolve();
        closing = Promise.allSettled([stop, ...active.map((operation) => operation.promise)]).then((results) => {
          signingKey.fill(0);
          if (results[0].status === "rejected") throw results[0].reason;
        });
      }
      return closing;
    },
  };
  return Object.freeze(api);
}
