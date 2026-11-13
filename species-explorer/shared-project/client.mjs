import { randomUUID } from "node:crypto";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { SPECIES_RECORD_TYPE, validateSpeciesRecord, validateSharedSpecies, guardSpeciesRecordTransition } from "./species-record.mjs";
import { canonicalJson, objectJson, transportJson, digest, tokenHash } from "./security.mjs";
import { validateWebsiteAltObject, WEBSITE_ALT_TYPE } from "./website-alt-sync.mjs";
import { PAGE_AUTHORING_TYPE, validatePageAuthoringServerEvidence } from "../page-authoring/shared.mjs";
import { check, ProjectError } from "./errors.mjs";
import { createClientImageMedia } from "./client-image-media.mjs";
import { buildPageEditorialAdoption } from "./species-editorial-adoption.mjs";
import { createClientNormalMedia } from "./client-normal-media.mjs";
import { validateReaderApprovalPreview } from "./reader-approval.mjs";
import { speciesEnrichmentSourceBindings, SPECIES_ENRICHMENT_MARKER, SPECIES_ENRICHMENT_REQUEST_BYTES } from "./species-enrichment.mjs";
import { normalMediaBinding, NORMAL_MEDIA_SLOTS } from "./normal-media.mjs";
import { SHARED_MEDIA_LIMITS } from "./shared-media-budget.mjs";

const EDITORIAL_PREVIEW_TTL = 10 * 60 * 1000, EDITORIAL_PREVIEW_LIMIT = 64;
const EDITORIAL_ROLES = ["admin", "publisher", "contributor"];
const editorialChangedMessage = "Seite, Artgrundlage, Projekt, Person oder Rolle wurden seit der Vorschau geändert. Bitte den aktuellen Stand erneut prüfen.";

export function createMemoryCredentialStore() {
  const values = new Map();
  return { async get(key) { return values.get(key) ?? null; }, async set(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); } };
}
function serverIdentity(input, allowLoopbackHttp) {
  let url;
  try { url = new URL(input); } catch { /* checked below */ }
  check(url && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
    && (url.protocol === "https:" || allowLoopbackHttp === true && url.protocol === "http:"
      && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)),
  400, "unsafe_server", "Der Projektdienst benötigt HTTPS; lokales Test-HTTP muss ausdrücklich erlaubt sein.");
  return url.origin;
}
function objectData(value) {
  check(value && ["species", "page"].includes(value.kind) && typeof value.id === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) && typeof value.revision === "string" && value.data,
  502, "invalid_response", "Der Dienst hat keinen gültigen Objektstand geliefert.");
  if (value.kind === "species") validateSharedSpecies(value.data, value.id);
  objectJson(value.data);
  if (value.data.type === WEBSITE_ALT_TYPE) validateWebsiteAltObject(value.data, value.id);
  const result = { kind: value.kind, id: value.id, revision: value.revision, ordinal: value.ordinal,
    parentRevision: value.parentRevision, data: value.data, authorId: value.authorId, createdAt: value.createdAt,
    approvedRevision: value.approvedRevision, approval: value.approval };
  if (value.data.type === WEBSITE_ALT_TYPE) result.websiteAltEvidence = value.websiteAltEvidence ?? { schemaVersion: 1, trusted: false,
    objectId: value.id, objectRevision: value.revision, pageRevision: value.data.pageRevision, receipts: [] };
  if (value.data.type === PAGE_AUTHORING_TYPE) {
    try { result.pageAuthoringEvidence = validatePageAuthoringServerEvidence({ objectId: value.id, objectRevision: value.revision,
      objectOrdinal: value.ordinal, data: value.data, evidence: value.pageAuthoringEvidence }); }
    catch { throw new ProjectError(502, "invalid_page_authoring_response", "Der gemeinsame Artseitenstand ist nicht gültig gebunden."); }
  }
  return result;
}
function conflictData(value) {
  check(value && typeof value.id === "string" && ["species", "page"].includes(value.kind)
    && typeof value.objectId === "string" && value.base && value.current && value.proposed,
  502, "invalid_response", "Der Dienst hat keinen vollständigen Konflikt geliefert.");
  for (const field of ["base", "current", "proposed"]) {
    objectJson(value[field]);
    if (value.kind === "species") validateSharedSpecies(value[field], value.objectId);
  }
  return Object.fromEntries(["id", "kind", "objectId", "authorId", "baseRevision", "currentRevision", "base", "current", "proposed",
    "createdAt", "resolvedAt", "resolvedBy", "resolution", "resultingRevision"].map((key) => [key, value[key] ?? null]));
}

