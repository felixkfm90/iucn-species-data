import fs from "node:fs/promises";
import path from "node:path";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { readIdentityRegistry, validateIdentityRegistry, identityRegistryRevision } from "./taxonomy-identity-registry.mjs";
import { assertCatalogUsageRevision } from "./lightroom-catalog-usage.mjs";

// Pending automatic events require a fresh, closed catalog proof until their
// first activation. Already active history needs no permanent catalog lock.
// Read a single registry row, never scan catalog/master photos or all taxa.
export async function assertPendingClassificationAutomation(root, { full = false } = {}) {
  let review;
  try { review = JSON.parse(await fs.readFile(path.join(root, "master", "identity-review.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  validateIdentityRegistry(review.registry);
  if (review.revision !== identityRegistryRevision(review.registry)) throw new Error("Die Identitätsvormerkung wurde verändert.");
  const automated = review.registry.events.filter((event) => event.classificationAutomation);
  if (!automated.length) return null;
  const { DatabaseSync } = await loadNodeSqlite();
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
  let active;
  try { active = new Set(readIdentityRegistry(db).events.map((event) => event.eventId)); }
  finally { db.close(); }
  const pending = automated.filter((event) => !active.has(event.eventId));
  const revisions = [...new Set(pending.map((event) => event.classificationAutomation.usageRevision))];
  for (const revision of revisions) {
    const usage = await assertCatalogUsageRevision(root, revision, { full });
    const used = new Set(usage.usedIds);
    if (pending.some((event) => event.classificationAutomation.usageRevision === revision
        && [...event.sources, ...event.targets].some((taxon) => used.has(taxon.masterTaxonId)))) {
      throw new Error("Eine automatisch vorgemerkte Art ist inzwischen zugewiesen. Erneute Prüfung erforderlich.");
    }
  }
  return pending.length ? { usageRevisions: revisions, eventIds: pending.map((event) => event.eventId) } : null;
}
