import path from "node:path";
import { atomicWriteJson } from "./taxonomy-storage.mjs";

// Nur ein kurzlebiger Anzeigehinweis; niemals Sperre, Jobcheckpoint oder Auslöser.
export function createTaxonomyUpdatePresence(taxonomyRoot) {
  let generation = 0;
  let writes = Promise.resolve();
  return async function withPresence(operation) {
    const current = ++generation;
    const publish = (active) => {
      if (generation !== current) return writes;
      const marker = { schemaVersion: 1, pid: process.pid, active, updatedAt: new Date().toISOString() };
      writes = writes.then(() => atomicWriteJson(path.join(taxonomyRoot, "master/update-presence.json"), marker)).catch(() => {});
      return writes;
    };
    await publish(true);
    const timer = setInterval(() => { void publish(true); }, 5_000);
    timer.unref();
    try {
      return await operation();
    } finally {
      clearInterval(timer);
      await publish(false);
    }
  };
}
