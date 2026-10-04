import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { masterJobsDirectory, masterJobDirectory, readMasterJobRecords } from "./taxonomy-master-job.mjs";
import { assertRecoveryPath } from "./taxonomy-source-recovery-reader.mjs";
import { sha256File } from "./lightroom-search-storage.mjs";
import { canonicalBuildInput, taxonomyRecordFingerprint } from "./taxonomy-build-inputs.mjs";
import { taxonomyMasterCandidateInternals } from "./taxonomy-master-candidate.mjs";
import { relocatedStoragePath } from "./storage-paths.mjs";

const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Use the exact, hashed input of the active build, not a fresh name lookup for
// unrelated taxa. An old recipe is evidence here, never resume authorization.
export async function frozenRecoveryColInput(root, referenceVersion) {
  const manifest = await json(taxonomyMasterManifestPath(root));
  if (!manifest.buildJobRevision) throw new Error("Gebundener CoL-Ausgangseingang fehlt; keine erweiterte Reparatur zulässig.");
  const matches = [];
  for (const entry of await fs.readdir(masterJobsDirectory(root), { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^job-[a-f0-9-]{36}$/.test(entry.name)) continue;
    const file = path.join(masterJobDirectory(root, entry.name), "recipe.json");
    await assertRecoveryPath(file);
    const recipe = await json(file).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (recipe?.revision === manifest.buildJobRevision) matches.push({ recipe, file, id: entry.name });
  }
  if (matches.length !== 1) throw new Error("CoL-Ausgangsauftrag ist nicht eindeutig vorhanden.");
  const { recipe, file, id } = matches[0];
  const recordsFile = path.join(masterJobDirectory(root, id), "col.jsonl");
  await assertRecoveryPath(recordsFile);
  const hash = await sha256File(recordsFile);
  if (recipe.schemaVersion !== 1 || recipe.id !== id || path.resolve(relocatedStoragePath(recipe.taxonomyRoot)) !== path.resolve(root)
      || recipe.revision !== digest({ ...recipe, revision: undefined }) || recipe.inputs?.["col.jsonl"] !== hash
      || recipe.options?.colRelease?.providerVersion !== referenceVersion) throw new Error("CoL-Ausgangseingang oder Referenzherkunft ist verändert.");
  if (!manifest.buildInputs?.available || await sha256File(taxonomyMasterDatabasePath(root)) !== manifest.buildInputs.masterSha256) {
    throw new Error("Aktiver Master ist nicht mehr an seinen geprüften Ausgangseingang gebunden.");
  }
  return { files: [file, recordsFile], records: () => readMasterJobRecords(recordsFile) };
}

export async function* scopedRecoveryColRecords({ frozen, repairRecords, plan }) {
  const seen = new Map();
  const normalize = taxonomyMasterCandidateInternals.normalizeColRecord;
  for await (const row of frozen) {
    const normalized = normalize(row), id = normalized.providerRecordId;
    seen.set(id, taxonomyRecordFingerprint(normalized));
    yield row;
  }
  const identities = new Set(plan.rows.map((row) => canonicalBuildInput([
    row.scientificName.trim().toLocaleLowerCase("en"), row.rank, row.kingdom,
  ])));
  for await (const row of repairRecords) {
    const normalized = normalize(row);
    if (!identities.has(canonicalBuildInput([normalized.scientificName.trim().toLocaleLowerCase("en"),
      normalized.rank, normalized.kingdom]))) throw new Error("Neuer CoL-Beleg liegt außerhalb der bestätigten Reparaturidentität.");
    const hash = taxonomyRecordFingerprint(normalized);
    if (seen.has(normalized.providerRecordId) && seen.get(normalized.providerRecordId) !== hash) throw new Error("Gebundene CoL-Anbieter-ID würde einen bestehenden Beleg verändern.");
    if (!seen.has(normalized.providerRecordId)) { seen.set(normalized.providerRecordId, hash); yield row; }
  }
}

const PROJECTIONS = [
  ["IDs", `SELECT m.master_taxon_id, m.canonical_scientific_name, m.rank, m.kingdom, m.lifecycle_state, m.reference_state FROM master_taxon m`],
  ["Status", `SELECT m.master_taxon_id, m.status_name, m.status_detail FROM master_taxon_status m`],
  ["Quellbelege", `SELECT m.master_taxon_id, r.provider, m.provider_record_id, m.parent_provider_record_id,
    m.accepted_provider_record_id, m.scientific_name, m.rank, m.taxonomic_status, m.kingdom, m.match_state, m.hierarchy_json,
    CASE WHEN m.version_change_state='removed' THEN 1 ELSE 0 END AS source_removed
    FROM provider_taxon_assertion m JOIN provider_release r USING(release_id)`],
  ["Quellnamen", `SELECT m.master_taxon_id, r.provider, m.provider_record_id, n.name, n.normalized_name,
    n.language, n.name_kind, n.preferred, n.verified FROM provider_taxon_assertion m
    JOIN provider_release r USING(release_id) JOIN provider_name_assertion n ON n.provider_taxon_assertion_id=m.assertion_id`],
  ["Aufnahmegrundlage", `SELECT m.master_taxon_id, r.provider, m.provider_record_id, s.relevance_reason
    FROM provider_taxon_assertion m JOIN provider_release r USING(release_id)
    JOIN provider_slice_membership s ON s.provider_taxon_assertion_id=m.assertion_id`],
  ["Feldwerte", `SELECT m.master_taxon_id, m.field_name, m.field_value, m.normalized_value, m.language,
    m.origin_kind, m.confidence, m.review_state, m.selected, r.provider, a.provider_record_id
    FROM master_field_assertion m JOIN provider_release r USING(release_id)
    LEFT JOIN provider_taxon_assertion a ON a.assertion_id=m.provider_taxon_assertion_id`],
  ["Aliasse", `SELECT m.master_taxon_id, m.name, m.normalized_name, m.rank, m.kingdom, m.alias_type,
    r.provider, a.provider_record_id FROM master_taxon_alias m
    LEFT JOIN provider_taxon_assertion a ON a.assertion_id=m.source_assertion_id LEFT JOIN provider_release r USING(release_id)`],
  ["Konflikte", `SELECT m.master_taxon_id, m.field_name, m.conflict_type, m.conflict_state, m.resolution_note FROM master_conflict m`],
  ["Eigene Entscheidungen", `SELECT m.master_taxon_id, m.field_name, m.language, m.decision_type, m.note,
    f.field_name AS selected_field, f.field_value AS selected_value, f.language AS selected_language,
    c.conflict_type, c.field_name AS conflict_field FROM master_decision m
    LEFT JOIN master_field_assertion f ON f.assertion_id=m.selected_assertion_id
    LEFT JOIN master_conflict c ON c.conflict_id=m.conflict_id`],
  ["Projektverknüpfungen", `SELECT m.master_taxon_id, m.project_taxon_key, m.project_slug, m.scientific_name_at_link, m.link_state FROM project_taxon_link m`],
  ["Suchbegriffe", `SELECT m.master_taxon_id, m.term, m.normalized_term, m.folded_term, m.german_key,
    m.term_kind, m.language, m.source_provider, m.weight FROM master_search_term m`],
];

// Bounded streaming digest; no candidate edits, no ID/name-based migration.
// Observation times and release IDs may change; semantic evidence may not.
export function assertRecoveryCandidateScope(root, plan, { candidatePath = taxonomyMasterDatabasePath(root, "staging") } = {}) {
  if (!Array.isArray(plan?.rows) || !plan.rows.length || plan.rows.length > 2000
      || plan.rows.some((row) => !/^mtx_[a-f0-9]{32}$/.test(row?.originalId || "")
        || row.replacementId !== null && row.replacementId !== undefined && !/^mtx_[a-f0-9]{32}$/.test(row.replacementId))
      || new Set(plan.rows.map((row) => row.originalId)).size !== plan.rows.length) throw new Error("Ungültiger enger Reparaturumfang.");
  const excluded = [...new Set(plan.rows.flatMap((row) => [row.originalId, row.replacementId].filter(Boolean)))];
  if (!excluded.length || excluded.length > 4000 || excluded.length !== plan.rows.reduce((count, row) => count + (row.replacementId ? 2 : 1), 0)) throw new Error("Ungültiger enger Reparaturumfang.");
  let before, after;
  try {
    before = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
    after = new DatabaseSync(candidatePath, { readOnly: true });
    const lookup = after.prepare("SELECT lifecycle_state FROM master_taxon WHERE master_taxon_id=?");
    for (const row of plan.rows) {
      if (lookup.get(row.originalId)?.lifecycle_state !== "active"
          || row.replacementId && lookup.get(row.replacementId)?.lifecycle_state !== "deprecated") {
        throw new Error("Bestätigte Reparatur-ID fehlt oder hat einen falschen Lebenszyklus im Kandidaten.");
      }
    }
    const filter = ` WHERE (m.master_taxon_id IS NULL OR m.master_taxon_id NOT IN (${excluded.map(() => "?").join(",")}))`;
    const fingerprint = (db, sql) => {
      const hash = crypto.createHash("sha256"); let count = 0;
      const columns = db.prepare(sql + " LIMIT 0").columns().length;
      for (const row of db.prepare(sql + filter + ` ORDER BY ${Array.from({ length: columns }, (_, i) => i + 1).join(",")}`).iterate(...excluded)) {
        hash.update(canonicalBuildInput({ ...row, ...(row.hierarchy_json !== undefined ? { hierarchy_json: JSON.parse(row.hierarchy_json) } : {}) }) + "\n"); count += 1;
      }
      return `${count}:${hash.digest("hex")}`;
    };
    for (const [label, sql] of PROJECTIONS) {
      if (fingerprint(before, sql) !== fingerprint(after, sql)) throw new Error(`Reparaturumfang überschritten: ${label} außerhalb der bestätigten Fälle verändert.`);
    }
  } finally { before?.close(); after?.close(); }
}
