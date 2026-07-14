(function initializeSpeciesExplorerFoundation(global) {
  "use strict";

  const SNAPSHOT_ENDPOINTS = Object.freeze({
    summary: "/api/summary",
    validation: "/api/validation",
    species: "/api/species",
    revision: "/api/revision",
    pendingChanges: "/api/pending-changes",
  });

  function createInitialExplorerState() {
    return {
      species: [],
      filtered: [],
      selectedId: "",
      audioCleanup: null,
      mapCleanup: null,
      portraitCleanup: null,
      notice: "",
      editMode: false,
      databaseNeedsUpdate: true,
      validationNeedsUpdate: true,
      pendingChanges: null,
      openPipelinePreview: null,
      openAssetReview: null,
      holdNewSpeciesBackground: false,
      newSpeciesPipelineActive: false,
      pipelineWasRunning: false,
      silentPipelineContext: null,
      pipelineStatusSnapshot: null,
      pipelinePollTimer: null,
      backupWasRunning: false,
      backupStatusSnapshot: null,
      backupPollTimer: null,
      settingsSnapshot: null,
      assetReviewRunId: "",
      assetReviewSignature: "",
      assetReviewAwaitingRetry: false,
      reloadAfterAssetReviewClose: false,
      reloadAfterEditClose: false,
      pendingRevisionReload: false,
      dataRevision: "",
      dataRevisionTimer: null,
      dataLoading: false,
      sessionToken: "",
    };
  }

  function createExplorerApiClient({
    fetchImpl = global.fetch?.bind(global),
    HeadersImpl = global.Headers,
    getSessionToken = () => "",
    setSessionToken = () => {},
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("Für die Explorer-API wird eine Fetch-Funktion benötigt.");
    }
    if (typeof HeadersImpl !== "function") {
      throw new TypeError("Für die Explorer-API wird die Headers-Implementierung benötigt.");
    }

    async function ensureSessionToken() {
      const currentToken = getSessionToken();
      if (currentToken) return currentToken;

      const response = await fetchImpl("/api/session", { credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.token) {
        throw new Error(payload.error || "Explorer-Sitzung konnte nicht gestartet werden");
      }
      setSessionToken(payload.token);
      return payload.token;
    }

    async function fetchJson(url, options = {}) {
      const method = String(options.method || "GET").toUpperCase();
      const secureOptions = { ...options, credentials: "same-origin" };
      if (!["GET", "HEAD"].includes(method)) {
        const headers = new HeadersImpl(options.headers || {});
        headers.set("Content-Type", "application/json");
        headers.set("X-Species-Explorer-Session", await ensureSessionToken());
        secureOptions.headers = headers;
      }

      const response = await fetchImpl(url, secureOptions);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || "Anfrage ist fehlgeschlagen");
        error.details = payload.details || [];
        error.fieldErrors = payload.fieldErrors || {};
        throw error;
      }
      return payload;
    }

    async function loadExplorerSnapshot({
      reload = false,
      failureMessage = "Lokale Daten konnten nicht geladen werden.",
    } = {}) {
      if (reload) {
        await fetchImpl("/api/reload", { credentials: "same-origin" });
      }

      const entries = Object.entries(SNAPSHOT_ENDPOINTS);
      const responses = await Promise.all(
        entries.map(([, url]) => fetchImpl(url, { credentials: "same-origin" })),
      );
      if (responses.some((response) => !response.ok)) {
        throw new Error(failureMessage);
      }

      const payloads = await Promise.all(responses.map((response) => response.json()));
      return Object.fromEntries(entries.map(([key], index) => [key, payloads[index]]));
    }

    async function fetchRevision() {
      const response = await fetchImpl(SNAPSHOT_ENDPOINTS.revision, { credentials: "same-origin" });
      if (!response.ok) return null;
      return response.json();
    }

    return Object.freeze({
      ensureSessionToken,
      fetchJson,
      loadExplorerSnapshot,
      fetchRevision,
    });
  }

  global.SpeciesExplorerFoundation = Object.freeze({
    createInitialExplorerState,
    createExplorerApiClient,
  });
})(globalThis);