/** Desktop facade. Returned values never contain credentials. No legacy-file writes. */
export function createSharedProjectClient({ filename, localStorageConfirmed = false, credentialStore = createMemoryCredentialStore(),
  fetchImpl = globalThis.fetch, allowLoopbackHttp = false, requestTimeoutMs = 15000, imageRequestTimeoutMs = 150000, imageDecode, imageDecodeOptions, mediaBudgetReader,
  editorialClock = () => performance.now(), audioDecode, audioDecodeOptions } = {}) {
  check(credentialStore && ["get", "set", "delete"].every((key) => typeof credentialStore[key] === "function"),
    400, "invalid_credentials", "Ein sicherer Anmeldespeicher ist erforderlich.");
  check(Number.isSafeInteger(imageRequestTimeoutMs) && imageRequestTimeoutMs > 0 && imageRequestTimeoutMs <= 180000,
    400, "invalid_timeout", "Der Bildtransfer benötigt eine begrenzte eigene Zeitgrenze.");
  check(typeof editorialClock === "function", 400, "invalid_clock", "Die redaktionelle Vorschau benötigt eine lokale Zeitprüfung.");
  const store = createSharedProjectClientStore({ filename, localStorageConfirmed });
  let active = store.active(), credentials = null, connection = "disconnected", lastError = null, closing = false, closed = false;
  let chain = Promise.resolve();
  const requests = new Set();
  const editorialPreviews = new Map();
  const credentialKey = (binding) => `fn-shared-project:${binding.id}`;
  const ready = (async () => {
    if (active) {
      try { credentials = await credentialStore.get(credentialKey(active)); }
      catch { lastError = "credential_store_error"; credentials = null; }
      if (credentials && (credentials.projectId !== active.projectId || credentials.userId !== active.userId || credentials.baseUrl !== active.baseUrl)) credentials = null;
      connection = credentials ? "offline" : "authentication-required";
    }
  })();
  function ensureOpen() { check(!closing && !closed, 409, "client_closed", "Die Projektverbindung wird geschlossen."); }
  function run(fn) {
    if (closing || closed) return Promise.reject(new ProjectError(409, "client_closed", "Die Projektverbindung ist geschlossen."));
    const operation = chain.then(async () => { await ready; ensureOpen(); return fn(); });
    chain = operation.catch(() => {});
    return operation;
  }
  async function forget() {
    editorialPreviews.clear();
    if (active) await credentialStore.delete(credentialKey(active));
    credentials = null; connection = "authentication-required";
  }
  async function persist(value) {
    if (!active || value.projectId !== active.projectId || value.user?.id !== active.userId) {
      await forget(); throw new ProjectError(409, "project_changed", "Die Projektidentität hat sich geändert. Bitte die Verbindung neu prüfen.");
    }
    const next = { baseUrl: active.baseUrl, projectId: active.projectId, userId: active.userId,
      sessionToken: value.token, sessionExpiresAt: value.expiresAt, scope: value.scope,
      deviceToken: value.device?.token ?? credentials?.deviceToken ?? null,
      deviceId: value.device?.id ?? credentials?.deviceId ?? null,
      deviceExpiresAt: value.device?.expiresAt ?? credentials?.deviceExpiresAt ?? null };
    try { await credentialStore.set(credentialKey(active), next); }
    catch {
      credentials = null; connection = "authentication-required";
      try { await credentialStore.delete(credentialKey(active)); } catch { /* No RAM fallback when protected storage fails. */ }
      throw new ProjectError(503, "credential_store_unavailable", "Die geschützte Anmeldung konnte nicht gespeichert werden. Die Verbindung wurde nicht übernommen.");
    }
    credentials = next;
  }
  async function request(baseUrl, pathname, { method = "GET", token, data, buffer, headers = {}, responseType = "json", maxResponseBytes, apiVersion = 1, signal } = {}) {
    ensureOpen();
    check([1, 2].includes(apiVersion) && (apiVersion === 1 || /^species\/[a-z0-9-]+\/approval-preview$/.test(pathname))
      && (signal === undefined || signal instanceof AbortSignal), 400, "invalid_request", "Die Anfrage benötigt ihren vorgesehenen Dienstweg und ein gültiges Abbruchsignal.");
    const controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), buffer !== undefined || responseType === "buffer" ? imageRequestTimeoutMs : requestTimeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/api/v${apiVersion}/${pathname}`, { method, redirect: "manual", signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
        headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
          ...([WEBSITE_ALT_TYPE, PAGE_AUTHORING_TYPE].includes(data?.data?.type) ? { "X-Shared-Object-Type": data.data.type }
            : data?.data?.type === SPECIES_RECORD_TYPE && data.data.schemaVersion === 2 ? { "X-Shared-Object-Type": "fn-species-record-v2" } : {}) },
        body: buffer ?? (data === undefined ? undefined : pathname === "changes" && headers["X-Shared-Object-Type"] === SPECIES_ENRICHMENT_MARKER
          ? canonicalJson(data, { maxBytes: SPECIES_ENRICHMENT_REQUEST_BYTES, maxNodes: 300000 }) : transportJson(data)) });
      check(response.status < 300 || response.status >= 400, 502, "redirect_rejected", "Der Dienst verweist auf eine andere Adresse. Die Anmeldung wurde nicht weitergegeben.");
      check(response.url === "" || new URL(response.url).origin === baseUrl, 502, "redirect_rejected", "Eine fremde Antwortadresse wurde abgewiesen.");
      const binaryLimit = /^normal-media\/normal-[a-f0-9]{64}\/content$/.test(pathname) ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
      const limit = responseType === "buffer" ? Math.min(maxResponseBytes ?? binaryLimit, binaryLimit) : pathname.startsWith("objects/page") ? 4 * 1024 * 1024 + 32 * 1024
        : /^conflicts\/[a-f0-9-]+(?:\/resolve)?$/.test(pathname) ? 13 * 1024 * 1024 : 8 * 1024 * 1024;
      const length = Number(response.headers.get("content-length") ?? 0);
      check(length <= limit, 502, "response_too_large", "Die Dienstantwort ist zu groß.");
      const reader = response.body?.getReader();
      let bytes = 0; const chunks = [];
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            bytes += value.length;
            check(bytes <= limit, 502, "response_too_large", "Die Dienstantwort ist zu groß.");
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
      }
      if (responseType === "buffer") return { status: response.status, value: Buffer.concat(chunks), headers: response.headers };
      let value;
      try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* checked below */ }
      check(value && typeof value === "object", 502, "invalid_response", "Der Dienst hat keine lesbare Antwort geliefert.");
      if (pathname.startsWith("objects/page") && bytes > 4 * 1024 * 1024) check(Array.isArray(value.objects) && value.objects.length === 1
        && value.objects[0]?.kind === "species" && value.objects[0].data?.type === SPECIES_RECORD_TYPE && value.objects[0].data.schemaVersion === 2,
      502, "response_too_large", "Nur eine einzelne vollständige redaktionelle Artfassung darf ihre begrenzte zusätzliche Antwortumhüllung nutzen.");
      return { status: response.status, value };
    } catch (error) {
      if (error instanceof ProjectError) throw error;
      throw new ProjectError(503, closing ? "client_closed" : "offline", closing ? "Die Verbindung wird geschlossen." : "Der Projektdienst ist derzeit nicht erreichbar.");
    } finally { clearTimeout(timeout); requests.delete(controller); }
  }
  function responseError(status) {
    const code = status === 401 ? "authentication_required" : status === 403 ? "forbidden" : status === 429 ? "login_throttled" : status === 409 ? "server_changed" : "service_error";
    const message = status === 401 ? "Bitte erneut anmelden." : status === 403 ? "Für diese Aktion fehlt die Berechtigung. Lokale Änderungen bleiben erhalten."
      : status === 429 ? "Zu viele Anmeldeversuche. Bitte später erneut versuchen." : "Der Dienst konnte die Aktion nicht bestätigen. Lokale Änderungen bleiben erhalten.";
    return new ProjectError(status, code, message);
  }
  async function authenticated(pathname, options = {}) {
    check(active && credentials, 401, "authentication_required", "Bitte am Projektdienst anmelden.");
    let result = await request(active.baseUrl, pathname, { ...options, token: credentials.sessionToken });
    if (result.status === 401 && credentials.deviceToken) {
      const refreshed = await request(active.baseUrl, "auth/refresh", { method: "POST", token: credentials.deviceToken });
      if (refreshed.status === 200) {
        await persist(refreshed.value);
        result = await request(active.baseUrl, pathname, { ...options, token: credentials.sessionToken });
      } else { await forget(); throw responseError(401); }
    }
    if (result.status === 401) { await forget(); throw responseError(401); }
    if (result.status === 403) { connection = "forbidden"; throw responseError(403); }
    connection = "online";
    return result;
  }
  async function identity() {
    const result = await authenticated("auth/me");
    if (result.status !== 200) throw responseError(result.status);
    if (result.value.projectId !== active.projectId || result.value.id !== active.userId) {
      await forget(); throw new ProjectError(409, "project_changed", "Der Dienst gehört zu einem anderen Projekt. Lokale Änderungen wurden nicht gesendet.");
    }
    if (result.value.role !== active.user.role) editorialPreviews.clear();
    store.updateUser(active.id, result.value); active = store.active();
    return result.value;
  }
  async function pull() {
    let pullId = null, snapshot, cursor = null, totalCount, count = 0;
    const bindingId = active.id;
    async function page(parameters) {
      const result = await authenticated(`objects/page?${new URLSearchParams(parameters)}`);
      if (result.status !== 200) {
        if (result.status === 409 && result.value.error?.code === "objects_snapshot_changed") {
          await identity();
          throw new ProjectError(409, "objects_snapshot_changed", "Bestand oder Berechtigung wurde während des Abrufs geändert. Der bisherige Cache und lokale Änderungen bleiben erhalten; bitte erneut laden.");
        }
        throw responseError(result.status);
      }
      const value = result.value;
      check(active.id === bindingId && value.schemaVersion === 1 && value.projectId === active.projectId
        && value.user?.id === active.userId && ["admin", "publisher", "contributor", "reader"].includes(value.user.role)
        && /^[a-f0-9]{64}$/.test(value.snapshot) && (snapshot === undefined || value.snapshot === snapshot)
        && Number.isInteger(value.totalCount) && value.totalCount >= 0 && value.totalCount <= 100000
        && (totalCount === undefined || totalCount === value.totalCount) && Array.isArray(value.objects) && value.objects.length <= 25
        && typeof value.complete === "boolean" && (value.nextCursor === null || typeof value.nextCursor === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(value.nextCursor)),
      502, "invalid_response", "Der begrenzte Objektabruf ist nicht vollständig an Projekt, Person und Bestand gebunden.");
      if (value.user.role !== active.user.role) editorialPreviews.clear();
      store.updateUser(active.id, value.user); active = store.active();
      return value;
    }
    try {
      do {
        const value = await page({ limit: "25", ...(snapshot ? { snapshot } : {}), ...(cursor ? { cursor } : {}) });
        check(value.checked === false && value.complete === (value.nextCursor === null)
          && (value.complete || value.objects.length > 0 && value.nextCursor !== cursor), 502, "invalid_response", "Die Abruffortsetzung ist unvollständig.");
        if (!pullId) { snapshot = value.snapshot; totalCount = value.totalCount; pullId = store.beginPull(bindingId, value); }
        const objects = value.objects.map(objectData);
        check(!readOnly() || objects.every((entry) => entry.approval === "approved" && entry.approvedRevision === entry.revision),
          502, "invalid_response", "Eine Lesesitzung darf keine ungeprüften Entwürfe erhalten.");
        store.stagePull(pullId, { snapshot, totalCount, objects });
        count += objects.length; cursor = value.nextCursor;
        check(count <= totalCount && (!value.complete || count === totalCount), 502, "invalid_response", "Der gelieferte Bestand ist unvollständig.");
      } while (cursor);
      const final = await page({ snapshot, check: "1" });
      check(final.checked === true && final.complete === true && final.objects.length === 0 && final.nextCursor === null,
        502, "invalid_response", "Die Abschlussprüfung des Bestands fehlt.");
      ensureOpen();
      store.finishPull(pullId, { snapshot, totalCount }); pullId = null;
    } finally { if (pullId) store.cancelPull(pullId); }
  }
  async function readKnownConflict(bindingId, row) {
    const expectedStamp = store.conflictStamp(bindingId, row.conflict_id);
    const response = await authenticated(`conflicts/${row.conflict_id}`);
    if (response.status !== 200) throw responseError(response.status);
    const value = conflictData(response.value);
    check(value.id === row.conflict_id && value.kind === row.kind && value.objectId === row.object_id,
      502, "invalid_response", "Der geladene Konflikt gehört nicht zur angefragten lokalen Fassung.");
    return { row, value, expectedStamp };
  }
  async function pullKnownConflicts() {
    if (readOnly() || !["admin", "publisher", "contributor"].includes(active.user.role)) return;
    const bindingId = active.id, staged = [];
    for (const row of store.pending(bindingId).filter((entry) => entry.state === "conflict")) {
      staged.push(await readKnownConflict(bindingId, row));
    }
    check(active.id === bindingId && !readOnly(), 409, "conflict_review_changed", "Die Anmeldung wurde während des lesenden Konfliktabrufs geändert.");
    for (const { row, value, expectedStamp } of staged) store.refreshConflict(bindingId, row.change_id, value, expectedStamp);
  }
  function safeStatus() {
    return { connection, baseUrl: active?.baseUrl ?? null, projectId: active?.projectId ?? null,
      user: active?.user ?? null, readOnlySession: credentials ? credentials.scope !== "full" : true,
      ...(active ? store.counts(active.id) : { pending: 0, conflicts: 0, otherProjectPending: 0 }),
      lastError, closed };
  }
  function readOnly() { return active?.user.role === "reader" || !credentials || credentials.scope !== "full" || connection === "forbidden"; }
  function capabilityData(value) {
    check(value?.schemaVersion === 1 && value.projectId === active.projectId && value.user?.id === active.user.id
      && value.user.role === active.user.role && value.speciesRecordVersion === 1 && value.adminBoundImport === true,
    502, "invalid_response", "Die Fähigkeiten des Projektdiensts sind nicht eindeutig bestätigt.");
    const editorial = Object.hasOwn(value, "pageEditorialAdoption"), versions = Object.hasOwn(value, "speciesRecordVersions");
    check(!editorial || value.pageEditorialAdoption === 1, 502, "invalid_response", "Die redaktionelle Übernahmefähigkeit ist nicht gültig bestätigt.");
    check(!versions || Array.isArray(value.speciesRecordVersions) && value.speciesRecordVersions.length === 2
      && value.speciesRecordVersions[0] === 1 && value.speciesRecordVersions[1] === 2,
    502, "invalid_response", "Die unterstützten Artfassungen sind nicht gültig bestätigt.");
    check(!Object.hasOwn(value, "speciesCreation") || value.speciesCreation === 1, 502, "invalid_response", "Die gemeinsame Artanlage ist nicht gültig bestätigt.");
    check(!Object.hasOwn(value, "speciesEnrichment") || value.speciesEnrichment === 1, 502, "invalid_response", "Die Übernahme von Artvorschlägen ist nicht gültig bestätigt.");
    check(!Object.hasOwn(value, "normalMedia") || [0, 1].includes(value.normalMedia), 502, "invalid_response", "Die Artdateibereitstellung ist nicht gültig bestätigt.");
    return { schemaVersion: 1, projectId: value.projectId, user: { id: value.user.id, role: value.user.role }, speciesRecordVersion: 1, adminBoundImport: true,
      ...(editorial ? { pageEditorialAdoption: 1 } : {}), ...(versions ? { speciesRecordVersions: [1, 2] } : {}),
      ...(value.speciesCreation === 1 ? { speciesCreation: 1 } : {}), ...(value.speciesEnrichment === 1 ? { speciesEnrichment: 1 } : {}),
      ...(value.normalMedia === 1 ? { normalMedia: 1 } : {}),
      ...(value.devicePairing === 1 ? { devicePairing: 1 } : {}) };
  }
  function editorialNow() {
    const now = editorialClock();
    check(Number.isFinite(now), 500, "invalid_clock", "Die redaktionelle Vorschau konnte zeitlich nicht geprüft werden.");
    return now;
  }
  function pruneEditorialPreviews() {
    const now = editorialNow();
    for (const [token, preview] of editorialPreviews) if (now >= preview.deadline || now < preview.createdAt) editorialPreviews.delete(token);
    return now;
  }
  function editorialScope() {
    ensureOpen(); check(active && credentials, 401, "authentication_required", "Bitte zuerst am gemeinsamen Projekt anmelden.");
    check(credentials.scope === "full" && EDITORIAL_ROLES.includes(active.user.role), 403, "forbidden", "Die redaktionelle Übernahme benötigt eine volle redaktionelle Anmeldung.");
    return { bindingId: active.id, baseUrl: active.baseUrl, projectId: active.projectId, userId: active.userId, role: active.user.role };
  }
  function assertEditorialScope(expected) {
    ensureOpen();
    const current = store.active();
    const matches = active && credentials && current && credentials.scope === "full"
      && [active, current].every(binding => binding.id === expected.bindingId && binding.baseUrl === expected.baseUrl
        && binding.projectId === expected.projectId && binding.userId === expected.userId && binding.user?.id === expected.userId && binding.user.role === expected.role)
      && credentials.baseUrl === expected.baseUrl && credentials.projectId === expected.projectId && credentials.userId === expected.userId
      && EDITORIAL_ROLES.includes(expected.role);
    if (!matches) editorialPreviews.clear();
    check(matches, 409, "editorial_adoption_changed", editorialChangedMessage);
  }
  async function editorialSupport(binding) {
    const support = await authenticated("capabilities", { method: "GET" });
    assertEditorialScope(binding);
    check(support.status !== 404, 409, "editorial_adoption_server_required", "Der Projektdienst benötigt zuerst die geprüfte redaktionelle Artübernahme. Es wurde nichts übernommen.");
    if (support.status !== 200) throw actionError(support);
    const value = support.value;
    check(value?.projectId === binding.projectId && value.user?.id === binding.userId && value.user.role === binding.role,
      409, "editorial_adoption_changed", editorialChangedMessage);
    check(value.schemaVersion === 1 && value.speciesRecordVersion === 1 && value.adminBoundImport === true
      && value.pageEditorialAdoption === 1 && Array.isArray(value.speciesRecordVersions) && value.speciesRecordVersions.length === 2
      && value.speciesRecordVersions[0] === 1 && value.speciesRecordVersions[1] === 2,
    409, "editorial_adoption_server_required", "Der Projektdienst bestätigt die geprüfte redaktionelle Artübernahme noch nicht. Es wurde nichts übernommen.");
  }
  async function editorialCandidate(pageId, speciesId, expectedBinding) {
    check(typeof pageId === "string" && /^fn-species-page-[a-f0-9]{64}$/.test(pageId)
      && typeof speciesId === "string" && speciesId.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(speciesId),
    400, "invalid_object", "Die redaktionelle Übernahme benötigt die eindeutige gemeinsame Seite und Art.");
    const binding = expectedBinding ?? editorialScope();
    assertEditorialScope(binding);
    await identity(); assertEditorialScope(binding);
    // An old NAS must fail before fetching/projection; final support + identity
    // also bind the capability response after the potentially multi-page pull.
    await editorialSupport(binding);
    await pull(); assertEditorialScope(binding);
    await editorialSupport(binding);
    await identity(); assertEditorialScope(binding);
    const pageObject = store.get(binding.bindingId, "page", pageId, { serverOnly: true });
    const speciesObject = store.get(binding.bindingId, "species", speciesId, { serverOnly: true });
    check([pageObject, speciesObject].every(object => !object.localPending && !object.localConflict)
      && !store.conflicts(binding.bindingId).some(conflict => conflict.kind === "page" && conflict.objectId === pageId
        || conflict.kind === "species" && conflict.objectId === speciesId),
    409, "pending_review", "Bitte lokale Änderungen oder Konflikte dieser Seite und Art zuerst klären. Alle Entwürfe bleiben erhalten.");
    let candidate;
    try { candidate = buildPageEditorialAdoption({ pageObject, speciesObject, projectId: binding.projectId,
      actor: { id: binding.userId, projectId: binding.projectId, role: binding.role } }); }
    catch (error) {
      if (expectedBinding && error instanceof ProjectError && error.status === 409)
        throw new ProjectError(409, "editorial_adoption_changed", editorialChangedMessage);
      throw error;
    }
    return { binding, candidate, beforeEditorial: speciesObject.data.editorial };
  }
  function editorialCandidateHash(candidate) {
    // Hash each bounded object separately: no aggregate record/history limit.
    return digest(canonicalJson({ data: digest(objectJson(candidate.data)), intent: digest(canonicalJson(candidate.intent)) }));
  }
  function reviewedEditorialObject(change, input) {
    const object = objectData(input);
    check(object.kind === change.kind && object.id === change.id && digest(objectJson(object.data)) === digest(objectJson(change.data)),
      502, "invalid_response", "Die bestätigte redaktionelle Übernahme stimmt nicht mit dem erhaltenen Auftrag überein. Der lokale Entwurf bleibt erhalten.");
    return object;
  }
  function reviewedEditorialConflict(change, input, conflictId) {
    const conflict = conflictData(input);
    check(conflict.id === conflictId && conflict.kind === change.kind && conflict.objectId === change.id && conflict.baseRevision === change.baseRevision
      && digest(objectJson(conflict.proposed)) === digest(objectJson(change.data))
      && digest(objectJson(conflict.base)) === change.intent.sourceBindings.species.dataHash,
    502, "invalid_response", "Der geladene Konflikt stimmt nicht mit dem erhaltenen redaktionellen Auftrag überein. Alle lokalen Fassungen bleiben erhalten.");
    return conflict;
  }
  async function cancelEditorial(changeId) {
    check(typeof changeId === "string" && /^[A-Za-z0-9_-]{8,120}$/.test(changeId), 400, "invalid_change", "Bitte den erhaltenen redaktionellen Entwurf auswählen.");
    const binding = editorialScope(); assertEditorialScope(binding);
    await identity(); assertEditorialScope(binding);
    // Establish/reuse the durable cancellation guard before any network write.
    const change = store.editorialChange(binding.bindingId, changeId);
    const requestHash = digest(transportJson({ kind: change.kind, id: change.id, baseRevision: change.baseRevision, data: change.data, intent: change.intent }));
    const response = await authenticated(`changes/${changeId}/cancel`, { method: "POST", data: { requestHash } });
    assertEditorialScope(binding);
    if (response.status !== 200) throw actionError(response);
    let result;
    if (response.value.status === "cancelled") {
      check(response.value.changeId === changeId, 502, "invalid_response", "Die Abbruchbestätigung gehört nicht zu diesem Entwurf.");
      result = store.cancelEditorialChange(binding.bindingId, changeId);
    } else if (response.value.status === "applied") {
      const object = reviewedEditorialObject(change, response.value.object);
      store.acknowledge(binding.bindingId, changeId, object);
      result = { cancelled: false, alreadyApplied: true, changeId, object, readerApproved: false, externalPublication: "not-performed" };
    } else if (response.value.status === "conflict" && typeof response.value.conflictId === "string" && /^[a-f0-9-]+$/.test(response.value.conflictId)) {
      const remote = await authenticated(`conflicts/${response.value.conflictId}`);
      assertEditorialScope(binding);
      if (remote.status !== 200) throw actionError(remote);
      const conflict = reviewedEditorialConflict(change, remote.value, response.value.conflictId);
      store.saveConflict(binding.bindingId, changeId, conflict);
      result = { cancelled: false, conflict: true, changeId, conflictId: conflict.id, readerApproved: false, externalPublication: "not-performed" };
    } else throw new ProjectError(502, "invalid_response", "Der Projektdienst hat den Entwurfsabbruch nicht eindeutig bestätigt.");
    // The server receipt and its local acknowledgement are already durable.
    // A later read outage must not turn that confirmed result into a retry.
    try {
      await pull(); assertEditorialScope(binding);
      if (result.object) {
        const current = store.get(binding.bindingId, change.kind, change.id);
        result.object = result.alreadyApplied ? { ...result.object, localPending: current.localPending, localConflict: current.localConflict } : current;
      }
      lastError = null; return { ...result, refreshConfirmed: true };
    } catch (error) {
      record(error);
      if (readOnly()) delete result.object;
      else try { assertEditorialScope(binding); } catch { delete result.object; }
      return { ...result, refreshConfirmed: false, warning: "Der Auftragsstatus ist bestätigt. Der aktuelle Projektbestand konnte anschließend nicht geladen werden. Bitte später erneut laden." };
    }
  }
  function record(error) {
    lastError = error instanceof ProjectError ? error.code : "client_error";
    if (lastError === "offline") connection = "offline";
    if (lastError === "authentication_required") connection = "authentication-required";
    return error instanceof ProjectError ? error : new ProjectError(500, "client_error", "Die Projektaktion konnte nicht abgeschlossen werden.");
  }
  function actionError(result) {
    const messages = { last_admin: "Die letzte aktive Administration muss erhalten bleiben.", user_changed: "Die Benutzerangaben wurden inzwischen geändert. Bitte neu laden.",
      object_exists: "Diese Art oder Seite ist bereits vorhanden. Bitte den aktuellen Stand laden.", duplicate_user: "Dieser Benutzername ist bereits vergeben.",
      species_identity_exists: "Diese strukturierte Artidentität besteht bereits unter einer anderen Kennung. Bitte zuerst die Zuordnung prüfen.",
      species_name_exists: "Dieser deutsche Artname ist bereits vorhanden. Bitte die vorhandene Art prüfen.",
      species_asset_exists: "Dieser Assetname gehört bereits zu einer vorhandenen Art. Es wurde keine neue Art angelegt.",
      species_slug_exists: "Dieser URL-Slug gehört bereits zu einer vorhandenen Art. Es wurde keine neue Art angelegt.",
      species_creation_changed: "Projekt, Person oder Berechtigung wurden seit der Artvorschau geändert. Bitte neu prüfen.",
      object_changed: "Die Objektversion wurde inzwischen geändert. Bitte vor der Freigabe erneut prüfen.",
      conflict_review_changed: "Projekt, Person oder Rolle wurden während der Konfliktentscheidung geändert. Bitte neu vergleichen; alle Fassungen bleiben erhalten.",
      approval_review_changed: "Artfassung, Projekt, Person oder Rolle wurden seit der Freigabevorschau geändert. Bitte neu prüfen; alle Entwürfe bleiben erhalten.",
      editorial_adoption_changed: "Seite oder Artgrundlage haben sich seit der redaktionellen Übernahme geändert. Der lokale Entwurf bleibt erhalten; bitte vor einer neuen Übernahme erneut prüfen.",
      editorial_adoption_review_required: "Die redaktionelle Übernahme benötigt eine neue ausdrückliche Prüfung. Der lokale Entwurf bleibt erhalten und wird nicht automatisch ersetzt.",
      species_enrichment_changed: "Die Artfassung oder Benutzerbindung wurde geändert. Der gespeicherte Vorschlag bleibt erhalten und muss erneut geprüft werden.",
      species_enrichment_review_changed: "Der Dienst konnte die geprüfte Zielfassung nicht bestätigen. Der Vorschlag bleibt erhalten und muss erneut geprüft werden.",
      reader_catalog_version_required: "Der Projektdienst benötigt zuerst die aktuelle Unterstützung der redaktionellen Artinhalte. Der lokale Entwurf bleibt erhalten.",
      media_binding_changed: "Projekt, Person oder Rolle wurde während der Bildübernahme geändert. Bilddatei und Entwurf bleiben erhalten.",
      image_media_changed: "Der unveränderliche Bildquellenbeleg wurde nicht bestätigt. Bilddatei und Entwurf bleiben erhalten.",
      image_media_incomplete: "Die Bilddatei wurde auf dem gemeinsamen Dienst noch nicht vollständig bestätigt.",
      invalid_image_media: "Die Bilddatei wurde vom gemeinsamen Dienst nicht als gültiges Bild bestätigt.",
      normal_media_not_found: "Diese Artdatei ist für den aktuellen Projekt- oder Lesestand noch nicht bereitgestellt.",
      normal_media_incomplete: "Die Artdatei ist auf dem gemeinsamen Dienst noch nicht vollständig bestätigt.",
      normal_media_changed: "Die unveränderliche Artdatei- oder Quellenbindung wurde nicht bestätigt. Bitte die aktuelle Fassung prüfen.",
      normal_media_busy: "Eine Artdatei wird bereits geprüft. Bitte den Abschluss abwarten.",
      normal_media_too_large: "Die Artdatei überschreitet die zulässige Bereitstellungsgröße. Das Original bleibt erhalten.",
      invalid_normal_media: "Die Artdatei stimmt nicht vollständig mit ihrem geprüften Originalbeleg überein.",
      reader_media_required: "Die Leserfassung benötigt zuerst ihre fehlenden Dateien und eine neue Vorschau.",
      unsupported_audio_tag: "Diese MP3-Metadatenform wird derzeit nicht unterstützt. Die Originaldatei bleibt erhalten." };
    const code = result.value?.error?.code;
    return messages[code] ? new ProjectError(result.status, code, messages[code]) : responseError(result.status);
  }
  function assertActionBinding(requiredBinding, code = "import_project_changed") {
    if (requiredBinding !== undefined) check(requiredBinding && active && requiredBinding.baseUrl === active.baseUrl && requiredBinding.projectId === active.projectId
      && requiredBinding.userId === active.user.id && (requiredBinding.role === undefined || requiredBinding.role === active.user.role)
      && (requiredBinding.userVersion === undefined || requiredBinding.userVersion === active.user.version),
    409, code, "Projekt, angemeldete Person oder Berechtigung wurden während der Prüfung gewechselt. Der Schreibschritt wurde angehalten.");
  }
  async function onlineAction(pathname, options, roles = ["admin", "publisher", "contributor"], requiredBinding) {
    await identity(); assertActionBinding(requiredBinding);
    check(credentials.scope === "full" && roles.includes(active.user.role), 403, "forbidden", "Für diese Aktion fehlt eine volle berechtigte Anmeldung.");
    const result = await authenticated(pathname, options);
    if (![200, 201].includes(result.status)) throw actionError(result);
    return result.value;
  }
  const imageMedia = createClientImageMedia({ run: (fn) => run(async () => { try { return await fn(); } catch (error) { throw record(error); } }),
    store, ensureOpen, authenticated, actionError, mediaBudgetReader,
    ...(imageDecode ? { decode: imageDecode } : {}), decodeOptions: imageDecodeOptions,
    capture() {
      ensureOpen(); check(active && credentials, 401, "authentication_required", "Bitte zuerst am gemeinsamen Projekt anmelden.");
      return { ...active, user: { ...active.user }, readOnly: readOnly() };
    },
    async online() { await identity(); ensureOpen(); return { ...active, user: { ...active.user } }; },
  });
  const { uploadQueued, ...normalMedia } = createClientNormalMedia({
    run: fn => run(async () => { try { return await fn(); } catch (error) { throw record(error); } }),
    ensureOpen, authenticated, actionError, store, mediaBudgetReader,
    imageDecodeOptions, audioDecodeOptions: audioDecodeOptions ?? imageDecodeOptions,
    getObject: (kind, id) => store.get(active?.id, kind, id, { serverOnly: true }),
    ...(imageDecode ? { imageDecode } : {}), ...(audioDecode ? { audioDecode } : {}),
    capture() {
      ensureOpen(); check(active && credentials, 401, "authentication_required", "Bitte zuerst am gemeinsamen Projekt anmelden.");
      return { ...active, user: { ...active.user }, readOnly: readOnly() };
    },
    async online() { await identity(); ensureOpen(); return { ...active, user: { ...active.user } }; },
  });

  function assertEnrichmentWriter(expected = active) {
    ensureOpen();
    const current = store.active();
    check(expected && current?.id === expected.id && active?.id === expected.id && credentials?.scope === "full"
      && credentials.baseUrl === expected.baseUrl && credentials.projectId === expected.projectId && credentials.userId === expected.userId
      && [active, current].every(value => value.user.role === expected.user.role && value.user.version === expected.user.version)
      && EDITORIAL_ROLES.includes(expected.user.role), 409, "species_enrichment_changed",
    "Die persönliche Projektanmeldung wurde geändert. Der Artvorschlag bleibt erhalten.");
  }
  async function enrichmentHead(id, owner) {
    const response = await authenticated(`objects/species/${id}`);
    assertEnrichmentWriter(owner);
    if (response.status !== 200) throw actionError(response);
    const value = objectData(response.value);
    check(value.kind === "species" && value.id === id, 502, "invalid_response", "Die Dienstantwort gehört nicht zur gewählten Art.");
    return value;
  }
  async function assertEnrichmentSupport(owner) {
    const support = await authenticated("capabilities");
    assertEnrichmentWriter(owner);
    if (support.status !== 200 && support.status !== 404) throw actionError(support);
    check(support.status === 200 && capabilityData(support.value).speciesEnrichment === 1 && support.value.normalMedia === 1,
      409, "species_enrichment_server_required", "Der Projektdienst benötigt zuerst die Unterstützung für Artvorschläge und deren Dateien. Der Vorschlag bleibt erhalten.");
  }
  async function syncEnrichment({ change, data, media, resultRevision }, owner) {
    const { changeId, id } = change;
    await assertEnrichmentSupport(owner);
    let head = resultRevision ? await enrichmentHead(id, owner) : null;
    if (!head || head.revision !== resultRevision) {
      check(!head || head.revision !== change.baseRevision, 409, "species_enrichment_changed",
        "Der Dienst zeigt wieder die Ausgangsfassung. Der bestätigte Auftrag bleibt zur Prüfung erhalten.");
      const result = await authenticated("changes", { method: "POST", data: change, headers: { "X-Shared-Object-Type": SPECIES_ENRICHMENT_MARKER } });
      assertEnrichmentWriter(owner);
      if (!resultRevision && result.status === 409 && ["species_enrichment_changed", "species_enrichment_review_changed"].includes(result.value?.error?.code)) {
        store.updateEnrichment(owner.id, changeId, await enrichmentHead(id, owner), "stale");
        throw actionError(result);
      }
      if (result.status !== 200) throw actionError(result);
      check(result.value?.status === "applied", 502, "invalid_response", "Die Übernahme des Artvorschlags wurde nicht eindeutig bestätigt.");
      const accepted = objectData(result.value.object);
      store.updateEnrichment(owner.id, changeId, accepted, "accepted");
      resultRevision = accepted.revision;
      head = await enrichmentHead(id, owner);
      check(head.revision === resultRevision || head.ordinal > accepted.ordinal, 409, "species_enrichment_changed",
        "Die bestätigte Entwurfsfassung konnte im aktuellen Bestand nicht wiedergefunden werden. Der Auftrag bleibt erhalten.");
    }
    if (head.revision === resultRevision) check(digest(objectJson(head.data)) === change.enrichment.targetDataHash,
      502, "invalid_response", "Der aktuelle Entwurf stimmt nicht mit der bestätigten Zielfassung überein.");
    const requiredBinding = { baseUrl: owner.baseUrl, projectId: owner.projectId, userId: owner.userId, role: owner.user.role };
    const uploads = media.filter(({ slot }) => NORMAL_MEDIA_SLOTS.includes(slot) && !data.assets.files[slot]?.url)
      .map(file => ({ ...file, target: normalMediaBinding(data, { projectId: owner.projectId, slot: file.slot }) }))
      .filter(({ target, metadata }) => target?.asset.sha256 === metadata.sha256);
    const confirmed = new Set();
    const matches = (value, target) => value.data.type === SPECIES_RECORD_TYPE
      && normalMediaBinding(value.data, { projectId: owner.projectId, slot: target.slot })?.contentId === target.contentId
      && !value.data.assets.files[target.slot].url;
    for (const { slot, target, buffer } of uploads) {
      if (!matches(head, target)) continue;
      const expectedRevision = head.revision, expectedDataHash = digest(objectJson(head.data));
      store.updateEnrichment(owner.id, changeId, head, "observed");
      await uploadQueued({ speciesId: id, slot, expectedRevision, expectedDataHash, requiredBinding, buffer }, () => {
        assertEnrichmentWriter(owner);
        const rows = store.pending(owner.id).filter(row => row.kind === "species" && row.object_id === id);
        check(rows.length === 1 && rows[0].change_id === changeId && rows[0].result_revision === resultRevision,
          409, "species_enrichment_changed", "Der bestätigte Dateiauftrag wurde geändert.");
        const value = store.get(owner.id, "species", id, { serverOnly: true });
        return { ...value, localPending: false };
      });
      confirmed.add(target.contentId);
      head = await enrichmentHead(id, owner);
    }
    check(uploads.every(({ target }) => !matches(head, target) || confirmed.has(target.contentId)), 409, "species_enrichment_changed",
      "Eine Datei der geprüften Fassung ist inzwischen wieder aktiv. Bitte den Abgleich erneut starten.");
    store.updateEnrichment(owner.id, changeId, head, "complete");
    const currentMedia = uploads.filter(({ target }) => matches(head, target)).length;
    return { changeId, speciesId: id, acceptedRevision: resultRevision, currentRevision: head.revision,
      confirmedFiles: currentMedia, supersededFiles: uploads.length - currentMedia, readerApproved: false };
  }
  function reviewedSpeciesApproval(id, expectedRevision, expectedDataHash, requiredBinding) {
    assertActionBinding(requiredBinding, "approval_review_changed");
    const cached = store.get(active?.id, "species", id, { serverOnly: true });
    check(!cached.localPending && !cached.localConflict && !store.conflicts(active.id).some((entry) => entry.kind === "species" && entry.objectId === id),
      409, "pending_review", "Bitte lokale Artentwürfe und Konflikte zuerst abgleichen und anschließend die aktuelle Fassung prüfen.");
    check(cached.data?.type === SPECIES_RECORD_TYPE && cached.revision === expectedRevision
      && digest(objectJson(validateSpeciesRecord(cached.data, id))) === expectedDataHash,
    409, "approval_review_changed", "Die vollständige Artfassung wurde seit der Freigabevorschau geändert. Bitte neu prüfen; alle Entwürfe bleiben erhalten.");
    return cached;
  }
  const client = {
    media: imageMedia.api,
    normalMedia: Object.freeze(normalMedia),
    checkSpeciesEnrichmentSource(id) { return run(async () => {
      try {
        check(typeof id === "string" && id.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 400, "invalid_species_enrichment", "Bitte eine gemeinsame Art wählen.");
        await identity();
        check(!readOnly() && EDITORIAL_ROLES.includes(active.user.role), 403, "forbidden", "Der Artvorschlag benötigt eine volle Bearbeitungsberechtigung.");
        const owner = active, object = await enrichmentHead(id, owner), local = store.get(owner.id, "species", id, { serverOnly: true });
        const sourceBindings = speciesEnrichmentSourceBindings(object, owner.projectId);
        check(canonicalJson(speciesEnrichmentSourceBindings(local, owner.projectId)) === canonicalJson(sourceBindings),
          409, "species_enrichment_changed", "Die gemeinsame Artfassung wurde geändert. Bitte zuerst den Bestand neu laden.");
        return { object, sourceBindings, actor: { baseUrl: owner.baseUrl, projectId: owner.projectId, userId: owner.userId,
          role: owner.user.role, userVersion: owner.user.version } };
      } catch (error) { throw record(error); }
    }); },
    speciesEnrichmentStatus(id) { return run(() => {
      check(active && !readOnly() && EDITORIAL_ROLES.includes(active.user.role), 403, "forbidden", "Der Artvorschlag benötigt eine volle Bearbeitungsberechtigung.");
      const pending = store.pendingEnrichment(active.id, id);
      const object = store.get(active.id, "species", id, { serverOnly: true });
      const hasPendingChanges = object.localPending || object.localConflict;
      return { pending, hasPendingChanges, candidate: hasPendingChanges ? null : store.speciesEnrichment.read(active.id, null, { latestSpecies: id, includeMedia: false }) };
    }); },
    // Node-only prepared provider output. The HTTP and renderer facades do not expose this store.
    savePreparedSpeciesEnrichment(prepared, expectedActor, { signal } = {}) { return run(async () => {
      check(!signal?.aborted, 409, "species_enrichment_cancelled", "Die Artvorbereitung wurde abgebrochen.");
      await identity();
      check(active && credentials?.scope === "full" && !readOnly() && ["admin", "publisher", "contributor"].includes(active.user.role),
        403, "forbidden", "Der persönliche Artvorschlag benötigt eine volle Bearbeitungsberechtigung.");
      const speciesId = prepared?.sourceBindings?.speciesId;
      check(typeof speciesId === "string" && speciesId.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(speciesId),
        400, "invalid_species_enrichment", "Der Artvorschlag benötigt eine eindeutig gebundene gemeinsame Art.");
      const fresh = await authenticated(`objects/species/${speciesId}`, { signal });
      if (fresh.status !== 200) throw actionError(fresh);
      const { kind, id, revision, data } = objectData(fresh.value);
      const source = speciesEnrichmentSourceBindings({ kind, id, revision, data }, active.projectId);
      check(canonicalJson(source) === canonicalJson(prepared.sourceBindings), 409, "species_enrichment_changed",
        "Die gemeinsame Artfassung wurde seit der Vorbereitung geändert. Bitte erneut prüfen.");
      let remaining = SHARED_MEDIA_LIMITS.profileBytes;
      if (mediaBudgetReader) {
        const profile = await mediaBudgetReader({ additionalBytes: 0 });
        ensureOpen();
        check(profile && Number.isSafeInteger(profile.totalBytes) && profile.totalBytes >= 0, 409, "species_enrichment_budget_unavailable",
          "Die persönliche Sicherungsreserve konnte nicht sicher bestimmt werden.");
        remaining = Math.max(0, remaining - profile.totalBytes);
      }
      check(!signal?.aborted, 409, "species_enrichment_cancelled", "Die Artvorbereitung wurde abgebrochen.");
      return store.speciesEnrichment.save(active.id, prepared, expectedActor, remaining);
    }); },
    readPreparedSpeciesEnrichment(candidateId) { return run(() => {
      check(active && credentials?.scope === "full" && !readOnly() && ["admin", "publisher", "contributor"].includes(active.user.role),
        403, "forbidden", "Der persönliche Artvorschlag benötigt eine volle Bearbeitungsberechtigung.");
      return store.speciesEnrichment.read(active.id, candidateId);
    }); },
    readPreparedSpeciesEnrichmentFile(id, candidateId, slot) { return run(() => {
      check(active && !readOnly() && EDITORIAL_ROLES.includes(active.user.role), 403, "forbidden", "Der Artvorschlag benötigt eine volle Bearbeitungsberechtigung.");
      check(NORMAL_MEDIA_SLOTS.includes(slot), 404, "species_enrichment_original_missing", "Diese Artdatei ist im Vorschlag nicht verfügbar.");
      const { media } = store.speciesEnrichment.read(active.id, candidateId, { expectedSpecies: id, onlySlot: slot });
      const file = media.find(value => value.slot === slot);
      check(file?.buffer, 404, "species_enrichment_original_missing", "Diese Artdatei ist im Vorschlag nicht verfügbar.");
      return file;
    }); },
    stagePreparedSpeciesEnrichment(candidateId, expectedTargetDataHash) { return run(async () => {
      try {
        await identity();
        check(!readOnly() && EDITORIAL_ROLES.includes(active.user.role), 403, "forbidden", "Der Artvorschlag benötigt eine volle Bearbeitungsberechtigung.");
        assertEnrichmentWriter();
        const owner = active;
        const candidate = store.speciesEnrichment.read(owner.id, candidateId, { includeMedia: false });
        await assertEnrichmentSupport(owner);
        const { kind, id, revision, data } = await enrichmentHead(candidate.sourceBindings.speciesId, owner);
        const source = speciesEnrichmentSourceBindings({ kind, id, revision, data }, owner.projectId);
        await identity(); assertEnrichmentWriter(owner);
        return store.speciesEnrichment.stage(owner.id, candidateId, expectedTargetDataHash, source);
      } catch (error) { throw record(error); }
    }); },
    connect(input) { return run(async () => {
      const previousConnection = connection;
      let accepted = false;
      try {
        const baseUrl = serverIdentity(input.baseUrl, allowLoopbackHttp);
        const reuseDevice = active?.baseUrl === baseUrl && active.user.username === input.username?.toLowerCase()
          && credentials?.deviceToken && Date.parse(credentials.deviceExpiresAt) > Date.now();
        const result = await request(baseUrl, "auth/login", { method: "POST", data: { username: input.username, password: input.password,
          ...(reuseDevice ? {} : { deviceLabel: "Arten-Explorer Desktop" }), scope: "full" } });
        if (result.status !== 200) throw responseError(result.status);
        check(result.value.user && typeof result.value.projectId === "string" && typeof result.value.token === "string", 502, "invalid_response", "Die Anmeldung ist unvollständig.");
        accepted = true;
        editorialPreviews.clear();
        const prior = active;
        active = store.bind({ baseUrl, projectId: result.value.projectId, user: result.value.user });
        if (prior?.id !== active.id) credentials = null;
        await persist(result.value);
        connection = "online"; lastError = null;
        await pull();
        return safeStatus();
      } catch (error) {
        const problem = record(error);
        if (!accepted && credentials) connection = previousConnection;
        throw problem;
      }
    }); },
    disconnect() { return run(async () => {
      editorialPreviews.clear();
      let remoteLogoutConfirmed = false;
      if (active && credentials) {
        try {
          if (credentials.deviceId && credentials.scope === "full") {
            const revoked = await request(active.baseUrl, `auth/devices/${credentials.deviceId}`, { method: "DELETE", token: credentials.sessionToken });
            remoteLogoutConfirmed = revoked.status === 200;
          }
          const response = await request(active.baseUrl, "auth/logout", { method: "POST", token: credentials.sessionToken, data: { revokeDevice: true } });
          remoteLogoutConfirmed = response.status === 200 || remoteLogoutConfirmed;
        }
        catch { /* Local logout must remain possible while offline. */ }
        await credentialStore.delete(credentialKey(active));
      }
      credentials = null; connection = "disconnected"; lastError = null;
      return { ...safeStatus(), remoteLogoutConfirmed };
    }); },
    status() { return run(() => safeStatus()); },
    capabilities() { return run(async () => {
      try {
        await identity();
        const binding = { id: active.id, baseUrl: active.baseUrl, projectId: active.projectId, userId: active.userId, role: active.user.role };
        const result = await authenticated("capabilities", { method: "GET" });
        check(result.status !== 404, 409, "species_record_server_required", "Der Projektdienst benötigt zuerst die Unterstützung vollständiger Artdatensätze.");
        if (result.status !== 200) throw actionError(result);
        const value = capabilityData(result.value);
        await identity();
        const current = store.active();
        check(active?.id === binding.id && current?.id === binding.id && current.user?.role === binding.role
          && active.baseUrl === binding.baseUrl && active.projectId === binding.projectId && active.userId === binding.userId
          && active.user.role === binding.role && credentials?.baseUrl === binding.baseUrl
          && credentials.projectId === binding.projectId && credentials.userId === binding.userId,
        409, "project_changed", "Projekt, Person oder Rolle wurden während des Fähigkeitenabrufs geändert. Bitte erneut prüfen.");
        return value;
      } catch (error) { throw record(error); }
    }); },
    previewPageEditorial(pageId, speciesId) { return run(async () => {
      try {
        pruneEditorialPreviews();
        check(editorialPreviews.size < EDITORIAL_PREVIEW_LIMIT, 429, "editorial_preview_limit", "Es sind bereits 64 redaktionelle Vorschauen offen. Bitte eine übernehmen oder den Ablauf abwarten.");
        const { binding, candidate, beforeEditorial } = await editorialCandidate(pageId, speciesId);
        const now = pruneEditorialPreviews(), token = randomUUID(), expiresAt = new Date(Date.now() + EDITORIAL_PREVIEW_TTL).toISOString();
        const copy = value => JSON.parse(canonicalJson(value, { maxBytes: 2 * 1024 * 1024, maxNodes: 300000 }));
        const result = { token, expiresAt, sourceBindings: copy(candidate.intent.sourceBindings), beforeEditorial: copy(beforeEditorial),
          proposedEditorial: copy(candidate.data.editorial), readerApproved: false, externalPublication: "not-performed" };
        editorialPreviews.set(token, { binding, pageId, speciesId, hash: editorialCandidateHash(candidate), createdAt: now, deadline: now + EDITORIAL_PREVIEW_TTL });
        lastError = null; return result;
      } catch (error) { throw record(error); }
    }); },
    adoptPageEditorial(token) { return run(async () => {
      try {
        pruneEditorialPreviews();
        const preview = typeof token === "string" ? editorialPreviews.get(token) : null;
        check(preview, 409, "editorial_preview_required", "Bitte die aktuelle redaktionelle Übernahme zuerst erneut ansehen und bestätigen.");
        const { candidate } = await editorialCandidate(preview.pageId, preview.speciesId, preview.binding);
        assertEditorialScope(preview.binding);
        const now = pruneEditorialPreviews();
        check(editorialPreviews.get(token) === preview && now < preview.deadline, 409, "editorial_preview_required", "Die redaktionelle Vorschau ist abgelaufen. Bitte erneut prüfen.");
        check(editorialCandidateHash(candidate) === preview.hash, 409, "editorial_adoption_changed", editorialChangedMessage);
        // Synchronous transaction rechecks both source heads and own queue. A
        // failed stage retains the preview; it never silently supersedes work.
        const result = store.stageEditorialAdoption(preview.binding.bindingId, { data: candidate.data, intent: candidate.intent });
        editorialPreviews.delete(token); lastError = null;
        return { ...result, readerApproved: false, externalPublication: "not-performed" };
      } catch (error) { throw record(error); }
    }); },
    cancelPageEditorial(changeId) { return run(async () => {
      try { return await cancelEditorial(changeId); } catch (error) { throw record(error); }
    }); },
    backupProjectIds() { return run(() => store.projectIds()); },
    listObjects() { return run(() => active && credentials ? store.list(active.id, { readOnly: readOnly() }) : []); },
    getObject(kind, id, { serverOnly = false, requiredBinding } = {}) { return run(() => {
      check(active && credentials, 401, "authentication_required", "Bitte zuerst am Projekt anmelden.");
      assertActionBinding(requiredBinding);
      return store.get(active.id, kind, id, { readOnly: readOnly(), serverOnly });
    }); },
    editExistingObject(kind, id, data, { baseRevision, expectedDataHash, expectedLocalReview, requiredBinding } = {}) { return run(() => {
      check(active && credentials && !readOnly() && ["admin", "publisher", "contributor"].includes(active.user.role),
        403, "forbidden", "Für diese lokale Bearbeitung fehlt eine passende Anmeldung.");
      assertActionBinding(requiredBinding);
      if (kind === "species") validateSharedSpecies(data, id);
      else check(typeof data?.title === "string" && data.title.trim() && data.title.length <= 500, 400, "invalid_data", "Ein gültiger Seitentitel ist erforderlich.");
      const current = store.get(active.id, kind, id);
      if (kind === "species") guardSpeciesRecordTransition({ objectId: id, before: current.data, next: data });
      imageMedia.requireReferences(data);
      check(expectedDataHash === undefined || expectedDataHash === digest(objectJson(current.data)), 409, "local_object_changed", "Der lokale gemeinsame Seitenstand wurde inzwischen geändert.");
      check(baseRevision === undefined || typeof baseRevision === "string" && baseRevision.length <= 80, 400, "invalid_revision", "Ungültige belegte Ausgangsversion.");
      return store.edit(active.id, kind, id, data, { baseRevision, expectedLocalReview });
    }); },
    sync({ kind, id, requiredBinding } = {}) { return run(async () => {
      try {
        check(kind === undefined && id === undefined || ["page", "species"].includes(kind) && typeof id === "string" && /^[a-z0-9-]+$/.test(id), 400, "invalid_object", "Ungültige seitenweise Abgleichauswahl.");
        assertActionBinding(requiredBinding);
        await identity(); assertActionBinding(requiredBinding);
        const pending = store.pending(active.id).filter((entry) => kind === undefined || entry.kind === kind && entry.object_id === id);
        if (pending.length && (credentials.scope !== "full" || !["admin", "publisher", "contributor"].includes(active.user.role))) {
          await pull();
          connection = "forbidden"; throw responseError(403);
        }
        const blocked = new Set(), speciesEnrichmentResults = [];
        for (const row of pending) {
          const key = `${row.kind}/${row.object_id}`;
          if (row.state === "conflict") {
            const bindingId = active.id;
            const { value, expectedStamp } = await readKnownConflict(bindingId, row);
            store.refreshConflict(bindingId, row.change_id, value, expectedStamp);
            blocked.add(key); continue;
          }
          if (blocked.has(key)) continue;
          if (store.editorialCancellationPending(active.id, row.change_id)) {
            // Resuming a requested cancellation must never dispatch its old
            // adoption, even when the first cancel failed before delivery.
            const result = await cancelEditorial(row.change_id);
            if (!result.refreshConfirmed) return { ...safeStatus(), refreshConfirmed: false, warning: result.warning };
            if (result.conflict) blocked.add(key);
            continue;
          }
          const change = store.prepare(row.change_id);
          if (Object.hasOwn(change, "candidateId")) { speciesEnrichmentResults.push(await syncEnrichment(change, active)); continue; }
          await imageMedia.ensureReferences(change.data);
          const result = await authenticated("changes", { method: "POST", data: change });
          if (result.status === 200 && result.value.status === "applied") store.acknowledge(active.id, row.change_id,
            change.intent ? reviewedEditorialObject(change, result.value.object) : objectData(result.value.object));
          else if (result.status === 200 && result.value.status === "cancelled" && change.intent) {
            check(result.value.changeId === row.change_id, 502, "invalid_response", "Die Abbruchbestätigung gehört nicht zu diesem redaktionellen Entwurf.");
            store.cancelEditorialChange(active.id, row.change_id);
          }
          else if (result.status === 409 && result.value.status === "conflict" && typeof result.value.conflictId === "string") {
            if (change.intent) check(/^[a-f0-9-]+$/.test(result.value.conflictId), 502, "invalid_response", "Die redaktionelle Konfliktkennung wurde nicht gültig bestätigt.");
            const conflict = await authenticated(`conflicts/${result.value.conflictId}`);
            if (conflict.status !== 200) throw responseError(conflict.status);
            store.saveConflict(active.id, row.change_id, change.intent ? reviewedEditorialConflict(change, conflict.value, result.value.conflictId) : conflictData(conflict.value)); blocked.add(key);
          } else throw change.intent ? actionError(result) : responseError(result.status);
        }
        await pull(); lastError = null;
        return { ...safeStatus(), ...(speciesEnrichmentResults.length ? { speciesEnrichmentResults } : {}) };
      } catch (error) { throw record(error); }
    }); },
    refresh() { return run(async () => {
      try { await identity(); await pull(); await pullKnownConflicts(); lastError = null; return safeStatus(); }
      catch (error) { throw record(error); }
    }); },
    createObject(input) { return run(async () => {
      try {
        if (input.kind === "species") validateSharedSpecies(input.data, input.id);
        const { requiredBinding, ...request } = input;
        imageMedia.requireReferences(input.data);
        assertActionBinding(requiredBinding);
        await imageMedia.ensureReferences(input.data);
        if (input.boundSpeciesCreation === true) {
          check(requiredBinding && Number.isSafeInteger(requiredBinding.userVersion) && requiredBinding.userVersion > 0
            && typeof requiredBinding.role === "string", 400, "invalid_species_creation", "Die Artanlage benötigt ihre geprüfte Projekt-, Personen- und Berechtigungsfassung.");
          request.expectedProjectId = requiredBinding.projectId; request.expectedUserId = requiredBinding.userId;
          request.expectedRole = requiredBinding.role; request.expectedUserVersion = requiredBinding.userVersion;
        }
        if (input.requireAdmin === true) {
          check(requiredBinding && typeof requiredBinding.projectId === "string" && typeof requiredBinding.userId === "string", 400, "invalid_import_binding", "Der administrative Import benötigt seine geprüfte Projekt- und Personenbindung.");
          request.expectedProjectId = requiredBinding.projectId; request.expectedUserId = requiredBinding.userId;
        }
        const value = objectData(await onlineAction("objects", { method: "POST", data: request }, input.requireAdmin === true ? ["admin"] : undefined, requiredBinding));
        await pull(); return value;
      } catch (error) { throw record(error); }
    }); },
    previewReaderApproval(id, { expectedRevision, expectedDataHash, requiredBinding } = {}) {
      const binding = requiredBinding && { ...requiredBinding };
      return run(async () => {
        try {
          check(binding && typeof expectedDataHash === "string" && /^[a-f0-9]{64}$/.test(expectedDataHash),
            409, "approval_review_changed", "Die Leserprüfung benötigt die vollständige Artfassung und ihre persönliche Bindung.");
          reviewedSpeciesApproval(id, expectedRevision, expectedDataHash, binding);
          await identity(); ensureOpen(); assertActionBinding(binding, "approval_review_changed");
          check(!readOnly() && ["admin", "publisher"].includes(active.user.role), 403, "forbidden", "Die Leserprüfung benötigt eine volle Anmeldung mit Freigaberecht.");
          const support = await authenticated("capabilities");
          check(support.status !== 404, 409, "reader_catalog_version_required", "Der gemeinsame Dienst benötigt zuerst die erweiterte Leserprüfung.");
          if (support.status !== 200) throw actionError(support);
          check(support.value?.boundReaderApproval === 2 && Array.isArray(support.value.readerCatalogVersions) && support.value.readerCatalogVersions.includes(2),
            409, "reader_catalog_version_required", "Der gemeinsame Dienst bestätigt die erweiterte Leserprüfung noch nicht.");
          check(support.value.projectId === binding.projectId && support.value.user?.id === binding.userId && support.value.user.role === binding.role,
            409, "approval_review_changed", "Die persönliche Bindung der Leserprüfung wurde geändert.");
          reviewedSpeciesApproval(id, expectedRevision, expectedDataHash, binding);
          const response = await authenticated(`species/${id}/approval-preview`, { apiVersion: 2, method: "POST", data: { expectedRevision, expectedDataHash } });
          if (response.status !== 200) throw actionError(response);
          const result = validateReaderApprovalPreview(response.value, { ...binding, speciesId: id, revision: expectedRevision, dataHash: expectedDataHash });
          await identity(); ensureOpen(); reviewedSpeciesApproval(id, expectedRevision, expectedDataHash, binding);
          return result;
        } catch (error) { throw record(error); }
      });
    },
    approveObject(kind, id, { expectedRevision, requireAdmin = false, requiredBinding, expectedDataHash, readerCatalogVersion = 1, expectedReaderHash } = {}) {
      const binding = requiredBinding && { ...requiredBinding };
      return run(async () => {
      try {
        const cached = store.get(active?.id, kind, id);
        check(readerCatalogVersion === 1 || kind === "species" && readerCatalogVersion === 2 && !requireAdmin
          && typeof expectedReaderHash === "string" && /^[a-f0-9]{64}$/.test(expectedReaderHash),
        400, "invalid_approval_binding", "Die erweiterte Leserfreigabe benötigt ihren ausdrücklich geprüften Inhaltsbeleg.");
        const reviewed = expectedDataHash !== undefined || !requireAdmin && kind === "species" && cached.data?.type === SPECIES_RECORD_TYPE;
        if (requireAdmin) check(binding && typeof binding.projectId === "string" && typeof binding.userId === "string", 400, "invalid_import_binding", "Die administrative Freigabe benötigt ihre geprüfte Projekt- und Personenbindung.");
        let value;
        const request = { expectedRevision, ...(requireAdmin ? { requireAdmin: true, expectedProjectId: binding.projectId, expectedUserId: binding.userId } : {}),
          ...(readerCatalogVersion === 2 ? { readerCatalogVersion: 2, expectedReaderHash } : {}) };
        if (reviewed) {
          check(kind === "species" && typeof expectedDataHash === "string" && /^[a-f0-9]{64}$/.test(expectedDataHash)
            && binding && ["baseUrl", "projectId", "userId", "role"].every((key) => typeof binding[key] === "string" && binding[key].length > 0),
          409, "approval_review_changed", "Die interne Artfreigabe benötigt ihre vollständig geprüfte Inhalts-, Projekt-, Personen- und Rollenbindung.");
          reviewedSpeciesApproval(id, expectedRevision, expectedDataHash, binding);
          await identity(); assertActionBinding(binding, "approval_review_changed");
          check(!readOnly() && (requireAdmin ? ["admin"] : ["admin", "publisher"]).includes(active.user.role), 403, "forbidden", "Für die interne Freigabe fehlt eine volle berechtigte Anmeldung.");
          reviewedSpeciesApproval(id, expectedRevision, expectedDataHash, binding);
          const support = await authenticated("capabilities", { method: "GET" });
          check(support.status !== 404, 409, "approval_binding_server_required", "Der Projektdienst benötigt zuerst die gebundene interne Artfreigabe. Es wurde nichts freigegeben.");
          if (support.status !== 200) throw actionError(support);
          check(support.value?.schemaVersion === 1 && support.value.boundSpeciesApproval === 1, 409, "approval_binding_server_required", "Der Projektdienst bestätigt die gebundene interne Artfreigabe noch nicht. Es wurde nichts freigegeben.");
          check(readerCatalogVersion !== 2 || support.value.boundReaderApproval === 2 && Array.isArray(support.value.readerCatalogVersions)
            && support.value.readerCatalogVersions.includes(2), 409, "reader_catalog_version_required", "Der gemeinsame Dienst unterstützt diese erweiterte Leserfreigabe noch nicht.");
          check(support.value.projectId === binding.projectId && support.value.user?.id === binding.userId && support.value.user.role === binding.role,
            409, "approval_review_changed", "Projekt, Person oder Rolle wurden seit der Freigabevorschau geändert. Bitte neu prüfen.");
          reviewedSpeciesApproval(id, expectedRevision, expectedDataHash, binding);
          request.expectedReview = { projectId: binding.projectId, userId: binding.userId, role: binding.role };
          const result = await authenticated(`objects/${kind}/${id}/approve`, { method: "POST", data: request });
          if (result.status !== 200) {
            if (result.status === 409 && result.value?.error?.code === "object_changed") throw new ProjectError(409, "approval_review_changed", "Die Serverfassung wurde seit der Freigabevorschau geändert. Bitte neu prüfen.");
            throw actionError(result);
          }
          value = objectData(result.value);
          check(value.kind === kind && value.id === id && value.revision === expectedRevision && value.approvedRevision === expectedRevision
            && value.approval === "approved" && digest(objectJson(value.data)) === expectedDataHash,
          502, "invalid_approval_response", "Die interne Freigabe wurde nicht für die exakt geprüfte Artfassung bestätigt. Bitte den Serverstand lesen.");
        } else {
          check(!cached.localPending && !cached.localConflict && cached.revision === expectedRevision, 409, "pending_review",
            "Bitte lokale Änderungen zuerst abgleichen und die aktuelle Fassung prüfen.");
          value = objectData(await onlineAction(`objects/${kind}/${id}/approve`, { method: "POST", data: request }, requireAdmin ? ["admin"] : ["admin", "publisher"], binding));
        }
        await pull();
        const current = store.get(active.id, kind, id, { readOnly: readOnly(), serverOnly: true });
        return { ...value, localPending: Boolean(current.localPending), localConflict: Boolean(current.localConflict), internalOnly: true, externalPublication: "not-performed" };
      } catch (error) { throw record(error); }
      });
    },
    listUsers() { return run(async () => {
      try {
        const value = await onlineAction("users", { method: "GET" }, ["admin"]);
        return value.users.map(({ id, username, displayName, role, blocked, version }) => ({ id, username, displayName, role, blocked, version }));
      } catch (error) { throw record(error); }
    }); },
    createUser(input) { return run(async () => {
      try {
        const value = await onlineAction("users", { method: "POST", data: input }, ["admin"]);
        const { id, username, displayName, role, blocked, version } = value;
        return { id, username, displayName, role, blocked, version };
      } catch (error) { throw record(error); }
    }); },
    updateUser(id, input) { return run(async () => {
      try {
        const value = await onlineAction(`users/${id}`, { method: "PATCH", data: input }, ["admin"]);
        if (value.id === active.userId) {
          store.updateUser(active.id, value); active = store.active();
          if (value.blocked) await forget(); else await pull();
        }
        return { id: value.id, username: value.username, displayName: value.displayName, role: value.role, blocked: value.blocked, version: value.version };
      } catch (error) { throw record(error); }
    }); },
    listDevices() { return run(async () => {
      try {
        const result = await authenticated("auth/devices");
        if (result.status !== 200) throw actionError(result);
        return result.value.devices.map(({ id, label, expiresAt, revoked, createdAt }) => ({ id, label, expiresAt, revoked, createdAt }));
      } catch (error) { throw record(error); }
    }); },
    issueReadPairing(input) { return run(async () => {
      try {
        check(input && Object.keys(input).length === 2 && typeof input.projectId === "string" && typeof input.userId === "string",
          400, "invalid_pairing", "Bitte zuerst das angezeigte Projekt und die angemeldete Person prüfen.");
        await identity();
        check(active.projectId === input.projectId && active.userId === input.userId,
          409, "project_changed", "Projekt oder Person haben sich geändert. Bitte die Geräteverwaltung neu öffnen.");
        check(credentials.scope === "full", 403, "forbidden", "Bitte zuerst vollständig anmelden.");
        const result = await authenticated("auth/pairing", { method: "POST", data: {} });
        check(result.status !== 404, 409, "pairing_server_required", "Der Projektdienst benötigt zuerst die Unterstützung für Geräteeinladungen.");
        if (result.status !== 201) throw actionError(result);
        const current = store.active();
        check(current?.id === active.id && current.user?.version === active.user.version,
          409, "project_changed", "Projekt oder Person haben sich geändert. Bitte die Geräteverwaltung neu öffnen.");
        const { schemaVersion, code, projectId, expiresAt } = result.value;
        check(schemaVersion === 1 && tokenHash(code, "p") && projectId === active.projectId
          && typeof expiresAt === "string" && Number.isFinite(Date.parse(expiresAt)),
        502, "invalid_response", "Die Geräteeinladung ist nicht eindeutig bestätigt.");
        return { schemaVersion, code, projectId, expiresAt, server: active.baseUrl };
      } catch (error) { throw record(error); }
    }); },
    revokeDevice(id) { return run(async () => {
      try {
        const value = await onlineAction(`auth/devices/${id}`, { method: "DELETE" }, ["admin", "publisher", "contributor", "reader"]);
        if (id === credentials?.deviceId) await forget();
        return { revoked: value.revoked === true };
      } catch (error) { throw record(error); }
    }); },
    changePassword(input) { return run(async () => {
      try {
        await identity();
        check(credentials.scope === "full", 403, "forbidden", "Bitte zuerst vollständig anmelden.");
        const result = await request(active.baseUrl, "auth/password", { method: "POST", token: credentials.sessionToken, data: input });
        if (result.status === 401) throw new ProjectError(401, "password_not_changed", "Das bisherige Passwort oder die Anmeldung muss erneut geprüft werden.");
        if (result.status !== 200) throw actionError(result);
        await forget(); return { changed: true, loginRequired: true };
      } catch (error) { throw record(error); }
    }); },
    listConflicts({ requiredBinding } = {}) { return run(() => {
      assertActionBinding(requiredBinding);
      if (!active) return [];
      check(!readOnly() && ["admin", "publisher", "contributor"].includes(active.user.role), 403, "forbidden", "Die Konflikte benötigen eine passende redaktionelle Anmeldung.");
      return store.conflicts(active.id);
    }); },
    resolveConflict(id, { strategy, data, expectedRevision, requiredBinding, expectedLocalVersions } = {}) { return run(async () => {
      try {
        await identity(); assertActionBinding(requiredBinding, "conflict_review_changed");
        check(!readOnly() && ["admin", "publisher", "contributor"].includes(active.user.role), 403, "forbidden", "Die Konfliktentscheidung benötigt eine passende redaktionelle Anmeldung.");
        if (requiredBinding) {
          const support = await authenticated("capabilities", { method: "GET" });
          check(support.status !== 404, 409, "conflict_binding_server_required", "Der Projektdienst benötigt zuerst die gebundene Artkonfliktprüfung. Es wurde nichts übertragen.");
          if (support.status !== 200) throw actionError(support);
          check(support.value?.schemaVersion === 1 && support.value.boundConflictReview === 1, 409, "conflict_binding_server_required",
            "Der Projektdienst bestätigt die gebundene Artkonfliktprüfung noch nicht. Es wurde nichts übertragen.");
          check(support.value.projectId === requiredBinding.projectId && support.value.user?.id === requiredBinding.userId
            && support.value.user.role === (requiredBinding.role ?? active.user.role), 409, "conflict_review_changed",
          "Projekt, Person oder Rolle wurden seit der Konfliktvorschau geändert. Bitte neu vergleichen; alle Fassungen bleiben erhalten.");
        }
        store.assertConflictVersions(active.id, id, expectedLocalVersions);
        const conflict = store.conflicts(active.id).find((entry) => entry.id === id);
        check(conflict, 404, "conflict_not_found", "Dieser Konflikt ist lokal nicht vorhanden.");
        check(["current", "proposed", "merged"].includes(strategy) && (strategy !== "merged" || data && typeof data === "object"),
          400, "invalid_resolution", "Bitte eine vollständige Konfliktentscheidung angeben.");
        if (strategy === "merged") {
          if (conflict.kind === "species") validateSharedSpecies(data, conflict.objectId);
          else check(typeof data.title === "string" && data.title.trim() && data.title.length <= 500, 400, "invalid_data", "Ein gültiger Seitentitel ist erforderlich.");
          objectJson(data);
        }
        check(conflict.localVersions.length <= 1 || strategy === "merged" && data || strategy === "current" && expectedLocalVersions !== undefined,
          409, "followup_decision_required", "Weitere lokale Fassungen sind erhalten. Bitte einen gemeinsamen Zieltext ausdrücklich festlegen.");
        const current = await authenticated(`objects/${conflict.kind}/${conflict.objectId}`);
        if (current.status !== 200) throw responseError(current.status);
        if (conflict.kind === "species" && strategy !== "current") guardSpeciesRecordTransition({ objectId: conflict.objectId,
          before: current.value.data, next: strategy === "proposed" ? conflict.proposed : data });
        check(expectedRevision === undefined || current.value.revision === expectedRevision, 409, "object_changed",
          "Die Serverfassung wurde seit der Anzeige geändert. Bitte erneut laden und vergleichen.");
        if (conflict.resolvedAt) {
          check(["current", "proposed", "merged"].includes(strategy), 400, "invalid_resolution", "Eine ausdrückliche Konfliktentscheidung ist erforderlich.");
          const chosen = strategy === "current" ? undefined : strategy === "proposed" ? conflict.proposed : data;
          return store.rebaseResolvedConflict(active.id, id, objectData(current.value), chosen, { expectedLocalVersions });
        }
        store.assertConflictVersions(active.id, id, expectedLocalVersions);
        const result = await authenticated(`conflicts/${id}/resolve`, { method: "POST", data: {
          expectedRevision: current.value.revision, strategy, ...(data === undefined ? {} : { data }),
          ...(requiredBinding ? { expectedProjectId: requiredBinding.projectId, expectedUserId: requiredBinding.userId,
            expectedRole: requiredBinding.role ?? active.user.role } : {}) } });
        if (result.status !== 200) throw actionError(result);
        store.resolve(active.id, id, { conflict: conflictData(result.value.conflict), object: objectData(result.value.object) }, { expectedLocalVersions }); lastError = null;
        return store.get(active.id, conflict.kind, conflict.objectId);
      } catch (error) { throw record(error); }
    }); },
    async close() {
      if (closed) return;
      closing = true;
      editorialPreviews.clear();
      for (const controller of requests) controller.abort();
      await ready.catch(() => {}); await chain;
      store.close(); closed = true; connection = "closed"; credentials = null;
    }
  };
  client.list = client.listObjects;
  client.resolveConflicts = client.resolveConflict;
  return client;
}
