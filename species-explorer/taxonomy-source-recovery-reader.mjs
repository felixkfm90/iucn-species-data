import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { sha256File } from "./lightroom-search-storage.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { lightroomSearchDatabasePath } from "./lightroom-search-storage.mjs";
import { readTaxonomyPublication, taxonomyPublicationPath } from "./taxonomy-publication-storage.mjs";
import { providerSliceDataPath, providerSliceManifestPath, latestProviderSliceVersion } from "./taxonomy-master-slices.mjs";
import { taxonomyCorrectionActivePointerPath, taxonomyCorrectionReleasePath } from "./taxonomy-correction-release.mjs";
import { readIdentityRegistry, identityRegistryRevision } from "./taxonomy-identity-registry.mjs";
import { planSourceRecovery } from "./taxonomy-source-recovery-plan.mjs";
import { taxonomyActivePointerPath } from "./taxonomy-storage.mjs";
import { normalizeTaxonomySearchTerm } from "./taxonomy-search-text.mjs";
import { readMasterSourceBinding } from "./taxonomy-master-source-binding.mjs";
import { masterBuildRulesRevision } from "./taxonomy-master-inputs.mjs";

export async function assertRecoveryPath(filename) {
  let current = path.resolve(filename);
  for (;;) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Reparatur verweigert verknüpfte Dateien oder Verzeichnisse."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (path.dirname(current) === current) return;
    current = path.dirname(current);
  }
}
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
async function optionalHash(file, signal) {
  signal?.throwIfAborted();
  await assertRecoveryPath(file);
  try { return await sha256File(file, { signal }); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export function checkedRecoveryOptions(options) {
  const result = Object.fromEntries(["taxonomyRoot", "searchRoot", "speciesListPath", "correctionsPath", "previousVersion", "currentVersion"].map((key) => [key, options[key]]));
  for (const field of ["taxonomyRoot", "searchRoot", "speciesListPath", "correctionsPath"]) {
    if (typeof result[field] !== "string" || !path.isAbsolute(result[field])) throw new Error("Reparatur benötigt explizite absolute Daten- und Projektpfade.");
    result[field] = path.resolve(result[field]);
  }
  for (const field of ["previousVersion", "currentVersion"]) {
    if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(result[field] || "")) throw new Error("Ungültiger Quellenstand für die Reparatur.");
  }
  if (result.previousVersion === result.currentVersion) throw new Error("Vorheriger und aktueller Quellenstand müssen verschieden sein.");
  return result;
}

// Full file binding is intentionally explicit, never run while merely opening a dialog.
export async function sourceRecoveryBinding(options, { signal, allowedProviderVersion } = {}) {
  signal?.throwIfAborted();
  const o = checkedRecoveryOptions(options);
  await assertRecoveryPath(taxonomyPublicationPath(o.taxonomyRoot));
  const pointer = readTaxonomyPublication(o.taxonomyRoot);
  if (!pointer?.previous || path.resolve(pointer.taxonomyRoot) !== o.taxonomyRoot
      || path.resolve(pointer.searchRoot) !== o.searchRoot) throw new Error("Reparatur benötigt ein eindeutig zusammengehöriges aktives Paar und Vorgängerpaar.");
  const latest = await latestProviderSliceVersion(o.taxonomyRoot, "inaturalist");
  if (latest !== o.currentVersion && latest !== allowedProviderVersion) {
    throw new Error("Der angegebene Quellenstand ist nicht mehr der aktuelle Anbieterstand.");
  }
  const files = [taxonomyPublicationPath(o.taxonomyRoot), o.speciesListPath, o.correctionsPath,
    taxonomyCorrectionActivePointerPath(o.taxonomyRoot), taxonomyActivePointerPath(o.taxonomyRoot),
    path.join(o.taxonomyRoot, "master/identity-review.json"), path.join(o.taxonomyRoot, "master/build-jobs/current.json"),
    taxonomyMasterManifestPath(o.taxonomyRoot, "staging")];
  const pairs = ["previous", "active"].map((slot) => ({ slot,
    master: taxonomyMasterDatabasePath(o.taxonomyRoot, slot), search: lightroomSearchDatabasePath(o.searchRoot, slot) }));
  for (const pair of pairs) files.push(pair.master, pair.search, path.join(path.dirname(pair.master), "manifest.json"), path.join(path.dirname(pair.search), "manifest.json"));
  for (const version of [o.previousVersion, o.currentVersion]) files.push(providerSliceDataPath(o.taxonomyRoot, "inaturalist", version), providerSliceManifestPath(o.taxonomyRoot, "inaturalist", version));
  await assertRecoveryPath(taxonomyCorrectionActivePointerPath(o.taxonomyRoot));
  const separate = await json(taxonomyCorrectionActivePointerPath(o.taxonomyRoot)).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  const correctionFiles = [];
  for (const entry of [pointer.previous.correctionPointer, pointer.active.correctionPointer, separate].filter(Boolean)) {
    const file = taxonomyCorrectionReleasePath(o.taxonomyRoot, entry.activeRelease);
    files.push(file); correctionFiles.push(file);
  }
  const selection = await readMasterSourceBinding(o.taxonomyRoot, { speciesListPath: o.speciesListPath, correctionsPath: o.correctionsPath });
  for (const [file] of selection.files) files.push(file);
  for (const module of ["taxonomy-source-recovery-conflicts.mjs", "taxonomy-source-recovery-scope.mjs", "taxonomy-source-recovery-replacement.mjs", "taxonomy-source-recovery-reader.mjs", "taxonomy-source-recovery-plan.mjs", "taxonomy-source-recovery.mjs", "taxonomy-source-recovery-identities.mjs", "taxonomy-source-recovery-candidate.mjs", "taxonomy-partial-record.mjs", "taxonomy-master-slices.mjs", "taxonomy-master-model.mjs"]) {
    files.push(fileURLToPath(new URL(module, import.meta.url)));
  }
  const binding = { options: o, publication: pointer, rulesRevision: await masterBuildRulesRevision(),
    sourceSelection: { reference: selection.reference, versions: selection.versions, retainedRevision: selection.retainedRevision }, files: [] };
  for (const file of [...new Set(files)].sort()) binding.files.push([file, await optionalHash(file, signal)]);
  const hashes = new Map(binding.files);
  if (correctionFiles.some((file) => !hashes.get(file))) throw new Error("Ein referenzierter Namenskorrekturstand fehlt; Reparatur gesperrt.");
  for (const pair of pairs) {
    const master = await json(path.join(path.dirname(pair.master), "manifest.json"));
    const search = await json(path.join(path.dirname(pair.search), "manifest.json"));
    const entry = pointer[pair.slot];
    if (`sha256:${hashes.get(pair.master)}` !== entry.masterChecksum || `sha256:${hashes.get(pair.search)}` !== entry.packageChecksum
        || master.candidateId !== entry.masterVersion || search.packageId !== entry.packageId || search.masterVersion !== entry.masterVersion) {
      throw new Error("Paar-Dateien, Herkunft oder Prüfsummen widersprechen dem Veröffentlichungszeiger.");
    }
  }
  if (!hashes.get(o.speciesListPath) || !hashes.get(o.correctionsPath)) throw new Error("Projekt-/Korrekturdateien fehlen.");
  return binding;
}

function missingTaxa(options) {
  const open = (slot) => { const db = new DatabaseSync(taxonomyMasterDatabasePath(options.taxonomyRoot, slot), { readOnly: true }); db.exec("PRAGMA query_only=ON"); return db; };
  let previous, current;
  try {
    previous = open("previous"); current = open("active");
    if (identityRegistryRevision(readIdentityRegistry(previous)) !== identityRegistryRevision(readIdentityRegistry(current))) {
      throw new Error("Zwischen den Ständen liegen Identitätsentscheidungen; keine pauschale technische Reparatur zulässig.");
    }
    const currentIds = new Set(current.prepare("SELECT master_taxon_id FROM master_taxon").all().map((row) => row.master_taxon_id));
    const source = previous.prepare(`SELECT a.provider_record_id FROM provider_taxon_assertion a JOIN provider_release r USING(release_id)
      WHERE a.master_taxon_id=? AND r.provider='inaturalist' AND r.provider_version=? AND a.version_change_state!='removed'`);
    const owners = current.prepare(`SELECT DISTINCT m.master_taxon_id AS masterTaxonId, m.canonical_scientific_name AS scientificName,
      m.rank, m.kingdom, m.lifecycle_state AS lifecycleState FROM provider_taxon_assertion a
      JOIN provider_release r USING(release_id) JOIN master_taxon m USING(master_taxon_id)
      WHERE r.provider='inaturalist' AND a.provider_record_id=? AND a.version_change_state!='removed'`);
    const count = (table, id, extra = "") => current.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE master_taxon_id=? ${extra}`).get(id).n;
    const registryText = JSON.stringify(readIdentityRegistry(current));
    return previous.prepare(`SELECT master_taxon_id AS masterTaxonId, canonical_scientific_name AS scientificName,
      rank, kingdom, lifecycle_state AS lifecycleState FROM master_taxon`).all().filter((row) => !currentIds.has(row.masterTaxonId)).map((row) => {
      const evidence = source.all(row.masterTaxonId, options.previousVersion);
      if (evidence.length !== 1) throw new Error("Fehlende Alt-ID besitzt keinen eindeutigen iNaturalist-Beleg; Reparatur gesperrt.");
      const oldProtected = previous.prepare(`SELECT
        (SELECT COUNT(*) FROM project_taxon_link WHERE master_taxon_id=?) +
        (SELECT COUNT(*) FROM master_decision WHERE master_taxon_id=?) +
        (SELECT COUNT(*) FROM master_field_assertion WHERE master_taxon_id=? AND origin_kind='manual') AS n`)
        .get(row.masterTaxonId, row.masterTaxonId, row.masterTaxonId).n;
      return { ...row, protectedHistory: oldProtected || registryText.includes(row.masterTaxonId), providerRecordId: evidence[0].provider_record_id,
        currentOwners: owners.all(evidence[0].provider_record_id).map((owner) => ({ ...owner,
          projects: count("project_taxon_link", owner.masterTaxonId),
          manualDecisions: count("master_decision", owner.masterTaxonId) + count("master_field_assertion", owner.masterTaxonId, "AND origin_kind='manual'"),
          foreignEvidence: current.prepare(`SELECT COUNT(*) AS n FROM provider_taxon_assertion a JOIN provider_release r USING(release_id)
            WHERE a.master_taxon_id=? AND r.provider!='inaturalist'`).get(owner.masterTaxonId).n,
          identityEvent: registryText.includes(owner.masterTaxonId) })) };
    });
  } finally { current?.close(); previous?.close(); }
}

async function readRawSlice(options, version, binding) {
  const manifestFile = providerSliceManifestPath(options.taxonomyRoot, "inaturalist", version);
  const file = providerSliceDataPath(options.taxonomyRoot, "inaturalist", version);
  const manifest = await json(manifestFile), records = JSON.parse(await fs.readFile(file, "utf8"));
  if (manifest.schemaVersion !== 2 || manifest.provider !== "inaturalist" || manifest.providerVersion !== version
      || !Array.isArray(records) || records.length !== manifest.recordCount
      || manifest.checksumSha256 !== new Map(binding.files).get(file)) throw new Error("Anbieterstand ist unvollständig oder gehört nicht zur Vorschau.");
  return { manifest, records };
}

export async function inspectSourceRecovery(options, { signal } = {}) {
  const binding = await sourceRecoveryBinding(options, { signal }), o = binding.options;
  signal?.throwIfAborted();
  const affected = missingTaxa(o);
  const previous = await readRawSlice(o, o.previousVersion, binding), current = await readRawSlice(o, o.currentVersion, binding);
  signal?.throwIfAborted();
  if (!Number.isFinite(Date.parse(previous.manifest.retrievedAt)) || !Number.isFinite(Date.parse(current.manifest.retrievedAt))
      || Date.parse(previous.manifest.retrievedAt) >= Date.parse(current.manifest.retrievedAt)) throw new Error("Reparatur benötigt einen zeitlich älteren, belegten Quellenstand.");
  const plan = planSourceRecovery({ affected, previous, current, binding });
  // Separate live name releases are not baked into master_field_assertion yet.
  // Refuse a recovery case carrying such a preference, rather than discarding it.
  const preferences = [await json(o.correctionsPath)];
  for (const [file, hash] of binding.files) {
    if (hash && path.dirname(file) === path.join(path.dirname(o.taxonomyRoot), "corrections/releases")) preferences.push(await json(file));
  }
  const ids = new Set(plan.rows.flatMap((row) => [row.originalId, row.replacementId].filter(Boolean)));
  if (preferences.some((document) => !Array.isArray(document?.entries))) throw new Error("Namenskorrekturstand ist unvollständig; Reparatur gesperrt.");
  const names = new Set(plan.rows.map((row) => normalizeTaxonomySearchTerm(row.scientificName)));
  if (preferences.some((document) => document.entries.some((entry) => ids.has(entry?.masterTaxonId) || ids.has(entry?.identityBinding)
      || names.has(normalizeTaxonomySearchTerm(String(entry?.scientificName || "")))))) {
    throw new Error("Ein Reparaturfall besitzt eine eigene Namensentscheidung außerhalb des Masters; gesondert prüfen.");
  }
  // Catch concurrent searches, publication, preferences and same-version edits.
  if (JSON.stringify(await sourceRecoveryBinding(o, { signal })) !== JSON.stringify(binding)) throw new Error("Datenstand während der Vorschau verändert. Bitte erneut prüfen.");
  return { plan, current };
}
