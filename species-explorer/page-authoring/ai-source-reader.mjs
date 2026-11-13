import { inspectJpeg, inspectPng, inspectWebp } from "../../scripts/image-header.mjs";
import { validateSpeciesRecord } from "../shared-project/species-record.mjs";
import { validateStoredDocument } from "./shared.mjs";
import { normalizeAssetMetadata } from "./model.mjs";
import { check, clone, digest, fields, fingerprint, identifier, normalizeActor, sha256 } from "./contract.mjs";

const writers = ["admin", "publisher", "contributor"], publishers = ["admin", "publisher"];
const connections = ["online", "offline"];
const imageReaders = { "image/png": inspectPng, "image/jpeg": inspectJpeg, "image/webp": inspectWebp };
const scopeOf = (status) => fingerprint([status.baseUrl, status.projectId, status.user.id]);
const userVersion = (status) => Number.isSafeInteger(status.user?.version) && status.user.version > 0 ? status.user.version : undefined;
function editable(status, permissions) {
  return Boolean(status?.baseUrl && status.projectId && status.user?.id && !status.closed && connections.includes(status.connection)
    && writers.includes(status.user.role) && status.readOnlySession !== true && permissions?.canRead === true && permissions.canEdit === true);
}

/** Node-only source reader. Raw working records and image bytes must never be serialized as a renderer response. */
export function createPageAuthoringAiReader({ withClient, repository, mediaFacade, run = (work) => Promise.resolve().then(work), assertOpen = () => {} } = {}) {
  check(typeof withClient === "function" && typeof repository?.scoped === "function" && typeof mediaFacade?.describe === "function"
    && typeof mediaFacade?.read === "function" && typeof run === "function" && typeof assertOpen === "function",
  "ai_source_required", "Die lokale Bild- und Textprüfung benötigt die vorhandene persönliche Seitenquelle.");
  const tick = (signal) => { assertOpen(); signal?.throwIfAborted(); };
  function capture(client, state, input) {
    const status = state?.status;
    check(editable(status, state?.permissions), "forbidden", "Die lokale Artseitenhilfe benötigt eine bestehende persönliche Anmeldung mit Redaktionsrechten.", 403);
    digest(input.sourceScope); identifier(input.draftId);
    check(input.sourceScope === scopeOf(status), "workspace_changed", "Die persönliche Seitenquelle wurde geändert. Bitte die Seite neu laden.", 409);
    return { client, state, status, sourceScope: input.sourceScope, origin: status.baseUrl, projectId: status.projectId,
      userId: status.user.id, role: status.user.role, version: userVersion(status), repo: null };
  }
  async function current(env, signal) {
    tick(signal); const status = await env.client.status(); tick(signal);
    check(editable(status, env.state.permissions) && status.baseUrl === env.origin && status.projectId === env.projectId
      && status.user.id === env.userId && status.user.role === env.role && (env.version === undefined || userVersion(status) === env.version),
    "workspace_changed", "Person, Projekt oder Berechtigung wurde während der lokalen Seitenprüfung geändert.", 409);
    env.status = status;
  }
  function readDraft(env, id, expectedRevision) {
    env.repo ||= repository.scoped({ origin: env.origin, actorId: env.userId }, { existingOnly: true });
    const draft = env.repo?.read(env.projectId, id);
    check(draft, "draft_not_found", "Dieser persönliche Artseitenentwurf ist nicht vorhanden.", 404);
    validateStoredDocument(draft.document); digest(draft.revision); digest(draft.contentHash);
    check(draft.id === id && draft.projectId === env.projectId && draft.actorId === env.userId && draft.current === true
      && Number.isSafeInteger(draft.sequence) && draft.sequence > 0 && draft.contentHash === fingerprint(draft.document)
      && draft.revision === fingerprint({ projectId: env.projectId, id, sequence: draft.sequence, parent: draft.parentRevision, bodyHash: draft.contentHash, actorId: env.userId }),
    "invalid_draft_source", "Die persönliche Seitenfassung besitzt keine vollständige unveränderte Quellenbindung.", 409);
    for (const asset of [...Object.values(draft.document.species.normalAssets).filter(Boolean), ...draft.document.images.map((image) => image.asset)]) normalizeAssetMetadata(asset, env.projectId);
    check(expectedRevision === undefined || draft.revision === expectedRevision, "draft_conflict", "Der Seitenentwurf wurde zwischenzeitlich geändert. Bitte die aktuelle Fassung prüfen.", 409);
    return draft;
  }
  function context(env) {
    return { client: env.client, state: { ...env.state, status: env.status }, sourceScope: env.sourceScope,
      actor: normalizeActor({ id: env.userId, projectId: env.projectId, role: env.role, online: env.status.connection === "online" }) };
  }
  function reading(input, options, allowed, work) {
    return run(async () => {
      const signal = options?.signal; tick(signal); fields(input, allowed);
      return withClient(async (client, state) => {
        tick(signal); const env = capture(client, state, input); await current(env, signal);
        return work(env, signal);
      });
    });
  }
  return Object.freeze({
    readSnapshot: (input, options = {}) => reading(input, options, ["sourceScope", "draftId"], async (env, signal) => {
      const draft = readDraft(env, input.draftId), object = await env.client.getObject("species", draft.document.slug); tick(signal);
      check(object?.kind === "species" && object.id === draft.document.slug && object.data?.type === "fn-species-record",
        "species_record_required", "Die lokale Artseitenhilfe benötigt die vollständige gemeinsame Artquelle dieser Art.", 409);
      const speciesRecord = validateSpeciesRecord(object.data, draft.document.slug);
      await current(env, signal); readDraft(env, input.draftId, draft.revision); tick(signal);
      const permissions = { canRead: env.state.permissions.canRead === true, canEdit: env.state.permissions.canEdit === true };
      if (Object.hasOwn(env.state.permissions, "canCreate")) permissions.canCreate = env.state.permissions.canCreate === true && env.status.connection === "online";
      if (Object.hasOwn(env.state.permissions, "canApprove")) permissions.canApprove = env.state.permissions.canApprove === true && env.status.connection === "online" && publishers.includes(env.role);
      return { sourceScope: env.sourceScope, origin: env.origin, projectId: env.projectId, user: { id: env.userId, role: env.role,
        ...(userVersion(env.status) === undefined ? {} : { version: userVersion(env.status) }) }, permissions, connection: env.status.connection,
      readOnlySession: env.status.readOnlySession === true, draft: clone(draft), speciesRecord };
    }),
    readImage: (input, options = {}) => reading(input, options, ["sourceScope", "draftId", "expectedRevision", "imageId", "assetId"], async (env, signal) => {
      digest(input.expectedRevision); identifier(input.imageId); identifier(input.assetId);
      const draft = readDraft(env, input.draftId, input.expectedRevision), image = draft.document.images.find((image) => image.id === input.imageId);
      check(image?.assetId === input.assetId && image.asset?.id === input.assetId,
        "image_binding_changed", "Die Bildauswahl gehört nicht zu dieser konkreten Position der aktuellen Seite.", 409);
      const expected = normalizeAssetMetadata(image.asset, env.projectId);
      check(Object.hasOwn(imageReaders, expected.mimeType) && expected.bytes <= 20 * 1024 * 1024,
        "invalid_image_media", "Die lokale Bildprüfung benötigt ein gebundenes JPEG-, PNG- oder WebP-Bild bis 20 MiB.", 409);
      const mediaContext = { ...context(env), pageSpecies: draft.document.species, mediaAsset: expected };
      const metadata = normalizeAssetMetadata(await mediaFacade.describe(mediaContext, input.assetId), env.projectId); tick(signal);
      check(fingerprint(metadata) === fingerprint(expected), "media_changed", "Die Bildquelle stimmt nicht mehr mit der gespeicherten Seitenposition überein.", 409);
      await current(env, signal); readDraft(env, input.draftId, draft.revision);
      const bytes = await mediaFacade.read(mediaContext, input.assetId); tick(signal);
      check((Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) && bytes.byteLength === expected.bytes && sha256(bytes) === expected.sha256,
        "media_changed", "Die Bildbytes stimmen nicht mit der geprüften Seitenposition überein.", 409);
      const buffer = Buffer.from(bytes), header = imageReaders[expected.mimeType](buffer);
      check(header.valid && Number.isSafeInteger(header.width) && Number.isSafeInteger(header.height) && header.width > 0 && header.height > 0
        && header.width * header.height <= 40_000_000, "media_format_mismatch", "Bildformat oder Abmessungen passen nicht zur gebundenen Bildquelle.", 409);
      await current(env, signal); readDraft(env, input.draftId, draft.revision); tick(signal);
      return { metadata, buffer };
    }),
  });
}
