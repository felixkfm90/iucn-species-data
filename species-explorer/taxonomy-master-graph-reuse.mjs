import { configureTaxonomyBuildDatabase } from "./taxonomy-build-cache.mjs";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

export const MASTER_REUSE_PLAN = "build-reuse-plan.sqlite";

// Every input used to construct edges or stateful marks in
// taxonomy-master-dependencies.mjs. Raw equality is deliberately stricter than
// normalized equality. Artificial assertion IDs and provenance dates are not
// graph inputs; relations are resolved by joins before comparing sets.
const projections = [
  (s) => `SELECT master_taxon_id,rank,canonical_scientific_name,lifecycle_state,reference_state FROM ${s}.master_taxon`,
  (s) => `SELECT a.master_taxon_id,a.rank,a.scientific_name,r.provider,a.provider_record_id,
    a.parent_provider_record_id,a.accepted_provider_record_id,a.hierarchy_json,r.release_state,
    a.match_state='stale',a.version_change_state='removed'
    FROM ${s}.provider_taxon_assertion a JOIN ${s}.provider_release r USING(release_id)
    WHERE a.master_taxon_id IS NOT NULL`,
  (s) => `SELECT a.master_taxon_id,a.rank,n.name FROM ${s}.provider_name_assertion n
    JOIN ${s}.provider_taxon_assertion a ON a.assertion_id=n.provider_taxon_assertion_id
    WHERE a.master_taxon_id IS NOT NULL AND n.name_kind IN ('scientific','synonym')`,
  (s) => `SELECT a.master_taxon_id,COALESCE(a.rank,t.rank),a.name FROM ${s}.master_taxon_alias a
    JOIN ${s}.master_taxon t USING(master_taxon_id)`,
  (s) => `SELECT master_taxon_id FROM ${s}.master_decision
    UNION SELECT master_taxon_id FROM ${s}.master_conflict
    UNION SELECT master_taxon_id FROM ${s}.project_taxon_link
    UNION SELECT master_taxon_id FROM ${s}.master_field_assertion WHERE origin_kind IN ('manual','project')`,
];

export async function masterDependencyStructureEqual(previousPath, currentPath, onProgress = () => {}) {
  const db = configureTaxonomyBuildDatabase(new DatabaseSync(currentPath, { readOnly: true }));
  try {
    db.prepare("ATTACH DATABASE ? AS previous_graph").run(`${pathToFileURL(previousPath).href}?mode=ro`);
    for (let index = 0; index < projections.length; index += 1) {
      onProgress({ phase: "Abhängigkeiten vergleichen", message: "Die unveränderte Abhängigkeitsstruktur wird geprüft.",
        current: index, total: projections.length, percent: 99 });
      const projection = projections[index];
      const row = db.prepare(`WITH before_graph AS (${projection("previous_graph")}), after_graph AS (${projection("main")})
        SELECT EXISTS(SELECT * FROM before_graph EXCEPT SELECT * FROM after_graph)
          OR EXISTS(SELECT * FROM after_graph EXCEPT SELECT * FROM before_graph) AS changed`).get();
      if (row.changed) return false;
      await new Promise((resolve) => setImmediate(resolve));
    }
    return true;
  } finally { db.close(); }
}

// Only a freshly created plan from THIS build may be reused. Never infer that
// an older release's union graph describes the active master by itself.
export async function reuseMasterDependencyPlan({ descriptor, filename, previousPath, currentPath,
  previousSha256, beforeInputs, afterInputs, fingerprint, onProgress }) {
  if (descriptor?.file !== MASTER_REUSE_PLAN || descriptor.previousSha256 !== previousSha256
      || descriptor.beforeFingerprint !== beforeInputs.fingerprint || descriptor.afterFingerprint !== afterInputs.fingerprint
      || !/^[a-f0-9]{64}$/u.test(descriptor.sha256 || "")) return null;
  const source = path.join(path.dirname(filename), MASTER_REUSE_PLAN);
  let plan;
  try {
    if (await fingerprint(source) !== descriptor.sha256) return null;
    const db = configureTaxonomyBuildDatabase(new DatabaseSync(source, { readOnly: true }));
    try { plan = JSON.parse(db.prepare("SELECT document_json FROM plan_info WHERE id=1").get().document_json); }
    finally { db.close(); }
  } catch { return null; } // Missing/changed/unreadable proof requires the existing full planner.
  if (plan?.mode !== "dependency-plan" || plan.beforeFingerprint !== beforeInputs.fingerprint
      || plan.afterFingerprint !== afterInputs.fingerprint) return null;
  if (!await masterDependencyStructureEqual(previousPath, currentPath, onProgress)) return null;
  await fs.copyFile(source, filename, constants.COPYFILE_EXCL);
  if (await fingerprint(filename) !== descriptor.sha256) {
    throw new Error("Der Abhängigkeitsplan wurde während der Übernahme verändert. Ein neuer Versuch ist erforderlich.");
  }
  return { ...plan, graphReuse: "verified-prewrite-plan" };
}
