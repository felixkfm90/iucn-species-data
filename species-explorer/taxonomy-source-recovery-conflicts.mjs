import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { configureTaxonomyBuildDatabase } from "./taxonomy-build-cache.mjs";

function exclusions(scope) {
  if (!Array.isArray(scope) || !scope.length || scope.length > 2000
      || scope.some((row) => !/^mtx_[a-f0-9]{32}$/.test(row?.originalId || "")
        || row.replacementId != null && !/^mtx_[a-f0-9]{32}$/.test(row.replacementId))
      || new Set(scope.map((row) => row.originalId)).size !== scope.length) {
    throw new Error("Ungültiger enger Reparaturumfang.");
  }
  const ids = [...new Set(scope.flatMap((row) => [row.originalId, row.replacementId].filter(Boolean)))];
  if (ids.length !== scope.reduce((count, row) => count + (row.replacementId ? 2 : 1), 0)) {
    throw new Error("Ungültiger enger Reparaturumfang.");
  }
  return ids;
}

function assertionMapper(before, candidate) {
  const oldField = before.prepare(`SELECT f.*, r.provider, a.provider_record_id
    FROM master_field_assertion f JOIN provider_release r USING(release_id)
    LEFT JOIN provider_taxon_assertion a ON a.assertion_id=f.provider_taxon_assertion_id
    WHERE f.assertion_id=?`);
  const newField = candidate.prepare(`SELECT f.assertion_id FROM master_field_assertion f
    JOIN provider_release r USING(release_id)
    LEFT JOIN provider_taxon_assertion a ON a.assertion_id=f.provider_taxon_assertion_id
    WHERE f.master_taxon_id=? AND f.field_name=? AND f.language=? AND f.field_value=?
      AND f.normalized_value=? AND f.origin_kind=? AND f.confidence IS ? AND f.review_state=?
      AND f.selected=? AND r.provider=? AND a.provider_record_id IS ? LIMIT 2`);
  return (id, owner) => {
    if (id == null) return null;
    const field = oldField.get(id);
    if (!field || field.master_taxon_id !== owner) throw new Error("Alter Konflikt-/Entscheidungsbeleg gehört nicht zur unbeteiligten Art.");
    const matches = newField.all(owner, field.field_name, field.language, field.field_value,
      field.normalized_value, field.origin_kind, field.confidence, field.review_state,
      field.selected, field.provider, field.provider_record_id);
    if (matches.length !== 1) throw new Error("Konflikt-/Entscheidungsbeleg im Reparaturkandidaten fehlt oder ist mehrdeutig.");
    return matches[0].assertion_id;
  };
}

// Only the private candidate is written, in its existing build transaction.
// Ordinary updates still calculate fresh conflicts. The final semantic scope
// check remains independent and catches changed sources/fields/statuses as well
// as any conflict edits after this copy. Never infer identity from names here.
export async function preserveRecoveryConflictState({ database, previousPath, scope, onProgress = () => {} }) {
  const ids = exclusions(scope);
  const target = database.prepare("PRAGMA database_list").all().find((row) => row.name === "main")?.file;
  if (target && path.resolve(target).toLocaleLowerCase("en") === path.resolve(previousPath).toLocaleLowerCase("en")) {
    throw new Error("Konfliktübernahme darf den Ausgangsmaster nicht beschreiben.");
  }
  const filter = `master_taxon_id NOT IN (${ids.map(() => "?").join(",")})`;
  const before = configureTaxonomyBuildDatabase(new DatabaseSync(previousPath, { readOnly: true }));
  let savepoint = false;
  try {
    before.exec("PRAGMA query_only=ON");
    const mapAssertion = assertionMapper(before, database);
    const oldConflicts = before.prepare(`SELECT * FROM master_conflict WHERE ${filter} ORDER BY conflict_id`);
    const oldDecisions = before.prepare(`SELECT * FROM master_decision WHERE ${filter} ORDER BY decision_id`);
    const total = before.prepare(`SELECT COUNT(*) AS n FROM master_conflict WHERE ${filter}`).get(...ids).n
      + before.prepare(`SELECT COUNT(*) AS n FROM master_decision WHERE ${filter}`).get(...ids).n;
    const insertConflict = database.prepare(`INSERT INTO master_conflict
      (conflict_id, master_taxon_id, field_name, current_assertion_id, candidate_assertion_id,
       conflict_type, conflict_state, detected_at, resolved_at, resolution_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertDecision = database.prepare(`INSERT INTO master_decision
      (decision_id, master_taxon_id, conflict_id, field_name, language, decision_type,
       selected_assertion_id, decided_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const conflictOwner = database.prepare("SELECT master_taxon_id FROM master_conflict WHERE conflict_id=?");
    let copied = 0, conflicts = 0, decisions = 0;
    const progress = async () => {
      onProgress({ phase: "Konfliktdaten übernehmen", message: "Unbeteiligte Konflikt- und Entscheidungsdaten werden erhalten.", current: copied, total });
      await new Promise((resolve) => setImmediate(resolve));
    };
    // Clear only recalculated state outside the explicit plan, never the source.
    // Foreign-key order and the caller's transaction make error/pause retryable.
    database.exec("SAVEPOINT source_recovery_conflicts");
    savepoint = true;
    database.prepare(`DELETE FROM master_decision WHERE ${filter}`).run(...ids);
    database.prepare(`DELETE FROM master_conflict WHERE ${filter}`).run(...ids);
    await progress();
    for (const row of oldConflicts.iterate(...ids)) {
      insertConflict.run(row.conflict_id, row.master_taxon_id, row.field_name,
        mapAssertion(row.current_assertion_id, row.master_taxon_id), mapAssertion(row.candidate_assertion_id, row.master_taxon_id),
        row.conflict_type, row.conflict_state, row.detected_at, row.resolved_at, row.resolution_note);
      conflicts += 1; copied += 1;
      if (copied % 500 === 0) await progress();
    }
    for (const row of oldDecisions.iterate(...ids)) {
      if (row.conflict_id != null && conflictOwner.get(row.conflict_id)?.master_taxon_id !== row.master_taxon_id) {
        throw new Error("Alte Entscheidung verweist nicht auf einen erhaltenen Konflikt derselben Art.");
      }
      insertDecision.run(row.decision_id, row.master_taxon_id, row.conflict_id, row.field_name,
        row.language, row.decision_type, mapAssertion(row.selected_assertion_id, row.master_taxon_id), row.decided_at, row.note);
      decisions += 1; copied += 1;
      if (copied % 500 === 0) await progress();
    }
    await progress();
    database.exec("RELEASE source_recovery_conflicts");
    savepoint = false;
    return { conflicts, decisions };
  } catch (error) {
    if (savepoint) database.exec("ROLLBACK TO source_recovery_conflicts; RELEASE source_recovery_conflicts");
    throw error;
  } finally { before.close(); }
}
