import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

// Connection-local experiment, injected only into isolated benchmark processes.
// No journal/synchronization changes, no persistent PRAGMA, no validation bypass.
export function observeBenchmarkCache(cacheKiB = 0) {
  assert.ok([0, 8192].includes(cacheKiB), "Unzulässige Testpuffergröße.");
  const stats = { requestedKiB: cacheKiB, connections: 0, previousSettings: {} };
  if (!cacheKiB) return { stats, restore() {} };
  const prototype = DatabaseSync.prototype, prepare = prototype.prepare, exec = prototype.exec, seen = new WeakSet();
  const initialize = (database) => {
    if (seen.has(database)) return;
    const before = prepare.call(database, "PRAGMA cache_size").get().cache_size;
    exec.call(database, `PRAGMA cache_size=-${cacheKiB}`);
    seen.add(database); stats.connections++;
    stats.previousSettings[before] = (stats.previousSettings[before] || 0) + 1;
  };
  prototype.prepare = function (...args) { initialize(this); return prepare.apply(this, args); };
  prototype.exec = function (...args) { initialize(this); return exec.apply(this, args); };
  return { stats, restore() { prototype.prepare = prepare; prototype.exec = exec; } };
}
