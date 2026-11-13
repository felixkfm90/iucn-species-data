import { explorerStoragePaths } from "./storage-paths.mjs";
import { createWebsiteAltStore } from "./website-alt-store.mjs";
import { createWebsiteAltDiscovery } from "./website-alt-discovery.mjs";
import { normalizeWebsitePageUrl } from "./website-alt-parser.mjs";
import { buildWebsiteAltTransferPlan, runWebsiteAltTransfer, websiteAltTransferConnection, loadWebsiteAltTransferReceipt } from "./website-alt-transfer.mjs";

const blocked = (message) => Object.assign(new Error(message), { statusCode: 409 });
const aborted = (signal) => Object.assign(new Error(signal?.reason?.message || "Die Squarespace-Übernahme wurde abgebrochen."), { name: "AbortError" });
function waitForLoginPoll(signal, milliseconds) {
  if (signal.aborted) return Promise.reject(aborted(signal));
  return new Promise((resolve, reject) => {
    const finish = (error) => { clearTimeout(timer); signal.removeEventListener("abort", cancel); error ? reject(error) : resolve(); };
    const cancel = () => finish(aborted(signal));
    const timer = setTimeout(() => finish(), milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

// CMS writes are delegated only to a configured authenticated desktop adapter.
export function createWebsiteAltTextsService({ repoRoot, dataRoot, store,
  discovery = createWebsiteAltDiscovery(), transferAdapter = null, transferTimeoutMs = 180000,
  connectTimeoutMs = 20000, loginTimeoutMs = 120000, loginPollIntervalMs = 1000,
  verificationIntervalMs = 2000, now = () => new Date() } = {}) {
  if (![transferTimeoutMs, connectTimeoutMs, loginTimeoutMs, loginPollIntervalMs].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 600000)
      || loginPollIntervalMs > 5000) {
    throw new TypeError("Begrenzte positive Zeitlimits für die Squarespace-Übernahme erforderlich.");
  }
  if (!Number.isSafeInteger(verificationIntervalMs) || verificationIntervalMs < 1 || verificationIntervalMs > 2000) {
    throw new TypeError("Begrenzter Abstand für die öffentliche Nachprüfung erforderlich.");
  }
  if (transferAdapter && ["connect", "snapshot", "transfer", "close"].some((method) => typeof transferAdapter[method] !== "function")) {
    throw new TypeError("Vollständiger Desktop-Übernahmeadapter erforderlich.");
  }
  const storageRoot = dataRoot || (!store ? explorerStoragePaths({ repoRoot }).dataRoot : null);
  const state = store || createWebsiteAltStore({ dataRoot: storageRoot, now });
  const controllers = new Set();
  const pendingOperations = new Set();
  let currentJob = null, jobKind = "", closed = false, runtime = null, transferRuntime = null, connectRuntime = null, closing = null, keepingExisting = false;
  let connection = websiteAltTransferConnection(transferAdapter);
  const transferring = () => Boolean(currentJob && ["transfer", "connect-transfer"].includes(jobKind));
  const requireOpen = () => { if (closed) throw blocked("Die Website-Bildtextprüfung ist geschlossen."); };
  const requireAdapter = () => { if (!transferAdapter) throw blocked("Die direkte Übernahme benötigt den Desktop-Explorer mit Squarespace-Anmeldung."); };

  async function readConnection() {
    if (!transferAdapter || closed) return connection;
    let timer;
    try {
      const value = await Promise.race([Promise.resolve().then(() => transferAdapter.snapshot()),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("Der Squarespace-Anmeldestatus antwortet noch nicht.")), 5000); })]);
      connection = websiteAltTransferConnection(transferAdapter, value);
    } catch (error) { connection = websiteAltTransferConnection(transferAdapter, { message: error.message }); }
    finally { clearTimeout(timer); }
    return connection;
  }

  async function snapshot() {
    const connected = await readConnection();
    // Bind the result before reading the store. A transfer can finish during
    // either asynchronous read, and a new receipt needs its committed state.
    const outcomeAtRead = transferRuntime, transferRunning = transferring();
    const connecting = Boolean(currentJob && (jobKind === "connect-transfer" || jobKind === "transfer" && transferRuntime?.phase === "connecting"));
    const loginRequired = Boolean(connected.loginRequired || currentJob && jobKind === "transfer"
      && transferRuntime?.phase === "login-required" && !connected.connected);
    const connectionState = connecting ? { ...connected, status: "connecting", message: jobKind === "transfer" ? transferRuntime.message : connectRuntime.message }
      : loginRequired && !connected.connected ? { ...connected, status: "login-required" }
      : !connected.connected && ["failed", "cancelled"].includes(connectRuntime?.status)
        ? { ...connected, status: connectRuntime.status, message: connectRuntime.message } : connected;
    const saved = await state.snapshot();
    let outcome = outcomeAtRead || await loadWebsiteAltTransferReceipt(storageRoot, saved);
    const page = saved.pages?.find((entry) => entry.url === outcome?.pageUrl);
    let staleResult = false;
    const results = (outcome?.results || []).map((entry) => {
      if (entry.status !== "verified") return entry;
      const image = page?.images?.find((item) => item.key === entry.imageKey);
      if (page?.inventoryStatus === "current" && !page.error && image?.status === "verified"
          && entry.approvalRevision && image.approval?.revision === entry.approvalRevision
          && image.verification?.approvalRevision === entry.approvalRevision
          && image.verification?.observationHash === image.observationHash) return entry;
      staleResult = true;
      return { ...entry, status: "verification-pending",
        error: "Der frühere öffentliche Nachweis passt nicht mehr zur aktuellen Freigabe. Bitte erneut prüfen." };
    });
    if (staleResult) outcome = { ...outcome, results, status: outcome.status === "completed" ? "partial" : outcome.status,
      message: "Eine frühere Übernahme ist für die aktuelle Freigabe nicht mehr bestätigt. Bitte die offenen Bildtexte erneut prüfen." };
    return { ...saved, capabilities: { keepExisting: typeof state.keepExisting === "function" },
      scan: { ...saved.scan, ...runtime, running: keepingExisting || Boolean(currentJob && !transferring()) },
      transfer: { ...connectionState, ...outcome, available: connected.available, connected: connected.connected,
        loginRequired, windowOpen: connected.windowOpen, running: transferRunning,
        connectionStatus: connectionState.status, connectionMessage: connectionState.message, results } };
  }

  async function start(kind, operation) {
    if (closed) throw blocked("Die Website-Bildtextprüfung ist geschlossen.");
    if (keepingExisting) throw blocked("Bitte die laufende öffentliche Bildtextprüfung abwarten.");
    if (transferring()) throw blocked("Die Squarespace-Übernahme läuft. Bitte ihren Abschluss abwarten.");
    if (currentJob) return snapshot();
    await state.snapshot(); // Reject corrupt state before issuing any request.
    if (closed) throw blocked("Die Website-Bildtextprüfung ist geschlossen.");
    if (keepingExisting) throw blocked("Bitte die laufende öffentliche Bildtextprüfung abwarten.");
    if (transferring()) throw blocked("Die Squarespace-Übernahme läuft. Bitte ihren Abschluss abwarten.");
    if (currentJob) return snapshot();
    const controller = new AbortController();
    controllers.add(controller);
    jobKind = kind;
    runtime = { kind, startedAt: now().toISOString(), completedAt: null, error: "" };
    currentJob = Promise.resolve().then(() => operation(controller.signal)).catch((error) => {
      runtime = { ...runtime, complete: false, error: closed ? "Prüfung beim Schließen beendet." : error.message };
    }).finally(() => {
      controllers.delete(controller);
      runtime = { ...runtime, completedAt: now().toISOString() };
      currentJob = null;
    });
    return snapshot();
  }

  async function discover() {
    return start("discover", async (signal) => {
      const result = await discovery.listPages({ signal });
      if (closed) return;
      await state.discover(result);
      runtime = { ...runtime, complete: result.complete, errors: result.errors || [], coverageNotes: result.coverageNotes || [] };
    });
  }

  async function scan({ pageUrl = "" } = {}) {
    const target = pageUrl ? normalizeWebsitePageUrl(pageUrl) : "";
    return start(target ? "page" : "site", async (signal) => {
      let result;
      if (target) {
        try {
          const page = await discovery.page(target, { signal });
          result = { pages: [page], discoveredUrls: [target], errors: [], scope: "page", complete: true,
            startedAt: runtime.startedAt, completedAt: now().toISOString(), coverageNotes: page.coverageNotes || [] };
        } catch (error) {
          result = { pages: [], discoveredUrls: [target], errors: [{ url: target, message: error.message }],
            scope: "page", complete: false, startedAt: runtime.startedAt, completedAt: now().toISOString(), coverageNotes: [] };
        }
      } else {
        const saved = await state.snapshot();
        result = await discovery.scan({ seedUrls: saved.pages.map((page) => page.url), signal });
      }
      if (closed) return;
      await state.mergeScan(result);
      runtime = { ...runtime, complete: result.complete, errors: result.errors || [], coverageNotes: result.coverageNotes || [] };
    });
  }

  async function edit(action, payload) {
    if (closed) throw blocked("Die Website-Bildtextprüfung ist geschlossen.");
    if (keepingExisting) throw blocked("Bitte die laufende öffentliche Bildtextprüfung abwarten.");
    if (transferring()) throw blocked("Während der Squarespace-Übernahme bitte keine Bildfreigaben ändern.");
    await state[action](payload);
    return snapshot();
  }

  function accepted(operation) {
    if (closed) return Promise.reject(blocked("Die Website-Bildtextprüfung ist geschlossen."));
    const pending = Promise.resolve().then(operation);
    pendingOperations.add(pending);
    void pending.finally(() => pendingOperations.delete(pending)).catch(() => {});
    return pending;
  }

  async function verify(payload) {
    if (closed) throw blocked("Die Website-Bildtextprüfung ist geschlossen.");
    if (keepingExisting) throw blocked("Bitte die laufende öffentliche Bildtextprüfung abwarten.");
    if (transferring()) throw blocked("Die öffentliche Ausgabe wird gerade im Übernahmelauf geprüft.");
    const saved = await state.snapshot();
    if (closed) throw blocked("Die Website-Bildtextprüfung ist geschlossen.");
    if (payload?.revision !== saved.revision) throw blocked("Die Bildtextliste hat sich geändert. Bitte neu laden.");
    const pageUrl = normalizeWebsitePageUrl(payload.pageUrl);
    const image = saved.pages.find((page) => page.url === pageUrl)?.images.find((entry) => entry.key === payload.imageKey);
    if (!image?.approval || image.approval.revision !== payload.approvalRevision) {
      throw blocked("Für dieses Bild liegt keine passende aktuelle Textfreigabe vor.");
    }
    const controller = new AbortController();
    controllers.add(controller);
    try {
      let observedPage;
      try { observedPage = await discovery.page(pageUrl, { signal: controller.signal }); }
      catch (error) {
        if (!closed) await state.mergeScan({ pages: [], discoveredUrls: [], errors: [{ url: pageUrl, message: error.message }],
          scope: "page", complete: false, completedAt: now().toISOString() });
        throw error;
      }
      if (closed) throw blocked("Die öffentliche Prüfung wurde beim Schließen beendet.");
      await state.verify({ ...payload, pageUrl, observedPage });
      return snapshot();
    } finally { controllers.delete(controller); }
  }

  async function keepExisting(payload) {
    requireOpen();
    if (currentJob || keepingExisting || pendingOperations.size > 1) throw blocked("Bitte laufende Websiteprüfungen und Bildtextaktionen zuerst abschließen.");
    keepingExisting = true;
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const saved = await state.snapshot();
      requireOpen();
      if (payload?.revision !== saved.revision) throw blocked("Die Bildtextliste hat sich geändert. Bitte neu laden.");
      const pageUrl = normalizeWebsitePageUrl(payload.pageUrl);
      const page = saved.pages.find((entry) => entry.url === pageUrl), image = page?.images.find((entry) => entry.key === payload.imageKey);
      if (!image || image.status === "removed" || !page.checkedAt || page.error || page.redirectUrl || page.inventoryStatus !== "current"
          || image.observationHash !== payload.observationHash || payload.approvalRevision !== (image.approval?.revision ?? null)) {
        throw blocked("Die angezeigte Bildgrundlage oder Freigabe ist nicht mehr aktuell. Bitte erneut prüfen.");
      }
      let observedPage;
      try { observedPage = await discovery.page(pageUrl, { signal: controller.signal }); }
      catch (error) {
        if (!closed) await state.mergeScan({ pages: [], discoveredUrls: [], errors: [{ url: pageUrl, message: error.message }],
          scope: "page", complete: false, completedAt: now().toISOString() });
        throw error;
      }
      requireOpen();
      await state.keepExisting({ ...payload, pageUrl, observedPage });
    } finally { keepingExisting = false; controllers.delete(controller); }
    return snapshot();
  }

  async function startTransferJob(kind, operation, pageUrl = "") {
    requireOpen(); requireAdapter();
    if (currentJob || keepingExisting) throw blocked("Es läuft bereits eine Websiteprüfung oder Squarespace-Übernahme.");
    await state.snapshot();
    requireOpen();
    if (currentJob || keepingExisting) throw blocked("Es läuft bereits eine Websiteprüfung oder Squarespace-Übernahme.");
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(new Error("Das Zeitlimit der Squarespace-Übernahme ist erreicht. Es wird nicht weitergeschrieben.")),
      kind === "connect-transfer" ? connectTimeoutMs : transferTimeoutMs);
    jobKind = kind;
    const initial = { kind, pageUrl, startedAt: now().toISOString(), completedAt: null, phase: kind === "transfer" ? "connecting" : null,
      status: kind === "connect-transfer" ? "connecting" : "running", message: kind === "connect-transfer"
        ? "Eigenes Squarespace-Browserfenster wird geöffnet. Bitte dort selbst anmelden." : "Freigegebene Bildtexte werden geprüft und übernommen.", results: [] };
    if (kind === "connect-transfer") connectRuntime = initial;
    else transferRuntime = initial;
    const updateRuntime = (patch) => {
      if (kind === "connect-transfer") connectRuntime = { ...connectRuntime, ...patch };
      else transferRuntime = { ...transferRuntime, ...patch };
    };
    currentJob = Promise.resolve().then(() => operation(controller.signal)).then((result) => {
      updateRuntime(result);
    }).catch((error) => {
      updateRuntime({ status: controller.signal.aborted ? "cancelled" : "failed",
        message: closed ? "Übernahme beim Schließen beendet. Nicht bestätigte Ergebnisse bleiben offen." : error.message });
    }).finally(() => {
      clearTimeout(timer); controllers.delete(controller);
      updateRuntime({ completedAt: now().toISOString(), phase: null });
      currentJob = null;
    });
    return snapshot();
  }

  async function connectTransfer() {
    return startTransferJob("connect-transfer", async (signal) => {
      const value = await transferAdapter.connect();
      if (closed || signal.aborted) throw blocked("Die Squarespace-Anmeldung wurde beim Schließen oder Zeitlimit beendet.");
      connection = websiteAltTransferConnection(transferAdapter, value);
      return { status: connection.status, message: connection.message };
    });
  }

  async function transfer(payload = {}) {
    requireOpen(); requireAdapter();
    if (currentJob) throw blocked("Es läuft bereits eine Websiteprüfung oder Squarespace-Übernahme.");
    const saved = await state.snapshot();
    requireOpen();
    const requestedPlan = buildWebsiteAltTransferPlan(saved, payload);
    return startTransferJob("transfer", async (signal) => {
      const ensureOpen = () => { requireOpen(); if (signal.aborted) throw aborted(signal); };
      const phase = (value, message) => { transferRuntime = { ...transferRuntime, phase: value, message }; };
      ensureOpen();
      let ready = await readConnection();
      ensureOpen();
      if (!ready.available) throw blocked(ready.message);
      if (!ready.connected) {
        phase("connecting", "Das eigene Squarespace-Fenster wird geöffnet. Bitte dort bei Bedarf selbst anmelden.");
        connection = websiteAltTransferConnection(transferAdapter, await transferAdapter.connect());
        ensureOpen();
        const deadline = Date.now() + loginTimeoutMs;
        ready = await readConnection();
        while (!ready.connected) {
          ensureOpen();
          if (!ready.available || !ready.windowOpen) throw blocked("Das Squarespace-Fenster wurde geschlossen. Die Übernahme wurde vor dem Schreiben beendet.");
          if (Date.now() >= deadline) throw blocked("Das Zeitlimit für die eigene Squarespace-Anmeldung ist erreicht. Es wurde nichts geschrieben.");
          phase("login-required", "Bitte im eigenen Squarespace-Fenster anmelden. Danach wird die aktuelle Freigabe erneut geprüft und die Übernahme fortgesetzt.");
          await waitForLoginPoll(signal, Math.min(loginPollIntervalMs, Math.max(1, deadline - Date.now())));
          ready = await readConnection();
        }
      }
      ensureOpen();
      const current = await state.snapshot();
      ensureOpen();
      const plan = buildWebsiteAltTransferPlan(current, { revision: current.revision, pageUrl: requestedPlan.pageUrl });
      if (JSON.stringify(plan.images) !== JSON.stringify(requestedPlan.images)) {
        throw blocked("Die seitengebundenen Bildfreigaben wurden während der Anmeldung geändert. Bitte vor einer neuen Übernahme prüfen.");
      }
      phase("transferring", "Die aktuellen Bildfreigaben werden mit Squarespace verglichen und übernommen.");
      const adapter = { transfer: async (...args) => {
        const result = await transferAdapter.transfer(...args);
        ensureOpen();
        phase("verifying", "Die öffentliche Ausgabe wird frisch gegen die gebundenen Bildfreigaben geprüft.");
        return result;
      } };
      return runWebsiteAltTransfer({ plan, state, discovery, adapter, signal, dataRoot: storageRoot, now, verificationIntervalMs,
        isClosed: () => closed, onProgress: (results) => { transferRuntime = { ...transferRuntime, results }; } });
    }, requestedPlan.pageUrl);
  }

  return Object.freeze({ snapshot, discover, scan,
    // Node-only capability for the page bridge. Never expose store methods as HTTP actions.
    createSharedSyncStoreAdapter() {
      const idle = () => {
        requireOpen();
        if (currentJob || pendingOperations.size) throw blocked("Bitte laufende Bildtextprüfungen und Squarespace-Übernahmen zuerst abschließen.");
      };
      return Object.freeze({
        exportPage: (input) => { requireOpen(); return state.exportPage(input); },
        exportPages: (input) => { requireOpen(); return state.exportPages(input); },
        authorizeSharedPageImport: (input) => { idle(); return state.authorizeSharedPageImport(input); },
        importSharedPage: (input) => { idle(); return accepted(() => state.importSharedPage(input)); },
      });
    },
    draft: (payload) => accepted(() => edit("draft", payload)),
    approve: (payload) => accepted(() => edit("approve", payload)),
    verify: (payload) => accepted(() => verify(payload)),
    keepExisting: (payload) => accepted(() => keepExisting(payload)),
    connectTransfer: () => accepted(() => connectTransfer()),
    transfer: (payload) => accepted(() => transfer(payload)),
    close() {
      if (closing) return closing;
      closed = true;
      for (const controller of controllers) controller.abort();
      closing = (async () => {
        await Promise.allSettled([currentJob, ...pendingOperations]);
        await transferAdapter?.close();
      })();
      return closing;
    },
  });
}
