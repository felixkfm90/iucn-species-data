import { createSharedProjectClientStore } from "./client-store.mjs";
import { SPECIES_RECORD_TYPE, validateSpeciesRecord, validateSharedSpecies, guardSpeciesRecordTransition } from "./species-record.mjs";
import { canonicalJson, objectJson, transportJson, digest } from "./security.mjs";
import { validateWebsiteAltObject, WEBSITE_ALT_TYPE } from "./website-alt-sync.mjs";
import { PAGE_AUTHORING_TYPE, validatePageAuthoringServerEvidence } from "../page-authoring/shared.mjs";
import { check, ProjectError } from "./errors.mjs";

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
  fetchImpl = globalThis.fetch, allowLoopbackHttp = false, requestTimeoutMs = 15000 } = {}) {
  check(credentialStore && ["get", "set", "delete"].every((key) => typeof credentialStore[key] === "function"),
    400, "invalid_credentials", "Ein sicherer Anmeldespeicher ist erforderlich.");
  const store = createSharedProjectClientStore({ filename, localStorageConfirmed });
  let active = store.active(), credentials = null, connection = "disconnected", lastError = null, closing = false, closed = false;
  let chain = Promise.resolve();
  const requests = new Set();
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
  async function request(baseUrl, pathname, { method = "GET", token, data } = {}) {
    ensureOpen();
    const controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/api/v1/${pathname}`, { method, redirect: "manual", signal: controller.signal,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
          ...([WEBSITE_ALT_TYPE, PAGE_AUTHORING_TYPE].includes(data?.data?.type) ? { "X-Shared-Object-Type": data.data.type } : {}) },
        body: data === undefined ? undefined : transportJson(data) });
      check(response.status < 300 || response.status >= 400, 502, "redirect_rejected", "Der Dienst verweist auf eine andere Adresse. Die Anmeldung wurde nicht weitergegeben.");
      check(response.url === "" || new URL(response.url).origin === baseUrl, 502, "redirect_rejected", "Eine fremde Antwortadresse wurde abgewiesen.");
      const limit = pathname.startsWith("objects/page") ? 4 * 1024 * 1024
        : /^conflicts\/[a-f0-9-]+\/resolve$/.test(pathname) ? 10 * 1024 * 1024 : 8 * 1024 * 1024;
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
      let value;
      try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* checked below */ }
      check(value && typeof value === "object", 502, "invalid_response", "Der Dienst hat keine lesbare Antwort geliefert.");
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
  async function pullKnownConflicts() {
    if (readOnly() || !["admin", "publisher", "contributor"].includes(active.user.role)) return;
    const bindingId = active.id, staged = [];
    for (const row of store.pending(bindingId).filter((entry) => entry.state === "conflict")) {
      const expectedStamp = store.conflictStamp(bindingId, row.conflict_id);
      const response = await authenticated(`conflicts/${row.conflict_id}`);
      if (response.status !== 200) throw responseError(response.status);
      const value = conflictData(response.value);
      check(value.id === row.conflict_id && value.kind === row.kind && value.objectId === row.object_id,
        502, "invalid_response", "Der geladene Konflikt gehört nicht zur angefragten lokalen Fassung.");
      staged.push({ row, value, expectedStamp });
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
      object_changed: "Die Objektversion wurde inzwischen geändert. Bitte vor der Freigabe erneut prüfen.",
      conflict_review_changed: "Projekt, Person oder Rolle wurden während der Konfliktentscheidung geändert. Bitte neu vergleichen; alle Fassungen bleiben erhalten.",
      approval_review_changed: "Artfassung, Projekt, Person oder Rolle wurden seit der Freigabevorschau geändert. Bitte neu prüfen; alle Entwürfe bleiben erhalten." };
    const code = result.value?.error?.code;
    return messages[code] ? new ProjectError(result.status, code, messages[code]) : responseError(result.status);
  }
  function assertActionBinding(requiredBinding, code = "import_project_changed") {
    if (requiredBinding !== undefined) check(requiredBinding && requiredBinding.baseUrl === active.baseUrl && requiredBinding.projectId === active.projectId
      && requiredBinding.userId === active.user.id && (requiredBinding.role === undefined || requiredBinding.role === active.user.role),
    409, code, "Projekt, angemeldete Person oder Berechtigung wurden während der Prüfung gewechselt. Der Schreibschritt wurde angehalten.");
  }
  async function onlineAction(pathname, options, roles = ["admin", "publisher", "contributor"], requiredBinding) {
    await identity(); assertActionBinding(requiredBinding);
    check(credentials.scope === "full" && roles.includes(active.user.role), 403, "forbidden", "Für diese Aktion fehlt eine volle berechtigte Anmeldung.");
    const result = await authenticated(pathname, options);
    if (![200, 201].includes(result.status)) throw actionError(result);
    return result.value;
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
    connect(input) { return run(async () => {
      try {
        const baseUrl = serverIdentity(input.baseUrl, allowLoopbackHttp);
        const reuseDevice = active?.baseUrl === baseUrl && active.user.username === input.username?.toLowerCase()
          && credentials?.deviceToken && Date.parse(credentials.deviceExpiresAt) > Date.now();
        const result = await request(baseUrl, "auth/login", { method: "POST", data: { username: input.username, password: input.password,
          ...(reuseDevice ? {} : { deviceLabel: "Arten-Explorer Desktop" }), scope: "full" } });
        if (result.status !== 200) throw responseError(result.status);
        check(result.value.user && typeof result.value.projectId === "string" && typeof result.value.token === "string", 502, "invalid_response", "Die Anmeldung ist unvollständig.");
        const prior = active;
        active = store.bind({ baseUrl, projectId: result.value.projectId, user: result.value.user });
        if (prior?.id !== active.id) credentials = null;
        await persist(result.value);
        connection = "online"; lastError = null;
        await pull();
        return safeStatus();
      } catch (error) { throw record(error); }
    }); },
    disconnect() { return run(async () => {
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
        await identity(); const result = await authenticated("capabilities", { method: "GET" });
        check(result.status !== 404, 409, "species_record_server_required", "Der Projektdienst benötigt zuerst die Unterstützung vollständiger Artdatensätze.");
        if (result.status !== 200) throw actionError(result);
        const value = result.value;
        check(value?.schemaVersion === 1 && value.projectId === active.projectId && value.user?.id === active.user.id
          && value.user.role === active.user.role && value.speciesRecordVersion === 1 && value.adminBoundImport === true,
        502, "invalid_response", "Die Fähigkeiten des Projektdiensts sind nicht eindeutig bestätigt.");
        return { schemaVersion: 1, projectId: value.projectId, user: { id: value.user.id, role: value.user.role }, speciesRecordVersion: 1, adminBoundImport: true };
      } catch (error) { throw record(error); }
    }); },
    backupProjectIds() { return run(() => store.projectIds()); },
    listObjects() { return run(() => active && credentials ? store.list(active.id, { readOnly: readOnly() }) : []); },
    getObject(kind, id, { serverOnly = false } = {}) { return run(() => {
      check(active && credentials, 401, "authentication_required", "Bitte zuerst am Projekt anmelden.");
      return store.get(active.id, kind, id, { readOnly: readOnly(), serverOnly });
    }); },
    editExistingObject(kind, id, data, { baseRevision, expectedDataHash } = {}) { return run(() => {
      check(active && credentials && !readOnly() && ["admin", "publisher", "contributor"].includes(active.user.role),
        403, "forbidden", "Für diese lokale Bearbeitung fehlt eine passende Anmeldung.");
      if (kind === "species") validateSharedSpecies(data, id);
      else check(typeof data?.title === "string" && data.title.trim() && data.title.length <= 500, 400, "invalid_data", "Ein gültiger Seitentitel ist erforderlich.");
      const current = store.get(active.id, kind, id);
      if (kind === "species") guardSpeciesRecordTransition({ objectId: id, before: current.data, next: data });
      check(expectedDataHash === undefined || expectedDataHash === digest(objectJson(current.data)), 409, "local_object_changed", "Der lokale gemeinsame Seitenstand wurde inzwischen geändert.");
      check(baseRevision === undefined || typeof baseRevision === "string" && baseRevision.length <= 80, 400, "invalid_revision", "Ungültige belegte Ausgangsversion.");
      return store.edit(active.id, kind, id, data, { baseRevision });
    }); },
    sync({ kind, id } = {}) { return run(async () => {
      try {
        check(kind === undefined && id === undefined || ["page", "species"].includes(kind) && typeof id === "string" && /^[a-z0-9-]+$/.test(id), 400, "invalid_object", "Ungültige seitenweise Abgleichauswahl.");
        await identity();
        const pending = store.pending(active.id).filter((entry) => kind === undefined || entry.kind === kind && entry.object_id === id);
        if (pending.length && (credentials.scope !== "full" || !["admin", "publisher", "contributor"].includes(active.user.role))) {
          await pull();
          connection = "forbidden"; throw responseError(403);
        }
        const blocked = new Set();
        for (const row of pending) {
          const key = `${row.kind}/${row.object_id}`;
          if (row.state === "conflict") {
            const refreshed = await authenticated(`conflicts/${row.conflict_id}`);
            if (refreshed.status !== 200) throw responseError(refreshed.status);
            store.saveConflict(active.id, row.change_id, conflictData(refreshed.value));
            blocked.add(key); continue;
          }
          if (blocked.has(key)) continue;
          const change = store.prepare(row.change_id);
          const result = await authenticated("changes", { method: "POST", data: change });
          if (result.status === 200 && result.value.status === "applied") store.acknowledge(active.id, row.change_id, objectData(result.value.object));
          else if (result.status === 409 && result.value.status === "conflict" && typeof result.value.conflictId === "string") {
            const conflict = await authenticated(`conflicts/${result.value.conflictId}`);
            if (conflict.status !== 200) throw responseError(conflict.status);
            store.saveConflict(active.id, row.change_id, conflictData(conflict.value)); blocked.add(key);
          } else throw responseError(result.status);
        }
        await pull(); lastError = null; return safeStatus();
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
        if (input.requireAdmin === true) {
          check(requiredBinding && typeof requiredBinding.projectId === "string" && typeof requiredBinding.userId === "string", 400, "invalid_import_binding", "Der administrative Import benötigt seine geprüfte Projekt- und Personenbindung.");
          request.expectedProjectId = requiredBinding.projectId; request.expectedUserId = requiredBinding.userId;
        }
        const value = objectData(await onlineAction("objects", { method: "POST", data: request }, input.requireAdmin === true ? ["admin"] : undefined, requiredBinding));
        await pull(); return value;
      } catch (error) { throw record(error); }
    }); },
    approveObject(kind, id, { expectedRevision, requireAdmin = false, requiredBinding, expectedDataHash } = {}) {
      const binding = requiredBinding && { ...requiredBinding };
      return run(async () => {
      try {
        const cached = store.get(active?.id, kind, id);
        const reviewed = expectedDataHash !== undefined || !requireAdmin && kind === "species" && cached.data?.type === SPECIES_RECORD_TYPE;
        if (requireAdmin) check(binding && typeof binding.projectId === "string" && typeof binding.userId === "string", 400, "invalid_import_binding", "Die administrative Freigabe benötigt ihre geprüfte Projekt- und Personenbindung.");
        let value;
        const request = { expectedRevision, ...(requireAdmin ? { requireAdmin: true, expectedProjectId: binding.projectId, expectedUserId: binding.userId } : {}) };
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
    listConflicts() { return run(() => {
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
        check(conflict.localVersions.length <= 1 || strategy === "merged" && data,
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
      for (const controller of requests) controller.abort();
      await ready.catch(() => {}); await chain;
      store.close(); closed = true; connection = "closed"; credentials = null;
    }
  };
  client.list = client.listObjects;
  client.resolveConflicts = client.resolveConflict;
  return client;
}
