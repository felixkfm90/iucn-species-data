import { setTimeout as delay } from "node:timers/promises";
import { createExplorerServer } from "../server.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4177;
const DEFAULT_HEALTH_TIMEOUT_MS = 10_000;
const DEFAULT_HEALTH_INTERVAL_MS = 150;

function normalizePort(value, fallback = DEFAULT_PORT) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < 65_536 ? parsed : fallback;
}

function addressToBaseUrl(address, host) {
  const port = typeof address === "object" && address ? address.port : DEFAULT_PORT;
  return `http://${host}:${port}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}

export async function waitForExplorerHealthcheck(
  baseUrl,
  {
    timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
    intervalMs = DEFAULT_HEALTH_INTERVAL_MS,
  } = {},
) {
  const startedAt = Date.now();
  let lastError = null;
  do {
    try {
      const summary = await fetchJson(`${baseUrl}/api/summary`);
      return { ok: true, summary };
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  } while (Date.now() - startedAt < timeoutMs);

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

export async function getExplorerPipelineStatus(baseUrl) {
  return fetchJson(`${baseUrl}/api/pipeline/status`);
}

export async function getExplorerBackupStatus(baseUrl) {
  return fetchJson(`${baseUrl}/api/backup/status`);
}

export function isPipelineBlockingShutdown(status) {
  return status?.status === "running" || status?.status === "awaiting-review";
}

export function isBackupBlockingShutdown(status) {
  return status?.status === "running";
}
