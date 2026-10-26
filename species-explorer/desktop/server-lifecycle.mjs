import { setTimeout as delay } from "node:timers/promises";
import { createExplorerServer } from "../server.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4177;
const DEFAULT_HEALTH_TIMEOUT_MS = 10_000;
const DEFAULT_HEALTH_INTERVAL_MS = 150;
const DEFAULT_STATUS_TIMEOUT_MS = 5_000;

function normalizePort(value, fallback = DEFAULT_PORT) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < 65_536 ? parsed : fallback;
}

function addressToBaseUrl(address, host) {
  const port = typeof address === "object" && address ? address.port : DEFAULT_PORT;
  return `http://${host}:${port}`;
}

async function fetchJson(url, { timeoutMs = DEFAULT_STATUS_TIMEOUT_MS, signal, ...options } = {}) {
  const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs)));
  const response = await fetch(url, {
    ...options,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  // Keep the same abort signal active until the entire JSON body has arrived.
  return await response.json();
}

export async function waitForExplorerHealthcheck(
  baseUrl,
  {
    timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
    intervalMs = DEFAULT_HEALTH_INTERVAL_MS,
  } = {},
) {
  const deadline = performance.now() + timeoutMs;
  let lastError = null;
  while (performance.now() < deadline) {
    try {
      const summary = await fetchJson(`${baseUrl}/api/summary`, {
        timeoutMs: deadline - performance.now(),
      });
      if (performance.now() >= deadline) throw new Error("Timeout");
      return { ok: true, summary };
    } catch (error) {
      lastError = error;
      const remaining = deadline - performance.now();
      if (remaining > 0) await delay(Math.min(intervalMs, remaining));
    }
  }

  throw new Error(
    `Explorer-Server antwortet nicht unter ${baseUrl}: ${lastError?.message ?? "Timeout"}`,
  );
}

export async function startManagedExplorerServer({
  repoRoot,
  host = DEFAULT_HOST,
  preferredPort = normalizePort(process.env.SPECIES_EXPLORER_DESKTOP_PORT, DEFAULT_PORT),
  allowPortFallback = true,
  healthTimeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
} = {}) {
  const candidates = [normalizePort(preferredPort)];
  if (allowPortFallback && candidates[0] !== 0) candidates.push(0);

  let lastError = null;
  for (const port of candidates) {
    const server = await createExplorerServer({ repoRoot, host, port });
    try {
      const address = await server.listen();
      const baseUrl = addressToBaseUrl(address, host);
      const health = await waitForExplorerHealthcheck(baseUrl, { timeoutMs: healthTimeoutMs });
      return {
        server,
        host,
        port: address.port,
        baseUrl,
        health,
        usedFallbackPort: port !== candidates[0],
      };
    } catch (error) {
      lastError = error;
      await server.close().catch(() => {});
      if (!allowPortFallback || error.code !== "EADDRINUSE") break;
    }
  }

  throw lastError ?? new Error("Explorer-Server konnte nicht gestartet werden");
}

export async function stopManagedExplorerServer(managedServer) {
  if (!managedServer?.server) return;
  await managedServer.server.close();
}

export async function getExplorerPipelineStatus(baseUrl, options) {
  return fetchJson(`${baseUrl}/api/pipeline/status`, options);
}

export async function getExplorerBackupStatus(baseUrl, options) {
  return fetchJson(`${baseUrl}/api/backup/status`, options);
}

export async function getExplorerPendingChanges(baseUrl, options) {
  return fetchJson(`${baseUrl}/api/pending-changes`, options);
}

export function isPipelineBlockingShutdown(status) {
  return status?.status === "running" || status?.status === "awaiting-review";
}

export function isBackupBlockingShutdown(status) {
  return status?.status === "running";
}
