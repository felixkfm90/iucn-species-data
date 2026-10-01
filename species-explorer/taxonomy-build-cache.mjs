import { AsyncLocalStorage } from "node:async_hooks";

// Main-database page caches only. Attached databases and worker-thread validators
// keep SQLite's defaults. This is a target, NOT a process/RSS or allocation limit.
export const TAXONOMY_BUILD_CACHE_KIB = 8192;
export const TAXONOMY_BUILD_CACHE_CONNECTIONS = 8;
const context = new AsyncLocalStorage(), reservations = new Set();
let peakConnections = 0, configuredConnections = 0, fallbackConnections = 0;

function sweepClosed() {
  for (const entry of reservations) if (!entry.database.isOpen) reservations.delete(entry);
}

// Internal counters for tests/benchmarks; no application endpoint or file output.
export function taxonomyBuildCacheUsage() {
  sweepClosed();
  return { activeConnections: reservations.size, peakConnections, configuredConnections, fallbackConnections,
    reservedKiB: reservations.size * TAXONOMY_BUILD_CACHE_KIB };
}

export async function withTaxonomyBuildCache(action) {
  const parent = context.getStore();
  if (parent && !parent.closed) return action();
  const scope = { closed: false };
  return context.run(scope, async () => {
    let failure;
    try { return await action(); }
    catch (error) { failure = error; throw error; }
    finally {
      scope.closed = true;
      const errors = [];
      // Normal owners close their connections in finally. If a caller retains a
      // handle, restore its prior connection-local value instead of closing it.
      for (const entry of reservations) if (entry.scope === scope) {
        try {
          if (entry.database.isOpen) entry.database.exec(`PRAGMA main.cache_size=${entry.before}`);
          reservations.delete(entry);
        } catch (error) {
          errors.push(error);
          try { entry.database.close(); } catch (closeError) { errors.push(closeError); }
          // A still-open failed handle continues to consume its reservation.
          if (!entry.database.isOpen) reservations.delete(entry);
        }
      }
      if (errors.length) throw new AggregateError(failure ? [failure, ...errors] : errors,
        "Aufbaupuffer konnte nicht vollständig zurückgestellt werden.");
    }
  });
}

// Call only for newly opened build/verification handles. No prototype mutation,
// no changes to journal/synchronous/transactions, and no cached query results.
export function configureTaxonomyBuildDatabase(database) {
  const scope = context.getStore();
  if (!scope || scope.closed) return database;
  sweepClosed();
  if ([...reservations].some((entry) => entry.database === database)) return database;
  if (reservations.size >= TAXONOMY_BUILD_CACHE_CONNECTIONS) {
    fallbackConnections++;
    return database;
  }
  try {
    const before = database.prepare("PRAGMA main.cache_size").get().cache_size;
    if (!Number.isSafeInteger(before)) throw new Error("Ungültiger SQLite-Pufferrichtwert.");
    database.exec(`PRAGMA main.cache_size=-${TAXONOMY_BUILD_CACHE_KIB}`);
    reservations.add({ database, before, scope });
    configuredConnections++;
    peakConnections = Math.max(peakConnections, reservations.size);
    return database;
  } catch (error) {
    // Configuration failure must not leave an unowned new handle/file lock.
    try { database.close(); } catch { /* Keep the original configuration error. */ }
    throw error;
  }
}
