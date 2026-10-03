import { configureTaxonomyBuildDatabase } from "./taxonomy-build-cache.mjs";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { canonicalBuildInput, compareTaxonomyBuildInputs } from "./taxonomy-build-inputs.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";

export const MASTER_DEPENDENCY_FILE = "build-dependencies.sqlite";
const normalized = (value) => normalizeTaxonomySearchTerm(String(value || ""));
const key = (...parts) => canonicalBuildInput(parts);
const recordKey = (provider, id) => key("record", provider, id);
const identityKey = (rank, name) => key("identity", normalized(rank), normalized(name));
const genusKey = (name) => key("genus", normalized(name).split(/\s+/u)[0]);
const hierarchyKey = (rank, name) => key("hierarchy", normalized(rank), normalized(name));
const yieldLoop = () => new Promise((resolve) => setImmediate(resolve));

// Conservative invalidation plan, NOT taxon resolution and NOT permission to
// copy old rows. Both master files are opened read-only. All graph/queue writes
// belong to this candidate's exclusive sidecar, never either source database.
export async function planMasterDependencies({ filename, previousPath, currentPath, beforeInputs, afterInputs,
  onProgress = () => {}, progressPercent = 99 }) {
  const compatibility = compareTaxonomyBuildInputs(beforeInputs, afterInputs);
  if (compatibility.mode !== "input-delta") return compatibility;
  const handle = await fs.open(filename, "wx");
  await handle.close();
  const graph = configureTaxonomyBuildDatabase(new DatabaseSync(filename));
  let previous, current;
  try {
    previous = configureTaxonomyBuildDatabase(new DatabaseSync(previousPath, { readOnly: true }));
    current = configureTaxonomyBuildDatabase(new DatabaseSync(currentPath, { readOnly: true }));
    graph.exec(`PRAGMA synchronous=FULL; PRAGMA user_version=1; BEGIN IMMEDIATE;
      CREATE TABLE taxon(id TEXT PRIMARY KEY, present_before INTEGER NOT NULL DEFAULT 0,
        present_after INTEGER NOT NULL DEFAULT 0, stateful INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
      CREATE TABLE consumer(key TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(key,id)) WITHOUT ROWID;
      CREATE TABLE producer(id TEXT NOT NULL, key TEXT NOT NULL, PRIMARY KEY(id,key)) WITHOUT ROWID;
      CREATE TABLE taxon_work(id TEXT PRIMARY KEY, reason TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
      CREATE INDEX taxon_work_pending ON taxon_work(processed,id);
      CREATE TABLE key_work(key TEXT PRIMARY KEY, processed INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
      CREATE INDEX key_work_pending ON key_work(processed,key);
      CREATE TABLE plan_info(id INTEGER PRIMARY KEY CHECK(id=1), document_json TEXT NOT NULL);`);
    const consume = graph.prepare("INSERT OR IGNORE INTO consumer VALUES(?,?)");
    const produce = graph.prepare("INSERT OR IGNORE INTO producer VALUES(?,?)");
    const addTaxon = graph.prepare(`INSERT INTO taxon(id,present_before,present_after) VALUES(?,?,?)
      ON CONFLICT(id) DO UPDATE SET present_before=MAX(present_before,excluded.present_before),
        present_after=MAX(present_after,excluded.present_after)`);
    const mark = graph.prepare("UPDATE taxon SET stateful=1 WHERE id=?");
    const own = (id, dependency) => { consume.run(dependency, id); produce.run(id, dependency); };
    let visited = 0;
    const progress = async () => {
      visited += 1;
      if (visited % 1000 === 0) {
        onProgress({ phase: "Abhängigkeiten prüfen", message: "Quellenverknüpfungen und betroffene Arten werden geprüft.",
          current: visited, total: null, percent: progressPercent });
        await yieldLoop();
      }
    };
    // A pre-write plan with proven stable structure uses the same file for both
    // sides. Index it once and mark both memberships; do not duplicate all work.
    const snapshots = previousPath === currentPath ? [[previous, null]] : [[previous, true], [current, false]];
    for (const [db, before] of snapshots) {
      for (const row of db.prepare("SELECT * FROM master_taxon").iterate()) {
        const id = row.master_taxon_id;
        addTaxon.run(id, before !== false ? 1 : 0, before !== true ? 1 : 0);
        own(id, identityKey(row.rank, row.canonical_scientific_name));
        own(id, hierarchyKey(row.rank, row.canonical_scientific_name));
        consume.run(genusKey(row.canonical_scientific_name), id);
        if (row.lifecycle_state !== "active" || row.reference_state !== "exact-col") mark.run(id);
        await progress();
      }
      for (const row of db.prepare(`SELECT a.*,r.provider,r.release_state FROM provider_taxon_assertion a
          JOIN provider_release r USING(release_id) WHERE a.master_taxon_id IS NOT NULL`).iterate()) {
        const id = row.master_taxon_id;
        own(id, recordKey(row.provider, row.provider_record_id));
        own(id, identityKey(row.rank, row.scientific_name));
        consume.run(genusKey(row.scientific_name), id);
        // The current builder derives absent kingdoms from CoL species of the
        // same genus, including ambiguity across kingdoms. Do not split this key.
        if (row.provider === "catalogue-of-life") produce.run(id, genusKey(row.scientific_name));
        for (const parent of [row.parent_provider_record_id, row.accepted_provider_record_id]) {
          if (parent) consume.run(recordKey(row.provider, parent), id);
        }
        const hierarchy = JSON.parse(row.hierarchy_json);
        if (!hierarchy || Array.isArray(hierarchy) || typeof hierarchy !== "object") throw new Error("Ungültiger Hierarchieeingang im Abhängigkeitsplan.");
        for (const [rank, name] of Object.entries(hierarchy)) if (name) consume.run(hierarchyKey(rank, name), id);
        if (row.release_state !== "active" || row.match_state === "stale" || row.version_change_state === "removed") mark.run(id);
        await progress();
      }
      for (const row of db.prepare(`SELECT a.master_taxon_id AS id,a.rank,n.name FROM provider_name_assertion n
          JOIN provider_taxon_assertion a ON a.assertion_id=n.provider_taxon_assertion_id
          WHERE a.master_taxon_id IS NOT NULL AND n.name_kind IN ('scientific','synonym')`).iterate()) {
        own(row.id, identityKey(row.rank, row.name));
        await progress();
      }
      for (const row of db.prepare(`SELECT a.master_taxon_id AS id,COALESCE(a.rank,t.rank) AS rank,a.name
          FROM master_taxon_alias a JOIN master_taxon t USING(master_taxon_id)`).iterate()) {
        own(row.id, identityKey(row.rank, row.name));
        mark.run(row.id); // historic aliases are state from a previous build
        await progress();
      }
      for (const row of db.prepare(`SELECT master_taxon_id AS id FROM master_decision
          UNION SELECT master_taxon_id FROM master_conflict
          UNION SELECT master_taxon_id FROM project_taxon_link
          UNION SELECT master_taxon_id FROM master_taxon_status WHERE status_name='manually-protected'
          UNION SELECT master_taxon_id FROM master_field_assertion WHERE origin_kind IN ('manual','project')`).iterate()) {
        mark.run(row.id);
        await progress();
      }
    }
    const queueKey = graph.prepare("INSERT OR IGNORE INTO key_work(key) VALUES(?)");
    const queueTaxon = graph.prepare("INSERT OR IGNORE INTO taxon_work(id,reason) VALUES(?,?)");
    const hasConsumer = graph.prepare("SELECT 1 FROM consumer WHERE key=? LIMIT 1");
    let unmappedChanges = 0;
    compareTaxonomyBuildInputs(beforeInputs, afterInputs, ({ provider, recordId }) => {
      const dependency = recordKey(provider, recordId);
      if (!hasConsumer.get(dependency)) unmappedChanges += 1;
      queueKey.run(dependency);
    });
    graph.exec(`INSERT OR IGNORE INTO taxon_work(id,reason)
      SELECT id,CASE WHEN stateful=1 THEN 'previous-state' ELSE 'taxon-membership' END FROM taxon
      WHERE stateful=1 OR present_before<>present_after;`);
    const consumers = graph.prepare("SELECT id FROM consumer WHERE key=?");
    const producers = graph.prepare("SELECT key FROM producer WHERE id=?");
    const doneKey = graph.prepare("UPDATE key_work SET processed=1 WHERE key=?");
    const doneTaxon = graph.prepare("UPDATE taxon_work SET processed=1 WHERE id=?");
    // Both snapshots participate, so removed/changed relationships still reach
    // their old consumers. Unique queues terminate cycles without recursion.
    while (true) {
      const keys = graph.prepare("SELECT key FROM key_work WHERE processed=0 LIMIT 500").all();
      for (const row of keys) {
        for (const consumer of consumers.iterate(row.key)) queueTaxon.run(consumer.id, "dependency");
        doneKey.run(row.key);
      }
      const taxa = graph.prepare("SELECT id FROM taxon_work WHERE processed=0 LIMIT 500").all();
      for (const row of taxa) {
        for (const producer of producers.iterate(row.id)) queueKey.run(producer.key);
        doneTaxon.run(row.id);
      }
      if (!keys.length && !taxa.length) break;
      await yieldLoop();
    }
    const scalar = (sql) => graph.prepare(sql).get().n;
    const result = {
      mode: unmappedChanges ? "full-build-required" : "dependency-plan",
      reasons: unmappedChanges ? ["unmapped-source-change"] : [],
      unmappedChanges, reuseAuthorized: false,
      currentTaxa: scalar("SELECT COUNT(*) AS n FROM taxon WHERE present_after=1"),
      rebuildTaxa: scalar("SELECT COUNT(*) AS n FROM taxon JOIN taxon_work USING(id) WHERE present_after=1"),
      unchangedCandidates: scalar("SELECT COUNT(*) AS n FROM taxon LEFT JOIN taxon_work USING(id) WHERE present_after=1 AND present_before=1 AND taxon_work.id IS NULL"),
      previousOnlyTaxa: scalar("SELECT COUNT(*) AS n FROM taxon WHERE present_before=1 AND present_after=0"),
      statefulTaxa: scalar("SELECT COUNT(*) AS n FROM taxon WHERE stateful=1 AND present_after=1"),
      beforeFingerprint: beforeInputs.fingerprint, afterFingerprint: afterInputs.fingerprint,
    };
    if (unmappedChanges) { result.rebuildTaxa = result.currentTaxa; result.unchangedCandidates = 0; }
    graph.prepare("INSERT INTO plan_info VALUES(1,?)").run(canonicalBuildInput(result));
    graph.exec("COMMIT");
    return result;
  } finally { previous?.close(); current?.close(); graph.close(); }
}
